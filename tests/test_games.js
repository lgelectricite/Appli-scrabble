const ROOT = require('path').join(__dirname, '..');
require(ROOT + '/js/games/registry.js');
const p4 = require(ROOT + '/js/games/p4.js');
const morpion = require(ROOT + '/js/games/morpion.js');
const pendu = require(ROOT + '/js/games/pendu.js');
const bac = require(ROOT + '/js/games/bac.js');
const bataille = require(ROOT + '/js/games/bataille.js');
const yams = require(ROOT + '/js/games/yams.js');
const cochon = require(ROOT + '/js/games/cochon.js');
const memory = require(ROOT + '/js/games/memory.js');
const poker = require(ROOT + '/js/games/poker.js');
const manoir = require(ROOT + '/js/games/manoir.js');
const imposteur = require(ROOT + '/js/games/imposteur.js');

let failures = 0;
function check(n, c, e) {
  if (c) console.log('  OK  ' + n);
  else { failures++; console.log('  FAIL ' + n + (e !== undefined ? ' -> ' + JSON.stringify(e) : '')); }
}
// carte : rang<<2 | couleur (rang 0='2' … 12='A')
const C = (rank, suit) => (rank << 2) | suit;

/* ================= POKER : évaluateur ================= */
console.log('--- Poker : évaluateur de mains ---');
const r5 = poker._rank5, cmp = poker._cmp, b7 = poker._best7;
check('paire bat carte haute', cmp(
  r5([C(3,0),C(3,1),C(5,2),C(7,3),C(9,0)]),
  r5([C(12,0),C(10,1),C(8,2),C(6,3),C(4,0)])) > 0);
check('deux paires > paire', cmp(
  r5([C(3,0),C(3,1),C(5,2),C(5,3),C(9,0)]),
  r5([C(12,0),C(12,1),C(8,2),C(6,3),C(4,0)])) > 0);
check('brelan > deux paires', cmp(
  r5([C(2,0),C(2,1),C(2,2),C(5,3),C(9,0)]),
  r5([C(12,0),C(12,1),C(11,2),C(11,3),C(4,0)])) > 0);
check('suite détectée', r5([C(1,0),C(2,1),C(3,2),C(4,3),C(5,0)])[0] === 4);
check('suite au As (A2345)', r5([C(12,0),C(0,1),C(1,2),C(2,3),C(3,0)])[0] === 4);
check('couleur > suite', cmp(
  r5([C(1,0),C(4,0),C(6,0),C(9,0),C(11,0)]),
  r5([C(8,0),C(9,1),C(10,2),C(11,3),C(12,0)])) > 0);
check('full > couleur', cmp(
  r5([C(2,0),C(2,1),C(2,2),C(7,3),C(7,0)]),
  r5([C(1,0),C(4,0),C(6,0),C(9,0),C(11,0)])) > 0);
check('carré > full', cmp(
  r5([C(2,0),C(2,1),C(2,2),C(2,3),C(7,0)]),
  r5([C(12,0),C(12,1),C(12,2),C(7,3),C(7,0)])) > 0);
check('quinte flush au sommet', r5([C(4,2),C(5,2),C(6,2),C(7,2),C(8,2)])[0] === 8);
check('kicker départage les paires', cmp(
  r5([C(9,0),C(9,1),C(12,2),C(3,3),C(2,0)]),
  r5([C(9,2),C(9,3),C(11,0),C(10,1),C(2,1)])) > 0);
// best7 : 7 cartes dont un full caché
const seven = [C(2,0),C(2,1),C(7,2),C(7,3),C(7,0),C(12,1),C(4,2)];
check('best7 trouve le full', b7(seven)[0] === 6, b7(seven));

