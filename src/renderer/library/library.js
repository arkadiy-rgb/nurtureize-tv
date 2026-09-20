const api = window.nurtureize;

const folderPathEl = document.getElementById('folderPath');
const changeFolderBtn = document.getElementById('changeFolderBtn');
const recordBtn = document.getElementById('recordBtn');
const gridEl = document.getElementById('grid');
const emptyEl = document.getElementById('empty');

async function refreshFolder() {
  folderPathEl.textContent = await api.invoke('folder:get');
}

changeFolderBtn.addEventListener('click', async () => {
  await api.invoke('folder:choose');
  refreshFolder();
});

recordBtn.addEventListener('click', async () => {
  await api.invoke('control-bar:open');
});

function formatDuration(ms) {
  const totalSec = Math.round((ms || 0) / 1000);
  const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const ss = String(totalSec % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function sourceIcon(kind) {
  if (kind === 'window') return '🪟';
  if (kind === 'region') return '⬚';
  return '🖥';
}

async function refreshRecordings() {
  const items = await api.invoke('recordings:list');
  gridEl.innerHTML = '';
  emptyEl.classList.toggle('hidden', items.length > 0);

  items.forEach((rec) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="thumb">
        <span>${sourceIcon(rec.sourceKind)}${rec.hasCamera ? ' 🎥' : ''}</span>
        <span class="duration">${formatDuration(rec.durationMs)}</span>
      </div>
      <div class="card-body">
        <div class="card-title" title="${escapeHtml(rec.title)}">${escapeHtml(rec.title)}</div>
        <div class="card-meta">${formatDate(rec.createdAt)}${rec.hasExport ? ' &middot; exported' : ''}</div>
      </div>
      <div class="card-actions">
        <button class="pill-btn primary" data-action="edit">Edit</button>
        <button class="icon-btn" data-action="reveal" title="Show in folder">📁</button>
        <button class="icon-btn" data-action="delete" title="Delete">🗑</button>
      </div>
    `;
    card.querySelector('[data-action="edit"]').addEventListener('click', () => api.invoke('editor:open', rec.id));
    card.querySelector('[data-action="reveal"]').addEventListener('click', () => api.invoke('recording:reveal', rec.id));
    card.querySelector('[data-action="delete"]').addEventListener('click', async () => {
      if (confirm(`Delete "${rec.title}"? This can't be undone.`)) {
        await api.invoke('recording:delete', rec.id);
        refreshRecordings();
      }
    });
    gridEl.appendChild(card);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

api.on('library:refresh', () => { refreshFolder(); refreshRecordings(); });

refreshFolder();
refreshRecordings();
