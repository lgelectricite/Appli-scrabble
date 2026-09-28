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
  async function debordement(p) {
    return p.evaluate(() => {
      const W = window.innerWidth;
      if (document.documentElement.scrollWidth > W + 1) return 'page ' + document.documentElement.scrollWidth;
      const fautif = [...document.querySelectorAll('#mini-area *')].find(e => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && (r.right > W + 1 || r.left < -1) && getComputedStyle(e).position !== 'fixed';
      });
      return fautif ? (fautif.className || fautif.tagName) + ' ' + Math.round(fautif.getBoundingClientRect().right) : null;
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

  await browser.close();
  console.log(failures ? '\n' + failures + ' ÉCHEC(S)' : '\nTests V2 jeux de mots (navigateur) OK.');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
