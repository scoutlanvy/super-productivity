import { contextBridge, ipcRenderer } from 'electron';

// Keep this sandboxed preload self-contained (no runtime imports except Electron).
contextBridge.exposeInMainWorld('quickAdd', {
  onOpen: (listener: (labels: { placeholder: string; error: string }) => void) => {
    ipcRenderer.on('OPEN_QUICK_ADD_TASK', (_event, labels) => listener(labels));
  },
  submit: (title: string): Promise<boolean> =>
    ipcRenderer.invoke('QUICK_ADD_TASK_SUBMIT', title),
  close: () => ipcRenderer.send('QUICK_ADD_TASK_CLOSE'),
});
