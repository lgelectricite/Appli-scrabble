const ROOT = require('path').join(__dirname, '../..');
/* UI : mode « 🤖 Jouer seul contre l'ordinateur » — chaque jeu doté d'une IA
   doit se lancer en solo, tourner sans erreur JS et se quitter proprement.
   Usage : node test_bots_ui.js [nb_jeux_attendus]  (défaut 13) */
const { chromium } = require('playwright');
let failures = 0;
function check(n, c, e) {
  if (c) console.log('  OK  ' + n);
  else { failures++; console.log('  FAIL ' + n + (e !== undefined ? ' -> ' + JSON.stringify(e) : '')); }
}
const EXPECTED = parseInt(process.argv[2] || '13', 10);
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const p = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  p.on('pageerror', e => { failures++; console.log('  FAIL JS: ' + e.message); });
  await p.goto('http://localhost:8642/index.html');
  await p.waitForSelector('.game-tile');

  const ids = await p.evaluate(() =>
    Object.keys(GG.byId).filter(id => typeof GG.byId[id].bot === 'function'));
  console.log('Jeux avec IA : ' + ids.join(', '));
  check('au moins ' + EXPECTED + ' jeux dotés d’une IA', ids.length >= EXPECTED, ids);
  check('pastille 🤖 sur les boîtes de l’étagère',
    await p.locator('.bx .bx-bot').count() >= Math.min(EXPECTED + 1, 14)); // + Words

  async function quitGame() {
    await p.click('#btn-mini-menu');
    await p.click('#btn-menu-quit');
    await p.click('#btn-confirm-yes');
    await p.waitForSelector('#screen-home.active', { timeout: 8000 });
  }

  for (const id of ids) {
    if (!(await p.locator('.game-tile[data-g="' + id + '"]').count())) continue;
    await p.click('.game-tile[data-g="' + id + '"]');
    await p.waitForSelector('#screen-mini-setup.active', { timeout: 8000 });
    const soloVisible = await p.locator('#btn-mini-solo:not(.hidden)').count() === 1;
    check(id + ' : bouton « contre l’ordinateur » proposé', soloVisible);
    if (!soloVisible) { await p.click('#screen-mini-setup [data-back]'); continue; }
    await p.click('#btn-mini-solo');
    await p.click('#btn-msolo-start');
    await p.waitForSelector('#screen-mini.active', { timeout: 8000 });
    await p.waitForTimeout(2600); // le temps qu'une IA joue au moins une fois
    const area = await p.textContent('#mini-area');
    check(id + ' : partie solo lancée, écran rendu', !!area && area.trim().length > 0);
    await quitGame();
  }

  // Approfondi : Puissance 4 — l'IA répond bien au coup de l'humain
  await p.click('.game-tile[data-g="p4"]');
  await p.waitForSelector('#screen-mini-setup.active');
  await p.click('#btn-mini-solo');
  await p.click('#btn-msolo-start');
  await p.waitForSelector('.p4-board', { timeout: 8000 });
  await p.click('.p4-cell[data-col="3"]');
  await p.waitForTimeout(2400);
  const discs = await p.locator('.p4-cell .p4-disc').count();
  check('p4 : l’IA a répondu au coup humain (≥ 2 jetons posés)', discs >= 2, discs);
  const badges = await p.locator('#mini-players .player-badge').count();
  check('p4 : deux joueurs affichés (vous + 🤖)', badges === 2, badges);
  await quitGame();

  await browser.close();
  console.log(failures ? failures + ' ÉCHEC(S)' : '\nTests IA (interface) OK.');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
