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

/* harnais « tout IA » (comme tests/test_bots.js) : une partie complète sans
   blocage ni action refusée ; drive = l'hôte humain qui enchaîne les écrans */
function partieToutIA(mod, noms, niveau, drive, max) {
  const ctx = { dict, niveau };
  const st = mod.create(noms, ctx);
  st.niveauIA = niveau;
  const minuteurs = [];
  for (let k = 0; k < max; k++) {
    if (mod.over(st)) return { ok: true, st, k };
    if (minuteurs.length) {
      const t = minuteurs.shift();
      const r = mod.apply(st, -1, t.action, ctx);
      if (r.ok && r.timer) minuteurs.push(r.timer);
      continue;
    }
    const d = drive(st);
    if (d) {
      const r = mod.apply(st, d.player, d.action, ctx);
      if (!r.ok) return { ok: false, err: 'drive refusé : ' + r.error };
      if (r.timer) minuteurs.push(r.timer);
      continue;
    }
    let joue = false;
    for (let i = 0; i < st.players.length; i++) {
      const a = mod.bot(GG.clone(st), i, ctx);
      if (!a) continue;
      const r = mod.apply(st, i, a, ctx);
      if (!r.ok) return { ok: false, err: 'IA refusée ' + JSON.stringify(a) + ' : ' + r.error };
      if (r.timer) minuteurs.push(r.timer);
      joue = true;
      break;
    }
    if (!joue) return { ok: false, err: 'blocage : personne ne peut jouer' };
  }
  return { ok: false, err: 'trop long' };
}

