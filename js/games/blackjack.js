/* GGgames — Blackjack (1 à 4 joueurs contre le croupier).
 *
 * Règles de la table : 6 jeux, le croupier reste sur tous les 17 et vérifie
 * s'il a un blackjack avant que l'on joue ; doubler sur les deux premières
 * cartes (aussi après une séparation) ; séparer deux cartes de même VALEUR
 * (10, valet, dame, roi valent tous 10), une fois par manche, les as séparés
 * ne reçoivent qu'une carte ; assurance (as du croupier, paie 2 contre 1) et
 * abandon (on récupère la moitié de sa mise) en option.
 *
 * Les gains sont exacts au demi-jeton près : un blackjack paie 3 contre 2,
 * une mise de 5 rapporte 7,5. La cagnotte garde le demi (deux demis font un
 * jeton).
 *
 * La cagnotte du téléphone suit l'état de la table, jamais l'inverse :
 * chaque joueur porte dans l'état le cumul de ce qu'il a misé (engage) et de
 * ce que la table lui a rendu (retour). Chaque téléphone tient un petit
 * journal (localStorage) de ce qu'il a déjà débité et crédité pour cette
 * table, et ne règle QUE la différence. Recharger l'appli, revenir à la
 * table, reprendre une partie enregistrée : rien n'est payé deux fois, rien
 * n'est perdu.
 */
