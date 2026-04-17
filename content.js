/**
 * content.js — Script injecté sur toutes les pages redgifs.com
 *
 * v1.2 : les boutons sont intégrés dans la barre latérale native du lecteur
 * RedGifs (.GifPreview-SideBarWrap > ul.sideBar), au-dessus des boutons like/share/etc.
 * On imite la structure <li class="sideBarItem"> native pour hériter du style.
 *
 * Points techniques :
 *   - Chaque .GifPreview possède son propre <ul.sideBar>
 *   - On injecte 2 <li> pour HD/SD en première position du <ul>
 *   - React peut re-render le <ul> et virer nos <li> → MutationObserver
 *     détecte et ré-injecte. On marque le <ul> avec un flag pour éviter les
 *     doublons pendant le re-render asynchrone.
 */

// ---------------------------------------------------------------------------
// État par carte : WeakMap pour garbage collection auto.
// ---------------------------------------------------------------------------
const cardState = new WeakMap();  // .GifPreview → { id, urls, liHD, liSD, status, error }
const urlCache = new Map();        // id → { hd, sd }

// ---------------------------------------------------------------------------
// Sélecteurs centralisés : un seul endroit à modifier si RedGifs change son DOM.
// ---------------------------------------------------------------------------
const SEL = {
  preview: ".GifPreview",
  activePreview: ".GifPreview.GifPreview_isActive",
  idAttr: "data-feed-item-id",
  sideBar: ".GifPreview-SideBarWrap ul.sideBar",
  sideBarItemClass: "sideBarItem"
};

// Attribut flag qu'on pose sur notre propre <li> pour le reconnaître
// et ne pas le traiter comme un sideBarItem natif.
const OUR_MARK = "data-rgdl-btn";

// ---------------------------------------------------------------------------
// SVG de l'icône "download" (flèche descendante + barre), même style que RedGifs :
// stroke blanc #EFEEF0, stroke-width 2, pas de fill, 24x24.
// ---------------------------------------------------------------------------
const DOWNLOAD_SVG = `
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M12 4v12m0 0l-5-5m5 5l5-5M4 20h16"
        stroke="#EFEEF0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`.trim();

/**
 * Construit un <li class="sideBarItem"> contenant notre bouton.
 * On reprend les classes natives du site pour hériter du style.
 *
 * @param {"hd"|"sd"} quality
 * @param {HTMLElement} gifPreview - la carte parente
 */
function buildSideBarItem(quality, gifPreview) {
  const li = document.createElement("li");
  li.className = "sideBarItem";
  li.setAttribute(OUR_MARK, quality);

  const btn = document.createElement("button");
  // On utilise une classe similaire aux natives (LikeButton, SoundButton…)
  // + notre classe rgdl- pour les styles spécifiques (états loading/error).
  btn.className = `DownloadRgdlButton rgdl-btn rgdl-btn-${quality}`;
  btn.type = "button";
  btn.setAttribute("aria-label", `Download ${quality.toUpperCase()}`);
  btn.title = quality === "hd"
    ? "Télécharger en HD (Alt+H)"
    : "Télécharger en SD (Alt+S)";
  btn.disabled = true;

  btn.innerHTML = `${DOWNLOAD_SVG}<span class="label">${quality.toUpperCase()}</span>`;

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    downloadCard(gifPreview, quality);
  });

  li.appendChild(btn);
  return li;
}

/**
 * Injecte (ou ré-injecte) nos 2 <li> dans la sideBar d'une carte.
 * Retourne true si l'injection a été faite, false si déjà présente ou sideBar absente.
 */
function injectIntoSideBar(gifPreview, state) {
  const sideBar = gifPreview.querySelector(SEL.sideBar);
  if (!sideBar) return false;

  // Vérifier si nos <li> sont déjà dans la sideBar courante
  const existingHD = sideBar.querySelector(`li[${OUR_MARK}="hd"]`);
  const existingSD = sideBar.querySelector(`li[${OUR_MARK}="sd"]`);
  if (existingHD && existingSD) {
    // Déjà là → on met juste à jour les références
    state.liHD = existingHD;
    state.liSD = existingSD;
    refreshButtons(gifPreview);
    return false;
  }

  // Sinon, on (re)crée et (ré)injecte en première position
  if (existingHD) existingHD.remove();
  if (existingSD) existingSD.remove();

  state.liHD = buildSideBarItem("hd", gifPreview);
  state.liSD = buildSideBarItem("sd", gifPreview);

  // Insertion en début de liste (au-dessus des autres boutons)
  sideBar.insertBefore(state.liSD, sideBar.firstChild);
  sideBar.insertBefore(state.liHD, sideBar.firstChild);

  refreshButtons(gifPreview);
  return true;
}

/**
 * Met à jour l'aspect visuel des boutons selon l'état (loading, ready, error).
 */
