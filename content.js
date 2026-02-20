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
let floatingShell = null;
let floatingLikeButton = null;
let floatingHideTimer = null;
const boundLikeButtons = new WeakSet();
const enhanceRuns = new WeakMap();
const enhancingLikeButtons = new WeakSet();
const selectedReactionByPost = new WeakMap();
const selectedReactionByKey = new Map();
const warnedMissingOptionTypes = new Set();
const originalSummaryMarkup = new WeakMap();

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

function reactionTypeFromNode(node) {
  if (!(node instanceof HTMLElement)) return null;

  const byText = reactionTypeFromText(textOf(node));
  if (byText) return byText;

  const combined = [
    node.getAttribute("data-control-name"),
    node.getAttribute("data-test-reaction"),
    node.getAttribute("data-test-id"),
    node.getAttribute("id"),
    node.className
  ].join(" ").toLowerCase();

  for (const reaction of REACTIONS) {
    if (combined.includes(reaction.type)) {
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
    if (
      label.includes("like") ||
      label.includes("react") ||
      label.includes("reacted") ||
      REACTION_LABELS.some((reaction) => label.includes(reaction))
    ) {
      return button;
    }
  }
  return null;
}

function looksLikeLikeTrigger(node) {
  if (!node || !isVisible(node)) return false;
  const label = textOf(node).toLowerCase();
  if (!label) return false;
  return (
    label.includes("like") ||
    label.includes("react") ||
    label.includes("reacted") ||
    label.includes("celebrate") ||
    label.includes("support") ||
    label.includes("love") ||
    label.includes("insightful") ||
    label.includes("funny")
  );
}

function findLikeButtons(root = document) {
  const nodes = root.querySelectorAll(
    "button[aria-label], [role='button'][aria-label], button[aria-pressed][aria-label]"
  );
  const out = [];
  for (const node of nodes) {
    if (!(node instanceof HTMLElement)) continue;
    if (!looksLikeLikeTrigger(node)) continue;
    out.push(node);
  }
  return out;
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
    // Keep layout footprint so tray geometry does not collapse.
    button.style.width = "";
    button.style.height = "";
    button.style.margin = "";
    button.style.padding = "";
    button.setAttribute("data-linked-hidden-native", "true");
  }
}

async function fallbackApplyReaction(likeButton, type) {
  if (!likeButton) return false;

  const postRoot = likeButton.closest(
    "article, .feed-shared-update-v2, .occludable-update, .scaffold-finite-scroll__content"
  ) || document;

  const findOption = () => {
    const options = postRoot.querySelectorAll("button, [role='button']");
    for (const option of options) {
      if (!(option instanceof HTMLElement)) continue;
      if (option === likeButton) continue;
      if (option.closest(".linked-native-shell")) continue;
      if (option.hasAttribute("disabled") || option.getAttribute("aria-disabled") === "true") continue;
      if (reactionTypeFromNode(option) !== type) continue;
      return option;
    }
    return null;
  };

  likeButton.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  likeButton.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
  likeButton.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
  likeButton.dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }));
  await wait(260);

  const direct = findOption();
  if (direct) {
    try {
      direct.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      direct.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      direct.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    } catch (_error) {
      // No-op: best effort event simulation before click.
    }
    direct.click();
    return true;
  }

  if (type === "like") {
    likeButton.click();
    return true;
  }

  // Avoid console spam on repeated misses for the same type.
  if (!warnedMissingOptionTypes.has(type)) {
    warnedMissingOptionTypes.add(type);
    console.warn("[LINKED] Non-like reaction option not found; skipping fallback click.", { type });
  }
  return false;
}

function clearFloatingHideTimer() {
  if (!floatingHideTimer) return;
  clearTimeout(floatingHideTimer);
  floatingHideTimer = null;
}

function hideFloatingTray() {
  clearFloatingHideTimer();
  if (!floatingShell) return;
  floatingShell.remove();
  floatingShell = null;
  floatingLikeButton = null;
}

function ensureFloatingShell() {
  if (floatingShell && floatingShell.isConnected) {
    return floatingShell;
  }

  const shell = document.createElement("div");
  shell.className = "linked-native-shell linked-floating-shell";
  shell.addEventListener("mouseenter", () => {
    clearFloatingHideTimer();
  });
  shell.addEventListener("mouseleave", () => {
    floatingHideTimer = window.setTimeout(() => hideFloatingTray(), 120);
  });
  floatingShell = shell;
  return shell;
}