/* ================= PENDU ================= */
if (partie('pendu')) {
  console.log('--- Pendu ---');
  const pendu = require(ROOT + '/js/games/pendu.js');
  const TH = GG.MOTS_THEMES;
  const rangDe = {};
  TH.forEach(t => t.mots.forEach((l, r) => l.forEach(w => { if (!(w in rangDe) || rangDe[w] > r) rangDe[w] = r; })));
  const joueTout = (g, joueur) => {
    for (const L of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
      if (g.roundOver) break;
      pendu.apply(g, joueur === undefined ? g.current : joueur, { t: 'letter', l: L });
    }
  };
  // bug 5 : niveaux recalibrés (facile = mots très courants et courts)
  for (const lvl of ['facile', 'moyen', 'difficile']) {
    const cfg = pendu._LEVELS[lvl];
    let rares = 0, horsLong = 0, sansCat = 0, lettres = 0, pasTresCourant = 0;
    const N = 300;
    for (let k = 0; k < N; k++) {
      const g = pendu.create(['A']);
      pendu.apply(g, 0, { t: 'level', l: lvl });
      if (rangDe[g.secret] === 2) rares++;
      if (rangDe[g.secret] !== 0) pasTresCourant++;
      if (g.secret.length < cfg.min || g.secret.length > cfg.max) horsLong++;
      if (!TH.some(t => t.id === g.cat)) sansCat++;
      lettres += g.secret.length;
    }
    console.log('    → ' + lvl + ' : ' + pct(rares, N) + ' % de mots « plus rares », ' +
      (lettres / N).toFixed(1) + ' lettres en moyenne, ' + cfg.lives + ' erreurs permises');
    if (lvl === 'facile') {
      check('bug 5 : en facile, 0 % de vocabulaire corsé (avant : 41 %), 100 % de mots très courants de 4 à 7 lettres',
        rares === 0 && pasTresCourant === 0 && horsLong === 0, { rares, pasTresCourant, horsLong });
    }
    if (lvl === 'moyen') check('bug 5 : en moyen, aucun mot « plus rare »', rares === 0 && horsLong === 0);
    if (lvl === 'difficile') {
      check('bug 5 : en difficile, vocabulaire plus riche (6 à 12 lettres, aucun mot « très courant »)',
        horsLong === 0 && rares > 0 && pasTresCourant === N);
    }
    check('  … ' + lvl + ' : chaque mot a sa catégorie (indice)', sansCat === 0);
  }
  // bug 4 : « Manche 6 / 5 »
  {
    const g = pendu.create(['A', 'B']);
    pendu.apply(g, 0, { t: 'level', l: 'facile' });
    let maxVu = 0;
    for (let m = 0; m < 5; m++) {
      joueTout(g);
      maxVu = Math.max(maxVu, g.round);
      pendu.apply(g, 0, { t: 'next' });
      maxVu = Math.max(maxVu, g.round);
    }
    check('bug 4 : 5 manches jouées, fin de partie, le compteur ne dépasse jamais 5 / 5',
      g.finished && g.round === 5 && maxVu === 5, { round: g.round, maxVu });
    check('bug 4 : un « Mot suivant » de trop est refusé', !pendu.apply(g, 0, { t: 'next' }).ok);
    const g2 = pendu.create(['A']);
    pendu.apply(g2, 0, { t: 'level', l: 'moyen' });
    joueTout(g2, 0);
    pendu.apply(g2, 0, { t: 'next' });
    check('bug 4 : nouvelle manche vierge (aucune lettre jouée, aucune erreur)',
      g2.tried.length === 0 && g2.errors === 0 && g2.round === 2);
  }
  // pas de répétition (dans la partie et d'une partie à l'autre)
  {
    global.localStorage = fauxStockage();
    const vus = new Set();
    let rep = 0;
    for (let p2 = 0; p2 < 20; p2++) {
      const g = pendu.create(['A']);
      pendu.apply(g, 0, { t: 'level', l: 'moyen' });
      for (let m = 0; m < 5; m++) {
        if (vus.has(g.secret)) rep++;
        vus.add(g.secret);
        joueTout(g, 0);
        pendu.apply(g, 0, { t: 'next' });
      }
    }
    check('20 parties de 5 mots (moyen) : aucun mot revu', rep === 0, rep);
    delete global.localStorage;
  }
  // bug 9 : « Jouer seul » proposé (IA à niveaux) et parties tout-IA sans accroc
  check('bug 9 : le Pendu se joue seul contre l’ordinateur (bot + niveaux)',
    typeof pendu.bot === 'function' && JSON.stringify(pendu.niveaux) === '["facile","moyen","difficile"]');
  {
    let ok = true, err = null;
    for (let k = 0; k < 12 && ok; k++) {
      const duelMode = k % 3 === 2;
      const noms = ['🤖 A', '🤖 B', '🤖 C'].slice(0, 2 + (k % 2));
      const r = partieToutIA(pendu, noms, ['facile', 'moyen', 'difficile'][k % 3], st => {
        if (st.phase === 'setup') {
          return { player: 0, action: duelMode ? { t: 'duel' } : { t: 'level', l: ['facile', 'moyen', 'difficile'][k % 3] } };
        }
        if (st.roundOver && !st.finished) return { player: 0, action: { t: 'next' } };
        return null;
      }, 3000);
      if (!r.ok) { ok = false; err = r.err; }
    }
    check('12 parties tout-IA (le jeu choisit / « je choisis le mot »), 2 et 3 joueurs, sans accroc', ok, err);
  }
  // mesures des niveaux d'IA (parties de 5 manches contre un joueur moyen simulé)
  {
    const N = pendu._NIVEAUX_IA;
    N._humain = { pattern: 0.55, vocab: 1, hasard: 0.08, top: 2 };
    const taux = {};
    const G = 150;
    for (const niv of ['facile', 'moyen', 'difficile']) {
      let w = 0;
      for (let k = 0; k < G; k++) {
        const ia = k % 2;
        const s2 = pendu.create(ia ? ['H', 'IA'] : ['IA', 'H']);
        pendu.apply(s2, 0, { t: 'level', l: ['facile', 'moyen', 'difficile'][k % 3] });
        for (let z = 0; z < 2000 && !s2.finished; z++) {
          if (s2.roundOver) { pendu.apply(s2, 0, { t: 'next' }); continue; }
          const i = s2.current;
          pendu.apply(s2, i, pendu.bot(GG.clone(s2), i, { niveau: i === ia ? niv : '_humain' }));
        }
        const a = s2.players[ia].score, h = s2.players[1 - ia].score;
        w += a > h ? 1 : (a === h ? 0.5 : 0);
      }
      taux[niv] = pct(w, G);
    }
    console.log('    → IA du Pendu : gagne ' + taux.facile + ' % (facile), ' + taux.moyen + ' % (moyen), ' +
      taux.difficile + ' % (difficile) contre un joueur moyen simulé');
    check('bug 9 : niveaux d’IA réellement différents (facile < moyen < difficile, écarts ≥ 10 points)',
      taux.facile + 10 <= taux.moyen && taux.moyen + 10 <= taux.difficile);
    check('bug 9 : « difficile » fait transpirer (≥ 62 %), « facile » reste battable (≤ 38 %)',
      taux.difficile >= 62 && taux.facile <= 38);
    // l'IA ne regarde jamais le mot
    const g = pendu.create(['A', 'B']);
    pendu.apply(g, 0, { t: 'level', l: 'moyen' });
    g.current = 1;
    const c = GG.clone(g);
    Object.defineProperty(c, 'secret', { get() { throw new Error('triche !'); } });
    let triche = false, a = null;
    try { a = pendu.bot(c, 1, { niveau: 'difficile' }); } catch (e) { triche = true; }
    check('bug 9 : l’IA ne lit jamais le mot secret', !triche && a && pendu.apply(g, 1, a).ok);
  }
  // « je choisis le mot, tu devines »
  {
    const solo = pendu.create(['A']);
    check('duel : impossible seul', !pendu.apply(solo, 0, { t: 'duel' }).ok);
    const g = pendu.create(['Léa', 'Tom']);
    check('duel : lancé par l’hôte', pendu.apply(g, 0, { t: 'duel' }).ok && g.phase === 'choose' && pendu.turnOf(g) === 0);
    check('duel : 2 manches par joueur', g.maxRounds === 4);
    check('duel : seul celui qui choisit peut écrire le mot', !pendu.apply(g, 1, { t: 'choose', w: 'CHAT' }).ok);
    check('duel : mot trop court ou avec chiffres refusé', !pendu.apply(g, 0, { t: 'choose', w: 'CH' }).ok &&
      !pendu.apply(g, 0, { t: 'choose', w: 'CHAT9' }).ok);
    let r = pendu.apply(g, 0, { t: 'choose', w: 'Éléphant', cat: '<img src=x onerror=alert(1)>' });
    check('duel : accents retirés, catégorie inconnue ignorée (liste blanche)', r.ok && g.secret === 'ELEPHANT' && g.cat === '');
    check('duel : c’est à Tom de deviner', pendu.turnOf(g) === 1 && g.current === 1);
    check('duel : le mot reste caché pour Tom, visible pour Léa',
      pendu.redact(g, 1).secret === undefined && pendu.redact(g, 0).secret === 'ELEPHANT');
    check('duel : Léa ne peut pas deviner son propre mot', !pendu.apply(g, 0, { t: 'letter', l: 'E' }).ok);
    for (const L of 'ZXWKQJYVB') { if (g.roundOver) break; pendu.apply(g, 1, { t: 'letter', l: L }); }
    check('duel : le mot a résisté → +5 pour Léa', g.roundOver && g.lost && g.players[0].score === 5, g.players);
    pendu.apply(g, 0, { t: 'next' });
    check('duel : manche suivante, c’est Tom qui choisit', g.phase === 'choose' && g.chooser === 1 && pendu.turnOf(g) === 1);
    r = pendu.apply(g, 1, { t: 'choose', w: 'chat', cat: 'animaux' });
    check('duel : catégorie connue gardée comme indice', r.ok && g.cat === 'animaux' && g.current === 0);
    // l'ordinateur sait choisir un mot et deviner celui d'un humain
    const h = pendu.create(['Vous', '🤖 Margot']);
    pendu.apply(h, 0, { t: 'duel' });
    pendu.apply(h, 0, { t: 'choose', w: 'TOMATE', cat: 'fruits' });
    let coups = 0;
    while (!h.roundOver && coups++ < 40) {
      const a = pendu.bot(GG.clone(h), 1, { niveau: 'moyen' });
      if (!a) break;
      pendu.apply(h, 1, a);
    }
    pendu.apply(h, 0, { t: 'next' });
    const a2 = pendu.bot(GG.clone(h), 1, { niveau: 'moyen' });
    check('duel contre l’ordinateur : il devine le mot de l’humain, puis choisit le sien',
      h.round === 2 && a2 && a2.t === 'choose' && pendu.apply(h, 1, a2).ok && h.phase === 'play' && h.current === 0);
  }
  // gagnants()
  {
    const g = pendu.create(['A', 'B']);
    g.players[0].score = 7; g.players[1].score = 3;
    check('gagnants : le meilleur score', JSON.stringify(pendu.gagnants(g)) === '[0]');
    g.players[1].score = 7;
    check('gagnants : égalité → []', JSON.stringify(pendu.gagnants(g)) === '[]');
    const s1 = pendu.create(['A']);
    s1.trouves = 3;
    const gagne3 = JSON.stringify(pendu.gagnants(s1)) === '[0]';
    s1.trouves = 2;
    check('gagnants en solo : 3 mots sur 5 → victoire, 2 → défaite', gagne3 && pendu.gagnants(s1) === null);
  }
}

