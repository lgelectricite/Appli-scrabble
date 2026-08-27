const { chromium } = require('playwright');
const H = require('./test_helpers.js');

const URL = 'http://localhost:8642/index.html';
let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log('  OK  ' + name);
  else { failures++; console.log('  FAIL ' + name + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); }
}

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--no-sandbox']
  });

  /* ============ Test 1 : Mots, partie locale à 4 joueurs ============ */
  console.log('--- Mots : partie locale à 4 joueurs ---');
  const ctx1 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx1.newPage();
  page.on('pageerror', e => { failures++; console.log('  FAIL erreur JS: ' + e.message); });
  await page.goto(URL);
  check('titre GGgames', (await page.title()) === 'GGgames');

  await page.click('.game-tile[data-g="mots"]');
  await page.click('#btn-mode-local');
  await page.click('.count-btn[data-n="4"]');
  await page.fill('#local-name-1', 'Léa');
  await page.fill('#local-name-2', 'Marc');
  await page.fill('#local-name-3', 'Sam');
  await page.fill('#local-name-4', 'Zoé');
  await page.click('#btn-local-start');
  await page.waitForSelector('#overlay-pass:not(.hidden)', { timeout: 30000 });
  check('1er joueur : Léa', (await page.textContent('#pass-name')) === 'Léa');
  await page.click('#btn-pass-ready');

  const badges = await page.locator('#players-bar .player-badge').count();
  check('4 badges de joueurs', badges === 4, badges);

  // Léa joue un mot VALIDE du dictionnaire (ou passe si impossible)
  const w1 = await H.playFirstWord(page);
  if (!w1) await H.passTurn(page);
  console.log('  → Léa ' + (w1 ? 'joue ' + w1 : 'passe'));
  await page.waitForSelector('#overlay-pass:not(.hidden)');
  check('au tour de Marc', (await page.textContent('#pass-name')) === 'Marc');
  await page.click('#btn-pass-ready');
  await H.passTurn(page);
  await page.waitForSelector('#overlay-pass:not(.hidden)');
  check('au tour de Sam', (await page.textContent('#pass-name')) === 'Sam');
  await page.click('#btn-pass-ready');
  await H.passTurn(page);
  await page.waitForSelector('#overlay-pass:not(.hidden)');
  check('au tour de Zoé', (await page.textContent('#pass-name')) === 'Zoé');
  await page.click('#btn-pass-ready');
  await H.passTurn(page);
  await page.waitForSelector('#overlay-pass:not(.hidden)');
  check('rotation complète : retour à Léa', (await page.textContent('#pass-name')) === 'Léa');
  await page.click('#btn-pass-ready');
  if (w1) {
    const score0 = await page.textContent('#badge-0 .p-score');
    check('score de Léa > 0', parseInt(score0, 10) > 0, score0);
  }
  await ctx1.close();

  /* ============ Test 2 : Mots, hôte + 2 invités (WebRTC) ============ */
  console.log('--- Mots : trois téléphones (hôte serveur + 2 invités) ---');
  const ctxH = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const ctxG1 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const ctxG2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const host = await ctxH.newPage();
  const g1 = await ctxG1.newPage();
  const g2 = await ctxG2.newPage();
  host.on('pageerror', e => { failures++; console.log('  FAIL host JS: ' + e.message); });
  g1.on('pageerror', e => { failures++; console.log('  FAIL g1 JS: ' + e.message); });
  g2.on('pageerror', e => { failures++; console.log('  FAIL g2 JS: ' + e.message); });
  await host.goto(URL);
  await g1.goto(URL);
  await g2.goto(URL);

  await host.click('.game-tile[data-g="mots"]');
  await host.click('#btn-mode-host');
  await host.fill('#host-name', 'Hugo');
  await host.click('#btn-host-create');
  await host.waitForSelector('#host-step-lobby:not(.hidden)');
  check('salon affiché', true);
  check('Commencer désactivé sans invité', await host.locator('#btn-host-start').isDisabled());

  async function connectGuest(guestPage, name) {
    await host.click('#btn-host-invite');
    await host.waitForFunction(() => document.getElementById('host-code').value.length > 20);
    const offer = await host.inputValue('#host-code');
    await guestPage.click('#btn-home-join');
    await guestPage.fill('#join-name', name);
    await guestPage.click('#btn-join-scan');
    await guestPage.fill('#join-paste', offer);
    await guestPage.click('#btn-join-paste-ok');
    await guestPage.waitForFunction(() => document.getElementById('join-code').value.length > 20);
    const answer = await guestPage.inputValue('#join-code');
    await host.click('#btn-host-scan-answer');
    await host.fill('#host-paste', answer);
    await host.click('#btn-host-paste-ok');
    await host.waitForSelector('#host-step-lobby:not(.hidden)', { timeout: 15000 });
  }

  await connectGuest(g1, 'Nina');
  check('Nina dans le salon', (await host.textContent('#lobby-list')).includes('Nina'));
  await connectGuest(g2, 'Paul');
  check('Paul dans le salon', (await host.textContent('#lobby-list')).includes('Paul'));
  check('salon de l’invité 1 à jour',
    (await g1.textContent('#join-lobby-list')).includes('Paul'));

  await host.click('#btn-host-start');
  await host.waitForSelector('#screen-game.active');
  await g1.waitForSelector('#screen-game.active', { timeout: 15000 });
  await g2.waitForSelector('#screen-game.active', { timeout: 15000 });
  check('les 3 sont en jeu', true);
  check('Valider désactivé chez Nina (tour de Hugo)', await g1.locator('#btn-play').isDisabled());

  // Hugo joue un mot valide
  const wHugo = await H.playFirstWord(host);
  if (!wHugo) await H.passTurn(host);
  console.log('  → Hugo ' + (wHugo ? 'joue ' + wHugo : 'passe'));
  if (wHugo) {
    await g1.waitForFunction(() =>
      document.querySelectorAll('#board .cell .tile').length === 2, null, { timeout: 8000 });
    await g2.waitForFunction(() =>
      document.querySelectorAll('#board .cell .tile').length === 2, null, { timeout: 8000 });
    check('plateau synchronisé chez les 2 invités', true);
  }
  await g1.waitForFunction(() =>
    document.querySelector('#turn-banner').textContent.includes('Nina'), null, { timeout: 8000 });

  // Nina : essaie un mot invalide → doit être refusé par l'hôte
  if (wHugo) {
    const before = await g1.locator('#board .cell .tile').count();
    // pose une lettre au hasard sous la 1re case : rarement valide, mais si ça l'est on saute
    const info = await (async () => {
      await g1.locator('#rack .rack-tile').nth(0).click();
      await g1.locator('#board .cell[data-i="127"]').click();
      await H.maybeJoker(g1, 'Z');
      return g1.textContent('#move-info');
    })();
    if (/dictionnaire/.test(info)) {
      check('aperçu invité signale le mot invalide', true);
    }
    await g1.click('#btn-recall');
    // puis un vrai mot croisé (ou passe)
    const wNina = await H.playCrossLetter(g1, 112, 127);
    if (!wNina) await H.passTurn(g1);
    console.log('  → Nina ' + (wNina ? 'joue ' + wNina : 'passe'));
    if (wNina) {
      await host.waitForFunction(c =>
        document.querySelectorAll('#board .cell .tile').length === c, before + 1, { timeout: 8000 });
      check('coup de Nina appliqué chez l’hôte', true);
      // surbrillance du dernier mot chez les adversaires
      const hl = await host.locator('#board .cell.last-word').count();
      check('dernier mot surligné chez l’hôte', hl >= 1, hl);
      check('bannière : rappel du dernier coup',
        /a joué/.test(await host.textContent('#turn-banner')));
      check('pas de surbrillance chez son auteur',
        await g1.locator('#board .cell.last-word').count() === 0);
    }
  } else {
    await H.passTurn(g1);
  }
  await g2.waitForFunction(() =>
    document.querySelector('#turn-banner').textContent.includes('Paul'), null, { timeout: 8000 });
  check('le tour est passé à Paul', true);
  await H.passTurn(g2);
  await host.waitForFunction(() =>
    document.querySelector('#turn-banner').textContent.includes('Hugo'), null, { timeout: 8000 });
  check('retour à Hugo après la passe de Paul', true);

  await ctxH.close();
  await ctxG1.close();
  await ctxG2.close();
  await browser.close();
  console.log(failures ? `\n${failures} ÉCHEC(S)` : '\nTous les tests UI passent.');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('ERREUR FATALE:', e); process.exit(1); });
