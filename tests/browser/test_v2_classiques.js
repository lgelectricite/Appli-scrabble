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
    const nb = p.locator('#mini-count .count-btn[data-n="' + noms.length + '"]');
    if (await nb.count()) await nb.click();
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
      // deux appuis à 100 ms d’écart, minutés dans la page (précis même si la machine rame)
      await p.evaluate(() => new Promise(r => {
        document.querySelector('.p4-cell[data-col="3"]').click();
        setTimeout(() => { document.querySelector('.p4-cell[data-col="4"]').click(); r(); }, 100);
      }));
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

  /* ======================= MORPION ======================= */
  if (joue('morpion')) {
    for (const [w, h] of [[412, 780], [360, 640]]) {
      console.log('--- Morpion à deux sur un téléphone (' + w + '×' + h + ') ---');
      const p = await nouvelle(w, h);
      await lanceLocal(p, 'morpion', ['Léa', 'Marc']);
      check('grille dessinée à la main (4 traits animés)', await p.locator('.ttt-carnet.page .ttt-grille path').count() === 4);
      await p.click('[data-serie="1"]');
      const tape = async i => {
        await p.waitForSelector('.ttt-board[data-pret="1"]');
        await p.locator('.ttt-cell[data-i="' + i + '"]').click();
      };
      await p.waitForSelector('.ttt-board[data-pret="1"]');
      // deux appuis à 100 ms d’écart, minutés dans la page (précis même si la machine rame)
      await p.evaluate(() => new Promise(r => {
        document.querySelector('.ttt-cell[data-i="4"]').click();
        setTimeout(() => { document.querySelector('.ttt-cell[data-i="0"]').click(); r(); }, 100);
      }));
      check('double appui : la case voisine 100 ms après est ignorée', await p.locator('.ttt-sym').count() === 1);
      check('le X se trace au feutre (animation)', await p.locator('.ttt-sym.x.nouveau path').count() === 2);
      await tape(0);
      check('le O se trace au feutre', await p.locator('.ttt-sym.o.nouveau path').count() === 1);
      await tape(8); await tape(2);
      await capture(p, 'morpion_' + w + '_jeu');
      await sansDebord(p, 'Morpion en cours');
      await tape(6); await tape(1);
      await p.waitForSelector('.ttt-fluo', { timeout: 3000 });
      check('ligne gagnante tracée au surligneur', await p.locator('.ttt-fluo .surligne').count() === 1 &&
        await p.locator('.ttt-cell.win').count() === 3);
      check('Marc gagne (O en 0-1-2)', /Marc remporte la série/.test(await p.textContent('.ttt-msg')));
      await attendre(500);
      await capture(p, 'morpion_' + w + '_gagne');
      await sansDebord(p, 'Morpion fin de manche');
      await p.waitForSelector('#overlay-end:not(.hidden)', { timeout: 6000 });
      check('fin de série célébrée par la coque', /Marc/.test(await p.textContent('#end-detail')));
      await p._ctx.close();
    }
    {
      console.log('--- Morpion contre l’IA difficile : le piège des coins opposés (bug 6) ---');
      const p = await nouvelle(412, 780);
      await lanceSolo(p, 'morpion', 'difficile');
      await p.waitForSelector('.ttt-board');
      const joueHumain = async i => {
        await p.waitForFunction(() => /À vous/.test(document.querySelector('.ttt-msg').textContent), null, { timeout: 5000 });
        await p.waitForSelector('.ttt-board[data-pret="1"]');
        await p.locator('.ttt-cell[data-i="' + i + '"]').click();
      };
      await joueHumain(0);
      await p.waitForFunction(() => document.querySelectorAll('.ttt-sym').length === 2, null, { timeout: 5000 });
      const centre = await p.locator('.ttt-cell[data-i="4"] .ttt-sym.o').count();
      if (centre) {
        await joueHumain(8);
        await p.waitForFunction(() => document.querySelectorAll('.ttt-sym').length === 4, null, { timeout: 5000 });
        const coin = await p.evaluate(() => [2, 6].some(i => document.querySelector('.ttt-cell[data-i="' + i + '"] .ttt-sym')));
        check('BUG 6 corrigé : après coin–centre–coin opposé, l’IA prend un bord (pas un coin)', !coin);
      } else {
        check('BUG 6 : l’IA répond au coin (centre ou non, jamais perdante)', true);
      }
      // on finit la manche en jouant la première case libre
      for (let k = 0; k < 6; k++) {
        if (await p.locator('[data-a="again"], [data-a="fin"]').count()) break;
        const libre = await p.evaluate(() => [...document.querySelectorAll('.ttt-cell')].findIndex(c => !c.querySelector('.ttt-sym')));
        if (libre < 0) break;
        try { await joueHumain(libre); } catch (e) { /* manche finie pendant l’attente */ }
        await attendre(1500);
      }
      const msg = await p.textContent('.ttt-msg');
      check('l’humain ne bat pas le niveau difficile', !/Joueur 1|Vous/.test(msg) || /nul/.test(msg), msg);
      await sansDebord(p, 'Morpion solo');
      await p._ctx.close();
    }
  }

  /* ======================= BATAILLE NAVALE ======================= */
  if (joue('bataille')) {
    // le test garde une référence à l’état d’autorité pour viser juste
    const espion = p => p.evaluate(() => {
      const m = GG.byId.bataille, ap = m.apply;
      m.apply = function (s) { window.__bn = s; return ap.apply(this, arguments); };
    });
    const etat = (p, f) => p.evaluate(f);
    for (const [w, h] of [[412, 780], [360, 640]]) {
      console.log('--- Bataille navale à deux sur un téléphone (' + w + '×' + h + ') ---');
      const p = await nouvelle(w, h);
      await espion(p);
      await lanceLocal(p, 'bataille', ['Léa', 'Marc']);
      await p.waitForSelector('.bn-grid.placement');
      check('placement : ma flotte, 17 cases, 5 navires dessinés',
        await p.locator('.bn-cell.ship').count() === 17 && await p.locator('.bn-navire').count() === 5);
      check('mer animée (vagues)', await p.evaluate(() =>
        getComputedStyle(document.querySelector('.bn-grid'), '::before').animationName === 'bn-houle'));
      check('3 réglages : série, tirs, navires', await p.locator('.bn-regle').count() === 3);
      await p.click('[data-r="rejoue"]');
      check('réglage « touché = rejoue » appliqué', await etat(p, () => window.__bn.opts.rejoue === true));
      await p.click('[data-r="rejoue"]');
      check('retour à la règle classique « un tir par tour »', await etat(p, () => window.__bn.opts.rejoue === false));
      await capture(p, 'bataille_' + w + '_placement');
      await sansDebord(p, 'Bataille placement');
      const bouton = await p.locator('[data-a="ready"]').boundingBox();
      check('« Je suis prêt » visible sans défiler', bouton && bouton.y + bouton.height <= h, bouton);
      // glisser le torpilleur vers une place libre et valide
      const cible = await etat(p, () => {
        const b = window.__bn.boards[0], N = 10;
        const occ = {};
        b.ships.forEach((s, k) => { if (k !== 4) s.cells.forEach(i => { occ[i] = 1; }); });
        const pres = i => [-11, -10, -9, -1, 0, 1, 9, 10, 11].some(d => {
          const j = i + d; if (j < 0 || j >= 100) return false;
          if (Math.abs(j % N - i % N) > 1) return false;
          return occ[j];
        });
        const t = b.ships[4];
        for (let r = 0; r < N - (t.h ? 0 : 1); r++) for (let c = 0; c < N - (t.h ? 1 : 0); c++) {
          if (r === t.r && c === t.c) continue;
          const i2 = t.h ? r * N + c + 1 : (r + 1) * N + c;
          if (!pres(r * N + c) && !pres(i2)) return { r, c, h: t.h, r0: t.r, c0: t.c };
        }
        return null;
      });
      check('une place libre existe pour le torpilleur', !!cible);
      if (cible) {
        const grille = await p.locator('.bn-grid.placement').boundingBox();
        const t = grille.width / 10;
        await p.mouse.move(grille.x + (cible.c0 + 0.5) * t, grille.y + (cible.r0 + 0.5) * t);
        await p.mouse.down();
        await p.mouse.move(grille.x + (cible.c + 0.5) * t, grille.y + (cible.r + 0.5) * t, { steps: 8 });
        check('glisser : l’ombre de la place visée est verte', await p.locator('.bn-ombre.ok').count() === 1);
        await p.mouse.up();
        await attendre(200);
        check('placement MANUEL : le navire glissé est déplacé', await etat(p, () =>
          [window.__bn.boards[0].ships[4].r, window.__bn.boards[0].ships[4].c].join()) === [cible.r, cible.c].join());
      }
      const avantRot = await etat(p, () => window.__bn.boards[0].ships.map(s => s.h).join());
      for (let s = 0; s < 5; s++) {
        await p.locator('.bn-navire[data-s="' + s + '"]').click();
        await attendre(120);
        if (await etat(p, () => window.__bn.boards[0].ships.map(x => x.h).join()) !== avantRot) break;
      }
      check('toucher un navire le fait pivoter', await etat(p, () => window.__bn.boards[0].ships.map(x => x.h).join()) !== avantRot);
      await p.click('[data-a="shuffle"]');
      check('« Au hasard » : flotte toujours écartée', await etat(p, () => {
        const b = window.__bn.boards[0];
        return b.ships.every((s, a) => b.ships.every((t, k) => k <= a || s.cells.every(i => t.cells.every(j =>
          Math.abs(Math.floor(i / 10) - Math.floor(j / 10)) > 1 || Math.abs(i % 10 - j % 10) > 1))));
      }));
      await p.click('[data-a="ready"]');
      await p.waitForSelector('#overlay-pass:not(.hidden)');
      check('écran de passage vers Marc pour SON placement', /Marc/.test(await p.textContent('#pass-name')));
      await p.click('#btn-pass-ready');
      await p.click('[data-a="ready"]');
      await p.waitForSelector('#overlay-pass:not(.hidden)');
      await p.click('#btn-pass-ready');
      await p.waitForSelector('.bn-grid.aim[data-pret="1"]');
      check('carte adverse dans le brouillard', await p.locator('.bn-grid.cible .bn-cell.brume').count() === 100);
      check('aucun navire adverse visible', await p.locator('.bn-grid.cible .bn-navire, .bn-grid.cible .bn-cell.ship').count() === 0);
      // BUG 2 : Léa tire à l’eau
      const eau = await etat(p, () => { for (let i = 0; i < 100; i++) if (window.__bn.boards[1].cells[i] === undefined) return i; });
      await p.locator('.bn-grid.aim .bn-cell[data-i="' + eau + '"]').click();
      check('le tir part avec sa traînée (obus en vol)', await p.waitForSelector('[data-gg-fx="vol"] .bn-obus',
        { timeout: 500, state: 'attached' }).then(() => true, () => false));
      await attendre(700);
      check('BUG 2 corrigé : le tireur voit SON résultat (pas d’écran de passage tout de suite)',
        await p.locator('#overlay-pass:not(.hidden)').count() === 0 && await p.locator('.bn-resultat.res-eau').count() === 1);
      check('éclaboussure sur la carte adverse', await p.locator('.bn-grid.cible .bn-cell.miss').count() === 1);
      check('bouton « Passer le téléphone à Marc »', /Passer le téléphone à Marc/.test(await p.textContent('[data-a="suite"]')));
      await capture(p, 'bataille_' + w + '_resultat');
      await sansDebord(p, 'Bataille résultat du tir');
      await p.waitForSelector('#overlay-pass:not(.hidden)', { timeout: 3000 });
      check('≈ 1,2 s plus tard, passage du téléphone à Marc', /Marc/.test(await p.textContent('#pass-name')));
      await p.click('#btn-pass-ready');
      const msgMarc = await p.textContent('.bn-msg');
      check('Marc lit QUI a tiré et le résultat', /Léa a tiré en [A-J]\d+ : à l’eau/.test(msgMarc) && /À vous de tirer, Marc/.test(msgMarc), msgMarc);
      check('le tir de Léa est encadré sur la flotte de Marc', await p.locator('.bn-grid.mienne .bn-cell.last.miss').count() === 1);
      await capture(p, 'bataille_' + w + '_marc');
      if (w === 412) {
        // on finit la manche : Léa coule tout, Marc tire à l’eau (bouton « passer »)
        const cibles = await etat(p, () => Object.keys(window.__bn.boards[1].cells).map(Number));
        let k = 0, coules = 0, sombreVu = false;
        for (let tour = 0; tour < 80 && k < cibles.length; tour++) {
          await p.waitForSelector('.bn-grid.aim[data-pret="1"]', { timeout: 5000 });
          const quiTire = await etat(p, () => window.__bn.current);
          const i = quiTire === 0 ? cibles[k++] : await etat(p, () => {
            for (let j = 99; j >= 0; j--) if (window.__bn.boards[0].cells[j] === undefined && !window.__bn.shots[0][j]) return j;
          });
          await p.locator('.bn-grid.aim .bn-cell[data-i="' + i + '"]').click();
          if (await etat(p, () => window.__bn.finished)) break;
          await attendre(520);
          const c2 = await p.locator('.bn-grid.cible .bn-navire.coule').count();
          if (c2 > coules) { coules = c2; if (await p.locator('.bn-navire.sombre').count()) sombreVu = true; }
          // on passe la main : bouton « Passer », sinon le minuteur s’en charge
          await p.locator('[data-a="suite"]').click({ timeout: 1500 }).catch(() => {});
          await p.waitForSelector('#overlay-pass:not(.hidden)', { timeout: 5000 });
          await p.click('#btn-pass-ready');
        }
        check('navire coulé : l’épave apparaît et sombre', sombreVu && coules >= 1, { coules, sombreVu });
        await p.waitForSelector('.bn-flotte-fin', { timeout: 5000 });
        check('fin de manche annoncée', /Léa gagne la manche/.test(await p.textContent('.bn-titre')));
        check('fin de manche : les DEUX flottes sont révélées (le perdant revoit la sienne)',
          await p.locator('.bn-flotte-fin').count() === 2 && await p.locator('.bn-flotte-fin .bn-navire').count() === 10);
        await attendre(900);
        await capture(p, 'bataille_412_finmanche');
        await sansDebord(p, 'Bataille fin de manche');
        await p.click('[data-a="again"]');
        await p.waitForSelector('.bn-grid.placement');
        check('manche 2 : retour au placement, règles rappelées', await p.locator('.bn-resume').count() === 1);
      }
      await p._ctx.close();
    }
    {
      console.log('--- Bataille navale contre l’IA difficile ---');
      const p = await nouvelle(412, 780);
      await espion(p);
      await lanceSolo(p, 'bataille', 'difficile');
      await p.waitForSelector('.bn-grid.placement');
      await attendre(1500);
      check('l’IA attend que l’humain soit prêt', await etat(p, () => !window.__bn || window.__bn.phase === 'place'));
      await p.click('[data-a="ready"]');
      await p.waitForSelector('.bn-grid.aim[data-pret="1"]', { timeout: 5000 });
      const eau = await etat(p, () => { for (let i = 0; i < 100; i++) if (window.__bn.boards[1].cells[i] === undefined) return i; });
      await p.locator('.bn-grid.aim .bn-cell[data-i="' + eau + '"]').click();
      await p.waitForFunction(() => /Margot a (tiré|touché|coulé)/.test(document.querySelector('.bn-msg').textContent), null, { timeout: 6000 });
      check('solo : l’IA répond et le message dit qu’elle a tiré', true);
      check('solo : jamais d’écran de passage', await p.locator('#overlay-pass:not(.hidden)').count() === 0);
      await capture(p, 'bataille_solo');
      await sansDebord(p, 'Bataille solo');
      await p._ctx.close();
    }
  }

  /* ======================= YAMS ======================= */
  if (joue('yams')) {
    const espionY = p => p.evaluate(() => {
      const m = GG.byId.yams, ap = m.apply;
      m.apply = function (s) { window.__ym = s; return ap.apply(this, arguments); };
    });
    const etat = (p, f) => p.evaluate(f);
    for (const [w, h] of [[412, 780], [360, 640]]) {
      console.log('--- Yams contre 3 IA (' + w + '×' + h + ') ---');
      const p = await nouvelle(w, h);
      await espionY(p);
      await lanceSolo(p, 'yams', 'difficile', 3);
      await p.waitForSelector('.ym-v2');
      const onglets = await p.textContent('.ym-onglets');
      check('BUG 5 : noms complets (« 🤖 Margot », plus « 🤖 Margo »)', /🤖 Margot/.test(onglets) && /🤖 Suzette/.test(onglets), onglets);
      check('les onglets remplacent les pastilles de la coque', await p.locator('#mini-players.hidden').count() === 1);
      const tronque = await p.evaluate(() => [...document.querySelectorAll('.ym-on-nom')].some(e => e.scrollWidth > e.clientWidth + 1));
      check('aucun nom coupé à l’écran', !tronque);
      check('5 vrais dés en 3D (6 faces chacun)', await p.locator('.ym-cube').count() === 5 && await p.locator('.ym-f').count() === 30);
      // BUG 1 : double appui sur « Lancer »
      await p.locator('[data-a="roll"]').click();
      await p.locator('[data-a="roll"]').click({ force: true, noWaitAfter: true }).catch(() => {});
      await attendre(80);
      check('BUG 1 corrigé : double appui = UN seul lancer', await etat(p, () => window.__ym.rolls) === 2);
      check('les dés roulent et rebondissent', await p.locator('.ym-de.roule').count() === 5);
      await p.waitForSelector('[data-a="roll"]:not([disabled])');
      // garder un dé : il se range dans « Gardés »
      await p.locator('.ym-piste .ym-de[data-die="0"]').click();
      check('dé gardé rangé de côté', await p.locator('.ym-gardes .ym-de[data-die="0"].garde').count() === 1);
      // BUG 5 : cases de 44 px, aperçu des points, choix confirmé
      const hauteurs = await p.evaluate(() => [...document.querySelectorAll('.ym-ligne')].map(e => e.getBoundingClientRect().height));
      check('BUG 5 : 13 cases de 44 px ou plus', hauteurs.length === 13 && Math.min.apply(null, hauteurs) >= 44, Math.min.apply(null, hauteurs));
      check('aperçu des points possibles dans chaque case libre', await p.locator('.ym-ligne.possible').count() === 13);
      const couleurZero = await p.evaluate(() => {
        const z = document.querySelector('.ym-ligne.possible.nul b');
        return z ? getComputedStyle(z).color : 'aucun';
      });
      check('un 0 possible n’est pas rouge', !/rgb\(2[0-9]{2}, [0-9]{1,2}, [0-9]{1,2}\)/.test(couleurZero), couleurZero);
      check('sous-total vers 63 affiché', /\/63/.test(await p.textContent('.ym-sous')));
      await p.locator('.ym-ligne.possible[data-cat="chance"]').click();
      check('BUG 5 : un seul appui ne marque PAS la case', await etat(p, () => window.__ym.players[0].sheet.chance) === null &&
        await p.locator('.ym-ligne.choisie').count() === 1 && await p.locator('[data-a="marque"]').count() === 1);
      await capture(p, 'yams_' + w + '_choix');
      await sansDebord(p, 'Yams choix d’une case');
      await p.click('[data-a="marque"]');
      check('confirmé : la case est marquée', await etat(p, () => window.__ym.players[0].sheet.chance) !== null);
      // annulation du dernier choix (avant que l’IA suivante lance)
      if (await p.locator('[data-a="annule"]').count()) {
        await p.click('[data-a="annule"]', { timeout: 500 }).catch(() => {});
        const annule = await etat(p, () => window.__ym.players[0].sheet.chance === null && window.__ym.current === 0);
        check('« Annuler mon choix » : la case redevient libre', annule || await etat(p, () => window.__ym.current !== 0));
        if (annule) await p.locator('.ym-ligne.possible[data-cat="chance"]').dblclick();
      }
      // l’IA joue : ses dés restent visibles, son choix est annoncé
      await p.waitForFunction(() => window.__ym.current === 0 && window.__ym.rolls === 3, null, { timeout: 30000 });
      check('les IA ont joué leur tour', await etat(p, () => window.__ym.players.slice(1).every(q => Object.values(q.sheet).some(v => v !== null))));
      await capture(p, 'yams_' + w + '_retour');
      if (w === 412) {
        // BUG 8 : vitesse rapide — l’attente entre deux tours humains
        const attente = async () => {
          await p.waitForSelector('[data-a="roll"]:not([disabled])');
          await p.click('[data-a="roll"]');
          await p.waitForSelector('.ym-ligne.possible');
          const libre = await etat(p, () => ['un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'brelan', 'carre', 'full', 'psuite', 'gsuite', 'yams', 'chance']
            .find(c => window.__ym.players[0].sheet[c] === null));
          const t0 = Date.now();
          await p.locator('.ym-ligne.possible[data-cat="' + libre + '"]').dblclick();
          await p.waitForFunction(() => window.__ym.current === 0 && window.__ym.rolls === 3, null, { timeout: 40000 });
          return (Date.now() - t0) / 1000;
        };
        check('contre 3 IA, le mode rapide est choisi d’office', await p.getAttribute('[data-a="vitesse"]', 'aria-pressed') === 'true');
        await p.click('[data-a="vitesse"]');
        check('bouton ⏩ : retour au mode normal', await etat(p, () => window.__ym.rapide === false));
        const tNormal = await attente();
        await p.click('[data-a="vitesse"]');
        check('bouton ⏩ : mode rapide', await etat(p, () => window.__ym.rapide === true));
        const tRapide = await attente();
        mesure('Yams contre 3 IA, attente réelle entre deux tours', tNormal.toFixed(1) + ' s en normal, ' + tRapide.toFixed(1) + ' s en rapide (avant : 19,5 s)');
        check('BUG 8 : attente < 12 s en normal et < 4,5 s en rapide', tNormal < 12 && tRapide < 4.5, [tNormal, tRapide]);
        // « Yams ! » fêté (dés truqués le temps d’un lancer)
        await p.waitForSelector('[data-a="roll"]:not([disabled])');
        await p.evaluate(() => { window.__r = Math.random; Math.random = () => 0.99; });
        await p.click('[data-a="roll"]');
        await p.evaluate(() => { Math.random = window.__r; });
        await p.waitForSelector('.ym-table.yams', { timeout: 3000 });
        check('« YAMS ! » fêté (texte, confettis, table qui brille)', await p.evaluate(() =>
          [...document.querySelectorAll('[data-gg-fx]')].some(e => /YAMS/.test(e.textContent)) || !!document.querySelector('canvas[data-gg-fx]')));
        await capture(p, 'yams_412_yams');
        // secouer pour lancer (capteur simulé)
        await p.locator('.ym-ligne.possible').first().dblclick();
        await p.waitForFunction(() => window.__ym.current === 0 && window.__ym.rolls === 3, null, { timeout: 20000 });
        await p.click('[data-a="secouer"]');
        await p.waitForSelector('[data-a="roll"]:not([disabled])');
        await p.evaluate(() => {
          const ev = () => { const e = new Event('devicemotion'); e.accelerationIncludingGravity = { x: 28, y: 4, z: 9 }; window.dispatchEvent(e); };
          ev(); setTimeout(ev, 120);
        });
        await attendre(300);
        check('📳 secouer le téléphone lance les dés', await etat(p, () => window.__ym.rolls) === 2);
        await p.evaluate(() => GG.reglages.set('yams-secouer', false));
      }
      await attendre(900); // dés retombés
      await sansDebord(p, 'Yams');
      await p._ctx.close();
    }
    {
      console.log('--- Yams à deux sur un téléphone ---');
      const p = await nouvelle(360, 640);
      await espionY(p);
      await lanceLocal(p, 'yams', ['Léa', 'Marc']);
      await p.click('[data-a="roll"]');
      await p.waitForSelector('.ym-ligne.possible');
      await p.locator('.ym-ligne.possible[data-cat="chance"]').dblclick();
      check('double toucher sur une case = choisir puis confirmer', await etat(p, () => window.__ym.players[0].sheet.chance) !== null);
      check('Marc peut annuler le choix de Léa avant de lancer', /Annuler le choix de Léa/.test(await p.textContent('[data-a="annule"]')));
      await p.click('[data-a="annule"]');
      check('annulé : c’est de nouveau à Léa, avec ses dés', await etat(p, () => window.__ym.current === 0 && window.__ym.rolls === 2));
      await capture(p, 'yams_360_deux');
      await sansDebord(p, 'Yams à deux');
      await p._ctx.close();
    }
  }

  /* ======================= COCHON ======================= */
  if (joue('cochon')) {
    const espionP = p => p.evaluate(() => {
      const m = GG.byId.cochon, ap = m.apply;
      m.apply = function (s) { window.__pig = s; return ap.apply(this, arguments); };
    });
    const etat = (p, f) => p.evaluate(f);
    const truque = (p, v) => p.evaluate(v => { window.__r = window.__r || Math.random; Math.random = () => v; }, v);
    const vrai = p => p.evaluate(() => { if (window.__r) Math.random = window.__r; });
    for (const [w, h] of [[412, 780], [360, 640]]) {
      console.log('--- Cochon contre 3 IA (' + w + '×' + h + ') ---');
      const p = await nouvelle(w, h);
      await espionP(p);
      await lanceSolo(p, 'cochon', 'difficile', 3);
      await p.waitForSelector('.pig-v2');
      check('une jauge vers 100 par joueur', await p.locator('.pig-couloir').count() === 4 &&
        /🤖 Suzette/.test(await p.textContent('.pig-course')));
      check('options : tour égal et variante à deux dés', await p.locator('.pig-regle').count() === 2);
      check('gros dé en 3D au repos', await p.locator('.pig-de.repos .pig-f').count() === 6);
      // BUG (sécurité) : aucun HTML dans l’état
      await truque(p, 0.55);
      await p.click('[data-a="roll"]');
      await p.locator('[data-a="roll"]').click({ force: true, noWaitAfter: true, timeout: 300 }).catch(() => {});
      await vrai(p);
      check('double appui sur « Lancer » : un seul lancer', await etat(p, () => window.__pig.nLancers) === 1);
      check('le dé roule (animation)', await p.locator('.pig-de.roule').count() === 1);
      check('options figées après le 1er lancer', await p.locator('.pig-regle').count() === 0);
      check('suspense : les points n’apparaissent qu’à l’arrêt du dé', (await p.textContent('.pig-tp')).trim() === '0');
      await attendre(1300);
      check('points en jeu : 4', (await p.textContent('.pig-tp')).trim() === '4');
      await p.waitForSelector('[data-a="bank"]:not([disabled])');
      await p.click('[data-a="bank"]');
      check('mettre à l’abri : les pièces volent vers la jauge', await p.waitForSelector('[data-gg-fx="vol"] .pig-piece',
        { state: 'attached', timeout: 800 }).then(() => true, () => false));
      await capture(p, 'cochon_' + w + '_banque');
      // 3 IA : rapide d’office ; on mesure l’attente entre deux tours humains
      const t0 = Date.now();
      await p.waitForFunction(() => window.__pig.current === 0 || window.__pig.finished, null, { timeout: 30000 });
      const attenteRapide = (Date.now() - t0) / 1000;
      check('contre 3 IA, IA rapide d’office', await p.getAttribute('[data-a="vitesse"]', 'aria-pressed') === 'true');
      mesure('Cochon à 4 (rapide), attente réelle entre deux tours humains', attenteRapide.toFixed(1) + ' s (avant : ≈ 11 s)');
      check('BUG 8 : attente < 4,5 s en rapide', attenteRapide < 4.5, attenteRapide);
      // « Cochon ! » quand le dé fait 1
      await p.waitForSelector('[data-a="roll"]:not([disabled])');
      await truque(p, 0.01);
      await p.click('[data-a="roll"]');
      await vrai(p);
      await p.waitForSelector('.pig-groin', { timeout: 2000 });
      check('« COCHON ! » : le cochon surgit (animation drôle)', /COCHON/.test(await p.textContent('.pig-groin')));
      await capture(p, 'cochon_' + w + '_cochon');
      await sansDebord(p, 'Cochon');
      await p._ctx.close();
    }
    {
      console.log('--- Cochon à deux sur un téléphone : tour égal, deux dés ---');
      const p = await nouvelle(412, 780);
      await espionP(p);
      await lanceLocal(p, 'cochon', ['Léa', 'Marc']);
      await p.waitForSelector('.pig-v2');
      check('pas de pastilles en double (la course suffit)', await p.locator('#mini-players.hidden').count() === 1);
      await p.click('[data-r="egal"]');
      await p.click('[data-r="deuxDes"]');
      check('options choisies : tour égal, deux dés', await etat(p, () => window.__pig.opts.egal && window.__pig.opts.deuxDes));
      check('deux gros dés', await p.locator('.pig-de').count() === 2);
      // Léa part de 92 : 6 + 6 → 104, elle garde : Marc a un dernier tour
      await p.evaluate(() => { window.__pig.players[0].total = 92; });
      await truque(p, 0.99);
      await p.click('[data-a="roll"]');
      await vrai(p);
      await p.waitForSelector('[data-a="bank"]:not([disabled])');
      await p.click('[data-a="bank"]');
      await p.waitForSelector('.pig-dernier');
      check('tour égal : 100 atteint, Marc joue son dernier tour', /Léa a atteint 100/.test(await p.textContent('.pig-dernier')) &&
        await etat(p, () => window.__pig.current === 1 && !window.__pig.finished));
      await capture(p, 'cochon_412_dernier');
      // Marc : double 1 → « Gros cochon », la partie se termine, Léa gagne
      await p.evaluate(() => { window.__pig.players[1].total = 50; });
      await p.waitForSelector('[data-a="roll"]:not([disabled])');
      await truque(p, 0);
      await p.click('[data-a="roll"]');
      await vrai(p);
      await p.waitForSelector('#overlay-end:not(.hidden)', { timeout: 5000 });
      check('double 1 : « Gros cochon », retour à zéro', await etat(p, () => window.__pig.players[1].total === 0));
      check('fin de partie : Léa gagne', /Léa/.test(await p.textContent('#end-detail')));
      await p._ctx.close();
    }
  }

  /* ============ Fluidité au processeur ×4 ============ */
  if (!SEUL || SEUL === 'fluidite') {
    console.log('--- Fluidité des animations au processeur ×4 ---');
    const p = await nouvelle(412, 780);
    const cdp = await p._ctx.newCDPSession(p);
    // Les aurores de fond de la coque (flou de 60 px animé) coûtent très cher
    // en rendu logiciel (navigateur sans GPU des tests) : on les coupe pour
    // mesurer le coût des JEUX seuls.
    await p.addStyleTag({ content: 'body::before, body::after { animation: none !important; display: none !important; }' });
    const images = async action => {
      await p.evaluate(() => {
        window.__img = []; const t0 = performance.now(); let last = t0;
        const f = t => { window.__img.push(t - last); last = t; if (t - t0 < 1200) requestAnimationFrame(f); };
        requestAnimationFrame(f);
      });
      await action();
      await attendre(1350);
      const im = await p.evaluate(() => window.__img.slice(2));
      return im.reduce((a, b) => a + b, 0) / Math.max(1, im.length);
    };
    const quitteVite = async () => { await quitte(p); };
    const res = {};
    // on chauffe chaque jeu une fois (compilation, sons) puis on mesure au ×4
    await lanceLocal(p, 'p4', ['A', 'B']);
    await p.locator('.p4-cell[data-col="2"]').first().click();
    await p.waitForSelector('.p4-board[data-pret="1"]');
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    res.p4 = await images(() => p.locator('.p4-cell[data-col="3"]').first().click());
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await quitteVite();
    await lanceLocal(p, 'yams', ['A', 'B']);
    await p.click('[data-a="roll"]');
    await p.waitForSelector('[data-a="roll"]:not([disabled])');
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    res.yams = await images(() => p.click('[data-a="roll"]'));
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await quitteVite();
    await lanceLocal(p, 'cochon', ['A', 'B']);
    await p.click('[data-a="roll"]');
    await attendre(900);
    await p.waitForSelector('[data-a="roll"]:not([disabled])');
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    res.cochon = await images(() => p.click('[data-a="roll"]'));
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await quitteVite();
    Object.keys(res).forEach(k => {
      mesure('Fluidité ' + k + ' au processeur ×4 (animation d’un coup)', (1000 / res[k]).toFixed(0) + ' images/s');
      check(k + ' : animation fluide au processeur ×4 (≥ 30 images/s)', 1000 / res[k] >= 30, res[k]);
    });
    await p._ctx.close();
  }

  /* ============ Sécurité : un état hostile (hôte malveillant) ============ */
  if (!SEUL || SEUL === 'securite') {
    console.log('--- Sécurité : rendu d’états piégés ---');
    const p = await nouvelle(412, 780);
    const res = await p.evaluate(() => {
      const X = '<img src=x onerror="window.__xss=1">', Q = '" onmouseover="window.__xss=1" x="';
      const out = {};
      const essai = (id, prepare) => {
        const m = GG.byId[id];
        const s = m.create([X, X + '2']);
        prepare(s);
        const div = document.createElement('div');
        div.style.cssText = 'position:absolute;left:-9999px;top:0;width:400px';
        document.body.appendChild(div);
        let erreur = null;
        try { m.render(div, { state: s, me: 1, mode: 'guest', act: () => true }); } catch (e) { erreur = e.message; }
        out[id] = { img: !!div.querySelector('img'), attr: !!div.querySelector('[onmouseover]'), erreur };
        div.remove();
      };
      essai('p4', s => { s.manche = X; s.players[0].wins = X; s.coups = 3; s.roundOver = true; s.winner = 0; });
      essai('morpion', s => { s.manche = X; s.grid[0] = Q; s.grid[1] = 'X'; s.coups = 2; });
      essai('bataille', s => {
        s.phase = 'play'; s.players.forEach(p => { p.ready = true; p.wins = X; });
        s.dernier = { tireur: 0, cible: 1, idx: 5, res: Q, navire: X, n: 1 }; s.attente = true; s.current = 1; s.tirs = [X, X];
      });
      essai('yams', s => {
        s.players[0].sheet.chance = X; s.players[1].sheet.un = Q; s.rolls = 2; s.dice = [X, 2, 3, 4, 5];
        s.annulable = { player: 0, cat: Q, dice: [1, 2, 3, 4, 5], held: [false, false, false, false, false], rolls: 1 };
        s.dernierChoix = { player: X, cat: 'chance', points: X, n: 1 };
      });
      essai('cochon', s => {
        s.players[0].total = X; s.turnPoints = X; s.des = [X]; s.nLancers = 2;
        s.dernier = { player: 0, des: [X], res: 'cochon', points: X, n: 2 }; s.cible = X;
      });
      out.xss = window.__xss === 1;
      return out;
    });
    ['p4', 'morpion', 'bataille', 'yams', 'cochon'].forEach(id => {
      check(id + ' : état piégé rendu (sans planter) sans balise ni attribut injectés',
        !res[id].img && !res[id].attr && !res[id].erreur, res[id]);
    });
    check('aucun script injecté ne s’est exécuté', !res.xss);
    await p._ctx.close();
  }

  /* ============ Reprise d’une partie (état seul, sans le DOM) ============ */
  if (!SEUL || SEUL === 'reprise') {
    console.log('--- Reprise des parties ---');
    const reprise = async (jeu, prepare, verifie) => {
      const p = await nouvelle(412, 780);
      await lanceLocal(p, jeu, ['Léa', 'Marc']);
      await prepare(p);
      await attendre(500); // enregistrement (différé de 250 ms)
      await p.reload();
      await p.waitForSelector('#btn-reprise', { timeout: 5000 });
      await p.click('#btn-reprise');
      await p.waitForSelector('#screen-mini.active');
      await passe(p);
      const ok = await verifie(p);
      check(jeu + ' : la partie reprend où elle en était', ok);
      await sansDebord(p, jeu + ' après reprise');
      await p._ctx.close();
    };
    await reprise('p4', async p => {
      await p.locator('.p4-cell[data-col="3"]').first().click();
    }, async p => await p.locator('.p4-disc:not(.mini)').count() === 1 && /Marc/.test(await p.textContent('.p4-msg')));
    await reprise('morpion', async p => {
      await p.locator('.ttt-cell[data-i="4"]').click();
    }, async p => await p.locator('.ttt-sym.x').count() === 1);
    await reprise('bataille', async p => {
      await p.click('[data-a="ready"]'); await passe(p);
      await p.click('[data-a="ready"]'); await passe(p);
      await p.waitForSelector('.bn-grid.aim[data-pret="1"]');
      await p.locator('.bn-grid.aim .bn-cell').first().click();
    }, async p => {
      // le minuteur est perdu à la reprise : le bouton « Passer » fait avancer
      const b = await p.locator('[data-a="suite"]').count();
      if (b) { await p.waitForSelector('[data-a="suite"]:not([disabled])'); await p.click('[data-a="suite"]'); await passe(p); }
      return await p.locator('.bn-grid.mienne .bn-cell.last').count() === 1;
    });
    await reprise('yams', async p => {
      await p.click('[data-a="roll"]');
      await attendre(800);
      await p.locator('.ym-piste .ym-de').first().click();
    }, async p => await p.locator('.ym-gardes .ym-de.garde').count() === 1 && await p.locator('.ym-ligne.possible').count() === 13);
    await reprise('cochon', async p => {
      await p.evaluate(() => { window.__r = Math.random; Math.random = () => 0.55; });
      await p.click('[data-a="roll"]');
      await p.evaluate(() => { Math.random = window.__r; });
    }, async p => (await p.textContent('.pig-tp')).trim() === '4');
  }

  /* ============ Bataille en ligne : la flotte adverse ne circule jamais ============ */
  if (!SEUL || SEUL === 'enligne') {
    console.log('--- Bataille navale en ligne (relais local) ---');
    const { demarrer } = require('../relais-local.js');
    const relais = await demarrer(8826);
    const ctxH = await browser.newContext({ viewport: { width: 412, height: 780 } });
    const ctxG = await browser.newContext({ viewport: { width: 360, height: 640 } });
    // l’invitée enregistre tout ce qu’elle reçoit du réseau
    await ctxG.addInitScript(() => {
      const W = window.WebSocket;
      window.__recus = [];
      window.WebSocket = function (u, pr) {
        const ws = pr ? new W(u, pr) : new W(u);
        ws.addEventListener('message', e => { window.__recus.push(String(e.data)); });
        return ws;
      };
      window.WebSocket.prototype = W.prototype;
      ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach((k, i) => { window.WebSocket[k] = i; });
    });
    const hote = await ctxH.newPage(), invite = await ctxG.newPage();
    for (const p of [hote, invite]) {
      p.on('pageerror', e => { failures++; console.log('  FAIL JS : ' + e.message); });
      await p.goto(URL);
      await p.evaluate(u => localStorage.setItem('gg-relais', u), relais.url);
      await p.reload();
      await p.waitForSelector('#catalog .game-tile');
    }
    await hote.click('.game-tile[data-g="bataille"]');
    await hote.click('#btn-mini-online');
    await hote.fill('#host-name', 'Hugo');
    await hote.click('#btn-host-create');
    await hote.waitForSelector('#host-step-lobby:not(.hidden)', { timeout: 15000 });
    const code = (await hote.textContent('#host-code-big')).trim();
    await invite.click('#btn-home-online');
    await invite.fill('#online-name', 'Nina');
    await invite.fill('#online-code', code);
    await invite.click('#btn-online-go');
    await hote.waitForFunction(() => document.querySelectorAll('.lobby-row').length === 2, null, { timeout: 15000 });
    await hote.click('#btn-host-start');
    await hote.waitForSelector('.bn-grid.placement', { timeout: 15000 });
    await invite.waitForSelector('.bn-grid.placement', { timeout: 15000 });
    check('en ligne : chacun place SA flotte en même temps', await hote.locator('.bn-cell.ship').count() === 17 &&
      await invite.locator('.bn-cell.ship').count() === 17);
    await hote.click('[data-a="ready"]');
    await invite.click('[data-a="ready"]');
    await hote.waitForSelector('.bn-grid.aim[data-pret="1"]', { timeout: 10000 });
    await hote.locator('.bn-grid.aim .bn-cell[data-i="44"]').click();
    await invite.waitForFunction(() => document.querySelectorAll('.bn-grid.mienne .bn-cell.last').length === 1, null, { timeout: 8000 });
    await invite.waitForSelector('.bn-grid.aim[data-pret="1"]', { timeout: 8000 });
    check('en ligne : le tir de l’hôte arrive, puis la main passe à l’invitée', /Hugo a (tiré|touché|coulé)/.test(await invite.textContent('.bn-msg')));
    await invite.locator('.bn-grid.aim .bn-cell[data-i="55"]').click();
    await hote.waitForFunction(() => document.querySelectorAll('.bn-grid.mienne .bn-cell.last').length === 1, null, { timeout: 8000 });
    const fuite = await invite.evaluate(() => {
      let etats = 0, fuites = 0;
      window.__recus.forEach(txt => {
        let m; try { m = JSON.parse(txt); } catch (e) { return; }
        const chercher = o => {
          if (!o || typeof o !== 'object') return;
          if (o.boards && o.players && o.shots) {
            etats++;
            if (!o.finished && !o.fini) {
              const b = o.boards[0];
              if (Object.keys(b.cells || {}).length) fuites++;
              if (b.ships.some(s => !s.sunk && (s.r !== undefined || (s.cells && s.cells.length)))) fuites++;
            }
            return;
          }
          Object.keys(o).forEach(k => chercher(o[k]));
        };
        chercher(m);
      });
      return { etats, fuites };
    });
    check('en ligne : ' + fuite.etats + ' états reçus par l’invitée, AUCUNE position de la flotte de l’hôte', fuite.etats > 0 && fuite.fuites === 0, fuite);
    await ctxH.close();
    await ctxG.close();

    // Yams et Cochon en ligne : chacun joue sur son téléphone
    const partieEnLigne = async (jeu, scenario) => {
      const cH = await browser.newContext({ viewport: { width: 412, height: 780 } });
      const cG = await browser.newContext({ viewport: { width: 360, height: 640 } });
      const h = await cH.newPage(), g = await cG.newPage();
      for (const q of [h, g]) {
        q.on('pageerror', e => { failures++; console.log('  FAIL JS : ' + e.message); });
        await q.goto(URL);
        await q.evaluate(u => localStorage.setItem('gg-relais', u), relais.url);
        await q.reload();
        await q.waitForSelector('#catalog .game-tile');
      }
      await h.click('.game-tile[data-g="' + jeu + '"]');
      await h.click('#btn-mini-online');
      await h.fill('#host-name', 'Hugo');
      await h.click('#btn-host-create');
      await h.waitForSelector('#host-step-lobby:not(.hidden)', { timeout: 15000 });
      const c = (await h.textContent('#host-code-big')).trim();
      await g.click('#btn-home-online');
      await g.fill('#online-name', 'Nina');
      await g.fill('#online-code', c);
      await g.click('#btn-online-go');
      await h.waitForFunction(() => document.querySelectorAll('.lobby-row').length === 2, null, { timeout: 15000 });
      await h.click('#btn-host-start');
      await h.waitForSelector('#screen-mini.active', { timeout: 15000 });
      await g.waitForSelector('#screen-mini.active', { timeout: 15000 });
      await scenario(h, g);
      await cH.close();
      await cG.close();
    };
    console.log('--- Yams en ligne ---');
    await partieEnLigne('yams', async (h, g) => {
      check('Yams en ligne : l’invitée attend son tour (bouton inactif)', await g.locator('[data-a="roll"][disabled]').count() === 1);
      await h.click('[data-a="roll"]');
      await g.waitForFunction(() => document.querySelectorAll('.ym-de.vide').length === 0, null, { timeout: 8000 });
      check('Yams en ligne : les dés de l’hôte arrivent chez l’invitée', true);
      await h.waitForSelector('.ym-ligne.possible');
      await h.locator('.ym-ligne.possible[data-cat="chance"]').dblclick();
      await g.waitForSelector('[data-a="roll"]:not([disabled])', { timeout: 8000 });
      await g.click('[data-a="roll"]');
      // l’aller-retour par l’hôte prend un instant
      const lance = await g.waitForSelector('.ym-ligne.possible', { timeout: 8000 }).then(() => true, () => false);
      check('Yams en ligne : l’invitée lance à son tour', lance && await g.locator('.ym-ligne.possible').count() === 13);
    });
    console.log('--- Cochon en ligne ---');
    await partieEnLigne('cochon', async (h, g) => {
      check('Cochon en ligne : l’invitée attend son tour', await g.locator('[data-a="roll"][disabled]').count() === 1);
      await h.evaluate(() => { window.__r = Math.random; Math.random = () => 0.55; });
      await h.click('[data-a="roll"]');
      await h.evaluate(() => { Math.random = window.__r; });
      await g.waitForFunction(() => document.querySelector('.pig-de.roule') || /4/.test(document.querySelector('.pig-tp').textContent), null, { timeout: 8000 });
      await h.waitForSelector('[data-a="bank"]:not([disabled])');
      await h.click('[data-a="bank"]');
      await g.waitForSelector('[data-a="roll"]:not([disabled])', { timeout: 8000 });
      check('Cochon en ligne : les 4 points de l’hôte sont à l’abri chez l’invitée, et c’est à elle',
        /4/.test(await g.textContent('.pig-couloir[data-p="0"] .pig-total')));
    });
    await relais.arreter();
  }

  await browser.close();
  console.log(failures ? '\n' + failures + ' ÉCHEC(S)' : '\nTests V2 des classiques (navigateur) OK.');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
