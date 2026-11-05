import { BrowserWindow, ipcMain, screen } from 'electron';
import { join } from 'path';
import { IPC } from './shared-with-frontend/ipc-events.const';
import { assertSecureWebPreferences } from './web-preferences-guard';

let popup: BrowserWindow | null = null;

/** Uses the running app's store; the capture window never opens its own database. */
export const initQuickAddTask = (getMainWindow: () => BrowserWindow): void => {
  let pending: { id: number; resolve: (success: boolean) => void } | undefined;
  let nextId = 0;

  ipcMain.on(IPC.OPEN_QUICK_ADD_TASK, (event, labels: unknown) => {
    if (event.sender !== getMainWindow().webContents) return;
    if (popup && !popup.isDestroyed()) {
      popup.show();
      popup.focus();
      return;
    }
    if (
      !labels ||
      typeof labels !== 'object' ||
      !('placeholder' in labels) ||
      typeof labels.placeholder !== 'string' ||
      !('error' in labels) ||
      typeof labels.error !== 'string'
    )
      return;

    const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    const width = Math.min(760, area.width);
    const webPreferences = {
      preload: join(__dirname, 'quick-add-task-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      sandbox: true,
    };
    assertSecureWebPreferences(webPreferences, 'quick-add-task');
    const win = new BrowserWindow({
      width,
      height: 160,
      x: area.x + Math.round((area.width - width) / 2),
      y: area.y + Math.round(area.height / 4),
      frame: false,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      show: false,
      webPreferences,
    });
    popup = win;
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (navigation) => navigation.preventDefault());
    win.once('ready-to-show', () => {
      win.webContents.send(IPC.OPEN_QUICK_ADD_TASK, labels);
      win.show();
      win.focus();
    });
    win.on('closed', () => {
      popup = null;
      pending?.resolve(false);
      pending = undefined;
    });
    void win.loadFile(join(__dirname, 'quick-add-task.html'));
  });

  ipcMain.handle(IPC.QUICK_ADD_TASK_SUBMIT, (event, title: unknown) => {
    if (
      event.sender !== popup?.webContents ||
      pending ||
      typeof title !== 'string' ||
      !title.trim()
    )
      return false;
    return new Promise<boolean>((resolve) => {
      const id = ++nextId;
      pending = { id, resolve };
      getMainWindow().webContents.send(IPC.QUICK_ADD_TASK_SUBMIT, {
        id,
        title: title.trim(),
      });
    });
  });
  ipcMain.on(IPC.QUICK_ADD_TASK_RESULT, (event, id: unknown, success: unknown) => {
    if (event.sender !== getMainWindow().webContents || id !== pending?.id) return;
    pending?.resolve(success === true);
    pending = undefined;
  });
  ipcMain.on(IPC.QUICK_ADD_TASK_CLOSE, (event) => {
    if (event.sender === popup?.webContents && !pending) popup.close();
  });
};
