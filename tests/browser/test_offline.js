/* Mode avion : on charge l'appli UNE fois, on coupe tout le réseau,
   et on vérifie qu'elle se lance et qu'on peut jouer (Imposteur + Words solo). */
const { chromium } = require('playwright');
let failures = 0;
function check(n, c, e) {
  if (c) console.log('  OK  ' + n);
  else { failures++; console.log('  FAIL ' + n + (e !== undefined ? ' -> ' + JSON.stringify(e) : '')); }
}
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => { failures++; console.log('  FAIL JS: ' + e.message); });

  // 1. Premier chargement EN LIGNE : le service worker met tout en cache
  await p.goto('http://localhost:8642/index.html');
  await p.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.ready
    .then(() => true) && !!navigator.serviceWorker, null, { timeout: 15000 });
  await p.evaluate(() => navigator.serviceWorker.ready);
  // attend que le cache contienne le dictionnaire (le plus gros fichier)
  await p.waitForFunction(async () => {
    const keys = await caches.keys();
    const k = keys.find(x => x.startsWith('gggames'));
    if (!k) return false;
    const c = await caches.open(k);
    return !!(await c.match('data/mots.txt')) && !!(await c.match('js/games/imposteur.js'));
  }, null, { timeout: 60000 });
  check('installation : tout est en cache (dictionnaire compris)', true);

  // 2. MODE AVION : plus aucun réseau
  await ctx.setOffline(true);
  await p.reload();
  await p.waitForSelector('#screen-home h1', { timeout: 15000 });
  check('l’appli se lance SANS réseau', (await p.textContent('#screen-home h1')) === 'GGgames');
  check('catalogue complet hors-ligne', await p.locator('#catalog .game-tile').count() >= 19);
  await p.waitForSelector('#offline-badge:not(.hidden)', { timeout: 10000 });
  check('badge « prête pour le mode avion » affiché', true);

  // 3. L'Imposteur hors-ligne (3 joueurs sur ce téléphone)
  await p.click('.game-tile[data-g="imposteur"]');
  await p.click('#btn-mini-hotseat');
  await p.click('#btn-mini-start');
  await p.waitForSelector('.imp-word', { timeout: 15000 });
  check('Imposteur : mot secret distribué hors-ligne', true);
  await p.click('#btn-mini-menu'); await p.click('#btn-menu-quit'); await p.click('#btn-confirm-yes');

  // 4. Words solo hors-ligne : le dictionnaire (3 Mo) vient du cache
  await p.click('.game-tile[data-g="mots"]');
  await p.click('#btn-mode-solo');
  await p.click('#btn-solo-start');
  await p.waitForSelector('#screen-game.active', { timeout: 30000 });
  check('Words solo : dictionnaire chargé hors-ligne, partie lancée',
    await p.locator('#rack .rack-tile').count() === 7);

  await browser.close();
  console.log(failures ? failures + ' ÉCHEC(S)' : '\nTest mode avion OK.');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
