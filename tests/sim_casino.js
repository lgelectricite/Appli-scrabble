/*
 * Simulations chiffrées du casino (Node, sans dépendance) — elles jouent le
 * VRAI code des jeux (apply, bot, cashout) :
 *
 *   node tests/sim_casino.js blackjack [mains]   avantage de la maison contre la stratégie de base
 *   node tests/sim_casino.js poker [mains]       robots contre stratégies triviales, part d'abattages
 *   node tests/sim_casino.js jetons [mains]      conservation des jetons (poker et blackjack)
 *   node tests/sim_casino.js reprise [parties]   reprise / appli tuée / cashout : rien ne se crée
 *   node tests/sim_casino.js                     tout (tailles réduites)
 *
 * Chaque section rend un code d'erreur si une mesure sort de sa fourchette.
 */
const ROOT = require('path').join(__dirname, '..');
const store = {};
global.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
};
global.self = global;
require(ROOT + '/js/games/registry.js');
require(ROOT + '/js/games/cartes.js');
const wallet = require(ROOT + '/js/wallet.js');

let failures = 0;
function check(n, c, e) {
  if (c) console.log('  OK  ' + n);
  else { failures++; console.log('  FAIL ' + n + (e !== undefined ? ' -> ' + JSON.stringify(e) : '')); }
}
const pct = x => (x * 100).toFixed(2) + ' %';

