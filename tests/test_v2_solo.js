/*
 * V2 — les deux jeux solo refaits : Sudoku et Bonbons.
 * Tests de logique (Node) : chaque bug de l'audit a son contrôle chiffré.
 *
 *   node tests/test_v2_solo.js            (complet)
 *   node tests/test_v2_solo.js sudoku     (une seule partie)
 *   node tests/test_v2_solo.js bonbons
 */
const ROOT = require('path').join(__dirname, '..');
require(ROOT + '/js/games/registry.js');
const sudoku = require(ROOT + '/js/games/sudoku.js');

let failures = 0;
function check(n, c, e) {
  if (c) console.log('  OK  ' + n);
  else { failures++; console.log('  FAIL ' + n + (e !== undefined ? ' -> ' + JSON.stringify(e) : '')); }
}
const QUOI = process.argv[2] || 'tout';
function quantile(arr, q) {
  const a = arr.slice().sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor(q * (a.length - 1)))];
}
function validSolution(g) {
  for (let u = 0; u < 9; u++) {
    const row = new Set(), col = new Set(), box = new Set();
    for (let k = 0; k < 9; k++) {
      row.add(g[u * 9 + k]);
      col.add(g[k * 9 + u]);
      box.add(g[(Math.floor(u / 3) * 3 + Math.floor(k / 3)) * 9 + (u % 3) * 3 + (k % 3)]);
    }
    if (row.size !== 9 || col.size !== 9 || box.size !== 9) return false;
  }
  return true;
}

/* =====================================================================
 * SUDOKU
 * ===================================================================== */
