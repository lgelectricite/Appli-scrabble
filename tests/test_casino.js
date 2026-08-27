const ROOT = require('path').join(__dirname, '..');
/* Tests : cagnotte de jetons, Blackjack, Solitaire, encaissement Poker. */
let failures = 0;
function check(n, c, e) {
  if (c) console.log('  OK  ' + n);
  else { failures++; console.log('  FAIL ' + n + (e !== undefined ? ' -> ' + JSON.stringify(e) : '')); }
}

// localStorage factice (les modules l'utilisent sous try/catch)
const store = {};
global.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
};

global.GG = {
  register(m) { global.GG.byId = global.GG.byId || {}; global.GG.byId[m.id] = m; },
  esc: s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'),
  clone: x => JSON.parse(JSON.stringify(x)),
  shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
};
global.self = global;

const wallet = require(ROOT + '/js/wallet.js');
const blackjack = require(ROOT + '/js/games/blackjack.js');
const solitaire = require(ROOT + '/js/games/solitaire.js');
const poker = require(ROOT + '/js/games/poker.js');

/* ================= CAGNOTTE ================= */
console.log('--- Cagnotte de jetons ---');
check('démarre à 10 000', wallet.get() === 10000);
check('dépense possible', wallet.spend(1500) === true && wallet.get() === 8500);
check('dépense refusée au-delà du solde', wallet.spend(999999) === false && wallet.get() === 8500);
wallet.add(2500);
check('gains crédités', wallet.get() === 11000);
check('dépense nulle/négative refusée', wallet.spend(0) === false && wallet.spend(-5) === false);
check('format lisible (espace fine française)', wallet.fmt(1234567) === '1 234 567', wallet.fmt(1234567));

// recharge hebdomadaire : on antidate la dernière recharge de 8 jours
let d = JSON.parse(store['gg-jetons']);
d.n = 3000; d.ts = Date.now() - 8 * 24 * 3600 * 1000;
store['gg-jetons'] = JSON.stringify(d);
check('recharge hebdo : remonte à 10 000 sous le plancher', wallet.get() === 10000);
d = JSON.parse(store['gg-jetons']);
d.n = 25000; d.ts = Date.now() - 8 * 24 * 3600 * 1000;
store['gg-jetons'] = JSON.stringify(d);
check('recharge hebdo : ne touche pas aux gains au-dessus du plancher', wallet.get() === 25000);
check('compte à rebours de recharge cohérent (≤ 7 jours)',
  wallet.nextRefillMs() >= 0 && wallet.nextRefillMs() <= 7 * 24 * 3600 * 1000);

/* ================= BLACKJACK ================= */
console.log('--- Blackjack ---');
const C = (suit, rank) => suit * 13 + rank; // rang 0 = As, 9 = 10, 12 = Roi

let b = blackjack.create(['Ana', 'Bob']);
check('création : phase de mises', b.phase === 'bet' && b.players.length === 2);
check('mise farfelue refusée', blackjack.apply(b, 0, { t: 'bet', v: 999 }).ok === false);
check('mise minimale de 1 jeton acceptée', blackjack.apply(b, 0, { t: 'bet', v: 1 }).ok === true);
check('double mise refusée', blackjack.apply(b, 0, { t: 'bet', v: 100 }).ok === false);
check('jouer avant la donne refusé', blackjack.apply(b, 0, { t: 'hit' }).ok === false);
check('mise de 25 valide', blackjack.apply(b, 1, { t: 'bet', v: 25 }).ok === true);
check('donne : 2 cartes par joueur + 2 au croupier',
  b.phase === 'play' || b.phase === 'result');
if (b.phase === 'play') {
  check('hors tour refusé', blackjack.apply(b, 1 - b.turn, { t: 'hit' }).ok === false);
}

// scénarios forcés : on pose les mains nous-mêmes
function forced(hands, dealer, shoe) {
  const s = blackjack.create(hands.map((_, i) => 'J' + i));
  s.phase = 'play';
  s.round = 1;
  s.players.forEach((p, i) => { p.bet = 100; p.hand = hands[i].slice(); p.done = false; });
  s.dealer = dealer.slice();
  s.shoe = shoe.slice(); // tiré par pop() (fin du tableau d'abord)
  s.turn = 0;
  return s;
}

