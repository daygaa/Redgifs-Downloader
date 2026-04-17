# Guide de publication — Redgifs Downloader

Ce guide te détaille toutes les étapes pour publier l'extension sur GitHub avec mises à jour automatiques via AMO-signed XPI.

---

## Vue d'ensemble

On va utiliser la méthode **self-distributed** d'AMO :
1. Mozilla signe ton XPI (indispensable pour que Firefox Release l'accepte)
2. Tu héberges le XPI sur GitHub Releases
3. Firefox vérifie périodiquement un fichier `updates.json` hébergé sur GitHub Pages
4. Quand tu publies une nouvelle version, les utilisateurs la reçoivent automatiquement

```
┌──────────────┐       ┌─────────────┐        ┌──────────────────┐
│ Toi (dev)    │──────▶│ AMO API     │──────▶│  XPI signé (.xpi)│
│ web-ext sign │       │ (auto-sign) │        └────────┬─────────┘
└──────────────┘       └─────────────┘                 │
                                                       ▼
                                          ┌──────────────────────┐
                                          │ GitHub Release       │
                                          │ (hosts .xpi + notes) │
                                          └──────────┬───────────┘
                                                     │
                          ┌──────────────────────────┴─────────────────────┐
                          │                                                │
                          ▼                                                ▼
                ┌───────────────────┐                         ┌──────────────────────┐
                │ GitHub Pages      │                         │  Firefox utilisateur │
                │ updates.json      │◀────── check periodic ──│  auto-updates        │
                └───────────────────┘                         └──────────────────────┘
```

---

## PHASE 1 : Setup initial (une seule fois)

### 1.1 — Installer Node.js

Télécharge et installe **Node.js LTS** depuis https://nodejs.org/
Teste dans PowerShell :

```powershell
node --version
npm --version
```

Les deux commandes doivent afficher une version.

### 1.2 — Créer un compte développeur Mozilla

1. Va sur https://addons.mozilla.org/developers/
2. Clique sur **Submit Your First Add-on** ou connecte-toi avec un compte Firefox existant
3. Valide ton email

### 1.3 — Récupérer tes credentials API AMO

1. Va sur https://addons.mozilla.org/developers/addon/api/key/
2. Clique **Generate new credentials**
3. Note dans un endroit sûr :
   - **JWT issuer** (ressemble à `user:12345678:123`)
   - **JWT secret** (longue chaîne hexa)

**Ne commit JAMAIS ces valeurs dans Git.** On va les mettre dans un fichier `.env` ignoré.

### 1.4 — Installer `web-ext` globalement

Dans PowerShell :

```powershell
npm install -g web-ext
web-ext --version
```

### 1.5 — Créer le dépôt GitHub

1. Sur GitHub : **New repository** → nom `Redgifs-Downloader`
2. **Public**, pas de README (on en a déjà un), pas de `.gitignore`
3. Clone-le localement :

```powershell
cd C:\Dev
git clone https://github.com/daygaa/Redgifs-Downloader.git
cd Redgifs-Downloader
```

### 1.6 — Copier les fichiers de l'extension

Dézippe `redgifs-downloader.zip` dans le dossier `Redgifs-Downloader`, de sorte que la structure soit :

```
Redgifs-Downloader/
├── .gitignore
├── CHANGELOG.md
├── LICENSE
├── README.md
├── background.js
├── content.js
├── icons/
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon96.png
├── manifest.json
├── options.html
├── options.js
├── package.json
├── popup.css
├── popup.html
├── popup.js
├── styles.css
└── updates.json
```

### 1.7 — Créer le fichier `.env` local (secrets)

À la racine du dépôt, crée un fichier `.env` avec :

```
WEB_EXT_API_KEY=user:12345678:123
WEB_EXT_API_SECRET=ton_secret_hexa_tres_long
```

Remplace par tes vraies valeurs de l'étape 1.3. Le `.gitignore` qu'on a préparé empêche ce fichier d'être commit.

### 1.8 — Premier commit et push

GitHub Pages a besoin qu'une branche existe sur le dépôt pour pouvoir la servir — on fait donc le premier push maintenant, **avant** d'activer Pages.

```powershell
git add .
git commit -m "Initial commit: v1.5.0"
git push origin main
```

Si Git te demande de configurer ton identité la première fois :
```powershell
git config --global user.email "ton-email@exemple.com"
git config --global user.name "daygaa"
```

Vérifie sur https://github.com/daygaa/Redgifs-Downloader que tes fichiers apparaissent bien.

### 1.9 — Activer GitHub Pages pour `updates.json`

1. Dans ton dépôt GitHub → **Settings** → **Pages**
2. Source : **Deploy from a branch**
3. Branch : `main` (maintenant qu'elle existe), dossier `/ (root)`
4. Clique **Save**
5. Attend 1-2 minutes (GitHub doit builder le site la première fois). GitHub affichera l'URL : `https://daygaa.github.io/Redgifs-Downloader/`
6. Vérifie que `https://daygaa.github.io/Redgifs-Downloader/updates.json` est accessible — tu dois voir le JSON affiché brut dans le navigateur, pas une erreur 404.

---

## PHASE 2 : Publier la version 1.5.0 (première release)

### 2.1 — Linter le code

```powershell
npm run lint:firefox
```

Si des warnings apparaissent, corrige-les avant de signer. Les erreurs bloquantes sont rares ; les warnings courants (exemple : "permission download could be requested only when needed") sont non-bloquants.

### 2.2 — Signer l'XPI via AMO

Dans PowerShell, charge les variables du `.env` :

```powershell
# PowerShell : charger .env
Get-Content .env | ForEach-Object {
  $name, $value = $_.split('=')
  [Environment]::SetEnvironmentVariable($name, $value, 'Process')
}

# Puis signer
npm run sign:firefox
```

Ou en une commande :

```powershell
web-ext sign --source-dir=. --artifacts-dir=dist --channel=unlisted `
  --api-key=TON_JWT_ISSUER --api-secret=TON_JWT_SECRET
```

**Ce que ça fait :**
- Packe l'extension en ZIP
- L'upload sur AMO via leur API
- AMO lance une validation automatique (~30 secondes à quelques minutes)
- Si OK, récupère l'XPI signé et le place dans `dist/`

Le fichier généré s'appellera quelque chose comme :
`dist/redgifs_downloader-1.5.0-fx.xpi`

### 2.3 — Vérifier localement l'XPI signé

Drag-n-drop le `.xpi` signé sur une fenêtre Firefox. Firefox doit l'accepter comme extension installée de manière permanente (plus de "chargée temporairement").

### 2.4 — Publier la release GitHub

Deux options :

**Option A (interface web GitHub)**
1. Va sur https://github.com/daygaa/Redgifs-Downloader/releases/new
2. Choisis un tag : **v1.5.0** (crée-le)
3. Titre : `v1.5.0 — Icon redesign`
4. Description : copie le contenu de `CHANGELOG.md` pour cette version
5. Attache le fichier `dist/redgifs_downloader-1.5.0-fx.xpi`
6. **Publish release**

**Option B (CLI GitHub)** — plus rapide si tu as `gh` installé
```powershell
gh release create v1.5.0 dist/redgifs_downloader-1.5.0-fx.xpi --title "v1.5.0 — Icon redesign" --notes-file release-notes.md
```

### 2.5 — Mettre à jour `updates.json`

Vérifie que le fichier contient bien la bonne version et l'URL exacte du XPI que tu viens de publier. L'URL standard est :

```
https://github.com/daygaa/Redgifs-Downloader/releases/download/v1.5.0/redgifs_downloader-1.5.0-fx.xpi
```

(le nom du fichier XPI peut varier légèrement selon les versions de `web-ext` — vérifie le nom exact du fichier dans la release GitHub).

Puis commit et push :

```powershell
git add updates.json
git commit -m "updates.json: release 1.5.0"
git push
```

GitHub Pages sera mis à jour en 1-2 minutes.

### 2.6 — Vérifier que tout fonctionne

- https://daygaa.github.io/Redgifs-Downloader/updates.json doit servir le bon JSON
- Install l'XPI sur un Firefox propre → ça doit marcher
- Dans `about:addons`, l'extension doit apparaître comme installée permanente (plus de badge "Temporary")

---

## PHASE 3 : Workflow pour chaque nouvelle version

Une fois la v1.5.0 publiée, voici la procédure pour chaque update :

### 3.1 — Faire les changements
Édite le code, teste en local via `about:debugging` → **Load Temporary Add-on**.

### 3.2 — Bump la version

Dans **deux** fichiers, incrémente la version :
- `manifest.json` : `"version": "1.6.0"`
- `package.json` : `"version": "1.6.0"`

Ajoute une entrée dans `CHANGELOG.md` en haut.

### 3.3 — Commit sur main

```powershell
git add .
git commit -m "Release 1.6.0: <résumé des changements>"
git push
```

### 3.4 — Signer et publier

```powershell
npm run sign:firefox
```

Attends la signature (~1 min), puis crée la release GitHub avec le nouvel XPI.

### 3.5 — Mettre à jour `updates.json`

Ouvre `updates.json` et ajoute la nouvelle version **en premier** dans le tableau `updates` :

```json
{
  "addons": {
    "redgifs-dl@dayga.com": {
      "updates": [
        {
          "version": "1.6.0",
          "update_link": "https://github.com/daygaa/Redgifs-Downloader/releases/download/v1.6.0/redgifs_downloader-1.6.0-fx.xpi"
        },
        {
          "version": "1.5.0",
          "update_link": "https://github.com/daygaa/Redgifs-Downloader/releases/download/v1.5.0/redgifs_downloader-1.5.0-fx.xpi"
        }
      ]
    }
  }
}
```

**Garde toujours l'historique** des versions précédentes pour que les utilisateurs sur d'anciennes versions puissent aussi mettre à jour.

```powershell
git add updates.json
git commit -m "updates.json: release 1.6.0"
git push
```

### 3.6 — Attendre la propagation

Firefox vérifie `updates.json` environ toutes les 24h, ou manuellement via **about:addons** → engrenage → **Check for Updates**.

Tes utilisateurs reçoivent la mise à jour en arrière-plan sans action de leur part.

---

## Troubleshooting

### "Validation failed" lors du sign

Regarde les erreurs reportées par AMO. Les plus courantes :
- **Permission inutilisée** : tu as déclaré `permissions` dans le manifest mais ne l'utilises pas dans le code → retire-la du manifest
- **Code minifié** : AMO exige du code lisible → assure-toi de ne pas avoir de fichier minifié embarqué
- **Fichier non référencé** : un fichier dans le dossier mais non utilisé → retire-le

### L'auto-update ne se déclenche pas

1. Check que `browser_specific_settings.gecko.update_url` pointe vers ton `updates.json`
2. Check que le `id` dans `updates.json` correspond **exactement** à celui du manifest (`redgifs-dl@dayga.com`)
3. Force une vérif : `about:support` → **Applications Basics** → Profile Folder → **Show Folder** → `extensions.json`, ou plus simple : `about:addons` → engrenage → **Check for Updates**
4. Vérifie avec `about:debugging` que Firefox a bien chargé la bonne version

### L'XPI n'est pas accepté

Tu as soumis en `--channel=listed` par erreur ? Il faut `unlisted` pour self-distribution. Relance `npm run sign:firefox`.

---

## Liens utiles

- Documentation `web-ext` : https://extensionworkshop.com/documentation/develop/web-ext-command-reference/
- AMO developer hub : https://addons.mozilla.org/developers/
- Format `updates.json` : https://extensionworkshop.com/documentation/manage/updating-your-extension/
- Exemple de référence : https://github.com/besuper/TwitchNoSub (même méthode que nous)

---

## PHASE 4 : Build Chrome (bonus)

Le portage Chrome utilise le **même code source** que Firefox. Les différences sont gérées automatiquement :
- Un `manifest-chrome.json` séparé (service_worker au lieu d'event page, pas d'update_url)
- Un polyfill Mozilla (`vendor/browser-polyfill.min.js`) qui expose `browser.*` sur Chrome
- Le popup détecte Chrome et adapte l'UI des raccourcis (lecture seule + bouton redirigeant vers `chrome://extensions/shortcuts`)

**Limitation Chrome** : pas de mises à jour automatiques. Google a bloqué les `update_url` externes en 2018. Les utilisateurs devront re-télécharger la nouvelle version manuellement.

### 4.1 — Builder le ZIP Chrome

```powershell
npm run build:chrome
```

Ce qui se passe :
- Le script `scripts/build-chrome.js` copie les fichiers nécessaires dans `dist/chrome/staging/`
- Renomme `manifest-chrome.json` → `manifest.json`
- Zippe le tout dans `dist/chrome/redgifs-downloader-chrome-X.Y.Z.zip`

### 4.2 — Tester en local

Dans Chrome (ou Edge / Brave / Opera) :
1. Extrais le ZIP dans un dossier permanent (ex : `C:\Dev\redgifs-downloader-chrome\`)
2. Va sur `chrome://extensions/`
3. Active **Developer mode** (toggle en haut à droite)
4. Clique **Load unpacked** et sélectionne le dossier extrait
5. L'extension apparaît et est fonctionnelle

### 4.3 — Publier le ZIP Chrome dans la release GitHub

À chaque release, attache **DEUX** fichiers :
- `redgifs-downloader-firefox-X.Y.Z.xpi` (signé AMO)
- `redgifs-downloader-chrome-X.Y.Z.zip` (dev mode)

Exemple en CLI :
```powershell
gh release create v1.5.0 `
  dist/firefox/redgifs_downloader-1.5.0-fx.xpi `
  dist/chrome/redgifs-downloader-chrome-1.5.0.zip `
  --title "v1.5.0" --notes-file release-notes.md
```

Ou depuis l'interface web GitHub, tu ajoutes simplement les deux fichiers comme assets de la release.

### 4.4 — Workflow complet pour une release

Pour chaque nouvelle version, après avoir bump la version dans `manifest.json` **et** `manifest-chrome.json` **et** `package.json` :

```powershell
# 1. Firefox : sign + build (AMO)
npm run sign:firefox

# 2. Chrome : build local
npm run build:chrome

# 3. Release GitHub avec les 2 artefacts
gh release create v1.6.0 `
  dist/firefox/redgifs_downloader-1.6.0-fx.xpi `
  dist/chrome/redgifs-downloader-chrome-1.6.0.zip `
  --title "v1.6.0" --notes "..."

# 4. Update updates.json pour Firefox auto-update
# (éditer le fichier manuellement puis commit)
git add updates.json
git commit -m "updates.json: release 1.6.0"
git push
```

### Bump de version : trois endroits à ne pas oublier

1. `manifest.json` (Firefox)
2. `manifest-chrome.json` (Chrome)
3. `package.json`

Ces trois fichiers doivent toujours avoir la même version. Un petit script `bump-version.js` pourrait être ajouté plus tard pour automatiser cela, mais pour l'instant c'est à faire à la main.
