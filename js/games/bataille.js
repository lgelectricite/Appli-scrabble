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
    regles: '<p><strong>🎯 Le but :</strong> couler les 5 navires adverses avant que les vôtres ne le soient.</p><p><strong>Comment jouer :</strong> à votre tour, touchez une case de la grille adverse. 💥 Touché : vous rejouez ! 🌊 À l’eau : le tour passe. Les flottes restent secrètes, le dernier tir adverse est encadré.</p><p><strong>La série :</strong> revanche après chaque manche, victoires comptées — le perdant commence.</p>',
    min: 2, max: 2,
    hotseat: true, hidden: true, netOnly: false,

    create: function (names) {
      return {
        players: names.map(function (n) { return { name: n, ready: false, wins: 0 }; }),
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
    over: function () { return false; }, // série de manches : revanche possible
    scoreOf: function (state, i) {
      if (state.finished) return state.players[i].wins + ' 🏆';
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
          // ni les positions NI le détail des touches par navire ne circulent
          return s.sunk ? s : { size: s.size, cells: [], hits: 0, sunk: false };
        });
      }
      return copy;
    },

    apply: function (state, player, action) {
      if (action.t === 'again') {
        if (!state.finished) return { ok: false, error: 'La manche n’est pas finie.' };
        state.boards = [randomFleet(), randomFleet()];
        state.shots = [new Array(N * N).fill(null), new Array(N * N).fill(null)];
        state.players.forEach(function (p) { p.ready = false; });
        state.phase = 'place';
        state.firstNext = 1 - state.winner; // le perdant commencera la revanche
        state.finished = false;
        state.winner = -1;
        state.lastMsg = '';
        state.lastShot = null;
        return { ok: true };
      }
      if (state.finished) return { ok: false, error: 'Manche terminée.' };
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
          state.current = state.firstNext === undefined || state.firstNext === null
            ? 0 : state.firstNext;
          state.firstNext = null;
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
            state.players[player].wins++;
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

    /* Adversaire IA : chasse en damier, puis ciblage autour des touches.
       Fair-play : n'utilise que ce qu'un humain verrait à sa place — ses
       propres tirs (touché / à l'eau) et les navires adverses déjà coulés
       (affichés des deux côtés). Jamais les positions secrètes. */
    bot: function (state, me) {
      if (state.finished) return null; // écran de revanche : l'humain décide
      if (state.phase === 'place') {
        if (state.players[me].ready) return null; // on attend l'adversaire
        return { t: 'ready' }; // la flotte aléatoire de create() convient
      }
      if (state.current !== me) return null;
      var opp = 1 - me;
      var shots = state.shots[opp]; // MES tirs sur la grille adverse
      // cases des navires adverses coulés : information publique
      var coule = {};
      state.boards[opp].ships.forEach(function (sh) {
        if (sh.sunk) sh.cells.forEach(function (i) { coule[i] = true; });
      });
      function libre(i) { return !shots[i]; }
      function actif(i) { return shots[i] === 'H' && !coule[i]; }
      // touches « actives » : navire touché mais pas encore coulé
      var actifs = [];
      for (var i = 0; i < N * N; i++) if (actif(i)) actifs.push(i);
      var cibles = [];
      // deux touches actives alignées → on prolonge la ligne aux deux bouts
      actifs.forEach(function (h) {
        var r = Math.floor(h / N), c = h % N;
        if (c + 1 < N && actif(h + 1)) { // segment horizontal
          var g = c; while (g > 0 && actif(r * N + g - 1)) g--;
          var d = c + 1; while (d < N - 1 && actif(r * N + d + 1)) d++;
          if (g > 0 && libre(r * N + g - 1)) cibles.push(r * N + g - 1);
          if (d < N - 1 && libre(r * N + d + 1)) cibles.push(r * N + d + 1);
        }
        if (r + 1 < N && actif(h + N)) { // segment vertical
          var ht = r; while (ht > 0 && actif((ht - 1) * N + c)) ht--;
          var bs = r + 1; while (bs < N - 1 && actif((bs + 1) * N + c)) bs++;
          if (ht > 0 && libre((ht - 1) * N + c)) cibles.push((ht - 1) * N + c);
          if (bs < N - 1 && libre((bs + 1) * N + c)) cibles.push((bs + 1) * N + c);
        }
      });
      if (!cibles.length && actifs.length) {
        // touche isolée : on tâte les voisins orthogonaux
        actifs.forEach(function (h) {
          var r = Math.floor(h / N), c = h % N;
          if (c > 0 && libre(h - 1)) cibles.push(h - 1);
          if (c < N - 1 && libre(h + 1)) cibles.push(h + 1);
          if (r > 0 && libre(h - N)) cibles.push(h - N);
          if (r < N - 1 && libre(h + N)) cibles.push(h + N);
        });
      }
      if (!cibles.length) {
        // chasse : quadrillage en damier (le plus petit navire fait 2 cases),
        // avec une pointe de fantaisie pour rester battable
        var toutes = [], damier = [];
        for (var j = 0; j < N * N; j++) {
          if (shots[j]) continue;
          toutes.push(j);
          if ((Math.floor(j / N) + j % N) % 2 === 0) damier.push(j);
        }
        if (!toutes.length) return null; // grille épuisée (impossible en pratique)
        cibles = (damier.length && Math.random() > 0.15) ? damier : toutes;
      }
      return { t: 'fire', i: cibles[Math.floor(Math.random() * cibles.length)] };
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
      if (s.finished) {
        html += '<p class="mini-msg big-msg">🏆 ' + GG.esc(s.players[s.winner].name) +
          ' gagne la manche !</p>' +
          '<p class="mini-msg">Score de la série : ' +
          GG.esc(s.players[0].name) + ' ' + s.players[0].wins + ' — ' +
          s.players[1].wins + ' ' + GG.esc(s.players[1].name) + '</p>' +
          '<p class="bn-label">La flotte de ' + GG.esc(s.players[1 - me].name) + ' :</p>' +
          grid(1 - me, true, false, false) +
          '<button class="btn big primary" data-a="again">🔁 Revanche</button>';
        el.innerHTML = html;
        var ag = el.querySelector('[data-a="again"]');
        if (ag) ag.addEventListener('click', function () { ctx.act({ t: 'again' }); });
        return;
      }
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
