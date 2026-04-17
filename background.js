/**
 * background.js — Script d'arrière-plan de l'extension.
 *
 * Rôles :
 *   1. Faire les appels à api.redgifs.com pour le compte du content script
 *      (évite les soucis CORS et centralise la logique réseau).
 *   2. Déclencher les téléchargements via l'API browser.downloads.
 *   3. Écouter les raccourcis clavier et demander au content script de
 *      l'onglet actif de lancer le téléchargement.
 *
 * Le content script (content.js) NE fait PAS les fetch lui-même : il envoie
 * des messages à ce background via browser.runtime.sendMessage.
 *
 * COMPATIBILITÉ CHROME / FIREFOX :
 *   - Sur Firefox (event page), `browser.*` est natif → on ne charge rien de plus
 *   - Sur Chrome (service worker), `browser` n'existe pas nativement → on charge
 *     le polyfill Mozilla via importScripts() qui est dispo dans le SW Chrome.
 *     Le polyfill expose `browser.*` comme wrapper Promise-based de `chrome.*`.
 *   - Le service worker Chrome peut être tué après ~30s d'inactivité. On
 *     persiste donc le token dans storage.local plutôt qu'en variable globale.
 */

// Chargement conditionnel du polyfill :
//   - Sur Firefox : `browser` est défini nativement, on skip.
//   - Sur Chrome : `browser` est undefined dans le SW, et importScripts() est
//     disponible dans ce contexte → on charge le polyfill.
if (typeof browser === "undefined" && typeof importScripts === "function") {
  // eslint-disable-next-line no-undef
  importScripts("vendor/browser-polyfill.min.js");
}

const API_BASE = "https://api.redgifs.com";

// Clé de stockage pour le token temporaire.
// Sur Chrome, le service worker meurt régulièrement et une variable globale
// serait perdue. On passe par storage.local qui est persistant.
const TOKEN_STORAGE_KEY = "apiToken";

/**
 * Récupère un token temporaire depuis l'API RedGifs.
 * Endpoint officiel : GET /v2/auth/temporary
 * Réponse : { "token": "eyJ..." }
 */
async function fetchTemporaryToken() {
  const res = await fetch(`${API_BASE}/v2/auth/temporary`, {
    method: "GET"
  });
  if (!res.ok) {
    throw new Error(`Token endpoint returned HTTP ${res.status}`);
  }
  const data = await res.json();
  if (!data.token) {
    throw new Error("Token endpoint returned no token field");
  }
  // Persister dans storage (survit au kill du service worker Chrome)
  await browser.storage.local.set({ [TOKEN_STORAGE_KEY]: data.token });
  return data.token;
}

/**
 * Retourne le token courant depuis storage, ou en récupère un neuf.
 */
async function getToken() {
  const stored = await browser.storage.local.get(TOKEN_STORAGE_KEY);
  if (stored[TOKEN_STORAGE_KEY]) return stored[TOKEN_STORAGE_KEY];
  return await fetchTemporaryToken();
}

/**
 * Invalide le token stocké (à appeler sur 401).
 */
async function invalidateToken() {
  await browser.storage.local.remove(TOKEN_STORAGE_KEY);
}

/**
 * Récupère les métadonnées d'un GIF par son ID.
 * Endpoint : GET /v2/gifs/<id> avec header Authorization: Bearer <token>
 *
 * Retourne l'objet complet { gif: {...}, user: {...} } tel que fourni par l'API.
 *
 * Sur un 401, on considère le token comme expiré, on en redemande un neuf,
 * et on réessaie UNE fois.
 */
