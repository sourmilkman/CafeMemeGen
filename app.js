const DB_NAME = "ms-meme-studio";
const DB_VERSION = 2;
const ASSET_STORE = "assets";
const DRAFT_STORE = "drafts";
const DRAFT_ID = "current-draft";
const BUILD_INFO = window.__BUILD_INFO__ || { commit: "local" };

const categories = [
  ["colleague", "Colleagues"],
  ["set", "Sets"],
  ["prop", "Props"],
  ["equipment", "Equipment"]
];
const colleagueNames = [
  "Alex", "Anna", "Bea", "Bobbie", "Bryony", "Clarke", "Conrad", "Cormac", "Derega",
  "Emma", "Florence", "Hattie", "Henry", "Jane", "Jassy", "Jo", "Jono", "Kate",
  "Kristian", "Lillie", "Lisa", "Liz", "Manni", "Nicola", "Rachel", "Ricky", "Rosanna",
  "Sam", "Twiggy", "Vicky", "Zoie", "Josh", "Lee", "Wendy"
];
const formats = ["single-panel cartoon", "multi-panel comic", "fake advert", "poster", "Top Trumps card", "birthday card", "freeform"];
const aspectRatios = ["square", "portrait", "landscape", "mobile story"];
const tones = ["workplace-friendly", "chaotic", "deadpan", "absurd", "sentimental", "birthday/farewell"];
const state = { route: "builder", assets: [], draft: createEmptyDraft() };
let dbPromise;