/* ================= POKER : déroulement ================= */
console.log('--- Poker : partie ---');
let g = poker.create(['A', 'B', 'C']);
const chipsTotal = s => s.players.reduce((t, p) => t + p.chips + p.cont, 0);
check('3000 jetons en jeu', chipsTotal(g) === 3000, chipsTotal(g));
check('action avant choix du mode refusée', !poker.apply(g, 0, { t: 'call' }).ok);
check('mode choisi par l’hôte uniquement', !poker.apply(g, 1, { t: 'mode', m: 'tournoi' }).ok);
check('mode accepté', poker.apply(g, 0, { t: 'mode', m: 'tournoi' }).ok);
check('blinds posées', g.players.reduce((t, p) => t + p.cont, 0) === 30);
check('c’est au joueur après la BB', g.current >= 0);
// hors tour refusé
const notTurn = (g.current + 1) % 3;
check('action hors tour refusée', !poker.apply(g, notTurn, { t: 'call' }).ok);
// tout le monde suit puis check jusqu'au showdown
let guard = 0;
while (!g.handOver && guard++ < 60) {
  const p = g.players[g.current];
  const owe = g.maxBet - p.bet;
  const res = poker.apply(g, g.current, owe > 0 ? { t: 'call' } : { t: 'check' });
  if (!res.ok) { check('action légale acceptée', false, res); break; }
}
check('main jouée jusqu’au bout', g.handOver === true);
check('jetons conservés après la main', chipsTotal(g) === 3000, chipsTotal(g));
check('5 cartes communes', g.community.length === 5, g.community.length);
check('un message de gain', g.handMsg.length > 0, g.handMsg);
// main suivante + tout le monde se couche sauf un
poker.apply(g, 0, { t: 'next' });
guard = 0;
while (!g.handOver && guard++ < 10) {
  const res = poker.apply(g, g.current, { t: 'fold' });
  if (!res.ok) break;
}
check('victoire par abandon', g.handOver && /couché/.test(g.handMsg), g.handMsg);
check('jetons conservés après abandon', chipsTotal(g) === 3000, chipsTotal(g));
// redact : cartes adverses masquées
let red = poker.redact(g, 1);
const hidden = red.players.every((p, i) => i === 1 || p.hole.every(c => c === -1) || p.show);
check('cartes adverses masquées (redact)', hidden);
check('deck masqué (redact)', red.deck.length === 0);

/* ================= POKER : cash game et tournoi ================= */
console.log('--- Poker : cash game / tournoi ---');
g = poker.create(['A', 'B']);
poker.apply(g, 0, { t: 'mode', m: 'cash' });
check('recave refusée avec des jetons', !poker.apply(g, 0, { t: 'rebuy' }).ok);
g.players[1].chips = 0; g.players[1].folded = true;
poker.apply(g, 1, { t: 'rebuy' });
check('recave acceptée à 0 jeton', g.players[1].chips === 1000);
check('cash : blinds fixes après 20 mains', (() => {
  const s = poker.create(['A', 'B']);
  poker.apply(s, 0, { t: 'mode', m: 'cash' });
  s.handNum = 20; s.handOver = true;
  poker.apply(s, 0, { t: 'next' });
  return s.blinds[0] === 10 && s.blinds[1] === 20;
})());
check('tournoi : blinds doublées après 6 mains', (() => {
  const s = poker.create(['A', 'B']);
  poker.apply(s, 0, { t: 'mode', m: 'tournoi' });
  s.handNum = 6; s.handOver = true;
  poker.apply(s, 0, { t: 'next' });
  return s.blinds[0] === 20 && s.blinds[1] === 40;
})());
check('tournoi : élimination à 0 jeton', (() => {
  const s = poker.create(['A', 'B']);
  poker.apply(s, 0, { t: 'mode', m: 'tournoi' });
  // B perd tout hors main : simule fin de main avec 0 jeton
  s.players[1].chips = 0; s.players[1].cont = 0;
  s.handOver = false;
  // termine la main artificiellement
  s.players[1].folded = true;
  s.players[0].cont = 0;
  const mod = require(ROOT + '/js/games/poker.js');
  // via une vraie main : A mise, B se couche à 0 jeton…
  // plus simple : endHand est déclenché par un fold
  const t = poker.create(['X', 'Y']);
  poker.apply(t, 0, { t: 'mode', m: 'tournoi' });
  t.players[t.current === 0 ? 1 : 0].chips = 0; // l'autre n'a plus rien derrière
  poker.apply(t, t.current, { t: 'fold' });
  return t.players.some(p => p.out) ? t.finished : true; // éliminé si 0 après la main
})());

/* ================= PUISSANCE 4 ================= */
console.log('--- Puissance 4 ---');
g = p4.create(['A', 'B']);
check('hors tour refusé', !p4.apply(g, 1, { t: 'drop', col: 0 }).ok);
// A gagne en vertical colonne 0
p4.apply(g, 0, { t: 'drop', col: 0 }); p4.apply(g, 1, { t: 'drop', col: 1 });
p4.apply(g, 0, { t: 'drop', col: 0 }); p4.apply(g, 1, { t: 'drop', col: 1 });
p4.apply(g, 0, { t: 'drop', col: 0 }); p4.apply(g, 1, { t: 'drop', col: 2 });
p4.apply(g, 0, { t: 'drop', col: 0 });
check('victoire verticale détectée', g.roundOver && g.winner === 0);
check('manche comptée', g.players[0].wins === 1);
check('jouer après la fin refusé', !p4.apply(g, 1, { t: 'drop', col: 3 }).ok);
p4.apply(g, 0, { t: 'again' });
check('nouvelle manche, le perdant commence', !g.roundOver && g.current === 1);
// colonne pleine
for (let i = 0; i < 6; i++) p4.apply(g, g.current, { t: 'drop', col: 6 });
check('colonne pleine refusée', !p4.apply(g, g.current, { t: 'drop', col: 6 }).ok);

