# Episode Limit

A Chrome extension (Manifest V3) that limits how many episodes a child can watch. Video playback
on supported sites is blocked until a parent unlocks a set number of episodes with a password.
Each video page that is opened uses up one episode.

The user interface is available in two languages. Chrome picks the language from its own UI
language; anything other than the one non-English translation falls back to English.

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

1. Download the zip from the latest [GitHub release](https://github.com/kacperkr90/episode-blocker/releases)
   and unzip it, or use a clone of this repository.
2. Open `chrome://extensions`.
3. Turn on **Developer mode**.
4. Click **Load unpacked** and choose the unzipped folder (or the repository folder).
5. Click the extension's toolbar icon and set the parent password.

Until a password is set, every video is locked.

## Usage

### Toolbar popup (for the parent)

- **Create the password** ("Create a parent password"). It must be at least 4 characters. The
  popup has no screen for changing it later.
- **Set the remaining episodes** ("Set the number of episodes left"). Setting the number to `0`
  locks everything at once, including videos that are already playing.
- **Turn blocking off or on** ("Turn blocking off" / "Turn blocking on"). When blocking is turned
  back on, videos that are already open have to be paid for again.

Every action needs the password.
The large text at the top shows the current state: episodes left, "🔒 No episodes left" or
"No limit until 3:00".

- **Create the password** ("Utwórz hasło rodzica"). It must be at least 6 characters. The popup
  has no screen for changing it later.
- **Enter the password once** ("Hasło rodzica", then **Dalej**). The controls then stay available
  until the popup is closed.
- **Add episodes** with **+1**, **+2** or **+3**, or set the exact number with **−**, **+** and
  **Ustaw** ("Set"). The number field starts at the current count. The maximum is 50.
- **🔒 Zablokuj teraz** ("Lock now") sets the count to 0 and locks every video at once, including
  videos that are already playing. It also ends a pause.
- **Bez limitu do 3:00** ("No limit until 3:00") lets videos play without using episodes until
  the next 3:00 at night. While the pause is on, the button changes to **Przywróć limit teraz**
  ("Turn the limit back on now"), which also makes every open video pay again. When the pause
  ends by itself at 3:00, videos that are already playing continue; the next video opened uses
  an episode.

### Lock page

When no episodes are left, the video tab is sent to a lock page. There the parent can enter the
password and a number of episodes, then click **Unlock**. This sets the remaining
count to that number (it does not add to the old one) and goes back to the video. Opening the
video then uses one episode, so unlocking `1` lets exactly that video play.
When no episodes are left, the video tab is sent to a lock page. Under **Dla rodzica** ("For
parents") the parent picks **+1**, **+2** or **+3**, enters the password and clicks **Odblokuj**
("Unlock"). The episodes are added to the remaining count and the tab goes back to the video.
Opening the video then uses one episode, so unlocking `+1` lets exactly that video play.

### Wrong passwords

After 3 wrong passwords in a row, the popup and the lock page wait 30 seconds before accepting
another try. Each further wrong password doubles the wait, up to 1 hour. A correct password
resets the counter. The counter is kept when the popup or the lock page is closed.

### How episodes are counted

- Each video page that is opened uses one episode.
- Reloading the same video in the same tab is free.
- "Lock now" and turning the limit back on make every open video pay again.
- If something cannot be checked, the extension locks the video.

### Updating from versions before 2.4

Older versions had a blocking on/off switch. If blocking was off when the extension is updated,
it becomes a pause until the next 3:00.

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

State is kept in `chrome.storage.local` (password hash, remaining episodes, pause end, epoch, and
the wrong-password counter).
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
"Episodes left: 3"). To test the other language on macOS, set Chrome's language in System
Settings → General → Language & Region → Applications, restart Chrome and reload the extension.

## Checks and releases

Run the checks locally with:

```sh
node tools/sync-manifest.js --check
node --test
```

The [Build workflow](.github/workflows/build.yml) runs the same checks on every push and pull
request, and packages the extension as a zip (downloadable from the workflow run).

To release, bump `version` in [manifest.json](manifest.json), commit, and push a matching tag:

```sh
git tag v2.4.0 && git push origin v2.4.0
```

The workflow then creates a GitHub release with `episode-limit-<version>.zip` attached. To
install it, download the zip from the release, unzip it, and load the unzipped folder with
**Load unpacked** as described in [Installation](#installation). Chrome does not install zip
files directly. To update, unzip the new version over the same folder and click the reload
button on the extension's card in `chrome://extensions`; the password and episode count are kept.

## Limitations

The password protects only the extension's own popup and lock page. It does not stop someone who
can turn off or remove the extension in `chrome://extensions`, or who edits the extension's
storage through DevTools. To prevent that, use Chrome's managed or supervised profile settings.

## Documentation

More detailed developer documentation is in [openwiki/](openwiki/). Start with
[openwiki/quickstart.md](openwiki/quickstart.md).
