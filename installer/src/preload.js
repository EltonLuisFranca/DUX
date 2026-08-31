const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('installerAPI', {
  start: () => ipcRenderer.invoke('install:start'),
  launchApp: (installDir) => ipcRenderer.invoke('install:launch-app', installDir),
  onProgress: (callback) => {
    const handler = (_event, progress) => callback(progress)
    ipcRenderer.on('install:progress', handler)
    return () => ipcRenderer.removeListener('install:progress', handler)
  }
})

contextBridge.exposeInMainWorld('uninstallerAPI', {
  start: () => ipcRenderer.invoke('uninstall:start'),
  onProgress: (callback) => {
    const handler = (_event, progress) => callback(progress)
    ipcRenderer.on('uninstall:progress', handler)
    return () => ipcRenderer.removeListener('uninstall:progress', handler)
  }
})
