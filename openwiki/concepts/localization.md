---
type: concept
title: Localization (Polish and English UI)
description: How the extension's user-visible text is translated into English and Polish — the _locales message catalogs, default_locale, __MSG_ placeholders in the manifest, the t() and localizePage() helpers in lib.js, data-i18n markup, and how to add or test a string.
tags: [i18n, localization, translations, chrome-i18n, ui]
verified:
  - by: openwiki/0.7.2
    at: 2026-11-01T12:05:30.576Z
sources:
  - id: openwiki-source-c7a8e6c25b0da5055873aed3
    resource: repo://_locales/en/messages.json
  - id: openwiki-source-405623faf1f040c1743dff34
    resource: repo://_locales/pl/messages.json
  - id: openwiki-source-ac1612f5b3f29b4158b7f5dd
    resource: repo://lib.js
  - id: openwiki-source-05a2d846482ced23f1fd99f1
    resource: repo://locked.js
  - id: openwiki-source-b25e71362ad2d0521bb4e04c
    resource: repo://manifest.json
  - id: openwiki-source-dda1dc9054b73bb09bf02f85
    resource: repo://popup.js
  - id: openwiki-source-23775c3de52f3ab95a13cb8b
    resource: repo://README.md
generated: { by: "claude-code", at: "2026-11-01T12:05:30.576Z" }
---

# Localization (Polish and English UI)

All user-visible text comes from Chrome's built-in `chrome.i18n` system. There are two
message catalogs:

- [_locales/en/messages.json](../../_locales/en/messages.json), the default locale;
- [_locales/pl/messages.json](../../_locales/pl/messages.json).

Chrome picks the catalog from its own UI language. The manifest sets `"default_locale": "en"`,
so any language other than Polish falls back to English. There is no in-extension language
switch.

## Where text appears

| Surface | Mechanism |
|---|---|
| Extension name, description, toolbar tooltip | `__MSG_extName__` / `__MSG_extDescription__` in [manifest.json](../../manifest.json) (`name`, `description`, `action.default_title`). |
| Static labels in [popup.html](../../popup.html) and [locked.html](../../locked.html) | Elements carry `data-i18n="<key>"`; `localizePage()` replaces their `textContent`. |
| Dynamic text in [popup.js](../../popup.js) and [locked.js](../../locked.js) | `t('<key>')`, or `t('<key>', value)` for messages with a placeholder. |

The content script and background worker show no text of their own. Everything the child or
parent sees is the popup, the lock page, or the manifest strings.

## Helpers in lib.js

Both helpers live in the "Translations" section of [lib.js](../../lib.js):

- `t(key, ...subs)` calls `chrome.i18n.getMessage(key, subs.map(String))`. If the key is
  missing, it returns the key itself, so a typo shows up on screen as the raw key instead of
  an empty string.
- `localizePage()` sets `<html lang>` to the primary subtag of `chrome.i18n.getUILanguage()`
  (for example `pl` from `pl-PL`) and fills every `[data-i18n]` element with `t(key)`.

`popup.js` and `locked.js` call `localizePage()` as their first statement after defining `$`,
before any rendering. The HTML files still contain Polish fallback text and `lang="pl"`; those
are overwritten at load and only matter if the script fails.

## Placeholders and counts

Two messages take a value through a `$1` placeholder:

- `remaining` — "Episodes left: $COUNT$" / "Pozostało odcinków: $COUNT$", used by the popup
  header with `t('remaining', s.remaining || 0)`;
- `version` — "version $VERSION$" / "wersja $VERSION$", used by the popup footer with the
  manifest version.

`chrome.i18n` has no plural forms, so counts are written as "label: number" rather than in a
sentence that would need Polish plural agreement.

## Adding or changing a string

1. Add the key to **both** catalogs. The two files must have the same set of keys; Chrome
   would fall back to English for a key missing only in Polish, and to the raw key (via `t`)
   for one missing in English.
2. In HTML, put `data-i18n="<key>"` on the element. In JavaScript, call `t('<key>')`. In the
   manifest, use `__MSG_<key>__`.
3. Reload the extension in `chrome://extensions`.

There is no automated check that the catalogs match. A quick comparison of key lists is enough.

## Testing the other language

Chrome reads the language at startup. On macOS, set Chrome's language under System Settings →
General → Language & Region → Applications, restart Chrome, and reload the extension. Then
open the popup and a lock page and check that no raw keys appear.

Related: [parent controls](../workflows/parent-controls.md) (the screens that show these
strings), [architecture overview](../architecture/overview.md).
