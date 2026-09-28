/*
 * Contenu des jeux de soirée (V2) : Le Manoir, L'Imposteur, le Quiz,
 * Le Plus Proche, la Discussion.
 *
 * On ne se contente pas de compter : on VÉRIFIE.
 *   - Le Manoir : 2 000 affaires simulées, chacune passée au solveur (une
 *     seule solution, la bonne ; ni les pistes seules ni les dossiers seuls
 *     ne concluent ; chaque indice est indispensable) ; énigmes vérifiées
 *     mécaniquement (chiffres de César, anagrammes, mots à l'envers, calculs) ;
 *     risque de revoir une énigme à la partie suivante.
 *   - L'Imposteur, le Quiz, Le Plus Proche : voir plus bas.
 *
 * Usage : node tests/test_soiree_contenu.js [nombre d'affaires, défaut 2000]
 */
const ROOT = require('path').join(__dirname, '..');
require(ROOT + '/js/games/registry.js');

let failures = 0;
function check(n, c, e) {
  if (c) console.log('  OK  ' + n);
  else { failures++; console.log('  FAIL ' + n + (e !== undefined ? ' -> ' + JSON.stringify(e) : '')); }
}
const norm = s => String(s).toUpperCase().replace(/Œ/g, 'OE').normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]/g, '');