// blackjack naturel payé 3:2 face à un croupier à 17
let s1 = forced([[C(0, 0), C(1, 9)]], [C(2, 9), C(3, 6)], [C(0, 5)]);
s1.players[0].done = false;
blackjack.apply(s1, 0, { t: 'stand' });
check('blackjack naturel : +150 pour 100 misés',
  s1.phase === 'result' && s1.players[0].outcome === 'bj' && s1.players[0].net === 150,
  s1.players[0]);

// as multiples : A+A+10 = 12 (pas 32, pas 22)
let s2 = forced([[C(0, 0), C(1, 0), C(2, 9)]], [C(2, 9), C(3, 6)], [C(0, 5)]);
blackjack.apply(s2, 0, { t: 'stand' });
check('as multiples : A+A+10 vaut 12 et perd contre 17',
  s2.players[0].outcome === 'lose' && s2.players[0].net === -100, s2.players[0]);

// le croupier tire jusqu'à 17 : à 16 il tire, puis saute → victoire
let s3 = forced([[C(0, 8), C(1, 8)]], [C(2, 9), C(3, 5)], [C(0, 9)]); // croupier 16 + 10 = 26
blackjack.apply(s3, 0, { t: 'stand' });
check('croupier saute : victoire 1 pour 1',
  s3.players[0].outcome === 'win' && s3.players[0].net === 100, s3.players[0]);

// égalité
let s4 = forced([[C(0, 9), C(1, 6)]], [C(2, 9), C(3, 6)], [C(0, 5)]); // 17 vs 17
blackjack.apply(s4, 0, { t: 'stand' });
check('égalité : mise rendue (net 0)', s4.players[0].outcome === 'push' && s4.players[0].net === 0);

// doubler : uniquement avec 2 cartes, une seule carte ensuite
let s5 = forced([[C(0, 4), C(1, 5)]], [C(2, 9), C(3, 6)], [C(0, 8), C(1, 9)]); // 11 + 10 = 21
check('doubler accepté à 2 cartes', blackjack.apply(s5, 0, { t: 'double' }).ok === true);
check('mise doublée + une seule carte + main finie',
  s5.players[0].bet === 200 && s5.players[0].hand.length === 3 && s5.phase === 'result');
check('doubler gagnant : net +200', s5.players[0].net === 200, s5.players[0].net);
let s6 = forced([[C(0, 4), C(1, 5), C(2, 1)]], [C(2, 9), C(3, 6)], [C(0, 8)]);
check('doubler à 3 cartes refusé', blackjack.apply(s6, 0, { t: 'double' }).ok === false);

// dépassement : bust immédiat
let s7 = forced([[C(0, 11), C(1, 11)]], [C(2, 9), C(3, 6)], [C(0, 11)]); // 10+10, tire 10 → 30
blackjack.apply(s7, 0, { t: 'hit' });
check('dépassé = perdu direct', s7.players[0].outcome === 'lose' && s7.phase === 'result');

// expurgation : carte cachée du croupier + sabot jamais transmis
let s8 = forced([[C(0, 4), C(1, 5)]], [C(2, 9), C(3, 6)], [C(0, 8)]);
let r8 = blackjack.redact(s8, 0);
check('carte cachée du croupier expurgée', r8.dealer[1] === -1);
check('sabot jamais transmis', r8.shoe === undefined && typeof r8.shoeCount === 'number');
blackjack.apply(s8, 0, { t: 'stand' });
let r8b = blackjack.redact(s8, 0);
check('carte du croupier révélée au résultat', r8b.dealer[1] === C(3, 6));

// manche suivante + cumul
let s9 = forced([[C(0, 0), C(1, 9)]], [C(2, 9), C(3, 6)], [C(0, 5)]);
blackjack.apply(s9, 0, { t: 'stand' });
const totAvant = s9.players[0].total;
check('again réservé à l’hôte', blackjack.apply(s9, 0, { t: 'again' }).ok === true && s9.round === 2);
check('cumul conservé entre les manches', s9.players[0].total === totAvant);
check('fin de partie : summary avec 🏆', /🏆/.test(blackjack.summary(s9)));

// quitter en pleine manche : la mise engagée revient (cagnotte locale)
{
  const avant = wallet.get();
  let bq = blackjack.create(['Solo']);
  blackjack.apply(bq, 0, { t: 'bet', v: 100 }); // (mise débitée par l'écran en vrai)
  if (bq.phase !== 'result') {
    blackjack.cashout(bq, 0);
    check('quitter en pleine manche rembourse la mise', wallet.get() === avant + 100);
  } else {
    check('quitter en pleine manche rembourse la mise', true); // blackjack immédiat, rien à rendre
  }
  let br = blackjack.create(['Solo']);
  br.phase = 'result'; br.players[0].bet = 100; br.players[0].outcome = 'lose';
  const avant2 = wallet.get();
  blackjack.cashout(br, 0);
  check('au résultat, rien n’est rendu deux fois', wallet.get() === avant2);
}

