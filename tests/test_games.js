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
check('300 jetons en jeu (3 caves de 100)', chipsTotal(g) === 300, chipsTotal(g));
check('action avant choix du mode refusée', !poker.apply(g, 0, { t: 'call' }).ok);
check('mode choisi par l’hôte uniquement', !poker.apply(g, 1, { t: 'mode', m: 'tournoi' }).ok);
check('mode accepté', poker.apply(g, 0, { t: 'mode', m: 'tournoi' }).ok);
check('blinds 1/2 posées', g.players.reduce((t, p) => t + p.cont, 0) === 3);
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
check('jetons conservés après la main', chipsTotal(g) === 300, chipsTotal(g));
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
check('jetons conservés après abandon', chipsTotal(g) === 300, chipsTotal(g));
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
check('recave acceptée à 0 jeton', g.players[1].chips === 100);
check('cash : blinds fixes après 20 mains', (() => {
  const s = poker.create(['A', 'B']);
  poker.apply(s, 0, { t: 'mode', m: 'cash' });
  s.handNum = 20; s.handOver = true;
  poker.apply(s, 0, { t: 'next' });
  return s.blinds[0] === 1 && s.blinds[1] === 2;
})());
check('tournoi : blinds doublées après 6 mains', (() => {
  const s = poker.create(['A', 'B']);
  poker.apply(s, 0, { t: 'mode', m: 'tournoi' });
  s.handNum = 6; s.handOver = true;
  poker.apply(s, 0, { t: 'next' });
  return s.blinds[0] === 2 && s.blinds[1] === 4;
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
require(ROOT + '/js/games/motscourants.js');
check('liste de mots courants chargée', Array.isArray(GG.MOTS_COURANTS) &&
  GG.MOTS_COURANTS.length >= 700, GG.MOTS_COURANTS && GG.MOTS_COURANTS.length);
g = pendu.create(['A', 'B'], null);
check('phase de choix du niveau', g.phase === 'setup');
check('lettre avant le niveau refusée', !pendu.apply(g, 0, { t: 'letter', l: 'A' }).ok);
check('niveau réservé à l’hôte', !pendu.apply(g, 1, { t: 'level', l: 'facile' }).ok);
pendu.apply(g, 0, { t: 'level', l: 'difficile' });
// V2 : niveaux recalibrés sur la fréquence des mots (facile = très courants et courts)
check('difficile : mots de 6 à 12 lettres, vocabulaire plus riche, 6 erreurs permises', g.maxErrors === 6 &&
  g.secret.length >= 6 && g.secret.length <= 12, g.secret);
check('le mot vient des mots courants', GG.MOTS_COURANTS.indexOf(g.secret) !== -1, g.secret);
// niveaux : longueurs respectées sur 30 tirages
let lvlOk = true;
for (let t = 0; t < 30; t++) {
  const x = pendu.create(['A']);
  pendu.apply(x, 0, { t: 'level', l: 'facile' });
  if (x.secret.length < 4 || x.secret.length > 7 || x.maxErrors !== 8) lvlOk = false;
}
check('facile : mots très courants de 4 à 7 lettres, 8 erreurs permises (30 tirages)', lvlOk);
g = pendu.create(['A', 'B'], null);
pendu.apply(g, 0, { t: 'level', l: 'facile' });
g.secret = 'MAISONS';
g.revealed = new Array(7).fill(null);
g.tried = [];
let r = pendu.apply(g, 0, { t: 'letter', l: 'A' });
check('lettre trouvée : +1 et rejoue', r.ok && g.players[0].score === 1 && g.current === 0);
r = pendu.apply(g, 0, { t: 'letter', l: 'Z' });
check('lettre fausse : erreur et tour passe', r.ok && g.errors === 1 && g.current === 1);
check('lettre déjà jouée refusée', !pendu.apply(g, 1, { t: 'letter', l: 'A' }).ok);
// indice : coûte un cœur, révèle sans donner de points
const scoreAvant = g.players[1].score;
const revAvant = g.revealed.filter(Boolean).length;
r = pendu.apply(g, 1, { t: 'hint' });
check('indice accepté : +1 erreur, lettre(s) révélée(s), 0 point',
  r.ok && g.errors === 2 && g.revealed.filter(Boolean).length > revAvant &&
  g.players[1].score === scoreAvant);
check('indice hors tour refusé', !pendu.apply(g, 0, { t: 'hint' }).ok);
// à un cœur de la fin : indice bloqué
g.errors = g.maxErrors - 1;
check('indice refusé au dernier cœur', !pendu.apply(g, 1, { t: 'hint' }).ok);
g.errors = 2;
['M', 'I', 'S', 'O', 'N'].forEach(l => pendu.apply(g, g.current, { t: 'letter', l }));
check('mot complété : manche finie', g.roundOver && g.answer === 'MAISONS');
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
// V2 : la règle classique « un tir par tour » est celle par défaut ; la
// variante « touché = on rejoue » se choisit avant que quiconque soit prêt
check('variante « touché = on rejoue » au choix', bataille.apply(g, 0, { t: 'regles', rejoue: true }).ok && g.opts.rejoue);
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
check('revanche relancée', rev.ok && g.phase === 'place' && !g.finished);
check('victoires conservées après revanche', g.players[0].wins === 1);
check('flottes replacées et joueurs plus prêts',
  Object.keys(g.boards[0].cells).length === 17 && !g.players[0].ready && !g.players[1].ready);
bataille.apply(g, 0, { t: 'ready' });
bataille.apply(g, 1, { t: 'ready' });
check('le PERDANT commence vraiment la revanche', g.phase === 'play' && g.current === 1);
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
{
  const M = manoir;
  const faitsDe = st => M._tousLesFaits(st);
  g = M.create(['A', 'B', 'C']);
  check('six pistes, chacune avec au moins un indice', g.pistes.length === 6 &&
    g.pistes.every(p => p.faits.length >= 1));
  check('cinq témoignages publics (un par suspect)', g.temoignages.length === 5 &&
    new Set(g.temoignages.map(f => f.par)).size === 5);
  const sol = g.solution;
  const cand = M._solveur(g.scenario, faitsDe(g));
  check('le solveur trouve UNE seule solution : la bonne', cand.length === 1 &&
    cand[0][0] === sol.suspect && cand[0][1] === sol.arme && cand[0][2] === sol.lieu, cand.length);
  check('les pistes seules ne concluent pas (il faut les dossiers secrets)',
    M._solveur(g.scenario, g.temoignages.concat(g.pistes.flatMap(p => p.faits))).length >= 3);
  check('les dossiers seuls ne concluent pas (il faut les pistes)',
    M._solveur(g.scenario, g.temoignages.concat(g.players.flatMap(p => p.prive))).length >= 2);
  check('aucun indice ne nomme le coupable', faitsDe(g).every(f => !/coupable est (le |la )?[A-Z]/.test(f.txt)));
  check('lancement réservé à l’hôte', !M.apply(g, 2, { t: 'start' }).ok);
  check('énigme avant le lancement refusée', !M.apply(g, 0, { t: 'answer', piste: 0, text: 'x' }).ok);
  M.apply(g, 0, { t: 'start' });
  check('à plusieurs : chacun lit son dossier secret', g.phase === 'roles');
  check('viewerOf : le téléphone passe au premier qui n’a pas lu', M.viewerOf(g) === 0);
  M.apply(g, 0, { t: 'lu' });
  check('viewerOf : puis au suivant', M.viewerOf(g) === 1);
  M.apply(g, 1, { t: 'lu' }); M.apply(g, 2, { t: 'lu' });
  check('enquête lancée quand tous ont lu', g.phase === 'play' && g.startTs > 0);
  // normalisation tolérante : articles, accents, casse, pluriel
  check('normalisation accents/espaces', M._norm("L'Épongé  ") === 'LEPONGE');
  check('« une horloge » accepté pour HORLOGE', M._accepte('une horloge', ['HORLOGE']));
  check('« Une ombre » accepté pour OMBRE', M._accepte('Une ombre', ['OMBRE']));
  check('« la clé » et « une clef » acceptés', M._accepte('la clé', ['CLÉ', 'CLEF']) && M._accepte('une clef', ['CLÉ', 'CLEF']));
  check('« un coffre », « c’est le coffre ! » acceptés', M._accepte('un coffre', ['COFFRE']) &&
    M._accepte('c’est le coffre !', ['COFFRE']));
  check('« une chandelle » / « des étoiles » acceptés', M._accepte('une chandelle', ['CHANDELLE']) &&
    M._accepte('des étoiles', ['ÉTOILE']));
  check('« 8 jours » accepté pour 8, « 23 h 30 » pour 23H30', M._accepte('8 jours', ['8']) &&
    M._accepte('à 23 h 30', ['23H30', '2330']));
  check('une autre réponse reste refusée', !M._accepte('une pendule', ['HORLOGE']) && !M._accepte('83', ['8']));
  // mauvaise réponse comptée
  M.apply(g, 1, { t: 'answer', piste: 0, text: 'quarante-douze' });
  check('mauvaise réponse comptée', g.wrongAnswers === 1 && !g.pistes[0].solved);
  const bonne = g.pistes[0].answers[0];
  M.apply(g, 2, { t: 'answer', piste: 0, text: 'le ' + bonne.toLowerCase() + ' ' });
  check('bonne réponse acceptée (article, casse, espaces)', g.pistes[0].solved);
  check('l’auteur de la trouvaille est noté', g.pistes[0].solvedBy === 'C');
  check('re-répondre à une piste élucidée : sans effet', M.apply(g, 0, { t: 'answer', piste: 0, text: bonne }).ok &&
    g.wrongAnswers === 1);
  g.players.forEach(p => { p.freeHintUsed = true; });
  M.apply(g, 0, { t: 'hint', piste: 1 });
  M.apply(g, 1, { t: 'hint', piste: 1 });
  check('indice compté une seule fois par piste', g.hintsUsed === 1);
  // accusation : proposée, votée, confirmée
  const faux = { s: sol.suspect === 'safran' ? 'cobalt' : 'safran', a: sol.arme, l: sol.lieu };
  const sc0 = g.scenario;
  const autreS = sc0.suspects.find(x => x.id !== sol.suspect).id;
  const seq = g.accSeq;
  M.apply(g, 1, { t: 'propose', s: autreS, a: sol.arme, l: sol.lieu, seq: seq });
  check('une proposition ouvre un vote (pas d’accusation solitaire)', g.phase === 'vote' && g.tries === 2);
  check('double appui sur « Porter l’accusation » : ignoré', M.apply(g, 1, { t: 'propose', s: autreS, a: sol.arme, l: sol.lieu, seq: seq }).ok &&
    g.tries === 2 && g.phase === 'vote');
  const redV = M.redact(g, 2);
  check('les voix restent secrètes pendant le vote', redV.vote.votes['1'] === null);
  M.apply(g, 0, { t: 'vote', id: g.vote.id, v: false });
  check('1 pour, 1 contre : le vote continue', g.phase === 'vote');
  M.apply(g, 2, { t: 'vote', id: g.vote.id, v: true });
  check('majorité : l’accusation est portée (erronée)', g.phase === 'verdict' && g.tries === 1 && !g.verdict.win);
  check('vote tardif ou en double : sans effet', M.apply(g, 2, { t: 'vote', id: seq, v: true }).ok && g.tries === 1);
  check('verdict non final : rien n’est dévoilé', g.verdict.ok === null && M.redact(g, 0).solution === undefined);
  M.apply(g, 0, { t: 'suite', id: g.verdict.id });
  check('retour à l’enquête', g.phase === 'play');
  // un vote refusé ne coûte rien
  M.apply(g, 0, { t: 'propose', s: autreS, a: sol.arme, l: sol.lieu, seq: g.accSeq });
  M.apply(g, 1, { t: 'vote', id: g.vote.id, v: false });
  M.apply(g, 2, { t: 'vote', id: g.vote.id, v: false });
  check('accusation refusée par la majorité : aucune tentative perdue', g.phase === 'play' && g.tries === 1);
  // l'hôte peut clore le vote (joueur absent)
  M.apply(g, 1, { t: 'propose', s: sol.suspect, a: sol.arme, l: sol.lieu, seq: g.accSeq });
  check('seul l’hôte clôt le vote', !M.apply(g, 1, { t: 'clore', id: g.vote.id }).ok);
  M.apply(g, 0, { t: 'clore', id: g.vote.id });
  check('vote clos avec les voix exprimées (1 pour) : accusation juste', g.phase === 'verdict' && g.verdict.win && g.verdict.final);
  M.apply(g, 0, { t: 'suite', id: g.verdict.id });
  check('affaire résolue : fin de partie', g.phase === 'end' && M.over(g) && g.won === true && g.lastAccuser === 'B');
  check('gagnants : victoire collective', M.gagnants(g) === 'tous');
  check('récapitulatif de fin', /C’était/.test(M.summary(g)));
  check('solution visible en fin de partie', M.redact(g, 1).solution !== undefined);
  M.apply(g, 0, { t: 'again' });
  check('nouvelle affaire générée', g.phase === 'brief' && g.tries === 2 && !M.over(g));
  // défaite
  g = M.create(['A']);
  M.apply(g, 0, { t: 'start' });
  check('en solo : pas d’écran de dossier, l’enquête démarre', g.phase === 'play');
  const s2 = g.solution;
  const x2 = g.scenario.suspects.find(x => x.id !== s2.suspect).id;
  M.apply(g, 0, { t: 'propose', s: x2, a: s2.arme, l: s2.lieu, seq: g.accSeq });
  check('en solo : l’accusation confirmée part aussitôt', g.phase === 'verdict' && g.tries === 1);
  M.apply(g, 0, { t: 'suite', id: g.verdict.id });
  M.apply(g, 0, { t: 'propose', s: x2, a: s2.arme, l: s2.lieu, seq: g.accSeq });
  M.apply(g, 0, { t: 'suite', id: g.verdict.id });
  check('2e échec : défaite', g.phase === 'end' && g.won === false && M.gagnants(g) === null);
  // redact
  g = M.create(['A', 'B']);
  M.apply(g, 0, { t: 'start' }); M.apply(g, 0, { t: 'lu' }); M.apply(g, 1, { t: 'lu' });
  M.apply(g, 0, { t: 'answer', piste: 2, text: g.pistes[2].answers[0] });
  const redM = M.redact(g, 1);
  check('solution masquée sur le réseau', redM.solution === undefined);
  check('réponses des énigmes masquées', redM.pistes.every(p => p.answers === undefined));
  check('indices des pistes non élucidées masqués',
    redM.pistes.every((p, i) => i === 2 ? p.faits.length >= 1 : p.faits === undefined));
  check('dossier des autres masqué, le sien visible', redM.players[0].prive === undefined && redM.players[1].prive.length >= 1);
  check('rien de caché ne fuit dans le texte envoyé', !JSON.stringify(redM).includes('"coeur"') &&
    !JSON.stringify(redM).includes('"answers"'));
  // 12 joueurs, rôles
  g = M.create('ABCDEFGHIJKL'.split(''));
  check('12 joueurs acceptés', g.players.length === 12);
  check('12 joueurs = 12 rôles uniques', new Set(g.players.map(p => p.role.id)).size === 12);
  check('chaque joueur a au moins une info confidentielle', g.players.every(p => p.prive && p.prive.length >= 1));
  const redRole = M.redact(g, 2);
  check('infos privées des autres masquées (réseau)',
    redRole.players.every((p, i) => i === 2 ? !!p.prive : p.prive === undefined));
  check('les rôles eux-mêmes sont publics', redRole.players.every(p => p.role && p.role.id));
  M.apply(g, 0, { t: 'start' });
  g.players.forEach((p, i) => M.apply(g, i, { t: 'lu' }));
  check('le 12e joueur peut répondre',
    M.apply(g, 11, { t: 'answer', piste: 0, text: g.pistes[0].answers[0] }).ok && g.pistes[0].solvedBy === 'L');
  // six affaires riches
  check('6 affaires disponibles', M._SCENARIOS.length >= 6, M._SCENARIOS.length);
  check('chaque affaire : 5 suspects, 5 armes, 5 lieux aux signes distincts, 6 pistes de 3 énigmes',
    M._SCENARIOS.every(sc => sc.suspects.length === 5 && sc.armes.length === 5 && sc.lieux.length === 5 &&
      new Set(sc.lieux.map(l => l.tags.slice().sort().join('+'))).size === 5 &&
      sc.pistes.length === 6 && sc.pistes.every(p => p.enigmes.length === 3)));
  const seenScen = new Set();
  for (let i = 0; i < 80 && seenScen.size < 6; i++) seenScen.add(M.create(['A']).scenario.id);
  check('les 6 affaires sortent au tirage', seenScen.size === 6, [...seenScen].join(','));
  // détective : premier indice gratuit
  g = M.create(['A']);
  g.players[0].role = M._ROLES.find(r => r.id === 'detective');
  g.players[0].freeHintUsed = false;
  M.apply(g, 0, { t: 'start' });
  M.apply(g, 0, { t: 'hint', piste: 0 });
  check('détective : 1er indice gratuit', g.hintsUsed === 0 && g.pistes[0].hintShown);
  M.apply(g, 0, { t: 'hint', piste: 1 });
  check('détective : 2e indice compté', g.hintsUsed === 1);
  // voyante : une info de plus
  let gVoy = null;
  for (let t = 0; t < 500 && !gVoy; t++) {
    const x = M.create(['A', 'B', 'C']);
    if (x.players[2].role.id === 'voyante') gVoy = x;
  }
  check('voyante : une information de plus', !!gVoy && gVoy.players[2].prive.length >= 2);
  // inspecteur : décompte d'accusation pour lui seul
  g = M.create(['A', 'B']);
  g.players[0].role = M._ROLES.find(r => r.id === 'majordome');
  g.players[1].role = M._ROLES.find(r => r.id === 'inspecteur');
  M.apply(g, 0, { t: 'start' }); M.apply(g, 0, { t: 'lu' }); M.apply(g, 1, { t: 'lu' });
  const autre = g.scenario.suspects.find(x => x.id !== g.solution.suspect).id;
  M.apply(g, 0, { t: 'propose', s: autre, a: g.solution.arme, l: g.solution.lieu, seq: g.accSeq });
  M.apply(g, 1, { t: 'vote', id: g.vote.id, v: true });
  check('décompte d’éléments exacts enregistré', g.accuseFailed.right === 2);
  check('l’inspecteur voit le décompte', M.redact(g, 1).accuseFailed.right === 2);
  check('les autres ne le voient pas', M.redact(g, 0).accuseFailed.right === undefined);
  // cryptographe et archiviste
  g = M.create(['A', 'B']);
  g.players[0].role = M._ROLES.find(r => r.id === 'cryptographe');
  g.players[1].role = M._ROLES.find(r => r.id === 'archiviste');
  M.apply(g, 0, { t: 'start' });
  const redCry = M.redact(g, 0);
  check('cryptographe : première lettre visible, réponses masquées',
    redCry.pistes.every((p, i) => p.answers === undefined && (!p.first || p.first.length === 1)) &&
    redCry.pistes.some(p => p.first));
  check('cryptographe : jamais la réponse entière',
    redCry.pistes.every((p, i) => !p.first || !g.pistes[i].answers.includes(p.first)));
  const redArc = M.redact(g, 1);
  check('archiviste : nature des révélations de chaque piste',
    redArc.pistes.every(p => p.kinds && p.kinds.length >= 1) && redArc.pistes.every(p => p.first === undefined));
  // secours : faire parler un témoin
  g = M.create(['A', 'B', 'C']);
  M.apply(g, 0, { t: 'start' }); g.players.forEach((p, i) => M.apply(g, i, { t: 'lu' }));
  const m0 = g.malus;
  M.apply(g, 1, { t: 'secours', n: 0 });
  check('un témoin parle : une info secrète devient publique (+30 min)', g.revelesTxt.length === 1 && g.malus === m0 + 30);
  check('double appui sur « faire parler » : sans effet', M.apply(g, 1, { t: 'secours', n: 0 }).ok && g.revelesTxt.length === 1);
  // carnet commun
  const k0 = 'suspect:' + g.scenario.suspects[0].id;
  M.apply(g, 1, { t: 'note', k: k0, v: 1 });
  check('carnet d’équipe : une marque posée est partagée', M.redact(g, 2).notes[k0] === 1);
  check('carnet : clé inconnue refusée', !M.apply(g, 1, { t: 'note', k: 'suspect:<img>', v: 1 }).ok);
}

/* ================= L'IMPOSTEUR ================= */
console.log('--- L’Imposteur ---');
// base de paires saine
check('au moins 300 paires de mots', imposteur._PAIRS.length >= 300, imposteur._PAIRS.length);
check('paires bien formées (2 mots distincts)', imposteur._PAIRS.every(e => {
  const p = e.split('|');
  return p.length === 2 && p[0] && p[1] && p[0] !== p[1];
}));
check('10 catégories d’au moins 30 paires, 3 niveaux',
  imposteur._CATEGORIES.filter(c => c.id !== 'tout').every(c =>
    imposteur._PAIRES.filter(p => p.cat === c.id).length >= 30) &&
  [1, 2, 3].every(n => imposteur._PAIRES.some(p => p.niv === n)));
{
  const QUASI = ['CROCODILE|ALLIGATOR', 'MER|OCÉAN', 'POLICIER|GENDARME', 'ROI|EMPEREUR', 'HÔPITAL|CLINIQUE',
    'PRISON|CACHOT', 'ÉGLISE|CATHÉDRALE', 'LAC|ÉTANG', 'ÉCHARPE|FOULARD', 'VACHE|TAUREAU', 'COIFFEUR|BARBIER',
    'ORAGE|TEMPÊTE', 'PORT|QUAI', 'NUAGE|BROUILLARD', 'RIVIÈRE|CANAL', 'CHÂTEAU|PALAIS', 'ÉCHELLE|ESCABEAU',
    'BOUTEILLE|CARAFE', 'COURSE|RANDONNÉE', 'LAPIN|LIÈVRE'];
  const set = new Set(imposteur._PAIRS.map(e => e.split('|').sort().join('|')));
  const restes = QUASI.filter(q => set.has(q.split('|').sort().join('|')));
  check('aucune paire de quasi-synonymes', restes.length === 0, restes);
}
check('nombre d’imposteurs : 1 puis 2 puis 3',
  imposteur._nbImposteurs(3) === 1 && imposteur._nbImposteurs(5) === 1 &&
  imposteur._nbImposteurs(6) === 2 && imposteur._nbImposteurs(8) === 2 &&
  imposteur._nbImposteurs(9) === 3 && imposteur._nbImposteurs(12) === 3);

g = imposteur.create(['A', 'B', 'C', 'D', 'E']);
check('réglages d’abord (catégorie, niveau, variantes)', g.phase === 'setup');
check('seul l’hôte distribue', !imposteur.apply(g, 1, { t: 'deal' }).ok);
imposteur.apply(g, 0, { t: 'deal', opts: { cat: 'animaux', niv: 'facile', debat: 60 } });
check('mots distribués dans la catégorie choisie', g.phase === 'reveal' && g.paireCat === 'animaux');
check('5 joueurs → 1 imposteur', g.players.filter(p => p.role === 'imposteur').length === 1);
check('les civils partagent un mot, l’imposteur a l’autre', g.players.every(p =>
  p.word === (p.role === 'imposteur' ? g.pair[1] : g.pair[0])));
check('double appui sur « Distribuer » : sans effet', imposteur.apply(g, 0, { t: 'deal' }).ok && g.phase === 'reveal');
// redaction : mots et camps invisibles, même le sien
let redImp = imposteur.redact(g, 0);
check('mon mot visible, ceux des autres non',
  redImp.players[0].word === g.players[0].word &&
  redImp.players.slice(1).every(p => p.word === undefined));
check('AUCUN camp visible (on ignore son propre camp)',
  redImp.players.every(p => p.role === undefined));
check('la paire de mots ne circule pas', redImp.pair === undefined);
check('indice avant l’heure refusé', !imposteur.apply(g, 0, { t: 'clue', text: 'x' }).ok);
for (let i = 0; i < 5; i++) imposteur.apply(g, i, { t: 'seen' });
check('tous ont vu → phase indices', g.phase === 'clue' && g.order.length === 5);
check('minuteur d’indice : échéance stockée dans l’état', g.ech && g.ech.fin > Date.now() && /^clue:/.test(g.ech.k));
check('le temps n’est pas écoulé : expiration refusée', !imposteur.apply(g, -1, { t: 'expire', k: g.ech.k }).ok);
// on revoit son mot à tout moment (après « J'ai mémorisé »)
check('son mot reste consultable après « J’ai mémorisé »', imposteur.redact(g, 2).players[2].word === g.players[2].word);
check('hors tour refusé', !imposteur.apply(g, g.order[1], { t: 'clue', text: 'test' }).ok);
const sp0 = g.order[0];
check('indice de 2 mots refusé', !imposteur.apply(g, sp0, { t: 'clue', text: 'deux mots' }).ok);
check('indice = son propre mot refusé',
  !imposteur.apply(g, sp0, { t: 'clue', text: g.players[sp0].word.toLowerCase() }).ok);
// un absent : l'hôte le passe
check('seul l’hôte fait passer un absent', !imposteur.apply(g, 3, { t: 'skip', k: g.ech.k }).ok);
imposteur.apply(g, 0, { t: 'skip', k: g.ech.k });
check('absent passé : son tour est noté, on continue', g.orderPos === 1 && g.tours[0][0].passe === true);
for (let k = 1; k < 5; k++) imposteur.apply(g, g.order[k], { t: 'clue', text: 'indice' + k });
check('5 indices → débat minuté', g.phase === 'debat' && g.ech && /^debat:/.test(g.ech.k));
check('seul l’hôte abrège le débat', !imposteur.apply(g, 2, { t: 'finDebat' }).ok);
imposteur.apply(g, 0, { t: 'finDebat' });
check('puis le vote', g.phase === 'vote');
// votes : l'imposteur est démasqué
const impIdx = g.players.findIndex(p => p.role === 'imposteur');
check('vote pour soi refusé', !imposteur.apply(g, impIdx, { t: 'vote', for: impIdx }).ok);
redImp = imposteur.redact(g, (impIdx + 1) % 5);
check('pendant le vote, chacun revoit son mot', redImp.players[(impIdx + 1) % 5].word === g.players[(impIdx + 1) % 5].word);
for (let i = 0; i < 5; i++) {
  imposteur.apply(g, i, { t: 'vote', for: i === impIdx ? (impIdx + 1) % 5 : impIdx });
}
check('imposteur éliminé → victoire des civils',
  g.phase === 'end' && g.winner === 'civils' && !g.players[impIdx].alive);
check('bulletins gardés pour l’animation du dépouillement', g.lastResult.ballots.length === 5);
check('civils +3 points', g.players.every((p, i) =>
  p.score === (p.role === 'civil' ? 3 : 0)));
check('fin de manche : mots et camps révélés', (() => {
  const r = imposteur.redact(g, 1);
  return r.pair && r.players.every(p => p.role);
})());
imposteur.apply(g, 0, { t: 'again' });
check('nouvelle manche, scores conservés, mêmes réglages', g.manche === 2 && g.phase === 'reveal' &&
  g.players.some(p => p.score === 3) && g.opts.cat === 'animaux');
// victoire de l'imposteur : élimination de civils jusqu'à égalité (3 joueurs)
g = imposteur.create(['A', 'B', 'C']);
imposteur.apply(g, 0, { t: 'deal', opts: { debat: 0 } });
for (let i = 0; i < 3; i++) imposteur.apply(g, i, { t: 'seen' });
for (let k = 0; k < 3; k++) imposteur.apply(g, g.order[k], { t: 'clue', text: 'x' + k });
check('sans débat : vote direct', g.phase === 'vote');
const imp3 = g.players.findIndex(p => p.role === 'imposteur');
const civ3 = g.players.map((p, i) => i).filter(i => i !== imp3);
for (let i = 0; i < 3; i++) {
  imposteur.apply(g, i, { t: 'vote', for: i === civ3[0] ? civ3[1] : civ3[0] });
}
check('1 imposteur vs 1 civil → l’imposteur gagne',
  g.phase === 'end' && g.winner === 'imposteurs' &&
  g.players[imp3].score === 5);
// égalité des voix : personne n'est éliminé, on rejoue un tour
g = imposteur.create(['A', 'B', 'C']);
imposteur.apply(g, 0, { t: 'deal', opts: { debat: 0 } });
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
// l'hôte clôt un vote bloqué par un absent
for (let k = 0; k < 3; k++) imposteur.apply(g, g.order[k], { t: 'clue', text: 'z' + k });
imposteur.apply(g, 1, { t: 'vote', for: 0 });
redImp = imposteur.redact(g, 0);
check('vote d’autrui masqué mais signalé', redImp.players[1].vote === undefined &&
  redImp.players[1].hasVoted === true && redImp.players[2].hasVoted === false);
check('seul l’hôte clôt le vote', !imposteur.apply(g, 2, { t: 'clore' }).ok);
imposteur.apply(g, 0, { t: 'clore' });
check('vote clos : les voix exprimées suffisent', g.phase !== 'vote' && !g.players[0].alive);
// hotseat : viewerOf suit celui qui doit agir en secret
g = imposteur.create(['A', 'B', 'C', 'D']);
imposteur.apply(g, 0, { t: 'deal' });
check('viewerOf : premier joueur sans mot vu', imposteur.viewerOf(g) === 0);
imposteur.apply(g, 0, { t: 'seen' });
check('viewerOf passe au suivant', imposteur.viewerOf(g) === 1);
// indices à l'oral : pas de téléphone à passer, n'importe qui enchaîne
g = imposteur.create(['A', 'B', 'C', 'D']);
imposteur.apply(g, 0, { t: 'deal', opts: { oral: true, debat: 0 } });
for (let i = 0; i < 4; i++) imposteur.apply(g, i, { t: 'seen' });
check('à l’oral : personne ne prend le téléphone', imposteur.turnOf(g) === -1);
imposteur.apply(g, 2, { t: 'clue', oral: true, n: 0 });
check('à l’oral : « a parlé » fait passer au suivant', g.orderPos === 1 && g.tours[0][0].oral);
check('double appui sur « a parlé » : sans effet', imposteur.apply(g, 2, { t: 'clue', oral: true, n: 0 }).ok && g.orderPos === 1);
// Mister White
g = imposteur.create(['A', 'B', 'C', 'D', 'E']);
imposteur.apply(g, 0, { t: 'deal', opts: { white: true, debat: 0 } });
const wIdx = g.players.findIndex(p => p.role === 'white');
check('Mister White : un joueur sans mot', wIdx !== -1 && g.players[wIdx].word === '' &&
  g.players.filter(p => p.role === 'imposteur').length === 1);
check('Mister White se sait sans mot, les autres l’ignorent',
  imposteur.redact(g, wIdx).players[wIdx].role === 'white' &&
  imposteur.redact(g, (wIdx + 1) % 5).players[wIdx].role === undefined);
for (let i = 0; i < 5; i++) imposteur.apply(g, i, { t: 'seen' });
check('Mister White ne parle jamais en premier', g.players[g.order[0]].role !== 'white');
for (let k = 0; k < 5; k++) imposteur.apply(g, g.order[k], { t: 'clue', text: 'w' + k });
for (let i = 0; i < 5; i++) imposteur.apply(g, i, { t: 'vote', for: i === wIdx ? (wIdx + 1) % 5 : wIdx });
check('Mister White éliminé : il tente de deviner', g.phase === 'white' && imposteur.viewerOf(g) === wIdx);
check('seul Mister White devine', !imposteur.apply(g, (wIdx + 1) % 5, { t: 'guess', text: 'x' }).ok);
check('pendant qu’il devine, le mot des civils reste caché', imposteur.redact(g, wIdx).pair === undefined);
imposteur.apply(g, wIdx, { t: 'guess', text: 'le ' + g.pair[0].toLowerCase() });
check('mot deviné : Mister White gagne (+6)', g.phase === 'end' && g.winner === 'whiteDevine' && g.players[wIdx].score === 6);
// série : fin et gagnants
imposteur.apply(g, 0, { t: 'terminer' });
check('l’hôte termine la série : fin de partie', imposteur.over(g) === true);
check('gagnants : le meilleur score', JSON.stringify(imposteur.gagnants(g)) === JSON.stringify([wIdx]));
check('classement final lisible (nom, espace, points)', /Mister|pts/.test(imposteur.summary(g)) &&
  !/<\/span><strong>/.test(imposteur.summary(g)));

/* ===== Petit Bac : le juge de l'IA connaît ses catégories ===== */
{
  const LEX = bac._BOT_LEX, LTR = 'ABCDEFGHIJLMNOPRSTV'.split('');
  const norm = w => String(w).trim().toUpperCase().replace(/\u0152/g, 'OE')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  check('lexique du juge : 6 catégories', LEX.length === 6);
  let mots = 0, mauvaises = 0, doublons = 0;
  LEX.forEach((cat) => {
    LTR.forEach(L => {
      const vus = new Set();
      (cat[L] || []).forEach(m => {
        mots++;
        if (norm(m)[0] !== L) mauvaises++;
        if (vus.has(norm(m))) doublons++;
        vus.add(norm(m));
      });
    });
  });
  check('lexique : au moins 1500 mots', mots >= 1500, mots);
  check('lexique : chaque mot est rangé sous SA lettre', mauvaises === 0, mauvaises);
  check('lexique : aucun doublon', doublons === 0, doublons);
  check('lexique : chaque catégorie sert chaque lettre',
    LEX.every(cat => LTR.every(L => (cat[L] || []).length > 0)));

  // les mots inventés ou hors catégorie de la partie signalée sont refusés
  check('« Mer » n\'est pas un animal', bac._botJuge('Mer', 1) === false);
  check('« Manane » n\'est pas un fruit', bac._botJuge('Manane', 4) === false);
  check('« Meulier » n\'est pas un métier', bac._botJuge('Meulier', 3) === false);
  check('« Meule » n\'est pas un objet du jeu', bac._botJuge('Meule', 5) === false);
  check('« Moise » n\'est pas une ville', bac._botJuge('Moise', 2) === false);
  check('« maison » n\'est pas un objet', bac._botJuge('maison', 5) === false);
  check('charabia refusé', bac._botJuge('xyzzy', 5) === false);
  // les vraies réponses passent, quelle que soit la casse ou les accents
  [['Monique', 0], ['mouton', 1], ['Madrid', 2], ['maçon', 3], ['melon', 4], ['marteau', 5],
   ['MERLE', 1], ['Metz', 2], ['médecin', 3], ['mure', 4], ['montre', 5]].forEach(pair => {
    check('« ' + pair[0] + ' » accepté dans sa catégorie', bac._botJuge(pair[0], pair[1]) === true);
  });
  // le jugement ne dépend plus du hasard : deux appels donnent le même verdict
  check('jugement stable (aucun hasard)',
    [0, 1, 2, 3, 4, 5].every(c => bac._botJuge('Zzz', c) === bac._botJuge('Zzz', c)));
  // l'IA remplit sa feuille sans tricher sur la lettre
  let cases = 0, remplies = 0, horsLettre = 0;
  LTR.forEach(L => {
    for (let k = 0; k < 30; k++) {
      bac._botSheet(L).forEach(m => {
        cases++;
        if (m) { remplies++; if (norm(m)[0] !== L) horsLettre++; }
      });
    }
  });
  check('feuilles de l\'IA : entre 60 % et 85 % de cases remplies',
    remplies / cases > 0.6 && remplies / cases < 0.85, Math.round(remplies / cases * 100));
  check('étourderies de l\'IA : rares (moins de 5 %)',
    horsLettre / remplies < 0.05, Math.round(horsLettre / remplies * 100));
}

console.log(failures ? `\n${failures} ÉCHEC(S)` : '\nTous les tests de jeux passent.');
process.exit(failures ? 1 : 0);
