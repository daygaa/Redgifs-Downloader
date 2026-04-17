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

### Firefox

1. Download the latest `.xpi` file from the [Releases page](https://github.com/daygaa/Redgifs-Downloader/releases/latest).
2. Drag and drop the `.xpi` onto any Firefox window.
3. Click **Add** in the confirmation popup.

The extension updates itself automatically from subsequent GitHub releases — no manual reinstall needed.

### Chrome / Edge / Brave / Opera / Vivaldi

Chrome doesn't allow extensions to be installed directly from a file outside its Web Store, so we use developer mode:

1. Download the latest `redgifs-downloader-chrome-X.Y.Z.zip` from the [Releases page](https://github.com/daygaa/Redgifs-Downloader/releases/latest).
2. Extract the ZIP to a permanent folder on your computer (e.g. `C:\Extensions\Redgifs-Downloader\`). **Don't delete this folder** — Chrome loads the extension from it.
3. Open `chrome://extensions/` (or `edge://extensions/`, `brave://extensions/`, etc.).
4. Enable **Developer mode** (toggle in the top right).
5. Click **Load unpacked** and select the extracted folder.
6. The extension is now installed.

**Automatic updates are NOT available on Chrome** (Google has disabled external update URLs since 2018). To update, download the new ZIP, extract it over the existing folder, and click the **Reload** button on the extension card in `chrome://extensions/`.

### Required browser setting

For downloads to go directly to your Downloads folder without a "Save As" dialog every time:

- **Firefox**: `about:preferences` → **General** → **Files and Applications** → check **Save files to [Downloads]** (rather than "Always ask me where to save files").
- **Chrome / Edge / Brave**: `chrome://settings/downloads` → uncheck **Ask where to save each file before downloading**.

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

## Security

All released files are scanned on VirusTotal before being published. The scan reports for the latest release are available on the [latest release page](https://github.com/daygaa/Redgifs-Downloader/releases/latest) in the release notes.

The full source code is available in this repository — you can inspect it before installing, or build the extension yourself from source (see the Development section below).

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
