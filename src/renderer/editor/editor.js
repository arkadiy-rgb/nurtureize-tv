const api = window.nurtureize;

const BRAND_SWATCHES = ['#0d1b2a', '#112236', '#ff6b35', '#cc4a1a', '#13243a', '#ffffff'];

const els = {
  recTitle: document.getElementById('recTitle'),
  exportBtn: document.getElementById('exportBtn'),
  exportStatus: document.getElementById('exportStatus'),
  canvas: document.getElementById('canvas'),
  stage: document.getElementById('stage'),
  screenBox: document.getElementById('screenBox'),
  cameraBox: document.getElementById('cameraBox'),
  playBtn: document.getElementById('playBtn'),
  timeLabel: document.getElementById('timeLabel'),
  bgSwatches: document.getElementById('bgSwatches'),
  bgColorPicker: document.getElementById('bgColorPicker'),
  bgImageBtn: document.getElementById('bgImageBtn'),
  bgImageInput: document.getElementById('bgImageInput'),
  cameraDisabledNote: document.getElementById('cameraDisabledNote'),
  cameraControls: document.getElementById('cameraControls'),
  cameraEnabled: document.getElementById('cameraEnabled'),
  cameraSize: document.getElementById('cameraSize'),
  resetScreenBtn: document.getElementById('resetScreenBtn'),
  screenVideo: document.getElementById('screenVideo'),
  camVideo: document.getElementById('camVideo'),
  addCutoutBtn: document.getElementById('addCutoutBtn'),
  cutoutList: document.getElementById('cutoutList'),
};

let recordingId = new URLSearchParams(location.search).get('id');
let project = null;
let engine = null;
let timelineUI = null;
let camAudioTrack = null;
let saveTimer = null;

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => api.invoke('recording:save-project', recordingId, project), 500);
}

function fixWebmDuration(video) {
  // MediaRecorder-produced webm files often report duration: Infinity because
  // no seekable duration box is written. Seeking far forward once forces
  // Chromium to compute the real seekable range; then reset to 0.
  return new Promise((resolve) => {
    if (Number.isFinite(video.duration)) { resolve(); return; }
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      video.currentTime = 0;
      resolve();
    };
    video.addEventListener('seeked', onSeeked);
    video.currentTime = 1e7;
  });
}

function waitLoaded(video) {
  return new Promise((resolve) => {
    if (video.readyState >= 1) resolve();
    else video.addEventListener('loadedmetadata', () => resolve(), { once: true });
  });
}