async function fetchGifMetadata(id) {
  let token = await getToken();

  async function doFetch() {
    return fetch(`${API_BASE}/v2/gifs/${encodeURIComponent(id)}`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
  }

  let res = await doFetch();

  if (res.status === 401) {
    // Token expiré ou invalidé → on en prend un neuf et on retente.
    await invalidateToken();
    token = await fetchTemporaryToken();
    res = await doFetch();
  }

  if (!res.ok) {
    throw new Error(`Metadata endpoint returned HTTP ${res.status} for id=${id}`);
  }

  const data = await res.json();
  if (!data || !data.gif) {
    throw new Error(`Metadata response missing 'gif' field for id=${id}`);
  }
  return data;
}

/**
 * Déclenche un téléchargement via l'API browser.downloads.
 *
 * @param {string} url - L'URL du MP4 sur le CDN RedGifs.
 * @param {string} filename - Nom du fichier (ex: "HappyBlueShark.mp4").
 *   Peut contenir un sous-chemin relatif au dossier Downloads (ex: "RedGifs/HappyBlueShark.mp4").
 */
async function triggerDownload(url, filename) {
  // saveAs: false → utilise le comportement Firefox par défaut (pas de dialog
  //   si l'utilisateur a configuré "Enregistrer dans Téléchargements").
  // conflictAction: "uniquify" → si un fichier du même nom existe déjà,
  //   Firefox ajoute un suffixe (1), (2)… plutôt que d'écraser.
  return await browser.downloads.download({
    url: url,
    filename: filename,
    saveAs: false,
    conflictAction: "uniquify"
  });
}

/**
 * Calcule un segment de dossier daté selon le mode choisi.
 *   - "month" → "2026-04"
 *   - "week"  → "2026-W16" (semaine ISO 8601)
 *   - "day"   → "2026-04-17"
 * La date est celle du moment du téléchargement (pas celle de la config).
 */
function buildDateSegment(mode) {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  if (mode === "month") return `${yyyy}-${mm}`;
  if (mode === "day") return `${yyyy}-${mm}-${dd}`;
  if (mode === "week") {
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
  }
  return "";
}

/**
 * Construit le sous-dossier de téléchargement à partir des réglages stockés.
 * Les réglages sont :
 *   - useSubfolder (bool) : ajoute "RedGifs/" en préfixe
 *   - useSort (bool)      : ajoute un segment daté selon sortBy
 *   - sortBy              : "month" | "week" | "day"
 *
 * Retourne un chemin relatif terminé par "/" (ou chaîne vide).
 * Exemples :
 *   - useSubfolder=false, useSort=false        → ""
 *   - useSubfolder=true                        → "RedGifs/"
 *   - useSubfolder=true,  useSort=true, month  → "RedGifs/2026-04/"
 *   - useSubfolder=false, useSort=true, day    → "2026-04-17/"
 */
async function getDownloadSubfolder() {
  const stored = await browser.storage.local.get({
    useSubfolder: false,
    useSort: false,
    sortBy: "month"
  });

  const parts = [];
  if (stored.useSubfolder) parts.push("RedGifs");
  if (stored.useSort) {
    const seg = buildDateSegment(stored.sortBy);
    if (seg) parts.push(seg);
  }

  if (!parts.length) return "";
  return parts.join("/") + "/";
}

// ---------------------------------------------------------------------------
// Écoute des messages en provenance du content script.
//
// Protocole :
//   { type: "GET_GIF_DATA", id: "HappyBlueShark" }
//     → répond { ok: true, data: <objet API> } ou { ok: false, error: "..." }
//
//   { type: "DOWNLOAD", url: "https://...", id: "HappyBlueShark", quality: "hd"|"sd" }
//     → télécharge le fichier dans Downloads/<subfolder>/<id>.mp4
//     → répond { ok: true, downloadId: <n> } ou { ok: false, error: "..." }
// ---------------------------------------------------------------------------
browser.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || !msg.type) return;

  if (msg.type === "GET_GIF_DATA") {
    return fetchGifMetadata(msg.id)
      .then(data => ({ ok: true, data }))
      .catch(err => ({ ok: false, error: err.message }));
  }

  if (msg.type === "DOWNLOAD") {
    return getDownloadSubfolder()
      .then(async subfolder => {
        const filename = `${subfolder}${msg.id}.mp4`;
        const downloadId = await triggerDownload(msg.url, filename);
        return { ok: true, downloadId };
      })
      .catch(err => ({ ok: false, error: err.message }));
  }

  // Type inconnu → pas de réponse
});

// ---------------------------------------------------------------------------
// Écoute des raccourcis clavier définis dans le manifest (commands).
// Quand Alt+H ou Alt+S est pressé, on envoie un message au content script
// de l'onglet actif pour qu'il déclenche le téléchargement.
// On passe par le content script (plutôt que de télécharger directement ici)
// parce que lui connaît l'ID de la page courante et peut donner un feedback
// visuel à l'utilisateur (bouton qui clignote, toast, etc.).
// ---------------------------------------------------------------------------
browser.commands.onCommand.addListener(async (command) => {
  const quality = command === "download-hd" ? "hd"
                : command === "download-sd" ? "sd"
                : null;
  if (!quality) return;

  // On ne cible QUE les onglets redgifs.com actifs pour éviter
  // d'envoyer un message à des tabs où notre content script n'est pas injecté.
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) return;
  if (!/^https?:\/\/(www\.)?redgifs\.com\//.test(tab.url)) return;

  try {
    await browser.tabs.sendMessage(tab.id, { type: "SHORTCUT_DOWNLOAD", quality });
  } catch (err) {
    // Le content script n'est pas là (page pas encore chargée, etc.) → silencieux
    console.warn("[RedGifs DL] sendMessage failed:", err.message);
  }
});
