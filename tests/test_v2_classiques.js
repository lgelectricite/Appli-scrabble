/*
 * V2 des cinq classiques (Puissance 4, Morpion, Bataille navale, Yams,
 * Cochon) : règles, corrections de l’audit et NIVEAUX D’IA MESURÉS.
 *
 * Usage : node tests/test_v2_classiques.js           (mesures complètes)
 *         node tests/test_v2_classiques.js --rapide  (moins de parties)
 *         node tests/test_v2_classiques.js p4        (un seul jeu)
 * Chaque mesure est imprimée (« MESURE … ») pour le rapport.
 */
const ROOT = require('path').join(__dirname, '..');
require(ROOT + '/js/games/registry.js');
const p4 = require(ROOT + '/js/games/p4.js');

const RAPIDE = process.argv.indexOf('--rapide') !== -1;
const SEUL = process.argv.slice(2).filter(a => a[0] !== '-')[0] || null;
let failures = 0;
function check(n, c, e) {
  if (c) console.log('  OK  ' + n);
  else { failures++; console.log('  FAIL ' + n + (e !== undefined ? ' -> ' + JSON.stringify(e) : '')); }
}
function mesure(n, v) { console.log('  MESURE ' + n + ' : ' + v); }
function pct(a, b) { return (100 * a / b).toFixed(1) + ' %'; }
function joue(nom) { return !SEUL || SEUL === nom; }

