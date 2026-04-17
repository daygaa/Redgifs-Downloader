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

// ===========================================================================
// PATCH HDR : transforme les metadata BT.2020/HLG ou BT.2020/PQ en BT.709 SDR.
//
// Pourquoi : certaines vidéos uploadées depuis iPhone sur RedGifs ont des
// metadata HDR (HLG BT.2020) alors qu'elles sont encodées en 8 bits. Les
// lecteurs Windows (Films & TV, Photos) appliquent un tonemap HDR→SDR qui,
// sur du 8-bit, provoque une forte sur-exposition. Les lecteurs plus laxistes
// (VLC, Discord, navigateurs) ignorent les metadata et rendent correctement.
//
// Solution : modifier 3 valeurs dans le SPS H.264 (à l'intérieur de l'atome
// avcC du MP4) pour indiquer BT.709 au lieu de BT.2020/HLG. Pas de
// ré-encodage : seuls ~3 octets changent, le fichier reste bit-pour-bit
// identique en terme de données vidéo.
//
// Les 3 valeurs modifiées (chacune sur 8 bits) sont :
//   - colour_primaries      : 9 (BT.2020) → 1 (BT.709)
//   - transfer_characteristics : 16 (PQ) ou 18 (HLG) → 1 (BT.709)
//   - matrix_coefficients   : 9 (BT.2020 NCL) → 1 (BT.709)
//
// Les 3 valeurs se trouvent dans le VUI parameters du SPS, à un offset NON
// aligné octet (car exprimé en bits). D'où le bit-reader et les helpers de
// lecture/écriture bit-à-bit.
//
// La fonction retourne { buffer, patched }. Si le MP4 n'a pas de metadata HDR
// ou si la structure est inattendue, patched = false et le buffer est renvoyé
// inchangé.
// ===========================================================================

function readU32BE(buf, off) {
  return (buf[off] * 0x1000000) + (buf[off+1] * 0x10000) + (buf[off+2] * 0x100) + buf[off+3];
}

/**
 * Cherche récursivement les atomes MP4 d'un type donné.
 * @param {Uint8Array} buf
 * @param {number} start
 * @param {number} end
 * @param {string} targetType  — ex: "avcC"
 * @param {string[]} containers — types à descendre (ex: ["moov","trak",...])
 */
function findAtoms(buf, start, end, targetType, containers) {
  const results = [];
  let i = start;
  while (i + 8 <= end) {
    const size = readU32BE(buf, i);
    const type = String.fromCharCode(buf[i+4], buf[i+5], buf[i+6], buf[i+7]);
    let headerLen = 8;
    let realSize = size;
    if (size === 1) {
      // Taille étendue sur 8 octets
      realSize = Number(new DataView(buf.buffer, buf.byteOffset + i + 8, 8).getBigUint64(0, false));
      headerLen = 16;
    } else if (size === 0) {
      // Atome jusqu'à la fin du parent
      realSize = end - i;
    }
    if (realSize < headerLen || i + realSize > end) break;

    if (type === targetType) {
      results.push({ start: i, size: realSize, payloadStart: i + headerLen });
    }

    if (containers.includes(type)) {
      results.push(...findAtoms(buf, i + headerLen, i + realSize, targetType, containers));
    }
    // stsd a un header supplémentaire de 8 octets (ver/flags + entry_count)
    // avant ses sous-atomes.
    if (type === 'stsd' && containers.includes('stsd')) {
      results.push(...findAtoms(buf, i + headerLen + 8, i + realSize, targetType, containers));
    }
    // Les VisualSampleEntry (avc1, hvc1...) ont 78 octets de header de Visual
    // Sample Entry avant leurs sous-atomes (colr, pasp, avcC...).
    const VISUAL_SAMPLE_ENTRIES = ['avc1', 'hvc1', 'hev1', 'hvc2', 'encv', 'av01', 'vp09', 'vp08'];
    if (VISUAL_SAMPLE_ENTRIES.includes(type)) {
      const subStart = i + headerLen + 78;
      if (subStart < i + realSize) {
        results.push(...findAtoms(buf, subStart, i + realSize, targetType, containers));
      }
    }

    i += realSize;
  }
  return results;
}

