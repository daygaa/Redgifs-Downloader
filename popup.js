/**
 * popup.js — Logique du popup v1.4.
 *
 * Nouveaux réglages stockés :
 *   - useSubfolder (bool) : créer un sous-dossier /RedGifs/
 *   - useSort (bool) : activer le tri temporel
 *   - sortBy ("month" | "week" | "day") : granularité du tri
 *
 * Le chemin final est calculé à la volée à partir de ces flags, côté
 * background au moment du téléchargement. Le popup et les options
 * affichent juste un aperçu.
 */

// ============================================================================
// Éléments DOM
// ============================================================================
const previewPath = document.getElementById("preview-path");
const useSubfolderCb = document.getElementById("use-subfolder");
const useSortCb = document.getElementById("use-sort");
const sortBySelect = document.getElementById("sort-by");
const versionLabel = document.getElementById("version-label");

const shortcutButtons = document.querySelectorAll(".shortcut-display");
const clearButtons = document.querySelectorAll(".shortcut-clear");
const shortcutHint = document.getElementById("shortcut-hint");
const openChromeShortcutsBtn = document.getElementById("open-chrome-shortcuts");

const statusEl = document.getElementById("status");

// ============================================================================
// Détection navigateur
// ============================================================================
// Chrome n'expose pas browser.commands.update() ni .reset() : les raccourcis
// ne peuvent être modifiés/supprimés que par l'utilisateur via
// chrome://extensions/shortcuts. On détecte le navigateur pour adapter l'UI.
//
// Méthode : sur Firefox, browser.runtime.getBrowserInfo() existe ; pas sur Chrome.
// On check aussi la présence de browser.commands.update spécifiquement.
const IS_CHROME = typeof browser.commands.update !== "function";

// ============================================================================
// 1. CHEMIN DE TÉLÉCHARGEMENT — calcul & aperçu
// ============================================================================

/**
 * Calcule le segment daté en fonction du mode choisi.
 * Cohérent avec la fonction équivalente dans background.js.
 *
 * @param {"month"|"week"|"day"} mode
 * @returns {string} ex: "2026-04" / "2026-W16" / "2026-04-17"
 */
function buildDateSegment(mode) {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  if (mode === "month") return `${yyyy}-${mm}`;
  if (mode === "day") return `${yyyy}-${mm}-${dd}`;
  if (mode === "week") return `${yyyy}-W${String(isoWeekNumber(now)).padStart(2, "0")}`;
  return "";
}

/**
 * Calcul du numéro de semaine ISO 8601 (la semaine 1 est celle qui contient
 * le premier jeudi de l'année). Algorithme standard.
 */
function isoWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

/**
 * Construit le chemin d'aperçu à partir des checkboxes.
 * Exemple : "RedGifs/2026-04/exemple.mp4"
 */
function buildPreview() {
  const parts = [];
  if (useSubfolderCb.checked) parts.push("RedGifs");
  if (useSortCb.checked) parts.push(buildDateSegment(sortBySelect.value));
  const folder = parts.length ? parts.join("/") + "/" : "";

  // Construction DOM-safe (pas d'innerHTML) :
  // "Downloads/" + <span.folder>folder</span> + <span.example>exemple.mp4</span>
  previewPath.textContent = "";
  previewPath.appendChild(document.createTextNode("Downloads/"));

  const folderSpan = document.createElement("span");
  folderSpan.className = "preview-folder";
  folderSpan.textContent = folder;
  previewPath.appendChild(folderSpan);

  const exampleSpan = document.createElement("span");
  exampleSpan.className = "preview-example";
  exampleSpan.textContent = "exemple.mp4";
  previewPath.appendChild(exampleSpan);
}

async function loadFolderSettings() {
  const { useSubfolder = false, useSort = false, sortBy = "month" } =
    await browser.storage.local.get({
      useSubfolder: false,
      useSort: false,
      sortBy: "month"
    });

  useSubfolderCb.checked = !!useSubfolder;
  useSortCb.checked = !!useSort;
  sortBySelect.value = sortBy;
  sortBySelect.disabled = !useSort;
  buildPreview();
}

async function saveFolderSettings() {
  await browser.storage.local.set({
    useSubfolder: useSubfolderCb.checked,
    useSort: useSortCb.checked,
    sortBy: sortBySelect.value
  });
  buildPreview();
}

// Listeners
useSubfolderCb.addEventListener("change", saveFolderSettings);
useSortCb.addEventListener("change", () => {
  sortBySelect.disabled = !useSortCb.checked;
  saveFolderSettings();
});
sortBySelect.addEventListener("change", saveFolderSettings);

