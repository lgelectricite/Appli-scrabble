/* GGgames — Sudoku (solo, grilles générées, 3 niveaux). */
(function (root) {
  'use strict';
  var GG = root.GG;
  var LEVELS = {
    facile: { nom: 'Facile', clues: 40 },
    moyen: { nom: 'Moyen', clues: 32 },
    difficile: { nom: 'Difficile', clues: 26 }
  };

  /* ---------- générateur ---------- */

  function boxOf(i) { return Math.floor(i / 27) * 3 + Math.floor((i % 9) / 3); }

  function candidates(grid, i) {
    var used = {};
    var r = Math.floor(i / 9), c = i % 9, b = boxOf(i);
    for (var j = 0; j < 81; j++) {
      if (!grid[j]) continue;
      if (Math.floor(j / 9) === r || j % 9 === c || boxOf(j) === b) used[grid[j]] = true;
    }
    var out = [];
    for (var v = 1; v <= 9; v++) if (!used[v]) out.push(v);
    return out;
  }

  /* remplit une grille complète par retour arrière aléatoire */
  function fullGrid() {
    var grid = new Array(81).fill(0);
    function fill(i) {
      if (i === 81) return true;
      var cs = GG.shuffle(candidates(grid, i));
      for (var k = 0; k < cs.length; k++) {
        grid[i] = cs[k];
        if (fill(i + 1)) return true;
      }
      grid[i] = 0;
      return false;
    }
    fill(0);
    return grid;
  }

  /* compte les solutions (plafonné à `limit`) */
  function solveCount(grid, limit) {
    var count = 0;
    function step() {
      if (count >= limit) return;
      // case vide avec le moins de candidats
      var best = -1, bestC = null;
      for (var i = 0; i < 81; i++) {
        if (grid[i]) continue;
        var cs = candidates(grid, i);
        if (!cs.length) return;
        if (!bestC || cs.length < bestC.length) { best = i; bestC = cs; }
        if (cs.length === 1) break;
      }
      if (best === -1) { count++; return; }
      for (var k = 0; k < bestC.length; k++) {
        grid[best] = bestC[k];
        step();
        grid[best] = 0;
        if (count >= limit) return;
      }
    }
    step();
    return count;
  }

  /* retire des cases en préservant l'unicité de la solution */
  function makePuzzle(level) {
    var solution = fullGrid();
    var puzzle = solution.slice();
    var target = LEVELS[level].clues;
    var order = GG.shuffle(Object.keys(new Array(81).fill(0)).map(Number));
    var clues = 81;
    for (var k = 0; k < order.length && clues > target; k++) {
      var i = order[k];
      var saved = puzzle[i];
      puzzle[i] = 0;
      if (solveCount(puzzle.slice(), 2) === 1) clues--;
      else puzzle[i] = saved;
    }
    return { solution: solution, puzzle: puzzle, clues: clues };
  }

  function fmt(sec) {
    var m = Math.floor(sec / 60);
    return (m ? m + ' min ' : '') + (sec % 60) + ' s';
  }

  var mod = {
    id: 'sudoku',
    nom: 'Sudoku',
    icone: '🔢',
    desc: 'Grilles générées à volonté, 3 niveaux, records par niveau — le casse-tête du solitaire par excellence.',
    regles: '<p><strong>🎯 Le but :</strong> remplir la grille : chaque ligne, chaque colonne et chaque carré de 9 doit contenir les chiffres 1 à 9.</p><p><strong>Comment jouer :</strong> touchez une case vide puis un chiffre. Les erreurs sont comptées !</p><p><strong>⏱️ En solo :</strong> chrono, erreurs comptées et records par niveau.</p>',
    min: 1, max: 1,
    hotseat: true, hotseatMax: 1, hidden: false, netOnly: false,

    create: function (names) {
      return {
        players: names.map(function (n) {
          return { name: n, filled: 0, errors: 0, done: false, rank: 0 };
        }),
        phase: 'setup',
        level: null,
        puzzle: null,
        solution: null,
        grids: {},
        startTs: 0,
        durationSec: 0,
        finished: false,
        winner: -1
      };
    },

    turnOf: function () { return -1; }, // chacun remplit sa grille en même temps
    over: function (state) { return state.finished; },
    scoreOf: function (state, i) {
      var p = state.players[i];
      return p.done ? '🏁' : p.filled + (state.puzzle ? '/' + state.toFill : '');
    },

    summary: function (state) {
      var rows = state.players.map(function (p, i) { return { p: p, i: i }; })
        .sort(function (a, b) {
          return (b.p.done - a.p.done) || (a.p.rank - b.p.rank) ||
            (b.p.filled - a.p.filled) || (a.p.errors - b.p.errors);
        });
      var html = rows.map(function (r) {
        return '<div class="final-line"><span>' + GG.esc(r.p.name) + '</span><strong>' +
          (r.p.done ? '✅ terminé' : r.p.filled + '/' + state.toFill) +
          ' · ' + r.p.errors + ' erreur' + (r.p.errors > 1 ? 's' : '') + '</strong></div>';
      }).join('');
      html += '<p>⏱️ ' + fmt(state.durationSec) + ' · niveau ' +
        (LEVELS[state.level] ? LEVELS[state.level].nom : '') + '</p>';
      if (state.players.length === 1) {
        try {
          if (typeof localStorage !== 'undefined' && state.players[0].done) {
            var key = 'gg-sudoku-best-' + state.level;
            var best = JSON.parse(localStorage.getItem(key) || 'null');
            var cur = { sec: state.durationSec, err: state.players[0].errors, ts: state.startTs };
            if (!best || cur.sec < best.sec || (cur.sec === best.sec && cur.err < best.err)) {
              localStorage.setItem(key, JSON.stringify(cur));
            }
            var stored = JSON.parse(localStorage.getItem(key) || 'null');
            if (stored && stored.ts === state.startTs) html += '<h1>🏆 Nouveau record !</h1>';
            else if (stored) {
              html += '<p>🏅 Record (' + LEVELS[state.level].nom.toLowerCase() + ') : ' +
                fmt(stored.sec) + ' · ' + stored.err + ' erreur' + (stored.err > 1 ? 's' : '') + '.</p>';
            }
          }
        } catch (e) {}
      } else if (state.winner >= 0) {
        html += '<h1>🏆 ' + GG.esc(state.players[state.winner].name) + '</h1>';
      }
      return html;
    },

    /* la solution et les grilles des autres joueurs restent secrètes */
    redact: function (state, viewer) {
      var copy = GG.clone(state);
      delete copy.solution;
      var mine = copy.grids[viewer];
      copy.grids = {};
      if (mine) copy.grids[viewer] = mine;
      return copy;
    },

    apply: function (state, player, action) {
      if (state.finished) return { ok: false, error: 'Partie terminée.' };
      if (action.t === 'level') {
        if (state.phase !== 'setup') return { ok: false, error: 'Niveau déjà choisi.' };
        if (player !== 0) return { ok: false, error: 'L’hôte choisit le niveau.' };
        if (!LEVELS[action.l]) return { ok: false, error: 'Niveau inconnu.' };
        state.level = action.l;
        var made = makePuzzle(action.l);
        state.solution = made.solution;
        state.puzzle = made.puzzle;
        state.toFill = made.puzzle.filter(function (v) { return v === 0; }).length;
        state.players.forEach(function (_, i) { state.grids[i] = made.puzzle.slice(); });
        state.phase = 'play';
        state.startTs = Date.now();
        return { ok: true };
      }
      if (state.phase !== 'play') return { ok: false, error: 'La partie n’a pas commencé.' };
      if (action.t === 'set') {
        var p = state.players[player];
        if (p.done) return { ok: false, error: 'Vous avez déjà terminé !' };
        var i = action.i | 0, v = action.v | 0;
        var grid = state.grids[player];
        if (!grid || i < 0 || i >= 81) return { ok: false, error: 'Case invalide.' };
        if (state.puzzle[i] !== 0) return { ok: false, error: 'Case imposée.' };
        if (v === 0) { // effacer
          if (grid[i]) { grid[i] = 0; p.filled--; }
          return { ok: true };
        }
        if (v < 1 || v > 9) return { ok: false, error: 'Chiffre invalide.' };
        if (grid[i] === v) return { ok: true };
        if (state.solution[i] !== v) {
          p.errors++;
          return { ok: false, error: '❌ Ce n’est pas le bon chiffre. (' + p.errors + ' erreur' +
            (p.errors > 1 ? 's' : '') + ')' };
        }
        if (!grid[i]) p.filled++;
        grid[i] = v;
        if (p.filled >= state.toFill) {
          p.done = true;
          p.rank = state.players.filter(function (q) { return q.done; }).length;
          if (state.winner === -1) state.winner = player;
          // la partie s'arrête dès qu'un joueur termine (les autres sont classés)
          state.finished = true;
          state.durationSec = Math.max(1, Math.round((Date.now() - state.startTs) / 1000));
        }
        return { ok: true };
      }
      return { ok: false, error: 'Action inconnue.' };
    },

    render: function (el, ctx) {
      var s = ctx.state;
      var me = ctx.me;

      if (s.phase === 'setup') {
        el._sdkSel = -1; // remise à zéro entre deux parties
        var html0 = '<p class="mini-msg big-msg">🔢 Sudoku</p>';
        if (me === 0) {
          html0 += '<p class="mini-msg">Choisissez le niveau :</p><div class="lvl-btns">' +
            Object.keys(LEVELS).map(function (l) {
              return '<button class="btn big" data-lvl="' + l + '">' +
                (l === 'facile' ? '😌' : l === 'moyen' ? '🙂' : '😈') + ' ' + LEVELS[l].nom +
                '</button>';
            }).join('') + '</div>' +
            '<p class="hint">Facile ≈ 40 cases données · Moyen ≈ 32 · Difficile ≈ 26.<br>' +
            'Un mauvais chiffre est refusé et compte une erreur.</p>';
        } else {
          html0 += '<p class="waiting">⏳ L’hôte choisit le niveau…</p>';
        }
        el.innerHTML = html0;
        el.querySelectorAll('[data-lvl]').forEach(function (b) {
          b.addEventListener('click', function () { ctx.act({ t: 'level', l: b.dataset.lvl }); });
        });
        return;
      }

      var grid = s.grids[me] || s.puzzle;
      var sel = el._sdkSel !== undefined ? el._sdkSel : -1;
      var html = '<div class="sdk-grid">';
      for (var i = 0; i < 81; i++) {
        var given = s.puzzle[i] !== 0;
        var cls = 'sdk-cell';
        if (given) cls += ' given';
        if (i === sel && !given) cls += ' sel';
        if (i % 9 === 2 || i % 9 === 5) cls += ' br';
        if (Math.floor(i / 9) === 2 || Math.floor(i / 9) === 5) cls += ' bb';
        html += '<div class="' + cls + '" data-i="' + i + '">' + (grid[i] || '') + '</div>';
      }
      html += '</div>';
      // pavé numérique
      html += '<div class="sdk-pad">';
      for (var v = 1; v <= 9; v++) html += '<button class="sdk-key" data-v="' + v + '">' + v + '</button>';
      html += '<button class="sdk-key" data-v="0">⌫</button></div>';
      // progression et chrono
      html += '<div class="mem-stats">' + s.players.map(function (p, i) {
        return '<span class="mem-stat' + (i === me ? ' turn' : '') + '">' + GG.esc(p.name) +
          ' : ' + (p.done ? '🏁' : p.filled + '/' + s.toFill) + ' · ' + p.errors + ' ❌</span>';
      }).join('') +
        '<span class="mem-stat" id="sdk-timer">⏱️ ' +
        fmt(Math.round((Date.now() - s.startTs) / 1000)) + '</span></div>';
      el.innerHTML = html;

      el.querySelectorAll('.sdk-cell').forEach(function (c) {
        c.addEventListener('click', function () {
          var i2 = parseInt(c.dataset.i, 10);
          if (s.puzzle[i2] !== 0) return;
          el._sdkSel = (el._sdkSel === i2) ? -1 : i2;
          mod.render(el, ctx);
        });
      });
      el.querySelectorAll('.sdk-key').forEach(function (k) {
        k.addEventListener('click', function () {
          if (el._sdkSel === undefined || el._sdkSel < 0) return;
          ctx.act({ t: 'set', i: el._sdkSel, v: parseInt(k.dataset.v, 10) });
        });
      });
      if (!s.finished && s.startTs && !el._sdkTimer) {
        el._sdkTimer = setInterval(function () {
          var t = el.querySelector('#sdk-timer');
          if (!t || !document.body.contains(t)) {
            clearInterval(el._sdkTimer); el._sdkTimer = null; return;
          }
          t.textContent = '⏱️ ' + fmt(Math.round((Date.now() - s.startTs) / 1000));
        }, 1000);
      }
    },

    _makePuzzle: makePuzzle, _solveCount: solveCount, _fullGrid: fullGrid // tests
  };

  GG.register(mod);
  if (typeof module === 'object' && module.exports) module.exports = mod;
})(typeof self !== 'undefined' ? self : globalThis);
