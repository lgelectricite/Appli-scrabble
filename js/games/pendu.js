/* GGgames — Pendu (1 à 4 joueurs, mots courants, 3 niveaux). */
(function (root) {
  'use strict';
  var GG = root.GG;
  var ROUNDS = 5;
  var LEVELS = {
    facile: { nom: 'Facile', min: 7, max: 10, lives: 8 },
    moyen: { nom: 'Moyen', min: 5, max: 7, lives: 7 },
    difficile: { nom: 'Difficile', min: 4, max: 6, lives: 6 }
  };
  var FALLBACK = ['MAISON', 'JARDIN', 'MUSIQUE', 'VOITURE', 'CHATEAU', 'PLANETE',
    'ORDINATEUR', 'MONTAGNE', 'PAPILLON', 'CHOCOLAT', 'BIBLIOTHEQUE', 'AVENTURE',
    'TEMPETE', 'HORIZON', 'LUMIERE', 'FROMAGE', 'BATEAU', 'ETOILE', 'CAMION',
    'PISCINE', 'BALEINE', 'TIGRE', 'SERPENT', 'FUSEE', 'ROBOT'];

  /* Les mots à deviner viennent de la liste de mots COURANTS : le grand
     dictionnaire contient trop de conjugaisons rares pour être deviné. */
  function pickWord(level) {
    var cfg = LEVELS[level] || LEVELS.moyen;
    var pool = FALLBACK.filter(function (w) {
      return w.length >= cfg.min && w.length <= cfg.max;
    });
    if (pool.length < 10) pool = FALLBACK;
    if (GG.MOTS_COURANTS) {
      var courants = GG.MOTS_COURANTS.filter(function (w) {
        return w.length >= cfg.min && w.length <= cfg.max;
      });
      if (courants.length > 50) pool = courants;
    }
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function newRound(state) {
    var w = pickWord(state.level);
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
    desc: 'Devinez le mot lettre par lettre. Le jeu choisit des mots courants : pas de triche, pas de pièges !',
    regles: '<p><strong>🎯 Le but :</strong> deviner le mot caché lettre par lettre — le jeu le choisit dans une liste de mots courants : pas de mots impossibles, et personne ne peut tricher.</p><p><strong>Comment jouer :</strong> à votre tour, proposez une lettre. Trouvée : +1 point par lettre révélée et vous rejouez. Absente : le tour passe et un cœur s’éteint.</p><p><strong>Les niveaux :</strong> facile = mots longs (plus de lettres à attraper) et 8 cœurs ; difficile = mots courts et 6 cœurs. Coincé ? <strong>💡 Révéler une lettre coûte un cœur</strong> (et ne rapporte aucun point).</p><p><strong>Les points :</strong> +3 à qui termine le mot. 5 manches, meilleur score gagnant.</p>',
    min: 1, max: 4,
    hotseat: true, hidden: false, netOnly: false,

    create: function (names) {
      return {
        players: names.map(function (n) { return { name: n, score: 0 }; }),
        current: 0,
        round: 1,
        maxRounds: ROUNDS,
        phase: 'setup',      // l'hôte choisit le niveau
        level: null,
        maxErrors: 8,
        finished: false
      };
    },

    turnOf: function (state) {
      return (state.phase === 'setup' || state.finished || state.roundOver)
        ? -1 : state.current;
    },
    over: function (state) { return state.finished; },
    scoreOf: function (state, i) { return state.players[i].score; },

    summary: function (state) {
      var rows = state.players.map(function (p) { return { n: p.name, s: p.score }; })
        .sort(function (a, b) { return b.s - a.s; });
      var html = rows.map(function (r) {
        return '<div class="final-line"><span>' + GG.esc(r.n) + '</span><strong>' +
          r.s + ' pts</strong></div>';
      }).join('') + '<h1>🏆 ' + rows.filter(function (r) { return r.s === rows[0].s; })
        .map(function (r) { return GG.esc(r.n); }).join(' & ') + '</h1>';
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
      if (action.t === 'level') {
        if (state.phase !== 'setup') return { ok: false, error: 'Niveau déjà choisi.' };
        if (player !== 0) return { ok: false, error: 'L’hôte choisit le niveau.' };
        if (!LEVELS[action.l]) return { ok: false, error: 'Niveau inconnu.' };
        state.level = action.l;
        state.maxErrors = LEVELS[action.l].lives;
        state.phase = 'play';
        newRound(state);
        return { ok: true };
      }
      if (state.phase !== 'play') return { ok: false, error: 'Choisissez d’abord le niveau.' };
      if (action.t === 'next') {
        if (!state.roundOver) return { ok: false, error: 'La manche n’est pas finie.' };
        state.round++;
        if (state.round > state.maxRounds) {
          state.finished = true;
        } else {
          newRound(state);
          state.current = (state.round - 1) % state.players.length;
        }
        return { ok: true };
      }
      if (action.t === 'hint') {
        // indice : révèle une lettre au hasard… au prix d'un cœur
        if (state.roundOver) return { ok: false, error: 'Manche terminée.' };
        if (player !== state.current) return { ok: false, error: 'Ce n’est pas votre tour.' };
        if (state.errors >= state.maxErrors - 1) {
          return { ok: false, error: 'Plus assez de cœurs pour un indice !' };
        }
        var hidden = [];
        for (var h = 0; h < state.secret.length; h++) {
          if (!state.revealed[h] && hidden.indexOf(state.secret[h]) === -1) {
            hidden.push(state.secret[h]);
          }
        }
        if (!hidden.length) return { ok: false, error: 'Tout est déjà révélé.' };
        var pick = hidden[Math.floor(Math.random() * hidden.length)];
        state.errors++; // l'indice coûte un cœur
        if (state.tried.indexOf(pick) === -1) state.tried.push(pick);
        for (var h2 = 0; h2 < state.secret.length; h2++) {
          if (state.secret[h2] === pick) state.revealed[h2] = pick;
        }
        // pas de points pour une lettre offerte ; le mot peut se terminer sans bonus
        if (state.revealed.every(function (r) { return r; })) {
          state.roundOver = true;
          state.answer = state.secret;
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
        if (state.errors >= state.maxErrors) {
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
      if (s.phase === 'setup') {
        var html0 = '<p class="mini-msg big-msg">🪢 Pendu</p>';
        if (ctx.me === 0) {
          html0 += '<p class="mini-msg">Choisissez le niveau :</p><div class="lvl-btns">' +
            Object.keys(LEVELS).map(function (l) {
              var c = LEVELS[l];
              return '<button class="btn big" data-lvl="' + l + '">' +
                (l === 'facile' ? '😌' : l === 'moyen' ? '🙂' : '😈') + ' ' + c.nom +
                ' <small>mots de ' + c.min + ' à ' + c.max + ' lettres · ' +
                c.lives + ' cœurs</small></button>';
            }).join('') + '</div>';
        } else {
          html0 += '<p class="waiting">⏳ L’hôte choisit le niveau…</p>';
        }
        el.innerHTML = html0;
        el.querySelectorAll('[data-lvl]').forEach(function (b) {
          b.addEventListener('click', function () { ctx.act({ t: 'level', l: b.dataset.lvl }); });
        });
        return;
      }
      var mine = ctx.me === s.current && !s.roundOver && !s.finished;
      var word = s.revealed.map(function (r) {
        return '<span class="pendu-slot">' + (r || '&nbsp;') + '</span>';
      }).join('');
      var lives = '';
      for (var i = 0; i < s.maxErrors; i++) {
        lives += i < s.maxErrors - s.errors ? '❤️' : '🖤';
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
        if (mine && s.errors < s.maxErrors - 1) {
          html += '<div class="mini-actions"><button class="btn" data-a="hint">' +
            '💡 Révéler une lettre (coûte un ❤️)</button></div>';
        }
        html += '<p class="hint">+1 point par lettre révélée, +3 pour celui qui termine le mot.</p>';
      }
      el.innerHTML = html;
      el.querySelectorAll('.pendu-key').forEach(function (k) {
        k.addEventListener('click', function () { ctx.act({ t: 'letter', l: k.dataset.l }); });
      });
      var next = el.querySelector('[data-a="next"]');
      if (next) next.addEventListener('click', function () { ctx.act({ t: 'next' }); });
      var hintBtn = el.querySelector('[data-a="hint"]');
      if (hintBtn) hintBtn.addEventListener('click', function () { ctx.act({ t: 'hint' }); });
    }
  };

  GG.register(mod);
  if (typeof module === 'object' && module.exports) module.exports = mod;
})(typeof self !== 'undefined' ? self : globalThis);
