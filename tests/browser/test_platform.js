const { chromium } = require('playwright');
const URL = 'http://localhost:8642/index.html';
let failures = 0;
function check(n, c, e) {
  if (c) console.log('  OK  ' + n);
  else { failures++; console.log('  FAIL ' + n + (e !== undefined ? ' -> ' + JSON.stringify(e) : '')); }
}

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--no-sandbox']
  });

  /* ============ Catalogue + Puissance 4 sur un téléphone ============ */
  console.log('--- Catalogue & Puissance 4 (1 téléphone) ---');
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => { failures++; console.log('  FAIL JS: ' + e.message); });
  await p.goto(URL);
  check('titre GGgames', (await p.title()) === 'GGgames');
  check('h1 GGgames', (await p.textContent('#screen-home h1')) === 'GGgames');
  const tiles = await p.locator('#catalog .game-tile').count();
  check('catalogue : 24 jeux', tiles === 24, tiles);
  const names = await p.textContent('#catalog');
  ['Words', 'Puissance 4', 'Morpion', 'Pendu', 'Petit Bac', 'Bataille navale',
   'Yams', 'Cochon', 'Memory', 'Poker', 'Le Manoir', 'Sudoku', 'Mots mêlés', 'Mot Mystère',
   'Mots croisés', 'Mots fléchés', 'L’Imposteur', 'Quiz', 'Le Plus Proche', '8 américain', 'Discussion'].forEach(n => {
    check('jeu présent : ' + n, names.includes(n));
  });

  await p.click('.game-tile[data-g="p4"]');
  check('écran de config P4', (await p.textContent('#mini-setup-title')).includes('Puissance 4'));
  await p.click('#btn-mini-hotseat');
  await p.fill('#mini-name-1', 'Léa');
  await p.fill('#mini-name-2', 'Marc');
  await p.click('#btn-mini-start');
  await p.waitForSelector('#screen-mini.active');
  check('partie P4 lancée', true);
  // bouton règles : le but du jeu est expliqué dans l'appli
  await p.click('#btn-mini-rules');
  await p.waitForSelector('#overlay-rules:not(.hidden)');
  const regles = await p.textContent('#rules-body');
  check('règles P4 : but du jeu affiché', /Le but/.test(regles) && /aligner 4/i.test(regles));
  check('titre des règles', (await p.textContent('#rules-title')).includes('Puissance 4'));
  await p.click('#btn-rules-close');
  await p.waitForSelector('#overlay-rules.hidden', { state: 'attached' });
  const cells = await p.locator('.p4-cell').count();
  check('grille 7×6', cells === 42, cells);
  // Léa gagne en verticale : colonnes 0 (Léa) / 1 (Marc)
  for (let i = 0; i < 3; i++) {
    await p.locator('.p4-cell[data-col="0"]').first().click();
    await p.locator('.p4-cell[data-col="1"]').first().click();
  }
  await p.locator('.p4-cell[data-col="0"]').first().click();
  await p.waitForSelector('.mini-msg');
  const msg = await p.textContent('#mini-area');
  check('victoire de Léa annoncée', msg.includes('Léa') && msg.includes('gagne'), msg.slice(0, 80));
  const wins = await p.textContent('#mini-players');
  check('badge de manches mis à jour', wins.includes('1'), wins);
  await p.click('[data-a="again"]');
  check('manche suivante démarrée', (await p.locator('.p4-disc:not(.mini)').count()) === 0);

  // menu → quitter
  await p.click('#btn-mini-menu');
  await p.click('#btn-menu-quit');
  await p.click('#btn-confirm-yes');
  await p.waitForSelector('#screen-home.active');
  check('retour à l’accueil', true);

  // Yams solo rapide : lancer et marquer
  await p.click('.game-tile[data-g="yams"]');
  await p.click('#btn-mini-hotseat');
  await p.click('#btn-mini-start');
  await p.waitForSelector('#screen-mini.active');
  await p.click('[data-a="roll"]');
  await p.waitForSelector('.yams-pick');
  await p.locator('.yams-pick').last().click(); // « chance »
  const filled = await p.locator('.yams-sheet td.filled').count();
  check('Yams : case marquée', filled === 1, filled);
  await p.click('#btn-mini-menu');
  await p.click('#btn-menu-quit');
  await p.click('#btn-confirm-yes');

  // Memory : sélection du nombre de joueurs bien visible + essais comptés
  await p.click('.game-tile[data-g="memory"]');
  await p.click('#btn-mini-hotseat');
  const cnt = await p.locator('#mini-count .count-btn').count();
  check('Memory : choix 1 à 4 joueurs', cnt === 4, cnt);
  const btnW = await p.locator('#mini-count .count-btn').first()
    .evaluate(e => e.getBoundingClientRect().width);
  check('boutons du nombre de joueurs larges (' + Math.round(btnW) + 'px)', btnW > 70, btnW);
  await p.click('#btn-mini-start');
  await p.waitForSelector('#screen-mini.active');
  await p.locator('.mem-card').nth(0).click();
  await p.locator('.mem-card').nth(1).click();
  const st = await p.textContent('.mem-stats');
  check('essais et chrono affichés en direct', /1 essai/.test(st) && /⏱/.test(st), st);
  await p.click('#btn-mini-menu');
  await p.click('#btn-menu-quit');
  await p.click('#btn-confirm-yes');
  await ctx.close();

  /* ============ Bataille navale en réseau (secret des grilles) ============ */
  console.log('--- Bataille navale (2 téléphones) ---');
  const ctxH = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const ctxG = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const host = await ctxH.newPage();
  const guest = await ctxG.newPage();
  host.on('pageerror', e => { failures++; console.log('  FAIL host JS: ' + e.message); });
  guest.on('pageerror', e => { failures++; console.log('  FAIL guest JS: ' + e.message); });
  await host.goto(URL);
  await guest.goto(URL);

  await host.click('.game-tile[data-g="bataille"]');
  await host.click('#btn-mini-host');
  check('titre du salon : Bataille navale',
    (await host.textContent('#host-title')).includes('Bataille navale'));
  await host.fill('#host-name', 'Hugo');
  await host.click('#btn-host-create');
  await host.waitForSelector('#host-step-lobby:not(.hidden)');

  // QR Wi-Fi : l'invité rejoint le réseau de l'hôte en scannant
  await host.click('#btn-host-wifi');
  await host.waitForSelector('#host-step-wifi:not(.hidden)');
  await host.fill('#wifi-ssid', 'iPhone de Loïc');
  await host.fill('#wifi-pass', 'mot;de:passe');
  await host.click('#btn-wifi-make');
  await host.waitForSelector('#wifi-qr svg');
  const wifiCode = await host.getAttribute('#wifi-qr', 'data-value');
  check('QR Wi-Fi au format standard',
    wifiCode === 'WIFI:T:WPA;S:iPhone de Loïc;P:mot\\;de\\:passe;;', wifiCode);
  await host.click('#btn-wifi-back');
  await host.waitForSelector('#host-step-lobby:not(.hidden)');
  check('retour au salon après le QR Wi-Fi', true);

  await host.click('#btn-host-invite');
  await host.waitForFunction(() => document.getElementById('host-code').value.length > 20);
  const offer = await host.inputValue('#host-code');

  await guest.goto(offer); // scan simulé avec l'appareil photo
  await guest.waitForSelector('#screen-join.active');
  await guest.fill('#join-name', 'Nina');
  await guest.click('#btn-join-scan');
  await guest.waitForFunction(() => document.getElementById('join-code').value.length > 20);
  const answer = await guest.inputValue('#join-code');
  await host.click('#btn-host-scan-answer');
  await host.fill('#host-paste', answer);
  await host.click('#btn-host-paste-ok');
  await host.waitForSelector('#host-step-lobby:not(.hidden)', { timeout: 15000 });
  await host.click('#btn-host-start');
  await host.waitForSelector('#screen-mini.active');
  await guest.waitForSelector('#screen-mini.active', { timeout: 15000 });
  check('bataille lancée des deux côtés', true);

  // phase placement : chacun voit SA flotte (17 cases) et pas celle de l'autre
  const hostShips = await host.locator('.bn-cell.ship').count();
  const guestShips = await guest.locator('.bn-cell.ship').count();
  check('hôte voit sa flotte (17 cases)', hostShips === 17, hostShips);
  check('invité voit sa flotte (17 cases)', guestShips === 17, guestShips);

  await host.click('[data-a="ready"]');
  await guest.click('[data-a="ready"]');
  await host.waitForSelector('.bn-grid.aim', { timeout: 8000 });
  await guest.waitForSelector('.bn-label', { timeout: 8000 }); // phase de tir (le tour est à l'hôte)
  check('phase de tir des deux côtés', true);
  // l'invité ne doit voir AUCUN bateau adverse sur sa grille de tir (1re grille)
  const guestAimShips = await guest.evaluate(() => {
    const grids = document.querySelectorAll('.bn-grid');
    return grids[0].querySelectorAll('.bn-cell.ship').length;
  });
  check('bateaux de l’hôte invisibles chez l’invité', guestAimShips === 0, guestAimShips);

  // l'hôte tire une case ; l'invité voit le résultat sur SA flotte
  await host.locator('.bn-grid.aim .bn-cell').first().click();
  await guest.waitForFunction(() =>
    document.querySelectorAll('.bn-cell.hit, .bn-cell.miss').length >= 1, null, { timeout: 8000 });
  check('tir synchronisé chez l’invité', true);

  // le dernier tir est mis en évidence des deux côtés
  const lastGuest = await guest.locator('.bn-cell.last').count();
  const lastHost = await host.locator('.bn-cell.last').count();
  check('dernier tir encadré chez l’invité', lastGuest === 1, lastGuest);
  check('dernier tir encadré chez l’hôte', lastHost === 1, lastHost);
  // les deux grilles tiennent sur un seul écran (pas de défilement)
  const hh = await guest.evaluate(() => document.body.scrollHeight);
  check('bataille sur un seul écran (' + hh + 'px pour 844)', hh <= 900, hh);

  await ctxH.close();
  await ctxG.close();
  await browser.close();
  console.log(failures ? failures + ' ÉCHEC(S)' : '\nTests plateforme OK.');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
