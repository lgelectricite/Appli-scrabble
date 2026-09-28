/*
 * Words V2 — le test de bout en bout du chantier.
 *
 *   A. Une VRAIE partie solo contre l'IA (412×780), jouée au doigt jusqu'au
 *      bout : tirage au sort, glisser-déposer, zoom, bulle de points,
 *      animations (mot qui s'illumine, points qui jaillissent, tuiles de
 *      l'IA qui arrivent, pioche), IA dans son Web Worker au processeur ×4,
 *      coach, historique, fin de partie détaillée et statistiques.
 *   B. Une partie à deux sur un seul téléphone (360×640) : passage du
 *      téléphone, coup adverse rejoué, mot refusé, mélange, conseils.
 *   C. En ligne (relais local) : l'invité charge le dictionnaire en tâche
 *      de fond, aperçu neutre en attendant (bug 1).
 *   D. Cas limites : l'IA qui passe (bandeau), fin par passes consécutives,
 *      IA sans Web Worker (repli sur le fil principal).
 * Chaque bug de l'audit a son contrôle (préfixe « [bug n] »).
 * Partout : aucune erreur JS, aucun débordement horizontal à 412 et 360 px.
 */
const { chromium } = require('playwright');
const path = require('path');
const { demarrer } = require(path.join(__dirname, '..', 'relais-local.js'));
const URL = process.env.GG_URL || 'http://localhost:8642/index.html';
let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log('  OK  ' + name);
  else { failures++; console.log('  FAIL ' + name + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); }
}
const attends = ms => new Promise(r => setTimeout(r, ms));

function surveille(page, nom) {
  page.on('pageerror', e => { failures++; console.log('  FAIL ' + nom + ' erreur JS : ' + e.message); });
  page.on('console', m => {
    if (m.type() === 'error' && !/favicon|net::ERR/.test(m.text())) {
      failures++; console.log('  FAIL ' + nom + ' console : ' + m.text());
    }
  });
}
async function debordement(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}
const etat = page => page.evaluate(() => window.GGMotsTest.etat());

/* Joue au doigt les placements donnés (lettre du chevalet puis case, joker compris). */
async function poseAuDoigt(page, placements) {
  for (const pl of placements) {
    const lettres = await page.$$eval('#rack .rack-tile', els => els.map(e => e.textContent.replace(/[0-9]/g, '').trim()));
    const cherche = pl.blank ? '★' : pl.letter;
    const k = lettres.indexOf(cherche);
    if (k === -1) return false;
    await page.locator('#rack .rack-tile').nth(k).click();
    await page.locator(`#board .cell[data-i="${pl.index}"]`).click();
    if (pl.blank) {
      await page.waitForSelector('#overlay-joker:not(.hidden)');
      await page.locator('#joker-letters button', { hasText: new RegExp('^' + pl.letter + '$') }).click();
    }
  }
  return true;
}
async function passe(page) {
  await page.click('#btn-pass');
  await page.waitForSelector('#overlay-confirm:not(.hidden)');
  await page.click('#btn-confirm-yes');
}
async function attendsMaMain(page, ms) {
  await page.waitForFunction(() => {
    const b = document.querySelector('#btn-pass');
    return (b && !b.disabled) || (window.GGMotsTest.etat() && window.GGMotsTest.etat().over);
  }, null, { timeout: ms || 40000 });
}

