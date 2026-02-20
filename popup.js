const SYNC_DEFAULTS = {
  hiddenBuiltins: []
};

const LOCAL_DEFAULTS = {
  reactionPacks: [],
  activePackId: ""
};

const REACTIONS = [
  { type: "like", label: "Like" },
  { type: "celebrate", label: "Celebrate" },
  { type: "support", label: "Support" },
  { type: "love", label: "Love" },
  { type: "insightful", label: "Insightful" },
  { type: "funny", label: "Funny" }
];

const TYPE_ALIASES = {
  like: "like",
  celebrate: "celebrate",
  support: "support",
  love: "love",
  insightful: "insightful",
  funny: "funny",
  praise: "celebrate",
  empathy: "support",
  interest: "love",
  appreciation: "insightful",
  maybe: "funny"
};

const ASSET_TYPES = new Set(["emoji", "upload", "avatar"]);
const REACTION_TYPES = new Set(REACTIONS.map((item) => item.type));

const catalogSearchEl = document.getElementById("catalogSearch");
const catalogCategoryEl = document.getElementById("catalogCategory");
const catalogKindControlsEl = document.getElementById("catalogKindControls");
const catalogGridEl = document.getElementById("catalogGrid");
const catalogAttributionEl = document.getElementById("catalogAttribution");

const labelEl = document.getElementById("label");
const assetModeEl = document.getElementById("assetMode");
const linkedInTypeEl = document.getElementById("linkedInType");
const emojiEl = document.getElementById("emoji");
const imageFileEl = document.getElementById("imageFile");
const uploadPreviewEl = document.getElementById("uploadPreview");
const avatarInitialsEl = document.getElementById("avatarInitials");
const avatarMoodEl = document.getElementById("avatarMood");
const avatarColorEl = document.getElementById("avatarColor");
const emojiFieldsEl = document.getElementById("emojiFields");
const uploadFieldsEl = document.getElementById("uploadFields");
const avatarFieldsEl = document.getElementById("avatarFields");
const addBtn = document.getElementById("addBtn");

const previewTrayEl = document.getElementById("previewTray");
const customListEl = document.getElementById("customList");
const builtinTogglesEl = document.getElementById("builtinToggles");
const feedbackEl = document.getElementById("formFeedback");

let uploadDataUrl = "";
let catalogViewKind = "sticker";
let appState = {
  reactionPacks: [],
  activePackId: "",
  hiddenBuiltins: []
};

function normalizeType(type) {
  return TYPE_ALIASES[String(type || "").trim().toLowerCase()] || null;
}

function normalizeAssetType(type) {
  const normalized = String(type || "").trim().toLowerCase();
  return ASSET_TYPES.has(normalized) ? normalized : "emoji";
}

function isImageDataUrl(value) {
  return /^data:image\//.test(String(value || ""));
}

function displayType(type) {
  const normalized = normalizeType(type);
  const hit = REACTIONS.find((item) => item.type === normalized);
  return hit ? hit.label : type;
}

function setFeedback(message, isError = false) {
  feedbackEl.textContent = message || "";
  feedbackEl.classList.toggle("error", Boolean(isError));
}

