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
check('banque : au moins 1000 questions', quiz._BANK.length >= 1000, quiz._BANK.length);
check('thèmes : au moins 6 thèmes fournis (50+ questions chacun)',
  quiz._THEMES.filter(t => t.id !== 'melange' && quiz._themeCount(t.id) >= 50).length >= 6,
  quiz._THEMES.map(t => t.id + ':' + quiz._themeCount(t.id)).join(' '));
check('banque : format 5 ou 6 champs partout', quiz._BANK.every(e => {
  const n = e.split('|').length;
  return n === 5 || n === 6;
}));
check('banque : pas de doublon de question',
  new Set(quiz._BANK.map(e => e.split('|')[0])).size === quiz._BANK.length);
check('banque : leurres distincts de la bonne réponse', quiz._BANK.every(e => {
  const p = e.split('|');
  return new Set([p[1], p[2], p[3], p[4]]).size === 4;
}));
let g = quiz.create(['A', 'B', 'C']);
check('phase de choix du thème', g.phase === 'setup');
check('thème réservé à l’hôte', !quiz.apply(g, 1, { t: 'theme', th: 'melange' }).ok);
check('réponse avant le thème refusée', !quiz.apply(g, 0, { t: 'answer', i: 0 }).ok);
quiz.apply(g, 0, { t: 'theme', th: 'melange' });
check('10 questions tirées', g.qs.length === 10 && g.phase === 'question', g.qs.length);
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
// thèmes : chaque thème listé a assez de questions ou est refusé proprement
quiz._THEMES.forEach(t => {
  if (t.id === 'melange') return;
  const n = quiz._themeCount(t.id);
  if (n >= 10) {
    const x = quiz.create(['A']);
    const rr = quiz.apply(x, 0, { t: 'theme', th: t.id });
    if (!(rr.ok && x.qs.length === 10)) { failures++; console.log('  FAIL thème ' + t.id); }
  }
});
check('thèmes cohérents (tirage 10 questions par thème fourni)', true);
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

/* ================= MOTS FLÉCHÉS ================= */
console.log('--- Mots fléchés ---');
require(ROOT + '/js/games/croises.js');
require(ROOT + '/js/games/fleches-data.js');
const fleches = require(ROOT + '/js/games/fleches.js');
check('1000 grilles dans la base', GG.FLECHES_GRILLES.length === 1000, GG.FLECHES_GRILLES.length);
// intégrité : chaque grille se charge, croisements cohérents, définitions présentes
let flBad = 0, flDef = 0, flTotal = 0;
for (let f = 1; f <= 5; f++) {
  for (let gn = 0; gn < 200; gn++) {
    const grid = fleches._loadGrid(f, gn);
    if (!grid) { flBad++; continue; }
    const cellMap = {};
    for (const w of grid.words) {
      flTotal++;
      if (w.def && w.def !== 'Mot mystère…') flDef++;
      w.cells.forEach((c, k) => {
        if (c < 0 || c >= grid.size * grid.size) flBad++;
        if (cellMap[c] && cellMap[c] !== w.w[k]) flBad++;
        cellMap[c] = w.w[k];
      });
      if (!w.num) flBad++;
    }
  }
}
check('les 1000 grilles sont cohérentes (croisements, numéros)', flBad === 0, flBad);
check('aucune superposition colinéaire dans les 1000 grilles', (() => {
  for (let f2 = 1; f2 <= 5; f2++) for (let g2 = 0; g2 < 200; g2++) {
    const gr = fleches._loadGrid(f2, g2);
    for (let a2 = 0; a2 < gr.words.length; a2++) for (let b2 = a2 + 1; b2 < gr.words.length; b2++) {
      const A = gr.words[a2], B = gr.words[b2];
      if (A.dir === B.dir && A.cells.some(c => B.cells.includes(c))) return false;
    }
  }
  return true;
})());
check('chaque mot a sa définition (' + flTotal + ' mots)', flDef === flTotal);
check('les forces montent en taille', (() => {
  const t1 = fleches._loadGrid(1, 0), t5 = fleches._loadGrid(5, 0);
  return t1.size === 8 && t5.size === 12 && t1.words.length < t5.words.length;
})());
g = fleches.create(['A', 'B']);
check('phase de choix de la force', g.phase === 'setup');
check('force réservée à l’hôte', !fleches.apply(g, 1, { t: 'force', f: 1 }).ok);
fleches.apply(g, 0, { t: 'force', f: 2, g: 7 });
check('grille n°8 de force 2 chargée', g.force === 2 && g.gnum === 7 && g.words.length >= 7);
const fw = g.words[0];
check('mauvaise longueur refusée', !fleches.apply(g, 0, { t: 'claim', i: 0, text: 'X' }).ok);
fleches.apply(g, 1, { t: 'claim', i: 0, text: fw.w.toLowerCase() });
check('mot trouvé : points = longueur', fw.foundBy === 1 && g.players[1].points === fw.w.length);
const redF = fleches.redact(g, 0);
check('solutions non trouvées masquées (réseau)',
  redF.words.every((w, i) => i === 0 ? w.w === fw.w : w.w === undefined));
