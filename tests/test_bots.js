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
  bonbons: ROOT + '/js/games/bonbons.js',
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

console.log(failures ? failures + ' ÉCHEC(S)' : '\nTests adversaires IA OK.');
process.exit(failures ? 1 : 0);
