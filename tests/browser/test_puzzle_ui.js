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
  await p.goto((process.env.GG_URL || 'http://localhost:8642/index.html'));

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
  // V2 : un mauvais chiffre reste affiché en rouge et compte une erreur (limite de 3) :
  // on joue d'abord UN mauvais chiffre, puis le bon (retrouvé par le solveur du jeu)
  const cible = await p.evaluate(() => {
    const cells = [...document.querySelectorAll('.sdk-cell')].map(c => c.classList.contains('given') ? +c.textContent : 0);
    const sol = [];
    GG.byId.sudoku._countSolutions(cells, 1, -1, 0, sol);
    const i = cells.indexOf(0);
    return { i, v: sol[i] };
  });
  await p.locator('.sdk-cell[data-i="' + cible.i + '"]').click();
  await p.locator('.sdk-key[data-v="' + (cible.v % 9 + 1) + '"]').click();
  await p.waitForTimeout(80);
  check('mauvais chiffre : affiché en rouge dans sa case', await p.locator('.sdk-cell.bad[data-i="' + cible.i + '"]').count() === 1);
  await p.locator('.sdk-key[data-v="' + cible.v + '"]').click();
  await p.waitForTimeout(80);
  const stats = (await p.textContent('#sdk-prog')) + ' ' + (await p.textContent('#sdk-err'));
  check('progression et erreurs affichées', /1\//.test(stats) && /❌ 1/.test(stats), stats);
  await p.click('#btn-mini-menu'); await p.click('#btn-menu-quit'); await p.click('#btn-confirm-yes');

  // Mots mêlés solo : trouve un mot en lisant la grille à l'écran
  await p.click('.game-tile[data-g="meles"]');
  await p.click('#btn-mini-hotseat');
  await p.locator('#mini-count .count-btn[data-n="1"]').click(); // seul (par défaut : 2)
  await p.click('#btn-mini-start');
  await p.waitForSelector('#screen-mini.active');
  await p.waitForSelector('[data-lvl="facile"]', { timeout: 20000 });
  await p.click('[data-lvl="facile"]');
  await p.waitForSelector('.mel-grid', { timeout: 20000 });
  const found = await p.evaluate(() => {
    const cells = [...document.querySelectorAll('.mel-cell')].map(c => c.textContent);
    const N = +document.querySelector('.mel-grid').dataset.cols;   // V2 : grilles rectangulaires
    const NR = +document.querySelector('.mel-grid').dataset.rows;
    const words = [...document.querySelectorAll('.mel-word:not(.found)')].map(w => w.textContent);
    const dirs = [[0, 1], [1, 0], [1, 1], [1, -1], [0, -1], [-1, 0], [-1, -1], [-1, 1]];
    for (const w of words) {
      for (let r = 0; r < NR; r++) for (let c = 0; c < N; c++) for (const d of dirs) {
        const er = r + d[0] * (w.length - 1), ec = c + d[1] * (w.length - 1);
        if (er < 0 || er >= NR || ec < 0 || ec >= N) continue;
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
    // V2 : chaque mot trouvé est surligné par une gélule de sa couleur
    check('cases colorées', await p.locator('.mel-traits .mel-trait').count() === 1);
  }
  await p.click('#btn-mini-menu'); await p.click('#btn-menu-quit'); await p.click('#btn-confirm-yes');

  // Mot Mystère solo : essais ILLIMITÉS, on résout le mot comme un joueur
  await p.click('.game-tile[data-g="motus"]');
  await p.click('#btn-mini-hotseat');
  await p.locator('#mini-count .count-btn[data-n="1"]').click(); // seul (par défaut : 2)
  await p.click('#btn-mini-start');
  await p.waitForSelector('#screen-mini.active');
  await p.waitForSelector('[data-lvl="facile"]', { timeout: 20000 });
  await p.click('[data-lvl="facile"]');
  await p.waitForSelector('.mot-kb', { timeout: 20000 });
  await p.waitForTimeout(450); // le clavier s’arme 350 ms après son apparition
  // V2 : la première lettre est offerte ; on tape le mot ENTIER (la lettre
  // offerte retapée est absorbée, comme au jeu télévisé)
  const motValide = () => p.evaluate(() => {
    const first = document.querySelector('.mot-row.mot-cur .mot-cell').textContent;
    const L = document.querySelectorAll('.mot-row.mot-cur .mot-cell').length;
    return GG.MOTS_MYSTERE[L].filter(w => w[0] === first)[3];
  });
  const premier = await motValide();
  for (const L of premier) await p.locator('.mot-key[data-k="' + L + '"]').click();
  await p.locator('.mot-key[data-k="OK"]').click();
  await p.waitForTimeout(400);
  if (await p.locator('.mot-reveal').count() === 0) {
    const rows = await p.locator('.mot-row').count();
    check('essai jugé et nouvelle ligne affichée', rows === 2, rows);
    const colored = await p.locator('.mot-cell.m0, .mot-cell.m1, .mot-cell.m2').count();
    check('couleurs attribuées aux 5 lettres', colored === 5, colored);
    check('clavier neutre : les couleurs restent sur le tableau, pas sur les touches',
      await p.locator('.mot-key.k0, .mot-key.k1, .mot-key.k2').count() === 0);
  } else {
    check('essai jugé et nouvelle ligne affichée', true); // c'était le secret !
    check('couleurs attribuées aux 5 lettres', true);
    check('clavier neutre : les couleurs restent sur le tableau, pas sur les touches', true);
  }
  // on résout par les couleurs (comme un joueur) : essais illimités
  for (let it = 0; it < 30; it++) { // essais illimités : on va au bout
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
      const first = document.querySelector('.mot-row.mot-cur .mot-cell').textContent;
      const cand = GG.MOTS_COURANTS.filter(w => w.length === 5 && w[0] === first &&
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
  await p.waitForTimeout(450);
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
  await p.waitForTimeout(450); // le clavier s’arme 350 ms après son apparition
  for (const L of await motValide()) await p.locator('.mot-key[data-k="' + L + '"]').click();
  await p.locator('.mot-key[data-k="OK"]').click();
  await p.waitForTimeout(400);
  if (await p.locator('.mot-reveal').count() === 0) {
    check('duel : l’essai porte la pastille de son auteur',
      await p.locator('.mot-board .mot-who').count() >= 1);
    check('duel : c’est au tour du joueur 2, même tableau',
      /Joueur 2/.test(await p.textContent('#mini-turn')) &&
      await p.locator('.mot-kb').count() === 1);
  } else {
    check('duel : l’essai porte la pastille de son auteur', true); // c'était le secret
    check('duel : c’est au tour du joueur 2, même tableau', true);
  }

  await p.click('#btn-mini-menu'); await p.click('#btn-menu-quit'); await p.click('#btn-confirm-yes');

  // Mots croisés solo (V2) : on écrit DANS la grille, au clavier de l’écran
  await p.click('.game-tile[data-g="croises"]');
  await p.waitForSelector('[data-lvl="facile"]', { timeout: 20000 });
  check('Mots croisés : lancement direct, sans écran de config',
    await p.locator('#screen-mini.active').count() === 1);
  await p.click('[data-lvl="facile"]');
  await p.waitForSelector('.gx-grille', { timeout: 20000 });
  const nCases = await p.locator('.gx-cr .gx-c').count() + await p.locator('.gx-cr .gx-n').count();
  check('grille 8×8 affichée', nCases === 64, nCases);
  const actives = await p.locator('.gx-cr .gx-c').count();
  check('grille dense : au moins 45 cases blanches', actives >= 45, actives);
  check('numérotation classique en marge (I… et 1…)',
    await p.locator('.gx-rom').count() === 8 && await p.locator('.gx-num').count() === 8 &&
    (await p.textContent('.gx-rom')).trim() === 'I');
  // la liste des définitions, dans un tiroir
  await p.click('[data-a="liste"]');
  await p.waitForSelector('.gx-tiroir:not(.gx-cache)');
  const nbDefs = await p.locator('.gx-ld').count();
  check('au moins 12 définitions listées', nbDefs >= 12, nbDefs);
  check('sections → et ↓', /Horizontalement/.test(await p.textContent('.gx-liste')) &&
    /Verticalement/.test(await p.textContent('.gx-liste')));
  await p.click('[data-a="fermer"]');
  // le premier mot est proposé d’office, sa définition en grand au-dessus du clavier
  check('définition courante dans le bandeau', (await p.textContent('.gx-txt')).length > 3);
  check('cases du mot surlignées', await p.locator('.gx-c.sel').count() >= 2);
  const cibleCr = await p.evaluate(() => {
    const V = document.getElementById('mini-area')._gx;
    const g = GG.byId.croises._grille(V.s.level, V.s.gnum);
    return { w: V.sel.w, mot: g.mots[V.sel.w].w };
  });
  // mauvaise réponse d’abord : le mot tremble, l’erreur est comptée, les lettres fausses s’effacent
  const mauvais = cibleCr.mot.split('').map(ch => ch === 'Z' ? 'Y' : 'Z').join('');
  for (const ch of mauvais) await p.click('.gx-k[data-k="' + ch + '"]');
  await p.waitForTimeout(300);
  const apres = await p.evaluate((w) => {
    const V = document.getElementById('mini-area')._gx;
    return { err: V.s.players[0].errors, lettres: V.s.words[w].cells.map(c => V.s.saisie[c]).join('') };
  }, cibleCr.w);
  check('mauvaise réponse : erreur comptée et lettres fausses effacées', apres.err === 1 && apres.lettres === '', apres);
  // puis la bonne
  for (const ch of cibleCr.mot) await p.click('.gx-k[data-k="' + ch + '"]');
  await p.waitForTimeout(300);
  check('mot validé : ses cases s’illuminent', await p.locator('.gx-c.ok').count() >= cibleCr.mot.length);
  check('lettres écrites dans la grille', await p.evaluate((mot) =>
    [...document.querySelectorAll('.gx-c.ok .gx-l')].map(e => e.textContent).join('').includes(mot[0]), cibleCr.mot));
  check('points affichés', /★ \d+/.test(await p.textContent('.gx-score')));

  await browser.close();
  console.log(failures ? failures + ' ÉCHEC(S)' : '\nTests réflexion UI OK.');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
