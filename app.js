const DB_NAME = "ms-meme-studio";
const DB_VERSION = 1;
const ASSET_STORE = "assets";
const DRAFT_STORE = "drafts";
const DRAFT_ID = "current-draft";
const BUILD_INFO = window.__BUILD_INFO__ || { commit: "local", builtAt: "local" };

const categories = [
  ["all", "All"],
  ["character", "Characters"],
  ["location", "Locations"],
  ["equipment", "Equipment"],
  ["prop", "Props"],
  ["running-gag", "Running Gags"],
  ["style-rule", "Style Rules"],
  ["previous-meme", "Previous Memes"]
];

const builderCategories = [
  "character",
  "location",
  "equipment",
  "prop",
  "running-gag",
  "style-rule",
  "previous-meme"
];

const formats = [
  "single-panel cartoon",
  "multi-panel comic",
  "fake advert",
  "poster",
  "Top Trumps card",
  "birthday card",
  "freeform"
];

const aspectRatios = ["square", "portrait", "landscape", "mobile story"];
const tones = ["workplace-friendly", "chaotic", "deadpan", "absurd", "sentimental", "birthday/farewell"];

const seedAssets = [
  {
    name: "Cafe Team Character Sheet",
    category: "character",
    description: "Reusable cartoon staff reference with uniform notes and friendly expressions.",
    tags: ["team", "uniform", "reference"],
    notes: "Replace with individual character sheets when ready."
  },
  {
    name: "Coffee Bar Reference",
    category: "location",
    description: "Main cafe counter, pastry case, pickup area, and queue line.",
    tags: ["counter", "layout"],
    notes: "Useful when the joke depends on believable cafe geography."
  },
  {
    name: "WMF Coffee Machine",
    category: "equipment",
    description: "Large espresso machine with milk wand, cups stacked nearby, and cleaning cloth.",
    tags: ["coffee", "machine"],
    notes: "Keep scale accurate beside characters."
  },
  {
    name: "The Last Toastie",
    category: "running-gag",
    description: "A dramatic workplace saga about one remaining toastie at lunch rush.",
    tags: ["food", "chaos"],
    notes: "Works well in deadpan or fake advert formats."
  }
];

const state = {
  route: "library",
  assets: [],
  draft: createEmptyDraft(),
  activeCategory: "all",
  editingAssetId: null
};

let dbPromise;

