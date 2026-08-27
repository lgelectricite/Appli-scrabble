/*
 * GGgames — Mots fléchés (1 à 4 joueurs, 1000 grilles pré-générées).
 * 5 forces × 200 grilles numérotées, avec suivi de progression sur le
 * téléphone. Les cases-flèches pointent vers leur mot ; touchez une flèche
 * ou une définition pour répondre. En réseau : course sur la même grille.
 */
(function (root) {
  'use strict';
  var GG = root.GG;
  var PAR_FORCE = 200;
  var FORCES = [
    { f: 1, nom: 'Force 1', desc: 'découverte' },
    { f: 2, nom: 'Force 2', desc: 'tranquille' },
    { f: 3, nom: 'Force 3', desc: 'classique' },
    { f: 4, nom: 'Force 4', desc: 'exigeante' },
    { f: 5, nom: 'Force 5', desc: 'expert' }
  ];
  var COLORS = ['#e2a33c', '#5aa7de', '#68b56b', '#c77bd6'];

  var defMap = null;
  function defOf(word) {
    if (!defMap) {
      defMap = {};
      var db = GG.byId && GG.byId.croises && GG.byId.croises._DB;
      if (db) {
        ['facile', 'moyen', 'difficile'].forEach(function (lvl) {
          db[lvl].forEach(function (e) {
            var i = e.indexOf('|');
            if (!defMap[e.slice(0, i)]) defMap[e.slice(0, i)] = e.slice(i + 1);
          });
        });
      }
    }
    return defMap[word] || 'Mot mystère…';
  }

  function norm(s) {
    return String(s || '').toUpperCase()
      .replace(/Œ/g, 'OE').replace(/Æ/g, 'AE')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Z]/g, '');
  }

  /* "taille|MOT,case,dir;..." → { size, words:[{w, def, cells, dir, num}] } */
  function loadGrid(force, gnum) {
    var idx = (force - 1) * PAR_FORCE + gnum;
    var raw = GG.FLECHES_GRILLES && GG.FLECHES_GRILLES[idx];
    if (!raw) return null;
    var parts = raw.split('|');
    var size = parseInt(parts[0], 10);
    var words = parts[1].split(';').map(function (chunk) {
      var bits = chunk.split(',');
      var w = bits[0];
      var p = parseInt(bits[1], 10);
      var d = parseInt(bits[2], 10); // 0 = →, 1 = ↓
      var cells = [];
      for (var k = 0; k < w.length; k++) {
        cells.push(d === 1 ? p + k * size : p + k);
      }
      return { w: w, def: defOf(w), cells: cells, dir: d === 1 ? 'v' : 'h',
        num: 0, foundBy: -1, lastWrong: '' };
    });
    // numérotation par case de départ (ordre de lecture)
    var starts = [];
    var seen = {};
    words.forEach(function (w) {
      if (!seen[w.cells[0]]) { seen[w.cells[0]] = true; starts.push(w.cells[0]); }
    });
    starts.sort(function (a, b) { return a - b; });
    var numOf = {};
    starts.forEach(function (c, i) { numOf[c] = i + 1; });
    words.forEach(function (w) { w.num = numOf[w.cells[0]]; });
    words.sort(function (a, b) { return a.num - b.num || (a.dir < b.dir ? -1 : 1); });
    return { size: size, words: words };
  }

  /* progression locale : grilles terminées, par force */
  function doneList(force) {
    try {
      if (typeof localStorage === 'undefined') return [];
      var all = JSON.parse(localStorage.getItem('gg-fleches-done') || '{}');
      return all['f' + force] || [];
    } catch (e) { return []; }
  }
  function markDone(force, gnum) {
    try {
      if (typeof localStorage === 'undefined') return;
      var all = JSON.parse(localStorage.getItem('gg-fleches-done') || '{}');
      var list = all['f' + force] || [];
      if (list.indexOf(gnum) === -1) list.push(gnum);
      all['f' + force] = list;
      localStorage.setItem('gg-fleches-done', JSON.stringify(all));
    } catch (e) {}
  }
  function nextGrid(force) {
    var done = doneList(force);
    for (var g = 0; g < PAR_FORCE; g++) {
      if (done.indexOf(g) === -1) return g;
    }
    return Math.floor(Math.random() * PAR_FORCE); // tout est fini : rejouez !
  }

  function fmt(sec) {
    var m = Math.floor(sec / 60);
    return (m ? m + ' min ' : '') + (sec % 60) + ' s';
  }

  var mod = {
    id: 'fleches',
    nom: 'Mots fléchés',
    icone: '➡️',
    desc: '1000 grilles intégrées, de la force 1 à la force 5, avec suivi de votre progression. Les flèches pointent vers leurs mots !',
    min: 1, max: 4,
    hotseat: true, hotseatMax: 1, hidden: false, netOnly: false,
    regles: '<p><strong>🎯 Le but :</strong> remplir toute la grille. 1000 grilles vous attendent, numérotées de la force 1 (découverte) à la force 5 (expert), avec votre progression enregistrée.</p><p><strong>Comment jouer :</strong> touchez une case-flèche (▶ ou ▼) ou une définition, puis tapez votre réponse. Bonne réponse : le mot s’inscrit et rapporte sa longueur en points ; mauvaise : une erreur au compteur.</p><p><strong>En réseau :</strong> tous sur la même grille, le plus rapide prend les mots. En solo : chrono et record par force !</p>',

    create: function (names) {
      return {
        players: names.map(function (n) {
          return { name: n, found: 0, points: 0, errors: 0 };
        }),
        phase: 'setup',
        force: 0,
        gnum: -1,
        size: 0,
        words: [],
        startTs: 0,
        durationSec: 0,
        finished: false
      };
    },

    turnOf: function () { return -1; },
    over: function (state) { return state.finished; },
    scoreOf: function (state, i) { return state.players[i].points; },

    summary: function (state) {
      var rows = state.players.map(function (p) {
        return { n: p.name, s: p.points, e: p.errors };
      }).sort(function (a, b) { return b.s - a.s; });
      var html = rows.map(function (r) {
        return '<div class="final-line"><span>' + GG.esc(r.n) +
          (r.e ? ' <small>(' + r.e + ' erreur' + (r.e > 1 ? 's' : '') + ')</small>' : '') +
          '</span><strong>' + r.s + ' pts</strong></div>';
      }).join('');
      html += '<p>Grille n°' + (state.gnum + 1) + ' · force ' + state.force +
        ' · ⏱️ ' + fmt(state.durationSec) + '</p>';
      markDone(state.force, state.gnum);
      try {
        if (typeof localStorage !== 'undefined') {
          var fini = doneList(state.force).length;
          html += '<p>📈 Progression force ' + state.force + ' : ' + fini + ' / ' +
            PAR_FORCE + ' grilles.</p>';
          if (state.players.length === 1) {
            var key = 'gg-fleches-best-f' + state.force;
            var best = JSON.parse(localStorage.getItem(key) || 'null');
            var cur = { sec: state.durationSec, ts: state.startTs };
            if (!best || cur.sec < best.sec) localStorage.setItem(key, JSON.stringify(cur));
            var stored = JSON.parse(localStorage.getItem(key) || 'null');
            if (stored && stored.ts === state.startTs) html += '<h1>🏆 Nouveau record !</h1>';
            else if (stored) html += '<p>🏅 Record force ' + state.force + ' : ' + fmt(stored.sec) + '.</p>';
          }
        }
      } catch (e) {}
      if (state.players.length > 1) {
        var top = rows.filter(function (r) { return r.s === rows[0].s; });
        html += '<h1>🏆 ' + top.map(function (r) { return GG.esc(r.n); }).join(' & ') + '</h1>';
      }
      return html;
    },

    /* les solutions ne circulent jamais sur le réseau */
    redact: function (state) {
      var copy = GG.clone(state);
      copy.words.forEach(function (w) {
        if (w.foundBy === -1) delete w.w;
      });
      return copy;
    },

    apply: function (state, player, action) {
      if (state.finished) return { ok: false, error: 'Partie terminée.' };
      if (action.t === 'force') {
        if (state.phase !== 'setup') return { ok: false, error: 'Grille déjà choisie.' };
        if (player !== 0) return { ok: false, error: 'L’hôte choisit la grille.' };
        var f = action.f | 0;
        if (f < 1 || f > 5) return { ok: false, error: 'Force inconnue.' };
        var g = action.g === undefined ? nextGrid(f) : (action.g | 0);
        if (g < 0 || g >= PAR_FORCE) return { ok: false, error: 'Numéro de grille invalide.' };
        var grid = loadGrid(f, g);
        if (!grid) return { ok: false, error: 'Grille introuvable.' };
        state.force = f;
        state.gnum = g;
        state.size = grid.size;
        state.words = grid.words;
        state.phase = 'play';
        state.startTs = Date.now();
        return { ok: true };
      }
      if (state.phase !== 'play') return { ok: false, error: 'La partie n’a pas commencé.' };
      if (action.t === 'claim') {
        var w = state.words[action.i | 0];
        if (!w) return { ok: false, error: 'Mot inconnu.' };
        if (w.foundBy !== -1) return { ok: false, error: 'Déjà trouvé !' };
        var guess = norm(action.text);
        if (!guess) return { ok: false, error: 'Écrivez une réponse.' };
        if (guess.length !== w.w.length) {
          return { ok: false, error: 'Il faut ' + w.w.length + ' lettres.' };
        }
        if (guess === w.w) {
          w.foundBy = player;
          state.players[player].found++;
          state.players[player].points += w.w.length;
          if (state.words.every(function (x) { return x.foundBy !== -1; })) {
            state.finished = true;
            state.durationSec = Math.max(1, Math.round((Date.now() - state.startTs) / 1000));
          }
        } else {
          state.players[player].errors++;
          w.lastWrong = String(action.text).slice(0, 20);
        }
        return { ok: true };
      }
      return { ok: false, error: 'Action inconnue.' };
    },

    render: function (el, ctx) {
      var s = ctx.state;
      if (s.finished) { el.innerHTML = ''; return; }
      var me = ctx.me;

      if (s.phase === 'setup') {
        var html0 = '<p class="mini-msg big-msg">➡️ Mots fléchés</p>' +
          '<p class="mini-msg">1000 grilles intégrées — votre progression est enregistrée.</p>';
        if (me === 0) {
          html0 += '<div class="lvl-btns">' + FORCES.map(function (fc) {
            var fini = doneList(fc.f).length;
            return '<button class="btn big" data-f="' + fc.f + '">' +
              fc.nom + ' <small>' + fc.desc + ' · ' + '⭐'.repeat(fc.f) + ' · ' +
              fini + '/' + PAR_FORCE + ' grilles finies</small></button>';
          }).join('') + '</div>';
        } else {
          html0 += '<p class="waiting">⏳ L’hôte choisit la force…</p>';
        }
        el.innerHTML = html0;
        el.querySelectorAll('[data-f]').forEach(function (b) {
          b.addEventListener('click', function () {
            ctx.act({ t: 'force', f: parseInt(b.dataset.f, 10) });
          });
        });
        return;
      }

      var N = s.size;
      var letter = new Array(N * N).fill('');
      var owner = new Array(N * N).fill(-1);
      var active = new Array(N * N).fill(false);
      var clues = {}; // case → [indices de mots fléchés depuis cette case]
      s.words.forEach(function (w, wi) {
        w.cells.forEach(function (idx, k) {
          active[idx] = true;
          if (w.foundBy !== -1) { letter[idx] = w.w[k]; owner[idx] = w.foundBy; }
        });
        var start = w.cells[0];
        var prev = w.dir === 'h' ? start - 1 : start - N;
        var okPrev = w.dir === 'h' ? (start % N > 0) : (start >= N);
        if (okPrev && !active[prev]) {
          // la case juste avant le mot est libre : elle devient case-flèche
          if (!clues[prev]) clues[prev] = [];
          clues[prev].push(wi);
        }
      });
      // les cases-flèches ne doivent pas être écrasées par des lettres
      Object.keys(clues).forEach(function (c) { active[c] = false; });

      var sel = el._flSel !== undefined ? el._flSel : -1;
      if (sel !== -1 && (!s.words[sel] || s.words[sel].foundBy !== -1)) {
        sel = -1; el._flSel = -1;
      }
      var selCells = {};
      if (sel !== -1) s.words[sel].cells.forEach(function (i) { selCells[i] = true; });

      var html = '<p class="qz-head">➡️ Grille n°' + (s.gnum + 1) + ' · force ' + s.force + '</p>';
      html += '<div class="cr-grid" style="grid-template-columns:repeat(' + N + ',1fr)">';
      for (var i = 0; i < N * N; i++) {
        if (clues[i]) {
          html += '<div class="cr-cell fl-clue" data-c="' + i + '">' +
            clues[i].map(function (wi) {
              return '<span>' + s.words[wi].num + (s.words[wi].dir === 'h' ? '▶' : '▼') + '</span>';
            }).join('') + '</div>';
          continue;
        }
        if (!active[i]) { html += '<div class="cr-cell off"></div>'; continue; }
        var st = owner[i] !== -1 ? ' style="background:' + COLORS[owner[i]] + ';color:#132018"' : '';
        html += '<div class="cr-cell' + (selCells[i] ? ' sel' : '') + '" data-i="' + i + '"' + st + '>' +
          (letter[i] || '') + '</div>';
      }
      html += '</div>';

      if (sel !== -1) {
        var w0 = s.words[sel];
        html += '<div class="cr-ask"><p class="mini-msg"><strong>' + w0.num +
          (w0.dir === 'h' ? ' ▶' : ' ▼') + '</strong> ' + GG.esc(w0.def) +
          ' <em>(' + w0.cells.length + ' lettres)</em></p>' +
          (w0.lastWrong ? '<p class="cr-wrong">« ' + GG.esc(w0.lastWrong) + ' » ne convient pas…</p>' : '') +
          '<div class="cr-answer-row">' +
          '<input type="text" id="fl-guess" maxlength="' + (w0.cells.length + 4) +
          '" placeholder="' + w0.cells.length + ' lettres…" autocomplete="off">' +
          '<button class="btn primary" data-a="try">Proposer</button></div></div>';
      } else {
        html += '<p class="mini-msg">Touchez une case-flèche (ou une définition) pour répondre.</p>';
      }

      ['h', 'v'].forEach(function (dir) {
        var list = s.words.filter(function (w) { return w.dir === dir; });
        if (!list.length) return;
        html += '<h3 class="cr-h3">' + (dir === 'h' ? '▶ Horizontalement' : '▼ Verticalement') + '</h3>' +
          '<div class="cr-defs">' + list.map(function (w) {
            var i2 = s.words.indexOf(w);
            var stl = w.foundBy !== -1 ? ' style="background:' + COLORS[w.foundBy] + ';color:#132018"' : '';
            return '<button class="cr-def' + (w.foundBy !== -1 ? ' found' : '') +
              (i2 === sel ? ' sel' : '') + '" data-w="' + i2 + '"' + stl + '>' +
              '<strong>' + w.num + '.</strong> ' + GG.esc(w.def) +
              (w.foundBy !== -1 ? ' = ' + w.w : ' (' + w.cells.length + ')') + '</button>';
          }).join('') + '</div>';
      });

      html += '<div class="mem-stats">' + s.players.map(function (p, pi) {
        return '<span class="mem-stat" style="outline:2px solid ' + COLORS[pi] + '">' +
          GG.esc(p.name) + ' : ' + p.points + (p.errors ? ' · ❌' + p.errors : '') + '</span>';
      }).join('') +
        '<span class="mem-stat" id="fl-timer">⏱️ ' +
        fmt(Math.round((Date.now() - s.startTs) / 1000)) + '</span></div>';
      el.innerHTML = html;

      function select(i2) {
        el._flSel = (el._flSel === i2) ? -1 : i2;
        mod.render(el, ctx);
        var inp2 = el.querySelector('#fl-guess');
        if (inp2 && el._flSel !== -1) inp2.focus();
      }
      el.querySelectorAll('.cr-def:not(.found)').forEach(function (b) {
        b.addEventListener('click', function () { select(parseInt(b.dataset.w, 10)); });
      });
      el.querySelectorAll('.fl-clue').forEach(function (c) {
        c.addEventListener('click', function () {
          var here = clues[parseInt(c.dataset.c, 10)].filter(function (wi) {
            return s.words[wi].foundBy === -1;
          });
          if (!here.length) return;
          var pos = here.indexOf(sel);
          select(here[(pos + 1) % here.length]);
        });
      });
      el.querySelectorAll('.cr-cell[data-i]').forEach(function (c) {
        c.addEventListener('click', function () {
          var idx2 = parseInt(c.dataset.i, 10);
          var here = [];
          s.words.forEach(function (w, wi) {
            if (w.foundBy === -1 && w.cells.indexOf(idx2) !== -1) here.push(wi);
          });
          if (!here.length) return;
          var pos = here.indexOf(sel);
          select(here[(pos + 1) % here.length] === sel ? -1 : here[(pos + 1) % here.length]);
        });
      });
      var tryBtn = el.querySelector('[data-a="try"]');
      if (tryBtn) {
        var send = function () {
          var input = el.querySelector('#fl-guess');
          if (input && input.value.trim() && el._flSel !== -1) {
            ctx.act({ t: 'claim', i: el._flSel, text: input.value });
          }
        };
        tryBtn.addEventListener('click', send);
        var inp = el.querySelector('#fl-guess');
        if (inp) inp.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter') send();
        });
      }
      if (!s.finished && s.startTs && !el._flTimer) {
        el._flTimer = setInterval(function () {
          var t = el.querySelector('#fl-timer');
          if (!t || !document.body.contains(t)) {
            clearInterval(el._flTimer); el._flTimer = null; return;
          }
          t.textContent = '⏱️ ' + fmt(Math.round((Date.now() - s.startTs) / 1000));
        }, 1000);
      }
    },

    _loadGrid: loadGrid, _norm: norm, _PAR_FORCE: PAR_FORCE
  };

  GG.register(mod);
  if (typeof module === 'object' && module.exports) module.exports = mod;
})(typeof self !== 'undefined' ? self : globalThis);
