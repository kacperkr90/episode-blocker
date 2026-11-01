const $ = (id) => document.getElementById(id);

function msg(text, ok) {
  $('msg').textContent = text;
  $('msg').className = ok ? 'ok' : '';
}

async function render() {
  const s = await getState();
  const enabled = s.enabled !== false;   // default: blocking ON
  $('setup').hidden = !!s.hash;
  $('manage').hidden = !s.hash;
  $('state').textContent = s.hash ? `Blokada: ${enabled ? 'WŁĄCZONA' : 'WYŁĄCZONA'}` : '';
  $('state').className = enabled ? 'on' : 'off';
  $('status').textContent = s.hash
    ? `Pozostało odcinków: ${s.remaining || 0}`
    : 'Nie ustawiono hasła.';
  $('toggle').textContent = enabled ? 'Wyłącz blokadę' : 'Włącz blokadę';
}

$('setup').addEventListener('submit', async (e) => {
  e.preventDefault();
  const a = $('pw1').value, b = $('pw2').value;
  if (a.length < 4) return msg('Użyj co najmniej 4 znaków');
  if (a !== b) return msg('Hasła nie są takie same');
  await savePassword(a);
  msg('Zapisano', true);
  render();
});

$('toggle').addEventListener('click', async () => {
  if (!(await checkPassword($('pw').value))) return msg('Błędne hasło');
  const s = await getState();
  s.enabled = s.enabled === false;   // flip
  // Turning blocking back ON: videos that are open now must be paid for (or get locked).
  if (s.enabled) s.epoch = (s.epoch || 0) + 1;
  await setState(s);
  $('pw').value = '';
  msg(s.enabled ? 'Blokada włączona' : 'Blokada wyłączona', true);
  render();
});

$('manage').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!(await checkPassword($('pw').value))) return msg('Błędne hasło');
  const n = Math.max(0, parseInt($('n').value, 10) || 0);
  const s = await getState();
  s.remaining = n;
  if (n === 0) s.epoch = (s.epoch || 0) + 1;   // lock now, including videos already playing
  await setState(s);
  $('pw').value = '';
  msg('Zaktualizowano', true);
  render();
});

$('ver').textContent = 'wersja ' + chrome.runtime.getManifest().version;
render();
