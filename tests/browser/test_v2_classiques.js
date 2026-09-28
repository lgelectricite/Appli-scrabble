/*
 * V2 des cinq classiques, dans un vrai navigateur : parties réelles en solo
 * et à deux sur un seul téléphone, un contrôle par bug de l’audit, aucune
 * erreur JavaScript, aucun débordement horizontal à 412 et 360 px, présence
 * des animations clés, et temps de réflexion de l’IA au processeur ×4.
 *
 * Usage : GG_URL=http://localhost:8705/index.html node tests/browser/test_v2_classiques.js [jeu]
 *   (jeu : p4, morpion, bataille, yams, cochon — tous par défaut)
 * Captures (facultatives) : GG_CAPTURES=/un/dossier
 */
const { chromium } = require('playwright');
const URL = process.env.GG_URL || 'http://localhost:8642/index.html';
const CAPT = process.env.GG_CAPTURES || '';
const SEUL = process.argv[2] || null;
let failures = 0;
function check(n, c, e) {
  if (c) console.log('  OK  ' + n);
  else { failures++; console.log('  FAIL ' + n + (e !== undefined ? ' -> ' + JSON.stringify(e) : '')); }
}
function mesure(n, v) { console.log('  MESURE ' + n + ' : ' + v); }
function joue(nom) { return !SEUL || SEUL === nom; }
const attendre = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox']
  });
  let erreurs = [];
  async function nouvelle(w, h) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: false });
    const p = await ctx.newPage();
    p.on('pageerror', e => { erreurs.push(e.message); console.log('  FAIL JS : ' + e.message); failures++; });
    await p.goto(URL);
    await p.waitForSelector('#catalog .game-tile');
    p._ctx = ctx;
    return p;
  }
  async function capture(p, nom) {
    if (CAPT) await p.screenshot({ path: CAPT + '/' + nom + '.png' });
  }
  async function sansDebord(p, quoi) {
    const d = await p.evaluate(() => {
      const W = document.documentElement.clientWidth;
      let pire = null;
      document.querySelectorAll('#mini-area *').forEach(e => {
        const r = e.getBoundingClientRect();
        if (r.width && (r.right > W + 1 || r.left < -1)) {
          if (!pire || r.right > pire.r) pire = { r: Math.round(r.right), cls: e.className && e.className.baseVal !== undefined ? e.className.baseVal : e.className };
        }
      });
      return { sw: document.documentElement.scrollWidth, W, pire };
    });
    check(quoi + ' : aucun débordement horizontal (' + d.W + ' px)', d.sw <= d.W && !d.pire, d);
  }
  async function lanceSolo(p, jeu, niveau, bots) {
    await p.click('.game-tile[data-g="' + jeu + '"]');
    await p.click('#btn-mini-solo');
    if (bots) await p.click('#msolo-bots .count-btn[data-n="' + bots + '"]');
    if (niveau) await p.click('#msolo-niveau .count-btn[data-niveau="' + niveau + '"]');
    await p.click('#btn-msolo-start');
    await p.waitForSelector('#screen-mini.active');
  }
  async function lanceLocal(p, jeu, noms) {
    await p.click('.game-tile[data-g="' + jeu + '"]');
    await p.click('#btn-mini-hotseat');
    if (noms.length > 2) await p.click('#mini-count .count-btn:nth-child(' + (noms.length - (jeu === 'yams' ? 0 : 1)) + ')');
    for (let i = 0; i < noms.length; i++) await p.fill('#mini-name-' + (i + 1), noms[i]);
    await p.click('#btn-mini-start');
    await p.waitForSelector('#screen-mini.active');
  }
  async function quitte(p) {
    await p.click('#btn-mini-menu');
    await p.click('#btn-menu-quit');
    await p.click('#btn-confirm-yes');
    await p.waitForSelector('#screen-home.active');
  }
  async function passe(p) {
    // écran « passez le téléphone » (jeux à informations cachées)
    if (await p.locator('#overlay-pass:not(.hidden)').count()) await p.click('#btn-pass-ready');
  }

  /* ======================= PUISSANCE 4 ======================= */
  if (joue('p4')) {
    for (const [w, h] of [[412, 780], [360, 640]]) {
      console.log('--- Puissance 4 à deux sur un téléphone (' + w + '×' + h + ') ---');
      const p = await nouvelle(w, h);
      await lanceLocal(p, 'p4', ['Léa', 'Marc']);
      check('plateau objet : façade percée de 42 trous', await p.locator('.p4-front path').count() >= 1 &&
        await p.locator('.p4-cell').count() === 42);
      check('choix de la série 1 / 3 / 5 avant le 1er jeton', await p.locator('[data-serie]').count() === 3);
      await p.click('[data-serie="1"]');
      // BUG 4 : un appui sur la colonne VOISINE 100 ms après jouait le coup de l’adversaire
      await p.locator('.p4-cell[data-col="3"]').first().click();
      await attendre(100);
      await p.locator('.p4-cell[data-col="4"]').first().click();
      const n1 = await p.locator('.p4-disc:not(.mini)').count();
      check('BUG 4 corrigé : appui sur la colonne voisine 100 ms après ignoré (1 seul jeton)', n1 === 1, n1);
      check('le jeton qui vient d’être joué tombe (animation « drop »)', await p.locator('.p4-disc.drop').count() === 1);
      check('repère du dernier coup', await p.locator('.p4-disc.last').count() === 1);
      await p.waitForSelector('.p4-board[data-pret="1"]');
      await p.locator('.p4-cell[data-col="4"]').first().click();
      check('une fois le plateau prêt, Marc joue normalement', await p.locator('.p4-disc:not(.mini)').count() === 2);
      // aperçu de la colonne visée
      const b = await p.locator('.p4-cell[data-col="2"]').first().boundingBox();
      await p.waitForSelector('.p4-board[data-pret="1"]');
      await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      check('aperçu : jeton fantôme au-dessus de la colonne visée', await p.locator('.p4-fant.on').count() === 1);
      check('aperçu : colonne éclairée et case d’arrivée marquée',
        await p.locator('.p4-colhl.on').count() === 1 && await p.locator('.p4-cell.cible').count() === 1);
      await capture(p, 'p4_' + w + '_jeu');
      await sansDebord(p, 'P4 en cours');
      // Léa aligne 4 en colonne 3 (Marc joue en 4)
      for (const c of [3, 4, 3, 4, 3]) {
        await p.waitForSelector('.p4-board[data-pret="1"]');
        await p.locator('.p4-cell[data-col="' + c + '"]').first().click();
      }
      await p.waitForSelector('.p4-v2.trace', { timeout: 4000 });
      check('alignement gagnant : 4 jetons brillent', await p.locator('.p4-disc.win').count() === 4);
      check('alignement gagnant : la ligne est tracée', await p.locator('.p4-ligne line').count() === 1);
      check('confettis de manche', await p.evaluate(() => !!document.querySelector('canvas[data-gg-fx]')));
      check('série en 1 : « Voir le résultat »', await p.locator('[data-a="fin"]').count() === 1);
      await capture(p, 'p4_' + w + '_gagne');
      await sansDebord(p, 'P4 fin de manche');
      await p.waitForSelector('#overlay-end:not(.hidden)', { timeout: 6000 });
      check('fin de partie célébrée par la coque (série gagnée)', /Léa/.test(await p.textContent('#end-detail')));
      await p._ctx.close();
    }
    {
      console.log('--- Puissance 4 contre l’IA difficile (processeur ×4) ---');
      const p = await nouvelle(412, 780);
      const cdp = await p._ctx.newCDPSession(p);
      await lanceSolo(p, 'p4', 'difficile');
      check('solo : « Série en 1 / 3 / 5 » proposé aussi', await p.locator('[data-serie]').count() === 3);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      // temps de réflexion mesuré dans la page, sur des milieux de partie
      const t = await p.evaluate(() => {
        const m = GG.byId.p4, res = [];
        const parties = [[3, 3, 2, 4, 4, 2, 5, 1], [3, 2, 3, 3, 4, 4, 2, 2, 1, 5], [3, 3, 3, 3, 2, 4, 2, 4, 5, 1, 1, 5]];
        parties.forEach(cols => {
          const s = m.create(['a', 'b']);
          cols.forEach(c => m.apply(s, s.current, { t: 'drop', col: c }));
          m._razTable();
          const t0 = performance.now();
          m.bot(s, s.current, { niveau: 'difficile' });
          res.push(performance.now() - t0);
        });
        return res;
      });
      mesure('P4 difficile au processeur ×4', t.map(x => Math.round(x) + ' ms').join(', '));
      check('P4 difficile : < 400 ms au processeur ×4', Math.max.apply(null, t) < 400, t);
      // une vraie partie : on joue au centre tant que possible
      let tours = 0;
      while (tours++ < 40) {
        if (await p.locator('[data-a="again"], [data-a="fin"]').count()) break;
        const mien = await p.evaluate(() => /À vous/.test((document.querySelector('.p4-msg') || {}).textContent || ''));
        if (!mien) { await attendre(250); continue; }
        await p.waitForSelector('.p4-board[data-pret="1"]');
        const col = await p.evaluate(() => [3, 2, 4, 1, 5, 0, 6].find(c =>
          !document.querySelector('.p4-cell[data-col="' + c + '"][data-row="0"] .p4-disc')));
        await p.locator('.p4-cell[data-col="' + col + '"]').first().click();
        await attendre(300);
      }
      check('partie solo jouée jusqu’au bout de la manche', await p.locator('[data-a="again"], [data-a="fin"]').count() === 1);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      await capture(p, 'p4_solo_fin');
      await sansDebord(p, 'P4 solo');
      await quitte(p);
      await p._ctx.close();
    }
  }

  await browser.close();
  console.log(failures ? '\n' + failures + ' ÉCHEC(S)' : '\nTests V2 des classiques (navigateur) OK.');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
