/*
 * Words V2 — l'IA et le dictionnaire, mesures à l'appui.
 *   - dictionnaire : format, retraits (sigles), ajouts (ODS 2-3 lettres, mots récents) ;
 *   - générateur : coups légaux, points exacts, mots jusqu'à 15 lettres ;
 *   - liste noire : l'IA ne joue jamais d'injure ni de mot vulgaire ;
 *   - niveaux : vocabulaire courant en bas, écart de force mesuré (IA contre IA) ;
 *   - jokers ménagés, échanges stratégiques, temps de calcul.
 * `node tests/test_mots_ia.js [parties]` (défaut : 6 parties par mesure).
 */
const ROOT = require('path').join(__dirname, '..');
const fs = require('fs');
const S = require(ROOT + '/js/scrabble.js');
const AI = require(ROOT + '/js/ai.js');

let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log('  OK  ' + name);
  else { failures++; console.log('  FAIL ' + name + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); }
}
const idx = (r, c) => r * 15 + c;
const N = +process.argv[2] || 6;

console.log('--- Dictionnaire ---');
const texte = fs.readFileSync(ROOT + '/data/mots.txt', 'utf8');
const lignes = texte.split('\n');
check('format : un mot par ligne, majuscules sans accents',
  lignes.slice(0, -1).every(w => /^[A-Z]{2,15}$/.test(w)) && lignes[lignes.length - 1] === '');
check('trié et sans doublon', lignes.slice(0, -1).every((w, i, a) => i === 0 || a[i - 1] < w));
let t0 = Date.now();
const dict = AI.buildDict(texte);
const tSet = Date.now() - t0;
t0 = Date.now();
AI.prepare(dict);
const tTrie = Date.now() - t0;
AI.chargeCourants(dict, fs.readFileSync(ROOT + '/data/mots-courants.txt', 'utf8'));
console.log('  ' + dict.set.size + ' mots ; Set ' + tSet + ' ms, arbre ' + tTrie + ' ms (' +
  dict.trie.noeuds + ' nœuds) ; ' + dict.niveau.size + ' mots courants');
const absents = 'CC CF CG CH CL CM DG DL DM KG KM MG MS PH DEP DIV EME ETC FIG LAT MEN REF'.split(' ');
check('sigles et abréviations retirés', absents.every(w => !dict.set.has(w)), absents.filter(w => dict.set.has(w)));
const deux = 'AA AY BA BE BI DA KA OM QI TO UD VE VS WU'.split(' ');
check('mots de 2 lettres de l’ODS ajoutés', deux.every(w => dict.set.has(w)), deux.filter(w => !dict.set.has(w)));
check('81 mots de 2 lettres (liste officielle de l’ODS)', lignes.filter(w => w.length === 2).length === 81);
const trois = 'PET RAP FUN FAN BIO BUG DOC FAC MIX SPA TAG WEB WOK ZIP APP ADO GEO LOL PSY'.split(' ');
check('mots de 3 lettres courants ajoutés', trois.every(w => dict.set.has(w)), trois.filter(w => !dict.set.has(w)));
check('… avec leurs pluriels', 'PETS RAPS FANS BUGS DOCS FACS WEBS WOKS ZIPS APPS ADOS'.split(' ').every(w => dict.set.has(w)));
const recents = ('BLOG BLOGS SELFIE SELFIES SMARTPHONE SMARTPHONES TEXTO TEXTOS WEEKEND WEEKENDS EMOJI EMOJIS ' +
  'WIFI PODCAST PODCASTS KEBAB KEBABS BURGER BURGERS TELECHARGER TELECHARGEA CLIQUE ZAPPER INTERNAUTE ' +
  'COURRIEL PIXELS ORDI INFOS RESTO APERO VEGANE').split(' ');
check('mots récents et leurs pluriels ou conjugaisons', recents.every(w => dict.set.has(w)), recents.filter(w => !dict.set.has(w)));
check('verbes pronominaux complétés (ENVOLA, ECROULAIT, ENFUIT, ABSTIENT)',
  ['ENVOLA', 'ECROULAIT', 'ENFUIT', 'ABSTIENT', 'EXCLAMA'].every(w => dict.set.has(w)));
