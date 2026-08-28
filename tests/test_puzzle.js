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
for (const lvl of ['facile', 'moyen', 'difficile']) {
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
let r = sudoku.apply(g, 1, { t: 'set', i: empty, v: bad });
check('mauvais chiffre refusé + erreur comptée', !r.ok && g.players[1].errors === 1);
r = sudoku.apply(g, 1, { t: 'set', i: empty, v: good });
check('bon chiffre accepté', r.ok && g.grids[1][empty] === good && g.players[1].filled === 1);
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
// niveaux : tailles, nombres de mots, répartition des directions
check('niveaux : 9×9/7, 11×11/10, 13×13/13', (() => {
  const a = meles._buildGrid('facile'), b = meles._buildGrid('moyen'), c = meles._buildGrid('difficile');
  return a.size === 9 && a.words.length === 7 && b.size === 11 && b.words.length === 10 &&
    c.size === 13 && c.words.length === 13;
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
check('partie lancée', g.phase === 'play' && g.words.length === 7);
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
check('tous trouvés → fin', g.finished === true);
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
// tableau COMMUN, chacun son tour : A commence
check('A commence (tour par tour)', motus.turnOf(g) === 0);
check('hors tour refusé', !motus.apply(g, 1, { t: 'guess', w: 'CHIEN' }, { dict }).ok);
r = motus.apply(g, 0, { t: 'guess', w: 'ZZZZZ' }, { dict });
check('mot hors dictionnaire refusé', !r.ok);
const g1 = g.secret === 'CHIEN' ? 'PLAGE' : 'CHIEN';
r = motus.apply(g, 0, { t: 'guess', w: g1.toLowerCase() }, { dict });
check('essai valide accepté (minuscules OK), essai PARTAGÉ avec auteur',
  r.ok && g.tries.length === 1 && g.tries[0].by === 0 && g.tries[0].word === g1);
check('le tour passe à B', motus.turnOf(g) === 1);
check('mot déjà proposé refusé', !motus.apply(g, 1, { t: 'guess', w: g1 }, { dict }).ok);
// essais ILLIMITÉS : bien plus de 6 propositions possibles
const pool5 = GG.MOTS_COURANTS.filter(w => w.length === 5 && w !== g.secret && w !== g1);
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

/* ================= MOTS CROISÉS ================= */
console.log('--- Mots croisés ---');
const croises = require(ROOT + '/js/games/croises.js');
// base de définitions
let dbTotal = 0;
for (const lvl of ['facile', 'moyen', 'difficile']) {
  const seen = {};
  let sain = true;
  const max = lvl === 'facile' ? 7 : lvl === 'moyen' ? 9 : 11;
  for (const e of croises._DB[lvl]) {
    const p2 = e.indexOf('|');
    const w = e.slice(0, p2), d = e.slice(p2 + 1);
    if (!/^[A-Z]{3,}$/.test(w) || w.length > max || seen[w] || !d || d.length < 4) sain = false;
    if (w.length > 3 && croises._norm(d).includes(w)) sain = false; // la déf. révèle le mot
    seen[w] = true;
    dbTotal++;
  }
  check('base ' + lvl + ' saine (' + croises._DB[lvl].length + ' défs)', sain);
}
check('plus de 700 définitions au total', dbTotal >= 700, dbTotal);
// générateur : 60 grilles par niveau, toutes valides
for (const lvl of ['facile', 'moyen', 'difficile']) {
  const want = croises._LEVELS[lvl].n;
  let allOk = true, minPlaced = 99;
  for (let t = 0; t < 60; t++) {
    const b = croises._buildGrid(lvl);
    minPlaced = Math.min(minPlaced, b.words.length);
    const cellMap = {};
    for (const w of b.words) {
      if (w.cells.length !== w.w.length || !w.num) allOk = false;
      w.cells.forEach((c, k) => {
        if (c < 0 || c >= b.size * b.size) allOk = false;
        if (cellMap[c] && cellMap[c] !== w.w[k]) allOk = false; // conflit de croisement
        cellMap[c] = w.w[k];
      });
      const others = b.words.filter(x => x !== w).flatMap(x => x.cells);
      if (b.words.length > 1 && !w.cells.some(c => others.includes(c))) allOk = false; // mot isolé
    }
  }
  check('générateur ' + lvl + ' : ' + minPlaced + '/' + want + ' mots, croisements cohérents', allOk && minPlaced >= want);
}
// partie complète à 2 joueurs
g = croises.create(['A', 'B']);
check('niveau réservé à l’hôte', !croises.apply(g, 1, { t: 'level', l: 'facile' }).ok);
croises.apply(g, 0, { t: 'level', l: 'facile' });
check('grille prête', g.phase === 'play' && g.words.length >= 6);
const cw = g.words[0];
check('mauvaise longueur refusée sans pénalité',
  !croises.apply(g, 0, { t: 'claim', i: 0, text: 'X' }).ok && g.players[0].errors === 0);
const faux = cw.w[0] === 'A' ? 'B' + cw.w.slice(1) : 'A' + cw.w.slice(1);
croises.apply(g, 1, { t: 'claim', i: 0, text: faux });
check('mauvaise réponse comptée comme erreur', g.players[1].errors === 1 && cw.foundBy === -1);
croises.apply(g, 0, { t: 'claim', i: 0, text: cw.w.toLowerCase() });
check('bonne réponse acceptée (insensible à la casse)', cw.foundBy === 0);
check('points = longueur du mot', g.players[0].points === cw.w.length);
check('re-proposer un mot trouvé refusé', !croises.apply(g, 1, { t: 'claim', i: 0, text: cw.w }).ok);
// accents normalisés
check('normalisation accents', croises._norm('éLéPHANT') === 'ELEPHANT');
// redact : les solutions ne circulent pas
const redC = croises.redact(g, 1);
check('mots non trouvés masqués', redC.words.every((w, i) => i === 0 ? w.w === cw.w : w.w === undefined));
check('définitions et cases visibles', redC.words.every(w => w.def && w.cells.length > 0));
// fin de partie
for (let i = 1; i < g.words.length; i++) croises.apply(g, 1, { t: 'claim', i, text: g.words[i].w });
check('tous trouvés → partie finie', g.finished === true && g.durationSec >= 1);
const sumC = croises.summary(g);
check('classement au score', /🏆/.test(sumC));

console.log(failures ? failures + ' ÉCHEC(S)' : '\nTests jeux de réflexion OK.');
process.exit(failures ? 1 : 0);