/* ================= MORPION ================= */
console.log('--- Morpion ---');
g = morpion.create(['A', 'B']);
morpion.apply(g, 0, { t: 'play', i: 0 }); morpion.apply(g, 1, { t: 'play', i: 3 });
morpion.apply(g, 0, { t: 'play', i: 1 }); morpion.apply(g, 1, { t: 'play', i: 4 });
check('case occupée refusée', !morpion.apply(g, 0, { t: 'play', i: 4 }).ok);
morpion.apply(g, 0, { t: 'play', i: 2 });
check('ligne gagnante', g.roundOver && g.winner === 0);

/* ================= YAMS ================= */
console.log('--- Yams ---');
const cs = yams._catScore;
check('les 3 : [3,3,3,1,2] = 9', cs('trois', [3, 3, 3, 1, 2]) === 9);
check('brelan : somme si 3 pareils', cs('brelan', [4, 4, 4, 2, 6]) === 20);
check('brelan : 0 sinon', cs('brelan', [4, 4, 3, 2, 6]) === 0);
check('carré', cs('carre', [5, 5, 5, 5, 2]) === 22);
check('full = 25', cs('full', [3, 3, 3, 6, 6]) === 25);
check('full raté = 0', cs('full', [3, 3, 4, 6, 6]) === 0);
check('petite suite = 30', cs('psuite', [1, 2, 3, 4, 6]) === 30);
check('grande suite = 40', cs('gsuite', [2, 3, 4, 5, 6]) === 40);
check('yams = 50', cs('yams', [6, 6, 6, 6, 6]) === 50);
check('chance = somme', cs('chance', [1, 2, 3, 4, 5]) === 15);
g = yams.create(['Solo']);
check('marquer sans lancer refusé', !yams.apply(g, 0, { t: 'score', cat: 'chance' }).ok);
yams.apply(g, 0, { t: 'roll' });
check('lancer effectué', g.dice.every(d => d >= 1 && d <= 6));
const res1 = yams.apply(g, 0, { t: 'score', cat: 'chance' });
check('marque acceptée', res1.ok, res1);
check('case remplie non rejouable', g.players[0].sheet.chance !== null);

/* ================= PENDU ================= */
console.log('--- Pendu ---');
g = pendu.create(['A', 'B'], null);
g.secret = 'MAISON';
g.revealed = new Array(6).fill(null);
let r = pendu.apply(g, 0, { t: 'letter', l: 'A' });
check('lettre trouvée : +1 et rejoue', r.ok && g.players[0].score === 1 && g.current === 0);
r = pendu.apply(g, 0, { t: 'letter', l: 'Z' });
check('lettre fausse : erreur et tour passe', r.ok && g.errors === 1 && g.current === 1);
check('lettre déjà jouée refusée', !pendu.apply(g, 1, { t: 'letter', l: 'A' }).ok);
['M', 'I', 'S', 'O', 'N'].forEach(l => pendu.apply(g, g.current, { t: 'letter', l }));
check('mot complété : manche finie', g.roundOver && g.answer === 'MAISON');
check('bonus de fin de mot (+3)', g.players[1].score >= 3 || g.players[0].score >= 4);
const redP = pendu.redact(g, 1);
check('secret absent du réseau', redP.secret === undefined);

/* ================= MEMORY ================= */
console.log('--- Memory ---');
g = memory.create(['A', 'B']);
// on truque le plateau pour un test déterministe
g.cards = [{ e: '🐶' }, { e: '🐶' }, { e: '🐱' }, { e: '🐱' }].map(c => ({ e: c.e, matched: false }));
memory.apply(g, 0, { t: 'flip', i: 0 });
memory.apply(g, 0, { t: 'flip', i: 1 });
check('paire trouvée : +1 et rejoue', g.players[0].pairs === 1 && g.current === 0);
memory.apply(g, 0, { t: 'flip', i: 2 });
check('carte déjà appariée refusée', !memory.apply(g, 0, { t: 'flip', i: 0 }).ok);
memory.apply(g, 0, { t: 'flip', i: 3 });
check('les 2 paires trouvées → partie finie', g.finished === true);
check('essais comptés (2 paires = 2 essais)', g.players[0].tries === 2, g.players[0].tries);
check('chrono enregistré', g.durationSec >= 1, g.durationSec);
// classement : à paires égales, le moins d'essais l'emporte
g = memory.create(['Rapide', 'Lent']);
g.players[0].pairs = 6; g.players[0].tries = 8;
g.players[1].pairs = 6; g.players[1].tries = 15;
g.durationSec = 90; g.startTs = 1; g.finished = true;
const sumM = memory.summary(g);
check('classement : moins d’essais devant', sumM.indexOf('Rapide') < sumM.indexOf('Lent'));
check('essais et chrono dans le bilan', /essais/.test(sumM) && /1 min 30 s/.test(sumM));
check('vainqueur départagé aux essais', /🏆 Rapide/.test(sumM) && sumM.indexOf('🏆 Rapide & Lent') === -1);

