/*
 * GGWORDS — moteur de l'adversaire IA (V2).
 *
 * Générateur de coups d'Appel et Jacobson sur un arbre des préfixes
 * (« trie ») compact en tableaux typés : TOUS les coups légaux, mots de 2 à
 * 15 lettres, jokers compris, mots croisés vérifiés, en quelques dizaines de
 * millisecondes. Chaque coup est ensuite évalué comme le ferait un joueur de
 * club : points marqués + valeur du reliquat (les lettres gardées), gestion
 * des jokers, fin de partie, échanges stratégiques.
 *
 * Quatre niveaux réellement différents (voir NIVEAUX) : vocabulaire (mots
 * courants ou tout le dictionnaire), « vision » (part des coups que l'IA
 * remarque), précision, prise en compte du reliquat, échanges, défense.
 * L'IA ne joue JAMAIS un mot de la liste noire (injures, mots vulgaires),
 * même si un humain peut les poser.
 *
 * Fonctionne dans le navigateur (window.AI), dans un Web Worker
 * (js/ai-worker.js) et sous Node (tests). ES5, aucune dépendance.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AI = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SIZE = 15;
  var NB = SIZE * SIZE;
  var ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  var JOKER = 26;           // indice du joker dans les compteurs de chevalet
  var TOUT = (1 << 26) - 1; // masque « toutes les lettres »

  /* Valeurs des lettres (règles françaises) — dupliquées ici pour rester
     autonome dans le Web Worker ; vérifiées contre Scrabble.DISTRIBUTION
     par les tests. */
  var VALEUR = [1, 3, 3, 2, 1, 4, 2, 4, 1, 8, 10, 1, 2, 1, 1, 3, 8, 1, 1, 1, 1, 4, 10, 10, 10, 10];
  var NOMBRE = [9, 2, 2, 3, 15, 2, 2, 2, 8, 1, 1, 5, 3, 6, 6, 2, 1, 6, 6, 6, 6, 2, 1, 1, 1, 1];
  var VOYELLE = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0]; // Y compté voyelle

  /* ================================================================
   * Liste noire : l'IA ne joue jamais d'injure ni de mot vulgaire.
   * ================================================================ */
  var MOTIFS_INTERDITS = [
    // injures racistes, antisémites, xénophobes
    'YOUPINS?', 'YOUPINES?', 'YOUPINERIES?', 'YOUTRES?', 'BICOTS?', 'BOUGNOULES?', 'BOUGNOULS?',
    'NEGRES?', 'NEGRESSES?', 'NEGRILLONS?', 'NEGRILLONNES?', 'NEGROS?', 'CHINETOQUES?', 'NIAKOUES?',
    'BOCHES?', 'RITALS?', 'POLA[C]?KS?', 'CROUILLES?', 'CROUILLATS?', 'ARBIS?', 'FATMAS?',
    'ROMANICHELS?', 'ROMANICHELLES?', 'JUIVERIES?', 'MOUKERES?', 'BAMBOULAS?', 'NIAKOUAS?',
    // injures homophobes
    'GOUINES?', 'PEDES?', 'TANTOUZES?', 'TANTOUSES?', 'TARLOUZES?', 'FIOTTES?', 'LOPES?', 'LOPETTES?',
    // injures et insultes
    'SALOPES?', 'SALOPARDS?', 'SALAUDS?', 'CONNASSES?', 'CONASSES?', 'CONNARDS?', 'CONARDS?',
    'CONNARDES?', 'CONS?', 'CONNES?', 'CONNERIES?', 'PUTES?', 'PUTAINS?', 'PUTASSES?',
    'PUTASSIERS?', 'PUTASSIERES?', 'POUFIASSES?', 'POUFFIASSES?', 'PETASSES?', 'GROGNASSES?',
    'ENFOIRES?', 'ENFOIREES?', 'BATARDS?', 'BATARDES?', 'MONGOLIENS?', 'MONGOLIENNES?',
    'GOGOLS?', 'GOGOLES?', 'PECORES?', 'GARCES?', 'COUILLONS?', 'COUILLONNES?',
    // mots vulgaires (sexe, scatologie)
    'MERDES?', 'MERDEUX', 'MERDEUSES?', 'MERDIERS?', 'MERDIQUES?', 'MERDOY[A-Z]*', 'MERDOI[A-Z]*',
    'EMMERD[A-Z]*', 'CHIER', 'CHIE', 'CHIES', 'CHIENT', 'CHIAI[A-Z]*', 'CHIER[A-Z]+', 'CHIANTS?',
    'CHIANTES?', 'CHIASSES?', 'CHIOTTES?', 'CHIEURS?', 'CHIEUSES?',
    'ENCUL[A-Z]*', 'NIQU(E|ES|ENT|ER|EZ|ONS|AIT|AIS|AIENT|A|ERA[A-Z]*|EE|EES|ANT)',
    'BRANLETTES?', 'BRANLEURS?', 'BRANLEUSES?', 'BRANLAGES?', 'BITES?', 'BITTES?',
    'COUILLES?', 'COUILLONNADES?', 'COUILLONN[A-Z]*', 'ZOBS?', 'PINES?', 'QUEUTARDS?', 'NICHONS?',
    'ROUPETTES?', 'ROUSTONS?', 'BURNES?', 'CHIBRES?', 'CULS?', 'FOUTRES?', 'FOUTREMENT',
    'FOUTRIQUETS?', 'FOUTUS?', 'FOUTUES?', 'FOUTOIRS?', 'BORDELS?', 'BORDELIQUES?',
    'PISSE', 'PISSES', 'PISSER', 'PISSENT', 'PISSEUR', 'PISSEURS', 'PISSEUSES?', 'PISSOTIERES?',
    'PISSOIRS?', 'PISSAT', 'PISSATS', 'PISSEUX', 'PISSOUS?', 'BAISEURS?', 'BAISEUSES?',
    'TROUDUCS?', 'SODOMISER', 'PORNOS?', 'CUNNI[A-Z]*', 'FELLATION[A-Z]*', 'PARTOUZ[A-Z]*',
    'SALOPER', 'SALOPERIES?', 'GOUDOUS?'
  ];
  var RE_INTERDIT = new RegExp('^(' + MOTIFS_INTERDITS.join('|') + ')$');
  function estInterdit(mot) { return RE_INTERDIT.test(mot); }

  /* ================================================================
   * Dictionnaire
   * ================================================================ */

  /*
   * buildDict(text) : le Set des mots (validation, rapide). L'arbre des
   * préfixes nécessaire à la recherche des coups est construit à la
   * demande (prepare), une seule fois — dans le Web Worker de préférence.
   */
  function buildDict(text) {
    var set = new Set();
    var mots = String(text || '').split('\n');
    for (var i = 0; i < mots.length; i++) {
      var w = mots[i].trim();
      if (w.length >= 2 && w.charCodeAt(0) !== 35) set.add(w); // 35 = '#'
    }
    return { set: set, trie: null, niveau: null };
  }

  /* Mots courants : lignes « 1MOT » (très courant) ou « 2MOT » (courant). */
  function chargeCourants(dict, text) {
    var niveau = new Map();
    var lignes = String(text || '').split('\n');
    for (var i = 0; i < lignes.length; i++) {
      var l = lignes[i].trim();
      var n = l.charCodeAt(0) - 48;
      if ((n === 1 || n === 2) && l.length > 2) niveau.set(l.slice(1), n);
    }
    dict.niveau = niveau.size ? niveau : null;
    return dict;
  }

  /*
   * Arbre des préfixes compact : pour chaque nœud, son premier enfant, son
   * frère suivant, sa lettre, s'il termine un mot, et le masque des lettres
   * de ses enfants (test d'existence en une opération).
   */
  function construireTrie(set) {
    var mots = [];
    set.forEach(function (w) { if (/^[A-Z]{2,15}$/.test(w)) mots.push(w); });
    mots.sort();
    var cap = 1 << 16;
    var fils = new Int32Array(cap), frere = new Int32Array(cap), dernier = new Int32Array(cap);
    var lettre = new Uint8Array(cap), fin = new Uint8Array(cap), masque = new Int32Array(cap);
    var n = 1;
    fils[0] = -1; frere[0] = -1; dernier[0] = -1;
    function agrandir() {
      var c2 = cap * 2;
      function g(a, T) { var b = new T(c2); b.set(a); return b; }
      fils = g(fils, Int32Array); frere = g(frere, Int32Array); dernier = g(dernier, Int32Array);
      lettre = g(lettre, Uint8Array); fin = g(fin, Uint8Array); masque = g(masque, Int32Array);
      cap = c2;
    }
    var chemin = [0]; // nœuds du mot précédent
    var prec = '';
    for (var i = 0; i < mots.length; i++) {
      var w = mots[i];
      var k = 0;
      while (k < w.length && k < prec.length && w.charCodeAt(k) === prec.charCodeAt(k)) k++;
      chemin.length = k + 1;
      var noeud = chemin[k];
      for (var j = k; j < w.length; j++) {
        if (n >= cap) agrandir();
        var c = w.charCodeAt(j) - 65;
        var nv = n++;
        fils[nv] = -1; frere[nv] = -1; dernier[nv] = -1; lettre[nv] = c; fin[nv] = 0; masque[nv] = 0;
        // les mots sont triés : le nouvel enfant se range en fin de liste
        if (fils[noeud] === -1) fils[noeud] = nv; else frere[dernier[noeud]] = nv;
        dernier[noeud] = nv;
        masque[noeud] |= (1 << c);
        noeud = nv;
        chemin.push(nv);
      }
      fin[noeud] = 1;
      prec = w;
    }
    return { fils: fils, frere: frere, lettre: lettre, fin: fin, masque: masque, noeuds: n };
  }

  function prepare(dict) {
    if (!dict.trie) dict.trie = construireTrie(dict.set);
    return dict;
  }

  /* Enfant de `n` portant la lettre c (0-25), ou -1. */
  function enfant(T, n, c) {
    if (!(T.masque[n] & (1 << c))) return -1;
    var e = T.fils[n];
    while (e !== -1 && T.lettre[e] !== c) e = T.frere[e];
    return e;
  }

  /* ================================================================
   * Plateau : cases bonus (mêmes que Scrabble.PREMIUM)
   * ================================================================ */
  var MULT_L = new Uint8Array(NB), MULT_M = new Uint8Array(NB);
  (function () {
    for (var i = 0; i < NB; i++) { MULT_L[i] = 1; MULT_M[i] = 1; }
    function pose(coords, l, m) {
      coords.forEach(function (rc) { var i = rc[0] * SIZE + rc[1]; MULT_L[i] = l; MULT_M[i] = m; });
    }
    pose([[0, 0], [0, 7], [0, 14], [7, 0], [7, 14], [14, 0], [14, 7], [14, 14]], 1, 3);
    var md = [[7, 7]];
    for (var i = 1; i <= 4; i++) md.push([i, i], [i, 14 - i], [14 - i, i], [14 - i, 14 - i]);
    pose(md, 1, 2);
    pose([[1, 5], [1, 9], [5, 1], [5, 5], [5, 9], [5, 13], [9, 1], [9, 5], [9, 9], [9, 13], [13, 5], [13, 9]], 3, 1);
    pose([[0, 3], [0, 11], [2, 6], [2, 8], [3, 0], [3, 7], [3, 14], [6, 2], [6, 6], [6, 8], [6, 12],
      [7, 3], [7, 11], [8, 2], [8, 6], [8, 8], [8, 12], [11, 0], [11, 7], [11, 14], [12, 6], [12, 8],
      [14, 3], [14, 11]], 2, 1);
  })();

  /* ================================================================
   * Génération de tous les coups (Appel & Jacobson)
   * ================================================================ */

  /*
   * Plateau en tableaux : lettre (0-25, -1 si vide) et valeur de chaque case
   * (0 pour un joker posé). `trans` = lecture transposée (colonnes en lignes).
   */
  function lirePlateau(board, trans) {
    var L = new Int8Array(NB), V = new Int8Array(NB);
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var cell = board[trans ? c * SIZE + r : r * SIZE + c];
        var i = r * SIZE + c;
        if (cell && typeof cell.letter === 'string' && /^[A-Z]$/.test(cell.letter)) {
          L[i] = cell.letter.charCodeAt(0) - 65;
          V[i] = cell.blank ? 0 : VALEUR[L[i]];
        } else {
          L[i] = -1; V[i] = 0;
        }
      }
    }
    return { L: L, V: V };
  }

  /*
   * Contraintes croisées d'une case vide (r, c) pour un mot horizontal :
   * masque des lettres qui forment un mot vertical valide, et points des
   * lettres voisines de ce mot vertical (-1 : aucune lettre voisine).
   */
  function croisement(T, P, r, c, sortie) {
    var L = P.L, V = P.V;
    var h = r, b = r;
    while (h > 0 && L[(h - 1) * SIZE + c] >= 0) h--;
    while (b < SIZE - 1 && L[(b + 1) * SIZE + c] >= 0) b++;
    if (h === r && b === r) { sortie.masque = TOUT; sortie.points = -1; sortie.pre = ''; sortie.suf = ''; return; }
    var pts = 0, n = 0, k, pre = '', suf = '';
    for (k = h; k < r; k++) {
      pts += V[k * SIZE + c];
      pre += ALPHABET[L[k * SIZE + c]];
      if (n !== -1) n = enfant(T, n, L[k * SIZE + c]);
    }
    for (k = r + 1; k <= b; k++) { pts += V[k * SIZE + c]; suf += ALPHABET[L[k * SIZE + c]]; }
    var m = 0;
    if (n !== -1) {
      var e = T.fils[n];
      while (e !== -1) {
        var x = e, ok = true;
        for (k = r + 1; k <= b && ok; k++) {
          x = enfant(T, x, L[k * SIZE + c]);
          if (x === -1) ok = false;
        }
        if (ok && T.fin[x]) m |= (1 << T.lettre[e]);
        e = T.frere[e];
      }
    }
    sortie.masque = m; sortie.points = pts; sortie.pre = pre; sortie.suf = suf;
  }

  function compteChevalet(rack) {
    var cpt = new Int8Array(27);
    for (var i = 0; i < rack.length; i++) {
      var l = rack[i];
      if (l === '?') cpt[JOKER]++;
      else if (typeof l === 'string' && l.length === 1) {
        var c = l.charCodeAt(0) - 65;
        if (c >= 0 && c < 26) cpt[c]++;
      }
    }
    return cpt;
  }

  /*
   * Tous les coups légaux du joueur. Renvoie un tableau de coups :
   *   { placements: [{index, letter, blank}], total, mots: ['MOT', …] (mot
   *     principal d'abord, puis les mots croisés), principal, nbPoses,
   *     nbReste (lettres gardées), vr (valeur de ces lettres gardées) }
   * Un joker n'est essayé que pour une lettre absente du chevalet.
   * budgetMs : garde-fou de temps (défaut 8 s, jamais atteint en pratique).
   */
  function findAllMoves(S, state, playerIdx, dict, budgetMs) {
    prepare(dict);
    var T = dict.trie;
    var rack = state.players[playerIdx].rack;
    var cpt = compteChevalet(rack);
    var nbTuiles = 0;
    for (var q = 0; q < 27; q++) nbTuiles += cpt[q];
    var coups = [];
    if (!nbTuiles) return coups;
    var echeance = Date.now() + (budgetMs || 8000);
    var premier = !state.board.some(function (x) { return !!x; });
    var sacVide = state.bag.length === 0;
    var vus = {};

    for (var sens = 0; sens < 2; sens++) {
      if (premier && sens === 1) break; // plateau vide : l'horizontal suffit (symétrie)
      var trans = sens === 1;
      var P = lirePlateau(state.board, trans);
      var L = P.L, V = P.V;
      var tmp = {};
      for (var r = 0; r < SIZE; r++) {
        if (Date.now() > echeance) break;
        // ancres et contraintes de la ligne
        var ancre = new Uint8Array(SIZE), masque = new Int32Array(SIZE), cpts = new Int16Array(SIZE);
        var pres = [], sufs = [];
        var aUneAncre = false;
        for (var c = 0; c < SIZE; c++) {
          var i = r * SIZE + c;
          pres.push(''); sufs.push('');
          if (L[i] >= 0) { masque[c] = 0; cpts[c] = -1; continue; }
          if (premier) {
            ancre[c] = (r === 7 && c === 7) ? 1 : 0;
          } else {
            ancre[c] = ((r > 0 && L[i - SIZE] >= 0) || (r < SIZE - 1 && L[i + SIZE] >= 0) ||
              (c > 0 && L[i - 1] >= 0) || (c < SIZE - 1 && L[i + 1] >= 0)) ? 1 : 0;
          }
          if (ancre[c]) aUneAncre = true;
          croisement(T, P, r, c, tmp);
          masque[c] = tmp.masque; cpts[c] = tmp.points; pres[c] = tmp.pre; sufs[c] = tmp.suf;
        }
        if (!aUneAncre) continue;
        genLigne(r, L, V, ancre, masque, cpts, pres, sufs, trans);
      }
    }

    // ---- Appel & Jacobson sur une ligne ----
    function genLigne(r, L, V, ancre, masque, cpts, pres, sufs, trans) {
      var pose = new Int8Array(SIZE), joker = new Uint8Array(SIZE);
      for (var k = 0; k < SIZE; k++) pose[k] = -1;
      var nbPoses = 0;
      var a, anc;

      function enregistre(debut, finExcl) {
        if (nbPoses === 0) return;
        // points : mot principal + mots croisés + bonus des 7 lettres
        var somme = 0, mult = 1, croises = 0;
        var mot = '', mots = [];
        for (var k = debut; k < finExcl; k++) {
          var i = r * SIZE + k;
          if (pose[k] >= 0) {
            var v = joker[k] ? 0 : VALEUR[pose[k]];
            var lm = MULT_L[trans ? k * SIZE + r : i], wm = MULT_M[trans ? k * SIZE + r : i];
            somme += v * lm;
            mult *= wm;
            mot += ALPHABET[pose[k]];
            if (cpts[k] >= 0) {
              croises += (cpts[k] + v * lm) * wm;
              mots.push(pres[k] + ALPHABET[pose[k]] + sufs[k]);
            }
          } else {
            somme += V[i];
            mot += ALPHABET[L[i]];
          }
        }
        var total = somme * mult + croises + (nbPoses === 7 ? 50 : 0);
        var placements = [];
        for (k = debut; k < finExcl; k++) {
          if (pose[k] < 0) continue;
          var idx = trans ? k * SIZE + r : r * SIZE + k;
          placements.push({ index: idx, letter: ALPHABET[pose[k]], blank: !!joker[k] });
        }
        // un coup d'une seule lettre peut être trouvé dans les deux sens
        if (nbPoses === 1) {
          var cle = placements[0].index + placements[0].letter + (placements[0].blank ? '*' : '');
          if (vus[cle]) return;
          vus[cle] = 1;
        }
        mots.unshift(mot);
        var nbReste = 0;
        for (k = 0; k < 27; k++) nbReste += cpt[k];
        coups.push({
          placements: placements, total: total, mots: mots, principal: mot, nbPoses: nbPoses,
          nbReste: nbReste, vr: valeurReliquat(cpt, sacVide)
        });
      }

      function etendDroite(n, k, debut) {
        if (k >= SIZE || L[r * SIZE + k] < 0) {
          if (k > anc && T.fin[n] && k - debut >= 2) enregistre(debut, k);
          if (k >= SIZE) return;
          var permis = T.masque[n] & masque[k];
          if (!permis) return;
          var e = T.fils[n];
          while (e !== -1) {
            var c = T.lettre[e];
            if (permis & (1 << c)) {
              if (cpt[c] > 0) {
                cpt[c]--; pose[k] = c; joker[k] = 0; nbPoses++;
                etendDroite(e, k + 1, debut);
                nbPoses--; pose[k] = -1; cpt[c]++;
              }
              // joker : seulement si la vraie lettre manque (élagage : garder le
              // joker et poser la lettre réelle vaut toujours au moins autant)
              if (cpt[JOKER] > 0 && cpt[c] === 0) {
                cpt[JOKER]--; pose[k] = c; joker[k] = 1; nbPoses++;
                etendDroite(e, k + 1, debut);
                nbPoses--; pose[k] = -1; joker[k] = 0; cpt[JOKER]++;
              }
            }
            e = T.frere[e];
          }
        } else {
          var x = enfant(T, n, L[r * SIZE + k]);
          if (x !== -1) etendDroite(x, k + 1, debut);
        }
      }

      /* Partie gauche posée depuis le chevalet sur les cases libres (sans
         contrainte croisée : ce ne sont pas des ancres) juste avant l'ancre.
         L'arbre se lit de gauche à droite : chaque nouvelle lettre s'ajoute
         à droite du préfixe, qui se décale d'une case vers la gauche. */
      function prefixes(n, profondeur, limite) {
        // les `profondeur` lettres déjà choisies occupent anc-profondeur .. anc-1
        etendDroite(n, anc, anc - profondeur);
        if (profondeur >= limite) return;
        var e = T.fils[n];
        while (e !== -1) {
          var c = T.lettre[e];
          if (cpt[c] > 0 || cpt[JOKER] > 0) {
            // décale les lettres déjà posées d'une case vers la gauche
            for (var k = anc - profondeur - 1; k < anc - 1; k++) { pose[k] = pose[k + 1]; joker[k] = joker[k + 1]; }
            if (cpt[c] > 0) {
              cpt[c]--; pose[anc - 1] = c; joker[anc - 1] = 0; nbPoses++;
              prefixes(e, profondeur + 1, limite);
              nbPoses--; cpt[c]++;
            }
            if (cpt[JOKER] > 0 && cpt[c] === 0) {
              cpt[JOKER]--; pose[anc - 1] = c; joker[anc - 1] = 1; nbPoses++;
              prefixes(e, profondeur + 1, limite);
              nbPoses--; cpt[JOKER]++;
            }
            // remet les lettres à leur place
            for (k = anc - 1; k > anc - profondeur - 1; k--) { pose[k] = pose[k - 1]; joker[k] = joker[k - 1]; }
            pose[anc - profondeur - 1] = -1; joker[anc - profondeur - 1] = 0;
          }
          e = T.frere[e];
        }
      }

      for (a = 0; a < SIZE; a++) {
        if (!ancre[a]) continue;
        anc = a;
        if (a > 0 && L[r * SIZE + a - 1] >= 0) {
          // à gauche : des lettres déjà sur le plateau
          var s = a - 1;
          while (s > 0 && L[r * SIZE + s - 1] >= 0) s--;
          var n = 0;
          for (var k2 = s; k2 < a && n !== -1; k2++) n = enfant(T, n, L[r * SIZE + k2]);
          if (n !== -1) etendDroite(n, a, s);
        } else {
          var limite = 0, k3 = a - 1;
          while (k3 >= 0 && L[r * SIZE + k3] < 0 && !ancre[k3]) { limite++; k3--; }
          limite = Math.min(limite, 7);
          prefixes(0, 0, limite);
        }
      }
    }

    return coups;
  }

  /* ================================================================
   * Évaluation : valeur du reliquat (lettres gardées)
   * ================================================================ */
  // valeur propre de chaque lettre gardée (A…Z), joker à part
  var VAL_RELIQUAT = [1.5, -2, 0, 0, 3.5, -2.5, -2, -2.5, 1, -3, -6, 1, 0.5, 1.5, -0.5, -0.5, -7, 2.5,
    7.5, 1.5, -1, -4, -7, 2, -3, 1.5];
  var VAL_JOKER = 25;

  function valeurReliquat(cpt, sacVide) {
    var total = 0, v = 0, c = 0, n = 0, k;
    if (sacVide) {
      // plus de pioche : chaque lettre gardée risque d'être comptée contre nous
      for (k = 0; k < 26; k++) total -= cpt[k] * VALEUR[k] * 1.5;
      return total - cpt[JOKER] * 2;
    }
    for (k = 0; k < 26; k++) {
      var x = cpt[k];
      if (!x) continue;
      n += x;
      if (VOYELLE[k]) v += x; else c += x;
      total += VAL_RELIQUAT[k];
      if (x > 1) {
        // doublons : pénalisés (sauf un peu pour E et S)
        var pen = (k === 4) ? 1.5 : (k === 18 ? 2 : (VOYELLE[k] ? 4 : 3.5));
        total += VAL_RELIQUAT[k] * 0.3 * (x - 1) - pen * (x - 1) * (x - 1);
      }
    }
    total += cpt[JOKER] * VAL_JOKER;
    n += cpt[JOKER];
    // équilibre voyelles / consonnes
    if (v + c >= 2) {
      var ecart = Math.abs(v - c);
      if (ecart > 1) total -= (ecart - 1) * (ecart - 1) * 1.8;
      if (v === 0 && c >= 3) total -= 4;
      if (c === 0 && v >= 3) total -= 4;
    }
    // Q sans U
    if (cpt[16] > 0 && cpt[20] === 0) total -= 5;
    // petites synergies utiles en français
    if (cpt[4] && cpt[17]) total += 1.5;  // ER
    if (cpt[4] && cpt[18]) total += 1.5;  // ES
    if (cpt[4] && cpt[25]) total += 1;    // EZ
    if (cpt[13] && cpt[19]) total += 0.5; // NT
    return total;
  }

  /* Lettres encore invisibles pour le joueur (sac + chevalets adverses). */
  function invisibles(state, playerIdx) {
    var reste = NOMBRE.slice(0);
    var jokers = 2;
    state.board.forEach(function (cell) {
      if (!cell) return;
      if (cell.blank) jokers--; else reste[cell.letter.charCodeAt(0) - 65]--;
    });
    state.players[playerIdx].rack.forEach(function (l) {
      if (l === '?') jokers--; else reste[l.charCodeAt(0) - 65]--;
    });
    var somme = 0;
    for (var k = 0; k < 26; k++) somme += Math.max(0, reste[k]) * VALEUR[k];
    return { valeur: somme, jokers: Math.max(0, jokers) };
  }

  /* Cases « mot compte triple » encore libres (calculées une fois par décision). */
  function triplesLibres(state) {
    var l = [];
    for (var i = 0; i < NB; i++) if (MULT_M[i] === 3 && !state.board[i]) l.push(i);
    return l;
  }

  /* Pénalité de défense : ouvrir une case « mot compte triple » à l'adversaire. */
  function ouvreTriple(libres, placements) {
    var pen = 0;
    for (var t = 0; t < libres.length; t++) {
      var i = libres[t], r = Math.floor(i / SIZE), c = i % SIZE, pris = false;
      for (var q = 0; q < placements.length; q++) if (placements[q].index === i) pris = true;
      if (pris) continue;
      // une lettre posée sur la même ligne ou colonne, à 1..3 cases, sans obstacle
      for (var p = 0; p < placements.length; p++) {
        var pi = placements[p].index, pr = Math.floor(pi / SIZE), pc = pi % SIZE;
        var d = pr === r ? Math.abs(pc - c) : (pc === c ? Math.abs(pr - r) : 99);
        if (d >= 1 && d <= 3) { pen += (d === 1 ? 7 : 4); break; }
      }
    }
    return pen;
  }

  /* ================================================================
   * Niveaux
   * ================================================================ */
  /*
   * mots      : 1 = très courants, 2 = courants, 0 = tout le dictionnaire
   * vision    : part des coups que l'IA « remarque » (0-1)
   * cible     : [min, max] — l'IA facile vise un coup « qui marche », pas le meilleur
   * reliquat  : poids de la valeur des lettres gardées (0 = ignore)
   * bruit     : imprécision (écart type, en points)
   * echange   : échange stratégique (marge exigée, en points ; null = jamais par choix)
   * defense   : poids de la défense (cases mot compte triple ouvertes)
   * maxLettres: nombre maximal de lettres posées
   */
  var NIVEAUX = {
    facile: { mots: 1, vision: 0.3, cible: [4, 13], reliquat: 0, bruit: 3, echange: null, defense: 0, maxLettres: 4 },
    moyen: { mots: 2, vision: 0.35, cible: null, reliquat: 0.2, bruit: 8, echange: 12, defense: 0, maxLettres: 6, plafond: 24 },
    difficile: { mots: 0, vision: 0.16, cible: null, reliquat: 0.5, bruit: 6, echange: 5, defense: 0.5, maxLettres: 7 },
    expert: { mots: 0, vision: 1, cible: null, reliquat: 1, bruit: 0, echange: 0, defense: 1, maxLettres: 7 }
  };

  /* Heuristique quand la liste des mots courants n'est pas disponible. */
  var DEUX_COURANTS = ' AH AI AN AS AU BU CA CE CI DE DO DU EH EN ES ET EU EX FA FI GO HA HE HO IF IL IN JE LA LE LU MA ME MI NE NI NU OH ON OR OS OU PU RE RI SA SE SI SU TA TE TU UN VA VU ';
  function courantHeuristique(w) {
    if (w.length === 2) return DEUX_COURANTS.indexOf(' ' + w + ' ') !== -1;
    // passé simple et subjonctif imparfait : formes livresques
    return !/(AMES|ATES|ASSE|ASSES|ASSIONS|ASSIEZ|ASSENT|IMES|ITES|USSE|USSES|UMES|UTES)$/.test(w);
  }

  function motAdmis(dict, w, mots) {
    if (estInterdit(w)) return false;
    if (!mots) return true;
    if (dict.niveau) {
      var n = dict.niveau.get(w);
      return !!n && n <= mots;
    }
    return courantHeuristique(w);
  }

  function aleaNormal() {
    var u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /* Coups autorisés pour un niveau (vocabulaire, liste noire, taille). */
  function filtreCoups(coups, dict, niv) {
    return coups.filter(function (m) {
      if (m.nbPoses > niv.maxLettres) return false;
      for (var i = 0; i < m.mots.length; i++) if (!motAdmis(dict, m.mots[i], niv.mots)) return false;
      return true;
    });
  }

  /* Équité d'un coup : points + reliquat + fin de partie − défense. */
  function equite(state, playerIdx, m, niv, contexte) {
    var sacVide = contexte.sac === 0;
    var eq = m.total;
    if (niv.reliquat) {
      if (sacVide && m.nbReste === 0) {
        eq += 2 * contexte.adverse; // finir la partie : on empoche les lettres adverses
      } else {
        // pioche : le reliquat compte moins quand le sac est presque vide
        var poids = contexte.sac > 0 && contexte.sac < 7 ? 0.6 : 1;
        eq += niv.reliquat * poids * m.vr;
      }
    }
    if (niv.defense) eq -= niv.defense * ouvreTriple(contexte.triples, m.placements);
    return eq;
  }

  /* Meilleur échange : quelles lettres garder (au plus 7 lettres → 128 cas). */
  function meilleurEchange(rack) {
    var n = rack.length, meilleur = null;
    for (var masque = 0; masque < (1 << n) - 1; masque++) { // on échange au moins une lettre
      var garde = new Int8Array(27), rendre = [];
      for (var i = 0; i < n; i++) {
        var l = rack[i];
        if (masque & (1 << i)) { if (l === '?') garde[JOKER]++; else garde[l.charCodeAt(0) - 65]++; }
        else rendre.push(l);
      }
      var v = valeurReliquat(garde, false);
      if (!meilleur || v > meilleur.valeur) meilleur = { valeur: v, lettres: rendre };
    }
    return meilleur;
  }

  /* L'IA a-t-elle déjà échangé à ses deux derniers tours ? (évite de boucler) */
  function echangesRecents(state, playerIdx) {
    var n = 0;
    for (var i = state.history.length - 1; i >= 0 && n < 2; i--) {
      var h = state.history[i];
      if (h.player !== playerIdx) continue;
      if (h.type !== 'exchange') return false;
      n++;
    }
    return n >= 2;
  }

  /*
   * Décide l'action de l'IA.
   * level : 'facile' | 'moyen' | 'difficile' | 'expert'
   * Renvoie {kind:'move', placements, total, words:[{word, score}]} |
   *         {kind:'exchange', letters} | {kind:'pass'}
   */
  function chooseAction(S, state, playerIdx, dict, level) {
    var niv = NIVEAUX[level] || NIVEAUX.moyen;
    var tous = findAllMoves(S, state, playerIdx, dict);
    var coups = filtreCoups(tous, dict, niv);
    // vocabulaire trop restreint pour ce tirage : l'IA facile élargit aux mots
    // courants (jamais aux mots rares : comme un joueur débutant, elle échange
    // ou passe plutôt que de sortir un mot inconnu)
    if (!coups.length && niv.mots === 1) coups = filtreCoups(tous, dict, { mots: 2, maxLettres: 7 });
    var rack = state.players[playerIdx].rack;
    var contexte = { sac: state.bag.length, adverse: invisibles(state, playerIdx).valeur, triples: triplesLibres(state) };

    // « vision » : l'IA ne remarque qu'une partie des coups possibles
    if (niv.vision < 1 && coups.length > 3) {
      var vus = coups.filter(function () { return Math.random() < niv.vision; });
      if (vus.length) coups = vus;
    }

    var choisi = null, meilleureEq = -Infinity;
    if (coups.length) {
      if (niv.cible) {
        // facile : un coup « qui marche », dont les points tombent près d'une cible modeste
        var cible = niv.cible[0] + Math.random() * (niv.cible[1] - niv.cible[0]);
        var ecart = Infinity;
        coups.forEach(function (m) {
          var e = Math.abs(m.total - cible) + Math.random() * niv.bruit + m.nbPoses * 0.4;
          if (e < ecart) { ecart = e; choisi = m; }
        });
        meilleureEq = choisi.total;
      } else {
        coups.forEach(function (m) {
          var eq = equite(state, playerIdx, m, niv, contexte);
          if (niv.plafond && m.total > niv.plafond) eq -= (m.total - niv.plafond) * 1.2;
          if (niv.bruit) eq += aleaNormal() * niv.bruit;
          m.equite = eq;
          if (eq > meilleureEq) { meilleureEq = eq; choisi = m; }
        });
      }
    }

    // échange stratégique (jamais quand le sac a moins de 7 lettres)
    var peutEchanger = state.bag.length >= 7 && rack.length > 0 && !echangesRecents(state, playerIdx);
    if (peutEchanger && niv.echange !== null) {
      var ech = meilleurEchange(rack);
      var eqEch = ech.valeur * (niv.reliquat || 0.5) - 2;
      if (!choisi || (choisi.total < 22 && eqEch > meilleureEq + niv.echange)) {
        return { kind: 'exchange', letters: ech.lettres };
      }
    }
    if (!choisi) {
      if (peutEchanger) return { kind: 'exchange', letters: meilleurEchange(rack).lettres };
      return { kind: 'pass' };
    }
    var res = S.checkMove(state, choisi.placements);
    return {
      kind: 'move',
      placements: choisi.placements,
      total: res.ok ? res.total : choisi.total,
      words: res.ok ? res.words : choisi.mots.map(function (w) { return { word: w, score: 0 }; })
    };
  }

  /*
   * Coach : le coup qui rapportait le plus de points (sans mot interdit).
   * Renvoie {placements, total, words:[{word, score}], principal} ou null.
   */
  function meilleurCoup(S, state, playerIdx, dict) {
    var coups = findAllMoves(S, state, playerIdx, dict);
    var best = null;
    coups.forEach(function (m) {
      for (var i = 0; i < m.mots.length; i++) if (estInterdit(m.mots[i])) return;
      if (!best || m.total > best.total) best = m;
    });
    if (!best) return null;
    var res = S.checkMove(state, best.placements);
    return { placements: best.placements, total: best.total,
      words: res.ok ? res.words : best.mots.map(function (w) { return { word: w, score: 0 }; }),
      principal: best.principal };
  }

  return {
    NIVEAUX: NIVEAUX,
    VALEUR: VALEUR,
    NOMBRE: NOMBRE,
    buildDict: buildDict,
    chargeCourants: chargeCourants,
    prepare: prepare,
    findAllMoves: findAllMoves,
    chooseAction: chooseAction,
    meilleurCoup: meilleurCoup,
    valeurReliquat: valeurReliquat,
    compteChevalet: compteChevalet,
    estInterdit: estInterdit,
    motAdmis: motAdmis
  };
});
