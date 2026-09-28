/* GGgames — Poker Texas Hold'em (2 à 4 joueurs : en ligne, ou seul contre
 * des robots).
 *
 * V2 :
 *  - de vrais robots (facile, moyen, difficile) : équité calculée par
 *    simulation (Monte-Carlo, évaluateur rapide), fourchettes de mains
 *    déduites des actions de chacun, observation des adversaires (qui fait
 *    tapis à tout va, qui suit tout), bluffs dosés, mises proportionnées ;
 *  - la cagnotte suit l'état de la table (achats, pile) : appli tuée,
 *    rechargée, reprise, abandonnée — on retrouve exactement sa pile ;
 *  - en ligne, un délai de parole (25 s, anneau autour de la plaque) puis
 *    « parole » ou « se couche » d'office : un absent ne fige plus la table ;
 *  - seul contre les robots, une vitesse de jeu (normale / rapide) mémorisée ;
 *  - les pots annexes ne se dédoublent plus à l'abattage ;
 *  - la table vit : cartes distribuées et retournées, jetons qui glissent au
 *    pot puis vers le gagnant, compteur de pot qui défile, sons, vibrations.
 */
(function (root) {
  'use strict';
  var GG = root.GG;
  var START_CHIPS = 100;
  var BLINDS = [1, 2];
  var BOT_RECAVES = 2;          // un robot se recave deux fois, puis quitte la table
  var DELAI_TOUR = 25000;       // en ligne : délai de parole
  var DELAI_ABSENT = 8000;      // … raccourci pour un joueur déjà absent deux fois
  var DELAI_SUITE = 15000;      // en ligne : main suivante automatique
  /* rythme des robots (seul contre l'ordinateur), en millisecondes */
  var VITESSES = {
    normal: { base: 720, alea: 380, rue: 900, donne: 1100, suite: 5200 },
    rapide: { base: 260, alea: 140, rue: 420, donne: 600, suite: 2600 }
  };
  var CLE_VITESSE = 'gg-poker-vitesse';

  /* ---------- évaluation des mains ---------- */

  function rank5(cards) {
    var rs = cards.map(function (c) { return c >> 2; }).sort(function (a, b) { return b - a; });
    var suits = cards.map(function (c) { return c & 3; });
    var flush = suits.every(function (s) { return s === suits[0]; });
    var counts = {};
    rs.forEach(function (r) { counts[r] = (counts[r] || 0) + 1; });
    // groupes triés par (nombre, rang) décroissant
    var groups = Object.keys(counts).map(Number).sort(function (a, b) {
      return counts[b] - counts[a] || b - a;
    });
    var uniq = groups.slice().sort(function (a, b) { return b - a; });
    var straightHigh = -1;
    if (uniq.length === 5) {
      if (uniq[0] - uniq[4] === 4) straightHigh = uniq[0];
      else if (uniq[0] === 12 && uniq[1] === 3) straightHigh = 3; // A-2-3-4-5
    }
    var kick = groups.map(function (g) { return g; });
    if (straightHigh !== -1 && flush) return [8, straightHigh];
    if (counts[groups[0]] === 4) return [7, groups[0], groups[1]];
    if (counts[groups[0]] === 3 && counts[groups[1]] === 2) return [6, groups[0], groups[1]];
    if (flush) return [5].concat(rs);
    if (straightHigh !== -1) return [4, straightHigh];
    if (counts[groups[0]] === 3) return [3].concat(kick);
    if (counts[groups[0]] === 2 && counts[groups[1]] === 2) return [2].concat(kick);
    if (counts[groups[0]] === 2) return [1].concat(kick);
    return [0].concat(rs);
  }

  function cmpRank(a, b) {
    for (var i = 0; i < Math.max(a.length, b.length); i++) {
      var d = (a[i] || 0) - (b[i] || 0);
      if (d) return d;
    }
    return 0;
  }

  /* meilleure main de 5 cartes parmi 7 */
  function best7(cards) {
    var best = null;
    for (var i = 0; i < 7; i++) {
      for (var j = i + 1; j < 7; j++) {
        var five = [];
        for (var k = 0; k < 7; k++) if (k !== i && k !== j) five.push(cards[k]);
        var r = rank5(five);
        if (!best || cmpRank(r, best) > 0) best = r;
      }
    }
    return best;
  }

  /* meilleure main parmi 5, 6 ou 7 cartes (flop, turn, river) */
  function meilleure(cards) {
    if (cards.length === 5) return rank5(cards);
    if (cards.length === 7) return best7(cards);
    var best = null;
    for (var x = 0; x < cards.length; x++) {
      var r = rank5(cards.slice(0, x).concat(cards.slice(x + 1)));
      if (!best || cmpRank(r, best) > 0) best = r;
    }
    return best;
  }

  /* les CINQ cartes qui jouent vraiment (celles qu'on fait briller à
     l'abattage) : la meilleure combinaison de 5 parmi 5, 6 ou 7 cartes */
  function cinqQuiJouent(cards) {
    var n = cards.length, best = null, jeu = [];
    for (var a = 0; a < n; a++) for (var b = a + 1; b < n; b++)
      for (var c = b + 1; c < n; c++) for (var d = c + 1; d < n; d++)
        for (var e = d + 1; e < n; e++) {
          var cinq = [cards[a], cards[b], cards[c], cards[d], cards[e]];
          var r = rank5(cinq);
          if (!best || cmpRank(r, best) > 0) { best = r; jeu = cinq; }
        }
    return jeu;
  }

  /* ---------- évaluateur RAPIDE (robots) : un entier comparable ----------
     catégorie << 20 | rangs décisifs par paquets de 4 bits. Vérifié contre
     best7 sur 200 000 donnes (tests). */
  var DROITE = [];
  (function () {
    for (var m = 0; m < 8192; m++) {
      var h = -1;
      for (var r = 12; r >= 4; r--) { if (((m >> (r - 4)) & 31) === 31) { h = r; break; } }
      if (h < 0 && (m & 0x100F) === 0x100F) h = 3;
      DROITE.push(h);
    }
  })();
  var CNT = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], SM = [0, 0, 0, 0], SC = [0, 0, 0, 0];
  function hauts(mask, n, x1, x2) {
    var v = 0, k = 0;
    for (var r = 12; r >= 0 && k < n; r--) {
      if (((mask >> r) & 1) && r !== x1 && r !== x2) { v = (v << 4) | r; k++; }
    }
    while (k < n) { v = v << 4; k++; }
    return v;
  }
  function eval7(c, n) {
    var i, r, s, mask = 0;
    for (i = 0; i < 13; i++) CNT[i] = 0;
    SM[0] = SM[1] = SM[2] = SM[3] = 0; SC[0] = SC[1] = SC[2] = SC[3] = 0;
    for (i = 0; i < n; i++) { r = c[i] >> 2; s = c[i] & 3; CNT[r]++; SM[s] |= 1 << r; SC[s]++; mask |= 1 << r; }
    var fl = -1;
    for (s = 0; s < 4; s++) if (SC[s] >= 5) fl = s;
    if (fl >= 0) { var sf = DROITE[SM[fl]]; if (sf >= 0) return (8 << 20) | sf; }
    var q = -1, t1 = -1, t2 = -1, p1 = -1, p2 = -1;
    for (r = 12; r >= 0; r--) {
      var k = CNT[r];
      if (k === 4) q = r;
      else if (k === 3) { if (t1 < 0) t1 = r; else if (t2 < 0) t2 = r; }
      else if (k === 2) { if (p1 < 0) p1 = r; else if (p2 < 0) p2 = r; }
    }
    if (q >= 0) return (7 << 20) | (q << 16) | (hauts(mask, 1, q, -1) << 12);
    if (t1 >= 0 && (t2 >= 0 || p1 >= 0)) return (6 << 20) | (t1 << 16) | ((t2 > p1 ? t2 : p1) << 12);
    if (fl >= 0) return (5 << 20) | hauts(SM[fl], 5, -1, -1);
    var st = DROITE[mask];
    if (st >= 0) return (4 << 20) | st;
    if (t1 >= 0) return (3 << 20) | (t1 << 16) | (hauts(mask, 2, t1, -1) << 8);
    if (p2 >= 0) return (2 << 20) | (p1 << 16) | (p2 << 12) | (hauts(mask, 1, p1, p2) << 8);
    if (p1 >= 0) return (1 << 20) | (p1 << 16) | (hauts(mask, 3, p1, -1) << 4);
    return hauts(mask, 5, -1, -1);
  }

  /* Force préflop des 169 mains (percentile pondéré, 0‰ = la pire, 1000‰ =
     les as), calculée hors ligne par 40 000 simulations par main contre une
     main quelconque. Index : a*13+b, a=b paire, a>b assorties (a = rang
     haut), a<b dépareillées (a = rang bas). */
  var PCT = [521, 5, 14, 32, 23, 41, 92, 149, 234, 312, 415, 537, 671, 65, 643, 50, 71, 59, 80, 101,
    167, 258, 360, 466, 576, 713, 86, 143, 750, 128, 119, 137, 158, 192, 279, 388, 490, 600, 744, 107,
    173, 213, 873, 179, 207, 225, 270, 321, 406, 511, 627, 793, 113, 186, 219, 294, 919, 249, 288, 330,
    370, 427, 549, 653, 775, 110, 201, 240, 300, 348, 963, 342, 379, 439, 499, 588, 704, 821, 198, 216,
    264, 306, 394, 448, 971, 454, 481, 567, 637, 729, 839, 243, 297, 303, 351, 433, 475, 543, 975, 558,
    615, 692, 784, 879, 336, 354, 400, 421, 460, 517, 594, 665, 980, 683, 763, 854, 906, 397, 445, 472,
    528, 531, 609, 659, 719, 811, 984, 805, 866, 929, 505, 525, 582, 606, 647, 677, 735, 769, 830, 845,
    989, 891, 938, 621, 662, 698, 722, 738, 757, 799, 833, 900, 913, 923, 993, 950, 754, 814, 827, 848,
    860, 885, 897, 916, 944, 956, 959, 967, 998];
  function forcePreflop(hole) {
    if (!hole || hole.length < 2 || hole[0] < 0 || hole[1] < 0) return 0.5;
    var r1 = hole[0] >> 2, r2 = hole[1] >> 2;
    var hi = Math.max(r1, r2), lo = Math.min(r1, r2), idx;
    if (r1 === r2) idx = r1 * 13 + r1;
    else if ((hole[0] & 3) === (hole[1] & 3)) idx = hi * 13 + lo;
    else idx = lo * 13 + hi;
    return PCT[idx] / 1000;
  }

  /* ---------- le nom de la main, comme on le dit à une vraie table ---------- */
  var PLURIEL = ['deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf',
    'dix', 'valets', 'dames', 'rois', 'as'];
  var SINGULIER = ['deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf',
    'dix', 'valet', 'dame', 'roi', 'as'];
  function deRang(r) { return (r === 12 ? 'd’' : 'de ') + PLURIEL[r]; }
  function auRang(r) {
    return (r === 12 ? 'à l’' : r === 10 ? 'à la ' : 'au ') + SINGULIER[r];
  }
  /* « Paire de six », « Full aux as par les rois », « Couleur à l’as »… */
  function nomMain(r) {
    switch (r[0]) {
      case 8: return r[1] === 12 ? 'Quinte flush royale' : 'Quinte flush ' + auRang(r[1]);
      case 7: return 'Carré ' + deRang(r[1]);
      case 6: return 'Full aux ' + PLURIEL[r[1]] + ' par les ' + PLURIEL[r[2]];
      case 5: return 'Couleur ' + auRang(r[1]);
      case 4: return 'Suite ' + auRang(r[1]);
      case 3: return 'Brelan ' + deRang(r[1]);
      case 2: return 'Deux paires, ' + PLURIEL[r[1]] + ' et ' + PLURIEL[r[2]];
      case 1: return 'Paire ' + deRang(r[1]);
      default: return 'Hauteur ' + SINGULIER[r[1]];
    }
  }
  /* la main que l'on tient EN DIRECT : dès la donne (2 cartes), puis avec
     le tapis (flop, turn, river) */
  function nomMainVive(hole, community) {
    if (!hole || hole.length < 2 || hole[0] < 0) return '';
    var cartes = hole.concat(community || []);
    if (cartes.length < 5) {
      var a = hole[0] >> 2, b = hole[1] >> 2;
      if (a === b) return 'Paire ' + deRang(a);
      var txt = 'Hauteur ' + SINGULIER[Math.max(a, b)];
      if ((hole[0] & 3) === (hole[1] & 3)) txt += ', assortis';
      return txt;
    }
    return nomMain(meilleure(cartes));
  }

  /* ---------- déroulement ---------- */

  function actives(state) {
    return state.players.filter(function (p) { return !p.out && !p.folded; }).length;
  }

  function nextIdx(state, from, filter) {
    var n = state.players.length;
    for (var k = 1; k <= n; k++) {
      var i = (from + k) % n;
      var p = state.players[i];
      if (!p.out && filter(p)) return i;
    }
    return -1;
  }

  function canPlay(p) { return !p.folded && !p.allin; }
  function estRobot(s, i) { return !!s.solo && i > 0; }

  /* Ce que chacun vient de faire reste affiché sous son siège, et le fil de
     la main garde tout : on ne rate plus une parole ni une relance. Les
     prénoms sont échappés à l'affichage, jamais ici. */
  function noter(state, idx, badge, phrase) {
    var p = state.players[idx];
    if (p) p.lastAct = badge;
    if (!state.log) state.log = [];
    state.log.push({ i: idx, t: phrase });
    if (state.log.length > 80) state.log.shift();
  }

  function noterTable(state, phrase) {
    if (!state.log) state.log = [];
    state.log.push({ i: -1, t: phrase });
    if (state.log.length > 80) state.log.shift();
  }

  function post(state, idx, amount) {
    var p = state.players[idx];
    var a = Math.min(amount, p.chips);
    p.chips -= a;
    p.bet += a;
    p.cont += a;
    if (p.chips === 0) p.allin = true;
    return a;
  }

  function potTotal(state) {
    return state.players.reduce(function (s, p) { return s + p.cont; }, 0);
  }

  function hasChips(p) { return p.chips > 0; }

  /* ---- observations publiques (les robots « difficile » s'en servent) ---- */
  function obs(state, i) {
    if (!state.obs) state.obs = [];
    if (!state.obs[i]) state.obs[i] = { mains: 0, vpip: 0, pfr: 0, tapis: 0, agr: 0, pas: 0, couche: 0, face: 0 };
    return state.obs[i];
  }

  /* un état enregistré par une version précédente : on complète */
  function normaliser(s) {
    if (!s || !s.players) return s;
    s.players.forEach(function (p) {
      if (typeof p.achats !== 'number') p.achats = START_CHIPS;
      if (typeof p.recaves !== 'number') p.recaves = 0;
      if (!p.h) p.h = { vpip: 0, pfr: 0, relPre: 0, tapisPre: 0, agrPost: 0 };
    });
    if (typeof s.tourId !== 'number') s.tourId = 0;
    if (!s.vitesse) s.vitesse = 'normal';
    return s;
  }

  function newHand(state) {
    // Tournoi : blinds qui doublent toutes les 6 mains
    if (state.mode === 'tournoi') {
      var level = Math.floor(state.handNum / 6);
      state.blinds = [1 * Math.pow(2, level), 2 * Math.pow(2, level)];
    }
    var alive = state.players.filter(function (p) { return !p.out && p.chips > 0; });
    if (alive.length < 2) {
      if (state.mode === 'tournoi') { state.finished = true; return; }
      state.handOver = true;
      state.handMsg = 'En attente d’une recave pour continuer…';
      return;
    }
    state.handNum++;
    var deck = [];
    for (var c = 0; c < 52; c++) deck.push(c);
    GG.shuffle(deck);
    state.deck = deck;
    state.community = [];
    state.handOver = false;
    state.handMsg = '';
    state.showdownInfo = null;
    state.resultat = null;
    state.log = [];
    noterTable(state, 'Main n°' + state.handNum);
    state.players.forEach(function (p, i) {
      p.lastAct = '';
      // sans jetons (cash game) : on saute la main en attendant une recave
      p.folded = p.out || p.chips === 0;
      p.bet = 0; p.cont = 0; p.allin = false; p.show = false;
      p.hole = p.folded ? [] : [state.deck.pop(), state.deck.pop()];
      p.h = { vpip: 0, pfr: 0, relPre: 0, tapisPre: 0, agrPost: 0 };
      if (!p.folded) obs(state, i).mains++;
    });
    state.dealer = nextIdx(state, state.dealer, hasChips);
    var sb, bb;
    if (alive.length === 2) {
      sb = state.dealer;
      bb = nextIdx(state, sb, hasChips);
    } else {
      sb = nextIdx(state, state.dealer, hasChips);
      bb = nextIdx(state, sb, hasChips);
    }
    post(state, sb, state.blinds[0]);
    noter(state, sb, 'Petite blind', 'pose la petite blind (' + state.blinds[0] + ')');
    post(state, bb, state.blinds[1]);
    noter(state, bb, 'Grosse blind', 'pose la grosse blind (' + state.blinds[1] + ')');
    state.maxBet = state.blinds[1];
    state.minRaise = state.blinds[1];
    state.street = 'pre';
    state.relances = 0;
    state.need = state.players.map(function (p) { return canPlay(p); });
    state.current = nextIdx(state, bb, canPlay);
    if (state.current === -1) advanceStreet(state);
  }

  function settleFold(state) {
    // il ne reste qu'un joueur : il ramasse le pot sans montrer ses cartes
    var winner = state.players.findIndex(function (p) { return !p.out && !p.folded; });
    var pot = potTotal(state);
    state.players[winner].chips += pot;
    state.players.forEach(function (p) { p.cont = 0; p.bet = 0; });
    var nom = state.players[winner].name;
    state.handMsg = nom + ' remporte ' + pot + ' 🪙 (tout le monde s’est couché).';
    var gains = {}; gains[winner] = pot;
    state.resultat = {
      gagnants: [winner], pot: pot, sansAbattage: true, gains: gains,
      lignes: [nom + ' remporte ' + pot + ' 🪙'],
      mains: []
    };
    noterTable(state, nom + ' rafle le pot (' + pot + ')');
    endHand(state);
  }

  /* Les pots, selon les contributions : un niveau par tapis d'un joueur
     ENCORE en lice (les jetons d'un joueur couché — une blind par exemple —
     tombent dans le pot du niveau correspondant, sans en créer un nouveau).
     Deux niveaux qui concernent les mêmes joueurs ne font qu'un pot. */
  function construirePots(state) {
    var enLice = [];
    state.players.forEach(function (p, i) { if (!p.out && !p.folded) enLice.push(i); });
    var niveaux = [];
    enLice.forEach(function (i) {
      var c = state.players[i].cont;
      if (c > 0 && niveaux.indexOf(c) === -1) niveaux.push(c);
    });
    niveaux.sort(function (a, b) { return a - b; });
    var pots = [], prev = 0;
    niveaux.forEach(function (L) {
      var montant = 0;
      state.players.forEach(function (p) {
        montant += Math.max(0, Math.min(p.cont, L) - prev);
      });
      var eligibles = enLice.filter(function (i) { return state.players[i].cont >= L; });
      var dernier = pots[pots.length - 1];
      if (dernier && dernier.eligibles.join(',') === eligibles.join(',')) dernier.montant += montant;
      else if (montant > 0) pots.push({ montant: montant, eligibles: eligibles });
      prev = L;
    });
    // (au-delà du plus gros tapis en lice : impossible après le remboursement
    // de l'excédent, mais on ne perd jamais un jeton)
    var reste = 0;
    state.players.forEach(function (p) { reste += Math.max(0, p.cont - prev); });
    if (reste > 0) {
      if (pots.length) pots[pots.length - 1].montant += reste;
      else pots.push({ montant: reste, eligibles: enLice.slice() });
    }
    return pots;
  }

  function showdown(state) {
    state.street = 'showdown';
    var board = state.community;
    var contenders = [];
    state.players.forEach(function (p, i) {
      if (!p.out && !p.folded) {
        p.show = true;
        p.rank = best7(p.hole.concat(board));
        contenders.push(i);
      }
    });
    // excédent non suivi : le plus gros contributeur récupère la différence
    // avec le second — ce n'est pas un gain, juste un remboursement
    var conts = state.players.map(function (p) { return p.cont; }).sort(function (a, b) { return b - a; });
    if (conts.length > 1 && conts[0] > conts[1]) {
      var excess = conts[0] - conts[1];
      for (var xi = 0; xi < state.players.length; xi++) {
        if (state.players[xi].cont === conts[0]) {
          state.players[xi].cont -= excess;
          state.players[xi].chips += excess;
          break;
        }
      }
    }
    var potInitial = potTotal(state);
    var pots = construirePots(state);
    var msgs = [];
    var tousGagnants = [];
    var gains = {};
    pots.forEach(function (pt, k) {
      var bestR = null;
      pt.eligibles.forEach(function (i) {
        if (!bestR || cmpRank(state.players[i].rank, bestR) > 0) bestR = state.players[i].rank;
      });
      var winners = pt.eligibles.filter(function (i) {
        return cmpRank(state.players[i].rank, bestR) === 0;
      });
      // le jeton indivisible va au premier gagnant après le donneur
      winners.sort(function (a, b) {
        var n = state.players.length;
        return ((a - state.dealer + n - 1) % n) - ((b - state.dealer + n - 1) % n);
      });
      var share = Math.floor(pt.montant / winners.length);
      var rest = pt.montant - share * winners.length;
      winners.forEach(function (i, w) {
        var g = share + (w === 0 ? rest : 0);
        state.players[i].chips += g;
        gains[i] = (gains[i] || 0) + g;
        if (tousGagnants.indexOf(i) === -1) tousGagnants.push(i);
      });
      var qui = winners.map(function (i) { return state.players[i].name; }).join(' & ');
      var etiquette = pots.length > 1 ? (k === 0 ? 'Pot principal · ' : 'Pot annexe · ') : '';
      msgs.push(etiquette + qui + (winners.length > 1 ? ' se partagent ' : ' remporte ') + pt.montant + ' 🪙 (' + nomMain(bestR) + ')');
    });
    state.players.forEach(function (p) { p.cont = 0; });
    state.handMsg = msgs.join(' · ');
    // les cartes qui font gagner : les 5 de chaque gagnant (tapis compris)
    var brillent = [];
    tousGagnants.forEach(function (i) {
      cinqQuiJouent(state.players[i].hole.concat(board)).forEach(function (c) {
        if (brillent.indexOf(c) === -1) brillent.push(c);
      });
    });
    state.resultat = {
      gagnants: tousGagnants,
      pot: potInitial,
      sansAbattage: false,
      lignes: msgs,
      gains: gains,
      cinq: brillent,
      mains: contenders.map(function (i) {
        return { i: i, cat: nomMain(state.players[i].rank) };
      })
    };
    contenders.forEach(function (i) {
      var o = obs(state, i); o.abat = (o.abat || 0) + 1;
    });
    noterTable(state, 'Abattage : ' + msgs.join(' · '));
    endHand(state);
  }

  function endHand(state) {
    state.handOver = true;
    state.current = -1;
    if (state.mode === 'tournoi') {
      state.players.forEach(function (p) {
        if (!p.out && p.chips === 0) {
          p.out = true;
          state.handMsg += ' 💔 ' + p.name + ' est éliminé.';
        }
      });
      var alive = state.players.filter(function (p) { return !p.out; });
      // seul contre les robots : le tournoi s'arrête quand on est éliminé
      if (alive.length < 2 || (state.solo && state.players[0].out)) {
        state.finished = true;
        var best = -1;
        state.players.forEach(function (p, i) {
          if (!p.out && (best < 0 || p.chips > state.players[best].chips)) best = i;
        });
        state.winner = best;
      }
    } else {
      state.players.forEach(function (p, i) {
        if (p.chips > 0 || p.out) return;
        if (estRobot(state, i)) {
          // les robots ne recavent pas gratuitement à l'infini
          if ((p.recaves || 0) < BOT_RECAVES) {
            p.recaves = (p.recaves || 0) + 1;
            p.chips = START_CHIPS;
            p.achats = (p.achats || START_CHIPS) + START_CHIPS;
            state.handMsg += ' ♻️ ' + p.name + ' se recave (' + p.recaves + '/' + BOT_RECAVES + ').';
            noterTable(state, p.name + ' se recave');
          } else {
            p.out = true;
            state.handMsg += ' 🚪 ' + p.name + ' quitte la table, ruiné.';
            noterTable(state, p.name + ' quitte la table');
          }
        } else {
          state.handMsg += ' 💸 ' + p.name + ' n’a plus de jetons (recave possible).';
        }
      });
      if (state.solo) {
        var robots = state.players.filter(function (p, i) { return i > 0 && !p.out; }).length;
        if (!robots) { state.finished = true; state.winner = 0; }
      }
    }
  }

  function advanceStreet(state) {
    if (actives(state) <= 1) { settleFold(state); return; }
    // les annonces de la rue précédente s'effacent avec les mises
    state.players.forEach(function (p) { p.bet = 0; p.lastAct = ''; });
    state.maxBet = 0;
    state.minRaise = state.blinds[1];
    state.relances = 0;
    var playable = state.players.filter(function (p) { return canPlay(p) && !p.out; }).length;
    if (state.street === 'pre') {
      state.community = [state.deck.pop(), state.deck.pop(), state.deck.pop()];
      state.street = 'flop';
      noterTable(state, 'Flop');
    } else if (state.street === 'flop') {
      state.community.push(state.deck.pop());
      state.street = 'turn';
      noterTable(state, 'Turn');
    } else if (state.street === 'turn') {
      state.community.push(state.deck.pop());
      state.street = 'river';
      noterTable(state, 'River');
    } else {
      showdown(state);
      return;
    }
    if (playable < 2) {
      // tout le monde est à tapis : on déroule jusqu'au bout
      advanceStreet(state);
      return;
    }
    state.need = state.players.map(function (p) { return canPlay(p) && !p.out; });
    state.current = nextIdx(state, state.dealer, canPlay);
    if (state.current === -1) advanceStreet(state);
  }

  function afterAction(state) {
    if (actives(state) <= 1) { settleFold(state); return; }
    var pending = state.need.some(function (n, i) {
      return n && canPlay(state.players[i]) && !state.players[i].out;
    });
    if (!pending) { advanceStreet(state); return; }
    state.current = nextIdx(state, state.current, function (p) { return canPlay(p); });
    // avance jusqu'à un joueur qui doit encore parler
    var guard = 0;
    while (guard++ < 8 && state.current !== -1 && !state.need[state.current]) {
      state.current = nextIdx(state, state.current, canPlay);
    }
    if (state.current === -1) advanceStreet(state);
  }

  /* ---------- les minuteurs d'autorité ----------
     Un seul à la fois (celui de la coque) ; l'échéance est aussi rangée
     dans l'état et revérifiée quand il tombe (un minuteur périmé ne fait
     rien). Seul contre les robots : le rythme des robots et la main
     suivante automatique ; en ligne : le délai de parole. */
  function delaiRobot(s) {
    var v = VITESSES[s.vitesse] || VITESSES.normal;
    var d = v.base + Math.random() * v.alea;
    var debutRue = s.players.every(function (p) { return !p.lastAct || /blind/i.test(p.lastAct); });
    if (s.street === 'pre' && debutRue) d += v.donne;
    else if (s.street !== 'pre' && s.players.every(function (p) { return !p.lastAct; })) d += v.rue;
    return Math.round(d);
  }
  function planifier(s) {
    if (s.finished || !s.mode) return undefined;
    var now = Date.now();
    if (s.handOver) {
      if (s.solo) {
        var moi = s.players[0];
        if (!moi || moi.out || moi.chips <= 0) { s.echeance = 0; return undefined; }
        var ms = (VITESSES[s.vitesse] || VITESSES.normal).suite;
        s.echeance = now + ms; s.delaiMs = ms;
        return { ms: ms, action: { t: 'suite', h: s.handNum } };
      }
      s.echeance = now + DELAI_SUITE; s.delaiMs = DELAI_SUITE;
      return { ms: DELAI_SUITE, action: { t: 'suite', h: s.handNum } };
    }
    if (s.current < 0) return undefined;
    if (s.solo) {
      if (s.current === 0) { s.echeance = 0; s.delaiMs = 0; return undefined; }
      var d = delaiRobot(s);
      s.echeance = now + d; s.delaiMs = d;
      return { ms: d, action: { t: 'robot', id: s.tourId } };
    }
    var cp = s.players[s.current];
    var ms2 = (cp.absences || 0) >= 2 ? DELAI_ABSENT : DELAI_TOUR;
    s.echeance = now + ms2; s.delaiMs = ms2;
    return { ms: ms2, action: { t: 'delai', id: s.tourId } };
  }
  function fait(s) {
    s.tourId = (s.tourId || 0) + 1;
    return { ok: true, timer: planifier(s) };
  }

  /* ================= LES ROBOTS =================
     Équité par simulation : on distribue au hasard les cartes inconnues —
     les mains adverses tirées dans la FOURCHETTE que leurs actions
     laissent supposer — et on compte les victoires. Puis on compare à la
     cote du pot, et on mise en conséquence. */
  var NIVEAUX = {
    facile: { iters: 110, fourchettes: true, modele: false, apriori: 14, marge: -0.05, valeur: 0.08, bluff: 0.06, ouverture: 1.15, limpe: 0.1, relancePre: 0.86, passif: 0.5, cbet: 0.3, prudence: 0, margePre: 0.06 },
    moyen: { iters: 220, fourchettes: true, modele: false, apriori: 6, marge: 0.0, valeur: 0.0, bluff: 0.1, ouverture: 1, limpe: 0.05, relancePre: 0.7, passif: 0.2, cbet: 0.55, prudence: 0.03 },
    difficile: { iters: 380, fourchettes: true, modele: true, apriori: 2.5, marge: 0.01, valeur: -0.03, bluff: 0.14, ouverture: 1.05, limpe: 0.03, relancePre: 0.62, passif: 0.05, cbet: 0.68, prudence: 0.04 }
  };

  var TAS = [];
  for (var t0 = 0; t0 < 52; t0++) TAS.push(t0);
  var MAIN7 = [0, 0, 0, 0, 0, 0, 0], ADV7 = [0, 0, 0, 0, 0, 0, 0];

  /* fourchette d'un adversaire : fraction des meilleures mains préflop qu'il
     peut tenir (1 = n'importe quoi), et filtre après une agression */
  function fourchette(s, i, N) {
    if (!N.fourchettes) return { seuil: 0, bluffe: 1 };
    var q = s.players[i], h = q.h || {};
    var o = (s.obs && s.obs[i]) || { mains: 0, vpip: 0, pfr: 0, tapis: 0, agr: 0, pas: 0 };
    var n = o.mains || 0;
    var k = N.apriori; // poids de l'a priori, en « mains » (petit = on s'adapte vite)
    function freq(x, prior) { return (x + prior * k) / (n + k); }
    var largeur = 1;
    if (h.tapisPre) {
      largeur = Math.max(0.1, Math.min(1, freq(o.tapis, 0.12) * 1.35));
    } else if (h.relPre >= 2) {
      largeur = Math.max(0.07, Math.min(1, freq(o.pfr, 0.18) * 0.6));
    } else if (h.pfr) {
      largeur = Math.max(0.14, Math.min(1, freq(o.pfr, 0.2) * 1.3));
    } else if (h.vpip) {
      largeur = Math.max(0.3, Math.min(1, freq(o.vpip, 0.45) * 1.1));
    }
    var bluffe = 1;
    if (h.agrPost) {
      var af = (o.agr + 0.3 * k) / (o.agr + o.pas + k);
      bluffe = Math.min(1, 0.12 + af * 0.8);
    }
    return { seuil: 1 - largeur, bluffe: bluffe };
  }

  function equite(s, me, adv, N, iters) {
    var p = s.players[me];
    var board = s.community || [];
    var connues = p.hole.concat(board);
    var tas = [], i, k;
    for (i = 0; i < 52; i++) if (connues.indexOf(i) === -1) tas.push(i);
    var F = adv.map(function (a) { return fourchette(s, a, N); });
    var gagne = 0, n = tas.length, manque = 5 - board.length;
    for (var it = 0; it < iters; it++) {
      var fin = n; // cartes encore libres : tas[0 .. fin-1]
      var tire = function () {
        var j = Math.floor(Math.random() * fin);
        var c = tas[j]; tas[j] = tas[fin - 1]; tas[fin - 1] = c; fin--;
        return c;
      };
      // le tapis complété
      for (k = 0; k < board.length; k++) MAIN7[2 + k] = board[k];
      for (k = 0; k < manque; k++) MAIN7[2 + board.length + k] = tire();
      MAIN7[0] = p.hole[0]; MAIN7[1] = p.hole[1];
      var mienne = eval7(MAIN7, 7);
      var meilleur = true, egal = 1;
      for (var a = 0; a < adv.length && meilleur; a++) {
        var c1 = 0, c2 = 0, essais = 0;
        while (true) {
          c1 = tire(); c2 = tire();
          essais++;
          var ok = forcePreflop([c1, c2]) >= F[a].seuil;
          if (ok && F[a].bluffe < 1 && board.length) {
            // après une mise : une main « faite » (paire utile au moins) ou un bluff
            ADV7[0] = c1; ADV7[1] = c2;
            for (k = 0; k < board.length; k++) ADV7[2 + k] = board[k];
            var v = eval7(ADV7, 2 + board.length);
            var bv = eval7(board, board.length);
            if ((v >> 20) <= (bv >> 20) && (v >> 20) < 2 && Math.random() > F[a].bluffe) ok = false;
          }
          if (ok || essais > 25) break;
          fin += 2; // on remet les deux cartes dans le tas
        }
        for (k = 0; k < 5; k++) ADV7[2 + k] = MAIN7[2 + k];
        ADV7[0] = c1; ADV7[1] = c2;
        var sa = eval7(ADV7, 7);
        if (sa > mienne) meilleur = false;
        else if (sa === mienne) egal++;
      }
      if (meilleur) gagne += 1 / egal;
    }
    return gagne / iters;
  }

  /* L'action d'un robot (fonction pure : n'utilise que l'état public, ses
     propres cartes et le hasard ; jamais le paquet ni les mains adverses). */
  function decide(s, me, niveau) {
    var p = s.players[me];
    if (!p || s.finished || !s.mode || s.handOver || s.current !== me || p.folded || p.allin || p.out) return null;
    var N = NIVEAUX[niveau] || NIVEAUX.moyen;
    var owe = s.maxBet - p.bet;
    var pot = potTotal(s);
    var bb = s.blinds[1];
    var alea = Math.random();
    var adv = [];
    s.players.forEach(function (q, i) { if (i !== me && !q.out && !q.folded) adv.push(i); });
    if (!adv.length) return owe > 0 ? { t: 'call' } : { t: 'check' };

    function relance(montantTotal) {
      // « relancer à » montantTotal (mise totale de la rue)
      var by = Math.round(montantTotal - s.maxBet);
      var maxBy = p.chips - owe;
      if (maxBy <= 0) return owe > 0 ? { t: 'call' } : { t: 'check' };
      if (maxBy < s.minRaise || by >= maxBy * 0.8) return { t: 'allin' };
      by = Math.max(s.minRaise, Math.min(by, maxBy));
      return { t: 'raise', by: by };
    }
    function suivre() { return owe > 0 ? { t: 'call' } : { t: 'check' }; }
    function coucher() { return owe > 0 ? { t: 'fold' } : { t: 'check' }; }

    var cote = owe > 0 ? owe / (pot + owe) : 0;
    var engageTout = owe >= p.chips;               // suivre = tapis
    var gros = owe > Math.max(bb * 6, p.chips * 0.3); // grosse mise en face
    var pf = forcePreflop(p.hole);
    var nAdv = adv.length;
    var juste = 1 / (nAdv + 1);
    // ce qu'on a vu des adversaires : qui suit tout, qui relance tout
    var station = false, maniaque = false;
    if (N.fourchettes) {
      adv.forEach(function (a) {
        var o = (s.obs && s.obs[a]) || null;
        if (!o || o.mains < (N.modele ? 3 : 6)) return;
        var suitTout = (o.pas + 1) / (o.agr + o.pas + 2);
        if (o.vpip / o.mains > 0.7 && suitTout > 0.7) station = true;
        if ((o.pfr + o.tapis) / o.mains > 0.6) maniaque = true;
      });
    }

    /* ---- préflop, pot non relancé : ouvrir, limper, se coucher ---- */
    if (!s.community.length && s.maxBet <= bb && !engageTout) {
      // seuil d'ouverture : selon le nombre de joueurs qui parlent encore
      // après nous (plus on parle tard, plus on ouvre large)
      var apres = 0;
      for (var k0 = 1; k0 < s.players.length; k0++) {
        var qk = s.players[(me + k0) % s.players.length];
        if (!qk.out && !qk.folded && s.need[(me + k0) % s.players.length]) apres++;
      }
      var largeur = nAdv === 1 ? 0.8 : ([0.9, 0.58, 0.44, 0.32][Math.min(3, apres)]);
      var seuil = 1 - Math.min(0.95, largeur * N.ouverture);
      // face à un maniaque, inutile d'ouvrir petit : on entre à bas prix et
      // on le laisse se jeter à tapis (on décidera alors à l'équité)
      if (maniaque && pf < 0.93) {
        if (pf >= seuil - 0.1) return suivre();
        return coucher();
      }
      if (pf >= N.relancePre || (pf >= seuil && alea > N.passif)) {
        return relance(bb * (2.5 + Math.random() * 1.2));
      }
      if (pf >= seuil - N.limpe) return suivre();
      if (owe <= 0) return { t: 'check' };
      // petite blind : compléter à bas prix de temps en temps
      if (owe <= bb / 2 && pf >= seuil - 0.2) return { t: 'call' };
      return { t: 'fold' };
    }

    /* ---- sinon : l'équité fait foi ---- */
    var E = equite(s, me, adv, N, N.iters);
    // un robot « difficile » ajuste contre ce qu'il observe
    /* en tournoi, le gagnant rafle tout : contre un adversaire qui se
       jette à tapis sans arrêt, inutile de jouer son tournoi sur un
       pile-ou-face — on attend une main nettement devant (plus les blinds
       sont petites devant les tapis, plus on peut attendre) */
    var prudence = 0;
    if (s.mode === 'tournoi' && N.prudence && (engageTout || gros)) {
      var tapisAdv = 0;
      adv.forEach(function (a) { tapisAdv = Math.max(tapisAdv, s.players[a].chips + s.players[a].bet); });
      var M = Math.min(p.chips + p.bet, tapisAdv) / (s.blinds[0] + s.blinds[1]);
      prudence = N.prudence * Math.min(1, M / 22) * (maniaque ? 1.15 : 1);
    }

    if (owe > 0) {
      // face à une mise : relance de valeur, suivi à la cote, ou on se couche
      var seuilRelance = (nAdv === 1 ? 0.7 : 0.6) + N.valeur;
      if (E >= seuilRelance && !engageTout) {
        if (alea < 0.65 || E > 0.85) {
          var cible = s.maxBet + Math.max(s.minRaise, (pot + owe) * (0.65 + Math.random() * 0.35));
          return relance(cible);
        }
        return { t: 'call' };
      }
      var marge = N.marge + prudence;
      // préflop : suivre une relance, c'est jouer ensuite sans l'initiative
      if (!s.community.length) marge += (owe <= bb ? 0 : (gros ? 0.03 : 0.06)) + (N.margePre || 0);
      else if (s.community.length < 5 && !engageTout) marge -= 0.03; // cotes implicites
      if (maniaque) marge -= 0.04;
      if (E >= cote + marge) {
        // parfois une relance-bluff crédible (semi-bluff) quand on est en tête-à-tête
        if (!engageTout && nAdv === 1 && s.community.length && s.community.length < 5 &&
            E > 0.33 && E < 0.5 && alea < N.bluff * 0.8 && !station) {
          return relance(s.maxBet + Math.max(s.minRaise, (pot + owe) * 0.75));
        }
        return { t: 'call' };
      }
      // bluff de relance sur une petite mise (rare, jamais contre une station)
      if (!engageTout && !station && nAdv === 1 && s.community.length >= 3 &&
          owe <= pot * 0.4 && alea < N.bluff * 0.5) {
        return relance(s.maxBet + Math.max(s.minRaise, (pot + owe) * 0.9));
      }
      return { t: 'fold' };
    }

    // personne n'a misé : miser pour la valeur, parfois bluffer, sinon parole
    var seuilValeur = juste + (1 - juste) * (station ? 0.16 : 0.22) + N.valeur;
    // la mise de continuation : celui qui a relancé avant le flop mise souvent au flop
    if (s.community.length === 3 && p.h && p.h.pfr && nAdv <= 2 && !station && alea < N.cbet) {
      return relance(Math.max(bb, pot * (0.45 + Math.random() * 0.25)));
    }
    if (E >= seuilValeur) {
      // un monstre se joue parfois lentement (pas à la river)
      if (E > 0.9 && s.community.length < 5 && alea < 0.2 && N.modele) return { t: 'check' };
      if (alea < N.passif && E < 0.8) return { t: 'check' };
      return relance(Math.max(bb, pot * (0.5 + Math.random() * 0.35)));
    }
    // bluff : surtout en tête-à-tête, à la même taille que les mises de valeur
    var pb = N.bluff * (nAdv === 1 ? 1 : 0.35) * (station ? 0 : 1);
    if (s.community.length === 5 && E < 0.25) pb *= 1.2;
    if (E > 0.3 && E < seuilValeur && s.community.length < 5) pb *= 1.4; // semi-bluff (tirages)
    if (alea < pb) return relance(Math.max(bb, pot * (0.5 + Math.random() * 0.35)));
    return { t: 'check' };
  }

  /* ---------- la cagnotte du téléphone ----------
     Le marqueur gg-poker-open dit : « ce téléphone est assis à la table
     gameId ; il a payé ses achats (cave + recaves) ; s'il disparaît, il faut
     lui rendre `invested` » — c'est-à-dire sa PILE du moment, pas sa mise de
     départ. La coque rembourse `invested` d'un marqueur orphelin. */
  function marqueur(m) {
    try {
      if (m === undefined) return JSON.parse(localStorage.getItem('gg-poker-open') || 'null');
      if (m) localStorage.setItem('gg-poker-open', JSON.stringify(m));
      else localStorage.removeItem('gg-poker-open');
    } catch (e) { return null; }
    return null;
  }

  /* La cagnotte rattrape l'état de la table : premier passage = on s'assoit
     avec sa pile (débitée) ; ensuite chaque recave acceptée par la table est
     débitée UNE fois (une recave annulée par une reprise est rendue). */
  function reconcilier(s, me) {
    if (!GG.wallet || !s || !s.gameId || !s.players || !s.players[me]) return;
    var p = s.players[me];
    var achats = typeof p.achats === 'number' ? p.achats : START_CHIPS;
    var mk = marqueur();
    if (!mk || mk.gameId !== s.gameId) {
      if (s.finished || p.out) return;
      // une vieille table abandonnée (autre partie) : sa pile revient
      if (mk && mk.invested > 0 && !mk.amical) GG.wallet.add(mk.invested);
      var assise = p.chips;
      if (assise > 0 && !GG.wallet.spend(assise)) {
        marqueur({ gameId: s.gameId, amical: true }); // partie amicale : rien ne sera encaissé
        return;
      }
      marqueur({ gameId: s.gameId, achats: achats, invested: p.chips });
      return;
    }
    if (mk.amical) return;
    if (typeof mk.achats === 'number') {
      var d = achats - mk.achats;
      if (d > 0) { if (!GG.wallet.spend(d)) GG.wallet.retire(d); }
      else if (d < 0) GG.wallet.add(-d);
    }
    mk.achats = achats;
    mk.invested = p.chips;
    marqueur(mk);
  }

  var mod = {
    id: 'poker',
    nom: 'Poker',
    icone: '🃏',
    desc: 'Texas Hold’em entre amis ou contre des robots : cash game (recaves) ou tournoi (blinds montantes).',
    regles: '<p><strong>🎯 Le but :</strong> gagner les jetons des autres au Texas Hold’em.</p>' +
      '<p><strong>Comment jouer :</strong> 2 cartes secrètes en main, 5 cartes communes au centre : la meilleure main de 5 cartes gagne le pot. Misez, suivez, relancez… ou bluffez et couchez tout le monde !</p>' +
      '<p><strong>Deux modes :</strong> cash game (blinds fixes, recave possible) ou tournoi (blinds qui doublent toutes les 6 mains, le dernier survivant rafle tout).</p>' +
      '<p><strong>🤖 Seul contre les robots :</strong> trois niveaux. Le robot facile joue large et passif ; le moyen lit les mises ; le difficile calcule ses chances, déduit vos mains de vos actions, repère qui fait tapis à tout va ou suit tout, et bluffe à bon escient. En cash game, un robot se recave deux fois, puis quitte la table ruiné. Réglez la vitesse (⏩ normale ou rapide) en haut de la table.</p>' +
      '<p><strong>🪙 La cagnotte :</strong> votre pile (100 au départ) et chaque recave sortent de la cagnotte du téléphone ; votre pile y retourne quand vous quittez la table. Appli fermée ou rechargée : vous retrouvez la partie et exactement votre pile. Quitter en pleine main, c’est se coucher : les jetons déjà misés restent dans le pot.</p>' +
      '<p><strong>♻️ Se recaver :</strong> en cash game, entre deux mains, un bouton remet votre tapis à 100.</p>' +
      '<p><strong>⏱️ En ligne :</strong> chacun a 25 secondes pour parler (l’anneau autour de sa plaque se vide) ; passé ce délai, il fait « parole » s’il le peut, sinon il se couche. La main suivante part toute seule après 15 secondes.</p>' +
      '<p><strong>💰 Miser ce que vous voulez :</strong> le bouton « Relancer à N » (ou « Miser N ») envoie la mise ; réglez le montant juste dessous avec − / +, le curseur, ou les raccourcis Min, ½ pot, Pot et Tapis.</p>' +
      '<p><strong>🃏 Votre main en direct :</strong> sous vos cartes, le jeu nomme la meilleure combinaison que vous tenez (« Paire de six », « Couleur à l’as »…). À l’abattage, les 5 cartes gagnantes brillent et le pot file vers le gagnant.</p>',
    min: 2, max: 4,
    hotseat: false, hidden: true, netOnly: true,
    niveaux: ['facile', 'moyen', 'difficile'],

    create: function (names, ctx) {
      var solo = !!(ctx && ctx.niveau);
      var vitesse = 'normal';
      if (solo) {
        try { if (localStorage.getItem(CLE_VITESSE) === 'rapide') vitesse = 'rapide'; } catch (e) {}
      }
      return {
        players: names.map(function (n) {
          return {
            name: n, chips: START_CHIPS, hole: [], bet: 0, cont: 0,
            folded: false, allin: false, out: false, show: false,
            achats: START_CHIPS, recaves: 0, absences: 0,
            h: { vpip: 0, pfr: 0, relPre: 0, tapisPre: 0, agrPost: 0 }
          };
        }),
        // identifiant de table : chaque téléphone y accroche sa pile (cagnotte)
        gameId: 'pk' + Date.now() + '-' + Math.floor(Math.random() * 1e6),
        mode: null,       // choisi par l'hôte : 'cash' | 'tournoi'
        solo: solo,       // seul contre des robots (sièges 1…)
        niveau: solo ? ctx.niveau : null,
        vitesse: vitesse,
        handNum: 0,
        blinds: BLINDS.slice(),
        dealer: -1,
        community: [],
        handOver: true,
        handMsg: '',
        current: -1,
        finished: false,
        winner: -1,
        tourId: 0,
        echeance: 0,
        obs: []
      };
    },

    turnOf: function (state) { return state.finished || state.handOver ? -1 : state.current; },
    over: function (state) { return state.finished; },
    scoreOf: function (state, i) { return state.players[i].out ? '—' : state.players[i].chips + ' 🪙'; },

    gagnants: function (state) {
      if (state.mode === 'tournoi' && state.winner >= 0) return [state.winner];
      var best = -1;
      state.players.forEach(function (p) { if (!p.out && p.chips > best) best = p.chips; });
      var g = [];
      state.players.forEach(function (p, i) { if (!p.out && p.chips === best) g.push(i); });
      return g.length === 1 ? g : [];
    },

    summary: function (state) {
      var rows = state.players.map(function (p) { return { n: p.name, s: p.chips, out: p.out }; })
        .sort(function (a, b) { return b.s - a.s; });
      var tete = state.mode === 'tournoi' && state.winner >= 0
        ? GG.esc(state.players[state.winner].name)
        : rows.filter(function (r) { return r.s === rows[0].s; }).map(function (r) { return GG.esc(r.n); }).join(' & ');
      return '<h1>🏆 ' + tete + '</h1>' + rows.map(function (r) {
        return '<div class="final-line"><span>' + GG.esc(r.n) + '</span><strong>' +
          (r.out && !r.s ? 'éliminé' : r.s + ' 🪙') + '</strong></div>';
      }).join('') + '<p class="hint">' + state.handNum + (state.handNum > 1 ? ' mains jouées' : ' main jouée') + '.</p>';
    },

    redact: function (state, viewer) {
      var copy = GG.clone(state);
      copy.deck = [];
      copy.players.forEach(function (p, i) {
        if (i !== viewer && !p.show) p.hole = p.hole.map(function () { return -1; });
        delete p.rank;
      });
      return copy;
    },

    /* ---- Cagnotte du téléphone (jamais dans apply : locale à l'appareil) ---- */
    _marker: marqueur,

    /* Règle les comptes du joueur local : sa pile (hors jetons déjà misés
       dans une main en cours) retourne dans la cagnotte, la table est
       libérée. Appelé en fin de partie (render), quand on quitte (coque) et
       quand on renonce à reprendre une partie enregistrée (coque). */
    cashout: function (state, me) {
      if (!GG.wallet || !state || !state.gameId) return;
      var mk = marqueur();
      if (!mk || mk.gameId !== state.gameId) return;
      if (mk.amical) { marqueur(null); return; }
      normaliser(state);
      reconcilier(state, me);
      var p = state.players[me];
      GG.wallet.add(p ? p.chips : (mk.invested || 0));
      marqueur(null);
    },

    apply: function (state, player, action) {
      if (!action || typeof action.t !== 'string') return { ok: false, error: 'Action invalide.' };
      normaliser(state);
      if (state.finished) return { ok: false, error: 'Partie terminée.' };
      var t = action.t;

      if (t === 'mode') {
        if (state.mode) return { ok: false, error: 'Mode déjà choisi.' };
        if (player !== 0) return { ok: false, error: 'Seul l’hôte choisit le mode.' };
        if (action.m !== 'cash' && action.m !== 'tournoi') {
          return { ok: false, error: 'Mode inconnu.' };
        }
        state.mode = action.m;
        newHand(state);
        return fait(state);
      }
      if (t === 'vitesse') {
        if (!state.solo || player !== 0) return { ok: false, error: 'La vitesse se règle seul contre les robots.' };
        state.vitesse = action.v === 'rapide' ? 'rapide' : 'normal';
        return { ok: true, timer: planifier(state) };
      }
      if (!state.mode) return { ok: false, error: 'Le mode n’est pas encore choisi.' };

      /* ---- les minuteurs (et le chien de garde de l'écran, seul) ---- */
      if (t === 'robot') {
        if (!(player === -1 || (state.solo && player === 0))) return { ok: false, error: 'Action réservée à la table.' };
        if (!state.solo || state.handOver || action.id !== state.tourId || state.current <= 0) return { ok: true };
        var qui = state.current;
        var a = decide(GG.clone(state), qui, state.niveau || state.niveauIA || 'moyen');
        var res = a ? mod.apply(state, qui, a) : { ok: false };
        if (!res.ok) res = mod.apply(state, qui, state.maxBet > state.players[qui].bet ? { t: 'fold' } : { t: 'check' });
        return res.ok ? res : { ok: true };
      }
      if (t === 'delai') {
        if (player !== -1) return { ok: false, error: 'Action réservée à la table.' };
        if (state.solo || state.handOver || action.id !== state.tourId || state.current < 0 ||
            Date.now() < (state.echeance || 0) - 300) return { ok: true };
        var absent = state.players[state.current];
        absent.absences = (absent.absences || 0) + 1;
        var doit = state.maxBet - absent.bet;
        var idx = state.current;
        if (doit > 0) {
          absent.folded = true;
          noter(state, idx, 'Couché ⏱️', 'se couche (temps écoulé)');
        } else {
          noter(state, idx, 'Parole ⏱️', 'fait parole (temps écoulé)');
        }
        state.need[idx] = false;
        afterAction(state);
        return fait(state);
      }
      if (t === 'suite') {
        if (!(player === -1 || (state.solo && player === 0))) return { ok: false, error: 'Action réservée à la table.' };
        if (!state.handOver || action.h !== state.handNum) return { ok: true };
        if (player === -1 && Date.now() < (state.echeance || 0) - 300) return { ok: true };
        if (state.solo && (state.players[0].out || state.players[0].chips <= 0)) return { ok: true };
        newHand(state);
        return fait(state);
      }

      if (t === 'rebuy') {
        if (state.mode !== 'cash') return { ok: false, error: 'Recave possible en cash game uniquement.' };
        var rp = state.players[player];
        if (!rp || rp.out) return { ok: false, error: 'Joueur inconnu.' };
        if (estRobot(state, player)) return { ok: false, error: 'Les robots se recavent seuls.' };
        if (rp.chips >= START_CHIPS) {
          return { ok: false, error: 'Votre tapis est déjà au maximum (' + START_CHIPS + ').' };
        }
        // on peut se recaver (ou compléter son tapis) entre deux mains, ou
        // pendant une main à laquelle on ne participe pas
        if (!state.handOver && rp.hole && rp.hole.length && !rp.folded) {
          return { ok: false, error: 'Recave possible à la fin de la main.' };
        }
        var ajout = START_CHIPS - rp.chips;
        rp.chips = START_CHIPS;
        rp.achats = (rp.achats || START_CHIPS) + ajout;
        state.handMsg = rp.name + ' recave ' + ajout + ' 🪙 (tapis à ' + START_CHIPS + ').';
        noterTable(state, rp.name + ' recave ' + ajout);
        return { ok: true, timer: state.handOver ? planifier(state) : undefined };
      }
      if (t === 'next') {
        if (!state.handOver) return { ok: false, error: 'La main n’est pas finie.' };
        if (player < 0 || !state.players[player]) return { ok: false, error: 'Joueur inconnu.' };
        newHand(state);
        return fait(state);
      }
      if (state.handOver) return { ok: false, error: 'Main terminée.' };
      if (player !== state.current) return { ok: false, error: 'Ce n’est pas votre tour.' };
      var p = state.players[player];
      var owe = state.maxBet - p.bet;
      var o = obs(state, player);
      var pre = state.street === 'pre';
      p.absences = 0;

      if (t === 'fold') {
        p.folded = true;
        noter(state, player, 'Couché', 'se couche');
        if (owe > 0) { o.face++; o.couche++; }
        state.need[player] = false;
        afterAction(state);
        return fait(state);
      }
      if (t === 'check') {
        if (owe > 0) return { ok: false, error: 'Il faut suivre (' + owe + ') ou se coucher.' };
        noter(state, player, 'Parole', 'fait parole');
        if (!pre) o.pas++;
        state.need[player] = false;
        afterAction(state);
        return fait(state);
      }
      if (t === 'call') {
        if (owe <= 0) return { ok: false, error: 'Rien à suivre : parole.' };
        var mis = post(state, player, owe);
        noter(state, player, (p.allin ? 'Tapis ' : 'Suit ') + mis,
          (p.allin ? 'suit à tapis (' + mis + ')' : 'suit ' + mis));
        o.face++;
        if (pre) { if (!p.h.vpip) { p.h.vpip = 1; o.vpip++; } }
        else o.pas++;
        state.need[player] = false;
        afterAction(state);
        return fait(state);
      }
      if (t === 'raise' || t === 'allin') {
        var by;
        if (t === 'allin') {
          by = p.chips - owe; // tout ce qui dépasse le call
        } else {
          by = action.by;
          if (typeof by !== 'number' || !isFinite(by) || Math.floor(by) !== by) return { ok: false, error: 'Montant invalide.' };
          if (by < state.minRaise) return { ok: false, error: 'Relance minimale : ' + state.minRaise + '.' };
          if (owe + by > p.chips) return { ok: false, error: 'Pas assez de jetons (utilisez Tapis).' };
        }
        var fullRaise = by >= state.minRaise;
        var verse = post(state, player, owe + Math.max(by, 0));
        noter(state, player,
          (p.allin ? 'TAPIS ' : (state.maxBet > 0 ? 'Relance ' : 'Mise ')) + p.bet,
          (p.allin ? 'fait tapis à ' + p.bet
            : (state.maxBet > 0 ? 'relance à ' + p.bet : 'mise ' + p.bet)) +
          ' (' + verse + ' versés)');
        if (pre) {
          if (!p.h.vpip) { p.h.vpip = 1; o.vpip++; }
          if (by > 0 && !p.h.pfr) { p.h.pfr = 1; o.pfr++; }
          if (by > 0) p.h.relPre = (state.relances || 0) + 1;
          if (p.allin && !p.h.tapisPre) { p.h.tapisPre = 1; o.tapis++; }
        } else {
          o.agr++;
          p.h.agrPost = (p.h.agrPost || 0) + 1;
        }
        if (p.bet > state.maxBet) {
          var raised = p.bet - state.maxBet;
          state.maxBet = p.bet;
          state.relances = (state.relances || 0) + 1;
          // toute augmentation rouvre la parole : chacun doit suivre ou se
          // coucher, même face à un tapis « incomplet » ; seule une VRAIE
          // relance remonte le minimum de sur-relance
          if (fullRaise) state.minRaise = raised;
          state.players.forEach(function (q, i) {
            if (i !== player && canPlay(q) && !q.out && q.bet < state.maxBet) {
              state.need[i] = true;
            }
          });
        }
        state.need[player] = false;
        afterAction(state);
        return fait(state);
      }
      return { ok: false, error: 'Action inconnue.' };
    },

    /* L'adversaire IA. Seul contre l'ordinateur, ce sont les minuteurs de la
       table qui font jouer les robots à leur rythme (vitesse réglable) :
       la pompe de la coque n'a rien à faire. Ailleurs (tests, simulations),
       le robot répond directement. */
    bot: function (state, me, ctx) {
      if (!state || state.solo) return null;
      normaliser(state);
      return decide(state, me, (ctx && ctx.niveau) || state.niveauIA || state.niveau || 'moyen');
    },

    render: function (el, ctx) { rendu(el, ctx); },

    _rank5: rank5, _best7: best7, _cmp: cmpRank, // exposés pour les tests
    _nomMain: nomMain, _nomMainVive: nomMainVive, _meilleure: meilleure,
    _cinqQuiJouent: cinqQuiJouent, _eval7: eval7, _forcePreflop: forcePreflop,
    _decide: function (s, i, niveau) { normaliser(s); return decide(s, i, niveau); },
    _equite: equite, _construirePots: construirePots,
    _reconcilier: function (s, me) { normaliser(s); reconcilier(s, me); },
    START_CHIPS: START_CHIPS
  };

  /* ======================================================================
   *  L'AFFICHAGE
   * ====================================================================== */

  /* de vraies cartes à jouer (js/games/cartes.js) */
  function carteHtml(c, classe, attrs) {
    var o = { classe: classe || '', attrs: attrs || '' };
    if (c === -1 || c === undefined || c === null) return GG.carteDos(o);
    return GG.carte(c >> 2, c & 3, o);
  }

  var POSITIONS = { 2: ['sb', 'st'], 3: ['sb', 'stl', 'str'], 4: ['sb', 'sl', 'st', 'sr'] };
  var NOMS_ROBOTS_COUL = ['#ff8a3d', '#2fd4ff', '#ff4f9a', '#8b5cff'];

  function texteLog(s, l) {
    if (typeof l === 'string') return GG.esc(l); // ancien format
    if (l.i < 0) return '— ' + GG.esc(l.t) + ' —';
    var p = s.players[l.i];
    return (p ? '<b>' + GG.esc(p.name.replace(/^🤖 /, '')) + '</b> ' : '') + GG.esc(l.t);
  }

  /* L'état affiché chez un invité vient de l'hôte, qui peut être
     malveillant : chaque nombre qui finit dans le HTML est d'abord ramené à
     un vrai nombre (une « pile » qui contiendrait du HTML devient 0). */
  function nb(x) { return typeof x === 'number' && isFinite(x) ? x : 0; }
  function assainir(s) {
    ['handNum', 'maxBet', 'minRaise', 'delaiMs', 'echeance', 'tourId', 'dealer', 'current'].forEach(function (k) { s[k] = nb(s[k]); });
    s.blinds = [nb(s.blinds && s.blinds[0]), nb(s.blinds && s.blinds[1])];
    if (!Array.isArray(s.community)) s.community = [];
    s.community = s.community.map(nb);
    s.players.forEach(function (p) {
      ['chips', 'bet', 'cont', 'achats', 'recaves'].forEach(function (k) { p[k] = nb(p[k]); });
      p.name = String(p.name == null ? '' : p.name);
      p.hole = Array.isArray(p.hole) ? p.hole.map(function (c) { return c === -1 ? -1 : nb(c); }) : [];
      if (p.lastAct != null) p.lastAct = String(p.lastAct);
    });
    if (s.resultat) {
      s.resultat.pot = nb(s.resultat.pot);
      if (!Array.isArray(s.resultat.gagnants)) s.resultat.gagnants = [];
      if (!Array.isArray(s.resultat.lignes)) s.resultat.lignes = [];
      var g = {};
      Object.keys(s.resultat.gains || {}).forEach(function (k) { g[nb(+k)] = nb(s.resultat.gains[k]); });
      s.resultat.gains = g;
    }
    return s;
  }

  function rendu(el, ctx) {
    var s = assainir(normaliser(ctx.state));
    var me = ctx.me;
    var my = s.players[me];
    var fx = GG.fx, sfx = GG.sfx;
    var now = Date.now();
    var reduit = fx.reduced && fx.reduced();

    /* Cagnotte : on s'assoit (sa pile est débitée), chaque recave est
       débitée une fois, et on encaisse sa pile quand la partie se termine. */
    if (GG.wallet && s.gameId && my) {
      if (s.finished) {
        var mkF = marqueur();
        if (mkF && mkF.gameId === s.gameId) mod.cashout(s, me);
      } else {
        reconcilier(s, me);
      }
    }

    // le chien de garde (seul contre les robots) est réarmé à chaque rendu
    clearTimeout(el._pkChien);

    /* ---- choix du mode par l'hôte ---- */
    if (!s.mode) {
      var html0 = '<div class="pk-accueil">' +
        '<div class="pk-accueil-titre"><span class="pk-accueil-cartes">' +
        carteHtml(48) + carteHtml(44) + '</span>Texas Hold’em</div>';
      if (me === 0) {
        html0 += '<p class="mini-msg">Choisissez le mode de jeu :</p>' +
          '<div class="pk-modes">' +
          '<button class="btn big pk-mode-btn" data-a=\'{"t":"mode","m":"cash"}\'><span class="pk-mode-ic">💵</span><span>Cash game' +
          '<small>Blinds fixes 1/2 · recave à volonté</small></span></button>' +
          '<button class="btn big primary pk-mode-btn" data-a=\'{"t":"mode","m":"tournoi"}\'><span class="pk-mode-ic">🏆</span><span>Tournoi' +
          '<small>Blinds qui doublent · dernier survivant</small></span></button>' +
          '</div>';
        if (s.solo) {
          html0 += '<div class="pk-vitesse-choix"><span>Vitesse des robots</span>' +
            '<button class="cz-opt' + (s.vitesse !== 'rapide' ? ' on' : '') + '" data-v="normal">▶ Normale</button>' +
            '<button class="cz-opt' + (s.vitesse === 'rapide' ? ' on' : '') + '" data-v="rapide">⏩ Rapide</button></div>';
        }
      } else {
        html0 += '<p class="waiting">⏳ L’hôte choisit le mode de jeu…</p>';
      }
      html0 += '</div>';
      el.innerHTML = html0;
      el.querySelectorAll('[data-a]').forEach(function (b) {
        b.addEventListener('click', function () {
          if (el._pkModeFait) return;
          el._pkModeFait = true;
          sfx.play('shuffle');
          if (ctx.act(JSON.parse(b.dataset.a)) === false) el._pkModeFait = false;
        });
      });
      el.querySelectorAll('.pk-vitesse-choix [data-v]').forEach(function (b) {
        b.addEventListener('click', function () {
          try { localStorage.setItem(CLE_VITESSE, b.dataset.v); } catch (e) {}
          sfx.play('toggle');
          ctx.act({ t: 'vitesse', v: b.dataset.v });
        });
      });
      return;
    }
    el._pkModeFait = false;

    var n = s.players.length;
    var POS = POSITIONS[n] || POSITIONS[4];
    function posDe(i) { return POS[(i - me + n) % n]; }

    /* ---- la chronologie des animations, gardée sur l'écran ---- */
    var cleMain = s.gameId + ':' + s.handNum;
    var T = el._pkT;
    if (!T || T.cle !== cleMain) {
      T = el._pkT = { cle: cleMain, cartes: {}, curseur: now, fait: {}, mises: {}, rue: s.street, potVu: null, pilesVues: null };
    }
    var curseur = Math.max(T.curseur, now);
    var VOL = 300, DT = 150;
    var vols = [];
    function inscrire(k, c, dt, retourne) {
      var info = T.cartes[k];
      if (!info) {
        info = T.cartes[k] = { t: curseur, c: c };
        curseur += dt;
        vols.push({ k: k, t: info.t });
      } else if (info.c === -1 && c !== -1 && retourne) {
        info.c = c; info.rev = curseur; curseur += 320;
      }
      return info;
    }
    function carteAnimee(k, c, classe) {
      var info = T.cartes[k] || inscrire(k, c, DT);
      var debut = info.rev ? info.rev : info.t + VOL;
      var anim = '';
      if (!reduit && debut + 450 > now) anim = (c === -1 ? 'jc-arrive' : 'jc-retourne');
      var h = carteHtml(c, (classe || '') + (anim ? ' ' + anim : ''), ' data-k="' + k + '"');
      if (anim) h = h.replace('<span class="jc', '<span style="--d:' + (debut - now) + 'ms" class="jc');
      return h;
    }
    // la donne : deux tours de table à partir du donneur, puis le tapis
    var ordre = [];
    for (var o1 = 1; o1 <= n; o1++) {
      var io = (s.dealer + o1) % n;
      if (s.players[io] && s.players[io].hole && s.players[io].hole.length) ordre.push(io);
    }
    if (!T.cartes.donne) {
      T.cartes.donne = { t: 0, c: 0 };
      if (s.street === 'pre' && !s.handOver) {
        for (var tr = 0; tr < 2; tr++) {
          ordre.forEach(function (i) { inscrire('h' + i + tr, s.players[i].hole[tr], DT); });
        }
      } else {
        // on arrive en pleine main (reprise, invité qui revient) : pas de donne rejouée
        ordre.forEach(function (i) {
          s.players[i].hole.forEach(function (c, j) { T.cartes['h' + i + j] = { t: now - 5000, c: c }; });
        });
        (s.community || []).forEach(function (c, j) { T.cartes['b' + j] = { t: now - 5000, c: c }; });
      }
    }
    // le tapis : le flop d'un coup (trois cartes à la suite), puis turn, river
    (s.community || []).forEach(function (c, j) { inscrire('b' + j, c, j < 2 ? 110 : 300); });
    // l'abattage : les cartes adverses se retournent une à une
    ordre.forEach(function (i) {
      (s.players[i].hole || []).forEach(function (c, j) { inscrire('h' + i + j, c, DT, true); });
    });
    var finCartes = curseur;

    /* À l'abattage, les 5 cartes qui font gagner brillent ; les autres
       cartes du tapis et du gagnant s'estompent (comme dans les applis). */
    var brillent = s.handOver && s.resultat && s.resultat.cinq;
    var finRevelation = finCartes;
    function eclat(c, concerne) {
      if (!brillent) return '';
      if (brillent.indexOf(c) !== -1) return 'gagnante';
      return concerne ? 'terne' : '';
    }

    /* ---- l'anneau de parole : durée totale, temps déjà écoulé (vu d'ici) ---- */
    var tour = null;
    if (!s.handOver && s.current >= 0) {
      var cleTour = s.gameId + ':' + s.tourId;
      if (!el._pkTour || el._pkTour.cle !== cleTour) {
        var total = s.delaiMs || 0;
        var restant = total;
        // seul, l'échéance vient de ce téléphone ; en ligne, l'horloge de
        // l'hôte peut différer de la nôtre : le tour commence quand on le voit
        if (s.solo && s.echeance) restant = Math.max(0, Math.min(total, s.echeance - now));
        el._pkTour = { cle: cleTour, t0: now - (total - restant), total: total };
      }
      tour = el._pkTour;
    }

    var html = '<div class="pk2' + (s.solo ? ' solo' : '') + '">';
    // le bandeau : mode, blinds, vitesse
    html += '<div class="pk-mode">' +
      '<span class="pk-mode-t">' + (s.mode === 'cash' ? '💵 Cash' : '🏆 Tournoi') +
      ' · blinds <b>' + s.blinds[0] + '/' + s.blinds[1] + '</b>' +
      (s.mode === 'tournoi' ? ' <small>(×2 toutes les 6 mains)</small>' : '') + '</span>' +
      '<span class="pk-mode-n">Main ' + s.handNum + '</span>' +
      (s.solo && me === 0 ? '<button class="cz-opt pk-vitesse' + (s.vitesse === 'rapide' ? ' on' : '') +
        '" id="pk-vitesse" aria-label="Vitesse des robots">' + (s.vitesse === 'rapide' ? '⏩ Rapide' : '▶ Normal') + '</button>' : '') +
      '</div>';

    html += '<div class="pk-oval n' + n + '"><div class="pk-feutre cz-feutre"></div>';
    // le centre : le pot, le sabot, puis les cartes communes (5 emplacements)
    var potAff = s.handOver && s.resultat ? s.resultat.pot : potTotal(s);
    html += '<div class="pk-center">' +
      '<div class="pk-pot" id="pk-pot"><span class="pk-pot-pile">' + (potAff ? GG.pileJetons(potAff, { max: 6 }) : '') + '</span>' +
      'Pot <b id="pk-pot-n">' + potAff + '</b></div>' +
      '<div class="pk-community">';
    for (var bj = 0; bj < 5; bj++) {
      var cb = s.community[bj];
      html += cb !== undefined
        ? carteAnimee('b' + bj, cb, eclat(cb, true))
        : '<span class="pk-emplacement"></span>';
    }
    html += '</div><div class="pk-sabot" aria-hidden="true"></div></div>';

    s.players.forEach(function (p, i) {
      var pos = posDe(i);
      var cls = 'pk-seat ' + pos;
      if (i === s.current && !s.handOver) cls += ' turn';
      if (p.folded && !p.out) cls += ' folded';
      if (p.out) cls += ' out';
      var gagnant = s.resultat && s.resultat.gagnants.indexOf(i) !== -1;
      if (gagnant && s.handOver) cls += ' gagne';
      var montre = i !== me && p.show;
      var cartes = (p.out || p.folded || !p.hole) ? '' :
        p.hole.map(function (c, j) {
          var vue = i === me ? c : (p.show ? c : -1);
          return carteAnimee('h' + i + j, vue, vue === -1 ? '' : eclat(c, gagnant));
        }).join('');
      var robot = p.name.indexOf('🤖') === 0;
      var nom = p.name.replace(/^🤖 /, '');
      // ma main, nommée en direct sous mes cartes : « Paire de six »…
      var maMain = (i === me && cartes) ? nomMainVive(p.hole, s.community) : '';
      var annonce = p.lastAct && !s.handOver;
      // l'annonce « Tapis 98 » / « Couché » dit déjà ce que dirait l'étiquette
      var redite = annonce && /^(tapis|couché)/i.test(p.lastAct);
      var anneau = '';
      if (tour && i === s.current && tour.total > 0 && (!s.solo || i !== me)) {
        anneau = '<svg class="pk-anneau' + (s.solo ? ' robot' : '') + '" viewBox="0 0 40 40" aria-hidden="true">' +
          '<circle cx="20" cy="20" r="18" pathLength="100" style="animation-duration:' + tour.total +
          'ms;animation-delay:-' + Math.min(tour.total, now - tour.t0) + 'ms"></circle></svg>';
      }
      var couleur = robot ? NOMS_ROBOTS_COUL[i % 4] : (i === me ? '#ffc23d' : NOMS_ROBOTS_COUL[(i + 2) % 4]);
      html += '<div class="' + cls + '" data-seat="' + i + '">' +
        '<div class="pk-scards' + (i === me ? ' mine' : '') + (montre && cartes ? ' montre' : '') + '">' +
        cartes + '</div>' +
        (maMain ? '<div class="pk-mamain">' + maMain + '</div>' : '') +
        '<div class="pk-plate">' +
        '<span class="pk-avatar" style="--av:' + couleur + '">' + (robot ? '🤖' : GG.esc(nom.charAt(0).toUpperCase())) + anneau + '</span>' +
        '<span class="pk-pinfo"><span class="pk-pname">' + GG.esc(nom) + '</span>' +
        '<span class="pk-pstack" data-pile="' + i + '">' + (p.out ? 'parti' : p.chips + ' 🪙') + '</span></span>' +
        // le trophée se pose sur la plaque du gagnant
        (gagnant && s.handOver ? '<span class="pk-trophee">🏆</span>' : '') +
        '</div>' +
        (redite ? '' :
          (p.allin && !p.out ? '<span class="pk-tag' + (annonce ? ' gauche' : '') + '">TAPIS</span>' :
            (p.folded && !p.out ? '<span class="pk-tag grey' + (annonce ? ' gauche' : '') + '">couché</span>' : ''))) +
        (annonce ? '<span class="pk-annonce' + (/^(Relance|Mise|TAPIS)/.test(p.lastAct) ? ' fort' : '') + '">' + GG.esc(p.lastAct) + '</span>' : '') +
        '</div>';
      // la mise de la rue en jetons devant le siège, et le bouton du donneur
      if (!p.out && (p.bet > 0 || i === s.dealer)) {
        html += '<div class="pk-betspot ' + pos + '" data-mise="' + i + '">' +
          (p.bet > 0 ? GG.pileJetons(p.bet, { max: 5, classe: 'pk-chip' }) + '<span class="pk-betamt">' +
            p.bet + '</span>' : '') +
          (i === s.dealer ? '<span class="pk-dbtn">D</span>' : '') + '</div>';
      }
    });
    html += '</div>';

    // fin de main : un vrai panneau d'abattage, qui reste à l'écran
    if (s.handOver && s.resultat) {
      var r = s.resultat;
      html += '<div class="pk-fin"' + (r.sansAbattage ? '' : ' style="--d:' + Math.max(-2000, finRevelation - now) + 'ms"') + '>';
      html += '<div class="pk-fin-titre">' + r.lignes.map(function (l) { return '🏆 ' + GG.esc(l); }).join('<br>') + '</div>';
      if (r.mains && r.mains.length) {
        html += '<div class="pk-abat">';
        r.mains.forEach(function (m) {
          var pj = s.players[m.i];
          var win = r.gagnants.indexOf(m.i) !== -1;
          html += '<div class="pk-abat-l' + (win ? ' win' : '') + '">' +
            '<span class="pk-abat-n">' + (win ? '🏆 ' : '') + GG.esc(pj.name) + '</span>' +
            '<span class="pk-abat-c">' +
            (pj.hole || []).map(function (c) {
              return carteHtml(c, c === -1 ? '' : eclat(c, win));
            }).join('') +
            '</span><span class="pk-abat-m">' + GG.esc(m.cat) + '</span></div>';
        });
        html += '</div>';
      }
      html += '</div>';
    } else if (s.handMsg) {
      html += '<p class="mini-msg pk-msg">' + GG.esc(s.handMsg) + '</p>';
    }

    var peutRecaver = s.mode === 'cash' && my && !my.out && my.chips < START_CHIPS &&
      (s.handOver || my.folded || !my.hole || !my.hole.length);
    if (peutRecaver) {
      html += '<button class="btn big' + (my.chips === 0 ? ' or' : '') + ' pk-recave" data-a=\'{"t":"rebuy"}\'>🪙 ' +
        (my.chips === 0 ? 'Recaver' : 'Compléter mon tapis') + ' — ' +
        (START_CHIPS - my.chips) + ' de la cagnotte</button>';
    }
    var libelle = null, miseMin = 0, miseMax = 0, cleCurseur = '';
    if (s.handOver && !s.finished) {
      var auto = s.echeance && s.echeance > now && (!s.solo || (my && my.chips > 0));
      html += '<button class="btn big primary pk-suivante" data-a=\'{"t":"next"}\'>' +
        (s.handNum === 0 ? 'Distribuer' : 'Main suivante') +
        (auto ? '<span class="pk-compte" style="animation-duration:' + (s.echeance - now) + 'ms"></span>' : '') +
        '</button>';
    } else if (my && me === s.current && !s.handOver) {
      var owe = s.maxBet - my.bet;
      /* Choisir SON montant : on raisonne comme à une vraie table, en
         « relancer à N » (le total posé sur la rue), pas en « +N ». */
      miseMin = s.maxBet + s.minRaise;      // relance minimale légale
      miseMax = my.bet + my.chips;          // tapis
      var libre = miseMax > miseMin;            // un vrai choix de montant ?
      var potMtn = potTotal(s);
      var depart = libre
        ? Math.min(miseMax, Math.max(miseMin, s.maxBet + Math.max(s.minRaise, Math.round(potMtn / 2))))
        : miseMax;
      /* Un ré-affichage sans changement de donne (recave d'un tiers,
         reconnexion, état renvoyé) ne doit pas effacer le montant que le
         joueur était en train de régler : on le garde sur l'élément. */
      cleCurseur = s.gameId + ':' + s.handNum + ':' + s.street + ':' + s.maxBet + ':' + me;
      if (libre && el._pkCurseur && el._pkCurseur.cle === cleCurseur) {
        depart = Math.max(miseMin, Math.min(miseMax, el._pkCurseur.val));
      }
      /* Le libellé du bouton qui VALIDE : il dit toujours ce qui va partir. */
      libelle = function (v) {
        var quoi = v >= miseMax ? 'Tapis' : (s.maxBet > 0 ? 'Relancer à' : 'Miser');
        return '<small>' + quoi + '</small><span class="pk-v"><b id="pk-mise">' + v + '</b> 🪙</span>';
      };
      html += '<div class="pk-actions">';
      html += '<button class="btn action danger" data-a=\'{"t":"fold"}\'>Se coucher</button>';
      if (owe <= 0) {
        html += '<button class="btn action succes" data-a=\'{"t":"check"}\'>Parole</button>';
      } else {
        html += '<button class="btn action succes" data-a=\'{"t":"call"}\'><small>Suivre</small><b>' + Math.min(owe, my.chips) + '</b></button>';
      }
      if (libre) {
        // le bouton qui envoie la relance vit DANS la rangée d'actions,
        // juste sous la table : visible sans défiler, quel que soit l'écran
        html += '<button class="btn action primary pk-raise-go' +
          (depart >= miseMax ? ' tapis' : '') + '" id="pk-raise-go">' +
          libelle(depart) + '</button>';
      } else {
        html += '<button class="btn action primary pk-raise-go tapis" data-a=\'{"t":"allin"}\'><small>Tapis</small><span class="pk-v"><b>' + my.chips + '</b> 🪙</span></button>';
      }
      html += '</div>';

      if (libre) {
        html += '<div class="pk-raise" data-min="' + miseMin + '" data-max="' + miseMax + '">' +
          '<div class="pk-raise-head">' +
          '<button class="pk-adj" data-adj="-1" aria-label="Moins">−</button>' +
          '<input type="range" id="pk-slider" min="' + miseMin + '" max="' + miseMax +
          '" step="1" value="' + depart + '" aria-label="Montant de la relance">' +
          '<button class="pk-adj" data-adj="1" aria-label="Plus">+</button>' +
          '</div>' +
          '<div class="pk-raise-quick">' +
          '<button class="pk-quick" data-set="' + miseMin + '">Min ' + miseMin + '</button>' +
          (s.maxBet + Math.round(potMtn / 2) > miseMin &&
           s.maxBet + Math.round(potMtn / 2) < miseMax
            ? '<button class="pk-quick" data-set="' + (s.maxBet + Math.round(potMtn / 2)) + '">½ pot</button>' : '') +
          (s.maxBet + potMtn > miseMin && s.maxBet + potMtn < miseMax
            ? '<button class="pk-quick" data-set="' + (s.maxBet + potMtn) + '">Pot ' + (s.maxBet + potMtn) + '</button>' : '') +
          '<button class="pk-quick" data-set="' + miseMax + '">Tapis ' + miseMax + '</button>' +
          '</div>' +
          '</div>';
      }
    } else if (!s.handOver && my && !my.out && s.current >= 0) {
      html += '<p class="waiting pk-attente">' + (s.solo ? '🤖 ' : '⏳ ') + 'À ' + GG.esc(s.players[s.current].name.replace(/^🤖 /, '')) + ' de parler…</p>';
    }

    // le fil de la main : plus rien ne passe inaperçu
    if (s.log && s.log.length) {
      var dernier = s.log[s.log.length - 1];
      html += '<details class="pk-fil"' + (s.handOver ? ' open' : '') + '>' +
        '<summary>📜 Déroulé de la main <span>' + texteLog(s, dernier).replace(/^— | —$/g, '') + '</span></summary>' +
        '<div class="pk-fil-l">' +
        s.log.slice(-14).map(function (l) {
          var rue = typeof l === 'string' ? /^—/.test(l) : l.i < 0;
          return '<div' + (rue ? ' class="rue"' : '') + '>' + texteLog(s, l) + '</div>';
        }).join('') + '</div></details>';
    }
    html += '</div>';

    el.innerHTML = html;
    T.curseur = curseur;

    /* ================= après l'affichage : le mouvement ================= */
    var oval = el.querySelector('.pk-oval');
    var sabot = el.querySelector('.pk-sabot');
    // les cartes volent du sabot jusqu'à leur place
    vols.forEach(function (v) {
      setTimeout(function () {
        var cible = el.querySelector('[data-k="' + v.k + '"]');
        if (!cible || !sabot || !document.body.contains(cible)) return;
        var w = cible.offsetWidth || 30;
        fx.flyTo(sabot, cible, {
          html: '<span class="jc dos" style="--jcw:' + w + 'px"><span class="jc-dos-motif"></span></span>',
          duration: VOL, arc: 0.1, rotate: 12
        });
        sfx.play('deal', { volume: 0.55 });
      }, Math.max(0, v.t - Date.now()));
    });

    /* les jetons : une mise qui grossit file de la plaque vers le tapis ;
       à la rue suivante, les mises glissent au pot ; en fin de main, le pot
       file vers le(s) gagnant(s) */
    var misesAvant = T.mises || {};
    var nouvellesMises = {};
    s.players.forEach(function (p, i) { nouvellesMises[i] = p.bet; });
    var rueChangee = T.rue !== s.street;
    if (!T.fait.premier) {
      T.fait.premier = true; // premier affichage de la main : rien à rejouer
    } else if (rueChangee && !s.handOver && s.street !== 'pre') {
      // les mises de la rue précédente rejoignent le pot
      var potEl = el.querySelector('#pk-pot');
      var k2 = 0;
      Object.keys(misesAvant).forEach(function (i) {
        if (misesAvant[i] > 0 && potEl) {
          var dep = el.querySelector('.pk-seat[data-seat="' + i + '"] .pk-plate');
          if (dep) {
            fx.flyTo(dep, potEl, { html: GG.pileJetons(misesAvant[i], { max: 4 }), duration: 380, arc: 0.05, scaleTo: 0.8 });
            k2++;
          }
        }
      });
      if (k2) sfx.play('chips', { volume: 0.7 });
    } else if (!s.handOver) {
      s.players.forEach(function (p, i) {
        if (p.bet > (misesAvant[i] || 0)) {
          var de = el.querySelector('.pk-seat[data-seat="' + i + '"] .pk-plate');
          var vers = el.querySelector('.pk-betspot[data-mise="' + i + '"] .gg-pile');
          if (de && vers) fx.flyTo(de, vers, { html: GG.jetonHtml(p.bet >= 25 ? 25 : 5, {}), duration: 320, arc: 0.2, scaleTo: 0.7 });
        }
      });
    }
    // le son de chaque parole (une fois)
    var cleParole = s.tourId + ':' + (s.log ? s.log.length : 0);
    if (T.fait.parole !== cleParole && s.log && s.log.length) {
      var avantParole = T.fait.parole;
      T.fait.parole = cleParole;
      var der = s.log[s.log.length - 1];
      if (avantParole !== undefined && typeof der === 'object' && der.i >= 0) {
        var txt = der.t;
        if (/tapis/i.test(txt)) { sfx.play('drop'); GG.haptic('heavy'); }
        else if (/relance|mise/i.test(txt)) sfx.play('chips', { volume: 0.8 });
        else if (/suit/.test(txt)) sfx.play('chip');
        else if (/parole/.test(txt)) sfx.play('tock', { volume: 0.7 });
        else if (/couche/.test(txt)) sfx.play('close', { volume: 0.6 });
        var badge = el.querySelector('.pk-seat[data-seat="' + der.i + '"] .pk-annonce');
        if (badge) fx.pop(badge);
      }
    }
    T.mises = nouvellesMises;
    T.rue = s.street;

    // le pot qui défile
    var potN = el.querySelector('#pk-pot-n');
    if (potN && T.potVu !== null && T.potVu !== potAff && !s.handOver) fx.countUp(potN, T.potVu, potAff, 450);
    T.potVu = potAff;

    // mon tour : un petit signal
    if (my && me === s.current && !s.handOver && T.fait.monTour !== s.tourId) {
      T.fait.monTour = s.tourId;
      setTimeout(function () { sfx.play('notify', { volume: 0.5 }); GG.haptic('select'); }, Math.max(0, finCartes - Date.now()));
    }

    // la fin de la main : révélation, puis le pot file vers le gagnant
    if (s.handOver && s.resultat && !T.fait.fin) {
      T.fait.fin = true;
      var quand = Math.max(0, finRevelation - Date.now()) + 150;
      var gains = s.resultat.gains || {};
      setTimeout(function () {
        var potEl2 = el.querySelector('#pk-pot');
        var jeGagne = false;
        Object.keys(gains).forEach(function (gi) {
          var pl = el.querySelector('.pk-seat[data-seat="' + gi + '"] .pk-plate');
          if (!pl || !potEl2) return;
          for (var k = 0; k < 4; k++) {
            (function (k3) {
              setTimeout(function () {
                fx.flyTo(potEl2, pl, { html: GG.jetonHtml([25, 5, 100, 1][k3], {}), duration: 520, arc: 0.25, scaleTo: 0.8 });
                // (compatibilité : l'ancien vol CSS vers le siège)
                if (oval && k3 === 0) {
                  var j = document.createElement('span');
                  j.className = 'pk-vol vers-' + posDe(+gi);
                  oval.appendChild(j);
                  setTimeout(function () { if (j.parentNode) j.parentNode.removeChild(j); }, 1000);
                }
              }, k3 * 80);
            })(k);
          }
          setTimeout(function () {
            fx.floatText(pl, '+' + gains[gi], { color: '#ffd34d', size: 22 });
            var pileEl = el.querySelector('[data-pile="' + gi + '"]');
            var p2 = s.players[gi];
            if (pileEl && p2) fx.countUp(pileEl, Math.max(0, p2.chips - gains[gi]), p2.chips, 600, function (v) { return v + ' 🪙'; });
          }, 480);
          if (+gi === me) jeGagne = true;
        });
        var pn = el.querySelector('#pk-pot-n');
        if (pn) fx.countUp(pn, s.resultat.pot, 0, 500);
        var pilePot = el.querySelector('.pk-pot-pile');
        if (pilePot) pilePot.classList.add('vide');
        if (jeGagne) {
          sfx.play('coin'); GG.haptic('success');
          if (s.resultat.pot >= 60) fx.confetti({ count: 50, from: 'center' });
          var gagnantes = el.querySelectorAll('.jc.gagnante');
          if (gagnantes.length) fx.burst(gagnantes[0], { count: 14, shape: 'spark', colors: ['#ffd34d', '#fff'] });
        } else {
          sfx.play('chips', { volume: 0.7 });
        }
      }, quand);
    }

    /* ---- l'anneau qui se vide : les dernières secondes s'entendent ---- */
    if (tour && !s.solo && s.current === me && tour.total > 0) {
      clearInterval(el._pkTic);
      el._pkTic = setInterval(function () {
        if (!document.body.contains(el) || el._pkTour !== tour) { clearInterval(el._pkTic); return; }
        var reste = tour.total - (Date.now() - tour.t0);
        if (reste <= 5200 && reste > 0) { sfx.play('tick', { volume: 0.5 }); if (reste < 3200) GG.haptic('light'); }
        if (reste <= 0) clearInterval(el._pkTic);
      }, 1000);
    } else {
      clearInterval(el._pkTic);
    }

    /* ---- le chien de garde (seul) : si le minuteur de la table s'est perdu
       (partie reprise, appli rechargée), l'écran relance le robot ou la
       main suivante lui-même ---- */
    if (s.solo && me === 0 && !s.finished) {
      var action = null, attente = 0;
      if (!s.handOver && s.current > 0) {
        action = { t: 'robot', id: s.tourId };
        attente = Math.max(0, (s.echeance || 0) - now) + 1300;
      } else if (s.handOver && my && my.chips > 0 && !my.out) {
        action = { t: 'suite', h: s.handNum };
        attente = Math.max(0, (s.echeance || 0) - now) + 1300;
      }
      if (action) {
        var gardeCle = s.gameId + ':' + s.tourId + ':' + s.handNum;
        el._pkChienCle = gardeCle;
        el._pkChien = setTimeout(function () {
          if (el._pkChienCle !== gardeCle || !document.body.contains(el) || !el.querySelector('.pk-oval')) return;
          ctx.act(action);
        }, attente);
      }
    }

    /* ================= les gestes ================= */
    var zone = el.querySelector('.pk-raise');
    var valider = el.querySelector('#pk-raise-go:not([data-a])');
    var agi = false; // un seul act par rendu
    function agir(a) {
      if (agi) return false;
      agi = true;
      if (ctx.act(a) === false) { agi = false; return false; }
      return true;
    }
    if (zone && valider && libelle) {
      var slider = el.querySelector('#pk-slider');
      var mn = parseInt(zone.dataset.min, 10);
      var mx = parseInt(zone.dataset.max, 10);
      var poser = function (v) {
        v = Math.max(mn, Math.min(mx, Math.round(v) || mn));
        slider.value = v;
        valider.innerHTML = libelle(v);
        valider.classList.toggle('tapis', v >= mx);
        el._pkCurseur = { cle: cleCurseur, val: v };
      };
      slider.addEventListener('input', function () { poser(+slider.value); sfx.play('tick', { volume: 0.25 }); });
      el.querySelectorAll('.pk-adj').forEach(function (b) {
        b.addEventListener('click', function () {
          poser(+slider.value + parseInt(b.dataset.adj, 10));
          sfx.play('select', { volume: 0.4 });
        });
      });
      el.querySelectorAll('.pk-quick').forEach(function (b) {
        b.addEventListener('click', function () { poser(parseInt(b.dataset.set, 10)); sfx.play('select', { volume: 0.5 }); });
      });
      valider.addEventListener('click', function () {
        var cible = Math.max(mn, Math.min(mx, +slider.value));
        // aller jusqu'au tapis, c'est un tapis : le jeu le sait mieux que nous
        agir(cible >= mx ? { t: 'allin' } : { t: 'raise', by: cible - s.maxBet });
      });
    }

    var vit = el.querySelector('#pk-vitesse');
    if (vit) {
      vit.addEventListener('click', function () {
        var v = s.vitesse === 'rapide' ? 'normal' : 'rapide';
        try { localStorage.setItem(CLE_VITESSE, v); } catch (e) {}
        sfx.play('toggle');
        agir({ t: 'vitesse', v: v });
      });
    }

    el.querySelectorAll('[data-a]').forEach(function (b) {
      b.addEventListener('click', function () {
        var a = JSON.parse(b.dataset.a);
        // la recave : on vérifie que la cagnotte suffit ; c'est l'état de la
        // table (recave acceptée) qui la débitera, une seule fois
        if (a.t === 'rebuy' && GG.wallet) {
          var manque = START_CHIPS - my.chips;
          if (manque <= 0) return;
          if (GG.wallet.get() < manque) {
            b.textContent = '🪙 Pas assez de jetons — Boutique sur l’accueil';
            b.disabled = true;
            sfx.play('wrong');
            return;
          }
          b.disabled = true; // anti double-appui
          sfx.play('chips');
        }
        agir(a);
      });
    });
  }

  GG.register(mod);
  if (typeof module === 'object' && module.exports) module.exports = mod;
})(typeof self !== 'undefined' ? self : globalThis);
