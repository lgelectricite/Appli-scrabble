/* GGgames — Le Mot Mystère (type Motus : 1 à 4 joueurs, 3 niveaux).
   Série SANS FIN et essais ILLIMITÉS. À plusieurs : le MÊME mot s'affiche
   sur tous les écrans et on propose chacun son tour — le premier qui
   trouve marque le point, puis on enchaîne le mot suivant. */
(function (root) {
  'use strict';
  var GG = root.GG;
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
  var PCOLORS = ['#68b56b', '#5aa7de', '#e2a33c', '#c77bd6'];

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

  function fmt(sec) {
    var m = Math.floor(sec / 60);
    return (m ? m + ' min ' : '') + (sec % 60) + ' s';
  }

  function newWord(state, ctx) {
    state.secret = pickSecret(ctx, state.length);
    state.tries = [];
    state.foundBy = -1;
    state.turn = state.starter;
    state.phase = 'play';
    state.roundTs = Date.now();
  }

  var mod = {
    id: 'motus',
    nom: 'Mot Mystère',
    icone: '🟩',
    desc: 'Devinez le mot grâce aux couleurs, en autant d’essais qu’il faut. À plusieurs : même mot pour tous, chacun son tour — le premier qui trouve gagne le point !',
    regles: '<p><strong>🎯 Le but :</strong> deviner le mot secret grâce aux couleurs — en <strong>autant d’essais qu’il faut</strong> — puis enchaîner le suivant, sans fin.</p>' +
      '<p><strong>Comment jouer :</strong> proposez un vrai mot du dictionnaire. 🟩 vert : lettre bien placée · 🟨 jaune : présente ailleurs · gris : absente. Le clavier retient les couleurs déjà découvertes.</p>' +
      '<p><strong>👥 À plusieurs :</strong> le <strong>même mot s’affiche chez tout le monde</strong> et on propose <strong>chacun son tour</strong> — tout le monde voit tous les essais, le premier qui trouve marque le point, et le tour de départ tourne à chaque mot.</p>' +
      '<p><strong>En solo :</strong> enchaînez les mots et battez votre record du mot trouvé en le moins d’essais. On quitte la partie quand on veut, par le menu.</p>',
    min: 1, max: 4,
    hotseat: true, hotseatMax: 4, hidden: false, netOnly: false,

    create: function (names) {
      return {
        players: names.map(function (n) {
          return { name: n, wins: 0 };
        }),
        phase: 'setup',
        level: null,
        length: 0,
        secret: null,
        tries: [],      // PARTAGÉ : chaque essai porte son auteur
        turn: 0,
        starter: 0,
        foundBy: -1,
        round: 1,
        roundTs: 0,
        revealSec: 0,
        finished: false // jamais vrai : la série n'a pas de fin
      };
    },

    turnOf: function (state) { return state.phase === 'play' ? state.turn : -1; },
    over: function () { return false; },
    scoreOf: function (state, i) { return '✓ ' + state.players[i].wins; },

    /* La série ne se termine jamais toute seule, mais on garde un résumé
       propre si l'écran de fin devait s'afficher (sécurité). */
    summary: function (state) {
      var rows = state.players.map(function (p) {
        return { n: p.name, w: p.wins };
      }).sort(function (a, b) { return b.w - a.w; });
      var html = rows.map(function (r) {
        return '<div class="final-line"><span>' + GG.esc(r.n) + '</span><strong>' +
          r.w + ' mot' + (r.w > 1 ? 's' : '') + ' trouvé' + (r.w > 1 ? 's' : '') + '</strong></div>';
      }).join('');
      var top = rows.filter(function (r) { return r.w === rows[0].w; });
      html += '<h1>🏆 ' + top.map(function (r) { return GG.esc(r.n); }).join(' & ') + '</h1>';
      return html;
    },

    /* le tableau est public (même mot, essais visibles de tous) :
       seul le secret reste caché tant qu'il n'est pas trouvé */
    redact: function (state) {
      var copy = GG.clone(state);
      if (copy.phase !== 'reveal') delete copy.secret;
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
        state.starter = (state.starter + 1) % state.players.length;
        newWord(state, ctx);
        return { ok: true };
      }
      if (state.phase !== 'play') return { ok: false, error: 'La partie n’a pas commencé.' };
      if (action.t === 'guess') {
        if (player !== state.turn) return { ok: false, error: 'Ce n’est pas votre tour.' };
        var word = String(action.w || '').toUpperCase();
        if (word.length !== state.length) {
          return { ok: false, error: 'Il faut un mot de ' + state.length + ' lettres.' };
        }
        if (!/^[A-Z]+$/.test(word)) return { ok: false, error: 'Lettres uniquement.' };
        if (state.tries.some(function (t) { return t.word === word; })) {
          return { ok: false, error: '« ' + word + ' » a déjà été proposé.' };
        }
        if (ctx && ctx.dict && ctx.dict.set && ctx.dict.set.size && !ctx.dict.set.has(word)) {
          return { ok: false, error: '« ' + word + ' » n’est pas dans le dictionnaire.' };
        }
        var m = marks(state.secret, word);
        state.tries.push({ word: word, marks: m, by: player });
        if (word === state.secret) {
          state.foundBy = player;
          state.players[player].wins++;
          state.phase = 'reveal';
          state.revealSec = Math.max(1, Math.round((Date.now() - state.roundTs) / 1000));
        } else {
          state.turn = (state.turn + 1) % state.players.length;
        }
        return { ok: true };
      }
      return { ok: false, error: 'Action inconnue.' };
    },

    /* L'adversaire IA joue à son tour, sur le tableau commun : comme un
       humain, il ne regarde JAMAIS state.secret — il repart des couleurs
       déjà affichées (les vôtres comme les siennes), garde les mots
       courants compatibles et en propose un au hasard. Dans ~35 % des cas
       il ne retient que le dernier essai : il reste battable. */
    bot: function (state, me, ctx) {
      if (state.phase !== 'play') return null; // niveau / révélation : à l'hôte
      if (state.turn !== me) return null;      // chacun son tour !
      if (!ctx || !ctx.dict) return null;      // dictionnaire pas encore chargé

      var pool = FALLBACK[state.length] || FALLBACK[5];
      if (GG.MOTS_COURANTS) {
        var courants = GG.MOTS_COURANTS.filter(function (w) {
          return w.length === state.length;
        });
        if (courants.length > 30) pool = courants;
      }
      var ds = ctx.dict.set;
      var dejaJoue = {};
      state.tries.forEach(function (t2) { dejaJoue[t2.word] = true; });
      var candidats = function (essais) {
        return pool.filter(function (w) {
          if (dejaJoue[w]) return false;
          if (w.length !== state.length || !/^[A-Z]+$/.test(w)) return false;
          if (ds && ds.size && !ds.has(w)) return false; // apply le refuserait
          for (var i = 0; i < essais.length; i++) {
            var m = marks(w, essais[i].word);
            for (var j = 0; j < m.length; j++) {
              if (m[j] !== essais[i].marks[j]) return false;
            }
          }
          return true;
        });
      };
      var essais = state.tries;
      if (essais.length > 1 && Math.random() < 0.35) {
        essais = [essais[essais.length - 1]];
      }
      var cand = candidats(essais);
      if (!cand.length && essais.length !== state.tries.length) cand = candidats(state.tries);
      if (!cand.length) return null; // on n'invente jamais un mot
      return { t: 'guess', w: cand[Math.floor(Math.random() * cand.length)] };
    },

    render: function (el, ctx) {
      var s = ctx.state;
      var me = ctx.me;
      var multi = s.players.length > 1;

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
            '<p class="hint">🟩 bien placée · 🟨 présente ailleurs · essais illimités' +
            (multi ? ' · chacun son tour, même mot pour tous !' : '') + '</p>';
        } else {
          html0 += '<p class="waiting">⏳ L’hôte choisit le niveau…</p>';
        }
        el.innerHTML = html0;
        el.querySelectorAll('[data-lvl]').forEach(function (b) {
          b.addEventListener('click', function () { ctx.act({ t: 'level', l: b.dataset.lvl }); });
        });
        return;
      }

      /* ===== révélation : le mot, le vainqueur, et on enchaîne ===== */
      if (s.phase === 'reveal') {
        var essaisN = s.tries.length;
        var html2 = '<div class="mot-reveal">' +
          '<p class="mini-msg">Le mot était</p>' +
          '<div class="mot-row mot-reveal-word">' + s.secret.split('').map(function (ch) {
            return '<span class="mot-cell m2">' + ch + '</span>';
          }).join('') + '</div>';
        html2 += '<p class="mini-msg">🎉 <strong>' + GG.esc(s.players[s.foundBy].name) +
          '</strong> l’a trouvé — ' + essaisN + ' essai' + (essaisN > 1 ? 's' : '') +
          (multi ? ' au total' : '') + ' · ⏱️ ' + fmt(s.revealSec) + '</p>';
        html2 += '<div class="mem-stats">' + s.players.map(function (p) {
          return '<span class="mem-stat">' + GG.esc(p.name) + ' : ✓ ' + p.wins + '</span>';
        }).join('') + '</div>';

        // record solo : le mot trouvé en le moins d'essais (par niveau)
        if (!multi && el._motRecRnd !== s.round) {
          el._motRecRnd = s.round;
          try {
            var key = 'gg-motus-best-' + s.level;
            var best = JSON.parse(localStorage.getItem(key) || 'null');
            if (!best || essaisN < best.tries) {
              localStorage.setItem(key, JSON.stringify({ tries: essaisN }));
              if (best) el._motNewRec = s.round;
            }
          } catch (e) {}
        }
        try {
          var rec = JSON.parse(localStorage.getItem('gg-motus-best-' + s.level) || 'null');
          if (!multi && rec) {
            html2 += el._motNewRec === s.round
              ? '<p class="mini-msg">🏆 Record battu : trouvé en ' + rec.tries + ' essai' +
                (rec.tries > 1 ? 's' : '') + ' !</p>'
              : '<p class="hint mini-center">🏅 Record : un mot trouvé en ' + rec.tries +
                ' essai' + (rec.tries > 1 ? 's' : '') + '.</p>';
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

      /* ===== un mot en cours, sur le tableau COMMUN ===== */
      var monTour = me === s.turn;
      // la saisie n'est vidée que lorsqu'un essai a réellement été accepté
      if (el._motRound !== s.round) { el._motTyped = ''; el._motLen = 0; el._motRound = s.round; }
      if (el._motLen === undefined) el._motLen = s.tries.length;
      if (s.tries.length !== el._motLen) { el._motTyped = ''; el._motLen = s.tries.length; }
      var typed = el._motTyped || '';

      var html = '<div class="mem-stats">' +
        '<span class="mem-stat">Mot n°' + s.round + '</span>' +
        '<span class="mem-stat">💬 ' + s.tries.length + ' essai' + (s.tries.length > 1 ? 's' : '') + '</span>' +
        s.players.map(function (p, i) {
          return '<span class="mem-stat"' + (multi && i === s.turn ?
            ' style="outline:2px solid ' + PCOLORS[i % 4] + '"' : '') + '>' +
            GG.esc(p.name) + ' ✓' + p.wins + '</span>';
        }).join('') + '</div>';

      // le tableau des essais de la table (auteur signalé à gauche)
      html += '<div class="mot-board' + (s.tries.length > 6 ? ' mot-scroll' : '') + '">';
      s.tries.forEach(function (t) {
        html += '<div class="mot-row">' +
          (multi ? '<span class="mot-who" style="background:' + PCOLORS[t.by % 4] + '" title="' +
            GG.esc(s.players[t.by].name) + '">' +
            GG.esc(s.players[t.by].name.replace(/^🤖 /, '').charAt(0)) + '</span>' : '') +
          t.word.split('').map(function (ch, i) {
            return '<span class="mot-cell m' + t.marks[i] + '">' + ch + '</span>';
          }).join('') + '</div>';
      });
      // la ligne en cours de frappe (au tour du joueur qui regarde)
      if (monTour) {
        html += '<div class="mot-row">' + (multi ? '<span class="mot-who cur"></span>' : '');
        for (var i = 0; i < s.length; i++) {
          html += '<span class="mot-cell cur">' + (typed[i] || '') + '</span>';
        }
        html += '</div>';
      }
      html += '</div>';

      if (!monTour) {
        html += '<p class="mini-msg">⏳ Au tour de <strong>' +
          GG.esc(s.players[s.turn].name) + '</strong>…</p>';
      }

      // clavier : il retient les couleurs déjà découvertes par la table
      if (monTour) {
        var kcol = {};
        s.tries.forEach(function (t) {
          t.word.split('').forEach(function (ch, i) {
            if (kcol[ch] === undefined || t.marks[i] > kcol[ch]) kcol[ch] = t.marks[i];
          });
        });
        html += '<div class="mot-kb">';
        'AZERTYUIOPQSDFGHJKLMWXCVBN'.split('').forEach(function (L) {
          var k2 = kcol[L] !== undefined ? ' k' + kcol[L] : '';
          html += '<button class="mot-key' + k2 + '" data-k="' + L + '">' + L + '</button>';
        });
        html += '<button class="mot-key wide" data-k="⌫">⌫</button>' +
          '<button class="mot-key wide go" data-k="OK">OK</button></div>';
      }
      el.innerHTML = html;
      // les derniers essais restent sous les yeux
      var board = el.querySelector('.mot-board.mot-scroll');
      if (board) board.scrollTop = board.scrollHeight;

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
