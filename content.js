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

const REACTION_TYPES = Object.keys(TYPE_TO_LABEL);
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

function isLikeButton(button) {
  const label = textOf(button).toLowerCase();
  if (!label) return false;
  return label.includes("like") || label.includes("react");
}

function getActionBars() {
  return document.querySelectorAll(
    "div.feed-shared-social-action-bar, div.social-details-social-actions"
  );
}

function getLikeButtonInActionBar(actionBar) {
  const buttons = actionBar.querySelectorAll("button");
  for (const button of buttons) {
    if (isLikeButton(button)) {
      return button;
    }
  }
  return null;
}

function getPostContainerFromButton(button) {
  return (
    button.closest("article") ||
    button.closest(".feed-shared-update-v2") ||
    button.closest(".occludable-update") ||
    document.body
  );
}

function removePanel(actionBar) {
  const existing = actionBar.querySelector(".linked-inline-panel");
  if (existing) {
    existing.remove();
  }
}

function buildReactionButton(postLikeButton, reaction) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "linked-inline-reaction";
  button.textContent = reaction.emoji;
  button.setAttribute("aria-label", `${reaction.label} (${TYPE_TO_LABEL[reaction.linkedInType] || reaction.linkedInType})`);
  button.title = `${reaction.label} -> ${TYPE_TO_LABEL[reaction.linkedInType] || reaction.linkedInType}`;

  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    await applyReactionToPost(postLikeButton, reaction.linkedInType);
  });

  return button;
}

function createCustomPanel(actionBar, likeButton, customReactions) {
  removePanel(actionBar);

  const panel = document.createElement("div");
  panel.className = "linked-inline-panel";

  if (!customReactions.length) {
    const empty = document.createElement("span");
    empty.className = "linked-inline-empty";
    empty.textContent = "Configure LINKED reactions in the extension popup";
    panel.appendChild(empty);
    actionBar.appendChild(panel);
    return panel;
  }

  for (const reaction of customReactions) {
    panel.appendChild(buildReactionButton(likeButton, reaction));
  }

  actionBar.appendChild(panel);
  return panel;
}

function showPanel(actionBar, likeButton) {
  const existing = actionBar.querySelector(".linked-inline-panel");
  if (existing) {
    existing.classList.add("linked-visible");
    return existing;
  }

  const panel = createCustomPanel(actionBar, likeButton, cachedState.customReactions);
  panel.classList.add("linked-visible");
  return panel;
}

