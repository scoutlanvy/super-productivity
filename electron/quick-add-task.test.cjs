const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { EventEmitter } = require('node:events');
require('ts-node/register/transpile-only');

const handlers = new Map();
const windows = [];
const main = { webContents: { send: (...args) => sent.push(args) } };
let sent = [];
class Window extends EventEmitter {
  constructor(options) {
    super();
    this.options = options;
    this.webContents = new EventEmitter();
    this.webContents.send = (...args) => {
      this.labels = args;
    };
    this.webContents.setWindowOpenHandler = () => {};
    this.shows = 0;
    windows.push(this);
  }
  loadFile(file) {
    this.file = file;
    return Promise.resolve();
  }
  show() {
    this.shows++;
  }
  focus() {}
  isDestroyed() {
    return false;
  }
  close() {
    this.emit('closed');
  }
}
const originalLoad = Module._load;
Module._load = function (request, ...args) {
  if (request === 'electron')
    return {
      BrowserWindow: Window,
      ipcMain: {
        on: (name, handler) => handlers.set(name, handler),
        handle: (name, handler) => handlers.set(name, handler),
      },
      screen: {
        getCursorScreenPoint: () => ({ x: 0, y: 0 }),
        getDisplayNearestPoint: () => ({
          workArea: { x: 1200, y: 0, width: 600, height: 800 },
        }),
      },
    };
  return originalLoad.call(this, request, ...args);
};
try {
  require('./quick-add-task.ts').initQuickAddTask(() => main);
} finally {
  Module._load = originalLoad;
}
const call = (name, sender, ...args) => handlers.get(name)({ sender }, ...args);
const labels = { placeholder: 'Task', error: 'Error' };

test('capture window keeps the main window hidden, reuses drafts, and waits for app acknowledgement', async () => {
  call('OPEN_QUICK_ADD_TASK', {}, labels);
  assert.equal(windows.length, 0, 'only the main renderer can open capture');
  call('OPEN_QUICK_ADD_TASK', main.webContents, labels);
  const win = windows[0];
  assert.equal(win.options.width, 600, 'fits the display under the pointer');
  assert.equal(win.options.x, 1200);
  assert.equal(win.options.show, false);
  assert.equal(win.options.webPreferences.nodeIntegration, false);
  win.emit('ready-to-show');
  assert.deepEqual(win.labels, ['OPEN_QUICK_ADD_TASK', labels]);
  call('OPEN_QUICK_ADD_TASK', main.webContents, labels);
  assert.equal(windows.length, 1);
  assert.equal(win.shows, 2);
  assert.equal(call('QUICK_ADD_TASK_SUBMIT', {}, 'wrong sender'), false);
  assert.equal(call('QUICK_ADD_TASK_SUBMIT', win.webContents, '   '), false);
  assert.deepEqual(sent, []);

  const result = call('QUICK_ADD_TASK_SUBMIT', win.webContents, '  Task #tag t25m  ');
  assert.deepEqual(sent, [['QUICK_ADD_TASK_SUBMIT', { id: 1, title: 'Task #tag t25m' }]]);
  assert.equal(call('QUICK_ADD_TASK_SUBMIT', win.webContents, 'duplicate'), false);
  call('QUICK_ADD_TASK_CLOSE', win.webContents);
  call('OPEN_QUICK_ADD_TASK', main.webContents, labels);
  assert.equal(windows.length, 1, 'pending submission cannot be dismissed');
  call('QUICK_ADD_TASK_RESULT', {}, 1, true);
  assert.equal(call('QUICK_ADD_TASK_SUBMIT', win.webContents, 'duplicate'), false);
  call('QUICK_ADD_TASK_RESULT', main.webContents, 2, true);
  assert.equal(call('QUICK_ADD_TASK_SUBMIT', win.webContents, 'duplicate'), false);
  call('QUICK_ADD_TASK_RESULT', main.webContents, 1, true);
  assert.equal(await result, true);

  const failed = call('QUICK_ADD_TASK_SUBMIT', win.webContents, 'Retain draft');
  call('QUICK_ADD_TASK_RESULT', main.webContents, 2, false);
  assert.equal(await failed, false);
  call('QUICK_ADD_TASK_CLOSE', win.webContents);
  call('OPEN_QUICK_ADD_TASK', main.webContents, labels);
  assert.equal(windows.length, 2, 'closing permits a fresh capture');
  windows[1].close();
});
