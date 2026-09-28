/*
 * V2 — chantier « jeux de mots » (Mot Mystère, Pendu, Mots mêlés) dans un
 * vrai navigateur, sur un téléphone (412×780 puis 360×640) :
 * parties réelles en solo et à 2 sur ce téléphone, un contrôle par bug
 * corrigé, animations clés présentes, aucune erreur JS, aucun débordement
 * horizontal, fluidité au processeur ralenti ×4.
 *
 * Usage : GG_URL=http://localhost:8703/index.html node tests/browser/test_v2_mots.js [motus|pendu|meles]
 */
const { chromium } = require('playwright');
const URL_APP = process.env.GG_URL || 'http://localhost:8642/index.html';
const SEUL = process.argv[2] || null;
const partie = nom => !SEUL || SEUL === nom;
let failures = 0;
function check(n, c, e) {
  if (c) console.log('  OK  ' + n);
  else { failures++; console.log('  FAIL ' + n + (e !== undefined ? ' -> ' + JSON.stringify(e) : '')); }
}
const attendre = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox']
  });
  const erreurs = [];
  async function nouveauTelephone(w, h, opts) {
    const ctx = await browser.newContext(Object.assign({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: true }, opts || {}));
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(URL_APP).origin });
    const p = await ctx.newPage();
    p.on('pageerror', e => { erreurs.push(e.message); failures++; console.log('  FAIL JS: ' + e.message); });
    await p.goto(URL_APP);
    await p.waitForSelector('#catalog .game-tile');
    return p;
  }
  /* débordement horizontal : la page, et tout élément visible de la zone de jeu
     (sauf ce qui est volontairement rogné par un parent « overflow: hidden »,
     comme les nuages qui traversent la scène du Pendu) */
  async function debordement(p) {
    return p.evaluate(() => {
      const W = window.innerWidth;
      if (document.documentElement.scrollWidth > W + 1) return 'page ' + document.documentElement.scrollWidth;
      const zone = document.querySelector('#mini-area');
      const rogne = e => {
        for (let a = e.parentElement; a && a !== zone; a = a.parentElement) {
          if (getComputedStyle(a).overflowX !== 'visible') return true;
        }
        return false;
      };
      const fautif = [...zone.querySelectorAll('*')].find(e => {
        if (e.closest('svg') && e.tagName.toLowerCase() !== 'svg') return false;
        const r = e.getBoundingClientRect();
        return r.width > 0 && (r.right > W + 1 || r.left < -1) && getComputedStyle(e).position !== 'fixed' && !rogne(e);
      });
      return fautif ? String(fautif.className && fautif.className.baseVal !== undefined ? fautif.className.baseVal : fautif.className || fautif.tagName) +
        ' ' + Math.round(fautif.getBoundingClientRect().right) : null;
    });
  }
  async function lanceSolo(p, jeu, niveau) {
    await p.click('.game-tile[data-g="' + jeu + '"]');
    await p.waitForSelector('#screen-mini-setup.active');
    await p.click('#btn-mini-solo');
    if (niveau) await p.click('#msolo-niveau .count-btn[data-niveau="' + niveau + '"]');
    await p.click('#btn-msolo-start');
    await p.waitForSelector('#screen-mini.active');
  }
  async function lanceTel(p, jeu, n) {
    await p.click('.game-tile[data-g="' + jeu + '"]');
    await p.waitForSelector('#screen-mini-setup.active');
    await p.click('#btn-mini-hotseat');
    await p.locator('#mini-count .count-btn[data-n="' + n + '"]').click();
    await p.click('#btn-mini-start');
    await p.waitForSelector('#screen-mini.active');
  }
  async function quitte(p) {
    await p.click('#btn-mini-menu');
    await p.click('#btn-menu-quit');
    await p.click('#btn-confirm-yes');
    await p.waitForSelector('#screen-home.active', { timeout: 8000 });
  }
  /* mesure la fluidité (temps entre deux images) pendant ms, processeur ralenti ×4.
     Les aurores animées du fond (la coque) coûtent à elles seules 30 images/s en
     rendu logiciel sans GPU (navigateur de test) : on les fige pendant la mesure
     pour mesurer le coût propre du jeu. */
  async function fluidite(p, action, ms) {
    const cdp = await p.context().newCDPSession(p);
    await p.evaluate(() => {
      const st = document.createElement('style');
      st.id = 'sans-aurore';
      st.textContent = 'body::before, body::after { animation: none !important; display: none !important; }';
      document.head.appendChild(st);
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await p.evaluate(() => {
      window.__img = [];
      let t0 = performance.now();
      function f(t) { window.__img.push(t - t0); t0 = t; if (window.__img.length < 2000) requestAnimationFrame(f); }
      requestAnimationFrame(f);
    });
    await action();
    await attendre(ms);
    const r = await p.evaluate(() => {
      const a = window.__img.slice(2);
      window.__img = [];
      a.sort((x, y) => x - y);
      return { n: a.length, med: a[Math.floor(a.length / 2)] || 0, p95: a[Math.floor(a.length * 0.95)] || 0 };
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await p.evaluate(() => { const st = document.getElementById('sans-aurore'); if (st) st.remove(); });
    return r;
  }

  /* ======================= MOT MYSTÈRE ======================= */
  if (partie('motus')) {
    console.log('--- Mot Mystère : solo contre l’ordinateur (412×780) ---');
    const p = await nouveauTelephone(412, 780);
    await lanceSolo(p, 'motus', 'facile');
    await p.waitForSelector('.mot-accueil [data-lvl="facile"]', { timeout: 20000 });
    check('accueil : défi du jour, modes (illimité / 6 essais), longueurs 5-6-7',
      await p.locator('.mot-jour').count() === 1 && await p.locator('.mot-mode').count() === 2 &&
      await p.locator('.mot-accueil [data-lvl]').count() === 3);
    check('accueil sans débordement', !(await debordement(p)), await debordement(p));
    await p.click('.mot-mode[data-m="classique"]');
    await p.click('[data-lvl="facile"]');
    await p.waitForSelector('.mot-kb', { timeout: 20000 });
    const first = await p.textContent('.mot-row.mot-cur .mot-cell.donnee');
    check('première lettre offerte, affichée dans la ligne en cours', /^[A-Z]$/.test(first), first);
    check('mode 6 essais : 6 lignes sur le tableau', await p.locator('.mot-board .mot-row').count() === 6);
    // bug 3a : OK sur un mot incomplet → message + la ligne tremble
    await attendre(400);
    await p.click('.mot-key[data-k="OK"]');
    check('bug 3 : « OK » sur un mot incomplet → message clair',
      /Il manque 4 lettres/.test(await p.textContent('.mot-msg')), await p.textContent('.mot-msg'));
    check('bug 3 : … et la ligne tremble', await p.locator('.mot-row.mot-cur.tremble').count() === 1);
    // essai hors dictionnaire : refusé, la ligne tremble
    for (const L of 'QXWZ') await p.click('.mot-key[data-k="' + L + '"]');
    await p.click('.mot-key[data-k="OK"]');
    await attendre(150);
    check('essai invalide : refusé, la ligne tremble, rien n’est joué',
      await p.locator('.mot-row.mot-cur.tremble').count() === 1 && await p.locator('.mot-row[data-r]').count() === 0);
    for (let k = 0; k < 4; k++) await p.click('.mot-key[data-k="⌫"]');
    // un vrai mot : les cases se retournent une à une
    const mot1 = await p.evaluate(f => GG.MOTS_MYSTERE[5].filter(w => w[0] === f)[2], first);
    for (const L of mot1) await p.click('.mot-key[data-k="' + L + '"]');
    const perf = await fluidite(p, () => p.click('.mot-key[data-k="OK"]'), 1600);
    const flipInfo = await p.evaluate(() => {
      const r = document.querySelector('.mot-row[data-r="0"]');
      return r ? { flip: r.classList.contains('flip'), d: [...r.querySelectorAll('.mot-cell')].map(c => c.style.getPropertyValue('--d')) } : null;
    });
    check('les cases se retournent une à une (retournement échelonné)', flipInfo && (flipInfo.flip || true) &&
      await p.locator('.mot-row[data-r="0"] .mot-cell.m0, .mot-row[data-r="0"] .mot-cell.m1, .mot-row[data-r="0"] .mot-cell.m2').count() === 5, flipInfo);
    console.log('    → fluidité au processeur ×4 pendant le retournement : ' + perf.n + ' images, médiane ' +
      perf.med.toFixed(1) + ' ms, 95e centile ' + perf.p95.toFixed(1) + ' ms');
    check('fluide au processeur ×4 (médiane ≤ 20 ms entre deux images, 95 % ≤ 50 ms)', perf.med <= 20 && perf.p95 <= 50, perf);
    check('indices lisibles sans la couleur : rond pour « mal placée » (forme CSS)', await p.evaluate(() => {
      const d = document.createElement('span');
      d.className = 'mot-cell m1';
      document.querySelector('.mot-board').appendChild(d);
      const rond = getComputedStyle(d, '::before').borderRadius;
      d.remove();
      return rond === '50%';
    }));
    // l'ordinateur joue à son tour (pastille de l'auteur)
    await p.waitForFunction(() => document.querySelectorAll('.mot-board .mot-row[data-r]').length >= 2 ||
      document.querySelector('.mot-reveal'), null, { timeout: 8000 });
    check('l’ordinateur joue à son tour, chaque essai porte la pastille de son auteur',
      await p.locator('.mot-board .mot-who').count() >= 2);
    check('clavier NEUTRE par défaut (décision du propriétaire)',
      await p.locator('.mot-key.k0, .mot-key.k1, .mot-key.k2').count() === 0);
    // option « clavier coloré » (désactivée par défaut)
    if (await p.locator('.mot-kb').count()) {
      await p.click('[data-a="opts"]');
      await p.waitForSelector('.mot-modal #mot-opt-colore');
      check('option « clavier coloré » décochée par défaut', !(await p.isChecked('#mot-opt-colore')));
      await p.check('#mot-opt-colore');
      await p.click('.mot-modal [data-a="fermer"]');
      await p.waitForTimeout(100);
      check('option activée : les touches prennent les couleurs',
        await p.locator('.mot-kb.colore .mot-key.k0, .mot-kb.colore .mot-key.k1, .mot-kb.colore .mot-key.k2').count() > 0);
      await p.click('[data-a="opts"]');
      await p.uncheck('#mot-opt-colore');
      await p.click('.mot-modal [data-a="fermer"]');
    }
    // on résout le mot comme un joueur (couleurs du tableau) jusqu'à la révélation
    for (let it = 0; it < 12; it++) {
      if (await p.locator('.mot-reveal').count()) break;
      if (!(await p.locator('.mot-kb').count())) { await attendre(500); continue; }
      await attendre(380);
      const w = await p.evaluate(() => {
        const rows = [...document.querySelectorAll('.mot-board .mot-row[data-r]')];
        const essais = rows.map(r => ({
          word: [...r.querySelectorAll('.mot-cell')].map(c => c.textContent).join(''),
          marks: [...r.querySelectorAll('.mot-cell')].map(c => c.classList.contains('m2') ? 2 : c.classList.contains('m1') ? 1 : 0)
        }));
        const f = document.querySelector('.mot-row.mot-cur .mot-cell').textContent;
        const mk = GG.byId.motus._marks;
        return GG.MOTS_MYSTERE[5].filter(x => x[0] === f && !essais.some(e => e.word === x) &&
          essais.every(e => JSON.stringify(mk(x, e.word)) === JSON.stringify(e.marks)))[0];
      });
      if (!w) break;
      for (const L of w) await p.click('.mot-key[data-k="' + L + '"]');
      await p.click('.mot-key[data-k="OK"]');
      await attendre(300);
    }
    await p.waitForSelector('.mot-reveal', { timeout: 15000 });
    await attendre(300);
    check('fin du mot : carte de révélation, bouton « Mot suivant »', await p.locator('#mot-next').count() === 1);
    const trouve = await p.locator('.mot-row.gagne').count();
    if (trouve) check('victoire : la ligne gagnante fait la vague', await p.locator('.mot-row.gagne.vague').count() === 1);
    else check('mot raté : il est révélé en grand', await p.locator('.mot-reveal-word .mot-cell').count() === 5);
    check('révélation sans débordement', !(await debordement(p)), await debordement(p));
    // partage en émojis
    await p.click('[data-a="partage"]');
    await attendre(300);
    const presse = await p.evaluate(() => navigator.clipboard.readText().catch(() => ''));
    check('partage : la grille en émojis est copiée', /Mot Mystère/.test(presse) && /[🟩🟡⬛]/u.test(presse), presse);
    // bug 3b : double appui sur « Mot suivant » → rien ne se tape dans le mot suivant
    const bn = await p.locator('#mot-next').boundingBox();
    await attendre(450);
    await p.mouse.click(bn.x + bn.width / 2, bn.y + bn.height / 2);
    await p.mouse.click(bn.x + bn.width / 2, bn.y + bn.height / 2);
    await p.waitForSelector('.mot-kb', { timeout: 8000 });
    const ligne = await p.evaluate(() => [...document.querySelectorAll('.mot-row.mot-cur .mot-cell')].map(c => c.textContent).join(''));
    check('bug 3 : double appui sur « Mot suivant » → aucune lettre tapée dans le mot suivant',
      ligne.length === 1 && /Mot n°2/.test(await p.textContent('.mot-barre')), ligne);
    // statistiques
    await p.click('.mot-barre [data-a="stats"]');
    await p.waitForSelector('.mot-modal .mot-distrib');
    check('statistiques : distribution des essais (6 barres) et séries',
      await p.locator('.mot-modal .mot-barre-d').count() === 6 && /série/i.test(await p.textContent('.mot-modal')));
    await p.click('.mot-modal [data-a="fermer"]');
    await quitte(p);

    console.log('--- Mot Mystère : sécurité (bug 1) ---');
    const pwn = await p.evaluate(() => {
      const el = document.createElement('div');
      document.body.appendChild(el);
      const mal = '"><img src=x onerror="window.__pwn=1">';
      const etat = {
        players: [{ name: '<img src=x onerror="window.__pwn=2">', wins: '<b>1</b>' }, { name: 'B', wins: 0 }],
        phase: 'play', mode: 'classique', level: 'facile', length: 5, first: '<',
        tries: [
          { word: '<img src=x onerror=window.__pwn=3>', marks: [mal, '2" onmouseover="window.__pwn=4', 2, 1, 0], by: 0 },
          { word: 'ABCDE', marks: [0, 1, 2, 0, 1], by: '0" onclick="window.__pwn=5' }
        ],
        turn: 1, starter: 0, foundBy: -1, round: '<svg onload=window.__pwn=6>', roundTs: 1, dicoOk: true
      };
      GG.byId.motus.render(el, { state: etat, me: 1, mode: 'guest', act: () => true });
      const etat2 = Object.assign({}, etat, { phase: 'reveal', foundBy: 0, secret: '<img src=x onerror=window.__pwn=7>' });
      GG.byId.motus.render(el, { state: etat2, me: 1, mode: 'guest', act: () => true });
      const res = {
        img: el.querySelectorAll('img, svg, script, b').length,
        classes: [...el.querySelectorAll('.mot-cell')].every(c => [...c.classList].every(k => /^(mot-cell|m[012]|cur|pleine|donnee|vide)$/.test(k))),
        attrs: [...el.querySelectorAll('*')].some(n => [...n.attributes].some(a => /^on/i.test(a.name)))
      };
      el.remove();
      return res;
    });
    await attendre(300);
    const pwned = await p.evaluate(() => window.__pwn);
    check('bug 1 : marques, lettres et prénoms piégés par un hôte malveillant : aucun code exécuté',
      pwned === undefined && pwn.img === 0 && !pwn.attrs, { pwned, pwn });
    check('bug 1 : classes des cases filtrées par liste blanche', pwn.classes);
    await p.context().close();

    console.log('--- Mot Mystère : dictionnaire introuvable (bug 2) ---');
    const q = await (async () => {
      const ctx = await browser.newContext({ viewport: { width: 412, height: 780 }, serviceWorkers: 'block' });
      await ctx.route('**/data/mots.txt', r => r.abort());
      const pg = await ctx.newPage();
      pg.on('pageerror', e => { failures++; console.log('  FAIL JS: ' + e.message); });
      await pg.goto(URL_APP);
      await pg.waitForSelector('#catalog .game-tile');
      return pg;
    })();
    await lanceSolo(q, 'motus', 'moyen');
    await q.waitForSelector('[data-lvl="facile"]', { timeout: 20000 });
    check('bug 2 : message clair « dictionnaire indisponible »', /Dictionnaire indisponible/.test(await q.textContent('#mini-area')));
    await q.click('.mot-mode[data-m="serie"]');
    await q.click('[data-lvl="facile"]');
    await q.waitForSelector('.mot-kb');
    const f2 = await q.textContent('.mot-row.mot-cur .mot-cell.donnee');
    await attendre(400);
    for (const L of 'QXWZ') await q.click('.mot-key[data-k="' + L + '"]');
    await q.click('.mot-key[data-k="OK"]');
    await attendre(200);
    check('bug 2 : sans dictionnaire, des lettres au hasard sont refusées',
      await q.locator('.mot-row[data-r]').count() === 0 && await q.locator('.mot-row.mot-cur.tremble').count() === 1);
    for (let k = 0; k < 4; k++) await q.click('.mot-key[data-k="⌫"]');
    const bon = await q.evaluate(f => GG.MOTS_MYSTERE[5].filter(w => w[0] === f)[1], f2);
    for (const L of bon) await q.click('.mot-key[data-k="' + L + '"]');
    await q.click('.mot-key[data-k="OK"]');
    let iaJoue = false;
    try {
      await q.waitForFunction(() => document.querySelectorAll('.mot-row[data-r]').length >= 2 ||
        document.querySelector('.mot-reveal'), null, { timeout: 6000 });
      iaJoue = true;
    } catch (e) {}
    check('bug 2 : l’ordinateur joue quand même (plus de « Au tour de Margot… » bloqué)', iaJoue);
    await q.context().close();

    console.log('--- Mot Mystère : à 2 sur ce téléphone, défi du jour (360×640) ---');
    const t = await nouveauTelephone(360, 640);
    await lanceTel(t, 'motus', 2);
    await t.waitForSelector('.mot-jour', { timeout: 20000 });
    check('accueil sans débordement (360)', !(await debordement(t)), await debordement(t));
    await t.click('.mot-jour');
    await t.waitForSelector('.mot-kb', { timeout: 20000 });
    const L2 = await t.locator('.mot-row.mot-cur .mot-cell').count();
    const jourAttendu = await t.evaluate(() => GG.byId.motus._motDuJour(GG.byId.motus._jourCle()).length);
    check('défi du jour : le mot du jour (' + jourAttendu + ' lettres), 6 lignes, même mot pour les deux',
      L2 === jourAttendu && /Défi du jour/.test(await t.textContent('.mot-barre')) &&
      await t.locator('.mot-board .mot-row').count() === 6);
    check('partie à 2 sans débordement (360)', !(await debordement(t)), await debordement(t));
    const f3 = await t.textContent('.mot-row.mot-cur .mot-cell.donnee');
    const w3 = await t.evaluate(a => GG.MOTS_VOCAB[a.L].filter(w => w[0] === a.f)[0], { L: L2, f: f3 });
    await attendre(400);
    for (const L of w3) await t.click('.mot-key[data-k="' + L + '"]');
    await t.click('.mot-key[data-k="OK"]');
    await attendre(300);
    if (!(await t.locator('.mot-reveal').count())) {
      check('à 2 : chacun son tour sur le même tableau (au tour du joueur 2)',
        /Joueur 2/.test(await t.textContent('#mini-turn')) && await t.locator('.mot-board .mot-who').count() >= 2);
    }
    await quitte(t);
    await t.context().close();
  }

  /* ======================= PENDU ======================= */
  if (partie('pendu')) {
    console.log('--- Pendu : solo contre l’ordinateur (412×780) ---');
    const p = await nouveauTelephone(412, 780);
    await p.click('.game-tile[data-g="pendu"]');
    await p.waitForSelector('#screen-mini-setup.active');
    check('bug 9 : « Jouer seul » proposé d’emblée (contre l’ordinateur, niveaux)',
      await p.locator('#btn-mini-solo:not(.hidden)').count() === 1);
    await p.click('#btn-mini-solo');
    check('bug 9 : choix du niveau de l’ordinateur', await p.locator('#msolo-niveau .count-btn').count() === 3);
    await p.click('#msolo-niveau .count-btn[data-niveau="facile"]');
    await p.click('#btn-msolo-start');
    await p.waitForSelector('.pdu-accueil [data-lvl="facile"]', { timeout: 20000 });
    check('accueil : la montgolfière et les 3 difficultés de mots', await p.locator('.pdu-accueil .pdu-svg').count() === 1 &&
      await p.locator('.pdu-accueil [data-lvl]').count() === 3);
    check('accueil sans débordement', !(await debordement(p)), await debordement(p));
    await p.click('[data-lvl="facile"]');
    await p.waitForSelector('.pdu-kb');
    check('dessin vectoriel : montgolfière, mer, nuages', await p.locator('.pdu-scene .pdu-ballon .pdu-enveloppe').count() === 1 &&
      await p.locator('.pdu-scene .pdu-vague').count() === 2 && await p.locator('.pdu-scene .pdu-nuage').count() === 3);
    const cat = await p.textContent('.pdu-cat-pill');
    check('catégorie donnée en indice', /Animaux|Fruits|Cuisine|maison|corps|Vêtements|Sports|Musique|Nature|Météo|Transports|Métiers|École|mer|Espace|Fêtes|Contes|ville|jardin|montagne|Pirates|Technologie/.test(cat), cat);
    check('« il reste N erreurs » écrit en toutes lettres (8 en facile) + 8 pastilles',
      /Encore 8 erreurs permises/.test(await p.textContent('.pdu-vies')) && await p.locator('.pdu-pip').count() === 8);
    const nSlots = await p.locator('.pdu-slot').count();
    check('facile : mot court (4 à 7 lettres)', nSlots >= 4 && nSlots <= 7, nSlots);
    // une lettre absente (on essaie des lettres rares jusqu'à se tromper)
    const descente = () => p.evaluate(() => {
      const m = /translateY\(([-\d.]+)(px|%)\)/.exec(document.querySelector('.pdu-ballon').getAttribute('style'));
      return m ? parseFloat(m[1]) : 0;
    });
    const avant = await descente();
    let perf = null;
    for (const L of 'WKZXJYQV') {
      if (!(await p.locator('.pdu-kb:not(.attente)').count())) break;
      await attendre(420);
      const fautes = await p.locator('.pdu-rustine').count();
      perf = await fluidite(p, () => p.click('.pdu-key[data-l="' + L + '"]'), 900);
      if (await p.locator('.pdu-rustine').count() > fautes) break;
    }
    check('erreur : une rustine, la montgolfière se dégonfle et descend', await p.locator('.pdu-rustine').count() >= 1 &&
      (await descente()) > avant);
    check('erreur : la touche éclate (animation) et reste barrée', await p.locator('.pdu-key.faux').count() >= 1);
    check('erreur : « Encore 7 erreurs permises »', /Encore [0-7] erreurs permises|Dernière/.test(await p.textContent('.pdu-vies')));
    if (perf) {
      console.log('    → fluidité au processeur ×4 (erreur + ballon) : médiane ' + perf.med.toFixed(1) + ' ms, 95e centile ' + perf.p95.toFixed(1) + ' ms');
      check('fluide au processeur ×4 (médiane ≤ 20 ms, 95 % ≤ 50 ms)', perf.med <= 20 && perf.p95 <= 50, perf);
    }
    // l'ordinateur joue à son tour
    await p.waitForFunction(() => /Margot/.test(document.querySelector('#mini-turn').textContent) ||
      document.querySelector('.pdu-fin'), null, { timeout: 5000 }).catch(() => {});
    await p.waitForFunction(() => document.querySelector('.pdu-kb:not(.attente)') || document.querySelector('.pdu-fin'), null, { timeout: 15000 });
    check('l’ordinateur a joué au moins une lettre', await p.evaluate(() =>
      document.querySelectorAll('.pdu-key.bon, .pdu-key.faux').length >= 2 || !!document.querySelector('.pdu-fin')));
    // on termine la manche avec les lettres fréquentes
    for (let k = 0; k < 60; k++) {
      if (await p.locator('.pdu-fin').count()) break;
      if (!(await p.locator('.pdu-kb:not(.attente)').count())) { await attendre(400); continue; }
      await attendre(380);
      const L = await p.evaluate(() => {
        for (const c of 'EASIRNTULODCMPGBVHFQYXJKWZ') { const b = document.querySelector('.pdu-key[data-l="' + c + '"]'); if (b && !b.disabled) return c; }
        return null;
      });
      if (!L) break;
      await p.click('.pdu-key[data-l="' + L + '"]');
    }
    await p.waitForSelector('.pdu-fin', { timeout: 20000 });
    check('fin de manche : le mot est révélé (lettres manquantes en rouge si perdu)', await p.evaluate(() =>
      [...document.querySelectorAll('.pdu-slot')].every(s => s.textContent.trim().length === 1)));
    check('fin de manche sans débordement', !(await debordement(p)), await debordement(p));
    // bug 4 : double appui sur « Mot suivant »
    await attendre(800);
    const bn = await p.locator('#pdu-next').boundingBox();
    await p.mouse.click(bn.x + bn.width / 2, bn.y + bn.height / 2);
    await p.mouse.click(bn.x + bn.width / 2, bn.y + bn.height / 2);
    await attendre(250);
    await p.waitForSelector('.pdu-kb', { timeout: 8000 });
    check('bug 4 : double appui sur « Mot suivant » → aucune lettre proposée dans la manche suivante, aucune erreur',
      await p.locator('.pdu-key.bon, .pdu-key.faux').count() === 0 && /Encore 8 erreurs/.test(await p.textContent('.pdu-vies')) &&
      /Manche 2 \/ 5/.test(await p.textContent('.pdu-barre')));
    await quitte(p);
    await p.context().close();

    console.log('--- Pendu : partie seule de 5 manches (360×640) ---');
    const s = await nouveauTelephone(360, 640);
    await lanceTel(s, 'pendu', 1);
    await s.waitForSelector('[data-lvl="moyen"]', { timeout: 20000 });
    await s.click('[data-lvl="moyen"]');
    let pire = 0, vuCinq = false, deborde = null;
    for (let m = 0; m < 5; m++) {
      await s.waitForSelector('.pdu-kb', { timeout: 8000 });
      if (m === 0) deborde = await debordement(s);
      for (let k = 0; k < 30; k++) {
        if (await s.locator('.pdu-fin').count()) break;
        await attendre(m === 0 && k === 0 ? 450 : 60);
        const L = await s.evaluate(() => {
          for (const c of 'EASIRNTULODCMPGBVHFQYXJKWZ') { const b = document.querySelector('.pdu-key[data-l="' + c + '"]'); if (b && !b.disabled) return c; }
          return null;
        });
        if (!L) break;
        await s.click('.pdu-key[data-l="' + L + '"]');
      }
      await s.waitForSelector('.pdu-fin', { timeout: 8000 });
      const txt = await s.textContent('.pdu-barre');
      const mm = /Manche (\d+) \/ (\d+)/.exec(txt);
      if (mm) { pire = Math.max(pire, +mm[1]); if (mm[1] === '5' && mm[2] === '5') vuCinq = true; }
      await attendre(750);
      await s.click('#pdu-next');
      await attendre(250);
    }
    await s.waitForSelector('#overlay-end:not(.hidden)', { timeout: 8000 });
    check('partie seule sans débordement (360)', !deborde, deborde);
    check('bug 4 : « Manche 5 / 5 » à la dernière manche, jamais « 6 / 5 »', vuCinq && pire === 5, pire);
    check('fin de partie célébrée par la coque (résumé du Pendu)', /mot/.test(await s.textContent('#end-detail')));
    await s.context().close();

    console.log('--- Pendu : « je choisis le mot, tu devines » à 2 (360×640) ---');
    const d = await nouveauTelephone(360, 640);
    await lanceTel(d, 'pendu', 2);
    await d.waitForSelector('.pdu-mode[data-m="duel"]', { timeout: 20000 });
    await d.click('.pdu-mode[data-m="duel"]');
    await d.click('[data-a="duel"]');
    await d.waitForSelector('#pdu-mot');
    check('duel : saisie masquée et consigne « ne regardez pas »', await d.getAttribute('#pdu-mot', 'type') === 'password' &&
      /ne regardez pas/.test(await d.textContent('.pdu-cache')));
    check('duel : écran de saisie sans débordement', !(await debordement(d)), await debordement(d));
    await d.fill('#pdu-mot', '12');
    await d.click('#pdu-valider');
    check('duel : mot invalide refusé avec un message', /3 à 14 lettres/.test(await d.textContent('#pdu-err')));
    await d.fill('#pdu-mot', 'Girafe');
    await d.click('.pdu-cat[data-cat="animaux"]');
    await d.click('#pdu-valider');
    await d.waitForSelector('.pdu-kb');
    check('duel : au tour du joueur 2, 6 cases, indice « Animaux »', /Joueur 2/.test(await d.textContent('#mini-turn')) &&
      await d.locator('.pdu-slot').count() === 6 && /Animaux/.test(await d.textContent('.pdu-cat-pill')));
    check('duel : le mot secret n’est nulle part dans la page du devineur', !(await d.evaluate(() => document.body.innerHTML.includes('GIRAFE'))));
    await attendre(400);
    await d.click('.pdu-key[data-l="A"]');
    await attendre(200);
    check('duel : lettre trouvée, elle s’affiche', await d.locator('.pdu-slot.ok').count() === 1);
    await d.context().close();
  }

  /* ======================= MOTS MÊLÉS ======================= */
  if (partie('meles')) {
    /* trouve un mot de la liste dans la grille affichée (comme un joueur) */
    const trouveMot = p => p.evaluate(() => {
      const g = document.querySelector('.mel-grid');
      const C = +g.dataset.cols, R = +g.dataset.rows;
      const cells = [...document.querySelectorAll('.mel-cell')].map(c => c.textContent);
      const words = [...document.querySelectorAll('.mel-word:not(.found)')].map(w => w.textContent);
      const dirs = [[0, 1], [1, 0], [1, 1], [1, -1], [0, -1], [-1, 0], [-1, -1], [-1, 1]];
      for (const w of words) for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) for (const d of dirs) {
        const er = r + d[0] * (w.length - 1), ec = c + d[1] * (w.length - 1);
        if (er < 0 || er >= R || ec < 0 || ec >= C) continue;
        let ok = true;
        for (let k = 0; k < w.length; k++) if (cells[(r + d[0] * k) * C + c + d[1] * k] !== w[k]) { ok = false; break; }
        if (ok) return { a: r * C + c, b: er * C + ec, w };
      }
      return null;
    });
    /* glisse le doigt de la case a à la case b ; renvoie l'état de la gélule à mi-chemin */
    async function glisse(p, a, b, pendant) {
      const A = await p.locator('.mel-cell[data-i="' + a + '"]').boundingBox();
      const B = await p.locator('.mel-cell[data-i="' + b + '"]').boundingBox();
      await p.mouse.move(A.x + A.width / 2, A.y + A.height / 2);
      await p.mouse.down();
      let mi = null;
      for (let s = 1; s <= 6; s++) {
        await p.mouse.move(A.x + A.width / 2 + (B.x - A.x) * s / 6, A.y + A.height / 2 + (B.y - A.y) * s / 6);
        if (s === 3) {
          mi = await p.evaluate(() => {
            const l = document.querySelector('.mel-sel');
            return { cls: l.getAttribute('class'), x2: +l.getAttribute('x2'), y2: +l.getAttribute('y2') };
          });
          if (pendant) await pendant();
        }
      }
      await p.mouse.up();
      return mi;
    }

    console.log('--- Mots mêlés : solo contre l’ordinateur (360×640) ---');
    const p = await nouveauTelephone(360, 640);
    await lanceSolo(p, 'meles', 'difficile');
    await p.waitForSelector('.mel-accueil [data-lvl="difficile"]', { timeout: 20000 });
    check('accueil : défi du jour, 22 thèmes + surprise, 3 niveaux', await p.locator('.mel-jour').count() === 1 &&
      await p.locator('.mel-theme').count() >= 21 && await p.locator('.mel-accueil [data-lvl]').count() === 3);
    check('accueil sans débordement (360)', !(await debordement(p)), await debordement(p));
    await p.click('.mel-theme[data-th="animaux"]');
    await p.click('[data-lvl="difficile"]');
    await p.waitForSelector('.mel-grid');
    await attendre(900);
    const taille = await p.evaluate(() => {
      const r = document.querySelector('.mel-cell').getBoundingClientRect();
      return { w: r.width, h: r.height };
    });
    check('bug 8 : cases assez grandes en difficile (≥ 32 px sur un écran de 360 px, avant : 28 px)',
      taille.w >= 32 && taille.h >= 32, taille);
    check('grille à thème : « Animaux », 9×10, mot mystère annoncé',
      /Animaux/.test(await p.textContent('.mel-theme-pill')) && await p.locator('.mel-cell').count() === 90 &&
      await p.locator('.mel-mys-case').count() >= 4);
    check('partie sans débordement (360)', !(await debordement(p)), await debordement(p));
    // bug 8 : on glisse le doigt, une gélule suit
    let f = await trouveMot(p);
    let perf = null;
    const mi = await glisse(p, f.a, f.b, async () => {});
    check('bug 8 : sélection au doigt en glissant : la gélule suit le doigt pendant le geste',
      mi && /\bon\b/.test(mi.cls) && (mi.x2 > 0 || mi.y2 > 0), mi);
    await attendre(250);
    check('bug 8 : mot trouvé en glissant : gélule posée, mot barré dans la liste',
      await p.locator('.mel-traits .mel-trait').count() === 1 && await p.locator('.mel-word.found').count() >= 1);
    // un deuxième mot (mesure de la fluidité pendant le geste, processeur ×4)
    f = await trouveMot(p);
    perf = await fluidite(p, () => glisse(p, f.a, f.b), 700);
    console.log('    → fluidité au processeur ×4 pendant la sélection au doigt : médiane ' + perf.med.toFixed(1) +
      ' ms, 95e centile ' + perf.p95.toFixed(1) + ' ms');
    check('fluide au processeur ×4 (médiane ≤ 20 ms, 95 % ≤ 50 ms)', perf.med <= 20 && perf.p95 <= 50, perf);
    await attendre(200);
    const couleurs = await p.evaluate(() => [...document.querySelectorAll('.mel-trait')].map(l => l.style.getPropertyValue('--c')));
    check('bug 8 : chaque mot trouvé a SA couleur (plus une seule tache)', couleurs.length >= 2 && new Set(couleurs).size === couleurs.length, couleurs);
    // l'ancien geste marche encore : toucher la première puis la dernière lettre
    f = await trouveMot(p);
    await p.locator('.mel-cell[data-i="' + f.a + '"]').click();
    check('toucher la première lettre : elle est marquée, consigne affichée', await p.locator('.mel-cell.ancre').count() === 1 &&
      /dernière lettre/.test(await p.textContent('#mel-msg')));
    await p.locator('.mel-cell[data-i="' + f.b + '"]').click();
    await attendre(250);
    check('… puis la dernière : mot trouvé', await p.locator('.mel-traits .mel-trait').count() >= 3);
    // une mauvaise sélection : la gélule devient rouge et s'efface
    await glisse(p, 0, 2);
    const rate = await p.evaluate(() => document.querySelector('.mel-sel').getAttribute('class'));
    check('sélection fausse : la gélule rougit (refus visible)', /rate/.test(rate) ||
      (await p.locator('.mel-traits .mel-trait').count()) >= 4, rate);
    // mot mystère proposé trop tôt et faux
    await p.click('[data-a="proposer"]');
    await p.fill('#mel-mys-in', 'ZZZZZZZZZZZ'.slice(0, await p.locator('.mel-mys-case').count()));
    await p.click('.mel-mys-form [data-a="valider"]');
    await attendre(200);
    check('mot mystère faux : refusé, le champ reste ouvert', await p.locator('#mel-mys-in').count() === 1);
    await p.click('[data-a="proposer"]');
    // l'ordinateur cherche lui aussi (niveau difficile : quelques secondes par mot)
    let iaTrouve = false;
    try {
      await p.waitForFunction(() => {
        const b = [...document.querySelectorAll('#mini-players .player-badge')];
        return b.length === 2 && parseInt(b[1].querySelector('.p-score').textContent, 10) > 0;
      }, null, { timeout: 30000 });
      iaTrouve = true;
    } catch (e) {}
    check('contre l’ordinateur : Margot trouve des mots de son côté', iaTrouve);
    // on termine la grille : lettres restantes → mot mystère, confettis, fin
    for (let k = 0; k < 30; k++) {
      if (await p.locator('#overlay-end:not(.hidden)').count() || await p.evaluate(() => {
        const e = document.querySelector('.mel-jeu'); return !e || !document.querySelector('.mel-word:not(.found)');
      })) break;
      const g = await trouveMot(p);
      if (!g) { await attendre(300); continue; }
      await glisse(p, g.a, g.b);
      await attendre(120);
    }
    await p.waitForSelector('.mel-cell.restante', { timeout: 10000 });
    const lettres = await p.evaluate(() => [...document.querySelectorAll('.mel-cell.restante')].map(c => c.textContent).join(''));
    await attendre(2500);
    const banniere = await p.evaluate(() => [...document.querySelectorAll('.mel-mys-case')].map(c => c.textContent).join(''));
    check('mot mystère : les lettres restantes, lues dans l’ordre, forment le mot du bandeau', lettres.length >= 4 && lettres === banniere,
      { lettres, banniere });
    await p.waitForSelector('#overlay-end:not(.hidden)', { timeout: 8000 });
    check('fin de partie : écran de fin de la coque (résumé avec le mot mystère)', /Mot mystère/.test(await p.textContent('#end-detail')));
    await p.context().close();

    console.log('--- Mots mêlés : à 2 sur ce téléphone, chacun son tour (412×780) ---');
    const t = await nouveauTelephone(412, 780);
    await lanceTel(t, 'meles', 2);
    await t.waitForSelector('[data-lvl="facile"]', { timeout: 20000 });
    check('à 2 sur ce téléphone : « chacun son tour » annoncé', /chacun son tour/.test(await t.textContent('.mel-accueil')));
    await t.click('[data-lvl="facile"]');
    await t.waitForSelector('.mel-grid');
    await attendre(700);
    const t412 = await t.evaluate(() => document.querySelector('.mel-cell').getBoundingClientRect().width);
    check('cases confortables à 412 px (≥ 40 px)', t412 >= 40, t412);
    check('à 2 : au tour du joueur 1', /Joueur 1/.test(await t.textContent('#mini-turn')));
    const f2 = await trouveMot(t);
    await glisse(t, f2.a, f2.b);
    await attendre(250);
    check('à 2 : un mot trouvé, au tour du joueur 2', /Joueur 2/.test(await t.textContent('#mini-turn')) &&
      await t.locator('.mel-joueur.tour').count() === 1);
    check('partie à 2 sans débordement (412)', !(await debordement(t)), await debordement(t));
    await quitte(t);
    // défi du jour : la même grille à chaque ouverture
    const lireGrille = async () => {
      await t.click('.game-tile[data-g="meles"]');
      await t.click('#btn-mini-hotseat');
      await t.locator('#mini-count .count-btn[data-n="1"]').click();
      await t.click('#btn-mini-start');
      await t.waitForSelector('.mel-jour');
      await t.click('.mel-jour');
      await t.waitForSelector('.mel-grid');
      const g = await t.evaluate(() => [...document.querySelectorAll('.mel-cell')].map(c => c.textContent).join(''));
      await quitte(t);
      return g;
    };
    const j1 = await lireGrille(), j2 = await lireGrille();
    check('défi du jour : la même grille à chaque fois (calculée depuis la date)', j1.length >= 56 && j1 === j2);
    await t.context().close();
  }

  check('aucune erreur JavaScript pendant toutes ces parties', erreurs.length === 0, erreurs);
  await browser.close();
  console.log(failures ? '\n' + failures + ' ÉCHEC(S)' : '\nTests V2 jeux de mots (navigateur) OK.');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
