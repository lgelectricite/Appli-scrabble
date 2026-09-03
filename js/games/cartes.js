/*
 * GGgames — de vraies cartes à jouer, dessinées en CSS.
 *
 * Une carte, ce n'est pas un carré avec « A♠ » écrit dedans : c'est un
 * rectangle au format 5/7, avec ses index dans deux coins opposés (celui du
 * bas retourné, comme sur les vraies) et ses figures au centre — la bonne
 * disposition de symboles pour chaque valeur, dont la moitié à l'envers.
 *
 *   GG.carte(rang, couleur, options)   rang 0..12 (2 → As), couleur 0..3
 *   GG.carteDos(options)               le dos rouge quadrillé
 *
 * options : { taille: 'mini'|'grande', classe: '…' }
 */
(function (root) {
  'use strict';
  var GG = root.GG || (root.GG = {});

  var RANGS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'V', 'D', 'R', 'A'];
  var SYMBOLES = ['♠', '♥', '♦', '♣'];

  /* Disposition officielle des symboles, en colonnes (gauche, centre, droite).
     Chaque valeur est une position verticale de 0 (haut) à 1 (bas) ; au-delà
     de 0.5, le symbole est retourné, comme sur une vraie carte. */
  var PIPS = {
    2:  { c: [0, 1] },
    3:  { c: [0, 0.5, 1] },
    4:  { g: [0, 1], d: [0, 1] },
    5:  { g: [0, 1], d: [0, 1], c: [0.5] },
    6:  { g: [0, 0.5, 1], d: [0, 0.5, 1] },
    7:  { g: [0, 0.5, 1], d: [0, 0.5, 1], c: [0.25] },
    8:  { g: [0, 0.5, 1], d: [0, 0.5, 1], c: [0.25, 0.75] },
    9:  { g: [0, 0.34, 0.67, 1], d: [0, 0.34, 0.67, 1], c: [0.5] },
    10: { g: [0, 0.34, 0.67, 1], d: [0, 0.34, 0.67, 1], c: [0.17, 0.83] }
  };

  /* Les figures : une initiale ornée, dans les deux sens comme au jeu. */
  var FIGURES = { 9: 'V', 10: 'D', 11: 'R' };

  function pipsHtml(n, sym) {
    var plan = PIPS[n];
    if (!plan) return '';
    var out = '';
    ['g', 'c', 'd'].forEach(function (col) {
      if (!plan[col]) return;
      out += '<span class="jc-col jc-' + col + '">';
      plan[col].forEach(function (y) {
        out += '<span class="jc-pip' + (y > 0.5 ? ' bas' : '') +
          '" style="top:' + (y * 100) + '%">' + sym + '</span>';
      });
      out += '</span>';
    });
    return out;
  }

  function centre(rang, sym) {
    if (rang === 12) return '<span class="jc-as">' + sym + '</span>';       // As
    if (FIGURES[rang]) {
      return '<span class="jc-fig">' +
        '<span class="jc-fig-l">' + FIGURES[rang] + '</span>' +
        '<span class="jc-fig-s">' + sym + '</span>' +
        '</span>';
    }
    return pipsHtml(parseInt(RANGS[rang], 10), sym);
  }

  GG.carte = function (rang, couleur, o) {
    o = o || {};
    var r = RANGS[rang] || '?';
    var sym = SYMBOLES[couleur] || '♠';
    var rouge = couleur === 1 || couleur === 2;
    return '<span class="jc' + (rouge ? ' rouge' : '') +
      (o.taille ? ' ' + o.taille : '') + (o.classe ? ' ' + o.classe : '') +
      '" aria-label="' + r + ' de ' +
      ['pique', 'cœur', 'carreau', 'trèfle'][couleur] + '">' +
      '<span class="jc-coin haut"><b>' + r + '</b><i>' + sym + '</i></span>' +
      '<span class="jc-centre">' + centre(rang, sym) + '</span>' +
      '<span class="jc-coin bas"><b>' + r + '</b><i>' + sym + '</i></span>' +
      '</span>';
  };

  GG.carteDos = function (o) {
    o = o || {};
    return '<span class="jc dos' + (o.taille ? ' ' + o.taille : '') +
      (o.classe ? ' ' + o.classe : '') + '" aria-label="carte face cachée">' +
      '<span class="jc-dos-motif"></span></span>';
  };

  GG._RANGS = RANGS;
  GG._SYMBOLES = SYMBOLES;

  if (typeof module === 'object' && module.exports) {
    module.exports = { carte: GG.carte, carteDos: GG.carteDos };
  }
})(typeof self !== 'undefined' ? self : globalThis);
