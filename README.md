# Growtopia Music Simulator Final — Web Adaptation

A browser-based (HTML5 Canvas + WebAudio) adaptation of the Growtopia music simulator workflow.

This repository is **open-source for the code** and intentionally does **not** ship any Growtopia/Ubisoft game assets.

## Live Demo
- (Optional) Enable GitHub Pages to publish a live demo.

## Features
- Compose & play songs in the browser
- Grid-based editor (GMSF workflow)
- Offline-friendly (PWA via Service Worker)

## Getting Started (Local)
1. Download / clone this repository
2. Place required assets locally (see `ASSETS.md`)
3. Open `index.html` with a local server (recommended)

### Recommended local server
- VS Code extension: “Live Server”
- or any static server you like

## Project Structure
- `index.html` - entry UI & DOM
- `app.js` - main controller (state + input + render loop)
- `gmsf.js` - playback / timeline logic
- `notePack.js` - instrument definitions & asset mapping
- `sw.js` - Service Worker (offline cache)
- `manifest.webmanifest` - PWA manifest

## License (Code)
This project’s **source code** is licensed under **GNU GPL v3 (or later)**.
See `LICENSE`.

## Credits & Attribution
See `CREDITS.md`.

## Notice
Growtopia and Ubisoft are trademarks / properties of their respective owners.
This is a fan-made companion tool and is not affiliated with Ubisoft.
See `NOTICE.md`.
