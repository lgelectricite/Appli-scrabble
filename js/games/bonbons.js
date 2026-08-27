/*
 * GGgames — Bonbons (jeu d'alignements type match-3, 1 à 4 joueurs).
 * Alignez 3 bonbons pour les croquer. 4 alignés = bonbon rayé (raye toute
 * une ligne), 5 alignés = sucre magique (croque toute une couleur). En
 * réseau : même grille de départ pour tous, meilleur score au bout des
 * coups impartis.
 */
(function (root) {
  'use strict';
  var GG = root.GG;
  var N = 8; // grille 8×8
  var EMOJIS = ['🍬', '🍭', '🍫', '🍩', '🧁', '🍪'];
  var LEVELS = {
    facile: { nom: 'Facile', types: 5, coups: 25, cible: 1500 },
    moyen: { nom: 'Moyen', types: 6, coups: 20, cible: 1800 },
    difficile: { nom: 'Difficile', types: 6, coups: 14, cible: 2000 }
  };
  var ARC = -1; // sucre magique (joker de couleur)

  function cell(t) { return { t: t, s: 0 }; } // s : 0 normal, 1 raye la ligne, 2 raye la colonne

  /* Grille de départ SANS alignement déjà formé (sinon points gratuits). */
  function buildBoard(types) {
    var b = new Array(N * N);
    for (var i = 0; i < N * N; i++) {
      var t;
      var guard = 0;
      do {
        t = Math.floor(Math.random() * types);
        guard++;
      } while (guard < 20 && createsRun(b, i, t));
      b[i] = cell(t);
    }
    return b;
  }

  function createsRun(b, i, t) {
    var r = Math.floor(i / N), c = i % N;
    if (c >= 2 && b[i - 1] && b[i - 2] && b[i - 1].t === t && b[i - 2].t === t) return true;
    if (r >= 2 && b[i - N] && b[i - 2 * N] && b[i - N].t === t && b[i - 2 * N].t === t) return true;
    return false;
  }

  /* Trouve tous les alignements de 3+ ; renvoie les séries (listes d'indices). */
  function findRuns(b) {
    var runs = [], r, c, i, start, t;
    for (r = 0; r < N; r++) {
      c = 0;
      while (c < N) {
        i = r * N + c;
        t = b[i] ? b[i].t : ARC;
        start = c;
        while (c < N && b[r * N + c] && b[r * N + c].t === t && t !== ARC) c++;
        if (t !== ARC && c - start >= 3) {
          var run = { cells: [], dir: 'h' };
          for (var k = start; k < c; k++) run.cells.push(r * N + k);
          runs.push(run);
        }
        if (c === start) c++;
      }
    }
    for (c = 0; c < N; c++) {
      r = 0;
      while (r < N) {
        i = r * N + c;
        t = b[i] ? b[i].t : ARC;
        start = r;
        while (r < N && b[r * N + c] && b[r * N + c].t === t && t !== ARC) r++;
        if (t !== ARC && r - start >= 3) {
          var run2 = { cells: [], dir: 'v' };
          for (var k2 = start; k2 < r; k2++) run2.cells.push(k2 * N + c);
          runs.push(run2);
        }
        if (r === start) r++;
      }
    }
    return runs;
  }

  /* Étend l'ensemble à effacer : un bonbon rayé emporte sa ligne/colonne. */
  function spread(b, marks) {
    var changed = true;
    while (changed) {
      changed = false;
      for (var i = 0; i < N * N; i++) {
        if (!marks[i] || !b[i]) continue;
        var r = Math.floor(i / N), c = i % N, k;
        if (b[i].s === 1) {
          b[i].s = 0;
          for (k = 0; k < N; k++) if (!marks[r * N + k]) { marks[r * N + k] = true; changed = true; }
        } else if (b[i].s === 2) {
          b[i].s = 0;
          for (k = 0; k < N; k++) if (!marks[k * N + c]) { marks[k * N + c] = true; changed = true; }
        }
      }
    }
  }

  /* Fait tomber les bonbons et en fait pleuvoir de nouveaux. */
  function drop(b, types) {
    for (var c = 0; c < N; c++) {
      var write = N - 1;
      for (var r = N - 1; r >= 0; r--) {
        if (b[r * N + c]) { b[write * N + c] = b[r * N + c]; write--; }
      }
      while (write >= 0) {
        b[write * N + c] = cell(Math.floor(Math.random() * types));
        write--;
      }
    }
  }

  /* Résout tous les alignements en cascade ; renvoie les points gagnés.
     swapIdx : la case échangée (elle devient le bonbon rayé du 4-aligné). */
  function resolve(b, types, swapIdx) {
    var total = 0, combo = 0, maxCombo = 0;
    for (var guard = 0; guard < 30; guard++) {
      var runs = findRuns(b);
      if (!runs.length) break;
      combo++;
      maxCombo = combo;
      var marks = {};
      var promote = []; // cases qui deviennent des bonbons spéciaux
      runs.forEach(function (run) {
        var pivot = run.cells.indexOf(swapIdx) !== -1 ? swapIdx
          : run.cells[Math.floor(run.cells.length / 2)];
        if (run.cells.length >= 5) {
          promote.push({ i: pivot, arc: true });
        } else if (run.cells.length === 4) {
          // aligné horizontalement → raye la colonne, et inversement
          promote.push({ i: pivot, s: run.dir === 'h' ? 2 : 1, t: b[pivot].t });
        }
        run.cells.forEach(function (i) { marks[i] = true; });
      });
      spread(b, marks);
      var cleared = 0;
      for (var i = 0; i < N * N; i++) {
        if (marks[i]) { b[i] = null; cleared++; }
      }
      promote.forEach(function (p) {
        if (p.arc) b[p.i] = { t: ARC, s: 0 };
        else b[p.i] = { t: p.t, s: p.s };
      });
      total += cleared * 10 * combo;
      drop(b, types);
      swapIdx = -1; // les cascades suivantes n'ont plus de case « pivot »
    }
    return { pts: total, combo: maxCombo };
  }

  /* Croque toute une couleur (échange avec un sucre magique). */
  function eatColor(b, types, t) {
    var marks = {};
    for (var i = 0; i < N * N; i++) {
      if (b[i] && (b[i].t === t || b[i].t === ARC)) marks[i] = true;
    }
    spread(b, marks);
    var cleared = 0;
    for (var j = 0; j < N * N; j++) if (marks[j]) { b[j] = null; cleared++; }
    drop(b, types);
    return cleared * 15;
  }

  function adjacent(a, b2) {
    var ra = Math.floor(a / N), ca = a % N, rb = Math.floor(b2 / N), cb = b2 % N;
    return (ra === rb && Math.abs(ca - cb) === 1) || (ca === cb && Math.abs(ra - rb) === 1);
  }

  function wouldMatch(b, a, b2) {
    var tmp = b[a]; b[a] = b[b2]; b[b2] = tmp;
    var ok = findRuns(b).length > 0;
    tmp = b[a]; b[a] = b[b2]; b[b2] = tmp;
    return ok;
  }

  /* Reste-t-il au moins un échange jouable ? (un sucre magique suffit) */
  function hasMove(b) {
    for (var i = 0; i < N * N; i++) {
      if (b[i].t === ARC) return true;
      var c = i % N;
      if (c < N - 1 && wouldMatch(b, i, i + 1)) return true;
      if (i < N * (N - 1) && wouldMatch(b, i, i + N)) return true;
    }
    return false;
  }

  /* Grille morte (aucun coup) : on ressert des bonbons frais, score conservé. */
  function ensurePlayable(b, types) {
    var guard = 0;
    while (!hasMove(b) && guard++ < 20) {
      var fresh = buildBoard(types);
      for (var i = 0; i < N * N; i++) b[i] = fresh[i];
    }
  }

  function allDone(state) {
    return state.players.every(function (p) { return p.moves <= 0; });
  }

  function stars(score, cible) {
    if (score >= cible * 2) return '⭐⭐⭐';
    if (score >= cible * 1.5) return '⭐⭐';
    if (score >= cible) return '⭐';
    return '—';
  }

  var mod = {
    id: 'bonbons',
    nom: 'Bonbons',
    icone: '🍬',
    desc: 'Alignez 3 bonbons pour les croquer : cascades, bonbons rayés et sucre magique !',
    regles: '<p><strong>🎯 Le but :</strong> marquer un maximum de points avant d’épuiser vos coups.</p>' +
      '<p><strong>Comment jouer :</strong> touchez un bonbon puis son voisin pour les échanger — l’échange doit former un alignement d’au moins 3 bonbons identiques, qui sont croqués. Les bonbons du dessus tombent, il en pleut de nouveaux : les cascades rapportent de plus en plus (×2, ×3…).</p>' +
      '<p><strong>🍭 Les spéciaux :</strong> 4 alignés = un <strong>bonbon rayé</strong> qui raye toute une ligne quand on le croque · 5 alignés = un <strong>sucre magique</strong> 🌟 : échangez-le avec n’importe quel bonbon pour croquer toute sa couleur !</p>' +
      '<p><strong>👥 À plusieurs :</strong> même grille de départ pour tout le monde, même nombre de coups — le meilleur score gagne.</p>',
    min: 1, max: 4,
    hotseat: true, hotseatMax: 1, hidden: false, netOnly: false,

    create: function (names) {
      return {
        players: names.map(function (n) {
          return { name: n, board: null, score: 0, moves: 0, lastGain: 0, lastCombo: 0 };
        }),
        phase: 'setup',
        level: null,
        types: 0,
        cible: 0,
        startTs: 0,
        finished: false
      };
    },

    turnOf: function (state) { return state.phase === 'setup' ? 0 : -1; },
    over: function (state) { return state.finished; },
    scoreOf: function (state, i) { return state.players[i].score; },

    summary: function (state) {
      var rows = state.players.map(function (p) { return { n: p.name, s: p.score }; })
        .sort(function (a, b) { return b.s - a.s; });
      var html = rows.map(function (r) {
        return '<div class="final-line"><span>' + GG.esc(r.n) + '</span><strong>' +
          r.s + ' pts · ' + stars(r.s, state.cible) + '</strong></div>';
      }).join('');
      html += '<p>🎯 Objectif : ' + state.cible + ' pts (⭐) · niveau ' +
        (LEVELS[state.level] ? LEVELS[state.level].nom : '') + '</p>';
      if (state.players.length === 1) {
        try {
          if (typeof localStorage !== 'undefined') {
            var key = 'gg-bonbons-best-' + state.level;
            var best = JSON.parse(localStorage.getItem(key) || 'null');
            var cur = { score: state.players[0].score, ts: state.startTs };
            if (!best || cur.score > best.score) localStorage.setItem(key, JSON.stringify(cur));
            var stored = JSON.parse(localStorage.getItem(key) || 'null');
            if (stored && stored.ts === state.startTs) html += '<h1>🏆 Nouveau record !</h1>';
            else if (stored) html += '<p>🏅 Record : ' + stored.score + ' pts.</p>';
          }
        } catch (e) {}
      } else {
        var top = rows.filter(function (r) { return r.s === rows[0].s; });
        html += '<h1>🏆 ' + top.map(function (r) { return GG.esc(r.n); }).join(' & ') + '</h1>';
      }
      return html;
    },

    /* Rien de secret : les grilles adverses sont publiques (course au score). */
    redact: function (state) { return GG.clone(state); },

    apply: function (state, player, action) {
      if (state.finished) return { ok: false, error: 'Partie terminée.' };
      var p = state.players[player];
      if (!p) return { ok: false, error: 'Joueur inconnu.' };

      if (action.t === 'level') {
        if (state.phase !== 'setup') return { ok: false, error: 'Niveau déjà choisi.' };
        if (player !== 0) return { ok: false, error: 'L’hôte choisit le niveau.' };
        var cfg = LEVELS[action.l];
        if (!cfg) return { ok: false, error: 'Niveau inconnu.' };
        var base = buildBoard(cfg.types);
        ensurePlayable(base, cfg.types);
        state.players.forEach(function (q) {
          q.board = GG.clone(base);
          q.moves = cfg.coups;
          q.score = 0;
        });
        state.level = action.l;
        state.types = cfg.types;
        state.cible = cfg.cible;
        state.phase = 'play';
        state.startTs = Date.now();
        return { ok: true };
      }

      if (state.phase !== 'play') return { ok: false, error: 'La partie n’a pas commencé.' };
      if (action.t === 'swap') {
        if (p.moves <= 0) return { ok: false, error: 'Plus de coups — on attend les autres.' };
        var a = action.a | 0, b2 = action.b | 0;
        if (a < 0 || a >= N * N || b2 < 0 || b2 >= N * N || !adjacent(a, b2)) {
          return { ok: false, error: 'Échangez deux bonbons voisins.' };
        }
        var b = p.board;
        var gain = 0, combo = 1;
        if (b[a].t === ARC || b[b2].t === ARC) {
          var other = b[a].t === ARC ? b[b2].t : b[a].t;
          if (other === ARC) {
            // deux sucres magiques échangés : toute la grille est croquée !
            for (var i = 0; i < N * N; i++) b[i] = null;
            drop(b, state.types);
            gain = N * N * 15;
          } else {
            // le sucre magique croque toute la couleur de son voisin
            b[b[a].t === ARC ? a : b2] = null;
            drop(b, state.types);
            gain = eatColor(b, state.types, other);
          }
        } else {
          if (!wouldMatch(b, a, b2)) {
            return { ok: false, error: 'Cet échange ne forme aucun alignement.' };
          }
          var tmp = b[a]; b[a] = b[b2]; b[b2] = tmp;
          var res = resolve(b, state.types, b2);
          gain = res.pts;
          combo = res.combo;
        }
        p.score += gain;
        p.lastGain = gain;
        p.lastCombo = combo;
        p.moves--;
        if (p.moves > 0) ensurePlayable(b, state.types);
        if (allDone(state)) {
          state.finished = true;
        }
        return { ok: true };
      }

      return { ok: false, error: 'Action inconnue.' };
    },

    render: function (el, ctx) {
      var s = ctx.state;
      var me = ctx.me;

      if (s.phase === 'setup') {
        el._bbSel = -1;
        var html0 = '<p class="mini-msg big-msg">🍬 Bonbons</p>';
        if (me === 0) {
          html0 += '<p class="mini-msg">Choisissez le niveau :</p><div class="lvl-btns">' +
            Object.keys(LEVELS).map(function (l) {
              var c = LEVELS[l];
              return '<button class="btn big" data-lvl="' + l + '">' +
                (l === 'facile' ? '😌' : l === 'moyen' ? '🙂' : '😈') + ' ' + c.nom +
                ' <small>' + c.coups + ' coups · ' + c.types + ' bonbons · objectif ' +
                c.cible + ' pts</small></button>';
            }).join('') + '</div>' +
            '<p class="hint">4 alignés = bonbon rayé · 5 alignés = sucre magique 🌟</p>';
        } else {
          html0 += '<p class="waiting">⏳ L’hôte choisit le niveau…</p>';
        }
        el.innerHTML = html0;
        el.querySelectorAll('[data-lvl]').forEach(function (btn) {
          btn.addEventListener('click', function () { ctx.act({ t: 'level', l: btn.dataset.lvl }); });
        });
        return;
      }

      var p = s.players[me];
      var sel = el._bbSel !== undefined ? el._bbSel : -1;
      if (sel !== -1 && (!p.board || !p.board[sel])) { sel = -1; el._bbSel = -1; }

      var html = '<div class="mem-stats">' +
        '<span class="mem-stat">🎯 <b>' + p.score + '</b> pts</span>' +
        '<span class="mem-stat">🍬 ' + p.moves + ' coup' + (p.moves > 1 ? 's' : '') + '</span>' +
        (p.lastGain > 0 ? '<span class="mem-stat bb-gain">+' + p.lastGain +
          (p.lastCombo > 1 ? ' · combo ×' + p.lastCombo : '') + '</span>' : '') +
        '</div>';

      html += '<div class="bb-grid">';
      for (var i = 0; i < N * N; i++) {
        var c2 = p.board[i];
        var cls = 'bb-cell t' + (c2.t === ARC ? 'x' : c2.t) +
          (i === sel ? ' sel' : '') + (c2.s ? ' raye' + c2.s : '');
        var glyph = c2.t === ARC ? '🌟' : EMOJIS[c2.t];
        html += '<button class="' + cls + '" data-i="' + i + '">' + glyph + '</button>';
      }
      html += '</div>';

      if (p.moves <= 0) html += '<p class="mini-msg">🍬 Plus de coups ! On attend les autres…</p>';
      else html += '<p class="hint">' + (sel === -1
        ? 'Touchez un bonbon, puis son voisin pour l’échanger.'
        : 'Touchez un bonbon voisin pour l’échanger.') + '</p>';

      if (s.players.length > 1) {
        html += '<div class="mem-stats">' + s.players.map(function (q, qi) {
          if (qi === me) return '';
          return '<span class="mem-stat">' + GG.esc(q.name) + ' : ' + q.score +
            ' pts · ' + q.moves + ' cp</span>';
        }).join('') + '</div>';
      }

      el.innerHTML = html;

      el.querySelectorAll('.bb-cell').forEach(function (btn) {
        btn.addEventListener('click', function () {
          if (p.moves <= 0) return;
          var i2 = parseInt(btn.dataset.i, 10);
          var cur = el._bbSel !== undefined ? el._bbSel : -1;
          if (cur === -1) {
            el._bbSel = i2;
            mod.render(el, ctx);
          } else if (cur === i2) {
            el._bbSel = -1;
            mod.render(el, ctx);
          } else if (adjacent(cur, i2)) {
            el._bbSel = -1;
            mod.render(el, ctx); // désélection AVANT l'action, jamais après
            ctx.act({ t: 'swap', a: cur, b: i2 });
          } else {
            el._bbSel = i2;
            mod.render(el, ctx);
          }
        });
      });
    },

    _findRuns: findRuns, _resolve: resolve, _buildBoard: buildBoard,
    _wouldMatch: wouldMatch, _hasMove: hasMove, _N: N // pour les tests
  };

  GG.register(mod);
  if (typeof module === 'object' && module.exports) module.exports = mod;
})(typeof self !== 'undefined' ? self : globalThis);
