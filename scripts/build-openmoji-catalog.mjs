#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const args = {
    openmoji: "",
    out: path.resolve(process.cwd(), "reaction-catalog.js"),
    limit: 300
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--openmoji") {
      args.openmoji = argv[++i] || "";
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

function mustExist(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} not found: ${filePath}`);
  }
}

function normalizeWords(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferLinkedInType(meta) {
  const bag = normalizeWords([
    meta.annotation,
    meta.group,
    meta.subgroups,
    Array.isArray(meta.tags) ? meta.tags.join(" ") : ""
  ].join(" "));

  if (/laugh|fun|smile|joke|grin/.test(bag)) return "funny";
  if (/heart|love|romance|kiss/.test(bag)) return "love";
  if (/idea|light|brain|book|think|search|chart|study|science/.test(bag)) return "insightful";
  if (/clap|party|trophy|rocket|spark|star|medal|award/.test(bag)) return "celebrate";
  if (/help|care|pray|hug|handshake|support|together/.test(bag)) return "support";
  return "like";
}

function categoryFromGroup(meta) {
  const group = String(meta.group || "General").trim();
  if (group === "Smileys & Emotion") return "Emotion";
  if (group === "People & Body") return "People";
  if (group === "Objects") return "Objects";
  if (group === "Activities") return "Activities";
  if (group === "Symbols") return "Symbols";
  return group;
}

function toDataUrlSvg(svgText) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
}

function loadSvg(openmojiRoot, hexcode) {
  const candidates = [
    path.join(openmojiRoot, "color", "svg", `${hexcode}.svg`),
    path.join(openmojiRoot, "black", "svg", `${hexcode}.svg`)
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return fs.readFileSync(candidate, "utf8");
    }
  }

  return "";
}

function toCatalogEntry(openmojiRoot, row) {
  const emoji = String(row.emoji || "").trim();
  const label = String(row.annotation || "").trim();
  const hexcode = String(row.hexcode || "").trim().toUpperCase();
  if (!emoji || !label || !hexcode) return null;

  const svgText = loadSvg(openmojiRoot, hexcode);
  const keywords = Array.isArray(row.tags)
    ? row.tags.map((tag) => normalizeWords(tag)).filter(Boolean)
    : [];

  const entry = {
    emoji,
    label: label
      .split(" ")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" "),
    category: categoryFromGroup(row),
    linkedInType: inferLinkedInType(row),
    keywords,
    source: "openmoji"
  };

  if (svgText) {
    entry.assetType = "upload";
    entry.assetData = toDataUrlSvg(svgText);
  }

  return entry;
}

function uniqueByLabel(entries) {
  const seen = new Set();
  const out = [];
  for (const entry of entries) {
    const key = `${entry.label.toLowerCase()}::${entry.linkedInType}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  return out;
}

function buildOutput(entries) {
  const categories = [
    "All",
    ...Array.from(new Set(entries.map((item) => item.category))).sort((a, b) => a.localeCompare(b))
  ];

  const sourceMeta = {
    provider: "OpenMoji",
    license: "CC BY-SA 4.0",
    url: "https://openmoji.org",
    generatedAt: new Date().toISOString()
  };

  return `const REACTION_CATALOG_SOURCE = ${JSON.stringify(sourceMeta, null, 2)};\n\n` +
    `const REACTION_CATALOG = ${JSON.stringify(entries, null, 2)};\n\n` +
    `const REACTION_CATALOG_CATEGORIES = ${JSON.stringify(categories, null, 2)};\n`;
}

function run() {
  const args = parseArgs(process.argv);
  if (!args.openmoji) {
    throw new Error("Missing required --openmoji <path-to-openmoji-repo>");
  }

  const openmojiRoot = path.resolve(args.openmoji);
  const metadataPath = path.join(openmojiRoot, "data", "openmoji.json");

  mustExist(openmojiRoot, "OpenMoji path");
  mustExist(metadataPath, "OpenMoji metadata");

  const rows = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
  if (!Array.isArray(rows)) {
    throw new Error("openmoji.json is not an array");
  }

  const mapped = rows
    .map((row) => toCatalogEntry(openmojiRoot, row))
    .filter(Boolean);

  const deduped = uniqueByLabel(mapped).slice(0, args.limit);
  const output = buildOutput(deduped);

  fs.writeFileSync(args.out, output, "utf8");
  console.log(`Generated ${deduped.length} entries -> ${args.out}`);
}

try {
  run();
} catch (error) {
  console.error(`[build-openmoji-catalog] ${error.message}`);
  process.exit(1);
}
