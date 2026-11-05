import { DOCUMENT } from '@angular/common';
import {
  ApplicationRef,
  createEnvironmentInjector,
  DestroyRef,
  EnvironmentInjector,
  inject,
  Injectable,
} from '@angular/core';
import { ComponentPortal, DomPortalOutlet } from '@angular/cdk/portal';
import { QuickAddTaskComponent } from './quick-add-task.component';
import { quickAddTaskProviders } from './quick-add-task.providers';

@Injectable({ providedIn: 'root' })
export class QuickAddTaskService {
  private readonly _document = inject(DOCUMENT);
  private readonly _app = inject(ApplicationRef);
  private readonly _environment = inject(EnvironmentInjector);
  private readonly _destroyRef = inject(DestroyRef);
  private _popup?: Window;
  private _isOpening = false;
  private _cleanup?: () => void;

  constructor() {
    this._destroyRef.onDestroy(() => {
      this._popup?.close();
      this._cleanup?.();
    });
  }

  async open(): Promise<void> {
    if (this._popup && !this._popup.closed) {
      this._popup.focus();
      return;
    }
    if (this._isOpening) return;
    this._isOpening = true;
    try {
      if (!(await window.ea.openQuickAddTask())) return;
      const popup = window.open('about:blank', 'super-productivity-quick-add');
      if (!popup) return;
      this._popup = popup;
      try {
        this._render(popup);
      } catch (error) {
        popup.close();
        this._cleanup?.();
        this._popup = undefined;
        throw error;
      }
    } finally {
      this._isOpening = false;
    }
  }

  private _render(popup: Window): void {
    // Native document boundary: the CDK portal keeps Angular bindings and the
    // parent's store, while styles and document-bound overlays live in the child.
    const doc = popup.document;
    const base = doc.createElement('base');
    base.href = this._document.baseURI;
    doc.head.appendChild(base);
    doc.title = 'Super Productivity';
    const copied = new Map<Element, Node>();
    const sourceMarkup = new Map<Element, string>();
    const syncStyles = (): void => {
      for (const [source, copy] of copied) {
        if (!source.isConnected) {
          copy.parentNode?.removeChild(copy);
          copied.delete(source);
          sourceMarkup.delete(source);
        }
      }
      this._document.head
        .querySelectorAll('style, link[rel="stylesheet"]')
        .forEach((source) => {
          if (sourceMarkup.get(source) === source.outerHTML) return;
          const old = copied.get(source);
          const copy = source.cloneNode(true);
          if (old) old.parentNode?.replaceChild(copy, old);
          else doc.head.appendChild(copy);
          copied.set(source, copy);
          sourceMarkup.set(source, source.outerHTML);
        });
      for (const [source, target] of [
        [this._document.documentElement, doc.documentElement],
        [this._document.body, doc.body],
      ]) {
        target.className = source.className;
        target.style.cssText = source.style.cssText;
        target.dir = source.dir;
        target.lang = source.lang;
      }
      doc.documentElement.classList.add('quick-add-window');
      doc.body.classList.add('quick-add-window');
    };
    syncStyles();
    const environment = createEnvironmentInjector(
      quickAddTaskProviders(doc),
      this._environment,
    );
    const outlet = new DomPortalOutlet(doc.body, this._app, environment);
    const observers: {
      styles?: MutationObserver;
      overlays?: MutationObserver;
      size?: ResizeObserver;
    } = {};
    this._cleanup = () => {
      observers.styles?.disconnect();
      observers.overlays?.disconnect();
      observers.size?.disconnect();
      // Disposing the portal must not remove the child document's body itself.
      outlet.detach();
      environment.destroy();
      this._popup = undefined;
      this._cleanup = undefined;
    };
    popup.addEventListener('unload', () => this._cleanup?.(), { once: true });
    const component = outlet.attach(
      new ComponentPortal(QuickAddTaskComponent, null, environment),
    );
    let previousHeight = 0;
    const resize = (): void => {
      const hasOverlay = !!doc.querySelector(
        '.mat-mdc-menu-panel, mat-dialog-container, .mat-mdc-autocomplete-panel:not(.mat-mdc-autocomplete-hidden)',
      );
      const height = hasOverlay
        ? 620
        : component.location.nativeElement.getBoundingClientRect().height;
      if (height !== previousHeight) {
        previousHeight = height;
        window.ea.resizeQuickAddTask(height);
      }
    };
    const styles = new MutationObserver(syncStyles);
    observers.styles = styles;
    styles.observe(this._document.head, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
    });
    styles.observe(this._document.documentElement, { attributes: true });
    styles.observe(this._document.body, { attributes: true });
    const overlays = new MutationObserver(resize);
    observers.overlays = overlays;
    overlays.observe(doc.body, { childList: true, subtree: true, attributes: true });
    const size = new ResizeObserver(resize);
    observers.size = size;
    size.observe(component.location.nativeElement);
    component.instance.closed.subscribe(() => popup.close());
    component.changeDetectorRef.detectChanges();
    syncStyles();
    resize();
    component.instance.bar().focusInput();
  }
}
