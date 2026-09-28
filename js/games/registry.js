/*
 * GGgames — registre des jeux.
 * Chaque module de jeu s'enregistre ici et expose :
 *   id, nom, icone, desc, regles — catalogue et règles
 *   min, max                    — nombre de joueurs
 *   hotseat                     — jouable à plusieurs sur un seul téléphone
 *   hidden                      — informations cachées (écran « passez le téléphone »)
 *   netOnly                     — uniquement en réseau (infos secrètes simultanées)
 *   create(names, ctx)          — état initial ; ctx = {dict}
 *   turnOf(state)               — joueur dont c'est le tour (-1 : simultané)
 *   apply(state, player, action, ctx) — applique et VALIDE une action (autorité)
 *       renvoie {ok, error?, timer?:{ms, action}}
 *   over(state)                 — partie terminée ?
 *   summary(state)              — HTML du récapitulatif final
 *   gagnants(state)             — (V2, conseillé) indices des gagnants, [] = égalité ;
 *                                 'tous' pour une victoire collective, null = défaite collective
 *   scoreOf(state, i)           — score affiché dans le bandeau
 *   redact(state, viewer)       — copie sans les secrets des autres (optionnel)
 *   bot(state, i, ctx)          — action de l'IA pour le joueur i (optionnel)
 *   render(el, ctx)             — ctx = {state, me, act(a), canAct, mode}
 *
 * Les effets (GG.fx, GG.sfx, GG.haptic, GG.reglages) sont remplacés par
 * js/fx.js et js/sfx.js dans le navigateur. Les versions « muettes »
 * ci-dessous garantissent qu'un appel ne plante jamais : dans Node (tests),
 * ou si un de ces fichiers n'a pas pu se charger.
 */
(function (root) {
  'use strict';
  function rien() { return typeof Promise !== 'undefined' ? Promise.resolve() : undefined; }
  var muet = new Proxy({}, { get: function () { return rien; } });
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
    /* Échappe TOUT ce qui pourrait sortir d'un texte ou d'un attribut HTML :
       les guillemets aussi (un prénom comme a" onclick="… ne doit rien créer). */
    esc: function (s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },
    /* « de » ou « d’ » devant un prénom : « Au tour d’Alice », « de Marc ».
       Accepte le prénom brut ou déjà échappé (la première lettre ne change pas). */
    de: function (nom) {
      return /^[aeiouyàâäéèêëîïôöùûüœæ]/i.test(String(nom == null ? '' : nom).trim()) ? 'd’' : 'de ';
    },
    fx: muet,
    sfx: muet,
    haptic: rien,
    reglages: { get: function () { return undefined; }, set: rien, tout: function () { return {}; } }
  };
})(typeof self !== 'undefined' ? self : globalThis);
