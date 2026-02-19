# LINKED

Chrome extension for LinkedIn that lets users customize reaction behavior directly on each post.

## Core behavior

- Custom reactions appear inline under a post's Like button on hover/focus.
- Each custom item maps to one native LinkedIn reaction type.
- You can hide built-in LinkedIn reactions from the picker.
- Settings are stored with `chrome.storage.sync`.

## Important constraint

LINKED customizes the LinkedIn UI and interaction flow, but it does not create new backend LinkedIn reaction types. All sends map to LinkedIn's official reaction set.

## Install (Developer mode)

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this `LINKED` folder
5. Open LinkedIn and configure reactions in the extension popup

## Files

- `manifest.json`: extension config
- `popup.*`: settings UI for add/delete/hide options
- `content.js`: per-post reaction panel, selectors, and mapping logic
- `widget.css`: inline panel styling
