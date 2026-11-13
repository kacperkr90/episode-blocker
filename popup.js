const $ = (id) => document.getElementById(id);
localizePage();

const MAX = 50;
let unlocked = false;   // password entered in this popup; forgotten when the popup closes
let dirty = false;      // the parent is editing the exact number: don't overwrite it
let msgTimer = 0;

const clamp = (n) => Math.min(MAX, Math.max(0, n || 0));
const timeOf = (ms) => new Date(ms).toLocaleTimeString(chrome.i18n.getUILanguage(), { hour: '2-digit', minute: '2-digit' });
const failText = (r) => (r.wait ? t('tooManyTries', r.wait) : t('wrongPassword'));

function say(text) {
  $('msg').textContent = text;
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => { $('msg').textContent = ''; }, 3000);
}

async function render() {
  const s = await getState();
  const paused = isPaused(s);
  const left = s.remaining || 0;
  $('setup').hidden = !!s.hash;
  $('login').hidden = !s.hash || unlocked;
  $('controls').hidden = !s.hash || !unlocked;
  $('state').textContent = !s.hash ? t('noPassword')
    : paused ? t('noLimitUntil', timeOf(s.pausedUntil))
    : left > 0 ? t('remaining', left) : t('noEpisodesLeft');
  $('pause').textContent = paused ? t('restoreLimit') : t('noLimitUntil', timeOf(nextPauseEnd(Date.now())));
  if (!dirty) $('n').value = left;
  if (!$('login').hidden) $('pw').focus();
}

async function update(change) {
  const s = await getState();
  change(s);
  await setState(s);
  dirty = false;
  say(t('saved'));
  render();
}

$('setup').addEventListener('submit', async (e) => {
  e.preventDefault();
  const a = $('pw1').value, b = $('pw2').value;
  if (a.length < MIN_PASSWORD) { $('setupErr').textContent = t('passwordTooShort'); return; }
  if (a !== b) { $('setupErr').textContent = t('passwordsDiffer'); return; }
  await savePassword(a);
  unlocked = true;   // just created: go straight to the controls
  render();
});

$('login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const r = await tryPassword($('pw').value);
  $('pw').value = '';
  $('loginErr').textContent = r.ok ? '' : failText(r);
  if (!r.ok) return;
  unlocked = true;
  render();
});

document.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () =>
  update((s) => { s.remaining = clamp((s.remaining || 0) + Number(b.dataset.add)); })));

$('dec').addEventListener('click', () => { dirty = true; $('n').value = clamp(parseInt($('n').value, 10) - 1); });
$('inc').addEventListener('click', () => { dirty = true; $('n').value = clamp(parseInt($('n').value, 10) + 1); });
$('n').addEventListener('input', () => { dirty = true; });

$('exact').addEventListener('submit', (e) => {
  e.preventDefault();
  const n = clamp(parseInt($('n').value, 10));
  update((s) => { s.remaining = n; });
});

// Lock now: no episodes left, no pause, and videos that are already playing get locked too.
$('lockNow').addEventListener('click', () => update((s) => {
  s.remaining = 0;
  s.pausedUntil = 0;
  s.epoch = (s.epoch || 0) + 1;
}));

$('pause').addEventListener('click', () => update((s) => {
  if (isPaused(s)) {
    s.pausedUntil = 0;
    s.epoch = (s.epoch || 0) + 1;   // limit back on: videos that are open now must be paid for (or get locked)
  } else {
    s.pausedUntil = nextPauseEnd(Date.now());
  }
}));

// Keep the count current while the popup is open (a video in another tab may use an episode).
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[STATE_KEY]) render();
});

$('ver').textContent = t('version', chrome.runtime.getManifest().version);
render();
