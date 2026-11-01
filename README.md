# Limit odcinków

A Chrome extension (Manifest V3) that limits how many episodes a child can watch. Video playback
on supported sites is blocked until a parent unlocks a set number of episodes with a password.
Each video page that is opened uses up one episode.

The user interface is in Polish and English. Chrome picks the language from its own UI language;
any language other than Polish falls back to English.

## Supported sites

- Netflix
- Disney+
- YouTube and YouTube Kids (watch pages, Shorts, live, embeds)
- CDA (`cda.pl`)
- TVP VOD (`vod.tvp.pl`)

The extension finds video pages from their URL alone. Browsing, search, category pages and
series pages are not counted.

## Installation

There is no build step and nothing to install from a package manager.

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked** and choose this folder.
4. Click the extension's toolbar icon and set the parent password.

Until a password is set, every video is locked.

## Usage

### Toolbar popup (for the parent)

- **Create the password** ("Utwórz hasło rodzica"). It must be at least 4 characters. The popup
  has no screen for changing it later.
- **Set the remaining episodes** ("Ustaw liczbę pozostałych odcinków"). Setting the number to `0`
  locks everything at once, including videos that are already playing.
- **Turn blocking off or on** ("Wyłącz blokadę" / "Włącz blokadę"). When blocking is turned back
  on, videos that are already open have to be paid for again.

Every action needs the password.

### Lock page

When no episodes are left, the video tab is sent to a lock page. There the parent can enter the
password and a number of episodes, then click **Odblokuj** ("Unlock"). This sets the remaining
count to that number (it does not add to the old one) and goes back to the video. Opening the
video then uses one episode, so unlocking `1` lets exactly that video play.

### How episodes are counted

- Each video page that is opened uses one episode.
- Reloading the same video in the same tab is free.
- "Lock now" and turning blocking back on make every open video pay again.
- If something cannot be checked, the extension locks the video.

## Project structure

| File | Purpose |
| --- | --- |
| [manifest.json](manifest.json) | Extension manifest |
| [lib.js](lib.js) | Shared helpers: site list and video detection, state storage, translations, password hashing (PBKDF2) |
| [background.js](background.js) | Service worker. The only place that uses up episodes, one claim at a time |
| [content.js](content.js) | Runs on supported sites, detects video pages and asks the background whether to allow them |
| [popup.html](popup.html), [popup.js](popup.js) | Parent controls in the toolbar popup |
| [locked.html](locked.html), [locked.js](locked.js) | Lock page with the unlock form |
| [_locales/](_locales/) | Translations: `en/messages.json` and `pl/messages.json` |
| [tools/sync-manifest.js](tools/sync-manifest.js) | Copies site match patterns from `lib.js` into `manifest.json` |

State is kept in `chrome.storage.local` (password hash, remaining episodes, blocking switch, epoch).
Records of which tab has paid for which video are kept in `chrome.storage.session`.

## Adding or changing a site

1. Edit the `SITES` list in [lib.js](lib.js): the name, the manifest `matches` patterns, the
   `host` regex and an `id(url)` function that returns the video ID or `null`.
2. Copy the patterns into the manifest:

   ```sh
   node tools/sync-manifest.js          # update manifest.json
   node tools/sync-manifest.js --check  # only check; exits 1 if manifest.json is out of date
   ```

3. Reload the extension in `chrome://extensions`.

## Translations

All user-visible text is in [_locales/en/messages.json](_locales/en/messages.json) and
[_locales/pl/messages.json](_locales/pl/messages.json). Both files must have the same keys.

- In HTML, mark an element with `data-i18n="key"`. `localizePage()` from [lib.js](lib.js) fills it in.
- In JavaScript, use `t('key')`, or `t('key', value)` for messages with a `$1` placeholder.
- In `manifest.json`, use `__MSG_key__`.

`chrome.i18n` has no plural forms, so write counts as "label: number" (for example
"Pozostało odcinków: 3"). To test the other language on macOS, set Chrome's language in System
Settings → General → Language & Region → Applications, restart Chrome and reload the extension.

## Limitations

The password protects only the extension's own popup and lock page. It does not stop someone who
can turn off or remove the extension in `chrome://extensions`, or who edits the extension's
storage through DevTools. To prevent that, use Chrome's managed or supervised profile settings.

## Documentation

More detailed developer documentation is in [openwiki/](openwiki/). Start with
[openwiki/quickstart.md](openwiki/quickstart.md).
