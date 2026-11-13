---
type: quickstart
title: Quickstart
description: Orientation for the Episode Limit Chrome extension — what it does, how to load it, where each piece lives, and which wiki page to read for a given task.
tags: [quickstart, overview, chrome-extension, routing]
sources:
  - id: openwiki-source-7a80b79a6fb3618cbfab08a2
    resource: repo://.github/workflows/build.yml
  - id: openwiki-source-f22365b596e25ba4bf7c6003
    resource: repo://background.js
  - id: openwiki-source-33784e8411f34531e1834579
    resource: repo://content.js
  - id: openwiki-source-b25e71362ad2d0521bb4e04c
    resource: repo://manifest.json
  - id: openwiki-source-23775c3de52f3ab95a13cb8b
    resource: repo://README.md
  - id: openwiki-source-395d1fa7dad02829f74386db
    resource: repo://tools/sync-manifest.js
generated: { by: "claude-code", at: "2026-11-13T21:24:43.706Z" }
verified:
  - by: openwiki/0.7.2
    at: 2026-11-13T21:24:43.706Z
---

# Quickstart

**Episode Limit** is a Chrome Manifest V3 extension for parents. It
blocks playback on Netflix, Disney+, YouTube, YouTube Kids, CDA and TVP VOD until a parent,
using a password, allows a set number of episodes or videos. Each new video page a
tab opens spends one episode. When none are left, the tab is replaced by a lock page.

## Run it

There is no build step and no package manager. Open `chrome://extensions`, turn on Developer
mode, choose **Load unpacked**, and select this folder. You can also select the unzipped folder
from a GitHub release zip. Click the toolbar icon to set the parent password. Until a password
is set, every video is locked.

Run the checks with `node tools/sync-manifest.js --check` and `node --test`. They need Node only.
The Build GitHub Actions workflow runs them on every push and pull request. When a `v<version>`
tag is pushed, it also attaches `limit-odcinkow-<version>.zip` to a GitHub release.

## File map

| File | What it is |
|---|---|
| [manifest.json](../manifest.json) | MV3 manifest: `storage` permission, the six site patterns (generated, see `tools/sync-manifest.js`), worker, content script, popup, web-accessible lock page. |
| [lib.js](../lib.js) | Shared by every context: `SITES`/`videoKey` URL detection, `getState`/`setState`, `nextPauseEnd`/`isPaused` for the pause, `t`/`localizePage` translation helpers, PBKDF2 password helpers and `tryPassword` with its wrong-password wait. |
| [background.js](../background.js) | Service worker. Serializes quota claims, keeps per-tab paid records, migrates old state and reloads tabs on install. |
| [content.js](../content.js) | Runs on supported sites. Polls the URL, asks for a claim, redirects to the lock page. |
| [popup.html](../popup.html) / [popup.js](../popup.js) | Parent UI: set the password; after entering it once, add or set episodes, lock now, or pause the limit until 3:00. |
| [locked.html](../locked.html) / [locked.js](../locked.js) | Lock screen. The parent can unlock there and return to the video. |
| [_locales/](../_locales/) | `en` (default) and `pl` message catalogs for all user-visible text. |
| [README.md](../README.md) | User-facing install and usage guide. |
| [tools/sync-manifest.js](../tools/sync-manifest.js) | Dev-only Node script, not shipped in the extension. Generates the three site lists in `manifest.json` from `SITES` in `lib.js`. `--check` reports drift. |
| [tests/](../tests/) | `node --test` unit tests for `lib.js` helpers: video detection, pause end time, wrong-password wait (`lib.test.js`), and translation keys (`locales.test.js`). Not shipped. |
| [.github/workflows/build.yml](../.github/workflows/build.yml) | CI: checks, packages the zip, and creates a GitHub release for `v*` tags. `openwiki-update.yml` separately regenerates this wiki. |

The UI is in English and Polish. Chrome picks the language from its own UI language, and
anything other than Polish falls back to English.

## Where to go next

| Task | Read |
|---|---|
| Understand how the pieces talk to each other | [Architecture overview](architecture/overview.md) |
| Change how or when an episode is counted, or debug a wrong lock | [Episode quota and claim accounting](architecture/episode-quota.md) |
| Add a site or fix a URL pattern that is not detected | [Supported sites and video detection](concepts/site-detection.md) |
| Change the popup, lock page, or password behavior | [Parent controls](workflows/parent-controls.md) |
| Add or change UI text, or test the other language | [Localization](concepts/localization.md) |
| Handle install, update or reload, SPA navigation, or test manually | [Install, update and reload behavior](operations/extension-lifecycle.md) |
| Run or extend the automated tests, change packaging, or cut a release | [Checks, packaging and releases](operations/build-and-release.md) |

## Key ideas in one breath

URL-only detection decides whether a page is a video. The background worker is the only place
that spends `remaining`, one claim at a time. A tab that already paid for the same video in
the current `epoch` is not charged again. A pause (`pausedUntil`, ending at the next 3:00)
lets everything play for free. The parent bumps `epoch` ("Lock now", or ending a pause early)
to make open videos pay again. Anything uncertain fails closed to the lock page.
