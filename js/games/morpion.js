/* GGgames — Morpion (2 joueurs, série de manches). */
(function (root) {
  'use strict';
  var GG = root.GG;
  var LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];

  function newRound(state) {
    state.grid = new Array(9).fill(null);
    state.current = state.starter;
    state.roundOver = false;
    state.winner = -1;
    state.line = [];
    state.draw = false;
  }

  var mod = {
    id: 'morpion',
    nom: 'Morpion',
    icone: '⭕',
    desc: 'Le tic-tac-toe classique, en série.',
    regles: '<p><strong>🎯 Le but :</strong> aligner 3 de vos symboles avant l’adversaire.</p><p><strong>Comment jouer :</strong> touchez une case libre, chacun son tour. Bloquez l’adversaire, tendez des pièges !</p><p><strong>La série :</strong> les manches s’enchaînent, chaque victoire compte.</p>',
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
    over: function () { return false; },
    scoreOf: function (state, i) { return state.players[i].wins; },
    summary: function () { return ''; },

    apply: function (state, player, action) {
      if (action.t === 'again') {
        if (!state.roundOver) return { ok: false, error: 'La manche n’est pas finie.' };
        state.starter = 1 - state.starter;
        newRound(state);
        return { ok: true };
      }
      if (action.t !== 'play') return { ok: false, error: 'Action inconnue.' };
      if (state.roundOver) return { ok: false, error: 'Manche terminée.' };
      if (player !== state.current) return { ok: false, error: 'Ce n’est pas votre tour.' };
      var i = action.i | 0;
      if (i < 0 || i > 8 || state.grid[i]) return { ok: false, error: 'Case invalide.' };
      state.grid[i] = player === 0 ? 'X' : 'O';
      for (var l = 0; l < LINES.length; l++) {
        var ln = LINES[l];
        if (state.grid[ln[0]] && state.grid[ln[0]] === state.grid[ln[1]] &&
            state.grid[ln[1]] === state.grid[ln[2]]) {
          state.roundOver = true;
          state.winner = player;
          state.line = ln;
          state.players[player].wins++;
          return { ok: true };
        }
      }
      if (state.grid.every(function (c) { return c; })) {
        state.roundOver = true;
        state.draw = true;
      } else {
        state.current = 1 - state.current;
      }
      return { ok: true };
    },

    /* L'adversaire IA : gagne si possible, bloque sinon, vise le centre puis
       les coins. Il joue parfois le 2e meilleur coup : ça le rend battable. */
    bot: function (state, me) {
      if (state.roundOver) return null;
      if (state.current !== me) return null;
      var grid = state.grid;
      var moi = me === 0 ? 'X' : 'O';
      var lui = me === 0 ? 'O' : 'X';

      // cases libres qui complètent une ligne pour un symbole donné
      function decisives(jeton) {
        var res = [];
        for (var l = 0; l < LINES.length; l++) {
          var ln = LINES[l], vide = -1, n = 0;
          for (var k = 0; k < 3; k++) {
            if (grid[ln[k]] === jeton) n++;
            else if (!grid[ln[k]]) vide = ln[k];
          }
          if (n === 2 && vide !== -1 && res.indexOf(vide) === -1) res.push(vide);
        }
        return res;
      }
      function melange(arr) {
        for (var a = arr.length - 1; a > 0; a--) {
          var j = Math.floor(Math.random() * (a + 1));
          var t = arr[a]; arr[a] = arr[j]; arr[j] = t;
        }
        return arr;
      }

      // classement : gagner > bloquer > centre > coins > bords
      var ordre = decisives(moi).concat(decisives(lui))
        .concat([4], melange([0, 2, 6, 8]), melange([1, 3, 5, 7]));
      var choix = [];
      for (var c = 0; c < ordre.length; c++) {
        if (!grid[ordre[c]] && choix.indexOf(ordre[c]) === -1) choix.push(ordre[c]);
      }
      if (!choix.length) return null;
      // ~12 % du temps, le 2e meilleur coup : un adversaire humain, pas une machine
      var pick = (choix.length > 1 && Math.random() < 0.12) ? 1 : 0;
      return { t: 'play', i: choix[pick] };
    },

    render: function (el, ctx) {
      var s = ctx.state;
      var html = '<div class="ttt-board">';
      for (var i = 0; i < 9; i++) {
        var win = s.line.indexOf(i) !== -1;
        html += '<div class="ttt-cell' + (win ? ' win' : '') + '" data-i="' + i + '">' +
          (s.grid[i] || '') + '</div>';
      }
      html += '</div>';
      if (s.roundOver) {
        html += '<p class="mini-msg">' +
          (s.draw ? 'Match nul !' : '🏆 ' + GG.esc(s.players[s.winner].name) + ' gagne la manche !') +
          '</p><button class="btn big primary" data-a="again">Manche suivante</button>';
      } else {
        var mine = ctx.me === s.current;
        html += '<p class="mini-msg">' + (s.current === 0 ? '✖️' : '⭕') + ' ' +
          (mine ? 'À vous de jouer !' : 'Au tour de ' + GG.esc(s.players[s.current].name) + '…') + '</p>';
      }
      el.innerHTML = html;
      el.querySelectorAll('.ttt-cell').forEach(function (cell) {
        cell.addEventListener('click', function () {
          if (!s.roundOver && ctx.me === s.current) {
            ctx.act({ t: 'play', i: parseInt(cell.dataset.i, 10) });
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
