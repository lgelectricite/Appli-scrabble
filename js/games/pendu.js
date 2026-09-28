/* GGgames — Pendu (1 à 4 joueurs). V2 : la montgolfière.

   Le dessin du pendu devient une montgolfière au-dessus de la mer : à
   chaque erreur, une rustine, un « pfff » d’air, le ballon se dégonfle et
   descend vers les vagues (et l’aileron du requin qui rôde…). Plus d’erreurs
   permises : plouf ! Le nombre d’erreurs restantes est toujours écrit en
   toutes lettres, avec des pastilles.

   Deux façons de jouer :
   - 🎲 le jeu choisit le mot (mots courants rangés par thème ; la catégorie
     sert d’indice ; 3 niveaux calibrés sur la fréquence des mots) ;
   - ✍️ « je choisis le mot, tu devines » (à partir de 2 joueurs) : chacun à
     son tour écrit un mot secret pour les autres.
   Contre l’ordinateur : 3 niveaux d’IA qui devinent comme un joueur (elles
   ne voient jamais le mot secret).

   Sécurité : lettres filtrées (A-Z), catégorie retrouvée par son identifiant
   dans la liste des thèmes (liste blanche), prénoms échappés. */
(function (root) {
  'use strict';
  var GG = root.GG;
  var ROUNDS = 5;
  /* niveaux de MOTS (calibrés sur la fréquence d’usage, GG.MOTS_THEMES) :
     rangs 0 = très courants, 1 = courants, 2 = plus rares */
  var LEVELS = {
    facile: { nom: 'Facile', rangs: [0], min: 4, max: 7, lives: 8, sous: 'mots très courants et courts' },
    moyen: { nom: 'Moyen', rangs: [0, 1], min: 5, max: 9, lives: 7, sous: 'mots courants' },
    difficile: { nom: 'Difficile', rangs: [1, 2], min: 6, max: 12, lives: 6, sous: 'vocabulaire plus riche' }
  };
  var FALLBACK = ['MAISON', 'JARDIN', 'MUSIQUE', 'VOITURE', 'CHATEAU', 'PLANETE',
    'ORDINATEUR', 'MONTAGNE', 'PAPILLON', 'CHOCOLAT', 'BIBLIOTHEQUE', 'AVENTURE',
    'TEMPETE', 'HORIZON', 'LUMIERE', 'FROMAGE', 'BATEAU', 'ETOILE', 'CAMION',
    'PISCINE', 'BALEINE', 'TIGRE', 'SERPENT', 'FUSEE', 'ROBOT'];
  var FREQ = 'EASINRTULODCMPGBVHFQYXJKWZ'; // lettres du français, de la plus à la moins fréquente
  var PCOLORS = ['#2fd4ff', '#ff5cb0', '#ffc23d', '#b28cff'];

  /* IA : ne connaît que le motif affiché, les lettres jouées et la catégorie.
     - pattern : probabilité de raisonner sur les mots qui collent au motif ;
     - vocab : ce qu’elle connaît (0 = mots des thèmes très courants,
       1 = + courants, 2 = tout, plus la liste des mots courants) ;
     - hasard : probabilité d’une lettre prise un peu au hasard ;
     - top : elle hésite entre les « top » meilleures lettres.
     Mesures (tests/test_v2_mots.js, parties de 5 manches contre un joueur
     moyen simulé) : l’IA gagne ≈ 21 % en facile, ≈ 50 % en moyen, ≈ 76 % en
     difficile. */
  var NIVEAUX_IA = {
    facile: { pattern: 0.4, vocab: 1, hasard: 0.12, top: 3 },
    moyen: { pattern: 0.55, vocab: 1, hasard: 0.08, top: 2 },
    difficile: { pattern: 0.72, vocab: 2, hasard: 0.03, top: 2 }
  };

  /* ================= les mots ================= */

  function themes() { return GG.MOTS_THEMES && GG.MOTS_THEMES.length ? GG.MOTS_THEMES : []; }
  function themeDe(id) {
    var t = themes();
    for (var i = 0; i < t.length; i++) if (t[i].id === id) return t[i];
    return null;
  }
  function stockage() {
    try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; }
  }
  function lireLS(cle, def) {
    var ls = stockage();
    if (!ls) return def;
    try { var v = JSON.parse(ls.getItem(cle) || 'null'); return v == null ? def : v; } catch (e) { return def; }
  }
  function ecrireLS(cle, v) {
    var ls = stockage();
    if (!ls) return;
    try { ls.setItem(cle, JSON.stringify(v)); } catch (e) {}
  }
  /* tous les mots possibles d’un niveau : [{w, cat}] */
  function reserve(level) {
    var cfg = LEVELS[level] || LEVELS.moyen;
    var out = [];
    themes().forEach(function (t) {
      cfg.rangs.forEach(function (r) {
        (t.mots[r] || []).forEach(function (w) {
          if (w.length >= cfg.min && w.length <= cfg.max) out.push({ w: w, cat: t.id });
        });
      });
    });
    if (out.length < 20) {
      FALLBACK.forEach(function (w) { out.push({ w: w, cat: '' }); });
    }
    return out;
  }
  /* tirage sans répétition : ni dans la partie, ni (localement) d’une partie à l’autre */
  function pickWord(state, level) {
    var pool = reserve(level);
    var dansPartie = {};
    (Array.isArray(state.vus) ? state.vus : []).forEach(function (w) { dansPartie[w] = true; });
    var hist = lireLS('gg-pendu-vus-' + level, []);
    var vieux = {};
    if (Array.isArray(hist)) hist.forEach(function (w) { vieux[w] = true; });
    var libres = pool.filter(function (x) { return !dansPartie[x.w] && !vieux[x.w]; });
    if (!libres.length) libres = pool.filter(function (x) { return !dansPartie[x.w]; });
    if (!libres.length) libres = pool;
    var x = libres[Math.floor(Math.random() * libres.length)];
    if (Array.isArray(hist)) {
      hist.push(x.w);
      var max = Math.floor(pool.length * 0.8);
      if (hist.length > max) hist = hist.slice(hist.length - max);
      ecrireLS('gg-pendu-vus-' + level, hist);
    }
    return x;
  }

  function sansAccents(s) {
    s = String(s == null ? '' : s);
    if (s.normalize) s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
    return s.replace(/œ/gi, 'OE').replace(/æ/gi, 'AE').toUpperCase();
  }

  function debutManche(state, w, cat) {
    state.secret = w;
    state.revealed = [];
    for (var i = 0; i < w.length; i++) state.revealed.push(null);
    state.tried = [];
    state.errors = 0;
    state.roundOver = false;
    state.lost = false;
    state.answer = null; // rendu public en fin de manche
    state.cat = cat || '';
    state.phase = 'play';
    state.roundTs = Date.now();
    if (!Array.isArray(state.vus)) state.vus = [];
    state.vus.push(w);
  }

  function newRound(state) {
    var x = pickWord(state, state.level);
    debutManche(state, x.w, x.cat);
  }

  /* le prochain devineur (en duel, celui qui a choisi le mot ne devine pas) */
  function suivant(state, i) {
    var n = state.players.length;
    for (var k = 1; k <= n; k++) {
      var j = (i + k) % n;
      if (state.mode !== 'duel' || j !== state.chooser) return j;
    }
    return i;
  }

  function finDeManche(state, perdu) {
    state.roundOver = true;
    state.lost = perdu;
    state.answer = state.secret;
    if (perdu) {
      state.perdus = (state.perdus || 0) + 1;
      if (state.mode === 'duel' && state.chooser >= 0) state.players[state.chooser].score += 5; // le mot a résisté
    } else {
      state.trouves = (state.trouves || 0) + 1;
    }
  }

  /* ================= l’IA ================= */

  var vocabCache = {};
  function vocabIA(niv, len) {
    var k = niv + ':' + len;
    if (vocabCache[k]) return vocabCache[k];
    var vu = {}, out = [];
    function ajoute(w, cat) {
      if (w.length === len && !vu[w]) { vu[w] = true; out.push({ w: w, cat: cat }); }
    }
    themes().forEach(function (t) {
      for (var r = 0; r <= Math.min(2, niv); r++) (t.mots[r] || []).forEach(function (w) { ajoute(w, t.id); });
    });
    if (niv >= 1 && GG.MOTS_COURANTS) GG.MOTS_COURANTS.forEach(function (w) { ajoute(w, ''); });
    if (niv >= 2 && GG.MOTS_VOCAB && GG.MOTS_VOCAB[len]) GG.MOTS_VOCAB[len].forEach(function (w) { ajoute(w, ''); });
    vocabCache[k] = out;
    return out;
  }

  /* lettre proposée par l’IA à partir de ce qui est PUBLIC */
  function choixLettre(vue, niveau, rnd) {
    rnd = rnd || Math.random;
    var P = NIVEAUX_IA[niveau] || NIVEAUX_IA.moyen;
    var essayees = {};
    (vue.tried || []).forEach(function (L) { essayees[L] = true; });
    var libres = FREQ.split('').filter(function (L) { return !essayees[L]; });
    if (!libres.length) return null;
    if (rnd() < P.hasard) return libres[Math.floor(rnd() * libres.length)];
    if (rnd() < P.pattern) {
      var motif = vue.revealed || [];
      var len = motif.length;
      var fausses = {};
      (vue.tried || []).forEach(function (L) { if (motif.indexOf(L) === -1) fausses[L] = true; });
      var cand = vocabIA(P.vocab, len).filter(function (x) {
        var w = x.w;
        for (var i = 0; i < len; i++) {
          if (motif[i]) { if (w[i] !== motif[i]) return false; }
          else if (essayees[w[i]]) return false; // une lettre déjà jouée serait déjà affichée
        }
        for (var L in fausses) if (w.indexOf(L) !== -1) return false;
        return true;
      });
      if (cand.length) {
        // la catégorie aide : les mots du thème comptent triple
        var compte = {};
        cand.forEach(function (x) {
          var p = x.cat && x.cat === vue.cat ? 3 : 1, vu = {};
          for (var i = 0; i < x.w.length; i++) {
            var c = x.w[i];
            if (!motif[i] && !vu[c]) { vu[c] = true; compte[c] = (compte[c] || 0) + p; }
          }
        });
        var tri = Object.keys(compte).filter(function (c) { return !essayees[c]; })
          .sort(function (a, b) { return compte[b] - compte[a]; });
        if (tri.length) return tri[Math.floor(rnd() * Math.min(P.top, tri.length))];
      }
    }
    return libres[Math.floor(rnd() * Math.min(P.top + 2, libres.length))];
  }

  /* mot secret choisi par l’IA (mode « je choisis le mot ») */
  function motIA(niveau, rnd) {
    rnd = rnd || Math.random;
    var lv = niveau === 'facile' ? 'facile' : (niveau === 'difficile' ? 'difficile' : 'moyen');
    var pool = reserve(lv);
    return pool[Math.floor(rnd() * pool.length)];
  }

  /* ================= outils d’affichage sûrs ================= */

  function ent(x, d) {
    x = Number(x);
    return isFinite(x) ? Math.floor(x) : (d || 0);
  }
  function lettreSure(c) { return /^[A-Z]$/.test(c) ? c : ''; }
  function nomJoueur(s, i) {
    var p = s.players && s.players[i];
    return p ? String(p.name == null ? '' : p.name) : '?';
  }
  function jouer(nom, o) { try { GG.sfx.play(nom, o); } catch (e) {} }
  function vibrer(t) { try { GG.haptic(t); } catch (e) {} }

  var mod = {
    id: 'pendu',
    nom: 'Pendu',
    icone: '🎈',
    niveaux: ['facile', 'moyen', 'difficile'],
    desc: 'Devinez le mot lettre par lettre avant que la montgolfière ne tombe à l’eau ! La catégorie en indice, ou « je choisis le mot, tu devines » entre amis.',
    regles: '<p><strong>🎯 Le but :</strong> deviner le mot caché lettre par lettre. La <strong>catégorie</strong> (Animaux, Cuisine…) est donnée en indice.</p>' +
      '<p><strong>🎈 La montgolfière :</strong> chaque lettre absente la dégonfle un peu et la rapproche des vagues. Le nombre d’<strong>erreurs encore permises</strong> est toujours affiché. Plus d’erreur permise : plouf !</p>' +
      '<p><strong>Comment jouer :</strong> à votre tour, touchez une lettre. Trouvée : +1 point par lettre révélée et vous rejouez. Absente : le tour passe. <strong>+3</strong> à qui termine le mot. 💡 Révéler une lettre coûte une erreur (et ne rapporte rien).</p>' +
      '<p><strong>Les niveaux :</strong> facile = mots très courants et courts, 8 erreurs permises ; moyen = mots courants, 7 ; difficile = vocabulaire plus riche, 6.</p>' +
      '<p><strong>✍️ Je choisis le mot, tu devines :</strong> à partir de 2 joueurs, chacun à son tour écrit un mot secret (les autres ferment les yeux !). Si le mot résiste, son auteur marque 5 points.</p>',
    min: 1, max: 4,
    hotseat: true, hidden: false, netOnly: false,

    create: function (names) {
      return {
        players: names.map(function (n) { return { name: n, score: 0 }; }),
        current: 0,
        round: 1,
        maxRounds: ROUNDS,
        phase: 'setup',      // l’hôte choisit le mode et le niveau
        mode: 'jeu',         // 'jeu' : le jeu choisit ; 'duel' : un joueur choisit
        level: null,
        maxErrors: 8,
        chooser: -1,
        vus: [],
        trouves: 0,
        perdus: 0,
        finished: false
      };
    },

    turnOf: function (state) {
      if (state.phase === 'choose') return state.chooser;
      return (state.phase === 'setup' || state.finished || state.roundOver)
        ? -1 : state.current;
    },
    over: function (state) { return state.finished; },
    scoreOf: function (state, i) { return state.players[i].score; },

    gagnants: function (state) {
      var P = state.players;
      if (P.length === 1) return (state.trouves || 0) * 2 >= state.maxRounds ? [0] : null;
      var max = -1;
      P.forEach(function (p) { max = Math.max(max, p.score); });
      var g = [];
      P.forEach(function (p, i) { if (p.score === max) g.push(i); });
      return g.length === 1 ? g : [];
    },

    summary: function (state) {
      var rows = state.players.map(function (p) { return { n: p.name, s: p.score }; })
        .sort(function (a, b) { return b.s - a.s; });
      var html = '';
      if (state.players.length === 1) {
        html += '<p>🎈 ' + ent(state.trouves) + ' mot' + (state.trouves > 1 ? 's' : '') + ' trouvé' +
          (state.trouves > 1 ? 's' : '') + ' sur ' + ent(state.maxRounds) + '.</p>';
      }
      html += rows.map(function (r) {
        return '<div class="final-line"><span>' + GG.esc(r.n) + '</span><strong>' +
          r.s + ' pts</strong></div>';
      }).join('');
      if (state.players.length > 1) {
        html += '<h1>🏆 ' + rows.filter(function (r) { return r.s === rows[0].s; })
          .map(function (r) { return GG.esc(r.n); }).join(' & ') + '</h1>';
      }
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

    /* le mot secret ne circule jamais vers les autres téléphones
       (en duel, son auteur le voit : il regarde les autres chercher) */
    redact: function (state, viewer) {
      var copy = GG.clone(state);
      if (!(copy.mode === 'duel' && viewer === copy.chooser && copy.phase === 'play')) delete copy.secret;
      delete copy.vus;
      return copy;
    },

    apply: function (state, player, action) {
      if (state.finished) return { ok: false, error: 'Partie terminée.' };
      if (action.t === 'level' || action.t === 'duel') {
        if (state.phase !== 'setup') return { ok: false, error: 'Niveau déjà choisi.' };
        if (player !== 0) return { ok: false, error: 'L’hôte choisit le niveau.' };
        if (action.t === 'duel') {
          if (state.players.length < 2) return { ok: false, error: 'Il faut être au moins deux.' };
          state.mode = 'duel';
          state.level = 'moyen';
          state.maxErrors = 7;
          state.maxRounds = state.players.length * 2;
          state.chooser = 0;
          state.phase = 'choose';
          return { ok: true };
        }
        if (!LEVELS[action.l]) return { ok: false, error: 'Niveau inconnu.' };
        state.mode = 'jeu';
        state.level = action.l;
        state.maxErrors = LEVELS[action.l].lives;
        newRound(state);
        return { ok: true };
      }
      if (action.t === 'choose') {
        if (state.phase !== 'choose') return { ok: false, error: 'Ce n’est pas le moment de choisir un mot.' };
        if (player !== state.chooser) return { ok: false, error: 'Ce n’est pas à vous de choisir le mot.' };
        var w = sansAccents(action.w).replace(/[\s'’-]/g, '');
        if (!/^[A-Z]{3,14}$/.test(w)) return { ok: false, error: 'Un mot de 3 à 14 lettres, sans chiffre ni espace.' };
        var cat = themeDe(action.cat) ? action.cat : '';
        debutManche(state, w, cat);
        state.current = suivant(state, state.chooser);
        return { ok: true };
      }
      if (state.phase === 'setup' || state.phase === 'choose') return { ok: false, error: 'Choisissez d’abord le niveau.' };
      if (action.t === 'next') {
        if (!state.roundOver) return { ok: false, error: 'La manche n’est pas finie.' };
        if (state.round >= state.maxRounds) {
          // dernière manche jouée : fin de partie (le compteur reste à N / N)
          state.finished = true;
          return { ok: true };
        }
        state.round++;
        if (state.mode === 'duel') {
          state.chooser = (state.chooser + 1) % state.players.length;
          state.phase = 'choose';
          state.roundOver = false;
          state.secret = null;
          state.answer = null;
          state.tried = [];
          state.revealed = [];
          state.errors = 0;
          state.lost = false;
          return { ok: true };
        }
        newRound(state);
        state.current = (state.round - 1) % state.players.length;
        return { ok: true };
      }
      if (action.t === 'hint') {
        // indice : révèle une lettre au hasard… au prix d’une erreur
        if (state.roundOver) return { ok: false, error: 'Manche terminée.' };
        if (player !== state.current) return { ok: false, error: 'Ce n’est pas votre tour.' };
        if (state.errors >= state.maxErrors - 1) {
          return { ok: false, error: 'Plus assez d’erreurs permises pour un indice !' };
        }
        var hidden = [];
        for (var h = 0; h < state.secret.length; h++) {
          if (!state.revealed[h] && hidden.indexOf(state.secret[h]) === -1) {
            hidden.push(state.secret[h]);
          }
        }
        if (!hidden.length) return { ok: false, error: 'Tout est déjà révélé.' };
        var pick = hidden[Math.floor(Math.random() * hidden.length)];
        state.errors++; // l’indice coûte une erreur
        if (state.tried.indexOf(pick) === -1) state.tried.push(pick);
        for (var h2 = 0; h2 < state.secret.length; h2++) {
          if (state.secret[h2] === pick) state.revealed[h2] = pick;
        }
        state.indice = pick;
        // pas de points pour une lettre offerte ; le mot peut se terminer sans bonus
        if (state.revealed.every(function (r) { return r; })) finDeManche(state, false);
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
          finDeManche(state, false);
        }
        // lettre trouvée : le joueur rejoue
      } else {
        state.errors++;
        if (state.errors >= state.maxErrors) {
          finDeManche(state, true);
        } else {
          state.current = suivant(state, state.current);
        }
      }
      return { ok: true };
    },

    /* l’ordinateur devine comme un joueur (sans jamais voir le mot), et
       choisit un mot quand c’est son tour de le faire */
    bot: function (state, me, ctx) {
      var niveau = (ctx && ctx.niveau) || state.niveauIA || 'moyen';
      if (state.phase === 'choose') {
        if (state.chooser !== me) return null;
        var x = motIA(niveau);
        return { t: 'choose', w: x.w, cat: x.cat };
      }
      if (state.phase !== 'play' || state.roundOver || state.finished || state.current !== me) return null;
      var L = choixLettre({ revealed: state.revealed, tried: state.tried, cat: state.cat }, niveau);
      return L ? { t: 'letter', l: L } : null;
    },

    render: function (el, ctx) {
      var s = ctx.state;
      if (s.phase === 'setup') { renderAccueil(el, ctx); return; }
      if (s.phase === 'choose') { renderChoix(el, ctx); return; }
      renderJeu(el, ctx);
    },

    _LEVELS: LEVELS, _reserve: reserve, _choixLettre: choixLettre, _NIVEAUX_IA: NIVEAUX_IA // tests
  };

  /* ================= le dessin : la montgolfière ================= */

  var RUSTINES = [[160, 40], [201, 34], [170, 72], [207, 62], [150, 57], [190, 84], [182, 24], [214, 46], [163, 88], [195, 52]];

  /* La scène est faite de CALQUES : le ciel (fixe), les nuages, la mer et
     l’aileron sont des éléments HTML animés par transformations (calculées
     par la carte graphique, fluides même sur un petit téléphone) ; seul le
     petit dessin de la montgolfière est redessiné quand elle change. */
  function vagues(y, amp) {
    var d = 'M0 ' + y + 'q10 -' + amp + ' 20 0';
    for (var x = 20; x < 720; x += 20) d += 't20 0';
    return d + 'V36H0Z';
  }
  var VAGUE1 = vagues(6, 6), VAGUE2 = vagues(14, 5);
  function nuage(rx, ry) {
    return '<svg viewBox="-30 -20 60 30" aria-hidden="true"><ellipse cx="0" cy="0" rx="' + rx + '" ry="' + ry + '"/>' +
      '<ellipse cx="-9" cy="-5" rx="10" ry="8"/><ellipse cx="7" cy="-7" rx="11" ry="9"/></svg>';
  }

  function rustine(i, neuve) {
    var r = RUSTINES[i];
    return '<g transform="translate(' + r[0] + ' ' + r[1] + ') rotate(' + ((i * 37) % 50 - 25) + ')">' +
      '<g class="pdu-rustine' + (neuve ? ' neuve' : '') + '">' +
      '<rect x="-6" y="-4.5" width="12" height="9" rx="2.2"/><path d="M-4 -2.5l3 3M-1 -2.5l-3 3M1.5 -2.5l3 3M4.5 -2.5l-3 3"/></g></g>';
  }
  function pffDe(n) {
    var q = RUSTINES[Math.min(n, RUSTINES.length) - 1];
    return '<g class="pdu-pff" transform="translate(' + q[0] + ' ' + q[1] + ')">' +
      '<circle r="4"/><circle r="3" style="--dx:-14px;--dy:-10px"/><circle r="3.5" style="--dx:14px;--dy:-8px"/><circle r="2.5" style="--dx:2px;--dy:-16px"/></g>';
  }
  function visage(h) {
    var bouche = h === 'joie' || h === 'fete' ? '<path class="pdu-bouche" d="M177.2 109.6q2.8 2.6 5.6 0"/>'
      : h === 'inquiet' ? '<path class="pdu-bouche" d="M177.4 110.6q1.4-1 2.8 0t2.8 0"/>'
        : h === 'panique' ? '<ellipse class="pdu-bouche o" cx="180" cy="110.4" rx="1.6" ry="2"/>'
          : '<path class="pdu-bouche" d="M177.4 111q2.6-2.2 5.2 0"/>';
    var yeux = h === 'plouf' ? '<path class="pdu-oeil x" d="M176.2 105.6l2 2m0-2l-2 2M181.8 105.6l2 2m0-2l-2 2"/>'
      : '<circle class="pdu-oeil" cx="177.8" cy="106.6" r="' + (h === 'panique' ? 1.25 : 0.95) + '"/><circle class="pdu-oeil" cx="182.2" cy="106.6" r="' + (h === 'panique' ? 1.25 : 0.95) + '"/>';
    var goutte = h === 'panique' ? '<path class="pdu-goutte" d="M186.4 102.6q1.3 2 0 2.8q-1.3-.8 0-2.8z"/>' : '';
    return yeux + bouche + goutte;
  }
  /* la géométrie qui dépend des erreurs */
  function geo(etat) {
    var alt = Math.max(0, Math.min(1, etat.alt));
    var g = { sx: 1 - 0.28 * alt, sy: 1 - 0.4 * alt, flamme: 1 - 0.6 * alt, halo: 6 - 4 * alt };
    if (etat.gagne) { g.sx = 1; g.sy = 1; } // mot trouvé : on regonfle !
    // descente en % de la hauteur du calque du ballon (130 unités) : 40 unités au plus
    g.descente = etat.perdu ? 80 : (etat.gagne ? -3 : alt * 30.77);
    g.requin = alt >= 0.5 && !etat.gagne;
    return g;
  }
  function classeScene(etat) {
    return 'pdu-scene' + (etat.perdu ? ' perdu' : '') + (etat.gagne ? ' gagne' : '') +
      (etat.alt >= 0.67 && !etat.perdu && !etat.gagne ? ' danger' : '');
  }

  /* Mise à jour de la scène EN PLACE : le ballon descend en douceur, les
     nuages et les vagues ne sautent jamais (ils ne sont pas recréés). */
  function majScene(sc, etat) {
    var g = geo(etat);
    sc.className = classeScene(etat);
    var ballon = sc.querySelector('.pdu-ballon');
    if (ballon) ballon.style.transform = 'translateY(' + g.descente.toFixed(2) + '%)';
    var env = sc.querySelector('.pdu-enveloppe');
    if (env) {
      env.style.transform = 'scale(' + g.sx.toFixed(3) + ',' + g.sy.toFixed(3) + ')';
      var deja = env.querySelectorAll('.pdu-rustine').length;
      var n = Math.min(etat.n, RUSTINES.length);
      var ajout = '';
      for (var i = deja; i < n; i++) ajout += rustine(i, true);
      if (etat.neuf && etat.n > 0) ajout += pffDe(etat.n);
      if (ajout) {
        env.insertAdjacentHTML('beforeend', ajout);
        setTimeout(function () {
          var vieux = env.querySelectorAll('.pdu-pff');
          for (var k = 0; k < vieux.length; k++) if (vieux[k].parentNode) vieux[k].parentNode.removeChild(vieux[k]);
        }, 1100);
      }
    }
    var fl = sc.querySelector('.pdu-flamme');
    if (fl) fl.style.transform = 'scale(' + g.flamme.toFixed(2) + ')';
    var halo = sc.querySelector('.pdu-halo');
    if (halo) halo.setAttribute('r', g.halo.toFixed(1));
    var vis = sc.querySelector('.pdu-visage');
    if (vis && vis.getAttribute('data-h') !== etat.humeur) {
      vis.innerHTML = visage(etat.humeur);
      vis.setAttribute('data-h', etat.humeur);
    }
    var sec = sc.querySelector('.pdu-sec');
    if (sec && etat.neuf) {
      // relance l’animation sans forcer de mise en page : on alterne deux noms d’animation
      var bis = sec.classList.contains('secousse');
      sec.classList.remove('secousse', 'secousse2');
      sec.classList.add(bis ? 'secousse2' : 'secousse');
    }
    var ail = sc.querySelector('.pdu-aileron');
    if (ail) ail.classList.toggle('visible', g.requin);
    if (etat.perdu && !sc.querySelector('.pdu-bulles')) {
      var mer = sc.querySelector('.pdu-mer');
      if (mer) mer.insertAdjacentHTML('beforebegin', '<div class="pdu-bulles"><span></span><span></span><span></span><span></span></div>');
    }
  }

  function scene(etat) {
    // etat : {alt 0..1, perdu, gagne, n (erreurs), neuf (erreur toute fraîche), humeur}
    var g = geo(etat), alt = Math.max(0, Math.min(1, etat.alt));
    var sx = g.sx, sy = g.sy;
    var rust = '';
    for (var i = 0; i < Math.min(etat.n, RUSTINES.length); i++) rust += rustine(i, etat.neuf && i === etat.n - 1);
    var pff = etat.neuf && etat.n > 0 ? pffDe(etat.n) : '';
    var descente = g.descente;
    if (alt < 0) descente = 0;
    return '<div class="pdu-fond" aria-hidden="true"><svg viewBox="0 0 360 190" preserveAspectRatio="xMidYMax slice">' +
      '<defs><linearGradient id="pdu-ciel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b2466"/><stop offset=".55" stop-color="#5d3aa0"/><stop offset=".85" stop-color="#e0698a"/><stop offset="1" stop-color="#ffb070"/></linearGradient>' +
      '<radialGradient id="pdu-soleil"><stop offset="0" stop-color="#fff3c4"/><stop offset=".55" stop-color="#ffc861"/><stop offset="1" stop-color="#ff8a4c" stop-opacity="0"/></radialGradient></defs>' +
      '<rect x="-200" width="760" height="190" fill="url(#pdu-ciel)"/>' +
      '<g class="pdu-etoiles"><circle cx="30" cy="18" r="1.2"/><circle cx="92" cy="32" r=".9"/><circle cx="312" cy="22" r="1.1"/><circle cx="250" cy="12" r=".8"/><circle cx="60" cy="60" r=".7"/></g>' +
      '<circle cx="300" cy="158" r="44" fill="url(#pdu-soleil)"/></svg></div>' +
      '<div class="pdu-nuage n1">' + nuage(22, 8) + '</div><div class="pdu-nuage n2">' + nuage(17, 6) + '</div>' +
      '<div class="pdu-nuage n3">' + nuage(26, 8) + '</div>' +
      '<div class="pdu-ballon" style="transform:translateY(' + descente.toFixed(2) + '%)"><div class="pdu-sec' + (etat.neuf ? ' secousse' : '') + '">' +
      '<div class="pdu-flotte"><svg class="pdu-svg" viewBox="130 0 100 130" aria-hidden="true">' +
      '<defs><linearGradient id="pdu-toile" x1="138" y1="0" x2="222" y2="0" gradientUnits="userSpaceOnUse">' +
      '<stop offset="0" stop-color="#ff5c8a"/><stop offset=".18" stop-color="#ff5c8a"/><stop offset=".18" stop-color="#ffd24d"/><stop offset=".36" stop-color="#ffd24d"/>' +
      '<stop offset=".36" stop-color="#36d1dc"/><stop offset=".64" stop-color="#36d1dc"/><stop offset=".64" stop-color="#ffd24d"/><stop offset=".82" stop-color="#ffd24d"/>' +
      '<stop offset=".82" stop-color="#ff5c8a"/><stop offset="1" stop-color="#ff5c8a"/></linearGradient>' +
      '<radialGradient id="pdu-volume" cx=".38" cy=".3" r=".75"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#1a0d40" stop-opacity=".45"/></radialGradient>' +
      '<linearGradient id="pdu-osier" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d49a57"/><stop offset="1" stop-color="#8a5526"/></linearGradient></defs>' +
      '<g class="pdu-enveloppe" style="transform:scale(' + sx.toFixed(3) + ',' + sy.toFixed(3) + ')">' +
      '<path d="M180 8C206 8 223 29 223 52C223 74 202 89 193 100H167C158 89 137 74 137 52C137 29 154 8 180 8Z" fill="url(#pdu-toile)"/>' +
      '<path class="pdu-couture" d="M180 8C171 30 169 70 172 100M180 8C189 30 191 70 188 100M180 8V100"/>' +
      '<path d="M180 8C206 8 223 29 223 52C223 74 202 89 193 100H167C158 89 137 74 137 52C137 29 154 8 180 8Z" fill="url(#pdu-volume)"/>' +
      '<ellipse class="pdu-reflet" cx="162" cy="30" rx="6" ry="11" transform="rotate(24 162 30)"/>' +
      rust + pff + '</g>' +
      '<path class="pdu-jupe" d="M167 99H193L190 104H170Z"/>' +
      '<path class="pdu-corde" d="M170 104L171.5 113M190 104L188.5 113M180 104V113"/>' +
      '<circle class="pdu-halo" cx="180" cy="104" r="' + g.halo.toFixed(1) + '"/>' +
      '<path class="pdu-flamme" style="transform:scale(' + g.flamme.toFixed(2) + ')" d="M180 99c-3 3-3.6 6-1.4 8.4c.4-2 1.2-2.6 1.4-3.6c.4 1 1.2 1.6 1.4 3.6C183.6 105 183 102 180 99Z"/>' +
      '<circle class="pdu-tete" cx="180" cy="107.6" r="5.6"/><g class="pdu-visage" data-h="' + etat.humeur + '">' + visage(etat.humeur) + '</g>' +
      '<rect class="pdu-nacelle" x="169" y="111" width="22" height="13" rx="3" fill="url(#pdu-osier)"/>' +
      '<path class="pdu-tresse" d="M169 115.5H191M169 119.5H191M174.5 111V124M180 111V124M185.5 111V124"/>' +
      '</svg></div></div></div>' +
      '<div class="pdu-aileron' + (g.requin ? ' visible' : '') + '"><div class="pdu-aileron-nage">' +
      '<svg viewBox="-1 -16 18 17" aria-hidden="true"><path d="M0 0C4-7 9-13 16-15C13-8 13-4 15 0Z"/></svg></div></div>' +
      (etat.perdu ? '<div class="pdu-bulles"><span></span><span></span><span></span><span></span></div>' : '') +
      '<div class="pdu-mer">' +
      '<svg class="pdu-vague v1" viewBox="0 0 720 36" preserveAspectRatio="none" aria-hidden="true"><path d="' + VAGUE1 + '"/></svg>' +
      '<svg class="pdu-vague v2" viewBox="0 0 720 36" preserveAspectRatio="none" aria-hidden="true"><path d="' + VAGUE2 + '"/></svg>' +
      '</div>';
  }


  function humeur(s, alt) {
    if (s.roundOver) return s.lost ? 'plouf' : 'fete';
    return alt < 0.34 ? 'joie' : (alt < 0.67 ? 'inquiet' : 'panique');
  }

  /* ================= écran de départ ================= */

  function renderAccueil(el, ctx) {
    var s = ctx.state;
    el._pdu = null;
    var multi = s.players.length > 1;
    var mode = multi && el._pduMode === 'duel' ? 'duel' : 'jeu';
    var html = '<div class="pdu-accueil">' +
      '<div class="pdu-scene petite">' + scene({ alt: 0, n: 0, humeur: 'joie' }) + '</div>';
    if (ctx.me !== 0) {
      html += '<p class="waiting">⏳ ' + GG.esc(nomJoueur(s, 0)) + ' choisit le mode de jeu…</p></div>';
      el.innerHTML = html;
      return;
    }
    if (multi) {
      html += '<div class="pdu-modes" role="radiogroup" aria-label="Qui choisit le mot ?">' +
        '<button class="pdu-mode' + (mode === 'jeu' ? ' actif' : '') + '" data-m="jeu" role="radio" aria-checked="' + (mode === 'jeu') + '">' +
        '<span class="pm-ic">🎲</span><span class="pm-t">Le jeu choisit</span><span class="pm-s">mots courants, par thème</span></button>' +
        '<button class="pdu-mode' + (mode === 'duel' ? ' actif' : '') + '" data-m="duel" role="radio" aria-checked="' + (mode === 'duel') + '">' +
        '<span class="pm-ic">✍️</span><span class="pm-t">Je choisis le mot</span><span class="pm-s">…et tu devines !</span></button></div>';
    }
    if (mode === 'jeu') {
      html += '<p class="pdu-titre-choix">Difficulté des mots</p><div class="lvl-btns pdu-lvls">' +
        Object.keys(LEVELS).map(function (l, i) {
          var c = LEVELS[l];
          return '<button class="btn big pdu-lvl" data-lvl="' + l + '" style="--i:' + i + '">' +
            '<span class="pdu-lvl-ic">' + (l === 'facile' ? '😌' : l === 'moyen' ? '🙂' : '😈') + '</span>' +
            '<span class="pdu-lvl-tx"><span>' + c.nom + '</span><small>' + c.sous + ' · ' + c.lives + ' erreurs permises</small></span></button>';
        }).join('') + '</div>';
    } else {
      html += '<p class="hint mini-center pdu-duel-expl">Chacun à son tour écrit un mot secret pour les autres ' +
        '(qui ferment les yeux 🙈). ' + (s.players.length * 2) + ' manches, 7 erreurs permises. ' +
        'Si le mot résiste, son auteur marque 5 points !</p>' +
        '<button class="btn big primary" data-a="duel">✍️ C’est parti !</button>';
    }
    html += '</div>';
    el.innerHTML = html;
    var pris = false;
    el.querySelectorAll('.pdu-mode').forEach(function (b) {
      b.addEventListener('click', function () {
        el._pduMode = b.getAttribute('data-m');
        jouer('toggle');
        vibrer('select');
        renderAccueil(el, ctx);
      });
    });
    el.querySelectorAll('[data-lvl]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (pris) return;
        pris = true;
        jouer('select');
        if (ctx.act({ t: 'level', l: b.getAttribute('data-lvl') }) === false) pris = false;
      });
    });
    var bd = el.querySelector('[data-a="duel"]');
    if (bd) {
      bd.addEventListener('click', function () {
        if (pris) return;
        pris = true;
        jouer('select');
        if (ctx.act({ t: 'duel' }) === false) pris = false;
      });
    }
  }

  /* ================= « je choisis le mot » ================= */

  function renderChoix(el, ctx) {
    var s = ctx.state;
    var ch = ent(s.chooser, 0);
    var html = '<div class="pdu-choix">' +
      '<p class="pdu-manche">Manche ' + Math.min(ent(s.round, 1), ent(s.maxRounds, 1)) + ' / ' + ent(s.maxRounds, 1) + '</p>';
    if (ctx.me !== ch) {
      html += '<div class="pdu-scene petite">' + scene({ alt: 0, n: 0, humeur: 'inquiet' }) + '</div>' +
        '<p class="waiting">✍️ ' + GG.esc(nomJoueur(s, ch)) + ' choisit un mot secret…</p></div>';
      el.innerHTML = html;
      el._pdu = null;
      return;
    }
    var autres = s.players.map(function (p, i) { return i === ch ? null : GG.esc(p.name); })
      .filter(function (x) { return x; }).join(', ');
    var cats = themes();
    var catSel = el._pduCat || '';
    html += '<p class="pdu-choix-t">✍️ ' + GG.esc(nomJoueur(s, ch)) + ', écris un mot secret</p>' +
      '<p class="pdu-cache">🙈 ' + autres + ' : ne regardez pas l’écran !</p>' +
      '<div class="pdu-saisie"><input id="pdu-mot" type="password" maxlength="14" autocomplete="off" autocorrect="off" ' +
      'autocapitalize="characters" spellcheck="false" placeholder="Ton mot (3 à 14 lettres)" aria-label="Mot secret">' +
      '<button class="pdu-oeil-btn" data-a="voir" aria-label="Afficher le mot">👁️</button></div>' +
      '<p class="pdu-titre-choix">Catégorie donnée en indice</p><div class="pdu-cats">' +
      '<button class="pdu-cat' + (catSel === '' ? ' actif' : '') + '" data-cat="">❔ Sans indice</button>' +
      cats.map(function (t) {
        return '<button class="pdu-cat' + (catSel === t.id ? ' actif' : '') + '" data-cat="' + GG.esc(t.id) + '">' +
          t.ic + ' ' + GG.esc(t.nom) + '</button>';
      }).join('') + '</div>' +
      '<p class="pdu-msg erreur" id="pdu-err" aria-live="polite"></p>' +
      '<button class="btn big primary" id="pdu-valider">🔒 Cacher le mot</button></div>';
    el.innerHTML = html;
    el._pdu = null;
    var inp = el.querySelector('#pdu-mot');
    el.querySelectorAll('.pdu-cat').forEach(function (b) {
      b.addEventListener('click', function () {
        el._pduCat = b.getAttribute('data-cat');
        el.querySelectorAll('.pdu-cat').forEach(function (x) { x.classList.toggle('actif', x === b); });
        jouer('tap');
      });
    });
    el.querySelector('[data-a="voir"]').addEventListener('click', function () {
      inp.type = inp.type === 'password' ? 'text' : 'password';
      jouer('toggle');
    });
    var envoye = false;
    function valider() {
      if (envoye) return;
      var w = sansAccents(inp.value).replace(/[\s'’-]/g, '');
      var err = el.querySelector('#pdu-err');
      if (!/^[A-Z]{3,14}$/.test(w)) {
        err.textContent = 'Un mot de 3 à 14 lettres, sans chiffre ni espace.';
        jouer('wrong');
        vibrer('error');
        try { GG.fx.shake(inp); } catch (e) {}
        return;
      }
      envoye = true;
      jouer('reveal');
      var cat = el._pduCat || '';
      el._pduCat = '';
      if (ctx.act({ t: 'choose', w: w, cat: cat }) === false) envoye = false;
    }
    el.querySelector('#pdu-valider').addEventListener('click', valider);
    inp.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') valider(); });
  }

  /* ================= la partie ================= */

  function renderJeu(el, ctx) {
    var s = ctx.state;
    var P = Array.isArray(s.players) ? s.players : [];
    var multi = P.length > 1;
    var maxE = Math.max(1, ent(s.maxErrors, 8));
    var errs = Math.max(0, Math.min(maxE, ent(s.errors)));
    var reste = maxE - errs;
    var alt = errs / maxE;
    var revealed = Array.isArray(s.revealed) ? s.revealed : [];
    var tried = (Array.isArray(s.tried) ? s.tried : []).map(lettreSure).filter(function (x) { return x; });
    var answer = String(s.answer || '');
    var mine = ctx.me === s.current && !s.roundOver && !s.finished;
    var cle = ent(s.roundTs) + ':' + ent(s.round);
    var now = Date.now();

    // ce qui vient de changer : animé une seule fois
    var v = el._pdu;
    var neuf = false, nouvelles = [], nouvelleFausse = '';
    if (!v || v.cle !== cle) {
      if (ent(s.round) === 1 && !tried.length) { try { if ((root.scrollY || 0) > 0) root.scrollTo(0, 0); } catch (e) {} }
      v = el._pdu = { cle: cle, errs: errs, tried: tried.slice(), rev: revealed.map(function (r) { return lettreSure(r); }).join(','),
        arme: now + 400, fin: !!s.roundOver, entree: true };
    } else {
      v.entree = false;
      if (errs > v.errs) neuf = true;
      tried.forEach(function (L) { if (v.tried.indexOf(L) === -1) { if (revealed.indexOf(L) === -1) nouvelleFausse = L; } });
      var ancien = v.rev.split(',');
      revealed.forEach(function (r, i) { if (lettreSure(r) && !ancien[i]) nouvelles.push(i); });
      // la lettre envoyée a été jouée : on peut taper la suivante tout de suite
      // (le garde-fou de 250 ms ne sert qu'en attendant la réponse de l'hôte)
      if (tried.length > v.tried.length) v.envoi = 0;
      v.errs = errs;
      v.tried = tried.slice();
      v.rev = revealed.map(function (r) { return lettreSure(r); }).join(',');
    }
    if (mine && v.dernierTour !== s.current) v.arme = Math.max(v.arme || 0, now + 350);
    v.dernierTour = mine ? s.current : -1;
    var finNouvelle = s.roundOver && !v.fin;
    v.fin = !!s.roundOver;

    var th = themeDe(s.cat);
    var html = '<div class="pdu-barre">' +
      '<span class="pdu-pill">Manche ' + Math.min(ent(s.round, 1), ent(s.maxRounds, 1)) + ' / ' + ent(s.maxRounds, 1) + '</span>' +
      '<span class="pdu-pill pdu-cat-pill">' + (th ? th.ic + ' ' + GG.esc(th.nom) : '❔ Sans indice') + '</span>' +
      '<span class="pdu-barre-esp"></span>' +
      (mine && errs < maxE - 1 ? '<button class="pdu-ic" data-a="hint" aria-label="Révéler une lettre (coûte une erreur)" title="Révéler une lettre (coûte une erreur)">💡</button>' : '') +
      '</div>';
    var etatScene = { alt: alt, n: errs, neuf: neuf, perdu: !!(s.roundOver && s.lost), gagne: !!(s.roundOver && !s.lost), humeur: humeur(s, alt) };
    var haut = html;
    html = '';
    // les erreurs restantes : en toutes lettres + pastilles
    var pips = '';
    for (var i = 0; i < maxE; i++) pips += '<span class="pdu-pip' + (i < reste ? '' : ' creve') + '"></span>';
    html += '<div class="pdu-vies" role="status" aria-label="Encore ' + reste + ' erreur' + (reste > 1 ? 's' : '') + ' permise' + (reste > 1 ? 's' : '') + '">' +
      '<span class="pdu-vies-tx">' + (s.roundOver && s.lost ? '💦 Plus d’erreur permise'
        : (reste === 1 ? '⚠️ Dernière erreur permise !' : 'Encore <strong>' + reste + '</strong> erreurs permises')) + '</span>' +
      '<span class="pdu-pips" aria-hidden="true">' + pips + '</span></div>';
    // le mot
    var n = revealed.length;
    html += '<div class="pdu-mot" style="--n:' + Math.max(1, n) + '">';
    for (var k = 0; k < n; k++) {
      var r = lettreSure(revealed[k]);
      var fin = s.roundOver ? lettreSure(answer.charAt(k)) : '';
      var cls = 'pdu-slot' + (r ? ' ok' : (fin ? ' manque' : '')) + (nouvelles.indexOf(k) !== -1 ? ' nouveau' : '');
      html += '<span class="' + cls + '" data-i="' + k + '" style="--i:' + k + '"><span>' + (r || fin || '') + '</span></span>';
    }
    html += '</div>';
    if (s.roundOver) {
      html += '<div class="pdu-fin">' +
        '<p class="pdu-verdict ' + (s.lost ? 'perdu' : 'gagne') + '">' +
        (s.lost ? '💦 Plouf ! Le mot était <strong>' + GG.esc(answer.replace(/[^A-Z]/g, '')) + '</strong>'
          : '🎉 Trouvé ! <strong>' + GG.esc(answer.replace(/[^A-Z]/g, '')) + '</strong>') + '</p>';
      if (multi) {
        html += '<div class="pdu-scores">' + P.map(function (p, i) {
          return '<span class="pdu-score" style="--c:' + PCOLORS[i % 4] + '">' + GG.esc(p.name) + ' <strong>' + ent(p.score) + '</strong></span>';
        }).join('') + '</div>';
      }
      if (!s.finished) {
        html += '<button class="btn big primary" data-a="next" id="pdu-next">' +
          (ent(s.round) >= ent(s.maxRounds) ? 'Voir les scores' : (s.mode === 'duel' ? 'Manche suivante' : 'Mot suivant')) + '</button>';
      }
      html += '</div>';
    } else {
      html += '<p class="pdu-msg">' + (mine ? (multi ? 'À vous : touchez une lettre !' : 'Touchez une lettre !')
        : (/^🤖/.test(nomJoueur(s, s.current)) ? '' : '⏳ ') + 'Au tour de <strong>' + GG.esc(nomJoueur(s, s.current)) + '</strong>…') + '</p>';
      // en duel, l’auteur du mot (sur son propre téléphone) le voit et regarde les autres chercher
      if (s.mode === 'duel' && ctx.me === s.chooser && typeof s.secret === 'string') {
        html += '<p class="pdu-monmot">🔒 Votre mot : <strong>' + GG.esc(s.secret.replace(/[^A-Z]/g, '')) + '</strong></p>';
      }
      html += '<div class="pdu-kb' + (mine ? '' : ' attente') + '">';
      ['AZERTYUIOP', 'QSDFGHJKLM', 'WXCVBN'].forEach(function (rang) {
        html += '<div class="pdu-kr">';
        rang.split('').forEach(function (L) {
          var joue = tried.indexOf(L) !== -1;
          var bon = joue && revealed.indexOf(L) !== -1;
          html += '<button class="pdu-key' + (joue ? (bon ? ' bon' : ' faux') : '') + (L === nouvelleFausse ? ' eclate' : '') +
            '" data-l="' + L + '"' + (joue || !mine ? ' disabled' : '') + ' aria-label="' + L + (joue ? (bon ? ', trouvée' : ', absente') : '') + '">' +
            L + '</button>';
        });
        html += '</div>';
      });
      html += '</div>';
    }
    // la scène est construite une fois par manche, puis mise à jour en place
    var jeu = el.querySelector('.pdu-jeu');
    var sc = jeu && jeu.querySelector('.pdu-scene');
    if (!jeu || !sc || jeu.getAttribute('data-cle') !== cle) {
      el.innerHTML = '<div class="pdu-jeu" data-cle="' + GG.esc(cle) + '"><div class="pdu-haut"></div>' +
        '<div class="' + classeScene(etatScene) + '">' + scene(etatScene) + '</div><div class="pdu-bas"></div></div>';
      jeu = el.querySelector('.pdu-jeu');
    } else {
      majScene(sc, etatScene);
    }
    jeu.className = 'pdu-jeu' + (s.roundOver ? ' fini' + (s.lost ? ' perdu' : '') : '');
    jeu.querySelector('.pdu-haut').innerHTML = haut;
    jeu.querySelector('.pdu-bas').innerHTML = html;

    // ---- effets de ce qui vient de changer ----
    if (nouvelles.length) {
      var depuis = v.depuis;
      v.depuis = null;
      jouer('correct', { pitch: 1 + Math.min(4, nouvelles.length - 1) * 0.08 });
      vibrer('success');
      nouvelles.forEach(function (i, k) {
        var slot = el.querySelector('.pdu-slot[data-i="' + i + '"]');
        if (!slot) return;
        if (depuis) {
          try { GG.fx.flyTo(depuis, slot, { html: '<span class="pdu-vol">' + GG.esc(revealed[i]) + '</span>', duration: 420 + k * 70, arc: 0.3 }); } catch (e) {}
        }
      });
    }
    if (neuf && !s.roundOver) {
      jouer('wrong');
      vibrer('warning');
      var cle2 = el.querySelector('.pdu-key.eclate');
      if (cle2) { try { GG.fx.burst(cle2, { count: 10, shape: 'spark', colors: ['#ff4d5e', '#ffc23d'], size: 0.6 }); } catch (e) {} }
    }
    if (finNouvelle) {
      var sc = el.querySelector('.pdu-scene');
      if (s.lost) {
        setTimeout(function () {
          jouer('splash');
          vibrer('heavy');
          if (sc && sc.isConnected) {
            var rr = sc.getBoundingClientRect();
            try { GG.fx.burst({ x: rr.left + rr.width / 2, y: rr.top + rr.height * 0.84 }, { count: 22, shape: 'circle', colors: ['#7fd3ff', '#ffffff', '#2c8fe6'] }); } catch (e) {}
          }
        }, 650);
      } else {
        jouer('success');
        vibrer('success');
        if (sc) { try { GG.fx.burst(sc, { count: 24, shape: 'star', colors: ['#ffd24d', '#36d1dc', '#ff5c8a'] }); } catch (e) {} }
      }
    }

    // ---- gestes ----
    el.querySelectorAll('.pdu-key').forEach(function (k) {
      k.addEventListener('click', function () {
        if (!mine || k.disabled) return;
        if (Date.now() < (v.arme || 0)) return; // anti double-appui (bouton « Mot suivant » au même endroit)
        if (v.envoi && Date.now() - v.envoi < 250) return;
        v.envoi = Date.now();
        var r = k.getBoundingClientRect();
        v.depuis = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        jouer('tap', { volume: 0.5 });
        if (ctx.act({ t: 'letter', l: k.getAttribute('data-l') }) === false) { v.envoi = 0; v.depuis = null; }
      });
    });
    var next = el.querySelector('[data-a="next"]');
    if (next) {
      var armeLe = Date.now() + (finNouvelle ? 700 : 400);
      next.addEventListener('click', function () {
        if (Date.now() < armeLe || next.disabled) return;
        next.disabled = true;
        jouer('whoosh');
        if (ctx.act({ t: 'next' }) === false) next.disabled = false;
      });
    }
    var hintBtn = el.querySelector('[data-a="hint"]');
    if (hintBtn) {
      hintBtn.addEventListener('click', function () {
        if (hintBtn.disabled || Date.now() < (v.arme || 0)) return;
        hintBtn.disabled = true;
        jouer('reveal');
        if (ctx.act({ t: 'hint' }) === false) hintBtn.disabled = false;
      });
    }
  }

  GG.register(mod);
  if (typeof module === 'object' && module.exports) module.exports = mod;
})(typeof self !== 'undefined' ? self : globalThis);
