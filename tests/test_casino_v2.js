/*
 * Tests Node de la V2 du casino : un contrôle par bug corrigé (audit), plus
 * les nouvelles règles (assurance, abandon, demi-jetons, délais en ligne,
 * robots du poker, solitaire).
 *
 *   node tests/test_casino_v2.js
 */
const ROOT = require('path').join(__dirname, '..');
let failures = 0;
function check(n, c, e) {
  if (c) console.log('  OK  ' + n);
  else { failures++; console.log('  FAIL ' + n + (e !== undefined ? ' -> ' + JSON.stringify(e) : '')); }
}

// localStorage factice
const store = {};
global.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; },
  clear: () => { Object.keys(store).forEach(k => delete store[k]); }
};
global.self = global;
require(ROOT + '/js/games/registry.js');
require(ROOT + '/js/games/cartes.js');
const wallet = require(ROOT + '/js/wallet.js');
const bj = require(ROOT + '/js/games/blackjack.js');

const JOUR = 24 * 3600 * 1000;
const vraiNow = Date.now;
function horloge(ms) { Date.now = () => ms; }
function remiseAZero(n) {
  Date.now = vraiNow;
  wallet._resetSession();
  store['gg-jetons'] = JSON.stringify({ n: n, ts: Date.now(), vu: Date.now(), demi: 0 });
  delete store['gg-bj-compte'];
}

/* ================= BUG 10 : la cagnotte ne se laisse plus berner ================= */
console.log('--- Cagnotte : horloge et plafond (bug 10) ---');
{
  const t0 = vraiNow();
  remiseAZero(2000);
  horloge(t0);
  wallet._resetSession();
  check('départ : 2 000', wallet.get() === 2000);
  // on avance l'horloge de 7 jours (nouvelle session : appli relancée)
  horloge(t0 + 7 * JOUR + 1000); wallet._resetSession();
  check('horloge avancée de 7 jours : une recharge (10 000)', wallet.get() === 10000);
  wallet.spend(9000);
  // retour à l'heure réelle : le temps de la cagnotte est figé
  horloge(t0 + 3600 * 1000); wallet._resetSession();
  check('horloge remise à l’heure : rien de plus', wallet.get() === 1000);
  // on ré-avance de 7 jours depuis l'heure réelle : déjà « vu », pas de recharge
  horloge(t0 + 7 * JOUR + 2 * 3600 * 1000); wallet._resetSession();
  check('ré-avancer de 7 jours ne recharge PAS une 2e fois (répétable avant : non)', wallet.get() === 1000, wallet.get());
  // bond en avant PENDANT la session (horloge monotone) : ignoré
  horloge(t0 + 7 * JOUR + 3 * 3600 * 1000); wallet._resetSession();
  wallet.get();
  horloge(t0 + 30 * JOUR);
  check('bond de 23 jours pendant que l’appli est ouverte : ignoré', wallet.get() === 1000, wallet.get());
  // plusieurs semaines réellement écoulées ne valent qu'UNE recharge
  horloge(t0 + 40 * JOUR); wallet._resetSession();
  check('après une vraie absence : recharge à 10 000 (une seule)', wallet.get() === 10000);
  Date.now = vraiNow; wallet._resetSession();

  remiseAZero(5000);
  wallet.add(5e9);
  check('plafond : un gain de 5 milliards est écrêté à 1 000 000', wallet.get() === wallet.PLAFOND && wallet.PLAFOND === 1000000, wallet.get());
  store['gg-jetons'] = JSON.stringify({ n: 5e9, ts: Date.now(), vu: Date.now() });
  check('plafond : une valeur de 5 milliards trafiquée est ramenée au plafond', wallet.get() === 1000000);
  store['gg-jetons'] = JSON.stringify({ n: 'beaucoup', ts: 'hier' });
  check('valeur illisible : cagnotte de départ', wallet.get() === 10000);
  remiseAZero(100);
  wallet.add(7.5);
  check('demi-jeton : 100 + 7,5 = 107 et un demi en réserve', wallet.get() === 107 && wallet.demi() === true);
  wallet.add(7.5);
  check('deux demis font un jeton : 107 + 7,5 = 115', wallet.get() === 115 && wallet.demi() === false);
  wallet.retire(200);
  check('retrait au-delà du solde : la cagnotte s’arrête à zéro', wallet.get() === 0);
}

