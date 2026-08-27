/*
 * GGgames — Cagnotte de jetons (par téléphone).
 * Une réserve de jetons commune au Poker et au Blackjack, conservée sur
 * l'appareil. Elle démarre à 10 000 jetons et se recharge automatiquement
 * chaque semaine (jamais au-dessus du plancher : les gains se gardent).
 */
(function (root) {
  'use strict';
  var GG = root.GG;
  var KEY = 'gg-jetons';
  var START = 10000;      // cagnotte de départ et plancher de recharge
  var WEEK = 7 * 24 * 3600 * 1000;

  function load() {
    try {
      var d = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (d && typeof d.n === 'number' && typeof d.ts === 'number') return d;
    } catch (e) {}
    return { n: START, ts: Date.now() };
  }

  function save(d) {
    try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {}
  }

  /* Recharge hebdomadaire : si la dernière recharge date d'au moins 7 jours
     et que la cagnotte est sous le plancher, elle remonte à 10 000. */
  function refill(d) {
    var changed = false;
    while (Date.now() - d.ts >= WEEK) {
      d.ts += WEEK;
      if (d.n < START) { d.n = START; changed = true; }
    }
    return changed;
  }

  var wallet = {
    START: START,

    get: function () {
      var d = load();
      if (refill(d)) save(d);
      else save(d); // persiste aussi l'avancement de l'horloge
      return d.n;
    },

    /* Débite si possible ; renvoie false si la cagnotte est insuffisante. */
    spend: function (n) {
      n = Math.floor(n);
      if (!(n > 0)) return false;
      var d = load();
      refill(d);
      if (d.n < n) { save(d); return false; }
      d.n -= n;
      save(d);
      wallet._notify();
      return true;
    },

    add: function (n) {
      n = Math.floor(n);
      if (!(n > 0)) return;
      var d = load();
      refill(d);
      d.n += n;
      save(d);
      wallet._notify();
    },

    /* Prochaine recharge : millisecondes restantes (0 si déjà éligible). */
    nextRefillMs: function () {
      var d = load();
      refill(d);
      save(d);
      return Math.max(0, d.ts + WEEK - Date.now());
    },

    fmt: function (n) {
      if (n === undefined) n = wallet.get();
      return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    },

    /* Les écrans (accueil, boutique) s'abonnent pour rester à jour. */
    _subs: [],
    onChange: function (fn) { wallet._subs.push(fn); },
    _notify: function () {
      wallet._subs.forEach(function (fn) { try { fn(); } catch (e) {} });
    }
  };

  GG.wallet = wallet;
  if (typeof module === 'object' && module.exports) module.exports = wallet;
})(typeof self !== 'undefined' ? self : globalThis);
