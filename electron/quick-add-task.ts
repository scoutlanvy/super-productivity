import {
  BrowserWindow,
  HandlerDetails,
  ipcMain,
  screen,
  WindowOpenHandlerResponse,
} from 'electron';
import { IPC } from './shared-with-frontend/ipc-events.const';

export const QUICK_ADD_FRAME_NAME = 'super-productivity-quick-add';
let popup: BrowserWindow | undefined;
let isOpenRequested = false;

export const toggleQuickAddTask = (mainWindow: BrowserWindow): void => {
  if (popup && !popup.isDestroyed()) {
    popup.close();
  } else {
    mainWindow.webContents.send(IPC.OPEN_QUICK_ADD_TASK);
  }
};

/** The parent renders its existing Angular bar here, sharing one store/database. */
export const initQuickAddTask = (getMainWindow: () => BrowserWindow): void => {
  ipcMain.handle(IPC.OPEN_QUICK_ADD_TASK, (event) => {
    const main = getMainWindow().webContents;
    if (event.sender !== main || event.senderFrame !== main.mainFrame) return false;
    if (popup && !popup.isDestroyed()) {
      popup.show();
      popup.focus();
      return false;
    }
    isOpenRequested = true;
    return true;
  });
  ipcMain.on(IPC.QUICK_ADD_TASK_RESIZE, (event, height: unknown) => {
    if (
      event.sender !== getMainWindow().webContents ||
      !popup ||
      popup.isDestroyed() ||
      typeof height !== 'number' ||
      !Number.isFinite(height)
    )
      return;
    const bounds = popup.getBounds();
    const area = screen.getDisplayMatching(bounds).workArea;
    const availableHeight = area.y + area.height - bounds.y;
    // Windows fixes the min/max bounds when resizable is false; unlock them
    // during programmatic resizing so closing a menu can shrink the window.
    popup.setResizable(true);
    popup.setSize(
      bounds.width,
      Math.min(Math.max(100, Math.ceil(height)), availableHeight),
    );
    popup.setResizable(false);
  });
};

export const openQuickAddTaskWindow = (
  details: HandlerDetails,
): WindowOpenHandlerResponse | undefined => {
  if (
    !isOpenRequested ||
    details.url !== 'about:blank' ||
    details.frameName !== QUICK_ADD_FRAME_NAME
  )
    return undefined;
  isOpenRequested = false;
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const width = Math.min(820, area.width);
  return {
    action: 'allow',
    overrideBrowserWindowOptions: {
      width,
      height: 120,
      x: area.x + Math.round((area.width - width) / 2),
      y: area.y + Math.round(area.height / 4),
      frame: false,
      transparent: true,
      resizable: false,
      maximizable: false,
      fullscreenable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      // about:blank inherits the parent's secure webPreferences. Do not load
      // another app entry point: it would initialize a second store.
    },
  };
};

export const registerQuickAddTaskWindow = (
  win: BrowserWindow,
  details: { url: string; frameName: string },
): boolean => {
  if (details.url !== 'about:blank' || details.frameName !== QUICK_ADD_FRAME_NAME)
    return false;
  popup = win;
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.on('will-redirect', (event) => event.preventDefault());
  win.on('closed', () => {
    popup = undefined;
  });
  return true;
};
