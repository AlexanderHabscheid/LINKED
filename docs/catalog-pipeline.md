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

## Generate reaction catalog from dedicated sticker assets

Use this when you have a licensed sticker set and want a sticker-first library.

1. Create a manifest using `catalog/sticker-manifest.example.json` as a template.
2. Point each item to a local `file` path or a downloadable image `url`.
3. Build the catalog:

```bash
cd /Users/ahabscheid/Downloads/LINKED
npm run catalog:stickers -- --manifest ./catalog/sticker-manifest.example.json --out ./reaction-catalog.js --limit 500
```

4. Reload the extension in `chrome://extensions`.

### Manifest format

- `source.provider`: catalog provider name
- `source.license`: license/usage terms you are allowed to ship
- `source.url`: source landing page
- `items[]`:
  - `label` (required)
  - `category` (optional, defaults to `Stickers`)
  - `linkedInType` (optional, auto-inferred when missing)
  - `keywords` (optional)
  - `emoji` (optional)
  - `file` OR `url` OR `assetData` (at least one image source required)

## Licensing and rights

- Do not scrape/copy copyrighted sticker libraries into distributable builds unless you have rights.
- Keep provider/license attribution accurate for every generated catalog.
