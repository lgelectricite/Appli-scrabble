/*
 * GGgames — des cartes à jouer lisibles d'un coup d'œil, comme dans les
 * applications de poker.
 *
 * Sur un téléphone, une carte fait 30 à 65 pixels de large : les dispositions
 * de symboles des cartes papier (dix petits ♠ pour un 10) y deviennent une
 * bouillie illisible. On fait comme les applications de poker (« grand
 * index ») : le RANG en très gros dans le coin, la COULEUR juste dessous, et
 * un grand symbole qui occupe le reste de la carte. Les symboles sont dessinés
 * en SVG : nets à toutes les tailles, identiques sur tous les téléphones.
 *
 *   GG.carte(rang, couleur, options)   rang 0..12 (2 → As), couleur 0..3
 *   GG.carteDos(options)               le dos rouge
 *
 * options : { taille: 'mini'|'grande', classe: '…' }
 * La largeur se règle en CSS par la variable --jcw ; tout le reste suit.
 */
(function (root) {
  'use strict';
  var GG = root.GG || (root.GG = {});

  var RANGS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'V', 'D', 'R', 'A'];
  var NOMS = ['Deux', 'Trois', 'Quatre', 'Cinq', 'Six', 'Sept', 'Huit', 'Neuf',
    'Dix', 'Valet', 'Dame', 'Roi', 'As'];
  var SYMBOLES = ['♠', '♥', '♦', '♣'];
  var COULEURS = ['pique', 'cœur', 'carreau', 'trèfle'];

  /* Les quatre symboles, dessinés dans un carré 100 × 100. */
  var DESSINS = [
    // pique : un cœur renversé et son pied
    '<path d="M50 4C60 20 95 38 95 61c0 14-10 22-21 22-9 0-16-5-19-11 1 11 5 19 13 24H32' +
      'c8-5 12-13 13-24-3 6-10 11-19 11C15 83 5 75 5 61 5 38 40 20 50 4z"/>',
    // cœur
    '<path d="M50 91C21 67 4 50 4 31 4 16 15 6 28 6c10 0 18 6 22 15 4-9 12-15 22-15 13 0 24 10' +
      ' 24 25 0 19-17 36-46 60z"/>',
    // carreau : un losange aux côtés légèrement creusés
    '<path d="M50 3Q66 30 89 50 66 70 50 97 34 70 11 50 34 30 50 3z"/>',
    // trèfle : trois feuilles rondes et un pied
    '<circle cx="50" cy="27" r="20"/><circle cx="26" cy="58" r="20"/>' +
      '<circle cx="74" cy="58" r="20"/><path d="M40 44h20l-4 18h-12z"/>' +
      '<path d="M47 60c0 16-5 28-14 36h34c-9-8-14-20-14-36z"/>'
  ];

  function symbole(couleur, classe) {
    return '<svg class="' + classe + '" viewBox="0 0 100 100" aria-hidden="true" ' +
      'focusable="false">' + (DESSINS[couleur] || DESSINS[0]) + '</svg>';
  }

  GG.carte = function (rang, couleur, o) {
    o = o || {};
    var r = RANGS[rang] || '?';
    var rouge = couleur === 1 || couleur === 2;
    var figure = rang >= 9 && rang <= 11; // valet, dame, roi
    return '<span class="jc' + (rouge ? ' rouge' : '') + (figure ? ' fig' : '') +
      (o.taille ? ' ' + o.taille : '') + (o.classe ? ' ' + o.classe : '') +
      '" role="img" aria-label="' + (NOMS[rang] || r) + ' de ' + (COULEURS[couleur] || '') + '">' +
      '<span class="jc-i"><b' + (r === '10' ? ' class="dix"' : '') + '>' + r + '</b>' +
      symbole(couleur, 'jc-p') + '</span>' +
      symbole(couleur, 'jc-g') +
      '</span>';
  };

  GG.carteDos = function (o) {
    o = o || {};
    return '<span class="jc dos' + (o.taille ? ' ' + o.taille : '') +
      (o.classe ? ' ' + o.classe : '') + '" role="img" aria-label="carte face cachée">' +
      '<span class="jc-dos-motif"></span></span>';
  };

  GG._RANGS = RANGS;
  GG._SYMBOLES = SYMBOLES;

  if (typeof module === 'object' && module.exports) {
    module.exports = { carte: GG.carte, carteDos: GG.carteDos };
  }
})(typeof self !== 'undefined' ? self : globalThis);
