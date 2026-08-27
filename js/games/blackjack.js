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
      v = valeurMain(p.hand).total;
      if (estBlackjack(p.hand)) {
        if (bjCroupier) { p.outcome = 'push'; p.net = 0; }
        else { p.outcome = 'bj'; p.net = Math.floor(p.bet * 1.5); }
      } else if (v > 21) { p.outcome = 'lose'; p.net = -p.bet; }
      else if (bjCroupier) { p.outcome = 'lose'; p.net = -p.bet; }
      else if (vc > 21 || v > vc) { p.outcome = 'win'; p.net = p.bet; }
      else if (v === vc) { p.outcome = 'push'; p.net = 0; }
      else { p.outcome = 'lose'; p.net = -p.bet; }
      p.total += p.net;
    }
    s.turn = -1;
    s.phase = 'result';
  }

  function finDesJoueurs(s) {
    var i, p, besoin = false;
    for (i = 0; i < s.players.length; i++) {
      p = s.players[i];
      if (p.bet > 0 && !estBlackjack(p.hand) && valeurMain(p.hand).total <= 21) besoin = true;
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

  function signe(n) { return (n > 0 ? '+' + n : '' + n); }

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
      '<p><strong>Les gains :</strong> victoire 1 pour 1, blackjack naturel 3 pour 2, égalité : mise rendue. Pas de partage de paires (split) dans cette version.</p>',
    min: 1,
    max: 4,
    hotseat: true,
    hotseatMax: 1,
    hidden: false,
    netOnly: false,

    create: function (names) {
      var players = [], i;
      for (i = 0; i < names.length; i++) {
        players.push({ name: names[i], bet: 0, hand: [], done: false, doubled: false, sit: false, outcome: null, net: 0, total: 0 });
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
        GG.wallet.add(p.bet);
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

      if (t === 'hit' || t === 'stand' || t === 'double') {
        if (state.phase !== 'play') return { ok: false, error: 'Ce n\'est pas le moment de jouer.' };
        if (state.turn !== player) return { ok: false, error: 'Ce n\'est pas votre tour.' };
        if (t === 'hit') {
          tire(state, p.hand);
          if (valeurMain(p.hand).total >= 21) { p.done = true; avance(state); }
          return { ok: true };
        }
        if (t === 'stand') {
          p.done = true;
          avance(state);
          return { ok: true };
        }
        if (p.hand.length !== 2 || p.doubled) return { ok: false, error: 'On ne peut doubler qu\'avec ses deux premières cartes.' };
        p.bet = p.bet * 2;
        p.doubled = true;
        tire(state, p.hand);
        p.done = true;
        avance(state);
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
          q.bet = 0; q.hand = []; q.done = false; q.doubled = false; q.sit = false; q.outcome = null; q.net = 0;
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
          var retour = 0;
          if (moi.outcome === 'bj') retour = moi.bet + Math.floor(moi.bet * 1.5);
          else if (moi.outcome === 'win') retour = moi.bet * 2;
          else if (moi.outcome === 'push') retour = moi.bet;
          if (retour > 0) GG.wallet.add(retour);
        }
      }

      var html = '<div class="bj-top">' +
        '<span>Manche ' + s.round + '</span>' +
        '<span class="bj-shoe">Sabot : ' + (s.shoeCount || 0) + '</span>' +
        (GG.wallet ? '<span class="bj-wallet">🪙 ' + GG.wallet.fmt(GG.wallet.get()) + '</span>' : '') +
        '</div>';

      // Table du croupier
      var vc = valeurMain(s.dealer);
      var cache = false;
      for (i = 0; i < s.dealer.length; i++) if (s.dealer[i] < 0) cache = true;
      html += '<div class="bj-felt"><div class="bj-felt-titre">Croupier</div>';
      if (s.dealer.length) {
        html += '<div class="bj-cartes">' + mainHTML(s.dealer) + '</div>';
        if (cache) html += '<div class="bj-total">' + vc.total + ' + ?</div>';
        else html += '<div class="bj-total">' + vc.total +
          (s.phase === 'result' && estBlackjack(s.dealer) ? ' — Blackjack !' : (vc.total > 21 ? ' — le croupier saute !' : '')) + '</div>';
      } else if (s.phase === 'result') {
        html += '<div class="bj-cartes"><span class="bj-vide">Personne n’a misé cette manche.</span></div>';
      } else {
        html += '<div class="bj-cartes"><span class="bj-vide">Faites vos mises…</span></div>';
      }
      html += '</div>';

      // Ma zone
      html += '<div class="bj-main">';
      if (!moi) {
        html += '<p class="waiting">Vous regardez la partie…</p>';
      } else {
        html += '<div class="bj-moi-titre">Votre main</div>';
        if (s.phase === 'bet') {
          if (moi.sit) {
            html += '<p class="waiting">Vous passez cette manche…</p>';
          } else if (moi.bet > 0) {
            html += '<p class="waiting">Mise posée : ' + moi.bet + ' 🪙 — on attend les autres…</p>';
          } else {
            var solde = GG.wallet ? GG.wallet.get() : 0;
            if (GG.wallet && solde < 1) {
              html += '<p class="mini-msg">Plus de jetons ! Recharge automatique chaque semaine, ou passez par la Boutique 🪙</p>' +
                '<div class="bj-actions"><button class="btn" id="bj-sit">Passer la manche</button></div>';
            } else {
              html += '<p class="hint">Choisissez votre mise :</p><div class="bj-mises">';
              for (i = 0; i < MISES.length; i++) {
                html += '<button class="btn bj-bet" data-v="' + MISES[i] + '"' +
                  (GG.wallet && solde < MISES[i] ? ' disabled' : '') + '>' + MISES[i] + ' 🪙</button>';
              }
              html += '</div><button class="bj-passe" id="bj-sit">Je passe cette manche</button>' +
                '<p class="mini-msg" id="bj-msg"></p>';
            }
          }
        } else if (moi.bet <= 0) {
          html += '<p class="waiting">Vous passez cette manche…</p>';
        } else {
          var vm = valeurMain(moi.hand);
          html += '<div class="bj-cartes bj-cartes-moi">' + mainHTML(moi.hand) + '</div>';
          html += '<div class="bj-total-moi">' + vm.total + (vm.souple ? ' (souple)' : '') + (vm.total > 21 ? ' — dépassé !' : '') + '</div>';
          html += '<div class="bj-ligne">Mise : ' + moi.bet + ' 🪙' + (moi.doubled ? ' (doublée)' : '') + '</div>';
          if (s.phase === 'play') {
            if (s.turn === me) {
              html += '<div class="bj-actions">' +
                '<button class="btn big" id="bj-hit">Tirer</button>' +
                '<button class="btn big" id="bj-stand">Rester</button>' +
                (moi.hand.length === 2 && !moi.doubled ? '<button class="btn" id="bj-double">Doubler</button>' : '') +
                '</div><p class="mini-msg" id="bj-msg"></p>';
            } else if (s.turn >= 0) {
              html += '<p class="waiting">Au tour de ' + GG.esc(s.players[s.turn].name) + '…</p>';
            }
          } else if (s.phase === 'result') {
            var lbl = 'Égalité — mise rendue', cls = 'bj-r-push';
            if (moi.outcome === 'bj') { lbl = 'Blackjack ! +' + moi.net + ' 🪙'; cls = 'bj-r-win'; }
            else if (moi.outcome === 'win') { lbl = 'Gagné ! +' + moi.net + ' 🪙'; cls = 'bj-r-win'; }
            else if (moi.outcome === 'lose') { lbl = 'Perdu… ' + moi.net + ' 🪙'; cls = 'bj-r-lose'; }
            html += '<div class="bj-result ' + cls + '">' + lbl + '</div>';
          }
        }
        if (s.phase === 'result') {
          html += '<div class="bj-ligne">Cumul : ' + signe(moi.total) + ' 🪙</div>';
        }
      }
      html += '</div>';

      // Les autres joueurs, en résumé
      var autres = '';
      for (i = 0; i < s.players.length; i++) {
        if (i === me) continue;
        p = s.players[i];
        var st;
        if (s.phase === 'bet') st = p.sit ? 'passe' : (p.bet > 0 ? p.bet + ' 🪙' : 'mise…');
        else if (p.bet <= 0) st = 'passe';
        else if (s.phase === 'play') {
          var vt = valeurMain(p.hand).total;
          st = (s.turn === i ? '👉 ' : '') + p.bet + ' 🪙 · ' + vt + (vt > 21 ? ' 💥' : '');
        } else {
          if (p.outcome === 'bj') st = 'Blackjack ! +' + p.net;
          else if (p.outcome === 'win') st = '+' + p.net + ' 🪙';
          else if (p.outcome === 'push') st = 'égalité';
          else if (p.outcome === 'lose') st = p.net + ' 🪙';
          else st = 'a passé';
        }
        autres += '<div class="bj-autre"><strong>' + GG.esc(p.name) + '</strong>' + st + '</div>';
      }
      if (autres) html += '<div class="bj-autres">' + autres + '</div>';

      // Suite de la partie
      if (s.phase === 'result') {
        if (me === 0) {
          html += '<div class="bj-fin">' +
            '<button class="btn big" id="bj-again">Manche suivante</button>' +
            '<button class="btn" id="bj-end">Terminer la partie</button></div>';
        } else {
          html += '<p class="waiting">' + GG.esc(s.players[0].name) + ' décide de la suite…</p>';
        }
      }

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
        if (el._bjDbl === rondCle) return; // anti double-débit
        if (GG.wallet && !GG.wallet.spend(moi.bet)) { msg('Pas assez de jetons pour doubler !'); return; }
        el._bjDbl = rondCle;
        ctx.act({ t: 'double' });
      });
      on('bj-again', function () { ctx.act({ t: 'again' }); });
      on('bj-end', function () { ctx.act({ t: 'end' }); });
    }
  };

  GG.register(mod);
  if (typeof module === 'object' && module.exports) module.exports = mod;
})(typeof self !== 'undefined' ? self : globalThis);