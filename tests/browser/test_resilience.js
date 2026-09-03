/*
 * Un fichier de jeu abîmé (mise à jour interrompue, erreur de syntaxe…) ne
 * doit JAMAIS vider l'étagère : les autres jeux restent jouables, et une
 * issue de secours permet de tout retélécharger.
 */
const { chromium } = require('playwright');
const URL_APP = 'http://localhost:8642/index.html';
let failures = 0;
function check(n, c, e) {
  if (c) console.log('  OK  ' + n);
  else { failures++; console.log('  FAIL ' + n + (e !== undefined ? ' -> ' + JSON.stringify(e) : '')); }
}

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox']
  });

  console.log('--- Un jeu cassé n’emporte pas les autres ---');
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  // on simule exactement la panne vécue : le fichier du poker ne se charge pas
  await p.route('**/js/games/poker.js', r =>
    r.fulfill({ contentType: 'application/javascript', body: 'var casse = ;' }));
  await p.goto(URL_APP);
  await p.waitForSelector('#catalog .game-tile', { timeout: 15000 });
  const tuiles = await p.locator('#catalog .game-tile').count();
  check('les autres jeux sont bien là (23 sur 24)', tuiles === 23, tuiles);
  check('le poker, lui, est absent de l’étagère',
    await p.locator('.game-tile[data-g="poker"]').count() === 0);
  check('l’application prévient qu’un jeu manque',
    /pas pu être chargé/.test(await p.textContent('#catalog')));
  check('un bouton de rechargement est proposé',
    await p.locator('#btn-secours').count() === 1);
  // et les jeux restants marchent toujours
  await p.click('.game-tile[data-g="morpion"]');
  await p.click('#btn-mini-hotseat');
  await p.click('#btn-mini-start');
  await p.waitForSelector('#screen-mini.active', { timeout: 10000 });
  check('un autre jeu se lance normalement', true);
  await ctx.close();

  console.log('--- Rien ne se charge : l’écran de secours ---');
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p2 = await ctx2.newPage();
  await p2.route('**/js/games/*.js', r =>
    r.fulfill({ contentType: 'application/javascript', body: 'var casse = ;' }));
  await p2.goto(URL_APP);
  await p2.waitForSelector('.ecran-secours', { timeout: 15000 });
  check('un écran explique la panne au lieu d’un écran vide',
    /ne se sont pas chargés|n’a pas pu démarrer/.test(await p2.textContent('.ecran-secours')),
    (await p2.textContent('.ecran-secours')).slice(0, 60));
  check('le bouton de rechargement est en évidence',
    await p2.locator('#btn-secours').count() === 1);
  await ctx2.close();

  console.log('--- Le rechargement vide bien le cache hors ligne ---');
  const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p3 = await ctx3.newPage();
  await p3.goto(URL_APP);
  await p3.waitForSelector('#catalog .game-tile');
  // on installe un faux cache, comme celui d'une ancienne version
  const cles = await p3.evaluate(async () => {
    await caches.open('gggames-vTEST');
    return await caches.keys();
  });
  check('un cache de test est bien présent', cles.indexOf('gggames-vTEST') !== -1, cles);
  await p3.click('#btn-wallet');
  await p3.waitForSelector('#screen-boutique.active');
  check('la Boutique affiche la version installée',
    /Version installée/.test(await p3.textContent('#version-appli')) ||
    (await p3.textContent('#version-appli')) === '',
    await p3.textContent('#version-appli'));
  await p3.click('#btn-forcer-maj');
  await p3.waitForFunction(() => location.search.indexOf('maj=') !== -1, null, { timeout: 15000 });
  const restants = await p3.evaluate(() => caches.keys());
  check('les caches ont été vidés', restants.indexOf('gggames-vTEST') === -1, restants);
  await p3.waitForSelector('#catalog .game-tile', { timeout: 15000 });
  check('l’application repart avec tous ses jeux',
    await p3.locator('#catalog .game-tile').count() === 24);
  await ctx3.close();

  await browser.close();
  console.log(failures ? '\n' + failures + ' ÉCHEC(S)' : '\nTests de résistance OK.');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
