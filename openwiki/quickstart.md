---
type: quickstart
title: Quickstart
description: Orientation for the Limit odcinków Chrome extension — what it does, how to load it, where each piece lives, and which wiki page to read for a given task.
tags: [quickstart, overview, chrome-extension, routing]
sources:
  - id: openwiki-source-f22365b596e25ba4bf7c6003
    resource: repo://background.js
  - id: openwiki-source-33784e8411f34531e1834579
    resource: repo://content.js
  - id: openwiki-source-b25e71362ad2d0521bb4e04c
    resource: repo://manifest.json
  - id: openwiki-source-395d1fa7dad02829f74386db
    resource: repo://tools/sync-manifest.js
generated: { by: "claude-code", at: "2026-11-01T11:48:12.232Z" }
verified:
  - by: openwiki/0.7.2
    at: 2026-11-01T11:48:12.232Z
---

# Quickstart

**Limit odcinków** ("Episode limit") is a Chrome Manifest V3 extension for parents. It
blocks playback on Netflix, Disney+, YouTube, YouTube Kids, CDA and TVP VOD until a parent,
using a password, allows a set number of episodes or videos. Each new video page a
tab opens spends one episode. When none are left, the tab is replaced by a lock page.

## Run it

There is no build, no package manager and no automated test suite. Open
`chrome://extensions`, turn on Developer mode, choose **Load unpacked**, and select this folder.
Click the toolbar icon to set the parent password. Until a password is set, every video is locked.

## File map

| File | What it is |
|---|---|
| [manifest.json](../manifest.json) | MV3 manifest: `storage` permission, the six site patterns (generated, see `tools/sync-manifest.js`), worker, content script, popup, web-accessible lock page. |
| [lib.js](../lib.js) | Shared by every context: `SITES`/`videoKey` URL detection, `getState`/`setState`, PBKDF2 password helpers. |
| [background.js](../background.js) | Service worker. Serializes quota claims, keeps per-tab paid records, reloads tabs on install. |
| [content.js](../content.js) | Runs on supported sites. Polls the URL, asks for a claim, redirects to the lock page. |
| [popup.html](../popup.html) / [popup.js](../popup.js) | Parent UI: set password, toggle blocking, set the remaining count or 0 to lock now. |
| [locked.html](../locked.html) / [locked.js](../locked.js) | Lock screen. The parent can unlock there and return to the video. |
| [tools/sync-manifest.js](../tools/sync-manifest.js) | Dev-only Node script, not shipped in the extension. Generates the three site lists in `manifest.json` from `SITES` in `lib.js`. `--check` reports drift. |

The UI text is Polish, for example "Koniec oglądania!" ("Done watching!") and "Błędne hasło"
("Wrong password").

## Where to go next

| Task | Read |
|---|---|
| Understand how the pieces talk to each other | [Architecture overview](architecture/overview.md) |
| Change how or when an episode is counted, or debug a wrong lock | [Episode quota and claim accounting](architecture/episode-quota.md) |
| Add a site or fix a URL pattern that is not detected | [Supported sites and video detection](concepts/site-detection.md) |
| Change the popup, lock page, or password behavior | [Parent controls](workflows/parent-controls.md) |
| Handle install, update or reload, SPA navigation, or test manually | [Install, update and reload behavior](operations/extension-lifecycle.md) |

## Key ideas in one breath

URL-only detection decides whether a page is a video. The background worker is the only place
that spends `remaining`, one claim at a time. A tab that already paid for the same video in
the current `epoch` is not charged again. The parent bumps `epoch` (lock now, or re-enabling
blocking) to make open videos pay again. Anything uncertain fails closed to the lock page.
