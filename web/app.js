import { todayId, formatDate } from './util.js';
import { listDays, ensureDay } from './db.js';

const stackEl = document.getElementById('folderStack');

async function render() {
  // Ensure today exists
  await ensureDay(todayId());
  const days = await listDays(30);

  stackEl.innerHTML = '';
  for (const d of days) {
    const el = document.createElement('a');
    el.className = 'folder-edge';
    el.href = `./day.html?date=${encodeURIComponent(d.id)}`;
    el.innerHTML = `<span class="date">${formatDate(d.id)}</span><span class="count"></span>`;
    stackEl.appendChild(el);
  }
}

render().catch(console.error);
