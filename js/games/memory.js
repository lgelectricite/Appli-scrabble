/* GGgames — Memory (retrouvez les paires, 1 à 4 joueurs).
 * Thèmes (animaux, fruits, drapeaux dessinés en SVG…), grilles de 12, 18 ou
 * 24 paires selon la taille de l'écran, défi du jour (même grille pour tout
 * le monde), chrono qui ne compte que le temps de jeu, record personnel.
 * En réseau, les cartes cachées ne circulent jamais (redact).
 * L'IA a une vraie mémoire : elle ne connaît que les cartes déjà montrées,
 * et en retient plus ou moins selon son niveau. */
(function (root) {
  'use strict';
  var GG = root.GG;

  /* ---------------- thèmes ---------------- */
  var THEMES = {
    animaux: { nom: 'Animaux', ic: '🐼', items: ['🐶', '🐱', '🦊', '🐼', '🦁', '🐸', '🐙', '🦋', '🐯', '🐨', '🐷', '🐵', '🐔', '🐧', '🐢', '🦄', '🐝', '🐞', '🦀', '🐬', '🦒', '🦓', '🐘', '🦔', '🐰', '🐻', '🦉', '🐳'] },
    fruits: { nom: 'Fruits & légumes', ic: '🍓', items: ['🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🍆', '🥑', '🥦', '🥕', '🌽', '🌶️', '🥒', '🥔', '🍄', '🌰', '🥜', '🍠'] },
    drapeaux: { nom: 'Drapeaux', ic: '🏁', svg: true, items: ['fr', 'it', 'be', 'ie', 'de', 'nl', 'ru', 'at', 'hu', 'ee', 'lt', 'co', 'ua', 'pl', 'se', 'dk', 'fi', 'no', 'is', 'ch', 'jp', 'bd', 'gr', 'cz', 'tr', 'vn', 'gb', 'us', 'ar', 'la', 'ga', 'am'] },
    sports: { nom: 'Sports & jeux', ic: '⚽', items: ['⚽', '🏀', '🏈', '⚾', '🎾', '🏐', '🏉', '🎱', '🏓', '🏸', '🏒', '🏏', '⛳', '🏹', '🎣', '🥊', '🥋', '🎿', '⛸️', '🏆', '🥇', '🎯', '🎳', '🎲', '🧩', '♟️', '🎮', '🪀'] },
    vehicules: { nom: 'Véhicules', ic: '🚀', items: ['🚗', '🚕', '🚙', '🚌', '🏎️', '🚓', '🚑', '🚒', '🚐', '🚚', '🚜', '🛵', '🏍️', '🚲', '🛴', '🚂', '🚇', '✈️', '🚁', '🚀', '🛸', '⛵', '🚤', '🛳️', '🚠', '🚡', '🛶', '🚃'] },
    nature: { nom: 'Ciel & nature', ic: '🌈', items: ['☀️', '🌙', '⭐', '🌈', '⚡', '❄️', '🔥', '💧', '🌪️', '☁️', '🌍', '☄️', '🌋', '🌊', '🌸', '🌻', '🌵', '🍀', '🍁', '🌴', '🌷', '🌹', '🍂', '🌼', '🌺', '🌲', '🍃', '⛄'] },
    gourmand: { nom: 'Gourmandises', ic: '🍩', items: ['🍰', '🧁', '🍩', '🍪', '🍫', '🍬', '🍭', '🍦', '🍨', '🥐', '🥞', '🍿', '🍯', '🥧', '🍮', '🎂', '🍡', '🥨', '🍕', '🍔', '🍟', '🌭', '🌮', '🥪', '🍣', '🥟', '🍜', '🧀'] }
  };
  var THEME_IDS = ['animaux', 'fruits', 'drapeaux', 'sports', 'vehicules', 'nature', 'gourmand'];
  var TAILLES = [12, 18, 24];

  /* drapeaux simples, dessinés en SVG (nets partout, identiques sur tous les téléphones) */
  function bandes(dir, cols) {
    var n = cols.length, h = '';
    for (var i = 0; i < n; i++) {
      h += dir === 'v' ? '<rect x="' + (30 * i / n) + '" y="0" width="' + (30 / n + 0.05) + '" height="20" fill="' + cols[i] + '"/>'
        : '<rect x="0" y="' + (20 * i / n) + '" width="30" height="' + (20 / n + 0.05) + '" fill="' + cols[i] + '"/>';
    }
    return h;
  }
  function croixNordique(fond, croix, bord) {
    return '<rect width="30" height="20" fill="' + fond + '"/>' +
      (bord ? '<rect x="8" y="0" width="6" height="20" fill="' + bord + '"/><rect x="0" y="7" width="30" height="6" fill="' + bord + '"/>' : '') +
      '<rect x="' + (bord ? 9.5 : 9) + '" y="0" width="' + (bord ? 3 : 4) + '" height="20" fill="' + croix + '"/>' +
      '<rect x="0" y="' + (bord ? 8.5 : 8) + '" width="30" height="' + (bord ? 3 : 4) + '" fill="' + croix + '"/>';
  }
  function etoile(cx, cy, r, coul) {
    var p = [];
    for (var i = 0; i < 10; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.4 : r;
      p.push((cx + rr * Math.cos(a)).toFixed(2) + ',' + (cy + rr * Math.sin(a)).toFixed(2));
    }
    return '<polygon points="' + p.join(' ') + '" fill="' + coul + '"/>';
  }
  var DRAPEAUX = {
    fr: bandes('v', ['#0055A4', '#fff', '#EF4135']),
    it: bandes('v', ['#009246', '#fff', '#CE2B37']),
    be: bandes('v', ['#1a1a1a', '#FDDA24', '#EF3340']),
    ie: bandes('v', ['#169B62', '#fff', '#FF883E']),
    de: bandes('h', ['#1a1a1a', '#DD0000', '#FFCE00']),
    nl: bandes('h', ['#AE1C28', '#fff', '#21468B']),
    ru: bandes('h', ['#fff', '#0039A6', '#D52B1E']),
    at: bandes('h', ['#ED2939', '#fff', '#ED2939']),
    hu: bandes('h', ['#CD2A3E', '#fff', '#436F4D']),
    ee: bandes('h', ['#0072CE', '#1a1a1a', '#fff']),
    lt: bandes('h', ['#FDB913', '#006A44', '#C1272D']),
    co: '<rect width="30" height="10" fill="#FCD116"/><rect y="10" width="30" height="5" fill="#003893"/><rect y="15" width="30" height="5" fill="#CE1126"/>',
    ua: bandes('h', ['#0057B7', '#FFD700']),
    pl: bandes('h', ['#fff', '#DC143C']),
    se: croixNordique('#006AA7', '#FECC00'),
    dk: croixNordique('#C8102E', '#fff'),
    fi: croixNordique('#fff', '#003580'),
    no: croixNordique('#BA0C2F', '#00205B', '#fff'),
    is: croixNordique('#02529C', '#DC1E35', '#fff'),
    ch: '<rect width="30" height="20" fill="#D52B1E"/><rect x="13" y="4" width="4" height="12" fill="#fff"/><rect x="9" y="8" width="12" height="4" fill="#fff"/>',
    jp: '<rect width="30" height="20" fill="#fff"/><circle cx="15" cy="10" r="6" fill="#BC002D"/>',
    bd: '<rect width="30" height="20" fill="#006A4E"/><circle cx="13.5" cy="10" r="6" fill="#F42A41"/>',
    gr: bandes('h', ['#0D5EAF', '#fff', '#0D5EAF', '#fff', '#0D5EAF', '#fff', '#0D5EAF', '#fff', '#0D5EAF']) +
      '<rect width="11.1" height="11.1" fill="#0D5EAF"/><rect x="4.4" width="2.2" height="11.1" fill="#fff"/><rect y="4.4" width="11.1" height="2.2" fill="#fff"/>',
    cz: bandes('h', ['#fff', '#D7141A']) + '<polygon points="0,0 15,10 0,20" fill="#11457E"/>',
    tr: '<rect width="30" height="20" fill="#E30A17"/><circle cx="11" cy="10" r="5" fill="#fff"/><circle cx="12.3" cy="10" r="4" fill="#E30A17"/>' + etoile(17.4, 10, 2.4, '#fff'),
    vn: '<rect width="30" height="20" fill="#DA251D"/>' + etoile(15, 10.4, 6, '#FFFF00'),
    gb: '<rect width="30" height="20" fill="#012169"/><path d="M0 0L30 20M30 0L0 20" stroke="#fff" stroke-width="4"/>' +
      '<path d="M0 0L30 20M30 0L0 20" stroke="#C8102E" stroke-width="1.6"/><path d="M15 0V20M0 10H30" stroke="#fff" stroke-width="6"/>' +
      '<path d="M15 0V20M0 10H30" stroke="#C8102E" stroke-width="3.4"/>',
    us: bandes('h', ['#B22234', '#fff', '#B22234', '#fff', '#B22234', '#fff', '#B22234', '#fff', '#B22234', '#fff', '#B22234', '#fff', '#B22234']) +
      '<rect width="12.5" height="10.8" fill="#3C3B6E"/>' +
      (function () {
        var d = '';
        for (var y = 0; y < 4; y++) for (var x = 0; x < 5; x++) d += '<circle cx="' + (1.6 + x * 2.35) + '" cy="' + (1.6 + y * 2.5) + '" r=".55" fill="#fff"/>';
        return d;
      })(),
    ar: bandes('h', ['#74ACDF', '#fff', '#74ACDF']) + '<circle cx="15" cy="10" r="2.4" fill="#F6B40E"/>',
    la: '<rect width="30" height="20" fill="#CE1126"/><rect y="5" width="30" height="10" fill="#002868"/><circle cx="15" cy="10" r="3.6" fill="#fff"/>',
    ga: bandes('h', ['#009E60', '#FCD116', '#3A75C4']),
    am: bandes('h', ['#D90012', '#0033A0', '#F2A800'])
  };
  function drapeau(code) {
    var d = DRAPEAUX.hasOwnProperty(code) ? DRAPEAUX[code] : null;
    if (!d) return '<span class="mem-inconnu">?</span>';
    return '<svg class="mem-drapeau" viewBox="0 0 30 20" aria-hidden="true" focusable="false">' + d +
      '<rect width="30" height="20" fill="none" stroke="rgba(0,0,0,.18)" stroke-width=".6"/></svg>';
  }

  /* ---------------- outils ---------------- */
  /* ce qui doit être un nombre le redevient (l'état peut venir d'un hôte malveillant) */
  function num(x) { x = +x; return isFinite(x) ? x : 0; }
  function assainir(s) {
    ['current', 'durationSec', 'startTs', 'actifMs', 'coups', 'taille', 'serie'].forEach(function (k) {
      if (s[k] != null) s[k] = num(s[k]);
    });
    if (!Array.isArray(s.players)) s.players = [];
    s.players.forEach(function (p) { p.pairs = num(p.pairs); p.tries = num(p.tries); });
    if (!Array.isArray(s.cards)) s.cards = [];
    if (!Array.isArray(s.up)) s.up = [];
    s.up = s.up.map(num);
    if (s.dernier && typeof s.dernier === 'object') {
      ['p', 'i', 'j', 'serie'].forEach(function (k) { if (s.dernier[k] != null) s.dernier[k] = num(s.dernier[k]); });
    }
    return s;
  }
  /* un identifiant de thème venu de l'état n'est utilisé qu'après liste blanche */
  function theme(id) {
    return THEME_IDS.indexOf(id) !== -1 ? id : 'animaux';
  }
  function fmt(sec) {
    var m = Math.floor(sec / 60);
    return (m ? m + ' min ' : '') + (sec % 60) + ' s';
  }
  function chrono(sec) {
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  /* multiplication 32 bits (Math.imul n'existe pas sur les très vieux navigateurs) */
  var imul = Math.imul || function (a, b) {
    var ah = (a >>> 16) & 0xffff, al = a & 0xffff, bh = (b >>> 16) & 0xffff, bl = b & 0xffff;
    return ((al * bl) + (((ah * bl + al * bh) << 16) >>> 0) | 0);
  };
  /* générateur pseudo-aléatoire à graine (défi du jour : même grille partout) */
  function graine(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = imul(h, 16777619); }
    return h >>> 0;
  }
  function mulberry(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = imul(a ^ (a >>> 15), 1 | a);
      t = (t + imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function melange(a, rnd) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function aujourdhui() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function defiDuJour(date) {
    var g = graine('gg-memory-' + date);
    return { theme: THEME_IDS[g % THEME_IDS.length], taille: 18 };
  }
  function nouvellesCartes(theme, taille, rnd) {
    var th = THEMES[theme] || THEMES.animaux;
    rnd = rnd || Math.random;
    var paires = melange(th.items.slice(), rnd).slice(0, taille);
    return melange(paires.concat(paires).map(function (e) { return { e: e, matched: false }; }), rnd);
  }

  /* ---------------- la mémoire de l'IA ----------------
     Le journal (public) liste les cartes retournées, dans l'ordre. L'IA ne
     « voit » que ces cartes-là, et n'en retient qu'une partie :
       facile    : les 2 à 4 dernières cartes vues, avec des oublis ;
       moyen     : les 6 dernières, un oubli de temps en temps ;
       difficile : tout ce qui a été montré.
     Le hasard des oublis est tiré d'un hachage de l'état : deux appels au
     même moment donnent la même réponse. */
  function hache(a, b, c) {
    var h = (a * 374761393 + b * 668265263 + c * 1274126177) | 0;
    h = imul(h ^ (h >>> 13), 1274126177);
    h = h ^ (h >>> 16);
    return ((h >>> 0) % 10000) / 10000;
  }
  function souvenirs(state, me, niveau) {
    var journal = state.journal || [];
    var capacite, oubli;
    if (niveau === 'facile') {
      capacite = 2 + Math.floor(hache(journal.length, me, 7) * 3); // 2 à 4
      oubli = 0.25;
    } else if (niveau === 'difficile') {
      capacite = Infinity; oubli = 0;
    } else {
      capacite = 6; oubli = 0.15;
    }
    var mem = {}, vus = 0;
    for (var k = journal.length - 1; k >= 0 && vus < capacite; k--) {
      var i = journal[k];
      if (mem.hasOwnProperty(i)) continue;
      var c = state.cards[i];
      if (!c || c.matched) continue;
      vus++;
      if (oubli && hache(i, journal.length, me + 1) < oubli) continue;
      mem[i] = c.e;
    }
    return mem;
  }

  var mod = {
    id: 'memory',
    nom: 'Memory',
    icone: '🧠',
    desc: 'Retrouvez les paires : 7 thèmes, 3 tailles de grille et un défi du jour. Classement aux paires, aux essais et au chrono.',
    regles: '<p><strong>🎯 Le but :</strong> retrouver le plus de paires de cartes identiques.</p>' +
      '<p><strong>Comment jouer :</strong> retournez 2 cartes. Une paire : 1 point et vous rejouez ! Sinon, mémorisez bien… et le tour passe.</p>' +
      '<p><strong>Avant de jouer :</strong> choisissez un thème (animaux, drapeaux, gourmandises…) et une taille de grille (12, 18 ou 24 paires, selon l’écran). Le <strong>défi du jour</strong> propose la même grille à tout le monde.</p>' +
      '<p><strong>En solo :</strong> finissez en un minimum d’essais et de temps — record à battre. Contre l’ordinateur, trois niveaux : le facile oublie vite, le difficile n’oublie rien.</p>',
    min: 1, max: 4,
    hotseat: true, hidden: false, netOnly: false,
    niveaux: ['facile', 'moyen', 'difficile'],

    create: function (names) {
      return {
        id: Math.floor(Math.random() * 1e9).toString(36),
        players: names.map(function (n) { return { name: n, pairs: 0, tries: 0 }; }),
        current: 0,
        theme: 'animaux',
        taille: 12,
        defi: null,
        pret: false,     // l'hôte a choisi thème et taille
        cards: nouvellesCartes('animaux', 12),
        up: [],          // cartes retournées ce demi-tour
        mismatch: false, // les deux dernières ne correspondaient pas
        journal: [],     // cartes retournées, dans l'ordre (public : mémoire de l'IA)
        serie: 0,        // paires d'affilée du joueur en cours
        coups: 0,
        dernier: null,
        startTs: 0,      // départ du chrono (au premier retournement)
        dernierTs: 0,
        actifMs: 0,      // temps de jeu (les longues pauses ne comptent pas)
        durationSec: 0,
        finished: false
      };
    },

    turnOf: function (state) { return state.finished ? -1 : state.current; },
    over: function (state) { return state.finished; },
    scoreOf: function (state, i) { return state.players[i].pairs; },

    gagnants: function (state) {
      if (state.players.length === 1) return [0];
      var best = null, g = [];
      state.players.forEach(function (p, i) {
        if (!best || p.pairs > best.pairs || (p.pairs === best.pairs && p.tries < best.tries)) { best = p; g = [i]; }
        else if (p.pairs === best.pairs && p.tries === best.tries) g.push(i);
      });
      return g.length === 1 ? g : [];
    },

    summary: function (state) {
      // classement : paires trouvées, puis moins d'essais
      var rows = state.players.map(function (p) {
        return { n: p.name, s: num(p.pairs), t: num(p.tries) };
      }).sort(function (a, b) { return b.s - a.s || a.t - b.t; });
      var html = rows.map(function (r) {
        return '<div class="final-line"><span>' + GG.esc(r.n) + '</span><strong>' +
          r.s + ' paire' + (r.s > 1 ? 's' : '') + ' · ' + r.t + ' essai' +
          (r.t > 1 ? 's' : '') + '</strong></div>';
      }).join('');
      html += '<p>⏱️ Partie bouclée en ' + fmt(num(state.durationSec)) + '.</p>';

      if (state.players.length === 1) {
        // record personnel (sur ce téléphone) : moins d'essais, puis moins de temps
        try {
          if (typeof localStorage !== 'undefined') {
            var cle = state.defi ? 'gg-memory-defi' : 'gg-memory-best' + ((state.taille || 12) === 12 ? '' : '-' + state.taille);
            var best = JSON.parse(localStorage.getItem(cle) || 'null');
            if (best && state.defi && best.date !== state.defi) best = null; // nouveau jour, nouveau défi
            var cur = { tries: rows[0].t, sec: state.durationSec, ts: state.startTs, date: state.defi || undefined };
            if (!best || cur.tries < best.tries ||
                (cur.tries === best.tries && cur.sec < best.sec)) {
              localStorage.setItem(cle, JSON.stringify(cur));
            }
            var stored = JSON.parse(localStorage.getItem(cle) || 'null');
            if (state.defi) html += '<p>🗓️ Défi du jour (' + GG.esc(state.defi.split('-').reverse().slice(0, 2).join('/')) + ')</p>';
            if (stored && stored.ts === state.startTs) {
              html += '<h1>🏆 Nouveau record' + (state.defi ? ' du jour' : '') + ' !</h1>';
            } else if (stored) {
              html += '<p>🏅 Votre record' + (state.defi ? ' du jour' : ' (' + (state.taille || 12) + ' paires)') + ' : ' +
                stored.tries + ' essais en ' + fmt(stored.sec) + '.</p>';
            }
          }
        } catch (e) {}
      } else {
        var top = rows.filter(function (r) { return r.s === rows[0].s && r.t === rows[0].t; });
        html += '<h1>🏆 ' + top.map(function (r) { return GG.esc(r.n); }).join(' & ') + '</h1>';
      }
      return html;
    },

    /* en réseau, les cartes encore cachées ne circulent pas : chacun ne
       reçoit que ce qui est posé face visible sur la table */
    redact: function (state, viewer) {
      var copy = GG.clone(state);
      copy.cards.forEach(function (c, i) {
        if (!c.matched && state.up.indexOf(i) === -1) c.e = null;
      });
      return copy;
    },

    apply: function (state, player, action) {
      if (action.t === 'config') {
        if (player !== 0) return { ok: false, error: 'L’hôte choisit le thème.' };
        if (state.pret || (state.journal && state.journal.length) || state.startTs) {
          return { ok: false, error: 'La partie a commencé.' };
        }
        var theme = THEME_IDS.indexOf(action.theme) !== -1 ? action.theme : 'animaux';
        var taille = TAILLES.indexOf(+action.taille) !== -1 ? +action.taille : 12;
        var rnd = Math.random;
        state.defi = null;
        if (action.defi) {
          var date = aujourdhui();
          var d = defiDuJour(date);
          theme = d.theme; taille = d.taille;
          state.defi = date;
          rnd = mulberry(graine('gg-memory-cartes-' + date));
        }
        state.theme = theme;
        state.taille = taille;
        state.cards = nouvellesCartes(theme, taille, rnd);
        state.pret = true;
        state.coups = (state.coups || 0) + 1;
        state.dernier = { t: 'config' };
        return { ok: true };
      }
      if (state.finished) return { ok: false, error: 'Partie terminée.' };
      if (action.t !== 'flip') return { ok: false, error: 'Action inconnue.' };
      if (player !== state.current) return { ok: false, error: 'Ce n’est pas votre tour.' };
      var i = action.i | 0;
      var card = state.cards[i];
      if (!card || card.matched) return { ok: false, error: 'Carte invalide.' };
      if (state.mismatch) {
        // le tour précédent a raté : on cache ses cartes avant de rejouer
        state.up = [];
        state.mismatch = false;
      }
      if (state.up.indexOf(i) !== -1) return { ok: false, error: 'Carte déjà retournée.' };
      var now = Date.now();
      if (!state.startTs) { state.startTs = now; state.dernierTs = now; state.actifMs = 0; }
      else {
        // une pause (appel, téléphone posé…) ne compte que pour 20 s au plus
        state.actifMs = (state.actifMs || 0) + Math.max(0, Math.min(now - (state.dernierTs || now), 20000));
        state.dernierTs = now;
      }
      state.pret = true;
      if (!state.journal) state.journal = [];
      state.journal.push(i);
      state.up.push(i);
      state.coups = (state.coups || 0) + 1;
      state.dernier = { t: 'flip', p: player, i: i };
      if (state.up.length === 2) {
        state.players[player].tries++; // un essai = deux cartes retournées
        var a = state.cards[state.up[0]], b = state.cards[state.up[1]];
        if (a.e === b.e) {
          a.matched = b.matched = true;
          a.by = b.by = player;
          state.players[player].pairs++;
          state.serie = (state.serie || 0) + 1;
          state.dernier = { t: 'paire', p: player, i: state.up[1], j: state.up[0], serie: state.serie };
          state.up = [];
          if (state.cards.every(function (c) { return c.matched; })) {
            state.finished = true;
            state.durationSec = Math.max(1, Math.round((state.actifMs || 0) / 1000));
          }
          // paire trouvée : le joueur rejoue
        } else {
          state.mismatch = true;
          state.serie = 0;
          state.dernier = { t: 'rate', p: player, i: state.up[1], j: state.up[0] };
          state.current = (state.current + 1) % state.players.length;
        }
      }
      return { ok: true };
    },

    /* L'adversaire IA : une vraie mémoire (voir souvenirs). Il rejoue une
       paire qu'il se rappelle, retrouve la jumelle d'une carte qu'il a déjà
       vue, et sinon découvre une carte qu'il ne connaît pas. Il ne regarde
       JAMAIS une carte cachée qui n'a pas été montrée. */
    bot: function (state, me, ctx) {
      if (state.finished) return null;
      if (state.current !== me) return null;
      var niveau = (ctx && ctx.niveau) || state.niveauIA || 'moyen';
      // après un raté, apply() recache les cartes au prochain retournement
      var up = state.mismatch ? [] : state.up;
      var mem = souvenirs(state, me, niveau);
      var cachees = [];
      for (var i = 0; i < state.cards.length; i++) {
        if (!state.cards[i].matched && up.indexOf(i) === -1) cachees.push(i);
      }
      if (!cachees.length) return null;
      var inconnues = cachees.filter(function (j) { return !mem.hasOwnProperty(j); });
      function auHasard(l) { return l[Math.floor(Math.random() * l.length)]; }

      if (up.length === 1) {
        var e = state.cards[up[0]].e; // la carte retournée est visible de tous
        for (var k = 0; k < cachees.length; k++) {
          var j = cachees[k];
          if (mem.hasOwnProperty(j) && mem[j] === e) return { t: 'flip', i: j };
        }
        // jumelle inconnue : on tente une carte jamais vue (ou oubliée)
        return { t: 'flip', i: auHasard(inconnues.length ? inconnues : cachees) };
      }
      // premier retournement : une paire connue ?
      var parEmoji = {};
      for (var x in mem) {
        if (!mem.hasOwnProperty(x)) continue;
        var ix = +x;
        if (cachees.indexOf(ix) === -1) continue;
        if (parEmoji.hasOwnProperty(mem[x])) return { t: 'flip', i: parEmoji[mem[x]] };
        parEmoji[mem[x]] = ix;
      }
      return { t: 'flip', i: auHasard(inconnues.length ? inconnues : cachees) };
    },

    render: function (el, ctx) {
      var s = assainir(ctx.state);
      var me = ctx.me;
      var v = el._mem;
      if (!v || v.id !== s.id) {
        // premier affichage (ou reprise) : on montre l'état tel quel, sans rejouer d'effet
        v = el._mem = { id: s.id, coups: s.coups || 0, up: {}, faites: {}, ancre: null };
        s.cards.forEach(function (c, i) {
          if (c.matched) v.faites[i] = true;
          else if (s.up.indexOf(i) !== -1) v.up[i] = true;
        });
      }
      if (el._memTimer) { clearInterval(el._memTimer); el._memTimer = null; }
      if (el._memRabat) { clearTimeout(el._memRabat); el._memRabat = null; }

      // ---------- avant la partie : thème et taille ----------
      if (!s.pret && !s.startTs && !s.finished) {
        el._memDom = null;
        rendreConfig(el, ctx, s, me, v);
        v.coups = s.coups || 0;
        return;
      }

      var mine = me === s.current && !s.finished;
      // plusieurs joueurs sur un même téléphone : on nomme celui qui joue
      var partage = ctx.mode === 'local' && !s.niveauIA && s.players.length > 1;
      var nouveau = (s.coups || 0) !== v.coups;
      if (!v.ancre || nouveau) v.ancre = { t: Date.now() };
      var themeId = theme(s.theme);
      var th = THEMES[themeId];

      // ---------- une grille qui tient dans l'écran ----------
      var dim = disposition(el, s.cards.length);
      var tries = s.players[s.current] ? s.players[s.current].tries : 0;
      var texteTour = s.finished ? 'Toutes les paires sont trouvées !'
        : partage ? 'À ' + GG.esc(s.players[s.current].name) + ' de jouer !'
          : mine ? 'À vous de jouer !' : 'Au tour ' + GG.de(GG.esc(s.players[s.current].name)) + GG.esc(s.players[s.current].name) + '…';
      function visage(c) {
        return c.e == null ? '' : (th.svg ? drapeau(c.e) : '<span class="mem-emoji">' + GG.esc(c.e) + '</span>');
      }
      function scoresHtml() {
        return s.players.map(function (p, i) {
          return '<span class="mem-sc' + (i === s.current && !s.finished ? ' turn' : '') + '">' + GG.esc(p.name) +
            ' · <b>' + p.pairs + '</b> · ' + p.tries + ' essai' + (p.tries > 1 ? 's' : '') + '</span>';
        }).join('');
      }
      // état visuel voulu pour chaque carte, et ce qui doit s'animer
      var aRetourner = [], aRabattre = [];
      var etats = s.cards.map(function (c, i) {
        var faceUp = c.matched || s.up.indexOf(i) !== -1;
        var vuUp = !!v.up[i];
        if (c.matched && v.faites[i]) return 'fait';
        if (faceUp && !vuUp) { aRetourner.push(i); return 'up'; }
        if (!faceUp && vuUp) { aRabattre.push(i); return ''; }
        return faceUp ? 'up' : '';
      });

      // La grille n'est reconstruite que si sa forme change ; sinon on met à
      // jour les cartes en place (48 cartes : bien plus léger, et le
      // retournement 3D n'est qu'une transition CSS sur la classe « up »).
      var cleDom = s.id + ':' + s.cards.length + ':' + themeId + ':' + dim.cols + ':' + dim.s + ':' + s.players.length + ':' + (s.defi || '');
      var board = el.querySelector('.mem-board');
      var reconstruire = el._memDom !== cleDom || !board || !el.querySelector('.mem-jeu');
      el._memCtx = { ctx: ctx, s: s, mine: mine, v: v };
      if (reconstruire) {
        var html = '<div class="mem-jeu" style="--mc:' + dim.s + 'px;--mg:' + dim.g + 'px">';
        html += '<div class="mem-barre">' +
          '<span class="mem-pastille mem-chrono" id="mem-timer" aria-label="Chrono">⏱️ ' + chrono(tempsJeu(s, v)) + '</span>' +
          '<span class="mem-pastille mem-tour' + (mine ? ' moi' : '') + '" role="status">' + texteTour + '</span>' +
          '<span class="mem-pastille mem-essais">🎯 ' + tries + '</span></div>';
        if (s.defi) html += '<p class="mem-defi-tag">🗓️ Défi du jour · ' + GG.esc(th.nom) + '</p>';
        html += '<div class="mem-board mem-t-' + themeId + '" style="grid-template-columns:repeat(' + dim.cols + ',var(--mc))">';
        s.cards.forEach(function (c, i) {
          // une carte qui doit pivoter part de sa position précédente
          var depart = aRetourner.indexOf(i) !== -1 ? '' : aRabattre.indexOf(i) !== -1 ? 'up' : etats[i];
          html += '<button class="mem-card' + (depart ? ' ' + depart : '') + (c.matched ? ' trouvee' : '') +
            '" data-i="' + i + '" style="--k:' + i + '" aria-label="Carte ' + (i + 1) + '"' + (c.matched ? ' disabled' : '') +
            '><span class="mem-inner"><span class="mem-dos"></span><span class="mem-face">' + visage(c) + '</span></span></button>';
        });
        html += '</div>';
        if (s.players.length > 1) html += '<div class="mem-scores">' + scoresHtml() + '</div>';
        html += '</div>';
        el.innerHTML = html;
        el._memDom = cleDom;
        board = el.querySelector('.mem-board');
        // un seul écouteur pour toute la grille : il lit l'état le plus récent
        board.addEventListener('click', function (ev) {
          var card = ev.target.closest ? ev.target.closest('.mem-card') : null;
          if (!card || !board.contains(card)) return;
          var cur = el._memCtx;
          var idx = parseInt(card.getAttribute('data-i'), 10);
          if (el._memGel && Date.now() < el._memGel.fin && idx === el._memGel.i) return;
          if (!cur.mine) { GG.fx.shake(card, 0.4); return; }
          if (cur.s.cards[idx] && cur.s.cards[idx].matched) return;
          if (cur.v.verrou && Date.now() < cur.v.verrou) return;
          cur.v.verrou = Date.now() + 180;
          el._memTap = idx;
          GG.haptic('light');
          cur.ctx.act({ t: 'flip', i: idx });
        });
        if (aRetourner.length || aRabattre.length) void board.offsetWidth; // l'état de départ est posé
      } else {
        var tour = el.querySelector('.mem-tour');
        tour.innerHTML = texteTour;
        tour.classList.toggle('moi', mine);
        el.querySelector('.mem-essais').textContent = '🎯 ' + tries;
        var sc = el.querySelector('.mem-scores');
        if (sc) sc.innerHTML = scoresHtml();
        var boutons = board.children;
        s.cards.forEach(function (c, i) {
          var b = boutons[i];
          if (!b) return;
          var face = b.querySelector('.mem-face');
          var voulu = visage(c);
          if (voulu && face.innerHTML !== voulu) face.innerHTML = voulu;
          if (aRetourner.indexOf(i) === -1 && aRabattre.indexOf(i) === -1) {
            b.classList.toggle('up', etats[i] === 'up');
            b.classList.toggle('fait', etats[i] === 'fait');
          }
          b.classList.toggle('trouvee', !!c.matched);
          b.disabled = !!c.matched;
        });
      }

      // ---------- effets : retourner, rabattre, envoler les paires ----------
      var F = GG.fx;
      function carte(i) { return board.children[i] || null; }
      var d = s.dernier;
      if (nouveau && d && d.t === 'config') {
        // la grille vient d'être distribuée : les cartes arrivent une à une
        // (animation CSS, confiée au compositeur : fluide même sur un petit téléphone)
        board.classList.add('distrib');
        setTimeout(function () { board.classList.remove('distrib'); }, 1400);
        GG.sfx.play('deal', { volume: 0.6 });
      }
      function pivot(b) {
        b.classList.add('pivot');
        setTimeout(function () { b.classList.remove('pivot'); }, 560);
      }
      aRetourner.forEach(function (i) { var b = carte(i); if (b) { pivot(b); b.classList.add('up'); } });
      aRabattre.forEach(function (i) { var b = carte(i); if (b) { pivot(b); b.classList.remove('up'); } });
      if (aRetourner.length) GG.sfx.play('flip', { volume: 0.7, pitch: 0.95 + Math.random() * 0.1 });
      // une carte rabattue perd son image une fois le pivot fini (rien ne reste dans le DOM)
      s.cards.forEach(function (c, i) {
        if (c.e == null && etats[i] === '') {
          var b = carte(i);
          if (b && b.querySelector('.mem-face').innerHTML) {
            setTimeout(function () {
              var cur = el._memCtx.s;
              if (b.isConnected && cur.cards[i] && cur.cards[i].e == null && !b.classList.contains('up')) b.querySelector('.mem-face').innerHTML = '';
            }, 520);
          }
        }
      });
      if (nouveau && d && d.t === 'paire') {
        var nPaire = [d.i, d.j];
        var volHtml = '<span class="mem-vol" style="--mc:' + dim.s + 'px">' + visage(s.cards[d.i]) + '</span>';
        setTimeout(function () {
          var b1 = carte(nPaire[0]), b2 = carte(nPaire[1]);
          if (!b1 || !b2) return;
          b1.classList.add('brille'); b2.classList.add('brille');
          GG.sfx.play(d.serie >= 2 ? 'combo' : 'correct', { level: Math.min(8, d.serie) });
          GG.haptic('success');
          F.burst(b2, { count: 14, shape: 'star' });
          if (d.serie >= 2) F.floatText(b2, 'Série ×' + d.serie + ' !', { color: '#ffc23d', size: 22 });
          // la paire s'envole vers le score du joueur (pastille de l'en-tête)
          var badge = document.querySelectorAll('#mini-players .player-badge')[d.p];
          var cible = badge && badge.offsetParent ? badge : el.querySelector('.mem-barre');
          setTimeout(function () {
            [b1, b2].forEach(function (b, k) {
              if (!b.isConnected) return;
              F.flyTo(b, cible, { html: volHtml, duration: 620 + k * 90, arc: 0.3, scaleTo: 0.25, rotate: k ? 20 : -20 }).then(function () {
                if (k) {
                  GG.sfx.play('coin', { volume: 0.8 });
                  F.floatText(cible, '+1', { color: '#2fd67b', size: 26 });
                  if (badge) F.pop(badge, 1.15);
                }
              });
              b.classList.remove('brille');
              b.classList.add('fait');
            });
          }, 380);
        }, 420);
        v.faites[d.i] = v.faites[d.j] = true;
        // la dernière paire : la coque fête la fin de partie (confettis, musique)
      } else if (nouveau && d && d.t === 'rate') {
        setTimeout(function () {
          var b1 = carte(d.i), b2 = carte(d.j);
          if (b1) F.shake(b1, 0.6);
          if (b2) F.shake(b2, 0.6);
          GG.sfx.play('wrong', { volume: 0.35 });
        }, 460);
      }
      // les paires déjà trouvées avant ce rendu sont posées « faites »
      s.cards.forEach(function (c, i) { if (c.matched && !(d && d.t === 'paire' && nouveau && (i === d.i || i === d.j))) v.faites[i] = true; });

      // mémoire visuelle : ce qui est face visible à l'écran maintenant
      v.up = {};
      s.cards.forEach(function (c, i) { if (!c.matched && s.up.indexOf(i) !== -1) v.up[i] = true; });
      // un raté se rabat tout seul au bout d'un instant (l'état, lui, attend le coup suivant)
      if (s.mismatch && s.up.length === 2) {
        var paireRatee = s.up.slice();
        el._memRabat = setTimeout(function () {
          paireRatee.forEach(function (i) {
            var b = carte(i);
            if (b && b.isConnected) { pivot(b); b.classList.remove('up'); }
            delete v.up[i];
          });
        }, 1250);
      }
      v.coups = s.coups || 0;

      // au raté, le tour passe sans que la grille bouge : on ignore un instant
      // la dernière carte touchée pour qu'un double-appui ne retourne pas une
      // carte du joueur suivant
      if (ctx.mode === 'local' && el._memCur !== undefined && el._memCur !== s.current) {
        el._memGel = { fin: Date.now() + 450, i: el._memTap };
      }
      el._memCur = s.current;
      // chrono vivant
      if (!s.finished && s.startTs) {
        el._memTimer = setInterval(function () {
          var t = el.querySelector('#mem-timer');
          if (!t || !document.body.contains(t)) {
            clearInterval(el._memTimer);
            el._memTimer = null;
            return;
          }
          t.textContent = '⏱️ ' + chrono(tempsJeu(s, v));
        }, 1000);
      } else {
        var tf = el.querySelector('#mem-timer');
        if (tf) tf.textContent = '⏱️ ' + chrono(tempsJeu(s, v));
      }
    },

    _souvenirs: souvenirs, _THEMES: THEMES, _defiDuJour: defiDuJour, _nouvellesCartes: nouvellesCartes,
    _disposition: calculDisposition
  };

  /* temps de jeu affiché : cumul de l'état + le temps écoulé depuis le
     dernier coup vu ici (plafonné comme dans l'état) */
  function tempsJeu(s, v) {
    if (!s.startTs) return 0;
    if (s.finished) return s.durationSec || 0;
    var ecoule = v.ancre ? Math.min(Date.now() - v.ancre.t, 20000) : 0;
    return Math.max(0, Math.round(((s.actifMs || 0) + ecoule) / 1000));
  }

  /* meilleure grille pour n cartes dans W × H : la plus grande carte possible */
  function calculDisposition(n, W, H, g) {
    var best = { cols: 4, s: 0 }, note = 0;
    for (var cols = 3; cols <= 8; cols++) {
      var rows = Math.ceil(n / cols);
      var s = Math.floor(Math.min((W - (cols - 1) * g) / cols, (H - (rows - 1) * g) / rows));
      // une grille aux rangées complètes est plus belle : on la préfère à taille presque égale
      var n2 = s * (n % cols === 0 ? 1 : 0.94);
      if (n2 > note) { note = n2; best = { cols: cols, s: s }; }
    }
    best.s = Math.min(best.s, 110);
    best.g = g;
    return best;
  }
  function disposition(el, n) {
    var W = el.clientWidth || 380;
    var vh = root.innerHeight || 780;
    var haut = el.getBoundingClientRect ? el.getBoundingClientRect().top + (root.scrollY || 0) : 120;
    // place réservée : barre du chrono (36 + 8), scores (32 + 8), bas d'écran (20) et une marge
    var H = vh - haut - 36 - 8 - 40 - 20 - 10;
    var g = n > 30 ? 5 : 7;
    return calculDisposition(n, W - 4, Math.max(200, H), g);
  }
  /* une taille de grille est proposée si ses cartes restent assez grandes pour le doigt */
  function taillePossible(el, taille) {
    return disposition(el, taille * 2).s >= 50;
  }

  function rendreConfig(el, ctx, s, me, v) {
    var hote = me === 0;
    var choix = v.choix || (v.choix = { theme: theme(s.theme), taille: TAILLES.indexOf(s.taille) !== -1 ? s.taille : 12 });
    if (!taillePossible(el, choix.taille)) choix.taille = 12;
    var d = defiDuJour(aujourdhui());
    var html = '<div class="mem-config">';
    html += '<div class="mem-apercu" aria-hidden="true">' + [0, 1, 2].map(function (k) {
      var th = THEMES[choix.theme];
      var it = th.items[k * 3];
      return '<span class="mem-card up mini" style="--k:' + k + '"><span class="mem-inner"><span class="mem-dos"></span><span class="mem-face">' +
        (th.svg ? drapeau(it) : '<span class="mem-emoji">' + GG.esc(it) + '</span>') + '</span></span></span>';
    }).join('') + '</div>';
    if (!hote) {
      html += '<p class="waiting">⏳ L’hôte choisit le thème et la taille de la grille…</p></div>';
      el.innerHTML = html;
      return;
    }
    html += '<h3 class="mem-titre">Choisissez votre thème</h3><div class="mem-themes">' + THEME_IDS.map(function (id) {
      var th = THEMES[id];
      return '<button class="mem-theme' + (choix.theme === id ? ' active' : '') + '" data-th="' + id + '">' +
        '<span class="mem-theme-ic">' + th.ic + '</span><span>' + th.nom + '</span></button>';
    }).join('') + '</div>';
    html += '<h3 class="mem-titre">Taille de la grille</h3><div class="choix-ligne mem-tailles">' + TAILLES.map(function (t) {
      var ok = taillePossible(el, t);
      return '<button class="count-btn mem-taille' + (choix.taille === t ? ' active' : '') + '" data-n="' + t + '"' +
        (ok ? '' : ' disabled title="Écran trop petit"') + '>' + t + '<small> paires</small></button>';
    }).join('') + '</div>';
    html += '<button class="btn big jeu" data-a="go">🧠 Jouer</button>';
    html += '<button class="btn big or mem-defi" data-a="defi"' + (taillePossible(el, d.taille) ? '' : ' disabled') + '>🗓️ Défi du jour <small>· ' +
      THEMES[d.theme].nom + ', ' + d.taille + ' paires, même grille pour tous</small></button>';
    html += '</div>';
    el.innerHTML = html;
    el.querySelectorAll('.mem-theme').forEach(function (b) {
      b.addEventListener('click', function () {
        choix.theme = b.getAttribute('data-th');
        GG.sfx.play('select');
        rendreConfig(el, ctx, s, me, v);
        var a = el.querySelector('.mem-apercu');
        if (a) GG.fx.stagger(a.children, { gap: 60 });
      });
    });
    el.querySelectorAll('.mem-taille').forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.disabled) return;
        choix.taille = +b.getAttribute('data-n');
        GG.sfx.play('select');
        rendreConfig(el, ctx, s, me, v);
      });
    });
    var go = el.querySelector('[data-a="go"]');
    go.addEventListener('click', function () {
      GG.sfx.play('shuffle');
      v.distribuer = true;
      ctx.act({ t: 'config', theme: choix.theme, taille: choix.taille });
    });
    var df = el.querySelector('[data-a="defi"]');
    df.addEventListener('click', function () {
      GG.sfx.play('shuffle');
      v.distribuer = true;
      ctx.act({ t: 'config', defi: true });
    });
  }

  GG.register(mod);
  if (typeof module === 'object' && module.exports) module.exports = mod;
})(typeof self !== 'undefined' ? self : globalThis);
