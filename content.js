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

function ensureWidget() {
  if (document.getElementById("linked-widget")) {
    return;
  }

  const widget = document.createElement("div");
  widget.id = "linked-widget";
  widget.innerHTML = `
    <div class="linked-header">LINKED</div>
    <div id="linked-custom-list" class="linked-list"></div>
  `;

  document.body.appendChild(widget);
}

async function renderWidget() {
  ensureWidget();
  const { customReactions } = await chrome.storage.sync.get(STORAGE_DEFAULTS);
  const list = document.getElementById("linked-custom-list");
  if (!list) return;

  list.innerHTML = "";
  if (!customReactions.length) {
    const empty = document.createElement("div");
    empty.className = "linked-item empty";
    empty.textContent = "No custom reactions";
    list.appendChild(empty);
    return;
  }

  for (const item of customReactions) {
    const button = document.createElement("button");
    button.className = "linked-item";
    button.textContent = `${item.emoji} ${item.label}`;
    button.title = `Send as ${TYPE_TO_LABEL[item.linkedInType] || item.linkedInType}`;
    button.addEventListener("click", () => reactToFirstVisiblePost(item.linkedInType));
    list.appendChild(button);
  }
}

function getFirstPostLikeButton() {
  const selectors = [
    "button[aria-label='React Like']",
    "button[aria-label='Like']",
    ".feed-shared-social-action-bar button[aria-label*='Like']"
  ];

  for (const selector of selectors) {
    const button = document.querySelector(selector);
    if (button) {
      return button;
    }
  }

  return null;
}

async function reactToFirstVisiblePost(type) {
  const likeButton = getFirstPostLikeButton();
  if (!likeButton) {
    return;
  }

  likeButton.click();
  await wait(220);

  const reactionItem = document.querySelector(`button[aria-label*='${TYPE_TO_LABEL[type]}']`) ||
    document.querySelector(`li button[aria-label*='${TYPE_TO_LABEL[type]}']`);

  if (reactionItem) {
    reactionItem.click();
  }
}

async function applyHiddenBuiltins() {
  const { hiddenBuiltins } = await chrome.storage.sync.get(STORAGE_DEFAULTS);

  document.querySelectorAll("[data-linked-hidden='true']").forEach((el) => {
    el.style.display = "";
    el.removeAttribute("data-linked-hidden");
  });

  if (!hiddenBuiltins.length) {
    return;
  }

  const hiddenLabels = hiddenBuiltins.map((type) => TYPE_TO_LABEL[type]).filter(Boolean);

  document.querySelectorAll("button,li,span").forEach((node) => {
    const label = node.getAttribute("aria-label") || node.textContent || "";
    if (hiddenLabels.some((builtIn) => label.includes(builtIn))) {
      node.style.display = "none";
      node.setAttribute("data-linked-hidden", "true");
    }
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function refreshFromStorage() {
  await renderWidget();
  await applyHiddenBuiltins();
}

chrome.storage.onChanged.addListener(() => {
  refreshFromStorage();
});

const observer = new MutationObserver(() => {
  applyHiddenBuiltins();
});

observer.observe(document.documentElement, { childList: true, subtree: true });

refreshFromStorage();
