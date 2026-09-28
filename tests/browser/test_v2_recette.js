/*
 * V2 — ce que la recette indépendante a relevé ne doit jamais revenir.
 * (Le jeu en ligne est couvert par test_v2_reseau.js.)
 */
const { chromium } = require('playwright');
const URL_APP = (process.env.GG_URL || 'http://localhost:8642/index.html');
let failures = 0;
function check(n, c, e) {
  if (c) console.log('  OK  ' + n);
  else { failures++; console.log('  FAIL ' + n + (e !== undefined ? ' -> ' + JSON.stringify(e) : '')); }
}
const pause = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox']
  });
  async function telephone(w, h) {
    const ctx = await browser.newContext({ viewport: { width: w || 412, height: h || 780 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('gg-bienvenue-vu', 'true'); } catch (e) {} });
    const p = await ctx.newPage();
    p.on('pageerror', e => { failures++; console.log('  FAIL JS: ' + e.message); });
    await p.goto(URL_APP);
    await p.waitForSelector('#catalog .game-tile');
    return p;
  }
  async function quitter(p) {
    await p.click('#btn-mini-menu');
    await p.click('#btn-menu-quit');
    await p.click('#btn-confirm-yes');
    await p.waitForSelector('#screen-home.active');
  }

  console.log('--- Secrets sur un téléphone : écran de passage à la reprise ---');
  {
    const p = await telephone();
    await p.click('.game-tile[data-g="huit"]');
    await p.click('#btn-mini-hotseat');
    await p.locator('#mini-count .count-btn[data-n="3"]').click();
    await p.click('#btn-mini-start');
    await p.waitForSelector('#screen-mini.active');
    await pause(800);
    if (await p.locator('#overlay-pass:not(.hidden)').count()) await p.click('#btn-pass-ready');
    await pause(600);
    await p.reload();
    await p.waitForSelector('#btn-reprise');
    await p.click('#btn-reprise');
    await p.waitForSelector('#screen-mini.active');
    await pause(500);
    check('reprise : « passez le téléphone » AVANT de montrer une main',
      await p.locator('#overlay-pass:not(.hidden)').count() === 1 &&
      /masqué/.test(await p.textContent('#mini-area')), await p.textContent('#mini-area'));
    await p.context().close();
  }

  console.log('--- Oublier une partie se confirme ---');
  {
    const p = await telephone();
    await p.click('.game-tile[data-g="p4"]');
    await p.click('#btn-mini-solo');
    await p.click('#btn-msolo-start');
    await p.waitForSelector('.p4-cell');
    await pause(700);
    await p.locator('.p4-cell[data-col="3"]').first().click();
    await pause(600);
    await p.reload();
    await p.waitForSelector('#btn-reprise');
    const x = await p.locator('#btn-reprise-x').boundingBox();
    check('le ✕ fait au moins 40 px', x && x.width >= 39.5 && x.height >= 39.5, x);
    const go = await p.locator('#btn-reprise .rp-go').boundingBox();
    check('le ✕ ne touche pas « Jouer »', x && go && (x.y + x.height <= go.y || x.x >= go.x + go.width || go.x >= x.x + x.width),
      { x, go });
    await p.click('#btn-reprise-x');
    await p.waitForSelector('#overlay-confirm:not(.hidden)');
    check('une confirmation est demandée', true);
    await p.click('#btn-confirm-no');
    check('annuler garde la partie', await p.locator('#btn-reprise').count() === 1);
    await p.click('#btn-reprise-x');
    await p.click('#btn-confirm-yes');
    await pause(200);
    check('confirmer l’oublie', await p.locator('#btn-reprise').count() === 0);
    await p.context().close();
  }

  console.log('--- Un seul joueur : pas de « au tour de » ni de badge ---');
  {
    const p = await telephone(360, 640);
    await p.click('.game-tile[data-g="blackjack"]');
    check('Blackjack : « Jouer seul » proposé sans ordinateur',
      await p.locator('#btn-mini-solo:not(.hidden)').count() === 1 &&
      /rien que pour vous/.test(await p.textContent('#btn-mini-solo')));
    await p.click('#screen-mini-setup [data-back]');
    await p.click('.game-tile[data-g="memory"]');
    await p.click('#btn-mini-hotseat');
    await p.locator('#mini-count .count-btn[data-n="1"]').click();
    await p.click('#btn-mini-start');
    await p.waitForSelector('#screen-mini.active');
    await pause(500);
    check('en-tête : le nom du jeu', /Memory/.test(await p.textContent('#mini-turn')) &&
      !/Au tour/.test(await p.textContent('#mini-turn')), await p.textContent('#mini-turn'));
    check('aucun badge de score', await p.locator('#mini-players.hidden').count() === 1);
    await quitter(p);
    await p.context().close();
  }

  console.log('--- Français : élision et vouvoiement ---');
  {
    // téléphone neuf : la carte de bienvenue s'affiche
    const ctxNeuf = await browser.newContext({ viewport: { width: 412, height: 780 } });
    const p = await ctxNeuf.newPage();
    p.on('pageerror', e => { failures++; console.log('  FAIL JS: ' + e.message); });
    await p.goto(URL_APP);
    await p.waitForSelector('.bienvenue');
    check('« Comment vous appelez-vous ? »', /vous appelez-vous/.test(await p.textContent('.bienvenue')));
    await p.click('#bv-x');
    await p.click('.game-tile[data-g="p4"]');
    await p.click('#btn-mini-hotseat');
    await p.fill('#mini-name-1', 'Marc');
    await p.fill('#mini-name-2', 'Alice');
    await p.click('#btn-mini-start');
    await p.waitForSelector('.p4-cell');
    await pause(900);
    await p.locator('.p4-cell[data-col="3"]').first().click();
    await pause(900);
    check('« Au tour d’Alice » (et non « de Alice »)', /Au tour d’Alice/.test(await p.textContent('#mini-turn')),
      await p.textContent('#mini-turn'));
    await quitter(p);
    await p.context().close();
  }

  console.log('--- La cagnotte n’a plus l’air inachevée ---');
  {
    const p = await telephone(360, 640);
    await p.click('#btn-wallet');
    await p.waitForSelector('#screen-boutique.active');
    const txt = await p.textContent('#screen-boutique');
    check('plus de « Bientôt », plus de bouton technique', !/Bientôt/i.test(txt) &&
      await p.locator('#btn-forcer-maj:not(.hidden)').count() === 0);
    check('les règles des jetons expliquées', await p.locator('.cagnotte-infos .ci').count() >= 3);
    await p.context().close();
  }

  await browser.close();
  console.log(failures ? '\n' + failures + ' ÉCHEC(S)' : '\nTests de la recette (V2) OK.');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
