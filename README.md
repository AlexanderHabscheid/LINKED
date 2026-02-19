# LINKED

Chrome extension for LinkedIn that lets users customize the reaction tray directly under each post's Like button.

## What changed

- In-place tray replacement: when LinkedIn shows reaction options, LINKED replaces the visible options with your custom tray in the same UI position.
- Custom mapping: each custom reaction maps to one native LinkedIn reaction type.
- Built-in hide controls: selected native reactions can be hidden.
- Popup upgrades: reorder custom reactions and import/export presets.

## Important limitation

This is a UI-level customization. LinkedIn still receives one of its native reaction types. LINKED does not create new backend LinkedIn reaction types.

## Install (Developer mode)

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this `LINKED` folder
5. Open LinkedIn and configure reactions in the extension popup

## Files

- `manifest.json`: extension config
- `popup.*`: reaction management UI (add/delete/reorder/import/export)
- `content.js`: tray replacement and mapped click behavior
- `widget.css`: tray styling designed to feel native to LinkedIn