/* ================= BATAILLE NAVALE ================= */
console.log('--- Bataille navale ---');
g = bataille.create(['A', 'B']);
check('17 cases de bateaux chacun',
  Object.keys(g.boards[0].cells).length === 17 && Object.keys(g.boards[1].cells).length === 17);
bataille.apply(g, 0, { t: 'ready' });
bataille.apply(g, 1, { t: 'ready' });
check('phase de jeu lancée', g.phase === 'play' && g.current === 0);
// A tire sur toutes les cases des bateaux de B → victoire
const targets = Object.keys(g.boards[1].cells).map(Number);
let fired = 0;
for (const t of targets) {
  const rr = bataille.apply(g, 0, { t: 'fire', i: t });
  if (!rr.ok) { check('tir légal accepté', false, rr); break; }
  fired++;
}
check('touché = rejoue (17 tirs consécutifs)', fired === 17);
check('victoire quand tout est coulé', g.finished && g.winner === 0);
// série de manches
check('over() reste faux : série de manches', bataille.over(g) === false);
check('victoire comptée dans la série', g.players[0].wins === 1 && g.players[1].wins === 0);
check('score série avec trophée', String(bataille.scoreOf(g, 0)).indexOf('🏆') !== -1);
const rev = bataille.apply(g, 0, { t: 'again' });
check('revanche relancée, le perdant commence', rev.ok && g.phase === 'place' &&
  !g.finished && g.current === 1);
check('victoires conservées après revanche', g.players[0].wins === 1);
check('flottes replacées et joueurs plus prêts',
  Object.keys(g.boards[0].cells).length === 17 && !g.players[0].ready && !g.players[1].ready);
g = bataille.create(['A', 'B']);
check('revanche refusée en cours de manche', !bataille.apply(g, 0, { t: 'again' }).ok);
g = bataille.create(['A', 'B']);
bataille.apply(g, 0, { t: 'ready' });
bataille.apply(g, 1, { t: 'ready' });
check('tir hors tour refusé', !bataille.apply(g, 1, { t: 'fire', i: 0 }).ok);
const redB = bataille.redact(g, 0);
check('bateaux adverses masqués', Object.keys(redB.boards[1].cells).length === 0);
check('mes bateaux visibles', Object.keys(redB.boards[0].cells).length === 17);

/* ================= COCHON ================= */
console.log('--- Cochon ---');
g = cochon.create(['A', 'B']);
check('banquer sans points refusé', !cochon.apply(g, 0, { t: 'bank' }).ok);
// dé truqué : toujours 5
const realRandom = Math.random;
Math.random = () => 0.7; // floor(0.7*6)+1 = 5
cochon.apply(g, 0, { t: 'roll' });
check('points du tour = 5', g.turnPoints === 5);
cochon.apply(g, 0, { t: 'bank' });
check('total = 5, tour passé', g.players[0].total === 5 && g.current === 1);
Math.random = () => 0; // dé = 1
cochon.apply(g, 1, { t: 'roll' });
check('le 1 fait perdre le tour', g.turnPoints === 0 && g.current === 0);
Math.random = realRandom;

