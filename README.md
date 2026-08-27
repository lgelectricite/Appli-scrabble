# GGgames 🎮

![Tests](https://github.com/lgelectricite/Appli-scrabble/actions/workflows/tests.yml/badge.svg)

**GGgames** est une collection de jeux à plusieurs, **entièrement hors ligne**,
pensée pour les mobiles — parfaite pour un avion, un train ou un endroit sans
réseau. Aucun compte, aucun serveur externe, aucune connexion Internet
nécessaire pendant les parties.

## Le catalogue

| Jeu | Joueurs | Règles appliquées par le jeu |
|---|---|---|
| 🔤 **Words** | 1–4 | Jeu de lettres façon Scrabble : plateau officiel, 102 jetons, **dictionnaire français de 311 000 mots obligatoire pour tout le monde** (IA comprise). Mode solo contre l'IA (3 niveaux). |
| 🔴 **Puissance 4** | 2 | Alignements vérifiés par le jeu, série de manches. |
| ⭕ **Morpion** | 2 | Tic-tac-toe en série, victoires comptées automatiquement. |
| 🪢 **Pendu** | 1–4 | Mots **courants** choisis par le jeu (fini les formes introuvables), **3 niveaux** (longueur du mot et nombre de vies) et **indice payant** : révéler une lettre coûte un cœur. +1 pt par lettre, +3 pour qui termine le mot, 5 manches. |
| 📝 **Petit Bac** | 2–4 | Lettre au sort, 6 catégories, 60 s. Première lettre **contrôlée automatiquement**, réponses validées par le **vote des autres joueurs**, doublons à demi-points. |
| 🚢 **Bataille navale** | 2 | Flottes placées par le jeu, **grilles adverses jamais transmises** à l'autre téléphone. Touché = on rejoue. Série de manches avec revanche, victoires comptées. |
| 🎲 **Yams** | 1–4 | 5 dés, 3 lancers, feuille de score **calculée automatiquement** (bonus 35 compris). |
| 🐷 **Cochon** | 2–4 | Le dé qui fait tout perdre sur un 1. Premier à 100. |
| 🧠 **Memory** | 1–4 | Une paire = un point et on rejoue. |
| 🃏 **Poker** | 2–4 | Texas Hold'em, **cash game** (blinds fixes, recave) ou **tournoi** (blinds montantes, élimination) : tapis et pots secondaires, **mains évaluées par le jeu**, cartes adverses jamais transmises avant l'abattage. |
| 🔢 **Sudoku** | 1–4 | Grilles générées à volonté (**solution unique garantie**), 3 niveaux, erreurs comptées, chrono. En réseau : même grille, le plus rapide gagne — sans voir la grille des autres. Record personnel par niveau. |
| 🔎 **Mots mêlés** | 1–4 | Mots **courants** cachés, 3 niveaux : facile (horizontaux et verticaux), moyen (+ diagonales), difficile (8 sens, mots à l'envers) — l'équilibre des directions est garanti. En réseau, grille **partagée** : chaque mot trouvé prend la couleur de son découvreur. |
| 🟩 **Mot Mystère** | 1–4 | Type Motus/Wordle : 6 essais, le mot secret est un mot **courant**, vos propositions doivent exister dans le dictionnaire, 3 niveaux (5/6/7 lettres). En duel : même mot secret, les lettres adverses restent cachées (couleurs seulement). |
| ✏️ **Mots croisés** | 1–4 | Base de **près de 800 définitions écrites à la main** en 3 niveaux de vocabulaire ; le générateur croise les mots au hasard : des milliers de grilles possibles. Points à la longueur du mot, erreurs comptées, chrono et records. Les solutions **ne circulent jamais** sur le réseau. |
| ➡️ **Mots fléchés** | 1–4 | **1 000 grilles intégrées** dans l'application (5 forces × 200 grilles), générées et vérifiées à l'avance : cases-flèches comme dans les journaux, **progression enregistrée** grille par grille et record par force. |
| 🕵️ **Le Manoir** | 1–12 | **Enquête collaborative** façon Cluedo/escape game : **3 décors d'affaires tirés au sort** (le manoir, l'opéra, le train de nuit), et **chaque joueur incarne un rôle** (Détective, Voyante, Cryptographe…) avec ses **informations confidentielles** à partager de vive voix et parfois un pouvoir spécial. Six pistes verrouillées par des énigmes, carnet de déduction automatique, deux accusations. La solution et les infos privées **ne quittent jamais le téléphone-serveur**. |
| 🥸 **L'Imposteur** | 3–12 | Jeu de bluff : tout le monde reçoit le **même mot secret… sauf l'imposteur**, qui reçoit un mot voisin — et **personne ne connaît son propre camp** ! Un indice par joueur, puis un vote pour éliminer un suspect. Plus de 180 paires de mots, 1 à 3 imposteurs selon le nombre de joueurs, scores en série. Les mots **ne circulent jamais** entre téléphones. |
| 💡 **Quiz** | 1–12 | **Près de 1 100 questions fact-checkées** et **9 thèmes au choix** (tout mélangé, culture générale, cinéma, séries TV, musique, sport, histoire-géo, sciences, France) : 10 questions par partie, chacun répond en secret, +10 par bonne réponse et **+5 au plus rapide**. Les bonnes réponses ne circulent jamais avant la révélation. Record personnel en solo. |
| 🎯 **Le Plus Proche** | 2–12 | Jeu d'estimation : une question à réponse chiffrée, chacun propose un nombre **en secret** — le plus proche marque 3 points, la réponse exacte en vaut 5. Pas besoin de savoir, il suffit d'être moins loin que les autres ! |
| 🎴 **8 américain** | 2–5 | Le jeu de cartes façon Uno : même couleur ou même valeur, le **8 est joker**, le Valet saute, l'As change de sens, les **2 se cumulent**. Mains adverses **jamais transmises**. Points de manche en manche. |

## Impossible de tricher

- **Le téléphone qui crée la partie fait office de serveur** : c'est lui qui
  applique les règles, valide chaque coup, lance les dés, distribue les cartes
  et calcule tous les scores. Un joueur ne peut jamais « marquer n'importe
  quoi » : jouer hors de son tour, poser un mot inventé, compter un alignement
  inexistant… tout est refusé.
- **Les informations secrètes ne quittent jamais le serveur** : cartes de
  poker, grilles de bataille navale, mot du pendu, réponses du petit bac en
  cours d'écriture — les autres téléphones reçoivent une version expurgée.
- **Mots** : chaque mot posé (par un humain comme par l'IA) doit exister dans
  le dictionnaire intégré, sinon le coup est refusé avec le mot fautif affiché.
- **Petit Bac** : la seule part de jugement humain (une ville existe-t-elle ?)
  est tranchée par le vote des autres joueurs, comme dans la vraie vie — mais
  la lettre initiale, les doublons et le décompte sont automatiques.

## Jouer à plusieurs téléphones (sans Internet)

1. Connectez les téléphones au **même Wi-Fi**, ou activez le **partage de
   connexion** de l'un d'eux (aucun accès Internet requis, seul le réseau
   local compte).
2. Sur le téléphone hôte : choisissez un jeu → **« Créer une partie »** →
   **« Inviter un joueur »** → un QR code s'affiche.
3. Sur le téléphone invité : **scannez simplement le QR avec l'appareil
   photo** → l'application s'ouvre toute seule, prête à se connecter →
   entrez votre prénom → un QR de réponse s'affiche.
4. L'hôte scanne la réponse (bouton « Scanner la réponse ») : le joueur
   apparaît dans le salon. Répétez pour chaque joueur, puis « Commencer ».

En cas de coupure, le menu de l'hôte (« Inviter / reconnecter ») permet de
reconnecter un joueur en cours de partie avec le même prénom. Un
copier/coller du code texte remplace le scan si besoin.

La plupart des jeux se jouent aussi **sur un seul téléphone** (chacun son
tour, écran masqué entre les tours quand il y a des infos cachées), et Mots,
Pendu, Yams et Memory se jouent aussi **en solo**.

## Installation sur le téléphone (PWA)

1. Ouvrez l'application dans Chrome (Android) ou Safari (iPhone) :
   `https://<votre-compte>.github.io/Appli-scrabble/`
2. Menu du navigateur → **« Ajouter à l'écran d'accueil »**.
3. L'icône GGgames apparaît comme une vraie application ; après la première
   ouverture, tout fonctionne **sans réseau** (le dictionnaire est mis en
   cache automatiquement).

## Déploiement

Le workflow GitHub Actions (`.github/workflows/pages.yml`) publie le site sur
GitHub Pages à chaque push sur `main` (Settings → Pages → Source : GitHub
Actions, dépôt public requis). Essai local : `python3 -m http.server 8080`.

## Technique

- HTML/CSS/JavaScript pur, aucune dépendance à installer, aucune étape de build.
- `js/scrabble.js` — moteur du jeu de Mots (règles françaises officielles).
- `js/ai.js` — IA du jeu de Mots (recherche exhaustive des coups légaux).
- `js/games/` — un module par mini-jeu (`create / apply / redact / render`),
  branché sur un contrôleur générique (local et réseau).
- `js/net.js` — WebRTC en réseau local sans serveur STUN/TURN ; l'offre SDP
  est compressée et transportée dans une **URL encodée en QR code**, la
  réponse par QR ou copier/coller.
- `sw.js` — service worker : application 100 % hors ligne après la première visite.
- `tests/` — suites de tests automatisés (logique des 20 jeux, moteur de Mots,
  IA, interface via Playwright) ; GitHub Actions les rejoue à chaque push
  (`.github/workflows/tests.yml`).
- `data/mots.txt` — dictionnaire français (~311 000 mots, 2 à 15 lettres,
  sans accents), dérivé de
  [an-array-of-french-words](https://www.npmjs.com/package/an-array-of-french-words) (MIT).
- QR codes : [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator)
  (MIT) et [jsQR](https://github.com/cozmo/jsQR) (Apache-2.0).

## Limites connues

- Le mode plusieurs téléphones exige un réseau local commun qui autorise les
  connexions entre appareils (le partage de connexion d'un téléphone
  fonctionne très bien ; certains Wi-Fi publics isolent les clients).
- 4 joueurs maximum pour la plupart des jeux (2 pour Puissance 4, Morpion et
  Bataille navale, 5 pour le 8 américain) — et jusqu'à **12 joueurs** pour
  Le Manoir, L'Imposteur, le Quiz et Le Plus Proche.
- Petit Bac et Poker se jouent uniquement en réseau (informations secrètes
  simultanées).
