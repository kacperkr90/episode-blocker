// Runs on supported sites. When the page shows a video, asks the background worker to
// spend one episode from the shared quota; if none is left, replaces the page with the lock page.
(() => {
  let lastHref = location.href;
  let chain = Promise.resolve();
  let leaving = false;
  let orphanSince = 0;

  // False once the extension was reloaded/updated/disabled: this copy of the script is then
  // cut off from it and can neither count nor lock.
  const alive = () => { try { return !!chrome.runtime.id; } catch (e) { return false; } };
  const onVideoPage = () => !!videoKey(new URL(location.href));

  function goLocked() {
    leaving = true;
    document.querySelectorAll('video').forEach((v) => v.pause());
    // replace() drops the video page from history, so "Back" goes to the page before it.
    location.replace(chrome.runtime.getURL('locked.html') + '?return=' + encodeURIComponent(location.href));
  }

  async function check() {
    if (leaving || !alive()) return;                   // cut off: handled by the timer below
    const id = videoKey(new URL(location.href));
    if (!id) return;                                   // browsing page: nothing to do

    let res = null;
    try {
      res = await chrome.runtime.sendMessage({ type: 'claim', id });
    } catch (e) {
      if (!alive()) return;
      console.error('[EpisodeLimiter]', e);
    }
    if (res && res.allow) return;
    goLocked();                                        // no permission (or no answer) = locked
  }

  function schedule() {
    chain = chain.then(check).catch((e) => console.error('[EpisodeLimiter]', e));
  }

  setInterval(() => {
    if (leaving) return;

    if (!alive()) {
      // Extension was reloaded or updated. On a video page, reload so the current version
      // takes over and counts or locks it. Wait a moment so the new version has finished loading.
      if (!onVideoPage()) { orphanSince = 0; return; }
      if (!orphanSince) orphanSince = Date.now();
      else if (Date.now() - orphanSince > 1500) { leaving = true; location.reload(); }
      return;
    }

    // SPA navigation (Netflix, Disney+, YouTube) doesn't reload the page: poll the URL.
    if (location.href !== lastHref) { lastHref = location.href; schedule(); }
  }, 300);

  // Parent changed something (lock now, pause, quota): re-check this tab.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[STATE_KEY]) schedule();
  });

  schedule();
})();
