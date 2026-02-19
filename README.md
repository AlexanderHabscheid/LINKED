# LINKED

Chrome extension for LinkedIn that lets users customize the reaction tray directly under each post's Like button.

## Features

- In-place tray replacement on hover (custom tray overlays native tray region)
- Reaction Studio with three asset modes:
  - Emoji
  - Upload Image (auto-normalized square sticker)
  - Avatar Sticker (initials + mood + color)
- Pack management:
  - Create Pack
  - Duplicate Pack
  - Set Active Pack
  - Delete Pack
- Canonical LinkedIn mapping: each custom reaction maps to one native type (`like`, `celebrate`, `support`, `love`, `insightful`, `funny`)
- Import/export for active pack
- Hide selected native reactions

## Storage model

- `chrome.storage.local`: `reactionPacks`, `activePackId` (supports image/avatar assets)
- `chrome.storage.sync`: `hiddenBuiltins`

Backward compatibility migration from old single-list models is automatic.

## Important limitation

This is a UI-level customization. LinkedIn still receives one native reaction type. LINKED does not create new backend LinkedIn reaction types.

## Install (Developer mode)

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this `LINKED` folder
5. Open LinkedIn and configure reactions in the extension popup
