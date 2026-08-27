/* GGgames — Poker Texas Hold'em (2 à 4 joueurs, réseau uniquement). */
(function (root) {
  'use strict';
  var GG = root.GG;
  var START_CHIPS = 1000;
  var BLINDS = [10, 20];
  var RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'V', 'D', 'R', 'A'];
  var SUITS = ['♠', '♥', '♦', '♣'];
  var CAT_NAMES = ['Carte haute', 'Paire', 'Deux paires', 'Brelan', 'Suite',
    'Couleur', 'Full', 'Carré', 'Quinte flush'];

  /* ---------- évaluation des mains ---------- */

  function rank5(cards) {
    var rs = cards.map(function (c) { return c >> 2; }).sort(function (a, b) { return b - a; });
    var suits = cards.map(function (c) { return c & 3; });
    var flush = suits.every(function (s) { return s === suits[0]; });
    var counts = {};
    rs.forEach(function (r) { counts[r] = (counts[r] || 0) + 1; });
    // groupes triés par (nombre, rang) décroissant
    var groups = Object.keys(counts).map(Number).sort(function (a, b) {
      return counts[b] - counts[a] || b - a;
    });
    var uniq = groups.slice().sort(function (a, b) { return b - a; });
    var straightHigh = -1;
    if (uniq.length === 5) {
      if (uniq[0] - uniq[4] === 4) straightHigh = uniq[0];
      else if (uniq[0] === 12 && uniq[1] === 3) straightHigh = 3; // A-2-3-4-5
    }
    var kick = groups.map(function (g) { return g; });
    if (straightHigh !== -1 && flush) return [8, straightHigh];
    if (counts[groups[0]] === 4) return [7, groups[0], groups[1]];
    if (counts[groups[0]] === 3 && counts[groups[1]] === 2) return [6, groups[0], groups[1]];
    if (flush) return [5].concat(rs);
    if (straightHigh !== -1) return [4, straightHigh];
    if (counts[groups[0]] === 3) return [3].concat(kick);
    if (counts[groups[0]] === 2 && counts[groups[1]] === 2) return [2].concat(kick);
    if (counts[groups[0]] === 2) return [1].concat(kick);
    return [0].concat(rs);
  }

  function cmpRank(a, b) {
    for (var i = 0; i < Math.max(a.length, b.length); i++) {
      var d = (a[i] || 0) - (b[i] || 0);
      if (d) return d;
    }
    return 0;
  }

  /* meilleure main de 5 cartes parmi 7 */
  function best7(cards) {
    var best = null;
    for (var i = 0; i < 7; i++) {
      for (var j = i + 1; j < 7; j++) {
        var five = [];
        for (var k = 0; k < 7; k++) if (k !== i && k !== j) five.push(cards[k]);
        var r = rank5(five);
        if (!best || cmpRank(r, best) > 0) best = r;
      }
    }
    return best;
  }

  /* ---------- déroulement ---------- */

  function actives(state) {
    return state.players.filter(function (p) { return !p.out && !p.folded; }).length;
  }

  function nextIdx(state, from, filter) {
    var n = state.players.length;
    for (var k = 1; k <= n; k++) {
      var i = (from + k) % n;
      var p = state.players[i];
      if (!p.out && filter(p)) return i;
    }
    return -1;
  }

  function canPlay(p) { return !p.folded && !p.allin; }

  function post(state, idx, amount) {
    var p = state.players[idx];
    var a = Math.min(amount, p.chips);
    p.chips -= a;
    p.bet += a;
    p.cont += a;
    if (p.chips === 0) p.allin = true;
    return a;
  }

  function potTotal(state) {
    return state.players.reduce(function (s, p) { return s + p.cont; }, 0);
  }

  function hasChips(p) { return p.chips > 0; }

  function newHand(state) {
    // Tournoi : blinds qui doublent toutes les 6 mains
    if (state.mode === 'tournoi') {
      var level = Math.floor(state.handNum / 6);
      state.blinds = [10 * Math.pow(2, level), 20 * Math.pow(2, level)];
    }
    var alive = state.players.filter(function (p) { return !p.out && p.chips > 0; });
    if (alive.length < 2) {
      if (state.mode === 'tournoi') { state.finished = true; return; }
      state.handOver = true;
      state.handMsg = 'En attente d’une recave pour continuer…';
      return;
    }
    state.handNum++;
    var deck = [];
    for (var c = 0; c < 52; c++) deck.push(c);
    GG.shuffle(deck);
    state.deck = deck;
    state.community = [];
    state.handOver = false;
    state.handMsg = '';
    state.showdownInfo = null;
    state.players.forEach(function (p) {
      // sans jetons (cash game) : on saute la main en attendant une recave
      p.folded = p.out || p.chips === 0;
      p.bet = 0; p.cont = 0; p.allin = false; p.show = false;
      p.hole = p.folded ? [] : [state.deck.pop(), state.deck.pop()];
    });
    state.dealer = nextIdx(state, state.dealer, hasChips);
    var sb, bb;
    if (alive.length === 2) {
      sb = state.dealer;
      bb = nextIdx(state, sb, hasChips);
    } else {
      sb = nextIdx(state, state.dealer, hasChips);
      bb = nextIdx(state, sb, hasChips);
    }
    post(state, sb, state.blinds[0]);
    post(state, bb, state.blinds[1]);
    state.maxBet = state.blinds[1];
    state.minRaise = state.blinds[1];
    state.street = 'pre';
    state.need = state.players.map(function (p) { return canPlay(p); });
    state.current = nextIdx(state, bb, canPlay);
    if (state.current === -1) advanceStreet(state);
  }

  function settleFold(state) {
    // il ne reste qu'un joueur : il ramasse le pot sans montrer ses cartes
    var winner = state.players.findIndex(function (p) { return !p.out && !p.folded; });
    var pot = potTotal(state);
    state.players[winner].chips += pot;
    state.players.forEach(function (p) { p.cont = 0; p.bet = 0; });
    state.handMsg = GG.esc(state.players[winner].name) + ' remporte ' + pot + ' 🪙 (tout le monde s’est couché).';
    endHand(state);
  }

  function showdown(state) {
    state.street = 'showdown';
    var board = state.community;
    var contenders = [];
    state.players.forEach(function (p, i) {
      if (!p.out && !p.folded) {
        p.show = true;
        p.rank = best7(p.hole.concat(board));
        contenders.push(i);
      }
    });
    // excédent non suivi : le plus gros contributeur récupère la différence
    // avec le second — ce n'est pas un gain, juste un remboursement
    var conts = state.players.map(function (p) { return p.cont; }).sort(function (a, b) { return b - a; });
    if (conts.length > 1 && conts[0] > conts[1]) {
      var excess = conts[0] - conts[1];
      for (var xi = 0; xi < state.players.length; xi++) {
        if (state.players[xi].cont === conts[0]) {
          state.players[xi].cont -= excess;
          state.players[xi].chips += excess;
          break;
        }
      }
    }
    // pots (principal + secondaires) selon les contributions
    var msgs = [];
    var guard = 0;
    while (guard++ < 10) {
      var level = Infinity;
      state.players.forEach(function (p) {
        if (p.cont > 0) level = Math.min(level, p.cont);
      });
      if (!isFinite(level)) break;
      var pot = 0;
      var eligible = [];
      state.players.forEach(function (p, i) {
        if (p.cont > 0) {
          pot += level;
          p.cont -= level;
          if (!p.folded && !p.out) eligible.push(i);
        }
      });
      if (!eligible.length) eligible = contenders.slice();
      var bestR = null;
      eligible.forEach(function (i) {
        if (!bestR || cmpRank(state.players[i].rank, bestR) > 0) bestR = state.players[i].rank;
      });
      var winners = eligible.filter(function (i) {
        return cmpRank(state.players[i].rank, bestR) === 0;
      });
      var share = Math.floor(pot / winners.length);
      var rest = pot - share * winners.length;
      winners.forEach(function (i, k) {
        state.players[i].chips += share + (k === 0 ? rest : 0);
      });
      msgs.push(winners.map(function (i) { return GG.esc(state.players[i].name); }).join(' & ') +
        ' : ' + pot + ' 🪙 (' + CAT_NAMES[bestR[0]] + ')');
    }
    state.handMsg = msgs.join(' · ');
    endHand(state);
  }

  function endHand(state) {
    state.handOver = true;
    state.current = -1;
    if (state.mode === 'tournoi') {
      state.players.forEach(function (p) {
        if (!p.out && p.chips === 0) {
          p.out = true;
          state.handMsg += ' 💔 ' + GG.esc(p.name) + ' est éliminé.';
        }
      });
      var alive = state.players.filter(function (p) { return !p.out; });
      if (alive.length < 2) {
        state.finished = true;
        state.winner = state.players.findIndex(function (p) { return !p.out; });
      }
    } else {
      state.players.forEach(function (p) {
        if (p.chips === 0) {
          state.handMsg += ' 💸 ' + GG.esc(p.name) + ' n’a plus de jetons (recave possible).';
        }
      });
    }
  }

  function advanceStreet(state) {
    if (actives(state) <= 1) { settleFold(state); return; }
    state.players.forEach(function (p) { p.bet = 0; });
    state.maxBet = 0;
    state.minRaise = state.blinds[1];
    var playable = state.players.filter(function (p) { return canPlay(p) && !p.out; }).length;
    if (state.street === 'pre') {
      state.community = [state.deck.pop(), state.deck.pop(), state.deck.pop()];
      state.street = 'flop';
    } else if (state.street === 'flop') {
      state.community.push(state.deck.pop());
      state.street = 'turn';
    } else if (state.street === 'turn') {
      state.community.push(state.deck.pop());
      state.street = 'river';
    } else {
      showdown(state);
      return;
    }
    if (playable < 2) {
      // tout le monde est à tapis : on déroule jusqu'au bout
      advanceStreet(state);
      return;
    }
    state.need = state.players.map(function (p) { return canPlay(p) && !p.out; });
    state.current = nextIdx(state, state.dealer, canPlay);
    if (state.current === -1) advanceStreet(state);
  }

  function afterAction(state) {
    if (actives(state) <= 1) { settleFold(state); return; }
    var pending = state.need.some(function (n, i) {
      return n && canPlay(state.players[i]) && !state.players[i].out;
    });
    if (!pending) { advanceStreet(state); return; }
    state.current = nextIdx(state, state.current, function (p, i) { return canPlay(p); });
    // avance jusqu'à un joueur qui doit encore parler
    var guard = 0;
    while (guard++ < 8 && state.current !== -1 && !state.need[state.current]) {
      state.current = nextIdx(state, state.current, canPlay);
    }
    if (state.current === -1) advanceStreet(state);
  }

  var mod = {
    id: 'poker',
    nom: 'Poker',
    icone: '🃏',
    desc: 'Texas Hold’em, au choix : cash game (recaves) ou tournoi (blinds montantes).',
    regles: '<p><strong>🎯 Le but :</strong> gagner les jetons des autres au Texas Hold’em.</p><p><strong>Comment jouer :</strong> 2 cartes secrètes en main, 5 cartes communes au centre : la meilleure main de 5 cartes gagne le pot. Misez, suivez, relancez… ou bluffez et couchez tout le monde !</p><p><strong>Deux modes :</strong> cash game (blinds fixes, recave possible) ou tournoi (blinds montantes, le dernier survivant rafle tout).</p><p><strong>🪙 La cagnotte :</strong> la cave (1 000) et chaque recave sortent de la cagnotte de votre téléphone ; votre pile y retourne quand vous quittez la table. Recharge automatique chaque semaine.</p>',
    min: 2, max: 4,
    hotseat: false, hidden: true, netOnly: true,

    create: function (names) {
      return {
        players: names.map(function (n) {
          return { name: n, chips: START_CHIPS, hole: [], bet: 0, cont: 0,
                   folded: false, allin: false, out: false, show: false };
        }),
        // identifiant de table : chaque téléphone y accroche sa cave (cagnotte)
        gameId: 'pk' + Date.now() + '-' + Math.floor(Math.random() * 1e6),
        mode: null,       // choisi par l'hôte : 'cash' | 'tournoi'
        handNum: 0,
        blinds: BLINDS.slice(),
        dealer: -1,
        community: [],
        handOver: true,
        handMsg: '',
        current: -1,
        finished: false,
        winner: -1
      };
    },

    turnOf: function (state) { return state.finished || state.handOver ? -1 : state.current; },
    over: function (state) { return state.finished; },
    scoreOf: function (state, i) { return state.players[i].chips + ' 🪙'; },

    summary: function (state) {
      var rows = state.players.map(function (p) { return { n: p.name, s: p.chips }; })
        .sort(function (a, b) { return b.s - a.s; });
      return rows.map(function (r) {
        return '<div class="final-line"><span>' + GG.esc(r.n) + '</span><strong>' +
          r.s + ' 🪙</strong></div>';
      }).join('') + '<h1>🏆 ' + rows.filter(function (r) { return r.s === rows[0].s; })
        .map(function (r) { return GG.esc(r.n); }).join(' & ') + '</h1>';
    },

    redact: function (state, viewer) {
      var copy = GG.clone(state);
      copy.deck = [];
      copy.players.forEach(function (p, i) {
        if (i !== viewer && !p.show) p.hole = p.hole.map(function () { return -1; });
        delete p.rank;
      });
      return copy;
    },

    /* ---- Cagnotte du téléphone (jamais dans apply : locale à l'appareil) ---- */
    _marker: function (m) {
      try {
        if (m === undefined) return JSON.parse(localStorage.getItem('gg-poker-open') || 'null');
        if (m) localStorage.setItem('gg-poker-open', JSON.stringify(m));
        else localStorage.removeItem('gg-poker-open');
      } catch (e) { return null; }
    },

    /* Règle les comptes du spectateur local : crédite sa pile et libère la table.
       Appelé en fin de partie (render) et quand on quitte en cours (app). */
    cashout: function (state, me) {
      if (!GG.wallet || !state || !state.gameId) return;
      var mk = mod._marker();
      if (!mk || mk.gameId !== state.gameId) return;
      var p = state.players[me];
      GG.wallet.add(p ? p.chips : mk.invested);
      mod._marker(null);
    },

    apply: function (state, player, action) {
      if (state.finished) return { ok: false, error: 'Partie terminée.' };
      if (action.t === 'mode') {
        if (state.mode) return { ok: false, error: 'Mode déjà choisi.' };
        if (player !== 0) return { ok: false, error: 'Seul l’hôte choisit le mode.' };
        if (action.m !== 'cash' && action.m !== 'tournoi') {
          return { ok: false, error: 'Mode inconnu.' };
        }
        state.mode = action.m;
        newHand(state);
        return { ok: true };
      }
      if (!state.mode) return { ok: false, error: 'Le mode n’est pas encore choisi.' };
      if (action.t === 'rebuy') {
        if (state.mode !== 'cash') return { ok: false, error: 'Recave possible en cash game uniquement.' };
        var rp = state.players[player];
        if (rp.chips > 0) return { ok: false, error: 'Vous avez encore des jetons.' };
        if (!state.handOver && rp.hole && rp.hole.length && !rp.folded) {
          return { ok: false, error: 'Recave possible à la fin de la main.' };
        }
        rp.chips = START_CHIPS;
        state.handMsg = GG.esc(rp.name) + ' recave ' + START_CHIPS + ' 🪙.';
        return { ok: true };
      }
      if (action.t === 'next') {
        if (!state.handOver) return { ok: false, error: 'La main n’est pas finie.' };
        newHand(state);
        return { ok: true };
      }
      if (state.handOver) return { ok: false, error: 'Main terminée.' };
      if (player !== state.current) return { ok: false, error: 'Ce n’est pas votre tour.' };
      var p = state.players[player];
      var owe = state.maxBet - p.bet;

      if (action.t === 'fold') {
        p.folded = true;
        state.need[player] = false;
        afterAction(state);
        return { ok: true };
      }
      if (action.t === 'check') {
        if (owe > 0) return { ok: false, error: 'Il faut suivre (' + owe + ') ou se coucher.' };
        state.need[player] = false;
        afterAction(state);
        return { ok: true };
      }
      if (action.t === 'call') {
        if (owe <= 0) return { ok: false, error: 'Rien à suivre : parole.' };
        post(state, player, owe);
        state.need[player] = false;
        afterAction(state);
        return { ok: true };
      }
      if (action.t === 'raise' || action.t === 'allin') {
        var by;
        if (action.t === 'allin') {
          by = p.chips - owe; // tout ce qui dépasse le call
        } else {
          by = action.by | 0;
          if (by < state.minRaise) return { ok: false, error: 'Relance minimale : ' + state.minRaise + '.' };
          if (owe + by > p.chips) return { ok: false, error: 'Pas assez de jetons (utilisez Tapis).' };
        }
        var fullRaise = by >= state.minRaise;
        post(state, player, owe + Math.max(by, 0));
        if (p.bet > state.maxBet) {
          var raised = p.bet - state.maxBet;
          state.maxBet = p.bet;
          // toute augmentation rouvre la parole : chacun doit suivre ou se
          // coucher, même face à un tapis « incomplet » ; seule une VRAIE
          // relance remonte le minimum de sur-relance
          if (fullRaise) state.minRaise = raised;
          state.players.forEach(function (q, i) {
            if (i !== player && canPlay(q) && !q.out && q.bet < state.maxBet) {
              state.need[i] = true;
            }
          });
        }
        state.need[player] = false;
        afterAction(state);
        return { ok: true };
      }
      return { ok: false, error: 'Action inconnue.' };
    },

    render: function (el, ctx) {
      var s = ctx.state;
      var me = ctx.me;
      var my = s.players[me];

      /* Cagnotte : on s'assoit (la cave est débitée une seule fois par table)
         et on encaisse sa pile quand la partie se termine. */
      if (GG.wallet && s.gameId) {
        var mk = mod._marker();
        if (!s.finished && (!mk || mk.gameId !== s.gameId)) {
          if (mk) GG.wallet.add(mk.invested); // vieille table abandonnée : remboursée
          if (GG.wallet.spend(START_CHIPS)) {
            mod._marker({ gameId: s.gameId, invested: START_CHIPS });
          } else {
            mod._marker(null); // partie amicale : rien ne sera encaissé non plus
          }
        } else if (s.finished && mk && mk.gameId === s.gameId) {
          mod.cashout(s, me);
        }
      }

      // choix du mode par l'hôte
      if (!s.mode) {
        var html0 = '<div class="pk-table"><p class="mini-msg big-msg">🃏 Texas Hold’em</p>';
        if (me === 0) {
          html0 += '<p class="mini-msg">Choisissez le mode de jeu :</p>' +
            '<div class="pk-modes">' +
            '<button class="btn big" data-a=\'{"t":"mode","m":"cash"}\'>💵 Cash game' +
            '<small>Blinds fixes 10/20 · recave à volonté</small></button>' +
            '<button class="btn big primary" data-a=\'{"t":"mode","m":"tournoi"}\'>🏆 Tournoi' +
            '<small>Blinds montantes · dernier survivant</small></button>' +
            '</div>';
        } else {
          html0 += '<p class="waiting">⏳ L’hôte choisit le mode de jeu…</p>';
        }
        html0 += '</div>';
        el.innerHTML = html0;
        el.querySelectorAll('[data-a]').forEach(function (b) {
          b.addEventListener('click', function () { ctx.act(JSON.parse(b.dataset.a)); });
        });
        return;
      }

      function cardHtml(c, big) {
        if (c === -1 || c === undefined) return '<span class="pk-card back' + (big ? ' big' : '') + '">🂠</span>';
        var r = RANKS[c >> 2], su = SUITS[c & 3];
        var red = (c & 3) === 1 || (c & 3) === 2;
        return '<span class="pk-card' + (red ? ' red' : '') + (big ? ' big' : '') + '">' +
          r + su + '</span>';
      }

      var html = '<div class="pk-table">';
      html += '<div class="pk-mode">' +
        (s.mode === 'cash'
          ? '💵 Cash game — blinds ' + s.blinds[0] + '/' + s.blinds[1]
          : '🏆 Tournoi — blinds ' + s.blinds[0] + '/' + s.blinds[1] +
            ' <small>(doublent toutes les 6 mains)</small>') +
        '</div>';
      // adversaires
      html += '<div class="pk-players">';
      s.players.forEach(function (p, i) {
        var cls = 'pk-player';
        if (i === s.current && !s.handOver) cls += ' turn';
        if (p.folded && !p.out) cls += ' folded';
        if (p.out) cls += ' out';
        html += '<div class="' + cls + '">' +
          '<div class="pk-pname">' + (i === s.dealer ? 'Ⓓ ' : '') + GG.esc(p.name) +
          (i === me ? ' ✦' : '') + '</div>' +
          '<div class="pk-chips">' + p.chips + ' 🪙' +
          (p.bet ? ' <span class="pk-bet">' + p.bet + '</span>' : '') + '</div>' +
          '<div class="pk-cards">' +
          (p.out ? '—' : p.folded ? '✕' :
            p.hole.map(function (c) { return cardHtml(i === me ? c : (p.show ? c : -1)); }).join('')) +
          '</div>' +
          (p.allin && !p.out ? '<div class="pk-tag">TAPIS</div>' : '') +
          '</div>';
      });
      html += '</div>';
      // tapis central
      html += '<div class="pk-board">' +
        (s.community.length ? s.community.map(function (c) { return cardHtml(c, true); }).join('') :
          '<span class="pk-street">' + (s.handOver ? '' : 'Pré-flop') + '</span>') +
        '</div>' +
        '<div class="pk-pot">Pot : ' + potTotal(s) + ' 🪙</div>';
      if (s.handMsg) html += '<p class="mini-msg">' + s.handMsg + '</p>';
      html += '</div>';

      // mes cartes + actions
      if (!my.out) {
        html += '<div class="pk-mine">' +
          my.hole.map(function (c) { return cardHtml(c, true); }).join('') + '</div>';
      }
      if (my.chips === 0 && s.mode === 'cash' && !my.out) {
        html += '<button class="btn big" data-a=\'{"t":"rebuy"}\'>🪙 Recave (' + START_CHIPS +
          ' de la cagnotte)</button>';
      }
      if (s.handOver && !s.finished) {
        html += '<button class="btn big primary" data-a=\'{"t":"next"}\'>' +
          (s.handNum === 0 ? 'Distribuer' : 'Main suivante') + '</button>';
      } else if (me === s.current && !s.handOver) {
        var owe = s.maxBet - my.bet;
        html += '<div class="pk-actions">';
        html += '<button class="btn action danger" data-a=\'{"t":"fold"}\'>Se coucher</button>';
        if (owe <= 0) {
          html += '<button class="btn action" data-a=\'{"t":"check"}\'>Parole</button>';
        } else {
          html += '<button class="btn action" data-a=\'{"t":"call"}\'>Suivre ' + Math.min(owe, my.chips) + '</button>';
        }
        [s.minRaise, s.minRaise * 2, s.minRaise * 5].forEach(function (by) {
          if (owe + by < my.chips) {
            html += '<button class="btn action" data-a=\'{"t":"raise","by":' + by + '}\'>+' + by + '</button>';
          }
        });
        html += '<button class="btn action primary" data-a=\'{"t":"allin"}\'>Tapis (' + my.chips + ')</button>';
        html += '</div>';
      } else if (!s.handOver && !my.out) {
        html += '<p class="mini-msg">Au tour de ' + GG.esc(s.players[s.current].name) + '…</p>';
      }

      el.innerHTML = html;
      el.querySelectorAll('[data-a]').forEach(function (b) {
        b.addEventListener('click', function () {
          var a = JSON.parse(b.dataset.a);
          // la recave sort de la cagnotte du téléphone AVANT d'être demandée
          if (a.t === 'rebuy' && GG.wallet) {
            if (!GG.wallet.spend(START_CHIPS)) {
              b.textContent = '🪙 Pas assez de jetons — Boutique sur l’accueil';
              b.disabled = true;
              return;
            }
            var mk2 = mod._marker();
            if (mk2 && mk2.gameId === s.gameId) {
              mk2.invested += START_CHIPS;
              mod._marker(mk2);
            }
          }
          ctx.act(a);
        });
      });
    },

    _rank5: rank5, _best7: best7, _cmp: cmpRank // exposés pour les tests
  };

  GG.register(mod);
  if (typeof module === 'object' && module.exports) module.exports = mod;
})(typeof self !== 'undefined' ? self : globalThis);
