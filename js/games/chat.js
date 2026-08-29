/*
 * GGgames — Discussion (2 à 12 téléphones, messagerie locale).
 * Le salon de discussion de l'appli : chacun écrit depuis son téléphone,
 * le téléphone hôte relaie les messages sur le réseau local — sans
 * Internet, comme pour les jeux. Rien n'est enregistré : la conversation
 * disparaît quand le salon ferme.
 */
(function (root) {
  'use strict';
  var GG = root.GG;

  var MAX_LEN = 300;   // longueur d'un message
  var MAX_MSGS = 500;  // la conversation garde les 500 derniers messages
  var COLORS = ['#2f7a50', '#3b6ea5', '#c2452c', '#7d4a6b',
    '#b96a3d', '#1e6f77', '#a83a4f', '#d9992b'];
  var QUICK = ['👍', '❤️', '😂', '😮', '👋', '🎲'];

  function heure() {
    var d = new Date();
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }

  var mod = {
    id: 'chat',
    nom: 'Discussion',
    icone: '💬',
    desc: 'La messagerie du salon : discutez entre téléphones, sans Internet.',
    regles: '<p><strong>Le but :</strong> se parler ! Un salon de discussion ' +
      'entre les téléphones réunis, qui fonctionne comme les jeux : sur le ' +
      'réseau local, <strong>sans aucun accès Internet</strong>.</p>' +
      '<p><strong>Comment faire :</strong> un téléphone crée le salon et les ' +
      'autres le rejoignent en scannant le QR code, comme pour une partie. ' +
      'Chacun écrit dans sa bulle ; les boutons emoji envoient une réaction ' +
      'd\'un seul geste.</p>' +
      '<p><strong>Discrétion :</strong> les messages ne passent que de ' +
      'téléphone à téléphone et ne sont enregistrés nulle part — quand le ' +
      'salon ferme, la conversation disparaît.</p>',
    min: 2, max: 12,
    hotseat: false, hidden: false, netOnly: true,
    noBadges: true,

    create: function (names) {
      return {
        players: names.map(function (n) { return { name: n }; }),
        messages: []
      };
    },

    turnOf: function () { return -1; }, // tout le monde parle quand il veut
    over: function () { return false; }, // une discussion ne « finit » pas
    scoreOf: function () { return 0; },
    summary: function () { return ''; },

    apply: function (state, player, action) {
      if (action.t === 'msg') {
        if (!state.players[player]) return { ok: false, error: 'Inconnu au salon.' };
        var txt = String(action.txt || '').replace(/\s+/g, ' ').trim();
        if (!txt) return { ok: false, error: 'Message vide.' };
        if (txt.length > MAX_LEN) txt = txt.slice(0, MAX_LEN);
        state.messages.push({ p: player, txt: txt, h: heure() });
        if (state.messages.length > MAX_MSGS) {
          state.messages.splice(0, state.messages.length - MAX_MSGS);
        }
        return { ok: true };
      }
      return { ok: false, error: 'Action inconnue.' };
    },

    render: function (el, ctx) {
      var s = ctx.state;
      var me = ctx.me;

      // avant de reconstruire : était-on en bas du fil ? le champ avait-il
      // le focus ? (le clavier du téléphone ne doit pas se refermer)
      var oldLog = el.querySelector('.ch-log');
      var stick = !oldLog ||
        oldLog.scrollHeight - oldLog.scrollTop - oldLog.clientHeight < 80;
      var oldScroll = oldLog ? oldLog.scrollTop : 0;

      var html = '<div class="ch-wrap">';
      html += '<div class="ch-who">';
      s.players.forEach(function (p, i) {
        html += '<span><span class="ch-dot" style="background:' +
          COLORS[i % COLORS.length] + '"></span>' +
          (i === me ? '<b>' + GG.esc(p.name) + '</b>' : GG.esc(p.name)) + '</span>';
      });
      html += '</div>';

      html += '<div class="ch-log">';
      if (!s.messages.length) {
        html += '<p class="ch-none">💬 Le salon est ouvert.<br>Écrivez le premier message !</p>';
      }
      s.messages.forEach(function (m) {
        var mine = m.p === me;
        html += '<div class="ch-row' + (mine ? ' mine' : '') + '"><div class="ch-bub">' +
          (mine ? '' : '<div class="ch-name" style="color:' +
            COLORS[m.p % COLORS.length] + '">' +
            GG.esc(s.players[m.p] ? s.players[m.p].name : '?') + '</div>') +
          '<div class="ch-txt">' + GG.esc(m.txt) + '</div>' +
          '<div class="ch-h">' + GG.esc(m.h || '') + '</div>' +
          '</div></div>';
      });
      html += '</div>';

      html += '<div class="ch-quick">';
      QUICK.forEach(function (e) {
        html += '<button class="ch-q" data-e="' + e + '">' + e + '</button>';
      });
      html += '</div>';
      html += '<div class="ch-bar">' +
        '<input type="text" id="ch-in" maxlength="' + MAX_LEN + '" ' +
        'autocomplete="off" placeholder="Votre message…">' +
        '<button class="btn primary ch-send" title="Envoyer">➤</button></div>';
      html += '</div>';
      el.innerHTML = html;

      // petit signal quand un message des autres arrive
      var last = s.messages[s.messages.length - 1];
      if (s.messages.length > (el._chCount || 0) && last && last.p !== me) {
        try { if (navigator.vibrate) navigator.vibrate(30); } catch (e) {}
      }
      el._chCount = s.messages.length;

      var log = el.querySelector('.ch-log');
      log.scrollTop = stick ? log.scrollHeight : oldScroll;

      var input = el.querySelector('#ch-in');
      input.value = el._chDraft || '';
      input.addEventListener('input', function () { el._chDraft = input.value; });
      input.addEventListener('focus', function () { el._chFocus = true; });
      input.addEventListener('blur', function () { el._chFocus = false; });
      if (el._chFocus) {
        input.focus();
        try { input.setSelectionRange(input.value.length, input.value.length); } catch (e) {}
      }

      function send(txt) {
        var t = String(txt || '').trim();
        if (!t) return;
        el._chDraft = '';
        ctx.act({ t: 'msg', txt: t });
      }
      var btn = el.querySelector('.ch-send');
      // pointerdown neutralisé : le champ garde le focus, le clavier du
      // téléphone reste ouvert pendant qu'on enchaîne les messages
      btn.addEventListener('pointerdown', function (ev) { ev.preventDefault(); });
      btn.addEventListener('click', function () { send(input.value); });
      input.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') send(input.value);
      });
      el.querySelectorAll('.ch-q').forEach(function (q) {
        q.addEventListener('pointerdown', function (ev) { ev.preventDefault(); });
        q.addEventListener('click', function () { send(q.dataset.e); });
      });
    }
  };

  GG.register(mod);
  if (typeof module === 'object' && module.exports) module.exports = mod;
})(typeof self !== 'undefined' ? self : globalThis);
