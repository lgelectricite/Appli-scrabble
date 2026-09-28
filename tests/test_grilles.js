/*
 * Mots fléchés & Mots croisés V2 — le contenu et les règles, chiffres à l’appui.
 *   1. le lexique : taille, longueurs, présence au dictionnaire, définitions
 *      saines (pas de racine de la réponse, pas d’apostrophe droite…) ;
 *   2. les grilles de fléchés : 1 000 grilles par force générées et vérifiées
 *      (structure « kiosque », aucune case perdue, < 25 % de mots de 2 lettres,
 *      longueurs et difficulté qui montent avec la force, temps de calcul) ;
 *   3. les grilles de croisés : densité (≥ 70 % de cases croisées) ;
 *   4. les règles : les bugs de l’audit, les aides, le défi du jour, le chrono.
 * Lancer : node tests/test_grilles.js   (GRILLES=200 pour une version rapide)
 */
const ROOT = require('path').join(__dirname, '..');
const fs = require('fs');
require(ROOT + '/js/games/registry.js');
const GR = require(ROOT + '/js/games/fleches-data.js');
const fleches = require(ROOT + '/js/games/fleches.js');
const croises = require(ROOT + '/js/games/croises.js');

let failures = 0;
function check(n, c, e) {
  if (c) console.log('  OK  ' + n);
  else { failures++; console.log('  FAIL ' + n + (e !== undefined ? ' -> ' + JSON.stringify(e) : '')); }
}
const PAR_FORCE = +(process.env.GRILLES || 1000);

