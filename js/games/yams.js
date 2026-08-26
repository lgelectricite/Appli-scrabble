/* GGgames — Yams (1 à 4 joueurs, feuille de score calculée par le jeu). */
(function (root) {
  'use strict';
  var GG = root.GG;
  var DIE = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
  var CATS = [
    { id: 'un', nom: 'Les 1' }, { id: 'deux', nom: 'Les 2' }, { id: 'trois', nom: 'Les 3' },
    { id: 'quatre', nom: 'Les 4' }, { id: 'cinq', nom: 'Les 5' }, { id: 'six', nom: 'Les 6' },
    { id: 'brelan', nom: 'Brelan' }, { id: 'carre', nom: 'Carré' }, { id: 'full', nom: 'Full' },
    { id: 'psuite', nom: 'Petite suite' }, { id: 'gsuite', nom: 'Grande suite' },
    { id: 'yams', nom: 'Yams' }, { id: 'chance', nom: 'Chance' }
  ];
  var UPPER = ['un', 'deux', 'trois', 'quatre', 'cinq', 'six'];

  function counts(dice) {
    var c = [0, 0, 0, 0, 0, 0, 0];
    dice.forEach(function (d) { c[d]++; });
    return c;
  }

  function sum(dice) { return dice.reduce(function (a, b) { return a + b; }, 0); }

  /* Score qu'obtiendrait `dice` dans la catégorie `cat`. */
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

  var mod = {
    id: 'yams',
    nom: 'Yams',
    icone: '🎲',
    desc: '5 dés, 3 lancers, 13 cases : la feuille de score se remplit toute seule.',
    min: 1, max: 4,
    hotseat: true, hidden: false, netOnly: false,

    create: function (names) {
      var state = {
        players: names.map(function (n) {
          var sheet = {};
          CATS.forEach(function (c) { sheet[c.id] = null; });
          return { name: n, sheet: sheet };
        }),
        current: 0,
        finished: false
      };
      startTurn(state);
      return state;
    },

    turnOf: function (state) { return state.finished ? -1 : state.current; },
    over: function (state) { return state.finished; },
    scoreOf: function (state, i) { return totalOf(state.players[i]); },

    summary: function (state) {
      var rows = state.players.map(function (p) { return { n: p.name, s: totalOf(p) }; })
        .sort(function (a, b) { return b.s - a.s; });
      return rows.map(function (r) {
        return '<div class="final-line"><span>' + GG.esc(r.n) + '</span><strong>' +
          r.s + ' pts</strong></div>';
      }).join('') + '<h1>🏆 ' + GG.esc(rows[0].n) + '</h1>';
    },

    apply: function (state, player, action) {
      if (state.finished) return { ok: false, error: 'Partie terminée.' };
      if (player !== state.current) return { ok: false, error: 'Ce n’est pas votre tour.' };
      if (action.t === 'roll') {
        if (state.rolls <= 0) return { ok: false, error: 'Plus de lancer disponible.' };
        for (var i = 0; i < 5; i++) {
          if (!state.held[i] || state.dice[i] === 0) {
            state.dice[i] = 1 + Math.floor(Math.random() * 6);
          }
        }
        state.rolls--;
        return { ok: true };
      }
      if (action.t === 'hold') {
        if (state.rolls === 3) return { ok: false, error: 'Lancez d’abord les dés.' };
        var j = action.i | 0;
        if (j < 0 || j > 4) return { ok: false, error: 'Dé invalide.' };
        state.held[j] = !state.held[j];
        return { ok: true };
      }
      if (action.t === 'score') {
        if (state.rolls === 3) return { ok: false, error: 'Lancez d’abord les dés.' };
        var p = state.players[player];
        var cat = String(action.cat);
        if (!CATS.some(function (c) { return c.id === cat; })) {
          return { ok: false, error: 'Catégorie inconnue.' };
        }
        if (p.sheet[cat] !== null) return { ok: false, error: 'Catégorie déjà remplie.' };
        p.sheet[cat] = catScore(cat, state.dice);
        if (state.players.every(function (pl) {
          return CATS.every(function (c) { return pl.sheet[c.id] !== null; });
        })) {
          state.finished = true;
        } else {
          state.current = (state.current + 1) % state.players.length;
          startTurn(state);
        }
        return { ok: true };
      }
      return { ok: false, error: 'Action inconnue.' };
    },

    render: function (el, ctx) {
      var s = ctx.state;
      var mine = ctx.me === s.current && !s.finished;
      var rolled = s.rolls < 3;
      var html = '<div class="yams-dice">';
      for (var i = 0; i < 5; i++) {
        html += '<button class="yams-die' + (s.held[i] ? ' held' : '') + '" data-die="' + i + '"' +
          (mine && rolled ? '' : ' disabled') + '>' +
          (s.dice[i] ? DIE[s.dice[i]] : '·') + '</button>';
      }
      html += '</div>';
      html += '<div class="mini-actions"><button class="btn big primary" data-a="roll"' +
        (mine && s.rolls > 0 ? '' : ' disabled') + '>🎲 Lancer (' + s.rolls + ' restant' +
        (s.rolls > 1 ? 's' : '') + ')</button></div>';
      if (mine && rolled) {
        html += '<p class="mini-msg">Touchez les dés à garder, puis choisissez une case :</p>';
      } else if (!mine && !s.finished) {
        html += '<p class="mini-msg">Au tour de ' + GG.esc(s.players[s.current].name) + '…</p>';
      }
      // feuille de score
      html += '<div class="yams-sheet"><table><tr><th></th>';
      s.players.forEach(function (p, pi) {
        html += '<th class="' + (pi === s.current && !s.finished ? 'turn' : '') + '">' +
          GG.esc(p.name.slice(0, 8)) + '</th>';
      });
      html += '</tr>';
      CATS.forEach(function (cat) {
        html += '<tr><td>' + cat.nom + '</td>';
        s.players.forEach(function (p, pi) {
          var v = p.sheet[cat.id];
          if (v !== null) {
            html += '<td class="filled">' + v + '</td>';
          } else if (pi === ctx.me && mine && rolled) {
            html += '<td><button class="yams-pick" data-cat="' + cat.id + '">' +
              catScore(cat.id, s.dice) + '</button></td>';
          } else {
            html += '<td class="empty">–</td>';
          }
        });
        html += '</tr>';
      });
      html += '<tr class="total"><td>Total (+35 si haut ≥ 63)</td>';
      s.players.forEach(function (p) { html += '<td>' + totalOf(p) + '</td>'; });
      html += '</tr></table></div>';
      el.innerHTML = html;
      el.querySelector('[data-a="roll"]').addEventListener('click', function () {
        ctx.act({ t: 'roll' });
      });
      el.querySelectorAll('.yams-die').forEach(function (b) {
        b.addEventListener('click', function () {
          ctx.act({ t: 'hold', i: parseInt(b.dataset.die, 10) });
        });
      });
      el.querySelectorAll('.yams-pick').forEach(function (b) {
        b.addEventListener('click', function () {
          ctx.act({ t: 'score', cat: b.dataset.cat });
        });
      });
    },

    _catScore: catScore // exposé pour les tests
  };

  GG.register(mod);
  if (typeof module === 'object' && module.exports) module.exports = mod;
})(typeof self !== 'undefined' ? self : globalThis);
