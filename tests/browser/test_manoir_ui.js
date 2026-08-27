const ROOT = require('path').join(__dirname, '../..');
const { chromium } = require('playwright');
require(ROOT + '/js/games/registry.js');
const manoir = require(ROOT + '/js/games/manoir.js');

const URL = 'http://localhost:8642/index.html';
let failures = 0;
function check(n, c, e) {
  if (c) console.log('  OK  ' + n);
  else { failures++; console.log('  FAIL ' + n + (e !== undefined ? ' -> ' + JSON.stringify(e) : '')); }
}

/* Retrouve la réponse d'une énigme à partir du texte affiché. */
function answerFor(questionText) {
  const clean = s => s.replace(/\s+/g, ' ').trim().slice(0, 30);
  const q = clean(questionText);
  const e = manoir._ENIGMES.find(x => clean(x.q) === q);
  return e ? e.a[0] : null;
}

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--no-sandbox']
  });

  /* ============ Le Manoir sur un téléphone ============ */
  console.log('--- Le Manoir (1 téléphone) ---');
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => { failures++; console.log('  FAIL JS: ' + e.message); });
  await p.goto(URL);
  await p.click('.game-tile[data-g="manoir"]');
  check('description 12 joueurs', (await p.textContent('#mini-setup-desc')).includes('12'));
  await p.click('#btn-mini-hotseat');
  await p.click('#btn-mini-start');
  await p.waitForSelector('#screen-mini.active');
  check('thème sombre appliqué', await p.evaluate(() =>
    document.body.classList.contains('theme-manoir')));
  const intro = await p.textContent('#mini-area');
  check('lettre d’introduction (décor tiré au sort)',
    /Lord Edmond|Elvira Marsan|Auguste Ferrand/.test(intro), intro.slice(0, 80));
  check('titre du décor affiché',
    /LE MANOIR|L’OPÉRA|LE TRAIN DE NUIT/.test(await p.textContent('.mn-title')));
  check('carte de rôle personnelle sur la lettre', await p.locator('.mn-role').count() === 1);
  check('info confidentielle affichée', intro.includes('🤫'));
  await p.click('[data-a="start"]');
  await p.waitForSelector('.mn-pistes');
  check('6 pistes affichées', await p.locator('.mn-piste').count() === 6);
  // bouton « mon rôle » : ouvre la carte puis revient aux pistes
  check('bouton mon rôle présent', await p.locator('.mn-role-btn').count() === 1);
  await p.click('.mn-role-btn');
  await p.waitForSelector('.mn-role');
  check('vue rôle ouverte', await p.locator('.mn-role').count() === 1);
  await p.click('[data-a="back"]');
  await p.waitForSelector('.mn-pistes');
  check('carnet : 15 entrées', await p.locator('.mn-item').count() === 15);

  // ouvre la 1re piste, tente une mauvaise réponse puis la bonne
  await p.locator('.mn-piste').first().click();
  await p.waitForSelector('.mn-parchment');
  const q = await p.textContent('.mn-parchment');
  const answer = answerFor(q);
  check('énigme reconnue dans la banque', !!answer, q.slice(0, 40));
  await p.fill('#mn-answer', 'quarante-douze');
  await p.click('[data-a="answer"]');
  await p.waitForSelector('.mn-wrong');
  check('mauvaise réponse signalée', true);
  await p.fill('#mn-answer', answer.toLowerCase());
  await p.click('[data-a="answer"]');
  await p.waitForSelector('.mn-clue');
  check('piste élucidée : indices révélés', await p.locator('.mn-clue').count() === 2);
  await p.click('[data-a="back"]');
  await p.waitForSelector('.mn-pistes');
  check('progression 1/6', (await p.textContent('.mn-progress')).includes('1/6'));
  check('2 suspects/armes/lieux barrés au carnet',
    await p.locator('.mn-item.out').count() === 2);

  // accusation volontairement fausse deux fois → révélation de la solution
  for (let round = 0; round < 2; round++) {
    await p.click('[data-a="goaccuse"]');
    await p.waitForSelector('.mn-pick');
    for (const grp of await p.locator('.mn-pick').all()) {
      await grp.locator('.mn-opt.out, .mn-opt').last().click();
    }
    await p.click('[data-a="accuse"]');
    await p.waitForTimeout(300);
    const body = await p.textContent('#mini-area');
    if (body.includes('C’était')) break; // coup de chance : accusation juste
    if (round === 0) {
      check('alarme après la 1re erreur',
        body.includes('une seule tentative') || body.includes('C’était'), body.slice(0, 60));
    }
  }
  const endTxt = await p.textContent('#mini-area');
  check('écran final avec révélation', endTxt.includes('C’était'), endTxt.slice(0, 80));
  check('statistiques affichées', endTxt.includes('pistes') && endTxt.includes('erreurs'));
  await p.click('#btn-mini-menu');
  await p.click('#btn-menu-quit');
  await p.click('#btn-confirm-yes');
  check('thème sombre retiré à la sortie', await p.evaluate(() =>
    !document.body.classList.contains('theme-manoir')));
  await ctx.close();

  /* ============ Le Manoir à 5 téléphones (hôte + 4 invités) ============ */
  console.log('--- Le Manoir (5 téléphones) ---');
  const ctxH = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const host = await ctxH.newPage();
  host.on('pageerror', e => { failures++; console.log('  FAIL host JS: ' + e.message); });
  await host.goto(URL);
  await host.click('.game-tile[data-g="manoir"]');
  await host.click('#btn-mini-host');
  await host.fill('#host-name', 'Hugo');
  await host.click('#btn-host-create');
  await host.waitForSelector('#host-step-lobby:not(.hidden)');

  const guests = [];
  for (let i = 0; i < 4; i++) {
    const gctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const g = await gctx.newPage();
    g.on('pageerror', e => { failures++; console.log('  FAIL invité JS: ' + e.message); });
    await host.click('#btn-host-invite');
    await host.waitForFunction(() => document.getElementById('host-code').value.length > 20);
    const offer = await host.inputValue('#host-code');
    await g.goto(offer);
    await g.waitForSelector('#screen-join.active');
    await g.fill('#join-name', 'Invité' + (i + 1));
    await g.click('#btn-join-scan');
    await g.waitForFunction(() => document.getElementById('join-code').value.length > 20);
    const answer2 = await g.inputValue('#join-code');
    await host.click('#btn-host-scan-answer');
    await host.fill('#host-paste', answer2);
    await host.click('#btn-host-paste-ok');
    await host.waitForSelector('#host-step-lobby:not(.hidden)', { timeout: 15000 });
    guests.push({ ctx: gctx, page: g });
  }
  const lobby = await host.textContent('#lobby-list');
  check('5 joueurs dans le salon (au-delà de l’ancienne limite de 4)',
    ['Hugo', 'Invité1', 'Invité2', 'Invité3', 'Invité4'].every(n => lobby.includes(n)), lobby);

  await host.click('#btn-host-start');
  await host.waitForSelector('#screen-mini.active');
  for (const g of guests) await g.page.waitForSelector('#screen-mini.active', { timeout: 20000 });
  check('les 5 téléphones sont en jeu', true);
  await host.click('[data-a="start"]');
  for (const g of guests) await g.page.waitForSelector('.mn-pistes', { timeout: 10000 });
  check('enquête lancée partout', true);
  check('équipe de 5 affichée', (await guests[3].page.textContent('.mn-team')).includes('5'));

  // l'invité 4 résout une énigme : tout le monde voit la progression
  const g4 = guests[3].page;
  await g4.locator('.mn-piste').first().click();
  await g4.waitForSelector('.mn-parchment');
  const q4 = await g4.textContent('.mn-parchment');
  const a4 = answerFor(q4);
  check('l’énigme de l’invité est dans la banque', !!a4);
  await g4.fill('#mn-answer', a4);
  await g4.click('[data-a="answer"]');
  await g4.waitForSelector('.mn-clue', { timeout: 10000 });
  check('l’invité 4 élucide la piste', true);
  await host.waitForFunction(() =>
    document.querySelector('.mn-progress').textContent.includes('1/6'), null, { timeout: 10000 });
  check('progression 1/6 chez l’hôte', true);
  await guests[0].page.waitForFunction(() =>
    document.querySelector('.mn-progress').textContent.includes('1/6'), null, { timeout: 10000 });
  const clue0 = await guests[0].page.textContent('#mini-area');
  check('l’indice révélé est visible chez l’invité 1', clue0.includes('Hors de cause') ||
    clue0.includes('arme du crime') || clue0.includes('lieu'), clue0.slice(0, 60));

  await ctxH.close();
  for (const g of guests) await g.ctx.close();
  await browser.close();
  console.log(failures ? failures + ' ÉCHEC(S)' : '\nTests Manoir OK.');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
