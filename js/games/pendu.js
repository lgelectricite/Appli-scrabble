/* GGgames — Pendu (1 à 4 joueurs, mots tirés du dictionnaire). */
(function (root) {
  'use strict';
  var GG = root.GG;
  var ROUNDS = 5;
  var MAX_ERRORS = 8;
  var FALLBACK = ['MAISON', 'JARDIN', 'MUSIQUE', 'VOITURE', 'CHATEAU', 'PLANETE',
    'ORDINATEUR', 'MONTAGNE', 'PAPILLON', 'CHOCOLAT', 'BIBLIOTHEQUE', 'AVENTURE',
    'TEMPETE', 'HORIZON', 'LUMIERE', 'FROMAGE', 'BATEAU', 'ETOILE', 'CAMION',
    'PISCINE', 'BALEINE', 'TIGRE', 'SERPENT', 'FUSEE', 'ROBOT'];

  function pickWord(ctx) {
    var pool = FALLBACK;
    if (ctx && ctx.dict && ctx.dict.byLen) {
      var candidates = [];
      [6, 7, 8].forEach(function (l) {
        if (ctx.dict.byLen[l]) candidates = candidates.concat(ctx.dict.byLen[l]);
      });
      if (candidates.length > 100) pool = candidates;
    }
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function newRound(state, ctx) {
    var w = pickWord(ctx);
    state.secret = w;
    state.revealed = new Array(w.length).fill(null);
    state.tried = [];
    state.errors = 0;
    state.roundOver = false;
    state.lost = false;
    state.answer = null; // rendu public en fin de manche
  }

  var mod = {
    id: 'pendu',
    nom: 'Pendu',
    icone: '🪢',
    desc: 'Devinez le mot lettre par lettre. Le jeu choisit les mots : pas de triche !',
    min: 1, max: 4,
    hotseat: true, hidden: false, netOnly: false,

    create: function (names, ctx) {
      var state = {
        players: names.map(function (n) { return { name: n, score: 0 }; }),
        current: 0,
        round: 1,
        maxRounds: ROUNDS,
        finished: false
      };
      newRound(state, ctx);
      return state;
    },

    turnOf: function (state) { return (state.finished || state.roundOver) ? -1 : state.current; },
    over: function (state) { return state.finished; },
    scoreOf: function (state, i) { return state.players[i].score; },

    summary: function (state) {
      var rows = state.players.map(function (p) { return { n: p.name, s: p.score }; })
        .sort(function (a, b) { return b.s - a.s; });
      var html = rows.map(function (r) {
        return '<div class="final-line"><span>' + GG.esc(r.n) + '</span><strong>' +
          r.s + ' pts</strong></div>';
      }).join('') + '<h1>🏆 ' + GG.esc(rows[0].n) + '</h1>';
      if (state.players.length === 1) {
        try {
          if (typeof localStorage !== 'undefined') {
            var best = parseInt(localStorage.getItem('gg-pendu-best') || '0', 10);
            if (rows[0].s > best) {
              localStorage.setItem('gg-pendu-best', String(rows[0].s));
              html += '<p>🏆 Nouveau record personnel !</p>';
            } else if (best) {
              html += '<p>🏅 Votre record : ' + best + ' pts.</p>';
            }
          }
        } catch (e) {}
      }
      return html;
    },

    /* le mot secret ne circule jamais vers les autres téléphones */
    redact: function (state) {
      var copy = GG.clone(state);
      delete copy.secret;
      return copy;
    },

    apply: function (state, player, action, ctx) {
      if (state.finished) return { ok: false, error: 'Partie terminée.' };
      if (action.t === 'next') {
        if (!state.roundOver) return { ok: false, error: 'La manche n’est pas finie.' };
        state.round++;
        if (state.round > state.maxRounds) {
          state.finished = true;
        } else {
          newRound(state, ctx);
          state.current = (state.round - 1) % state.players.length;
        }
        return { ok: true };
      }
      if (action.t !== 'letter') return { ok: false, error: 'Action inconnue.' };
      if (state.roundOver) return { ok: false, error: 'Manche terminée.' };
      if (player !== state.current) return { ok: false, error: 'Ce n’est pas votre tour.' };
      var L = String(action.l || '').toUpperCase();
      if (!/^[A-Z]$/.test(L)) return { ok: false, error: 'Lettre invalide.' };
      if (state.tried.indexOf(L) !== -1) return { ok: false, error: 'Lettre déjà proposée.' };
      state.tried.push(L);
      var hits = 0;
      for (var i = 0; i < state.secret.length; i++) {
        if (state.secret[i] === L && !state.revealed[i]) {
          state.revealed[i] = L;
          hits++;
        }
      }
      if (hits > 0) {
        state.players[player].score += hits;
        if (state.revealed.every(function (r) { return r; })) {
          state.players[player].score += 3; // bonus au joueur qui termine le mot
          state.roundOver = true;
          state.answer = state.secret;
        }
        // lettre trouvée : le joueur rejoue
      } else {
        state.errors++;
        if (state.errors >= MAX_ERRORS) {
          state.roundOver = true;
          state.lost = true;
          state.answer = state.secret;
        } else {
          state.current = (state.current + 1) % state.players.length;
        }
      }
      return { ok: true };
    },

    render: function (el, ctx) {
      var s = ctx.state;
      var mine = ctx.me === s.current && !s.roundOver && !s.finished;
      var word = s.revealed.map(function (r) {
        return '<span class="pendu-slot">' + (r || '&nbsp;') + '</span>';
      }).join('');
      var lives = '';
      for (var i = 0; i < MAX_ERRORS; i++) {
        lives += i < MAX_ERRORS - s.errors ? '❤️' : '🖤';
      }
      var html = '<p class="mini-msg">Manche ' + s.round + ' / ' + s.maxRounds + '</p>' +
        '<div class="pendu-word">' + word + '</div>' +
        '<div class="pendu-lives">' + lives + '</div>';
      if (s.roundOver) {
        html += '<p class="mini-msg">' +
          (s.lost ? '💀 Perdu ! Le mot était' : '🎉 Trouvé ! Le mot était') +
          ' <strong>' + GG.esc(s.answer || '?') + '</strong></p>' +
          '<button class="btn big primary" data-a="next">' +
          (s.round >= s.maxRounds ? 'Voir les scores' : 'Mot suivant') + '</button>';
      } else {
        html += '<p class="mini-msg">' + (mine ? 'À vous : proposez une lettre !'
          : 'Au tour de ' + GG.esc(s.players[s.current].name) + '…') + '</p>';
        html += '<div class="pendu-kb">';
        'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach(function (L) {
          var used = s.tried.indexOf(L) !== -1;
          html += '<button class="pendu-key' + (used ? ' used' : '') + '" data-l="' + L + '"' +
            (used || !mine ? ' disabled' : '') + '>' + L + '</button>';
        });
        html += '</div>';
        html += '<p class="hint">+1 point par lettre révélée, +3 pour celui qui termine le mot.</p>';
      }
      el.innerHTML = html;
      el.querySelectorAll('.pendu-key').forEach(function (k) {
        k.addEventListener('click', function () { ctx.act({ t: 'letter', l: k.dataset.l }); });
      });
      var next = el.querySelector('[data-a="next"]');
      if (next) next.addEventListener('click', function () { ctx.act({ t: 'next' }); });
    }
  };

  GG.register(mod);
  if (typeof module === 'object' && module.exports) module.exports = mod;
})(typeof self !== 'undefined' ? self : globalThis);
