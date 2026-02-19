const DEFAULTS = {
  customReactions: [],
  hiddenBuiltins: []
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

const emojiEl = document.getElementById("emoji");
const labelEl = document.getElementById("label");
const linkedInTypeEl = document.getElementById("linkedInType");
const addBtn = document.getElementById("addBtn");
const customListEl = document.getElementById("customList");
const builtinTogglesEl = document.getElementById("builtinToggles");
const exportBtn = document.getElementById("exportBtn");
const importBtn = document.getElementById("importBtn");

const REACTION_TYPES = new Set(REACTIONS.map((item) => item.type));

function normalizeType(type) {
  return TYPE_ALIASES[String(type || "").trim().toLowerCase()] || null;
}

function displayType(type) {
  const normalized = normalizeType(type);
  const hit = REACTIONS.find((item) => item.type === normalized);
  return hit ? hit.label : type;
}

function sanitizeCustomReaction(item) {
  if (!item || typeof item !== "object") return null;

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

async function getState() {
  return chrome.storage.sync.get(DEFAULTS);
}

async function saveState(next) {
  await chrome.storage.sync.set(next);
}

async function migrateStateIfNeeded() {
  const state = await getState();

  const sanitizedCustom = (state.customReactions || [])
    .map(sanitizeCustomReaction)
    .filter(Boolean);

  const sanitizedHidden = sanitizeHiddenBuiltins(state.hiddenBuiltins);

  const customChanged = JSON.stringify(sanitizedCustom) !== JSON.stringify(state.customReactions || []);
  const hiddenChanged = JSON.stringify(sanitizedHidden) !== JSON.stringify(state.hiddenBuiltins || []);

  if (customChanged || hiddenChanged) {
    await saveState({
      customReactions: sanitizedCustom,
      hiddenBuiltins: sanitizedHidden
    });
  }

  return {
    customReactions: sanitizedCustom,
    hiddenBuiltins: sanitizedHidden
  };
}

async function loadState() {
  const state = await migrateStateIfNeeded();
  renderCustomList(state.customReactions);
  renderBuiltinToggles(state.hiddenBuiltins);
}

function renderCustomList(items) {
  customListEl.innerHTML = "";
  if (items.length === 0) {
    const li = document.createElement("li");
    li.textContent = "No custom reactions yet";
    customListEl.appendChild(li);
    return;
  }

  items.forEach((item, index) => {
    const li = document.createElement("li");

    const text = document.createElement("span");
    text.textContent = `${item.emoji} ${item.label} -> ${displayType(item.linkedInType)}`;

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

    li.appendChild(text);
    li.appendChild(actions);
    customListEl.appendChild(li);
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

async function removeCustom(index) {
  const state = await migrateStateIfNeeded();
  state.customReactions.splice(index, 1);
  await saveState({ customReactions: state.customReactions });
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

  await saveState({ customReactions: next });
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

  await saveState({ hiddenBuiltins: Array.from(set) });
}

addBtn.addEventListener("click", async () => {
  const item = sanitizeCustomReaction({
    emoji: emojiEl.value,
    label: labelEl.value,
    linkedInType: linkedInTypeEl.value
  });

  if (!item) {
    return;
  }

  const state = await migrateStateIfNeeded();
  state.customReactions.push(item);

  await saveState({ customReactions: state.customReactions });

  emojiEl.value = "";
  labelEl.value = "";
  loadState();
});

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
    await saveState({ customReactions: next });
    loadState();
  } catch {
    importBtn.textContent = "Invalid";
    setTimeout(() => {
      importBtn.textContent = "Import";
    }, 900);
  }
});

loadState();