/**
 * Retire les "emulation prevention bytes" (0x03 inséré après 00 00) d'un buffer.
 * C'est un mécanisme de l'encodage H.264 pour éviter les start codes parasites.
 */
function removeEmulationPrevention(data) {
  const out = [];
  let i = 0;
  while (i < data.length) {
    if (i + 2 < data.length && data[i] === 0 && data[i+1] === 0 && data[i+2] === 3) {
      out.push(0); out.push(0);
      i += 3;
    } else {
      out.push(data[i]);
      i += 1;
    }
  }
  return Uint8Array.from(out);
}

/**
 * Ré-insère les emulation prevention bytes après modification d'un RBSP.
 * Règle H.264 : partout où apparaît 00 00 [00|01|02|03], insérer 00 00 03 avant.
 * Si le buffer se termine par 00 00, ajouter 00 00 03 aussi.
 */
function addEmulationPrevention(rbsp) {
  const out = [];
  let i = 0;
  while (i < rbsp.length) {
    if (i + 2 < rbsp.length && rbsp[i] === 0 && rbsp[i+1] === 0 && rbsp[i+2] <= 3) {
      out.push(0); out.push(0); out.push(3);
      i += 2;
    } else {
      out.push(rbsp[i]);
      i += 1;
    }
  }
  if (out.length >= 2 && out[out.length-2] === 0 && out[out.length-1] === 0) out.push(3);
  return Uint8Array.from(out);
}

/**
 * Bit reader minimaliste pour parser le SPS H.264.
 * Les champs du SPS sont souvent encodés en Exp-Golomb (longueur variable),
 * donc un lecteur bit-à-bit est nécessaire.
 */
class BitReader {
  constructor(data, startBit = 0) {
    this.data = data;
    this.pos = startBit;
  }
  readBit() {
    const byte = this.data[this.pos >>> 3];
    const bit = (byte >>> (7 - (this.pos & 7))) & 1;
    this.pos += 1;
    return bit;
  }
  readBits(n) {
    let v = 0;
    for (let i = 0; i < n; i++) v = (v << 1) | this.readBit();
    return v >>> 0;
  }
  readUE() {
    // Unsigned Exp-Golomb
    let zeros = 0;
    while (zeros <= 32 && this.readBit() === 0) zeros++;
    if (zeros === 0) return 0;
    if (zeros > 32) throw new Error("ue: too many leading zeros");
    return ((1 << zeros) - 1 + this.readBits(zeros)) >>> 0;
  }
}

/**
 * Parse le SPS (RBSP) et retourne le bit-offset où commencent les 24 bits des
 * 3 valeurs VUI colour (primaries, transfer, matrix). Retourne null si non
 * présentes dans ce SPS.
 */
function findColourDescriptionBitOffset(spsRbsp) {
  // Le premier octet du SPS est le NAL header → on commence au bit 8
  const br = new BitReader(spsRbsp, 8);

  const profileIdc = br.readBits(8);
  br.readBits(8);  // constraint_set_flags + reserved
  br.readBits(8);  // level_idc
  br.readUE();     // seq_parameter_set_id

  const HIGH_PROFILES = [100, 110, 122, 244, 44, 83, 86, 118, 128, 138, 139, 134, 135];
  if (HIGH_PROFILES.includes(profileIdc)) {
    const chromaFormatIdc = br.readUE();
    if (chromaFormatIdc === 3) br.readBit();
    br.readUE();  // bit_depth_luma_minus8
    br.readUE();  // bit_depth_chroma_minus8
    br.readBit(); // qpprime_y_zero_transform_bypass_flag
    if (br.readBit()) return null; // scaling matrix — on ne sait pas parser
  }

  br.readUE(); // log2_max_frame_num_minus4
  const picOrderCntType = br.readUE();
  if (picOrderCntType === 0) br.readUE();
  else if (picOrderCntType === 1) return null; // cas rare non géré

  br.readUE(); // max_num_ref_frames
  br.readBit(); // gaps_in_frame_num_value_allowed_flag
  br.readUE(); // pic_width_in_mbs_minus1
  br.readUE(); // pic_height_in_map_units_minus1
  const frameMbsOnly = br.readBit();
  if (!frameMbsOnly) br.readBit(); // mb_adaptive_frame_field_flag
  br.readBit(); // direct_8x8_inference_flag
  if (br.readBit()) { // frame_cropping_flag
    br.readUE(); br.readUE(); br.readUE(); br.readUE();
  }

  if (!br.readBit()) return null; // vui_parameters_present_flag

  // Dans VUI maintenant
  if (br.readBit()) { // aspect_ratio_info_present_flag
    const ar = br.readBits(8);
    if (ar === 255) { br.readBits(16); br.readBits(16); }
  }
  if (br.readBit()) br.readBit(); // overscan
  if (!br.readBit()) return null; // video_signal_type_present_flag

  br.readBits(3);  // video_format
  br.readBit();    // video_full_range_flag
  if (!br.readBit()) return null; // colour_description_present_flag

  // On est positionné juste avant les 24 bits des 3 valeurs
  return br.pos;
}

