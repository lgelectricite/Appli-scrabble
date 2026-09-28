/* GGgames — Mots mêlés (1 à 4 joueurs). V2.

   - Grilles à THÈME (Animaux, Cuisine, Pirates…) et, comme dans les
     magazines, un MOT MYSTÈRE formé par les lettres restantes, lues dans
     l’ordre, une fois tous les mots trouvés (on peut le proposer avant, pour
     un bonus).
   - On sélectionne un mot en GLISSANT le doigt : une gélule colorée suit le
     doigt ; chaque mot trouvé garde SA couleur (les croisements restent
     lisibles). Toucher la première puis la dernière lettre marche encore.
   - Chrono, trois niveaux (grilles de 7×8 à 9×10, cases ≥ 33 px sur un petit
     téléphone), défi du jour (même grille pour tous, calculée depuis la date),
     confettis à la fin.
   - En réseau, la grille est partagée : le plus rapide prend le mot. Sur ce
     téléphone à plusieurs : chacun son tour. Contre l’ordinateur : 3 niveaux.

   Sécurité : tout ce qui vient de l’état est filtré (lettres A-Z, indices
   numériques bornés, thème par liste blanche) ou échappé. */
(function (root) {
  'use strict';
  var GG = root.GG;
  var DIRS8 = [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1]];
  var LEVELS = {
    facile: { nom: 'Facile', cols: 7, rows: 8, dirs: [[0, 1], [1, 0]], k: [4, 8], rangs: [0, 1],
      sous: 'horizontaux et verticaux' },
    moyen: { nom: 'Moyen', cols: 8, rows: 9, dirs: [[0, 1], [1, 0], [1, 1], [-1, 1]], k: [5, 10], rangs: [0, 1, 2],
      sous: '+ diagonales' },
    difficile: { nom: 'Difficile', cols: 9, rows: 10, dirs: DIRS8, k: [5, 11], rangs: [0, 1, 2],
      sous: '8 sens, mots à l’envers !' }
  };
  var FALLBACK = ['MAISON', 'JARDIN', 'SOLEIL', 'NUAGE', 'RIVIERE', 'FORET', 'MONTAGNE',
    'BATEAU', 'ETOILE', 'FLEUR', 'ORANGE', 'BANANE', 'CERISE', 'TIGRE', 'PANDA',
    'REQUIN', 'PIRATE', 'TRESOR', 'FUSEE', 'PLANETE', 'ROBOT', 'MUSIQUE', 'GUITARE',
    'CHATEAU', 'DRAGON', 'PLAGE', 'VAGUE', 'HIVER', 'NEIGE', 'CABANE'];
  var FILLERS = 'EEEAAAIISSNNRRTTOOLUDCMP';
  var TEINTES = ['#ff5c8a', '#2fd4ff', '#ffc23d', '#8b5cff', '#2fd67b', '#ff8a3d', '#5b86e5', '#e05cff',
    '#1ad7a0', '#ff4d5e', '#b8e62e', '#3dd9ff', '#ffb0d0', '#a78bfa', '#fb923c', '#34d399', '#f472b6', '#60a5fa'];
  var PCOLORS = ['#2fd4ff', '#ff5cb0', '#ffc23d', '#b28cff'];
  /* IA (contre l’ordinateur) : nombre de « battements » (≈ 1 s chacun) pour
     trouver un mot moyen ; un mot long, en diagonale ou à l’envers prend
     plus de temps. Elle ne lit pas les positions : elle « cherche » le temps
     qu’il faut, comme un joueur. */
  var NIVEAUX_IA = { facile: { tics: 24 }, moyen: { tics: 14 }, difficile: { tics: 8 } };

  /* ================= hasard reproductible (défi du jour) ================= */

  /* Math.imul manque sur de très vieux navigateurs */
  var imul = Math.imul || function (a, b) {
    var ah = (a >>> 16) & 0xffff, al = a & 0xffff, bh = (b >>> 16) & 0xffff, bl = b & 0xffff;
    return ((al * bl) + (((ah * bl + al * bh) << 16) >>> 0) | 0);
  };
  function signe(x) { return x > 0 ? 1 : (x < 0 ? -1 : 0); }
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = imul(a ^ (a >>> 15), 1 | a);
      t = (t + imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function melange(a, rnd) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function hache(s) {
    var h = 2166136261;
    s = String(s);
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = imul(h, 16777619); }
    return h >>> 0;
  }
  function deux(n) { return (n < 10 ? '0' : '') + n; }
  function jourCle(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + deux(d.getMonth() + 1) + '-' + deux(d.getDate());
  }

  /* ================= les thèmes ================= */

  function themes() { return GG.MOTS_THEMES && GG.MOTS_THEMES.length ? GG.MOTS_THEMES : []; }
  function themeDe(id) {
    var t = themes();
    for (var i = 0; i < t.length; i++) if (t[i].id === id) return t[i];
    return null;
  }
  function themeDuJour(cle) {
    var t = themes();
    return t.length ? t[hache('meles:' + cle) % t.length] : null;
  }

  /* ================= la génération ================= */

  function occurrences(grid, C, R, w) {
    var vus = {}, n = 0;
    for (var r = 0; r < R; r++) {
      for (var c = 0; c < C; c++) {
        for (var d = 0; d < DIRS8.length; d++) {
          var dr = DIRS8[d][0], dc = DIRS8[d][1];
          var er = r + dr * (w.length - 1), ec = c + dc * (w.length - 1);
          if (er < 0 || er >= R || ec < 0 || ec >= C) continue;
          var ok = true, cells = [];
          for (var k = 0; k < w.length; k++) {
            var i = (r + dr * k) * C + c + dc * k;
            if (grid[i] !== w[k]) { ok = false; break; }
            cells.push(i);
          }
          if (ok) {
            var cle = cells.slice().sort(function (a, b) { return a - b; }).join(',');
            if (!vus[cle]) { vus[cle] = true; n++; }
          }
        }
      }
    }
    return n;
  }
  function lies(a, b) { return a === b || a.indexOf(b) !== -1 || b.indexOf(a) !== -1; }
  var EXIGEES = {
    facile: [[0, 1], [1, 0], [0, 1], [1, 0]],
    moyen: [[0, 1], [1, 0], [1, 1], [0, 1], [1, 0], [-1, 1]],
    difficile: [[0, 1], [1, 0], [1, 1], [0, -1], [1, 0], [-1, -1], [-1, 0]]
  };

  /* Une grille : on pose les mots du thème (en privilégiant les croisements)
     jusqu’à ce qu’il reste exactement la place d’un mot mystère du thème,
     écrit dans les cases libres dans l’ordre de lecture. Chaque mot n’apparaît
     qu’une fois dans la grille (vérifié). */
  function genere(level, theme, seed, souple) {
    var cfg = LEVELS[level] || LEVELS.moyen;
    if (souple) cfg = { cols: cfg.cols, rows: cfg.rows, dirs: cfg.dirs, rangs: cfg.rangs, k: [cfg.k[0] - 1, cfg.k[1] + 2] };
    var rnd = rng(seed);
    var C = cfg.cols, R = cfg.rows, N = C * R, maxL = Math.max(C, R);
    var imposees = EXIGEES[level] || [];
    var mots = [];
    if (theme) {
      cfg.rangs.forEach(function (r) {
        (theme.mots[r] || []).forEach(function (w) {
          if (w.length >= 3 && w.length <= maxL && mots.indexOf(w) === -1) mots.push(w);
        });
      });
    }
    if (mots.length < 12) FALLBACK.forEach(function (w) { if (w.length <= maxL && mots.indexOf(w) === -1) mots.push(w); });
    var grid, placed, libres, parDir, pool;
    function libre(w) { return !placed.some(function (x) { return lies(x.w, w); }); }
    /* le meilleur emplacement pour l’un des 12 prochains mots, dans ces directions */
    function cherche(dirs, bonnes) {
      var best = null, essais = 0;
      for (var p = 0; p < pool.length && essais < 12; p++) {
        var w = pool[p];
        if (!libre(w)) continue;
        essais++;
        for (var d = 0; d < dirs.length; d++) {
          var dr = dirs[d][0], dc = dirs[d][1];
          var r0 = dr < 0 ? w.length - 1 : 0, r1 = dr > 0 ? R - w.length : R - 1;
          var c0 = dc < 0 ? w.length - 1 : 0, c1 = dc > 0 ? C - w.length : C - 1;
          if (r1 < r0 || c1 < c0) continue;
          for (var t = 0; t < 14; t++) {
            var r = r0 + Math.floor(rnd() * (r1 - r0 + 1));
            var c = c0 + Math.floor(rnd() * (c1 - c0 + 1));
            var neuf = 0, croise = 0, ok = true, cells = [];
            for (var k = 0; k < w.length; k++) {
              var i = (r + dr * k) * C + c + dc * k;
              if (grid[i]) { if (grid[i] !== w[k]) { ok = false; break; } croise++; } else neuf++;
              cells.push(i);
            }
            if (!ok || !neuf || libres - neuf < cfg.k[0]) continue;
            var dk = dr + ',' + dc;
            var score = neuf + 1.6 * croise + 3 * rnd() - 1.5 * (parDir[dk] || 0) / (1 + placed.length / cfg.dirs.length);
            var reste = libres - neuf;
            if (reste <= cfg.k[1]) score += bonnes[reste] ? 8 : -8; // viser pile la place d’un mot mystère
            if (!best || score > best.score) best = { w: w, cells: cells, neuf: neuf, score: score, dk: dk };
          }
        }
      }
      return best;
    }
    for (var att = 0; att < 20; att++) {
      grid = [];
      for (var z = 0; z < N; z++) grid.push('');
      placed = [];
      libres = N;
      parDir = {};
      pool = melange(mots.slice(), rnd);
      for (var step = 0; step < 40; step++) {
        // longueurs de mot mystère encore possibles (un mot du thème non posé)
        var bonnes = {};
        if (libres <= cfg.k[1] + 12) {
          mots.forEach(function (m2) {
            if (m2.length >= cfg.k[0] && m2.length <= cfg.k[1] && libre(m2)) bonnes[m2.length] = true;
          });
        }
        // les premiers mots dans des directions imposées (une grille variée
        // d’emblée), sinon dans toutes les directions du niveau
        var best = step < imposees.length ? cherche([imposees[step]], bonnes) : null;
        if (!best) best = cherche(cfg.dirs, bonnes);
        if (!best) break;
        for (var q = 0; q < best.cells.length; q++) grid[best.cells[q]] = best.w[q];
        placed.push({ w: best.w, cells: best.cells });
        parDir[best.dk] = (parDir[best.dk] || 0) + 1;
        libres -= best.neuf;
        if (libres <= cfg.k[1]) {
          var myst = melange(mots.filter(function (m) { return m.length === libres && libre(m); }), rnd)[0];
          if (myst) {
            var g2 = grid.slice(), kk = 0;
            for (var n2 = 0; n2 < N; n2++) if (!g2[n2]) g2[n2] = myst[kk++];
            if (placed.every(function (x) { return occurrences(g2, C, R, x.w) === 1; }) && varie(placed, C, level)) {
              return finalise(g2, placed, myst, C, R, theme);
            }
          }
          if (libres < cfg.k[0]) break;
        }
      }
    }
    return null;
  }
  /* une grille variée : au moins 2 mots horizontaux et 2 verticaux ; des
     diagonales dès le niveau moyen ; des mots à l’envers en difficile */
  function varie(placed, C, level) {
    var h = 0, v = 0, diag = 0, envers = 0;
    placed.forEach(function (x) {
      var d = x.cells[1] - x.cells[0];
      if (d === 1 || d === -1) h++;
      else if (d === C || d === -C) v++;
      else diag++;
      if (d < 0) envers++;
    });
    if (h < 2 || v < 2) return false;
    if (level !== 'facile' && diag < 1) return false;
    if (level === 'difficile' && envers < 1) return false;
    return true;
  }
  function finalise(grid, placed, myst, C, R, theme) {
    placed.sort(function (a, b) { return a.w < b.w ? -1 : 1; });
    return {
      grid: grid,
      words: placed.map(function (x) { return { w: x.w, cells: x.cells, foundBy: -1, foundCells: null }; }),
      mystere: myst,
      cols: C, rows: R, size: C,
      theme: theme ? theme.id : ''
    };
  }
  /* secours (thème trop pauvre) : mots posés, lettres de remplissage, pas de mot mystère */
  function genereSimple(level, rnd, theme) {
    var cfg = LEVELS[level] || LEVELS.moyen;
    var C = cfg.cols, R = cfg.rows, N = C * R;
    var source = FALLBACK;
    if (theme) {
      source = [];
      theme.mots.forEach(function (l) { l.forEach(function (w) { if (source.indexOf(w) === -1) source.push(w); }); });
    }
    for (var att = 0; att < 60; att++) {
      var grid = [];
      for (var z = 0; z < N; z++) grid.push('');
      var mots = melange(source.filter(function (w) { return w.length >= 3 && w.length <= Math.min(C, R); }), rnd).slice(0, 9);
      var placed = [];
      mots.forEach(function (w) {
        for (var t = 0; t < 200; t++) {
          var d = cfg.dirs[Math.floor(rnd() * cfg.dirs.length)];
          var r = Math.floor(rnd() * R), c = Math.floor(rnd() * C);
          var er = r + d[0] * (w.length - 1), ec = c + d[1] * (w.length - 1);
          if (er < 0 || er >= R || ec < 0 || ec >= C) continue;
          var ok = true, cells = [];
          for (var k = 0; k < w.length; k++) {
            var i = (r + d[0] * k) * C + c + d[1] * k;
            if (grid[i] && grid[i] !== w[k]) { ok = false; break; }
            cells.push(i);
          }
          if (!ok) continue;
          cells.forEach(function (i2, k2) { grid[i2] = w[k2]; });
          placed.push({ w: w, cells: cells });
          return;
        }
      });
      for (var n = 0; n < N; n++) if (!grid[n]) grid[n] = FILLERS[Math.floor(rnd() * FILLERS.length)];
      if (placed.length >= 5 && placed.every(function (x) { return occurrences(grid, C, R, x.w) === 1; })) {
        return finalise(grid, placed, '', C, R, theme);
      }
    }
    return null;
  }
  function construit(level, themeId, seed) {
    var th = themeDe(themeId) || themes()[seed % Math.max(1, themes().length)] || null;
    for (var essai = 0; essai < 8; essai++) {
      // d’abord la longueur de mot mystère idéale, puis un peu plus de souplesse
      var g = genere(level, th, seed + essai * 7919, essai >= 4);
      if (g) return g;
    }
    return genereSimple(level, rng(seed), th);
  }
  /* utilisé par les tests : une grille au hasard */
  function buildGrid(level) {
    var th = themes();
    var seed = Math.floor(Math.random() * 4294967296);
    return construit(level, th.length ? th[seed % th.length].id : '', seed);
  }

  function lineCells(state, a, b) {
    var C = state.cols || state.size, R = state.rows || state.size;
    if (!(a >= 0 && a < C * R && b >= 0 && b < C * R)) return null;
    var r1 = Math.floor(a / C), c1 = a % C;
    var r2 = Math.floor(b / C), c2 = b % C;
    var dr = signe(r2 - r1), dc = signe(c2 - c1);
    if (dr !== 0 && dc !== 0 && Math.abs(r2 - r1) !== Math.abs(c2 - c1)) return null;
    var len = Math.max(Math.abs(r2 - r1), Math.abs(c2 - c1)) + 1;
    var cells = [];
    for (var k = 0; k < len; k++) cells.push((r1 + dr * k) * C + (c1 + dc * k));
    return cells;
  }

  function fmt(sec) {
    sec = Math.max(0, Math.floor(Number(sec) || 0));
    var m = Math.floor(sec / 60);
    return m + ':' + deux(sec % 60);
  }
  function fmtLong(sec) {
    sec = Math.max(0, Math.floor(Number(sec) || 0));
    var m = Math.floor(sec / 60);
    return (m ? m + ' min ' : '') + (sec % 60) + ' s';
  }
  var PAUSE_MAX = 180000; // au-delà de 3 min sans rien trouver, on considère une pause
  function chrono(state, now) {
    var base = Number(state.chrono) || 0;
    var dernier = Number(state.lastTs) || Number(state.startTs) || now;
    return Math.max(0, Math.round((base + Math.min(PAUSE_MAX, Math.max(0, now - dernier))) / 1000));
  }
  function avance(state, now) {
    var dernier = Number(state.lastTs) || Number(state.startTs) || now;
    state.chrono = (Number(state.chrono) || 0) + Math.min(PAUSE_MAX, Math.max(0, now - dernier));
    state.lastTs = now;
  }
  function estIA(state, j) { return /^🤖/.test(String(state.players[j] && state.players[j].name || '')); }
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

  /* difficulté d’un mot pour l’IA : long, diagonal, à l’envers = plus long à voir */
  function difficulte(state, w) {
    var C = state.cols || state.size;
    var f = 0.7 + w.w.length * 0.06;
    if (w.cells && w.cells.length > 1) {
      var d = w.cells[1] - w.cells[0];
      if (d !== 1 && d !== C) f *= 1.3;           // diagonale ou à l’envers
      if (d < 0) f *= 1.25;                        // à l’envers
    }
    return f;
  }
  function cibleIA(state, j) {
    var restants = state.words.filter(function (w) { return w.foundBy === -1; });
    if (!restants.length) return null;
    restants.sort(function (a, b) { return difficulte(state, a) - difficulte(state, b); });
    var n = (state.players[j] && state.players[j].found) || 0;
    // souvent le plus facile, parfois un autre (comme un vrai joueur)
    var k = hache(state.seed + ':' + j + ':' + n) % 10 < 6 ? 0 : hache('b' + state.seed + j + n) % restants.length;
    return restants[k];
  }
  function delaiIA(state, j, niveau) {
    var P = NIVEAUX_IA[niveau] || NIVEAUX_IA.moyen;
    var w = cibleIA(state, j);
    if (!w) return Infinity;
    var n = (state.players[j] && state.players[j].found) || 0;
    var alea = 0.65 + 0.7 * ((hache('d' + state.seed + ':' + j + ':' + n) % 1000) / 1000);
    return Math.max(2, Math.round(P.tics * difficulte(state, w) * alea));
  }
  function iaPrete(state, j, niveau) {
    return state.tic - ((state.players[j] && state.players[j].ticTrouve) || 0) >= delaiIA(state, j, niveau);
  }

  var mod = {
    id: 'meles',
    nom: 'Mots mêlés',
    icone: '🔎',
    niveaux: ['facile', 'moyen', 'difficile'],
    desc: 'Retrouvez les mots cachés d’un thème en glissant le doigt, puis le mot mystère formé par les lettres restantes. Défi du jour, chrono, et à plusieurs : le plus rapide prend le mot !',
    regles: '<p><strong>🎯 Le but :</strong> retrouver tous les mots du thème cachés dans la grille — horizontaux, verticaux, en diagonale… et parfois à l’envers.</p>' +
      '<p><strong>Comment jouer :</strong> <strong>glissez le doigt</strong> de la première à la dernière lettre d’un mot (ou touchez la première puis la dernière lettre). Chaque mot trouvé prend sa couleur.</p>' +
      '<p><strong>🔮 Le mot mystère :</strong> quand tous les mots sont trouvés, les lettres restantes, lues dans l’ordre, forment un dernier mot du thème. Vous l’avez deviné avant ? Proposez-le : <strong>+3 points</strong> !</p>' +
      '<p><strong>📅 Défi du jour :</strong> la même grille pour tout le monde, chaque jour. Battez votre record de temps.</p>' +
      '<p><strong>À plusieurs :</strong> en réseau, la grille est partagée et le plus rapide prend le mot ; sur ce téléphone, chacun son tour. Contre l’ordinateur, il cherche aussi — plus ou moins vite selon son niveau.</p>',
    min: 1, max: 4,
    hotseat: true, hotseatMax: 4, hidden: false, netOnly: false,

    create: function (names, ctx) {
      return {
        players: names.map(function (n) { return { name: n, found: 0, bonus: 0, ticTrouve: 0 }; }),
        phase: 'setup',
        level: null,
        theme: '',
        size: 0, cols: 0, rows: 0,
        grid: null,
        words: [],
        mystereLen: 0,
        mystereTrouve: -1,
        startTs: 0, lastTs: 0, chrono: 0,
        durationSec: 0,
        tourParTour: false,
        tour: 0,
        tic: 0,
        seed: 0,
        jour: '',
        ia: !!(ctx && ctx.niveau),
        finished: false
      };
    },

    turnOf: function (state) {
      return state.phase === 'play' && state.tourParTour ? state.tour : -1; // sinon : tout le monde cherche en même temps
    },
    over: function (state) { return state.finished; },
    scoreOf: function (state, i) { return (state.players[i].found || 0) + (state.players[i].bonus || 0); },

    gagnants: function (state) {
      var P = state.players;
      if (P.length === 1) return state.finished ? [0] : null;
      var sc = P.map(function (p) { return (p.found || 0) + (p.bonus || 0); });
      var max = Math.max.apply(null, sc);
      var g = [];
      sc.forEach(function (v, i) { if (v === max) g.push(i); });
      return g.length === 1 ? g : [];
    },

    summary: function (state) {
      var rows = state.players.map(function (p) { return { n: p.name, s: (p.found || 0) + (p.bonus || 0), f: p.found || 0 }; })
        .sort(function (a, b) { return b.s - a.s; });
      var th = themeDe(state.theme);
      var html = '<p>' + (th ? th.ic + ' ' + GG.esc(th.nom) + ' · ' : '') + (LEVELS[state.level] ? LEVELS[state.level].nom : '') +
        ' · ⏱️ ' + fmtLong(state.durationSec) + '</p>';
      if (state.mystere) html += '<p>🔮 Mot mystère : <strong>' + GG.esc(state.mystere) + '</strong></p>';
      html += rows.map(function (r) {
        return '<div class="final-line"><span>' + GG.esc(r.n) + '</span><strong>' + r.f + ' mot' + (r.f > 1 ? 's' : '') +
          (r.s !== r.f ? ' + ' + (r.s - r.f) + ' pts' : '') + '</strong></div>';
      }).join('');
      if (state.players.length === 1) {
        var cle = state.jour ? 'gg-meles-jour' : 'gg-meles-record-' + state.level;
        var rec = lireLS(cle, null);
        if (rec && rec.ts === state.startTs) html += '<h1>🏆 Nouveau record !</h1>';
        else if (rec && rec.sec) html += '<p>🏅 Record : ' + fmtLong(rec.sec) + '.</p>';
      } else {
        var top = rows.filter(function (r) { return r.s === rows[0].s; });
        html += '<h1>🏆 ' + top.map(function (r) { return GG.esc(r.n); }).join(' & ') + '</h1>';
      }
      return html;
    },

    /* en réseau : les POSITIONS des mots non trouvés et le mot mystère ne
       circulent pas (la liste des mots reste visible, c’est le jeu) */
    redact: function (state) {
      var copy = GG.clone(state);
      copy.words.forEach(function (w) {
        if (w.foundBy === -1) { delete w.cells; w.foundCells = null; }
      });
      if (copy.phase === 'play' && copy.mystereTrouve === -1) delete copy.mystere;
      return copy;
    },

    apply: function (state, player, action) {
      if (state.finished) return { ok: false, error: 'Partie terminée.' };
      var now = Date.now();
      if (action.t === 'level') {
        if (state.phase !== 'setup') return { ok: false, error: 'Niveau déjà choisi.' };
        if (player !== 0) return { ok: false, error: 'L’hôte choisit le niveau.' };
        var jour = action.m === 'jour';
        var l = jour ? 'moyen' : action.l;
        if (!LEVELS[l]) return { ok: false, error: 'Niveau inconnu.' };
        var seed, th;
        if (jour) {
          state.jour = jourCle();
          seed = hache('grille:' + state.jour);
          th = themeDuJour(state.jour);
        } else {
          seed = Math.floor(Math.random() * 4294967296);
          th = themeDe(action.th) || themes()[seed % Math.max(1, themes().length)] || null;
        }
        var built = construit(l, th ? th.id : '', seed);
        if (!built) return { ok: false, error: 'Impossible de générer la grille, réessayez.' };
        state.level = l;
        state.theme = built.theme;
        state.size = built.size;
        state.cols = built.cols;
        state.rows = built.rows;
        state.grid = built.grid;
        state.words = built.words;
        state.mystere = built.mystere;
        state.mystereLen = built.mystere.length;
        state.seed = seed >>> 0;
        state.tourParTour = !!action.tour && state.players.length > 1;
        state.tour = 0;
        state.phase = 'play';
        state.startTs = now;
        state.lastTs = now;
        state.chrono = 0;
        return { ok: true };
      }
      if (action.t === 'fin') {
        if (state.phase !== 'mystere') return { ok: false, error: 'Pas encore !' };
        state.phase = 'fin';
        state.finished = true;
        return { ok: true };
      }
      if (state.phase !== 'play') return { ok: false, error: 'La partie n’a pas commencé.' };
      if (action.t === 'attente') {
        // le « battement » de l’ordinateur (≈ 1 par seconde) : le temps passe pour lui
        if (player === 0 && !estIA(state, 0)) return { ok: false, error: 'Action réservée à l’ordinateur.' };
        state.tic = (state.tic || 0) + 1;
        return { ok: true };
      }
      if (state.tourParTour && player !== state.tour) return { ok: false, error: 'Ce n’est pas votre tour.' };
      if (action.t === 'mystere') {
        if (!state.mystere) return { ok: false, error: 'Pas de mot mystère dans cette grille.' };
        if (state.mystereTrouve !== -1) return { ok: false, error: 'Le mot mystère a déjà été trouvé.' };
        var g = String(action.w || '').toUpperCase().replace(/[^A-Z]/g, '');
        if (g !== state.mystere) return { ok: false, error: '« ' + g + ' » n’est pas le mot mystère.' };
        state.mystereTrouve = player;
        state.players[player].bonus = (state.players[player].bonus || 0) + 3;
        return { ok: true };
      }
      if (action.t === 'claim') {
        var cells = lineCells(state, action.a | 0, action.b | 0);
        if (!cells || cells.length < 2) return { ok: false, error: 'Sélectionnez une ligne droite.' };
        var text = cells.map(function (i) { return state.grid[i]; }).join('');
        var reversed = text.split('').reverse().join('');
        for (var w = 0; w < state.words.length; w++) {
          var word = state.words[w];
          if (word.foundBy !== -1) continue;
          if (word.w === text || word.w === reversed) {
            word.foundBy = player;
            word.foundCells = cells;
            word.ts = now;
            state.players[player].found++;
            state.players[player].ticTrouve = state.tic || 0;
            avance(state, now);
            if (state.tourParTour) state.tour = (state.tour + 1) % state.players.length;
            if (state.words.every(function (x) { return x.foundBy !== -1; })) {
              state.phase = 'mystere';
              state.durationSec = Math.max(1, Math.round(state.chrono / 1000));
              return { ok: true, timer: { ms: 4600, action: { t: 'fin' } } };
            }
            return { ok: true };
          }
        }
        // mot de la liste déjà pris par quelqu’un ? message honnête
        for (var w2 = 0; w2 < state.words.length; w2++) {
          var word2 = state.words[w2];
          if (word2.foundBy !== -1 && (word2.w === text || word2.w === reversed)) {
            return {
              ok: false, error: '« ' + text + ' » a déjà été trouvé par ' +
                state.players[word2.foundBy].name + ' !'
            };
          }
        }
        return { ok: false, error: '« ' + text + ' » n’est pas dans la liste.' };
      }
      return { ok: false, error: 'Action inconnue.' };
    },

    /* l’ordinateur cherche lui aussi : il trouve un mot quand son temps de
       recherche (selon le niveau et la difficulté du mot) est écoulé ; en
       attendant, il fait battre l’horloge (une action « attente »). */
    bot: function (state, me, ctx) {
      if (state.phase !== 'play' || state.tourParTour) return null;
      var niveau = (ctx && ctx.niveau) || state.niveauIA || 'moyen';
      if (iaPrete(state, me, niveau)) {
        var w = cibleIA(state, me);
        if (w && w.cells) {
          var a = w.cells[0], b = w.cells[w.cells.length - 1];
          return hache('s' + state.seed + me + w.w) % 2 ? { t: 'claim', a: a, b: b } : { t: 'claim', a: b, b: a };
        }
      }
      for (var j = 0; j < state.players.length; j++) {
        if (j !== me && estIA(state, j) && iaPrete(state, j, niveau)) return null; // un autre robot a trouvé : à lui
      }
      return { t: 'attente' };
    },

    render: function (el, ctx) {
      var s = ctx.state;
      if (s.phase === 'setup') { renderAccueil(el, ctx); return; }
      renderJeu(el, ctx);
    },

    _buildGrid: buildGrid, _lineCells: function (size, a, b) { return lineCells({ size: size }, a, b); },
    _genere: genere, _construit: construit, _LEVELS: LEVELS, _NIVEAUX_IA: NIVEAUX_IA, _jourCle: jourCle,
    _occurrences: occurrences // tests
  };

  /* ================= affichage ================= */

  function ent(x, d) { x = Number(x); return isFinite(x) ? Math.floor(x) : (d || 0); }
  function lettreSure(c) { return /^[A-Z]$/.test(c) ? c : '?'; }
  function jouer(nom, o) { try { GG.sfx.play(nom, o); } catch (e) {} }
  function vibrer(t) { try { GG.haptic(t); } catch (e) {} }
  function nomJoueur(s, i) {
    var p = s.players && s.players[i];
    return p ? String(p.name == null ? '' : p.name) : '?';
  }

  function renderAccueil(el, ctx) {
    var s = ctx.state;
    if (el._melTimer) { clearInterval(el._melTimer); el._melTimer = null; }
    el._mel = null;
    var multi = s.players.length > 1;
    var avecIA = s.players.some(function (p, i) { return estIA(s, i); });
    var tourParTour = ctx.mode === 'local' && multi && !avecIA;
    var html = '<div class="mel-accueil">' +
      '<div class="mel-deco" aria-hidden="true">' + 'MOTS'.split('').map(function (c, i) {
        return '<span style="--i:' + i + '">' + c + '</span>';
      }).join('') + '</div>';
    if (ctx.me !== 0) {
      el.innerHTML = html + '<p class="waiting">⏳ ' + GG.esc(nomJoueur(s, 0)) + ' choisit la grille…</p></div>';
      return;
    }
    var jour = jourCle();
    var thj = themeDuJour(jour);
    var rec = lireLS('gg-meles-jour', null);
    var fait = rec && rec.date === jour;
    html += '<button class="mel-jour" data-a="jour"><span class="mel-jour-ic">📅</span><span class="mel-jour-tx">' +
      '<span class="mel-jour-t">Défi du jour</span><span class="mel-jour-s">' +
      (thj ? thj.ic + ' ' + GG.esc(thj.nom) : '') + ' · moyen' + (fait ? ' · 🏅 ' + fmtLong(rec.sec) : ' · la même grille pour tous') +
      '</span></span><span class="mel-jour-go">▶</span></button>';
    var choix = el._melTheme || '';
    html += '<p class="mel-titre-choix">Thème</p><div class="mel-themes">' +
      '<button class="mel-theme' + (choix === '' ? ' actif' : '') + '" data-th="">🎲 Surprise</button>' +
      themes().map(function (t) {
        return '<button class="mel-theme' + (choix === t.id ? ' actif' : '') + '" data-th="' + GG.esc(t.id) + '">' +
          t.ic + ' ' + GG.esc(t.nom) + '</button>';
      }).join('') + '</div>' +
      '<p class="mel-titre-choix">Niveau</p><div class="lvl-btns mel-lvls">' +
      Object.keys(LEVELS).map(function (l, i) {
        var c = LEVELS[l];
        return '<button class="btn big mel-lvl" data-lvl="' + l + '" style="--i:' + i + '">' +
          '<span class="mel-lvl-t">' + (l === 'facile' ? '😌' : l === 'moyen' ? '🙂' : '😈') + ' ' + c.nom + '</span>' +
          '<small>' + c.cols + '×' + c.rows + ' · ' + c.sous + '</small></button>';
      }).join('') + '</div>' +
      (tourParTour ? '<p class="hint mini-center">📱 Sur ce téléphone : chacun son tour, un mot trouvé et on passe le téléphone.</p>' : '') +
      '</div>';
    el.innerHTML = html;
    var pris = false;
    function lance(action) {
      if (pris) return;
      pris = true;
      jouer('select');
      if (tourParTour) action.tour = true;
      if (ctx.act(action) === false) pris = false;
    }
    el.querySelectorAll('.mel-theme').forEach(function (b) {
      b.addEventListener('click', function () {
        el._melTheme = b.getAttribute('data-th');
        el.querySelectorAll('.mel-theme').forEach(function (x) { x.classList.toggle('actif', x === b); });
        jouer('tap');
      });
    });
    el.querySelectorAll('[data-lvl]').forEach(function (b) {
      b.addEventListener('click', function () { lance({ t: 'level', l: b.getAttribute('data-lvl'), th: el._melTheme || '' }); });
    });
    el.querySelector('[data-a="jour"]').addEventListener('click', function () { lance({ t: 'level', m: 'jour' }); });
  }

  /* ---- la partie : construite une fois, puis mise à jour (le doigt qui
     glisse n’est jamais interrompu par un rafraîchissement) ---- */
  function renderJeu(el, ctx) {
    var s = ctx.state;
    var C = Math.max(3, Math.min(14, ent(s.cols || s.size, 8)));
    var R = Math.max(3, Math.min(14, ent(s.rows || s.size, 8)));
    var cle = ent(s.startTs) + ':' + C + 'x' + R + ':' + String(s.level);
    var m = el._mel;
    if (!m || m.cle !== cle || !el.querySelector('.mel-jeu')) m = construitDom(el, ctx, C, R, cle);
    m.ctx = ctx;
    majJeu(el, m, ctx);
  }

  function construitDom(el, ctx, C, R, cle) {
    var s = ctx.state;
    var grid = Array.isArray(s.grid) ? s.grid : [];
    var th = themeDe(s.theme);
    var html = '<div class="mel-jeu" style="--cols:' + C + ';--rows:' + R + '">' +
      '<div class="mel-barre">' +
      '<span class="mel-pill mel-theme-pill">' + (th ? th.ic + ' ' + GG.esc(th.nom) : '🔎 Mots mêlés') + (s.jour ? ' · 📅' : '') + '</span>' +
      '<span class="mel-pill" id="mel-compte"></span>' +
      '<span class="mel-barre-esp"></span>' +
      '<span class="mel-pill mel-chrono" id="mel-timer">⏱️ 0:00</span></div>' +
      '<div class="mel-plateau"><svg class="mel-traits" viewBox="0 0 ' + C + ' ' + R + '" preserveAspectRatio="none" aria-hidden="true">' +
      '<g class="mel-trouves"></g><line class="mel-sel" x1="0" y1="0" x2="0" y2="0"/></svg>' +
      '<div class="mel-grid" data-cols="' + C + '" data-rows="' + R + '" style="grid-template-columns:repeat(' + C + ',1fr)">';
    for (var i = 0; i < C * R; i++) {
      html += '<div class="mel-cell" data-i="' + i + '" style="--d:' + ((Math.floor(i / C) + i % C) * 22) + 'ms">' +
        lettreSure(grid[i]) + '</div>';
    }
    html += '</div></div>' +
      '<div class="mel-mystere" id="mel-mystere"></div>' +
      '<p class="mel-msg" id="mel-msg" aria-live="polite"></p>' +
      '<div class="mel-words" id="mel-words"></div>' +
      '<div class="mel-joueurs" id="mel-joueurs"></div>' +
      '<div class="mel-fin" id="mel-fin"></div>' +
      '</div>';
    el.innerHTML = html;
    // la grille arrive : on la montre en entier (l’accueil a pu être défilé)
    try { if ((root.scrollY || 0) > 0) root.scrollTo(0, 0); } catch (e) {}
    var m = el._mel = { cle: cle, trouves: {}, nTrouves: -1, ancre: -1, phase: '', entree: true, mystereVu: false };
    brancheDoigt(el, m, C, R);
    // chrono : un seul minuteur, qui s’arrête tout seul quand l’écran change
    if (el._melTimer) clearInterval(el._melTimer);
    el._melTimer = setInterval(function () {
      var t = el.querySelector('#mel-timer');
      if (!t || !t.isConnected || !el._mel || el._mel !== m) { clearInterval(el._melTimer); el._melTimer = null; return; }
      var st = m.ctx && m.ctx.state;
      if (st && st.phase === 'play') t.textContent = '⏱️ ' + fmt(chrono(st, Date.now()));
    }, 1000);
    return m;
  }

  function centre(i, C) { return { x: (i % C) + 0.5, y: Math.floor(i / C) + 0.5 }; }

  function majJeu(el, m, ctx) {
    var s = ctx.state;
    var C = ent(s.cols || s.size, 8), R = ent(s.rows || s.size, 8);
    var words = Array.isArray(s.words) ? s.words : [];
    var P = Array.isArray(s.players) ? s.players : [];
    var multi = P.length > 1;
    var now = Date.now();
    // les gélules des mots trouvés (chacun sa couleur)
    var g = el.querySelector('.mel-trouves');
    var nouveaux = [];
    var nbTrouves = 0;
    words.forEach(function (w, k) {
      var fb = ent(w.foundBy, -1);
      if (fb < 0) return;
      nbTrouves++;
      if (m.trouves[k]) return;
      var fc = Array.isArray(w.foundCells) ? w.foundCells : null;
      if (!fc || fc.length < 2) return;
      var a = ent(fc[0]), b = ent(fc[fc.length - 1]);
      if (!(a >= 0 && a < C * R && b >= 0 && b < C * R)) return;
      var p1 = centre(a, C), p2 = centre(b, C);
      var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', p1.x); line.setAttribute('y1', p1.y);
      line.setAttribute('x2', p2.x); line.setAttribute('y2', p2.y);
      line.setAttribute('class', 'mel-trait');
      line.style.setProperty('--c', TEINTES[k % TEINTES.length]);
      var ddx = p2.x - p1.x, ddy = p2.y - p1.y;
      line.style.setProperty('--l', String(Math.sqrt(ddx * ddx + ddy * ddy) + 1));
      g.appendChild(line);
      m.trouves[k] = line;
      if (m.nTrouves >= 0) { nouveaux.push({ k: k, line: line, fb: fb }); line.classList.add('neuf'); }
    });
    // la liste des mots
    var liste = el.querySelector('#mel-words');
    if (liste.childElementCount !== words.length) {
      liste.innerHTML = words.map(function (w, k) {
        return '<span class="mel-word" data-k="' + k + '" style="--c:' + TEINTES[k % TEINTES.length] + '">' +
          GG.esc(String(w.w || '').replace(/[^A-Z]/g, '')) + '</span>';
      }).join('');
    }
    words.forEach(function (w, k) {
      var chip = liste.children[k];
      var fb = ent(w.foundBy, -1);
      if (!chip) return;
      chip.classList.toggle('found', fb >= 0);
      if (multi && fb >= 0 && fb < P.length) chip.style.setProperty('--p', PCOLORS[fb % 4]);
      chip.classList.toggle('par', multi && fb >= 0);
    });
    el.querySelector('#mel-compte').textContent = '✓ ' + nbTrouves + ' / ' + words.length;
    // les joueurs (à plusieurs)
    var jr = el.querySelector('#mel-joueurs');
    jr.innerHTML = multi ? P.map(function (p, i) {
      return '<span class="mel-joueur' + (s.tourParTour && s.tour === i && s.phase === 'play' ? ' tour' : '') +
        '" style="--c:' + PCOLORS[i % 4] + '">' + GG.esc(p.name) + ' <strong>' +
        ((p.found || 0) + (p.bonus || 0)) + '</strong></span>';
    }).join('') : '';
    // le mot mystère
    majMystere(el, m, ctx, C, R);
    // le chrono
    var tm = el.querySelector('#mel-timer');
    tm.textContent = '⏱️ ' + fmt(s.phase === 'play' ? chrono(s, now) : ent(s.durationSec));
    // le message
    var msg = el.querySelector('#mel-msg');
    if (s.phase === 'play') {
      var monTour = !s.tourParTour || s.tour === ctx.me;
      msg.innerHTML = !monTour ? '⏳ Au tour de <strong>' + GG.esc(nomJoueur(s, s.tour)) + '</strong>…'
        : (m.ancre >= 0 ? 'Touchez maintenant la dernière lettre du mot.'
          : (nbTrouves === 0 ? '👆 Glissez le doigt sur un mot de la liste.' : ''));
      el.querySelector('.mel-jeu').classList.toggle('attente', !monTour);
    } else {
      msg.innerHTML = '';
    }
    // fin
    var fin = el.querySelector('#mel-fin');
    if (s.phase === 'mystere' && ctx.me === 0 && !fin.firstChild) {
      fin.innerHTML = '<button class="btn big primary" id="mel-finir">Voir le résultat</button>';
      var bf = fin.querySelector('#mel-finir');
      var armeLe = Date.now() + 900;
      bf.addEventListener('click', function () {
        if (Date.now() < armeLe || bf.disabled) return;
        bf.disabled = true;
        if (m.ctx.act({ t: 'fin' }) === false) bf.disabled = false;
      });
    }
    if (s.phase === 'play' || s.phase === 'fin') fin.innerHTML = '';
    // effets des nouveaux mots
    if (nouveaux.length) {
      nouveaux.forEach(function (n, i) {
        var moi = n.fb === ctx.me;
        setTimeout(function () {
          if (!n.line.isConnected) return;
          try {
            GG.fx.burst(n.line, { count: moi ? 18 : 8, shape: 'star', colors: [TEINTES[n.k % TEINTES.length], '#ffffff'], size: 0.8 });
          } catch (e) {}
          var chip = liste.children[n.k];
          if (chip) { chip.classList.remove('pop'); void chip.offsetWidth; chip.classList.add('pop'); }
        }, 120 + i * 80);
        jouer(moi ? 'correct' : 'pop', { volume: moi ? 0.8 : 0.5 });
        if (moi) vibrer('success');
      });
    }
    m.nTrouves = nbTrouves;
    if (m.phase !== s.phase) {
      var avant = m.phase;
      m.phase = s.phase;
      if (s.phase === 'mystere' && avant === 'play') revelation(el, m, ctx, C, R, true);
      else if (s.phase === 'mystere' || s.phase === 'fin') revelation(el, m, ctx, C, R, false);
    }
  }

  function casesRestantes(s, C, R) {
    var prises = {};
    (s.words || []).forEach(function (w) {
      var fc = Array.isArray(w.foundCells) ? w.foundCells : (Array.isArray(w.cells) ? w.cells : []);
      fc.forEach(function (i) { prises[ent(i)] = true; });
    });
    var out = [];
    for (var i = 0; i < C * R; i++) if (!prises[i]) out.push(i);
    return out;
  }

  function majMystere(el, m, ctx, C, R) {
    var s = ctx.state;
    var box = el.querySelector('#mel-mystere');
    var len = Math.max(0, Math.min(14, ent(s.mystereLen)));
    if (!len) { box.innerHTML = ''; return; }
    var connu = s.mystere && (s.phase !== 'play' || s.mystereTrouve >= 0) ? String(s.mystere).replace(/[^A-Z]/g, '') : '';
    var cleM = connu + '|' + s.phase + '|' + ent(s.mystereTrouve, -1) + '|' + (m.proposer ? 1 : 0);
    if (m.cleMystere === cleM) return;
    m.cleMystere = cleM;
    var cases = '';
    for (var i = 0; i < len; i++) {
      cases += '<span class="mel-mys-case' + (connu ? ' ok' : '') + '" style="--i:' + i + '">' + (connu ? GG.esc(connu.charAt(i)) : '') + '</span>';
    }
    var qui = ent(s.mystereTrouve, -1);
    var html = '<span class="mel-mys-t">🔮' + (len <= 7 ? ' Mot mystère' : '') + '</span><span class="mel-mys-cases" aria-label="Mot mystère de ' + len + ' lettres">' + cases + '</span>';
    if (qui >= 0) {
      html += '<span class="mel-mys-bonus">+3 · ' + GG.esc(nomJoueur(s, qui)) + '</span>';
    } else if (s.phase === 'play' && (!s.tourParTour || s.tour === ctx.me)) {
      html += '<button class="mel-mys-btn" data-a="proposer">' + (m.proposer ? '✕' : 'Je l’ai !') + '</button>';
    }
    box.innerHTML = html;
    if (m.proposer && s.phase === 'play' && qui < 0) {
      var f = document.createElement('div');
      f.className = 'mel-mys-form';
      f.innerHTML = '<input id="mel-mys-in" maxlength="' + len + '" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="' +
        len + ' lettres" aria-label="Mot mystère"><button class="btn small primary" data-a="valider">OK</button>';
      box.appendChild(f);
      var inp = f.querySelector('input');
      var valider = function () {
        var w = String(inp.value || '').toUpperCase();
        if (w.normalize) w = w.normalize('NFD').replace(/[̀-ͯ]/g, '');
        w = w.replace(/[^A-Z]/g, '');
        if (w.length !== len) { try { GG.fx.shake(inp); } catch (e) {} jouer('wrong'); return; }
        var res = m.ctx.act({ t: 'mystere', w: w });
        if (res === false) { try { GG.fx.shake(inp); } catch (e) {} jouer('wrong'); vibrer('error'); inp.select(); }
        else { m.proposer = false; jouer('success'); }
      };
      f.querySelector('[data-a="valider"]').addEventListener('click', valider);
      inp.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') valider(); });
      setTimeout(function () { try { inp.focus(); } catch (e) {} }, 30);
    }
    var bp = box.querySelector('[data-a="proposer"]');
    if (bp) {
      bp.addEventListener('click', function () {
        m.proposer = !m.proposer;
        m.cleMystere = '';
        jouer('tap');
        majMystere(el, m, m.ctx, C, R);
      });
    }
    if (connu && qui >= 0 && !m.mystereVu) {
      m.mystereVu = true;
      try { GG.fx.burst(box, { count: 26, shape: 'star' }); } catch (e) {}
    }
  }

  /* tous les mots trouvés : les lettres restantes s’allument et s’envolent
     vers le bandeau du mot mystère, puis confettis */
  function revelation(el, m, ctx, C, R, anime) {
    var s = ctx.state;
    var restantes = casesRestantes(s, C, R);
    var cases = el.querySelectorAll('.mel-mys-case');
    restantes.forEach(function (i, k) {
      var cell = el.querySelector('.mel-cell[data-i="' + i + '"]');
      if (!cell) return;
      cell.classList.add('restante');
      cell.style.setProperty('--k', k);
      if (anime && cases[k]) {
        setTimeout(function () {
          try { GG.fx.flyTo(cell, cases[k], { html: '<span class="mel-vol">' + GG.esc(cell.textContent) + '</span>', duration: 520, arc: 0.35 }); } catch (e) {}
          jouer('tick', { pitch: 1 + k * 0.07, volume: 0.5 });
        }, 350 + k * 140);
      }
    });
    if (anime) {
      el.querySelector('.mel-jeu').classList.add('fete');
      setTimeout(function () {
        jouer('reveal');
        vibrer('success');
        var box = el.querySelector('#mel-mystere');
        try { GG.fx.confetti({ count: 120, from: box || 'top', duration: 2200 }); } catch (e) {}
      }, 400 + restantes.length * 140 + 350);
    }
  }

  /* ---- sélection au doigt : une gélule suit le doigt ---- */
  function brancheDoigt(el, m, C, R) {
    var grille = el.querySelector('.mel-grid');
    var sel = el.querySelector('.mel-sel');
    var jeu = el.querySelector('.mel-jeu');
    var depart = -1, fin = -1, actif = false, idPointeur = null, bouge = false;
    var raf = 0;
    function caseSous(x, y) {
      var r = grille.getBoundingClientRect();
      var c = Math.floor((x - r.left) / r.width * C);
      var l = Math.floor((y - r.top) / r.height * R);
      if (c < 0) c = 0; if (c >= C) c = C - 1;
      if (l < 0) l = 0; if (l >= R) l = R - 1;
      return l * C + c;
    }
    /* aligne la fin sur l’une des 8 directions et la garde dans la grille */
    function aligne(a, b) {
      var r0 = Math.floor(a / C), c0 = a % C, r1 = Math.floor(b / C), c1 = b % C;
      var dr = r1 - r0, dc = c1 - c0, adr = Math.abs(dr), adc = Math.abs(dc);
      if (!adr && !adc) return a;
      var sr, sc, n;
      if (adc > 2 * adr) { sr = 0; sc = signe(dc); n = adc; }
      else if (adr > 2 * adc) { sr = signe(dr); sc = 0; n = adr; }
      else { sr = signe(dr); sc = signe(dc); n = Math.round((adr + adc) / 2); }
      while (n > 0 && (r0 + sr * n < 0 || r0 + sr * n >= R || c0 + sc * n < 0 || c0 + sc * n >= C)) n--;
      return (r0 + sr * n) * C + (c0 + sc * n);
    }
    function dessine(a, b, etat) {
      var p1 = centre(a, C), p2 = centre(b, C);
      sel.setAttribute('x1', p1.x); sel.setAttribute('y1', p1.y);
      sel.setAttribute('x2', p2.x); sel.setAttribute('y2', p2.y);
      sel.setAttribute('class', 'mel-sel ' + (etat || 'on'));
    }
    function efface() { sel.setAttribute('class', 'mel-sel'); }
    function peutJouer() {
      var ctx = m.ctx;
      if (!ctx) return false;
      var s = ctx.state;
      return s.phase === 'play' && (!s.tourParTour || s.tour === ctx.me);
    }
    function marqueAncre(i) {
      el.querySelectorAll('.mel-cell.ancre').forEach(function (c) { c.classList.remove('ancre'); });
      if (i >= 0) {
        var c = el.querySelector('.mel-cell[data-i="' + i + '"]');
        if (c) c.classList.add('ancre');
      }
    }
    function revendique(a, b) {
      var ctx = m.ctx;
      var avant = m.nTrouves;
      dessine(a, b, 'on');
      var res = ctx.act({ t: 'claim', a: a, b: b });
      if (res === false) {
        dessine(a, b, 'rate');
        jouer('wrong', { volume: 0.6 });
        vibrer('warning');
        setTimeout(function () { if (sel.getAttribute('class') === 'mel-sel rate') efface(); }, 520);
      } else if (m.nTrouves === avant && ctx.mode === 'guest') {
        setTimeout(efface, 700); // l’hôte répondra
      } else {
        efface();
      }
    }
    grille.addEventListener('pointerdown', function (ev) {
      if (!peutJouer() || (ev.button !== undefined && ev.button > 0)) return;
      ev.preventDefault();
      actif = true;
      bouge = false;
      idPointeur = ev.pointerId;
      try { grille.setPointerCapture(ev.pointerId); } catch (e) {}
      depart = caseSous(ev.clientX, ev.clientY);
      fin = depart;
      dessine(depart, fin, 'on');
      jouer('tap', { volume: 0.35 });
      vibrer('select');
    });
    grille.addEventListener('pointermove', function (ev) {
      if (!actif || ev.pointerId !== idPointeur) return;
      var b = aligne(depart, caseSous(ev.clientX, ev.clientY));
      if (b === fin) return;
      fin = b;
      bouge = true;
      if (!raf) {
        raf = requestAnimationFrame(function () {
          raf = 0;
          if (actif) { dessine(depart, fin, 'on'); jouer('tick', { volume: 0.18, pitch: 1.4 }); }
        });
      }
    });
    function lache(ev) {
      if (!actif || (ev && ev.pointerId !== idPointeur)) return;
      actif = false;
      try { grille.releasePointerCapture(idPointeur); } catch (e) {}
      if (fin !== depart && bouge) {
        m.ancre = -1;
        marqueAncre(-1);
        revendique(depart, fin);
        return;
      }
      // un simple toucher : première lettre, puis dernière lettre
      if (m.ancre < 0) {
        m.ancre = depart;
        marqueAncre(depart);
        dessine(depart, depart, 'on');
        var msg = el.querySelector('#mel-msg');
        if (msg) msg.textContent = 'Touchez maintenant la dernière lettre du mot.';
      } else if (m.ancre === depart) {
        m.ancre = -1;
        marqueAncre(-1);
        efface();
      } else {
        var a = m.ancre;
        m.ancre = -1;
        marqueAncre(-1);
        revendique(a, aligne(a, depart));
      }
    }
    grille.addEventListener('pointerup', lache);
    grille.addEventListener('pointercancel', function () { actif = false; efface(); });
    jeu.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });
  }

  /* records (seul) : enregistrés quand la partie se termine */
  var enregistrer = mod.apply;
  mod.apply = function (state, player, action, ctx) {
    var r = enregistrer(state, player, action, ctx);
    if (r.ok && state.phase === 'mystere' && state.players.length === 1 && action.t === 'claim') {
      var cle = state.jour ? 'gg-meles-jour' : 'gg-meles-record-' + state.level;
      var rec = lireLS(cle, null);
      var neuf = { sec: state.durationSec, ts: state.startTs, date: state.jour || '' };
      if (!rec || (state.jour && rec.date !== state.jour) || state.durationSec < rec.sec) ecrireLS(cle, neuf);
    }
    return r;
  };

  GG.register(mod);
  if (typeof module === 'object' && module.exports) module.exports = mod;
})(typeof self !== 'undefined' ? self : globalThis);
