const $ = (id) => document.getElementById(id);

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
  if (s.enabled === false || (s.hash && (s.remaining || 0) > 0)) goBackToVideo();
}

async function init() {
  const s = await getState();
  $('nopw').hidden = !!s.hash;
  $('fields').hidden = !s.hash;
  // No automatic return on load: if the counter can't be reached, that would bounce forever.
}

$('unlock').addEventListener('submit', async (e) => {
  e.preventDefault();
  const n = parseInt($('n').value, 10);
  if (!(n >= 1)) { $('err').textContent = 'Wpisz co najmniej 1'; return; }
  if (!(await checkPassword($('pw').value))) { $('err').textContent = 'Błędne hasło'; return; }
  const s = await getState();
  s.remaining = n;
  await setState(s);
  $('pw').value = '';
  if (!returnUrl) $('err').textContent = 'Odblokowano. Otwórz film ponownie.';
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
