class TimelineUI {
  constructor(els, handlers) {
    this.els = els;
    this.handlers = handlers; // { onSeek, onTrimChange, onAddCutout }
    this.originalDurationMs = 1;
    this.mode = 'seek';
    this.dragCutoutStartPx = null;
    this.previewMark = null;

    this._bind();
  }

  setDuration(ms) { this.originalDurationMs = Math.max(ms, 1); }

  msToPx(ms) {
    const w = this.els.track.clientWidth;
    return (ms / this.originalDurationMs) * w;
  }
  pxToMs(px) {
    const w = this.els.track.clientWidth;
    return Math.max(0, Math.min((px / w) * this.originalDurationMs, this.originalDurationMs));
  }

  render(project, currentRealMs) {
    const w = this.els.track.clientWidth;
    this.els.shadeLeft.style.width = `${this.msToPx(project.trim.start)}px`;
    this.els.shadeRight.style.width = `${w - this.msToPx(project.trim.end)}px`;
    this.els.trimStartHandle.style.left = `${this.msToPx(project.trim.start)}px`;
    this.els.trimEndHandle.style.left = `${this.msToPx(project.trim.end) - 14}px`;
    this.els.playhead.style.left = `${this.msToPx(currentRealMs)}px`;

    this.els.cutoutLayer.innerHTML = '';
    project.cutouts.forEach((c, i) => {
      const mark = document.createElement('div');
      mark.className = 'cutout-mark';
      mark.style.left = `${this.msToPx(c.start)}px`;
      mark.style.width = `${Math.max(2, this.msToPx(c.end) - this.msToPx(c.start))}px`;
      mark.dataset.index = i;
      this.els.cutoutLayer.appendChild(mark);
    });
  }

  enterCutoutMode() { this.mode = 'cutout'; }

  _bind() {
    const { track, trimStartHandle, trimEndHandle } = this.els;

    trimStartHandle.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      this._dragTrim('start');
    });
    trimEndHandle.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      this._dragTrim('end');
    });

    track.addEventListener('mousedown', (e) => {
      if (e.target === trimStartHandle || e.target === trimEndHandle) return;
      const rect = track.getBoundingClientRect();
      const startPx = e.clientX - rect.left;

      if (this.mode === 'cutout') {
        this._dragCutout(startPx, rect);
      } else {
        this.handlers.onSeek(this.pxToMs(startPx));
      }
    });
  }

  _dragTrim(which) {
    const move = (e) => {
      const rect = this.els.track.getBoundingClientRect();
      const ms = this.pxToMs(e.clientX - rect.left);
      this.handlers.onTrimChange(which, ms);
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  _dragCutout(startPx, rect) {
    const preview = document.createElement('div');
    preview.className = 'cutout-mark';
    preview.style.left = `${startPx}px`;
    preview.style.width = '0px';
    this.els.cutoutLayer.appendChild(preview);

    const move = (e) => {
      const px = e.clientX - rect.left;
      const left = Math.min(startPx, px);
      const width = Math.abs(px - startPx);
      preview.style.left = `${left}px`;
      preview.style.width = `${width}px`;
    };
    const up = (e) => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      preview.remove();
      const endPx = e.clientX - rect.left;
      const a = this.pxToMs(Math.min(startPx, endPx));
      const b = this.pxToMs(Math.max(startPx, endPx));
      this.mode = 'seek';
      if (b - a > 100) this.handlers.onAddCutout(a, b);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }
}

window.TimelineUI = TimelineUI;
