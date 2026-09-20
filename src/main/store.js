const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function writeConfig(patch) {
  const next = { ...readConfig(), ...patch };
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2));
  return next;
}

function getSaveFolder() {
  const cfg = readConfig();
  if (cfg.saveFolder && fs.existsSync(cfg.saveFolder)) return cfg.saveFolder;
  const fallback = path.join(app.getPath('videos'), 'Nurtureize Studio');
  fs.mkdirSync(fallback, { recursive: true });
  return fallback;
}

function setSaveFolder(folder) {
  writeConfig({ saveFolder: folder });
  return folder;
}

module.exports = { getSaveFolder, setSaveFolder, readConfig, writeConfig };
