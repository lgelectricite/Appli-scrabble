const ROOT = require('path').join(__dirname, '..');
/* Tests : Quiz, Le Plus Proche, 8 américain. */
require(ROOT + '/js/games/registry.js');
const quiz = require(ROOT + '/js/games/quiz.js');
const proche = require(ROOT + '/js/games/proche.js');
const huit = require(ROOT + '/js/games/huit.js');

let failures = 0;
function check(n, c, e) {
  if (c) console.log('  OK  ' + n);
  else { failures++; console.log('  FAIL ' + n + (e !== undefined ? ' -> ' + JSON.stringify(e) : '')); }
}

/* ================= QUIZ ================= */
console.log('--- Quiz ---');
check('banque : au moins 200 questions', quiz._BANK.length >= 200, quiz._BANK.length);
check('banque : format 5 champs partout', quiz._BANK.every(e => e.split('|').length === 5));
check('banque : pas de doublon de question',
  new Set(quiz._BANK.map(e => e.split('|')[0])).size === quiz._BANK.length);
check('banque : leurres distincts de la bonne réponse', quiz._BANK.every(e => {
  const p = e.split('|');
  return new Set([p[1], p[2], p[3], p[4]]).size === 4;
}));
let g = quiz.create(['A', 'B', 'C']);
check('10 questions tirées', g.qs.length === 10, g.qs.length);
check('la bonne réponse est bien indexée', g.qs.every(q => {
  const src = quiz._BANK.find(e => e.split('|')[0] === q.q);
  return src && q.choices[q.correct] === src.split('|')[1] && q.choices.length === 4;
}));
// B répond juste en premier, A faux, C juste
const correct0 = g.qs[0].correct;
quiz.apply(g, 1, { t: 'answer', i: correct0 });
check('re-réponse refusée', !quiz.apply(g, 1, { t: 'answer', i: 0 }).ok);
// redact pendant la question : rien ne fuit
let red = quiz.redact(g, 0);
check('bonnes réponses masquées', red.qs.every(q => q.correct === undefined));
check('réponse d’autrui masquée, drapeau visible',
  red.players[1].answer === undefined && red.players[1].hasAnswered === true);
check('aucun point avant la révélation', g.players[1].score === 0);
quiz.apply(g, 0, { t: 'answer', i: (correct0 + 1) % 4 });
quiz.apply(g, 2, { t: 'answer', i: correct0 });
check('révélation après la dernière réponse', g.phase === 'reveal' && g.reveal.correct === correct0);
check('points : +15 premier bon, +10 second bon, 0 mauvais',
  g.players[1].score === 15 && g.players[2].score === 10 && g.players[0].score === 0,
  g.players.map(p => p.score));
check('révélation visible sur le réseau', quiz.redact(g, 0).reveal.correct === correct0);
check('seul l’hôte enchaîne', !quiz.apply(g, 1, { t: 'next' }).ok);
quiz.apply(g, 0, { t: 'next' });
check('question suivante, réponses remises à zéro',
  g.idx === 1 && g.phase === 'question' && g.players.every(p => p.answer === -1));
// hotseat : le viewer tourne avec la question
check('viewerOf tourne avec la question', quiz.viewerOf(g) === 1 % 3);
// on termine la partie
for (let qn = g.idx; qn < g.qs.length; qn++) {
  for (let pl = 0; pl < 3; pl++) quiz.apply(g, pl, { t: 'answer', i: g.qs[qn].correct });
  quiz.apply(g, 0, { t: 'next' });
}
check('partie finie après la 10e question', g.finished === true && quiz.over(g));
check('classement affiché', /🏆/.test(quiz.summary(g)));

/* ================= LE PLUS PROCHE ================= */
console.log('--- Le Plus Proche ---');
check('banque : au moins 80 questions', proche._BANK.length >= 80, proche._BANK.length);
check('banque : nombres entiers valides', proche._BANK.every(e => {
  const p = e.split('|');
  return p.length === 3 && /^\d+$/.test(p[1]);
}));
check('banque : pas de doublon',
  new Set(proche._BANK.map(e => e.split('|')[0])).size === proche._BANK.length);
