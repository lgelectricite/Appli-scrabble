/*
 * GGgames — registre des jeux.
 * Chaque module de jeu s'enregistre ici et expose :
 *   id, nom, icone, desc        — catalogue
 *   min, max                    — nombre de joueurs
 *   hotseat                     — jouable à plusieurs sur un seul téléphone
 *   hidden                      — informations cachées (écran « passez le téléphone »)
 *   netOnly                     — uniquement en réseau (infos secrètes simultanées)
 *   create(names, ctx)          — état initial ; ctx = {dict}
 *   turnOf(state)               — joueur dont c'est le tour (-1 : simultané)
 *   apply(state, player, action, ctx) — applique et VALIDE une action (autorité)
 *       renvoie {ok, error?, timer?:{ms, action}}
 *   over(state)                 — partie terminée ?
 *   summary(state)              — HTML du récapitulatif final
 *   scoreOf(state, i)           — score affiché dans le bandeau
 *   redact(state, viewer)       — copie sans les secrets des autres (optionnel)
 *   render(el, ctx)             — ctx = {state, me, act(a), canAct, mode}
 */
(function (root) {
  'use strict';
  root.GG = {
    list: [],
    byId: {},
    register: function (mod) {
      this.list.push(mod);
      this.byId[mod.id] = mod;
    },
    /* petit utilitaire partagé : copie profonde JSON */
    clone: function (o) { return JSON.parse(JSON.stringify(o)); },
    shuffle: function (a) {
      for (var i = a.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = a[i]; a[i] = a[j]; a[j] = t;
      }
      return a;
    },
    esc: function (s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
  };
})(typeof self !== 'undefined' ? self : globalThis);