function readByteAtBit(data, bitPos) {
  const byteIdx = bitPos >>> 3;
  const shift = bitPos & 7;
  if (shift === 0) return data[byteIdx];
  const lo = data[byteIdx] & ((1 << (8 - shift)) - 1);
  const b2 = byteIdx + 1 < data.length ? data[byteIdx + 1] : 0;
  return ((lo << shift) | (b2 >>> (8 - shift))) & 0xFF;
}

function writeByteAtBit(data, bitPos, value) {
  for (let i = 0; i < 8; i++) {
    const bv = (value >>> (7 - i)) & 1;
    const bi = (bitPos + i) >>> 3;
    const bit = (bitPos + i) & 7;
    const mask = 1 << (7 - bit);
    if (bv) data[bi] |= mask;
    else data[bi] &= ~mask;
  }
}

/**
 * Fonction principale : patch un MP4 pour passer ses metadata HDR en SDR BT.709.
 * Si le MP4 n'a pas de metadata HDR ou si la structure est inattendue, le buffer
 * est renvoyé inchangé avec patched=false.
 *
 * @param {ArrayBuffer} buffer - le fichier MP4 complet
 * @returns {{ buffer: ArrayBuffer, patched: boolean }}
 */
function patchMp4Metadata(buffer) {
  try {
    const data = new Uint8Array(buffer);
    const containers = ['moov', 'trak', 'mdia', 'minf', 'stbl', 'stsd'];
    const avcCs = findAtoms(data, 0, data.length, 'avcC', containers);
    if (avcCs.length === 0) return { buffer, patched: false };

    let didPatch = false;

    for (const avcC of avcCs) {
      // avcC structure :
      //   [5 octets: version/profile/compat/level/lengthSizeMinusOne]
      //   [1 octet: numOfSPS (low 5 bits)]
      //   pour chaque SPS : [2 octets: length][length octets: SPS]
      //   [1 octet: numOfPPS] ...
      const ps = avcC.payloadStart;
      const numSps = data[ps + 5] & 0x1F;
      let cursor = ps + 6;

      for (let s = 0; s < numSps; s++) {
        const spsLen = (data[cursor] << 8) | data[cursor + 1];
        cursor += 2;
        const spsStart = cursor;
        const spsEnd = cursor + spsLen;
        const spsRaw = data.subarray(spsStart, spsEnd);

        const rbsp = removeEmulationPrevention(spsRaw);
        const bitOffset = findColourDescriptionBitOffset(rbsp);

        if (bitOffset !== null) {
          const primaries = readByteAtBit(rbsp, bitOffset);
          const transfer = readByteAtBit(rbsp, bitOffset + 8);
          const matrix = readByteAtBit(rbsp, bitOffset + 16);

          // On détecte le HDR via des valeurs caractéristiques :
          //   - Primaries BT.2020 (9) ou BT.2020 CL (14)
          //   - Transfer HLG (18) ou PQ/ST2084 (16)
          //   - Matrix BT.2020 NCL (9) ou CL (10)
          const isHdr = (primaries === 9 || primaries === 14)
                     || (transfer === 16 || transfer === 18)
                     || (matrix === 9 || matrix === 10);

          if (isHdr) {
            writeByteAtBit(rbsp, bitOffset, 1);
            writeByteAtBit(rbsp, bitOffset + 8, 1);
            writeByteAtBit(rbsp, bitOffset + 16, 1);

            const newSpsRaw = addEmulationPrevention(rbsp);

            if (newSpsRaw.length === spsRaw.length) {
              for (let i = 0; i < newSpsRaw.length; i++) {
                data[spsStart + i] = newSpsRaw[i];
              }
              didPatch = true;
            }
            // Si la taille a changé (cas tordu), on ne patch pas ce SPS pour
            // ne pas casser la structure avcC. Un avertissement dans la console
            // serait utile, mais on reste silencieux en prod.
          }
        }
        cursor = spsEnd;
      }
    }

    return { buffer: data.buffer, patched: didPatch };
  } catch (err) {
    // En cas d'erreur inattendue, on renvoie le buffer tel quel sans risquer
    // de corrompre la vidéo.
    console.warn("[RedGifs DL] patchMp4Metadata error:", err);
    return { buffer, patched: false };
  }
}

