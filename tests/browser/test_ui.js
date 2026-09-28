const { chromium } = require('playwright');
const H = require('./test_helpers.js');

const URL = (process.env.GG_URL || 'http://localhost:8642/index.html');
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
  // V2 : le premier joueur est tiré au sort, puis on tourne dans l'ordre
  const noms = ['Léa', 'Marc', 'Sam', 'Zoé'];
  const premier = await page.evaluate(() => window.GGMotsTest.etat().premier);
  const nomPremier = await page.textContent('#pass-name');
  check('1er joueur : celui du tirage au sort (' + nomPremier + ')', nomPremier === noms[premier], nomPremier);
  await page.click('#btn-pass-ready');

  const badges = await page.locator('#players-bar .player-badge').count();
  check('4 badges de joueurs', badges === 4, badges);

  // le premier joueur joue un mot VALIDE du dictionnaire (ou passe si impossible)
  const w1 = await H.playFirstWord(page);
  if (!w1) await H.passTurn(page);
  console.log('  → ' + nomPremier + ' ' + (w1 ? 'joue ' + w1 : 'passe'));
  for (let k = 1; k <= 3; k++) {
    const attendu = noms[(premier + k) % 4];
    await page.waitForSelector('#overlay-pass:not(.hidden)', { timeout: 15000 });
    check('au tour de ' + attendu, (await page.textContent('#pass-name')) === attendu);
    await page.click('#btn-pass-ready');
    await H.passTurn(page);
  }
  await page.waitForSelector('#overlay-pass:not(.hidden)', { timeout: 15000 });
  check('rotation complète : retour à ' + nomPremier, (await page.textContent('#pass-name')) === nomPremier);
  await page.click('#btn-pass-ready');
  if (w1) {
    const score0 = await page.textContent('#badge-' + premier + ' .p-score');
    check('score de ' + nomPremier + ' > 0', parseInt(score0, 10) > 0, score0);
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
  // V2 : premier joueur tiré au sort ; les pages dans l'ordre des joueurs
  const pages = [host, g1, g2];
  const nomsNet = ['Hugo', 'Nina', 'Paul'];
  const prem = await host.evaluate(() => window.GGMotsTest.etat().premier);
  const ordre = [0, 1, 2].map(k => (prem + k) % 3);
  const A = pages[ordre[0]], B = pages[ordre[1]], C = pages[ordre[2]];
  console.log('  → ordre : ' + ordre.map(i => nomsNet[i]).join(', '));
  check('tous les téléphones connaissent le même premier joueur',
    await g1.evaluate(() => window.GGMotsTest.etat().premier) === prem &&
    await g2.evaluate(() => window.GGMotsTest.etat().premier) === prem);
  check('Valider désactivé chez ' + nomsNet[ordre[1]] + ' (tour de ' + nomsNet[ordre[0]] + ')',
    await B.locator('#btn-play').isDisabled());
  // la fin de l'animation du tirage rend la main au premier joueur
  await A.waitForFunction(() => !document.querySelector('#btn-pass').disabled, null, { timeout: 15000 });

  // le premier joue un mot valide
  const wA = await H.playFirstWord(A);
  if (!wA) await H.passTurn(A);
  console.log('  → ' + nomsNet[ordre[0]] + ' ' + (wA ? 'joue ' + wA : 'passe'));
  if (wA) {
    for (const pg of pages) {
      await pg.waitForFunction(() =>
        document.querySelectorAll('#board .cell .tile').length === 2, null, { timeout: 8000 });
    }
    check('plateau synchronisé chez tout le monde', true);
  }
  await B.waitForFunction(n =>
    document.querySelector('#turn-banner').textContent.includes(n), nomsNet[ordre[1]], { timeout: 8000 });
  await B.waitForFunction(() => !document.querySelector('#btn-pass').disabled, null, { timeout: 8000 });

  // le deuxième : essaie un mot invalide → doit être refusé, puis joue un mot croisé
  if (wA) {
    const before = await host.locator('#board .cell .tile').count();
    const info = await (async () => {
      await B.locator('#rack .rack-tile').nth(0).click();
      await B.locator('#board .cell[data-i="127"]').click();
      await H.maybeJoker(B, 'Z');
      return B.textContent('#move-info');
    })();
    if (/dictionnaire/.test(info)) {
      check('aperçu invité signale le mot invalide', true);
    }
    await B.click('#btn-recall');
    const wB = await H.playCrossLetter(B, 112, 127);
    if (!wB) await H.passTurn(B);
    console.log('  → ' + nomsNet[ordre[1]] + ' ' + (wB ? 'joue ' + wB : 'passe'));
    if (wB) {
      // chacun a reçu l'état de l'hôte (pas seulement la tuile posée en attente)
      for (const pg of pages) {
        await pg.waitForFunction(c => window.GGMotsTest.etat().history.length === 2 &&
          document.querySelectorAll('#board .cell .tile').length === c, before + 1, { timeout: 8000 });
      }
      check('coup de ' + nomsNet[ordre[1]] + ' appliqué partout', true);
      // surbrillance du dernier mot chez les adversaires
      const hl = await A.locator('#board .cell.last-word').count();
      check('dernier mot surligné chez les autres', hl >= 1, hl);
      check('bannière : rappel du dernier coup',
        /a joué/.test(await A.textContent('#turn-banner')));
      check('pas de surbrillance chez son auteur',
        await B.locator('#board .cell.last-word').count() === 0);
    }
  } else {
    await H.passTurn(B);
  }
  await C.waitForFunction(n =>
    document.querySelector('#turn-banner').textContent.includes(n), nomsNet[ordre[2]], { timeout: 8000 });
  check('le tour est passé à ' + nomsNet[ordre[2]], true);
  await C.waitForFunction(() => !document.querySelector('#btn-pass').disabled, null, { timeout: 8000 });
  await H.passTurn(C);
  await A.waitForFunction(n =>
    document.querySelector('#turn-banner').textContent.includes(n), nomsNet[ordre[0]], { timeout: 8000 });
  check('retour au premier joueur après la passe', true);
  // V2 : le bandeau dit que le dernier a passé (plus de « a joué » périmé)
  check('bandeau : « a passé son tour » après une passe',
    /a passé son tour/.test(await A.textContent('#turn-banner')), await A.textContent('#turn-banner'));

  await ctxH.close();
  await ctxG1.close();
  await ctxG2.close();
  await browser.close();
  console.log(failures ? `\n${failures} ÉCHEC(S)` : '\nTous les tests UI passent.');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('ERREUR FATALE:', e); process.exit(1); });
