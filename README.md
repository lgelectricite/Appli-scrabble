# GGWORDS 🁢

**GGWORDS** est un jeu de lettres façon Scrabble, de **2 à 4 joueurs**,
**entièrement hors ligne**, pensé pour les mobiles. Aucun compte, aucun serveur
externe, aucune connexion Internet nécessaire pendant la partie.

## Deux façons de jouer

### 📱 Sur un seul téléphone (2 à 4 joueurs)
Chacun joue à son tour en se passant le téléphone. Un écran intermédiaire
cache le chevalet du joueur suivant.

### 📶 Sur plusieurs téléphones, sans Internet (2 à 4 joueurs)
**Le téléphone qui crée la partie sert de serveur** : il détient l'état de la
partie, valide tous les coups et synchronise les autres téléphones. Les autres
s'y connectent **directement en Wi-Fi local** (WebRTC), sans passer par
Internet :

1. Connectez tous les téléphones au **même Wi-Fi**, ou activez le **partage de
   connexion** (point d'accès) sur l'un des deux et connectez-y les autres —
   aucun accès Internet n'est requis, seul le réseau local compte.
2. Téléphone hôte : **« Créer une partie »** → le salon s'affiche →
   **« Inviter un joueur »** → un QR code d'invitation apparaît.
3. Téléphone invité : **« Rejoindre une partie »** → scannez le QR de l'hôte →
   un QR de réponse s'affiche.
4. Téléphone hôte : **« Scanner la réponse »** → scannez le QR de l'invité →
   le joueur apparaît dans le salon.
5. Répétez les étapes 2 à 4 pour chaque joueur supplémentaire (jusqu'à
   3 invités), puis **« Commencer la partie »**.
6. Chacun voit le plateau en direct et ne voit que ses propres lettres.

Si le scan pose problème (caméra refusée…), chaque écran propose un **code
texte** à copier/coller par n'importe quel moyen local. En cas de coupure, le
menu de l'hôte (« Inviter / reconnecter un joueur ») permet de reconnecter un
joueur en cours de partie avec le même prénom.

## Installation sur le téléphone (PWA)

L'application est une *Progressive Web App* : une fois ouverte une première
fois, elle est mise en cache et fonctionne **sans réseau**.

1. Publiez l'application (voir « Déploiement » ci-dessous) et ouvrez son
   adresse dans Chrome (Android) ou Safari (iPhone).
2. Menu du navigateur → **« Ajouter à l'écran d'accueil »** / **« Installer
   l'application »**.
3. L'icône GGWORDS apparaît sur l'écran d'accueil ; l'application s'ouvre
   ensuite même en mode avion (le mode plusieurs téléphones nécessite
   simplement un réseau local commun, par exemple un partage de connexion).

## Déploiement

Le dépôt contient un workflow GitHub Actions (`.github/workflows/pages.yml`)
qui publie automatiquement l'application sur **GitHub Pages** à chaque push
sur `main` :

1. Fusionnez cette branche dans `main` (ou poussez sur `main`).
2. Si besoin, activez GitHub Pages : *Settings → Pages → Source : GitHub
   Actions*.
3. L'application est servie sur `https://<votre-compte>.github.io/Appli-scrabble/`.

> Le HTTPS fourni par GitHub Pages est indispensable : la caméra (scan des QR
> codes) et l'installation PWA l'exigent.

### Essai en local

```bash
python3 -m http.server 8080
# puis ouvrir http://localhost:8080
```

## Règles implémentées (Scrabble français)

- Plateau officiel 15×15 avec cases **mot compte double/triple** (MD/MT) et
  **lettre compte double/triple** (LD/LT).
- Distribution française officielle de **102 jetons** (dont 2 jokers) et
  valeurs françaises des lettres.
- Premier mot obligatoirement sur l'étoile centrale (compte double).
- Mots alignés, sans trou, raccordés aux lettres déjà posées ; tous les mots
  croisés formés sont comptés.
- Les cases bonus ne comptent que pour les lettres nouvellement posées.
- **7 lettres posées d'un coup** : +50 points.
- Joker : choix de la lettre à la pose, vaut 0 point.
- Échange de lettres (si le sac contient au moins 7 jetons), passe de tour.
- Fin de partie : un joueur pose sa dernière lettre sac vide (il gagne les
  points des lettres restantes des autres joueurs, qui les déduisent), ou six
  tours consécutifs sans point (chacun déduit ses lettres restantes).
- Aperçu du score en direct avant de valider, historique des coups, mélange
  du chevalet.

**Pas de dictionnaire intégré** : comme dans une partie libre, les joueurs
valident les mots entre eux (l'arbitre officiel, l'ODS, n'est pas librement
redistribuable).

## Technique

- HTML/CSS/JavaScript pur, sans build ni dépendance à installer.
- `js/scrabble.js` — moteur de jeu (règles, scores, fins de partie), générique
  pour 2 à 4 joueurs.
- `js/net.js` — connexion WebRTC locale (sans serveur STUN/TURN) ; l'offre et
  la réponse SDP sont compressées (`CompressionStream`) puis échangées par QR
  code ou copier/coller. L'hôte maintient une connexion par invité et fait
  autorité sur l'état de la partie.
- `js/app.js` — interface (écrans, salon, plateau, chevalet, synchronisation).
- `sw.js` — service worker : l'application complète est mise en cache pour un
  usage 100 % hors ligne.
- Bibliothèques embarquées : [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator)
  (MIT) pour dessiner les QR codes et [jsQR](https://github.com/cozmo/jsQR)
  (Apache-2.0) pour les lire avec la caméra.

## Limites connues

- Le mode plusieurs téléphones exige que tous les appareils soient sur le même
  réseau local et que celui-ci autorise les connexions entre appareils (le
  partage de connexion d'un téléphone fonctionne très bien ; certains Wi-Fi
  publics isolent les clients).
- 4 joueurs maximum (hôte + 3 invités).
