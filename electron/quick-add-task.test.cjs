const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { EventEmitter } = require('node:events');
require('ts-node/register/transpile-only');

const handlers = new Map();
const main = { webContents: { mainFrame: {} } };
const area = { x: 1200, y: 0, width: 600, height: 800 };
const originalLoad = Module._load;
Module._load = function (request, ...args) {
  if (request === 'electron')
    return {
      ipcMain: {
        on: (name, handler) => handlers.set(name, handler),
        handle: (name, handler) => handlers.set(name, handler),
      },
      screen: {
        getCursorScreenPoint: () => ({ x: 0, y: 0 }),
        getDisplayNearestPoint: () => ({ workArea: area }),
        getDisplayMatching: () => ({ workArea: area }),
      },
    };
  return originalLoad.call(this, request, ...args);
};
let capture;
try {
  capture = require('./quick-add-task.ts');
  capture.initQuickAddTask(() => main);
} finally {
  Module._load = originalLoad;
}
const event = { sender: main.webContents, senderFrame: main.webContents.mainFrame };
const details = { url: 'about:blank', frameName: capture.QUICK_ADD_FRAME_NAME };

test('only a main-frame request authorizes one blank capture surface', () => {
  const prepare = handlers.get('OPEN_QUICK_ADD_TASK');
  assert.equal(capture.openQuickAddTaskWindow(details), undefined);
  assert.equal(prepare({ sender: {}, senderFrame: {} }), false);
  assert.equal(prepare({ sender: main.webContents, senderFrame: {} }), false);
  assert.equal(prepare(event), true);
  assert.equal(
    capture.openQuickAddTaskWindow({ ...details, url: 'https://example.com' }),
    undefined,
  );
  assert.equal(
    capture.openQuickAddTaskWindow({ ...details, frameName: 'other' }),
    undefined,
  );
  const response = capture.openQuickAddTaskWindow(details);
  assert.equal(response.action, 'allow');
  assert.equal(response.overrideBrowserWindowOptions.width, 600);
  assert.equal(response.overrideBrowserWindowOptions.x, 1200);
  assert.equal(response.overrideBrowserWindowOptions.transparent, true);
  assert.equal(response.overrideBrowserWindowOptions.alwaysOnTop, true);
  assert.equal(capture.openQuickAddTaskWindow(details), undefined);
});

test('capture reuses the current draft, blocks navigation, and clamps expanded menus to the display', () => {
  const win = new EventEmitter();
  win.webContents = new EventEmitter();
  let windowOpenHandler;
  win.webContents.setWindowOpenHandler = (handler) => {
    windowOpenHandler = handler;
  };
  let shows = 0;
  let focuses = 0;
  let size;
  win.show = () => shows++;
  win.focus = () => focuses++;
  win.isDestroyed = () => false;
  win.getBounds = () => ({ x: 1200, y: 200, width: 600, height: 120 });
  win.setSize = (...args) => {
    size = args;
  };
  const resizable = [];
  win.setResizable = (value) => resizable.push(value);
  assert.equal(
    capture.registerQuickAddTaskWindow(win, { ...details, frameName: 'other' }),
    false,
  );
  assert.equal(capture.registerQuickAddTaskWindow(win, details), true);
  assert.equal(handlers.get('OPEN_QUICK_ADD_TASK')(event), false);
  assert.equal(shows, 1);
  assert.equal(focuses, 1);
  assert.deepEqual(windowOpenHandler(), { action: 'deny' });
  let blocked = 0;
  win.webContents.emit('will-navigate', { preventDefault: () => blocked++ });
  win.webContents.emit('will-redirect', { preventDefault: () => blocked++ });
  assert.equal(blocked, 2);
  const resize = handlers.get('QUICK_ADD_TASK_RESIZE');
  resize({ sender: {} }, 500);
  resize(event, NaN);
  resize(event, '500');
  assert.equal(size, undefined);
  resize(event, 620);
  assert.deepEqual(size, [600, 600]);
  resize(event, 20);
  assert.deepEqual(size, [600, 100]);
  assert.deepEqual(resizable, [true, false, true, false]);
  win.emit('closed');
  assert.equal(handlers.get('OPEN_QUICK_ADD_TASK')(event), true);
});
