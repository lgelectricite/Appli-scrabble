/*
 * Mode « En ligne » : deux téléphones DISTANTS (aucun QR, aucun scan).
 * L'hôte annonce un code, l'invité le tape, ils jouent une partie complète.
 * Le relais tourne en local, avec le vrai code de relay/src/index.js.
 */
const { chromium } = require('playwright');
const { demarrer } = require('../relais-local.js');
const URL_APP = 'http://localhost:8642/index.html';
let failures = 0;
function check(n, c, e) {
  if (c) console.log('  OK  ' + n);
  else { failures++; console.log('  FAIL ' + n + (e !== undefined ? ' -> ' + JSON.stringify(e) : '')); }
}

(async () => {
  const relais = await demarrer(8792);
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox']
  });
  const ctxH = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const ctxG = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const hote = await ctxH.newPage();
  const invite = await ctxG.newPage();
  hote.on('pageerror', e => { failures++; console.log('  FAIL hôte JS: ' + e.message); });
  invite.on('pageerror', e => { failures++; console.log('  FAIL invité JS: ' + e.message); });

  // les deux téléphones connaissent l'adresse du relais
  for (const p of [hote, invite]) {
    await p.goto(URL_APP);
    await p.evaluate(u => localStorage.setItem('gg-relais', u), relais.url);
    await p.reload();
    await p.waitForSelector('#catalog .game-tile');
  }

  console.log('--- Le mode en ligne est proposé ---');
  await hote.click('.game-tile[data-g="p4"]');
  check('bouton « En ligne » sur l’écran du jeu',
    await hote.locator('#btn-mini-online:not(.hidden)').count() === 1);
  check('bouton « Rejoindre avec un code » sur l’accueil',
    await invite.locator('#btn-home-online').count() === 1);

  console.log('--- L’hôte ouvre une partie et obtient un code ---');
  await hote.click('#btn-mini-online');
  await hote.fill('#host-name', 'Loïc');
  await hote.click('#btn-host-create');
  await hote.waitForSelector('#host-step-lobby:not(.hidden)', { timeout: 15000 });
  const code = (await hote.textContent('#host-code-big')).trim();
  check('code de partie de 6 caractères lisibles', /^[A-HJ-NP-Z2-9]{6}$/.test(code), code);
  check('aucun QR à scanner dans ce mode',
    await hote.locator('#btn-host-invite:not(.hidden)').count() === 0 &&
    await hote.locator('#btn-host-wifi:not(.hidden)').count() === 0);
  check('l’hôte est seul dans le salon pour l’instant',
    (await hote.textContent('#lobby-list')).includes('Loïc') &&
    await hote.locator('.lobby-row').count() === 1);
  check('impossible de commencer sans personne',
    await hote.locator('#btn-host-start[disabled]').count() === 1);

  console.log('--- L’invité tape le code, à distance ---');
  await invite.click('#btn-home-online');
  await invite.fill('#online-name', 'Manon');
  await invite.fill('#online-code', code.toLowerCase()); // minuscules acceptées
  await invite.click('#btn-online-go');
  await invite.waitForSelector('#online-lobby:not(.hidden)', { timeout: 15000 });
  check('l’invitée voit le salon et les deux joueurs',
    /Loïc/.test(await invite.textContent('#online-lobby-list')) &&
    /Manon/.test(await invite.textContent('#online-lobby-list')));
  await hote.waitForFunction(() => document.querySelectorAll('.lobby-row').length === 2,
    null, { timeout: 10000 });
  check('l’hôte voit son invitée arriver',
    /Manon/.test(await hote.textContent('#lobby-list')));
  check('l’hôte peut maintenant lancer',
    await hote.locator('#btn-host-start[disabled]').count() === 0);

  console.log('--- La partie se joue vraiment ---');
  await hote.click('#btn-host-start');
  await hote.waitForSelector('#screen-mini.active', { timeout: 15000 });
  await invite.waitForSelector('#screen-mini.active', { timeout: 15000 });
  check('partie lancée des deux côtés', true);
  check('les deux joueurs sont affichés chez l’invitée',
    /Loïc/.test(await invite.textContent('#mini-players')) &&
    /Manon/.test(await invite.textContent('#mini-players')));

  // l'hôte joue une colonne, l'invitée doit la voir
  await hote.locator('.p4-cell[data-col="3"]').first().click();
  await invite.waitForFunction(() => document.querySelectorAll('.p4-disc:not(.mini)').length >= 1,
    null, { timeout: 10000 });
  check('le coup de l’hôte arrive chez l’invitée', true);
  check('c’est au tour de l’invitée',
    /Manon/.test(await invite.textContent('#mini-turn')));

  // l'invitée joue à son tour, l'hôte le voit
  await invite.locator('.p4-cell[data-col="5"]').first().click();
  await hote.waitForFunction(() => document.querySelectorAll('.p4-disc:not(.mini)').length >= 2,
    null, { timeout: 10000 });
  check('le coup de l’invitée revient chez l’hôte', true);

  // hors de son tour, le relais ne permet aucune triche
  const avant = await hote.evaluate(() => document.querySelectorAll('.p4-disc:not(.mini)').length);
  await invite.locator('.p4-cell[data-col="1"]').first().click();
  await invite.waitForTimeout(600);
  check('un joueur ne peut pas jouer hors de son tour',
    (await hote.evaluate(() => document.querySelectorAll('.p4-disc:not(.mini)').length)) === avant);

  console.log('--- Le lien d’invitation ouvre directement la bonne partie ---');
  const ctxT = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const tiers = await ctxT.newPage();
  await tiers.goto(URL_APP);
  await tiers.evaluate(u => localStorage.setItem('gg-relais', u), relais.url);
  await tiers.goto(URL_APP + '#c=' + code);
  await tiers.waitForSelector('#screen-online.active', { timeout: 10000 });
  check('le lien pré-remplit le code', (await tiers.inputValue('#online-code')) === code);
  await ctxT.close();

  console.log('--- Un mauvais code est expliqué, pas subi ---');
  const ctxE = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const perdu = await ctxE.newPage();
  await perdu.goto(URL_APP);
  await perdu.evaluate(u => localStorage.setItem('gg-relais', u), relais.url);
  await perdu.reload();
  await perdu.click('#btn-home-online');
  await perdu.fill('#online-code', 'ZZZZ99');
  await perdu.click('#btn-online-go');
  await perdu.waitForSelector('#online-error:not(.hidden)', { timeout: 10000 });
  check('code inconnu : message clair',
    /Aucune partie/.test(await perdu.textContent('#online-error')));
  await ctxE.close();

  console.log('--- Sans serveur configuré, l’application le dit ---');
  const ctxS = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const sans = await ctxS.newPage();
  await sans.goto(URL_APP);
  await sans.evaluate(() => localStorage.removeItem('gg-relais'));
  await sans.reload();
  await sans.click('#btn-home-online');
  await sans.waitForSelector('#screen-relais.active', { timeout: 10000 });
  check('écran de réglage du serveur proposé',
    /Aucun serveur/.test(await sans.textContent('#relais-etat')));
  await sans.fill('#relais-url', relais.url.replace('ws://', 'http://'));
  await sans.click('#btn-relais-save');
  check('adresse normalisée et enregistrée',
    (await sans.evaluate(() => localStorage.getItem('gg-relais'))) === relais.url);
  await ctxS.close();

  console.log('--- Le hors-ligne n’est pas touché ---');
  const ctxL = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const local = await ctxL.newPage();
  await local.goto(URL_APP);
  await local.click('.game-tile[data-g="morpion"]');
  await local.click('#btn-mini-hotseat');
  await local.click('#btn-mini-start');
  await local.waitForSelector('#screen-mini.active', { timeout: 10000 });
  check('une partie sur un seul téléphone démarre toujours',
    await local.locator('.mor-cell, .p4-cell, #mini-area').count() >= 1);
  await ctxL.close();

  await ctxH.close();
  await ctxG.close();
  await browser.close();
  await relais.arreter();
  console.log(failures ? '\n' + failures + ' ÉCHEC(S)' : '\nTests du mode en ligne OK.');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
