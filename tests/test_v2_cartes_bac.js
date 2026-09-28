const ROOT = require('path').join(__dirname, '..');
/*
 * V2 — 8 américain, Memory, Petit Bac : règles corrigées, IA mesurées,
 * lexique du Petit Bac. Un contrôle par bug de l'audit, chiffres à l'appui.
 *   node tests/test_v2_cartes_bac.js            → tout
 *   node tests/test_v2_cartes_bac.js huit       → une seule section
 */
require(ROOT + '/js/games/registry.js');
const huit = require(ROOT + '/js/games/huit.js');
const memory = require(ROOT + '/js/games/memory.js');
const bac = require(ROOT + '/js/games/bac.js');

let failures = 0;
function check(n, c, e) {
  if (c) console.log('  OK  ' + n + (e !== undefined ? '  [' + (typeof e === 'string' ? e : JSON.stringify(e)) + ']' : ''));
  else { failures++; console.log('  FAIL ' + n + (e !== undefined ? ' -> ' + JSON.stringify(e) : '')); }
}
const clone = o => JSON.parse(JSON.stringify(o));
const pct = x => (x * 100).toFixed(1) + ' %';
const only = process.argv[2] || null;

/* ============================ 8 AMÉRICAIN ============================ */
if (!only || only === 'huit') {
  console.log('--- 8 américain : bugs de l’audit ---');
  {
    // bug 2 : « passer » sous une pénalité +2 sans piocher
    const g = huit.create(['A', 'B', 'C']);
    g.current = 0; g.dir = 1; g.pending2 = 2; g.hasDrawn = false;
    g.players[0].hand = [{ r: '5', s: '♥' }, { r: '9', s: '♣' }];
    const r = huit.apply(g, 0, { t: 'pass' });
    check('passer sous une pénalité +2 est refusé', !r.ok && /pénalité|2/.test(r.error), r.error);
    check('la pénalité reste au joueur visé', g.pending2 === 2 && g.current === 0);
    g.hasDrawn = true; // même après une pioche simple fictive : toujours refusé
    check('… même si hasDrawn est vrai', !huit.apply(g, 0, { t: 'pass' }).ok);
    g.hasDrawn = false;
    huit.apply(g, 0, { t: 'draw' });
    check('la pioche de pénalité solde la dette puis le tour passe',
      g.pending2 === 0 && g.players[0].hand.length === 4 && g.current === 1);
  }
  {
    // bug 3 : la 1re carte retournée spéciale applique son effet
    let speciales = 0, ok = 0, N = 4000;
    const vus = { 2: 0, V: 0, A: 0 };
    for (let k = 0; k < N; k++) {
      const n = 2 + (k % 4);
      const g = huit.create(['A', 'B', 'C', 'D', 'E'].slice(0, n));
      const c = g.discard[0];
      const start = 0;
      if (c.r === '2') { speciales++; vus[2]++; if (g.pending2 === 2 && g.current === start) ok++; }
      else if (c.r === 'V') { speciales++; vus.V++; if (g.current === (start + 1) % n && g.pending2 === 0) ok++; }
      else if (c.r === 'A') { speciales++; vus.A++; if (g.dir === -1 && g.current === (start - 1 + n) % n) ok++; }
      else if (c.r === '8') { speciales = -1e9; }
    }
    check('1re carte spéciale : ~25 % des donnes (2, Valet, As ; jamais un 8)',
      speciales / N > 0.2 && speciales / N < 0.3, pct(speciales / N) + ' ' + JSON.stringify(vus));
    check('… et son effet est TOUJOURS appliqué (2 : +2, Valet : saute, As : sens inversé)',
      ok === speciales, ok + '/' + speciales);
  }
  {
    // bug 3 : score cible, la série n'est plus infinie
    const g = huit.create(['A', 'B']);
    check('score cible par défaut : 300', huit._regles(g).cible === 300);
    g.current = 0; g.pending2 = 0; g.players[0].score = 290;
    g.discard = [{ r: '5', s: '♠' }];
    g.players[0].hand = [{ r: '5', s: '♦' }];
    g.players[1].hand = [{ r: 'R', s: '♥' }, { r: '7', s: '♣' }];
    huit.apply(g, 0, { t: 'play', i: 0 });
    check('300 points atteints : partie terminée', huit.over(g) && g.players[0].score === 307);
    check('plus de manche après la victoire', !huit.apply(g, 0, { t: 'again' }).ok);
    check('gagnants(state) = [0]', JSON.stringify(huit.gagnants(g)) === '[0]');
    const sum = huit.summary(g);
    check('bilan : nom et points dans des blocs séparés',
      /<span>A<\/span><strong>307 pts<\/strong>/.test(sum), sum.slice(0, 90));
  }
  {
    // bug 3 : main triée
    const main = [{ r: '8', s: '♠' }, { r: 'R', s: '♦' }, { r: '3', s: '♥' }, { r: '2', s: '♦' },
      { r: 'A', s: '♠' }, { r: '5', s: '♠' }, { r: '10', s: '♣' }];
    const tri = huit._triMain(main).map(o => o.c.r + o.c.s).join(' ');
    check('main triée : par couleur, par valeur, les 8 à la fin', tri === '5♠ A♠ 3♥ 10♣ 2♦ R♦ 8♠', tri);
    // éventail : jamais de débordement ni de défilement, quelle que soit la taille de la main
    let pire = 0;
    [344, 396].forEach(W => {
      const cw = W > 370 ? 76 : 60;
      for (let n = 1; n <= 30; n++) {
        const lay = huit._eventail(n, W, cw);
        lay.pos.forEach(p => {
          const marge = lay.ch * 1.25 * Math.sin(Math.abs(p.rot) * Math.PI / 180);
          pire = Math.max(pire, -(p.x - marge), (p.x + cw + marge) - W);
        });
      }
    });
    check('éventail : 1 à 30 cartes tiennent dans la largeur (344 et 396 px)', pire <= 0, pire.toFixed(1) + ' px');
    const lay20 = huit._eventail(20, 344, 60);
    const pasMin = Math.min.apply(null, lay20.pos.slice(1).map((p, i) => Math.abs(p.x - lay20.pos[i].x)).filter(d => d > 0));
    check('éventail : chaque carte garde au moins 40 % de sa largeur visible', pasMin >= 60 * 0.4, pasMin);
  }
  check('description : plus aucune mention de « Uno »', !/uno/i.test(huit.desc + huit.regles));

  console.log('--- 8 américain : règles maison ---');
  {
    const g = huit.create(['A', 'B']);
    check('règles : réservées à l’hôte', !huit.apply(g, 1, { t: 'regles', r: { cible: 500 } }).ok);
    check('règles : acceptées pendant la 1re manche',
      huit.apply(g, 0, { t: 'regles', r: { cible: 500, carte: false, fin8: true, dix: true } }).ok &&
      huit._regles(g).cible === 500 && huit._regles(g).fin8 && huit._regles(g).dix && !huit._regles(g).carte);
    check('règles : cible hors liste ignorée', huit.apply(g, 0, { t: 'regles', r: { cible: 7, fin8: true, dix: true } }).ok &&
      huit._regles(g).cible === 500);
    // interdit de finir sur un 8
    g.current = 0; g.pending2 = 0; g.discard = [{ r: '5', s: '♠' }];
    g.players[0].hand = [{ r: '8', s: '♥' }];
    const r8 = huit.apply(g, 0, { t: 'play', i: 0, suit: '♥' });
    check('fin sur un 8 interdite (règle maison)', !r8.ok && /8/.test(r8.error), r8.error);
    g.players[0].hand = [{ r: '8', s: '♥' }, { r: '9', s: '♣' }];
    check('… mais un 8 reste jouable s’il n’est pas la dernière carte', huit._playable(g, g.players[0].hand[0], g.players[0].hand));
    // le 10 fait rejouer
    g.players[0].hand = [{ r: '10', s: '♠' }, { r: '9', s: '♣' }, { r: '4', s: '♠' }];
    huit.apply(g, 0, { t: 'play', i: 0 });
    check('10 = rejouer (règle maison)', g.current === 0 && g.dernier.rejoue === true);
    // hors 1re manche : plus de changement
    g.manche = 2;
    check('règles figées après la 1re manche', !huit.apply(g, 0, { t: 'regles', r: { cible: 100 } }).ok);
  }
  {
    // « Carte ! »
    const g = huit.create(['A', 'B']);
    g.current = 0; g.pending2 = 0; g.discard = [{ r: '5', s: '♠' }];
    g.players[0].hand = [{ r: '6', s: '♠' }, { r: '9', s: '♣' }];
    const avant = g.pile.length;
    huit.apply(g, 0, { t: 'play', i: 0 });
    check('« Carte ! » oublié : 2 cartes de pénalité', g.players[0].hand.length === 3 && g.pile.length === avant - 2 &&
      g.dernier.oubli === 2);
    const h = huit.create(['A', 'B']);
    h.current = 0; h.pending2 = 0; h.discard = [{ r: '5', s: '♠' }];
    h.players[0].hand = [{ r: '6', s: '♠' }, { r: '9', s: '♣' }];
    check('« Carte ! » refusé avec 3 cartes ou plus', (() => {
      const x = clone(h); x.players[0].hand.push({ r: 'D', s: '♦' }); return !huit.apply(x, 0, { t: 'carte' }).ok;
    })());
    check('« Carte ! » annoncé avec 2 cartes', huit.apply(h, 0, { t: 'carte' }).ok && h.annonce === 0);
    huit.apply(h, 0, { t: 'play', i: 0 });
    check('… pas de pénalité après l’annonce', h.players[0].hand.length === 1 && !h.dernier.oubli);
  }
  {
    // redact : la défausse visible se limite aux cartes de la table
    const g = huit.create(['A', 'B', 'C']);
    g.discard = [{ r: '3', s: '♠' }, { r: '4', s: '♠' }, { r: '5', s: '♠' }, { r: '5', s: '♥' }];
    const red = huit.redact(g, 1);
    check('redact : dessus + 2 cartes décor, mains et pioche masquées',
      red.discard.length === 1 && red.dessous.length === 2 && red.players[0].hand === undefined &&
      Array.isArray(red.players[1].hand) && red.pile === undefined);
  }
  {
    // manche bloquée : pioche et défausse épuisées
    const g = huit.create(['A', 'B']);
    g.current = 0; g.pending2 = 0; g.chosenSuit = null;
    g.pile = []; g.discard = [{ r: '5', s: '♠' }];
    g.players[0].hand = [{ r: '9', s: '♥' }, { r: 'R', s: '♦' }];
    g.players[1].hand = [{ r: '2', s: '♣' }];
    huit.apply(g, 0, { t: 'draw' });
    huit.apply(g, 1, { t: 'draw' });
    check('pioche épuisée pour tous : la main la plus légère gagne (pas de boucle infinie)',
      g.finished && g.winner === 1 && g.bloque === true, [g.finished, g.winner]);
  }

  console.log('--- 8 américain : IA mesurées ---');
  function manche(niveaux) {
    const noms = niveaux.map((x, i) => 'J' + i);
    const s = huit.create(noms);
    for (let k = 0; k < 4000 && !s.finished; k++) {
      const i = s.current;
      const a = huit.bot(clone(s), i, { niveau: niveaux[i] });
      const r = huit.apply(s, i, a);
      if (!r.ok) throw new Error('action IA refusée : ' + JSON.stringify(a) + ' ' + r.error);
    }
    return s;
  }
  function duel(a, b, N) {
    let va = 0, pa = 0, pb = 0;
    for (let k = 0; k < N; k++) {
      // on alterne qui commence
      const s = k % 2 ? manche([a, b]) : manche([b, a]);
      const ia = k % 2 ? 0 : 1;
      if (s.winner === ia) { va++; pa += s.lastGain; } else pb += s.lastGain;
    }
    return { v: va / N, ratio: pa / Math.max(1, pb) };
  }
  const t0 = Date.now();
  const N = 1500;
  const df = duel('difficile', 'facile', N), dm = duel('difficile', 'moyen', N), mf = duel('moyen', 'facile', N);
  check('difficile bat facile (manches gagnées, ratio de points)', df.v > 0.58 && df.ratio > 1.5,
    pct(df.v) + ', points ×' + df.ratio.toFixed(2));
  check('difficile bat moyen', dm.v > 0.5 && dm.ratio > 1.15, pct(dm.v) + ', points ×' + dm.ratio.toFixed(2));
  check('moyen bat facile', mf.v > 0.54 && mf.ratio > 1.25, pct(mf.v) + ', points ×' + mf.ratio.toFixed(2));
  {
    // « Carte ! » : la mémoire de l'IA dépend du niveau
    const oublis = { facile: 0, moyen: 0, difficile: 0 }, tot = { facile: 0, moyen: 0, difficile: 0 };
    Object.keys(oublis).forEach(niv => {
      for (let k = 0; k < 400; k++) {
        const g = huit.create(['A', 'B']);
        g.current = 1; g.pending2 = 0; g.discard = [{ r: '5', s: '♠' }]; g.coups = k;
        g.players[1].hand = [{ r: '6', s: '♠' }, { r: '9', s: '♣' }];
        const a = huit.bot(clone(g), 1, { niveau: niv });
        tot[niv]++;
        if (a.t !== 'carte') oublis[niv]++;
      }
    });
    check('oublis de « Carte ! » : facile ~40 %, moyen ~10 %, difficile jamais',
      oublis.difficile === 0 && oublis.moyen / 400 > 0.03 && oublis.moyen / 400 < 0.2 &&
      oublis.facile / 400 > 0.28 && oublis.facile / 400 < 0.52,
      Object.keys(oublis).map(k => k + ' ' + pct(oublis[k] / 400)).join(', '));
  }
  {
    // la difficile se souvient de qui a séché sur quelle couleur
    const g = huit.create(['A', 'B']);
    g.current = 1; g.pending2 = 0; g.discard = [{ r: '5', s: '♥' }];
    g.manques = [{ '♣': true }, {}];
    g.players[1].hand = [{ r: '5', s: '♣' }, { r: '5', s: '♦' }, { r: 'D', s: '♣' }, { r: '9', s: '♦' }];
    let trefle = 0;
    for (let k = 0; k < 50; k++) {
      const a = huit.bot(clone(g), 1, { niveau: 'difficile' });
      if (g.players[1].hand[a.i].s === '♣') trefle++;
    }
    check('difficile : vise la couleur qui manque à l’adversaire', trefle >= 45, trefle + '/50');
  }
  console.log('  (mesures IA : ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)');
}