function refreshButtons(gifPreview) {
  const state = cardState.get(gifPreview);
  if (!state || !state.liHD || !state.liSD) return;

  const btnHD = state.liHD.querySelector("button");
  const btnSD = state.liSD.querySelector("button");
  if (!btnHD || !btnSD) return;

  const labelHD = btnHD.querySelector(".label");
  const labelSD = btnSD.querySelector(".label");

  // Reset classes d'état
  btnHD.classList.remove("rgdl-loading", "rgdl-error");
  btnSD.classList.remove("rgdl-loading", "rgdl-error");

  if (state.status === "ready" && state.urls) {
    btnHD.disabled = !state.urls.hd;
    btnSD.disabled = !state.urls.sd;
    if (labelHD) labelHD.textContent = "HD";
    if (labelSD) labelSD.textContent = "SD";
  } else if (state.status === "loading") {
    btnHD.disabled = true;
    btnSD.disabled = true;
    btnHD.classList.add("rgdl-loading");
    btnSD.classList.add("rgdl-loading");
    if (labelHD) labelHD.textContent = "…";
    if (labelSD) labelSD.textContent = "…";
  } else if (state.status === "error") {
    btnHD.disabled = true;
    btnSD.disabled = true;
    btnHD.classList.add("rgdl-error");
    btnSD.classList.add("rgdl-error");
    btnHD.title = "Erreur : " + (state.error || "inconnue");
    btnSD.title = btnHD.title;
    if (labelHD) labelHD.textContent = "⚠";
    if (labelSD) labelSD.textContent = "⚠";
  } else {
    // idle
    btnHD.disabled = true;
    btnSD.disabled = true;
    if (labelHD) labelHD.textContent = "HD";
    if (labelSD) labelSD.textContent = "SD";
  }
}

// ---------------------------------------------------------------------------
// Chargement des URLs via l'API (relayée par background.js).
// ---------------------------------------------------------------------------
async function loadUrlsForCard(gifPreview) {
  const state = cardState.get(gifPreview);
  if (!state) return;
  if (state.status === "loading" || state.status === "ready") return;

  if (urlCache.has(state.id)) {
    state.urls = urlCache.get(state.id);
    state.status = "ready";
    refreshButtons(gifPreview);
    return;
  }

  state.status = "loading";
  refreshButtons(gifPreview);

  try {
    const response = await browser.runtime.sendMessage({
      type: "GET_GIF_DATA",
      id: state.id
    });
    if (!response || !response.ok) {
      throw new Error((response && response.error) || "API error");
    }
    const urls = extractUrls(response.data);
    urlCache.set(state.id, urls);
    state.urls = urls;
    state.status = "ready";
  } catch (err) {
    console.error(`[RedGifs DL] Failed to load ${state.id}:`, err);
    state.status = "error";
    state.error = err.message;
  }
  refreshButtons(gifPreview);
}

function extractUrls(apiData) {
  const urls = (apiData && apiData.gif && apiData.gif.urls) || {};
  const hd = urls.hd || null;
  const sd = urls.sd || null;
  return { hd: hd || sd, sd: sd || hd };
}

// ---------------------------------------------------------------------------
// Téléchargement.
// ---------------------------------------------------------------------------
async function downloadCard(gifPreview, quality) {
  const state = cardState.get(gifPreview);
  if (!state) return;

  if (state.status !== "ready") {
    await loadUrlsForCard(gifPreview);
  }

  const fresh = cardState.get(gifPreview);
  if (!fresh || fresh.status !== "ready" || !fresh.urls) {
    showToast(`Impossible de télécharger : ${fresh && fresh.error ? fresh.error : "données indisponibles"}`, true);
    return;
  }

  const url = fresh.urls[quality];
  if (!url) {
    showToast(`Qualité ${quality.toUpperCase()} non disponible`, true);
    return;
  }

  const li = quality === "hd" ? fresh.liHD : fresh.liSD;
  const btn = li && li.querySelector("button");
  if (btn) btn.classList.add("rgdl-pulsing");

  try {
    const response = await browser.runtime.sendMessage({
      type: "DOWNLOAD",
      url,
      id: fresh.id,
      quality
    });
    if (response && response.ok) {
      showToast(`⬇ ${fresh.id}.mp4`);
    } else {
      const err = (response && response.error) || "erreur inconnue";
      showToast(`Échec : ${err}`, true);
    }
  } catch (err) {
    showToast(`Erreur : ${err.message}`, true);
  } finally {
    if (btn) btn.classList.remove("rgdl-pulsing");
  }
}

