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

/* =====================================================================
 * BONBONS
 * ===================================================================== */
/* le plateau tel qu'il est AFFICHÉ (lu dans le DOM) : [{t, s}] par case */
async function plateauAffiche(p) {
  return p.evaluate(() => {
    const b = new Array(64).fill(null);
    document.querySelectorAll('#bb-pieces .bb-cell:not(.part)').forEach(e => {
      const i = +e.getAttribute('data-i'), dt = e.getAttribute('data-t');
      const m = /bbs-(\d)-(\d)/.exec(e.firstChild.className);
      b[i] = { t: dt === 'x' ? -1 : dt === 'n' ? -2 : +dt, s: m ? +m[2] : 0 };
    });
    return b;
  });
}
async function etatJeu(p) {
  return p.evaluate(() => { const c = document.getElementById('mini-area')._bbCtx; return c && c.state; });
}
async function finAnimation(p) {
  await p.waitForFunction(() => { const V = document.getElementById('mini-area')._bb; return !V || !V.busy; }, null, { timeout: 30000 });
}
/* prépare un état avec le moteur du jeu, puis le fait « reprendre » par la coque */
async function scenario(p, code) {
  // on quitte d'abord la partie en cours : sinon la coque, en la sauvegardant au départ de la
  // page (machine chargée : sauvegarde en retard), écraserait l'état préparé
  await p.reload();
  await p.evaluate((code) => {
    const bb = GG.byId.bonbons, st = bb.create(['Moi']);
    new Function('bb', 'st', code)(bb, st);
    localStorage.setItem('gg-partie', JSON.stringify({ v: 2, type: 'mini', jeu: 'bonbons', bots: 0, state: st, me: 0, ts: Date.now() }));
  }, code);
  await p.reload();
  await p.waitForSelector('#btn-reprise');
  await p.click('#btn-reprise');
  await p.waitForSelector('.bb-board');
  await p.waitForTimeout(700);
}
/* un vrai geste : glisser le bonbon a vers b, ou toucher a puis b */
async function geste(p, a, b, glisse) {
  if (!glisse) {
    await p.click('.bb-cell[data-i="' + a + '"]');
    await p.click('.bb-cell[data-i="' + b + '"]');
    return;
  }
  const ra = await p.locator('.bb-cell[data-i="' + a + '"]').boundingBox();
  const rb = await p.locator('.bb-cell[data-i="' + b + '"]').boundingBox();
  await p.mouse.move(ra.x + ra.width / 2, ra.y + ra.height / 2);
  await p.mouse.down();
  await p.mouse.move((ra.x + rb.x) / 2 + ra.width / 2, (ra.y + rb.y) / 2 + ra.height / 2, { steps: 3 });
  await p.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2, { steps: 2 });
  await p.mouse.up();
}
/* joue le niveau en cours jusqu'à la fenêtre de résultat (meilleur coup, vrais gestes) */
async function joueNiveau(p, suivi) {
  for (let k = 0; k < 80; k++) {
    if (await p.locator('.bb-res').count()) break;
    const mv = await p.evaluate(() => {
      const st = document.getElementById('mini-area')._bbCtx.state;
      if (st.phase !== 'play') return null;
      return GG.byId.bonbons._meilleurCoup(st, st.players[0]);
    });
    if (!mv) break;
    await geste(p, mv[0], mv[1], k % 2 === 1);
    await p.waitForTimeout(40);
    await finAnimation(p);
    if (suivi) await suivi(k);
  }
  await p.waitForSelector('.bb-res', { timeout: 15000 });
}