function createEmptyDraft() {
  return { id: DRAFT_ID, selectedAssetIds: [], jokeIdea: "", dialogue: "", caption: "", format: formats[0], aspectRatio: aspectRatios[0], tone: tones[0], extraInstructions: "", generatedPrompt: "", updatedAt: new Date().toISOString() };
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
      }
      if (!db.objectStoreNames.contains(DRAFT_STORE)) db.createObjectStore(DRAFT_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getAll(storeName) {
  const db = await openDb();
  return requestToPromise(db.transaction(storeName).objectStore(storeName).getAll());
}

async function put(storeName, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(value);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function removeAsset(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ASSET_STORE, "readwrite");
    tx.objectStore(ASSET_STORE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

function makeId() {
  return crypto.randomUUID?.() || `asset-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function ensureLibrary() {
  const map = { character: "colleague", location: "set" };
  for (const asset of await getAll(ASSET_STORE)) {
    if (map[asset.category]) await put(ASSET_STORE, { id: asset.id, name: asset.name, category: map[asset.category] });
  }
  const existing = await getAll(ASSET_STORE);
  const known = new Set(existing.filter((asset) => asset.category === "colleague").map((asset) => asset.name.toLowerCase()));
  for (const name of colleagueNames) {
    if (!known.has(name.toLowerCase())) await put(ASSET_STORE, { id: makeId(), name, category: "colleague" });
  }
  state.assets = (await getAll(ASSET_STORE)).filter((asset) => categories.some(([value]) => value === asset.category));
}

async function loadDraft() {
  const saved = (await getAll(DRAFT_STORE)).find((draft) => draft.id === DRAFT_ID);
  state.draft = { ...createEmptyDraft(), ...(saved || {}) };
}

async function saveDraft() {
  state.draft.generatedPrompt = generatePrompt();
  state.draft.updatedAt = new Date().toISOString();
  await put(DRAFT_STORE, state.draft);
}

function escapeHtml(value = "") {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function categoryLabel(category) {
  return categories.find(([value]) => value === category)?.[1] || category;
}

function assetsFor(category) {
  return state.assets.filter((asset) => asset.category === category).sort((a, b) => a.name.localeCompare(b.name));
}

function selectedAssets() {
  const ids = new Set(state.draft.selectedAssetIds);
  return state.assets.filter((asset) => ids.has(asset.id));
}

function renderSelector(category) {
  const assets = assetsFor(category);
  return `<fieldset class="choice-group"><legend>${categoryLabel(category)}</legend><div class="choice-grid">
    ${assets.length ? assets.map((asset) => `<label class="choice-pill"><input type="checkbox" value="${asset.id}" data-select-asset ${state.draft.selectedAssetIds.includes(asset.id) ? "checked" : ""}><span>${escapeHtml(asset.name)}</span></label>`).join("") : `<p class="empty-inline">Add names in Library when needed.</p>`}
  </div></fieldset>`;
}

function renderSelect(name, label, options, value) {
  return `<div class="field"><label for="${name}">${label}</label><select id="${name}" name="${name}">${options.map((option) => `<option value="${option}" ${value === option ? "selected" : ""}>${option}</option>`).join("")}</select></div>`;
}

function renderBuilder() {
  return `<section class="screen">
    <div class="hero"><span class="eyebrow">QUICK BUILDER</span><h2>Build the joke. Pick the cast. Go.</h2><p>Tick only what appears in the meme, add the idea, then copy straight to CafeMeme.</p></div>
    <form id="draftForm" class="builder-layout">
      <div class="panel asset-picker"><div class="panel-title"><h3>Included assets</h3><span>${state.draft.selectedAssetIds.length} selected</span></div>${categories.map(([category]) => renderSelector(category)).join("")}</div>
      <div class="panel grid sticky-composer">
        <div class="field"><label for="jokeIdea">Meme idea</label><textarea id="jokeIdea" name="jokeIdea" required placeholder="What happens, and what makes it funny?">${escapeHtml(state.draft.jokeIdea)}</textarea></div>
        <div class="field"><label for="dialogue">Dialogue <span>optional</span></label><textarea id="dialogue" name="dialogue" placeholder="Alex: ...">${escapeHtml(state.draft.dialogue)}</textarea></div>
        <div class="field"><label for="caption">Caption <span>optional</span></label><textarea id="caption" name="caption" placeholder="Short, instantly readable caption">${escapeHtml(state.draft.caption)}</textarea></div>
        <div class="compact-grid">${renderSelect("format", "Format", formats, state.draft.format)}${renderSelect("aspectRatio", "Ratio", aspectRatios, state.draft.aspectRatio)}${renderSelect("tone", "Tone", tones, state.draft.tone)}</div>
        <div class="field"><label for="extraInstructions">Anything else? <span>optional</span></label><textarea id="extraInstructions" name="extraInstructions" placeholder="Pose, expression, layout, background detail…">${escapeHtml(state.draft.extraInstructions)}</textarea></div>
        <button class="button primary full" type="button" id="copyFromBuilder">Copy prompt</button>
        <button class="button full" type="button" id="openFromBuilder">Copy & open ChatGPT</button>
      </div>
    </form>
  </section>`;
}

function renderLibrary() {
  return `<section class="screen">
    <div class="hero"><span class="eyebrow">LIBRARY</span><h2>Names, neatly organised.</h2><p>No uploads or long descriptions. Add sets, props and equipment only when you need them.</p></div>
    <form id="assetForm" class="panel add-row"><div class="field"><label for="assetName">Asset name</label><input id="assetName" name="name" required placeholder="e.g. Cake counter"></div><div class="field"><label for="assetCategory">Type</label><select id="assetCategory" name="category">${categories.map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select></div><button class="button primary" type="submit">Add</button></form>
    <div class="library-grid">${categories.map(([category, label]) => `<section class="panel name-list"><div class="panel-title"><h3>${label}</h3><span>${assetsFor(category).length}</span></div>${assetsFor(category).length ? assetsFor(category).map((asset) => `<div class="name-row"><span>${escapeHtml(asset.name)}</span><button type="button" data-delete-asset="${asset.id}" aria-label="Delete ${escapeHtml(asset.name)}">×</button></div>`).join("") : `<p class="empty-inline">Nothing added yet.</p>`}</section>`).join("")}</div>
  </section>`;
}

function renderPrompt() {
  const prompt = generatePrompt();
  return `<section class="screen"><div class="hero"><span class="eyebrow">READY</span><h2>Your CafeMeme prompt.</h2><p>Attach current colleague reference images in ChatGPT before generating whenever likeness matters.</p></div><div class="prompt-layout"><div class="panel grid"><button class="button primary full" id="openChatGpt" type="button">Copy & open ChatGPT</button><button class="button full" id="copyPrompt" type="button">Copy prompt</button><button class="button ghost full" id="goBuilder" type="button">Back to builder</button><p class="empty-inline">${prompt.length.toLocaleString()} characters · ${selectedAssets().length} assets</p></div><pre class="prompt-preview">${escapeHtml(prompt)}</pre></div></section>`;
}

function renderSettings() {
  return `<section class="screen"><div class="hero"><span class="eyebrow">SETTINGS</span><h2>Local, private, installable.</h2><p>Your asset names and current draft stay on this device.</p></div><div class="panel grid settings-card"><button class="button primary full" id="exportLibrary" type="button">Export library JSON</button><label class="button full" for="importLibrary">Import library JSON</label><input hidden id="importLibrary" type="file" accept="application/json,.json"><p class="empty-inline">Use your browser menu to install the app. Build v5 · ${escapeHtml(BUILD_INFO.commit || "local")}</p></div></section>`;
}

function render() {
  document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.route === state.route));
  document.getElementById("app").innerHTML = ({ builder: renderBuilder, library: renderLibrary, prompt: renderPrompt, settings: renderSettings })[state.route]();
  bindScreenEvents();
}

function bindScreenEvents() {
  if (state.route === "builder") {
    document.getElementById("draftForm").addEventListener("input", async (event) => {
      if (!event.target.name) return;
      state.draft[event.target.name] = event.target.value;
      await saveDraft();
    });
    document.querySelectorAll("[data-select-asset]").forEach((input) => input.addEventListener("change", async () => {
      const selected = new Set(state.draft.selectedAssetIds);
      input.checked ? selected.add(input.value) : selected.delete(input.value);
      state.draft.selectedAssetIds = [...selected];
      await saveDraft();
      render();
    }));
    document.getElementById("copyFromBuilder").addEventListener("click", copyPrompt);
    document.getElementById("openFromBuilder").addEventListener("click", openChatGptWithPrompt);
  }
  if (state.route === "library") {
    document.getElementById("assetForm").addEventListener("submit", addAsset);
    document.querySelectorAll("[data-delete-asset]").forEach((button) => button.addEventListener("click", async () => {
      const id = button.dataset.deleteAsset;
      await removeAsset(id);
      state.draft.selectedAssetIds = state.draft.selectedAssetIds.filter((value) => value !== id);
      await saveDraft();
      await refreshAssets();
    }));
  }
  if (state.route === "prompt") {
    document.getElementById("openChatGpt").addEventListener("click", openChatGptWithPrompt);
    document.getElementById("copyPrompt").addEventListener("click", copyPrompt);
    document.getElementById("goBuilder").addEventListener("click", () => setRoute("builder"));
  }
  if (state.route === "settings") {
    document.getElementById("exportLibrary").addEventListener("click", exportLibrary);
    document.getElementById("importLibrary").addEventListener("change", importLibrary);
  }
}

async function refreshAssets() {
  state.assets = (await getAll(ASSET_STORE)).filter((asset) => categories.some(([value]) => value === asset.category));
  render();
}

async function addAsset(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const name = form.get("name").trim();
  const category = form.get("category");
  if (state.assets.some((asset) => asset.category === category && asset.name.toLowerCase() === name.toLowerCase())) return showToast("That name is already listed");
  await put(ASSET_STORE, { id: makeId(), name, category });
  await refreshAssets();
  showToast("Asset added");
}

function listNames(category) {
  const names = selectedAssets().filter((asset) => asset.category === category).map((asset) => asset.name);
  return names.length ? names.join(", ") : "None";
}

function generatePrompt() {
  return `Create an M&S Cafe Cartoon meme using the CafeMeme rules.\n\nINCLUDED ASSETS\nColleagues: ${listNames("colleague")}\nSets: ${listNames("set")}\nProps: ${listNames("prop")}\nEquipment: ${listNames("equipment")}\n\nMEME IDEA\n${state.draft.jokeIdea || "[Add the joke idea]"}\n\nDIALOGUE\n${state.draft.dialogue || "Use no dialogue unless it improves the joke."}\n\nCAPTION\n${state.draft.caption || "Create a short caption only if useful."}\n\nFORMAT: ${state.draft.format}\nASPECT RATIO: ${state.draft.aspectRatio}\nTONE: ${state.draft.tone}\nEXTRA DIRECTION: ${state.draft.extraInstructions || "None"}\n\nREFERENCE IMAGE RULES\n- Use only the colleague reference images attached to this ChatGPT message.\n- Match each named colleague to the correct attached image; ask if the mapping is ambiguous.\n- Preserve recognisable facial likeness, hairstyle, age, body shape and distinguishing features.\n- Treat the attached images as the source of truth for uniform details, colours, logos and fit. Do not invent or substitute uniform elements.\n- If a selected colleague has no usable reference image, ask for one before generating when likeness is important.\n\nOUTPUT RULES\n- Produce a polished, expressive cartoon with clear visual storytelling and good-natured workplace humour.\n- Keep all text large, correctly spelled and readable on a phone.\n- Keep the cafe layout, equipment and object scale believable.\n- Avoid cruelty, personal attacks, offensive stereotypes, politics and religion.\n- Make the joke understandable within three seconds.\n- Before generating, silently check cast accuracy, likeness, uniform correctness, spelling, composition and readability.`;
}

async function copyPrompt() {
  const prompt = generatePrompt();
  await saveDraft();
  try { await navigator.clipboard.writeText(prompt); }
  catch {
    const textarea = document.createElement("textarea");
    textarea.value = prompt;
    document.body.append(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
  showToast("Prompt copied");
}

async function openChatGptWithPrompt() {
  const chatWindow = window.open("about:blank", "_blank");
  await copyPrompt();
  const url = "https://chatgpt.com/gpts";
  if (chatWindow) { chatWindow.opener = null; chatWindow.location.href = url; }
  else window.location.href = url;
  showToast("Prompt copied — open CafeMeme and paste");
}

async function exportLibrary() {
  const payload = { app: "CafeMeme", version: 2, assets: state.assets.map(({ id, name, category }) => ({ id, name, category })) };
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `cafememe-library-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

async function importLibrary(event) {
  try {
    const file = event.target.files?.[0];
    if (!file) return;
    const payload = JSON.parse(await file.text());
    for (const asset of payload.assets || payload) {
      if (asset.name && categories.some(([value]) => value === asset.category)) await put(ASSET_STORE, { id: asset.id || makeId(), name: asset.name.trim(), category: asset.category });
    }
    await refreshAssets();
    showToast("Library imported");
  } catch { showToast("Import failed"); }
  event.target.value = "";
}

function setRoute(route) {
  state.route = route;
  render();
  document.getElementById("app").focus();
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => toast.classList.remove("show"), 2200);
}

async function updateBuildStatus() {
  const status = document.getElementById("buildStatus");
  status.textContent = `Build v5 · ${BUILD_INFO.commit || "local"}`;
  if (!navigator.onLine) return;
  try {
    const response = await fetch("https://api.github.com/repos/sourmilkman/CafeMemeGen/commits/main");
    const data = response.ok ? await response.json() : null;
    if (data?.sha) status.textContent = `Build v5 · ${data.sha.slice(0, 7)}`;
  } catch {}
}

async function init() {
  await openDb();
  await ensureLibrary();
  await loadDraft();
  state.draft.selectedAssetIds = state.draft.selectedAssetIds.filter((id) => state.assets.some((asset) => asset.id === id));
  document.querySelectorAll(".nav-item").forEach((button) => button.addEventListener("click", () => setRoute(button.dataset.route)));
  render();
  updateBuildStatus();
  if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js"));
}

init().catch((error) => {
  console.error(error);
  document.getElementById("app").innerHTML = `<div class="panel">CafeMeme could not start. Refresh and try again.</div>`;
});
