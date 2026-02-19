const STORAGE_DEFAULTS = {
  customReactions: [],
  hiddenBuiltins: []
};

const REACTIONS = [
  { type: "like", label: "Like", color: "#378fe9" },
  { type: "celebrate", label: "Celebrate", color: "#6dae4f" },
  { type: "support", label: "Support", color: "#df704d" },
  { type: "love", label: "Love", color: "#b28ac7" },
  { type: "insightful", label: "Insightful", color: "#edb541" },
  { type: "funny", label: "Funny", color: "#52b7c7" }
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

const TYPE_TO_LABEL = Object.fromEntries(REACTIONS.map((item) => [item.type, item.label]));
const TYPE_TO_COLOR = Object.fromEntries(REACTIONS.map((item) => [item.type, item.color]));
const REACTION_LABELS = REACTIONS.map((item) => item.label.toLowerCase());
const REACTION_TYPES = new Set(REACTIONS.map((item) => item.type));

let cachedState = { ...STORAGE_DEFAULTS };

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeType(type) {
  return TYPE_ALIASES[String(type || "").trim().toLowerCase()] || null;
}

function textOf(node) {
  return (node?.getAttribute("aria-label") || node?.textContent || "").trim();
}

function isVisible(element) {
  if (!element) return false;
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
    return false;
  }

  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function looksLikeReactionButton(node) {
  if (!node) return false;
  const label = textOf(node).toLowerCase();
  if (!label) return false;

  return REACTION_LABELS.some((reactionLabel) => label.includes(reactionLabel));
}

function reactionTypeFromText(input) {
  const label = String(input || "").toLowerCase();
  for (const reaction of REACTIONS) {
    if (label.includes(reaction.label.toLowerCase())) {
      return reaction.type;
    }
  }
  return null;
}

function sanitizeCustomReaction(item) {
  if (!item || typeof item !== "object") {
    return null;
  }

  const emoji = String(item.emoji || "").trim();
  const label = String(item.label || "").trim();
  const linkedInType = normalizeType(item.linkedInType);

  if (!emoji || !label || !linkedInType || !REACTION_TYPES.has(linkedInType)) {
    return null;
  }

  return { emoji, label, linkedInType };
}

function sanitizeHiddenBuiltins(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  const output = [];
  const seen = new Set();

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

async function loadAndMigrateState() {
  const state = await chrome.storage.sync.get(STORAGE_DEFAULTS);

  const customReactions = (state.customReactions || [])
    .map(sanitizeCustomReaction)
    .filter(Boolean);

  const hiddenBuiltins = sanitizeHiddenBuiltins(state.hiddenBuiltins);

  const customChanged = JSON.stringify(customReactions) !== JSON.stringify(state.customReactions || []);
  const hiddenChanged = JSON.stringify(hiddenBuiltins) !== JSON.stringify(state.hiddenBuiltins || []);

  if (customChanged || hiddenChanged) {
    await chrome.storage.sync.set({ customReactions, hiddenBuiltins });
  }

  cachedState = { customReactions, hiddenBuiltins };
}

function collectReactionButtons(root) {
  const selectors = [
    "button[aria-label]",
    "[role='button'][aria-label]",
    "button[aria-pressed][aria-label]"
  ];

  const matched = root.querySelectorAll(selectors.join(","));
  return Array.from(matched).filter((node) => isVisible(node) && looksLikeReactionButton(node));
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
  const explicitTraySelectors = [
    "div[class*='reactions']",
    "div[class*='social-details']",
    "div[role='toolbar']",
    "ul[role='listbox']"
  ];

  const candidates = [];
  const seen = new Set();

  for (const selector of explicitTraySelectors) {
    for (const node of document.querySelectorAll(selector)) {
      if (seen.has(node) || !isVisible(node)) {
        continue;
      }

      const reactionButtons = collectReactionButtons(node);
      if (reactionButtons.length < 3) {
        continue;
      }

      seen.add(node);
      candidates.push({ element: node, buttons: reactionButtons });
    }
  }

  // Fallback: walk ancestors of matching reaction buttons when class names shift.
  for (const button of collectReactionButtons(document)) {
    let current = button.parentElement;
    let depth = 0;

    while (current && depth < 7) {
      if (!seen.has(current) && isVisible(current)) {
        const reactionButtons = collectReactionButtons(current);
        if (reactionButtons.length >= 3) {
          seen.add(current);
          candidates.push({ element: current, buttons: reactionButtons });
        }
      }

      current = current.parentElement;
      depth += 1;
    }
  }

  const likeRect = likeButton.getBoundingClientRect();

  candidates.sort((a, b) => {
    const aRect = a.element.getBoundingClientRect();
    const bRect = b.element.getBoundingClientRect();

    const aNear = distance(aRect, likeRect) - a.buttons.length * 16;
    const bNear = distance(bRect, likeRect) - b.buttons.length * 16;

    return aNear - bNear;
  });

  return candidates;
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
}

function findNativeMappedButtons(tray) {
  const map = new Map();

  for (const button of collectReactionButtons(tray)) {
    const type = reactionTypeFromText(textOf(button));
    if (!type || map.has(type)) {
      continue;
    }

    map.set(type, button);
  }

  return map;
}

function hideNativeButtonsInTray(tray, mappedButtons) {
  clearNativeHiding(tray);

  for (const button of mappedButtons) {
    button.style.visibility = "hidden";
    button.style.pointerEvents = "none";
    button.style.width = "0";
    button.style.height = "0";
    button.style.margin = "0";
    button.style.padding = "0";
    button.setAttribute("data-linked-hidden-native", "true");
  }
}

async function fallbackApplyReaction(likeButton, type) {
  if (!likeButton) {
    return;
  }

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

function createCustomButton(customReaction, mappedButton, likeButton) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "linked-native-reaction";
  button.textContent = customReaction.emoji;
  button.style.setProperty("--linked-type-color", TYPE_TO_COLOR[customReaction.linkedInType]);
  button.setAttribute("aria-label", customReaction.label);
  button.title = `${customReaction.label} -> ${TYPE_TO_LABEL[customReaction.linkedInType]}`;

  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (mappedButton) {
      mappedButton.click();
      return;
    }

    await fallbackApplyReaction(likeButton, customReaction.linkedInType);
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

  const shell = document.createElement("div");
  shell.className = "linked-native-shell";

  if (!cachedState.customReactions.length) {
    const note = document.createElement("span");
    note.className = "linked-native-empty";
    note.textContent = "Add custom reactions in LINKED popup";
    shell.appendChild(note);
  } else {
    for (const customReaction of cachedState.customReactions) {
      shell.appendChild(
        createCustomButton(customReaction, nativeMap.get(customReaction.linkedInType), likeButton)
      );
    }
  }

  tray.appendChild(shell);
}

async function enhanceLikeButton(likeButton) {
  if (!isVisible(likeButton)) {
    return;
  }

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
  if (actionBar.dataset.linkedBound === "true") {
    return;
  }

  const likeButton = getLikeButtonInActionBar(actionBar);
  if (!likeButton) {
    return;
  }

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

  if (!cachedState.hiddenBuiltins.length) {
    return;
  }

  const labelsToHide = cachedState.hiddenBuiltins.map((type) => TYPE_TO_LABEL[type]).filter(Boolean);
  if (!labelsToHide.length) {
    return;
  }

  const nodes = document.querySelectorAll("button[aria-label], [role='button'][aria-label], li button[aria-label]");
  for (const node of nodes) {
    if (!isVisible(node)) continue;
    if (node.closest(".linked-native-shell")) continue;

    const label = textOf(node);
    if (!label) continue;
    if (!looksLikeReactionButton(node)) continue;

    const shouldHide = labelsToHide.some((target) => label.includes(target));
    if (!shouldHide) continue;

    node.style.display = "none";
    node.setAttribute("data-linked-hidden", "true");
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

chrome.storage.onChanged.addListener(async () => {
  await refreshAll();
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
