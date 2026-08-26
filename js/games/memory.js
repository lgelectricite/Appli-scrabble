/* GGgames — Memory (retrouvez les paires, 1 à 4 joueurs). */
(function (root) {
  'use strict';
  var GG = root.GG;
  var EMOJIS = ['🐶', '🐱', '🦊', '🐼', '🦁', '🐸', '🐙', '🦋',
                '🍎', '🍌', '🍓', '🍇', '⚽', '🎈', '🚗', '✈️',
                '🌵', '🌸', '⭐', '🌙'];

  var mod = {
    id: 'memory',
    nom: 'Memory',
    icone: '🧠',
    desc: 'Retrouvez les paires. Une paire = un point et on rejoue.',
    min: 1, max: 4,
    hotseat: true, hidden: false, netOnly: false,

    create: function (names) {
      var pairs = GG.shuffle(EMOJIS.slice()).slice(0, 12);
      var cards = GG.shuffle(pairs.concat(pairs).map(function (e) {
        return { e: e, matched: false };
      }));
      return {
        players: names.map(function (n) { return { name: n, pairs: 0 }; }),
        current: 0,
        cards: cards,
        up: [],          // cartes retournées ce demi-tour
        mismatch: false, // les deux dernières ne correspondaient pas
        finished: false
      };
    },

    turnOf: function (state) { return state.finished ? -1 : state.current; },
    over: function (state) { return state.finished; },
    scoreOf: function (state, i) { return state.players[i].pairs; },

    summary: function (state) {
      var rows = state.players.map(function (p) { return { n: p.name, s: p.pairs }; })
        .sort(function (a, b) { return b.s - a.s; });
      var top = rows[0].s;
      var winners = rows.filter(function (r) { return r.s === top; }).map(function (r) { return GG.esc(r.n); });
      return rows.map(function (r) {
        return '<div class="final-line"><span>' + GG.esc(r.n) + '</span><strong>' +
          r.s + ' paire' + (r.s > 1 ? 's' : '') + '</strong></div>';
      }).join('') + '<h1>🏆 ' + winners.join(' & ') + '</h1>';
    },

    apply: function (state, player, action) {
      if (state.finished) return { ok: false, error: 'Partie terminée.' };
      if (action.t !== 'flip') return { ok: false, error: 'Action inconnue.' };
      if (player !== state.current) return { ok: false, error: 'Ce n’est pas votre tour.' };
      var i = action.i | 0;
      var card = state.cards[i];
      if (!card || card.matched) return { ok: false, error: 'Carte invalide.' };
      if (state.mismatch) {
        // le tour précédent a raté : on cache ses cartes avant de rejouer
        state.up = [];
        state.mismatch = false;
      }
      if (state.up.indexOf(i) !== -1) return { ok: false, error: 'Carte déjà retournée.' };
      state.up.push(i);
      if (state.up.length === 2) {
        var a = state.cards[state.up[0]], b = state.cards[state.up[1]];
        if (a.e === b.e) {
          a.matched = b.matched = true;
          state.players[player].pairs++;
          state.up = [];
          if (state.cards.every(function (c) { return c.matched; })) {
            state.finished = true;
          }
          // paire trouvée : le joueur rejoue
        } else {
          state.mismatch = true;
          state.current = (state.current + 1) % state.players.length;
        }
      }
      return { ok: true };
    },

    render: function (el, ctx) {
      var s = ctx.state;
      var mine = ctx.me === s.current && !s.finished;
      var html = '<div class="mem-board">';
      s.cards.forEach(function (c, i) {
        var faceUp = c.matched || s.up.indexOf(i) !== -1;
        html += '<div class="mem-card' + (faceUp ? ' up' : '') + (c.matched ? ' done' : '') +
          '" data-i="' + i + '">' + (faceUp ? c.e : '') + '</div>';
      });
      html += '</div><p class="mini-msg">' +
        (s.finished ? 'Toutes les paires sont trouvées !'
          : mine ? 'À vous de jouer !' : 'Au tour de ' + GG.esc(s.players[s.current].name) + '…') +
        '</p>';
      el.innerHTML = html;
      el.querySelectorAll('.mem-card').forEach(function (card) {
        card.addEventListener('click', function () {
          if (mine) ctx.act({ t: 'flip', i: parseInt(card.dataset.i, 10) });
        });
      });
    }
  };

  GG.register(mod);
  if (typeof module === 'object' && module.exports) module.exports = mod;
})(typeof self !== 'undefined' ? self : globalThis);
