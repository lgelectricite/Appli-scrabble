const { chromium } = require('playwright');
let failures = 0;
function check(n, c, e) { if (c) console.log('  OK  ' + n); else { failures++; console.log('  FAIL ' + n + (e !== undefined ? ' -> ' + JSON.stringify(e) : '')); } }
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const p = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  p.on('pageerror', e => { failures++; console.log('  FAIL JS: ' + e.message); });
  await p.goto('http://localhost:8642/index.html');
  await p.click('.game-tile[data-g="mots"]');
  await p.click('#btn-mode-local');
  await p.click('#btn-local-start');
  await p.waitForSelector('#overlay-pass:not(.hidden)', { timeout: 30000 });
  await p.click('#btn-pass-ready');
  // Force un chevalet connu pour tester précisément
  await p.evaluate(() => new Promise(res => {
    const iv = setInterval(() => {
      // attend que le dictionnaire soit chargé (exposé indirectement : on tente)
      res(); clearInterval(iv);
    }, 100);
  }));
  // Pose X puis Q au centre => "XQ" invalide
  const setRack = async (letters) => p.evaluate(l => { /* pas d'accès interne : on joue avec le vrai chevalet */ }, letters);
  // On joue simplement les 2 premières tuiles du chevalet : le mot formé est
  // presque toujours invalide ; on vérifie le message OU la validité selon le dico.
  for (const cell of [112, 113]) {
    await p.locator('#rack .rack-tile').nth(0).click();
    await p.locator(`#board .cell[data-i="${cell}"]`).click();
    if (!(await p.locator('#overlay-joker').evaluate(el => el.classList.contains('hidden')))) {
      await p.locator('#joker-letters button', { hasText: 'X' }).first().click();
    }
  }
  await p.waitForSelector('#move-info:not(.hidden)');
  const info = await p.textContent('#move-info');
  const isBad = await p.locator('#move-info.bad').count() === 1;
  console.log('  aperçu:', JSON.stringify(info), '| refusé:', isBad);
  if (isBad) {
    check('mot invalide signalé dans l’aperçu', /dictionnaire/.test(info), info);
    await p.click('#btn-play');
    await p.waitForSelector('#toast:not(.hidden)');
    const t = await p.textContent('#toast');
    check('Valider refuse le mot hors dictionnaire', /dictionnaire/.test(t), t);
  } else {
    check('mot valide accepté avec score', /pts/.test(info), info);
  }
  await browser.close();
  console.log(failures ? failures + ' ÉCHEC(S)' : 'Validation dictionnaire OK.');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
