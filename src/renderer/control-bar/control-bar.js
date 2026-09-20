const api = window.nurtureize;

// ---- DOM ----
const setupRow = document.getElementById('setupRow');
const recordingRow = document.getElementById('recordingRow');
const savingRow = document.getElementById('savingRow');

const sourceBtn = document.getElementById('sourceBtn');
const sourceMenu = document.getElementById('sourceMenu');
const screenList = document.getElementById('screenList');
const windowList = document.getElementById('windowList');
const regionOption = document.getElementById('regionOption');

const camBtn = document.getElementById('camBtn');
const micBtn = document.getElementById('micBtn');
const camBtn2 = document.getElementById('camBtn2');
const micBtn2 = document.getElementById('micBtn2');

const recordBtn = document.getElementById('recordBtn');
const closeBtn = document.getElementById('closeBtn');
const pauseBtn = document.getElementById('pauseBtn');
const stopBtn = document.getElementById('stopBtn');
const timerEl = document.getElementById('timer');

// ---- State ----
let captureSource = null; // { kind: 'screen'|'window'|'region', id, name, region? }
let wantCamera = true;
let wantMic = true;

let phase = 'setup'; // setup | recording | paused | saving

let screenStream = null;
let camMicStream = null;
let screenRecorder = null;
let camMicRecorder = null;
let screenChunks = [];
let camMicChunks = [];
let canvasLoopHandle = null;

let elapsedMs = 0;
let phaseStartedAt = 0;
let timerInterval = null;

// ---- Source menu ----
async function refreshSources() {
  const sources = await api.invoke('sources:get');
  screenList.innerHTML = '';
  windowList.innerHTML = '';

  sources.filter((s) => s.type === 'screen').forEach((s) => {
    screenList.appendChild(sourceMenuItem(s, '🖥'));
  });
  sources.filter((s) => s.type === 'window').forEach((s) => {
    windowList.appendChild(sourceMenuItem(s, '🪟'));
  });
}

function sourceMenuItem(source, icon) {
  const btn = document.createElement('button');
  btn.className = 'menu-item';
  btn.innerHTML = `<span>${icon}</span><span class="name">${escapeHtml(source.name)}</span>`;
  btn.addEventListener('click', () => {
    captureSource = { kind: source.type, id: source.id, name: source.name };
    setSourceLabel(source.type === 'screen' ? `🖥  ${source.name}` : `🪟  ${source.name}`);
    closeMenu();
  });
  return btn;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function setSourceLabel(label) {
  sourceBtn.textContent = label;
}

function closeMenu() { sourceMenu.classList.add('hidden'); }
function toggleMenu() {
  sourceMenu.classList.toggle('hidden');
  if (!sourceMenu.classList.contains('hidden')) refreshSources();
}

sourceBtn.addEventListener('click', toggleMenu);
document.addEventListener('click', (e) => {
  if (!sourceMenu.contains(e.target) && e.target !== sourceBtn) closeMenu();
});

regionOption.addEventListener('click', async () => {
  closeMenu();
  const result = await api.invoke('region:pick');
  if (!result || !result.sourceId) return;
  captureSource = {
    kind: 'region',
    id: result.sourceId,
    name: result.sourceName,
    region: { x: result.x, y: result.y, width: result.width, height: result.height },
  };
  setSourceLabel(`⬚  Custom (${result.width}×${result.height})`);
});

// ---- Cam / mic toggles ----
function paintToggle(btn, on) {
  btn.classList.toggle('active', on);
  btn.classList.toggle('off', !on);
}
paintToggle(camBtn, wantCamera);
paintToggle(micBtn, wantMic);

camBtn.addEventListener('click', () => { wantCamera = !wantCamera; paintToggle(camBtn, wantCamera); });
micBtn.addEventListener('click', () => { wantMic = !wantMic; paintToggle(micBtn, wantMic); });

camBtn2.addEventListener('click', () => {
  if (!camMicStream) return;
  const track = camMicStream.getVideoTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  paintToggle(camBtn2, track.enabled);
});
micBtn2.addEventListener('click', () => {
  if (!camMicStream) return;
  const track = camMicStream.getAudioTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  paintToggle(micBtn2, track.enabled);
});

// ---- Close (setup phase only) ----
closeBtn.addEventListener('click', async () => {
  await api.invoke('library:show');
  await api.invoke('control-bar:close');
});

// ---- Recording ----
recordBtn.addEventListener('click', async () => {
  if (!captureSource) {
    flashSourceRequired();
    return;
  }
  recordBtn.disabled = true;
  try {
    await startRecording();
  } catch (err) {
    console.error(err);
    recordBtn.disabled = false;
    alert(`Could not start recording: ${err.message}`);
  }
});

function flashSourceRequired() {
  sourceBtn.style.outline = '2px solid #ff6b35';
  setTimeout(() => { sourceBtn.style.outline = 'none'; }, 900);
}

async function startRecording() {
  await api.invoke('library:hide');

  // Screen / window / region video (no system audio in this MVP).
  screenStream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: captureSource.id,
      },
    },
  });

  let screenRecordStream = screenStream;
  if (captureSource.kind === 'region') {
    screenRecordStream = cropStreamToRegion(screenStream, captureSource.region);
  }

  screenChunks = [];
  screenRecorder = new MediaRecorder(screenRecordStream, { mimeType: pickMime(['video/webm;codecs=vp9', 'video/webm']) });
  screenRecorder.ondataavailable = (e) => { if (e.data.size) screenChunks.push(e.data); };

  // Camera + mic (optional), recorded as a separate track for later compositing.
  camMicStream = null;
  if (wantCamera || wantMic) {
    try {
      camMicStream = await navigator.mediaDevices.getUserMedia({ video: wantCamera, audio: wantMic });
    } catch (err) {
      console.warn('Camera/mic unavailable, continuing without it:', err);
    }
  }
  if (camMicStream) {
    camMicChunks = [];
    const hasVideo = camMicStream.getVideoTracks().length > 0;
    const mime = hasVideo
      ? pickMime(['video/webm;codecs=vp9,opus', 'video/webm'])
      : pickMime(['audio/webm;codecs=opus', 'audio/webm']);
    camMicRecorder = new MediaRecorder(camMicStream, { mimeType: mime });
    camMicRecorder.ondataavailable = (e) => { if (e.data.size) camMicChunks.push(e.data); };
  } else {
    camMicRecorder = null;
  }

  screenRecorder.start(250);
  if (camMicRecorder) camMicRecorder.start(250);

  paintToggle(camBtn2, !!(camMicStream && camMicStream.getVideoTracks()[0]));
  paintToggle(micBtn2, !!(camMicStream && camMicStream.getAudioTracks()[0]));
  camBtn2.disabled = !wantCamera;
  micBtn2.disabled = !wantMic;

  elapsedMs = 0;
  phaseStartedAt = Date.now();
  phase = 'recording';
  setupRow.classList.add('hidden');
  savingRow.classList.add('hidden');
  recordingRow.classList.remove('hidden');
  pauseBtn.textContent = '⏸';
  startTimer();
}

