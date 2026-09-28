/*
 * GGgames — Bonbons V2 : l'aventure sucrée (match-3, solo).
 *
 * Alignez 3 bonbons pour les croquer. 4 alignés = bonbon rayé, liaison en
 * L/T ou carré = bonbon enveloppé, 5 alignés = sucre magique. Des niveaux
 * dessinés à la main (60) puis générés sans fin, cinq sortes d'objectifs :
 * points, gelée à dégager, meringues à casser, bonbons d'une couleur à
 * récolter, noisettes à faire descendre.
 *
 * Le moteur est PUR (aucun effet, aucun DOM) : il résout chaque coup jusqu'à
 * une grille stable (plus aucun alignement en attente) et raconte au rendu,
 * étape par étape, ce qui s'est passé (échange, éclatements, chutes avec leur
 * trajet case par case, mélange…) pour que l'écran le rejoue en animation.
 */
(function (root) {
  'use strict';
  var GG = root.GG;
  var N = 8, NN = 64;
  var ARC = -1;  // sucre magique (joker de couleur)
  var ING = -2;  // noisette (ingrédient : ne se croque pas, descend jusqu'en bas)
  var TINTS = ['#ff4d6d', '#ff9b2f', '#ffd23f', '#3ddc84', '#3aa0ff', '#b36bff'];
  var NOMS_COULEURS = ['rouges', 'orange', 'jaunes', 'verts', 'bleus', 'violets'];

  /* hasard remplaçable (tests, simulations) */
  var RND = Math.random;
  function rnd() { return RND(); }
  function ri(n) { return Math.floor(RND() * n); }
  function mulberry(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var ROWC = [], COLC = [], ZEROS = [];
  for (var z0 = 0; z0 < NN; z0++) { ROWC.push(z0 >> 3); COLC.push(z0 & 7); ZEROS.push(0); }
  function zeros() { return ZEROS.slice(); }

  /* ================================================================
   * Plateau : pièces, trous, gelée, meringues
   * ================================================================ */
  function colorAt(b, i) { var p = b[i]; return p && p.t >= 0 ? p.t : -9; }

  /* Contexte d'un coup : le plateau d'un joueur et son enregistreur */
  function ctxOf(state, p, rec) {
    if (!p.jelly) p.jelly = zeros();
    if (!p.block) p.block = zeros();
    if (!p.got) p.got = { collect: {}, ingr: 0, spawned: 0 };
    if (!p.seq) p.seq = 0;
    return {
      b: p.board, jelly: p.jelly, block: p.block,
      holes: state.holes || ZEROS, types: state.types || 5,
      p: p, st: state, rec: rec || null, wave: 0, sa: -1, sb: -1,
      goal: state.goal || null
    };
  }
  function ouvert(E, i) { return !E.holes[i] && !E.block[i]; }
  function piece(E, t, s) { E.p.seq = (E.p.seq || 0) + 1; return { t: t, s: s || 0, id: E.p.seq }; }
  function assureIds(E) {
    for (var i = 0; i < NN; i++) if (E.b[i] && !E.b[i].id) E.b[i].id = ++E.p.seq;
  }

  /* ---- alignements ---- */
  /* Tous les alignements de 3+ (et les carrés 2×2) : [{cells, dir: 'h'|'v'|'q'}] */
  function findRuns(b) {
    var runs = [], r, c, t, start, k;
    for (r = 0; r < N; r++) {
      c = 0;
      while (c < N) {
        t = colorAt(b, r * N + c); start = c;
        if (t < 0) { c++; continue; }
        while (c < N && colorAt(b, r * N + c) === t) c++;
        if (c - start >= 3) {
          var run = { cells: [], dir: 'h' };
          for (k = start; k < c; k++) run.cells.push(r * N + k);
          runs.push(run);
        }
      }
    }
    for (c = 0; c < N; c++) {
      r = 0;
      while (r < N) {
        t = colorAt(b, r * N + c); start = r;
        if (t < 0) { r++; continue; }
        while (r < N && colorAt(b, r * N + c) === t) r++;
        if (r - start >= 3) {
          var run2 = { cells: [], dir: 'v' };
          for (k = start; k < r; k++) run2.cells.push(k * N + c);
          runs.push(run2);
        }
      }
    }
    // les carrés 2×2 comptent aussi (liaison « en carré »)
    for (r = 0; r < N - 1; r++) {
      for (c = 0; c < N - 1; c++) {
        var i = r * N + c;
        t = colorAt(b, i);
        if (t < 0) continue;
        if (colorAt(b, i + 1) === t && colorAt(b, i + N) === t && colorAt(b, i + N + 1) === t) {
          runs.push({ cells: [i, i + 1, i + N, i + N + 1], dir: 'q' });
        }
      }
    }
    return runs;
  }

  /* Un alignement passe-t-il par la case i ? (contrôle local et rapide) */
  function matchAt(b, i) {
    var t = colorAt(b, i);
    if (t < 0) return false;
    var r = ROWC[i], c = COLC[i], n = 1, k;
    for (k = c - 1; k >= 0 && colorAt(b, r * N + k) === t; k--) n++;
    for (k = c + 1; k < N && colorAt(b, r * N + k) === t; k++) n++;
    if (n >= 3) return true;
    n = 1;
    for (k = r - 1; k >= 0 && colorAt(b, k * N + c) === t; k--) n++;
    for (k = r + 1; k < N && colorAt(b, k * N + c) === t; k++) n++;
    if (n >= 3) return true;
    for (var dr = -1; dr <= 0; dr++) {
      for (var dc = -1; dc <= 0; dc++) {
        var rr = r + dr, cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= N - 1 || cc >= N - 1) continue;
        var j = rr * N + cc;
        if (colorAt(b, j) === t && colorAt(b, j + 1) === t && colorAt(b, j + N) === t && colorAt(b, j + N + 1) === t) return true;
      }
    }
    return false;
  }

  function adjacent(a, b2) {
    var ra = ROWC[a], ca = COLC[a], rb = ROWC[b2], cb = COLC[b2];
    return (ra === rb && Math.abs(ca - cb) === 1) || (ca === cb && Math.abs(ra - rb) === 1);
  }

  /* L'échange de deux voisins forme-t-il un alignement (autour de a ou de b2) ? */
  function wouldMatch(b, a, b2) {
    if (!b[a] || !b[b2]) return false;
    var tmp = b[a]; b[a] = b[b2]; b[b2] = tmp;
    var ok = matchAt(b, a) || matchAt(b, b2);
    tmp = b[a]; b[a] = b[b2]; b[b2] = tmp;
    return ok;
  }

  /* Nature d'un échange : null (interdit), 'match', 'combo', 'bomb', 'wipe' */
  function swapKind(E, a, b2) {
    if (a < 0 || b2 < 0 || a >= NN || b2 >= NN || !adjacent(a, b2)) return null;
    if (!ouvert(E, a) || !ouvert(E, b2)) return null;
    var pa = E.b[a], pb = E.b[b2];
    if (!pa || !pb) return null;
    if (pa.t === ARC && pb.t === ARC) return 'wipe';
    if (pa.t === ARC || pb.t === ARC) {
      var autre = pa.t === ARC ? pb : pa;
      return autre.t === ING ? null : 'bomb';
    }
    if (pa.s > 0 && pb.s > 0 && pa.t >= 0 && pb.t >= 0) return 'combo';
    return wouldMatch(E.b, a, b2) ? 'match' : null;
  }

  /* Reste-t-il au moins un échange jouable ? */
  function hasMoveE(E) {
    for (var i = 0; i < NN; i++) {
      if (!E.b[i] || !ouvert(E, i)) continue;
      if (COLC[i] < N - 1 && swapKind(E, i, i + 1)) return true;
      if (i < NN - N && swapKind(E, i, i + N)) return true;
    }
    return false;
  }
  /* Tous les échanges jouables [[a, b], …] */
  function allMoves(E) {
    var out = [];
    for (var i = 0; i < NN; i++) {
      if (!E.b[i] || !ouvert(E, i)) continue;
      if (COLC[i] < N - 1 && swapKind(E, i, i + 1)) out.push([i, i + 1]);
      if (i < NN - N && swapKind(E, i, i + N)) out.push([i, i + N]);
    }
    return out;
  }

  /* ---- les bonbons spéciaux qui naissent d'une vague ---- */
  /* Regroupe les alignements qui se touchent (partagent une case). */
  function groupRuns(runs) {
    var parent = runs.map(function (_, k) { return k; });
    function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
    var owner = {};
    runs.forEach(function (run, k) {
      run.cells.forEach(function (i) {
        if (owner[i] !== undefined) parent[find(k)] = find(owner[i]);
        else owner[i] = k;
      });
    });
    var groups = {};
    runs.forEach(function (run, k) {
      var g = find(k);
      if (!groups[g]) groups[g] = { runs: [], cells: [] };
      groups[g].runs.push(run);
      run.cells.forEach(function (i) { if (groups[g].cells.indexOf(i) === -1) groups[g].cells.push(i); });
    });
    return Object.keys(groups).map(function (k) { return groups[k]; });
  }

  /* 5 alignés → sucre magique · croisement en L/T → enveloppé · 4 alignés →
     rayé (ligne → raye la colonne, colonne → raye la ligne) · carré → enveloppé.
     Le bonbon naît sur la case échangée si elle fait partie du groupe. */
  function promoteFor(runs, b, sa, sb) {
    if (sb === undefined) sb = -1;
    var out = [], pris = {};
    groupRuns(runs).forEach(function (g) {
      var ligne5 = null, ligne4 = null, carre = null, hs = {}, vs = {}, cross = -1;
      g.runs.forEach(function (r) {
        if (r.dir === 'q') { if (!carre) carre = r; return; }
        if (r.cells.length >= 5 && (!ligne5 || r.cells.length > ligne5.cells.length)) ligne5 = r;
        if (r.cells.length === 4 && !ligne4) ligne4 = r;
        r.cells.forEach(function (i) { if (r.dir === 'h') hs[i] = 1; else vs[i] = 1; });
      });
      g.cells.forEach(function (i) { if (hs[i] && vs[i] && cross === -1) cross = i; });
      function pivot(cells, def) {
        if (sa >= 0 && cells.indexOf(sa) !== -1) return sa;
        if (sb >= 0 && cells.indexOf(sb) !== -1) return sb;
        return def;
      }
      var t = colorAt(b, g.cells[0]), promo = null;
      if (ligne5) promo = { i: pivot(ligne5.cells, ligne5.cells[Math.floor(ligne5.cells.length / 2)]), arc: true };
      else if (cross !== -1) promo = { i: pivot(g.cells, cross), s: 3, t: t };
      else if (ligne4) promo = { i: pivot(ligne4.cells, ligne4.cells[2]), s: ligne4.dir === 'h' ? 2 : 1, t: t };
      else if (carre) promo = { i: pivot(g.cells, carre.cells[0]), s: 3, t: t };
      if (promo && !pris[promo.i]) { pris[promo.i] = 1; out.push(promo); }
    });
    return out;
  }

  /* ================================================================
   * Une vague : éclatements, pouvoirs des spéciaux, gelée, meringues
   * ================================================================ */
  var PTS = { bonbon: 20, gelee: 100, meringue: 60, noisette: 1000, raye: 60, enveloppe: 100, magique: 200 };

  /* couleur la plus présente (le sucre magique pris dans une explosion la croque) */
  function couleurMajoritaire(E, sauf) {
    var n = [0, 0, 0, 0, 0, 0], best = -1, bn = 0;
    for (var i = 0; i < NN; i++) {
      var t = colorAt(E.b, i);
      if (t >= 0 && (!sauf || !sauf[i])) n[t]++;
    }
    for (var k = 0; k < 6; k++) if (n[k] > bn) { bn = n[k]; best = k; }
    return best;
  }

  /* Marque une case touchée par une explosion (zone) ; les noisettes y échappent */
  function frappe(E, marks, zone, i) {
    if (i < 0 || i >= NN || E.holes[i]) return;
    zone[i] = 1;
    var pc = E.b[i];
    if (pc && pc.t === ING) return;
    marks[i] = 1;
  }
  function frappeLigne(E, marks, zone, r) { if (r < 0 || r >= N) return; for (var c = 0; c < N; c++) frappe(E, marks, zone, r * N + c); }
  function frappeColonne(E, marks, zone, c) { if (c < 0 || c >= N) return; for (var r = 0; r < N; r++) frappe(E, marks, zone, r * N + c); }
  function frappeCarre(E, marks, zone, i, rayon) {
    var r0 = ROWC[i], c0 = COLC[i];
    for (var dr = -rayon; dr <= rayon; dr++) {
      for (var dc = -rayon; dc <= rayon; dc++) {
        var r = r0 + dr, c = c0 + dc;
        if (r >= 0 && r < N && c >= 0 && c < N) frappe(E, marks, zone, r * N + c);
      }
    }
  }

  /* Les spéciaux pris dans la vague libèrent leur pouvoir (en chaîne). */
  function propage(E, marks, zone, fired, st) {
    var encore = true;
    while (encore) {
      encore = false;
      for (var i = 0; i < NN; i++) {
        if (!marks[i] || fired[i]) continue;
        var pc = E.b[i];
        if (!pc || (pc.s === 0 && pc.t !== ARC)) continue;
        fired[i] = 1; encore = true;
        if (pc.t === ARC) {
          var coul = couleurMajoritaire(E, marks);
          if (coul < 0) coul = couleurMajoritaire(E, null);
          var cells = [];
          for (var j = 0; j < NN; j++) if (colorAt(E.b, j) === coul && !marks[j]) { marks[j] = 1; cells.push(j); }
          st.eats.push({ from: i, color: coul, cells: cells });
          st.arc++;
        } else if (pc.s === 1) { frappeLigne(E, marks, zone, ROWC[i]); st.rows.push(ROWC[i]); }
        else if (pc.s === 2) { frappeColonne(E, marks, zone, COLC[i]); st.cols.push(COLC[i]); }
        else if (pc.s === 3) { frappeCarre(E, marks, zone, i, 1); st.bombs.push(i); }
      }
    }
  }

  function nouvelleEtape(E) {
    return { k: 'clear', wave: E.wave, pops: [], born: [], jelly: [], blocks: [], rows: [], cols: [], bombs: [], eats: [], arc: 0, pts: 0, transform: [] };
  }

  /* Fait éclater ce qui est marqué. matchCells : cases croquées par alignement
     (elles ébrèchent les meringues voisines) ; born : spéciaux qui naissent ;
     zone : cases touchées par une explosion ; fired : spéciaux déjà consommés. */
  function detonate(E, marks, matchCells, born, zone, fired, st) {
    var p = E.p, i, k;
    zone = zone || zeros();
    fired = fired || {};
    propage(E, marks, zone, fired, st);
    var nb = 0, pts = 0;
    // 1) les bonbons croqués
    for (i = 0; i < NN; i++) {
      if (!marks[i]) continue;
      var pc = E.b[i];
      if (pc && pc.t !== ING) {
        st.pops.push([i, pc.id, pc.t, pc.s]);
        if (pc.t >= 0) {
          p.got.collect[pc.t] = (p.got.collect[pc.t] || 0) + 1;
        }
        E.b[i] = null;
        nb++;
      }
    }
    pts += nb * PTS.bonbon * E.wave;
    // 2) la gelée sous les cases croquées ou soufflées
    for (i = 0; i < NN; i++) {
      if ((marks[i] || zone[i]) && E.jelly[i] > 0 && !E.block[i] && !E.holes[i]) {
        E.jelly[i]--;
        st.jelly.push([i, E.jelly[i]]);
        pts += PTS.gelee;
      }
    }
    // 3) les meringues : soufflées par une explosion ou ébréchées par un alignement voisin
    var abime = {};
    for (i = 0; i < NN; i++) if (zone[i] && E.block[i] > 0) abime[i] = 1;
    for (k = 0; k < matchCells.length; k++) {
      var m = matchCells[k], r = ROWC[m], c = COLC[m];
      if (c > 0 && E.block[m - 1] > 0) abime[m - 1] = 1;
      if (c < N - 1 && E.block[m + 1] > 0) abime[m + 1] = 1;
      if (r > 0 && E.block[m - N] > 0) abime[m - N] = 1;
      if (r < N - 1 && E.block[m + N] > 0) abime[m + N] = 1;
    }
    for (var key in abime) {
      i = +key;
      E.block[i]--;
      st.blocks.push([i, E.block[i]]);
      pts += PTS.meringue;
    }
    // 4) les spéciaux qui naissent
    (born || []).forEach(function (pr) {
      if (E.b[pr.i] || !ouvert(E, pr.i)) return;
      var np = pr.arc ? piece(E, ARC, 0) : piece(E, pr.t, pr.s);
      E.b[pr.i] = np;
      st.born.push([pr.i, np.id, np.t, np.s]);
      pts += pr.arc ? PTS.magique : (pr.s === 3 ? PTS.enveloppe : PTS.raye);
    });
    st.pts = pts;
    return pts;
  }

  /* Enregistre une vague (pour le rendu) et ses totaux. */
  function joueVague(E, marks, matchCells, born, zone, fired, prep) {
    E.wave++;
    var st = nouvelleEtape(E);
    if (prep) prep(st);
    var pts = detonate(E, marks, matchCells, born, zone, fired, st);
    var R = E.rec;
    if (R) {
      R.gain += pts;
      if (E.wave > R.combo) R.combo = E.wave;
      st.rows.forEach(function (x) { if (R.rows.indexOf(x) === -1) R.rows.push(x); });
      st.cols.forEach(function (x) { if (R.cols.indexOf(x) === -1) R.cols.push(x); });
      st.bombs.forEach(function (x) { R.bombs.push(x); });
      R.arc += st.arc;
      st.pops.forEach(function (pp) { if (R.pops.length < 96) R.pops.push({ i: pp[0], t: pp[2], w: E.wave - 1 }); });
      if (R.steps) R.steps.push(st);
    }
    E.p.score += pts;
    return st;
  }

  /* ================================================================
   * Gravité : chutes (aussi en diagonale autour des meringues), pluie de
   * nouveaux bonbons, noisettes qui sortent par le bas
   * ================================================================ */
  function lanceur(E, c) {
    // première case réelle de la colonne ; une meringue y bouche l'arrivée
    for (var r = 0; r < N; r++) {
      var i = r * N + c;
      if (E.holes[i]) continue;
      return E.block[i] ? -1 : i;
    }
    return -1;
  }
  function sortie(E, c) {
    for (var r = N - 1; r >= 0; r--) {
      var i = r * N + c;
      if (!E.holes[i]) return i;
    }
    return -1;
  }
  function nbNoisettes(E) {
    var n = 0;
    for (var i = 0; i < NN; i++) if (E.b[i] && E.b[i].t === ING) n++;
    return n;
  }
  function nouveauBonbon(E) {
    var g = E.goal, p = E.p;
    if (g && g.k === 'ingr' && p.got.spawned < g.n) {
      var sur = nbNoisettes(E);
      if (sur < (g.max || 1) && (sur === 0 || rnd() < 0.12)) {
        p.got.spawned++;
        return piece(E, ING, 0);
      }
    }
    return piece(E, ri(E.types), 0);
  }

  /* Fait tomber tout ce qui peut tomber, tic par tic (un tic = une case). */
  function settle(E) {
    var b = E.b, ticks = [], spawns = [], tick, guard;
    var moved = new Array(NN);
    for (guard = 0; guard < 200; guard++) {
      var mv = [], i, r, c, j;
      for (i = 0; i < NN; i++) moved[i] = 0;
      // 0) une noisette posée sur un trou ou une meringue glisse en diagonale
      //    (sinon elle resterait coincée pour toujours)
      for (r = N - 2; r >= 0; r--) {
        for (c = 0; c < N; c++) {
          j = r * N + c;
          var pj = b[j], bas = j + N;
          if (!pj || pj.t !== ING || moved[j] || !ouvert(E, j)) continue;
          if (ouvert(E, bas)) continue; // elle peut tomber tout droit (ou attend)
          var cotes = [c > 0 ? bas - 1 : -1, c < N - 1 ? bas + 1 : -1];
          if (rnd() < 0.5) cotes.reverse();
          for (var q0 = 0; q0 < 2; q0++) {
            i = cotes[q0];
            if (i < 0 || b[i] || !ouvert(E, i)) continue;
            b[i] = pj; b[j] = null; moved[i] = 1;
            mv.push([pj.id, j, i]);
            break;
          }
        }
      }
      // 1) chute verticale (de bas en haut : toute la colonne descend d'un cran)
      for (r = N - 1; r >= 1; r--) {
        for (c = 0; c < N; c++) {
          i = r * N + c;
          if (b[i] || !ouvert(E, i)) continue;
          j = i - N;
          if (!ouvert(E, j) || !b[j] || moved[j]) continue;
          b[i] = b[j]; b[j] = null; moved[i] = 1;
          mv.push([b[i].id, j, i]);
        }
      }
      // 2) la pluie : chaque colonne ouverte en haut reçoit un bonbon neuf
      tick = ticks.length;
      for (c = 0; c < N; c++) {
        var L = lanceur(E, c);
        if (L < 0 || b[L]) continue;
        var np = nouveauBonbon(E);
        b[L] = np; moved[L] = 1;
        spawns.push([np.id, np.t, np.s, tick, L]);
      }
      // 3) en diagonale : une case que rien ne peut nourrir par le haut
      var nourrie = new Array(NN);
      for (r = 0; r < N; r++) {
        for (c = 0; c < N; c++) {
          i = r * N + c;
          if (!ouvert(E, i)) { nourrie[i] = false; continue; }
          if (lanceur(E, c) === i) { nourrie[i] = true; continue; }
          j = i - N;
          nourrie[i] = r > 0 && ouvert(E, j) && (!!b[j] || nourrie[j]);
        }
      }
      for (r = N - 1; r >= 1; r--) {
        for (c = 0; c < N; c++) {
          i = r * N + c;
          if (b[i] || !ouvert(E, i) || nourrie[i] || moved[i]) continue;
          var srcs = [c > 0 ? i - N - 1 : -1, c < N - 1 ? i - N + 1 : -1];
          if (rnd() < 0.5) srcs.reverse();
          for (var k = 0; k < 2; k++) {
            j = srcs[k];
            if (j < 0 || !b[j] || !ouvert(E, j) || moved[j]) continue;
            // la source ne pourrait-elle pas tomber tout droit ?
            var dessous = j + N;
            if (dessous < NN && ouvert(E, dessous) && !b[dessous]) continue;
            b[i] = b[j]; b[j] = null; moved[i] = 1;
            mv.push([b[i].id, j, i]);
            break;
          }
        }
      }
      if (!mv.length && !spawns.some(function (s) { return s[3] === tick; })) break;
      ticks.push(mv);
    }
    if (E.rec && E.rec.steps && (ticks.length || spawns.length)) {
      E.rec.steps.push({ k: 'fall', ticks: ticks, spawns: spawns });
    }
    return ticks.length;
  }

  /* Les noisettes arrivées tout en bas sortent (et comptent). */
  function exits(E) {
    var out = [];
    for (var c = 0; c < N; c++) {
      var i = sortie(E, c);
      if (i < 0 || !E.b[i] || E.b[i].t !== ING || E.block[i]) continue;
      out.push([i, E.b[i].id]);
      E.b[i] = null;
      E.p.got.ingr++;
      E.p.score += PTS.noisette;
      if (E.rec) E.rec.gain += PTS.noisette;
    }
    if (out.length && E.rec && E.rec.steps) E.rec.steps.push({ k: 'exit', ingr: out, pts: out.length * PTS.noisette });
    return out.length;
  }
  function settleAll(E) {
    if (E.unSeul) return;
    settle(E);
    for (var g = 0; g < 20 && exits(E); g++) settle(E);
  }

  /* Désamorce un alignement résiduel (filet de sécurité, ne sert jamais en pratique). */
  function defuse(E) {
    for (var g = 0; g < 50; g++) {
      var runs = findRuns(E.b);
      if (!runs.length) return;
      var i = -1;
      runs[0].cells.forEach(function (x) { if (i < 0 && E.b[x] && E.b[x].s === 0) i = x; });
      if (i < 0) i = runs[0].cells[0];
      var avant = E.b[i].t;
      for (var t = 0; t < 6; t++) {
        if (t === avant) continue;
        E.b[i].t = t;
        if (!matchAt(E.b, i)) break;
      }
      if (E.rec && E.rec.steps) E.rec.steps.push({ k: 'recolor', cells: [[E.b[i].id, E.b[i].t]] });
    }
  }

  /* Cascade : tant qu'il reste des alignements, ils éclatent et tout retombe. */
  function cascade(E) {
    for (var g = 0; g < 80; g++) {
      if (E.unSeul && E.wave >= 1) return;
      var runs = findRuns(E.b);
      if (!runs.length) return;
      var marks = zeros(), matchCells = [];
      runs.forEach(function (run) {
        run.cells.forEach(function (i) { if (!marks[i]) { marks[i] = 1; matchCells.push(i); } });
      });
      var born = promoteFor(runs, E.b, E.sa, E.sb);
      E.sa = -1; E.sb = -1;
      joueVague(E, marks, matchCells, born, null, null);
      settleAll(E);
    }
    defuse(E);
  }

  /* ================================================================
   * Les échanges
   * ================================================================ */
  function echangeSpeciaux(E, a, b2) {
    var pa = E.b[a], pb = E.b[b2], marks = zeros(), zone = zeros(), fired = {};
    var sA = pa.s, sB = pb.s, r0 = ROWC[b2], c0 = COLC[b2];
    fired[a] = 1; fired[b2] = 1;
    marks[a] = 1; marks[b2] = 1;
    joueVague(E, marks, [], [], zone, fired, function (st) {
      if (sA === 3 && sB === 3) {
        // enveloppé + enveloppé : déflagration géante de 5×5
        frappeCarre(E, marks, zone, b2, 2);
        st.bombs.push(b2); st.bombs.push(a);
        st.big = true;
      } else if (sA === 3 || sB === 3) {
        // rayé + enveloppé : trois lignes ET trois colonnes
        for (var d = -1; d <= 1; d++) {
          frappeLigne(E, marks, zone, r0 + d); frappeColonne(E, marks, zone, c0 + d);
          if (r0 + d >= 0 && r0 + d < N) st.rows.push(r0 + d);
          if (c0 + d >= 0 && c0 + d < N) st.cols.push(c0 + d);
        }
      } else {
        // rayé + rayé : la croix
        frappeLigne(E, marks, zone, r0); frappeColonne(E, marks, zone, c0);
        st.rows.push(r0); st.cols.push(c0);
      }
    });
    settleAll(E);
  }

  function echangeMagique(E, a, b2) {
    var bombe = E.b[a].t === ARC ? a : b2, autre = bombe === a ? b2 : a;
    var cible = E.b[autre], coul = cible.t, s = cible.s;
    var marks = zeros(), fired = {}, cells = [], j;
    fired[bombe] = 1; marks[bombe] = 1;
    if (s === 1 || s === 2) {
      // sucre magique + rayé : toute la couleur devient rayée… et tout part
      joueVague(E, marks, [], [], null, fired, function (st) {
        for (j = 0; j < NN; j++) {
          var pc = E.b[j];
          if (pc && pc.t === coul) {
            if (pc.s === 0) { pc.s = 1 + ri(2); st.transform.push([j, pc.id, pc.s]); }
            marks[j] = 1; cells.push(j);
          }
        }
        st.eats.push({ from: bombe, color: coul, cells: cells });
        st.arc++;
      });
      settleAll(E);
      return;
    }
    // sucre magique + bonbon (ou enveloppé) : toute la couleur est croquée
    joueVague(E, marks, [], [], null, fired, function (st) {
      for (j = 0; j < NN; j++) if (colorAt(E.b, j) === coul) { marks[j] = 1; cells.push(j); }
      st.eats.push({ from: bombe, color: coul, cells: cells });
      st.arc++;
    });
    settleAll(E);
    if (s === 3 && !E.unSeul) {
      // … et avec un enveloppé, une deuxième couleur y passe aussi
      var c2 = couleurMajoritaire(E, null);
      if (c2 >= 0) {
        var m2 = zeros(), cells2 = [];
        joueVague(E, m2, [], [], null, {}, function (st) {
          for (j = 0; j < NN; j++) if (colorAt(E.b, j) === c2) { m2[j] = 1; cells2.push(j); }
          st.eats.push({ from: autre, color: c2, cells: cells2 });
          st.arc++;
        });
        settleAll(E);
      }
    }
  }

  function echangeDeuxMagiques(E) {
    var marks = zeros(), zone = zeros(), fired = {};
    joueVague(E, marks, [], [], zone, fired, function (st) {
      for (var i = 0; i < NN; i++) {
        if (E.holes[i]) continue;
        zone[i] = 1;
        var pc = E.b[i];
        if (pc && pc.t === ING) continue;
        marks[i] = 1;
        if (pc && (pc.s > 0 || pc.t === ARC)) fired[i] = 1; // tout part d'un coup, sans réaction en chaîne
      }
      st.wipe = true;
    });
    if (E.rec) E.rec.wipe = true;
    settleAll(E);
  }

  /* Joue un échange complet (déjà validé) jusqu'à une grille stable. */
  function joueEchange(E, a, b2, kind) {
    assureIds(E);
    if (E.rec && E.rec.steps) E.rec.steps.push({ k: 'swap', a: a, b: b2, kind: kind });
    if (kind === 'match') {
      var tmp = E.b[a]; E.b[a] = E.b[b2]; E.b[b2] = tmp;
      E.sa = b2; E.sb = a;
      cascade(E);
    } else {
      if (kind === 'combo') echangeSpeciaux(E, a, b2);
      else if (kind === 'bomb') echangeMagique(E, a, b2);
      else echangeDeuxMagiques(E);
      E.sa = -1; E.sb = -1;
      cascade(E);
    }
  }

  /* ================================================================
   * Mélange (plus aucun coup) : les mêmes bonbons, spéciaux compris,
   * changent de place — la grille n'est jamais « régénérée ».
   * ================================================================ */
  function shuffleBoard(E) {
    var pos = [], pcs = [], i, k, t;
    for (i = 0; i < NN; i++) {
      var pc = E.b[i];
      if (pc && ouvert(E, i) && pc.t !== ING) { pos.push(i); pcs.push(pc); }
    }
    var ok = false, essai;
    for (essai = 0; essai < 80 && !ok; essai++) {
      var ordre = pcs.slice();
      for (k = ordre.length - 1; k > 0; k--) { var j = ri(k + 1); t = ordre[k]; ordre[k] = ordre[j]; ordre[j] = t; }
      for (k = 0; k < pos.length; k++) E.b[pos[k]] = ordre[k];
      ok = !findRuns(E.b).length && hasMoveE(E);
    }
    var recolor = [];
    // secours : on repeint les bonbons ordinaires (les spéciaux gardent tout)
    for (essai = 0; essai < 300 && !ok; essai++) {
      recolor = [];
      for (k = 0; k < pos.length; k++) {
        var q = E.b[pos[k]];
        if (q.s === 0 && q.t >= 0) { q.t = ri(E.types); recolor.push([q.id, q.t]); }
      }
      ok = !findRuns(E.b).length && hasMoveE(E);
    }
    if (!ok) defuse(E);
    if (E.rec) {
      E.rec.shuffled = true;
      if (E.rec.steps) {
        var mv = [];
        for (i = 0; i < NN; i++) if (E.b[i] && E.b[i].t !== ING) mv.push([E.b[i].id, i]);
        E.rec.steps.push({ k: 'shuffle', to: mv, recolor: recolor });
      }
    }
    return ok;
  }
  function ensureMoves(E) {
    if (hasMoveE(E)) return false;
    shuffleBoard(E);
    return true;
  }

  /* ================================================================
   * Plateau de départ : aucun alignement déjà formé, au moins un coup
   * ================================================================ */
  function createsRun(b, i, t) {
    var r = ROWC[i], c = COLC[i];
    if (c >= 2 && colorAt(b, i - 1) === t && colorAt(b, i - 2) === t) return true;
    if (r >= 2 && colorAt(b, i - N) === t && colorAt(b, i - 2 * N) === t) return true;
    if (r >= 1 && c >= 1 && colorAt(b, i - 1) === t && colorAt(b, i - N) === t && colorAt(b, i - N - 1) === t) return true;
    return false;
  }
  function remplit(E) {
    for (var i = 0; i < NN; i++) {
      if (!ouvert(E, i)) { E.b[i] = null; continue; }
      if (E.b[i] && E.b[i].t === ING) continue;
      var t, guard = 0;
      do { t = ri(E.types); guard++; } while (guard < 40 && createsRun(E.b, i, t));
      E.b[i] = piece(E, t, 0);
    }
  }
  /* compat : grille pleine 8×8 sans alignement */
  function buildBoard(types) {
    var p = { board: new Array(NN), seq: 0 };
    var E = ctxOf({ types: types }, p, null);
    for (var g = 0; g < 50; g++) {
      remplit(E);
      if (!findRuns(E.b).length && hasMoveE(E)) break;
    }
    return p.board;
  }

  /* ================================================================
   * Les niveaux
   * ================================================================ */
  /* Légende des plans : . case · x trou · j gelée · J double gelée ·
     m meringue · M meringue double · k meringue sur gelée · n noisette de départ */
  function parsePlan(plan) {
    var holes = zeros(), jelly = zeros(), block = zeros(), noisettes = [];
    if (!plan) return { holes: holes, jelly: jelly, block: block, noisettes: noisettes };
    for (var r = 0; r < N; r++) {
      var ligne = plan[r] || '........';
      for (var c = 0; c < N; c++) {
        var ch = ligne.charAt(c), i = r * N + c;
        if (ch === 'x') holes[i] = 1;
        else if (ch === 'j') jelly[i] = 1;
        else if (ch === 'J') jelly[i] = 2;
        else if (ch === 'm') block[i] = 1;
        else if (ch === 'M') block[i] = 2;
        else if (ch === 'k') { block[i] = 1; jelly[i] = 1; }
        else if (ch === 'n') noisettes.push(i);
      }
    }
    return { holes: holes, jelly: jelly, block: block, noisettes: noisettes };
  }

  var LEVELS_DATA = [];
  /* Les 60 niveaux dessinés à la main. Coups, cibles, quantités et étoiles
     viennent du calibrage : taux de réussite simulé du joueur « meilleur coup
     immédiat » (indiqué en commentaire), sur une pente régulière avec des
     niveaux de respiration (après chaque boss et à mi-monde). */
  LEVELS_DATA.push(
    /* ===== Prairie Guimauve ===== */
    { g: 'score', c: 5, m: 20, n: 7600, s: [7600, 14200, 19000], plan: null }, // 1 · 96 %
    { g: 'score', c: 5, m: 18, n: 5400, s: [5400, 10100, 13700], plan: ['xx....xx', 'x......x', '........', '........', '........', '........', 'x......x', 'xx....xx'] }, // 2 · 95 %
    { g: 'jelly', c: 5, m: 15, s: [0, 14300, 22500], plan: ['........', '.jjjjjj.', '.jjjjjj.', '.jjjjjj.', '.jjjjjj.', '........', '........', '........'] }, // 3 · 97 %
    { g: 'collect', c: 5, m: 16, want: { 0: 30 }, s: [0, 14500, 29200], plan: ['x......x', '........', '........', '........', '........', '........', '........', 'x......x'] }, // 4 · 93 %
    { g: 'jelly', c: 5, m: 24, s: [0, 16300, 23400], plan: ['........', '........', '........', 'jjjjjjjj', 'jjjjjjjj', 'xjjjjjjx', 'xxjjjjxx', 'xxxjjxxx'] }, // 5 · 91 %
    { g: 'score', c: 5, m: 16, n: 3200, s: [3200, 5900, 8200], plan: ['x..xx..x', '........', '........', '........', 'x......x', 'xx....xx', 'xxx..xxx', 'xxxxxxxx'] }, // 6 · 97 %
    { g: 'collect', c: 5, m: 18, want: { 1: 20, 3: 20 }, s: [0, 9500, 15800], plan: ['........', '........', '..x..x..', '........', '........', '..x..x..', '........', '........'] }, // 7 · 96 %
    { g: 'jelly', c: 5, m: 24, s: [0, 17000, 25500], plan: ['........', '.jjjjjj.', '.jJJJJj.', '.jJxxJj.', '.jJxxJj.', '.jJJJJj.', '.jjjjjj.', '........'] }, // 8 · 92 %
    { g: 'jelly', c: 5, m: 27, s: [0, 23200, 33900], plan: ['xjjjjjjx', 'jjjjjjjj', 'jjjjjjjj', 'jjj..jjj', 'jjj..jjj', 'jjjjjjjj', 'jjjjjjjj', 'xjjjjjjx'] }, // 9 · 89 %
    { g: 'jelly', c: 5, m: 28, s: [0, 32300, 41300], plan: ['jjjjjjjj', 'jJJJJJJj', 'jJJJJJJj', 'jJJJJJJj', 'jJJJJJJj', 'jJJJJJJj', 'jJJJJJJj', 'jjjjjjjj'] }, // 10 · 87 %
    /* ===== Forêt Chocolat ===== */
    { g: 'blocks', c: 5, m: 12, s: [0, 11000, 22000], plan: ['........', '........', '........', 'mm.mm.mm', '........', '........', '........', '........'] }, // 11 · 96 %
    { g: 'blocks', c: 5, m: 13, s: [0, 11800, 25100], plan: ['........', '........', '.MM..MM.', '.MM..MM.', '........', '........', '........', '........'] }, // 12 · 87 %
    { g: 'jelly', c: 5, m: 12, s: [0, 13500, 23400], plan: ['........', '.m....m.', '..jjjj..', '.jjjjjj.', 'mjjjjjjm', '.jjjjjj.', '..jjjj..', '.m....m.'] }, // 13 · 84 %
    { g: 'collect', c: 5, m: 18, want: { 2: 45 }, s: [0, 16200, 25200], plan: ['x......x', '........', 'mm....mm', '........', '........', 'mm....mm', '........', 'x......x'] }, // 14 · 80 %
    { g: 'score', c: 5, m: 18, n: 8200, s: [8200, 13200, 17900], plan: ['........', '........', '..mmmm..', '..m..m..', '..m..m..', '..mmmm..', '........', '........'] }, // 15 · 91 %
    { g: 'blocks', c: 5, m: 13, s: [0, 12600, 23000], plan: ['........', 'm.m.m.m.', '........', '.m.m.m.m', '........', 'm.m.m.m.', '........', '........'] }, // 16 · 95 %
    { g: 'jelly', c: 5, m: 20, s: [0, 23500, 39600], plan: ['........', '.JJJJJJ.', '.JkJJkJ.', '.JJJJJJ.', '.JJJJJJ.', '.JkJJkJ.', '.JJJJJJ.', '........'] }, // 17 · 84 %
    { g: 'blocks', c: 5, m: 24, s: [0, 15900, 26700], plan: ['........', '.MMMMMM.', '.M....M.', '.M....M.', '.M....M.', '.M....M.', '.MMMMMM.', '........'] }, // 18 · 83 %
    { g: 'collect', c: 6, m: 20, want: { 4: 20, 5: 20 }, s: [0, 7600, 11100], plan: ['xx....xx', 'x......x', '........', '...mm...', '...mm...', '........', 'x......x', 'xx....xx'] }, // 19 · 78 %
    { g: 'blocks', c: 5, m: 24, s: [0, 19300, 29600], plan: ['........', '.M.MM.M.', '........', 'M.M..M.M', '........', '.M.MM.M.', '........', 'M.M..M.M'] }, // 20 · 83 %
    /* ===== Lagon Réglisse ===== */
    { g: 'ingr', c: 5, m: 24, n: 1, max: 1, s: [0, 15900, 25700], plan: null }, // 21 · 98 %
    { g: 'ingr', c: 5, m: 22, n: 2, max: 1, s: [0, 16300, 22900], plan: ['........', '........', '........', '........', '........', '........', 'x......x', 'xx....xx'] }, // 22 · 78 %
    { g: 'jelly', c: 5, m: 26, s: [0, 18600, 25500], plan: ['jjjxxjjj', 'jjjjjjjj', 'jjj..jjj', 'jj....jj', 'jj....jj', 'jjj..jjj', 'jjjjjjjj', 'jjjxxjjj'] }, // 23 · 80 %
    { g: 'ingr', c: 5, m: 23, n: 2, max: 1, s: [0, 19800, 32300], plan: ['........', '........', '..m..m..', '........', '.m....m.', '........', '........', '........'] }, // 24 · 72 %
    { g: 'collect', c: 5, m: 20, want: { 0: 25, 4: 25 }, s: [0, 8800, 14100], plan: ['........', '.x....x.', '........', '...xx...', '...xx...', '........', '.x....x.', '........'] }, // 25 · 81 %
    { g: 'score', c: 5, m: 20, n: 3200, s: [3200, 4700, 6600], plan: ['x......x', '........', '...xx...', '..x..x..', '..x..x..', '...xx...', '........', 'x......x'] }, // 26 · 87 %
    { g: 'ingr', c: 5, m: 22, n: 3, max: 2, s: [0, 15900, 23800], plan: ['xx....xx', 'x......x', '........', '........', '........', '........', '........', '........'] }, // 27 · 77 %
    { g: 'blocks', c: 5, m: 21, s: [0, 19400, 32200], plan: ['........', '........', 'MM....MM', 'M.mmmm.M', 'M.mmmm.M', 'MM....MM', '........', '........'] }, // 28 · 75 %
    { g: 'jelly', c: 5, m: 18, s: [0, 20800, 29200], plan: ['........', 'jjjjjjjj', 'jkjjjjkj', 'jjJJJJjj', 'jjJJJJjj', 'jkjjjjkj', 'jjjjjjjj', '........'] }, // 29 · 71 %
    { g: 'ingr', c: 5, m: 20, n: 3, max: 2, s: [0, 17600, 28600], plan: ['........', '........', '.MM..MM.', '........', '...mm...', '........', '........', 'x......x'] }, // 30 · 70 %
    /* ===== Montagne Meringue ===== */
    { g: 'jelly', c: 6, m: 28, s: [0, 13500, 17700], plan: ['........', '........', 'jjjjjjjj', 'jjjjjjjj', 'jjjjjjjj', 'jjjjjjjj', '........', '........'] }, // 31 · 83 %
    { g: 'blocks', c: 6, m: 17, s: [0, 6500, 9000], plan: ['xx....xx', 'x......x', '..m..m..', '.mMmmMm.', '.mMmmMm.', '..m..m..', 'x......x', 'xx....xx'] }, // 32 · 72 %
    { g: 'collect', c: 6, m: 20, want: { 1: 30 }, s: [0, 9900, 15700], plan: ['........', '..mmmm..', '........', 'm......m', 'm......m', '........', '..mmmm..', '........'] }, // 33 · 63 %
    { g: 'ingr', c: 5, m: 26, n: 2, max: 1, s: [0, 16000, 23000], plan: ['........', '........', '........', '...xx...', '...xx...', '........', '........', '........'] }, // 34 · 67 %
    { g: 'jelly', c: 5, m: 27, s: [0, 16300, 20700], plan: ['xxjjjjxx', 'xjjjjjjx', 'jjJJJJjj', 'jjJxxJjj', 'jjJxxJjj', 'jjJJJJjj', 'xjjjjjjx', 'xxjjjjxx'] }, // 35 · 77 %
    { g: 'score', c: 6, m: 20, n: 5600, s: [5600, 7700, 10300], plan: ['........', '........', '........', '........', '........', '........', '........', '........'] }, // 36 · 75 %
    { g: 'blocks', c: 6, m: 30, s: [0, 12600, 17400], plan: ['........', 'MMM..MMM', '........', '.m....m.', '.m....m.', '........', 'MMM..MMM', '........'] }, // 37 · 64 %
    { g: 'collect', c: 6, m: 22, want: { 2: 30, 3: 30 }, s: [0, 9900, 13900], plan: ['x......x', '........', '.m.mm.m.', '........', '........', '.m.mm.m.', '........', 'x......x'] }, // 38 · 60 %
    { g: 'ingr', c: 5, m: 21, n: 3, max: 2, s: [0, 18500, 28900], plan: ['........', '.m....m.', '........', '..MMMM..', '........', '.m....m.', '........', '........'] }, // 39 · 66 %
    { g: 'jelly', c: 5, m: 28, s: [0, 34300, 42900], plan: ['JJJJJJJJ', 'JJJJJJJJ', 'JJkJJkJJ', 'JJJJJJJJ', 'JJJJJJJJ', 'JJkJJkJJ', 'JJJJJJJJ', 'JJJJJJJJ'] }, // 40 · 51 %
    /* ===== Désert Caramel ===== */
    { g: 'collect', c: 5, m: 18, want: { 0: 30, 2: 30, 4: 30 }, s: [0, 9300, 14400], plan: ['xxx..xxx', 'xx....xx', 'x......x', '........', '........', 'x......x', 'xx....xx', 'xxx..xxx'] }, // 41 · 75 %
    { g: 'jelly', c: 5, m: 30, s: [0, 14500, 18000], plan: ['jjjxxjjj', 'jjjxxjjj', 'jjjxxjjj', 'jjjjjjjj', 'jjjjjjjj', 'jjjxxjjj', 'jjjxxjjj', 'jjjxxjjj'] }, // 42 · 55 %
    { g: 'ingr', c: 5, m: 19, n: 2, max: 1, s: [0, 13400, 22400], plan: ['xx....xx', 'x......x', '...mm...', '..mMMm..', '........', '........', 'x......x', 'xx....xx'] }, // 43 · 64 %
    { g: 'blocks', c: 6, m: 21, s: [0, 9200, 13100], plan: ['........', '.MmmmmM.', '.m....m.', '.m.MM.m.', '.m.MM.m.', '.m....m.', '.MmmmmM.', '........'] }, // 44 · 62 %
    { g: 'score', c: 6, m: 18, n: 4400, s: [4400, 5700, 7400], plan: ['x.x..x.x', '........', 'x......x', '........', '........', 'x......x', '........', 'x.x..x.x'] }, // 45 · 61 %
    { g: 'jelly', c: 5, m: 19, s: [0, 22400, 32200], plan: ['........', 'jjjjjjjj', 'jJJJJJJj', 'jJ....Jj', 'jJ....Jj', 'jJJJJJJj', 'jjjjjjjj', '........'] }, // 46 · 72 %
    { g: 'collect', c: 6, m: 22, want: { 1: 30, 5: 30 }, s: [0, 11200, 15700], plan: ['........', '.M....M.', '........', '...MM...', '...MM...', '........', '.M....M.', '........'] }, // 47 · 54 %
    { g: 'ingr', c: 5, m: 17, n: 3, max: 2, s: [0, 16200, 30000], plan: ['........', '........', 'm.m..m.m', '........', '.m.mm.m.', '........', '........', 'x......x'] }, // 48 · 54 %
    { g: 'blocks', c: 5, m: 26, s: [0, 20300, 31000], plan: ['MM....MM', 'M......M', '..m..m..', 'x..MM..x', 'x..MM..x', '..m..m..', 'M......M', 'MM....MM'] }, // 49 · 46 %
    { g: 'jelly', c: 5, m: 28, s: [0, 33900, 41200], plan: ['JJJJJJJJ', 'JMJJJJMJ', 'JJJJJJJJ', 'JJJMMJJJ', 'JJJMMJJJ', 'JJJJJJJJ', 'JMJJJJMJ', 'JJJJJJJJ'] }, // 50 · 45 %
    /* ===== Volcan Praline ===== */
    { g: 'ingr', c: 5, m: 21, n: 2, max: 1, s: [0, 17400, 27300], plan: ['........', '........', '...mm...', '........', '........', '...mm...', '........', '........'] }, // 51 · 73 %
    { g: 'jelly', c: 5, m: 38, s: [0, 27600, 35300], plan: ['xJJJJJJx', 'JJJJJJJJ', 'JJxJJxJJ', 'JJJJJJJJ', 'JJJJJJJJ', 'JJxJJxJJ', 'JJJJJJJJ', 'xJJJJJJx'] }, // 52 · 51 %
    { g: 'blocks', c: 6, m: 33, s: [0, 14100, 19200], plan: ['........', 'MMM.MMMM', 'm......m', 'm.MMMM.m', 'm.MMMM.m', 'm......m', 'MMMM.MMM', '........'] }, // 53 · 49 %
    { g: 'collect', c: 6, m: 20, want: { 0: 25, 3: 25, 5: 25 }, s: [0, 8700, 12300], plan: ['x......x', '.m....m.', '........', '..MMMM..', '........', '.m....m.', '........', 'x......x'] }, // 54 · 46 %
    { g: 'ingr', c: 5, m: 17, n: 3, max: 2, s: [0, 15400, 23100], plan: ['xx....xx', '........', '.m.MM.m.', '........', '..m..m..', '........', 'M......M', 'xx....xx'] }, // 55 · 55 %
    { g: 'score', c: 6, m: 16, n: 4300, s: [4300, 5800, 7500], plan: ['xx....xx', 'x......x', '..m..m..', '........', '........', '..m..m..', 'x......x', 'xx....xx'] }, // 56 · 61 %
    { g: 'jelly', c: 5, m: 27, s: [0, 34300, 44700], plan: ['JkJJJJkJ', 'JJJJJJJJ', 'kJJkkJJk', 'JJJJJJJJ', 'JJJJJJJJ', 'kJJkkJJk', 'JJJJJJJJ', 'JkJJJJkJ'] }, // 57 · 49 %
    { g: 'blocks', c: 5, m: 23, s: [0, 19600, 28000], plan: ['MM.MM.MM', '........', '.MM.MM.M', '........', '........', 'M.MM.MM.', '........', 'MM.MM.MM'] }, // 58 · 49 %
    { g: 'collect', c: 6, m: 22, want: { 2: 25, 4: 25 }, s: [0, 8200, 11700], plan: ['xxx..xxx', 'x..mm..x', '........', '.M....M.', '.M....M.', '........', 'x..mm..x', 'xxx..xxx'] }, // 59 · 49 %
    { g: 'ingr', c: 6, m: 31, n: 3, max: 2, s: [0, 14600, 18000], plan: ['........', '.MM..MM.', '........', '..mmmm..', '........', '.m....m.', '........', 'x..xx..x'] } // 60 · 44 %
  );
  function levelDef(n) {
    n = Math.max(1, n | 0);
    if (n <= LEVELS_DATA.length) return LEVELS_DATA[n - 1];
    return genLevel(n);
  }
  /* ---- au-delà des niveaux dessinés : des niveaux générés, sans fin et sans
     boucle (chaque numéro a sa graine : forme, obstacles, objectif, couleurs) ---- */
  function hashN(s) {
    var h = 2166136261;
    s = String(s);
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  var FORMES = [
    null,
    ['xx....xx', 'x......x', '........', '........', '........', '........', 'x......x', 'xx....xx'],
    ['x......x', '........', '........', '........', '........', '........', '........', 'x......x'],
    ['...xx...', '........', '........', 'x......x', 'x......x', '........', '........', '...xx...'],
    ['xxx..xxx', 'xx....xx', 'x......x', '........', '........', 'x......x', 'xx....xx', 'xxx..xxx'],
    ['........', '........', '...xx...', '..x..x..', '..x..x..', '...xx...', '........', '........'],
    ['x..xx..x', '........', '........', '........', 'x......x', 'xx....xx', 'xxx..xxx', 'xxxxxxxx'],
    ['........', '.x....x.', '........', '...xx...', '...xx...', '........', '.x....x.', '........'],
    ['xx....xx', 'xx....xx', '........', '........', '........', '........', 'xx....xx', 'xx....xx'],
    ['........', '........', '........', '........', '........', 'x......x', 'xx....xx', 'xxx..xxx'],
    ['xxx..xxx', 'xx....xx', '........', '........', '........', '........', 'xx....xx', 'xxx..xxx'],
    ['.x.xx.x.', '........', '........', '........', '........', '........', '........', '.x.xx.x.'],
    ['........', 'x......x', 'xx....xx', '........', '........', 'xx....xx', 'x......x', '........'],
    ['xx....xx', '........', '........', '...xx...', '...xx...', '........', '........', 'xx....xx']
  ];
  var TYPES_GEN = ['jelly', 'blocks', 'collect', 'ingr', 'score'];
  var POIDS_GEN = [0.27, 0.22, 0.2, 0.16, 0.15];
  function typeBrut(n) {
    var x = mulberry(hashN('type-' + n))(), acc = 0;
    for (var k = 0; k < TYPES_GEN.length; k++) { acc += POIDS_GEN[k]; if (x < acc) return TYPES_GEN[k]; }
    return 'jelly';
  }
  function typeGen(n) {
    var t = typeBrut(n), k = (n - 1) % 10 + 1;
    if (k === 10 && (t === 'score' || t === 'collect')) t = n % 3 === 0 ? 'ingr' : (n % 3 === 1 ? 'jelly' : 'blocks');
    if (t === typeBrut(n - 1)) t = TYPES_GEN[(TYPES_GEN.indexOf(t) + 1 + (n % 3)) % TYPES_GEN.length];
    return t;
  }
  /* Taux de réussite visé (joueur simulé) : pente régulière, respirations, boss */
  function tauxVise(n) {
    var t;
    if (n <= 60) t = 0.96 - 0.52 * ((n - 1) / 59);
    else t = Math.max(0.36, 0.44 - 0.06 * Math.min(1, (n - 60) / 240));
    var k = n % 10;
    if (k === 1 && n > 1) t += 0.15;
    if (k === 6) t += 0.10;
    if (k === 0) t -= 0.06;
    return Math.max(0.3, Math.min(0.97, t));
  }
  /* quantile de la loi normale (approximation de Acklam, largement suffisante ici) */
  function zDe(p) {
    p = Math.max(0.02, Math.min(0.98, p));
    var a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
    var b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771543, -13.28068155288572];
    var c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
    var d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
    var q, r;
    if (p < 0.02425) {
      q = Math.sqrt(-2 * Math.log(p));
      return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    if (p > 1 - 0.02425) {
      q = Math.sqrt(-2 * Math.log(1 - p));
      return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    q = p - 0.5; r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  /* Modèle de difficulté des niveaux générés, ajusté sur 8 000 parties simulées
     (loi log-normale) : coups nécessaires ≈ médiane(quantité) × exp(σ·z).
     Il ne sert qu'au-delà du niveau 1060 : de 61 à 1060, chaque niveau généré a
     été calibré par simulation (table CALIB_GEN). */
  var MODELE = {
    jelly: { a: 12.16, b: 0.173, c6: 1.6, sl: 0.451 },
    blocks: { a: 6.7, b: 0.592, c6: 1.57, sl: 0.435 },
    ingr: { a: -5.75, b: 10.25, c6: 1.9, sl: 0.57 },
    collect: { '5-1': [1.869, 0.265], '5-2': [2.456, 0.335], '5-3': [2.31, 0.24], '6-1': [1.428, 0.348], '6-2': [1.028, 0.318], '6-3': [0.898, 0.359] },
    score: { '5-0': [445, 0.365], '6-0': [261, 0.321] }
  };
  /* niveaux 61 à 560 : valeur calibrée (base 36) — coups, quantité à récolter ou
     cible/100 — précédée de « variante: » quand le plan a dû être retiré pour
     tenir une partie de 11 à 40 coups (vs 120 parties simulées par niveau) */
  /* niveaux 61 à 1060 : valeur calibrée (base 36) — coups, quantité à récolter ou
     cible/100 — précédée de « variante: » quand le plan a dû être retiré pour
     tenir une partie de 11 à 40 coups (100 parties simulées par niveau) */
  var CALIB_GEN =
    'i,r,37,c,s,1m,3:j,21,19,f,m,n,k,j,1:g,i,e,j,x,1h,1:j,p,2:13,d,1:i,15,p,1g,u,k,p,1o,1:g,n,d,i,d,i,10,11,14,' +
    '10,w,i,f,12,2:o,23,1:o,1:l,k,c,k,f,e,r,2:n,z,f,g,f,14,d,j,2n,13,k,r,k,j,10,2:c,14,p,i,p,1:d,u,q,b,4:f,1:b,z,' +
    'f,z,c,g,1:p,k,k,l,g,3e,t,k,j,1k,1:k,1t,w,x,k,2x,g,m,o,u,1:k,h,1j,v,u,n,1o,l,w,p,1j,2:n,k,13,k,e,o,u,f,17,k,' +
    '2:c,1:l,k,1l,b,u,10,k,q,g,12,p,k,k,g,k,d,26,s,f,e,1j,v,p,22,i,i,2:j,1c,u,j,p,u,1:h,c,1g,a,b,t,h,u,2:10,h,g,' +
    '1d,14,g,f,g,1e,l,1:e,i,1:i,10,h,d,14,38,1:f,u,g,12,1e,w,v,h,k,2e,c,1a,x,g,f,c,c,u,g,o,k,f,r,2q,1:e,p,1:f,x,' +
    'm,p,16,c,p,z,1:o,a,q,13,h,1:e,i,14,p,14,14,1e,w,r,k,u,g,1:10,j,f,h,k,l,e,a,1z,14,k,t,h,f,f,d,p,10,e,29,e,f,' +
    'w,1:d,1q,3:g,d,s,u,14,1:g,o,d,o,i,i,1r,k,18,1c,z,d,u,22,11,k,p,h,1:g,b,h,r,1:u,1r,j,k,p,t,h,1x,j,f,k,g,a,k,' +
    '36,k,h,14,42,p,n,t,g,g,k,t,17,3:i,u,f,u,i,2:j,1b,j,g,k,f,1c,f,l,d,u,14,d,z,d,l,12,g,i,j,c,b,o,w,g,d,z,b,f,z,' +
    '1:d,3:b,r,e,g,1u,f,s,u,1:d,a,13,g,b,k,f,p,t,v,d,1h,g,q,f,1d,1:t,q,1:d,19,t,h,k,10,u,f,1:m,u,g,1t,q,1:g,j,' +
    '1:t,1:l,r,2:n,14,1:n,1:k,12,1k,p,j,1v,q,k,1:e,10,10,d,p,k,37,p,2:j,n,u,n,f,1g,r,y,t,14,u,c,n,m,a,l,l,3e,i,p,' +
    'p,m,19,l,z,d,2n,1:i,u,14,b,z,d,f,f,j,g,1e,1k,j,14,1g,r,1:h,1t,p,y,d,e,m,g,c,k,1:l,k,k,l,f,b,p,1a,j,s,f,p,' +
    '1:m,z,w,e,h,1e,1a,1:l,1:d,p,1:p,15,1:c,n,r,k,30,k,1:g,j,c,j,2:n,23,b,p,1:q,2:g,k,w,b,m,k,l,f,g,r,1k,e,q,1:z,' +
    'k,p,n,1e,e,e,16,d,l,k,1:f,n,o,18,e,a,e,1:e,k,v,k,13,1j,u,1:d,w,1c,f,v,e,16,e,k,1f,2:u,1:t,n,1a,j,14,e,a,k,w,' +
    'w,1m,k,f,p,p,g,1o,14,k,h,q,1c,w,14,1:o,m,25,z,19,e,1:14,1:c,1n,g,k,l,f,14,1:l,p,1e,1i,i,u,p,u,k,e,16,h,2:f,' +
    'p,p,a,d,b,m,s,p,f,p,23,q,v,1:o,w,1:e,14,z,1:e,2:f,u,n,u,1:m,1:r,x,d,l,k,p,1o,s,i,d,u,1:g,f,j,1:g,u,27,f,2:g,' +
    'g,2d,u,p,j,f,u,n,1:n,14,r,w,k,1:b,k,e,10,u,e,32,r,z,k,c,1z,f,1:e,e,g,i,1l,u,f,s,s,1g,b,1l,d,k,x,m,n,19,z,u,' +
    'g,1e,g,d,b,1e,t,1:e,u,2c,1:l,y,1g,g,1:13,h,1:g,h,u,q,u,2s,1:s,k,2:b,v,1d,j,h,f,b,c,v,g,19,s,1r,x,h,1n,p,1j,' +
    '1:d,13,l,g,k,2:d,1:m,o,b,m,p,1:g,u,g,r,k,1:c,g,l,q,o,g,k,p,1:e,f,e,u,q,k,y,1:e,h,g,o,1:d,t,x,e,g,1z,l,1o,f,' +
    'i,q,1n,h,e,p,p,a,c,z,1:j,1c,p,1:b,c,19,j,o,u,1:e,w,f,1e,z,19,d,3:u,u,1c,h,z,k,d,12,p,q,h,25,k,14,n,p,1p,13,' +
    '1e,18,d,1:10,j,1d,e,e,i,x,14,k,i,v,f,1:e,k,o,p,q,l,x,1e,13,p,1:d,f,1v,f,19,e,q,1o,a,j,u,1g,1:o,11,11,o,j,q,' +
    'g,p,25,d,f,k,j,g,4:m,p,u,k,e,11,u,14,s,1:w,e,c,f,26,k,1:c,o,i,k,1:i,b,e,j,j,k,m,b,f,z,q,y,m,i,1:j,k,c,1u,n,' +
    '2:b,14,h,s,1:g,1o,g,1b,z,1a,h,1e,e,j,1e,14,z,f,s,2:m,13,k,k,u,o,b,f,w,u,r,1t,e,d,q,p,3o,1r,o,1t,11,1:h,q,h,' +
    'k,e,p,g,21,1:e,z,c,20,p,k,e,p,14,g,f,u,24,1:i,l,h,u,1:d,10,k,d,l,1e,k,2o,h,i,1u,c,1l,1:l,i,m,v,19,e';
  var CALIB_TAB = null;
  var NB_CALIB = CALIB_GEN.split(',').length; // niveaux 61 à 61 + NB_CALIB - 1
  /* entrée de la table pour le niveau n : { variante (plan retiré), v (valeur calibrée) } */
  function entreeCalib(n) {
    var k = n - 61;
    if (!CALIB_GEN || k < 0) return null;
    if (!CALIB_TAB) CALIB_TAB = CALIB_GEN.split(',');
    var e = CALIB_TAB[k];
    if (e === undefined || e === '') return null;
    var i = e.indexOf(':');
    return { variante: i > 0 ? parseInt(e.slice(0, i), 10) : 0, v: parseInt(i > 0 ? e.slice(i + 1) : e, 36) };
  }
  function genLevel(n, brut, variante) {
    var ent = variante === undefined ? entreeCalib(n) : null;
    var va = variante !== undefined ? variante : (ent ? ent.variante : 0);
    var R = mulberry(hashN('bonbons-' + n + (va ? '/' + va : ''))), k = (n - 1) % 10 + 1;
    var g = typeGen(n);
    // au-delà de la table de calibrage, des formes simples (le modèle y est fiable)
    var horsTable = n > 61 + NB_CALIB - 1;
    var forme = FORMES[Math.floor(R() * (horsTable ? 5 : FORMES.length))];
    var rows = [], r, c, q;
    for (r = 0; r < N; r++) rows.push((forme ? forme[r] : '........').split(''));
    // une touche propre à chaque niveau : trous ou meringues symétriques en plus
    var touches = 2 + Math.floor(R() * 2);
    for (q = 0; q < touches; q++) {
      var rr = 1 + Math.floor(R() * 6), cc = Math.floor(R() * 4), quoi = R();
      var ch = quoi < 0.45 ? 'x' : (quoi < 0.8 || g === 'jelly' ? 'm' : 'M');
      if (horsTable && ch === 'x') ch = 'm';
      if (rows[rr][cc] === '.') { rows[rr][cc] = ch; rows[rr][7 - cc] = ch; }
    }
    function libre(r2, c2) { return rows[r2][c2] === '.'; }
    function pose(r2, c2, ch) {
      var n2 = 0;
      if (libre(r2, c2)) { rows[r2][c2] = ch; n2++; }
      if (c2 !== 7 - c2 && libre(r2, 7 - c2)) { rows[r2][7 - c2] = ch; n2++; }
      return n2;
    }
    var niveauDur = Math.min(1, (n - 60) / 200);
    var def = { g: g, c: 5, plan: null, s: [0, 0, 0] };
    def.c = (g === 'collect' || g === 'score') ? (R() < 0.7 ? 6 : 5) : (R() < 0.2 + 0.3 * niveauDur ? 6 : 5);
    // la taille de l'objectif vise une partie de 16 à 26 coups (modèle ajusté par simulation)
    var visee = 16 + Math.floor(R() * 11) + (k === 10 ? 3 : 0);
    var M = MODELE[g];
    if (g === 'jelly') {
      // la gelée pousse autour d'un centre, par paires symétriques ; le cœur peut être double
      var ouvertes = 0;
      for (r = 0; r < N; r++) for (c = 0; c < N; c++) if (rows[r][c] === '.') ouvertes++;
      var J = Math.max(10, Math.min(88, Math.round((visee / (def.c === 6 ? M.c6 : 1) - M.a) / M.b)));
      // au-delà des cases disponibles, la gelée se double plutôt que de tout recouvrir
      var simples = Math.min(J, Math.max(8, ouvertes - 6));
      var rc = 1 + Math.floor(R() * 6), ccc = Math.floor(R() * 4), cases = [];
      for (r = 0; r < N; r++) for (c = 0; c < 4; c++) cases.push([r, c, Math.abs(r - rc) + Math.abs(c - ccc) * 1.3 + R() * 1.6]);
      cases.sort(function (x, y) { return x[2] - y[2]; });
      var mis = 0, dbl = R() < 0.35 + 0.35 * niveauDur;
      for (q = 0; q < cases.length && mis < simples; q++) mis += pose(cases[q][0], cases[q][1], 'j');
      for (q = 0; q < cases.length && mis < J && (dbl || mis < J - 4); q++) {
        var r3 = cases[q][0], c3 = cases[q][1];
        if (rows[r3][c3] === 'j') { rows[r3][c3] = 'J'; mis++; if (c3 !== 7 - c3 && rows[r3][7 - c3] === 'j') { rows[r3][7 - c3] = 'J'; mis++; } }
      }
      if (R() < 0.3) { var rb = 2 + Math.floor(R() * 4), cb = Math.floor(R() * 3); if (rows[rb][cb] === 'j') { rows[rb][cb] = 'k'; if (rows[rb][7 - cb] === 'j') rows[rb][7 - cb] = 'k'; } }
    } else if (g === 'blocks') {
      var B = Math.max(6, Math.min(36, Math.round((visee / (def.c === 6 ? M.c6 : 1) - M.a) / M.b))), couches = 0;
      for (q = 0; q < 200 && couches < B; q++) {
        var r4 = 1 + Math.floor(R() * 6), c4 = Math.floor(R() * 4);
        var dbl2 = R() < 0.3 + 0.4 * niveauDur;
        couches += pose(r4, c4, dbl2 ? 'M' : 'm') * (dbl2 ? 2 : 1);
      }
    } else if (g === 'ingr') {
      def.n = Math.max(1, Math.min(4, Math.round((visee / (def.c === 6 ? M.c6 : 1) - M.a) / M.b)));
      def.max = def.n > 2 ? 2 : 1;
      var nb = 1 + Math.floor(R() * 3);
      for (q = 0; q < nb; q++) pose(1 + Math.floor(R() * 5), Math.floor(R() * 4), R() < 0.3 ? 'M' : 'm');
    } else if (R() < 0.5) {
      for (q = 0; q < 2; q++) pose(1 + Math.floor(R() * 6), Math.floor(R() * 4), 'm');
    }
    // jamais une ligne entièrement bouchée
    for (r = 0; r < N; r++) {
      var ouverte = false;
      for (c = 0; c < N; c++) if (rows[r][c] !== 'm' && rows[r][c] !== 'M' && rows[r][c] !== 'k') ouverte = true;
      if (!ouverte) { rows[r][3] = '.'; rows[r][4] = '.'; }
    }
    def.plan = rows.map(function (l) { return l.join(''); });
    if (g === 'collect') {
      var nc = 1 + Math.floor(R() * 3), cols = [];
      while (cols.length < nc) { var x = Math.floor(R() * def.c); if (cols.indexOf(x) === -1) cols.push(x); }
      def.cols = cols;
    }
    if (g === 'collect' || g === 'score') def.m = 16 + Math.floor(R() * 7);
    // hors table : jamais le même plan qu'un des 400 niveaux précédents (sinon on retire)
    if (horsTable && variante === undefined) {
      var sig = JSON.stringify(def);
      for (var m2 = n - 1; m2 >= Math.max(61 + NB_CALIB, n - 400); m2--) {
        if (JSON.stringify(genLevel(m2, true, 0)) === sig) return genLevel(n, brut, 97);
      }
    }
    if (brut) return def;
    return reglePar(def, tauxVise(n), ent ? ent.v : null);
  }
  /* Fixe coups / quantités / cible et étoiles d'un niveau généré : la table
     de calibrage si elle couvre ce niveau, sinon le modèle. */
  function reglePar(def, taux, calib) {
    var plan = parsePlan(def.plan), i, amount = 0, v = calib === undefined ? null : calib;
    var zr = zDe(taux); // quantile de la loi normale au taux visé
    if (def.g === 'jelly' || def.g === 'blocks' || def.g === 'ingr') {
      var M = MODELE[def.g];
      if (def.g === 'jelly') for (i = 0; i < NN; i++) amount += plan.jelly[i];
      else if (def.g === 'blocks') for (i = 0; i < NN; i++) amount += plan.block[i];
      else amount = def.n;
      var med = Math.max(4, (M.a + M.b * amount) * (def.c === 6 ? M.c6 : 1));
      def.m = v !== null ? v : Math.max(10, Math.min(45, Math.round(med * Math.exp(M.sl * zr))));
    } else if (def.g === 'collect') {
      var P = MODELE.collect[def.c + '-' + def.cols.length] || [1.5, 0.3];
      var A = v !== null ? v : Math.max(5, Math.floor(P[0] * def.m * Math.exp(P[1] * zDe(1 - taux)) / 5) * 5);
      def.want = {};
      def.cols.forEach(function (x) { def.want[x] = A; });
      delete def.cols;
    } else {
      var S = MODELE.score[def.c + '-0'] || [350, 0.35];
      def.n = v !== null ? v * 100 : Math.max(1000, Math.floor(S[0] * def.m * Math.exp(S[1] * zDe(1 - taux)) / 100) * 100);
    }
    // étoiles 2 et 3 : un score qu'un bon joueur atteint en réussissant
    var parCoup = (MODELE.score[def.c + '-0'] || [350])[0];
    var base = def.g === 'score' ? def.n : parCoup * def.m + (def.g === 'ingr' ? 1000 * def.n : 0);
    def.s = [def.g === 'score' ? def.n : 0, Math.round(base * 1.3 / 100) * 100, Math.round(base * 1.8 / 100) * 100];
    return def;
  }

  /* L'objectif du niveau, prêt pour l'état */
  function goalOf(def) {
    if (def.g === 'score') return { k: 'score', n: def.n };
    if (def.g === 'jelly') return { k: 'jelly' };
    if (def.g === 'blocks') return { k: 'blocks' };
    if (def.g === 'collect') {
      var c = {};
      for (var k in def.want) c[k] = def.want[k];
      return { k: 'collect', c: c };
    }
    if (def.g === 'ingr') return { k: 'ingr', n: def.n, max: def.max || 1 };
    return { k: 'score', n: def.n || 1000 };
  }

  /* Reste à faire pour l'objectif (0 = atteint) */
  function goalLeft(state, p) {
    var g = state.goal;
    if (!g) return 1;
    var i, n = 0;
    if (g.k === 'score') return Math.max(0, g.n - p.score);
    if (g.k === 'jelly') { for (i = 0; i < NN; i++) n += p.jelly[i] || 0; return n; }
    if (g.k === 'blocks') { for (i = 0; i < NN; i++) n += p.block[i] || 0; return n; }
    if (g.k === 'collect') {
      for (var k in g.c) n += Math.max(0, g.c[k] - (p.got.collect[k] || 0));
      return n;
    }
    if (g.k === 'ingr') return Math.max(0, g.n - p.got.ingr);
    return 1;
  }

  /* Étoiles : 1 à l'objectif, puis 2 et 3 selon le score */
  function starsFor(state, p) {
    if (goalLeft(state, p) > 0) return 0;
    var s = state.stars || [0, 0, 0];
    if (p.score >= s[2]) return 3;
    if (p.score >= s[1]) return 2;
    return 1;
  }
  /* (course à plusieurs) étoiles d'un score face à la cible */
  function stars(score, cible) {
    if (score >= cible * 1.9) return 3;
    if (score >= cible * 1.4) return 2;
    if (score >= cible) return 1;
    return 0;
  }
  function starsTxt(n) { return n ? '⭐⭐⭐'.slice(0, n * 2) : '—'; }

  /* Monte un niveau de l'aventure dans l'état */
  function monteNiveau(state, p, n) {
    var def = levelDef(n), plan = parsePlan(def.plan);
    state.solo = true;
    state.soloLvl = n;
    state.level = 'aventure';
    state.types = def.c;
    state.holes = plan.holes;
    state.goal = goalOf(def);
    state.coups = def.m;
    state.cible = def.g === 'score' ? def.n : def.s[0];
    state.stars = def.g === 'score' ? [def.n, def.s[1], def.s[2]] : [0, def.s[1], def.s[2]];
    p.board = new Array(NN);
    p.jelly = plan.jelly.slice();
    p.block = plan.block.slice();
    p.got = { collect: {}, ingr: 0, spawned: 0 };
    p.seq = 0;
    p.score = 0;
    p.moves = def.m;
    p.lastGain = 0;
    p.lastCombo = 0;
    p.fx = null;
    var E = ctxOf(state, p, null);
    for (var g = 0; g < 60; g++) {
      for (var i = 0; i < NN; i++) E.b[i] = null;
      p.got.spawned = 0;
      plan.noisettes.forEach(function (k) {
        if (ouvert(E, k)) { E.b[k] = piece(E, ING, 0); p.got.spawned++; }
      });
      if (state.goal.k === 'ingr' && !plan.noisettes.length) {
        // première noisette : en haut d'une colonne
        var cols = [];
        for (var c = 0; c < N; c++) if (lanceur(E, c) >= 0) cols.push(c);
        if (cols.length) { E.b[lanceur(E, cols[ri(cols.length)])] = piece(E, ING, 0); p.got.spawned++; }
      }
      remplit(E);
      if (!findRuns(E.b).length && hasMoveE(E)) break;
    }
    state.goalTotal = goalLeft(state, p) || 1;
    state.intro = true;
    state.res = null;
    state.phase = 'play';
    state.startTs = Date.now();
    state.n = 0;
  }

  /* ================================================================
   * Fin de niveau
   * ================================================================ */
  /* « Sucre final » : les coups restants deviennent des bonbons rayés qui éclatent. */
  function sucreFinal(E) {
    var p = E.p, restants = Math.min(p.moves, 15);
    if (E.rec && E.rec.steps) E.rec.steps.push({ k: 'final', n: p.moves });
    for (var tour = 0; tour < 6; tour++) {
      var marks = zeros(), fired = {}, cibles = [], i, st;
      if (restants > 0) {
        var ordinaires = [];
        for (i = 0; i < NN; i++) if (E.b[i] && E.b[i].t >= 0 && E.b[i].s === 0) ordinaires.push(i);
        for (var k = 0; k < restants && ordinaires.length; k++) {
          var idx = ordinaires.splice(ri(ordinaires.length), 1)[0];
          cibles.push(idx);
        }
        restants = 0;
      }
      for (i = 0; i < NN; i++) if (E.b[i] && (E.b[i].s > 0 || E.b[i].t === ARC)) marks[i] = 1;
      if (!cibles.length && !marks.some(function (x) { return x; })) break;
      st = joueVague(E, marks, [], [], null, fired, function (st2) {
        cibles.forEach(function (j) {
          var pc = E.b[j];
          pc.s = 1 + ri(2);
          st2.transform.push([j, pc.id, pc.s]);
          marks[j] = 1;
        });
      });
      settleAll(E);
      cascade(E);
    }
    p.moves = 0;
  }

  function finNiveau(state, p, gagne) {
    state.phase = 'result';
    state.res = {
      won: gagne, stars: gagne ? starsFor(state, p) : 0, score: p.score, lvl: state.soloLvl,
      left: goalLeft(state, p), ts: Date.now()
    };
  }

  /* ================================================================
   * Le module
   * ================================================================ */
  var LEVELS = {
    facile: { nom: 'Facile', types: 5, coups: 25, cible: 1500 },
    moyen: { nom: 'Moyen', types: 6, coups: 20, cible: 1800 },
    difficile: { nom: 'Difficile', types: 6, coups: 14, cible: 2000 }
  };

  var mod = {
    id: 'bonbons',
    nom: 'Bonbons',
    icone: '🍬',
    desc: 'L’aventure sucrée : des mondes à parcourir, des objectifs variés, des cascades et des bonbons magiques !',
    regles: '<p><strong>🎯 Le but :</strong> remplir l’objectif du niveau avant d’épuiser vos coups : des points, de la gelée à dégager, des meringues à casser, des bonbons d’une couleur à récolter ou des noisettes à faire descendre tout en bas. Chaque niveau réussi (jusqu’à ⭐⭐⭐) ouvre le suivant.</p>' +
      '<p><strong>Comment jouer :</strong> glissez un bonbon vers son voisin (ou touchez-les l’un après l’autre) : l’échange doit aligner au moins 3 bonbons identiques, qui sont croqués. Tout retombe, il en pleut de nouveaux, et les cascades rapportent de plus en plus.</p>' +
      '<p><strong>🍭 Les spéciaux :</strong> 4 alignés = un <strong>bonbon rayé</strong> qui balaie une ligne ou une colonne · liaison en <strong>L, en T ou en carré</strong> = un <strong>bonbon enveloppé</strong> qui explose autour de lui · 5 alignés = un <strong>sucre magique</strong> : échangez-le avec un bonbon pour croquer toute sa couleur !</p>' +
      '<p><strong>💥 Les combos :</strong> échangez deux spéciaux entre eux : rayé + rayé = une croix · rayé + enveloppé = trois lignes et trois colonnes · enveloppé + enveloppé = une déflagration géante · sucre magique + rayé = toute la couleur devient rayée · deux sucres magiques = tout le plateau !</p>' +
      '<p><strong>🍬 Sucre final :</strong> objectif rempli avec des coups en réserve ? Chacun devient un bonbon rayé qui éclate pour des points en plus.</p>',
    min: 1, max: 1,
    hotseat: true, hotseatMax: 1, hidden: false, netOnly: false,
    noBadges: true,

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
    gagnants: function (state) {
      if (state.solo) {
        if (!state.res) return undefined;
        return state.res.won ? [0] : null;
      }
      if (!state.finished) return undefined;
      var best = Math.max.apply(null, state.players.map(function (p) { return p.score; }));
      var w = [];
      state.players.forEach(function (p, i) { if (p.score === best) w.push(i); });
      return w.length === 1 ? w : [];
    },

    summary: function (state) {
      var rows = state.players.map(function (p) { return { n: p.name, s: p.score }; })
        .sort(function (a, b) { return b.s - a.s; });
      var html = rows.map(function (r) {
        return '<div class="final-line"><span>' + GG.esc(r.n) + '</span><strong>' +
          (r.s | 0) + ' pts · ' + starsTxt(stars(r.s, state.cible)) + '</strong></div>';
      }).join('');
      html += '<p>🎯 Objectif : ' + (state.cible | 0) + ' pts (⭐) · niveau ' +
        (LEVELS[state.level] ? LEVELS[state.level].nom : '') + '</p>';
      if (state.players.length > 1) {
        var top = rows.filter(function (r) { return r.s === rows[0].s; });
        html += '<h1>🏆 ' + top.map(function (r) { return GG.esc(r.n); }).join(' & ') + '</h1>';
      }
      return html;
    },

    /* Rien de secret : les grilles sont publiques. */
    redact: function (state) { return GG.clone(state); },

    apply: function (state, player, action) {
      if (state.finished) return { ok: false, error: 'Partie terminée.' };
      var p = state.players[player];
      if (!p) return { ok: false, error: 'Joueur inconnu.' };
      if (!action || typeof action !== 'object') return { ok: false, error: 'Action inconnue.' };

      if (action.t === 'level') {
        // course à plusieurs : même grille, le meilleur score gagne
        if (state.phase !== 'setup') return { ok: false, error: 'Niveau déjà choisi.' };
        if (player !== 0) return { ok: false, error: 'L’hôte choisit le niveau.' };
        var cfg = LEVELS[action.l];
        if (!cfg) return { ok: false, error: 'Niveau inconnu.' };
        var base = buildBoard(cfg.types);
        state.players.forEach(function (q) {
          q.board = GG.clone(base);
          q.seq = NN + 1;
          q.moves = cfg.coups;
          q.score = 0;
          q.jelly = zeros(); q.block = zeros();
          q.got = { collect: {}, ingr: 0, spawned: 0 };
        });
        state.level = action.l;
        state.types = cfg.types;
        state.cible = cfg.cible;
        state.coups = cfg.coups;
        state.goal = { k: 'score', n: cfg.cible };
        state.stars = [cfg.cible, Math.round(cfg.cible * 1.4), Math.round(cfg.cible * 1.9)];
        state.phase = 'play';
        state.startTs = Date.now();
        return { ok: true };
      }

      if (action.t === 'start') {
        // aventure solo : la carte des niveaux, sur ce téléphone
        if (state.players.length !== 1) return { ok: false, error: 'Les niveaux se jouent en solo.' };
        if (state.phase !== 'setup' && state.phase !== 'result') {
          return { ok: false, error: 'Un niveau est déjà en cours.' };
        }
        var lvl = action.lvl | 0;
        if (lvl < 1 || lvl > 100000) return { ok: false, error: 'Niveau inconnu.' };
        monteNiveau(state, p, lvl);
        return { ok: true };
      }
      if (action.t === 'go') {
        if (state.phase !== 'play') return { ok: false, error: 'Aucun niveau en cours.' };
        state.intro = false;
        return { ok: true };
      }
      if (action.t === 'backmap') {
        if (!state.solo || (state.phase !== 'result' && state.phase !== 'play')) return { ok: false, error: 'Rien à quitter.' };
        state.phase = 'setup';
        state.intro = false;
        return { ok: true };
      }
      if (state.phase !== 'play') return { ok: false, error: 'La partie n’a pas commencé.' };
      if (action.t === 'swap') {
        if (p.moves <= 0) return { ok: false, error: 'Plus de coups — on attend les autres.' };
        var a = action.a | 0, b2 = action.b | 0;
        if (a < 0 || a >= NN || b2 < 0 || b2 >= NN || !adjacent(a, b2)) {
          return { ok: false, error: 'Échangez deux bonbons voisins.' };
        }
        var anim = action.anim !== false;
        var rec = { steps: anim ? [] : null, rows: [], cols: [], bombs: [], pops: [], arc: 0, wipe: false, combo: 0, gain: 0, shuffled: false };
        var E = ctxOf(state, p, rec);
        var kind = swapKind(E, a, b2);
        if (!kind) {
          if (!E.b[a] || !E.b[b2]) return { ok: false, error: 'Échangez deux bonbons voisins.' };
          if (E.b[a].t === ING || E.b[b2].t === ING) return { ok: false, error: 'Une noisette ne s’échange que si elle forme un alignement.' };
          return { ok: false, error: 'Cet échange ne forme aucun alignement.' };
        }
        if (anim) rec.before = snapshot(E);
        var scoreAvant = p.score;
        state.intro = false;
        state.n = (state.n || 0) + 1;
        p.moves--;
        joueEchange(E, a, b2, kind);
        rec.combo = Math.max(1, rec.combo);
        rec.kind = kind;
        rec.at = b2;
        p.lastGain = rec.gain;
        p.lastCombo = rec.combo;
        if (state.solo) {
          var fini = state.goal && state.goal.k !== 'score' && goalLeft(state, p) === 0;
          if (fini) {
            if (p.moves > 0) { rec.bonusMoves = p.moves; sucreFinal(E); }
            finNiveau(state, p, true);
          } else if (p.moves <= 0) {
            finNiveau(state, p, goalLeft(state, p) === 0);
          } else {
            ensureMoves(E);
          }
        } else {
          if (p.moves > 0) ensureMoves(E);
          if (state.players.every(function (q) { return q.moves <= 0; })) state.finished = true;
        }
        rec.gain = p.score - scoreAvant; // tout compris : cascades, noisettes, sucre final
        p.lastGain = rec.gain;
        rec.n = state.n;
        rec.ts = Date.now();
        p.fx = rec;
        return { ok: true };
      }
      return { ok: false, error: 'Action inconnue.' };
    },

    render: function (el, ctx) { rendu(el, ctx); }
  };

  /* ================================================================
   * Le joueur « meilleur coup immédiat » : il essaie chaque échange, ne
   * regarde que la première vague (ce qu'un joueur VOIT avant de jouer) et
   * garde celui qui avance le plus l'objectif. Il sert à mesurer la
   * difficulté réelle des niveaux (taux de réussite simulé) et à l'indice.
   * ================================================================ */
  function copiePlateau(p) {
    return {
      board: p.board.map(function (pc) { return pc ? { t: pc.t, s: pc.s, id: pc.id } : null; }),
      jelly: p.jelly.slice(), block: p.block.slice(),
      got: { collect: {}, ingr: 0, spawned: p.got ? p.got.spawned : 0 },
      seq: p.seq, score: 0
    };
  }
  function evalCoup(state, p, a, b2) {
    var q = copiePlateau(p);
    var E = ctxOf(state, q, null);
    var kind = swapKind(E, a, b2);
    if (!kind) return -1;
    E.unSeul = true;
    joueEchange(E, a, b2, kind);
    var g = state.goal, v = q.score, i, k;
    if (g && g.k === 'jelly') { for (i = 0; i < NN; i++) v += 220 * ((p.jelly[i] || 0) - q.jelly[i]); }
    if (g && g.k === 'blocks') { for (i = 0; i < NN; i++) v += 160 * ((p.block[i] || 0) - q.block[i]); }
    if (g && g.k === 'collect') {
      for (k in g.c) {
        var reste = Math.max(0, g.c[k] - ((p.got && p.got.collect[k]) || 0));
        v += 70 * Math.min(reste, q.got.collect[k] || 0);
      }
    }
    if (g && g.k === 'ingr') {
      // une noisette descend d'autant de cases qu'il s'en vide sous elle
      for (i = 0; i < NN; i++) {
        if (!q.board[i] || q.board[i].t !== ING) continue;
        for (k = i + N; k < NN; k += N) if (!E.holes[k] && !q.board[k] && !q.block[k]) v += 260;
      }
    }
    // un joueur aime fabriquer des spéciaux
    for (i = 0; i < NN; i++) {
      var pc = q.board[i];
      if (!pc || (p.board[i] && p.board[i].id === pc.id)) continue;
      if (pc.t === ARC) v += 450; else if (pc.s === 3) v += 220; else if (pc.s) v += 140;
    }
    if (kind !== 'match') v += 100;
    return v;
  }
  function meilleurCoup(state, p) {
    var E = ctxOf(state, p, null), best = null, bv = -2;
    var coups = allMoves(E);
    for (var k = 0; k < coups.length; k++) {
      var v = evalCoup(state, p, coups[k][0], coups[k][1]) + rnd() * 5;
      if (v > bv) { bv = v; best = coups[k]; }
    }
    return best;
  }

  /* ================================================================
   * RENDU — 1. les bonbons dessinés (SVG fabriqués une fois, servis en
   * images : 64 bonbons animés ne coûtent que des déplacements)
   * ================================================================ */
  var PAL = [
    ['#ffc2cf', '#ff4d6d', '#9e0f35'],  // boule cerise
    ['#ffdcb0', '#ff9124', '#b84a00'],  // papillote orange
    ['#fff6b0', '#ffd23f', '#b58500'],  // losange citron
    ['#bff5c9', '#2fc26f', '#0a6534'],  // carré pomme
    ['#b4dcff', '#349bff', '#18479b'],  // anneau menthe
    ['#ebcbff', '#a352f0', '#56179a']   // hexagone myrtille
  ];
  var FORMES_SVG = [
    '<circle cx="50" cy="51" r="37"/>',
    '<ellipse cx="50" cy="51" rx="27" ry="23"/>',
    '<path d="M50 11 L87 51 L50 91 L13 51 Z"/>',
    '<rect x="16" y="16" width="68" height="68" rx="19"/>',
    '<path d="M50 13a38 38 0 1 1 0 76a38 38 0 1 1 0-76zm0 25a13 13 0 1 0 0 26a13 13 0 1 0 0-26z" fill-rule="evenodd"/>',
    '<path d="M50 10 L86 30.5 L86 71.5 L50 92 L14 71.5 L14 30.5 Z"/>'
  ];
  function svgOuvre() { return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'; }
  function degrade(id, c) {
    return '<radialGradient id="' + id + '" cx="34%" cy="28%" r="78%"><stop offset="0" stop-color="' + c[0] +
      '"/><stop offset=".48" stop-color="' + c[1] + '"/><stop offset="1" stop-color="' + c[2] + '"/></radialGradient>';
  }
  var BRILLANT = '<linearGradient id="h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".95"/>' +
    '<stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>';
  var OMBRE = '<ellipse cx="50" cy="91" rx="28" ry="5.5" fill="#000" opacity=".28"/>';
  function reflet(x, y) {
    return '<ellipse cx="' + x + '" cy="' + y + '" rx="17" ry="9" fill="url(#h)" transform="rotate(-28 ' + x + ' ' + y + ')"/>' +
      '<circle cx="' + (x + 30) + '" cy="' + (y + 36) + '" r="3.2" fill="#fff" opacity=".45"/>';
  }
  /* le corps d'un bonbon de couleur t (sans spécial) */
  function corps(t) {
    var c = PAL[t], f = FORMES_SVG[t], s = '';
    if (t === 1) {
      // les deux oreilles de papier de la papillote
      s += '<path d="M26 51 L7 36 Q12 51 7 66 Z" fill="' + c[1] + '" stroke="' + c[2] + '" stroke-width="3" stroke-linejoin="round"/>' +
        '<path d="M74 51 L93 36 Q88 51 93 66 Z" fill="' + c[1] + '" stroke="' + c[2] + '" stroke-width="3" stroke-linejoin="round"/>' +
        '<path d="M12 44 L22 51 L12 58" stroke="' + c[0] + '" stroke-width="2" fill="none" opacity=".8"/>' +
        '<path d="M88 44 L78 51 L88 58" stroke="' + c[0] + '" stroke-width="2" fill="none" opacity=".8"/>';
    }
    s += '<g fill="url(#r' + t + ')" stroke="' + c[2] + '" stroke-width="3" stroke-linejoin="round">' + f + '</g>';
    if (t === 2) s += '<path d="M50 17 L81 51 L50 51 Z" fill="#fff" opacity=".22"/>';
    if (t === 5) s += '<path d="M50 16 L80 33.5 L50 51 L20 33.5 Z" fill="#fff" opacity=".2"/>';
    if (t === 4) s += '<circle cx="50" cy="51" r="13" fill="none" stroke="' + c[2] + '" stroke-width="2.5" opacity=".7"/>';
    if (t === 3) s += '<rect x="24" y="24" width="52" height="52" rx="14" fill="none" stroke="#fff" stroke-width="2" opacity=".25"/>';
    s += t === 4 ? reflet(34, 30) : t === 2 ? reflet(38, 34) : reflet(37, 32);
    return s;
  }
  function svgBonbon(t, s) {
    var c = PAL[t], out = svgOuvre() + '<defs>' + degrade('r' + t, c) + BRILLANT +
      '<clipPath id="k">' + FORMES_SVG[t] + '</clipPath></defs>' + OMBRE;
    if (s === 3) {
      // enveloppé : le bonbon emballé dans une papillote de cellophane, deux nœuds torsadés
      out += '<path d="M24 51 L3 31 Q10 51 3 71 Z" fill="' + c[1] + '" stroke="' + c[2] + '" stroke-width="3" stroke-linejoin="round"/>' +
        '<path d="M76 51 L97 31 Q90 51 97 71 Z" fill="' + c[1] + '" stroke="' + c[2] + '" stroke-width="3" stroke-linejoin="round"/>' +
        '<path d="M8 40 L20 51 L8 62 M92 40 L80 51 L92 62" stroke="' + c[0] + '" stroke-width="2.5" fill="none"/>' +
        '<rect x="18" y="17" width="64" height="68" rx="17" fill="' + c[1] + '" stroke="' + c[2] + '" stroke-width="3"/>' +
        '<g transform="translate(25.5 25) scale(.49)">' + corps(t) + '</g>' +
        '<rect x="18" y="17" width="64" height="68" rx="17" fill="url(#h)" opacity=".35"/>' +
        '<path d="M26 72 L74 28" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".55"/>' +
        '<path d="M30 80 L80 32" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity=".4"/>' +
        '<path d="M70 12 l3 -7 l3 7 l7 3 l-7 3 l-3 7 l-3 -7 l-7 -3 z" fill="#fff"/>';
    } else {
      out += corps(t);
      if (s === 1 || s === 2) {
        var bars = '';
        for (var k = 0; k < 4; k++) {
          var p = 22 + k * 17;
          bars += s === 1 ? '<rect x="0" y="' + p + '" width="100" height="7" rx="3.5"/>' : '<rect x="' + p + '" y="0" width="7" height="100" rx="3.5"/>';
        }
        out += '<g clip-path="url(#k)" fill="#fff" opacity=".88">' + bars + '</g>' +
          '<g fill="none" stroke="' + c[2] + '" stroke-width="3">' + FORMES_SVG[t] + '</g>' + reflet(37, 32);
      }
    }
    return out + '</svg>';
  }
  function svgMagique() {
    var out = svgOuvre() + '<defs><radialGradient id="r" cx="34%" cy="28%" r="78%"><stop offset="0" stop-color="#b37a4c"/>' +
      '<stop offset=".5" stop-color="#5c331a"/><stop offset="1" stop-color="#26120a"/></radialGradient>' + BRILLANT + '</defs>' + OMBRE +
      '<circle cx="50" cy="51" r="37" fill="url(#r)" stroke="#1a0b04" stroke-width="3"/>';
    // les vermicelles de toutes les couleurs
    var pos = [[34, 30, 20], [58, 26, -35], [72, 42, 60], [28, 50, 80], [46, 44, -10], [62, 58, 25], [40, 66, -50],
      [70, 70, 15], [52, 78, 70], [26, 68, 40], [80, 56, -70], [56, 38, 45], [38, 82, -20], [66, 84, 50]];
    pos.forEach(function (q, k) {
      out += '<rect x="' + (q[0] - 5) + '" y="' + (q[1] - 2) + '" width="10" height="4" rx="2" fill="' + PAL[k % 6][1] +
        '" transform="rotate(' + q[2] + ' ' + q[0] + ' ' + q[1] + ')"/>';
    });
    return out + reflet(37, 30) + '</svg>';
  }
  function svgNoisette() {
    return svgOuvre() + '<defs><radialGradient id="r" cx="36%" cy="40%" r="75%"><stop offset="0" stop-color="#f3c68e"/>' +
      '<stop offset=".55" stop-color="#b8763a"/><stop offset="1" stop-color="#6b3f17"/></radialGradient>' + BRILLANT + '</defs>' + OMBRE +
      '<path d="M50 24 C73 24 85 44 81 64 C77 83 63 92 50 92 C37 92 23 83 19 64 C15 44 27 24 50 24Z" fill="url(#r)" stroke="#5a3210" stroke-width="3"/>' +
      '<path d="M20 44 C22 22 36 12 50 12 C64 12 78 22 80 44 C66 37 34 37 20 44Z" fill="#7d4a1d" stroke="#4a260a" stroke-width="3" stroke-linejoin="round"/>' +
      '<path d="M30 30 L36 38 M42 24 L45 35 M58 24 L55 35 M70 30 L64 38" stroke="#a8692f" stroke-width="2.5" stroke-linecap="round"/>' +
      '<path d="M50 13 C50 7 54 4 59 3" stroke="#4a260a" stroke-width="3.5" fill="none" stroke-linecap="round"/>' +
      reflet(36, 52) + '</svg>';
  }
  function svgGelee(n) {
    var c = n === 2 ? ['#ff9ed8', '#e0369b', '#8f0f5d'] : ['#ffd0ec', '#ff7ac3', '#c2317f'];
    return svgOuvre() + '<defs>' + degrade('r', c) + BRILLANT + '</defs>' +
      '<rect x="6" y="6" width="88" height="88" rx="20" fill="url(#r)" opacity="' + (n === 2 ? '.85' : '.6') + '"/>' +
      '<rect x="6" y="6" width="88" height="88" rx="20" fill="none" stroke="' + c[0] + '" stroke-width="3" opacity=".9"/>' +
      '<ellipse cx="32" cy="24" rx="16" ry="7" fill="url(#h)" transform="rotate(-20 32 24)"/>' +
      (n === 2 ? '<rect x="20" y="20" width="60" height="60" rx="14" fill="none" stroke="#fff" stroke-width="3" opacity=".45"/>' : '') +
      '</svg>';
  }
  function svgMeringue(n) {
    var rose = n === 2;
    return svgOuvre() + '<defs><radialGradient id="r" cx="40%" cy="30%" r="80%"><stop offset="0" stop-color="#ffffff"/>' +
      '<stop offset=".6" stop-color="' + (rose ? '#ffd6ea' : '#f4ecdf') + '"/><stop offset="1" stop-color="' + (rose ? '#e58fb8' : '#cdbfa6') + '"/></radialGradient></defs>' +
      '<rect x="4" y="4" width="92" height="92" rx="16" fill="' + (rose ? '#b4507f' : '#9c8b6e') + '" opacity=".55"/>' +
      '<path d="M50 10 C62 10 66 20 62 26 C76 24 86 34 82 46 C94 50 94 68 82 74 C84 86 72 94 60 88 C54 96 40 96 36 88 C24 94 12 86 16 74 C4 68 6 50 18 46 C14 34 24 24 38 26 C34 20 38 10 50 10Z" fill="url(#r)" stroke="' +
      (rose ? '#c05a8c' : '#b3a283') + '" stroke-width="3"/>' +
      '<path d="M34 46 C40 36 60 36 66 46 C58 42 42 42 34 46Z M30 64 C40 56 60 56 70 64 C60 60 40 60 30 64Z" fill="#fff" opacity=".7"/>' +
      (rose ? '<path d="M44 26 C48 20 56 22 56 28" stroke="#ff5fa2" stroke-width="3" fill="none" stroke-linecap="round"/>' : '') +
      '</svg>';
  }
  function url(svg) { return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")'; }
  var spritesPrets = false;
  function sprites() {
    if (spritesPrets || typeof document === 'undefined') return;
    spritesPrets = true;
    var css = '';
    for (var t = 0; t < 6; t++) {
      for (var s = 0; s < 4; s++) css += '.bbs-' + t + '-' + s + '{background-image:' + url(svgBonbon(t, s)) + '}';
    }
    css += '.bbs-x{background-image:' + url(svgMagique()) + '}';
    css += '.bbs-n{background-image:' + url(svgNoisette()) + '}';
    var j1 = url(svgGelee(1)), j2 = url(svgGelee(2)), m1 = url(svgMeringue(1)), m2 = url(svgMeringue(2));
    css += '.bbs-j1{background-image:' + j1 + '}.bbs-j2{background-image:' + j2 + '}';
    css += '.bbs-m1{background-image:' + m1 + '}.bbs-m2{background-image:' + m2 + '}';
    css += '.bb-tiles{--bb-j1:' + j1 + ';--bb-j2:' + j2 + ';--bb-m1:' + m1 + ';--bb-m2:' + m2 + '}';
    var st = document.createElement('style');
    st.id = 'gg-bonbons-sprites';
    st.textContent = css;
    document.head.appendChild(st);
  }
  /* classe du dessin d'une pièce [id, t, s] ou {t, s} */
  function spriteDe(t, s) {
    if (t === ARC) return 'bbs-x';
    if (t === ING) return 'bbs-n';
    if (t < 0 || t > 5) return 'bbs-0-0';
    return 'bbs-' + t + '-' + ((s | 0) > 3 ? 0 : (s | 0));
  }
  function tDe(t) { return t === ARC ? 'x' : t === ING ? 'n' : String(t | 0); }

  /* ================================================================
   * RENDU — 2. mondes, carte, progression
   * ================================================================ */
  var MONDES = [
    { nom: 'Prairie Guimauve', ic: '🌸', a: '#ff9ac6', b: '#ff5fa2' },
    { nom: 'Forêt Chocolat', ic: '🍫', a: '#c68652', b: '#7a4520' },
    { nom: 'Lagon Réglisse', ic: '🌊', a: '#4fd1ff', b: '#1f6feb' },
    { nom: 'Montagne Meringue', ic: '🏔️', a: '#c8d4ff', b: '#7f8cff' },
    { nom: 'Désert Caramel', ic: '🏜️', a: '#ffc76b', b: '#ff8a3d' },
    { nom: 'Volcan Praline', ic: '🌋', a: '#ff7a59', b: '#c2185b' }
  ];
  var LIEUX = ['Banquise', 'Cité', 'Jardin', 'Île', 'Vallée', 'Château', 'Cascade', 'Marais', 'Plage', 'Galaxie',
    'Récif', 'Verger', 'Toundra', 'Canyon', 'Oasis', 'Fête foraine'];
  var PARFUMS = ['Menthe', 'Nougat', 'Sorbet', 'Pistache', 'Framboise', 'Vanille', 'Barbe à papa', 'Myrtille',
    'Citron', 'Caramel', 'Chocolat blanc', 'Grenadine', 'Praliné', 'Coco', 'Cerise', 'Mangue'];
  var ICONES = ['❄️', '🏰', '🌷', '🏝️', '🌄', '🏯', '💧', '🐸', '🏖️', '🌌', '🐠', '🍎', '⛄', '🏜️', '🌴', '🎡'];
  var TEINTES = [['#7ef0d2', '#1fa37a'], ['#ffe08a', '#e0a100'], ['#ffb3f0', '#c03db0'], ['#9ad0ff', '#3a6fd8'],
    ['#ffcf9a', '#e0662f'], ['#d6b3ff', '#7a3ee6'], ['#b8f58f', '#4caf2f'], ['#ffa3a3', '#d83b3b']];
  /* le monde w (0, 1, 2…) : les six premiers sont dessinés, les suivants
     combinent un lieu et un parfum sans jamais se répéter (256 mondes) */
  function monde(w) {
    if (w < MONDES.length) return MONDES[w];
    var k = w - MONDES.length, x = (k * 37 + 11) % 256;
    var lieu = x % 16, parfum = Math.floor(x / 16);
    var te = TEINTES[k % TEINTES.length];
    return { nom: LIEUX[lieu] + ' ' + PARFUMS[parfum] + (w >= 262 ? ' ' + (Math.floor((w - 6) / 256) + 1) : ''), ic: ICONES[lieu], a: te[0], b: te[1] };
  }
  function mondeDe(lvl) { return Math.floor((lvl - 1) / 10); }

  function loadProg() {
    try {
      var d = JSON.parse(localStorage.getItem('gg-bonbons-map') || 'null');
      if (d && d.lvl >= 1) { d.stars = d.stars || {}; d.best = d.best || {}; return d; }
    } catch (e) {}
    return { lvl: 1, stars: {}, best: {} };
  }
  function saveProg(d) {
    try { localStorage.setItem('gg-bonbons-map', JSON.stringify(d)); } catch (e) {}
  }
  function nf(n) {
    n = Math.round(+n || 0);
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  /* ================================================================
   * RENDU — 3. aiguillage
   * ================================================================ */
  function rendu(el, ctx) {
    sprites();
    var s = ctx.state;
    el._bbCtx = ctx;
    var soloLocal = s.players.length === 1;
    if (s.phase === 'setup') {
      el._bb = null;
      if (soloLocal) rendCarte(el, ctx);
      else rendCourse(el, ctx);
      return;
    }
    rendJeu(el, ctx);
  }

  /* ---------- la course à plusieurs (héritée) : choix du niveau ---------- */
  function rendCourse(el, ctx) {
    var html = '<p class="mini-msg big-msg">🍬 Bonbons</p>';
    if (ctx.me === 0) {
      html += '<p class="mini-msg">Course à plusieurs — choisissez le niveau :</p><div class="lvl-btns">' +
        Object.keys(LEVELS).map(function (l) {
          var c = LEVELS[l];
          return '<button class="btn big" data-lvl="' + l + '">' + c.nom + ' <small>' + c.coups + ' coups · ' +
            c.types + ' bonbons · objectif ' + c.cible + ' pts</small></button>';
        }).join('') + '</div>';
    } else html += '<p class="waiting">⏳ L’hôte choisit le niveau…</p>';
    el.innerHTML = html;
    el.querySelectorAll('[data-lvl]').forEach(function (btn) {
      btn.addEventListener('click', function () { ctx.act({ t: 'level', l: btn.getAttribute('data-lvl') }); });
    });
  }

  /* ---------- la carte des mondes ---------- */
  /* l'avatar choisi dans le profil (lu seulement ; un emoji, échappé) */
  function monAvatar() {
    try {
      var pf = JSON.parse(localStorage.getItem('gg-profil') || 'null');
      if (pf && typeof pf.av === 'string' && pf.av.length <= 8) return pf.av;
    } catch (e) {}
    return '🙂';
  }
  function rendCarte(el, ctx) {
    var prog = loadProg();
    var tot = 0, k;
    for (k in prog.stars) tot += prog.stars[k] | 0;
    var cur = prog.lvl, wCur = mondeDe(cur);
    var w0 = Math.max(0, wCur - 2), w1 = wCur + 1;
    var html = '<div class="bb-map">' +
      '<div class="bb-map-tete"><div class="bb-map-titre">L’Aventure Sucrée</div>' +
      '<div class="bb-map-stats"><span class="bb-pastille">⭐ ' + tot + '</span><span class="bb-pastille">🍬 Niveau ' + cur + '</span></div></div>';
    if (w0 > 0) html += '<div class="bb-earlier">✓ ' + w0 + ' monde' + (w0 > 1 ? 's' : '') + ' déjà traversé' + (w0 > 1 ? 's' : '') + ' · niveaux 1 à ' + (w0 * 10) + '</div>';
    for (var w = w0; w <= w1; w++) {
      var M = monde(w), etoilesM = 0;
      for (k = w * 10 + 1; k <= w * 10 + 10; k++) etoilesM += prog.stars[k] | 0;
      html += '<section class="bb-monde' + (w > wCur ? ' verrou' : '') + '" style="--ma:' + M.a + ';--mb:' + M.b + '">' +
        '<div class="bb-monde-tete"><span class="bb-monde-ic">' + M.ic + '</span><span class="bb-monde-tx"><b>' + GG.esc(M.nom) +
        '</b><small>Monde ' + (w + 1) + ' · niveaux ' + (w * 10 + 1) + ' à ' + (w * 10 + 10) + '</small></span>' +
        '<span class="bb-monde-et">⭐ ' + etoilesM + '/30</span></div><div class="bb-sentier">';
      // le sentier sinueux (dessiné sous les étapes)
      var pts = [];
      for (k = 0; k < 10; k++) pts.push([50 + 27 * Math.sin(k * 0.95 + w * 1.7), 50 + k * 96]);
      html += '<svg class="bb-sentier-svg" viewBox="0 0 100 ' + (50 + 9 * 96 + 50) + '" preserveAspectRatio="none" aria-hidden="true"><path d="M' +
        pts.map(function (q) { return q[0].toFixed(1) + ' ' + q[1]; }).join(' L') + '" /></svg>';
      for (k = 0; k < 10; k++) {
        var lvl = w * 10 + k + 1, st = prog.stars[lvl] | 0;
        var cls = lvl < cur ? 'done' : lvl === cur ? 'cur' : 'lock';
        var boss = k === 9;
        html += '<div class="bb-step" style="left:' + pts[k][0].toFixed(1) + '%;top:' + pts[k][1] + 'px">' +
          '<button class="bb-node ' + cls + (boss ? ' boss' : '') + '" data-lvl="' + lvl + '"' + (cls === 'lock' ? ' disabled' : '') +
          ' aria-label="Niveau ' + lvl + '">' + (boss && cls !== 'cur' ? '<i class="bb-couronne">👑</i>' : '') +
          (cls === 'lock' ? '<span class="bb-lock">🔒</span>' : lvl) + '</button>' +
          (cls === 'done' ? '<span class="bb-node-stars">' + [1, 2, 3].map(function (x) { return '<i class="' + (x <= st ? 'on' : '') + '">★</i>'; }).join('') + '</span>' : '') +
          (cls === 'cur' ? '<span class="bb-node-go">Jouer !</span><span class="bb-avatar" aria-hidden="true">' + GG.esc(monAvatar()) + '</span>' : '') + '</div>';
      }
      html += '</div></section>';
    }
    html += '<div class="bb-map-bas"><button class="btn big jeu" data-lvl="' + cur + '">🍬 Jouer le niveau ' + cur + '</button></div></div>';
    el.innerHTML = html;
    var parti = false;
    el.querySelectorAll('[data-lvl]:not([disabled])').forEach(function (b) {
      b.addEventListener('click', function () {
        if (parti) return;
        parti = true;
        GG.sfx.play('open');
        GG.haptic('light');
        if (!ctx.act({ t: 'start', lvl: parseInt(b.getAttribute('data-lvl'), 10) })) parti = false;
      });
    });
    var nc = el.querySelector('.bb-node.cur');
    if (nc && nc.scrollIntoView) {
      try { nc.scrollIntoView({ block: 'center' }); } catch (e) { nc.scrollIntoView(); }
    }
    GG.fx.stagger(el.querySelectorAll('.bb-node:not(.lock)'), { gap: 22 });
  }

  /* ================================================================
   * RENDU — 4. l'écran de jeu (DOM persistant, animé pièce par pièce)
   * ================================================================ */
  function posCss(i) { return 'translate(' + (COLC[i] * 100) + '%,' + (ROWC[i] * 100) + '%)'; }
  function posXY(r, c) { return 'translate(' + (c * 100) + '%,' + (r * 100) + '%)'; }

  function texteObjectif(s) {
    var g = s.goal;
    if (!g) return '';
    if (g.k === 'score') return 'Marquez ' + nf(g.n) + ' points';
    if (g.k === 'jelly') return 'Dégagez toute la gelée';
    if (g.k === 'blocks') return 'Cassez toutes les meringues';
    if (g.k === 'ingr') return 'Faites descendre ' + (g.n | 0) + ' noisette' + (g.n > 1 ? 's' : '') + ' tout en bas';
    if (g.k === 'collect') {
      return 'Récoltez ' + Object.keys(g.c).map(function (k) { return (g.c[k] | 0) + ' bonbons ' + NOMS_COULEURS[+k] || ''; }).join(' et ');
    }
    return '';
  }
  /* ce qu'il reste à faire, objectif par objectif : [{ic, n, cle}] */
  function restesObjectif(s, p) {
    var g = s.goal, out = [], i, n;
    if (!g) return out;
    if (g.k === 'score') out.push({ ic: '<i class="bb-ic-etoile">★</i>', n: Math.max(0, g.n - p.score), cle: 'score' });
    else if (g.k === 'jelly') { n = 0; for (i = 0; i < NN; i++) n += p.jelly[i] | 0; out.push({ ic: '<i class="bb-ic bbs-j1"></i>', n: n, cle: 'jelly' }); }
    else if (g.k === 'blocks') { n = 0; for (i = 0; i < NN; i++) n += p.block[i] | 0; out.push({ ic: '<i class="bb-ic bbs-m1"></i>', n: n, cle: 'blocks' }); }
    else if (g.k === 'ingr') out.push({ ic: '<i class="bb-ic bbs-n"></i>', n: Math.max(0, g.n - (p.got.ingr | 0)), cle: 'ingr' });
    else if (g.k === 'collect') {
      Object.keys(g.c).forEach(function (k) {
        var t = +k;
        if (t < 0 || t > 5) return;
        out.push({ ic: '<i class="bb-ic ' + spriteDe(t, 0) + '"></i>', n: Math.max(0, (g.c[k] | 0) - ((p.got.collect[k]) | 0)), cle: 'c' + t });
      });
    }
    return out;
  }

  function construitJeu(el, ctx) {
    var s = ctx.state, me = ctx.me, p = s.players[me];
    var solo = !!s.solo;
    var w = solo ? mondeDe(s.soloLvl) : 0, M = monde(w);
    var html = '<div class="bb-jeu' + (solo ? '' : ' course') + '" style="--ma:' + M.a + ';--mb:' + M.b + '">';
    // bandeau : coups, objectif, score et étoiles
    html += '<div class="bb-hud">' +
      '<div class="bb-hud-coups"><b id="bb-coups">' + (p.moves | 0) + '</b><small>coups</small></div>' +
      '<div class="bb-obj" id="bb-obj"></div>' +
      '<div class="bb-hud-score"><b id="bb-score">' + nf(p.score) + '</b>' +
      '<div class="bb-barre"><div class="bb-barre-fill" id="bb-barre"></div>' +
      '<i class="bb-bst" data-k="1">★</i><i class="bb-bst" data-k="2">★</i><i class="bb-bst" data-k="3">★</i></div></div>' +
      '</div>';
    if (solo) {
      html += '<div class="bb-lvl-tag"><span>' + M.ic + ' Niveau ' + (s.soloLvl | 0) + ' · ' + GG.esc(M.nom) + '</span>' +
        '<button class="bb-carte-btn" data-a="quitte" aria-label="Revenir à la carte">🗺️ Carte</button></div>';
    }
    // le plateau : les cases, les pièces, les effets
    html += '<div class="bb-stage"><div class="bb-board bb-grid">' +
      '<div class="bb-tiles" id="bb-tiles"></div>' +
      '<div class="bb-pieces" id="bb-pieces"></div>' +
      '<div class="bb-fxl" id="bb-fxl"></div>' +
      '</div></div>';
    if (!solo && s.players.length > 1) html += '<div class="mem-stats" id="bb-autres"></div>';
    html += '<div class="bb-modal-zone" id="bb-modal"></div></div>';
    el.innerHTML = html;
    var V = {
      key: s.startTs + ':' + (s.soloLvl | 0),
      root: el.querySelector('.bb-jeu'),
      board: el.querySelector('.bb-board'),
      tiles: el.querySelector('#bb-tiles'),
      pieces: el.querySelector('#bb-pieces'),
      fxl: el.querySelector('#bb-fxl'),
      modal: el.querySelector('#bb-modal'),
      map: {}, pos: {}, busy: false, speed: 1, sel: -1, fxN: -1, hud: null, modalCle: ''
    };
    el._bb = V;
    var bq = el.querySelector('[data-a="quitte"]');
    if (bq) bq.addEventListener('click', function () { confirmeCarte(V); });
    // les cases (trous, gelée, meringues)
    var th = '';
    for (var i = 0; i < NN; i++) th += '<div class="bb-tile" data-c="' + i + '"></div>';
    V.tiles.innerHTML = th;
    brancheEntrees(el, V);
    return V;
  }

  /* les cases : forme du plateau (coins arrondis), damier, gelée, meringues, sorties */
  function peintCases(V, s, jelly, block) {
    var holes = s.holes || ZEROS, tiles = V.tiles.children, ingr = s.goal && s.goal.k === 'ingr';
    for (var i = 0; i < NN; i++) {
      var t = tiles[i], r = ROWC[i], c = COLC[i];
      if (holes[i]) { t.className = 'bb-tile trou'; continue; }
      var dehors = function (rr, cc) { return rr < 0 || cc < 0 || rr >= N || cc >= N || holes[rr * N + cc]; };
      var cls = 'bb-tile' + ((r + c) % 2 ? ' alt' : '');
      if (dehors(r - 1, c) && dehors(r, c - 1)) cls += ' ctl';
      if (dehors(r - 1, c) && dehors(r, c + 1)) cls += ' ctr';
      if (dehors(r + 1, c) && dehors(r, c - 1)) cls += ' cbl';
      if (dehors(r + 1, c) && dehors(r, c + 1)) cls += ' cbr';
      if (jelly[i] > 0) cls += ' j' + Math.min(2, jelly[i] | 0);
      if (block[i] > 0) cls += ' b' + Math.min(2, block[i] | 0);
      if (ingr && dehors(r + 1, c)) cls += ' sortie';
      t.className = cls;
    }
  }

  /* crée / déplace / retire les éléments des pièces pour coller au plateau b */
  function placePieces(V, b) {
    var vus = {}, i;
    for (i = 0; i < NN; i++) {
      var pc = b[i];
      if (!pc) continue;
      var id = pc.id !== undefined ? pc.id : pc[0], t = pc.t !== undefined ? pc.t : pc[1], s = pc.s !== undefined ? pc.s : pc[2];
      vus[id] = 1;
      var e = V.map[id];
      if (!e) e = nouvellePiece(V, id, t, s, i);
      else majPiece(e, t, s, i);
      V.pos[id] = i;
    }
    for (var k in V.map) {
      if (!vus[k]) { var x = V.map[k]; if (x.parentNode) x.parentNode.removeChild(x); delete V.map[k]; delete V.pos[k]; }
    }
  }
  function nouvellePiece(V, id, t, s, i) {
    var e = document.createElement('div');
    e.className = 'bb-cell';
    e.setAttribute('data-id', id);
    e.innerHTML = '<span class="bb-candy ' + spriteDe(t, s) + '"></span>';
    majPiece(e, t, s, i);
    V.pieces.appendChild(e);
    V.map[id] = e;
    V.pos[id] = i;
    return e;
  }
  function majPiece(e, t, s, i) {
    e.setAttribute('data-i', i);
    e.setAttribute('data-t', tDe(t));
    e.style.transform = posCss(i);
    var c = e.firstChild, cls = 'bb-candy ' + spriteDe(t, s) + (s === 3 ? ' envel' : (t === ARC ? ' magique' : ''));
    if (c.className !== cls) c.className = cls;
    e.classList.remove('sel', 'bb-hint');
  }
  function pieceEn(V, i) {
    for (var id in V.pos) if (V.pos[id] === i) return V.map[id];
    return null;
  }

  /* le bandeau (coups, objectif, score, étoiles) */
  function peintHud(V, s, p, vals) {
    var root = V.root;
    var coups = vals ? vals.moves : p.moves, score = vals ? vals.score : p.score;
    var ec = root.querySelector('#bb-coups');
    ec.textContent = Math.max(0, coups | 0);
    ec.parentNode.classList.toggle('peu', coups <= 5 && s.phase === 'play');
    root.querySelector('#bb-score').textContent = nf(score);
    var st = s.stars || [s.cible, s.cible * 1.4, s.cible * 1.9];
    var max = Math.max(1, st[2] || 1);
    var fill = Math.min(100, Math.round(score * 100 / max));
    root.querySelector('#bb-barre').style.width = fill + '%';
    var bs = root.querySelectorAll('.bb-bst');
    var seuils = [st[0] || Math.round(st[1] * 0.6), st[1], st[2]];
    for (var k = 0; k < 3; k++) {
      bs[k].style.left = Math.min(96, Math.round(seuils[k] * 100 / max)) + '%';
      var ok = score >= seuils[k] && (k > 0 || !s.goal || s.goal.k === 'score' || (vals ? vals.goalDone : goalLeft(s, p) === 0));
      if (ok && !bs[k].classList.contains('on')) { bs[k].classList.add('on'); GG.fx.pop(bs[k], 1.6); }
      else if (!ok) bs[k].classList.remove('on');
    }
    var obj = root.querySelector('#bb-obj');
    var restes = vals ? vals.restes : restesObjectif(s, p);
    var h = '';
    restes.forEach(function (o) {
      h += '<span class="bb-goal' + (o.n <= 0 ? ' fait' : '') + '" data-cle="' + o.cle + '">' + o.ic +
        '<b>' + (o.n <= 0 ? '✓' : nf(o.n)) + '</b></span>';
    });
    if (obj.getAttribute('data-h') !== h) {
      obj.innerHTML = h; obj.setAttribute('data-h', h);
      obj.classList.toggle('trois', restes.length >= 3);
    }
    var autres = root.querySelector('#bb-autres');
    if (autres) {
      autres.innerHTML = s.players.map(function (q, qi) {
        if (qi === V.me) return '';
        return '<span class="mem-stat">' + GG.esc(q.name) + ' : ' + nf(q.score) + ' pts · ' + (q.moves | 0) + ' cp</span>';
      }).join('');
    }
  }

  function rendJeu(el, ctx) {
    var s = ctx.state, me = ctx.me, p = s.players[me];
    var V = el._bb;
    var cle = s.startTs + ':' + (s.soloLvl | 0);
    var neuf = !V || V.key !== cle || !el.contains(V.root);
    if (neuf) V = construitJeu(el, ctx);
    V.me = me;
    V.ctx = ctx;
    var fx = p.fx;
    var frais = fx && fx.n !== V.fxN && fx.before && fx.steps && fx.ts && Math.abs(Date.now() - fx.ts) < 5000;
    if (V.busy) {
      // une animation est en cours : elle se terminera sur l'état le plus récent
      return;
    }
    if (frais && !neuf) {
      V.fxN = fx.n;
      joueTimeline(el, V, ctx, fx);
      return;
    }
    if (fx) V.fxN = fx.n;
    peintCases(V, s, p.jelly || ZEROS, p.block || ZEROS);
    placePieces(V, p.board);
    peintHud(V, s, p, null);
    if (neuf && s.phase === 'play' && s.intro) entreePieces(V);
    modales(el, V, ctx);
    indiceDiffere(el, V);
  }

  /* les bonbons tombent en scène au début d'un niveau */
  function entreePieces(V) {
    if (GG.fx.reduced()) return;
    for (var id in V.map) {
      var e = V.map[id], i = V.pos[id];
      var d = COLC[i] * 30 + (7 - ROWC[i]) * 45;
      try {
        e.animate([{ transform: posXY(ROWC[i] - 9, COLC[i]) }, { transform: posCss(i) }],
          { duration: 520, delay: d, easing: 'cubic-bezier(.3,1.25,.6,1)', fill: 'backwards' });
      } catch (err) {}
    }
    GG.sfx.play('whoosh', { volume: 0.6 });
  }

  /* ================================================================
   * RENDU — 5. les fenêtres : début de niveau, résultat
   * ================================================================ */
  function modales(el, V, ctx) {
    var s = ctx.state, p = s.players[ctx.me];
    var cle = '';
    if (s.solo && s.phase === 'play' && s.intro) cle = 'intro:' + V.key;
    else if (s.solo && s.phase === 'result' && s.res) cle = 'res:' + s.res.ts;
    if (cle === V.modalCle) return;
    V.modalCle = cle;
    if (!cle) { V.modal.innerHTML = ''; return; }
    if (cle.indexOf('intro') === 0) modaleIntro(el, V, ctx);
    else modaleResultat(el, V, ctx);
  }
  function etoilesHtml(n) {
    return '<div class="bb-etoiles">' + [1, 2, 3].map(function (k) {
      return '<span class="bb-etoile e' + k + (k <= n ? ' on' : '') + '">★</span>';
    }).join('') + '</div>';
  }
  function modaleIntro(el, V, ctx) {
    var s = ctx.state, p = s.players[ctx.me], M = monde(mondeDe(s.soloLvl));
    var restes = restesObjectif(s, p), st = s.stars || [0, 0, 0];
    var html = '<div class="bb-voile"><div class="bb-carte bb-intro" role="dialog" aria-label="Début du niveau">' +
      '<div class="bb-carte-monde">' + M.ic + ' ' + GG.esc(M.nom) + '</div>' +
      '<div class="bb-carte-lvl">Niveau ' + (s.soloLvl | 0) + ((s.soloLvl % 10) === 0 ? ' <span class="bb-boss">👑 boss</span>' : '') + '</div>' +
      '<div class="bb-carte-objs">' + restes.map(function (o) {
        return '<span class="bb-carte-obj">' + o.ic + '<b>' + nf(o.n) + '</b></span>';
      }).join('') + '</div>' +
      '<p class="bb-carte-tx">' + GG.esc(texteObjectif(s)) + '<br>en <b>' + (p.moves | 0) + ' coups</b></p>' +
      '<div class="bb-carte-seuils"><span>★ ' + (s.goal && s.goal.k === 'score' ? nf(st[0]) : 'objectif') + '</span><span>★★ ' + nf(st[1]) +
      '</span><span>★★★ ' + nf(st[2]) + '</span></div>' +
      '<button class="btn big jeu" data-a="go">Jouer !</button>' +
      '<button class="btn link" data-a="map">🗺️ Carte</button></div></div>';
    V.modal.innerHTML = html;
    GG.fx.bounceIn(V.modal.querySelector('.bb-carte'));
    GG.fx.stagger(V.modal.querySelectorAll('.bb-carte-obj'), { gap: 90 });
    var fait = false;
    V.modal.querySelector('[data-a="go"]').addEventListener('click', function () {
      if (fait) return; fait = true;
      GG.sfx.play('pop');
      if (!ctx.act({ t: 'go' })) fait = false;
    });
    V.modal.querySelector('[data-a="map"]').addEventListener('click', function () {
      if (fait) return; fait = true;
      GG.sfx.play('back');
      if (!ctx.act({ t: 'backmap' })) fait = false;
    });
  }
  function modaleResultat(el, V, ctx) {
    var s = ctx.state, p = s.players[ctx.me], r = s.res;
    // la progression s'enregistre une fois par niveau joué
    var prog = loadProg(), lvl = s.soloLvl | 0;
    if (V.enregistre !== r.ts) {
      V.enregistre = r.ts;
      if ((prog.best[lvl] | 0) < r.score) prog.best[lvl] = r.score;
      if ((prog.stars[lvl] | 0) < r.stars) prog.stars[lvl] = r.stars;
      if (r.won && lvl === prog.lvl) prog.lvl = lvl + 1;
      saveProg(prog);
    }
    var gagne = r.won;
    var manque = '';
    if (!gagne) {
      var g = s.goal, n = goalLeft(s, p);
      if (g.k === 'score') manque = 'Il manquait ' + nf(n) + ' points.';
      else if (g.k === 'jelly') manque = 'Il restait ' + n + ' gelée' + (n > 1 ? 's' : '') + ' à dégager.';
      else if (g.k === 'blocks') manque = 'Il restait ' + n + ' couche' + (n > 1 ? 's' : '') + ' de meringue.';
      else if (g.k === 'ingr') manque = 'Il manquait ' + n + ' noisette' + (n > 1 ? 's' : '') + '.';
      else manque = 'Il manquait ' + n + ' bonbon' + (n > 1 ? 's' : '') + '.';
    }
    var titres = ['Réussi !', 'Bien joué !', 'Délicieux !', 'Divin !'];
    var html = '<div class="bb-voile' + (gagne ? ' gagne' : ' perdu') + '"><div class="bb-carte bb-res" role="dialog">' +
      '<div class="bb-carte-lvl">Niveau ' + lvl + '</div>' +
      '<div class="bb-res-titre">' + (gagne ? titres[r.stars] || 'Réussi !' : 'Plus de coups !') + '</div>' +
      (gagne ? etoilesHtml(0) : '<div class="bb-res-triste">🍬💧</div>') +
      '<div class="bb-res-score"><span id="bb-res-pts">0</span> <small>points</small></div>' +
      (gagne ? '' : '<p class="bb-carte-tx">' + manque + '</p>') +
      '<p class="bb-res-best">🏅 Record du niveau : ' + nf(Math.max(prog.best[lvl] | 0, r.score)) + '</p>' +
      (gagne ? '<button class="btn big jeu" data-a="next">Niveau ' + (lvl + 1) + ' ▶</button><button class="btn" data-a="retry">↻ Rejouer</button>'
        : '<button class="btn big jeu" data-a="retry">↻ Réessayer</button>') +
      '<button class="btn link" data-a="map">🗺️ Carte</button></div></div>';
    V.modal.innerHTML = html;
    var carte = V.modal.querySelector('.bb-carte');
    GG.fx.bounceIn(carte);
    var frais = Math.abs(Date.now() - (r.ts || 0)) < 8000; // pas de fête rejouée à la reprise
    GG.fx.countUp(V.modal.querySelector('#bb-res-pts'), frais ? 0 : r.score, r.score, 1100);
    if (!frais && gagne) {
      V.modal.querySelectorAll('.bb-etoile').forEach(function (e, k) { if (k < r.stars) e.classList.add('on'); });
    } else if (gagne) {
      GG.sfx.play('win');
      GG.haptic('success');
      // les étoiles tombent une à une
      var ets = V.modal.querySelectorAll('.bb-etoile');
      for (var k = 0; k < r.stars; k++) {
        (function (k2) {
          setTimeout(function () {
            if (!ets[k2] || !ets[k2].isConnected) return;
            ets[k2].classList.add('on', 'tombe');
            GG.sfx.play('coin', { pitch: 1 + 0.12 * k2 });
            GG.haptic('light');
            GG.fx.burst(ets[k2], { count: 14 + 6 * k2, shape: 'star', colors: ['#ffd23f', '#fff3b0', '#ff9124'] });
            if (k2 === r.stars - 1) GG.fx.confetti({ count: 60 + 50 * r.stars, from: 'top' });
          }, 520 + k2 * 520);
        })(k);
      }
    } else if (frais) {
      GG.sfx.play('lose');
      GG.haptic('warning');
    }
    var fait = false;
    function go(a) {
      if (fait) return; fait = true;
      GG.sfx.play('tap');
      if (!ctx.act(a)) fait = false;
    }
    var bn = V.modal.querySelector('[data-a="next"]');
    // anti double-appui : les boutons ne s'arment qu'après l'apparition de la fenêtre
    V.modal.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
    setTimeout(function () { V.modal.querySelectorAll('button').forEach(function (b) { b.disabled = false; }); }, 350);
    if (bn) bn.addEventListener('click', function () { go({ t: 'start', lvl: lvl + 1 }); });
    V.modal.querySelector('[data-a="retry"]').addEventListener('click', function () { go({ t: 'start', lvl: lvl }); });
    V.modal.querySelector('[data-a="map"]').addEventListener('click', function () { go({ t: 'backmap' }); });
  }

  /* quitter le niveau en cours pour la carte (après confirmation) */
  function confirmeCarte(V) {
    var ctx = V.ctx, s = ctx.state;
    if (V.busy || s.phase !== 'play') return;
    if (s.intro) { ctx.act({ t: 'backmap' }); return; }
    GG.sfx.play('open');
    V.modalCle = 'quitte';
    V.modal.innerHTML = '<div class="bb-voile"><div class="bb-carte" role="dialog" aria-label="Quitter le niveau">' +
      '<div class="bb-carte-lvl">Quitter le niveau ?</div>' +
      '<p class="bb-carte-tx">Le niveau en cours sera perdu. Vous pourrez le recommencer depuis la carte.</p>' +
      '<button class="btn big jeu" data-a="reste">Continuer à jouer</button>' +
      '<button class="btn" data-a="part">🗺️ Retour à la carte</button></div></div>';
    GG.fx.bounceIn(V.modal.querySelector('.bb-carte'));
    V.modal.querySelector('[data-a="reste"]').addEventListener('click', function () {
      GG.sfx.play('close');
      V.modalCle = '';
      V.modal.innerHTML = '';
    });
    V.modal.querySelector('[data-a="part"]').addEventListener('click', function () {
      GG.sfx.play('back');
      V.modalCle = '';
      ctx.act({ t: 'backmap' });
    });
  }

  /* ================================================================
   * RENDU — 6. glisser, toucher-toucher, indice
   * ================================================================ */
  function brancheEntrees(el, V) {
    var board = V.board, touche = null;
    function caseDe(e) {
      var r = board.getBoundingClientRect();
      var c = Math.floor((e.clientX - r.left) / (r.width / N)), rr = Math.floor((e.clientY - r.top) / (r.height / N));
      if (c < 0 || c >= N || rr < 0 || rr >= N) return -1;
      return rr * N + c;
    }
    function tente(a, b2) {
      var ctx = V.ctx, s = ctx.state, p = s.players[V.me];
      V.sel = -1;
      marqueSel(V);
      if (V.busy || s.phase !== 'play' || s.intro || p.moves <= 0) return;
      var E = ctxOf(s, p, null);
      var kind = swapKind(E, a, b2);
      if (!kind) { refuse(V, a, b2); return; }
      finIndice(V);
      ctx.act({ t: 'swap', a: a, b: b2 });
    }
    board.addEventListener('pointerdown', function (e) {
      if (V.busy) { V.speed = 2.6; return; } // un toucher pendant l'animation l'accélère
      var i = caseDe(e);
      if (i < 0) return;
      finIndice(V);
      touche = { i: i, x: e.clientX, y: e.clientY, id: e.pointerId, bouge: false };
      var pe = pieceEn(V, i);
      if (pe) pe.classList.add('presse');
      try { board.setPointerCapture(e.pointerId); } catch (err) {}
    });
    board.addEventListener('pointermove', function (e) {
      if (!touche || touche.bouge) return;
      var dx = e.clientX - touche.x, dy = e.clientY - touche.y;
      var seuil = board.getBoundingClientRect().width / N * 0.33;
      var pe = pieceEn(V, touche.i);
      if (Math.abs(dx) < seuil && Math.abs(dy) < seuil) {
        // le bonbon suit un peu le doigt
        if (pe) pe.firstChild.style.translate = Math.max(-8, Math.min(8, dx * 0.25)) + 'px ' + Math.max(-8, Math.min(8, dy * 0.25)) + 'px';
        return;
      }
      touche.bouge = true;
      if (pe) { pe.firstChild.style.translate = ''; pe.classList.remove('presse'); }
      var a = touche.i, c = COLC[a], cible;
      if (Math.abs(dx) > Math.abs(dy)) cible = dx > 0 ? (c < N - 1 ? a + 1 : -1) : (c > 0 ? a - 1 : -1);
      else cible = dy > 0 ? a + N : a - N;
      if (cible < 0 || cible >= NN) return;
      tente(a, cible);
    });
    function relache(e) {
      if (!touche) return;
      var t0 = touche;
      touche = null;
      var pe = pieceEn(V, t0.i);
      if (pe) { pe.firstChild.style.translate = ''; pe.classList.remove('presse'); }
      if (t0.bouge || e.type === 'pointercancel') return;
      var cur = V.sel;
      if (cur === -1 || cur === t0.i) {
        V.sel = cur === t0.i ? -1 : t0.i;
        if (V.sel >= 0 && !pieceEn(V, V.sel)) V.sel = -1;
        marqueSel(V);
        if (V.sel >= 0) GG.sfx.play('select', { volume: 0.5 });
      } else if (adjacent(cur, t0.i)) {
        tente(cur, t0.i);
      } else {
        V.sel = pieceEn(V, t0.i) ? t0.i : -1;
        marqueSel(V);
      }
    }
    board.addEventListener('pointerup', relache);
    board.addEventListener('pointercancel', relache);
  }
  function marqueSel(V) {
    for (var id in V.map) V.map[id].classList.toggle('sel', V.pos[id] === V.sel);
  }
  /* échange impossible : les deux bonbons font l'aller-retour en tremblant */
  function refuse(V, a, b2) {
    var ea = pieceEn(V, a), eb = pieceEn(V, b2);
    GG.sfx.play('wrong', { volume: 0.45 });
    GG.haptic('light');
    if (!ea || !eb || GG.fx.reduced()) { if (ea) GG.fx.shake(ea, 0.5); return; }
    try {
      ea.animate([{ transform: posCss(a) }, { transform: posCss(b2), offset: 0.45 }, { transform: posCss(a) }], { duration: 330, easing: 'ease-in-out' });
      eb.animate([{ transform: posCss(b2) }, { transform: posCss(a), offset: 0.45 }, { transform: posCss(b2) }], { duration: 330, easing: 'ease-in-out' });
    } catch (e) {}
  }
  /* le joueur hésite : au bout de 6 s, un bon coup se met à frétiller */
  function indiceDiffere(el, V) {
    finIndice(V);
    var s = V.ctx.state;
    if (s.phase !== 'play' || s.intro) return;
    V.indiceT = setTimeout(function () {
      V.indiceT = null;
      if (V.busy || !V.root.isConnected) return;
      var st = V.ctx.state, p = st.players[V.me];
      if (st.phase !== 'play' || st.intro || p.moves <= 0) return;
      var mv = meilleurCoup(st, p);
      if (!mv) return;
      mv.forEach(function (i) { var e = pieceEn(V, i); if (e) e.classList.add('bb-hint'); });
    }, 6000);
  }
  function finIndice(V) {
    if (V.indiceT) { clearTimeout(V.indiceT); V.indiceT = null; }
    for (var id in V.map) V.map[id].classList.remove('bb-hint');
  }

  /* ================================================================
   * RENDU — 7. le film d'un coup : échange, éclatements, chutes…
   * ================================================================ */
  function attends(V, ms) {
    return new Promise(function (res) { setTimeout(res, Math.max(0, ms / (V.speed || 1))); });
  }
  function anime(e, images, opts) {
    try { return e.animate(images, opts); } catch (err) { return null; }
  }
  var CRIS = ['', '', '', 'Sucré !', 'Délicieux !', 'Divin !', 'Sucrissime !', 'Fabuleux !', 'Incroyable !'];

  function joueTimeline(el, V, ctx, fx) {
    V.busy = true;
    V.speed = 1;
    finIndice(V);
    var s = ctx.state, p = s.players[V.me];
    var reduit = GG.fx.reduced();
    // on repart de l'instantané d'avant le coup
    placePieces(V, fx.before.b);
    peintCases(V, s, fx.before.jelly, fx.before.block);
    // valeurs du bandeau AVANT le coup, puis on les fait avancer au fil des vagues
    var vals = valeursAvant(s, p, fx);
    peintHud(V, s, p, vals);
    var jel = fx.before.jelly.slice(), blo = fx.before.block.slice();
    var etapes = fx.steps.slice(), k = 0;
    function suivante() {
      if (!V.root.isConnected) { V.busy = false; return; }
      if (k >= etapes.length) { termine(); return; }
      var st = etapes[k++], pr;
      if (reduit) pr = etapeReduite(V, st, vals, jel, blo, s);
      else if (st.k === 'swap') pr = animEchange(V, st, vals, s, p);
      else if (st.k === 'clear') pr = animVague(V, st, vals, jel, blo, s, p);
      else if (st.k === 'fall') pr = animChute(V, st);
      else if (st.k === 'exit') pr = animSortie(V, st, vals, s);
      else if (st.k === 'shuffle') pr = animMelange(V, st);
      else if (st.k === 'recolor') pr = animRecolor(V, st);
      else if (st.k === 'final') pr = animFinal(V, st);
      else pr = Promise.resolve();
      pr.then(function () { peintHud(V, s, p, vals); suivante(); }, function () { suivante(); });
    }
    function termine() {
      V.busy = false;
      V.speed = 1;
      // l'état le plus récent fait foi (sécurité : l'écran colle toujours à la grille réelle)
      var ctx2 = V.ctx, s2 = ctx2.state, p2 = s2.players[V.me];
      V.fxN = p2.fx ? p2.fx.n : V.fxN;
      V.fxl.innerHTML = '';
      // les bonbons encore en train de disparaître s'effacent tout de suite
      var partis = V.pieces.querySelectorAll('.bb-cell.part');
      for (var q3 = 0; q3 < partis.length; q3++) partis[q3].parentNode.removeChild(partis[q3]);
      // contrôle : le film doit s'arrêter exactement sur la grille réelle
      if (!reduit && p2.fx && fx && p2.fx.n === fx.n) {
        var ecarts = 0, i2, vus = {};
        for (i2 = 0; i2 < NN; i2++) {
          var pc2 = p2.board[i2];
          if (!pc2) continue;
          vus[pc2.id] = 1;
          if (V.pos[pc2.id] !== i2) ecarts++;
        }
        for (var id2 in V.pos) if (!vus[id2]) ecarts++;
        V.ecarts = (V.ecarts || 0) + ecarts;
      }
      peintCases(V, s2, p2.jelly, p2.block);
      placePieces(V, p2.board);
      peintHud(V, s2, p2, null);
      modales(el, V, ctx2);
      indiceDiffere(el, V);
    }
    suivante();
  }

  function valeursAvant(s, p, fx) {
    var vals = { moves: p.moves + 1, score: p.score - (fx.gain | 0), restes: [], goalDone: false };
    if (s.phase === 'result' && fx.bonusMoves) vals.moves = fx.bonusMoves + 1;
    var restes = restesObjectif(s, p);
    // on « rembobine » l'objectif
    var parCle = {};
    fx.steps.forEach(function (st) {
      if (st.k === 'clear') {
        st.pops.forEach(function (pp) { if (pp[2] >= 0) parCle['c' + pp[2]] = (parCle['c' + pp[2]] || 0) + 1; });
        parCle.jelly = (parCle.jelly || 0) + st.jelly.length;
        parCle.blocks = (parCle.blocks || 0) + st.blocks.length;
      }
      if (st.k === 'exit') parCle.ingr = (parCle.ingr || 0) + st.ingr.length;
    });
    var g = s.goal;
    restes.forEach(function (o) {
      var n = o.n;
      if (o.cle === 'score') n = g.n - vals.score;
      else if (o.cle.charAt(0) === 'c') {
        var t = o.cle.slice(1), deja = (p.got.collect[t] | 0) - (parCle[o.cle] || 0);
        n = Math.max(0, (g.c[t] | 0) - deja);
      } else n = o.n + (parCle[o.cle] || 0);
      if (o.cle === 'ingr') n = Math.max(0, g.n - ((p.got.ingr | 0) - (parCle.ingr || 0)));
      vals.restes.push({ ic: o.ic, n: Math.max(0, n), cle: o.cle });
    });
    return vals;
  }
  function avanceObjectif(vals, cle, n) {
    vals.restes.forEach(function (o) {
      if (o.cle === cle) o.n = Math.max(0, o.n - n);
    });
    vals.goalDone = vals.restes.every(function (o) { return o.n <= 0; });
  }

  function animEchange(V, st, vals, s, p) {
    vals.moves = Math.max(0, vals.moves - 1);
    var ea = pieceEn(V, st.a), eb = pieceEn(V, st.b);
    GG.sfx.play('swap');
    GG.haptic('light');
    if (!ea || !eb) return attends(V, 60);
    var idA = ea.getAttribute('data-id'), idB = eb.getAttribute('data-id');
    if (st.kind === 'match') {
      ea.style.transform = posCss(st.b); eb.style.transform = posCss(st.a);
      anime(ea, [{ transform: posCss(st.a) }, { transform: posCss(st.b) }], { duration: 170 / V.speed, easing: 'cubic-bezier(.4,0,.2,1)' });
      anime(eb, [{ transform: posCss(st.b) }, { transform: posCss(st.a) }], { duration: 170 / V.speed, easing: 'cubic-bezier(.4,0,.2,1)' });
      V.pos[idA] = st.b; V.pos[idB] = st.a;
      ea.setAttribute('data-i', st.b); eb.setAttribute('data-i', st.a);
      return attends(V, 175);
    }
    // combinaison : les deux se rejoignent et fusionnent
    ea.style.zIndex = 5;
    anime(ea, [{ transform: posCss(st.a) }, { transform: posCss(st.b) }], { duration: 200 / V.speed, easing: 'ease-in', fill: 'forwards' });
    anime(ea.firstChild, [{ transform: 'scale(1)' }, { transform: 'scale(1.35)' }], { duration: 200 / V.speed, fill: 'forwards' });
    anime(eb.firstChild, [{ transform: 'scale(1)' }, { transform: 'scale(1.35) rotate(20deg)' }], { duration: 200 / V.speed, fill: 'forwards' });
    if (st.kind === 'wipe' || st.kind === 'bomb') GG.sfx.play('reveal');
    return attends(V, 220);
  }

  function centreCase(V, i) {
    var r = V.rect || V.board.getBoundingClientRect(), cs = r.width / N;
    return { x: r.left + (COLC[i] + 0.5) * cs, y: r.top + (ROWC[i] + 0.5) * cs };
  }

  function animVague(V, st, vals, jel, blo, s, p) {
    var fxl = V.fxl, wave = st.wave, dur = 240;
    V.rect = V.board.getBoundingClientRect(); // une seule mesure pour toute la vague
    // transformations (sucre magique + rayé, sucre final)
    st.transform.forEach(function (tr) {
      var e = V.map[tr[1]];
      if (!e) return;
      var c = e.firstChild;
      c.className = 'bb-candy ' + spriteDe(+e.getAttribute('data-t'), tr[2]);
      anime(c, [{ transform: 'scale(1)', filter: 'brightness(1)' }, { transform: 'scale(1.3)', filter: 'brightness(1.8)' }, { transform: 'scale(1)', filter: 'brightness(1)' }], { duration: 260 });
    });
    var pause = st.transform.length ? 240 : 0;
    return attends(V, pause).then(function () {
      var sons = [];
      // éclairs du sucre magique vers chaque bonbon de la couleur
      if (st.eats.length) {
        var svg = '<svg class="bb-eclairs" viewBox="0 0 800 800" preserveAspectRatio="none">';
        st.eats.forEach(function (ea) {
          var x0 = COLC[ea.from] * 100 + 50, y0 = ROWC[ea.from] * 100 + 50;
          ea.cells.slice(0, 40).forEach(function (j) {
            var x1 = COLC[j] * 100 + 50, y1 = ROWC[j] * 100 + 50, mx = (x0 + x1) / 2 + (Math.random() - 0.5) * 60, my = (y0 + y1) / 2 + (Math.random() - 0.5) * 60;
            var d = 'M' + x0 + ' ' + y0 + ' Q' + mx.toFixed(0) + ' ' + my.toFixed(0) + ' ' + x1 + ' ' + y1;
            svg += '<path class="halo" d="' + d + '"/><path d="' + d + '" stroke="' + (TINTS[ea.color] || '#fff') + '"/>';
          });
        });
        fxl.insertAdjacentHTML('beforeend', svg + '</svg><div class="bb-flash"></div>');
        sons.push('explosion');
        dur = 380;
      }
      if (st.wipe) {
        fxl.insertAdjacentHTML('beforeend', '<div class="bb-flash fort"></div><div class="bb-onde"></div>');
        secoue(V);
        GG.haptic('heavy');
        dur = 460;
      }
      // rayons des bonbons rayés
      st.rows.forEach(function (r) { fxl.insertAdjacentHTML('beforeend', '<div class="bb-beam h" style="top:' + (r * 12.5) + '%"></div>'); });
      st.cols.forEach(function (c) { fxl.insertAdjacentHTML('beforeend', '<div class="bb-beam v" style="left:' + (c * 12.5) + '%"></div>'); });
      if (st.rows.length || st.cols.length) { sons.push('whoosh'); dur = Math.max(dur, 300); }
      // déflagrations des enveloppés
      st.bombs.forEach(function (b) {
        fxl.insertAdjacentHTML('beforeend', '<div class="bb-blast' + (st.big ? ' grand' : '') + '" style="left:' + ((COLC[b] - (st.big ? 2 : 1)) * 12.5) +
          '%;top:' + ((ROWC[b] - (st.big ? 2 : 1)) * 12.5) + '%"></div>');
      });
      if (st.bombs.length) { sons.push('explosion'); GG.haptic('medium'); if (st.big) secoue(V); }
      // chaque bonbon croqué éclate
      var pops = st.pops, sx = 0, sy = 0, nPop = 0, couleurs = {};
      pops.forEach(function (pp) {
        var e = V.map[pp[1]];
        sx += COLC[pp[0]]; sy += ROWC[pp[0]]; nPop++;
        if (pp[2] >= 0) couleurs[pp[2]] = 1;
        if (!e) return;
        delete V.map[pp[1]]; delete V.pos[pp[1]];
        e.classList.add('part'); // il s'en va : plus une pièce du plateau
        var d = Math.random() * 50;
        var a = anime(e.firstChild, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.28)', opacity: 1, offset: 0.35 }, { transform: 'scale(.1)', opacity: 0 }],
          { duration: 230 / V.speed, delay: d / V.speed, easing: 'ease-in', fill: 'forwards' });
        var retire = function () { if (e.parentNode) e.parentNode.removeChild(e); };
        if (a) a.onfinish = retire; else retire();
        setTimeout(retire, 600);
      });
      // quelques gerbes de particules (pas une par bonbon : le téléphone doit rester fluide)
      var lots = {};
      pops.forEach(function (pp) {
        var cle = pp[2] + ':' + Math.floor(ROWC[pp[0]] / 3) + ':' + Math.floor(COLC[pp[0]] / 3);
        if (!lots[cle]) lots[cle] = pp;
      });
      var nb = 0;
      Object.keys(lots).forEach(function (cle) {
        if (nb++ > 3) return;
        var pp = lots[cle], col = pp[2] >= 0 ? TINTS[pp[2]] : '#ffd23f';
        GG.fx.burst(centreCase(V, pp[0]), { count: 7, colors: [col, '#ffffff'], shape: pp[3] ? 'star' : 'circle', size: 0.8, spread: 0.8 });
      });
      st.bombs.slice(0, 2).forEach(function (b) { GG.fx.burst(centreCase(V, b), { count: 16, shape: 'star', colors: ['#fff3b0', '#ffd23f', '#ff9124'], spread: 1.4 }); });
      // spéciaux qui naissent
      st.born.forEach(function (bn) {
        var e = nouvellePiece(V, bn[1], bn[2], bn[3], bn[0]);
        anime(e.firstChild, [{ transform: 'scale(0)', opacity: 0 }, { transform: 'scale(1.35)', opacity: 1, offset: 0.6 }, { transform: 'scale(1)', opacity: 1 }],
          { duration: 360 / V.speed, delay: 120 / V.speed, easing: 'ease-out', fill: 'backwards' });
      });
      if (st.born.length) sons.push('reveal');
      // gelée et meringues
      st.jelly.forEach(function (jj) {
        jel[jj[0]] = jj[1];
        var t = V.tiles.children[jj[0]];
        t.classList.remove('j1', 'j2');
        if (jj[1] > 0) t.classList.add('j' + jj[1]);
        t.classList.remove('splash'); void t.offsetWidth; t.classList.add('splash');
      });
      if (st.jelly.length) { avanceObjectif(vals, 'jelly', st.jelly.length); sons.push('splash'); }
      var eclats = 0;
      st.blocks.forEach(function (bb2) {
        blo[bb2[0]] = bb2[1];
        var t = V.tiles.children[bb2[0]];
        t.classList.remove('b1', 'b2');
        if (bb2[1] > 0) t.classList.add('b' + bb2[1]);
        t.classList.remove('craque'); void t.offsetWidth; t.classList.add('craque');
        if (eclats++ < 3) GG.fx.burst(centreCase(V, bb2[0]), { count: 7, colors: ['#ffffff', '#f4ecdf', '#ffd6ea'], shape: 'circle', size: 0.9 });
      });
      if (st.blocks.length) { avanceObjectif(vals, 'blocks', st.blocks.length); sons.push('hit'); }
      // récolte
      pops.forEach(function (pp) { if (pp[2] >= 0) avanceObjectif(vals, 'c' + pp[2], 1); });
      vals.score += st.pts;
      if (s.goal && s.goal.k === 'score') avanceObjectif(vals, 'score', st.pts);
      // le son de la vague (une seule note par vague, de plus en plus aiguë)
      GG.sfx.play('pop', { pitch: Math.min(1.9, 1 + 0.1 * (wave - 1)), volume: 0.9 });
      if (sons.length) GG.sfx.play(sons[0]);
      // points qui jaillissent (un élément CSS : aucune mesure de mise en page)
      if (nPop && st.pts) {
        var pt = document.createElement('div');
        pt.className = 'bb-points' + (wave >= 3 ? ' dore' : '');
        pt.style.left = ((sx / nPop + 0.5) * 12.5) + '%';
        pt.style.top = ((sy / nPop + 0.5) * 12.5) + '%';
        pt.style.fontSize = (18 + Math.min(12, wave * 2)) + 'px';
        pt.textContent = '+' + nf(st.pts);
        fxl.appendChild(pt);
        setTimeout(function () { if (pt.parentNode) pt.parentNode.removeChild(pt); }, 1000);
      }
      // les grandes cascades s'annoncent en grand
      if (wave >= 3) annonce(V, CRIS[Math.min(8, wave)], wave);
      if (wave === 2) GG.haptic('light');
      return attends(V, dur).then(function () {
        var vieux = fxl.querySelectorAll('.bb-beam, .bb-blast, .bb-flash, .bb-eclairs, .bb-onde');
        setTimeout(function () { for (var q = 0; q < vieux.length; q++) if (vieux[q].parentNode) vieux[q].parentNode.removeChild(vieux[q]); }, 500);
      });
    });
  }
  /* le plateau tremble (et lui seul : secouer toute la page coûte trop cher) */
  function secoue(V) {
    if (GG.fx.reduced()) return;
    V.board.classList.remove('secoue');
    void V.board.offsetWidth;
    V.board.classList.add('secoue');
  }
  function annonce(V, texte, niveau) {
    var d = document.createElement('div');
    d.className = 'bb-combo n' + Math.min(6, niveau);
    d.innerHTML = GG.esc(texte) + '<small>cascade ×' + niveau + '</small>';
    V.fxl.appendChild(d);
    GG.sfx.play('combo', { level: Math.min(8, niveau - 1) });
    GG.haptic(niveau >= 5 ? 'heavy' : 'medium');
    setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 1300);
  }

  /* chute : chaque pièce suit son trajet tic par tic, en accélérant, puis rebondit */
  function animChute(V, st) {
    var ticks = st.ticks, T = [0], k;
    for (k = 0; k < ticks.length + 1; k++) T.push(T[k] + Math.max(34, 74 * Math.pow(0.86, k)) / V.speed);
    var chemins = {}, dernier = {};
    // les pièces neuves entrent par le haut de leur colonne
    st.spawns.forEach(function (sp) {
      var id = sp[0], L = sp[4];
      nouvellePiece(V, id, sp[1], sp[2], L);
      // entrée : de la case au-dessus (invisible) jusqu'à la case de pluie, en un tic
      chemins[id] = [[sp[3], (ROWC[L] - 1) * N + COLC[L], true], [sp[3] + 1, L]];
    });
    for (k = 0; k < ticks.length; k++) {
      ticks[k].forEach(function (mv) {
        var id = mv[0];
        if (!chemins[id]) chemins[id] = [[k, mv[1], false]];
        chemins[id].push([k + 1, mv[2]]);
        dernier[id] = k + 1;
      });
    }
    var fin = 0, nb = 0;
    Object.keys(chemins).forEach(function (id) {
      var ch = chemins[id], e = V.map[id];
      if (!e) return;
      nb++;
      var nouveau = ch[0][2];
      var t0 = T[ch[0][0]], t1 = T[Math.min(T.length - 1, ch[ch.length - 1][0])];
      var total = Math.max(1, t1 - t0), imgs = [];
      ch.forEach(function (pt, q) {
        var r = Math.floor((pt[1] + 64) / N) - 8, c = ((pt[1] % N) + N) % N;
        var img = { transform: posXY(r, c), offset: Math.min(1, (T[pt[0]] - t0) / total) };
        if (nouveau) img.opacity = q === 0 ? 0 : 1;
        imgs.push(img);
      });
      // offsets strictement croissants
      for (var q = 1; q < imgs.length; q++) if (imgs[q].offset <= imgs[q - 1].offset) imgs[q].offset = Math.min(1, imgs[q - 1].offset + 0.0001);
      imgs[0].offset = 0; imgs[imgs.length - 1].offset = 1;
      var finale = ch[ch.length - 1][1];
      e.style.transform = posCss(finale);
      e.setAttribute('data-i', finale);
      V.pos[id] = finale;
      anime(e, imgs, { duration: total, delay: t0, easing: 'linear', fill: 'backwards' });
      // le petit rebond à l'atterrissage
      anime(e.firstChild, [{ transform: 'scale(1,1)' }, { transform: 'scale(1.12,.84) translateY(8%)', offset: 0.35 }, { transform: 'scale(.97,1.04)', offset: 0.7 }, { transform: 'scale(1,1)' }],
        { duration: 170 / V.speed, delay: t0 + total, easing: 'ease-out' });
      fin = Math.max(fin, t0 + total);
    });
    if (nb) setTimeout(function () { GG.sfx.play('drop', { volume: Math.min(0.7, 0.25 + nb * 0.02) }); }, Math.max(0, fin - 40));
    return new Promise(function (res) { setTimeout(res, fin + 90 / V.speed); });
  }

  function animSortie(V, st, vals, s) {
    st.ingr.forEach(function (x) {
      var e = V.map[x[1]];
      delete V.map[x[1]]; delete V.pos[x[1]];
      var cible = V.root.querySelector('.bb-goal[data-cle="ingr"]') || V.root.querySelector('#bb-obj');
      if (e) {
        e.classList.add('part');
        GG.fx.burst(centreCase(V, x[0]), { count: 16, shape: 'star', colors: ['#ffd23f', '#fff3b0', '#c98a4a'] });
        if (cible) GG.fx.flyTo(e.firstChild, cible, { duration: 650, arc: 0.4, scaleTo: 0.5 });
        anime(e, [{ transform: posCss(x[0]), opacity: 1 }, { transform: posXY(ROWC[x[0]] + 1, COLC[x[0]]), opacity: 0 }], { duration: 300, fill: 'forwards' });
        setTimeout(function () { if (e.parentNode) e.parentNode.removeChild(e); }, 320);
      }
    });
    avanceObjectif(vals, 'ingr', st.ingr.length);
    vals.score += st.pts;
    GG.sfx.play('coin');
    GG.haptic('success');
    return attends(V, 340);
  }

  function animMelange(V, st) {
    banniere(V, 'Plus de coup possible : on mélange !', 'melange');
    GG.sfx.play('shuffle');
    var recol = {};
    (st.recolor || []).forEach(function (rc) { recol[rc[0]] = rc[1]; });
    return attends(V, 650).then(function () {
      st.to.forEach(function (x) {
        var id = x[0], i = x[1], e = V.map[id];
        if (!e) return;
        var avant = V.pos[id];
        e.style.transform = posCss(i);
        e.setAttribute('data-i', i);
        V.pos[id] = i;
        if (avant !== i) {
          anime(e, [{ transform: posCss(avant) }, { transform: 'translate(350%,350%) scale(.6)', offset: 0.5 }, { transform: posCss(i) }],
            { duration: 620 / V.speed, easing: 'cubic-bezier(.5,0,.3,1)' });
        }
        if (recol[id] !== undefined) {
          e.setAttribute('data-t', tDe(recol[id]));
          e.firstChild.className = 'bb-candy ' + spriteDe(recol[id], 0);
        }
      });
      return attends(V, 700);
    });
  }
  function animRecolor(V, st) {
    st.cells.forEach(function (x) {
      var e = V.map[x[0]];
      if (e) { e.setAttribute('data-t', tDe(x[1])); e.firstChild.className = 'bb-candy ' + spriteDe(x[1], 0); }
    });
    return attends(V, 40);
  }
  function animFinal(V, st) {
    banniere(V, 'Sucre final !', 'final');
    GG.sfx.play('fanfare');
    return attends(V, 900);
  }
  function banniere(V, texte, cls) {
    var d = document.createElement('div');
    d.className = 'bb-banniere ' + (cls || '');
    d.textContent = texte;
    V.fxl.appendChild(d);
    setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 1700);
  }
  /* animations réduites : on passe d'état en état sans mouvement */
  function etapeReduite(V, st, vals, jel, blo, s) {
    if (st.k === 'swap') vals.moves = Math.max(0, vals.moves - 1);
    if (st.k === 'clear') {
      vals.score += st.pts;
      st.jelly.forEach(function () { avanceObjectif(vals, 'jelly', 1); });
      st.blocks.forEach(function () { avanceObjectif(vals, 'blocks', 1); });
      st.pops.forEach(function (pp) { if (pp[2] >= 0) avanceObjectif(vals, 'c' + pp[2], 1); });
    }
    if (st.k === 'exit') { avanceObjectif(vals, 'ingr', st.ingr.length); vals.score += st.pts; }
    return Promise.resolve();
  }

  /* Instantané du plateau avant un coup (le rendu part de là pour animer) */
  function snapshot(E) {
    return {
      b: E.b.map(function (pc) { return pc ? [pc.id, pc.t, pc.s] : null; }),
      jelly: E.jelly.slice(),
      block: E.block.slice()
    };
  }

  /* ================================================================
   * Outils pour les tests (plateaux « bruts » sans niveau)
   * ================================================================ */
  function ctxBrut(b) {
    var p = { board: b, seq: 1000 };
    var E = ctxOf({ types: 5 }, p, null);
    p.score = 0;
    return E;
  }
  mod._findRuns = findRuns;
  mod._wouldMatch = wouldMatch;
  mod._buildBoard = buildBoard;
  mod._N = N;
  mod._promoteFor = promoteFor;
  mod._hasMove = function (b) { return hasMoveE(ctxBrut(b)); };
  mod._resolve = function (b, types, swapIdx, fx) {
    var E = ctxBrut(b);
    E.types = types || 5;
    E.rec = { steps: null, rows: [], cols: [], bombs: [], pops: [], arc: 0, wipe: false, combo: 0, gain: 0 };
    assureIds(E);
    E.sa = swapIdx === undefined ? -1 : swapIdx;
    cascade(E);
    if (fx) {
      ['rows', 'cols', 'bombs', 'pops'].forEach(function (k) {
        fx[k] = fx[k] || [];
        E.rec[k].forEach(function (x) { fx[k].push(x); });
      });
      fx.arc = (fx.arc || 0) + E.rec.arc;
      fx.combo = E.rec.combo;
    }
    return { pts: E.p.score, combo: E.rec.combo };
  };
  mod._spread = function (b, marks, fx) {
    var E = ctxBrut(b), m = zeros(), zone = zeros();
    for (var k in marks) if (marks[k]) m[+k] = 1;
    var st = { rows: [], cols: [], bombs: [], eats: [], arc: 0 };
    propage(E, m, zone, {}, st);
    for (var i = 0; i < NN; i++) if (m[i]) marks[i] = true;
    if (fx) {
      st.rows.forEach(function (x) { fx.rows.push(x); });
      st.cols.forEach(function (x) { fx.cols.push(x); });
      if (fx.bombs) st.bombs.forEach(function (x) { fx.bombs.push(x); });
    }
  };
  mod._levelDef = levelDef;
  mod._levelCfg = function (n) {
    var d = levelDef(n);
    return { coups: d.m, types: d.c, goal: d.g, cible: d.g === 'score' ? d.n : d.s[1], stars: d.s };
  };
  mod._monde = monde;
  mod._mondeDe = mondeDe;
  mod._genLevel = genLevel;
  mod._reglePar = reglePar;
  mod._tauxVise = tauxVise;
  mod._MODELE = MODELE;
  mod._LEVELS_DATA = LEVELS_DATA;
  mod._goalLeft = goalLeft;
  mod._starsFor = starsFor;
  mod._stars = stars;
  mod._ctxOf = ctxOf;
  mod._hasMoveE = hasMoveE;
  mod._allMoves = allMoves;
  mod._swapKind = swapKind;
  mod._shuffleBoard = shuffleBoard;
  mod._ensureMoves = ensureMoves;
  mod._settle = settleAll;
  mod._parsePlan = parsePlan;
  mod._setRandom = function (f) { RND = f || Math.random; };
  mod._meilleurCoup = meilleurCoup;
  mod._evalCoup = evalCoup;
  mod._mulberry = mulberry;
  mod._ARC = ARC;
  mod._ING = ING;

  GG.register(mod);
  if (typeof module === 'object' && module.exports) module.exports = mod;
})(typeof self !== 'undefined' ? self : globalThis);
