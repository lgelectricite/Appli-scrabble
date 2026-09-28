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

Date.now = vraiNow;
module.exports = { check };
if (require.main === module) {
  console.log(failures ? '\n' + failures + ' ÉCHEC(S)' : '\nTests V2 du casino OK.');
  process.exit(failures ? 1 : 0);
}