// ============================================================================
// 2. RACCOURCIS CLAVIER
// ============================================================================

let capturingBtn = null;

const BLOCKED_KEYS = new Set([
  "F1","F2","F3","F4","F5","F6","F7","F8","F9","F10","F11","F12",
  "Tab","Escape","CapsLock","NumLock","ScrollLock",
  "PageUp","PageDown","Home","End","Insert","Delete","Backspace",
  "Enter","Space"," ",
  "PrintScreen","Pause","ContextMenu","Meta","OS"
]);

/**
 * Normalise un KeyboardEvent en combo "Ctrl+Shift+H" ou retourne un état intermédiaire.
 */
function eventToCombo(e) {
  const mods = [];
  if (e.ctrlKey) mods.push("Ctrl");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");

  const raw = e.key;

  if (raw === "Control" || raw === "Alt" || raw === "Shift" || raw === "Meta") {
    return {
      ok: false,
      partial: mods.length ? mods.join(" + ") + " + …" : "…",
      error: null
    };
  }

  if (BLOCKED_KEYS.has(raw)) {
    return { ok: false, error: `Touche "${raw}" non autorisée` };
  }

  let finalKey = null;
  if (/^[a-zA-Z]$/.test(raw)) finalKey = raw.toUpperCase();
  else if (/^[0-9]$/.test(raw)) finalKey = raw;
  else return { ok: false, error: `Touche "${raw}" non supportée` };

  if (!e.ctrlKey && !e.altKey) {
    return { ok: false, error: "Il faut au moins Ctrl ou Alt" };
  }

  const combo = [...mods, finalKey].join("+");
  return { ok: true, combo };
}

function renderShortcut(btn, shortcut) {
  const span = btn.querySelector(".sc-keys");
  const clearBtn = document.querySelector(`.shortcut-clear[data-command="${btn.dataset.command}"]`);

  if (!shortcut) {
    span.textContent = "— (désactivé)";
    // Clear button désactivé si déjà vide
    if (clearBtn) clearBtn.disabled = true;
  } else {
    // Construction DOM-safe des <kbd> : "Ctrl+Shift+H" → <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>H</kbd>
    span.textContent = "";
    const parts = shortcut.split("+");
    parts.forEach((part, i) => {
      if (i > 0) span.appendChild(document.createTextNode(" + "));
      const kbd = document.createElement("kbd");
      kbd.textContent = part;
      span.appendChild(kbd);
    });
    // Sur Chrome, on garde le clear toujours désactivé (API non supportée).
    if (clearBtn) clearBtn.disabled = IS_CHROME;
  }
}

async function loadShortcuts() {
  try {
    const commands = await browser.commands.getAll();
    for (const btn of shortcutButtons) {
      const cmd = commands.find(c => c.name === btn.dataset.command);
      renderShortcut(btn, cmd ? cmd.shortcut : "");
    }
  } catch (err) {
    console.error("loadShortcuts:", err);
  }
}

function startCapture(btn) {
  if (capturingBtn && capturingBtn !== btn) stopCapture(capturingBtn);
  capturingBtn = btn;
  btn.classList.add("capturing");
  btn.classList.remove("invalid");
  btn.querySelector(".sc-keys").textContent = "Appuie sur la combinaison…";
  shortcutHint.textContent = "Appuie sur une combinaison (Ctrl/Alt + touche).";

  document.addEventListener("keydown", onCaptureKeydown, true);
  document.addEventListener("click", onCaptureClickOutside, true);
}

function stopCapture(btn) {
  if (btn) btn.classList.remove("capturing", "invalid");
  capturingBtn = null;
  document.removeEventListener("keydown", onCaptureKeydown, true);
  document.removeEventListener("click", onCaptureClickOutside, true);
  shortcutHint.textContent = "Clique sur un raccourci pour le modifier, puis appuie sur la nouvelle combinaison.";
  loadShortcuts();
}

async function onCaptureKeydown(e) {
  if (!capturingBtn) return;

  if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    stopCapture(capturingBtn);
    return;
  }

  e.preventDefault();
  e.stopPropagation();

  const result = eventToCombo(e);

  if (!result.ok) {
    const span = capturingBtn.querySelector(".sc-keys");
    if (result.partial) {
      span.textContent = result.partial;
      capturingBtn.classList.remove("invalid");
    } else if (result.error) {
      capturingBtn.classList.add("invalid");
      shortcutHint.textContent = `✗ ${result.error}`;
    }
    return;
  }

  const commandName = capturingBtn.dataset.command;
  const btn = capturingBtn;

  try {
    const commands = await browser.commands.getAll();
    const conflict = commands.find(c => c.name !== commandName && c.shortcut === result.combo);
    if (conflict) {
      btn.classList.add("invalid");
      shortcutHint.textContent = `✗ ${result.combo} est déjà utilisé par l'autre raccourci`;
      return;
    }

    await browser.commands.update({ name: commandName, shortcut: result.combo });
    stopCapture(btn);
    renderShortcut(btn, result.combo);
  } catch (err) {
    btn.classList.add("invalid");
    shortcutHint.textContent = `✗ Erreur : ${err.message}`;
  }
}