check('mots courants : pas de passé simple rare ni d’interjection obscure',
  !dict.niveau.has('SURFA') && !dict.niveau.has('BLAMAI') && !dict.niveau.has('OLE') && dict.niveau.get('MAISON') === 1);
check('valeurs des lettres de l’IA = règles du moteur',
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').every((l, i) => AI.VALEUR[i] === S.letterValue(l) &&
    AI.NOMBRE[i] === S.DISTRIBUTION[l][0]));

console.log('--- Liste noire ---');
['YOUPIN', 'BICOT', 'GOUINE', 'NEGRE', 'SALOPE', 'CONNARD', 'MERDE', 'ENCULE', 'PUTE', 'ZOB', 'CUL', 'FION', 'TRAVELO']
  .forEach(w => check('interdit à l’IA : ' + w, AI.estInterdit(w)));
['PEDALE', 'CHIEN', 'PISSENLIT', 'CONSEIL', 'CULTURE', 'BITUME', 'PUTOIS', 'CONTE', 'NEGRIER', 'MERLE']
  .forEach(w => check('autorisé : ' + w, !AI.estInterdit(w)));
check('un humain peut poser un mot de la liste noire s’il est au dictionnaire', dict.set.has('ZOB') && dict.set.has('CONNE'));

console.log('--- Générateur de coups ---');
{
  const g = S.newGame(['A', 'B'], P0());
  g.players[0].rack = ['C', 'H', 'A', 'T', 'E', 'E', 'E'];
  S.playMove(g, 0, [{ index: idx(7, 6), letter: 'C' }, { index: idx(7, 7), letter: 'H' },
    { index: idx(7, 8), letter: 'A' }, { index: idx(7, 9), letter: 'T' }]);
  g.players[1].rack = ['R', 'E', 'S', 'T', 'A', 'U', 'L'];
  const coups = AI.findAllMoves(S, g, 1, dict);
  let ok = true, bonsPoints = true;
  coups.forEach(m => {
    const r = S.checkMove(g, m.placements);
    if (!r.ok || !r.words.every(w => dict.set.has(w.word))) ok = false;
    if (r.ok && r.total !== m.total) bonsPoints = false;
  });
  check(coups.length + ' coups après CHAT, tous légaux', coups.length > 500 && ok);
  check('points calculés = points du moteur', bonsPoints);
  // un mot de plus de 8 lettres (l'ancienne IA s'arrêtait à 8)
  const g2 = S.newGame(['A', 'B'], P0());
  g2.players[0].rack = ['M', 'A', 'I', 'S', 'O', 'N', 'E'];
  S.playMove(g2, 0, 'MAISON'.split('').map((l, k) => ({ index: idx(7, 4 + k), letter: l })));
  g2.players[1].rack = ['N', 'E', 'T', 'T', 'E', 'S', 'A'];
  const longs = AI.findAllMoves(S, g2, 1, dict).filter(m => m.principal.length >= 9);
  check('mots de 9 lettres et plus trouvés (' + longs.length + ', ex. ' + (longs[0] && longs[0].principal) + ')',
    longs.length > 0);
}