if (QUOI === 'tout' || QUOI === 'sudoku') {
  console.log('--- Sudoku : 4 niveaux classés par techniques humaines ---');
  const TIERS = { facile: 1, moyen: 1, difficile: 2, expert: 3 };
  const N = 50;
  const bilan = {};
  for (const lvl of ['facile', 'moyen', 'difficile', 'expert']) {
    const times = [], clues = [], techs = {};
    let uniques = 0, bonsNiveaux = 0, valides = 0, coherents = 0, reserve = 0;
    for (let k = 0; k < N; k++) {
      // temps PROCESSEUR du calcul (la machine de test est partagée : l'horloge murale mentirait)
      const c0 = process.cpuUsage();
      const m = sudoku._makePuzzle(lvl, Math.random, 1e9);
      const c1 = process.cpuUsage(c0);
      times.push((c1.user + c1.system) / 1000);
      if (m.reserve) reserve++;
      clues.push(m.clues);
      if (sudoku._countSolutions(m.puzzle, 2) === 1) uniques++;
      if (validSolution(m.solution)) valides++;
      if (m.puzzle.every((v, i) => v === 0 || v === m.solution[i])) coherents++;
      const r = sudoku._rate(m.puzzle); // on re-note de façon indépendante
      if (r.solved && r.tier === TIERS[lvl] && sudoku._convient(lvl, r)) bonsNiveaux++;
      Object.keys(r.used).forEach(t => { techs[t] = (techs[t] || 0) + 1; });
    }
    bilan[lvl] = { p50: quantile(times, 0.5).toFixed(1), p95: quantile(times, 0.95).toFixed(1), max: Math.max(...times).toFixed(1) };
    check(lvl + ' : ' + N + ' grilles à solution unique', uniques === N, uniques);
    check(lvl + ' : solutions valides et indices cohérents', valides === N && coherents === N);
    check(lvl + ' : 100 % des grilles exigent EXACTEMENT les techniques du niveau (palier ' + TIERS[lvl] + ')',
      bonsNiveaux === N, bonsNiveaux);
    console.log('       indices ' + Math.min(...clues) + '–' + Math.max(...clues) + ' · techniques : ' +
      Object.keys(techs).map(t => sudoku._TECH[t].nom + ' ' + Math.round(100 * techs[t] / N) + ' %').join(', '));
    console.log('       génération (Node, temps processeur) : médiane ' + bilan[lvl].p50 + ' ms, 95 % ' +
      bilan[lvl].p95 + ' ms, pire ' + bilan[lvl].max + ' ms' + (reserve ? ' · réserve ×' + reserve : ''));
    // au processeur ×4 tout est ~4 fois plus long : 95 % des grilles en < 60 ms ici (< 240 ms à ×4) ;
    // (budget illimité ici pour mesurer la génération pure ; en jeu, au-delà de 140 ms, la réserve
    // prend le relais — la mesure réelle à ×4 est dans le test navigateur)
    check(lvl + ' : génération rapide (95 % < 60 ms, jamais > 200 ms)',
      quantile(times, 0.95) < 60 && Math.max(...times) < 200, bilan[lvl]);
  }
  check('facile : 38 à 40 cases données', (() => {
    for (let k = 0; k < 10; k++) { const m = sudoku._makePuzzle('facile'); if (m.clues < 38 || m.clues > 40) return false; }
    return true;
  })());
  // bug d'origine : « difficile » contenait des grilles triviales ET des grilles d'expert
  check('difficile : aucune grille triviale (singletons seuls) ni d’expert (X-wing…)', (() => {
    for (let k = 0; k < 40; k++) { const r = sudoku._rate(sudoku._makePuzzle('difficile').puzzle); if (r.tier !== 2) return false; }
    return true;
  })());
  check('expert : jamais de grille résoluble sans technique avancée', (() => {
    for (let k = 0; k < 30; k++) { const r = sudoku._rate(sudoku._makePuzzle('expert').puzzle); if (r.tier !== 3) return false; }
    return true;
  })());
  // le « joueur humain » qui classe les grilles ne se trompe jamais : sur des grilles minimales
  // (les plus dures), chaque chiffre qu'il déduit est celui de la solution, résolue ou non
  check('les techniques humaines ne déduisent jamais un faux chiffre (300 grilles minimales)', (() => {
    const rnd = sudoku._mulberry(5);
    for (let k = 0; k < 300; k++) {
      const sol = sudoku._fullGrid(rnd), r = sudoku._rate(sudoku._dig(sol, 17, rnd).puzzle);
      if (r.grid.some((v, i) => v && v !== sol[i])) return false;
    }
    return true;
  })());
  // réserve de secours : grilles classées, transformées sans changer leur logique
  check('réserve de secours : chaque grille unique et du bon niveau', (() => {
    for (const lvl in sudoku._RESERVE) {
      for (const s of sudoku._RESERVE[lvl]) {
        const g = s.split('').map(c => c === '.' ? 0 : +c);
        if (sudoku._countSolutions(g, 2) !== 1 || !sudoku._convient(lvl, sudoku._rate(g))) return false;
      }
    }
    return true;
  })());
  check('réserve : une grille tirée est transformée, unique, du bon niveau', (() => {
    const rnd = sudoku._mulberry(42);
    for (const lvl of ['facile', 'moyen', 'difficile', 'expert']) {
      for (let k = 0; k < 6; k++) {
        const m = sudoku._deLaReserve(lvl, rnd, 0);
        if (!validSolution(m.solution) || sudoku._countSolutions(m.puzzle, 2) !== 1) return false;
        if (!sudoku._convient(lvl, sudoku._rate(m.puzzle))) return false;
        if (!m.puzzle.every((v, i) => v === 0 || v === m.solution[i])) return false;
      }
    }
    return true;
  })());
  check('budget de temps dépassé → la réserve prend le relais, toujours du bon niveau', (() => {
    const m = sudoku._makePuzzle('expert', Math.random, -1);
    return sudoku._convient('expert', sudoku._rate(m.puzzle)) && sudoku._countSolutions(m.puzzle, 2) === 1;
  })());

  // ---- défi du jour ----
  const d1 = sudoku._makeDaily('2026-09-28'), d1b = sudoku._makeDaily('2026-09-28'), d2 = sudoku._makeDaily('2026-09-29');
  check('défi du jour : la même grille pour tout le monde', d1.puzzle.join('') === d1b.puzzle.join(''));
  check('défi du jour : une autre grille le lendemain', d1.puzzle.join('') !== d2.puzzle.join(''));
  check('défi du jour : niveau du jour respecté, grille unique',
    d1.level === sudoku._niveauDuJour('2026-09-28') && sudoku._convient(d1.level, sudoku._rate(d1.puzzle)) &&
    sudoku._countSolutions(d1.puzzle, 2) === 1, d1.level);
  {
    const st = sudoku.create(['Solo']);
    check('défi du jour : date invalide refusée', !sudoku.apply(st, 0, { t: 'daily', jour: '<img>' }).ok);
    const r = sudoku.apply(st, 0, { t: 'daily', jour: '2026-09-28' });
    check('défi du jour lancé', r.ok && st.daily === '2026-09-28' && st.puzzle.join('') === d1.puzzle.join(''));
  }

  // ---- une partie : notes, notes auto, gomme, annulation illimitée, indice ----
  console.log('--- Sudoku : outils de jeu ---');
  const st = sudoku.create(['Solo']);
  check('niveau expert disponible', sudoku.apply(st, 0, { t: 'level', l: 'expert' }).ok && st.level === 'expert');
  const vides = [];
  st.puzzle.forEach((v, i) => { if (!v) vides.push(i); });
  const a = vides[0], b = vides[1];
  const bonA = st.solution[a], fauxA = bonA % 9 + 1;
  const photo = JSON.stringify({ g: st.grids[0], n: st.notes[0], b: st.bad[0] });
  let r = sudoku.apply(st, 0, { t: 'note', i: a, v: 3 });
  r = sudoku.apply(st, 0, { t: 'note', i: a, v: 7 });
  check('notes au crayon : deux candidats notés', r.ok && st.notes[0][a] === ((1 << 2) | (1 << 6)));
  sudoku.apply(st, 0, { t: 'note', i: a, v: 3 });
  check('note retirée d’un second appui', st.notes[0][a] === (1 << 6));
  r = sudoku.apply(st, 0, { t: 'auto' });
  const cand = (() => {
    let m = 511;
    for (let j = 0; j < 81; j++) {
      if (j === a || !st.grids[0][j]) continue;
      if (Math.floor(j / 9) === Math.floor(a / 9) || j % 9 === a % 9 ||
        (Math.floor(j / 27) === Math.floor(a / 27) && Math.floor((j % 9) / 3) === Math.floor((a % 9) / 3))) {
        m &= ~(1 << (st.grids[0][j] - 1));
      }
    }
    return m;
  })();
  check('notes automatiques : exactement les candidats de chaque case', r.ok && st.notes[0][a] === cand &&
    (st.notes[0][a] & (1 << (bonA - 1))) !== 0);
  r = sudoku.apply(st, 0, { t: 'set', i: a, v: fauxA });
  check('mauvais chiffre : affiché en rouge, erreur comptée', r.ok && st.bad[0][a] === 1 && st.players[0].errors === 1);
  r = sudoku.apply(st, 0, { t: 'erase', i: a });
  check('gomme : le chiffre faux s’efface', r.ok && st.grids[0][a] === 0);
  r = sudoku.apply(st, 0, { t: 'set', i: a, v: bonA });
  check('bon chiffre : juste, et ses notes disparaissent chez les voisines', r.ok && st.bad[0][a] === 0 &&
    st.players[0].filled === 1 && vides.every(j => j === a || !(st.notes[0][j] & (1 << (bonA - 1))) ||
      !(Math.floor(j / 9) === Math.floor(a / 9) || j % 9 === a % 9)));
  check('un chiffre juste ne se change plus (pas d’erreur par mégarde)',
    !sudoku.apply(st, 0, { t: 'set', i: a, v: fauxA }).ok && st.players[0].errors === 1);
  check('case de départ : refus expliqué', /grille de départ/.test(sudoku.apply(st, 0, { t: 'set', i: st.puzzle.findIndex(v => v), v: 1 }).error));
  // annulation illimitée : tout défaire revient à la grille de départ (les erreurs restent comptées)
  for (let k = 0; k < 40; k++) {
    const j = vides[2 + (k % 20)];
    sudoku.apply(st, 0, { t: 'note', i: j, v: 1 + (k % 9) });
  }
  let n = 0;
  while (sudoku.apply(st, 0, { t: 'undo' }).ok) n++;
  check('annulation illimitée : ' + n + ' coups défaits, grille et notes d’origine',
    n >= 45 && JSON.stringify({ g: st.grids[0], n: st.notes[0], b: st.bad[0] }) === photo && st.players[0].filled === 0);
  check('les erreurs ne s’effacent pas en annulant', st.players[0].errors === 1);
  // indice : révèle une case juste, coûte 30 s
  const avant = st.elapsed;
  r = sudoku.apply(st, 0, { t: 'hint', i: b });
  check('indice : la case choisie est révélée, juste et verrouillée', r.ok && st.grids[0][b] === st.solution[b] &&
    st.lock[0][b] === 1 && st.players[0].hints === 1 && st.players[0].filled === 1);
  check('indice : pénalité de 30 s au chrono', st.elapsed - avant >= 30000);
  r = sudoku.apply(st, 0, { t: 'hint' });
  check('indice sans case choisie : une case déductible est révélée', r.ok && st.players[0].hints === 2 && st.players[0].filled === 2);
  // pause : le chrono s'arrête
  sudoku.apply(st, 0, { t: 'pause' });
  const e0 = st.elapsed;
  st.lastTs -= 60000; // une minute passe…
  sudoku.apply(st, 0, { t: 'resume' });
  check('pause : le temps ne court pas', st.elapsed === e0 && st.paused === false);
  // redact : pas de solution côté affichage, mais tout ce qu'il faut pour dessiner
  const red = sudoku.redact(st, 0);
  check('redact : solution masquée, grille, notes et erreurs visibles',
    red.solution === undefined && red.grids[0] && red.notes[0] && red.bad[0]);

  // limite de 3 erreurs → perdu, gagnants = null
  const sl = sudoku.create(['Solo']);
  sudoku.apply(sl, 0, { t: 'level', l: 'facile', err: 3 });
  const vl = sl.puzzle.indexOf(0);
  for (let k = 1; k <= 9 && !sl.finished; k++) if (k !== sl.solution[vl]) sudoku.apply(sl, 0, { t: 'set', i: vl, v: k });
  check('3 erreurs : partie perdue', sl.finished && sl.lost && sl.players[0].errors === 3);
  check('gagnants : null après une défaite', sudoku.gagnants(sl) === null);
  const sn = sudoku.create(['Solo']);
  sudoku.apply(sn, 0, { t: 'level', l: 'facile', err: 0 });
  const vn = sn.puzzle.indexOf(0);
  for (let k = 1; k <= 9; k++) if (k !== sn.solution[vn]) sudoku.apply(sn, 0, { t: 'set', i: vn, v: k });
  check('sans limite : 8 erreurs et la partie continue', !sn.finished && sn.players[0].errors === 8);
  // victoire
  for (let i = 0; i < 81; i++) if (!sn.puzzle[i]) sudoku.apply(sn, 0, { t: 'set', i, v: sn.solution[i] });
  check('grille finie : victoire, gagnants = [0]', sn.finished && sn.players[0].done && JSON.stringify(sudoku.gagnants(sn)) === '[0]');
  check('fin : la vague de validation est annoncée au rendu', sn.fx && sn.fx.win === true);
  check('résumé : temps, erreurs et indices', /Temps/.test(sudoku.summary(sn)) && /Erreurs/.test(sudoku.summary(sn)));
  // une partie enregistrée par l'ancienne version se reprend sans planter
  {
    const m = sudoku._makePuzzle('facile');
    const old = { players: [{ name: 'A', filled: 0, errors: 1, done: false, rank: 0 }], phase: 'play', level: 'moyen',
      puzzle: m.puzzle, solution: m.solution, grids: { 0: m.puzzle.slice() }, toFill: m.puzzle.filter(v => !v).length,
      startTs: Date.now() - 60000, durationSec: 0, finished: false, winner: -1 };
    const i = m.puzzle.indexOf(0);
    const r = sudoku.apply(old, 0, { t: 'set', i, v: m.solution[i] });
    check('ancienne sauvegarde : reprise sans erreur (notes, annulation, chrono ajoutés)',
      r.ok && old.notes && old.undo[0].length === 1 && old.elapsed > 0 && old.players[0].filled === 1);
  }
  // lignes / colonnes / blocs terminés : signalés pour la vague de lumière
  {
    const s2 = sudoku.create(['Solo']);
    sudoku.apply(s2, 0, { t: 'level', l: 'facile' });
    let vu = false;
    for (let i = 0; i < 81 && !vu; i++) {
      if (s2.puzzle[i]) continue;
      sudoku.apply(s2, 0, { t: 'set', i, v: s2.solution[i] });
      if (s2.fx.rows.length || s2.fx.cols.length || s2.fx.boxes.length) vu = true;
    }
    check('ligne / colonne / bloc terminé : signalé au rendu', vu);
  }
}

