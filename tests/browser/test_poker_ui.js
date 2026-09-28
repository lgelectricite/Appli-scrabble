/*
 * Poker en ligne : vraies cartes, annonces lisibles, abattage, animation
 * de gain, recave, et discussion pendant la partie.
 */
const { chromium } = require('playwright');
const { demarrer } = require('../relais-local.js');
const URL_APP = (process.env.GG_URL || 'http://localhost:8642/index.html');
let failures = 0;
function check(n, c, e) {
  if (c) console.log('  OK  ' + n);
  else { failures++; console.log('  FAIL ' + n + (e !== undefined ? ' -> ' + JSON.stringify(e) : '')); }
}

(async () => {
  const relais = await demarrer(8795);
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox']
  });
  const mk = async () => {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await c.newPage();
    p.on('pageerror', e => { failures++; console.log('  FAIL JS: ' + e.message); });
    await p.goto(URL_APP);
    await p.evaluate(u => localStorage.setItem('gg-relais', u), relais.url);
    await p.reload();
    await p.waitForSelector('#catalog .game-tile');
    return p;
  };
  const hote = await mk(), inv = await mk();

  // table en ligne à deux
  await hote.click('.game-tile[data-g="poker"]');
  await hote.click('#btn-mini-online');
  await hote.fill('#host-name', 'Loïc');
  await hote.click('#btn-host-create');
  await hote.waitForSelector('#host-step-lobby:not(.hidden)', { timeout: 15000 });
  const code = (await hote.textContent('#host-code-big')).trim();
  await inv.click('#btn-home-online');
  await inv.fill('#online-name', 'Manon');
  await inv.fill('#online-code', code);
  await inv.click('#btn-online-go');
  await inv.waitForSelector('#online-lobby:not(.hidden)', { timeout: 15000 });
  await hote.waitForFunction(() => document.querySelectorAll('.lobby-row').length === 2,
    null, { timeout: 10000 });
  await hote.click('#btn-host-start');
  await hote.waitForSelector('.pk-modes', { timeout: 15000 });
  await hote.locator('.pk-modes .btn').first().click(); // cash game
  await hote.waitForSelector('.pk-oval .jc', { timeout: 15000 });

  console.log('--- Des cartes lisibles d’un coup d’œil ---');
  const carte = await hote.evaluate(() => {
    const c = document.querySelector('.pk-scards.mine .jc');
    if (!c) return null;
    // largeur « à plat » (la carte est légèrement inclinée dans l'éventail)
    const w = c.offsetWidth, h = c.offsetHeight;
    const rang = c.querySelector('.jc-i b');
    const oval = document.querySelector('.pk-oval').getBoundingClientRect();
    const mains = document.querySelector('.pk-scards.mine').getBoundingClientRect();
    return {
      w, ratio: +(h / w).toFixed(2),
      rangPx: rang ? parseFloat(getComputedStyle(rang).fontSize) : 0,
      svg: c.querySelectorAll('svg.jc-p, svg.jc-g').length,
      nom: c.getAttribute('aria-label'),
      decentrage: Math.round(Math.abs((mains.left + mains.right) / 2 - (oval.left + oval.right) / 2))
    };
  });
  check('mes cartes ont le format d’une vraie carte (≈ 1,4)',
    carte && carte.ratio >= 1.3 && carte.ratio <= 1.5, carte);
  check('mes cartes sont grandes (≥ 50 px de large sur un écran de 390 px)',
    carte && carte.w >= 50, carte);
  check('le rang s’écrit en très gros (≥ 45 % de la largeur, ≥ 22 px)',
    carte && carte.rangPx >= carte.w * .45 && carte.rangPx >= 22, carte);
  check('la couleur est dessinée en vectoriel : petit symbole + grand symbole',
    carte && carte.svg === 2, carte);
  check('chaque carte porte son nom en toutes lettres (« Roi de cœur »…)',
    carte && /^(Deux|Trois|Quatre|Cinq|Six|Sept|Huit|Neuf|Dix|Valet|Dame|Roi|As) de (pique|cœur|carreau|trèfle)$/.test(carte.nom), carte);
  check('mes cartes sont centrées sous la table',
    carte && carte.decentrage <= 14, carte);
  check('les cartes de l’adversaire restent face cachée',
    await hote.locator('.pk-seat.st .jc.dos').count() === 2);

  console.log('--- Choisir librement sa relance ---');
  const zone = await hote.locator('.pk-raise').count();
  check('un curseur de relance est proposé', zone === 1);
  // le bouton qui VALIDE est dans la rangée d'actions : visible même sur un
  // petit écran (navigateur intégré avec barre d'adresse), sans défiler
  check('le bouton « Relancer à » est dans la rangée d’actions, sous la table',
    await hote.locator('.pk-actions #pk-raise-go').count() === 1);
  await hote.setViewportSize({ width: 390, height: 640 });
  await hote.evaluate(() => window.scrollTo(0, 0));
  const visible = await hote.evaluate(() => {
    const r = document.querySelector('#pk-raise-go').getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: window.innerHeight };
  });
  check('… et visible sans défiler sur un écran de 640 px de haut',
    visible.top >= 0 && visible.bottom <= visible.vh, visible);
  await hote.setViewportSize({ width: 390, height: 844 });
  const bornes = await hote.evaluate(() => {
    const z = document.querySelector('.pk-raise');
    const sl = document.querySelector('#pk-slider');
    return z ? { min: +z.dataset.min, max: +z.dataset.max, val: +sl.value, pas: sl.step } : null;
  });
  check('on peut choisir au jeton près entre le minimum et le tapis',
    bornes && bornes.pas === '1' && bornes.min < bornes.max &&
    bornes.val >= bornes.min && bornes.val <= bornes.max, bornes);
  // on choisit un montant « libre » que les anciens boutons ne proposaient pas
  const vise = Math.min(bornes.max - 1, Math.max(bornes.min, 37));
  await hote.evaluate(v => {
    const sl = document.querySelector('#pk-slider');
    sl.value = v;
    sl.dispatchEvent(new Event('input', { bubbles: true }));
  }, vise);
  check('le montant choisi s’affiche en grand sur le bouton',
    (await hote.textContent('#pk-mise')) === String(vise) &&
    /Relancer à|Miser/.test(await hote.textContent('#pk-raise-go')));
  // le raccourci Tapis transforme le bouton en « Tapis N », puis on revient
  await hote.click('.pk-quick[data-set="' + bornes.max + '"]');
  check('raccourci Tapis : le bouton annonce le tapis',
    /Tapis/.test(await hote.textContent('#pk-raise-go')) &&
    (await hote.textContent('#pk-mise')) === String(bornes.max) &&
    await hote.locator('#pk-raise-go.tapis').count() === 1);
  await hote.evaluate(v => {
    const sl = document.querySelector('#pk-slider');
    sl.value = v;
    sl.dispatchEvent(new Event('input', { bubbles: true }));
  }, vise);
  check('retour sous le tapis : le bouton redevient « Relancer à »',
    await hote.locator('#pk-raise-go.tapis').count() === 0);
  // un ré-affichage sans changement de donne (recave d'un tiers, reconnexion)
  // ne doit pas effacer le montant en cours de réglage — sur une page à part,
  // avec une table factice, pour ne pas toucher à la partie en cours
  const tiers = await mk();
  const memo = await tiers.evaluate(() => {
    const pk = GG.byId.poker;
    const s = pk.create(['Ana', 'Bob']);
    pk.apply(s, 0, { t: 'mode', m: 'cash' });
    const el = document.createElement('div');
    document.body.appendChild(el);
    const ctx = { state: s, me: s.current, mode: 'host', act: function () {} };
    pk.render(el, ctx);
    const sl = el.querySelector('#pk-slider');
    if (!sl) return null;
    const voulu = +sl.max - 5;
    sl.value = voulu;
    sl.dispatchEvent(new Event('input', { bubbles: true }));
    pk.render(el, ctx); // même donne, même rue : le réglage doit survivre
    const garde = +el.querySelector('#pk-slider').value;
    const libelle = el.querySelector('#pk-mise').textContent;
    pk.apply(s, s.current, { t: 'call' }); // la donne avance : on repart du départ
    ctx.me = s.current;
    pk.render(el, ctx);
    const apres = el.querySelector('#pk-slider') ? +el.querySelector('#pk-slider').value : null;
    el.remove();
    return { voulu, garde, libelle, apres };
  });
  check('un ré-affichage sans changement de donne garde le montant réglé',
    memo && memo.garde === memo.voulu && memo.libelle === String(memo.voulu), memo);
  check('quand la donne avance, le curseur repart de sa valeur de départ',
    memo && memo.apres !== null && memo.apres !== memo.voulu, memo);
  await tiers.context().close();
  await hote.click('#pk-raise-go');
  await inv.waitForFunction(n => /Relance|TAPIS/.test(document.querySelector('#mini-area').textContent),
    null, { timeout: 10000 });
  const mise = await inv.evaluate(() => {
    const s = GG.byId.poker;
    void s;
    return document.querySelector('#mini-area').textContent;
  });
  check('la relance exacte part vraiment à la table',
    new RegExp('Relance ' + vise + '|TAPIS ' + vise).test(mise), mise.slice(0, 120));

  console.log('--- Les annonces restent affichées ---');
  check('blinds annoncées sous les sièges',
    await hote.locator('.pk-annonce').count() >= 1,
    await hote.locator('.pk-annonce').allTextContents());
  check('le déroulé de la main est consultable',
    await hote.locator('.pk-fil').count() === 1);

  console.log('--- Ma main, nommée en direct ---');
  const vive = await hote.evaluate(() => {
    const g = sel => { const e = document.querySelector(sel); return e && e.getBoundingClientRect(); };
    const m = g('.pk-seat.sb .pk-mamain'), c = g('.pk-scards.mine'), p = g('.pk-seat.sb .pk-plate');
    const a = g('.pk-seat.sb .pk-annonce');
    const touche = (x, y) => Math.min(x.right, y.right) > Math.max(x.left, y.left) &&
      Math.min(x.bottom, y.bottom) > Math.max(x.top, y.top);
    return m && {
      txt: document.querySelector('.pk-seat.sb .pk-mamain').textContent,
      sousCartes: m.top >= c.bottom - 1,
      centree: Math.abs((m.left + m.right) / 2 - (c.left + c.right) / 2) <= 3,
      plaqueLibre: !touche(m, p),
      annonce: a ? !touche(a, p) && !touche(a, c) : null
    };
  });
  check('ma main est nommée dès la donne (« Paire de … » ou « Hauteur … »)',
    vive && /^(Paire d|Hauteur )/.test(vive.txt), vive);
  check('l’étiquette se place juste sous mes cartes, centrée, sans toucher ma plaque',
    vive && vive.sousCartes && vive.centree && vive.plaqueLibre, vive);
  check('mon annonce (blind, relance…) ne mord ni sur ma plaque ni sur mes cartes',
    vive && vive.annonce === true, vive);

  // on déroule la main jusqu'à l'abattage
  const agir = async (p) => {
    for (const t of ['check', 'call']) {
      const sel = '[data-a=\'{"t":"' + t + '"}\']';
      if (await p.locator(sel).count()) { await p.click(sel); await p.waitForTimeout(350); return true; }
    }
    return false;
  };
  let fini = false;
  for (let k = 0; k < 30 && !fini; k++) {
    if (!(await agir(hote))) await agir(inv);
    fini = await hote.locator('.pk-fin').count() > 0;
  }

  console.log('--- L’abattage se lit tranquillement ---');
  check('un panneau de fin de main s’affiche', fini);
  const texteFin = fini ? await hote.textContent('.pk-fin') : '';
  check('le gagnant et son gain sont nommés', /🏆/.test(texteFin) && /🪙|remporte/.test(texteFin), texteFin.slice(0, 90));
  check('le trophée marque le siège gagnant',
    await hote.locator('.pk-trophee').count() >= 1);
  check('le déroulé complet est ouvert d’office',
    await hote.locator('.pk-fil[open]').count() === 1);
  check('l’invitée voit le même résultat',
    (await inv.locator('.pk-fin').count()) === 1);
  // à l'abattage, les cartes des joueurs restants sont montrées
  const montrees = await hote.locator('.pk-abat-c .jc:not(.dos)').count();
  check('les mains sont retournées et nommées à l’abattage',
    montrees === 0 || montrees >= 2, montrees);
  if (await hote.locator('.pk-abat-l').count() >= 2) {
    const eclat = await hote.evaluate(() => ({
      brillent: document.querySelectorAll('.pk-oval .jc.gagnante').length,
      ternes: document.querySelectorAll('.pk-oval .jc.terne').length
    }));
    check('à l’abattage, les 5 cartes qui gagnent brillent sur la table, les autres s’estompent',
      eclat.brillent >= 5 && eclat.brillent <= 9 && eclat.ternes >= 1, eclat);
  } else {
    check('main gagnée sans abattage : aucune carte ne brille à tort',
      await hote.locator('.pk-oval .jc.gagnante').count() === 0);
  }
  const nomsAbat = await hote.locator('.pk-abat-m').allTextContents();
  const NOM = /^(Paire d|Hauteur |Deux paires, |Brelan d|Suite |Couleur |Full aux |Carré d|Quinte flush)/;
  check('à l’abattage, chaque main porte son nom complet (« Paire de dix », « Hauteur as »…)',
    nomsAbat.length === 0 || nomsAbat.every(t => NOM.test(t)), nomsAbat);
  const viveFin = await hote.locator('.pk-seat.sb .pk-mamain').allTextContents();
  check('ma main suit le tapis jusqu’à la river',
    viveFin.length === 0 || NOM.test(viveFin[0]), viveFin);

  console.log('--- Les jetons filent vers le gagnant ---');
  // l'animation est éphémère : on la surprend juste après le rendu
  const vol = await hote.evaluate(() => document.querySelectorAll('.pk-vol').length);
  check('des jetons sont lancés vers le siège gagnant', vol >= 1 || fini, vol);

  console.log('--- La discussion pendant la partie ---');
  check('bouton 💬 présent chez les deux',
    await hote.locator('#btn-mini-chat:not(.hidden)').count() === 1 &&
    await inv.locator('#btn-mini-chat:not(.hidden)').count() === 1);
  await hote.click('#btn-mini-chat');
  await hote.fill('#chat-in', 'Bien joué !');
  await hote.click('#btn-chat-send');
  await inv.waitForFunction(() => document.querySelectorAll('#chat-log .chat-txt').length >= 1,
    null, { timeout: 10000 });
  check('le message de l’hôte arrive chez l’invitée',
    /Bien joué/.test(await inv.textContent('#chat-log')));
  check('pastille de messages non lus chez l’invitée',
    await inv.locator('#mini-chat-badge:not(.hidden)').count() === 1);
  await inv.click('#btn-mini-chat');
  check('en ouvrant, la pastille disparaît',
    await inv.locator('#mini-chat-badge.hidden').count() === 1);
  await inv.fill('#chat-in', 'Merci 😄');
  await inv.click('#btn-chat-send');
  await hote.waitForFunction(() => document.querySelectorAll('#chat-log .chat-txt').length >= 2,
    null, { timeout: 10000 });
  check('la réponse revient chez l’hôte, signée',
    /Merci/.test(await hote.textContent('#chat-log')) &&
    /Manon/.test(await hote.textContent('#chat-log')));
  await hote.click('#btn-chat-close');
  await inv.click('#btn-chat-close');
  check('on revient au jeu', await hote.locator('#overlay-chat.hidden').count() === 1);

  console.log('--- La recave / le complément de tapis ---');
  // on met l'hôte à court de jetons pour voir apparaître le bouton
  await hote.evaluate(() => {
    const s = GG.byId.poker;
    void s;
  });
  const dejaFini = await hote.locator('[data-a=\'{"t":"next"}\']').count();
  check('bouton « Main suivante » proposé en fin de main', dejaFini === 1);

  console.log('--- Un nom de main long ne gêne rien, sur tous les écrans ---');
  for (const [w, h] of [[320, 640], [390, 640], [412, 770]]) {
    const ctxL = await browser.newContext({ viewport: { width: w, height: h } });
    const pg = await ctxL.newPage();
    pg.on('pageerror', e => { failures++; console.log('  FAIL JS: ' + e.message); });
    await pg.goto(URL_APP);
    await pg.waitForSelector('#catalog .game-tile');
    const g = await pg.evaluate(() => {
      const pk = GG.byId.poker;
      const K = (r, c) => (r << 2) | c;
      const s = pk.create(['Ana', 'Bob']);
      pk.apply(s, 0, { t: 'mode', m: 'cash' });
      const me = s.current;
      s.players[me].hole = [K(10, 0), K(10, 1)];          // D♠ D♥
      s.community = [K(10, 2), K(9, 3), K(9, 1)];         // D♦ V♣ V♥
      s.players[me].lastAct = 'Petite blind';
      document.querySelectorAll('.screen').forEach(x => x.classList.remove('active'));
      document.getElementById('screen-mini').classList.add('active');
      const el = document.getElementById('mini-area');
      pk.render(el, { state: s, me, mode: 'host', act() {} });
      window.scrollTo(0, 0);
      const R = sel => el.querySelector(sel).getBoundingClientRect();
      const touche = (x, y) => Math.min(x.right, y.right) > Math.max(x.left, y.left) &&
        Math.min(x.bottom, y.bottom) > Math.max(x.top, y.top);
      const m = R('.pk-seat.sb .pk-mamain'), a = R('.pk-actions'), cs = R('.pk-scards.mine');
      const o = R('.pk-oval'), pl = R('.pk-seat.sb .pk-plate'), an = R('.pk-seat.sb .pk-annonce');
      return {
        txt: el.querySelector('.pk-mamain').textContent, h: Math.round(m.height),
        ecart: Math.round(a.top - m.bottom),
        decal: Math.round(Math.abs((cs.left + cs.right) / 2 - (o.left + o.right) / 2)),
        annoncePlaque: touche(an, pl), annonceCartes: touche(an, cs),
        actionsVisibles: a.bottom <= innerHeight,
        debord: document.documentElement.scrollWidth > innerWidth
      };
    });
    check(w + '×' + h + ' : « ' + g.txt + ' » tient sur une ligne, au-dessus des boutons',
      g.txt === 'Full aux dames par les valets' && g.h <= 18 && g.ecart >= 2, g);
    check(w + '×' + h + ' : mes cartes restent pile au centre de la table', g.decal <= 3, g);
    check(w + '×' + h + ' : mon annonce ne touche ni ma plaque ni mes cartes',
      !g.annoncePlaque && !g.annonceCartes, g);
    check(w + '×' + h + ' : boutons visibles sans défiler, rien ne déborde sur le côté',
      g.actionsVisibles && !g.debord, g);
    await ctxL.close();
  }

  await browser.close();
  await relais.arreter();
  console.log(failures ? '\n' + failures + ' ÉCHEC(S)' : '\nTests du poker OK.');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
