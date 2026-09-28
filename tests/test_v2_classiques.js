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

console.log(failures ? '\n' + failures + ' ÉCHEC(S)' : '\nTests V2 des classiques OK.');
process.exit(failures ? 1 : 0);
