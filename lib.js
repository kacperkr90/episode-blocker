// Shared helpers: site detection, state storage, translations and password hashing (PBKDF2 via Web Crypto).
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
// { salt, hash, remaining, pausedUntil, epoch }
// pausedUntil: time (ms) until which videos play without using episodes ("No limit until 3:00").
// epoch: bumped when the parent forces a lock, so already-paid videos must be paid again.

async function getState() {
  const r = await chrome.storage.local.get(STATE_KEY);
  return r[STATE_KEY] || {};
}

async function setState(s) {
  await chrome.storage.local.set({ [STATE_KEY]: s });
}

// A pause ends at 3:00 at night, not at midnight, so a late evening isn't cut short.
const PAUSE_END_HOUR = 3;

function nextPauseEnd(now) {
  const d = new Date(now);
  d.setHours(PAUSE_END_HOUR, 0, 0, 0);
  if (d.getTime() <= now) d.setDate(d.getDate() + 1);
  return d.getTime();
}

function isPaused(s, now = Date.now()) {
  return (s.pausedUntil || 0) > now;
}

// ---- Translations --------------------------------------------------------------
// Strings live in _locales/<lang>/messages.json; Chrome picks the language from its UI language.

function t(key, ...subs) {
  return chrome.i18n.getMessage(key, subs.map(String)) || key;
}

// Fills every element marked with data-i18n="key" on extension pages (popup, lock page).
function localizePage() {
  document.documentElement.lang = chrome.i18n.getUILanguage().split('-')[0];
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
}

// ---- Password ------------------------------------------------------------------

const MIN_PASSWORD = 6;
const GUARD_KEY = 'guard';   // chrome.storage.local: { fails, until } — wrong attempts in a row, next allowed try
const FREE_TRIES = 3;

// Wait after `fails` wrong attempts in a row: none for the first 3, then 30 s, doubling, at most 1 h.
function lockoutMs(fails) {
  return fails < FREE_TRIES ? 0 : Math.min(30000 * 2 ** (fails - FREE_TRIES), 3600000);
}

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

// checkPassword with a growing wait after wrong attempts, shared by the popup and the lock page.
// Returns { ok: true } or { ok: false, wait } where wait is in seconds (0 = may try again now).
async function tryPassword(pw) {
  const now = Date.now();
  const g = (await chrome.storage.local.get(GUARD_KEY))[GUARD_KEY] || { fails: 0, until: 0 };
  if (g.until > now) return { ok: false, wait: Math.ceil((g.until - now) / 1000) };
  if (await checkPassword(pw)) {
    if (g.fails) await chrome.storage.local.remove(GUARD_KEY);
    return { ok: true };
  }
  g.fails += 1;
  g.until = now + lockoutMs(g.fails);
  await chrome.storage.local.set({ [GUARD_KEY]: g });
  return { ok: false, wait: Math.ceil(lockoutMs(g.fails) / 1000) };
}
