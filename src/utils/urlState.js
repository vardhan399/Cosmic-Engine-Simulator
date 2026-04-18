// Encode/decode the full state to/from URL hash and localStorage.
// Uses base64 JSON — compact, URL-safe enough for hash fragment.

const LS_KEY = 'ulab_state_v1';

export function saveLocal(state) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) { /* quota */ }
}

export function loadLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

export function encodeURLState(state) {
  try {
    const json = JSON.stringify(state);
    return btoa(unescape(encodeURIComponent(json)));
  } catch (e) { return ''; }
}

export function decodeURLState() {
  try {
    const hash = window.location.hash;
    if (!hash || hash.length < 3) return null;
    const m = hash.match(/s=([^&]+)/);
    if (!m) return null;
    const json = decodeURIComponent(escape(atob(m[1])));
    return JSON.parse(json);
  } catch (e) { return null; }
}

export function shareURL(state) {
  const encoded = encodeURLState(state);
  const url = `${window.location.origin}${window.location.pathname}#s=${encoded}`;
  return url;
}