/* ================= MOTS MÊLÉS ================= */
if (partie('meles')) {
  console.log('--- Mots mêlés ---');
  const meles = require(ROOT + '/js/games/meles.js');
  const L = meles._LEVELS;
  check('bug 8 : grilles en hauteur pour le téléphone (7×8, 8×9, 9×10 au lieu de 13×13)',
    L.facile.cols === 7 && L.facile.rows === 8 && L.moyen.cols === 8 && L.moyen.rows === 9 &&
    L.difficile.cols === 9 && L.difficile.rows === 10);
  // grilles à thème + mot mystère formé des lettres restantes
  for (const lvl of ['facile', 'moyen', 'difficile']) {
    let ok = 0, avecMyst = 0, mots = 0, horsTheme = 0, doublons = 0, mystFaux = 0, pire = 0;
    const N = 110;
    for (let k = 0; k < N; k++) {
      const th = GG.MOTS_THEMES[k % GG.MOTS_THEMES.length];
      const t0 = Date.now();
      const b = meles._construit(lvl, th.id, 4242 + k * 7919);
      pire = Math.max(pire, Date.now() - t0);
      if (!b) continue;
      ok++;
      mots += b.words.length;
      const duTheme = new Set([].concat(th.mots[0], th.mots[1], th.mots[2]));
      if (b.theme !== th.id || b.words.some(w => !duTheme.has(w.w))) horsTheme++;
      if (b.words.some(w => meles._occurrences(b.grid, b.cols, b.rows, w.w) !== 1)) doublons++;
      if (b.mystere) {
        avecMyst++;
        const prises = new Set();
        b.words.forEach(w => w.cells.forEach(i => prises.add(i)));
        const reste = b.grid.filter((c, i) => !prises.has(i)).join('');
        if (reste !== b.mystere || !duTheme.has(b.mystere)) mystFaux++;
      }
    }
    console.log('    → ' + lvl + ' : ' + (mots / ok).toFixed(1) + ' mots par grille, ' + pct(avecMyst, N) +
      ' % avec mot mystère, génération ≤ ' + pire + ' ms');
    check(lvl + ' : 110 grilles à thème (tous les mots du thème choisi, chacun une seule fois)',
      ok === N && horsTheme === 0 && doublons === 0, { ok, horsTheme, doublons });
    check(lvl + ' : mot mystère du thème = lettres restantes lues dans l’ordre (≥ 97 % des grilles)',
      pct(avecMyst, N) >= 97 && mystFaux === 0, { avecMyst, mystFaux });
  }
  // défi du jour : même grille pour tous
  {
    const a = meles.create(['A']), b = meles.create(['B', 'C']);
    meles.apply(a, 0, { t: 'level', m: 'jour' });
    meles.apply(b, 0, { t: 'level', m: 'jour' });
    check('défi du jour : la même grille pour tout le monde (calculée depuis la date)',
      a.grid.join('') === b.grid.join('') && a.mystere === b.mystere && a.theme === b.theme && a.jour === meles._jourCle());
  }
  // partie : mot à l'envers, mot mystère, fin
  {
    const g = meles.create(['A', 'B']);
    meles.apply(g, 0, { t: 'level', l: 'moyen', th: 'animaux' });
    check('thème choisi respecté (Animaux)', g.theme === 'animaux');
    const w0 = g.words[0];
    let r = meles.apply(g, 1, { t: 'claim', a: w0.cells[w0.cells.length - 1], b: w0.cells[0] });
    check('mot sélectionné à l’envers accepté', r.ok && w0.foundBy === 1);
    check('mot mystère caché aux invités tant qu’il n’est pas trouvé', meles.redact(g, 1).mystere === undefined &&
      meles.redact(g, 1).mystereLen === g.mystere.length);
    r = meles.apply(g, 0, { t: 'mystere', w: 'ZZZ' });
    check('mauvais mot mystère refusé', !r.ok);
    r = meles.apply(g, 0, { t: 'mystere', w: g.mystere.toLowerCase() });
    check('bon mot mystère : +3 points', r.ok && g.players[0].bonus === 3 && meles.scoreOf(g, 0) === 3);
    let timer = null;
    g.words.forEach(w => {
      if (w.foundBy === -1) { const rr = meles.apply(g, 0, { t: 'claim', a: w.cells[0], b: w.cells[w.cells.length - 1] }); if (rr.timer) timer = rr.timer; }
    });
    check('tous les mots trouvés : révélation du mot mystère (minuteur), pas encore fini', g.phase === 'mystere' && !g.finished && timer && timer.action.t === 'fin');
    check('… puis fin de partie', meles.apply(g, -1, timer.action).ok && g.finished && meles.over(g));
    check('gagnants : le meilleur score', JSON.stringify(meles.gagnants(g)) === '[0]');
  }
  // chrono : une longue absence ne compte pas des heures
  {
    const g = meles.create(['A']);
    meles.apply(g, 0, { t: 'level', l: 'facile' });
    g.lastTs -= 5 * 3600 * 1000; g.startTs -= 5 * 3600 * 1000;
    const w = g.words[0];
    meles.apply(g, 0, { t: 'claim', a: w.cells[0], b: w.cells[w.cells.length - 1] });
    check('chrono : une pause de 5 h (application fermée) compte au plus 3 min', g.chrono <= 180000 + 1000, g.chrono);
  }
  // sur ce téléphone à plusieurs : chacun son tour
  {
    const g = meles.create(['A', 'B']);
    meles.apply(g, 0, { t: 'level', l: 'facile', tour: true });
    check('à 2 sur un téléphone : chacun son tour (tour de A)', meles.turnOf(g) === 0);
    const w = g.words[0];
    check('… B ne peut pas jouer au tour de A', !meles.apply(g, 1, { t: 'claim', a: w.cells[0], b: w.cells[w.cells.length - 1] }).ok);
    meles.apply(g, 0, { t: 'claim', a: w.cells[0], b: w.cells[w.cells.length - 1] });
    check('… un mot trouvé et on passe à B', meles.turnOf(g) === 1 && g.players[0].found === 1);
  }
  // l'ordinateur (Jouer seul) : parties tout-IA et rythme par niveau
  check('Jouer seul : IA et niveaux déclarés', typeof meles.bot === 'function' &&
    JSON.stringify(meles.niveaux) === '["facile","moyen","difficile"]');
  {
    const rythme = {};
    let ok = true, err = null;
    for (const niv of ['facile', 'moyen', 'difficile']) {
      let tics = 0, trouves = 0;
      for (let k = 0; k < 6; k++) {
        const r = partieToutIA(meles, ['🤖 A', '🤖 B'], niv, st => (st.phase === 'setup'
          ? { player: 0, action: { t: 'level', l: ['facile', 'moyen', 'difficile'][k % 3] } } : null), 20000);
        if (!r.ok) { ok = false; err = niv + ' : ' + r.err; break; }
        tics += r.st.tic;
        trouves += r.st.words.length;
      }
      rythme[niv] = 2 * tics / Math.max(1, trouves); // par robot (ils cherchent à deux)
    }
    check('18 parties tout-IA (2 robots) menées à leur terme sans accroc', ok, err);
    console.log('    → IA des Mots mêlés : un mot toutes les ' + rythme.facile.toFixed(1) + ' / ' + rythme.moyen.toFixed(1) + ' / ' +
      rythme.difficile.toFixed(1) + ' secondes environ par robot (facile / moyen / difficile ; 1 battement ≈ 1 s)');
    check('niveaux d’IA réellement différents (facile nettement plus lente que difficile)',
      rythme.facile > rythme.moyen * 1.3 && rythme.moyen > rythme.difficile * 1.3);
    // l'IA ne triche pas sur le temps : jamais un mot avant d'avoir « cherché »
    const g = meles.create(['Vous', '🤖 Margot'], { niveau: 'difficile' });
    meles.apply(g, 0, { t: 'level', l: 'moyen' });
    const a = meles.bot(GG.clone(g), 1, { niveau: 'difficile' });
    check('l’IA ne trouve rien à la première seconde (elle cherche, comme un joueur)', a && a.t === 'attente');
  }
}

console.log(failures ? '\n' + failures + ' ÉCHEC(S)' : '\nTests V2 jeux de mots OK.');
process.exit(failures ? 1 : 0);
