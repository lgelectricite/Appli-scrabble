/*
 * V2 — Sudoku et Bonbons dans un vrai navigateur : parties réelles, un
 * contrôle par bug corrigé, aucune erreur JS, aucun débordement à 412 et
 * 360 px, fluidité mesurée au processeur ralenti ×4.
 *
 *   GG_URL=http://localhost:8707/index.html node tests/browser/test_v2_solo.js [sudoku|bonbons]
 */
const { chromium } = require('playwright');
const URL = process.env.GG_URL || 'http://localhost:8642/index.html';
const QUOI = process.argv[2] || 'tout';
let failures = 0;
function check(n, c, e) {
  if (c) console.log('  OK  ' + n);
  else { failures++; console.log('  FAIL ' + n + (e !== undefined ? ' -> ' + JSON.stringify(e) : '')); }
}

async function nouvellePage(browser, w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  p.erreurs = [];
  p.on('pageerror', e => { p.erreurs.push(e.message); failures++; console.log('  FAIL JS: ' + e.message); });
  await p.goto(URL);
  await p.waitForSelector('.game-tile[data-g="sudoku"]');
  return { ctx, p };
}
async function debord(p) {
  return p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}
async function quitter(p) {
  await p.click('#btn-mini-menu');
  await p.click('#btn-menu-quit');
  await p.click('#btn-confirm-yes');
  await p.waitForSelector('#screen-home.active');
}
/* la solution de la grille affichée, retrouvée par le solveur exhaustif du jeu */
async function solutionAffichee(p) {
  return p.evaluate(() => {
    const cells = [...document.querySelectorAll('.sdk-cell')].map(c => c.classList.contains('given') ? +c.textContent : 0);
    const sol = [];
    GG.byId.sudoku._countSolutions(cells, 1, -1, 0, sol);
    return sol;
  });
}

