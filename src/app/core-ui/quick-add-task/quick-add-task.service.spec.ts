import { TestBed } from '@angular/core/testing';
import { QuickAddTaskService } from './quick-add-task.service';

describe('QuickAddTaskService', () => {
  let service: QuickAddTaskService;
  let previousBridge: typeof window.ea;
  let prepare: jasmine.Spy;
  let open: jasmine.Spy;
  let render: jasmine.Spy;
  let popup: Window;

  beforeEach(() => {
    previousBridge = window.ea;
    prepare = jasmine.createSpy('openQuickAddTask').and.resolveTo(true);
    window.ea = { ...previousBridge, openQuickAddTask: prepare };
    popup = {
      closed: false,
      focus: jasmine.createSpy('focus'),
      close: jasmine.createSpy('close'),
    } as unknown as Window;
    open = spyOn(window, 'open').and.returnValue(popup);
    service = TestBed.inject(QuickAddTaskService);
    render = spyOn(service as unknown as { _render(p: Window): void }, '_render');
  });

  afterEach(() => {
    window.ea = previousBridge;
  });

  it('preserves the existing popup and its draft on repeated requests', async () => {
    await service.open();
    await service.open();
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledOnceWith('about:blank', 'super-productivity-quick-add');
    expect(render).toHaveBeenCalledOnceWith(popup);
    expect(popup.focus).toHaveBeenCalledTimes(1);
  });

  it('coalesces overlapping requests while native authorization is pending', async () => {
    let authorize!: (allowed: boolean) => void;
    prepare.and.returnValue(
      new Promise<boolean>((resolve) => {
        authorize = resolve;
      }),
    );
    const first = service.open();
    await service.open();
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(open).not.toHaveBeenCalled();
    authorize(true);
    await first;
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('does not open a surface if the native process rejected authorization', async () => {
    prepare.and.resolveTo(false);
    await service.open();
    expect(open).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
  });

  it('closes a failed render and permits another attempt', async () => {
    render.and.throwError('render failed');
    await expectAsync(service.open()).toBeRejectedWithError('render failed');
    expect(popup.close).toHaveBeenCalledTimes(1);
    render.and.stub();
    await service.open();
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(render).toHaveBeenCalledTimes(2);
  });
});