function positionFloatingTray(likeButton) {
  if (!floatingShell || !likeButton || !isVisible(likeButton)) return;
  const rect = likeButton.getBoundingClientRect();
  const shellRect = floatingShell.getBoundingClientRect();
  const left = rect.left + rect.width / 2 - shellRect.width / 2;
  const top = rect.top - shellRect.height - 10;
  const clampedLeft = Math.max(8, Math.min(left, window.innerWidth - shellRect.width - 8));
  const clampedTop = Math.max(8, top);
  floatingShell.style.left = `${clampedLeft}px`;
  floatingShell.style.top = `${clampedTop}px`;
}

function mountFloatingTray(likeButton) {
  if (!likeButton || !isVisible(likeButton)) return;

  const shell = ensureFloatingShell();
  floatingLikeButton = likeButton;
  shell.innerHTML = "";

  if (!cachedState.customReactions.length) {
    const note = document.createElement("span");
    note.className = "linked-native-empty";
    note.textContent = "Add custom reactions in LINKED popup";
    shell.appendChild(note);
  } else {
    for (const reaction of cachedState.customReactions) {
      shell.appendChild(createCustomButton(reaction, likeButton));
    }
  }

  if (!shell.isConnected) {
    document.body.appendChild(shell);
  }

  positionFloatingTray(likeButton);
}

