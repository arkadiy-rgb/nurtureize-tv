const { contextBridge, ipcRenderer } = require('electron');

const INVOKE_CHANNELS = [
  'sources:get',
  'region:pick',
  'region:submit',
  'region:cancel',
  'folder:choose',
  'folder:get',
  'recording:create',
  'recordings:list',
  'recording:get',
  'recording:save-project',
  'recording:save-export',
  'recording:delete',
  'recording:reveal',
  'control-bar:open',
  'control-bar:close',
  'library:hide',
  'library:show',
  'editor:open',
];

const LISTEN_CHANNELS = ['library:refresh'];

contextBridge.exposeInMainWorld('nurtureize', {
  invoke: (channel, ...args) => {
    if (!INVOKE_CHANNELS.includes(channel)) {
      throw new Error(`Blocked IPC channel: ${channel}`);
    }
    return ipcRenderer.invoke(channel, ...args);
  },
  on: (channel, callback) => {
    if (!LISTEN_CHANNELS.includes(channel)) {
      throw new Error(`Blocked IPC channel: ${channel}`);
    }
    const wrapped = (_event, ...args) => callback(...args);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
});
