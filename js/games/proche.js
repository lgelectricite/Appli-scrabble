/*
 * GGgames — Le Plus Proche (2 à 12 joueurs, estimation).
 * Une question à réponse chiffrée, chacun propose un nombre en secret :
 * le plus proche marque. Personne n'a besoin de connaître la réponse,
 * il suffit d'être moins loin que les autres !
 */
(function (root) {
  'use strict';
  var GG = root.GG;
  var NB_MANCHES = 8;

  /* Banque : 'Question|nombre|unité' (remplie plus bas). */
  var BANK = [
    'Combien de touches compte un piano ?|88|touches',
    'Combien de cases compte un échiquier ?|64|cases',
    'En quelle année a eu lieu le premier pas sur la Lune ?|1969|'
  ];

  function parseQ(e) {
    var p = e.split('|');
    return { q: p[0], a: parseInt(p[1], 10), unit: p[2] || '' };
  }

  function fmtN(n) {
    var s = String(n);
    var out = '';
    while (s.length > 3) { out = ' ' + s.slice(-3) + out; s = s.slice(0, -3); }
    return s + out;
  }

  var mod = {
    id: 'proche',
    nom: 'Le Plus Proche',
    icone: '🎯',
    desc: 'Personne ne connaît la réponse exacte — il suffit d’être moins loin que les autres ! Estimations secrètes, 8 manches. 2 à 12 joueurs.',
    min: 2, max: 12,
    hotseat: true, hotseatMax: 4, hidden: true, netOnly: false,
    regles: '<p><strong>🎯 Le but :</strong> être plus proche de la bonne réponse que les autres — pas besoin de la connaître !</p><p><strong>Comment jouer :</strong> à chaque manche, une question à réponse chiffrée (« Combien de marches… ? »). Chacun tape son estimation <strong>en secret</strong>. À la révélation, le plus proche marque.</p><p><strong>Les points :</strong> +3 au plus proche (les ex æquo aussi), +5 en cas de réponse EXACTE. 8 manches, meilleur total gagnant.</p>',

    create: function (names) {
      return {
        players: names.map(function (n) { return { name: n, score: 0, guess: null }; }),
        qs: GG.shuffle(BANK.slice()).slice(0, NB_MANCHES).map(parseQ),
        idx: 0,
        phase: 'guess',
        reveal: null,
        finished: false
      };
    },

    turnOf: function () { return -1; }, // tout le monde estime en même temps
    viewerOf: function (state) {
      if (state.phase !== 'guess') return 0;
      var n = state.players.length;
      for (var k = 0; k < n; k++) {
        var i = (state.idx + k) % n;
        if (state.players[i].guess === null) return i;
      }
      return 0;
    },
    over: function (state) { return state.finished; },
    scoreOf: function (state, i) { return state.players[i].score; },

    summary: function (state) {
      var rows = state.players.map(function (p) { return { n: p.name, s: p.score }; })
        .sort(function (a, b) { return b.s - a.s; });
      var top = rows.filter(function (r) { return r.s === rows[0].s; });
      return rows.map(function (r) {
        return '<div class="final-line"><span>' + GG.esc(r.n) + '</span><strong>' +
          r.s + ' pts</strong></div>';
      }).join('') + '<h1>🏆 ' + top.map(function (r) { return GG.esc(r.n); }).join(' & ') + '</h1>';
    },

    /* les réponses exactes et les estimations des autres ne circulent pas */
    redact: function (state, viewer) {
      var copy = GG.clone(state);
      copy.qs.forEach(function (q) { delete q.a; });
      copy.players.forEach(function (p, i) {
        p.hasGuessed = p.guess !== null;
        if (i !== viewer && copy.phase === 'guess') delete p.guess;
      });
      return copy;
    },

    apply: function (state, player, action) {
      if (state.finished) return { ok: false, error: 'Partie terminée.' };
      var p = state.players[player];
      if (action.t === 'guess') {
        if (state.phase !== 'guess') return { ok: false, error: 'Trop tard !' };
        if (!p) return { ok: false, error: 'Joueur inconnu.' };
        if (p.guess !== null) return { ok: false, error: 'Estimation déjà donnée.' };
        var n = parseInt(action.n, 10);
        if (!isFinite(n) || isNaN(n)) return { ok: false, error: 'Entrez un nombre.' };
        if (n < 0 || n > 1e12) return { ok: false, error: 'Nombre invalide.' };
        p.guess = n;
        if (state.players.every(function (x) { return x.guess !== null; })) {
          var q = state.qs[state.idx];
          var best = Infinity;
          state.players.forEach(function (x) {
            best = Math.min(best, Math.abs(x.guess - q.a));
          });
          var winners = [];
          state.players.forEach(function (x, xi) {
            if (Math.abs(x.guess - q.a) === best) {
              winners.push(xi);
              x.score += best === 0 ? 5 : 3;
            }
          });
          state.phase = 'reveal';
          state.reveal = {
            answer: q.a, unit: q.unit, winners: winners, exact: best === 0,
            guesses: state.players.map(function (x) { return x.guess; })
          };
        }
        return { ok: true };
      }
      if (action.t === 'next') {
        if (state.phase !== 'reveal') return { ok: false, error: 'La manche est en cours.' };
        if (player !== 0) return { ok: false, error: 'L’hôte passe à la suite.' };
        state.idx++;
        if (state.idx >= state.qs.length) {
          state.finished = true;
          return { ok: true };
        }
        state.phase = 'guess';
        state.reveal = null;
        state.players.forEach(function (x) { x.guess = null; });
        return { ok: true };
      }
      return { ok: false, error: 'Action inconnue.' };
    },

    render: function (el, ctx) {
      var s = ctx.state;
      var me = ctx.me;
      var my = s.players[me];
      var q = s.qs[s.idx];
      var html = '<p class="qz-head">🎯 Manche ' + (s.idx + 1) + ' / ' + s.qs.length + '</p>';

      if (s.phase === 'guess') {
        var done = s.players.filter(function (p) {
          return p.hasGuessed || p.guess !== null;
        }).length;
        var mineDone = my && my.guess !== null && my.guess !== undefined;
        html += '<div class="qz-q">' + GG.esc(q.q) + '</div>';
        if (mineDone) {
          html += '<p class="mini-msg big-msg">🤫 Votre estimation : <strong>' +
            fmtN(my.guess) + '</strong></p>' +
            '<p class="mini-msg">En attente des autres… (' + done + '/' + s.players.length + ')</p>';
        } else {
          html += '<div class="cr-answer-row">' +
            '<input type="number" id="pr-guess" inputmode="numeric" placeholder="Votre estimation…">' +
            '<button class="btn primary" data-a="guess">Valider</button></div>' +
            '<p class="hint">Le plus proche marque 3 points, la réponse exacte en vaut 5.</p>';
        }
      } else if (s.phase === 'reveal') {
        var r = s.reveal;
        html += '<div class="qz-q">' + GG.esc(q.q) + '</div>' +
          '<p class="pr-answer">Réponse : <strong>' + fmtN(r.answer) + '</strong> ' +
          GG.esc(r.unit || '') + '</p>';
        var rows = s.players.map(function (p, pi) {
          return { pi: pi, n: p.name, g: r.guesses[pi], d: Math.abs(r.guesses[pi] - r.answer) };
        }).sort(function (a, b) { return a.d - b.d; });
        html += '<div class="pr-rows">' + rows.map(function (row) {
          var win = r.winners.indexOf(row.pi) !== -1;
          return '<div class="pr-row' + (win ? ' win' : '') + '"><span>' +
            (win ? (r.exact ? '🎯 ' : '🏅 ') : '') + GG.esc(row.n) + '</span>' +
            '<span>' + fmtN(row.g) + ' <small>(à ' + fmtN(row.d) + ')</small></span></div>';
        }).join('') + '</div>';
        html += '<div class="mem-stats">' + s.players.map(function (p) {
          return '<span class="mem-stat">' + GG.esc(p.name) + ' : ' + p.score + '</span>';
        }).join('') + '</div>';
        if (me === 0) {
          html += '<button class="btn big primary" data-a="next">' +
            (s.idx + 1 >= s.qs.length ? '🏁 Voir le classement' : '➜ Manche suivante') +
            '</button>';
        } else {
          html += '<p class="waiting">L’hôte passe à la manche suivante…</p>';
        }
      }

      el.innerHTML = html;
      var g = el.querySelector('[data-a="guess"]');
      if (g) {
        var send = function () {
          var input = el.querySelector('#pr-guess');
          if (input && input.value.trim() !== '') {
            ctx.act({ t: 'guess', n: input.value.trim() });
          }
        };
        g.addEventListener('click', send);
        var inp = el.querySelector('#pr-guess');
        if (inp) inp.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter') send();
        });
      }
      var nx = el.querySelector('[data-a="next"]');
      if (nx) nx.addEventListener('click', function () { ctx.act({ t: 'next' }); });
    },

    _BANK: BANK
  };

  GG.register(mod);
  if (typeof module === 'object' && module.exports) module.exports = mod;
})(typeof self !== 'undefined' ? self : globalThis);