/* ================= 1. LE LEXIQUE ================= */
console.log('--- Lexique ---');
const L = GR.lexique();
const dico = new Set(fs.readFileSync(ROOT + '/data/mots.txt', 'utf8').split('\n'));
const n = L.mots.length;
const parLong = {};
L.mots.forEach(w => { parLong[w.length] = (parLong[w.length] || 0) + 1; });
const de4a8 = [4, 5, 6, 7, 8].reduce((s, k) => s + (parLong[k] || 0), 0);
console.log('    ' + n + ' mots · longueurs ' + JSON.stringify(parLong));
check('au moins 2 500 mots définis (' + n + ')', n >= 2500);
check('mots de 2 à 10 lettres', L.mots.every(w => /^[A-Z]{2,10}$/.test(w)));
check('majorité de 4 à 8 lettres (' + Math.round(100 * de4a8 / n) + ' %)', de4a8 > n / 2);
const absents = L.mots.filter(w => !dico.has(w));
check('chaque mot figure au dictionnaire', absents.length === 0, absents.slice(0, 10));
check('pas de doublon', new Set(L.mots).size === n);
check('2 à 4 définitions par mot', L.defs.every(d => d.length >= 2 && d.length <= 4));
const nDefs = L.defs.reduce((s, d) => s + d.length, 0);
console.log('    ' + nDefs + ' définitions');
check('définitions distinctes pour un même mot', L.defs.every(d => new Set(d.map(GR.norm)).size === d.length));
check('aucune apostrophe droite dans les définitions', L.defs.every(d => d.every(x => x.indexOf("'") === -1)));
check('aucun caractère dangereux (< > " |)', L.defs.every(d => d.every(x => !/[<>"|]/.test(x))));
check('définitions courtes (≤ 34 caractères)', L.defs.every(d => d.every(x => x.length <= 34)));
// heuristique de la racine : aucun mot de la définition ne commence comme la réponse (4 lettres)
const racines = [];
L.mots.forEach((w, i) => {
  L.defs[i].forEach(d => {
    GR.norm(d.replace(/[^A-Za-zÀ-ÿŒœÆæ]+/g, ' ').replace(/ /g, '|')).length; // (normalisation)
    const toks = d.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/Œ/g, 'OE').split(/[^A-Z]+/).filter(Boolean);
    toks.forEach(t => {
      if (t === w) racines.push(w + ' : ' + d);
      else if (w.length >= 4 && t.length >= 4) {
        let k = 0; while (k < w.length && k < t.length && w[k] === t[k]) k++;
        if (k >= 4 || t.includes(w)) racines.push(w + ' : ' + d);
      }
    });
  });
});
check('aucune définition ne contient la racine de sa réponse', racines.length === 0, racines.slice(0, 8));
const defsDe = w => L.defs[L.index[w]] || [];
check('bug 5 : RIA n’est plus « S’esclaffa » (c’est une vallée noyée)',
  defsDe('RIA').length > 0 && defsDe('RIA').every(d => !/esclaff/i.test(d)) && defsDe('RIA').some(d => /vallée|aber|estuaire/i.test(d)), defsDe('RIA'));
check('RIT se définit bien par « S’esclaffe » (présent de rire)', defsDe('RIT').some(d => /esclaffe$/.test(d)));
check('bug 7 : FONDUE, FORTERESSE, TEMOIGNAGE sans leur racine ; OCTAVE exacte',
  defsDe('FONDUE').every(d => !/fondu/i.test(d)) && defsDe('FORTERESSE').every(d => !/fort/i.test(d)) &&
  defsDe('TEMOIGNAGE').every(d => !/t[ée]moin/i.test(d)) && defsDe('OCTAVE').some(d => /huit degrés/.test(d)));
check('un mot très courant a plusieurs définitions (EN, ET, OR)',
  ['EN', 'ET', 'OR'].every(w => defsDe(w).length >= 3));

/* ---- mode « recalcul des raccourcis » (après un changement du lexique ou du générateur) ---- */
if (process.env.RACCOURCIS) {
  const enc = {};
  for (let f = 1; f <= 5; f++) {
    const F = GR.FORCES[f], P = GR.prepFleches(f), t = [];
    for (let g = 0; g < 1000; g++) {
      const cfg = { mode: 'fleches', W: F.W, H: F.H, pref: F.pref, K: F.K, maxSteps: F.maxSteps, pen2: F.pen2, pD: F.pD, lo: F.lo, essais: 30 };
      const r = GR.remplir(P, cfg, GR.hash('fleches|' + f + '|' + g), 0);
      if (r.pas > 4000) t.push(g.toString(36) + ':' + r.essai.toString(36));
    }
    enc[f] = t.join(',');
  }
  console.log('RACCOURCIS_TXT à recopier dans js/games/fleches-data.js :\n' + JSON.stringify(enc, null, 1));
  process.exit(0);
}

/* ================= 2. LES GRILLES DE FLÉCHÉS ================= */
console.log('--- Grilles de mots fléchés (' + PAR_FORCE + ' par force) ---');
const stats = [];
for (let f = 1; f <= 5; f++) {
  GR.grilleFleches(f, 0); // préparation (arbre des mots) hors mesure
  let bad = 0, perdues = 0, dup = 0, famDup = 0, trop = 0, n2 = 0, nw = 0, som = 0, niv = 0, tMax = 0, tSom = 0, pasMax = 0;
  const cfg = GR.FORCES[f];
  for (let g = 0; g < PAR_FORCE; g++) {
    const t0 = process.hrtime.bigint();
    const gr = GR.grilleFleches(f, g);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    tSom += ms; if (ms > tMax) tMax = ms;
    if (!gr || gr.w !== cfg.W || gr.h !== cfg.H) { bad++; continue; }
    if (gr.pas > pasMax) pasMax = gr.pas;
    const W = gr.w, NC = W * gr.h, sol = gr.sol, usage = new Array(NC).fill(0), defs = {}, vus = new Set(), mots = new Set();
    gr.mots.forEach(m => {
      nw++; som += m.w.length; niv += m.niv; if (m.w.length === 2) n2++;
      if (m.w.length > cfg.maxLen) bad++;
      m.cells.forEach((c, k) => { usage[c]++; if (sol[c] !== m.w[k]) bad++; });
      defs[m.defCell] = (defs[m.defCell] || 0) + 1;
      if (sol[m.defCell] !== '#') bad++;
      const cle = GR.norm(m.def);
      if (vus.has(cle)) dup++;
      vus.add(cle);
      if (mots.has(m.w)) famDup++;
      mots.add(m.w);
    });
    for (let c = 0; c < NC; c++) {
      if (sol[c] === '#') { if (!defs[c]) perdues++; else if (defs[c] > 2) trop++; } else if (!usage[c]) perdues++;
    }
  }
  const s = { f, taille: cfg.W + '×' + cfg.H, pasMax, pct2: +(100 * n2 / nw).toFixed(1), moyLong: +(som / nw).toFixed(2), niveau: +(niv / nw).toFixed(2), msMoy: +(tSom / PAR_FORCE).toFixed(1), msMax: +tMax.toFixed(0), motsParGrille: +(nw / PAR_FORCE).toFixed(1) };
  stats.push(s);
  console.log('    force ' + f + ' ' + JSON.stringify(s));
  check('force ' + f + ' : ' + PAR_FORCE + ' grilles jouables et cohérentes', bad === 0, bad);
  check('force ' + f + ' : aucune case inutilisée', perdues === 0, perdues);
  check('force ' + f + ' : jamais deux fois la même définition ni le même mot dans une grille', dup === 0 && famDup === 0, { dup, famDup });
  check('force ' + f + ' : 1 ou 2 définitions par case', trop === 0, trop);
  check('force ' + f + ' : moins de 25 % de mots de 2 lettres (' + s.pct2 + ' %)', s.pct2 < 25);
  // le travail est compté en « pas » (déterministe) : ≤ 4 000 pas ≈ 20 ms ici, < 300 ms au processeur ×4
  check('force ' + f + ' : calcul borné (≤ 4 000 pas par grille, max ' + pasMax + ' ; ' + s.msMoy + ' ms en moyenne)', pasMax <= 4000 && s.msMoy < 75,
    'si le lexique a changé : RACCOURCIS=1 node tests/test_grilles.js');
}
check('les mots s’allongent avec la force (' + stats.map(s => s.moyLong).join(' → ') + ')',
  stats.every((s, i) => i === 0 || s.moyLong > stats[i - 1].moyLong));
check('les définitions se corsent avec la force (niveau moyen 0 = facile … 2 = difficile : ' + stats.map(s => s.niveau).join(' → ') + ')',
  stats.every((s, i) => i === 0 || s.niveau > stats[i - 1].niveau) && stats[0].niveau < 0.35 && stats[4].niveau > 1.5);
check('les grilles grandissent avec la force', stats.every((s, i) => i === 0 || s.motsParGrille > stats[i - 1].motsParGrille));
// même numéro → même grille ; défi du jour identique pour tous, différent chaque jour
check('grille déterministe (même graine, même grille)', GR.grilleFleches(4, 123).sol === GR.grilleFleches(4, 123).sol);
const j1 = GR.grilleFleches(fleches._FORCE_DU_JOUR[GR.jourSemaine('2026-09-28')], -1, '2026-09-28');
const j1b = GR.grilleFleches(fleches._FORCE_DU_JOUR[GR.jourSemaine('2026-09-28')], -1, '2026-09-28');
const j2 = GR.grilleFleches(fleches._FORCE_DU_JOUR[GR.jourSemaine('2026-09-29')], -1, '2026-09-29');
check('défi du jour : même grille pour tous, une autre le lendemain', j1.sol === j1b.sol && j1.sol !== j2.sol);
check('défi du jour : force 1 le lundi, force 5 le samedi',
  fleches._FORCE_DU_JOUR[GR.jourSemaine('2026-09-28')] === 1 && fleches._FORCE_DU_JOUR[GR.jourSemaine('2026-10-03')] === 5);

/* ================= 3. LES GRILLES DE CROISÉS ================= */
console.log('--- Grilles de mots croisés ---');
for (const lvl of ['facile', 'moyen', 'difficile']) {
  let bad = 0, minC = 1, noirs = 0, tot = 0, tMax = 0, tSom = 0, dup = 0;
  const NB = Math.min(PAR_FORCE, 300);
  for (let g = 0; g < NB; g++) {
    const t0 = Date.now();
    const gr = GR.grilleCroises(lvl, g);
    const ms = Date.now() - t0; tSom += ms; if (ms > tMax) tMax = ms;
    if (!gr) { bad++; continue; }
    const N = gr.w, sol = gr.sol;
    let blanc = 0, cr = 0;
    for (let i = 0; i < N * N; i++) {
      tot++;
      if (sol[i] === '#') {
        noirs++;
        if (i % N > 0 && sol[i - 1] === '#') bad++; // jamais deux noires côte à côte
        continue;
      }
      blanc++;
      const r = Math.floor(i / N), c = i % N;
      const h = (c > 0 && sol[i - 1] !== '#') || (c < N - 1 && sol[i + 1] !== '#');
      const v = (r > 0 && sol[i - N] !== '#') || (r < N - 1 && sol[i + N] !== '#');
      if (h && v) cr++;
      if (!h && !v) bad++; // lettre isolée
    }
    minC = Math.min(minC, cr / blanc);
    const vus = new Set(gr.mots.map(m => GR.norm(m.def)));
    if (vus.size !== gr.mots.length) dup++;
  }
  console.log('    ' + lvl + ' : ' + JSON.stringify({ grilles: NB, croiseesMin: Math.round(minC * 100) + ' %', noires: Math.round(100 * noirs / tot) + ' %', msMoy: +(tSom / NB).toFixed(1), msMax: tMax }));
  check(lvl + ' : grilles denses (≥ 70 % de cases croisées partout)', bad === 0 && minC >= 0.7, { bad, minC });
  check(lvl + ' : pas de définition répétée dans une grille', dup === 0, dup);
}

/* ================= 4. LES RÈGLES ================= */
console.log('--- Règles de saisie (bugs de l’audit) ---');
/* trouve deux mots qui se croisent : A horizontal, B vertical, croisement = dernière case de B */
function partie(f, g) {
  const s = fleches.create(['Moi']);
  fleches.apply(s, 0, { t: 'force', f, g });
  return s;
}
function croisement(s, derniere) {
  for (let b = 0; b < s.words.length; b++) {
    const B = s.words[b];
    if (B.dir !== 'v' || B.cells.length < 3) continue;
    const x = derniere ? B.cells[B.cells.length - 1] : B.cells[0];
    for (let a = 0; a < s.words.length; a++) {
      const A = s.words[a];
      if (A.dir === 'h' && A.cells.indexOf(x) !== -1) return { a, b, x };
    }
  }
  return null;
}
function tape(s, w, lettres, sauf) {
  const W = s.words[w];
  let res = null;
  W.cells.forEach((c, k) => {
    if (c === sauf) return;
    const r = fleches.apply(s, 0, { t: 'l', i: c, l: lettres[k], w });
    if (!res || r.timer) res = r; // on garde la réponse qui porte le minuteur de fin
  });
  return res;
}
{
  // bug 1a : un mot complété PAR UN CROISEMENT n’est ni validé à tort ni compté comme erreur
  let s = partie(3, 5), cx = croisement(s, true);
  const B = s.words[cx.b], A = s.words[cx.a];
  const fauxB = B.w.split('').map(ch => ch === 'Z' ? 'Y' : 'Z').join('');
  tape(s, cx.b, fauxB, cx.x);                  // B presque rempli (faux), sa dernière case vide
  check('bug 1 : un mot incomplet n’est jamais jugé', s.players[0].errors === 0 && !B.ok);
  tape(s, cx.a, A.w, -1);                      // A juste : il remplit la dernière case de B
  check('bug 1 : le mot croisé complété par un autre n’est pas compté comme erreur',
    s.players[0].errors === 0 && !B.ok && A.ok, { err: s.players[0].errors, B: B.ok, A: A.ok });
  check('bug 1 : ses lettres restent en place (on ne l’a pas encore fini)',
    B.cells.every(c => s.saisie[c]));
  // bug 1b : taper la 1re lettre d’un mot dont les autres cases sont déjà remplies ne le valide pas
  s = partie(2, 11);
  const c2 = croisement(s, false);
  const B2 = s.words[c2.b];
  const faux2 = B2.w.split('').map(ch => ch === 'Z' ? 'Y' : 'Z').join('');
  // on remplit B2 sauf sa 1re case via des frappes « hors mot » (active = autre mot)
  B2.cells.slice(1).forEach((c, k) => fleches.apply(s, 0, { t: 'l', i: c, l: faux2[k + 1], w: c2.a }));
  fleches.apply(s, 0, { t: 'l', i: B2.cells[0], l: faux2[0], w: c2.b }); // 1re lettre du mot actif
  check('bug 1 : mot actif complété dès la 1re lettre → pas validé avant d’être fini',
    s.players[0].errors === 0 && !B2.ok, s.players[0].errors);
  // … mais une fois la fin du mot atteinte (dernière case retapée) il est jugé
  tape(s, c2.b, faux2, -1);
  check('bug 1 : arrivé au bout du mot, il est jugé (erreur comptée une fois)', s.players[0].errors === 1 && s.ev.k === 'ko');
  // bug 1c : les lettres fausses d’un mot refusé sont effacées, y compris dans les cases partagées
  check('bug 1 : les lettres fausses du mot refusé sont effacées', B2.cells.every(c => s.saisie[c] === ''), B2.cells.map(c => s.saisie[c]));
  s = partie(3, 9);
  const c3 = croisement(s, false), B3 = s.words[c3.b];
  const mix = B3.w.split('').map((ch, k) => k % 2 ? (ch === 'Z' ? 'Y' : 'Z') : ch).join('');
  tape(s, c3.b, mix, -1);
  check('bug 1 : seules les lettres fausses s’effacent, les justes restent',
    B3.cells.every((c, k) => s.saisie[c] === (k % 2 ? '' : B3.w[k])) && s.ev.bad.length === Math.floor(B3.w.length / 2),
    B3.cells.map(c => s.saisie[c]).join('.'));
  // un mot juste se valide et rapporte sa longueur
  const avant = s.players[0].points;
  tape(s, c3.b, B3.w, -1);
  check('mot juste validé : +longueur, évènement « ok »', B3.ok && s.ev.k === 'ok' && s.players[0].points === avant + B3.w.length);
  check('les cases d’un mot trouvé sont verrouillées', fleches.apply(s, 0, { t: 'l', i: B3.cells[0], l: 'Q', w: c3.b }).ok && s.saisie[B3.cells[0]] === B3.w[0]);
}
{
  console.log('--- Aides, score, chrono, fin ---');
  const s = partie(1, 3), p = s.players[0];
  const w0 = s.words[0];
  fleches.apply(s, 0, { t: 'aide', k: 'lettre', i: w0.cells[0] });
  check('révéler une lettre : bonne lettre, marquée, −3 (plancher 0), aide comptée',
    s.saisie[w0.cells[0]] === w0.w[0] && s.aide[w0.cells[0]] === 1 && p.aides === 1 && p.points === 0);
  tape(s, 1, s.words[1].w, -1);
  const pts = p.points;
  const w2 = s.words.find(w => !w.ok && w.cells.length >= 3);
  fleches.apply(s, 0, { t: 'l', i: w2.cells[0], l: w2.w[0] === 'Z' ? 'Y' : 'Z', w: s.words.indexOf(w2) });
  fleches.apply(s, 0, { t: 'aide', k: 'mot', w: s.words.indexOf(w2) });
  check('vérifier le mot : lettre fausse effacée, −1', s.saisie[w2.cells[0]] === '' && p.points === pts - 1 && s.ev.k === 'verif' && s.ev.bad.length === 1);
  fleches.apply(s, 0, { t: 'aide', k: 'grille' });
  check('vérifier la grille : −5 (plancher 0)', p.points === Math.max(0, pts - 6) && p.aides === 3);
  check('étoiles : 3 sans faute, 2 jusqu’à 3 fautes, 1 au-delà',
    GR.etoiles({ errors: 0, aides: 0 }) === 3 && GR.etoiles({ errors: 1, aides: 2 }) === 2 && GR.etoiles({ errors: 2, aides: 2 }) === 1);
  // chrono « actif » : une longue absence ne compte qu’une minute
  s.t.dernier -= 3600 * 1000;
  const t0 = s.t.cumul;
  fleches.apply(s, 0, { t: 'x', i: w2.cells[1] });
  check('chrono : une absence d’une heure compte 1 min au plus', s.t.cumul - t0 <= 60000 && s.t.cumul - t0 >= 59000);
  // on finit la grille : célébration (minuteur) puis fin, gagnants
  let res = null;
  s.words.forEach((w, i) => { if (!w.ok) { const r = tape(s, i, w.w, -1); if (r && r.timer) res = r; } });
  check('grille complète → minuteur de célébration, pas encore « finie »', s.complete && !s.finished && res && res.timer.ms >= 1000);
  check('bug 4 : la grille complète garde toutes ses lettres', s.words.every(w => w.cells.every((c, k) => s.saisie[c] === w.w[k])));
  check('plus aucune saisie après la dernière lettre', !fleches.apply(s, 0, { t: 'l', i: w0.cells[0], l: 'A', w: 0 }).ok);
  fleches.apply(s, -1, res.timer.action);
  check('fin après la célébration ; gagnants = [0]', s.finished && fleches.over(s) && JSON.stringify(fleches.gagnants(s)) === '[0]');
  const red = fleches.redact(s, 0);
  check('grille finie : tout est visible (solutions trouvées)', red.words.every(w => w.w && w.ok));
}
{
  // une partie de l’ancienne version ne casse rien
  const vieux = { players: [{ name: 'A', found: 0, points: 0, errors: 0 }], phase: 'play', force: 1, gnum: 0, w: 7, h: 8, words: [], startTs: 1, durationSec: 0, finished: false };
  check('ancienne partie : refusée proprement, puis « nouvelle » repart à zéro',
    !fleches.apply(vieux, 0, { t: 'claim', i: 0, text: 'X' }).ok && fleches.apply(vieux, 0, { t: 'nouvelle' }).ok &&
    vieux.v === 2 && vieux.phase === 'setup');
  const vc = { players: [{ name: 'A', found: 0, points: 0, errors: 0 }], phase: 'play', level: 'facile', size: 9, words: [], startTs: 1 };
  check('croisés : idem', croises.apply(vc, 0, { t: 'nouvelle' }).ok && vc.v === 2);
  // actions invalides
  const s = partie(1, 0);
  check('lettre invalide refusée', !fleches.apply(s, 0, { t: 'l', i: 0, l: '<', w: 0 }).ok);
  check('case-définition refusée', !fleches.apply(s, 0, { t: 'l', i: 0, l: 'A', w: 0 }).ok);
  check('force inconnue refusée', !fleches.apply(fleches.create(['A']), 0, { t: 'force', f: 9 }).ok);
  check('date du défi invalide refusée', !fleches.apply(fleches.create(['A']), 0, { t: 'jour', d: '<script>' }).ok);
}

console.log(failures ? '\n' + failures + ' ÉCHEC(S)' : '\nTests grilles (contenu et règles) OK.');
process.exit(failures ? 1 : 0);
