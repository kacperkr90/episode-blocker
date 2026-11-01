---
type: operations
title: Checks, packaging and releases
description: The automated checks (JavaScript syntax, manifest sync, node --test unit tests for video detection and translation keys), the Build GitHub Actions workflow that packages the extension as a zip, and the tag-triggered GitHub release used for manual download and Load-unpacked install.
tags: [operations, ci, github-actions, testing, release, packaging]
verified:
  - by: openwiki/0.7.2
    at: 2026-11-01T12:16:37.173Z
sources:
  - id: openwiki-source-7a80b79a6fb3618cbfab08a2
    resource: repo://.github/workflows/build.yml
  - id: openwiki-source-6d4b4e707b8d60b6ccfa3425
    resource: repo://.github/workflows/openwiki-update.yml
  - id: openwiki-source-23775c3de52f3ab95a13cb8b
    resource: repo://README.md
generated: { by: "claude-code", at: "2026-11-01T12:16:37.173Z" }
---

# Checks, packaging and releases

The extension has no build step and no dependencies. "Building" means zipping the files Chrome
loads. The [Build workflow](../../.github/workflows/build.yml) runs the checks, makes the zip
and, for a version tag, attaches it to a GitHub release. Releases are for manual download only.
Nothing is published to the Chrome Web Store.

## Running the checks locally

```sh
node tools/sync-manifest.js --check   # manifest.json matches SITES in lib.js
node --test                           # tests/*.test.js
```

`node --test` uses Node's built-in test runner. There is no `package.json`, and the tests need
nothing installed. Node finds files named `*.test.js` on its own. The tests are:

| File | What it checks |
|---|---|
| [tests/lib.test.js](../../tests/lib.test.js) | `videoKey` returns the expected key for a video URL on every supported site, and `null` for browsing pages. See [site detection](../concepts/site-detection.md). |
| [tests/locales.test.js](../../tests/locales.test.js) | All `_locales/*` catalogs have the same keys, and every key the code, pages and manifest use exists. See [localization](../concepts/localization.md). |

Both test files and `tools/sync-manifest.js` run `lib.js` in a Node `vm` sandbox. This works
only because `lib.js` touches `chrome.*` APIs inside functions and never when it first loads.
Keep it that way.

The tests do not cover anything that needs Chrome: claims, storage, the popup, the lock page
or tab reloading. For those, use the
[manual testing checklist](extension-lifecycle.md#manual-testing-checklist).

## The Build workflow

`.github/workflows/build.yml` runs on pushes to `main`, on version tags `v*`, on pull requests
and on manual dispatch. It has three jobs, each depending on the one before:

1. **test**: sets up Node 22, then:
   - runs `node --check` on every root, `tools/` and `tests/` `.js` file;
   - runs `node tools/sync-manifest.js --check`;
   - runs `node --test`.
2. **build**:
   - reads `version` from `manifest.json` with `jq`;
   - zips `manifest.json`, the root `*.js` and `*.html` files and `_locales/` into
     `dist/limit-odcinkow-<version>.zip`;
   - uploads the zip as the `extension` workflow artifact, which can be downloaded from the run
     page.

   README, AGENTS.md, `tools/`, `tests/`, `openwiki/` and `.github/` are left out. A new runtime
   file at the repository root (`.js` or `.html`) is included automatically. A file in a new
   subdirectory, such as icons, must be added to the `zip` command.
3. **publish**: runs only for `refs/tags/v*`, with `contents: write`.
   - It fails unless the tag name is exactly `v` followed by the manifest version.
   - It downloads the artifact and runs `gh release create`, which attaches the zip and writes
     generated release notes.

The rest of the workflow can only read the repository.

This workflow is separate from [openwiki-update.yml](../../.github/workflows/openwiki-update.yml).
That workflow runs daily on a schedule, regenerates `openwiki/` and opens a pull request on the
`openwiki/update` branch. It does not test or package the extension.

## Making a release

1. Bump `version` in [manifest.json](../../manifest.json). The popup footer shows it.
2. Commit and push to `main`.
3. Tag and push the tag: `git tag v2.4.0 && git push origin v2.4.0`.

If the tag and the manifest version differ, the publish job fails and no release is created.
Fix the manifest or move the tag, then push again.

## Installing a release

Chrome will not install the zip directly. It also blocks self-hosted `.crx` packages that don't
come from the Web Store. To install a release:

1. Download the zip from the GitHub release.
2. Unzip it.
3. Load the unzipped folder with **Load unpacked** in `chrome://extensions`, with Developer mode
   on (see [loading the extension](extension-lifecycle.md#loading-the-extension)).

To update, unzip the new release over the same folder and reload the extension. Chrome derives
an unpacked extension's ID from its folder path, so the same folder keeps the same ID and
`chrome.storage.local` state, including the password and remaining count. A different folder
installs as a separate extension with empty state.
