/*
 * V2 — chantier « jeux de mots » : Mot Mystère, Pendu, Mots mêlés.
 * Tests Node : listes de mots (taille, doublons, dictionnaire), règles
 * corrigées (un contrôle par bug de l'audit) et mesures des IA.
 *
 * Usage : node tests/test_v2_mots.js            (tout)
 *         node tests/test_v2_mots.js motus      (une partie : listes, motus, pendu, meles)
 */
const ROOT = require('path').join(__dirname, '..');
require(ROOT + '/js/games/registry.js');
require(ROOT + '/js/games/motscourants.js');
const fs = require('fs');
const AI = require(ROOT + '/js/ai.js');
const dict = AI.buildDict(fs.readFileSync(ROOT + '/data/mots.txt', 'utf8'));
const motus = require(ROOT + '/js/games/motus.js');

let failures = 0;
function check(n, c, e) {
  if (c) console.log('  OK  ' + n);
  else { failures++; console.log('  FAIL ' + n + (e !== undefined ? ' -> ' + JSON.stringify(e) : '')); }
}
const seul = process.argv[2] || null;
const partie = nom => !seul || seul === nom;
const pct = (a, b) => Math.round(100 * a / Math.max(1, b));

/* un faux localStorage (la mémoire des mots déjà sortis vit dans le navigateur) */
function fauxStockage() {
  const m = {};
  return {
    getItem: k => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: k => { delete m[k]; },
    _m: m
  };
}

/* ================= LISTES ================= */
if (partie('listes')) {
  console.log('--- Listes de mots ---');
  const sansDoublon = l => new Set(l).size === l.length;
  const auDico = l => l.filter(w => !dict.set.has(w));
  for (const L of [5, 6, 7]) {
    const s = GG.MOTS_MYSTERE[L];
    check('Mot Mystère ' + L + ' lettres : ≥ 1 000 mots secrets (' + s.length + ')', s.length >= 1000, s.length);
    check('  … sans doublon', sansDoublon(s));
    check('  … tous de ' + L + ' lettres A-Z', s.every(w => w.length === L && /^[A-Z]+$/.test(w)));
    check('  … tous dans data/mots.txt', auDico(s).length === 0, auDico(s).slice(0, 5));
    const v = GG.MOTS_VOCAB[L];
    check('  vocabulaire ' + L + ' (' + v.length + ') : sans doublon, au dictionnaire, contient les secrets',
      sansDoublon(v) && auDico(v).length === 0 && s.every(w => v.indexOf(w) !== -1));
  }
  const C = GG.MOTS_COURANTS;
  check('MOTS_COURANTS : interface conservée (tableau de mots, ≥ 700)', Array.isArray(C) && C.length >= 700, C.length);
  check('MOTS_COURANTS : sans doublon, A-Z, au dictionnaire',
    sansDoublon(C) && C.every(w => /^[A-Z]+$/.test(w)) && auDico(C).length === 0, auDico(C).slice(0, 5));
  const T = GG.MOTS_THEMES;
  check('au moins 20 thèmes (' + T.length + ')', T.length >= 20);
  let themesOk = true, detail = null;
  T.forEach(th => {
    const tous = th.mots[0].concat(th.mots[1], th.mots[2]);
    if (tous.length < 40 || !sansDoublon(tous) || auDico(tous).length || !th.nom || !th.ic ||
      tous.some(w => !/^[A-Z]{3,}$/.test(w))) { themesOk = false; detail = th.id; }
  });
  check('chaque thème : ≥ 40 mots, sans doublon, au dictionnaire, nom et icône', themesOk, detail);
  const GROS = ['MERDE', 'PUTAIN', 'CONNARD', 'SALOPE', 'NEGRE', 'ENCULE', 'BORDEL', 'CHIER', 'BAISER', 'PENIS'];
  const partout = new Set([].concat(C, GG.MOTS_VOCAB[5], GG.MOTS_VOCAB[6], GG.MOTS_VOCAB[7]));
  check('aucun mot grossier dans les listes', GROS.every(w => !partout.has(w)), GROS.filter(w => partout.has(w)));
  check('la liste d’origine est toujours là (CHIEN, PLAGE, TRESOR, DRAGON)',
    ['CHIEN', 'PLAGE', 'TRESOR', 'DRAGON'].every(w => C.indexOf(w) !== -1));
}

