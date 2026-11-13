const $ = (id) => document.getElementById(id);
localizePage();

// The video page we were sent away from. Only return to supported sites over https.
const returnUrl = (() => {
  try {
    const u = new URL(new URLSearchParams(location.search).get('return'));
    return u.protocol === 'https:' && siteFor(u) ? u.href : null;
  } catch (e) {
    return null;
  }
})();

let returning = false;
function goBackToVideo() {
  if (returning || !returnUrl) return;
  returning = true;
  location.replace(returnUrl);   // the video page will spend one episode when it loads
}

// Leave automatically when the parent unlocks from the toolbar popup or switches blocking off.
async function maybeReturn() {
  const s = await getState();
  if (isPaused(s) || (s.hash && (s.remaining || 0) > 0)) goBackToVideo();
}

async function init() {
  const s = await getState();
  $('nopw').hidden = !!s.hash;
  $('fields').hidden = !s.hash;
  // No automatic return on load: if the counter can't be reached, that would bounce forever.
}

// Number of episodes to add, picked with the +1 / +2 / +3 buttons.
let count = 1;
document.querySelectorAll('[data-n]').forEach((b) => b.addEventListener('click', () => {
  count = Number(b.dataset.n);
  document.querySelectorAll('[data-n]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
}));

$('unlock').addEventListener('submit', async (e) => {
  e.preventDefault();
  const r = await tryPassword($('pw').value);
  $('pw').value = '';
  if (!r.ok) { $('err').textContent = r.wait ? t('tooManyTries', r.wait) : t('wrongPassword'); return; }
  $('err').textContent = '';
  const s = await getState();
  s.remaining = Math.min(50, (s.remaining || 0) + count);
  await setState(s);
  if (!returnUrl) $('err').textContent = t('unlockedReopen');
  goBackToVideo();
});

$('back').addEventListener('click', () => {
  if (history.length > 1) history.back();
  else if (returnUrl) location.replace(new URL(returnUrl).origin);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[STATE_KEY]) maybeReturn();
});

init();
