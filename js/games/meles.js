/* GGgames — Mots mêlés (1 à 4 joueurs, grille partagée, 3 niveaux). */
(function (root) {
  'use strict';
  var GG = root.GG;
  var LEVELS = {
    facile: { nom: 'Facile', size: 8, n: 6, dirs: [[0, 1], [1, 0]] },
    moyen: { nom: 'Moyen', size: 10, n: 8, dirs: [[0, 1], [1, 0], [1, 1]] },
    difficile: { nom: 'Difficile', size: 12, n: 10, dirs: [[0, 1], [1, 0], [1, 1], [1, -1], [0, -1], [-1, 0]] }
  };
  var FILLERS = 'EEEAAAIISSNNRRTTOOLUDCMP'; // lettres de remplissage plausibles
  var FALLBACK = ['MAISON', 'JARDIN', 'SOLEIL', 'NUAGE', 'RIVIERE', 'FORET', 'MONTAGNE',
    'BATEAU', 'ETOILE', 'FLEUR', 'ORANGE', 'BANANE', 'CERISE', 'TIGRE', 'PANDA',
    'REQUIN', 'PIRATE', 'TRESOR', 'FUSEE', 'PLANETE', 'ROBOT', 'MUSIQUE', 'GUITARE',
    'CHATEAU', 'DRAGON', 'PLAGE', 'VAGUE', 'HIVER', 'NEIGE', 'CABANE'];
  var COLORS = ['#e2a33c', '#5aa7de', '#68b56b', '#c77bd6'];

  function pickWords(ctx, count, maxLen) {
    var pool = FALLBACK.slice();
    if (ctx && ctx.dict && ctx.dict.byLen) {
      var candidates = [];
      for (var l = 4; l <= Math.min(8, maxLen); l++) {
        if (ctx.dict.byLen[l]) candidates = candidates.concat(ctx.dict.byLen[l]);
      }
      if (candidates.length > 500) pool = candidates;
    }
    var out = [];
    var seen = {};
    var guard = 0;
    while (out.length < count && guard++ < 5000) {
      var w = pool[Math.floor(Math.random() * pool.length)];
      if (w.length < 4 || w.length > maxLen || seen[w]) continue;
      seen[w] = true;
      out.push(w);
    }
    return out;
  }

  function buildGrid(level, ctx) {
    var cfg = LEVELS[level];
    var N = cfg.size;
    for (var attempt = 0; attempt < 30; attempt++) {
      var grid = new Array(N * N).fill('');
      var words = pickWords(ctx, cfg.n, N - 1);
      var placed = [];
      var ok = true;
      for (var w = 0; w < words.length && ok; w++) {
        var word = words[w];
        var done = false;
        for (var tries = 0; tries < 300 && !done; tries++) {
          var d = cfg.dirs[Math.floor(Math.random() * cfg.dirs.length)];
          var r = Math.floor(Math.random() * N);
          var c = Math.floor(Math.random() * N);
          var er = r + d[0] * (word.length - 1);
          var ec = c + d[1] * (word.length - 1);
          if (er < 0 || er >= N || ec < 0 || ec >= N) continue;
          var cells = [];
          var fits = true;
          for (var k = 0; k < word.length; k++) {
            var idx = (r + d[0] * k) * N + (c + d[1] * k);
            if (grid[idx] && grid[idx] !== word[k]) { fits = false; break; }
            cells.push(idx);
          }
          if (!fits) continue;
          cells.forEach(function (idx2, k2) { grid[idx2] = word[k2]; });
          placed.push({ w: word, cells: cells, foundBy: -1, foundCells: null });
          done = true;
        }
        if (!done) ok = false;
      }
      if (!ok) continue;
      for (var i = 0; i < N * N; i++) {
        if (!grid[i]) grid[i] = FILLERS[Math.floor(Math.random() * FILLERS.length)];
      }
      return { grid: grid, words: placed, size: N };
    }
    return null;
  }

  function lineCells(size, a, b) {
    var r1 = Math.floor(a / size), c1 = a % size;
    var r2 = Math.floor(b / size), c2 = b % size;
    var dr = Math.sign(r2 - r1), dc = Math.sign(c2 - c1);
    var len = Math.max(Math.abs(r2 - r1), Math.abs(c2 - c1)) + 1;
    if (dr !== 0 && dc !== 0 && Math.abs(r2 - r1) !== Math.abs(c2 - c1)) return null;
    var cells = [];
    for (var k = 0; k < len; k++) cells.push((r1 + dr * k) * size + (c1 + dc * k));
    return cells;
  }

  function fmt(sec) {
    var m = Math.floor(sec / 60);
    return (m ? m + ' min ' : '') + (sec % 60) + ' s';
  }

  var mod = {
    id: 'meles',
    nom: 'Mots mêlés',
    icone: '🔎',
    desc: 'Retrouvez les mots cachés. En réseau, la grille est partagée : chaque mot trouvé prend votre couleur !',
    regles: '<p><strong>🎯 Le but :</strong> retrouver tous les mots cachés dans la grille — horizontaux, verticaux, en diagonale… et parfois à l’envers.</p><p><strong>Comment jouer :</strong> touchez la première lettre d’un mot, puis sa dernière lettre.</p><p><strong>En réseau :</strong> la grille est partagée : chaque mot trouvé prend votre couleur, le plus rapide en prend le plus !</p>',
    min: 1, max: 4,
    hotseat: true, hotseatMax: 1, hidden: false, netOnly: false,

    create: function (names) {
      return {
        players: names.map(function (n) { return { name: n, found: 0 }; }),
        phase: 'setup',
        level: null,
        size: 0,
        grid: null,
        words: [],
        startTs: 0,
        durationSec: 0,
        finished: false
      };
    },

    turnOf: function () { return -1; }, // tout le monde cherche en même temps
    over: function (state) { return state.finished; },
    scoreOf: function (state, i) { return state.players[i].found; },

    summary: function (state) {
      var rows = state.players.map(function (p) { return { n: p.name, s: p.found }; })
        .sort(function (a, b) { return b.s - a.s; });
      var html = rows.map(function (r) {
        return '<div class="final-line"><span>' + GG.esc(r.n) + '</span><strong>' +
          r.s + ' mot' + (r.s > 1 ? 's' : '') + '</strong></div>';
      }).join('');
      html += '<p>⏱️ ' + fmt(state.durationSec) + ' · niveau ' +
        (LEVELS[state.level] ? LEVELS[state.level].nom : '') + '</p>';
      if (state.players.length === 1) {
        try {
          if (typeof localStorage !== 'undefined') {
            var key = 'gg-meles-best-' + state.level;
            var best = JSON.parse(localStorage.getItem(key) || 'null');
            var cur = { sec: state.durationSec, ts: state.startTs };
            if (!best || cur.sec < best.sec) localStorage.setItem(key, JSON.stringify(cur));
            var stored = JSON.parse(localStorage.getItem(key) || 'null');
            if (stored && stored.ts === state.startTs) html += '<h1>🏆 Nouveau record !</h1>';
            else if (stored) html += '<p>🏅 Record : ' + fmt(stored.sec) + '.</p>';
          }
        } catch (e) {}
      } else {
        var top = rows.filter(function (r) { return r.s === rows[0].s; });
        html += '<h1>🏆 ' + top.map(function (r) { return GG.esc(r.n); }).join(' & ') + '</h1>';
      }
      return html;
    },

    apply: function (state, player, action, ctx) {
      if (state.finished) return { ok: false, error: 'Partie terminée.' };
      if (action.t === 'level') {
        if (state.phase !== 'setup') return { ok: false, error: 'Niveau déjà choisi.' };
        if (player !== 0) return { ok: false, error: 'L’hôte choisit le niveau.' };
        if (!LEVELS[action.l]) return { ok: false, error: 'Niveau inconnu.' };
        var built = buildGrid(action.l, ctx);
        if (!built) return { ok: false, error: 'Impossible de générer la grille, réessayez.' };
        state.level = action.l;
        state.size = built.size;
        state.grid = built.grid;
        state.words = built.words;
        state.phase = 'play';
        state.startTs = Date.now();
        return { ok: true };
      }
      if (state.phase !== 'play') return { ok: false, error: 'La partie n’a pas commencé.' };
      if (action.t === 'claim') {
        var cells = lineCells(state.size, action.a | 0, action.b | 0);
        if (!cells || cells.length < 2) return { ok: false, error: 'Sélectionnez une ligne droite.' };
        var text = cells.map(function (i) { return state.grid[i]; }).join('');
        var reversed = text.split('').reverse().join('');
        for (var w = 0; w < state.words.length; w++) {
          var word = state.words[w];
          if (word.foundBy !== -1) continue;
          if (word.w === text || word.w === reversed) {
            word.foundBy = player;
            word.foundCells = cells;
            state.players[player].found++;
            if (state.words.every(function (x) { return x.foundBy !== -1; })) {
              state.finished = true;
              state.durationSec = Math.max(1, Math.round((Date.now() - state.startTs) / 1000));
            }
            return { ok: true };
          }
        }
        return { ok: false, error: '« ' + text + ' » n’est pas dans la liste.' };
      }
      return { ok: false, error: 'Action inconnue.' };
    },

    render: function (el, ctx) {
      var s = ctx.state;
      var me = ctx.me;

      if (s.phase === 'setup') {
        var html0 = '<p class="mini-msg big-msg">🔎 Mots mêlés</p>';
        if (me === 0) {
          html0 += '<p class="mini-msg">Choisissez le niveau :</p><div class="lvl-btns">' +
            Object.keys(LEVELS).map(function (l) {
              var c = LEVELS[l];
              return '<button class="btn big" data-lvl="' + l + '">' +
                (l === 'facile' ? '😌' : l === 'moyen' ? '🙂' : '😈') + ' ' + c.nom +
                ' <small>' + c.size + '×' + c.size + ' · ' + c.n + ' mots' +
                (l === 'difficile' ? ' · à l’envers' : l === 'moyen' ? ' · diagonales' : '') +
                '</small></button>';
            }).join('') + '</div>';
        } else {
          html0 += '<p class="waiting">⏳ L’hôte choisit le niveau…</p>';
        }
        el.innerHTML = html0;
        el.querySelectorAll('[data-lvl]').forEach(function (b) {
          b.addEventListener('click', function () { ctx.act({ t: 'level', l: b.dataset.lvl }); });
        });
        return;
      }

      var sel = el._melSel !== undefined ? el._melSel : -1;
      var owner = new Array(s.size * s.size).fill(-1);
      s.words.forEach(function (w) {
        if (w.foundBy !== -1 && w.foundCells) {
          w.foundCells.forEach(function (i) { owner[i] = w.foundBy; });
        }
      });
      var html = '<div class="mel-grid" style="grid-template-columns:repeat(' + s.size + ',1fr)">';
      for (var i = 0; i < s.size * s.size; i++) {
        var style = owner[i] !== -1 ? ' style="background:' + COLORS[owner[i]] + ';color:#132018"' : '';
        html += '<div class="mel-cell' + (i === sel ? ' sel' : '') + '" data-i="' + i + '"' +
          style + '>' + s.grid[i] + '</div>';
      }
      html += '</div>';
      html += '<div class="mel-words">' + s.words.map(function (w) {
        return '<span class="mel-word' + (w.foundBy !== -1 ? ' found' : '') + '"' +
          (w.foundBy !== -1 ? ' style="background:' + COLORS[w.foundBy] + ';color:#132018"' : '') +
          '>' + w.w + '</span>';
      }).join('') + '</div>';
      html += '<p class="mini-msg">' + (sel === -1
        ? 'Touchez la première lettre d’un mot…'
        : 'Touchez maintenant la dernière lettre du mot.') + '</p>';
      html += '<div class="mem-stats">' + s.players.map(function (p, i) {
        return '<span class="mem-stat" style="outline:2px solid ' + COLORS[i] + '">' +
          GG.esc(p.name) + ' : ' + p.found + '</span>';
      }).join('') +
        '<span class="mem-stat" id="mel-timer">⏱️ ' +
        fmt(Math.round((Date.now() - s.startTs) / 1000)) + '</span></div>';
      el.innerHTML = html;

      el.querySelectorAll('.mel-cell').forEach(function (c) {
        c.addEventListener('click', function () {
          var i2 = parseInt(c.dataset.i, 10);
          if (el._melSel === undefined || el._melSel === -1) {
            el._melSel = i2;
            mod.render(el, ctx);
          } else if (el._melSel === i2) {
            el._melSel = -1;
            mod.render(el, ctx);
          } else {
            var a = el._melSel;
            el._melSel = -1;
            ctx.act({ t: 'claim', a: a, b: i2 });
            mod.render(el, ctx);
          }
        });
      });
      if (!s.finished && s.startTs && !el._melTimer) {
        el._melTimer = setInterval(function () {
          var t = el.querySelector('#mel-timer');
          if (!t || !document.body.contains(t)) {
            clearInterval(el._melTimer); el._melTimer = null; return;
          }
          t.textContent = '⏱️ ' + fmt(Math.round((Date.now() - s.startTs) / 1000));
        }, 1000);
      }
    },

    _buildGrid: buildGrid, _lineCells: lineCells // tests
  };

  GG.register(mod);
  if (typeof module === 'object' && module.exports) module.exports = mod;
})(typeof self !== 'undefined' ? self : globalThis);
