const DEFAULTS = {
  customReactions: [],
  hiddenBuiltins: []
};

const BUILTINS = [
  { type: "like", label: "Like" },
  { type: "praise", label: "Celebrate" },
  { type: "empathy", label: "Support" },
  { type: "interest", label: "Love" },
  { type: "appreciation", label: "Insightful" },
  { type: "maybe", label: "Funny" }
];

const emojiEl = document.getElementById("emoji");
const labelEl = document.getElementById("label");
const linkedInTypeEl = document.getElementById("linkedInType");
const addBtn = document.getElementById("addBtn");
const customListEl = document.getElementById("customList");
const builtinTogglesEl = document.getElementById("builtinToggles");
const exportBtn = document.getElementById("exportBtn");
const importBtn = document.getElementById("importBtn");

function displayType(type) {
  const hit = BUILTINS.find((x) => x.type === type);
  return hit ? hit.label : type;
}

function sanitizeCustomReaction(item) {
  if (!item || typeof item !== "object") return null;

  const emoji = String(item.emoji || "").trim();
  const label = String(item.label || "").trim();
  const linkedInType = String(item.linkedInType || "").trim();

  if (!emoji || !label) return null;
  if (!BUILTINS.some((x) => x.type === linkedInType)) return null;

  return { emoji, label, linkedInType };
}

async function getState() {
  return chrome.storage.sync.get(DEFAULTS);
}

async function saveCustomReactions(customReactions) {
  await chrome.storage.sync.set({ customReactions });
}

async function loadState() {
  const state = await getState();
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
  BUILTINS.forEach((builtin) => {
    const row = document.createElement("label");
    row.className = "toggle-row";
    row.innerHTML = `<span>${builtin.label}</span>`;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = hiddenBuiltins.includes(builtin.type);
    checkbox.addEventListener("change", () => toggleBuiltin(builtin.type, checkbox.checked));

    row.appendChild(checkbox);
    builtinTogglesEl.appendChild(row);
  });
}

async function removeCustom(index) {
  const state = await getState();
  state.customReactions.splice(index, 1);
  await saveCustomReactions(state.customReactions);
  loadState();
}

async function moveCustom(index, offset) {
  const state = await getState();
  const nextIndex = index + offset;
  if (nextIndex < 0 || nextIndex >= state.customReactions.length) {
    return;
  }

  const next = [...state.customReactions];
  const [item] = next.splice(index, 1);
  next.splice(nextIndex, 0, item);

  await saveCustomReactions(next);
  loadState();
}

async function toggleBuiltin(type, shouldHide) {
  const state = await getState();
  const set = new Set(state.hiddenBuiltins);
  if (shouldHide) {
    set.add(type);
  } else {
    set.delete(type);
  }
  await chrome.storage.sync.set({ hiddenBuiltins: [...set] });
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

  const state = await getState();
  state.customReactions.push(item);
  await saveCustomReactions(state.customReactions);

  emojiEl.value = "";
  labelEl.value = "";
  loadState();
});

exportBtn.addEventListener("click", async () => {
  const state = await getState();
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
    await saveCustomReactions(next);
    loadState();
  } catch {
    importBtn.textContent = "Invalid";
    setTimeout(() => {
      importBtn.textContent = "Import";
    }, 900);
  }
});

loadState();