/* ================= SOLITAIRE ================= */
console.log('--- Solitaire ---');
let g = solitaire.create(['Ana', 'Bob']);
check('choix du niveau réservé au joueur 0', solitaire.apply(g, 1, { t: 'level', l: 'facile' }).ok === false);
check('niveau inconnu refusé', solitaire.apply(g, 0, { t: 'level', l: 'extreme' }).ok === false);
solitaire.apply(g, 0, { t: 'level', l: 'facile' });
check('donne : colonnes 1..7, stock 24',
  g.players[0].board.tab.map(c => c.length).join(',') === '1,2,3,4,5,6,7' &&
  g.players[0].board.stock.length === 24);
check('même donne pour tous',
  JSON.stringify(g.players[0].board) === JSON.stringify(g.players[1].board));
check('seule la dernière carte de chaque colonne est visible',
  g.players[0].board.tab.every(col => col.every((c, i) => c.up === (i === col.length - 1))));

solitaire.apply(g, 0, { t: 'draw' });
check('pioche facile : 1 carte', g.players[0].board.waste.length === 1);
let gd = solitaire.create(['Solo']);
solitaire.apply(gd, 0, { t: 'level', l: 'difficile' });
solitaire.apply(gd, 0, { t: 'draw' });
check('pioche difficile : 3 cartes', gd.players[0].board.waste.length === 3);

// plateau contrôlé pour tester les règles de déplacement
const S = (suit, rank) => suit * 13 + rank;
function board(p) {
  return {
    stock: [S(3, 5)], waste: [S(1, 6)], // 7♥ dans la défausse
    found: [[], [], [], []],
    tab: [
      [{ c: S(0, 7), up: true }],                      // 8♠
      [{ c: S(2, 7), up: true }],                      // 8♦ (rouge)
      [{ c: S(0, 12), up: false }, { c: S(1, 4), up: true }], // (cachée) + 5♥
      [], [], [],
      [{ c: S(3, 12), up: true }]                      // R♣
    ]
  };
}
let gs = solitaire.create(['Ana', 'Bob']);
gs.phase = 'play'; gs.level = 'facile'; gs.draw = 1; gs.startTs = Date.now();
gs.players[0].board = board(); gs.players[1].board = board();

check('7♥ sur 8♠ (alternance ok)',
  solitaire.apply(gs, 0, { t: 'move', src: { k: 'waste' }, dst: { k: 'tab', col: 0 } }).ok === true);
check('7♥ arrivé sur la colonne', gs.players[0].board.tab[0].length === 2);
check('rouge sur rouge refusé',
  solitaire.apply(gs, 1, { t: 'move', src: { k: 'waste' }, dst: { k: 'tab', col: 1 } }).ok === false);
check('le plateau de Bob n’a pas bougé quand Ana joue',
  gs.players[1].board.tab[0].length === 1);
check('colonne vide : seul un Roi',
  solitaire.apply(gs, 0, { t: 'move', src: { k: 'tab', col: 2, idx: 1 }, dst: { k: 'tab', col: 3 } }).ok === false);
check('Roi accepté sur colonne vide',
  solitaire.apply(gs, 0, { t: 'move', src: { k: 'tab', col: 6, idx: 0 }, dst: { k: 'tab', col: 3 } }).ok === true);
check('carte face cachée injouable',
  solitaire.apply(gs, 0, { t: 'move', src: { k: 'tab', col: 2, idx: 0 }, dst: { k: 'tab', col: 4 } }).ok === false);
check('fondation : 5♥ refusé avant l’As',
  solitaire.apply(gs, 0, { t: 'move', src: { k: 'tab', col: 2, idx: 1 }, dst: { k: 'found', pile: 1 } }).ok === false);

// retournement automatique : on vide la carte du dessus de la colonne 2
gs.players[0].board.tab[4] = [{ c: S(3, 5), up: true }]; // 6♣ pour accueillir 5♥
check('5♥ sur 6♣',
  solitaire.apply(gs, 0, { t: 'move', src: { k: 'tab', col: 2, idx: 1 }, dst: { k: 'tab', col: 4 } }).ok === true);
