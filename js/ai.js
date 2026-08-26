/*
 * GGWORDS — moteur de l'adversaire IA.
 * Cherche tous les coups légaux (mots du dictionnaire, mots croisés valides,
 * jokers, cases bonus) puis choisit selon le niveau de difficulté.
 * Fonctionne dans le navigateur (window.AI) et sous Node (tests).
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
  var MAX_WORD = 8;      // longueur maximale des mots tentés par l'IA
  var ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  /* Construit les structures de recherche à partir du fichier texte. */
  function buildDict(text) {
    var set = new Set();
    var byLen = {};
    var l;
    for (l = 2; l <= MAX_WORD; l++) byLen[l] = [];
    text.split('\n').forEach(function (w) {
      w = w.trim();
      if (w.length < 2 || w.length > MAX_WORD) return;
      set.add(w);
      byLen[w.length].push(w);
    });
    return { set: set, byLen: byLen };
  }

  function letterAt(board, r, c) {
    if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return null;
    var cell = board[r * SIZE + c];
    return cell ? cell.letter : null;
  }

  /*
   * Lettres autorisées sur une case vide pour que le mot perpendiculaire
   * formé soit valide. Renvoie null si aucune contrainte (pas de voisin),
   * sinon un Set (éventuellement vide).
   */
  function crossChecks(board, dict, r, c, horizontal) {
    var dr = horizontal ? 1 : 0; // perpendiculaire
    var dc = horizontal ? 0 : 1;
    var prefix = '';
    var suffix = '';
    var rr = r - dr, cc = c - dc;
    while (letterAt(board, rr, cc)) {
      prefix = letterAt(board, rr, cc) + prefix;
      rr -= dr; cc -= dc;
    }
    rr = r + dr; cc = c + dc;
    while (letterAt(board, rr, cc)) {
      suffix += letterAt(board, rr, cc);
      rr += dr; cc += dc;
    }
    if (!prefix && !suffix) return null;
    var allowed = new Set();
    for (var i = 0; i < 26; i++) {
      var L = ALPHABET[i];
      if (dict.set.has(prefix + L + suffix)) allowed.add(L);
    }
    return allowed;
  }

  /* Multiset des lettres du chevalet ('?' = joker). */
  function rackCounts(rack) {
    var counts = {};
    var jokers = 0;
    rack.forEach(function (l) {
      if (l === '?') jokers++;
      else counts[l] = (counts[l] || 0) + 1;
    });
    return { counts: counts, jokers: jokers };
  }

  /*
   * Cherche tous les coups légaux.
   * S : moteur Scrabble ; renvoie [{placements, total, words}] (non trié).
   */
  function findAllMoves(S, state, playerIdx, dict, budgetMs) {
    var board = state.board;
    var rack = state.players[playerIdx].rack;
    var rc = rackCounts(rack);
    var moves = [];
    var deadline = Date.now() + (budgetMs || 4000);
    var firstMove = state.moveCount === 0;

    // Cases d'ancrage : vides et voisines d'une lettre (ou le centre au 1er coup)
    var anchors = new Set();
    if (firstMove) {
      anchors.add(S.CENTER);
    } else {
      for (var i = 0; i < SIZE * SIZE; i++) {
        if (board[i]) continue;
        var r0 = Math.floor(i / SIZE), c0 = i % SIZE;
        if (letterAt(board, r0 - 1, c0) || letterAt(board, r0 + 1, c0) ||
            letterAt(board, r0, c0 - 1) || letterAt(board, r0, c0 + 1)) {
          anchors.add(i);
        }
      }
      if (!anchors.size) return moves;
    }

    [true, false].forEach(function (horizontal) {
      for (var line = 0; line < SIZE; line++) {
        if (Date.now() > deadline) return;
        // Contenu de la ligne + contraintes croisées
        var idxs = [];
        var letters = [];
        var anchorIn = [];
        var cross = [];
        var hasAnchor = false;
        for (var k = 0; k < SIZE; k++) {
          var idx = horizontal ? line * SIZE + k : k * SIZE + line;
          idxs.push(idx);
          var cell = board[idx];
          letters.push(cell ? cell.letter : null);
          var isAnchor = anchors.has(idx);
          anchorIn.push(isAnchor);
          if (isAnchor) hasAnchor = true;
          if (!cell) {
            var rr = horizontal ? line : k;
            var cc = horizontal ? k : line;
            cross.push(crossChecks(board, dict, rr, cc, horizontal));
          } else {
            cross.push(null);
          }
        }
        if (!hasAnchor) continue;

        for (var start = 0; start < SIZE - 1; start++) {
          if (start > 0 && letters[start - 1]) continue; // début de mot obligatoire
          var empties = 0;
          var anchored = false;
          for (var end = start; end < SIZE; end++) {
            if (!letters[end]) empties++;
            if (anchorIn[end]) anchored = true;
            var len = end - start + 1;
            if (len > MAX_WORD || empties > 7) break;
            if (len < 2) continue;
            if (end < SIZE - 1 && letters[end + 1]) continue; // fin de mot obligatoire
            if (!anchored || empties === 0) continue;
            scanSlot(start, len);
          }
        }

        function scanSlot(start, len) {
          var words = dict.byLen[len];
          if (!words) return;
          for (var w = 0; w < words.length; w++) {
            if ((w & 1023) === 0 && Date.now() > deadline) return;
            var word = words[w];
            var ok = true;
            for (var k = 0; k < len; k++) {
              var fixed = letters[start + k];
              var ch = word[k];
              if (fixed) {
                if (fixed !== ch) { ok = false; break; }
              } else {
                var allow = cross[start + k];
                if (allow && !allow.has(ch)) { ok = false; break; }
              }
            }
            if (!ok) continue;
            // Les lettres à poser sont-elles dans le chevalet (jokers compris) ?
            var need = {};
            for (k = 0; k < len; k++) {
              if (!letters[start + k]) {
                var c2 = word[k];
                need[c2] = (need[c2] || 0) + 1;
              }
            }
            var jokersLeft = rc.jokers;
            var placements = [];
            var feasible = true;
            var useJoker = {};
            Object.keys(need).forEach(function (L) {
              var have = rc.counts[L] || 0;
              var missing = need[L] - have;
              if (missing > 0) {
                if (missing > jokersLeft) { feasible = false; return; }
                jokersLeft -= missing;
                useJoker[L] = missing;
              }
            });
            if (!feasible) continue;
            var realLeft = {};
            Object.keys(need).forEach(function (L) {
              realLeft[L] = Math.min(need[L], rc.counts[L] || 0);
            });
            for (k = 0; k < len; k++) {
              if (letters[start + k]) continue;
              var ch2 = word[k];
              var blank;
              if (realLeft[ch2] > 0) { realLeft[ch2]--; blank = false; }
              else blank = true;
              placements.push({ index: idxs[start + k], letter: ch2, blank: blank });
            }
            var res = S.checkMove(state, placements);
            if (res.ok) {
              moves.push({ placements: placements, total: res.total, words: res.words });
            }
          }
        }
      }
    });
    return moves;
  }

  /*
   * Décide l'action de l'IA.
   * level : 'facile' | 'moyen' | 'difficile'
   * Renvoie {kind:'move', placements, total, words} |
   *         {kind:'exchange', letters} | {kind:'pass'}
   */
  function chooseAction(S, state, playerIdx, dict, level) {
    var moves = findAllMoves(S, state, playerIdx, dict,
      level === 'difficile' ? 6000 : 4000);
    if (!moves.length) {
      var rack = state.players[playerIdx].rack;
      if (state.bag.length >= 7 && rack.length) {
        return { kind: 'exchange', letters: rack.slice() };
      }
      return { kind: 'pass' };
    }
    moves.sort(function (a, b) { return b.total - a.total; });
    var n = moves.length;
    var pick;
    if (level === 'difficile') {
      pick = 0;
    } else if (level === 'moyen') {
      // un coup correct sans être optimal : entre ~15 % et ~45 % du classement
      var lo = Math.min(n - 1, Math.floor(n * 0.15));
      var hi = Math.min(n - 1, Math.max(lo, Math.floor(n * 0.45)));
      pick = lo + Math.floor(Math.random() * (hi - lo + 1));
    } else {
      // facile : un coup faible, dans la moitié basse du classement
      var lo2 = Math.min(n - 1, Math.floor(n * 0.55));
      pick = lo2 + Math.floor(Math.random() * (n - lo2));
    }
    var m = moves[pick];
    return { kind: 'move', placements: m.placements, total: m.total, words: m.words };
  }

  return {
    buildDict: buildDict,
    findAllMoves: findAllMoves,
    chooseAction: chooseAction
  };
});
