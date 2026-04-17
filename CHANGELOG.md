# Changelog

## [1.5.0] - 2026-04

### Added
- New branded icon (neon-style RedGifs logo inspiration)

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
