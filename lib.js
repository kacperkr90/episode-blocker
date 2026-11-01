// Shared helpers: site detection, state storage and password hashing (PBKDF2 via Web Crypto).
// Loaded by the content script, background worker, popup and lock page.
const STATE_KEY = 'state';

// ---- Supported sites -------------------------------------------------------
// Each entry: name, manifest match patterns, host regex, and id(URL) returning the video ID
// on that page, or null. After changing `matches`, run `node tools/sync-manifest.js`.

function pathMatch(u, re) {
  const m = u.pathname.match(re);
  return m ? m[1] : null;
}

// YouTube & YouTube Kids: /watch?v=ID, /shorts/ID, /live/ID, /embed/ID
function youtubeId(u) {
  return u.pathname === '/watch'
    ? u.searchParams.get('v')
    : pathMatch(u, /^\/(?:shorts|live|embed)\/([\w-]{6,})/);
}

// TVP VOD:
//   episode:      /seriale,18/ranczo-odcinki,316445/odcinek-1,S01E01,381046   -> 381046
//   film / live:  /filmy-dokumentalne,163/some-title,339667, /live,1/tvp-abc,…  -> last number
//   not counted:  /dla-dzieci,24 (category), /dla-dzieci,24/odo-odcinki,1167432 (series page),
//                 …-odcinki,316445/sezon-1,… (season list)
function tvpId(u) {
  const p = u.pathname.replace(/\/+$/, '');
  let m = p.match(/^\/[\w-]+,\d+\/[\w-]+-odcinki,\d+\/(?!sezon)[^/]+,(\d+)$/);
  if (m) return m[1];
  m = p.match(/^\/[\w-]+,\d+\/([\w-]+),(\d+)$/);
  if (m && !m[1].endsWith('-odcinki')) return m[2];
  return null;
}

const SITES = [
  {
    name: 'Netflix',
    matches: ['https://*.netflix.com/*'],
    host: /(^|\.)netflix\.com$/,
    id: (u) => pathMatch(u, /\/watch\/(\d+)/),
  },
  {
    name: 'Disney+',
    matches: ['https://*.disneyplus.com/*'],
    host: /(^|\.)disneyplus\.com$/,
    id: (u) => pathMatch(u, /\/(?:play|video)\/([\w-]+)/),
  },
  {
    name: 'YouTube',
    matches: ['https://*.youtube.com/*'],
    host: /(^|\.)youtube\.com$/,
    id: youtubeId,
  },
  {
    name: 'YouTube Kids',
    matches: ['https://*.youtubekids.com/*'],
    host: /(^|\.)youtubekids\.com$/,
    id: youtubeId,
  },
  {
    name: 'CDA',
    matches: ['https://*.cda.pl/*'],
    host: /(^|\.)cda\.pl$/,
    id: (u) => pathMatch(u, /^\/video\/([0-9a-z]+)/i),   // /video/ID[/vfilm]
  },
  {
    name: 'TVP VOD',
    matches: ['https://vod.tvp.pl/*'],
    host: /^vod\.tvp\.pl$/,
    id: tvpId,
  },
];

function siteFor(u) {
  return SITES.find((s) => s.host.test(u.hostname)) || null;
}

// Key identifying the video on a page (same video on www./m. gives the same key), or null.
function videoKey(u) {
  const site = siteFor(u);
  const id = site ? site.id(u) : null;
  return id ? `${u.hostname.replace(/^(www|m)\./, '')}:${id}` : null;
}

// ---- State -------------------------------------------------------------------
// { salt, hash, remaining, enabled, epoch }
// epoch: bumped when the parent forces a lock, so already-paid videos must be paid again.

async function getState() {
  const r = await chrome.storage.local.get(STATE_KEY);
  return r[STATE_KEY] || {};
}

async function setState(s) {
  await chrome.storage.local.set({ [STATE_KEY]: s });
}

// ---- Password ------------------------------------------------------------------

function toB64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function fromB64(s) {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

async function hashPassword(pw, saltB64) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: fromB64(saltB64), iterations: 200000, hash: 'SHA-256' },
    key, 256
  );
  return toB64(bits);
}

async function savePassword(pw) {
  const s = await getState();
  s.salt = toB64(crypto.getRandomValues(new Uint8Array(16)));
  s.hash = await hashPassword(pw, s.salt);
  s.remaining = s.remaining || 0;
  await setState(s);
}

async function checkPassword(pw) {
  const s = await getState();
  if (!s.hash) return false;
  return (await hashPassword(pw, s.salt)) === s.hash;
}