// ---------------------------------------------------------------------------
// Toast : feedback en haut à droite.
// ---------------------------------------------------------------------------
function showToast(message, isError = false) {
  const toast = document.createElement("div");
  toast.className = "rgdl-toast" + (isError ? " rgdl-toast-error" : "");
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

// ---------------------------------------------------------------------------
// Enregistrement / désenregistrement d'une carte.
// ---------------------------------------------------------------------------
function registerCard(gifPreview) {
  if (cardState.has(gifPreview)) {
    // Déjà connue : vérifier juste que nos <li> sont toujours là
    const state = cardState.get(gifPreview);
    const sideBar = gifPreview.querySelector(SEL.sideBar);
    if (sideBar && (!sideBar.contains(state.liHD) || !sideBar.contains(state.liSD))) {
      // React a viré nos boutons : on ré-injecte
      injectIntoSideBar(gifPreview, state);
    }
    return;
  }

  const id = gifPreview.getAttribute(SEL.idAttr);
  if (!id) return;

  const state = {
    id,
    urls: null,
    liHD: null,
    liSD: null,
    status: "idle",
    error: null
  };
  cardState.set(gifPreview, state);

  // Essai d'injection immédiat. Si la sideBar n'est pas encore là (React
  // pas encore monté ce composant), le MutationObserver s'en occupera.
  injectIntoSideBar(gifPreview, state);

  // Observer pour le chargement lazy des URLs
  intersectionObserver.observe(gifPreview);
}

function unregisterCard(gifPreview) {
  const state = cardState.get(gifPreview);
  if (!state) return;
  intersectionObserver.unobserve(gifPreview);
  if (state.liHD && state.liHD.parentNode) state.liHD.remove();
  if (state.liSD && state.liSD.parentNode) state.liSD.remove();
  cardState.delete(gifPreview);
}

// ---------------------------------------------------------------------------
// IntersectionObserver : charge les URLs quand la carte approche du viewport.
// ---------------------------------------------------------------------------
const intersectionObserver = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (entry.isIntersecting) {
      loadUrlsForCard(entry.target);
      intersectionObserver.unobserve(entry.target);
    }
  }
}, {
  rootMargin: "200px",
  threshold: 0.01
});

// ---------------------------------------------------------------------------
// MutationObserver sur le body :
//   - Détecte les nouvelles .GifPreview (registerCard)
//   - Détecte les .GifPreview retirées (unregisterCard)
//   - Détecte les re-renders React qui virent nos <li> → ré-injecte
// ---------------------------------------------------------------------------
function scanForNewCards(root) {
  if (!root || root.nodeType !== Node.ELEMENT_NODE) return;
  if (root.matches && root.matches(SEL.preview)) {
    registerCard(root);
  }
  if (root.querySelectorAll) {
    for (const el of root.querySelectorAll(SEL.preview)) registerCard(el);
  }
}

function scanForRemovedCards(root) {
  if (!root || root.nodeType !== Node.ELEMENT_NODE) return;
  if (root.matches && root.matches(SEL.preview)) {
    unregisterCard(root);
  }
  if (root.querySelectorAll) {
    for (const el of root.querySelectorAll(SEL.preview)) unregisterCard(el);
  }
}

/**
 * Pour chaque .GifPreview connue, vérifie que nos <li> sont toujours dans
 * la sideBar. Si React les a recréés, on ré-injecte.
 * Appelé périodiquement via le MutationObserver.
 */
function checkAllInjections() {
  for (const card of document.querySelectorAll(SEL.preview)) {
    const state = cardState.get(card);
    if (!state) continue;
    const sideBar = card.querySelector(SEL.sideBar);
    if (!sideBar) continue;
    // Nos <li> ont-ils disparu ?
    const hasHD = sideBar.querySelector(`li[${OUR_MARK}="hd"]`);
    const hasSD = sideBar.querySelector(`li[${OUR_MARK}="sd"]`);
    if (!hasHD || !hasSD) {
      injectIntoSideBar(card, state);
    }
  }
}

const mutationObserver = new MutationObserver((mutations) => {
  let needsInjectionCheck = false;

  for (const m of mutations) {
    for (const node of m.addedNodes) {
      scanForNewCards(node);
      // Si l'ajout concerne une sideBar (ou un de ses parents), on re-vérifie
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.matches && node.matches("ul.sideBar")) needsInjectionCheck = true;
        else if (node.querySelector && node.querySelector("ul.sideBar")) needsInjectionCheck = true;
      }
    }
    for (const node of m.removedNodes) {
      scanForRemovedCards(node);
    }
  }

  if (needsInjectionCheck) {
    checkAllInjections();
  }
});

// ---------------------------------------------------------------------------
// Raccourcis clavier : cible la vidéo active.
// ---------------------------------------------------------------------------
function findActiveCard() {
  const active = document.querySelector(SEL.activePreview);
  if (active) return active;

  const viewportH = window.innerHeight;
  let best = null;
  let bestScore = 0;
  for (const card of document.querySelectorAll(SEL.preview)) {
    const rect = card.getBoundingClientRect();
    const visibleTop = Math.max(0, rect.top);
    const visibleBottom = Math.min(viewportH, rect.bottom);
    const visibleHeight = Math.max(0, visibleBottom - visibleTop);
    if (visibleHeight > bestScore) {
      bestScore = visibleHeight;
      best = card;
    }
  }
  return best;
}

browser.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.type !== "SHORTCUT_DOWNLOAD") return;
  const card = findActiveCard();
  if (!card) {
    showToast("Aucune vidéo active détectée", true);
    return;
  }
  downloadCard(card, msg.quality);
});

// ---------------------------------------------------------------------------
// Démarrage.
// ---------------------------------------------------------------------------
function init() {
  scanForNewCards(document.body);
  mutationObserver.observe(document.body, { childList: true, subtree: true });
  console.log("[RedGifs DL] v1.2 ready — observing",
              document.querySelectorAll(SEL.preview).length, "cards initially");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
