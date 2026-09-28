/*
 * GGgames — Mots croisés V2 (solitaire).
 * De vraies grilles denses (plus de 70 % des cases blanches sont croisées),
 * numérotation classique : lignes en chiffres romains (horizontalement),
 * colonnes en chiffres arabes (verticalement). On écrit DANS la grille avec le
 * clavier fixé en bas ; les lettres des mots trouvés restent en place pour les
 * croisements. 3 niveaux, grilles générées à la demande (déterministes),
 * défi du jour, aides, chrono, étoiles. Lexique, générateur et saisie :
 * fleches-data.js (communs avec les Mots fléchés).
 */
(function (root) {
  'use strict';
  var GG = root.GG;
  if (!GG.grilles && typeof require === 'function') { try { require('./fleches-data.js'); } catch (e) { /* navigateur */ } }

  var ORDRE = ['facile', 'moyen', 'difficile'];
  var LEVELS = {
    facile: { nom: 'Facile', ic: '😌', detail: 'vocabulaire courant · définitions directes' },
    moyen: { nom: 'Moyen', ic: '🙂', detail: 'vocabulaire varié · définitions indirectes' },
    difficile: { nom: 'Difficile', ic: '😈', detail: 'grande grille · définitions pièges' }
  };
  /* défi du jour : le niveau suit la semaine */
  var NIVEAU_DU_JOUR = ['moyen', 'facile', 'facile', 'moyen', 'moyen', 'difficile', 'difficile'];

  function M() { return GG.grilles; }

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
  function doneList(l) { var a = lis('gg-croises-done', {}); return (a && a[l]) || []; }
  function markDone(l, g) {
    var a = lis('gg-croises-done', {}) || {}, t = a[l] || [];
    if (t.indexOf(g) === -1) t.push(g);
    a[l] = t;
    ecris('gg-croises-done', a);
  }
  function nextGrid(l) {
    var set = {};
    doneList(l).forEach(function (g) { set[g] = 1; });
    for (var g = 0; g < 100000; g++) if (!set[g]) return g;
    return 0;
  }
  function stars(n) { return '⭐⭐⭐'.slice(0, n) + '<span class="gx-etoile-vide">' + '☆☆☆'.slice(0, 3 - n) + '</span>'; }

  var mod = {
    id: 'croises',
    nom: 'Mots croisés',
    icone: '✏️',
    desc: 'De vraies grilles denses, numérotées à l’ancienne, qu’on remplit directement au clavier. 3 niveaux, un défi par jour.',
    regles: '<p><strong>🎯 Le but :</strong> remplir toute la grille. Les définitions sont numérotées comme dans le journal : <strong>horizontalement</strong> par ligne (I, II, III…), <strong>verticalement</strong> par colonne (1, 2, 3…).</p>' +
      '<p><strong>✍️ Jouer :</strong> touchez une case : le mot s’éclaire et sa définition s’affiche au-dessus du clavier. Tapez : les lettres s’écrivent dans la grille, celles des croisements déjà trouvés restent en place. Touchez deux fois la même case (ou ⇄) pour changer de sens ; 📋 ouvre la liste de toutes les définitions.</p>' +
      '<p><strong>✅ Validation :</strong> un mot juste s’illumine. Un mot fini mais faux tremble : ses lettres fausses s’effacent (−2 points).</p>' +
      '<p><strong>💡 Aides :</strong> révéler une lettre (−3), vérifier le mot (−1), vérifier la grille (−5). ⭐⭐⭐ sans aide ni erreur.</p>',
    min: 1, max: 1,
    hotseat: true, hotseatMax: 1, hidden: false, netOnly: false,
    noBadges: true,

    create: function (names) {
      return {
        v: 2,
        players: names.map(function (n) { return { name: n, points: 0, found: 0, errors: 0, aides: 0 }; }),
        phase: 'setup',
        level: null, gnum: -1, jour: '',
        size: 0, w: 0, h: 0, cases: '', words: [], saisie: [], aide: [],
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
      var et = M().etoiles(p), L = LEVELS[state.level] || { nom: '' };
      var html = '<div class="gx-resume">' +
        '<div class="gx-res-etoiles">' + stars(et) + '</div>' +
        '<div class="final-line"><span>⏱️ Temps</span><strong>' + M().duree(state.durationSec) + '</strong></div>' +
        '<div class="final-line"><span>★ Points</span><strong>' + p.points + '</strong></div>' +
        '<div class="final-line"><span>Erreurs · aides</span><strong>' + (p.errors || 0) + ' · ' + (p.aides || 0) + '</strong></div>';
      if (state.jour) {
        var j = lis('gg-croises-jour', {}) || {}, prec = j[state.jour];
        if (!prec || state.durationSec < prec.sec || et > prec.et) j[state.jour] = { sec: state.durationSec, et: et, pts: p.points };
        ecris('gg-croises-jour', j);
        html += '<p>🗓️ Défi du ' + GG.esc(M().dateLisible(state.jour)) + ' relevé ! À demain pour la suivante.</p>';
      } else if (state.level) {
        markDone(state.level, state.gnum);
        html += '<p>Grille n°' + (state.gnum + 1) + ' · niveau ' + L.nom + '.</p>';
        var key = 'gg-croises-best-' + state.level, best = lis(key, null);
        if (!best || state.durationSec < best.sec) {
          ecris(key, { sec: state.durationSec, ts: state.startTs });
          html += '<h2>🏆 Nouveau record !</h2>';
        } else {
          html += '<p>🏅 Record ' + L.nom.toLowerCase() + ' : ' + M().duree(best.sec) + '.</p>';
        }
      }
      return html + '</div>';
    },

    redact: function (state) { return M().masquer(state); },

    apply: function (state, player, action) {
      if (!action) return { ok: false, error: 'Action inconnue.' };
      if (state.v !== 2) {
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
      if (action.t === 'level' || action.t === 'jour') {
        if (state.phase === 'play' && !state.finished) return { ok: false, error: 'Niveau déjà choisi.' };
        if (player > 0) return { ok: false, error: 'L’hôte choisit le niveau.' };
        var l, g, jour = '';
        if (action.t === 'jour') {
          if (!M().dateValide(action.d)) return { ok: false, error: 'Date invalide.' };
          jour = action.d;
          l = NIVEAU_DU_JOUR[M().jourSemaine(jour)];
          g = -1;
        } else {
          l = action.l;
          if (!LEVELS[l]) return { ok: false, error: 'Niveau inconnu.' };
          g = action.g === undefined ? 0 : action.g | 0;
          if (g < 0 || g > 99999) return { ok: false, error: 'Numéro de grille invalide.' };
        }
        var grille = M().grilleCroises(l, g, jour);
        if (!grille) return { ok: false, error: 'Grille introuvable.' };
        M().demarrer(state, grille, ['ligne']);
        state.level = l; state.gnum = g; state.jour = jour; state.size = grille.w;
        return { ok: true };
      }
      var r = M().appliquer(state, player, action);
      return r || { ok: false, error: 'Action inconnue.' };
    },

    render: function (el, ctx) {
      var s = ctx.state;
      if (s.v !== 2) {
        el._gx = null;
        el.innerHTML = '<div class="gx-accueil"><div class="gx-carte"><p class="mini-msg big-msg">✏️ Nouvelle version !</p>' +
          '<p class="mini-msg">Les Mots croisés ont été entièrement refaits. Votre ancienne partie ne peut pas être reprise.</p>' +
          '<button class="btn jeu big" data-a="nouvelle">Découvrir les nouvelles grilles</button></div></div>';
        el.querySelector('[data-a]').addEventListener('click', function () { ctx.act({ t: 'nouvelle' }); });
        return;
      }
      if (s.phase === 'setup') { accueil(el, ctx); return; }
      M().jouer(el, ctx, JEU);
    },

    _LEVELS: LEVELS, _NIVEAU_DU_JOUR: NIVEAU_DU_JOUR,
    _grille: function (l, g, jour) { return M().grilleCroises(l, g, jour); },
    _nextGrid: nextGrid,
    _norm: function (s) { return M().norm(s); }
  };

  function accueil(el, ctx) {
    el._gx = null;
    var jour = M().aujourdhui(), lj = NIVEAU_DU_JOUR[M().jourSemaine(jour)];
    var fait = (lis('gg-croises-jour', {}) || {})[jour];
    var html = '<div class="gx-accueil">' +
      '<div class="gx-jour">' +
        '<div class="gx-jour-ic" aria-hidden="true">🗓️</div>' +
        '<div class="gx-jour-tx"><div class="gx-jour-t">Grille du jour</div>' +
        '<div class="gx-jour-d">' + GG.esc(M().dateLisible(jour)) + ' · ' + LEVELS[lj].nom.toLowerCase() + '</div>' +
        '<div class="gx-jour-s">' + (fait ? '✓ Remplie en ' + M().duree(fait.sec) + ' · ' + stars(fait.et) : 'La même grille pour tout le monde, aujourd’hui seulement.') + '</div></div>' +
        '<button type="button" class="btn jeu gx-jour-go" data-jour="' + jour + '">' + (fait ? 'Rejouer' : 'Jouer') + '</button>' +
      '</div>' +
      '<h3 class="gx-sec">Choisissez le niveau</h3><div class="gx-forces">';
    ORDRE.forEach(function (l, k) {
      var n = doneList(l).length, g = nextGrid(l), rec = lis('gg-croises-best-' + l, null), C = M().NIVEAUX[l];
      html += '<button type="button" class="gx-force" data-lvl="' + l + '" style="--k:' + (1 + k * 2) + '">' +
        '<span class="gx-f-num">' + LEVELS[l].ic + '</span>' +
        '<span class="gx-f-tx"><span class="gx-f-nom">' + LEVELS[l].nom + '</span>' +
        '<span class="gx-f-det">' + C.n + '×' + C.n + ' · ' + LEVELS[l].detail + '</span>' +
        '<span class="gx-f-det">' + n + ' grille' + (n > 1 ? 's' : '') + ' remplie' + (n > 1 ? 's' : '') + (rec ? ' · record ' + M().duree(rec.sec) : '') + '</span></span>' +
        '<span class="gx-f-go">n°' + (g + 1) + '<b>›</b></span>' +
        '</button>';
    });
    html += '</div></div>';
    el.innerHTML = html;
    var parti = false;
    el.querySelectorAll('[data-lvl]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (parti) return;
        parti = true;
        var l = b.getAttribute('data-lvl');
        if (GG.sfx) GG.sfx.play('open');
        if (ctx.act({ t: 'level', l: l, g: nextGrid(l) }) === false) parti = false;
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

  /* ---------- la grille, avec ses numéros en marge ---------- */
  function grilleHTML(s) {
    var N = s.w, R = M().ROMAINS, i, r, c;
    var html = '<div class="gx-grille gx-cr" style="grid-template-columns:calc(var(--s) * .62) repeat(' + N + ',var(--s));' +
      'grid-template-rows:calc(var(--s) * .62) repeat(' + s.h + ',var(--s))">';
    html += '<div class="gx-coin"></div>';
    for (c = 0; c < N; c++) html += '<div class="gx-num">' + (c + 1) + '</div>';
    for (r = 0; r < s.h; r++) {
      html += '<div class="gx-rom">' + R[r] + '</div>';
      for (c = 0; c < N; c++) {
        i = r * N + c;
        html += s.cases.charAt(i) === '.' ? '<div class="gx-c" data-i="' + i + '"><span class="gx-l"></span></div>' : '<div class="gx-n"></div>';
      }
    }
    return html + '</div>';
  }
  function listeHTML(s) {
    var R = M().ROMAINS, html = '';
    ['h', 'v'].forEach(function (dir) {
      html += '<h4 class="gx-lt">' + (dir === 'h' ? '→ Horizontalement' : '↓ Verticalement') + '</h4>';
      var parLigne = {};
      s.words.forEach(function (w, wi) { if (w.dir === dir) (parLigne[w.ligne] = parLigne[w.ligne] || []).push(wi); });
      Object.keys(parLigne).sort(function (a, b) { return a - b; }).forEach(function (k) {
        html += '<div class="gx-lg"><b>' + (dir === 'h' ? R[+k] : (+k + 1)) + '.</b> ' + parLigne[k].map(function (wi) {
          return '<button type="button" class="gx-ld" data-a="mot" data-mot="' + wi + '" data-w="' + wi + '">' +
            GG.esc(s.words[wi].def) + ' <em>(' + s.words[wi].cells.length + ')</em></button>';
        }).join('<span class="gx-tiret">–</span>') + '</div>';
      });
    });
    return html;
  }

  var JEU = {
    id: 'croises',
    taille: function (s, dispo) { return Math.max(30, Math.min(54, Math.floor(dispo / (s.w + 0.62)))); },
    zoomLecture: function () { return 1; },
    /* pas de texte dans les cases : on montre toute la grille d’emblée */
    zoomInitial: function (vc) { return Math.max(0.72, Math.min(1, vc.zFit)); },
    titre: function (s) {
      return s.jour ? '🗓️ Grille du jour' : (LEVELS[s.level] ? LEVELS[s.level].nom : '') + ' · n°' + (s.gnum + 1);
    },
    grille: grilleHTML,
    liste: listeHTML,
    etiquette: function (s, wi) {
      var w = s.words[wi];
      return '<span class="gx-sens">' + (w.dir === 'h' ? M().ROMAINS[w.ligne] + ' →' : (w.ligne + 1) + ' ↓') + '</span>';
    },
    fin: function (s) {
      var p = s.players[0] || {};
      return '<div class="gx-fin"><span class="gx-fin-t">🎉 Grille remplie !</span> ' +
        '<span>⏱️ ' + M().duree(s.durationSec) + ' · ★ ' + (p.points || 0) + ' · ' + stars(M().etoiles(p)) + '</span></div>';
    }
  };

  GG.register(mod);
  if (typeof module === 'object' && module.exports) module.exports = mod;
})(typeof self !== 'undefined' ? self : globalThis);