function formatTime(ms) {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const ss = String(totalSec % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function pickMime(candidates) {
  return candidates.find((c) => MediaRecorder.isTypeSupported(c)) || candidates[candidates.length - 1];
}

async function init() {
  const rec = await api.invoke('recording:get', recordingId);
  els.recTitle.textContent = rec.meta.title;

  els.screenVideo.src = rec.screenUrl;
  if (rec.webcamUrl) els.camVideo.src = rec.webcamUrl;

  await waitLoaded(els.screenVideo);
  await fixWebmDuration(els.screenVideo);
  if (rec.webcamUrl) {
    await waitLoaded(els.camVideo);
    await fixWebmDuration(els.camVideo);
    try { camAudioTrack = els.camVideo.captureStream().getAudioTracks()[0] || null; } catch { camAudioTrack = null; }
  }

  const canvasW = rec.meta.screenWidth || els.screenVideo.videoWidth || 1280;
  const canvasH = rec.meta.screenHeight || els.screenVideo.videoHeight || 720;

  // The stopwatch-tracked duration from capture (meta.durationMs) can run a
  // little ahead of the webm's actual decodable length (encoder flush/timeslice
  // rounding). Segment/end-of-playback detection walks screenVideo.currentTime,
  // so it must be bounded by what the file can actually play back to, or
  // "reached the end" never becomes true and playback/export hangs forever.
  const realDurationMs = Number.isFinite(els.screenVideo.duration)
    ? Math.round(els.screenVideo.duration * 1000)
    : rec.meta.durationMs;

  project = rec.project || {
    canvas: { width: canvasW, height: canvasH },
    background: { type: 'color', color: '#0d1b2a', imageDataUrl: null },
    screen: { x: 0, y: 0, width: canvasW, height: canvasH },
    camera: {
      enabled: !!rec.meta.hasCamera,
      shape: 'circle',
      x: canvasW - Math.min(320, canvasW * 0.32) - 40,
      y: canvasH - Math.min(320, canvasH * 0.32) - 40,
      size: Math.min(320, canvasW * 0.32, canvasH * 0.32),
    },
    trim: { start: 0, end: realDurationMs },
    cutouts: [],
  };
  project.trim.end = Math.min(project.trim.end, realDurationMs);
  project.trim.start = Math.min(project.trim.start, Math.max(0, project.trim.end - 500));

  engine = new window.CompositorEngine({ canvas: els.canvas, screenVideo: els.screenVideo, camVideo: els.camVideo });
  if (project.background.type === 'image') await engine.loadBackgroundImage(project.background.imageDataUrl);
  engine.setProject(project);
  engine.onTick = handleTick;
  engine.onEnded = () => { els.playBtn.textContent = '▶'; };
  engine.onError = (err) => {
    els.playBtn.textContent = '▶';
    alert(`Playback couldn't start: ${err.message || err}`);
  };

  timelineUI = new window.TimelineUI(
    {
      track: document.getElementById('timelineTrack'),
      shadeLeft: document.getElementById('trimShadeLeft'),
      shadeRight: document.getElementById('trimShadeRight'),
      cutoutLayer: document.getElementById('cutoutLayer'),
      playhead: document.getElementById('playhead'),
      trimStartHandle: document.getElementById('trimStartHandle'),
      trimEndHandle: document.getElementById('trimEndHandle'),
    },
    {
      onSeek: (realMs) => { engine.seekVirtual(engine.virtualTimeFor(realMs)); refreshUiFromEngine(); },
      onTrimChange: (which, ms) => {
        if (which === 'start') project.trim.start = Math.max(0, Math.min(ms, project.trim.end - 500));
        else project.trim.end = Math.max(project.trim.start + 500, Math.min(ms, realDurationMs));
        engine.setProject(project);
        refreshUiFromEngine();
        scheduleSave();
      },
      onAddCutout: (a, b) => {
        project.cutouts.push({ start: a, end: b });
        engine.setProject(project);
        renderCutoutList();
        refreshUiFromEngine();
        scheduleSave();
      },
    }
  );
  timelineUI.setDuration(realDurationMs);

  setupBackgroundControls();
  setupCameraControls(rec.meta.hasCamera);
  setupLayerDrag();
  setupTransport();
  renderCutoutList();
  refreshUiFromEngine();
  window.addEventListener('resize', syncBoxPositions);
}

function handleTick(virtualMs, totalMs, realMs) {
  els.timeLabel.textContent = `${formatTime(virtualMs)} / ${formatTime(totalMs)}`;
  timelineUI.render(project, realMs);
}

function refreshUiFromEngine() {
  const realMs = els.screenVideo.currentTime * 1000;
  handleTick(engine.virtualTimeFor(realMs), engine.durationMs, realMs);
  syncBoxPositions();
  engine.drawFrame();
}

// ---- Transport ----
function setupTransport() {
  els.playBtn.addEventListener('click', () => {
    if (engine.playing) {
      engine.pause();
      els.playBtn.textContent = '▶';
    } else {
      engine.play();
      els.playBtn.textContent = '⏸';
    }
  });
  els.addCutoutBtn.addEventListener('click', () => timelineUI.enterCutoutMode());
}

function renderCutoutList() {
  els.cutoutList.innerHTML = '';
  project.cutouts.forEach((c, i) => {
    const chip = document.createElement('div');
    chip.className = 'cutout-chip';
    chip.innerHTML = `<span>${formatTime(c.start)}–${formatTime(c.end)}</span>`;
    const btn = document.createElement('button');
    btn.textContent = '✕';
    btn.addEventListener('click', () => {
      project.cutouts.splice(i, 1);
      engine.setProject(project);
      renderCutoutList();
      refreshUiFromEngine();
      scheduleSave();
    });
    chip.appendChild(btn);
    els.cutoutList.appendChild(chip);
  });
}

// ---- Background ----
function setupBackgroundControls() {
  BRAND_SWATCHES.forEach((color) => {
    const sw = document.createElement('div');
    sw.className = 'swatch';
    sw.style.background = color;
    sw.addEventListener('click', () => {
      project.background = { type: 'color', color, imageDataUrl: null };
      engine.drawFrame();
      paintSwatchSelection(color);
      scheduleSave();
    });
    els.bgSwatches.appendChild(sw);
  });

  els.bgColorPicker.addEventListener('input', (e) => {
    project.background = { type: 'color', color: e.target.value, imageDataUrl: null };
    engine.drawFrame();
    paintSwatchSelection(null);
    scheduleSave();
  });

  els.bgImageBtn.addEventListener('click', () => els.bgImageInput.click());
  els.bgImageInput.addEventListener('change', async () => {
    const file = els.bgImageInput.files[0];
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    project.background = { type: 'image', color: project.background.color, imageDataUrl: dataUrl };
    await engine.loadBackgroundImage(dataUrl);
    engine.drawFrame();
    paintSwatchSelection(null);
    scheduleSave();
  });

  if (project.background.type === 'color') paintSwatchSelection(project.background.color);
}

function paintSwatchSelection(color) {
  [...els.bgSwatches.children].forEach((sw) => sw.classList.toggle('selected', sw.style.background === hexToRgbCss(color)));
}
function hexToRgbCss(hex) {
  if (!hex) return '__none__';
  const d = document.createElement('div');
  d.style.background = hex;
  return d.style.background;
}
function fileToDataUrl(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

// ---- Camera controls ----
function setupCameraControls(hasCamera) {
  if (!hasCamera) {
    els.cameraDisabledNote.classList.remove('hidden');
    els.cameraControls.classList.add('hidden');
    els.cameraBox.classList.add('hidden');
    return;
  }
  els.cameraEnabled.checked = project.camera.enabled;
  els.cameraSize.min = 60;
  els.cameraSize.max = Math.min(project.canvas.width, project.canvas.height);
  els.cameraSize.value = project.camera.size;
  updateShapeButtons();

  els.cameraEnabled.addEventListener('change', () => {
    project.camera.enabled = els.cameraEnabled.checked;
    els.cameraBox.classList.toggle('hidden', !project.camera.enabled);
    engine.drawFrame();
    scheduleSave();
  });

  document.querySelectorAll('.shape-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      project.camera.shape = btn.dataset.shape;
      updateShapeButtons();
      syncBoxPositions();
      engine.drawFrame();
      scheduleSave();
    });
  });

  els.cameraSize.addEventListener('input', () => {
    project.camera.size = Number(els.cameraSize.value);
    syncBoxPositions();
    engine.drawFrame();
    scheduleSave();
  });
}