(function (root) {
  'use strict';
  var GG = root.GG;

  var MISES = [1, 5, 25, 100, 500];   // les jetons que l'on empile
  var MISE_MIN = 1;
  var MISE_MAX = 5000;                // plafond de la table
  var JOURNAL = 'gg-bj-compte';
  var DELAI_MISE = 45000, DELAI_ASSUR = 20000, DELAI_TOUR = 30000; // en ligne

  /* ---------- les cartes ---------- */

  function nouveauSabot() {
    var cartes = [], d, c;
    for (d = 0; d < 6; d++) for (c = 0; c < 52; c++) cartes.push(c);
    return GG.shuffle(cartes);
  }

  /* valeur d'une carte : as 11, figures 10 */
  function valeurCarte(c) {
    var r = c % 13;
    if (r === 0) return 11;
    return Math.min(r + 1, 10);
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
    return main.length === 2 && main[0] >= 0 && main[1] >= 0 && valeurMain(main).total === 21;
  }

  function tire(s, main) {
    if (!s.shoe.length) s.shoe = nouveauSabot();
    main.push(s.shoe.pop());
  }

  function arrondiDemi(x) { return Math.round(x * 2) / 2; }

  /* ---------- la stratégie de base (6 jeux, croupier reste sur 17,
     doubler après séparation, abandon tardif) ----------
     main : cartes du joueur ; up : carte visible du croupier ;
     o : {doubler, separer, abandon} ce qui est permis maintenant.
     → 'hit' | 'stand' | 'double' | 'split' | 'surrender' */
  function conseil(main, up, o) {
    o = o || {};
    var d = valeurCarte(up);                 // 2..11
    var v = valeurMain(main);
    var t = v.total;
    var paire = main.length === 2 && valeurCarte(main[0]) === valeurCarte(main[1]);
    if (paire && o.separer) {
      var pv = valeurCarte(main[0]);
      if (pv === 11 || pv === 8) return 'split';
      if (pv === 9 && d !== 7 && d !== 10 && d !== 11) return 'split';
      if (pv === 7 && d <= 7) return 'split';
      if (pv === 6 && d <= 6) return 'split';
      if (pv === 4 && (d === 5 || d === 6)) return 'split';
      if ((pv === 2 || pv === 3) && d <= 7) return 'split';
    }
    if (o.abandon && main.length === 2 && !v.souple) {
      if (t === 16 && !(paire && valeurCarte(main[0]) === 8) && d >= 9) return 'surrender';
      if (t === 15 && d === 10) return 'surrender';
    }
    if (v.souple) {
      if (t >= 20) return 'stand';
      if (t === 19) return 'stand';
      if (t === 18) {
        if (d >= 3 && d <= 6) return o.doubler ? 'double' : 'stand';
        if (d <= 8) return 'stand';
        return 'hit';
      }
      if (t === 17) return (d >= 3 && d <= 6 && o.doubler) ? 'double' : 'hit';
      if (t === 16 || t === 15) return (d >= 4 && d <= 6 && o.doubler) ? 'double' : 'hit';
      return (d >= 5 && d <= 6 && o.doubler) ? 'double' : 'hit'; // 13, 14
    }
    if (t >= 17) return 'stand';
    if (t >= 13) return d <= 6 ? 'stand' : 'hit';
    if (t === 12) return (d >= 4 && d <= 6) ? 'stand' : 'hit';
    if (t === 11) return (d <= 10 && o.doubler) ? 'double' : 'hit';
    if (t === 10) return (d <= 9 && o.doubler) ? 'double' : 'hit';
    if (t === 9) return (d >= 3 && d <= 6 && o.doubler) ? 'double' : 'hit';
    return 'hit';
  }

  /* ---------- déroulement ---------- */

  function nouveauJoueur(nom) {
    return {
      name: nom, bet: 0, hand: [], done: false, doubled: false, sit: false,
      outcome: null, net: 0, total: 0,
      split: false, hand2: [], bet2: 0, doubled2: false, hi: 0, outcome2: null, net2: 0,
      assur: null, abandon: false,
      engage: 0, retour: 0,
      stats: { mains: 0, gagnees: 0, perdues: 0, egalites: 0, bj: 0, meilleur: 0, pire: 0 }
    };
  }

  function razManche(q) {
    q.bet = 0; q.hand = []; q.done = false; q.doubled = false; q.sit = false;
    q.outcome = null; q.net = 0; q.split = false; q.hand2 = []; q.bet2 = 0;
    q.doubled2 = false; q.hi = 0; q.outcome2 = null; q.net2 = 0;
    q.assur = null; q.abandon = false;
  }

  function tousOntChoisi(s) {
    for (var i = 0; i < s.players.length; i++) {
      if (s.players[i].bet <= 0 && !s.players[i].sit) return false;
    }
    return true;
  }

  function prochainTour(s, depuis) {
    for (var i = depuis; i < s.players.length; i++) {
      var p = s.players[i];
      if (p.bet > 0 && !p.done) return i;
    }
    return -1;
  }

  function enLigne(s) { return s.players.length > 1; }

  /* règle la manche : issue de chaque main, ce que la table rend à chacun */
  function resoudre(s) {
    var bjCroupier = estBlackjack(s.dealer);
    var vc = valeurMain(s.dealer).total;
    var i, p;
    function juge(main, mise, naturelPossible) {
      var v2 = valeurMain(main).total;
      if (naturelPossible && estBlackjack(main)) {
        return bjCroupier ? { o: 'push', r: mise } : { o: 'bj', r: mise * 2.5 };
      }
      if (v2 > 21) return { o: 'lose', r: 0 };
      if (bjCroupier) return { o: 'lose', r: 0 };
      if (vc > 21 || v2 > vc) return { o: 'win', r: mise * 2 };
      if (v2 === vc) return { o: 'push', r: mise };
      return { o: 'lose', r: 0 };
    }
    for (i = 0; i < s.players.length; i++) {
      p = s.players[i];
      if (p.bet <= 0) { p.outcome = 'sit'; p.net = 0; continue; }
      var mise = p.bet + (p.split ? p.bet2 : 0) + (p.assur > 0 ? p.assur : 0);
      var rendu = 0;
      if (p.abandon) {
        p.outcome = 'abandon';
        rendu = p.bet / 2;
        p.net = arrondiDemi(rendu - p.bet);
      } else {
        var j1 = juge(p.hand, p.bet, !p.split);
        p.outcome = j1.o; p.net = arrondiDemi(j1.r - p.bet);
        rendu += j1.r;
        if (p.split) {
          var j2 = juge(p.hand2, p.bet2, false);
          p.outcome2 = j2.o; p.net2 = arrondiDemi(j2.r - p.bet2);
          rendu += j2.r;
        }
      }
      // l'assurance paie 2 contre 1 si le croupier a un blackjack
      if (p.assur > 0) rendu += bjCroupier ? p.assur * 3 : 0;
      rendu = arrondiDemi(rendu);
      p.retour = arrondiDemi((p.retour || 0) + rendu);
      var bilan = arrondiDemi(rendu - mise);
      p.bilan = bilan;
      p.total = arrondiDemi((p.total || 0) + bilan);
      var st = p.stats || (p.stats = { mains: 0, gagnees: 0, perdues: 0, egalites: 0, bj: 0, meilleur: 0, pire: 0 });
      st.mains++;
      if (p.outcome === 'bj') st.bj++;
      if (bilan > 0) st.gagnees++;
      else if (bilan < 0) st.perdues++;
      else st.egalites++;
      if (bilan > st.meilleur) st.meilleur = bilan;
      if (bilan < st.pire) st.pire = bilan;
    }
    s.turn = -1;
    s.phase = 'result';
  }

  /* tous les joueurs ont fini : le croupier joue (s'il reste une main en vie) */
  function finDesJoueurs(s) {
    var i, p, besoin = false;
    for (i = 0; i < s.players.length; i++) {
      p = s.players[i];
      if (p.bet <= 0 || p.abandon) continue;
      if ((!p.split && !estBlackjack(p.hand) && valeurMain(p.hand).total <= 21) ||
          (p.split && (valeurMain(p.hand).total <= 21 || valeurMain(p.hand2).total <= 21))) besoin = true;
    }
    if (besoin) while (valeurMain(s.dealer).total < 17) tire(s, s.dealer);
    resoudre(s);
  }

  /* le croupier regarde sous sa carte (as ou dix visible) */
  function verifieCroupier(s) {
    if (estBlackjack(s.dealer)) { resoudre(s); return; }
    s.phase = 'play';
    s.turn = prochainTour(s, 0);
    if (s.turn === -1) finDesJoueurs(s);
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
    if (s.shoe.length < 60) { s.shoe = nouveauSabot(); s.melange = (s.melange || 0) + 1; }
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
    // as visible : on propose l'assurance avant de regarder sous la carte
    if (s.options && s.options.assurance && s.dealer[0] % 13 === 0) {
      var qui = false;
      for (i = 0; i < s.players.length; i++) {
        p = s.players[i];
        if (p.bet > 0 && Math.floor(p.bet / 2) >= 1) { p.assur = null; qui = true; }
        else p.assur = 0;
      }
      if (qui) { s.phase = 'assurance'; s.turn = -1; return; }
    }
    verifieCroupier(s);
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

  function peutSeparer(p) {
    return !p.split && p.hand.length === 2 && p.hand[0] >= 0 && p.hand[1] >= 0 &&
      valeurCarte(p.hand[0]) === valeurCarte(p.hand[1]);
  }
  function peutDoubler(p) {
    var m = mainActive(p);
    return m.length === 2 && !(p.hi === 1 ? p.doubled2 : p.doubled);
  }
  function peutAbandonner(s, p) {
    return !!(s.options && s.options.abandon) && !p.split && p.hand.length === 2 && !p.doubled;
  }

  /* minuteur d'autorité (en ligne seulement) : l'échéance est aussi
     stockée dans l'état, et vérifiée quand le minuteur tombe */
  function minuteur(s, ms) {
    if (!enLigne(s) || s.finished) return undefined;
    s.seq = (s.seq || 0) + 1;
    s.echeance = Date.now() + ms;
    return { ms: ms, action: { t: 'delai', seq: s.seq } };
  }
  function minuteurApres(s) {
    if (s.phase === 'bet') return minuteur(s, DELAI_MISE);
    if (s.phase === 'assurance') return minuteur(s, DELAI_ASSUR);
    if (s.phase === 'play') return minuteur(s, DELAI_TOUR);
    s.seq = (s.seq || 0) + 1; // résultat : plus rien n'attend
    return undefined;
  }
  function ok(s) { return { ok: true, timer: minuteurApres(s) }; }

  /* ---------- l'affichage ---------- */

  function signe(n) {
    var t = fmtDemi(Math.abs(n));
    return n > 0 ? '+' + t : (n < 0 ? '−' + t : '0');
  }
  function fmtDemi(n) {
    var e = Math.floor(n + 1e-9), d = n - e > 0.25;
    var txt = String(e).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202F');
    return d ? (e === 0 ? '½' : txt + ',5') : txt;
  }

  function carteHtml(c, k, extra) {
    var o = { classe: 'bj-card' + (extra ? ' ' + extra : ''), attrs: k ? ' data-k="' + k + '"' : '' };
    if (c < 0) { o.classe += ' bj-dos'; return GG.carteDos(o); }
    return GG.carteStd(c, o);
  }

  function lireJournal() {
    try { return JSON.parse(localStorage.getItem(JOURNAL) || 'null'); } catch (e) { return null; }
  }
  function ecrireJournal(j) {
    try {
      if (j) localStorage.setItem(JOURNAL, JSON.stringify(j));
      else localStorage.removeItem(JOURNAL);
    } catch (e) {}
  }
  function idTable(s) { return s.tableId || ('bj' + (s.startTs || 0)); }
  /* mises de la manche en cours pas encore réglées */
  function enJeu(s, p) {
    if (s.phase === 'result' || !p || p.bet <= 0) return 0;
    return p.bet + (p.split ? p.bet2 : 0) + (p.assur > 0 ? p.assur : 0);
  }

  /* La cagnotte de CE téléphone rattrape l'état de la table : on débite ce
     qui a été misé depuis la dernière fois, on crédite ce qui a été rendu.
     Idempotent : un rechargement, un ré-affichage, un retour à la table ne
     paient jamais deux fois. */
  function regler(s, me) {
    if (!GG.wallet || !s || !s.players || !s.players[me]) return null;
    var p = s.players[me];
    var id = idTable(s) + ':' + me;
    var j = lireJournal();
    if (!j || j.id !== id) {
      // première fois à cette table (ou retour après l'avoir quittée) : on
      // repart de l'état, en facturant les mises encore en jeu
      j = { id: id, e: (p.engage || 0) - enJeu(s, p), r: p.retour || 0 };
    }
    var de = (p.engage || 0) - j.e, dr = arrondiDemi((p.retour || 0) - j.r);
    if (de > 0) { if (!GG.wallet.spend(de)) GG.wallet.retire(de); }
    else if (de < 0) GG.wallet.add(-de);
    if (dr > 0) GG.wallet.add(dr);
    else if (dr < 0) GG.wallet.retire(-dr);
    j.e = p.engage || 0; j.r = p.retour || 0;
    ecrireJournal(j);
    return j;
  }

  var mod = {
    id: 'blackjack',
    nom: 'Blackjack',
    icone: '♠️',
    desc: 'Défiez le croupier : approchez 21 sans le dépasser et repartez avec les jetons !',
    regles: '<p><strong>🎯 Le but :</strong> battre le croupier en vous approchant de 21 sans jamais le dépasser.</p>' +
      '<p><strong>Miser :</strong> empilez les jetons (1, 5, 25, 100, 500) pour composer n’importe quel montant, de 1 à 5 000, puis validez. « Rejouer » remet la même mise en un geste.</p>' +
      '<p><strong>Jouer :</strong> vous recevez deux cartes. Tirez, restez, ou doublez (avec vos deux premières cartes : mise doublée, une seule carte de plus). L’as vaut 1 ou 11, les figures 10.</p>' +
      '<p><strong>Séparer :</strong> deux cartes de même valeur (deux 8, ou un valet et une dame : elles valent 10 toutes les deux) se séparent en deux mains, chacune avec sa mise. Une séparation par manche ; les as séparés ne reçoivent qu’une carte chacun ; on peut doubler après avoir séparé.</p>' +
      '<p><strong>Le croupier :</strong> il vérifie d’abord s’il a un blackjack, puis joue après vous et tire jusqu’à 17 — il reste sur tous les 17.</p>' +
      '<p><strong>Assurance (option) :</strong> quand le croupier montre un as, vous pouvez vous assurer pour la moitié de votre mise ; elle paie 2 contre 1 s’il a un blackjack.</p>' +
      '<p><strong>Abandon (option) :</strong> sur vos deux premières cartes, vous pouvez rendre la main et récupérer la moitié de votre mise.</p>' +
      '<p><strong>Les gains :</strong> victoire 1 pour 1, blackjack 3 pour 2 (au demi-jeton près : 5 misés rapportent 7,5 ; la cagnotte garde le demi-jeton, deux demis font un jeton), égalité : mise rendue.</p>' +
      '<p><strong>Quitter la table :</strong> comme au casino, une main commencée se termine : si vous partez en pleine main, elle est jouée pour vous (vous restez), et réglée normalement.</p>' +
      '<p><strong>💡 Conseils :</strong> l’aide « stratégie de base » (réglages de la table) vous souffle le meilleur coup mathématique à chaque décision.</p>',
    min: 1,
    max: 4,
    hotseat: true,
    hotseatMax: 1,
    hidden: false,
    netOnly: false,

    create: function (names) {
      var players = [], i;
      for (i = 0; i < names.length; i++) players.push(nouveauJoueur(names[i]));
      return {
        v: 2,
        tableId: 'bj' + Date.now() + '-' + Math.floor(Math.random() * 1e6),
        round: 1,
        phase: 'bet',
        turn: -1,
        shoe: nouveauSabot(),
        shoeCount: 312,
        dealer: [],
        players: players,
        options: { assurance: true, abandon: true },
        finished: false,
        startTs: Date.now(),
        seq: 0,
        echeance: 0
      };
    },

    turnOf: function (state) {
      return state.phase === 'play' ? state.turn : -1;
    },

    over: function (state) {
      return !!state.finished;
    },

    scoreOf: function (state, i) {
      return signe(state.players[i].total || 0);
    },

    /* le meilleur bilan l'emporte ; seul à la table : gagné, égal ou perdu */
    gagnants: function (state) {
      var ps = state.players, i, best = -Infinity, g = [];
      for (i = 0; i < ps.length; i++) if ((ps[i].total || 0) > best) best = ps[i].total || 0;
      if (best < 0) return null;       // le croupier a tout raflé
      if (best === 0) return [];
      for (i = 0; i < ps.length; i++) if ((ps[i].total || 0) === best) g.push(i);
      return g;
    },

    summary: function (state) {
      var ps = state.players, i;
      var ordre = [];
      for (i = 0; i < ps.length; i++) ordre.push(i);
      ordre.sort(function (a, b) { return (ps[b].total || 0) - (ps[a].total || 0); });
      var best = ps[ordre[0]].total || 0;
      var html;
      if (ps.length === 1) {
        html = best > 0 ? '<h1>🏆 ' + GG.esc(ps[0].name) + ' bat le croupier !</h1>'
          : (best < 0 ? '<h1>🎩 Le croupier l’emporte</h1>' : '<h1>🤝 Match nul avec le croupier</h1>');
      } else {
        var gagnants = [];
        for (i = 0; i < ps.length; i++) if ((ps[i].total || 0) === best) gagnants.push(GG.esc(ps[i].name));
        html = '<h1>🏆 ' + gagnants.join(' & ') + '</h1>';
      }
      for (i = 0; i < ordre.length; i++) {
        var p = ps[ordre[i]];
        html += '<div class="final-line"><span>' + GG.esc(p.name) + '</span><strong>' +
          signe(p.total || 0) + ' 🪙</strong></div>';
      }
      var st = ps[0].stats;
      if (ps.length === 1 && st && st.mains) {
        html += '<p class="hint">' + st.mains + (st.mains > 1 ? ' mains jouées' : ' main jouée') +
          ' · ' + st.gagnees + ' gagnée' + (st.gagnees > 1 ? 's' : '') +
          (st.bj ? ' · ' + st.bj + ' blackjack' + (st.bj > 1 ? 's' : '') : '') +
          (st.meilleur > 0 ? ' · meilleur coup ' + signe(st.meilleur) : '') + '</p>';
      } else {
        html += '<p class="hint">' + state.round + (state.round > 1 ? ' manches jouées' : ' manche jouée') + ' face au croupier.</p>';
      }
      return html;
    },

    redact: function (state, viewer) {
      var r = GG.clone(state);
      r.shoeCount = state.shoe ? state.shoe.length : 0;
      delete r.shoe;
      if (r.phase !== 'result' && r.dealer && r.dealer.length > 1) r.dealer[1] = -1;
      return r;
    },

    /* On quitte la table (menu, fin de partie, partie enregistrée abandonnée).
       Une main commencée se termine comme au casino : quand l'état complet
       est là (partie sur ce téléphone), on la joue d'office — on reste — et
       elle est réglée normalement ; sinon (invité en ligne) la mise engagée
       reste sur la table. Une mise posée mais pas encore distribuée est
       rendue. Puis le journal de la table est fermé. */
    cashout: function (state, me) {
      if (!GG.wallet || !state || !state.players || !state.players[me]) return;
      var s = state;
      var p = s.players[me];
      if (!s.finished && (s.phase === 'play' || s.phase === 'assurance') && p.bet > 0 && s.shoe) {
        s = GG.clone(state);
        var guard = 0;
        while (s.phase !== 'result' && guard++ < 50) {
          if (s.phase === 'assurance') {
            for (var i = 0; i < s.players.length; i++) {
              if (s.players[i].assur === null) mod.apply(s, i, { t: 'assur', oui: false });
            }
          } else if (s.phase === 'play') {
            if (mod.apply(s, s.turn, { t: 'stand' }).ok !== true) break;
          } else break;
        }
      }
      var q = s.players[me];
      var j = regler(s, me);
      if (s.phase === 'bet' && q.bet > 0 && j) {
        // mise posée, cartes pas distribuées : elle revient
        GG.wallet.add(q.bet);
      }
      ecrireJournal(null);
    },

    apply: function (state, player, action) {
      if (!action || typeof action.t !== 'string') return { ok: false, error: 'Action invalide.' };
      if (state.finished) return { ok: false, error: 'La partie est terminée.' };
      var t = action.t, i, q;

      /* minuteur d'autorité (en ligne) : qui n'a pas joué à temps passe */
      if (t === 'delai') {
        if (player !== -1) return { ok: false, error: 'Action réservée à la table.' };
        if (action.seq !== state.seq || Date.now() < (state.echeance || 0) - 250) return { ok: true };
        if (state.phase === 'bet') {
          for (i = 0; i < state.players.length; i++) {
            q = state.players[i];
            if (q.bet <= 0 && !q.sit) q.sit = true;
          }
          if (tousOntChoisi(state)) distribuer(state);
          return ok(state);
        }
        if (state.phase === 'assurance') {
          for (i = 0; i < state.players.length; i++) {
            if (state.players[i].assur === null) state.players[i].assur = 0;
          }
          verifieCroupier(state);
          return ok(state);
        }
        if (state.phase === 'play' && state.turn >= 0) {
          var pt = state.players[state.turn];
          pt.hi = 1; // on reste sur toutes ses mains
          pt.done = true;
          avance(state);
          return ok(state);
        }
        return { ok: true };
      }

      var p = state.players[player];
      if (!p) return { ok: false, error: 'Joueur inconnu.' };

      if (t === 'options') {
        if (player !== 0) return { ok: false, error: 'Seul l’hôte règle la table.' };
        if (state.phase !== 'bet') return { ok: false, error: 'On règle la table entre deux manches.' };
        for (i = 0; i < state.players.length; i++) {
          if (state.players[i].bet > 0) return { ok: false, error: 'Des mises sont déjà posées.' };
        }
        state.options = {
          assurance: action.assurance !== false,
          abandon: action.abandon !== false
        };
        return { ok: true };
      }

      if (t === 'bet') {
        if (state.phase !== 'bet') return { ok: false, error: 'Les mises sont closes.' };
        if (p.bet > 0 || p.sit) return { ok: false, error: 'Vous avez déjà fait votre choix.' };
        var v = action.v;
        if (typeof v !== 'number' || !isFinite(v) || Math.floor(v) !== v || v < MISE_MIN || v > MISE_MAX) {
          return { ok: false, error: 'Mise invalide (de ' + MISE_MIN + ' à ' + MISE_MAX + ' jetons).' };
        }
        p.bet = v;
        p.engage = (p.engage || 0) + v;
        if (tousOntChoisi(state)) distribuer(state);
        return ok(state);
      }

      if (t === 'sit') {
        if (state.phase !== 'bet') return { ok: false, error: 'Les mises sont closes.' };
        if (p.bet > 0 || p.sit) return { ok: false, error: 'Vous avez déjà fait votre choix.' };
        p.sit = true;
        if (tousOntChoisi(state)) distribuer(state);
        return ok(state);
      }

      if (t === 'assur') {
        if (state.phase !== 'assurance') return { ok: false, error: 'Pas d’assurance à prendre.' };
        if (p.bet <= 0 || p.assur !== null) return { ok: false, error: 'Vous avez déjà répondu.' };
        var montant = Math.floor(p.bet / 2);
        if (action.oui && montant >= 1) {
          p.assur = montant;
          p.engage = (p.engage || 0) + montant;
        } else {
          p.assur = 0;
        }
        for (i = 0; i < state.players.length; i++) {
          if (state.players[i].bet > 0 && state.players[i].assur === null) return ok(state);
        }
        verifieCroupier(state);
        return ok(state);
      }

      if (t === 'hit' || t === 'stand' || t === 'double' || t === 'split' || t === 'surrender') {
        if (state.phase !== 'play') return { ok: false, error: 'Ce n’est pas le moment de jouer.' };
        if (state.turn !== player) return { ok: false, error: 'Ce n’est pas votre tour.' };
        var m = mainActive(p);
        if (t === 'hit') {
          tire(state, m);
          if (valeurMain(m).total >= 21) finMain(state, p);
          return ok(state);
        }
        if (t === 'stand') {
          finMain(state, p);
          return ok(state);
        }
        if (t === 'surrender') {
          if (!peutAbandonner(state, p)) return { ok: false, error: 'Abandon possible seulement sur vos deux premières cartes.' };
          p.abandon = true;
          p.done = true;
          avance(state);
          return ok(state);
        }
        if (t === 'split') {
          if (p.split) return { ok: false, error: 'Une seule séparation par manche.' };
          if (!peutSeparer(p)) {
            return { ok: false, error: 'Il faut deux cartes de même valeur pour séparer.' };
          }
          p.split = true;
          p.hand2 = [p.hand.pop()];
          p.bet2 = p.bet;
          p.engage = (p.engage || 0) + p.bet2;
          tire(state, p.hand);
          tire(state, p.hand2);
          if ((p.hand2[0] % 13) === 0) {
            // paire d'as séparée : une seule carte par main, mains terminées
            p.hi = 1;
            p.done = true;
            avance(state);
          } else {
            p.hi = 0;
            if (valeurMain(p.hand).total >= 21) finMain(state, p);
          }
          return ok(state);
        }
        // doubler
        if (!peutDoubler(p)) return { ok: false, error: 'On ne peut doubler qu’avec ses deux premières cartes.' };
        if (p.hi === 1) { p.engage = (p.engage || 0) + p.bet2; p.bet2 = p.bet2 * 2; p.doubled2 = true; }
        else { p.engage = (p.engage || 0) + p.bet; p.bet = p.bet * 2; p.doubled = true; }
        tire(state, m);
        finMain(state, p);
        return ok(state);
      }

      if (t === 'again') {
        if (state.phase !== 'result') return { ok: false, error: 'La manche n’est pas terminée.' };
        if (player !== 0) return { ok: false, error: 'Seul l’hôte peut lancer la manche suivante.' };
        var remise = action.mise;
        if (remise !== undefined && (typeof remise !== 'number' || Math.floor(remise) !== remise ||
            remise < MISE_MIN || remise > MISE_MAX)) {
          return { ok: false, error: 'Mise invalide.' };
        }
        state.round++;
        state.phase = 'bet';
        state.turn = -1;
        state.dealer = [];
        for (i = 0; i < state.players.length; i++) razManche(state.players[i]);
        if (remise) {
          // « Rejouer » : la même mise, en un geste
          p.bet = remise;
          p.engage = (p.engage || 0) + remise;
          if (tousOntChoisi(state)) distribuer(state);
        }
        return ok(state);
      }

      if (t === 'end') {
        if (player !== 0) return { ok: false, error: 'Seul l’hôte peut terminer la partie.' };
        if (state.phase === 'bet') {
          for (i = 0; i < state.players.length; i++) {
            if (state.players[i].bet > 0) return { ok: false, error: 'Des mises sont posées : jouez la manche.' };
          }
        } else if (state.phase !== 'result') {
          return { ok: false, error: 'La manche n’est pas terminée.' };
        }
        state.finished = true;
        state.seq = (state.seq || 0) + 1;
        return { ok: true };
      }

      return { ok: false, error: 'Action inconnue.' };
    },

    render: function (el, ctx) {
      var s = ctx.state;
      var me = ctx.me;
      var moi = (me >= 0 && s.players[me]) ? s.players[me] : null;
      var fx = GG.fx, sfx = GG.sfx;
      var i, p;
      var now = Date.now();
      var options = s.options || { assurance: true, abandon: true };
      var aide = lireAide();

      /* ---- la cagnotte suit la table (débits et crédits exacts) ---- */
      var soldeAvant = GG.wallet ? GG.wallet.get() : 0;
      if (moi) regler(s, me);
      var solde = GG.wallet ? GG.wallet.get() : 0;

      // clé unique par table ET par manche
      var cleManche = idTable(s) + ':' + s.round;

      /* ---- anti « ghost tap » : à chaque transition (phase, main du split),
         la console est gelée un instant ; un seul act par rendu ---- */
      var cleCtx = cleManche + ':' + s.phase + ':' + (moi && moi.split ? 'S' + moi.hi : 'N');
      if (el._bjCtxCle !== undefined && el._bjCtxCle !== cleCtx) el._bjGelFin = now + 600;
      el._bjCtxCle = cleCtx;
      el._bjActed = false;
      if (el._bjMiseCle !== cleManche) { el._bjMiseCle = cleManche; el._bjMise = 0; }

      /* ---- la chronologie des animations (survit aux ré-affichages) ---- */
      var T = el._bjT;
      if (!T || T.cle !== cleManche) {
        T = el._bjT = { cle: cleManche, cartes: {}, curseur: now, fait: {}, finRes: 0 };
      }
      var curseur = Math.max(T.curseur, now);
      var VOL = 300;          // durée du vol d'une carte
      var DT = 260;           // entre deux cartes distribuées
      var DT_CROUPIER = 760;  // le croupier tire en prenant son temps
      var vols = [];          // cartes à faire voler après l'affichage
      var enResultat = s.phase === 'result';

      /* Chaque carte a sa place dans la chronologie : l'heure à laquelle
         elle quitte le sabot (vol), ou se retourne (carte cachée du
         croupier). On l'inscrit la première fois qu'on la voit, dans
         l'ordre réel de la donne ; un ré-affichage la retrouve et reprend
         son animation là où elle en était. */
      function inscrire(k, c, dt, pose) {
        var info = T.cartes[k];
        if (!info || (info.c >= 0 && c >= 0 && info.c !== c)) {
          info = T.cartes[k] = { t: curseur, c: c };
          if (pose) { info.pose = true; } else { curseur += dt; vols.push({ k: k, t: info.t }); }
        } else if (info.c < 0 && c >= 0) {
          // la carte cachée du croupier se retourne
          info.c = c;
          info.rev = curseur;
          curseur += DT_CROUPIER * 0.8;
        }
        return info;
      }
      /* le HTML d'une carte déjà inscrite, avec son animation */
      function carte(k, c, extra) {
        var info = T.cartes[k] || inscrire(k, c, DT);
        var debut = info.rev ? info.rev : (info.pose ? info.t : info.t + VOL);
        var anim = '';
        if (debut + 480 > now && !(fx.reduced && fx.reduced())) {
          anim = info.pose ? 'jc-pose' : (c < 0 ? 'jc-arrive' : 'jc-retourne');
          extra = (extra ? extra + ' ' : '') + anim;
        }
        var h = carteHtml(c, k, extra);
        if (anim) h = h.replace('<span class="jc', '<span style="--d:' + (debut - now) + 'ms" class="jc');
        return h;
      }
      function apres(t) { return ' style="--d:' + Math.max(-2000, t - now) + 'ms"'; }

      /* 1) la donne initiale, dans l'ordre du casino : une carte à chacun,
         une au croupier, puis la deuxième ; 2) les cartes tirées ensuite ;
         3) la carte cachée du croupier, puis ses tirages, en suspense. */
      if (s.dealer.length) {
        var joueursMise = [];
        for (i = 0; i < s.players.length; i++) {
          if (s.players[i].bet > 0 && s.players[i].hand.length) joueursMise.push(i);
        }
        if (!T.cartes.c0) {
          for (var tour = 0; tour < 2; tour++) {
            for (var oi = 0; oi < joueursMise.length; oi++) {
              var pj = s.players[joueursMise[oi]];
              if (pj.hand[tour] !== undefined) inscrire('p' + joueursMise[oi] + 'a' + tour, pj.hand[tour], DT);
            }
            // la carte cachée part toujours face contre le tapis
            inscrire('c' + tour, tour === 1 ? -1 : s.dealer[0], DT);
          }
        }
        for (var oj = 0; oj < joueursMise.length; oj++) {
          var q2 = s.players[joueursMise[oj]], x2;
          var ancienne = T.cartes['p' + joueursMise[oj] + 'a1'];
          if (q2.split && !T.cartes['p' + joueursMise[oj] + 'b0'] && ancienne && ancienne.c === q2.hand2[0]) {
            // la séparation : la deuxième carte glisse vers la seconde main
            inscrire('p' + joueursMise[oj] + 'b0', q2.hand2[0], 0, true);
          }
          for (x2 = 0; x2 < q2.hand.length; x2++) inscrire('p' + joueursMise[oj] + 'a' + x2, q2.hand[x2], DT);
          if (q2.split) for (x2 = 0; x2 < q2.hand2.length; x2++) inscrire('p' + joueursMise[oj] + 'b' + x2, q2.hand2[x2], DT);
        }
        inscrire('c0', s.dealer[0], DT);
        inscrire('c1', s.dealer[1], DT);
        for (i = 2; i < s.dealer.length; i++) inscrire('c' + i, s.dealer[i], DT_CROUPIER);
      }

      /* ===== la table ===== */
      var html = '<div class="bj2' + (s.players.length > 1 ? ' multi' : '') + '">';
      html += '<div class="bj-rim"><div class="bj-felt cz-feutre' + (enResultat && s.dealer.length ? ' resultat' : '') + '">';

      // la caisse (ma cagnotte) à gauche, le croupier au milieu, le sabot à droite
      var restant = s.shoe ? s.shoe.length : (s.shoeCount || 0);
      var soldeAffiche = enResultat && el._bjSoldeVu !== undefined ? el._bjSoldeVu :
        (enResultat && moi && moi.bet > 0 && !T.fait.res ? soldeAvant : solde);
      html += '<div class="bj-haut">' +
        (GG.wallet ? '<div class="bj-caisse bj-wallet" aria-label="Votre cagnotte"><span>Cagnotte</span><b id="bj-solde">' +
          GG.wallet.fmt(soldeAffiche) + '</b>' + (GG.wallet.demi && GG.wallet.demi() ? '<small>+½</small>' : '') +
          '<i>Manche ' + s.round + '</i></div>'
          : '<div class="bj-caisse"><span>Manche</span><b>' + s.round + '</b></div>') +
        '<div class="bj-dealer"><div class="bj-deal-lbl">CROUPIER</div>';

      var croupierHtml = '';
      for (i = 0; i < s.dealer.length; i++) croupierHtml += carte('c' + i, s.dealer[i]);
      var mesMains = [];
      for (i = 0; i < s.players.length; i++) {
        var q3 = s.players[i], h1 = '', h2b = '', x3;
        if (q3.bet > 0 && s.phase !== 'bet') {
          for (x3 = 0; x3 < q3.hand.length; x3++) h1 += carte('p' + i + 'a' + x3, q3.hand[x3]);
          if (q3.split) for (x3 = 0; x3 < q3.hand2.length; x3++) h2b += carte('p' + i + 'b' + x3, q3.hand2[x3]);
        }
        mesMains[i] = [h1, h2b];
      }
      var finCartes = curseur;
      if (enResultat && !T.finRes) T.finRes = finCartes + 250;
      var finRes = T.finRes || finCartes;
      // le compteur de la cagnotte ne défile qu'au verdict
      if (enResultat && moi && moi.bet > 0 && !T.fait.res) el._bjSoldeVu = soldeAvant;

      var vc = valeurMain(s.dealer);
      var cache = false;
      for (i = 0; i < s.dealer.length; i++) if (s.dealer[i] < 0) cache = true;
      if (s.dealer.length) {
        html += '<div class="bj-cartes bj-main-c">' + croupierHtml + '</div>';
        var txtC = cache ? valeurCarte(s.dealer[0]) === 11 ? 'As' : String(valeurMain([s.dealer[0]]).total)
          : String(vc.total);
        var etatC = '';
        if (!cache && enResultat) {
          if (estBlackjack(s.dealer)) etatC = ' bj';
          else if (vc.total > 21) etatC = ' saute';
        }
        html += '<div class="bj-total bj-bulle' + etatC + '"' + (enResultat ? apres(finCartes - 200) : '') + '>' +
          (etatC === ' bj' ? 'Blackjack' : (etatC === ' saute' ? vc.total + ' · sauté !' : txtC)) + '</div>';
      } else {
        html += '<div class="bj-cartes bj-main-c"><span class="bj-vide">' +
          (enResultat ? 'Personne n’a misé cette manche.' : 'Faites vos jeux…') + '</span></div>';
      }
      html += '</div>';
      html += '<div class="bj-sabot" aria-label="Sabot : ' + restant + ' cartes"><span class="bj-sabot-boite"><span class="bj-sabot-carte"></span></span><b>' + restant + '</b></div>';
      html += '</div>';

      // l'inscription en arc, comme sur les vrais tapis (le verdict s'y pose)
      html += '<div class="bj-milieu">';
      html += '<svg class="bj-arc" viewBox="0 0 320 50" aria-hidden="true">' +
        '<defs><path id="bj-arc-p" d="M 16 44 A 380 380 0 0 1 304 44"/></defs>' +
        '<text><textPath href="#bj-arc-p" startOffset="50%" text-anchor="middle">' +
        'BLACKJACK PAIE 3 CONTRE 2</textPath></text></svg>' +
        '<div class="bj-rule">Le croupier reste sur 17' +
        (options.assurance ? ' · assurance 2 contre 1' : '') + '</div>';

      // les autres joueurs, posés sur le tapis
      var autres = '';
      for (i = 0; i < s.players.length; i++) {
        if (i === me) continue;
        p = s.players[i];
        var st;
        if (s.phase === 'bet') st = p.sit ? 'passe' : (p.bet > 0 ? 'mise ' + p.bet : 'réfléchit…');
        else if (p.bet <= 0) st = 'passe';
        else if (!enResultat) {
          var vt = valeurMain(p.hand).total;
          st = p.bet + ' 🪙 · ' + vt + (vt > 21 ? ' 💥' : '');
        } else {
          st = p.outcome === 'bj' ? 'Blackjack !' : (p.bilan > 0 ? '+' + fmtDemi(p.bilan) :
            (p.bilan < 0 ? '−' + fmtDemi(-p.bilan) : 'égalité'));
        }
        var robot2 = p.name.indexOf('🤖') === 0;
        var nom2 = p.name.replace(/^🤖 /, '');
        autres += '<div class="bj-oplr' + (s.phase === 'play' && s.turn === i ? ' turn' : '') + '">' +
          (mesMains[i][0] ? '<span class="bj-ocartes">' + mesMains[i][0] + '</span>' : '') +
          '<span class="bj-plaque"><span class="bj-avatar">' +
          (robot2 ? '🤖' : GG.esc(nom2.charAt(0).toUpperCase())) + '</span>' +
          '<span class="bj-pinfo"><span class="bj-pname">' + GG.esc(nom2) + '</span>' +
          '<span class="bj-pstack">' + GG.esc(st) + '</span></span></span></div>';
      }
      if (autres) html += '<div class="bj-autres">' + autres + '</div>';

      /* ---- ma place : mes cartes au-dessus de mon rond de mise ---- */
      var resultats = [];
      var mesHtml = '';
      /* l'instant où la dernière carte d'une de mes mains est posée */
      function finDe(pref, n) {
        var f = 0;
        for (var x = 0; x < n; x++) {
          var inf = T.cartes[pref + x];
          if (inf) f = Math.max(f, inf.rev || (inf.pose ? inf.t : inf.t + VOL));
        }
        return f;
      }
      function badge(o, net, mise) {
        if (o === 'bj') return ['♠ Blackjack ! +' + fmtDemi(net), 'bj-r-win bj-r-bj'];
        if (o === 'win') return ['Gagné ! +' + fmtDemi(net), 'bj-r-win'];
        if (o === 'lose') return ['Perdu · −' + fmtDemi(mise), 'bj-r-lose'];
        if (o === 'abandon') return ['Abandon · −' + fmtDemi(-net), 'bj-r-push'];
        return ['Égalité · mise rendue', 'bj-r-push'];
      }
      function spot(mise, double, cle) {
        return '<div class="bj-spot filled' + (double ? ' double' : '') + '" data-spot="' + cle + '">' +
          GG.pileJetons(mise, { classe: 'bj-pile', classeJeton: 'bj-chip' }) +
          '<span class="bj-spot-amt">' + fmtDemi(mise) + (double ? ' <i>×2</i>' : '') + '</span></div>';
      }
      function bulle(mn, t) {
        var vh = valeurMain(mn);
        var txt = vh.total > 21 ? vh.total + ' · sauté' : (vh.souple && vh.total < 21 ? (vh.total - 10) + ' / ' + vh.total : String(vh.total));
        var cls = vh.total > 21 ? ' saute' : (vh.total === 21 ? (estBlackjack(mn) ? ' bj' : ' vingtun') : '');
        if (estBlackjack(mn) && !(moi && moi.split)) txt = 'Blackjack';
        return '<div class="bj-total-moi bj-bulle' + cls + '"' + apres(t) + '>' + txt + '</div>';
      }
      if (!moi) {
        mesHtml += '<p class="bj-vide">Vous regardez la partie…</p>';
      } else if (s.phase !== 'bet' && moi.bet > 0) {
        if (moi.split) {
          mesHtml += '<div class="bj-mains2">';
          [0, 1].forEach(function (h2) {
            var mn = h2 === 1 ? moi.hand2 : moi.hand;
            var actv = s.phase === 'play' && s.turn === me && moi.hi === h2;
            var verdict = '';
            if (enResultat) {
              var lb = h2 === 1 ? badge(moi.outcome2, moi.net2, moi.bet2) : badge(moi.outcome, moi.net, moi.bet);
              verdict = '<div class="bj-result bj-apres bj-r-main ' + lb[1] + '"' + apres(finRes + h2 * 150) + '>' +
                lb[0].replace(/ · /, '<br>') + '</div>';
            }
            mesHtml += '<div class="bj-main2' + (actv ? ' actv' : '') + '">' + verdict +
              '<div class="bj-cartes bj-cartes-moi">' + mesMains[me][h2] + '</div>' +
              bulle(mn, finDe('p' + me + (h2 ? 'b' : 'a'), mn.length)) +
              spot(h2 === 1 ? moi.bet2 : moi.bet, h2 === 1 ? moi.doubled2 : moi.doubled, 'h' + h2) +
              '</div>';
          });
          mesHtml += '</div>';
        } else {
          mesHtml += '<div class="bj-cartes bj-cartes-moi">' + mesMains[me][0] + '</div>';
          mesHtml += bulle(moi.hand, finDe('p' + me + 'a', moi.hand.length));
          mesHtml += spot(moi.bet, moi.doubled, 'h0');
        }
        if (moi.assur > 0) {
          mesHtml += '<div class="bj-assur-tag">Assurance ' + moi.assur + ' 🪙</div>';
        }
        if (enResultat) {
          var l1 = badge(moi.outcome, moi.net, moi.bet);
          if (moi.split) {
            // (chaque main porte son propre verdict, posé sur ses cartes)
          } else {
            resultats.push('<div class="bj-result bj-apres ' + l1[1] + '"' + apres(finRes) + '>' + l1[0] + '</div>');
          }
          if (moi.assur > 0) {
            resultats.push('<div class="bj-result bj-apres bj-r-push bj-r-petit"' + apres(finRes + 250) + '>' +
              (estBlackjack(s.dealer) ? 'Assurance payée : +' + (moi.assur * 2) : 'Assurance perdue : −' + moi.assur) + '</div>');
          }
        }
      } else if (moi.sit || (s.phase !== 'bet' && moi.bet <= 0)) {
        mesHtml += '<p class="bj-vide">Vous passez cette manche…</p>';
      } else if (s.phase === 'bet' && moi.bet > 0) {
        mesHtml += spot(moi.bet, false, 'h0');
      } else if (s.phase === 'bet') {
        var enCours = el._bjMise || 0;
        mesHtml += '<div class="bj-spot' + (enCours > 0 ? ' filled' : '') + '" data-spot="mise">' +
          (enCours > 0 ? GG.pileJetons(enCours, { classe: 'bj-pile', classeJeton: 'bj-chip' }) + '<span class="bj-spot-amt">' + enCours + '</span>'
            : '<span class="bj-spot-lbl">MISE</span>') + '</div>';
      }
      if (resultats.length) html += '<div class="bj-resultats">' + resultats.join('') + '</div>';
      html += '</div>'; // fin du milieu
      html += '<div class="bj-me-zone">' + mesHtml + '</div>';

      html += '</div></div>'; // fin tapis + rail

      /* ===== la console, sous la table ===== */
      html += '<div class="bj-console">';
      // statistiques de la session et réglages de la table : sur le rebord, discrets
      var boutonsRebord =
        (moi && moi.stats && moi.stats.mains ? '<button class="cz-opt' + (el._bjStats ? ' on' : '') + '" id="bj-stats-btn" aria-label="Statistiques de la session">📊 ' + signe(moi.total || 0) + '</button>' : '') +
        (me === 0 && s.phase === 'bet' && !(moi && moi.bet > 0) ? '<button class="cz-opt' + (el._bjReg ? ' on' : '') + '" id="bj-reg-btn" aria-label="Réglages de la table">⚙️ Table</button>' : '');
      if (el._bjStats && moi && moi.stats && moi.stats.mains) {
        var sts = moi.stats;
        html += '<div class="bj-stats">' +
          '<span><b>' + sts.mains + '</b> mains</span>' +
          '<span><b>' + sts.gagnees + '</b> gagnées</span>' +
          '<span><b>' + sts.perdues + '</b> perdues</span>' +
          '<span><b>' + sts.egalites + '</b> égalités</span>' +
          '<span><b>' + sts.bj + '</b> blackjack' + (sts.bj > 1 ? 's' : '') + '</span>' +
          '<span>meilleur <b>' + signe(sts.meilleur) + '</b></span>' +
          '<span>bilan <b>' + signe(moi.total || 0) + '</b></span></div>';
      }
      if (el._bjReg && me === 0 && s.phase === 'bet') {
        html += '<div class="bj-reglages cz-reglages">' +
          '<button class="cz-opt' + (options.assurance ? ' on' : '') + '" id="bj-opt-assur">🛡️ Assurance</button>' +
          '<button class="cz-opt' + (options.abandon ? ' on' : '') + '" id="bj-opt-aband">🏳️ Abandon</button>' +
          '<button class="cz-opt' + (aide ? ' on' : '') + '" id="bj-opt-aide">💡 Conseils</button></div>';
      }

      var conseilCoup = null;
      if (moi && s.phase === 'bet' && !moi.sit && moi.bet <= 0) {
        if (GG.wallet && solde < MISE_MIN) {
          html += '<p class="mini-msg">Plus de jetons ! La cagnotte se recharge chaque semaine (voir la Boutique 🪙).</p>' +
            '<div class="bj-actions"><button class="btn" id="bj-sit">Passer la manche</button></div>';
        } else {
          var enCours2 = el._bjMise || 0;
          html += '<div class="bj-mises">';
          for (i = 0; i < MISES.length; i++) {
            html += '<button class="bj-chipbtn bj-bet" data-v="' + MISES[i] + '" aria-label="Ajouter ' + MISES[i] + '"' +
              (GG.wallet && solde < enCours2 + MISES[i] ? ' disabled' : '') + '>' +
              GG.jetonHtml(MISES[i], { classe: 'bj-chip' }) + '</button>';
          }
          html += '</div>';
          var derniere = el._bjDerniere || 0;
          var meme = derniere && solde >= derniere;
          // une seule rangée : effacer (ou remettre la dernière mise) | miser N
          html += '<div class="bj-compo">' +
            '<button class="btn" id="bj-effacer"' + (enCours2 ? '' : ' disabled') +
            (meme && !enCours2 ? ' style="display:none"' : '') + '>Effacer</button>' +
            (meme ? '<button class="btn" id="bj-meme"' + (enCours2 ? ' style="display:none"' : '') + '>↺ ' + derniere + '</button>' : '') +
            '<button class="btn big primary" id="bj-valider"' +
            (enCours2 > 0 ? '' : ' disabled') + '>Miser <b id="bj-compo-n">' + enCours2 + '</b> 🪙</button>' +
            '</div>';
          html += '<div class="bj-bas">' + boutonsRebord + '<button class="cz-lien bj-passe" id="bj-sit">Je passe cette manche</button>' +
            (me === 0 && s.round > 1 ? '<button class="cz-lien bj-passe" id="bj-end">' +
              (el._bjEndArm === cleManche ? '⚠️ Vraiment quitter ?' : 'Quitter') + '</button>' : '') +
            '</div><p class="mini-msg bj-msg" id="bj-msg"></p>';
        }
      } else if (moi && s.phase === 'bet' && moi.bet > 0) {
        html += '<p class="waiting">Mise posée — on attend les autres…</p>';
      } else if (s.phase === 'assurance') {
        if (moi && moi.bet > 0 && moi.assur === null) {
          var prime = Math.floor(moi.bet / 2);
          html += '<p class="bj-question">🛡️ Le croupier montre un as. <b>Assurance ?</b><small>' + prime +
            ' 🪙, payée 2 contre 1 s’il a un blackjack' + (estBlackjack(moi.hand) ? ' (avec votre blackjack : gain assuré)' : '') + '</small></p>' +
            (aide ? '<p class="bj-conseil">💡 La stratégie de base refuse toujours l’assurance.</p>' : '') +
            '<div class="bj-actions">' +
            '<button class="btn big' + (aide ? ' conseil' : '') + '" id="bj-assur-non">Non merci</button>' +
            '<button class="btn big or" id="bj-assur-oui"' + (GG.wallet && solde < prime ? ' disabled' : '') + '>Oui (' + prime + ' 🪙)</button>' +
            '</div><p class="mini-msg bj-msg" id="bj-msg"></p>';
        } else {
          html += '<p class="waiting">Le croupier attend les assurances…</p>';
        }
      } else if (s.phase === 'play') {
        if (moi && s.turn === me) {
          var mAct = mainActive(moi);
          var dblOk = peutDoubler(moi);
          var splitOk = peutSeparer(moi);
          var abOk = peutAbandonner(s, moi);
          var miseAct = moi.hi === 1 ? moi.bet2 : moi.bet;
          if (aide && s.dealer.length) {
            conseilCoup = conseil(mAct, s.dealer[0], {
              doubler: dblOk && (!GG.wallet || solde >= miseAct),
              separer: splitOk && (!GG.wallet || solde >= moi.bet), abandon: abOk
            });
          }
          var NOMS_C = { hit: 'Tirer', stand: 'Rester', double: 'Doubler', split: 'Séparer', surrender: 'Abandonner' };
          html += (moi.split ? '<p class="bj-question petit">Main ' + (moi.hi + 1) + ' sur 2</p>' : '') +
            (conseilCoup ? '<p class="bj-conseil">💡 Stratégie de base : <b>' + NOMS_C[conseilCoup] + '</b></p>' : '') +
            '<div class="bj-actions bj-jeu">' +
            '<button class="btn big' + (conseilCoup === 'hit' ? ' conseil' : '') + '" id="bj-hit">Tirer</button>' +
            '<button class="btn big' + (conseilCoup === 'stand' ? ' conseil' : '') + '" id="bj-stand">Rester</button>' +
            '</div>';
          if (dblOk || splitOk || abOk) {
            html += '<div class="bj-actions bj-jeu2">' +
              (dblOk ? '<button class="btn' + (conseilCoup === 'double' ? ' conseil' : '') + '" id="bj-double">Doubler <small>+' + miseAct + '</small></button>' : '') +
              (splitOk ? '<button class="btn' + (conseilCoup === 'split' ? ' conseil' : '') + '" id="bj-split">Séparer <small>+' + moi.bet + '</small></button>' : '') +
              (abOk ? '<button class="btn' + (conseilCoup === 'surrender' ? ' conseil' : '') + '" id="bj-surrender">Abandon <small>½</small></button>' : '') +
              '</div>';
          }
          html += '<p class="mini-msg bj-msg" id="bj-msg"></p>';
        } else if (s.turn >= 0) {
          html += '<p class="waiting">Au tour de ' + GG.esc(s.players[s.turn].name) + '…</p>';
        }
      } else if (enResultat) {
        if (me === 0) {
          var rejouable = moi && moi.bet > 0 ? (moi.doubled ? moi.bet / 2 : moi.bet) : (el._bjDerniere || 0);
          if (moi && moi.bet > 0) el._bjDerniere = rejouable;
          var peutRejouer = rejouable > 0 && (!GG.wallet || solde >= rejouable);
          html += '<div class="bj-fin bj-apres"' + apres(finRes) + '>' +
            (peutRejouer ? '<button class="btn big primary" id="bj-rejouer">↺ Rejouer ' + rejouable + '</button>' : '') +
            '<button class="btn big' + (peutRejouer ? '' : ' primary') + '" id="bj-again">' + (peutRejouer ? 'Autre mise' : 'Manche suivante') + '</button>' +
            '</div>' +
            '<div class="bj-bas">' + boutonsRebord + '<button class="cz-lien bj-passe" id="bj-end">' +
            (el._bjEndArm === cleManche ? '⚠️ Vraiment quitter la table ?' : 'Quitter la table') + '</button></div>';
        } else {
          html += '<p class="waiting">' + GG.esc(s.players[0].name) + ' relance…</p>' +
            (boutonsRebord ? '<div class="bj-bas">' + boutonsRebord + '</div>' : '');
        }
      }
      html += '</div></div>';

      el.innerHTML = html;
      T.curseur = curseur;

      /* ---- après l'affichage : vols de cartes, sons, célébrations ---- */
      var sabot = el.querySelector('.bj-sabot-boite');
      vols.forEach(function (v) {
        var attente = Math.max(0, v.t - Date.now());
        setTimeout(function () {
          var cible = el.querySelector('[data-k="' + v.k + '"]');
          if (!cible || !sabot) return;
          var w = cible.offsetWidth || 50;
          fx.flyTo(sabot, cible, {
            html: '<span class="jc dos" style="--jcw:' + w + 'px"><span class="jc-dos-motif"></span></span>',
            duration: VOL, arc: 0.12, rotate: -8
          });
          sfx.play('deal', { volume: 0.7 });
        }, attente);
      });
      // la carte cachée du croupier se retourne, puis il tire en suspense
      if (T.cartes.c1 && T.cartes.c1.rev && !T.fait.rev) {
        T.fait.rev = true;
        setTimeout(function () { sfx.play('flip'); }, Math.max(0, T.cartes.c1.rev - Date.now()));
      }
      // mes 21 et blackjacks, fêtés une fois
      if (moi && moi.bet > 0) {
        [0, 1].forEach(function (h2) {
          var mn = h2 === 1 ? moi.hand2 : moi.hand;
          if (h2 === 1 && !moi.split) return;
          var v2 = valeurMain(mn).total;
          var cleF = 'f' + h2 + ':' + mn.length;
          if (T.fait[cleF]) return;
          T.fait[cleF] = true;
          var quand = Math.max(0, finCartes - Date.now());
          if (v2 === 21 && estBlackjack(mn) && !moi.split) {
            setTimeout(function () {
              var b = el.querySelector('.bj-me-zone .bj-bulle');
              fx.floatText(b || el, 'Blackjack !', { color: '#ffd34d', size: 34 });
              fx.burst(b || el, { count: 26, shape: 'star', colors: ['#ffd34d', '#fff3b0', '#ff9f1c'] });
              sfx.play('fanfare');
              GG.haptic('success');
            }, quand);
          } else if (v2 === 21 && mn.length > 2) {
            setTimeout(function () {
              var bs = el.querySelectorAll('.bj-me-zone .bj-bulle');
              var b = bs[h2] || bs[0];
              fx.floatText(b || el, '21 !', { color: '#7dffb0', size: 32 });
              fx.burst(b || el, { count: 16, shape: 'spark', colors: ['#7dffb0', '#ffffff'] });
              sfx.play('combo', { level: 5 });
              GG.haptic('medium');
            }, quand);
          } else if (v2 > 21) {
            setTimeout(function () {
              var bs = el.querySelectorAll('.bj-me-zone .bj-bulle');
              var b = bs[h2] || bs[0];
              if (b) fx.shake(b, 1.2);
              sfx.play('hit');
              GG.haptic('error');
            }, quand);
          }
        });
      }
      // le verdict : jetons qui filent, compteur de la cagnotte qui défile
      if (enResultat && moi && moi.bet > 0 && !T.fait.res) {
        T.fait.res = true;
        var quandR = Math.max(0, finRes - Date.now());
        var soldeDepart = el._bjSoldeVu !== undefined ? el._bjSoldeVu : soldeAvant;
        setTimeout(function () {
          var zone = el.querySelector('.bj-me-zone');
          var banque = el.querySelector('.bj-dealer');
          var gain = moi.bilan || 0;
          if (moi.outcome === 'bj') { sfx.play('coin'); }
          else if (gain > 0) { sfx.play('success'); }
          else if (gain < 0) { sfx.play('wrong', { volume: 0.7 }); }
          else { sfx.play('tock'); }
          if (gain > 0) {
            GG.haptic('success');
            for (var k = 0; k < Math.min(6, 2 + Math.floor(gain / 25)); k++) {
              (function (k2) {
                setTimeout(function () {
                  var spotEl = el.querySelector('.bj-spot');
                  if (banque && spotEl) {
                    fx.flyTo(banque, spotEl, { html: GG.jetonHtml(k2 % 2 ? 25 : 5, {}), duration: 480, arc: 0.3 });
                  }
                  if (k2 === 0) sfx.play('chips');
                }, k2 * 70);
              })(k);
            }
            var cible = zone && zone.querySelector('.bj-spot');
            if (cible) setTimeout(function () { fx.floatText(cible, '+' + fmtDemi(gain), { color: '#ffd34d', size: 26 }); }, 380);
            if (moi.outcome === 'bj' || moi.outcome2 === 'win' && moi.outcome === 'win') {
              fx.confetti({ count: 60, from: 'center' });
            }
          } else if (gain < 0) {
            GG.haptic('warning');
            var spots = el.querySelectorAll('.bj-spot');
            for (var z = 0; z < spots.length && banque; z++) {
              fx.flyTo(spots[z], banque, { html: GG.pileJetons(Math.min(125, -gain), { classe: 'bj-pile' }), duration: 520, arc: 0.2, scaleTo: 0.6 });
            }
          }
          el._bjSoldeVu = undefined;
          var sEl = el.querySelector('#bj-solde');
          if (sEl && GG.wallet) {
            var fin = GG.wallet.get();
            fx.countUp(sEl, soldeDepart, fin, 900, function (n) { return GG.wallet.fmt(n); });
          }
        }, quandR);
      } else if (!enResultat) {
        el._bjSoldeVu = undefined;
      }

      /* ---- gel des boutons : transition, ou cartes encore en vol ---- */
      var gelFin = Math.max(el._bjGelFin || 0, T.curseur > now ? T.curseur : 0,
        enResultat ? finRes : 0);
      if (gelFin > now) {
        var aGeler = el.querySelectorAll('.bj-console button');
        for (i = 0; i < aGeler.length; i++) {
          if (!aGeler[i].disabled && !/^bj-(stats|reg)-btn$/.test(aGeler[i].id)) {
            aGeler[i].disabled = true;
            aGeler[i].setAttribute('data-gel', '1');
          }
        }
        var cleGel = cleCtx;
        setTimeout(function () {
          if (el._bjCtxCle !== cleGel) return; // un autre contexte a pris la main
          var reveil = el.querySelectorAll('.bj-console button[data-gel]');
          for (var b2 = 0; b2 < reveil.length; b2++) {
            reveil[b2].disabled = false;
            reveil[b2].removeAttribute('data-gel');
          }
        }, gelFin - now + 20);
      }

      /* ---- les gestes ---- */
      function msg(txt) {
        var m = el.querySelector('#bj-msg');
        if (m) m.textContent = txt;
        sfx.play('wrong', { volume: 0.5 });
      }
      function on(id, fn) {
        var b = el.querySelector('#' + id);
        if (b) b.addEventListener('click', fn);
      }
      function agir(a, besoin) {
        if (el._bjActed) return false;
        if (besoin && GG.wallet && GG.wallet.get() < besoin) { msg('Pas assez de jetons !'); return false; }
        el._bjActed = true;
        if (ctx.act(a) === false) { el._bjActed = false; return false; }
        return true;
      }

      /* Composer sa mise : chaque jeton tombe dans le rond, rien n'est
         débité tant qu'on n'a pas validé. */
      function majCompo(sansRond) {
        var n = el._bjMise || 0;
        var lbl = el.querySelector('#bj-compo-n');
        var val = el.querySelector('#bj-valider');
        var eff = el.querySelector('#bj-effacer');
        var meme = el.querySelector('#bj-meme');
        var dispo = GG.wallet ? GG.wallet.get() : Infinity;
        if (lbl) lbl.textContent = n;
        if (val) val.disabled = n <= 0;
        if (eff) { eff.disabled = n <= 0; eff.style.display = (meme && !n) ? 'none' : ''; }
        if (meme) meme.style.display = n ? 'none' : '';
        el.querySelectorAll('.bj-bet').forEach(function (b) {
          b.disabled = dispo < n + parseInt(b.getAttribute('data-v'), 10) || n + parseInt(b.getAttribute('data-v'), 10) > MISE_MAX;
        });
        var spotEl = el.querySelector('.bj-spot');
        if (spotEl && s.phase === 'bet' && !sansRond) {
          spotEl.className = 'bj-spot' + (n > 0 ? ' filled' : '');
          spotEl.innerHTML = n > 0
            ? GG.pileJetons(n, { classe: 'bj-pile', classeJeton: 'bj-chip' }) + '<span class="bj-spot-amt">' + n + '</span>'
            : '<span class="bj-spot-lbl">MISE</span>';
        }
      }

      el.querySelectorAll('.bj-bet').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var v = parseInt(btn.getAttribute('data-v'), 10);
          var dispo = GG.wallet ? GG.wallet.get() : Infinity;
          if (dispo < (el._bjMise || 0) + v) { msg('Pas assez de jetons !'); return; }
          if ((el._bjMise || 0) + v > MISE_MAX) { msg('Mise maximale : ' + MISE_MAX + '.'); return; }
          el._bjMise = (el._bjMise || 0) + v;
          var chip = btn.querySelector('.gg-jeton');
          var spotEl = el.querySelector('.bj-spot');
          if (chip && spotEl) fx.flyTo(chip, spotEl, { duration: 300, arc: 0.3, scaleTo: 0.65 });
          sfx.play('chip', { pitch: 1 + Math.min(0.3, (el._bjMise % 7) * 0.04) });
          GG.haptic('light');
          majCompo(true);
          // le jeton se pose dans le rond à la fin de son vol
          setTimeout(function () { if ((el._bjMise || 0) > 0) majCompo(); }, 260);
        });
      });
      on('bj-effacer', function () { el._bjMise = 0; majCompo(); sfx.play('erase'); });
      on('bj-meme', function () { el._bjMise = el._bjDerniere || 0; majCompo(); sfx.play('chips'); });
      on('bj-valider', function () {
        var n = el._bjMise || 0;
        if (n <= 0) return;
        if (agir({ t: 'bet', v: n }, n)) {
          el._bjDerniere = n;
          sfx.play('chips');
          GG.haptic('medium');
        }
      });
      on('bj-sit', function () { agir({ t: 'sit' }); });
      on('bj-hit', function () { agir({ t: 'hit' }); });
      on('bj-stand', function () { if (agir({ t: 'stand' })) sfx.play('tock', { volume: 0.6 }); });
      on('bj-double', function () {
        if (agir({ t: 'double' }, moi.hi === 1 ? moi.bet2 : moi.bet)) { sfx.play('chips'); GG.haptic('medium'); }
      });
      on('bj-split', function () {
        if (agir({ t: 'split' }, moi.bet)) { sfx.play('swap'); GG.haptic('medium'); }
      });
      on('bj-surrender', function () { if (agir({ t: 'surrender' })) sfx.play('back'); });
      on('bj-assur-oui', function () { if (agir({ t: 'assur', oui: true }, Math.floor(moi.bet / 2))) sfx.play('chip'); });
      on('bj-assur-non', function () { agir({ t: 'assur', oui: false }); });
      on('bj-rejouer', function () {
        var n = el._bjDerniere || 0;
        if (n > 0 && agir({ t: 'again', mise: n }, n)) { el._bjEndArm = null; sfx.play('chips'); }
      });
      on('bj-again', function () { el._bjEndArm = null; agir({ t: 'again' }); });
      on('bj-stats-btn', function () { el._bjStats = !el._bjStats; sfx.play('toggle'); mod.render(el, ctx); });
      on('bj-reg-btn', function () { el._bjReg = !el._bjReg; sfx.play('toggle'); mod.render(el, ctx); });
      on('bj-opt-assur', function () { agir({ t: 'options', assurance: !options.assurance, abandon: options.abandon }); });
      on('bj-opt-aband', function () { agir({ t: 'options', assurance: options.assurance, abandon: !options.abandon }); });
      on('bj-opt-aide', function () { ecrireAide(!aide); sfx.play('toggle'); mod.render(el, ctx); });
      // quitter la table demande une confirmation (fini les départs par mégarde)
      on('bj-end', function () {
        if (el._bjEndArm === cleManche) {
          // un double-appui ne doit pas confirmer ce qu'il vient d'armer
          if (Date.now() - (el._bjEndT || 0) < 300) return;
          el._bjEndArm = null;
          agir({ t: 'end' });
        } else {
          el._bjEndArm = cleManche;
          el._bjEndT = Date.now();
          mod.render(el, ctx);
        }
      });
    },

    /* exposés pour les tests et les simulations */
    _conseil: conseil,
    _valeurMain: valeurMain,
    _valeurCarte: valeurCarte,
    _regler: regler,
    MISE_MAX: MISE_MAX
  };

  /* l'aide « stratégie de base » : un réglage de CE téléphone */
  function lireAide() {
    try { return localStorage.getItem('gg-bj-aide') === '1'; } catch (e) { return false; }
  }
  function ecrireAide(v) {
    try { localStorage.setItem('gg-bj-aide', v ? '1' : '0'); } catch (e) {}
  }

  GG.register(mod);
  if (typeof module === 'object' && module.exports) module.exports = mod;
})(typeof self !== 'undefined' ? self : globalThis);
