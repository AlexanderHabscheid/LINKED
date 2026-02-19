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

async function loadState() {
  const state = await chrome.storage.sync.get(DEFAULTS);
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
    li.innerHTML = `<span>${item.emoji} ${item.label} -> ${displayType(item.linkedInType)}</span>`;
    const removeBtn = document.createElement("button");
    removeBtn.textContent = "Delete";
    removeBtn.addEventListener("click", () => removeCustom(index));
    li.appendChild(removeBtn);
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

function displayType(type) {
  const hit = BUILTINS.find((x) => x.type === type);
  return hit ? hit.label : type;
}

async function removeCustom(index) {
  const state = await chrome.storage.sync.get(DEFAULTS);
  state.customReactions.splice(index, 1);
  await chrome.storage.sync.set({ customReactions: state.customReactions });
  loadState();
}

async function toggleBuiltin(type, shouldHide) {
  const state = await chrome.storage.sync.get(DEFAULTS);
  const set = new Set(state.hiddenBuiltins);
  if (shouldHide) {
    set.add(type);
  } else {
    set.delete(type);
  }
  await chrome.storage.sync.set({ hiddenBuiltins: [...set] });
}

addBtn.addEventListener("click", async () => {
  const emoji = emojiEl.value.trim();
  const label = labelEl.value.trim();
  const linkedInType = linkedInTypeEl.value;

  if (!emoji || !label) {
    return;
  }

  const state = await chrome.storage.sync.get(DEFAULTS);
  state.customReactions.push({ emoji, label, linkedInType });
  await chrome.storage.sync.set({ customReactions: state.customReactions });

  emojiEl.value = "";
  labelEl.value = "";
  loadState();
});

loadState();
