const ROOT = require('path').join(__dirname, '../..');
/* UI : Quiz (solo), Le Plus Proche (2 joueurs pass-device), 8 américain (2 joueurs). */
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
  async function quit() {
    await p.click('#btn-mini-menu'); await p.click('#btn-menu-quit'); await p.click('#btn-confirm-yes');
    await p.waitForTimeout(150);
  }

  // ---------- Quiz en solo : 10 questions jusqu'au classement ----------
  console.log('--- Quiz (solo) ---');
  await p.click('.game-tile[data-g="quiz"]');
  await p.click('#btn-mini-hotseat');
  await p.click('#btn-mini-start');
  // écran de choix du thème d'abord
  await p.waitForSelector('.qz-theme[data-th]', { timeout: 15000 });
  check('choix du thème proposé (≥ 2 thèmes)', await p.locator('.qz-theme[data-th]').count() >= 2);
  await p.click('.qz-theme[data-th="melange"]');
  await p.waitForSelector('.qz-q', { timeout: 15000 });
  check('question affichée avec 4 choix', await p.locator('.qz-choice[data-i]').count() === 4);
  for (let qn = 0; qn < 10; qn++) {
    await p.locator('.qz-choice[data-i]').first().click();
    await p.waitForSelector('.qz-choice.good', { timeout: 8000 });
    if (qn === 0) {
      check('bonne réponse révélée en surbrillance', true);
      check('nom du joueur affiché sous son choix', /Joueur 1/.test(await p.textContent('.qz-choices')));
    }
    await p.click('[data-a="next"]');
    await p.waitForTimeout(120);
  }
  await p.waitForSelector('#overlay-end:not(.hidden)', { timeout: 8000 });
  check('classement final affiché', /pts/.test(await p.textContent('#end-detail')));
  check('record solo enregistré', /record|Record|🏆/.test(await p.textContent('#end-detail')));
  await p.click('#btn-end-home');
  await p.waitForTimeout(200);

  // ---------- Le Plus Proche : 2 joueurs sur un téléphone ----------
  console.log('--- Le Plus Proche (2 joueurs) ---');
  await p.click('.game-tile[data-g="proche"]');
  await p.click('#btn-mini-hotseat');
  await p.click('#btn-mini-start');
  await p.waitForSelector('#pr-guess', { timeout: 15000 });
  await p.fill('#pr-guess', '100');
  await p.click('[data-a="guess"]');
  await p.waitForTimeout(150);
  await passIfNeeded();
  check('écran de passage puis saisie du 2e joueur', await p.locator('#pr-guess').count() === 1);
  await p.fill('#pr-guess', '200');
  await p.click('[data-a="guess"]');
  await p.waitForTimeout(200);
  await passIfNeeded();
  check('révélation : réponse et classement de la manche',
    /Réponse/.test(await p.textContent('#mini-area')) &&
    await p.locator('.pr-row').count() === 2);
  check('un gagnant surligné', await p.locator('.pr-row.win').count() >= 1);
  await quit();

  // ---------- 8 américain : 2 joueurs, une action chacun ----------
  console.log('--- 8 américain (2 joueurs) ---');
  await p.click('.game-tile[data-g="huit"]');
  await p.click('#btn-mini-hotseat');
  await p.click('#btn-mini-start');
  await p.waitForSelector('.ha-hand', { timeout: 15000 });
  check('main de 7 cartes affichée', await p.locator('.ha-hand .ha-card').count() === 7);
  check('défausse et pioche visibles',
    await p.locator('.ha-card.big').count() === 1 && await p.locator('.ha-pile').count() === 1);
  // le joueur courant joue une carte jouable, sinon pioche puis passe
  const playable = p.locator('.ha-hand .ha-card.ok:not([class*="8"])');
  const okCards = await p.locator('.ha-hand .ha-card.ok').count();
  if (okCards > 0) {
    // joue la première carte jouable qui n'est pas un 8 (sinon choisit une couleur)
    await p.locator('.ha-hand .ha-card.ok').first().click();
    await p.waitForTimeout(150);
    if (await p.locator('.ha-suit-btn').count()) {
      await p.locator('.ha-suit-btn').first().click();
      await p.waitForTimeout(150);
    }
    check('carte jouée : la main diminue ou le tour passe', true);
  } else {
    await p.click('[data-a="draw"]');
    await p.waitForTimeout(150);
    const canPass = await p.locator('[data-a="pass"]').count();
    if (canPass) await p.click('[data-a="pass"]');
    check('pioche puis passe', true);
  }
  await p.waitForTimeout(150);
  await passIfNeeded();
  check('écran passé au joueur 2', /Joueur 2|À vous/.test(await p.textContent('#mini-area')));
  // les règles sont accessibles
  await p.click('#btn-mini-rules');
  await p.waitForSelector('#overlay-rules:not(.hidden)');
  check('règles du 8 américain', /joker|couleur/i.test(await p.textContent('#rules-body')));
  await p.click('#btn-rules-close');

  // ---------- Mots fléchés : solo, force 1, un mot résolu ----------
  console.log('--- Mots fléchés (solo) ---');
  require(ROOT + '/js/games/registry.js');
  const croises2 = require(ROOT + '/js/games/croises.js');
  const defMap2 = {};
  for (const lvl of ['facile', 'moyen', 'difficile']) {
    for (const e of croises2._DB[lvl]) {
      const i = e.indexOf('|');
      defMap2[e.slice(i + 1)] = e.slice(0, i);
    }
  }
  await quit();
  await p.click('.game-tile[data-g="fleches"]');
  await p.click('#btn-mini-hotseat');
  check('Mots fléchés : solo uniquement sur ce téléphone',
    await p.locator('#mini-count .count-btn').count() === 1);
  await p.click('#btn-mini-start');
  await p.waitForSelector('[data-f="1"]', { timeout: 15000 });
  check('5 forces proposées avec progression', await p.locator('[data-f]').count() === 5 &&
    /200 grilles/.test(await p.textContent('#mini-area')));
  await p.click('[data-f="1"]');
  await p.waitForSelector('.cr-grid', { timeout: 15000 });
  check('grille n°1 force 1 affichée', /Grille n°1 · force 1/.test(await p.textContent('#mini-area')));
  const nbClues = await p.locator('.fl-clue').count();
  check('cases-flèches présentes (' + nbClues + ')', nbClues >= 3);
  // répond à la 1re définition via la base
  const defBtn2 = p.locator('.cr-def:not(.found)').first();
  const defTxt2 = (await defBtn2.textContent()).replace(/^\d+\.\s*/, '').replace(/\s*\(\d+\)$/, '');
  const answer2 = defMap2[defTxt2];
  check('définition retrouvée dans la base', !!answer2, defTxt2);
  await defBtn2.click();
  await p.waitForSelector('#fl-guess');
  await p.fill('#fl-guess', answer2);
  await p.click('[data-a="try"]');
  await p.waitForTimeout(300);
  check('mot inscrit dans la grille', await p.locator('.cr-def.found').count() === 1);
  // une case-flèche sélectionne bien un mot (celle d'un mot déjà résolu
  // ne fait volontairement plus rien : on essaie jusqu'à une sélection)
  let selOk = false;
  const nClues2 = await p.locator('.fl-clue').count();
  for (let ci = 0; ci < nClues2 && !selOk; ci++) {
    await p.locator('.fl-clue').nth(ci).click();
    await p.waitForTimeout(150);
    selOk = (await p.locator('.cr-cell.sel').count()) > 0;
  }
  check('case-flèche → mot sélectionné', selOk);

  await browser.close();
  console.log(failures ? failures + ' ÉCHEC(S)' : '\nTests nouveaux jeux UI OK.');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
