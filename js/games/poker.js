/* GGgames — Poker Texas Hold'em (2 à 4 joueurs, réseau uniquement). */
(function (root) {
  'use strict';
  var GG = root.GG;
  var START_CHIPS = 100;
  var BLINDS = [1, 2];
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

  /* Ce que chacun vient de faire reste affiché sous son siège, et le fil de
     la main garde tout : on ne rate plus une parole ni une relance. */
  function noter(state, idx, badge, phrase) {
    var p = state.players[idx];
    if (p) p.lastAct = badge;
    if (!state.log) state.log = [];
    state.log.push((p ? GG.esc(p.name) + ' ' : '') + phrase);
    if (state.log.length > 80) state.log.shift();
  }

  function noterTable(state, phrase) {
    if (!state.log) state.log = [];
    state.log.push('— ' + phrase + ' —');
    if (state.log.length > 80) state.log.shift();
  }

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
      state.blinds = [1 * Math.pow(2, level), 2 * Math.pow(2, level)];
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
    state.resultat = null;
    state.log = [];
    noterTable(state, 'Main n°' + state.handNum);
    state.players.forEach(function (p) {
      p.lastAct = '';
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
    noter(state, sb, 'Petite blind', 'pose la petite blind (' + state.blinds[0] + ')');
    post(state, bb, state.blinds[1]);
    noter(state, bb, 'Grosse blind', 'pose la grosse blind (' + state.blinds[1] + ')');
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
    state.resultat = {
      gagnants: [winner], pot: pot, sansAbattage: true,
      lignes: [GG.esc(state.players[winner].name) + ' remporte ' + pot + ' 🪙'],
      mains: []
    };
    noterTable(state, GG.esc(state.players[winner].name) + ' rafle le pot (' + pot + ')');
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
    var tousGagnants = [];
    var potInitial = state.players.reduce(function (a, p) { return a + p.cont; }, 0);
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
        if (tousGagnants.indexOf(i) === -1) tousGagnants.push(i);
      });
      msgs.push(winners.map(function (i) { return GG.esc(state.players[i].name); }).join(' & ') +
        ' : ' + pot + ' 🪙 (' + CAT_NAMES[bestR[0]] + ')');
    }
    state.handMsg = msgs.join(' · ');
    state.resultat = {
      gagnants: tousGagnants,
      pot: potInitial,
      sansAbattage: false,
      lignes: msgs,
      mains: contenders.map(function (i) {
        return { i: i, cat: CAT_NAMES[state.players[i].rank[0]] };
      })
    };
    noterTable(state, 'Abattage : ' + msgs.join(' · '));
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
    // les annonces de la rue précédente s'effacent avec les mises
    state.players.forEach(function (p) { p.bet = 0; p.lastAct = ''; });
    state.maxBet = 0;
    state.minRaise = state.blinds[1];
    var playable = state.players.filter(function (p) { return canPlay(p) && !p.out; }).length;
    if (state.street === 'pre') {
      state.community = [state.deck.pop(), state.deck.pop(), state.deck.pop()];
      state.street = 'flop';
      noterTable(state, 'Flop');
    } else if (state.street === 'flop') {
      state.community.push(state.deck.pop());
      state.street = 'turn';
      noterTable(state, 'Turn');
    } else if (state.street === 'turn') {
      state.community.push(state.deck.pop());
      state.street = 'river';
      noterTable(state, 'River');
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
    regles: '<p><strong>🎯 Le but :</strong> gagner les jetons des autres au Texas Hold’em.</p><p><strong>Comment jouer :</strong> 2 cartes secrètes en main, 5 cartes communes au centre : la meilleure main de 5 cartes gagne le pot. Misez, suivez, relancez… ou bluffez et couchez tout le monde !</p><p><strong>Deux modes :</strong> cash game (blinds fixes, recave possible) ou tournoi (blinds montantes, le dernier survivant rafle tout).</p><p><strong>🪙 La cagnotte :</strong> la cave (100) et chaque recave sortent de la cagnotte de votre téléphone ; votre pile y retourne quand vous quittez la table. Recharge automatique chaque semaine.</p><p><strong>♻️ Se recaver :</strong> en cash game, entre deux mains, un bouton remet votre tapis à 100 — que vous soyez à sec ou simplement entamé. On ne peut pas se recaver au milieu d’une main que l’on joue.</p><p><strong>👀 Suivre la partie :</strong> l’annonce de chacun (parole, suivi, relance, tapis) reste affichée sous son siège jusqu’à la rue suivante, et le <strong>déroulé de la main</strong> garde tout. En fin de main, l’abattage montre les cartes de chacun avec le nom de sa combinaison, et le pot s’envole vers le gagnant.</p>',
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
        if (rp.chips >= START_CHIPS) {
          return { ok: false, error: 'Votre tapis est déjà au maximum (' + START_CHIPS + ').' };
        }
        // on peut se recaver (ou compléter son tapis) entre deux mains, ou
        // pendant une main à laquelle on ne participe pas
        if (!state.handOver && rp.hole && rp.hole.length && !rp.folded) {
          return { ok: false, error: 'Recave possible à la fin de la main.' };
        }
        var ajout = START_CHIPS - rp.chips;
        rp.chips = START_CHIPS;
        state.handMsg = GG.esc(rp.name) + ' recave ' + ajout + ' 🪙 (tapis à ' + START_CHIPS + ').';
        noterTable(state, GG.esc(rp.name) + ' recave ' + ajout);
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
        noter(state, player, 'Couché', 'se couche');
        state.need[player] = false;
        afterAction(state);
        return { ok: true };
      }
      if (action.t === 'check') {
        if (owe > 0) return { ok: false, error: 'Il faut suivre (' + owe + ') ou se coucher.' };
        noter(state, player, 'Parole', 'fait parole');
        state.need[player] = false;
        afterAction(state);
        return { ok: true };
      }
      if (action.t === 'call') {
        if (owe <= 0) return { ok: false, error: 'Rien à suivre : parole.' };
        var mis = post(state, player, owe);
        noter(state, player, (p.allin ? 'Tapis ' : 'Suit ') + mis,
          (p.allin ? 'suit à tapis (' + mis + ')' : 'suit ' + mis));
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
        var verse = post(state, player, owe + Math.max(by, 0));
        noter(state, player,
          (p.allin ? 'TAPIS ' : (state.maxBet > 0 ? 'Relance ' : 'Mise ')) + p.bet,
          (p.allin ? 'fait tapis à ' + p.bet
            : (state.maxBet > 0 ? 'relance à ' + p.bet : 'mise ' + p.bet)) +
          ' (' + verse + ' versés)');
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

    /* L'adversaire IA : tiers pré-flop, force réelle post-flop (évaluée avec
       rank5/best7), mises proportionnées au pot, un soupçon de bluff. Il ne
       regarde que ses cartes et le tapis : jamais le deck ni les mains
       adverses. Les écrans d'enchaînement (choix du mode, main suivante)
       restent à l'humain. */
    bot: function (state, me) {
      var p = state.players[me];
      if (state.finished || !state.mode || !p || p.out) return null;
      // cash game : une IA fauchée recave dès que la règle le permet
      // (jetons virtuels : la cagnotte ne concerne que les téléphones)
      if (state.mode === 'cash' && p.chips === 0 &&
          (state.handOver || p.folded || !p.hole || !p.hole.length)) {
        return { t: 'rebuy' };
      }
      if (state.handOver) return null; // « Main suivante » : bouton de l'humain
      if (state.current !== me || p.folded || p.allin) return null;

      var owe = state.maxBet - p.bet;
      var pot = potTotal(state);
      var bb = state.blinds[1];
      var alea = Math.random();

      // relance légale : bornée par la relance minimale et le tapis
      function relance(by) {
        var maxBy = p.chips - owe;
        if (maxBy < state.minRaise) return { t: 'allin' };
        by = Math.max(state.minRaise, Math.min(Math.round(by), maxBy));
        return { t: 'raise', by: by };
      }
      function suivre() { return owe > 0 ? { t: 'call' } : { t: 'check' }; }

      var r1 = p.hole[0] >> 2, r2 = p.hole[1] >> 2;
      var hi = Math.max(r1, r2), lo = Math.min(r1, r2);
      var paire = r1 === r2;
      var assortis = (p.hole[0] & 3) === (p.hole[1] & 3);

      /* ---- pré-flop : jeu par catégories de mains ---- */
      if (!state.community.length) {
        var tier = 0;                                             // poubelle
        if ((paire && hi >= 10) || (hi === 12 && lo === 11)) tier = 3; // QQ+ / AR
        else if ((paire && hi >= 5) || (hi === 12 && lo >= 8) ||
                 (assortis && lo >= 8)) tier = 2;  // 77+, A+figure, hautes assorties
        else if (paire || hi === 12 || lo >= 8 ||
                 (assortis && hi - lo <= 2 && hi >= 5)) tier = 1;  // jouable
        if (state.maxBet <= bb) {
          // pot non relancé : on ouvre avec les bonnes mains, on limpe parfois
          if (tier === 3) return relance(bb * 3);
          if (tier === 2) return alea < 0.6 ? relance(bb * (2 + alea * 2)) : suivre();
          if (tier === 1) return suivre();
          if (owe <= 0) return { t: 'check' };
          return alea < 0.2 ? { t: 'call' } : { t: 'fold' };
        }
        // face à une relance : la poubelle passe, le premium sur-relance
        if (tier === 3) return alea < 0.5 ? relance(pot) : suivre();
        if (tier === 2) {
          if (owe <= Math.max(bb * 6, p.chips * 0.15)) return suivre();
          return alea < 0.35 ? suivre() : { t: 'fold' };
        }
        if (tier === 1 && owe <= bb * 3) return suivre();
        return { t: 'fold' };
      }

      /* ---- post-flop : force réelle de la meilleure combinaison ---- */
      var cartes = p.hole.concat(state.community);
      var meilleur;
      if (cartes.length === 5) meilleur = rank5(cartes);
      else if (cartes.length === 6) {
        meilleur = null;
        for (var x = 0; x < 6; x++) {
          var cinq = cartes.slice(0, x).concat(cartes.slice(x + 1));
          var rx = rank5(cinq);
          if (!meilleur || cmpRank(rx, meilleur) > 0) meilleur = rx;
        }
      } else meilleur = best7(cartes);

      var cat = meilleur[0];
      var boardMax = 0;
      state.community.forEach(function (c) { boardMax = Math.max(boardMax, c >> 2); });
      // la main compte-t-elle vraiment nos cartes, ou juste le tapis ?
      var participe = r1 === meilleur[1] || r2 === meilleur[1];

      var force; // 0..1 : envie de mettre des jetons
      if (cat >= 5) force = 0.95;                              // couleur et mieux
      else if (cat === 4) force = 0.9;                         // suite
      else if (cat === 3) force = participe ? 0.85 : 0.45;     // brelan
      else if (cat === 2) {                                    // deux paires
        force = (participe || r1 === meilleur[2] || r2 === meilleur[2]) ? 0.75 : 0.4;
      } else if (cat === 1) {                                  // paire
        if (!participe) force = 0.3;                           // paire du tapis
        else if (paire && meilleur[1] > boardMax) force = 0.75; // sur-paire
        else if (meilleur[1] === boardMax) force = 0.65;       // top paire
        else force = 0.45;                                     // paire moyenne
      } else {
        force = 0.15;                                          // carte haute
        // tirage couleur (pas à la rivière : là, c'est raté)
        if (state.community.length < 5) {
          var fam = [0, 0, 0, 0];
          cartes.forEach(function (c) { fam[c & 3]++; });
          if (fam[p.hole[0] & 3] === 4 || fam[p.hole[1] & 3] === 4) force = 0.42;
        }
      }
      force += (Math.random() - 0.5) * 0.08; // un brin d'humeur

      if (owe <= 0) {
        // personne n'a misé : mise de valeur, parole, ou bluff rare
        if (force >= 0.7) return relance(pot * (0.5 + alea * 0.4));
        if (force >= 0.45 && alea < 0.3) return relance(pot * 0.4);
        if (force < 0.3 && alea < 0.08 && p.chips > bb * 4) return relance(pot * 0.5);
        return { t: 'check' };
      }
      // face à une mise : on paie selon la force et le prix demandé
      var cote = owe / (pot + owe);
      if (force >= 0.78) return alea < 0.5 ? relance(pot * 0.7) : { t: 'call' };
      if (force >= 0.55) {
        if (cote <= 0.35 || owe <= bb * 3) return { t: 'call' };
        return alea < 0.3 ? { t: 'call' } : { t: 'fold' };
      }
      if (force >= 0.38 && cote <= 0.22) return { t: 'call' };  // tirages
      if (owe <= bb && alea < 0.3) return { t: 'call' };        // défense à bas prix
      return { t: 'fold' };
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
            '<small>Blinds fixes 1/2 · recave à volonté</small></button>' +
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

      /* de vraies cartes à jouer (js/games/cartes.js) */
      function cardHtml(c, taille, classe) {
        var o = { taille: taille || '', classe: classe || '' };
        if (c === -1 || c === undefined) return GG.carteDos(o);
        return GG.carte(c >> 2, c & 3, o);
      }

      /* ===== la table ovale vue de dessus : chacun assis à sa place =====
         Les sièges tournent pour que le joueur qui regarde soit toujours
         assis EN BAS, comme dans les vraies applications de poker. */
      var n = s.players.length;
      var POS = ({
        2: ['sb', 'st'],
        3: ['sb', 'stl', 'str'],
        4: ['sb', 'sl', 'st', 'sr']
      })[n] || ['sb', 'sl', 'st', 'sr'];

      var html = '<div class="pk-mode">' +
        (s.mode === 'cash'
          ? '💵 Cash game — blinds ' + s.blinds[0] + '/' + s.blinds[1]
          : '🏆 Tournoi — blinds ' + s.blinds[0] + '/' + s.blinds[1] +
            ' <small>(doublent toutes les 6 mains)</small>') +
        '</div>';
      html += '<div class="pk-oval">';
      // le centre : le pot, puis les cartes communes
      html += '<div class="pk-center">' +
        '<div class="pk-pot">Pot : <b>' + potTotal(s) + '</b> 🪙</div>' +
        '<div class="pk-community">' +
        (s.community.length
          ? s.community.map(function (c) { return cardHtml(c, 'grande'); }).join('')
          : '<span class="pk-street">' + (s.handOver ? '· · ·' : 'Pré-flop') + '</span>') +
        '</div></div>';
      s.players.forEach(function (p, i) {
        var pos = POS[(i - me + n) % n];
        var cls = 'pk-seat ' + pos;
        if (i === s.current && !s.handOver) cls += ' turn';
        if (p.folded && !p.out) cls += ' folded';
        if (p.out) cls += ' out';
        if (gagnant && s.handOver) cls += ' gagne';
        var gagnant = s.resultat && s.resultat.gagnants.indexOf(i) !== -1;
        var cartes = (p.out || p.folded) ? '' :
          p.hole.map(function (c) {
            return cardHtml(i === me ? c : (p.show ? c : -1),
              i === me ? '' : 'mini', gagnant && s.handOver ? 'gagnante' : '');
          }).join('');
        var robot = p.name.indexOf('🤖') === 0;
        var nom = p.name.replace(/^🤖 /, '');
        html += '<div class="' + cls + '">' +
          '<div class="pk-scards' + (i === me ? ' mine' : '') + '">' + cartes + '</div>' +
          '<div class="pk-plate">' +
          '<span class="pk-avatar">' + (robot ? '🤖' : GG.esc(nom.charAt(0).toUpperCase())) + '</span>' +
          '<span class="pk-pinfo"><span class="pk-pname">' + GG.esc(nom) + '</span>' +
          '<span class="pk-pstack">' + (p.out ? 'éliminé' : p.chips + ' 🪙') + '</span></span>' +
          '</div>' +
          (p.allin && !p.out ? '<span class="pk-tag">TAPIS</span>' :
            (p.folded && !p.out ? '<span class="pk-tag grey">couché</span>' : '')) +
          (p.lastAct && !s.handOver
            ? '<span class="pk-annonce">' + GG.esc(p.lastAct) + '</span>' : '') +
          (gagnant && s.handOver ? '<span class="pk-trophee">🏆</span>' : '') +
          '</div>';
        // la mise de la rue en jetons devant le siège, et le bouton du donneur
        if (!p.out && (p.bet > 0 || i === s.dealer)) {
          html += '<div class="pk-betspot ' + pos + '">' +
            (p.bet > 0 ? '<span class="pk-chip"></span><span class="pk-betamt">' +
              p.bet + '</span>' : '') +
            (i === s.dealer ? '<span class="pk-dbtn">D</span>' : '') + '</div>';
        }
      });
      html += '</div>';
      // fin de main : un vrai panneau d'abattage, qui reste à l'écran
      if (s.handOver && s.resultat) {
        var r = s.resultat;
        html += '<div class="pk-fin">';
        html += '<div class="pk-fin-titre">' +
          (r.sansAbattage ? '🏆 ' + r.lignes.join(' · ')
            : '🏆 ' + r.lignes.join('<br>')) + '</div>';
        if (r.mains && r.mains.length) {
          html += '<div class="pk-abat">';
          r.mains.forEach(function (m) {
            var pj = s.players[m.i];
            var win = r.gagnants.indexOf(m.i) !== -1;
            html += '<div class="pk-abat-l' + (win ? ' win' : '') + '">' +
              '<span class="pk-abat-n">' + (win ? '🏆 ' : '') + GG.esc(pj.name) + '</span>' +
              '<span class="pk-abat-c">' +
              (pj.hole || []).map(function (c) { return cardHtml(c, 'mini'); }).join('') +
              '</span><span class="pk-abat-m">' + m.cat + '</span></div>';
          });
          html += '</div>';
        }
        html += '</div>';
      } else if (s.handMsg) {
        html += '<p class="mini-msg pk-msg">' + s.handMsg + '</p>';
      }

      var peutRecaver = s.mode === 'cash' && !my.out && my.chips < START_CHIPS &&
        (s.handOver || my.folded || !my.hole || !my.hole.length);
      if (peutRecaver) {
        html += '<button class="btn big" data-a=\'{"t":"rebuy"}\'>🪙 ' +
          (my.chips === 0 ? 'Recaver' : 'Compléter mon tapis') + ' — ' +
          (START_CHIPS - my.chips) + ' de la cagnotte</button>';
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
        html += '<button class="btn action primary" data-a=\'{"t":"allin"}\'>Tapis (' + my.chips + ')</button>';
        html += '</div>';

        /* Choisir SON montant : on raisonne comme à une vraie table, en
           « relancer à N » (le total posé sur la rue), pas en « +N ». */
        var miseMin = s.maxBet + s.minRaise;      // relance minimale légale
        var miseMax = my.bet + my.chips;          // tapis
        if (miseMax > miseMin) {
          var potMtn = potTotal(s);
          var depart = Math.min(miseMax, Math.max(miseMin, s.maxBet + Math.max(s.minRaise, Math.round(potMtn / 2))));
          html += '<div class="pk-raise" data-min="' + miseMin + '" data-max="' + miseMax + '">' +
            '<div class="pk-raise-head">' +
            '<button class="pk-adj" data-adj="-1">−</button>' +
            '<div class="pk-raise-val">Relancer à <b id="pk-mise">' + depart + '</b> 🪙</div>' +
            '<button class="pk-adj" data-adj="1">+</button>' +
            '</div>' +
            '<input type="range" id="pk-slider" min="' + miseMin + '" max="' + miseMax +
            '" step="1" value="' + depart + '">' +
            '<div class="pk-raise-quick">' +
            '<button class="pk-quick" data-set="' + miseMin + '">Min ' + miseMin + '</button>' +
            (s.maxBet + Math.round(potMtn / 2) > miseMin &&
             s.maxBet + Math.round(potMtn / 2) < miseMax
              ? '<button class="pk-quick" data-set="' + (s.maxBet + Math.round(potMtn / 2)) + '">½ pot</button>' : '') +
            (s.maxBet + potMtn > miseMin && s.maxBet + potMtn < miseMax
              ? '<button class="pk-quick" data-set="' + (s.maxBet + potMtn) + '">Pot</button>' : '') +
            '<button class="pk-quick" data-set="' + miseMax + '">Tapis ' + miseMax + '</button>' +
            '</div>' +
            '<button class="btn action primary pk-raise-go" id="pk-raise-go">Relancer à ' +
            '<b>' + depart + '</b> 🪙</button>' +
            '</div>';
        }
      } else if (!s.handOver && !my.out) {
        html += '<p class="mini-msg">Au tour de ' + GG.esc(s.players[s.current].name) + '…</p>';
      }

      // le fil de la main : plus rien ne passe inaperçu
      if (s.log && s.log.length) {
        html += '<details class="pk-fil"' + (s.handOver ? ' open' : '') + '>' +
          '<summary>📜 Déroulé de la main <b>' +
          GG.esc(s.log[s.log.length - 1].replace(/^— | —$/g, '')) + '</b></summary>' +
          '<div class="pk-fil-l">' +
          s.log.slice(-14).map(function (l) {
            return '<div' + (/^—/.test(l) ? ' class="rue"' : '') + '>' + l + '</div>';
          }).join('') + '</div></details>';
      }

      el.innerHTML = html;

      /* Le pot s'envole vers le gagnant — une seule fois par main. */
      if (s.handOver && s.resultat && s.resultat.gagnants.length) {
        var cleMain = s.gameId + ':' + s.handNum;
        if (el._pkAnim !== cleMain) {
          el._pkAnim = cleMain;
          var oval = el.querySelector('.pk-oval');
          if (oval) {
            s.resultat.gagnants.forEach(function (gi) {
              var vers = POS[(gi - me + n) % n];
              for (var k = 0; k < 5; k++) {
                var jeton = document.createElement('span');
                jeton.className = 'pk-vol vers-' + vers;
                jeton.style.animationDelay = (k * 90) + 'ms';
                oval.appendChild(jeton);
              }
            });
            setTimeout(function () {
              oval.querySelectorAll('.pk-vol').forEach(function (j) { j.remove(); });
            }, 1600);
          }
        }
      } else if (!s.handOver) {
        el._pkAnim = null;
      }

      /* Le curseur de relance : on ajuste librement, puis on valide. */
      var zone = el.querySelector('.pk-raise');
      if (zone) {
        var slider = el.querySelector('#pk-slider');
        var etiq = el.querySelector('#pk-mise');
        var valider = el.querySelector('#pk-raise-go');
        var mn = parseInt(zone.dataset.min, 10);
        var mx = parseInt(zone.dataset.max, 10);
        var poser = function (v) {
          v = Math.max(mn, Math.min(mx, Math.round(v) || mn));
          slider.value = v;
          etiq.textContent = v;
          valider.querySelector('b').textContent = v;
        };
        slider.addEventListener('input', function () { poser(+slider.value); });
        el.querySelectorAll('.pk-adj').forEach(function (b) {
          b.addEventListener('click', function () {
            poser(+slider.value + parseInt(b.dataset.adj, 10));
          });
        });
        el.querySelectorAll('.pk-quick').forEach(function (b) {
          b.addEventListener('click', function () { poser(parseInt(b.dataset.set, 10)); });
        });
        valider.addEventListener('click', function () {
          var cible = Math.max(mn, Math.min(mx, +slider.value));
          // aller jusqu'au tapis, c'est un tapis : le jeu le sait mieux que nous
          ctx.act(cible >= mx ? { t: 'allin' } : { t: 'raise', by: cible - s.maxBet });
        });
      }

      el.querySelectorAll('[data-a]').forEach(function (b) {
        b.addEventListener('click', function () {
          var a = JSON.parse(b.dataset.a);
          // la recave sort de la cagnotte du téléphone AVANT d'être demandée,
          // et on ne prend que ce qui manque pour revenir au tapis complet
          if (a.t === 'rebuy' && GG.wallet) {
            var manque = START_CHIPS - my.chips;
            if (manque <= 0) return;
            if (!GG.wallet.spend(manque)) {
              b.textContent = '🪙 Pas assez de jetons — Boutique sur l’accueil';
              b.disabled = true;
              return;
            }
            var mk2 = mod._marker();
            if (mk2 && mk2.gameId === s.gameId) {
              mk2.invested += manque;
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
