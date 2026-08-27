const { chromium } = require('playwright');
let failures = 0;
function check(n, c, e) {
  if (c) console.log('  OK  ' + n);
  else { failures++; console.log('  FAIL ' + n + (e !== undefined ? ' -> ' + JSON.stringify(e) : '')); }
}
const rackLetters = p => p.$$eval('#rack .rack-tile', els =>
  els.map(e => e.textContent.replace(/[0-9]/g, '').trim()));

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const p = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  p.on('pageerror', e => { failures++; console.log('  FAIL JS: ' + e.message); });
  await p.goto('http://localhost:8642/index.html');
  check('tuile Words au catalogue', (await p.textContent('#catalog')).includes('Words'));
  await p.click('.game-tile[data-g="mots"]');
  check('écran Words', (await p.textContent('#screen-mots-home h2')).includes('Words'));
  await p.click('#btn-mode-local');
  await p.click('#btn-local-start');
  await p.waitForSelector('#overlay-pass:not(.hidden)', { timeout: 30000 });
  await p.click('#btn-pass-ready');

  const before = await rackLetters(p);
  check('7 lettres au chevalet', before.length === 7, before);

  // glisse la 1re lettre après la 3e
  const b0 = await p.locator('#rack .rack-tile').nth(0).boundingBox();
  const b2 = await p.locator('#rack .rack-tile').nth(2).boundingBox();
  await p.mouse.move(b0.x + b0.width / 2, b0.y + b0.height / 2);
  await p.mouse.down();
  await p.mouse.move(b2.x + b2.width * 0.9, b0.y + b0.height / 2, { steps: 10 });
  // pendant le glissement, les autres lettres s'écartent (animation d'insertion)
  const shifted = await p.evaluate(() =>
    [...document.querySelectorAll('#rack .rack-tile:not(.dragging)')]
      .filter(t => t.style.transform && t.style.transform !== 'none').length);
  check('les lettres s’écartent pendant le glissement', shifted >= 1, shifted);
  await p.mouse.up();
  const after = await rackLetters(p);
  const expected = [before[1], before[2], before[0]].concat(before.slice(3));
  check('lettre déplacée en 3e position', JSON.stringify(after) === JSON.stringify(expected),
    { avant: before.join(''), apres: after.join(''), attendu: expected.join('') });
  check('aucune lettre perdue', after.slice().sort().join('') === before.slice().sort().join(''));

  // le tap simple sélectionne toujours
  await p.locator('#rack .rack-tile').nth(0).click();
  check('tap = sélection conservée', await p.locator('#rack .rack-tile.selected').count() === 1);
  // et la pose sur le plateau fonctionne après un glissement
  await p.locator('#board .cell[data-i="112"]').click();
  if (!(await p.locator('#overlay-joker').evaluate(el => el.classList.contains('hidden')))) {
    await p.locator('#joker-letters button', { hasText: 'E' }).first().click();
  }
  check('pose sur le plateau OK', await p.locator('#board .cell .tile.new').count() === 1);
  await p.click('#btn-recall');
  check('reprise OK', await p.locator('#board .cell .tile').count() === 0);

  await browser.close();
  console.log(failures ? failures + ' ÉCHEC(S)' : '\nTest chevalet OK.');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
