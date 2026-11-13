// Single place that spends the shared quota. All tabs ask here, one request at a time,
// so two tabs can never spend the same episode or charge each other.
importScripts('lib.js');

const PAID = 'paid';   // chrome.storage.session: { [tabId]: { id, epoch } } — what each tab already paid for
let chain = Promise.resolve();

function serialize(fn) {
  const p = chain.then(fn);
  chain = p.catch(() => {});
  return p;
}

async function getPaid() {
  return (await chrome.storage.session.get(PAID))[PAID] || {};
}

async function claim(tabId, id) {
  const s = await getState();
  if (isPaused(s)) return { allow: true };                  // parent paused the limit

  const epoch = s.epoch || 0;
  const paid = await getPaid();
  const p = paid[tabId];
  if (p && p.id === id && p.epoch === epoch) return { allow: true };   // this tab already paid for it

  if (s.hash && (s.remaining || 0) > 0) {
    paid[tabId] = { id, epoch };
    await chrome.storage.session.set({ [PAID]: paid });
    s.remaining -= 1;
    await setState(s);
    return { allow: true };
  }
  return { allow: false };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'claim' || !sender.tab || sender.frameId !== 0) return false;
  const tabId = sender.tab.id;
  serialize(() => claim(tabId, String(msg.id))).then(
    sendResponse,
    (e) => { console.error('[EpisodeLimiter]', e); sendResponse({ allow: false }); }
  );
  return true;   // async response
});

// Versions before 2.4 had an on/off switch. "Off" becomes a pause until the next 3:00.
async function migrate() {
  const s = await getState();
  if (!('enabled' in s)) return;
  if (s.enabled === false) s.pausedUntil = nextPauseEnd(Date.now());
  delete s.enabled;
  await setState(s);
}

// Chrome doesn't add content scripts to tabs that are already open when the extension is
// installed, updated or reloaded, so those tabs would play freely. Reload them.
chrome.runtime.onInstalled.addListener(async () => {
  await serialize(migrate);
  const patterns = chrome.runtime.getManifest().content_scripts[0].matches;
  const tabs = await chrome.tabs.query({ url: patterns });
  for (const t of tabs) {
    if (!t.discarded) chrome.tabs.reload(t.id).catch(() => {});   // discarded tabs reload by themselves
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  serialize(async () => {
    const paid = await getPaid();
    if (paid[tabId]) { delete paid[tabId]; await chrome.storage.session.set({ [PAID]: paid }); }
  });
});
