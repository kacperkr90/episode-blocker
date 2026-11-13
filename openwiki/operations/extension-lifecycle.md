---
type: operations
title: Install, update and reload behavior
description: How the extension keeps tabs covered across install, update and reload — reloading already-open supported tabs, self-reloading orphaned content scripts on video pages, SPA URL polling — plus how to load and manually test it.
tags: [operations, lifecycle, install, reload, content-script, testing]
sources:
  - id: openwiki-source-f22365b596e25ba4bf7c6003
    resource: repo://background.js
  - id: openwiki-source-33784e8411f34531e1834579
    resource: repo://content.js
  - id: openwiki-source-b25e71362ad2d0521bb4e04c
    resource: repo://manifest.json
  - id: openwiki-source-23775c3de52f3ab95a13cb8b
    resource: repo://README.md
  - id: openwiki-source-6827bfa6cc4545b673ce7dc4
    resource: repo://tests/lib.test.js
  - id: openwiki-source-667e11e637cd9f360199963b
    resource: repo://tests/locales.test.js
generated: { by: "claude-code", at: "2026-11-13T21:24:43.706Z" }
verified:
  - by: openwiki/0.7.2
    at: 2026-11-13T21:24:43.706Z
---

# Install, update and reload behavior

Chrome extensions lose control over tabs at a few lifecycle points. This extension
handles each of them on purpose, so that a child cannot get free playback by reloading or
updating the extension.

## Loading the extension

There is no build step and there are no dependencies. In `chrome://extensions`, turn on Developer mode,
choose **Load unpacked**, and select the repository folder, or the unzipped folder from a GitHub
release (see [checks, packaging and releases](build-and-release.md#installing-a-release)).
To update a release install, unzip the new version over the same folder and reload. Chrome
derives an unpacked extension's ID from its path, so the stored password and count are kept.
The version shown in the popup
footer comes from `manifest.json`'s `version` (currently `2.4.0`).

## Already-open tabs on install or update

Chrome does not inject content scripts into tabs that were open before the extension
was installed, updated or reloaded. Those tabs would play without limits. On
`chrome.runtime.onInstalled`, [background.js](../../background.js) queries every tab matching
`content_scripts[0].matches` from the manifest and reloads it. Discarded tabs are skipped,
because they reload by themselves when activated. Reload errors are ignored.

## Migrating stored state

Before reloading tabs, the same `onInstalled` handler runs `migrate()` through the claim queue
(`serialize`), so no claim can read `state` half-migrated. Versions before 2.4 stored an
`enabled` switch. If it was `false` (blocking off), `migrate()` turns it into a pause that ends
at the next 3:00 (`pausedUntil = nextPauseEnd(Date.now())`). In every case it deletes
`enabled`, so the migration runs only once. The password, `remaining` and `epoch` are kept.

## Orphaned content scripts

When the extension is reloaded or updated, the old copy of [content.js](../../content.js)
keeps running in the page but can no longer reach the extension. `alive()` tests this with
`chrome.runtime.id`, guarded by a try/catch. Such an orphan can neither claim nor lock.

The 300 ms interval timer handles it:

- On a **video page**, it records `orphanSince` the first time it notices, and once more than
  1.5 s have passed it calls `location.reload()`. The new extension version then injects a fresh
  content script, which counts the video or locks it. The delay gives the new version
  time to finish loading.
- On a **browsing page**, it does nothing and resets the timer, because there is nothing to protect.

`check()` also returns early when the script is orphaned, and a failed `sendMessage` from an
orphan does not lock the page. Locking is left to the reload path.

## Single-page navigation

Netflix, Disney+ and YouTube change pages without a full load. The content script polls
`location.href` every 300 ms and runs a new check when it changes. It is injected at
`document_start`, so the first check runs before the site's own scripts start the player.

## Service worker restarts

The MV3 service worker may be stopped while idle. Nothing the extension needs lives only in its
memory. Quota state is in `chrome.storage.local`, and paid records are in `chrome.storage.session`, which
survives worker restarts but is cleared when the browser closes. The in-memory `serialize`
chain only orders requests that are in flight.

## Manual testing checklist

`node --test` covers only pure helpers (video detection, the 3:00 pause end, the
wrong-password delay steps) and translation keys (see
[checks, packaging and releases](build-and-release.md)). Everything below needs a real browser.
After a change, reload the unpacked extension and check:

1. With no password set, opening a video on a supported site goes to the lock page.
2. After setting a password, the popup asks for it once and then shows the controls. Pressing
   Enter in the password field only opens the controls.
3. After +2 in the popup, two different videos play and the third is locked. Re-opening the
   current video in the same tab does not spend an episode.
4. "Lock now" locks an open, playing video at once.
5. "No limit until 3:00" lets everything play without spending episodes. "Turn the limit back
   on now" makes open videos pay again.
6. Three wrong passwords in a row, in the popup or on the lock page, start a 30-second wait.
   Closing and reopening the popup does not reset it.
7. Reloading the extension while a video tab is open reloads that tab within about 2 s.
8. Unlocking with +1 on the lock page returns to the video and spends one episode.
9. Updating from a version before 2.4 with blocking switched off shows a pause until 3:00.
10. With Chrome's UI language set to Polish, and again to English, the popup and lock page show
   translated text and no raw message keys (see [localization](../concepts/localization.md)).
