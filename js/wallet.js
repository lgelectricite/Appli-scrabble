/*
 * GGgames — Cagnotte de jetons (par téléphone).
 * Une réserve de jetons commune au Poker et au Blackjack, conservée sur
 * l'appareil. Elle démarre à 10 000 jetons et se recharge automatiquement
 * chaque semaine (jamais au-dessus du plancher : les gains se gardent).
 *
 * V2 — une cagnotte qui ne se laisse plus berner :
 *  - l'horloge du téléphone n'est plus crue sur parole. On mémorise le
 *    dernier instant vu (« vu ») : si l'heure recule, le temps de la cagnotte
 *    s'arrête (il ne repart qu'une fois l'horloge revenue au-delà) ; si elle
 *    fait un bond en avant pendant que l'appli est ouverte (mesuré avec
 *    l'horloge monotone du navigateur), le bond est ignoré. Une recharge
 *    n'est donc accordée qu'une fois par semaine réellement écoulée ;
 *    avancer l'heure de 7 jours, recharger, revenir en arrière et
 *    recommencer ne marche plus ;
 *  - un plafond (1 000 000) : une valeur absurde (5 milliards) est ramenée
 *    au plafond, un gain au-delà est écrêté ;
 *  - les demi-jetons existent : le blackjack paie 3 contre 2 au demi-jeton
 *    près (une mise de 5 rapporte 7,5). La cagnotte garde le demi, et deux
 *    demis font un jeton. get() rend le nombre de jetons entiers.
 */
(function (root) {
  'use strict';
  var GG = root.GG;
  var KEY = 'gg-jetons';
  var START = 10000;      // cagnotte de départ et plancher de recharge
  var PLAFOND = 1000000;  // jamais plus d'un million de jetons
  var WEEK = 7 * 24 * 3600 * 1000;
  var TOLERANCE = 5 * 60 * 1000; // écart admis entre l'horloge murale et l'horloge monotone

  /* Horloge monotone de la session : un bond de l'heure du téléphone
     pendant que l'appli est ouverte ne compte pas. */
  var session = null;
  function perf() {
    try {
      if (typeof performance !== 'undefined' && performance.now) return performance.now();
    } catch (e) {}
    return null;
  }
  function maintenant() {
    var mur = Date.now();
    var p = perf();
    if (p === null) return mur;
    if (!session) { session = { mur: mur, perf: p }; return mur; }
    var attendu = session.mur + (p - session.perf);
    // bond en avant pendant la session : on s'en tient au temps écoulé réel
    if (mur > attendu + TOLERANCE) return attendu;
    return mur;
  }

  function entier(n) { return typeof n === 'number' && isFinite(n) ? Math.floor(n) : NaN; }

  function load() {
    var d = null;
    try { d = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { d = null; }
    var now = maintenant();
    if (!d || typeof d !== 'object' || !isFinite(entier(d.n)) || !isFinite(entier(d.ts))) {
      return { n: START, ts: now, vu: now, demi: 0 };
    }
    var n = entier(d.n);
    if (n < 0) n = 0;
    if (n > PLAFOND) n = PLAFOND;
    var ts = entier(d.ts);
    var vu = isFinite(entier(d.vu)) ? entier(d.vu) : Math.max(ts, now);
    if (vu < ts) vu = ts; // un ancrage de recharge « dans le futur » fige le temps
    return { n: n, ts: ts, vu: vu, demi: d.demi === 1 && n < PLAFOND ? 1 : 0 };
  }

  function save(d) {
    try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {}
  }

  /* Le temps de la cagnotte n'avance que vers l'avant : l'instant « vu »
     est le plus grand instant jamais observé. */
  function avancer(d) {
    var now = maintenant();
    if (now > d.vu) d.vu = now;
  }

  /* Recharge hebdomadaire : une par semaine écoulée depuis la dernière
     recharge (sur le temps « vu »), et seulement si la cagnotte est sous le
     plancher — elle remonte alors à 10 000. */
  function refill(d) {
    avancer(d);
    var changed = false;
    if (d.vu - d.ts >= WEEK) {
      // plusieurs semaines d'absence ne valent qu'une recharge
      d.ts += Math.floor((d.vu - d.ts) / WEEK) * WEEK;
      if (d.n < START) { d.n = START; d.demi = 0; changed = true; }
    }
    return changed;
  }

  /* Ajuste la cagnotte d'un montant (multiple de ½), borné à [0, PLAFOND]. */
  function ajuster(d, x) {
    var demis = d.n * 2 + d.demi + Math.round(x * 2);
    if (demis < 0) demis = 0;
    if (demis > PLAFOND * 2) demis = PLAFOND * 2;
    d.n = Math.floor(demis / 2);
    d.demi = demis % 2;
  }

  var wallet = {
    START: START,
    PLAFOND: PLAFOND,

    get: function () {
      var d = load();
      refill(d);
      save(d); // persiste aussi l'instant vu
      return d.n;
    },

    /* Un demi-jeton en réserve ? (payé au blackjack, complété au prochain demi) */
    demi: function () {
      var d = load();
      return d.demi === 1;
    },

    /* Débite si possible ; renvoie false si la cagnotte est insuffisante. */
    spend: function (n) {
      n = Math.floor(n);
      if (!(n > 0)) return false;
      var d = load();
      refill(d);
      if (d.n < n) { save(d); return false; }
      ajuster(d, -n);
      save(d);
      wallet._notify();
      return true;
    },

    /* Crédite n jetons (demi-jetons compris : 7,5 → 7 + un demi en réserve). */
    add: function (n) {
      if (typeof n !== 'number' || !isFinite(n)) return;
      n = Math.floor(n * 2) / 2;
      if (!(n > 0)) return;
      var d = load();
      refill(d);
      ajuster(d, n);
      save(d);
      wallet._notify();
    },

    /* Reprend n jetons (demis compris) même si la cagnotte ne suffit pas :
       elle s'arrête alors à zéro. Sert à annuler un crédit (partie reprise
       dans un état antérieur). */
    retire: function (n) {
      if (typeof n !== 'number' || !isFinite(n)) return;
      n = Math.ceil(n * 2) / 2;
      if (!(n > 0)) return;
      var d = load();
      refill(d);
      ajuster(d, -n);
      save(d);
      wallet._notify();
    },

    /* Prochaine recharge : millisecondes restantes (0 si déjà éligible). */
    nextRefillMs: function () {
      var d = load();
      refill(d);
      save(d);
      return Math.max(0, d.ts + WEEK - d.vu);
    },

    fmt: function (n) {
      if (n === undefined) n = wallet.get();
      return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202F');
    },

    /* Les écrans (accueil, boutique) s'abonnent pour rester à jour. */
    _subs: [],
    onChange: function (fn) { wallet._subs.push(fn); },
    _notify: function () {
      wallet._subs.forEach(function (fn) { try { fn(); } catch (e) {} });
    },
    /* pour les tests : oublier l'horloge monotone de la session */
    _resetSession: function () { session = null; }
  };

  GG.wallet = wallet;
  if (typeof module === 'object' && module.exports) module.exports = wallet;
})(typeof self !== 'undefined' ? self : globalThis);
