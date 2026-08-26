/* GGgames — Bataille navale (2 joueurs). */
(function (root) {
  'use strict';
  var GG = root.GG;
  var N = 10;
  var FLEET = [5, 4, 3, 3, 2];

  function randomFleet() {
    for (;;) {
      var cells = {};
      var ships = [];
      var ok = true;
      for (var f = 0; f < FLEET.length && ok; f++) {
        var size = FLEET[f];
        var placed = false;
        for (var tries = 0; tries < 200 && !placed; tries++) {
          var horiz = Math.random() < 0.5;
          var r = Math.floor(Math.random() * (horiz ? N : N - size + 1));
          var c = Math.floor(Math.random() * (horiz ? N - size + 1 : N));
          var occ = [];
          var free = true;
          for (var k = 0; k < size; k++) {
            var idx = (horiz ? r : r + k) * N + (horiz ? c + k : c);
            if (cells[idx] !== undefined) { free = false; break; }
            occ.push(idx);
          }
          if (!free) continue;
          occ.forEach(function (i) { cells[i] = f; });
          ships.push({ size: size, cells: occ, hits: 0, sunk: false });
          placed = true;
        }
        if (!placed) ok = false;
      }
      if (ok) return { cells: cells, ships: ships };
    }
  }

  function shipsLeft(board) {
    return board.ships.filter(function (s) { return !s.sunk; }).length;
  }

  var mod = {
    id: 'bataille',
    nom: 'Bataille navale',
    icone: '🚢',
    desc: 'Coulez la flotte adverse. Vos bateaux restent secrets.',
    min: 2, max: 2,
    hotseat: true, hidden: true, netOnly: false,

    create: function (names) {
      return {
        players: names.map(function (n) { return { name: n, ready: false }; }),
        boards: [randomFleet(), randomFleet()],
        shots: [new Array(N * N).fill(null), new Array(N * N).fill(null)], // reçus par i
        phase: 'place',
        current: 0,
        finished: false,
        winner: -1,
        lastMsg: '',
        lastShot: null // {target, idx} : dernier tir, mis en évidence des deux côtés
      };
    },

    turnOf: function (state) {
      if (state.finished) return -1;
      if (state.phase === 'place') return -1; // les deux préparent en même temps
      return state.current;
    },
    /* sur un seul téléphone : qui doit voir l'écran en ce moment ? */
    viewerOf: function (state) {
      if (state.phase === 'place') {
        for (var i = 0; i < state.players.length; i++) {
          if (!state.players[i].ready) return i;
        }
        return 0;
      }
      return state.current < 0 ? state.winner : state.current;
    },
    over: function (state) { return state.finished; },
    scoreOf: function (state, i) {
      return state.phase === 'place' ? '…' : shipsLeft(state.boards[i]) + ' 🚢';
    },

    summary: function (state) {
      return '<h1>🏆 ' + GG.esc(state.players[state.winner].name) + ' gagne !</h1>' +
        '<p>Flotte adverse entièrement coulée.</p>';
    },

    /* cache les bateaux adverses non coulés */
    redact: function (state, viewer) {
      var copy = GG.clone(state);
      for (var i = 0; i < 2; i++) {
        if (i === viewer || state.finished) continue;
        var b = copy.boards[i];
        b.cells = {}; // positions secrètes
        b.ships = b.ships.map(function (s) {
          return s.sunk ? s : { size: s.size, cells: [], hits: s.hits, sunk: false };
        });
      }
      return copy;
    },

    apply: function (state, player, action) {
      if (state.finished) return { ok: false, error: 'Partie terminée.' };
      if (action.t === 'shuffle') {
        if (state.phase !== 'place') return { ok: false, error: 'Placement terminé.' };
        if (state.players[player].ready) return { ok: false, error: 'Vous êtes déjà prêt.' };
        state.boards[player] = randomFleet();
        return { ok: true };
      }
      if (action.t === 'ready') {
        if (state.phase !== 'place') return { ok: false, error: 'Placement terminé.' };
        state.players[player].ready = true;
        if (state.players.every(function (p) { return p.ready; })) {
          state.phase = 'play';
          state.current = 0;
        }
        return { ok: true };
      }
      if (action.t === 'fire') {
        if (state.phase !== 'play') return { ok: false, error: 'La bataille n’a pas commencé.' };
        if (player !== state.current) return { ok: false, error: 'Ce n’est pas votre tour.' };
        var target = 1 - player;
        var idx = action.i | 0;
        if (idx < 0 || idx >= N * N) return { ok: false, error: 'Case invalide.' };
        if (state.shots[target][idx]) return { ok: false, error: 'Déjà tiré ici.' };
        var board = state.boards[target];
        state.lastShot = { target: target, idx: idx };
        var shipId = board.cells[idx];
        if (shipId !== undefined) {
          state.shots[target][idx] = 'H';
          var ship = board.ships[shipId];
          ship.hits++;
          if (ship.hits >= ship.size) {
            ship.sunk = true;
            state.lastMsg = '💥 Coulé ! (' + ship.size + ' cases)';
          } else {
            state.lastMsg = '🎯 Touché !';
          }
          if (board.ships.every(function (s) { return s.sunk; })) {
            state.finished = true;
            state.winner = player;
          }
          // touché : on rejoue
        } else {
          state.shots[target][idx] = 'M';
          state.lastMsg = '🌊 À l’eau.';
          state.current = target;
        }
        return { ok: true };
      }
      return { ok: false, error: 'Action inconnue.' };
    },

    render: function (el, ctx) {
      var s = ctx.state;
      var me = ctx.me;
      var opp = 1 - me;

      function grid(ownerIdx, showShips, clickable, small) {
        var board = s.boards[ownerIdx];
        var shots = s.shots[ownerIdx];
        var html = '<div class="bn-grid' + (clickable ? ' aim' : '') +
          (small ? ' small' : '') + '">';
        for (var i = 0; i < N * N; i++) {
          var cls = 'bn-cell';
          var content = '';
          var shot = shots[i];
          var isShip = showShips && board.cells[i] !== undefined;
          // bateaux coulés visibles des deux côtés
          if (!isShip) {
            isShip = board.ships.some(function (sh) {
              return sh.sunk && sh.cells.indexOf(i) !== -1;
            });
          }
          if (isShip) cls += ' ship';
          if (shot === 'H') { cls += ' hit'; content = '💥'; }
          else if (shot === 'M') { cls += ' miss'; content = '·'; }
          // dernier tir joué : mis en évidence sur les deux téléphones
          if (s.lastShot && s.lastShot.target === ownerIdx && s.lastShot.idx === i) {
            cls += ' last';
          }
          html += '<div class="' + cls + '" data-i="' + i + '">' + content + '</div>';
        }
        return html + '</div>';
      }

      var html = '';
      if (s.phase === 'place') {
        var ready = s.players[me].ready;
        html += '<p class="mini-msg">Votre flotte (placée au hasard) :</p>' +
          grid(me, true, false) +
          '<div class="mini-actions">' +
          '<button class="btn big" data-a="shuffle"' + (ready ? ' disabled' : '') + '>🔀 Replacer</button>' +
          '<button class="btn big primary" data-a="ready"' + (ready ? ' disabled' : '') + '>' +
          (ready ? '⏳ En attente de l’adversaire…' : '✔️ Je suis prêt') + '</button></div>';
      } else {
        var mine = ctx.me === s.current && !s.finished;
        html += '<p class="mini-msg">' + (s.lastMsg ? s.lastMsg + ' — ' : '') +
          (s.finished ? 'Partie terminée.'
            : mine ? 'À vous de tirer !' : 'Au tour de ' + GG.esc(s.players[s.current].name) + '…') +
          '</p>' +
          '<p class="bn-label">🎯 Tirs sur ' + GG.esc(s.players[opp].name) + '</p>' +
          grid(opp, false, mine, false) +
          '<p class="bn-label">🚢 Votre flotte' +
          (s.lastShot && s.lastShot.target === me ? ' — dernier tir adverse encadré' : '') +
          '</p>' +
          grid(me, true, false, true);
      }
      el.innerHTML = html;
      var sh = el.querySelector('[data-a="shuffle"]');
      if (sh) sh.addEventListener('click', function () { ctx.act({ t: 'shuffle' }); });
      var rd = el.querySelector('[data-a="ready"]');
      if (rd) rd.addEventListener('click', function () { ctx.act({ t: 'ready' }); });
      el.querySelectorAll('.bn-grid.aim .bn-cell').forEach(function (cell) {
        cell.addEventListener('click', function () {
          ctx.act({ t: 'fire', i: parseInt(cell.dataset.i, 10) });
        });
      });
    }
  };

  GG.register(mod);
  if (typeof module === 'object' && module.exports) module.exports = mod;
})(typeof self !== 'undefined' ? self : globalThis);
