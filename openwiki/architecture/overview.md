---
type: architecture
title: Architecture overview
description: The four runtime contexts of the Episode Limit Manifest V3 extension (background worker, content script, popup, lock page), the shared lib.js helpers, and the storage areas and messages that connect them.
tags: [architecture, manifest-v3, chrome-extension, storage, messaging]
sources:
  - id: openwiki-source-c7a8e6c25b0da5055873aed3
    resource: repo://_locales/en/messages.json
  - id: openwiki-source-7a80b79a6fb3618cbfab08a2
    resource: repo://.github/workflows/build.yml
  - id: openwiki-source-f22365b596e25ba4bf7c6003
    resource: repo://background.js
  - id: openwiki-source-33784e8411f34531e1834579
    resource: repo://content.js
  - id: openwiki-source-ac1612f5b3f29b4158b7f5dd
    resource: repo://lib.js
  - id: openwiki-source-64cba43784b7a751100d3078
    resource: repo://locked.html
  - id: openwiki-source-05a2d846482ced23f1fd99f1
    resource: repo://locked.js
  - id: openwiki-source-b25e71362ad2d0521bb4e04c
    resource: repo://manifest.json
  - id: openwiki-source-6390fee3c395fd7746cec673
    resource: repo://popup.html
  - id: openwiki-source-dda1dc9054b73bb09bf02f85
    resource: repo://popup.js
  - id: openwiki-source-6827bfa6cc4545b673ce7dc4
    resource: repo://tests/lib.test.js
  - id: openwiki-source-667e11e637cd9f360199963b
    resource: repo://tests/locales.test.js
  - id: openwiki-source-395d1fa7dad02829f74386db
    resource: repo://tools/sync-manifest.js
generated: { by: "claude-code", at: "2026-11-13T21:24:43.706Z" }
verified:
  - by: openwiki/0.7.2
    at: 2026-11-13T21:53:44.309Z
---

# Architecture overview

Episode Limit is a Chrome Manifest V3 extension. It blocks video playback
on Netflix, Disney+, YouTube, YouTube Kids, CDA and TVP VOD until a parent unlocks a
specific number of episodes ([manifest.json](../../manifest.json)). It is plain JavaScript, with
no build step and no dependencies. You load the folder (or an unzipped release package) as an
unpacked extension. Unit tests for video detection, the pause end time, the wrong-password
delay and translation keys run under Node's built-in test runner, and a GitHub Actions workflow checks, packages and releases the extension (see
[checks, packaging and releases](../operations/build-and-release.md)).
The UI is available in English (the default locale) and Polish; strings live in
[_locales/](../../_locales/).

## Runtime contexts

```
            chrome.storage.local  { state: {salt, hash, remaining, pausedUntil, epoch}, guard }
             ▲   ▲   ▲   │ onChanged
   writes    │   │   │   ▼
  ┌──────────┴┐ ┌┴───┴──────────┐        claim {id}        ┌──────────────────────┐
  │ popup.js  │ │ locked.js     │   ┌───────────────────►  │ background.js        │
  │ (toolbar) │ │ (lock page)   │   │   {allow: bool}      │ service worker       │
  └───────────┘ └───────▲───────┘   │  ◄───────────────────│ serialize(claim)     │
                        │ replace() │                      │ paid → storage.session│
                ┌───────┴───────────┴──┐                   └──────────────────────┘
                │ content.js (per tab, │
                │ supported sites)     │
                └──────────────────────┘
```

| Context | Files | Responsibility |
|---|---|---|
| Background service worker | [background.js](../../background.js) (+ `importScripts('lib.js')`) | The only place that spends quota. It serializes claims, tracks what each tab has paid for, and reloads open tabs on install. |
| Content script | [lib.js](../../lib.js), [content.js](../../content.js), injected at `document_start` on supported hosts | Spots video pages, asks for a claim, and redirects to the lock page when refused. |
| Toolbar popup | [popup.html](../../popup.html), [popup.js](../../popup.js) | Lets the parent set the password, then (after entering it once) add or set episodes, lock now, or pause the limit until 3:00. |
| Lock page | [locked.html](../../locked.html), [locked.js](../../locked.js), a web-accessible resource | Tells the child that watching is over and lets the parent add 1–3 episodes with the password. |

[lib.js](../../lib.js) is loaded into all four contexts. It holds:

- **site detection**: `SITES`, `siteFor`, `videoKey` (see [site detection](../concepts/site-detection.md));
- **state access**: `STATE_KEY = 'state'`, `getState`, `setState` over `chrome.storage.local`, plus
  `nextPauseEnd` and `isPaused` for the pause;
- **translations**: `t(key, ...subs)` over `chrome.i18n.getMessage` and `localizePage()`, which
  fills `data-i18n` elements on the popup and lock page (see [localization](../concepts/localization.md));
- **password**: PBKDF2-SHA-256 hashing through Web Crypto (`hashPassword`, `savePassword`,
  `checkPassword`), and `tryPassword`, which adds a growing wait after wrong attempts (see
  [parent controls](../workflows/parent-controls.md)).

## Storage

- `chrome.storage.local['state']` is the persistent shared state: `salt`, `hash`
  (password), `remaining` (episodes left), `pausedUntil` (time in ms until which videos play
  without using episodes; missing or past means no pause), and `epoch` (bumped to invalidate
  earlier payments).
- `chrome.storage.local['guard']` is `{ fails, until }`: wrong passwords in a row and the time
  the next attempt is allowed. Only `tryPassword` reads and writes it, and no listener reacts
  to it.
- `chrome.storage.session['paid']` is `{ [tabId]: { id, epoch } }`, written only by the
  background worker. It is cleared when the browser session ends.

Writes to `state` reach every other context through `chrome.storage.onChanged`. Content
scripts re-check their tab, the lock page goes back to the video automatically if it is now
allowed, and the popup re-renders after its own writes.

## Messages

There is one message type. The content script sends `{ type: 'claim', id }`, where `id` is the
`videoKey` string, and the background answers `{ allow: true | false }`. Popup and lock page
do not message the background at all. They act only through storage. The full decision
logic is in [episode quota](episode-quota.md).

## Permissions

The extension asks only for `storage`, plus host permissions for the six site patterns. Those same
patterns are used for content-script matches and for `web_accessible_resources`, which lets a site page
navigate to `locked.html`. The background worker reads `content_scripts[0].matches` from
the manifest at runtime to find tabs to reload. The three lists are not edited by hand. They
are generated from the `matches` field of each `SITES` entry in [lib.js](../../lib.js) by
`node tools/sync-manifest.js` ([tools/sync-manifest.js](../../tools/sync-manifest.js)), and
`--check` reports drift. See [site detection](../concepts/site-detection.md#adding-a-site) and
[extension lifecycle](../operations/extension-lifecycle.md).

## Manifest localization

The manifest's `name`, `description` and `action.default_title` are `__MSG_extName__` /
`__MSG_extDescription__` placeholders resolved from the message catalogs, and
`default_locale` is `en`. Chrome therefore shows the English or the Polish name depending on
its UI language. See [localization](../concepts/localization.md).
