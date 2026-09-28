/*
 * Moteur de jeu Scrabble (règles françaises).
 * Fonctionne dans le navigateur (window.Scrabble) et sous Node (tests).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Scrabble = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SIZE = 15;
  var CENTER = 7 * SIZE + 7;
  var RACK_SIZE = 7;
  var BINGO_BONUS = 50;
  /* Règlement international du Scrabble classique (FISF), § 3.2 : « si les
     deux joueurs passent chacun leur tour trois fois consécutivement (donc
     six JE PASSE), la partie s'arrête et chaque joueur défalque de son
     cumul la valeur de ses lettres ». Un échange (§ 3.3) n'est PAS un
     « je passe », pas plus qu'un coup, même à 0 point. Généralisé à 3 ou
     4 joueurs : la partie s'arrête quand CHAQUE joueur a passé 3 fois de
     suite. Un mot refusé qui fait perdre le tour compte comme un passe
     (§ 3.5.3 : « A reprend ses lettres, et passe son tour »). */
  var PASSES_FIN = 3;
  /* Variante « essais » (celle des applis) : on peut retenter après un mot
     refusé, mais au 3e refus dans le même tour, le tour est perdu. */
  var ESSAIS_MAX = 3;

  var JOKER = '?';

  // Distribution française officielle : lettre -> [nombre, valeur]
  var DISTRIBUTION = {
    A: [9, 1], B: [2, 3], C: [2, 3], D: [3, 2], E: [15, 1], F: [2, 4],
    G: [2, 2], H: [2, 4], I: [8, 1], J: [1, 8], K: [1, 10], L: [5, 1],
    M: [3, 2], N: [6, 1], O: [6, 1], P: [2, 3], Q: [1, 8], R: [6, 1],
    S: [6, 1], T: [6, 1], U: [6, 1], V: [2, 4], W: [1, 10], X: [1, 10],
    Y: [1, 10], Z: [1, 10]
  };
  DISTRIBUTION[JOKER] = [2, 0];

  // Cases bonus : construit une carte index -> 'MT'|'MD'|'LT'|'LD'
  var PREMIUM = (function () {
    var map = {};
    function set(coords, type) {
      coords.forEach(function (rc) { map[rc[0] * SIZE + rc[1]] = type; });
    }
    set([[0, 0], [0, 7], [0, 14], [7, 0], [7, 14], [14, 0], [14, 7], [14, 14]], 'MT');
    var md = [[7, 7]];
    for (var i = 1; i <= 4; i++) {
      md.push([i, i], [i, 14 - i], [14 - i, i], [14 - i, 14 - i]);
    }
    for (var j = 10; j <= 13; j++) {
      md.push([j, j], [j, 14 - j], [14 - j, j], [14 - j, 14 - j]);
    }
    set(md, 'MD');
    set([[1, 5], [1, 9], [5, 1], [5, 5], [5, 9], [5, 13],
         [9, 1], [9, 5], [9, 9], [9, 13], [13, 5], [13, 9]], 'LT');
    set([[0, 3], [0, 11], [2, 6], [2, 8], [3, 0], [3, 7], [3, 14],
         [6, 2], [6, 6], [6, 8], [6, 12], [7, 3], [7, 11],
         [8, 2], [8, 6], [8, 8], [8, 12], [11, 0], [11, 7], [11, 14],
         [12, 6], [12, 8], [14, 3], [14, 11]], 'LD');
    return map;
  })();

  function letterValue(letter) {
    var d = DISTRIBUTION[letter];
    return d ? d[1] : 0;
  }

  function makeBag() {
    var bag = [];
    Object.keys(DISTRIBUTION).forEach(function (letter) {
      for (var i = 0; i < DISTRIBUTION[letter][0]; i++) bag.push(letter);
    });
    return bag;
  }

  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  function draw(state, playerIdx) {
    var p = state.players[playerIdx];
    while (p.rack.length < RACK_SIZE && state.bag.length > 0) {
      p.rack.push(state.bag.pop());
    }
  }

  /* Rang d'une lettre au tirage au sort : le joker d'abord, puis A, B… */
  function rangTirage(l) {
    return l === JOKER ? -1 : l.charCodeAt(0) - 65;
  }

  /*
   * Tirage au sort du premier joueur : chacun pioche une lettre, la plus
   * proche du A commence (le joker bat toutes les lettres). En cas
   * d'égalité en tête, seuls les ex æquo retirent. Les lettres retournent
   * ensuite dans le sac. Remplit state.tirage (les tours de tirage, pour
   * l'animation) et state.premier.
   */
  function tirageAuSort(state) {
    var enLice = state.players.map(function (_, i) { return i; });
    var tours = [];
    while (enLice.length > 1 && tours.length < 12) {
      var sac = state.bag.slice();
      var tour = enLice.map(function (p) {
        var k = Math.floor(Math.random() * sac.length);
        var l = sac.splice(k, 1)[0];
        return { p: p, l: l };
      });
      tours.push(tour);
      var meilleur = Math.min.apply(null, tour.map(function (t) { return rangTirage(t.l); }));
      enLice = tour.filter(function (t) { return rangTirage(t.l) === meilleur; })
        .map(function (t) { return t.p; });
    }
    // filet de sécurité (douze égalités de suite : quasi impossible)
    if (enLice.length > 1) enLice = [enLice[Math.floor(Math.random() * enLice.length)]];
    state.tirage = tours;
    state.premier = enLice[0];
    state.current = enLice[0];
  }

  function nouvelId() {
    return Date.now().toString(36) + Math.floor(Math.random() * 1e9).toString(36);
  }

  /*
   * Nouvelle partie. opts (facultatif) :
   *   refus   : 'essais' (défaut : on peut retenter un mot refusé, 3 essais
   *             par tour) ou 'perdu' (règle classique : mot refusé = tour perdu)
   *   premier : force le premier joueur (tests) ; sinon tirage au sort.
   */
  function newGame(names, opts) {
    opts = opts || {};
    var state = {
      id: nouvelId(),
      board: new Array(SIZE * SIZE).fill(null),
      bag: shuffle(makeBag()),
      players: names.map(function (n) {
        return { name: n, rack: [], score: 0, passes: 0, refus: 0 };
      }),
      current: 0,
      premier: 0,
      tirage: [],
      regles: { refus: opts.refus === 'perdu' ? 'perdu' : 'essais' },
      essais: 0,
      moveCount: 0,
      history: [],
      lastMove: null,
      over: false,
      finalDetail: null
    };
    if (typeof opts.premier === 'number' && opts.premier >= 0 && opts.premier < names.length) {
      state.premier = state.current = opts.premier;
    } else {
      tirageAuSort(state);
    }
    state.players.forEach(function (_, i) { draw(state, i); });
    return state;
  }

  /*
   * placements : [{index, letter, blank}] — letter est la lettre affichée
   * (pour un joker, la lettre choisie et blank=true).
   * Retourne {ok:false, error} ou
   * {ok:true, words:[{word, score}], total, bingo}
   */
  function checkMove(state, placements) {
    var board = state.board;
    if (!placements || placements.length === 0) {
      return { ok: false, error: 'Placez au moins une lettre.' };
    }
    var seen = {};
    for (var k = 0; k < placements.length; k++) {
      var pl = placements[k];
      // validation stricte : l'hôte est l'autorité, un client modifié ne doit
      // pas pouvoir poser autre chose qu'UNE lettre A-Z par case
      if (!pl || typeof pl !== 'object' || !Number.isInteger(pl.index) ||
          typeof pl.letter !== 'string' || !/^[A-Z]$/.test(pl.letter)) {
        return { ok: false, error: 'Placement invalide.' };
      }
      if (pl.index < 0 || pl.index >= SIZE * SIZE) {
        return { ok: false, error: 'Case hors du plateau.' };
      }
      if (board[pl.index]) return { ok: false, error: 'Case déjà occupée.' };
      if (seen[pl.index]) return { ok: false, error: 'Deux lettres sur la même case.' };
      seen[pl.index] = true;
    }

    var rows = placements.map(function (p) { return Math.floor(p.index / SIZE); });
    var cols = placements.map(function (p) { return p.index % SIZE; });
    var sameRow = rows.every(function (r) { return r === rows[0]; });
    var sameCol = cols.every(function (c) { return c === cols[0]; });
    if (!sameRow && !sameCol) {
      return { ok: false, error: 'Les lettres doivent être alignées sur une seule ligne ou colonne.' };
    }
    // Pour une seule lettre, l'axe est déterminé par les mots formés.
    var horizontal = sameRow && (placements.length > 1 || !sameCol) ? true : !sameCol ? false : true;
    if (placements.length === 1) horizontal = true; // recalculé plus bas via les mots croisés

    // Plateau virtuel avec les nouvelles lettres
    var virt = {};
    placements.forEach(function (p) {
      virt[p.index] = { letter: p.letter, blank: !!p.blank, isNew: true };
    });
    function cellAt(idx) {
      if (virt[idx]) return virt[idx];
      return board[idx];
    }

    // Contiguïté sur l'axe principal
    var fixed, from, to;
    if (sameRow && placements.length > 1) {
      fixed = rows[0];
      from = Math.min.apply(null, cols);
      to = Math.max.apply(null, cols);
      for (var c = from; c <= to; c++) {
        if (!cellAt(fixed * SIZE + c)) {
          return { ok: false, error: 'Le mot ne doit pas comporter de trou.' };
        }
      }
      horizontal = true;
    } else if (sameCol && placements.length > 1) {
      fixed = cols[0];
      from = Math.min.apply(null, rows);
      to = Math.max.apply(null, rows);
      for (var r = from; r <= to; r++) {
        if (!cellAt(r * SIZE + fixed)) {
          return { ok: false, error: 'Le mot ne doit pas comporter de trou.' };
        }
      }
      horizontal = false;
    }

    var firstMove = state.moveCount === 0;
    if (firstMove) {
      var coversCenter = placements.some(function (p) { return p.index === CENTER; });
      if (!coversCenter) {
        return { ok: false, error: 'Le premier mot doit passer par la case centrale (étoile).' };
      }
      if (placements.length < 2) {
        return { ok: false, error: 'Le premier mot doit comporter au moins deux lettres.' };
      }
    } else {
      // Doit toucher au moins une lettre existante
      var touches = placements.some(function (p) {
        var r0 = Math.floor(p.index / SIZE), c0 = p.index % SIZE;
        var neigh = [];
        if (r0 > 0) neigh.push(p.index - SIZE);
        if (r0 < SIZE - 1) neigh.push(p.index + SIZE);
        if (c0 > 0) neigh.push(p.index - 1);
        if (c0 < SIZE - 1) neigh.push(p.index + 1);
        return neigh.some(function (n) { return !!board[n]; });
      });
      if (!touches) {
        return { ok: false, error: 'Le mot doit toucher une lettre déjà posée.' };
      }
    }

    // Construit un mot à partir d'une case, le long d'un axe
    function wordThrough(idx, horiz) {
      var r = Math.floor(idx / SIZE), c = idx % SIZE;
      var dr = horiz ? 0 : 1, dc = horiz ? 1 : 0;
      // remonte au début
      while (r - dr >= 0 && c - dc >= 0 && cellAt((r - dr) * SIZE + (c - dc))) {
        r -= dr; c -= dc;
      }
      var letters = [];
      var score = 0;
      var wordMult = 1;
      var length = 0;
      var containsNew = false;
      while (r < SIZE && c < SIZE) {
        var cell = cellAt(r * SIZE + c);
        if (!cell) break;
        var i2 = r * SIZE + c;
        var v = cell.blank ? 0 : letterValue(cell.letter);
        if (cell.isNew) {
          containsNew = true;
          var prem = PREMIUM[i2];
          if (prem === 'LD') v *= 2;
          else if (prem === 'LT') v *= 3;
          else if (prem === 'MD') wordMult *= 2;
          else if (prem === 'MT') wordMult *= 3;
        }
        score += v;
        letters.push(cell.letter);
        length++;
        r += dr; c += dc;
      }
      return { word: letters.join(''), score: score * wordMult, length: length, containsNew: containsNew };
    }

    var words = [];
    var mainIdx = placements[0].index;
    var main = wordThrough(mainIdx, horizontal);
    if (main.length >= 2) words.push(main);
    // Mots croisés pour chaque nouvelle lettre
    placements.forEach(function (p) {
      var cross = wordThrough(p.index, !horizontal);
      if (cross.length >= 2) words.push(cross);
    });
    // Cas de la lettre unique : wordThrough horizontal et vertical déjà couverts
    if (placements.length === 1) {
      words = [];
      var h = wordThrough(mainIdx, true);
      var v2 = wordThrough(mainIdx, false);
      if (h.length >= 2) words.push(h);
      if (v2.length >= 2) words.push(v2);
    }

    if (words.length === 0) {
      return { ok: false, error: 'Aucun mot d’au moins deux lettres n’est formé.' };
    }

    var total = 0;
    words.forEach(function (w) { total += w.score; });
    var bingo = placements.length === RACK_SIZE;
    if (bingo) total += BINGO_BONUS;

    return {
      ok: true,
      words: words.map(function (w) { return { word: w.word, score: w.score }; }),
      total: total,
      bingo: bingo
    };
  }

  // Vérifie que le joueur possède bien les lettres posées et les retire du chevalet.
  function takeFromRack(rack, placements) {
    var copy = rack.slice();
    for (var i = 0; i < placements.length; i++) {
      var need = placements[i].blank ? JOKER : placements[i].letter;
      var at = copy.indexOf(need);
      if (at === -1) return null;
      copy.splice(at, 1);
    }
    return copy;
  }

  function rackValue(rack) {
    return (rack || []).reduce(function (s, l) { return s + letterValue(l); }, 0);
  }

  /* Fin par épuisement du reliquat (§ 5.1.1) : le finisseur empoche la
     valeur des lettres restant aux autres, qui la perdent. */
  function endByPlayOut(state, finisherIdx) {
    var gained = 0;
    var detail = [];
    state.players.forEach(function (p, i) {
      if (i === finisherIdx) return;
      var pts = rackValue(p.rack);
      detail.push({ player: i, avant: p.score, delta: -pts, lettres: p.rack.slice() });
      p.score -= pts;
      gained += pts;
    });
    var f = state.players[finisherIdx];
    detail.push({ player: finisherIdx, avant: f.score, delta: gained, lettres: [] });
    f.score += gained;
    state.over = true;
    state.finalDetail = { reason: 'playout', finisher: finisherIdx, detail: detail };
  }

  /* Fin par passes consécutives (§ 3.2 et 5.1.4) : chacun défalque la
     valeur de ses lettres. */
  function endByPasses(state) {
    var detail = [];
    state.players.forEach(function (p, i) {
      var pts = rackValue(p.rack);
      detail.push({ player: i, avant: p.score, delta: -pts, lettres: p.rack.slice() });
      p.score -= pts;
    });
    state.over = true;
    state.finalDetail = { reason: 'passes', detail: detail };
  }

  /* Chaque joueur a-t-il passé PASSES_FIN fois de suite ? */
  function tousOntPasse(state) {
    return state.players.every(function (p) { return (p.passes || 0) >= PASSES_FIN; });
  }

  function nextTurn(state) {
    state.current = (state.current + 1) % state.players.length;
    state.essais = 0;
  }

  /* Applique un coup déjà vérifié. Retourne le résultat de checkMove. */
  function playMove(state, playerIdx, placements) {
    if (state.over) return { ok: false, error: 'La partie est terminée.' };
    if (playerIdx !== state.current) return { ok: false, error: 'Ce n’est pas votre tour.' };
    if (!Array.isArray(placements) || placements.length > RACK_SIZE) {
      return { ok: false, error: 'Placement invalide.' };
    }
    var res = checkMove(state, placements);
    if (!res.ok) return res;
    var p = state.players[playerIdx];
    var newRack = takeFromRack(p.rack, placements);
    if (!newRack) return { ok: false, error: 'Lettre absente du chevalet.' };

    placements.forEach(function (pl) {
      state.board[pl.index] = { letter: pl.letter, blank: !!pl.blank };
    });
    p.rack = newRack;
    p.score += res.total;
    p.passes = 0; // un coup, même à 0 point, n'est pas un « je passe »
    state.moveCount++;
    // dernier coup joué : mis en évidence sur le plateau de tous les joueurs
    state.lastMove = {
      player: playerIdx,
      cells: placements.map(function (pl) { return pl.index; }),
      words: res.words.map(function (w) { return w.word; }),
      points: res.total
    };
    var entree = {
      player: playerIdx,
      type: 'move',
      words: res.words,
      points: res.total,
      bingo: res.bingo,
      cells: placements.map(function (pl) { return { i: pl.index, l: pl.letter, b: !!pl.blank }; }),
      tires: 0
    };
    state.history.push(entree);

    if (p.rack.length === 0 && state.bag.length === 0) {
      endByPlayOut(state, playerIdx);
    } else {
      var avant = p.rack.length;
      draw(state, playerIdx);
      entree.tires = p.rack.length - avant;
      nextTurn(state);
    }
    return res;
  }

  /* « Je passe » (ou tour perdu : opts.refus = mot refusé). */
  function passer(state, playerIdx, opts) {
    var p = state.players[playerIdx];
    p.passes = (p.passes || 0) + 1;
    var entree = { player: playerIdx, type: 'pass', points: 0 };
    if (opts && opts.refus) entree.refus = opts.refus;
    state.history.push(entree);
    if (tousOntPasse(state)) {
      endByPasses(state);
    } else {
      nextTurn(state);
    }
  }

  function passTurn(state, playerIdx) {
    if (state.over) return { ok: false, error: 'La partie est terminée.' };
    if (playerIdx !== state.current) return { ok: false, error: 'Ce n’est pas votre tour.' };
    passer(state, playerIdx);
    return { ok: true };
  }

  /*
   * Un mot proposé n'est pas au dictionnaire. Selon state.regles.refus :
   *   'essais' : on peut retenter, mais au 3e refus du tour, le tour est perdu ;
   *   'perdu'  : règle classique, le tour est perdu tout de suite.
   * Renvoie {ok, perdu, essais, restants}. Le compteur de mots refusés de
   * chaque joueur figure dans les statistiques de fin de partie.
   */
  function refuseMove(state, playerIdx, mot) {
    if (state.over) return { ok: false, error: 'La partie est terminée.' };
    if (playerIdx !== state.current) return { ok: false, error: 'Ce n’est pas votre tour.' };
    mot = String(mot == null ? '' : mot).toUpperCase().replace(/[^A-Z]/g, '').slice(0, SIZE);
    var p = state.players[playerIdx];
    p.refus = (p.refus || 0) + 1;
    state.essais = (state.essais || 0) + 1;
    var essais = state.essais;
    var classique = !!(state.regles && state.regles.refus === 'perdu');
    if (classique || essais >= ESSAIS_MAX) {
      passer(state, playerIdx, { refus: mot || '?' });
      return { ok: true, perdu: true, essais: essais, restants: 0 };
    }
    return { ok: true, perdu: false, essais: essais, restants: ESSAIS_MAX - essais };
  }

  function exchange(state, playerIdx, letters) {
    if (state.over) return { ok: false, error: 'La partie est terminée.' };
    if (playerIdx !== state.current) return { ok: false, error: 'Ce n’est pas votre tour.' };
    if (!Array.isArray(letters) || letters.length === 0) {
      return { ok: false, error: 'Sélectionnez au moins une lettre à échanger.' };
    }
    if (letters.length > RACK_SIZE) return { ok: false, error: 'Échange invalide.' };
    if (state.bag.length < RACK_SIZE) {
      return { ok: false, error: 'Échange impossible : moins de 7 lettres dans le sac.' };
    }
    var p = state.players[playerIdx];
    var copy = p.rack.slice();
    for (var i = 0; i < letters.length; i++) {
      var at = copy.indexOf(letters[i]);
      if (at === -1) return { ok: false, error: 'Lettre absente du chevalet.' };
      copy.splice(at, 1);
    }
    p.rack = copy;
    // § 3.3 : on pioche d'abord, puis on remet les lettres rejetées dans le sac
    draw(state, playerIdx);
    letters.forEach(function (l) { state.bag.push(l); });
    shuffle(state.bag);
    p.passes = 0; // un échange n'est pas un « je passe »
    state.history.push({ player: playerIdx, type: 'exchange', points: 0, count: letters.length, tires: letters.length });
    nextTurn(state);
    return { ok: true };
  }

  /*
   * Gagnants au sens de la coque : indices des joueurs au meilleur score ;
   * [] si tout le monde est à égalité.
   */
  function gagnants(state) {
    var top = Math.max.apply(null, state.players.map(function (p) { return p.score; }));
    var g = [];
    state.players.forEach(function (p, i) { if (p.score === top) g.push(i); });
    return g.length === state.players.length ? [] : g;
  }

  /* Statistiques de la partie, par joueur, tirées de l'historique. */
  function stats(state) {
    var st = state.players.map(function (p) {
      return { coups: 0, points: 0, moyenne: 0, meilleur: null, scrabbles: 0,
        refus: p.refus || 0, echanges: 0, passes: 0 };
    });
    (state.history || []).forEach(function (h) {
      var s = st[h.player];
      if (!s) return;
      if (h.type === 'move') {
        s.coups++;
        s.points += h.points || 0;
        if (h.bingo) s.scrabbles++;
        var mot = h.words && h.words.length
          ? h.words.slice().sort(function (a, b) { return b.score - a.score; })[0].word : '';
        if (!s.meilleur || h.points > s.meilleur.points) s.meilleur = { mot: mot, points: h.points };
      } else if (h.type === 'exchange') {
        s.echanges++;
      } else if (h.type === 'pass') {
        s.passes++;
      }
    });
    st.forEach(function (s) { s.moyenne = s.coups ? Math.round(s.points / s.coups * 10) / 10 : 0; });
    return st;
  }

  return {
    SIZE: SIZE,
    CENTER: CENTER,
    RACK_SIZE: RACK_SIZE,
    JOKER: JOKER,
    PREMIUM: PREMIUM,
    DISTRIBUTION: DISTRIBUTION,
    BINGO_BONUS: BINGO_BONUS,
    PASSES_FIN: PASSES_FIN,
    ESSAIS_MAX: ESSAIS_MAX,
    letterValue: letterValue,
    rackValue: rackValue,
    rangTirage: rangTirage,
    newGame: newGame,
    checkMove: checkMove,
    playMove: playMove,
    passTurn: passTurn,
    refuseMove: refuseMove,
    exchange: exchange,
    gagnants: gagnants,
    stats: stats
  };
});