function createEmptyDraft() {
  const now = new Date().toISOString();
  return {
    id: DRAFT_ID,
    title: "Untitled meme",
    selectedAssetIds: [],
    jokeIdea: "",
    dialogue: "",
    caption: "",
    format: formats[0],
    aspectRatio: aspectRatios[0],
    tone: tones[0],
    generatedPrompt: "",
    createdAt: now,
    updatedAt: now
  };
}

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ASSET_STORE)) {
        const store = db.createObjectStore(ASSET_STORE, { keyPath: "id" });
        store.createIndex("category", "category", { unique: false });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }
      if (!db.objectStoreNames.contains(DRAFT_STORE)) {
        db.createObjectStore(DRAFT_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function tx(storeName, mode, action) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const result = action(store);
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getAllAssets() {
  const db = await openDb();
  return requestToPromise(db.transaction(ASSET_STORE).objectStore(ASSET_STORE).getAll());
}

async function saveAsset(asset) {
  return tx(ASSET_STORE, "readwrite", (store) => store.put(asset));
}

async function deleteAsset(id) {
  return tx(ASSET_STORE, "readwrite", (store) => store.delete(id));
}

async function saveDraft() {
  state.draft.generatedPrompt = generatePrompt();
  state.draft.updatedAt = new Date().toISOString();
  return tx(DRAFT_STORE, "readwrite", (store) => store.put(state.draft));
}

async function loadDraft() {
  const db = await openDb();
  const draft = await requestToPromise(db.transaction(DRAFT_STORE).objectStore(DRAFT_STORE).get(DRAFT_ID));
  state.draft = draft || createEmptyDraft();
}

function makeId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `asset-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function init() {
  await openDb();
  state.assets = await getAllAssets();
  if (state.assets.length === 0) {
    const now = new Date().toISOString();
    await Promise.all(
      seedAssets.map((asset) =>
        saveAsset({ ...asset, id: makeId(), imageBlob: null, createdAt: now, updatedAt: now })
      )
    );
    state.assets = await getAllAssets();
  }
  await loadDraft();
  state.draft.generatedPrompt = generatePrompt();
  bindGlobalEvents();
  render();
  registerServiceWorker();
  updateStorageStatus();
  await updateBuildStatus();
}

function bindGlobalEvents() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => {
      state.route = button.dataset.route;
      render();
      document.getElementById("app").focus();
    });
  });

  window.addEventListener("online", updateStorageStatus);
  window.addEventListener("offline", updateStorageStatus);
}

function updateStorageStatus() {
  const status = document.getElementById("storageStatus");
  status.textContent = navigator.onLine ? "Saved on this device" : "Offline and saved locally";
}

async function updateBuildStatus() {
  const status = document.getElementById("buildStatus");
  const commit = BUILD_INFO.commit || "local";
  status.textContent = `Build ${commit}`;
  if (!navigator.onLine) return;

  try {
    const response = await fetch("https://api.github.com/repos/sourmilkman/CafeMemeGen/commits/main");
    if (!response.ok) return;
    const data = await response.json();
    if (data.sha) status.textContent = `Build ${data.sha.slice(0, 7)}`;
  } catch {
    // The static build info remains visible if GitHub's API is unavailable.
  }
}

function setRoute(route) {
  state.route = route;
  render();
}

function render() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.route === state.route);
  });

  const app = document.getElementById("app");
  const screens = {
    library: renderLibrary,
    builder: renderBuilder,
    prompt: renderPrompt,
    settings: renderSettings
  };
  app.innerHTML = screens[state.route]();
  bindScreenEvents();
}

function bindScreenEvents() {
  if (state.route === "library") bindLibraryEvents();
  if (state.route === "builder") bindBuilderEvents();
  if (state.route === "prompt") bindPromptEvents();
  if (state.route === "settings") bindSettingsEvents();
}

function categoryLabel(category) {
  return categories.find(([value]) => value === category)?.[1] || category;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function assetThumb(asset) {
  if (asset.imageBlob) {
    const url = URL.createObjectURL(asset.imageBlob);
    return `<img src="${url}" alt="">`;
  }
  return escapeHtml(asset.name.slice(0, 1).toUpperCase());
}

function tagsHtml(tags = []) {
  if (!tags.length) return "";
  return `<div class="tag-row">${tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>`;
}

function renderCategoryStrip() {
  return `<div class="category-strip" role="list" aria-label="Asset categories">
    ${categories
      .map(
        ([value, label]) =>
          `<button class="chip ${state.activeCategory === value ? "active" : ""}" type="button" data-category="${value}">${label}</button>`
      )
      .join("")}
  </div>`;
}

function renderAssetList(assets) {
  if (!assets.length) {
    return `<div class="empty">No assets here yet. Add one above or import a library backup.</div>`;
  }

  return `<div class="asset-list">
    ${assets
      .map(
        (asset) => `<article class="asset-card">
          <div class="asset-thumb">${assetThumb(asset)}</div>
          <div>
            <h4>${escapeHtml(asset.name)}</h4>
            <p>${escapeHtml(categoryLabel(asset.category))} · ${escapeHtml(asset.description || "No description")}</p>
            ${tagsHtml(asset.tags)}
          </div>
          <button class="icon-button" type="button" data-edit-asset="${asset.id}" aria-label="Edit ${escapeHtml(asset.name)}">✎</button>
        </article>`
      )
      .join("")}
  </div>`;
}

function renderLibrary() {
  const filtered =
    state.activeCategory === "all"
      ? state.assets
      : state.assets.filter((asset) => asset.category === state.activeCategory);
  const editing = state.assets.find((asset) => asset.id === state.editingAssetId);

  return `<section class="screen">
    <div class="screen-heading">
      <h2>Reusable meme assets</h2>
      <p>Create characters, cafe references, equipment, props, style rules, and running gags. Images stay inside this browser.</p>
    </div>
    <div class="summary-bar">
      <div class="summary-tile"><strong>${state.assets.length}</strong><span>Assets</span></div>
      <div class="summary-tile"><strong>${state.assets.filter((asset) => asset.imageBlob).length}</strong><span>Images</span></div>
      <div class="summary-tile"><strong>${state.draft.selectedAssetIds.length}</strong><span>Selected</span></div>
    </div>
    <div class="two-column">
      <form id="assetForm" class="panel grid">
        <div class="panel-title">
          <h3>${editing ? "Edit asset" : "Add asset"}</h3>
          ${editing ? `<button class="button" type="button" id="cancelEdit">Cancel</button>` : ""}
        </div>
        <input type="hidden" name="id" value="${escapeHtml(editing?.id || "")}">
        <div class="field">
          <label for="assetName">Name</label>
          <input id="assetName" name="name" required value="${escapeHtml(editing?.name || "")}" placeholder="Alex Character Sheet">
        </div>
        <div class="field">
          <label for="assetCategory">Category</label>
          <select id="assetCategory" name="category">
            ${categories
              .filter(([value]) => value !== "all")
              .map(
                ([value, label]) =>
                  `<option value="${value}" ${editing?.category === value ? "selected" : ""}>${label}</option>`
              )
              .join("")}
          </select>
        </div>
        <div class="field">
          <label for="assetDescription">Short description</label>
          <textarea id="assetDescription" name="description" placeholder="What should the AI preserve?">${escapeHtml(editing?.description || "")}</textarea>
        </div>
        <div class="field">
          <label for="assetTags">Tags</label>
          <input id="assetTags" name="tags" value="${escapeHtml((editing?.tags || []).join(", "))}" placeholder="uniform, espresso, queue">
        </div>
        <div class="field">
          <label for="assetImage">Image upload</label>
          <input id="assetImage" name="image" type="file" accept="image/*">
        </div>
        <div class="field">
          <label for="assetNotes">Notes</label>
          <textarea id="assetNotes" name="notes" placeholder="Extra prompt guidance">${escapeHtml(editing?.notes || "")}</textarea>
        </div>
        <div class="actions">
          <button class="button primary" type="submit">${editing ? "Save changes" : "Add asset"}</button>
          ${editing ? `<button class="button danger" type="button" id="deleteAsset">Delete</button>` : ""}
        </div>
      </form>
      <div class="grid">
        ${renderCategoryStrip()}
        ${renderAssetList(filtered)}
      </div>
    </div>
  </section>`;
}

function bindLibraryEvents() {
  document.querySelectorAll("[data-category]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeCategory = button.dataset.category;
      render();
    });
  });

  document.querySelectorAll("[data-edit-asset]").forEach((button) => {
    button.addEventListener("click", () => {
      state.editingAssetId = button.dataset.editAsset;
      render();
    });
  });

  document.getElementById("cancelEdit")?.addEventListener("click", () => {
    state.editingAssetId = null;
    render();
  });

  document.getElementById("deleteAsset")?.addEventListener("click", async () => {
    if (!state.editingAssetId) return;
    await deleteAsset(state.editingAssetId);
    state.draft.selectedAssetIds = state.draft.selectedAssetIds.filter((id) => id !== state.editingAssetId);
    await saveDraft();
    state.editingAssetId = null;
    await refreshAssets();
    showToast("Asset deleted");
  });

  document.getElementById("assetForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const existing = state.assets.find((asset) => asset.id === form.get("id"));
    const file = form.get("image");
    const now = new Date().toISOString();
    const asset = {
      id: existing?.id || makeId(),
      name: form.get("name").trim(),
      category: form.get("category"),
      description: form.get("description").trim(),
      tags: form
        .get("tags")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      notes: form.get("notes").trim(),
      imageBlob: file && file.size ? file : existing?.imageBlob || null,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };
    await saveAsset(asset);
    state.editingAssetId = null;
    await refreshAssets();
    showToast(existing ? "Asset updated" : "Asset added");
  });
}

async function refreshAssets() {
  state.assets = await getAllAssets();
  state.draft.generatedPrompt = generatePrompt();
  render();
}

function renderBuilder() {
  return `<section class="screen">
    <div class="screen-heading">
      <h2>Build the joke</h2>
      <p>Pick references, set the format, then write the idea exactly as you want it to land.</p>
    </div>
    <div class="two-column">
      <div class="grid">
        <form id="draftForm" class="panel grid">
          <div class="panel-title">
            <h3>Meme details</h3>
            <span>Autosaves</span>
          </div>
          <div class="field">
            <label for="jokeIdea">Joke idea</label>
            <textarea id="jokeIdea" name="jokeIdea" placeholder="A calm shift briefing slowly becomes a debate about the last toastie.">${escapeHtml(state.draft.jokeIdea)}</textarea>
          </div>
          <div class="field">
            <label for="dialogue">Dialogue</label>
            <textarea id="dialogue" name="dialogue" placeholder="Alex: Nobody touch it.&#10;Sam: I only looked at it.">${escapeHtml(state.draft.dialogue)}</textarea>
          </div>
          <div class="field">
            <label for="caption">Caption</label>
            <textarea id="caption" name="caption" placeholder="When lunch rush becomes a hostage negotiation">${escapeHtml(state.draft.caption)}</textarea>
          </div>
          <div class="three-grid">
            ${renderSelect("format", "Format", formats, state.draft.format)}
            ${renderSelect("aspectRatio", "Aspect ratio", aspectRatios, state.draft.aspectRatio)}
            ${renderSelect("tone", "Tone", tones, state.draft.tone)}
          </div>
        </form>
        <button class="button danger full" type="button" id="copyFromBuilder">Copy Prompt</button>
      </div>
      <div class="panel">
        <div class="panel-title">
          <h3>Reference assets</h3>
          <span>${state.draft.selectedAssetIds.length} selected</span>
        </div>
        <div class="selection-group">
          ${builderCategories.map(renderAssetSelector).join("")}
        </div>
      </div>
    </div>
  </section>`;
}

function renderSelect(name, label, options, value) {
  return `<div class="field">
    <label for="${name}">${label}</label>
    <select id="${name}" name="${name}">
      ${options.map((option) => `<option value="${option}" ${value === option ? "selected" : ""}>${option}</option>`).join("")}
    </select>
  </div>`;
}

function renderAssetSelector(category) {
  const assets = state.assets.filter((asset) => asset.category === category);
  if (!assets.length) {
    return `<div class="asset-selector">
      <div class="panel-title"><h3>${categoryLabel(category)}</h3></div>
      <div class="empty">No ${categoryLabel(category).toLowerCase()} yet.</div>
    </div>`;
  }

  return `<div class="asset-selector">
    <div class="panel-title"><h3>${categoryLabel(category)}</h3></div>
    ${assets
      .map(
        (asset) => `<label class="selector-row">
          <input type="checkbox" value="${asset.id}" data-select-asset ${state.draft.selectedAssetIds.includes(asset.id) ? "checked" : ""}>
          <span><strong>${escapeHtml(asset.name)}</strong><span>${escapeHtml(asset.description || categoryLabel(asset.category))}</span></span>
        </label>`
      )
      .join("")}
  </div>`;
}

function bindBuilderEvents() {
  document.getElementById("draftForm").addEventListener("input", async (event) => {
    const target = event.target;
    if (!target.name) return;
    state.draft[target.name] = target.value;
    await saveDraft();
  });

  document.querySelectorAll("[data-select-asset]").forEach((input) => {
    input.addEventListener("change", async () => {
      const selected = new Set(state.draft.selectedAssetIds);
      if (input.checked) selected.add(input.value);
      else selected.delete(input.value);
      state.draft.selectedAssetIds = [...selected];
      await saveDraft();
      render();
    });
  });

  document.getElementById("copyFromBuilder").addEventListener("click", copyPrompt);
}

function renderPrompt() {
  const prompt = generatePrompt();
  return `<section class="screen">
    <div class="screen-heading">
      <h2>Copy-ready prompt</h2>
      <p>This is the complete prompt to paste into ChatGPT image generation. Attach any referenced image files manually.</p>
    </div>
    <div class="two-column">
      <div class="panel grid">
        <div class="panel-title">
          <h3>Prompt actions</h3>
          <span>${prompt.length.toLocaleString()} characters</span>
        </div>
        <button class="button primary full" type="button" id="openChatGpt">Copy and Open ChatGPT</button>
        <button class="button danger full" type="button" id="copyPrompt">Copy Prompt</button>
        <button class="button full" type="button" id="goBuilder">Edit in Builder</button>
        <div class="empty">${selectedAssets().length || "No"} reference assets included. ChatGPT will open in a new tab; paste if the prompt box is empty.</div>
      </div>
      <pre class="prompt-preview">${escapeHtml(prompt)}</pre>
    </div>
  </section>`;
}

function bindPromptEvents() {
  document.getElementById("openChatGpt").addEventListener("click", openChatGptWithPrompt);
  document.getElementById("copyPrompt").addEventListener("click", copyPrompt);
  document.getElementById("goBuilder").addEventListener("click", () => setRoute("builder"));
}

function renderSettings() {
  return `<section class="screen">
    <div class="screen-heading">
      <h2>Backup and install</h2>
      <p>Export the local asset library as JSON, import it on another device, and install the app from your browser menu.</p>
    </div>
    <div class="two-column">
      <div class="panel grid">
        <div class="panel-title">
          <h3>Library backup</h3>
          <span>${state.assets.length} assets</span>
        </div>
        <button class="button primary full" type="button" id="exportLibrary">Export Library as JSON</button>
        <label class="button full" for="importLibrary">Import Library from JSON</label>
        <input class="import-input" id="importLibrary" type="file" accept="application/json,.json">
      </div>
      <div class="panel grid">
        <div class="panel-title">
          <h3>Device status</h3>
          <span>PWA v1</span>
        </div>
        <div class="summary-bar">
          <div class="summary-tile"><strong>${state.assets.length}</strong><span>Assets</span></div>
          <div class="summary-tile"><strong>${state.assets.filter((asset) => asset.imageBlob).length}</strong><span>Stored images</span></div>
          <div class="summary-tile"><strong>${navigator.onLine ? "On" : "Off"}</strong><span>Network</span></div>
        </div>
        <div class="empty">Use your browser's install option to add Meme Studio to the home screen.</div>
      </div>
    </div>
  </section>`;
}

function bindSettingsEvents() {
  document.getElementById("exportLibrary").addEventListener("click", exportLibrary);
  document.getElementById("importLibrary").addEventListener("change", importLibrary);
}

function selectedAssets() {
  const selected = new Set(state.draft.selectedAssetIds);
  return state.assets.filter((asset) => selected.has(asset.id));
}

function groupSelectedAssets() {
  return builderCategories.reduce((groups, category) => {
    groups[category] = selectedAssets().filter((asset) => asset.category === category);
    return groups;
  }, {});
}

function describeAsset(asset) {
  const bits = [asset.name];
  if (asset.description) bits.push(asset.description);
  if (asset.tags?.length) bits.push(`Tags: ${asset.tags.join(", ")}`);
  if (asset.notes) bits.push(`Notes: ${asset.notes}`);
  return bits.join(" — ");
}

function listAssets(assets) {
  if (!assets.length) return "- None selected";
  return assets.map((asset) => `- ${describeAsset(asset)}`).join("\n");
}

function generatePrompt() {
  const groups = groupSelectedAssets();
  const imageAssets = selectedAssets().filter((asset) => asset.imageBlob);
  const attachReminder = imageAssets.length
    ? `\n\nAttach these image files manually before generating:\n${imageAssets.map((asset) => `- ${asset.name}`).join("\n")}`
    : "";

  return `Use the M&S Cafe Cartoon Meme Skill.

REFERENCE ASSETS TO USE:
Characters:
${listAssets(groups.character)}

Locations:
${listAssets(groups.location)}

Equipment / Props:
${listAssets([...groups.equipment, ...groups.prop])}

Running Gags:
${listAssets(groups["running-gag"])}

Style Rules:
${listAssets(groups["style-rule"])}

Previous Memes:
${listAssets(groups["previous-meme"])}

MEME IDEA:
${state.draft.jokeIdea || "[Write the joke idea here]"}

DIALOGUE:
${state.draft.dialogue || "[Write dialogue here]"}

CAPTION:
${state.draft.caption || "[Write caption here]"}

FORMAT:
${state.draft.format}

ASPECT RATIO:
${state.draft.aspectRatio}

TONE:
${state.draft.tone}

STYLE:
Create a polished cartoon meme with expressive characters, clear storytelling, readable text, accurate cafe details, and good-natured workplace humour.

RULES:
- Preserve recognisable likeness from the uploaded character sheets.
- Preserve uniforms, proportions, hairstyles, and body language.
- Use the selected environment and equipment references accurately.
- Humour should come from the situation, not cruelty or mockery.
- Keep speech bubbles readable.
- Keep composition clear.
- Choose the best layout for the joke; do not force single-panel if multi-panel works better.
- Avoid offensive stereotypes, politics, religion, or personal attacks.
- Ensure the joke reads within three seconds.

QUALITY CHECK:
Before generating, verify:
- the selected people are recognisable
- the joke is clear
- the image is not overcrowded
- text is readable
- objects are at correct scale
- cafe layout is believable${attachReminder}`;
}

async function copyPrompt() {
  const prompt = generatePrompt();
  state.draft.generatedPrompt = prompt;
  await saveDraft();

  try {
    await navigator.clipboard.writeText(prompt);
    showToast("Prompt copied");
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = prompt;
    document.body.append(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
    showToast("Prompt copied");
  }
}

async function openChatGptWithPrompt() {
  const chatWindow = window.open("about:blank", "_blank");
  await copyPrompt();
  if (chatWindow) {
    chatWindow.opener = null;
    chatWindow.location.href = "https://chatgpt.com/";
  }
  else window.location.href = "https://chatgpt.com/";
  showToast("Prompt copied. Paste it into ChatGPT.");
}

async function blobToDataUrl(blob) {
  if (!blob) return null;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(dataUrl) {
  if (!dataUrl) return null;
  const response = await fetch(dataUrl);
  return response.blob();
}

async function exportLibrary() {
  const payload = {
    app: "M&S Meme Studio",
    version: 1,
    exportedAt: new Date().toISOString(),
    assets: await Promise.all(
      state.assets.map(async (asset) => ({
        ...asset,
        imageDataUrl: await blobToDataUrl(asset.imageBlob),
        imageBlob: undefined
      }))
    )
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `ms-meme-studio-library-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("Library exported");
}

async function importLibrary(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const payload = JSON.parse(text);
    const assets = Array.isArray(payload) ? payload : payload.assets;
    if (!Array.isArray(assets)) throw new Error("No assets array found");

    for (const imported of assets) {
      const now = new Date().toISOString();
      const asset = {
        id: imported.id || makeId(),
        name: imported.name || "Imported asset",
        category: imported.category || "prop",
        description: imported.description || "",
        tags: Array.isArray(imported.tags) ? imported.tags : [],
        notes: imported.notes || "",
        imageBlob: await dataUrlToBlob(imported.imageDataUrl),
        createdAt: imported.createdAt || now,
        updatedAt: now
      };
      await saveAsset(asset);
    }
    await refreshAssets();
    showToast("Library imported");
  } catch (error) {
    console.error(error);
    showToast("Import failed. Check the JSON file.");
  } finally {
    event.target.value = "";
  }
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => toast.classList.remove("show"), 2200);
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.warn("Service worker registration failed", error);
    });
  });
}

init().catch((error) => {
  console.error(error);
  document.getElementById("app").innerHTML = `<div class="empty">Meme Studio could not start. Refresh the page and try again.</div>`;
});
