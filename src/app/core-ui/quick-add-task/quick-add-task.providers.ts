import { DOCUMENT } from '@angular/common';
import { inject, Injector, Provider, Renderer2, RendererFactory2 } from '@angular/core';
import { FocusMonitor, FocusTrapFactory, InteractivityChecker } from '@angular/cdk/a11y';
import { Dialog, DIALOG_SCROLL_STRATEGY } from '@angular/cdk/dialog';
import {
  createBlockScrollStrategy,
  createRepositionScrollStrategy,
  Overlay,
  OverlayContainer,
  OverlayKeyboardDispatcher,
  OverlayOutsideClickDispatcher,
  OverlayPositionBuilder,
  ScrollStrategyOptions,
} from '@angular/cdk/overlay';
import { ScrollDispatcher, ViewportRuler } from '@angular/cdk/scrolling';
import { MAT_AUTOCOMPLETE_SCROLL_STRATEGY } from '@angular/material/autocomplete';
import { MAT_DIALOG_SCROLL_STRATEGY, MatDialog } from '@angular/material/dialog';
import { MAT_MENU_SCROLL_STRATEGY } from '@angular/material/menu';
import { MAT_TOOLTIP_SCROLL_STRATEGY } from '@angular/material/tooltip';

const repositionFactory = (): ReturnType<typeof strategyFactory> =>
  strategyFactory(createRepositionScrollStrategy);
const blockFactory = (): ReturnType<typeof strategyFactory> =>
  strategyFactory(createBlockScrollStrategy);
const strategyFactory = (
  create: typeof createBlockScrollStrategy | typeof createRepositionScrollStrategy,
): (() => ReturnType<typeof create>) => {
  const injector = inject(Injector);
  return () => create(injector);
};

/** All document-bound UI belongs to the popup; application services stay shared. */
export const quickAddTaskProviders = (document: Document): Provider[] => [
  { provide: DOCUMENT, useValue: document },
  {
    provide: RendererFactory2,
    useFactory: () => {
      const parent = inject(RendererFactory2, { skipSelf: true });
      const factory = Object.create(parent) as RendererFactory2;
      factory.createRenderer = (
        ...args: Parameters<RendererFactory2['createRenderer']>
      ) => {
        const renderer = parent.createRenderer(...args);
        const scoped = Object.create(renderer) as Renderer2;
        // Material also registers named global listeners through the renderer.
        // DOCUMENT alone does not redirect its Escape/outside-click handlers.
        scoped.listen = (target, name, listener, options) =>
          renderer.listen(
            target === 'window'
              ? document.defaultView!
              : target === 'document'
                ? document
                : target === 'body'
                  ? document.body
                  : target,
            name,
            listener,
            options,
          );
        return scoped;
      };
      return factory;
    },
  },
  Overlay,
  OverlayContainer,
  OverlayKeyboardDispatcher,
  OverlayOutsideClickDispatcher,
  OverlayPositionBuilder,
  ScrollStrategyOptions,
  ScrollDispatcher,
  ViewportRuler,
  FocusMonitor,
  FocusTrapFactory,
  InteractivityChecker,
  Dialog,
  MatDialog,
  ...[
    MAT_AUTOCOMPLETE_SCROLL_STRATEGY,
    MAT_MENU_SCROLL_STRATEGY,
    MAT_TOOLTIP_SCROLL_STRATEGY,
  ].map((provide) => ({ provide, useFactory: repositionFactory })),
  ...[MAT_DIALOG_SCROLL_STRATEGY, DIALOG_SCROLL_STRATEGY].map((provide) => ({
    provide,
    useFactory: blockFactory,
  })),
];
