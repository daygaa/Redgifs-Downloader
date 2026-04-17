# Redgifs Downloader

A Firefox extension that adds HD/SD download buttons directly into the RedGifs player sidebar, on every video (watch pages, feed, niches, profiles).

Built with vanilla JavaScript, no dependencies.

## Features

- Download buttons integrated directly in the native RedGifs sidebar, matching the site's visual style
- Works in every context: `/watch/<id>` pages, homepage feed, `/niches/*`, user profiles
- Works in fullscreen TikTok-style player
- Customizable keyboard shortcuts (default: `Ctrl+Q` for HD, `Ctrl+Shift+Q` for SD)
- Configurable download folder (optional `/RedGifs/` subfolder, optional date-based sorting by month/week/day)
- Direct download without "save as" dialog (if Firefox is configured accordingly)
- Lazy loading of metadata (API calls only for videos entering the viewport)
- Survives React re-renders of the player UI

## Installation

1. Download the latest `.xpi` file from the [Releases page](https://github.com/daygaa/Redgifs-Downloader/releases/latest).
2. Drag and drop the `.xpi` onto any Firefox window.
3. Click **Add** in the confirmation popup.

The extension updates itself automatically from subsequent GitHub releases — no manual reinstall needed.

### Required Firefox setting

For downloads to go directly to your Downloads folder without a "Save As" dialog every time, make sure this option is enabled:

`about:preferences` → **General** → **Files and Applications** → check **Save files to [Downloads]** (rather than "Always ask me where to save files").

## Usage

On any RedGifs page, two buttons appear at the top of each video's sidebar:

- **HD** — downloads the highest-quality MP4 available
- **SD** — downloads the lower-quality MP4

Keyboard shortcuts target the currently visible/active video:

- `Ctrl+Q` — download HD
- `Ctrl+Shift+Q` — download SD

These shortcuts can be reassigned from the extension popup (click the extension icon in the toolbar).

## Configuration

Click the extension icon in the Firefox toolbar to open the popup:

- **Create `/RedGifs/` subfolder** — groups downloads in `Downloads/RedGifs/`
- **Sort by month/week/day** — adds a dated subfolder (e.g. `Downloads/RedGifs/2026-04/`)
- **Shortcuts** — click to capture a new combination, or ✕ to clear

## How it works

The extension queries the public RedGifs API (`/v2/auth/temporary` + `/v2/gifs/<id>`) to resolve the direct CDN URL of each video, then triggers a standard browser download. No authentication or account is required.

Architecture:

- `content.js` injects the download buttons into every `.GifPreview` element detected in the DOM, using a `MutationObserver` for the feed's infinite scroll and an `IntersectionObserver` for lazy-loading metadata
- `background.js` handles API calls (bypassing CORS thanks to `host_permissions`) and the actual download via the `browser.downloads` API
- The popup and options page share the same logic for folder and shortcut settings

## Limitations

- Private or subscription-gated videos are not supported (the temporary API token only grants access to public content)
- If RedGifs changes the `.GifPreview` class name or the `data-feed-item-id` attribute, the extension will stop working until the selectors are updated (they are centralized in `content.js`)
- The "direct download without dialog" behavior depends on your Firefox setting (see above)

## Development

```bash
# Load temporarily in Firefox
# about:debugging → This Firefox → Load Temporary Add-on → select manifest.json

# Build an unsigned .xpi
npm install -g web-ext
web-ext build --source-dir=. --artifacts-dir=dist

# Sign and publish (maintainer only — requires AMO credentials)
web-ext sign --source-dir=. --artifacts-dir=dist \
  --api-key=$AMO_JWT_ISSUER \
  --api-secret=$AMO_JWT_SECRET \
  --channel=unlisted
```

## License

[MIT](LICENSE) — free to use, modify and redistribute.

## Disclaimer

This extension interacts with the RedGifs public API for personal, lawful use only. Respect content creators' rights and the site's terms of service. The authors are not affiliated with RedGifs.
