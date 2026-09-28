/*
 * GGgames — Discussion (2 à 12 téléphones, messagerie locale), version V2.
 * Le salon de discussion de l'appli : chacun écrit depuis son téléphone,
 * le téléphone hôte relaie les messages sur le réseau local — sans
 * Internet, comme pour les jeux. Rien n'est enregistré : la conversation
 * disparaît quand le salon ferme.
 *
 * V2 : bulles modernes regroupées, avatars et couleurs, réactions emoji
 * (appui long sur une bulle), « … est en train d'écrire », signal discret à
 * l'arrivée d'un message. Tout ce qui vient des autres est échappé ; les
 * réactions ne passent que par une liste blanche.
 */
(function (root) {
  'use strict';
  var GG = root.GG;

  var MAX_LEN = 300;   // longueur d'un message
  var MAX_MSGS = 500;  // la conversation garde les 500 derniers messages
  var QUICK = ['👍', '❤️', '😂', '😮', '👋', '🎲'];
  var REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];
  var TEINTES = [150, 205, 330, 35, 265, 10, 180, 290, 55, 230, 100, 310];
  var ECRIT_MS = 6000;   // durée d'affichage de « … écrit » sans nouvelle frappe

  function heure() {
    var d = new Date();
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }

  var mod = {
    id: 'chat',
    nom: 'Discussion',
    icone: '💬',
    desc: 'La messagerie du salon : discutez entre téléphones, sans Internet. Réactions, emoji et « en train d’écrire » !',
    regles: '<p><strong>Le but :</strong> se parler ! Un salon de discussion ' +
      'entre les téléphones réunis, qui fonctionne comme les jeux : sur le ' +
      'réseau local, <strong>sans aucun accès Internet</strong>.</p>' +
      '<p><strong>Comment faire :</strong> un téléphone crée le salon et les ' +
      'autres le rejoignent en scannant le QR code, comme pour une partie. ' +
      'Chacun écrit dans sa bulle ; les boutons emoji envoient un message ' +
      'd’un seul geste, et un <strong>appui long sur une bulle</strong> y ' +
      'ajoute une réaction (👍 ❤️ 😂 😮 😢 🔥).</p>' +
      '<p><strong>Discrétion :</strong> les messages ne passent que de ' +
      'téléphone à téléphone et ne sont enregistrés nulle part — quand le ' +
      'salon ferme, la conversation disparaît.</p>',
    min: 2, max: 12,
    hotseat: false, hidden: false, netOnly: true,
    noBadges: true,

    create: function (names) {
      return {
        players: names.map(function (n) { return { name: n }; }),
        messages: [],
        nextId: 1,
        typing: {}          // joueur → compteur de frappe (affiché quelques secondes)
      };
    },

    turnOf: function () { return -1; }, // tout le monde parle quand il veut
    over: function () { return false; }, // une discussion ne « finit » pas
    scoreOf: function () { return 0; },
    summary: function () { return ''; },
    gagnants: function () { return null; },

    apply: function (state, player, action) {
      action = action || {};
      if (!state.typing) state.typing = {};
      if (!state.nextId) state.nextId = state.messages.length + 1;
      if (!state.players[player]) return { ok: false, error: 'Inconnu au salon.' };
      if (action.t === 'msg') {
        var txt = String(action.txt || '').replace(/\s+/g, ' ').trim();
        if (!txt) return { ok: false, error: 'Message vide.' };
        if (txt.length > MAX_LEN) txt = txt.slice(0, MAX_LEN);
        state.messages.push({ id: state.nextId++, p: player, txt: txt, h: heure(), re: {} });
        if (state.messages.length > MAX_MSGS) {
          state.messages.splice(0, state.messages.length - MAX_MSGS);
        }
        delete state.typing[player];
        return { ok: true };
      }
      if (action.t === 'react') {
        var e = String(action.e || '');
        if (REACTIONS.indexOf(e) === -1) return { ok: false, error: 'Réaction inconnue.' };
        var m = null;
        for (var i = state.messages.length - 1; i >= 0; i--) {
          if (state.messages[i].id === action.id) { m = state.messages[i]; break; }
        }
        if (!m) return { ok: false, error: 'Message introuvable.' };
        if (!m.re) m.re = {};
        var l = m.re[e] || [];
        var k = l.indexOf(player);
        if (k === -1) l.push(player); else l.splice(k, 1);   // deuxième appui : on retire
        if (l.length) m.re[e] = l; else delete m.re[e];
        return { ok: true };
      }
      if (action.t === 'typing') {
        if (action.on) state.typing[player] = ((state.typing[player] | 0) % 1000) + 1;
        else if (state.typing[player]) delete state.typing[player];
        return { ok: true };
      }
      return { ok: false, error: 'Action inconnue.' };
    },

    render: function (el, ctx) { rendu(el, ctx); },

    _REACTIONS: REACTIONS, _QUICK: QUICK
  };

  /* ================================================================
   * Le rendu : un squelette construit une fois, puis des mises à jour
   * ciblées (le champ de saisie n'est jamais reconstruit : le brouillon,
   * le focus et le clavier du téléphone restent).
   * ================================================================ */
  function nomDe(s, i) { return String((s.players[i] || {}).name || '?'); }
  function teinte(i) { return TEINTES[i % TEINTES.length]; }
  function avatar(s, i) {
    var n = nomDe(s, i).replace(/^🤖\s*/, '');
    return '<span class="ch-av" style="--h:' + teinte(i) + '">' + GG.esc(n.charAt(0).toUpperCase() || '?') + '</span>';
  }
  /* un message fait uniquement d'emoji (1 à 3) s'affiche en grand */
  function emojiSeul(t) {
    var sans = String(t).replace(/[\s‍️]/g, '');
    if (!sans || sans.length > 12) return false;
    try {
      return new RegExp('^(?:\\p{Extended_Pictographic}|\\p{Emoji_Modifier}|\\p{Regional_Indicator}){1,6}$', 'u').test(sans);
    } catch (e) { return false; }
  }
  function son(n, o) { try { GG.sfx.play(n, o); } catch (e) {} }
  function vibre(t) { try { GG.haptic(t); } catch (e) {} }

  function rendu(el, ctx) {
    var s = ctx.state;
    var R = el._ch;
    if (!R || !R.root || !el.contains(R.root)) {
      el.innerHTML = '<div class="ch-wrap">' +
        '<div class="ch-who"></div>' +
        '<div class="ch-log" aria-live="polite"></div>' +
        '<button class="ch-bas hidden" type="button">↓ Nouveaux messages</button>' +
        '<div class="ch-typing" aria-live="polite"></div>' +
        '<div class="ch-quick">' + QUICK.map(function (e) {
          return '<button class="ch-q" type="button" data-e="' + e + '">' + e + '</button>';
        }).join('') + '</div>' +
        '<div class="ch-bar"><input type="text" id="ch-in" maxlength="' + MAX_LEN + '" autocomplete="off" ' +
        'enterkeyhint="send" placeholder="Votre message…" aria-label="Votre message">' +
        '<button class="btn jeu ch-send" type="button" title="Envoyer" aria-label="Envoyer">➤</button></div>' +
        '<div class="ch-picker hidden" role="menu">' + REACTIONS.map(function (e) {
          return '<button type="button" data-re="' + e + '" aria-label="Réagir ' + e + '">' + e + '</button>';
        }).join('') + '</div></div>';
      R = el._ch = { root: el.firstChild, ids: {}, sigs: {}, vus: -1, frappe: {}, dernierEnvoi: 0 };
      R.log = R.root.querySelector('.ch-log');
      R.input = R.root.querySelector('#ch-in');
      R.input.value = el._chDraft || '';
      brancher(R, el);
    }
    R.ctx = ctx;
    majQui(R, s, ctx);
    majMessages(R, s, ctx);
    majFrappe(R, s, ctx);
  }

  function majQui(R, s, ctx) {
    var sig = s.players.map(function (p) { return p.name; }).join('\u0001') + ':' + ctx.me;
    if (R.sigQui === sig) return;
    R.sigQui = sig;
    R.root.querySelector('.ch-who').innerHTML = s.players.map(function (p, i) {
      return '<span class="ch-chip' + (i === ctx.me ? ' moi' : '') + '">' + avatar(s, i) +
        (i === ctx.me ? '<b>' + GG.esc(p.name) + '</b>' : GG.esc(p.name)) + '</span>';
    }).join('');
  }

  function sigReactions(m) {
    var re = m.re || {};
    return REACTIONS.map(function (e) { return re[e] ? e + re[e].join(',') : ''; }).join('|');
  }
  function htmlReactions(m, me) {
    var re = m.re || {};
    return REACTIONS.filter(function (e) { return re[e] && re[e].length; }).map(function (e) {
      var moi = re[e].indexOf(me) !== -1;
      return '<button type="button" class="ch-re' + (moi ? ' moi' : '') + '" data-re="' + e + '" data-id="' + (m.id | 0) + '">' +
        e + (re[e].length > 1 ? '<b>' + re[e].length + '</b>' : '') + '</button>';
    }).join('');
  }
  function htmlMessage(s, m, prec, suiv, me) {
    var mine = m.p === me;
    var debut = !prec || prec.p !== m.p;      // premier d'une série : le nom
    var fin = !suiv || suiv.p !== m.p;        // dernier d'une série : l'avatar
    var gros = emojiSeul(m.txt);
    return '<div class="ch-row' + (mine ? ' mine' : '') + (debut ? ' debut' : '') + (fin ? ' fin' : '') + (gros ? ' gros' : '') +
      '" data-id="' + (m.id | 0) + '" style="--h:' + teinte(m.p) + '">' +
      (mine ? '' : (fin ? avatar(s, m.p) : '<span class="ch-av vide"></span>')) +
      '<div class="ch-col"><div class="ch-bub' + (gros ? ' emoji' : '') + '">' +
      (!mine && debut ? '<div class="ch-name">' + GG.esc(nomDe(s, m.p)) + '</div>' : '') +
      '<div class="ch-txt">' + GG.esc(m.txt) + '</div>' +
      '<div class="ch-h">' + GG.esc(m.h || '') + '</div></div>' +
      '<div class="ch-reacts">' + htmlReactions(m, me) + '</div></div></div>';
  }

  function majMessages(R, s, ctx) {
    var log = R.log;
    var msgs = s.messages || [];
    var me = ctx.me;
    // anciens messages (sans identifiant) : on leur en donne un, stable
    msgs.forEach(function (m, i) { if (typeof m.id !== 'number') m.id = -1000000 + i; });
    var bas = log.scrollHeight - log.scrollTop - log.clientHeight < 90;
    if (!msgs.length) {
      if (!log.querySelector('.ch-none')) log.innerHTML = '<p class="ch-none">💬 Le salon est ouvert.<br>Écrivez le premier message !</p>';
      R.ids = {};
      return;
    }
    var vide = log.querySelector('.ch-none');
    if (vide) log.removeChild(vide);
    // retire les messages sortis de l'historique
    var garde = {};
    msgs.forEach(function (m) { garde[m.id] = true; });
    Array.prototype.slice.call(log.children).forEach(function (n) {
      var id = +n.getAttribute('data-id');
      if (!garde[id]) { log.removeChild(n); delete R.ids[id]; }
    });
    var nouveauxAutres = 0, nouveauxMiens = 0, premiere = !R.init;
    msgs.forEach(function (m, i) {
      var prec = msgs[i - 1], suiv = msgs[i + 1];
      var cle = m.id + ':' + (prec ? prec.p : '') + ':' + (suiv ? suiv.p : '') + ':' + sigReactions(m) + ':' + me;
      var noeud = R.ids[m.id];
      if (noeud && R.sigs[m.id] === cle) return;
      var tmp = document.createElement('div');
      tmp.innerHTML = htmlMessage(s, m, prec, suiv, me);
      var neuf = tmp.firstChild;
      if (noeud) {
        // regroupement ou réactions changés : on remplace sur place, sans animation
        var avait = R.sigs[m.id].split(':').slice(3).join(':') !== cle.split(':').slice(3).join(':');
        log.replaceChild(neuf, noeud);
        if (avait) {
          var r = neuf.querySelector('.ch-reacts');
          if (r) r.classList.add('bouge');
        }
      } else {
        if (!premiere) neuf.classList.add('arrive');
        log.appendChild(neuf);
        if (!premiere) { if (m.p === me) nouveauxMiens++; else nouveauxAutres++; }
      }
      R.ids[m.id] = neuf;
      R.sigs[m.id] = cle;
    });
    R.init = true;
    if (nouveauxAutres) {
      son('notify', { volume: 0.45 });
      vibre('light');
    }
    if (bas || nouveauxMiens || premiere) {
      log.scrollTop = log.scrollHeight;
      R.root.querySelector('.ch-bas').classList.add('hidden');
    } else if (nouveauxAutres) {
      R.root.querySelector('.ch-bas').classList.remove('hidden');
    }
  }

  /* « Nina est en train d'écrire… » : le compteur de frappe change à chaque
     signal ; on l'affiche quelques secondes après sa réception (horloge
     locale : aucun souci de décalage entre téléphones). */
  function majFrappe(R, s, ctx) {
    var t = s.typing || {};
    var now = Date.now();
    Object.keys(t).forEach(function (p) {
      if (!R.frappe[p] || R.frappe[p].n !== t[p]) R.frappe[p] = { n: t[p], t: now };
    });
    Object.keys(R.frappe).forEach(function (p) { if (!t[p]) delete R.frappe[p]; });
    var qui = Object.keys(R.frappe).filter(function (p) {
      return +p !== ctx.me && s.players[+p] && now - R.frappe[p].t < ECRIT_MS;
    }).map(function (p) { return +p; });
    var z = R.root.querySelector('.ch-typing');
    var html = '';
    if (qui.length) {
      var noms = qui.map(function (p) { return '<b style="--h:' + teinte(p) + '">' + GG.esc(nomDe(s, p)) + '</b>'; });
      html = '<span class="ch-points"><i></i><i></i><i></i></span>' +
        (qui.length === 1 ? noms[0] + ' est en train d’écrire…'
          : qui.length === 2 ? noms[0] + ' et ' + noms[1] + ' écrivent…' : 'Plusieurs personnes écrivent…');
    }
    if (z.innerHTML !== html) z.innerHTML = html;
    z.classList.toggle('on', !!qui.length);
    clearTimeout(R.minFrappe);
    if (qui.length) R.minFrappe = setTimeout(function () {
      if (R.root.isConnected && R.ctx) majFrappe(R, R.ctx.state, R.ctx);
    }, 1000);
  }

  function brancher(R, el) {
    var root = R.root, input = R.input;
    function envoyer(txt) {
      var t = String(txt || '').trim();
      if (!t) return;
      el._chDraft = '';
      // le champ se vide TOUT DE SUITE : en réseau, l'écran n'est redessiné
      // qu'au retour du message et le texte semblerait rester collé
      input.value = '';
      R.dernierEnvoi = 0;
      son('pop', { volume: 0.4 });
      R.ctx.act({ t: 'msg', txt: t });
    }
    // on signale la frappe au plus toutes les 2,5 s
    input.addEventListener('input', function () {
      el._chDraft = input.value;
      var now = Date.now();
      if (input.value.trim() && now - R.dernierEnvoi > 2500) {
        R.dernierEnvoi = now;
        R.ctx.act({ t: 'typing', on: true });
      }
    });
    input.addEventListener('blur', function () {
      if (R.dernierEnvoi && Date.now() - R.dernierEnvoi < ECRIT_MS) {
        R.dernierEnvoi = 0;
        R.ctx.act({ t: 'typing', on: false });
      }
    });
    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); envoyer(input.value); }
    });
    var send = root.querySelector('.ch-send');
    // pointerdown neutralisé : le champ garde le focus, le clavier du
    // téléphone reste ouvert pendant qu'on enchaîne les messages
    send.addEventListener('pointerdown', function (ev) { ev.preventDefault(); });
    send.addEventListener('click', function () { envoyer(input.value); });
    root.querySelectorAll('.ch-q').forEach(function (q) {
      q.addEventListener('pointerdown', function (ev) { ev.preventDefault(); });
      q.addEventListener('click', function () { envoyer(q.getAttribute('data-e')); });
    });
    root.querySelector('.ch-bas').addEventListener('click', function () {
      R.log.scrollTop = R.log.scrollHeight;
      this.classList.add('hidden');
    });
    R.log.addEventListener('scroll', function () {
      if (R.log.scrollHeight - R.log.scrollTop - R.log.clientHeight < 60) root.querySelector('.ch-bas').classList.add('hidden');
    });

    /* réactions : appui long (ou clic droit) sur une bulle → palette */
    var picker = root.querySelector('.ch-picker');
    var appui = null;
    function ouvrir(row) {
      var id = +row.getAttribute('data-id');
      picker.setAttribute('data-id', String(id));
      picker.classList.remove('hidden');
      var b = row.querySelector('.ch-bub').getBoundingClientRect();
      var w = root.getBoundingClientRect();
      var pw = picker.offsetWidth || 260;
      var x = Math.max(4, Math.min(w.width - pw - 4, b.left - w.left + (b.width - pw) / 2));
      var y = b.top - w.top - 52;
      if (y < 0) y = b.bottom - w.top + 6;
      picker.style.left = x + 'px';
      picker.style.top = y + 'px';
      row.classList.add('choisi');
      R.choisi = row;
      vibre('medium');
      son('open', { volume: 0.4 });
    }
    function fermer() {
      picker.classList.add('hidden');
      if (R.choisi) R.choisi.classList.remove('choisi');
      R.choisi = null;
    }
    R.log.addEventListener('pointerdown', function (ev) {
      var bub = ev.target.closest ? ev.target.closest('.ch-bub') : null;
      if (!bub) return;
      var row = bub.closest('.ch-row');
      var x0 = ev.clientX, y0 = ev.clientY;
      clearTimeout(appui && appui.t);
      appui = { row: row, x: x0, y: y0, t: setTimeout(function () { appui = null; ouvrir(row); }, 480) };
    });
    function annule(ev) {
      if (!appui) return;
      if (ev && ev.type === 'pointermove' && Math.abs(ev.clientX - appui.x) + Math.abs(ev.clientY - appui.y) < 10) return;
      clearTimeout(appui.t);
      appui = null;
    }
    R.log.addEventListener('pointermove', annule);
    R.log.addEventListener('pointerup', annule);
    R.log.addEventListener('pointercancel', annule);
    R.log.addEventListener('contextmenu', function (ev) {
      var bub = ev.target.closest ? ev.target.closest('.ch-bub') : null;
      if (!bub) return;
      ev.preventDefault();
      annule();
      ouvrir(bub.closest('.ch-row'));
    });
    picker.addEventListener('click', function (ev) {
      var b = ev.target.closest ? ev.target.closest('[data-re]') : null;
      if (!b) return;
      var id = +picker.getAttribute('data-id');
      fermer();
      son('pop', { volume: 0.5 });
      R.ctx.act({ t: 'react', id: id, e: b.getAttribute('data-re') });
    });
    // une réaction déjà posée : un appui l'ajoute ou la retire
    R.log.addEventListener('click', function (ev) {
      var b = ev.target.closest ? ev.target.closest('.ch-re') : null;
      if (!b) return;
      son('tap', { volume: 0.4 });
      R.ctx.act({ t: 'react', id: +b.getAttribute('data-id'), e: b.getAttribute('data-re') });
    });
    document.addEventListener('pointerdown', function fermeture(ev) {
      if (!root.isConnected) { document.removeEventListener('pointerdown', fermeture); return; }
      if (!picker.classList.contains('hidden') && !picker.contains(ev.target)) fermer();
    });
  }

  GG.register(mod);
  if (typeof module === 'object' && module.exports) module.exports = mod;
})(typeof self !== 'undefined' ? self : globalThis);