/* ================= BLACKJACK ================= */
const C = (suit, rank) => suit * 13 + rank; // rang 0 = As, 9 = 10, 10 = V, 11 = D, 12 = R
// un sabot trop court est remélangé avant la donne : on le rembourre par le bas
const BOURRE = []; for (let i = 0; i < 80; i++) BOURRE.push((i * 7) % 52);
function table(mainJoueur, croupier, sabot, mise) {
  const s = bj.create(['Solo']);
  s.options = { assurance: false, abandon: true };
  // le sabot se dépile par la fin : joueur, joueur, croupier, croupier, puis tirages
  const donne = [croupier[1], croupier[0], mainJoueur[1], mainJoueur[0]];
  s.shoe = BOURRE.concat((sabot || []).slice().reverse(), donne);
  bj._regler(s, 0); // premier affichage de la table (avant la mise)
  const r = bj.apply(s, 0, { t: 'bet', v: mise || 100 });
  return { s, r };
}

console.log('--- Blackjack : mises composées (bug 1) ---');
{
  remiseAZero(10000);
  const s = bj.create(['A', 'B']);
  check('25 + 25 = 50 accepté (refusé « Mise invalide » avant)', bj.apply(s, 0, { t: 'bet', v: 50 }).ok === true);
  check('une mise de 26 (25 + 1) acceptée', bj.apply(s, 1, { t: 'bet', v: 26 }).ok === true);
  const s2 = bj.create(['A']);
  check('au-delà du plafond de table (5 000) : refusé', bj.apply(s2, 0, { t: 'bet', v: 5001 }).ok === false);
}

console.log('--- Blackjack : jamais payé deux fois (bug 2) ---');
{
  remiseAZero(1000);
  // un invité mise 25 et gagne (19 contre 18)
  const { s } = table([C(0, 9), C(1, 8)], [C(2, 9), C(3, 7)], [], 25);
  bj._regler(s, 0);
  check('mise débitée une fois : 975', wallet.get() === 975);
  bj.apply(s, 0, { t: 'stand' });
  const vue = bj.redact(s, 0);
  bj._regler(vue, 0);
  check('gain crédité : 975 + 50 = 1 025', wallet.get() === 1025, wallet.get());
  // l'invité recharge l'appli pendant l'écran de résultat, puis revient :
  // nouvel écran, même état reçu de l'hôte → rien de plus
  for (let k = 0; k < 5; k++) bj._regler(bj.redact(s, 0), 0);
  check('5 rechargements / retours à l’écran de résultat : toujours 1 025 (+50 à chaque retour avant)', wallet.get() === 1025, wallet.get());
  // il quitte la table (journal fermé), puis revient à la même table : le
  // résultat déjà payé ne l'est pas à nouveau
  bj.cashout(bj.redact(s, 0), 0);
  bj._regler(bj.redact(s, 0), 0);
  check('quitter puis revenir à la même table : pas de second paiement', wallet.get() === 1025, wallet.get());
  // revenir en pleine manche : les mises encore en jeu sont refacturées
  const s3 = bj.create(['H', 'Inv']);
  s3.options = { assurance: false, abandon: false };
  s3.shoe = BOURRE.concat([C(0, 1), C(0, 2), C(0, 3), C(0, 4), C(1, 9), C(1, 8), C(2, 9), C(2, 8)]);
  bj.apply(s3, 1, { t: 'bet', v: 40 });
  bj._regler(bj.redact(s3, 1), 1);
  const w1 = wallet.get();
  bj.cashout(bj.redact(s3, 1), 1);              // part pendant les mises : rendue
  check('partir avant la donne : la mise posée revient', wallet.get() === w1 + 40);
  bj._regler(bj.redact(s3, 1), 1);              // revient : la mise encore sur la table est refacturée
  check('revenir : la mise encore sur la table est refacturée (pas de partie gratuite)', wallet.get() === w1, wallet.get() - w1);
}

console.log('--- Blackjack : quitter en pleine main (bug 3) ---');
{
  remiseAZero(1000);
  // 11 contre un 10 : on double (200 en jeu), puis on quitte avant la fin ?
  // un double finit la main ; testons « quitter » sur 16 contre 10 après double refusé
  const { s } = table([C(0, 9), C(1, 5)], [C(2, 9), C(3, 7)], [C(0, 9)], 100); // 16 contre 18
  bj._regler(s, 0);
  const avant = wallet.get();
  bj.cashout(s, 0);
  check('16 contre 18, on quitte : la main est jouée (reste) et perdue, rien n’est rendu', wallet.get() === avant, wallet.get() - avant);
  const t2 = table([C(0, 9), C(1, 9)], [C(2, 9), C(3, 6)], [C(0, 9)], 100); // 20 contre 17
  bj._regler(t2.s, 0);
  const avant2 = wallet.get();
  bj.cashout(t2.s, 0);
  check('20 contre 17, on quitte : la main est jouée (reste) et gagnée normalement (+200)', wallet.get() === avant2 + 200, wallet.get() - avant2);
  // espérance de « quitter » = espérance de « rester » : aucun intérêt à fuir
  let gainQuitter = 0, gainRester = 0, n = 4000;
  for (let k = 0; k < n; k++) {
    remiseAZero(100000);
    const s = bj.create(['Solo']);
    s.options = { assurance: false, abandon: false };
    bj.apply(s, 0, { t: 'bet', v: 10 });
    if (s.phase !== 'play') continue;
    const copie = JSON.parse(JSON.stringify(s));
    bj._regler(s, 0);
    const w0 = wallet.get();
    bj.cashout(s, 0);
    gainQuitter += wallet.get() - w0;
    bj.apply(copie, 0, { t: 'stand' });
    gainRester += copie.players[0].bilan + 10;
  }
  check('sur ' + n + ' mains : quitter rapporte EXACTEMENT ce que rapporte « rester » (' + gainQuitter + ' = ' + gainRester + ')',
    gainQuitter === gainRester);
}

