# LINKED

Chrome extension for LinkedIn that lets users customize the reaction tray directly under each post's Like button.

## Features

- In-place tray replacement on hover (custom tray overlays native tray region)
- Reaction Studio with three asset modes:
  - Emoji
  - Upload Image (auto-normalized square sticker)
  - Avatar Sticker (initials + mood + color)
- Emojipedia-style reaction browser:
  - Search
  - Category filtering
  - One-click add to active pack
  - Source/license attribution footer
- Pack management:
  - Create Pack
  - Duplicate Pack
  - Set Active Pack
  - Rename Pack
  - Delete Pack
- Pack thumbnail + quick metadata for active pack
- One-click Pro Set generator (professional starter reactions)
- Canonical LinkedIn mapping: each custom reaction maps to one native type (`like`, `celebrate`, `support`, `love`, `insightful`, `funny`)
- Import/export for active pack
- Hide selected native reactions

## Storage model

- `chrome.storage.local`: `reactionPacks`, `activePackId` (supports image/avatar assets)
- `chrome.storage.sync`: `hiddenBuiltins`

Backward compatibility migration from old single-list models is automatic.

## Catalog Pipeline CLI

A local internal CLI is included to generate `reaction-catalog.js` from OpenMoji assets.

- Script: `scripts/build-openmoji-catalog.mjs`
- NPM command: `npm run catalog:openmoji -- --openmoji /path/to/openmoji --out ./reaction-catalog.js --limit 320`
- Docs: `docs/catalog-pipeline.md`

This avoids direct scraping/copying from Emojipedia while still giving a rich catalog experience.

## Important limitation

This is a UI-level customization. LinkedIn still receives one native reaction type. LINKED does not create new backend LinkedIn reaction types.

## Install (Developer mode)

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this `LINKED` folder
5. Open LinkedIn and configure reactions in the extension popup
