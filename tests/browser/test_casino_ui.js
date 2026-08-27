/* UI : cagnotte + Boutique, Blackjack solo, Solitaire solo, barrière du Poker. */
const { chromium } = require('playwright');
let failures = 0;
function check(n, c, e) {
  if (c) console.log('  OK  ' + n);
  else { failures++; console.log('  FAIL ' + n + (e !== undefined ? ' -> ' + JSON.stringify(e) : '')); }
}
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const p = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  p.on('pageerror', e => { failures++; console.log('  FAIL JS: ' + e.message); });
  await p.goto('http://localhost:8642/index.html');

  // ---------- cagnotte + boutique ----------
  console.log('--- Cagnotte & Boutique ---');
  await p.waitForSelector('#btn-wallet');
  check('jauge de jetons sur l’accueil : 10 000',
    /10\s*000/.test(await p.textContent('#wallet-amount')));
  await p.click('#btn-wallet');
  await p.waitForSelector('#screen-boutique.active');
  check('boutique : cagnotte affichée', /10\s*000/.test(await p.textContent('#bank-n')));
  check('boutique : 3 packs annoncés', await p.locator('.shop-pack').count() === 3);
  check('boutique : mention de la recharge hebdomadaire',
    /recharge|semaine|pleine/i.test(await p.textContent('#screen-boutique')));
  await p.click('#screen-boutique [data-back]');
  await p.waitForSelector('#screen-home.active');

  // ---------- Blackjack solo ----------
  console.log('--- Blackjack (solo) ---');
  await p.click('.game-tile[data-g="blackjack"]');
  await p.click('#btn-mini-hotseat');
  check('Blackjack : solo sur ce téléphone', await p.locator('#mini-count .count-btn').count() === 1);
  await p.click('#btn-mini-start');
  await p.waitForSelector('.bj-mises', { timeout: 15000 });
  check('table du croupier affichée', await p.locator('.bj-felt').count() === 1);
  await p.click('.bj-bet[data-v="100"]');
  await p.waitForSelector('.bj-cartes-moi .bj-card', { timeout: 8000 });
  check('2 cartes distribuées', await p.locator('.bj-cartes-moi .bj-card').count() === 2);
  check('mise débitée de la cagnotte', /9\s*900/.test(await p.textContent('.bj-wallet')));
  check('carte du croupier cachée', await p.locator('.bj-dos').count() === 1);
  // on reste : la manche se résout
  if (await p.locator('#bj-stand').count()) {
    await p.click('#bj-stand');
  }
  await p.waitForSelector('.bj-result, .bj-r-win, .bj-r-lose, .bj-r-push', { timeout: 8000 });
  check('résultat affiché', await p.locator('.bj-result').count() === 1);
  check('carte du croupier révélée', await p.locator('.bj-dos').count() === 0);
  const solde = await p.evaluate(() => JSON.parse(localStorage.getItem('gg-jetons')).n);
  check('cagnotte réglée après la manche (perte, gain, égalité ou blackjack)',
    [9900, 10100, 10000, 10150].indexOf(solde) !== -1, solde);
  await p.click('#bj-end');
  await p.waitForSelector('#overlay-end:not(.hidden)', { timeout: 8000 });
  check('fin de partie : classement', /🪙/.test(await p.textContent('#end-detail')));
  await p.click('#btn-end-home');
  await p.waitForTimeout(200);

  // ---------- Solitaire solo ----------
  console.log('--- Solitaire (solo) ---');
  await p.click('.game-tile[data-g="solitaire"]');
  await p.click('#btn-mini-hotseat');
  await p.click('#btn-mini-start');
  await p.waitForSelector('[data-lvl="facile"]', { timeout: 15000 });
  await p.click('[data-lvl="facile"]');
  await p.waitForSelector('.sol-tab', { timeout: 15000 });
  check('7 colonnes affichées', await p.locator('.sol-col').count() === 7);
  check('pioche de 24 cartes', /24/.test(await p.textContent('.sol-down .sol-cnt')));
  check('28 cartes posées sur le tapis',
    await p.locator('.sol-col .sol-card').count() === 28);
  await p.click('[data-act="draw"]');
  await p.waitForTimeout(300);
  check('pioche : une carte retournée', await p.locator('[data-waste]').count() === 1);
  check('chrono en route', /⏱️/.test(await p.textContent('#sol-timer')));
  // abandon en deux temps
  await p.click('[data-giveup]');
  await p.waitForTimeout(200);
  check('confirmation d’abandon demandée', /Vraiment/.test(await p.textContent('[data-giveup]')));
  await p.click('[data-giveup]');
  await p.waitForSelector('#overlay-end:not(.hidden)', { timeout: 8000 });
  check('abandon solo : écran de fin', true);
  await p.click('#btn-end-home');
  await p.waitForTimeout(200);

  // ---------- barrière de jetons du Poker ----------
  console.log('--- Poker : barrière de jetons ---');
  await p.evaluate(() => localStorage.setItem('gg-jetons', JSON.stringify({ n: 40, ts: Date.now() })));
  await p.reload();
  await p.waitForSelector('.game-tile[data-g="poker"]');
  await p.click('.game-tile[data-g="poker"]');
  await p.waitForSelector('#screen-boutique.active', { timeout: 8000 });
  check('cagnotte trop basse : renvoyé vers la Boutique', true);
  check('jauge à 40', /40/.test(await p.textContent('#wallet-amount')));
  // le blackjack reste accessible (mise mini 1 jeton)
  await p.click('#screen-boutique [data-back]');
  await p.click('.game-tile[data-g="blackjack"]');
  await p.waitForSelector('#screen-mini-setup.active', { timeout: 8000 });
  check('blackjack accessible avec 40 jetons', true);

  await browser.close();
  console.log(failures ? failures + ' ÉCHEC(S)' : '\nTests casino UI OK.');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