/* =====================================================================
 * BONBONS
 * ===================================================================== */
if (QUOI === 'tout' || QUOI === 'bonbons') {
  const bb = require(ROOT + '/js/games/bonbons.js');
  const ARC = bb._ARC, ING = bb._ING;
  const rnd = bb._mulberry(2026);
  bb._setRandom(rnd);
  const ri = n => Math.floor(rnd() * n);

  // ---------------------------------------------------------------
  console.log('--- Bonbons : la grille est TOUJOURS stable après un coup (bug 1) ---');
  const COUPS = +(process.env.COUPS || 100000);
  const niveaux = [1, 3, 11, 20, 21, 30, 41, 49, 58, 60, 75, 123, 404];
  let coups = 0, instables = 0, fauxAcceptes = 0, essaisFaux = 0, apresMagique = 0, magiqueInstable = 0;
  let idsDoubles = 0, pertes = 0, melanges = 0, melangesSansPerte = 0, parties = 0, t0 = Date.now();
  const kinds = { match: 0, combo: 0, bomb: 0, wipe: 0 };
  while (coups < COUPS) {
    const st = bb.create(['Solo']);
    bb.apply(st, 0, { t: 'start', lvl: niveaux[parties++ % niveaux.length] });
    const p = st.players[0];
    p.moves = 300;
    while (st.phase === 'play' && coups < COUPS) {
      // des spéciaux injectés au hasard : rayés, enveloppés, sucres magiques
      if (rnd() < 0.3) {
        for (let k = 0; k < 3; k++) {
          const pc = p.board[ri(64)];
          if (pc && pc.t >= 0) { if (rnd() < 0.2) { pc.t = ARC; pc.s = 0; } else pc.s = 1 + ri(3); }
        }
      }
      const E = bb._ctxOf(st, p, null);
      const moves = bb._allMoves(E);
      if (!moves.length) break;
      const speciaux = moves.filter(m => bb._swapKind(E, m[0], m[1]) !== 'match');
      const mv = speciaux.length && rnd() < 0.4 ? speciaux[ri(speciaux.length)] : moves[ri(moves.length)];
      const kind = bb._swapKind(E, mv[0], mv[1]);
      const nAvant = p.board.filter(x => x && x.t !== ING).length;
      const r = bb.apply(st, 0, { t: 'swap', a: mv[0], b: mv[1], anim: coups % 40 === 0 });
      if (!r.ok) { pertes++; break; }
      kinds[kind]++; coups++;
      if (bb._findRuns(p.board).length) instables++;
      if (kind === 'bomb' || kind === 'wipe') { apresMagique++; if (bb._findRuns(p.board).length) magiqueInstable++; }
      const ids = p.board.filter(Boolean).map(x => x.id);
      if (new Set(ids).size !== ids.length) idsDoubles++;
      if (p.fx && p.fx.shuffled) {
        melanges++;
        const pieces = p.board.filter(x => x && x.t !== ING).length;
        if (pieces > 0 && nAvant > 0) melangesSansPerte++;
      }
      if (st.phase !== 'play') break;
      // l'ancien bug : après un sucre magique, N'IMPORTE QUEL échange était accepté
      for (let e = 0; e < 3; e++) {
        const a = ri(64), dir = [1, -1, 8, -8][ri(4)], b = a + dir;
        if (b < 0 || b >= 64 || (Math.abs(dir) === 1 && (a >> 3) !== (b >> 3))) continue;
        const E2 = bb._ctxOf(st, p, null);
        if (bb._swapKind(E2, a, b)) continue;
        essaisFaux++;
        if (bb.apply(st, 0, { t: 'swap', a, b, anim: false }).ok) fauxAcceptes++;
      }
    }
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log('       ' + coups + ' coups en ' + secs + ' s (' + parties + ' parties) : ' + JSON.stringify(kinds) + ', ' + melanges + ' mélanges');
  check('bug 1 : ' + coups + ' coups (spéciaux et combinaisons compris) : aucun alignement en attente', instables === 0 && pertes === 0, { instables, pertes });
  check('bug 1 : après ' + apresMagique + ' sucres magiques joués : grille toujours stable', apresMagique > 1000 && magiqueInstable === 0, { apresMagique, magiqueInstable });
  check('bug 1 : ' + essaisFaux + ' échanges sans alignement tentés : tous refusés', essaisFaux > 10000 && fauxAcceptes === 0, fauxAcceptes);
  check('toutes les combinaisons jouées (rayé/enveloppé entre eux, sucre magique, deux sucres)',
    kinds.combo > 1000 && kinds.bomb > 1000 && kinds.wipe > 20, kinds);
  check('chaque bonbon garde un identifiant unique (animations fiables)', idsDoubles === 0);
  {
    // une partie enregistrée par l'ancienne version (sans objectif ni identifiants)
    const ob = { players: [{ name: 'A', board: bb._buildBoard(5).map(c => ({ t: c.t, s: 0 })), score: 100, moves: 10 }],
      phase: 'play', level: 'aventure', solo: true, soloLvl: 7, types: 5, cible: 2000, coups: 20, startTs: 1, finished: false };
    const r = bb.apply(ob, 0, { t: 'start', lvl: 7 });
    check('ancienne sauvegarde : le niveau repart proprement', r.ok && ob.phase === 'play' && !!ob.goal &&
      ob.players[0].board.every(c => !c || c.id));
  }

  // ---------------------------------------------------------------
  console.log('--- Bonbons : plus de coup possible → mélange animé qui garde les spéciaux (bug 2) ---');
  let okMel = 0, essaisMel = 0, detail = null;
  for (let k = 0; k < 400; k++) {
    const st = bb.create(['Solo']);
    bb.apply(st, 0, { t: 'start', lvl: [1, 2, 41, 11][k % 4] });
    const p = st.players[0];
    // grille morte : damier 2×2 de quatre couleurs (aucun échange ne forme d'alignement)
    const coul = [0, 1, 2, 3, 4].sort(() => rnd() - 0.5);
    for (let i = 0; i < 64; i++) {
      if (!p.board[i]) continue;
      p.board[i] = { t: coul[((i >> 3) % 2) * 2 + (i % 2)], s: 0, id: 1000 + i };
    }
    // 1 à 4 spéciaux non voisins (deux spéciaux voisins feraient un coup)
    const places = [];
    for (let q = 0; q < 40 && places.length < 1 + ri(4); q++) {
      const i = ri(64);
      if (!p.board[i] || places.some(j => Math.abs((j >> 3) - (i >> 3)) + Math.abs((j & 7) - (i & 7)) <= 1)) continue;
      p.board[i].s = 1 + ri(3);
      places.push(i);
    }
    const E0 = bb._ctxOf(st, p, null);
    if (bb._hasMoveE(E0)) continue;
    essaisMel++;
    const avant = p.board.filter(Boolean).map(x => x.id + ':' + x.t + ':' + x.s).sort().join(',');
    const spAvant = p.board.filter(x => x && x.s).map(x => x.t + ':' + x.s).sort().join(',');
    const rec = { steps: [], rows: [], cols: [], bombs: [], pops: [], arc: 0, gain: 0 };
    const E = bb._ctxOf(st, p, rec);
    const fait = bb._ensureMoves(E);
    const apres = p.board.filter(Boolean).map(x => x.id + ':' + x.t + ':' + x.s).sort().join(',');
    const spApres = p.board.filter(x => x && x.s).map(x => x.t + ':' + x.s).sort().join(',');
    const etape = rec.steps.find(s => s.k === 'shuffle');
    const ok = fait && spAvant === spApres && bb._hasMoveE(E) && bb._findRuns(p.board).length === 0 &&
      etape && etape.to.length === p.board.filter(Boolean).length && rec.shuffled === true &&
      (apres === avant || etape.recolor.length > 0); // mêmes bonbons, à d'autres places
    if (ok) okMel++; else if (!detail) detail = { spAvant, spApres, etape: !!etape };
  }
  check('bug 2 : ' + essaisMel + ' grilles mortes : mélange (jamais régénérée), spéciaux conservés, un coup garanti, aucune alignement',
    essaisMel >= 200 && okMel === essaisMel, { okMel, essaisMel, detail });
  check('bug 2 : le mélange est raconté au rendu (message et animation)', melanges > 0 && melangesSansPerte === melanges, { melanges });

  // ---------------------------------------------------------------
  console.log('--- Bonbons : niveaux, objectifs et courbe de difficulté mesurée (bug 3) ---');
  const L = bb._LEVELS_DATA;
  check('60 niveaux dessinés à la main', L.length === 60);
  const types = {};
  L.forEach(d => { types[d.g] = (types[d.g] || 0) + 1; });
  check('objectifs variés : points, gelée, meringues, récolte, noisettes (≥ 6 niveaux chacun)',
    ['score', 'jelly', 'blocks', 'collect', 'ingr'].every(t => types[t] >= 6), types);
  // le joueur « meilleur coup immédiat »
  function joue(n) {
    const st = bb.create(['Bot']);
    bb.apply(st, 0, { t: 'start', lvl: n });
    bb.apply(st, 0, { t: 'go' });
    const p = st.players[0];
    while (st.phase === 'play') {
      const mv = bb._meilleurCoup(st, p);
      if (!mv) break;
      bb.apply(st, 0, { t: 'swap', a: mv[0], b: mv[1], anim: false });
    }
    return { won: !!(st.res && st.res.won), score: p.score, gagnants: bb.gagnants(st) };
  }
  const SIMS = +(process.env.SIMS || 40);
  const taux = [], ecarts = [];
  let gOk = true, finale1 = [];
  const t1 = Date.now();
  // les couples boss / respiration se jouent trois fois plus (leur écart est l'objet du contrôle)
  const couples = [10, 11, 20, 21, 30, 31, 40, 41, 50, 51];
  for (let n = 1; n <= 60; n++) {
    let w = 0;
    const nb = couples.includes(n) ? SIMS * 3 : SIMS;
    for (let k = 0; k < nb; k++) {
      const r = joue(n);
      if (r.won) w++;
      if (JSON.stringify(r.gagnants) !== (r.won ? '[0]' : 'null')) gOk = false;
      if (n === 1) finale1.push(r.score);
    }
    taux.push(w / nb);
    ecarts.push(Math.abs(w / nb - bb._tauxVise(n)));
  }
  for (let m = 0; m < 6; m++) {
    const t = taux.slice(m * 10, m * 10 + 10);
    console.log('       monde ' + (m + 1) + ' : ' + t.map(x => String(Math.round(x * 100)).padStart(3)).join(' ') +
      '   moyenne ' + Math.round(100 * t.reduce((a, b) => a + b) / 10) + ' %');
  }
  console.log('       (' + SIMS + ' parties simulées par niveau, ' + ((Date.now() - t1) / 1000).toFixed(0) + ' s)');
  const moy = m => taux.slice(m * 10, m * 10 + 10).reduce((a, b) => a + b) / 10;
  check('niveau 1 : réussi ≥ 85 % du temps', taux[0] >= 0.85, taux[0]);
  check('la difficulté monte régulièrement : moyenne de chaque monde < celle du précédent',
    [1, 2, 3, 4, 5].every(m => moy(m) < moy(m - 1)), [0, 1, 2, 3, 4, 5].map(m => +moy(m).toFixed(2)));
  check('respiration après chaque boss : le 1er niveau d’un monde est plus facile que le boss',
    [1, 2, 3, 4, 5].every(m => taux[m * 10] > taux[m * 10 - 1]), [1, 2, 3, 4, 5].map(m => [taux[m * 10 - 1], taux[m * 10]]));
  const souffles = [5, 15, 25, 35, 45, 55].map(i => taux[i] - (taux[i - 1] + taux[i + 1]) / 2);
  check('respiration de mi-monde : plus facile que ses voisins (en moyenne)', souffles.reduce((a, b) => a + b) / 6 > 0.03,
    souffles.map(x => +x.toFixed(2)));
  check('mesuré ≈ visé : écart moyen ≤ 9 points, aucun niveau à plus de 30 points',
    ecarts.reduce((a, b) => a + b) / 60 <= 0.09 && Math.max(...ecarts) <= 0.3, { moyen: +(ecarts.reduce((a, b) => a + b) / 60).toFixed(3), max: +Math.max(...ecarts).toFixed(2) });
  check('aucun niveau impossible (tous réussis au moins 15 % du temps)', Math.min(...taux) >= 0.15, Math.min(...taux));
  finale1.sort((a, b) => a - b);
  const med1 = finale1[Math.floor(finale1.length / 2)], cible1 = L[0].n;
  check('niveau 1 : un objectif qui compte (score médian ' + med1 + ' pour ' + cible1 + ', ≤ 2,2 fois)', med1 / cible1 <= 2.2, med1 / cible1);
  check('gagnants() : [0] si le niveau est réussi, null sinon', gOk);

  // niveaux générés : jamais de boucle, difficulté tenue
  const vus = new Set();
  let doublons = 0, typesSuite = 0, prec = '';
  for (let n = 61; n <= 1060; n++) {
    const d = bb._levelDef(n), cle = JSON.stringify(d);
    if (vus.has(cle)) doublons++;
    vus.add(cle);
    if (d.g === prec) typesSuite++;
    prec = d.g;
  }
  check('1000 niveaux générés (61 à 1060) tous différents, sans boucle', doublons === 0, doublons);
  check('niveaux générés : l’objectif change d’un niveau à l’autre (rares répétitions)', typesSuite < 150, typesSuite);
  check('ancienne boucle tous les 105 niveaux disparue', JSON.stringify(bb._levelDef(54)) !== JSON.stringify(bb._levelDef(159)) &&
    JSON.stringify(bb._levelDef(70)) !== JSON.stringify(bb._levelDef(175)));
  // de 61 à 1060, chaque niveau généré a été calibré par simulation ; au-delà, le modèle prend le relais
  const mesureNiveaux = (liste, nb) => liste.map(n => {
    let w = 0;
    for (let k = 0; k < nb; k++) if (joue(n).won) w++;
    return w / nb;
  });
  const echantillon = [61, 66, 75, 90, 110, 141, 170, 205, 260, 333, 402, 480, 555, 600, 777, 888, 1001, 1060];
  const tg = mesureNiveaux(echantillon, 60);
  console.log('       niveaux générés calibrés ' + echantillon.map((n, k) => n + ':' + Math.round(tg[k] * 100) + '%').join(' '));
  const moyG = tg.reduce((a, b) => a + b) / tg.length;
  check('niveaux générés (61 à 1060) : réussis de 10 à 90 % du temps, moyenne entre 30 et 65 %',
    tg.every(x => x >= 0.1 && x <= 0.9) && moyG >= 0.3 && moyG <= 0.65, { moyG: +moyG.toFixed(2) });
  const auDela = [1100, 1234, 1500, 2026, 3333];
  const tm = mesureNiveaux(auDela, 30);
  console.log('       au-delà (modèle) ' + auDela.map((n, k) => n + ':' + Math.round(tm[k] * 100) + '%').join(' '));
  check('au-delà de 1060 (modèle ajusté) : aucun niveau impossible ni gratuit (8 à 97 %)', tm.every(x => x >= 0.08 && x <= 0.97), tm);
  bb._setRandom(null);
}

console.log(failures ? '\n' + failures + ' ÉCHEC(S)' : '\nTests V2 solo OK.');
process.exit(failures ? 1 : 0);