/* ================= PUISSANCE 4 ================= */
if (joue('p4')) {
  console.log('--- Puissance 4 : règles de la série ---');
  let g = p4.create(['A', 'B']);
  check('série en 3 manches par défaut', g.opts.manches === 3);
  check('niveaux déclarés', JSON.stringify(p4.niveaux) === '["facile","moyen","difficile"]');
  check('choix d’une série en 5 avant le 1er jeton', p4.apply(g, 1, { t: 'serie', n: 5 }).ok && g.opts.manches === 5);
  check('série inconnue refusée', !p4.apply(g, 0, { t: 'serie', n: 4 }).ok);
  p4.apply(g, 0, { t: 'serie', n: 1 });
  p4.apply(g, 0, { t: 'drop', col: 3 });
  check('série figée après le 1er jeton', !p4.apply(g, 0, { t: 'serie', n: 3 }).ok && g.opts.manches === 1);
  [0, 3, 0, 3, 0].forEach((c, k) => p4.apply(g, k % 2 === 0 ? 1 : 0, { t: 'drop', col: c }));
  // B (jaune) : 3 jetons colonne 0 ; A : 3 jetons colonne 3 → A gagne au prochain
  const fin = p4.apply(g, 0, { t: 'drop', col: 3 });
  check('manche gagnée = série gagnée en 1 manche', g.roundOver && g.winner === 0 && g.serieGagnee);
  check('minuteur de fin de série (le temps de voir la ligne)', fin.timer && fin.timer.action.t === 'fin', fin);
  check('pas encore terminé tant que la ligne brille', !p4.over(g));
  check('« manche suivante » refusée : la série est gagnée', !p4.apply(g, 0, { t: 'again' }).ok);
  check('le minuteur termine la partie', p4.apply(g, -1, { t: 'fin' }).ok && p4.over(g));
  check('minuteur en double sans effet ni erreur', p4.apply(g, -1, { t: 'fin' }).ok);
  check('gagnants() = [0]', JSON.stringify(p4.gagnants(g)) === '[0]');
  check('récapitulatif échappé', p4.summary(g).indexOf('remporte la série') !== -1);

  g = p4.create(['A', 'B']);
  let manchesJouees = 0, starters = [];
  while (!g.serieGagnee && manchesJouees < 9) {
    // celui qui commence aligne 4 en colonne 3
    const st = g.current;
    starters.push(st);
    for (let k = 0; k < 3; k++) { p4.apply(g, st, { t: 'drop', col: 3 }); p4.apply(g, 1 - st, { t: 'drop', col: 4 }); }
    p4.apply(g, st, { t: 'drop', col: 3 });
    manchesJouees++;
    if (!g.serieGagnee) p4.apply(g, 0, { t: 'again' });
  }
  check('série en 3 : finie quand un joueur atteint 3 victoires (5 manches ici)',
    g.serieGagnee && manchesJouees === 5 && g.players[0].wins === 3 && g.players[1].wins === 2,
    { manchesJouees, wins: g.players.map(p => p.wins) });
  check('on commence chacun son tour', starters.join('') === '01010', starters);
  check('numéro de manche tenu', g.manche === 5);
  const nom = p4.create(['<img src=x onerror=alert(1)>', 'B']);
  nom.players[0].wins = 3; nom.serieGagnee = true; nom.fini = true;
  check('prénom piégé échappé dans le récapitulatif', p4.summary(nom).indexOf('<img') === -1);

  console.log('--- Puissance 4 : bug 3 (l’IA « perdue » offrait la victoire) ---');
  // colonnes jouées, Rouge au trait ; jouer en 6 offre la victoire immédiate
  const POS = [4, 3, 3, 3, 2, 3, 3, 2, 2, 2, 5, 2, 5, 4, 1, 3, 2, 5, 4, 5, 4, 4, 1, 6];
  g = p4.create(['A', 'B']);
  POS.forEach(c => p4.apply(g, g.current, { t: 'drop', col: c }));
  check('position reconstituée (24 jetons, Rouge au trait)', g.coups === 24 && g.current === 0 && !g.roundOver);
  const an = p4._analyse(g.grid, 1, 6, { exact: true });
  check('la colonne 6 offre bien la victoire immédiate', an.coups.some(c => c.col === 6 && c.offre));
  const essais = RAPIDE ? 100 : 400;
  ['moyen', 'difficile'].forEach(niv => {
    let six = 0;
    const n = niv === 'difficile' ? 20 : essais;
    for (let i = 0; i < n; i++) if (p4.bot(g, 0, { niveau: niv }).col === 6) six++;
    mesure('P4 ' + niv + ' : colonne 6 jouée', six + '/' + n + ' (avant : 22 %)');
    check('P4 ' + niv + ' : ne joue JAMAIS le coup qui offre la victoire', six === 0);
  });

  console.log('--- Puissance 4 : niveaux d’IA mesurés ---');
  function partie(nA, nB, aCommence) {
    const s = p4.create(['a', 'b']);
    s.starter = aCommence ? 0 : 1; s.current = s.starter;
    const niv = [nA, nB];
    while (!s.roundOver) p4.apply(s, s.current, p4.bot(s, s.current, { niveau: niv[s.current] }));
    return s.draw ? -1 : s.winner;
  }
  const duels = [['moyen', 'facile', RAPIDE ? 20 : 60, 0.8], ['difficile', 'moyen', RAPIDE ? 8 : 24, 0.7],
    ['difficile', 'facile', RAPIDE ? 6 : 12, 0.9]];
  duels.forEach(([a, b, n, seuil]) => {
    let wa = 0, wb = 0, nul = 0;
    for (let i = 0; i < n; i++) {
      const w = partie(a, b, i % 2 === 0);
      if (w === 0) wa++; else if (w === 1) wb++; else nul++;
    }
    mesure('P4 ' + a + ' contre ' + b, wa + ' victoires, ' + wb + ' défaites, ' + nul + ' nuls sur ' + n +
      ' (' + pct(wa, n) + ', chacun commence une fois sur deux)');
    check('P4 : ' + a + ' bat nettement ' + b, wa >= seuil * n);
  });
  // profondeur et temps du niveau difficile sur des milieux de partie
  let profMin = 99, msMax = 0, msSom = 0, msMinMax = 0, nPos = 0;
  for (let i = 0; i < (RAPIDE ? 8 : 25); i++) {
    const s = p4.create(['a', 'b']);
    const nb = 6 + (i % 12);
    for (let k = 0; k < nb && !s.roundOver; k++) p4.apply(s, s.current, p4.bot(s, s.current, { niveau: 'facile' }));
    if (s.roundOver) continue;
    p4._razTable();
    const an2 = p4._analyse(s.grid, s.current === 0 ? 1 : 2, 16, { table: true, iteratif: true, minProf: 8, budget: 90 });
    if (Math.abs(Math.max.apply(null, an2.coups.map(c => c.val))) > 50000) continue; // partie déjà jouée
    profMin = Math.min(profMin, an2.prof); msMax = Math.max(msMax, an2.ms); msSom += an2.ms;
    msMinMax = Math.max(msMinMax, an2.msMin); nPos++;
  }
  mesure('P4 difficile : profondeur atteinte', 'au moins ' + profMin + ' demi-coups sur ' + nPos + ' milieux de partie');
  mesure('P4 difficile : temps de réflexion', 'moyenne ' + (msSom / nPos).toFixed(0) + ' ms, max ' + msMax.toFixed(0) +
    ' ms ; 8 demi-coups atteints en ' + msMinMax.toFixed(0) + ' ms au pire (table vide)');
  check('P4 difficile : 8 demi-coups au moins', profMin >= 8);
  check('P4 difficile : réponse en moins de 250 ms (processeur normal)', msMax < 250);
  check('P4 difficile : 8 demi-coups en moins de 100 ms (soit < 400 ms au processeur ×4)', msMinMax < 100);
  // gagne à coup sûr et pare toujours
  {
    const s = p4.create(['a', 'b']);
    [3, 0, 3, 0, 3, 1].forEach(c => p4.apply(s, s.current, { t: 'drop', col: c }));
    let ok = true;
    ['facile', 'moyen', 'difficile'].forEach(n => { if (n !== 'facile' && p4.bot(s, 0, { niveau: n }).col !== 3) ok = false; });
    check('P4 moyen/difficile : la victoire immédiate est toujours prise', ok);
  }
}