/* ================= MOT MYSTÈRE ================= */
if (partie('motus')) {
  console.log('--- Mot Mystère ---');
  const ctx = { dict };
  // bug 6 : plus de 1 000 mots, sans répétition (dans l'état ET localement)
  {
    const g = motus.create(['A'], ctx);
    motus.apply(g, 0, { t: 'level', l: 'facile' }, ctx);
    const vus = new Set([g.secret]);
    let rep = 0;
    for (let k = 1; k < 1000; k++) {
      motus.apply(g, 0, { t: 'guess', w: g.secret }, ctx);
      motus.apply(g, 0, { t: 'next' }, ctx);
      if (vus.has(g.secret)) rep++;
      vus.add(g.secret);
    }
    check('bug 6 : 1 000 mots de 5 lettres d’affilée, aucune répétition', rep === 0 && vus.size === 1000, rep);
  }
  {
    global.localStorage = fauxStockage();
    const vus = new Set();
    let rep = 0;
    for (let partieN = 0; partieN < 3; partieN++) {
      const g = motus.create(['A'], ctx);
      motus.apply(g, 0, { t: 'level', l: 'moyen' }, ctx);
      for (let k = 0; k < 300; k++) {
        if (vus.has(g.secret)) rep++;
        vus.add(g.secret);
        motus.apply(g, 0, { t: 'guess', w: g.secret }, ctx);
        motus.apply(g, 0, { t: 'next' }, ctx);
      }
    }
    check('bug 6 : 3 parties de 300 mots (6 lettres) : aucun mot revu, grâce à la mémoire locale', rep === 0, rep);
    const h = JSON.parse(global.localStorage.getItem('gg-motus-vus-6'));
    check('  … mémoire locale bornée (85 % de la liste)', h.length <= Math.floor(GG.MOTS_MYSTERE[6].length * 0.85), h.length);
    delete global.localStorage;
  }
  // probabilité de revoir un mot en 15 mots (l'audit mesurait 44 à 54 %)
  {
    let revus = 0;
    for (let e = 0; e < 200; e++) {
      const g = motus.create(['A'], ctx);
      motus.apply(g, 0, { t: 'level', l: 'difficile' }, ctx);
      const vus = new Set([g.secret]);
      let dbl = false;
      for (let k = 1; k < 15; k++) {
        motus.apply(g, 0, { t: 'guess', w: g.secret }, ctx);
        motus.apply(g, 0, { t: 'next' }, ctx);
        if (vus.has(g.secret)) dbl = true;
        vus.add(g.secret);
      }
      if (dbl) revus++;
    }
    check('bug 6 : chance de revoir un mot en 15 mots : ' + pct(revus, 200) + ' % (avant : 44 à 54 %)', revus === 0);
  }

  // bug 2 : dictionnaire non chargé → la liste du jeu valide, l'IA joue quand même
  {
    const sans = { dict: null };
    const g = motus.create(['Vous', '🤖 Margot'], sans);
    check('bug 2 : absence de dictionnaire détectée dès la création', g.dicoOk === false);
    motus.apply(g, 0, { t: 'level', l: 'facile' }, sans);
    g.secret = 'CHIEN'; g.first = 'C';
    let r = motus.apply(g, 0, { t: 'guess', w: 'CQXWZ' }, sans);
    check('bug 2 : sans dictionnaire, des lettres au hasard sont REFUSÉES', !r.ok && /liste de mots du jeu/.test(r.error), r.error);
    r = motus.apply(g, 0, { t: 'guess', w: 'CHAUD' }, sans);
    check('bug 2 : sans dictionnaire, un mot de la liste du jeu est accepté', r.ok, r.error);
    let joue = 0, refus = 0;
    for (let k = 0; k < 40 && g.phase === 'play'; k++) {
      const a = motus.bot(GG.clone(g), 1, { dict: null, niveau: 'moyen' });
      if (!a) break;
      const rr = motus.apply(g, 1, a, sans);
      if (rr.ok) joue++; else { refus++; break; }
      if (g.phase === 'play') motus.apply(g, 0, { t: 'guess', w: GG.MOTS_VOCAB[5].filter(w => w[0] === 'C' && !g.tries.some(t => t.word === w))[0] }, sans);
    }
    check('bug 2 : sans dictionnaire, l’IA joue (' + joue + ' essais acceptés, aucun refus)', joue >= 1 && refus === 0);
  }

  // bug 7 : IA à niveaux, qui ne connaît pas la liste secrète aux niveaux bas
  {
    const N = motus._NIVEAUX_IA;
    // un « joueur moyen » simulé : vocabulaire complet, se souvient de tout,
    // oublie parfois une lettre grise, ne pense pas à tous les mots à chaque tour
    N._humain = { vocab: { 5: 2400, 6: 3000, 7: 3000 }, rappel: 0.35, jaunes: 0.9, gris: 0.7, memoire: 99, flair: 3 };
    check('bug 7 : niveaux déclarés (facile, moyen, difficile)', JSON.stringify(motus.niveaux) === '["facile","moyen","difficile"]');
    check('bug 7 : « facile » et « moyen » ne se servent pas de la liste secrète (flair nul ou faible, vocabulaire courant)',
      N.facile.flair === 0 && N.moyen.flair <= 1 && N.facile.vocab[5] < GG.MOTS_VOCAB[5].length);
    function duel(len, niv, depart) {
      const pool = GG.MOTS_MYSTERE[len];
      const secret = pool[Math.floor(Math.random() * pool.length)];
      const vue = { length: len, first: secret[0], tries: [] };
      let tour = depart, horsListe = 0, iaEssais = 0;
      const sec = new Set(pool);
      for (let k = 0; k < 40; k++) {
        const w = motus._choixIA(vue, tour === 0 ? '_humain' : niv, ctx);
        if (tour === 1) { iaEssais++; if (!sec.has(w)) horsListe++; }
        vue.tries.push({ word: w, marks: motus._marks(secret, w) });
        if (w === secret) return { g: tour, horsListe, iaEssais };
        tour = 1 - tour;
      }
      return { g: -1, horsListe, iaEssais };
    }
    const taux = {};
    const PARTIES = 160;
    for (const niv of ['facile', 'moyen', 'difficile']) {
      let g = 0, n = 0, hl = 0, ie = 0;
      for (const len of [5, 6, 7]) {
        for (let k = 0; k < PARTIES / 2; k++) {
          const r = duel(len, niv, k % 2);
          if (r.g === 1) g++;
          n++; hl += r.horsListe; ie += r.iaEssais;
        }
      }
      taux[niv] = pct(g, n);
      console.log('    → IA ' + niv + ' : gagne ' + taux[niv] + ' % des duels contre un joueur moyen simulé ; ' +
        pct(hl, ie) + ' % de ses essais hors de la liste secrète');
      if (niv !== 'difficile') {
        check('bug 7 : l’IA ' + niv + ' propose aussi des mots hors liste secrète (' + pct(hl, ie) + ' %)', pct(hl, ie) >= 12);
      }
    }
    check('bug 7 : niveaux réellement différents : facile < moyen < difficile (' +
      taux.facile + ' / ' + taux.moyen + ' / ' + taux.difficile + ' %)',
      taux.facile + 8 < taux.moyen && taux.moyen + 8 < taux.difficile);
    check('bug 7 : l’IA ne gagne plus 81-86 % des duels, sauf en difficile (facile ≤ 40 %, moyen ≤ 62 %)',
      taux.facile <= 40 && taux.moyen <= 62);
    check('bug 7 : « difficile » fait transpirer (≥ 60 %)', taux.difficile >= 60);
    // « difficile » n'est plus plus facile pour elle que « facile » : même tendance à chaque longueur
    let ordreOk = true;
    for (const len of [5, 7]) {
      const w = {};
      for (const niv of ['facile', 'difficile']) {
        let g = 0;
        for (let k = 0; k < 90; k++) if (duel(len, niv, k % 2).g === 1) g++;
        w[niv] = pct(g, 90);
      }
      if (!(w.facile + 15 < w.difficile)) ordreOk = false;
      console.log('    → ' + len + ' lettres : facile ' + w.facile + ' %, difficile ' + w.difficile + ' %');
    }
    check('bug 7 : à 5 comme à 7 lettres, l’IA difficile bat nettement l’IA facile', ordreOk);
    // l'IA ne regarde jamais le secret : sans lui, elle joue pareil
    const g = motus.create(['A', 'B'], ctx);
    motus.apply(g, 0, { t: 'level', l: 'moyen' }, ctx);
    motus.apply(g, 0, { t: 'guess', w: GG.MOTS_VOCAB[6].filter(w => w[0] === g.first && w !== g.secret)[0] }, ctx);
    const copie = GG.clone(g);
    Object.defineProperty(copie, 'secret', { get() { throw new Error('triche !'); } });
    let triche = false, a = null;
    try { a = motus.bot(copie, 1, { dict, niveau: 'difficile' }); } catch (e) { triche = true; }
    check('bug 7 : l’IA ne lit jamais le mot secret', !triche && a && motus.apply(g, 1, a, ctx).ok);
  }

  // mode 6 essais : partie en 5 mots, mot révélé après 6 essais ratés
  {
    const g = motus.create(['A'], ctx);
    motus.apply(g, 0, { t: 'level', l: 'facile', m: 'classique' }, ctx);
    const faux = GG.MOTS_VOCAB[5].filter(w => w[0] === g.first && w !== g.secret).slice(0, 7);
    for (let k = 0; k < 6; k++) motus.apply(g, 0, { t: 'guess', w: faux[k] }, ctx);
    check('6 essais : au 6e essai raté, le mot est révélé (personne ne marque)',
      g.phase === 'reveal' && g.foundBy === -1 && g.tries.length === 6 && motus.redact(g, 0).secret === g.secret);
    check('6 essais : pas de 7e essai', !motus.apply(g, 0, { t: 'guess', w: faux[6] }, ctx).ok);
    for (let k = 0; k < 4; k++) {
      motus.apply(g, 0, { t: 'next' }, ctx);
      motus.apply(g, 0, { t: 'guess', w: g.secret }, ctx);
    }
    check('6 essais : 5e mot trouvé, compteur « 5 / 5 »', g.round === 5 && g.phase === 'reveal' && !g.finished);
    motus.apply(g, 0, { t: 'next' }, ctx);
    check('6 essais : fin de partie après le 5e mot (le compteur reste à 5)', g.finished && g.round === 5 && motus.over(g));
    check('gagnants : 4 mots sur 5 en solo → victoire', JSON.stringify(motus.gagnants(g)) === '[0]');
  }
  // défi du jour : même mot pour tous, calculé depuis la date
  {
    const j = motus._jourCle(new Date(2026, 8, 28));
    check('défi du jour : clé de date locale', j === '2026-09-28', j);
    check('défi du jour : même date → même mot', motus._motDuJour(j) === motus._motDuJour('2026-09-28'));
    const annee = [];
    for (let d = 0; d < 365; d++) {
      const dt = new Date(2026, 0, 1 + d);
      annee.push(motus._motDuJour(motus._jourCle(dt)));
    }
    check('défi du jour : 365 jours, 365 mots différents', new Set(annee).size === 365, new Set(annee).size);
    check('défi du jour : longueurs 5, 6 et 7 en alternance',
      [5, 6, 7].every(L => annee.some(w => w.length === L)));
    const g = motus.create(['A', 'B'], ctx);
    motus.apply(g, 0, { t: 'level', m: 'jour' }, ctx);
    check('défi du jour : le secret est le mot du jour', g.secret === motus._motDuJour(motus._jourCle()) && g.mode === 'jour');
    motus.apply(g, 0, { t: 'guess', w: g.secret }, ctx);
    const ok = motus.apply(g, 0, { t: 'next' }, ctx).ok;
    check('défi du jour : une seule manche puis fin, gagnants = [0]', ok && g.finished &&
      JSON.stringify(motus.gagnants(g)) === '[0]');
    const txt = motus._texteDePartage(g);
    check('partage : grille en émojis, sans aucune lettre du mot', /🟩/.test(txt) && txt.indexOf(g.secret) === -1 &&
      /\d\/6/.test(txt), txt);
  }
  // gagnants() en série et à plusieurs
  {
    const g = motus.create(['A', 'B'], ctx);
    motus.apply(g, 0, { t: 'level', l: 'facile' }, ctx);
    check('gagnants : personne n’a encore marqué → null', motus.gagnants(g) === null);
    g.players[1].wins = 2; g.players[0].wins = 1;
    check('gagnants : le meilleur l’emporte', JSON.stringify(motus.gagnants(g)) === '[1]');
    g.players[0].wins = 2;
    check('gagnants : égalité → []', JSON.stringify(motus.gagnants(g)) === '[]');
  }
}

console.log(failures ? '\n' + failures + ' ÉCHEC(S)' : '\nTests V2 jeux de mots OK.');
process.exit(failures ? 1 : 0);
