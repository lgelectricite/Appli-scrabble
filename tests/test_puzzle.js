const ROOT = require('path').join(__dirname, '..');
require(ROOT + '/js/games/registry.js');
require(ROOT + '/js/games/motscourants.js');
const sudoku = require(ROOT + '/js/games/sudoku.js');
const meles = require(ROOT + '/js/games/meles.js');
const motus = require(ROOT + '/js/games/motus.js');
const fs = require('fs');
const AI = require(ROOT + '/js/ai.js');
const dict = AI.buildDict(fs.readFileSync(ROOT + '/data/mots.txt', 'utf8'));

let failures = 0;
function check(n, c, e) {
  if (c) console.log('  OK  ' + n);
  else { failures++; console.log('  FAIL ' + n + (e !== undefined ? ' -> ' + JSON.stringify(e) : '')); }
}

/* ================= SUDOKU ================= */
console.log('--- Sudoku ---');
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
for (const lvl of ['facile', 'moyen', 'difficile', 'expert']) {
  const t0 = Date.now();
  const made = sudoku._makePuzzle(lvl);
  const ms = Date.now() - t0;
  check(lvl + ' : solution valide (' + ms + ' ms)', validSolution(made.solution));
  check(lvl + ' : indices cohérents', made.puzzle.every((v, i) => v === 0 || v === made.solution[i]));
  check(lvl + ' : solution unique', sudoku._solveCount(made.puzzle.slice(), 2) === 1);
  console.log('    → ' + made.clues + ' cases données');
}
let g = sudoku.create(['A', 'B']);
check('niveau choisi par l’hôte seulement', !sudoku.apply(g, 1, { t: 'level', l: 'facile' }).ok);
sudoku.apply(g, 0, { t: 'level', l: 'facile' });
check('partie lancée', g.phase === 'play' && g.toFill > 0);
const empty = g.puzzle.findIndex(v => v === 0);
const good = g.solution[empty];
const bad = (good % 9) + 1;
// V2 : le mauvais chiffre n'est plus seulement refusé par un message fugace :
// il s'affiche EN ROUGE dans sa case (marqué « bad ») et compte une erreur
let r = sudoku.apply(g, 1, { t: 'set', i: empty, v: bad });
check('mauvais chiffre posé en rouge + erreur comptée',
  r.ok && g.players[1].errors === 1 && g.grids[1][empty] === bad && g.bad[1][empty] === 1 &&
  g.players[1].filled === 0);
r = sudoku.apply(g, 1, { t: 'set', i: empty, v: good });
check('bon chiffre accepté (remplace le faux)', r.ok && g.grids[1][empty] === good && g.players[1].filled === 1 &&
  g.bad[1][empty] === 0);
check('case imposée intouchable', !sudoku.apply(g, 1, { t: 'set', i: g.puzzle.findIndex(v => v !== 0), v: 5 }).ok);
// B remplit tout → victoire et fin
for (let i = 0; i < 81; i++) {
  if (g.puzzle[i] === 0 && g.grids[1][i] === 0) sudoku.apply(g, 1, { t: 'set', i, v: g.solution[i] });
}
check('premier à finir = vainqueur, partie close', g.finished && g.winner === 1 && g.players[1].done);
const redS = sudoku.redact(g, 0);
check('solution masquée (redact)', redS.solution === undefined);
check('grille adverse masquée (redact)', redS.grids[1] === undefined && redS.grids[0] !== undefined);