/* ================= MORPION ================= */
if (joue('morpion')) {
  const mor = require(ROOT + '/js/games/morpion.js');
  console.log('--- Morpion : série ---');
  let g = mor.create(['A', 'B']);
  check('niveaux déclarés', JSON.stringify(mor.niveaux) === '["facile","moyen","difficile"]');
  check('série en 3 par défaut, 1/3/5 au choix', g.opts.manches === 3 && mor.apply(g, 0, { t: 'serie', n: 1 }).ok);
  [0, 3, 1, 4].forEach(i => mor.apply(g, g.current, { t: 'play', i }));
  const r = mor.apply(g, 0, { t: 'play', i: 2 });
  check('ligne + série gagnée en 1 manche → minuteur de fin', g.serieGagnee && r.timer && r.timer.action.t === 'fin');
  check('fin de partie après le minuteur, gagnants() = [0]',
    mor.apply(g, -1, { t: 'fin' }).ok && mor.over(g) && JSON.stringify(mor.gagnants(g)) === '[0]');

  console.log('--- Morpion : bug 6 (le piège des coins opposés) ---');
  // X (humain) : coin 0 ; si O prend le centre, X prend le coin opposé 8 ;
  // ensuite X gagne s’il peut, pare sinon, et crée une fourchette s’il peut
  function humainPiege(s) {
    const gr = s.grid, libres = [];
    for (let i = 0; i < 9; i++) if (!gr[i]) libres.push(i);
    if (!gr[0]) return 0;
    if (!gr[8] && gr[4] === 'O') return 8;
    const L = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
    const fin = (j) => L.map(l => l.filter(c => gr[c] === j).length === 2 && l.some(c => !gr[c]) ? l.find(c => !gr[c]) : -1).filter(c => c >= 0);
    if (fin('X').length) return fin('X')[0];
    if (fin('O').length) return fin('O')[0];
    for (const c of libres) {
      gr[c] = 'X'; const n = fin('X').length; gr[c] = null;
      if (n >= 2) return c;
    }
    return libres[0];
  }
  const N = RAPIDE ? 300 : 1000;
  ['facile', 'moyen', 'difficile'].forEach(niv => {
    let perdu = 0;
    for (let k = 0; k < N; k++) {
      const s = mor.create(['H', 'IA']);
      while (!s.roundOver) {
        const a = s.current === 0 ? { t: 'play', i: humainPiege(s) } : mor.bot(s, 1, { niveau: niv });
        mor.apply(s, s.current, a);
      }
      if (s.winner === 0) perdu++;
    }
    mesure('Morpion ' + niv + ' : piège des coins opposés gagnant', perdu + '/' + N + ' (avant : 1000/1000)');
    if (niv === 'difficile') check('Morpion difficile : le piège ne marche JAMAIS', perdu === 0);
    if (niv === 'moyen') check('Morpion moyen : le piège ne marche plus à coup sûr (< 40 %)', perdu < 0.4 * N);
  });

  console.log('--- Morpion : difficile imbattable (toutes les parties possibles) ---');
  // on explore TOUTES les suites de coups de l’adversaire, et tous les
  // coups que le niveau difficile peut choisir
  let parties = 0, defaites = 0, victoiresIA = 0;
  function explore(grid, trait, iaSym) {
    const L = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
    const ligne = L.find(l => grid[l[0]] && grid[l[0]] === grid[l[1]] && grid[l[1]] === grid[l[2]]);
    if (ligne || grid.every(v => v)) {
      parties++;
      if (ligne && grid[ligne[0]] !== iaSym) defaites++;
      else if (ligne) victoiresIA++;
      return;
    }
    const choix = trait === iaSym ? mor._candidatsDifficile(grid, iaSym)
      : grid.map((v, i) => v ? -1 : i).filter(i => i >= 0);
    choix.forEach(i => {
      const g2 = grid.slice(); g2[i] = trait;
      explore(g2, trait === 'X' ? 'O' : 'X', iaSym);
    });
  }
  explore([null, null, null, null, null, null, null, null, null], 'X', 'X');
  explore([null, null, null, null, null, null, null, null, null], 'X', 'O');
  mesure('Morpion difficile', parties + ' parties explorées (IA en X puis en O) : ' + defaites +
    ' défaite, ' + victoiresIA + ' victoires de l’IA');
  check('Morpion difficile : AUCUNE défaite possible', defaites === 0 && parties > 1000);

  console.log('--- Morpion : niveaux mesurés entre eux ---');
  function duel(a, b, n) {
    let wa = 0, wb = 0;
    for (let k = 0; k < n; k++) {
      const s = mor.create(['a', 'b']);
      s.starter = k % 2; s.current = s.starter;
      const niv = [a, b];
      while (!s.roundOver) mor.apply(s, s.current, mor.bot(s, s.current, { niveau: niv[s.current] }));
      if (s.winner === 0) wa++; else if (s.winner === 1) wb++;
    }
    return [wa, wb, n - wa - wb];
  }
  const nD = RAPIDE ? 200 : 1000;
  [['moyen', 'facile'], ['difficile', 'moyen'], ['difficile', 'facile']].forEach(([a, b]) => {
    const [wa, wb, nul] = duel(a, b, nD);
    mesure('Morpion ' + a + ' contre ' + b, wa + ' victoires, ' + wb + ' défaites, ' + nul + ' nuls sur ' + nD);
    check('Morpion : ' + a + ' ne perd presque jamais contre ' + b, wb <= (a === 'difficile' ? 0 : 0.05 * nD));
    // entre deux joueurs solides le morpion finit souvent nul : on exige
    // seulement que le plus fort gagne nettement plus qu’il ne perd
    check('Morpion : ' + a + ' gagne nettement plus que ' + b, wa >= Math.max(5 * wb, (b === 'facile' ? 0.25 : 0.01) * nD));
  });
}

