# LINKED

Chrome extension for LinkedIn that lets users customize the reaction tray directly under each post's Like button.

## What changed

- In-place tray replacement: when LinkedIn shows reaction options, LINKED replaces the visible options with your custom tray in the same UI position.
- Canonical LinkedIn mapping: custom reactions map to `like`, `celebrate`, `support`, `love`, `insightful`, `funny`.
- Legacy migration: old stored values (`praise`, `empathy`, `interest`, `appreciation`, `maybe`) are automatically migrated.
- Built-in hide controls: selected native reactions can be hidden.
- Popup upgrades: reorder custom reactions and import/export presets.
- Selector hardening: tray detection uses class/role signals plus fallback ancestry scanning to survive UI changes.

## Important limitation

This is a UI-level customization. LinkedIn still receives one native reaction type. LINKED does not create new backend LinkedIn reaction types.

## Install (Developer mode)

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this `LINKED` folder
5. Open LinkedIn and configure reactions in the extension popup

## Files

- `manifest.json`: extension config
- `popup.*`: reaction management UI (add/delete/reorder/import/export)
- `content.js`: tray replacement, canonical mapping, and hardened selector logic
- `widget.css`: tray styling designed to feel native to LinkedIn
