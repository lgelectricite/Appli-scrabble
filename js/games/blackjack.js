(function (root) {
  'use strict';
  var GG = root.GG;

  var MISES = [1, 5, 25, 100, 500];
  var RANGS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'V', 'D', 'R'];
  var SYMBOLES = ['♠', '♥', '♦', '♣'];

  function nouveauSabot() {
    var cartes = [], d, c;
    for (d = 0; d < 6; d++) for (c = 0; c < 52; c++) cartes.push(c);
    return GG.shuffle(cartes);
  }

  function valeurMain(main) {
    var total = 0, as = 0, i, r;
    for (i = 0; i < main.length; i++) {
      if (main[i] < 0) continue;
      r = main[i] % 13;
      if (r === 0) { as++; total += 1; }
      else if (r >= 9) total += 10;
      else total += r + 1;
    }
    var souple = false;
    if (as > 0 && total + 10 <= 21) { total += 10; souple = true; }
    return { total: total, souple: souple };
  }

  function estBlackjack(main) {
    return main.length === 2 && valeurMain(main).total === 21;
  }

  function tire(s, main) {
    if (!s.shoe.length) s.shoe = nouveauSabot();
    main.push(s.shoe.pop());
  }

  function tousOntChoisi(s) {
    var i;
    for (i = 0; i < s.players.length; i++) {
      if (s.players[i].bet <= 0 && !s.players[i].sit) return false;
    }
    return true;
  }

  function prochainTour(s, depuis) {
    var i, p;
    for (i = depuis; i < s.players.length; i++) {
      p = s.players[i];
      if (p.bet > 0 && !p.done) return i;
    }
    return -1;
  }

  function resoudre(s) {
    var bjCroupier = estBlackjack(s.dealer);
    var vc = valeurMain(s.dealer).total;
    var i, p, v;
    for (i = 0; i < s.players.length; i++) {
      p = s.players[i];
      if (p.bet <= 0) { p.outcome = 'sit'; p.net = 0; continue; }
      function juge(main, mise, naturelPossible) {
        var v2 = valeurMain(main).total;
        if (naturelPossible && estBlackjack(main)) {
          return bjCroupier ? { o: 'push', n: 0 } : { o: 'bj', n: Math.floor(mise * 1.5) };
        }
        if (v2 > 21) return { o: 'lose', n: -mise };
        if (bjCroupier) return { o: 'lose', n: -mise };
        if (vc > 21 || v2 > vc) return { o: 'win', n: mise };
        if (v2 === vc) return { o: 'push', n: 0 };
        return { o: 'lose', n: -mise };
      }
      var j1 = juge(p.hand, p.bet, !p.split);
      p.outcome = j1.o; p.net = j1.n;
      if (p.split) {
        var j2 = juge(p.hand2, p.bet2, false);
        p.outcome2 = j2.o; p.net2 = j2.n;
      }
      p.total += p.net + (p.split ? p.net2 : 0);
    }
    s.turn = -1;
    s.phase = 'result';
  }

  function finDesJoueurs(s) {
    var i, p, besoin = false;
    for (i = 0; i < s.players.length; i++) {
      p = s.players[i];
      if (p.bet <= 0) continue;
      if ((!p.split && !estBlackjack(p.hand) && valeurMain(p.hand).total <= 21) ||
          (p.split && (valeurMain(p.hand).total <= 21 || valeurMain(p.hand2).total <= 21))) besoin = true;
    }
    if (besoin) while (valeurMain(s.dealer).total < 17) tire(s, s.dealer);
    resoudre(s);
  }

  function distribuer(s) {
    var i, p, quelquun = false;
    for (i = 0; i < s.players.length; i++) if (s.players[i].bet > 0) quelquun = true;
    if (!quelquun) {
      for (i = 0; i < s.players.length; i++) { s.players[i].outcome = 'sit'; s.players[i].net = 0; }
      s.turn = -1;
      s.phase = 'result';
      return;
    }
    if (s.shoe.length < 60) s.shoe = nouveauSabot();
    for (i = 0; i < s.players.length; i++) {
      p = s.players[i];
      if (p.bet > 0) { tire(s, p.hand); tire(s, p.hand); }
    }
    tire(s, s.dealer);
    tire(s, s.dealer);
    for (i = 0; i < s.players.length; i++) {
      p = s.players[i];
      if (p.bet > 0 && estBlackjack(p.hand)) p.done = true;
    }
    if (estBlackjack(s.dealer)) { resoudre(s); return; }
    s.phase = 'play';
    s.turn = prochainTour(s, 0);
    if (s.turn === -1) finDesJoueurs(s);
  }

  function avance(s) {
    s.turn = prochainTour(s, s.turn + 1);
    if (s.turn === -1) finDesJoueurs(s);
  }

  function mainActive(p) { return p.hi === 1 ? p.hand2 : p.hand; }

  /* La main active est finie : au split, on enchaîne la seconde main,
     sinon le joueur a terminé et le tour avance. */
  function finMain(s, p) {
    if (p.split && p.hi === 0) {
      p.hi = 1;
      if (valeurMain(p.hand2).total >= 21) finMain(s, p);
    } else {
      p.done = true;
      avance(s);
    }
  }

  function signe(n) { return (n > 0 ? '+' + n : '' + n); }

  /* Jetons de casino : couleurs classiques par valeur. */
  var CHIP_STYLE = {
    1: { c: '#ece1c4', t: '#2c2218' },
    5: { c: '#bb3b2c', t: '#fff6ea' },
    25: { c: '#1e7a4c', t: '#fff6ea' },
    100: { c: '#2c2c33', t: '#fff6ea' },
    500: { c: '#6a3d8f', t: '#fff6ea' }
  };

  function chipHtml(v, mini, attrs) {
    var st = CHIP_STYLE[v] || CHIP_STYLE[5];
    return '<span class="bj-chip' + (mini ? ' mini' : '') + '" style="--c:' + st.c +
      ';--ct:' + st.t + '"' + (attrs || '') + '><b>' + v + '</b></span>';
  }

  /* Décompose une mise en une petite pile de jetons réalistes. */
  function chipStack(amount) {
    var vals = [500, 100, 25, 5, 1];
    var out = [], i, rest = amount;
    for (i = 0; i < vals.length && out.length < 5; i++) {
      while (rest >= vals[i] && out.length < 5) { out.push(vals[i]); rest -= vals[i]; }
    }
    var html = '<span class="bj-stack">';
    for (i = 0; i < out.length; i++) html += chipHtml(out[i], true);
    return html + '</span>';
  }

  function carteHTML(c) {
    if (c < 0) return '<span class="bj-card bj-dos"></span>';
    var coul = Math.floor(c / 13);
    return '<span class="bj-card' + (coul === 1 || coul === 2 ? ' red' : '') + '">' +
      '<span class="bj-rg">' + RANGS[c % 13] + '</span>' +
      '<span class="bj-sy">' + SYMBOLES[coul] + '</span></span>';
  }

  function mainHTML(main) {
    var h = '', i;
    for (i = 0; i < main.length; i++) h += carteHTML(main[i]);
    return h;
  }

  var mod = {
    id: 'blackjack',
    nom: 'Blackjack',
    icone: '♠️',
    desc: 'Défiez le croupier : approchez 21 sans le dépasser et repartez avec les jetons !',
    regles: '<p><strong>🎯 Le but :</strong> battre le croupier en vous approchant de 21 sans jamais le dépasser.</p>' +
      '<p><strong>Comment jouer :</strong> misez vos jetons (de 1 à 500), recevez deux cartes, puis à votre tour : tirez, restez, ou doublez (uniquement avec deux cartes : mise doublée, une seule carte de plus). L\'as vaut 1 ou 11.</p>' +
      '<p><strong>Le croupier :</strong> il révèle sa carte cachée après vous et tire jusqu\'à 17 — il reste sur tous les 17.</p>' +
      '<p><strong>Séparer (split) :</strong> deux cartes de même valeur ? Séparez-les en deux mains, chacune avec sa mise — les as séparés ne reçoivent qu\'une carte chacun.</p>' +
      '<p><strong>Les gains :</strong> victoire 1 pour 1, blackjack naturel 3 pour 2, égalité : mise rendue.</p>',
    min: 1,
    max: 4,
    hotseat: true,
    hotseatMax: 1,
    hidden: false,
    netOnly: false,

    create: function (names) {
      var players = [], i;
      for (i = 0; i < names.length; i++) {
        players.push({ name: names[i], bet: 0, hand: [], done: false, doubled: false, sit: false, outcome: null, net: 0, total: 0, split: false, hand2: [], bet2: 0, doubled2: false, hi: 0, outcome2: null, net2: 0 });
      }
      return {
        round: 1,
        phase: 'bet',
        turn: -1,
        shoe: nouveauSabot(),
        shoeCount: 312,
        dealer: [],
        players: players,
        finished: false,
        startTs: Date.now()
      };
    },

    turnOf: function (state) {
      return state.phase === 'play' ? state.turn : -1;
    },

    over: function (state) {
      return !!state.finished;
    },

    scoreOf: function (state, i) {
      return signe(state.players[i].total);
    },

    summary: function (state) {
      var ps = state.players, i, best = -Infinity;
      for (i = 0; i < ps.length; i++) if (ps[i].total > best) best = ps[i].total;
      var gagnants = [];
      for (i = 0; i < ps.length; i++) if (ps[i].total === best) gagnants.push(GG.esc(ps[i].name));
      var html = '<h1>🏆 ' + gagnants.join(' & ') + '</h1>';
      var ordre = [];
      for (i = 0; i < ps.length; i++) ordre.push(i);
      ordre.sort(function (a, b) { return ps[b].total - ps[a].total; });
      for (i = 0; i < ordre.length; i++) {
        var p = ps[ordre[i]];
        html += '<div class="final-line"><span>' + GG.esc(p.name) + '</span><strong>' + signe(p.total) + ' 🪙</strong></div>';
      }
      html += '<p class="hint">' + state.round + (state.round > 1 ? ' manches jouées' : ' manche jouée') + ' face au croupier.</p>';
      return html;
    },

    redact: function (state, viewer) {
      var r = GG.clone(state);
      r.shoeCount = state.shoe ? state.shoe.length : 0;
      delete r.shoe;
      if (r.phase !== 'result' && r.dealer && r.dealer.length > 1) r.dealer[1] = -1;
      return r;
    },

    /* On quitte la table en pleine manche : la mise engagée (déjà débitée
       localement) retourne dans la cagnotte du téléphone. En phase résultat,
       le paiement a déjà été fait par le rendu — rien à rendre. */
    cashout: function (state, me) {
      if (!GG.wallet || !state || !state.players || !state.players[me]) return;
      var p = state.players[me];
      if (state.phase !== 'result' && !state.finished && p.bet > 0) {
        GG.wallet.add(p.bet + (p.split ? p.bet2 : 0));
      }
    },

    apply: function (state, player, action) {
      if (!action || typeof action.t !== 'string') return { ok: false, error: 'Action invalide.' };
      if (state.finished) return { ok: false, error: 'La partie est terminée.' };
      var p = state.players[player];
      if (!p) return { ok: false, error: 'Joueur inconnu.' };
      var t = action.t;

      if (t === 'bet') {
        if (state.phase !== 'bet') return { ok: false, error: 'Les mises sont closes.' };
        if (p.bet > 0 || p.sit) return { ok: false, error: 'Vous avez déjà fait votre choix.' };
        if (MISES.indexOf(action.v) === -1) return { ok: false, error: 'Mise invalide.' };
        p.bet = action.v;
        if (tousOntChoisi(state)) distribuer(state);
        return { ok: true };
      }

      if (t === 'sit') {
        if (state.phase !== 'bet') return { ok: false, error: 'Les mises sont closes.' };
        if (p.bet > 0 || p.sit) return { ok: false, error: 'Vous avez déjà fait votre choix.' };
        p.sit = true;
        if (tousOntChoisi(state)) distribuer(state);
        return { ok: true };
      }

      if (t === 'hit' || t === 'stand' || t === 'double' || t === 'split') {
        if (state.phase !== 'play') return { ok: false, error: 'Ce n\'est pas le moment de jouer.' };
        if (state.turn !== player) return { ok: false, error: 'Ce n\'est pas votre tour.' };
        var m = mainActive(p);
        if (t === 'hit') {
          tire(state, m);
          if (valeurMain(m).total >= 21) finMain(state, p);
          return { ok: true };
        }
        if (t === 'stand') {
          finMain(state, p);
          return { ok: true };
        }
        if (t === 'split') {
          if (p.split) return { ok: false, error: 'Une seule paire séparée par manche.' };
          if (p.hand.length !== 2 || (p.hand[0] % 13) !== (p.hand[1] % 13)) {
            return { ok: false, error: 'Il faut deux cartes de même valeur pour séparer.' };
          }
          p.split = true;
          p.hand2 = [p.hand.pop()];
          p.bet2 = p.bet;
          tire(state, p.hand);
          tire(state, p.hand2);
          if ((p.hand2[0] % 13) === 0) {
            // paire d'as séparée : une seule carte par main, mains terminées
            p.done = true;
            avance(state);
          } else {
            p.hi = 0;
            if (valeurMain(p.hand).total >= 21) finMain(state, p);
          }
          return { ok: true };
        }
        var deja = p.hi === 1 ? p.doubled2 : p.doubled;
        if (m.length !== 2 || deja) return { ok: false, error: 'On ne peut doubler qu\'avec ses deux premières cartes.' };
        if (p.hi === 1) { p.bet2 = p.bet2 * 2; p.doubled2 = true; }
        else { p.bet = p.bet * 2; p.doubled = true; }
        tire(state, m);
        finMain(state, p);
        return { ok: true };
      }

      if (t === 'again') {
        if (state.phase !== 'result') return { ok: false, error: 'La manche n\'est pas terminée.' };
        if (player !== 0) return { ok: false, error: 'Seul l\'hôte peut lancer la manche suivante.' };
        state.round++;
        state.phase = 'bet';
        state.turn = -1;
        state.dealer = [];
        var i, q;
        for (i = 0; i < state.players.length; i++) {
          q = state.players[i];
          q.bet = 0; q.hand = []; q.done = false; q.doubled = false; q.sit = false; q.outcome = null; q.net = 0; q.split = false; q.hand2 = []; q.bet2 = 0; q.doubled2 = false; q.hi = 0; q.outcome2 = null; q.net2 = 0;
        }
        return { ok: true };
      }

      if (t === 'end') {
        if (state.phase !== 'result') return { ok: false, error: 'La manche n\'est pas terminée.' };
        if (player !== 0) return { ok: false, error: 'Seul l\'hôte peut terminer la partie.' };
        state.finished = true;
        return { ok: true };
      }

      return { ok: false, error: 'Action inconnue.' };
    },

    render: function (el, ctx) {
      var s = ctx.state;
      var me = ctx.me;
      var moi = (me >= 0 && s.players[me]) ? s.players[me] : null;
      var i, p;

      // clé unique par partie ET par manche : aucun risque de collision quand
      // le même écran est réutilisé après « Rejouer »
      var rondCle = s.startTs + ':' + s.round;

      // Paiement local de MA cagnotte, une seule fois par manche (la mise a déjà été débitée)
      if (s.phase === 'result' && moi && el._bjPaid !== rondCle) {
        el._bjPaid = rondCle;
        if (GG.wallet && moi.bet > 0) {
          function retourDe(o, mise) {
            if (o === 'bj') return mise + Math.floor(mise * 1.5);
            if (o === 'win') return mise * 2;
            if (o === 'push') return mise;
            return 0;
          }
          var retour = retourDe(moi.outcome, moi.bet) +
            (moi.split ? retourDe(moi.outcome2, moi.bet2) : 0);
          if (retour > 0) GG.wallet.add(retour);
        }
      }

      /* ===== la table de casino ===== */
      var vc = valeurMain(s.dealer);
      var cache = false;
      for (i = 0; i < s.dealer.length; i++) if (s.dealer[i] < 0) cache = true;

      var html = '<div class="bj-rim"><div class="bj-felt">';

      // coins hauts du tapis : n° de manche et sabot
      html += '<div class="bj-head"><span>Manche ' + s.round + '</span>' +
        '<span class="bj-shoe">🂠 ' + (s.shoeCount || 0) + '</span></div>';

      // le croupier, en haut de table
      html += '<div class="bj-dealer"><div class="bj-deal-lbl">— CROUPIER —</div>';
      if (s.dealer.length) {
        html += '<div class="bj-cartes">' + mainHTML(s.dealer) + '</div>';
        if (cache) html += '<div class="bj-total">' + vc.total + ' + ?</div>';
        else html += '<div class="bj-total">' + vc.total +
          (s.phase === 'result' && estBlackjack(s.dealer) ? ' — Blackjack !' : (vc.total > 21 ? ' — il saute !' : '')) + '</div>';
      } else if (s.phase === 'result') {
        html += '<div class="bj-cartes"><span class="bj-vide">Personne n’a misé cette manche.</span></div>';
      } else {
        html += '<div class="bj-cartes"><span class="bj-vide">Faites vos jeux…</span></div>';
      }
      html += '</div>';

      // l'inscription en arc, comme sur les vrais tapis
      html += '<svg class="bj-arc" viewBox="0 0 320 54" aria-hidden="true">' +
        '<defs><path id="bj-arc-p" d="M 14 46 A 400 400 0 0 1 306 46"/></defs>' +
        '<text><textPath href="#bj-arc-p" startOffset="50%" text-anchor="middle">' +
        'BLACKJACK PAIE 3 CONTRE 2</textPath></text></svg>' +
        '<div class="bj-rule">Le croupier reste sur tous les 17 · l’as vaut 1 ou 11</div>';

      // les autres joueurs, posés sur le tapis
      var autres = '';
      for (i = 0; i < s.players.length; i++) {
        if (i === me) continue;
        p = s.players[i];
        var st;
        if (s.phase === 'bet') st = p.sit ? 'passe' : (p.bet > 0 ? p.bet + ' 🪙' : 'mise…');
        else if (p.bet <= 0) st = 'passe';
        else if (s.phase === 'play') {
          var vt = valeurMain(p.hand).total;
          st = p.bet + ' 🪙 · ' + vt + (vt > 21 ? ' 💥' : '');
        } else {
          if (p.outcome === 'bj') st = 'Blackjack ! +' + p.net;
          else if (p.outcome === 'win') st = '+' + p.net + ' 🪙';
          else if (p.outcome === 'push') st = 'égalité';
          else if (p.outcome === 'lose') st = p.net + ' 🪙';
          else st = 'a passé';
        }
        // une vraie place à la table : mini-cartes, plaque avatar + nom + état
        var minis = '';
        if (s.phase !== 'bet' && p.bet > 0 && p.hand.length) {
          minis = '<span class="bj-ocartes">' + p.hand.map(function () {
            return '<span class="bj-mini"></span>';
          }).join('') + '</span>';
        }
        var robot2 = p.name.indexOf('🤖') === 0;
        var nom2 = p.name.replace(/^🤖 /, '');
        autres += '<div class="bj-oplr' + (s.phase === 'play' && s.turn === i ? ' turn' : '') + '">' +
          minis +
          '<span class="pk-plate"><span class="pk-avatar">' +
          (robot2 ? '🤖' : GG.esc(nom2.charAt(0).toUpperCase())) + '</span>' +
          '<span class="pk-pinfo"><span class="pk-pname">' + GG.esc(nom2) + '</span>' +
          '<span class="pk-pstack">' + st + '</span></span></span></div>';
      }
      if (autres) html += '<div class="bj-autres">' + autres + '</div>';

      // ma place : mes cartes au-dessus du rond de mise
      html += '<div class="bj-me-zone">';
      if (!moi) {
        html += '<p class="bj-vide">Vous regardez la partie…</p>';
      } else if (s.phase !== 'bet' && moi.bet > 0) {
        if (moi.split) {
          // deux mains côte à côte, la main en cours est soulignée
          html += '<div class="bj-mains2">';
          [0, 1].forEach(function (h2) {
            var mn = h2 === 1 ? moi.hand2 : moi.hand;
            var vh = valeurMain(mn);
            var actv = s.phase === 'play' && s.turn === me && moi.hi === h2;
            html += '<div class="bj-main2' + (actv ? ' actv' : '') + '">' +
              '<div class="bj-cartes bj-cartes-moi">' + mainHTML(mn) + '</div>' +
              '<div class="bj-total-moi">' + vh.total + (vh.souple ? ' s' : '') +
              (vh.total > 21 ? ' 💥' : '') + '</div></div>';
          });
          html += '</div>';
        } else {
          var vm = valeurMain(moi.hand);
          html += '<div class="bj-cartes bj-cartes-moi">' + mainHTML(moi.hand) + '</div>';
          html += '<div class="bj-total-moi">' + vm.total + (vm.souple ? ' (souple)' : '') +
            (vm.total > 21 ? ' — dépassé !' : '') + '</div>';
        }
        if (s.phase === 'result') {
          function libelle(o, n) {
            if (o === 'bj') return ['♠ BLACKJACK ! +' + n + ' 🪙', 'bj-r-win'];
            if (o === 'win') return ['Gagné ! +' + n + ' 🪙', 'bj-r-win'];
            if (o === 'lose') return ['Perdu… ' + n + ' 🪙', 'bj-r-lose'];
            return ['Égalité — mise rendue', 'bj-r-push'];
          }
          var l1 = libelle(moi.outcome, moi.net);
          if (moi.split) {
            var l2 = libelle(moi.outcome2, moi.net2);
            html += '<div class="bj-result ' + l1[1] + '">Main 1 : ' + l1[0] + '</div>' +
              '<div class="bj-result ' + l2[1] + '">Main 2 : ' + l2[0] + '</div>';
          } else {
            html += '<div class="bj-result ' + l1[1] + '">' + l1[0] + '</div>';
          }
        }
      } else if (moi.sit || (s.phase !== 'bet' && moi.bet <= 0)) {
        html += '<p class="bj-vide">Vous passez cette manche…</p>';
      }
      // le rond de mise
      if (moi) {
        if (moi.bet > 0) {
          html += '<div class="bj-spot filled">' + chipStack(moi.bet) +
            '<span class="bj-spot-amt">' + moi.bet + (moi.doubled ? ' · doublée' : '') + '</span></div>';
        } else if (!moi.sit) {
          html += '<div class="bj-spot"><span class="bj-spot-lbl">MISE</span></div>';
        }
      }
      html += '</div>';

      html += '</div></div>'; // fin tapis + arceau

      /* ===== la console, sur le rebord ===== */
      html += '<div class="bj-console">';
      if (moi && s.phase === 'bet' && !moi.sit && moi.bet <= 0) {
        var solde = GG.wallet ? GG.wallet.get() : 0;
        if (GG.wallet && solde < 1) {
          html += '<p class="mini-msg">Plus de jetons ! Recharge automatique chaque semaine, ou passez par la Boutique 🪙</p>' +
            '<div class="bj-actions"><button class="btn" id="bj-sit">Passer la manche</button></div>';
        } else {
          html += (GG.wallet ? '<div class="bj-wallet">Votre cagnotte : 🪙 ' +
            GG.wallet.fmt(GG.wallet.get()) + '</div>' : '');
          html += '<div class="bj-mises">';
          for (i = 0; i < MISES.length; i++) {
            html += '<button class="bj-chipbtn bj-bet" data-v="' + MISES[i] + '"' +
              (GG.wallet && solde < MISES[i] ? ' disabled' : '') + '>' +
              chipHtml(MISES[i], false) + '</button>';
          }
          html += '</div><button class="bj-passe" id="bj-sit">Je passe cette manche</button>' +
            '<p class="mini-msg" id="bj-msg"></p>';
        }
      } else if (moi && s.phase === 'bet' && moi.bet > 0) {
        html += '<p class="waiting">Mise posée — on attend les autres…</p>';
      } else if (s.phase === 'play') {
        if (moi && s.turn === me) {
          var mAct = moi.hi === 1 ? moi.hand2 : moi.hand;
          var dblOk = mAct.length === 2 && !(moi.hi === 1 ? moi.doubled2 : moi.doubled);
          var splitOk = !moi.split && moi.hand.length === 2 &&
            (moi.hand[0] % 13) === (moi.hand[1] % 13);
          html += (moi.split ? '<p class="hint mini-center">Main ' + (moi.hi + 1) + ' sur 2</p>' : '') +
            '<div class="bj-actions">' +
            '<button class="btn big" id="bj-hit">Tirer</button>' +
            '<button class="btn big" id="bj-stand">Rester</button>' +
            (dblOk ? '<button class="btn" id="bj-double">Doubler</button>' : '') +
            (splitOk ? '<button class="btn" id="bj-split">Séparer ✂️</button>' : '') +
            '</div><p class="mini-msg" id="bj-msg"></p>';
        } else if (s.turn >= 0) {
          html += '<p class="waiting">Au tour de ' + GG.esc(s.players[s.turn].name) + '…</p>';
        }
      } else if (s.phase === 'result') {
        if (moi) html += '<div class="bj-cumul">Cumul à cette table : ' + signe(moi.total) + ' 🪙</div>';
        if (me === 0) {
          // pas de fin au blackjack : on relance, ou on quitte la table
          // volontairement (petit lien discret, confirmé en deux temps)
          html += '<div class="bj-fin"><button class="btn big primary" id="bj-again">Manche suivante</button></div>' +
            '<button class="bj-passe" id="bj-end">' +
            (el._bjEndArm === rondCle ? '⚠️ Vraiment quitter la table ?' : 'Quitter la table') + '</button>';
        } else {
          html += '<p class="waiting">' + GG.esc(s.players[0].name) + ' relance…</p>';
        }
      }
      html += '</div>';

      el.innerHTML = html;

      function msg(txt) {
        var m = el.querySelector('#bj-msg');
        if (m) m.textContent = txt;
      }
      function on(id, fn) {
        var b = el.querySelector('#' + id);
        if (b) b.addEventListener('click', fn);
      }

      var boutons = el.querySelectorAll('.bj-bet');
      for (i = 0; i < boutons.length; i++) {
        (function (btn) {
          btn.addEventListener('click', function () {
            if (el._bjBet === rondCle) return; // anti double-débit
            var v = parseInt(btn.getAttribute('data-v'), 10);
            if (GG.wallet && !GG.wallet.spend(v)) { msg('Pas assez de jetons !'); return; }
            el._bjBet = rondCle;
            ctx.act({ t: 'bet', v: v });
          });
        })(boutons[i]);
      }
      on('bj-sit', function () { ctx.act({ t: 'sit' }); });
      on('bj-hit', function () { ctx.act({ t: 'hit' }); });
      on('bj-stand', function () { ctx.act({ t: 'stand' }); });
      on('bj-double', function () {
        var cle2 = rondCle + ':' + moi.hi;
        if (el._bjDbl === cle2) return; // anti double-débit
        var miseAct = moi.hi === 1 ? moi.bet2 : moi.bet;
        if (GG.wallet && !GG.wallet.spend(miseAct)) { msg('Pas assez de jetons pour doubler !'); return; }
        el._bjDbl = cle2;
        ctx.act({ t: 'double' });
      });
      on('bj-split', function () {
        if (el._bjSplit === rondCle) return; // anti double-débit
        if (GG.wallet && !GG.wallet.spend(moi.bet)) { msg('Pas assez de jetons pour séparer !'); return; }
        el._bjSplit = rondCle;
        ctx.act({ t: 'split' });
      });
      on('bj-again', function () { el._bjEndArm = null; ctx.act({ t: 'again' }); });
      // quitter la table demande une confirmation (fini les départs par mégarde)
      on('bj-end', function () {
        if (el._bjEndArm === rondCle) {
          el._bjEndArm = null;
          ctx.act({ t: 'end' });
        } else {
          el._bjEndArm = rondCle;
          mod.render(el, ctx);
        }
      });
    }
  };

  GG.register(mod);
  if (typeof module === 'object' && module.exports) module.exports = mod;
})(typeof self !== 'undefined' ? self : globalThis);