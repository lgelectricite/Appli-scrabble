(function (root) {
  'use strict';
  var GG = root.GG;

  var SUITS = ['♠', '♥', '♦', '♣'];
  var RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'V', 'D', 'R'];

  function suitOf(c) { return Math.floor(c / 13); }
  function rankOf(c) { return c % 13; }
  function isRed(c) { var s = suitOf(c); return s === 1 || s === 2; }
  function isInt(x) { return typeof x === 'number' && isFinite(x) && Math.floor(x) === x; }
  function fmt(sec) { var m = Math.floor(sec / 60), s = sec % 60; return m + ':' + (s < 10 ? '0' : '') + s; }
  function foundCount(p) {
    if (!p.board) return 0;
    var n = 0, i;
    for (i = 0; i < 4; i++) n += p.board.found[i].length;
    return n;
  }
  function elapsed(state) { return Math.max(0, Math.round((Date.now() - state.startTs) / 1000)); }

  function endCheck(state) {
    var i, anyDone = false, allOut = true, n = state.players.length;
    for (i = 0; i < n; i++) {
      if (state.players[i].done) anyDone = true;
      if (!state.players[i].done && !state.players[i].gaveUp) allOut = false;
    }
    if ((anyDone && n > 1) || allOut) {
      state.phase = 'done';
      state.durationSec = elapsed(state);
    }
  }

  function autoPile(board, c) {
    var pile = suitOf(c);
    if (board.found[pile].length === rankOf(c)) return pile;
    return -1;
  }

  function cardHTML(c, extra, data) {
    var su = SUITS[suitOf(c)];
    return '<div class="sol-card' + (isRed(c) ? ' red' : '') + (extra ? ' ' + extra : '') + '"' + (data || '') +
      '><span class="sol-cr">' + RANKS[rankOf(c)] + su + '</span><span class="sol-cs">' + su + '</span></div>';
  }

  var mod = {
    id: 'solitaire',
    nom: 'Solitaire',
    icone: '♦️',
    desc: 'Le Klondike classique : seul face aux cartes, tirage 1 ou 3, records par niveau.',
    regles: '<p><strong>🎯 Le but :</strong> Empiler les 52 cartes sur les 4 fondations, de l\'As au Roi, famille par famille.</p>' +
      '<p><strong>Comment jouer :</strong> Touche une carte puis sa destination. Sur les colonnes, les cartes descendent en alternant rouge et noir ; seul un Roi peut s\'installer sur une colonne vide. Touche la pioche pour tirer, et touche deux fois une carte pour l\'envoyer directement aux fondations.</p>' +
      '<p><strong>👥 À plusieurs :</strong> Tout le monde reçoit exactement la même donne. Le premier qui termine gagne la course ; si tout le monde cale, c\'est le plus avancé aux fondations qui l\'emporte.</p>',
    min: 1,
    max: 1,
    hotseat: true,
    hotseatMax: 1,
    hidden: false,
    netOnly: false,

    create: function (names) {
      var players = [], i;
      for (i = 0; i < names.length; i++) {
        players.push({ name: names[i], done: false, gaveUp: false, moves: 0, order: -1, sec: 0, board: null });
      }
      return { phase: 'setup', level: null, draw: 1, players: players, startTs: 0, durationSec: 0 };
    },

    turnOf: function (state) { return state.phase === 'setup' ? 0 : -1; },

    over: function (state) { return state.phase === 'done'; },

    scoreOf: function (state, i) {
      var p = state.players[i];
      if (!p || !p.board) return '0/52';
      if (p.done) return '🎉';
      if (p.gaveUp) return '🏳️ ' + foundCount(p) + '/52';
      return foundCount(p) + '/52';
    },

    redact: function (state, viewer) {
      var s = GG.clone(state), i, j, k;
      for (i = 0; i < s.players.length; i++) {
        var b = s.players[i].board;
        if (!b) continue;
        for (j = 0; j < b.stock.length; j++) b.stock[j] = -1;
        for (j = 0; j < 7; j++) {
          for (k = 0; k < b.tab[j].length; k++) {
            if (!b.tab[j][k].up) b.tab[j][k].c = -1;
          }
        }
      }
      return s;
    },

    apply: function (state, player, action, ctx) {
      if (!action || typeof action.t !== 'string') return { ok: false, error: 'Action invalide.' };
      if (!isInt(player) || player < 0 || player >= state.players.length) return { ok: false, error: 'Joueur inconnu.' };
      if (state.phase === 'done') return { ok: false, error: 'La partie est terminée.' };

      if (action.t === 'level') {
        if (state.phase !== 'setup') return { ok: false, error: 'La difficulté est déjà choisie.' };
        if (player !== 0) return { ok: false, error: 'Seul le premier joueur choisit la difficulté.' };
        if (action.l !== 'facile' && action.l !== 'difficile') return { ok: false, error: 'Niveau inconnu.' };
        var full = [], x;
        for (x = 0; x < 52; x++) full.push(x);
        var deck = GG.shuffle(full);
        var base = { stock: [], waste: [], found: [[], [], [], []], tab: [] };
        var pos = 0, ci, cj;
        for (ci = 0; ci < 7; ci++) {
          var col = [];
          for (cj = 0; cj <= ci; cj++) col.push({ c: deck[pos++], up: cj === ci });
          base.tab.push(col);
        }
        base.stock = deck.slice(pos);
        for (x = 0; x < state.players.length; x++) state.players[x].board = GG.clone(base);
        state.level = action.l;
        state.draw = action.l === 'difficile' ? 3 : 1;
        state.phase = 'play';
        state.startTs = Date.now();
        return { ok: true };
      }

      if (state.phase !== 'play') return { ok: false, error: 'La partie n\'a pas encore commencé.' };
      var p = state.players[player];
      if (p.done) return { ok: false, error: 'Tu as déjà terminé !' };
      if (p.gaveUp) return { ok: false, error: 'Tu as abandonné cette donne.' };
      var b = p.board;

      if (action.t === 'draw') {
        if (b.stock.length === 0) {
          if (b.waste.length === 0) return { ok: false, error: 'Rien à piocher.' };
          b.stock = b.waste.slice().reverse();
          b.waste = [];
          return { ok: true };
        }
        var n = state.draw;
        while (n > 0 && b.stock.length) { b.waste.push(b.stock.pop()); n--; }
        return { ok: true };
      }

      if (action.t === 'giveup') {
        p.gaveUp = true;
        p.sec = elapsed(state);
        endCheck(state);
        return { ok: true };
      }

      if (action.t === 'move') {
        var src = action.src, dst = action.dst;
        if (!src || !dst) return { ok: false, error: 'Coup invalide.' };
        var cards = null, i2;

        if (src.k === 'waste') {
          if (!b.waste.length) return { ok: false, error: 'La défausse est vide.' };
          cards = [b.waste[b.waste.length - 1]];
        } else if (src.k === 'tab') {
          if (!isInt(src.col) || src.col < 0 || src.col > 6) return { ok: false, error: 'Colonne invalide.' };
          if (!isInt(src.idx) || src.idx < 0 || src.idx >= b.tab[src.col].length) return { ok: false, error: 'Carte invalide.' };
          var scol = b.tab[src.col];
          for (i2 = src.idx; i2 < scol.length; i2++) {
            if (!scol[i2].up) return { ok: false, error: 'Cette carte est face cachée.' };
          }
          cards = [];
          for (i2 = src.idx; i2 < scol.length; i2++) cards.push(scol[i2].c);
        } else if (src.k === 'found') {
          if (!isInt(src.pile) || src.pile < 0 || src.pile > 3) return { ok: false, error: 'Fondation invalide.' };
          if (!b.found[src.pile].length) return { ok: false, error: 'Cette fondation est vide.' };
          cards = [b.found[src.pile][b.found[src.pile].length - 1]];
        } else {
          return { ok: false, error: 'Coup invalide.' };
        }

        if (dst.k === 'found') {
          if (!isInt(dst.pile) || dst.pile < 0 || dst.pile > 3) return { ok: false, error: 'Fondation invalide.' };
          if (cards.length !== 1) return { ok: false, error: 'Une seule carte à la fois vers les fondations.' };
          var c1 = cards[0];
          if (suitOf(c1) !== dst.pile) return { ok: false, error: 'Ce n\'est pas la bonne famille.' };
          if (rankOf(c1) !== b.found[dst.pile].length) return { ok: false, error: 'Il faut respecter l\'ordre : As, 2, 3…' };
        } else if (dst.k === 'tab') {
          if (!isInt(dst.col) || dst.col < 0 || dst.col > 6) return { ok: false, error: 'Colonne invalide.' };
          if (src.k === 'tab' && src.col === dst.col) return { ok: false, error: 'La carte est déjà dans cette colonne.' };
          var dcol = b.tab[dst.col], first = cards[0];
          if (!dcol.length) {
            if (rankOf(first) !== 12) return { ok: false, error: 'Seul un Roi peut occuper une colonne vide.' };
          } else {
            var top = dcol[dcol.length - 1];
            if (!top.up) return { ok: false, error: 'Cette colonne est bloquée.' };
            if (rankOf(top.c) !== rankOf(first) + 1) return { ok: false, error: 'Il faut poser une carte juste inférieure.' };
            if (isRed(top.c) === isRed(first)) return { ok: false, error: 'Il faut alterner rouge et noir.' };
          }
        } else {
          return { ok: false, error: 'Coup invalide.' };
        }

        if (src.k === 'waste') {
          b.waste.pop();
        } else if (src.k === 'found') {
          b.found[src.pile].pop();
        } else {
          b.tab[src.col].splice(src.idx);
          var rest = b.tab[src.col];
          if (rest.length && !rest[rest.length - 1].up) rest[rest.length - 1].up = true;
        }
        if (dst.k === 'found') {
          b.found[dst.pile].push(cards[0]);
        } else {
          for (i2 = 0; i2 < cards.length; i2++) b.tab[dst.col].push({ c: cards[i2], up: true });
        }
        p.moves++;

        if (foundCount(p) === 52) {
          var before = 0, i3;
          for (i3 = 0; i3 < state.players.length; i3++) {
            if (i3 !== player && state.players[i3].done) before++;
          }
          p.done = true;
          p.order = before;
          p.sec = elapsed(state);
          endCheck(state);
        }
        return { ok: true };
      }

      return { ok: false, error: 'Action inconnue.' };
    },

    summary: function (state) {
      var rows = [], i, p;
      for (i = 0; i < state.players.length; i++) {
        p = state.players[i];
        rows.push({ name: p.name, done: p.done, gaveUp: p.gaveUp, found: foundCount(p), sec: p.sec, order: p.order, moves: p.moves });
      }
      rows.sort(function (a, b) {
        if (a.done !== b.done) return a.done ? -1 : 1;
        if (a.done && b.done) return (a.order - b.order) || (a.sec - b.sec);
        if (a.found !== b.found) return b.found - a.found;
        return a.moves - b.moves;
      });
      var winners = [];
      var anyDone = rows.length > 0 && rows[0].done;
      if (anyDone) {
        for (i = 0; i < rows.length; i++) {
          if (rows[i].done && rows[i].order === rows[0].order) winners.push(rows[i].name);
        }
      } else if (rows.length > 1) {
        // personne n'a fini : le plus avancé l'emporte (ex æquo possibles)
        for (i = 0; i < rows.length; i++) {
          if (rows[i].found === rows[0].found) winners.push(rows[i].name);
        }
      }
      var html = '';
      if (winners.length) {
        var wn = [];
        for (i = 0; i < winners.length; i++) wn.push(GG.esc(winners[i]));
        html += '<h1>🏆 ' + wn.join(' & ') + '</h1>';
      } else {
        html += '<h1>😢 Le jeu gagne cette fois…</h1>';
      }
      for (i = 0; i < rows.length; i++) {
        var r = rows[i], res;
        if (r.done) res = '🎉 gagné en ' + fmt(r.sec) + ' · ' + r.moves + ' coups';
        else if (r.gaveUp) res = '🏳️ ' + r.found + '/52';
        else res = r.found + '/52';
        html += '<div class="final-line"><span>' + GG.esc(r.name) + '</span><strong>' + res + '</strong></div>';
      }
      if (state.players.length === 1 && state.players[0].done && state.level) {
        try {
          var key = 'gg-solitaire-best-' + state.level;
          var raw = localStorage.getItem(key);
          var rec = raw ? JSON.parse(raw) : null;
          var sec = state.players[0].sec || state.durationSec;
          if (!rec || !isInt(rec.sec) || sec < rec.sec) {
            rec = { sec: sec, ts: state.startTs };
            localStorage.setItem(key, JSON.stringify(rec));
          }
          if (rec.ts === state.startTs) html += '<p class="mini-msg">🏆 Nouveau record !</p>';
          else html += '<p class="hint">Record à battre : ' + fmt(rec.sec) + '</p>';
        } catch (e) {}
      }
      return html;
    },

    render: function (el, ctx) {
      var s = ctx.state;
      var me = (isInt(ctx.me) && ctx.me >= 0 && ctx.me < s.players.length) ? ctx.me : 0;

      if (s.phase === 'setup') {
        el._sel = null;
        el._confirmGiveup = false;
        if (el._solTimer) { clearInterval(el._solTimer); el._solTimer = null; }
        var setupHtml = '<div class="sol-wrap">';
        if (me === 0) {
          setupHtml += '<p class="mini-msg">♦️ Choisis ta façon de piocher :</p>' +
            '<div class="lvl-btns">' +
            '<button class="btn" data-lvl="facile">🙂 Facile — 1 carte</button>' +
            '<button class="btn" data-lvl="difficile">😤 Difficile — 3 cartes</button>' +
            '</div>';
          if (s.players.length > 1) setupHtml += '<p class="hint">Même donne pour tout le monde : le premier qui termine gagne !</p>';
        } else {
          setupHtml += '<p class="waiting">' + GG.esc(s.players[0].name) + ' choisit la difficulté…</p>';
        }
        setupHtml += '</div>';
        el.innerHTML = setupHtml;
        var setupRoot = el.querySelector('.sol-wrap');
        setupRoot.addEventListener('click', function (e) {
          var node = e.target;
          while (node && node !== setupRoot.parentNode) {
            if (node.getAttribute && node.getAttribute('data-lvl')) {
              ctx.act({ t: 'level', l: node.getAttribute('data-lvl') });
              return;
            }
            node = node.parentNode;
          }
        });
        return;
      }

      var p = s.players[me], b = p.board;

      var sel = el._sel;
      if (sel) {
        var okSel = false;
        if (sel.k === 'waste') okSel = b.waste.length > 0;
        else if (sel.k === 'found') okSel = isInt(sel.pile) && sel.pile >= 0 && sel.pile <= 3 && b.found[sel.pile].length > 0;
        else if (sel.k === 'tab') okSel = isInt(sel.col) && sel.col >= 0 && sel.col <= 6 && isInt(sel.idx) && sel.idx >= 0 && sel.idx < b.tab[sel.col].length && b.tab[sel.col][sel.idx].up;
        if (!okSel) { sel = null; el._sel = null; }
      }

      var playing = s.phase === 'play' && !p.done && !p.gaveUp;
      var shownSec = (p.done || p.gaveUp) ? p.sec : (s.phase === 'done' ? s.durationSec : elapsed(s));

      var html = '<div class="sol-wrap">';
      html += '<div class="mem-stats">' +
        '<span class="mem-stat">🃏 ' + p.moves + (p.moves > 1 ? ' coups' : ' coup') + '</span>' +
        '<span class="mem-stat" id="sol-timer">⏱️ ' + fmt(shownSec) + '</span>' +
        '<span class="mem-stat">⭐ ' + foundCount(p) + '/52</span>' +
        '<span class="mem-stat">' + (s.level === 'difficile' ? '😤 3 cartes' : '🙂 1 carte') + '</span>' +
        '</div>';

      if (s.players.length > 1) {
        html += '<div class="mem-stats sol-opps">';
        for (var oi = 0; oi < s.players.length; oi++) {
          if (oi === me) continue;
          var op = s.players[oi];
          html += '<span class="mem-stat">' + GG.esc(op.name) + ' · ' +
            (op.done ? '🎉 ' : (op.gaveUp ? '🏳️ ' : '')) + foundCount(op) + '/52</span>';
        }
        html += '</div>';
      }

      html += '<div class="sol-felt"><div class="sol-row">';
      if (b.stock.length) {
        html += '<div class="sol-card sol-down" data-act="draw"><span class="sol-cnt">' + b.stock.length + '</span></div>';
      } else if (b.waste.length) {
        html += '<div class="sol-slot" data-act="draw">↺</div>';
      } else {
        html += '<div class="sol-slot"></div>';
      }
      if (b.waste.length) {
        html += cardHTML(b.waste[b.waste.length - 1], (sel && sel.k === 'waste') ? 'sol-sel' : '', ' data-waste="1"');
      } else {
        html += '<div class="sol-slot"></div>';
      }
      html += '<div></div>';
      for (var fi = 0; fi < 4; fi++) {
        var fp = b.found[fi];
        var fSel = (sel && sel.k === 'found' && sel.pile === fi) ? 'sol-sel' : '';
        if (fp.length) html += cardHTML(fp[fp.length - 1], fSel, ' data-found="' + fi + '"');
        else html += '<div class="sol-slot' + (fSel ? ' sol-sel' : '') + '" data-found="' + fi + '">' + SUITS[fi] + '</div>';
      }
      html += '</div><div class="sol-tab">';
      for (var tc = 0; tc < 7; tc++) {
        html += '<div class="sol-col" data-tab="' + tc + '">';
        var colArr = b.tab[tc];
        if (!colArr.length) {
          html += '<div class="sol-slot"></div>';
        } else {
          for (var tj = 0; tj < colArr.length; tj++) {
            var cc = colArr[tj];
            if (cc.up) {
              var isSel = sel && sel.k === 'tab' && sel.col === tc && tj >= sel.idx;
              html += cardHTML(cc.c, isSel ? 'sol-sel' : '', ' data-card="' + tc + ':' + tj + '"');
            } else {
              html += '<div class="sol-card sol-down"></div>';
            }
          }
        }
        html += '</div>';
      }
      html += '</div></div>';

      if (p.done) html += '<p class="mini-msg">🎉 Bravo, Solitaire réussi en ' + fmt(p.sec) + ' !</p>';
      else if (p.gaveUp && s.phase === 'play') html += '<p class="waiting">🏳️ Tu as abandonné… on attend les autres.</p>';
      else if (playing) html += '<p class="hint">Touche une carte puis sa destination. Deux fois sur la même carte : direction les fondations !</p>';

      if (playing) {
        html += '<button class="btn sol-giveup" data-giveup="1">' +
          (el._confirmGiveup ? '⚠️ Vraiment abandonner ?' : '🏳️ Abandonner') + '</button>';
      }
      html += '</div>';
      el.innerHTML = html;

      if (el._solTimer && !playing) { clearInterval(el._solTimer); el._solTimer = null; }
      if (playing && s.startTs && !el._solTimer) {
        el._solTimer = setInterval(function () {
          var t = el.querySelector('#sol-timer');
          if (!t || !document.body.contains(t)) { clearInterval(el._solTimer); el._solTimer = null; return; }
          t.textContent = '⏱️ ' + fmt(Math.max(0, Math.round((Date.now() - s.startTs) / 1000)));
        }, 1000);
      }

      var rootEl = el.querySelector('.sol-wrap');
      rootEl.addEventListener('click', function (e) {
        if (!playing) return;
        var node = e.target, kind = null, val = null;
        while (node && node !== rootEl.parentNode) {
          if (node.getAttribute) {
            if (node.getAttribute('data-card') !== null) { kind = 'card'; val = node.getAttribute('data-card'); break; }
            if (node.getAttribute('data-waste') !== null) { kind = 'waste'; break; }
            if (node.getAttribute('data-act') !== null) { kind = 'draw'; break; }
            if (node.getAttribute('data-found') !== null) { kind = 'found'; val = node.getAttribute('data-found'); break; }
            if (node.getAttribute('data-giveup') !== null) { kind = 'giveup'; break; }
            if (node.getAttribute('data-tab') !== null) { kind = 'tab'; val = node.getAttribute('data-tab'); break; }
          }
          node = node.parentNode;
        }
        if (!kind) {
          // un tap dans le vide désarme la confirmation d'abandon
          if (el._confirmGiveup) { el._confirmGiveup = false; mod.render(el, ctx); }
          return;
        }
        var hadConfirm = el._confirmGiveup;
        if (kind !== 'giveup') el._confirmGiveup = false;
        var selv = el._sel;

        if (kind === 'draw') {
          if (selv) { el._sel = null; mod.render(el, ctx); }
          ctx.act({ t: 'draw' });
          return;
        }

        if (kind === 'card') {
          var parts = val.split(':'), ci = parseInt(parts[0], 10), ix = parseInt(parts[1], 10);
          if (selv && selv.k === 'tab' && selv.col === ci && selv.idx === ix) {
            var colA = b.tab[ci];
            if (ix === colA.length - 1) {
              var pl = autoPile(b, colA[ix].c);
              if (pl >= 0) {
                el._sel = null;
                mod.render(el, ctx); // désélection avant l'action
                ctx.act({ t: 'move', src: { k: 'tab', col: ci, idx: ix }, dst: { k: 'found', pile: pl } });
                return;
              }
            }
            el._sel = null;
            mod.render(el, ctx);
            return;
          }
          if (selv && selv.k === 'tab' && selv.col === ci) {
            // autre carte de la même colonne : on déplace la sélection
            el._sel = { k: 'tab', col: ci, idx: ix };
            mod.render(el, ctx);
            return;
          }
          if (selv) {
            el._sel = null;
            mod.render(el, ctx); // désélection AVANT l'action (jamais après)
            ctx.act({ t: 'move', src: selv, dst: { k: 'tab', col: ci } });
            return;
          }
          el._sel = { k: 'tab', col: ci, idx: ix };
          mod.render(el, ctx);
          return;
        }

        if (kind === 'waste') {
          if (selv && selv.k === 'waste') {
            var wp = autoPile(b, b.waste[b.waste.length - 1]);
            if (wp >= 0) {
              el._sel = null;
              mod.render(el, ctx); // désélection avant l'action
              ctx.act({ t: 'move', src: { k: 'waste' }, dst: { k: 'found', pile: wp } });
              return;
            }
            el._sel = null;
            mod.render(el, ctx);
            return;
          }
          el._sel = { k: 'waste' };
          mod.render(el, ctx);
          return;
        }

        if (kind === 'found') {
          var pi = parseInt(val, 10);
          if (selv) {
            if (selv.k === 'found' && selv.pile === pi) {
              el._sel = null;
              mod.render(el, ctx);
              return;
            }
            el._sel = null;
            mod.render(el, ctx); // désélection avant l'action
            ctx.act({ t: 'move', src: selv, dst: { k: 'found', pile: pi } });
            return;
          }
          if (b.found[pi].length) {
            el._sel = { k: 'found', pile: pi };
            mod.render(el, ctx);
          } else if (hadConfirm) {
            mod.render(el, ctx);
          }
          return;
        }

        if (kind === 'tab') {
          if (selv) {
            el._sel = null;
            mod.render(el, ctx); // désélection avant l'action
            ctx.act({ t: 'move', src: selv, dst: { k: 'tab', col: parseInt(val, 10) } });
          } else if (hadConfirm) {
            mod.render(el, ctx);
          }
          return;
        }

        if (kind === 'giveup') {
          if (el._confirmGiveup) {
            // un double-appui ne doit pas confirmer ce qu'il vient d'armer
            if (Date.now() - (el._solConfT || 0) < 300) return;
            el._confirmGiveup = false;
            el._sel = null;
            ctx.act({ t: 'giveup' });
          } else {
            el._confirmGiveup = true;
            el._solConfT = Date.now();
            mod.render(el, ctx);
          }
          return;
        }
      });
    }
  };

  GG.register(mod);
  if (typeof module === 'object' && module.exports) module.exports = mod;
})(typeof self !== 'undefined' ? self : globalThis);
