#!/usr/bin/env node
/**
 * build-chrome.js — Construit le ZIP pour Chrome.
 *
 * Flux :
 *   1. Lit la version depuis manifest-chrome.json
 *   2. Crée un staging à dist/chrome/staging/ avec les fichiers à inclure
 *   3. Renomme manifest-chrome.json → manifest.json dans le staging
 *   4. Zippe le staging en dist/chrome/redgifs-downloader-chrome-<version>.zip
 *
 * Prérequis : Node.js 18+ (pour node:fs/promises et node:stream/promises)
 *             + la dépendance `archiver` — sinon fallback sur la commande `zip`.
 *
 * Pour éviter d'imposer une dépendance npm juste pour ce script, on utilise
 * la commande `zip` du système (présente par défaut sur Linux/macOS et
 * installable sur Windows via Git Bash ou 7-Zip en ligne de commande).
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist", "chrome");
const STAGING = path.join(DIST, "staging");

// Fichiers / dossiers à inclure dans le ZIP Chrome.
// On exclut : manifest.json (Firefox), updates.json, recon.js, package.json,
// node_modules, dist, scripts, PUBLISHING.md — tout ce qui n'est pas utile
// à l'extension packagée.
const INCLUDE = [
  "background.js",
  "content.js",
  "styles.css",
  "popup.html",
  "popup.css",
  "popup.js",
  "options.html",
  "options.js",
  "icons",
  "vendor",
  "LICENSE",
  "README.md"
];

function log(msg) {
  console.log(`[build:chrome] ${msg}`);
}

function rmrf(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}

function copyRecursive(src, dst) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dst, entry));
    }
  } else {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
(function main() {
  // 1. Lire la version depuis manifest-chrome.json
  const chromeManifestPath = path.join(ROOT, "manifest-chrome.json");
  const manifest = JSON.parse(fs.readFileSync(chromeManifestPath, "utf-8"));
  const version = manifest.version;
  log(`Building Chrome extension v${version}`);

  // 2. Préparer le staging
  rmrf(STAGING);
  fs.mkdirSync(STAGING, { recursive: true });

  // 3. Copier les fichiers/dossiers inclus
  for (const item of INCLUDE) {
    const src = path.join(ROOT, item);
    if (!fs.existsSync(src)) {
      log(`  [skip] ${item} (not found)`);
      continue;
    }
    const dst = path.join(STAGING, item);
    copyRecursive(src, dst);
    log(`  [ok]   ${item}`);
  }

  // 4. Copier manifest-chrome.json → manifest.json dans le staging
  fs.copyFileSync(chromeManifestPath, path.join(STAGING, "manifest.json"));
  log(`  [ok]   manifest-chrome.json → manifest.json`);

  // 5. Créer le ZIP
  const zipName = `redgifs-downloader-chrome-${version}.zip`;
  const zipPath = path.join(DIST, zipName);
  rmrf(zipPath);

  // Utiliser la commande zip du système. Sous Windows, Git Bash embarque `zip`.
  // Sous PowerShell pur, fallback sur Compress-Archive.
  try {
    // Option 1 : zip standard (Linux, macOS, Git Bash sur Windows)
    execSync(`cd "${STAGING}" && zip -rq "${zipPath}" .`, { stdio: "inherit" });
  } catch (err) {
    log("zip not available, falling back to PowerShell Compress-Archive");
    try {
      execSync(
        `powershell -Command "Compress-Archive -Path '${STAGING}\\*' -DestinationPath '${zipPath}' -Force"`,
        { stdio: "inherit" }
      );
    } catch (err2) {
      console.error(
        "ERREUR : impossible de créer le ZIP.\n" +
        "Installe zip via Git Bash, ou utilise Windows 10+ avec PowerShell."
      );
      process.exit(1);
    }
  }

  log(`✓ ${zipName} created in dist/chrome/`);
  log(`  Chemin complet : ${zipPath}`);
})();
