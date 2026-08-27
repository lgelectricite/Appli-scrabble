/*
 * GGgames — 8 américain (2 à 5 joueurs, jeu de cartes façon Uno).
 * Recouvrez la carte du dessus par la même couleur ou la même valeur.
 * 8 = joker (choisит sa couleur), Valet = saute, As = change de sens,
 * 2 = le suivant pioche 2 (cumulable). Les mains adverses restent secrètes.
 */
(function (root) {
  'use strict';
  var GG = root.GG;

  var SUITS = ['♠', '♥', '♦', '♣'];
  var RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'V', 'D', 'R', 'A'];

  function newDeck() {
    var d = [];
    SUITS.forEach(function (s) {
      RANKS.forEach(function (r) { d.push({ r: r, s: s }); });
    });
    return GG.shuffle(d);
  }

  function cardValue(c) {
    if (c.r === '8') return 50;
    if (c.r === 'V' || c.r === 'D' || c.r === 'R') return 10;
    if (c.r === 'A') return 1;
    return parseInt(c.r, 10);
  }

  function top(state) { return state.discard[state.discard.length - 1]; }

  function playable(state, c) {
    if (state.pending2 > 0) return c.r === '2';
    if (c.r === '8') return true;
    var t = top(state);
    var suit = state.chosenSuit || t.s;
    return c.s === suit || c.r === t.r;
  }

  /* pioche n cartes pour le joueur i ; retourne le nombre réellement pioché */
  function drawCards(state, i, n) {
    var got = 0;
    for (var k = 0; k < n; k++) {
      if (!state.pile.length) {
        // on rebat la défausse (sauf la carte du dessus)
        if (state.discard.length > 1) {
          var t = state.discard.pop();
          state.pile = GG.shuffle(state.discard);
          state.discard = [t];
        }
      }
      if (!state.pile.length) break;
      state.players[i].hand.push(state.pile.pop());
      got++;
    }
    return got;
  }

  function advance(state, steps) {
    var n = state.players.length;
    state.current = ((state.current + state.dir * steps) % n + n) % n;
    state.hasDrawn = false;
  }

  function deal(state) {
    var n = state.players.length;
    state.pile = newDeck();
    state.discard = [];
    var per = n === 2 ? 7 : 5;
    state.players.forEach(function (p) { p.hand = []; });
    for (var k = 0; k < per; k++) {
      state.players.forEach(function (p) { p.hand.push(state.pile.pop()); });
    }
    // première carte visible : jamais un 8
    var first = state.pile.pop();
    while (first.r === '8') {
      state.pile.unshift(first);
      first = state.pile.pop();
    }
    state.discard.push(first);
    state.chosenSuit = null;
    state.pending2 = 0;
    state.dir = 1;
    state.hasDrawn = false;
    state.finished = false;
    state.winner = -1;
    state.lastMsg = '';
    state.current = (state.manche - 1) % n;
  }

  var mod = {
    id: 'huit',
    nom: '8 américain',
    icone: '🎴',
    desc: 'Le jeu de cartes façon Uno : même couleur ou même valeur, le 8 est joker, le 2 fait piocher. Premier à vider sa main !',
    min: 2, max: 5,
    hotseat: true, hidden: true, netOnly: false,
    regles: '<p><strong>🎯 Le but :</strong> être le premier à vider sa main — et marquer les points des cartes restantes chez les autres.</p><p><strong>Comment jouer :</strong> recouvrez la carte du dessus par une carte de la <strong>même couleur</strong> ou de la <strong>même valeur</strong>. Rien à jouer ? Piochez une carte : jouable, vous pouvez la poser, sinon passez.</p><p><strong>Les cartes spéciales :</strong> le <strong>8</strong> se pose sur tout et choisit la couleur · le <strong>Valet</strong> saute le joueur suivant · l’<strong>As</strong> change le sens · le <strong>2</strong> fait piocher 2 cartes au suivant (et les 2 se cumulent !).</p><p><strong>Les points :</strong> le gagnant de la manche marque la valeur des cartes restantes chez les autres (8 = 50, figures = 10, as = 1). Les manches s’enchaînent.</p>',

    create: function (names) {
      var state = {
        players: names.map(function (n) { return { name: n, hand: [], score: 0 }; }),
        manche: 1
      };
      deal(state);
      return state;
    },

    turnOf: function (state) { return state.finished ? -1 : state.current; },
    viewerOf: function (state) { return state.finished ? 0 : state.current; },
    over: function () { return false; }, // série de manches
    scoreOf: function (state, i) { return state.players[i].score; },

    summary: function (state) {
      var rows = state.players.map(function (p) { return { n: p.name, s: p.score }; })
        .sort(function (a, b) { return b.s - a.s; });
      return rows.map(function (r) {
        return '<div class="final-line"><span>' + GG.esc(r.n) + '</span><strong>' +
          r.s + ' pts</strong></div>';
      }).join('') + '<h1>🏆 ' + rows.filter(function (r) { return r.s === rows[0].s; })
        .map(function (r) { return GG.esc(r.n); }).join(' & ') + '</h1>';
    },

    /* les mains adverses et la pioche ne circulent jamais */
    redact: function (state, viewer) {
      var copy = GG.clone(state);
      copy.players.forEach(function (p, i) {
        p.cards = p.hand.length;
        if (i !== viewer && !state.finished) delete p.hand;
      });
      copy.pileCount = copy.pile.length;
      delete copy.pile;
      copy.discard = copy.discard.slice(-1); // seule la carte du dessus est publique
      return copy;
    },

    apply: function (state, player, action) {
      if (action.t === 'again') {
        if (!state.finished) return { ok: false, error: 'La manche n’est pas finie.' };
        if (player !== 0) return { ok: false, error: 'L’hôte relance une manche.' };
        state.manche++;
        deal(state);
        return { ok: true };
      }
      if (state.finished) return { ok: false, error: 'Manche terminée.' };
      if (player !== state.current) return { ok: false, error: 'Ce n’est pas votre tour.' };
      var p = state.players[player];

      if (action.t === 'play') {
        var idx = action.i | 0;
        var c = p.hand[idx];
        if (!c) return { ok: false, error: 'Carte inconnue.' };
        if (!playable(state, c)) {
          return { ok: false, error: state.pending2 > 0
            ? 'Il faut un 2… ou piocher ' + state.pending2 + ' cartes.'
            : 'Il faut la même couleur ou la même valeur (ou un 8).' };
        }
        if (c.r === '8' && SUITS.indexOf(action.suit) === -1) {
          return { ok: false, error: 'Choisissez la couleur du 8.' };
        }
        p.hand.splice(idx, 1);
        state.discard.push(c);
        state.chosenSuit = c.r === '8' ? action.suit : null;
        state.lastMsg = p.name + ' joue ' + c.r + c.s +
          (c.r === '8' ? ' → ' + action.suit : '');
        if (!p.hand.length) {
          state.finished = true;
          state.winner = player;
          var gain = 0;
          state.players.forEach(function (x, xi) {
            if (xi === player) return;
            x.hand.forEach(function (cc) { gain += cardValue(cc); });
          });
          p.score += gain;
          state.lastGain = gain;
          return { ok: true };
        }
        if (c.r === '2') { state.pending2 += 2; advance(state, 1); return { ok: true }; }
        if (c.r === 'V') { advance(state, 2); return { ok: true }; }
        if (c.r === 'A') {
          state.dir = -state.dir;
          advance(state, state.players.length === 2 ? 0 : 1);
          return { ok: true };
        }
        advance(state, 1);
        return { ok: true };
      }

      if (action.t === 'draw') {
        if (state.pending2 > 0) {
          var got = drawCards(state, player, state.pending2);
          state.lastMsg = p.name + ' pioche ' + got + ' cartes';
          state.pending2 = 0;
          advance(state, 1);
          return { ok: true };
        }
        if (state.hasDrawn) return { ok: false, error: 'Une seule pioche par tour : jouez ou passez.' };
        var got1 = drawCards(state, player, 1);
        state.hasDrawn = true;
        state.lastMsg = p.name + ' pioche';
        if (!got1) { advance(state, 1); } // plus aucune carte disponible : le tour passe
        return { ok: true };
      }

      if (action.t === 'pass') {
        if (!state.hasDrawn && state.pending2 === 0) {
          return { ok: false, error: 'Piochez d’abord une carte.' };
        }
        state.lastMsg = p.name + ' passe';
        advance(state, 1);
        return { ok: true };
      }

      return { ok: false, error: 'Action inconnue.' };
    },

    /* L'adversaire IA : riposte aux 2, pose de préférence dans sa couleur
       la plus fournie, garde ses 8 pour se dépanner et attaque quand un
       voisin est près de sortir. Il ne regarde que sa main, la défausse et
       les tailles de mains — jamais le contenu des mains adverses. */
    bot: function (state, me) {
      if (state.finished) return null;           // l'hôte relance la manche
      if (state.current !== me) return null;
      var main = state.players[me].hand;

      var jouables = [];
      main.forEach(function (c, i) { if (playable(state, c)) jouables.push(i); });

      if (!jouables.length) {
        // rien à poser : on encaisse la pénalité, ou une pioche puis on passe
        if (state.pending2 > 0 || !state.hasDrawn) return { t: 'draw' };
        return { t: 'pass' };
      }

      // taille (publique) de la main du joueur suivant : menace de sortie ?
      var n = state.players.length;
      var suiv = state.players[((me + state.dir) % n + n) % n];
      var menace = (suiv.hand ? suiv.hand.length : suiv.cards) <= 2;

      // on note chaque carte jouable, avec un soupçon de fantaisie
      var meilleur = jouables[0], note = -Infinity;
      jouables.forEach(function (i) {
        var c = main[i], sc = Math.random() * 2;
        if (c.r === '8') {
          sc -= 6; // le joker attend son heure (sauf s'il est seul jouable)
        } else {
          main.forEach(function (x, xi) { // rester dans sa couleur forte
            if (xi !== i && x.r !== '8' && x.s === c.s) sc++;
          });
          sc += cardValue(c) / 12; // évacuer les cartes chères
        }
        if (c.r === '2') sc += menace ? 5 : 1; // faire piocher au bon moment
        if (c.r === 'V') sc += menace ? 4 : 0; // sauter le joueur pressé
        if (sc > note) { note = sc; meilleur = i; }
      });

      var carte = main[meilleur];
      if (carte.r !== '8') return { t: 'play', i: meilleur };

      // couleur annoncée pour le 8 : celle que la main contient le plus
      var cnt = {};
      main.forEach(function (x, xi) {
        if (xi !== meilleur && x.r !== '8') cnt[x.s] = (cnt[x.s] || 0) + 1;
      });
      var couleur = SUITS[Math.floor(Math.random() * SUITS.length)];
      SUITS.forEach(function (su) {
        if ((cnt[su] || 0) > (cnt[couleur] || 0)) couleur = su;
      });
      return { t: 'play', i: meilleur, suit: couleur };
    },

    render: function (el, ctx) {
      var s = ctx.state;
      var me = ctx.me;
      var my = s.players[me];
      var mine = me === s.current && !s.finished;
      var t = s.discard[s.discard.length - 1];

      function cardHtml(c, cls, data) {
        var red = c.s === '♥' || c.s === '♦';
        return '<button class="ha-card' + (red ? ' red' : '') + (cls ? ' ' + cls : '') + '"' +
          (data !== undefined ? ' data-i="' + data + '"' : '') + '>' +
          c.r + '<span>' + c.s + '</span></button>';
      }

      var html = '';
      if (s.finished) {
        html += '<p class="mini-msg big-msg">🏆 ' + GG.esc(s.players[s.winner].name) +
          ' vide sa main et marque ' + (s.lastGain || 0) + ' point' + ((s.lastGain || 0) > 1 ? 's' : '') + ' !</p>';
        html += '<div class="ha-scores">' + s.players.map(function (pl) {
          return '<div class="final-line"><span>' + GG.esc(pl.name) +
            (pl.hand && pl.hand.length ? ' <small>(' + pl.hand.map(function (c) {
              return c.r + c.s;
            }).join(' ') + ')</small>' : '') +
            '</span><strong>' + pl.score + ' pts</strong></div>';
        }).join('') + '</div>';
        if (me === 0) {
          html += '<button class="btn big primary" data-a="again">🔁 Nouvelle manche</button>';
        } else {
          html += '<p class="waiting">L’hôte peut relancer une manche.</p>';
        }
        el.innerHTML = html;
        var ag = el.querySelector('[data-a="again"]');
        if (ag) ag.addEventListener('click', function () { ctx.act({ t: 'again' }); });
        return;
      }

      // adversaires : nombre de cartes
      html += '<div class="ha-opps">' + s.players.map(function (pl, i) {
        if (i === me) return '';
        return '<div class="ha-opp' + (i === s.current ? ' turn' : '') + '">' +
          '<span class="ha-opp-name">' + GG.esc(pl.name) + '</span>' +
          '<span class="ha-opp-count">🂠 ' + (pl.cards !== undefined ? pl.cards : pl.hand.length) + '</span></div>';
      }).join('') + '</div>';

      // centre : défausse + pioche
      html += '<div class="ha-center">' +
        '<div class="ha-top">' + cardHtml(t, 'big') +
        (s.chosenSuit ? '<span class="ha-suit-tag">' + s.chosenSuit + '</span>' : '') + '</div>' +
        '<button class="ha-pile" data-a="draw"' + (mine ? '' : ' disabled') + '>🂠<small>' +
        (s.pileCount !== undefined ? s.pileCount : s.pile.length) + '</small></button>' +
        '</div>';
      if (s.players.length > 2) {
        html += '<p class="ha-dir">' + (s.dir === 1 ? '↻' : '↺') + ' sens du jeu</p>';
      }
      if (s.pending2 > 0) {
        html += '<p class="mini-msg">⚠️ <strong>+' + s.pending2 +
          ' cartes</strong> à piocher… sauf à poser un 2 !</p>';
      }
      html += '<p class="mini-msg">' + (s.lastMsg ? GG.esc(s.lastMsg) + ' — ' : '') +
        (mine ? 'À vous !' : 'Au tour de ' + GG.esc(s.players[s.current].name) + '…') + '</p>';

      // ma main
      var sel8 = el._haSel;
      if (sel8 !== undefined && (!my.hand[sel8] || my.hand[sel8].r !== '8')) {
        sel8 = undefined; el._haSel = undefined;
      }
      html += '<div class="ha-hand">' + my.hand.map(function (c, i) {
        var ok = mine && playable(s, c);
        return cardHtml(c, (ok ? 'ok' : 'off') + (sel8 === i ? ' sel' : ''), i);
      }).join('') + '</div>';
      if (sel8 !== undefined) {
        html += '<p class="mini-msg">Couleur du 8 :</p><div class="ha-suits">' +
          SUITS.map(function (su) {
            return '<button class="ha-suit-btn' +
              (su === '♥' || su === '♦' ? ' red' : '') + '" data-s="' + su + '">' + su + '</button>';
          }).join('') + '</div>';
      }
      if (mine && s.hasDrawn) {
        html += '<div class="mini-actions"><button class="btn big" data-a="pass">➡️ Passer</button></div>';
      }

      el.innerHTML = html;
      var d = el.querySelector('[data-a="draw"]');
      if (d) d.addEventListener('click', function () { ctx.act({ t: 'draw' }); });
      var ps = el.querySelector('[data-a="pass"]');
      if (ps) ps.addEventListener('click', function () { ctx.act({ t: 'pass' }); });
      el.querySelectorAll('.ha-hand .ha-card').forEach(function (b) {
        b.addEventListener('click', function () {
          if (!mine) return; // pas son tour : la main est en lecture seule
          var i = parseInt(b.dataset.i, 10);
          var c = my.hand[i];
          if (!c) return;
          if (c.r === '8') {
            el._haSel = (el._haSel === i) ? undefined : i;
            mod.render(el, ctx);
          } else {
            el._haSel = undefined;
            ctx.act({ t: 'play', i: i });
          }
        });
      });
      el.querySelectorAll('.ha-suit-btn').forEach(function (b) {
        b.addEventListener('click', function () {
          var i = el._haSel;
          el._haSel = undefined;
          ctx.act({ t: 'play', i: i, suit: b.dataset.s });
        });
      });
    },

    _playable: playable, _cardValue: cardValue, _drawCards: drawCards
  };

  GG.register(mod);
  if (typeof module === 'object' && module.exports) module.exports = mod;
})(typeof self !== 'undefined' ? self : globalThis);