/* ============================== MEMORY ============================== */
if (!only || only === 'memory') {
  console.log('--- Memory : l’IA a une vraie mémoire (bug 4) ---');
  // Une partie IA contre IA, instrumentée : à chaque 2e carte, la jumelle de
  // la 1re avait-elle déjà été montrée ? Si non, l'IA ne peut que deviner au
  // hasard — on compare son taux de réussite au hasard pur.
  function partie(niveaux, stats) {
    const s = memory.create(niveaux.map((x, i) => 'IA' + i));
    s.pret = true;
    for (let k = 0; k < 2000 && !s.finished; k++) {
      const me = s.current, niv = niveaux[me];
      const up = s.mismatch ? [] : s.up;
      const a = memory.bot(clone(s), me, { niveau: niv });
      if (up.length === 1 && stats) {
        const e = s.cards[up[0]].e;
        const jumelle = s.cards.findIndex((c, i) => i !== up[0] && c.e === e && !c.matched);
        const dejaVue = s.journal.indexOf(jumelle) !== -1;
        if (!dejaVue) {
          const mem = memory._souvenirs(s, me, niv);
          const cand = s.cards.filter((c, i) => !c.matched && i !== up[0] && !mem.hasOwnProperty(i)).length;
          stats.aveugle++;
          stats.hasard += cand ? 1 / cand : 0;
          if (a.i === jumelle) stats.devine++;
        } else {
          stats.connue++;
          if (a.i === jumelle) stats.retrouvee++;
        }
      }
      const r = memory.apply(s, me, a);
      if (!r.ok) throw new Error('coup IA refusé ' + r.error);
    }
    return s;
  }
  const res = {};
  ['facile', 'moyen', 'difficile'].forEach(niv => {
    const st = { aveugle: 0, devine: 0, hasard: 0, connue: 0, retrouvee: 0, essais: 0, parties: 0 };
    for (let k = 0; k < 250; k++) {
      const s = partie([niv], st);
      st.essais += s.players[0].tries; st.parties++;
    }
    res[niv] = st;
  });
  ['facile', 'moyen', 'difficile'].forEach(niv => {
    const st = res[niv];
    const taux = st.devine / st.aveugle, hasard = st.hasard / st.aveugle;
    check(niv + ' : jumelle JAMAIS montrée trouvée au seul hasard (avant : 35 % « devinés »)',
      taux < hasard * 1.35 + 0.01 && taux < 0.12,
      pct(taux) + ' trouvées, hasard attendu ' + pct(hasard) + ' (' + st.aveugle + ' cas)');
  });
  const tr = n => res[n].retrouvee / res[n].connue;
  check('jumelle déjà vue : difficile la retrouve toujours', tr('difficile') > 0.999, pct(tr('difficile')));
  check('… moyen presque toujours, facile beaucoup moins (il oublie)',
    tr('moyen') > 0.7 && tr('facile') < 0.6 && tr('facile') < tr('moyen'),
    'moyen ' + pct(tr('moyen')) + ', facile ' + pct(tr('facile')));
  const ess = n => res[n].essais / res[n].parties;
  check('essais moyens pour 12 paires en solo : facile > moyen > difficile',
    ess('facile') > ess('moyen') + 2 && ess('moyen') > ess('difficile') + 1,
    'facile ' + ess('facile').toFixed(1) + ', moyen ' + ess('moyen').toFixed(1) + ', difficile ' + ess('difficile').toFixed(1));
  {
    // la mémoire du facile : 2 à 4 cartes au plus
    const s = memory.create(['A', 'B']);
    s.journal = [];
    for (let i = 0; i < 20; i++) s.journal.push(i);
    let max = 0;
    for (let k = 0; k < 40; k++) { s.journal.push(k % 20); max = Math.max(max, Object.keys(memory._souvenirs(s, 1, 'facile')).length); }
    check('facile : retient au plus 4 cartes', max <= 4 && max >= 1, max);
    check('difficile : retient tout ce qui a été montré',
      Object.keys(memory._souvenirs(s, 1, 'difficile')).length === 20);
  }
  {
    // duel : difficile contre facile
    let vd = 0;
    for (let k = 0; k < 200; k++) {
      const s = partie(k % 2 ? ['difficile', 'facile'] : ['facile', 'difficile']);
      const d = k % 2 ? 0 : 1;
      if (s.players[d].pairs > s.players[1 - d].pairs) vd++;
    }
    check('duel : difficile bat facile', vd / 200 > 0.7, pct(vd / 200));
  }

  console.log('--- Memory : rien ne fuit en réseau (bug 5) ---');
  {
    const s = memory.create(['A', 'B', 'C']);
    memory.apply(s, 0, { t: 'config', theme: 'fruits', taille: 12 });
    memory.apply(s, 0, { t: 'flip', i: 0 });
    for (let v = 0; v < 3; v++) {
      const red = memory.redact(s, v);
      const cachees = red.cards.filter((c, i) => i !== 0 && !c.matched);
      check('joueur ' + v + ' : les ' + cachees.length + ' cartes cachées sont masquées',
        cachees.every(c => c.e === null) && red.cards[0].e === s.cards[0].e);
    }
    // une paire trouvée reste visible de tous
    const j = s.cards.findIndex((c, i) => i !== 0 && c.e === s.cards[0].e);
    memory.apply(s, 0, { t: 'flip', i: j });
    const red = memory.redact(s, 2);
    check('paire trouvée : visible de tous', red.cards[0].e && red.cards[j].e === red.cards[0].e);
    check('l’état complet garde les vraies cartes (l’hôte arbitre)', s.cards.every(c => typeof c.e === 'string'));
  }

  console.log('--- Memory : thèmes, tailles, défi du jour, chrono ---');
  {
    const TH = memory._THEMES;
    check('7 thèmes, chacun assez riche pour 24 paires',
      Object.keys(TH).length >= 7 && Object.keys(TH).every(k => new Set(TH[k].items).size >= 24),
      Object.keys(TH).map(k => k + ':' + TH[k].items.length).join(' '));
    [12, 18, 24].forEach(t => {
      const s = memory.create(['A']);
      memory.apply(s, 0, { t: 'config', theme: 'drapeaux', taille: t });
      check('grille de ' + t + ' paires', s.cards.length === 2 * t && s.theme === 'drapeaux');
    });
    const a = memory.create(['A']), b = memory.create(['B', 'C']);
    memory.apply(a, 0, { t: 'config', defi: true });
    memory.apply(b, 0, { t: 'config', defi: true });
    check('défi du jour : la même grille pour tout le monde',
      JSON.stringify(a.cards) === JSON.stringify(b.cards) && a.defi && a.defi === b.defi);
    const c = memory.create(['A']);
    check('thème inconnu → liste blanche (animaux)',
      memory.apply(c, 0, { t: 'config', theme: '<img src=x>', taille: 99 }).ok && c.theme === 'animaux' && c.taille === 12);
    check('config refusée une fois la partie commencée',
      !memory.apply(c, 0, { t: 'config', theme: 'fruits' }).ok);
    check('config réservée à l’hôte', !memory.apply(memory.create(['A', 'B']), 1, { t: 'config', theme: 'fruits' }).ok);
    // chrono : une longue pause ne compte que 20 s
    const s = memory.create(['A']);
    const vraiNow = Date.now;
    let t = 1e12;
    Date.now = () => t;
    s.cards = [{ e: 'x', matched: false }, { e: 'x', matched: false }, { e: 'y', matched: false }, { e: 'y', matched: false }];
    memory.apply(s, 0, { t: 'flip', i: 0 }); t += 2000;
    memory.apply(s, 0, { t: 'flip', i: 1 }); t += 3600 * 1000; // une heure de pause
    memory.apply(s, 0, { t: 'flip', i: 2 }); t += 1000;
    memory.apply(s, 0, { t: 'flip', i: 3 });
    Date.now = vraiNow;
    check('chrono : une pause d’une heure ne compte que 20 s', s.durationSec === 23, s.durationSec);
    check('gagnants(state) : en solo, victoire', JSON.stringify(memory.gagnants(s)) === '[0]');
    // bug 6 : la grille se calcule pour tenir dans l'écran
    const d412 = memory._disposition(24, 392, 780 - 120 - 114, 7);
    const d360 = memory._disposition(36, 340, 640 - 120 - 114, 5);
    check('12 paires à 412×780 : cartes ≥ 80 px, tout tient', d412.s >= 80 &&
      Math.ceil(24 / d412.cols) * (d412.s + 7) <= 780 - 120 - 114 + 7, d412);
    check('18 paires à 360×640 : cartes ≥ 50 px, tout tient', d360.s >= 50 &&
      Math.ceil(36 / d360.cols) * (d360.s + 5) <= 640 - 120 - 114 + 5, d360);
  }
}

