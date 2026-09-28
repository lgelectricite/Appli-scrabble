/* GGgames — Solitaire (Klondike).
 *
 * V2 :
 *  - on joue au doigt : glisser-déposer fluide (les cartes suivent le doigt,
 *    les destinations permises s'allument, la carte s'aimante à sa place),
 *    ou un simple toucher : la carte part d'elle-même vers la meilleure
 *    place (fondation d'abord) ;
 *  - annulation illimitée, indice, pioche 1 ou 3 (les trois cartes en
 *    éventail), donne gagnable garantie (choisie parmi des donnes que le
 *    solveur a gagnées) et défi du jour (la même donne pour tout le monde) ;
 *  - détection « plus aucun coup utile », fin automatique en cascade, et la
 *    célèbre cascade de cartes qui rebondissent à la victoire ;
 *  - colonnes qui se resserrent pour tenir à l'écran, index lisibles même
 *    recouverts.
 * Codage des cartes : couleur × 13 + rang (0 = As … 12 = Roi).
 */
(function (root) {
  'use strict';
  var GG = root.GG;

  var SUITS = ['♠', '♥', '♦', '♣'];
  var RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'V', 'D', 'R'];

  /* Donnes gagnables (trouvées hors ligne par tests/outils/solveur_solitaire.js,
     revérifiées par les tests) : une liste pour la pioche 1, une pour la pioche 3. */
  var GAGNABLES = {
    1: [
      430529049, 996189373, 422852128, 148983288, 1797044892, 1127386591, 1498454265, 341627561,
      177071718, 2034378062, 1331220786, 205391825, 1684270023, 835536976, 765871697, 461702782,
      708287362, 189494805, 970879582, 182934650, 2133217333, 816752384, 1192503511, 327574116,
      408060575, 195743220, 858634005, 779605426, 95982598, 1053761479, 822689967, 799796733,
      51433277, 244618135, 1096903379, 1696808066, 1595857306, 1242116389, 456789179, 1873581380,
      520484222, 1989234018, 1878974567, 1009492612, 666439775, 409346965, 2111843432, 1893066629,
      495101315, 834537091, 1608061650, 1016229360, 1585971786, 506918029, 1118537819, 1652761406,
      1428342976, 2003386224, 2120310647, 557108789, 1525532867, 1782767327, 1996939033, 145599054,
      1645442650, 331990208, 976356454, 1026273972, 1785964870, 1726714602, 2105245778, 1245290151,
      1852005760, 1289879945, 1801447624, 1014552015, 75746230, 1329101136, 966981731, 1855296286,
      496490665, 476374411, 1882519880, 346604675, 2056656795, 701039322, 1064186438, 1534712458,
      361689559, 67427043, 1298783700, 1972767374, 1586551433, 679368126, 1339604299, 917223808,
      1749668466, 2009653070, 1832039686, 1011099446, 474602610, 187041114, 640361906, 441033337,
      1715915410, 508491320, 661006566, 135920260, 444328875, 1279942536, 1001631066, 1286358328,
      227552679, 1963997251, 1298222559, 780842382, 1627703252, 879484503, 2139710417, 588052895,
      1906468311, 1015115390, 1664186351, 1018565792, 551247567, 1948920327, 1516980488, 1267740842,
      1448451672, 438080086, 2018030614, 350056827, 1191761521, 728444355, 1224921541, 1520452760,
      1374058088, 2125528253, 1048097844, 1325705214, 47359887, 1186504969, 392493109, 709124996,
      1430832383, 340904979, 1804537995, 621867031, 617035635, 543007193, 465247868, 1449178437,
      1160015049, 1416852666, 107436902, 1944436754, 1986276552, 853053983, 915037459, 329531893,
      839087484, 2050357744, 1739821335, 401886947, 1265035286, 117176941, 593504380, 18870963,
      387188645, 432902954, 1642607224, 902095170, 510040851, 1554260460, 1217973068, 2067700888,
      1392103029, 1088963400, 1996343672, 571532596, 1875012154, 1738867823, 342857391, 524451215,
      574941673, 1223731756, 2070399494, 1460844303, 1301399673, 1970929577, 921081973, 46491195,
      56062730, 374644610, 510177923, 368248297, 991398268, 1260204880, 1727977558, 1764638591
    ],
    3: [
      318565123, 1458814976, 1060140394, 1649134411, 295842738, 2006037095, 1231485868, 559501621,
      948402619, 286435003, 1004310427, 1772774339, 661752213, 1769308245, 1589864136, 1856099664,
      621644457, 610584316, 1449946208, 1713866991, 413505533, 1612568225, 157868665, 489546537,
      23242751, 90972258, 1936715181, 772897200, 1159482627, 1667079803, 1101950229, 1217051516,
      299091167, 2044647123, 960341860, 796314500, 479902916, 487558047, 1732851895, 2005772895,
      1363189550, 1476340323, 1226660125, 1493375892, 1264011625, 799771811, 1815166849, 438686832,
      733675709, 1107326462, 887673372, 649031605, 2028682708, 1288694668, 421516379, 1757059031,
      1493819910, 665791577, 883507602, 602249466, 697843847, 1069832337, 1692242017, 231438021,
      534779997, 1611798247, 1004143774, 170718317, 849126368, 1375498657, 393278751, 845296909,
      1137801339, 914162844, 1983802855, 1704310328, 623589825, 26162576, 173321660, 1715709903,
      1325881158, 296232918, 1513063052, 1147748622, 43123609, 191504364, 1337537956, 198827021,
      184363497, 238130519, 1465803905, 1458177208, 1747993296, 604416939, 1346429922, 1863448317,
      530044320, 649200362, 1644326316, 132522869, 1805108733, 1153819050, 1010977605, 1481576527,
      1469551678, 459310398, 1045137540, 1541893972, 1629383828, 1051476873, 1565357671, 20533499,
      1182568962, 1523543795, 257553283, 571691210, 941533960, 1589361699, 1225283354, 1805658907,
      1042319008, 386469605, 1809777589, 1712977126, 408505058, 1222439357, 977321694, 374733778,
      519439157, 1504825257, 785620872, 291389939, 1813341266, 362799366, 2106538548, 2043561355,
      88842260, 1102276332, 1925983900, 306790976, 138300308, 1946777141, 1142464138, 1444868286,
      103796301, 1052916793, 851041354, 989480699, 547500302, 1453317860, 1258123511, 999297753,
      324156149, 2108189694, 1617138685, 2018378832, 2126502376, 825348943, 302208409, 45696768,
      362982659, 1448894025, 2098148528, 5679156, 1167689800, 551052991, 1146476819, 928946759,
      89497800, 1558689683, 429877255, 1617978791, 1768946265, 678982459, 266857875, 1469902784,
      817589584, 1559828345, 1549894028, 899331402, 1827815781, 948216270, 2028600659, 1623074683,
      941200597, 529981855, 1928919641, 591004587, 1209652329, 315668326, 1882924494, 550374246,
      741777754, 306608863, 1181095028, 1242236032, 462242724, 563437874, 1976710246, 786881162
    ]
  };

  function suitOf(c) { return Math.floor(c / 13); }
  function rankOf(c) { return c % 13; }
  function isRed(c) { var s = suitOf(c); return s === 1 || s === 2; }
  function isInt(x) { return typeof x === 'number' && isFinite(x) && Math.floor(x) === x; }
  function fmt(sec) { var m = Math.floor(sec / 60), s = sec % 60; return m + ':' + (s < 10 ? '0' : '') + s; }
  function foundCount(p) {
    if (!p.board) return 0;
    var n = 0, i;
    for (i = 0; i < 4; i++) n += p.board.found[i].length;
    return n;
  }
  function elapsed(state) { return Math.max(0, Math.round((Date.now() - state.startTs) / 1000)); }

  /* ---------- la donne : un tirage déterministe à partir d'une graine ---------- */
  function hasard(graine) {
    var a = graine >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function donne(graine) {
    var r = hasard(graine), deck = [], x;
    for (x = 0; x < 52; x++) deck.push(x);
    for (x = 51; x > 0; x--) {
      var j = Math.floor(r() * (x + 1));
      var t = deck[x]; deck[x] = deck[j]; deck[j] = t;
    }
    var base = { stock: [], waste: [], found: [[], [], [], []], tab: [] };
    var pos = 0, ci, cj;
    for (ci = 0; ci < 7; ci++) {
      var col = [];
      for (cj = 0; cj <= ci; cj++) col.push({ c: deck[pos++], up: cj === ci });
      base.tab.push(col);
    }
    base.stock = deck.slice(pos);
    return base;
  }
  function jourDe(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' + (d.getMonth() < 9 ? '0' : '') + (d.getMonth() + 1) + '-' +
      (d.getDate() < 10 ? '0' : '') + d.getDate();
  }
  function grainesDuJour(jour) {
    var h = 2166136261;
    for (var i = 0; i < jour.length; i++) { h ^= jour.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  function endCheck(state) {
    var i, anyDone = false, allOut = true, n = state.players.length;
    for (i = 0; i < n; i++) {
      if (state.players[i].done) anyDone = true;
      if (!state.players[i].done && !state.players[i].gaveUp) allOut = false;
    }
    if ((anyDone && n > 1) || allOut) {
      state.phase = 'done';
      state.durationSec = elapsed(state);
    }
  }

  function autoPile(board, c) {
    var pile = suitOf(c);
    if (board.found[pile].length === rankOf(c)) return pile;
    return -1;
  }

  /* ---------- les règles de pose ---------- */
  function cartesDe(b, src) {
    if (!src) return null;
    if (src.k === 'waste') return b.waste.length ? [b.waste[b.waste.length - 1]] : null;
    if (src.k === 'found') {
      if (!isInt(src.pile) || src.pile < 0 || src.pile > 3 || !b.found[src.pile].length) return null;
      return [b.found[src.pile][b.found[src.pile].length - 1]];
    }
    if (src.k === 'tab') {
      if (!isInt(src.col) || src.col < 0 || src.col > 6) return null;
      var col = b.tab[src.col];
      if (!isInt(src.idx) || src.idx < 0 || src.idx >= col.length) return null;
      var out = [];
      for (var i = src.idx; i < col.length; i++) { if (!col[i].up) return null; out.push(col[i].c); }
      return out;
    }
    return null;
  }
  /* une séquence descendante alternée, que l'on peut déplacer d'un bloc */
  function sequenceValide(cards) {
    for (var i = 1; i < cards.length; i++) {
      if (rankOf(cards[i - 1]) !== rankOf(cards[i]) + 1 || isRed(cards[i - 1]) === isRed(cards[i])) return false;
    }
    return true;
  }
  function peutPoser(b, cards, dst) {
    if (!cards || !cards.length || !dst) return false;
    if (dst.k === 'found') {
      if (!isInt(dst.pile) || dst.pile < 0 || dst.pile > 3 || cards.length !== 1) return false;
      return suitOf(cards[0]) === dst.pile && rankOf(cards[0]) === b.found[dst.pile].length;
    }
    if (dst.k === 'tab') {
      if (!isInt(dst.col) || dst.col < 0 || dst.col > 6) return false;
      var dcol = b.tab[dst.col];
      if (!dcol.length) return rankOf(cards[0]) === 12;
      var top = dcol[dcol.length - 1];
      return top.up && rankOf(top.c) === rankOf(cards[0]) + 1 && isRed(top.c) !== isRed(cards[0]);
    }
    return false;
  }

  /* tous les coups « utiles » du moment (indice, tapotement, blocage) */
  function coupsUtiles(b, pioche, talonConnu) {
    var coups = [], i, j, c;
    function ajoute(prio, src, dst) { coups.push({ p: prio, src: src, dst: dst }); }
    // vers les fondations
    for (i = 0; i < 7; i++) {
      var col = b.tab[i];
      if (col.length && col[col.length - 1].up) {
        c = col[col.length - 1].c;
        var pl = autoPile(b, c);
        if (pl >= 0) ajoute(col.length > 1 && !col[col.length - 2].up ? 10 : 9, { k: 'tab', col: i, idx: col.length - 1 }, { k: 'found', pile: pl });
      }
    }
    if (b.waste.length) {
      var pw = autoPile(b, b.waste[b.waste.length - 1]);
      if (pw >= 0) ajoute(8, { k: 'waste' }, { k: 'found', pile: pw });
    }
    // tableau → tableau : libérer une carte cachée, ou amener un roi sur une colonne vide
    for (i = 0; i < 7; i++) {
      var s = b.tab[i];
      for (var d = 0; d < s.length; d++) {
        if (!s[d].up) continue;
        var run = [];
        for (var x = d; x < s.length; x++) run.push(s[x].c);
        if (!sequenceValide(run)) continue;
        var libere = d > 0 && !s[d - 1].up;
        var vide = d === 0;
        for (j = 0; j < 7; j++) {
          if (j === i || !peutPoser(b, run, { k: 'tab', col: j })) continue;
          if (!b.tab[j].length && vide) continue;       // roi déjà seul en tête : inutile
          if (libere) ajoute(7, { k: 'tab', col: i, idx: d }, { k: 'tab', col: j });
          else if (vide && b.tab[j].length) ajoute(3, { k: 'tab', col: i, idx: d }, { k: 'tab', col: j });
          else if (d > 0) {
            // déplacement partiel : utile s'il découvre une carte pour les fondations
            var dessous = s[d - 1].c;
            if (autoPile(b, dessous) >= 0) ajoute(6, { k: 'tab', col: i, idx: d }, { k: 'tab', col: j });
          }
        }
        break; // seule la plus longue séquence d'une colonne compte
      }
    }
    // talon → tableau
    if (b.waste.length) {
      c = b.waste[b.waste.length - 1];
      for (j = 0; j < 7; j++) {
        if (peutPoser(b, [c], { k: 'tab', col: j })) ajoute(rankOf(c) === 12 ? 5 : 4, { k: 'waste' }, { k: 'tab', col: j });
      }
    }
    // piocher : utile seulement si une carte du talon peut servir un jour
    if (b.stock.length || b.waste.length) {
      // (l'écran ne voit pas la pioche : c'est l'état qui le lui dit)
      if (talonConnu !== undefined ? talonConnu : talonUtile(b, pioche)) ajoute(1, { k: 'draw' }, null);
    }
    coups.sort(function (a, z) { return z.p - a.p; });
    return coups;
  }
  /* parmi les cartes que la pioche fera passer au-dessus du talon (un tour
     complet), l'une peut-elle se poser quelque part ? */
  function talonUtile(b, pioche) {
    var stock = b.stock.slice(), waste = b.waste.slice(), vues = 0, garde = 0;
    var total = stock.length + waste.length;
    if (!total) return false;
    function sert(c) {
      if (autoPile(b, c) >= 0) return true;
      for (var j = 0; j < 7; j++) if (peutPoser(b, [c], { k: 'tab', col: j })) return true;
      return false;
    }
    while (garde++ < 200) {
      if (!stock.length) {
        if (!waste.length) return false;
        stock = waste.reverse(); waste = [];
      }
      for (var k = 0; k < pioche && stock.length; k++) waste.push(stock.pop());
      if (sert(waste[waste.length - 1])) return true;
      vues += pioche;
      if (vues > total + pioche * 2) return false;
    }
    return false;
  }
  function peutFinir(b) {
    if (b.stock.length || b.waste.length) return false;
    for (var i = 0; i < 7; i++) for (var j = 0; j < b.tab[i].length; j++) if (!b.tab[i][j].up) return false;
    return true;
  }

  /* déplace (sans contrôle) et renvoie l'enregistrement pour l'annulation */
  function deplacer(b, src, dst, cards) {
    var flip = false;
    if (src.k === 'waste') b.waste.pop();
    else if (src.k === 'found') b.found[src.pile].pop();
    else {
      b.tab[src.col].splice(src.idx);
      var rest = b.tab[src.col];
      if (rest.length && !rest[rest.length - 1].up) { rest[rest.length - 1].up = true; flip = true; }
    }
    if (dst.k === 'found') b.found[dst.pile].push(cards[0]);
    else for (var i = 0; i < cards.length; i++) b.tab[dst.col].push({ c: cards[i], up: true });
    return { t: 'm', src: src, dst: dst, n: cards.length, flip: flip };
  }
  function annuler(b, h) {
    if (h.t === 'd') {
      for (var k = 0; k < h.n; k++) b.stock.push(b.waste.pop());
      return;
    }
    if (h.t === 'r') {
      b.waste = b.stock.slice().reverse();
      b.stock = [];
      return;
    }
    // un déplacement : on reprend les n cartes de la destination
    var cards;
    if (h.dst.k === 'found') cards = [b.found[h.dst.pile].pop()];
    else cards = b.tab[h.dst.col].splice(b.tab[h.dst.col].length - h.n).map(function (x) { return x.c; });
    if (h.src.k === 'waste') b.waste.push(cards[0]);
    else if (h.src.k === 'found') b.found[h.src.pile].push(cards[0]);
    else {
      var col = b.tab[h.src.col];
      if (h.flip && col.length) col[col.length - 1].up = false;
      for (var i = 0; i < cards.length; i++) col.push({ c: cards[i], up: true });
    }
  }

  function victoire(state, p, player) {
    var before = 0, i3;
    for (i3 = 0; i3 < state.players.length; i3++) {
      if (i3 !== player && state.players[i3].done) before++;
    }
    p.done = true;
    p.order = before;
    p.sec = elapsed(state);
    if (state.players.length === 1) {
      // la cascade de la victoire d'abord ; la partie se clôt ensuite
      state.phase = 'victoire';
      state.durationSec = p.sec;
    } else {
      endCheck(state);
    }
  }

  /* la carte, en « grand index » sur une ligne (rang + couleur en haut) */
  function carteHtml(c, classe, data) {
    return GG.carteStd(c, { classe: 'sol-card' + (classe ? ' ' + classe : ''), attrs: data || '' });
  }
  function dosHtml(classe, data) {
    return GG.carteDos({ classe: 'sol-card sol-down' + (classe ? ' ' + classe : ''), attrs: data || '' });
  }

  var mod = {
    id: 'solitaire',
    nom: 'Solitaire',
    icone: '♦️',
    desc: 'Le Klondike classique : glisser-déposer, annulation, indices, donne gagnable et défi du jour.',
    regles: '<p><strong>🎯 Le but :</strong> empiler les 52 cartes sur les 4 fondations, de l’As au Roi, famille par famille.</p>' +
      '<p><strong>Comment jouer :</strong> faites glisser une carte (ou une séquence) vers sa destination — les places permises s’allument — ou touchez-la simplement : elle part d’elle-même à la meilleure place (fondation d’abord). Sur les colonnes, les cartes descendent en alternant rouge et noir ; seul un Roi peut occuper une colonne vide. Touchez la pioche pour tirer.</p>' +
      '<p><strong>Pioche 1 ou 3 :</strong> en pioche 3, les trois cartes tirées s’étalent en éventail ; seule celle du dessus se joue.</p>' +
      '<p><strong>↶ Annuler</strong> autant de fois que vous voulez ; <strong>💡 Indice</strong> montre un bon coup ; quand toutes les cartes sont découvertes, <strong>✨ Terminer</strong> range tout en cascade. Si plus aucun coup n’est utile, le jeu vous le dit.</p>' +
      '<p><strong>Donne gagnable :</strong> l’option (activée d’office) choisit une donne que notre solveur a déjà gagnée. <strong>🗓️ Défi du jour :</strong> la même donne pour tout le monde, chaque jour.</p>',
    min: 1,
    max: 1,
    hotseat: true,
    hotseatMax: 1,
    hidden: false,
    netOnly: false,

    create: function (names) {
      var players = [], i;
      for (i = 0; i < names.length; i++) {
        players.push({ name: names[i], done: false, gaveUp: false, moves: 0, order: -1, sec: 0, board: null, histo: [], annul: 0, indices: 0 });
      }
      return { v: 2, phase: 'setup', level: null, draw: 1, mode: 'libre', graine: 0, defi: null, players: players, startTs: 0, durationSec: 0 };
    },

    turnOf: function (state) { return state.phase === 'setup' ? 0 : -1; },

    over: function (state) { return state.phase === 'done'; },

    scoreOf: function (state, i) {
      var p = state.players[i];
      if (!p || !p.board) return '0/52';
      if (p.done) return '🎉';
      if (p.gaveUp) return '🏳️ ' + foundCount(p) + '/52';
      return foundCount(p) + '/52';
    },

    /* seul : gagné (0), ou perdu (défaite « collective ») */
    gagnants: function (state) {
      var ps = state.players, i, g = [];
      for (i = 0; i < ps.length; i++) if (ps[i].done && ps[i].order === 0) g.push(i);
      if (g.length) return g;
      if (ps.length === 1) return null;
      var best = -1;
      for (i = 0; i < ps.length; i++) best = Math.max(best, foundCount(ps[i]));
      for (i = 0; i < ps.length; i++) if (foundCount(ps[i]) === best) g.push(i);
      return g.length === 1 ? g : [];
    },

    redact: function (state) {
      var s = GG.clone(state), i, j, k;
      for (i = 0; i < s.players.length; i++) {
        var b = s.players[i].board;
        if (!b) continue;
        for (j = 0; j < b.stock.length; j++) b.stock[j] = -1;
        for (j = 0; j < 7; j++) {
          for (k = 0; k < b.tab[j].length; k++) {
            if (!b.tab[j][k].up) b.tab[j][k].c = -1;
          }
        }
      }
      return s;
    },

    apply: function (state, player, action) {
      if (!action || typeof action.t !== 'string') return { ok: false, error: 'Action invalide.' };
      if (!isInt(player) || player < 0 || player >= state.players.length) return { ok: false, error: 'Joueur inconnu.' };
      if (state.phase === 'done') return { ok: false, error: 'La partie est terminée.' };

      if (action.t === 'level') {
        if (state.phase !== 'setup') return { ok: false, error: 'La difficulté est déjà choisie.' };
        if (player !== 0) return { ok: false, error: 'Seul le premier joueur choisit la difficulté.' };
        if (action.l !== 'facile' && action.l !== 'difficile') return { ok: false, error: 'Niveau inconnu.' };
        var mode = action.mode === 'gagnable' || action.mode === 'defi' ? action.mode : 'libre';
        var pioche = action.l === 'difficile' ? 3 : 1;
        var graine;
        if (mode === 'defi') {
          pioche = 1;
          state.defi = jourDe(Date.now());
          var listeD = GAGNABLES[1];
          graine = listeD.length ? listeD[grainesDuJour(state.defi) % listeD.length] : grainesDuJour(state.defi);
        } else if (mode === 'gagnable' && GAGNABLES[pioche].length) {
          var liste = GAGNABLES[pioche];
          graine = liste[Math.floor(Math.random() * liste.length)];
        } else {
          mode = 'libre';
          graine = Math.floor(Math.random() * 2147483646) + 1;
        }
        var base = donne(graine);
        for (var x = 0; x < state.players.length; x++) {
          state.players[x].board = GG.clone(base);
          state.players[x].histo = [];
          state.players[x].talon = talonUtile(state.players[x].board, pioche);
        }
        state.level = pioche === 3 ? 'difficile' : 'facile';
        state.draw = pioche;
        state.mode = mode;
        state.graine = graine;
        state.phase = 'play';
        state.startTs = Date.now();
        return { ok: true };
      }

      if (action.t === 'cloture') {
        if (state.phase !== 'victoire') return { ok: false, error: 'Rien à clore.' };
        state.phase = 'done';
        return { ok: true };
      }

      if (state.phase !== 'play') return { ok: false, error: 'La partie n’a pas encore commencé.' };
      var res = jouerCoup(state, player, action);
      var pj = state.players[player];
      if (res.ok && pj.board) pj.talon = talonUtile(pj.board, state.draw === 3 ? 3 : 1);
      return res;
    },

    summary: function (state) { return resume(state); },
    render: function (el, ctx) { rendu(el, ctx); },

    _donne: donne,
    _gagnables: GAGNABLES,
    _coupsUtiles: coupsUtiles,
    _peutFinir: peutFinir
  };

  /* un coup, une fois la partie lancée */
  function jouerCoup(state, player, action) {
      var p = state.players[player];
      if (p.done) return { ok: false, error: 'Vous avez déjà terminé !' };
      if (p.gaveUp) return { ok: false, error: 'Vous avez abandonné cette donne.' };
      var b = p.board;
      if (!p.histo) p.histo = [];

      if (action.t === 'draw') {
        if (b.stock.length === 0) {
          if (b.waste.length === 0) return { ok: false, error: 'Rien à piocher.' };
          b.stock = b.waste.slice().reverse();
          b.waste = [];
          p.histo.push({ t: 'r' });
          return { ok: true };
        }
        var n = state.draw, pris = 0;
        while (n > 0 && b.stock.length) { b.waste.push(b.stock.pop()); n--; pris++; }
        p.histo.push({ t: 'd', n: pris });
        return { ok: true };
      }

      if (action.t === 'undo') {
        if (!p.histo.length) return { ok: false, error: 'Rien à annuler.' };
        annuler(b, p.histo.pop());
        p.annul = (p.annul || 0) + 1;
        return { ok: true };
      }

      if (action.t === 'giveup') {
        p.gaveUp = true;
        p.sec = elapsed(state);
        endCheck(state);
        return { ok: true };
      }

      if (action.t === 'finir') {
        if (!peutFinir(b)) return { ok: false, error: 'Il reste des cartes cachées ou à piocher.' };
        // on range tout, du plus petit au plus grand
        var garde = 0;
        while (foundCount(p) < 52 && garde++ < 60) {
          var bouge = false;
          for (var ci = 0; ci < 7 && !bouge; ci++) {
            var cc = b.tab[ci];
            if (!cc.length) continue;
            var top = cc[cc.length - 1].c;
            var pl = autoPile(b, top);
            if (pl >= 0) {
              // la plus petite carte disponible d'abord
              var plusPetite = true;
              for (var cj = 0; cj < 7; cj++) {
                var autre = b.tab[cj];
                if (autre.length && rankOf(autre[autre.length - 1].c) < rankOf(top) &&
                    autoPile(b, autre[autre.length - 1].c) >= 0) plusPetite = false;
              }
              if (!plusPetite) continue;
              deplacer(b, { k: 'tab', col: ci, idx: cc.length - 1 }, { k: 'found', pile: pl }, [top]);
              p.moves++;
              bouge = true;
            }
          }
          if (!bouge) break;
        }
        p.histo = [];
        if (foundCount(p) === 52) victoire(state, p, player);
        return { ok: true };
      }

      if (action.t === 'move') {
        var src = action.src, dst = action.dst;
        if (!src || !dst) return { ok: false, error: 'Coup invalide.' };
        var cards = null;

        if (src.k === 'waste') {
          if (!b.waste.length) return { ok: false, error: 'La défausse est vide.' };
        } else if (src.k === 'tab') {
          if (!isInt(src.col) || src.col < 0 || src.col > 6) return { ok: false, error: 'Colonne invalide.' };
          if (!isInt(src.idx) || src.idx < 0 || src.idx >= b.tab[src.col].length) return { ok: false, error: 'Carte invalide.' };
          var scol = b.tab[src.col];
          for (var i2 = src.idx; i2 < scol.length; i2++) {
            if (!scol[i2].up) return { ok: false, error: 'Cette carte est face cachée.' };
          }
        } else if (src.k === 'found') {
          if (!isInt(src.pile) || src.pile < 0 || src.pile > 3) return { ok: false, error: 'Fondation invalide.' };
          if (!b.found[src.pile].length) return { ok: false, error: 'Cette fondation est vide.' };
        } else {
          return { ok: false, error: 'Coup invalide.' };
        }
        cards = cartesDe(b, src);

        if (dst.k === 'found') {
          if (!isInt(dst.pile) || dst.pile < 0 || dst.pile > 3) return { ok: false, error: 'Fondation invalide.' };
          if (cards.length !== 1) return { ok: false, error: 'Une seule carte à la fois vers les fondations.' };
          var c1 = cards[0];
          if (suitOf(c1) !== dst.pile) return { ok: false, error: 'Ce n’est pas la bonne famille.' };
          if (rankOf(c1) !== b.found[dst.pile].length) return { ok: false, error: 'Il faut respecter l’ordre : As, 2, 3…' };
        } else if (dst.k === 'tab') {
          if (!isInt(dst.col) || dst.col < 0 || dst.col > 6) return { ok: false, error: 'Colonne invalide.' };
          if (src.k === 'tab' && src.col === dst.col) return { ok: false, error: 'La carte est déjà dans cette colonne.' };
          if (!sequenceValide(cards)) return { ok: false, error: 'Ces cartes ne se déplacent pas ensemble.' };
          var dcol = b.tab[dst.col], first = cards[0];
          if (!dcol.length) {
            if (rankOf(first) !== 12) return { ok: false, error: 'Seul un Roi peut occuper une colonne vide.' };
          } else {
            var topc = dcol[dcol.length - 1];
            if (!topc.up) return { ok: false, error: 'Cette colonne est bloquée.' };
            if (rankOf(topc.c) !== rankOf(first) + 1) return { ok: false, error: 'Il faut poser une carte juste inférieure.' };
            if (isRed(topc.c) === isRed(first)) return { ok: false, error: 'Il faut alterner rouge et noir.' };
          }
        } else {
          return { ok: false, error: 'Coup invalide.' };
        }

        p.histo.push(deplacer(b, src, dst, cards));
        p.moves++;
        if (foundCount(p) === 52) victoire(state, p, player);
        return { ok: true };
      }

      return { ok: false, error: 'Action inconnue.' };
  }

  function resume(state) {
      var rows = [], i, p;
      for (i = 0; i < state.players.length; i++) {
        p = state.players[i];
        rows.push({ name: p.name, done: p.done, gaveUp: p.gaveUp, found: foundCount(p), sec: p.sec, order: p.order, moves: p.moves });
      }
      rows.sort(function (a, b) {
        if (a.done !== b.done) return a.done ? -1 : 1;
        if (a.done && b.done) return (a.order - b.order) || (a.sec - b.sec);
        if (a.found !== b.found) return b.found - a.found;
        return a.moves - b.moves;
      });
      var winners = [];
      var anyDone = rows.length > 0 && rows[0].done;
      if (anyDone) {
        for (i = 0; i < rows.length; i++) {
          if (rows[i].done && rows[i].order === rows[0].order) winners.push(rows[i].name);
        }
      } else if (rows.length > 1) {
        // personne n'a fini : le plus avancé l'emporte (ex æquo possibles)
        for (i = 0; i < rows.length; i++) {
          if (rows[i].found === rows[0].found) winners.push(rows[i].name);
        }
      }
      var html = '';
      var solo = state.players.length === 1;
      var titreMode = (state.mode === 'defi' ? '🗓️ Défi du jour' : (state.draw === 3 ? 'Pioche 3' : 'Pioche 1')) +
        (state.mode === 'gagnable' ? ' · donne gagnable' : '');
      if (winners.length) {
        var wn = [];
        for (i = 0; i < winners.length; i++) wn.push(GG.esc(winners[i]));
        html += '<h1>🏆 ' + wn.join(' & ') + '</h1>';
      } else if (solo) {
        var f = rows[0].found;
        html += '<h1>' + (f >= 40 ? '😮 Si près du but !' : (f >= 20 ? '💪 Belle bataille' : '🃏 Pas cette fois')) + '</h1>' +
          '<p class="mini-msg">' + f + ' cartes rangées sur 52. Une nouvelle donne ?' +
          (state.mode === 'libre' ? ' Essayez l’option « donne gagnable ».' : '') + '</p>';
      }
      for (i = 0; i < rows.length; i++) {
        var r = rows[i], res;
        if (r.done) res = '🎉 ' + fmt(r.sec) + ' · ' + r.moves + ' coups';
        else if (r.gaveUp) res = '🏳️ ' + r.found + '/52';
        else res = r.found + '/52';
        html += '<div class="final-line"><span>' + GG.esc(r.name) + '</span><strong>' + res + '</strong></div>';
      }
      html += '<p class="hint">' + titreMode + '</p>';
      if (solo && state.players[0].done && state.level) {
        try {
          var key = state.mode === 'defi' ? 'gg-sol-defi-' + state.defi : 'gg-solitaire-best-' + state.level;
          var raw = localStorage.getItem(key);
          var rec = raw ? JSON.parse(raw) : null;
          var sec = state.players[0].sec || state.durationSec;
          if (!rec || !isInt(rec.sec) || sec < rec.sec) {
            rec = { sec: sec, ts: state.startTs, coups: state.players[0].moves };
            localStorage.setItem(key, JSON.stringify(rec));
          }
          if (rec.ts === state.startTs) html += '<p class="mini-msg">🏆 Nouveau record' + (state.mode === 'defi' ? ' du jour' : '') + ' !</p>';
          else html += '<p class="hint">Record à battre : ' + fmt(rec.sec) + '</p>';
        } catch (e) {}
      }
      return html;
  }

  /* ======================================================================
   *  L'AFFICHAGE
   * ====================================================================== */

  function lireRecord(cle) {
    try { var r = JSON.parse(localStorage.getItem(cle) || 'null'); return r && isInt(r.sec) ? r : null; } catch (e) { return null; }
  }

  function rendu(el, ctx) {
    var s = ctx.state;
    var me = (isInt(ctx.me) && ctx.me >= 0 && ctx.me < s.players.length) ? ctx.me : 0;
    var fx = GG.fx, sfx = GG.sfx;

    if (s.phase === 'setup') {
      el._solConfirm = false;
      if (el._solTimer) { clearInterval(el._solTimer); el._solTimer = null; }
      var gagnable = el._solGagnable !== false;
      var html0 = '<div class="sol2 sol-accueil">';
      if (me === 0) {
        var jour = jourDe(Date.now());
        var recJour = lireRecord('gg-sol-defi-' + jour);
        var r1 = lireRecord('gg-solitaire-best-facile'), r3 = lireRecord('gg-solitaire-best-difficile');
        html0 += '<div class="sol-accueil-cartes">' + GG.carteStd(0, { classe: 'sol-deco' }) + GG.carteStd(13, { classe: 'sol-deco' }) +
          GG.carteStd(26, { classe: 'sol-deco' }) + GG.carteStd(39, { classe: 'sol-deco' }) + '</div>' +
          '<p class="mini-msg">♦️ Choisissez votre façon de piocher :</p>' +
          '<div class="lvl-btns">' +
          '<button class="btn big" data-lvl="facile">🙂 Pioche 1 carte<small>' + (r1 ? 'Record ' + fmt(r1.sec) : 'La plus douce') + '</small></button>' +
          '<button class="btn big" data-lvl="difficile">😤 Pioche 3 cartes<small>' + (r3 ? 'Record ' + fmt(r3.sec) : 'La version classique, corsée') + '</small></button>' +
          '</div>' +
          '<button class="sol-option' + (gagnable ? ' on' : '') + '" id="sol-gagnable" role="switch" aria-checked="' + gagnable + '">' +
          '<span class="interrupteur" aria-hidden="true"></span><span>Donne gagnable garantie</span></button>' +
          '<button class="btn big jeu sol-defi" data-lvl="facile" data-mode="defi">🗓️ Défi du jour<small>' +
          (recJour ? '✅ Réussi en ' + fmt(recJour.sec) + ' — battez votre temps !' : 'La même donne pour tout le monde aujourd’hui') + '</small></button>';
        if (s.players.length > 1) html0 += '<p class="hint">Même donne pour tout le monde : le premier qui termine gagne !</p>';
      } else {
        html0 += '<p class="waiting">' + GG.esc(s.players[0].name) + ' choisit la difficulté…</p>';
      }
      html0 += '</div>';
      el.innerHTML = html0;
      var opt = el.querySelector('#sol-gagnable');
      if (opt) {
        opt.addEventListener('click', function () {
          el._solGagnable = !(el._solGagnable !== false);
          sfx.play('toggle');
          rendu(el, ctx);
        });
      }
      el.querySelectorAll('[data-lvl]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          if (el._solLance) return;
          el._solLance = true;
          sfx.play('shuffle');
          var mode = btn.getAttribute('data-mode') || (el._solGagnable !== false ? 'gagnable' : 'libre');
          if (ctx.act({ t: 'level', l: btn.getAttribute('data-lvl'), mode: mode }) === false) el._solLance = false;
        });
      });
      return;
    }
    el._solLance = false;

    var p = s.players[me], b = p.board;
    var playing = s.phase === 'play' && !p.done && !p.gaveUp;
    var shownSec = (p.done || p.gaveUp) ? p.sec : (s.phase === 'done' ? s.durationSec : elapsed(s));
    var tirage = s.draw === 3 ? 3 : 1;
    var coups = playing ? coupsUtiles(b, tirage, p.talon) : [];
    var finissable = playing && peutFinir(b);
    var bloque = playing && !finissable && !coups.length;

    /* ---- la table ---- */
    var html = '<div class="sol2 tirage' + tirage + '">';
    html += '<div class="sol-hud">' +
      '<span class="sol-pastille" id="sol-timer">⏱️ ' + fmt(shownSec) + '</span>' +
      '<span class="sol-pastille">🃏 ' + p.moves + (p.moves > 1 ? ' coups' : ' coup') + '</span>' +
      '<span class="sol-pastille"><b>' + foundCount(p) + '</b>/52</span>' +
      '<span class="sol-pastille sol-pmode">' + (s.mode === 'defi' ? '🗓️ Défi' : (tirage === 3 ? 'Pioche 3' : 'Pioche 1')) + '</span>' +
      '</div>';

    html += '<div class="sol-felt cz-feutre"><div class="sol-row">';
    // la pioche
    if (b.stock.length) {
      html += '<div class="sol-pile sol-stock" data-act="draw">' +
        dosHtml('sol-pioche', '') +
        '<span class="sol-card sol-down sol-compteur" aria-hidden="true"><span class="sol-cnt">' + b.stock.length + '</span></span></div>';
    } else if (b.waste.length) {
      html += '<div class="sol-pile sol-stock sol-slot sol-recycle" data-act="draw" aria-label="Retourner la défausse">↺</div>';
    } else {
      html += '<div class="sol-pile sol-slot"></div>';
    }
    // la défausse : 1 carte, ou 3 en éventail en pioche 3
    html += '<div class="sol-pile sol-waste">';
    var montrees = tirage === 3 ? Math.min(3, b.waste.length) : Math.min(1, b.waste.length);
    for (var wi = b.waste.length - montrees; wi < b.waste.length; wi++) {
      var dessus = wi === b.waste.length - 1;
      html += carteHtml(b.waste[wi], 'sol-eventail e' + (wi - (b.waste.length - montrees)) + (dessus ? '' : ' sol-inerte'),
        ' data-c="' + b.waste[wi] + '"' + (dessus ? ' data-waste="1"' : '') +
        ' style="--e:' + (wi - (b.waste.length - montrees)) + '"');
    }
    if (!montrees) html += '<span class="sol-slot"></span>';
    html += '</div><div class="sol-pile sol-espace"></div>';
    for (var fi = 0; fi < 4; fi++) {
      var fp = b.found[fi];
      html += '<div class="sol-pile sol-found" data-found="' + fi + '">' +
        '<span class="sol-slot sol-slot-f">' + SUITS[fi] + '</span>' +
        (fp.length > 1 ? carteHtml(fp[fp.length - 2], 'sol-sous', '') : '') +
        (fp.length ? carteHtml(fp[fp.length - 1], '', ' data-c="' + fp[fp.length - 1] + '" data-fcard="' + fi + '"') : '') +
        '</div>';
    }
    html += '</div><div class="sol-tab">';
    for (var tc = 0; tc < 7; tc++) {
      var colArr = b.tab[tc];
      html += '<div class="sol-col" data-tab="' + tc + '"><span class="sol-slot sol-slot-col">' + (colArr.length ? '' : 'R') + '</span>';
      var nd = 0, nu = 0;
      for (var tj = 0; tj < colArr.length; tj++) {
        var cc = colArr[tj];
        var pos = ' style="--nd:' + nd + ';--nu:' + nu + ';z-index:' + (tj + 1) + '"';
        if (cc.up && cc.c >= 0) {
          html += carteHtml(cc.c, '', ' data-card="' + tc + ':' + tj + '" data-c="' + cc.c + '"' + pos);
          nu++;
        } else {
          html += dosHtml('', pos);
          nd++;
        }
      }
      html += '</div>';
    }
    html += '</div></div>';

    if (p.done && s.phase !== 'victoire') html += '<p class="mini-msg">🎉 Bravo, Solitaire réussi en ' + fmt(p.sec) + ' !</p>';
    else if (p.gaveUp && s.phase === 'play') html += '<p class="waiting">🏳️ Vous avez abandonné… on attend les autres.</p>';

    if (bloque) {
      html += '<div class="sol-bloque"><b>😕 Plus aucun coup utile.</b> Annulez quelques coups pour tenter une autre voie, ou abandonnez cette donne.</div>';
    }
    if (playing) {
      html += '<div class="sol-outils">' +
        '<button class="btn sol-outil" id="sol-annuler"' + (p.histo && p.histo.length ? '' : ' disabled') + ' aria-label="Annuler">↶<small>Annuler</small></button>' +
        (finissable
          ? '<button class="btn or sol-outil" id="sol-finir">✨<small>Terminer</small></button>'
          : '<button class="btn sol-outil" id="sol-indice"' + (coups.length ? '' : ' disabled') + ' aria-label="Indice">💡<small>Indice</small></button>') +
        '<button class="btn sol-outil sol-giveup" data-giveup="1">' +
        (el._solConfirm ? '⚠️<small>Vraiment ?</small>' : '🏳️<small>Abandonner</small>') + '</button>' +
        '</div>';
    }
    html += '</div>';

    /* ---- les positions avant le changement (FLIP) ---- */
    var avant = el._solPos || {};
    var cleDonne = s.graine + ':' + s.startTs;
    if (el._solDonne !== cleDonne) { avant = {}; el._solDonne = cleDonne; el._solVus = null; }
    var vusAvant = el._solVus; // cartes visibles au rendu précédent
    el.innerHTML = html;

    /* ---- les colonnes se resserrent pour tenir à l'écran ---- */
    var tab = el.querySelector('.sol-tab');
    var outils = el.querySelector('.sol-outils');
    var cardH = 0;
    var uneCarte = el.querySelector('.sol-tab .sol-card');
    if (uneCarte) cardH = uneCarte.offsetHeight;
    if (tab && cardH) {
      var haut = tab.getBoundingClientRect().top + (root.scrollY || 0);
      var reserve = (outils ? outils.offsetHeight + 18 : 20) + (el.querySelector('.sol-bloque') ? 60 : 0);
      var dispo = Math.max(cardH * 2.2, (root.innerHeight || 800) - haut - reserve - 10);
      var maxH = 0;
      el.querySelectorAll('.sol-col').forEach(function (colEl, ci) {
        var col = b.tab[ci], nd2 = 0, nu2 = 0;
        for (var k = 0; k < col.length; k++) { if (col[k].up && col[k].c >= 0) nu2++; else nd2++; }
        var offD = cardH * 0.16, offU = cardH * 0.34;
        var besoin = cardH + nd2 * offD + Math.max(0, nu2 - 1) * offU;
        if (besoin > dispo && nu2 > 1) {
          offU = Math.max(cardH * 0.2, (dispo - cardH - nd2 * offD) / (nu2 - 1));
          besoin = cardH + nd2 * offD + Math.max(0, nu2 - 1) * offU;
          if (besoin > dispo) {
            offD = Math.max(cardH * 0.07, (dispo - cardH - Math.max(0, nu2 - 1) * offU) / Math.max(1, nd2));
            besoin = cardH + nd2 * offD + Math.max(0, nu2 - 1) * offU;
          }
        }
        colEl.style.setProperty('--offd', offD.toFixed(1) + 'px');
        colEl.style.setProperty('--offu', offU.toFixed(1) + 'px');
        maxH = Math.max(maxH, besoin);
      });
      tab.style.minHeight = Math.ceil(maxH + 4) + 'px';
    }

    /* ---- le mouvement : chaque carte glisse de son ancienne place à la
       nouvelle (s'aimante), une carte découverte se retourne, une carte
       piochée vole de la pioche ---- */
    var nouvellesPos = {};
    var pioche = el.querySelector('.sol-stock');
    var rPioche = pioche ? pioche.getBoundingClientRect() : null;
    var reduit = fx.reduced && fx.reduced();
    var cascade = 0;
    var vus = {};
    el.querySelectorAll('[data-c]').forEach(function (ce) {
      var c = ce.getAttribute('data-c');
      var r = ce.getBoundingClientRect();
      nouvellesPos[c] = { x: r.left, y: r.top };
      vus[c] = true;
      if (reduit || !vusAvant) return;
      var o = avant[c];
      if (o) {
        var dx = o.x - r.left, dy = o.y - r.top;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
          var versFond = ce.closest('.sol-found') && !(o.fond);
          var delai = 0;
          if (versFond && el._solEnCascade) { delai = cascade * 70; cascade++; }
          try {
            ce.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px)', zIndex: 60 }, { transform: 'translate(0,0)', zIndex: 60 }],
              { duration: 260, delay: delai, easing: 'cubic-bezier(.2, .9, .3, 1.12)', fill: 'backwards' });
          } catch (e) {}
        }
      } else if (!vusAvant[c]) {
        // une carte qu'on ne voyait pas : piochée, ou découverte dans une colonne
        if (ce.closest('.sol-waste') && rPioche) {
          var dx2 = rPioche.left - r.left, dy2 = rPioche.top - r.top;
          try {
            ce.animate([{ transform: 'translate(' + dx2 + 'px,' + dy2 + 'px) rotateY(90deg)' }, { transform: 'none' }],
              { duration: 300, easing: 'cubic-bezier(.2, .8, .3, 1)' });
          } catch (e) {}
        } else if (ce.closest('.sol-col')) {
          ce.classList.add('jc-retourne');
          sfx.play('flip', { volume: 0.6 });
        }
      }
    });
    el.querySelectorAll('.sol-found [data-c]').forEach(function (ce) { nouvellesPos[ce.getAttribute('data-c')].fond = true; });
    el._solPos = nouvellesPos;
    el._solVus = vus;
    el._solEnCascade = false;

    /* ---- le chronomètre ---- */
    if (el._solTimer && !playing) { clearInterval(el._solTimer); el._solTimer = null; }
    if (playing && s.startTs && !el._solTimer) {
      el._solTimer = setInterval(function () {
        var t = el.querySelector('#sol-timer');
        if (!t || !document.body.contains(t)) { clearInterval(el._solTimer); el._solTimer = null; return; }
        t.textContent = '⏱️ ' + fmt(Math.max(0, Math.round((Date.now() - s.startTs) / 1000)));
      }, 1000);
    }

    /* ---- la fin automatique : dès que tout est découvert ---- */
    var cleFin = cleDonne + ':' + foundCount(p);
    if (finissable && el._solAutoFin !== cleFin) {
      el._solAutoFin = cleFin;
      setTimeout(function () {
        if (!document.body.contains(el) || el._solAutoFin !== cleFin) return;
        el._solEnCascade = true;
        sfx.play('whoosh');
        ctx.act({ t: 'finir' });
      }, 650);
    }

    /* ---- la victoire : la célèbre cascade de cartes qui rebondissent ---- */
    if (s.phase === 'victoire') {
      var cleV = cleDonne + ':victoire';
      if (el._solVictoire !== cleV) {
        el._solVictoire = cleV;
        sfx.play('fanfare');
        GG.haptic('success');
        var clos = false;
        var clore = function () {
          if (clos) return;
          clos = true;
          if (el._solVictoire === cleV && document.body.contains(el)) ctx.act({ t: 'cloture' });
        };
        cascadeVictoire(el, clore, '<div class="sol-victoire-t">🎉 Bravo !</div>' +
          '<div>Réussi en <b>' + fmt(p.sec) + '</b> · ' + p.moves + ' coups</div>' +
          '<button class="btn big or" id="sol-cloture">Continuer</button>');
      }
      return;
    }

    /* ================= les gestes ================= */
    var rootEl = el.querySelector('.sol2');
    function jouer(a, son) {
      // on retient où sont les cartes AVANT le coup (elles glisseront de là)
      var r = ctx.act(a);
      if (r === false) return false;
      if (son) sfx.play(son.n, son.o);
      return true;
    }
    function refuse(elems) {
      sfx.play('wrong', { volume: 0.45 });
      GG.haptic('error');
      if (elems && elems[0]) fx.shake(elems[0], 0.6);
    }
    function sonPose(dst) {
      if (dst && dst.k === 'found') {
        var n = foundCount(p) + 1;
        return { n: 'combo', o: { level: Math.min(8, 1 + Math.floor(n / 7)), volume: 0.6 } };
      }
      return { n: 'place', o: { volume: 0.8 } };
    }
    /* la meilleure destination pour un tapotement */
    function meilleureDestination(src, cards) {
      if (cards.length === 1) {
        var pl = autoPile(b, cards[0]);
        if (pl >= 0 && peutPoser(b, cards, { k: 'found', pile: pl })) return { k: 'found', pile: pl };
      }
      var vide = -1, j;
      for (j = 0; j < 7; j++) {
        if (src.k === 'tab' && src.col === j) continue;
        if (!peutPoser(b, cards, { k: 'tab', col: j })) continue;
        if (b.tab[j].length) return { k: 'tab', col: j };
        if (vide < 0) vide = j;
      }
      // un roi ne quitte sa place pour une colonne vide que s'il découvre quelque chose
      if (vide >= 0 && !(src.k === 'tab' && src.idx === 0)) return { k: 'tab', col: vide };
      return null;
    }
    function sourceDe(node) {
      var card = node.closest('[data-card]');
      if (card) {
        var parts = card.getAttribute('data-card').split(':');
        return { k: 'tab', col: parseInt(parts[0], 10), idx: parseInt(parts[1], 10) };
      }
      if (node.closest('[data-waste]')) return { k: 'waste' };
      var f = node.closest('[data-fcard]');
      if (f) return { k: 'found', pile: parseInt(f.getAttribute('data-fcard'), 10) };
      return null;
    }
    function elementsDe(src) {
      if (src.k === 'tab') {
        var out = [];
        for (var k = src.idx; k < b.tab[src.col].length; k++) {
          var e = el.querySelector('[data-card="' + src.col + ':' + k + '"]');
          if (e) out.push(e);
        }
        return out;
      }
      if (src.k === 'waste') return [el.querySelector('[data-waste]')];
      return [el.querySelector('[data-fcard="' + src.pile + '"]')];
    }
    function destinationSous(x, y) {
      var n = document.elementFromPoint(x, y);
      if (!n || !rootEl.contains(n)) return null;
      var f = n.closest('[data-found]');
      if (f) return { k: 'found', pile: parseInt(f.getAttribute('data-found'), 10) };
      var col = n.closest('[data-tab]');
      if (col) return { k: 'tab', col: parseInt(col.getAttribute('data-tab'), 10) };
      return null;
    }

    if (!playing) return;

    /* ---- glisser-déposer au doigt (et à la souris) ---- */
    var geste = null;
    rootEl.addEventListener('pointerdown', function (e) {
      if (e.button > 0 || geste) return;
      var src = sourceDe(e.target);
      if (!src) return;
      var cards = cartesDe(b, src);
      if (!cards || (src.k === 'tab' && !sequenceValide(cards))) return;
      geste = { id: e.pointerId, x0: e.clientX, y0: e.clientY, src: src, cards: cards, els: elementsDe(src), parti: false, dests: [] };
      if (el._solConfirm) { el._solConfirm = false; }
    });
    rootEl.addEventListener('pointermove', function (e) {
      if (!geste || e.pointerId !== geste.id) return;
      var dx = e.clientX - geste.x0, dy = e.clientY - geste.y0;
      if (!geste.parti) {
        if (dx * dx + dy * dy < 64) return;
        geste.parti = true;
        try { rootEl.setPointerCapture(e.pointerId); } catch (er) {}
        geste.els.forEach(function (x) { if (x) x.classList.add('sol-glisse'); });
        // les destinations permises s'allument
        var ds = [];
        for (var j = 0; j < 4; j++) if (peutPoser(b, geste.cards, { k: 'found', pile: j })) ds.push(el.querySelector('[data-found="' + j + '"]'));
        for (j = 0; j < 7; j++) {
          if (geste.src.k === 'tab' && geste.src.col === j) continue;
          if (peutPoser(b, geste.cards, { k: 'tab', col: j })) ds.push(el.querySelector('[data-tab="' + j + '"]'));
        }
        geste.dests = ds;
        ds.forEach(function (d) { if (d) d.classList.add('sol-cible'); });
        sfx.play('select', { volume: 0.4 });
        GG.haptic('light');
      }
      e.preventDefault();
      geste.els.forEach(function (x) { if (x) x.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(1.04)'; });
      var d = destinationSous(e.clientX, e.clientY);
      geste.dests.forEach(function (n) { if (n) n.classList.toggle('sol-survol', !!d && n.getAttribute(d.k === 'found' ? 'data-found' : 'data-tab') === String(d.k === 'found' ? d.pile : d.col)); });
    });
    function finGeste(e) {
      if (!geste || e.pointerId !== geste.id) return;
      var g = geste;
      geste = null;
      g.dests.forEach(function (n) { if (n) n.classList.remove('sol-cible', 'sol-survol'); });
      if (!g.parti) {
        // un simple toucher : la carte part vers la meilleure place
        var dst = meilleureDestination(g.src, g.cards);
        if (dst) jouer({ t: 'move', src: g.src, dst: dst }, sonPose(dst));
        else refuse(g.els);
        return;
      }
      var cible = destinationSous(e.clientX, e.clientY);
      if (cible && peutPoser(b, g.cards, cible) && !(cible.k === 'tab' && g.src.k === 'tab' && cible.col === g.src.col)) {
        // les cartes repartiront de l'endroit où on les a lâchées
        g.els.forEach(function (x) {
          if (!x) return;
          var r = x.getBoundingClientRect();
          el._solPos[x.getAttribute('data-c')] = { x: r.left, y: r.top };
        });
        GG.haptic('medium');
        if (!jouer({ t: 'move', src: g.src, dst: cible }, sonPose(cible))) retour(g);
      } else {
        retour(g);
        if (cible) refuse(g.els);
      }
    }
    function retour(g) {
      g.els.forEach(function (x) {
        if (!x) return;
        x.classList.remove('sol-glisse');
        x.classList.add('sol-retour');
        x.style.transform = '';
        setTimeout(function () { x.classList.remove('sol-retour'); }, 260);
      });
    }
    rootEl.addEventListener('pointerup', finGeste);
    rootEl.addEventListener('pointercancel', function (e) { if (geste && e.pointerId === geste.id) { retour(geste); geste.dests.forEach(function (n) { if (n) n.classList.remove('sol-cible', 'sol-survol'); }); geste = null; } });

    /* ---- la pioche, les outils ---- */
    var stockEl = el.querySelector('[data-act="draw"]');
    if (stockEl) {
      stockEl.addEventListener('click', function () {
        if (!b.stock.length) jouer({ t: 'draw' }, { n: 'shuffle', o: { volume: 0.6 } });
        else jouer({ t: 'draw' }, { n: 'deal', o: { volume: 0.7 } });
      });
    }
    var un = el.querySelector('#sol-annuler');
    if (un) un.addEventListener('click', function () { jouer({ t: 'undo' }, { n: 'back' }); });
    var ind = el.querySelector('#sol-indice');
    if (ind) {
      ind.addEventListener('click', function () {
        var c0 = coups[0];
        if (!c0) return;
        sfx.play('notify', { volume: 0.6 });
        var aAllumer = [];
        if (c0.src.k === 'draw') aAllumer.push(el.querySelector('[data-act="draw"]'));
        else {
          elementsDe(c0.src).forEach(function (x) { aAllumer.push(x); });
          if (c0.dst.k === 'found') aAllumer.push(el.querySelector('[data-found="' + c0.dst.pile + '"]'));
          else aAllumer.push(el.querySelector('[data-tab="' + c0.dst.col + '"]'));
        }
        aAllumer.forEach(function (x) { if (x) { x.classList.add('sol-indice'); setTimeout(function () { x.classList.remove('sol-indice'); }, 1600); } });
      });
    }
    var fin = el.querySelector('#sol-finir');
    if (fin) fin.addEventListener('click', function () { el._solEnCascade = true; jouer({ t: 'finir' }, { n: 'whoosh' }); });
    var ab = el.querySelector('[data-giveup]');
    if (ab) {
      ab.addEventListener('click', function () {
        if (el._solConfirm) {
          // un double-appui ne doit pas confirmer ce qu'il vient d'armer
          if (Date.now() - (el._solConfT || 0) < 300) return;
          el._solConfirm = false;
          ctx.act({ t: 'giveup' });
        } else {
          el._solConfirm = true;
          el._solConfT = Date.now();
          rendu(el, ctx);
        }
      });
    }
    if (bloque && el._solBloqueVu !== cleFin + ':' + p.histo.length) {
      el._solBloqueVu = cleFin + ':' + p.histo.length;
      sfx.play('lose', { volume: 0.35 });
    }
  }

  /* ======================================================================
   *  LA CASCADE DE LA VICTOIRE : chaque carte des fondations part en
   *  rebondissant et laisse sa traînée (la toile n'est jamais effacée).
   * ====================================================================== */
  var cascadeEnCours = null;
  function arreterCascade() {
    if (cascadeEnCours) { cascadeEnCours.stop(); cascadeEnCours = null; }
  }
  function cascadeVictoire(el, fini, banniereHtml) {
    arreterCascade();
    if (typeof document === 'undefined') { fini(); return; }
    var reduit = GG.fx.reduced && GG.fx.reduced();
    var fonds = el.querySelectorAll('.sol-found');
    if (reduit || !fonds.length) { setTimeout(fini, 1200); return; }
    var W = root.innerWidth, H = root.innerHeight, dpr = Math.min(2, root.devicePixelRatio || 1);
    var cv = document.createElement('canvas');
    cv.className = 'sol-cascade';
    cv.width = W * dpr; cv.height = H * dpr;
    cv.style.cssText = 'position:fixed;left:0;top:0;width:' + W + 'px;height:' + H + 'px;z-index:55;pointer-events:auto;touch-action:none;';
    document.body.appendChild(cv);
    var g = cv.getContext('2d');
    g.scale(dpr, dpr);
    var r0 = fonds[0].getBoundingClientRect();
    var cw = r0.width || 44, ch = cw * 1.4;
    // les 52 faces, dessinées une fois
    var faces = {};
    function face(c) {
      if (faces[c]) return faces[c];
      var f = document.createElement('canvas');
      f.width = Math.ceil(cw * dpr); f.height = Math.ceil(ch * dpr);
      var x = f.getContext('2d');
      x.scale(dpr, dpr);
      var rr = cw * 0.1;
      x.fillStyle = '#fbfaf6'; x.strokeStyle = '#8c826f'; x.lineWidth = 1;
      x.beginPath();
      x.moveTo(rr, 0); x.lineTo(cw - rr, 0); x.quadraticCurveTo(cw, 0, cw, rr);
      x.lineTo(cw, ch - rr); x.quadraticCurveTo(cw, ch, cw - rr, ch);
      x.lineTo(rr, ch); x.quadraticCurveTo(0, ch, 0, ch - rr);
      x.lineTo(0, rr); x.quadraticCurveTo(0, 0, rr, 0);
      x.fill(); x.stroke();
      x.fillStyle = isRed(c) ? '#d3202a' : '#16171b';
      x.font = '800 ' + Math.round(cw * 0.38) + 'px sans-serif';
      x.textBaseline = 'top';
      x.fillText(RANKS[rankOf(c)], cw * 0.08, ch * 0.05);
      x.font = Math.round(cw * 0.3) + 'px sans-serif';
      x.fillText(SUITS[suitOf(c)], cw * 0.08, ch * 0.33);
      x.font = Math.round(cw * 0.6) + 'px sans-serif';
      x.textBaseline = 'bottom';
      x.fillText(SUITS[suitOf(c)], cw * 0.36, ch * 0.97);
      faces[c] = f;
      return f;
    }
    var depart = [];
    for (var i = 0; i < 4; i++) {
      var r = fonds[i].getBoundingClientRect();
      depart.push({ x: r.left, y: r.top });
    }
    var actives = [], lance = 0, rang = 12, pile = 0, t0 = 0, arret = false, raf = 0, dernier = 0;
    function lancer() {
      var c = pile * 13 + rang;
      var d = depart[pile];
      var vx = (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 4);
      actives.push({ c: c, x: d.x, y: d.y, vx: vx, vy: -Math.random() * 5, f: face(c) });
      pile++;
      if (pile === 4) { pile = 0; rang--; }
      lance++;
    }
    function image(t) {
      if (arret) return;
      // on a quitté la partie (écran masqué) : la cascade s'arrête
      if (!el.offsetParent) { stop(); return; }
      if (!t0) t0 = t;
      var dt = Math.min(2.2, (t - (dernier || t)) / 16.7);
      dernier = t;
      if (lance < 52 && t - t0 > lance * 150) lancer();
      for (var k = actives.length - 1; k >= 0; k--) {
        var a = actives[k];
        a.vy += 0.5 * dt;
        a.x += a.vx * dt; a.y += a.vy * dt;
        if (a.y + ch > H) { a.y = H - ch; a.vy = -a.vy * 0.78; }
        g.drawImage(a.f, a.x, a.y, cw, ch);
        if (a.x < -cw || a.x > W) actives.splice(k, 1);
      }
      if ((lance >= 52 && !actives.length) || t - t0 > 10000) { stop(); fini(); return; }
      raf = root.requestAnimationFrame(image);
    }
    function stop() {
      arret = true;
      root.cancelAnimationFrame(raf);
      if (cv.parentNode) {
        cv.style.transition = 'opacity .4s';
        cv.style.opacity = '0';
        setTimeout(function () { if (cv.parentNode) cv.parentNode.removeChild(cv); }, 420);
      }
    }
    cv.addEventListener('pointerdown', function () { stop(); fini(); });
    // le bandeau « Bravo ! » passe au-dessus de la cascade
    var ban = document.createElement('div');
    ban.className = 'sol-victoire';
    ban.innerHTML = banniereHtml || '';
    document.body.appendChild(ban);
    var bc = ban.querySelector('#sol-cloture');
    if (bc) bc.addEventListener('click', function () { stop(); fini(); });
    var stop0 = stop;
    stop = function () {
      stop0();
      if (ban.parentNode) ban.parentNode.removeChild(ban);
    };
    cascadeEnCours = { stop: stop };
    raf = root.requestAnimationFrame(image);
  }

  GG.register(mod);
  if (typeof module === 'object' && module.exports) module.exports = mod;
})(typeof self !== 'undefined' ? self : globalThis);
