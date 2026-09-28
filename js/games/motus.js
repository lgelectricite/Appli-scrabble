/* GGgames — Le Mot Mystère (type Motus / SUTOM : 1 à 4 joueurs). V2.

   Trois façons de jouer :
   - ♾️ Illimité : série SANS FIN, essais illimités (la formule d’origine) ;
   - 🎯 6 essais : partie en 5 mots, 6 essais par mot (comme à la télé) ;
   - 📅 Défi du jour : le MÊME mot pour tout le monde, calculé depuis la date
     (hors ligne), 6 essais, statistiques et partage en émojis.
   La première lettre est offerte (esprit jeu télé) et chaque essai doit
   commencer par elle. À plusieurs, le même mot s’affiche chez tout le monde
   et on propose chacun son tour : le premier qui trouve marque le point.

   Sécurité : tout ce qui vient de l’état (lettres, marques, prénoms…) est
   filtré (lettres A-Z, marques par liste blanche) ou échappé avant d’entrer
   dans le HTML — un hôte malveillant ne peut rien injecter chez un invité. */
(function (root) {
  'use strict';
  var GG = root.GG;

  var LEVELS = {
    facile: { nom: 'Facile', len: 5 },
    moyen: { nom: 'Moyen', len: 6 },
    difficile: { nom: 'Difficile', len: 7 }
  };
  var MODES = {
    serie: { nom: 'Illimité', ic: '♾️', essais: 0, mots: 0 },
    classique: { nom: '6 essais', ic: '🎯', essais: 6, mots: 5 },
    jour: { nom: 'Défi du jour', ic: '📅', essais: 6, mots: 1 }
  };
  /* secours si la liste partagée manquait (jamais en temps normal) */
  var FALLBACK = {
    5: ['CHIEN', 'PLAGE', 'FLEUR', 'TIGRE', 'SUCRE', 'NUAGE', 'PIANO', 'ROUTE', 'VERRE', 'POMME'],
    6: ['MAISON', 'JARDIN', 'SOLEIL', 'BATEAU', 'ORANGE', 'CERISE', 'BANANE', 'VIOLON', 'TRESOR', 'CHEVAL'],
    7: ['CHATEAU', 'MUSIQUE', 'PLANETE', 'MONTRES', 'CUISINE', 'FROMAGE', 'LUMIERE', 'TEMPETE', 'HORIZON', 'BALEINE']
  };
  var PCOLORS = ['#2fd4ff', '#ff5cb0', '#ffc23d', '#b28cff'];

  /* Niveaux de l’adversaire IA. Aucun ne regarde le mot secret : l’IA part
     des couleurs affichées, comme un humain, avec SON vocabulaire (les formes
     les plus parlées du français, conjugaisons et pluriels compris : elle ne
     connaît pas la liste des mots secrets, sauf en « difficile »).
     - vocab : taille du vocabulaire (mots les plus courants d’abord) ;
     - jaunes / gris : probabilité de tenir compte des lettres mal placées /
       absentes d’un essai (les étourderies d’un joueur pressé) ;
     - rappel : part de son vocabulaire qui lui vient à l’esprit à chaque tour ;
     - memoire : nombre d’essais récents dont elle se souvient ;
     - flair : elle devine que le mot secret est un mot « de base » (nom,
       adjectif, verbe à l’infinitif) et le préfère (en « difficile », elle
       connaît la liste des mots secrets) ;
     - glouton : elle propose le mot le plus vraisemblable (en duel, tester
       des lettres aiderait aussi l’adversaire, qui voit le même tableau) ;
     - info : (option) elle choisit l’essai qui teste le plus de lettres utiles.
     Mesures (tests/test_v2_mots.js, duels simulés contre un joueur moyen) :
     l’IA gagne ≈ 28 % en facile, ≈ 47 % en moyen, ≈ 74 % en difficile. */
  var NIVEAUX_IA = {
    facile: { vocab: { 5: 900, 6: 1100, 7: 1100 }, rappel: 0.5, jaunes: 0.6, gris: 0.35, memoire: 2, flair: 0 },
    moyen: { vocab: { 5: 1700, 6: 2100, 7: 2100 }, rappel: 0.45, jaunes: 0.9, gris: 0.75, memoire: 4, flair: 1 },
    difficile: { vocab: { 5: 2400, 6: 3000, 7: 3000 }, rappel: 0.9, jaunes: 1, gris: 1, memoire: 99, flair: 8, glouton: true }
  };

  /* ================= les listes de mots ================= */

  function secrets(len) {
    var l = GG.MOTS_MYSTERE && GG.MOTS_MYSTERE[len];
    return l && l.length > 30 ? l : (FALLBACK[len] || FALLBACK[5]);
  }
  function vocab(len) {
    var v = GG.MOTS_VOCAB && GG.MOTS_VOCAB[len];
    return v && v.length > 30 ? v : secrets(len);
  }
  var ensembles = {};
  function ensemble(nom, liste) {
    if (!ensembles[nom]) {
      var o = {};
      for (var i = 0; i < liste.length; i++) o[liste[i]] = true;
      ensembles[nom] = o;
    }
    return ensembles[nom];
  }
  /* sans dictionnaire : on accepte les mots de la liste du jeu */
  function motDuJeu(len, w) {
    if (ensemble('v' + len, vocab(len))[w] || ensemble('s' + len, secrets(len))[w]) return true;
    return !!(GG.MOTS_COURANTS && ensemble('c', GG.MOTS_COURANTS)[w]);
  }
  function dicoPret(ctx) {
    return !!(ctx && ctx.dict && ctx.dict.set && ctx.dict.set.size);
  }

  /* 2 = bien placée, 1 = présente ailleurs, 0 = absente (gestion des doublons) */
  function marks(secret, guess) {
    var m = [];
    var rest = {};
    var i;
    for (i = 0; i < guess.length; i++) m.push(0);
    for (i = 0; i < secret.length; i++) {
      if (guess[i] === secret[i]) m[i] = 2;
      else rest[secret[i]] = (rest[secret[i]] || 0) + 1;
    }
    for (i = 0; i < guess.length; i++) {
      if (m[i] === 0 && rest[guess[i]]) {
        m[i] = 1;
        rest[guess[i]]--;
      }
    }
    return m;
  }

  /* ================= le défi du jour (même mot pour tous) ================= */

  function deux(n) { return (n < 10 ? '0' : '') + n; }
  function jourCle(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + deux(d.getMonth() + 1) + '-' + deux(d.getDate());
  }
  function numeroJour(cle) {
    var p = String(cle).split('-');
    return Math.floor(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000);
  }
  /* Longueur tournante (6, 5, 7…) et parcours des 900 mots les plus courants
     de chaque longueur par un pas premier : aucun mot ne revient avant des
     années, et tout le monde a le même mot le même jour, sans Internet. */
  function motDuJour(cle) {
    var d = numeroJour(cle);
    if (!isFinite(d)) d = 0;
    var len = [6, 5, 7][((d % 3) + 3) % 3];
    var liste = secrets(len);
    var n = Math.min(liste.length, 900);
    var k = Math.floor(d / 3);
    return liste[(((k * 7919 + 131) % n) + n) % n];
  }

  /* ================= tirage sans répétition ================= */

  var CLE_VUS = 'gg-motus-vus-';
  function stockage() {
    try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; }
  }
  function historique(len) {
    var ls = stockage();
    if (!ls) return [];
    try {
      var h = JSON.parse(ls.getItem(CLE_VUS + len) || '[]');
      return Array.isArray(h) ? h : [];
    } catch (e) { return []; }
  }
  /* mémorise localement les mots déjà sortis (85 % de la liste au plus :
     les plus anciens redeviennent possibles quand presque tout est sorti) */
  function memorise(len, w) {
    var ls = stockage();
    if (!ls) return;
    try {
      var h = historique(len);
      h.push(w);
      var max = Math.floor(secrets(len).length * 0.85);
      if (h.length > max) h = h.slice(h.length - max);
      ls.setItem(CLE_VUS + len, JSON.stringify(h));
    } catch (e) {}
  }
  function pickSecret(state, len) {
    var pool = secrets(len);
    var dejaPartie = {};
    (state && Array.isArray(state.vus) ? state.vus : []).forEach(function (w) { dejaPartie[w] = true; });
    var exclus = {};
    historique(len).forEach(function (w) { exclus[w] = true; });
    try { exclus[motDuJour(jourCle())] = true; } catch (e) {} // on ne gâche pas le défi du jour
    var libres = pool.filter(function (w) { return !dejaPartie[w] && !exclus[w]; });
    if (!libres.length) libres = pool.filter(function (w) { return !dejaPartie[w]; });
    if (!libres.length) libres = pool;
    return libres[Math.floor(Math.random() * libres.length)];
  }

  function newWord(state) {
    var w = state.mode === 'jour' ? motDuJour(state.jour) : pickSecret(state, state.length);
    state.secret = w;
    state.length = w.length;
    state.first = w.charAt(0);
    if (!Array.isArray(state.vus)) state.vus = [];
    state.vus.push(w);
    if (state.mode !== 'jour') memorise(w.length, w);
    state.tries = [];
    state.foundBy = -1;
    state.turn = state.starter;
    state.phase = 'play';
    state.roundTs = Date.now();
    state.revealSec = 0;
  }

  /* ================= l’IA : un joueur qui raisonne sur les couleurs ================= */

  function compte(w, c) {
    var n = 0;
    for (var i = 0; i < w.length; i++) if (w[i] === c) n++;
    return n;
  }
  /* w est-il compatible avec ce que l’IA retient de l’essai r ? */
  function compatible(w, r) {
    var g = r.word, m = r.marks, i;
    if (r.jaunes && r.gris) {
      var mm = marks(w, g);
      for (i = 0; i < mm.length; i++) if (mm[i] !== m[i]) return false;
      return true;
    }
    for (i = 0; i < g.length; i++) {
      if (m[i] === 2 && w[i] !== g[i]) return false;
    }
    for (i = 0; i < g.length; i++) {
      var c = g[i];
      if (m[i] === 2) continue;
      var vus = 0;
      for (var j = 0; j < g.length; j++) if (g[j] === c && m[j] > 0) vus++;
      if (m[i] === 1 && r.jaunes) {
        if (w[i] === c || compte(w, c) < vus) return false;
      } else if (m[i] === 0 && r.gris) {
        if (w[i] === c || compte(w, c) > vus) return false;
      }
    }
    return true;
  }

  /* Choisit le prochain essai de l’IA à partir de ce qui est PUBLIC
     (longueur, première lettre, essais affichés). rnd : hasard injectable. */
  function choixIA(vue, niveau, ctx, rnd) {
    rnd = rnd || Math.random;
    var P = NIVEAUX_IA[niveau] || NIVEAUX_IA.moyen;
    var L = vue.length, F = vue.first;
    var voc = vocab(L);
    var n = Math.min(voc.length, P.vocab[L] || P.vocab[5]);
    var dico = dicoPret(ctx) ? ctx.dict.set : null;
    var deja = {};
    var tries = Array.isArray(vue.tries) ? vue.tries : [];
    tries.forEach(function (t) { deja[t.word] = true; });
    var essais = tries.slice(Math.max(0, tries.length - P.memoire));
    var regles = essais.map(function (t) {
      return { word: t.word, marks: t.marks, jaunes: rnd() < P.jaunes, gris: rnd() < P.gris };
    });
    var secretsL = P.flair ? ensemble('s' + L, secrets(L)) : null;
    function valable(w) {
      return w && w.length === L && w.charAt(0) === F && !deja[w] && (!dico || dico.has(w));
    }
    function filtre(rs) {
      var out = [];
      for (var i = 0; i < n; i++) {
        var w = voc[i];
        if (!valable(w)) continue;
        if (P.rappel < 1 && rnd() > P.rappel) continue; // ce mot-là ne lui vient pas à l’esprit
        var ok = true;
        for (var k = 0; k < rs.length && ok; k++) ok = compatible(w, rs[k]);
        if (ok) out.push(i);
      }
      return out;
    }
    var cand = filtre(regles);
    if (!cand.length) {
      // trop de contraintes pour son vocabulaire : elle ne garde que les vertes
      cand = filtre(regles.map(function (r) { return { word: r.word, marks: r.marks, jaunes: false, gris: false }; }));
    }
    if (!cand.length) cand = filtre([]);
    if (!cand.length) {
      // dernier recours : n’importe quel mot connu qui commence par la bonne lettre
      var tous = secrets(L).concat(voc);
      for (var q = 0; q < tous.length; q++) if (valable(tous[q])) return tous[q];
      if (dico && dico.forEach) {
        var trouve = null;
        dico.forEach(function (w) { if (!trouve && valable(w) && /^[A-Z]+$/.test(w)) trouve = w; });
        return trouve;
      }
      return null;
    }
    // poids : les mots courants viennent plus vite à l’esprit ; le « flair »
    // fait préférer les mots de base (ceux qu’on choisit comme mots secrets)
    function poids(i) {
      var p = 1 / (1 + i / 400);
      if (secretsL && secretsL[voc[i]]) p *= 1 + P.flair;
      return p;
    }
    if (P.info && cand.length > 2 && tries.length < 5) {
      // le plus informatif parmi les candidats : lettres fréquentes aux
      // positions encore inconnues, sans doublon, pondéré par la vraisemblance
      var connues = {};
      tries.forEach(function (t) {
        for (var z = 0; z < t.marks.length; z++) if (t.marks[z] === 2) connues[z] = true;
      });
      var freq = {}, total = 0;
      var echantillon = cand.length > 400 ? cand.slice(0, 400) : cand;
      echantillon.forEach(function (i) {
        var w = voc[i], vu = {};
        for (var z = 1; z < L; z++) {
          if (connues[z] || vu[w[z]]) continue;
          vu[w[z]] = true;
          freq[w[z]] = (freq[w[z]] || 0) + 1;
        }
        total++;
      });
      var meilleur = -1, score = -1;
      echantillon.forEach(function (i) {
        var w = voc[i], vu = {}, sc = 0;
        for (var z = 1; z < L; z++) {
          if (connues[z] || vu[w[z]]) continue;
          vu[w[z]] = true;
          var f = (freq[w[z]] || 0) / total;
          sc += f * (1 - f);
        }
        sc = sc * (0.6 + 0.4 * poids(i)) * (0.9 + 0.2 * rnd());
        if (sc > score) { score = sc; meilleur = i; }
      });
      return voc[meilleur];
    }
    if (P.glouton) {
      // le mot le plus vraisemblable (avec une pointe de hasard entre ex æquo)
      var best = -1, bestP = -1;
      cand.forEach(function (i) {
        var p = poids(i) * (0.85 + 0.3 * rnd());
        if (p > bestP) { bestP = p; best = i; }
      });
      return voc[best];
    }
    var somme = 0;
    var ps = cand.map(function (i) { var p = poids(i); somme += p; return p; });
    var x = rnd() * somme;
    for (var c = 0; c < cand.length; c++) {
      x -= ps[c];
      if (x <= 0) return voc[cand[c]];
    }
    return voc[cand[cand.length - 1]];
  }

  /* ================= outils d’affichage sûrs ================= */

  function ent(x, d) {
    x = Number(x);
    return isFinite(x) ? Math.floor(x) : (d || 0);
  }
  function lettreSure(c) { return /^[A-Z]$/.test(c) ? c : '?'; }
  var CL_MARQUE = ['m0', 'm1', 'm2']; // liste blanche : jamais de valeur brute dans une classe
  function clMarque(m) { return CL_MARQUE[m === 2 ? 2 : (m === 1 ? 1 : 0)]; }
  function motSur(w, len) {
    var s = String(w == null ? '' : w);
    var out = [];
    for (var i = 0; i < len; i++) out.push(lettreSure(s.charAt(i)));
    return out;
  }
  function fmt(sec) {
    sec = Math.max(0, ent(sec));
    var m = Math.floor(sec / 60);
    return (m ? m + ' min ' : '') + (sec % 60) + ' s';
  }
  function nomJoueur(s, i) {
    var p = s.players && s.players[i];
    return p ? String(p.name == null ? '' : p.name) : '?';
  }
  function lire(cle, def) {
    var ls = stockage();
    if (!ls) return def;
    try { var v = JSON.parse(ls.getItem(cle) || 'null'); return v == null ? def : v; } catch (e) { return def; }
  }
  function ecrire(cle, v) {
    var ls = stockage();
    if (!ls) return;
    try { ls.setItem(cle, JSON.stringify(v)); } catch (e) {}
  }
  function jouer(nom, o) { try { GG.sfx.play(nom, o); } catch (e) {} }
  function vibrer(t) { try { GG.haptic(t); } catch (e) {} }

  /* ================= statistiques (solo, sur ce téléphone) ================= */

  var CLE_STATS = 'gg-motus-stats';
  function statsVides() {
    return {
      classique: { j: 0, g: 0, serie: 0, max: 0, d: [0, 0, 0, 0, 0, 0] },
      jour: { j: 0, g: 0, serie: 0, max: 0, d: [0, 0, 0, 0, 0, 0], dernier: '' },
      serie: { mots: 0, essais: 0, best: 0 }
    };
  }
  function lisStats() {
    var s = lire(CLE_STATS, null), v = statsVides();
    if (!s || typeof s !== 'object') return v;
    ['classique', 'jour', 'serie'].forEach(function (k) {
      if (s[k] && typeof s[k] === 'object') {
        for (var c in v[k]) if (Object.prototype.hasOwnProperty.call(s[k], c)) v[k][c] = s[k][c];
      }
    });
    return v;
  }
  function veille(cle) {
    var d = numeroJour(cle) - 1;
    var dt = new Date(d * 86400000);
    return dt.getUTCFullYear() + '-' + deux(dt.getUTCMonth() + 1) + '-' + deux(dt.getUTCDate());
  }
  /* enregistre la fin d’un mot joué seul (une seule fois par mot) */
  function enregistre(s) {
    var cle = String(ent(s.roundTs)) + ':' + ent(s.round);
    if (lire('gg-motus-enreg', '') === cle) return false;
    ecrire('gg-motus-enreg', cle);
    var st = lisStats();
    var gagne = s.foundBy === 0;
    var n = s.tries.length;
    if (s.mode === 'serie') {
      if (gagne) {
        st.serie.mots++;
        st.serie.essais += n;
        if (!st.serie.best || n < st.serie.best) st.serie.best = n;
      }
    } else {
      var b = st[s.mode === 'jour' ? 'jour' : 'classique'];
      b.j++;
      if (gagne) {
        b.g++;
        if (s.mode === 'jour' && b.dernier && b.dernier !== veille(s.jour)) b.serie = 0;
        b.serie++;
        b.max = Math.max(b.max, b.serie);
        if (n >= 1 && n <= 6) b.d[n - 1]++;
      } else {
        b.serie = 0;
      }
      if (s.mode === 'jour') {
        b.dernier = s.jour;
        ecrire('gg-motus-jour', {
          date: s.jour, gagne: gagne, essais: n, len: s.length,
          grille: s.tries.map(function (t) { return t.marks; })
        });
      }
    }
    ecrire(CLE_STATS, st);
    return true;
  }

  /* ================= partage en émojis ================= */

  var EMO = ['⬛', '🟡', '🟩'];
  function texteDePartage(s) {
    var m = MODES[s.mode] || MODES.serie;
    var tete = 'Mot Mystère ' + m.ic;
    if (s.mode === 'jour') {
      var p = String(s.jour || '').split('-');
      tete += ' ' + (p[2] || '') + '/' + (p[1] || '') + '/' + (p[0] || '');
    } else {
      tete += ' ' + ent(s.length) + ' lettres';
    }
    var n = s.tries.length;
    tete += ' — ' + (s.foundBy >= 0 ? n : 'X') + (m.essais ? '/' + m.essais : ' essai' + (n > 1 ? 's' : ''));
    var lignes = s.tries.map(function (t) {
      return t.marks.map(function (x) { return EMO[x === 2 ? 2 : (x === 1 ? 1 : 0)]; }).join('');
    });
    return tete + '\n' + lignes.join('\n') + '\n🎮 GGgames';
  }
  function copie(texte, bouton) {
    function ok() {
      if (!bouton) return;
      bouton.textContent = '✅ Copié !';
      jouer('pop');
      vibrer('light');
      try { GG.fx.pop(bouton); } catch (e) {}
    }
    function secours() {
      try {
        var ta = document.createElement('textarea');
        ta.value = texte;
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      } catch (e) {}
      ok();
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(texte).then(ok, secours);
        return;
      }
    } catch (e) {}
    secours();
  }

  /* ================= le module ================= */

  var mod = {
    id: 'motus',
    nom: 'Mot Mystère',
    icone: '🟩',
    niveaux: ['facile', 'moyen', 'difficile'],
    desc: 'Devinez le mot grâce aux couleurs, première lettre offerte. Défi du jour, 6 essais ou série illimitée. À plusieurs : même mot pour tous, chacun son tour !',
    regles: '<p><strong>🎯 Le but :</strong> deviner le mot secret grâce aux indices. La <strong>première lettre est offerte</strong> et chaque essai doit commencer par elle.</p>' +
      '<p><strong>Les indices :</strong> <strong>case verte pleine</strong> = lettre bien placée · <strong>rond jaune</strong> = lettre présente ailleurs · case sombre = lettre absente. Proposez de vrais mots du dictionnaire.</p>' +
      '<p><strong>Trois façons de jouer :</strong> 📅 <strong>Défi du jour</strong> (le même mot pour tout le monde, un par jour, avec statistiques et partage) · 🎯 <strong>6 essais</strong> (partie en 5 mots) · ♾️ <strong>Illimité</strong> (série sans fin, essais illimités).</p>' +
      '<p><strong>👥 À plusieurs :</strong> le même mot s’affiche chez tout le monde et on propose chacun son tour — le premier qui trouve marque le point.</p>' +
      '<p><strong>🤖 Contre l’ordinateur :</strong> il raisonne sur les couleurs comme vous, avec son propre vocabulaire. En « facile » il est distrait, en « difficile » il vous fera transpirer.</p>',
    min: 1, max: 4,
    hotseat: true, hotseatMax: 4, hidden: false, netOnly: false,

    create: function (names, ctx) {
      return {
        players: names.map(function (n) {
          return { name: n, wins: 0 };
        }),
        phase: 'setup',
        mode: 'serie',
        level: null,
        length: 0,
        secret: null,
        first: '',
        tries: [],      // PARTAGÉ : chaque essai porte son auteur
        turn: 0,
        starter: 0,
        foundBy: -1,
        round: 1,
        roundTs: 0,
        revealSec: 0,
        vus: [],        // mots déjà sortis dans cette partie (jamais deux fois)
        jour: '',
        dicoOk: dicoPret(ctx),
        finished: false
      };
    },

    turnOf: function (state) { return state.phase === 'play' ? state.turn : -1; },
    over: function (state) { return !!state.finished; },
    scoreOf: function (state, i) { return '✓ ' + state.players[i].wins; },

    gagnants: function (state) {
      var P = state.players;
      if (P.length === 1) {
        if (state.mode === 'classique') return P[0].wins >= 3 ? [0] : null;
        return P[0].wins > 0 ? [0] : null;
      }
      if (state.mode === 'jour') return state.foundBy >= 0 ? [state.foundBy] : null;
      var max = -1;
      P.forEach(function (p) { max = Math.max(max, p.wins); });
      if (max <= 0) return null;
      var g = [];
      P.forEach(function (p, i) { if (p.wins === max) g.push(i); });
      return g.length === 1 ? g : [];
    },

    summary: function (state) {
      var mode = MODES[state.mode] || MODES.serie;
      var rows = state.players.map(function (p) {
        return { n: p.name, w: ent(p.wins) };
      }).sort(function (a, b) { return b.w - a.w; });
      var html = '';
      if (state.mode === 'jour') {
        html += '<p>' + mode.ic + ' ' + mode.nom + ' : le mot était <strong>' +
          GG.esc(state.secret || '') + '</strong>' +
          (state.foundBy >= 0 ? ' — trouvé en ' + state.tries.length + '/6.' : '.') + '</p>';
      }
      html += rows.map(function (r) {
        return '<div class="final-line"><span>' + GG.esc(r.n) + '</span><strong>' +
          r.w + ' mot' + (r.w > 1 ? 's' : '') + ' trouvé' + (r.w > 1 ? 's' : '') + '</strong></div>';
      }).join('');
      if (state.players.length > 1 && rows[0].w > 0) {
        var top = rows.filter(function (r) { return r.w === rows[0].w; });
        html += '<h1>🏆 ' + top.map(function (r) { return GG.esc(r.n); }).join(' & ') + '</h1>';
      }
      return html;
    },

    /* le tableau est public (même mot, essais visibles de tous) :
       seul le secret reste caché tant qu’il n’est pas révélé */
    redact: function (state) {
      var copy = GG.clone(state);
      if (copy.phase !== 'reveal' && copy.phase !== 'fin') delete copy.secret;
      delete copy.vus;
      return copy;
    },

    apply: function (state, player, action, ctx) {
      if (state.finished) return { ok: false, error: 'Partie terminée.' };
      if (action.t === 'level') {
        if (state.phase !== 'setup') return { ok: false, error: 'Niveau déjà choisi.' };
        if (player !== 0) return { ok: false, error: 'L’hôte choisit le niveau.' };
        var m = action.m || 'serie';
        if (!MODES[m]) return { ok: false, error: 'Mode inconnu.' };
        state.mode = m;
        state.dicoOk = dicoPret(ctx);
        if (m === 'jour') {
          state.jour = jourCle();
          var w0 = motDuJour(state.jour);
          state.length = w0.length;
          state.level = w0.length === 5 ? 'facile' : (w0.length === 6 ? 'moyen' : 'difficile');
        } else {
          if (!LEVELS[action.l]) return { ok: false, error: 'Niveau inconnu.' };
          state.level = action.l;
          state.length = LEVELS[action.l].len;
        }
        newWord(state);
        return { ok: true };
      }
      if (action.t === 'next') {
        if (state.phase !== 'reveal') return { ok: false, error: 'Le mot n’est pas encore révélé.' };
        if (player !== 0) return { ok: false, error: 'L’hôte lance le mot suivant.' };
        var md = MODES[state.mode] || MODES.serie;
        if (md.mots && state.round >= md.mots) {
          // dernière manche jouée : fin de partie (le compteur reste à N / N)
          state.phase = 'fin';
          state.finished = true;
          return { ok: true };
        }
        state.round++;
        state.starter = (state.starter + 1) % state.players.length;
        newWord(state);
        return { ok: true };
      }
      if (state.phase !== 'play') return { ok: false, error: 'La partie n’a pas commencé.' };
      if (action.t === 'guess') {
        if (player !== state.turn) return { ok: false, error: 'Ce n’est pas votre tour.' };
        var word = String(action.w || '').toUpperCase();
        if (word.length !== state.length) {
          return { ok: false, error: 'Il faut un mot de ' + state.length + ' lettres.' };
        }
        if (!/^[A-Z]+$/.test(word)) return { ok: false, error: 'Lettres uniquement.' };
        if (state.first && word.charAt(0) !== state.first) {
          return { ok: false, error: 'Le mot commence par « ' + state.first + ' ».' };
        }
        if (state.tries.some(function (t) { return t.word === word; })) {
          return { ok: false, error: '« ' + word + ' » a déjà été proposé.' };
        }
        var dicoOk = dicoPret(ctx);
        state.dicoOk = dicoOk;
        if (dicoOk ? !ctx.dict.set.has(word) : !motDuJeu(state.length, word)) {
          return {
            ok: false, error: dicoOk ? '« ' + word + ' » n’est pas dans le dictionnaire.'
              : '« ' + word + ' » n’est pas dans la liste de mots du jeu (dictionnaire indisponible).'
          };
        }
        var mk = marks(state.secret, word);
        state.tries.push({ word: word, marks: mk, by: player });
        var maxE = (MODES[state.mode] || MODES.serie).essais;
        if (word === state.secret) {
          state.foundBy = player;
          state.players[player].wins++;
          state.phase = 'reveal';
          state.revealSec = Math.max(1, Math.round((Date.now() - state.roundTs) / 1000));
        } else if (maxE && state.tries.length >= maxE) {
          state.foundBy = -1; // personne n’a trouvé : le mot est révélé
          state.phase = 'reveal';
          state.revealSec = Math.max(1, Math.round((Date.now() - state.roundTs) / 1000));
        } else {
          state.turn = (state.turn + 1) % state.players.length;
        }
        return { ok: true };
      }
      return { ok: false, error: 'Action inconnue.' };
    },

    /* L’adversaire IA joue à son tour sur le tableau commun. Il ne voit que
       ce qui est public (longueur, première lettre, essais affichés) : le
       secret n’est même pas transmis à son raisonnement. */
    bot: function (state, me, ctx) {
      if (state.phase !== 'play') return null; // niveau / révélation : à l’hôte
      if (state.turn !== me) return null;      // chacun son tour !
      var vue = {
        length: state.length,
        first: state.first || '',
        tries: (state.tries || []).map(function (t) { return { word: t.word, marks: t.marks }; })
      };
      var niveau = (ctx && ctx.niveau) || state.niveauIA || 'moyen';
      var w = choixIA(vue, niveau, ctx);
      return w ? { t: 'guess', w: w } : null;
    },

    render: function (el, ctx) {
      el._motCtx = ctx;
      installeClavierPhysique(el);
      if (ctx.state.phase === 'setup') renderAccueil(el, ctx);
      else renderJeu(el, ctx);
    },

    _marks: marks, _pickSecret: pickSecret, _motDuJour: motDuJour, _jourCle: jourCle,
    _choixIA: choixIA, _NIVEAUX_IA: NIVEAUX_IA, _texteDePartage: texteDePartage,
    _motDuJeu: motDuJeu // tests
  };

  /* ================= écran d’accueil du jeu : mode et longueur ================= */

  function renderAccueil(el, ctx) {
    var s = ctx.state;
    var multi = s.players.length > 1;
    el._mm = null;
    var html = '<div class="mot-accueil">' +
      '<div class="mot-titre" aria-hidden="true">' +
      'MOT'.split('').map(function (c, i) {
        return '<span class="mot-cell ' + (i === 1 ? 'm1' : 'm2') + '" style="--i:' + i + '"><span>' + c + '</span></span>';
      }).join('') + '<span class="mot-titre-q">?</span></div>';
    if (!s.dicoOk) html += noticeDico();
    if (ctx.me !== 0) {
      html += '<p class="waiting">⏳ ' + GG.esc(nomJoueur(s, 0)) + ' choisit le mode de jeu…</p></div>';
      el.innerHTML = html;
      return;
    }
    var mode = el._motMode || lire('gg-motus-mode', 'serie');
    if (mode !== 'serie' && mode !== 'classique') mode = 'serie';
    el._motMode = mode;
    // le défi du jour : déjà relevé aujourd’hui (seul) ?
    var aujourdhui = jourCle();
    var fait = lire('gg-motus-jour', null);
    var dejaFait = !multi && fait && fait.date === aujourdhui;
    var lenJour = motDuJour(aujourdhui).length;
    html += '<button class="mot-jour' + (dejaFait ? ' fait' : '') + '" data-mode="jour">' +
      '<span class="mot-jour-ic">📅</span><span class="mot-jour-tx"><span class="mot-jour-t">Défi du jour</span>' +
      '<span class="mot-jour-s">' + (dejaFait
        ? (fait.gagne ? '✅ Réussi en ' + ent(fait.essais) + '/6' : '❌ Raté aujourd’hui') + ' · revenez demain'
        : 'Le même mot pour tout le monde · ' + lenJour + ' lettres · 6 essais') + '</span></span>' +
      '<span class="mot-jour-go">' + (dejaFait ? '📊' : '▶') + '</span></button>';
    html += '<div class="mot-sep"><span>ou une partie libre</span></div>' +
      '<div class="mot-modes" role="radiogroup" aria-label="Mode de jeu">' +
      ['serie', 'classique'].map(function (k) {
        var M = MODES[k];
        return '<button class="mot-mode' + (k === mode ? ' actif' : '') + '" role="radio" aria-checked="' +
          (k === mode) + '" data-m="' + k + '"><span class="mm-ic">' + M.ic + '</span><span class="mm-t">' +
          (k === 'serie' ? 'Illimité' : '6 essais') + '</span><span class="mm-s">' +
          (k === 'serie' ? 'série sans fin' : 'partie en 5 mots') + '</span></button>';
      }).join('') + '</div>' +
      '<div class="lvl-btns mot-lvls">' +
      Object.keys(LEVELS).map(function (l, i) {
        return '<button class="btn big mot-lvl" data-lvl="' + l + '" style="--i:' + i + '">' +
          '<span class="mot-lvl-n">' + LEVELS[l].len + '</span><span class="mot-lvl-t">lettres' +
          '<small>' + (l === 'facile' ? '😌 Facile' : l === 'moyen' ? '🙂 Moyen' : '😈 Difficile') + '</small></span></button>';
      }).join('') + '</div>' +
      '<div class="mot-legende">' +
      '<span><span class="mot-cell mini m2"><span>A</span></span> bien placée</span>' +
      '<span><span class="mot-cell mini m1"><span>B</span></span> mal placée</span>' +
      '<span><span class="mot-cell mini m0"><span>C</span></span> absente</span></div>' +
      '<p class="hint mini-center">1re lettre offerte' + (multi ? ' · même mot pour tous, chacun son tour !' : '') +
      ' · <button class="btn link mot-lien" data-a="stats">📊 Mes statistiques</button></p></div>';
    el.innerHTML = html;
    var pris = false;
    el.querySelectorAll('.mot-mode').forEach(function (b) {
      b.addEventListener('click', function () {
        el._motMode = b.getAttribute('data-m');
        ecrire('gg-motus-mode', el._motMode);
        el.querySelectorAll('.mot-mode').forEach(function (x) {
          x.classList.toggle('actif', x === b);
          x.setAttribute('aria-checked', String(x === b));
        });
        jouer('toggle');
        vibrer('select');
      });
    });
    el.querySelectorAll('[data-lvl]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (pris) return;
        pris = true;
        jouer('select');
        if (ctx.act({ t: 'level', l: b.getAttribute('data-lvl'), m: el._motMode }) === false) pris = false;
      });
    });
    var bj = el.querySelector('.mot-jour');
    if (bj) {
      bj.addEventListener('click', function () {
        if (dejaFait) { ouvreStats(el, 'jour'); return; }
        if (pris) return;
        pris = true;
        jouer('select');
        if (ctx.act({ t: 'level', m: 'jour' }) === false) pris = false;
      });
    }
    var bs = el.querySelector('[data-a="stats"]');
    if (bs) bs.addEventListener('click', function () { ouvreStats(el, mode === 'classique' ? 'classique' : 'serie'); });
    try { GG.fx.stagger(el.querySelectorAll('.mot-lvl')); } catch (e) {}
  }

  function noticeDico() {
    return '<p class="mot-notice">📖 Dictionnaire indisponible : seuls les mots courants de la liste du jeu sont acceptés (l’ordinateur joue quand même).</p>';
  }

  /* ================= la partie ================= */

  var FLIP = 280;  // ms entre deux cases qui se retournent
  var DUREE = 520; // durée d’un retournement

  function renderJeu(el, ctx) {
    var s = ctx.state;
    var me = ctx.me;
    var P = Array.isArray(s.players) ? s.players : [];
    var multi = P.length > 1;
    var L = Math.max(3, Math.min(9, ent(s.length, 5)));
    var mode = MODES[s.mode] ? s.mode : 'serie';
    var M = MODES[mode];
    var tries = Array.isArray(s.tries) ? s.tries : [];
    var jeu = s.phase === 'play';
    var monTour = jeu && me === s.turn;
    // première lettre offerte (une ancienne partie reprise n’en a pas : '')
    var first = s.first ? lettreSure(String(s.first).charAt(0)) : '';
    var cle = ent(s.roundTs) + ':' + ent(s.round);
    var maintenant = Date.now();

    // mémoire de l’affichage : ce qui vient de changer s’anime, une seule fois
    var mm = el._mm;
    var anim = null;
    var frais = !mm || mm.cle !== cle;
    if (frais) {
      mm = el._mm = { cle: cle, n: tries.length, typed: first, absorbe: false, arme: maintenant + 350,
        entree: tries.length === 0, flip: null, vague: null };
      if (ent(s.round) === 1 && !tries.length) { try { if ((root.scrollY || 0) > 0) root.scrollTo(0, 0); } catch (e) {} }
      if (s.phase === 'reveal') {
        // reprise d’une partie sur l’écran de révélation : pas de fanfare rejouée
        mm.vague = { r: tries.length - 1, t0: maintenant - 5000, joue: true };
        mm.ratePour = cle;
      }
    } else {
      mm.entree = false;
      if (tries.length > mm.n) {
        mm.flip = { r: tries.length - 1, t0: maintenant };
        mm.typed = first;
        mm.absorbe = false;
        mm.envoi = 0; // l’essai est arrivé : on peut taper le suivant
        anim = 'flip';
      }
      mm.n = tries.length;
    }
    if (typeof mm.typed !== 'string' || mm.typed.charAt(0) !== first.charAt(0) || mm.typed.length < first.length) {
      mm.typed = first;
    }
    if (s.phase === 'reveal' && s.foundBy >= 0 && !mm.vague) {
      mm.vague = { r: tries.length - 1, t0: maintenant + (anim === 'flip' ? L * FLIP + DUREE - 120 : 0), joue: false };
    }
    if (mm.dernierTour !== s.turn || mm.dernierePhase !== s.phase) {
      if (monTour) mm.arme = Math.max(mm.arme || 0, maintenant + 350);
      mm.dernierTour = s.turn;
      mm.dernierePhase = s.phase;
    }

    var html = '<div class="mot-jeu' + (multi ? ' multi' : '') + (M.essais ? ' limite' : '') +
      '" style="--L:' + L + '">';
    // bandeau : mode, mot n°, essais, statistiques, options
    html += '<div class="mot-barre">' +
      '<span class="mot-pill">' + M.ic + ' ' + (mode === 'jour' ? 'Défi du jour'
        : 'Mot n°' + ent(s.round) + (M.mots ? ' / ' + M.mots : '')) + '</span>' +
      '<span class="mot-pill">💬 ' + tries.length + (M.essais ? ' / ' + M.essais : ' essai' + (tries.length > 1 ? 's' : '')) + '</span>' +
      '<span class="mot-barre-esp"></span>' +
      '<button class="mot-ic" data-a="stats" aria-label="Statistiques" title="Statistiques">📊</button>' +
      '<button class="mot-ic" data-a="opts" aria-label="Options" title="Options">⚙️</button></div>';
    if (!s.dicoOk) html += noticeDico();

    // le tableau commun
    var lignes = [];
    tries.forEach(function (t, r) {
      var lettres = motSur(t && t.word, L);
      var mk = t && Array.isArray(t.marks) ? t.marks : [];
      var by = ent(t && t.by, -1);
      var who = '';
      if (multi) {
        var ok = by >= 0 && by < P.length;
        who = '<span class="mot-who" style="--c:' + (ok ? PCOLORS[by % 4] : '#888') + '" title="' +
          GG.esc(ok ? nomJoueur(s, by) : '?') + '">' +
          GG.esc(ok ? nomJoueur(s, by).replace(/^🤖 /, '').charAt(0) : '?') + '</span>';
      }
      var gagne = s.phase !== 'play' && s.foundBy >= 0 && r === tries.length - 1;
      lignes.push('<div class="mot-row' + (gagne ? ' gagne' : '') + '" data-r="' + r + '">' + who +
        lettres.map(function (c, i) {
          return '<span class="mot-cell ' + clMarque(mk[i]) + '" style="--i:' + i + '"><span>' + c + '</span></span>';
        }).join('') + '</div>');
    });
    var ligneCourante = -1;
    if (jeu) {
      ligneCourante = tries.length;
      var tourDe = ent(s.turn, 0);
      var whoC = multi ? '<span class="mot-who cur" style="--c:' + PCOLORS[tourDe % 4] + '">' +
        GG.esc(nomJoueur(s, tourDe).replace(/^🤖 /, '').charAt(0)) + '</span>' : '';
      var cells = '';
      for (var i = 0; i < L; i++) {
        var c = monTour ? (mm.typed.charAt(i) || '') : (i === 0 ? first : '');
        var cl = 'mot-cell cur' + (c ? ' pleine' : '') +
          (i === 0 && first && (!monTour || mm.typed.length === 1) ? ' donnee' : '');
        cells += '<span class="' + cl + '" style="--i:' + i + '"><span>' + GG.esc(c) + '</span></span>';
      }
      lignes.push('<div class="mot-row mot-cur' + (monTour ? '' : ' attente') + '">' + whoC + cells + '</div>');
    }
    if (M.essais && jeu) { // (une fois le mot fini, les lignes vides laissent la place à la carte de fin)
      for (var v = lignes.length; v < M.essais; v++) {
        var vide = '';
        for (var j = 0; j < L; j++) vide += '<span class="mot-cell vide"><span></span></span>';
        lignes.push('<div class="mot-row vide">' + (multi ? '<span class="mot-who vide"></span>' : '') + vide + '</div>');
      }
    }
    var defile = !M.essais && lignes.length > 6;
    html += '<div class="mot-board' + (defile ? ' mot-scroll' : '') + (mm.entree ? ' entree' : '') + '">' +
      lignes.join('') + '</div>';

    // la ligne de message
    var msg = '';
    if (jeu && !monTour) {
      msg = '⏳ Au tour de <strong>' + GG.esc(nomJoueur(s, s.turn)) + '</strong>…';
    } else if (jeu && mm.msg && mm.msgCle === tries.length) {
      msg = mm.msg;
    } else if (jeu && tries.length === 0) {
      msg = 'Le mot commence par <strong>' + GG.esc(first) + '</strong> · ' + L + ' lettres';
    }
    html += '<p class="mot-msg" aria-live="polite">' + msg + '</p>';

    if (monTour) html += clavierHtml(s, tries);
    if (s.phase === 'reveal' || s.phase === 'fin') html += revelationHtml(el, s, me, multi);
    html += '</div>';
    el.innerHTML = html;

    // ---- les animations de ce qui vient de changer ----
    var t = Date.now();
    if (mm.flip && t - mm.flip.t0 < L * FLIP + DUREE) {
      var rowF = el.querySelector('.mot-row[data-r="' + mm.flip.r + '"]');
      if (rowF) {
        var ecoule = t - mm.flip.t0;
        rowF.classList.add('flip');
        rowF.querySelectorAll('.mot-cell').forEach(function (cell, i) {
          cell.style.setProperty('--d', (i * FLIP - ecoule) + 'ms');
        });
        if (anim === 'flip') sonsDuRetournement(tries[mm.flip.r], L);
      }
    }
    if (mm.vague) {
      var rowV = el.querySelector('.mot-row[data-r="' + mm.vague.r + '"]');
      var retard = mm.vague.t0 - t;
      if (rowV && t - mm.vague.t0 < 1600) {
        rowV.classList.add('vague');
        rowV.querySelectorAll('.mot-cell').forEach(function (cell, i) {
          cell.style.setProperty('--dv', (retard + i * 90) + 'ms');
        });
        if (!mm.vague.joue) {
          mm.vague.joue = true;
          var gagnant = s.foundBy === me || (!multi);
          setTimeout(function () {
            var cible = el.querySelector('.mot-row.gagne') || rowV;
            if (!cible.isConnected) return;
            if (gagnant) { jouer('success'); vibrer('success'); } else { jouer('notify'); vibrer('medium'); }
            try { GG.fx.burst(cible, { count: 26, shape: 'star', colors: ['#2fd67b', '#ffc23d', '#ffffff'] }); } catch (e) {}
          }, Math.max(0, retard) + L * 90);
        }
      }
    }
    if (s.phase === 'reveal' && s.foundBy < 0 && mm.ratePour !== cle) {
      mm.ratePour = cle;
      setTimeout(function () { jouer('wrong'); vibrer('warning'); }, anim === 'flip' ? L * FLIP + DUREE : 0);
    }
    var board = el.querySelector('.mot-board.mot-scroll');
    if (board) board.scrollTop = board.scrollHeight;

    // ---- enregistrement des statistiques (seul sur ce téléphone) ----
    if (s.phase === 'reveal' && P.length === 1 && me === 0) {
      try { enregistre(s); } catch (e) {}
    }
    brancheJeu(el, ctx, mm, L, first, monTour);
    // petit écran : la suite (« Mot suivant ») vient sous les yeux après l’animation
    if (s.phase === 'reveal' && mm.defile !== cle) {
      mm.defile = cle;
      setTimeout(function () {
        var bn = el.querySelector('.mot-actions');
        if (!bn || !bn.isConnected) return;
        var r = bn.getBoundingClientRect();
        if (r.bottom > (root.innerHeight || 0)) {
          try { bn.scrollIntoView({ block: 'end', behavior: GG.fx.reduced() ? 'auto' : 'smooth' }); } catch (e) {}
        }
      }, anim === 'flip' ? L * FLIP + DUREE + 250 : 200);
    }
  }

  function clavierHtml(s, tries) {
    var colore = !!lire('gg-motus-clavier-colore', false);
    var etat = {};
    if (colore) {
      tries.forEach(function (t) {
        var w = String(t.word || '');
        for (var i = 0; i < w.length; i++) {
          var m = t.marks && t.marks[i] === 2 ? 2 : (t.marks && t.marks[i] === 1 ? 1 : 0);
          var c = w.charAt(i);
          if (!(c in etat) || etat[c] < m) etat[c] = m;
        }
      });
    }
    function touche(L) {
      return '<button class="mot-key' + (L in etat ? ' k' + etat[L] : '') + '" data-k="' + L + '">' + L + '</button>';
    }
    return '<div class="mot-kb' + (colore ? ' colore' : '') + '">' +
      '<div class="mot-kr">' + 'AZERTYUIOP'.split('').map(touche).join('') + '</div>' +
      '<div class="mot-kr">' + 'QSDFGHJKLM'.split('').map(touche).join('') + '</div>' +
      '<div class="mot-kr"><button class="mot-key wide del" data-k="⌫" aria-label="Effacer">⌫</button>' +
      'WXCVBN'.split('').map(touche).join('') +
      '<button class="mot-key wide go" data-k="OK" aria-label="Valider">OK</button></div></div>';
  }

  function revelationHtml(el, s, me, multi) {
    var tries = s.tries;
    var n = tries.length;
    var mode = MODES[s.mode] ? s.mode : 'serie';
    var M = MODES[mode];
    var trouve = s.foundBy >= 0 && s.foundBy < s.players.length;
    var h = '<div class="mot-reveal">';
    if (trouve) {
      var moi = s.foundBy === me || !multi;
      h += '<p class="mot-verdict ' + (moi ? 'gagne' : 'autre') + '">' +
        (moi ? '🎉 Bravo' + (multi ? ' ' + GG.esc(nomJoueur(s, s.foundBy)) : '') + ' !'
          : (/^🤖/.test(nomJoueur(s, s.foundBy)) ? '' : '👏 ') + GG.esc(nomJoueur(s, s.foundBy)) + ' l’a trouvé !') + '</p>';
      h += '<p class="mini-msg">En ' + n + ' essai' + (n > 1 ? 's' : '') + (multi ? ' au total' : '') +
        ' · ⏱️ ' + fmt(s.revealSec) + '</p>';
    } else {
      h += '<p class="mot-verdict rate">😶 Pas trouvé ! Le mot était :</p>' +
        '<div class="mot-row mot-reveal-word">' + motSur(s.secret, ent(s.length, 5)).map(function (c, i) {
          return '<span class="mot-cell m2" style="--i:' + i + '"><span>' + c + '</span></span>';
        }).join('') + '</div>';
    }
    if (multi) {
      h += '<div class="mot-scores">' + s.players.map(function (p, i) {
        return '<span class="mot-score" style="--c:' + PCOLORS[i % 4] + '">' + GG.esc(p.name) +
          ' <strong>✓ ' + ent(p.wins) + '</strong></span>';
      }).join('') + '</div>';
    } else {
      var st = lisStats();
      if (mode === 'serie') {
        h += '<p class="hint mini-center">♾️ ' + st.serie.mots + ' mot' + (st.serie.mots > 1 ? 's' : '') +
          ' trouvé' + (st.serie.mots > 1 ? 's' : '') + ' en série' +
          (st.serie.best ? ' · 🏅 record : ' + st.serie.best + ' essai' + (st.serie.best > 1 ? 's' : '') : '') + '</p>';
      } else {
        var b = st[mode === 'jour' ? 'jour' : 'classique'];
        h += '<p class="hint mini-center">🔥 Série : ' + b.serie + ' · 🏅 meilleure : ' + b.max +
          ' · ' + (b.j ? Math.round(100 * b.g / b.j) : 0) + ' % de réussite</p>';
      }
    }
    var fin = s.phase === 'fin' || (M.mots && s.round >= M.mots);
    h += '<div class="mot-actions">' +
      '<button class="btn mot-partage" data-a="partage">📋 Partager</button>' +
      (s.phase === 'reveal' && me === 0
        ? '<button class="btn big primary" id="mot-next">' + (fin ? 'Voir le résultat' : 'Mot suivant') + '</button>'
        : '') + '</div>';
    if (s.phase === 'reveal' && me !== 0) {
      h += '<p class="waiting">' + GG.esc(nomJoueur(s, 0)) + ' lance la suite…</p>';
    }
    h += '</div>';
    return h;
  }

  /* un son doux par case retournée, puis le verdict de la ligne */
  function sonsDuRetournement(t, L) {
    if (!t) return;
    for (var i = 0; i < L; i++) {
      (function (k) {
        setTimeout(function () {
          jouer('flip', { volume: 0.35, pitch: 1 + k * 0.06 });
        }, k * FLIP + DUREE / 2);
      })(i);
    }
  }

  function brancheJeu(el, ctx, mm, L, first, monTour) {
    var s = ctx.state;
    var courante = el.querySelector('.mot-row.mot-cur');
    function majLigne(pop) {
      if (!courante) return;
      var cells = courante.querySelectorAll('.mot-cell');
      for (var i = 0; i < cells.length; i++) {
        var c = mm.typed.charAt(i) || '';
        cells[i].firstChild.textContent = c;
        cells[i].classList.toggle('pleine', !!c);
        cells[i].classList.toggle('donnee', i === 0 && !!first && mm.typed.length === 1);
        if (pop === i) {
          // relance l’animation sans forcer de mise en page (deux noms en alternance)
          var bis = cells[i].classList.contains('tape');
          cells[i].classList.remove('tape', 'tape2');
          cells[i].classList.add(bis ? 'tape2' : 'tape');
        }
      }
    }
    function message(txt, mauvais) {
      var p = el.querySelector('.mot-msg');
      if (!p) return;
      p.innerHTML = txt;
      mm.msg = txt;
      mm.msgCle = (s.tries || []).length;
      p.classList.toggle('erreur', !!mauvais);
    }
    function tremble() {
      if (!courante) return;
      var bis = courante.classList.contains('tremble');
      courante.classList.remove('tremble', 'tremble2');
      courante.classList.add(bis ? 'tremble2' : 'tremble');
      jouer('wrong');
      vibrer('error');
    }
    function touche(key) {
      if (!monTour || !courante) return;
      if (Date.now() < (mm.arme || 0)) return; // anti double-appui (bouton précédent au même endroit)
      if (mm.envoi && Date.now() - mm.envoi < 900) return;
      if (key === 'OK') {
        var manque = L - mm.typed.length;
        if (manque > 0) {
          message('Il manque ' + manque + ' lettre' + (manque > 1 ? 's' : '') + ' !', true);
          tremble();
          return;
        }
        if ((s.tries || []).some(function (t) { return t.word === mm.typed; })) {
          message('« ' + GG.esc(mm.typed) + ' » a déjà été proposé.', true);
          tremble();
          return;
        }
        mm.envoi = Date.now();
        jouer('whoosh', { volume: 0.5 });
        var res = ctx.act({ t: 'guess', w: mm.typed });
        if (res === false) {
          mm.envoi = 0;
          message('« ' + GG.esc(mm.typed) + ' » : mot refusé.', true);
          tremble();
        }
        return;
      }
      if (key === '⌫') {
        if (mm.typed.length > first.length) {
          mm.typed = mm.typed.slice(0, -1);
          if (mm.typed.length <= 1) mm.absorbe = false;
          jouer('erase', { volume: 0.5 });
          vibrer('select');
          majLigne(-1);
        }
        return;
      }
      if (!/^[A-Z]$/.test(key)) return;
      if (first && mm.typed.length === 1 && key === first && !mm.absorbe) {
        // on retape la lettre offerte : elle est déjà là
        mm.absorbe = true;
        jouer('type', { volume: 0.5 });
        vibrer('select');
        majLigne(0);
        return;
      }
      if (mm.typed.length >= L) {
        message('Le mot fait ' + L + ' lettres : validez avec OK.');
        return;
      }
      mm.typed += key;
      jouer('type', { volume: 0.55 });
      vibrer('select');
      majLigne(mm.typed.length - 1);
      if (mm.msg) message('');
    }
    el._motTouche = touche;
    el.querySelectorAll('.mot-key').forEach(function (k) {
      k.addEventListener('click', function () { touche(k.getAttribute('data-k')); });
    });
    var bn = el.querySelector('#mot-next');
    if (bn) {
      var armeLe = Date.now() + 400;
      bn.addEventListener('click', function () {
        if (Date.now() < armeLe || bn.disabled) return;
        bn.disabled = true;
        jouer('whoosh');
        if (ctx.act({ t: 'next' }) === false) bn.disabled = false;
      });
    }
    var bp = el.querySelector('[data-a="partage"]');
    if (bp) bp.addEventListener('click', function () { copie(texteDePartage(s), bp); });
    var bs = el.querySelector('.mot-barre [data-a="stats"]');
    if (bs) bs.addEventListener('click', function () { ouvreStats(el, s.mode); });
    var bo = el.querySelector('[data-a="opts"]');
    if (bo) bo.addEventListener('click', function () { ouvreOptions(el); });
  }

  /* clavier de l’ordinateur (tests sur PC, tablettes à clavier) */
  function installeClavierPhysique(el) {
    if (el._motClavier || typeof document === 'undefined') return;
    el._motClavier = true;
    document.addEventListener('keydown', function (ev) {
      if (!el.isConnected || !el.querySelector('.mot-kb') || !el._motTouche) return;
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      var t = ev.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      var k = ev.key;
      if (k === 'Enter') k = 'OK';
      else if (k === 'Backspace') k = '⌫';
      else if (k && k.length === 1) {
        k = k.normalize ? k.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase() : k.toUpperCase();
        if (!/^[A-Z]$/.test(k)) return;
      } else return;
      ev.preventDefault();
      el._motTouche(k);
    });
  }

  /* ================= fenêtres : statistiques et options ================= */

  function fenetre(el, html, surFermer) {
    var ancien = el.querySelector('.mot-modal');
    if (ancien) ancien.parentNode.removeChild(ancien);
    var m = document.createElement('div');
    m.className = 'mot-modal';
    m.setAttribute('role', 'dialog');
    m.innerHTML = '<div class="mot-modal-carte">' + html +
      '<button class="btn big" data-a="fermer">Fermer</button></div>';
    el.appendChild(m);
    jouer('open');
    function ferme() {
      if (!m.parentNode) return;
      m.parentNode.removeChild(m);
      jouer('close');
      if (surFermer) surFermer();
    }
    m.addEventListener('click', function (ev) { if (ev.target === m) ferme(); });
    m.querySelector('[data-a="fermer"]').addEventListener('click', ferme);
    return m;
  }

  function statsHtml(onglet) {
    var st = lisStats();
    var h = '<h3 class="mot-modal-t">📊 Mes statistiques</h3><div class="mot-onglets">' +
      [['jour', '📅 Du jour'], ['classique', '🎯 6 essais'], ['serie', '♾️ Illimité']].map(function (o) {
        return '<button class="mot-onglet' + (o[0] === onglet ? ' actif' : '') + '" data-o="' + o[0] + '">' + o[1] + '</button>';
      }).join('') + '</div>';
    if (onglet === 'serie') {
      var S = st.serie;
      h += '<div class="mot-chiffres">' +
        '<div><strong>' + ent(S.mots) + '</strong><span>mots trouvés</span></div>' +
        '<div><strong>' + (S.mots ? (S.essais / S.mots).toFixed(1).replace('.', ',') : '–') + '</strong><span>essais en moyenne</span></div>' +
        '<div><strong>' + (S.best || '–') + '</strong><span>record (essais)</span></div></div>';
      return h;
    }
    var b = st[onglet];
    var maxD = 1;
    b.d.forEach(function (x) { maxD = Math.max(maxD, ent(x)); });
    h += '<div class="mot-chiffres">' +
      '<div><strong>' + ent(b.j) + '</strong><span>parties</span></div>' +
      '<div><strong>' + (b.j ? Math.round(100 * b.g / b.j) : 0) + '</strong><span>% réussies</span></div>' +
      '<div><strong>' + ent(b.serie) + '</strong><span>série</span></div>' +
      '<div><strong>' + ent(b.max) + '</strong><span>meilleure série</span></div></div>' +
      '<p class="mot-distrib-t">Essais nécessaires</p><div class="mot-distrib">' +
      b.d.map(function (x, i) {
        var v = ent(x);
        return '<div class="mot-barre-d"><span class="mbd-n">' + (i + 1) + '</span><span class="mbd-b" style="--p:' +
          Math.max(6, Math.round(100 * v / maxD)) + '%"><span>' + v + '</span></span></div>';
      }).join('') + '</div>';
    if (onglet === 'jour') {
      var f = lire('gg-motus-jour', null);
      if (f && f.date === jourCle()) {
        h += '<button class="btn primary mot-partage" data-a="partage-jour">📋 Partager mon défi du jour</button>';
      }
      h += '<p class="hint mini-center">Prochain défi dans ' + avantDemain() + '.</p>';
    }
    return h;
  }
  function avantDemain() {
    var d = new Date();
    var demain = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    var min = Math.max(1, Math.round((demain - d) / 60000));
    var h = Math.floor(min / 60);
    return (h ? h + ' h ' : '') + deux(min % 60) + ' min';
  }
  function ouvreStats(el, onglet) {
    if (onglet !== 'jour' && onglet !== 'classique') onglet = 'serie';
    var m = fenetre(el, statsHtml(onglet));
    function branche() {
      m.querySelectorAll('.mot-onglet').forEach(function (b) {
        b.addEventListener('click', function () {
          var carte = m.querySelector('.mot-modal-carte');
          var fermer = carte.querySelector('[data-a="fermer"]');
          var tmp = document.createElement('div');
          tmp.innerHTML = statsHtml(b.getAttribute('data-o'));
          while (carte.firstChild && carte.firstChild !== fermer) carte.removeChild(carte.firstChild);
          while (tmp.firstChild) carte.insertBefore(tmp.firstChild, fermer);
          jouer('tap');
          branche();
        });
      });
      var bj = m.querySelector('[data-a="partage-jour"]');
      if (bj) {
        bj.addEventListener('click', function () {
          var f = lire('gg-motus-jour', null);
          if (!f) return;
          var faux = {
            mode: 'jour', jour: f.date, length: f.len, foundBy: f.gagne ? 0 : -1,
            tries: (f.grille || []).map(function (mk) { return { marks: mk }; })
          };
          copie(texteDePartage(faux), bj);
        });
      }
      try { GG.fx.stagger(m.querySelectorAll('.mot-barre-d')); } catch (e) {}
    }
    branche();
  }

  function ouvreOptions(el) {
    var colore = !!lire('gg-motus-clavier-colore', false);
    var m = fenetre(el, '<h3 class="mot-modal-t">⚙️ Options</h3>' +
      '<label class="mot-option"><input type="checkbox" id="mot-opt-colore"' + (colore ? ' checked' : '') + '>' +
      '<span><strong>Clavier coloré</strong><small>Les touches prennent la couleur des essais précédents (désactivé par défaut : les couleurs restent sur le tableau).</small></span></label>',
    function () { var c = el._motCtx; if (c && el.querySelector('.mot-jeu')) mod.render(el, c); });
    var cb = m.querySelector('#mot-opt-colore');
    cb.addEventListener('change', function () {
      ecrire('gg-motus-clavier-colore', !!cb.checked);
      jouer('toggle');
    });
  }

  GG.register(mod);
  if (typeof module === 'object' && module.exports) module.exports = mod;
})(typeof self !== 'undefined' ? self : globalThis);