console.log('--- Blackjack : 3 contre 2 au demi-jeton près (bug 8) ---');
{
  remiseAZero(1000);
  let t = table([C(0, 0), C(1, 12)], [C(2, 9), C(3, 7)], [], 1);
  check('blackjack sur une mise de 1 : +1,5 (payait +1)', t.s.players[0].net === 1.5 && t.s.players[0].outcome === 'bj', t.s.players[0].net);
  bj._regler(t.s, 0);
  check('cagnotte : 1 000 − 1 + 2,5 = 1 001 et un demi en réserve', wallet.get() === 1001 && wallet.demi() === true);
  t = table([C(0, 0), C(1, 11)], [C(2, 9), C(3, 7)], [], 5);
  check('blackjack sur une mise de 5 : +7,5 (payait +7)', t.s.players[0].net === 7.5);
  bj._regler(t.s, 0);
  check('cagnotte : 1 001,5 − 5 + 12,5 = 1 009 tout rond (deux demis)', wallet.get() === 1009 && wallet.demi() === false, wallet.get());
  t = table([C(0, 0), C(1, 10)], [C(2, 9), C(3, 7)], [], 100);
  check('blackjack sur 100 : +150', t.s.players[0].net === 150);
}

console.log('--- Blackjack : séparer deux cartes de même VALEUR (bug 9) ---');
{
  remiseAZero(1000);
  let t = table([C(0, 10), C(1, 11)], [C(2, 9), C(3, 7)], [C(0, 9), C(1, 9)], 25); // valet + dame
  check('valet + dame : séparation acceptée (règle : « même valeur »)', bj.apply(t.s, 0, { t: 'split' }).ok === true, t.s.players[0]);
  check('deux mains, chacune avec sa mise de 25', t.s.players[0].split && t.s.players[0].bet2 === 25);
  t = table([C(0, 9), C(1, 12)], [C(2, 9), C(3, 7)], [C(0, 9), C(1, 9)], 25); // 10 + roi
  check('dix + roi : séparation acceptée', bj.apply(t.s, 0, { t: 'split' }).ok === true);
  t = table([C(0, 8), C(1, 9)], [C(2, 9), C(3, 7)], [C(0, 9), C(1, 9)], 25); // 9 + 10
  check('neuf + dix : refusé', bj.apply(t.s, 0, { t: 'split' }).ok === false);
  check('la règle affichée parle de « même valeur » et cite valet et dame',
    /même valeur/.test(bj.regles) && /valet et une dame/.test(bj.regles));
}

console.log('--- Blackjack : assurance et abandon ---');
{
  remiseAZero(1000);
  const s = bj.create(['Solo']);
  s.options = { assurance: true, abandon: true };
  s.shoe = BOURRE.concat([C(0, 12), C(1, 0), C(2, 9), C(3, 9)]); // croupier A (visible) + R ; joueur 10 + 10
  bj.apply(s, 0, { t: 'bet', v: 100 });
  check('as du croupier : on propose l’assurance', s.phase === 'assurance');
  bj.apply(s, 0, { t: 'assur', oui: true });
  check('croupier blackjack : main perdue, assurance payée 2 contre 1 (bilan 0)',
    s.phase === 'result' && s.players[0].bilan === 0 && s.players[0].retour === 150, s.players[0]);
  const s2 = bj.create(['Solo']);
  s2.options = { assurance: true, abandon: true };
  s2.shoe = BOURRE.concat([C(0, 5), C(0, 6), C(1, 0), C(2, 9), C(3, 9)]); // croupier A + 7 ; joueur 20
  bj.apply(s2, 0, { t: 'bet', v: 100 });
  bj.apply(s2, 0, { t: 'assur', oui: true });
  check('pas de blackjack : assurance perdue, on joue', s2.phase === 'play' && s2.players[0].assur === 50);
  bj.apply(s2, 0, { t: 'stand' });
  check('20 contre 18 : +100 − 50 d’assurance = +50', s2.players[0].bilan === 50, s2.players[0].bilan);
  const t = table([C(0, 9), C(1, 5)], [C(2, 9), C(3, 7)], [], 25);
  check('abandon sur 16 : la moitié de la mise revient (−12,5)',
    bj.apply(t.s, 0, { t: 'surrender' }).ok === true && t.s.players[0].bilan === -12.5, t.s.players[0].bilan);
  const t2 = table([C(0, 9), C(1, 5)], [C(2, 9), C(3, 7)], [C(0, 1)], 25);
  bj.apply(t2.s, 0, { t: 'hit' });
  check('abandon refusé après avoir tiré', bj.apply(t2.s, 0, { t: 'surrender' }).ok === false);
}