for (let i = 1; i < g.words.length; i++) fleches.apply(g, 0, { t: 'claim', i, text: g.words[i].w });
check('grille finie', g.finished === true && g.durationSec >= 1);


/* ================= BONBONS (match-3) ================= */
console.log('--- Bonbons ---');
const bonbons = require(ROOT + '/js/games/bonbons.js');
const BN = bonbons._N;
const mkCell = t => ({ t, s: 0 });
// grille de base sans aucun alignement : t = (ligne + 2*colonne) % 5
function safeBoard() {
  const b = new Array(BN * BN);
  for (let r = 0; r < BN; r++) for (let c = 0; c < BN; c++) b[r * BN + c] = mkCell((r + 2 * c) % 5);
  return b;
}
check('grille témoin sans alignement', bonbons._findRuns(safeBoard()).length === 0);

let bg = bonbons.create(['Ana', 'Bob']);
check('niveau réservé à l’hôte', bonbons.apply(bg, 1, { t: 'level', l: 'facile' }).ok === false);
check('niveau inconnu refusé', bonbons.apply(bg, 0, { t: 'level', l: 'sucre' }).ok === false);
bonbons.apply(bg, 0, { t: 'level', l: 'facile' });
check('64 bonbons servis, 25 coups', bg.players[0].board.length === 64 && bg.players[0].moves === 25);
check('grille de départ sans alignement', bonbons._findRuns(bg.players[0].board).length === 0);
check('même grille pour tous', JSON.stringify(bg.players[0].board) === JSON.stringify(bg.players[1].board));
check('au moins un coup jouable garanti', bonbons._hasMove(bg.players[0].board) === true);
check('échange non voisin refusé', bonbons.apply(bg, 0, { t: 'swap', a: 0, b: 9 }).ok === false);

// échange qui ne forme rien : refusé, aucun coup consommé
{
  const st = bonbons.create(['Solo']);
  bonbons.apply(st, 0, { t: 'level', l: 'facile' });
  st.players[0].board = safeBoard(); // aucun échange 0↔1 ne forme d'alignement ici
  const r = bonbons.apply(st, 0, { t: 'swap', a: 0, b: 1 });
  check('échange sans alignement refusé', r.ok === false && st.players[0].moves === 25);
}

// alignement de 3 : points, coup consommé, grille toujours pleine
{
  const st = bonbons.create(['Solo']);
  bonbons.apply(st, 0, { t: 'level', l: 'facile' });
  const b = safeBoard();
  // ligne 7 (en bas, loin des chutes) : XX.X → l'échange vertical amène le 3e
  b[56].t = 4; b[57].t = 4; b[59].t = 4; b[58].t = 0; b[50].t = 4;
  b[48].t = 1; b[49].t = 2; b[51].t = 2; // évite tout autre alignement
  st.players[0].board = b;
  if (bonbons._findRuns(b).length !== 0) { failures++; console.log('  FAIL grille du scénario 3-match déjà alignée'); }
  const ok = bonbons.apply(st, 0, { t: 'swap', a: 50, b: 58 });
  check('alignement de 3 accepté', ok.ok === true);
  check('au moins 30 points (3 × 10)', st.players[0].score >= 30, st.players[0].score);
  check('un coup consommé', st.players[0].moves === 24);
  check('la grille reste pleine (64 bonbons)', st.players[0].board.every(c => c && typeof c.t === 'number'));
}

