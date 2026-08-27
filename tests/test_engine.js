const ROOT = require('path').join(__dirname, '..');
const S = require(ROOT + '/js/scrabble.js');

let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log('  OK  ' + name);
  else { failures++; console.log('  FAIL ' + name + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); }
}
const idx = (r, c) => r * 15 + c;

// ---- 1. Nouvelle partie ----
let g = S.newGame(['Alice', 'Bob']);
check('102 tuiles au total', g.bag.length + 14 === 102, g.bag.length);
check('chevalets de 7', g.players.every(p => p.rack.length === 7));
check('scores à 0', g.players.every(p => p.score === 0));

// ---- 2. Premier coup : doit passer par le centre ----
g = S.newGame(['A', 'B']);
g.players[0].rack = ['C', 'H', 'A', 'T', 'E', 'E', 'E'];
let bad = S.playMove(g, 0, [
  { index: idx(0, 0), letter: 'C' }, { index: idx(0, 1), letter: 'H' },
  { index: idx(0, 2), letter: 'A' }, { index: idx(0, 3), letter: 'T' }
]);
check('premier coup hors centre refusé', !bad.ok);

// CHAT horizontal, H sur l'étoile (7,7) => mot double : (3+4+1+1)*2 = 18
let res = S.playMove(g, 0, [
  { index: idx(7, 6), letter: 'C' }, { index: idx(7, 7), letter: 'H' },
  { index: idx(7, 8), letter: 'A' }, { index: idx(7, 9), letter: 'T' }
]);
check('CHAT accepté', res.ok, res);
check('score CHAT = 18', res.ok && res.total === 18, res.total);
check('score joueur = 18', g.players[0].score === 18);
check('tour passé à B', g.current === 1);
check('chevalet recomplété', g.players[0].rack.length === 7);
check('dernier coup mémorisé (surbrillance)', g.lastMove &&
  g.lastMove.player === 0 && g.lastMove.cells.length === 4 &&
  g.lastMove.words.join() === 'CHAT' && g.lastMove.points === 18,
  g.lastMove);

// ---- 3. Coup non aligné / avec trou / détaché ----
g.players[1].rack = ['T', 'A', 'S', 'M', 'O', 'U', 'R'];
bad = S.playMove(g, 1, [
  { index: idx(8, 9), letter: 'A' }, { index: idx(9, 10), letter: 'S' }
]);
check('coup non aligné refusé', !bad.ok);
bad = S.playMove(g, 1, [
  { index: idx(8, 9), letter: 'A' }, { index: idx(10, 9), letter: 'S' }
]);
check('coup avec trou refusé', !bad.ok);
bad = S.playMove(g, 1, [
  { index: idx(0, 0), letter: 'M' }, { index: idx(0, 1), letter: 'O' },
  { index: idx(0, 2), letter: 'U' }
]);
check('coup détaché refusé', !bad.ok);

// ---- 4. Mot croisé : TAS vertical sur le T de CHAT ----
// T(7,9) existant=1 ; A(8,9)=1 ; S(9,9) sur LT => 3 ; total 5
res = S.playMove(g, 1, [
  { index: idx(8, 9), letter: 'A' }, { index: idx(9, 9), letter: 'S' }
]);
check('TAS accepté', res.ok, res);
check('score TAS = 5 (LT sur S, centre non recompté)', res.ok && res.total === 5, res.total);

// ---- 5. Lettre unique formant deux mots ----
// Plateau : CHAT en (7,6..9), TAS en (7..9, 9).
// Pose de S en (7,10) : CHATS (10) + rien de vertical => 10
g.players[0].rack = ['S', 'E', 'E', 'E', 'E', 'E', 'E'];
res = S.playMove(g, 0, [{ index: idx(7, 10), letter: 'S' }]);
check('CHATS accepté (1 lettre)', res.ok, res);
check('score CHATS = 10', res.ok && res.total === 10, res.total);

// ---- 6. Joker vaut 0 ----
g = S.newGame(['A', 'B']);
g.players[0].rack = ['?', 'H', 'A', 'T', 'E', 'E', 'E'];
res = S.playMove(g, 0, [
  { index: idx(7, 6), letter: 'C', blank: true }, { index: idx(7, 7), letter: 'H' },
  { index: idx(7, 8), letter: 'A' }, { index: idx(7, 9), letter: 'T' }
]);
check('joker accepté', res.ok, res);
check('score CHAT avec joker C = (0+4+1+1)*2 = 12', res.ok && res.total === 12, res.total);

// ---- 7. Lettre absente du chevalet refusée ----
g = S.newGame(['A', 'B']);
g.players[0].rack = ['A', 'A', 'A', 'A', 'A', 'A', 'A'];
bad = S.playMove(g, 0, [
  { index: idx(7, 7), letter: 'Z' }, { index: idx(7, 8), letter: 'A' }
]);
check('lettre absente refusée', !bad.ok);

