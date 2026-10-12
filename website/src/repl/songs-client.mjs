const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL.slice(0, -1) : import.meta.env.BASE_URL;

async function request(pathname, options) {
  const response = await fetch(`${base}${pathname}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || 'Song request failed');
  }
  return body;
}

export function fetchSongs() {
  return request('/api/songs');
}

export function fetchSong(id) {
  return request(`/api/songs/${encodeURIComponent(id)}`);
}

export function songIdFromLocation() {
  return new URL(window.location.href).searchParams.get('song') || '';
}

export function songShareUrl(id) {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('song', id);
  return url.toString();
}

export function setSongUrl(id) {
  const url = new URL(songShareUrl(id));
  window.history.replaceState(null, '', `${url.pathname}${url.search}`);
}

export function saveSong(song) {
  return request('/api/songs', { method: 'POST', body: JSON.stringify(song) });
}

export function createSongDirectory(directory) {
  return request('/api/songs/directories', { method: 'POST', body: JSON.stringify(directory) });
}
