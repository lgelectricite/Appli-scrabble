/*
 * V2 — le jeu en ligne résiste aux coupures (téléphones simulés + vrai relais).
 *
 * Un mandataire TCP entre les téléphones et le relais permet de simuler un
 * changement de réseau : le téléphone perd sa connexion, le relais ne voit
 * rien (connexion « à moitié ouverte »), exactement comme dans la vraie vie.
 */
const net = require('net');
const { chromium } = require('playwright');
const { demarrer } = require('../relais-local.js');
const URL_APP = (process.env.GG_URL || 'http://localhost:8642/index.html');
const PORT_RELAIS = parseInt(process.env.GG_PORT_RELAIS || '8805', 10);
const PORT_PROXY = PORT_RELAIS + 1;
let failures = 0;
function check(n, c, e) {
  if (c) console.log('  OK  ' + n);
  else { failures++; console.log('  FAIL ' + n + (e !== undefined ? ' -> ' + JSON.stringify(e) : '')); }
}
const pause = ms => new Promise(r => setTimeout(r, ms));

function mandataire(portEcoute, portRelais) {
  const conns = [];
  const srv = net.createServer((client) => {
    const c = { client, amont: null, info: '', coupe: false };
    conns.push(c);
    const amont = net.connect(portRelais, '127.0.0.1');
    c.amont = amont;
    let premier = true;
    client.on('data', (d) => {
      if (premier) { premier = false; c.info = d.toString().split('\r\n')[0]; }
      if (!c.coupe) amont.write(d);
    });
    amont.on('data', (d) => { if (!c.coupe) { try { client.write(d); } catch (e) {} } });
    client.on('close', () => { if (!c.coupe) amont.destroy(); });
    amont.on('close', () => { if (!c.coupe) client.destroy(); });
    client.on('error', () => {}); amont.on('error', () => {});
  });
  return new Promise((res) => srv.listen(portEcoute, '127.0.0.1', () => res({
    // le téléphone perd le réseau : sa connexion meurt, le relais n'en sait rien
    couperTelephone(filtre) {
      let n = 0;
      for (const c of conns) {
        if (!c.coupe && !c.client.destroyed && filtre(c.info)) { c.coupe = true; c.client.destroy(); n++; }
      }
      return n;
    },
    // bien plus tard, le relais s'aperçoit que ces connexions sont mortes
    liberer() { for (const c of conns) if (c.coupe && !c.amont.destroyed) c.amont.destroy(); },
    fermer: () => new Promise(r => { conns.forEach(c => { c.client.destroy(); c.amont.destroy(); }); srv.close(() => r()); })
  })));
}

