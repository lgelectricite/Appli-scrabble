const ROOT = require('path').join(__dirname, '..');
/*
 * Harnais des adversaires IA : chaque jeu doté d'un mod.bot doit pouvoir se
 * jouer ENTIÈREMENT tout seul (tous les joueurs sont des IA) sans blocage,
 * sans action refusée et sans dépasser le budget d'étapes.
 *
 * Usage :  node test_bots.js            → tous les jeux configurés
 *          node test_bots.js p4        → un seul jeu (mise au point)
 *          node test_bots.js p4 20     → nombre de parties personnalisé
 *
 * Chaque jeu décrit sa partie dans botcfg/<id>.js :
 *   { names,             noms des joueurs (tous IA)
 *     stop(state, mod),  vrai quand la partie est considérée terminée
 *     drive(state, mod), action « humaine » d'enchaînement (écrans de fin de
 *                        manche, choix de niveau…) → {player, action} ou null
 *     max,               budget d'étapes par partie
 *     runs }             nombre de parties (défaut 5)
 *
 * Règles du contrat mod.bot(state, me, ctx) vérifiées ici :
 *   - state est une COPIE (une IA qui modifie l'état ne casse rien) ;
 *   - une action rendue doit être ACCEPTÉE par apply (sinon échec du test) ;
 *   - rendre null quand on n'a rien à faire (l'attente n'est pas un blocage
 *     tant qu'un minuteur d'autorité ou le « drive » fait avancer le jeu).
 */
require(ROOT + '/js/games/registry.js');
require(ROOT + '/js/games/motscourants.js');
const fs = require('fs');
const path = require('path');
const AI = require(ROOT + '/js/ai.js');
const dict = AI.buildDict(fs.readFileSync(ROOT + '/data/mots.txt', 'utf8'));

const MODULES = {
  p4: ROOT + '/js/games/p4.js',
  morpion: ROOT + '/js/games/morpion.js',
  bataille: ROOT + '/js/games/bataille.js',
  yams: ROOT + '/js/games/yams.js',
  cochon: ROOT + '/js/games/cochon.js',
  memory: ROOT + '/js/games/memory.js',
  huit: ROOT + '/js/games/huit.js',
  poker: ROOT + '/js/games/poker.js',
  proche: ROOT + '/js/games/proche.js',
  bac: ROOT + '/js/games/bac.js',
  quiz: ROOT + '/js/games/quiz.js',
  motus: ROOT + '/js/games/motus.js',
  imposteur: ROOT + '/js/games/imposteur.js'
};

const clone = o => JSON.parse(JSON.stringify(o));
let failures = 0;
function check(n, c, e) {
  if (c) console.log('  OK  ' + n);
  else { failures++; console.log('  FAIL ' + n + (e !== undefined ? ' -> ' + JSON.stringify(e) : '')); }
}

function playGame(id, mod, cfg, run) {
  const ctx = { dict };
  let state;
  try { state = mod.create(cfg.names.slice(), ctx); } catch (e) {
    return { fail: 'create a levé : ' + e.message };
  }
  const timers = []; // minuteurs d'autorité en attente {action}
  function applyRes(res) {
    if (res && res.ok && res.timer) timers.push(res.timer);
  }
  for (let steps = 0; steps < cfg.max; steps++) {
    let stopped;
    try { stopped = cfg.stop(state, mod); } catch (e) {
      return { fail: 'stop() a levé : ' + e.message };
    }
    if (stopped) return { ok: true, steps };

    // 1) un minuteur d'autorité en attente fait avancer le jeu
    if (timers.length) {
      const t = timers.shift();
      const r = mod.apply(state, -1, t.action, ctx);
      if (r && r.ok) applyRes(r);
      continue; // un minuteur refusé (état déjà avancé) n'est pas une erreur
    }
    // 2) l'« humain » de service enchaîne les écrans (fin de manche…)
    const d = cfg.drive ? cfg.drive(state, mod) : null;
    if (d) {
      const r = mod.apply(state, d.player, d.action, ctx);
      if (!r || !r.ok) {
        return { fail: 'drive refusé (' + JSON.stringify(d.action) + ') : ' + (r && r.error) };
      }
      applyRes(r);
      continue;
    }
    // 3) chaque IA à qui c'est le moment joue UNE action
    let acted = false;
    for (let i = 0; i < state.players.length; i++) {
      let a = null;
      try { a = mod.bot(clone(state), i, ctx); } catch (e) {
        return { fail: 'bot ' + i + ' a levé : ' + e.message };
      }
      if (!a) continue;
      const r = mod.apply(state, i, a, ctx);
      if (!r || !r.ok) {
        return {
          fail: 'action du bot ' + i + ' refusée ' + JSON.stringify(a) +
            ' : ' + (r && r.error)
        };
      }
      applyRes(r);
      acted = true;
      break;
    }
    if (!acted) {
      return { fail: 'blocage à l’étape ' + steps + ' : aucune IA ne peut agir, aucun minuteur, aucun drive' };
    }
  }
  return { fail: 'budget dépassé (' + cfg.max + ' étapes sans fin de partie)' };
}

const only = process.argv[2] || null;
const runsArg = process.argv[3] ? parseInt(process.argv[3], 10) : 0;
const cfgDir = path.join(__dirname, 'botcfg');
const ids = Object.keys(MODULES).filter(id => !only || id === only);