function uid() {
  return `pack_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function sanitizeHiddenBuiltins(items) {
  if (!Array.isArray(items)) return [];

  const output = [];
  const seen = new Set();
  for (const item of items) {
    const normalized = normalizeType(item);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(normalized);
  }
  return output;
}

function sanitizeCustomReaction(item) {
  if (!item || typeof item !== "object") return null;

  const label = String(item.label || "").trim();
  const linkedInType = normalizeType(item.linkedInType);
  const assetType = normalizeAssetType(item.assetType || (item.assetData ? "upload" : "emoji"));
  const emoji = String(item.emoji || "").trim();
  const assetData = String(item.assetData || "").trim();

  if (!label || !linkedInType || !REACTION_TYPES.has(linkedInType)) return null;
  if (assetType === "emoji" && !emoji) return null;
  if ((assetType === "upload" || assetType === "avatar") && !isImageDataUrl(assetData)) return null;

  return {
    label,
    linkedInType,
    assetType,
    emoji: assetType === "emoji" ? emoji : "",
    assetData: assetType === "emoji" ? "" : assetData
  };
}

function sanitizePack(pack, fallbackName = "My Pack") {
  if (!pack || typeof pack !== "object") return null;

  const id = String(pack.id || "").trim() || uid();
  const name = String(pack.name || fallbackName).trim().slice(0, 24) || fallbackName;
  const reactions = (Array.isArray(pack.reactions) ? pack.reactions : [])
    .map(sanitizeCustomReaction)
    .filter(Boolean);

  return { id, name, reactions };
}

function createDefaultPack(reactions = []) {
  return {
    id: uid(),
    name: "Main Pack",
    reactions: reactions.map(sanitizeCustomReaction).filter(Boolean)
  };
}

function getActivePack() {
  return appState.reactionPacks.find((pack) => pack.id === appState.activePackId) || appState.reactionPacks[0] || null;
}

async function persistLocal() {
  await chrome.storage.local.set({
    reactionPacks: appState.reactionPacks,
    activePackId: appState.activePackId
  });
}

async function persistSyncHidden() {
  await chrome.storage.sync.set({ hiddenBuiltins: appState.hiddenBuiltins });
}

async function migrateAndLoadState() {
  const [syncState, localState] = await Promise.all([
    chrome.storage.sync.get(SYNC_DEFAULTS),
    chrome.storage.local.get(LOCAL_DEFAULTS)
  ]);

  let packs = [];
  if (Array.isArray(localState.reactionPacks) && localState.reactionPacks.length > 0) {
    packs = localState.reactionPacks.map((pack) => sanitizePack(pack)).filter(Boolean);
  }

  // Backward compatibility from previous single-list model.
  if (!packs.length) {
    const oldFromLocal = Array.isArray(localState.customReactions) ? localState.customReactions : [];
    const oldFromSync = Array.isArray(syncState.customReactions) ? syncState.customReactions : [];
    const old = oldFromLocal.length ? oldFromLocal : oldFromSync;
    packs = [createDefaultPack(old)];
  }

  const hiddenBuiltins = sanitizeHiddenBuiltins(syncState.hiddenBuiltins);
  let activePackId = String(localState.activePackId || "").trim();
  if (!packs.some((pack) => pack.id === activePackId)) {
    activePackId = packs[0].id;
  }

  appState = { reactionPacks: packs, activePackId, hiddenBuiltins };

  await persistLocal();
  await persistSyncHidden();

  if (Array.isArray(syncState.customReactions)) {
    await chrome.storage.sync.remove("customReactions");
  }
  if (Array.isArray(localState.customReactions)) {
    await chrome.storage.local.remove("customReactions");
  }
}

function toggleAssetModeFields() {
  const mode = normalizeAssetType(assetModeEl.value);
  emojiFieldsEl.classList.toggle("hidden", mode !== "emoji");
  uploadFieldsEl.classList.toggle("hidden", mode !== "upload");
  avatarFieldsEl.classList.toggle("hidden", mode !== "avatar");
}

function renderAssetPreview(dataUrl) {
  if (isImageDataUrl(dataUrl)) {
    uploadPreviewEl.src = dataUrl;
    uploadPreviewEl.classList.remove("hidden");
  } else {
    uploadPreviewEl.removeAttribute("src");
    uploadPreviewEl.classList.add("hidden");
  }
}

function generateAvatarDataUrl(initials, mood, color) {
  const safeInitials = String(initials || "").trim().slice(0, 3).toUpperCase() || "ME";
  const safeMood = String(mood || "🙂").trim().slice(0, 2) || "🙂";
  const safeColor = /^#[0-9a-fA-F]{6}$/.test(String(color || "")) ? color : "#0a66c2";

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${safeColor}" />
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0.35" />
        </linearGradient>
      </defs>
      <circle cx="48" cy="48" r="46" fill="url(#g)" />
      <circle cx="48" cy="48" r="36" fill="rgba(255,255,255,0.3)" />
      <text x="48" y="54" text-anchor="middle" font-size="24" font-family="Arial, sans-serif" fill="#0f172a" font-weight="700">${safeInitials}</text>
      <text x="72" y="84" text-anchor="middle" font-size="18">${safeMood}</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

async function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed reading image"));
    reader.readAsDataURL(file);
  });
}

async function toSquareDataUrl(rawDataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const size = 96;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas unavailable"));
        return;
      }

      ctx.clearRect(0, 0, size, size);
      const minSide = Math.min(img.width, img.height);
      const sx = (img.width - minSide) / 2;
      const sy = (img.height - minSide) / 2;
      ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
      resolve(canvas.toDataURL("image/png", 0.92));
    };
    img.onerror = () => reject(new Error("Invalid image"));
    img.src = rawDataUrl;
  });
}

function draftFromInput() {
  const mode = normalizeAssetType(assetModeEl.value);

  if (mode === "emoji") {
    return sanitizeCustomReaction({
      label: labelEl.value,
      linkedInType: linkedInTypeEl.value,
      assetType: "emoji",
      emoji: emojiEl.value
    });
  }

  if (mode === "upload") {
    return sanitizeCustomReaction({
      label: labelEl.value,
      linkedInType: linkedInTypeEl.value,
      assetType: "upload",
      assetData: uploadDataUrl
    });
  }

  return sanitizeCustomReaction({
    label: labelEl.value,
    linkedInType: linkedInTypeEl.value,
    assetType: "avatar",
    assetData: generateAvatarDataUrl(avatarInitialsEl.value, avatarMoodEl.value, avatarColorEl.value)
  });
}

function validateInputs() {
  const label = String(labelEl.value || "").trim();
  const linkedInType = normalizeType(linkedInTypeEl.value);
  const mode = normalizeAssetType(assetModeEl.value);

  if (!label) return "Enter a reaction name.";
  if (!linkedInType) return "Choose a LinkedIn mapping type.";
  if (mode === "emoji" && !String(emojiEl.value || "").trim()) return "Enter an emoji.";
  if (mode === "upload" && !isImageDataUrl(uploadDataUrl)) return "Upload an image first.";
  return null;
}

function buildPreviewVisual(item, isDraft = false) {
  const el = document.createElement("div");
  el.className = `preview-item${isDraft ? " draft" : ""}`;
  el.title = `${item.label} -> ${displayType(item.linkedInType)}`;

  if ((item.assetType === "upload" || item.assetType === "avatar") && isImageDataUrl(item.assetData)) {
    const img = document.createElement("img");
    img.src = item.assetData;
    img.alt = item.label;
    img.className = "preview-image";
    el.appendChild(img);
  } else {
    el.textContent = item.emoji || "🙂";
  }

  return el;
}

function inferTypeFromCatalogItem(item) {
  const normalized = normalizeType(item.linkedInType);
  if (normalized) {
    return normalized;
  }

  const category = String(item.category || "").toLowerCase();
  if (category.includes("celebr")) return "celebrate";
  if (category.includes("support")) return "support";
  if (category.includes("love")) return "love";
  if (category.includes("insight") || category.includes("learn") || category.includes("tech")) return "insightful";
  if (category.includes("fun")) return "funny";
  return "like";
}

function initCatalogCategories() {
  catalogCategoryEl.innerHTML = "";
  const categories = Array.isArray(globalThis.REACTION_CATALOG_CATEGORIES)
    ? globalThis.REACTION_CATALOG_CATEGORIES
    : ["All"];

  categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    catalogCategoryEl.appendChild(option);
  });
}

function renderCatalogAttribution() {
  const source = globalThis.REACTION_CATALOG_SOURCE || {};
  const provider = source.provider ? String(source.provider) : "Catalog";
  const license = source.license ? String(source.license) : "";
  const generatedAt = source.generatedAt ? String(source.generatedAt) : "";

  let text = provider;
  if (license) {
    text += ` • ${license}`;
  }
  if (generatedAt && generatedAt !== "manual") {
    text += ` • ${new Date(generatedAt).toLocaleDateString()}`;
  }
  if (source.url) {
    text += ` • ${source.url}`;
  }

  catalogAttributionEl.textContent = text;
}

function catalogItemKind(item) {
  const hasSticker = isImageDataUrl(item?.assetData) || String(item?.assetType || "").toLowerCase() === "upload";
  const hasEmoji = String(item?.emoji || "").trim().length > 0;

  if (hasSticker && hasEmoji) return "both";
  if (hasSticker) return "sticker";
  return "emoji";
}

function matchesCatalogKind(item, kind) {
  const itemKind = catalogItemKind(item);
  if (kind === "all") return true;
  if (itemKind === "both") return kind === "emoji" || kind === "sticker";
  return itemKind === kind;
}

function renderCatalogKindControls() {
  if (!catalogKindControlsEl) return;
  for (const button of catalogKindControlsEl.querySelectorAll("button[data-kind]")) {
    const kind = String(button.dataset.kind || "all");
    button.classList.toggle("active", kind === catalogViewKind);
  }
}

function loadCatalogItemIntoCreator(item) {
  if (!item || typeof item !== "object") return;

  labelEl.value = String(item.label || "").slice(0, 20);
  linkedInTypeEl.value = inferTypeFromCatalogItem(item);

  if (isImageDataUrl(item.assetData)) {
    assetModeEl.value = "upload";
    uploadDataUrl = item.assetData;
    renderAssetPreview(uploadDataUrl);
  } else {
    assetModeEl.value = "emoji";
    emojiEl.value = String(item.emoji || "").trim();
    uploadDataUrl = "";
    renderAssetPreview("");
  }

  toggleAssetModeFields();
  setFeedback(`Loaded ${item.label}. Adjust if needed, then click Add Custom Reaction.`);
  refreshUI();
}

function renderCatalog() {
  const query = String(catalogSearchEl.value || "").trim().toLowerCase();
  const selectedCategory = String(catalogCategoryEl.value || "All");
  const source = Array.isArray(globalThis.REACTION_CATALOG) ? globalThis.REACTION_CATALOG : [];

  const filtered = source.filter((item) => {
    const categoryMatch = selectedCategory === "All" || item.category === selectedCategory;
    if (!categoryMatch) return false;
    if (!matchesCatalogKind(item, catalogViewKind)) return false;
    if (!query) return true;

    const haystack = [
      item.label,
      item.emoji,
      item.category,
      ...(Array.isArray(item.keywords) ? item.keywords : [])
    ].join(" ").toLowerCase();

    return haystack.includes(query);
  });

  catalogGridEl.innerHTML = "";
  renderCatalogKindControls();

  if (!filtered.length) {
    const empty = document.createElement("div");
    empty.className = "preview-empty";
    empty.textContent = "No matches";
    catalogGridEl.appendChild(empty);
    return;
  }

  filtered.slice(0, 140).forEach((item) => {
    const kind = catalogItemKind(item);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `catalog-item catalog-item-kind-${kind}`;
    button.title = `${item.label} (${item.category}) • ${kind}`;

    const icon = document.createElement("span");
    icon.className = "catalog-item-emoji";
    const forceEmojiVisual = catalogViewKind === "emoji";
    if (!forceEmojiVisual && isImageDataUrl(item.assetData)) {
      const img = document.createElement("img");
      img.src = item.assetData;
      img.alt = item.label;
      img.loading = "lazy";
      icon.appendChild(img);
    } else {
      icon.textContent = item.emoji;
    }

    const text = document.createElement("span");
    text.className = "catalog-item-label";
    text.textContent = item.label;

    const category = document.createElement("span");
    category.className = "catalog-item-category";
    category.textContent = item.category;

    button.appendChild(icon);
    button.appendChild(text);
    button.appendChild(category);

    button.addEventListener("click", () => loadCatalogItemIntoCreator(item));
    catalogGridEl.appendChild(button);
  });
}

function renderPreviewTray(activeReactions, draft = null) {
  previewTrayEl.innerHTML = "";
  const combined = [...activeReactions];
  if (draft) combined.push(draft);

  if (!combined.length) {
    const empty = document.createElement("div");
    empty.className = "preview-empty";
    empty.textContent = "No reactions yet";
    previewTrayEl.appendChild(empty);
    return;
  }

  combined.forEach((item, index) => {
    previewTrayEl.appendChild(buildPreviewVisual(item, Boolean(draft && index === combined.length - 1)));
  });
}

function renderCustomList(activeReactions) {
  customListEl.innerHTML = "";
  if (!activeReactions.length) {
    const li = document.createElement("li");
    li.textContent = "No custom reactions yet";
    customListEl.appendChild(li);
    return;
  }

  activeReactions.forEach((item, index) => {
    const li = document.createElement("li");

    const left = document.createElement("div");
    left.className = "item-left";

    const thumb = document.createElement("div");
    thumb.className = "item-thumb";
    if ((item.assetType === "upload" || item.assetType === "avatar") && isImageDataUrl(item.assetData)) {
      const img = document.createElement("img");
      img.src = item.assetData;
      img.alt = item.label;
      img.className = "item-thumb-image";
      thumb.appendChild(img);
    } else {
      thumb.textContent = item.emoji || "🙂";
    }

    const text = document.createElement("span");
    text.textContent = `${item.label} -> ${displayType(item.linkedInType)}`;

    left.appendChild(thumb);
    left.appendChild(text);

    const actions = document.createElement("div");
    actions.className = "item-actions";

    const upBtn = document.createElement("button");
    upBtn.textContent = "Up";
    upBtn.disabled = index === 0;
    upBtn.addEventListener("click", () => moveCustom(index, -1));

    const downBtn = document.createElement("button");
    downBtn.textContent = "Down";
    downBtn.disabled = index === activeReactions.length - 1;
    downBtn.addEventListener("click", () => moveCustom(index, 1));

    const removeBtn = document.createElement("button");
    removeBtn.textContent = "Delete";
    removeBtn.className = "danger";
    removeBtn.addEventListener("click", () => removeCustom(index));

    actions.appendChild(upBtn);
    actions.appendChild(downBtn);
    actions.appendChild(removeBtn);

    li.appendChild(left);
    li.appendChild(actions);
    customListEl.appendChild(li);
  });
}

function renderBuiltinToggles() {
  builtinTogglesEl.innerHTML = "";
  REACTIONS.forEach((reaction) => {
    const row = document.createElement("label");
    row.className = "toggle-row";
    row.innerHTML = `<span>${reaction.label}</span>`;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = appState.hiddenBuiltins.includes(reaction.type);
    checkbox.addEventListener("change", () => toggleBuiltin(reaction.type, checkbox.checked));

    row.appendChild(checkbox);
    builtinTogglesEl.appendChild(row);
  });
}

function refreshUI() {
  const activePack = getActivePack();
  renderBuiltinToggles();
  renderCustomList(activePack ? activePack.reactions : []);
  renderPreviewTray(activePack ? activePack.reactions : [], draftFromInput());
  renderCatalog();
}

function resetCreatorInputs() {
  labelEl.value = "";
  emojiEl.value = "";
  imageFileEl.value = "";
  uploadDataUrl = "";
  renderAssetPreview("");
}

async function removeCustom(index) {
  const pack = getActivePack();
  if (!pack) return;

  pack.reactions.splice(index, 1);
  await persistLocal();
  setFeedback("Removed reaction.");
  refreshUI();
}

async function moveCustom(index, offset) {
  const pack = getActivePack();
  if (!pack) return;

  const nextIndex = index + offset;
  if (nextIndex < 0 || nextIndex >= pack.reactions.length) return;

  const next = [...pack.reactions];
  const [item] = next.splice(index, 1);
  next.splice(nextIndex, 0, item);
  pack.reactions = next;

  await persistLocal();
  setFeedback("Updated order.");
  refreshUI();
}

async function toggleBuiltin(type, shouldHide) {
  const set = new Set(appState.hiddenBuiltins);
  if (shouldHide) set.add(type);
  else set.delete(type);
  appState.hiddenBuiltins = [...set];
  await persistSyncHidden();
}

addBtn.addEventListener("click", async () => {
  const validationError = validateInputs();
  if (validationError) {
    setFeedback(validationError, true);
    return;
  }

  const draft = draftFromInput();
  if (!draft) {
    setFeedback("Could not build reaction.", true);
    return;
  }

  const pack = getActivePack();
  if (!pack) {
    setFeedback("No reaction tray available.", true);
    return;
  }

  pack.reactions.push(draft);
  await persistLocal();
  resetCreatorInputs();
  setFeedback("Added reaction.");
  refreshUI();
});

imageFileEl.addEventListener("change", async () => {
  try {
    const file = imageFileEl.files?.[0];
    if (!file) {
      uploadDataUrl = "";
      renderAssetPreview("");
      refreshUI();
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setFeedback("Image must be under 2MB.", true);
      return;
    }

    const raw = await readFileAsDataUrl(file);
    uploadDataUrl = await toSquareDataUrl(raw);
    renderAssetPreview(uploadDataUrl);
    refreshUI();
  } catch {
    setFeedback("Could not load image.", true);
  }
});

assetModeEl.addEventListener("change", () => {
  toggleAssetModeFields();
  refreshUI();
});

catalogSearchEl.addEventListener("input", () => {
  renderCatalog();
});

catalogCategoryEl.addEventListener("change", () => {
  renderCatalog();
});

if (catalogKindControlsEl) {
  catalogKindControlsEl.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const btn = target.closest("button[data-kind]");
    if (!btn) return;
    const nextKind = String(btn.getAttribute("data-kind") || "all");
    if (!["all", "emoji", "sticker"].includes(nextKind)) return;
    catalogViewKind = nextKind;
    renderCatalog();
  });
}

for (const el of [labelEl, emojiEl, linkedInTypeEl, avatarInitialsEl, avatarMoodEl, avatarColorEl]) {
  el.addEventListener("input", () => {
    if (feedbackEl.classList.contains("error")) {
      setFeedback("");
    }
    refreshUI();
  });
}

chrome.storage.onChanged.addListener(async (_changes, areaName) => {
  if (areaName === "local" || areaName === "sync") {
    await migrateAndLoadState();
    refreshUI();
  }
});

(async () => {
  await migrateAndLoadState();
  toggleAssetModeFields();
  initCatalogCategories();
  renderCatalogAttribution();
  refreshUI();
})();
