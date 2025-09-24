export function todayId() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

export function formatDate(id) {
  const d = new Date(id);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function uuid() {
  return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
  );
}

export function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
