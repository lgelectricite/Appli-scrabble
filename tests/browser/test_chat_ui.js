/* UI : Discussion — messagerie locale entre deux « téléphones » (WebRTC). */
const { chromium } = require('playwright');
const URL = 'http://localhost:8642/index.html';
let failures = 0;
function check(n, c, e) {
  if (c) console.log('  OK  ' + n);
  else { failures++; console.log('  FAIL ' + n + (e !== undefined ? ' -> ' + JSON.stringify(e) : '')); }
}

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--no-sandbox']
  });
  const ctxH = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const ctxG = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const host = await ctxH.newPage();
  const guest = await ctxG.newPage();
  host.on('pageerror', e => { failures++; console.log('  FAIL host JS: ' + e.message); });
  guest.on('pageerror', e => { failures++; console.log('  FAIL guest JS: ' + e.message); });
  await host.goto(URL);
  await guest.goto(URL);

  console.log('--- Discussion (2 téléphones) ---');
  // la boîte est sur l'étagère « Jeux de soirée »
  check('boîte 💬 Discussion au catalogue', await host.locator('.game-tile[data-g="chat"]').count() === 1);
  await host.click('.game-tile[data-g="chat"]');
  check('écran de config : titre Discussion',
    (await host.textContent('#mini-setup-title')).includes('Discussion'));
  check('réseau uniquement : pas de bouton « sur ce téléphone »',
    await host.locator('#btn-mini-hotseat:not(.hidden)').count() === 0);
  check('pas de mode contre l’ordinateur',
    await host.locator('#btn-mini-solo:not(.hidden)').count() === 0);

  // création du salon + invitation (comme pour un jeu)
  await host.click('#btn-mini-host');
  await host.fill('#host-name', 'Hugo');
  await host.click('#btn-host-create');
  await host.waitForSelector('#host-step-lobby:not(.hidden)');
  await host.click('#btn-host-invite');
  await host.waitForFunction(() => document.getElementById('host-code').value.length > 20);
  const offer = await host.inputValue('#host-code');
  await guest.goto(offer);
  await guest.waitForSelector('#screen-join.active');
  await guest.fill('#join-name', 'Nina');
  await guest.click('#btn-join-scan');
  await guest.waitForFunction(() => document.getElementById('join-code').value.length > 20);
  const answer = await guest.inputValue('#join-code');
  await host.click('#btn-host-scan-answer');
  await host.fill('#host-paste', answer);
  await host.click('#btn-host-paste-ok');
  await host.waitForSelector('#host-step-lobby:not(.hidden)', { timeout: 15000 });
  await host.click('#btn-host-start');
  await host.waitForSelector('#screen-mini.active');
  await guest.waitForSelector('#screen-mini.active', { timeout: 15000 });
  check('salon ouvert des deux côtés', true);

  await host.waitForSelector('.ch-log');
  await guest.waitForSelector('.ch-log');
  check('pas de tour de parole affiché', (await host.textContent('#mini-turn')).trim() === '');
  check('pas de badges de score', await host.locator('#mini-players.hidden').count() === 1);
  check('les deux prénoms sont présentés', /Hugo/.test(await guest.textContent('.ch-who')) &&
    /Nina/.test(await guest.textContent('.ch-who')));
  check('invitation à écrire le premier message', await host.locator('.ch-none').count() === 1);

  // l'hôte écrit, l'invitée reçoit
  await host.fill('#ch-in', 'Coucou Nina, tu me reçois ?');
  await host.click('.ch-send');
  await host.waitForSelector('.ch-bub', { timeout: 8000 });
  check('chez l’hôte : sa bulle est à droite (mine)',
    await host.locator('.ch-row.mine .ch-txt').count() === 1 &&
    /tu me reçois/.test(await host.textContent('.ch-row.mine .ch-txt')));
  await guest.waitForSelector('.ch-bub', { timeout: 8000 });
  check('chez l’invitée : la bulle arrive, à gauche, signée Hugo',
    await guest.locator('.ch-row:not(.mine) .ch-bub').count() === 1 &&
    /Hugo/.test(await guest.textContent('.ch-name')) &&
    /tu me reçois/.test(await guest.textContent('.ch-txt')));
  check('l’heure d’envoi est affichée', /^\d\d:\d\d$/.test((await guest.textContent('.ch-h')).trim()));

  // l'invitée commence un brouillon, PUIS reçoit un message : brouillon intact
  await guest.fill('#ch-in', '5 sur 5');
  await host.fill('#ch-in', 'On se retrouve porte D18 ?');
  await host.click('.ch-send');
  await guest.waitForFunction(() => document.querySelectorAll('.ch-bub').length === 2,
    null, { timeout: 8000 });
  check('le brouillon de l’invitée survit au message reçu',
    (await guest.inputValue('#ch-in')) === '5 sur 5');

  // l'invitée envoie (Entrée) ; l'hôte reçoit la réponse signée
  await guest.press('#ch-in', 'Enter');
  await host.waitForFunction(() => document.querySelectorAll('.ch-bub').length === 3,
    null, { timeout: 8000 });
  check('chez l’hôte : la réponse de Nina arrive signée',
    /Nina/.test(await host.textContent('.ch-row:not(.mine) .ch-name')) &&
    /5 sur 5/.test(await host.textContent('.ch-row:not(.mine) .ch-txt')));
  check('le champ de l’invitée est vidé après envoi', (await guest.inputValue('#ch-in')) === '');

  // un emoji rapide part d'un seul geste
  await guest.locator('.ch-q').first().click();
  await host.waitForFunction(() => document.querySelectorAll('.ch-bub').length === 4,
    null, { timeout: 8000 });
  check('emoji rapide reçu par l’hôte', /👍/.test(await host.textContent('.ch-log')));

  // les règles expliquent la confidentialité
  await host.click('#btn-mini-rules');
  await host.waitForSelector('#overlay-rules:not(.hidden)');
  check('règles : rien n’est enregistré', /nulle part|disparaît/.test(await host.textContent('#rules-body')));
  await host.click('#btn-rules-close');

  await ctxH.close();
  await ctxG.close();
  await browser.close();
  console.log(failures ? failures + ' ÉCHEC(S)' : '\nTests Discussion OK.');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
