/* GGgames — Le Mot Mystère (type Motus : 1 à 4 joueurs, 3 niveaux).
   Série SANS FIN : chaque mot révélé enchaîne sur le suivant. On compte
   les mots trouvés et la série d'affilée ; on quitte quand on veut. */
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

  /* Le mot secret vient de la liste de mots COURANTS (pas du grand
     dictionnaire, plein de formes rares) ; le dictionnaire ne sert qu'à
     valider les propositions des joueurs. */
  function pickSecret(ctx, len) {
    var pool = FALLBACK[len] || FALLBACK[5];
    if (GG.MOTS_COURANTS) {
      var courants = GG.MOTS_COURANTS.filter(function (w) {
        return w.length === len;
      });
      if (courants.length > 30) pool = courants;
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

  function newWord(state, ctx) {
    state.secret = pickSecret(ctx, state.length);
    state.players.forEach(function (p) {
      p.tries = [];
      p.found = false;
      p.failed = false;
      p.order = 0;
    });
    state.phase = 'play';
    state.roundTs = Date.now();
  }

  var mod = {
    id: 'motus',
    nom: 'Mot Mystère',
    icone: '🟩',
    desc: 'Devinez le mot en 6 essais grâce aux couleurs — et enchaînez les mots en série, sans fin !',
    regles: '<p><strong>🎯 Le but :</strong> deviner le mot secret en 6 essais maximum… puis enchaîner le suivant !</p><p><strong>Comment jouer :</strong> proposez un vrai mot du dictionnaire. 🟩 vert : lettre bien placée · 🟨 jaune : présente ailleurs · gris : absente.</p><p><strong>La série :</strong> chaque mot trouvé allonge votre série 🔥 — un mot manqué la remet à zéro. Battez votre record de série ! On quitte la partie quand on veut, par le menu.</p><p><strong>En duel :</strong> même mot secret pour tous — vous voyez les couleurs des autres, jamais leurs lettres.</p>',
    min: 1, max: 4,
    hotseat: true, hotseatMax: 1, hidden: false, netOnly: false,

    create: function (names) {
      return {
        players: names.map(function (n) {
          return { name: n, tries: [], found: false, failed: false, order: 0,
                   wins: 0, streak: 0 };
        }),
        phase: 'setup',
        level: null,
        length: 0,
        secret: null,
        round: 1,
        roundTs: 0,
        revealSec: 0,
        finished: false // jamais vrai : la série n'a pas de fin
      };
    },

    turnOf: function () { return -1; }, // chacun cherche de son côté
    over: function () { return false; },
    scoreOf: function (state, i) {
      var p = state.players[i];
      if (state.phase === 'play') {
        return p.found ? '🎉' : p.failed ? '💀' : p.tries.length + '/' + MAX_TRIES;
      }
      return '✓ ' + p.wins;
    },

    /* La série ne se termine jamais toute seule, mais on garde un résumé
       propre si l'écran de fin devait s'afficher (sécurité). */
    summary: function (state) {
      var rows = state.players.map(function (p) {
        return { n: p.name, w: p.wins, s: p.streak };
      }).sort(function (a, b) { return b.w - a.w; });
      var html = rows.map(function (r) {
        return '<div class="final-line"><span>' + GG.esc(r.n) + '</span><strong>' +
          r.w + ' mot' + (r.w > 1 ? 's' : '') + ' trouvé' + (r.w > 1 ? 's' : '') + '</strong></div>';
      }).join('');
      var top = rows.filter(function (r) { return r.w === rows[0].w; });
      html += '<h1>🏆 ' + top.map(function (r) { return GG.esc(r.n); }).join(' & ') + '</h1>';
      return html;
    },

    /* le secret et les lettres des essais adverses restent cachés
       tant que le mot n'est pas révélé */
    redact: function (state, viewer) {
      var copy = GG.clone(state);
      if (copy.phase !== 'reveal') delete copy.secret;
      copy.players.forEach(function (p, i) {
        if (i === viewer || copy.phase === 'reveal') return;
        p.tries = p.tries.map(function (t) {
          return { word: t.word.replace(/./g, '·'), marks: t.marks };
        });
      });
      return copy;
    },

    apply: function (state, player, action, ctx) {
      if (action.t === 'level') {
        if (state.phase !== 'setup') return { ok: false, error: 'Niveau déjà choisi.' };
        if (player !== 0) return { ok: false, error: 'L’hôte choisit le niveau.' };
        if (!LEVELS[action.l]) return { ok: false, error: 'Niveau inconnu.' };
        state.level = action.l;
        state.length = LEVELS[action.l].len;
        newWord(state, ctx);
        return { ok: true };
      }
      if (action.t === 'next') {
        if (state.phase !== 'reveal') return { ok: false, error: 'Le mot n’est pas encore révélé.' };
        if (player !== 0) return { ok: false, error: 'L’hôte lance le mot suivant.' };
        state.round++;
        newWord(state, ctx);
        return { ok: true };
      }
      if (state.phase !== 'play') return { ok: false, error: 'La partie n’a pas commencé.' };
      if (action.t === 'guess') {
        var p = state.players[player];
        if (p.found || p.failed) return { ok: false, error: 'Vous avez terminé ce mot.' };
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
          // révélation : la série avance, puis on enchaînera le mot suivant
          state.phase = 'reveal';
          state.revealSec = Math.max(1, Math.round((Date.now() - state.roundTs) / 1000));
          state.players.forEach(function (q) {
            if (q.found) { q.wins++; q.streak++; }
            else q.streak = 0;
          });
        }
        return { ok: true };
      }
      return { ok: false, error: 'Action inconnue.' };
    },

    /* L'adversaire IA : il ne regarde JAMAIS state.secret. Comme un humain,
       il repart de ses propres essais et de leurs couleurs, garde les mots
       courants encore compatibles et en propose un au hasard — un choix
       aléatoire parmi les compatibles est déjà faillible juste ce qu'il
       faut pour rester battable. */
    bot: function (state, me, ctx) {
      if (state.phase !== 'play') return null; // niveau / révélation : à l'hôte
      var p = state.players[me];
      if (!p || p.found || p.failed) return null; // mot terminé, on attend les autres
      if (!ctx || !ctx.dict) return null; // dictionnaire pas encore chargé

      // même vivier que le tirage du secret : les mots courants de la
      // bonne longueur (ou la liste de secours)
      var pool = FALLBACK[state.length] || FALLBACK[5];
      if (GG.MOTS_COURANTS) {
        var courants = GG.MOTS_COURANTS.filter(function (w) {
          return w.length === state.length;
        });
        if (courants.length > 30) pool = courants;
      }
      var ds = ctx.dict.set;
      var dejaJoue = {};
      p.tries.forEach(function (t2) { dejaJoue[t2.word] = true; });
      var candidats = function (essais) {
        return pool.filter(function (w) {
          if (dejaJoue[w]) return false;
          if (w.length !== state.length || !/^[A-Z]+$/.test(w)) return false;
          if (ds && ds.size && !ds.has(w)) return false; // apply le refuserait
          // compatible avec toutes les couleurs retenues ?
          for (var i = 0; i < essais.length; i++) {
            var m = marks(w, essais[i].word);
            for (var j = 0; j < m.length; j++) {
              if (m[j] !== essais[i].marks[j]) return false;
            }
          }
          return true;
        });
      };
      // un vrai joueur oublie parfois un indice : dans ~35 % des cas, l'IA
      // ne retient que son DERNIER essai — elle reste battable en duel
      var essais = p.tries;
      if (essais.length > 1 && Math.random() < 0.35) {
        essais = [essais[essais.length - 1]];
      }
      var cand = candidats(essais);
      if (!cand.length && essais.length !== p.tries.length) cand = candidats(p.tries);
      if (!cand.length) return null; // on n'invente jamais un mot
      return { t: 'guess', w: cand[Math.floor(Math.random() * cand.length)] };
    },

    render: function (el, ctx) {
      var s = ctx.state;
      var me = ctx.me;

      if (s.phase === 'setup') {
        el._motTyped = '';
        el._motLen = 0;
        el._motRound = 1;
        var html0 = '<p class="mini-msg big-msg">🟩 Le Mot Mystère</p>';
        if (me === 0) {
          html0 += '<p class="mini-msg">Choisissez le niveau :</p><div class="lvl-btns">' +
            Object.keys(LEVELS).map(function (l) {
              return '<button class="btn big" data-lvl="' + l + '">' +
                (l === 'facile' ? '😌' : l === 'moyen' ? '🙂' : '😈') + ' ' + LEVELS[l].nom +
                ' <small>' + LEVELS[l].len + ' lettres · série sans fin</small></button>';
            }).join('') + '</div>' +
            '<p class="hint">🟩 lettre bien placée · 🟨 présente ailleurs · 6 essais par mot, les mots s’enchaînent.</p>';
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

      /* ===== révélation : le mot, la série, et on enchaîne ===== */
      if (s.phase === 'reveal') {
        var html2 = '<div class="mot-reveal">' +
          '<p class="mini-msg">Le mot était</p>' +
          '<div class="mot-row mot-reveal-word">' + s.secret.split('').map(function (ch) {
            return '<span class="mot-cell m2">' + ch + '</span>';
          }).join('') + '</div>';
        html2 += s.players.map(function (p, i) {
          return '<div class="final-line"><span>' + GG.esc(p.name) + '</span><strong>' +
            (p.found ? '✅ en ' + p.tries.length + ' essai' + (p.tries.length > 1 ? 's' : '')
              : '❌ pas trouvé') + '</strong></div>';
        }).join('');
        html2 += '<div class="mem-stats">' + s.players.map(function (p) {
          return '<span class="mem-stat">' + GG.esc(p.name) + ' : ✓ ' + p.wins +
            (p.streak > 1 ? ' · 🔥 ' + p.streak : '') + '</span>';
        }).join('') + '<span class="mem-stat">⏱️ ' + fmt(s.revealSec) + '</span></div>';

        // record de série (solo) : enregistré une seule fois par mot
        if (s.players.length === 1 && el._motRecRnd !== s.round) {
          el._motRecRnd = s.round;
          try {
            var key = 'gg-motus-serie-' + s.level;
            var best = JSON.parse(localStorage.getItem(key) || 'null');
            if (my.streak > 0 && (!best || my.streak > best.streak)) {
              localStorage.setItem(key, JSON.stringify({ streak: my.streak }));
              if (best) el._motNewRec = s.round;
            }
          } catch (e) {}
        }
        try {
          var rec = JSON.parse(localStorage.getItem('gg-motus-serie-' + s.level) || 'null');
          if (s.players.length === 1 && rec) {
            html2 += el._motNewRec === s.round
              ? '<p class="mini-msg">🏆 Record de série battu : ' + rec.streak + ' !</p>'
              : '<p class="hint mini-center">🏅 Record de série : ' + rec.streak + ' mot' +
                (rec.streak > 1 ? 's' : '') + ' d’affilée.</p>';
          }
        } catch (e) {}

        if (me === 0) {
          html2 += '<button class="btn big primary" id="mot-next">Mot suivant</button>';
        } else {
          html2 += '<p class="waiting">' + GG.esc(s.players[0].name) + ' lance le mot suivant…</p>';
        }
        html2 += '</div>';
        el.innerHTML = html2;
        var bn = el.querySelector('#mot-next');
        if (bn) bn.addEventListener('click', function () { ctx.act({ t: 'next' }); });
        return;
      }

      /* ===== un mot en cours ===== */
      // la saisie n'est vidée que lorsqu'un essai a réellement été accepté
      if (el._motRound !== s.round) { el._motTyped = ''; el._motLen = 0; el._motRound = s.round; }
      if (el._motLen === undefined) el._motLen = my.tries.length;
      if (my.tries.length !== el._motLen) { el._motTyped = ''; el._motLen = my.tries.length; }
      var typed = el._motTyped || '';
      var html = '<div class="mem-stats">' +
        '<span class="mem-stat">Mot n°' + s.round + '</span>' +
        '<span class="mem-stat">✓ ' + my.wins + '</span>' +
        (my.streak > 1 ? '<span class="mem-stat">🔥 ' + my.streak + '</span>' : '') +
        '</div>';

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
          if (key === 'OK') {
            // act() redessine l'écran avec le nouvel état ; la saisie
            // n'est vidée que si l'essai est réellement accepté
            if (cur.length === s.length) ctx.act({ t: 'guess', w: cur });
            return;
          }
          if (key === '⌫') el._motTyped = cur.slice(0, -1);
          else if (cur.length < s.length) el._motTyped = cur + key;
          mod.render(el, ctx);
        });
      });
    },

    _marks: marks, _pickSecret: pickSecret // tests
  };

  GG.register(mod);
  if (typeof module === 'object' && module.exports) module.exports = mod;
})(typeof self !== 'undefined' ? self : globalThis);
