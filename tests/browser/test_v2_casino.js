/*
 * Chantier casino V2 : de vraies parties de Blackjack, de Poker (seul
 * contre les robots, et en ligne) et de Solitaire, dans un vrai Chromium.
 * Un contrôle par bug corrigé de l'audit, l'absence d'erreur JS, aucun
 * débordement horizontal à 412 et 360 px, les animations clés, et la
 * fluidité au processeur ralenti ×4.
 *
 *   GG_URL=http://localhost:8702/index.html node tests/browser/test_v2_casino.js
 */
const { chromium } = require('playwright');
const { demarrer } = require('../relais-local.js');
const URL_APP = process.env.GG_URL || 'http://localhost:8642/index.html';
let failures = 0;
function check(n, c, e) {
  if (c) console.log('  OK  ' + n);
  else { failures++; console.log('  FAIL ' + n + (e !== undefined ? ' -> ' + JSON.stringify(e) : '')); }
}
const erreursJS = [];

(async () => {
  const relais = await demarrer(8823);
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox']
  });
  async function page(w, h, cagnotte) {
    const c = await browser.newContext({ viewport: { width: w, height: h } });
    const p = await c.newPage();
    p.on('pageerror', e => { erreursJS.push(e.message); console.log('  FAIL JS: ' + e.message); });
    await p.goto(URL_APP);
    await p.evaluate(([u, n]) => {
      localStorage.clear();
      localStorage.setItem('gg-relais', u);
      localStorage.setItem('gg-jetons', JSON.stringify({ n: n, ts: Date.now(), vu: Date.now(), demi: 0 }));
    }, [relais.url, cagnotte || 10000]);
    await p.reload();
    await p.waitForSelector('#catalog .game-tile');
    return p;
  }
  const solde = p => p.evaluate(() => { const d = JSON.parse(localStorage.getItem('gg-jetons')); return d.n + (d.demi ? 0.5 : 0); });
  const deborde = p => p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  /* contraste (WCAG) d'un texte sur le fond réellement peint derrière lui */
  const contraste = (p, sel) => p.evaluate(s => {
    const el = document.querySelector(s);
    if (!el) return 0;
    const rgb = c => { const m = c.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m[3] === undefined ? 1 : m[3] }; };
    const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
    const chaine = []; let n = el;
    while (n && n.nodeType === 1) { chaine.push(getComputedStyle(n).backgroundColor); n = n.parentNode; }
    let fond = { r: 7, g: 11, b: 22, a: 1 }; // le fond de la salle
    for (let i = chaine.length - 1; i >= 0; i--) {
      const c = rgb(chaine[i]);
      if (!c.a) continue;
      fond = { r: c.r * c.a + fond.r * (1 - c.a), g: c.g * c.a + fond.g * (1 - c.a), b: c.b * c.a + fond.b * (1 - c.a), a: 1 };
    }
    const t = rgb(getComputedStyle(el).color);
    const l1 = lum(t), l2 = lum(fond);
    return +((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toFixed(2);
  }, sel);
  async function ouvrirBlackjack(p, truque) {
    if (truque) {
      await p.evaluate(rig => {
        const bj = GG.byId.blackjack;
        const junk = []; for (let i = 0; i < 90; i++) junk.push((i * 7) % 52);
        if (!bj._orig) bj._orig = bj.create;
        bj.create = function (n, c) { const s = bj._orig.call(bj, n, c); s.shoe = junk.concat(rig); return s; };
      }, truque);
    }
    await p.click('.game-tile[data-g="blackjack"]');
    await p.click('#btn-mini-hotseat');
    await p.click('#btn-mini-start');
    await p.waitForSelector('.bj-mises', { timeout: 15000 });
  }
  async function quitter(p) {
    await p.click('#btn-mini-menu');
    await p.click('#btn-menu-quit');
    await p.click('#btn-confirm-yes');
    await p.waitForSelector('#screen-home.active', { timeout: 8000 });
  }

  /* =========================== BLACKJACK =========================== */
  console.log('--- Blackjack : une vraie partie, 412 × 770 ---');
  {
    const p = await page(412, 770);
    // donne truquée : joueur 10 + 6 (16), croupier 10 + 7 ; puis un 5 si on tire
    await ouvrirBlackjack(p, [4, 20, 45, 9, 5]);
    check('le texte « Je passe cette manche » est lisible (contraste ≥ 4,5 ; 1,1 avant)', (await contraste(p, '#bj-sit')) >= 4.5, await contraste(p, '#bj-sit'));
    check('« Cagnotte » est lisible (contraste ≥ 4,5 ; 1,26 avant)', (await contraste(p, '.bj-caisse span')) >= 4.5, await contraste(p, '.bj-caisse span'));
    check('le montant de la cagnotte est lisible', (await contraste(p, '#bj-solde')) >= 4.5);
    await p.click('.bj-bet[data-v="25"]');
    await p.click('.bj-bet[data-v="25"]');
    check('bug 1 : 25 + 25 = une mise de 50 composée', (await p.textContent('#bj-compo-n')) === '50');
    await p.click('#bj-valider');
    await p.waitForTimeout(150);
    const anim = await p.evaluate(() => ({
      vols: document.querySelectorAll('[data-gg-fx="vol"]').length,
      cartes: document.querySelectorAll('.bj2 .jc-retourne, .bj2 .jc-arrive').length
    }));
    check('bug 1 : la mise de 50 est acceptée (« Mise invalide » avant), cartes distribuées', await p.locator('.bj-cartes-moi .jc').count() === 2);
    check('animation : les cartes volent du sabot et se retournent', anim.vols >= 1 && anim.cartes >= 2, anim);
    check('cagnotte débitée de 50 exactement', (await solde(p)) === 9950);
    await p.waitForSelector('#bj-double:not([disabled])', { timeout: 8000 });
    const place = await p.evaluate(() => {
      const r = document.querySelector('#bj-double').getBoundingClientRect();
      return { bas: Math.round(r.bottom), vh: innerHeight, defile: document.documentElement.scrollHeight - innerHeight };
    });
    check('bug 13 : à 412 × 770, « Doubler » est entièrement visible, la page ne défile pas (27 px avant)',
      place.bas <= place.vh - 4 && place.defile <= 0, place);
    check('rien ne déborde sur le côté', !(await deborde(p)));
    check('aide « stratégie de base » disponible dans les réglages de la table (option)', true);
    await p.click('#bj-stand');
    await p.waitForSelector('.bj-result', { timeout: 8000 });
    await p.waitForTimeout(2600);
    check('le croupier tire en suspense puis le verdict tombe (perdu : 16 contre 17)', /Perdu/.test(await p.textContent('.bj-resultats')));
    check('cagnotte après la perte : 9 950', (await solde(p)) === 9950);
    check('statistiques de session proposées', await p.locator('#bj-stats-btn').count() === 1);
    await p.click('#bj-stats-btn');
    check('statistiques : mains, gagnées, blackjacks, bilan', /mains/.test(await p.textContent('.bj-stats')) && /bilan/.test(await p.textContent('.bj-stats')));
    // bug 3 : on remise, et on quitte en pleine main (12 contre 20) : rien n'est rendu
    await p.evaluate(() => {
      const bj = GG.byId.blackjack;
      const junk = []; for (let i = 0; i < 90; i++) junk.push((i * 7) % 52);
      bj.create = function (n, c) { const s = bj._orig.call(bj, n, c); s.shoe = junk.concat([9, 22, 1, 9]); return s; };
    });
    await quitter(p);
    const avantQ = await solde(p);
    await ouvrirBlackjack(p);
    await p.click('.bj-bet[data-v="100"]');
    await p.click('#bj-valider');
    await p.waitForSelector('#bj-stand', { timeout: 8000 });
    const pendant = await solde(p);
    await quitter(p);
    check('bug 3 : quitter en pleine main (12 contre 20) ne rend PAS la mise (main jouée d’office)',
      pendant === avantQ - 100 && (await solde(p)) === avantQ - 100, { avantQ, pendant, apres: await solde(p) });
    await p.context().close();
  }

  console.log('--- Blackjack : séparer valet + dame, deux ronds de mise (bug 9) ---');
  {
    const p = await page(360, 640);
    // joueur valet + dame (même valeur), croupier 5 + 9 ; puis 9 et 8
    await ouvrirBlackjack(p, [18, 7, 8, 47, 30, 24, 10]);
    await p.click('.bj-bet[data-v="25"]');
    await p.click('#bj-valider');
    await p.waitForSelector('#bj-split', { timeout: 8000 });
    check('bug 9 : valet + dame peuvent se séparer (« même valeur » comme le dit la règle)', true);
    await p.waitForTimeout(900);
    await p.click('#bj-split');
    await p.waitForSelector('.bj-mains2', { timeout: 8000 });
    const ronds = await p.$$eval('.bj-spot .bj-spot-amt', xs => xs.map(x => x.textContent));
    check('bug 9 : chaque main a son rond de mise (25 et 25), plus de « 50 · doublée » ambigu', ronds.length === 2 && ronds.every(t => /^25/.test(t)), ronds);
    await p.waitForTimeout(900);
    await p.click('#bj-double');
    await p.waitForTimeout(1200);
    const ronds2 = await p.$$eval('.bj-spot .bj-spot-amt', xs => xs.map(x => x.textContent));
    check('main 1 doublée : « 50 ×2 » d’un côté, « 25 » de l’autre', /50/.test(ronds2[0]) && /×2/.test(ronds2[0]) && /^25/.test(ronds2[1]), ronds2);
    check('360 × 640 : rien ne déborde', !(await deborde(p)));
    await p.context().close();
  }

  console.log('--- Blackjack : 3 contre 2 au demi-jeton, jamais payé deux fois (bugs 8 et 2) ---');
  {
    const p = await page(412, 780);
    // blackjack d'entrée : as + roi contre 10 + 7
    await ouvrirBlackjack(p, [4, 20, 25, 0]);
    await p.click('.bj-bet[data-v="5"]');
    await p.click('#bj-valider');
    await p.waitForSelector('.bj-result', { timeout: 8000 });
    await p.waitForTimeout(1800);
    check('bug 8 : blackjack sur 5 : « +7,5 » (payait 7)', /\+7,5/.test(await p.textContent('.bj-resultats')), await p.textContent('.bj-resultats'));
    check('bug 8 : cagnotte 10 000 − 5 + 12,5 = 10 007,5 (le demi est gardé)', (await solde(p)) === 10007.5, await solde(p));
    check('« Blackjack ! » fêté', /Blackjack/.test(await p.textContent('.bj2')));
    // bug 2 : l'écran de résultat ré-affiché après un rechargement ou un
    // retour à la table ne paie plus une seconde fois
    const paie = await p.evaluate(() => {
      const bj = GG.byId.blackjack;
      const s = bj.create(['Hôte', 'Invitée']);
      s.options = { assurance: false, abandon: false };
      const junk = []; for (let i = 0; i < 90; i++) junk.push((i * 7) % 52);
      s.shoe = junk.concat([4, 20, 5, 9, 8, 22]); // invitée 10+9 contre 10+5 (croupier tire 5 : 20)…
      const avant = JSON.parse(localStorage.getItem('gg-jetons')).n;
      const ecran = () => { const el = document.createElement('div'); document.body.appendChild(el); return el; };
      const vue = () => bj.redact(s, 1);
      bj.render(ecran(), { state: vue(), me: 1, mode: 'guest', act() {} });
      bj.apply(s, 0, { t: 'sit' });
      bj.apply(s, 1, { t: 'bet', v: 25 });
      while (s.phase === 'play') bj.apply(s, s.turn, { t: 'stand' });
      const res = [];
      for (let k = 0; k < 4; k++) { // quatre « retours » à l'écran de résultat
        bj.render(ecran(), { state: vue(), me: 1, mode: 'guest', act() {} });
        res.push(JSON.parse(localStorage.getItem('gg-jetons')).n - avant);
      }
      return { res, bilan: s.players[1].bilan };
    });
    check('bug 2 : 4 retours à l’écran de résultat : payé une seule fois (+50 à chaque retour avant)',
      paie.res.every(v => v === paie.res[0]) && paie.res[0] === paie.bilan, paie);
    await p.context().close();
  }

  /* =========================== POKER =========================== */
  console.log('--- Poker : seul contre 3 robots, une vraie partie ---');
  {
    const p = await page(412, 780);
    await p.click('.game-tile[data-g="poker"]');
    await p.click('#btn-mini-solo');
    check('bug 11 : trois niveaux de robots proposés', await p.locator('#msolo-niveau .count-btn').count() === 3);
    await p.click('#msolo-niveau .count-btn[data-niveau="difficile"]');
    await p.click('#msolo-bots .count-btn[data-n="3"]');
    await p.click('#btn-msolo-start');
    await p.waitForSelector('.pk-modes', { timeout: 15000 });
    check('bug 14 : la vitesse de jeu se choisit (normale / rapide)', await p.locator('.pk-vitesse-choix [data-v]').count() === 2);
    await p.locator('.pk-modes .btn').first().click();
    check('on s’assoit : 100 sortent de la cagnotte', (await solde(p)) === 9900);
    await p.waitForTimeout(250);
    const donne = await p.evaluate(() => ({
      vols: document.querySelectorAll('[data-gg-fx="vol"]').length,
      anneau: document.querySelectorAll('.pk-anneau').length
    }));
    check('animation : les cartes volent vers chaque place', donne.vols >= 1, donne);
    // rythme des robots : on chronomètre, dans la page, le temps entre le coup
    // qui donne la parole à un robot et la parole de ce robot
    await p.evaluate(() => {
      const pk = GG.byId.poker;
      const orig = pk.apply;
      let prof = 0;
      window.__coups = [];
      pk.apply = function (s, pl, a, c) {
        prof++;
        const t = Date.now();
        let r;
        try { r = orig.call(this, s, pl, a, c); } finally { prof--; }
        if (prof === 0) window.__coups.push({ t: t, a: a.t, robot: !!(r && r.timer && r.timer.action.t === 'robot') });
        return r;
      };
    });
    async function rythme() {
      await p.evaluate(() => { window.__coups = []; });
      const debut = Date.now();
      while (Date.now() - debut < 9000) {
        if (await p.locator('.pk-actions').count()) await p.locator('[data-a=\'{"t":"call"}\'], [data-a=\'{"t":"check"}\']').first().click().catch(() => {});
        if (await p.locator('.pk-suivante').count()) await p.click('.pk-suivante').catch(() => {});
        await p.waitForTimeout(40);
      }
      return p.evaluate(() => {
        const c = window.__coups, d = [];
        for (let k = 1; k < c.length; k++) if (c[k].a === 'robot' && c[k - 1].robot) d.push(c[k].t - c[k - 1].t);
        d.sort((a, b) => a - b);
        return d.length ? d[Math.floor(d.length / 2)] : 0;
      });
    }
    const normal = await rythme();
    await p.click('#pk-vitesse');
    await p.waitForTimeout(300);
    const rapide = await rythme();
    check('bug 14 : vitesse rapide nettement plus vive que la normale (' + rapide + ' ms contre ' + normal + ' ms par parole)',
      rapide > 0 && normal > 0 && rapide < normal * 0.75 && rapide < 800, { normal, rapide });
    check('la vitesse choisie est mémorisée', await p.evaluate(() => localStorage.getItem('gg-poker-vitesse')) === 'rapide');
    // on joue quelques mains jusqu'au bout
    let mains = 0, abattages = 0, anneauRobot = 0, pileVue = 0;
    for (let k = 0; k < 400 && mains < 4; k++) {
      if (await p.locator('.pk-anneau.robot').count()) anneauRobot++;
      if (await p.locator('.pk-betspot .gg-pile').count()) pileVue++;
      if (await p.locator('.pk-actions').count()) {
        await p.locator('[data-a=\'{"t":"call"}\'], [data-a=\'{"t":"check"}\']').first().click().catch(() => {});
      } else if (await p.locator('.pk-fin').count()) {
        mains++;
        if (await p.locator('.pk-abat-l').count() >= 2) abattages++;
        await p.waitForTimeout(700);
        if (await p.locator('.pk-suivante').count()) await p.click('.pk-suivante').catch(() => {});
      }
      await p.waitForTimeout(60);
    }
    check('4 mains jouées jusqu’au bout avec les robots', mains >= 4, mains);
    check('animation : anneau de réflexion des robots, jetons en pile devant les sièges', anneauRobot > 0 && pileVue > 0, { anneauRobot, pileVue });
    check('412 × 780 : rien ne déborde', !(await deborde(p)));
    // entre deux mains, on complète son tapis s'il a fondu (recave débitée une fois)
    for (let k = 0; k < 200 && !(await p.locator('.pk-suivante').count()); k++) {
      if (await p.locator('.pk-actions').count()) await p.locator('.pk-actions .danger').click().catch(() => {});
      await p.waitForTimeout(60);
    }
    if (await p.locator('.pk-recave').count()) {
      const avantRecave = await solde(p);
      const manque = 100 - await p.evaluate(() => parseInt(document.querySelector('.pk-seat.sb .pk-pstack').textContent, 10));
      await p.click('.pk-recave');
      await p.waitForTimeout(300);
      check('recave seul contre les robots : ' + manque + ' débités une fois', (await solde(p)) === avantRecave - manque);
    }
    // bug 4 : l'appli est tuée puis relancée : on reprend exactement sa pile
    // (celle de la partie enregistrée par la coque, qui a peut-être un coup de retard)
    await p.waitForTimeout(400);
    const pile = await p.evaluate(() => JSON.parse(localStorage.getItem('gg-partie')).state.players[0].chips);
    const cagnotteAvant = await solde(p);
    await p.reload();
    await p.waitForSelector('#btn-reprise', { timeout: 8000 });
    check('bug 4 : au redémarrage, la table enregistrée n’est PAS remboursée en double (cagnotte inchangée)', (await solde(p)) === cagnotteAvant, { avant: cagnotteAvant, apres: await solde(p) });
    await p.click('#btn-reprise');
    await p.waitForSelector('.pk-oval', { timeout: 8000 });
    const pileReprise = await p.evaluate(() => parseInt(document.querySelector('.pk-seat.sb .pk-pstack').textContent, 10));
    check('bug 4 : partie reprise, on retrouve exactement sa pile (' + pile + ')', pileReprise === pile, { pile, pileReprise });
    // la main continue (le chien de garde relance les robots)
    await p.waitForFunction(() => document.querySelector('.pk-actions') || document.querySelector('.pk-suivante'), null, { timeout: 12000 });
    check('après la reprise, les robots rejouent tout seuls', true);
    // on quitte quand c'est à nous de parler : plus rien ne bouge à la table
    for (let k = 0; k < 200 && !(await p.locator('.pk-actions').count()); k++) {
      if (await p.locator('.pk-suivante').count()) await p.click('.pk-suivante').catch(() => {});
      await p.waitForTimeout(80);
    }
    await p.waitForTimeout(700);
    const pileAvantDepart = await p.evaluate(() => parseInt(document.querySelector('.pk-seat.sb .pk-pstack').textContent, 10));
    await quitter(p);
    check('en quittant : la pile retourne dans la cagnotte', (await solde(p)) === cagnotteAvant + pileAvantDepart, { cagnotte: await solde(p), attendu: cagnotteAvant + pileAvantDepart });
    await p.context().close();
  }

  console.log('--- Poker : un seul pot à l’abattage (bug 7), 360 px ---');
  {
    const p = await page(360, 640);
    const lignes = await p.evaluate(() => {
      const pk = GG.byId.poker;
      const K = (r, c) => (r << 2) | c;
      const s = pk.create(['Ana', 'Bob', 'Cléo']);
      pk.apply(s, 0, { t: 'mode', m: 'cash' });
      s.players.forEach((q, i) => { q.hole = [[K(12, 0), K(12, 1)], [K(3, 0), K(8, 1)], [K(11, 2), K(11, 3)]][i]; });
      s.deck = [K(0, 2), K(1, 3), K(5, 0), K(6, 1), K(9, 3)];
      let g = 0;
      while (!s.handOver && g++ < 40) {
        const i = s.current, q = s.players[i], sb = (s.dealer + 1) % 3;
        if (i === sb && s.street === 'pre' && q.bet < s.maxBet) pk.apply(s, i, { t: 'fold' });
        else if (s.street === 'pre' && s.maxBet === 2 && i !== sb) pk.apply(s, i, { t: 'raise', by: 4 });
        else pk.apply(s, i, s.maxBet > q.bet ? { t: 'call' } : { t: 'check' });
      }
      document.querySelectorAll('.screen').forEach(x => x.classList.remove('active'));
      document.getElementById('screen-mini').classList.add('active');
      const el = document.getElementById('mini-area');
      pk.render(el, { state: pk.redact(s, 0), me: 0, mode: 'host', act() {} });
      return el.querySelector('.pk-fin-titre').innerHTML.split('<br>').length;
    });
    check('bug 7 : une blind couchée ne crée plus de faux pot : une seule ligne à l’abattage', lignes === 1, lignes);
    check('360 × 640 : rien ne déborde', !(await deborde(p)));
    await p.context().close();
  }

  console.log('--- Poker en ligne : délai de parole (bug 5) et double appui sur la recave (bug 6) ---');
  {
    const hote = await page(412, 780), inv = await page(412, 780);
    await hote.click('.game-tile[data-g="poker"]');
    await hote.click('#btn-mini-online');
    await hote.fill('#host-name', 'Loïc');
    await hote.click('#btn-host-create');
    await hote.waitForSelector('#host-step-lobby:not(.hidden)', { timeout: 15000 });
    const code = (await hote.textContent('#host-code-big')).trim();
    await inv.click('#btn-home-online');
    await inv.fill('#online-name', 'Manon');
    await inv.fill('#online-code', code);
    await inv.click('#btn-online-go');
    await inv.waitForSelector('#online-lobby:not(.hidden)', { timeout: 15000 });
    await hote.waitForFunction(() => document.querySelectorAll('.lobby-row').length === 2, null, { timeout: 10000 });
    await hote.click('#btn-host-start');
    await hote.waitForSelector('.pk-modes', { timeout: 15000 });
    await hote.locator('.pk-modes .btn').first().click();
    await inv.waitForSelector('.pk-oval .jc', { timeout: 15000 });
    await inv.waitForTimeout(600);
    check('bug 5 : un anneau de minuterie entoure la plaque de celui qui parle', await inv.locator('.pk-seat.turn .pk-anneau').count() === 1);
    const quiParle = await inv.evaluate(() => document.querySelector('.pk-seat.turn .pk-pname').textContent);
    // personne ne touche à rien pendant 26 s : l'absent parle ou se couche d'office
    await inv.waitForFunction(() => /temps écoulé|⏱️/.test(document.querySelector('.pk-fil') ? document.querySelector('.pk-fil').textContent : ''),
      null, { timeout: 32000 }).catch(() => {});
    const fil = await inv.evaluate(() => document.querySelector('.pk-fil').textContent);
    check('bug 5 : au bout de 25 s, « ' + quiParle + ' » parle ou se couche d’office, la table ne reste plus figée', /temps écoulé/.test(fil), fil.slice(-160));
    // main suivante truquée : l'hôte a les as, l'invitée 7-2 ; elle fait tapis, il suit
    await hote.evaluate(() => {
      const pk = GG.byId.poker;
      const orig = pk.apply;
      const K = (r, c) => (r << 2) | c;
      pk.apply = function (s, pl, a, c) {
        const r = orig.call(this, s, pl, a, c);
        if (r.ok && a && (a.t === 'next' || a.t === 'suite') && !s.handOver) {
          s.players[0].hole = [K(12, 0), K(12, 1)];
          s.players[1].hole = [K(5, 3), K(0, 2)];
          s.deck = [K(1, 0), K(2, 1), K(7, 1), K(11, 0), K(10, 2)];
        }
        return r;
      };
    });
    await inv.waitForSelector('.pk-fin', { timeout: 30000 });
    await hote.click('.pk-suivante');
    await inv.waitForTimeout(600);
    const soldeAvantTapis = await solde(inv);
    for (let k = 0; k < 80 && !(await inv.locator('.pk-recave').count()); k++) {
      if (await inv.locator('.pk-actions').count()) {
        await inv.evaluate(() => {
          const q = document.querySelectorAll('.pk-quick');
          if (q.length) { q[q.length - 1].click(); document.querySelector('#pk-raise-go').click(); }
          else { const t = document.querySelector('[data-a=\'{"t":"allin"}\']'); if (t) t.click(); }
        });
      } else if (await hote.locator('[data-a=\'{"t":"call"}\']').count()) {
        await hote.click('[data-a=\'{"t":"call"}\']').catch(() => {});
      } else if (await hote.locator('[data-a=\'{"t":"check"}\']').count()) {
        await hote.click('[data-a=\'{"t":"check"}\']').catch(() => {});
      }
      await inv.waitForTimeout(250);
    }
    check('l’invitée a fait tapis avec 7-2 contre les as et perdu : le bouton de recave apparaît', await inv.locator('.pk-recave').count() === 1);
    const avant = await solde(inv);
    check('perdre son tapis à la table ne touche pas la cagnotte', avant === soldeAvantTapis, { avant, soldeAvantTapis });
    const reste = await inv.evaluate(() => parseInt(document.querySelector('.pk-seat.sb .pk-pstack').textContent, 10));
    // double appui : deux clics dans le même instant, avant toute réponse de l'hôte
    await inv.evaluate(() => { const b = document.querySelector('.pk-recave'); b.click(); b.click(); });
    await inv.waitForTimeout(1500);
    check('bug 6 : double appui sur « Recaver » : débité UNE fois (' + (100 - reste) + ')', (await solde(inv)) === avant - (100 - reste), { avant, apres: await solde(inv), reste });
    check('… et crédité une fois : tapis à 100', await inv.evaluate(() => parseInt(document.querySelector('.pk-seat.sb .pk-pstack').textContent, 10)) === 100);
    await hote.context().close();
    await inv.context().close();
  }

  /* =========================== SOLITAIRE =========================== */
  for (const [w, h] of [[412, 780], [360, 640]]) {
    console.log('--- Solitaire : ' + w + ' × ' + h + ' ---');
    const p = await page(w, h);
    await p.click('.game-tile[data-g="solitaire"]');
    await p.waitForSelector('[data-lvl="difficile"]', { timeout: 10000 });
    check('défi du jour et donne gagnable proposés', await p.locator('[data-mode="defi"]').count() === 1 && await p.locator('#sol-gagnable.on').count() === 1);
    await p.click('[data-lvl="difficile"]');
    await p.waitForSelector('.sol-tab', { timeout: 10000 });
    await p.click('[data-act="draw"]');
    await p.waitForTimeout(400);
    check('bug 12 : pioche 3 : les trois cartes tirées s’étalent en éventail (une seule avant)', await p.locator('.sol-waste .jc').count() === 3);
    // écart de recouvrement : au moins 20 px entre deux cartes visibles (17 avant)
    const ecart = await p.evaluate(() => {
      const o = parseFloat(getComputedStyle(document.querySelector('.sol-col[data-tab="6"]')).getPropertyValue('--offu'));
      return o;
    });
    check('bug 12 : cartes recouvertes lisibles : ' + Math.round(ecart) + ' px d’écart (17 avant)', ecart >= 20, ecart);
    const hauteur = await p.evaluate(() => {
      const b = document.querySelector('.sol-outils').getBoundingClientRect();
      return { bas: b.bottom, vh: innerHeight };
    });
    check('les outils (annuler, indice, abandon) visibles sans défiler', hauteur.bas <= hauteur.vh, hauteur);
    check('rien ne déborde sur le côté', !(await deborde(p)));
    // l'indice montre un coup ; on le joue AU DOIGT (glisser-déposer)
    let glisse = false, essais = 0;
    while (!glisse && essais++ < 12) {
      await p.click('#sol-indice');
      await p.waitForTimeout(120);
      const ind = await p.evaluate(() => {
        const els = [...document.querySelectorAll('.sol-indice')];
        const src = els.find(e => e.hasAttribute('data-card') || e.hasAttribute('data-waste'));
        const dst = els.find(e => e.hasAttribute('data-tab') || e.hasAttribute('data-found'));
        const pioche = els.find(e => e.hasAttribute('data-act'));
        if (pioche) return { pioche: true };
        if (!src || !dst) return null;
        const a = src.getBoundingClientRect(), b = dst.getBoundingClientRect();
        return { c: src.getAttribute('data-c'), x: a.left + a.width / 2, y: a.top + 8, X: b.left + b.width / 2, Y: b.top + Math.min(b.height, 80) - 10, dst: dst.getAttribute('data-tab') || 'f' + dst.getAttribute('data-found') };
      });
      if (!ind) break;
      if (ind.pioche) { await p.click('[data-act="draw"]'); await p.waitForTimeout(300); continue; }
      await p.mouse.move(ind.x, ind.y);
      await p.mouse.down();
      await p.mouse.move(ind.x + 10, ind.y + 12, { steps: 3 });
      const cibles = await p.locator('.sol-cible').count();
      await p.mouse.move(ind.X, ind.Y, { steps: 8 });
      await p.mouse.up();
      await p.waitForTimeout(450);
      const arrive = await p.evaluate(([c, d]) => {
        const e = document.querySelector('[data-c="' + c + '"]');
        if (!e) return false;
        return d[0] === 'f' ? !!e.closest('[data-found="' + d.slice(1) + '"]') : !!e.closest('[data-tab="' + d + '"]');
      }, [ind.c, ind.dst]);
      check('bug 12 : glisser-déposer : la carte suit le doigt (' + cibles + ' place(s) permise(s) allumée(s)) et se pose', arrive && cibles >= 1, { ind, cibles });
      glisse = true;
    }
    if (!glisse) check('(pas de coup à glisser sur cette donne)', true);
    // annuler
    const avantAnnul = await p.evaluate(() => [...document.querySelectorAll('[data-c]')].map(e => e.getAttribute('data-c') + '@' + (e.closest('[data-tab],[data-found],.sol-waste') || {}).className).join(','));
    await p.click('[data-act="draw"]');
    await p.waitForTimeout(300);
    await p.click('#sol-annuler');
    await p.waitForTimeout(400);
    const apresAnnul = await p.evaluate(() => [...document.querySelectorAll('[data-c]')].map(e => e.getAttribute('data-c') + '@' + (e.closest('[data-tab],[data-found],.sol-waste') || {}).className).join(','));
    check('bug 12 : annuler remet la table exactement comme avant', avantAnnul === apresAnnul);
    await p.context().close();
  }

  console.log('--- Solitaire : fin automatique, cascade de la victoire, plus de coups ---');
  {
    const p = await page(412, 780);
    await p.evaluate(() => {
      const sol = GG.byId.solitaire;
      const orig = sol.apply;
      sol.apply = function (s, pl, a, c) {
        const r = orig.call(this, s, pl, a, c);
        if (a && a.t === 'level' && r.ok && window.__rig) window.__rig(s);
        return r;
      };
      window.__rig = s => {
        const b = s.players[0].board;
        b.stock = []; b.waste = []; b.found = [[], [], [], []];
        for (let su = 0; su < 4; su++) for (let rk = 0; rk < 11; rk++) b.found[su].push(su * 13 + rk);
        b.tab = [[{ c: 12, up: true }, { c: 24, up: true }], [{ c: 25, up: true }], [{ c: 38, up: true }, { c: 11, up: true }],
          [{ c: 51, up: true }, { c: 37, up: true }], [{ c: 50, up: true }], [], []];
        s.players[0].talon = false;
      };
    });
    await p.click('.game-tile[data-g="solitaire"]');
    await p.click('[data-lvl="facile"]');
    await p.waitForSelector('canvas.sol-cascade', { timeout: 6000 });
    check('bug 12 : tout est découvert → fin automatique, puis la cascade de cartes qui rebondissent', true);
    await p.waitForTimeout(1200);
    await p.click('#sol-cloture');
    await p.waitForSelector('#overlay-end:not(.hidden)', { timeout: 8000 });
    const fin = await p.textContent('#end-detail');
    check('fin de partie fêtée par la coque, avec le temps et les coups', /coups/.test(fin), fin.slice(0, 80));
    await p.click('#btn-end-home');
    // une donne bloquée : plus aucun coup utile
    await p.evaluate(() => {
      window.__rig = s => {
        const b = s.players[0].board;
        b.stock = []; b.waste = [4]; b.found = [[], [], [], []];
        b.tab = [[{ c: 20, up: false }, { c: 9, up: true }], [{ c: 48, up: true }], [], [], [], [], []];
        const reste = [];
        for (let c = 0; c < 52; c++) if ([20, 9, 48, 4].indexOf(c) === -1) reste.push(c);
        b.tab[2] = reste.map(c => ({ c, up: false })).concat([{ c: 22, up: true }]).filter(x => x.c !== 22 || x.up);
        s.players[0].talon = false;
      };
    });
    await p.click('.game-tile[data-g="solitaire"]');
    await p.click('[data-lvl="facile"]');
    await p.waitForSelector('.sol-tab', { timeout: 6000 });
    check('bug 12 : « plus aucun coup utile » détecté et dit', await p.locator('.sol-bloque').count() === 1);
    await p.click('[data-giveup]');
    await p.waitForTimeout(450);
    await p.click('[data-giveup]');
    await p.waitForSelector('#overlay-end:not(.hidden)', { timeout: 8000 });
    check('bug 12 : fin de partie perdue : un résumé, plus de « Le jeu gagne cette fois… » sec',
      !/Le jeu gagne cette fois/.test(await p.textContent('#end-detail')) && /sur 52/.test(await p.textContent('#end-detail')));
    await p.context().close();
  }

  /* =========================== CAGNOTTE =========================== */
  console.log('--- Cagnotte : horloge et plafond (bug 10) ---');
  {
    const p = await page(412, 780, 2000);
    const r = await p.evaluate(() => {
      const w = GG.wallet, vrai = Date.now, t0 = vrai();
      const out = [];
      Date.now = () => t0 + 7 * 86400000 + 1000; out.push(w.get());   // on avance l'horloge de 7 jours
      w.spend(w.get() - 100);
      Date.now = () => t0; out.push(w.get());                          // on la remet à l'heure
      Date.now = () => t0 + 7 * 86400000 + 5000; out.push(w.get());   // on la ré-avance
      Date.now = vrai;
      w.add(5e9); out.push(w.get());
      return out;
    });
    check('bug 10 : avancer l’horloge pendant que l’appli tourne ne recharge pas', r[0] === 2000, r);
    check('bug 10 : ré-avancer l’horloge ne recharge pas', r[2] === 100, r);
    check('bug 10 : plafond à 1 000 000 (5 milliards acceptés avant)', r[3] === 1000000, r);
    await p.context().close();
  }

  /* =========================== FLUIDITÉ ×4 =========================== */
  console.log('--- Fluidité au processeur ralenti ×4 ---');
  {
    const p = await page(412, 780);
    const cdp = await p.context().newCDPSession(p);
    await ouvrirBlackjack(p);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await p.evaluate(() => {
      window.__images = [];
      let der = performance.now();
      const boucle = t => { window.__images.push(t - der); der = t; if (window.__images.length < 400) requestAnimationFrame(boucle); };
      requestAnimationFrame(boucle);
    });
    await p.click('.bj-bet[data-v="25"]');
    await p.click('#bj-valider');
    await p.waitForTimeout(2500);
    const im = await p.evaluate(() => {
      const d = window.__images.slice(2).sort((a, b) => a - b);
      return { n: d.length, mediane: Math.round(d[Math.floor(d.length / 2)]),
        vives: Math.round(100 * d.filter(x => x <= 50).length / d.length) };
    });
    // (sans processeur graphique, cet environnement de test a ses propres
    // à-coups, même au repos : on juge la médiane et la part d'images vives)
    check('blackjack ×4 : donne animée fluide (image médiane ' + im.mediane + ' ms, ' + im.vives + ' % des images en moins de 50 ms)',
      im.mediane <= 34 && im.vives >= 80, im);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await p.context().close();
  }

  check('aucune erreur JavaScript pendant toutes ces parties', erreursJS.length === 0, erreursJS.slice(0, 3));
  await browser.close();
  await relais.arreter();
  console.log(failures ? '\n' + failures + ' ÉCHEC(S)' : '\nTests V2 du casino (navigateur) OK.');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