(async () => {
  const relais = await demarrer(8821);
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox']
  });

  /* ================= A. partie solo complète ================= */
  console.log('--- A. Partie solo contre l’IA (412×780), jouée jusqu’au bout ---');
  const ctxA = await browser.newContext({ viewport: { width: 412, height: 780 } });
  const p = await ctxA.newPage();
  surveille(p, 'solo');
  await p.goto(URL);
  await p.evaluate(() => localStorage.setItem('gg-profil', JSON.stringify({ nom: 'Léa', av: '🦊', teinte: 1 })));
  await p.reload();
  await p.click('.game-tile[data-g="mots"]');
  await p.click('#btn-mode-solo');
  check('niveau « expert » proposé', await p.locator('.level-btn[data-level="expert"]').count() === 1);
  check('options de Words : coach et règle classique', await p.locator('#mots-opt-coach-solo').count() === 1 &&
    await p.locator('#mots-opt-refus-solo').count() === 1);
  await p.click('.level-btn[data-level="moyen"]');
  await p.click('#btn-solo-start');
  await p.waitForSelector('#screen-game.active', { timeout: 30000 });
  // [bug 4] tirage au sort animé
  await p.waitForSelector('#mots-tirage', { timeout: 5000 });
  const s0 = await etat(p);
  check('[bug 4] tirage au sort du premier joueur (animation à l’écran)',
    Array.isArray(s0.tirage) && s0.tirage.length >= 1 && s0.current === s0.premier);
  const annonce = await p.textContent('#mots-tirage');
  check('[bug 4] l’animation annonce qui commence', annonce.includes(s0.players[s0.premier].name + ' commence'), annonce);
  const dernierTour = s0.tirage[s0.tirage.length - 1];
  const rang = l => (l === '?' ? -1 : l.charCodeAt(0) - 65);
  check('[bug 4] le premier a la lettre la plus proche du A (joker d’abord)',
    dernierTour.every(t => rang(t.l) >= rang(dernierTour.find(x => x.p === s0.premier).l)));
  check('nom de l’IA accordé (« IA moyenne »)', s0.players[1].name === 'IA moyenne', s0.players[1].name);
  check('pas de débordement à 412 px (tirage)', await debordement(p) <= 0);

  await attendsMaMain(p);
  check('[bug 2] l’IA calcule dans un Web Worker', (await p.evaluate(() => window.GGMotsTest.ia())).worker === true);

  // [bug 5] toucher une case sans lettre choisie : un retour
  const caseVide = (await etat(p)).board.findIndex((c, i) => !c && i !== 112);
  await p.locator(`#board .cell[data-i="${caseVide}"]`).click();
  check('[bug 5] case touchée sans lettre choisie : un conseil s’affiche',
    /lettre de votre chevalet/.test(await p.textContent('#zone-info')) &&
    await p.locator('#zone-info.astuce').count() === 1);
  check('[bug 5] … et le chevalet attire l’œil', await p.locator('#rack.attention').count() === 1);

  // glisser-déposer du chevalet vers le plateau, zoom automatique
  let st = await etat(p);
  const cible = st.board[112] ? st.board.findIndex((c, i) => !c && (st.board[i - 1] || st.board[i + 1])) : 112;
  {
    const t = p.locator('#rack .rack-tile').nth(0);
    const b = await t.boundingBox();
    await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await p.mouse.down();
    await p.mouse.move(b.x + b.width / 2, b.y - 50, { steps: 5 });
    let cb = await p.locator(`#board .cell[data-i="${cible}"]`).boundingBox();
    await p.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2, { steps: 8 });
    check('glisser : une tuile suit le doigt', await p.locator('.mots-fantome .tile').count() === 1);
    await attends(700);
    cb = await p.locator(`#board .cell[data-i="${cible}"]`).boundingBox();
    await p.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2, { steps: 3 });
    await p.mouse.up();
    if (!(await p.locator('#overlay-joker').evaluate(el => el.classList.contains('hidden')))) {
      await p.locator('#joker-letters button').first().click();
    }
  }
  check('glisser-déposer : la lettre est posée sur sa case',
    await p.locator(`#board .cell[data-i="${cible}"] .tile.new`).count() === 1);
  check('zoom automatique autour de la pose', await p.evaluate(() => window.GGMotsTest.zoom()) === true);
  const taille = await p.locator(`#board .cell[data-i="${cible}"]`).boundingBox();
  check('cases d’au moins 40 px une fois zoomé (' + Math.round(taille.width) + ' px)', taille.width >= 40);
  check('bulle de points sur le plateau pendant la pose', await p.locator('#board .bulle').count() === 1);
  await p.click('#btn-zoom');
  await attends(350);
  check('dézoom : tout le plateau visible', await p.evaluate(() => window.GGMotsTest.zoom()) === false);
  await p.click('#btn-recall');

  // [bug 5] mélanger garde les lettres déjà posées
  await p.locator('#rack .rack-tile').nth(0).click();
  await p.locator(`#board .cell[data-i="${cible}"]`).click();
  if (!(await p.locator('#overlay-joker').evaluate(el => el.classList.contains('hidden')))) {
    await p.locator('#joker-letters button').first().click();
  }
  const posees = await p.locator('#board .tile.new').count();
  await p.click('#btn-shuffle');
  check('[bug 5] « Mélanger » laisse les lettres posées sur le plateau',
    posees === 1 && await p.locator('#board .tile.new').count() === 1 &&
    await p.locator('#rack .rack-tile').count() === 6);
  await p.click('#btn-recall');

  // la partie, jouée au doigt ; les premiers coups avec toutes les animations
  let tour = 0, vuEclat = false, vuPoints = false, vuArrivee = false, vuPioche = false, vuPense = false;
  let longues = null, coach = '';
  const cdp = await ctxA.newCDPSession(p);
  await p.evaluate(() => {
    // on guette les tuiles tirées du sac qui arrivent au chevalet
    new MutationObserver(ms => ms.forEach(m => {
      if (m.target.classList && m.target.classList.contains('nouvelle')) window.__vuPioche = true;
    })).observe(document.getElementById('rack'), { subtree: true, attributes: true, attributeFilter: ['class'] });
  });
  while (tour < 60) {
    st = await etat(p);
    if (st.over) break;
    if (tour === 4) {
      // la suite en animations réduites (le test va plus vite)
      await p.evaluate(() => window.GG.reglages.set('animations', 'reduites'));
    }
    const sug = await p.evaluate(() => window.GGMotsTest.suggestion('moyen'));
    const avantH = st.history.length;
    if (sug && sug.kind === 'move' && await poseAuDoigt(p, sug.placements)) {
      if (tour === 0) {
        check('Valider devient vert pour un coup valable', await p.locator('#btn-play.pret').count() === 1);
      }
      await p.click('#btn-play');
    } else {
      if (sug && sug.kind === 'move') await p.click('#btn-recall');
      await passe(p);
    }
    if (tour < 3) {
      await attends(220);
      if (await p.locator('#board .tile.eclat').count()) vuEclat = true;
      await attends(600);
      if (await p.locator('[data-gg-fx="texte"]').count()) vuPoints = true;
      await attends(500);
      if (await p.evaluate(() => !!window.__vuPioche)) vuPioche = true;
    }
    // tour de l'IA : au processeur ×4 pour le 2e tour, on mesure les longues tâches
    if (tour === 1) {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await p.evaluate(() => {
        window.__longues = [];
        try {
          new PerformanceObserver(l => l.getEntries().forEach(e => window.__longues.push(e.duration)))
            .observe({ entryTypes: ['longtask'] });
        } catch (e) {}
      });
    }
    await p.waitForFunction(n => {
      const s = window.GGMotsTest.etat();
      return s.over || s.history.length > n;
    }, avantH, { timeout: 30000 });
    if (tour < 3) {
      await attends(150);
      if (!(await etat(p)).over && await p.locator('#ia-pense:not(.hidden)').count()) vuPense = true;
    }
    await attendsMaMain(p, 60000);
    if (tour < 3 && (await etat(p)).history.slice(-1)[0].type === 'move') {
      // les tuiles de l'IA ont volé depuis son badge (clone volant ou tuile en attente d'arrivée)
      vuArrivee = vuArrivee || await p.evaluate(() => !!window.__vuArrivee);
    }
    if (tour === 1) {
      longues = await p.evaluate(() => window.__longues.slice());
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    }
    if (tour === 2) coach = await p.textContent('#zone-info');
    if (tour === 0) {
      check('pas de débordement à 412 px (partie en cours)', await debordement(p) <= 0);
      await p.evaluate(() => {
        // on guette les tuiles de l'IA en vol (clone de GG.fx.flyTo) pour la suite
        new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => {
          if (n.nodeType === 1 && n.getAttribute('data-gg-fx') === 'vol' && n.querySelector('.tile')) window.__vuArrivee = true;
        }))).observe(document.body, { childList: true });
      });
    }
    tour++;
  }
  st = await etat(p);
  check('la partie solo va jusqu’au bout (' + tour + ' tours, ' + st.history.length + ' coups)', st.over);
  check('animation : le mot validé s’illumine lettre par lettre', vuEclat);
  check('animation : les points jaillissent', vuPoints);
  check('animation : les nouvelles lettres arrivent du sac', vuPioche);
  check('animation : « l’IA réfléchit » pendant son calcul', vuPense);
  check('animation : les tuiles de l’IA volent jusqu’au plateau', vuArrivee);
  const pire = longues && longues.length ? Math.max(...longues) : 0;
  const ms = (await p.evaluate(() => window.GGMotsTest.ia())).dernierMs;
  console.log('  → processeur ×4 : plus longue tâche du fil principal pendant le tour de l’IA : ' +
    Math.round(pire) + ' ms ; calcul de l’IA (Worker) : ' + ms + ' ms');
  check('[bug 2] processeur ×4 : l’écran ne fige pas pendant le tour de l’IA (< 250 ms)', pire < 250, longues);
  check('coach : « le meilleur coup était… » après un coup', /meilleur coup/.test(coach), coach);

  // [bug 5] historique : les points ne chevauchent pas la ligne suivante
  await p.waitForSelector('#overlay-end:not(.hidden)', { timeout: 15000 });
  const finTexte = await p.textContent('#overlay-end');
  check('[bug 5] fin : « L’IA gagne » accordé (plus de « IA moyen gagne »)',
    !/IA moyen gagne/.test(finTexte) && /(L’IA gagne|Léa gagne|Égalité)/.test(finTexte), finTexte.slice(0, 80));
  check('[bug 5] fin : points retirés / ajoutés détaillés',
    /(lettres restantes|lettres des autres|aucune lettre restante)/.test(finTexte), finTexte.slice(0, 300));
  check('fin : statistiques (meilleur mot, moyenne, scrabbles)',
    /pts\/coup/.test(finTexte) && /scrabble/.test(finTexte) && await p.locator('#end-detail .fs-carte').count() === 2);
  await p.click('#btn-end-home');
  // l'historique se lit dans une partie en cours : on en relance une courte
  await p.click('.game-tile[data-g="mots"]');
  await p.click('#btn-mode-solo');
  await p.click('#btn-solo-start');
  await p.waitForSelector('#screen-game.active', { timeout: 30000 });
  await attendsMaMain(p);
  await p.evaluate(() => {
    const s = window.GGMotsTest.etat();
    // un historique chargé, avec des mots longs qui passent à la ligne
    for (let k = 0; k < 6; k++) {
      s.history.push({ player: k % 2, type: 'move', points: 88 + k, bingo: k === 1,
        words: [{ word: 'ANTICONSTITUTION', score: 50 }, { word: 'EXTRAORDINAIRE', score: 30 }, { word: 'ZIGZAGUE', score: 8 }] });
    }
  });
  await p.click('#btn-history');
  await attends(500);
  const chevauche = await p.evaluate(() => {
    const rows = [...document.querySelectorAll('#history-list .h-row')];
    return rows.some((r, i) => {
      const pts = r.querySelector('.mh-pts');
      if (!pts) return true;
      const a = pts.getBoundingClientRect(), b = r.getBoundingClientRect();
      const suivante = rows[i + 1] && rows[i + 1].getBoundingClientRect();
      return a.bottom > b.bottom + 0.5 || (suivante && a.bottom > suivante.top + 0.5);
    });
  });
  check('[bug 5] historique : les points restent dans leur ligne', !chevauche);
  await p.click('#btn-history-close');
  await ctxA.close();

  /* ================= B. à deux sur un téléphone (360×640) ================= */
  console.log('--- B. À deux sur ce téléphone (360×640) ---');
  const ctxB = await browser.newContext({ viewport: { width: 360, height: 640 } });
  const q = await ctxB.newPage();
  surveille(q, 'local');
  await q.goto(URL);
  await q.click('.game-tile[data-g="mots"]');
  await q.click('#btn-mode-local');
  await q.fill('#local-name-1', 'Léa');
  await q.fill('#local-name-2', 'Marc');
  await q.click('#btn-local-start');
  await q.waitForSelector('#mots-tirage', { timeout: 10000 });
  check('pas de débordement à 360 px (tirage)', await debordement(q) <= 0);
  await q.waitForSelector('#overlay-pass:not(.hidden)', { timeout: 30000 });
  const sB = await etat(q);
  check('passez le téléphone au gagnant du tirage', (await q.textContent('#pass-name')) === sB.players[sB.premier].name);
  await q.click('#btn-pass-ready');
  check('actions visibles sans défiler à 360×640', await q.evaluate(() => {
    const r = document.querySelector('#btn-play').getBoundingClientRect();
    return r.bottom <= window.innerHeight;
  }));
  // mot refusé (règle « essais ») : il tremble, un compteur s'affiche
  await q.evaluate(() => {
    const s = window.GGMotsTest.etat();
    s.players[s.current].rack = ['X', 'Q', 'K', 'W', 'Z', 'Y', 'E'];
    window.GGMotsTest.rendu();
  });
  await poseAuDoigt(q, [{ index: 112, letter: 'X' }, { index: 113, letter: 'Q' }]);
  check('aperçu : le mot inconnu est signalé', await q.locator('#move-info.bad').count() === 1);
  await q.click('#btn-play');
  await attends(120);
  check('[bug 6] mot refusé : les tuiles tremblent', await q.locator('#board .tile.refus').count() >= 1);
  await q.waitForSelector('#toast:not(.hidden)');
  check('[bug 6] mot refusé : message avec compteur d’essais', /Encore 2 essais/.test(await q.textContent('#toast')),
    await q.textContent('#toast'));
  await q.click('#btn-play');
  await q.click('#btn-play');
  await attends(800);
  const hB = (await etat(q)).history;
  check('[bug 6] au 3e refus, le tour est perdu (plus de sondage gratuit du dictionnaire)',
    hB.length === 1 && hB[0].type === 'pass' && hB[0].refus === 'XQ', hB);
  // le joueur suivant : un vrai mot, puis rejeu chez l'autre
  await q.waitForSelector('#overlay-pass:not(.hidden)', { timeout: 15000 });
  await q.click('#btn-pass-ready');
  await q.evaluate(() => {
    const s = window.GGMotsTest.etat();
    s.players[s.current].rack = ['C', 'H', 'A', 'T', 'E', 'E', 'S'];
    window.GGMotsTest.rendu();
  });
  await poseAuDoigt(q, [111, 112, 113, 114].map((i, k) => ({ index: i, letter: 'CHAT'[k] })));
  await q.click('#btn-play');
  await q.waitForSelector('#overlay-pass:not(.hidden)', { timeout: 15000 });
  check('le chevalet du joueur suivant reste caché avant « Voir mon jeu »',
    await q.locator('#rack .rack-tile.hidden-face').count() >= 1);
  await q.click('#btn-pass-ready');
  await attends(350);
  check('coup de l’adversaire rejoué : ses tuiles arrivent', await q.locator('#board .tile.arrive').count() >= 1 ||
    await q.locator('[data-gg-fx="vol"]').count() >= 1);
  check('pas de débordement à 360 px (partie)', await debordement(q) <= 0);
  await ctxB.close();

  /* ================= C. en ligne : l'invité et son dictionnaire ================= */
  console.log('--- C. En ligne : l’invité charge le dictionnaire en tâche de fond ---');
  const ctxH = await browser.newContext({ viewport: { width: 412, height: 780 } });
  // service worker bloqué : le test peut retenir le dictionnaire de l'invité
  const ctxG = await browser.newContext({ viewport: { width: 360, height: 640 }, serviceWorkers: 'block' });
  const hote = await ctxH.newPage(), invite = await ctxG.newPage();
  surveille(hote, 'hôte'); surveille(invite, 'invité');
  let libere = null;
  const dicoRetenu = new Promise(r => { libere = r; });
  await invite.route('**/data/mots.txt', async route => { await dicoRetenu; await route.continue(); });
  for (const pg of [hote, invite]) {
    await pg.goto(URL);
    await pg.evaluate(u => localStorage.setItem('gg-relais', u), relais.url);
    await pg.reload();
    await pg.waitForSelector('#catalog .game-tile');
  }
  await hote.click('.game-tile[data-g="mots"]');
  await hote.click('#btn-mode-online');
  await hote.fill('#host-name', 'Hugo');
  await hote.click('#btn-host-create');
  await hote.waitForSelector('#host-step-lobby:not(.hidden)', { timeout: 15000 });
  const code = (await hote.textContent('#host-code-big')).trim();
  await invite.click('#btn-home-online');
  await invite.fill('#online-name', 'Nina');
  await invite.fill('#online-code', code);
  await invite.click('#btn-online-go');
  await invite.waitForSelector('#online-lobby:not(.hidden)', { timeout: 15000 });
  await hote.waitForFunction(() => document.querySelectorAll('.lobby-row').length === 2, null, { timeout: 10000 });
  await hote.click('#btn-host-start');
  await invite.waitForSelector('#screen-game.active', { timeout: 15000 });
  const sN = await etat(invite);
  if (sN.current === 0) {
    await attendsMaMain(hote);
    await passe(hote);
  }
  await attendsMaMain(invite);
  check('invité : dictionnaire pas encore là (retenu par le test)', !(await invite.evaluate(() => window.GGMotsTest.dico())));
  await invite.evaluate(() => {
    const s = window.GGMotsTest.etat();
    s.players[s.current].rack = ['X', 'Q', 'K', 'W', 'Z', 'Y', 'E'];
    window.GGMotsTest.rendu();
  });
  await poseAuDoigt(invite, [{ index: 112, letter: 'X' }, { index: 113, letter: 'Q' }]);
  const neutre = await invite.evaluate(() => {
    const m = document.querySelector('#move-info');
    return !m.classList.contains('good') && !m.classList.contains('bad') && m.classList.contains('neutre') &&
      document.querySelector('#board .bulle.neutre') !== null;
  });
  check('[bug 1] invité sans dictionnaire : aperçu NEUTRE (points sans verdict, jamais vert)', neutre,
    await invite.textContent('#move-info'));
  libere();
  await invite.waitForFunction(() => window.GGMotsTest.dico(), null, { timeout: 20000 });
  await invite.waitForSelector('#move-info.bad', { timeout: 5000 });
  check('[bug 1] dictionnaire arrivé : « XQ » est signalé inconnu (rouge)', /dictionnaire/.test(await invite.textContent('#move-info')));
  check('pas de débordement (invité 360 px, hôte 412 px)', await debordement(invite) <= 0 && await debordement(hote) <= 0);
  await ctxH.close();
  await ctxG.close();

  /* ================= D. cas limites ================= */
  console.log('--- D. Cas limites ---');
  const ctxD = await browser.newContext({ viewport: { width: 412, height: 780 } });
  const d = await ctxD.newPage();
  surveille(d, 'limites');
  await d.goto(URL);
  await d.click('.game-tile[data-g="mots"]');
  await d.click('#btn-mode-solo');
  await d.click('#btn-solo-start');
  await d.waitForSelector('#screen-game.active', { timeout: 30000 });
  await attendsMaMain(d);
  // [bug 5] l'IA passe : le bandeau ne rappelle plus un vieux « a joué »
  await d.evaluate(() => {
    const s = window.GGMotsTest.etat();
    // l'IA a joué un mot…
    s.history.push({ player: 1, type: 'move', points: 4, words: [{ word: 'DOL', score: 4 }], cells: [] });
    s.lastMove = { player: 1, cells: [], words: ['DOL'], points: 4 };
    // …puis elle ne pourra plus rien faire : plateau vide, une seule lettre, sac presque vide
    s.board = s.board.map(() => null);
    s.moveCount = 0;
    s.players[1].rack = ['Q'];
    s.bag = s.bag.slice(0, 3);
    window.GGMotsTest.rendu();
  });
  check('bandeau : « L’IA a joué DOL (4 pts) »', /L’IA a joué DOL \(4 pts\)/.test(await d.textContent('#turn-banner')));
  await passe(d);
  await d.waitForFunction(() => window.GGMotsTest.etat().history.slice(-1)[0].player === 1 &&
    window.GGMotsTest.etat().current === 0, null, { timeout: 30000 });
  const derniereIA = (await etat(d)).history.slice(-1)[0];
  const bandeau = await d.textContent('#turn-banner');
  check('[bug 5] après une passe de l’IA, plus de « L’IA a joué DOL » dans le bandeau',
    derniereIA.type === 'pass' && !/a joué/.test(bandeau) && /a passé son tour/.test(bandeau), bandeau);
  // [bug 3] fin par passes : chaque joueur passe trois fois de suite, les échanges ne comptent pas
  const regles = await d.evaluate(() => {
    document.getElementById('btn-rules').click();
    return document.getElementById('rules-body').textContent;
  });
  check('[bug 3] règles affichées : trois « je passe » de suite, l’échange n’en est pas un',
    /trois fois de suite/.test(regles) && /échange/.test(regles), regles.slice(0, 120));
  await d.click('#btn-rules-close');
  for (let k = 0; k < 3; k++) {
    await attendsMaMain(d);
    if ((await etat(d)).over) break;
    await passe(d);
    await d.waitForFunction(() => window.GGMotsTest.etat().over || window.GGMotsTest.etat().current === 0,
      null, { timeout: 30000 });
  }
  await d.waitForSelector('#overlay-end:not(.hidden)', { timeout: 15000 });
  check('[bug 3] partie finie quand chaque joueur a passé trois fois de suite',
    /trois fois de suite/.test(await d.textContent('#end-detail')));
  check('pas de débordement (fin de partie)', await debordement(d) <= 0);
  await ctxD.close();

  // repli : pas de Web Worker → l'IA calcule sur le fil principal, la partie continue
  const ctxE = await browser.newContext({ viewport: { width: 412, height: 780 } });
  const e = await ctxE.newPage();
  surveille(e, 'sans worker');
  await e.addInitScript(() => { window.Worker = undefined; });
  await e.goto(URL);
  await e.click('.game-tile[data-g="mots"]');
  await e.click('#btn-mode-solo');
  await e.click('#btn-solo-start');
  await e.waitForSelector('#screen-game.active', { timeout: 30000 });
  await attendsMaMain(e);
  // deux tours de l'IA au processeur ×4 : le 1er construit l'arbre des préfixes, le 2e est un tour courant
  const cdpE = await ctxE.newCDPSession(e);
  await cdpE.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const mesures = [];
  for (let k = 0; k < 2; k++) {
    await attendsMaMain(e, 90000);
    const h0 = (await etat(e)).history.length;
    await passe(e);
    await e.waitForFunction(n => window.GGMotsTest.etat().history.length >= n + 2, h0, { timeout: 90000 });
    mesures.push((await e.evaluate(() => window.GGMotsTest.ia())).dernierMs);
  }
  await cdpE.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  console.log('  → sans Worker, processeur ×4 : 1er tour de l’IA ' + mesures[0] + ' ms (dont construction de ' +
    'l’arbre), tour suivant ' + mesures[1] + ' ms');
  check('[bug 2] sans Web Worker : repli sur le fil principal, l’IA joue quand même',
    (await e.evaluate(() => window.GGMotsTest.ia())).worker === false);
  check('repli au processeur ×4 : un tour courant de l’IA reste sous la seconde', mesures[1] < 1000, mesures);
  await ctxE.close();

  await browser.close();
  await relais.arreter();
  console.log(failures ? `\n${failures} ÉCHEC(S)` : '\nWords V2 : tout passe.');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('ERREUR FATALE :', e); process.exit(1); });