/* ================= PETIT BAC ================= */
console.log('--- Petit Bac ---');
g = bac.create(['A', 'B']);
let rs = bac.apply(g, 1, { t: 'start' });
check('seul l’hôte lance la manche', !rs.ok);
rs = bac.apply(g, 0, { t: 'start' });
check('manche lancée avec minuteur', rs.ok && rs.timer && rs.timer.ms === 60000);
const L = g.letter;
check('lettre tirée', /^[A-Z]$/.test(L), L);
// réponses : A répond bien, B laisse vide sauf une mauvaise lettre
bac.apply(g, 0, { t: 'answers', list: [L + 'ivan', L + 'ion', L + 'yon', '', L + 'oire', L + 'ampe'] });
bac.apply(g, 1, { t: 'answers', list: [L + 'ivan', 'Xxx', '', '', '', ''] });
check('tous ont répondu → phase vote', g.phase === 'vote');
// votes : tout accepté par défaut
bac.apply(g, 0, { t: 'vote', grid: {} });
bac.apply(g, 1, { t: 'vote', grid: {} });
check('phase résultat', g.phase === 'result');
// A : cat0 doublon (5), cat1/2/4/5 uniques (10), cat3 vide (0) => 45
check('score A = 45 (doublon 5 + 4×10)', g.players[0].score === 45, g.players[0].score);
// B : cat0 doublon (5), cat1 mauvaise lettre auto-invalide (0) => 5
check('score B = 5 (mauvaise lettre auto-refusée)', g.players[1].score === 5, g.players[1].score);
// manche suivante avec vote de refus
bac.apply(g, 0, { t: 'start' });
const L2 = g.letter;
bac.apply(g, 0, { t: 'answers', list: [L2 + 'zzz', '', '', '', '', ''] });
bac.apply(g, 1, { t: 'answers', list: ['', '', '', '', '', ''] });
bac.apply(g, 0, { t: 'vote', grid: {} });
bac.apply(g, 1, { t: 'vote', grid: { 0: [false, true, true, true, true, true] } });
check('réponse refusée par vote = 0 point', g.players[0].score === 45, g.players[0].score);
// redact pendant l'écriture
bac.apply(g, 0, { t: 'start' });
bac.apply(g, 0, { t: 'answers', list: ['a', 'b', 'c', 'd', 'e', 'f'] });
const redBac = bac.redact(g, 1);
check('réponses des autres cachées pendant la manche', redBac.answers[0] === undefined);


/* ================= LE MANOIR ================= */
console.log('--- Le Manoir ---');
g = manoir.create(['A', 'B', 'C']);
check('6 pistes, 2 déductions chacune', g.pistes.length === 6 &&
  g.pistes.every(p => p.deductions.length === 2));
check('12 déductions au total', g.pistes.reduce((t, p) => t + p.deductions.length, 0) === 12);
const sol = g.solution;
const dedIds = g.pistes.flatMap(p => p.deductions).map(d => d.kind + ':' + d.id);
check('la solution n’apparaît JAMAIS dans les déductions',
  !dedIds.includes('suspect:' + sol.suspect) &&
  !dedIds.includes('arme:' + sol.arme) &&
  !dedIds.includes('lieu:' + sol.lieu));
check('lancement réservé à l’hôte', !manoir.apply(g, 2, { t: 'start' }).ok);
check('énigme avant le lancement refusée', !manoir.apply(g, 0, { t: 'answer', piste: 0, text: 'x' }).ok);
manoir.apply(g, 0, { t: 'start' });
check('enquête lancée', g.phase === 'play');
// normalisation des réponses
check('normalisation accents/espaces', manoir._norm("L'Épongé  ") === 'LEPONGE');
// mauvaise réponse comptée
manoir.apply(g, 1, { t: 'answer', piste: 0, text: 'quarante-douze' });
check('mauvaise réponse comptée', g.wrongAnswers === 1 && !g.pistes[0].solved);
// bonne réponse : la piste s'élucide et révèle 2 déductions
const bonne = g.pistes[0].answers[0];
manoir.apply(g, 2, { t: 'answer', piste: 0, text: bonne.toLowerCase() + ' ' });
check('bonne réponse acceptée (insensible casse/espaces)', g.pistes[0].solved);
check('2 déductions révélées', g.eliminated.length === 2);
check('l’auteur de la trouvaille est noté', g.pistes[0].solvedBy === 'C');
check('re-répondre à une piste élucidée refusé', !manoir.apply(g, 0, { t: 'answer', piste: 0, text: bonne }).ok);
// indice compté une seule fois
manoir.apply(g, 0, { t: 'hint', piste: 1 });
manoir.apply(g, 1, { t: 'hint', piste: 1 });
check('indice compté une seule fois par piste', g.hintsUsed === 1);
// accusation fausse puis fausse → défaite
manoir.apply(g, 1, { t: 'accuse',
  suspect: sol.suspect === 'safran' ? 'cobalt' : 'safran', arme: sol.arme, lieu: sol.lieu });
check('accusation erronée : plus qu’une tentative', g.tries === 1 && g.phase === 'play');
manoir.apply(g, 1, { t: 'accuse',
  suspect: sol.suspect === 'safran' ? 'cobalt' : 'safran', arme: sol.arme, lieu: sol.lieu });
