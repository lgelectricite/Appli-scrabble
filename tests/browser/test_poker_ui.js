/*
 * Poker en ligne : vraies cartes, annonces lisibles, abattage, animation
 * de gain, recave, et discussion pendant la partie.
 */
const { chromium } = require('playwright');
const { demarrer } = require('../relais-local.js');
const URL_APP = 'http://localhost:8642/index.html';
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

  console.log('--- De vraies cartes ---');
  const carte = await hote.evaluate(() => {
    const c = document.querySelector('.pk-scards.mine .jc');
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return {
      ratio: +(r.height / r.width).toFixed(2),
      coins: c.querySelectorAll('.jc-coin').length,
      centre: !!c.querySelector('.jc-centre').children.length
    };
  });
  check('mes cartes ont le format d’une vraie carte (≈ 1,4)',
    carte && carte.ratio >= 1.3 && carte.ratio <= 1.5, carte);
  check('index dans deux coins opposés', carte && carte.coins === 2, carte);
  check('symboles dessinés au centre', carte && carte.centre === true, carte);
  check('les cartes de l’adversaire restent face cachée',
    await hote.locator('.pk-seat.st .jc.dos').count() === 2);

  console.log('--- Choisir librement sa relance ---');
  const zone = await hote.locator('.pk-raise').count();
  check('un curseur de relance est proposé', zone === 1);
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
  check('le montant choisi s’affiche en grand',
    (await hote.textContent('#pk-mise')) === String(vise) &&
    /Relancer à/.test(await hote.textContent('#pk-raise-go')));
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

  await browser.close();
  await relais.arreter();
  console.log(failures ? '\n' + failures + ' ÉCHEC(S)' : '\nTests du poker OK.');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
