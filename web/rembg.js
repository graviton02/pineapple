import { MODAL_BASE_URL } from './config.js';

const REMBG_URL = `${MODAL_BASE_URL}/remove?model=isnet-general-use`;

export async function warmRembg() {
  try {
    const r = await fetch(`${MODAL_BASE_URL}/healthz`, { cache: 'no-store' });
    console.log('[rembg] warm', r.ok);
  } catch (e) {
    console.warn('[rembg] warm failed', e);
  }
}

export async function removeBackground(file) {
  console.log("[rembg] start", { name: file.name, size: file.size });
  const form = new FormData();
  form.append('file', file);
  console.time("[rembg] total");
  console.time("[rembg] fetch");
  const res = await fetch(REMBG_URL, { method: 'POST', body: form });
  console.timeEnd("[rembg] fetch");
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error("[rembg] http error", res.status, errText);
    throw new Error(`rembg failed: ${res.status} ${errText}`);
  }
  const imageId = res.headers.get('x-image-id') || null;
  const ctype = res.headers.get('content-type') || '';
  if (!ctype.includes('image/')) {
    const msg = await res.text().catch(() => "");
    console.error("[rembg] non-image response", { contentType: ctype, body: msg });
    throw new Error(`rembg returned non-image: ${ctype} ${msg}`);
  }
  const blob = await res.blob();
  console.log("[rembg] blob", { type: blob.type, size: blob.size, imageId });
  console.timeEnd("[rembg] total");
  return { blob, url: URL.createObjectURL(blob), imageId };
}