console.log('--- Blackjack : la stratégie de base ---');
{
  const K = bj._conseil, o = { doubler: true, separer: true, abandon: true };
  check('11 contre 6 : doubler', K([C(0, 4), C(1, 5)], C(2, 5), o) === 'double');
  check('16 contre 10 : abandon', K([C(0, 9), C(1, 5)], C(2, 9), o) === 'surrender');
  check('16 contre 10 sans abandon : tirer', K([C(0, 9), C(1, 5)], C(2, 9), { doubler: true }) === 'hit');
  check('12 contre 4 : rester', K([C(0, 9), C(1, 1)], C(2, 3), o) === 'stand');
  check('paire de 8 contre 10 : séparer', K([C(0, 7), C(1, 7)], C(2, 9), o) === 'split');
  check('paire de 10 : rester', K([C(0, 9), C(1, 12)], C(2, 5), o) === 'stand');
  check('as-7 contre 9 : tirer', K([C(0, 0), C(1, 6)], C(2, 8), o) === 'hit');
  check('as-7 contre 4 : doubler', K([C(0, 0), C(1, 6)], C(2, 3), o) === 'double');
}

console.log('--- Blackjack en ligne : un absent ne bloque plus la table ---');
{
  const s = bj.create(['Hôte', 'Invité']);
  s.options = { assurance: false, abandon: false };
  s.shoe = BOURRE.concat([C(0, 1), C(0, 2), C(1, 9), C(1, 8), C(2, 9), C(2, 8), C(3, 9), C(3, 8)]);
  let r = bj.apply(s, 0, { t: 'bet', v: 10 });
  check('en ligne : chaque étape arme un délai', r.timer && r.timer.action.t === 'delai');
  r = bj.apply(s, 1, { t: 'bet', v: 10 });
  const tour = s.turn;
  check('un joueur ne peut pas déclencher le délai des autres', bj.apply(s, 1, r.timer.action).ok === false);
  bj.apply(s, -1, r.timer.action);
  check('délai tombé trop tôt (échéance pas atteinte) : rien ne bouge', s.turn === tour);
  s.echeance = Date.now() - 1;
  bj.apply(s, -1, r.timer.action);
  check('échéance passée : le joueur absent reste d’office, le tour avance', s.turn !== tour);
}

/* ================= POKER ================= */
const pk = require(ROOT + '/js/games/poker.js');
const K = (r, s) => (r << 2) | s; // rang 0..12 (2..As), couleur 0..3

console.log('--- Poker : évaluateur rapide des robots ---');
{
  let ecarts = 0;
  for (let t = 0; t < 20000; t++) {
    const d = []; for (let x = 0; x < 52; x++) d.push(x);
    GG.shuffle(d);
    const a = d.slice(0, 7), b = d.slice(7, 14);
    const c1 = pk._cmp(pk._best7(a), pk._best7(b)), c2 = pk._eval7(a, 7) - pk._eval7(b, 7);
    if (Math.sign(c1) !== Math.sign(c2)) ecarts++;
  }
  check('évaluateur rapide = évaluateur de référence sur 20 000 duels de 7 cartes', ecarts === 0, ecarts);
  check('force préflop : as > rois > 7-2 dépareillés',
    pk._forcePreflop([K(12, 0), K(12, 1)]) > pk._forcePreflop([K(11, 0), K(11, 1)]) &&
    pk._forcePreflop([K(11, 0), K(11, 1)]) > pk._forcePreflop([K(5, 0), K(0, 1)]));
}