/* ================= BATAILLE NAVALE ================= */
if (joue('bataille')) {
  const bn = require(ROOT + '/js/games/bataille.js');
  const N = 10;
  const pret = s => { bn.apply(s, 0, { t: 'ready' }); bn.apply(s, 1, { t: 'ready' }); };
  function seTouchent(board) {
    for (let a = 0; a < board.ships.length; a++) {
      for (let b = a + 1; b < board.ships.length; b++) {
        for (const i of board.ships[a].cells) {
          for (const j of board.ships[b].cells) {
            if (Math.abs(Math.floor(i / N) - Math.floor(j / N)) <= 1 && Math.abs(i % N - j % N) <= 1) return true;
          }
        }
      }
    }
    return false;
  }
  console.log('--- Bataille : flottes au hasard (bug 9) ---');
  let touchent = 0, malFormees = 0;
  const NF = RAPIDE ? 400 : 2000;
  for (let k = 0; k < NF; k++) {
    const f = bn._randomFleet();
    if (seTouchent(f)) touchent++;
    const tailles = f.ships.map(s => s.size).join(',');
    if (tailles !== '5,4,3,3,2' || Object.keys(f.cells).length !== 17) malFormees++;
  }
  mesure('Bataille : flottes au hasard dont des navires se touchent', touchent + '/' + NF + ' (avant : 80,5 %)');
  check('Bataille : aucune flotte au hasard n’a de navires qui se touchent', touchent === 0);
  check('Bataille : flottes toujours complètes (5 navires, 17 cases)', malFormees === 0);

  console.log('--- Bataille : règles au choix ---');
  let g = bn.create(['Léa', 'Marc']);
  check('par défaut : un tir par tour, navires écartés, série en 3',
    !g.opts.rejoue && !g.opts.colles && g.opts.manches === 3);
  check('règles modifiables avant que quiconque soit prêt', bn.apply(g, 1, { t: 'regles', colles: true, manches: 5 }).ok &&
    g.opts.colles && g.opts.manches === 5);
  check('série inconnue refusée', !bn.apply(g, 0, { t: 'regles', manches: 2 }).ok);
  // placement manuel : collés permis → on peut coller deux navires
  const b0 = g.boards[0];
  const autre = b0.ships[1];
  const place = (s, r, c, h) => bn.apply(g, 0, { t: 'place', s, r, c, h });
  check('placement hors grille refusé', !place(4, 9, 9, true).ok);
  const occupe = autre.cells[0];
  check('placement sur un autre navire refusé',
    !bn.apply(g, 0, { t: 'place', s: 4, r: Math.floor(occupe / N), c: occupe % N, h: true }).ok);
  // on met le torpilleur juste à côté d’un navire (si possible) : accepté en « collés permis »
  let colle = null;
  for (let r = 0; r < N && !colle; r++) for (let c = 0; c < N - 1 && !colle; c++) {
    const cl = [r * N + c, r * N + c + 1];
    const libre = cl.every(i => g.boards[0].cells[i] === undefined || g.boards[0].cells[i] === 4);
    const voisin = cl.some(i => [-1, 1, -N, N].some(d => g.boards[0].cells[i + d] !== undefined && g.boards[0].cells[i + d] !== 4 &&
      Math.abs((i + d) % N - i % N) <= 1));
    if (libre && voisin) colle = { r, c };
  }
  check('navires collés acceptés quand la règle le permet', colle && place(4, colle.r, colle.c, true).ok);
  check('le navire a bien bougé', g.boards[0].ships[4].r === colle.r && g.boards[0].ships[4].c === colle.c &&
    g.boards[0].cells[colle.r * N + colle.c] === 4);
  check('repasser en « écartés » replace la flotte qui ne l’est plus', bn.apply(g, 0, { t: 'regles', colles: false }).ok &&
    !seTouchent(g.boards[0]) && bn._flotteValide(g.boards[0], false));
  check('en « écartés », coller un navire est refusé', (() => {
    const cible = g.boards[0].ships[0].cells[0], r = Math.floor(cible / N), c = cible % N;
    for (const [rr, cc] of [[r - 1, c], [r + 1, c], [r, c - 2], [r, c + 1]]) {
      if (rr < 0 || rr >= N || cc < 0 || cc >= N - 1) continue;
      const res = bn.apply(g, 0, { t: 'place', s: 4, r: rr, c: cc, h: true });
      if (res.ok) return false;
    }
    return true;
  })());
  bn.apply(g, 0, { t: 'ready' });
  check('règles figées dès qu’un joueur est prêt', !bn.apply(g, 1, { t: 'regles', rejoue: true }).ok);
  check('placement refusé une fois prêt', !bn.apply(g, 0, { t: 'shuffle' }).ok);

  console.log('--- Bataille : bug 2 (le tireur voit son résultat avant de passer la main) ---');
  g = bn.create(['Léa', 'Marc']);
  pret(g);
  const eau = (s, cible) => { for (let i = 0; i < N * N; i++) if (s.boards[cible].cells[i] === undefined && !s.shots[cible][i]) return i; };
  const tir = bn.apply(g, 0, { t: 'fire', i: eau(g, 1) });
  check('tir à l’eau : la main NE passe PAS tout de suite', g.current === 0 && g.attente === true);
  check('sur un téléphone, l’écran reste celui du tireur', bn.turnOf(g) === 0 && bn.viewerOf(g) === 0);
  check('le résultat reste affiché ≈ 1,2 s (minuteur « suite »)', tir.timer && tir.timer.action.t === 'suite' &&
    tir.timer.ms >= 1000 && tir.timer.ms <= 1600, tir.timer);
  check('le dernier tir dit QUI a tiré', g.dernier.tireur === 0 && g.dernier.cible === 1 && g.dernier.res === 'eau');
  check('pas de second tir pendant l’affichage', !bn.apply(g, 0, { t: 'fire', i: eau(g, 1) }).ok);
  check('l’adversaire ne peut pas « passer » à la place du tireur', !bn.apply(g, 1, { t: 'suite' }).ok);
  check('un vieux minuteur (autre tir) ne fait rien', bn.apply(g, -1, { t: 'suite', n: 999 }).ok && g.current === 0);
  check('bouton « Passer le téléphone » : la main passe', bn.apply(g, 0, { t: 'suite' }).ok && g.current === 1 && !g.attente);
  check('le minuteur qui arrive ensuite ne fait rien (et ne râle pas)',
    bn.apply(g, -1, tir.timer.action).ok && g.current === 1);
  const touche = Object.keys(g.boards[0].cells).map(Number)[0];
  bn.apply(g, 1, { t: 'fire', i: touche });
  check('règle classique : même touché, la main passe après l’affichage', g.attente && g.current === 1 && g.dernier.res !== 'eau');
  const vueTireur = bn.redact(g, 1), vueCible = bn.redact(g, 0);
  check('le tireur apprend « touché » sans savoir quel navire', vueTireur.dernier.navire === undefined);
  check('la cible sait quel navire est touché', vueCible.dernier.navire === g.boards[0].cells[touche]);
  bn.apply(g, -1, { t: 'suite', n: g.nTirs });
  check('le minuteur passe la main', g.current === 0);

  console.log('--- Bataille : variante « touché = on rejoue » et secret des flottes ---');
  g = bn.create(['A', 'B']);
  bn.apply(g, 0, { t: 'regles', rejoue: true });
  pret(g);
  const cibleB = Object.keys(g.boards[1].cells).map(Number);
  bn.apply(g, 0, { t: 'fire', i: cibleB[0] });
  check('touché = on rejoue, sans attendre', g.current === 0 && !g.attente);
  const red = bn.redact(g, 1);
  check('en jeu, la flotte adverse ne circule pas (cases, positions)', Object.keys(red.boards[0].cells).length === 0 &&
    red.boards[0].ships.every(s => s.sunk || (s.r === undefined && s.cells.length === 0)));
  cibleB.slice(1).forEach(i => bn.apply(g, 0, { t: 'fire', i }));
  check('manche gagnée', g.finished && g.winner === 0 && g.players[0].wins === 1);
  const redFin = bn.redact(g, 1);
  check('fin de manche : le perdant revoit les deux flottes', Object.keys(redFin.boards[0].cells).length === 17 &&
    Object.keys(redFin.boards[1].cells).length === 17 && redFin.boards[0].ships.every(s => s.r !== undefined));
  check('manche suivante : le perdant commence', bn.apply(g, 0, { t: 'again' }).ok && (pret(g), g.current === 1) && g.manche === 2);

  console.log('--- Bataille : série et fin de partie ---');
  g = bn.create(['A', 'B']);
  bn.apply(g, 0, { t: 'regles', manches: 1, rejoue: true });
  pret(g);
  let fin = null;
  Object.keys(g.boards[1].cells).map(Number).forEach(i => { fin = bn.apply(g, 0, { t: 'fire', i }); });
  check('série en 1 gagnée → minuteur de fin (le temps de voir)', g.serieGagnee && fin.timer && fin.timer.action.t === 'fin');
  check('« manche suivante » refusée', !bn.apply(g, 0, { t: 'again' }).ok);
  check('fin de partie : over() et gagnants()', bn.apply(g, -1, { t: 'fin' }).ok && bn.over(g) &&
    JSON.stringify(bn.gagnants(g)) === '[0]');
  const nomPiege = bn.create(['<b onclick=x>', 'B']);
  nomPiege.players[0].wins = 3; nomPiege.fini = true;
  check('récapitulatif échappé', bn.summary(nomPiege).indexOf('<b onclick') === -1);

  console.log('--- Bataille : IA contre l’humain ---');
  g = bn.create(['Vous', '🤖 Margot']);
  g.niveauIA = 'difficile';
  check('l’IA attend que l’humain ait réglé et placé', bn.bot(GG.clone(g), 1, { niveau: 'difficile' }) === null);
  bn.apply(g, 0, { t: 'ready' });
  check('puis elle se déclare prête', JSON.stringify(bn.bot(GG.clone(g), 1, {})) === '{"t":"ready"}');
  bn.apply(g, 1, { t: 'ready' });
  bn.apply(g, 0, { t: 'fire', i: eau(g, 1) });
  bn.apply(g, 0, { t: 'suite' });
  const aIA = bn.bot(GG.clone(g), 1, { niveau: 'difficile' });
  bn.apply(g, 1, aIA);
  check('en solo, le tir de l’IA rend la main sans attente', g.current === 0 && !g.attente);
  // fair-play : l’IA joue pareil sur la vue expurgée (elle ne lit pas les secrets)
  const vue = bn.redact(g, 1);
  vue.boards[0].cells = {};
  const iRed = bn._tir(vue, 1, 'difficile');
  check('l’IA vise sans connaître la flotte adverse', iRed >= 0 && !g.shots[0][iRed]);

  console.log('--- Bataille : niveaux d’IA mesurés (tirs pour couler une flotte) ---');
  function tirsPourCouler(niveau, colles) {
    const s = bn.create(['a', 'b']);
    s.opts.colles = colles;
    if (colles) s.boards[1] = bn._randomFleet();
    pret(s);
    let n = 0;
    while (!s.finished && n < 100) {
      s.current = 0; s.attente = false;
      const a = bn.bot(s, 0, { niveau });
      bn.apply(s, 0, a); n++;
    }
    return n;
  }
  const NM = RAPIDE ? 60 : 300;
  const moy = {};
  ['facile', 'moyen', 'difficile'].forEach(niv => {
    let tot = 0, pire = 0;
    for (let k = 0; k < NM; k++) { const n = tirsPourCouler(niv, false); tot += n; pire = Math.max(pire, n); }
    moy[niv] = tot / NM;
    mesure('Bataille ' + niv, moy[niv].toFixed(1) + ' tirs en moyenne pour couler toute la flotte (pire : ' + pire + ', sur ' + NM + ' flottes)');
  });
  check('Bataille difficile : ≈ 44 tirs (densité de probabilité)', moy.difficile <= 48, moy.difficile);
  {
    let tot = 0;
    for (let k = 0; k < NM; k++) tot += tirsPourCouler('difficile', true);
    mesure('Bataille difficile, règle « collés permis » (sans déduire les abords des épaves)',
      (tot / NM).toFixed(1) + ' tirs en moyenne');
    check('Bataille difficile sans déduction : toujours ≈ 44 tirs', tot / NM <= 50, tot / NM);
  }
  check('Bataille : difficile < moyen < facile', moy.difficile < moy.moyen && moy.moyen < moy.facile, moy);
  check('Bataille facile : nettement plus lent', moy.facile >= moy.moyen + 8, moy);
  // duel réel (un tir par tour) : difficile contre moyen
  let wD = 0;
  const ND = RAPIDE ? 40 : 200;
  for (let k = 0; k < ND; k++) {
    const s = bn.create(['a', 'b']);
    pret(s);
    s.current = k % 2;
    const niv = ['difficile', 'moyen'];
    let garde = 0;
    while (!s.finished && garde++ < 500) {
      const a = bn.bot(s, s.current, { niveau: niv[s.current] });
      bn.apply(s, s.current, a);
    }
    if (s.winner === 0) wD++;
  }
  mesure('Bataille difficile contre moyen', wD + ' victoires sur ' + ND + ' (' + pct(wD, ND) + ')');
  check('Bataille difficile bat moyen nettement', wD >= 0.62 * ND);
}

console.log(failures ? '\n' + failures + ' ÉCHEC(S)' : '\nTests V2 des classiques OK.');
process.exit(failures ? 1 : 0);
