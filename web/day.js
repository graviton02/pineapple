import { ensureDay, itemsByDay, addItem, updateItem } from './db.js';
import { todayId, uuid, clamp } from './util.js';
import { removeBackground, warmRembg } from './rembg.js';

const params = new URLSearchParams(location.search);
const dayId = params.get('date') || todayId();

const titleEl = document.getElementById('dayTitle');
const canvasEl = document.getElementById('canvas');
const fabEl = document.getElementById('fab');
const sheetEl = document.getElementById('sheet');
const badgeEl = document.getElementById('badge');
const inputCam = document.getElementById('inputCamera');
const inputGal = document.getElementById('inputGallery');

// Size multiplier relative to current baseline (~1/12th screen area)
const SIZE_MULT = 2;

titleEl.textContent = dayId;

console.log('[day] init', { dayId });
await ensureDay(dayId);
// Warm the backend (non-blocking)
warmRembg().catch(() => {});
await loadItems();

fabEl.addEventListener('click', () => {
  sheetEl.classList.toggle('visible');
});

document.getElementById('btnCamera').addEventListener('click', () => inputCam.click());
document.getElementById('btnGallery').addEventListener('click', () => inputGal.click());

for (const input of [inputCam, inputGal]) {
  input.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    console.log('[day] file selected', { name: file.name, size: file.size });
    sheetEl.classList.remove('visible');
    showBadge(true);
    try {
      const { blob, url, imageId } = await removeBackground(file);
      console.log('[day] rembg ok, creating image');
      console.time('[day] image decode');
      const image = await createImage(url);
      console.timeEnd('[day] image decode');
      const item = makeItem(image, { blob, imageId });
      console.log('[day] item', item);
      await addItem(item);
      renderItem(item);
    } catch (err) {
      console.error('[day] error flow', err);
      alert('Failed to process image. See console for details.');
    } finally {
      showBadge(false);
      e.target.value = '';
    }
  });
}

function showBadge(v) { badgeEl.classList.toggle('visible', v); }

async function loadItems() {
  const items = await itemsByDay(dayId);
  console.log('[day] load items', items.length);
  items.forEach((item) => {
    if (item.cutoutBlob) {
      try { if (item.cutoutUrl) URL.revokeObjectURL(item.cutoutUrl); } catch {}
      item.cutoutUrl = URL.createObjectURL(item.cutoutBlob);
    }
    if (!item.baseWidth) {
      const rect = canvasEl.getBoundingClientRect();
      const aspect = (item.natural?.w || 200) / Math.max(1, (item.natural?.h || 200));
      const targetArea = (rect.width * rect.height) / 12; // baseline area
      let baseWidth = Math.sqrt(targetArea * aspect) * SIZE_MULT; // doubled size
      baseWidth = clamp(baseWidth, 100, rect.width * 0.7);
      item.baseWidth = baseWidth;
      if (!item.scale) item.scale = 1;
    }
    renderItem(item);
  });
}

function makeItem(img, extras = {}) {
  const rect = canvasEl.getBoundingClientRect();
  const margin = 30;
  const x = Math.random() * (rect.width - margin * 2) + margin;
  const y = Math.random() * (rect.height - margin * 2) + margin;
  const aspect = img.naturalWidth / Math.max(1, img.naturalHeight);
  const targetArea = (rect.width * rect.height) / 12; // baseline area
  let baseWidth = Math.sqrt(targetArea * aspect) * SIZE_MULT; // doubled size
  baseWidth = clamp(baseWidth, 100, rect.width * 0.7);
  const rotation = (Math.random() - 0.5) * 10;
  return {
    id: uuid(),
    dayId,
    cutoutUrl: img.src,
    cutoutBlob: extras.blob || null,
    backendId: extras.imageId || null,
    position: { x, y },
    scale: 1,               // scale relative to baseWidth
    baseWidth,
    rotation,
    zIndex: Date.now(),
    createdAt: Date.now(),
    natural: { w: img.naturalWidth, h: img.naturalHeight },
  };
}

function renderItem(item) {
  try {
    const el = document.createElement('img');
    el.src = item.cutoutUrl;
    el.className = 'item';
    el.style.zIndex = item.zIndex;
    el.style.width = `${(item.baseWidth || 200) * (item.scale || 1)}px`;
    setTransform(el, item);
    canvasEl.appendChild(el);
    enableGestures(el, item);
    console.log('[day] rendered item', item.id);
  } catch (e) {
    console.error('[day] renderItem failed', e, item);
  }
}

function setTransform(el, item) {
  el.style.transform = `translate(${item.position.x}px, ${item.position.y}px) rotate(${item.rotation}deg)`; // size via width
}

function enableGestures(el, item) {
  let active = false;
  let startX = 0, startY = 0;
  let startPosX = 0, startPosY = 0;
  let pointers = new Map();
  let startDist = 0, startScale = 1;

  el.style.touchAction = 'none';

  const onPointerDown = (ev) => {
    active = true;
    el.setPointerCapture(ev.pointerId);
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    startX = ev.clientX; startY = ev.clientY;
    startPosX = item.position.x; startPosY = item.position.y;
    startScale = item.scale || 1;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      startDist = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };

  const onPointerMove = async (ev) => {
    if (!active) return;
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const factor = dist / (startDist || dist);
      item.scale = clamp(startScale * factor, 0.3, 3);
      el.style.width = `${(item.baseWidth || 200) * item.scale}px`;
    } else {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      item.position.x = startPosX + dx;
      item.position.y = startPosY + dy;
      setTransform(el, item);
    }
  };

  const onPointerUp = async (ev) => {
    pointers.delete(ev.pointerId);
    if (pointers.size === 0) active = false;
    await updateItem(item);
  };

  el.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
}

function createImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => {
      console.error('[day] image load error', e, url);
      reject(e);
    };
    img.src = url;
  });
}
