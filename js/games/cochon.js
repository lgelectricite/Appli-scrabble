/* GGgames — Cochon (jeu de dé « Pig ») : premier à 100 points.
 *
 * V2 : un gros dé en 3D qui roule avec suspense, une course vers 100 (une
 * jauge par joueur, les points « en jeu » en pointillés), les pièces qui
 * volent vers la jauge quand on met à l’abri, et « Cochon ! » quand le dé
 * fait 1. Options : tour égal (tout le monde joue autant de tours) et
 * variante à deux dés (un 1 : tour perdu ;
 * double 1 : « Gros cochon », retour à zéro). IA : facile, moyen, difficile
 * (seuil adaptatif selon le score). Contre l’ordinateur : mode rapide.
 */
(function (root) {
  'use strict';
  var GG = root.GG;
  var CIBLE = 100;

  function norm(s) {
    if (!s.opts) s.opts = { egal: false, deuxDes: false }; // anciennes parties : règle d’avant
    if (s.nLancers === undefined) s.nLancers = 0;
    if (!s.des) s.des = s.die ? [s.die] : [];
    if (s.cible === undefined) s.cible = -1;
    return s;
  }
  function de() { return 1 + Math.floor(Math.random() * 6); }
  function fxReduit() { try { return GG.fx.reduced() === true; } catch (e) { return false; } }
  /* contre l’ordinateur : ses tours d’un coup ? (réglé, ou automatique : oui
     dès 3 adversaires IA, sinon on regarde chaque lancer) */
  function vite(s) { return s.rapide === true || (s.rapide == null && s.players.length >= 4); }
  function maxAutres(state, me) {
    var m = 0;
    state.players.forEach(function (p, i) { if (i !== me && p.total > m) m = p.total; });
    return m;
  }
  /* fin de tour : au suivant, ou fin de partie (tour égal : quand le tour de
     table est bouclé après que quelqu’un a atteint la cible) */
  function passe(state) {
    var n = state.players.length;
    var suivant = (state.current + 1) % n;
    state.turnPoints = 0;
    if (state.cible >= 0 && suivant === 0) { termine(state); return; }
    state.current = suivant;
  }
  function termine(state) {
    state.finished = true;
    var max = -1;
    state.players.forEach(function (p) { if (p.total > max) max = p.total; });
    state.gagnantsFin = [];
    state.players.forEach(function (p, i) { if (p.total === max) state.gagnantsFin.push(i); });
    state.winner = state.gagnantsFin[0];
  }

  /* ================= IA ================= */
  function decisionIA(state, me, niveau) {
    var tp = state.turnPoints, moi = state.players[me].total, lui = maxAutres(state, me);
    var deux = !!state.opts.deuxDes;
    if (tp === 0) return 'roll'; // rien à mettre de côté : on lance
    // dernier tour (tour égal) : il faut dépasser le meneur, coûte que coûte
    if (state.cible >= 0 && state.cible !== me) {
      return moi + tp > lui ? 'bank' : 'roll';
    }
    if (niveau === 'facile') {
      // un débutant : un seuil fixe, sans regarder les scores
      if (moi + tp >= CIBLE) return 'bank';
      return tp >= (deux ? 13 : 10) + Math.floor(Math.random() * 5) ? 'bank' : 'roll';
    }
    if (moi + tp >= CIBLE) return 'bank'; // 100 atteint : à l’abri !
    if (niveau === 'difficile') {
      // « suivre le rythme, puis finir la course » : si quelqu’un approche
      // de 100, on joue pour gagner ce tour-ci ; sinon on s’arrête à 21 ± l’écart
      if (!state.opts.egal || me === state.players.length - 1 || lui < 90) {
        if (lui >= 71 || moi >= 71) return 'roll';
      }
      var seuil = (deux ? 23 : 21) + Math.round((lui - moi) / 8);
      if (deux) seuil -= Math.floor(moi / 25); // double 1 : plus on a, plus on a à perdre
      return tp >= Math.max(10, seuil) ? 'bank' : 'roll';
    }
    // moyen : un seuil tiré entre 15 et 26 à chaque lancer, prudent quand
    // il mène (un joueur du dimanche : il ne calcule pas la fin de course)
    var s2 = 15 + Math.floor(Math.random() * 12);
    if (moi + tp >= lui + 20) s2 -= 5;
    return tp >= s2 ? 'bank' : 'roll';
  }

  function lancer(state, player) {
    var d1 = de(), des = [d1];
    if (state.opts.deuxDes) des.push(de());
    state.des = des;
    state.die = d1;
    state.nLancers++;
    var uns = des.filter(function (d) { return d === 1; }).length;
    var res = 'ok', perdu = state.turnPoints;
    if (uns === 2) {
      res = 'gros';
      perdu = state.turnPoints + state.players[player].total;
      state.players[player].total = 0;
    } else if (uns === 1) {
      res = 'cochon';
    }
    if (res === 'ok') {
      state.turnPoints += des.reduce(function (a, b) { return a + b; }, 0);
    }
    state.dernier = { player: player, des: des.slice(), res: res, points: res === 'ok' ? state.turnPoints : perdu, n: state.nLancers };
    if (res !== 'ok') passe(state);
    return res;
  }
  function banquer(state, player) {
    var p = state.players[player], gain = state.turnPoints;
    p.total += gain;
    state.nLancers++;
    state.dernier = { player: player, des: state.des.slice(), res: 'banque', points: gain, n: state.nLancers };
    state.des = [];
    state.die = 0;
    if (p.total >= CIBLE) {
      if (!state.opts.egal) { state.turnPoints = 0; termine(state); return; }
      if (state.cible < 0) state.cible = player; // dernier tour pour les suivants
    }
    passe(state);
  }

  var mod = {
    id: 'cochon',
    nom: 'Cochon',
    icone: '🐷',
    desc: 'Lancez le dé, tentez votre chance : le 1 fait tout perdre ! Premier à 100.',
    regles: '<p><strong>🎯 Le but :</strong> être le premier à 100 points.</p><p><strong>Comment jouer :</strong> lancez le dé autant de fois que vous l’osez, les points du tour s’accumulent… puis « Je garde » pour les mettre à l’abri. Mais si le dé fait 1 : 🐷 Cochon ! tout le tour est perdu.</p><p><strong>Tour égal</strong> (au choix) : quand quelqu’un atteint 100, les joueurs suivants jouent encore leur tour ; le plus gros total gagne. Tout le monde a joué autant de tours… mais le dernier sait exactement quoi battre !</p><p><strong>Variante à deux dés :</strong> un 1 fait perdre le tour ; un double 1 (« Gros cochon ») remet votre total à zéro !</p>',
    min: 2, max: 4,
    hotseat: true, hidden: false, netOnly: false,
    niveaux: ['facile', 'moyen', 'difficile'],
    noBadges: true, // la course vers 100 montre déjà noms, totaux et tour

    create: function (names) {
      return {
        id: Math.floor(Math.random() * 1e9),
        players: names.map(function (n) { return { name: n, total: 0 }; }),
        current: 0,
        turnPoints: 0,
        die: 0,
        des: [],
        target: CIBLE,
        // tour égal au choix : mesuré, il inverse l’avantage (le dernier sait
        // exactement quoi battre) — la règle classique reste celle par défaut
        opts: { egal: false, deuxDes: false },
        cible: -1, // joueur qui a atteint 100 le premier (tour égal)
        finished: false,
        winner: -1,
        nLancers: 0,
        dernier: null,
        rapide: null // null : automatique (rapide dès 3 adversaires IA)
      };
    },

    turnOf: function (state) { return state.finished ? -1 : state.current; },
    over: function (state) { return state.finished; },
    scoreOf: function (state, i) { return state.players[i].total; },
    gagnants: function (state) {
      var g = state.gagnantsFin || (state.winner >= 0 ? [state.winner] : []);
      return g.length === state.players.length && g.length > 1 ? [] : g.slice();
    },

    summary: function (state) {
      var rows = state.players.map(function (p, i) { return { n: p.name, s: +p.total || 0, i: i }; })
        .sort(function (a, b) { return b.s - a.s; });
      var g = mod.gagnants(state);
      return rows.map(function (r) {
        return '<div class="final-line"><span>🐷 ' + GG.esc(r.n) + '</span><strong>' + r.s + ' pts</strong></div>';
      }).join('') + '<h3>🏆 ' + (g.length ? g.map(function (i) { return GG.esc(state.players[i].name); }).join(' & ') + (g.length > 1 ? ' ex æquo' : ' gagne') : 'Égalité parfaite') + ' !</h3>';
    },

    apply: function (state, player, action) {
      action = action || {};
      norm(state);
      if (state.finished) return { ok: false, error: 'Partie terminée.' };
      var t = action.t;
      if (t === 'regles') {
        if (state.nLancers > 0) return { ok: false, error: 'La partie a commencé.' };
        if (action.egal !== undefined) state.opts.egal = !!action.egal;
        if (action.deuxDes !== undefined) state.opts.deuxDes = !!action.deuxDes;
        return { ok: true };
      }
      if (t === 'vitesse') {
        if (!state.niveauIA) return { ok: false, error: 'Réservé au jeu contre l’ordinateur.' };
        state.rapide = !!action.rapide;
        return { ok: true };
      }
      if (player !== state.current) return { ok: false, error: 'Ce n’est pas votre tour.' };
      // jeton anti double-appui : un 2e appui identique est ignoré
      if (action.n !== undefined && action.n !== state.nLancers) return { ok: false, error: 'Déjà pris en compte.' };
      if (t === 'roll') { lancer(state, player); return { ok: true }; }
      if (t === 'bank') {
        if (state.turnPoints === 0) return { ok: false, error: 'Rien à mettre de côté.' };
        banquer(state, player);
        return { ok: true };
      }
      if (t === 'auto') {
        // mode rapide : l’ordinateur joue tout son tour d’un coup
        if (!state.niveauIA || !vite(state) || player === 0) return { ok: false, error: 'Action réservée à l’ordinateur.' };
        var etapes = [];
        for (var k = 0; k < 60; k++) {
          var d = decisionIA(state, player, state.niveauIA);
          if (d === 'bank' && state.turnPoints > 0) { banquer(state, player); break; }
          var res = lancer(state, player);
          etapes.push({ des: state.des.slice(), res: res });
          if (res !== 'ok' || state.current !== player) break;
        }
        state.journal = { player: player, etapes: etapes, n: state.nLancers };
        return { ok: true };
      }
      return { ok: false, error: 'Action inconnue.' };
    },

    /* L’adversaire IA :
       - facile : s’arrête à un seuil fixe (12–16), sans regarder les scores ;
       - moyen : seuil tiré autour de 18–26, qui s’adapte un peu ;
       - difficile : seuil adaptatif 21 + écart/8, joue le tout pour le tout
         quand quelqu’un approche de 100, et sait « dépasser le meneur »
         au dernier tour. */
    bot: function (state, me, ctx) {
      if (state.finished || state.current !== me) return null;
      norm(state);
      var niveau = (ctx && ctx.niveau) || state.niveauIA || 'moyen';
      if (vite(state) && state.niveauIA && me !== 0 && state.turnPoints === 0) return { t: 'auto' };
      var d = decisionIA(state, me, niveau);
      return d === 'bank' ? { t: 'bank', n: state.nLancers } : { t: 'roll', n: state.nLancers };
    },

    render: function (el, ctx) { rendu(el, ctx); },
    _decision: decisionIA
  };

  /* ================= Dessin ================= */
  var ROT = { 1: [0, 0], 2: [-90, 0], 3: [0, -90], 4: [0, 90], 5: [90, 0], 6: [0, 180] };
  function gros(v, i, cls) {
    var faces = '';
    for (var f = 1; f <= 6; f++) faces += '<i class="pig-f f' + f + '"></i>';
    v = v >= 1 && v <= 6 ? v | 0 : 0;
    var r = ROT[v || 6];
    return '<div class="pig-de' + cls + '" style="--fx:' + r[0] + 'deg;--fy:' + r[1] + 'deg;--dl:' + (i * 90) + 'ms" data-v="' + (v || 0) + '">' +
      '<span class="pig-cube">' + faces + '</span></div>';
  }
  var COULEURS = ['#ff6fa0', '#5fd0ff', '#ffc23d', '#7dffb0'];

  function rendu(el, ctx) {
    var s = norm(ctx.state), fx = GG.fx, sfx = GG.sfx;
    var enSolo = ctx.mode === 'local' && !!s.niveauIA;
    var hotseat = ctx.mode === 'local' && !s.niveauIA;
    var mine = ctx.me === s.current && !s.finished;
    var nom = function (i) { return s.players[i] ? GG.esc(s.players[i].name) : '?'; };
    var avant = el._v2 && el._v2.jeu === 'cochon' && el._v2.id === s.id ? el._v2 : null;
    var dern = s.dernier;
    var nouveau = !!(avant && dern && dern.n > avant.n);
    var nouveauJournal = !!(avant && s.journal && s.journal.n > avant.n && (!avant.journal || avant.journal !== s.journal.n));
    el._v2 = { jeu: 'cochon', id: s.id, n: dern ? dern.n : 0, totaux: s.players.map(function (p) { return p.total; }), journal: s.journal ? s.journal.n : 0 };
    var totauxAvant = avant ? avant.totaux : null;

    var html = '<div class="pig-v2">';
    // ---- réglages (avant le premier lancer) ----
    if (!s.nLancers) {
      html += '<div class="pig-regles">' +
        '<button class="pig-regle' + (s.opts.egal ? ' on' : '') + '" data-r="egal"><small>🏁 Tour égal</small>' + (s.opts.egal ? 'Oui' : 'Non') + '</button>' +
        '<button class="pig-regle' + (s.opts.deuxDes ? ' on' : '') + '" data-r="deuxDes"><small>🎲 Variante</small>' + (s.opts.deuxDes ? 'Deux dés' : 'Un dé') + '</button></div>';
    }
    // ---- la course vers 100 ----
    html += '<div class="pig-course">';
    s.players.forEach(function (p, i) {
      // (nombres forcés : un état venu du réseau ne glisse rien dans la page)
      var enJeu = i === s.current && !s.finished ? (+s.turnPoints || 0) : 0;
      var pc = Math.min(100, +p.total || 0), pj = Math.min(100 - pc, enJeu);
      var ancien = totauxAvant && totauxAvant[i] !== undefined ? Math.min(100, totauxAvant[i]) : pc;
      html += '<div class="pig-couloir' + (i === s.current && !s.finished ? ' tour' : '') + (s.cible === i ? ' arrive' : '') +
        '" style="--c:' + COULEURS[i % 4] + '" data-p="' + i + '">' +
        '<span class="pig-nom">' + nom(i) + '</span>' +
        '<span class="pig-piste"><i class="pig-rempli" style="width:' + ancien + '%" data-w="' + pc + '"></i>' +
        '<i class="pig-enjeu" style="left:' + pc + '%;width:' + pj + '%"></i>' +
        '<i class="pig-cochon" style="left:' + (pc + pj) + '%">🐷</i></span>' +
        '<b class="pig-total">' + (+p.total || 0) + '</b></div>';
    });
    html += '</div>';
    if (s.cible >= 0 && !s.finished) {
      html += '<p class="pig-dernier">🏁 ' + nom(s.cible) + ' a atteint ' + CIBLE + ' : dernier tour pour les suivants !</p>';
    }
    // ---- le dé ----
    var des = s.des && s.des.length ? s.des : (dern && dern.res !== 'banque' && dern.des ? dern.des : []);
    var roule = (nouveau && dern && dern.res !== 'banque') || nouveauJournal;
    html += '<div class="pig-zone' + (dern && nouveau && (dern.res === 'cochon' || dern.res === 'gros') ? ' rate' : '') + '">';
    if (des.length) des.forEach(function (v, i) { html += gros(v, i, (roule ? ' roule' : '') + (des.length > 1 ? ' duo' : '')); });
    else html += gros(0, 0, ' repos' + (s.opts.deuxDes ? ' duo' : '')) + (s.opts.deuxDes ? gros(0, 1, ' repos duo') : '');
    html += '</div>';
    // ---- points du tour ----
    // suspense : tant que le dé roule, on affiche encore les points d’avant
    var gainDe = dern && dern.res === 'ok' && dern.des ? dern.des.reduce(function (a, b) { return a + b; }, 0) : 0;
    var tpS = +s.turnPoints || 0;
    var tpAff = roule && dern && dern.res === 'ok' && !fxReduit() ? tpS - (+gainDe || 0) : tpS;
    html += '<div class="pig-tour"><span>Points en jeu</span><b class="pig-tp">' + tpAff + '</b></div>';
    // ---- message ----
    var msg = '';
    if (dern && dern.player !== undefined && s.players[dern.player]) {
      var qui = nom(dern.player);
      if (dern.res === 'cochon') {
        var perdu = +dern.points || 0;
        msg = '🐷 Cochon ! ' + qui + (perdu ? ' perd ' + perdu + ' point' + (perdu > 1 ? 's' : '') + '.' : ' fait 1 d’entrée.');
      }
      else if (dern.res === 'gros') msg = '🐷🐷 Gros cochon ! ' + qui + ' retombe à zéro.';
      else if (dern.res === 'banque') msg = '💰 ' + qui + ' met ' + (+dern.points || 0) + ' points à l’abri.';
    }
    var suite = s.finished ? 'Partie terminée !' : mine
      ? (hotseat ? 'À toi, <b>' + nom(s.current) + '</b> : lance ou garde !' : 'À vous : lancez, ou gardez vos points.')
      : (enSolo ? nom(s.current) + ' tente sa chance…' : 'Au tour de ' + nom(s.current) + '…');
    html += '<p class="mini-msg pig-msg">' + (msg ? msg + ' ' : '') + suite + '</p>';
    // ---- actions ----
    html += '<div class="mini-actions pig-actions">' +
      '<button class="btn big primary" data-a="roll"' + (mine ? '' : ' disabled') + '>🎲 Lancer</button>' +
      '<button class="btn big or" data-a="bank"' + (mine && s.turnPoints ? '' : ' disabled') + '><span>💰 Je garde +<span class="pig-bq">' + tpAff + '</span></span></button></div>';
    if (enSolo) {
      html += '<button class="pig-vite' + (vite(s) ? ' on' : '') + '" data-a="vitesse" aria-pressed="' + vite(s) + '">⏩ ' +
        (vite(s) ? 'IA rapide ✓' : 'Accélérer l’IA') + '</button>';
    }
    html += '<p class="hint pig-aide">' + (s.opts.deuxDes ? 'Un 1 : tour perdu · double 1 : retour à zéro' : 'Un 1 fait perdre les points du tour') +
      ' · premier à ' + CIBLE + (s.opts.egal ? ' (tour égal)' : '') + '</p>';
    html += '</div>';
    el.innerHTML = html;

    /* ---- anti double-appui ----
       Un 1 au dé passe le tour SANS que les boutons bougent : au changement de
       joueur on gèle les boutons un instant (sur un seul téléphone) ; et le
       bouton « Lancer » n’est ré-armé qu’une fois le dé retombé. */
    var gen = (el._pigGen || 0) + 1;
    el._pigGen = gen;
    el._pigJoue = false;
    if (avant && ctx.mode === 'local' && el._pigCur !== undefined && el._pigCur !== s.current) el._pigGel = Date.now() + 450;
    else if (!avant) el._pigGel = 0;
    el._pigCur = s.current;
    var delai = Math.max((el._pigGel || 0) - Date.now(), roule && mine ? 560 : 0);
    var boutons = el.querySelectorAll('.pig-actions .btn');
    if (delai > 0) {
      var etaient = [];
      boutons.forEach(function (b) { etaient.push(b.disabled); b.disabled = true; });
      setTimeout(function () {
        if (el._pigGen !== gen) return;
        boutons.forEach(function (b, k) { b.disabled = etaient[k]; });
      }, delai);
    }
    function agir(a) {
      if (el._pigGen !== gen || el._pigJoue) return;
      el._pigJoue = true;
      if (ctx.act(a) === false) el._pigJoue = false;
    }
    el.querySelectorAll('[data-a]').forEach(function (b) {
      b.addEventListener('click', function () {
        var a = b.getAttribute('data-a');
        if (a === 'roll') { sfx.play('dice'); GG.haptic('medium'); agir({ t: 'roll', n: s.nLancers }); }
        else if (a === 'bank') { agir({ t: 'bank', n: s.nLancers }); }
        else if (a === 'vitesse') { sfx.play('toggle'); agir({ t: 'vitesse', rapide: !vite(s) }); }
      });
    });
    el.querySelectorAll('[data-r]').forEach(function (b) {
      b.addEventListener('click', function () {
        var k = b.getAttribute('data-r'), a = { t: 'regles' };
        a[k] = !s.opts[k];
        sfx.play('toggle');
        agir(a);
      });
    });

    /* ---- effets ---- */
    // les jauges se remplissent (transition CSS depuis l’ancienne valeur)
    requestAnimationFrame(function () {
      el.querySelectorAll('.pig-rempli').forEach(function (r) { r.style.width = r.getAttribute('data-w') + '%'; });
    });
    if (!nouveau && !nouveauJournal) return;
    var d = dern, zone = el.querySelector('.pig-zone');
    var duree = fx.reduced() ? 0 : 700;
    if (d.res !== 'banque' && d.player !== ctx.me && !hotseat) sfx.play('dice', { volume: 0.8 });
    if (nouveauJournal && d.res === 'banque') sfx.play('dice', { volume: 0.7 });
    setTimeout(function () {
      // « Cochon ! » se joue même si l’IA suivante a déjà redessiné l’écran
      if (el._pigGen !== gen && d.res !== 'cochon' && d.res !== 'gros') return;
      zone = el.querySelector('.pig-zone') || zone;
      var tp = el.querySelector('.pig-tp');
      if (d.res === 'ok') {
        sfx.play('tock', { volume: 0.6 });
        var bq = el.querySelector('.pig-bq');
        if (bq) bq.textContent = s.turnPoints;
        if (tp) fx.countUp(tp, Math.max(0, s.turnPoints - d.des.reduce(function (a, b) { return a + b; }, 0)), s.turnPoints, 350);
        fx.floatText(zone, '+' + d.des.reduce(function (a, b) { return a + b; }, 0), { color: '#7dffb0', size: 28 });
        if (tp) fx.pop(tp);
      } else if (d.res === 'cochon' || d.res === 'gros') {
        // Cochon ! un gros groin qui surgit et se dandine
        sfx.play(d.res === 'gros' ? 'lose' : 'wrong');
        GG.haptic('error');
        // posé sur la page (et non dans l’arène) : il survit au rendu suivant
        // quand l’IA enchaîne tout de suite
        var groin = document.createElement('div');
        groin.className = 'pig-groin' + (d.res === 'gros' ? ' gros' : '');
        groin.setAttribute('aria-hidden', 'true');
        groin.innerHTML = '<span>🐷</span><b>' + (d.res === 'gros' ? 'GROS COCHON !' : 'COCHON !') + '</b>';
        if (zone) {
          var rz = zone.getBoundingClientRect();
          groin.style.left = (rz.left + rz.width / 2) + 'px';
          groin.style.top = (rz.top + rz.height / 2) + 'px';
          document.body.appendChild(groin);
          setTimeout(function () { if (groin.parentNode) groin.parentNode.removeChild(groin); }, fx.reduced() ? 1200 : 2400);
        }
        if (d.points) fx.floatText(zone, '−' + d.points, { color: '#ff6b7a', size: 30 });
        fx.shake(zone, 1);
        if (d.res === 'gros') fx.shakeScreen(1);
      } else if (d.res === 'banque') {
        sfx.play('coin');
        GG.haptic('success');
        var couloir = el.querySelector('.pig-couloir[data-p="' + (d.player | 0) + '"] .pig-total');
        var depart = el.querySelector('.pig-tour');
        for (var k = 0; k < Math.min(6, 1 + Math.floor(d.points / 6)); k++) {
          (function (k2) {
            setTimeout(function () {
              if (couloir && depart) fx.flyTo(depart, couloir, { html: '<div class="pig-piece">🪙</div>', duration: 520, arc: 0.3 });
            }, k2 * 70);
          })(k);
        }
        setTimeout(function () {
          if (couloir) { fx.pop(couloir); fx.countUp(couloir, s.players[d.player].total - d.points, s.players[d.player].total, 500); }
        }, 520);
        if (s.players[d.player].total >= CIBLE) {
          setTimeout(function () { fx.burst(couloir, { count: 24, shape: 'star' }); sfx.play('success'); }, 600);
        }
      }
    }, d.res === 'banque' && !nouveauJournal ? 0 : duree);
  }

  GG.register(mod);
  if (typeof module === 'object' && module.exports) module.exports = mod;
})(typeof self !== 'undefined' ? self : globalThis);
