export const API = 'http://127.0.0.1:5000';

export const endpoints = {
  health: `${API}/api/v1/health_centers`,
  checkpoints: `${API}/api/v1/checkpoints`,
  roads: `${API}/api/v1/roads`,
  borders: `${API}/api/v1/border_crossings`,
};

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} fetching ${url}`);
  return res.json();
}

export const api = {
  getHealth: () => getJson(endpoints.health),
  getCheckpoints: () => getJson(endpoints.checkpoints),
  getRoads: () => getJson(endpoints.roads),
  getBorders: () => getJson(endpoints.borders),
};

export async function listUpdates(category) {
  const r = await fetch(`/api/admin_updates/list?category=${encodeURIComponent(category)}`, {
    credentials: "include"
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function postUpdate(payload) {
  const r = await fetch(`/api/admin_updates/update`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload)
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function bulkImport(category, { file, text }) {
  const url = `/api/admin_updates/bulk?category=${encodeURIComponent(category)}`;
  if (file) {
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch(url, { method: "POST", body: fd, credentials: "include" });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  } else {
    const r = await fetch(url, {
      method: "POST",
      body: text,
      credentials: "include"
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }
}