g = proche.create(['A', 'B']);
check('8 manches tirées', g.qs.length === 8, g.qs.length);
const a0 = g.qs[0].a;
check('estimation invalide refusée', !proche.apply(g, 0, { t: 'guess', n: 'abc' }).ok);
proche.apply(g, 0, { t: 'guess', n: String(a0) });      // exact
red = proche.redact(g, 1);
check('réponses masquées pendant la manche',
  red.qs.every(q => q.a === undefined) && red.players[0].guess === undefined &&
  red.players[0].hasGuessed === true);
proche.apply(g, 1, { t: 'guess', n: String(a0 + 10) }); // à 10
check('révélation : exact +5, l’autre 0',
  g.phase === 'reveal' && g.players[0].score === 5 && g.players[1].score === 0 &&
  g.reveal.exact === true && g.reveal.winners.join() === '0');
proche.apply(g, 0, { t: 'next' });
// égalité : mêmes distances
const a1 = g.qs[1].a;
proche.apply(g, 0, { t: 'guess', n: String(a1 + 5) });
proche.apply(g, 1, { t: 'guess', n: String(a1 - 5) });
check('égalité : +3 chacun', g.players[0].score === 8 && g.players[1].score === 3);
for (let m = g.idx; m < g.qs.length; m++) {
  if (g.phase === 'reveal') proche.apply(g, 0, { t: 'next' });
  if (g.finished) break;
  proche.apply(g, 0, { t: 'guess', n: '1' });
  proche.apply(g, 1, { t: 'guess', n: '2' });
}
if (g.phase === 'reveal') proche.apply(g, 0, { t: 'next' });
check('partie finie après 8 manches', g.finished === true);

/* ================= 8 AMÉRICAIN ================= */
console.log('--- 8 américain ---');
g = huit.create(['A', 'B']);
check('2 joueurs : 7 cartes chacun', g.players.every(p => p.hand.length === 7));
check('première carte visible ≠ 8', g.discard[0].r !== '8');
check('52 cartes en tout', g.pile.length + 14 + 1 === 52, g.pile.length);
g = huit.create(['A', 'B', 'C', 'D']);
check('4 joueurs : 5 cartes chacun', g.players.every(p => p.hand.length === 5));
check('hors tour refusé', !huit.apply(g, (g.current + 1) % 4, { t: 'draw' }).ok);
// main truquée pour tester les effets
g = huit.create(['A', 'B', 'C']);
g.current = 0; g.dir = 1;
g.discard = [{ r: '5', s: '♠' }];
g.players[0].hand = [{ r: '5', s: '♥' }, { r: 'V', s: '♠' }, { r: 'A', s: '♠' },
  { r: '2', s: '♠' }, { r: '8', s: '♦' }, { r: '9', s: '♦' }];
check('carte injouable refusée (9♦ sur 5♠)', !huit.apply(g, 0, { t: 'play', i: 5 }).ok);
check('même valeur acceptée (5♥ sur 5♠)', huit.apply(g, 0, { t: 'play', i: 0 }).ok);
check('le tour passe', g.current === 1);
// Valet : saute un joueur
g.current = 0; g.discard.push({ r: '7', s: '♠' });
huit.apply(g, 0, { t: 'play', i: 0 }); // V♠ sur 7♠
check('valet : saute le joueur suivant', g.current === 2, g.current);
// As : change le sens
g.current = 0; g.dir = 1; g.discard.push({ r: '3', s: '♠' });
huit.apply(g, 0, { t: 'play', i: 0 }); // A♠
check('as : sens inversé', g.dir === -1 && g.current === 2, [g.dir, g.current]);
// 2 : pioche cumulable
g.current = 0; g.dir = 1; g.discard.push({ r: '6', s: '♠' });
huit.apply(g, 0, { t: 'play', i: 0 }); // 2♠
check('2 : +2 en attente', g.pending2 === 2 && g.current === 1);
g.players[1].hand.unshift({ r: '2', s: '♥' });
huit.apply(g, 1, { t: 'play', i: 0 }); // 2♥ empilé
check('2 empilé : +4 en attente', g.pending2 === 4 && g.current === 2);
const before2 = g.players[2].hand.length;
check('seul un 2 est jouable sous pénalité',
  !huit.apply(g, 2, { t: 'play', i: g.players[2].hand.findIndex(c => c.r !== '2' && c.r !== '8') }).ok ||
  g.players[2].hand.every(c => c.r === '2' || c.r === '8'));