console.log('--- Jokers et échanges ---');
{
  // l'IA ne gaspille pas un joker pour un point de plus
  let gaspi = 0, essais = 0;
  for (let n = 0; n < 12; n++) {
    const g = S.newGame(['A', 'B'], P0());
    g.players[0].rack = ['?', 'L', 'A', 'M', 'E', 'O', 'U'];
    const tous = AI.findAllMoves(S, g, 0, dict);
    const sansJ = Math.max(...tous.filter(m => !m.placements.some(p => p.blank)).map(m => m.total));
    const a = AI.chooseAction(S, g, 0, dict, 'expert');
    if (a.kind !== 'move') continue;
    essais++;
    if (a.placements.some(p => p.blank) && a.total < sansJ + 10) gaspi++;
  }
  check('expert : ne pose pas son joker pour moins de 10 points de mieux (' + gaspi + '/' + essais + ')', gaspi === 0);
  // tirage affreux : l'IA forte échange, l'IA facile non
  const g = S.newGame(['A', 'B'], P0());
  g.players[0].rack = ['L', 'E', 'E', 'E', 'E', 'E', 'E'];
  S.playMove(g, 0, [{ index: idx(7, 7), letter: 'L' }, { index: idx(7, 8), letter: 'E' }]);
  g.players[1].rack = ['V', 'V', 'W', 'K', 'J', 'Q', 'Y'];
  const ex = AI.chooseAction(S, g, 1, dict, 'expert');
  check('expert : échange un tirage impossible (VVWKJQY) → ' + ex.kind + (ex.letters ? ' ' + ex.letters.join('') : ''),
    ex.kind === 'exchange' && ex.letters.length >= 5);
  const fa = AI.chooseAction(S, g, 1, dict, 'facile');
  check('facile : n’échange pas par stratégie (' + fa.kind + ')', fa.kind !== 'exchange' ||
    AI.findAllMoves(S, g, 1, dict).length === 0);
  // sac < 7 : jamais d'échange
  g.bag = g.bag.slice(0, 6);
  check('sac à moins de 7 lettres : jamais d’échange', AI.chooseAction(S, g, 1, dict, 'expert').kind !== 'exchange');
}

console.log('--- Niveaux : parties IA contre IA (' + N + ' par mesure) ---');
function partie(nA, nB) {
  const g = S.newGame([nA, nB]);
  const niv = [nA, nB];
  const st = [0, 1].map(() => ({ pts: 0, coups: 0, ms: 0, dec: 0, pireMs: 0, bingos: 0, ech: 0,
    motsRares: 0, mots: 0, interdits: 0, jokerPts: [] }));
  let tours = 0;
  while (!g.over && tours++ < 200) {
    const pi = g.current;
    const t = Date.now();
    const a = AI.chooseAction(S, g, pi, dict, niv[pi]);
    const dt = Date.now() - t;
    st[pi].ms += dt; st[pi].dec++; st[pi].pireMs = Math.max(st[pi].pireMs, dt);
    if (a.kind === 'move') {
      const r = S.playMove(g, pi, a.placements);
      if (!r.ok) throw new Error('coup illégal : ' + JSON.stringify(r));
      st[pi].pts += r.total; st[pi].coups++;
      if (r.bingo) st[pi].bingos++;
      if (a.placements.some(p => p.blank)) st[pi].jokerPts.push(r.total);
      r.words.forEach(w => {
        st[pi].mots++;
        if (AI.estInterdit(w.word)) st[pi].interdits++;
        if (!dict.niveau.has(w.word)) st[pi].motsRares++;
      });
    } else if (a.kind === 'exchange') { S.exchange(g, pi, a.letters); st[pi].ech++; }
    else S.passTurn(g, pi);
  }
  return { scores: g.players.map(p => p.score), st };
}
function serie(nA, nB) {
  const r = { sA: 0, sB: 0, vA: 0, vB: 0, st: [{}, {}], jokers: [] };
  for (let n = 0; n < N; n++) {
    const p = partie(nA, nB);
    r.sA += p.scores[0]; r.sB += p.scores[1];
    if (p.scores[0] > p.scores[1]) r.vA++; else if (p.scores[1] > p.scores[0]) r.vB++;
    p.st.forEach((s, i) => Object.keys(s).forEach(k => {
      if (k === 'jokerPts') { r.st[i][k] = (r.st[i][k] || []).concat(s[k]); return; }
      r.st[i][k] = k === 'pireMs' ? Math.max(r.st[i][k] || 0, s[k]) : (r.st[i][k] || 0) + s[k];
    }));
  }
  r.sA /= N; r.sB /= N;
  return r;
}
const mesures = {};
['facile', 'moyen', 'difficile', 'expert'].forEach(niv => {
  const r = serie(niv, niv);
  const s = r.st[0], s2 = r.st[1];
  const pc = (s.pts + s2.pts) / (s.coups + s2.coups);
  mesures[niv] = { score: (r.sA + r.sB) / 2, pc, ms: (s.ms + s2.ms) / (s.dec + s2.dec),
    pire: Math.max(s.pireMs, s2.pireMs), rares: (s.motsRares + s2.motsRares) / (s.mots + s2.mots),
    interdits: s.interdits + s2.interdits, bingos: (s.bingos + s2.bingos) / (2 * N),
    jokers: (s.jokerPts || []).concat(s2.jokerPts || []) };
  const m = mesures[niv];
  console.log(`  ${niv.padEnd(9)} : ${m.score.toFixed(0)} pts/partie, ${m.pc.toFixed(1)} pts/coup, ` +
    `${m.bingos.toFixed(2)} scrabble/partie, ${m.ms.toFixed(1)} ms/décision (pire ${m.pire} ms), ` +
    `mots hors vocabulaire courant ${(m.rares * 100).toFixed(1)} %`);
});
check('niveaux nettement croissants : facile < moyen < difficile < expert (pts/coup)',
  mesures.facile.pc + 3 < mesures.moyen.pc && mesures.moyen.pc + 5 < mesures.difficile.pc &&
  mesures.difficile.pc + 5 < mesures.expert.pc,
  Object.keys(mesures).map(k => k + ' ' + mesures[k].pc.toFixed(1)));
