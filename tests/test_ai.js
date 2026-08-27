const ROOT = require('path').join(__dirname, '..');
const fs = require('fs');
const S = require(ROOT + '/js/scrabble.js');
const AI = require(ROOT + '/js/ai.js');

let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log('  OK  ' + name);
  else { failures++; console.log('  FAIL ' + name + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); }
}
const idx = (r, c) => r * 15 + c;

const text = fs.readFileSync(ROOT + '/data/mots.txt', 'utf8');
const t0 = Date.now();
const dict = AI.buildDict(text);
console.log('dictionnaire construit en', Date.now() - t0, 'ms —', dict.set.size, 'mots');
check('dictionnaire non vide', dict.set.size > 80000, dict.set.size);
check('MAISON présent', dict.set.has('MAISON'));
check('pas d’accents ni tirets', !dict.set.has('ÉTÉ') && dict.set.has('ETE'));

// ---- 1. Premier coup sur plateau vide ----
let g = S.newGame(['Moi', 'IA']);
g.players[1].rack = ['M', 'A', 'I', 'S', 'O', 'N', 'X'];
g.current = 1;
let t1 = Date.now();
const action = AI.chooseAction(S, g, 1, dict, 'difficile');
const dt1 = Date.now() - t1;
check('l’IA trouve un coup (plateau vide)', action.kind === 'move', action.kind);
check('temps raisonnable (' + dt1 + ' ms)', dt1 < 6000, dt1);
if (action.kind === 'move') {
  const res = S.checkMove(g, action.placements);
  check('coup valide selon le moteur', res.ok, res);
  check('passe par le centre', action.placements.some(p => p.index === S.CENTER));
  check('tous les mots formés sont au dictionnaire',
    res.ok && res.words.every(w => dict.set.has(w.word)), res.words);
  const applied = S.playMove(g, 1, action.placements);
  check('coup applicable', applied.ok, applied);
  console.log('  → IA (difficile) joue :', applied.words.map(w => w.word + ' (' + w.score + ')').join(' + '), '=', applied.total, 'pts');
}

// ---- 2. Coup croisé sur un plateau occupé ----
g = S.newGame(['Moi', 'IA']);
g.players[0].rack = ['C', 'H', 'A', 'T', 'E', 'E', 'E'];
S.playMove(g, 0, [
  { index: idx(7, 6), letter: 'C' }, { index: idx(7, 7), letter: 'H' },
  { index: idx(7, 8), letter: 'A' }, { index: idx(7, 9), letter: 'T' }
]);
g.players[1].rack = ['R', 'E', 'S', 'T', 'A', 'U', 'L'];
const t2 = Date.now();
const moves = AI.findAllMoves(S, g, 1, dict, 6000);
const dt2 = Date.now() - t2;
check('des coups trouvés après CHAT (' + moves.length + ' coups, ' + dt2 + ' ms)', moves.length > 50, moves.length);
check('temps raisonnable en cours de partie', dt2 < 6000, dt2);
let allValid = true;
let allInDict = true;
for (const m of moves) {
  const res = S.checkMove(g, m.placements);
  if (!res.ok) { allValid = false; break; }
  for (const w of res.words) {
    if (!dict.set.has(w.word)) { allInDict = false; console.log('   mot hors dico:', w.word); break; }
  }
  if (!allInDict) break;
}
check('tous les coups trouvés sont légaux', allValid);
check('tous les mots formés (y compris croisés) sont au dictionnaire', allInDict);

// ---- 3. Niveaux : difficile ≥ moyen ≥ facile (en moyenne) ----
function scoreOf(level) {
  const a = AI.chooseAction(S, g, 1, dict, level);
  return a.kind === 'move' ? a.total : 0;
}
const best = scoreOf('difficile');
let sumEasy = 0, sumMed = 0;
for (let i = 0; i < 5; i++) { sumEasy += scoreOf('facile'); sumMed += scoreOf('moyen'); }
check('difficile = meilleur coup (' + best + ' pts)', best >= sumMed / 5 && best >= sumEasy / 5,
  { best, moyen: sumMed / 5, facile: sumEasy / 5 });
check('facile ≤ moyen en moyenne (facile ' + (sumEasy / 5).toFixed(1) + ' / moyen ' + (sumMed / 5).toFixed(1) + ')',
  sumEasy <= sumMed + 10, { facile: sumEasy / 5, moyen: sumMed / 5 });

// ---- 4. Joker utilisé correctement ----
g = S.newGame(['Moi', 'IA']);
g.players[1].rack = ['?', '?', 'A', 'E', 'R', 'S', 'T'];
g.current = 1;
const aj = AI.chooseAction(S, g, 1, dict, 'difficile');
check('l’IA joue avec des jokers', aj.kind === 'move', aj.kind);
if (aj.kind === 'move') {
  const res = S.playMove(g, 1, aj.placements);
  check('coup avec joker applicable', res.ok, res);
}

// ---- 5. Aucun coup possible → échange ou passe ----
const emptyDict = AI.buildDict('');
g = S.newGame(['Moi', 'IA']);
g.current = 1;
const fallback = AI.chooseAction(S, g, 1, emptyDict, 'difficile');
check('sans dictionnaire : échange (sac plein)', fallback.kind === 'exchange', fallback.kind);
g.bag = g.bag.slice(0, 5);
const fallback2 = AI.chooseAction(S, g, 1, emptyDict, 'difficile');
check('sac presque vide : passe', fallback2.kind === 'pass', fallback2.kind);

// ---- 6. L'IA ne prolonge pas un mot inventé en mot invalide ----
g = S.newGame(['Moi', 'IA']);
g.players[0].rack = ['X', 'Q', 'K', 'W', 'E', 'E', 'E'];
S.playMove(g, 0, [
  { index: idx(7, 7), letter: 'X' }, { index: idx(7, 8), letter: 'Q' }
]); // "XQ" : mot inventé par l'humain (autorisé en partie libre)
g.players[1].rack = ['R', 'E', 'S', 'T', 'A', 'U', 'L'];
const moves2 = AI.findAllMoves(S, g, 1, dict, 6000);
let cleanCross = true;
for (const m of moves2) {
  const res = S.checkMove(g, m.placements);
  for (const w of res.words) {
    if (!dict.set.has(w.word)) { cleanCross = false; console.log('   mot créé hors dico:', w.word); }
  }
}
check('face à un mot inventé, l’IA ne forme que des mots valides (' + moves2.length + ' coups)', cleanCross);

console.log(failures ? `\n${failures} ÉCHEC(S)` : '\nTous les tests IA passent.');
process.exit(failures ? 1 : 0);