// ---- 8. Scrabble (bingo) : 7 lettres => +50 ----
g = S.newGame(['A', 'B']);
g.players[0].rack = ['M', 'A', 'I', 'S', 'O', 'N', 'S'];
res = S.playMove(g, 0, [
  { index: idx(7, 4), letter: 'M' }, { index: idx(7, 5), letter: 'A' },
  { index: idx(7, 6), letter: 'I' }, { index: idx(7, 7), letter: 'S' },
  { index: idx(7, 8), letter: 'O' }, { index: idx(7, 9), letter: 'N' },
  { index: idx(7, 10), letter: 'S' }
]);
// M(7,4)=2, A=1, I=1, S(centre MD)=1, O=1, N=1, S=1 => 8*2=16 + 50 = 66
check('bingo accepté', res.ok, res);
check('bingo = 66 pts', res.ok && res.total === 66, res.total);

// ---- 9. Échange ----
g = S.newGame(['A', 'B']);
const before = g.players[0].rack.slice();
res = S.exchange(g, 0, [before[0], before[1]]);
check('échange accepté', res.ok, res);
check('chevalet toujours 7 après échange', g.players[0].rack.length === 7);
check('102 tuiles conservées', g.bag.length + g.players[0].rack.length + g.players[1].rack.length === 102);
check('tour passé après échange', g.current === 1);

// échange interdit si sac < 7
g.bag = g.bag.slice(0, 6);
res = S.exchange(g, 1, [g.players[1].rack[0]]);
check('échange refusé si sac < 7', !res.ok);

// ---- 10. Fin par 6 tours sans point ----
g = S.newGame(['A', 'B']);
for (let i = 0; i < 6; i++) {
  const r = S.passTurn(g, g.current);
  if (!r.ok) { check('passe acceptée', false, r); break; }
}
check('partie finie après 6 passes', g.over === true);
check('déduction des chevalets appliquée', g.players[0].score < 0 || g.players[1].score < 0 ||
  (g.players[0].score === 0 && g.players[0].rack.every(l => S.letterValue(l) === 0)));

// ---- 11. Fin par pose de toutes les lettres, sac vide ----
g = S.newGame(['A', 'B']);
g.bag = [];
g.players[0].rack = ['C', 'H', 'A', 'T'];
g.players[1].rack = ['K', 'W']; // 10 + 10 = 20
res = S.playMove(g, 0, [
  { index: idx(7, 6), letter: 'C' }, { index: idx(7, 7), letter: 'H' },
  { index: idx(7, 8), letter: 'A' }, { index: idx(7, 9), letter: 'T' }
]);
check('coup final accepté', res.ok, res);
check('partie terminée', g.over === true);
// 18 (CHAT) + 20 (lettres de B) = 38 ; B = -20
check('bonus de fin pour A', g.players[0].score === 38, g.players[0].score);
check('déduction pour B', g.players[1].score === -20, g.players[1].score);

// ---- 12. Jouer hors tour refusé ----
g = S.newGame(['A', 'B']);
bad = S.playMove(g, 1, [{ index: idx(7, 7), letter: g.players[1].rack[0] }, { index: idx(7, 8), letter: g.players[1].rack[1] }]);
check('jouer hors tour refusé', !bad.ok);

// ---- 13. Cases bonus : disposition symétrique ----
let counts = { MT: 0, MD: 0, LT: 0, LD: 0 };
Object.values(S.PREMIUM).forEach(v => counts[v]++);
check('8 cases MT', counts.MT === 8, counts);
check('17 cases MD (dont centre)', counts.MD === 17, counts);
check('12 cases LT', counts.LT === 12, counts);
check('24 cases LD', counts.LD === 24, counts);


// ---- 14. Partie à 4 joueurs ----
g = S.newGame(['A', 'B', 'C', 'D']);
check('4 joueurs : sac à 74', g.bag.length === 74, g.bag.length);
check('4 chevalets de 7', g.players.every(p => p.rack.length === 7));
g.players[0].rack = ['C', 'H', 'A', 'T', 'E', 'E', 'E'];
res = S.playMove(g, 0, [
  { index: idx(7, 6), letter: 'C' }, { index: idx(7, 7), letter: 'H' },
  { index: idx(7, 8), letter: 'A' }, { index: idx(7, 9), letter: 'T' }
]);
check('coup accepté à 4', res.ok, res);
check('rotation vers joueur 2', g.current === 1);
S.passTurn(g, 1); S.passTurn(g, 2); S.passTurn(g, 3);
check('rotation complète revient au joueur 1', g.current === 0);

// fin par pose, sac vide, à 4 : transfert de la somme des 3 autres chevalets
g = S.newGame(['A', 'B', 'C', 'D']);
g.bag = [];
g.players[0].rack = ['C', 'H', 'A', 'T'];
g.players[1].rack = ['K'];        // 10
g.players[2].rack = ['W', 'A'];   // 11
g.players[3].rack = ['E'];        // 1
res = S.playMove(g, 0, [
  { index: idx(7, 6), letter: 'C' }, { index: idx(7, 7), letter: 'H' },
  { index: idx(7, 8), letter: 'A' }, { index: idx(7, 9), letter: 'T' }
]);
check('fin de partie à 4', g.over === true);
check('A = 18 + 22', g.players[0].score === 40, g.players[0].score);
check('B = -10', g.players[1].score === -10, g.players[1].score);
check('C = -11', g.players[2].score === -11, g.players[2].score);
check('D = -1', g.players[3].score === -1, g.players[3].score);

console.log(failures ? `\n${failures} ÉCHEC(S)` : '\nTous les tests passent.');
process.exit(failures ? 1 : 0);