/* ================= BLACKJACK : avantage de la maison ================= */
function simBlackjack(mains) {
  const bj = require(ROOT + '/js/games/blackjack.js');
  console.log('--- Blackjack : ' + mains.toLocaleString('fr-FR') + ' mains, stratégie de base parfaite ---');
  const s = bj.create(['Stratège']);
  s.options = { assurance: true, abandon: true };
  const MISE = 10;
  let mise = 0, bilan = 0, bjs = 0, abandons = 0, doubles = 0, splits = 0;
  const sommes = [];
  let somme2 = 0;
  const t0 = Date.now();
  for (let m = 0; m < mains; m++) {
    if (s.phase === 'result') bj.apply(s, 0, { t: 'again' });
    bj.apply(s, 0, { t: 'bet', v: MISE });
    let garde = 0;
    while (s.phase !== 'result' && garde++ < 30) {
      const p = s.players[0];
      if (s.phase === 'assurance') { bj.apply(s, 0, { t: 'assur', oui: false }); continue; }
      const main = p.hi === 1 ? p.hand2 : p.hand;
      const c = bj._conseil(main, s.dealer[0], {
        doubler: main.length === 2 && !(p.hi === 1 ? p.doubled2 : p.doubled),
        separer: !p.split && p.hand.length === 2 && bj._valeurCarte(p.hand[0]) === bj._valeurCarte(p.hand[1]),
        abandon: !p.split && p.hand.length === 2 && !p.doubled
      });
      if (c === 'double') doubles++;
      if (c === 'split') splits++;
      if (c === 'surrender') abandons++;
      const r = bj.apply(s, 0, { t: c });
      if (!r.ok) bj.apply(s, 0, { t: 'stand' });
    }
    const p = s.players[0];
    mise += MISE;
    bilan += p.bilan;
    somme2 += p.bilan * p.bilan;
    if (p.outcome === 'bj') bjs++;
  }
  const moy = bilan / mains;
  const ecart = Math.sqrt(somme2 / mains - moy * moy) / Math.sqrt(mains) / MISE;
  const avantage = -bilan / mise;
  console.log('  mains : ' + mains + ' en ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
  console.log('  blackjacks : ' + pct(bjs / mains) + ' · doubles : ' + pct(doubles / mains) +
    ' · séparations : ' + pct(splits / mains) + ' · abandons : ' + pct(abandons / mains));
  console.log('  AVANTAGE DE LA MAISON : ' + pct(avantage) + ' ± ' + pct(1.96 * ecart) + ' (IC 95 %)');
  // théorie (6 jeux, S17, DAS, pas de re-séparation, abandon tardif) : ≈ 0,3 à 0,5 %
  check('l’avantage de la maison reste positif et modeste (entre 0 et 1,2 %)',
    avantage - 1.96 * ecart < 0.012 && avantage + 1.96 * ecart > 0, pct(avantage));
  // le joueur qui quitte en pleine main n'y gagne rien : vérifié dans test_casino_v2.js
  return avantage;
}

/* ================= POKER ================= */
function simPoker(nb) {
  const pk = require(ROOT + '/js/games/poker.js');
  console.log('--- Poker : robots contre stratégies triviales ---');
  // stratégies triviales du « joueur » (siège 0)
  const TRIV = {
    'tapis à chaque main': () => ({ t: 'allin' }),
    'suit tout': (s, i) => (s.maxBet > s.players[i].bet ? { t: 'call' } : { t: 'check' }),
    'relance tout': (s, i) => {
      const p = s.players[i], owe = s.maxBet - p.bet;
      if (p.chips - owe >= s.minRaise) return { t: 'raise', by: Math.min(p.chips - owe, Math.max(s.minRaise, 6)) };
      return owe > 0 ? { t: 'call' } : { t: 'check' };
    },
    'serré (tapis avec le top 15 %)': (s, i) => {
      const p = s.players[i];
      if (pk._forcePreflop(p.hole) >= 0.85) return { t: 'allin' };
      return s.maxBet > p.bet ? { t: 'fold' } : { t: 'check' };
    }
  };
  function joue(s, i, strat) {
    let r = pk.apply(s, i, strat(s, i));
    if (!r.ok) r = pk.apply(s, i, s.maxBet > s.players[i].bet ? { t: 'call' } : { t: 'check' });
    if (!r.ok) pk.apply(s, i, { t: 'fold' });
  }
  function robot(s, i, niveau) {
    const a = pk._decide(JSON.parse(JSON.stringify(s)), i, niveau);
    if (!a || !pk.apply(s, i, a).ok) pk.apply(s, i, s.maxBet > s.players[i].bet ? { t: 'fold' } : { t: 'check' });
  }
  // 1) tournoi en tête-à-tête (100 jetons chacun, blinds 1/2 qui doublent toutes les 6 mains)
  function tournois(strat, niveau, n) {
    let gagnes = 0;
    for (let t = 0; t < n; t++) {
      const s = pk.create(['Joueur', '🤖 R'], { niveau: niveau });
      s.solo = false; // on pilote nous-mêmes le robot
      pk.apply(s, 0, { t: 'mode', m: 'tournoi' });
      let g = 0;
      while (!s.finished && g++ < 40000) {
        if (s.handOver) { pk.apply(s, 0, { t: 'next' }); continue; }
        if (s.current === 0) joue(s, 0, strat); else robot(s, s.current, niveau);
      }
      if (s.winner === 0) gagnes++;
    }
    return gagnes / n;
  }
  // 2) cash game en tête-à-tête, recaves illimitées : ce que la stratégie
  //    gagne (ou perd) en grosses blinds pour 100 mains
  function cash(strat, niveau, mains) {
    const s = pk.create(['Joueur', '🤖 R'], { niveau: niveau });
    s.solo = false;
    pk.apply(s, 0, { t: 'mode', m: 'cash' });
    let faites = 0, g = 0;
    while (faites < mains && g++ < mains * 40) {
      if (s.handOver) {
        faites++;
        s.players.forEach((p, i) => { if (p.chips < 100) pk.apply(s, i, { t: 'rebuy' }); });
        pk.apply(s, 0, { t: 'next' });
        continue;
      }
      if (s.current === 0) joue(s, 0, strat); else robot(s, s.current, niveau);
    }
    const p = s.players[0];
    return (p.chips - p.achats) / 2 / faites * 100; // bb/100
  }
  const res = {};
  const plancher = (function () {
    // référence : le MEILLEUR contre possible au « tapis à chaque main »
    // (suivre avec un seuil fixe de force, optimisé), dans cette structure
    let best = 1;
    [0.55, 0.65, 0.75].forEach(X => {
      let g = 0; const n = Math.max(300, nb * 2);
      for (let t = 0; t < n; t++) {
        const s = pk.create(['Joueur', 'Oracle']);
        pk.apply(s, 0, { t: 'mode', m: 'tournoi' });
        let k = 0;
        while (!s.finished && k++ < 5000) {
          if (s.handOver) { pk.apply(s, 0, { t: 'next' }); continue; }
          const i = s.current, p = s.players[i];
          if (i === 0) { joue(s, 0, TRIV['tapis à chaque main']); continue; }
          const a = s.players[0].allin || s.maxBet - p.bet > p.chips * 0.5
            ? (pk._forcePreflop(p.hole) >= X ? { t: 'call' } : { t: 'fold' })
            : (s.maxBet > p.bet ? { t: 'call' } : { t: 'check' });
          if (!pk.apply(s, i, a).ok) pk.apply(s, i, { t: 'fold' });
        }
        if (s.winner === 0) g++;
      }
      best = Math.min(best, g / n);
    });
    return best;
  })();
  console.log('  référence : même face au meilleur contre possible, « tapis à chaque main » gagne ' +
    pct(plancher) + ' des tournois (un seul pile-ou-face décide souvent de tout)');
  for (const niveau of ['facile', 'moyen', 'difficile']) {
    for (const nom of Object.keys(TRIV)) {
      const t = tournois(TRIV[nom], niveau, nb);
      const c = cash(TRIV[nom], niveau, nb * (nom === "tapis à chaque main" ? 100 : 25));
      res[niveau + ':' + nom] = { t, c };
      console.log('  ' + niveau.padEnd(9) + ' · « ' + nom + ' » : gagne ' + pct(t) + ' des tournois (espérance ' +
        ((2 * t - 1) * 100).toFixed(0) + ' % de la cave) · cash game ' + (c >= 0 ? '+' : '') + c.toFixed(1) + ' bb/100');
    }
  }
  ['moyen', 'difficile'].forEach(niveau => {
    check(niveau + ' : « tapis à chaque main » perd de l’argent en tournoi (gagne < 50 % ; 78,8 % avant)',
      res[niveau + ':tapis à chaque main'].t < 0.5, res[niveau + ':tapis à chaque main']);
    Object.keys(TRIV).forEach(nom => {
      check(niveau + ' : « ' + nom + ' » perd en cash game', res[niveau + ':' + nom].c < 0, res[niveau + ':' + nom]);
    });
  });
  check('facile : « tapis à chaque main » ne gagne pas plus d’un duel sur deux', res['facile:tapis à chaque main'].t < 0.5,
    res['facile:tapis à chaque main']);
  // à 4 : part des mains qui vont à l'abattage (16 % avant)
  ['facile', 'moyen', 'difficile'].forEach(niveau => {
    let abat = 0, mains = 0, flops = 0;
    for (let t = 0; t < Math.max(4, nb / 10); t++) {
      const s = pk.create(['🤖 A', '🤖 B', '🤖 C', '🤖 D'], { niveau: niveau });
      s.solo = false;
      pk.apply(s, 0, { t: 'mode', m: 'cash' });
      for (let h = 0; h < 60; h++) {
        let g = 0, flop = false;
        while (!s.handOver && g++ < 300) {
          if (s.community.length) flop = true;
          robot(s, s.current, niveau);
        }
        mains++;
        if (flop || (s.community && s.community.length)) flops++;
        if (s.resultat && !s.resultat.sansAbattage) abat++;
        s.players.forEach(p => { if (p.chips === 0) p.chips = 100; });
        pk.apply(s, 0, { t: 'next' });
      }
    }
    console.log('  à 4 robots « ' + niveau + ' » : ' + pct(abat / mains) + ' des mains vont à l’abattage, flop vu ' + pct(flops / mains));
    if (niveau !== 'facile') check('à 4 (' + niveau + ') : entre 15 et 60 % des mains vont à l’abattage (16 % avant, avec 84 % sans abattage)',
      abat / mains > 0.15 && abat / mains < 0.6, pct(abat / mains));
  });
}

/* ================= CONSERVATION DES JETONS ================= */
function simJetons(mains) {
  const pk = require(ROOT + '/js/games/poker.js');
  console.log('--- Poker : conservation des jetons sur ' + mains.toLocaleString('fr-FR') + ' mains ---');
  let ecarts = 0, faits = 0, g = 0;
  const s = pk.create(['A', 'B', 'C', 'D']);
  pk.apply(s, 0, { t: 'mode', m: 'cash' });
  let achats = 400;
  const rnd = () => Math.random();
  while (faits < mains && g++ < mains * 60) {
    if (s.handOver) {
      faits++;
      const total = s.players.reduce((a, p) => a + p.chips, 0);
      if (total !== achats) ecarts++;
      s.players.forEach((p, i) => {
        if (p.chips < 100 && rnd() < 0.3) {
          const avant = p.chips;
          if (pk.apply(s, i, { t: 'rebuy' }).ok) achats += p.chips - avant;
        }
      });
      pk.apply(s, 0, { t: 'next' });
      continue;
    }
    const i = s.current, p = s.players[i], owe = s.maxBet - p.bet, x = rnd();
    let a;
    if (x < 0.15) a = { t: 'fold' };
    else if (x < 0.55) a = owe > 0 ? { t: 'call' } : { t: 'check' };
    else if (x < 0.85) a = { t: 'raise', by: s.minRaise + Math.floor(rnd() * 20) };
    else a = { t: 'allin' };
    if (!pk.apply(s, i, a).ok && !pk.apply(s, i, owe > 0 ? { t: 'call' } : { t: 'check' }).ok) pk.apply(s, i, { t: 'fold' });
    // en pleine main : jetons + contributions au pot = achats
    const tot = s.players.reduce((q, pp) => q + pp.chips + pp.cont, 0);
    if (!s.handOver && tot !== achats) ecarts++;
  }
  console.log('  ' + faits + ' mains, ' + (achats - 400) + ' jetons de recaves ; écarts de conservation : ' + ecarts);
  check('poker : aucun jeton créé ni détruit (pots, pots annexes, partages, recaves)', ecarts === 0 && faits === mains, { ecarts, faits });

  const bj = require(ROOT + '/js/games/blackjack.js');
  console.log('--- Blackjack : la cagnotte suit la table au demi-jeton près ---');
  store['gg-jetons'] = JSON.stringify({ n: 1000000, ts: Date.now(), vu: Date.now(), demi: 0 });
  delete store['gg-bj-compte'];
  const t = bj.create(['Solo']);
  bj._regler(t, 0);
  const w0 = wallet.get();
  let n = 0;
  const nb = Math.min(mains, 50000);
  while (n < nb) {
    if (t.phase === 'result') bj.apply(t, 0, { t: 'again' });
    bj.apply(t, 0, { t: 'bet', v: 1 + Math.floor(rnd() * 60) });
    bj._regler(bj.redact(t, 0), 0);
    let gg = 0;
    while (t.phase !== 'result' && gg++ < 30) {
      if (t.phase === 'assurance') bj.apply(t, 0, { t: 'assur', oui: rnd() < 0.5 });
      else {
        const acts = ['hit', 'stand', 'double', 'split', 'surrender'];
        if (!bj.apply(t, 0, { t: acts[Math.floor(rnd() * acts.length)] }).ok) bj.apply(t, 0, { t: 'stand' });
      }
      bj._regler(bj.redact(t, 0), 0);
    }
    n++;
  }
  const p = t.players[0];
  const attendu = w0 - p.engage + p.retour;
  const reel = wallet.get() + (wallet.demi() ? 0.5 : 0);
  console.log('  ' + nb + ' mains au hasard (doubles, séparations, assurances, abandons) : cagnotte ' + reel + ', attendu ' + attendu);
  check('blackjack : la cagnotte = départ − misé + rendu, au demi-jeton près', reel === attendu, { reel, attendu });
}

/* ================= REPRISE / APPLI TUÉE / CASHOUT ================= */
function simReprise(parties) {
  const pk = require(ROOT + '/js/games/poker.js');
  const bj = require(ROOT + '/js/games/blackjack.js');
  console.log('--- Reprise, appli tuée, abandon : ' + parties + ' parties de chaque ---');
  const rnd = () => Math.random();
  /* Poker solo : on joue, on « tue » l'appli à un moment au hasard (l'état
     enregistré peut avoir un coup de retard), puis la coque reprend, ou
     l'abandonne (cashout), ou rembourse le marqueur orphelin. À la fin, la
     cagnotte doit valoir : départ − achats + pile finale. */
  let erreursPk = 0;
  for (let k = 0; k < parties; k++) {
    store['gg-jetons'] = JSON.stringify({ n: 100000, ts: Date.now(), vu: Date.now(), demi: 0 });
    delete store['gg-poker-open'];
    const w0 = wallet.get();
    let s = pk.create(['Moi', '🤖 A', '🤖 B'], { niveau: 'moyen' });
    s.solo = true;
    pk._reconcilier(s, 0); // premier affichage : on s'assoit avec 100
    pk.apply(s, 0, { t: 'mode', m: 'cash' });
    pk._reconcilier(s, 0);
    let sauve = JSON.parse(JSON.stringify(s));
    const coups = 20 + Math.floor(rnd() * 200);
    for (let c = 0; c < coups && !s.finished; c++) {
      if (s.handOver) {
        if (s.players[0].chips < 100 && rnd() < 0.5) pk.apply(s, 0, { t: 'rebuy' });
        else pk.apply(s, 0, { t: 'next' });
      } else if (s.current === 0) {
        const owe = s.maxBet - s.players[0].bet;
        const x = rnd();
        pk.apply(s, 0, x < 0.2 ? { t: 'fold' } : x < 0.8 ? (owe > 0 ? { t: 'call' } : { t: 'check' }) : { t: 'allin' });
      } else {
        const a = pk._decide(JSON.parse(JSON.stringify(s)), s.current, 'moyen');
        if (!pk.apply(s, s.current, a).ok) pk.apply(s, s.current, { t: 'fold' });
      }
      pk._reconcilier(s, 0);                          // l'écran suit l'état
      if (rnd() < 0.7) sauve = JSON.parse(JSON.stringify(s)); // la sauvegarde a parfois un coup de retard
    }
    // l'appli est tuée ici. Trois suites possibles :
    const suite = k % 3;
    const orphelin = JSON.parse(store['gg-poker-open'] || 'null');
    let finale;
    if (suite === 0) {
      // on reprend la partie enregistrée, on la joue un peu, on quitte
      s = sauve;
      pk._reconcilier(s, 0);
      finale = s.players[0].chips;
      pk.cashout(s, 0);
    } else if (suite === 1) {
      // on renonce à la reprise : la coque appelle cashout sur l'état enregistré
      finale = sauve.players[0].chips;
      pk.cashout(sauve, 0);
    } else {
      // la sauvegarde a disparu : la coque rembourse le marqueur orphelin
      if (orphelin && orphelin.invested) wallet.add(orphelin.invested);
      delete store['gg-poker-open'];
      finale = orphelin ? orphelin.invested : 0;
    }
    const achats = (suite === 2 ? s : (suite === 0 ? s : sauve)).players[0].achats;
    const attendu = w0 - achats + finale;
    if (wallet.get() !== attendu) {
      erreursPk++;
      if (erreursPk < 4) console.log('    écart poker (suite ' + suite + ') : ' + wallet.get() + ' au lieu de ' + attendu);
    }
  }
  check('poker : ' + parties + ' parties tuées / reprises / abandonnées — on retrouve EXACTEMENT sa pile', erreursPk === 0, erreursPk);

  let erreursBj = 0;
  for (let k = 0; k < parties; k++) {
    store['gg-jetons'] = JSON.stringify({ n: 100000, ts: Date.now(), vu: Date.now(), demi: 0 });
    delete store['gg-bj-compte'];
    const w0 = wallet.get() + (wallet.demi() ? 0.5 : 0);
    let s = bj.create(['Moi']);
    bj._regler(s, 0);
    let sauve = JSON.parse(JSON.stringify(s));
    const coups = 5 + Math.floor(rnd() * 60);
    for (let c = 0; c < coups; c++) {
      if (s.phase === 'result') bj.apply(s, 0, rnd() < 0.5 ? { t: 'again' } : { t: 'again', mise: 5 + Math.floor(rnd() * 20) });
      else if (s.phase === 'bet') bj.apply(s, 0, { t: 'bet', v: 1 + Math.floor(rnd() * 99) });
      else if (s.phase === 'assurance') bj.apply(s, 0, { t: 'assur', oui: rnd() < 0.5 });
      else {
        const acts = ['hit', 'stand', 'double', 'split', 'surrender'];
        if (!bj.apply(s, 0, { t: acts[Math.floor(rnd() * 5)] }).ok) bj.apply(s, 0, { t: 'stand' });
      }
      bj._regler(bj.redact(s, 0), 0);
      if (rnd() < 0.7) sauve = JSON.parse(JSON.stringify(s));
    }
    // appli tuée : on reprend (ou non) la partie enregistrée, puis on quitte
    const repris = k % 2 === 0 ? sauve : sauve;
    bj._regler(bj.redact(repris, 0), 0);
    if (k % 2 === 0 && repris.phase === 'play') bj.apply(repris, 0, { t: 'stand' });
    bj._regler(bj.redact(repris, 0), 0);
    bj.cashout(repris, 0);
    // attendu : la table (état repris, joué d'office jusqu'au bout) a été réglée exactement
    const fin = JSON.parse(JSON.stringify(repris));
    let g2 = 0;
    while ((fin.phase === 'play' || fin.phase === 'assurance') && g2++ < 40) {
      if (fin.phase === 'assurance') bj.apply(fin, 0, { t: 'assur', oui: false });
      else bj.apply(fin, 0, { t: 'stand' });
    }
    const p = fin.players[0];
    const rendu = fin.phase === 'bet' && p.bet > 0 ? p.bet : 0;
    const attendu = w0 - p.engage + p.retour + rendu;
    const reel = wallet.get() + (wallet.demi() ? 0.5 : 0);
    if (Math.abs(reel - attendu) > 1e-9) {
      erreursBj++;
      if (erreursBj < 4) console.log('    écart blackjack : ' + reel + ' au lieu de ' + attendu);
    }
  }
  check('blackjack : ' + parties + ' parties tuées / reprises / quittées — cagnotte exacte', erreursBj === 0, erreursBj);
}

const quoi = process.argv[2] || 'tout';
const n = process.argv[3] ? parseInt(process.argv[3], 10) : 0;
if (quoi === 'blackjack' || quoi === 'tout') simBlackjack(n || (quoi === 'tout' ? 200000 : 2000000));
if (quoi === 'poker' || quoi === 'tout') simPoker(n || (quoi === 'tout' ? 80 : 400));
if (quoi === 'jetons' || quoi === 'tout') simJetons(n || (quoi === 'tout' ? 20000 : 100000));
if (quoi === 'reprise' || quoi === 'tout') simReprise(n || (quoi === 'tout' ? 150 : 1000));
console.log(failures ? '\n' + failures + ' ÉCHEC(S)' : '\nSimulations OK.');
process.exit(failures ? 1 : 0);
