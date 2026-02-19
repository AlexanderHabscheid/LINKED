const STORAGE_DEFAULTS = {
  customReactions: [],
  hiddenBuiltins: []
};

const TYPE_TO_LABEL = {
  like: "Like",
  praise: "Celebrate",
  empathy: "Support",
  interest: "Love",
  appreciation: "Insightful",
  maybe: "Funny"
};

const TYPE_COLORS = {
  like: "#378fe9",
  praise: "#6dae4f",
  empathy: "#df704d",
  interest: "#b28ac7",
  appreciation: "#edb541",
  maybe: "#52b7c7"
};

const TYPE_VALUES = Object.keys(TYPE_TO_LABEL);
const REACTION_LABELS = Object.values(TYPE_TO_LABEL);

let cachedState = { ...STORAGE_DEFAULTS };

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function reactionTypeFromText(input) {
  const label = (input || "").toLowerCase();
  for (const [type, visibleLabel] of Object.entries(TYPE_TO_LABEL)) {
    if (label.includes(visibleLabel.toLowerCase())) {
      return type;
    }
  }
  return null;
}

function looksLikeReactionButton(node) {
  if (!node) return false;
  const label = textOf(node);
  if (!label) return false;
  return REACTION_LABELS.some((reactionLabel) => label.includes(reactionLabel));
}

function collectReactionButtons(root) {
  const candidates = root.querySelectorAll("button[aria-label], [role='button'][aria-label]");
  return Array.from(candidates).filter((node) => isVisible(node) && looksLikeReactionButton(node));
}

function collectTrayCandidates() {
  const buttons = collectReactionButtons(document);
  const seen = new Set();
  const trays = [];

  for (const button of buttons) {
    let current = button.parentElement;
    let depth = 0;

    while (current && depth < 6) {
      const key = current;
      if (!seen.has(key)) {
        const reactionButtons = collectReactionButtons(current);
        if (reactionButtons.length >= 3) {
          seen.add(key);
          trays.push({ element: current, buttons: reactionButtons });
        }
      }
      current = current.parentElement;
      depth += 1;
    }
  }

  return trays;
}

function getLikeButtonInActionBar(actionBar) {
  for (const button of actionBar.querySelectorAll("button")) {
    const label = textOf(button).toLowerCase();
    if (label.includes("like") || label.includes("react")) {
      return button;
    }
  }
  return null;
}

function getActionBars() {
  return document.querySelectorAll(
    "div.feed-shared-social-action-bar, div.social-details-social-actions"
  );
}

function distance(a, b) {
  const ax = a.left + a.width / 2;
  const ay = a.top + a.height / 2;
  const bx = b.left + b.width / 2;
  const by = b.top + b.height / 2;
  return Math.hypot(ax - bx, ay - by);
}

function findNativeTrayForLikeButton(likeButton) {
  const likeRect = likeButton.getBoundingClientRect();
  const trays = collectTrayCandidates().filter((tray) => isVisible(tray.element));

  if (!trays.length) {
    return null;
  }

  trays.sort((a, b) => {
    const aRect = a.element.getBoundingClientRect();
    const bRect = b.element.getBoundingClientRect();

    const aNear = distance(aRect, likeRect);
    const bNear = distance(bRect, likeRect);

    const aScore = aNear - a.buttons.length * 18;
    const bScore = bNear - b.buttons.length * 18;

    return aScore - bScore;
  });

  return trays[0].element;
}

function clearNativeHiding(root) {
  for (const node of root.querySelectorAll("[data-linked-hidden-native='true']")) {
    node.style.display = "";
    node.style.visibility = "";
    node.style.pointerEvents = "";
    node.style.width = "";
    node.style.height = "";
    node.style.margin = "";
    node.style.padding = "";
    node.removeAttribute("data-linked-hidden-native");
  }
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

function findNativeMappedButtons(tray) {
  const map = new Map();
  const allButtons = collectReactionButtons(tray);

  for (const button of allButtons) {
    const type = reactionTypeFromText(textOf(button));
    if (!type) continue;
    if (!map.has(type)) {
      map.set(type, button);
    }
  }

  return map;
}

async function fallbackApplyReaction(likeButton, type) {
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

  const type = TYPE_VALUES.includes(customReaction.linkedInType)
    ? customReaction.linkedInType
    : "like";

  button.style.setProperty("--linked-type-color", TYPE_COLORS[type]);
  button.setAttribute("aria-label", customReaction.label);
  button.title = `${customReaction.label} -> ${TYPE_TO_LABEL[type]}`;

  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (mappedButton) {
      mappedButton.click();
      return;
    }

    await fallbackApplyReaction(likeButton, type);
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

  const validCustom = cachedState.customReactions.filter(
    (item) => item && item.emoji && item.label && TYPE_VALUES.includes(item.linkedInType)
  );

  if (!validCustom.length) {
    const note = document.createElement("span");
    note.className = "linked-native-empty";
    note.textContent = "Add custom reactions in LINKED popup";
    shell.appendChild(note);
  } else {
    for (const customReaction of validCustom) {
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

  for (let attempt = 0; attempt < 7; attempt += 1) {
    await wait(70);
    const tray = findNativeTrayForLikeButton(likeButton);
    if (tray) {
      mountReplacementTray(tray, likeButton);
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

  const labelsToHide = cachedState.hiddenBuiltins
    .filter((type) => TYPE_VALUES.includes(type))
    .map((type) => TYPE_TO_LABEL[type]);

  if (!labelsToHide.length) {
    return;
  }

  const nodes = document.querySelectorAll("button[aria-label], [role='button'][aria-label], li button[aria-label]");
  for (const node of nodes) {
    if (!isVisible(node)) continue;
    if (node.closest(".linked-native-shell")) continue;

    const label = textOf(node);
    if (!label) continue;

    const shouldHide = labelsToHide.some((target) => label.includes(target));
    if (!shouldHide) continue;
    if (!looksLikeReactionButton(node)) continue;

    node.style.display = "none";
    node.setAttribute("data-linked-hidden", "true");
  }
}

function refreshMountedTrays() {
  const shells = document.querySelectorAll(".linked-native-shell");
  for (const shell of shells) {
    const tray = shell.parentElement;
    if (!tray) continue;

    let actionBar = tray.previousElementSibling;
    while (actionBar && !actionBar.matches("div.feed-shared-social-action-bar, div.social-details-social-actions")) {
      actionBar = actionBar.previousElementSibling;
    }

    const likeButton = actionBar ? getLikeButtonInActionBar(actionBar) : null;
    mountReplacementTray(tray, likeButton || document.body);
  }
}

async function loadState() {
  cachedState = await chrome.storage.sync.get(STORAGE_DEFAULTS);
}

async function refreshAll() {
  await loadState();

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