check('facile : un joueur débutant peut suivre (< 11 pts/coup)', mesures.facile.pc < 11, mesures.facile.pc);
check('moyen : battable par un joueur moyen (< 18 pts/coup, pas de scrabble)',
  mesures.moyen.pc < 18 && mesures.moyen.bingos < 0.3, [mesures.moyen.pc, mesures.moyen.bingos]);
check('difficile : fait transpirer (20 à 30 pts/coup)', mesures.difficile.pc > 20 && mesures.difficile.pc < 30,
  mesures.difficile.pc);
check('expert : niveau club (> 32 pts/coup, des scrabbles)', mesures.expert.pc > 32 && mesures.expert.bingos >= 1,
  [mesures.expert.pc, mesures.expert.bingos]);
check('facile et moyen ne jouent que des mots courants',
  mesures.facile.rares === 0 && mesures.moyen.rares === 0, [mesures.facile.rares, mesures.moyen.rares]);
check('aucun mot interdit joué, à aucun niveau',
  Object.keys(mesures).every(k => mesures[k].interdits === 0));
const jok = mesures.expert.jokers;
const jokMoy = jok.length ? jok.reduce((a, b) => a + b, 0) / jok.length : 0;
check('expert : ses jokers rapportent gros (' + jokMoy.toFixed(0) + ' pts en moyenne sur ' + jok.length + ' coups)',
  !jok.length || jokMoy >= 35, jok);
check('calcul rapide : < 60 ms par décision en moyenne (sur ce processeur)',
  Object.keys(mesures).every(k => mesures[k].ms < 60), Object.keys(mesures).map(k => mesures[k].ms.toFixed(1)));
{
  const r = serie('difficile', 'moyen');
  console.log(`  difficile contre moyen : ${r.vA}-${r.vB} (${r.sA.toFixed(0)} à ${r.sB.toFixed(0)})`);
  check('difficile bat moyen la plupart du temps', r.vA >= Math.ceil(N * 0.66), [r.vA, r.vB]);
  const r2 = serie('moyen', 'facile');
  console.log(`  moyen contre facile : ${r2.vA}-${r2.vB} (${r2.sA.toFixed(0)} à ${r2.sB.toFixed(0)})`);
  check('moyen bat facile la plupart du temps', r2.vA >= Math.ceil(N * 0.66), [r2.vA, r2.vB]);
}

function P0() { return { premier: 0 }; }
console.log(failures ? `\n${failures} ÉCHEC(S)` : '\nIA et dictionnaire V2 : tout passe.');
process.exit(failures ? 1 : 0);
