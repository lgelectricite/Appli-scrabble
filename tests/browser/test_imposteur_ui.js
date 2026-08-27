/* L'Imposteur : partie complète à 3 joueurs sur un téléphone (pass-device). */
const { chromium } = require('playwright');
let failures = 0;
function check(n, c, e) {
  if (c) console.log('  OK  ' + n);
  else { failures++; console.log('  FAIL ' + n + (e !== undefined ? ' -> ' + JSON.stringify(e) : '')); }
}
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const p = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  p.on('pageerror', e => { failures++; console.log('  FAIL JS: ' + e.message); });
  await p.goto('http://localhost:8642/index.html');

  async function passIfNeeded() {
    if (await p.locator('#overlay-pass:not(.hidden)').count()) {
      await p.click('#btn-pass-ready');
      await p.waitForTimeout(120);
    }
  }

  await p.click('.game-tile[data-g="imposteur"]');
  check('description du jeu', /imposteur/i.test(await p.textContent('#mini-setup-desc')));
  await p.click('#btn-mini-hotseat');
  const counts = await p.locator('#mini-count .count-btn').allTextContents();
  check('3 ou 4 joueurs sur un téléphone', counts.join(',') === '3,4', counts);
  await p.click('#btn-mini-start');
  await p.waitForSelector('#screen-mini.active');

  // règles intégrées : le but du jeu est expliqué dans l'appli
  await p.click('#btn-mini-rules');
  await p.waitForSelector('#overlay-rules:not(.hidden)');
  const regles = await p.textContent('#rules-body');
  check('règles : but, indices, votes, victoire expliqués',
    /démasquer/i.test(regles) && /indice/i.test(regles) &&
    /vote/i.test(regles) && /victoire/i.test(regles));
  await p.click('#btn-rules-close');

  // phase découverte : chacun voit SON mot (écrans de passage entre les joueurs)
  const words = [];
  for (let i = 0; i < 3; i++) {
    await passIfNeeded();
    await p.waitForSelector('.imp-word', { timeout: 15000 });
    words.push((await p.textContent('.imp-word')).trim());
    await p.click('[data-a="seen"]');
    await p.waitForTimeout(150);
  }
  check('3 mots distribués', words.length === 3 && words.every(w => w.length >= 2), words);
  const distinct = new Set(words);
  check('un seul imposteur : exactement 2 mots différents', distinct.size === 2, words);

  // phase indices : écran de passage vers chaque orateur, dans l'ordre affiché
  for (let k = 0; k < 3; k++) {
    await passIfNeeded();
    await p.waitForSelector('#imp-clue', { timeout: 15000 });
    await p.fill('#imp-clue', 'indice' + k);
    await p.click('[data-a="clue"]');
    await p.waitForTimeout(150);
  }
  await passIfNeeded();
  check('3 indices affichés', await p.locator('.imp-clue').count() === 3);

  // phase vote : chacun vote (les votes des autres restent cachés)
  for (let k = 0; k < 3; k++) {
    await passIfNeeded();
    await p.waitForSelector('.imp-target', { timeout: 15000 });
    check('2 cibles possibles (pas soi-même)', await p.locator('.imp-target').count() === 2);
    await p.locator('.imp-target').first().click();
    await p.waitForTimeout(150);
  }

  // résultat : élimination ou égalité, puis suite gérée par l'hôte
  await passIfNeeded();
  const body = await p.textContent('#mini-area');
  check('résultat du vote affiché',
    /éliminé|Égalité|gagne/i.test(body), body.slice(0, 120));
  const hasNext = await p.locator('[data-a="next"]').count();
  const hasAgain = await p.locator('[data-a="again"]').count();
  check('l’hôte peut poursuivre (tour suivant ou nouvelle manche)', hasNext + hasAgain >= 1);
  if (hasAgain) {
    check('fin de manche : les deux mots révélés', /Mot des civils/.test(body));
    check('camps révélés', await p.locator('.imp-role-tag').count() === 3);
  }

  await browser.close();
  console.log(failures ? failures + ' ÉCHEC(S)' : '\nTests Imposteur UI OK.');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