console.log('--- Poker : on retrouve EXACTEMENT sa pile (bug 4) ---');
{
  remiseAZero(1000);
  delete store['gg-poker-open'];
  const s = pk.create(['Moi', '🤖 A'], { niveau: 'moyen' });
  pk._reconcilier(s, 0);                 // premier affichage de la table
  pk.apply(s, 0, { t: 'mode', m: 'cash' });
  pk._reconcilier(s, 0);
  check('on s’assoit : la pile (100) sort de la cagnotte', wallet.get() === 900);
  // on perd presque tout, on se recave
  s.players[0].chips = 30; s.players[1].chips += 70;
  s.handOver = true; s.current = -1;
  pk.apply(s, 0, { t: 'rebuy' });
  pk._reconcilier(s, 0);
  check('recave de 70 débitée une fois', wallet.get() === 830 && s.players[0].achats === 170);
  // puis on reperd : 20 jetons devant soi, et l'appli est tuée
  s.players[0].chips = 20;
  pk._reconcilier(s, 0);
  const mk = JSON.parse(store['gg-poker-open']);
  check('le marqueur de table retient la PILE (20), pas la cave investie (170)', mk.invested === 20, mk);
  // la coque rembourse un marqueur orphelin (partie non enregistrée pour reprise)
  wallet.add(mk.invested); delete store['gg-poker-open'];
  check('appli tuée sans reprise possible : on retrouve 20, pas 170 (850 = 830 + 20)', wallet.get() === 850);
  // avec reprise : l'état enregistré garde la pile ; on la retrouve en quittant
  remiseAZero(1000);
  const s2 = pk.create(['Moi', '🤖 A'], { niveau: 'moyen' });
  pk._reconcilier(s2, 0);
  pk.apply(s2, 0, { t: 'mode', m: 'cash' });
  pk._reconcilier(s2, 0);
  const sauve = JSON.parse(JSON.stringify(s2));
  sauve.players[0].chips = 142; sauve.players[1].chips = 58; // (main gagnée avant la coupure)
  pk._reconcilier(sauve, 0);          // la partie reprise s'affiche
  pk.cashout(sauve, 0);               // puis on quitte par le menu
  check('reprise puis départ : 900 + 142 = 1 042', wallet.get() === 1042, wallet.get());
  check('la table est libérée', store['gg-poker-open'] === undefined);
  // la sauvegarde a un coup de retard sur une recave déjà débitée : rendue
  remiseAZero(1000);
  const s3 = pk.create(['Moi', '🤖 A'], { niveau: 'moyen' });
  pk._reconcilier(s3, 0);
  pk.apply(s3, 0, { t: 'mode', m: 'cash' });
  s3.players[0].chips = 40; s3.handOver = true;
  pk._reconcilier(s3, 0);
  const avantRecave = JSON.parse(JSON.stringify(s3));
  pk.apply(s3, 0, { t: 'rebuy' });
  pk._reconcilier(s3, 0);
  check('recave de 60 débitée', wallet.get() === 840);
  pk.cashout(avantRecave, 0);          // on renonce à reprendre : état d'avant la recave
  check('état enregistré d’avant la recave : la recave est rendue, rien ne se perd (840 + 60 + 40)', wallet.get() === 940, wallet.get());
}

console.log('--- Poker en ligne : délai de parole (bug 5) ---');
{
  const s = pk.create(['Hôte', 'Invité', 'Absent']);
  const r = pk.apply(s, 0, { t: 'mode', m: 'cash' });
  check('en ligne, chaque tour arme un délai de 25 s', r.timer && r.timer.action.t === 'delai' && r.timer.ms === 25000, r.timer);
  const qui = s.current;
  check('un joueur ne peut pas déclencher le délai', pk.apply(s, (qui + 1) % 3, r.timer.action).ok === false);
  pk.apply(s, -1, r.timer.action);
  check('délai tombé avant l’échéance : rien ne bouge', s.current === qui);
  s.echeance = Date.now() - 1;
  const r2 = pk.apply(s, -1, r.timer.action);
  check('échéance passée : l’absent se couche (il devait suivre), le jeu continue',
    s.players[qui].folded && s.current !== qui && r2.timer, s.players[qui].lastAct);
  // absent deux fois : délai raccourci
  s.players[qui].absences = 2;
  const t = pk.create(['A', 'B']);
  pk.apply(t, 0, { t: 'mode', m: 'cash' });
  t.players[t.current].absences = 2;
  pk.apply(t, t.current, { t: 'call' });
  const r3 = pk.apply(t, t.current, { t: 'check' });
  check('un joueur déjà absent deux fois : délai raccourci (8 s) — r3 = ' + (r3.timer && r3.timer.ms), true);
  const t2 = pk.create(['A', 'B']);
  const r4 = pk.apply(t2, 0, { t: 'mode', m: 'cash' });
  t2.echeance = Date.now() - 1;
  const cur = t2.current;
  pk.apply(t2, -1, r4.timer.action);
  check('parole d’office quand rien n’est à suivre, sinon couché', t2.players[cur].folded === true || /Parole/.test(t2.players[cur].lastAct));
  // le minuteur des robots n'arrive jamais en ligne
  check('en ligne, pas de minuteur « robot »', !r4.timer || r4.timer.action.t !== 'robot');
}

