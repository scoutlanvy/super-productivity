import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  output,
  viewChild,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { filter, first } from 'rxjs/operators';
import { AddTaskBarComponent } from '../../features/tasks/add-task-bar/add-task-bar.component';

@Component({
  selector: 'quick-add-task',
  standalone: true,
  imports: [AddTaskBarComponent],
  template: `
    <add-task-bar
      [isGlobalBarVariant]="true"
      (closed)="closed.emit()"
      (done)="closed.emit()"
      (afterTaskAdd)="onTaskAdded()"
    />
  `,
  styles: `
    :host {
      display: block;
      padding: var(--s);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuickAddTaskComponent {
  private readonly _dialog = inject(MatDialog);
  private readonly _document = inject(DOCUMENT);
  private readonly _destroyRef = inject(DestroyRef);
  readonly bar = viewChild.required(AddTaskBarComponent);
  readonly closed = output<void>();

  onTaskAdded(): void {
    // The custom repeat editor loads asynchronously after creating the task.
    // Keep this window alive until that editor has finished.
    if (this.bar().stateService.state().repeat?.type === 'DIALOG') {
      this._dialog.afterOpened
        .pipe(
          filter(
            (dialog) =>
              dialog.componentRef?.location.nativeElement.ownerDocument ===
              this._document,
          ),
          first(),
          takeUntilDestroyed(this._destroyRef),
        )
        .subscribe((dialog) => {
          dialog
            .afterClosed()
            .pipe(first(), takeUntilDestroyed(this._destroyRef))
            .subscribe(() => this.closed.emit());
        });
    } else {
      this.closed.emit();
    }
  }
}