/* ================= MOTS MÊLÉS ================= */
console.log('--- Mots mêlés ---');
for (const lvl of ['facile', 'moyen', 'difficile']) {
  const built = meles._buildGrid(lvl, { dict });
  check(lvl + ' : grille générée', !!built);
  check(lvl + ' : lettres des mots en place', built.words.every(w =>
    w.cells.every((c, k) => built.grid[c] === w.w[k])));
  check(lvl + ' : toutes les cases remplies', built.grid.every(ch => /^[A-Z]$/.test(ch)));
}
// niveaux (V2 : grilles en hauteur pour le téléphone, cases ≥ 32 px) :
// 7×8, 8×9, 9×10, de plus en plus de mots, et un mot mystère
check('niveaux : 7×8, 8×9, 9×10, de plus en plus de mots, mot mystère', (() => {
  const a = meles._buildGrid('facile'), b = meles._buildGrid('moyen'), c = meles._buildGrid('difficile');
  return a.cols === 7 && a.rows === 8 && b.cols === 8 && b.rows === 9 && c.cols === 9 && c.rows === 10 &&
    a.words.length >= 6 && c.words.length >= 9 && !!a.mystere && !!c.mystere;
})());
check('facile : mélange garanti d’horizontaux ET de verticaux', (() => {
  for (let t = 0; t < 10; t++) {
    const b = meles._buildGrid('facile');
    const vert = b.words.filter(w => w.cells[1] - w.cells[0] === b.size).length;
    const horiz = b.words.filter(w => w.cells[1] - w.cells[0] === 1).length;
    if (vert < 2 || horiz < 2) return false;
  }
  return true;
})());
check('difficile : présence de mots à l’envers ou en diagonale', (() => {
  const b = meles._buildGrid('difficile');
  return b.words.some(w => {
    const d = w.cells[1] - w.cells[0];
    return d !== 1 && d !== b.size; // ni → ni ↓ classiques
  });
})());
check('les mots viennent de la liste des mots courants', (() => {
  const b = meles._buildGrid('moyen');
  return b.words.every(w => GG.MOTS_COURANTS.indexOf(w.w) !== -1);
})());
g = meles.create(['A', 'B']);
meles.apply(g, 0, { t: 'level', l: 'facile' }, { dict });
check('partie lancée', g.phase === 'play' && g.words.length >= 6);
const w0 = g.words[0];
r = meles.apply(g, 1, { t: 'claim', a: w0.cells[0], b: w0.cells[w0.cells.length - 1] });
check('mot revendiqué', r.ok && w0.foundBy === 1 && g.players[1].found === 1);
check('mot déjà trouvé refusé', !meles.apply(g, 0, { t: 'claim', a: w0.cells[0], b: w0.cells[w0.cells.length - 1] }).ok);
const w1 = g.words[1];
r = meles.apply(g, 0, { t: 'claim', a: w1.cells[w1.cells.length - 1], b: w1.cells[0] });
check('mot à l’envers accepté', r.ok && w1.foundBy === 0);
// trouve tout → fin
g.words.forEach(w => {
  if (w.foundBy === -1) meles.apply(g, 0, { t: 'claim', a: w.cells[0], b: w.cells[w.cells.length - 1] });
});
check('tous trouvés → révélation du mot mystère, puis fin', g.phase === 'mystere' &&
  meles.apply(g, -1, { t: 'fin' }).ok && g.finished === true);
check('lignes brisées refusées', (() => {
  const t = meles.create(['A']);
  meles.apply(t, 0, { t: 'level', l: 'facile' }, { dict });
  return !meles.apply(t, 0, { t: 'claim', a: 0, b: t.size + 2 }).ok; // ni ligne ni diagonale
})());

/* ================= MOT MYSTÈRE ================= */
console.log('--- Mot Mystère ---');
const mk = motus._marks;
check('toutes bien placées', JSON.stringify(mk('CHIEN', 'CHIEN')) === '[2,2,2,2,2]');
check('présentes ailleurs', JSON.stringify(mk('CHIEN', 'NICHE')) === '[1,1,1,1,1]');
check('doublons gérés', JSON.stringify(mk('POMME', 'MEMES')) === JSON.stringify([1, 1, 2, 0, 0]));
check('absentes', JSON.stringify(mk('CHIEN', 'ROBOT')) === '[0,0,0,0,0]');
g = motus.create(['A', 'B']);
motus.apply(g, 0, { t: 'level', l: 'facile' }, { dict });
check('mot de 5 lettres choisi', g.secret.length === 5 && dict.set.has(g.secret));
check('secret pris dans les mots courants', GG.MOTS_COURANTS.indexOf(g.secret) !== -1, g.secret);
check('V2 : la première lettre est offerte (publique)', g.first === g.secret[0] &&
  motus.redact(g, 1).first === g.secret[0]);
// pour la suite, un secret connu (les essais doivent commencer par sa 1re lettre)
g.secret = 'CHIEN'; g.first = 'C';
// tableau COMMUN, chacun son tour : A commence
check('A commence (tour par tour)', motus.turnOf(g) === 0);
check('hors tour refusé', !motus.apply(g, 1, { t: 'guess', w: 'CHIEN' }, { dict }).ok);
r = motus.apply(g, 0, { t: 'guess', w: 'CZZZZ' }, { dict });
check('mot hors dictionnaire refusé', !r.ok && /dictionnaire/.test(r.error), r.error);
r = motus.apply(g, 0, { t: 'guess', w: 'PLAGE' }, { dict });
check('V2 : un essai qui ne commence pas par la lettre offerte est refusé', !r.ok && /commence par/.test(r.error), r.error);
const g1 = 'CHAUD';
r = motus.apply(g, 0, { t: 'guess', w: g1.toLowerCase() }, { dict });
check('essai valide accepté (minuscules OK), essai PARTAGÉ avec auteur',
  r.ok && g.tries.length === 1 && g.tries[0].by === 0 && g.tries[0].word === g1);
