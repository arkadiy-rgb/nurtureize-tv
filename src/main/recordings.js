const fs = require('fs');
const path = require('path');

function newId() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `rec-${stamp}`;
}

function recDir(saveFolder, id) {
  return path.join(saveFolder, id);
}

function listRecordings(saveFolder) {
  if (!fs.existsSync(saveFolder)) return [];
  const entries = fs.readdirSync(saveFolder, { withFileTypes: true })
    .filter((e) => e.isDirectory());

  const items = [];
  for (const e of entries) {
    const dir = path.join(saveFolder, e.name);
    const metaPath = path.join(dir, 'meta.json');
    if (!fs.existsSync(metaPath)) continue;
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      items.push({
        id: e.name,
        ...meta,
        hasExport: fs.existsSync(path.join(dir, 'export.webm')),
        hasProject: fs.existsSync(path.join(dir, 'project.json')),
      });
    } catch {
      /* skip corrupt entry */
    }
  }
  return items.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

function createRecording(saveFolder, { title, screenBuffer, webcamBuffer, meta }) {
  const id = newId();
  const dir = recDir(saveFolder, id);
  fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(path.join(dir, 'screen.webm'), screenBuffer);
  if (webcamBuffer) fs.writeFileSync(path.join(dir, 'webcam.webm'), webcamBuffer);

  const fullMeta = {
    title: title || 'Untitled recording',
    createdAt: new Date().toISOString(),
    hasCamera: !!webcamBuffer,
    ...meta,
  };
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(fullMeta, null, 2));

  return { id, dir, meta: fullMeta };
}

function getRecording(saveFolder, id) {
  const dir = recDir(saveFolder, id);
  const metaPath = path.join(dir, 'meta.json');
  if (!fs.existsSync(metaPath)) throw new Error(`Recording not found: ${id}`);
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));

  const screenPath = path.join(dir, 'screen.webm');
  const webcamPath = path.join(dir, 'webcam.webm');
  const projectPath = path.join(dir, 'project.json');
  const exportPath = path.join(dir, 'export.webm');

  let project = null;
  if (fs.existsSync(projectPath)) {
    try { project = JSON.parse(fs.readFileSync(projectPath, 'utf8')); } catch { project = null; }
  }

  return {
    id,
    meta,
    project,
    screenUrl: fileUrl(screenPath),
    webcamUrl: fs.existsSync(webcamPath) ? fileUrl(webcamPath) : null,
    exportUrl: fs.existsSync(exportPath) ? fileUrl(exportPath) : null,
  };
}

function saveProject(saveFolder, id, project) {
  const dir = recDir(saveFolder, id);
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify(project, null, 2));
  return true;
}

function saveExport(saveFolder, id, buffer) {
  const dir = recDir(saveFolder, id);
  const p = path.join(dir, 'export.webm');
  fs.writeFileSync(p, buffer);
  return fileUrl(p);
}

function deleteRecording(saveFolder, id) {
  const dir = recDir(saveFolder, id);
  fs.rmSync(dir, { recursive: true, force: true });
  return true;
}

function fileUrl(p) {
  const resolved = path.resolve(p).replace(/\\/g, '/');
  return `file://${resolved.startsWith('/') ? '' : '/'}${resolved}`;
}

module.exports = { listRecordings, createRecording, getRecording, saveProject, saveExport, deleteRecording };