function updateShapeButtons() {
  document.querySelectorAll('.shape-btn').forEach((btn) => {
    btn.classList.toggle('selected', btn.dataset.shape === project.camera.shape);
  });
}

// ---- Layer boxes (drag + resize) ----
function canvasRectInStage() {
  const canvasRect = els.canvas.getBoundingClientRect();
  const stageRect = els.stage.getBoundingClientRect();
  return {
    left: canvasRect.left - stageRect.left,
    top: canvasRect.top - stageRect.top,
    width: canvasRect.width,
    height: canvasRect.height,
    scale: canvasRect.width / els.canvas.width,
  };
}

function syncBoxPositions() {
  const r = canvasRectInStage();
  const s = project.screen;
  els.screenBox.style.left = `${r.left + s.x * r.scale}px`;
  els.screenBox.style.top = `${r.top + s.y * r.scale}px`;
  els.screenBox.style.width = `${s.width * r.scale}px`;
  els.screenBox.style.height = `${s.height * r.scale}px`;

  const c = project.camera;
  els.cameraBox.style.left = `${r.left + c.x * r.scale}px`;
  els.cameraBox.style.top = `${r.top + c.y * r.scale}px`;
  els.cameraBox.style.width = `${c.size * r.scale}px`;
  els.cameraBox.style.height = `${c.size * r.scale}px`;
  els.cameraBox.style.borderRadius = c.shape === 'circle' ? '50%' : c.shape === 'rounded' ? '18%' : '0';
}

