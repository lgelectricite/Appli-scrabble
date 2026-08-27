/* GGgames — Memory (retrouvez les paires, 1 à 4 joueurs).
 * Score : paires trouvées, nombre d'essais et chrono ; record personnel en solo. */
(function (root) {
  'use strict';
  var GG = root.GG;
  var EMOJIS = ['🐶', '🐱', '🦊', '🐼', '🦁', '🐸', '🐙', '🦋',
                '🍎', '🍌', '🍓', '🍇', '⚽', '🎈', '🚗', '✈️',
                '🌵', '🌸', '⭐', '🌙'];

  function fmt(sec) {
    var m = Math.floor(sec / 60);
    return (m ? m + ' min ' : '') + (sec % 60) + ' s';
  }

  var mod = {
    id: 'memory',
    nom: 'Memory',
    icone: '🧠',
    desc: 'Retrouvez les paires. Classement aux paires, aux essais et au chrono.',
    regles: '<p><strong>🎯 Le but :</strong> retrouver le plus de paires de cartes identiques.</p><p><strong>Comment jouer :</strong> retournez 2 cartes. Une paire : 1 point et vous rejouez ! Sinon, mémorisez bien… et le tour passe.</p><p><strong>En solo :</strong> finissez en un minimum d’essais et de temps — record à battre.</p>',
    min: 1, max: 4,
    hotseat: true, hidden: false, netOnly: false,

    create: function (names) {
      var pairs = GG.shuffle(EMOJIS.slice()).slice(0, 12);
      var cards = GG.shuffle(pairs.concat(pairs).map(function (e) {
        return { e: e, matched: false };
      }));
      return {
        players: names.map(function (n) { return { name: n, pairs: 0, tries: 0 }; }),
        current: 0,
        cards: cards,
        up: [],          // cartes retournées ce demi-tour
        mismatch: false, // les deux dernières ne correspondaient pas
        startTs: 0,      // départ du chrono (au premier retournement)
        durationSec: 0,
        finished: false
      };
    },

    turnOf: function (state) { return state.finished ? -1 : state.current; },
    over: function (state) { return state.finished; },
    scoreOf: function (state, i) { return state.players[i].pairs; },

    summary: function (state) {
      // classement : paires trouvées, puis moins d'essais
      var rows = state.players.map(function (p) {
        return { n: p.name, s: p.pairs, t: p.tries };
      }).sort(function (a, b) { return b.s - a.s || a.t - b.t; });
      var html = rows.map(function (r) {
        return '<div class="final-line"><span>' + GG.esc(r.n) + '</span><strong>' +
          r.s + ' paire' + (r.s > 1 ? 's' : '') + ' · ' + r.t + ' essai' +
          (r.t > 1 ? 's' : '') + '</strong></div>';
      }).join('');
      html += '<p>⏱️ Partie bouclée en ' + fmt(state.durationSec) + '.</p>';

      if (state.players.length === 1) {
        // record personnel (sur ce téléphone) : moins d'essais, puis moins de temps
        try {
          if (typeof localStorage !== 'undefined') {
            var best = JSON.parse(localStorage.getItem('gg-memory-best') || 'null');
            var cur = { tries: rows[0].t, sec: state.durationSec, ts: state.startTs };
            if (!best || cur.tries < best.tries ||
                (cur.tries === best.tries && cur.sec < best.sec)) {
              localStorage.setItem('gg-memory-best', JSON.stringify(cur));
            }
            var stored = JSON.parse(localStorage.getItem('gg-memory-best') || 'null');
            if (stored && stored.ts === state.startTs) {
              html += '<h1>🏆 Nouveau record !</h1>';
            } else if (stored) {
              html += '<p>🏅 Votre record : ' + stored.tries + ' essais en ' +
                fmt(stored.sec) + '.</p>';
            }
          }
        } catch (e) {}
      } else {
        var top = rows.filter(function (r) { return r.s === rows[0].s && r.t === rows[0].t; });
        html += '<h1>🏆 ' + top.map(function (r) { return GG.esc(r.n); }).join(' & ') + '</h1>';
      }
      return html;
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
      if (!state.startTs) state.startTs = Date.now();
      state.up.push(i);
      if (state.up.length === 2) {
        state.players[player].tries++; // un essai = deux cartes retournées
        var a = state.cards[state.up[0]], b = state.cards[state.up[1]];
        if (a.e === b.e) {
          a.matched = b.matched = true;
          state.players[player].pairs++;
          state.up = [];
          if (state.cards.every(function (c) { return c.matched; })) {
            state.finished = true;
            state.durationSec = Math.max(1, Math.round((Date.now() - state.startTs) / 1000));
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
      html += '</div>';
      // essais et chrono en direct
      html += '<div class="mem-stats">' + s.players.map(function (p, i) {
        return '<span class="mem-stat' + (i === s.current && !s.finished ? ' turn' : '') + '">' +
          GG.esc(p.name) + ' : ' + p.pairs + ' ✓ · ' + p.tries + ' essai' +
          (p.tries > 1 ? 's' : '') + '</span>';
      }).join('') +
        '<span class="mem-stat" id="mem-timer">⏱️ ' +
        (s.startTs ? fmt(Math.round((Date.now() - s.startTs) / 1000)) : '0 s') + '</span></div>';
      html += '<p class="mini-msg">' +
        (s.finished ? 'Toutes les paires sont trouvées !'
          : mine ? 'À vous de jouer !' : 'Au tour de ' + GG.esc(s.players[s.current].name) + '…') +
        '</p>';
      el.innerHTML = html;
      el.querySelectorAll('.mem-card').forEach(function (card) {
        card.addEventListener('click', function () {
          if (mine) ctx.act({ t: 'flip', i: parseInt(card.dataset.i, 10) });
        });
      });
      // chrono vivant
      if (!s.finished && s.startTs && !el._memTimer) {
        el._memTimer = setInterval(function () {
          var t = el.querySelector('#mem-timer');
          if (!t || !document.body.contains(t)) {
            clearInterval(el._memTimer);
            el._memTimer = null;
            return;
          }
          t.textContent = '⏱️ ' + fmt(Math.round((Date.now() - s.startTs) / 1000));
        }, 1000);
      }
    }
  };

  GG.register(mod);
  if (typeof module === 'object' && module.exports) module.exports = mod;
})(typeof self !== 'undefined' ? self : globalThis);
