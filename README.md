# LINKED

Chrome extension widget for LinkedIn that lets you:

- Add your own custom quick-reaction buttons
- Map each custom reaction to a LinkedIn built-in reaction type
- Hide/remove built-in LinkedIn reactions from the UI

## What this can and cannot do

- It can customize your local LinkedIn interface and speed up how you send reactions.
- It cannot create new official LinkedIn backend reaction types (LinkedIn only supports its built-in set).

## Install (Developer mode)

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this folder (`LINKED`)
5. Open LinkedIn and use the extension popup to configure reactions

## Files

- `manifest.json`: Extension config
- `popup.*`: Settings UI for add/remove/hide options
- `content.js`: LinkedIn page widget + reaction controls
- `widget.css`: Widget styling