for (const id of ids) {
  const cfgFile = path.join(cfgDir, id + '.js');
  if (!fs.existsSync(cfgFile)) {
    if (only) { console.log('  (pas de botcfg/' + id + '.js)'); }
    continue;
  }
  const mod = require(MODULES[id]);
  console.log('--- ' + mod.nom + ' ---');
  if (typeof mod.bot !== 'function') {
    check(id + ' : mod.bot présent', false);
    continue;
  }
  const cfg = require(cfgFile);
  const runs = runsArg || cfg.runs || 5;
  let okAll = true, detail = null, totalSteps = 0;
  for (let r = 0; r < runs; r++) {
    const res = playGame(id, mod, cfg, r);
    if (!res.ok) { okAll = false; detail = 'partie ' + (r + 1) + '/' + runs + ' : ' + res.fail; break; }
    totalSteps += res.steps;
  }
  check(id + ' : ' + runs + ' parties tout-IA jouées sans accroc' +
    (okAll ? ' (' + Math.round(totalSteps / runs) + ' étapes en moyenne)' : ''),
    okAll, detail);
}

/* ===== qualité de jeu : l'IA doit anticiper, varier et ne jamais gaffer
   sur un coup décisif (retours joueurs sur le Puissance 4 d'origine) ===== */
if (!only || only === 'p4') {
  console.log('--- Qualité : Puissance 4 ---');
  const p4 = require(MODULES.p4);
  const g0 = () => new Array(42).fill(null);
  const stP4 = grid => ({
    players: [{ name: 'a', wins: 0 }, { name: 'b', wins: 0 }], starter: 0,
    grid, current: 0, roundOver: false, winner: -1, line: [], draw: false
  });
  {
    // trois R empilés colonne 0 : la victoire se prend, à tous les coups
    const g = g0(); g[35] = 'R'; g[28] = 'R'; g[21] = 'R'; g[41] = 'J'; g[40] = 'J';
    let ok = true;
    for (let i = 0; i < 25; i++) { if (p4.bot(stP4(g.slice()), 0).col !== 0) { ok = false; break; } }
    check('p4 : la victoire immédiate est TOUJOURS prise', ok);
  }
  {
    // trois J au sol colonnes 0-2 : le blocage en 3 est systématique
    const g = g0(); g[35] = 'J'; g[36] = 'J'; g[37] = 'J';
    let ok = true;
    for (let i = 0; i < 25; i++) { if (p4.bot(stP4(g.slice()), 0).col !== 3) { ok = false; break; } }
    check('p4 : la menace adverse est TOUJOURS bloquée', ok);
  }
  {
    // plateau vide : les ouvertures varient, jamais sur les bords faibles
    const cols = new Set();
    for (let i = 0; i < 24; i++) cols.add(p4.bot(stP4(g0()), 0).col);
    check('p4 : ouvertures variées et sensées (2+ colonnes, jamais 0 ni 6)',
      cols.size >= 2 && [...cols].every(c => c >= 1 && c <= 5), [...cols]);
  }
  {
    // manche IA contre IA : le vainqueur étale son jeu sur plusieurs colonnes
    const s = p4.create(['a', 'b']);
    let guard = 0;
    while (!s.roundOver && guard++ < 60) p4.apply(s, s.current, p4.bot(s, s.current));
    const jt = s.winner === 1 ? 'J' : 'R';
    const cset = new Set();
    s.grid.forEach((v, i) => { if (v === jt) cset.add(i % 7); });
    check('p4 : le jeu s’étale (pas d’empilement aveugle)', s.roundOver && cset.size >= 3,
      { winner: s.winner, cols: [...cset] });
  }
}
if (!only || only === 'morpion') {
  console.log('--- Qualité : Morpion ---');
  const mor = require(MODULES.morpion);
  {
    // X en 0 et 1 : gagner en 2, sans JAMAIS d'étourderie
    let okG = true, okB = true;
    for (let i = 0; i < 60; i++) {
      const s = mor.create(['a', 'b']);
      s.grid[0] = 'X'; s.grid[1] = 'X'; s.grid[3] = 'O'; s.grid[4] = 'O'; s.current = 0;
      if (mor.bot(s, 0).i !== 2) { okG = false; break; }
    }
    for (let i = 0; i < 60; i++) {
      // O menace en 5 (3-4 pris) : X doit bloquer en 5 (aucune victoire X dispo)
      const s = mor.create(['a', 'b']);
      s.grid[3] = 'O'; s.grid[4] = 'O'; s.grid[0] = 'X'; s.grid[8] = 'X'; s.current = 0;
      if (mor.bot(s, 0).i !== 5) { okB = false; break; }
    }
    check('morpion : victoire immédiate TOUJOURS prise', okG);
    check('morpion : blocage TOUJOURS joué', okB);
  }
  {
    // plateau vierge : il n'ouvre pas toujours à la même case
    const cases = new Set();
    for (let i = 0; i < 30; i++) cases.add(mor.bot(mor.create(['a', 'b']), 0).i);
    check('morpion : ouvertures variées', cases.size >= 2, [...cases]);
  }
}
console.log(failures ? failures + ' ÉCHEC(S)' : '\nTests adversaires IA OK.');
process.exit(failures ? 1 : 0);
