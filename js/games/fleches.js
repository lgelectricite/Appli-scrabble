/*
 * GGgames — Mots fléchés V2 (solitaire).
 * De vraies grilles pleines « comme en kiosque » : les définitions sont DANS
 * les cases, les flèches partent vers leur mot, on écrit dans la grille avec
 * le clavier fixé en bas de l’écran. Grilles générées à la demande à partir
 * d’une graine (plus de 1 000 par force, identiques sur tous les téléphones),
 * 5 forces qui diffèrent par la taille, la longueur des mots, le vocabulaire
 * et la difficulté des définitions ; défi du jour ; aides ; chrono ; étoiles.
 * Le lexique, le générateur et la saisie sont dans fleches-data.js (communs
 * avec les Mots croisés).
 */
(function (root) {
  'use strict';
  var GG = root.GG;
  if (!GG.grilles && typeof require === 'function') { try { require('./fleches-data.js'); } catch (e) { /* navigateur */ } }

  var PAR_FORCE = 1000;
  var FORCES = [
    null,
    { nom: 'Découverte', detail: 'petite grille · mots courts · définitions directes' },
    { nom: 'Tranquille', detail: 'mots plus longs · quelques clins d’œil' },
    { nom: 'Classique', detail: 'grille de kiosque · définitions variées' },
    { nom: 'Exigeante', detail: 'grande grille · définitions indirectes' },
    { nom: 'Expert', detail: 'la plus grande · définitions pièges' }
  ];
  /* défi du jour : la force suit la semaine, du lundi tranquille au samedi corsé */
  var FORCE_DU_JOUR = [4, 1, 2, 3, 3, 4, 5]; // dimanche … samedi

  function M() { return GG.grilles; }

  /* ---------- progression locale (compatible V1 : mêmes clés) ---------- */
  function lis(cle, def) {
    try {
      if (typeof localStorage === 'undefined') return def;
      var v = JSON.parse(localStorage.getItem(cle) || 'null');
      return v === null ? def : v;
    } catch (e) { return def; }
  }
  function ecris(cle, v) {
    try { if (typeof localStorage !== 'undefined') localStorage.setItem(cle, JSON.stringify(v)); } catch (e) { /* plein */ }
  }
  function doneList(f) { var a = lis('gg-fleches-done', {}); return (a && a['f' + f]) || []; }
  function markDone(f, g) {
    var a = lis('gg-fleches-done', {}) || {}, l = a['f' + f] || [];
    if (l.indexOf(g) === -1) l.push(g);
    a['f' + f] = l;
    ecris('gg-fleches-done', a);
  }
  function doneCount(f) { return doneList(f).length; }
  function nextGrid(f) {
    var d = doneList(f), set = {};
    d.forEach(function (g) { set[g] = 1; });
    for (var g = 0; g < 100000; g++) if (!set[g]) return g;
    return 0;
  }
  function etoilesDe(f, g) { var e = lis('gg-fleches-etoiles', {}); return (e && e['f' + f] && e['f' + f][g]) || 0; }
  function noteEtoiles(f, g, n) {
    var e = lis('gg-fleches-etoiles', {}) || {}, t = e['f' + f] || {};
    if (!t[g] || t[g] < n) t[g] = n;
    e['f' + f] = t;
    ecris('gg-fleches-etoiles', e);
  }
  function record(f) { return lis('gg-fleches-best-f' + f, null); }
  function jourFait(d) { var j = lis('gg-fleches-jour', {}); return j && j[d]; }

  function stars(n) { return '⭐⭐⭐'.slice(0, n) + '<span class="gx-etoile-vide">' + '☆☆☆'.slice(0, 3 - n) + '</span>'; }

  var mod = {
    id: 'fleches',
    nom: 'Mots fléchés',
    icone: '➡️',
    desc: 'De vraies grilles de kiosque : définitions dans les cases, flèches, on écrit dans la grille. Plus de 5 000 grilles, 5 forces, un défi par jour.',
    min: 1, max: 1,
    hotseat: true, hotseatMax: 1, hidden: false, netOnly: false,
    noBadges: true,
    regles: '<p><strong>🎯 Le but :</strong> remplir toute la grille. Chaque définition est écrite <strong>dans sa case</strong> ; la petite flèche montre où commence le mot et dans quel sens il se lit (les flèches coudées tournent au coin, comme dans les magazines).</p>' +
      '<p><strong>✍️ Jouer :</strong> touchez une case ou une définition : le mot s’éclaire et sa définition s’affiche en grand au-dessus du clavier. Tapez vos lettres : elles s’écrivent dans la grille. Touchez deux fois la même case (ou ⇄) pour changer de sens. Pincez la grille pour zoomer, glissez pour la déplacer ; ⤢ montre toute la grille.</p>' +
      '<p><strong>✅ Validation :</strong> un mot juste s’illumine et sa définition se barre. Si vous finissez un mot faux, il tremble : ses lettres fausses s’effacent et l’erreur coûte 2 points.</p>' +
      '<p><strong>💡 Aides :</strong> révéler une lettre (−3), vérifier le mot (−1), vérifier la grille (−5). Sans aide ni erreur : ⭐⭐⭐.</p>' +
      '<p><strong>🗓️ Défi du jour :</strong> la même grille pour tout le monde, du lundi (force 1) au samedi (force 5).</p>',

    create: function (names) {
      return {
        v: 2,
        players: names.map(function (n) { return { name: n, points: 0, found: 0, errors: 0, aides: 0 }; }),
        phase: 'setup',
        force: 0, gnum: -1, jour: '',
        w: 0, h: 0, cases: '', words: [], saisie: [], aide: [],
        startTs: 0, durationSec: 0, complete: false, finished: false,
        ev: { n: 0, k: '' }
      };
    },

    turnOf: function () { return -1; },
    over: function (state) { return !!state.finished; },
    scoreOf: function (state, i) { return state.players[i] ? state.players[i].points : 0; },
    gagnants: function (state) { return state.finished ? [0] : []; },

    summary: function (state) {
      var p = state.players[0] || { points: 0, errors: 0, aides: 0 };
      var et = M().etoiles(p);
      var html = '<div class="gx-resume">' +
        '<div class="gx-res-etoiles">' + stars(et) + '</div>' +
        '<div class="final-line"><span>⏱️ Temps</span><strong>' + M().duree(state.durationSec) + '</strong></div>' +
        '<div class="final-line"><span>★ Points</span><strong>' + p.points + '</strong></div>' +
        '<div class="final-line"><span>Erreurs · aides</span><strong>' + (p.errors || 0) + ' · ' + (p.aides || 0) + '</strong></div>';
      if (state.jour) {
        var j = lis('gg-fleches-jour', {}) || {}, prec = j[state.jour];
        if (!prec || state.durationSec < prec.sec || et > prec.et) j[state.jour] = { sec: state.durationSec, et: et, pts: p.points };
        ecris('gg-fleches-jour', j);
        html += '<p>🗓️ Défi du ' + GG.esc(M().dateLisible(state.jour)) + ' relevé ! Revenez demain pour une nouvelle grille.</p>';
      } else {
        markDone(state.force, state.gnum);
        noteEtoiles(state.force, state.gnum, et);
        html += '<p>Grille n°' + (state.gnum + 1) + ' · force ' + state.force + ' — ' +
          doneCount(state.force) + ' grille' + (doneCount(state.force) > 1 ? 's' : '') + ' terminée' + (doneCount(state.force) > 1 ? 's' : '') + ' dans cette force.</p>';
        var key = 'gg-fleches-best-f' + state.force, best = lis(key, null);
        if (!best || state.durationSec < best.sec) {
          ecris(key, { sec: state.durationSec, ts: state.startTs });
          html += '<h2>🏆 Nouveau record de la force ' + state.force + ' !</h2>';
        } else {
          html += '<p>🏅 Record force ' + state.force + ' : ' + M().duree(best.sec) + '.</p>';
        }
      }
      return html + '</div>';
    },

    /* les solutions ne circulent jamais */
    redact: function (state) { return M().masquer(state); },

    apply: function (state, player, action) {
      if (!action) return { ok: false, error: 'Action inconnue.' };
      if (state.v !== 2) { // partie de l’ancienne version : on repart proprement
        if (action.t !== 'nouvelle') return { ok: false, error: 'Partie d’une ancienne version.' };
        var neuf = mod.create(state.players.map(function (p) { return p.name; }));
        Object.keys(state).forEach(function (k) { delete state[k]; });
        Object.keys(neuf).forEach(function (k) { state[k] = neuf[k]; });
        return { ok: true };
      }
      if (action.t === 'nouvelle') {
        if (state.phase === 'play' && !state.finished) return { ok: false, error: 'Grille en cours.' };
        var n2 = mod.create(state.players.map(function (p) { return p.name; }));
        Object.keys(n2).forEach(function (k) { state[k] = n2[k]; });
        return { ok: true };
      }
      if (action.t === 'force' || action.t === 'jour') {
        if (state.phase === 'play' && !state.finished) return { ok: false, error: 'Grille déjà choisie.' };
        if (player > 0) return { ok: false, error: 'L’hôte choisit la grille.' };
        var f, g, jour = '';
        if (action.t === 'jour') {
          if (!M().dateValide(action.d)) return { ok: false, error: 'Date invalide.' };
          jour = action.d;
          f = FORCE_DU_JOUR[M().jourSemaine(jour)];
          g = -1;
        } else {
          f = action.f | 0;
          if (f < 1 || f > 5) return { ok: false, error: 'Force inconnue.' };
          g = action.g === undefined ? 0 : action.g | 0;
          if (g < 0 || g > 99999) return { ok: false, error: 'Numéro de grille invalide.' };
        }
        var grille = M().grilleFleches(f, g, jour);
        if (!grille) return { ok: false, error: 'Grille introuvable.' };
        M().demarrer(state, grille, ['defCell', 'fleche']);
        state.force = f; state.gnum = g; state.jour = jour;
        return { ok: true };
      }
      var r = M().appliquer(state, player, action);
      return r || { ok: false, error: 'Action inconnue.' };
    },

    render: function (el, ctx) {
      var s = ctx.state;
      if (s.v !== 2) { // ancienne partie sauvegardée
        el._gx = null;
        el.innerHTML = '<div class="gx-accueil"><div class="gx-carte"><p class="mini-msg big-msg">➡️ Nouvelle version !</p>' +
          '<p class="mini-msg">Les Mots fléchés ont été entièrement refaits. Votre ancienne partie ne peut pas être reprise.</p>' +
          '<button class="btn jeu big" data-a="nouvelle">Découvrir les nouvelles grilles</button></div></div>';
        el.querySelector('[data-a]').addEventListener('click', function () { ctx.act({ t: 'nouvelle' }); });
        return;
      }
      if (s.phase === 'setup') { accueil(el, ctx); return; }
      M().jouer(el, ctx, JEU);
    },

    _PAR_FORCE: PAR_FORCE, _FORCE_DU_JOUR: FORCE_DU_JOUR,
    _grille: function (f, g, jour) { return M().grilleFleches(f, g, jour); },
    _nextGrid: nextGrid
  };

  /* ---------- l’écran d’accueil : défi du jour + 5 forces ---------- */
  function accueil(el, ctx) {
    el._gx = null;
    var jour = M().aujourdhui(), fj = FORCE_DU_JOUR[M().jourSemaine(jour)], fait = jourFait(jour);
    var html = '<div class="gx-accueil">' +
      '<div class="gx-jour">' +
        '<div class="gx-jour-ic" aria-hidden="true">🗓️</div>' +
        '<div class="gx-jour-tx"><div class="gx-jour-t">Défi du jour</div>' +
        '<div class="gx-jour-d">' + GG.esc(M().dateLisible(jour)) + ' · force ' + fj + '</div>' +
        '<div class="gx-jour-s">' + (fait ? '✓ Relevé en ' + M().duree(fait.sec) + ' · ' + stars(fait.et) : 'La même grille pour tout le monde, aujourd’hui seulement.') + '</div></div>' +
        '<button type="button" class="btn jeu gx-jour-go" data-jour="' + jour + '">' + (fait ? 'Rejouer' : 'Jouer') + '</button>' +
      '</div>' +
      '<h3 class="gx-sec">Choisissez votre force</h3><div class="gx-forces">';
    for (var f = 1; f <= 5; f++) {
      var n = doneCount(f), g = nextGrid(f), rec = record(f), F = M().FORCES[f];
      html += '<button type="button" class="gx-force" data-f="' + f + '" style="--k:' + f + '">' +
        '<span class="gx-f-num">' + f + '</span>' +
        '<span class="gx-f-tx"><span class="gx-f-nom">Force ' + f + ' · ' + FORCES[f].nom + '</span>' +
        '<span class="gx-f-det">' + F.W + '×' + F.H + ' · ' + FORCES[f].detail + '</span>' +
        '<span class="gx-f-barre"><i style="width:' + Math.min(100, Math.max(n ? 2 : 0, n / PAR_FORCE * 100)) + '%"></i></span>' +
        '<span class="gx-f-det">' + n + ' / 1 000 grilles' + (rec ? ' · record ' + M().duree(rec.sec) : '') + '</span></span>' +
        '<span class="gx-f-go">n°' + (g + 1) + '<b>›</b></span>' +
        '</button>';
    }
    html += '</div></div>';
    el.innerHTML = html;
    var parti = false; // anti double appui
    el.querySelectorAll('[data-f]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (parti) return;
        parti = true;
        var f2 = +b.getAttribute('data-f');
        if (GG.sfx) GG.sfx.play('open');
        if (ctx.act({ t: 'force', f: f2, g: nextGrid(f2) }) === false) parti = false;
      });
    });
    el.querySelector('[data-jour]').addEventListener('click', function () {
      if (parti) return;
      parti = true;
      if (GG.sfx) GG.sfx.play('open');
      if (ctx.act({ t: 'jour', d: this.getAttribute('data-jour') }) === false) parti = false;
    });
    if (GG.fx && GG.fx.stagger) GG.fx.stagger(el.querySelectorAll('.gx-force'), { gap: 45 });
  }

  /* ---------- la grille : cases-lettres, cases-définitions, flèches ---------- */
  function grilleHTML(s, S) {
    var W = s.w, N = s.w * s.h, parDef = {}, debut = {}, i;
    s.words.forEach(function (w, wi) {
      (parDef[w.defCell] = parDef[w.defCell] || []).push(wi);
      (debut[w.cells[0]] = debut[w.cells[0]] || []).push(w.fleche);
    });
    var html = '<div class="gx-grille" style="grid-template-columns:repeat(' + W + ',var(--s));grid-template-rows:repeat(' + s.h + ',var(--s))">';
    for (i = 0; i < N; i++) {
      if (s.cases.charAt(i) === '.') {
        html += '<div class="gx-c" data-i="' + i + '"><span class="gx-l"></span>' +
          (debut[i] || []).map(function (f) { return M().FLECHES[f] || ''; }).join('') + '</div>';
      } else if (parDef[i]) {
        var ws = parDef[i].slice().sort(function (a, b) { return (M().dessus(s.words[a]) ? 0 : 1) - (M().dessus(s.words[b]) ? 0 : 1); });
        // (la taille de chaque texte est ajustée ensuite, en le mesurant)
        html += '<div class="gx-d n' + ws.length + '" data-c="' + i + '" data-d="' + ws.join(',') + '">' + ws.map(function (wi) {
          return '<div class="gx-dh" data-w="' + wi + '"><span class="gx-dt" lang="fr">' + GG.esc(s.words[wi].def) + '</span></div>';
        }).join('') + '</div>';
      } else {
        html += '<div class="gx-d gx-orn" data-c="' + i + '"></div>';
      }
    }
    return html + '</div>';
  }

  var JEU = {
    id: 'fleches',
    /* des cases assez grandes pour lire les définitions (on déplace la grille au besoin) */
    taille: function (s, dispo) { return Math.max(48, Math.min(60, Math.floor(dispo / s.w))); },
    zoomLecture: function () { return 1; },
    titre: function (s) {
      return s.jour ? '🗓️ Défi du jour' : 'Force ' + s.force + ' · n°' + (s.gnum + 1);
    },
    grille: grilleHTML,
    etiquette: function (s, wi) {
      var w = s.words[wi];
      return '<span class="gx-sens">' + (w.dir === 'h' ? '→' : '↓') + '</span>';
    },
    fin: function (s) {
      var p = s.players[0] || {};
      return '<div class="gx-fin"><span class="gx-fin-t">🎉 Grille terminée !</span> ' +
        '<span>⏱️ ' + M().duree(s.durationSec) + ' · ★ ' + (p.points || 0) + ' · ' + stars(M().etoiles(p)) + '</span></div>';
    }
  };

  GG.register(mod);
  if (typeof module === 'object' && module.exports) module.exports = mod;
})(typeof self !== 'undefined' ? self : globalThis);
