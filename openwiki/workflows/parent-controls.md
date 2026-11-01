---
type: workflow
title: "Parent controls: password, popup and lock page"
description: Parent-facing workflows — creating the PBKDF2-hashed password, toggling blocking, setting or zeroing remaining episodes from the toolbar popup, and unlocking from the lock page with automatic return to the video.
tags: [parent-controls, password, pbkdf2, popup, lock-page, ui]
verified:
  - by: openwiki/0.7.2
    at: 2026-11-01T11:23:59.117Z
sources:
  - id: openwiki-source-ac1612f5b3f29b4158b7f5dd
    resource: repo://lib.js
  - id: openwiki-source-05a2d846482ced23f1fd99f1
    resource: repo://locked.js
  - id: openwiki-source-6390fee3c395fd7746cec673
    resource: repo://popup.html
  - id: openwiki-source-dda1dc9054b73bb09bf02f85
    resource: repo://popup.js
generated: { by: "claude-code", at: "2026-11-01T11:23:59.117Z" }
---

# Parent controls: password, popup and lock page

The parent controls the extension from two screens. Both are in Polish and both change
`state` directly in `chrome.storage.local`. Every change is checked against the parent password.

## Password

Hashing is in [lib.js](../../lib.js):

- `savePassword(pw)` creates a fresh random 16-byte salt and stores `hash = PBKDF2(pw, salt,
  200 000 iterations, SHA-256, 256 bits)`, both base64. It keeps the existing `remaining`
  value (defaulting to 0).
- `checkPassword(pw)` re-derives the hash and compares it. It returns `false` when no password is set.

Until a password exists, every video page is locked (see
[episode quota](../architecture/episode-quota.md)).

## Toolbar popup ([popup.html](../../popup.html), [popup.js](../../popup.js))

**First run, no hash.** The popup shows "Nie ustawiono hasła." ("No password set.") and the setup
form: "Utwórz hasło rodzica" ("Create parent password") and "Powtórz hasło" ("Repeat
password"). The password must be at least 4 characters ("Użyj co najmniej 4 znaków") and both
fields must match ("Hasła nie są takie same", "Passwords don't match"). Anyone who opens the popup
first can set the password. Once it is set, the popup has no screen for changing it.

**After setup.** The header shows "Blokada: WŁĄCZONA / WYŁĄCZONA" ("Blocking: ON / OFF") and
"Pozostało odcinków: N" ("Episodes left: N"). Each action needs the password in the
"Hasło rodzica" field. A wrong one shows "Błędne hasło" ("Wrong password").

| Action | Effect on `state` |
|---|---|
| "Wyłącz blokadę" / "Włącz blokadę" (turn blocking off / on) | Flips `enabled`. Turning it **on** also bumps `epoch`, so open videos have to be paid for again. |
| "Zastosuj" (apply) with a count, "0 = zablokuj teraz" (0 = lock now) | Sets `remaining = max(0, n)`. When `n === 0` it also bumps `epoch`, which locks videos that are already playing. |

The popup footer shows the manifest version.

## Lock page ([locked.html](../../locked.html), [locked.js](../../locked.js))

The content script opens it as `locked.html?return=<video URL>` with `location.replace()`, so
the video page drops out of history. The child sees "Koniec oglądania!" ("Done watching!")
and "Poproś rodzica o więcej odcinków." ("Ask a parent for more episodes.").

- **Return URL.** The page accepts it only if it is `https:` and belongs to a supported site
  (see [site detection](../concepts/site-detection.md)). Otherwise it is ignored.
- **Unlock.** Under "Dla rodzica" ("For the parent"), enter the password and a count (minimum 1)
  and press "Odblokuj" ("Unlock"). This **overwrites** `remaining` with the count and does not add to it, and then
  `location.replace()`s back to the video. Loading the video spends one episode as usual, so
  unlocking 1 lets exactly this video play. Without a valid return URL, the page shows
  "Odblokowano. Otwórz film ponownie." ("Unlocked. Open the video again.").
- **No password yet.** The form fields are hidden, and a note sends the parent to the
  toolbar icon to set one.
- **Automatic return.** A `storage.onChanged` listener sends the page back to the video when
  blocking is turned off, or when a password is set and `remaining > 0`. That covers the case where the
  parent unlocks from the popup instead. The page deliberately does **not** check on load: if
  the background could not be reached, the video would lock again at once and the two pages would
  bounce back and forth forever.
- **"← Wróć" (Back).** The button calls `history.back()` when there is history. Otherwise it goes to the
  video site's origin, for example the home page.

## Limits of the protection

The password guards only the extension's own UI. It does not stop someone who can
disable or remove the extension in `chrome://extensions`, or who edits
`chrome.storage.local` through the extension's DevTools. Use Chrome's managed or supervised
profile settings if you need to prevent that.
