import {
  createEnvironmentInjector,
  EnvironmentInjector,
  RendererFactory2,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { OverlayContainer } from '@angular/cdk/overlay';
import { quickAddTaskProviders } from './quick-add-task.providers';

describe('quick-add document boundary', () => {
  it('keeps overlays and named global event handlers in the child document', () => {
    const frame = document.createElement('iframe');
    document.body.appendChild(frame);
    const child = frame.contentDocument!;
    const environment = createEnvironmentInjector(
      quickAddTaskProviders(child),
      TestBed.inject(EnvironmentInjector),
    );
    let stop: (() => void) | undefined;
    try {
      const rootOverlay = TestBed.inject(OverlayContainer).getContainerElement();
      const childOverlay = environment.get(OverlayContainer).getContainerElement();
      expect(childOverlay.ownerDocument).toBe(child);
      expect(rootOverlay.ownerDocument).toBe(document);
      const renderer = environment.get(RendererFactory2).createRenderer(null, null);
      const keydown = jasmine.createSpy('keydown');
      stop = renderer.listen('body', 'keydown', keydown);
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(keydown).not.toHaveBeenCalled();
      child.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(keydown).toHaveBeenCalledTimes(1);
      stop();
      child.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(keydown).toHaveBeenCalledTimes(1);
    } finally {
      stop?.();
      environment.destroy();
      frame.remove();
    }
  });
});
