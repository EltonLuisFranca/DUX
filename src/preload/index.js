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

contextBridge.exposeInMainWorld('authStore', {
  login: () => ipcRenderer.invoke('auth:login'),
  logout: () => ipcRenderer.invoke('auth:logout'),
  getTokenSync: () => ipcRenderer.sendSync('auth:get-token-sync'),
  apiFetch: (path, options) => ipcRenderer.invoke('auth:api-fetch', { path, ...options }),
  onTokenReceived: (callback) => {
    const listener = () => callback()
    ipcRenderer.on('auth:token-received', listener)
    return () => ipcRenderer.removeListener('auth:token-received', listener)
  }
})

contextBridge.exposeInMainWorld('voiceAPI', {
  transcribe: (buffer) => ipcRenderer.invoke('voice:transcribe', { buffer })
})

contextBridge.exposeInMainWorld('imageNodeAPI', {
  openFile: () => ipcRenderer.invoke('image-node:open-file')
})

contextBridge.exposeInMainWorld('httpNodeAPI', {
  request: (options) => ipcRenderer.invoke('http-node:request', options)
})
