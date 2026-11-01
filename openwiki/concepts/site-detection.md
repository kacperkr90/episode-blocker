---
type: concept
title: Supported sites and video detection
description: How lib.js decides whether a URL is a countable video page on Netflix, Disney+, YouTube, YouTube Kids, CDA or TVP VOD, how the video key is formed, and how to add a new site.
tags: [sites, url-parsing, video-key, youtube, netflix, tvp, cda, disney-plus]
sources:
  - id: openwiki-source-ac1612f5b3f29b4158b7f5dd
    resource: repo://lib.js
  - id: openwiki-source-05a2d846482ced23f1fd99f1
    resource: repo://locked.js
  - id: openwiki-source-b25e71362ad2d0521bb4e04c
    resource: repo://manifest.json
  - id: openwiki-source-395d1fa7dad02829f74386db
    resource: repo://tools/sync-manifest.js
generated: { by: "claude-code", at: "2026-11-01T12:05:30.576Z" }
verified:
  - by: openwiki/0.7.2
    at: 2026-11-01T12:05:30.576Z
---

# Supported sites and video detection

The extension never inspects the DOM or the player. It decides from the **URL alone**
whether a page is a video that costs an episode. That logic lives in the `SITES` table in
[lib.js](../../lib.js) and is used by the content script (to decide whether to claim) and by
the lock page (to validate the return URL).

## The SITES table

Each entry is a self-describing object:

```js
{
  name: 'YouTube',                        // human-readable label (used in sync-script errors)
  matches: ['https://*.youtube.com/*'],   // Chrome match patterns copied into manifest.json
  host: /(^|\.)youtube\.com$/,            // runtime hostname test used by siteFor()
  id: youtubeId,                          // (URL) → videoId | null
}
```

`matches` exists only to generate the manifest (see [Adding a site](#adding-a-site)). At
runtime only `host` and `id` are used. The current entries:

| Site | Host regex | Counted URL shapes | Extracted id |
|---|---|---|---|
| Netflix | `(^\|\.)netflix\.com$` | `…/watch/<digits>` | digits |
| Disney+ | `(^\|\.)disneyplus\.com$` | `…/play/<id>`, `…/video/<id>` | `[\w-]+` |
| YouTube | `(^\|\.)youtube\.com$` | `/watch?v=<id>`, `/shorts/<id>`, `/live/<id>`, `/embed/<id>` | `v` param, or path id of 6+ `[\w-]` chars |
| YouTube Kids | `(^\|\.)youtubekids\.com$` | same as YouTube (`youtubeId`) | same |
| CDA | `(^\|\.)cda\.pl$` | `/video/<id>[/vfilm]` | `[0-9a-z]+`, case-insensitive |
| TVP VOD | `^vod\.tvp\.pl$` | see below | last numeric id |

`siteFor(u)` returns the first entry whose host regex matches `u.hostname`, or `null`.

### TVP VOD rules (`tvpId`)

TVP URLs are comma-delimited `slug,number` segments. After any trailing slashes are removed:

- **Episode**: `/<category>,<n>/<series>-odcinki,<n>/<episode-slug>,<id>`, for example
  `/seriale,18/ranczo-odcinki,316445/odcinek-1,S01E01,381046` → `381046`. A third segment
  that starts with `sezon` is a season listing and is **not** counted.
- **Film / live**: `/<category>,<n>/<slug>,<id>` → `<id>`, unless the slug ends in
  `-odcinki`. That shape is a series overview page and is not counted.
- Category pages such as `/dla-dzieci,24` match neither pattern and are free.

Browsing pages (home, search, series and season lists, channel pages) therefore never spend
quota. Only actual playback URLs do.

## Video key

`videoKey(u)` combines the host and id as `<hostname without leading www./m.>:<id>`, for example
`youtube.com:dQw4w9WgXcQ`. Stripping `www.` and `m.` makes desktop and mobile URLs of the same
video produce the same key. Other subdomains keep their prefix. The key is what the
background stores in a tab's paid record, so a change of key within a tab means a new
episode (see [episode quota](../architecture/episode-quota.md)).

The extracted id is the only part of the URL that matters. Changing a query parameter like
`&t=30s`, or moving within a YouTube playlist to the same `v`, does not change the key.
Moving to a different `v` does.

## Return-URL validation

[locked.js](../../locked.js) accepts the `?return=` URL only if it is `https:` and
`siteFor()` recognizes its host. Without that check, the lock page could be used to bounce
to an arbitrary site.

## Adding a site

1. Add an entry to `SITES` in [lib.js](../../lib.js) with `name`, `matches`, a `host`
   regex, and an `id` extractor that returns `null` for browsing pages.
2. Run `node tools/sync-manifest.js`. It loads `SITES` from `lib.js` in a Node `vm` sandbox
   and writes the concatenated `matches` into **all three** lists in
   [manifest.json](../../manifest.json): `host_permissions`, `content_scripts[0].matches`,
   and `web_accessible_resources[0].matches`. Do not edit those lists by hand. The lock page
   cannot be opened from a site that is missing in the last list.
3. Reload the extension in `chrome://extensions`. If the site is a single-page app, nothing
   else is needed. The content script polls `location.href` every 300 ms.

[tools/sync-manifest.js](../../tools/sync-manifest.js) also validates each entry before
writing. Every site needs at least one pattern. Each pattern must have the form
`https://[*.]<host>/*`, and its host (without `*.`) must satisfy the site's own `host`
regex. Otherwise the content script would run on pages that detection and the lock page
then ignore. On any error it prints one line per problem and exits with 1 without writing.
`node tools/sync-manifest.js --check` makes no changes. It exits with 1 if `manifest.json`
is out of date. The script keeps the manifest's 2-space JSON formatting and whether or not
the file ends with a newline, so a run with no changes leaves the file byte-identical.

There is no automated test suite. Check new patterns by hand: reload the unpacked extension
and visit a browsing page and a video page on the site.
