// Playback + rendering engine shared by live preview and export.
// Both walk the same "segments" (the parts of the original recording that
// survive trim + cutouts) so what you see while editing is what you export.

function normalizeCutouts(cutouts, trimStart, trimEnd) {
  const clipped = cutouts
    .map((c) => ({ start: Math.max(c.start, trimStart), end: Math.min(c.end, trimEnd) }))
    .filter((c) => c.end > c.start)
    .sort((a, b) => a.start - b.start);

  const merged = [];
  for (const c of clipped) {
    const last = merged[merged.length - 1];
    if (last && c.start <= last.end) last.end = Math.max(last.end, c.end);
    else merged.push({ ...c });
  }
  return merged;
}

function buildSegments(trimStart, trimEnd, cutouts) {
  const cuts = normalizeCutouts(cutouts, trimStart, trimEnd);
  const segments = [];
  let cursor = trimStart;
  for (const c of cuts) {
    if (c.start > cursor) segments.push({ start: cursor, end: c.start });
    cursor = Math.max(cursor, c.end);
  }
  if (cursor < trimEnd) segments.push({ start: cursor, end: trimEnd });
  return segments;
}

function totalDuration(segments) {
  return segments.reduce((sum, s) => sum + (s.end - s.start), 0);
}

class Engine {
  constructor({ canvas, screenVideo, camVideo }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.screenVideo = screenVideo;
    this.camVideo = camVideo;
    this.project = null;
    this.segments = [];
    this.playing = false;
    this._raf = null;
    this.onTick = null; // (currentMs, totalMs) => void
    this.onEnded = null;
  }

  setProject(project) {
    this.project = project;
    this.canvas.width = project.canvas.width;
    this.canvas.height = project.canvas.height;
    this.segments = buildSegments(project.trim.start, project.trim.end, project.cutouts);
  }

  get durationMs() { return totalDuration(this.segments); }

  drawFrame() {
    const { ctx, canvas, project } = this;
    if (!project) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background
    if (project.background.type === 'image' && this._bgImg) {
      ctx.drawImage(this._bgImg, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.fillStyle = project.background.color || '#0d1b2a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Screen layer
    const s = project.screen;
    if (this.screenVideo.readyState >= 2) {
      ctx.drawImage(this.screenVideo, s.x, s.y, s.width, s.height);
    }

    // Camera layer
    const c = project.camera;
    if (c.enabled && this.camVideo && this.camVideo.videoWidth > 0) {
      ctx.save();
      ctx.beginPath();
      if (c.shape === 'circle') {
        ctx.arc(c.x + c.size / 2, c.y + c.size / 2, c.size / 2, 0, Math.PI * 2);
      } else {
        const r = c.shape === 'rounded' ? c.size * 0.18 : 0;
        roundRectPath(ctx, c.x, c.y, c.size, c.size, r);
      }
      ctx.clip();
      drawCoverVideo(ctx, this.camVideo, c.x, c.y, c.size, c.size);
      ctx.restore();
    }
  }

  loadBackgroundImage(dataUrl) {
    return new Promise((resolve) => {
      if (!dataUrl) { this._bgImg = null; resolve(); return; }
      const img = new Image();
      img.onload = () => { this._bgImg = img; resolve(); };
      img.src = dataUrl;
    });
  }

  // Find which segment a virtual (edited-timeline) position falls into, and
  // the corresponding real (original recording) time.
  realTimeFor(virtualMs) {
    let acc = 0;
    for (const seg of this.segments) {
      const len = seg.end - seg.start;
      if (virtualMs <= acc + len) return seg.start + (virtualMs - acc);
      acc += len;
    }
    const last = this.segments[this.segments.length - 1];
    return last ? last.end : 0;
  }

  virtualTimeFor(realMs) {
    let acc = 0;
    for (const seg of this.segments) {
      if (realMs >= seg.start && realMs <= seg.end) return acc + (realMs - seg.start);
      if (realMs < seg.start) return acc;
      acc += seg.end - seg.start;
    }
    return acc;
  }

  seekVirtual(virtualMs) {
    const real = this.realTimeFor(Math.max(0, Math.min(virtualMs, this.durationMs)));
    this.screenVideo.currentTime = real / 1000;
    if (this.camVideo) this.camVideo.currentTime = real / 1000;
    this.drawFrame();
  }

  play() {
    if (this.playing || !this.segments.length) return;
    this.playing = true;
    const current = this.virtualTimeFor(this.screenVideo.currentTime * 1000);
    this.seekVirtual(current >= this.durationMs - 30 ? 0 : current);
    const reportPlayError = (err) => {
      this.playing = false;
      console.error('Playback failed to start:', err);
      if (this.onError) this.onError(err);
    };
    this.screenVideo.play().catch(reportPlayError);
    if (this.camVideo) this.camVideo.play().catch(reportPlayError);
    this._loop();
  }

  pause() {
    this.playing = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this.screenVideo.pause();
    if (this.camVideo) this.camVideo.pause();
  }

  _loop() {
    if (!this.playing) return;
    const realMs = this.screenVideo.currentTime * 1000;
    // Truthy currentSeg always implies realMs < currentSeg.end (it's part of the
    // match predicate), so landing here means realMs has drifted past a segment
    // boundary (natural playback ran into a cutout, or the end of the trim).
    const inSegment = this.segments.some((s) => realMs >= s.start - 40 && realMs < s.end);
    if (!inSegment || this.screenVideo.ended) {
      const next = this.segments.find((s) => realMs < s.end);
      if (!next) {
        this.pause();
        this.seekVirtual(this.durationMs);
        if (this.onEnded) this.onEnded();
        return;
      }
      this.screenVideo.currentTime = next.start / 1000;
      if (this.camVideo) this.camVideo.currentTime = next.start / 1000;
    }

    this.drawFrame();
    const nowReal = this.screenVideo.currentTime * 1000;
    if (this.onTick) this.onTick(this.virtualTimeFor(nowReal), this.durationMs, nowReal);
    this._raf = requestAnimationFrame(() => this._loop());
  }
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Draws a video into a box using "cover" scaling (crop to fill, like CSS object-fit: cover).
function drawCoverVideo(ctx, video, x, y, w, h) {
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw || !vh) return;
  const scale = Math.max(w / vw, h / vh);
  const dw = vw * scale, dh = vh * scale;
  const dx = x + (w - dw) / 2, dy = y + (h - dh) / 2;
  ctx.drawImage(video, dx, dy, dw, dh);
}

window.CompositorEngine = Engine;
window.CompositorUtil = { buildSegments, totalDuration, normalizeCutouts };
