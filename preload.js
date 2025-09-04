const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  on: (channel, listener) => {
    ipcRenderer.on(channel, (event, ...args) => listener(...args));
  },
  send: (channel, ...args) => ipcRenderer.send(channel, ...args),
});