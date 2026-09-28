/*
 * GGgames — Words : l'adversaire IA dans un Web Worker.
 *
 * Le calcul ne se fait plus sur le fil principal : l'écran reste fluide
 * (animations, défilement, boutons) pendant que l'IA réfléchit. Le
 * dictionnaire et son arbre des préfixes sont construits UNE fois, au
 * premier message, puis gardés en mémoire pour toute la session.
 *
 * Messages reçus :  {id, type: 'init'}
 *                   {id, type: 'coup',  state, joueur, niveau}
 *                   {id, type: 'coach', state, joueur}
 * Réponses :        {id, type: 'pret'} | {id, type: 'coup', action, ms}
 *                   {id, type: 'coach', coup, ms} | {id, type: 'erreur', message}
 * (Le fil principal se replie sur son propre calcul si ce fichier manque.)
 */
/* global importScripts, AI, Scrabble */
importScripts('scrabble.js', 'ai.js');

var dict = null;
var pret = null;

function texte(url, obligatoire) {
  return fetch(url).then(function (r) {
    if (!r.ok) {
      if (obligatoire) throw new Error('HTTP ' + r.status + ' pour ' + url);
      return '';
    }
    return r.text();
  });
}

function charge() {
  if (pret) return pret;
  pret = texte('../data/mots.txt', true).then(function (t) {
    dict = AI.buildDict(t);
    AI.prepare(dict);
    // mots courants (niveaux facile et moyen) : facultatifs
    return texte('../data/mots-courants.txt', false).catch(function () { return ''; });
  }).then(function (t) {
    if (t) AI.chargeCourants(dict, t);
    return dict;
  });
  pret.catch(function () { pret = null; });
  return pret;
}

self.onmessage = function (e) {
  var m = e.data || {};
  charge().then(function () {
    var t0 = Date.now();
    if (m.type === 'coup') {
      var action = AI.chooseAction(Scrabble, m.state, m.joueur, dict, m.niveau);
      self.postMessage({ id: m.id, type: 'coup', action: action, ms: Date.now() - t0 });
    } else if (m.type === 'coach') {
      var coup = AI.meilleurCoup(Scrabble, m.state, m.joueur, dict);
      self.postMessage({ id: m.id, type: 'coach', coup: coup, ms: Date.now() - t0 });
    } else {
      self.postMessage({ id: m.id, type: 'pret' });
    }
  }).catch(function (err) {
    self.postMessage({ id: m.id, type: 'erreur', message: String((err && err.message) || err) });
  });
};
