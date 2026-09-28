/*
 * V2 — les jeux de soirée joués pour de vrai, sur plusieurs téléphones.
 *
 * Le Manoir (5 téléphones), L'Imposteur (5, avec Mister White), le Quiz (4),
 * Le Plus Proche (3) et la Discussion (3) passent par le mode « En ligne »
 * avec le VRAI relais (tests/relais-local.js), puis le Quiz (animateur) et le
 * Manoir (rôles) sur un seul téléphone.
 *
 * Pour chaque jeu : aucune erreur JS, rien ne déborde à 412 et 360 px,
 * les animations clés sont là, un contrôle par bug de l'audit, et une
 * inspection de ce que CHAQUE téléphone reçoit (aucune fuite de secret).
 * Fluidité : une révélation mesurée avec un processeur ralenti ×4.
 *
 * Captures (hôte ET invités) : GG_SHOTS=<dossier>/ node tests/browser/test_v2_soiree.js
 */
const { chromium } = require('playwright');
const { demarrer } = require('../relais-local.js');
const URL_APP = process.env.GG_URL || 'http://localhost:8642/index.html';
const SHOTS = process.env.GG_SHOTS || '';
let failures = 0;
function check(n, c, e) {
  if (c) console.log('  OK  ' + n);
  else { failures++; console.log('  FAIL ' + n + (e !== undefined ? ' -> ' + JSON.stringify(e).slice(0, 300) : '')); }
}
const attendre = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const relais = await demarrer(8828);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const TAILLES = [[412, 780], [412, 780], [360, 640], [360, 640], [412, 780]];
  const NOMS = ['Hugo', 'Léa', 'Marc', 'Nina', 'Zoé'];
  const P = [];
  for (let i = 0; i < 5; i++) {
    const ctx = await browser.newContext({ viewport: { width: TAILLES[i][0], height: TAILLES[i][1] }, hasTouch: false });
    const p = await ctx.newPage();
    p._nom = NOMS[i];
    p.on('pageerror', e => { failures++; console.log('  FAIL JS (' + p._nom + ') : ' + e.message); });
    P.push(p);
  }

  /* ---------- outils ---------- */
  async function preparer(p) {
    await p.goto(URL_APP);
    await p.evaluate(u => localStorage.setItem('gg-relais', u), relais.url);
    await p.reload();
    await p.waitForSelector('#catalog .game-tile');
    // espion : ce que CE téléphone reçoit et affiche (état déjà filtré)
    await p.evaluate(() => {
      window.__etats = {};
      Object.keys(GG.byId).forEach(id => {
        const m = GG.byId[id];
        if (!m.render || m.__espion) return;
        const r = m.render;
        m.render = function (el, ctx) {
          window.__etats[id] = JSON.parse(JSON.stringify(ctx.state));
          window.__moi = ctx.me;
          return r.call(this, el, ctx);
        };
        m.__espion = true;
      });
      window.__sons = [];
      const jouer = GG.sfx.play.bind(GG.sfx);
      GG.sfx.play = (n, o) => { window.__sons.push(n); return jouer(n, o); };
    });
  }
  async function salon(jeu, pages) {
    for (const p of pages) await preparer(p);
    const [h, ...gs] = pages;
    await h.click('.game-tile[data-g="' + jeu + '"]');
    await h.click('#btn-mini-online');
    await h.fill('#host-name', h._nom);
    await h.click('#btn-host-create');
    await h.waitForSelector('#host-step-lobby:not(.hidden)', { timeout: 15000 });
    const code = (await h.textContent('#host-code-big')).trim();
    for (const g of gs) {
      await g.click('#btn-home-online');
      await g.fill('#online-name', g._nom);
      await g.fill('#online-code', code);
      await g.click('#btn-online-go');
      await g.waitForSelector('#online-lobby:not(.hidden)', { timeout: 15000 });
    }
    await h.waitForFunction(n => document.querySelectorAll('.lobby-row').length === n, pages.length, { timeout: 15000 });
    await h.click('#btn-host-start');
    for (const p of pages) await p.waitForSelector('#screen-mini.active', { timeout: 20000 });
  }
  const etat = (p, jeu) => p.evaluate(j => ({ s: window.__etats[j], me: window.__moi }), jeu);
  async function debordements(pages) {
    const out = [];
    for (const p of pages) {
      const d = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (d > 0) out.push(p._nom + ' +' + d + 'px');
    }
    return out;
  }
  async function capture(p, nom) {
    if (SHOTS) await p.screenshot({ path: SHOTS + 'v2_' + nom + '_' + p.viewportSize().width + '.png' });
  }
  async function tous(pages, sel, timeout) {
    for (const p of pages) await p.waitForSelector(sel, { timeout: timeout || 15000 });
  }
  /* Fluidité : images par seconde pendant une animation, processeur ×4 */
  async function fluidite(p, declencher) {
    const cdp = await p.context().newCDPSession(p);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await p.evaluate(() => {
      window.__img = [];
      let t0 = performance.now();
      const f = t => { window.__img.push(t - t0); t0 = t; if (window.__img.length < 240) requestAnimationFrame(f); };
      requestAnimationFrame(f);
    });
    await declencher();
    await p.waitForTimeout(2200);
    const img = (await p.evaluate(() => window.__img)).slice(2).sort((a, b) => a - b);
    if (!img.length) img.push(999);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await cdp.detach();
    const q = f => img[Math.min(img.length - 1, Math.floor(img.length * f))] || 999;
    return { n: img.length, mediane: Math.round(q(0.5)), p90: Math.round(q(0.9)), lentes: img.filter(x => x > 100).length };
  }

  /* ===================================================================
   * LE MANOIR — 5 téléphones
   * =================================================================== */
  console.log('--- Le Manoir : 5 téléphones en ligne ---');
  {
    await salon('manoir', P);
    const [h, g1, g2, g3, g4] = P;
    await h.waitForSelector('[data-a="start"]');
    await capture(g2, 'manoir_lettre_invite');
    await h.click('[data-a="start"]');
    await tous(P.slice(1), '[data-a="lu"]');
    check('chacun reçoit son rôle sur SON téléphone', await g1.locator('.mn-role').count() === 1);
    // ce que reçoit chaque invité : ni la solution, ni les dossiers des autres
    const fuites = [], prives = [];
    for (const p of P.slice(1)) {
      const { s, me } = await etat(p, 'manoir');
      if (s.solution) fuites.push(p._nom + ' : solution');
      if (s.coeur) fuites.push(p._nom + ' : cœur de l’affaire');
      s.players.forEach((pl, k) => { if (k !== me && pl.prive) fuites.push(p._nom + ' : dossier de ' + pl.name); });
      (s.pistes || []).forEach(pi => { if (pi.answers) fuites.push(p._nom + ' : réponses d’énigme'); });
      prives.push(JSON.stringify(s.players[me].prive || []));
    }
    check('aucune fuite : chaque téléphone ne reçoit que SON dossier, jamais la solution', !fuites.length, fuites);
    check('bug 3 : les indices sont répartis (un dossier différent par joueur)', new Set(prives).size === prives.length && prives.every(x => x.length > 4));
    for (const p of P) { if (await p.locator('[data-a="lu"]').count()) await p.click('[data-a="lu"]'); }
    await h.waitForTimeout(500);
    if (await h.locator('[data-a="goplay"]').count()) await h.click('[data-a="goplay"]');
    await tous(P, '.mn-pistes');
    check('bug 3 : cinq témoignages contradictoires à croiser', (await etat(g3, 'manoir')).s.temoignages.length === 5);
    // bug 2 : saisie tolérante (article) sur le téléphone de Marc
    await g2.locator('.mn-piste').first().click();
    await g2.waitForSelector('.mn-parchment');
    const q = (await g2.textContent('.mn-parchment')).replace(/\s+/g, ' ').trim();
    const rep = await g2.evaluate(qq => {
      const net = s => s.replace(/\s+/g, ' ').trim();
      for (const sc of GG.byId.manoir._SCENARIOS) for (const pi of sc.pistes) for (const e of pi.enigmes) if (qq.indexOf(net(e.q)) !== -1) return e.a[0];
      return null;
    }, q);
    await g2.fill('#mn-answer', 'la ' + String(rep).toLowerCase());
    await g2.click('[data-a="answer"]');
    await g2.waitForSelector('.mn-clue', { timeout: 10000 });
    check('bug 2 : réponse acceptée malgré l’article (« la … »)', true);
    await h.waitForFunction(() => /1\/6/.test(document.querySelector('.mn-progress').textContent), null, { timeout: 10000 });
    check('la piste élucidée apparaît chez l’hôte', true);
    await g2.click('[data-a="back"]');
    // bug 1 : accusation — double appui, puis vote du groupe
    await g1.click('[data-a="goaccuse"]');
    await g1.waitForSelector('.mn-pick');
    for (const gp of ['s', 'a', 'l']) await g1.locator('[data-a="pick"][data-g="' + gp + '"]').last().click();
    await g1.click('[data-a="confirmer"]');
    await g1.waitForSelector('.mn-modal');
    check('bug 1 : une fenêtre de confirmation avant d’accuser', true);
    await g1.waitForTimeout(450);
    await g1.dblclick('[data-a="propose"]');
    await tous(P, '.mn-voteb');
    const sv = (await etat(h, 'manoir')).s;
    check('bug 1 : double appui = UNE seule proposition, soumise au vote de tous', sv.phase === 'vote' && sv.vote && sv.vote.by === 1);
    check('bug 1 : pas de verdict tant que le groupe n’a pas voté', await h.locator('.mn-verdict').count() === 0);
    await capture(h, 'manoir_vote_hote');
    await capture(g3, 'manoir_vote_invite');
    for (const p of [h, g2, g3, g4]) {
      if (await p.locator('.mn-verdict').count()) break;
      if (await p.locator('[data-a="vote"][data-v="1"]').count()) await p.click('[data-a="vote"][data-v="1"]');
      await p.waitForTimeout(300);
    }
    await tous(P, '.mn-verdict');
    check('verdict théâtral chez les 5', true);
    await attendre(1200);
    await capture(g2, 'manoir_verdict_invite');
    check('Manoir : rien ne déborde (412 et 360 px)', !(await debordements(P)).length, await debordements(P));
    check('bug 9 : gagnants du Manoir (« tous » si résolu, null sinon)',
      await h.evaluate(() => GG.byId.manoir.gagnants({ won: true }) === 'tous' && GG.byId.manoir.gagnants({ won: false }) === null));
  }

  /* ===================================================================
   * L'IMPOSTEUR — 5 téléphones, Mister White
   * =================================================================== */
  console.log('--- L’Imposteur : 5 téléphones en ligne, Mister White ---');
  {
    await salon('imposteur', P);
    const [h] = P;
    await h.waitForSelector('[data-a="deal"]');
    check('bug 4 : Mister White disponible à 5', await h.locator('.imp-opt[data-k="white"]:not(.off)').count() === 1);
    check('bug 4 : indices à l’oral proposés', await h.locator('.imp-opt[data-k="oral"]').count() === 1);
    await h.click('.imp-opt[data-k="white"]');
    await h.click('[data-a="opt"][data-k="debat"][data-v="0"]');
    await h.click('[data-a="deal"]');
    await tous(P, '.imp-carte');
    const mots = [];
    let whites = 0;
    for (const p of P) {
      const box = await p.locator('.imp-carte').boundingBox();
      await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await p.mouse.down();
      await p.waitForTimeout(350);
      if (p === P[2]) await capture(p, 'imposteur_carte_tenue');
      await p.mouse.up();
      const { s, me } = await etat(p, 'imposteur');
      mots.push(s.players[me].word || null);
      if (s.players[me].role === 'white') whites++;
      await p.click('[data-a="seen"]');
    }
    check('un seul Mister White, qui le sait', whites === 1, whites);
    // fuite : personne ne reçoit le mot d'un autre
    const fuites = [];
    for (let i = 1; i < 5; i++) {
      const { s, me } = await etat(P[i], 'imposteur');
      const brut = JSON.stringify(s);
      mots.forEach((m, k) => {
        if (!m || k === i || m === mots[i]) return;
        const chemin = [];
        (function fouille(o, ch) {
          if (o === m) chemin.push(ch);
          else if (o && typeof o === 'object') Object.keys(o).forEach(c => fouille(o[c], ch + '.' + c));
        })(s, 'etat');
        if (chemin.length) fuites.push(P[i]._nom + ' voit « ' + m + ' » dans ' + chemin.join(', '));
      });
      s.players.forEach((pl, k) => { if (k !== me && (pl.word || (pl.role && pl.role !== 'civil'))) fuites.push(P[i]._nom + ' : rôle/mot de ' + pl.name); });
    }
    check('aucune fuite : chacun ne reçoit que son propre mot', !fuites.length, fuites);
    await tous(P, '.imp-oeil[data-hold="mot"]');
    check('bug 4 : « Maintenir pour revoir mon mot » après « J’ai mémorisé »', true);
    check('bug 4 : chrono des indices affiché', await h.locator('.imp-timer').count() === 1);
    // indices écrits, chacun son tour
    const indices = ['zorglub', 'kiwano', 'pampille', 'zizanie', 'quetzal'];
    for (let k = 0; k < 5; k++) {
      let fait = false;
      for (let t = 0; t < 40 && !fait; t++) {
        for (const p of P) {
          if (await p.locator('#imp-clue').count()) {
            await p.fill('#imp-clue', indices[k]);
            await p.click('[data-a="clue"]');
            // on attend que l'indice soit enregistré partout avant le suivant
            await h.waitForFunction(n => [].concat.apply([], (window.__etats.imposteur.tours || [])).length >= n, k + 1, { timeout: 10000 });
            await p.waitForFunction(() => !document.getElementById('imp-clue'), null, { timeout: 10000 }).catch(() => {});
            fait = true;
            break;
          }
        }
        if (!fait) await attendre(150);
      }
    }
    await tous(P, '.imp-cible', 20000);
    check('5 indices donnés, vote ouvert partout', true);
    await capture(P[3], 'imposteur_vote_invite');
    for (const p of P) { await p.locator('.imp-cible').first().click(); await p.waitForTimeout(200); }
    await h.waitForFunction(() => /éliminé|Égalité|gagne/i.test(document.getElementById('mini-area').textContent), null, { timeout: 15000 });
    await attendre(1500);
    await capture(h, 'imposteur_resultat_hote');
    check('résultat du vote affiché chez l’hôte', true);
    check('Imposteur : rien ne déborde (412 et 360 px)', !(await debordements(P)).length, await debordements(P));
  }

  /* ===================================================================
   * LE QUIZ — 4 téléphones
   * =================================================================== */
  console.log('--- Le Quiz : 4 téléphones en ligne ---');
  {
    const Q = P.slice(0, 4);
    await salon('quiz', Q);
    const [h, g1, g2, g3] = Q;
    await h.waitForSelector('[data-a="go"]');
    check('réglages : 10 thèmes dont « Depuis 2016 »', await h.locator('.qz-theme[data-th]').count() === 10 && await h.locator('.qz-theme[data-th="recent"]').count() === 1);
    await h.click('.qz-theme[data-th="recent"]');
    await h.click('[data-k="chrono"][data-v="10"]');
    await capture(h, 'quiz_reglages_hote');
    await capture(g2, 'quiz_attente_invite');
    await h.click('[data-a="go"]');
    await tous(Q, '.qz-choice[data-i]');
    check('4 tuiles de couleur à forme et chrono sur chaque téléphone',
      await g2.locator('.qz-choice[data-i] .qz-forme svg').count() === 4 && await g2.locator('.qz-timer').count() === 1);
    let fuites = [];
    for (const p of Q.slice(1)) {
      const { s, me } = await etat(p, 'quiz');
      if (s.qs.some(x => x.correct !== undefined)) fuites.push(p._nom + ' : bonne réponse');
      if (s.qs[s.idx + 1] && s.qs[s.idx + 1].q) fuites.push(p._nom + ' : question suivante');
      s.players.forEach((pl, k) => { if (k !== me && typeof pl.answer === 'number' && pl.answer >= 0) fuites.push(p._nom + ' : réponse de ' + pl.name); });
    }
    check('aucune fuite : ni bonne réponse, ni question à venir, ni réponse des autres', !fuites.length, fuites);
    await g1.locator('.qz-choice[data-i]').nth(0).click();
    await g1.waitForFunction(() => /ont répondu/.test(document.querySelector('.qz-etat').textContent) &&
      /verrouillée/.test(document.querySelector('.qz-etat').textContent) && !/0\/4/.test(document.querySelector('.qz-etat').textContent), null, { timeout: 8000 }).catch(() => {});
    const compte = await g1.textContent('.qz-etat');
    check('bug 6 : après sa réponse, le compteur dit 1/4 (et non 4/4)', /1\/4/.test(compte), compte);
    await capture(g1, 'quiz_repondu_invite');
    await g2.locator('.qz-choice[data-i]').nth(1).click();
    await h.locator('.qz-choice[data-i]').nth(2).click();
    await h.waitForSelector('[data-a="skip"]');
    check('bug 6 : l’hôte peut « ne plus attendre » un absent', true);
    await h.click('[data-a="skip"]');
    await tous(Q, '.qz-choice.good');
    check('révélation animée chez les 4 (bonne tuile, jauges, classement)',
      await g2.locator('.qz-jauge').count() === 4 && await g2.locator('.qz-rang').count() === 4);
    check('l’absent voit « Pas de réponse »', /Pas de réponse/.test(await g3.textContent('.qz-verdict')));
    await attendre(1400);
    await capture(h, 'quiz_revelation_hote');
    await capture(g3, 'quiz_revelation_invite');
    // question 2 : personne ne répond, le chrono (10 s) tranche
    await h.click('[data-a="next"]');
    await tous(Q, '.qz-choice[data-i]');
    await tous(Q, '.qz-choice.good', 16000);
    check('bug 6 : fin du chrono = révélation, même sans aucune réponse', true);
    // la suite, jusqu'au podium
    for (let k = 2; k < 10; k++) {
      await h.waitForSelector('[data-a="next"]:not([disabled])', { timeout: 8000 });
      await h.click('[data-a="next"]');
      await tous(Q, '.qz-choice[data-i]');
      for (const p of Q) await p.locator('.qz-choice[data-i]').nth(k % 4).click();
      await tous(Q, '.qz-choice.good');
    }
    await h.waitForSelector('[data-a="next"]:not([disabled])', { timeout: 8000 });
    await h.click('[data-a="next"]');
    await tous(Q, '#overlay-end:not(.hidden)');
    await attendre(1500);
    check('podium final chez tous', await g2.locator('#end-detail .qz-podium').count() === 1 && await h.locator('#end-detail .qz-marche.m1').count() === 1);
    await capture(h, 'quiz_podium_hote');
    await capture(g2, 'quiz_podium_invite');
    check('Quiz : rien ne déborde (412 et 360 px)', !(await debordements(Q)).length, await debordements(Q));
    check('bug 9 : gagnants du Quiz (meilleur score, [] si égalité, solo gagné à 50 %)', await h.evaluate(() => {
      const q = GG.byId.quiz;
      return JSON.stringify(q.gagnants({ players: [{ score: 5 }, { score: 9 }], qs: [] })) === '[1]' &&
        JSON.stringify(q.gagnants({ players: [{ score: 9 }, { score: 9 }], qs: [] })) === '[]' &&
        JSON.stringify(q.gagnants({ players: [{ score: 9, bons: 5 }], qs: new Array(10) })) === '[0]';
    }));
  }

  /* ===================================================================
   * LE PLUS PROCHE — 3 téléphones
   * =================================================================== */
  console.log('--- Le Plus Proche : 3 téléphones en ligne ---');
  {
    const R = P.slice(0, 3);
    await salon('proche', R);
    const [h, g1, g2] = R;
    await h.waitForSelector('[data-a="go"]');
    await h.click('[data-k="nb"][data-v="6"]');
    await h.click('[data-a="go"]');
    await tous(R, '.pr-touche');
    const fuites = [];
    for (const p of R.slice(1)) {
      const { s, me } = await etat(p, 'proche');
      if (s.qs[s.idx].a !== undefined || s.qs[s.idx].src !== undefined) fuites.push(p._nom + ' : réponse ou source');
      if (s.qs[s.idx + 1] && s.qs[s.idx + 1].q) fuites.push(p._nom + ' : question suivante');
      s.players.forEach((pl, k) => { if (k !== me && pl.guess !== null) fuites.push(p._nom + ' : estimation de ' + pl.name); });
    }
    check('aucune fuite : ni réponse, ni source, ni estimation des autres', !fuites.length, fuites);
    // bug 5 : Marc tape son nombre, Hugo valide : la saisie de Marc ne bouge pas
    for (const k of ['4', '2', '000']) await g2.click('.pr-touche[data-key="' + k + '"]');
    await g2.evaluate(() => { document.getElementById('pr-guess').dataset.marque = 'x'; });
    await capture(g2, 'proche_saisie_invite');
    await h.click('.pr-touche[data-key="7"]');
    await h.click('[data-a="guess"]');
    await g2.waitForFunction(() => /1\/3/.test(document.querySelector('.pr-etat').textContent), null, { timeout: 8000 });
    check('bug 5 : la saisie en cours survit à la validation d’un autre (même champ, même valeur)',
      await g2.evaluate(() => { const c = document.getElementById('pr-guess'); return c.dataset.marque === 'x' && c.value.replace(/\D/g, '') === '42000'; }));
    await g1.click('.pr-touche[data-key="9"]');
    await g1.click('[data-a="guess"]');
    await g1.waitForSelector('.pr-verrou');
    check('bug 6 : après son estimation, le compteur dit 2/3', /2\/3/.test(await g1.textContent('.pr-etat')));
    await g2.click('[data-a="guess"]');
    await tous(R, '.pr-row');
    check('révélation : règle graduée, 3 épingles, drapeau', await g1.locator('.pr-regle .pr-pin').count() === 3 && await g1.locator('.pr-drapeau').count() === 1);
    check('bug 5 : la réponse est sourcée', /Source/.test(await g2.textContent('.pr-source')));
    check('bug 5 : points selon la distance (+N pour chacun)', await g2.locator('.pr-gain').count() === 3);
    await attendre(1600);
    await capture(h, 'proche_revelation_hote');
    await capture(g2, 'proche_revelation_invite');
    // manche 2 : un absent, l'hôte n'attend plus
    await h.waitForSelector('[data-a="next"]:not([disabled])');
    await h.click('[data-a="next"]');
    await tous(R, '.pr-touche');
    await g1.click('.pr-touche[data-key="3"]');
    await g1.click('[data-a="guess"]');
    await h.waitForSelector('[data-a="skip"]');
    await h.click('[data-a="skip"]');
    await tous(R, '.pr-row');
    check('bug 6 : « ne plus attendre » révèle sans les absents', /pas de réponse/.test(await g2.textContent('.pr-rows')));
    for (let k = 2; k < 6; k++) {
      await h.waitForSelector('[data-a="next"]:not([disabled])', { timeout: 8000 });
      await h.click('[data-a="next"]');
      await tous(R, '.pr-touche');
      for (const p of R) { await p.click('.pr-touche[data-key="' + (k + 1) + '"]'); await p.click('[data-a="guess"]'); }
      await tous(R, '.pr-row');
    }
    await h.waitForSelector('[data-a="next"]:not([disabled])', { timeout: 8000 });
    await h.click('[data-a="next"]');
    await tous(R, '#overlay-end:not(.hidden)');
    check('podium final', await g1.locator('#end-detail .qz-podium').count() === 1);
    check('Plus Proche : rien ne déborde (412 et 360 px)', !(await debordements(R)).length, await debordements(R));
    check('bug 9 : gagnants du Plus Proche', await h.evaluate(() =>
      JSON.stringify(GG.byId.proche.gagnants({ players: [{ score: 1 }, { score: 7 }] })) === '[1]'));
  }

  /* ===================================================================
   * LA DISCUSSION — 3 téléphones
   * =================================================================== */
  console.log('--- La Discussion : 3 téléphones en ligne ---');
  {
    const C = [P[0], P[2], P[3]];
    await salon('chat', C);
    const [h, m, n] = C;
    await tous(C, '#ch-in');
    await h.fill('#ch-in', 'Bonsoir tout le monde !');
    await h.click('.ch-send');
    await tous(C, '.ch-bub');
    check('bug 10 : notification discrète chez les autres', await m.evaluate(() => window.__sons.includes('notify')));
    await m.fill('#ch-in', '<b onmouseover="window.__xss=1">gras</b><script>window.__xss=2</script>');
    await m.click('.ch-send');
    await n.waitForFunction(() => document.querySelectorAll('.ch-bub').length === 2, null, { timeout: 8000 });
    check('bug 10 : sécurité, tout est échappé', await n.evaluate(() =>
      !document.querySelector('.ch-log b[onmouseover], .ch-log script') && window.__xss === undefined && /<script>/.test(document.querySelector('.ch-log').textContent)));
    await n.click('#ch-in');
    await n.keyboard.type('J’arrive', { delay: 30 });
    await h.waitForSelector('.ch-typing.on', { timeout: 8000 });
    check('bug 10 : « Nina est en train d’écrire… » chez les autres', /Nina/.test(await h.textContent('.ch-typing')));
    const b = await m.locator('.ch-row:not(.mine) .ch-bub').first().boundingBox();
    await m.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await m.mouse.down();
    await m.waitForTimeout(650);
    await m.mouse.up();
    await m.click('.ch-picker [data-re="😂"]');
    await h.waitForSelector('.ch-row.mine .ch-re', { timeout: 8000 });
    check('bug 10 : réaction par appui long, reçue par l’auteur', /😂/.test(await h.textContent('.ch-row.mine .ch-re')));
    await n.press('#ch-in', 'Enter');
    await h.waitForFunction(() => document.querySelectorAll('.ch-bub').length === 3, null, { timeout: 8000 });
    check('bug 10 : avatars et bulles modernes', await h.locator('.ch-row:not(.mine) .ch-av').count() >= 1);
    await capture(h, 'chat_hote');
    await capture(m, 'chat_invite');
    check('Discussion : rien ne déborde', !(await debordements(C)).length, await debordements(C));
  }

  for (const p of P) await p.context().close();

  /* ===================================================================
   * UN SEUL TÉLÉPHONE : Quiz animateur, Manoir (rôles), fluidité ×4
   * (mesurée seule : plusieurs téléphones sur la même machine se
   * disputeraient le processeur)
   * =================================================================== */
  console.log('--- Un seul téléphone ---');
  {
    const ctx = await browser.newContext({ viewport: { width: 412, height: 780 } });
    const p = await ctx.newPage();
    p._nom = 'table';
    p.on('pageerror', e => { failures++; console.log('  FAIL JS (table) : ' + e.message); });
    await p.goto(URL_APP);
    await p.waitForSelector('#catalog .game-tile');
    let passages = 0;
    await p.exposeFunction('__passage', () => { passages++; });
    await p.evaluate(() => {
      const o = document.getElementById('overlay-pass');
      new MutationObserver(() => { if (!o.classList.contains('hidden')) window.__passage(); }).observe(o, { attributes: true });
    });
    // Quiz, mode animateur à 3
    await p.click('.game-tile[data-g="quiz"]');
    await p.click('#btn-mini-hotseat');
    await p.click('#mini-count .count-btn:text-is("3")');
    await p.click('#btn-mini-start');
    await p.waitForSelector('[data-a="go"]');
    check('bug 8 : sur un téléphone, le mode animateur est proposé (et choisi d’office)',
      await p.locator('.qz-mode.on[data-v="animateur"]').count() === 1);
    await p.click('[data-a="go"]');
    await p.waitForSelector('.qz-anim');
    for (let k = 0; k < 3; k++) await p.click('.qz-mini[data-pour="' + k + '"][data-i="' + k + '"]');
    await capture(p, 'quiz_animateur');
    const m1 = await fluidite(p, () => p.click('[data-a="skip"]'));
    await p.waitForSelector('.qz-choice.good');
    console.log('    fluidité, révélation du Quiz (processeur ×4) : ' + JSON.stringify(m1));
    check('fluide au processeur ×4 (révélation du Quiz) : image médiane ≤ 50 ms, moins de 5 % d’images > 100 ms',
      m1.mediane <= 50 && m1.lentes <= m1.n * 0.05, m1);
    await p.click('[data-a="next"]');
    await p.waitForSelector('.qz-anim');
    check('bug 8 : aucun écran de passage inutile pendant les questions', passages === 0, passages);
    await p.click('#btn-mini-menu'); await p.click('#btn-menu-quit'); await p.click('#btn-confirm-yes');
    await p.waitForTimeout(300);
    // Manoir à 3 sur un téléphone : les rôles circulent avec l'écran de passage
    passages = 0;
    await p.click('.game-tile[data-g="manoir"]');
    await p.click('#btn-mini-hotseat');
    await p.click('#mini-count .count-btn:text-is("3")');
    await p.click('#btn-mini-start');
    await p.waitForSelector('[data-a="start"]');
    const m2 = await fluidite(p, () => p.click('[data-a="start"]'));
    console.log('    fluidité, carte de rôle du Manoir (processeur ×4) : ' + JSON.stringify(m2));
    check('fluide au processeur ×4 (Manoir) : image médiane ≤ 50 ms, moins de 5 % d’images > 100 ms',
      m2.mediane <= 50 && m2.lentes <= m2.n * 0.05, m2);
    let roles = 0;
    for (let k = 0; k < 6 && roles < 3; k++) {
      if (await p.locator('#overlay-pass:not(.hidden)').count()) { await p.click('#btn-pass-ready'); await p.waitForTimeout(200); }
      if (await p.locator('[data-a="lu"]').count()) {
        if (await p.locator('.mn-role').count()) roles++;
        await p.click('[data-a="lu"]');
        await p.waitForTimeout(250);
      }
    }
    check('bug 2 : sur un téléphone, chacun découvre son rôle (3 rôles, écran de passage)', roles === 3 && passages >= 2, [roles, passages]);
    await ctx.close();
  }

  await browser.close();
  await relais.arreter();
  console.log(failures ? '\n' + failures + ' ÉCHEC(S)' : '\nSoirée V2 OK.');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
