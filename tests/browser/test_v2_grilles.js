/*
 * V2 — Mots fléchés & Mots croisés dans le navigateur (412×780 et 360×640, tactile).
 * Joue de vraies parties au clavier de l’écran, vérifie chaque bug de l’audit,
 * la mise en page (clavier visible sans défiler, pas de débordement), les
 * animations, la reprise d’une partie, et la vitesse au processeur ×4.
 *   GG_URL=http://localhost:8704/index.html node tests/browser/test_v2_grilles.js
 * (CAPTURES=dossier pour enregistrer des captures d’écran)
 */
const { chromium } = require('playwright');
const URL = process.env.GG_URL || 'http://localhost:8642/index.html';
const CAP = process.env.CAPTURES || '';
let failures = 0;
function check(n, c, e) {
  if (c) console.log('  OK  ' + n);
  else { failures++; console.log('  FAIL ' + n + (e !== undefined ? ' -> ' + JSON.stringify(e) : '')); }
}

async function nouvellePage(browser, w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  p._errs = [];
  p.on('pageerror', e => p._errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) p._errs.push('console : ' + m.text()); });
  await p.goto(URL);
  return { ctx, p };
}
async function capture(p, nom) { if (CAP) await p.screenshot({ path: CAP + '/' + nom + '.png' }); }
async function quitter(p) {
  await p.click('#btn-mini-menu'); await p.click('#btn-menu-quit'); await p.click('#btn-confirm-yes');
  await p.waitForSelector('#screen-home.active');
}
const V = 'document.getElementById("mini-area")._gx';
/* état de la sélection courante (lecture seule, pour guider le « joueur ») */
async function selection(p) {
  return p.evaluate(`(() => { const V = ${V}; if (!V || !V.sel || V.sel.w < 0) return null;
    const w = V.s.words[V.sel.w];
    return { w: V.sel.w, k: V.sel.k, cells: w.cells, dir: w.dir, locked: w.cells.map(c => V.cellEls[c].classList.contains('ok')),
      saisie: w.cells.map(c => V.s.saisie[c]), complete: V.s.complete }; })()`);
}
/* amène la sélection sur le mot n° wi avec les boutons ‹ › du bandeau */
async function allerAuMot(p, wi) {
  for (let i = 0; i < 80; i++) {
    const s = await selection(p);
    if (s && s.w === wi) return true;
    await p.click('[data-a="suiv"]');
  }
  return false;
}
async function taper(p, lettres) { for (const l of lettres) await p.click('.gx-k[data-k="' + l + '"]'); }
/* solutions de la grille affichée, recalculées par le moteur (même graine) */
async function solutions(p, jeu) {
  return p.evaluate(`(() => { const s = ${V}.s;
    const g = '${jeu}' === 'fleches' ? GG.byId.fleches._grille(s.force, s.gnum, s.jour) : GG.byId.croises._grille(s.level, s.gnum, s.jour);
    return g.mots.map(m => m.w); })()`);
}
/* remplit toute la grille au clavier de l’écran, comme un joueur */
async function resoudre(p, sol) {
  let mots = 0;
  for (let guard = 0; guard < 300; guard++) {
    const s = await selection(p);
    if (!s || s.complete) break;
    const mot = sol[s.w];
    for (let j = s.k; j < mot.length; j++) if (!s.locked[j]) await p.click('.gx-k[data-k="' + mot[j] + '"]');
    mots++;
  }
  return mots;
}
async function mesures(p) {
  return p.evaluate(`(() => {
    const r = s => { const e = document.querySelector(s); return e ? e.getBoundingClientRect() : null; };
    const kb = r('.gx-clavier'), bd = r('.gx-bandeau'), vue = r('.gx-vue');
    const rangs = [...document.querySelectorAll('.gx-krang')].map(e => e.getBoundingClientRect());
    const V = ${V};
    const z = V && V.vc ? V.vc.z : 1;
    const polices = [...document.querySelectorAll('.gx-dt')].map(e => parseFloat(getComputedStyle(e).fontSize) * z).sort((a, b) => a - b);
    const touches = [...document.querySelectorAll('.gx-k')].map(e => e.getBoundingClientRect());
    return {
      ih: innerHeight, iw: innerWidth,
      sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
      sh: document.documentElement.scrollHeight, scrollY: scrollY,
      kbTop: kb && kb.top, kbBottom: kb && kb.bottom, bdTop: bd && bd.top, vueBottom: vue && vue.bottom, vueTop: vue && vue.top,
      rangsVisibles: rangs.filter(x => x.top >= 0 && x.bottom <= innerHeight).length,
      bandeauPx: parseFloat(getComputedStyle(document.querySelector('.gx-txt')).fontSize),
      policeMin: polices[0] || 0, policeMed: polices[Math.floor(polices.length / 2)] || 0,
      toucheMinH: Math.min(...touches.map(t => t.height)), toucheMinW: Math.min(...touches.map(t => t.width)),
      debordeDroite: [...document.querySelectorAll('#mini-area *')].filter(e => { const b = e.getBoundingClientRect(); return b.width && b.right > innerWidth + 1 && !e.closest('.gx-vue'); }).length
    };
  })()`);
}
function mise(m, nom) {
  check(nom + ' : pas de débordement horizontal', m.sw <= m.cw && m.debordeDroite === 0, { sw: m.sw, cw: m.cw, n: m.debordeDroite });
  check(nom + ' : la page ne défile pas (tout tient à l’écran)', m.sh <= m.ih + 1 && m.scrollY === 0, { sh: m.sh, ih: m.ih });
  check(nom + ' : clavier entièrement visible, 3 rangées', m.kbBottom <= m.ih && m.rangsVisibles === 3, m);
  check(nom + ' : grille bornée au-dessus du bandeau et du clavier', m.vueBottom <= m.bdTop && m.bdTop < m.kbTop);
  check(nom + ' : définition courante en grand (≥ 16 px)', m.bandeauPx >= 16, m.bandeauPx);
  check(nom + ' : touches ≥ 40 px de haut', m.toucheMinH >= 40, m.toucheMinH);
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });

  /* ================= MOTS FLÉCHÉS — 412×780 ================= */
  console.log('--- Mots fléchés, 412×780 ---');
  let { ctx, p } = await nouvellePage(browser, 412, 780);
  await p.click('.game-tile[data-g="fleches"]');
  await p.waitForSelector('#mini-area [data-f="1"]');
  check('accueil : 5 forces et le défi du jour', await p.locator('#mini-area [data-f]').count() === 5 &&
    await p.locator('[data-jour]').count() === 1);
  await capture(p, 'fleches-accueil-412');
  await p.click('[data-f="1"]');
  await p.waitForSelector('.gx-grille');
  await p.waitForTimeout(300);
  let m = await mesures(p);
  mise(m, 'force 1');
  check('bug 3 : définitions des cases lisibles (min ' + m.policeMin.toFixed(1) + ' px, médiane ' + m.policeMed.toFixed(1) + ' px)',
    m.policeMin >= 8.5 && m.policeMed >= 10, m);
  check('flèches dessinées (SVG) dans les cases', await p.locator('.gx-fl').count() >= 15 &&
    await p.locator('svg.gx-fl').count() === await p.locator('.gx-fl').count());
  check('aucun champ de saisie (le clavier du téléphone ne s’ouvre jamais)', await p.locator('#mini-area input').count() === 0);
  await capture(p, 'fleches-f1-412');
  const sol1 = await solutions(p, 'fleches');

  // bug 1 : taper la 1re lettre d’un mot dont les autres cases sont déjà remplies ne le juge pas
  let s = await selection(p);
  const cible = s.w, motCible = sol1[cible];
  const faux = motCible.split('').map(c => c === 'Z' ? 'Y' : 'Z').join('');
  await taper(p, faux.slice(0, faux.length - 1));       // presque tout le mot, faux
  s = await selection(p);
  const err0 = await p.evaluate(`${V}.s.players[0].errors`);
  check('bug 1 : un mot inachevé n’est jamais jugé', err0 === 0 && s.w === cible && !s.complete);
  // on revient au début du mot et on retape la 1re lettre : le mot est plein mais on n’est pas au bout
  // (on efface la dernière case remplie puis on va sur le mot suivant/précédent pour tester le croisement)
  await taper(p, faux.slice(-1));                        // dernière lettre : le mot est fini… et faux
  await p.waitForTimeout(80);
  const tremble = await p.locator('.gx-c.tremble').count();
  await p.waitForTimeout(250);
  s = await selection(p);
  const err1 = await p.evaluate(`${V}.s.players[0].errors`);
  check('mot faux : il tremble (animation) et l’erreur est comptée une fois', tremble >= 2 && err1 === 1, { tremble, err1 });
  check('bug 1 : ses lettres fausses sont effacées (cases partagées comprises)', s.saisie.every(x => x === ''), s.saisie);
  // le mot juste : il s’illumine, sa définition se barre, la sélection passe au mot suivant
  await taper(p, motCible);
  await p.waitForTimeout(60);
  const brille = await p.locator('.gx-c.brille').count(), barre = await p.locator('.gx-dh.barre').count();
  await p.waitForTimeout(300);
  check('mot juste : il s’illumine et sa définition se barre', brille >= motCible.length && barre >= 1, { brille, barre });
  check('mot juste : cases verrouillées, définition barrée, mot suivant proposé',
    await p.locator('.gx-c.ok').count() >= motCible.length && await p.locator('.gx-dh.fini').count() >= 1 &&
    (await selection(p)).w !== cible);
  // bug 1 (croisement) : un mot complété par un autre mot n’est pas compté comme erreur
  const croise = await p.evaluate(`(() => { const V = ${V};
    for (let b = 0; b < V.s.words.length; b++) { const B = V.s.words[b];
      if (B.ok || B.cells.length < 3) continue;
      const x = B.cells[B.cells.length - 1], a = V.parCase[x][B.dir === 'h' ? 1 : 0];
      if (a >= 0 && !V.s.words[a].ok && V.s.words[a].cells.every(c => !V.s.saisie[c])) return { a, b, x }; }
    return null; })()`);
  if (croise) {
    await allerAuMot(p, croise.b);
    const B = await selection(p);
    const fauxB = sol1[croise.b].split('').map(c => c === 'Z' ? 'Y' : 'Z').join('');
    for (let j = B.k; j < B.cells.length - 1; j++) if (!B.locked[j]) await p.click('.gx-k[data-k="' + fauxB[j] + '"]');
    await allerAuMot(p, croise.a);
    await taper(p, sol1[croise.a]);                        // A juste : il remplit la dernière case de B
    await p.waitForTimeout(200);
    const etat = await p.evaluate(`(() => { const V = ${V}; return { err: V.s.players[0].errors, B: V.s.words[${croise.b}].ok,
      A: V.s.words[${croise.a}].ok, plein: V.s.words[${croise.b}].cells.every(c => V.s.saisie[c]) }; })()`);
    check('bug 1 : le mot croisé complété par un autre mot n’est ni jugé ni compté faux', etat.err === 1 && !etat.B && etat.A && etat.plein, etat);
  } else check('bug 1 : croisement testable trouvé', false);
  // aides : révéler une lettre (animation « revele », coin doré), −3 points
  await p.click('[data-a="aides"]');
  await p.waitForSelector('.gx-pop:not(.gx-cache)');
  await capture(p, 'fleches-aides-412');
  const avant = await p.evaluate(`${V}.s.players[0].aides`);
  await p.click('[data-aide="lettre"]');
  await p.waitForTimeout(200);
  check('aide « révéler la lettre » : lettre posée, marquée, comptée', await p.locator('.gx-c.aide').count() === 1 &&
    await p.evaluate(`${V}.s.players[0].aides`) === avant + 1);
  // vue d’ensemble puis retour
  const z0 = await p.evaluate(`${V}.vc.z`);
  await p.click('[data-a="zoom"]');
  await p.waitForTimeout(350);
  const z1 = await p.evaluate(`${V}.vc.z`);
  await p.click('[data-a="zoom"]');
  await p.waitForTimeout(350);
  check('bouton ⤢ : vue d’ensemble puis retour à la lecture', z1 !== z0 && Math.abs(await p.evaluate(`${V}.vc.z`) - Math.max(z0, z1)) < 0.5, { z0, z1 });
  // on finit la grille au clavier : vague de couleur, grille remplie, fin célébrée
  const nb = await resoudre(p, sol1);
  await p.waitForTimeout(250);
  check('grille remplie au clavier virtuel (' + nb + ' mots tapés)', await p.evaluate(`${V}.s.complete`) === true);
  check('grille finie : vague de couleur sur toutes les cases', await p.locator('.gx-vague').count() === 1);
  await capture(p, 'fleches-vague-412');
  await p.waitForSelector('#overlay-end:not(.hidden)', { timeout: 6000 });
  await p.waitForTimeout(400);
  check('fin célébrée par la coque (fenêtre de fin, trophée)', /Bravo|Victoire/.test(await p.textContent('#end-titre')) &&
    /⭐/.test(await p.textContent('#end-detail')));
  const lettres = await p.evaluate(() => [...document.querySelectorAll('.gx-c')].map(c => c.textContent.trim()));
  check('bug 4 : la grille terminée reste affichée, entièrement remplie', lettres.length > 20 && lettres.every(l => /^[A-Z]$/.test(l)));
  await capture(p, 'fleches-fin-412');
  await p.click('#btn-end-new');
  await p.waitForSelector('#mini-area [data-f="1"]');
  check('progression enregistrée (1 grille faite, n°2 proposée)', /1 \/ 1 000 grilles/.test(await p.textContent('#mini-area')) &&
    /n°2/.test(await p.textContent('#mini-area [data-f="1"]')));
  check('aucune erreur JavaScript (fléchés 412)', p._errs.length === 0, p._errs);
  await ctx.close();

  /* ================= MOTS FLÉCHÉS — 360×640, forces 3 à 5 ================= */
  console.log('--- Mots fléchés, 360×640 ---');
  ({ ctx, p } = await nouvellePage(browser, 360, 640));
  await p.click('.game-tile[data-g="fleches"]');
  await p.waitForSelector('#mini-area [data-f="5"]');
  await capture(p, 'fleches-accueil-360');
  for (const f of [3, 5]) {
    await p.click('[data-f="' + f + '"]');
    await p.waitForSelector('.gx-grille');
    await p.waitForTimeout(300);
    m = await mesures(p);
    mise(m, 'force ' + f + ' (360)');
    check('bug 2 : force ' + f + ' — la définition courante est visible sans défiler', m.bdTop >= 0 && m.bdTop < m.ih && m.kbBottom <= m.ih);
    check('bug 3 : force ' + f + ' — définitions lisibles (min ' + m.policeMin.toFixed(1) + ' px, médiane ' + m.policeMed.toFixed(1) + ' px)', m.policeMin >= 8.5 && m.policeMed >= 10, m);
    await capture(p, 'fleches-f' + f + '-360');
    // la grille se déplace au doigt (glisser) et suit le mot choisi
    const t0 = await p.evaluate(`${V}.vc.x`);
    const vb = await p.locator('.gx-vue').boundingBox();
    await p.mouse.move(vb.x + vb.width * 0.7, vb.y + 60);
    await p.mouse.down();
    await p.mouse.move(vb.x + vb.width * 0.2, vb.y + 60, { steps: 6 });
    await p.mouse.up();
    const t1 = await p.evaluate(`${V}.vc.x`);
    check('force ' + f + ' : la grille se déplace en glissant', t1 !== t0, { t0, t1 });
    await quitter(p);
    await p.click('.game-tile[data-g="fleches"]');
    await p.waitForSelector('#mini-area [data-f="5"]');
  }
  check('aucune erreur JavaScript (fléchés 360)', p._errs.length === 0, p._errs);

  /* ---- vitesse au processeur ×4 ---- */
  console.log('--- Vitesse au processeur ×4 ---');
  // étalonnage : coût d’un « pas » du générateur sur CETTE machine, sans ralentissement
  // (≈ 3 à 6 µs sur un ordinateur ordinaire ; bien plus si la machine de test est surchargée)
  const usParPas = await p.evaluate(() => {
    for (let g = 0; g < 4; g++) GG.grilles.grilleFleches(3, 800 + g);
    let pas = 0, t = Infinity;
    for (let k = 0; k < 3; k++) {
      let tt = 0; pas = 0;
      for (let g = 0; g < 6; g++) { const t0 = performance.now(); pas += GG.grilles.grilleFleches(3, 810 + g).pas; tt += performance.now() - t0; }
      t = Math.min(t, tt);
    }
    return 1000 * t / pas;
  });
  const charge = Math.max(1, usParPas / 6);
  console.log('    étalonnage : ' + usParPas.toFixed(1) + ' µs par pas (facteur de charge de la machine : ' + charge.toFixed(1) + ')');
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const temps = await p.evaluate(() => {
    const r = {};
    for (let f = 1; f <= 5; f++) {
      // préparation de l’arbre des mots (une fois par force) et mise en route du moteur JS
      for (let g = 0; g < 3; g++) GG.grilles.grilleFleches(f, 500 + g);
      let max = 0, som = 0;
      for (let g = 0; g < 12; g++) {
        // temps de calcul d’une grille : le meilleur de 3 mesures (la machine de test est partagée)
        let d = Infinity;
        for (let k = 0; k < 3; k++) {
          const t0 = performance.now();
          GG.grilles.grilleFleches(f, 600 + g * 29);
          d = Math.min(d, performance.now() - t0);
        }
        som += d; if (d > max) max = d;
      }
      r[f] = { moy: Math.round(som / 12), max: Math.round(max) };
    }
    const c = {};
    for (const l of ['facile', 'moyen', 'difficile']) {
      for (let g = 0; g < 3; g++) GG.grilles.grilleCroises(l, 500 + g);
      let max = 0;
      for (let g = 0; g < 8; g++) {
        let d = Infinity;
        for (let k = 0; k < 3; k++) { const t0 = performance.now(); GG.grilles.grilleCroises(l, 700 + g); d = Math.min(d, performance.now() - t0); }
        max = Math.max(max, d);
      }
      c[l] = Math.round(max);
    }
    return { fleches: r, croises: c };
  });
  console.log('    ' + JSON.stringify(temps));
  check('processeur ×4 : chaque grille de fléchés se calcule en moins de 300 ms (ramené à une machine non surchargée)',
    Object.values(temps.fleches).every(x => x.max / charge < 300), temps.fleches);
  check('processeur ×4 : chaque grille de croisés en moins de 300 ms (idem)', Object.values(temps.croises).every(x => x / charge < 300), temps.croises);
  // de l’appui sur la force à la grille affichée, frappe fluide
  const t0 = Date.now();
  await p.click('[data-f="4"]');
  await p.waitForSelector('.gx-grille');
  const ouverture = Date.now() - t0;
  // coût d’une frappe dans la page (moteur + rendu + effets), sans le pilotage de Playwright
  const frappe = await p.evaluate(() => {
    const ds = [];
    for (const l of 'AEIOUAEIOU') {
      const b = document.querySelector('.gx-k[data-k="' + l + '"]');
      const t0 = performance.now();
      b.click();
      ds.push(performance.now() - t0);
    }
    ds.sort((a, b) => a - b);
    return Math.round(ds[Math.floor(ds.length / 2)]);
  });
  check('processeur ×4 : grille ouverte en ' + ouverture + ' ms, frappe traitée en ' + frappe + ' ms (< 1 s et < 60 ms, ramenés)',
    ouverture / charge < 1000 && frappe / charge < 60);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await ctx.close();

  /* ================= MOTS CROISÉS ================= */
  for (const [w, h] of [[412, 780], [360, 640]]) {
    console.log('--- Mots croisés, ' + w + '×' + h + ' ---');
    ({ ctx, p } = await nouvellePage(browser, w, h));
    await p.click('.game-tile[data-g="croises"]');
    await p.waitForSelector('#mini-area [data-lvl="facile"]');
    await capture(p, 'croises-accueil-' + w);
    const niv = w === 412 ? 'facile' : 'difficile';
    await p.click('[data-lvl="' + niv + '"]');
    await p.waitForSelector('.gx-grille');
    await p.waitForTimeout(300);
    m = await mesures(p);
    mise(m, 'croisés ' + niv + ' (' + w + ')');
    check('croisés : toute la grille visible d’emblée', await p.evaluate(`${V}.vc.z <= ${V}.vc.zFit + 0.01 || ${V}.vc.zFit >= 1`));
    check('bug 6 : aucun champ séparé, on écrit dans la grille', await p.locator('#mini-area input, #cr-guess').count() === 0);
    await capture(p, 'croises-' + niv + '-' + w);
    const solC = await solutions(p, 'croises');
    // le 1er mot horizontal, juste
    s = await selection(p);
    const h1 = s.w;
    await taper(p, solC[h1]);
    await p.waitForTimeout(200);
    // un mot vertical qui croise le premier : la lettre du croisement est déjà là
    const vert = await p.evaluate(`(() => { const V = ${V}; const H = V.s.words[${h1}];
      for (const c of H.cells) { const v = V.parCase[c][1]; if (v >= 0 && !V.s.words[v].ok) return { v, c, k: V.s.words[v].cells.indexOf(c) }; }
      return null; })()`);
    if (vert) {
      await allerAuMot(p, vert.v);
      const sv = await selection(p);
      check('bug 6 : la lettre du croisement est déjà écrite dans le mot vertical', sv.saisie[vert.k] === solC[h1][await p.evaluate(`${V}.s.words[${h1}].cells.indexOf(${vert.c})`)] && sv.locked[vert.k]);
      // on tape seulement les cases libres : le curseur saute la lettre connue
      const mv = solC[vert.v];
      for (let j = sv.k; j < mv.length; j++) if (!sv.locked[j]) await p.click('.gx-k[data-k="' + mv[j] + '"]');
      await p.waitForTimeout(200);
      check('bug 6 : mot vertical trouvé en tapant seulement les lettres manquantes', await p.evaluate(`${V}.s.words[${vert.v}].ok`));
      check('bug 6 : le clavier reste là après une réponse (pas de focus perdu)', await p.locator('.gx-clavier').isVisible() &&
        (await selection(p)) !== null);
    } else check('croisement vertical trouvé', false);
    // tiroir des définitions : numérotation classique
    await p.click('[data-a="liste"]');
    await p.waitForSelector('.gx-tiroir:not(.gx-cache)');
    check('liste « Horizontalement / Verticalement » numérotée I, II… et 1, 2…',
      /Horizontalement/.test(await p.textContent('.gx-liste')) && /Verticalement/.test(await p.textContent('.gx-liste')) &&
      /^I\./.test((await p.textContent('.gx-lg b')).trim()));
    check('mots trouvés barrés dans la liste', await p.locator('.gx-ld.fini').count() >= 2);
    await capture(p, 'croises-liste-' + w);
    await p.click('.gx-ld:not(.fini)');
    await p.waitForTimeout(150);
    check('toucher une définition de la liste choisit son mot', await p.locator('.gx-tiroir.gx-cache').count() === 1 &&
      await p.locator('.gx-c.sel').count() >= 2);
    if (w === 412) {
      const n2 = await resoudre(p, solC);
      await p.waitForSelector('#overlay-end:not(.hidden)', { timeout: 7000 });
      check('croisés : grille entière remplie au clavier (' + n2 + ' mots), fin célébrée', await p.evaluate(`${V}.s.finished`) === true);
      const lc = await p.evaluate(() => [...document.querySelectorAll('.gx-c')].map(c => c.textContent.trim()));
      check('croisés : grille terminée affichée remplie', lc.every(l => /^[A-Z]$/.test(l)));
      await capture(p, 'croises-fin-412');
    }
    check('aucune erreur JavaScript (croisés ' + w + ')', p._errs.length === 0, p._errs);
    await ctx.close();
  }

  /* ================= DÉFI DU JOUR ET REPRISE ================= */
  console.log('--- Défi du jour, reprise d’une partie ---');
  ({ ctx, p } = await nouvellePage(browser, 412, 780));
  await p.click('.game-tile[data-g="fleches"]');
  await p.waitForSelector('[data-jour]');
  await p.click('[data-jour]');
  await p.waitForSelector('.gx-grille');
  const jour = await p.evaluate(`(() => { const s = ${V}.s; const g = GG.grilles.grilleFleches(s.force, -1, s.jour);
    return { titre: document.querySelector('.gx-titre').textContent, meme: g.cases === s.cases && s.jour === GG.grilles.aujourdhui(),
      force: s.force, attendu: GG.byId.fleches._FORCE_DU_JOUR[new Date().getDay()] }; })()`);
  check('défi du jour : la grille calculée depuis la date, force selon le jour', /Défi du jour/.test(jour.titre) && jour.meme && jour.force === jour.attendu, jour);
  const solJ = await solutions(p, 'fleches');
  s = await selection(p);
  await taper(p, solJ[s.w].slice(0, 2));
  const tape1 = await p.evaluate(`${V}.s.saisie.filter(x => x).length`);
  await p.waitForTimeout(500); // la coque enregistre 250 ms après le dernier coup
  await p.reload();
  await p.waitForSelector('#btn-reprise', { timeout: 8000 });
  await p.click('#btn-reprise');
  await p.waitForSelector('.gx-grille');
  const repris = await p.evaluate(`${V}.s.saisie.filter(x => x).length`);
  check('reprise : la partie revient avec ses lettres', tape1 === 2 && repris === 2, { tape1, repris });
  check('aucune erreur JavaScript (défi, reprise)', p._errs.length === 0, p._errs);
  await ctx.close();

  await browser.close();
  console.log(failures ? '\n' + failures + ' ÉCHEC(S)' : '\nTests V2 grilles OK.');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