function resolveLikeButtonFromContext(contextNode, fallbackLikeButton) {
  if (fallbackLikeButton instanceof HTMLElement && fallbackLikeButton.isConnected) {
    return fallbackLikeButton;
  }

  if (!(contextNode instanceof Node)) return null;
  const postRoot = contextNode.closest(
    "article, .feed-shared-update-v2, .occludable-update, .scaffold-finite-scroll__content"
  );
  if (!(postRoot instanceof HTMLElement)) return null;

  const actionBar = postRoot.querySelector(
    "div.feed-shared-social-action-bar, div.social-details-social-actions, div[class*='social-action-bar']"
  );
  if (!(actionBar instanceof HTMLElement)) return null;

  return getLikeButtonInActionBar(actionBar);
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

function getPostRootForButton(button) {
  return button?.closest(
    "article, .feed-shared-update-v2, .occludable-update, .scaffold-finite-scroll__content"
  ) || null;
}

function getPostKey(postRoot) {
  if (!(postRoot instanceof HTMLElement)) return null;

  const attrCandidates = [
    "data-urn",
    "data-id",
    "data-activity-urn",
    "data-update-id",
    "data-occludable-urn"
  ];
  for (const attr of attrCandidates) {
    const value = String(postRoot.getAttribute(attr) || "").trim();
    if (value) return `${attr}:${value}`;
  }

  const permalink = postRoot.querySelector(
    "a[href*='/feed/update/'], a[href*='/posts/'], a[href*='activity-']"
  );
  if (permalink instanceof HTMLAnchorElement) {
    const href = String(permalink.href || "").trim();
    if (href) return `href:${href}`;
  }

  return null;
}

function clearLikeButtonCustomVisual(likeButton) {
  if (!(likeButton instanceof HTMLElement)) return;
  const overlay = likeButton.querySelector(":scope > .linked-like-custom-overlay");
  if (overlay) overlay.remove();
  likeButton.classList.remove("linked-like-button--custom");
}

function clearSummaryCustomVisual(postRoot) {
  if (!(postRoot instanceof HTMLElement)) return;

  const hosts = postRoot.querySelectorAll("[data-linked-summary-overridden='true']");
  for (const host of hosts) {
    if (!(host instanceof HTMLElement)) continue;
    const original = originalSummaryMarkup.get(host);
    if (typeof original === "string") {
      host.innerHTML = original;
    } else {
      for (const marker of host.querySelectorAll(".linked-summary-custom-marker")) {
        marker.remove();
      }
    }
    host.removeAttribute("data-linked-summary-overridden");
  }
}

function applySummaryCustomVisual(postRoot, reaction) {
  if (!(postRoot instanceof HTMLElement) || !reaction) return;

  const host = postRoot.querySelector(
    ".social-details-social-counts__reactions-count, .social-details-social-counts, .update-components-social-proof"
  );
  if (!(host instanceof HTMLElement)) return;

  clearSummaryCustomVisual(postRoot);

  if (!originalSummaryMarkup.has(host)) {
    originalSummaryMarkup.set(host, host.innerHTML);
  }
  host.setAttribute("data-linked-summary-overridden", "true");
  host.innerHTML = "";

  const marker = document.createElement("span");
  marker.className = "linked-summary-custom-marker";
  marker.title = `Reacted: ${reaction.label}`;
  marker.setAttribute("aria-label", `Reacted: ${reaction.label}`);

  const visual = document.createElement("span");
  visual.className = "linked-custom-visual linked-custom-visual--summary";

  if ((reaction.assetType === "upload" || reaction.assetType === "avatar") && isImageDataUrl(reaction.assetData)) {
    const img = document.createElement("img");
    img.src = reaction.assetData;
    img.alt = reaction.label;
    img.className = "linked-custom-visual-image";
    visual.appendChild(img);
  } else {
    visual.textContent = reaction.emoji || "🙂";
  }

  const label = document.createElement("span");
  label.className = "linked-summary-custom-text";
  label.textContent = reaction.label;

  marker.appendChild(visual);
  marker.appendChild(label);
  host.prepend(marker);
}

function clearPostCustomVisualsForButton(likeButton) {
  if (!(likeButton instanceof HTMLElement)) return;
  clearLikeButtonCustomVisual(likeButton);
  clearSummaryCustomVisual(getPostRootForButton(likeButton));
}

function applyLikeButtonCustomVisual(likeButton, reaction) {
  if (!(likeButton instanceof HTMLElement) || !reaction) return;
  clearLikeButtonCustomVisual(likeButton);

  const overlay = document.createElement("span");
  overlay.className = "linked-like-custom-overlay";
  overlay.setAttribute("aria-hidden", "true");

  const visual = document.createElement("span");
  visual.className = "linked-custom-visual linked-custom-visual--like-button";

  if ((reaction.assetType === "upload" || reaction.assetType === "avatar") && isImageDataUrl(reaction.assetData)) {
    const img = document.createElement("img");
    img.src = reaction.assetData;
    img.alt = reaction.label;
    img.className = "linked-custom-visual-image";
    visual.appendChild(img);
  } else {
    visual.textContent = reaction.emoji || "🙂";
  }

  overlay.appendChild(visual);
  likeButton.classList.add("linked-like-button--custom");
  likeButton.appendChild(overlay);
}

function persistAndApplyLikeButtonCustomVisual(likeButton, reaction) {
  if (!(likeButton instanceof HTMLElement) || !reaction) return;
  const postRoot = getPostRootForButton(likeButton);
  if (postRoot) {
    selectedReactionByPost.set(postRoot, reaction);
    const key = getPostKey(postRoot);
    if (key) selectedReactionByKey.set(key, reaction);
  }

  const delays = [40, 140, 360, 900];
  for (const delay of delays) {
    window.setTimeout(() => {
      if (!likeButton.isConnected) return;
      applyLikeButtonCustomVisual(likeButton, reaction);
      applySummaryCustomVisual(postRoot, reaction);
    }, delay);
  }
}

function restoreLikeButtonCustomVisual(likeButton) {
  if (!(likeButton instanceof HTMLElement)) return;
  const postRoot = getPostRootForButton(likeButton);
  if (!postRoot) return;
  let reaction = selectedReactionByPost.get(postRoot);
  if (!reaction) {
    const key = getPostKey(postRoot);
    if (key) reaction = selectedReactionByKey.get(key) || null;
  }
  if (!reaction) return;
  applyLikeButtonCustomVisual(likeButton, reaction);
  applySummaryCustomVisual(postRoot, reaction);
}

function createCustomButton(reaction, likeButton) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "linked-native-reaction linked-native-reaction--fallback";

  applyReactionVisual(button, reaction);

  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();

    const currentLikeButton = resolveLikeButtonFromContext(button, likeButton);
    if (!(currentLikeButton instanceof HTMLElement)) return;

    // Apply visual immediately so native reacted icon never becomes visible for long.
    persistAndApplyLikeButtonCustomVisual(currentLikeButton, reaction);
    const applied = await fallbackApplyReaction(currentLikeButton, reaction.linkedInType);

    if (applied) {
      persistAndApplyLikeButtonCustomVisual(currentLikeButton, reaction);
    } else {
      clearPostCustomVisualsForButton(currentLikeButton);
    }
  });

  return button;
}

function mountReplacementTray(tray, likeButton) {
  if (!(tray instanceof Element)) return;
  const existing = tray.querySelector(".linked-native-shell");
  if (existing) {
    existing.remove();
  }

  // Additive mode: keep native tray visible; render custom tray alongside it.
  clearNativeHiding(tray);
  tray.classList.add("linked-native-host");

  const shell = document.createElement("div");
  shell.className = "linked-native-shell linked-native-shell--inline";

  if (!cachedState.customReactions.length) {
    const note = document.createElement("span");
    note.className = "linked-native-empty";
    note.textContent = "Add custom reactions in LINKED popup";
    shell.appendChild(note);
  } else {
    for (const reaction of cachedState.customReactions) {
      shell.appendChild(createCustomButton(reaction, likeButton));
    }
  }

  tray.appendChild(shell);
}

