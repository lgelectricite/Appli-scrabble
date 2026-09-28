/* GGgames — Bataille navale (2 joueurs, série en 1, 3 ou 5 manches).
 *
 * V2 : une mer animée, une flotte dessinée (coques vues de dessus) que l’on
 * place soi-même (glisser, toucher pour pivoter, ou « au hasard »), des tirs
 * avec traînée, explosions, éclaboussures et navires qui sombrent, la carte
 * adverse dans le brouillard. Sur un seul téléphone, le tireur VOIT son
 * résultat avant de passer la main, et les messages disent qui a tiré.
 * Règles au choix : un tir par tour (classique) ou « touché = on rejoue »,
 * navires écartés ou collés permis. IA : facile, moyen, difficile (densité
 * de probabilité).
 */
(function (root) {
  'use strict';
  var GG = root.GG;
  var N = 10;
  var FLEET = [5, 4, 3, 3, 2];
  var NOMS = ['porte-avions', 'cuirassé', 'croiseur', 'sous-marin', 'torpilleur'];
  var SERIES = [1, 3, 5];
  var LETTRES = 'ABCDEFGHIJ';

  function alea(n) { return Math.floor(Math.random() * n); }
  function coord(i) { return LETTRES.charAt(i % N) + (Math.floor(i / N) + 1); }
  function cellsOf(r, c, h, L) {
    if (r < 0 || c < 0) return null;
    if (h ? c + L > N || r >= N : r + L > N || c >= N) return null;
    var out = [];
    for (var k = 0; k < L; k++) out.push((h ? r : r + k) * N + (h ? c + k : c));
    return out;
  }
  function voisins8(i) {
    var r = Math.floor(i / N), c = i % N, out = [];
    for (var dr = -1; dr <= 1; dr++) {
      for (var dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        var rr = r + dr, cc = c + dc;
        if (rr >= 0 && rr < N && cc >= 0 && cc < N) out.push(rr * N + cc);
      }
    }
    return out;
  }
  /* un navire peut-il occuper ces cases, vu les autres navires ? */
  function placeLibre(ships, sauf, cells, colles) {
    var occ = {};
    ships.forEach(function (sh, k) {
      if (k === sauf || !sh) return;
      sh.cells.forEach(function (i) { occ[i] = 2; });
    });
    for (var k = 0; k < cells.length; k++) {
      if (occ[cells[k]]) return false;
      if (!colles) {
        var v = voisins8(cells[k]);
        for (var q = 0; q < v.length; q++) if (occ[v[q]]) return false;
      }
    }
    return true;
  }
  function construire(ships) {
    var cells = {};
    ships.forEach(function (sh, k) { sh.cells.forEach(function (i) { cells[i] = k; }); });
    return { cells: cells, ships: ships };
  }
  /* flotte au hasard : les navires ne se touchent JAMAIS (même en diagonale) */
  function randomFleet() {
    for (var essai = 0; essai < 1000; essai++) {
      var ships = [], ok = true;
      for (var f = 0; f < FLEET.length && ok; f++) {
        var L = FLEET[f], pose = false;
        for (var t = 0; t < 300 && !pose; t++) {
          var h = Math.random() < 0.5;
          var r = alea(h ? N : N - L + 1), c = alea(h ? N - L + 1 : N);
          var cl = cellsOf(r, c, h, L);
          if (cl && placeLibre(ships, -1, cl, false)) {
            ships.push({ size: L, cells: cl, hits: 0, sunk: false, r: r, c: c, h: h });
            pose = true;
          }
        }
        if (!pose) ok = false;
      }
      if (ok) return construire(ships);
    }
    return null;
  }
  function flotteValide(board, colles) {
    for (var k = 0; k < board.ships.length; k++) {
      if (!placeLibre(board.ships, k, board.ships[k].cells, colles)) return false;
    }
    return true;
  }
  function shipsLeft(board) {
    return board.ships.filter(function (s) { return !s.sunk; }).length;
  }
  function manches(state) {
    var n = state.opts && state.opts.manches;
    return SERIES.indexOf(n) !== -1 ? n : 3;
  }
  function solo(state) { return !!state.niveauIA; }
  /* une partie enregistrée avant la V2 n’a ni règles ni compteurs */
  function norm(s) {
    if (!s.opts) s.opts = { manches: 3, rejoue: true, colles: true };
    if (!s.tirs) s.tirs = [0, 0];
    if (!s.touches) s.touches = [0, 0];
    if (s.nTirs === undefined) s.nTirs = 0;
    return s;
  }

  function nouvelleManche(state) {
    state.boards = [randomFleet(), randomFleet()];
    state.shots = [[], []];
    for (var i = 0; i < N * N; i++) { state.shots[0].push(null); state.shots[1].push(null); }
    state.players.forEach(function (p) { p.ready = false; });
    state.phase = 'place';
    state.current = 0;
    state.finished = false;
    state.winner = -1;
    state.lastMsg = '';
    state.lastShot = null;
    state.dernier = null;
    state.attente = false;
    state.nTirs = 0;
    state.tirs = [0, 0];
    state.touches = [0, 0];
  }

  /* ================= IA ================= */
  function infosTir(state, me) {
    var opp = 1 - me, shots = state.shots[opp], board = state.boards[opp];
    var colles = !!(state.opts && state.opts.colles);
    var coule = {}, restants = [], vide = {};
    board.ships.forEach(function (sh) {
      if (sh.sunk) sh.cells.forEach(function (i) { coule[i] = true; });
      else restants.push(sh.size);
    });
    // navires écartés : autour d’une épave, il n’y a que de l’eau
    if (!colles) {
      Object.keys(coule).forEach(function (i) {
        voisins8(+i).forEach(function (v) { if (!coule[v]) vide[v] = true; });
      });
    }
    var actifs = [];
    for (var i = 0; i < N * N; i++) if (shots[i] === 'H' && !coule[i]) actifs.push(i);
    return { shots: shots, coule: coule, vide: vide, restants: restants, actifs: actifs, colles: colles };
  }
  function auHasard(l) { return l[alea(l.length)]; }

  /* difficile : densité de probabilité. Pour chaque navire encore à flot,
     on compte toutes ses positions possibles compatibles avec ce qu’on sait
     (eau, épaves, et leurs abords si les navires sont écartés) ; une
     position qui recouvre des touches pèse énormément. On tire là où la
     densité est la plus forte. */
  function tirDifficile(state, me) {
    var I = infosTir(state, me), dens = [], i, k;
    for (i = 0; i < N * N; i++) dens.push(0);
    function interdit(c) { return I.shots[c] === 'M' || I.coule[c] || I.vide[c]; }
    var cible = I.actifs.length > 0;
    var estActif = {};
    I.actifs.forEach(function (a) { estActif[a] = true; });
    I.restants.forEach(function (L) {
      for (var r = 0; r < N; r++) {
        for (var c = 0; c < N; c++) {
          for (var hh = 0; hh < 2; hh++) {
            var cl = cellsOf(r, c, hh === 1, L);
            if (!cl) continue;
            var ok = true, touches = 0;
            for (k = 0; k < L; k++) {
              if (interdit(cl[k])) { ok = false; break; }
              if (estActif[cl[k]]) touches++;
            }
            if (!ok) continue;
            var w = cible ? (touches ? Math.pow(40, touches) : 1) : 1;
            for (k = 0; k < L; k++) if (!I.shots[cl[k]]) dens[cl[k]] += w;
          }
        }
      }
    });
    var best = -1, choix = [];
    for (i = 0; i < N * N; i++) {
      if (I.shots[i] || I.vide[i]) continue;
      var d = dens[i];
      // en chasse, à densité égale, le damier (le plus petit navire fait 2)
      if (!cible && (Math.floor(i / N) + i % N) % 2 === 0) d *= 1.0001;
      if (d > best + 1e-9) { best = d; choix = [i]; } else if (Math.abs(d - best) <= 1e-9) choix.push(i);
    }
    if (!choix.length) {
      for (i = 0; i < N * N; i++) if (!I.shots[i]) choix.push(i);
    }
    return auHasard(choix);
  }

  /* moyen : chasse en damier, puis ciblage méthodique autour des touches */
  function tirMoyen(state, me, facile) {
    // (moyen et facile ne déduisent pas que les abords d’une épave sont vides)
    var I = infosTir(state, me), shots = I.shots;
    function libre(i) { return !shots[i]; }
    function actif(i) { return shots[i] === 'H' && !I.coule[i]; }
    var cibles = [];
    var oubli = facile && Math.random() < 0.35; // le débutant oublie parfois sa touche
    if (!oubli) {
      I.actifs.forEach(function (h) {
        var r = Math.floor(h / N), c = h % N;
        if (c + 1 < N && actif(h + 1)) {
          var g = c; while (g > 0 && actif(r * N + g - 1)) g--;
          var d = c + 1; while (d < N - 1 && actif(r * N + d + 1)) d++;
          if (g > 0 && libre(r * N + g - 1)) cibles.push(r * N + g - 1);
          if (d < N - 1 && libre(r * N + d + 1)) cibles.push(r * N + d + 1);
        }
        if (r + 1 < N && actif(h + N)) {
          var ht = r; while (ht > 0 && actif((ht - 1) * N + c)) ht--;
          var bs = r + 1; while (bs < N - 1 && actif((bs + 1) * N + c)) bs++;
          if (ht > 0 && libre((ht - 1) * N + c)) cibles.push((ht - 1) * N + c);
          if (bs < N - 1 && libre((bs + 1) * N + c)) cibles.push((bs + 1) * N + c);
        }
      });
      if (facile) cibles = [];
      if (!cibles.length && I.actifs.length) {
        I.actifs.forEach(function (h) {
          var r = Math.floor(h / N), c = h % N;
          if (c > 0 && libre(h - 1)) cibles.push(h - 1);
          if (c < N - 1 && libre(h + 1)) cibles.push(h + 1);
          if (r > 0 && libre(h - N)) cibles.push(h - N);
          if (r < N - 1 && libre(h + N)) cibles.push(h + N);
        });
      }
    }
    if (!cibles.length) {
      var toutes = [], motif = [];
      for (var j = 0; j < N * N; j++) {
        if (shots[j]) continue;
        toutes.push(j);
        var r2 = Math.floor(j / N), c2 = j % N;
        // moyen : damier ; facile : un quadrillage lâche, en diagonales
        if (facile ? (r2 + 2 * c2) % 3 === 0 : (r2 + c2) % 2 === 0) motif.push(j);
      }
      if (!toutes.length) return -1;
      cibles = (motif.length && Math.random() > (facile ? 0.5 : 0.1)) ? motif : toutes;
    }
    return auHasard(cibles);
  }

  /* ================= Le module ================= */
  var mod = {
    id: 'bataille',
    nom: 'Bataille navale',
    icone: '🚢',
    desc: 'Placez votre flotte, coulez celle d’en face. Vos navires restent secrets.',
    regles: '<p><strong>🎯 Le but :</strong> couler les 5 navires adverses (porte-avions 5 cases, cuirassé 4, croiseur 3, sous-marin 3, torpilleur 2) avant que les vôtres ne le soient.</p><p><strong>La flotte :</strong> glissez vos navires pour les placer, touchez-en un pour le faire pivoter, ou « Au hasard ».</p><p><strong>Le tir :</strong> touchez une case de la carte adverse, dans le brouillard. 🌊 À l’eau, 💥 touché, ☠️ coulé quand toutes ses cases sont touchées.</p><p><strong>Règles au choix :</strong> un tir par tour (classique) ou « touché = on rejoue » ; navires écartés (ils ne se touchent pas, même en diagonale) ou collés permis ; série en 1, 3 ou 5 manches gagnantes — le perdant commence la manche suivante.</p>',
    min: 2, max: 2,
    hotseat: true, hidden: true, netOnly: false,
    niveaux: ['facile', 'moyen', 'difficile'],

    create: function (names) {
      var state = {
        id: Math.floor(Math.random() * 1e9),
        players: names.map(function (n) { return { name: n, ready: false, wins: 0 }; }),
        opts: { manches: 3, rejoue: false, colles: false },
        manche: 1,
        serieGagnee: false,
        fini: false
      };
      nouvelleManche(state);
      return state;
    },

    turnOf: function (state) {
      if (state.fini || state.finished) return -1;
      if (state.phase === 'place') return -1; // les deux préparent en même temps
      return state.current;
    },
    /* sur un seul téléphone : qui doit voir l’écran en ce moment ? */
    viewerOf: function (state) {
      if (state.phase === 'place') {
        for (var i = 0; i < state.players.length; i++) {
          if (!state.players[i].ready) return i;
        }
        return 0;
      }
      return state.finished ? state.winner : state.current;
    },
    over: function (state) { return !!state.fini; },
    scoreOf: function (state, i) {
      if (state.finished || state.fini || state.phase === 'place') return state.players[i].wins + ' 🏆';
      return shipsLeft(state.boards[i]) + ' 🚢';
    },
    gagnants: function (state) {
      var n = manches(state), g = [];
      state.players.forEach(function (p, i) { if (p.wins >= n) g.push(i); });
      return g;
    },
    summary: function (state) {
      var g = mod.gagnants(state);
      return state.players.map(function (p, i) {
        var t = +((state.tirs && state.tirs[i]) || 0) || 0, h = +((state.touches && state.touches[i]) || 0) || 0;
        return '<div class="final-line"><span>' + GG.esc(p.name) + '</span><strong>' + (p.wins | 0) + ' manche' +
          (p.wins > 1 ? 's' : '') + '</strong></div>' +
          (t ? '<p class="hint">Dernière manche : ' + t + ' tirs, ' + Math.round(100 * h / t) + ' % au but</p>' : '');
      }).join('') + (g.length ? '<h3>🏆 ' + GG.esc(state.players[g[0]].name) + ' remporte la série !</h3>' : '');
    },

    /* cache les navires adverses non coulés (et le type d’un navire touché) */
    redact: function (state, viewer) {
      var copy = GG.clone(state);
      if (state.finished || state.fini) return copy; // fin de manche : tout se révèle
      for (var i = 0; i < 2; i++) {
        if (i === viewer) continue;
        var b = copy.boards[i];
        b.cells = {};
        b.ships = b.ships.map(function (s) {
          return s.sunk ? s : { size: s.size, cells: [], hits: 0, sunk: false };
        });
      }
      if (copy.dernier && copy.dernier.cible !== viewer && copy.dernier.res === 'touche') {
        delete copy.dernier.navire; // « touché », sans dire lequel
      }
      return copy;
    },

    apply: function (state, player, action) {
      action = action || {};
      norm(state);
      var t = action.t;
      if (t === 'fin') {
        if (state.fini) return player === -1 ? { ok: true } : { ok: false, error: 'La partie est finie.' };
        if (!state.serieGagnee) return player === -1 ? { ok: true } : { ok: false, error: 'La série continue.' };
        state.fini = true;
        return { ok: true };
      }
      if (t === 'suite') {
        // fin de l’affichage du résultat : la main passe
        if (!state.attente || state.finished || state.fini ||
            (player === -1 && action.n !== undefined && action.n !== state.nTirs)) {
          return player === -1 ? { ok: true } : { ok: false, error: 'Rien à passer.' };
        }
        if (player !== -1 && player !== state.current) return { ok: false, error: 'Ce n’est pas votre tour.' };
        state.attente = false;
        state.current = 1 - state.current;
        return { ok: true };
      }
      if (state.fini) return { ok: false, error: 'La partie est finie.' };
      if (t === 'again') {
        if (!state.finished) return { ok: false, error: 'La manche n’est pas finie.' };
        if (state.serieGagnee) return { ok: false, error: 'La série est terminée.' };
        var perdant = 1 - state.winner;
        state.manche = (state.manche || 1) + 1;
        nouvelleManche(state);
        state.firstNext = perdant; // le perdant commencera la revanche
        return { ok: true };
      }
      if (state.finished) return { ok: false, error: 'Manche terminée.' };
      if (player !== 0 && player !== 1) return { ok: false, error: 'Joueur inconnu.' };
      if (t === 'regles') {
        if (state.phase !== 'place' || (state.manche || 1) !== 1 ||
            state.players.some(function (p) { return p.ready; })) {
          return { ok: false, error: 'Les règles sont fixées.' };
        }
        var o = state.opts;
        if (action.manches !== undefined) {
          if (SERIES.indexOf(action.manches) === -1) return { ok: false, error: 'Série inconnue.' };
          o.manches = action.manches;
        }
        if (action.rejoue !== undefined) o.rejoue = !!action.rejoue;
        if (action.colles !== undefined) {
          o.colles = !!action.colles;
          // navires écartés : une flotte qui ne l’est pas est replacée
          if (!o.colles) {
            state.boards = state.boards.map(function (b) { return flotteValide(b, false) ? b : randomFleet(); });
          }
        }
        return { ok: true };
      }
      if (t === 'shuffle') {
        if (state.phase !== 'place') return { ok: false, error: 'Placement terminé.' };
        if (state.players[player].ready) return { ok: false, error: 'Vous êtes déjà prêt.' };
        state.boards[player] = randomFleet();
        return { ok: true };
      }
      if (t === 'place') {
        if (state.phase !== 'place') return { ok: false, error: 'Placement terminé.' };
        if (state.players[player].ready) return { ok: false, error: 'Vous êtes déjà prêt.' };
        var sIdx = action.s | 0, bd = state.boards[player];
        if (sIdx < 0 || sIdx >= bd.ships.length) return { ok: false, error: 'Navire inconnu.' };
        var sh = bd.ships[sIdx];
        var cl = cellsOf(action.r | 0, action.c | 0, !!action.h, sh.size);
        if (!cl) return { ok: false, error: 'Hors de la grille.' };
        if (!placeLibre(bd.ships, sIdx, cl, !!state.opts.colles)) {
          return { ok: false, error: state.opts.colles ? 'Un navire est déjà là.' : 'Les navires ne doivent pas se toucher.' };
        }
        sh.r = action.r | 0; sh.c = action.c | 0; sh.h = !!action.h; sh.cells = cl;
        state.boards[player] = construire(bd.ships);
        return { ok: true };
      }
      if (t === 'ready') {
        if (state.phase !== 'place') return { ok: false, error: 'Placement terminé.' };
        state.players[player].ready = true;
        if (state.players.every(function (p) { return p.ready; })) {
          state.phase = 'play';
          state.current = state.firstNext === undefined || state.firstNext === null ? 0 : state.firstNext;
          state.firstNext = null;
        }
        return { ok: true };
      }
      if (t === 'fire') {
        if (state.phase !== 'play') return { ok: false, error: 'La bataille n’a pas commencé.' };
        if (player !== state.current) return { ok: false, error: 'Ce n’est pas votre tour.' };
        if (state.attente) return { ok: false, error: 'Le tir précédent retombe…' };
        var target = 1 - player;
        var idx = action.i | 0;
        if (idx < 0 || idx >= N * N) return { ok: false, error: 'Case invalide.' };
        if (state.shots[target][idx]) return { ok: false, error: 'Déjà tiré ici.' };
        var board = state.boards[target];
        state.nTirs = (state.nTirs || 0) + 1;
        state.tirs[player]++;
        state.lastShot = { target: target, idx: idx };
        var shipId = board.cells[idx];
        var res = 'eau';
        if (shipId !== undefined) {
          state.shots[target][idx] = 'H';
          state.touches[player]++;
          var ship = board.ships[shipId];
          ship.hits++;
          res = ship.hits >= ship.size ? 'coule' : 'touche';
          if (res === 'coule') ship.sunk = true;
        } else {
          state.shots[target][idx] = 'M';
        }
        state.dernier = { tireur: player, cible: target, idx: idx, res: res, n: state.nTirs };
        if (res !== 'eau') state.dernier.navire = shipId;
        state.lastMsg = res === 'eau' ? '🌊 À l’eau.' : (res === 'coule' ? '💥 Coulé !' : '🎯 Touché !');
        if (res !== 'eau' && board.ships.every(function (s) { return s.sunk; })) {
          state.finished = true;
          state.winner = player;
          state.players[player].wins++;
          if (state.players[player].wins >= manches(state)) {
            state.serieGagnee = true;
            return { ok: true, timer: { ms: 3200, action: { t: 'fin' } } };
          }
          return { ok: true };
        }
        if (res !== 'eau' && state.opts.rejoue) return { ok: true }; // variante : touché = on rejoue
        // le tireur voit son résultat, puis la main passe (minuteur ou bouton)
        if (solo(state) && player !== 0) { state.current = target; return { ok: true }; }
        state.attente = true;
        return { ok: true, timer: { ms: solo(state) ? 900 : 1400, action: { t: 'suite', n: state.nTirs } } };
      }
      return { ok: false, error: 'Action inconnue.' };
    },

    /* Adversaire IA — fair-play : il n’utilise que ce qu’un humain verrait à
       sa place (ses propres tirs, les épaves), jamais les positions secrètes.
       facile : quadrillage lâche et touches parfois oubliées ; moyen :
       damier puis ciblage ; difficile : densité de probabilité. */
    bot: function (state, me, ctx) {
      if (state.fini || state.finished) return null; // écran de fin : l’humain décide
      var niveau = (ctx && ctx.niveau) || state.niveauIA || 'moyen';
      if (state.phase === 'place') {
        if (state.players[me].ready) return null;
        // contre l’humain (joueur 0), on attend qu’il ait réglé et placé
        if (me !== 0 && !state.players[0].ready) return null;
        return { t: 'ready' };
      }
      if (state.current !== me) return null;
      if (state.attente) return { t: 'suite', n: state.nTirs };
      var i = niveau === 'difficile' ? tirDifficile(state, me) : tirMoyen(state, me, niveau === 'facile');
      return i < 0 ? null : { t: 'fire', i: i };
    },

    render: function (el, ctx) { rendu(el, ctx); },

    _randomFleet: randomFleet,
    _flotteValide: flotteValide,
    _tir: function (state, me, niveau) {
      return niveau === 'difficile' ? tirDifficile(state, me) : tirMoyen(state, me, niveau === 'facile');
    }
  };

  /* ================= Dessin ================= */

  /* coque vue de dessus, proue à droite, dans une boîte de L×100 sur 100 */
  function coque(f, L) {
    var W = L * 100, d, deco = '';
    if (f === 3) { // sous-marin : fuseau arrondi, kiosque au milieu
      d = 'M14 50C14 30 40 24 80 24H' + (W - 70) + 'C' + (W - 30) + ' 24 ' + (W - 8) + ' 38 ' + (W - 8) + ' 50C' + (W - 8) + ' 62 ' +
        (W - 30) + ' 76 ' + (W - 70) + ' 76H80C40 76 14 70 14 50Z';
      deco = '<rect x="' + (W / 2 - 34) + '" y="38" width="68" height="24" rx="12" class="k"/>' +
        '<line x1="' + (W / 2 - 10) + '" y1="50" x2="' + (W / 2 + 22) + '" y2="50" class="l"/>';
    } else {
      d = 'M10 50C10 26 26 16 56 16H' + (W - 96) + 'C' + (W - 40) + ' 16 ' + (W - 12) + ' 34 ' + (W - 4) + ' 50C' + (W - 12) + ' 66 ' +
        (W - 40) + ' 84 ' + (W - 96) + ' 84H56C26 84 10 74 10 50Z';
      if (f === 0) { // porte-avions : pont d’envol et îlot
        deco = '<line x1="40" y1="50" x2="' + (W - 70) + '" y2="50" class="piste"/>' +
          '<rect x="' + (W - 200) + '" y="18" width="70" height="20" rx="4" class="k"/>';
      } else {
        var tourelles = f === 1 ? 3 : (f === 2 ? 2 : 1);
        for (var k = 0; k < tourelles; k++) {
          var x = 70 + k * ((W - 170) / Math.max(1, tourelles - 1 || 1));
          if (tourelles === 1) x = W / 2 - 20;
          deco += '<circle cx="' + x.toFixed(0) + '" cy="50" r="17" class="k"/>' +
            '<line x1="' + x.toFixed(0) + '" y1="50" x2="' + (x + 36).toFixed(0) + '" y2="50" class="canon"/>';
        }
        deco += '<rect x="' + (W / 2 + (f === 4 ? 26 : 0) - 16) + '" y="38" width="32" height="24" rx="6" class="p"/>';
      }
    }
    return '<path d="' + d + '" class="coque"/>' + deco;
  }
  function navireSVG(f, L, h) {
    var inner = coque(f, L);
    if (h) return '<svg viewBox="0 0 ' + (L * 100) + ' 100" preserveAspectRatio="none" aria-hidden="true">' + inner + '</svg>';
    return '<svg viewBox="0 0 100 ' + (L * 100) + '" preserveAspectRatio="none" aria-hidden="true">' +
      '<g transform="translate(100 0) rotate(90)">' + inner + '</g></svg>';
  }
  function styleNavire(sh) {
    return 'left:' + (sh.c * 10) + '%;top:' + (sh.r * 10) + '%;width:' + ((sh.h ? sh.size : 1) * 10) +
      '%;height:' + ((sh.h ? 1 : sh.size) * 10) + '%';
  }

  function rendu(el, ctx) {
    var s = norm(ctx.state), me = ctx.me, opp = 1 - me;
    var fx = GG.fx, sfx = GG.sfx;
    var enSolo = ctx.mode === 'local' && solo(s);
    var hotseat = ctx.mode === 'local' && !solo(s);
    var nom = function (i) { return s.players[i] ? GG.esc(s.players[i].name) : '?'; };
    var cle = s.id + ':' + (s.manche || 1);
    var avant = el._v2 && el._v2.jeu === 'bataille' && el._v2.cle === cle ? el._v2 : null;
    var vu = avant ? avant.vu : {};
    var dern = s.dernier;
    var nouveauTir = !!(avant && dern && (vu[me] || 0) < dern.n);
    // les sons lourds (éclaboussure, bulles) se préparent pendant le placement
    if (!avant) sfx.prepare(['splash', 'sink']);
    el._v2 = { jeu: 'bataille', cle: cle, vu: vu };
    if (dern) vu[me] = dern.n;

    /* une grille : o = {owner, voir (mes navires), vise, petit, place} */
    function grille(o) {
      var board = s.boards[o.owner], shots = s.shots[o.owner];
      var colles = !!s.opts.colles;
      var coule = {}, autour = {};
      board.ships.forEach(function (sh) {
        if (sh.sunk) sh.cells.forEach(function (i) { coule[i] = true; });
      });
      if (!colles && o.brume) {
        Object.keys(coule).forEach(function (i) { voisins8(+i).forEach(function (v) { if (!coule[v]) autour[v] = true; }); });
      }
      var html = '<div class="bn-plateau' + (o.petit ? ' petit' : ' grand') + '">';
      if (!o.petit) {
        html += '<span class="bn-coin"></span><div class="bn-lettres">';
        for (var c = 0; c < N; c++) html += '<span>' + LETTRES.charAt(c) + '</span>';
        html += '</div><div class="bn-chiffres">';
        for (var r = 0; r < N; r++) html += '<span>' + (r + 1) + '</span>';
        html += '</div>';
      }
      html += '<div class="bn-grid' + (o.vise ? ' aim' : '') + (o.petit ? ' small' : '') + (o.brume ? ' cible' : ' mienne') +
        (o.place ? ' placement' : '') + '" data-owner="' + o.owner + '">';
      for (var i = 0; i < N * N; i++) {
        var cls = 'bn-cell';
        var shot = shots[i];
        var isShip = (o.voir && board.cells[i] !== undefined) || !!coule[i];
        if (isShip) cls += ' ship';
        if (coule[i]) cls += ' coule';
        if (shot === 'H') cls += ' hit';
        else if (shot === 'M') cls += ' miss';
        else if (o.brume) cls += autour[i] ? ' abord' : ' brume';
        if (s.lastShot && s.lastShot.target === o.owner && s.lastShot.idx === i) cls += ' last';
        html += '<div class="' + cls + '" data-i="' + i + '"></div>';
      }
      // navires dessinés : les miens, et les épaves
      board.ships.forEach(function (sh, f) {
        if (!(o.voir || sh.sunk) || !sh.cells || !sh.cells.length || sh.r === undefined) return;
        html += '<div class="bn-navire t' + f + (sh.sunk ? ' coule' : '') + '" data-s="' + f + '" style="' + styleNavire(sh) + '">' +
          navireSVG(f, sh.size, !!sh.h) + '</div>';
      });
      html += '</div></div>';
      return html;
    }

    var html = '<div class="bn-v2 ph-' + (s.finished ? 'fin' : s.phase) + '">';
    var regles = function () {
      return 'Série en ' + manches(s) + ' · ' + (s.opts.rejoue ? 'touché = on rejoue' : 'un tir par tour') +
        ' · navires ' + (s.opts.colles ? 'collés permis' : 'écartés');
    };

    if (s.finished) {
      /* ---- fin de manche : les deux flottes se révèlent ---- */
      var w = s.winner;
      html += '<p class="mini-msg big-msg bn-titre">🏆 ' + nom(w) + (s.serieGagnee ? ' remporte la série !' : ' gagne la manche !') + '</p>' +
        '<p class="mini-msg bn-score">' + nom(0) + ' <b>' + (s.players[0].wins | 0) + '</b> — <b>' + (s.players[1].wins | 0) + '</b> ' + nom(1) +
        ' <span class="bn-serie">(premier à ' + manches(s) + ')</span></p>' +
        '<div class="bn-duo">';
      [0, 1].forEach(function (k) {
        var t2 = (s.tirs[1 - k] | 0), h2 = (s.touches[1 - k] | 0);
        html += '<div class="bn-flotte-fin"><p class="bn-label">🚢 Flotte de ' + nom(k) + '</p>' +
          grille({ owner: k, voir: true, petit: true }) +
          '<p class="bn-stat">' + t2 + (t2 > 1 ? ' tirs reçus' : ' tir reçu') + ' · ' +
          (t2 ? Math.round(100 * h2 / t2) : 0) + ' % au but</p></div>';
      });
      html += '</div><div class="mini-actions">' + (s.serieGagnee
        ? '<button class="btn big jeu" data-a="fin">🎉 Voir le résultat</button>'
        : '<button class="btn big primary" data-a="again" disabled>🔁 Manche suivante</button>') + '</div>';
    } else if (s.phase === 'place') {
      /* ---- placement ---- */
      var pret = s.players[me].ready;
      var reglable = (s.manche || 1) === 1 && !s.players.some(function (p) { return p.ready; });
      if (reglable) {
        // trois pastilles : chaque toucher passe au choix suivant
        var nm = manches(s), suivant = SERIES[(SERIES.indexOf(nm) + 1) % SERIES.length];
        html += '<div class="bn-regles">' +
          '<button class="bn-regle" data-r="manches" data-v="' + suivant + '"><small>🏆 Série</small>' +
          nm + (nm > 1 ? ' manches' : ' manche') + '</button>' +
          '<button class="bn-regle" data-r="rejoue" data-v="' + (s.opts.rejoue ? 0 : 1) + '"><small>🎯 Tirs</small>' +
          (s.opts.rejoue ? 'Touché = rejoue' : 'Un par tour') + '</button>' +
          '<button class="bn-regle" data-r="colles" data-v="' + (s.opts.colles ? 0 : 1) + '"><small>⚓ Navires</small>' +
          (s.opts.colles ? 'Collés permis' : 'Écartés') + '</button></div>';
      } else {
        html += '<p class="bn-resume">📜 ' + regles() + '</p>';
      }
      html += '<p class="mini-msg bn-msg">' + (pret
        ? '⏳ Flotte prête ! En attente de ' + nom(opp) + '…'
        : (hotseat ? '<b>' + nom(me) + '</b>, placez votre flotte <span class="bn-cache">(' + nom(opp) + ' ne regarde pas !)</span>'
          : 'Placez votre flotte')) + '</p>';
      html += grille({ owner: me, voir: true, place: !pret });
      if (!pret) {
        html += '<p class="hint bn-aide">✋ Glissez pour déplacer · touchez pour pivoter</p>' +
          '<div class="mini-actions"><button class="btn big" data-a="shuffle">🎲 Au hasard</button>' +
          '<button class="btn big primary" data-a="ready">✔️ Je suis prêt</button></div>';
      }
    } else {
      /* ---- bataille ---- */
      var mine = me === s.current;
      var msg = '';
      if (dern) {
        var co = coord(dern.idx);
        // liste blanche : un état venu du réseau ne choisit pas ce qui s’affiche
        var nomNav = (dern.navire | 0) === dern.navire && NOMS[dern.navire] ? NOMS[dern.navire] : '';
        if (dern.tireur === me) {
          msg = dern.res === 'eau' ? '🌊 En ' + co + ' : à l’eau.'
            : dern.res === 'coule' ? '☠️ Coulé ! Le ' + (nomNav || 'navire') + ' de ' + nom(opp) + ' sombre (' + co + ').'
              : '💥 En ' + co + ' : touché !';
          if (s.attente) msg += ' ' + (hotseat ? 'Passez la main.' : 'Au tour de ' + nom(opp) + '…');
          else if (mine) msg += ' Rejouez !';
        } else {
          msg = (dern.res === 'eau' ? '🌊 ' + nom(dern.tireur) + ' a tiré en ' + co + ' : à l’eau.'
            : dern.res === 'coule' ? '☠️ ' + nom(dern.tireur) + ' a coulé votre ' + (nomNav || 'navire') + ' (' + co + ') !'
              : '💥 ' + nom(dern.tireur) + ' a touché votre ' + (nomNav || 'navire') + ' en ' + co + ' !');
        }
        if (!s.attente && !(mine && dern.tireur === me)) {
          msg += ' <b>' + (mine ? (hotseat ? 'À toi de tirer, ' + nom(me) + ' !' : 'À vous de tirer !')
            : (enSolo ? nom(s.current) + ' vise…' : 'Au tour de ' + nom(s.current) + '…')) + '</b>';
        }
      } else {
        msg = mine ? '<b>' + (hotseat ? 'À toi de tirer, ' + nom(me) + ' !' : 'À vous de tirer !') + '</b> Visez dans le brouillard.'
          : (enSolo ? '<b>' + nom(s.current) + '</b> vise…' : 'Au tour de <b>' + nom(s.current) + '</b>…');
      }
      html += '<p class="mini-msg bn-msg">' + msg + '</p>';
      html += '<p class="bn-label">🎯 Carte de ' + nom(opp) + ' <span>' + shipsLeft(s.boards[opp]) + ' 🚢 à flot</span></p>';
      html += '<div class="bn-zone-tir">' + grille({ owner: opp, brume: true, vise: mine && !s.attente });
      if (s.attente && dern && dern.tireur === me) {
        var lib = dern.res === 'eau' ? '🌊 À l’eau !' : dern.res === 'coule' ? '☠️ Coulé !' : '💥 Touché !';
        // le bandeau se pose loin de la case visée, pour la laisser voir
        html += '<div class="bn-resultat res-' + (dern.res === 'coule' || dern.res === 'touche' ? dern.res : 'eau') +
          (dern.idx < 50 ? ' bas' : ' haut') + '"><b>' + lib +
          '</b><small>' + coord(dern.idx) + '</small></div>';
      }
      html += '</div>';
      if (s.attente && dern && dern.tireur === me && ctx.mode === 'local') {
        html += '<div class="mini-actions bn-passe"><button class="btn big jeu" data-a="suite">' +
          (hotseat ? '📱 Passer le téléphone à ' + nom(opp) : 'Continuer ▶') + '</button></div>';
      }
      html += '<p class="bn-label">🚢 Votre flotte <span>' + shipsLeft(s.boards[me]) + ' 🚢 à flot</span></p>' +
        grille({ owner: me, voir: true, petit: true });
    }
    html += '</div>';
    el.innerHTML = html;

    /* ---- anti double-appui : un seul acte par rendu, et les boutons qui
       apparaissent sous le doigt ne sont armés qu’après un instant ---- */
    var gen = (el._bnGen || 0) + 1;
    el._bnGen = gen;
    el._bnJoue = false;
    function libre() { return el._bnGen === gen && !el._bnJoue; }
    function agir(a) {
      if (!libre()) return false;
      el._bnJoue = true;
      var ok = ctx.act(a);
      if (ok === false) el._bnJoue = false;
      return ok;
    }
    var arme = Date.now() + (nouveauTir ? 450 : 250);
    var boutons = el.querySelectorAll('[data-a]');
    boutons.forEach(function (b) { b.disabled = true; });
    setTimeout(function () {
      if (el._bnGen === gen) boutons.forEach(function (b) { b.disabled = false; });
    }, s.finished ? 700 : (nouveauTir ? 450 : 250));
    boutons.forEach(function (b) {
      var a = b.getAttribute('data-a');
      b.addEventListener('click', function () {
        if (a === 'shuffle') { sfx.play('shuffle'); agir({ t: 'shuffle' }); }
        else if (a === 'ready') { sfx.play('select'); GG.haptic('medium'); agir({ t: 'ready' }); }
        else if (a === 'suite') { sfx.play('tap'); agir({ t: 'suite' }); }
        else if (a === 'again') { sfx.play('select'); agir({ t: 'again' }); }
        else if (a === 'fin') { sfx.play('select'); agir({ t: 'fin' }); }
      });
    });
    el.querySelectorAll('[data-r]').forEach(function (b) {
      b.addEventListener('click', function () {
        var k = b.getAttribute('data-r'), v = parseInt(b.getAttribute('data-v'), 10), a = { t: 'regles' };
        a[k] = k === 'manches' ? v : !!v;
        sfx.play('toggle');
        agir(a);
      });
    });
    // le tir (la carte n’est « prête » qu’après un instant : un double appui
    // sur « Voir mon jeu » ne doit pas tirer au hasard)
    var carte = el.querySelector('.bn-grid.aim');
    if (carte) {
      carte.setAttribute('data-pret', '0');
      setTimeout(function () { if (el._bnGen === gen) carte.setAttribute('data-pret', '1'); }, arme - Date.now() + 10);
    }
    el.querySelectorAll('.bn-grid.aim .bn-cell').forEach(function (cell) {
      cell.addEventListener('click', function () {
        if (Date.now() < arme) return;
        var i = parseInt(cell.dataset.i, 10);
        if (s.shots[opp][i]) { fx.shake(cell, 0.4); sfx.play('wrong', { volume: 0.4 }); return; }
        cell.classList.add('vise');
        sfx.play('whoosh', { volume: 0.7 });
        agir({ t: 'fire', i: i });
      });
    });

    /* ---- placement : glisser pour déplacer, toucher pour pivoter ---- */
    var gp = el.querySelector('.bn-grid.placement');
    if (gp) placement(gp, s.boards[me], s.opts, agir);

    /* ---- le tir qui vient d’arriver ---- */
    if (nouveauTir && s.phase === 'play' && dern) {
      animeTir(el, dern, me, s);
    } else if (nouveauTir && s.finished && dern) {
      animeTir(el, dern, me, s);
    }
    if (avant && s.finished && !avant.finVue) {
      el._v2.finVue = true;
      setTimeout(function () {
        if (el._bnGen !== gen) return;
        if (hotseat || s.winner === me) {
          sfx.play(s.serieGagnee ? 'fanfare' : 'success');
          GG.haptic('success');
          fx.confetti({ count: 90, duration: 2200 });
        } else {
          sfx.play('lose');
          GG.haptic('warning');
        }
      }, 900);
    } else if (avant && avant.finVue) el._v2.finVue = true;
  }

  /* L’obus part, file en laissant une traînée, puis le résultat éclate. */
  function animeTir(el, dern, me, s) {
    var fx = GG.fx, sfx = GG.sfx;
    var grid = el.querySelector('.bn-grid[data-owner="' + (dern.cible | 0) + '"]');
    if (!grid) return;
    var cell = grid.querySelector('.bn-cell[data-i="' + (dern.idx | 0) + '"]');
    if (!cell) return;
    var entrant = dern.cible === me;
    var depart;
    if (entrant) {
      var rg = grid.getBoundingClientRect();
      depart = { x: rg.left + rg.width / 2, y: Math.max(0, rg.top - 160) };
    } else {
      var mien = el.querySelector('.bn-grid[data-owner="' + me + '"]');
      var rm = mien ? mien.getBoundingClientRect() : { left: 0, width: 0, top: window.innerHeight };
      depart = { x: rm.left + rm.width / 2, y: Math.min(window.innerHeight, rm.top + 20) };
    }
    var duree = fx.reduced() ? 0 : 420;
    cell.classList.add('arrive');
    if (duree) {
      [1, 0.7, 0.5, 0.32].forEach(function (k, n) {
        setTimeout(function () {
          if (!cell.isConnected) return;
          fx.flyTo(depart, cell, {
            html: '<div class="bn-obus" style="transform:scale(' + k + ');opacity:' + (0.4 + 0.6 * k) + '"></div>',
            duration: duree, arc: entrant ? 0.05 : 0.32, scaleTo: 0.8
          });
        }, n * 26);
      });
      if (!entrant) sfx.play('whoosh', { volume: 0.6 });
    }
    setTimeout(function () {
      // l’écran a pu changer entre-temps (passage du téléphone…)
      if (!cell.isConnected) return;
      cell.classList.remove('arrive');
      cell.classList.add('pop');
      if (dern.res === 'eau') {
        sfx.play('splash');
        GG.haptic('light');
        fx.burst(cell, { count: 12, shape: 'circle', colors: ['#dff4ff', '#8fd3ff', '#ffffff'], spread: 0.5, size: 0.6 });
      } else if (dern.res === 'touche') {
        sfx.play('hit');
        GG.haptic('heavy');
        fx.burst(cell, { count: 18, shape: 'spark', colors: ['#ffd23f', '#ff7a1a', '#ff3b2f'], spread: 0.8 });
      } else {
        sfx.play('sink');
        GG.haptic('heavy');
        fx.burst(cell, { count: 26, shape: 'spark', colors: ['#ffd23f', '#ff7a1a', '#ff3b2f', '#ffffff'], spread: 1.1 });
        fx.shakeScreen(0.8);
        fx.floatText(cell, 'Coulé !', { color: '#ffd23f', size: 26 });
        var epave = grid.querySelector('.bn-navire[data-s="' + (dern.navire | 0) + '"]');
        if (epave) epave.classList.add('sombre');
      }
    }, duree + 60);
  }

  /* Glisser-déposer des navires pendant le placement (pointeurs : doigt ou souris). */
  function placement(grid, board, opts, agir) {
    var sfx = GG.sfx, fx = GG.fx;
    grid.querySelectorAll('.bn-navire').forEach(function (nav) {
      var f = parseInt(nav.getAttribute('data-s'), 10), sh = board.ships[f];
      var depart = null, ombre = null, cible = null;
      function caseSous(x, y) {
        var rg = grid.getBoundingClientRect(), t = rg.width / N;
        return { r: Math.floor((y - rg.top) / t), c: Math.floor((x - rg.left) / t), t: t, rg: rg };
      }
      nav.addEventListener('pointerdown', function (ev) {
        if (ev.button > 0) return;
        ev.preventDefault();
        var k = caseSous(ev.clientX, ev.clientY);
        depart = { x: ev.clientX, y: ev.clientY, dr: k.r - sh.r, dc: k.c - sh.c, bouge: false };
        try { nav.setPointerCapture(ev.pointerId); } catch (e) {}
        nav.classList.add('saisi');
        sfx.play('tap', { volume: 0.5 });
      });
      nav.addEventListener('pointermove', function (ev) {
        if (!depart) return;
        var dx = ev.clientX - depart.x, dy = ev.clientY - depart.y;
        if (!depart.bouge && Math.abs(dx) + Math.abs(dy) < 7) return;
        depart.bouge = true;
        nav.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
        var k = caseSous(ev.clientX, ev.clientY);
        var r = k.r - depart.dr, c = k.c - depart.dc;
        var cl = cellsOf(r, c, sh.h, sh.size);
        var ok = !!cl && placeLibre(board.ships, f, cl, !!opts.colles);
        cible = cl ? { r: r, c: c, ok: ok } : null;
        if (!ombre) { ombre = document.createElement('div'); ombre.className = 'bn-ombre'; grid.appendChild(ombre); }
        if (cl) {
          ombre.style.cssText = styleNavire({ r: r, c: c, h: sh.h, size: sh.size });
          ombre.className = 'bn-ombre ' + (ok ? 'ok' : 'ko');
        } else ombre.className = 'bn-ombre cachee';
      });
      function fin(ev, annule) {
        if (!depart) return;
        var d = depart;
        depart = null;
        nav.classList.remove('saisi');
        if (ombre && ombre.parentNode) ombre.parentNode.removeChild(ombre);
        ombre = null;
        if (annule) { nav.style.transform = ''; return; }
        if (!d.bouge) {
          // simple toucher : pivoter autour de la case touchée, en restant dans la grille
          var h = !sh.h, r = sh.r, c = sh.c;
          if (h) { c = sh.c - d.dr; r = sh.r + d.dr; } else { r = sh.r - d.dc; c = sh.c + d.dc; }
          var essais = [[r, c]];
          for (var dd = 1; dd < sh.size; dd++) essais.push(h ? [r, c - dd] : [r - dd, c]);
          for (var q = 0; q < essais.length; q++) {
            var rr = Math.max(0, Math.min(N - (h ? 1 : sh.size), essais[q][0]));
            var cc = Math.max(0, Math.min(N - (h ? sh.size : 1), essais[q][1]));
            var cl = cellsOf(rr, cc, h, sh.size);
            if (cl && placeLibre(board.ships, f, cl, !!opts.colles)) {
              sfx.play('swap');
              GG.haptic('select');
              agir({ t: 'place', s: f, r: rr, c: cc, h: h });
              return;
            }
          }
          sfx.play('wrong', { volume: 0.5 });
          GG.haptic('error');
          fx.shake(nav, 0.5);
          return;
        }
        if (cible && cible.ok) {
          sfx.play('place');
          GG.haptic('light');
          agir({ t: 'place', s: f, r: cible.r, c: cible.c, h: sh.h });
          // en réseau, la réponse de l’hôte redessine tout ; sinon on revient
          setTimeout(function () { if (nav.isConnected) nav.style.transform = ''; }, 1500);
        } else {
          sfx.play('wrong', { volume: 0.5 });
          nav.style.transition = 'transform .25s cubic-bezier(.34,1.56,.64,1)';
          nav.style.transform = '';
        }
        cible = null;
      }
      nav.addEventListener('pointerup', function (ev) { fin(ev, false); });
      nav.addEventListener('pointercancel', function (ev) { fin(ev, true); });
    });
  }

  GG.register(mod);
  if (typeof module === 'object' && module.exports) module.exports = mod;
})(typeof self !== 'undefined' ? self : globalThis);
