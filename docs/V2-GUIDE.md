# GGgames V2 — guide des chantiers de jeux

Le propriétaire veut une V2 **« digne d'un studio »** : moderne, animée, sonore, sans aucun bug, pour
jouer à deux, trois, entre amis. Aujourd'hui les jeux « font d'il y a dix ans ». Chaque jeu doit
donner envie : du relief, de la matière, du mouvement, du son, des retours à chaque geste, une fin de
partie qui se fête. **Aucun jeu n'est retiré.**

La coque (accueil, configuration, en-têtes, fenêtres, fin de partie, profil, réglages, reprise
des parties, bouton retour) est déjà refaite. Votre travail : **vos jeux**, de fond en comble.

---

## 1. Où vous avez le droit d'écrire

Chaque chantier ne modifie **que ses fichiers** (d'autres chantiers travaillent en parallèle ;
toute modification ailleurs créera des conflits) :

- `js/games/<vos jeux>.js` et leurs données (`fleches-data.js`, `motscourants.js`, `cartes.js`,
  `wallet.js` pour le casino, `js/scrabble.js` + `js/ai.js` + `data/mots.txt` pour Words) ;
- `css/games/<vos jeux>.css` (le CSS de votre jeu vit là, et seulement là) ;
- vos tests : `tests/*.js` et `tests/browser/*.js` qui portent sur vos jeux, et de nouveaux tests
  `tests/browser/test_v2_<chantier>.js` ;
- des ressources nouvelles éventuelles dans `assets/<jeu>/` (images SVG de préférence) : listez-les
  dans votre rapport, la coque les ajoutera au cache hors ligne.

**Interdit** (réservé à la coque) : `js/app.js` (sauf le chantier Words, pour ses seules fonctions
du jeu de lettres), `css/style.css`, `index.html`, `sw.js`, `js/games/registry.js`, `js/fx.js`,
`js/sfx.js`, `js/online.js`, `js/net.js`, `relay/`. Si vous avez besoin d'une évolution de la coque,
**décrivez-la dans votre rapport** (précisément : quoi, pourquoi) au lieu de la faire.

---

## 2. La charte visuelle V2

**Ambiance** : une salle de jeux de nuit. Le fond de l'application est un indigo profond avec des
aurores ; les surfaces d'interface sont en verre dépoli ; les objets de jeu (plateaux, cartes,
jetons, dés, grilles) sont **des objets physiques** : dégradés, reflets, ombres portées, épaisseur,
coins arrondis. Couleurs vives et saturées, jamais ternes. Typographie ronde.

Chaque jeu a ses deux couleurs d'accent, posées par la coque sur `<body data-jeu="<id>">` :
`var(--jeu-a)`, `var(--jeu-b)`, `var(--jeu-grad)` (dégradé 135°). Servez-vous-en.

### Variables disponibles (css/style.css)
- Fonds : `--bg-0` … `--bg-3` ; verre : `--glass`, `--glass-2`, `--glass-3`, `--stroke`, `--stroke-2`,
  surfaces opaques `--solid`, `--solid-2`, flou `--flou` (pour `backdrop-filter`).
- Texte : `--txt` (principal, clair), `--txt-2` (secondaire), `--txt-3` (discret).
- Couleurs : `--violet`, `--rose`, `--cyan`, `--vert`, `--or`, `--orange`, `--rouge` ;
  dégradés `--grad-primary`, `--grad-or`, `--grad-vert`, `--grad-rouge`, `--grad-cyan`.
- Formes : `--r-s` 12px, `--r` 18px, `--r-l` 26px ; ombres `--ombre-1/2/3`.
- Polices : `--f-titre` (Fredoka, titres, chiffres, boutons), `--f-texte` (Nunito).
- Courbes : `--ressort` (rebond), `--doux` (sortie douce).
- Anciennes variables encore définies (`--ink`, `--card`, `--accent`, `--felt`, `--tile`…) :
  **à abandonner** dans vos jeux ; `--ink` est une encre SOMBRE, illisible sur le fond de nuit.

