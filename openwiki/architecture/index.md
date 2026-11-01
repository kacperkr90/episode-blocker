# Files

- [Episode quota and claim accounting](episode-quota.md) - How the extension spends one unit of the shared episode quota per video page — the claim message from the content script, serialized accounting in the background worker, per-tab paid records keyed by video and epoch, and fail-closed locking.
- [Architecture overview](overview.md) - The four runtime contexts of the Limit odcinków Manifest V3 extension (background worker, content script, popup, lock page), the shared lib.js helpers, and the storage areas and messages that connect them.
