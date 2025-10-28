import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    send: (channel: string, data?: any) => ipcRenderer.send(channel, data),
    on: (channel: string, func: (event: any, ...args: any[]) => void) => {
      ipcRenderer.on(channel, (event, ...args) => func(event, ...args));
    },
    once: (channel: string, func: (event: any, ...args: any[]) => void) => {
      ipcRenderer.once(channel, (event, ...args) => func(event, ...args));
    },
    removeListener: (channel: string, func: (event: any, ...args: any[]) => void) => {
      ipcRenderer.removeListener(channel, func);
    },
  },
});
