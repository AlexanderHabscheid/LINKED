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
const REACTION_LABELS = REACTIONS.map((item) => item.label.toLowerCase());
const TYPE_TO_LABEL = Object.fromEntries(REACTIONS.map((item) => [item.type, item.label]));

let cachedState = {
  customReactions: [],
  hiddenBuiltins: []
};

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeType(type) {
  return TYPE_ALIASES[String(type || "").trim().toLowerCase()] || null;
}

function normalizeAssetType(type) {
  const normalized = String(type || "").trim().toLowerCase();
  return ASSET_TYPES.has(normalized) ? normalized : "emoji";
}

function textOf(node) {
  return (node?.getAttribute("aria-label") || node?.textContent || "").trim();
}

function isVisible(node) {
  if (!node) return false;
  const style = window.getComputedStyle(node);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
    return false;
  }
  const rect = node.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function isImageDataUrl(value) {
  return /^data:image\//.test(String(value || ""));
}

function sanitizeHiddenBuiltins(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  const out = [];
  const seen = new Set();
  for (const item of items) {
    const normalized = normalizeType(item);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }

  return out;
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

async function loadAndMigrateState() {
  const [syncState, localState] = await Promise.all([
    chrome.storage.sync.get(SYNC_DEFAULTS),
    chrome.storage.local.get(LOCAL_DEFAULTS)
  ]);

  let reactionPacks = [];
  if (Array.isArray(localState.reactionPacks) && localState.reactionPacks.length > 0) {
    reactionPacks = localState.reactionPacks
      .map((pack) => {
        if (!pack || typeof pack !== "object") return null;
        const id = String(pack.id || "").trim();
        const name = String(pack.name || "Pack").trim().slice(0, 24) || "Pack";
        if (!id) return null;
        const reactions = (Array.isArray(pack.reactions) ? pack.reactions : [])
          .map(sanitizeCustomReaction)
          .filter(Boolean);
        return { id, name, reactions };
      })
      .filter(Boolean);
  }

  // Backward compatibility from single-list model.
  if (!reactionPacks.length) {
    const oldFromLocal = Array.isArray(localState.customReactions) ? localState.customReactions : [];
    const oldFromSync = Array.isArray(syncState.customReactions) ? syncState.customReactions : [];
    const oldReactions = (oldFromLocal.length ? oldFromLocal : oldFromSync)
      .map(sanitizeCustomReaction)
      .filter(Boolean);
    reactionPacks = [{
      id: `pack_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      name: "Main Pack",
      reactions: oldReactions
    }];
  }

  let activePackId = String(localState.activePackId || "").trim();
  if (!reactionPacks.some((pack) => pack.id === activePackId)) {
    activePackId = reactionPacks[0].id;
  }

  const activePack = reactionPacks.find((pack) => pack.id === activePackId) || reactionPacks[0];
  const customReactions = activePack ? activePack.reactions : [];

  const hiddenBuiltins = sanitizeHiddenBuiltins(syncState.hiddenBuiltins);

  if (JSON.stringify(reactionPacks) !== JSON.stringify(localState.reactionPacks || []) || activePackId !== String(localState.activePackId || "")) {
    await chrome.storage.local.set({ reactionPacks, activePackId });
  }

  if (JSON.stringify(hiddenBuiltins) !== JSON.stringify(syncState.hiddenBuiltins || [])) {
    await chrome.storage.sync.set({ hiddenBuiltins });
  }

  if (Array.isArray(syncState.customReactions)) {
    await chrome.storage.sync.remove("customReactions");
  }
  if (Array.isArray(localState.customReactions)) {
    await chrome.storage.local.remove("customReactions");
  }

  cachedState = { customReactions, hiddenBuiltins };
}

function looksLikeReactionButton(node) {
  const label = textOf(node).toLowerCase();
  if (!label) return false;
  return REACTION_LABELS.some((reaction) => label.includes(reaction));
}

function collectReactionButtons(root) {
  const matched = root.querySelectorAll("button[aria-label], [role='button'][aria-label], button[aria-pressed][aria-label]");
  return Array.from(matched).filter((node) => isVisible(node) && looksLikeReactionButton(node));
}

function reactionTypeFromText(label) {
  const normalized = String(label || "").toLowerCase();
  for (const reaction of REACTIONS) {
    if (normalized.includes(reaction.label.toLowerCase())) {
      return reaction.type;
    }
  }
  return null;
}

function getActionBars() {
  return document.querySelectorAll(
    "div.feed-shared-social-action-bar, div.social-details-social-actions, div[class*='social-action-bar']"
  );
}

function getLikeButtonInActionBar(actionBar) {
  for (const button of actionBar.querySelectorAll("button,[role='button']")) {
    const label = textOf(button).toLowerCase();
    if (label.includes("like") || label.includes("react")) {
      return button;
    }
  }
  return null;
}

function distance(a, b) {
  const ax = a.left + a.width / 2;
  const ay = a.top + a.height / 2;
  const bx = b.left + b.width / 2;
  const by = b.top + b.height / 2;
  return Math.hypot(ax - bx, ay - by);
}

function collectTrayCandidates(likeButton) {
  const explicit = [
    "div[class*='reactions']",
    "div[class*='social-details']",
    "div[role='toolbar']",
    "ul[role='listbox']"
  ];

  const trays = [];
  const seen = new Set();

  for (const selector of explicit) {
    for (const node of document.querySelectorAll(selector)) {
      if (seen.has(node) || !isVisible(node)) continue;
      const buttons = collectReactionButtons(node);
      if (buttons.length < 3) continue;
      seen.add(node);
      trays.push({ element: node, buttons });
    }
  }

  for (const button of collectReactionButtons(document)) {
    let current = button.parentElement;
    let depth = 0;
    while (current && depth < 7) {
      if (!seen.has(current) && isVisible(current)) {
        const buttons = collectReactionButtons(current);
        if (buttons.length >= 3) {
          seen.add(current);
          trays.push({ element: current, buttons });
        }
      }
      current = current.parentElement;
      depth += 1;
    }
  }

  const likeRect = likeButton.getBoundingClientRect();
  trays.sort((a, b) => {
    const aScore = distance(a.element.getBoundingClientRect(), likeRect) - a.buttons.length * 16;
    const bScore = distance(b.element.getBoundingClientRect(), likeRect) - b.buttons.length * 16;
    return aScore - bScore;
  });

  return trays;
}

function clearNativeHiding(root) {
  for (const node of root.querySelectorAll("[data-linked-hidden-native='true']")) {
    node.style.visibility = "";
    node.style.pointerEvents = "";
    node.style.width = "";
    node.style.height = "";
    node.style.margin = "";
    node.style.padding = "";
    node.removeAttribute("data-linked-hidden-native");
  }

  for (const node of root.querySelectorAll("[data-linked-muted-native='true']")) {
    node.style.opacity = "";
    node.style.pointerEvents = "";
    node.removeAttribute("data-linked-muted-native");
  }

  root.classList.remove("linked-native-host");
}

function muteNativeTrayChildren(tray) {
  for (const child of tray.children) {
    if (child.classList?.contains("linked-native-shell")) {
      continue;
    }
    child.style.opacity = "0";
    child.style.pointerEvents = "none";
    child.setAttribute("data-linked-muted-native", "true");
  }
}

function hideNativeButtonsInTray(tray, buttons) {
  clearNativeHiding(tray);
  for (const button of buttons) {
    button.style.visibility = "hidden";
    button.style.pointerEvents = "none";
    button.style.width = "0";
    button.style.height = "0";
    button.style.margin = "0";
    button.style.padding = "0";
    button.setAttribute("data-linked-hidden-native", "true");
  }
}

function findNativeMappedButtons(tray) {
  const map = new Map();
  for (const button of collectReactionButtons(tray)) {
    const type = reactionTypeFromText(textOf(button));
    if (!type || map.has(type)) continue;
    map.set(type, button);
  }
  return map;
}

async function fallbackApplyReaction(likeButton, type) {
  if (!likeButton) return;

  likeButton.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
  likeButton.click();
  await wait(220);

  const label = TYPE_TO_LABEL[type] || "Like";
  const options = document.querySelectorAll(
    `button[aria-label*='${label}'], [role='button'][aria-label*='${label}']`
  );

  for (const option of options) {
    if (isVisible(option) && looksLikeReactionButton(option)) {
      option.click();
      return;
    }
  }
}

function sanitizeClonedNodeAttributes(root) {
  if (root.id) root.removeAttribute("id");
  root.removeAttribute("aria-pressed");
  root.removeAttribute("data-control-name");
  root.removeAttribute("data-linked-hidden-native");
  root.removeAttribute("data-linked-muted-native");
  root.removeAttribute("style");

  for (const node of root.querySelectorAll("[id]")) {
    node.removeAttribute("id");
  }
}

function applyReactionVisual(button, reaction) {
  if (!reaction) return;

  const visual = document.createElement("span");
  visual.className = "linked-custom-visual";

  if ((reaction.assetType === "upload" || reaction.assetType === "avatar") && isImageDataUrl(reaction.assetData)) {
    const img = document.createElement("img");
    img.src = reaction.assetData;
    img.alt = reaction.label;
    img.className = "linked-custom-visual-image";
    visual.appendChild(img);
  } else {
    visual.textContent = reaction.emoji || "🙂";
  }

  button.classList.add("linked-native-reaction", "linked-native-reaction--custom");
  button.setAttribute("aria-label", reaction.label);
  button.title = `${reaction.label} -> ${TYPE_TO_LABEL[reaction.linkedInType]}`;
  button.appendChild(visual);
}

function createCustomButton(reaction, mappedButton, likeButton) {
  const button = mappedButton
    ? mappedButton.cloneNode(true)
    : document.createElement("button");

  if (!mappedButton) {
    button.type = "button";
    button.className = "linked-native-reaction linked-native-reaction--fallback";
  } else {
    sanitizeClonedNodeAttributes(button);
  }

  applyReactionVisual(button, reaction);

  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (mappedButton) {
      mappedButton.click();
      return;
    }

    await fallbackApplyReaction(likeButton, reaction.linkedInType);
  });

  return button;
}

function mountReplacementTray(tray, likeButton) {
  const existing = tray.querySelector(".linked-native-shell");
  if (existing) {
    existing.remove();
  }

  const nativeMap = findNativeMappedButtons(tray);
  hideNativeButtonsInTray(tray, Array.from(nativeMap.values()));
  muteNativeTrayChildren(tray);
  tray.classList.add("linked-native-host");

  const shell = document.createElement("div");
  shell.className = "linked-native-shell";

  if (!cachedState.customReactions.length) {
    const note = document.createElement("span");
    note.className = "linked-native-empty";
    note.textContent = "Add custom reactions in LINKED popup";
    shell.appendChild(note);
  } else {
    for (const reaction of cachedState.customReactions) {
      shell.appendChild(
        createCustomButton(reaction, nativeMap.get(reaction.linkedInType), likeButton)
      );
    }
  }

  tray.appendChild(shell);
}

async function enhanceLikeButton(likeButton) {
  if (!isVisible(likeButton)) return;

  likeButton.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));

  for (let attempt = 0; attempt < 8; attempt += 1) {
    await wait(65);
    const trays = collectTrayCandidates(likeButton);
    if (trays.length) {
      mountReplacementTray(trays[0].element, likeButton);
      return;
    }
  }
}

function bindActionBar(actionBar) {
  if (actionBar.dataset.linkedBound === "true") return;

  const likeButton = getLikeButtonInActionBar(actionBar);
  if (!likeButton) return;

  likeButton.addEventListener("mouseenter", () => {
    enhanceLikeButton(likeButton);
  });

  likeButton.addEventListener("focus", () => {
    enhanceLikeButton(likeButton);
  });

  actionBar.dataset.linkedBound = "true";
}

function clearGlobalHiddenBuiltins() {
  for (const node of document.querySelectorAll("[data-linked-hidden='true']")) {
    node.style.display = "";
    node.removeAttribute("data-linked-hidden");
  }
}

function applyHiddenBuiltins() {
  clearGlobalHiddenBuiltins();
  if (!cachedState.hiddenBuiltins.length) return;

  const labelsToHide = cachedState.hiddenBuiltins.map((type) => TYPE_TO_LABEL[type]).filter(Boolean);
  if (!labelsToHide.length) return;

  const nodes = document.querySelectorAll("button[aria-label], [role='button'][aria-label], li button[aria-label]");
  for (const node of nodes) {
    if (!isVisible(node)) continue;
    if (node.closest(".linked-native-shell")) continue;

    const label = textOf(node);
    if (!label || !looksLikeReactionButton(node)) continue;

    if (labelsToHide.some((target) => label.includes(target))) {
      node.style.display = "none";
      node.setAttribute("data-linked-hidden", "true");
    }
  }
}

function refreshMountedTrays() {
  const shells = document.querySelectorAll(".linked-native-shell");
  for (const shell of shells) {
    const tray = shell.parentElement;
    if (!tray) continue;

    const actionBar = tray.closest("article, .feed-shared-update-v2, .occludable-update")
      ?.querySelector("div.feed-shared-social-action-bar, div.social-details-social-actions, div[class*='social-action-bar']");

    const likeButton = actionBar ? getLikeButtonInActionBar(actionBar) : null;
    mountReplacementTray(tray, likeButton);
  }
}

async function refreshAll() {
  await loadAndMigrateState();

  for (const actionBar of getActionBars()) {
    bindActionBar(actionBar);
  }

  refreshMountedTrays();
  applyHiddenBuiltins();
}

chrome.storage.onChanged.addListener(async (_changes, areaName) => {
  if (areaName === "sync" || areaName === "local") {
    await refreshAll();
  }
});

const observer = new MutationObserver(() => {
  for (const actionBar of getActionBars()) {
    bindActionBar(actionBar);
  }
  applyHiddenBuiltins();
});

observer.observe(document.documentElement, {
  childList: true,
  subtree: true
});

refreshAll();
