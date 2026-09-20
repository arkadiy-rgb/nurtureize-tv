const { app, BrowserWindow } = require('electron');
const { registerIpc } = require('./ipc');
const windows = require('./windows');

app.whenReady().then(() => {
  registerIpc();
  windows.createLibraryWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) windows.createLibraryWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
