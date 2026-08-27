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
    regles: '<p><strong>🎯 Le but :</strong> remplir les 13 cases de votre feuille avec les meilleures combinaisons de dés.</p><p><strong>Comment jouer :</strong> 3 lancers par tour ; entre deux, touchez les dés à garder. Puis choisissez une case (brelan, full, suite, yams…) — chaque case ne sert qu’une fois, même pour 0 !</p><p><strong>Les points :</strong> +35 de bonus si vos cases 1 à 6 totalisent 63 ou plus. Le plus gros total gagne.</p>',
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
        gameTs: Math.floor(Math.random() * 1e9), // identifiant de partie (records)
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
      var html = rows.map(function (r) {
        return '<div class="final-line"><span>' + GG.esc(r.n) + '</span><strong>' +
          r.s + ' pts</strong></div>';
      }).join('') + '<h1>🏆 ' + rows.filter(function (r) { return r.s === rows[0].s; })
        .map(function (r) { return GG.esc(r.n); }).join(' & ') + '</h1>';
      if (state.players.length === 1) {
        try {
          if (typeof localStorage !== 'undefined') {
            var best = JSON.parse(localStorage.getItem('gg-yams-best') || 'null');
            var cur = { score: rows[0].s, ts: state.gameTs || 0 };
            if (!best || cur.score > best.score) {
              localStorage.setItem('gg-yams-best', JSON.stringify(cur));
            }
            var stored = JSON.parse(localStorage.getItem('gg-yams-best') || 'null');
            if (stored && stored.ts === cur.ts && stored.score === cur.score) {
              html += '<p>🏆 Nouveau record personnel !</p>';
            } else if (stored) {
              html += '<p>🏅 Votre record : ' + stored.score + ' pts.</p>';
            }
          }
        } catch (e) {}
      }
      return html;
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

    /* IA : garde les dés prometteurs, puis remplit la meilleure case ouverte. */
    bot: function (state, me) {
      if (state.finished || state.current !== me) return null;
      var p = state.players[me];
      var dice = state.dice;
      var ouverte = function (id) { return p.sheet[id] === null; };

      /* Meilleure case à remplir : écart au « par » de chaque case ouverte,
         avec un brin de hasard pour départager les cas serrés. */
      function meilleureCase() {
        var par = {
          un: 2, deux: 4, trois: 6, quatre: 8, cinq: 10, six: 12,
          brelan: 15, carre: 12, full: 15, psuite: 22, gsuite: 18,
          yams: 4, chance: 21
        };
        var best = null, bestV = -Infinity;
        CATS.forEach(function (cat) {
          if (!ouverte(cat.id)) return;
          var sc = catScore(cat.id, dice);
          var v = sc - par[cat.id];
          var up = UPPER.indexOf(cat.id);
          if (up !== -1 && sc >= (up + 1) * 3) v += 4; // vise le bonus du haut
          v += (Math.random() - 0.5) * 3;
          if (v > bestV) { bestV = v; best = cat.id; }
        });
        return best;
      }

      if (state.rolls === 3) return { t: 'roll' }; // premier lancer obligatoire
      if (state.rolls === 0) return { t: 'score', cat: meilleureCase() };

      /* Choix des dés à garder — déterministe : les « hold » convergent. */
      var c = counts(dice);
      var f, face = 1, poids = -1;
      for (f = 1; f <= 6; f++) { // face la plus représentée (haut ouvert et
        var w = c[f] * 100 + (ouverte(UPPER[f - 1]) ? 10 : 0) + f; // face élevée en prime)
        if (w > poids) { poids = w; face = f; }
      }
      var suite = [], meilleure = [];
      for (f = 1; f <= 6; f++) { // plus longue suite de faces consécutives
        if (c[f]) { suite.push(f); if (suite.length > meilleure.length) meilleure = suite.slice(); }
        else suite = [];
      }
      function gardeFace(fc) {
        return dice.map(function (d) { return d === fc; });
      }
      function gardeSuite(faces) {
        var manque = faces.slice(); // un seul dé par face de la suite
        return dice.map(function (d) {
          var k = manque.indexOf(d);
          if (k !== -1) { manque.splice(k, 1); return true; }
          return false;
        });
      }

      var plan = null; // { score: case } ou { keep: [bool × 5] }
      if (c[face] === 5) { // yams !
        plan = ouverte('yams') ? { score: 'yams' } : { keep: [true, true, true, true, true] };
      } else if (meilleure.length === 5) {
        plan = ouverte('gsuite') ? { score: 'gsuite' } :
          (ouverte('psuite') ? { score: 'psuite' } : null);
      }
      if (!plan && meilleure.length === 4) {
        if (ouverte('gsuite')) plan = { keep: gardeSuite(meilleure) }; // on tente la grande,
        else if (ouverte('psuite')) plan = { score: 'psuite' };        // la petite reste sûre
      }
      if (!plan && ouverte('full') && catScore('full', dice) === 25) plan = { score: 'full' };
      if (!plan && c[face] === 4) { // carré : relancer le 5e ne risque rien (yams ?)
        plan = (!ouverte('yams') && ouverte('carre')) ? { score: 'carre' } :
          { keep: gardeFace(face) };
      }
      if (!plan && c[face] === 2 && ouverte('full')) {
        var paires = dice.filter(function (d) { return c[d] === 2; });
        if (paires.length === 4) { // double paire : on tente le full
          plan = { keep: dice.map(function (d) { return c[d] === 2; }) };
        }
      }
      if (!plan && c[face] === 1 && meilleure.length >= 3 &&
        (ouverte('psuite') || ouverte('gsuite'))) {
        plan = { keep: gardeSuite(meilleure) }; // que des faces isolées : la suite
      }
      if (!plan) plan = { keep: gardeFace(face) }; // paire/brelan (ou meilleur dé seul)

      if (plan.score) return { t: 'score', cat: plan.score };
      if (plan.keep.every(function (k) { return k; })) {
        return { t: 'score', cat: meilleureCase() }; // tout gardé : autant marquer
      }
      for (var i = 0; i < 5; i++) {
        if (state.held[i] !== plan.keep[i]) return { t: 'hold', i: i };
      }
      return { t: 'roll' };
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
