# Changelog

## [1.6.0] - 2026-04

### Added
- **HDR metadata correction**: new option (enabled by default) that rewrites BT.2020/HLG or BT.2020/PQ metadata to standard BT.709 on download. Many RedGifs videos (especially iPhone uploads) carry HDR metadata despite being 8-bit encoded, causing extreme overexposure in Windows players like Films & TV or Photos. The fix is a no-reencode bit-level patch of the H.264 SPS VUI parameters — the file remains byte-identical except for 3 modified values, and the correction takes less than 50ms.
- Debug marker: downloaded files that had their metadata patched receive a `_patched` suffix before the extension, so you can tell which files were modified. This marker can be removed later once the feature is validated in production.

### Changed
- Download flow: files are now fetched into memory before being written to disk (instead of streaming directly to the file). This is required to apply the HDR patch. Download speed remains comparable; RAM usage increases by the size of the video (temporarily, during the download).

## [1.5.0] - 2026-04

### Added
- New branded icon (neon-style RedGifs logo inspiration)
- **Chrome support** (Chrome, Edge, Brave, Opera, Vivaldi and other Chromium-based browsers)
  - Shared codebase via the Mozilla `webextension-polyfill`
  - Chrome version adapts the popup: shortcuts are read-only (Chrome API limitation), with a button to open `chrome://extensions/shortcuts`
  - Distributed as unpacked ZIP (manual install via developer mode, no auto-updates on Chrome)

## [1.4.0] - 2026-04

### Changed
- Folder settings UI: replaced free-text subfolder input with two checkboxes (`/RedGifs/` subfolder + sort by month/week/day)
- Default shortcuts switched to `Ctrl+Q` (HD) and `Ctrl+Shift+Q` (SD), avoiding conflicts with Firefox system shortcuts

### Added
- Clear button (✕) next to each keyboard shortcut to fully disable it

## [1.3.0] - 2026-04

### Added
- Toolbar icon with clickable popup for quick access to all settings
- In-popup keyboard shortcut capture with validation (modifier required, Firefox-reserved keys blocked, anti-conflict check)

## [1.2.0] - 2026-04

### Changed
- Download buttons now integrate directly into the native RedGifs sidebar (`ul.sideBar`), inheriting the site's visual style (transparent background, white outline icons)

## [1.1.0] - 2026-04

### Changed
- Migrated from a single global "fixed bottom-right" button to per-video injection
- Content script now runs on all of `redgifs.com`, not just `/watch/*`
- Added `MutationObserver` + `IntersectionObserver` for infinite-scroll feeds

## [1.0.0] - 2026-04

### Added
- Initial release
- HD/SD download buttons on `/watch/<id>` pages
- Configurable download subfolder
- Keyboard shortcuts
