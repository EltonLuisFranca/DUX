import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('windowControls', {
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close')
})

contextBridge.exposeInMainWorld('workspaceStore', {
  loadSync: () => ipcRenderer.sendSync('workspaces:load-sync'),
  save: (data) => ipcRenderer.invoke('workspaces:save', data)
})