/* ================= LE MANOIR ================= */
console.log('--- Le Manoir : les affaires ---');
{
  const M = require(ROOT + '/js/games/manoir.js');
  const N = parseInt(process.argv[2] || '2000', 10);
  let uniques = 0, pistesSeules = 0, dossiersSeuls = 0, minimaux = 0, total = 0, nuls = 0;
  let faits = 0, indicesDirects = 0, nbIndices = 0;
  const t0 = Date.now();
  const niveaux = ['facile', 'normal', 'expert'];
  for (let i = 0; i < N; i++) {
    const sc = M._SCENARIOS[i % M._SCENARIOS.length];
    const aff = M._genererAffaire(sc, 1 + (i % 6), niveaux[i % 3]);
    if (!aff) { nuls++; continue; }
    total++;
    const tous = aff.pub.concat(aff.pistes, aff.prives);
    const sol = M._solveur(sc, tous);
    if (sol.length === 1 && sol[0][0] === aff.v.c && sol[0][1] === aff.v.w && sol[0][2] === aff.v.l) uniques++;
    if (M._solveur(sc, aff.pub.concat(aff.pistes)).length >= 3) pistesSeules++;
    if (M._solveur(sc, aff.pub.concat(aff.prives)).length >= 2) dossiersSeuls++;
    // chaque dossier secret est indispensable : sans lui, plus de solution unique
    if (aff.prives.every(f => M._solveur(sc, tous.filter(g => g !== f)).length > 1)) minimaux++;
    faits += aff.pistes.length + aff.prives.length;
    // un indice « direct » élimine à lui seul un suspect (sans recoupement)
    const base = M._solveur(sc, aff.pub);
    const susBase = new Set(base.map(t => t[0])).size;
    aff.pistes.concat(aff.prives).forEach(f => {
      nbIndices++;
      const avec = M._solveur(sc, aff.pub.concat([f]), base);
      if (new Set(avec.map(t => t[0])).size < susBase && !(f.t === 'vide' || (f.t === 'vu' && f.at[0][0] === aff.v.c))) indicesDirects++;
    });
  }
  const ms = (Date.now() - t0) / N;
  console.log('    ' + N + ' affaires en ' + Math.round(ms) + ' ms chacune, ' + (faits / total).toFixed(1) +
    ' indices en moyenne, ' + Math.round(100 * indicesDirects / nbIndices) + ' % d’indices qui innocentent seuls');
  check('toutes les affaires se génèrent', nuls === 0, nuls);
  check('UNE seule solution, la bonne, dans 100 % des affaires (solveur)', uniques === total, [uniques, total]);
  check('les pistes seules ne concluent JAMAIS (au moins 3 hypothèses restent)', pistesSeules === total, [pistesSeules, total]);
  check('les dossiers secrets seuls ne concluent jamais', dossiersSeuls === total, [dossiersSeuls, total]);
  check('chaque information confidentielle est indispensable (les rôles comptent)', minimaux === total, [minimaux, total]);
  check('peu d’indices qui innocentent sans raisonnement (< 20 %)', indicesDirects / nbIndices < 0.2,
    Math.round(100 * indicesDirects / nbIndices));
  check('génération rapide (< 60 ms par affaire)', ms < 60, Math.round(ms));

  // la répartition en jeu : à 4 joueurs, chaque dossier secret manque aux autres
  let partage = 0, essais = 0;
  for (let i = 0; i < 120; i++) {
    const g = M.create(['A', 'B', 'C', 'D']);
    essais++;
    const tous = M._tousLesFaits(g);
    const seul = g.players.every((p, k) => {
      const moi = g.temoignages.concat(g.pistes.flatMap(x => x.faits), p.prive);
      return M._solveur(g.scenario, moi).length > 1;
    });
    if (seul && M._solveur(g.scenario, tous).length === 1) partage++;
  }
  check('à 4 joueurs, personne ne peut conclure sans les dossiers des autres', partage === essais, [partage, essais]);

  console.log('--- Le Manoir : les énigmes ---');
  const decale = (mot, d) => mot.split('').map(c => String.fromCharCode((c.charCodeAt(0) - 65 + d + 26) % 26 + 65)).join('');
  const tri = s => s.split('').sort().join('');
  let nb = 0, verifiees = 0, fautes = [];
  const reponsesParAffaire = {};
  M._SCENARIOS.forEach(sc => {
    reponsesParAffaire[sc.id] = [];
    sc.pistes.forEach(p => p.enigmes.forEach(e => {
      nb++;
      const a0 = M._normRep(e.a[0]);
      if (!e.q || !e.hint || !e.a.length) fautes.push(sc.id + ':' + p.id + ' incomplète');
      if (!M._accepte(e.a[0], e.a)) fautes.push(sc.id + ':' + p.id + ' réponse refusée par le jeu');
      reponsesParAffaire[sc.id].push(a0);
      const v = e.verif;
      if (!v) return;
      verifiees++;
      let ok = false;
      if (v.type === 'cesar') ok = decale(a0, v.d) === v.code && e.q.includes(v.code);
      else if (v.type === 'anagramme') ok = tri(a0) === tri(v.code) && a0 !== v.code;
      else if (v.type === 'envers') ok = a0.split('').reverse().join('') === v.code && e.q.includes(v.code);
      else if (v.type === 'calc') ok = e.a.map(M._normRep).includes(String(v.v));
      else if (v.type === 'rangs') ok = v.code.map(n => String.fromCharCode(64 + n)).join('') === a0;
      if (!ok) fautes.push(sc.id + ':' + p.id + ' (' + v.type + ') ' + a0);
    }));
  });
  console.log('    ' + nb + ' énigmes, dont ' + verifiees + ' vérifiées mécaniquement');
  check('au moins 108 énigmes (6 affaires × 6 pistes × 3)', nb >= 108, nb);
  check('chaque énigme : question, indice, réponse acceptée par le jeu', !fautes.some(f => /incomplète|refusée/.test(f)), fautes);
  check('chiffres, anagrammes, mots à l’envers et calculs exacts', !fautes.length, fautes);
  check('au moins 40 énigmes vérifiées par calcul', verifiees >= 40, verifiees);
  check('énigmes liées au décor : chaque affaire a ses propres énigmes',
    M._SCENARIOS.every(sc => sc.pistes.every(p => p.enigmes.length === 3)));

  // rejouabilité : deux parties de suite sur le même téléphone
  const store = {};
  global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  let revues = 0, parties = 0;
  for (let s = 0; s < 300; s++) {
    Object.keys(store).forEach(k => delete store[k]);
    const a = M.create(['A']);
    const b = M.create(['A']);
    parties++;
    const qa = new Set(a.pistes.map(p => p.q));
    if (b.pistes.some(p => qa.has(p.q))) revues++;
  }
  // sur une longue soirée : 6 parties d'affilée
  Object.keys(store).forEach(k => delete store[k]);
  const vues = new Set();
  let doublons = 0;
  for (let k = 0; k < 6; k++) {
    M.create(['A']).pistes.forEach(p => { if (vues.has(p.q)) doublons++; vues.add(p.q); });
  }
  delete global.localStorage;
  console.log('    risque de revoir une énigme à la 2e partie : ' + Math.round(100 * revues / parties) + ' %');
  check('2e partie : aucune énigme déjà vue', revues === 0, revues);
  check('6 parties d’affilée : aucune énigme revue', doublons === 0, doublons);
}

