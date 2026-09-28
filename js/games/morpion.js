/* GGgames — Morpion (2 joueurs, série en 1, 3 ou 5 manches gagnantes).
 *
 * V2 : une page de carnet à spirale, une grille tracée à la main qui se
 * dessine sous vos yeux, des X et des O écrits au feutre (tracé animé), la
 * ligne gagnante surlignée au fluo. Trois niveaux d’IA : facile, moyen,
 * difficile (minimax complet : imbattable).
 */
(function (root) {
  'use strict';
  var GG = root.GG;
  var LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];
  var SERIES = [1, 3, 5];

  function newRound(state) {
    state.grid = [null, null, null, null, null, null, null, null, null];
    state.current = state.starter;
    state.roundOver = false;
    state.winner = -1;
    state.line = [];
    state.draw = false;
    state.coups = 0;
    state.dernier = -1;
  }
  function manches(state) {
    var n = state.opts && state.opts.manches;
    return SERIES.indexOf(n) !== -1 ? n : 3;
  }
  function ligneDe(grid) {
    for (var l = 0; l < LINES.length; l++) {
      var ln = LINES[l];
      if (grid[ln[0]] && grid[ln[0]] === grid[ln[1]] && grid[ln[1]] === grid[ln[2]]) return ln;
    }
    return null;
  }

  /* ================= IA =================
     Minimax complet (le morpion n’a que quelques milliers de positions) :
     valeur exacte de chaque coup, mémorisée par position. */
  var memo = {};
  function valeur(grid, moi, lui, aMoi) {
    var cle = grid.map(function (v) { return v || '-'; }).join('') + (aMoi ? moi : lui) + moi;
    if (memo.hasOwnProperty(cle)) return memo[cle];
    var ln = ligneDe(grid), res;
    if (ln) res = grid[ln[0]] === moi ? 10 : -10;
    else if (grid.every(function (v) { return v; })) res = 0;
    else {
      res = aMoi ? -99 : 99;
      for (var i = 0; i < 9; i++) {
        if (grid[i]) continue;
        grid[i] = aMoi ? moi : lui;
        var v = valeur(grid, moi, lui, !aMoi);
        grid[i] = null;
        // une victoire rapide vaut mieux qu’une lente, une défaite lointaine
        // mieux qu’une proche
        v = v > 0 ? v - 1 : (v < 0 ? v + 1 : 0);
        if (aMoi ? v > res : v < res) res = v;
      }
    }
    memo[cle] = res;
    return res;
  }
  /* valeur exacte de chaque case libre pour le joueur « moi » qui a le trait */
  function valeursCoups(grid, moi) {
    var lui = moi === 'X' ? 'O' : 'X', g = grid.slice(), out = [];
    for (var i = 0; i < 9; i++) {
      if (g[i]) continue;
      g[i] = moi;
      var v = valeur(g, moi, lui, false);
      g[i] = null;
      out.push({ i: i, v: v });
    }
    return out;
  }
  // cases qui complètent une ligne pour un symbole
  function decisives(grid, jeton) {
    var res = [];
    for (var l = 0; l < LINES.length; l++) {
      var ln = LINES[l], vide = -1, n = 0;
      for (var k = 0; k < 3; k++) {
        if (grid[ln[k]] === jeton) n++;
        else if (!grid[ln[k]]) vide = ln[k];
      }
      if (n === 2 && vide !== -1 && res.indexOf(vide) === -1) res.push(vide);
    }
    return res;
  }
  function auHasard(l) { return l[Math.floor(Math.random() * l.length)]; }
  /* nombre de réponses adverses qui perdent : pour tendre des pièges */
  function pieges(grid, i, moi) {
    var lui = moi === 'X' ? 'O' : 'X', g = grid.slice(), n = 0;
    g[i] = moi;
    if (ligneDe(g)) return 9;
    for (var j = 0; j < 9; j++) {
      if (g[j]) continue;
      g[j] = lui;
      if (!ligneDe(g) && valeur(g, moi, lui, true) > 0) n++;
      g[j] = null;
    }
    return n;
  }

  /* Niveau difficile : tous les coups qu’il peut choisir. Valeur exacte
     d’abord (il ne perd jamais), puis parmi les coups parfaits ceux qui
     tendent le plus de pièges ; à égalité, un peu de variété. */
  function candidatsDifficile(grid, moi) {
    var libres = [];
    for (var i = 0; i < 9; i++) if (!grid[i]) libres.push(i);
    if (libres.length === 9) return [0, 2, 6, 8, 4];
    var gagne = decisives(grid, moi);
    if (gagne.length) return gagne;
    var vs = valeursCoups(grid, moi), top = -99;
    vs.forEach(function (c) { if (c.v > top) top = c.v; });
    var parfaits = vs.filter(function (c) { return c.v === top; });
    var maxP = -1, choix = [];
    parfaits.forEach(function (c) {
      var p = pieges(grid, c.i, moi);
      if (p > maxP) { maxP = p; choix = [c.i]; } else if (p === maxP) choix.push(c.i);
    });
    return choix.length ? choix : libres;
  }

  function coupIA(state, me, niveau) {
    var grid = state.grid;
    var moi = me === 0 ? 'X' : 'O', lui = me === 0 ? 'O' : 'X';
    var libres = [];
    for (var i = 0; i < 9; i++) if (!grid[i]) libres.push(i);
    if (!libres.length) return -1;
    var gagne = decisives(grid, moi), menace = decisives(grid, lui);
    if (niveau === 'facile') {
      // un enfant : il voit souvent sa victoire, pare une fois sur deux
      if (gagne.length && Math.random() < 0.75) return gagne[0];
      if (menace.length && Math.random() < 0.5) return menace[0];
      if (libres.length === 9 && Math.random() < 0.5) return 4;
      return auHasard(libres);
    }
    if (gagne.length) return gagne[0];
    if (menace.length) return menace[0];
    if (niveau === 'difficile') return auHasard(candidatsDifficile(grid, moi));
    // moyen : gagne et pare toujours ; sinon joue juste deux fois sur trois,
    // et la troisième il suit son instinct (le centre s’il est libre, puis
    // une case au hasard) — il peut tomber dans une fourchette
    if (libres.length === 9) return Math.random() < 0.6 ? 4 : auHasard([0, 2, 6, 8]);
    if (Math.random() < 0.67) {
      var vm = valeursCoups(grid, moi), tm = -99;
      vm.forEach(function (c) { if (c.v > tm) tm = c.v; });
      return auHasard(vm.filter(function (c) { return c.v === tm; })).i;
    }
    if (!grid[4]) return 4;
    return auHasard(libres);
  }

  /* ================= dessin « à la main » =================
     Un petit générateur pseudo-aléatoire, graine = partie + manche + case :
     chaque trait garde la même forme d’un rendu à l’autre. */
  function graine(n) {
    var s = (n | 0) || 1;
    return function () {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
      return ((s >>> 0) % 10000) / 10000;
    };
  }
  function f(x) { return x.toFixed(1); }
  function traitX(r) {
    var j = function (a) { return (r() - 0.5) * a; };
    return 'M' + f(22 + j(6)) + ' ' + f(20 + j(6)) + 'Q' + f(50 + j(10)) + ' ' + f(52 + j(10)) + ' ' + f(79 + j(6)) + ' ' + f(80 + j(6)) +
      '|M' + f(78 + j(6)) + ' ' + f(22 + j(6)) + 'Q' + f(52 + j(10)) + ' ' + f(47 + j(10)) + ' ' + f(21 + j(6)) + ' ' + f(79 + j(6));
  }
  function traitO(r) {
    var j = function (a) { return (r() - 0.5) * a; };
    // deux demi-cercles de Bézier (poignées à 4/3 du rayon), l’un qui
    // déborde un peu : le geste du feutre qui referme le rond
    var cx = 50 + j(4), cy = 50 + j(4), rx = 29 + j(4), ry = 29 + j(4);
    return 'M' + f(cx + 4) + ' ' + f(cy - ry - 1) +
      'C' + f(cx + rx * 1.36) + ' ' + f(cy - ry) + ' ' + f(cx + rx * 1.34) + ' ' + f(cy + ry * 0.98) + ' ' + f(cx + 1) + ' ' + f(cy + ry) +
      'C' + f(cx - rx * 1.33) + ' ' + f(cy + ry * 1.02) + ' ' + f(cx - rx * 1.36) + ' ' + f(cy - ry * 0.96) + ' ' + f(cx - 8 + j(4)) + ' ' + f(cy - ry + 3);
  }
  function grilleMain(r) {
    var j = function (a) { return (r() - 0.5) * a; };
    var d = [];
    [100, 200].forEach(function (x) {
      d.push('M' + f(x + j(6)) + ' ' + f(14 + j(8)) + 'Q' + f(x + j(10)) + ' 150 ' + f(x + j(6)) + ' ' + f(286 + j(8)));
    });
    [100, 200].forEach(function (y) {
      d.push('M' + f(14 + j(8)) + ' ' + f(y + j(6)) + 'Q150 ' + f(y + j(10)) + ' ' + f(286 + j(8)) + ' ' + f(y + j(6)));
    });
    return d;
  }

  var mod = {
    id: 'morpion',
    nom: 'Morpion',
    icone: '⭕',
    desc: 'Le tic-tac-toe au feutre, en série de 1, 3 ou 5 manches.',
    regles: '<p><strong>🎯 Le but :</strong> aligner 3 de vos symboles — en ligne, en colonne ou en diagonale — avant l’adversaire.</p><p><strong>Comment jouer :</strong> touchez une case libre, chacun son tour. Bloquez l’adversaire, tendez des pièges : deux menaces à la fois, c’est gagné !</p><p><strong>La série :</strong> avant le premier coup, choisissez 1, 3 ou 5 manches gagnantes. On commence chacun son tour.</p>',
    min: 2, max: 2,
    hotseat: true, hidden: false, netOnly: false,
    niveaux: ['facile', 'moyen', 'difficile'],

    create: function (names) {
      var state = {
        id: Math.floor(Math.random() * 1e9),
        players: names.map(function (n) { return { name: n, wins: 0 }; }),
        starter: 0,
        opts: { manches: 3 },
        manche: 1,
        serieGagnee: false,
        fini: false
      };
      newRound(state);
      return state;
    },

    turnOf: function (state) { return state.roundOver || state.fini ? -1 : state.current; },
    over: function (state) { return !!state.fini; },
    scoreOf: function (state, i) { return state.players[i].wins; },
    gagnants: function (state) {
      var n = manches(state), g = [];
      state.players.forEach(function (p, i) { if (p.wins >= n) g.push(i); });
      return g;
    },
    summary: function (state) {
      var g = mod.gagnants(state);
      var rows = state.players.map(function (p, i) { return { n: p.name, s: p.wins, i: i }; })
        .sort(function (a, b) { return b.s - a.s; });
      return rows.map(function (r) {
        return '<div class="final-line"><span>' + (r.i === 0 ? '✖️ ' : '⭕ ') + GG.esc(r.n) +
          '</span><strong>' + (r.s | 0) + ' manche' + (r.s > 1 ? 's' : '') + '</strong></div>';
      }).join('') + (g.length ? '<h3>🏆 ' + GG.esc(state.players[g[0]].name) + ' remporte la série !</h3>' : '');
    },

    apply: function (state, player, action) {
      action = action || {};
      if (action.t === 'fin') {
        if (state.fini) return player === -1 ? { ok: true } : { ok: false, error: 'La partie est finie.' };
        if (!state.serieGagnee) return player === -1 ? { ok: true } : { ok: false, error: 'La série continue.' };
        state.fini = true;
        return { ok: true };
      }
      if (state.fini) return { ok: false, error: 'La partie est finie.' };
      if (action.t === 'serie') {
        var n = action.n | 0;
        if (SERIES.indexOf(n) === -1) return { ok: false, error: 'Série inconnue.' };
        if (state.manche !== 1 || state.coups > 0 || state.roundOver) {
          return { ok: false, error: 'La série est déjà lancée.' };
        }
        state.opts = { manches: n };
        return { ok: true };
      }
      if (action.t === 'again') {
        if (!state.roundOver) return { ok: false, error: 'La manche n’est pas finie.' };
        if (state.serieGagnee) return { ok: false, error: 'La série est terminée.' };
        state.starter = 1 - state.starter;
        state.manche = (state.manche || 1) + 1;
        newRound(state);
        return { ok: true };
      }
      if (action.t !== 'play') return { ok: false, error: 'Action inconnue.' };
      if (state.roundOver) return { ok: false, error: 'Manche terminée.' };
      if (player !== state.current) return { ok: false, error: 'Ce n’est pas votre tour.' };
      var i = action.i | 0;
      if (i < 0 || i > 8 || state.grid[i]) return { ok: false, error: 'Case invalide.' };
      state.grid[i] = player === 0 ? 'X' : 'O';
      state.coups = (state.coups || 0) + 1;
      state.dernier = i;
      var ln = ligneDe(state.grid);
      if (ln) {
        state.roundOver = true;
        state.winner = player;
        state.line = ln;
        state.players[player].wins++;
        if (state.players[player].wins >= manches(state)) {
          state.serieGagnee = true;
          return { ok: true, timer: { ms: 2400, action: { t: 'fin' } } };
        }
        return { ok: true };
      }
      if (state.grid.every(function (c) { return c; })) {
        state.roundOver = true;
        state.draw = true;
      } else {
        state.current = 1 - state.current;
      }
      return { ok: true };
    },

    /* L’adversaire IA :
       - facile : un enfant, il voit souvent sa victoire mais pare mal ;
       - moyen : gagne et pare toujours, joue juste 3 fois sur 4 ;
       - difficile : minimax complet, imbattable, et il tend des pièges. */
    bot: function (state, me, ctx) {
      if (state.roundOver || state.fini) return null;
      if (state.current !== me) return null;
      var niveau = (ctx && ctx.niveau) || state.niveauIA || 'moyen';
      var i = coupIA(state, me, niveau);
      return i < 0 ? null : { t: 'play', i: i };
    },

    render: function (el, ctx) {
      var s = ctx.state;
      var fx = GG.fx, sfx = GG.sfx;
      var solo = ctx.mode === 'local' && !!s.niveauIA;
      var hotseat = ctx.mode === 'local' && !s.niveauIA;
      var mine = !s.roundOver && !s.fini && ctx.me === s.current;
      var nMan = manches(s);
      var SYM = ['x', 'o'];

      var cle = s.id + ':' + (s.manche || 1);
      var avant = el._v2 && el._v2.jeu === 'morpion' ? el._v2 : null;
      var nouveau = avant && avant.cle === cle && s.coups === avant.coups + 1 && s.dernier >= 0;
      var nouvellePage = !avant || avant.cle !== cle;
      var finManche = nouveau && s.roundOver;
      el._v2 = { jeu: 'morpion', cle: cle, coups: s.coups };

      var html = '<div class="ttt-v2">';
      if ((s.manche || 1) === 1 && !s.coups && !s.roundOver) {
        html += '<div class="ttt-serie choix"><span>Série en</span>';
        SERIES.forEach(function (n) {
          html += '<button class="ttt-serie-btn' + (n === nMan ? ' on' : '') + '" data-serie="' + n + '">' + n + '</button>';
        });
        html += '<span>manche' + (nMan > 1 ? 's' : '') + ' gagnante' + (nMan > 1 ? 's' : '') + '</span></div>';
      } else {
        html += '<div class="ttt-serie">';
        [0, 1].forEach(function (i) {
          var pips = '';
          for (var k = 0; k < nMan; k++) pips += '<i class="' + (k < s.players[i].wins ? 'on ' + SYM[i] : '') + '"></i>';
          html += '<span class="ttt-pips">' + (i === 1 ? pips : '') + '<b>' + GG.esc(s.players[i].name) + '</b>' +
            (i === 0 ? pips : '') + '</span>';
          if (i === 0) html += '<span class="ttt-manche">Manche ' + ((s.manche | 0) || 1) + '</span>';
        });
        html += '</div>';
      }
      var marque = function (i) { return '<span class="ttt-mini ' + SYM[i] + '">' + (i === 0 ? '✕' : '◯') + '</span>'; };
      var msg;
      if (s.roundOver) {
        if (s.draw) msg = '🤝 Match nul : personne ne passe !';
        else msg = '🏆 ' + GG.esc(s.players[s.winner].name) + (s.serieGagnee ? ' remporte la série !' : ' gagne la manche !');
      } else if (mine) {
        msg = marque(s.current) + (hotseat ? 'À toi, <b>' + GG.esc(s.players[s.current].name) + '</b> !' : 'À vous de jouer !');
      } else {
        msg = marque(s.current) + (solo ? GG.esc(s.players[s.current].name) + ' réfléchit…'
          : 'Au tour de ' + GG.esc(s.players[s.current].name) + '…');
      }
      html += '<p class="mini-msg ttt-msg">' + msg + '</p>';

      // ---- la page de carnet ----
      var rg = graine(s.id * 7 + (s.manche || 1) * 131);
      var traits = grilleMain(rg);
      html += '<div class="ttt-carnet' + (nouvellePage ? ' page' : '') + '"><div class="ttt-spirale"></div>' +
        '<div class="ttt-feuille"><svg class="ttt-grille" viewBox="0 0 300 300" aria-hidden="true">';
      traits.forEach(function (d, k) {
        html += '<path d="' + d + '" pathLength="1" style="--k:' + k + '"/>';
      });
      html += '</svg><div class="ttt-board" data-pret="1">';
      for (var i = 0; i < 9; i++) {
        var v = s.grid[i];
        var win = s.line.indexOf(i) !== -1;
        html += '<button class="ttt-cell' + (win ? ' win' : '') + (v ? ' pleine' : '') + '" data-i="' + i +
          '" aria-label="Case ' + (i + 1) + (v ? (v === 'X' ? ' : X' : ' : O') : '') + '">';
        if (v) {
          var r2 = graine(s.id * 13 + (s.manche || 1) * 977 + i * 31 + 7);
          var parts = (v === 'X' ? traitX(r2) : traitO(r2)).split('|');
          html += '<svg class="ttt-sym ' + (v === 'X' ? 'x' : 'o') + (nouveau && i === s.dernier ? ' nouveau' : '') +
            '" viewBox="0 0 100 100" aria-hidden="true">';
          parts.forEach(function (d, k) { html += '<path d="' + d + '" pathLength="1" style="--k:' + k + '"/>'; });
          html += '</svg>';
        }
        html += '</button>';
      }
      html += '</div>';
      if (s.line.length === 3) {
        var cxy = function (c) { return [50 + 100 * (c % 3), 50 + 100 * Math.floor(c / 3)]; };
        var a = cxy(s.line[0]), b = cxy(s.line[2]);
        var dx = b[0] - a[0], dy = b[1] - a[1], L = Math.sqrt(dx * dx + dy * dy);
        var ex = dx / L * 34, ey = dy / L * 34;
        html += '<svg class="ttt-fluo' + (finManche ? ' nouveau' : '') + '" viewBox="0 0 300 300" aria-hidden="true">' +
          '<path class="surligne" d="M' + f(a[0] - ex) + ' ' + f(a[1] - ey) + 'L' + f(b[0] + ex) + ' ' + f(b[1] + ey) + '" pathLength="1"/>' +
          '<path class="barre" d="M' + f(a[0] - ex * 0.8) + ' ' + f(a[1] - ey * 0.8 + 3) + 'Q' + f((a[0] + b[0]) / 2 + 4) + ' ' +
          f((a[1] + b[1]) / 2 - 5) + ' ' + f(b[0] + ex * 0.8) + ' ' + f(b[1] + ey * 0.8 - 2) + '" pathLength="1"/></svg>';
      }
      html += '</div></div>';
      if (s.roundOver) {
        html += '<div class="mini-actions">' + (s.serieGagnee
          ? '<button class="btn big jeu" data-a="fin">🎉 Voir le résultat</button>'
          : '<button class="btn big primary" data-a="again" disabled>Manche suivante ▶</button>') + '</div>';
      }
      html += '</div>';
      el.innerHTML = html;

      // ---- anti double-appui (même principe que le Puissance 4) ----
      var board = el.querySelector('.ttt-board');
      var gen = (el._tttGen || 0) + 1;
      el._tttGen = gen;
      if (el._tttMan !== cle) el._tttGel = 0;
      else if (ctx.mode === 'local' && el._tttCur !== s.current) el._tttGel = Date.now() + 420;
      el._tttCur = s.current;
      el._tttMan = cle;
      var reste = (el._tttGel || 0) - Date.now();
      if (reste > 0) {
        board.setAttribute('data-pret', '0');
        setTimeout(function () { if (el._tttGen === gen) board.setAttribute('data-pret', '1'); }, reste + 10);
      }
      el._tttJoue = false;
      function libre() { return el._tttGen === gen && !el._tttJoue && Date.now() >= (el._tttGel || 0); }

      el.querySelectorAll('.ttt-cell').forEach(function (cell) {
        cell.addEventListener('click', function () {
          if (!mine || !libre()) return;
          var i3 = parseInt(cell.dataset.i, 10);
          if (s.grid[i3]) { fx.shake(cell, 0.4); sfx.play('wrong', { volume: 0.4 }); return; }
          el._tttJoue = true;
          if (ctx.act({ t: 'play', i: i3 }) === false) el._tttJoue = false;
        });
      });
      el.querySelectorAll('[data-serie]').forEach(function (b2) {
        b2.addEventListener('click', function () {
          if (!libre()) return;
          sfx.play('toggle');
          ctx.act({ t: 'serie', n: parseInt(b2.dataset.serie, 10) });
        });
      });
      var again = el.querySelector('[data-a="again"]');
      if (again) {
        setTimeout(function () { again.disabled = false; }, finManche ? 650 : 300);
        again.addEventListener('click', function () { if (libre()) { el._tttJoue = true; sfx.play('select'); ctx.act({ t: 'again' }); } });
      }
      var fin = el.querySelector('[data-a="fin"]');
      if (fin) fin.addEventListener('click', function () { if (libre()) { el._tttJoue = true; sfx.play('select'); ctx.act({ t: 'fin' }); } });

      // ---- effets ----
      if (nouvellePage && avant) sfx.play('flip');
      if (nouveau) {
        var sym = s.grid[s.dernier];
        sfx.play('place', { pitch: sym === 'X' ? 1.08 : 0.92 });
        GG.haptic('light');
        if (finManche) {
          setTimeout(function () {
            if (el._tttGen !== gen) return;
            if (s.draw) { sfx.play('draw'); fx.shake(el.querySelector('.ttt-feuille'), 0.35); return; }
            if (hotseat || s.winner === ctx.me) {
              sfx.play(s.serieGagnee ? 'fanfare' : 'success');
              GG.haptic('success');
              fx.confetti({ count: 70, from: el.querySelector('.ttt-feuille'), duration: 2000 });
            } else {
              sfx.play('wrong');
              GG.haptic('warning');
            }
          }, fx.reduced() ? 0 : 420);
        }
      }
    },

    _coupIA: coupIA,
    _valeurs: valeursCoups,
    _candidatsDifficile: candidatsDifficile
  };

  GG.register(mod);
  if (typeof module === 'object' && module.exports) module.exports = mod;
})(typeof self !== 'undefined' ? self : globalThis);
