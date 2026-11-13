---
type: workflow
title: "Parent controls: password, popup and lock page"
description: Parent-facing workflows — creating the PBKDF2-hashed password, the password-first toolbar popup (add or set episodes, lock now, pause until 3:00), unlocking from the lock page with automatic return to the video, and the growing wait after wrong passwords.
tags: [parent-controls, password, pbkdf2, popup, lock-page, ui]
sources:
  - id: openwiki-source-ac1612f5b3f29b4158b7f5dd
    resource: repo://lib.js
  - id: openwiki-source-05a2d846482ced23f1fd99f1
    resource: repo://locked.js
  - id: openwiki-source-6390fee3c395fd7746cec673
    resource: repo://popup.html
  - id: openwiki-source-dda1dc9054b73bb09bf02f85
    resource: repo://popup.js
  - id: openwiki-source-6827bfa6cc4545b673ce7dc4
    resource: repo://tests/lib.test.js
generated: { by: "claude-code", at: "2026-11-13T21:24:43.706Z" }
verified:
  - by: openwiki/0.7.2
    at: 2026-11-13T21:24:43.706Z
---

# Parent controls: password, popup and lock page

The parent controls the extension from two screens: the toolbar popup and the lock page. Both
change `state` directly in `chrome.storage.local`, and both are guarded by the parent password.
Labels come from message keys and are shown in English or Polish depending on Chrome's UI
language. This page quotes the English text and gives message keys where useful (see
[localization](../concepts/localization.md)).

## Password

Hashing is in [lib.js](../../lib.js):

- `savePassword(pw)` creates a fresh random 16-byte salt and stores `hash = PBKDF2(pw, salt,
  200 000 iterations, SHA-256, 256 bits)`, both base64. It keeps the existing `remaining`
  value (defaulting to 0).
- `checkPassword(pw)` re-derives the hash and compares it. It returns `false` when no password is set.
- `tryPassword(pw)` is what both screens call. It wraps `checkPassword` with a growing wait
  after wrong attempts (see [wrong passwords](#wrong-passwords)) and returns `{ ok: true }` or
  `{ ok: false, wait }`, where `wait` is in seconds.

New passwords need at least `MIN_PASSWORD` (6) characters. A password created by an older
version with 4 or 5 characters keeps working; the length is checked only when one is created.

Until a password exists, every video page is locked (see
[episode quota](../architecture/episode-quota.md)).

## Toolbar popup ([popup.html](../../popup.html), [popup.js](../../popup.js))

The large header line always shows the current state: "Episodes left: N", "🔒 No episodes
left", "No limit until 03:00" during a pause, or "No password set." before setup.

The popup shows one of three panels, chosen in `render()`:

1. **Setup (no hash).** "Create a parent password" with a hint to use at least 6 characters,
   and "Repeat the password". Errors (`passwordTooShort`, `passwordsDiffer`) appear under the
   form. Anyone who opens the popup first can set the password. After saving, the popup goes
   straight to the controls. There is no screen for changing the password later.
2. **Password (hash set, not yet entered).** A single "Parent password" field with
   "Continue". The field is focused when the popup opens. Pressing Enter submits only this
   form, so it cannot change anything else. A wrong password shows "Wrong password", or the
   remaining wait once the wrong-password delay applies.
3. **Controls (password entered).** The in-memory `unlocked` flag keeps the controls open until
   the popup closes; closing it forgets the password. The actions below need no further
   password.

| Control | Effect on `state` |
|---|---|
| **+1 / +2 / +3** | Adds to `remaining`, capped at 50. |
| **− [n] +** and **Set** | The field starts at the current `remaining`; − and + only change the field. **Set** (or Enter in the field) stores `remaining = n`, clamped to 0–50. |
| **🔒 Lock now** | `remaining = 0`, `pausedUntil = 0`, and bumps `epoch`, which locks videos that are already playing. |
| **No limit until 03:00** | Sets `pausedUntil` to the next 3:00 local time. |
| **Turn the limit back on now** (shown during a pause) | Clears `pausedUntil` and bumps `epoch`, so open videos must pay again. |

Each action shows "Saved" for 3 seconds. While the popup is open, a `storage.onChanged`
listener re-renders it, so the count updates if a video in another tab spends an episode. The
`dirty` flag stops that re-render from overwriting a number the parent is still editing.

Setting the exact count to 0 does not bump `epoch`: open videos continue and only the next
video page is locked. "Lock now" is the way to stop a playing video. See
[episode quota](../architecture/episode-quota.md#pause) for how the pause and `epoch` affect
claims.

The popup footer shows the manifest version.

## Lock page ([locked.html](../../locked.html), [locked.js](../../locked.js))

The content script opens it as `locked.html?return=<video URL>` with `location.replace()`, so
the video page drops out of history. The child sees that watching is over and is asked to get a
parent.

- **Return URL.** The page accepts it only if it is `https:` and belongs to a supported site
  (see [site detection](../concepts/site-detection.md)). Otherwise it is ignored.
- **Unlock.** Under "For parents", the parent picks **+1**, **+2** or **+3** (+1 is selected by
  default; the choice is shown with `aria-pressed`), enters the password and presses "Unlock"
  or Enter. The chosen number is **added** to `remaining` (capped at 50), and the page then
  `location.replace()`s back to the video. Loading the video spends one episode as usual, so
  +1 lets exactly this video play. Without a valid return URL, the page shows "Unlocked. Open
  the video again." (`unlockedReopen`).
- **No password yet.** The form fields are hidden, and a note sends the parent to the
  toolbar icon to set one.
- **Automatic return.** A `storage.onChanged` listener sends the page back to the video when a
  pause becomes active, or when a password is set and `remaining > 0`. That covers the case
  where the parent unlocks or pauses from the popup instead. The page deliberately does **not**
  check on load: if the background could not be reached, the video would lock again at once and
  the two pages would bounce back and forth forever.
- **"← Back".** The button calls `history.back()` when there is history. Otherwise it goes to
  the video site's origin, for example the home page.

## Wrong passwords

`tryPassword` keeps a counter under the `guard` key in `chrome.storage.local`:
`{ fails, until }`.

- The first two wrong passwords in a row have no wait.
- The 3rd starts a 30 s wait (`lockoutMs`), and each further wrong attempt doubles it, up to
  1 hour.
- During the wait, every attempt is refused without checking the password, and the message
  shows the seconds left (`tooManyTries`).
- A correct password removes the counter.

The counter is shared by the popup and the lock page and survives closing either of them, so a
child trying passwords on the lock page also makes the parent wait in the popup. The password
fields are always masked and are cleared after every attempt.

## Limits of the protection

The password guards only the extension's own UI. It does not stop someone who can
disable or remove the extension in `chrome://extensions`, or who edits
`chrome.storage.local` through the extension's DevTools (which would also reset the
wrong-password counter). Use Chrome's managed or supervised profile settings if you need to
prevent that.
