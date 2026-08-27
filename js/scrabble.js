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
  var MAX_SCORELESS = 6; // fin de partie après 6 tours sans point

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

  function newGame(names) {
    var state = {
      board: new Array(SIZE * SIZE).fill(null),
      bag: shuffle(makeBag()),
      players: names.map(function (n) {
        return { name: n, rack: [], score: 0 };
      }),
      current: 0,
      scoreless: 0,
      moveCount: 0,
      history: [],
      over: false,
      finalDetail: null
    };
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

  function endByPlayOut(state, finisherIdx) {
    var gained = 0;
    var detail = [];
    state.players.forEach(function (p, i) {
      if (i === finisherIdx) return;
      var pts = p.rack.reduce(function (s, l) { return s + letterValue(l); }, 0);
      p.score -= pts;
      gained += pts;
      detail.push({ player: i, delta: -pts });
    });
    state.players[finisherIdx].score += gained;
    detail.push({ player: finisherIdx, delta: gained });
    state.over = true;
    state.finalDetail = { reason: 'playout', finisher: finisherIdx, detail: detail };
  }

  function endByScoreless(state) {
    var detail = [];
    state.players.forEach(function (p, i) {
      var pts = p.rack.reduce(function (s, l) { return s + letterValue(l); }, 0);
      p.score -= pts;
      detail.push({ player: i, delta: -pts });
    });
    state.over = true;
    state.finalDetail = { reason: 'scoreless', detail: detail };
  }

  function nextTurn(state) {
    state.current = (state.current + 1) % state.players.length;
  }

  /* Applique un coup déjà vérifié. Retourne le résultat de checkMove. */
  function playMove(state, playerIdx, placements) {
    if (state.over) return { ok: false, error: 'La partie est terminée.' };
    if (playerIdx !== state.current) return { ok: false, error: 'Ce n’est pas votre tour.' };
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
    state.moveCount++;
    // un coup légal à 0 point (joker seul) compte comme tour sans score
    if (res.total > 0) state.scoreless = 0; else state.scoreless++;
    // dernier coup joué : mis en évidence sur le plateau de tous les joueurs
    state.lastMove = {
      player: playerIdx,
      cells: placements.map(function (pl) { return pl.index; }),
      words: res.words.map(function (w) { return w.word; }),
      points: res.total
    };
    state.history.push({
      player: playerIdx,
      type: 'move',
      words: res.words,
      points: res.total,
      bingo: res.bingo
    });

    if (p.rack.length === 0 && state.bag.length === 0) {
      endByPlayOut(state, playerIdx);
    } else if (state.scoreless >= MAX_SCORELESS) {
      endByScoreless(state);
    } else {
      draw(state, playerIdx);
      nextTurn(state);
    }
    return res;
  }

  function passTurn(state, playerIdx) {
    if (state.over) return { ok: false, error: 'La partie est terminée.' };
    if (playerIdx !== state.current) return { ok: false, error: 'Ce n’est pas votre tour.' };
    state.scoreless++;
    state.history.push({ player: playerIdx, type: 'pass', points: 0 });
    if (state.scoreless >= MAX_SCORELESS) {
      endByScoreless(state);
    } else {
      nextTurn(state);
    }
    return { ok: true };
  }

  function exchange(state, playerIdx, letters) {
    if (state.over) return { ok: false, error: 'La partie est terminée.' };
    if (playerIdx !== state.current) return { ok: false, error: 'Ce n’est pas votre tour.' };
    if (!letters || letters.length === 0) {
      return { ok: false, error: 'Sélectionnez au moins une lettre à échanger.' };
    }
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
    draw(state, playerIdx);
    // Remet les lettres échangées dans le sac, puis mélange
    letters.forEach(function (l) { state.bag.push(l); });
    shuffle(state.bag);
    state.scoreless++;
    state.history.push({ player: playerIdx, type: 'exchange', points: 0, count: letters.length });
    if (state.scoreless >= MAX_SCORELESS) {
      endByScoreless(state);
    } else {
      nextTurn(state);
    }
    return { ok: true };
  }

  return {
    SIZE: SIZE,
    CENTER: CENTER,
    RACK_SIZE: RACK_SIZE,
    JOKER: JOKER,
    PREMIUM: PREMIUM,
    DISTRIBUTION: DISTRIBUTION,
    letterValue: letterValue,
    newGame: newGame,
    checkMove: checkMove,
    playMove: playMove,
    passTurn: passTurn,
    exchange: exchange
  };
});