function cropStreamToRegion(sourceStream, region) {
  const video = document.createElement('video');
  video.srcObject = sourceStream;
  video.muted = true;
  video.play();

  const canvas = document.createElement('canvas');
  canvas.width = region.width;
  canvas.height = region.height;
  const ctx = canvas.getContext('2d');

  function draw() {
    if (video.readyState >= 2) {
      ctx.drawImage(video, region.x, region.y, region.width, region.height, 0, 0, region.width, region.height);
    }
    canvasLoopHandle = requestAnimationFrame(draw);
  }
  draw();

  return canvas.captureStream(30);
}

function pickMime(candidates) {
  return candidates.find((c) => MediaRecorder.isTypeSupported(c)) || candidates[candidates.length - 1];
}

pauseBtn.addEventListener('click', () => {
  if (phase === 'recording') {
    screenRecorder.pause();
    if (camMicRecorder) camMicRecorder.pause();
    elapsedMs += Date.now() - phaseStartedAt;
    phase = 'paused';
    pauseBtn.textContent = '▶';
    stopTimer();
  } else if (phase === 'paused') {
    screenRecorder.resume();
    if (camMicRecorder) camMicRecorder.resume();
    phaseStartedAt = Date.now();
    phase = 'recording';
    pauseBtn.textContent = '⏸';
    startTimer();
  }
});

stopBtn.addEventListener('click', stopRecording);

async function stopRecording() {
  if (phase === 'recording') elapsedMs += Date.now() - phaseStartedAt;
  phase = 'saving';
  stopTimer();
  recordingRow.classList.add('hidden');
  savingRow.classList.remove('hidden');

  const screenDone = new Promise((resolve) => { screenRecorder.onstop = resolve; });
  screenRecorder.stop();
  const camMicDone = camMicRecorder
    ? new Promise((resolve) => { camMicRecorder.onstop = resolve; })
    : Promise.resolve();
  if (camMicRecorder) camMicRecorder.stop();

  await Promise.all([screenDone, camMicDone]);
  if (canvasLoopHandle) cancelAnimationFrame(canvasLoopHandle);

  const screenBlob = new Blob(screenChunks, { type: screenRecorder.mimeType });
  const screenBuffer = new Uint8Array(await screenBlob.arrayBuffer());

  let webcamBuffer = null;
  let camWidth = 0;
  let camHeight = 0;
  if (camMicRecorder && camMicChunks.length) {
    const camBlob = new Blob(camMicChunks, { type: camMicRecorder.mimeType });
    webcamBuffer = new Uint8Array(await camBlob.arrayBuffer());
    const camSettings = camMicStream.getVideoTracks()[0]?.getSettings?.() || {};
    camWidth = camSettings.width || 0;
    camHeight = camSettings.height || 0;
  }

  const screenSettings = screenStream.getVideoTracks()[0]?.getSettings?.() || {};
  const screenWidth = captureSource.kind === 'region' ? captureSource.region.width : (screenSettings.width || 0);
  const screenHeight = captureSource.kind === 'region' ? captureSource.region.height : (screenSettings.height || 0);

  [screenStream, camMicStream].forEach((s) => s && s.getTracks().forEach((t) => t.stop()));

  const result = await api.invoke('recording:create', {
    title: `Recording — ${new Date().toLocaleString()}`,
    screenBuffer,
    webcamBuffer,
    meta: {
      durationMs: elapsedMs,
      hasMic: !!(camMicStream && camMicStream.getAudioTracks().length),
      hasCamera: !!(camMicStream && camMicStream.getVideoTracks().length),
      sourceKind: captureSource.kind,
      sourceName: captureSource.name,
      screenWidth,
      screenHeight,
      camWidth,
      camHeight,
    },
  });

  await api.invoke('editor:open', result.id);
  await api.invoke('control-bar:close');
}

function startTimer() {
  stopTimer();
  timerInterval = setInterval(() => {
    const total = elapsedMs + (phase === 'recording' ? Date.now() - phaseStartedAt : 0);
    const totalSec = Math.floor(total / 1000);
    const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
    const ss = String(totalSec % 60).padStart(2, '0');
    timerEl.textContent = `${mm}:${ss}`;
  }, 250);
}
function stopTimer() { if (timerInterval) clearInterval(timerInterval); timerInterval = null; }

// Preload the source list once on load so the menu opens instantly the first time.
refreshSources();