huit.apply(g, 2, { t: 'draw' });
check('pioche de pénalité : +4 cartes et tour passé',
  g.players[2].hand.length === before2 + 4 && g.pending2 === 0 && g.current === 0);
// 8 : couleur obligatoire
g.current = 0;
g.players[0].hand = [{ r: '8', s: '♦' }, { r: '9', s: '♦' }];
check('8 sans couleur refusé', !huit.apply(g, 0, { t: 'play', i: 0 }).ok);
check('8 avec couleur accepté', huit.apply(g, 0, { t: 'play', i: 0, suit: '♥' }).ok);
check('couleur imposée retenue', g.chosenSuit === '♥');
check('la couleur imposée s’applique',
  huit._playable(g, { r: '4', s: '♥' }) && !huit._playable(g, { r: '4', s: '♠' }));
// pioche simple puis passe
g.current = 1; g.hasDrawn = false;
check('passer sans piocher refusé', !huit.apply(g, 1, { t: 'pass' }).ok);
const b1 = g.players[1].hand.length;
huit.apply(g, 1, { t: 'draw' });
check('pioche : +1 carte, on reste au joueur', g.players[1].hand.length === b1 + 1 && g.current === 1);
check('seconde pioche refusée', !huit.apply(g, 1, { t: 'draw' }).ok);
huit.apply(g, 1, { t: 'pass' });
check('passe après pioche', g.current === 2);
// victoire et score
g = huit.create(['A', 'B']);
g.current = 0;
g.discard = [{ r: '5', s: '♠' }];
g.players[0].hand = [{ r: '5', s: '♦' }];
g.players[1].hand = [{ r: '8', s: '♠' }, { r: 'R', s: '♥' }, { r: '7', s: '♣' }, { r: 'A', s: '♦' }];
huit.apply(g, 0, { t: 'play', i: 0 });
check('main vide : manche gagnée', g.finished && g.winner === 0);
check('score = 50+10+7+1 = 68', g.players[0].score === 68, g.players[0].score);
check('nouvelle manche réservée à l’hôte', !huit.apply(g, 1, { t: 'again' }).ok);
huit.apply(g, 0, { t: 'again' });
check('redistribution, scores conservés', g.manche === 2 && !g.finished &&
  g.players[0].score === 68 && g.players.every(p => p.hand.length === 7));
// redact : mains et pioche secrètes
const redH = huit.redact(g, 0);
check('ma main visible, la sienne non',
  Array.isArray(redH.players[0].hand) && redH.players[1].hand === undefined &&
  redH.players[1].cards === 7);
check('pioche cachée (seul le compte circule)',
  redH.pile === undefined && typeof redH.pileCount === 'number' && redH.discard.length === 1);
// rebattage quand la pioche est vide
g = huit.create(['A', 'B']);
g.discard = g.discard.concat(g.pile.splice(0, g.pile.length)); // pioche vidée
const totalBefore = g.discard.length + g.players[0].hand.length + g.players[1].hand.length;
const got = huit._drawCards(g, 0, 2);
check('défausse rebattue pour repiocher', got === 2 && g.discard.length === 1 &&
  g.discard.length + g.pile.length + g.players[0].hand.length + g.players[1].hand.length === totalBefore);

console.log(failures ? failures + ' ÉCHEC(S)' : '\nTests nouveaux jeux OK.');
process.exit(failures ? 1 : 0);
