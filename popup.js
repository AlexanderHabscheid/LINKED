const SYNC_DEFAULTS = {
  hiddenBuiltins: []
};

const LOCAL_DEFAULTS = {
  customReactions: []
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
const customListEl = document.getElementById("customList");
const builtinTogglesEl = document.getElementById("builtinToggles");
const exportBtn = document.getElementById("exportBtn");
const importBtn = document.getElementById("importBtn");
const previewTrayEl = document.getElementById("previewTray");
const feedbackEl = document.getElementById("formFeedback");

let uploadDataUrl = "";

function normalizeType(type) {
  return TYPE_ALIASES[String(type || "").trim().toLowerCase()] || null;
}

function normalizeAssetType(type) {
  const normalized = String(type || "").trim().toLowerCase();
  return ASSET_TYPES.has(normalized) ? normalized : "emoji";
}

function displayType(type) {
  const normalized = normalizeType(type);
  const hit = REACTIONS.find((item) => item.type === normalized);
  return hit ? hit.label : type;
}

function isImageDataUrl(value) {
  return /^data:image\//.test(String(value || ""));
}

function setFeedback(message, isError = false) {
  feedbackEl.textContent = message || "";
  feedbackEl.classList.toggle("error", Boolean(isError));
}

function sanitizeHiddenBuiltins(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  const seen = new Set();
  const output = [];

  for (const item of items) {
    const normalized = normalizeType(item);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
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

  if (!label || !linkedInType || !REACTION_TYPES.has(linkedInType)) {
    return null;
  }

  if (assetType === "emoji" && !emoji) {
    return null;
  }

  if ((assetType === "upload" || assetType === "avatar") && !isImageDataUrl(assetData)) {
    return null;
  }

  return {
    label,
    linkedInType,
    assetType,
    emoji: assetType === "emoji" ? emoji : "",
    assetData: assetType === "emoji" ? "" : assetData
  };
}

async function getSyncState() {
  return chrome.storage.sync.get(SYNC_DEFAULTS);
}

async function getLocalState() {
  return chrome.storage.local.get(LOCAL_DEFAULTS);
}

async function saveSyncState(next) {
  await chrome.storage.sync.set(next);
}

async function saveLocalState(next) {
  await chrome.storage.local.set(next);
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

async function migrateStateIfNeeded() {
  const [syncState, localState] = await Promise.all([getSyncState(), getLocalState()]);

  let sourceCustom = localState.customReactions;
  if ((!Array.isArray(sourceCustom) || sourceCustom.length === 0) && Array.isArray(syncState.customReactions)) {
    sourceCustom = syncState.customReactions;
  }

  const customReactions = (sourceCustom || [])
    .map(sanitizeCustomReaction)
    .filter(Boolean);

  const hiddenBuiltins = sanitizeHiddenBuiltins(syncState.hiddenBuiltins);

  const localChanged = JSON.stringify(customReactions) !== JSON.stringify(localState.customReactions || []);
  const syncHiddenChanged = JSON.stringify(hiddenBuiltins) !== JSON.stringify(syncState.hiddenBuiltins || []);

  if (localChanged) {
    await saveLocalState({ customReactions });
  }

  if (syncHiddenChanged) {
    await saveSyncState({ hiddenBuiltins });
  }

  if (Array.isArray(syncState.customReactions)) {
    await chrome.storage.sync.remove("customReactions");
  }

  return { customReactions, hiddenBuiltins };
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

function renderPreviewTray(items, draft = null) {
  previewTrayEl.innerHTML = "";
  const combined = [...items];
  if (draft) {
    combined.push(draft);
  }

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

function renderBuiltinToggles(hiddenBuiltins) {
  builtinTogglesEl.innerHTML = "";

  REACTIONS.forEach((reaction) => {
    const row = document.createElement("label");
    row.className = "toggle-row";
    row.innerHTML = `<span>${reaction.label}</span>`;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = hiddenBuiltins.includes(reaction.type);
    checkbox.addEventListener("change", () => toggleBuiltin(reaction.type, checkbox.checked));

    row.appendChild(checkbox);
    builtinTogglesEl.appendChild(row);
  });
}

function renderCustomList(items) {
  customListEl.innerHTML = "";
  if (!items.length) {
    const li = document.createElement("li");
    li.textContent = "No custom reactions yet";
    customListEl.appendChild(li);
    return;
  }

  items.forEach((item, index) => {
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
    downBtn.disabled = index === items.length - 1;
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

async function loadState() {
  const state = await migrateStateIfNeeded();
  renderCustomList(state.customReactions);
  renderBuiltinToggles(state.hiddenBuiltins);
  renderPreviewTray(state.customReactions, draftFromInput());
}

async function removeCustom(index) {
  const state = await migrateStateIfNeeded();
  state.customReactions.splice(index, 1);
  await saveLocalState({ customReactions: state.customReactions });
  setFeedback("Removed reaction.");
  loadState();
}

async function moveCustom(index, offset) {
  const state = await migrateStateIfNeeded();
  const nextIndex = index + offset;
  if (nextIndex < 0 || nextIndex >= state.customReactions.length) {
    return;
  }

  const next = [...state.customReactions];
  const [item] = next.splice(index, 1);
  next.splice(nextIndex, 0, item);
  await saveLocalState({ customReactions: next });
  setFeedback("Updated order.");
  loadState();
}

async function toggleBuiltin(type, shouldHide) {
  const state = await migrateStateIfNeeded();
  const set = new Set(state.hiddenBuiltins);
  if (shouldHide) {
    set.add(type);
  } else {
    set.delete(type);
  }

  await saveSyncState({ hiddenBuiltins: [...set] });
}

function validateInputs() {
  const label = String(labelEl.value || "").trim();
  const linkedInType = normalizeType(linkedInTypeEl.value);
  const mode = normalizeAssetType(assetModeEl.value);

  if (!label) {
    return "Enter a reaction name.";
  }

  if (!linkedInType) {
    return "Choose a LinkedIn mapping type.";
  }

  if (mode === "emoji" && !String(emojiEl.value || "").trim()) {
    return "Enter an emoji.";
  }

  if (mode === "upload" && !isImageDataUrl(uploadDataUrl)) {
    return "Upload an image first.";
  }

  return null;
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

  const avatarDataUrl = generateAvatarDataUrl(
    avatarInitialsEl.value,
    avatarMoodEl.value,
    avatarColorEl.value
  );

  return sanitizeCustomReaction({
    label: labelEl.value,
    linkedInType: linkedInTypeEl.value,
    assetType: "avatar",
    assetData: avatarDataUrl
  });
}

addBtn.addEventListener("click", async () => {
  try {
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

    const state = await migrateStateIfNeeded();
    state.customReactions.push(draft);
    await saveLocalState({ customReactions: state.customReactions });

    labelEl.value = "";
    emojiEl.value = "";
    imageFileEl.value = "";
    uploadDataUrl = "";
    renderAssetPreview("");

    setFeedback("Added reaction.");
    loadState();
  } catch {
    setFeedback("Failed to add reaction. Try again.", true);
  }
});

imageFileEl.addEventListener("change", async () => {
  try {
    const file = imageFileEl.files?.[0];
    if (!file) {
      uploadDataUrl = "";
      renderAssetPreview("");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setFeedback("Image must be under 2MB.", true);
      return;
    }

    const raw = await readFileAsDataUrl(file);
    uploadDataUrl = await toSquareDataUrl(raw);
    renderAssetPreview(uploadDataUrl);

    const state = await migrateStateIfNeeded();
    renderPreviewTray(state.customReactions, draftFromInput());
  } catch {
    setFeedback("Could not load image.", true);
  }
});

assetModeEl.addEventListener("change", async () => {
  toggleAssetModeFields();
  const state = await migrateStateIfNeeded();
  renderPreviewTray(state.customReactions, draftFromInput());
});

for (const el of [labelEl, emojiEl, linkedInTypeEl, avatarInitialsEl, avatarMoodEl, avatarColorEl]) {
  el.addEventListener("input", async () => {
    const state = await migrateStateIfNeeded();
    renderPreviewTray(state.customReactions, draftFromInput());
    if (feedbackEl.classList.contains("error")) {
      setFeedback("");
    }
  });
}

exportBtn.addEventListener("click", async () => {
  const state = await migrateStateIfNeeded();
  const payload = JSON.stringify({ customReactions: state.customReactions }, null, 2);
  await navigator.clipboard.writeText(payload);
  exportBtn.textContent = "Copied";
  setTimeout(() => {
    exportBtn.textContent = "Export";
  }, 900);
});

importBtn.addEventListener("click", async () => {
  const raw = window.prompt("Paste exported JSON");
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw);
    const input = Array.isArray(parsed) ? parsed : parsed.customReactions;
    if (!Array.isArray(input)) {
      throw new Error("Invalid format");
    }

    const next = input.map(sanitizeCustomReaction).filter(Boolean);
    await saveLocalState({ customReactions: next });
    setFeedback("Imported reactions.");
    loadState();
  } catch {
    importBtn.textContent = "Invalid";
    setFeedback("Import failed. Invalid JSON format.", true);
    setTimeout(() => {
      importBtn.textContent = "Import";
    }, 900);
  }
});

toggleAssetModeFields();
loadState();
