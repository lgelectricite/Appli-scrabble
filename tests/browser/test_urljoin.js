const { chromium } = require('playwright');
let failures = 0;
function check(n, c, e) { if (c) console.log('  OK  ' + n); else { failures++; console.log('  FAIL ' + n + (e !== undefined ? ' -> ' + JSON.stringify(e) : '')); } }
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--no-sandbox'] });
  const host = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const guest = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  host.on('pageerror', e => { failures++; console.log('  FAIL host JS: ' + e.message); });
  guest.on('pageerror', e => { failures++; console.log('  FAIL guest JS: ' + e.message); });

  await host.goto('http://localhost:8642/index.html');
  await host.click('.game-tile[data-g="mots"]');
  await host.click('#btn-mode-host');
  await host.fill('#host-name', 'Hugo');
  await host.click('#btn-host-create');
  await host.waitForSelector('#host-step-lobby:not(.hidden)');
  await host.click('#btn-host-invite');
  await host.waitForFunction(() => document.getElementById('host-code').value.length > 20);
  const inviteUrl = await host.inputValue('#host-code');
  check('le code est une URL', inviteUrl.startsWith('http') && inviteUrl.includes('#j='), inviteUrl.slice(0, 60));

  // L'invité "scanne" : il ouvre l'URL directement (comme l'appareil photo le ferait)
  await guest.goto(inviteUrl);
  await guest.waitForSelector('#screen-join.active', { timeout: 10000 });
  check('l’app s’ouvre directement sur « rejoindre »', true);
  const btnTxt = await guest.textContent('#btn-join-scan');
  check('bouton « Se connecter à la partie »', btnTxt.includes('Se connecter'), btnTxt);
  await guest.fill('#join-name', 'Nina');
  await guest.click('#btn-join-scan');
  await guest.waitForFunction(() => document.getElementById('join-code').value.length > 20, null, { timeout: 15000 });
  check('réponse générée sans scanner', true);
  const answer = await guest.inputValue('#join-code');

  await host.click('#btn-host-scan-answer');
  await host.fill('#host-paste', answer);
  await host.click('#btn-host-paste-ok');
  await host.waitForSelector('#host-step-lobby:not(.hidden)', { timeout: 15000 });
  check('Nina apparaît dans le salon', (await host.textContent('#lobby-list')).includes('Nina'));
  await host.click('#btn-host-start');
  await host.waitForSelector('#screen-game.active');
  await guest.waitForSelector('#screen-game.active', { timeout: 15000 });
  check('partie lancée des deux côtés', true);

  await browser.close();
  console.log(failures ? failures + ' ÉCHEC(S)' : 'Parcours URL/QR OK.');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