async function enhanceLikeButton(likeButton) {
  if (!(likeButton instanceof HTMLElement) || !isVisible(likeButton)) return;
  if (enhancingLikeButtons.has(likeButton)) return;
  enhancingLikeButtons.add(likeButton);

  const runId = Date.now() + Math.random();
  enhanceRuns.set(likeButton, runId);

  try {
    clearFloatingHideTimer();
    // Always show our custom tray immediately for reliability.
    mountFloatingTray(likeButton);

    for (let attempt = 0; attempt < 8; attempt += 1) {
      await wait(65);
      if (!likeButton.isConnected || enhanceRuns.get(likeButton) !== runId) {
        return;
      }

      const trays = collectTrayCandidates(likeButton);
      if (!trays.length) continue;

      const targetTray = trays[0]?.element;
      if (!(targetTray instanceof Element) || !targetTray.isConnected) {
        continue;
      }

      hideFloatingTray();
      mountReplacementTray(targetTray, likeButton);
      return;
    }
  } catch (error) {
    console.warn("[LINKED] enhanceLikeButton failed", error);
  } finally {
    enhancingLikeButtons.delete(likeButton);
  }
}

function bindActionBar(actionBar) {
  if (actionBar.dataset.linkedBound === "true") return;

  const likeButton = getLikeButtonInActionBar(actionBar);
  if (!likeButton) return;
  bindLikeButton(likeButton);

  actionBar.dataset.linkedBound = "true";
}

function bindLikeButton(likeButton) {
  if (!(likeButton instanceof HTMLElement)) return;
  if (boundLikeButtons.has(likeButton)) return;

  likeButton.addEventListener("mouseenter", () => {
    enhanceLikeButton(likeButton);
  });

  likeButton.addEventListener("pointerenter", () => {
    enhanceLikeButton(likeButton);
  });

  likeButton.addEventListener("focus", () => {
    enhanceLikeButton(likeButton);
  });

  likeButton.addEventListener("mouseleave", () => {
    floatingHideTimer = window.setTimeout(() => hideFloatingTray(), 120);
  });

  likeButton.addEventListener("blur", () => {
    floatingHideTimer = window.setTimeout(() => hideFloatingTray(), 120);
  });

  restoreLikeButtonCustomVisual(likeButton);

  boundLikeButtons.add(likeButton);
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

function scrubInvalidExtensionResources(root = document) {
  const candidates = root.querySelectorAll("img[src^='chrome-extension://invalid/']");

  for (const img of candidates) {
    img.remove();
  }

  const sources = root.querySelectorAll("source[srcset*='chrome-extension://invalid/']");
  for (const source of sources) {
    source.removeAttribute("srcset");
  }
}

function refreshMountedTrays() {
  const shells = document.querySelectorAll(".linked-native-shell");
  for (const shell of shells) {
    if (shell.classList.contains("linked-floating-shell")) continue;
    const tray = shell.parentElement;
    if (!tray) continue;

    const actionBar = tray.closest("article, .feed-shared-update-v2, .occludable-update")
      ?.querySelector("div.feed-shared-social-action-bar, div.social-details-social-actions, div[class*='social-action-bar']");

    const likeButton = actionBar ? getLikeButtonInActionBar(actionBar) : null;
    mountReplacementTray(tray, likeButton);
  }

  if (floatingShell && floatingLikeButton) {
    mountFloatingTray(floatingLikeButton);
  }
}

async function refreshAll() {
  await loadAndMigrateState();

  for (const actionBar of getActionBars()) {
    bindActionBar(actionBar);
  }
  for (const likeButton of findLikeButtons(document)) {
    bindLikeButton(likeButton);
    restoreLikeButtonCustomVisual(likeButton);
  }

  refreshMountedTrays();
  applyHiddenBuiltins();
  scrubInvalidExtensionResources();
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
  for (const likeButton of findLikeButtons(document)) {
    bindLikeButton(likeButton);
    restoreLikeButtonCustomVisual(likeButton);
  }
  applyHiddenBuiltins();
  scrubInvalidExtensionResources();
  if (floatingShell && floatingLikeButton) {
    positionFloatingTray(floatingLikeButton);
  }
});

observer.observe(document.documentElement, {
  childList: true,
  subtree: true
});

refreshAll();

window.addEventListener("scroll", () => {
  if (floatingShell && floatingLikeButton) {
    positionFloatingTray(floatingLikeButton);
  }
}, true);

window.addEventListener("resize", () => {
  if (floatingShell && floatingLikeButton) {
    positionFloatingTray(floatingLikeButton);
  }
});

document.addEventListener("pointerdown", (event) => {
  if (!floatingShell) return;
  const target = event.target;
  if (target instanceof Node && floatingShell.contains(target)) return;
  hideFloatingTray();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    hideFloatingTray();
  }
});