function hidePanel(actionBar) {
  const panel = actionBar.querySelector(".linked-inline-panel");
  if (panel) {
    panel.classList.remove("linked-visible");
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

  let hideTimer = null;

  const startHideTimer = () => {
    hideTimer = window.setTimeout(() => hidePanel(actionBar), 180);
  };

  const cancelHideTimer = () => {
    if (hideTimer !== null) {
      window.clearTimeout(hideTimer);
      hideTimer = null;
    }
  };

  likeButton.addEventListener("mouseenter", () => {
    cancelHideTimer();
    showPanel(actionBar, likeButton);
  });

  likeButton.addEventListener("focus", () => {
    cancelHideTimer();
    showPanel(actionBar, likeButton);
  });

  likeButton.addEventListener("mouseleave", startHideTimer);
  likeButton.addEventListener("blur", startHideTimer);

  actionBar.addEventListener("mouseenter", cancelHideTimer);
  actionBar.addEventListener("mouseleave", startHideTimer);

  actionBar.dataset.linkedBound = "true";
}

function getReactionLabel(type) {
  return TYPE_TO_LABEL[type] || "Like";
}

function isReactionOptionElement(element) {
  if (!element) return false;
  const label = textOf(element);
  if (!label) return false;

  const isButtonLike =
    element.matches("button") ||
    element.getAttribute("role") === "button" ||
    element.closest("button") !== null;

  if (!isButtonLike) return false;

  return Object.values(TYPE_TO_LABEL).some((reactionLabel) => label.includes(reactionLabel));
}

function distanceBetween(aRect, bRect) {
  const ax = aRect.left + aRect.width / 2;
  const ay = aRect.top + aRect.height / 2;
  const bx = bRect.left + bRect.width / 2;
  const by = bRect.top + bRect.height / 2;
  return Math.hypot(ax - bx, ay - by);
}

function findBestReactionOption(likeButton, type) {
  const label = getReactionLabel(type);
  const selectors = [
    `button[aria-label*='${label}']`,
    `[role='button'][aria-label*='${label}']`,
    `li button[aria-label*='${label}']`
  ];

  const postContainer = getPostContainerFromButton(likeButton);
  const candidates = [];

  for (const selector of selectors) {
    for (const node of document.querySelectorAll(selector)) {
      if (!isVisible(node)) continue;
      if (node.closest(".linked-inline-panel")) continue;
      if (!isReactionOptionElement(node)) continue;

      const insidePost = postContainer.contains(node);
      const score = insidePost ? 0 : 1;
      candidates.push({ node, score });
    }
  }

  if (!candidates.length) {
    return null;
  }

  const likeRect = likeButton.getBoundingClientRect();
  candidates.sort((a, b) => {
    if (a.score !== b.score) {
      return a.score - b.score;
    }
    return distanceBetween(a.node.getBoundingClientRect(), likeRect) - distanceBetween(b.node.getBoundingClientRect(), likeRect);
  });

  return candidates[0].node;
}

async function applyReactionToPost(likeButton, type) {
  likeButton.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
  likeButton.click();

  await wait(220);

  const option = findBestReactionOption(likeButton, type);
  if (!option) {
    return;
  }

  option.click();
}

function clearPreviousHides() {
  for (const node of document.querySelectorAll("[data-linked-hidden='true']")) {
    node.style.display = "";
    node.removeAttribute("data-linked-hidden");
  }
}

function hideBuiltInReactions() {
  clearPreviousHides();

  if (!cachedState.hiddenBuiltins.length) {
    return;
  }

  const hiddenLabels = cachedState.hiddenBuiltins
    .filter((type) => REACTION_TYPES.includes(type))
    .map((type) => TYPE_TO_LABEL[type]);

  if (!hiddenLabels.length) {
    return;
  }

  const clickableNodes = document.querySelectorAll("button[aria-label], [role='button'][aria-label], li button[aria-label]");

  for (const node of clickableNodes) {
    if (!isVisible(node)) continue;
    if (node.closest(".linked-inline-panel")) continue;

    const label = textOf(node);
    if (!label) continue;

    const matchHidden = hiddenLabels.some((hiddenLabel) => label.includes(hiddenLabel));
    const looksLikeReaction = Object.values(TYPE_TO_LABEL).some((reactionLabel) => label.includes(reactionLabel));

    if (matchHidden && looksLikeReaction) {
      node.style.display = "none";
      node.setAttribute("data-linked-hidden", "true");
    }
  }
}

function bindAllActionBars() {
  for (const actionBar of getActionBars()) {
    bindActionBar(actionBar);
  }
}

function refreshPanels() {
  for (const actionBar of getActionBars()) {
    if (actionBar.querySelector(".linked-inline-panel")) {
      const likeButton = getLikeButtonInActionBar(actionBar);
      if (!likeButton) continue;
      createCustomPanel(actionBar, likeButton, cachedState.customReactions);
    }
  }
}

async function loadStateFromStorage() {
  cachedState = await chrome.storage.sync.get(STORAGE_DEFAULTS);
}

async function refreshAll() {
  await loadStateFromStorage();
  bindAllActionBars();
  refreshPanels();
  hideBuiltInReactions();
}

chrome.storage.onChanged.addListener(async () => {
  await refreshAll();
});

const observer = new MutationObserver(() => {
  bindAllActionBars();
  hideBuiltInReactions();
});

observer.observe(document.documentElement, { childList: true, subtree: true });

refreshAll();
