/*
 * GGgames V2 — GG.fx : les animations communes à tous les jeux.
 *
 * Autonome : styles en ligne uniquement, aucune classe CSS externe, aucune
 * dépendance. Repose sur la Web Animations API (element.animate) et sur UN
 * canevas plein écran partagé pour les particules (confettis, éclats), créé
 * à la demande et retiré dès qu'il ne sert plus.
 *
 * « Cible » = un Element, OU un point {x, y} en pixels écran (un DOMRect ou
 * un évènement pointeur {clientX, clientY} conviennent aussi).
 * Chaque fonction renvoie une Promise résolue à la fin de l'animation, et
 * résolue immédiatement si les animations sont réduites (réglage
 * « reduites » ou prefers-reduced-motion) ou hors navigateur : dans Node,
 * tout est un no-op silencieux.
 *
 * API (détails au-dessus de chaque fonction) :
 *   reduced()                         animations réduites ?
 *   confetti(opts)                    pluie / explosion de confettis
 *   burst(cible, opts)                éclat de particules (étoiles, ronds, étincelles, cœurs)
 *   floatText(cible, texte, opts)     « +12 » qui jaillit, monte et s'efface
 *   pop, shake, pulse, bounceIn, fadeIn, slideIn, glow   micro-animations
 *   flyTo(from, to, opts)             vol en arc d'un clone (carte, jeton, lettre…)
 *   countUp(el, from, to, ms, format) défilement d'un nombre
 *   stagger(els, opts)                entrée échelonnée d'une liste
 *   flip(els, change, opts)           animation FLIP autour d'un changement du DOM
 *   shakeScreen(force)                secousse de tout l'écran
 *   ripple(ev, opts), autoRipple(sel) onde « matérielle » au toucher
 *   celebrate(opts)                   confettis + son « win » + vibration « success »
 *   clear(), stats(reinit)            nettoyage immédiat, mesures de performance
 */
