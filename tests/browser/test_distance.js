/* Parcours « à distance » : aucun scan, on s'échange les codes par message. */
const { chromium } = require('playwright');
let failures = 0;
function check(n, c, e) {
  if (c) console.log('  OK  ' + n);
  else { failures++; console.log('  FAIL ' + n + (e !== undefined ? ' -> ' + JSON.stringify(e) : '')); }
}
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--no-sandbox'] });
  const ctxH = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const ctxG = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const host = await ctxH.newPage(), guest = await ctxG.newPage();
  host.on('pageerror', e => { failures++; console.log('  FAIL host JS: ' + e.message); });
  guest.on('pageerror', e => { failures++; console.log('  FAIL guest JS: ' + e.message); });
  await host.goto('http://localhost:8642/index.html');
  await guest.goto('http://localhost:8642/index.html');

  console.log('--- Jouer à distance (échange des codes par message) ---');
  await host.click('.game-tile[data-g="p4"]');
  await host.click('#btn-mini-host');
  await host.fill('#host-name', 'Loïc');
  await host.click('#btn-host-create');
  await host.waitForSelector('#host-step-lobby:not(.hidden)');
  await host.click('#btn-host-invite');
  await host.waitForFunction(() => document.getElementById('host-code').value.length > 20);
  check('encadré « à distance » visible chez l’hôte',
    await host.locator('#btn-host-share:visible').count() === 1 &&
    /pas à côté de vous/.test(await host.textContent('.loin-box')));
  // le bouton de partage : sans navigator.share, il copie le lien
  const partage = await host.evaluate(async () => {
    const t = document.getElementById('host-code').value;
    document.getElementById('btn-host-share').click();
    return t;
  });
  check('le lien partagé est bien une invitation ouvrable',
    /^https?:\/\/.+#j=/.test(partage), partage.slice(0, 40));

  // l'ami ouvre le lien reçu par message (pas de scan)
  await guest.goto(partage);
  await guest.waitForSelector('#screen-join.active');
  await guest.fill('#join-name', 'Kevin');
  await guest.click('#btn-join-scan');
  await guest.waitForFunction(() => document.getElementById('join-code').value.length > 20);
  check('encadré « à distance » visible chez l’invité',
    await guest.locator('#btn-join-share:visible').count() === 1);
  const reponse = await guest.inputValue('#join-code');

  // l'hôte colle la réponse reçue par message — champ visible sans dépli
  await host.click('#btn-host-scan-answer');
  await host.waitForSelector('#host-step-scan:not(.hidden)');
  check('champ « coller la réponse » visible d’emblée',
    await host.locator('#host-paste:visible').count() === 1 &&
    /À distance/.test(await host.textContent('#host-step-scan')));
  await host.fill('#host-paste', reponse);
  await host.click('#btn-host-paste-ok');
  await host.waitForSelector('#host-step-lobby:not(.hidden)', { timeout: 15000 });
  check('l’ami apparaît dans le salon', /Kevin/.test(await host.textContent('#lobby-list')));
  await host.click('#btn-host-start');
  await host.waitForSelector('#screen-mini.active');
  await guest.waitForSelector('#screen-mini.active', { timeout: 15000 });
  check('partie lancée des deux côtés, sans jamais scanner', true);
  // un coup passe bien d'un téléphone à l'autre
  await host.locator('.p4-cell[data-col="3"]').first().click();
  await guest.waitForFunction(() => document.querySelectorAll('.p4-disc:not(.mini)').length >= 1,
    null, { timeout: 8000 });
  check('le coup de l’hôte arrive chez l’ami', true);

  await browser.close();
  console.log(failures ? failures + ' ÉCHEC(S)' : '\nParcours à distance OK.');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