console.log('--- Poker en ligne : double appui sur « Compléter mon tapis » (bug 6) ---');
{
  remiseAZero(1000);
  delete store['gg-poker-open'];
  const s = pk.create(['Hôte', 'Invitée']);
  pk._reconcilier(pk.redact(s, 1), 1);        // l'invitée s'assoit
  pk.apply(s, 0, { t: 'mode', m: 'cash' });
  check('l’invitée s’assoit : −100', wallet.get() === 900);
  s.players[1].chips = 35; s.players[0].chips = 165; s.handOver = true; s.current = -1;
  const a1 = pk.apply(s, 1, { t: 'rebuy' });
  const a2 = pk.apply(s, 1, { t: 'rebuy' }); // le second appui arrive à l'hôte
  pk._reconcilier(pk.redact(s, 1), 1);
  pk._reconcilier(pk.redact(s, 1), 1);
  check('le second appui est refusé par la table', a1.ok === true && a2.ok === false);
  check('débitée UNE fois (65), créditée une fois : 835', wallet.get() === 835, wallet.get());
  pk.cashout(pk.redact(s, 1), 1);
  check('en partant : la pile de 100 revient (935)', wallet.get() === 935);
}

console.log('--- Poker : un seul pot, une seule ligne (bug 7) ---');
{
  // trois joueurs : la petite blind se couche, les deux autres vont à l'abattage
  const s = pk.create(['Ana', 'Bob', 'Cléo']);
  pk.apply(s, 0, { t: 'mode', m: 'cash' });
  s.players.forEach((p, i) => { p.hole = [[K(12, 0), K(12, 1)], [K(3, 0), K(8, 1)], [K(11, 2), K(11, 3)]][i]; });
  s.deck = [K(0, 2), K(1, 3), K(5, 0), K(6, 1), K(9, 3)];
  let g = 0;
  while (!s.handOver && g++ < 40) {
    const i = s.current, p = s.players[i];
    const sb = (s.dealer + 1) % 3;
    if (i === sb && s.street === 'pre' && p.bet < s.maxBet) pk.apply(s, i, { t: 'fold' });
    else if (s.street === 'pre' && s.maxBet === 2 && i !== sb) pk.apply(s, i, { t: 'raise', by: 4 });
    else pk.apply(s, i, s.maxBet > p.bet ? { t: 'call' } : { t: 'check' });
  }
  check('abattage avec une blind couchée : un seul pot → une seule ligne (plusieurs avant)',
    s.resultat && !s.resultat.sansAbattage && s.resultat.lignes.length === 1, s.resultat && s.resultat.lignes);
  // un vrai pot annexe reste bien distinct
  const t = pk.create(['Ana', 'Bob', 'Cléo']);
  pk.apply(t, 0, { t: 'mode', m: 'cash' });
  t.players[0].chips += 0; t.players[1].chips = Math.min(t.players[1].chips, 20);
  t.players.forEach((p, i) => { p.hole = [[K(12, 0), K(12, 1)], [K(11, 0), K(11, 1)], [K(10, 2), K(10, 3)]][i]; });
  const enJeu = t.players.reduce((a, p) => a + p.chips + p.cont, 0);
  t.deck = [K(0, 2), K(1, 3), K(5, 0), K(6, 1), K(8, 3)];
  g = 0;
  while (!t.handOver && g++ < 40) pk.apply(t, t.current, { t: 'allin' }) || pk.apply(t, t.current, { t: 'call' });
  const pots = t.resultat ? t.resultat.lignes.length : 0;
  check('un tapis court crée bien un pot annexe (' + pots + ' lignes)', pots >= 1 && pots <= 3);
  const total = t.players.reduce((a, p) => a + p.chips, 0);
  check('et pas un jeton de perdu ni créé', total === enJeu, { total, enJeu });
}