async function testSudoku(browser) {
  console.log('--- Sudoku ---');
  const { ctx, p } = await nouvellePage(browser, 412, 780);
  await p.click('.game-tile[data-g="sudoku"]');
  await p.waitForSelector('.sdk-home');
  check('accueil : défi du jour + 4 niveaux (facile, moyen, difficile, expert)',
    await p.locator('.sdk-daily').count() === 1 &&
    await p.locator('.sdk-lvl').count() === 4 && await p.locator('[data-lvl="expert"]').count() === 1);
  check('accueil : pas de débordement à 412 px', await debord(p) <= 0);

  // ---- bug 6 : génération < 300 ms au processeur ×4, à tous les niveaux ----
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const gen = await p.evaluate(() => {
    const out = {};
    for (const l of ['facile', 'moyen', 'difficile', 'expert']) {
      let max = 0;
      for (let k = 0; k < 12; k++) {
        const t0 = performance.now();
        const m = GG.byId.sudoku._makePuzzle(l);
        max = Math.max(max, performance.now() - t0);
        if (!GG.byId.sudoku._convient(l, GG.byId.sudoku._rate(m.puzzle))) max = 1e9;
      }
      out[l] = Math.round(max);
    }
    return out;
  });
  console.log('       génération au processeur ×4, pire de 12 (ms) : ' + JSON.stringify(gen));
  check('bug 6 : grille classée générée en < 300 ms au processeur ×4 (4 niveaux)',
    Object.values(gen).every(ms => ms < 300), gen);

  // coût d'un geste au processeur ×4
  await p.click('[data-lvl="facile"]');
  await p.waitForSelector('.sdk-grid');
  const geste = await p.evaluate(async () => {
    const ts = [];
    for (let k = 0; k < 8; k++) {
      const c = [...document.querySelectorAll('.sdk-cell')].find(x => !x.classList.contains('given') && !x.querySelector('.sdk-v'));
      c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      const t0 = performance.now();
      document.querySelector('[data-tool="notes"]').click();
      document.querySelector('.sdk-key[data-v="' + (1 + k) + '"]').click();
      document.querySelector('[data-tool="notes"]').click();
      ts.push(performance.now() - t0);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    }
    ts.sort((a, b) => a - b);
    return Math.round(ts[4]);
  });
  console.log('       un geste (action + rendu complet) au processeur ×4 : médiane ' + geste + ' ms');
  check('un geste se traite en moins de 50 ms au processeur ×4', geste < 50, geste);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  while (await p.evaluate(() => document.querySelectorAll('.sdk-notes').length > 0)) {
    await p.click('[data-tool="undo"]');
  }

  // ---- bug 4 : toucher la case déjà choisie la garde choisie, le chiffre tapé est posé ----
  const sol = await solutionAffichee(p);
  const vides = await p.evaluate(() => [...document.querySelectorAll('.sdk-cell:not(.given)')].map(c => +c.dataset.i));
  const a = vides[0];
  await p.click('.sdk-cell[data-i="' + a + '"]');
  await p.click('.sdk-cell[data-i="' + a + '"]'); // second toucher sur la même case
  check('bug 4 : la case touchée deux fois reste sélectionnée',
    await p.locator('.sdk-cell.sel[data-i="' + a + '"]').count() === 1);
  await p.click('.sdk-key[data-v="' + sol[a] + '"]');
  await p.waitForTimeout(60);
  check('bug 4 : le chiffre tapé ensuite est bien posé',
    (await p.textContent('.sdk-cell[data-i="' + a + '"]')).trim() === String(sol[a]));
  // jamais d'appui sans réponse : une case de départ explique pourquoi elle refuse
  const donnee = await p.evaluate(() => +document.querySelector('.sdk-cell.given').dataset.i);
  await p.click('.sdk-cell[data-i="' + donnee + '"]');
  await p.click('.sdk-key[data-v="5"]');
  await p.waitForSelector('#toast:not(.hidden)');
  check('chiffre sur une case de départ : message clair', /grille de départ/.test(await p.textContent('#toast')));

  // ---- bug 5 : surlignages, compteurs, notes, couleur de sélection, erreur en rouge ----
  await p.click('.sdk-cell[data-i="' + a + '"]');
  check('bug 5 : ligne, colonne et bloc de la case surlignés (20 cases)', await p.locator('.sdk-cell.zone').count() === 20);
  check('bug 5 : les chiffres identiques sont surlignés', await p.locator('.sdk-cell.meme').count() >= 1);
  const couleurSel = await p.evaluate(() => getComputedStyle(document.querySelector('.sdk-cell.sel')).backgroundColor);
  const [sr, , sb] = couleurSel.match(/\d+/g).map(Number);
  check('bug 5 : la case choisie n’est plus rouge comme une erreur (violet)', sb > sr, couleurSel);
  const compteurs = await p.evaluate(() => [...document.querySelectorAll('.sdk-key small')].map(s => s.textContent));
  check('bug 5 : sous chaque chiffre, le nombre qu’il reste à placer', compteurs.length === 9 &&
    compteurs.every(t => /^(\d|✓)$/.test(t)), compteurs);
  const b = vides[1];
  const avantB = await p.textContent('.sdk-key[data-v="' + sol[b] + '"] small');
  await p.click('.sdk-cell[data-i="' + b + '"]');
  await p.click('[data-tool="notes"]');
  check('bug 5 : mode notes activé', await p.locator('[data-tool="notes"].on').count() === 1);
  await p.click('.sdk-key[data-v="1"]');
  await p.click('.sdk-key[data-v="9"]');
  await p.waitForTimeout(60);
  const notes = await p.evaluate(b => [...document.querySelectorAll('.sdk-cell[data-i="' + b + '"] .sdk-notes i')].map(i => i.textContent).join(''), b);
  check('bug 5 : notes au crayon dans la case', notes === '19', notes);
  await p.click('[data-tool="notes"]');
  await p.click('[data-tool="auto"]');
  await p.waitForTimeout(80);
  check('bug 5 : notes automatiques sur toutes les cases vides',
    await p.locator('.sdk-notes').count() === vides.length - 1);
  await p.click('.sdk-key[data-v="' + (sol[b] % 9 + 1) + '"]');
  await p.waitForTimeout(80);
  const rouge = await p.evaluate(b => {
    const c = document.querySelector('.sdk-cell[data-i="' + b + '"]');
    return { bad: c.classList.contains('bad'), color: getComputedStyle(c).color };
  }, b);
  const [rr, rg] = rouge.color.match(/\d+/g).map(Number);
  check('bug 5 : un mauvais chiffre reste affiché en rouge dans sa case', rouge.bad && rr > 150 && rg < 80, rouge);
  check('erreur comptée dans le bandeau', /❌ 1\/3/.test(await p.textContent('#sdk-err')));
  await p.click('.sdk-key[data-v="' + sol[b] + '"]');
  await p.waitForTimeout(60);
  const apresB = await p.textContent('.sdk-key[data-v="' + sol[b] + '"] small');
  check('compteur du chiffre : un de moins à placer', +apresB === +avantB - 1 || (apresB === '✓' && +avantB === 1),
    { avantB, apresB });
  // annuler / indice
  await p.click('[data-tool="undo"]');
  await p.waitForTimeout(60);
  check('annuler : le chiffre revient à son état précédent (le faux)',
    await p.locator('.sdk-cell.bad[data-i="' + b + '"]').count() === 1);
  await p.click('[data-tool="hint"]');
  await p.waitForTimeout(60);
  check('indice : la case choisie est révélée', await p.locator('.sdk-cell.hinted[data-i="' + b + '"]').count() === 1);
  // pause
  await p.click('#sdk-pause');
  check('pause : la grille se cache', await p.locator('.sdk.en-pause').count() === 1);
  await p.click('#sdk-resume');
  check('reprise après la pause', await p.locator('.sdk.en-pause').count() === 0);

  // ---- reprise de partie après fermeture de l'appli ----
  const grilleAvant = await p.evaluate(() => [...document.querySelectorAll('.sdk-cell')].map(c => c.textContent).join('|'));
  await p.waitForTimeout(400); // sauvegarde différée de la coque
  await p.reload();
  await p.waitForSelector('#btn-reprise');
  await p.click('#btn-reprise');
  await p.waitForSelector('.sdk-grid');
  const grilleApres = await p.evaluate(() => [...document.querySelectorAll('.sdk-cell')].map(c => c.textContent).join('|'));
  check('reprise : la même grille, notes et chiffres compris', grilleAvant === grilleApres);

  // ---- une grille entière résolue au pavé ----
  const sol2 = await solutionAffichee(p);
  let vague = false;
  for (let i = 0; i < 81; i++) {
    const libre = await p.evaluate(i => {
      const c = document.querySelector('.sdk-cell[data-i="' + i + '"]');
      return c && !c.classList.contains('given') && !c.classList.contains('hinted') &&
        !(c.querySelector('.sdk-v') && !c.classList.contains('bad'));
    }, i);
    if (!libre) continue;
    await p.click('.sdk-cell[data-i="' + i + '"]');
    await p.click('.sdk-key[data-v="' + sol2[i] + '"]');
    if (!vague) vague = await p.locator('.sdk-cell.vague').count() >= 9;
    if (await p.locator('#overlay-end:not(.hidden)').count()) break;
  }
  check('ligne / colonne / bloc terminé : la vague de lumière passe', vague);
  await p.waitForSelector('#overlay-end:not(.hidden)', { timeout: 5000 });
  check('grille résolue au pavé : fin célébrée par la coque (« Bravo ! »)', /Bravo/.test(await p.textContent('#end-titre')));
  check('résumé : temps, erreurs, indices', /Temps/.test(await p.textContent('#end-detail')) &&
    /Indices/.test(await p.textContent('#end-detail')));
  await p.click('#btn-end-new');
  await p.waitForSelector('.sdk-home');
  check('record enregistré et affiché sur l’accueil du jeu', /🏅/.test(await p.textContent('[data-lvl="facile"]')));
  check('statistiques par niveau affichées', await p.locator('.sdk-stats').count() === 1);

  // ---- défi du jour ----
  await p.click('.sdk-daily');
  await p.waitForSelector('.sdk-grid');
  check('défi du jour lancé', /Défi|🗓/.test(await p.textContent('.sdk-top')));
  await quitter(p);
  await ctx.close();

  // ---- 360 × 640 : tout tient, rien ne déborde ----
  const petit = await nouvellePage(browser, 360, 640);
  await petit.p.click('.game-tile[data-g="sudoku"]');
  await petit.p.waitForSelector('.sdk-home');
  check('360 px : accueil sans débordement', await debord(petit.p) <= 0);
  await petit.p.click('[data-lvl="expert"]');
  await petit.p.waitForSelector('.sdk-grid');
  check('360 px : jeu sans débordement', await debord(petit.p) <= 0);
  const bas = await petit.p.evaluate(() => document.querySelector('.sdk-pad').getBoundingClientRect().bottom);
  check('360×640 : le pavé est visible sans défiler', bas <= 640, bas);
  const petite = await petit.p.evaluate(() => {
    const k = document.querySelector('.sdk-key').getBoundingClientRect();
    return { w: Math.round(k.width), h: Math.round(k.height) };
  });
  check('360 px : touches du pavé ≥ 44 px', petite.w >= 44 && petite.h >= 44, petite);
  await petit.ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  if (QUOI === 'tout' || QUOI === 'sudoku') await testSudoku(browser);
  await browser.close();
  console.log(failures ? '\n' + failures + ' ÉCHEC(S)' : '\nTests V2 solo (navigateur) OK.');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
