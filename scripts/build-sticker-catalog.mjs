#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const args = {
    manifest: "",
    out: path.resolve(process.cwd(), "reaction-catalog.js"),
    limit: 500
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--manifest") {
      args.manifest = path.resolve(argv[++i] || "");
    } else if (arg === "--out") {
      args.out = path.resolve(argv[++i] || args.out);
    } else if (arg === "--limit") {
      const limit = Number(argv[++i]);
      if (Number.isFinite(limit) && limit > 0) {
        args.limit = Math.floor(limit);
      }
    }
  }

  return args;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeWords(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferLinkedInType(entry) {
  const explicit = normalizeWords(entry.linkedInType);
  if (["like", "celebrate", "support", "love", "insightful", "funny"].includes(explicit)) {
    return explicit;
  }

  const bag = normalizeWords([
    entry.label,
    entry.category,
    Array.isArray(entry.keywords) ? entry.keywords.join(" ") : ""
  ].join(" "));

  if (/laugh|fun|meme|lol|joke|silly/.test(bag)) return "funny";
  if (/heart|love|romance|hug|affection/.test(bag)) return "love";
  if (/insight|brain|book|think|idea|smart|study|chart/.test(bag)) return "insightful";
  if (/party|fire|wow|star|trophy|rocket|win|celebr/.test(bag)) return "celebrate";
  if (/care|support|help|solidarity|kind/.test(bag)) return "support";
  return "like";
}

function extToMime(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

function toDataUrlFromFile(filePath) {
  const mime = extToMime(filePath);
  const bytes = fs.readFileSync(filePath);
  if (mime === "image/svg+xml") {
    return `data:${mime};charset=utf-8,${encodeURIComponent(bytes.toString("utf8"))}`;
  }
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

async function toDataUrlFromUrl(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed downloading ${url}: ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "image/png";
  const buf = Buffer.from(await response.arrayBuffer());

  if (contentType.includes("svg")) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(buf.toString("utf8"))}`;
  }

  return `data:${contentType};base64,${buf.toString("base64")}`;
}

function toCatalogOutput(entries, sourceMeta) {
  const categories = [
    "All",
    ...Array.from(new Set(entries.map((item) => item.category))).sort((a, b) => a.localeCompare(b))
  ];

  return `const REACTION_CATALOG_SOURCE = ${JSON.stringify(sourceMeta, null, 2)};\n\n` +
    `const REACTION_CATALOG = ${JSON.stringify(entries, null, 2)};\n\n` +
    `const REACTION_CATALOG_CATEGORIES = ${JSON.stringify(categories, null, 2)};\n\n` +
    `globalThis.REACTION_CATALOG_SOURCE = REACTION_CATALOG_SOURCE;\n` +
    `globalThis.REACTION_CATALOG = REACTION_CATALOG;\n` +
    `globalThis.REACTION_CATALOG_CATEGORIES = REACTION_CATALOG_CATEGORIES;\n`;
}

function dedupe(entries) {
  const seen = new Set();
  const out = [];
  for (const entry of entries) {
    const key = `${entry.label.toLowerCase()}::${entry.category.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  return out;
}

async function run() {
  const args = parseArgs(process.argv);
  if (!args.manifest) {
    throw new Error("Missing required --manifest <path-to-sticker-manifest.json>");
  }
  if (!fs.existsSync(args.manifest)) {
    throw new Error(`Manifest not found: ${args.manifest}`);
  }

  const manifestRaw = JSON.parse(fs.readFileSync(args.manifest, "utf8"));
  const sourceMeta = {
    provider: normalizeText(manifestRaw?.source?.provider) || "Custom Sticker Set",
    license: normalizeText(manifestRaw?.source?.license) || "Unknown",
    url: normalizeText(manifestRaw?.source?.url) || "",
    generatedAt: new Date().toISOString()
  };

  const items = Array.isArray(manifestRaw?.items) ? manifestRaw.items : [];
  if (!items.length) {
    throw new Error("Manifest has no items");
  }

  const baseDir = path.dirname(args.manifest);
  const out = [];

  for (const item of items.slice(0, args.limit)) {
    const label = normalizeText(item.label);
    const category = normalizeText(item.category) || "Stickers";
    if (!label) continue;

    let assetData = normalizeText(item.assetData);
    if (!assetData) {
      const localFile = normalizeText(item.file);
      const imageUrl = normalizeText(item.url);
      if (localFile) {
        const filePath = path.resolve(baseDir, localFile);
        if (!fs.existsSync(filePath)) {
          throw new Error(`Sticker file missing: ${filePath}`);
        }
        assetData = toDataUrlFromFile(filePath);
      } else if (imageUrl) {
        assetData = await toDataUrlFromUrl(imageUrl);
      }
    }

    if (!assetData.startsWith("data:image/")) continue;

    const entry = {
      emoji: normalizeText(item.emoji),
      label,
      category,
      linkedInType: inferLinkedInType(item),
      keywords: Array.isArray(item.keywords)
        ? item.keywords.map((word) => normalizeWords(word)).filter(Boolean)
        : [],
      source: normalizeText(item.source) || "custom-sticker",
      assetType: "upload",
      assetData
    };

    out.push(entry);
  }

  const deduped = dedupe(out);
  const output = toCatalogOutput(deduped, sourceMeta);
  fs.writeFileSync(args.out, output, "utf8");
  console.log(`Generated ${deduped.length} sticker entries -> ${args.out}`);
}

run().catch((error) => {
  console.error(`[build-sticker-catalog] ${error.message}`);
  process.exit(1);
});