// alignement de 4 : un bonbon rayé apparaît (sauf s'il part dans la cascade)
{
  const b = safeBoard();
  b[56].t = 4; b[57].t = 4; b[58].t = 4; b[59].t = 4; // 4 à l'horizontale, prêts
  const res = bonbons._resolve(b, 5, 57);
  check('4 alignés : au moins 40 points', res.pts >= 40, res.pts);
  check('4 alignés : bonbon rayé créé (ou déjà croqué en cascade)',
    b.some(c => c && c.s > 0) || res.combo > 1);
}

// alignement de 5 : le sucre magique apparaît
{
  const b = safeBoard();
  b[56].t = 4; b[57].t = 4; b[58].t = 4; b[59].t = 4; b[60].t = 4;
  const res = bonbons._resolve(b, 5, 58);
  check('5 alignés : sucre magique créé', b.some(c => c && c.t === -1));
  check('5 alignés : au moins 50 points', res.pts >= 50, res.pts);
}

// sucre magique échangé : toute la couleur y passe
{
  const st = bonbons.create(['Solo']);
  bonbons.apply(st, 0, { t: 'level', l: 'facile' });
  const b = safeBoard();
  b[0] = { t: -1, s: 0 }; // sucre magique dans le coin
  st.players[0].board = b;
  const cible = b[1].t;
  const avant = b.filter(c => c.t === cible).length;
  const ok = bonbons.apply(st, 0, { t: 'swap', a: 0, b: 1 });
  const gain = st.players[0].lastGain;
  check('sucre magique : échange accepté', ok.ok === true);
  check('sucre magique : toute la couleur croquée (' + avant + ' bonbons)',
    gain === avant * 15 || gain === (avant + 1) * 15, gain);
  check('sucre magique : coup consommé', st.players[0].moves === 24);
}

// grille morte détectée
{
  const dead = new Array(BN * BN);
  for (let r = 0; r < BN; r++) for (let c = 0; c < BN; c++) {
    dead[r * BN + c] = mkCell((r % 2) * 2 + (c % 2)); // damier 0101/2323 : aucun coup
  }
  check('grille morte : aucun coup détecté', bonbons._hasMove(dead) === false);
}

// course à deux : la partie se termine quand tout le monde a épuisé ses coups
{
  const st = bonbons.create(['Ana', 'Bob']);
  bonbons.apply(st, 0, { t: 'level', l: 'facile' });
  st.players.forEach(p => { p.moves = 1; });
  function findSwap(b) {
    for (let i = 0; i < BN * BN; i++) {
      if (b[i].t === -1) continue;
      const c = i % BN;
      if (c < BN - 1 && bonbons._wouldMatch(b, i, i + 1)) return [i, i + 1];
      if (i < BN * (BN - 1) && bonbons._wouldMatch(b, i, i + BN)) return [i, i + BN];
    }
    return null;
  }
  const s1 = findSwap(st.players[0].board);
  bonbons.apply(st, 0, { t: 'swap', a: s1[0], b: s1[1] });
  check('un joueur fini, l’autre pas : la course continue', st.finished === false);
  const s2 = findSwap(st.players[1].board);
  bonbons.apply(st, 1, { t: 'swap', a: s2[0], b: s2[1] });
  check('tous à court de coups : partie terminée', st.finished === true);
  check('classement au score avec 🏆', /🏆/.test(bonbons.summary(st)));
  check('rejouer après la fin refusé', bonbons.apply(st, 0, { t: 'swap', a: 0, b: 1 }).ok === false);
}

console.log(failures ? failures + ' ÉCHEC(S)' : '\nTests nouveaux jeux OK.');
process.exit(failures ? 1 : 0);
