const { BrowserWindow, screen } = require('electron');
const path = require('path');

const PRELOAD = path.join(__dirname, 'preload.js');

let libraryWin = null;
let controlBarWin = null;
let regionPickerWins = [];
let editorWin = null;

function createLibraryWindow() {
  if (libraryWin && !libraryWin.isDestroyed()) {
    libraryWin.show();
    libraryWin.focus();
    return libraryWin;
  }
  libraryWin = new BrowserWindow({
    width: 1040,
    height: 720,
    minWidth: 760,
    minHeight: 520,
    title: 'Nurtureize Studio',
    backgroundColor: '#0d1b2a',
    webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false },
  });
  libraryWin.loadFile(path.join(__dirname, '..', 'renderer', 'library', 'index.html'));
  libraryWin.on('closed', () => { libraryWin = null; });
  return libraryWin;
}

function getLibraryWindow() {
  return libraryWin;
}

function createControlBar() {
  if (controlBarWin && !controlBarWin.isDestroyed()) {
    controlBarWin.show();
    controlBarWin.focus();
    return controlBarWin;
  }
  const display = screen.getPrimaryDisplay();
  const width = 560;
  const height = 64;
  const x = Math.round(display.workArea.x + (display.workArea.width - width) / 2);
  const y = display.workArea.y + 24;

  controlBarWin = new BrowserWindow({
    width,
    height,
    x,
    y,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false },
  });
  controlBarWin.setAlwaysOnTop(true, 'screen-saver');
  controlBarWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // Excludes this window from the content it captures, on platforms that support it
  // (macOS reliably; Windows 10 2004+/11 with a recent Electron/Chromium build).
  try { controlBarWin.setContentProtection(true); } catch { /* not supported on this platform */ }

  controlBarWin.loadFile(path.join(__dirname, '..', 'renderer', 'control-bar', 'index.html'));
  controlBarWin.on('closed', () => { controlBarWin = null; });
  return controlBarWin;
}

function getControlBar() {
  return controlBarWin;
}

function closeControlBar() {
  if (controlBarWin && !controlBarWin.isDestroyed()) controlBarWin.close();
  controlBarWin = null;
}

// MVP: region picker covers the primary display. Multi-monitor region picking
// is a reasonable fast-follow once the core flow is validated on real hardware.
function openRegionPicker() {
  closeRegionPicker();
  const display = screen.getPrimaryDisplay();
  const win = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    fullscreenable: false,
    webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.loadFile(path.join(__dirname, '..', 'renderer', 'region-picker', 'index.html'), {
    query: {
      w: String(display.bounds.width),
      h: String(display.bounds.height),
      scale: String(display.scaleFactor),
    },
  });
  win.on('closed', () => { regionPickerWins = regionPickerWins.filter((w) => w !== win); });
  regionPickerWins.push(win);
  return { win, displayBounds: display.bounds, scaleFactor: display.scaleFactor, displayId: display.id };
}

function closeRegionPicker() {
  regionPickerWins.forEach((w) => { if (!w.isDestroyed()) w.close(); });
  regionPickerWins = [];
}

function createEditorWindow(recordingId) {
  if (editorWin && !editorWin.isDestroyed()) editorWin.close();
  editorWin = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    title: 'Nurtureize Studio — Editor',
    backgroundColor: '#0d1b2a',
    webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false },
  });
  editorWin.loadFile(path.join(__dirname, '..', 'renderer', 'editor', 'index.html'), {
    query: { id: recordingId },
  });
  editorWin.on('closed', () => { editorWin = null; });
  return editorWin;
}

module.exports = {
  createLibraryWindow, getLibraryWindow,
  createControlBar, getControlBar, closeControlBar,
  openRegionPicker, closeRegionPicker,
  createEditorWindow,
};
