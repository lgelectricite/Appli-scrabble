/* GGgames — Puissance 4 (2 joueurs, série de manches). */
(function (root) {
  'use strict';
  var GG = root.GG;
  var COLS = 7, ROWS = 6;

  function winLine(grid, idx) {
    var c = idx % COLS, r = Math.floor(idx / COLS);
    var who = grid[idx];
    var dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
    for (var d = 0; d < dirs.length; d++) {
      var dc = dirs[d][0], dr = dirs[d][1];
      var line = [idx];
      var cc, rr;
      for (cc = c + dc, rr = r + dr;
           cc >= 0 && cc < COLS && rr >= 0 && rr < ROWS && grid[rr * COLS + cc] === who;
           cc += dc, rr += dr) line.push(rr * COLS + cc);
      for (cc = c - dc, rr = r - dr;
           cc >= 0 && cc < COLS && rr >= 0 && rr < ROWS && grid[rr * COLS + cc] === who;
           cc -= dc, rr -= dr) line.push(rr * COLS + cc);
      if (line.length >= 4) return line;
    }
    return null;
  }

  function newRound(state) {
    state.grid = new Array(COLS * ROWS).fill(null);
    state.current = state.starter;
    state.roundOver = false;
    state.winner = -1;
    state.line = [];
    state.draw = false;
  }

  var mod = {
    id: 'p4',
    nom: 'Puissance 4',
    icone: '🔴',
    desc: 'Alignez 4 jetons. Série de manches.',
    regles: '<p><strong>🎯 Le but :</strong> aligner 4 jetons de votre couleur — à l’horizontale, à la verticale ou en diagonale — avant l’adversaire.</p><p><strong>Comment jouer :</strong> touchez une colonne, votre jeton tombe tout en bas. Chacun son tour !</p><p><strong>La série :</strong> les manches s’enchaînent, chaque victoire compte au score.</p>',
    min: 2, max: 2,
    hotseat: true, hidden: false, netOnly: false,

    create: function (names) {
      var state = {
        players: names.map(function (n) { return { name: n, wins: 0 }; }),
        starter: 0
      };
      newRound(state);
      return state;
    },

    turnOf: function (state) { return state.roundOver ? -1 : state.current; },
    over: function () { return false; }, // la série continue jusqu'au « Quitter »
    scoreOf: function (state, i) { return state.players[i].wins; },
    summary: function () { return ''; },

    apply: function (state, player, action) {
      if (action.t === 'again') {
        if (!state.roundOver) return { ok: false, error: 'La manche n’est pas finie.' };
        state.starter = 1 - state.starter;
        newRound(state);
        return { ok: true };
      }
      if (action.t !== 'drop') return { ok: false, error: 'Action inconnue.' };
      if (state.roundOver) return { ok: false, error: 'Manche terminée.' };
      if (player !== state.current) return { ok: false, error: 'Ce n’est pas votre tour.' };
      var col = action.col | 0;
      if (col < 0 || col >= COLS) return { ok: false, error: 'Colonne invalide.' };
      var row = -1;
      for (var r = ROWS - 1; r >= 0; r--) {
        if (!state.grid[r * COLS + col]) { row = r; break; }
      }
      if (row === -1) return { ok: false, error: 'Colonne pleine.' };
      var idx = row * COLS + col;
      state.grid[idx] = player === 0 ? 'R' : 'J';
      var line = winLine(state.grid, idx);
      if (line) {
        state.roundOver = true;
        state.winner = player;
        state.line = line;
        state.players[player].wins++;
      } else if (state.grid.every(function (c) { return c; })) {
        state.roundOver = true;
        state.draw = true;
      } else {
        state.current = 1 - state.current;
      }
      return { ok: true };
    },

    /* L'adversaire IA : gagne si possible, bloque sinon, évite d'offrir
       une victoire, préfère le centre. Un soupçon de hasard le rend humain. */
    bot: function (state, me) {
      if (state.roundOver) return null;
      if (state.current !== me) return null;
      var grid = state.grid;
      var moi = me === 0 ? 'R' : 'J';
      var lui = me === 0 ? 'J' : 'R';

      function ligneLibre(g, col) {
        for (var r = ROWS - 1; r >= 0; r--) if (!g[r * COLS + col]) return r;
        return -1;
      }
      function gagne(g, col, jeton) {
        var r = ligneLibre(g, col);
        if (r === -1) return false;
        g[r * COLS + col] = jeton;
        var ok = !!winLine(g, r * COLS + col);
        g[r * COLS + col] = null;
        return ok;
      }
      var jouables = [];
      for (var c = 0; c < COLS; c++) if (ligneLibre(grid, c) !== -1) jouables.push(c);
      if (!jouables.length) return null;
      // 1) un coup gagnant ? on le joue
      for (var w = 0; w < jouables.length; w++) {
        if (gagne(grid, jouables[w], moi)) return { t: 'drop', col: jouables[w] };
      }
      // 2) l'adversaire menace de gagner ? on bloque
      for (var b = 0; b < jouables.length; b++) {
        if (gagne(grid, jouables[b], lui)) return { t: 'drop', col: jouables[b] };
      }
      // 3) on écarte les colonnes qui offriraient la victoire juste au-dessus
      var sures = jouables.filter(function (col) {
        var r = ligneLibre(grid, col);
        grid[r * COLS + col] = moi;
        var offre = r > 0 && gagne(grid, col, lui);
        grid[r * COLS + col] = null;
        return !offre;
      });
      var choix = sures.length ? sures : jouables;
      // 4) préférence pour le centre, pondérée d'un peu de hasard
      choix.sort(function (a, b2) {
        return (Math.abs(b2 - 3) - Math.abs(a - 3)) * -1 + (Math.random() - 0.5);
      });
      return { t: 'drop', col: choix[0] };
    },

    render: function (el, ctx) {
      var s = ctx.state;
      var html = '<div class="p4-board">';
      for (var r = 0; r < ROWS; r++) {
        for (var c = 0; c < COLS; c++) {
          var v = s.grid[r * COLS + c];
          var win = s.line.indexOf(r * COLS + c) !== -1;
          html += '<div class="p4-cell' + (win ? ' win' : '') + '" data-col="' + c + '">' +
            (v ? '<span class="p4-disc ' + (v === 'R' ? 'red' : 'yellow') + '"></span>' : '') +
            '</div>';
        }
      }
      html += '</div>';
      if (s.roundOver) {
        html += '<p class="mini-msg">' +
          (s.draw ? 'Match nul !' : '🏆 ' + GG.esc(s.players[s.winner].name) + ' gagne la manche !') +
          '</p><button class="btn big primary" data-a="again">Manche suivante</button>';
      } else {
        var mine = ctx.me === s.current;
        html += '<p class="mini-msg">' +
          '<span class="p4-disc mini ' + (s.current === 0 ? 'red' : 'yellow') + '"></span> ' +
          (mine ? 'À vous de jouer !' : 'Au tour de ' + GG.esc(s.players[s.current].name) + '…') + '</p>';
      }
      el.innerHTML = html;
      el.querySelectorAll('.p4-cell').forEach(function (cell) {
        cell.addEventListener('click', function () {
          if (!s.roundOver && ctx.me === s.current) {
            ctx.act({ t: 'drop', col: parseInt(cell.dataset.col, 10) });
          }
        });
      });
      var again = el.querySelector('[data-a="again"]');
      if (again) again.addEventListener('click', function () { ctx.act({ t: 'again' }); });
    }
  };

  GG.register(mod);
  if (typeof module === 'object' && module.exports) module.exports = mod;
})(typeof self !== 'undefined' ? self : globalThis);
