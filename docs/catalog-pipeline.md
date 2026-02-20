# LINKED Catalog Pipeline

## Why this pipeline exists

- Emojipedia is great for discovery, but this extension should not scrape/copy site assets directly.
- LINKED uses a local, auditable generation pipeline from OpenMoji assets instead.

## Generate reaction catalog from OpenMoji

1. Clone OpenMoji locally:

```bash
git clone https://github.com/hfg-gmuend/openmoji.git /tmp/openmoji
```

2. Build `reaction-catalog.js` for LINKED:

```bash
cd /Users/ahabscheid/Downloads/LINKED
npm run catalog:openmoji -- --openmoji /tmp/openmoji --out ./reaction-catalog.js --limit 320
```

3. Reload the extension in `chrome://extensions`.

## Output format

The generated `reaction-catalog.js` exports:

- `REACTION_CATALOG_SOURCE`: provider/license/URL metadata
- `REACTION_CATALOG`: searchable catalog entries with mapping + optional SVG data URL
- `REACTION_CATALOG_CATEGORIES`: category filters

## Licensing note

OpenMoji assets are CC BY-SA 4.0. Keep attribution visible in the UI and docs.