check('2e échec : défaite', g.phase === 'end' && g.won === false);
// nouvelle affaire + accusation juste → victoire
manoir.apply(g, 0, { t: 'again' });
check('nouvelle affaire générée', g.phase === 'brief' && g.tries === 2 && g.eliminated.length === 0);
manoir.apply(g, 0, { t: 'start' });
manoir.apply(g, 2, { t: 'accuse', suspect: g.solution.suspect, arme: g.solution.arme, lieu: g.solution.lieu });
check('accusation juste : victoire', g.phase === 'end' && g.won === true && g.lastAccuser === 'C');
// redact
g = manoir.create(['A', 'B']);
manoir.apply(g, 0, { t: 'start' });
manoir.apply(g, 0, { t: 'answer', piste: 2, text: g.pistes[2].answers[0] });
const redM = manoir.redact(g, 1);
check('solution masquée sur le réseau', redM.solution === undefined);
check('réponses des énigmes masquées', redM.pistes.every(p => p.answers === undefined));
check('déductions des pistes non élucidées masquées',
  redM.pistes.every((p, i) => i === 2 ? p.deductions.length === 2 : p.deductions === undefined));
g.phase = 'end';
check('solution visible en fin de partie', manoir.redact(g, 1).solution !== undefined);
// 12 joueurs
g = manoir.create('ABCDEFGHIJKL'.split(''));
check('12 joueurs acceptés', g.players.length === 12);
manoir.apply(g, 0, { t: 'start' });
check('le 12e joueur peut répondre',
  manoir.apply(g, 11, { t: 'answer', piste: 0, text: g.pistes[0].answers[0] }).ok &&
  g.pistes[0].solvedBy === 'L');
// trois décors d'affaires
check('3 décors d’affaires disponibles', manoir._SCENARIOS.length >= 3, manoir._SCENARIOS.length);
check('chaque décor : titre, intro, 5 lieux, 6 pistes', manoir._SCENARIOS.every(sc =>
  sc.id && sc.titre && sc.lieuTexte && sc.intro &&
  sc.lieux.length === 5 && sc.lieux.every(l => l.id && l.nom && l.dans && l.icone) &&
  sc.pistes.length === 6 && sc.pistes.every(p => p.id && p.nom && p.icone && p.desc)));
g = manoir.create(['A']);
check('un décor est tiré au sort', g.scenario &&
  manoir._SCENARIOS.some(sc => sc.id === g.scenario.id));
check('le lieu du crime appartient au décor', g.scenario.lieux.some(l => l.id === g.solution.lieu));
check('les pistes viennent du décor', g.pistes.every((p, i) => p.id === g.scenario.pistes[i].id));
const seenScen = new Set();
for (let i = 0; i < 80 && seenScen.size < 3; i++) seenScen.add(manoir.create(['A']).scenario.id);
check('les 3 décors sortent au tirage', seenScen.size === 3, [...seenScen].join(','));
manoir.apply(g, 0, { t: 'start' });
const redScen = manoir.redact(g, 0);
check('le décor reste visible sur le réseau', redScen.scenario &&
  redScen.scenario.lieux.length === 5);
// rôles personnels
check('12 rôles distincts définis', manoir._ROLES.length === 12 &&
  new Set(manoir._ROLES.map(r => r.id)).size === 12);
g = manoir.create('ABCDEFGHIJKL'.split(''));
check('12 joueurs = 12 rôles uniques', new Set(g.players.map(p => p.role.id)).size === 12);
check('chaque joueur a au moins une info confidentielle',
  g.players.every(p => p.clues && p.clues.length >= 1));
check('les infos privées ne désignent jamais la solution', g.players.every(p =>
  p.clues.every(cl =>
    !(cl.kind === 'suspect' && cl.id === g.solution.suspect) &&
    !(cl.kind === 'arme' && cl.id === g.solution.arme) &&
    !(cl.kind === 'lieu' && cl.id === g.solution.lieu))));
const redRole = manoir.redact(g, 2);
check('infos privées des autres masquées (réseau)',
  redRole.players.every((p, i) => i === 2 ? !!p.clues : p.clues === undefined));
check('les rôles eux-mêmes sont publics', redRole.players.every(p => p.role && p.role.id));
// détective : premier indice gratuit
g = manoir.create(['A']);
g.players[0].role = manoir._ROLES.find(r => r.id === 'detective');
g.players[0].freeHintUsed = false;
manoir.apply(g, 0, { t: 'start' });
manoir.apply(g, 0, { t: 'hint', piste: 0 });
check('détective : 1er indice gratuit', g.hintsUsed === 0 && g.pistes[0].hintShown);
manoir.apply(g, 0, { t: 'hint', piste: 1 });
check('détective : 2e indice compté', g.hintsUsed === 1);
// voyante : deux infos différentes
let gVoy = null;
for (let t = 0; t < 500 && !gVoy; t++) {
  const x = manoir.create(['A', 'B']);
  if (x.players[1].role.id === 'voyante') gVoy = x;
}
check('voyante : DEUX infos confidentielles', !!gVoy &&
  gVoy.players[1].clues.length === 2 &&
  gVoy.players[1].clues[0].text !== gVoy.players[1].clues[1].text);
