/*
 * Bibliothèques communes de la V2 : GG.fx (animations), GG.sfx (sons
 * synthétisés), GG.haptic (vibrations) et GG.reglages (réglages persistants).
 *
 * Page autonome (page.setContent) : registry.js + fx.js + sfx.js servis par
 * http://localhost:8642/, sans dépendre d'index.html. On vérifie que chaque
 * fonction renvoie une promesse qui se résout, que rien ne traîne dans le DOM
 * ensuite (canevas, clones, ondes), le mode « animations réduites », la
 * persistance des réglages, chaque son avant / après déverrouillage, chaque
 * vibration, la fluidité des confettis au processeur ralenti ×4, et que les
 * deux fichiers se chargent dans Node sans planter.
 */
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
const BASE = 'http://localhost:8642/';
let failures = 0;
function check(n, c, e) {
  if (c) console.log('  OK  ' + n);
  else { failures++; console.log('  FAIL ' + n + (e !== undefined ? ' -> ' + JSON.stringify(e) : '')); }
}

const PAGE = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { margin: 0; min-height: 100vh; background: #121433; color: #f4f5ff; font-family: system-ui, sans-serif; }
  .ecran { padding: 14px; }
  .btn { position: relative; overflow: hidden; min-height: 46px; padding: 0 18px; border-radius: 16px;
    background: #2a2e66; color: #fff; border: 0; box-shadow: 0 3px 0 rgb(255, 0, 0); }
  .carte { display: inline-block; width: 58px; height: 82px; margin: 4px; border-radius: 8px; background: #fffaf0; color: #c2203a; }
  .penchee { transform: rotate(-8deg); }
  .barre { position: fixed; left: 0; right: 0; bottom: 0; height: 40px; background: #000; }
</style></head><body>
<script>
  // vibreur espion : on enregistre les motifs demandés
  window.__vib = [];
  try { navigator.vibrate = function (m) { window.__vib.push(m); return true; }; } catch (e) {}
</script>
<div class="ecran">
  <div id="score">0</div>
  <button class="btn" id="b1">Jouer</button> <span id="statique">texte</span>
  <div id="main"><div class="carte penchee" data-fx-id="a" id="ca">A</div><div class="carte" data-fx-id="b">B</div><div class="carte" data-fx-id="c">C</div></div>
  <div id="liste"><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span></div>
  <div id="pot" style="width:60px;height:60px;margin-left:260px">pot</div>
  <div style="transform:scale(.5);transform-origin:0 0;height:50px"><div class="carte penchee" id="cr">R</div></div>
  <div style="height:1400px"></div>
</div>
<div class="barre" id="barre"></div>
<script src="${BASE}js/games/registry.js"></script>
<script src="${BASE}js/fx.js"></script>
<script src="${BASE}js/sfx.js"></script>
</body></html>`;

const SONS = ['tap', 'select', 'toggle', 'back', 'open', 'close', 'pop', 'drop', 'place', 'swap', 'deal', 'flip',
  'shuffle', 'chip', 'chips', 'coin', 'dice', 'whoosh', 'tick', 'tock', 'reveal', 'correct', 'wrong', 'success',
  'combo', 'explosion', 'win', 'lose', 'draw', 'fanfare', 'notify', 'type', 'erase', 'hit', 'splash', 'sink', 'bell'];
const VIBRATIONS = ['light', 'medium', 'heavy', 'select', 'success', 'warning', 'error'];
const FONCTIONS = ['reduced', 'confetti', 'burst', 'floatText', 'pop', 'shake', 'pulse', 'bounceIn', 'fadeIn',
  'slideIn', 'glow', 'flyTo', 'countUp', 'stagger', 'flip', 'shakeScreen', 'ripple', 'autoRipple', 'celebrate'];

(async () => {
  console.log('--- Dans Node : chargement sans navigateur ---');
  for (const f of ['js/fx.js', 'js/sfx.js']) {
    let ok = true;
    try { execFileSync(process.execPath, ['--check', path.join(ROOT, f)], { stdio: 'pipe' }); } catch (e) { ok = false; }
    check('node --check ' + f, ok);
  }
  let node = null;
  try {
    node = JSON.parse(execFileSync(process.execPath, ['-e', `
      const fx = require(${JSON.stringify(path.join(ROOT, 'js/fx.js'))});
      const s = require(${JSON.stringify(path.join(ROOT, 'js/sfx.js'))});
      const el = { nodeType: 1 };
      Promise.all([fx.confetti(), fx.burst({ x: 1, y: 1 }), fx.floatText({ x: 0, y: 0 }, '+1'), fx.pop(el),
        fx.flyTo({ x: 0, y: 0 }, { x: 9, y: 9 }, { html: 'x' }), fx.countUp(el, 0, 9), fx.stagger([el]),
        fx.flip([el], function () {}), fx.shakeScreen(), fx.ripple({}), fx.celebrate()])
        .then(function (r) {
          process.stdout.write(JSON.stringify({ promesses: r.length, fx: Object.keys(fx).length,
            sons: s.sfx.noms.length, joue: s.sfx.play('win'), vibre: s.haptic('success'),
            volume: s.reglages.get('volume'), gg: Object.keys(globalThis.GG) }));
        });
    `], { stdio: 'pipe' }).toString());
  } catch (e) { node = { erreur: String(e.stderr || e.message).slice(0, 300) }; }
  check('require de fx.js et sfx.js dans Node : aucun plantage, tout est un no-op',
    node && node.promesses === 11 && node.joue === false && node.vibre === false && node.volume === 0.8, node);
  check('les modules exportent GG.fx, GG.sfx, GG.reglages et GG.haptic',
    node && node.gg && ['fx', 'sfx', 'reglages', 'haptic'].every(k => node.gg.includes(k)), node);

  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--no-sandbox', '--autoplay-policy=user-gesture-required']
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2.625 });
  const page = await context.newPage();
  page.on('pageerror', e => { failures++; console.log('  FAIL JS: ' + e.message); });
  page.on('console', m => {
    if ((m.type() === 'error' || m.type() === 'warning') && !/Failed to load resource/.test(m.text())) {
      failures++;
      console.log('  FAIL console.' + m.type() + ': ' + m.text());
    }
  });
  // une vraie origine (localStorage), puis notre page
  const charger = async () => {
    await page.goto(BASE + 'js/games/registry.js');
    await page.setContent(PAGE);
    await page.waitForFunction(() => window.GG && GG.fx && GG.sfx && GG.reglages && GG.haptic);
  };
  await charger();
  await page.evaluate(() => { try { localStorage.removeItem('gg-reglages'); } catch (e) {} });
  await charger();

  console.log('--- L’API GG.fx est complète ---');
  const api = await page.evaluate(n => n.filter(k => typeof GG.fx[k] !== 'function'), FONCTIONS);
  check('les ' + FONCTIONS.length + ' fonctions de GG.fx existent', api.length === 0, api);

  console.log('--- Chaque animation renvoie une promesse qui se résout ---');
  const promesses = await page.evaluate(async () => {
    const b1 = document.getElementById('b1'), ca = document.getElementById('ca');
    const appels = {
      confetti: () => GG.fx.confetti({ count: 60, duration: 900 }),
      burst: () => GG.fx.burst(b1, { shape: 'spark' }),
      burst_coeur: () => GG.fx.burst({ x: 100, y: 100 }, { shape: 'heart', gravity: false }),
      floatText: () => GG.fx.floatText(b1, '+12', { duration: 600 }),
      pop: () => GG.fx.pop(b1),
      shake: () => GG.fx.shake(b1, 2),
      pulse: () => GG.fx.pulse(b1, 1),
      bounceIn: () => GG.fx.bounceIn(b1, 30),
      fadeIn: () => GG.fx.fadeIn(b1),
      slideIn: () => GG.fx.slideIn(b1, 'left'),
      glow: () => GG.fx.glow(b1, '#2fd4ff', 400),
      flyTo: () => GG.fx.flyTo(ca, document.getElementById('pot'), { duration: 300 }),
      countUp: () => GG.fx.countUp(document.getElementById('score'), 0, 50, 200),
      stagger: () => GG.fx.stagger('#liste span', { gap: 20 }),
      flip: () => GG.fx.flip('#main .carte', () => {}),
      shakeScreen: () => GG.fx.shakeScreen(),
      ripple: () => GG.fx.ripple({ currentTarget: b1, clientX: 30, clientY: 60 }),
      celebrate: () => GG.fx.celebrate({ count: 30, duration: 700, sound: false })
    };
    const res = {};
    await Promise.all(Object.keys(appels).map(async k => {
      const t0 = performance.now();
      const p = appels[k]();
      const estPromesse = !!p && typeof p.then === 'function';
      await Promise.race([p, new Promise(r => setTimeout(r, 5000))]);
      res[k] = { promesse: estPromesse, ms: Math.round(performance.now() - t0) };
    }));
    return res;
  });
  const lentes = Object.keys(promesses).filter(k => !promesses[k].promesse || promesses[k].ms >= 4900);
  check('les ' + Object.keys(promesses).length + ' appels renvoient une Promise résolue', lentes.length === 0, lentes.length ? promesses : undefined);
  check('reduced() renvoie un booléen (faux par défaut)', await page.evaluate(() => GG.fx.reduced() === false));
  const propre = await page.evaluate(async () => {
    await new Promise(r => setTimeout(r, 100));
    return {
      calques: document.querySelectorAll('[data-gg-fx]').length,
      canevas: document.querySelectorAll('canvas').length,
      animations: document.getAnimations().length,
      stats: GG.fx.stats()
    };
  });
  check('ensuite rien ne traîne : ni canevas, ni clone, ni texte, ni onde, ni animation',
    propre.calques === 0 && propre.canevas === 0 && propre.animations === 0 && !propre.stats.actif, propre);

  console.log('--- Confettis : un seul canevas partagé, retiré à la fin ---');
  const conf = await page.evaluate(async () => {
    const ps = [GG.fx.confetti({ count: 40, duration: 800 }), GG.fx.confetti({ from: 'center', count: 40, duration: 800 }),
      GG.fx.confetti({ from: 'cannons', count: 40, duration: 800 }), GG.fx.confetti({ from: document.getElementById('b1'), count: 40, duration: 800 })];
    await new Promise(r => setTimeout(r, 120));
    const c = document.querySelectorAll('canvas[data-gg-fx]');
    const st = c[0] && getComputedStyle(c[0]);
    const pendant = { canevas: c.length, fixe: st && st.position, clics: st && st.pointerEvents, z: st && st.zIndex,
      dpr: c[0] && c[0].width / innerWidth, dansLeDom: c[0] && c[0].isConnected };
    await Promise.all(ps);
    return { pendant, apres: document.querySelectorAll('canvas').length };
  });
  check('4 confettis simultanés → un seul canevas fixe, transparent aux clics, au-dessus de tout',
    conf.pendant.canevas === 1 && conf.pendant.fixe === 'fixed' && conf.pendant.clics === 'none' && conf.pendant.z === '9999', conf);
  check('le canevas tient compte du devicePixelRatio (plafonné à 2)', Math.abs(conf.pendant.dpr - 2) < 0.02, conf);
  check('le canevas est retiré du DOM à la fin', conf.apres === 0, conf);

  console.log('--- flyTo : le clone vole puis disparaît ---');
  const vol = await page.evaluate(async () => {
    const ca = document.getElementById('ca'), pot = document.getElementById('pot');
    const p = GG.fx.flyTo(ca, pot, { duration: 400 });
    await new Promise(r => setTimeout(r, 30));
    const clone = document.querySelector('[data-gg-fx="vol"]');
    const pendant = clone && { fixe: getComputedStyle(clone).position, clics: getComputedStyle(clone).pointerEvents,
      sansId: !clone.id && !clone.querySelector('[id]'), sansFxId: !clone.hasAttribute('data-fx-id'), texte: clone.textContent };
    const r = await p;
    const apres = document.querySelectorAll('[data-gg-fx="vol"]').length;
    const garde = await GG.fx.flyTo({ x: 10, y: 10 }, pot, { html: '<b>🪙</b>', duration: 200, keep: true });
    const gr = garde && garde.getBoundingClientRect(), pr = pot.getBoundingClientRect();
    const res = {
      pendant, resolu: r, apres,
      garde: !!garde && garde.isConnected, surLaCible: !!gr && Math.abs((gr.left + gr.width / 2) - (pr.left + pr.width / 2)) < 2 &&
        Math.abs((gr.top + gr.height / 2) - (pr.top + pr.height / 2)) < 2,
      animationsGarde: garde ? garde.getAnimations().length : -1
    };
    if (garde) garde.remove();
    // source dans un plateau réduit de moitié : le clone part à la même taille
    const cr = document.getElementById('cr'), rr = cr.getBoundingClientRect();
    const p3 = GG.fx.flyTo(cr, pot, { duration: 200 });
    const cl = document.querySelector('[data-gg-fx="vol"]').getBoundingClientRect();
    res.reduit = { source: [Math.round(rr.width), Math.round(rr.height)], clone: [Math.round(cl.width), Math.round(cl.height)] };
    await p3;
    return res;
  });
  check('pendant le vol : clone fixe, sans clic, sans id dupliqué', vol.pendant && vol.pendant.fixe === 'fixed' &&
    vol.pendant.clics === 'none' && vol.pendant.sansId && vol.pendant.sansFxId && vol.pendant.texte === 'A', vol);
  check('à l’arrivée le clone est supprimé', vol.resolu === null && vol.apres === 0, vol);
  check('source dans un conteneur réduit : le clone part à la même taille (inclinaison comprise)', vol.reduit &&
    Math.abs(vol.reduit.source[0] - vol.reduit.clone[0]) <= 2 && Math.abs(vol.reduit.source[1] - vol.reduit.clone[1]) <= 2, vol.reduit);
  check('keep : le clone reste posé pile sur la cible, sans animation résiduelle',
    vol.garde && vol.surLaCible && vol.animationsGarde === 0, vol);

  console.log('--- countUp, stagger, flip ---');
  const cu = await page.evaluate(async () => {
    const s = document.getElementById('score');
    const vus = new Set();
    const mo = new MutationObserver(() => vus.add(s.textContent));
    mo.observe(s, { childList: true, characterData: true, subtree: true });
    await GG.fx.countUp(s, 980, 1234567, 400);
    mo.disconnect();
    const fin = s.textContent;
    // un second countUp lancé pendant le premier le remplace proprement
    const p1 = GG.fx.countUp(s, 0, 100, 400);
    const p2 = GG.fx.countUp(s, 0, 7, 100);
    await Promise.all([p1, p2]);
    const fmt = await GG.fx.countUp(s, 1, 2, 50, n => n + ' pts').then(() => s.textContent);
    return { fin, etapes: vus.size, relance: s.textContent === '2 pts' ? 'ok' : s.textContent, fmt };
  });
  check('countUp affiche la valeur finale, à la française (1 234 567)', cu.fin === '1\u202F234\u202F567', cu);
  check('countUp fait vraiment défiler les nombres', cu.etapes >= 5, cu);
  check('countUp accepte un format personnalisé', cu.fmt === '2 pts', cu);
  const sf = await page.evaluate(async () => {
    const res = {};
    try { await GG.fx.stagger(document.querySelectorAll('#liste span'), { gap: 30, from: 'right' }); res.stagger = 'ok'; } catch (e) { res.stagger = e.message; }
    try { await GG.fx.stagger([]); await GG.fx.stagger(null); res.vide = 'ok'; } catch (e) { res.vide = e.message; }
    const main = document.getElementById('main');
    const avant = main.querySelector('[data-fx-id="a"]').getBoundingClientRect().left;
    let pendant = null;
    try {
      const p = GG.fx.flip(main.querySelectorAll('.carte'), () => {
        // DOM entièrement reconstruit, ordre inversé
        main.innerHTML = '<div class="carte" data-fx-id="c">C</div><div class="carte" data-fx-id="b">B</div>' +
          '<div class="carte penchee" data-fx-id="a" id="ca">A</div>';
      });
      await new Promise(r => setTimeout(r, 40));
      const a = main.querySelector('[data-fx-id="a"]');
      pendant = { anims: a.getAnimations().length, x: a.getBoundingClientRect().left };
      await p;
      res.flip = 'ok';
    } catch (e) { res.flip = e.message; }
    const apres = main.querySelector('[data-fx-id="a"]').getBoundingClientRect().left;
    res.depart = avant; res.pendant = pendant; res.arrivee = apres;
    res.transform = getComputedStyle(main.querySelector('[data-fx-id="a"]')).transform;
    try { await GG.fx.flip('#main .carte', () => new Promise(r => setTimeout(r, 20))); res.async = 'ok'; } catch (e) { res.async = e.message; }
    return res;
  });
  check('stagger ne lève rien (liste, vide, null)', sf.stagger === 'ok' && sf.vide === 'ok', sf);
  check('flip ne lève rien, même quand le DOM est reconstruit (repérage par data-fx-id)',
    sf.flip === 'ok' && sf.async === 'ok', sf);
  check('flip part de l’ancienne position et finit à la nouvelle',
    sf.pendant && sf.pendant.anims >= 1 && sf.pendant.x < sf.arrivee - 5 && sf.depart < sf.arrivee, sf);
  check('flip rend l’élément avec son transform CSS d’origine (carte penchée)',
    /^matrix\(0\.99/.test(sf.transform), sf.transform);

  console.log('--- Les micro-animations respectent le transform et les ombres existants ---');
  const compo = await page.evaluate(async () => {
    const a = document.getElementById('ca'), b1 = document.getElementById('b1');
    const t0 = getComputedStyle(a).transform;
    const p = GG.fx.pop(a, 1.3);
    await new Promise(r => setTimeout(r, 110));
    const t1 = getComputedStyle(a).transform;
    await p;
    const g = GG.fx.glow(b1, '#ffc23d', 600);
    await new Promise(r => setTimeout(r, 180));
    const ombre = getComputedStyle(b1).boxShadow;
    await g;
    return { t0, t1, t2: getComputedStyle(a).transform, ombre, ombreFin: getComputedStyle(b1).boxShadow };
  });
  const echelle = m => { const v = /matrix\(([^,]+), ([^,]+)/.exec(m); return v ? Math.hypot(+v[1], +v[2]) : 0; };
  check('pop grossit la carte sans perdre son inclinaison', echelle(compo.t1) > 1.1 && compo.t2 === compo.t0 &&
    Math.abs(Math.atan2(...(/matrix\(([^,]+), ([^,]+)/.exec(compo.t1).slice(1, 3).map(Number).reverse())) -
      Math.atan2(...(/matrix\(([^,]+), ([^,]+)/.exec(compo.t0).slice(1, 3).map(Number).reverse()))) < 0.01, compo);
  check('glow s’ajoute aux ombres existantes puis les rend intactes',
    /rgb\(255, 0, 0\)/.test(compo.ombre) && /255, 194, 61/.test(compo.ombre) && compo.ombreFin === 'rgb(255, 0, 0) 0px 3px 0px 0px', compo);

  console.log('--- Secousse de l’écran et onde au toucher ---');
  const sec = await page.evaluate(async () => {
    window.scrollTo(0, 500);
    const barre = document.getElementById('barre'), y0 = barre.getBoundingClientRect().top;
    const t0 = performance.now();
    const p = GG.fx.shakeScreen(2);
    const cout = performance.now() - t0;
    await new Promise(r => setTimeout(r, 50));
    const y1 = barre.getBoundingClientRect().top;
    const secoue = document.querySelector('.ecran').getAnimations().length;
    await p;
    window.scrollTo(0, 0);
    return { y0, y1, secoue, cout: +cout.toFixed(2) };
  });
  check('shakeScreen secoue le contenu sans faire sauter la barre fixe (page défilée)',
    sec.secoue >= 1 && sec.y0 === sec.y1, sec);
  check('shakeScreen choisit ses cibles vite (< 8 ms)', sec.cout < 8, sec);
  const onde = await page.evaluate(() => {
    window.__stop = GG.fx.autoRipple('.btn');
    return GG.fx.autoRipple('.btn') === window.__stop;
  });
  await page.mouse.click(40, 40); // premier geste : déverrouille aussi l’audio
  const b1 = await page.locator('#b1').boundingBox();
  await page.mouse.move(b1.x + 10, b1.y + 10);
  await page.mouse.down();
  const ondePendant = await page.evaluate(() => {
    const o = document.querySelector('#b1 > [data-gg-fx="onde"]');
    return o ? { parent: o.parentNode.id, debord: getComputedStyle(o).overflow, pos: getComputedStyle(o).position } : null;
  });
  await page.mouse.up();
  const statique = await page.evaluate(async () => {
    const s = document.getElementById('statique'), r = s.getBoundingClientRect();
    const p = GG.fx.ripple({ currentTarget: s, clientX: r.left + 2, clientY: r.top + 2 });
    const c = document.querySelector('body > [data-gg-fx="onde"]');
    const res = { calque: !!c, fixe: c && getComputedStyle(c).position, dansLeTexte: s.querySelector('[data-gg-fx]') === null };
    await p;
    await new Promise(r2 => setTimeout(r2, 950));
    res.restantes = document.querySelectorAll('[data-gg-fx="onde"]').length;
    window.__stop();
    return res;
  });
  check('autoRipple : une seule délégation par sélecteur', onde === true);
  check('ripple : onde dans un conteneur absolu interne (overflow caché) pour un élément positionné',
    ondePendant && ondePendant.parent === 'b1' && ondePendant.debord === 'hidden' && ondePendant.pos === 'absolute', ondePendant);
  check('ripple : calque fixe posé dessus pour un élément statique (sa mise en page intacte), retiré à la fin',
    statique.calque && statique.fixe === 'fixed' && statique.dansLeTexte && statique.restantes === 0, statique);

  console.log('--- Les sons ---');
  // (le clic ci-dessus a déverrouillé l'audio ; on vérifie d'abord « avant » sur une page neuve)
  const avant = await context.newPage();
  avant.on('pageerror', e => { failures++; console.log('  FAIL JS: ' + e.message); });
  await avant.goto(BASE + 'js/games/registry.js');
  await avant.setContent(PAGE);
  await avant.waitForFunction(() => window.GG && GG.sfx);
  const sansGeste = await avant.evaluate(sons => {
    const res = { etat: GG.sfx.etat(), exceptions: [], joues: 0 };
    for (const n of sons) {
      try { if (GG.sfx.play(n, { level: 5 })) res.joues++; } catch (e) { res.exceptions.push(n + ': ' + e.message); }
    }
    try { GG.sfx.play('inconnu'); GG.sfx.play(); GG.sfx.play(null, null); } catch (e) { res.exceptions.push('inconnu: ' + e.message); }
    return res;
  }, SONS);
  await avant.close();
  check('avant tout geste : pas de contexte audio, play() ne fait rien et ne lève rien',
    sansGeste.etat === 'absent' && sansGeste.joues === 0 && sansGeste.exceptions.length === 0, sansGeste);
  const apres = await page.evaluate(async sons => {
    const res = { etat: GG.sfx.etat(), noms: GG.sfx.noms.slice(), exceptions: [], refus: [], maxVoix: 0 };
    for (const n of sons) {
      try {
        if (!GG.sfx.play(n, n === 'combo' ? { level: 8 } : { volume: 0.5, pitch: 1.1 })) res.refus.push(n);
      } catch (e) { res.exceptions.push(n + ': ' + e.message); }
      res.maxVoix = Math.max(res.maxVoix, GG.sfx.voix());
    }
    for (let l = 1; l <= 8; l++) GG.sfx.play('combo', { level: l });
    res.maxVoix = Math.max(res.maxVoix, GG.sfx.voix());
    try { GG.sfx.play('toggle', { on: false }); GG.sfx.play('tap', { pitch: 99, volume: -3 }); } catch (e) { res.exceptions.push('bornes: ' + e.message); }
    GG.sfx.setOn(false);
    res.coupe = GG.sfx.play('win');
    res.voixCoupees = GG.sfx.voix();
    GG.sfx.setOn(true);
    res.retour = GG.sfx.play('tap');
    res.volume = [GG.sfx.volume(), GG.sfx.volume(1.7), GG.sfx.volume(0.8)];
    return res;
  }, SONS);
  check('après un clic, le contexte audio tourne', apres.etat === 'running', apres.etat);
  check('les ' + SONS.length + ' sons demandés existent', SONS.every(n => apres.noms.includes(n)),
    SONS.filter(n => !apres.noms.includes(n)));
  check('chaque son part sans exception', apres.exceptions.length === 0 && apres.refus.length === 0, apres);
  check('jamais plus de 12 voix simultanées', apres.maxVoix <= 12 && apres.maxVoix >= 8, apres.maxVoix);
  check('son coupé : play() refuse et les voix en cours s’éteignent ; rallumé : ça repart',
    apres.coupe === false && apres.voixCoupees === 0 && apres.retour === true, apres);
  check('volume() lit, borne (0..1) et enregistre', apres.volume[0] === 0.8 && apres.volume[1] === 1 && apres.volume[2] === 0.8, apres.volume);
  const rendu = await page.evaluate(async sons => {
    const res = {};
    for (const n of sons) {
      const b = await GG.sfx.rendre(n, n === 'combo' ? { level: 8 } : {});
      if (!b) { res[n] = null; continue; }
      let pic = 0, bizarre = false, der = 0;
      for (let c = 0; c < b.numberOfChannels; c++) {
        const d = b.getChannelData(c);
        for (let i = 0; i < d.length; i++) {
          const x = Math.abs(d[i]);
          if (!(x === x) || x === Infinity) bizarre = true;
          if (x > pic) pic = x;
          if (x > 0.003) der = i;
        }
      }
      res[n] = { pic: +pic.toFixed(3), duree: +(der / b.sampleRate).toFixed(2), bizarre };
    }
    return res;
  }, SONS);
  const mauvais = SONS.filter(n => !rendu[n] || rendu[n].bizarre || rendu[n].pic < 0.02 || rendu[n].pic > 0.98);
  check('rendu hors ligne : chaque son est audible, sans saturation ni NaN', mauvais.length === 0,
    mauvais.map(n => [n, rendu[n]]));
  check('dés : 400 à 700 ms de chocs', rendu.dice && rendu.dice.duree >= 0.35 && rendu.dice.duree <= 0.8, rendu.dice);
  check('win ≈ 1,2 s, fanfare ≈ 2 s', rendu.win && rendu.win.duree >= 0.9 && rendu.win.duree <= 1.6 &&
    rendu.fanfare && rendu.fanfare.duree >= 1.7 && rendu.fanfare.duree <= 2.6, { win: rendu.win, fanfare: rendu.fanfare });
  check('les sons d’interface restent discrets (tap < win)', rendu.tap.pic < rendu.win.pic / 2, { tap: rendu.tap, win: rendu.win });
  const nettoyage = await page.evaluate(async () => {
    await new Promise(r => setTimeout(r, 2800));
    return GG.sfx.voix();
  });
  check('les voix terminées sont libérées', nettoyage === 0, nettoyage);

  console.log('--- Les vibrations ---');
  const vib = await page.evaluate(types => {
    window.__vib.length = 0;
    const exceptions = [];
    for (const t of types.concat([[5, 10, 5], 15, 'inconnu', null, undefined])) {
      try { GG.haptic(t); } catch (e) { exceptions.push(String(t) + ': ' + e.message); }
    }
    const motifs = window.__vib.slice();
    GG.reglages.set('vibrations', false);
    window.__vib.length = 0;
    GG.haptic('heavy');
    const coupees = window.__vib.length;
    GG.reglages.set('vibrations', true);
    return { exceptions, motifs, coupees };
  }, VIBRATIONS);
  check('GG.haptic ne lève rien, quel que soit le type', vib.exceptions.length === 0, vib.exceptions);
  check('motifs exacts (light 10, success [12,40,18], error [35,50,35,50,35]…)',
    JSON.stringify(vib.motifs.slice(0, 7)) === JSON.stringify([10, 20, 35, 6, [12, 40, 18], [20, 60, 20], [35, 50, 35, 50, 35]]) &&
    JSON.stringify(vib.motifs.slice(7)) === JSON.stringify([[5, 10, 5], 15, 10, 10]), vib.motifs);
  check('vibrations désactivées dans les réglages : rien ne vibre', vib.coupees === 0, vib.coupees);

  console.log('--- Les réglages persistent ---');
  const evts = await page.evaluate(() => {
    const vus = [];
    document.addEventListener('gg-reglages', e => vus.push(e.detail));
    GG.reglages.set('volume', 0.35);
    GG.reglages.set('son', false);
    GG.reglages.set('animations', 'reduites');
    GG.reglages.set('perso', { a: 1 });
    return { vus, tout: GG.reglages.tout(), brut: JSON.parse(localStorage.getItem('gg-reglages')) };
  });
  check('set() émet l’évènement « gg-reglages » {cle, valeur}', evts.vus.length === 4 &&
    evts.vus[0].cle === 'volume' && evts.vus[0].valeur === 0.35 && evts.vus[1].valeur === false, evts.vus);
  check('set() enregistre dans localStorage « gg-reglages »', evts.brut && evts.brut.volume === 0.35 &&
    evts.brut.son === false && evts.brut.animations === 'reduites', evts.brut);
  await page.reload();
  await page.setContent(PAGE);
  await page.waitForFunction(() => window.GG && GG.reglages);
  const relu = await page.evaluate(() => ({ tout: GG.reglages.tout(), on: GG.sfx.on(), reduit: GG.fx.reduced() }));
  check('après rechargement les réglages sont relus', relu.tout.volume === 0.35 && relu.tout.son === false &&
    relu.tout.animations === 'reduites' && relu.tout.vibrations === true && relu.tout.perso && relu.tout.perso.a === 1 &&
    relu.on === false && relu.reduit === true, relu);

  console.log('--- Animations réduites ---');
  const red = await page.evaluate(async () => {
    const b1 = document.getElementById('b1'), ca = document.getElementById('ca');
    const appels = [
      () => GG.fx.confetti(), () => GG.fx.burst(b1), () => GG.fx.floatText(b1, '+1'), () => GG.fx.pop(b1),
      () => GG.fx.shake(b1), () => GG.fx.pulse(b1, 5), () => GG.fx.bounceIn(b1, 500), () => GG.fx.fadeIn(b1, 500),
      () => GG.fx.slideIn(b1, 'up', 500), () => GG.fx.glow(b1), () => GG.fx.flyTo(ca, document.getElementById('pot')),
      () => GG.fx.countUp(document.getElementById('score'), 0, 999, 5000), () => GG.fx.stagger('#liste span', { gap: 400 }),
      () => GG.fx.flip('#main .carte', () => {}), () => GG.fx.shakeScreen(3), () => GG.fx.celebrate({ duration: 5000 }),
      () => GG.fx.ripple({ currentTarget: b1, clientX: 5, clientY: 5 })
    ];
    const t0 = performance.now();
    await Promise.all(appels.map(f => f()));
    const d = performance.now() - t0;
    return { d: +d.toFixed(1), canevas: document.querySelectorAll('canvas').length, score: document.getElementById('score').textContent };
  });
  check('en mode réduit toutes les promesses se résolvent en moins de 300 ms', red.d < 300, red);
  check('en mode réduit : aucune particule, countUp écrit directement la valeur finale', red.canevas === 0 && red.score === '999', red);
  await page.evaluate(() => { GG.reglages.set('animations', 'normales'); GG.reglages.set('son', true); GG.reglages.set('volume', 0.8); });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  check('prefers-reduced-motion est aussi respecté', await page.evaluate(() => GG.fx.reduced() === true));
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  console.log('--- Sans localStorage (about:blank) ---');
  const vierge = await context.newPage();
  vierge.on('pageerror', e => { failures++; console.log('  FAIL JS: ' + e.message); });
  await vierge.setContent(PAGE);
  await vierge.waitForFunction(() => window.GG && GG.reglages);
  const sansLS = await vierge.evaluate(() => {
    let ls = 'ok';
    try { void window.localStorage.length; } catch (e) { ls = 'refusé'; }
    GG.reglages.set('volume', 0.5);
    return { ls, volume: GG.reglages.get('volume'), tout: GG.reglages.tout() };
  });
  await vierge.close();
  check('localStorage indisponible : les réglages marchent en mémoire, sans erreur',
    sansLS.volume === 0.5 && sansLS.tout.son === true, sansLS);

  console.log('--- Fluidité au processeur ralenti ×4 ---');
  const cdp = await context.newCDPSession(page);
  const mesurer = async () => page.evaluate(async () => {
    GG.fx.stats(true);
    const intervalles = [];
    let prec = 0, fini = false;
    const boucle = t => { if (prec) intervalles.push(t - prec); prec = t; if (!fini) requestAnimationFrame(boucle); };
    requestAnimationFrame(boucle);
    await Promise.all([GG.fx.confetti(), GG.fx.confetti({ from: 'center' }), GG.fx.confetti({ from: 'cannons' })]);
    fini = true;
    const s = GG.fx.stats();
    const moy = intervalles.reduce((a, b) => a + b, 0) / intervalles.length;
    const tri = intervalles.slice().sort((a, b) => a - b);
    return { moyenne: +moy.toFixed(2), p95: +tri[Math.floor(tri.length * 0.95)].toFixed(1), images: intervalles.length, moteur: s };
  });
  const normal = await mesurer();
  console.log('       sans ralentissement : ' + JSON.stringify(normal));
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const lent = await mesurer();
  console.log('       processeur ×4       : ' + JSON.stringify(lent));
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  check('3 confettis simultanés, processeur ×4 : temps moyen par image < 34 ms', lent.moyenne < 34, lent);
  check('jamais plus de 300 particules à l’écran', lent.moteur.pic <= 300 && normal.moteur.pic <= 300,
    { normal: normal.moteur.pic, lent: lent.moteur.pic });
  const final = await page.evaluate(() => ({ canevas: document.querySelectorAll('canvas').length, calques: document.querySelectorAll('[data-gg-fx]').length }));
  check('après la mesure, plus aucun canevas ni calque', final.canevas === 0 && final.calques === 0, final);

  await browser.close();
  console.log(failures ? '\n' + failures + ' ÉCHEC(S)' : '\nTests des effets et des sons OK.');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