async function testBonbons(browser) {
  console.log('--- Bonbons ---');
  const { ctx, p } = await nouvellePage(browser, 412, 780);
  await p.evaluate(() => { localStorage.removeItem('gg-bonbons-map'); localStorage.removeItem('gg-partie'); });
  await p.reload();
  await p.click('.game-tile[data-g="bonbons"]');
  await p.waitForSelector('.bb-map');
  check('carte des mondes : monde 1 et niveau 1 prêt', await p.locator('.bb-monde').count() >= 1 &&
    (await p.textContent('.bb-node.cur')).trim() === '1' && /Prairie Guimauve/.test(await p.textContent('.bb-map')));
  check('carte : pas de débordement à 412 px', await debord(p) <= 0);
  await p.click('.bb-node.cur');
  await p.waitForSelector('.bb-intro');
  check('début de niveau : objectif, coups et paliers d’étoiles', /Marquez/.test(await p.textContent('.bb-intro')) &&
    /coups/.test(await p.textContent('.bb-intro')) && await p.locator('.bb-carte-seuils span').count() === 3);
  await p.click('.bb-intro [data-a="go"]');
  await p.waitForSelector('.bb-intro', { state: 'detached' });

  // ---- niveau 1 joué en entier, animations normales, gestes glissés et touchés ----
  let desaccords = 0, alignesVus = 0, animsVues = 0, tombes = 0;
  await joueNiveau(p, async (k) => {
    const aff = await plateauAffiche(p), st = await etatJeu(p);
    if (aff.some((c, i) => (st.players[0].board[i] ? st.players[0].board[i].t : null) !== (c ? c.t : null))) desaccords++;
    alignesVus += await p.evaluate(b => GG.byId.bonbons._findRuns(b).length, aff);
  });
  check('niveau 1 joué au doigt jusqu’au bout : l’écran colle toujours à la grille réelle', desaccords === 0, desaccords);
  const ecartsFilm = await p.evaluate(() => document.getElementById('mini-area')._bb.ecarts || 0);
  check('chaque film (échange, éclatements, chutes) s’arrête exactement sur la grille réelle', ecartsFilm === 0, ecartsFilm);
  check('bug 1 (à l’écran) : jamais d’alignement laissé en attente après un coup', alignesVus === 0, alignesVus);
  let res = (await etatJeu(p)).res;
  check('fin de niveau : fenêtre de résultat', !!res && await p.locator('.bb-res').count() === 1);
  if (res.won) {
    // (on attend la chute de la dernière étoile, sans délai fixe : la machine de test est partagée)
    const tombees = await p.waitForFunction((n) => document.querySelectorAll('.bb-etoile.on.tombe').length === n &&
      document.querySelectorAll('.bb-etoile.on').length === n, res.stars, { timeout: 15000 }).then(() => true, () => false);
    check('les étoiles tombent une à une (' + res.stars + ')', tombees);
    check('gagnants() = [0] après un niveau réussi', await p.evaluate(() => JSON.stringify(GG.byId.bonbons.gagnants(document.getElementById('mini-area')._bbCtx.state))) === '[0]');
    await p.click('[data-a="next"]');
  } else {
    check('gagnants() = null après un échec', await p.evaluate(() => GG.byId.bonbons.gagnants(document.getElementById('mini-area')._bbCtx.state)) === null);
    await p.click('[data-a="retry"]');
  }

  // ---- niveaux suivants, en animations réduites (le réglage de la coque) pour aller vite ----
  await p.evaluate(() => GG.reglages.set('animations', 'reduites'));
  let joues = 1;
  for (let essai = 0; essai < 6 && joues < 4; essai++) {
    await p.waitForSelector('.bb-intro');
    const lvl = (await etatJeu(p)).soloLvl;
    await p.click('.bb-intro [data-a="go"]');
    await p.waitForSelector('.bb-intro', { state: 'detached' });
    await joueNiveau(p);
    res = (await etatJeu(p)).res;
    joues++;
    console.log('       niveau ' + lvl + ' : ' + (res.won ? 'réussi ' + '★'.repeat(res.stars) : 'raté') + ' (' + res.score + ' pts)');
    await p.waitForTimeout(400);
    await p.click(res.won ? '[data-a="next"]' : '[data-a="retry"]');
  }
  await p.evaluate(() => GG.reglages.set('animations', 'normales'));
  const prog = await p.evaluate(() => JSON.parse(localStorage.getItem('gg-bonbons-map')));
  check('plusieurs niveaux joués, progression et étoiles enregistrées', joues >= 4 && prog.lvl >= 2 && Object.keys(prog.stars).length >= 1, prog);

  // ---- reprise : on ferme l'appli en plein niveau ----
  await p.waitForSelector('.bb-intro');
  await p.click('.bb-intro [data-a="go"]');
  await p.waitForSelector('.bb-intro', { state: 'detached' });
  const mv0 = await p.evaluate(() => { const st = document.getElementById('mini-area')._bbCtx.state; return GG.byId.bonbons._meilleurCoup(st, st.players[0]); });
  await geste(p, mv0[0], mv0[1], true);
  await finAnimation(p);
  const avant = { b: await plateauAffiche(p), coups: await p.textContent('#bb-coups') };
  await p.waitForTimeout(400);
  await p.reload();
  await p.click('#btn-reprise');
  await p.waitForSelector('.bb-board');
  await p.waitForTimeout(500);
  const apres = { b: await plateauAffiche(p), coups: await p.textContent('#bb-coups') };
  check('reprise : même plateau et mêmes coups restants', JSON.stringify(avant) === JSON.stringify(apres));

  // ---- quitter un niveau pour la carte, avec confirmation ----
  await p.click('.bb-carte-btn');
  await p.waitForSelector('[data-a="part"]');
  check('quitter le niveau : confirmation demandée', /Quitter le niveau/.test(await p.textContent('#bb-modal')));
  await p.click('[data-a="reste"]');
  check('« Continuer à jouer » referme la fenêtre sans rien perdre', await p.locator('[data-a="part"]').count() === 0 &&
    (await p.textContent('#bb-coups')) === apres.coups);
  await p.click('.bb-carte-btn');
  await p.click('[data-a="part"]');
  await p.waitForSelector('.bb-map');
  check('retour à la carte, avatar du joueur sur le niveau en cours', await p.locator('.bb-node.cur + .bb-node-go + .bb-avatar, .bb-step .bb-avatar').count() === 1);

  // ---- bug 1 à l'écran : sucre magique puis échange qui ne forme rien ----
  await scenario(p, `bb.apply(st, 0, { t: 'start', lvl: 1 }); bb.apply(st, 0, { t: 'go' });
    const b = st.players[0].board; b[27].t = -1; b[27].s = 0; b[28].s = 1;`);
  const coupsAvant = +(await p.textContent('#bb-coups'));
  await geste(p, 27, 28, true);
  const eclairs = await (await p.waitForFunction(() => document.querySelectorAll('.bb-eclairs path').length, null, { timeout: 15000, polling: 'raf' })).jsonValue();
  check('sucre magique + rayé : éclairs vers toute la couleur, rayons', eclairs > 4, eclairs);
  await finAnimation(p);
  const apresMagique = await plateauAffiche(p);
  check('bug 1 : après le sucre magique, la grille affichée est stable (aucun alignement)',
    await p.evaluate(b => GG.byId.bonbons._findRuns(b).length, apresMagique) === 0);
  const faux = await p.evaluate(() => {
    const st = document.getElementById('mini-area')._bbCtx.state, bb = GG.byId.bonbons;
    const E = bb._ctxOf(st, st.players[0], null);
    for (let i = 0; i < 63; i++) if ((i & 7) < 7 && st.players[0].board[i] && st.players[0].board[i + 1] && !bb._swapKind(E, i, i + 1)) return [i, i + 1];
    return null;
  });
  const coupsMilieu = +(await p.textContent('#bb-coups'));
  await geste(p, faux[0], faux[1], true);
  await p.waitForTimeout(500);
  check('bug 1 : ensuite, un échange qui ne forme rien est refusé (aucun coup consommé)',
    coupsMilieu === coupsAvant - 1 && +(await p.textContent('#bb-coups')) === coupsMilieu, { coupsAvant, coupsMilieu });

  // ---- combinaisons : déflagrations et annonce de cascade ----
  await scenario(p, `bb.apply(st, 0, { t: 'start', lvl: 20 }); bb.apply(st, 0, { t: 'go' });
    const b = st.players[0].board; b[35] = b[35] || { t: 0, s: 0 }; b[35].s = 3; b[36].s = 3;`);
  await geste(p, 35, 36, false);
  const blasts = await (await p.waitForFunction(() => document.querySelectorAll('.bb-blast').length, null, { timeout: 15000, polling: 'raf' })).jsonValue();
  check('enveloppé + enveloppé : déflagration géante', blasts >= 1, blasts);
  await finAnimation(p);
  // une cascade annoncée en grand : on cherche (avec le hasard du jeu) un coup qui en déclenche une
  const trouve = await p.evaluate(() => {
    const bb = GG.byId.bonbons, st0 = document.getElementById('mini-area')._bbCtx.state;
    for (let graine = 1; graine < 3000; graine++) {
      const st = JSON.parse(JSON.stringify(st0)), q = st.players[0];
      const moves = bb._allMoves(bb._ctxOf(st, q, null));
      const mv = moves[graine % moves.length];
      bb._setRandom(bb._mulberry(graine));
      bb.apply(st, 0, { t: 'swap', a: mv[0], b: mv[1] });
      if (q.fx && q.fx.combo >= 3) { bb._setRandom(bb._mulberry(graine)); return mv; }
    }
    return null;
  });
  if (trouve) {
    await geste(p, trouve[0], trouve[1], false);
    // l'annonce ne reste qu'un instant : on la lit au moment où elle paraît
    const cri = await (await p.waitForFunction(() => { const c = document.querySelector('.bb-combo'); return c && c.textContent; }, null, { timeout: 15000, polling: 'raf' })).jsonValue();
    check('grande cascade : annoncée en grand (« ' + String(cri).replace(/cascade.*/, '').trim() + ' »)', !!cri);
    await finAnimation(p);
  } else check('grande cascade : annoncée en grand', false, 'aucune cascade trouvée');
  await p.evaluate(() => GG.byId.bonbons._setRandom(null));

  // ---- bug 2 à l'écran : plus aucun coup → mélange animé, spéciaux gardés ----
  const melange = await p.evaluate(() => {
    const bb = GG.byId.bonbons;
    // petit plateau (beaucoup de trous) et 6 couleurs : les grilles mortes y sont fréquentes
    for (let graine = 1; graine < 4000; graine++) {
      bb._setRandom(bb._mulberry(graine));
      const st = bb.create(['Moi']);
      bb.apply(st, 0, { t: 'start', lvl: 1 });
      bb.apply(st, 0, { t: 'go' });
      const q = st.players[0];
      st.types = 6;
      for (let i = 0; i < 64; i++) {
        const r = i >> 3, c = i & 7;
        if (r < 3 || c < 2 || c > 5) { st.holes[i] = 1; q.board[i] = null; }
      }
      const E = bb._ctxOf(st, q, null);
      const couleur = bb._mulberry(graine * 13 + 5); // scénario reproductible d'une exécution à l'autre
      for (let i = 0; i < 64; i++) if (q.board[i]) q.board[i] = { t: Math.floor(couleur() * 6), s: 0, id: 500 + i };
      if (bb._findRuns(q.board).length) continue;
      const moves = bb._allMoves(E);
      if (!moves.length) continue;
      // deux spéciaux posés loin du coup
      const sp = [];
      for (let i = 0; i < 64 && sp.length < 2; i++) if (q.board[i] && moves.every(m => Math.abs((m[0] >> 3) - (i >> 3)) + Math.abs((m[0] & 7) - (i & 7)) > 2)) { q.board[i].s = 1 + sp.length; sp.push(i); }
      if (sp.length < 2 || bb._allMoves(E).length !== moves.length) continue;
      const avant = JSON.parse(JSON.stringify(st));
      const mv = moves[0];
      bb._setRandom(bb._mulberry(graine * 7 + 1));
      bb.apply(st, 0, { t: 'swap', a: mv[0], b: mv[1] });
      // (le coup peut légitimement faire éclater un spécial dans sa cascade : on veut un
      // scénario où les deux spéciaux arrivent intacts jusqu'au mélange)
      const ids = sp.map(i => avant.players[0].board[i].id).sort().join(',');
      if (q.fx && q.fx.shuffled && q.board.filter(c => c && c.s).map(c => c.id).sort().join(',') === ids) {
        return { etat: avant, mv, graine: graine * 7 + 1 };
      }
    }
    return null;
  });
  if (melange) {
    await p.reload(); // (même précaution que scenario())
    await p.evaluate((m) => localStorage.setItem('gg-partie', JSON.stringify({ v: 2, type: 'mini', jeu: 'bonbons', bots: 0, state: m.etat, me: 0, ts: Date.now() })), melange);
    await p.reload();
    await p.click('#btn-reprise');
    await p.waitForSelector('.bb-board');
    await p.waitForTimeout(600);
    await p.evaluate((g) => GG.byId.bonbons._setRandom(GG.byId.bonbons._mulberry(g)), melange.graine);
    await geste(p, melange.mv[0], melange.mv[1], false);
    const banniere = await (await p.waitForFunction(() => { const c = document.querySelector('.bb-banniere.melange'); return c && c.textContent; }, null, { timeout: 15000, polling: 'raf' })).jsonValue();
    check('bug 2 : plus de coup → message « on mélange » et animation', /mélange/.test(banniere), banniere);
    await finAnimation(p);
    const b2 = await plateauAffiche(p);
    const st2 = await etatJeu(p);
    const spApres = b2.filter(c => c && c.s).map(c => c.s).sort().join(',');
    check('bug 2 : après le mélange, les bonbons spéciaux sont toujours là et un coup existe',
      spApres === '1,2' && await p.evaluate((st) => GG.byId.bonbons._hasMoveE(GG.byId.bonbons._ctxOf(st, st.players[0], null)), st2), spApres);
    await p.evaluate(() => GG.byId.bonbons._setRandom(null));
  } else check('bug 2 : scénario de grille morte trouvé', false);

  // ---- bug 3 à l'écran : des objectifs variés, des mondes qui ne bouclent pas ----
  await p.evaluate(() => localStorage.setItem('gg-bonbons-map', JSON.stringify({ lvl: 75, stars: { 1: 3, 2: 2 }, best: {} })));
  await p.reload();
  await p.click('.game-tile[data-g="bonbons"]');
  await p.waitForSelector('.bb-map');
  const mondes = await p.evaluate(() => [...document.querySelectorAll('.bb-monde-tx b')].map(x => x.textContent));
  check('carte : au-delà du niveau 60, des mondes nouveaux (' + mondes.join(', ') + ')',
    mondes.length >= 3 && new Set(mondes).size === mondes.length && !mondes.includes('Prairie Guimauve'));
  const icones = {};
  for (const lvl of [3, 11, 21, 25, 26]) {
    await scenario(p, `bb.apply(st, 0, { t: 'start', lvl: ${lvl} });`);
    icones[lvl] = await p.evaluate(() => [...document.querySelectorAll('.bb-intro .bb-carte-obj i')].map(i => i.className).join(' '));
  }
  check('objectifs variés à l’écran : gelée, meringues, noisettes, récolte, points',
    /bbs-j1/.test(icones[3]) && /bbs-m1/.test(icones[11]) && /bbs-n/.test(icones[21]) && /bbs-\d-0/.test(icones[25]) && /etoile/.test(icones[26]), icones);

  // ---- fluidité au processeur ×4 (deux coups mesurés, on garde le meilleur : la machine de test est partagée) ----
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Performance.enable');
  const mesures = [];
  for (let essai = 0; essai < 2; essai++) {
    await scenario(p, `bb.apply(st, 0, { t: 'start', lvl: 1 }); bb.apply(st, 0, { t: 'go' });`);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const m0 = (await cdp.send('Performance.getMetrics')).metrics;
    const perf = await p.evaluate(() => new Promise(res => {
      const V = document.getElementById('mini-area')._bb, st = V.ctx.state;
      const mv = GG.byId.bonbons._meilleurCoup(st, st.players[0]);
      const ts = []; let d = 0, t0 = 0;
      function b(t) { ts.push(t - d); d = t; if (V.busy) requestAnimationFrame(b); else res({ ts, duree: t - t0 }); }
      requestAnimationFrame(t => { d = t0 = t; V.ctx.act({ t: 'swap', a: mv[0], b: mv[1] }); requestAnimationFrame(b); });
    }));
    const m1 = (await cdp.send('Performance.getMetrics')).metrics;
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const met = k => ((m1.find(x => x.name === k) || {}).value || 0) - ((m0.find(x => x.name === k) || {}).value || 0);
    const code = (met('ScriptDuration') + met('RecalcStyleDuration') + met('LayoutDuration')) * 1000;
    const n = perf.ts.length, moy = perf.ts.reduce((a, b) => a + b, 0) / n;
    mesures.push({ n, duree: Math.round(perf.duree), moy, parImage: code / n });
  }
  mesures.sort((a, b) => a.parImage - b.parImage);
  const mb = mesures[0];
  console.log('       coup animé au processeur ×4 : ' + mb.n + ' images en ' + mb.duree + ' ms, ' + mb.moy.toFixed(1) +
    ' ms/image (' + Math.round(1000 / mb.moy) + ' i/s sur cette machine sans GPU) ; script + styles + mise en page : ' +
    mb.parImage.toFixed(1) + ' ms par image');
  check('processeur ×4 : le travail de la page par image tient dans 16 ms (60 i/s possibles)', mb.parImage < 16, mb.parImage.toFixed(1));
  await ctx.close();

  // ---- 360 × 640 ----
  const pt = await nouvellePage(browser, 360, 640);
  await pt.p.evaluate(() => localStorage.setItem('gg-bonbons-map', JSON.stringify({ lvl: 41, stars: {}, best: {} })));
  await pt.p.reload();
  await pt.p.click('.game-tile[data-g="bonbons"]');
  await pt.p.waitForSelector('.bb-map');
  check('360 px : carte sans débordement', await debord(pt.p) <= 0);
  await pt.p.click('.bb-map-bas .btn');
  await pt.p.waitForSelector('.bb-intro');
  check('360 px : début de niveau sans débordement', await debord(pt.p) <= 0);
  await pt.p.click('.bb-intro [data-a="go"]');
  await pt.p.waitForSelector('.bb-intro', { state: 'detached' });
  const bas = await pt.p.evaluate(() => document.querySelector('.bb-board').getBoundingClientRect().bottom);
  check('360×640 : tout le plateau est visible sans défiler', bas <= 640, bas);
  check('360 px : jeu sans débordement', await debord(pt.p) <= 0);
  const cell = await pt.p.evaluate(() => document.querySelector('.bb-cell').getBoundingClientRect().width);
  check('360 px : bonbons de 40 px au moins (cible tactile)', cell >= 40, cell);
  await pt.ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  if (QUOI === 'tout' || QUOI === 'sudoku') await testSudoku(browser);
  if (QUOI === 'tout' || QUOI === 'bonbons') await testBonbons(browser);
  await browser.close();
  console.log(failures ? '\n' + failures + ' ÉCHEC(S)' : '\nTests V2 solo (navigateur) OK.');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