### Composants prêts à l'emploi
- Boutons : `.btn` (verre), `.btn.primary` (violet-rose), `.btn.jeu` (aux couleurs du jeu),
  `.btn.succes` (vert), `.btn.or`, `.btn.danger`, tailles `.big` / `.small`, `.btn.link`,
  `.btn.action` (rangée d'actions). Pastilles de choix : `.count-btn` (+ `.active`).
- Textes : `.mini-msg`, `.big-msg`, `.hint`, `.waiting`, `.mini-center`, `.mini-actions`.
- Pastilles : `.mem-stats` > `.mem-stat` (+ `.turn`). Liste de niveaux : `.lvl-btns`.
- Lignes de résultat : `.final-line`. Panneau de verre : `.panneau`.

### Règles de qualité visuelle (non négociables)
- Tester à **412×780** (téléphone Android de l'utilisateur, navigateur intégré) **et** 360×640.
  Rien ne dépasse horizontalement ; l'action principale est visible sans défiler.
- Texte ≥ 14 px (≥ 12 px pour une étiquette secondaire), contraste lisible (AA) sur le fond de nuit.
- Cibles tactiles ≥ 44 px (≥ 40 px dans une grille dense si impossible autrement).
- La couleur ne porte jamais seule une information (ajouter forme, icône ou texte).
- Le zoom par pincement est désormais autorisé : `touch-action: manipulation` sur vos zones
  interactives pour éviter le double-tap-zoom.
- Pas de blanc crème « papier » en fond de page ; un plateau clair est permis s'il est un objet
  (cadre, ombre, relief).

---

## 3. Animations, sons, vibrations

Trois bibliothèques communes sont chargées avant les jeux. **À n'utiliser que dans `render` et ses
gestionnaires d'évènements** (jamais dans `create`, `apply`, `bot`, `redact` : ces fonctions pures
tournent aussi dans Node et chez l'hôte). Elles ne lèvent jamais d'exception et sont muettes dans
Node.

### `GG.fx` (js/fx.js)
Toutes renvoient une Promise ; une « cible » est un Element ou un point `{x, y}` (px écran).
- `confetti(opts)` — célébration ; `burst(cible, {count, colors, shape:'star'|'circle'|'spark'|'heart'})`
- `floatText(cible, '+12', {color, size})` — texte qui jaillit et monte (points gagnés…)
- `pop(el)`, `shake(el)`, `pulse(el)`, `bounceIn(el, delai)`, `fadeIn(el, delai)`,
  `slideIn(el, 'up'|'down'|'left'|'right', delai)`, `glow(el, couleur, ms)`
- `flyTo(depuis, vers, {html, duration, arc, scaleTo, rotate})` — un élément vole en arc
  (carte distribuée, jeton vers le pot, lettre vers le plateau, pièce vers le score)
- `countUp(el, de, a, ms)` — un nombre défile ; `stagger(els, {gap})` — entrée échelonnée
- `flip(els, change)` — animation FLIP autour d'un changement du DOM
- `shakeScreen(force)` ; `celebrate()` ; `reduced()` (vrai si l'utilisateur a réduit les animations)

### `GG.sfx.play(nom, {volume, pitch, level})` (js/sfx.js) — sons synthétisés, aucun fichier
`tap`, `select`, `toggle`, `back`, `open`, `close`, `pop`, `drop` (jeton qui tombe), `place`
(pose d'une lettre/pièce), `swap`, `deal` (carte distribuée), `flip`, `shuffle`, `chip`, `chips`,
`coin`, `dice`, `whoosh`, `tick`, `tock`, `reveal`, `correct`, `wrong`, `success`, `combo`
(`level` 1…8), `explosion`, `win`, `lose`, `draw`, `fanfare`, `notify`, `type` (touche de
clavier), `erase`, `hit`, `splash`, `sink`, `bell`.

### `GG.haptic(type)` — `light`, `medium`, `heavy`, `select`, `success`, `warning`, `error`

### Comment animer un rendu qui reconstruit tout (`el.innerHTML = …`)
Le moteur rappelle `render(el, ctx)` à chaque changement d'état : l'ancien DOM est remplacé.
Pour animer **ce qui vient de changer** (et seulement ça, une seule fois) :
- gardez sur l'élément un instantané du dernier état affiché (`el._v2 = {tour, grille…}`) ;
- après avoir écrit le nouveau HTML, comparez et déclenchez les effets sur les nouveaux nœuds
  (le jeton qui vient d'être posé tombe, la carte qui vient d'être retournée pivote, le score qui
  vient de monter défile, la ligne gagnante brille) ;
- une clé du type `gameId + ':' + numéroDeCoup` garantit qu'un effet ne se rejoue pas quand l'écran
  est rafraîchi pour une autre raison (message de discussion, reconnexion).
Les animations CSS d'entrée (`@keyframes`) posées sur des classes « nouveau » sont souvent le plus
simple et le plus fluide ; réservez `GG.fx` aux effets qui sortent du cadre (vol, particules,
texte flottant, confettis).

### Le son juste
Un son pour chaque geste important (poser, lancer, retourner, marquer, perdre une vie, gagner une
manche), jamais de cacophonie : un seul son par évènement, discret pour les gestes répétés.
La coque joue déjà `tap` sur ses propres boutons et la musique de fin de partie (`win`/`lose`/
`draw` + confettis) : ne la doublez pas dans votre écran de fin.

---

## 4. Contrat des modules (rappel + nouveautés V2)

Voir l'en-tête de `js/games/registry.js`. Nouveautés V2 :
- **`gagnants(state)`** (à implémenter) : indices des gagnants ; `[]` = égalité ; `'tous'` = victoire
  collective ; `null` = défaite collective. La coque s'en sert pour la célébration et les
  statistiques du profil (sinon elle devine d'après `scoreOf`).
- **`niveaux`** (optionnel) : par exemple `['facile', 'moyen', 'difficile']`. La coque affiche alors un
  choix de niveau dans « Jouer seul » et le transmet : `create(names, {dict, niveau})` et
  `bot(state, i, {dict, niveau})` (aussi dans `state.niveauIA`). Chaque niveau doit être
  **réellement** différent et le niveau « difficile » doit faire transpirer un bon joueur.
- **Reprise des parties** : en solo et « sur ce téléphone », la coque enregistre l'état après chaque
  coup et le recharge plus tard (`miniState` tel quel). Votre `render` doit donc **tout** retrouver à
  partir de l'état (rien d'indispensable ne doit vivre seulement dans le DOM ou dans une variable du
  module). Les minuteurs `res.timer` ne sont pas rejoués : un jeu minuté doit rester jouable après
  reprise (par exemple : échéance stockée dans l'état et vérifiée au rendu).
- Règles d'or inchangées : ne **jamais** rappeler `render` après `ctx.act` (le moteur le fait) ;
  `ctx.act` renvoie `false` si l'action n'est pas partie ; **anti double-appui** sur tout bouton qui
  fait avancer le jeu (un seul `act` par rendu, ou horodatage) ; un bouton qui apparaît à l'endroit
  exact d'un bouton précédent doit être « armé » après ~300 ms.

---

## 5. Sécurité (bloquant)

En ligne, **l'hôte peut être malveillant** : tout ce qui vient de l'état (prénoms, lettres, mots,
réponses, marques, messages…) passe par **`GG.esc()`** avant d'entrer dans du HTML, y compris dans
les attributs (`GG.esc` échappe maintenant aussi `"` et `'`). Un audit a trouvé deux injections :
`bac.js` (lettre du Petit Bac affichée brute) et `motus.js` (marques d'un essai). Vérifiez chaque
`innerHTML` de vos fichiers. N'utilisez jamais une valeur de l'état comme nom de classe ou de
propriété sans la filtrer par une liste blanche.

---

## 6. Code

- ES5 compatible (`var`, `function`), pas de modules ES, pas de dépendance externe, hors ligne.
- Commentaires en français.
- **Apostrophes** : dans une chaîne JS délimitée par `'`, n'écrivez JAMAIS d'apostrophe droite `'` :
  utilisez `’`. (Une apostrophe droite a déjà cassé toute l'application en production.)
- Garder les identifiants et classes dont dépendent les tests existants, ou mettre les tests à jour
  dans le même commit (jamais supprimer un test pour le faire passer).

---

## 7. Tests et vérification (avant de rendre votre travail)

Environnement :
```
cd /home/user/Appli-scrabble   # (ou votre copie de travail)
node tests/test_syntaxe.js
node tests/test_games.js ; node tests/test_newgames.js ; node tests/test_puzzle.js ;
node tests/test_casino.js ; node tests/test_bots.js ; node tests/test_engine.js ; node tests/test_ai.js
# navigateur (Playwright installé dans le bloc-notes) :
NODE_PATH=/tmp/claude-0/-home-user-Appli-scrabble/ef23aa1d-b7c5-5ae3-8e62-96862615fc27/scratchpad/node_modules \
CHROMIUM_PATH=/opt/pw-browsers/chromium node tests/browser/test_<…>.js
```
Serveur local : chaque chantier sert SA copie sur SON port (voir la consigne de votre mission).
Tous les tests navigateur lisent l'adresse dans la variable d'environnement `GG_URL`
(par défaut `http://localhost:8642/index.html`) : lancez-les avec
`GG_URL=http://localhost:<votre port>/index.html`, et faites de même dans vos nouveaux tests.
Playwright : `chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })`,
ne lancez jamais `playwright install`.

Exigences :
1. Tous les tests existants qui portent sur vos jeux passent (et `test_syntaxe.js`, `test_bots.js`).
2. Un nouveau test navigateur `tests/browser/test_v2_<chantier>.js` joue une vraie partie de chacun
   de vos jeux (solo et/ou sur ce téléphone), vérifie l'absence d'erreur JS, l'absence de
   débordement horizontal à 412 et 360 px, les animations clés (présence des éléments animés),
   et chaque bug corrigé (un contrôle par bug).
3. Des tests Node pour chaque correction de règle ou d'IA (mesures chiffrées pour les niveaux d'IA).
4. **Regardez vos captures** (outil Read sur les PNG) à chaque itération : c'est un travail visuel.
   Comparez avec les meilleures applis du genre ; recommencez tant que ce n'est pas beau.
5. Commitez dans votre copie de travail (message en français, clair), sans pousser.


## 8. Jeu en ligne V2 (coque — pour information)

- Le relais attend l'hôte 3 minutes après une coupure (`hote-absent` /
  `hote-revenu`) ; l'hôte reprend son code grâce à une clé secrète (`?k=`).
- Chaque invité reçoit un **jeton de siège** (`{t:'siege'}`) et le renvoie
  dans son `hello` : il retrouve sa place après un changement de réseau, un
  rechargement, ou avec un prénom mal retapé.
- L'hôte diffuse l'état en un seul envoi (`'*'`) quand le jeu n'a pas de
  `redact`, sinon un envoi par invité, **dédoublonné** et regroupé (25 ms).
  Un jeu n'a rien à faire pour en profiter : il suffit que `redact` soit
  juste (jamais de secret dans un état sans `redact`).
- Fin de partie : l'invité peut demander la revanche ; l'hôte relance ou
  change de jeu (`#btn-end-switch`) en gardant la bande ; un retardataire
  attend en salle et entre à la partie suivante. `gagnants(state)` doit donc
  être juste chez l'hôte ET chez l'invité (l'invité reçoit l'état expurgé).
- Tests : `tests/test_relais_v2.js`, `tests/browser/test_v2_reseau.js`,
  et `node tests/tout.js` pour tout vérifier.


## 9. Points d'accroche ajoutés pendant l'intégration (tous facultatifs)

- `delaiIA(state)` → millisecondes entre deux actions de l'IA (vitesse
  « rapide », suspense d'un dé…). Par défaut : 650 à 1 200 ms.
- `create(names, opts)` reçoit aussi `opts.mode` ('local' ou 'reseau'),
  `opts.solo`, `opts.bots` (indices des IA) et, à la revanche,
  `opts.premier` (le premier joueur tourne).
- Le rendu reçoit `ctx.dict`, `ctx.solo` et `ctx.bots`.
- `aReprendre(state)` → `false` : rien à reprendre (pas de carte
  « Reprendre »), par exemple sur la carte des mondes de Bonbons.
- `bilan(state)` → `{id, issue: 'gagne'|'perdu'}` : pour les jeux sans fin,
  chaque étape terminée compte une fois dans les statistiques du profil.
- Écran de fin : « 👀 Voir le jeu » laisse admirer le plateau final.