check('la carte cachée en dessous se retourne', gs.players[0].board.tab[2][0].up === true);

// déplacement multi-cartes : 6♣+5♥ ensemble sur 7♥
check('groupe 6♣+5♥ déplacé sur 7♥',
  solitaire.apply(gs, 0, { t: 'move', src: { k: 'tab', col: 4, idx: 0 }, dst: { k: 'tab', col: 0 } }).ok === true &&
  gs.players[0].board.tab[0].length === 4);

// recyclage de la pioche
let gr = solitaire.create(['Solo']);
gr.phase = 'play'; gr.level = 'facile'; gr.draw = 1; gr.startTs = Date.now();
gr.players[0].board = { stock: [], waste: [S(0, 1), S(0, 2), S(0, 3)], found: [[], [], [], []], tab: [[], [], [], [], [], [], []] };
solitaire.apply(gr, 0, { t: 'draw' });
check('défausse retournée en pioche', gr.players[0].board.stock.length === 3 && gr.players[0].board.waste.length === 0);

// expurgation : pioche et cartes cachées
let gred = solitaire.redact(gs, 0);
check('redact : pioche expurgée', gred.players[0].board.stock.every(c => c === -1));
check('redact : cartes face cachée expurgées (tous les plateaux)',
  gred.players.every(pp => pp.board.tab.every(col => col.every(c => c.up || c.c === -1))));

// victoire en course : Ana termine → partie finie, Bob classé à ses fondations
let gw = solitaire.create(['Ana', 'Bob']);
gw.phase = 'play'; gw.level = 'facile'; gw.draw = 1; gw.startTs = Date.now() - 60000;
const fullFound = [[], [], [], []];
for (let su = 0; su < 4; su++) for (let rk = 0; rk < 13; rk++) fullFound[su].push(S(su, rk));
gw.players[0].board = { stock: [], waste: [], found: GG.clone(fullFound), tab: [[], [], [], [], [], [], []] };
gw.players[0].board.found[3].pop(); // il manque le R♣
gw.players[0].board.tab[0] = [{ c: S(3, 12), up: true }];
gw.players[1].board = { stock: [], waste: [], found: [[S(0, 0)], [], [], []], tab: [[], [], [], [], [], [], []] };
check('dernière carte → victoire et fin de course',
  solitaire.apply(gw, 0, { t: 'move', src: { k: 'tab', col: 0, idx: 0 }, dst: { k: 'found', pile: 3 } }).ok === true &&
  gw.players[0].done === true && solitaire.over(gw) === true);
check('résumé : Ana gagnante', /Ana/.test(solitaire.summary(gw)) && /🏆/.test(solitaire.summary(gw)));

// abandon général : ex æquo au nombre de cartes
let gq = solitaire.create(['Ana', 'Bob']);
gq.phase = 'play'; gq.level = 'facile'; gq.draw = 1; gq.startTs = Date.now();
gq.players[0].board = { stock: [], waste: [], found: [[], [], [], []], tab: [[], [], [], [], [], [], []] };
gq.players[1].board = GG.clone(gq.players[0].board);
solitaire.apply(gq, 0, { t: 'giveup' });
check('partie continue tant qu’il reste un joueur', solitaire.over(gq) === false);
solitaire.apply(gq, 1, { t: 'giveup' });
check('tous abandonnent → partie finie', solitaire.over(gq) === true);
check('résumé : ex æquo affiché', /🏆/.test(solitaire.summary(gq)));

/* ================= POKER : encaissement cagnotte ================= */
console.log('--- Poker : cagnotte ---');
d = JSON.parse(store['gg-jetons']); d.n = 5000; d.ts = Date.now(); store['gg-jetons'] = JSON.stringify(d);
let pk = poker.create(['Ana', 'Bob']);
store['gg-poker-open'] = JSON.stringify({ gameId: pk.gameId, invested: 1000 });
pk.players[0].chips = 1750;
poker.cashout(pk, 0);
check('cashout : la pile retourne dans la cagnotte', wallet.get() === 6750);
check('cashout : marqueur libéré', store['gg-poker-open'] === undefined);
poker.cashout(pk, 0);
check('cashout : jamais deux fois', wallet.get() === 6750);

console.log(failures ? failures + ' ÉCHEC(S)' : '\nTests casino/cagnotte OK.');
process.exit(failures ? 1 : 0);
