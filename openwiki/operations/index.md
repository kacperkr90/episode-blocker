# Files

- [Checks, packaging and releases](build-and-release.md) - The automated checks (JavaScript syntax, manifest sync, node --test unit tests for lib.js helpers and translation keys), the Build GitHub Actions workflow that packages the extension as a zip, and the release-please flow that versions, tags and publishes GitHub releases for manual download and Load-unpacked install.
- [Install, update and reload behavior](extension-lifecycle.md) - How the extension keeps tabs covered across install, update and reload — reloading already-open supported tabs, self-reloading orphaned content scripts on video pages, SPA URL polling — plus how to load and manually test it.