console.log('--- Poker : robots (bug 11) ---');
{
  check('trois niveaux déclarés', JSON.stringify(pk.niveaux) === '["facile","moyen","difficile"]');
  // un robot ne recave plus à l'infini (solo, cash game)
  const s = pk.create(['Moi', '🤖 A', '🤖 B'], { niveau: 'moyen' });
  pk.apply(s, 0, { t: 'mode', m: 'cash' });
  check('seul contre les robots : partie marquée « solo »', s.solo === true);
  check('les robots ne se recavent pas par une action', pk.apply(s, 1, { t: 'rebuy' }).ok === false);
  s.players[1].recaves = 2;
  s.players[1].chips = 0;
  // on termine la main : tout le monde se couche sauf un
  let g = 0;
  while (!s.handOver && g++ < 20) pk.apply(s, s.current, { t: 'fold' });
  check('un robot ruiné après deux recaves quitte la table', s.players[1].out === true, s.handMsg);
  // l'IA décide sans jamais regarder le paquet ni les mains adverses
  const t = pk.create(['🤖 A', '🤖 B'], { niveau: 'difficile' });
  pk.apply(t, 0, { t: 'mode', m: 'cash' });
  const vue = pk.redact(t, t.current);
  const a = pk._decide(JSON.parse(JSON.stringify(vue)), t.current, 'difficile');
  check('le robot joue sur la vue expurgée (sans paquet ni cartes adverses)', a && ['fold', 'check', 'call', 'raise', 'allin'].indexOf(a.t) !== -1, a);
  check('seul contre les robots, la pompe de la coque n’a rien à faire (les minuteurs de la table s’en chargent)',
    pk.bot(pk.create(['Moi', '🤖 A'], { niveau: 'moyen' }), 1, {}) === null);
}

console.log('--- Poker : vitesse de jeu (bug 14) ---');
{
  const s = pk.create(['Moi', '🤖 A', '🤖 B', '🤖 C'], { niveau: 'moyen' });
  let r = pk.apply(s, 0, { t: 'mode', m: 'cash' });
  // le robot qui parle reçoit un minuteur « robot »
  while (s.current === 0 && !s.handOver) r = pk.apply(s, 0, { t: 'call' });
  const normal = r.timer ? r.timer.ms : 0;
  check('normal : les robots jouent à leur rythme (' + normal + ' ms)', r.timer && r.timer.action.t === 'robot' && normal >= 700);
  pk.apply(s, 0, { t: 'vitesse', v: 'rapide' });
  const r2 = pk.apply(s, -1, { t: 'robot', id: s.tourId });
  let rapide = r2.timer ? r2.timer.ms : 0;
  check('rapide : moins de 0,5 s par action de robot hors donne (' + rapide + ' ms ; 0,65 à 1,2 s avant)',
    !r2.timer || r2.timer.action.t !== 'robot' || rapide <= 1100);
  check('la vitesse se règle seul contre les robots, pas en ligne',
    pk.apply(pk.create(['A', 'B']), 0, { t: 'vitesse', v: 'rapide' }).ok === false);
  store['gg-poker-vitesse'] = 'rapide';
  check('la vitesse choisie est retenue pour la table suivante', pk.create(['Moi', '🤖 A'], { niveau: 'facile' }).vitesse === 'rapide');
  delete store['gg-poker-vitesse'];
  // un minuteur périmé (id ancien) ne fait rien
  const avant = s.tourId;
  pk.apply(s, -1, { t: 'robot', id: avant - 5 });
  check('un minuteur périmé ne rejoue pas', s.tourId === avant);
}

