const ROOT = require('path').join(__dirname, '../..');
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

  // Sudoku solo : niveau facile, une case remplie
  await p.click('.game-tile[data-g="sudoku"]');
  await p.click('#btn-mini-hotseat');
  check('Sudoku : solo uniquement sur ce téléphone',
    await p.locator('#mini-count .count-btn').count() === 1);
  await p.click('#btn-mini-start');
  await p.waitForSelector('#screen-mini.active');
  await p.click('[data-lvl="facile"]');
  await p.waitForSelector('.sdk-grid', { timeout: 20000 });
  check('grille 9×9', await p.locator('.sdk-cell').count() === 81);
  const givens = await p.locator('.sdk-cell.given').count();
  check('niveau facile ≈ 40 cases données', givens >= 38 && givens <= 45, givens);
  // remplit une case : tente 1-9 jusqu'au bon chiffre
  await p.locator('.sdk-cell:not(.given)').first().click();
  for (let v = 1; v <= 9; v++) {
    await p.locator('.sdk-key[data-v="' + v + '"]').click();
    await p.waitForTimeout(60);
    const st = await p.textContent('.mem-stats');
    if (/1\//.test(st)) break;
  }
  const stats = await p.textContent('.mem-stats');
  check('progression et erreurs affichées', /1\//.test(stats) && /❌/.test(stats), stats);
  await p.click('#btn-mini-menu'); await p.click('#btn-menu-quit'); await p.click('#btn-confirm-yes');

  // Mots mêlés solo : trouve un mot en lisant la grille à l'écran
  await p.click('.game-tile[data-g="meles"]');
  await p.click('#btn-mini-hotseat');
  await p.click('#btn-mini-start');
  await p.waitForSelector('#screen-mini.active');
  await p.waitForSelector('[data-lvl="facile"]', { timeout: 20000 });
  await p.click('[data-lvl="facile"]');
  await p.waitForSelector('.mel-grid', { timeout: 20000 });
  const found = await p.evaluate(() => {
    const cells = [...document.querySelectorAll('.mel-cell')].map(c => c.textContent);
    const N = Math.sqrt(cells.length);
    const words = [...document.querySelectorAll('.mel-word:not(.found)')].map(w => w.textContent);
    const dirs = [[0, 1], [1, 0], [1, 1], [1, -1], [0, -1], [-1, 0], [-1, -1], [-1, 1]];
    for (const w of words) {
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) for (const d of dirs) {
        const er = r + d[0] * (w.length - 1), ec = c + d[1] * (w.length - 1);
        if (er < 0 || er >= N || ec < 0 || ec >= N) continue;
        let ok = true;
        for (let k = 0; k < w.length; k++) {
          if (cells[(r + d[0] * k) * N + (c + d[1] * k)] !== w[k]) { ok = false; break; }
        }
        if (ok) return { a: r * N + c, b: er * N + ec, w };
      }
    }
    return null;
  });
  check('mot localisable dans la grille affichée', !!found, found);
  if (found) {
    await p.locator('.mel-cell[data-i="' + found.a + '"]').click();
    await p.locator('.mel-cell[data-i="' + found.b + '"]').click();
    await p.waitForTimeout(300);
    check('mot barré de la liste', await p.locator('.mel-word.found').count() === 1);
    check('cases colorées', await p.evaluate(() =>
      [...document.querySelectorAll('.mel-cell')].some(c => c.style.background)));
  }
  await p.click('#btn-mini-menu'); await p.click('#btn-menu-quit'); await p.click('#btn-confirm-yes');

  // Mot Mystère solo : tape CHIEN au clavier à l'écran
  await p.click('.game-tile[data-g="motus"]');
  await p.click('#btn-mini-hotseat');
  await p.click('#btn-mini-start');
  await p.waitForSelector('#screen-mini.active');
  await p.waitForSelector('[data-lvl="facile"]', { timeout: 20000 });
  await p.click('[data-lvl="facile"]');
  await p.waitForSelector('.mot-kb', { timeout: 20000 });
  for (const L of 'CHIEN') await p.locator('.mot-key[data-k="' + L + '"]').click();
  await p.locator('.mot-key[data-k="OK"]').click();
  await p.waitForTimeout(400);
  const rows = await p.locator('.mot-row').count();
  check('essai jugé et nouvelle ligne affichée', rows === 2, rows);
  const colored = await p.locator('.mot-cell.m0, .mot-cell.m1, .mot-cell.m2').count();
  check('couleurs attribuées aux 5 lettres', colored === 5, colored);

  await p.click('#btn-mini-menu'); await p.click('#btn-menu-quit'); await p.click('#btn-confirm-yes');

  // Mots croisés solo : sélectionne une définition, répond via la base
  require(ROOT + '/js/games/registry.js');
  const croises = require(ROOT + '/js/games/croises.js');
  const defMap = {};
  for (const lvl of ['facile', 'moyen', 'difficile']) {
    for (const e of croises._DB[lvl]) {
      const i = e.indexOf('|');
      defMap[e.slice(i + 1)] = e.slice(0, i);
    }
  }
  await p.click('.game-tile[data-g="croises"]');
  await p.click('#btn-mini-hotseat');
  check('Mots croisés : solo uniquement sur ce téléphone',
    await p.locator('#mini-count .count-btn').count() === 1);
  await p.click('#btn-mini-start');
  await p.waitForSelector('#screen-mini.active');
  await p.waitForSelector('[data-lvl="facile"]', { timeout: 20000 });
  await p.click('[data-lvl="facile"]');
  await p.waitForSelector('.cr-grid', { timeout: 20000 });
  check('grille 9×9 affichée', await p.locator('.cr-cell').count() === 81);
  const actives = await p.locator('.cr-cell[data-i]').count();
  check('cases blanches présentes', actives >= 20, actives);
  const nbDefs = await p.locator('.cr-def').count();
  check('au moins 6 définitions listées', nbDefs >= 6, nbDefs);
  check('sections → et ↓', /Horizontalement/.test(await p.textContent('#mini-area')) &&
    /Verticalement/.test(await p.textContent('#mini-area')));
  // sélectionne la 1re définition et répond juste (réponse retrouvée dans la base)
  const defBtn = p.locator('.cr-def:not(.found)').first();
  const defTxt = (await defBtn.textContent()).replace(/^\d+\.\s*/, '').replace(/\s*\(\d+\)$/, '');
  const answer = defMap[defTxt];
  check('définition retrouvée dans la base', !!answer, defTxt);
  await defBtn.click();
  await p.waitForSelector('#cr-guess');
  check('cases du mot surlignées', await p.locator('.cr-cell.sel').count() >= 3);
  // mauvaise réponse d'abord : erreur comptée
  const mauvais = (answer[0] === 'A' ? 'B' : 'A') + answer.slice(1);
  await p.fill('#cr-guess', mauvais);
  await p.click('[data-a="try"]');
  await p.waitForTimeout(300);
  check('mauvaise réponse signalée', /ne convient pas/.test(await p.textContent('#mini-area')));
  await p.fill('#cr-guess', answer.toLowerCase());
  await p.click('[data-a="try"]');
  await p.waitForTimeout(300);
  check('mot validé : définition colorée', await p.locator('.cr-def.found').count() === 1);
  check('lettres révélées dans la grille', await p.evaluate(() =>
    [...document.querySelectorAll('.cr-cell[data-i]')].filter(c => c.style.background && c.textContent.trim()).length >= 3));
  check('points et erreurs affichés', /❌1/.test((await p.textContent('.mem-stats')).replace(/\s/g, '')));

  await browser.close();
  console.log(failures ? failures + ' ÉCHEC(S)' : '\nTests réflexion UI OK.');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
