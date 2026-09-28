/* GGgames — Yams (1 à 4 joueurs, feuille de score calculée par le jeu).
 *
 * V2 : de vrais dés en 3D qui roulent et rebondissent sur la piste, les dés
 * gardés se rangent de côté, une feuille lisible (grandes cases, points
 * possibles affichés, choix confirmé, sous-total vers 63, annulation du
 * dernier choix), « Yams ! » fêté, et l’option « secouer pour lancer ».
 * IA : facile, moyen, difficile (espérance maximale sur deux relances).
 * Contre l’ordinateur, un bouton « Rapide » fait jouer ses tours d’un coup.
 */
(function (root) {
  'use strict';
  var GG = root.GG;
  var CATS = [
    { id: 'un', nom: 'Les 1' }, { id: 'deux', nom: 'Les 2' }, { id: 'trois', nom: 'Les 3' },
    { id: 'quatre', nom: 'Les 4' }, { id: 'cinq', nom: 'Les 5' }, { id: 'six', nom: 'Les 6' },
    { id: 'brelan', nom: 'Brelan' }, { id: 'carre', nom: 'Carré' }, { id: 'full', nom: 'Full' },
    { id: 'psuite', nom: 'Petite suite' }, { id: 'gsuite', nom: 'Grande suite' },
    { id: 'yams', nom: 'Yams' }, { id: 'chance', nom: 'Chance' }
  ];
  var AIDE = {
    brelan: '3 pareils = somme', carre: '4 pareils = somme', full: '3 + 2 pareils = 25',
    psuite: '4 à la suite = 30', gsuite: '5 à la suite = 40', yams: '5 pareils = 50',
    chance: 'somme des dés'
  };
  var UPPER = ['un', 'deux', 'trois', 'quatre', 'cinq', 'six'];

  function counts(dice) {
    var c = [0, 0, 0, 0, 0, 0, 0];
    dice.forEach(function (d) { c[d]++; });
    return c;
  }
  function sum(dice) { return dice.reduce(function (a, b) { return a + b; }, 0); }

  /* Score qu’obtiendrait `dice` dans la catégorie `cat`. */
  function catScore(cat, dice) {
    var c = counts(dice);
    var up = UPPER.indexOf(cat);
    if (up !== -1) return c[up + 1] * (up + 1);
    var has = function (n) { return c.some(function (x) { return x >= n; }); };
    switch (cat) {
      case 'brelan': return has(3) ? sum(dice) : 0;
      case 'carre': return has(4) ? sum(dice) : 0;
      case 'full': {
        var three = c.indexOf(3) > 0 || c.indexOf(5) > 0;
        var pair = false;
        for (var i = 1; i <= 6; i++) if (c[i] === 2) pair = true;
        return (c.indexOf(5) > 0 || (three && pair)) ? 25 : 0;
      }
      case 'psuite': {
        var runs = ['1234', '2345', '3456'];
        var have = '';
        for (var j = 1; j <= 6; j++) if (c[j]) have += j;
        return runs.some(function (r) {
          return r.split('').every(function (d) { return have.indexOf(d) !== -1; });
        }) ? 30 : 0;
      }
      case 'gsuite': {
        var have2 = '';
        for (var k = 1; k <= 6; k++) if (c[k]) have2 += k;
        return (have2 === '12345' || have2 === '23456') ? 40 : 0;
      }
      case 'yams': return has(5) ? 50 : 0;
      case 'chance': return sum(dice);
    }
    return 0;
  }
  function hautDe(p) {
    var u = 0;
    UPPER.forEach(function (id) { if (p.sheet[id] !== null && p.sheet[id] !== undefined) u += p.sheet[id]; });
    return u;
  }
  function totalOf(p) {
    var upper = 0, lower = 0;
    CATS.forEach(function (cat) {
      var v = p.sheet[cat.id];
      if (v === null || v === undefined) return;
      if (UPPER.indexOf(cat.id) !== -1) upper += v; else lower += v;
    });
    return upper + lower + (upper >= 63 ? 35 : 0);
  }
  function startTurn(state) {
    state.dice = [0, 0, 0, 0, 0];
    state.held = [false, false, false, false, false];
    state.rolls = 3;
  }
  function norm(s) {
    if (s.nLancers === undefined) s.nLancers = 0;
    if (s.nChoix === undefined) s.nChoix = 0;
    if (s.annulable === undefined) s.annulable = null;
    return s;
  }
  function lancer(state, keep) {
    if (keep) for (var k = 0; k < 5; k++) state.held[k] = !!keep[k] && state.dice[k] > 0;
    for (var i = 0; i < 5; i++) {
      if (!state.held[i] || state.dice[i] === 0) state.dice[i] = 1 + Math.floor(Math.random() * 6);
    }
    state.rolls--;
    state.nLancers++;
    state.annulable = null; // le joueur suivant a lancé : le choix précédent est acquis
  }
  function marquer(state, player, cat) {
    var p = state.players[player];
    p.sheet[cat] = catScore(cat, state.dice);
    state.nChoix++;
    state.dernierChoix = { player: player, cat: cat, points: p.sheet[cat], n: state.nChoix };
    state.annulable = {
      player: player, cat: cat, dice: state.dice.slice(), held: state.held.slice(), rolls: state.rolls
    };
    if (state.players.every(function (pl) {
      return CATS.every(function (c) { return pl.sheet[c.id] !== null; });
    })) {
      state.finished = true;
      state.annulable = null;
    } else {
      state.current = (state.current + 1) % state.players.length;
      startTurn(state);
    }
  }

  /* ================= IA =================
     Les 252 combinaisons possibles de 5 dés sont indexées une fois pour
     toutes (clé = nombre de 1, de 2… en base 6). */
  var MULTI = [], IDX = {}, ISSUES = [];
  (function () {
    function cle(c) { return c[1] + 6 * c[2] + 36 * c[3] + 216 * c[4] + 1296 * c[5] + 7776 * c[6]; }
    // issues d’un lancer de n dés : [{k (clé des comptes), p}]
    function fact(n) { return n <= 1 ? 1 : n * fact(n - 1); }
    for (var n = 0; n <= 5; n++) {
      var liste = [];
      (function rec(face, reste, c) {
        if (face === 6) {
          c[6] = reste;
          var p = fact(n);
          for (var f = 1; f <= 6; f++) p /= fact(c[f]);
          liste.push({ k: cle(c), p: p / Math.pow(6, n), c: c.slice() });
          return;
        }
        for (var x = 0; x <= reste; x++) { c[face] = x; rec(face + 1, reste - x, c); }
      })(1, n, [0, 0, 0, 0, 0, 0, 0]);
      ISSUES.push(liste);
    }
    ISSUES[5].forEach(function (o) {
      var d = [];
      for (var f = 1; f <= 6; f++) for (var q = 0; q < o.c[f]; q++) d.push(f);
      IDX[o.k] = MULTI.length;
      MULTI.push({ k: o.k, c: o.c, des: d });
    });
  })();
  function cleDes(dice) {
    var c = counts(dice);
    return c[1] + 6 * c[2] + 36 * c[3] + 216 * c[4] + 1296 * c[5] + 7776 * c[6];
  }
  var POIDS_FACE = [0, 1, 6, 36, 216, 1296, 7776];
  // sous-ensembles à garder (distincts) d’une combinaison : [{k, n}]
  function gardes(c) {
    var out = [];
    (function rec(face, k, n) {
      if (face === 7) { out.push({ k: k, n: n }); return; }
      for (var x = 0; x <= c[face]; x++) rec(face + 1, k + x * POIDS_FACE[face], n + x);
    })(1, 0, 0);
    return out;
  }
  // score moyen de chaque case avec un jeu raisonnable (coût d’opportunité)
  // (en haut : le « rythme » du bonus, trois dés de chaque)
  var PAR = {
    un: 3, deux: 6, trois: 9, quatre: 12, cinq: 15, six: 18,
    brelan: 21.7, carre: 13.1, full: 22.6, psuite: 29.5, gsuite: 32.7, yams: 16.9, chance: 22
  };
  var K_BONUS = 2;
  /* valeur d’une case pour ce joueur : points, moins ce qu’elle rapporte
     d’habitude, plus un coup de pouce vers le bonus du haut */
  function valeurCase(p, cat, points) {
    var v = points - PAR[cat];
    var f = UPPER.indexOf(cat) + 1;
    if (f) {
      var haut = hautDe(p);
      if (haut < 63) {
        var possible = haut + points;
        UPPER.forEach(function (id, k) { if (p.sheet[id] === null && id !== cat) possible += 5 * (k + 1); });
        if (possible >= 63) v += (points - 3 * f) * K_BONUS + (haut + points >= 63 ? 35 : 0);
      }
    }
    return v;
  }
  function tableV0(p) {
    var ouvertes = CATS.filter(function (c) { return p.sheet[c.id] === null; });
    return MULTI.map(function (m) {
      var best = -1e9;
      ouvertes.forEach(function (c) {
        var v = valeurCase(p, c.id, catScore(c.id, m.des));
        if (v > best) best = v;
      });
      return best;
    });
  }
  // espérance du meilleur choix de dés gardés, étant donné la table suivante
  function esperance(k, n, table) {
    var iss = ISSUES[5 - n], e = 0;
    for (var q = 0; q < iss.length; q++) e += iss[q].p * table[IDX[k + iss[q].k]];
    return e;
  }
  function meilleureGarde(dice, table) {
    var c = counts(dice), best = null;
    gardes(c).forEach(function (g) {
      var e = esperance(g.k, g.n, table);
      if (!best || e > best.e + 1e-9) best = { e: e, k: g.k, n: g.n };
    });
    return best;
  }
  function masqueDe(dice, k) {
    var voulu = [0, 0, 0, 0, 0, 0, 0], reste = k;
    for (var f = 6; f >= 1; f--) { voulu[f] = Math.floor(reste / POIDS_FACE[f]); reste -= voulu[f] * POIDS_FACE[f]; }
    return dice.map(function (d) { if (voulu[d] > 0) { voulu[d]--; return true; } return false; });
  }
  function meilleureCase(p, dice) {
    var best = null, bv = -1e9;
    CATS.forEach(function (c) {
      if (p.sheet[c.id] !== null) return;
      var v = valeurCase(p, c.id, catScore(c.id, dice));
      if (v > bv) { bv = v; best = c.id; }
    });
    return best;
  }

  /* difficile : à chaque relance, les dés gardés qui maximisent l’espérance
     de la valeur finale (exacte sur les deux relances restantes). */
  function decisionDifficile(state, me) {
    var p = state.players[me], dice = state.dice;
    if (state.rolls === 0) return { t: 'score', cat: meilleureCase(p, dice) };
    var V0 = tableV0(p), table = V0;
    if (state.rolls === 2) {
      table = MULTI.map(function (m) { return meilleureGarde(m.des, V0).e; });
    }
    var g = meilleureGarde(dice, table);
    if (g.n === 5) return { t: 'score', cat: meilleureCase(p, dice) };
    return { t: 'roll', keep: masqueDe(dice, g.k) };
  }

  /* moyen : un plan à la main (yams, suites, full, brelan…) */
  function decisionMoyen(state, me) {
    var p = state.players[me], dice = state.dice;
    var ouverte = function (id) { return p.sheet[id] === null; };
    function caseMoyen() {
      var par = { un: 2, deux: 4, trois: 6, quatre: 8, cinq: 10, six: 12, brelan: 15, carre: 12, full: 15, psuite: 22, gsuite: 18, yams: 4, chance: 21 };
      var best = null, bestV = -Infinity;
      CATS.forEach(function (cat) {
        if (!ouverte(cat.id)) return;
        var sc = catScore(cat.id, dice);
        var v = sc - par[cat.id];
        var up = UPPER.indexOf(cat.id);
        if (up !== -1 && sc >= (up + 1) * 3) v += 4;
        v += (Math.random() - 0.5) * 8; // il hésite, et se trompe parfois
        if (v > bestV) { bestV = v; best = cat.id; }
      });
      return best;
    }
    if (state.rolls === 0) return { t: 'score', cat: caseMoyen() };
    var c = counts(dice);
    var f, face = 1, poids = -1;
    for (f = 1; f <= 6; f++) {
      var w = c[f] * 100 + (ouverte(UPPER[f - 1]) ? 10 : 0) + f;
      if (w > poids) { poids = w; face = f; }
    }
    var suite = [], meilleure = [];
    for (f = 1; f <= 6; f++) {
      if (c[f]) { suite.push(f); if (suite.length > meilleure.length) meilleure = suite.slice(); } else suite = [];
    }
    function gardeFace(fc) { return dice.map(function (d) { return d === fc; }); }
    function gardeSuite(faces) {
      var manque = faces.slice();
      return dice.map(function (d) { var k = manque.indexOf(d); if (k !== -1) { manque.splice(k, 1); return true; } return false; });
    }
    var plan = null;
    if (c[face] === 5) plan = ouverte('yams') ? { score: 'yams' } : { keep: [true, true, true, true, true] };
    else if (meilleure.length === 5) plan = ouverte('gsuite') ? { score: 'gsuite' } : (ouverte('psuite') ? { score: 'psuite' } : null);
    if (!plan && meilleure.length === 4) {
      if (ouverte('gsuite')) plan = { keep: gardeSuite(meilleure) };
      else if (ouverte('psuite')) plan = { score: 'psuite' };
    }
    if (!plan && ouverte('full') && catScore('full', dice) === 25) plan = { score: 'full' };
    if (!plan && c[face] === 4) plan = (!ouverte('yams') && ouverte('carre')) ? { score: 'carre' } : { keep: gardeFace(face) };
    if (!plan && c[face] === 2 && ouverte('full')) {
      if (dice.filter(function (d) { return c[d] === 2; }).length === 4) plan = { keep: dice.map(function (d) { return c[d] === 2; }) };
    }
    if (!plan && c[face] === 1 && meilleure.length >= 3 && (ouverte('psuite') || ouverte('gsuite'))) plan = { keep: gardeSuite(meilleure) };
    if (!plan) plan = { keep: gardeFace(face) };
    if (plan.score) return { t: 'score', cat: plan.score };
    if (plan.keep.every(function (k) { return k; })) return { t: 'score', cat: caseMoyen() };
    return { t: 'roll', keep: plan.keep };
  }

  /* facile : garde la face la plus fréquente, marque la case qui rapporte
     le plus tout de suite (sans penser à la suite de la partie) */
  function decisionFacile(state, me) {
    var p = state.players[me], dice = state.dice;
    function gros() {
      var best = [], bv = -1;
      CATS.forEach(function (c) {
        if (p.sheet[c.id] !== null) return;
        var v = catScore(c.id, dice);
        if (v > bv) { bv = v; best = [c.id]; } else if (v === bv) best.push(c.id);
      });
      return best[Math.floor(Math.random() * best.length)];
    }
    if (state.rolls === 0) return { t: 'score', cat: gros() };
    var c = counts(dice), face = 1;
    for (var f = 1; f <= 6; f++) if (c[f] >= c[face]) face = f;
    if (c[face] === 5 || Math.random() < 0.2) return { t: 'score', cat: gros() };
    return { t: 'roll', keep: dice.map(function (d) { return d === face; }) };
  }
  function decision(state, me, niveau) {
    if (state.rolls === 3) return { t: 'roll', keep: [false, false, false, false, false] };
    if (niveau === 'difficile') return decisionDifficile(state, me);
    if (niveau === 'facile') return decisionFacile(state, me);
    return decisionMoyen(state, me);
  }

  var mod = {
    id: 'yams',
    nom: 'Yams',
    icone: '🎲',
    desc: '5 dés, 3 lancers, 13 cases : la feuille de score se remplit toute seule.',
    regles: '<p><strong>🎯 Le but :</strong> remplir les 13 cases de votre feuille avec les meilleures combinaisons de dés.</p><p><strong>Comment jouer :</strong> 3 lancers par tour ; entre deux, touchez les dés à garder (ils se rangent de côté). Puis touchez une case de la feuille — les points possibles y sont écrits — et confirmez. Chaque case ne sert qu’une fois, même pour 0 !</p><p><strong>Les cases :</strong> les 1 à 6 (somme de ces dés), brelan et carré (somme des 5 dés), full 25, petite suite (4 qui se suivent) 30, grande suite 40, yams (5 pareils) 50, chance (somme).</p><p><strong>Le bonus :</strong> +35 si vos cases 1 à 6 totalisent 63 ou plus (trois de chaque). Le plus gros total gagne.</p><p><strong>Astuces :</strong> un choix malheureux ? « Annuler » tant que le joueur suivant n’a pas lancé. 📳 Activez « secouer » pour lancer en agitant le téléphone.</p>',
    min: 1, max: 4,
    hotseat: true, hidden: false, netOnly: false,
    niveaux: ['facile', 'moyen', 'difficile'],
    noBadges: true, // les onglets de la feuille montrent déjà noms, totaux et tour

    create: function (names) {
      var state = {
        id: Math.floor(Math.random() * 1e9),
        players: names.map(function (n) {
          var sheet = {};
          CATS.forEach(function (c) { sheet[c.id] = null; });
          return { name: n, sheet: sheet };
        }),
        current: 0,
        gameTs: Math.floor(Math.random() * 1e9), // identifiant de partie (records)
        finished: false,
        nLancers: 0,
        nChoix: 0,
        annulable: null,
        rapide: false
      };
      startTurn(state);
      return state;
    },

    turnOf: function (state) { return state.finished ? -1 : state.current; },
    over: function (state) { return state.finished; },
    scoreOf: function (state, i) { return totalOf(state.players[i]); },
    gagnants: function (state) {
      var t = state.players.map(totalOf), max = Math.max.apply(null, t), g = [];
      t.forEach(function (v, i) { if (v === max) g.push(i); });
      return g.length === state.players.length && g.length > 1 ? [] : g;
    },

    summary: function (state) {
      var rows = state.players.map(function (p) {
        return { n: p.name, s: totalOf(p), h: hautDe(p) };
      }).sort(function (a, b) { return b.s - a.s; });
      var html = rows.map(function (r) {
        return '<div class="final-line"><span>' + GG.esc(r.n) + (r.h >= 63 ? ' <small>🎁 bonus</small>' : '') +
          '</span><strong>' + r.s + ' pts</strong></div>';
      }).join('') + '<h3>🏆 ' + rows.filter(function (r) { return r.s === rows[0].s; })
        .map(function (r) { return GG.esc(r.n); }).join(' & ') + '</h3>';
      if (state.players.length === 1) {
        try {
          if (typeof localStorage !== 'undefined') {
            var best = JSON.parse(localStorage.getItem('gg-yams-best') || 'null');
            var cur = { score: rows[0].s, ts: state.gameTs || 0 };
            if (!best || cur.score > best.score) localStorage.setItem('gg-yams-best', JSON.stringify(cur));
            var stored = JSON.parse(localStorage.getItem('gg-yams-best') || 'null');
            if (stored && stored.ts === cur.ts && stored.score === cur.score) html += '<p>🏆 Nouveau record personnel !</p>';
            else if (stored) html += '<p>🏅 Votre record : ' + (stored.score | 0) + ' pts.</p>';
          }
        } catch (e) {}
      }
      return html;
    },

    apply: function (state, player, action) {
      action = action || {};
      norm(state);
      if (state.finished) return { ok: false, error: 'Partie terminée.' };
      if (action.t === 'vitesse') {
        // contre l’ordinateur : ses tours joués d’un coup (réglage de la partie)
        if (!state.niveauIA) return { ok: false, error: 'Réservé au jeu contre l’ordinateur.' };
        state.rapide = !!action.rapide;
        return { ok: true };
      }
      if (action.t === 'annule') {
        var an = state.annulable;
        if (!an) return { ok: false, error: 'Plus rien à annuler.' };
        if (player !== an.player && player !== state.current) return { ok: false, error: 'Ce n’est pas votre choix.' };
        if (state.rolls !== 3) return { ok: false, error: 'Le joueur suivant a déjà lancé.' };
        state.players[an.player].sheet[an.cat] = null;
        state.current = an.player;
        state.dice = an.dice; state.held = an.held; state.rolls = an.rolls;
        state.annulable = null;
        state.dernierChoix = null;
        state.nChoix++;
        return { ok: true };
      }
      if (player !== state.current) return { ok: false, error: 'Ce n’est pas votre tour.' };
      if (action.t === 'roll') {
        if (state.rolls <= 0) return { ok: false, error: 'Plus de lancer disponible.' };
        // jeton anti double-appui : un 2e « lancer » identique est ignoré
        if (action.n !== undefined && action.n !== state.rolls) return { ok: false, error: 'Lancer déjà pris en compte.' };
        if (action.keep !== undefined && (!Array.isArray(action.keep) || action.keep.length !== 5)) {
          return { ok: false, error: 'Dés gardés invalides.' };
        }
        lancer(state, state.rolls === 3 ? null : action.keep);
        return { ok: true };
      }
      if (action.t === 'hold') {
        if (state.rolls === 3) return { ok: false, error: 'Lancez d’abord les dés.' };
        if (state.rolls === 0) return { ok: false, error: 'Plus de lancer : choisissez une case.' };
        var j = action.i | 0;
        if (j < 0 || j > 4) return { ok: false, error: 'Dé invalide.' };
        state.held[j] = !state.held[j];
        return { ok: true };
      }
      if (action.t === 'score') {
        if (state.rolls === 3) return { ok: false, error: 'Lancez d’abord les dés.' };
        var cat = String(action.cat);
        if (!CATS.some(function (c) { return c.id === cat; })) return { ok: false, error: 'Catégorie inconnue.' };
        if (state.players[player].sheet[cat] !== null) return { ok: false, error: 'Catégorie déjà remplie.' };
        marquer(state, player, cat);
        return { ok: true };
      }
      if (action.t === 'auto') {
        // mode rapide : l’ordinateur joue tout son tour en une fois
        if (!state.niveauIA || !state.rapide || player === 0) return { ok: false, error: 'Action réservée à l’ordinateur.' };
        var etapes = [];
        for (var garde = 0; garde < 6; garde++) {
          var d = decision(state, player, state.niveauIA);
          if (d.t === 'roll' && state.rolls > 0) {
            lancer(state, state.rolls === 3 ? null : d.keep);
            etapes.push({ dice: state.dice.slice(), held: state.held.slice() });
          } else {
            var ca = d.cat || meilleureCase(state.players[player], state.dice);
            state.journal = { player: player, etapes: etapes, n: state.nLancers };
            marquer(state, player, ca);
            return { ok: true };
          }
        }
        return { ok: false, error: 'Tour impossible.' };
      }
      return { ok: false, error: 'Action inconnue.' };
    },

    /* IA : facile (garde la face la plus fréquente, marque le plus gros
       score immédiat), moyen (plans : yams, suites, full…), difficile
       (espérance maximale, calculée exactement sur les deux relances). */
    bot: function (state, me, ctx) {
      if (state.finished || state.current !== me) return null;
      norm(state);
      var niveau = (ctx && ctx.niveau) || state.niveauIA || 'moyen';
      if (state.rapide && state.niveauIA && me !== 0 && state.rolls === 3) return { t: 'auto' };
      var d = decision(state, me, niveau);
      if (d.t === 'roll') return state.rolls === 3 ? { t: 'roll', n: 3 } : { t: 'roll', keep: d.keep, n: state.rolls };
      return d;
    },

    render: function (el, ctx) { rendu(el, ctx); },

    _catScore: catScore, // exposé pour les tests
    _decision: decision,
    _total: totalOf,
    _regle: function (k, par) { if (k !== undefined) K_BONUS = k; if (par) Object.keys(par).forEach(function (c) { PAR[c] = par[c]; }); }
  };

  /* ================= Dessin ================= */
  var FACE_ROT = { 1: [0, 0], 2: [-90, 0], 3: [0, -90], 4: [0, 90], 5: [90, 0], 6: [0, 180] };
  function graine(n) {
    var s = (n | 0) || 7;
    return function () { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 10000) / 10000; };
  }
  function deHTML(v, i, garde, cls, st) {
    var faces = '';
    for (var f = 1; f <= 6; f++) faces += '<i class="ym-f f' + f + '"></i>';
    var rot = FACE_ROT[v || 1];
    return '<button class="ym-de' + (garde ? ' garde' : '') + (v ? '' : ' vide') + cls + '" data-die="' + i + '" style="' + st +
      ';--fx:' + rot[0] + 'deg;--fy:' + rot[1] + 'deg" aria-label="Dé ' + (i + 1) + (v ? ' : ' + v : '') +
      (garde ? ', gardé' : '') + '"><span class="ym-cube">' + faces + '</span></button>';
  }

  var dernierEl = null;
  var ecouteSecousse = false;
  function secousse(ev) {
    var a = ev.accelerationIncludingGravity || ev.acceleration;
    if (!a || !dernierEl || !dernierEl._ymSecoue) return;
    var m = Math.sqrt((a.x || 0) * (a.x || 0) + (a.y || 0) * (a.y || 0) + (a.z || 0) * (a.z || 0));
    var now = Date.now();
    if (Math.abs(m - 9.81) > 14) {
      if (dernierEl._ymPic && now - dernierEl._ymPic < 450) { dernierEl._ymPic = 0; dernierEl._ymSecoue(); }
      else dernierEl._ymPic = now;
    }
  }
  function secouerActif() {
    try { return GG.reglages.get('yams-secouer') === true; } catch (e) { return false; }
  }

  function rendu(el, ctx) {
    var s = norm(ctx.state), fx = GG.fx, sfx = GG.sfx;
    var enSolo = ctx.mode === 'local' && !!s.niveauIA;
    var hotseat = ctx.mode === 'local' && !s.niveauIA;
    var mine = ctx.me === s.current && !s.finished;
    var rolled = s.rolls < 3;
    var nomC = GG.esc(s.players[s.current].name);

    // ce qui vient de changer depuis le dernier rendu
    var avant = el._v2 && el._v2.jeu === 'yams' && el._v2.id === s.id ? el._v2 : null;
    var nouveauLancer = !!(avant && s.nLancers > avant.nLancers);
    var nouveauChoix = !!(avant && s.nChoix > avant.nChoix && s.dernierChoix && s.dernierChoix.n === s.nChoix);
    var nouveauJournal = !!(avant && s.journal && (!avant.journal || avant.journal !== s.journal.n) && nouveauChoix);
    var anciensDes = {};
    if (avant) {
      el.querySelectorAll('.ym-de').forEach(function (d) { anciensDes[d.getAttribute('data-die')] = d.getBoundingClientRect(); });
    }
    // la feuille affichée : celle du joueur dont c’est le tour, sauf si on a
    // choisi un autre onglet pendant ce tour
    var vue = s.current;
    if (avant && avant.vueTour === s.current + ':' + s.nChoix && avant.vue !== undefined && avant.vue < s.players.length) vue = avant.vue;
    var sel = avant && avant.selTour === s.current + ':' + s.nLancers ? avant.sel : null;
    if (sel && s.players[s.current].sheet[sel] !== null) sel = null;
    el._v2 = {
      jeu: 'yams', id: s.id, nLancers: s.nLancers, nChoix: s.nChoix, journal: s.journal ? s.journal.n : null,
      vue: vue, vueTour: s.current + ':' + s.nChoix, sel: sel, selTour: s.current + ':' + s.nLancers
    };

    var html = '<div class="ym-v2">';
    // ---- onglets : un par joueur (nom complet, total, à qui le tour) :
    //      ils remplacent les pastilles de la coque, et ouvrent sa feuille ----
    html += '<div class="ym-onglets">';
    s.players.forEach(function (p, i) {
      html += '<button class="ym-onglet' + (i === vue ? ' vu' : '') + (i === s.current && !s.finished ? ' tour' : '') +
        '" data-vue="' + i + '" aria-label="Feuille de ' + GG.esc(p.name) + '">' +
        '<span class="ym-on-nom">' + GG.esc(p.name) + '</span><b>' + totalOf(p) + '</b></button>';
    });
    html += '</div>';
    // ---- la piste de dés ----
    // tant que le joueur suivant n’a pas lancé, on laisse voir les dés du
    // tour précédent (atténués) : on comprend ce que l’autre a marqué
    var an = s.annulable;
    var precedents = !rolled && an && an.dice && an.dice[0] > 0;
    var desAff = precedents ? an.dice : s.dice, gardesAff = precedents ? an.held : s.held;
    var r = graine(s.id + s.nLancers * 7919);
    html += '<div class="ym-table' + (precedents ? ' passe' : '') + '"><div class="ym-gardes">';
    var piste = '';
    for (var i = 0; i < 5; i++) {
      var v = desAff[i], g = gardesAff[i] && v > 0 && (rolled || precedents);
      var roule = (nouveauLancer && !g && rolled) || (nouveauJournal && precedents && !g);
      var cls = roule ? ' roule' : '';
      var ox = ((r() - 0.5) * 16).toFixed(1), oy = ((r() - 0.5) * 18).toFixed(1), oz = ((r() - 0.5) * 38).toFixed(1);
      var st = '--ox:' + ox + 'px;--oy:' + oy + 'px;--oz:' + oz + 'deg;--dl:' + (i * 45) + 'ms';
      if (g) html += '<div class="ym-slot">' + deHTML(v, i, true, '', st) + '</div>';
      else { html += '<div class="ym-slot vide"></div>'; piste += '<div class="ym-slot">' + deHTML(v, i, false, cls, st) + '</div>'; }
    }
    html += '<span class="ym-etiq">Gardés</span></div><div class="ym-piste">' + piste + '</div>';
    if (precedents) {
      var pp0 = s.players[an.player];
      html += '<span class="ym-legende">' + GG.esc(pp0.name) + ' · ' +
        CATS.filter(function (c) { return c.id === an.cat; })[0].nom + ' ' + pp0.sheet[an.cat] + '</span>';
    }
    if (enSolo) {
      html += '<button class="ym-vite' + (s.rapide ? ' on' : '') + '" data-a="vitesse" aria-pressed="' + !!s.rapide + '">⏩ ' +
        (s.rapide ? 'Rapide' : 'Normal') + '</button>';
    }
    html += '</div>';

    // ---- message et actions ----
    var msg;
    if (s.finished) msg = 'Partie terminée !';
    else if (!mine) msg = enSolo ? nomC + ' joue…' : 'Au tour de ' + nomC + '…';
    else if (!rolled) msg = hotseat && s.players.length > 1 ? 'À toi, <b>' + nomC + '</b> : lance les dés !' : 'À vous : lancez les dés !';
    else if (s.rolls > 0) msg = 'Gardez des dés, relancez… ou marquez une case.';
    else msg = 'Plus de lancer : choisissez une case.';
    html += '<p class="mini-msg ym-msg">' + msg + '</p>';
    var peutAnnuler = an && s.rolls === 3 && !s.finished &&
      (ctx.mode === 'local' ? (hotseat || an.player === ctx.me) : an.player === ctx.me);
    html += '<div class="ym-actions">';
    if (sel && mine) {
      var pts = catScore(sel, s.dice), nomCat = CATS.filter(function (c) { return c.id === sel; })[0].nom;
      html += '<button class="btn big succes ym-valide" data-a="marque">✔ Marquer ' + pts + ' · ' + nomCat + '</button>' +
        '<button class="btn ym-mini" data-a="deselect" aria-label="Annuler la sélection">✕</button>';
    } else {
      html += '<button class="btn big primary ym-lance" data-a="roll"' + (mine && s.rolls > 0 ? '' : ' disabled') + '>🎲 ' +
        (s.rolls === 3 ? 'Lancer les dés' : 'Relancer') + ' <span class="ym-reste">' + '●●●'.slice(0, s.rolls) +
        '<i>' + '●●●'.slice(0, 3 - s.rolls) + '</i></span></button>';
      html += '<button class="btn ym-mini ym-secoue' + (secouerActif() ? ' on' : '') + '" data-a="secouer" aria-label="Secouer pour lancer">📳</button>';
    }
    html += '</div>';
    if (peutAnnuler) {
      var pa = s.players[an.player];
      html += '<button class="btn small ym-annule" data-a="annule">↩ Annuler ' +
        (an.player === ctx.me && !hotseat ? 'mon choix' : 'le choix de ' + GG.esc(pa.name)) + ' (' +
        CATS.filter(function (c) { return c.id === an.cat; })[0].nom + ' ' + pa.sheet[an.cat] + ')</button>';
    }

    // ---- la feuille de score ----
    var pv = s.players[vue];
    var jouable = mine && rolled && vue === s.current;
    var ligne = function (c) {
      var val = pv.sheet[c.id], cls = 'ym-ligne', droite;
      var deco = UPPER.indexOf(c.id) !== -1 ? '<span class="ym-mini-de d' + (UPPER.indexOf(c.id) + 1) + '"></span>' : '';
      if (val !== null) {
        cls += ' pleine' + (val === 0 ? ' zero' : '');
        if (s.dernierChoix && s.dernierChoix.player === vue && s.dernierChoix.cat === c.id) cls += ' derniere';
        droite = '<b>' + val + '</b>';
      } else if (jouable) {
        var pp = catScore(c.id, s.dice);
        cls += ' possible' + (pp ? '' : ' nul') + (sel === c.id ? ' choisie' : '');
        droite = '<b>' + (pp ? '+' + pp : '0') + '</b>';
      } else {
        cls += ' libre';
        droite = '<b>·</b>';
      }
      return '<button class="' + cls + '" data-cat="' + c.id + '"' + (jouable && val === null ? '' : ' tabindex="-1"') + '>' +
        '<span class="ym-nom' + (deco ? ' haut' : '') + '">' + deco + c.nom + (AIDE[c.id] && jouable && val === null ? '<small>' + AIDE[c.id] + '</small>' : '') +
        '</span>' + droite + '</button>';
    };
    var haut = hautDe(pv), manque = Math.max(0, 63 - haut);
    html += '<div class="ym-feuille"><div class="ym-col">' +
      CATS.slice(0, 6).map(ligne).join('') +
      '<div class="ym-sous"><span>Sous-total</span><b>' + haut + '<small>/63</small></b>' +
      '<i class="ym-barre"><i style="width:' + Math.min(100, Math.round(100 * haut / 63)) + '%"></i></i></div>' +
      '<div class="ym-bonus' + (haut >= 63 ? ' gagne' : '') + '"><span>Bonus</span><b>' +
      (haut >= 63 ? '+35 ✓' : 'encore ' + manque) + '</b></div></div>' +
      '<div class="ym-col">' + CATS.slice(6).map(ligne).join('') +
      '<div class="ym-total"><span>Total' + (s.players.length > 1 ? ' · ' + GG.esc(pv.name) : '') + '</span><b>' + totalOf(pv) + '</b></div></div></div>';
    html += '</div>';
    el.innerHTML = html;
    dernierEl = el;

    /* ---- interactions ----
       Anti double-appui : un seul acte par rendu, et le bouton « Lancer »
       qui réapparaît au même endroit n’est armé qu’après la retombée des dés. */
    var gen = (el._ymGen || 0) + 1;
    el._ymGen = gen;
    el._ymJoue = false;
    function agir(a) {
      if (el._ymGen !== gen || el._ymJoue) return false;
      el._ymJoue = true;
      var ok = ctx.act(a);
      if (ok === false) el._ymJoue = false;
      return ok;
    }
    var boutonLancer = el.querySelector('[data-a="roll"]');
    if (boutonLancer && !boutonLancer.disabled && (nouveauLancer || nouveauChoix)) {
      boutonLancer.disabled = true;
      setTimeout(function () { if (el._ymGen === gen) boutonLancer.disabled = false; }, nouveauLancer ? 650 : 400);
    }
    function lance() {
      if (!mine || s.rolls <= 0) return;
      if (boutonLancer && boutonLancer.disabled) return;
      sfx.play('dice');
      GG.haptic('medium');
      agir({ t: 'roll', n: s.rolls });
    }
    if (boutonLancer) boutonLancer.addEventListener('click', lance);
    el._ymSecoue = mine && s.rolls > 0 && secouerActif() ? lance : null;
    el.querySelectorAll('.ym-de').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!mine || !rolled || s.rolls === 0) {
          if (mine && s.rolls === 0) { fx.shake(b, 0.4); sfx.play('tock', { volume: 0.5 }); }
          return;
        }
        sfx.play('select');
        GG.haptic('select');
        agir({ t: 'hold', i: parseInt(b.dataset.die, 10) });
      });
    });
    function choisir(cat) {
      el._v2.sel = cat;
      rendu(el, ctx);
    }
    el.querySelectorAll('.ym-ligne.possible').forEach(function (b) {
      b.addEventListener('click', function () {
        var cat = b.getAttribute('data-cat');
        if (sel === cat) { valider(cat); return; } // second toucher : on confirme
        sfx.play('tap');
        GG.haptic('select');
        choisir(cat);
      });
    });
    function valider(cat) {
      var pts = catScore(cat, s.dice);
      sfx.play(pts ? 'coin' : 'tock');
      GG.haptic(pts ? 'success' : 'light');
      agir({ t: 'score', cat: cat });
    }
    el.querySelectorAll('[data-a]').forEach(function (b) {
      var a = b.getAttribute('data-a');
      if (a === 'roll') return;
      b.addEventListener('click', function () {
        if (a === 'marque' && sel) valider(sel);
        else if (a === 'deselect') { sfx.play('back'); choisir(null); }
        else if (a === 'annule') { sfx.play('erase'); agir({ t: 'annule' }); }
        else if (a === 'vitesse') { sfx.play('toggle'); agir({ t: 'vitesse', rapide: !s.rapide }); }
        else if (a === 'secouer') basculeSecousse(b);
      });
    });
    el.querySelectorAll('[data-vue]').forEach(function (b) {
      b.addEventListener('click', function () {
        sfx.play('tap');
        el._v2.vue = parseInt(b.getAttribute('data-vue'), 10);
        rendu(el, ctx);
      });
    });
    function basculeSecousse(b) {
      var on = !secouerActif();
      var go = function () {
        try { GG.reglages.set('yams-secouer', on); } catch (e) {}
        b.classList.toggle('on', on);
        sfx.play('toggle');
        if (on && !ecouteSecousse && typeof window !== 'undefined') {
          window.addEventListener('devicemotion', secousse);
          ecouteSecousse = true;
        }
        el._ymSecoue = on && mine && s.rolls > 0 ? lance : null;
      };
      // iOS : l’accès aux capteurs se demande sur un geste
      var DM = typeof window !== 'undefined' ? window.DeviceMotionEvent : null;
      if (on && DM && typeof DM.requestPermission === 'function') {
        DM.requestPermission().then(function (r) { if (r === 'granted') go(); }, function () {});
      } else go();
    }
    if (secouerActif() && !ecouteSecousse && typeof window !== 'undefined') {
      window.addEventListener('devicemotion', secousse);
      ecouteSecousse = true;
    }

    /* ---- effets ---- */
    // les dés gardés/relâchés glissent de leur ancienne place (FLIP)
    if (avant && !fx.reduced()) {
      el.querySelectorAll('.ym-de:not(.roule)').forEach(function (d) {
        var a = anciensDes[d.getAttribute('data-die')];
        if (!a || !d.animate) return;
        var b = d.getBoundingClientRect();
        var dx = a.left - b.left, dy = a.top - b.top;
        if (Math.abs(dx) + Math.abs(dy) < 2) return;
        d.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'none' }],
          { duration: 320, easing: 'cubic-bezier(.34,1.56,.64,1)' });
      });
    }
    if (nouveauJournal) sfx.play('dice', { volume: 0.8 });
    if (nouveauLancer && rolled) {
      if (!mine) sfx.play('dice', { volume: 0.8 });
      var c = counts(s.dice);
      if (c.some(function (n) { return n === 5; })) {
        // YAMS !
        setTimeout(function () {
          if (el._ymGen !== gen) return;
          var table = el.querySelector('.ym-table');
          sfx.play('fanfare');
          GG.haptic('success');
          fx.floatText(table, 'YAMS !', { color: '#ffd23f', size: 54, duration: 1800 });
          fx.confetti({ count: 120, from: table });
          if (table) table.classList.add('yams');
        }, fx.reduced() ? 0 : 700);
      }
    }
    if (nouveauChoix) {
      var dc = s.dernierChoix, cible = el.querySelector('.ym-ligne.derniere') ||
        el.querySelector('.ym-onglet[data-vue="' + dc.player + '"]');
      setTimeout(function () {
        if (el._ymGen !== gen) return;
        if (nouveauJournal || (!hotseat && dc.player !== ctx.me)) sfx.play(dc.points ? 'coin' : 'tock', { volume: 0.8 });
        if (cible) fx.floatText(cible, (dc.points ? '+' + dc.points : '0'), { color: dc.points ? '#7dffb0' : '#b9bde0', size: 24 });
        var onglet = el.querySelector('.ym-onglet[data-vue="' + dc.player + '"]');
        if (onglet) fx.pop(onglet);
        var p2 = s.players[dc.player];
        if (UPPER.indexOf(dc.cat) !== -1 && hautDe(p2) >= 63 && hautDe(p2) - dc.points < 63) {
          sfx.play('success');
          fx.floatText(el.querySelector('.ym-bonus') || cible, '+35 bonus !', { color: '#ffd23f', size: 26 });
          fx.burst(el.querySelector('.ym-bonus'), { count: 20, shape: 'star' });
        }
        if (dc.cat === 'yams' && dc.points === 50) fx.burst(cible, { count: 26, shape: 'star' });
      }, nouveauJournal ? 420 : 60);
    }
  }

  GG.register(mod);
  if (typeof module === 'object' && module.exports) module.exports = mod;
})(typeof self !== 'undefined' ? self : globalThis);