(async () => {
  const relais = await demarrer(PORT_RELAIS, { grace: 20000 });
  const prox = await mandataire(PORT_PROXY, PORT_RELAIS);
  const urlRelais = 'ws://127.0.0.1:' + PORT_PROXY;
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox']
  });

  async function telephone(nom) {
    const ctx = await browser.newContext({ viewport: { width: 412, height: 780 } });
    await ctx.addInitScript((u) => {
      try { localStorage.setItem('gg-relais', u); } catch (e) {}
      window.__sortants = [];
      const W = window.WebSocket;
      window.WebSocket = function (u2, p) {
        const ws = p ? new W(u2, p) : new W(u2);
        const s = ws.send.bind(ws);
        ws.send = d => { window.__sortants.push(String(d)); return s(d); };
        return ws;
      };
      window.WebSocket.prototype = W.prototype;
      window.WebSocket.OPEN = 1; window.WebSocket.CONNECTING = 0; window.WebSocket.CLOSED = 3;
      // tous les messages éphémères affichés (un toast en remplace un autre)
      window.__toasts = [];
      document.addEventListener('DOMContentLoaded', () => {
        const el = document.getElementById('toast');
        if (el) new MutationObserver(() => { if (el.textContent) window.__toasts.push(el.textContent); })
          .observe(el, { childList: true, characterData: true, subtree: true });
      });
    }, urlRelais);
    const page = await ctx.newPage();
    const t = { nom, ctx, page, erreurs: [] };
    page.on('pageerror', e => { t.erreurs.push(e.message); failures++; console.log('  FAIL JS (' + nom + '): ' + e.message); });
    await page.goto(URL_APP);
    await page.waitForSelector('#catalog .game-tile');
    return t;
  }
  const banniere = (p) => p.evaluate(() => {
    for (const id of ['mini-net-banner', 'net-banner']) {
      const b = document.getElementById(id);
      if (b && !b.classList.contains('hidden') && b.closest('.screen.active')) return b.textContent.replace(/\s+/g, ' ').trim();
    }
    return '';
  });
  const sortants = (p) => p.evaluate(() => window.__sortants.slice());
  async function dire(emetteur, texte) {
    await emetteur.page.evaluate(() => { const b = document.getElementById('btn-mini-chat'); if (b) b.click(); });
    await emetteur.page.fill('#chat-in', texte);
    await emetteur.page.press('#chat-in', 'Enter');
    await emetteur.page.evaluate(() => { const b = document.getElementById('btn-chat-close'); if (b) b.click(); });
  }
  const aLu = (p, texte, ms) => p.waitForFunction((t) => document.getElementById('chat-log').textContent.includes(t),
    texte, { timeout: ms || 8000 }).then(() => true, () => false);
  async function discs(p) { return p.evaluate(() => document.querySelectorAll('.p4-disc:not(.mini)').length); }

  async function table(jeu, nomHote, noms) {
    const H = await telephone(nomHote);
    await H.page.click('.game-tile[data-g="' + jeu + '"]');
    await H.page.click('#btn-mini-online');
    await H.page.fill('#host-name', nomHote);
    await H.page.click('#btn-host-create');
    await H.page.waitForSelector('#host-step-lobby:not(.hidden)', { timeout: 15000 });
    const code = (await H.page.textContent('#host-code-big')).trim();
    const G = [];
    for (const n of noms) {
      const g = await telephone(n);
      await g.page.goto(URL_APP + '#c=' + code);
      await g.page.waitForSelector('#screen-online.active');
      await g.page.fill('#online-name', n);
      await g.page.click('#btn-online-go');
      await g.page.waitForSelector('#online-lobby:not(.hidden)', { timeout: 15000 });
      G.push(g);
    }
    await H.page.waitForFunction((k) => document.querySelectorAll('#lobby-list .lobby-row').length === k + 1,
      noms.length, { timeout: 15000 });
    return { H, G, code };
  }
  async function lancer(H, G) {
    await H.page.click('#btn-host-start');
    await H.page.waitForSelector('#screen-mini.active', { timeout: 15000 });
    for (const g of G) await g.page.waitForSelector('#screen-mini.active', { timeout: 15000 });
  }

  /* ------------------------------------------------------------------ */
  console.log('--- Invitation : le lien dit qui invite, et à quoi ---');
  {
    const { H, G, code } = await table('p4', 'Loïc', ['Manon']);
    const lien = await H.page.evaluate(() => {
      // le texte d'invitation contient le lien complet
      return document.getElementById('host-code-big').textContent;
    });
    check('code affiché', lien.trim() === code);
    const T = await telephone('Tiers');
    await T.page.goto(URL_APP.replace('index.html', '') + 'index.html?jeu=p4&de=' +
      encodeURIComponent('<i>Loïc</i>') + '#c=' + code);
    await T.page.waitForSelector('#screen-online.active');
    const carte = await T.page.textContent('#online-invit');
    check('carte d’invitation : le jeu et l’hôte', /Puissance/.test(carte) && /Loïc/.test(carte), carte);
    check('le prénom de l’hôte est affiché comme du texte (jamais interprété)',
      carte.includes('<i>Loïc</i>') && (await T.page.locator('#online-invit i').count()) === 0, carte);
    check('le code est pré-rempli', (await T.page.inputValue('#online-code')) === code);
    check('l’adresse est nettoyée après lecture', !(await T.page.evaluate(() => location.search + location.hash)));
    await T.ctx.close();

    console.log('--- Un seul « bonjour » par connexion ---');
    await lancer(H, G);
    const M = G[0];
    const hellos = (await sortants(M.page)).filter(x => x.includes('"hello"'));
    check('l’invitée n’a dit bonjour qu’une fois', hellos.length === 1, hellos);
    check('l’invitée a reçu un jeton de siège', await M.page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('gg-siege') || 'null'); return !!(s && s.jeton && s.jeton.length >= 16);
    }));

    console.log('--- L’invitée ferme l’appli puis revient par le lien ---');
    await M.page.close();
    await pause(500);
    check('l’hôte la voit déconnectée, et l’attend', /Manon.*déconnect/.test(await banniere(H.page)), await banniere(H.page));
    M.page = await M.ctx.newPage();
    M.page.on('pageerror', e => { failures++; console.log('  FAIL JS (Manon) ' + e.message); });
    await M.page.goto(URL_APP + '#c=' + code);
    await M.page.waitForSelector('#screen-online.active');
    await M.page.click('#btn-online-go');
    await M.page.waitForSelector('#screen-mini.active', { timeout: 10000 });
    await pause(400);
    const hellos2 = (await sortants(M.page)).filter(x => x.includes('"hello"'));
    check('retour : un seul bonjour, avec le jeton', hellos2.length === 1 && /jeton/.test(hellos2[0]), hellos2);
    check('l’hôte n’affiche plus de déconnexion', !(await banniere(H.page)), await banniere(H.page));
    await dire(M, 'coucou-retour');
    check('l’invitée revenue parle à l’hôte', await aLu(H.page, 'coucou-retour'));
    await dire(H, 'bien-recu');
    check('l’hôte lui répond', await aLu(M.page, 'bien-recu'));

    console.log('--- Changement de réseau de l’invitée (connexion fantôme) ---');
    prox.couperTelephone(i => i.includes('r=g'));
    await pause(1500);
    await dire(M, 'apres-4g');
    check('après le changement de réseau, le message passe', await aLu(H.page, 'apres-4g', 10000));
    check('toujours un seul siège pour Manon', (await H.page.textContent('#mini-players')).split('Manon').length === 2);

    console.log('--- Micro-coupure franche de l’hôte ---');
    const avant = await discs(M.page);
    prox.couperTelephone(i => i.includes('r=h'));
    prox.liberer();
    await pause(300);
    const bM = await banniere(M.page);
    check('l’invitée est prévenue que l’hôte revient (pas « a quitté »)', !/quitté/.test(bM), bM);
    await pause(2500);
    check('après la coupure : plus de bandeau chez l’invitée', !(await banniere(M.page)), await banniere(M.page));
    check('le code n’a pas changé', (await H.page.evaluate(() =>
      JSON.parse(localStorage.getItem('gg-partie') || '{}').code)) === code);
    await H.page.locator('.p4-cell[data-col="3"]').first().click();
    await M.page.waitForFunction((n) => document.querySelectorAll('.p4-disc:not(.mini)').length > n, avant,
      { timeout: 8000 }).catch(() => {});
    check('la partie continue : le coup de l’hôte arrive', (await discs(M.page)) > avant);

    console.log('--- Changement de réseau de l’hôte (connexion fantôme, même code) ---');
    prox.couperTelephone(i => i.includes('r=h'));
    await pause(2500);
    await dire(H, 'hote-en-4g');
    check('l’hôte a repris SON code et parle', await aLu(M.page, 'hote-en-4g', 10000));
    await dire(M, 'vers-hote-4g');
    check('l’invitée lui répond', await aLu(H.page, 'vers-hote-4g', 10000));

    console.log('--- « Reconnecter » ne renvoie jamais vers le scan de QR ---');
    await M.page.evaluate(() => { document.getElementById('mini-net-banner').classList.remove('hidden'); });
    await M.page.click('#btn-mini-reconnect');
    await pause(1200);
    check('l’invitée reste dans la partie', await M.page.locator('#screen-mini.active').count() === 1);
    check('aucun écran QR', await M.page.locator('#screen-join.active').count() === 0);

    console.log('--- L’hôte recharge l’appli : il reprend sa partie en ligne ---');
    const coups = await discs(H.page);
    await H.page.reload();
    await H.page.waitForSelector('#btn-reprise', { timeout: 8000 });
    const carteReprise = await H.page.textContent('#btn-reprise');
    check('carte « Reprendre » : partie en ligne avec son code', /en ligne/.test(carteReprise) && carteReprise.includes(code), carteReprise);
    await pause(400);
    const bAttente = await banniere(M.page);
    check('pendant ce temps, l’invitée attend l’hôte', /attend/.test(bAttente), bAttente);
    await H.page.click('#btn-reprise');
    await H.page.waitForSelector('#screen-mini.active', { timeout: 10000 });
    await H.page.waitForFunction(() => !/déconnect|Réouverture/.test(
      (document.getElementById('mini-net-banner').classList.contains('hidden') ? '' : document.getElementById('mini-net-banner').textContent)),
    null, { timeout: 15000 }).catch(() => {});
    check('l’invitée a retrouvé sa place', !(await banniere(H.page)), await banniere(H.page));
    check('la grille est intacte chez l’hôte', (await discs(H.page)) === coups, [await discs(H.page), coups]);
    await dire(M, 'toujours-la');
    check('et la conversation reprend', await aLu(H.page, 'toujours-la', 10000));

    console.log('--- Fin de partie : revanche demandée par l’invitée, changement de jeu ---');
    // P4 se joue en manches : on affiche l'écran de fin des deux côtés
    await H.page.evaluate(() => GG.__finDePartie());
    await M.page.evaluate(() => GG.__finDePartie());
    await M.page.waitForSelector('#overlay-end:not(.hidden)', { timeout: 10000 });
    check('l’invitée voit « Je veux la revanche »', /revanche/i.test(await M.page.textContent('#btn-end-new')) &&
      await M.page.locator('#btn-end-new:not(.hidden)').count() === 1);
    await M.page.click('#btn-end-new');
    await H.page.waitForFunction(() => /Manon/.test(document.getElementById('end-revanches').textContent),
      null, { timeout: 8000 }).catch(() => {});
    check('l’hôte voit qui est partant', /Partant.*Manon/.test(await H.page.textContent('#end-revanches')),
      await H.page.textContent('#end-revanches'));
    check('l’hôte peut changer de jeu', await H.page.locator('#btn-end-switch:not(.hidden)').count() === 1);
    await H.page.click('#btn-end-switch');
    await H.page.waitForSelector('#overlay-switch:not(.hidden)');
    const proposes = await H.page.$$eval('#switch-jeux .game-tile', l => l.map(x => x.dataset.g));
    check('jeux proposés pour 2 joueurs (morpion oui, solitaire non)',
      proposes.indexOf('morpion') !== -1 && proposes.indexOf('solitaire') === -1, proposes);
    await H.page.click('#switch-jeux .game-tile[data-g="morpion"]');
    await H.page.waitForSelector('#screen-mini.active');
    await M.page.waitForFunction(() => document.body.getAttribute('data-jeu') === 'morpion', null, { timeout: 10000 })
      .catch(() => {});
    check('toute la bande passe au Morpion, sans nouveau code',
      (await M.page.evaluate(() => document.body.getAttribute('data-jeu'))) === 'morpion' &&
      await M.page.locator('#overlay-end:not(.hidden)').count() === 0);

    console.log('--- Un ami arrive en retard : il joue à la partie suivante ---');
    const N = await telephone('Nina');
    await N.page.goto(URL_APP + '#c=' + code);
    await N.page.waitForSelector('#screen-online.active');
    await N.page.fill('#online-name', 'Nina');
    await N.page.click('#btn-online-go');
    await N.page.waitForFunction(() => /suivante/.test(document.getElementById('online-waiting').textContent),
      null, { timeout: 8000 }).catch(() => {});
    check('Nina patiente en salle d’attente (pas refusée)',
      /suivante/.test(await N.page.textContent('#online-waiting')), await N.page.textContent('#online-waiting'));

    console.log('--- L’invitée quitte : l’hôte le sait ---');
    await M.page.click('#btn-mini-menu');
    await M.page.click('#btn-menu-quit');
    await M.page.click('#btn-confirm-yes');
    await pause(800);
    check('l’hôte sait que Manon a quitté (et non « déconnectée »)', /Manon a quitté/.test(await banniere(H.page)),
      await banniere(H.page));

    console.log('--- L’hôte change de jeu : Nina entre dans la partie ---');
    await H.page.evaluate(() => GG.__finDePartie());
    check('l’hôte voit que Nina attend', /Nina attend/.test(await H.page.textContent('#end-revanches')),
      await H.page.textContent('#end-revanches'));
    await H.page.click('#btn-end-switch');
    await H.page.waitForSelector('#overlay-switch:not(.hidden)');
    await H.page.click('#switch-jeux .game-tile[data-g="p4"]');
    await N.page.waitForSelector('#screen-mini.active', { timeout: 10000 }).catch(() => {});
    check('Nina joue à la partie suivante', await N.page.locator('#screen-mini.active').count() === 1);
    check('Manon, partie, n’en est plus', !/Manon/.test(await H.page.textContent('#mini-players')),
      await H.page.textContent('#mini-players'));

    console.log('--- L’hôte arrête : tout le monde est prévenu tout de suite ---');
    await H.page.click('#btn-mini-menu');
    await H.page.click('#btn-menu-quit');
    await H.page.click('#btn-confirm-yes');
    await N.page.waitForSelector('#screen-home.active', { timeout: 5000 }).catch(() => {});
    check('Nina revient à l’accueil avec un message', await N.page.locator('#screen-home.active').count() === 1);
    for (const t of [H, M, N]) await t.ctx.close();
  }

  /* ------------------------------------------------------------------ */
  console.log('--- Homonymes : deux « Joueur » ---');
  {
    const { H, G } = await table('huit', 'Hôte', ['Joueur', 'Joueur']);
    // le salon montre les prénoms attribués (le jeu peut masquer les badges)
    const noms = await H.page.textContent('#lobby-list');
    check('le second devient « Joueur 2 »', /Joueur 2/.test(noms), noms);
    await lancer(H, G);
    const J2 = G[1];
    await J2.page.reload();
    await J2.page.waitForSelector('#catalog .game-tile');
    await J2.page.click('#btn-home-online');
    await J2.page.fill('#online-name', 'Joueur');
    const codeJ = await H.page.evaluate(() => JSON.parse(localStorage.getItem('gg-partie') || '{}').code);
    await J2.page.fill('#online-code', codeJ || '');
    await J2.page.click('#btn-online-go');
    await J2.page.waitForSelector('#screen-mini.active', { timeout: 10000 }).catch(() => {});
    check('« Joueur 2 » retrouve SA place malgré le prénom tapé (jeton)',
      await J2.page.locator('#screen-mini.active').count() === 1 && !(await banniere(H.page)), await banniere(H.page));
    for (const t of [H].concat(G)) await t.ctx.close();
  }

  /* ------------------------------------------------------------------ */
  console.log('--- 12 joueurs : un bavard ne fait pas tomber la partie ---');
  {
    const noms = [];
    for (let i = 1; i <= 11; i++) noms.push('Ami' + i);
    const { H, G } = await table('quiz', 'Hôte', noms);
    await lancer(H, G);
    const avant = (await sortants(H.page)).length;
    const B = G[0];
    await B.page.evaluate(() => { const b = document.getElementById('btn-mini-chat'); if (b) b.click(); });
    await B.page.waitForSelector('.chat-q');
    // 30 émojis d'affilée, sans attendre (une vraie rafale)
    await B.page.evaluate(() => { const q = document.querySelector('.chat-q'); for (let k = 0; k < 30; k++) q.click(); });
    await pause(1500);
    const envois = (await sortants(H.page)).length - avant;
    check('30 émojis d’un invité : l’hôte envoie peu (' + envois + ' messages)', envois < 60, envois);
    check('le bavard est freiné', await B.page.evaluate(() => window.__toasts.some(t => /Doucement/.test(t))));
    const dernier = G[10];
    check('les autres reçoivent la conversation', await aLu(dernier.page, '👍'));
    check('l’hôte est toujours là', !(await banniere(dernier.page)), await banniere(dernier.page));
    for (const t of [H].concat(G)) await t.ctx.close();
  }

  await browser.close();
  await prox.fermer();
  await relais.arreter();
  console.log(failures ? '\n' + failures + ' ÉCHEC(S)' : '\nTests du jeu en ligne (V2) OK.');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
