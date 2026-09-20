const { ipcMain, desktopCapturer, dialog, shell } = require('electron');
const path = require('path');
const store = require('./store');
const recordings = require('./recordings');
const windows = require('./windows');

let pendingRegionResolve = null;

function registerIpc() {
  ipcMain.handle('sources:get', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 180},
      fetchWindowIcons: true,
    });
    return sources.map((s) => ({
      id: s.id,
      name: s.name,
      type: s.id.startsWith('screen') ? 'screen' : 'window',
      thumbnail: s.thumbnail.toDataURL(),
    }));
  });

  ipcMain.handle('region:pick', async () => {
    windows.closeRegionPicker();
    const { displayId } = windows.openRegionPicker();
    const bounds = await new Promise((resolve) => { pendingRegionResolve = resolve; });
    windows.closeRegionPicker();
    if (!bounds) return null;

    const sources = await desktopCapturer.getSources({ types: ['screen'] });
    const match = sources.find((s) => s.display_id === String(displayId)) || sources[0];
    return { ...bounds, sourceId: match ? match.id : null, sourceName: match ? match.name : 'Screen' };
  });

  ipcMain.handle('region:submit', (_e, bounds) => {
    if (pendingRegionResolve) {
      pendingRegionResolve(bounds);
      pendingRegionResolve = null;
    }
  });

  ipcMain.handle('region:cancel', () => {
    if (pendingRegionResolve) {
      pendingRegionResolve(null);
      pendingRegionResolve = null;
    }
    windows.closeRegionPicker();
  });

  ipcMain.handle('folder:choose', async () => {
    const win = windows.getLibraryWindow();
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Choose where Nurtureize Studio saves recordings',
    });
    if (result.canceled || !result.filePaths[0]) return store.getSaveFolder();
    return store.setSaveFolder(result.filePaths[0]);
  });

  ipcMain.handle('folder:get', () => store.getSaveFolder());

  ipcMain.handle('recording:create', (_e, { title, screenBuffer, webcamBuffer, meta }) => {
    const saveFolder = store.getSaveFolder();
    const result = recordings.createRecording(saveFolder, {
      title,
      screenBuffer: Buffer.from(screenBuffer),
      webcamBuffer: webcamBuffer ? Buffer.from(webcamBuffer) : null,
      meta,
    });
    const libWin = windows.getLibraryWindow();
    if (libWin) libWin.webContents.send('library:refresh');
    return result;
  });

  ipcMain.handle('recordings:list', () => recordings.listRecordings(store.getSaveFolder()));

  ipcMain.handle('recording:get', (_e, id) => recordings.getRecording(store.getSaveFolder(), id));

  ipcMain.handle('recording:save-project', (_e, id, project) =>
    recordings.saveProject(store.getSaveFolder(), id, project));

  ipcMain.handle('recording:save-export', (_e, id, buffer) =>
    recordings.saveExport(store.getSaveFolder(), id, Buffer.from(buffer)));

  ipcMain.handle('recording:delete', (_e, id) => {
    const r = recordings.deleteRecording(store.getSaveFolder(), id);
    const libWin = windows.getLibraryWindow();
    if (libWin) libWin.webContents.send('library:refresh');
    return r;
  });

  ipcMain.handle('recording:reveal', (_e, id) => {
    const saveFolder = store.getSaveFolder();
    shell.showItemInFolder(path.join(saveFolder, id, 'meta.json'));
  });

  ipcMain.handle('control-bar:open', () => { windows.createControlBar(); });
  ipcMain.handle('control-bar:close', () => { windows.closeControlBar(); });
  ipcMain.handle('control-bar:resize', (_e, height) => { windows.resizeControlBar(height); });

  ipcMain.handle('library:hide', () => {
    const win = windows.getLibraryWindow();
    if (win) win.hide();
  });
  ipcMain.handle('library:show', () => {
    const win = windows.createLibraryWindow();
    win.webContents.send('library:refresh');
  });

  ipcMain.handle('editor:open', (_e, id) => { windows.createEditorWindow(id); });
}

module.exports = { registerIpc };
