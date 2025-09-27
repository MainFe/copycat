// preload.js

const { ipcRenderer, contextBridge } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  sendCaptureRequest: (bounds) => ipcRenderer.send('capture-request', bounds),
  onOcrResult: (callback) => ipcRenderer.on('ocr-result', (event, text) => callback(text)),
  onClearTextarea: (callback) => ipcRenderer.on('clear-textarea', callback),
  startDrag: () => ipcRenderer.send('start-drag'),
  send: (channel, data) => ipcRenderer.send(channel, data)
});

// window.addEventListener('DOMContentLoaded', () => {
//   const captureButton = document.getElementById('capture-button');
//   captureButton.addEventListener('click', () => {
//     ipcRenderer.send('capture-window-open');
//   });
// });