const $ = (id) => document.getElementById(id);
localizePage();

function msg(text, ok) {
  $('msg').textContent = text;
  $('msg').className = ok ? 'ok' : '';
}

async function render() {
  const s = await getState();
  const enabled = s.enabled !== false;   // default: blocking ON
  $('setup').hidden = !!s.hash;
  $('manage').hidden = !s.hash;
  $('state').textContent = s.hash ? t(enabled ? 'blockingOn' : 'blockingOff') : '';
  $('state').className = enabled ? 'on' : 'off';
  $('status').textContent = s.hash
    ? t('remaining', s.remaining || 0)
    : t('noPassword');
  $('toggle').textContent = t(enabled ? 'turnBlockingOff' : 'turnBlockingOn');
}

$('setup').addEventListener('submit', async (e) => {
  e.preventDefault();
  const a = $('pw1').value, b = $('pw2').value;
  if (a.length < 4) return msg(t('passwordTooShort'));
  if (a !== b) return msg(t('passwordsDiffer'));
  await savePassword(a);
  msg(t('saved'), true);
  render();
});

$('toggle').addEventListener('click', async () => {
  if (!(await checkPassword($('pw').value))) return msg(t('wrongPassword'));
  const s = await getState();
  s.enabled = s.enabled === false;   // flip
  // Turning blocking back ON: videos that are open now must be paid for (or get locked).
  if (s.enabled) s.epoch = (s.epoch || 0) + 1;
  await setState(s);
  $('pw').value = '';
  msg(t(s.enabled ? 'blockingTurnedOn' : 'blockingTurnedOff'), true);
  render();
});

$('manage').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!(await checkPassword($('pw').value))) return msg(t('wrongPassword'));
  const n = Math.max(0, parseInt($('n').value, 10) || 0);
  const s = await getState();
  s.remaining = n;
  if (n === 0) s.epoch = (s.epoch || 0) + 1;   // lock now, including videos already playing
  await setState(s);
  $('pw').value = '';
  msg(t('updated'), true);
  render();
});

$('ver').textContent = t('version', chrome.runtime.getManifest().version);
render();