function setupLayerDrag() {
  makeInteractiveBox(els.screenBox, {
    getRect: () => project.screen,
    setRect: (v) => { project.screen = v; },
    minSize: 80,
    square: false,
  });
  makeInteractiveBox(els.cameraBox, {
    getRect: () => project.camera,
    setRect: (v) => { project.camera = v; els.cameraSize.value = v.size; },
    minSize: 60,
    maxSize: Math.min(project.canvas.width, project.canvas.height),
    square: true,
  });

  els.resetScreenBtn.addEventListener('click', () => {
    project.screen = { x: 0, y: 0, width: project.canvas.width, height: project.canvas.height };
    syncBoxPositions();
    engine.drawFrame();
    scheduleSave();
  });
}

function makeInteractiveBox(boxEl, { getRect, setRect, minSize, maxSize, square }) {
  const handle = boxEl.querySelector('.resize-handle');

  boxEl.addEventListener('mousedown', (e) => {
    if (e.target === handle) return;
    e.preventDefault();
    const startX = e.clientX, startY = e.clientY;
    const start = { ...getRect() };
    const scale = canvasRectInStage().scale;
    const move = (ev) => {
      const dx = (ev.clientX - startX) / scale;
      const dy = (ev.clientY - startY) / scale;
      setRect({ ...getRect(), x: start.x + dx, y: start.y + dy });
      syncBoxPositions();
      engine.drawFrame();
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      scheduleSave();
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  });

  handle.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX, startY = e.clientY;
    const start = { ...getRect() };
    const scale = canvasRectInStage().scale;
    const move = (ev) => {
      const dx = (ev.clientX - startX) / scale;
      const dy = (ev.clientY - startY) / scale;
      if (square) {
        const size = Math.max(minSize, start.size + Math.max(dx, dy));
        setRect({ ...getRect(), size: maxSize ? Math.min(size, maxSize) : size });
      } else {
        setRect({
          ...getRect(),
          width: Math.max(minSize, start.width + dx),
          height: Math.max(minSize, start.height + dy),
        });
      }
      syncBoxPositions();
      engine.drawFrame();
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      scheduleSave();
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  });
}

// ---- Export ----
els.exportBtn.addEventListener('click', runExport);

async function runExport() {
  if (engine.playing) engine.pause();
  els.exportBtn.disabled = true;
  els.exportStatus.textContent = 'Exporting… 0:00';

  const canvasStream = els.canvas.captureStream(30);
  const tracks = [...canvasStream.getVideoTracks()];
  if (camAudioTrack) tracks.push(camAudioTrack);
  const exportStream = new MediaStream(tracks);

  const mime = pickMime(['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']);
  const recorder = new MediaRecorder(exportStream, { mimeType: mime });
  const chunks = [];
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };

  const prevTick = engine.onTick;
  const prevEnded = engine.onEnded;
  const prevError = engine.onError;

  const restoreHandlers = () => {
    engine.onTick = prevTick;
    engine.onEnded = prevEnded;
    engine.onError = prevError;
    els.playBtn.textContent = '▶';
  };

  engine.onTick = (virtualMs, totalMs, realMs) => {
    els.exportStatus.textContent = `Exporting… ${formatTime(virtualMs)} / ${formatTime(totalMs)}`;
    handleTick(virtualMs, totalMs, realMs);
  };
  engine.onEnded = () => recorder.stop();
  engine.onError = (err) => {
    restoreHandlers();
    els.exportStatus.textContent = '';
    els.exportBtn.disabled = false;
    alert(`Export failed to start playback: ${err.message || err}`);
  };

  recorder.onstop = async () => {
    restoreHandlers();

    const blob = new Blob(chunks, { type: recorder.mimeType });
    const buffer = new Uint8Array(await blob.arrayBuffer());
    await api.invoke('recording:save-export', recordingId, buffer);
    els.exportStatus.textContent = 'Exported ✓ saved to your recordings folder';
    els.exportBtn.disabled = false;
  };

  engine.seekVirtual(0);
  recorder.start(250);
  engine.play();
}

init();