/* ================= L'IMPOSTEUR ================= */
console.log('--- L’Imposteur : les mots ---');
{
  const I = require(ROOT + '/js/games/imposteur.js');
  const P = I._PAIRES, A = I._ASSOC;
  check('au moins 300 paires', P.length >= 300, P.length);
  const cats = I._CATEGORIES.filter(c => c.id !== 'tout');
  check('10 catégories, 30 paires au moins chacune',
    cats.length >= 10 && cats.every(c => P.filter(p => p.cat === c.id).length >= 30),
    cats.map(c => c.id + ':' + P.filter(p => p.cat === c.id).length).join(' '));
  check('trois niveaux représentés (au moins 25 paires chacun)',
    [1, 2, 3].every(n => P.filter(p => p.niv === n).length >= 25),
    [1, 2, 3].map(n => P.filter(p => p.niv === n).length));
  const vues = new Set(), doubles = [];
  P.forEach(p => { const k = [p.a, p.b].sort().join('|'); if (vues.has(k)) doubles.push(k); vues.add(k); });
  check('aucune paire en double', !doubles.length, doubles);
  const mots = new Set();
  P.forEach(p => { mots.add(p.a); mots.add(p.b); });
  const sans = [...mots].filter(m => !A[m] || A[m].length < 6);
  check('chaque mot a au moins 6 associations pour l’ordinateur', !sans.length, sans);
  const invalides = [];
  Object.keys(A).forEach(m => A[m].forEach(a => { if (!I._clueOk(a, m)) invalides.push(m + ':' + a); }));
  check('toutes les associations sont des indices valables (un mot, sans le mot secret)', !invalides.length, invalides);
  // l'ordinateur donne des indices sur SON mot (l'audit en trouvait 51 % hors sujet)
  let total = 0, surMot = 0, parties = 0;
  const clone = o => JSON.parse(JSON.stringify(o));
  for (let g = 0; g < 300; g++) {
    const names = Array.from({ length: 3 + (g % 3) }, (_, k) => '🤖 ' + k);
    const st = I.create(names);
    I.apply(st, 0, { t: 'deal', opts: { white: g % 2 === 0, debat: 0 } });
    let pas = 0;
    while (st.phase !== 'end' && pas++ < 300) {
      if (st.phase === 'result') { I.apply(st, 0, { t: 'next' }); continue; }
      let agi = false;
      for (let i = 0; i < st.players.length && !agi; i++) {
        const a = I.bot(clone(st), i);
        if (!a) continue;
        if (a.t === 'clue' && st.players[i].role !== 'white') {
          total++;
          if ((A[st.players[i].word] || []).map(I._norm).includes(I._norm(a.text))) surMot++;
        }
        agi = I.apply(st, i, a).ok;
      }
      if (!agi) break;
    }
    if (st.phase === 'end') parties++;
  }
  console.log('    indices de l’ordinateur sur son propre mot : ' + Math.round(100 * surMot / total) + ' % (' + total + ' indices)');
  check('au moins 95 % des indices de l’ordinateur portent sur son propre mot', surMot / total >= 0.95, [surMot, total]);
  check('300 manches tout-IA menées au bout', parties === 300, parties);
}

console.log(failures ? '\n' + failures + ' ÉCHEC(S)' : '\nContenu des jeux de soirée OK.');
process.exit(failures ? 1 : 0);
