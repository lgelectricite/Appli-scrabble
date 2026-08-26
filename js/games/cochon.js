/* GGgames — Cochon (jeu de dé « Pig ») : premier à 100 points. */
(function (root) {
  'use strict';
  var GG = root.GG;
  var DIE = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

  var mod = {
    id: 'cochon',
    nom: 'Cochon',
    icone: '🐷',
    desc: 'Lancez le dé, tentez votre chance : le 1 fait tout perdre ! Premier à 100.',
    min: 2, max: 4,
    hotseat: true, hidden: false, netOnly: false,

    create: function (names) {
      return {
        players: names.map(function (n) { return { name: n, total: 0 }; }),
        current: 0,
        turnPoints: 0,
        die: 0,
        target: 100,
        finished: false,
        winner: -1,
        lastEvent: ''
      };
    },

    turnOf: function (state) { return state.finished ? -1 : state.current; },
    over: function (state) { return state.finished; },
    scoreOf: function (state, i) { return state.players[i].total; },

    summary: function (state) {
      var rows = state.players.map(function (p, i) { return { n: p.name, s: p.total, i: i }; })
        .sort(function (a, b) { return b.s - a.s; });
      return rows.map(function (r) {
        return '<div class="final-line"><span>' + GG.esc(r.n) + '</span><strong>' +
          r.s + ' pts</strong></div>';
      }).join('') + '<h1>🏆 ' + GG.esc(state.players[state.winner].name) + ' gagne !</h1>';
    },

    apply: function (state, player, action) {
      if (state.finished) return { ok: false, error: 'Partie terminée.' };
      if (player !== state.current) return { ok: false, error: 'Ce n’est pas votre tour.' };
      if (action.t === 'roll') {
        var d = 1 + Math.floor(Math.random() * 6);
        state.die = d;
        if (d === 1) {
          state.lastEvent = GG.esc(state.players[player].name) + ' fait 1 : tout est perdu !';
          state.turnPoints = 0;
          state.current = (state.current + 1) % state.players.length;
        } else {
          state.turnPoints += d;
          state.lastEvent = '';
        }
        return { ok: true };
      }
      if (action.t === 'bank') {
        if (state.turnPoints === 0) return { ok: false, error: 'Rien à mettre de côté.' };
        var p = state.players[player];
        p.total += state.turnPoints;
        state.lastEvent = GG.esc(p.name) + ' met ' + state.turnPoints + ' points de côté.';
        state.turnPoints = 0;
        state.die = 0;
        if (p.total >= state.target) {
          state.finished = true;
          state.winner = player;
        } else {
          state.current = (state.current + 1) % state.players.length;
        }
        return { ok: true };
      }
      return { ok: false, error: 'Action inconnue.' };
    },

    render: function (el, ctx) {
      var s = ctx.state;
      var mine = ctx.me === s.current && !s.finished;
      var html = '<div class="pig-die">' + (s.die ? DIE[s.die] : '🎲') + '</div>' +
        '<p class="mini-msg big-msg">Points du tour : <strong>' + s.turnPoints + '</strong></p>' +
        (s.lastEvent ? '<p class="mini-msg">' + s.lastEvent + '</p>' : '') +
        '<p class="mini-msg">' + (mine
          ? 'À vous ! Lancez, ou mettez vos points de côté.'
          : 'Au tour de ' + GG.esc(s.players[s.current].name) + '…') + '</p>' +
        '<div class="mini-actions">' +
        '<button class="btn big primary" data-a="roll"' + (mine ? '' : ' disabled') + '>🎲 Lancer</button>' +
        '<button class="btn big" data-a="bank"' + (mine && s.turnPoints ? '' : ' disabled') + '>💰 Je m’arrête (+' + s.turnPoints + ')</button>' +
        '</div>' +
        '<p class="hint">Un 1 fait perdre les points du tour. Premier à ' + s.target + ' points.</p>';
      el.innerHTML = html;
      el.querySelector('[data-a="roll"]').addEventListener('click', function () {
        ctx.act({ t: 'roll' });
      });
      el.querySelector('[data-a="bank"]').addEventListener('click', function () {
        ctx.act({ t: 'bank' });
      });
    }
  };

  GG.register(mod);
  if (typeof module === 'object' && module.exports) module.exports = mod;
})(typeof self !== 'undefined' ? self : globalThis);
