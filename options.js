/**
 * options.js — Page d'options (accessible via about:addons).
 * Gère uniquement les réglages de dossier (les raccourcis sont dans le popup).
 * Logique identique à popup.js pour la partie dossier.
 */

const previewPath = document.getElementById("preview-path");
const useSubfolderCb = document.getElementById("use-subfolder");
const useSortCb = document.getElementById("use-sort");
const sortBySelect = document.getElementById("sort-by");
const versionLabel = document.getElementById("version-label");
const statusEl = document.getElementById("status");

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

function isoWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

function escapeHTML(s) {
  return s.replace(/[&<>"']/g, ch => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[ch]));
}

function buildPreview() {
  const parts = [];
  if (useSubfolderCb.checked) parts.push("RedGifs");
  if (useSortCb.checked) parts.push(buildDateSegment(sortBySelect.value));
  const folder = parts.length ? parts.join("/") + "/" : "";
  previewPath.innerHTML =
    `Downloads/<span style="color:#9cd3ff">${escapeHTML(folder)}</span>` +
    `<span style="color:#9a9aa0;font-style:italic">exemple.mp4</span>`;
}

async function load() {
  try {
    const manifest = browser.runtime.getManifest();
    if (versionLabel) versionLabel.textContent = `v${manifest.version}`;
  } catch (e) { /* ignore */ }

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

async function save() {
  await browser.storage.local.set({
    useSubfolder: useSubfolderCb.checked,
    useSort: useSortCb.checked,
    sortBy: sortBySelect.value
  });
  buildPreview();
}

let statusTimeout = null;
function showStatus(text, kind = "ok") {
  clearTimeout(statusTimeout);
  statusEl.textContent = text;
  statusEl.className = `status visible ${kind}`;
  statusTimeout = setTimeout(() => {
    statusEl.className = "status";
    statusEl.textContent = "";
  }, 2000);
}

useSubfolderCb.addEventListener("change", save);
useSortCb.addEventListener("change", () => {
  sortBySelect.disabled = !useSortCb.checked;
  save();
});
sortBySelect.addEventListener("change", save);

load();
