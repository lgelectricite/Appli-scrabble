/*
 * GGgames — 8 américain (2 à 5 joueurs).
 * Recouvrez la carte du dessus par la même couleur ou la même valeur.
 * 8 = joker (on choisit la couleur), Valet = saute le suivant, As = change
 * de sens, 2 = le suivant pioche 2 (cumulable). La 1re carte retournée
 * applique aussi son effet. Règles maison réglées par l'hôte avant la
 * première carte : score cible, annonce « Carte ! », interdit de finir sur
 * un 8, le 10 fait rejouer. Les mains adverses et la pioche restent
 * secrètes (redact). IA à trois niveaux ; la difficile compte les cartes.
 */
(function (root) {
  'use strict';
  var GG = root.GG;

  var SUITS = ['♠', '♥', '♦', '♣']; // même ordre que GG.carte : pique, cœur, carreau, trèfle
  var RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'V', 'D', 'R', 'A'];
  var NOMS_COUL = ['pique', 'cœur', 'carreau', 'trèfle'];
  var NOMS_RANG = { V: 'Valet', D: 'Dame', R: 'Roi', A: 'As' };
  var CIBLES = [100, 300, 500];
  var REGLES_DEFAUT = { cible: 300, carte: true, fin8: false, dix: false };
  var ORDRE_COUL = { '♠': 0, '♥': 1, '♣': 2, '♦': 3 }; // tri de la main : couleurs alternées

  function newDeck() {
    var d = [];
    SUITS.forEach(function (s) {
      RANKS.forEach(function (r) { d.push({ r: r, s: s }); });
    });
    return GG.shuffle(d);
  }

  function cardValue(c) {
    if (c.r === '8') return 50;
    if (c.r === 'V' || c.r === 'D' || c.r === 'R') return 10;
    if (c.r === 'A') return 1;
    return parseInt(c.r, 10) || 0;
  }

  function nomCarte(c) {
    return (NOMS_RANG[c.r] || c.r) + ' ' + c.s;
  }

  function top(state) { return state.discard[state.discard.length - 1]; }

  /* règles maison de la partie (une vieille sauvegarde n'en a pas) */
  function regles(state) {
    var r = state.regles || {};
    return {
      cible: CIBLES.indexOf(r.cible) !== -1 ? r.cible : REGLES_DEFAUT.cible,
      carte: r.carte === undefined ? REGLES_DEFAUT.carte : !!r.carte,
      fin8: !!r.fin8,
      dix: !!r.dix
    };
  }

  /* la carte c peut-elle être posée ? main : la main du joueur (règle
     « interdit de finir sur un 8 ») */
  function playable(state, c, main) {
    if (state.pending2 > 0) return c.r === '2';
    if (c.r === '8') {
      if (main && main.length === 1 && regles(state).fin8) return false;
      return true;
    }
    var t = top(state);
    var suit = state.chosenSuit || t.s;
    return c.s === suit || c.r === t.r;
  }

  /* pioche n cartes pour le joueur i ; retourne le nombre réellement pioché */
  function drawCards(state, i, n) {
    var got = 0;
    for (var k = 0; k < n; k++) {
      if (!state.pile.length) {
        // on rebat la défausse (sauf la carte du dessus)
        if (state.discard.length > 1) {
          var t = state.discard.pop();
          state.pile = GG.shuffle(state.discard);
          state.discard = [t];
        }
      }
      if (!state.pile.length) break;
      state.players[i].hand.push(state.pile.pop());
      got++;
    }
    return got;
  }

  function advance(state, steps) {
    var n = state.players.length;
    state.current = ((state.current + state.dir * steps) % n + n) % n;
    state.hasDrawn = false;
    state.annonce = -1;
  }

  function nom(state, i) { return state.players[i] ? state.players[i].name : '?'; }

  function deal(state) {
    var n = state.players.length;
    state.pile = newDeck();
    state.discard = [];
    var per = n === 2 ? 7 : 5;
    state.players.forEach(function (p) { p.hand = []; });
    for (var k = 0; k < per; k++) {
      state.players.forEach(function (p) { p.hand.push(state.pile.pop()); });
    }
    // première carte visible : jamais un 8 (il retourne sous la pioche)
    var first = state.pile.pop();
    while (first.r === '8') {
      state.pile.unshift(first);
      first = state.pile.pop();
    }
    state.discard.push(first);
    state.chosenSuit = null;
    state.pending2 = 0;
    state.dir = 1;
    state.hasDrawn = false;
    state.finished = false;
    state.winner = -1;
    state.lastGain = 0;
    state.detail = null;
    state.bloque = false;
    state.blocage = 0;
    state.annonce = -1;
    state.coups = 0;
    state.manques = state.players.map(function () { return {}; });
    var start = (state.manche - 1) % n;
    state.current = start;
    state.lastMsg = '';
    state.dernier = { t: 'donne' };
    // la première carte retournée applique son effet, comme si le
    // « donneur » (le joueur d'avant) venait de la poser
    if (first.r === '2') {
      state.pending2 = 2;
      state.lastMsg = 'Première carte : un 2 ! ' + nom(state, start) + ' pioche 2 cartes… ou pose un 2.';
      state.dernier = { t: 'donne', effet: '2' };
    } else if (first.r === 'V') {
      state.lastMsg = 'Première carte : un Valet ! ' + nom(state, start) + ' passe son tour.';
      state.dernier = { t: 'donne', effet: 'V', saute: start };
      advance(state, 1);
    } else if (first.r === 'A') {
      state.dir = -1;
      state.current = (start - 1 + n) % n;
      state.lastMsg = 'Première carte : un As ! Le sens s’inverse, ' + nom(state, state.current) + ' commence.';
      state.dernier = { t: 'donne', effet: 'A' };
    }
  }

  /* fin de manche : le gagnant marque la valeur des cartes restant chez les autres */
  function finManche(state, w) {
    state.finished = true;
    state.winner = w;
    var gain = 0;
    var detail = state.players.map(function (x, xi) {
      if (xi === w) return 0;
      var v = 0;
      x.hand.forEach(function (cc) { v += cardValue(cc); });
      gain += v;
      return v;
    });
    state.players[w].score += gain;
    state.lastGain = gain;
    state.detail = detail;
    var R = regles(state);
    if (R.cible && state.players[w].score >= R.cible) state.fini = true;
  }

  /* pioche et défausse épuisées, plus personne ne peut rien faire : la
     main la plus légère remporte la manche */
  function manchebloquee(state) {
    var meilleur = 0, min = Infinity;
    state.players.forEach(function (p, i) {
      var v = 0;
      p.hand.forEach(function (c) { v += cardValue(c); });
      if (v < min) { min = v; meilleur = i; }
    });
    state.bloque = true;
    finManche(state, meilleur);
    var tot = 0;
    state.detail = state.players.map(function (p, i) {
      if (i === meilleur) return 0;
      var v = 0;
      p.hand.forEach(function (c) { v += cardValue(c); });
      return v;
    });
    state.detail.forEach(function (v) { tot += v; });
    state.lastMsg = 'Plus aucune carte à piocher : la main la plus légère gagne.';
    return tot;
  }

  /* petit hachage déterministe (décisions « humaines » de l'IA, stables d'un appel à l'autre) */
  function hache(a, b, c) {
    var h = (a * 374761393 + b * 668265263 + (c || 0) * 2147483647) | 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    h = h ^ (h >>> 16);
    return ((h >>> 0) % 10000) / 10000;
  }

  /* ======================= IA ======================= */

  function compteCouleurs(main, sauf) {
    var cnt = { '♠': 0, '♥': 0, '♦': 0, '♣': 0 };
    main.forEach(function (x, xi) { if (xi !== sauf && x.r !== '8') cnt[x.s]++; });
    return cnt;
  }

  function nbCartes(p) { return p.hand ? p.hand.length : (p.cards || 0); }

  /* choix de la couleur d'un 8 */
  function couleurPour8(state, me, idx8, niveau) {
    var main = state.players[me].hand;
    var cnt = compteCouleurs(main, idx8);
    if (niveau === 'facile') {
      var dispo = SUITS.filter(function (su) { return cnt[su] > 0; });
      if (!dispo.length) dispo = SUITS;
      return dispo[Math.floor(Math.random() * dispo.length)];
    }
    var n = state.players.length;
    var suiv = ((me + state.dir) % n + n) % n;
    var manq = (state.manques && state.manques[suiv]) || {};
    var inconnus = niveau === 'difficile' ? inconnusParCouleur(state, me) : null;
    var best = SUITS[0], note = -Infinity;
    SUITS.forEach(function (su) {
      var sc = cnt[su] * 2 + Math.random() * 0.3;
      if (niveau === 'difficile') {
        if (manq[su]) sc += 3;               // le suivant n'en a (sans doute) pas
        sc -= inconnus[su] * 0.12;           // couleur rare chez les autres
      }
      if (sc > note) { note = sc; best = su; }
    });
    return best;
  }

  /* cartes encore invisibles pour moi, par couleur (compte des cartes jouées) */
  function inconnusParCouleur(state, me) {
    var vus = {};
    state.discard.forEach(function (c) { vus[c.r + c.s] = true; });
    state.players[me].hand.forEach(function (c) { vus[c.r + c.s] = true; });
    var res = { '♠': 0, '♥': 0, '♦': 0, '♣': 0 };
    res.parRang = {};
    res.total = 0;
    res.huit = 0;
    RANKS.forEach(function (r) { res.parRang[r] = 0; });
    SUITS.forEach(function (su) {
      RANKS.forEach(function (r) {
        if (vus[r + su]) return;
        res.total++;
        if (r === '8') { res.huit++; return; }
        res[su]++;
        res.parRang[r]++;
      });
    });
    res.deux = res.parRang['2'];
    return res;
  }

  /* probabilité qu'une main de k cartes, tirée parmi U cartes inconnues,
     contienne au moins une des m cartes utiles (loi hypergéométrique) */
  function pRiposte(U, m, k) {
    if (m <= 0 || k <= 0) return 0;
    if (k > U - m) return 1;
    var p = 1;
    for (var i = 0; i < k; i++) p *= (U - m - i) / (U - i);
    return 1 - p;
  }

  function choixFacile(state, me, jouables) {
    var main = state.players[me].hand;
    var sans8 = jouables.filter(function (i) { return main[i].r !== '8'; });
    var pool = sans8.length && Math.random() < 0.7 ? sans8 : jouables;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function choixMoyen(state, me, jouables) {
    var main = state.players[me].hand;
    var n = state.players.length;
    var suiv = state.players[((me + state.dir) % n + n) % n];
    var menace = nbCartes(suiv) <= 2;
    var meilleur = jouables[0], note = -Infinity;
    jouables.forEach(function (i) {
      var c = main[i], sc = Math.random() * 2;
      if (c.r === '8') {
        sc -= 6; // le joker attend son heure (sauf s'il est seul jouable)
      } else {
        main.forEach(function (x, xi) { // rester dans sa couleur forte
          if (xi !== i && x.r !== '8' && x.s === c.s) sc++;
        });
        sc += cardValue(c) / 12; // évacuer les cartes chères
      }
      if (c.r === '2') sc += menace ? 5 : 1; // faire piocher au bon moment
      if (c.r === 'V') sc += menace ? 4 : 0; // sauter le joueur pressé
      if (sc > note) { note = sc; meilleur = i; }
    });
    return meilleur;
  }

  /* l'IA difficile compte les cartes jouées, se souvient de qui a dû
     piocher sur quelle couleur, et garde la main sur le jeu */
  function choixDifficile(state, me, jouables) {
    var main = state.players[me].hand;
    var R = regles(state);
    var n = state.players.length;
    var suivI = ((me + state.dir) % n + n) % n;
    var precI = ((me - state.dir) % n + n) % n;
    var cSuiv = nbCartes(state.players[suivI]);
    var cPrec = nbCartes(state.players[precI]);
    var minAdv = Infinity;
    state.players.forEach(function (p, i) { if (i !== me) minAdv = Math.min(minAdv, nbCartes(p)); });
    var manq = (state.manques && state.manques[suivI]) || {};
    var inc = inconnusParCouleur(state, me);
    var meilleur = jouables[0], note = -Infinity;
    jouables.forEach(function (i) {
      var c = main[i];
      var reste = main.filter(function (x, xi) { return xi !== i; });
      var sc = Math.random() * 0.3;
      if (state.pending2 > 0) sc += 20; // riposter à un 2 plutôt que piocher
      if (c.r === '8') {
        sc -= 7;
        if (reste.length <= 1 || minAdv <= 1) sc += 7;
        var aucune = reste.every(function (x) {
          return x.r !== '8' && x.s !== (state.chosenSuit || top(state).s) && x.r !== top(state).r;
        });
        if (aucune && reste.length > 2) sc += 2;
      } else {
        // garder la main : après c, combien de mes cartes resteront jouables ?
        var suite = 0;
        reste.forEach(function (x) { if (x.r !== '8' && (x.s === c.s || x.r === c.r)) suite++; });
        sc += suite * 1.2;
        if (manq[c.s]) sc += 4;              // le suivant a déjà séché sur cette couleur
        sc += (12 - inc[c.s]) * 0.22;        // couleur rare chez les autres
        sc += cardValue(c) / (minAdv <= 3 ? 4 : 14); // se délester avant la fin
        // probabilité que le suivant puisse répondre, d'après les cartes
        // encore invisibles (compte des cartes jouées) et la taille de sa main
        if (c.r !== '2' && !((c.r === 'V' || c.r === 'A') && n === 2)) {
          var bonnes = inc.parRang[c.r] + inc.huit + (manq[c.s] ? 0 : inc[c.s]);
          sc += (1 - pRiposte(inc.total, bonnes, cSuiv)) * 9;
        }
      }
      if (c.r === '2') sc += (cSuiv <= 2 ? 6 : 1.5) + (inc.deux === 0 ? 2 : 0);
      if (c.r === 'V') sc += cSuiv <= 2 ? 5 : (n === 2 ? 2.5 : 0.5);
      if (c.r === 'A') sc += n === 2 ? 2.5 : (cPrec > cSuiv ? 1.5 : -1);
      if (c.r === '10' && R.dix) sc += 2.5;
      // ne pas finir coincé avec un 8 interdit en dernière carte
      if (R.fin8 && reste.length === 1 && reste[0].r === '8') sc -= 9;
      if (sc > note) { note = sc; meilleur = i; }
    });
    return meilleur;
  }

  /* ======================= rendu : outils ======================= */

  function esc(s) { return GG.esc(s); }

  function carteHtml(c, classe) {
    var ri = RANKS.indexOf(c && c.r), si = SUITS.indexOf(c && c.s);
    if (ri === -1 || si === -1) return GG.carteDos({ classe: classe });
    return GG.carte(ri, si, { classe: classe });
  }

  function initiale(nm) {
    var s = String(nm || '?');
    if (s.indexOf('🤖') === 0) return '🤖';
    var m = s.replace(/^\s+/, '');
    var ch = m.charAt(0);
    // une lettre accentuée ou un caractère « double » (émoji) : on garde le point de code entier
    var code = m.charCodeAt(0);
    if (code >= 0xd800 && code <= 0xdbff) ch = m.slice(0, 2);
    return ch.toUpperCase() || '?';
  }

  /* tri de la main : par couleur (alternée), puis par valeur, les 8 à la fin */
  function triMain(main) {
    return main.map(function (c, i) { return { c: c, i: i }; }).sort(function (a, b) {
      var a8 = a.c.r === '8' ? 1 : 0, b8 = b.c.r === '8' ? 1 : 0;
      if (a8 !== b8) return a8 - b8;
      var sa = ORDRE_COUL[a.c.s], sb = ORDRE_COUL[b.c.s];
      if (sa !== sb) return (sa === undefined ? 9 : sa) - (sb === undefined ? 9 : sb);
      return RANKS.indexOf(a.c.r) - RANKS.indexOf(b.c.r);
    });
  }

  /* disposition de la main en éventail, sur une ou deux rangées, sans
     jamais déborder ni défiler : chaque carte garde son coin lisible */
  function eventail(n, W, cw) {
    var ch = Math.round(cw * 1.4);
    var pasMin = cw * 0.42;
    var ANG_MAX = 9; // inclinaison des cartes du bord (degrés)
    // la rotation (pivot sous la carte, cf. CSS) écarte les coins du haut :
    // on garde cette marge de chaque côté pour que rien ne sorte de l'écran
    var marge = Math.ceil(ch * 1.25 * Math.sin(ANG_MAX * Math.PI / 180)) + 2;
    var utile = Math.max(cw, W - 2 * marge);
    var parRang = Math.max(1, Math.floor((utile - cw) / pasMin) + 1);
    var rangs = n > parRang ? 2 : 1;
    var decal = Math.round(ch * 0.5);
    var pos = [];
    var parts = rangs === 1 ? [n] : [Math.ceil(n / 2), n - Math.ceil(n / 2)];
    var k = 0;
    parts.forEach(function (m, r) {
      var pas = m > 1 ? Math.min(cw * 0.74, (utile - cw) / (m - 1)) : 0;
      var total = cw + pas * (m - 1);
      var x0 = (W - total) / 2;
      var ang = m > 1 ? Math.min(2.8, (2 * ANG_MAX) / (m - 1)) : 0;
      var mid = (m - 1) / 2;
      for (var j = 0; j < m; j++) {
        var d = j - mid;
        var arc = mid ? Math.pow(d / mid, 2) * Math.min(10, 1.4 * m) : 0;
        pos[k++] = { x: Math.round(x0 + j * pas), y: Math.round(16 + r * decal + arc), rot: +(d * ang).toFixed(2) };
      }
    });
    return { pos: pos, h: ch + 26 + (rangs - 1) * decal, ch: ch };
  }

  function son(nomSon, o) { try { GG.sfx.play(nomSon, o); } catch (e) {} }
  function vibre(t) { try { GG.haptic(t); } catch (e) {} }
  function fx() { return GG.fx; }

  var SVG_COUL = [
    '<path d="M50 4C60 20 95 38 95 61c0 14-10 22-21 22-9 0-16-5-19-11 1 11 5 19 13 24H32c8-5 12-13 13-24-3 6-10 11-19 11C15 83 5 75 5 61 5 38 40 20 50 4z"/>',
    '<path d="M50 91C21 67 4 50 4 31 4 16 15 6 28 6c10 0 18 6 22 15 4-9 12-15 22-15 13 0 24 10 24 25 0 19-17 36-46 60z"/>',
    '<path d="M50 3Q66 30 89 50 66 70 50 97 34 70 11 50 34 30 50 3z"/>',
    '<circle cx="50" cy="27" r="20"/><circle cx="26" cy="58" r="20"/><circle cx="74" cy="58" r="20"/><path d="M40 44h20l-4 18h-12z"/><path d="M47 60c0 16-5 28-14 36h34c-9-8-14-20-14-36z"/>'
  ];
  function svgCouleur(si, cls) {
    return '<svg class="' + (cls || 'hu-sym') + '" viewBox="0 0 100 100" aria-hidden="true" focusable="false">' +
      (SVG_COUL[si] || '') + '</svg>';
  }

  /* ======================= module ======================= */

  var mod = {
    id: 'huit',
    nom: '8 américain',
    icone: '🎴',
    desc: 'Le jeu de cartes des copains : même couleur ou même valeur, le 8 est joker, le 2 fait piocher. Premier à vider sa main !',
    min: 2, max: 5,
    hotseat: true, hidden: true, netOnly: false,
    noBadges: true,
    niveaux: ['facile', 'moyen', 'difficile'],
    regles: '<p><strong>🎯 Le but :</strong> être le premier à vider sa main — et marquer les points des cartes restantes chez les autres. Le premier au score cible (300 points par défaut) gagne la partie.</p>' +
      '<p><strong>Comment jouer :</strong> recouvrez la carte du dessus par une carte de la <strong>même couleur</strong> ou de la <strong>même valeur</strong>. Rien à jouer ? Piochez une carte : jouable, vous pouvez la poser, sinon passez.</p>' +
      '<p><strong>Les cartes spéciales :</strong> le <strong>8</strong> se pose sur tout et choisit la couleur · le <strong>Valet</strong> saute le joueur suivant · l’<strong>As</strong> change le sens (à deux, on rejoue) · le <strong>2</strong> fait piocher 2 cartes au suivant, et les 2 se cumulent ! La première carte retournée a aussi son effet.</p>' +
      '<p><strong>« Carte ! » :</strong> quand il ne vous reste que 2 cartes, touchez « Carte ! » avant de poser l’avant-dernière. Oubli = 2 cartes de pénalité.</p>' +
      '<p><strong>Règles maison</strong> (réglées par l’hôte pendant la première manche, bouton ⚙️ sous la main) : score cible 100, 300 ou 500 · annonce « Carte ! » · interdit de finir sur un 8 · le 10 fait rejouer.</p>' +
      '<p><strong>Les points :</strong> le gagnant de la manche marque la valeur des cartes restantes chez les autres (8 = 50, figures = 10, as = 1).</p>',

    create: function (names) {
      var state = {
        id: Math.floor(Math.random() * 1e9).toString(36),
        players: names.map(function (n) { return { name: n, hand: [], score: 0 }; }),
        manche: 1,
        regles: { cible: REGLES_DEFAUT.cible, carte: REGLES_DEFAUT.carte, fin8: false, dix: false },
        fini: false
      };
      deal(state);
      return state;
    },

    turnOf: function (state) { return state.finished || state.fini ? -1 : state.current; },
    viewerOf: function (state) { return state.finished ? 0 : state.current; },
    over: function (state) { return !!state.fini; },
    scoreOf: function (state, i) { return state.players[i].score; },

    gagnants: function (state) {
      var max = -Infinity;
      state.players.forEach(function (p) { max = Math.max(max, p.score); });
      var g = [];
      state.players.forEach(function (p, i) { if (p.score === max) g.push(i); });
      return g.length === 1 ? g : [];
    },

    summary: function (state) {
      var R = regles(state);
      var rows = state.players.map(function (p) { return { n: p.name, s: p.score }; })
        .sort(function (a, b) { return b.s - a.s; });
      return rows.map(function (r) {
        return '<div class="final-line"><span>' + esc(r.n) + '</span><strong>' +
          r.s + ' pts</strong></div>';
      }).join('') + '<p class="hint">Partie en ' + R.cible + ' points · ' + state.manche + ' manche' +
        (state.manche > 1 ? 's' : '') + '.</p><h1>🏆 ' +
        rows.filter(function (r) { return r.s === rows[0].s; })
          .map(function (r) { return esc(r.n); }).join(' & ') + '</h1>';
    },

    /* les mains adverses et la pioche ne circulent jamais */
    redact: function (state, viewer) {
      var copy = GG.clone(state);
      copy.players.forEach(function (p, i) {
        p.cards = p.hand.length;
        if (i !== viewer && !state.finished) delete p.hand;
      });
      copy.pileCount = copy.pile.length;
      delete copy.pile;
      // seules les cartes visibles sur la table sont publiques : le dessus,
      // et les deux cartes juste dessous (pour le décor de la défausse)
      copy.dessous = copy.discard.slice(-3, -1);
      copy.discard = copy.discard.slice(-1);
      return copy;
    },

    apply: function (state, player, action) {
      var R = regles(state);
      if (action.t === 'regles') {
        if (player !== 0) return { ok: false, error: 'Seul l’hôte choisit les règles maison.' };
        if (state.manche !== 1 || state.finished || state.fini) {
          return { ok: false, error: 'Les règles maison se choisissent pendant la première manche.' };
        }
        var r = action.r || {};
        state.regles = {
          cible: CIBLES.indexOf(+r.cible) !== -1 ? +r.cible : R.cible,
          carte: !!r.carte, fin8: !!r.fin8, dix: !!r.dix
        };
        return { ok: true };
      }
      if (action.t === 'again') {
        if (state.fini) return { ok: false, error: 'La partie est terminée.' };
        if (!state.finished) return { ok: false, error: 'La manche n’est pas finie.' };
        if (player !== 0) return { ok: false, error: 'L’hôte relance une manche.' };
        state.manche++;
        deal(state);
        return { ok: true };
      }
      if (state.fini) return { ok: false, error: 'Partie terminée.' };
      if (state.finished) return { ok: false, error: 'Manche terminée.' };
      if (player !== state.current) return { ok: false, error: 'Ce n’est pas votre tour.' };
      var p = state.players[player];
      if (!state.manques) state.manques = state.players.map(function () { return {}; });

      if (action.t === 'carte') {
        if (!R.carte) return { ok: false, error: 'L’annonce « Carte ! » n’est pas en jeu.' };
        if (p.hand.length !== 2) {
          return { ok: false, error: 'On annonce « Carte ! » avec 2 cartes en main, avant de poser l’avant-dernière.' };
        }
        if (state.annonce === player) return { ok: false, error: 'Déjà annoncé !' };
        state.annonce = player;
        state.coups = (state.coups || 0) + 1;
        state.dernier = { t: 'carte', p: player };
        state.lastMsg = p.name + ' annonce « Carte ! »';
        return { ok: true };
      }

      if (action.t === 'play') {
        var idx = action.i | 0;
        var c = p.hand[idx];
        if (!c) return { ok: false, error: 'Carte inconnue.' };
        if (!playable(state, c, p.hand)) {
          if (state.pending2 > 0) {
            return { ok: false, error: 'Il faut un 2… ou piocher ' + state.pending2 + ' cartes.' };
          }
          if (c.r === '8') return { ok: false, error: 'Règle maison : interdit de finir sur un 8. Piochez !' };
          return { ok: false, error: 'Il faut la même couleur ou la même valeur (ou un 8).' };
        }
        if (c.r === '8' && SUITS.indexOf(action.suit) === -1) {
          return { ok: false, error: 'Choisissez la couleur du 8.' };
        }
        p.hand.splice(idx, 1);
        state.discard.push(c);
        state.chosenSuit = c.r === '8' ? action.suit : null;
        state.coups = (state.coups || 0) + 1;
        state.blocage = 0;
        delete state.manques[player][c.s];
        var ev = { t: 'play', p: player, c: { r: c.r, s: c.s } };
        state.lastMsg = p.name + ' joue ' + nomCarte(c) +
          (c.r === '8' ? ' et demande du ' + NOMS_COUL[SUITS.indexOf(action.suit)] + ' ' + action.suit : '');
        if (c.r === '8') ev.suit = action.suit;
        // « Carte ! » oublié : 2 cartes de pénalité
        if (R.carte && p.hand.length === 1 && state.annonce !== player) {
          var pen = drawCards(state, player, 2);
          ev.oubli = pen;
          state.lastMsg += ' · oubli de « Carte ! » : +' + pen + ' cartes';
        }
        state.annonce = -1;
        state.dernier = ev;
        if (!p.hand.length) {
          finManche(state, player);
          state.lastMsg = p.name + ' pose sa dernière carte !';
          return { ok: true };
        }
        var n = state.players.length;
        if (c.r === '2') {
          state.pending2 += 2;
          ev.pending = state.pending2;
          advance(state, 1);
        } else if (c.r === 'V') {
          ev.saute = ((player + state.dir) % n + n) % n;
          if (n === 2) ev.rejoue = true;
          advance(state, 2);
        } else if (c.r === 'A') {
          state.dir = -state.dir;
          ev.sens = state.dir;
          if (n === 2) ev.rejoue = true;
          advance(state, n === 2 ? 0 : 1);
        } else if (c.r === '10' && R.dix) {
          ev.rejoue = true;
          state.hasDrawn = false;
          state.lastMsg += ' et rejoue';
        } else {
          advance(state, 1);
        }
        return { ok: true };
      }

      if (action.t === 'draw') {
        if (state.pending2 > 0) {
          var dette = state.pending2;
          var got = drawCards(state, player, dette);
          state.lastMsg = p.name + ' pioche ' + got + ' carte' + (got > 1 ? 's' : '') + ' de pénalité';
          state.pending2 = 0;
          state.manques[player] = {};
          state.coups = (state.coups || 0) + 1;
          state.dernier = { t: 'draw', p: player, n: got, penalite: dette };
          advance(state, 1);
          return { ok: true };
        }
        if (state.hasDrawn) return { ok: false, error: 'Une seule pioche par tour : jouez ou passez.' };
        // information publique : il n'avait pas la couleur demandée
        var dem = state.chosenSuit || top(state).s;
        state.manques[player][dem] = true;
        var got1 = drawCards(state, player, 1);
        state.hasDrawn = true;
        state.coups = (state.coups || 0) + 1;
        state.dernier = { t: 'draw', p: player, n: got1 };
        state.lastMsg = p.name + ' pioche';
        if (!got1) {
          // plus aucune carte disponible : le tour passe
          state.lastMsg = p.name + ' ne peut plus piocher';
          state.blocage = (state.blocage || 0) + 1;
          if (state.blocage >= state.players.length) { manchebloquee(state); return { ok: true }; }
          advance(state, 1);
        }
        return { ok: true };
      }

      if (action.t === 'pass') {
        if (state.pending2 > 0) {
          return { ok: false, error: 'Piochez d’abord vos ' + state.pending2 + ' cartes de pénalité (ou posez un 2).' };
        }
        if (!state.hasDrawn) return { ok: false, error: 'Piochez d’abord une carte.' };
        state.lastMsg = p.name + ' passe';
        state.coups = (state.coups || 0) + 1;
        state.dernier = { t: 'pass', p: player };
        advance(state, 1);
        return { ok: true };
      }

      return { ok: false, error: 'Action inconnue.' };
    },

    /* L'adversaire IA. Il ne regarde que sa main, la défausse (cartes déjà
       jouées, publiques), les tailles de mains et qui a dû piocher sur quelle
       couleur — jamais le contenu des mains adverses ni l'ordre de la pioche.
       facile : pose au hasard, oublie souvent « Carte ! » ;
       moyen : garde sa couleur forte et ses 8 ;
       difficile : compte les cartes, vise les couleurs qui manquent au
       suivant, se déleste avant la fin et n'oublie jamais « Carte ! ». */
    bot: function (state, me, ctx) {
      if (state.finished || state.fini) return null; // l'hôte relance la manche
      if (state.current !== me) return null;
      var niveau = (ctx && ctx.niveau) || state.niveauIA || 'moyen';
      var R = regles(state);
      var main = state.players[me].hand;

      var jouables = [];
      main.forEach(function (c, i) { if (playable(state, c, main)) jouables.push(i); });

      if (!jouables.length) {
        // rien à poser : on encaisse la pénalité, ou une pioche puis on passe
        if (state.pending2 > 0 || !state.hasDrawn) return { t: 'draw' };
        return { t: 'pass' };
      }

      // « Carte ! » avant de poser l'avant-dernière (sauf trou de mémoire)
      if (R.carte && main.length === 2 && state.annonce !== me) {
        var oubli = niveau === 'facile' ? 0.4 : niveau === 'moyen' ? 0.1 : 0;
        if (hache(state.coups || 0, me, state.manche) >= oubli) return { t: 'carte' };
      }

      var choix = niveau === 'facile' ? choixFacile(state, me, jouables)
        : niveau === 'difficile' ? choixDifficile(state, me, jouables)
          : choixMoyen(state, me, jouables);
      var carte = main[choix];
      if (carte.r !== '8') return { t: 'play', i: choix };
      return { t: 'play', i: choix, suit: couleurPour8(state, me, choix, niveau) };
    },

    render: function (el, ctx) {
      var s = ctx.state;
      var me = ctx.me;
      var R = regles(s);
      var n = s.players.length;
      var my = s.players[me] || { hand: [], name: '' };
      var main = my.hand || [];
      var mine = !s.finished && !s.fini && me === s.current;
      var v = el._hu;
      if (!v || v.id !== s.id || v.me !== me && ctx.mode !== 'local') {
        v = el._hu = { id: s.id, manche: -1, coups: -1, me: me, sel8: undefined, main: null };
      }
      var nouvelleDonne = v.manche !== s.manche && !s.coups && !s.finished;
      var ev = (v.manche === s.manche && (s.coups || 0) > v.coups) ? s.dernier : null;
      var W = Math.max(280, Math.min(el.clientWidth || 380, 660));
      // mêmes seuils que la feuille de style (@media) : grandes cartes quand
      // l'écran est haut, cartes resserrées sur un petit téléphone
      var vw = root.innerWidth || W + 16, vh = root.innerHeight || 800;
      var cw = vw > 380 ? (vh >= 740 ? 76 : 68) : 60;
      var topC = s.discard[s.discard.length - 1];

      if (s.finished || s.fini) {
        rendreFin(el, ctx, s, me, R, ev, v);
        v.manche = s.manche; v.coups = s.coups || 0; v.main = null;
        return;
      }

      // ---------- adversaires ----------
      var autres = [];
      for (var k = 1; k < n; k++) autres.push((me + k) % n);
      var largSiege = Math.floor(Math.min(128, (W - 8 * (autres.length - 1)) / autres.length));
      var html = '<div class="hu-jeu' + (mine ? ' a-moi' : '') + '">';
      html += '<div class="hu-sieges">' + autres.map(function (i) {
        var pl = s.players[i];
        var nb = pl.cards !== undefined ? pl.cards : (pl.hand ? pl.hand.length : 0);
        var dos = '';
        var nd = Math.min(nb, 5);
        for (var d = 0; d < nd; d++) {
          dos += '<span class="hu-dos-mini" style="--d:' + (d - (nd - 1) / 2) + '">' + GG.carteDos({ classe: 'hu-jc-mini' }) + '</span>';
        }
        return '<div class="hu-siege' + (i === s.current ? ' turn' : '') + (nb === 1 ? ' une' : '') +
          '" data-p="' + i + '" style="width:' + largSiege + 'px" aria-label="' + esc(pl.name) + ' : ' + nb + ' carte' + (nb > 1 ? 's' : '') + '">' +
          '<span class="hu-dos" aria-hidden="true">' + dos + '</span>' +
          '<span class="hu-av hu-c' + (i % 5) + '">' + esc(initiale(pl.name)) + '<b class="hu-nb">' + nb + '</b></span>' +
          '<span class="hu-nom">' + esc(pl.name) + '</span>' +
          '<span class="hu-pts">' + (pl.score | 0) + ' pts</span>' +
          (nb === 1 ? '<span class="hu-bulle">Carte !</span>' : '') +
          '</div>';
      }).join('') + '</div>';

      // ---------- le tapis : pioche, défausse, sens ----------
      var tagCoul = '';
      if (s.chosenSuit && SUITS.indexOf(s.chosenSuit) !== -1) {
        var ci = SUITS.indexOf(s.chosenSuit);
        tagCoul = '<span class="ha-suit-tag hu-demande' + (ci === 1 || ci === 2 ? ' rouge' : '') + '" title="Couleur demandée">' +
          svgCouleur(ci) + '</span>';
      }
      var dessous = (s.dessous || s.discard.slice(-3, -1)).map(function (c, j) {
        return '<span class="hu-sous" style="--t:' + (j ? 9 : -7) + 'deg">' + carteHtml(c, 'hu-jc-l') + '</span>';
      }).join('');
      var pileN = s.pileCount !== undefined ? s.pileCount : (s.pile ? s.pile.length : 0);
      var inclin = ((s.coups || 0) * 37 % 13) - 6;
      html += '<div class="hu-tapis">' +
        (n > 2 ? '<div class="hu-sens' + (s.dir === -1 ? ' inverse' : '') + '" aria-hidden="true"><i></i><i></i></div>' : '') +
        '<button class="ha-pile hu-pioche' + (mine ? ' vive' : '') + (mine && s.pending2 > 0 ? ' dette' : '') +
        '" data-a="draw"' + (mine ? '' : ' disabled') + ' aria-label="Piocher">' +
        '<span class="hu-pile-pile">' + GG.carteDos({ classe: 'hu-jc-l' }) + GG.carteDos({ classe: 'hu-jc-l' }) +
        GG.carteDos({ classe: 'hu-jc-l' }) + '</span>' +
        '<small>' + (mine && s.pending2 > 0 ? 'Piocher +' + s.pending2 : mine && !s.hasDrawn ? 'Piocher' : pileN + ' cartes') + '</small></button>' +
        '<div class="ha-top hu-defausse">' + dessous +
        '<span class="ha-card big hu-dessus" style="--t:' + inclin + 'deg">' + carteHtml(topC, 'hu-jc-l') + '</span>' +
        tagCoul +
        (s.pending2 > 0 ? '<span class="hu-dette" aria-live="polite">+' + s.pending2 + '</span>' : '') +
        '</div></div>';

      // ---------- message ----------
      var msg = s.lastMsg ? esc(s.lastMsg) : 'La partie commence !';
      html += '<p class="hu-msg" aria-live="polite">' + msg + '</p>';
      html += '<p class="hu-tour' + (mine ? ' moi' : '') + '">' + (mine
        ? (s.pending2 > 0 ? '⚠️ À vous : posez un 2 ou piochez ' + s.pending2 + ' cartes'
          : s.hasDrawn ? 'À vous : posez une carte ou passez' : 'À vous !')
        : 'Au tour de <strong>' + esc(nom(s, s.current)) + '</strong>…') + '</p>';

      // ---------- actions ----------
      var btnCarte = mine && R.carte && main.length === 2 && s.annonce !== me;
      html += '<div class="hu-actions">' +
        (btnCarte ? '<button class="btn hu-btn-carte" data-a="carte">📣 Carte !</button>' : '') +
        (mine && s.annonce === me && main.length === 2 ? '<span class="hu-annonce">📣 « Carte ! » annoncé</span>' : '') +
        (mine && s.hasDrawn && s.pending2 === 0 ? '<button class="btn jeu" data-a="pass">Passer ➡️</button>' : '') +
        '</div>';

      // ---------- ma main, en éventail ----------
      var tri = triMain(main);
      var lay = eventail(tri.length, W - 4, cw);
      var sel8 = v.sel8;
      if (sel8 !== undefined && (!main[sel8] || main[sel8].r !== '8' || !mine)) sel8 = v.sel8 = undefined;
      // cartes arrivées depuis le dernier affichage de CETTE main (sur un seul
      // téléphone, la main affichée change de propriétaire à chaque tour)
      var ancienne = v.mainDe === me ? v.main : null;
      var nouvelles = {};
      html += '<div class="ha-hand hu-main" style="height:' + lay.h + 'px;--cw:' + cw + 'px">' +
        tri.map(function (o, j) {
          var c = o.c, pz = lay.pos[j];
          var ok = mine && playable(s, c, main);
          var cle = c.r + c.s;
          var neuve = !!ancienne && !ancienne[cle];
          if (neuve) nouvelles[cle] = true;
          return '<button class="ha-card hu-carte' + (mine ? (ok ? ' ok' : ' off') : '') + (sel8 === o.i ? ' sel' : '') +
            (neuve ? ' neuve' : '') + '" data-i="' + o.i + '" data-k="' + esc(cle) + '" style="left:' + pz.x + 'px;top:' + pz.y +
            'px;--rot:' + pz.rot + 'deg;z-index:' + (j + 1) + '" aria-label="' + esc(nomCarte(c)) + (ok ? ', jouable' : '') + '">' +
            carteHtml(c, 'hu-jc') + '</button>';
        }).join('') + '</div>';

      // ---------- moi : score et règles ----------
      // l'hôte règle les règles maison pendant toute la première manche (un
      // robot qui commence ne doit pas lui couper l'herbe sous le pied)
      var ouvrable = me === 0 && s.manche === 1 && !s.finished;
      html += '<div class="hu-moi"><span class="hu-moi-score">' + esc(my.name) + ' · <b>' + (my.score | 0) + '</b> / ' + R.cible + ' pts</span>' +
        '<button class="hu-regles-chip" data-a="regles"' + (ouvrable ? '' : ' disabled') + '>⚙️ ' +
        (R.carte ? '« Carte ! »' : 'sans « Carte ! »') + (R.fin8 ? ' · pas de fin sur 8' : '') + (R.dix ? ' · 10 rejoue' : '') +
        (ouvrable ? ' · modifier' : '') + '</button></div>';
      html += '</div>';

      // ---------- la roue des couleurs (après un 8) ----------
      if (sel8 !== undefined) {
        html += '<div class="hu-roue-voile" data-a="fermer-roue"><div class="hu-roue" role="dialog" aria-label="Choisissez la couleur">' +
          SUITS.map(function (su, si) {
            return '<button class="ha-suit-btn hu-q' + si + (si === 1 || si === 2 ? ' red' : '') + '" data-s="' + su +
              '" aria-label="' + NOMS_COUL[si] + '">' + svgCouleur(si) + '<small>' + NOMS_COUL[si] + '</small></button>';
          }).join('') +
          '<span class="hu-roue-centre">' + carteHtml(main[sel8], 'hu-jc') + '</span></div>' +
          '<p class="hu-roue-titre">Quelle couleur demandez-vous ?</p></div>';
      }

      // ---------- la fenêtre des règles maison ----------
      if (v.reglesOuvertes && ouvrable) {
        var brouillon = v.brouillon || R;
        html += '<div class="hu-feuille-voile" data-a="fermer-regles"><div class="hu-feuille" role="dialog" aria-label="Règles maison">' +
          '<h3>⚙️ Règles maison</h3>' +
          '<p class="hu-lbl">Score à atteindre</p><div class="choix-ligne">' + CIBLES.map(function (ci2) {
            return '<button class="count-btn' + (brouillon.cible === ci2 ? ' active' : '') + '" data-cible="' + ci2 + '">' + ci2 + '</button>';
          }).join('') + '</div>' +
          [['carte', '📣 Annonce « Carte ! »', 'oubli = 2 cartes de pénalité'],
            ['fin8', '🚫 Interdit de finir sur un 8', 'le joker ne peut pas être la dernière carte'],
            ['dix', '🔁 Le 10 fait rejouer', 'on repose aussitôt une carte']].map(function (o) {
            return '<button class="hu-interr' + (brouillon[o[0]] ? ' on' : '') + '" data-opt="' + o[0] + '" role="switch" aria-checked="' +
              (brouillon[o[0]] ? 'true' : 'false') + '"><span><b>' + o[1] + '</b><small>' + o[2] + '</small></span><i></i></button>';
          }).join('') +
          '<button class="btn big jeu" data-a="valider-regles">C’est parti !</button></div></div>';
      }

      el.innerHTML = html;
      v.me = me;
      // la table occupe tout l'écran : la main se cale en bas, comme au café
      var jeuEl = el.querySelector('.hu-jeu');
      if (jeuEl && el.getBoundingClientRect) {
        var haut = el.getBoundingClientRect().top + (root.scrollY || 0);
        var dispo = Math.round(vh - haut - 10);
        if (dispo > 300) jeuEl.style.minHeight = dispo + 'px';
      }

      // les voiles plein écran se calent sur la fenêtre visible (l'écran de la
      // coque, animé par une transformation, devient leur repère « fixed »)
      el.querySelectorAll('.hu-roue-voile, .hu-feuille-voile').forEach(calerSurFenetre);

      // ---------- gestes ----------
      function verrouille() { return v.verrou && Date.now() < v.verrou; }
      function agir(a) {
        if (verrouille()) return false;
        v.verrou = Date.now() + 350;
        var ok = ctx.act(a);
        return ok;
      }
      var pioche = el.querySelector('[data-a="draw"]');
      if (pioche) pioche.addEventListener('click', function () {
        if (!mine) return;
        son('tap', { volume: 0.4 });
        agir({ t: 'draw' });
      });
      var passe = el.querySelector('[data-a="pass"]');
      if (passe) passe.addEventListener('click', function () { agir({ t: 'pass' }); });
      var bc = el.querySelector('[data-a="carte"]');
      if (bc) bc.addEventListener('click', function () { agir({ t: 'carte' }); });
      var chip = el.querySelector('[data-a="regles"]');
      if (chip && ouvrable) chip.addEventListener('click', function () {
        v.reglesOuvertes = true;
        v.brouillon = { cible: R.cible, carte: R.carte, fin8: R.fin8, dix: R.dix };
        son('open');
        mod.render(el, ctx);
      });
      var voileR = el.querySelector('[data-a="fermer-regles"]');
      if (voileR) {
        voileR.addEventListener('click', function (e) {
          if (e.target !== voileR) return;
          v.reglesOuvertes = false;
          son('close');
          mod.render(el, ctx);
        });
        el.querySelectorAll('[data-cible]').forEach(function (b) {
          b.addEventListener('click', function () {
            v.brouillon.cible = +b.getAttribute('data-cible');
            son('select');
            mod.render(el, ctx);
          });
        });
        el.querySelectorAll('[data-opt]').forEach(function (b) {
          b.addEventListener('click', function () {
            var o = b.getAttribute('data-opt');
            v.brouillon[o] = !v.brouillon[o];
            son('toggle');
            mod.render(el, ctx);
          });
        });
        var val = el.querySelector('[data-a="valider-regles"]');
        if (val) val.addEventListener('click', function () {
          v.reglesOuvertes = false;
          son('success', { volume: 0.6 });
          ctx.act({ t: 'regles', r: v.brouillon });
        });
      }

      // Valet ou As à 2 joueurs : on rejoue aussitôt et la main se décale sous
      // le doigt — on la gèle un court instant contre le double-appui
      if (mine && v.nbMain !== undefined && main.length < v.nbMain) v.gel = Date.now() + 400;
      v.nbMain = main.length;

      el.querySelectorAll('.hu-main .ha-card').forEach(function (b) {
        b.addEventListener('click', function () {
          if (!mine) { fx().shake(b, 0.5); return; }
          if (v.gel && Date.now() < v.gel) return;
          var i = parseInt(b.getAttribute('data-i'), 10);
          var c = main[i];
          if (!c) return;
          if (!playable(s, c, main)) {
            son('wrong', { volume: 0.5 });
            vibre('error');
            fx().shake(b, 0.8);
            return;
          }
          v.depart = { k: c.r + c.s, r: b.getBoundingClientRect(), t: Date.now() };
          if (c.r === '8') {
            v.sel8 = i;
            son('open');
            vibre('select');
            mod.render(el, ctx);
          } else {
            v.sel8 = undefined;
            vibre('light');
            agir({ t: 'play', i: i });
          }
        });
      });
      var voile = el.querySelector('[data-a="fermer-roue"]');
      if (voile) {
        voile.addEventListener('click', function (e) {
          if (e.target !== voile) return;
          v.sel8 = undefined;
          son('close');
          mod.render(el, ctx);
        });
        el.querySelectorAll('.ha-suit-btn').forEach(function (b) {
          b.addEventListener('click', function () {
            var i = v.sel8;
            v.sel8 = undefined;
            son('select');
            vibre('medium');
            agir({ t: 'play', i: i, suit: b.getAttribute('data-s') });
          });
        });
        if (!v.roueVue) {
          v.roueVue = true;
          el.querySelectorAll('.hu-roue .ha-suit-btn').forEach(function (b, j) { fx().bounceIn(b, j * 50); });
        }
      } else {
        v.roueVue = false;
      }

      // ---------- effets : ce qui vient de changer, une seule fois ----------
      var memMain = {};
      main.forEach(function (c) { memMain[c.r + c.s] = true; });
      if (nouvelleDonne) {
        animerDonne(el, s, me, v);
      } else if (ev) {
        animerEvenement(el, s, me, ev, v, nouvelles);
      }
      v.manche = s.manche;
      v.coups = s.coups || 0;
      v.main = memMain;
      v.mainDe = me;
    },

    _playable: playable, _cardValue: cardValue, _drawCards: drawCards,
    _regles: regles, _triMain: triMain, _eventail: eventail
  };

  function calerSurFenetre(voile) {
    if (!voile.getBoundingClientRect) return;
    var r = voile.getBoundingClientRect();
    var H = root.innerHeight || r.height, Wv = root.innerWidth || r.width;
    if (Math.abs(r.top) < 1 && Math.abs(r.left) < 1 && Math.abs(r.height - H) < 2) return;
    var cs = root.getComputedStyle(voile);
    voile.style.top = ((parseFloat(cs.top) || 0) - r.top) + 'px';
    voile.style.left = ((parseFloat(cs.left) || 0) - r.left) + 'px';
    voile.style.right = 'auto';
    voile.style.bottom = 'auto';
    voile.style.width = Wv + 'px';
    voile.style.height = H + 'px';
  }

  /* ---------- la distribution animée : une carte après l'autre ---------- */
  function animerDonne(el, s, me, v) {
    var pioche = el.querySelector('.hu-pioche');
    var cartes = el.querySelectorAll('.hu-main .ha-card');
    var sieges = el.querySelectorAll('.hu-siege');
    if (!pioche || fx().reduced()) {
      son('shuffle', { volume: 0.6 });
      return;
    }
    son('shuffle', { volume: 0.6 });
    var dessus = el.querySelector('.hu-dessus');
    if (dessus) dessus.classList.add('hu-cache');
    for (var i = 0; i < cartes.length; i++) cartes[i].classList.add('hu-cache');
    // une carte pour moi, une pour chaque adversaire (deux tours de table
    // suffisent à l'œil : au-delà, seules mes cartes volent)
    var cibles = [];
    for (var j = 0; j < cartes.length; j++) {
      cibles.push({ el: cartes[j], moi: true });
      if (j < 2) {
        for (var g = 0; g < sieges.length; g++) {
          cibles.push({ el: sieges[g].querySelector('.hu-av') || sieges[g], moi: false });
        }
      }
    }
    var dos = GG.carteDos({ classe: 'hu-jc' });
    cibles.forEach(function (cb, k) {
      setTimeout(function () {
        if (!cb.el.isConnected) { cb.el.classList.remove('hu-cache'); return; }
        if (k % 2 === 0) son('deal', { volume: 0.35, pitch: 0.95 + (k % 5) * 0.03 });
        fx().flyTo(pioche, cb.el, { html: dos, duration: 330, arc: 0.18, rotate: cb.moi ? 0 : 12, scaleTo: cb.moi ? 1 : 0.4 })
          .then(function () {
            if (cb.moi) {
              cb.el.classList.remove('hu-cache');
              cb.el.classList.add('hu-retourne');
            }
          });
      }, k * 55);
    });
    setTimeout(function () {
      for (var i2 = 0; i2 < cartes.length; i2++) cartes[i2].classList.remove('hu-cache');
      if (dessus && dessus.isConnected) {
        dessus.classList.remove('hu-cache');
        fx().pop(dessus);
        son('flip', { volume: 0.6 });
        if (s.dernier && s.dernier.effet) effetPremiereCarte(el, s);
      }
    }, cibles.length * 55 + 360);
  }

  function effetPremiereCarte(el, s) {
    var d = el.querySelector('.hu-defausse');
    if (!d) return;
    var e = s.dernier.effet;
    if (e === '2') {
      son('hit');
      fx().floatText(d, '+2 !', { color: '#ff8a3d', size: 30 });
      var b = el.querySelector('.hu-dette');
      if (b) fx().pop(b, 1.4);
    } else if (e === 'V') {
      son('whoosh');
      var sg = el.querySelector('.hu-siege[data-p="' + s.dernier.saute + '"]');
      fx().floatText(sg || d, '⛔ Passe son tour', { color: '#ffc23d', size: 20 });
    } else if (e === 'A') {
      son('swap');
      fx().floatText(d, '↺ Sens inversé', { color: '#2fd4ff', size: 20 });
    }
  }

  /* ---------- une action vient d'avoir lieu : on la montre ---------- */
  function animerEvenement(el, s, me, ev, v, nouvelles) {
    var F = fx();
    var defausse = el.querySelector('.hu-defausse');
    var dessus = el.querySelector('.hu-dessus');
    var pioche = el.querySelector('.hu-pioche');
    function siege(p) { return el.querySelector('.hu-siege[data-p="' + p + '"]'); }

    if (ev.t === 'play' && dessus) {
      var dep = v.depart;
      var depuis = null;
      if (ev.p === me && dep && dep.k === ev.c.r + ev.c.s && Date.now() - dep.t < 4000) depuis = dep.r;
      else depuis = siege(ev.p);
      v.depart = null;
      var html = carteHtml(ev.c, 'hu-jc-l');
      var fin = function () {
        if (!dessus.isConnected) return;
        dessus.classList.remove('hu-cache');
        son('place', { volume: 0.8 });
        F.pop(dessus, 1.1);
        suiteDuCoup();
      };
      if (depuis && !F.reduced()) {
        dessus.classList.add('hu-cache');
        var tilt = parseFloat((dessus.style.getPropertyValue('--t') || '0').replace('deg', '')) || 0;
        F.flyTo(depuis, dessus, {
          html: html, duration: 460, arc: 0.22,
          rotate: (ev.p === me ? 360 : -360) + tilt, scaleTo: 1
        }).then(fin);
        son('whoosh', { volume: 0.25, pitch: 1.3 });
      } else {
        fin();
      }
      if (ev.oubli) {
        if (ev.p === me && !F.reduced()) {
          el.querySelectorAll('.hu-main .ha-card.neuve').forEach(function (b) { b.classList.add('hu-cache'); });
        }
        setTimeout(function () {
          son('wrong');
          var cib = ev.p === me ? el.querySelector('.hu-main') : siege(ev.p);
          F.floatText(cib || defausse, 'Oubli de « Carte ! » +' + ev.oubli, { color: '#ff4d5e', size: 22 });
          if (ev.p === me) { vibre('error'); F.shakeScreen(0.5); }
          volerDepuisPioche(el, pioche, ev.p === me ? null : siege(ev.p), ev.oubli, nouvelles, me === ev.p);
        }, 520);
      }
      return;
    }

    function suiteDuCoup() {
      if (ev.c.r === '8' && ev.suit) {
        var tag = el.querySelector('.hu-demande');
        if (tag) { F.bounceIn(tag); son('whoosh', { volume: 0.5 }); }
      } else if (ev.c.r === '2') {
        var b = el.querySelector('.hu-dette');
        if (b) {
          F.pop(b, 1.5);
          son('hit', { pitch: 1 + Math.min(0.5, (ev.pending || 2) / 16) });
          if ((ev.pending || 0) >= 4) { son('combo', { level: Math.min(8, ev.pending / 2) }); F.shakeScreen(0.35); }
          if (s.current === me) vibre('warning');
        }
      } else if (ev.c.r === 'V') {
        var sg = siege(ev.saute);
        son('whoosh');
        F.floatText(sg || defausse, ev.saute === me ? '⛔ Vous passez !' : '⛔ Passe !', { color: '#ffc23d', size: 22 });
      } else if (ev.c.r === 'A') {
        son('swap');
        var sens = el.querySelector('.hu-sens');
        if (sens) F.pop(sens, 1.15);
        F.floatText(defausse, s.players.length === 2 ? '↺ Rejoue !' : '↺ Sens inversé', { color: '#2fd4ff', size: 20 });
      } else if (ev.rejoue) {
        F.floatText(defausse, '🔁 Rejoue !', { color: '#2fd67b', size: 20 });
      }
      if (s.current === me && ev.p !== me) {
        var m = el.querySelector('.hu-main');
        if (m) F.glow(m, '#ffc23d', 700);
      }
    }

    if (ev.t === 'draw') {
      var cible = ev.p === me ? null : siege(ev.p);
      if (ev.penalite) {
        son('hit', { volume: 0.7 });
        F.floatText(cible || el.querySelector('.hu-main') || pioche, '+' + (ev.n || 0), { color: '#ff4d5e', size: 30 });
        if (ev.p === me) vibre('medium');
      }
      if (!ev.n) {
        F.floatText(pioche || defausse, 'Pioche vide', { color: '#b9bde0', size: 18 });
        return;
      }
      volerDepuisPioche(el, pioche, cible, ev.n, nouvelles, ev.p === me);
      return;
    }
    if (ev.t === 'pass') {
      son('tock', { volume: 0.5 });
      var sgp = siege(ev.p);
      if (sgp) F.floatText(sgp, 'Passe', { color: '#b9bde0', size: 18 });
      if (s.current === me) {
        var mm = el.querySelector('.hu-main');
        if (mm) F.glow(mm, '#ffc23d', 700);
      }
      return;
    }
    if (ev.t === 'carte') {
      son('bell');
      vibre('medium');
      var sgc = ev.p === me ? el.querySelector('.hu-actions') : siege(ev.p);
      F.floatText(sgc || defausse, '📣 Carte !', { color: '#ffc23d', size: 28 });
      if (sgc) F.pulse(sgc, 1);
    }
  }

  /* des cartes filent de la pioche vers une main (la mienne : vers leurs
     places exactes, retournées à l'arrivée ; un adversaire : vers son siège) */
  function volerDepuisPioche(el, pioche, siegeEl, nb, nouvelles, moi) {
    var F = fx();
    if (!pioche) return;
    var dos = GG.carteDos({ classe: 'hu-jc' });
    var cibles = [];
    if (moi) {
      el.querySelectorAll('.hu-main .ha-card.neuve').forEach(function (b) { cibles.push(b); });
    }
    var total = Math.min(Math.max(nb, cibles.length), 8);
    if (F.reduced()) return;
    cibles.forEach(function (b) { b.classList.add('hu-cache'); });
    for (var k = 0; k < total; k++) {
      (function (k2) {
        setTimeout(function () {
          var but = moi ? cibles[k2] : (siegeEl && (siegeEl.querySelector('.hu-dos') || siegeEl));
          if (k2 < 4) son('deal', { volume: 0.4, pitch: 1 + k2 * 0.05 });
          F.flyTo(pioche, but || pioche, { html: dos, duration: 360, arc: 0.2, scaleTo: moi ? 1 : 0.4, rotate: moi ? 0 : -10 })
            .then(function () {
              if (moi && but) {
                but.classList.remove('hu-cache');
                but.classList.add('hu-retourne');
              }
            });
        }, k2 * 110);
      })(k);
    }
    // filet : rien ne doit rester caché
    setTimeout(function () { cibles.forEach(function (b) { b.classList.remove('hu-cache'); }); }, total * 110 + 700);
  }

  /* ---------- fin de manche : noms, mains et points bien séparés ---------- */
  function rendreFin(el, ctx, s, me, R, ev, v) {
    var w = s.winner;
    var html = '<div class="hu-fin' + (s.players.length > 2 ? ' serre' : '') + '">';
    html += '<div class="hu-fin-haut">';
    var der = s.discard[s.discard.length - 1];
    if (der) html += '<div class="hu-fin-derniere">' + carteHtml(der, 'hu-jc-l') + '</div>';
    html += '<div class="hu-fin-annonce"><h2 class="hu-fin-titre">🏆 ' + esc(nom(s, w)) +
      (s.bloque ? ' a la main la plus légère' : ' vide sa main') + '\u00a0!</h2>' +
      '<p class="hu-fin-gain">+<span class="hu-gain-n">' + (s.lastGain || 0) + '</span> point' +
      ((s.lastGain || 0) > 1 ? 's' : '') + '</p></div></div>';
    if (!s.fini && me === 0) html += '<button class="btn big jeu" data-a="again">🔁 Manche suivante</button>';
    var ordre = s.players.map(function (p, i) { return i; }).sort(function (a, b) {
      return s.players[b].score - s.players[a].score;
    });
    // une ligne par joueur : avatar | nom et cartes restantes | total — des
    // blocs séparés, jamais « Suzette100 pts » collés
    html += '<div class="hu-fin-liste">' + ordre.map(function (i) {
      var pl = s.players[i];
      var mainF = pl.hand || [];
      var pts = s.detail ? s.detail[i] : 0;
      var pct = Math.min(100, Math.round((pl.score / R.cible) * 100));
      return '<div class="hu-fin-ligne' + (i === w ? ' gagne' : '') + '">' +
        '<span class="hu-av hu-c' + (i % 5) + '">' + esc(initiale(pl.name)) + '</span>' +
        '<div class="hu-fin-centre"><span class="hu-fin-nom">' + esc(pl.name) + '</span>' +
        '<div class="hu-fin-main">' + (mainF.length
          ? mainF.map(function (c) { return carteHtml(c, 'hu-jc-mini2'); }).join('') +
            '<span class="hu-fin-pts">= ' + pts + ' pts</span>'
          : '<span class="hu-fin-pts">' + (i === w ? '🎉 Main vide' : '—') + '</span>') + '</div></div>' +
        '<span class="hu-fin-score"><b>' + pl.score + '</b><small>pts</small></span>' +
        '<div class="hu-barre" title="' + pl.score + ' sur ' + R.cible + '"><i style="width:' + pct + '%"></i></div>' +
        '</div>';
    }).join('') + '</div>';
    html += '<p class="hint hu-fin-cible">Premier à ' + R.cible + ' points · manche ' + s.manche + '</p>';
    if (s.fini) {
      html += '<p class="mini-msg">🏁 ' + esc(nom(s, w)) + ' atteint ' + R.cible + ' points : partie terminée !</p>';
    } else if (me !== 0) {
      html += '<p class="waiting">L’hôte va relancer une manche…</p>';
    }
    html += '</div>';
    el.innerHTML = html;
    var ag = el.querySelector('[data-a="again"]');
    if (ag) {
      // le bouton apparaît là où l'on vient de toucher une carte : on l'arme après 300 ms
      var arme = Date.now() + 300;
      ag.addEventListener('click', function () {
        if (Date.now() < arme || (v.verrou && Date.now() < v.verrou)) return;
        v.verrou = Date.now() + 600;
        son('shuffle', { volume: 0.6 });
        ctx.act({ t: 'again' });
      });
    }
    if (ev && v.manche === s.manche) {
      // la manche vient de se terminer sous nos yeux
      var F = fx();
      var titre = el.querySelector('.hu-fin-titre');
      var derniere = el.querySelector('.hu-fin-derniere');
      if (derniere) F.bounceIn(derniere);
      if (titre) F.slideIn(titre, 'up', 120);
      F.stagger(el.querySelectorAll('.hu-fin-ligne'), { gap: 90 });
      var gn = el.querySelector('.hu-gain-n');
      if (gn) F.countUp(gn, 0, s.lastGain || 0, 900);
      if (!s.fini) {
        son(w === me || ctx.mode === 'local' && !s.niveauIA ? 'success' : 'lose', { volume: 0.8 });
        if (w === me || ctx.mode === 'local' && !s.niveauIA) {
          F.burst(titre || el, { count: 40, shape: 'star' });
          vibre('success');
        }
      }
    }
  }

  GG.register(mod);
  if (typeof module === 'object' && module.exports) module.exports = mod;
})(typeof self !== 'undefined' ? self : globalThis);