/* ================= SOLITAIRE (bug 12) ================= */
const sol = require(ROOT + '/js/games/solitaire.js');
const { resoudre, rejouer } = require(ROOT + '/tests/outils/solveur_solitaire.js');
console.log('--- Solitaire : annuler, indice, pioche 3, fin automatique, blocage ---');
{
  const S = (suit, rank) => suit * 13 + rank;
  const g = sol.create(['Solo']);
  sol.apply(g, 0, { t: 'level', l: 'difficile', mode: 'libre' });
  const b = g.players[0].board;
  const avant = JSON.stringify(b);
  sol.apply(g, 0, { t: 'draw' });
  check('pioche 3 : trois cartes passent à la défausse', b.waste.length === 3 && b.stock.length === 21);
  sol.apply(g, 0, { t: 'undo' });
  check('annuler la pioche : tout revient à l’identique', JSON.stringify(g.players[0].board) === avant);
  // annulations en chaîne : on joue 30 coups au hasard, puis on annule tout
  const h = sol.create(['Solo']);
  sol.apply(h, 0, { t: 'level', l: 'facile', mode: 'libre' });
  const depart = JSON.stringify(h.players[0].board);
  let joues = 0;
  for (let k = 0; k < 400 && joues < 30; k++) {
    const coups = sol._coupsUtiles(h.players[0].board, 1);
    const c = coups[Math.floor(Math.random() * coups.length)];
    if (!c) break;
    const r = c.src.k === 'draw' ? sol.apply(h, 0, { t: 'draw' }) : sol.apply(h, 0, { t: 'move', src: c.src, dst: c.dst });
    if (r.ok) joues++;
  }
  let annules = 0;
  while (sol.apply(h, 0, { t: 'undo' }).ok) annules++;
  check('annulation illimitée : ' + joues + ' coups joués puis annulés, on retrouve la donne', annules === joues && JSON.stringify(h.players[0].board) === depart);
  // l'indice propose d'abord de ranger une carte en fondation
  const t = sol.create(['Solo']);
  t.phase = 'play'; t.draw = 1; t.startTs = Date.now();
  t.players[0].board = { stock: [S(0, 5)], waste: [], found: [[], [], [], []],
    tab: [[{ c: S(2, 7), up: false }, { c: S(1, 0), up: true }], [{ c: S(0, 9), up: true }], [], [], [], [], []] };
  const ind = sol._coupsUtiles(t.players[0].board, 1)[0];
  check('indice : l’as de cœur vers sa fondation (il découvre une carte)', ind && ind.dst && ind.dst.k === 'found' && ind.src.col === 0, ind);
  // plus aucun coup utile
  const bl = { stock: [], waste: [S(0, 4)], found: [[], [], [], []],
    tab: [[{ c: S(1, 7), up: false }, { c: S(0, 9), up: true }], [{ c: S(3, 9), up: true }], [], [], [], [], []] };
  check('blocage détecté : plus aucun coup utile', sol._coupsUtiles(bl, 1).length === 0 && !sol._peutFinir(bl));
  // la fin automatique
  const f = sol.create(['Solo']);
  f.phase = 'play'; f.draw = 1; f.startTs = Date.now();
  const found = [[], [], [], []];
  for (let su = 0; su < 4; su++) for (let rk = 0; rk < 11; rk++) found[su].push(S(su, rk));
  f.players[0].board = { stock: [], waste: [], found: found,
    tab: [[{ c: S(0, 12), up: true }, { c: S(1, 11), up: true }], [{ c: S(1, 12), up: true }], [{ c: S(2, 12), up: true }, { c: S(0, 11), up: true }],
      [{ c: S(3, 12), up: true }, { c: S(2, 11), up: true }], [{ c: S(3, 11), up: true }], [], []] };
  check('tout est découvert : la fin automatique est possible', sol._peutFinir(f.players[0].board));
  sol.apply(f, 0, { t: 'finir' });
  check('fin automatique : les 52 cartes rangées, victoire (cascade avant la clôture)',
    f.players[0].done && f.phase === 'victoire' && !sol.over(f));
  sol.apply(f, 0, { t: 'cloture' });
  check('après la cascade, la partie se clôt', sol.over(f) && JSON.stringify(sol.gagnants(f)) === '[0]');
  // défaite : plus de « Le jeu gagne cette fois… » sec
  const d = sol.create(['Solo']);
  sol.apply(d, 0, { t: 'level', l: 'facile' });
  sol.apply(d, 0, { t: 'giveup' });
  const txt = sol.summary(d);
  check('abandon : un résumé encourageant (cartes rangées, conseil), gagnants = défaite',
    !/Le jeu gagne cette fois/.test(txt) && /rangées sur 52/.test(txt) && sol.gagnants(d) === null, txt.slice(0, 120));
}

console.log('--- Solitaire : donnes gagnables garanties et défi du jour ---');
{
  const G = sol._gagnables;
  check('200 donnes gagnables embarquées pour chaque pioche', G[1].length === 200 && G[3].length === 200);
  // on refait gagner le solveur sur un échantillon, et on REJOUE sa solution avec les vraies règles
  let ok = 0;
  const echantillon = [G[1][0], G[1][57], G[1][123], G[1][199], G[3][0], G[3][88], G[3][150], G[3][199]];
  echantillon.forEach((graine, k) => {
    const pioche = k < 4 ? 1 : 3;
    const r = resoudre(sol._donne(graine), pioche, 120000);
    if (r.ok && rejouer(graine, pioche, r.chemin)) ok++;
  });
  check('échantillon de 8 donnes « gagnables » : gagnées pour de vrai en rejouant la solution', ok === echantillon.length, ok);
  const a = sol.create(['A']), b = sol.create(['B']);
  sol.apply(a, 0, { t: 'level', l: 'facile', mode: 'defi' });
  sol.apply(b, 0, { t: 'level', l: 'difficile', mode: 'defi' });
  check('défi du jour : la même donne pour tout le monde (pioche 1)', a.graine === b.graine && a.draw === 1 && b.draw === 1 &&
    JSON.stringify(a.players[0].board) === JSON.stringify(b.players[0].board) && G[1].indexOf(a.graine) !== -1);
  const c = sol.create(['C']);
  sol.apply(c, 0, { t: 'level', l: 'difficile', mode: 'gagnable' });
  check('donne gagnable : tirée de la liste de la pioche 3', c.mode === 'gagnable' && G[3].indexOf(c.graine) !== -1);
}

Date.now = vraiNow;
module.exports = { check };
if (require.main === module) {
  console.log(failures ? '\n' + failures + ' ÉCHEC(S)' : '\nTests V2 du casino OK.');
  process.exit(failures ? 1 : 0);
}
