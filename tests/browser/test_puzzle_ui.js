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

  // Sudoku solo : lancement direct, niveau facile, une case remplie
  await p.click('.game-tile[data-g="sudoku"]');
  await p.waitForSelector('[data-lvl="facile"]', { timeout: 20000 });
  check('Sudoku : lancement direct, sans écran de config',
    await p.locator('#screen-mini.active').count() === 1);
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

  // Mot Mystère solo : essais ILLIMITÉS, on résout le mot comme un joueur
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
  if (await p.locator('.mot-reveal').count() === 0) {
    const rows = await p.locator('.mot-row').count();
    check('essai jugé et nouvelle ligne affichée', rows === 2, rows);
    const colored = await p.locator('.mot-cell.m0, .mot-cell.m1, .mot-cell.m2').count();
    check('couleurs attribuées aux 5 lettres', colored === 5, colored);
    check('clavier à mémoire : des touches colorées', await p.locator('.mot-key.k0, .mot-key.k1, .mot-key.k2').count() >= 1);
  } else {
    check('essai jugé et nouvelle ligne affichée', true); // CHIEN était le secret !
    check('couleurs attribuées aux 5 lettres', true);
    check('clavier à mémoire : des touches colorées', true);
  }
  // on résout par les couleurs (comme un joueur) : essais illimités
  for (let it = 0; it < 14; it++) {
    if (await p.locator('.mot-reveal').count()) break;
    const prochain = await p.evaluate(() => {
      const rows = [...document.querySelectorAll('.mot-board .mot-row')]
        .filter(r => !r.querySelector('.mot-cell.cur'));
      const essais = rows.map(r => {
        const cells = [...r.querySelectorAll('.mot-cell')];
        return {
          word: cells.map(c => c.textContent).join(''),
          marks: cells.map(c => /\bm2\b/.test(c.className) ? 2 : /\bm1\b/.test(c.className) ? 1 : 0)
        };
      }).filter(e => /^[A-Z]{5}$/.test(e.word));
      const mk = GG.byId.motus._marks;
      const cand = GG.MOTS_COURANTS.filter(w => w.length === 5 &&
        !essais.some(e => e.word === w) &&
        essais.every(e => JSON.stringify(mk(w, e.word)) === JSON.stringify(e.marks)));
      return cand[0];
    });
    if (!prochain) break;
    for (const L of prochain) await p.locator('.mot-key[data-k="' + L + '"]').click();
    await p.locator('.mot-key[data-k="OK"]').click();
    await p.waitForTimeout(250);
  }
  await p.waitForSelector('.mot-reveal', { timeout: 8000 });
  check('mot résolu en série (essais illimités), pas d’écran de fin',
    await p.locator('#overlay-end:not(.hidden)').count() === 0);
  check('bouton « Mot suivant » proposé', await p.locator('#mot-next').count() === 1);
  await p.click('#mot-next');
  await p.waitForSelector('.mot-kb', { timeout: 8000 });
  check('mot n°2 lancé, grille vierge', /Mot n°2/.test(await p.textContent('#mini-area')) &&
    await p.locator('.mot-row').count() === 1);
  await p.click('#btn-mini-menu'); await p.click('#btn-menu-quit'); await p.click('#btn-confirm-yes');

  // Mot Mystère à 2 sur un téléphone : MÊME mot, chacun son tour
  await p.click('.game-tile[data-g="motus"]');
  await p.click('#btn-mini-hotseat');
  await p.locator('#mini-count .count-btn[data-n="2"]').click();
  await p.click('#btn-mini-start');
  await p.waitForSelector('[data-lvl="facile"]', { timeout: 20000 });
  await p.click('[data-lvl="facile"]');
  await p.waitForSelector('.mot-kb', { timeout: 20000 });
  for (const L of 'PLAGE') await p.locator('.mot-key[data-k="' + L + '"]').click();
  await p.locator('.mot-key[data-k="OK"]').click();
  await p.waitForTimeout(400);
  if (await p.locator('.mot-reveal').count() === 0) {
    check('duel : l’essai porte la pastille de son auteur',
      await p.locator('.mot-board .mot-who').count() >= 1);
    check('duel : c’est au tour du joueur 2, même tableau',
      /Joueur 2/.test(await p.textContent('#mini-turn')) &&
      await p.locator('.mot-kb').count() === 1);
  } else {
    check('duel : l’essai porte la pastille de son auteur', true); // PLAGE était le secret
    check('duel : c’est au tour du joueur 2, même tableau', true);
  }

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
  await p.waitForSelector('[data-lvl="facile"]', { timeout: 20000 });
  check('Mots croisés : lancement direct, sans écran de config',
    await p.locator('#screen-mini.active').count() === 1);
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
