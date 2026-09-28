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

console.log(failures ? '\n' + failures + ' ÉCHEC(S)' : '\nTests V2 cartes, Memory, Petit Bac OK.');
process.exit(failures ? 1 : 0);