function onCaptureClickOutside(e) {
  if (!capturingBtn) return;
  if (capturingBtn.contains(e.target)) return;
  // Le bouton clear du raccourci en cours ne doit pas annuler la capture non plus
  const clearBtn = document.querySelector(`.shortcut-clear[data-command="${capturingBtn.dataset.command}"]`);
  if (clearBtn && clearBtn.contains(e.target)) return;
  stopCapture(capturingBtn);
}

// Listeners sur boutons d'affichage — uniquement sur Firefox
// (sur Chrome, les raccourcis ne se modifient que via chrome://extensions/shortcuts)
if (!IS_CHROME) {
  shortcutButtons.forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (btn.classList.contains("capturing")) stopCapture(btn);
      else startCapture(btn);
    });
  });
}

/**
 * Suppression d'un raccourci : on appelle browser.commands.update avec
 * shortcut = "" ce qui désactive complètement la commande.
 * Inopérant sur Chrome (API absente).
 */
if (!IS_CHROME) {
  clearButtons.forEach(clearBtn => {
    clearBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (clearBtn.disabled) return;

      const commandName = clearBtn.dataset.command;
      // Si une capture est en cours sur ce raccourci, on l'annule d'abord
      const displayBtn = document.querySelector(`.shortcut-display[data-command="${commandName}"]`);
      if (displayBtn && displayBtn.classList.contains("capturing")) {
        stopCapture(displayBtn);
      }

      try {
        await browser.commands.update({ name: commandName, shortcut: "" });
        await loadShortcuts();
      } catch (err) {
        showStatus(`✗ ${err.message}`, "err");
      }
    });
  });
}

// ============================================================================
// 3. STATUS
// ============================================================================
let statusTimeout = null;
function showStatus(text, kind = "ok") {
  clearTimeout(statusTimeout);
  statusEl.textContent = text;
  statusEl.className = `status visible ${kind}`;
  statusTimeout = setTimeout(() => {
    statusEl.className = "status";
    statusEl.textContent = "";
  }, 2500);
}

// ============================================================================
// 4. ADAPTATION CHROME
// ============================================================================
/**
 * Sur Chrome, les raccourcis ne peuvent pas être modifiés par l'extension.
 * On adapte l'UI : display des raccourcis en lecture seule, bouton clear grisé,
 * et on affiche un bouton qui redirige vers chrome://extensions/shortcuts.
 */
function applyChromeAdjustments() {
  if (!IS_CHROME) return;

  // 1. Rendre les boutons d'affichage non-cliquables (plus de capture)
  shortcutButtons.forEach(btn => {
    btn.style.cursor = "default";
    btn.title = "Raccourci en lecture seule sur Chrome. Utilise le bouton ci-dessous pour modifier.";
    // Empêche le hover d'indiquer "clickable"
    btn.classList.add("readonly");
  });

  // 2. Griser les boutons clear avec tooltip explicatif
  clearButtons.forEach(clearBtn => {
    clearBtn.disabled = true;
    clearBtn.title = "Impossible de supprimer un raccourci depuis le popup sur Chrome. Utilise le bouton ci-dessous.";
  });

  // 3. Adapter le hint
  shortcutHint.textContent = "Les raccourcis ne peuvent être modifiés depuis les paramètres Chrome.";

  // 4. Afficher et activer le bouton "Modifier les raccourcis"
  openChromeShortcutsBtn.style.display = "block";
  openChromeShortcutsBtn.addEventListener("click", async () => {
    // chrome:// URLs ne peuvent pas être ouvertes via window.open ou window.location
    // depuis un popup — il faut passer par l'API tabs.
    try {
      await browser.tabs.create({ url: "chrome://extensions/shortcuts" });
      window.close();
    } catch (err) {
      showStatus(`✗ Impossible d'ouvrir la page : ${err.message}`, "err");
    }
  });
}

// ============================================================================
// Init
// ============================================================================
async function init() {
  try {
    const manifest = browser.runtime.getManifest();
    versionLabel.textContent = `v${manifest.version}`;
  } catch (e) { /* ignore */ }

  await loadFolderSettings();
  await loadShortcuts();
  applyChromeAdjustments();
}

init();
