/*
 * GGgames — Bonbons (jeu d'alignements type match-3, 1 à 4 joueurs).
 * Alignez 3 bonbons pour les croquer. 4 alignés = bonbon rayé (raye toute
 * une ligne), 5 alignés = sucre magique (croque toute une couleur). En
 * réseau : même grille de départ pour tous, meilleur score au bout des
 * coups impartis.
 */
(function (root) {
  'use strict';
  var GG = root.GG;
  var N = 8; // grille 8×8
  var EMOJIS = ['🍬', '🍭', '🍫', '🍩', '🧁', '🍪'];
  var LEVELS = {
    facile: { nom: 'Facile', types: 5, coups: 25, cible: 1500 },
    moyen: { nom: 'Moyen', types: 6, coups: 20, cible: 1800 },
    difficile: { nom: 'Difficile', types: 6, coups: 14, cible: 2000 }
  };
  var ARC = -1; // sucre magique (joker de couleur)

  function cell(t) { return { t: t, s: 0 }; } // s : 0 normal, 1 raye la ligne, 2 raye la colonne

  /* Grille de départ SANS alignement déjà formé (sinon points gratuits). */
  function buildBoard(types) {
    var b = new Array(N * N);
    for (var i = 0; i < N * N; i++) {
      var t;
      var guard = 0;
      do {
        t = Math.floor(Math.random() * types);
        guard++;
      } while (guard < 20 && createsRun(b, i, t));
      b[i] = cell(t);
    }
    return b;
  }

  function createsRun(b, i, t) {
    var r = Math.floor(i / N), c = i % N;
    if (c >= 2 && b[i - 1] && b[i - 2] && b[i - 1].t === t && b[i - 2].t === t) return true;
    if (r >= 2 && b[i - N] && b[i - 2 * N] && b[i - N].t === t && b[i - 2 * N].t === t) return true;
    return false;
  }

  /* Trouve tous les alignements de 3+ ; renvoie les séries (listes d'indices). */
  function findRuns(b) {
    var runs = [], r, c, i, start, t;
    for (r = 0; r < N; r++) {
      c = 0;
      while (c < N) {
        i = r * N + c;
        t = b[i] ? b[i].t : ARC;
        start = c;
        while (c < N && b[r * N + c] && b[r * N + c].t === t && t !== ARC) c++;
        if (t !== ARC && c - start >= 3) {
          var run = { cells: [], dir: 'h' };
          for (var k = start; k < c; k++) run.cells.push(r * N + k);
          runs.push(run);
        }
        if (c === start) c++;
      }
    }
    for (c = 0; c < N; c++) {
      r = 0;
      while (r < N) {
        i = r * N + c;
        t = b[i] ? b[i].t : ARC;
        start = r;
        while (r < N && b[r * N + c] && b[r * N + c].t === t && t !== ARC) r++;
        if (t !== ARC && r - start >= 3) {
          var run2 = { cells: [], dir: 'v' };
          for (var k2 = start; k2 < r; k2++) run2.cells.push(k2 * N + c);
          runs.push(run2);
        }
        if (r === start) r++;
      }
    }
    return runs;
  }

  /* Étend l'ensemble à effacer : un bonbon rayé emporte sa ligne/colonne.
     fx (optionnel) mémorise les rayons déclenchés pour les animations. */
  function spread(b, marks, fx) {
    var changed = true;
    while (changed) {
      changed = false;
      for (var i = 0; i < N * N; i++) {
        if (!marks[i] || !b[i]) continue;
        var r = Math.floor(i / N), c = i % N, k;
        if (b[i].s === 1) {
          b[i].s = 0;
          if (fx && fx.rows.indexOf(r) === -1) fx.rows.push(r);
          for (k = 0; k < N; k++) if (!marks[r * N + k]) { marks[r * N + k] = true; changed = true; }
        } else if (b[i].s === 2) {
          b[i].s = 0;
          if (fx && fx.cols.indexOf(c) === -1) fx.cols.push(c);
          for (k = 0; k < N; k++) if (!marks[k * N + c]) { marks[k * N + c] = true; changed = true; }
        }
      }
    }
  }

  /* Fait tomber les bonbons et en fait pleuvoir de nouveaux. */
  function drop(b, types) {
    for (var c = 0; c < N; c++) {
      var write = N - 1;
      for (var r = N - 1; r >= 0; r--) {
        if (b[r * N + c]) { b[write * N + c] = b[r * N + c]; write--; }
      }
      while (write >= 0) {
        b[write * N + c] = cell(Math.floor(Math.random() * types));
        write--;
      }
    }
  }

  /* Résout tous les alignements en cascade ; renvoie les points gagnés.
     swapIdx : la case échangée (elle devient le bonbon rayé du 4-aligné). */
  function resolve(b, types, swapIdx, fx) {
    var total = 0, combo = 0, maxCombo = 0;
    for (var guard = 0; guard < 30; guard++) {
      var runs = findRuns(b);
      if (!runs.length) break;
      combo++;
      maxCombo = combo;
      var marks = {};
      var promote = []; // cases qui deviennent des bonbons spéciaux
      runs.forEach(function (run) {
        var pivot = run.cells.indexOf(swapIdx) !== -1 ? swapIdx
          : run.cells[Math.floor(run.cells.length / 2)];
        if (run.cells.length >= 5) {
          promote.push({ i: pivot, arc: true });
        } else if (run.cells.length === 4) {
          // aligné horizontalement → raye la colonne, et inversement
          promote.push({ i: pivot, s: run.dir === 'h' ? 2 : 1, t: b[pivot].t });
        }
        run.cells.forEach(function (i) { marks[i] = true; });
      });
      spread(b, marks, fx);
      var cleared = 0;
      for (var i = 0; i < N * N; i++) {
        if (marks[i]) { b[i] = null; cleared++; }
      }
      promote.forEach(function (p) {
        if (p.arc) b[p.i] = { t: ARC, s: 0 };
        else b[p.i] = { t: p.t, s: p.s };
      });
      total += cleared * 10 * combo;
      drop(b, types);
      swapIdx = -1; // les cascades suivantes n'ont plus de case « pivot »
    }
    return { pts: total, combo: maxCombo };
  }

  /* Croque toute une couleur (échange avec un sucre magique). */
  function eatColor(b, types, t, fx) {
    var marks = {};
    for (var i = 0; i < N * N; i++) {
      if (b[i] && (b[i].t === t || b[i].t === ARC)) marks[i] = true;
    }
    spread(b, marks, fx);
    var cleared = 0;
    for (var j = 0; j < N * N; j++) if (marks[j]) { b[j] = null; cleared++; }
    drop(b, types);
    return cleared * 15;
  }

  function adjacent(a, b2) {
    var ra = Math.floor(a / N), ca = a % N, rb = Math.floor(b2 / N), cb = b2 % N;
    return (ra === rb && Math.abs(ca - cb) === 1) || (ca === cb && Math.abs(ra - rb) === 1);
  }

  function wouldMatch(b, a, b2) {
    var tmp = b[a]; b[a] = b[b2]; b[b2] = tmp;
    var ok = findRuns(b).length > 0;
    tmp = b[a]; b[a] = b[b2]; b[b2] = tmp;
    return ok;
  }

  /* Reste-t-il au moins un échange jouable ? (un sucre magique suffit) */
  function hasMove(b) {
    for (var i = 0; i < N * N; i++) {
      if (b[i].t === ARC) return true;
      var c = i % N;
      if (c < N - 1 && wouldMatch(b, i, i + 1)) return true;
      if (i < N * (N - 1) && wouldMatch(b, i, i + N)) return true;
    }
    return false;
  }

  /* Grille morte (aucun coup) : on ressert des bonbons frais, score conservé. */
  function ensurePlayable(b, types) {
    var guard = 0;
    while (!hasMove(b) && guard++ < 20) {
      var fresh = buildBoard(types);
      for (var i = 0; i < N * N; i++) b[i] = fresh[i];
    }
  }

  function allDone(state) {
    return state.players.every(function (p) { return p.moves <= 0; });
  }

  function stars(score, cible) {
    if (score >= cible * 1.9) return 3;
    if (score >= cible * 1.4) return 2;
    if (score >= cible) return 1;
    return 0;
  }

  function starsTxt(n) { return n ? '⭐⭐⭐'.slice(0, n * 2) : '—'; }

  /* ===== mode aventure solo : niveaux infinis ===== */
  var ZONES = ['Prairie Guimauve', 'Forêt Chocolat', 'Lagon Réglisse',
    'Montagne Meringue', 'Désert Caramel', 'Volcan Praline',
    'Banquise Menthe', 'Cité Nougat'];
  var ZONE_ICONS = ['🌸', '🌲', '🌊', '🏔️', '🏜️', '🌋', '❄️', '🏰'];

  function zoneOf(lvl) { return Math.floor((lvl - 1) / 10) % ZONES.length; }

  /* Réglage du niveau n : déterministe, de plus en plus corsé, sans fin. */
  function levelCfg(n) {
    var coups = [24, 22, 20, 18, 16][(n - 1) % 5];
    if (n % 7 === 0) coups -= 2;               // niveau « boss » plus serré
    if (coups < 12) coups = 12;
    var types = n < 5 ? 5 : (n % 3 === 0 ? 6 : 5);
    var parCoup = 55 + Math.min(105, n * 2);   // exigence par coup, plafonnée
    return { types: types, coups: coups, cible: Math.round(coups * parCoup / 10) * 10 };
  }

  /* Progression sur ce téléphone : niveau atteint, étoiles et records. */
  function loadProg() {
    try {
      var d = JSON.parse(localStorage.getItem('gg-bonbons-map') || 'null');
      if (d && d.lvl >= 1) return d;
    } catch (e) {}
    return { lvl: 1, stars: {}, best: {} };
  }

  function saveProg(d) {
    try { localStorage.setItem('gg-bonbons-map', JSON.stringify(d)); } catch (e) {}
  }

  var mod = {
    id: 'bonbons',
    nom: 'Bonbons',
    icone: '🍬',
    desc: 'L’aventure sucrée : des niveaux sans fin, des mondes acidulés, cascades et bonbons magiques !',
    regles: '<p><strong>🎯 Le but :</strong> atteindre l’objectif de points du niveau avant d’épuiser vos coups — chaque niveau réussi (jusqu’à ⭐⭐⭐) débloque le suivant, la carte est sans fin et votre progression est enregistrée.</p>' +
      '<p><strong>Comment jouer :</strong> glissez un bonbon vers son voisin pour les échanger — l’échange doit former un alignement d’au moins 3 bonbons identiques, qui sont croqués. Les bonbons du dessus tombent, il en pleut de nouveaux : les cascades rapportent de plus en plus (×2, ×3…).</p>' +
      '<p><strong>🍭 Les spéciaux :</strong> 4 alignés = un <strong>bonbon rayé</strong> qui raye toute une ligne quand on le croque · 5 alignés = un <strong>sucre magique</strong> 🌟 : échangez-le avec n’importe quel bonbon pour croquer toute sa couleur !</p>' +
      '<p><strong>👥 À plusieurs :</strong> course sur la même grille de départ, même nombre de coups — le meilleur score gagne.</p>',
    min: 1, max: 4,
    hotseat: true, hotseatMax: 1, hidden: false, netOnly: false,

    create: function (names) {
      return {
        players: names.map(function (n) {
          return { name: n, board: null, score: 0, moves: 0, lastGain: 0, lastCombo: 0 };
        }),
        phase: 'setup',
        level: null,
        solo: false,
        soloLvl: 0,
        types: 0,
        cible: 0,
        coups: 0,
        startTs: 0,
        finished: false
      };
    },

    turnOf: function (state) { return state.phase === 'setup' ? 0 : -1; },
    over: function (state) { return state.finished; },
    scoreOf: function (state, i) { return state.players[i].score; },

    summary: function (state) {
      var rows = state.players.map(function (p) { return { n: p.name, s: p.score }; })
        .sort(function (a, b) { return b.s - a.s; });
      var html = rows.map(function (r) {
        return '<div class="final-line"><span>' + GG.esc(r.n) + '</span><strong>' +
          r.s + ' pts · ' + starsTxt(stars(r.s, state.cible)) + '</strong></div>';
      }).join('');
      html += '<p>🎯 Objectif : ' + state.cible + ' pts (⭐) · niveau ' +
        (LEVELS[state.level] ? LEVELS[state.level].nom : '') + '</p>';
      if (state.players.length === 1) {
        try {
          if (typeof localStorage !== 'undefined') {
            var key = 'gg-bonbons-best-' + state.level;
            var best = JSON.parse(localStorage.getItem(key) || 'null');
            var cur = { score: state.players[0].score, ts: state.startTs };
            if (!best || cur.score > best.score) localStorage.setItem(key, JSON.stringify(cur));
            var stored = JSON.parse(localStorage.getItem(key) || 'null');
            if (stored && stored.ts === state.startTs) html += '<h1>🏆 Nouveau record !</h1>';
            else if (stored) html += '<p>🏅 Record : ' + stored.score + ' pts.</p>';
          }
        } catch (e) {}
      } else {
        var top = rows.filter(function (r) { return r.s === rows[0].s; });
        html += '<h1>🏆 ' + top.map(function (r) { return GG.esc(r.n); }).join(' & ') + '</h1>';
      }
      return html;
    },

    /* Rien de secret : les grilles adverses sont publiques (course au score). */
    redact: function (state) { return GG.clone(state); },

    apply: function (state, player, action) {
      if (state.finished) return { ok: false, error: 'Partie terminée.' };
      var p = state.players[player];
      if (!p) return { ok: false, error: 'Joueur inconnu.' };

      if (action.t === 'level') {
        if (state.phase !== 'setup') return { ok: false, error: 'Niveau déjà choisi.' };
        if (player !== 0) return { ok: false, error: 'L’hôte choisit le niveau.' };
        var cfg = LEVELS[action.l];
        if (!cfg) return { ok: false, error: 'Niveau inconnu.' };
        var base = buildBoard(cfg.types);
        ensurePlayable(base, cfg.types);
        state.players.forEach(function (q) {
          q.board = GG.clone(base);
          q.moves = cfg.coups;
          q.score = 0;
        });
        state.level = action.l;
        state.types = cfg.types;
        state.cible = cfg.cible;
        state.phase = 'play';
        state.startTs = Date.now();
        return { ok: true };
      }

      if (action.t === 'start') {
        // aventure solo : la carte des niveaux, sur ce téléphone uniquement
        if (state.players.length !== 1) return { ok: false, error: 'Les niveaux se jouent en solo.' };
        if (state.phase !== 'setup' && state.phase !== 'result') {
          return { ok: false, error: 'Un niveau est déjà en cours.' };
        }
        var lvl = action.lvl | 0;
        if (lvl < 1) return { ok: false, error: 'Niveau inconnu.' };
        var lc = levelCfg(lvl);
        var lb = buildBoard(lc.types);
        ensurePlayable(lb, lc.types);
        state.solo = true;
        state.soloLvl = lvl;
        state.types = lc.types;
        state.cible = lc.cible;
        state.coups = lc.coups;
        state.level = 'aventure';
        p.board = lb;
        p.moves = lc.coups;
        p.score = 0;
        p.lastGain = 0;
        p.lastCombo = 0;
        state.phase = 'play';
        state.startTs = Date.now();
        return { ok: true };
      }
      if (action.t === 'backmap') {
        if (!state.solo || state.phase !== 'result') return { ok: false, error: 'Rien à quitter.' };
        state.phase = 'setup';
        return { ok: true };
      }
      if (state.phase !== 'play') return { ok: false, error: 'La partie n’a pas commencé.' };
      if (action.t === 'swap') {
        if (p.moves <= 0) return { ok: false, error: 'Plus de coups — on attend les autres.' };
        var a = action.a | 0, b2 = action.b | 0;
        if (a < 0 || a >= N * N || b2 < 0 || b2 >= N * N || !adjacent(a, b2)) {
          return { ok: false, error: 'Échangez deux bonbons voisins.' };
        }
        var b = p.board;
        var gain = 0, combo = 1;
        // rapport d'effets du coup : le rendu s'en sert pour les explosions
        var fx = { rows: [], cols: [], arc: 0, wipe: false, at: b2 };
        if (b[a].t === ARC || b[b2].t === ARC) {
          var other = b[a].t === ARC ? b[b2].t : b[a].t;
          if (other === ARC) {
            // deux sucres magiques échangés : toute la grille est croquée !
            for (var i = 0; i < N * N; i++) b[i] = null;
            drop(b, state.types);
            gain = N * N * 15;
            fx.wipe = true;
          } else {
            // le sucre magique croque toute la couleur de son voisin
            b[b[a].t === ARC ? a : b2] = null;
            drop(b, state.types);
            gain = eatColor(b, state.types, other, fx);
            fx.arc = Math.round(gain / 15);
          }
        } else {
          if (!wouldMatch(b, a, b2)) {
            return { ok: false, error: 'Cet échange ne forme aucun alignement.' };
          }
          var tmp = b[a]; b[a] = b[b2]; b[b2] = tmp;
          var res = resolve(b, state.types, b2, fx);
          gain = res.pts;
          combo = res.combo;
        }
        fx.combo = combo;
        p.fx = fx;
        p.score += gain;
        p.lastGain = gain;
        p.lastCombo = combo;
        p.moves--;
        if (p.moves > 0) ensurePlayable(b, state.types);
        if (state.solo) {
          if (p.moves <= 0) state.phase = 'result';
        } else if (allDone(state)) {
          state.finished = true;
        }
        return { ok: true };
      }

      return { ok: false, error: 'Action inconnue.' };
    },

    /* ===== la carte de l'aventure (solo) ===== */
    _renderMap: function (el, ctx) {
      var prog = loadProg();
      var totalStars = 0, k;
      for (k in prog.stars) totalStars += prog.stars[k];
      var from = Math.max(1, prog.lvl - 20);
      var to = prog.lvl + 4;
      var html = '<div class="bb-map">' +
        '<p class="mini-msg big-msg">🍬 L’Aventure Sucrée</p>' +
        '<div class="mem-stats"><span class="mem-stat">Niveau ' + prog.lvl + '</span>' +
        '<span class="mem-stat">⭐ ' + totalStars + '</span></div>';
      if (from > 1) {
        html += '<div class="bb-earlier">✓ Niveaux 1 à ' + (from - 1) + ' terminés</div>';
      }
      var lastZone = -1;
      html += '<div class="bb-path">';
      for (var lvl = from; lvl <= to; lvl++) {
        var z = zoneOf(lvl);
        if (z !== lastZone || (lvl - 1) % 10 === 0 && lvl === from) {
          if ((lvl - 1) % 10 === 0 || lvl === from) {
            html += '<div class="bb-zone z' + z + '">' + ZONE_ICONS[z] + ' ' +
              ZONES[z] + '</div>';
            lastZone = z;
          }
        }
        var st = prog.stars[lvl] || 0;
        var cls = lvl < prog.lvl ? 'done' : lvl === prog.lvl ? 'cur' : 'lock';
        html += '<div class="bb-step s' + (lvl % 4) + '">' +
          '<button class="bb-node ' + cls + '" data-lvl="' + lvl + '"' +
          (cls === 'lock' ? ' disabled' : '') + '>' +
          (cls === 'lock' ? '🔒' : lvl) + '</button>' +
          (cls === 'done' ? '<span class="bb-node-stars">' + starsTxt(st) + '</span>' : '') +
          (cls === 'cur' ? '<span class="bb-node-go">Jouer !</span>' : '') +
          '</div>';
      }
      html += '</div><p class="hint mini-center">Réussissez l’objectif du niveau pour ' +
        'débloquer le suivant. Glissez un bonbon vers son voisin pour l’échanger !</p></div>';
      el.innerHTML = html;
      el.querySelectorAll('.bb-node:not(.lock)').forEach(function (b) {
        b.addEventListener('click', function () {
          ctx.act({ t: 'start', lvl: parseInt(b.dataset.lvl, 10) });
        });
      });
      var cur = el.querySelector('.bb-node.cur');
      if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'center' });
    },

    /* ===== fin de niveau (solo) : résultat sur place, jamais d'écran de fin ===== */
    _renderResult: function (el, ctx) {
      var s = ctx.state;
      var p = s.players[0];
      var st = stars(p.score, s.cible);
      var win = st >= 1;

      // progression enregistrée une seule fois par niveau joué
      if (el._bbSaved !== s.startTs) {
        el._bbSaved = s.startTs;
        var prog = loadProg();
        if ((prog.best[s.soloLvl] || 0) < p.score) prog.best[s.soloLvl] = p.score;
        if ((prog.stars[s.soloLvl] || 0) < st) prog.stars[s.soloLvl] = st;
        if (win && s.soloLvl === prog.lvl) prog.lvl = s.soloLvl + 1;
        saveProg(prog);
      }
      var prog2 = loadProg();
      var best = prog2.best[s.soloLvl] || p.score;

      var html = '<div class="bb-result' + (win ? ' win' : '') + '">' +
        '<p class="mini-msg big-msg">' + (win ? '🎉 Niveau ' + s.soloLvl + ' réussi !'
          : '😅 Presque…') + '</p>' +
        '<div class="bb-stars-big">' + (win ? starsTxt(st) : '☆') + '</div>' +
        '<p class="mini-msg"><b>' + p.score + '</b> pts · objectif ' + s.cible + '</p>' +
        (win ? '' : '<p class="hint mini-center">Il manquait ' + (s.cible - p.score) +
          ' points. Cherchez les bonbons rayés et les sucres magiques !</p>') +
        '<p class="hint mini-center">🏅 Record du niveau : ' + best + ' pts</p>' +
        (win
          ? '<button class="btn big primary" data-a="next">Niveau ' + (s.soloLvl + 1) + ' ▶</button>'
          : '<button class="btn big primary" data-a="retry">↻ Rejouer le niveau</button>') +
        '<button class="btn" data-a="map">🗺️ Carte</button></div>';
      el.innerHTML = html;
      el.querySelector('[data-a="' + (win ? 'next' : 'retry') + '"]')
        .addEventListener('click', function () {
          ctx.act({ t: 'start', lvl: win ? s.soloLvl + 1 : s.soloLvl });
        });
      el.querySelector('[data-a="map"]').addEventListener('click', function () {
        ctx.act({ t: 'backmap' });
      });
    },

    render: function (el, ctx) {
      var s = ctx.state;
      var me = ctx.me;
      var soloLocal = ctx.mode === 'local' && s.players.length === 1;

      if (s.phase === 'setup') {
        el._bbSel = -1;
        el._bbPrev = null;
        if (soloLocal) { mod._renderMap(el, ctx); return; }
        var html0 = '<p class="mini-msg big-msg">🍬 Bonbons</p>';
        if (me === 0) {
          html0 += '<p class="mini-msg">Course à plusieurs — choisissez le niveau :</p><div class="lvl-btns">' +
            Object.keys(LEVELS).map(function (l) {
              var c = LEVELS[l];
              return '<button class="btn big" data-lvl="' + l + '">' +
                (l === 'facile' ? '😌' : l === 'moyen' ? '🙂' : '😈') + ' ' + c.nom +
                ' <small>' + c.coups + ' coups · ' + c.types + ' bonbons · objectif ' +
                c.cible + ' pts</small></button>';
            }).join('') + '</div>' +
            '<p class="hint">4 alignés = bonbon rayé · 5 alignés = sucre magique 🌟</p>';
        } else {
          html0 += '<p class="waiting">⏳ L’hôte choisit le niveau…</p>';
        }
        el.innerHTML = html0;
        el.querySelectorAll('[data-lvl]').forEach(function (btn) {
          btn.addEventListener('click', function () { ctx.act({ t: 'level', l: btn.dataset.lvl }); });
        });
        return;
      }

      if (s.phase === 'result' && s.solo) { mod._renderResult(el, ctx); return; }

      var p = s.players[me];
      var sel = el._bbSel !== undefined ? el._bbSel : -1;
      if (sel !== -1 && (!p.board || !p.board[sel])) { sel = -1; el._bbSel = -1; }

      var html = '';
      if (s.solo) {
        var pc = Math.min(100, Math.round(p.score * 100 / s.cible));
        var z2 = zoneOf(s.soloLvl);
        html += '<div class="mem-stats">' +
          '<span class="mem-stat">' + ZONE_ICONS[z2] + ' Niveau ' + s.soloLvl + '</span>' +
          '<span class="mem-stat">🍬 ' + p.moves + ' coup' + (p.moves > 1 ? 's' : '') + '</span>' +
          (p.lastGain > 0 ? '<span class="mem-stat bb-gain">+' + p.lastGain +
            (p.lastCombo > 1 ? ' · ×' + p.lastCombo : '') + '</span>' : '') +
          '</div>' +
          '<div class="bb-obj"><div class="bb-obj-fill" style="width:' + pc + '%"></div>' +
          '<span class="bb-obj-txt">' + p.score + ' / ' + s.cible + '</span></div>';
      } else {
        html += '<div class="mem-stats">' +
          '<span class="mem-stat">🎯 <b>' + p.score + '</b> pts</span>' +
          '<span class="mem-stat">🍬 ' + p.moves + ' coup' + (p.moves > 1 ? 's' : '') + '</span>' +
          (p.lastGain > 0 ? '<span class="mem-stat bb-gain">+' + p.lastGain +
            (p.lastCombo > 1 ? ' · combo ×' + p.lastCombo : '') + '</span>' : '') +
          '</div>';
      }

      // un coup vient-il de rapporter ? (déclenche bulles et explosions)
      var gainKey = p.moves + ':' + p.score;
      var frais = p.lastGain > 0 && el._bbGainKey !== gainKey;
      if (frais) el._bbGainKey = gainKey;
      var fx = frais && p.fx ? p.fx : null;
      var secousse = fx && (fx.combo >= 3 || fx.arc > 0 || fx.wipe ||
        fx.rows.length || fx.cols.length);

      // animation : seuls les bonbons qui ont changé tombent en scène
      var prev = el._bbPrev;
      var glyphs = [];
      html += '<div class="bb-wrap"><div class="bb-grid' +
        (secousse ? ' bb-quake' : '') + '">';
      for (var i = 0; i < N * N; i++) {
        var c2 = p.board[i];
        var glyph = c2.t === ARC ? '🌟' : EMOJIS[c2.t];
        glyphs.push(glyph + c2.s);
        var anim = prev && prev[i] !== glyphs[i]
          ? ' pop-in" style="animation-delay:' + (Math.floor(i / N) * 35) + 'ms"'
          : '"';
        html += '<button class="bb-cell t' + (c2.t === ARC ? 'x' : c2.t) +
          (i === sel ? ' sel' : '') + (c2.s ? ' raye' + c2.s : '') + anim +
          ' data-i="' + i + '">' + glyph + '</button>';
      }

      /* ===== explosions des super bonus ===== */
      if (fx) {
        // rayons des bonbons rayés : un éclair balaye la ligne / la colonne
        fx.rows.forEach(function (r2) {
          html += '<div class="bb-beam h" style="top:' + (r2 * 12.5 + 1.2) + '%"></div>';
        });
        fx.cols.forEach(function (c3) {
          html += '<div class="bb-beam v" style="left:' + (c3 * 12.5 + 1.2) + '%"></div>';
        });
        // sucre magique ou grille entière : déflagration à particules
        if (fx.arc > 0 || fx.wipe) {
          html += '<div class="bb-flash"></div><div class="bb-boom">';
          var teintes = ['#f26d9d', '#5aa7de', '#f2a93b', '#62c46f', '#9a6dd7', '#ffd23f'];
          var nb = fx.wipe ? 22 : 14;
          for (var q2 = 0; q2 < nb; q2++) {
            var ang = (q2 / nb) * Math.PI * 2 + Math.random() * 0.4;
            var dist = 90 + Math.random() * 110;
            html += '<span class="bb-part" style="background:' + teintes[q2 % 6] +
              ';--dx:' + Math.round(Math.cos(ang) * dist) + 'px;--dy:' +
              Math.round(Math.sin(ang) * dist) + 'px;animation-delay:' +
              (Math.random() * 120 | 0) + 'ms"></span>';
          }
          html += '<span class="bb-ring"></span></div>';
        }
      }
      html += '</div>';

      if (frais) {
        html += '<div class="bb-float">+' + p.lastGain +
          (p.lastCombo > 1 ? ' ×' + p.lastCombo : '') + '</div>';
      }
      // les grandes cascades s'annoncent en fanfare
      if (fx && fx.combo >= 3) {
        html += '<div class="bb-combo">COMBO ×' + fx.combo + ' !</div>';
      } else if (fx && fx.wipe) {
        html += '<div class="bb-combo">EXPLOSION TOTALE !</div>';
      }
      html += '</div>';
      el._bbPrev = glyphs;

      if (p.moves <= 0 && !s.solo) html += '<p class="mini-msg">🍬 Plus de coups ! On attend les autres…</p>';

      if (s.players.length > 1) {
        html += '<div class="mem-stats">' + s.players.map(function (q, qi) {
          if (qi === me) return '';
          return '<span class="mem-stat">' + GG.esc(q.name) + ' : ' + q.score +
            ' pts · ' + q.moves + ' cp</span>';
        }).join('') + '</div>';
      }

      el.innerHTML = html;

      /* ===== échanges : glisser (ou toucher-toucher) ===== */
      var grid = el.querySelector('.bb-grid');

      function cellEl(i2) { return el.querySelector('.bb-cell[data-i="' + i2 + '"]'); }

      function doSwap(a, b2) {
        if (p.moves <= 0) return;
        el._bbSel = -1;
        var ca = cellEl(a), cb = cellEl(b2);
        if (!ca || !cb) return;
        var ra = ca.getBoundingClientRect(), rb = cb.getBoundingClientRect();
        var dx = rb.left - ra.left, dy = rb.top - ra.top;
        var arc = p.board[a].t === ARC || p.board[b2].t === ARC;
        var valide = arc || wouldMatch(p.board, a, b2);
        ca.style.zIndex = 3;
        ca.style.transition = 'transform .14s ease';
        cb.style.transition = 'transform .14s ease';
        ca.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
        cb.style.transform = 'translate(' + (-dx) + 'px,' + (-dy) + 'px)';
        if (valide) {
          setTimeout(function () { ctx.act({ t: 'swap', a: a, b: b2 }); }, 150);
        } else {
          // rien ne s'aligne : les bonbons reviennent en tremblant
          setTimeout(function () {
            ca.style.transform = '';
            cb.style.transform = '';
            ca.classList.add('bb-shake');
            cb.classList.add('bb-shake');
          }, 160);
        }
      }

      var touche = null;
      grid.addEventListener('pointerdown', function (e) {
        var c = e.target.closest ? e.target.closest('.bb-cell') : null;
        if (!c) return;
        touche = { i: parseInt(c.dataset.i, 10), x: e.clientX, y: e.clientY };
      });
      grid.addEventListener('pointermove', function (e) {
        if (!touche) return;
        var dx = e.clientX - touche.x, dy = e.clientY - touche.y;
        if (Math.abs(dx) < 16 && Math.abs(dy) < 16) return;
        var a = touche.i, cible;
        if (Math.abs(dx) > Math.abs(dy)) cible = dx > 0 ? a + 1 : a - 1;
        else cible = dy > 0 ? a + N : a - N;
        touche = null;
        if (cible < 0 || cible >= N * N || !adjacent(a, cible)) return;
        doSwap(a, cible);
      });
      grid.addEventListener('pointerup', function (e) {
        if (!touche) return;
        var i2 = touche.i;
        touche = null;
        var cur = el._bbSel !== undefined ? el._bbSel : -1;
        if (cur === -1) {
          el._bbSel = i2;
          mod.render(el, ctx);
        } else if (cur === i2) {
          el._bbSel = -1;
          mod.render(el, ctx);
        } else if (adjacent(cur, i2)) {
          doSwap(cur, i2); // désélection faite dans doSwap, act après l'animation
        } else {
          el._bbSel = i2;
          mod.render(el, ctx);
        }
      });
      grid.addEventListener('pointercancel', function () { touche = null; });
    },

    _findRuns: findRuns, _resolve: resolve, _buildBoard: buildBoard,
    _wouldMatch: wouldMatch, _hasMove: hasMove, _N: N, // pour les tests
    _levelCfg: levelCfg, _stars: stars, _zoneOf: zoneOf, _ZONES: ZONES
  };

  GG.register(mod);
  if (typeof module === 'object' && module.exports) module.exports = mod;
})(typeof self !== 'undefined' ? self : globalThis);