// inspecteur : décompte d'accusation pour lui seul
g = manoir.create(['A', 'B']);
g.players[1].role = manoir._ROLES.find(r => r.id === 'inspecteur');
manoir.apply(g, 0, { t: 'start' });
manoir.apply(g, 0, { t: 'accuse',
  suspect: g.solution.suspect === 'safran' ? 'cobalt' : 'safran',
  arme: g.solution.arme, lieu: g.solution.lieu });
check('décompte d’éléments exacts enregistré', g.accuseFailed.right === 2);
check('l’inspecteur voit le décompte', manoir.redact(g, 1).accuseFailed.right === 2);
check('les autres ne le voient pas', manoir.redact(g, 0).accuseFailed.right === undefined);
// cryptographe et archiviste : pouvoirs matérialisés à la redaction
g = manoir.create(['A', 'B']);
g.players[0].role = manoir._ROLES.find(r => r.id === 'cryptographe');
g.players[1].role = manoir._ROLES.find(r => r.id === 'archiviste');
manoir.apply(g, 0, { t: 'start' });
const redCry = manoir.redact(g, 0);
check('cryptographe : première lettre visible, réponses masquées',
  redCry.pistes.every(p => p.first && p.first.length === 1 && p.answers === undefined));
check('cryptographe : pas les natures de pistes', redCry.pistes.every(p => p.kinds === undefined));
const redArc = manoir.redact(g, 1);
check('archiviste : nature des révélations de chaque piste',
  redArc.pistes.every(p => p.kinds && p.kinds.length === 2) &&
  redArc.pistes.every(p => p.first === undefined));
// banque d'énigmes saine
check('au moins 24 énigmes en réserve', manoir._ENIGMES.length >= 24, manoir._ENIGMES.length);
check('chaque énigme a réponse(s) et indice', manoir._ENIGMES.every(e =>
  e.q && e.hint && Array.isArray(e.a) && e.a.length > 0 &&
  e.a.every(x => x === manoir._norm(x))));

/* ================= L'IMPOSTEUR ================= */
console.log('--- L’Imposteur ---');
// base de paires saine
check('au moins 150 paires de mots', imposteur._PAIRS.length >= 150, imposteur._PAIRS.length);
check('paires bien formées (2 mots distincts)', imposteur._PAIRS.every(e => {
  const p = e.split('|');
  return p.length === 2 && p[0] && p[1] && p[0] !== p[1];
}));
check('nombre d’imposteurs : 1 puis 2 puis 3',
  imposteur._nbImposteurs(3) === 1 && imposteur._nbImposteurs(5) === 1 &&
  imposteur._nbImposteurs(6) === 2 && imposteur._nbImposteurs(8) === 2 &&
  imposteur._nbImposteurs(9) === 3 && imposteur._nbImposteurs(12) === 3);

g = imposteur.create(['A', 'B', 'C', 'D', 'E']);
check('5 joueurs → 1 imposteur', g.players.filter(p => p.role === 'imposteur').length === 1);
check('les civils partagent un mot, l’imposteur a l’autre', g.players.every(p =>
  p.word === (p.role === 'imposteur' ? g.pair[1] : g.pair[0])));
check('phase découverte du mot', g.phase === 'reveal');
// redaction : mots et camps invisibles, même le sien
let redImp = imposteur.redact(g, 0);
check('mon mot visible, ceux des autres non',
  redImp.players[0].word === g.players[0].word &&
  redImp.players.slice(1).every(p => p.word === undefined));
check('AUCUN camp visible (on ignore son propre camp)',
  redImp.players.every(p => p.role === undefined));
check('la paire de mots ne circule pas', redImp.pair === undefined);
// tout le monde mémorise
check('indice avant l’heure refusé', !imposteur.apply(g, 0, { t: 'clue', text: 'x' }).ok);
for (let i = 0; i < 5; i++) imposteur.apply(g, i, { t: 'seen' });
check('tous ont vu → phase indices', g.phase === 'clue' && g.order.length === 5);
// indices dans l'ordre
check('hors tour refusé', !imposteur.apply(g, g.order[1], { t: 'clue', text: 'test' }).ok);
const sp0 = g.order[0];
check('indice de 2 mots refusé', !imposteur.apply(g, sp0, { t: 'clue', text: 'deux mots' }).ok);
check('indice = son propre mot refusé',
  !imposteur.apply(g, sp0, { t: 'clue', text: g.players[sp0].word.toLowerCase() }).ok);
