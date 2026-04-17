## ✨ New: HDR metadata correction

Some RedGifs videos (especially iPhone uploads) carry HDR metadata (BT.2020/HLG) despite being encoded in 8-bit. This causes **extreme overexposure** in Windows players like *Films & TV* or *Photos*, while VLC, Discord and browsers render them correctly.

This release introduces an automatic fix that **rewrites the color metadata** of downloaded MP4 files from HDR to SDR BT.709, without re-encoding. The fix is bit-level and completes in under 50ms; the file stays byte-identical except for 3 modified values inside the H.264 SPS.

The option is **enabled by default** and can be toggled from the popup → *Traitement* section.

### Debug marker

In this version, files that got their metadata patched are renamed with a `_patched` suffix (e.g. `PinkWeasel_patched.mp4`). This is a temporary debug aid to let you distinguish which files were actually modified. It will be removed in a later version once the feature is confirmed stable.

### Technical note

Download flow changes slightly: files are now fetched into memory before being written to disk (required to inspect the MP4 structure). For large videos, expect ~500 MB of temporary RAM usage during download. No impact on the final file size or quality.

---

## Downloads

- **Firefox**: `redgifs_downloader-1.6.0-fx.xpi` — drag-and-drop onto Firefox to install. Auto-updates from previous versions work transparently.
- **Chrome / Edge / Brave / Opera**: `redgifs-downloader-chrome-1.6.0.zip` — unzip and load as unpacked extension in `chrome://extensions/` with Developer mode enabled.

## Security

Both files have been scanned on VirusTotal:

- [Firefox `.xpi` scan] https://www.virustotal.com/gui/file/334d51195e4c24e0cac857efc95cfb421da5c35542e4a8ed460f42e5b24216c4?nocache=1
- [Chrome `.zip` scan] https://www.virustotal.com/gui/file/0e10457c11604d355ac518a96c4f5dd622c07bbfc38eebccc41a6e22293e4e70?nocache=1