(function (root) {
  'use strict';

  var GG = root.GG || (root.GG = {});

  /* ================================================================
   * Outils
   * ================================================================ */

  var DOUX = 'cubic-bezier(.22, 1, .36, 1)';
  var PALETTE = ['#ffc23d', '#ff4f9a', '#8b5cff', '#2fd4ff', '#2fd67b']; // or, rose, violet, cyan, vert
  var POLICE = 'Fredoka Variable, Nunito Variable, system-ui, sans-serif';
  var MARQUE = 'data-gg-fx'; // posée sur tout ce que fx ajoute au DOM
  var HTML_NS = 'http://www.w3.org/1999/xhtml';
  var TOUR = Math.PI * 2;

  function rien() {}
  function fait(v) { return Promise.resolve(v); }
  function navigateur() {
    return typeof window !== 'undefined' && typeof document !== 'undefined' &&
      !!document.documentElement;
  }
  function estElement(x) { return !!x && typeof x === 'object' && x.nodeType === 1; }
  function nombre(v, d) {
    if (v === null || v === undefined || v === '') return d;
    v = +v;
    return isFinite(v) ? v : d;
  }
  function borne(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function alea(a, b) { return a + Math.random() * (b - a); }
  function maintenant() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }
  function animable(el) { return navigateur() && estElement(el) && typeof el.animate === 'function'; }
  function fini(n) { return typeof n === 'number' && isFinite(n); }

  /* Element, NodeList, HTMLCollection, tableau ou sélecteur → tableau d'éléments. */
  function enTableau(els) {
    if (!els) return [];
    if (typeof els === 'string') {
      if (!navigateur()) return [];
      try { return Array.prototype.slice.call(document.querySelectorAll(els)); } catch (e) { return []; }
    }
    if (estElement(els)) return [els];
    if (typeof els.length === 'number') return Array.prototype.filter.call(els, estElement);
    return [];
  }

  /* Propriétés individuelles translate / rotate (Chrome 104+, Safari 14.1+). */
  var indiv = null;
  function individuelles() {
    if (indiv === null) {
      try { indiv = navigateur() && ('translate' in document.documentElement.style); } catch (e) { indiv = false; }
    }
    return indiv;
  }

  /* ---- couleurs : '#abc', '#aabbcc', 'rgb()', nom CSS… → [r, g, b] ---- */
  var cacheCouleurs = {}, nbCouleurs = 0, pinceauCouleur = null;
  function rgb(c) {
    var s = String(c == null ? '' : c).trim().toLowerCase();
    if (cacheCouleurs[s]) return cacheCouleurs[s];
    var m, v = null;
    if ((m = /^#([0-9a-f]{3,8})$/.exec(s))) {
      var h = m[1];
      if (h.length === 3 || h.length === 4) {
        v = [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)];
      } else if (h.length === 6 || h.length === 8) {
        v = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
      }
    } else if ((m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(s))) {
      v = [+m[1], +m[2], +m[3]];
    } else if (s && navigateur()) {
      // nom de couleur, hsl()… : le canevas sait normaliser
      try {
        if (!pinceauCouleur) pinceauCouleur = document.createElement('canvas').getContext('2d');
        pinceauCouleur.fillStyle = '#010203';
        pinceauCouleur.fillStyle = s;
        var n = pinceauCouleur.fillStyle;
        if (n !== '#010203' || s === '#010203') return rgb(n);
      } catch (e) {}
    }
    if (!v || isNaN(v[0]) || isNaN(v[1]) || isNaN(v[2])) return null;
    v = [borne(Math.round(v[0]), 0, 255), borne(Math.round(v[1]), 0, 255), borne(Math.round(v[2]), 0, 255)];
    if (++nbCouleurs > 256) { cacheCouleurs = {}; nbCouleurs = 0; }
    cacheCouleurs[s] = v;
    return v;
  }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  /* k > 0 : éclaircit vers le blanc ; k < 0 : assombrit vers le noir */
  function teinte(c, k, a) {
    var t = k > 0 ? 255 : 0, q = Math.abs(k);
    var r = Math.round(c[0] + (t - c[0]) * q), g = Math.round(c[1] + (t - c[1]) * q),
      b = Math.round(c[2] + (t - c[2]) * q);
    return a === undefined ? 'rgb(' + r + ',' + g + ',' + b + ')' : 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }
  function hex(c) {
    return '#' + ((1 << 24) | (c[0] << 16) | (c[1] << 8) | c[2]).toString(16).slice(1);
  }
  function couleursDe(liste) {
    var src = (liste && typeof liste === 'object' && liste.length) ? liste : (typeof liste === 'string' ? [liste] : PALETTE);
    var out = [];
    for (var i = 0; i < src.length && out.length < 16; i++) {
      var c = rgb(src[i]);
      if (c) out.push(hex(c));
    }
    return out.length ? out : PALETTE.slice();
  }

  /* ---- animations réduites ---- */
  var mqReduit = null;
  function reduced() {
    try {
      var r = root.GG && root.GG.reglages;
      if (r && typeof r.get === 'function' && r.get('animations') === 'reduites') return true;
    } catch (e) {}
    if (!navigateur() || typeof root.matchMedia !== 'function') return false;
    try {
      if (!mqReduit) mqReduit = root.matchMedia('(prefers-reduced-motion: reduce)');
      return !!mqReduit.matches;
    } catch (e) { return false; }
  }

  /* ---- cible → centre {x, y, w, h} en pixels écran (null si introuvable) ---- */
  function centre(c) {
    if (!navigateur()) return null;
    if (estElement(c)) {
      if (c.isConnected === false) return null;
      var r = c.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
    }
    if (c && typeof c === 'object') {
      if (fini(c.left) && fini(c.top) && fini(c.width) && fini(c.height)) {
        return { x: c.left + c.width / 2, y: c.top + c.height / 2, w: c.width, h: c.height };
      }
      if (fini(c.x) && fini(c.y)) return { x: c.x, y: c.y, w: 0, h: 0 };
      if (fini(c.clientX) && fini(c.clientY)) return { x: c.clientX, y: c.clientY, w: 0, h: 0 };
    }
    return { x: (root.innerWidth || 0) / 2, y: (root.innerHeight || 0) / 2, w: 0, h: 0 };
  }

  /*
   * Lance element.animate et renvoie une promesse résolue à la fin — aussi si
   * l'animation est annulée, et au plus tard peu après sa durée théorique
   * (onglet masqué : la chronologie ne défile plus, on ne bloque personne).
   * quand(a) reçoit l'objet Animation dès sa création.
   */
  function jouer(el, images, opts, quand) {
    return new Promise(function (resolve) {
      var a = null, termine = false, filet = 0;
      function fin() {
        if (termine) return;
        termine = true;
        clearTimeout(filet);
        if (a) { a.onfinish = null; a.oncancel = null; }
        resolve(a);
      }
      try {
        a = el.animate(images, opts);
      } catch (e) {
        a = null;
        if (opts && opts.composite) {
          // moteur trop ancien pour la composition additive : on s'en passe
          try {
            var o2 = {};
            for (var k in opts) if (k !== 'composite') o2[k] = opts[k];
            a = el.animate(images, o2);
          } catch (e2) { a = null; }
        }
      }
      if (!a) { fin(); return; }
      if (quand) { try { quand(a); } catch (e) {} }
      a.onfinish = fin;
      a.oncancel = fin;
      var total = (opts.delay || 0) + (opts.duration || 0) * (opts.iterations || 1);
      filet = setTimeout(fin, total + 500);
    });
  }

  /* Mode réduit : un simple fondu de 120 ms ; la promesse est déjà résolue. */
  function fonduCourt(el, entree) {
    if (animable(el)) {
      try {
        el.animate(entree ? [{ opacity: 0, offset: 0 }] : [{ opacity: 0.55, offset: 0.4 }],
          { duration: 120, easing: 'ease-out', fill: entree ? 'backwards' : 'none' });
      } catch (e) {}
    }
    return fait();
  }

  /* Décalage de départ selon le sens du mouvement (« up » : l'élément monte). */
  function decalage(dir, d) {
    switch (dir) {
      case 'down': return [0, -d];
      case 'left': return [d, 0];
      case 'right': return [-d, 0];
      case 'none': case 'scale': case 'fade': return [0, 0];
      default: return [0, d];
    }
  }

  /* Images clés d'une translation écran (+ transformation locale facultative),
     composables avec le transform existant de l'élément. */
  function imageTranslation(x, y, transform) {
    if (individuelles()) {
      var o = { translate: x + 'px ' + y + 'px' };
      if (transform) o.transform = transform;
      return o;
    }
    return { transform: 'translate(' + x + 'px,' + y + 'px)' + (transform ? ' ' + transform : '') };
  }

  /* ================================================================
   * Micro-animations sur un élément existant.
   * Elles s'ajoutent (composite: 'add') au transform CSS de l'élément au lieu
   * de l'écraser : une carte inclinée reste inclinée pendant son « pop ».
   * ================================================================ */

  /* pop(el, scale = 1.18) : petit gonflement élastique. */
  function pop(el, echelle) {
    if (!animable(el)) return fait();
    if (reduced()) return fonduCourt(el, false);
    var s = borne(nombre(echelle, 1.18), 0.3, 3);
    var rebond = (1 - (s - 1) * 0.28).toFixed(3);
    return jouer(el, [
      { transform: 'scale(1)', easing: 'cubic-bezier(.3, .6, .4, 1)' },
      { transform: 'scale(' + s + ')', offset: 0.36, easing: 'cubic-bezier(.5, 0, .5, 1)' },
      { transform: 'scale(' + rebond + ')', offset: 0.7, easing: 'ease-in-out' },
      { transform: 'scale(1)' }
    ], { duration: 360, composite: 'add' }).then(rien);
  }

  /* shake(el, force = 1) : « non » de la tête (erreur, coup refusé). */
  function shake(el, force) {
    if (!animable(el)) return fait();
    if (reduced()) return fonduCourt(el, false);
    var f = borne(nombre(force, 1), 0.1, 4), a = 7 * f;
    var xs = [0, -a, a * 0.85, -a * 0.65, a * 0.45, -a * 0.25, a * 0.1, 0];
    var rs = [0, -1.1, 0.95, -0.7, 0.45, -0.22, 0.08, 0];
    var images = [];
    for (var i = 0; i < xs.length; i++) {
      var r = (rs[i] * Math.min(f, 2)).toFixed(3) + 'deg';
      var im = individuelles() ? { translate: xs[i].toFixed(2) + 'px 0px', rotate: r }
        : { transform: 'translateX(' + xs[i].toFixed(2) + 'px) rotate(' + r + ')' };
      im.easing = 'ease-in-out';
      images.push(im);
    }
    return jouer(el, images, { duration: 380 + 40 * Math.min(f, 2), composite: 'add' }).then(rien);
  }

  /* pulse(el, times = 2) : battements doux pour attirer l'œil. */
  function pulse(el, fois) {
    if (!animable(el)) return fait();
    if (reduced()) return fonduCourt(el, false);
    var n = Math.round(borne(nombre(fois, 2), 1, 20));
    return jouer(el, [
      { transform: 'scale(1)', easing: 'cubic-bezier(.4, 0, .6, 1)' },
      { transform: 'scale(1.08)', offset: 0.45, easing: 'cubic-bezier(.4, 0, .6, 1)' },
      { transform: 'scale(1)' }
    ], { duration: 460, iterations: n, composite: 'add' }).then(rien);
  }

  /* bounceIn(el, delay = 0) : apparition avec rebond. */
  function bounceIn(el, delai) {
    if (!animable(el)) return fait();
    if (reduced()) return fonduCourt(el, true);
    var d = Math.max(0, nombre(delai, 0));
    return Promise.all([
      jouer(el, [{ opacity: 0, offset: 0 }], { duration: 200, delay: d, easing: 'ease-out', fill: 'backwards' }),
      jouer(el, [
        { transform: 'scale(.3)', easing: 'cubic-bezier(.2, .8, .3, 1)' },
        { transform: 'scale(1.08)', offset: 0.5, easing: 'ease-in-out' },
        { transform: 'scale(.97)', offset: 0.76, easing: 'ease-in-out' },
        { transform: 'scale(1)' }
      ], { duration: 540, delay: d, fill: 'backwards', composite: 'add' })
    ]).then(rien);
  }

  /* fadeIn(el, delay = 0) : fondu d'apparition (vers l'opacité naturelle). */
  function fadeIn(el, delai) {
    if (!animable(el)) return fait();
    if (reduced()) return fonduCourt(el, true);
    return jouer(el, [{ opacity: 0, offset: 0 }],
      { duration: 340, delay: Math.max(0, nombre(delai, 0)), easing: 'ease-out', fill: 'backwards' }).then(rien);
  }

  /* slideIn(el, dir = 'up', delay = 0) : glisse en place (dir = sens du mouvement). */
  function slideIn(el, dir, delai) {
    if (!animable(el)) return fait();
    if (reduced()) return fonduCourt(el, true);
    var d = Math.max(0, nombre(delai, 0)), o = decalage(dir, 28);
    return Promise.all([
      jouer(el, [{ opacity: 0, offset: 0 }], { duration: 280, delay: d, easing: 'ease-out', fill: 'backwards' }),
      jouer(el, [imageTranslation(o[0], o[1]), imageTranslation(0, 0)],
        { duration: 460, delay: d, easing: DOUX, fill: 'backwards', composite: 'add' })
    ]).then(rien);
  }

  /* glow(el, color = or, ms = 900) : halo lumineux qui s'allume puis s'éteint
     (ajouté aux ombres existantes de l'élément). */
  function glow(el, couleur, ms) {
    if (!animable(el)) return fait();
    var c = rgb(couleur || PALETTE[0]) || rgb(PALETTE[0]);
    var nul = '0 0 0 0 ' + rgba(c, 0) + ', 0 0 0 0 ' + rgba(c, 0) + ', 0 0 0 0 ' + rgba(c, 0);
    var fort = '0 0 0 3px ' + rgba(c, 0.9) + ', 0 0 18px 4px ' + rgba(c, 0.6) + ', 0 0 44px 10px ' + rgba(c, 0.28);
    if (reduced()) {
      try { el.animate([{ boxShadow: fort }, { boxShadow: nul }], { duration: 120, composite: 'add' }); } catch (e) {}
      return fait();
    }
    return jouer(el, [
      { boxShadow: nul, easing: 'ease-out' },
      { boxShadow: fort, offset: 0.3, easing: 'ease-in-out' },
      { boxShadow: nul }
    ], { duration: borne(nombre(ms, 900), 150, 20000), composite: 'add' }).then(rien);
  }

  /* ================================================================
   * Moteur de particules : un canevas partagé, des objets recyclés,
   * des « lutins » pré-dessinés (dégradés, halos) et un budget adaptatif.
   * ================================================================ */

  var MAX_PARTICULES = 300;
  var K_RECT = 0, K_RUBAN = 1, K_ROND = 2, K_ETOILE = 3, K_ETINCELLE = 4,
    K_COEUR = 5, K_ONDE = 6, K_PAILLETTE = 7, K_FLASH = 8;
  var FORMES_ECLAT = { star: K_ETOILE, circle: K_ROND, spark: K_ETINCELLE, heart: K_COEUR };
  var NOMS_LUTINS = ['rect', 'ruban', 'rond', 'etoile', 'etincelle', 'coeur', '', 'paillette', 'flash'];

  var toile = null, pinceau = null;       // le canevas partagé
  var E = 1, L = 0, H = 0;                 // échelle (px physiques / px CSS), largeur, hauteur
  var echelleMax = 2;                      // plafond du devicePixelRatio (abaissé si c'est lent)
  var parts = [], reserve = [], travaux = [];
  var boucle = 0, tPrec = 0, boite = null; // boite : zone dessinée à l'image précédente
  var budget = MAX_PARTICULES, moyenne = 16.7, lentes = 0, rapides = 0;
  var mesure = nouvelleMesure();

  function nouvelleMesure() { return { images: 0, somme: 0, travail: 0, pire: 0, pic: 0, allegements: 0 }; }

  /* ---- lutins : chaque forme × couleur dessinée une fois sur un petit canevas ---- */
  var DIM = {
    rect: [8, 12], ruban: [8, 30], rond: [20, 20], etoile: [26, 26], etincelle: [30, 8],
    coeur: [26, 24], paillette: [14, 14], flash: [48, 48]
  };
  var lutins = {}, nbLutins = 0;

  function echelleLutins() {
    var d = (navigateur() && root.devicePixelRatio) || 1;
    return Math.min(3, Math.ceil(d * 1.5 * 2) / 2);
  }

  function arrondi(x, a, b, w, h, r) {
    x.beginPath();
    x.moveTo(a + r, b);
    x.lineTo(a + w - r, b); x.quadraticCurveTo(a + w, b, a + w, b + r);
    x.lineTo(a + w, b + h - r); x.quadraticCurveTo(a + w, b + h, a + w - r, b + h);
    x.lineTo(a + r, b + h); x.quadraticCurveTo(a, b + h, a, b + h - r);
    x.lineTo(a, b + r); x.quadraticCurveTo(a, b, a + r, b);
    x.closePath();
  }

  function cheminEtoile(x, cx, cy, re, ri, n) {
    x.beginPath();
    for (var i = 0; i < n * 2; i++) {
      var r = i % 2 ? ri : re, a = -Math.PI / 2 + i * Math.PI / n;
      if (i) x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      else x.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    x.closePath();
  }

  function cheminCoeur(x, cx, cy, s) {
    x.beginPath();
    x.moveTo(cx, cy + s * 0.42);
    x.bezierCurveTo(cx - s * 0.62, cy + s * 0.02, cx - s * 0.42, cy - s * 0.52, cx, cy - s * 0.2);
    x.bezierCurveTo(cx + s * 0.42, cy - s * 0.52, cx + s * 0.62, cy + s * 0.02, cx, cy + s * 0.42);
    x.closePath();
  }

  var PEINTRES = {
    rect: function (x, w, h, c, verso) {
      var g = x.createLinearGradient(0, 0, w, h);
      if (verso) { g.addColorStop(0, teinte(c, -0.2)); g.addColorStop(1, teinte(c, -0.46)); }
      else { g.addColorStop(0, teinte(c, 0.5)); g.addColorStop(0.45, teinte(c, 0)); g.addColorStop(1, teinte(c, -0.2)); }
      x.fillStyle = g;
      arrondi(x, 0.5, 0.5, w - 1, h - 1, 1.4);
      x.fill();
    },
    ruban: function (x, w, h, c, verso) {
      var g = x.createLinearGradient(0, 0, 0, h);
      if (verso) { g.addColorStop(0, teinte(c, -0.18)); g.addColorStop(1, teinte(c, -0.42)); }
      else { g.addColorStop(0, teinte(c, 0.45)); g.addColorStop(0.5, teinte(c, 0)); g.addColorStop(1, teinte(c, 0.2)); }
      x.strokeStyle = g;
      x.lineWidth = 3;
      x.lineCap = 'round';
      x.lineJoin = 'round';
      x.beginPath();
      for (var i = 0; i <= 24; i++) {
        var yy = 2 + (h - 4) * i / 24, xx = w / 2 + Math.sin(i / 24 * Math.PI * 2.5) * (w / 2 - 2);
        if (i) x.lineTo(xx, yy); else x.moveTo(xx, yy);
      }
      x.stroke();
    },
    rond: function (x, w, h, c) {
      var g = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.22, teinte(c, 0.55, 1));
      g.addColorStop(0.5, rgba(c, 0.85));
      g.addColorStop(1, rgba(c, 0));
      x.fillStyle = g;
      x.fillRect(0, 0, w, h);
    },
    etoile: function (x, w, h, c, verso, S) {
      x.shadowColor = rgba(c, 0.95);
      x.shadowBlur = 5 * S;
      var g = x.createRadialGradient(w / 2, h / 2 - 1, 0, w / 2, h / 2, 9);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.35, teinte(c, 0.45));
      g.addColorStop(1, teinte(c, -0.05));
      x.fillStyle = g;
      cheminEtoile(x, w / 2, h / 2 + 0.5, 9, 3.9, 5);
      x.fill();
      x.shadowBlur = 0;
      x.fillStyle = 'rgba(255,255,255,.85)';
      cheminEtoile(x, w / 2, h / 2 + 0.5, 3.2, 1.4, 5);
      x.fill();
    },
    etincelle: function (x, w, h, c) {
      x.save();
      x.translate(w / 2, h / 2);
      x.scale(w / h, 1);
      var g = x.createRadialGradient(0, 0, 0, 0, 0, h / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.35, teinte(c, 0.4, 1));
      g.addColorStop(1, rgba(c, 0));
      x.fillStyle = g;
      x.fillRect(-h / 2, -h / 2, h, h);
      x.restore();
    },
    coeur: function (x, w, h, c, verso, S) {
      x.shadowColor = rgba(c, 0.8);
      x.shadowBlur = 4 * S;
      var g = x.createLinearGradient(w * 0.2, h * 0.15, w * 0.8, h * 0.9);
      g.addColorStop(0, teinte(c, 0.45));
      g.addColorStop(0.5, teinte(c, 0));
      g.addColorStop(1, teinte(c, -0.22));
      x.fillStyle = g;
      cheminCoeur(x, w / 2, h / 2 + 0.5, 18);
      x.fill();
      x.shadowBlur = 0;
      x.fillStyle = 'rgba(255,255,255,.55)';
      x.beginPath();
      x.ellipse(w / 2 - 4.2, h / 2 - 3.2, 2.4, 1.5, -0.6, 0, TOUR);
      x.fill();
    },
    paillette: function (x, w, h, c) {
      var cx = w / 2, cy = h / 2, r = w / 2 - 0.5, ri = r * 0.2;
      var g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.45, teinte(c, 0.6));
      g.addColorStop(1, teinte(c, 0.2, 0.6));
      x.fillStyle = g;
      x.beginPath();
      x.moveTo(cx, cy - r);
      x.quadraticCurveTo(cx + ri, cy - ri, cx + r, cy);
      x.quadraticCurveTo(cx + ri, cy + ri, cx, cy + r);
      x.quadraticCurveTo(cx - ri, cy + ri, cx - r, cy);
      x.quadraticCurveTo(cx - ri, cy - ri, cx, cy - r);
      x.fill();
    },
    flash: function (x, w, h, c) {
      var g = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,.95)');
      g.addColorStop(0.3, teinte(c, 0.7, 0.55));
      g.addColorStop(1, rgba(c, 0));
      x.fillStyle = g;
      x.fillRect(0, 0, w, h);
    }
  };

  function lutin(forme, coul, verso) {
    var S = echelleLutins();
    var cle = forme + coul + (verso ? '1' : '0') + S;
    var l = lutins[cle];
    if (l) return l;
    if (nbLutins > 160) { lutins = {}; nbLutins = 0; } // garde-fou (couleurs très variées)
    var d = DIM[forme], c = document.createElement('canvas');
    c.width = Math.ceil(d[0] * S);
    c.height = Math.ceil(d[1] * S);
    var x = c.getContext('2d');
    if (x) {
      x.scale(S, S);
      PEINTRES[forme](x, d[0], d[1], rgb(coul) || [255, 255, 255], verso, S);
    }
    l = { c: c, w: d[0], h: d[1] };
    lutins[cle] = l;
    nbLutins++;
    return l;
  }

  /* Les lutins des confettis de la palette par défaut sont dessinés à l'avance,
     par petites tranches, pendant les temps morts du navigateur : la première
     célébration ne paie pas leur création (~30 petits canevas). */
  var prechauffe = false;
  function prechauffer() {
    if (prechauffe || !navigateur()) return;
    prechauffe = true;
    var file = [];
    for (var i = 0; i < PALETTE.length; i++) {
      file.push(['rect', PALETTE[i], false], ['rect', PALETTE[i], true], ['ruban', PALETTE[i], false],
        ['ruban', PALETTE[i], true], ['paillette', PALETTE[i], false]);
    }
    function tranche(delai) {
      var t0 = maintenant();
      try {
        while (file.length && (delai && delai.timeRemaining ? delai.timeRemaining() > 3 : maintenant() - t0 < 4)) {
          var f = file.shift();
          lutin(f[0], f[1], f[2]);
        }
      } catch (e) { file.length = 0; }
      if (file.length) planifier(tranche);
    }
    planifier(tranche);
  }
  function planifier(f) {
    if (typeof root.requestIdleCallback === 'function') root.requestIdleCallback(f, { timeout: 4000 });
    else setTimeout(f, 60);
  }

  /* ---- le canevas partagé ---- */
  function assurerToile() {
    if (toile) return true;
    if (!navigateur() || !document.body) return false;
    try {
      var c = document.createElement('canvas');
      var x = c.getContext('2d');
      if (!x) return false;
      c.setAttribute(MARQUE, 'particules');
      c.setAttribute('aria-hidden', 'true');
      c.style.cssText = 'position:fixed;inset:0;left:0;top:0;width:100%;height:100%;' +
        'pointer-events:none;z-index:9999;margin:0;padding:0;border:0;';
      document.body.appendChild(c);
      toile = c;
      pinceau = x;
      dimensionner();
      root.addEventListener('resize', dimensionner);
      return true;
    } catch (e) {
      toile = pinceau = null;
      return false;
    }
  }

  function dimensionner() {
    if (!toile) return;
    L = root.innerWidth || document.documentElement.clientWidth || 1;
    H = root.innerHeight || document.documentElement.clientHeight || 1;
    E = Math.min(echelleMax, root.devicePixelRatio || 1);
    toile.width = Math.max(1, Math.round(L * E));
    toile.height = Math.max(1, Math.round(H * E));
    boite = null;
  }

  function arreter() {
    if (boucle) { root.cancelAnimationFrame(boucle); boucle = 0; }
    tPrec = 0;
    boite = null;
    if (toile) {
      root.removeEventListener('resize', dimensionner);
      if (toile.parentNode) toile.parentNode.removeChild(toile);
      toile.width = toile.height = 0; // libère tout de suite la mémoire graphique
      toile = pinceau = null;
    }
  }

  /* ---- particules recyclées ---- */
  function prendre(job, k) {
    var p = reserve.pop() || {};
    p.k = k; p.job = job;
    p.x = p.y = p.vx = p.vy = 0;
    p.g = 0; p.cq = 0; p.cl = 0; p.sway = 0; p.wob = 0; p.vw = 0;
    p.rot = 0; p.vr = 0; p.tilt = 0; p.vt = 0; p.plat = false;
    p.s = 1; p.t = 0; p.vie = 1; p.fondu = 0.3; p.tw = 0; p.ph = Math.random() * TOUR;
    p.av = p.ar = null; p.coul = ''; p.r0 = 0; p.r1 = 0; p.lw = 0;
    job.vivants++;
    parts.push(p);
    return p;
  }
  function liberer(p) {
    if (p.job) p.job.vivants--;
    p.job = null; p.av = p.ar = null;
    if (reserve.length < 400) reserve.push(p);
  }

  function avancer(p, dt) {
    p.t += dt;
    if (p.t >= p.vie) return false;
    if (p.k === K_ONDE || p.k === K_FLASH) return true;
    var vx = p.vx, vy = p.vy, v = Math.sqrt(vx * vx + vy * vy);
    // traînée : quadratique (l'air freine fort les morceaux rapides) + linéaire.
    // Un confetti vu de face freine plus qu'un confetti vu par la tranche.
    var cq = p.plat ? p.cq * (0.4 + 0.9 * Math.abs(Math.cos(p.tilt))) : p.cq;
    var f = 1 / (1 + (cq * v + p.cl) * dt);
    vx *= f; vy *= f;
    vy += p.g * dt;
    if (p.sway) { p.wob += p.vw * dt; vx += Math.cos(p.wob) * p.sway * dt; } // dérive, flottement
    p.vx = vx; p.vy = vy;
    p.x += vx * dt; p.y += vy * dt;
    p.rot += p.vr * dt;
    p.tilt += p.vt * dt;
    if (vy > 0 && p.y > H + 60) return false;     // tombé hors de l'écran
    if (p.x < -140 || p.x > L + 140) return false;
    return true;
  }

  /* Dessine une particule ; renvoie son rayon d'encombrement (px CSS). */
  function dessiner(cx, p) {
    var age = p.t, reste = p.vie - age, a = 1;
    if (reste < p.fondu) a = reste / p.fondu;
    var img = p.av, sc = p.s, sx = 1, sy = 1, ang = p.rot, k;
    switch (p.k) {
      case K_RECT:
      case K_RUBAN:
        // rotation 3D simulée : la pièce se retourne (recto clair / verso sombre)
        sy = Math.cos(p.tilt);
        if (sy < 0) { sy = -sy; img = p.ar; }
        if (sy < 0.08) sy = 0.08;
        sx = 0.8 + 0.2 * Math.abs(Math.sin(p.tilt * 0.7 + p.ph));
        break;
      case K_PAILLETTE:
        k = 0.55 + 0.45 * Math.sin(age * p.tw + p.ph); // scintillement
        a *= 0.3 + 0.7 * k;
        sc *= 0.55 + 0.55 * k;
        break;
      case K_ETOILE:
      case K_COEUR:
      case K_ROND:
        sc *= age < 0.09 ? 0.35 + 0.65 * (age / 0.09) : 1;          // jaillit
        if (reste < p.vie * 0.45) sc *= 0.25 + 0.75 * reste / (p.vie * 0.45); // se résorbe
        if (p.k === K_ETOILE) {
          k = Math.sin(age * p.tw + p.ph);
          sc *= 0.88 + 0.12 * k;
          a *= 0.78 + 0.22 * k;
        } else if (p.k === K_COEUR) {
          ang = p.rot + Math.sin(age * 9 + p.ph) * 0.25;
        }
        break;
      case K_ETINCELLE:
        ang = Math.atan2(p.vy, p.vx);
        sx = borne(Math.sqrt(p.vx * p.vx + p.vy * p.vy) / 240, 0.45, 2.6);
        sy = reste < p.vie * 0.5 ? Math.max(0.2, reste / (p.vie * 0.5)) : 1;
        break;
      case K_FLASH:
        k = age / p.vie;
        sc = p.s * (0.4 + 0.9 * Math.sqrt(k));
        a = (1 - k) * 0.9;
        break;
      case K_ONDE:
        k = age / p.vie;
        var e = 1 - (1 - k) * (1 - k) * (1 - k), r = p.r0 + (p.r1 - p.r0) * e;
        cx.setTransform(E, 0, 0, E, 0, 0);
        cx.globalAlpha = (1 - k) * 0.6;
        cx.lineWidth = p.lw * (1 - k) + 0.5;
        cx.strokeStyle = p.coul;
        cx.beginPath();
        cx.arc(p.x, p.y, r, 0, TOUR);
        cx.stroke();
        return r + p.lw;
    }
    if (a <= 0.01 || !img) return 0;
    var c = Math.cos(ang), s = Math.sin(ang), ks = sc * E, w = img.w, h = img.h;
    cx.globalAlpha = a > 1 ? 1 : a;
    cx.setTransform(c * sx * ks, s * sx * ks, -s * sy * ks, c * sy * ks, p.x * E, p.y * E);
    cx.drawImage(img.c, -w / 2, -h / 2, w, h);
    return (w > h ? w : h) * sc * 0.72 * (sx > 1 ? sx : 1);
  }

  /* Budget adaptatif : si les images ralentissent, moins de particules
     (les plus anciennes s'effacent vite) et un canevas moins défini. */
  function adapter(dtms) {
    moyenne += (dtms - moyenne) * 0.15;
    if (moyenne > 23) {
      rapides = 0;
      if (++lentes > 3) { lentes = 0; alleger(); }
    } else {
      lentes = 0;
      if (moyenne < 18.5 && budget < MAX_PARTICULES && ++rapides > 90) {
        rapides = 0;
        budget = Math.min(MAX_PARTICULES, budget + 30);
      }
    }
  }

  function alleger() {
    mesure.allegements++;
    budget = Math.max(70, Math.floor(Math.min(budget, parts.length) * (moyenne > 35 ? 0.6 : 0.75)));
    var trop = parts.length - budget;
    for (var i = 0; i < parts.length && trop > 0; i++) {
      var p = parts[i];
      if (p.k === K_ONDE || p.k === K_FLASH) continue;
      if (p.vie - p.t > 0.25) { p.vie = p.t + 0.25; p.fondu = 0.25; trop--; }
    }
    if (E > 1 && (budget < 200 || moyenne > 30)) { echelleMax = 1; dimensionner(); }
  }

  function image(t) {
    boucle = 0;
    if (!toile) return;
    var debut = maintenant();
    var dtms = tPrec ? t - tPrec : 16.7;
    tPrec = t;
    var valide = dtms > 0 && dtms < 250; // un onglet revenu au premier plan ne compte pas
    if (valide) adapter(dtms);
    var dt = borne(dtms / 1000, 0.001, 0.05), j, job;

    // 1. émissions en cours
    for (j = 0; j < travaux.length; j++) {
      job = travaux[j];
      job.age += dt;
      if (job.restants > 0 && job.emettre) job.emettre(job);
    }

    // 2. on efface seulement la zone dessinée à l'image précédente
    var cx = pinceau;
    cx.setTransform(1, 0, 0, 1, 0, 0);
    if (boite) cx.clearRect(boite[0], boite[1], boite[2] - boite[0], boite[3] - boite[1]);

    // 3. mise à jour et dessin (compactage stable : l'ordre d'empilement ne saute pas)
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, n = 0;
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (!avancer(p, dt)) { liberer(p); continue; }
      var r = dessiner(cx, p);
      if (r > 0) {
        if (p.x - r < x0) x0 = p.x - r;
        if (p.y - r < y0) y0 = p.y - r;
        if (p.x + r > x1) x1 = p.x + r;
        if (p.y + r > y1) y1 = p.y + r;
      }
      parts[n++] = p;
    }
    parts.length = n;
    cx.globalAlpha = 1;
    if (x1 > x0) {
      var cw = toile.width, ch = toile.height;
      boite = [
        Math.max(0, Math.floor(x0 * E) - 2), Math.max(0, Math.floor(y0 * E) - 2),
        Math.min(cw, Math.ceil(x1 * E) + 2), Math.min(ch, Math.ceil(y1 * E) + 2)
      ];
      if (boite[2] <= boite[0] || boite[3] <= boite[1]) boite = null;
    } else {
      boite = null;
    }

    // 4. travaux terminés
    for (j = travaux.length - 1; j >= 0; j--) {
      job = travaux[j];
      if (job.restants <= 0 && job.vivants <= 0) terminer(job, false);
    }

    var travail = maintenant() - debut;
    mesure.images++;
    if (valide) mesure.somme += dtms; else mesure.somme += 16.7;
    mesure.travail += travail;
    if (travail > mesure.pire) mesure.pire = travail;
    if (n > mesure.pic) mesure.pic = n;

    if (parts.length || travaux.length) boucle = root.requestAnimationFrame(image);
    else arreter();
  }

  function nouveauTravail(duree) {
    return { restants: 0, vivants: 0, age: 0, duree: duree, emettre: null, resoudre: null, filet: 0, couleurs: null };
  }

  function lancer(job) {
    return new Promise(function (resolve) {
      if (!assurerToile()) { resolve(); return; }
      job.resoudre = resolve;
      travaux.push(job);
      if (job.emettre) job.emettre(job); // premières particules sans attendre l'image suivante
      // filet : onglet masqué (plus d'images) → on termine quand même
      job.filet = setTimeout(function () { terminer(job, true); }, job.duree + 1500);
      if (!boucle) { tPrec = 0; boucle = root.requestAnimationFrame(image); }
    });
  }

  function terminer(job, force) {
    var i = travaux.indexOf(job);
    if (i < 0) return;
    travaux.splice(i, 1);
    clearTimeout(job.filet);
    if (force) {
      var n = 0;
      for (var k = 0; k < parts.length; k++) {
        var p = parts[k];
        if (p.job === job) liberer(p); else parts[n++] = p;
      }
      parts.length = n;
      if (!parts.length && !travaux.length) arreter();
    }
    job.restants = 0;
    job.emettre = null;
    job.couleurs = null;
    var r = job.resoudre;
    job.resoudre = null;
    if (r) r();
  }

  function place() { return parts.length < budget; }

  /* ---- un confetti ---- */
  function confetto(job, x, y, vx, vy) {
    var r = Math.random(), k = r < 0.09 ? K_PAILLETTE : (r < 0.3 ? K_RUBAN : K_RECT);
    var p = prendre(job, k), coul = job.couleurs[(Math.random() * job.couleurs.length) | 0];
    var forme = NOMS_LUTINS[k];
    p.av = lutin(forme, coul, false);
    p.ar = k === K_PAILLETTE ? p.av : lutin(forme, coul, true);
    p.x = x; p.y = y; p.vx = vx; p.vy = vy;
    p.s = k === K_RUBAN ? alea(0.8, 1.15) : (k === K_PAILLETTE ? alea(0.7, 1.2) : alea(0.75, 1.3));
    p.rot = Math.random() * TOUR;
    p.vr = alea(-7, 7) * (k === K_RUBAN ? 0.4 : 1);
    p.tilt = Math.random() * TOUR;
    p.vt = alea(5, 13) * (Math.random() < 0.5 ? -1 : 1);
    p.wob = Math.random() * TOUR;
    p.vw = alea(1.8, 3.6);
    p.sway = k === K_PAILLETTE ? 40 : alea(70, 170);
    p.g = k === K_PAILLETTE ? 240 : (k === K_RUBAN ? 440 : 560);
    p.cq = k === K_PAILLETTE ? 0.012 : (k === K_RUBAN ? 0.0055 : 0.0045);
    p.cl = 0.35;
    p.plat = k !== K_PAILLETTE;
    p.tw = alea(10, 22);
    p.fondu = 0.5;
    return p;
  }

  /* Émetteur selon l'origine : 'top' (pluie), 'cannons' (deux canons en bas),
     sinon explosion depuis 'center' ou une cible. */
  function emetteurConfettis(from, n, duree) {
    var ds = duree / 1000;
    function aEmettre(job, fenetre) {
      var attendu = Math.min(n, Math.ceil(n * Math.min(1, (job.age + 0.02) / fenetre)));
      return attendu - (n - job.restants);
    }
    if (from === 'top') {
      return function (job) {
        var q = aEmettre(job, Math.min(ds * 0.45, 1.3));
        while (q-- > 0 && job.restants > 0) {
          job.restants--;
          if (!place()) continue;
          var p = confetto(job, alea(-10, L + 10), -alea(8, 50), alea(-70, 70), alea(60, 240));
          p.vie = Math.max(0.7, ds - job.age) * alea(0.92, 1);
        }
      };
    }
    if (from === 'cannons' || from === 'canons') {
      return function (job) {
        var q = aEmettre(job, 0.3);
        while (q-- > 0 && job.restants > 0) {
          job.restants--;
          if (!place()) continue;
          var gauche = (job.restants & 1) === 0;
          // tir presque vertical, un peu vers l'intérieur : la gerbe monte haut et s'étale
          var ang = -Math.PI / 2 + (gauche ? 1 : -1) * alea(0.08, 0.5), v = H * alea(2, 3.4);
          var p = confetto(job, gauche ? -6 : L + 6, H + 6, Math.cos(ang) * v, Math.sin(ang) * v);
          p.cq *= 0.55;
          p.vie = Math.max(0.7, ds * alea(0.85, 1) - job.age);
        }
      };
    }
    var pt = (from === 'center' || from === 'centre') ? null : centre(from);
    return function (job) {
      var x = pt ? pt.x : L / 2, y = pt ? pt.y : H * 0.42;
      var vague = job.age < 0.12 ? Math.ceil(n * 0.7) : n; // deux vagues : plus riche
      var q = vague - (n - job.restants);
      while (q-- > 0 && job.restants > 0) {
        job.restants--;
        if (!place()) continue;
        var ang = Math.random() * TOUR, v = job.age < 0.12 ? alea(300, 1150) : alea(220, 760);
        var p = confetto(job, x + alea(-6, 6), y + alea(-6, 6), Math.cos(ang) * v, Math.sin(ang) * v - 280);
        p.vie = Math.max(0.6, ds * alea(0.8, 1) - job.age);
      }
    };
  }

  /*
   * confetti(opts) : célébration.
   *   count = 140, from = 'top' | 'center' | 'cannons' | cible, colors = palette vive,
   *   duration = 2600 (ms)
   */
  function confetti(opts) {
    opts = opts || {};
    if (!navigateur() || reduced()) return fait();
    var n = Math.round(borne(nombre(opts.count, 140), 0, 600));
    var duree = borne(nombre(opts.duration, 2600), 400, 15000);
    var job = nouveauTravail(duree);
    job.couleurs = couleursDe(opts.colors);
    job.restants = n;
    job.emettre = emetteurConfettis(opts.from == null ? 'top' : opts.from, n, duree);
    return lancer(job);
  }

  /*
   * burst(cible, opts) : éclat depuis le centre de la cible.
   *   count = 18, colors, shape = 'star' | 'circle' | 'spark' | 'heart',
   *   spread = 1, size = 1, gravity = true
   */
  function burst(cible, opts) {
    opts = opts || {};
    if (!navigateur() || reduced()) return fait();
    var pt = centre(cible);
    if (!pt) return fait();
    var n = Math.round(borne(nombre(opts.count, 18), 0, 200));
    var k = FORMES_ECLAT.hasOwnProperty(opts.shape) ? FORMES_ECLAT[opts.shape] : K_ETOILE;
    var spread = borne(nombre(opts.spread, 1), 0.1, 5), taille = borne(nombre(opts.size, 1), 0.2, 5);
    var gravite = opts.gravity !== false;
    var job = nouveauTravail(1400);
    job.couleurs = couleursDe(opts.colors);
    job.restants = 1;
    job.emettre = function (job) {
      job.restants = 0;
      var cs = job.couleurs, p;
      // onde de choc + éclair central
      p = prendre(job, K_ONDE);
      p.x = pt.x; p.y = pt.y; p.vie = 0.42; p.coul = cs[0];
      p.r0 = 4 * taille; p.r1 = (28 + 20 * spread) * taille; p.lw = 4 * taille;
      if (k !== K_COEUR) {
        p = prendre(job, K_FLASH);
        p.x = pt.x; p.y = pt.y; p.vie = 0.24; p.s = taille * (0.8 + 0.3 * spread);
        p.av = lutin('flash', cs[0], false);
      }
      for (var i = 0; i < n; i++) {
        if (!place()) break;
        p = prendre(job, k);
        var coul = cs[i % cs.length];
        p.av = lutin(NOMS_LUTINS[k], coul, false);
        var ang = (i / Math.max(1, n)) * TOUR + alea(-0.35, 0.35);
        var v = (k === K_ETINCELLE ? alea(280, 640) : alea(170, 430)) * spread;
        p.x = pt.x; p.y = pt.y;
        p.vx = Math.cos(ang) * v;
        p.vy = Math.sin(ang) * v - (gravite ? 90 : 0);
        p.g = gravite ? (k === K_COEUR ? 380 : (k === K_ETINCELLE ? 650 : 820)) : 0;
        p.cq = 0.0035;
        p.cl = k === K_ETINCELLE ? 2.2 : 1.4;
        p.s = taille * (k === K_ETINCELLE ? alea(0.8, 1.2) : (k === K_ETOILE ? alea(0.85, 1.35) : alea(0.7, 1.2)));
        p.rot = Math.random() * TOUR;
        p.vr = k === K_ETOILE ? alea(-9, 9) : 0;
        p.tw = alea(18, 30);
        p.vie = k === K_ETINCELLE ? alea(0.32, 0.55) : alea(0.5, 0.85);
        if (k === K_COEUR) p.vie += 0.25;
        p.fondu = p.vie * 0.4;
      }
    };
    return lancer(job);
  }

  /* clear() : retire immédiatement toutes les particules (changement d'écran…). */
  function clear() {
    var ts = travaux.slice();
    for (var i = 0; i < ts.length; i++) terminer(ts[i], true);
    for (var k = 0; k < parts.length; k++) liberer(parts[k]);
    parts.length = 0;
    arreter();
  }

  /* stats(reinit) : mesures du moteur de particules (tests, réglages). */
  function stats(reinit) {
    var m = mesure, s = {
      images: m.images,
      moyenne: m.images ? +(m.somme / m.images).toFixed(2) : 0,  // ms entre deux images
      travail: m.images ? +(m.travail / m.images).toFixed(3) : 0, // ms de calcul + dessin par image
      pire: +m.pire.toFixed(3),
      pic: m.pic,
      allegements: m.allegements,
      budget: budget,
      particules: parts.length,
      echelle: E,
      actif: !!toile
    };
    if (reinit) mesure = nouvelleMesure();
    return s;
  }

  /* ================================================================
   * Textes, vols, compteurs
   * ================================================================ */

  function sombre(c) { return c && (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) < 110; }

  /*
   * floatText(cible, texte, opts) : un texte qui jaillit avec un rebond,
   * monte et s'efface.
   *   color = '#fff', size = 22, weight = 800, dy = -60, duration = 1100, font
   */
  function floatText(cible, texte, opts) {
    opts = opts || {};
    if (!navigateur() || !document.body) return fait();
    var pt = centre(cible);
    if (!pt) return fait();
    var couleur = opts.color || '#fff', taille = borne(nombre(opts.size, 22), 6, 200);
    var dy = nombre(opts.dy, -60), duree = borne(nombre(opts.duration, 1100), 200, 10000);
    var ombre = sombre(rgb(couleur))
      ? '0 1px 0 rgba(255,255,255,.7), 0 0 3px rgba(255,255,255,.95), 0 3px 12px rgba(255,255,255,.55)'
      : '0 2px 0 rgba(0,0,0,.32), 0 0 3px rgba(0,0,0,.6), 0 4px 14px rgba(0,0,0,.45)';
    var el = document.createElement('div');
    el.setAttribute(MARQUE, 'texte');
    el.setAttribute('aria-hidden', 'true');
    el.textContent = String(texte == null ? '' : texte);
    el.style.cssText = 'position:fixed;left:0;top:0;margin:0;padding:0;z-index:10001;pointer-events:none;' +
      'white-space:nowrap;line-height:1;letter-spacing:.3px;user-select:none;-webkit-user-select:none;' +
      'will-change:transform,opacity;opacity:0;';
    el.style.color = couleur;
    el.style.fontFamily = opts.font || POLICE;
    el.style.fontSize = taille + 'px';
    el.style.fontWeight = String(opts.weight || 800);
    el.style.textShadow = ombre;
    document.body.appendChild(el);
    // on garde le texte entier à l'écran (bord gauche / droit). Sa taille
    // est estimée plutôt que mesurée : mesurer forcerait un recalcul de la
    // page, coûteux au milieu d'une cascade d'effets.
    var nbCar = Array.from ? Array.from(el.textContent).length : el.textContent.length;
    var w = Math.max(taille, nbCar * taille * 0.62), h = taille * 1.05, vw = root.innerWidth || w;
    var x = borne(pt.x - w / 2, 6, Math.max(6, vw - w - 6)), y = pt.y - h / 2;
    el.style.left = x.toFixed(1) + 'px';
    el.style.top = y.toFixed(1) + 'px';
    function retirer() { if (el.parentNode) el.parentNode.removeChild(el); }
    if (reduced()) {
      // pas de mouvement : le texte apparaît, reste lisible un instant, puis s'efface
      jouer(el, [{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }],
        { duration: Math.min(duree, 900), fill: 'forwards' }).then(retirer);
      return fait();
    }
    function tr(k, s) { return 'translateY(' + (dy * k).toFixed(1) + 'px) scale(' + s + ')'; }
    return jouer(el, [
      { transform: tr(0, 0.3), opacity: 0, easing: 'cubic-bezier(.2, 1.3, .4, 1)' },
      { transform: tr(0.12, 1.2), opacity: 1, offset: 0.15, easing: 'ease-in-out' },
      { transform: tr(0.2, 0.95), opacity: 1, offset: 0.27, easing: 'ease-out' },
      { transform: tr(0.3, 1), opacity: 1, offset: 0.38, easing: 'cubic-bezier(.35, 0, .65, 1)' },
      { transform: tr(0.76, 1), opacity: 1, offset: 0.76, easing: 'ease-in' },
      { transform: tr(1, 0.92), opacity: 0 }
    ], { duration: duree, fill: 'forwards' }).then(retirer);
  }

  /* ---- clone visuel d'un élément (styles calculés recopiés : il garde son
     apparence même hors de son conteneur) ---- */
  var IGNORE_RACINE = /^(position|inset|top|right|bottom|left|margin|z-index|pointer-events|transform|translate|rotate|scale|offset|visibility|contain|content-visibility)/;
  var IGNORE_TOUS = /^(transition|animation|will-change|view-transition)/;

  function copierStyles(src, dst, racine) {
    var cs = root.getComputedStyle(src), st = dst.style;
    for (var i = 0; i < cs.length; i++) {
      var nom = cs[i];
      if (!racine && nom.charCodeAt(0) === 45 && nom.charCodeAt(1) === 45) continue; // variables : héritées
      if (IGNORE_TOUS.test(nom) || (racine && IGNORE_RACINE.test(nom))) continue;
      st.setProperty(nom, cs.getPropertyValue(nom));
    }
  }

  function sansIds(el) {
    el.removeAttribute('id');
    el.removeAttribute('data-fx-id');
    var l = el.querySelectorAll('[id],[data-fx-id]');
    for (var i = 0; i < l.length; i++) { l[i].removeAttribute('id'); l[i].removeAttribute('data-fx-id'); }
  }

  function cloneVisuel(src, avecStyles) {
    var el = src.cloneNode(true);
    sansIds(el);
    var base = 'none', w = src.offsetWidth, h = src.offsetHeight;
    var cs = root.getComputedStyle(src);
    if (avecStyles) {
      copierStyles(src, el, true);
      var a = src.querySelectorAll('*'), b = el.querySelectorAll('*');
      if (a.length === b.length && a.length <= 80) {
        for (var i = 0; i < a.length; i++) copierStyles(a[i], b[i], false);
      }
      if (cs.display === 'inline') el.style.display = 'inline-block';
    }
    // on ne garde que la partie linéaire (rotation, échelle) du transform d'origine,
    // appliquée autour du centre : le clone se pose exactement sur la source.
    // Une mise à l'échelle héritée d'un ancêtre (plateau réduit) est compensée.
    var m = /^matrix\(([^)]+)\)$/.exec(cs.transform || ''), ma = 1, mb = 0, mc = 0, md = 1;
    if (m) {
      var v = m[1].split(',');
      ma = +v[0]; mb = +v[1]; mc = +v[2]; md = +v[3];
    }
    var rs = src.getBoundingClientRect();
    if (w && h && rs.width && rs.height) {
      var bw = Math.abs(ma) * w + Math.abs(mc) * h, bh = Math.abs(mb) * w + Math.abs(md) * h;
      var k = bw && bh ? (rs.width / bw + rs.height / bh) / 2 : 1;
      if (fini(k) && k > 0 && Math.abs(k - 1) > 0.02) { ma *= k; mb *= k; mc *= k; md *= k; }
    }
    if (m || ma !== 1 || md !== 1) {
      base = 'matrix(' + ma.toFixed(5) + ',' + mb.toFixed(5) + ',' + mc.toFixed(5) + ',' + md.toFixed(5) + ',0,0)';
    }
    // les canevas se clonent vides : on recopie leurs pixels
    var cvs = src.tagName === 'CANVAS' ? [src] : src.querySelectorAll('canvas');
    var cvd = el.tagName === 'CANVAS' ? [el] : el.querySelectorAll('canvas');
    for (var j = 0; j < cvs.length && j < cvd.length; j++) {
      try { cvd[j].getContext('2d').drawImage(cvs[j], 0, 0); } catch (e) {}
    }
    if (!w || !h) {
      var r = src.getBoundingClientRect();
      w = r.width; h = r.height;
      base = 'none';
    }
    return { el: el, w: w, h: h, base: base };
  }

  /*
   * flyTo(from, to, opts) : fait voler un clone de `from` (ou opts.html) en
   * arc jusqu'à `to`. Résolue avec le clone si keep, sinon avec null.
   *   html, duration = 520, arc = 0.25, scaleTo = 1 (ou 'auto' : taille de la
   *   cible), rotate = 0, easing, keep = false, lift = 0.08, styles = true
   */
  function flyTo(from, to, opts) {
    opts = opts || {};
    if (!navigateur() || !document.body) return fait(null);
    var a = centre(from), b = centre(to);
    if (!a || !b || (opts.html == null && !estElement(from))) return fait(null);
    var v;
    try {
      if (opts.html != null) {
        var d = document.createElement('div');
        d.innerHTML = String(opts.html);
        v = { el: d, w: 0, h: 0, base: 'none' };
      } else {
        v = cloneVisuel(from, opts.styles !== false);
      }
    } catch (e) { return fait(null); }
    var el = v.el, st = el.style, garder = !!opts.keep;
    el.setAttribute(MARQUE, 'vol');
    el.setAttribute('aria-hidden', 'true');
    st.position = 'fixed';
    st.left = '0px'; st.top = '0px'; st.right = 'auto'; st.bottom = 'auto';
    st.margin = '0';
    st.zIndex = '10000';
    st.pointerEvents = 'none';
    st.transition = 'none';
    st.animation = 'none';
    st.visibility = 'visible';
    st.transformOrigin = '50% 50%';
    st.willChange = 'transform';
    if (v.w && v.h) { st.width = v.w + 'px'; st.height = v.h + 'px'; st.boxSizing = 'border-box'; }
    document.body.appendChild(el);
    if (!v.w || !v.h) { v.w = el.offsetWidth; v.h = el.offsetHeight; }
    st.left = (a.x - v.w / 2).toFixed(2) + 'px';
    st.top = (a.y - v.h / 2).toFixed(2) + 'px';
    var suffixe = v.base !== 'none' ? ' ' + v.base : '';

    var s1 = opts.scaleTo === 'auto' && b.w && b.h && v.w && v.h
      ? Math.min(b.w / v.w, b.h / v.h) : borne(nombre(opts.scaleTo, 1), 0.01, 20);
    var rot = nombre(opts.rotate, 0);
    var dx = b.x - a.x, dy = b.y - a.y;
    function tr(x, y, r, s) {
      return 'translate(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px) rotate(' + r.toFixed(2) + 'deg) scale(' + s.toFixed(4) + ')' + suffixe;
    }
    var finale = tr(dx, dy, rot, s1);
    function retirer() { if (el.parentNode) el.parentNode.removeChild(el); }

    if (reduced()) {
      if (!garder) { retirer(); return fait(null); }
      st.transform = finale;
      fonduCourt(el, true);
      return fait(el);
    }

    var dist = Math.sqrt(dx * dx + dy * dy), arc = nombre(opts.arc, 0.25);
    var nx = 0, ny = 0;
    if (dist > 0.5) {
      nx = dy / dist; ny = -dx / dist;               // perpendiculaire au trajet…
      if (ny > 0 || (ny === 0 && nx > 0)) { nx = -nx; ny = -ny; } // …tournée vers le haut
    }
    var bx = dx / 2 + nx * arc * dist * 2, by = dy / 2 + ny * arc * dist * 2; // point de contrôle
    var lift = dist > 30 ? nombre(opts.lift, 0.08) : 0;
    var images = [], N = 16;
    for (var i = 0; i <= N; i++) {
      var t = i / N, u = 1 - t;
      images.push({
        transform: tr(2 * u * t * bx + t * t * dx, 2 * u * t * by + t * t * dy, rot * t,
          1 + (s1 - 1) * t + lift * Math.sin(Math.PI * t)),
        offset: t
      });
    }
    var duree = borne(nombre(opts.duration, 520), 40, 10000);
    return jouer(el, images, {
      duration: duree, easing: opts.easing || 'cubic-bezier(.45, .05, .25, 1)', fill: 'forwards'
    }).then(function (anim) {
      if (!garder) { retirer(); return null; }
      st.transform = finale;
      st.willChange = 'auto';
      if (anim) { try { anim.cancel(); } catch (e) {} }
      return el;
    });
  }

  /* Format par défaut : entier à la française, espace fine insécable pour les milliers. */
  function formatFr(n) {
    n = Math.round(+n || 0);
    var s = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202F');
    return (n < 0 ? '-' : '') + s;
  }

  var comptes = typeof WeakMap === 'function' ? new WeakMap() : null;

  /* countUp(el, from, to, ms = 700, format) : fait défiler un nombre. */
  function countUp(el, de, a, ms, format) {
    if (typeof ms === 'function') { format = ms; ms = undefined; }
    if (typeof format !== 'function') format = formatFr;
    if (!estElement(el)) return fait();
    var v0 = nombre(de, 0), v1 = nombre(a, 0), d = borne(nombre(ms, 700), 0, 60000);
    function ecrire(v) {
      var s;
      try { s = String(format(Math.round(v))); } catch (e) { s = formatFr(v); }
      if (el.textContent !== s) el.textContent = s;
    }
    var ancien = comptes && comptes.get(el);
    if (ancien) ancien();
    if (!navigateur() || reduced() || d === 0 || v0 === v1 || typeof root.requestAnimationFrame !== 'function') {
      ecrire(v1);
      return fait();
    }
    return new Promise(function (resolve) {
      var t0 = 0, raf = 0, filet = 0;
      function arret() {
        root.cancelAnimationFrame(raf);
        clearTimeout(filet);
        if (comptes && comptes.get(el) === arret) comptes['delete'](el);
        resolve();
      }
      function finir() { ecrire(v1); arret(); }
      function pas(t) {
        if (!t0) t0 = t;
        var k = Math.min(1, (t - t0) / d), e = 1 - Math.pow(1 - k, 3);
        if (k >= 1) { finir(); return; }
        ecrire(v0 + (v1 - v0) * e);
        raf = root.requestAnimationFrame(pas);
      }
      if (comptes) comptes.set(el, arret);
      filet = setTimeout(finir, d + 600);
      ecrire(v0);
      raf = root.requestAnimationFrame(pas);
    });
  }

  /*
   * stagger(els, opts) : entrée échelonnée (fondu + montée de 12 px + léger zoom).
   *   gap = 40, duration = 380, from = 'up' | 'down' | 'left' | 'right' | 'none',
   *   max = 900 (étalement total maximal, en ms)
   */
  function stagger(els, opts) {
    opts = opts || {};
    var liste = enTableau(els);
    if (!liste.length || !navigateur()) return fait();
    var red = reduced();
    var gap = borne(nombre(opts.gap, 40), 0, 2000), duree = borne(nombre(opts.duration, 380), 60, 5000);
    var etalement = borne(nombre(opts.max, 900), 0, 20000);
    if (liste.length > 1 && gap * (liste.length - 1) > etalement) gap = etalement / (liste.length - 1);
    var o = decalage(opts.from || 'up', 12), tout = [];
    for (var i = 0; i < liste.length; i++) {
      var el = liste[i];
      if (!animable(el)) continue;
      if (red) { fonduCourt(el, true); continue; }
      var delai = Math.round(i * gap);
      tout.push(jouer(el, [{ opacity: 0, offset: 0 }],
        { duration: Math.round(duree * 0.8), delay: delai, easing: 'ease-out', fill: 'backwards' }));
      tout.push(jouer(el, [imageTranslation(o[0], o[1], 'scale(.96)'), imageTranslation(0, 0, 'scale(1)')],
        { duration: duree, delay: delai, easing: DOUX, fill: 'backwards', composite: 'add' }));
    }
    return Promise.all(tout).then(rien);
  }

  /*
   * flip(els, change, opts) : mesure els, exécute change() (qui modifie le DOM,
   * éventuellement de façon asynchrone), puis anime chaque élément de son
   * ancienne position à la nouvelle. Si le DOM est reconstruit, les éléments
   * sont retrouvés par leur attribut data-fx-id. Avec un sélecteur, les
   * nouveaux venus apparaissent en fondu.
   *   opts : duration = 420, easing
   */
  var envols = typeof WeakMap === 'function' ? new WeakMap() : null;

  function flip(els, change, opts) {
    opts = opts || {};
    if (typeof change !== 'function') return fait();
    if (!navigateur() || reduced()) {
      return new Promise(function (res) { res(change()); }).then(rien);
    }
    var selecteur = typeof els === 'string' ? els : null;
    var avant = enTableau(els), mesures = [];
    for (var i = 0; i < avant.length; i++) {
      mesures.push({ el: avant[i], id: avant[i].getAttribute('data-fx-id'), r: avant[i].getBoundingClientRect() });
    }
    var retour;
    try { retour = change(); } catch (e) { return Promise.reject(e); }
    return Promise.resolve(retour).then(function () { return jouerFlip(mesures, selecteur, opts); });
  }

  function indexerIds() {
    var idx = {}, l = document.querySelectorAll('[data-fx-id]');
    for (var i = 0; i < l.length; i++) {
      var id = l[i].getAttribute('data-fx-id');
      if (!idx.hasOwnProperty(id) && !l[i].hasAttribute(MARQUE)) idx[id] = l[i];
    }
    return idx;
  }

  function jouerFlip(mesures, selecteur, opts) {
    var duree = borne(nombre(opts.duration, 420), 60, 5000), easing = opts.easing || DOUX;
    var index = null, cibles = [], i, el;
    for (i = 0; i < mesures.length; i++) {
      var m = mesures[i];
      el = m.el;
      if (m.id !== null && (!el.isConnected || el.getAttribute('data-fx-id') !== m.id)) {
        if (!index) index = indexerIds();
        el = index.hasOwnProperty(m.id) ? index[m.id] : null;
      }
      if (!el || !el.isConnected) continue;
      var ancienne = envols && envols.get(el);
      if (ancienne) { try { ancienne.cancel(); } catch (e) {} }
      cibles.push({ el: el, r: m.r });
    }
    // lectures groupées (une seule mise en page), puis écritures
    var apres = [];
    for (i = 0; i < cibles.length; i++) apres.push(cibles[i].el.getBoundingClientRect());
    var tout = [], connus = [];
    for (i = 0; i < cibles.length; i++) {
      var a = cibles[i].r, b = apres[i];
      el = cibles[i].el;
      connus.push(el);
      var dx = (a.left + a.width / 2) - (b.left + b.width / 2), dy = (a.top + a.height / 2) - (b.top + b.height / 2);
      var sx = b.width > 0 && a.width > 0 ? a.width / b.width : 1, sy = b.height > 0 && a.height > 0 ? a.height / b.height : 1;
      var taille = Math.abs(sx - 1) > 0.01 || Math.abs(sy - 1) > 0.01;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && !taille) continue;
      var t0 = taille ? 'scale(' + sx.toFixed(4) + ',' + sy.toFixed(4) + ')' : 'scale(1)';
      tout.push(jouer(el, [imageTranslation(dx.toFixed(2), dy.toFixed(2), t0), imageTranslation(0, 0, 'scale(1)')],
        { duration: duree, easing: easing, composite: 'add' },
        (function (e) { return function (anim) { if (envols) envols.set(e, anim); }; })(el)));
    }
    if (selecteur) {
      var nouveaux = enTableau(selecteur);
      for (i = 0; i < nouveaux.length; i++) {
        if (connus.indexOf(nouveaux[i]) < 0) {
          tout.push(jouer(nouveaux[i], [{ opacity: 0, offset: 0 }], { duration: duree * 0.8, easing: 'ease-out' }));
          tout.push(jouer(nouveaux[i], [{ transform: 'scale(.85)' }, { transform: 'scale(1)' }],
            { duration: duree, easing: DOUX, composite: 'add' }));
        }
      }
    }
    return Promise.all(tout).then(rien);
  }

  /* ================================================================
   * Secousse de l'écran
   * ================================================================ */

  var IGNORES = { SCRIPT: 1, STYLE: 1, LINK: 1, META: 1, TEMPLATE: 1, NOSCRIPT: 1 };

  function couvreEcran(el) {
    var r = el.getBoundingClientRect();
    return r.left <= 1 && r.top <= 1 && r.right >= (root.innerWidth || 0) - 1 && r.bottom >= (root.innerHeight || 0) - 1;
  }

  /*
   * Quoi secouer ? Un transform (même `translate`) sur un ancêtre d'un
   * élément position:fixed le fait sauter (il se place alors par rapport à
   * cet ancêtre, pas à l'écran) : c'est le cas de document.body dès que la
   * page défile. On secoue donc les plus grands sous-arbres qui ne
   * contiennent aucun élément fixe, plus les calques fixes plein écran
   * (fenêtres) ; les petits éléments fixes (barres, toasts) restent immobiles.
   */
  function ciblesSecousse() {
    var corps = document.body, fixes = [], porteurs = [], compte = 0;
    var ensFixes = typeof Set === 'function' ? new Set() : null, ensPorteurs = typeof Set === 'function' ? new Set() : null;
    function estFixe(e) { return ensFixes ? ensFixes.has(e) : fixes.indexOf(e) >= 0; }
    function estPorteur(e) { return ensPorteurs ? ensPorteurs.has(e) : porteurs.indexOf(e) >= 0; }
    function marquer(e) { if (ensPorteurs) ensPorteurs.add(e); else porteurs.push(e); }
    function pseudoFixe(e) {
      try {
        return root.getComputedStyle(e, '::before').position === 'fixed' ||
          root.getComputedStyle(e, '::after').position === 'fixed';
      } catch (x) { return false; }
    }
    function parcourir(el, profondeur) {
      for (var c = el.firstElementChild; c; c = c.nextElementSibling) {
        if (++compte > 6000) return;
        if (IGNORES[c.tagName]) continue;
        var cs = root.getComputedStyle(c);
        if (cs.display === 'none') continue;
        if (cs.position === 'fixed' || (profondeur === 0 && pseudoFixe(c))) {
          if (cs.position === 'fixed') { if (ensFixes) ensFixes.add(c); else fixes.push(c); }
          else marquer(c);
          for (var p = c.parentElement; p && !estPorteur(p); p = p.parentElement) marquer(p);
        }
        if (c.firstElementChild && c.namespaceURI === HTML_NS) parcourir(c, profondeur + 1);
      }
    }
    if (pseudoFixe(corps)) marquer(corps);
    parcourir(corps, 0);
    var out = [];
    function choisir(el) {
      if (!estPorteur(el)) { out.push(el); return; }
      for (var c = el.firstElementChild; c && out.length < 60; c = c.nextElementSibling) {
        if (IGNORES[c.tagName] || c.hasAttribute(MARQUE)) continue;
        if (estFixe(c)) { if (couvreEcran(c)) out.push(c); continue; }
        if (!c.getClientRects().length) continue; // non affiché
        choisir(c); // un porteur (fixe à l'intérieur) n'est pas secoué lui-même : on descend
      }
    }
    choisir(corps);
    return out;
  }

  /* shakeScreen(force = 1) : secoue brièvement tout l'écran. */
  function shakeScreen(force) {
    if (!navigateur() || !document.body || reduced()) return fait();
    var f = borne(nombre(force, 1), 0.1, 3), a = 7 * f, cibles;
    try { cibles = ciblesSecousse(); } catch (e) { cibles = [document.body]; }
    var pts = [[0, 0], [-a, a * 0.35], [a * 0.9, -a * 0.45], [-a * 0.75, -a * 0.3], [a * 0.55, a * 0.5],
      [-a * 0.35, -a * 0.2], [a * 0.18, a * 0.12], [0, 0]];
    var images = [];
    for (var i = 0; i < pts.length; i++) {
      var im = imageTranslation(pts[i][0].toFixed(2), pts[i][1].toFixed(2));
      im.easing = 'ease-in-out';
      images.push(im);
    }
    var tout = [];
    for (var k = 0; k < cibles.length; k++) {
      tout.push(jouer(cibles[k], images, { duration: Math.round(340 + 70 * f), composite: 'add' }));
    }
    return Promise.all(tout).then(rien);
  }

  /* ================================================================
   * Onde au toucher
   * ================================================================ */

  var SANS_ENFANTS = { INPUT: 1, IMG: 1, SELECT: 1, TEXTAREA: 1, VIDEO: 1, CANVAS: 1, IFRAME: 1, HR: 1, BR: 1, OBJECT: 1, EMBED: 1 };

  /*
   * ripple(ev, opts) : onde depuis le point touché sur ev.currentTarget
   * (ou un Element passé directement : onde depuis son centre).
   *   opts : color (défaut : couleur du texte de l'élément), opacity = .24
   */
  function ripple(ev, opts) {
    opts = opts || {};
    if (!navigateur() || !ev || !document.body) return fait();
    var el = estElement(ev) ? ev : (ev.currentTarget || ev.target);
    if (!estElement(el) || el === document.body || el === document.documentElement) return fait();
    var r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return fait();
    var clavier = ev.clientX === 0 && ev.clientY === 0 && ev.detail === 0; // clic au clavier
    var px = fini(ev.clientX) && !clavier ? borne(ev.clientX, r.left, r.right) : r.left + r.width / 2;
    var py = fini(ev.clientY) && !clavier ? borne(ev.clientY, r.top, r.bottom) : r.top + r.height / 2;
    var cs = root.getComputedStyle(el);
    var dedans = cs.position !== 'static' && el.namespaceURI === HTML_NS && !SANS_ENFANTS[el.tagName];
    var boite = document.createElement('span'), x, y, w, h;
    boite.setAttribute(MARQUE, 'onde');
    boite.setAttribute('aria-hidden', 'true');
    if (dedans) {
      // un conteneur absolu dans l'élément (déjà positionné) : aucune incidence sur la mise en page
      var kx = el.offsetWidth ? el.offsetWidth / r.width : 1, ky = el.offsetHeight ? el.offsetHeight / r.height : 1;
      x = (px - r.left) * kx - (el.clientLeft || 0);
      y = (py - r.top) * ky - (el.clientTop || 0);
      w = el.clientWidth || r.width;
      h = el.clientHeight || r.height;
      boite.style.cssText = 'position:absolute;left:0;top:0;right:0;bottom:0;margin:0;padding:0;overflow:hidden;' +
        'border-radius:inherit;pointer-events:none;';
    } else {
      // élément statique ou sans enfants : un calque fixe posé exactement dessus
      x = px - r.left; y = py - r.top; w = r.width; h = r.height;
      boite.style.cssText = 'position:fixed;margin:0;padding:0;overflow:hidden;pointer-events:none;z-index:9998;' +
        'left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' + r.height + 'px;';
      boite.style.borderRadius = cs.borderRadius;
    }
    boite.style.color = opts.color || cs.color;
    var R = Math.sqrt(Math.max(x * x + y * y, (w - x) * (w - x) + y * y, x * x + (h - y) * (h - y),
      (w - x) * (w - x) + (h - y) * (h - y)));
    var onde = document.createElement('span');
    onde.style.cssText = 'position:absolute;display:block;border-radius:50%;background:currentColor;opacity:0;' +
      'pointer-events:none;margin:0;padding:0;will-change:transform,opacity;' +
      'left:' + (x - R).toFixed(1) + 'px;top:' + (y - R).toFixed(1) + 'px;width:' + (2 * R).toFixed(1) +
      'px;height:' + (2 * R).toFixed(1) + 'px;';
    boite.appendChild(onde);
    (dedans ? el : document.body).appendChild(boite);
    function retirer() { if (boite.parentNode) boite.parentNode.removeChild(boite); }
    var op = borne(nombre(opts.opacity, 0.24), 0, 1);
    if (reduced()) {
      jouer(onde, [{ opacity: op * 0.7 }, { opacity: 0 }], { duration: 120 }).then(retirer);
      return fait();
    }
    // l'onde s'étend vite (55 % du temps) puis s'estompe
    return jouer(onde, [
      { transform: 'scale(.06)', opacity: op, easing: 'cubic-bezier(.2, .7, .3, 1)' },
      { transform: 'scale(1)', opacity: op * 0.9, offset: 0.55, easing: 'ease-in-out' },
      { transform: 'scale(1)', opacity: 0 }
    ], { duration: Math.round(borne(460 + R * 1.2, 520, 900)), fill: 'forwards' }).then(retirer);
  }

  var ondesAuto = [], ecouteOndes = null;

  /* autoRipple(selector, opts) : onde automatique sur tous les éléments qui
     correspondent (délégation sur document) ; renvoie une fonction d'arrêt. */
  function autoRipple(selecteur, opts) {
    if (!navigateur() || !selecteur || typeof selecteur !== 'string') return rien;
    for (var i = 0; i < ondesAuto.length; i++) {
      if (ondesAuto[i].sel === selecteur) { ondesAuto[i].opts = opts; return ondesAuto[i].off; }
    }
    var entree = { sel: selecteur, opts: opts, off: null };
    entree.off = function () {
      var k = ondesAuto.indexOf(entree);
      if (k >= 0) ondesAuto.splice(k, 1);
      if (!ondesAuto.length && ecouteOndes) {
        document.removeEventListener('pointerdown', ecouteOndes, true);
        ecouteOndes = null;
      }
    };
    ondesAuto.push(entree);
    if (!ecouteOndes) {
      ecouteOndes = function (ev) {
        if (ev.button > 0) return; // clic droit / molette
        var t = ev.target;
        if (!t || typeof t.closest !== 'function') return;
        for (var k = 0; k < ondesAuto.length; k++) {
          var cible = null;
          try { cible = t.closest(ondesAuto[k].sel); } catch (e) { cible = null; }
          if (cible && !cible.disabled && cible.getAttribute('aria-disabled') !== 'true') {
            try { ripple({ currentTarget: cible, clientX: ev.clientX, clientY: ev.clientY }, ondesAuto[k].opts); } catch (e) {}
            return;
          }
        }
      };
      document.addEventListener('pointerdown', ecouteOndes, { capture: true, passive: true });
    }
    return entree.off;
  }

  /* ================================================================
   * Célébration
   * ================================================================ */

  /* celebrate(opts) : confetti(opts) + son (opts.sound = 'win' ; false : muet)
     + vibration « success ». */
  function celebrate(opts) {
    opts = opts || {};
    var g = root.GG || GG;
    try { if (opts.sound !== false && g.sfx && typeof g.sfx.play === 'function') g.sfx.play(opts.sound || 'win'); } catch (e) {}
    try { if (typeof g.haptic === 'function') g.haptic('success'); } catch (e) {}
    return confetti(opts);
  }

  /* ================================================================
   * Exports
   * ================================================================ */

  var fx = {
    reduced: reduced,
    confetti: confetti,
    burst: burst,
    floatText: floatText,
    pop: pop,
    shake: shake,
    pulse: pulse,
    bounceIn: bounceIn,
    fadeIn: fadeIn,
    slideIn: slideIn,
    glow: glow,
    flyTo: flyTo,
    countUp: countUp,
    stagger: stagger,
    flip: flip,
    shakeScreen: shakeScreen,
    ripple: ripple,
    autoRipple: autoRipple,
    celebrate: celebrate,
    clear: clear,
    stats: stats,
    format: formatFr,
    prepare: prechauffer,
    palette: PALETTE.slice()
  };

  GG.fx = fx;

  // en navigateur : lutins pré-dessinés peu après le chargement, pendant les temps morts
  if (navigateur() && typeof root.addEventListener === 'function') {
    var plusTard = function () { setTimeout(prechauffer, 1200); };
    if (document.readyState === 'complete') plusTard();
    else root.addEventListener('load', plusTard, { once: true });
  }

  if (typeof module === 'object' && module.exports) module.exports = fx;
})(typeof self !== 'undefined' ? self : globalThis);