check('le tour passe à B', motus.turnOf(g) === 1);
check('mot déjà proposé refusé', !motus.apply(g, 1, { t: 'guess', w: g1 }, { dict }).ok);
// essais ILLIMITÉS : bien plus de 6 propositions possibles
const pool5 = GG.MOTS_COURANTS.filter(w => w.length === 5 && w[0] === 'C' && w !== g.secret && w !== g1);
for (let k = 0; k < 9; k++) {
  const rr = motus.apply(g, g.turn, { t: 'guess', w: pool5[k] }, { dict });
  if (!rr.ok) { failures++; console.log('  FAIL essai illimité n°' + (k + 2) + ' refusé : ' + rr.error); break; }
}
check('essais illimités : 10 essais joués, la manche continue',
  g.phase === 'play' && g.tries.length === 10, g.tries.length);
// B trouve le secret à son tour
if (g.turn !== 1) motus.apply(g, g.turn, { t: 'guess', w: pool5[10] }, { dict });
r = motus.apply(g, 1, { t: 'guess', w: g.secret }, { dict });
check('secret trouvé par B → révélation, point pour B, PAS de fin',
  r.ok && g.phase === 'reveal' && g.foundBy === 1 && g.players[1].wins === 1 &&
  motus.over(g) === false);
check('secret visible à la révélation', motus.redact(g, 0).secret === g.secret);
const sum = motus.summary(g);
check('classement : B gagne', /🏆 B/.test(sum));
check('mot suivant réservé à l’hôte', motus.apply(g, 1, { t: 'next' }, { dict }).ok === false);
r = motus.apply(g, 0, { t: 'next' }, { dict });
check('mot suivant : tableau vierge, le tour de départ TOURNE (B commence)',
  r.ok && g.round === 2 && g.phase === 'play' && g.tries.length === 0 &&
  motus.turnOf(g) === 1 && g.players[1].wins === 1);
// redact : seul le secret est caché (le tableau est public)
const redM = motus.redact(g, 0);
check('secret masqué (redact), tableau public', redM.secret === undefined &&
  Array.isArray(redM.tries));

/* ================= MOTS CROISÉS (V2) ================= */
console.log('--- Mots croisés ---');
require(ROOT + '/js/games/fleches-data.js');
const croises = require(ROOT + '/js/games/croises.js');
const GR = GG.grilles;
const LEXC = GR.lexique();
// le lexique commun : les définitions fautives de l’audit ont disparu
const defsDe = w => LEXC.defs[LEXC.index[w]] || [];
check('FONDUE ne se définit plus par « fondu »', defsDe('FONDUE').length > 0 &&
  defsDe('FONDUE').every(d => !/fondu/i.test(d)), defsDe('FONDUE'));
check('FORTERESSE ne se définit plus par « forte »', defsDe('FORTERESSE').every(d => !/fort/i.test(d)), defsDe('FORTERESSE'));
check('TEMOIGNAGE sans « témoin »', defsDe('TEMOIGNAGE').every(d => !/t[ée]moin/i.test(d)), defsDe('TEMOIGNAGE'));
check('OCTAVE : intervalle de huit degrés (plus « huit notes d’écart »)',
  defsDe('OCTAVE').some(d => /huit degrés/.test(d)) && defsDe('OCTAVE').every(d => !/notes d.écart/.test(d)), defsDe('OCTAVE'));
