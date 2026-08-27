/*
 * GGgames — Quiz (1 à 12 joueurs, culture générale).
 * 10 questions tirées d'une banque maison. Tout le monde répond en secret
 * sur son téléphone ; les points tombent à la révélation (+10 par bonne
 * réponse, +5 au plus rapide). Les bonnes réponses ne circulent jamais
 * avant la révélation.
 */
(function (root) {
  'use strict';
  var GG = root.GG;
  var NB_QUESTIONS = 10;

  /* Banque : 'Question|Bonne réponse|Leurre|Leurre|Leurre' (remplie plus bas). */
  var BANK = [
    'Quelle est la capitale de l’Australie ?|Canberra|Sydney|Melbourne|Perth',
    'Combien de côtés possède un hexagone ?|Six|Cinq|Sept|Huit',
    'Qui a peint « La Joconde » ?|Léonard de Vinci|Michel-Ange|Raphaël|Botticelli'
  ];

  function parseQ(e) {
    var p = e.split('|');
    return { q: p[0], good: p[1], lures: [p[2], p[3], p[4]] };
  }

  function buildQuestions() {
    var pool = GG.shuffle(BANK.slice()).slice(0, NB_QUESTIONS);
    return pool.map(function (e) {
      var d = parseQ(e);
      var choices = GG.shuffle([d.good, d.lures[0], d.lures[1], d.lures[2]]);
      return { q: d.q, choices: choices, correct: choices.indexOf(d.good) };
    });
  }

  var mod = {
    id: 'quiz',
    nom: 'Quiz',
    icone: '💡',
    desc: 'Culture générale : 10 questions, tout le monde répond en secret, +10 par bonne réponse et +5 au plus rapide. Jusqu’à 12 joueurs !',
    min: 1, max: 12,
    hotseat: true, hotseatMax: 4, hidden: true, netOnly: false,
    regles: '<p><strong>🎯 Le but :</strong> marquer le plus de points sur 10 questions de culture générale.</p><p><strong>Comment jouer :</strong> à chaque question, chacun choisit sa réponse <strong>en secret</strong> sur son téléphone. Quand tout le monde a répondu, la bonne réponse est révélée avec le score de chacun.</p><p><strong>Les points :</strong> +10 par bonne réponse, et +5 de bonus au plus rapide des bons répondeurs. En solo : visez le record !</p>',

    create: function (names) {
      return {
        players: names.map(function (n) { return { name: n, score: 0, answer: -1 }; }),
        qs: buildQuestions(),
        idx: 0,
        phase: 'question',
        order: [],          // ordre d'arrivée des réponses (bonus rapidité)
        reveal: null,
        gameTs: Math.floor(Math.random() * 1e9),
        finished: false
      };
    },

    turnOf: function () { return -1; }, // tout le monde répond en même temps
    /* hotseat : l'écran passe au premier joueur n'ayant pas répondu,
       en tournant à chaque question pour que le bonus rapidité soit équitable */
    viewerOf: function (state) {
      if (state.phase !== 'question') return 0;
      var n = state.players.length;
      for (var k = 0; k < n; k++) {
        var i = (state.idx + k) % n;
        if (state.players[i].answer === -1) return i;
      }
      return 0;
    },
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
            var best = JSON.parse(localStorage.getItem('gg-quiz-best') || 'null');
            var cur = { score: rows[0].s, ts: state.gameTs };
            if (!best || cur.score > best.score) {
              localStorage.setItem('gg-quiz-best', JSON.stringify(cur));
            }
            var stored = JSON.parse(localStorage.getItem('gg-quiz-best') || 'null');
            if (stored && stored.ts === cur.ts && stored.score === cur.score) {
              html += '<p>🏆 Nouveau record personnel !</p>';
            } else if (stored) {
              html += '<p>🏅 Votre record : ' + stored.score + ' pts.</p>';
            }
          }
        } catch (e) {}
      }
      return html;
    },

    /* les bonnes réponses et les réponses des autres ne circulent jamais
       avant la révélation */
    redact: function (state, viewer) {
      var copy = GG.clone(state);
      copy.qs.forEach(function (q) { delete q.correct; });
      delete copy.order;
      copy.players.forEach(function (p, i) {
        p.hasAnswered = p.answer !== -1;
        if (i !== viewer && copy.phase === 'question') delete p.answer;
      });
      return copy;
    },

    apply: function (state, player, action) {
      if (state.finished) return { ok: false, error: 'Partie terminée.' };
      var p = state.players[player];
      if (action.t === 'answer') {
        if (state.phase !== 'question') return { ok: false, error: 'Trop tard !' };
        if (!p) return { ok: false, error: 'Joueur inconnu.' };
        if (p.answer !== -1) return { ok: false, error: 'Vous avez déjà répondu.' };
        var i = action.i | 0;
        if (i < 0 || i > 3) return { ok: false, error: 'Réponse invalide.' };
        p.answer = i;
        state.order.push(player);
        if (state.players.every(function (x) { return x.answer !== -1; })) {
          // révélation : les points tombent maintenant (rien ne fuit avant)
          var q = state.qs[state.idx];
          var first = -1;
          state.order.forEach(function (pi) {
            if (state.players[pi].answer === q.correct) {
              state.players[pi].score += 10;
              if (first === -1) { first = pi; state.players[pi].score += 5; }
            }
          });
          state.phase = 'reveal';
          state.reveal = {
            correct: q.correct,
            first: first,
            answers: state.players.map(function (x) { return x.answer; })
          };
        }
        return { ok: true };
      }
      if (action.t === 'next') {
        if (state.phase !== 'reveal') return { ok: false, error: 'La question est en cours.' };
        if (player !== 0) return { ok: false, error: 'L’hôte passe à la suite.' };
        state.idx++;
        if (state.idx >= state.qs.length) {
          state.finished = true;
          return { ok: true };
        }
        state.phase = 'question';
        state.reveal = null;
        state.order = [];
        state.players.forEach(function (x) { x.answer = -1; });
        return { ok: true };
      }
      return { ok: false, error: 'Action inconnue.' };
    },

    render: function (el, ctx) {
      var s = ctx.state;
      var me = ctx.me;
      var my = s.players[me];
      var q = s.qs[s.idx];
      var html = '<p class="qz-head">💡 Question ' + (s.idx + 1) + ' / ' + s.qs.length + '</p>';

      if (s.phase === 'question') {
        var answered = s.players.filter(function (p) {
          return p.hasAnswered || p.answer !== -1;
        }).length;
        html += '<div class="qz-q">' + GG.esc(q.q) + '</div>';
        var mineDone = my && (my.answer !== -1 && my.answer !== undefined);
        html += '<div class="qz-choices">' + q.choices.map(function (c, i) {
          return '<button class="qz-choice' +
            (mineDone && my.answer === i ? ' picked' : '') + '" data-i="' + i + '"' +
            (mineDone ? ' disabled' : '') + '>' + GG.esc(c) + '</button>';
        }).join('') + '</div>';
        html += '<p class="mini-msg">' + (mineDone
          ? '✔️ Réponse enregistrée — en attente des autres (' + answered + '/' + s.players.length + ')'
          : 'Répondez vite : +5 points au plus rapide !') + '</p>';
      } else if (s.phase === 'reveal') {
        var r = s.reveal;
        html += '<div class="qz-q">' + GG.esc(q.q) + '</div>';
        html += '<div class="qz-choices">' + q.choices.map(function (c, i) {
          var cls = i === r.correct ? ' good' : '';
          var who = s.players.map(function (p, pi) {
            return r.answers[pi] === i ? GG.esc(p.name) : null;
          }).filter(Boolean);
          return '<div class="qz-choice show' + cls + '">' + GG.esc(c) +
            (who.length ? '<small>' + who.join(', ') + '</small>' : '') + '</div>';
        }).join('') + '</div>';
        if (r.first !== -1) {
          html += '<p class="mini-msg">⚡ Le plus rapide : <strong>' +
            GG.esc(s.players[r.first].name) + '</strong> (+5)</p>';
        } else {
          html += '<p class="mini-msg">😅 Personne n’a trouvé !</p>';
        }
        html += '<div class="mem-stats">' + s.players.map(function (p) {
          return '<span class="mem-stat">' + GG.esc(p.name) + ' : ' + p.score + '</span>';
        }).join('') + '</div>';
        if (me === 0) {
          html += '<button class="btn big primary" data-a="next">' +
            (s.idx + 1 >= s.qs.length ? '🏁 Voir le classement' : '➜ Question suivante') +
            '</button>';
        } else {
          html += '<p class="waiting">L’hôte passe à la question suivante…</p>';
        }
      }

      el.innerHTML = html;
      el.querySelectorAll('.qz-choice[data-i]').forEach(function (b) {
        b.addEventListener('click', function () {
          ctx.act({ t: 'answer', i: parseInt(b.dataset.i, 10) });
        });
      });
      var nx = el.querySelector('[data-a="next"]');
      if (nx) nx.addEventListener('click', function () { ctx.act({ t: 'next' }); });
    },

    _BANK: BANK, _buildQuestions: buildQuestions
  };

  GG.register(mod);
  if (typeof module === 'object' && module.exports) module.exports = mod;
})(typeof self !== 'undefined' ? self : globalThis);