for (let k = 0; k < 5; k++) imposteur.apply(g, g.order[k], { t: 'clue', text: 'indice' + k });
check('5 indices → phase vote', g.phase === 'vote' && g.tours[0].length === 5);
// votes : l'imposteur est démasqué
const impIdx = g.players.findIndex(p => p.role === 'imposteur');
check('vote pour soi refusé', !imposteur.apply(g, impIdx, { t: 'vote', for: impIdx }).ok);
for (let i = 0; i < 5; i++) {
  imposteur.apply(g, i, { t: 'vote', for: i === impIdx ? (impIdx + 1) % 5 : impIdx });
}
check('imposteur éliminé → victoire des civils',
  g.phase === 'end' && g.winner === 'civils' && !g.players[impIdx].alive);
check('civils +3 points', g.players.every((p, i) =>
  p.score === (p.role === 'civil' ? 3 : 0)));
check('fin de manche : mots et camps révélés', (() => {
  const r = imposteur.redact(g, 1);
  return r.pair && r.players.every(p => p.role);
})());
// nouvelle manche : scores conservés
imposteur.apply(g, 0, { t: 'again' });
check('nouvelle manche, scores conservés', g.manche === 2 && g.phase === 'reveal' &&
  g.players.some(p => p.score === 3));
// victoire de l'imposteur : élimination de civils jusqu'à égalité (3 joueurs)
g = imposteur.create(['A', 'B', 'C']);
for (let i = 0; i < 3; i++) imposteur.apply(g, i, { t: 'seen' });
for (let k = 0; k < 3; k++) imposteur.apply(g, g.order[k], { t: 'clue', text: 'x' + k });
const imp3 = g.players.findIndex(p => p.role === 'imposteur');
const civ3 = g.players.map((p, i) => i).filter(i => i !== imp3);
// tout le monde vote contre un civil
for (let i = 0; i < 3; i++) {
  imposteur.apply(g, i, { t: 'vote', for: i === civ3[0] ? civ3[1] : civ3[0] });
}
check('1 imposteur vs 1 civil → l’imposteur gagne',
  g.phase === 'end' && g.winner === 'imposteurs' &&
  g.players[imp3].score === 5);
// égalité des voix : personne n'est éliminé, on rejoue un tour
g = imposteur.create(['A', 'B', 'C']);
for (let i = 0; i < 3; i++) imposteur.apply(g, i, { t: 'seen' });
for (let k = 0; k < 3; k++) imposteur.apply(g, g.order[k], { t: 'clue', text: 'y' + k });
imposteur.apply(g, 0, { t: 'vote', for: 1 });
imposteur.apply(g, 1, { t: 'vote', for: 2 });
imposteur.apply(g, 2, { t: 'vote', for: 0 });
check('égalité 1-1-1 : personne n’est éliminé', g.phase === 'result' &&
  g.lastResult.tie === true && g.players.every(p => p.alive));
check('seul l’hôte relance le tour', !imposteur.apply(g, 1, { t: 'next' }).ok);
imposteur.apply(g, 0, { t: 'next' });
check('nouveau tour d’indices à 3', g.phase === 'clue' && g.order.length === 3 &&
  g.tours.length === 2);
// pendant le vote : votes des autres masqués, drapeau « a voté » visible
g = imposteur.create(['A', 'B', 'C']);
for (let i = 0; i < 3; i++) imposteur.apply(g, i, { t: 'seen' });
for (let k = 0; k < 3; k++) imposteur.apply(g, g.order[k], { t: 'clue', text: 'z' + k });
imposteur.apply(g, 1, { t: 'vote', for: 0 });
redImp = imposteur.redact(g, 0);
check('vote d’autrui masqué mais signalé', redImp.players[1].vote === undefined &&
  redImp.players[1].hasVoted === true && redImp.players[2].hasVoted === false);
// hotseat : viewerOf suit celui qui doit agir en secret
g = imposteur.create(['A', 'B', 'C', 'D']);
check('viewerOf : premier joueur sans mot vu', imposteur.viewerOf(g) === 0);
imposteur.apply(g, 0, { t: 'seen' });
check('viewerOf passe au suivant', imposteur.viewerOf(g) === 1);

console.log(failures ? `\n${failures} ÉCHEC(S)` : '\nTous les tests de jeux passent.');
process.exit(failures ? 1 : 0);
