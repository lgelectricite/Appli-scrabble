/*
 * V2 — 8 américain, Memory, Petit Bac : de vraies parties dans le navigateur.
 *   - en solo contre l'IA et à plusieurs sur un seul téléphone ;
 *   - le Petit Bac à trois téléphones par le relais local ;
 *   - un contrôle par bug de l'audit, aucune erreur JS, aucun débordement
 *     horizontal à 412 et 360 px, les animations clés présentes ;
 *   - la fluidité avec un processeur ralenti ×4.
 * Usage : GG_URL=http://localhost:<port>/index.html node tests/browser/test_v2_cartes_bac.js [huit|memory|bac|reseau|securite|fluidite]
 */
const { chromium } = require('playwright');
const { demarrer } = require('../relais-local.js');
const URL_APP = process.env.GG_URL || 'http://localhost:8642/index.html';
const SEUL = process.argv[2] || null;
let failures = 0;
function check(n, c, e) {
  if (c) console.log('  OK  ' + n + (e !== undefined ? '  [' + (typeof e === 'string' ? e : JSON.stringify(e)) + ']' : ''));
  else { failures++; console.log('  FAIL ' + n + (e !== undefined ? ' -> ' + JSON.stringify(e) : '')); }
}
const attendre = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox']
  });

  async function page(w, h, nom) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const p = await ctx.newPage();
    p.on('pageerror', e => { failures++; console.log('  FAIL erreur JS (' + (nom || w) + ') : ' + e.message); });
    await p.goto(URL_APP);
    await p.waitForSelector('.game-tile');
    return p;
  }
  async function lancer(p, jeu, mode, opts) {
    opts = opts || {};
    await p.click('.game-tile[data-g="' + jeu + '"]');
    await p.waitForSelector('#screen-mini-setup.active');
    if (mode === 'solo') {
      await p.click('#btn-mini-solo');
      if (opts.bots) await p.click('#msolo-bots .count-btn[data-n="' + opts.bots + '"]');
      if (opts.niveau) await p.click('#msolo-niveau [data-niveau="' + opts.niveau + '"]');
      await p.click('#btn-msolo-start');
    } else {
      await p.click('#btn-mini-hotseat');
      if (opts.joueurs) await p.click('#mini-count .count-btn[data-n="' + opts.joueurs + '"]');
      await p.click('#btn-mini-start');
    }
    await p.waitForSelector('#screen-mini.active');
  }
  async function quitter(p) {
    if (await p.locator('#overlay-end:not(.hidden)').count()) { await p.click('#btn-end-home'); }
    else { await p.click('#btn-mini-menu'); await p.click('#btn-menu-quit'); await p.click('#btn-confirm-yes'); }
    await p.waitForSelector('#screen-home.active', { timeout: 8000 });
  }
  /* débordement horizontal : la page ET chaque élément visible du jeu */
  async function deborde(p) {
    return p.evaluate(() => {
      const iw = innerWidth;
      const hors = [...document.querySelectorAll('#mini-area *')].filter(e => {
        if (e.closest('[data-gg-fx]')) return false;
        const r = e.getBoundingClientRect();
        return r.width && r.height && (r.right > iw + 1 || r.left < -1);
      }).map(e => e.className && e.className.baseVal === undefined ? e.className : e.tagName).slice(0, 4);
      return { page: document.documentElement.scrollWidth > iw + 1, hors };
    });
  }
  async function sansDebordement(p, quoi) {
    const d = await deborde(p);
    check(quoi + ' : aucun débordement horizontal', !d.page && !d.hors.length, d);
  }
  /* touche un élément là où il est vraiment visible (cartes en éventail) */
  async function toucher(p, sel, n) {
    const pt = await p.evaluate(([s, k]) => {
      const el = document.querySelectorAll(s)[k || 0];
      if (!el) return null;
      const r = el.getBoundingClientRect();
      for (let y = r.top + 8; y < r.bottom - 4; y += 5) {
        for (let x = r.left + 4; x < r.right - 2; x += 4) {
          const h = document.elementFromPoint(x, y);
          if (h && (h === el || el.contains(h))) return { x, y };
        }
      }
      return null;
    }, [sel, n]);
    if (!pt) return false;
    await p.mouse.click(pt.x, pt.y);
    return true;
  }
  async function passerSiBesoin(p) {
    if (await p.locator('#overlay-pass:not(.hidden)').count()) {
      await p.click('#btn-pass-ready');
      await attendre(150);
      return true;
    }
    return false;
  }
  /* guetteur d'animations : un clone GG.fx vole-t-il pendant la fenêtre ? */
  async function guetterVol(p) {
    await p.evaluate(() => {
      window.__vols = 0;
      if (window.__obsVol) window.__obsVol.disconnect();
      window.__obsVol = new MutationObserver(l => l.forEach(m => m.addedNodes.forEach(n => {
        if (n.nodeType === 1 && n.getAttribute('data-gg-fx') === 'vol') window.__vols++;
      })));
      window.__obsVol.observe(document.body, { childList: true });
    });
  }
  const vols = p => p.evaluate(() => window.__vols || 0);

  /* ============================ 8 AMÉRICAIN ============================ */
  if (!SEUL || SEUL === 'huit') {
    console.log('--- 8 américain : une manche complète en solo (412×780) ---');
    const p = await page(412, 780, 'huit');
    await guetterVol(p);
    await lancer(p, 'huit', 'solo', { niveau: 'difficile' });
    await p.waitForSelector('.hu-main .ha-card');
    await attendre(200);
    check('distribution animée : des cartes volent de la pioche', (await vols(p)) >= 5, await vols(p));
    await attendre(1500);
    const main = await p.evaluate(() => {
      const h = document.querySelector('.ha-hand');
      const cartes = [...h.querySelectorAll('.ha-card')];
      const ORD = { '♠': 0, '♥': 1, '♣': 2, '♦': 3 }, R = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'V', 'D', 'R', 'A'];
      const cles = cartes.map(c => c.getAttribute('data-k'));
      const rang = k => { const s = k.slice(-1), r = k.slice(0, -1); return (r === '8' ? 100 : 0) + ORD[s] * 20 + R.indexOf(r); };
      const trie = cles.every((k, i) => !i || rang(cles[i - 1]) <= rang(k));
      const dedans = cartes.every(c => { const r = c.getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1; });
      // chaque carte garde une zone touchable (son coin d'index)
      const touchables = cartes.filter(c => {
        const r = c.getBoundingClientRect();
        for (let y = r.top + 6; y < r.bottom - 4; y += 6) for (let x = r.left + 3; x < r.right - 2; x += 4) {
          const e = document.elementFromPoint(x, y);
          if (e && c.contains(e)) return true;
        }
        return false;
      }).length;
      return { n: cartes.length, trie, dedans, touchables, defile: h.scrollWidth > h.clientWidth + 1, cles: cles.join(' ') };
    });
    check('7 cartes en main, triées par couleur et par valeur (8 à la fin)', main.n === 7 && main.trie, main.cles);
    check('éventail : aucune carte cachée hors écran, pas de défilement', main.dedans && !main.defile);
    check('éventail : chaque carte reste touchable', main.touchables === main.n, main.touchables + '/' + main.n);
    check('vraies cartes (GG.carte) sur la table : défausse, pioche, main',
      await p.locator('.hu-defausse .jc').count() >= 1 && await p.locator('.hu-pioche .jc.dos').count() >= 1 &&
      await p.locator('.hu-main .jc').count() === 7);
    await sansDebordement(p, 'table de jeu 412');
    // règles maison
    await p.click('[data-a="regles"]');
    await p.waitForSelector('.hu-feuille');
    await p.click('[data-cible="100"]');
    await p.click('[data-opt="dix"]');
    await p.click('[data-a="valider-regles"]');
    await attendre(200);
    check('règles maison : score cible 100 et « 10 rejoue » appliqués',
      /100 pts/.test(await p.textContent('.hu-moi')) && /10 rejoue/.test(await p.textContent('.hu-regles-chip')));
    // on joue la manche jusqu'au bout
    let roue = false, carteDite = false, volCoup = false, coups = 0;
    for (let k = 0; k < 500; k++) {
      if (await p.locator('.hu-fin').count() || await p.locator('#overlay-end:not(.hidden)').count()) break;
      if (!(await p.locator('.hu-tour.moi').count())) { await attendre(250); continue; }
      await attendre(200);
      if (await p.locator('[data-a="carte"]').count()) {
        await p.click('[data-a="carte"]'); carteDite = true; await attendre(250); continue;
      }
      if (await p.locator('.hu-main .ha-card.ok').count()) {
        await guetterVol(p);
        await toucher(p, '.hu-main .ha-card.ok', 0);
        await attendre(150);
        if (await p.locator('.hu-roue').count()) {
          roue = roue || (await p.locator('.hu-roue .ha-suit-btn').count()) === 4;
          await p.locator('.ha-suit-btn').nth(2).click();
        }
        await attendre(250);
        if ((await vols(p)) > 0) volCoup = true;
        coups++;
      } else if (await p.locator('[data-a="pass"]').count()) {
        await p.click('[data-a="pass"]');
      } else {
        await p.click('[data-a="draw"]');
      }
      await attendre(200);
    }
    check('la carte jouée vole vers la défausse', volCoup);
    await p.waitForSelector('.hu-fin', { timeout: 20000 });
    await attendre(1200);
    const fin = await p.evaluate(() => {
      const lignes = [...document.querySelectorAll('.hu-fin-ligne')];
      return lignes.map(l => {
        const n = l.querySelector('.hu-fin-nom').getBoundingClientRect(), s = l.querySelector('.hu-fin-score').getBoundingClientRect();
        return { txt: l.innerText.replace(/\n+/g, ' | '), ecart: s.left - n.right };
      });
    });
    check('fin de manche : nom, cartes et points bien séparés (plus de « Suzette100 pts »)',
      fin.length === 2 && fin.every(f => f.ecart >= 8 && !/[a-zé]\d+\s*pts/i.test(f.txt.replace(/ \| /g, '\n').split('\n').join(' | '))), fin);
    const btn = await p.evaluate(() => {
      const b = document.querySelector('.hu-fin [data-a="again"]');
      return b ? b.getBoundingClientRect().bottom <= innerHeight : 'fini';
    });
    check('« Manche suivante » visible sans défiler', btn === true || btn === 'fini', btn);
    await sansDebordement(p, 'fin de manche 412');
    console.log('  (' + coups + ' cartes posées ; roue des couleurs vue : ' + roue + ' ; « Carte ! » annoncé : ' + carteDite + ')');
    await quitter(p);

    console.log('--- 8 américain : 4 joueurs à 360×640 ---');
    const q = await page(360, 640, 'huit360');
    await lancer(q, 'huit', 'solo', { bots: 3 });
    await q.waitForSelector('.hu-main .ha-card');
    await attendre(1800);
    check('3 adversaires assis en haut', await q.locator('.hu-siege').count() === 3);
    await sansDebordement(q, 'table à 4 joueurs 360');
    const tient = await q.evaluate(() => {
      const m = document.querySelector('.hu-main').getBoundingClientRect();
      return m.bottom <= innerHeight + 2;
    });
    check('la main tient dans l’écran de 640 px', tient);
    await quitter(q);

    console.log('--- 8 américain : à deux sur un téléphone ---');
    const h = await page(412, 780, 'huitHot');
    await lancer(h, 'huit', 'hot');
    // première carte « saute ton tour » : c'est au joueur 2 → écran de passage d'abord
    await attendre(600);
    await passerSiBesoin(h);
    await h.waitForSelector('.hu-main .ha-card');
    await attendre(1600);
    if (await h.locator('.hu-main .ha-card.ok').count()) {
      await toucher(h, '.hu-main .ha-card.ok', 0);
      await attendre(150);
      if (await h.locator('.hu-roue').count()) await h.locator('.ha-suit-btn').first().click();
    } else {
      await h.click('[data-a="draw"]');
      await attendre(200);
      if (await h.locator('[data-a="pass"]').count()) await h.click('[data-a="pass"]');
      else if (await h.locator('.hu-main .ha-card.ok').count()) await toucher(h, '.hu-main .ha-card.ok', 0);
      await attendre(150);
      if (await h.locator('.hu-roue').count()) await h.locator('.ha-suit-btn').first().click();
    }
    await attendre(300);
    const passe = await passerSiBesoin(h);
    check('écran « passez le téléphone » puis la main du joueur 2', passe && /À vous|Joueur 2/.test(await h.textContent('#mini-area')));
    await quitter(h);
    await h.context().close(); await q.context().close(); await p.context().close();
  }

  /* ============================== MEMORY ============================== */
  if (!SEUL || SEUL === 'memory') {
    console.log('--- Memory : une partie complète contre l’IA (412×780) ---');
    const p = await page(412, 780, 'memory');
    await lancer(p, 'memory', 'solo', { niveau: 'facile' });
    await p.waitForSelector('.mem-config');
    check('7 thèmes au choix', await p.locator('.mem-theme').count() >= 7);
    check('12, 18 et 24 paires proposées sur un grand écran', await p.locator('.mem-taille:not([disabled])').count() === 3);
    await p.click('.mem-theme[data-th="animaux"]');
    await p.click('[data-a="go"]');
    await p.waitForSelector('.mem-board');
    await attendre(900);
    const dim = await p.evaluate(() => {
      const t = document.querySelector('.mem-tour').getBoundingClientRect();
      const c = document.querySelector('#mem-timer').getBoundingClientRect();
      const d = [...document.querySelectorAll('.mem-card')].pop().getBoundingClientRect();
      const s = document.querySelector('.mem-scores');
      return { tour: t.bottom, chrono: c.bottom, carte: d.bottom, scores: s ? s.getBoundingClientRect().bottom : 0,
        ih: innerHeight, sh: document.documentElement.scrollHeight };
    });
    check('« À vous de jouer » et le chrono visibles, toute la grille dans l’écran (bug : page de 794 px pour 770)',
      dim.tour <= dim.ih && dim.chrono <= dim.ih && dim.carte <= dim.ih && dim.scores <= dim.ih && dim.sh <= dim.ih + 1, dim);
    check('cartes cachées : aucune image dans le DOM (redact : rien ne fuit)',
      await p.evaluate(() => [...document.querySelectorAll('.mem-card:not(.up):not(.trouvee) .mem-face')].every(f => !f.textContent.trim() && !f.querySelector('svg'))));
    await sansDebordement(p, 'grille Memory 412');
    // on joue avec une mémoire parfaite (celle du testeur) jusqu'à la fin
    const vus = {};
    let retournement3D = false, volPaire = false;
    await guetterVol(p);
    for (let k = 0; k < 300; k++) {
      if (await p.locator('#overlay-end:not(.hidden)').count()) break;
      if (!(await p.locator('.mem-tour.moi').count())) { await attendre(200); continue; }
      await attendre(120);
      const etat = await p.evaluate(() => [...document.querySelectorAll('.mem-card')].map(c => ({
        up: c.classList.contains('up'), done: c.classList.contains('trouvee'), e: c.querySelector('.mem-face').textContent.trim()
      })));
      etat.forEach((c, i) => { if (c.e) vus[i] = c.e; });
      const libres = etat.map((c, i) => i).filter(i => !etat[i].done && !etat[i].up);
      const ouverte = etat.findIndex(c => c.up && !c.done);
      let choix = -1;
      if (ouverte !== -1) choix = libres.find(i => vus[i] && vus[i] === etat[ouverte].e && i !== ouverte);
      if (choix === undefined || choix === -1) {
        const par = {};
        for (const i of libres) { if (vus[i]) { if (par[vus[i]] !== undefined && ouverte === -1) { choix = par[vus[i]]; break; } par[vus[i]] = i; } }
      }
      if (choix === undefined || choix === -1) choix = libres.find(i => !vus[i]);
      if (choix === undefined || choix === -1) choix = libres[0];
      if (choix === undefined) { await attendre(200); continue; }
      await p.locator('.mem-card').nth(choix).click();
      if (!retournement3D) {
        // on échantillonne le pivot pendant 400 ms : une rotation 3D partielle doit apparaître
        retournement3D = await p.evaluate(i => new Promise(res => {
          const inner = document.querySelectorAll('.mem-card')[i].querySelector('.mem-inner');
          const t0 = performance.now();
          (function f() {
            const m = getComputedStyle(inner).transform;
            const a = /^matrix3d\(([-\d.e]+)/.exec(m);
            if (a && Math.abs(+a[1]) < 0.95) return res(true); // en plein pivot
            if (performance.now() - t0 > 400) return res(false);
            requestAnimationFrame(f);
          })();
        }), choix);
      } else await attendre(380);
      const face = await p.evaluate(i => document.querySelectorAll('.mem-card')[i].querySelector('.mem-face').textContent.trim(), choix);
      if (face) vus[choix] = face;
      if (!volPaire && (await vols(p)) > 0) volPaire = true;
    }
    check('retournement 3D des cartes (rotation en cours de transition)', retournement3D);
    await p.waitForSelector('#overlay-end:not(.hidden)', { timeout: 30000 });
    if (!volPaire) volPaire = (await vols(p)) > 0;
    check('les paires trouvées s’envolent vers le score', volPaire);
    check('fin de partie célébrée par la coque (gagnants() fourni)', /paire/.test(await p.textContent('#end-detail')) &&
      (await p.textContent('#end-titre')).length > 0);
    await quitter(p);

    console.log('--- Memory : petit écran 360×640, défi du jour ---');
    const q = await page(360, 640, 'memory360');
    await lancer(q, 'memory', 'hot', { joueurs: 2 });
    await q.waitForSelector('.mem-config');
    check('24 paires désactivées sur un petit écran (cartes trop petites)',
      await q.locator('.mem-taille[data-n="24"][disabled]').count() === 1);
    await q.click('[data-a="defi"]');
    await q.waitForSelector('.mem-board');
    await attendre(800);
    const d2 = await q.evaluate(() => {
      const d = [...document.querySelectorAll('.mem-card')].pop().getBoundingClientRect();
      const t = document.querySelector('.mem-tour').getBoundingClientRect();
      return { n: document.querySelectorAll('.mem-card').length, carte: d.bottom, tour: t.bottom, ih: innerHeight,
        tag: !!document.querySelector('.mem-defi-tag'), taille: d.width };
    });
    check('défi du jour : 18 paires, toute la grille visible à 360×640', d2.n === 36 && d2.tag && d2.carte <= d2.ih && d2.tour <= d2.ih, d2);
    check('cartes assez grandes pour le doigt (≥ 44 px)', d2.taille >= 44, d2.taille);
    await sansDebordement(q, 'grille du défi 360');
    // à deux : un raté fait passer la main
    await q.locator('.mem-card').nth(0).click();
    await attendre(300);
    await q.locator('.mem-card').nth(1).click();
    await attendre(500);
    const tour = await q.textContent('.mem-tour');
    const paire = await q.locator('.mem-card.trouvee').count();
    check('à deux sur un téléphone : on nomme le joueur, et le tour passe après un raté',
      paire ? /Joueur 1 de jouer/.test(tour) : /Joueur 2 de jouer/.test(tour), tour);
    await quitter(q);
    await p.context().close(); await q.context().close();
  }

  /* ============================= PETIT BAC ============================= */
  async function remplir(p, L, cats, faux) {
    // une feuille bien remplie : l'IA laisse des trous, on en tire plusieurs
    const mots = await p.evaluate(([L, c]) => {
      let f = GG.byId.bac._botSheet(L, c, 'difficile');
      for (let k = 0; k < 6; k++) {
        const g = GG.byId.bac._botSheet(L, c, 'difficile');
        f = f.map((m, i) => m || g[i]);
      }
      return f;
    }, [L, cats]);
    const champs = p.locator('input[data-cat]');
    const n = await champs.count();
    for (let i = 0; i < n; i++) {
      const m = faux !== undefined && i === faux ? L + 'zorglubik' : (mots[i] || '');
      if (m) await champs.nth(i).fill(m);
    }
  }
  if (!SEUL || SEUL === 'bac') {
    console.log('--- Petit Bac : une manche en solo (412×780) ---');
    const p = await page(412, 780, 'bac');
    await lancer(p, 'bac', 'solo');
    await p.waitForSelector('.bac-intro');
    check('au moins 20 catégories au choix', await p.locator('.bac-cat-chip').count() >= 20);
    check('durée et nombre de manches réglables', await p.locator('[data-duree]').count() >= 4 && await p.locator('[data-manches]').count() >= 4);
    const vis = await p.evaluate(() => document.querySelector('[data-a="start"]').getBoundingClientRect().bottom <= innerHeight);
    check('bouton « Tirer la lettre » visible sans défiler', vis);
    await sansDebordement(p, 'réglages du Petit Bac 412');
    await p.locator('[data-a="start"]').first().click();
    await p.waitForSelector('.bac-roue');
    await attendre(600);
    const tourne = await p.evaluate(() => /rotate\(-?\d/.test(document.querySelector('.bac-roue').style.transform));
    check('la roue des lettres tourne', tourne);
    await p.waitForSelector('.bac-chrono', { timeout: 6000 });
    await attendre(400);
    const L = (await p.textContent('.bac-lettre')).trim();
    check('lettre révélée au centre du minuteur circulaire', /^[A-Z]$/.test(L), L);
    check('l’arc du minuteur se vide (transition en cours)', await p.evaluate(() =>
      /stroke-dashoffset/.test(document.querySelector('.bac-chrono-arc').style.transition)));
    await remplir(p, L, null, 0);
    await sansDebordement(p, 'feuille de réponses 412');
    await p.locator('.bac-bas [data-a="send"]').click();
    await p.waitForSelector('.bac-res', { timeout: 20000 });
    check('correction dévoilée ligne par ligne', await p.locator('.bac-ligne.cachee').count() >= 3);
    await attendre(3800);
    const refus = await p.evaluate(() => [...document.querySelectorAll('.bac-rep.non')].map(r => ({
      mot: r.querySelector('.bac-mot').textContent, why: (r.querySelector('.bac-why') || {}).textContent || '' })));
    check('chaque réponse refusée dit pourquoi (plus de « refusé » sans raison)', refus.length >= 1 && refus.every(r => r.why.length > 4), refus);
    const vis2 = await p.evaluate(() => document.querySelector('[data-a="start"]').getBoundingClientRect().bottom <= innerHeight);
    check('« Manche suivante » visible sans défiler', vis2);
    const avant = await p.evaluate(() => +document.querySelector('#mini-players .p-score').textContent);
    check('bouton « Contester » sur le refus de l’IA', await p.locator('.bac-contester').count() >= 1);
    await p.locator('.bac-contester').first().click();
    await attendre(600);
    const apres = await p.evaluate(() => +document.querySelector('#mini-players .p-score').textContent);
    check('contestation acceptée : +10 points', apres === avant + 10, [avant, apres]);
    await attendre(700);
    await sansDebordement(p, 'correction 412');
    await quitter(p);

    console.log('--- Petit Bac : 360×640 et « on se passe le téléphone » ---');
    const q = await page(360, 640, 'bacHot');
    await lancer(q, 'bac', 'hot');
    await q.waitForSelector('.bac-intro');
    await sansDebordement(q, 'réglages 360');
    await q.click('[data-preset="nature"]');
    await attendre(150);
    await q.locator('[data-a="start"]').first().click();
    await q.waitForSelector('.bac-pret');
    check('chacun son tour : la lettre reste cachée avant « Découvrir »',
      await q.locator('.bac-lettre, .bac-roue').count() === 0);
    for (let j = 0; j < 2; j++) {
      await passerSiBesoin(q);
      await q.waitForSelector('.bac-pret');
      await attendre(350);
      await q.click('[data-a="go"]');
      await q.waitForSelector('.bac-chrono', { timeout: 6000 });
      await attendre(300);
      const Lh = (await q.textContent('.bac-lettre')).trim();
      await remplir(q, Lh, ['animal', 'plante', 'fruit', 'couleur', 'pays', 'corps'], j === 1 ? 1 : undefined);
      if (!j) await sansDebordement(q, 'feuille 360');
      await q.locator('.bac-bas [data-a="send"]').click();
      await attendre(400);
    }
    await passerSiBesoin(q);
    await q.waitForSelector('.bac-table');
    check('correction collective sur le téléphone', await q.locator('.bac-table .bac-carte').count() === 6);
    if (await q.locator('.bac-non').count()) await q.locator('.bac-non').first().click();
    await q.locator('[data-a="corriger"]').first().click();
    await q.waitForSelector('.bac-res');
    await attendre(3600);
    check('doublons à demi-points expliqués ou refus de la table affiché',
      /refusé par la table|points partagés/.test(await q.textContent('.bac-res')));
    await sansDebordement(q, 'correction 360');
    await quitter(q);
    await p.context().close(); await q.context().close();
  }

  /* ======================= PETIT BAC À TROIS TÉLÉPHONES ======================= */
  if (!SEUL || SEUL === 'reseau') {
    console.log('--- Petit Bac : trois téléphones par le relais local ---');
    const relais = await demarrer(8826);
    const tel = [];
    for (const [nom, w, h] of [['hôte', 412, 780], ['invité 1', 390, 780], ['invité 2', 360, 640]]) {
      const p = await page(w, h, nom);
      await p.evaluate(u => localStorage.setItem('gg-relais', u), relais.url);
      await p.reload();
      await p.waitForSelector('.game-tile');
      tel.push(p);
    }
    const [hote, i1, i2] = tel;
    await hote.click('.game-tile[data-g="bac"]');
    await hote.click('#btn-mini-online');
    await hote.fill('#host-name', 'Loïc');
    await hote.click('#btn-host-create');
    await hote.waitForSelector('#host-step-lobby:not(.hidden)', { timeout: 15000 });
    const code = (await hote.textContent('#host-code-big')).trim();
    for (const [p, nom] of [[i1, 'Manon'], [i2, 'Zoé']]) {
      await p.click('#btn-home-online');
      await p.fill('#online-name', nom);
      await p.fill('#online-code', code);
      await p.click('#btn-online-go');
      await p.waitForSelector('#online-lobby:not(.hidden)', { timeout: 15000 });
    }
    await hote.waitForFunction(() => document.querySelectorAll('.lobby-row').length === 3, null, { timeout: 10000 });
    await hote.click('#btn-host-start');
    for (const p of tel) await p.waitForSelector('.bac-intro', { timeout: 15000 });
    check('les trois téléphones sont dans la partie', true);
    // l'hôte ajoute une catégorie : les invités la voient
    await hote.click('[data-cat="couleur"]');
    await i1.waitForFunction(() => document.querySelectorAll('.bac-cats.lecture .bac-cat-chip').length === 7, null, { timeout: 8000 });
    check('réglages de l’hôte visibles chez les invités (7 catégories)', true);
    await hote.locator('[data-a="start"]').first().click();
    for (const p of tel) await p.waitForSelector('.bac-chrono', { timeout: 10000 });
    await attendre(500);
    const lettres = [];
    for (const p of tel) lettres.push((await p.textContent('.bac-lettre')).trim());
    check('la même lettre sur les trois téléphones', lettres.every(l => l === lettres[0] && /^[A-Z]$/.test(l)), lettres);
    const L = lettres[0];
    const cats = ['prenom', 'animal', 'ville', 'metier', 'fruit', 'objet', 'couleur'];
    await remplir(hote, L, cats, 3);         // l'hôte glisse un mot inventé en « Métier »
    await remplir(i1, L, cats);
    await hote.locator('.bac-bas [data-a="send"]').click();
    await i1.waitForFunction(() => /a fini/.test(document.querySelector('.bac-statuts').textContent), null, { timeout: 8000 });
    check('statut « Loïc a fini » chez les invités', true);
    check('les réponses de l’hôte ne fuient pas chez les invités pendant l’écriture',
      !(await i1.content()).includes(L + 'zorglubik'));
    await i1.locator('.bac-bas [data-a="send"]').click();
    await remplir(i2, L, cats);
    await i2.locator('.bac-bas [data-a="send"]').click();
    for (const p of [i1, i2]) await p.waitForSelector('.bac-vote', { timeout: 10000 });
    // les deux invités refusent le mot inventé de l'hôte
    for (const p of [i1, i2]) {
      const non = p.locator('.bac-carte').filter({ hasText: 'Loïc' }).locator('.bac-non');
      if (await non.count()) await non.first().click();
      await p.locator('.bac-bas [data-a="vote"]').click();
    }
    for (const p of tel) await p.waitForSelector('.bac-res', { timeout: 15000 });
    await attendre(4200);
    const txt = await hote.textContent('.bac-res');
    check('mot inventé refusé à la majorité, et on sait par qui', /refusé par Manon et Zoé/.test(txt), txt.slice(0, 200));
    const scores = [];
    for (const p of tel) scores.push(await p.evaluate(() => [...document.querySelectorAll('#mini-players .p-score')].map(e => e.textContent).join(',')));
    check('mêmes scores sur les trois téléphones', scores.every(s => s === scores[0]), scores);
    for (const p of tel) await sansDebordement(p, 'correction réseau ' + (await p.evaluate(() => innerWidth)));
    for (const p of tel) await p.context().close();
    await relais.arreter();
  }

  /* ============================ SÉCURITÉ ============================ */
  if (!SEUL || SEUL === 'securite') {
    console.log('--- Sécurité : un hôte malveillant ne peut rien injecter (bug 1) ---');
    const p = await page(412, 780, 'secu');
    const r = await p.evaluate(() => {
      const X = '<img src=x onerror="window.__xss=1">';
      const zone = document.createElement('div');
      zone.id = 'bac-sandbox';
      document.body.appendChild(zone);
      const rien = () => true;
      const res = {};
      // Petit Bac : lettre, noms, réponses, catégories piégés, à chaque phase
      const bac = GG.byId.bac;
      const base = bac.create([X, 'B' + X, 'C']);
      const phases = ['intro', 'answers', 'vote', 'result'];
      phases.forEach(ph => {
        const s = JSON.parse(JSON.stringify(base));
        s.phase = ph; s.letter = X; s.round = 1; s.catIds = ['prenom', X, 'animal']; s.cats = [X, X, X];
        s.answers = { 0: [X, X, X], 1: [X, X, X], 2: [X, X, X] }; s.submitted = [true, true, false]; s.voted = [false, false, false];
        s.results = [[{ ans: X, pts: 0, why: 'vote', par: [1], ia: false }, { ans: X, pts: 5, why: 'doublon', avec: [1] }, { ans: X, pts: 10 }],
          [{ ans: X, pts: 0, why: 'lettre' }, { ans: X, pts: 0, why: 'vide' }, { ans: X, pts: 10 }],
          [{ ans: X, pts: 0, why: 'table' }, { ans: X, pts: 0, why: 'court' }, { ans: X, pts: 0, why: 'vote', ia: true }]];
        s.gains = [15, 10, 0]; s.used = [X];
        bac.render(zone, { state: s, me: 2, mode: 'guest', act: rien });
        res['bac ' + ph] = zone.querySelectorAll('img, script').length;
      });
      // Memory : l'image d'une carte et les noms venus de l'hôte
      const mem = GG.byId.memory;
      const m = mem.create([X, 'B']);
      m.pret = true; m.theme = X; m.cards[0].e = X; m.cards[0].matched = true; m.cards[1].e = X; m.up = [1];
      mem.render(zone, { state: m, me: 1, mode: 'guest', act: rien });
      res.memory = zone.querySelectorAll('img, script').length;
      // 8 américain : cartes, couleur demandée et noms piégés
      const huit = GG.byId.huit;
      const h = huit.redact(huit.create([X, 'B' + X, 'C']), 1);
      h.discard = [{ r: X, s: X }]; h.dessous = [{ r: X, s: X }]; h.chosenSuit = X; h.lastMsg = X;
      h.players[1].hand.push({ r: X, s: '♠' });
      huit.render(zone, { state: h, me: 1, mode: 'guest', act: rien });
      res.huit = zone.querySelectorAll('img, script').length;
      h.finished = true; h.winner = 0; h.detail = [0, 3, 4];
      h.players.forEach(pl => { pl.hand = [{ r: X, s: X }]; });
      huit.render(zone, { state: h, me: 1, mode: 'guest', act: rien });
      res['huit fin'] = zone.querySelectorAll('img, script').length;
      // Champs censés être des nombres (scores, manche, pénalité, essais…) piégés eux aussi,
      // au rendu comme dans le récapitulatif final (que l'invité calcule avec l'état de l'hôte)
      const compte = html => { const d = document.createElement('div'); d.innerHTML = html; return d.querySelectorAll('img, script').length; };
      const hn = huit.redact(huit.create(['A', 'B']), 1);
      hn.manche = X; hn.pending2 = X; hn.pileCount = X; hn.lastGain = X;
      hn.players.forEach(pl => { pl.score = X; pl.cards = X; });
      huit.render(zone, { state: hn, me: 1, mode: 'guest', act: rien });
      res['huit nombres'] = zone.querySelectorAll('img, script').length + compte(huit.summary(hn));
      const mn = mem.create(['A', 'B']);
      mn.pret = true; mn.durationSec = X; mn.players.forEach(pl => { pl.pairs = X; pl.tries = X; });
      mem.render(zone, { state: mn, me: 1, mode: 'guest', act: rien });
      res['memory nombres'] = zone.querySelectorAll('img, script').length + compte(mem.summary(mn));
      ['intro', 'answers', 'result'].forEach(ph => {
        const bn = bac.create(['A', 'B']);
        bn.phase = ph; bn.letter = 'M'; bn.round = X; bn.maxRounds = X; bn.duration = X;
        bn.players.forEach(pl => { pl.score = X; }); bn.gains = [X, X]; bn.scoreAvant = [X, X];
        if (ph === 'result') bn.results = [bn.cats.map(() => ({ ans: 'Marc', pts: X })), bn.cats.map(() => ({ ans: '', pts: X, why: 'vide' }))];
        bac.render(zone, { state: bn, me: 1, mode: 'guest', act: rien });
        res['bac nombres ' + ph] = zone.querySelectorAll('img, script').length + compte(bac.summary(bn));
      });
      zone.remove();
      return res;
    });
    await attendre(300);
    const xss = await p.evaluate(() => window.__xss);
    check('lettre, noms, réponses, cartes, nombres piégés : aucune balise créée, aucun code exécuté',
      Object.values(r).every(n => n === 0) && xss === undefined, r);
    await p.context().close();
  }

  /* ============================ FLUIDITÉ ============================ */
  if (!SEUL || SEUL === 'fluidite') {
    console.log('--- Fluidité : processeur ralenti ×4 ---');
    const p = await page(412, 780, 'fluidite');
    // Les aurores de la coque (calques flous animés) et le flou de l'en-tête
    // coûtent à eux seuls ~100 ms par image dans ce Chromium sans GPU, même sans
    // ralentissement : on les neutralise pour mesurer NOS animations (signalé à la coque).
    const neutre = 'body::before, body::after { display: none !important; } ' +
      '#screen-mini > header, .overlay { -webkit-backdrop-filter: none !important; backdrop-filter: none !important; }';
    await p.addStyleTag({ content: neutre });
    const cdp = await p.context().newCDPSession(p);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    // le coût de NOS rendus, mesuré à la source (la cadence d'images dépend
    // aussi de la charge de la machine de test, partagée)
    await p.evaluate(() => {
      window.__rendus = [];
      ['huit', 'memory', 'bac'].forEach(id => {
        const m = GG.byId[id], r = m.render;
        m.render = function (el, ctx) {
          const t = performance.now();
          r.call(m, el, ctx);
          // les deux premiers rendus d'un jeu sont un « échauffement » (polices,
          // styles, premier vol) : comptés à part
          const n = window.__rendus.filter(x => x.id === id).length;
          window.__rendus.push({ id, ms: performance.now() - t, premier: n < 2 });
        };
      });
    });
    async function mesurer(jeu, action, ms) {
      await p.evaluate(() => {
        window.__im = [];
        let t0 = performance.now();
        (function f(t) { window.__im.push(t - t0); t0 = t; window.__rafM = requestAnimationFrame(f); })(t0);
      });
      await action();
      await attendre(ms);
      return p.evaluate(jeu => {
        cancelAnimationFrame(window.__rafM);
        const im = window.__im.slice(2).sort((a, b) => a - b);
        const siens = window.__rendus.filter(r => r.id === jeu);
        const suite = siens.filter(r => !r.premier).map(r => r.ms).sort((a, b) => a - b);
        const prem = siens.filter(r => r.premier).map(r => r.ms);
        return {
          images: im.length, moyenne: +(im.reduce((a, b) => a + b, 0) / im.length).toFixed(1), p95: +im[Math.floor(im.length * 0.95)].toFixed(1),
          rendus: suite.length, renduP90: suite.length ? +suite[Math.floor(suite.length * 0.9)].toFixed(1) : 0,
          renduMax: suite.length ? +suite[suite.length - 1].toFixed(1) : 0,
          renduMoy: suite.length ? +(suite.reduce((a, b) => a + b, 0) / suite.length).toFixed(1) : 0,
          echauffement: prem.length ? +Math.max.apply(null, prem).toFixed(1) : 0
        };
      }, jeu);
    }
    const huit = await mesurer('huit', async () => {
      await lancer(p, 'huit', 'solo', { bots: 3 });
      await p.waitForSelector('.hu-main .ha-card');
      await attendre(2000);
      for (let k = 0; k < 3; k++) {
        await p.waitForSelector('.hu-tour.moi', { timeout: 15000 }).catch(() => {});
        if (await p.locator('.hu-main .ha-card.ok').count()) {
          await toucher(p, '.hu-main .ha-card.ok', 0);
          await attendre(100);
          if (await p.locator('.hu-roue').count()) await p.locator('.ha-suit-btn').first().click();
        } else {
          await p.click('[data-a="draw"]');
          await attendre(150);
          if (await p.locator('[data-a="pass"]').count()) await p.click('[data-a="pass"]');
        }
        await attendre(400);
      }
    }, 1500);
    check('8 américain ×4 : mises à jour de la table < 50 ms (9 sur 10), cadence moyenne < 60 ms', huit.renduP90 < 50 && huit.moyenne < 60, huit);
    await quitter(p);
    const mem = await mesurer('memory', async () => {
      await lancer(p, 'memory', 'hot');
      await p.waitForSelector('.mem-config');
      await p.click('.mem-taille[data-n="24"]');
      await p.click('[data-a="go"]');
      await p.waitForSelector('.mem-board');
      await attendre(700);
      for (let i = 0; i < 8; i++) { await p.locator('.mem-card').nth(i).click(); await attendre(300); }
    }, 1200);
    check('Memory ×4 (48 cartes) : un retournement ne coûte que quelques ms de rendu (mise à jour en place)',
      mem.renduP90 < 25 && mem.moyenne < 60, mem);
    await quitter(p);
    const bacM = await mesurer('bac', async () => {
      await lancer(p, 'bac', 'solo');
      await p.waitForSelector('.bac-intro');
      await p.locator('[data-a="start"]').first().click();
      await p.waitForSelector('.bac-chrono', { timeout: 8000 });
      await p.locator('input[data-cat]').first().fill('Test');
    }, 1500);
    check('Petit Bac ×4 : roue, minuteur et saisie fluides (cadence moyenne < 60 ms)', bacM.moyenne < 60, bacM);
    await p.context().close();
  }

  await browser.close();
  console.log(failures ? '\n' + failures + ' ÉCHEC(S)' : '\nTests V2 (8 américain, Memory, Petit Bac) OK.');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
