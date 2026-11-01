---
type: architecture
title: Episode quota and claim accounting
description: How the extension spends one unit of the shared episode quota per video page — the claim message from the content script, serialized accounting in the background worker, per-tab paid records keyed by video and epoch, and fail-closed locking.
tags: [quota, claim, background, content-script, storage, epoch]
verified:
  - by: openwiki/0.7.2
    at: 2026-11-01T12:05:30.576Z
sources:
  - id: openwiki-source-f22365b596e25ba4bf7c6003
    resource: repo://background.js
  - id: openwiki-source-33784e8411f34531e1834579
    resource: repo://content.js
  - id: openwiki-source-ac1612f5b3f29b4158b7f5dd
    resource: repo://lib.js
  - id: openwiki-source-05a2d846482ced23f1fd99f1
    resource: repo://locked.js
  - id: openwiki-source-dda1dc9054b73bb09bf02f85
    resource: repo://popup.js
generated: { by: "claude-code", at: "2026-11-01T11:23:59.117Z" }
---

# Episode quota and claim accounting

The extension's main job is to count episodes. A parent gives the child a number of
episodes/videos (`remaining`). Each time a tab opens a new video page, one episode is
spent. When none are left, the tab is sent to the lock page. All of that accounting
happens in one place, the background service worker
([background.js](../../background.js)). Content scripts only ask it for permission.

## Actors and state

| Piece | Where | Role |
|---|---|---|
| `check()` / `schedule()` | [content.js](../../content.js) | Detects a video page and asks for a claim; navigates to the lock page if refused. |
| `claim(tabId, id)` | [background.js](../../background.js) | Decides allow/deny and spends quota. |
| `state` (`STATE_KEY`) | `chrome.storage.local` | `{ salt, hash, remaining, enabled, epoch }`, read and written through `getState`/`setState` in [lib.js](../../lib.js). |
| `paid` | `chrome.storage.session` | `{ [tabId]: { id, epoch } }`: the video each tab has already paid for, and in which epoch. |

`chrome.storage.session` is cleared when the browser closes, so paid records do not
outlive the session. The quota itself (`remaining`) lives in `local` storage and persists.

## Claim flow

1. **Trigger.** The content script calls `schedule()` in three cases: once at startup, whenever
   the polled `location.href` changes (SPA navigation, checked every 300 ms), and whenever
   `state` changes in `chrome.storage.local`. Checks are chained on a promise, so they run
   one at a time within a tab.
2. **Detect.** `check()` computes `videoKey(new URL(location.href))`. A null key means a
   browsing page, and nothing happens. See [site detection](../concepts/site-detection.md).
3. **Ask.** It sends `{ type: 'claim', id }` with `chrome.runtime.sendMessage`.
4. **Filter.** The background listener ignores messages that are not `claim`, that come from
   outside a tab, or that come from a subframe (`sender.frameId !== 0`). Only top-level pages
   can spend quota.
5. **Serialize.** Each claim runs through `serialize()`, a module-level promise chain. Claims from
   all tabs are therefore processed strictly one after another, so two tabs can never spend the
   same last episode at once. A failed task does not break the chain, because the chain continues from `p.catch(() => {})`.
6. **Decide** (`claim`):
   - `enabled === false` → allow and charge nothing. The parent has switched blocking off.
   - `paid[tabId]` matches both `id` and the current `epoch` → allow and charge nothing. This tab
     already paid for this video, which covers the re-checks triggered by storage changes and repeated
     URL polls.
   - a password is set (`hash`) and `remaining > 0` → write `paid[tabId] = { id, epoch }`,
     decrement `remaining`, save, allow.
   - otherwise → deny.
7. **Act.** If the response is `allow`, the content script does nothing. In every other case
   (deny, an exception, or no answer) it calls `goLocked()`. That pauses all `<video>`
   elements and does `location.replace()` to `locked.html?return=<url>`.

### Consequences worth knowing

- **One paid video per tab.** `paid` stores only the latest video for each tab. Opening video B in a
  tab replaces A's record, so going back to A costs another episode.
- **The same video in two tabs costs twice.** Paid records are keyed by tab, not by video.
- **No password means locked.** Until a parent sets a password, `hash` is absent and every
  video page is denied, unless blocking has been explicitly disabled.
- **Fail closed.** If the worker throws, it replies `{ allow: false }`. If the message
  itself fails while the extension is still alive, the content script locks anyway. The one
  exception is an orphaned content script after an extension reload. That case is handled by the
  self-reload timer described in [extension lifecycle](../operations/extension-lifecycle.md).

## Epoch: forcing re-payment

`epoch` is a counter in `state`. A paid record is valid only while its `epoch` equals the
current one. The popup bumps it in two cases ([popup.js](../../popup.js)):

- the parent sets remaining to `0` ("lock now");
- the parent turns blocking back **on** after it was off.

The bump changes `state`, so every open content script re-checks through its
`storage.onChanged` listener. Their paid records are now stale, so each tab currently on a video
page must spend a new episode or get locked. That is how "lock now" stops videos that are
already playing.

Setting a positive count from the popup or the lock page does **not** bump the epoch, so
tabs that already paid keep playing.

## Tab cleanup

`chrome.tabs.onRemoved` deletes the closed tab's entry from `paid`. This also goes through
`serialize()`, so it cannot interleave with a claim's read-modify-write.

## Caveat: writes outside the queue

Only claims and tab cleanup go through the background queue. The popup and the lock page
change `state` directly with `getState`/`setState`. If a parent's write lands between a
claim's `getState()` and `setState()`, one of the two writes can be lost. This is a narrow
window and does not matter in practice, but keep it in mind before adding more writers of
`remaining`.