// générateur : 60 grilles par niveau, VRAIES grilles denses, cohérentes
for (const lvl of ['facile', 'moyen', 'difficile']) {
  let bad = 0, minCroise = 1, noirs = 0, cases = 0;
  for (let t = 0; t < 60; t++) {
    const g = croises._grille(lvl, t);
    if (!g) { bad++; continue; }
    const N = g.w, sol = g.sol;
    // chaque suite de 2+ lettres est un mot déclaré, et réciproquement
    const runs = new Set();
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const i = r * N + c;
      if (sol[i] === '#') continue;
      if ((c === 0 || sol[i - 1] === '#') && c + 1 < N && sol[i + 1] !== '#') {
        let k = c; let w = ''; while (k < N && sol[r * N + k] !== '#') { w += sol[r * N + k]; k++; }
        runs.add('h' + i + w);
      }
      if ((r === 0 || sol[i - N] === '#') && r + 1 < N && sol[i + N] !== '#') {
        let k = r; let w = ''; while (k < N && sol[k * N + c] !== '#') { w += sol[k * N + c]; k++; }
        runs.add('v' + i + w);
      }
    }
    const decl = new Set(g.mots.map(m => m.dir + m.cells[0] + m.w));
    if (runs.size !== decl.size || [...runs].some(x => !decl.has(x))) bad++;
    g.mots.forEach(m => {
      if (LEXC.index[m.w] === undefined || !m.def) bad++;
      m.cells.forEach((c, k) => { if (sol[c] !== m.w[k]) bad++; });
    });
    // densité : cases croisées
    let blanc = 0, croise = 0;
    for (let i = 0; i < N * N; i++) {
      cases++;
      if (sol[i] === '#') { noirs++; continue; }
      blanc++;
      const r = Math.floor(i / N), c = i % N;
      const h = (c > 0 && sol[i - 1] !== '#') || (c < N - 1 && sol[i + 1] !== '#');
      const v = (r > 0 && sol[i - N] !== '#') || (r < N - 1 && sol[i + N] !== '#');
      if (h && v) croise++;
    }
    minCroise = Math.min(minCroise, croise / blanc);
    // numérotation classique : horizontaux par ligne puis verticaux par colonne
    for (let k = 1; k < g.mots.length; k++) {
      const a = g.mots[k - 1], b = g.mots[k];
      if (a.dir === 'v' && b.dir === 'h') bad++;
      if (a.dir === b.dir && a.ligne > b.ligne) bad++;
    }
    // pas deux fois la même définition dans une grille
    const dd = new Set(g.mots.map(m => GR.norm(m.def)));
    if (dd.size !== g.mots.length) bad++;
  }
  check('générateur ' + lvl + ' : 60 grilles cohérentes, ≥ 70 % de cases croisées (min ' +
    Math.round(minCroise * 100) + ' %, ' + Math.round(100 * noirs / cases) + ' % de noires)', bad === 0 && minCroise >= 0.7, bad);
}
check('les niveaux grandissent (8, 9, 10)', croises._grille('facile', 3).w === 8 &&
  croises._grille('moyen', 3).w === 9 && croises._grille('difficile', 3).w === 10);
check('grille déterministe (même numéro, même grille)',
  croises._grille('moyen', 42).sol === croises._grille('moyen', 42).sol &&
  croises._grille('moyen', 42).sol !== croises._grille('moyen', 43).sol);
// partie complète à 2 joueurs (l’interface ne propose que le solo, les règles restent générales)
g = croises.create(['A', 'B']);
check('niveau réservé à l’hôte', !croises.apply(g, 1, { t: 'level', l: 'facile' }).ok);
croises.apply(g, 0, { t: 'level', l: 'facile', g: 0 });
check('grille prête', g.phase === 'play' && g.words.length >= 15 && g.saisie.length === 64);
const cw = g.words[0];
check('mauvaise longueur refusée sans pénalité',
  !croises.apply(g, 0, { t: 'claim', i: 0, text: 'X' }).ok && g.players[0].errors === 0);
const faux = (cw.w[0] === 'A' ? 'B' : 'A') + cw.w.slice(1);
croises.apply(g, 1, { t: 'claim', i: 0, text: faux });
check('mauvaise réponse comptée comme erreur', g.players[1].errors === 1 && !cw.ok);
croises.apply(g, 0, { t: 'claim', i: 0, text: cw.w.toLowerCase() });
check('bonne réponse acceptée (insensible à la casse)', cw.ok && cw.by === 0);
check('points = longueur du mot', g.players[0].points === cw.w.length);
check('lettres écrites dans la grille', cw.cells.every((c, k) => g.saisie[c] === cw.w[k]));
check('re-proposer un mot trouvé refusé', !croises.apply(g, 1, { t: 'claim', i: 0, text: cw.w }).ok);
check('normalisation accents', croises._norm('éLéPHANT') === 'ELEPHANT');
const redC = croises.redact(g, 1);
check('mots non trouvés masqués', redC.words.every((w, i) => i === 0 ? w.w === cw.w : w.w === undefined));
check('définitions et cases visibles', redC.words.every(w => w.def && w.cells.length > 0));
let resFin = null;
for (let i = 1; i < g.words.length; i++) {
  if (g.words[i].ok) continue;
  const rr = croises.apply(g, 1, { t: 'claim', i, text: g.words[i].w });
  if (rr.timer) resFin = rr;
}
check('tous trouvés → grille complète, fête puis fin', g.complete === true && !!resFin &&
  resFin.timer.action.t === 'fin' && !croises.over(g));
croises.apply(g, -1, resFin.timer.action);
check('fin de partie après la célébration', g.finished === true && croises.over(g) && g.durationSec >= 1);
check('gagnants : grille finie = victoire', JSON.stringify(croises.gagnants(g)) === '[0]');
const sumC = croises.summary(g);
check('résumé : temps, points, étoiles', /Temps/.test(sumC) && /Points/.test(sumC) && /⭐/.test(sumC));

console.log(failures ? failures + ' ÉCHEC(S)' : '\nTests jeux de réflexion OK.');
process.exit(failures ? 1 : 0);
