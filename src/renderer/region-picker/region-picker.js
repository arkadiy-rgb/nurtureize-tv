const selectionEl = document.getElementById('selection');
const dimsEl = document.getElementById('dims');

let start = null;
let current = null;

function paramFloat(name, fallback) {
  const v = new URLSearchParams(location.search).get(name);
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}
const scale = paramFloat('scale', 1);

function rectFrom(a, b) {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

function render(rect) {
  if (!rect || rect.width < 4 || rect.height < 4) {
    selectionEl.style.display = 'none';
    dimsEl.style.display = 'none';
    return;
  }
  selectionEl.style.display = 'block';
  selectionEl.style.left = `${rect.x}px`;
  selectionEl.style.top = `${rect.y}px`;
  selectionEl.style.width = `${rect.width}px`;
  selectionEl.style.height = `${rect.height}px`;

  dimsEl.style.display = 'block';
  dimsEl.textContent = `${Math.round(rect.width * scale)} × ${Math.round(rect.height * scale)}`;
  dimsEl.style.left = `${rect.x}px`;
  dimsEl.style.top = `${Math.max(0, rect.y - 22)}px`;
}

window.addEventListener('mousedown', (e) => {
  start = { x: e.clientX, y: e.clientY };
  current = start;
  render(rectFrom(start, current));
});

window.addEventListener('mousemove', (e) => {
  if (!start) return;
  current = { x: e.clientX, y: e.clientY };
  render(rectFrom(start, current));
});

window.addEventListener('mouseup', () => {
  if (!start || !current) return;
  const rect = rectFrom(start, current);
  if (rect.width < 20 || rect.height < 20) {
    start = null;
    current = null;
    render(null);
    return;
  }
  submit(rect);
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    window.nurtureize.invoke('region:cancel');
  }
  if (e.key === 'Enter' && start && current) {
    submit(rectFrom(start, current));
  }
});

function submit(rect) {
  window.nurtureize.invoke('region:submit', {
    x: Math.round(rect.x * scale),
    y: Math.round(rect.y * scale),
    width: Math.round(rect.width * scale),
    height: Math.round(rect.height * scale),
    cssRect: rect,
    scale,
  });
}
