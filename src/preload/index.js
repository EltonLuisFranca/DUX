import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('windowControls', {
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close')
})

contextBridge.exposeInMainWorld('platformInfo', {
  platform: process.platform
})

contextBridge.exposeInMainWorld('appInfo', {
  version: ipcRenderer.sendSync('app:get-version-sync')
})

contextBridge.exposeInMainWorld('workspaceStore', {
  loadSync: () => ipcRenderer.sendSync('workspaces:load-sync'),
  save: (data) => ipcRenderer.invoke('workspaces:save', data),
  saveSync: (data) => ipcRenderer.sendSync('workspaces:save-sync', data)
})

contextBridge.exposeInMainWorld('browserNodeAPI', {
  saveScreenshot: (dataUrl, defaultName) =>
    ipcRenderer.invoke('browser-node:save-screenshot', { dataUrl, defaultName })
})
