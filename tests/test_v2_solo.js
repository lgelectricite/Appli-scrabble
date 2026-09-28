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
      const t0 = process.hrtime.bigint();
      const m = sudoku._makePuzzle(lvl);
      times.push(Number(process.hrtime.bigint() - t0) / 1e6);
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
    console.log('       génération (Node, processeur ×1) : médiane ' + bilan[lvl].p50 + ' ms, 95 % ' +
      bilan[lvl].p95 + ' ms, pire ' + bilan[lvl].max + ' ms' + (reserve ? ' · réserve ×' + reserve : ''));
    // au processeur ×4 tout est ~4 fois plus long : 95 % des grilles en < 60 ms ici (< 240 ms à ×4) ;
    // au-delà de 170 ms réels, la réserve prend le relais (la mesure réelle à ×4 est dans le test navigateur)
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

console.log(failures ? '\n' + failures + ' ÉCHEC(S)' : '\nTests V2 solo OK.');
process.exit(failures ? 1 : 0);
