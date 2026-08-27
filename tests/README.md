# Tests de GGgames

## Tests de logique (Node, sans dépendance)

Ils vérifient les règles de tous les jeux, les moteurs (lettres, IA, générateurs
de grilles), l'anti-triche (redaction des états) et les banques de contenu.

```bash
node tests/test_engine.js     # moteur du jeu de lettres (scores, primes, fin de partie)
node tests/test_ai.js         # IA de Words (coups légaux, niveaux)
node tests/test_games.js      # tous les jeux de plateau/cartes/enquête
node tests/test_puzzle.js     # sudoku, mots mêlés, mot mystère, mots croisés
node tests/test_newgames.js   # quiz, le plus proche, 8 américain
```

Ils tournent automatiquement en CI à chaque push (`.github/workflows/tests.yml`).

## Tests d'interface (Playwright)

Ils pilotent l'application dans un vrai Chromium : catalogue, parties complètes
en solo, à plusieurs sur un téléphone (écrans de passage) et en réseau
(hôte + invités WebRTC sur la même page), QR d'invitation, et le test
« mode avion » (chargement, coupure totale du réseau, re-lancement).

```bash
npm i playwright                       # une fois
python3 -m http.server 8642 &          # sert l'appli à la racine du dépôt
node tests/browser/test_platform.js    # catalogue + parcours de chaque écran
node tests/browser/test_ui.js          # Words en réseau : hôte + 3 invités
node tests/browser/test_offline.js     # mode avion de bout en bout
# … voir le dossier pour les autres suites
```

`CHROMIUM_PATH` permet d'utiliser un Chromium déjà installé au lieu de celui
téléchargé par Playwright.