/* ============================= PETIT BAC ============================= */
if (!only || only === 'bac') {
  console.log('--- Petit Bac : le lexique ---');
  const src = bac._LEX_SOURCES();
  const HIST = ['prenom', 'animal', 'ville', 'metier', 'fruit', 'objet'];
  let hist = 0;
  const parCat = {};
  bac._CATEGORIES.forEach(c => {
    const set = new Set();
    c.src.forEach(s => src[s].split(',').forEach(m => set.add(bac._cle(m))));
    parCat[c.id] = set.size;
    if (HIST.includes(c.id)) hist += set.size;
  });
  const total = new Set();
  Object.keys(src).forEach(k => src[k].split(',').forEach(m => total.add(k + ':' + bac._cle(m))));
  check('lexique des 6 catégories historiques multiplié par 5 (1 995 mots en V1)', hist >= 5 * 1995,
    hist + ' mots, ×' + (hist / 1995).toFixed(2));
  check('lexique complet : plus de 13 000 entrées', total.size >= 13000, total.size + ' entrées, ×' + (total.size / 1995).toFixed(1));
  check('au moins 20 catégories au choix', bac._CATEGORIES.length >= 20, bac._CATEGORIES.length);
  const LTR = 'ABCDEFGHIJLMNOPRSTV'.split('');
  const faibles = [];
  HIST.forEach(id => {
    LTR.forEach(L => {
      const n = bac._BOT_LEX[HIST.indexOf(id)][L].length;
      if (n < 5) faibles.push(id + ' ' + L + ':' + n);
    });
  });
  check('fruit ou légume, et les 5 autres : au moins 5 mots pour chacune des 19 lettres', !faibles.length, faibles.join(' '));
  const fr = bac._BOT_LEX[4];
  check('fruit ou légume : D E H I J L O T V bien fournis (avant : 1 à 4 mots)',
    'DEHIJLOTV'.split('').every(L => fr[L].length >= 5), 'DEHIJLOTV'.split('').map(L => L + fr[L].length).join(' '));
  check('aucune marque dans les objets et les boissons',
    !['frigidaire', 'kleenex', 'guinness', 'suze', 'caddie', 'jeep', 'kway'].some(m =>
      bac._connait('objet', m) || bac._connait('boisson', m) || bac._connait('transport', m)));

  console.log('--- Petit Bac : la saisie tolérante et le juge (bugs 7 et 8) ---');
  const juge = (mot, cat) => bac._botJuge(mot, cat);
  check('« steward » accepté comme métier (V1 : « stewart » mal orthographié)', juge('steward', 'metier') && juge('Steward', 3));
  check('« vole » n’est pas un animal', !juge('vole', 'animal'));
  // les 30 réponses courantes refusées par l'IA de la V1
  const audit = [['Léo', 'prenom'], ['Anna', 'prenom'], ['Mathis', 'prenom'], ['chèvre', 'animal'], ['poisson', 'animal'],
    ['oiseau', 'animal'], ['bœuf', 'animal'], ['Laos', 'ville'], ['Togo', 'ville'], ['bol', 'objet'], ['piano', 'objet'],
    ['voiture', 'objet'], ['porte', 'objet'], ['Emma', 'prenom'], ['Lucas', 'prenom'], ['Inès', 'prenom'], ['Hugo', 'prenom'],
    ['chien', 'animal'], ['cheval', 'animal'], ['vache', 'animal'], ['Pérou', 'ville'], ['Oslo', 'ville'], ['Tokyo', 'ville'],
    ['boulanger', 'metier'], ['facteur', 'metier'], ['pompier', 'metier'], ['pomme', 'fruit'], ['tomate', 'fruit'],
    ['lit', 'objet'], ['table', 'objet']];
  const okAudit = audit.filter(([m, c]) => juge(m, c));
  check('les 30 réponses courantes de l’audit sont acceptées', okAudit.length === 30,
    okAudit.length + '/30' + (okAudit.length < 30 ? ' manquent : ' + audit.filter(x => !juge(x[0], x[1])).map(x => x[0]).join(', ') : ''));
  const tol = [['chauve souris', 'animal'], ['Chauve-Souris', 'animal'], ['Etats Unis', 'ville'], ['etats-unis', 'ville'],
    ['Saint Malo', 'ville'], ['St-Malo', 'ville'], ['st malo', 'ville'], ['pommes', 'fruit'], ['Le Havre', 'ville'],
    ['le havre', 'ville'], ['Havre', 'ville'], ['LA ROCHELLE', 'ville'], ['les chevaux', 'animal'], ['une vache', 'animal'],
    ['boulangère', 'metier'], ['infirmiere', 'metier'], ['coiffeuse', 'metier'], ['actrice', 'metier'], ['avocate', 'metier'],
    ['lionne', 'animal'], ['chienne', 'animal'], ['choux de bruxelles', 'fruit'], ['petits pois', 'fruit'],
    ['pommes de terre', 'fruit'], ['haricots verts', 'fruit'], ['elephant', 'animal'], ['CHOUETTE', 'animal'],
    ['hôtesse de l’air', 'metier'], ["hotesse de l'air", 'metier'], ['sage femme', 'metier'], ['micro ondes', 'objet'],
    ['fer a repasser', 'objet'], ['bijoux', 'objet'], ['yeux', 'corps'], ['bleue', 'couleur'], ['verte', 'couleur'],
    ['blanche', 'couleur'], ['courageuse', 'adjectif'], ['sportive', 'adjectif'], ['Côte-d’Ivoire', 'ville'], ['cote d ivoire', 'ville']];
  const okTol = tol.filter(([m, c]) => juge(m, c));
  check('saisie tolérante (tirets, espaces, articles, pluriels, féminins, accents, majuscules)', okTol.length === tol.length,
    okTol.length + '/' + tol.length + (okTol.length < tol.length ? ' refusés : ' + tol.filter(x => !juge(x[0], x[1])).map(x => x[0]).join(', ') : ''));
  check('« Le Havre » compte pour H… et pour L', bac._bonneLettre('Le Havre', 'H') && bac._bonneLettre('Le Havre', 'L') &&
    !bac._bonneLettre('Le Havre', 'A'));

  // échantillons de réponses courantes, tapées comme les joueurs les tapent
  const ECH = {
    prenom: 'Léo, Anna, Mathis, Emma, Lucas, Louise, Hugo, Chloé, Nathan, Inès, Jules, Camille, Raphaël, Manon, Gabriel, Sarah, Arthur, Lina, Adam, Jade, Paul, Zoé, Tom, Lola, Théo, Julie, Nicolas, Sophie, Pierre, Marie, Jean, Michel, Isabelle, Olivier, Nathalie, Thomas, Valérie, Bernard, Dominique, jean-pierre, marie claire, Elodie, Helene, Gaelle, Noemie, Jerome, Francois, Cedric, Oceane, Maelys, Anais, Benoit',
    animal: 'chèvre, poisson, oiseau, bœuf, boeuf, lion, tigre, chat, chien, cheval, vache, cochon, mouton, lapin, souris, renard, loup, ours, girafe, éléphant, zèbre, singe, serpent, tortue, grenouille, crocodile, dauphin, baleine, requin, aigle, hibou, pingouin, canard, poule, coq, abeille, fourmi, papillon, araignée, escargot, hippopotame, rhinocéros, kangourou, panda, koala, hérisson, écureuil, taupe, moustique, mouche, jaguar, guépard, léopard, panthère, otarie, phoque, pieuvre, méduse, crabe, homard, crevette, dinde, âne, lama, hamster, perroquet, pigeon, corbeau, moineau, truite, saumon, thon, sardine, vipère, lézard, iguane, gorille, chimpanzé, loutre, castor, bison, cerf, biche, sanglier, marmotte',
    ville: 'Paris, Lyon, Marseille, Toulouse, Nice, Nantes, Bordeaux, Lille, Strasbourg, Rennes, Montpellier, Brest, Dijon, Grenoble, Angers, Reims, Metz, Nancy, Tours, Orléans, Limoges, Amiens, Rouen, Caen, Perpignan, Toulon, Avignon, Nîmes, Pau, Bayonne, Biarritz, Annecy, Chamonix, Versailles, France, Espagne, Italie, Allemagne, Belgique, Suisse, Portugal, Japon, Chine, Inde, Brésil, Canada, Mexique, Maroc, Algérie, Tunisie, Sénégal, Egypte, Londres, Rome, Madrid, Berlin, Moscou, Tokyo, New York, new-york, Pekin, Dakar, Genève, Bruxelles, Venise, Amsterdam, Vienne, Varsovie, Dublin, Oslo, Helsinki, Athènes, Istanbul, Abidjan, Montreal, Quebec, Hongrie, Grèce, Irlande, Norvège, Suède, Danemark, Pologne, Russie, Ukraine, Turquie, Iran, Irak, Israël, Liban, Vietnam, Thaïlande, Australie, Argentine, Chili, Pérou, Colombie, Cuba, Haïti, Mali, Niger, Tchad, Gabon, Congo, Kenya, Madagascar',
    metier: 'boulanger, boulangère, médecin, docteur, infirmière, infirmier, pompier, policier, policière, professeur, prof, maîtresse, instituteur, avocat, avocate, dentiste, vétérinaire, plombier, électricien, maçon, menuisier, charpentier, jardinier, facteur, factrice, coiffeur, coiffeuse, cuisinier, serveur, serveuse, vendeur, vendeuse, pharmacien, pilote, hôtesse de l’air, steward, journaliste, photographe, architecte, ingénieur, informaticien, comptable, secrétaire, chauffeur, chauffeur de taxi, agriculteur, agricultrice, fermier, pêcheur, boucher, bouchère, charcutier, pâtissier, patissier, fleuriste, libraire, juge, notaire, sage femme, sapeur pompier, chanteuse, danseuse, actrice, acteur, astronaute, mécanicien, garagiste, ambulancier, kiné, orthophoniste, psychologue, militaire, soldat, gendarme, douanier, banquier, caissière, éboueur, bûcheron, berger, apiculteur, peintre, sculpteur, musicien, écrivain, traducteur, interprète, avocat, chirurgien, opticien, directeur, ouvrier',
    fruit: 'pomme, pommes, poire, banane, orange, fraise, framboise, cerise, abricot, pêche, prune, raisin, melon, pastèque, ananas, kiwi, citron, mangue, tomate, carotte, courgette, aubergine, poivron, concombre, salade, laitue, haricot vert, haricots verts, petits pois, petit pois, pomme de terre, pommes de terre, chou fleur, chou-fleur, choux de bruxelles, oignon, ail, poireau, navet, radis, épinard, epinards, endive, betterave, céleri, artichaut, asperge, brocoli, champignon, potiron, citrouille, noix de coco, datte, figue, olive, litchi, lentilles, haricot, igname, jujube, vanille, tangerine, topinambour, echalote, mandarine, clémentine, pamplemousse, myrtille, mûre, groseille, cassis, nectarine, rhubarbe, fenouil, patate douce, maïs, avocat, noisette, noix, châtaigne, marron',
    objet: 'bol, piano, voiture, porte, chaise, table, lit, lampe, stylo, crayon, livre, cahier, verre, tasse, assiette, fourchette, couteau, cuillère, cuillere, téléphone, ordinateur, télévision, télé, montre, clé, clef, ciseaux, marteau, tournevis, balai, seau, bouteille, bougie, miroir, parapluie, sac, valise, ballon, vélo, velo, coussin, oreiller, couverture, tapis, horloge, réveil, radio, bureau, armoire, lunettes, chaussure, chaussures, gant, bague, collier, bracelet, peigne, brosse, savon, serviette, robinet, fenêtre, casserole, poêle, frigo, four, micro-ondes, micro ondes, aspirateur, fer à repasser, sèche-cheveux, télécommande, trousse, règle, gomme, agrafeuse, globe, jouet, poupée, peluche, toupie, guitare, violon, trompette, casquette, chapeau, écharpe, pantalon, jupe',
    couleur: 'rouge, bleu, vert, jaune, orange, violet, rose, noir, blanc, gris, marron, beige, turquoise, indigo, argent, doré, bordeaux, kaki, lilas, mauve, fuchsia, cyan, magenta, ocre, saumon, ivoire, émeraude, pourpre, vermillon, écarlate, azur, corail, crème, caramel',
    sport: 'football, foot, tennis, rugby, basket, handball, natation, judo, karaté, boxe, golf, ski, surf, escalade, cyclisme, vélo, danse, gymnastique, athlétisme, équitation, escrime, badminton, volley, ping-pong, hockey, patinage, snowboard, voile, aviron, canoë, kayak, marathon, plongée, pétanque, bowling, billard, lutte, triathlon, yoga, roller, skateboard',
    boisson: 'eau, café, thé, lait, jus d’orange, soda, limonade, bière, vin, champagne, cidre, whisky, vodka, rhum, sirop, chocolat chaud, tisane, cocktail, smoothie, milk-shake, grenadine, diabolo, pastis, mojito, infusion, kir, porto, cognac, cappuccino, expresso',
    corps: 'tête, bras, jambe, main, pied, doigt, orteil, nez, bouche, oeil, œil, yeux, oreille, cou, épaule, coude, genou, cheville, poignet, ventre, dos, cœur, coeur, poumon, foie, estomac, cerveau, dent, langue, lèvre, joue, front, menton, cheveux, sourcil, cil, ongle, peau, os, muscle, hanche, fesse, cuisse, mollet, talon, nombril, rein',
    transport: 'voiture, bus, train, avion, bateau, vélo, moto, métro, tram, tramway, taxi, camion, hélicoptère, fusée, scooter, trottinette, péniche, TGV, RER, car, navette, montgolfière, sous-marin, tracteur, calèche, charrette, ambulance, paquebot, voilier, jet-ski',
    plat: 'pizza, pâtes, lasagnes, couscous, paella, raclette, fondue, tartiflette, crêpe, gaufre, quiche, omelette, hamburger, frites, sushi, soupe, salade, gratin, ratatouille, cassoulet, choucroute, blanquette, pot-au-feu, bœuf bourguignon, poulet, steak, saucisse, jambon, fromage, tarte, gâteau, croissant, baguette, pain, riz, purée, spaghetti, tacos, kebab, burger',
    plante: 'rose, tulipe, marguerite, pâquerette, coquelicot, lys, lilas, jasmin, lavande, tournesol, orchidée, violette, muguet, pensée, géranium, cactus, bambou, fougère, lierre, chêne, sapin, pin, érable, bouleau, palmier, saule, olivier, hortensia, iris, jonquille, narcisse, pissenlit, trèfle, ortie, mimosa, magnolia',
    jeu: 'dames, échecs, cartes, belote, tarot, poker, domino, puzzle, monopoly, scrabble, uno, cluedo, loto, bataille, cache-cache, marelle, toupie, poupée, peluche, ballon, billes, yoyo, cerf-volant, trottinette, dés, memory, mikado, jenga, osselets, corde à sauter',
    instrument: 'piano, guitare, violon, batterie, flûte, trompette, saxophone, harpe, accordéon, clarinette, violoncelle, contrebasse, tambour, trombone, tuba, harmonica, xylophone, orgue, banjo, ukulélé, synthétiseur, hautbois, cor, triangle, cymbale, djembé, maracas, luth, mandoline, cornemuse',
    vetement: 'pantalon, jean, jupe, robe, chemise, tee-shirt, t-shirt, pull, gilet, veste, manteau, blouson, short, chaussette, chaussure, basket, botte, sandale, écharpe, bonnet, chapeau, casquette, gant, ceinture, cravate, pyjama, maillot de bain, sweat, costume, anorak, parka, doudoune, legging, collant, culotte, slip, soutien-gorge, tablier, kimono, tutu',
    adjectif: 'gentil, méchant, drôle, timide, courageux, généreux, patient, poli, honnête, gourmand, paresseux, jaloux, sympathique, sympa, intelligent, curieux, calme, joyeux, triste, têtu, bavard, sérieux, sage, fier, radin, avare, égoïste, menteur, peureux, rigolo'
  };
  Object.keys(ECH).forEach(id => {
    const mots = ECH[id].split(', ');
    const ok = mots.filter(m => juge(m, id));
    const taux = ok.length / mots.length;
    check('« ' + bac._CATEGORIES.find(c => c.id === id).nom + ' » : ≥ 90 % des réponses courantes acceptées', taux >= 0.9,
      pct(taux) + ' (' + ok.length + '/' + mots.length + ')' + (taux < 1 ? ' — refusés : ' + mots.filter(m => !juge(m, id)).join(', ') : ''));
  });
  // les rejets doivent être justes : mots d'une autre catégorie, inventés, fautes de lettre
  const FAUX = [['Paris', 'animal'], ['table', 'animal'], ['Marie', 'animal'], ['pomme', 'animal'], ['boulanger', 'animal'],
    ['xyzzy', 'animal'], ['Mer', 'animal'], ['vole', 'animal'], ['chien', 'prenom'], ['Lyon', 'prenom'], ['table', 'prenom'],
    ['vélo', 'prenom'], ['lion', 'metier'], ['Paris', 'metier'], ['chaise', 'metier'], ['stylo', 'fruit'], ['chat', 'fruit'],
    ['Manane', 'fruit'], ['Lyon', 'fruit'], ['maison', 'objet'], ['Meule', 'objet'], ['Pierre', 'objet'], ['lion', 'objet'],
    ['boulanger', 'ville'], ['Moise', 'ville'], ['chat', 'ville'], ['rouge', 'ville'], ['piano', 'couleur'], ['Nice', 'sport'],
    ['carotte', 'boisson'], ['vélo', 'corps'], ['chat', 'transport'], ['chien', 'plat'], ['Tokyo', 'plante'], ['lion', 'jeu'],
    ['pomme', 'instrument'], ['Lyon', 'vetement'], ['chaise', 'adjectif'], ['Meulier', 'metier'], ['azertyuiop', 'objet']];
  const rejets = FAUX.filter(([m, c]) => !juge(m, c));
  check('rejets justes : mots hors catégorie ou inventés refusés', rejets.length === FAUX.length,
    rejets.length + '/' + FAUX.length + (rejets.length < FAUX.length ? ' acceptés à tort : ' + FAUX.filter(x => juge(x[0], x[1])).map(x => x.join('→')).join(', ') : ''));

  console.log('--- Petit Bac : un arbitrage équitable ---');
  function manche(noms, lettre, reponses) {
    const g = bac.create(noms);
    bac.apply(g, 0, { t: 'start' });
    g.letter = lettre;
    reponses.forEach((r, i) => bac.apply(g, i, { t: 'answers', list: r }));
    return g;
  }
  {
    // à deux : l'adversaire ne peut plus refuser un mot du dictionnaire
    const g = manche(['A', 'B'], 'L', [['Léa', 'lion', 'Lyon', 'libraire', 'litchi', 'lampe'], ['Lucas', 'loup', 'Lille', 'Lzzzz', '', '']]);
    bac.apply(g, 1, { t: 'vote', grid: { 0: [false, false, false, false, false, false] } });
    bac.apply(g, 0, { t: 'vote', grid: { 1: [true, true, true, false, true, true] } });
    check('à deux : refuser un mot du dictionnaire ne sert à rien (6 × 10 pts)', g.players[0].score === 60, g.players[0].score);
    check('… le refus est expliqué : « validé malgré le refus »', g.results[0][0].dico === true);
    check('… un mot inventé refusé par l’adversaire reste refusé, avec son auteur',
      g.results[1][3].pts === 0 && g.results[1][3].why === 'vote' && g.results[1][3].par.join() === '0');
  }
  {
    // à trois : un seul refus contre une acceptation = égalité = accepté
    const g = manche(['A', 'B', 'C'], 'B', [['Bzorg', '', '', '', '', ''], ['', '', '', '', '', ''], ['', '', '', '', '', '']]);
    bac.apply(g, 1, { t: 'vote', grid: { 0: [false] } });
    bac.apply(g, 2, { t: 'vote', grid: { 0: [true] } });
    bac.apply(g, 0, { t: 'vote', grid: {} });
    check('à trois : 1 voix contre, 1 pour → accepté (égalité)', g.results[0][0].pts === 10);
    const h = manche(['A', 'B', 'C'], 'B', [['Bzorg', '', '', '', '', ''], ['', '', '', '', '', ''], ['', '', '', '', '', '']]);
    bac.apply(h, 1, { t: 'vote', grid: { 0: [false] } });
    bac.apply(h, 2, { t: 'vote', grid: { 0: [false] } });
    bac.apply(h, 0, { t: 'vote', grid: {} });
    check('… 2 voix contre → refusé, par « B et C »', h.results[0][0].pts === 0 && h.results[0][0].par.join() === '1,2');
  }
  {
    // doublons : moitié des points, avec qui on partage
    const g = manche(['A', 'B', 'C'], 'C', [['Camille', 'chat'], ['camille', 'Chats'], ['Clara', 'chien']]);
    ['A', 'B', 'C'].forEach((x, i) => bac.apply(g, i, { t: 'vote', grid: {} }));
    check('doublons tolérants (« Camille » = « camille », « chat » = « Chats ») : 5 pts chacun',
      g.results[0][0].pts === 5 && g.results[1][0].pts === 5 && g.results[0][1].pts === 5 && g.results[2][0].pts === 10);
    check('… on sait avec qui on partage', g.results[0][0].why === 'doublon' && g.results[0][0].avec.join() === '1');
  }
  {
    // bug 7 : chaque refus est expliqué
    const g = manche(['A', 'B'], 'M', [['', 'Paris', 'M', 'Mzzq', 'melon', 'marteau'], ['', '', '', '', '', '']]);
    bac.apply(g, 1, { t: 'vote', grid: { 0: [true, true, true, false, true, true] } });
    bac.apply(g, 0, { t: 'vote', grid: {} });
    const w = g.results[0].map(r => r.why || '');
    check('refus expliqués : vide, mauvaise lettre, trop court, vote (qui)', w[0] === 'vide' && w[1] === 'lettre' &&
      w[2] === 'court' && w[3] === 'vote', w);
    const txt = [0, 1, 2, 3].map(c => bac._pourquoi(g, g.results[0][c], bac._CATEGORIES[c].id, 0));
    check('… et chaque raison se lit en clair', txt.every(t => t && t.length > 5) && /ne commence pas par M/.test(txt[1]) &&
      /refusé par B/.test(txt[3]), txt);
  }
  {
    // bug 8 : en solo, un refus de l'IA se conteste
    const g = manche(['Moi', '🤖 IA'], 'B', [['Bartholoméo', 'bouledogue', 'Brest', 'bijoutier', 'banane', 'bol'], ['', '', '', '', '', '']]);
    const va = bac.bot(clone(g), 1, { niveau: 'moyen' });
    check('le vote de l’IA est marqué « IA »', va.t === 'vote' && va.ia === true);
    bac.apply(g, 1, va);
    bac.apply(g, 0, { t: 'vote', grid: {} });
    const r = g.results[0][0];
    check('prénom inconnu de l’IA : refusé, raison « inconnu de l’IA »', r.pts === 0 && r.why === 'vote' && r.ia === true,
      bac._pourquoi(g, r, 'prenom', 0));
    const avant = g.players[0].score;
    const rc = bac.apply(g, 0, { t: 'contester', c: 0 });
    check('contester : accepté, +10 points, raison affichée', rc.ok && g.results[0][0].pts === 10 && g.players[0].score === avant + 10 &&
      /contestation/.test(bac._pourquoi(g, g.results[0][0], 'prenom', 0)));
    check('contester une réponse déjà acceptée : impossible', !bac.apply(g, 0, { t: 'contester', c: 1 }).ok);
  }
  {
    // sur un seul téléphone : chacun son tour, la lettre n'est révélée qu'à l'écrivain
    const g = bac.create(['A', 'B', 'C']);
    const rs = bac.apply(g, 0, { t: 'start', mode: 'chacun' });
    check('mode « on se passe le téléphone » : pas de minuteur commun', rs.ok && !rs.timer && g.mode === 'chacun');
    check('… c’est à A d’écrire, et lui seul voit la lettre une fois prêt',
      bac.turnOf(g) === 0 && bac.redact(g, 0).letter === '' && bac.redact(g, 1).letter === '');
    const go = bac.apply(g, 0, { t: 'go' });
    check('… « Découvrir ma lettre » lance SON minuteur', go.ok && go.timer.ms === 60000 && bac.redact(g, 0).letter === g.letter &&
      bac.redact(g, 1).letter === '');
    check('… B ne peut pas écrire à la place de A', !bac.apply(g, 1, { t: 'answers', list: ['x'] }).ok);
    bac.apply(g, 0, { t: 'answers', list: [g.letter + 'aaa'] });
    check('… puis c’est à B', bac.turnOf(g) === 1 && bac.viewerOf(g) === 1 && !g.pretEcrire);
    bac.apply(g, 1, { t: 'go' });
    bac.apply(g, 1, { t: 'answers', list: [] });
    bac.apply(g, 2, { t: 'go' });
    bac.apply(g, -1, { t: 'timeUp', p: 2, r: g.round });
    check('… le minuteur de C expire : sa feuille est close, la table corrige', g.phase === 'vote' && g.submitted[2] === true);
    check('… un vote individuel est refusé (on corrige ensemble)', !bac.apply(g, 1, { t: 'vote', grid: {} }).ok);
    bac.apply(g, 0, { t: 'corriger', grid: { 0: [false] } });
    check('… la correction collective décide (mot inventé refusé par la table)', g.phase === 'result' &&
      g.results[0][0].why === 'table' && g.results[0][0].pts === 0);
  }
  {
    // configuration : catégories, durée, manches (liste blanche)
    const g = bac.create(['A', 'B']);
    check('config : réservée à l’hôte', !bac.apply(g, 1, { t: 'config', duree: 90 }).ok);
    check('config : catégories au choix', bac.apply(g, 0, { t: 'config', cats: ['sport', 'couleur', 'pays', 'boisson'] }).ok &&
      g.catIds.join() === 'sport,couleur,pays,boisson');
    check('config : identifiants inconnus ignorés, 3 catégories minimum',
      !bac.apply(g, 0, { t: 'config', cats: ['<img src=x>', 'sport'] }).ok && g.catIds.length === 4);
    check('config : durée et manches dans les listes proposées',
      bac.apply(g, 0, { t: 'config', duree: 90, manches: 6 }).ok && g.duration === 90 && g.maxRounds === 6 &&
      bac.apply(g, 0, { t: 'config', duree: 1, manches: 99 }).ok && g.duration === 90 && g.maxRounds === 6);
    const rs = bac.apply(g, 0, { t: 'start' });
    check('config appliquée à la manche', rs.timer.ms === 90000 && g.phase === 'answers');
    check('config figée une fois la partie lancée', !bac.apply(g, 0, { t: 'config', duree: 45 }).ok);
  }

  console.log('--- Petit Bac : l’IA mesurée ---');
  {
    const LTR2 = 'ABCDEFGHIJLMNOPRSTV'.split('');
    const res = {};
    ['facile', 'moyen', 'difficile'].forEach(niv => {
      let cases = 0, remplies = 0, valides = 0, hors = 0;
      LTR2.forEach(L => {
        for (let k = 0; k < 40; k++) {
          bac._botSheet(L, null, niv).forEach((m, c) => {
            cases++;
            if (!m) return;
            remplies++;
            if (!bac._bonneLettre(m, L)) { hors++; return; }
            if (bac._botJuge(m, c)) valides++;
          });
        }
      });
      res[niv] = { remplies: remplies / cases, valides: valides / Math.max(1, remplies - hors), hors: hors / Math.max(1, remplies) };
    });
    check('cases remplies : facile < moyen < difficile',
      res.facile.remplies < res.moyen.remplies - 0.1 && res.moyen.remplies < res.difficile.remplies - 0.1,
      Object.keys(res).map(k => k + ' ' + pct(res[k].remplies)).join(', '));
    check('ses propres réponses passent toujours son juge', Object.keys(res).every(k => res[k].valides > 0.999));
    check('étourderies de lettre : rares, jamais au niveau difficile', res.difficile.hors === 0 && res.moyen.hors < 0.05,
      Object.keys(res).map(k => k + ' ' + pct(res[k].hors)).join(', '));
    // difficile : des mots plus rares, donc moins de doublons avec un joueur « moyen »
    // (taux de doublons parmi les cases remplies des deux côtés)
    const dbl = { facile: [0, 0], difficile: [0, 0] };
    LTR2.forEach(L => {
      for (let k = 0; k < 60; k++) {
        const ref = bac._botSheet(L, null, 'moyen').map(bac._cle);
        ['facile', 'difficile'].forEach(niv => bac._botSheet(L, null, niv).map(bac._cle).forEach((x, c) => {
          if (x && ref[c]) { dbl[niv][1]++; if (x === ref[c]) dbl[niv][0]++; }
        }));
      }
    });
    const tf = dbl.facile[0] / dbl.facile[1], td = dbl.difficile[0] / dbl.difficile[1];
    check('difficile : moins de doublons que facile (mots plus rares)', td < tf * 0.8,
      'doublons avec un joueur moyen : facile ' + pct(tf) + ', difficile ' + pct(td));
    // parties complètes IA contre IA sur les 21 catégories
    let refus = 0, total = 0;
    for (let k = 0; k < 40; k++) {
      const g = bac.create(['A', 'B', 'C']);
      bac.apply(g, 0, { t: 'config', cats: bac._CATEGORIES.slice(k % 12, (k % 12) + 8).map(c => c.id) });
      bac.apply(g, 0, { t: 'start' });
      for (let i = 0; i < 3; i++) bac.apply(g, i, bac.bot(clone(g), i, { niveau: 'moyen' }));
      for (let i = 0; i < 3; i++) bac.apply(g, i, bac.bot(clone(g), i, { niveau: 'moyen' }));
      g.results.forEach(l => l.forEach(r => { if (r.ans && r.why !== 'lettre') { total++; if (r.why === 'vote') refus++; } }));
    }
    check('IA contre IA : les bonnes réponses ne sont jamais refusées', refus === 0, refus + ' refus sur ' + total);
  }
}

console.log(failures ? '\n' + failures + ' ÉCHEC(S)' : '\nTests V2 cartes, Memory, Petit Bac OK.');
process.exit(failures ? 1 : 0);
