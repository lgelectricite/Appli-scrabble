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

    /* L'adversaire IA : un vrai moteur qui anticipe. Il explore l'arbre des
       coups sur 5 demi-tours (minimax avec élagage alpha-bêta) et évalue
       chaque position par fenêtres de 4 cases (menaces, doubles menaces,
       centre). Entre plusieurs coups quasi équivalents il tranche au
       hasard : ses ouvertures et son style varient d'une partie à l'autre. */
    bot: function (state, me) {
      if (state.roundOver) return null;
      if (state.current !== me) return null;
      var moi = me === 0 ? 'R' : 'J';
      var lui = me === 0 ? 'J' : 'R';
      var g = state.grid.slice();
      var ORDRE = [3, 2, 4, 1, 5, 0, 6]; // le centre d'abord : meilleur élagage
      var DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];
      var PROF = 5;

      function ligneLibre(gr, col) {
        for (var r = ROWS - 1; r >= 0; r--) if (!gr[r * COLS + col]) return r;
        return -1;
      }
      // score de la position vue de l'IA : chaque fenêtre de 4 cases où un
      // seul camp est présent compte — 3 jetons pèsent lourd, 2 un peu,
      // et tenir la colonne centrale rapporte toujours
      function evalue(gr) {
        var s = 0, r, c, d, k;
        for (r = 0; r < ROWS; r++) {
          if (gr[r * COLS + 3] === moi) s += 3;
          else if (gr[r * COLS + 3] === lui) s -= 3;
        }
        for (r = 0; r < ROWS; r++) {
          for (c = 0; c < COLS; c++) {
            for (d = 0; d < 4; d++) {
              var dc = DIRS[d][0], dr = DIRS[d][1];
              var r3 = r + 3 * dr, c3 = c + 3 * dc;
              if (r3 < 0 || r3 >= ROWS || c3 < 0 || c3 >= COLS) continue;
              var nm = 0, nl = 0;
              for (k = 0; k < 4; k++) {
                var v = gr[(r + k * dr) * COLS + (c + k * dc)];
                if (v === moi) nm++; else if (v === lui) nl++;
              }
              if (nm && nl) continue; // fenêtre neutralisée
              if (nm === 3) s += 60; else if (nm === 2) s += 8;
              if (nl === 3) s -= 70; else if (nl === 2) s -= 9;
            }
          }
        }
        return s;
      }
      function minimax(gr, prof, alpha, beta, aMoi) {
        var meilleur = aMoi ? -1e9 : 1e9;
        var plein = true;
        for (var o = 0; o < COLS; o++) {
          var col = ORDRE[o];
          var r = ligneLibre(gr, col);
          if (r === -1) continue;
          plein = false;
          var idx = r * COLS + col;
          gr[idx] = aMoi ? moi : lui;
          var val;
          if (winLine(gr, idx)) val = aMoi ? 100000 + prof : -100000 - prof;
          else if (prof === 0) val = evalue(gr);
          else val = minimax(gr, prof - 1, alpha, beta, !aMoi);
          gr[idx] = null;
          if (aMoi) {
            if (val > meilleur) meilleur = val;
            if (meilleur > alpha) alpha = meilleur;
          } else {
            if (val < meilleur) meilleur = val;
            if (meilleur < beta) beta = meilleur;
          }
          if (alpha >= beta) break;
        }
        return plein ? 0 : meilleur;
      }
      var poses = 0;
      for (var q = 0; q < COLS * ROWS; q++) if (g[q]) poses++;
      var coups = [];
      for (var o2 = 0; o2 < COLS; o2++) {
        var col2 = ORDRE[o2];
        var r2 = ligneLibre(g, col2);
        if (r2 === -1) continue;
        var idx2 = r2 * COLS + col2;
        g[idx2] = moi;
        var val2 = winLine(g, idx2) ? 200000
          : minimax(g, PROF - 1, -1e9, 1e9, false);
        g[idx2] = null;
        coups.push({ col: col2, val: val2 });
      }
      if (!coups.length) return null;
      var top = -1e9;
      coups.forEach(function (cp) { if (cp.val > top) top = cp.val; });
      // en ouverture il varie son jeu entre les colonnes centrales ; ensuite
      // seuls les coups quasi équivalents restent tirés au sort — et une
      // victoire se prend, point final
      var marge = poses < 4 ? 18 : 12;
      if (top > 50000) marge = 0;
      var bons = coups.filter(function (cp) { return cp.val >= top - marge; });
      if (poses < 4 && bons.length > 2) {
        var centres = bons.filter(function (cp) { return cp.col >= 1 && cp.col <= 5; });
        if (centres.length) bons = centres;
      }
      return { t: 'drop', col: bons[Math.floor(Math.random() * bons.length)].col };
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
      // pass-device : le pion posé redessine l'écran pour l'adversaire sans
      // que la grille bouge — un double-appui jouerait le pion de l'AUTRE
      // dans la même colonne. On ignore donc cette colonne un court instant.
      if (ctx.mode === 'local' && el._p4Cur !== undefined && el._p4Cur !== s.current) {
        el._p4Gel = { fin: Date.now() + 450, col: el._p4Col };
      }
      el._p4Cur = s.current;
      el.querySelectorAll('.p4-cell').forEach(function (cell) {
        cell.addEventListener('click', function () {
          var col = parseInt(cell.dataset.col, 10);
          if (el._p4Gel && Date.now() < el._p4Gel.fin && col === el._p4Gel.col) return;
          if (!s.roundOver && ctx.me === s.current) {
            el._p4Col = col;
            ctx.act({ t: 'drop', col: col });
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
