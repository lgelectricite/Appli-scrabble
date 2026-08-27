/* GGgames — Le Mot Mystère (type Motus : 1 à 4 joueurs, 3 niveaux). */
(function (root) {
  'use strict';
  var GG = root.GG;
  var MAX_TRIES = 6;
  var LEVELS = {
    facile: { nom: 'Facile', len: 5 },
    moyen: { nom: 'Moyen', len: 6 },
    difficile: { nom: 'Difficile', len: 7 }
  };
  var FALLBACK = {
    5: ['CHIEN', 'PLAGE', 'FLEUR', 'TIGRE', 'SUCRE', 'NUAGE', 'PIANO', 'ROUTE', 'VERRE', 'POMME'],
    6: ['MAISON', 'JARDIN', 'SOLEIL', 'BATEAU', 'ORANGE', 'CERISE', 'BANANE', 'VIOLON', 'TRESOR', 'CHEVAL'],
    7: ['CHATEAU', 'MUSIQUE', 'PLANETE', 'MONTRES', 'CUISINE', 'FROMAGE', 'LUMIERE', 'TEMPETE', 'HORIZON', 'BALEINE']
  };

  function pickSecret(ctx, len) {
    var pool = FALLBACK[len] || FALLBACK[5];
    if (ctx && ctx.dict && ctx.dict.byLen && ctx.dict.byLen[len]) {
      var candidates = ctx.dict.byLen[len].filter(function (w) {
        return !/[KWXYZ]/.test(w);
      });
      if (candidates.length > 200) pool = candidates;
    }
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /* 2 = bien placée, 1 = présente ailleurs, 0 = absente (gestion des doublons) */
  function marks(secret, guess) {
    var m = new Array(guess.length).fill(0);
    var rest = {};
    var i;
    for (i = 0; i < secret.length; i++) {
      if (guess[i] === secret[i]) m[i] = 2;
      else rest[secret[i]] = (rest[secret[i]] || 0) + 1;
    }
    for (i = 0; i < guess.length; i++) {
      if (m[i] === 0 && rest[guess[i]]) {
        m[i] = 1;
        rest[guess[i]]--;
      }
    }
    return m;
  }

  function allDone(state) {
    return state.players.every(function (p) { return p.found || p.failed; });
  }

  function fmt(sec) {
    var m = Math.floor(sec / 60);
    return (m ? m + ' min ' : '') + (sec % 60) + ' s';
  }

  var mod = {
    id: 'motus',
    nom: 'Mot Mystère',
    icone: '🟩',
    desc: 'Devinez le mot en 6 essais grâce aux couleurs. En duel : même mot secret pour tous !',
    regles: '<p><strong>🎯 Le but :</strong> deviner le mot secret en 6 essais maximum.</p><p><strong>Comment jouer :</strong> proposez un vrai mot du dictionnaire. 🟩 vert : lettre bien placée · 🟨 jaune : présente ailleurs · gris : absente.</p><p><strong>En duel :</strong> même mot secret pour tous — vous voyez les couleurs des autres, jamais leurs lettres. Le plus rapide gagne.</p>',
    min: 1, max: 4,
    hotseat: true, hotseatMax: 1, hidden: false, netOnly: false,

    create: function (names) {
      return {
        players: names.map(function (n) {
          return { name: n, tries: [], found: false, failed: false, order: 0 };
        }),
        phase: 'setup',
        level: null,
        length: 0,
        secret: null,
        startTs: 0,
        durationSec: 0,
        finished: false
      };
    },

    turnOf: function () { return -1; }, // chacun cherche de son côté
    over: function (state) { return state.finished; },
    scoreOf: function (state, i) {
      var p = state.players[i];
      return p.found ? '🎉' : p.failed ? '💀' : p.tries.length + '/' + MAX_TRIES;
    },

    summary: function (state) {
      var rows = state.players.map(function (p) {
        return { n: p.name, f: p.found, t: p.tries.length, o: p.order };
      }).sort(function (a, b) {
        return (b.f - a.f) || (a.t - b.t) || (a.o - b.o);
      });
      var html = '<p class="mini-msg big-msg">Le mot était <strong>' +
        GG.esc(state.secret || '?') + '</strong></p>';
      html += rows.map(function (r) {
        return '<div class="final-line"><span>' + GG.esc(r.n) + '</span><strong>' +
          (r.f ? '✅ en ' + r.t + ' essai' + (r.t > 1 ? 's' : '') : '❌ non trouvé') +
          '</strong></div>';
      }).join('');
      html += '<p>⏱️ ' + fmt(state.durationSec) + ' · ' + state.length + ' lettres</p>';
      if (state.players.length === 1) {
        try {
          if (typeof localStorage !== 'undefined' && state.players[0].found) {
            var key = 'gg-motus-best-' + state.level;
            var best = JSON.parse(localStorage.getItem(key) || 'null');
            var cur = { tries: rows[0].t, sec: state.durationSec, ts: state.startTs };
            if (!best || cur.tries < best.tries ||
                (cur.tries === best.tries && cur.sec < best.sec)) {
              localStorage.setItem(key, JSON.stringify(cur));
            }
            var stored = JSON.parse(localStorage.getItem(key) || 'null');
            if (stored && stored.ts === state.startTs) html += '<h1>🏆 Nouveau record !</h1>';
            else if (stored) {
              html += '<p>🏅 Record : ' + stored.tries + ' essais en ' + fmt(stored.sec) + '.</p>';
            }
          }
        } catch (e) {}
      } else {
        var winners = rows.filter(function (r) { return r.f && r.t === rows[0].t && rows[0].f; });
        if (winners.length) {
          html += '<h1>🏆 ' + winners.map(function (r) { return GG.esc(r.n); }).join(' & ') + '</h1>';
        } else {
          html += '<h1>💀 Personne n’a trouvé !</h1>';
        }
      }
      return html;
    },

    /* le secret et les lettres des essais adverses restent cachés */
    redact: function (state, viewer) {
      var copy = GG.clone(state);
      if (!copy.finished) delete copy.secret;
      copy.players.forEach(function (p, i) {
        if (i === viewer || copy.finished) return;
        p.tries = p.tries.map(function (t) {
          return { word: t.word.replace(/./g, '·'), marks: t.marks };
        });
      });
      return copy;
    },

    apply: function (state, player, action, ctx) {
      if (state.finished) return { ok: false, error: 'Partie terminée.' };
      if (action.t === 'level') {
        if (state.phase !== 'setup') return { ok: false, error: 'Niveau déjà choisi.' };
        if (player !== 0) return { ok: false, error: 'L’hôte choisit le niveau.' };
        if (!LEVELS[action.l]) return { ok: false, error: 'Niveau inconnu.' };
        state.level = action.l;
        state.length = LEVELS[action.l].len;
        state.secret = pickSecret(ctx, state.length);
        state.phase = 'play';
        state.startTs = Date.now();
        return { ok: true };
      }
      if (state.phase !== 'play') return { ok: false, error: 'La partie n’a pas commencé.' };
      if (action.t === 'guess') {
        var p = state.players[player];
        if (p.found || p.failed) return { ok: false, error: 'Vous avez terminé.' };
        var word = String(action.w || '').toUpperCase();
        if (word.length !== state.length) {
          return { ok: false, error: 'Il faut un mot de ' + state.length + ' lettres.' };
        }
        if (!/^[A-Z]+$/.test(word)) return { ok: false, error: 'Lettres uniquement.' };
        if (ctx && ctx.dict && ctx.dict.set && ctx.dict.set.size && !ctx.dict.set.has(word)) {
          return { ok: false, error: '« ' + word + ' » n’est pas dans le dictionnaire.' };
        }
        var m = marks(state.secret, word);
        p.tries.push({ word: word, marks: m });
        if (word === state.secret) {
          p.found = true;
          p.order = state.players.filter(function (q) { return q.found; }).length;
        } else if (p.tries.length >= MAX_TRIES) {
          p.failed = true;
        }
        if (allDone(state)) {
          state.finished = true;
          state.durationSec = Math.max(1, Math.round((Date.now() - state.startTs) / 1000));
        }
        return { ok: true };
      }
      return { ok: false, error: 'Action inconnue.' };
    },

    render: function (el, ctx) {
      var s = ctx.state;
      var me = ctx.me;

      if (s.phase === 'setup') {
        var html0 = '<p class="mini-msg big-msg">🟩 Le Mot Mystère</p>';
        if (me === 0) {
          html0 += '<p class="mini-msg">Choisissez le niveau :</p><div class="lvl-btns">' +
            Object.keys(LEVELS).map(function (l) {
              return '<button class="btn big" data-lvl="' + l + '">' +
                (l === 'facile' ? '😌' : l === 'moyen' ? '🙂' : '😈') + ' ' + LEVELS[l].nom +
                ' <small>' + LEVELS[l].len + ' lettres</small></button>';
            }).join('') + '</div>' +
            '<p class="hint">🟩 lettre bien placée · 🟨 présente ailleurs · 6 essais.</p>';
        } else {
          html0 += '<p class="waiting">⏳ L’hôte choisit le niveau…</p>';
        }
        el.innerHTML = html0;
        el.querySelectorAll('[data-lvl]').forEach(function (b) {
          b.addEventListener('click', function () { ctx.act({ t: 'level', l: b.dataset.lvl }); });
        });
        return;
      }

      var my = s.players[me];
      var typed = el._motTyped || '';
      var html = '';

      // mes essais + ligne en cours
      html += '<div class="mot-board">';
      my.tries.forEach(function (t) {
        html += '<div class="mot-row">' + t.word.split('').map(function (ch, i) {
          return '<span class="mot-cell m' + t.marks[i] + '">' + ch + '</span>';
        }).join('') + '</div>';
      });
      if (!my.found && !my.failed) {
        html += '<div class="mot-row">';
        for (var i = 0; i < s.length; i++) {
          html += '<span class="mot-cell cur">' + (typed[i] || '') + '</span>';
        }
        html += '</div>';
      }
      html += '</div>';
      if (my.found) html += '<p class="mini-msg">🎉 Trouvé ! En attente des autres…</p>';
      else if (my.failed) html += '<p class="mini-msg">💀 Essais épuisés… En attente des autres.</p>';

      // clavier
      if (!my.found && !my.failed) {
        html += '<div class="mot-kb">';
        'AZERTYUIOPQSDFGHJKLMWXCVBN'.split('').forEach(function (L) {
          html += '<button class="mot-key" data-k="' + L + '">' + L + '</button>';
        });
        html += '<button class="mot-key wide" data-k="⌫">⌫</button>' +
          '<button class="mot-key wide go" data-k="OK">OK</button></div>';
      }

      // progression des autres joueurs (couleurs seulement)
      if (s.players.length > 1) {
        html += '<div class="mem-stats">' + s.players.map(function (p, i) {
          if (i === me) return '';
          var last = p.tries.length ? p.tries[p.tries.length - 1].marks.map(function (v) {
            return v === 2 ? '🟩' : v === 1 ? '🟨' : '⬛';
          }).join('') : '—';
          return '<span class="mem-stat">' + GG.esc(p.name) + ' : ' +
            (p.found ? '🎉' : p.failed ? '💀' : p.tries.length + '/' + MAX_TRIES) +
            ' <small>' + last + '</small></span>';
        }).join('') + '</div>';
      }
      el.innerHTML = html;

      el.querySelectorAll('.mot-key').forEach(function (k) {
        k.addEventListener('click', function () {
          var key = k.dataset.k;
          var cur = el._motTyped || '';
          if (key === '⌫') el._motTyped = cur.slice(0, -1);
          else if (key === 'OK') {
            if (cur.length === s.length) {
              el._motTyped = '';
              ctx.act({ t: 'guess', w: cur });
              return;
            }
          } else if (cur.length < s.length) {
            el._motTyped = cur + key;
          }
          mod.render(el, ctx);
        });
      });
    },

    _marks: marks, _pickSecret: pickSecret // tests
  };

  GG.register(mod);
  if (typeof module === 'object' && module.exports) module.exports = mod;
})(typeof self !== 'undefined' ? self : globalThis);