// ===========================================================================
// Téléchargement avec patch optionnel.
// Workflow :
//   1. fetch(url) → récupère le MP4 en ArrayBuffer
//   2. Si patchHdr est activé, on essaie le patch
//   3. Si patched=true et DEBUG_MARK_PATCHED est vrai, on ajoute "*" au
//      nom de fichier pour que l'utilisateur puisse repérer les fichiers
//      effectivement modifiés (utile pour debug)
//   4. Crée un Blob à partir du buffer, puis une object URL, et la passe à
//      browser.downloads.download
// ===========================================================================

// Flag debug : si true, les fichiers dont les metadata HDR ont été patchées
// reçoivent un "*" à la fin du nom avant l'extension. Utile pour distinguer
// visuellement les fichiers effectivement modifiés des fichiers passés
// inchangés. À repasser à false une fois le debug terminé.
const DEBUG_MARK_PATCHED = true;

async function triggerDownloadWithPatch(url, filename) {
  const stored = await browser.storage.local.get({ patchHdr: true });

  // Si l'utilisateur a désactivé le patch, on retourne à la méthode directe.
  if (!stored.patchHdr) {
    return await triggerDownload(url, filename);
  }

  // Récupérer le fichier en RAM
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Video fetch returned HTTP ${res.status}`);
  }
  const buf = await res.arrayBuffer();

  // Tenter le patch
  const { buffer, patched } = patchMp4Metadata(buf);

  // Ajuster le nom de fichier si patch effectif et mode debug
  let finalFilename = filename;
  if (patched && DEBUG_MARK_PATCHED) {
    const dotIdx = filename.lastIndexOf(".");
    if (dotIdx > 0) {
      finalFilename = filename.slice(0, dotIdx) + "_patched" + filename.slice(dotIdx);
    } else {
      finalFilename = filename + "_patched";
    }
  }

  // Créer un Blob et une object URL pour la passer à l'API downloads
  const blob = new Blob([buffer], { type: "video/mp4" });
  const blobUrl = URL.createObjectURL(blob);

  try {
    return await browser.downloads.download({
      url: blobUrl,
      filename: finalFilename,
      saveAs: false,
      conflictAction: "uniquify"
    });
  } finally {
    // On ne peut pas révoquer immédiatement : le navigateur en a besoin le
    // temps d'écrire le fichier. On attend un court délai puis on révoque
    // pour libérer la RAM. Si le download est lent (très gros fichier), le
    // browser aura déjà consommé le blob au moment du revoke.
    setTimeout(() => {
      try { URL.revokeObjectURL(blobUrl); } catch (e) { /* ignore */ }
    }, 60000); // 60s de marge
  }
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
        const downloadId = await triggerDownloadWithPatch(msg.url, filename);
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
