/* GGgames — contrôleur de l'interface. */
(function () {
  'use strict';

  var S = window.Scrabble;

  /* Nombre maximum d'invités selon le jeu choisi pour le salon. */
  function maxGuests() {
    var mod = window.GG && window.GG.byId[pendingGame];
    return mod ? mod.max - 1 : 3;
  }
  function minGuests() {
    var mod = window.GG && window.GG.byId[pendingGame];
    return mod ? Math.max(1, mod.min - 1) : 1;
  }
  function gameStarted() { return !!(state || miniState); }
  function gameScreenId() { return currentGame === 'mots' ? 'screen-game' : 'screen-mini'; }

  /* ---------- état de l'interface ---------- */
  var state = null;          // état de la partie (moteur)
  var mode = null;           // 'local' | 'solo' | 'host' | 'guest'
  var myFixedIndex = 0;      // index du joueur sur ce téléphone (modes réseau)
  var localCount = 2;        // nombre de joueurs en mode local
  var aiLevel = 'moyen';     // niveau de l'IA en mode solo
  var aiThinking = false;    // l'IA calcule son coup
  var dict = null;           // dictionnaire chargé
  var dictPromise = null;

  /* Plateforme multi-jeux */
  var currentGame = 'mots';  // jeu en cours ('mots' ou id d'un mini-jeu)
  var pendingGame = 'mots';  // jeu choisi avant le salon réseau
  var miniMod = null;        // module du mini-jeu en cours
  var miniState = null;      // état du mini-jeu
  var miniMe = 0;            // mon index joueur (modes réseau)
  var miniTimer = null;      // minuteur d'autorité (petit bac…)
  var miniLastViewer = -1;   // dernier joueur affiché (écran passe-téléphone)
  var miniCount = 2;         // nombre de joueurs (mini-jeu sur un téléphone)
  var miniBots = 0;          // adversaires IA en jeu (mode « contre l'ordinateur »)
  var miniSoloBots = 1;      // choix courant sur l'écran de config solo
  var miniBotTimer = null;   // prochaine action IA programmée
  var miniNiveau = 'moyen';  // niveau des IA (jeux qui déclarent mod.niveaux)
  var BOT_NAMES = ['🤖 Margot', '🤖 Ernest', '🤖 Suzette', '🤖 Marcel'];
  var scanner = null;
  var pending = [];          // [{index, letter, blank, rackPos}]
  var selected = -1;         // position sélectionnée dans le chevalet
  var exchangeMode = false;
  var exchangeSel = [];      // positions marquées pour l'échange
  var jokerTarget = null;    // {index, rackPos} en attente du choix de lettre
  var passHidden = false;    // écran « passez le téléphone » affiché
  var waitingHost = false;   // invité : action envoyée, réponse attendue
  var waitingTimer = null;
  var toastTimer = null;

  /* Réseau — hôte : un pair par invité ; invité : une seule connexion. */
  var hostName = '';
  var hostPeers = [];        // [{net, name, playerIndex, connected}]
  var invitePeer = null;     // pair en cours d'invitation
  var guestNet = null;       // connexion de l'invité vers l'hôte
  /* Deux façons de se relier, pour la même partie : 'qr' (WebRTC direct,
     sur place, sans Internet) ou 'online' (code de partie via le relais). */
  var netKind = 'qr';
  var onlineLien = null;     // lien vers le relais (hôte ou invité)
  var onlineCode = '';       // code de la partie en cours
  var onlineCle = '';        // (hôte) clé secrète qui lui rend SON code après une coupure
  var guestNom = '';         // (invité) prénom annoncé à l'hôte
  var guestSiege = null;     // (invité) {code, jeton, nom} : sa place réservée dans la partie
  var revanches = [];        // (hôte) prénoms des invités partants pour rejouer
  var salleAttente = [];     // (hôte) arrivés pendant la partie : ils jouent à la suivante

  /* Connexion absente (partie reprise après un rechargement, en attendant
     que l'invité revienne) : les envois échouent sans rien casser. */
  var NET_ABSENT = {
    send: function () { return false; },
    close: function () {},
    isOpen: function () { return false; }
  };

  /* Jeton de siège : remis à chaque invité admis, il lui rend SA place s'il
     revient (et à personne d'autre). */
  function tireJeton() {
    return window.GG.Online && window.GG.Online.tirerCle ? window.GG.Online.tirerCle()
      : String(Math.random()).slice(2) + String(Date.now());
  }

  function $(id) { return document.getElementById(id); }

  /* ---------- navigation entre écrans ----------
     Chaque écran entre avec une petite animation ; l'accent de couleur du
     jeu choisi (data-jeu sur <body>) colore bannières, boutons et en-têtes ;
     hors de l'accueil, une « garde » d'historique intercepte le bouton
     retour d'Android (voir onRetour). */
  var ECRANS_JEU = ['screen-mini', 'screen-game'];
  var ECRANS_CONFIG = ['screen-mini-setup', 'screen-host', 'screen-mots-home',
    'screen-solo-setup', 'screen-local-setup'];
  function showScreen(id, opts) {
    opts = opts || {};
    document.querySelectorAll('.screen').forEach(function (s) {
      var on = s.id === id;
      s.classList.toggle('active', on);
      s.classList.toggle('retour', on && !!opts.retour);
    });
    window.scrollTo(0, 0);
    var j = null;
    if (ECRANS_JEU.indexOf(id) !== -1) j = currentGame;
    else if (ECRANS_CONFIG.indexOf(id) !== -1) j = pendingGame;
    if (j) document.body.setAttribute('data-jeu', j);
    else document.body.removeAttribute('data-jeu');
    if (id !== 'screen-home') poseGarde();
    if (id === 'screen-home') renderAccueil();
  }

  /* ---------- bouton retour d'Android ---------- */
  var garde = false;
  function poseGarde() {
    if (garde) return;
    try { history.pushState({ gg: 1 }, ''); garde = true; } catch (e) {}
  }
  var FENETRES = ['overlay-joker', 'overlay-confirm', 'overlay-rules', 'overlay-history',
    'overlay-chat', 'overlay-switch', 'overlay-menu'];
  function onRetour() {
    garde = false;
    if ($('screen-home').classList.contains('active')) return; // on laisse sortir
    for (var k = 0; k < FENETRES.length; k++) {
      if (!$(FENETRES[k]).classList.contains('hidden')) {
        if (FENETRES[k] === 'overlay-chat') chatFerme();
        else if (FENETRES[k] === 'overlay-joker') { jokerTarget = null; showOverlay('overlay-joker', false); }
        else if (FENETRES[k] === 'overlay-confirm') { confirmCb = null; showOverlay('overlay-confirm', false); }
        else showOverlay(FENETRES[k], false);
        poseGarde();
        return;
      }
    }
    if (!$('overlay-end').classList.contains('hidden')) { quitToHome(); return; }
    if (!$('overlay-pass').classList.contains('hidden')) { poseGarde(); return; }
    var enJeu = ECRANS_JEU.some(function (e) { return $(e).classList.contains('active'); });
    if (enJeu && gameStarted()) { showOverlay('overlay-menu', true); poseGarde(); return; }
    quitToHome();
  }

  function showOverlay(id, visible) {
    var el = $(id);
    var avant = !el.classList.contains('hidden');
    el.classList.toggle('hidden', !visible);
    if (visible && !avant) window.GG.sfx.play(el.classList.contains('sheet') ? 'open' : 'pop');
    if (id === 'overlay-end' && visible) majFinReseau();
  }

  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    // relance l'animation d'entrée à chaque message
    t.classList.add('hidden');
    void t.offsetWidth;
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.add('hidden'); }, 3200);
  }

  function stopScanner() {
    if (scanner) { scanner.stop(); scanner = null; }
  }

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function myIndex() {
    if (mode === 'local') return state ? state.current : 0;
    if (mode === 'solo') return 0; // l'humain est toujours le joueur 1
    return myFixedIndex;
  }

  function canAct() {
    if (!state || state.over || passHidden || waitingHost) return false;
    if (mode === 'solo') return state.current === 0 && !aiThinking;
    if (mode === 'local') return true;
    if (state.current !== myFixedIndex) return false;
    if (mode === 'guest') return !!(guestNet && guestNet.isOpen());
    return true; // hôte : autoritaire, peut toujours jouer son tour
  }

  /* ---------- plateau ---------- */
  var cells = [];
  function buildBoard() {
    var board = $('board');
    board.innerHTML = '';
    cells = [];
    for (var i = 0; i < S.SIZE * S.SIZE; i++) {
      var cell = document.createElement('div');
      cell.className = 'cell';
      var prem = S.PREMIUM[i];
      if (prem) cell.classList.add(prem);
      if (i === S.CENTER) {
        cell.classList.add('center');
      } else if (prem) {
        var tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = prem;
        cell.appendChild(tag);
      }
      cell.dataset.i = i;
      cell.addEventListener('click', onCellTap);
      board.appendChild(cell);
      cells.push(cell);
    }
  }

  function tileHtml(letter, blank, isNew) {
    var val = blank ? 0 : S.letterValue(letter);
    return '<div class="tile' + (isNew ? ' new' : '') + (blank ? ' blank' : '') + '">' +
      letter + '<span class="val">' + (val || '') + '</span></div>';
  }

  function renderBoard() {
    // dernier mot joué par un adversaire : cases mises en évidence
    var lastCells = {};
    if (state.lastMove && state.lastMove.player !== myIndex()) {
      state.lastMove.cells.forEach(function (ci) { lastCells[ci] = true; });
    }
    for (var i = 0; i < cells.length; i++) {
      var old = cells[i].querySelector('.tile');
      if (old) old.remove();
      var t = state.board[i];
      if (t) cells[i].insertAdjacentHTML('beforeend', tileHtml(t.letter, t.blank, false));
      cells[i].classList.toggle('last-word', !!lastCells[i]);
    }
    pending.forEach(function (p) {
      var oldTile = cells[p.index].querySelector('.tile');
      if (oldTile) oldTile.remove();
      cells[p.index].insertAdjacentHTML('beforeend', tileHtml(p.letter, p.blank, true));
    });
  }

  /* ---------- chevalet ---------- */
  function myRack() {
    return state.players[myIndex()].rack;
  }

  function usedRackPositions() {
    var used = {};
    pending.forEach(function (p) { used[p.rackPos] = true; });
    return used;
  }

  /* Position du chevalet AVANT laquelle insérer (-1 = à la fin), d'après le doigt. */
  function rackDropTarget(rects, fromPos, clientX) {
    for (var k = 0; k < rects.length; k++) {
      if (rects[k].pos === fromPos) continue;
      if (clientX < rects[k].left + rects[k].width / 2) return rects[k].pos;
    }
    return -1;
  }

  /*
   * Déplace la lettre `fromPos` du chevalet avant la position `target`.
   * Les positions des lettres déjà posées (pending) et la sélection suivent.
   */
  function moveRackTileTo(fromPos, target) {
    var rack = myRack();
    if (target === fromPos) { render(); return; }
    var order = [];
    for (var i = 0; i < rack.length; i++) order.push(i);
    order.splice(fromPos, 1);
    var insertAt = target === -1 ? order.length : order.indexOf(target);
    if (insertAt === -1) insertAt = order.length;
    order.splice(insertAt, 0, fromPos);
    var newRack = order.map(function (o) { return rack[o]; });
    var newPosOf = {};
    order.forEach(function (o, idx) { newPosOf[o] = idx; });
    for (i = 0; i < rack.length; i++) rack[i] = newRack[i];
    pending.forEach(function (p) { p.rackPos = newPosOf[p.rackPos]; });
    exchangeSel = exchangeSel.map(function (p) { return newPosOf[p]; });
    if (selected !== -1) selected = newPosOf[selected];
    render();
  }

  function renderRack() {
    var rackEl = $('rack');
    rackEl.innerHTML = '';
    if (!state) return;
    var rack = myRack();
    var used = usedRackPositions();
    var drag = null; // {pos, el, x, moved}
    rack.forEach(function (letter, pos) {
      if (used[pos]) return;
      var b = document.createElement('button');
      b.className = 'rack-tile';
      if (passHidden) b.classList.add('hidden-face');
      if (selected === pos) b.classList.add('selected');
      if (exchangeSel.indexOf(pos) !== -1) b.classList.add('exchange');
      var val = S.letterValue(letter);
      b.innerHTML = (letter === S.JOKER ? '★' : letter) +
        '<span class="val">' + (val || '') + '</span>';
      b.dataset.pos = pos;
      // Un appui = sélection ; un glissement horizontal = réorganisation.
      b.addEventListener('pointerdown', function (e) {
        if (passHidden) return;
        // photographie des positions au départ du glissement (repère stable)
        var rects = Array.prototype.slice.call(rackEl.querySelectorAll('.rack-tile'))
          .map(function (t) {
            var r = t.getBoundingClientRect();
            return { pos: parseInt(t.dataset.pos, 10), left: r.left, width: r.width, el: t };
          });
        drag = { pos: pos, el: b, x: e.clientX, moved: false, rects: rects, target: pos };
        try { b.setPointerCapture(e.pointerId); } catch (err) {}
      });
      b.addEventListener('pointermove', function (e) {
        if (!drag || drag.el !== b) return;
        var dx = e.clientX - drag.x;
        if (!drag.moved && Math.abs(dx) > 12) {
          drag.moved = true;
          b.classList.add('dragging');
        }
        if (!drag.moved) return;
        b.style.transform = 'translateX(' + dx + 'px) translateY(-6px)';
        // les autres lettres s'écartent pour montrer où celle-ci va se poser
        drag.target = rackDropTarget(drag.rects, drag.pos, e.clientX);
        var slot = drag.rects.length > 1
          ? drag.rects[1].left - drag.rects[0].left
          : drag.rects[0].width + 6;
        var fromIdx = -1, targetIdx = drag.rects.length;
        drag.rects.forEach(function (rc, di) {
          if (rc.pos === drag.pos) fromIdx = di;
          if (rc.pos === drag.target) targetIdx = di;
        });
        drag.rects.forEach(function (rc, di) {
          if (rc.pos === drag.pos) return;
          var shift = 0;
          if (di > fromIdx && di < targetIdx) shift = -slot;
          else if (di >= targetIdx && di < fromIdx) shift = slot;
          rc.el.style.transform = shift ? 'translateX(' + shift + 'px)' : '';
        });
      });
      b.addEventListener('pointerup', function (e) {
        if (!drag || drag.el !== b) return;
        var wasDrag = drag.moved;
        var target = drag.target;
        drag.rects.forEach(function (rc) { rc.el.style.transform = ''; });
        b.classList.remove('dragging');
        drag = null;
        if (wasDrag) moveRackTileTo(pos, target);
        else onRackTap(pos);
      });
      b.addEventListener('pointercancel', function () {
        if (drag && drag.el === b) {
          drag.rects.forEach(function (rc) { rc.el.style.transform = ''; });
          b.classList.remove('dragging');
          drag = null;
        }
      });
      rackEl.appendChild(b);
    });
  }

  /* ---------- rendu global ---------- */
  function renderBadges() {
    var bar = $('players-bar');
    if (bar.childElementCount !== state.players.length) {
      bar.innerHTML = '';
      state.players.forEach(function (_, i) {
        var badge = document.createElement('div');
        badge.className = 'player-badge';
        badge.id = 'badge-' + i;
        badge.innerHTML = '<span class="p-name"></span><span class="p-score">0</span>';
        bar.appendChild(badge);
      });
    }
    state.players.forEach(function (p, i) {
      var badge = $('badge-' + i);
      badge.querySelector('.p-name').textContent = p.name;
      badge.querySelector('.p-score').textContent = p.score;
      badge.classList.toggle('turn', !state.over && state.current === i);
      badge.classList.toggle('me',
        (mode === 'host' || mode === 'guest') && i === myFixedIndex);
      badge.classList.toggle('offline', mode === 'host' && isPeerOffline(i));
    });
  }

  function isPeerOffline(playerIdx) {
    if (playerIdx === 0) return false;
    for (var i = 0; i < hostPeers.length; i++) {
      if (hostPeers[i].playerIndex === playerIdx) return !hostPeers[i].connected;
    }
    return false;
  }

  function render() {
    if (!state) return;
    renderBadges();
    $('bag-count').textContent = '🎒 ' + state.bag.length;
    var waiting = (mode === 'host' || mode === 'guest') && state.current !== myFixedIndex;
    var bannerHtml = state.over
      ? 'Partie terminée'
      : (mode === 'solo' && state.current === 1)
        ? '🤖 L’IA réfléchit…'
        : 'Au tour de <strong>' + esc(state.players[state.current].name) + '</strong>' +
          (waiting ? '…' : '');
    // rappel du dernier coup adverse (surligné en doré sur la grille)
    if (state.lastMove && state.lastMove.player !== myIndex() && !state.over) {
      var lmName = mode === 'solo' && state.lastMove.player === 1
        ? '🤖 L’IA' : esc(state.players[state.lastMove.player].name);
      bannerHtml += '<span class="last-move-info">' + lmName + ' a joué <strong>' +
        state.lastMove.words.map(esc).join(' + ') + '</strong> (' +
        state.lastMove.points + ' pts)</span>';
    }
    $('turn-banner').innerHTML = bannerHtml;

    renderBoard();
    renderRack();
    renderMoveInfo();

    var act = canAct();
    $('btn-play').disabled = !act || pending.length === 0;
    $('btn-pass').disabled = !act;
    $('btn-exchange').disabled = !act || state.bag.length < S.RACK_SIZE;
    $('btn-recall').disabled = pending.length === 0;
    $('btn-shuffle').disabled = !state || state.over;
    $('exchange-bar').classList.toggle('hidden', !exchangeMode);
    $('actions').classList.toggle('hidden', exchangeMode);
    $('btn-exchange-ok').textContent = 'Échanger (' + exchangeSel.length + ')';
  }

  /* Premier mot hors dictionnaire d'un coup, ou null si tout est valide. */
  function invalidWord(words) {
    if (!dict) return null; // dictionnaire pas encore chargé : pas de contrôle
    for (var i = 0; i < words.length; i++) {
      if (!dict.set.has(words[i].word)) return words[i].word;
    }
    return null;
  }

  function renderMoveInfo() {
    var el = $('move-info');
    if (!pending.length || !canAct()) {
      el.classList.add('hidden');
      return;
    }
    var res = S.checkMove(state, placementsFromPending());
    var bad = res.ok ? invalidWord(res.words) : null;
    el.classList.remove('hidden');
    el.classList.toggle('good', !!res.ok && !bad);
    el.classList.toggle('bad', !res.ok || !!bad);
    if (!res.ok) {
      el.textContent = res.error;
    } else if (bad) {
      el.textContent = '« ' + bad + ' » n’est pas dans le dictionnaire.';
    } else {
      var words = res.words.map(function (w) { return w.word + ' (' + w.score + ')'; }).join(' + ');
      el.textContent = words + (res.bingo ? ' + Bonus ! 50' : '') + ' = ' + res.total + ' pts';
    }
  }

  function placementsFromPending() {
    return pending.map(function (p) {
      return { index: p.index, letter: p.letter, blank: p.blank };
    });
  }

  /* ---------- interactions plateau / chevalet ---------- */
  function onRackTap(pos) {
    if (!canAct()) return;
    if (exchangeMode) {
      var at = exchangeSel.indexOf(pos);
      if (at === -1) exchangeSel.push(pos); else exchangeSel.splice(at, 1);
      render();
      return;
    }
    selected = (selected === pos) ? -1 : pos;
    render();
  }

  function onCellTap(ev) {
    if (!canAct() || exchangeMode) return;
    var idx = parseInt(ev.currentTarget.dataset.i, 10);
    // Reprendre une lettre en attente
    var pIdx = pending.findIndex(function (p) { return p.index === idx; });
    if (pIdx !== -1) {
      pending.splice(pIdx, 1);
      render();
      return;
    }
    if (selected === -1) return;
    if (state.board[idx]) { toast('Case déjà occupée.'); return; }
    var letter = myRack()[selected];
    if (letter === S.JOKER) {
      jokerTarget = { index: idx, rackPos: selected };
      openJoker();
      return;
    }
    pending.push({ index: idx, letter: letter, blank: false, rackPos: selected });
    selected = -1;
    render();
  }

  function recallAll() {
    pending = [];
    selected = -1;
    render();
  }

  /* ---------- joker ---------- */
  function openJoker() {
    var box = $('joker-letters');
    if (!box.childElementCount) {
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach(function (l) {
        var b = document.createElement('button');
        b.textContent = l;
        b.addEventListener('click', function () {
          if (jokerTarget) {
            pending.push({ index: jokerTarget.index, letter: l, blank: true, rackPos: jokerTarget.rackPos });
            jokerTarget = null;
            selected = -1;
          }
          showOverlay('overlay-joker', false);
          render();
        });
        box.appendChild(b);
      });
    }
    showOverlay('overlay-joker', true);
  }

  /* ---------- confirmation générique ---------- */
  var confirmCb = null;
  function askConfirm(title, text, cb) {
    $('confirm-title').textContent = title;
    $('confirm-text').textContent = text;
    confirmCb = cb;
    showOverlay('overlay-confirm', true);
  }

  /* ---------- actions de jeu ---------- */
  function doPlay() {
    if (!canAct() || !pending.length) return;
    var placements = placementsFromPending();
    if (mode === 'guest') {
      sendAction({ kind: 'move', placements: placements });
      return;
    }
    var pre = S.checkMove(state, placements);
    if (pre.ok) {
      var bad = invalidWord(pre.words);
      if (bad) { toast('« ' + bad + ' » n’est pas dans le dictionnaire.'); return; }
    }
    var res = S.playMove(state, myIndex(), placements);
    if (!res.ok) { toast(res.error); return; }
    afterLocalAction();
  }

  function doPass() {
    if (!canAct()) return;
    askConfirm('Passer le tour', 'Voulez-vous vraiment passer votre tour sans jouer ?', function () {
      recallAll();
      if (mode === 'guest') {
        sendAction({ kind: 'pass' });
        return;
      }
      var res = S.passTurn(state, myIndex());
      if (!res.ok) { toast(res.error); return; }
      afterLocalAction();
    });
  }

  function startExchange() {
    if (!canAct()) return;
    recallAll();
    exchangeMode = true;
    exchangeSel = [];
    render();
  }

  function confirmExchange() {
    if (!exchangeSel.length) { toast('Touchez d’abord les lettres à échanger.'); return; }
    var rack = myRack();
    var letters = exchangeSel.map(function (pos) { return rack[pos]; });
    exchangeMode = false;
    exchangeSel = [];
    if (mode === 'guest') {
      sendAction({ kind: 'exchange', letters: letters });
      return;
    }
    var res = S.exchange(state, myIndex(), letters);
    if (!res.ok) { toast(res.error); render(); return; }
    afterLocalAction();
  }

  function shuffleRack() {
    if (!state) return;
    recallAll();
    var rack = myRack();
    for (var i = rack.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = rack[i]; rack[i] = rack[j]; rack[j] = tmp;
    }
    render();
  }

  /* Après une action jouée sur ce téléphone (modes local et hôte). */
  function afterLocalAction() {
    pending = [];
    selected = -1;
    exchangeMode = false;
    exchangeSel = [];
    if (mode === 'host') broadcastState();
    if (state.over) {
      render();
      showEnd();
      return;
    }
    sauvePartie();
    if (mode === 'solo' && state.current === 1) {
      aiTurn();
      return;
    }
    if (mode === 'local') {
      showPassDevice();
    }
    render();
  }

  /* ---------- mode solo : tour de l'IA ---------- */
  function loadDict() {
    if (dict) return Promise.resolve(dict);
    if (!dictPromise) {
      dictPromise = fetch('data/mots.txt')
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.text();
        })
        .then(function (text) {
          dict = window.AI.buildDict(text);
          return dict;
        })
        .catch(function (e) {
          dictPromise = null;
          throw e;
        });
    }
    return dictPromise;
  }

  function aiTurn() {
    if (mode !== 'solo' || !state || state.over || state.current !== 1) return;
    aiThinking = true;
    render();
    // setTimeout : laisse l'écran afficher « l'IA réfléchit » avant le calcul
    setTimeout(function () {
      var action = window.AI.chooseAction(S, state, 1, dict, aiLevel);
      var res = null;
      if (action.kind === 'move') {
        res = S.playMove(state, 1, action.placements);
        if (res.ok) {
          var txt = action.words.map(function (w) { return w.word; }).join(' + ');
          toast('🤖 L’IA joue ' + txt + ' (' + action.total + ' pts)');
        }
      }
      if (!res || !res.ok) {
        if (action.kind === 'exchange') {
          res = S.exchange(state, 1, action.letters);
          if (res.ok) toast('🤖 L’IA échange ses lettres.');
        }
        if (!res || !res.ok) {
          S.passTurn(state, 1);
          toast('🤖 L’IA passe son tour.');
        }
      }
      aiThinking = false;
      sauvePartie();
      render();
      if (state.over) showEnd();
    }, 400);
  }

  /* ---------- mode local : passage du téléphone ---------- */
  function showPassDevice() {
    passHidden = true;
    $('pass-name').textContent = state.players[state.current].name;
    showOverlay('overlay-pass', true);
    window.GG.sfx.play('whoosh');
    render();
  }

  /* ---------- historique ---------- */
  function renderHistory() {
    var list = $('history-list');
    if (!state || !state.history.length) {
      list.innerHTML = '<p>Aucun coup joué pour l’instant.</p>';
      return;
    }
    list.innerHTML = state.history.map(function (h) {
      var name = esc(state.players[h.player].name);
      var txt;
      if (h.type === 'move') {
        txt = h.words.map(function (w) { return esc(w.word); }).join(' + ') +
          (h.bingo ? ' <em>(7 lettres !)</em>' : '');
      } else if (h.type === 'exchange') {
        txt = 'échange ' + h.count + ' lettre' + (h.count > 1 ? 's' : '');
      } else {
        txt = 'passe son tour';
      }
      return '<div class="h-row"><strong>' + name + '</strong> — ' + txt +
        '<span class="h-pts">' + (h.points || 0) + '</span></div>';
    }).join('');
  }

  /* ---------- fin de partie ---------- */
  function showEnd() {
    var det = $('end-detail');
    var lines = [];
    if (state.finalDetail) {
      if (state.finalDetail.reason === 'playout') {
        lines.push('<p>' + esc(state.players[state.finalDetail.finisher].name) +
          ' a posé toutes ses lettres : les points des lettres restantes des autres joueurs lui sont transférés.</p>');
      } else {
        lines.push('<p>Six tours sans point : chacun déduit ses lettres restantes.</p>');
      }
    }
    var ranked = state.players.map(function (p, i) { return { name: p.name, score: p.score, i: i }; })
      .sort(function (a, b) { return b.score - a.score; });
    ranked.forEach(function (r) {
      lines.push('<div class="final-line"><span>' + esc(r.name) + '</span><strong>' +
        r.score + ' pts</strong></div>');
    });
    det.innerHTML = lines.join('');
    var w = $('end-winner');
    var gagnants;
    if (ranked[0].score === ranked[1].score) {
      w.textContent = 'Égalité !';
      gagnants = [];
    } else {
      w.textContent = ranked[0].name + ' gagne !';
      gagnants = [ranked[0].i];
    }
    $('btn-end-new').classList.toggle('hidden', mode === 'guest');
    effaceSauvegarde();
    celebreFin('mots', gagnants, mode === 'solo' ? [0] : (mode === 'local' ? null : [myFixedIndex]));
    showOverlay('overlay-end', true);
  }

  function newGameSamePlayers() {
    var names = state.players.map(function (p) { return p.name; });
    state = S.newGame(names);
    pending = [];
    selected = -1;
    showOverlay('overlay-end', false);
    if (mode === 'host') {
      hostPeers.forEach(function (peer) {
        if (peer.connected) peer.net.send({ t: 'init', state: wordsRedactFor(peer.playerIndex), you: peer.playerIndex });
      });
    }
    if (mode === 'local') {
      showPassDevice();
    }
    render();
  }

  /* =================================================================
   *  MINI-JEUX — contrôleur générique (catalogue, local et réseau)
   * ================================================================= */

  function gameLabel() {
    if (pendingGame === 'mots') return 'Words';
    var mod = window.GG.byId[pendingGame];
    return mod ? mod.nom : '';
  }


  /* =================================================================
   *  V2 — PROFIL, STATISTIQUES, RÉCENTS, REPRISE, CÉLÉBRATION, RÉGLAGES
   * ================================================================= */

  function lis(cle, defaut) {
    try { var v = JSON.parse(localStorage.getItem(cle) || 'null'); return v == null ? defaut : v; }
    catch (e) { return defaut; }
  }
  function ecris(cle, v) {
    try { localStorage.setItem(cle, JSON.stringify(v)); } catch (e) {}
  }

  /* ---------- profil : prénom, avatar, couleur, retenus pour toujours ---------- */
  var AVATARS = ['🙂', '😎', '🤠', '🥳', '🤓', '😺', '🦊', '🐼', '🐸', '🦁', '🐯', '🐵',
    '🦄', '🐙', '👾', '🐧', '🦉', '🐨', '🐶', '🐱', '🐻', '🐰', '🦖', '🐝'];
  var TEINTES = [
    ['#ffcf5c', '#ff6b8b'], ['#6be38a', '#1fa37a'], ['#5ee7ff', '#3b82f6'],
    ['#c471f5', '#fa71cd'], ['#ffa24f', '#ff4f4f'], ['#9aa3ff', '#6b5cff'], ['#f7f7f7', '#9aa0c8']
  ];
  function profil() {
    var p = lis('gg-profil', {});
    return { nom: typeof p.nom === 'string' ? p.nom.slice(0, 14) : '', av: p.av || '🙂',
      teinte: TEINTES[p.teinte] ? p.teinte : 0 };
  }
  function profilSet(p) { ecris('gg-profil', p); majProfilChip(); }
  function monNom(defaut) { return profil().nom || defaut; }
  function fondAvatar(t) {
    var c = TEINTES[t] || TEINTES[0];
    return 'linear-gradient(135deg,' + c[0] + ',' + c[1] + ')';
  }
  function majProfilChip() {
    var p = profil();
    $('profil-av').textContent = p.av;
    $('profil-av').style.setProperty('--av-bg', fondAvatar(p.teinte));
    $('profil-nom').textContent = p.nom || 'Mon profil';
  }
  /* Un prénom tapé dans un écran de configuration devient celui du profil. */
  function retiensNom(v) {
    v = (v || '').trim().slice(0, 14);
    if (!v || /^(joueur|vous|invité)( ?\d+)?$/i.test(v)) return;
    var p = profil();
    if (p.nom === v) return;
    p.nom = v;
    profilSet(p);
  }
  var CHAMPS_MON_NOM = ['solo-name', 'msolo-name', 'mini-name-1', 'local-name-1', 'host-name', 'join-name', 'online-name'];
  function prefillNoms() {
    var n = profil().nom;
    if (!n) return;
    CHAMPS_MON_NOM.forEach(function (id) { if ($(id)) $(id).value = n; });
  }

  /* ---------- statistiques par jeu ---------- */
  function stats() { return lis('gg-stats', {}); }
  function noteStat(jeu, issue) {
    var st = stats();
    var j = st[jeu] || { jouees: 0, gagnees: 0, serie: 0, record: 0 };
    j.jouees++;
    if (issue === 'gagne') { j.gagnees++; j.serie++; j.record = Math.max(j.record, j.serie); }
    else if (issue === 'perdu') j.serie = 0;
    st[jeu] = j;
    ecris('gg-stats', st);
  }
  function recents() { return lis('gg-recents', []); }
  function noteRecent(jeu) {
    var r = recents().filter(function (x) { return x !== jeu; });
    r.unshift(jeu);
    ecris('gg-recents', r.slice(0, 6));
  }

  /* ---------- la fin d'une partie se fête ----------
     gagnants : indices, [] = égalité, 'tous' = victoire collective,
     null = défaite collective, undefined = inconnu.
     humains : indices joués sur CE téléphone (null = tout le monde, hotseat). */
  function celebreFin(jeu, gagnants, humains) {
    var fx = window.GG.fx, sfx = window.GG.sfx;
    var titre = 'Fin de partie', trophee = '🏁', issue = 'fini';
    var moiGagne = false;
    if (gagnants === 'tous') { moiGagne = true; }
    else if (Array.isArray(gagnants) && gagnants.length) {
      moiGagne = !humains || gagnants.some(function (g) { return humains.indexOf(g) !== -1; });
    }
    if (gagnants === 'tous') { titre = 'Victoire collective !'; trophee = '🏆'; issue = 'gagne'; }
    else if (gagnants === null) { titre = 'Perdu…'; trophee = '🕯️'; issue = 'perdu'; }
    else if (Array.isArray(gagnants) && !gagnants.length) { titre = 'Égalité !'; trophee = '🤝'; issue = 'egalite'; }
    else if (Array.isArray(gagnants)) {
      if (!humains) { titre = 'Bravo !'; trophee = '🏆'; issue = 'fini'; }
      else if (moiGagne) { titre = 'Victoire !'; trophee = '🏆'; issue = 'gagne'; }
      else { titre = 'Perdu, de peu…'; trophee = '🥈'; issue = 'perdu'; }
    }
    $('end-titre').textContent = titre;
    $('end-trophee').textContent = trophee;
    $('overlay-end').dataset.issue = issue;
    noteStat(jeu, humains ? issue : 'fini');
    setTimeout(function () {
      if (issue === 'gagne' || (issue === 'fini' && trophee === '🏆')) {
        fx.confetti({ count: 160 });
        sfx.play('win');
        window.GG.haptic('success');
      } else if (issue === 'perdu') {
        sfx.play('lose');
        window.GG.haptic('warning');
      } else {
        sfx.play('draw');
      }
    }, 180);
  }

  /* ---------- reprendre une partie interrompue ----------
     Les parties jouées sur CE téléphone (seul contre l'IA ou à plusieurs
     en se le passant) sont enregistrées à chaque coup : bouton retour,
     appel entrant, appli fermée par Android… on reprend là où on était. */
  var SAUVE_CLE = 'gg-partie';
  var sauveMinuteur = null;
  function sauvePartie() {
    clearTimeout(sauveMinuteur);
    sauveMinuteur = setTimeout(sauveMaintenant, 250);
  }
  function sauveMaintenant() {
    var sv = null;
    if (miniState && miniMod && mode === 'local' && !miniMod.over(miniState)) {
      sv = { v: 2, type: 'mini', jeu: currentGame, bots: miniBots, state: miniState, me: miniMe, ts: Date.now() };
    } else if (state && (mode === 'solo' || mode === 'local') && currentGame === 'mots' && !state.over) {
      sv = { v: 2, type: 'mots', mode: mode, niveau: aiLevel, state: state, ts: Date.now() };
    }
    else if (mode === 'host' && netKind === 'online' && onlineCode && onlineCle &&
        ((currentGame !== 'mots' && miniState && miniMod && !miniMod.over(miniState)) ||
         (currentGame === 'mots' && state && !state.over))) {
      // l'hôte en ligne : s'il recharge l'appli, il rouvre SON salon et
      // chacun retrouve sa place grâce à son jeton
      sv = { v: 2, type: 'reseau', jeu: currentGame, code: onlineCode, cle: onlineCle, hote: hostName,
        sieges: hostPeers.map(function (p) {
          return { nom: p.name, nomTape: p.nomTape || '', jeton: p.jeton || '', i: p.playerIndex };
        }),
        state: currentGame === 'mots' ? state : miniState, ts: Date.now() };
    }
    if (sv) ecris(SAUVE_CLE, sv);
  }
  function lisSauvegarde() {
    var sv = lis(SAUVE_CLE, null);
    if (!sv || sv.v !== 2 || !sv.state) return null;
    if (Date.now() - sv.ts > 14 * 86400000) return null; // au-delà de 2 semaines, on oublie
    if (sv.type === 'mini' && !window.GG.byId[sv.jeu]) return null;
    if (sv.type === 'reseau') {
      // une partie en ligne n'attend pas des heures : les amis sont partis
      if (Date.now() - sv.ts > 2 * 3600000 || !sv.code || !sv.cle) return null;
      if (sv.jeu !== 'mots' && !window.GG.byId[sv.jeu]) return null;
    }
    return sv;
  }
  function effaceSauvegarde() {
    clearTimeout(sauveMinuteur);
    try { localStorage.removeItem(SAUVE_CLE); } catch (e) {}
  }
  /* On renonce à reprendre : une table à jetons rend d'abord la pile. */
  function abandonneSauvegarde() {
    var sv = lisSauvegarde();
    if (sv && sv.type === 'mini') {
      var mod = window.GG.byId[sv.jeu];
      if (mod && mod.cashout) { try { mod.cashout(sv.state, sv.me || 0); } catch (e) {} }
    }
    effaceSauvegarde();
    updateWallet();
  }
  function ilYa(ts) {
    var m = Math.round((Date.now() - ts) / 60000);
    if (m < 1) return 'à l’instant';
    if (m < 60) return 'il y a ' + m + ' min';
    var h = Math.round(m / 60);
    if (h < 24) return 'il y a ' + h + ' h';
    var j = Math.round(h / 24);
    return 'il y a ' + j + ' jour' + (j > 1 ? 's' : '');
  }
  function renderReprise() {
    var box = $('home-reprise');
    if (!box) return;
    var sv = lisSauvegarde();
    if (!sv) { box.innerHTML = ''; return; }
    var info = catInfo(sv.type === 'mots' ? 'mots' : sv.jeu);
    var noms = (sv.state.players || []).map(function (p) { return p.name; });
    var qui = sv.type === 'reseau'
      ? 'en ligne avec ' + noms.slice(1).join(', ') + ' · code ' + sv.code
      : sv.type === 'mots'
      ? (sv.mode === 'solo' ? 'contre l’IA (' + sv.niveau + ')' : 'à ' + noms.length + ' sur ce téléphone')
      : (sv.bots ? 'contre ' + noms.slice(1).join(', ') : (noms.length > 1 ? 'à ' + noms.length + ' sur ce téléphone' : 'en solo'));
    box.innerHTML = '<div class="reprise" data-jeu="' + info.id + '" role="button" tabindex="0" id="btn-reprise">' +
      '<span class="rp-ic">' + info.icone + '</span>' +
      '<span class="rp-tx"><span class="rp-t">Reprendre : ' + window.GG.esc(info.nom) + '</span>' +
      '<span class="rp-s">' + window.GG.esc(qui) + ' · ' + ilYa(sv.ts) + '</span></span>' +
      '<span class="rp-go">Jouer ▶</span>' +
      '<span class="rp-x" id="btn-reprise-x" role="button" aria-label="Oublier cette partie">✕</span></div>';
    $('btn-reprise').addEventListener('click', function (ev) {
      if (ev.target && ev.target.id === 'btn-reprise-x') {
        ev.stopPropagation();
        abandonneSauvegarde();
        renderReprise();
        return;
      }
      reprendPartie();
    });
  }
  function reprendPartie() {
    var sv = lisSauvegarde();
    if (!sv) { renderReprise(); return; }
    if (sv.type === 'reseau') { reprendPartieEnLigne(sv); return; }
    if (sv.type === 'mini') {
      var mod = window.GG.byId[sv.jeu];
      var besoinDico = sv.jeu === 'motus';
      (besoinDico ? loadDict().catch(function () {}) : Promise.resolve()).then(function () {
        pendingGame = currentGame = sv.jeu;
        miniMod = mod;
        mode = 'local';
        miniBots = sv.bots || 0;
        miniState = sv.state;
        miniMe = sv.me || 0;
        enterMini();
      });
      return;
    }
    loadDict().then(function () {
      pendingGame = currentGame = 'mots';
      mode = sv.mode;
      aiLevel = sv.niveau || 'moyen';
      state = sv.state;
      pending = [];
      selected = -1;
      enterGame();
      if (mode === 'local') showPassDevice();
      else if (mode === 'solo' && state.current === 1) aiTurn();
    }).catch(function () {
      toast('Impossible de charger le dictionnaire pour reprendre la partie.');
    });
  }

  /* L'hôte d'une partie en ligne revient (appli rechargée, téléphone
     redémarré) : il rouvre SON code, et chaque invité qui revient retrouve
     sa place grâce à son jeton — les autres attendent sur leur écran. */
  function reprendPartieEnLigne(sv) {
    if (!window.GG.Online.disponible()) { showRelaisSettings(); return; }
    var besoinDico = sv.jeu === 'mots' || sv.jeu === 'motus';
    (besoinDico ? loadDict().catch(function () {}) : Promise.resolve()).then(function () {
      netKind = 'online';
      mode = 'host';
      hostName = sv.hote || monNom('Joueur 1');
      pendingGame = currentGame = sv.jeu;
      revanches = [];
      hostPeers = (sv.sieges || []).map(function (x) {
        return { net: NET_ABSENT, name: x.nom, nomTape: x.nomTape || '', jeton: x.jeton || '',
          playerIndex: x.i, connected: false };
      });
      if (sv.jeu === 'mots') {
        miniState = null;
        miniMod = null;
        state = sv.state;
        myFixedIndex = 0;
        pending = [];
        selected = -1;
        enterGame();
      } else {
        state = null;
        miniMod = window.GG.byId[sv.jeu];
        miniBots = 0;
        miniState = sv.state;
        miniMe = 0;
        miniLastViewer = -1;
        enterMini();
      }
      setNetBanner(true, 'Réouverture de la partie ' + sv.code + '…');
      hostOnlineOuvre(sv.code, sv.cle, true);
    });
  }

  /* ---------- l'accueil : salutation, reprise, profil ---------- */
  var ACCROCHES = ['À quoi on joue ?', 'Une petite partie ?', 'Prêt pour la revanche ?',
    'Qui gagne ce soir ?', 'On lance les dés ?', 'Un défi entre amis ?'];
  function renderAccueil() {
    var p = profil();
    $('home-salut').textContent = p.nom ? 'Salut ' + p.nom + ' ! 👋' : 'Salut ! 👋';
    $('home-sous').textContent = ACCROCHES[Math.floor(Math.random() * ACCROCHES.length)];
    majProfilChip();
    renderBienvenue();
    renderReprise();
    if (filtreActif === 'tous') renderCatalog();
  }

  /* Première ouverture : on fait connaissance (le prénom sera proposé dans
     tous les jeux). Une carte discrète, jamais une fenêtre qui bloque. */
  function renderBienvenue() {
    var box = $('home-bienvenue');
    if (!box) return;
    var p = profil();
    if (p.nom || lis('gg-bienvenue-vu', false)) { box.innerHTML = ''; return; }
    if (box.childElementCount) return;
    box.innerHTML = '<div class="bienvenue">' +
      '<button class="bv-x" id="bv-x" aria-label="Plus tard">✕</button>' +
      '<p class="bv-t">Bienvenue sur GGgames ! 🎉</p>' +
      '<p class="bv-s">Comment tu t’appelles ? Ton prénom sera proposé dans tous les jeux.</p>' +
      '<form class="bv-ligne" id="bv-form"><input type="text" id="bv-nom" maxlength="14" ' +
      'placeholder="Ton prénom" autocomplete="given-name" enterkeyhint="done">' +
      '<button class="btn primary" type="submit">C’est moi !</button></form></div>';
    $('bv-form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var v = $('bv-nom').value.trim().slice(0, 14);
      if (!v) { window.GG.fx.shake($('bv-nom')); window.GG.sfx.play('wrong'); return; }
      var q = profil(); q.nom = v; profilSet(q);
      ecris('gg-bienvenue-vu', true);
      window.GG.sfx.play('success');
      window.GG.haptic('success');
      window.GG.fx.confetti({ count: 60 });
      box.innerHTML = '';
      renderAccueil();
      prefillNoms();
    });
    $('bv-x').addEventListener('click', function () {
      ecris('gg-bienvenue-vu', true);
      box.innerHTML = '';
    });
  }

  /* ---------- écran « Mon profil » ---------- */
  function openProfil() {
    var p = profil();
    $('pf-nom').value = p.nom;
    $('pf-av').textContent = p.av;
    $('pf-av').style.setProperty('--av-bg', fondAvatar(p.teinte));
    $('pf-avatars').innerHTML = AVATARS.map(function (a) {
      return '<button class="' + (a === p.av ? 'active' : '') + '" data-av="' + a + '">' + a + '</button>';
    }).join('');
    $('pf-teintes').innerHTML = TEINTES.map(function (t, i) {
      return '<button class="' + (i === p.teinte ? 'active' : '') + '" data-t="' + i +
        '" style="background:linear-gradient(135deg,' + t[0] + ',' + t[1] + ')" aria-label="Couleur ' + (i + 1) + '"></button>';
    }).join('');
    $('pf-avatars').querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () {
        var q = profil(); q.av = b.dataset.av; profilSet(q);
        $('pf-avatars').querySelectorAll('button').forEach(function (x) { x.classList.toggle('active', x === b); });
        $('pf-av').textContent = q.av;
        window.GG.fx.pop($('pf-av'));
      });
    });
    $('pf-teintes').querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () {
        var q = profil(); q.teinte = parseInt(b.dataset.t, 10); profilSet(q);
        $('pf-teintes').querySelectorAll('button').forEach(function (x) { x.classList.toggle('active', x === b); });
        $('pf-av').style.setProperty('--av-bg', fondAvatar(q.teinte));
        window.GG.fx.pop($('pf-av'));
      });
    });
    var st = stats();
    var tot = { jouees: 0, gagnees: 0, record: 0 };
    Object.keys(st).forEach(function (k) {
      tot.jouees += st[k].jouees; tot.gagnees += st[k].gagnees; tot.record = Math.max(tot.record, st[k].record);
    });
    $('pf-stats').innerHTML =
      '<div class="stat-case"><b>' + tot.jouees + '</b><span>parties</span></div>' +
      '<div class="stat-case"><b>' + tot.gagnees + '</b><span>victoires</span></div>' +
      '<div class="stat-case"><b>' + tot.record + '</b><span>meilleure série</span></div>';
    var lignes = Object.keys(st).sort(function (a, b) { return st[b].jouees - st[a].jouees; }).map(function (k) {
      var m = catInfo(k);
      if (!m) return '';
      return '<div class="stats-jeu" data-jeu="' + k + '"><span class="sj-ic">' + m.icone + '</span>' +
        '<span class="sj-n">' + window.GG.esc(m.nom) + '</span><span class="sj-v">' +
        st[k].gagnees + ' / ' + st[k].jouees + ' gagnées</span></div>';
    }).join('');
    $('pf-stats-jeux').innerHTML = lignes || '<p class="hint" style="text-align:center">Vos parties terminées apparaîtront ici.</p>';
    showScreen('screen-profil');
  }

  /* ---------- écran « Réglages » ---------- */
  function majReglages() {
    var R = window.GG.reglages;
    $('rg-son').classList.toggle('on', R.get('son') !== false);
    $('rg-vib').classList.toggle('on', R.get('vibrations') !== false);
    $('rg-anim').classList.toggle('on', R.get('animations') !== 'reduites');
    ['rg-son', 'rg-vib', 'rg-anim'].forEach(function (id) {
      $(id).setAttribute('aria-checked', $(id).classList.contains('on') ? 'true' : 'false');
    });
    document.body.classList.toggle('anim-reduites', R.get('animations') === 'reduites');
  }
  function openReglages() {
    majReglages();
    $('rg-version').textContent = '';
    try {
      if (window.caches && caches.keys) {
        caches.keys().then(function (ks) {
          var v = ks.filter(function (k) { return /^gggames-v/.test(k); }).sort().pop();
          $('rg-version').textContent = v ? 'Version ' + v.replace('gggames-', '') + '.' : '';
        }).catch(function () {});
      }
    } catch (e) {}
    showScreen('screen-reglages');
  }

  /* ---------- cagnotte de jetons et boutique ---------- */
  // jetons exigés pour s'installer à une table (cave du poker, mise mini du blackjack)
  var CHIP_ENTRY = { poker: 100, blackjack: 1 };

  function updateWallet() {
    if (!window.GG.wallet) return;
    $('wallet-amount').textContent = window.GG.wallet.fmt();
  }

  function renderBoutique() {
    if (!window.GG.wallet) return;
    var w = window.GG.wallet;
    $('bank-n').textContent = w.fmt();
    var msg;
    if (w.get() >= w.START) {
      msg = 'Votre cagnotte est pleine (' + w.fmt(w.START) +
        ' 🪙 ou plus) : vos gains sont à vous, la recharge hebdomadaire attendra.';
    } else {
      var ms = w.nextRefillMs();
      var j = Math.floor(ms / 86400000);
      var h = Math.floor((ms % 86400000) / 3600000);
      msg = '⏳ Recharge automatique à ' + w.fmt(w.START) + ' 🪙 dans ' +
        (j > 0 ? j + ' j ' : '') + h + ' h.';
    }
    $('bank-refill').textContent = msg;
  }

  /* Quelle version est réellement installée sur ce téléphone ? (utile pour
     diagnostiquer une mise à jour qui n'est pas passée) */
  function afficheVersion() {
    var el = $('version-appli');
    if (!el) return;
    el.textContent = '';
    try {
      if (!window.caches || !caches.keys) return;
      caches.keys().then(function (ks) {
        var v = ks.filter(function (k) { return /^gggames-v/.test(k); }).sort().pop();
        el.textContent = v ? 'Version installée : ' + v.replace('gggames-', '') : '';
      }).catch(function () {});
    } catch (e) {}
  }

  function openBoutique() {
    renderBoutique();
    showScreen('screen-boutique');
    afficheVersion();
  }

  /* Vérifie qu'on a de quoi s'asseoir à une table à jetons. */
  function chipGate(gameId) {
    var need = CHIP_ENTRY[gameId];
    if (!need || !window.GG.wallet) return true;
    if (window.GG.wallet.get() >= need) return true;
    toast('Il faut au moins ' + window.GG.wallet.fmt(need) + ' 🪙 pour jouer — ' +
      'la cagnotte se recharge chaque semaine (voir la Boutique).');
    openBoutique();
    return false;
  }

  /* ---------- l'accueil V2 : des tuiles colorées rangées par catégorie ----------
     Les tuiles gardent la classe .game-tile et l'attribut data-g dont
     dépendent les tests et le reste du code ; data-jeu leur donne leurs
     couleurs (voir css/style.css). */
  var CATEGORIES = [
    { id: 'lettres', titre: 'Jeux de lettres', ic: '🔤', jeux: ['mots', 'motus', 'pendu', 'bac', 'meles', 'croises', 'fleches'] },
    { id: 'cartes', titre: 'Cartes et casino', ic: '🃏', jeux: ['poker', 'blackjack', 'huit', 'solitaire'] },
    { id: 'classiques', titre: 'Grands classiques', ic: '🎲', jeux: ['p4', 'morpion', 'bataille', 'yams', 'cochon', 'memory'] },
    { id: 'reflexion', titre: 'Réflexion', ic: '🧩', jeux: ['sudoku', 'bonbons'] },
    { id: 'soiree', titre: 'Soirée entre amis', ic: '🎉', jeux: ['imposteur', 'manoir', 'quiz', 'proche', 'chat'] }
  ];
  var FILTRES = [
    { id: 'tous', t: '✨ Tous' },
    { id: 'plusieurs', t: '👥 À plusieurs' },
    { id: 'solo', t: '🤖 Seul' },
    { id: 'lettres', t: '🔤 Lettres' },
    { id: 'cartes', t: '🃏 Cartes' },
    { id: 'classiques', t: '🎲 Classiques' },
    { id: 'reflexion', t: '🧩 Réflexion' },
    { id: 'soiree', t: '🎉 Soirée' }
  ];
  var filtreActif = 'tous';

  function catInfo(id) {
    if (id === 'mots') return { id: 'mots', nom: 'Words', icone: '🔤', min: 1, max: 4, bot: true };
    return window.GG.byId[id];
  }

  function playersLabel(m) {
    return m.min + (m.max > m.min ? '–' + m.max : '') + ' joueur' + (m.max > 1 ? 's' : '');
  }

  function tuileHtml(m, i) {
    var joueurs = m.max === 1 ? 'solo' : (m.min + (m.max > m.min ? '–' + m.max : ''));
    return '<button class="game-tile" data-g="' + m.id + '" data-jeu="' + m.id + '" style="--i:' + i + '" aria-label="' +
      window.GG.esc(m.nom + ', ' + playersLabel(m)) + '">' +
      '<span class="gt-carre"><span class="gt-ic">' + m.icone + '</span>' +
      '<span class="gt-bd">' + joueurs + '</span>' +
      (m.bot ? '<span class="gt-fav gt-bot" title="Jouable seul contre l’ordinateur">🤖</span>' : '') +
      '</span><span class="gt-nm">' + window.GG.esc(m.nom) + '</span></button>';
  }

  function correspond(m, filtre) {
    if (filtre === 'tous') return true;
    if (filtre === 'plusieurs') return m.max > 1;
    if (filtre === 'solo') return m.max === 1 || !!m.bot;
    return false;
  }
  /* Issue de secours : vide le cache hors ligne, désinscrit le service
     worker et recharge tout depuis le site. À n'utiliser qu'avec Internet —
     c'est le seul moyen de sortir d'une mise à jour abîmée. */
  function rechargerPropre() {
    var fini = function () {
      try { location.replace(location.pathname + '?maj=' + Date.now()); }
      catch (e) { location.reload(); }
    };
    var etapes = Promise.resolve();
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
        etapes = navigator.serviceWorker.getRegistrations().then(function (rs) {
          return Promise.all(rs.map(function (r) { return r.unregister(); }));
        });
      }
      etapes = etapes.then(function () {
        if (!window.caches || !caches.keys) return null;
        return caches.keys().then(function (ks) {
          return Promise.all(ks.map(function (k) { return caches.delete(k); }));
        });
      });
    } catch (e) { /* on rechargera quand même */ }
    etapes.then(fini, fini);
    setTimeout(fini, 4000); // filet : on ne reste jamais bloqué
  }

  function renderCatalog() {
    var cat = $('catalog');
    // les onglets de catégories
    var tabs = $('cat-tabs');
    if (tabs && !tabs.childElementCount) {
      tabs.innerHTML = FILTRES.map(function (f) {
        return '<button class="cat-tab' + (f.id === filtreActif ? ' active' : '') +
          '" data-filtre="' + f.id + '">' + f.t + '</button>';
      }).join('');
      tabs.querySelectorAll('.cat-tab').forEach(function (b) {
        b.addEventListener('click', function () {
          filtreActif = b.dataset.filtre;
          tabs.querySelectorAll('.cat-tab').forEach(function (x) { x.classList.toggle('active', x === b); });
          renderCatalog();
        });
      });
    }
    // Un jeu dont le fichier n'a pas pu être chargé (mise à jour interrompue,
    // fichier abîmé…) est simplement absent : JAMAIS il ne doit emporter les
    // autres avec lui.
    var manquants = [];
    var poses = 0;
    var html = '';
    var idx = 0;
    function tuiles(ids) {
      var h = '';
      ids.forEach(function (id) {
        if (id !== 'mots' && !window.GG.byId[id]) { if (manquants.indexOf(id) === -1) manquants.push(id); return; }
        try { h += tuileHtml(catInfo(id), idx++); poses++; } catch (e) { manquants.push(id); }
      });
      return h;
    }
    var sections = CATEGORIES.filter(function (c) { return filtreActif === 'tous' || filtreActif === c.id; });
    if (filtreActif === 'plusieurs' || filtreActif === 'solo') {
      var ids = [];
      CATEGORIES.forEach(function (c) {
        c.jeux.forEach(function (id) {
          var m = null;
          try { m = catInfo(id); } catch (e) { m = null; }
          if (m && correspond(m, filtreActif)) ids.push(id);
        });
      });
      html += '<div class="grille-jeux">' + tuiles(ids) + '</div>';
    } else {
      // « Récemment joués » en tête, quand on regarde tout
      var rec = filtreActif === 'tous' ? recents().filter(function (id) {
        return id === 'mots' || window.GG.byId[id];
      }).slice(0, 3) : [];
      if (rec.length) {
        html += '<div class="cat-titre">🕘 Récemment joués</div><div class="grille-jeux">' +
          rec.map(function (id) { return tuileHtml(catInfo(id), idx++); }).join('') + '</div>';
      }
      sections.forEach(function (c) {
        var t = tuiles(c.jeux);
        if (!t) return;
        html += '<div class="cat-titre">' + c.ic + ' ' + c.titre + '</div><div class="grille-jeux">' + t + '</div>';
      });
    }
    // filet de sécurité : plus rien à afficher, ou des jeux à la traîne
    if (!poses) {
      html = '<div class="ecran-secours"><h3>😕 Les jeux ne se sont pas chargés</h3>' +
        '<p>Une mise à jour s’est probablement interrompue. Un appui suffit à ' +
        'tout retélécharger (gardez Internet le temps du rechargement).</p>' +
        '<button class="btn big primary" id="btn-secours">🔄 Recharger l’application</button></div>';
    } else if (manquants.length) {
      html += '<div class="maj-note">⚠️ ' + manquants.length + ' jeu' +
        (manquants.length > 1 ? 'x n’ont' : ' n’a') + ' pas pu être chargé' +
        (manquants.length > 1 ? 's' : '') + '. ' +
        '<button class="btn small" id="btn-secours">🔄 Recharger l’application</button></div>';
    }
    cat.innerHTML = html;
    var secours = cat.querySelector('#btn-secours');
    if (secours) secours.addEventListener('click', rechargerPropre);
    cat.querySelectorAll('.game-tile').forEach(function (t) {
      t.addEventListener('click', function () { ouvreJeu(t.dataset.g); });
    });
  }

  function ouvreJeu(id) {
    if (!chipGate(id)) return;
    window.GG.sfx.play('select');
    if (id === 'mots') {
      pendingGame = 'mots';
      prefillNoms();
      showScreen('screen-mots-home');
      return;
    }
    // jeu de pur solitaire : on entre directement, sans écran de config
    var mInfo = catInfo(id);
    if (mInfo && mInfo.max === 1) {
      pendingGame = id;
      currentGame = id;
      miniMod = window.GG.byId[id];
      mode = 'local';
      miniBots = 0;
      miniState = miniMod.create([monNom('Joueur 1')], { dict: dict });
      miniMe = 0;
      enterMini();
      return;
    }
    openMiniSetup(window.GG.byId[id]);
  }

  function updateMiniNameFields() {
    for (var i = 2; i <= 4; i++) {
      var lbl = $('mini-label-' + i);
      if (lbl) lbl.classList.toggle('hidden', miniCount < i);
    }
  }

  function openMiniSetup(mod) {
    pendingGame = mod.id;
    $('mini-setup-ic').textContent = mod.icone;
    $('mini-setup-title').textContent = mod.nom;
    $('mini-setup-desc').textContent = mod.desc;
    $('mini-setup-meta').innerHTML = '<span class="jh-pill">👥 ' + playersLabel(mod) + '</span>' +
      (mod.bot ? '<span class="jh-pill">🤖 contre l’ordinateur</span>' : '') +
      (mod.netOnly ? '<span class="jh-pill">📱 un téléphone chacun</span>' : '');
    prefillNoms();
    $('btn-mini-hotseat').classList.toggle('hidden', !mod.hotseat || mod.netOnly);
    $('btn-mini-host').classList.toggle('hidden', mod.max < 2);
    $('mini-hotseat-config').classList.add('hidden');
    // jouer seul : le jeu sait faire jouer des adversaires IA
    $('btn-mini-solo').classList.toggle('hidden', !mod.bot);
    $('mini-solo-config').classList.add('hidden');
    if (mod.bot) {
      var bb = $('msolo-bots');
      bb.innerHTML = '';
      var bMin = Math.max(1, mod.min - 1);
      var bMax = Math.min(BOT_NAMES.length, mod.max - 1);
      miniSoloBots = bMin;
      for (var nb = bMin; nb <= bMax; nb++) {
        var btn = document.createElement('button');
        btn.className = 'count-btn' + (nb === miniSoloBots ? ' active' : '');
        btn.textContent = nb;
        btn.dataset.n = nb;
        btn.addEventListener('click', function (ev) {
          miniSoloBots = parseInt(ev.currentTarget.dataset.n, 10);
          bb.querySelectorAll('.count-btn').forEach(function (x) {
            x.classList.toggle('active', x === ev.currentTarget);
          });
        });
        bb.appendChild(btn);
      }
      $('msolo-bots-label').classList.toggle('hidden', bMin === bMax);
      bb.classList.toggle('hidden', bMin === bMax);
      // niveau de l'ordinateur : pour les jeux qui en proposent plusieurs
      var nv = $('msolo-niveau');
      var niveaux = mod.niveaux || null;
      $('msolo-niveau-label').classList.toggle('hidden', !niveaux);
      nv.classList.toggle('hidden', !niveaux);
      nv.innerHTML = '';
      if (niveaux) {
        var memo = lis('gg-niveau-' + mod.id, null);
        miniNiveau = niveaux.indexOf(memo) !== -1 ? memo : (niveaux.indexOf('moyen') !== -1 ? 'moyen' : niveaux[0]);
        var LIB = { facile: '😌 Facile', moyen: '🙂 Moyen', difficile: '😈 Difficile', expert: '🧠 Expert' };
        niveaux.forEach(function (n) {
          var bt = document.createElement('button');
          bt.className = 'count-btn' + (n === miniNiveau ? ' active' : '');
          bt.dataset.niveau = n;
          bt.textContent = LIB[n] || n;
          bt.addEventListener('click', function () {
            miniNiveau = n;
            ecris('gg-niveau-' + mod.id, n);
            nv.querySelectorAll('.count-btn').forEach(function (x) { x.classList.toggle('active', x === bt); });
          });
          nv.appendChild(bt);
        });
      }
    }
    var box = $('mini-count');
    box.innerHTML = '';
    miniCount = mod.min;
    // sur un seul téléphone : 4 noms maximum, ou moins si le jeu l'impose
    var hotMax = Math.min(mod.hotseatMax || mod.max, 4);
    if (miniCount > hotMax) miniCount = hotMax;
    for (var n = mod.min; n <= hotMax; n++) {
      var b = document.createElement('button');
      b.className = 'count-btn' + (n === miniCount ? ' active' : '');
      b.textContent = n;
      b.dataset.n = n;
      b.addEventListener('click', function (ev) {
        miniCount = parseInt(ev.currentTarget.dataset.n, 10);
        box.querySelectorAll('.count-btn').forEach(function (x) {
          x.classList.toggle('active', x === ev.currentTarget);
        });
        updateMiniNameFields();
      });
      box.appendChild(b);
    }
    updateMiniNameFields();
    showScreen('screen-mini-setup');
  }

  function miniStartLocal() {
    var mod = window.GG.byId[pendingGame];
    var names = [];
    for (var i = 1; i <= miniCount; i++) {
      names.push(($('mini-name-' + i).value.trim() || 'Joueur ' + i).slice(0, 14));
    }
    var needDict = pendingGame === 'motus'; // seul Mot Mystère valide au dictionnaire
    (needDict ? loadDict().catch(function () {}) : Promise.resolve()).then(function () {
      currentGame = pendingGame;
      miniMod = mod;
      mode = 'local';
      miniBots = 0;
      miniState = mod.create(names, { dict: dict });
      miniMe = 0;
      enterMini();
    });
  }

  /* Jouer seul : l'humain est le joueur 0, les autres sont des IA. */
  function miniStartSolo() {
    var mod = window.GG.byId[pendingGame];
    var names = [($('msolo-name').value.trim() || 'Vous').slice(0, 14)];
    for (var i = 0; i < miniSoloBots; i++) names.push(BOT_NAMES[i]);
    var needDict = pendingGame === 'motus';
    (needDict ? loadDict().catch(function () {}) : Promise.resolve()).then(function () {
      currentGame = pendingGame;
      miniMod = mod;
      mode = 'local';
      miniBots = miniSoloBots;
      miniState = mod.create(names, { dict: dict, niveau: mod.niveaux ? miniNiveau : undefined });
      if (mod.niveaux) miniState.niveauIA = miniNiveau;
      miniMe = 0;
      enterMini();
    });
  }

  /* La pompe des IA : après chaque changement d'état, un robot qui a
     quelque chose à faire joue UNE action, avec un petit temps de
     réflexion pour que la partie respire. Les IA reçoivent une copie de
     l'état (jamais l'original) et leurs refus restent silencieux. */
  function pumpBots() {
    if (mode !== 'local' || !miniBots || !miniState || !miniMod || !miniMod.bot) return;
    clearTimeout(miniBotTimer);
    if (miniMod.over(miniState)) return;
    miniBotTimer = setTimeout(function () {
      if (mode !== 'local' || !miniBots || !miniState || !miniMod) return;
      if (miniMod.over(miniState)) return;
      for (var i = 1; i < miniState.players.length; i++) {
        var a = null;
        try { a = miniMod.bot(window.GG.clone(miniState), i, { dict: dict, niveau: miniState.niveauIA || 'moyen' }); } catch (e) { a = null; }
        if (!a) continue;
        var res = null;
        try { res = miniMod.apply(miniState, i, a, { dict: dict }); } catch (e2) { res = null; }
        if (res && res.ok) {
          if (res.timer) {
            clearTimeout(miniTimer);
            miniTimer = setTimeout(function () {
              if (miniState && miniMod) miniApplyAuthority(-1, res.timer.action, null);
            }, res.timer.ms);
          }
          miniAfterChange(); // re-rend et relance la pompe pour l'IA suivante
          return;
        }
      }
    }, 650 + Math.random() * 550);
  }

  function enterMini() {
    stopScanner();
    noteRecent(currentGame);
    sauvePartie();
    showScreen('screen-mini');
    $('btn-menu-invite').classList.toggle('hidden', mode !== 'host');
    chatBadges(); // la discussion n'existe qu'entre téléphones
    miniLastViewer = -1;
    miniRender();
    pumpBots();
  }

  /* Quel joueur regarde l'écran en ce moment ? */
  function miniViewer() {
    if (mode !== 'local') return miniMe;
    if (miniBots) return 0; // contre l'ordinateur : l'humain garde l'écran
    var t = miniMod.turnOf(miniState);
    if (t >= 0) return t;
    if (miniMod.viewerOf) return miniMod.viewerOf(miniState);
    return 0;
  }

  function miniRender() {
    if (!miniState || !miniMod) return;
    var mod = miniMod;
    document.body.classList.toggle('theme-manoir', currentGame === 'manoir');
    // les jeux de table se jouent dans la salle de casino, lumière tamisée
    document.body.classList.toggle('theme-casino',
      currentGame === 'poker' || currentGame === 'blackjack' || currentGame === 'solitaire');
    var bar = $('mini-players');
    bar.classList.toggle('hidden', !!mod.noBadges);
    var t = mod.turnOf(miniState);
    if (!mod.noBadges) {
      if (bar.childElementCount !== miniState.players.length) {
        bar.innerHTML = '';
        miniState.players.forEach(function () {
          var b = document.createElement('div');
          b.className = 'player-badge';
          b.innerHTML = '<span class="p-name"></span><span class="p-score">0</span>';
          bar.appendChild(b);
        });
      }
      miniState.players.forEach(function (p, i) {
        var b = bar.children[i];
        b.querySelector('.p-name').textContent = p.name;
        b.querySelector('.p-score').textContent = mod.scoreOf(miniState, i);
        b.classList.toggle('turn', t === i);
        b.classList.toggle('me', mode !== 'local' && i === miniMe);
        b.classList.toggle('offline', mode === 'host' && isPeerOffline(i));
      });
    }
    $('mini-icon').textContent = mod.icone;
    $('mini-turn').innerHTML = mod.max === 1 ? '<strong>' + esc(mod.nom) + '</strong>'
      : mod.over(miniState) ? 'Partie terminée'
        : t === -1 ? '<strong>' + esc(mod.nom) + '</strong>'
          : (mode !== 'local' && t === miniMe) || (mode === 'local' && miniBots && t === 0)
            ? '<strong>À vous de jouer !</strong>'
            : 'Au tour de <strong>' + esc(miniState.players[t].name) + '</strong>';

    var viewer = miniViewer();
    // jeux à infos cachées sur un seul téléphone : écran de passage
    if (mode === 'local' && mod.hidden && miniLastViewer !== -1 &&
        viewer !== miniLastViewer && !mod.over(miniState)) {
      passHidden = true;
      $('pass-name').textContent = miniState.players[viewer].name;
      showOverlay('overlay-pass', true);
      window.GG.sfx.play('whoosh');
    }
    miniLastViewer = viewer;
    if (passHidden && currentGame !== 'mots') {
      $('mini-area').innerHTML = '<p class="waiting">🙈 Écran masqué…</p>';
      return;
    }
    var viewState = mode === 'guest' ? miniState
      : (mod.redact ? mod.redact(miniState, viewer) : miniState);
    mod.render($('mini-area'), {
      state: viewState,
      me: viewer,
      mode: mode,
      act: miniAct
    });
  }

  /* Renvoie false quand l'action n'est certainement PAS partie (lien coupé,
     coup refusé en local) : les jeux à jetons ne débitent alors rien. */
  function miniAct(action) {
    if (!miniState || !miniMod) return false;
    if (mode === 'guest') {
      if (!guestNet || !guestNet.isOpen()) { toast('Connexion perdue.'); return false; }
      guestNet.send({ t: 'ga', a: action });
      return true;
    }
    var player = mode === 'local' ? miniViewer() : 0;
    return miniApplyAuthority(player, action, null);
  }

  function miniApplyAuthority(player, action, peer) {
    var res = miniMod.apply(miniState, player, action, { dict: dict });
    if (!res.ok) {
      if (peer) peer.net.send({ t: 'err', msg: res.error });
      else toast(res.error);
      return false;
    }
    if (res.timer) {
      clearTimeout(miniTimer);
      miniTimer = setTimeout(function () {
        if (miniState && miniMod) miniApplyAuthority(-1, res.timer.action, null);
      }, res.timer.ms);
    }
    miniAfterChange();
    return true;
  }

  function miniAfterChange() {
    if (mode === 'host') miniBroadcast();
    sauvePartie();
    miniRender();
    if (miniMod.over(miniState)) showMiniEnd();
    pumpBots();
  }

  function showMiniEnd() {
    if (!$('overlay-end').classList.contains('hidden')) return; // déjà affichée
    $('end-detail').innerHTML = miniMod.summary(miniState);
    $('end-winner').textContent = '';
    $('btn-end-new').classList.toggle('hidden', mode === 'guest');
    effaceSauvegarde();
    var g = null;
    try { g = miniMod.gagnants ? miniMod.gagnants(miniState) : gagnantsParScore(); } catch (e) { g = null; }
    var humains = mode === 'local' ? (miniBots ? [0] : null) : [miniViewer()];
    celebreFin(currentGame, g, humains);
    showOverlay('overlay-end', true);
  }

  /* Faute de mieux : le meilleur score l'emporte (égalité : personne). */
  function gagnantsParScore() {
    if (!miniMod.scoreOf || !miniState.players) return undefined;
    var sc = miniState.players.map(function (p, i) { return Number(miniMod.scoreOf(miniState, i)); });
    if (sc.some(isNaN)) return undefined;
    var max = Math.max.apply(null, sc);
    var gs = [];
    sc.forEach(function (v, i) { if (v === max) gs.push(i); });
    return gs.length === 1 ? gs : [];
  }

  function miniRematch() {
    if (mode === 'host') { hostRejoue(currentGame); return; }
    var names = miniState.players.map(function (p) { return p.name; });
    var niveauIA = miniState.niveauIA;
    miniState = miniMod.create(names, { dict: dict, niveau: niveauIA });
    if (niveauIA) miniState.niveauIA = niveauIA;
    miniLastViewer = -1;
    showOverlay('overlay-end', false);
    sauvePartie();
    if (mode === 'host') {
      hostPeers.forEach(function (peer) { if (peer.connected) sendInitTo(peer); });
    }
    miniRender();
    pumpBots();
  }

  /* ---------- fin de partie à plusieurs téléphones ----------
     L'invité peut réclamer la revanche (l'hôte voit qui est partant) ;
     l'hôte relance, ou change de jeu en gardant toute la bande. */
  var guestRevanche = false;

  function majFinReseau() {
    var fin = $('overlay-end');
    if (!fin || fin.classList.contains('hidden')) return;
    var nouv = $('btn-end-new'), chg = $('btn-end-switch'), rev = $('end-revanches');
    if (!nouv || !chg || !rev) return;
    if (mode === 'guest') {
      nouv.classList.remove('hidden');
      nouv.disabled = guestRevanche;
      nouv.textContent = guestRevanche ? '✅ Revanche demandée' : '🔁 Je veux la revanche';
      chg.classList.add('hidden');
      rev.textContent = guestRevanche
        ? 'L’hôte est prévenu. Restez sur cet écran : la partie suivante s’ouvrira toute seule.'
        : 'L’hôte peut relancer une partie : restez sur cet écran.';
      rev.classList.remove('hidden');
      return;
    }
    nouv.disabled = false;
    nouv.classList.remove('hidden');
    nouv.textContent = mode === 'host' ? '🔁 Revanche' : 'Nouvelle partie';
    chg.classList.toggle('hidden', mode !== 'host');
    if (mode !== 'host') { rev.classList.add('hidden'); return; }
    var partis = hostPeers.filter(function (p) { return !p.connected; }).map(function (p) { return p.name; });
    var morceaux = [];
    if (revanches.length) morceaux.push('🔁 Partant' + (revanches.length > 1 ? 's' : '') + ' : ' + revanches.join(', '));
    if (partis.length) morceaux.push('👋 ' + partis.join(', ') + (partis.length > 1 ? ' ne sont plus là' : ' n’est plus là'));
    var attendent = salleAttente.filter(function (p) { return p.connected; }).map(function (p) { return p.name; });
    if (attendent.length) morceaux.push('⏳ ' + attendent.join(', ') + (attendent.length > 1 ? ' attendent' : ' attend') + ' pour jouer');
    rev.textContent = morceaux.join(' · ');
    rev.classList.toggle('hidden', !morceaux.length);
  }

  /* Les jeux jouables par la bande actuelle (hôte + invités connectés). */
  function jeuxPourLaBande() {
    var n = 1 + hostPeers.concat(salleAttente).filter(function (p) { return p.connected; }).length;
    var ids = [];
    CATEGORIES.forEach(function (c) {
      c.jeux.forEach(function (id) {
        var m = null;
        try { m = catInfo(id); } catch (e) { m = null; }
        if (!m || m.max < 2 || ids.indexOf(id) !== -1) return;
        if (id !== 'mots' && !window.GG.byId[id]) return;
        if (n >= m.min && n <= m.max) ids.push(id);
      });
    });
    return ids;
  }

  function ouvreChangeJeu() {
    var ids = jeuxPourLaBande();
    var box = $('switch-jeux');
    box.innerHTML = ids.length
      ? ids.map(function (id, i) { return tuileHtml(catInfo(id), i); }).join('')
      : '<p class="hint">Aucun autre jeu ne se joue à ce nombre de joueurs.</p>';
    box.querySelectorAll('.game-tile').forEach(function (t) {
      t.addEventListener('click', function () {
        showOverlay('overlay-switch', false);
        hostRejoue(t.dataset.g);
      });
    });
    showOverlay('overlay-switch', true);
  }

  /* L'hôte relance (même jeu) ou change de jeu : seuls les joueurs encore
     connectés sont de la partie suivante, chacun reçoit le nouvel état. */
  function hostRejoue(jeu) {
    var info = catInfo(jeu);
    if (!info) return;
    // les joueurs encore là, puis ceux qui attendaient (dans la limite du jeu)
    var presents = hostPeers.filter(function (p) { return p.connected; });
    var place = Math.max(0, info.max - 1 - presents.length);
    var entrants = salleAttente.filter(function (p) { return p.connected; }).slice(0, place);
    presents = presents.concat(entrants);
    var n = presents.length + 1;
    if (n < info.min) {
      toast('Il faut au moins ' + info.min + ' joueurs connectés pour ' + info.nom + '.');
      return;
    }
    if (n > info.max) {
      toast(info.nom + ' se joue à ' + info.max + ' au plus.');
      return;
    }
    if (jeu !== currentGame && !chipGate(jeu)) return;
    // on quitte proprement la table en cours : la pile revient à la cagnotte
    if (jeu !== currentGame && miniMod && miniMod.cashout && miniState) {
      try { miniMod.cashout(miniState, 0); } catch (e) {}
      updateWallet();
    }
    revanches = [];
    hostPeers = presents;
    salleAttente = salleAttente.filter(function (p) { return p.connected && entrants.indexOf(p) === -1; });
    entrants.forEach(function (p) { p.enAttente = false; });
    clearTimeout(miniTimer);
    clearTimeout(miniBotTimer);
    showOverlay('overlay-end', false);
    pendingGame = jeu;
    if (jeu === 'mots') { miniState = null; miniMod = null; } else { state = null; }
    if (jeu === 'mots' && !dict) {
      loadDict().then(hostStartGame).catch(function () {
        toast('Impossible de charger le dictionnaire de Words.');
      });
      return;
    }
    hostStartGame();
  }

  /* Réservé aux tests automatiques : affiche l'écran de fin de la partie
     en cours (certains jeux se jouent en manches sans fin). */
  window.GG.__finDePartie = function () { if (miniState && miniMod) showMiniEnd(); };

  function demandeRevanche() {
    if (!guestNet || !guestNet.isOpen()) { toast('Connexion perdue.'); return; }
    guestNet.send({ t: 'revanche' });
    guestRevanche = true;
    majFinReseau();
  }

  /* =================================================================
   *  RÉSEAU — HÔTE (serveur de la partie)
   * ================================================================= */

  function normName(n) { return (n || '').trim().toLowerCase(); }

  function uniqueName(name) {
    var base = (name || 'Joueur').slice(0, 14) || 'Joueur';
    var taken = [normName(hostName)].concat(hostPeers.concat(salleAttente).map(function (p) { return normName(p.name); }));
    var candidate = base;
    var n = 2;
    while (taken.indexOf(normName(candidate)) !== -1) {
      candidate = base.slice(0, 12) + ' ' + n;
      n++;
    }
    return candidate;
  }

  function connectedGuests() {
    return hostPeers.filter(function (p) { return p.connected; });
  }

  function lobbyNames() {
    return [hostName].concat(connectedGuests().map(function (p) { return p.name; }));
  }

  function broadcastLobby() {
    envoiATous({ t: 'lobby', names: lobbyNames() });
  }

  /* Un même message pour tous les invités. En ligne, un seul envoi que le
     relais recopie à chacun : à 12 joueurs, l'hôte n'écrit plus 12 fois. */
  function envoiATous(msg) {
    if (netKind === 'online' && onlineLien && onlineLien.diffuser &&
        onlineLien.diffuser(msg)) return;
    hostPeers.forEach(function (peer) {
      if (peer.connected) peer.net.send(msg);
    });
  }

  /* État Words expurgé pour un invité : ses lettres à lui, mais jamais les
     chevalets adverses ni l'ordre du sac (anti-triche). */
  function wordsRedactFor(playerIdx) {
    if (!state || state.over) return state; // fin de partie : tout devient public
    var copy = JSON.parse(JSON.stringify(state));
    copy.players.forEach(function (p, i) {
      if (i !== playerIdx) {
        p.rack = p.rack.map(function () { return '?'; });
      }
    });
    copy.bag = copy.bag.map(function () { return '?'; });
    return copy;
  }

  function broadcastState() {
    hostPeers.forEach(function (peer) {
      if (peer.connected) {
        peer.net.send({ t: 'state', state: wordsRedactFor(peer.playerIndex) });
      }
    });
    sauvePartie(); // l'hôte en ligne peut reprendre sa partie s'il recharge
  }

  /* État d'un mini-jeu, expurgé des secrets pour un joueur donné. */
  function miniRedactFor(playerIdx) {
    return miniMod && miniMod.redact ? miniMod.redact(miniState, playerIdx) : miniState;
  }

  /* Diffusion de l'état : les changements d'un même instant partent en un
     seul envoi, et un invité ne reçoit rien si SA vue n'a pas changé. Sans
     secret à cacher (pas de redact), un seul message sert à tout le monde. */
  var diffusionPrevue = null;
  function miniBroadcast() {
    if (diffusionPrevue) return;
    diffusionPrevue = setTimeout(miniDiffuse, 25);
  }
  function miniDiffuse() {
    diffusionPrevue = null;
    if (mode !== 'host' || !miniState || !miniMod) return;
    if (!miniMod.redact && netKind === 'online' && onlineLien && onlineLien.diffuser) {
      var tout = JSON.stringify(miniState);
      var aJour = hostPeers.every(function (p) { return !p.connected || p.dernierEtat === tout; });
      if (!aJour && onlineLien.diffuser({ t: 'state', state: miniState })) {
        hostPeers.forEach(function (p) { if (p.connected) p.dernierEtat = tout; });
        return;
      }
      if (aJour) return;
    }
    hostPeers.forEach(function (peer) {
      if (!peer.connected) return;
      var vue = miniRedactFor(peer.playerIndex);
      var txt = JSON.stringify(vue);
      if (peer.dernierEtat === txt) return;
      if (peer.net.send({ t: 'state', state: vue }) !== false) peer.dernierEtat = txt;
    });
  }

  /* Envoie l'état initial (ou de reprise) du jeu en cours à un invité,
     avec la conversation déjà échangée. */
  function sendInitTo(peer) {
    peer.dernierEtat = null;
    if (chatLog.length) peer.net.send({ t: 'chat', msgs: chatLog.slice(-40) });
    if (currentGame !== 'mots' && miniState) {
      peer.net.send({
        t: 'init', game: currentGame,
        state: miniRedactFor(peer.playerIndex), you: peer.playerIndex
      });
    } else if (state) {
      peer.net.send({ t: 'init', game: 'mots', state: wordsRedactFor(peer.playerIndex), you: peer.playerIndex });
    }
  }

  function renderLobby() {
    var list = $('lobby-list');
    var rows = ['<div class="lobby-row you">👑 ' + esc(hostName) + ' (vous)</div>'];
    hostPeers.forEach(function (p) {
      rows.push('<div class="lobby-row' + (p.connected ? '' : ' off') + '">' +
        (p.connected ? '🟢 ' : '🔴 ') + esc(p.name || '…') +
        (p.connected ? '' : ' — déconnecté') + '</div>');
    });
    list.innerHTML = rows.join('');
    $('btn-host-start').disabled = connectedGuests().length < minGuests();
    $('btn-host-start').classList.toggle('hidden', gameStarted());
    $('btn-host-back-game').classList.toggle('hidden', !gameStarted());

    // En ligne : le code remplace les invitations une par une ; tout le monde
    // rejoint quand il veut, sans QR ni Wi-Fi commun.
    var enLigne = netKind === 'online';
    $('host-online-box').classList.toggle('hidden', !enLigne);
    $('btn-host-invite').classList.toggle('hidden', enLigne ||
      (gameStarted() ? false : hostPeers.length >= maxGuests()));
    $('btn-host-wifi').classList.toggle('hidden', enLigne);
    $('host-lobby-hint').textContent = enLigne
      ? 'Chacun peut rejoindre quand il veut : un retardataire jouera à la partie suivante.'
      : 'Invitez chaque joueur l’un après l’autre.';
    if (enLigne) $('host-code-big').textContent = onlineCode || '······';
  }

  /* Affiche/masque le bandeau « connexion perdue » sur les deux écrans de jeu. */
  function setNetBanner(visible, text) {
    ['net-banner', 'mini-net-banner'].forEach(function (id, k) {
      $(id).classList.toggle('hidden', !visible);
    });
    if (text) {
      $('net-banner-text').textContent = text;
      $('mini-net-text').textContent = text;
    }
  }

  function updateNetBanner() {
    if (mode === 'host') {
      // la reconnexion au relais a la priorité sur ce bandeau
      if (netKind === 'online' && onlineLien && !onlineLien.ferme && !onlineLien.estOuvert()) return;
      var off = hostPeers.filter(function (p) { return !p.connected && !p.parti; });
      var partis = hostPeers.filter(function (p) { return p.parti; });
      var morceaux = [];
      if (off.length) {
        morceaux.push(off.map(function (p) { return p.name; }).join(', ') +
          ' — déconnecté' + (off.length > 1 ? 's' : '') + ', on l’attend');
      }
      if (partis.length) {
        morceaux.push(partis.map(function (p) { return p.name; }).join(', ') +
          (partis.length > 1 ? ' ont quitté' : ' a quitté'));
      }
      if (gameStarted() && morceaux.length) setNetBanner(true, morceaux.join(' · ') + '.');
      else setNetBanner(false);
    }
  }

  function attachPeerHandlers(peer) {
    var net = peer.net;
    net.onMessage = function (msg) {
      if (peer.net !== net) return; // ancienne connexion, remplacée depuis
      // un message qui arrive prouve que le lien est vivant : si le pair
      // avait été marqué déconnecté (micro-coupure), on le réintègre et on
      // lui renvoie l'état à jour
      if (!peer.connected && !peer.parti && hostPeers.indexOf(peer) !== -1 &&
          msg.t !== 'hello' && msg.t !== 'quitte') {
        peer.connected = true;
        updateNetBanner();
        renderBadgesSafe();
        sendInitTo(peer);
      }
      hostHandleMessage(peer, msg);
    };
    net.onOpen = function () { /* attend le « hello » de l'invité */ };
    net.onClose = function () {
      if (peer.net !== net) return; // ancienne connexion, remplacée depuis
      peer.connected = false;
      var enAttente = salleAttente.indexOf(peer);
      if (enAttente !== -1) { salleAttente.splice(enAttente, 1); majFinReseau(); return; }
      // dans le salon (partie non lancée) : on retire le pair, sinon il
      // compte comme un fantôme (« partie complète », prénom occupé…)
      if (!gameStarted()) {
        var at = hostPeers.indexOf(peer);
        if (at !== -1) hostPeers.splice(at, 1);
        broadcastLobby();
      }
      updateNetBanner();
      renderBadgesSafe();
      if (document.querySelector('#screen-host.active')) renderLobby();
    };
  }

  function renderBadgesSafe() {
    if (state && document.querySelector('#screen-game.active')) render();
  }

  /* Un invité est refusé : il l'apprend, et son téléphone raccroche. */
  function congedie(peer, msg) {
    peer.net.send({ t: 'err', msg: msg });
    peer.net.send({ t: 'adieu', msg: msg, refus: true });
    peer.net.close();
  }

  /* Admet un invité dans le salon et lui remet son jeton de siège. */
  function remetSiege(peer) {
    if (!peer.jeton) peer.jeton = tireJeton();
    peer.net.send({ t: 'siege', jeton: peer.jeton, nom: peer.name, code: onlineCode || '' });
  }

  function hostHandleMessage(peer, msg) {
    if (msg.t === 'hello') {
      // Le même téléphone redit bonjour (sa connexion a été rétablie, ou
      // l'hôte revient d'une coupure) : il retrouve simplement sa place.
      if (hostPeers.indexOf(peer) !== -1) {
        var etaitAbsent = !peer.connected;
        peer.connected = true;
        peer.parti = false;
        if (invitePeer === peer) invitePeer = null;
        remetSiege(peer);
        if (gameStarted()) {
          sendInitTo(peer);
          if (etaitAbsent) { updateNetBanner(); renderBadgesSafe(); if (currentGame !== 'mots') miniRender(); }
        } else {
          broadcastLobby();
          if (document.querySelector('#screen-host.active')) renderLobby();
        }
        return;
      }
      // Un téléphone qui revient avec son jeton de siège reprend SA place,
      // même si l'hôte croit encore l'autre connexion vivante (elle traîne).
      var jeton = typeof msg.jeton === 'string' ? msg.jeton : '';
      var match = null;
      if (jeton) {
        for (var i = 0; i < hostPeers.length; i++) {
          if (hostPeers[i].jeton && hostPeers[i].jeton === jeton) { match = hostPeers[i]; break; }
        }
      }
      if (!match && !gameStarted()) {
        // Salon : nouvel invité
        if (hostPeers.length >= maxGuests()) {
          congedie(peer, 'La partie est complète.');
          return;
        }
        peer.nomTape = String(msg.name || '').slice(0, 14);
        peer.name = uniqueName(msg.name);
        peer.connected = true;
        hostPeers.push(peer);
        remetSiege(peer);
        if (invitePeer === peer) invitePeer = null;
        broadcastLobby();
        hostShowLobby();
        return;
      }
      // Partie en cours, pas de jeton : le prénom, pour une place vraiment
      // libre (téléphone qui a tout oublié, autre navigateur…).
      if (!match) {
        var nm = normName(msg.name);
        for (var k = 0; k < hostPeers.length; k++) {
          var hp = hostPeers[k];
          if (!hp.connected && (normName(hp.name) === nm || (hp.nomTape && normName(hp.nomTape) === nm))) {
            match = hp;
            break;
          }
        }
      }
      if (!match) {
        // Un ami arrive en retard : il patiente en salle d'attente et entre
        // à la partie suivante (revanche ou changement de jeu).
        if (salleAttente.indexOf(peer) === -1) {
          if (hostPeers.length + salleAttente.length >= 12) {
            congedie(peer, 'Le salon est plein.');
            return;
          }
          peer.nomTape = String(msg.name || '').slice(0, 14);
          peer.name = uniqueName(msg.name);
          peer.enAttente = true;
          salleAttente.push(peer);
          toast('⏳ ' + peer.name + ' attend la prochaine partie.');
        }
        peer.connected = true;
        remetSiege(peer);
        peer.net.send({ t: 'lobby', names: lobbyNames(), attente: true });
        // ne pas laisser l'hôte bloqué sur « Connexion en cours… » : retour au jeu
        if (document.querySelector('#screen-host.active')) hostBackToGame();
        majFinReseau();
        return;
      }
      if (match.net !== peer.net) {
        var vieux = match.net;
        match.net = peer.net;       // d'abord : l'ancienne connexion ne compte plus
        try { vieux.close(); } catch (e) {}
      }
      match.connected = true;
      match.parti = false;
      attachPeerHandlers(match);
      if (invitePeer === peer) invitePeer = null;
      remetSiege(match);
      if (!gameStarted()) {
        broadcastLobby();
        if (document.querySelector('#screen-host.active')) renderLobby();
        return;
      }
      sendInitTo(match);
      updateNetBanner();
      if (document.querySelector('#screen-host.active')) hostBackToGame();
      if (currentGame === 'mots') render(); else miniRender();
      return;
    }

    // Message de discussion d'un invité : l'hôte le range et le rediffuse
    // (sans laisser un téléphone inonder la partie)
    if (msg.t === 'chat') {
      if (hostPeers.indexOf(peer) === -1) return;
      var now = Date.now();
      peer.chatT = (peer.chatT || []).filter(function (t) { return now - t < 10000; });
      if (peer.chatT.length >= 8) {
        peer.net.send({ t: 'err', msg: 'Doucement ! Trop de messages d’un coup.' });
        return;
      }
      peer.chatT.push(now);
      chatAjoute(peer.name || 'Invité', msg.txt);
      return;
    }

    // Un invité a quitté volontairement (et non perdu le réseau)
    if (msg.t === 'quitte') {
      var at = salleAttente.indexOf(peer);
      if (at !== -1) { salleAttente.splice(at, 1); majFinReseau(); return; }
      if (hostPeers.indexOf(peer) === -1) return;
      peer.parti = true;
      peer.connected = false;
      revanches = revanches.filter(function (n) { return n !== peer.name; });
      if (!gameStarted()) {
        hostPeers.splice(hostPeers.indexOf(peer), 1);
        broadcastLobby();
        if (document.querySelector('#screen-host.active')) renderLobby();
      } else {
        toast(peer.name + ' a quitté la partie.');
        updateNetBanner();
        renderBadgesSafe();
        if (currentGame !== 'mots') miniRender();
        majFinReseau();
      }
      return;
    }

    // Un invité réclame une revanche depuis l'écran de fin
    if (msg.t === 'revanche') {
      if (hostPeers.indexOf(peer) === -1 || !peer.name) return;
      if (revanches.indexOf(peer.name) === -1) {
        revanches.push(peer.name);
        toast('🔁 ' + peer.name + ' veut la revanche !');
        window.GG.sfx.play('notify');
      }
      majFinReseau();
      return;
    }

    // Action d'un invité dans un mini-jeu : l'hôte applique et valide
    if (msg.t === 'ga' && miniState && currentGame !== 'mots' && peer.playerIndex) {
      miniApplyAuthority(peer.playerIndex, msg.a || {}, peer);
      return;
    }

    if (msg.t === 'action' && state && !state.over && peer.playerIndex) {
      var res;
      if (msg.kind === 'move') {
        var pre = S.checkMove(state, msg.placements || []);
        if (pre.ok) {
          var badWord = invalidWord(pre.words);
          if (badWord) {
            peer.net.send({ t: 'err', msg: '« ' + badWord + ' » n’est pas dans le dictionnaire.' });
            return;
          }
        }
        res = S.playMove(state, peer.playerIndex, msg.placements || []);
      } else if (msg.kind === 'pass') {
        res = S.passTurn(state, peer.playerIndex);
      } else if (msg.kind === 'exchange') {
        res = S.exchange(state, peer.playerIndex, msg.letters || []);
      } else {
        res = { ok: false, error: 'Action inconnue.' };
      }
      if (!res.ok) {
        peer.net.send({ t: 'err', msg: res.error });
        return;
      }
      broadcastState();
      render();
      if (state.over) showEnd();
    }
  }

  function hostShowLobby() {
    clearTimeout(pairingTimer);
    showScreen('screen-host');
    $('host-title').textContent = (netKind === 'online' ? '🌍 Partie en ligne — ' :
      'Créer une partie — ') + gameLabel();
    $('host-step-name').classList.add('hidden');
    $('host-step-lobby').classList.remove('hidden');
    $('host-step-offer').classList.add('hidden');
    $('host-step-scan').classList.add('hidden');
    $('host-step-wait').classList.add('hidden');
    $('host-step-wifi').classList.add('hidden');
    $('host-error').classList.add('hidden');
    renderLobby();
  }

  /* ---------- QR Wi-Fi : connecter l'autre téléphone au réseau ---------- */
  /* Format standard reconnu par l'appareil photo des téléphones :
     WIFI:T:WPA;S:<nom>;P:<mot de passe>;;  (caractères spéciaux échappés) */
  function wifiEscape(s) {
    return String(s).replace(/([\\;,:"])/g, '\\$1');
  }

  function hostShowWifi() {
    showScreen('screen-host');
    ['host-step-name', 'host-step-lobby', 'host-step-offer', 'host-step-scan', 'host-step-wait']
      .forEach(function (id) { $(id).classList.add('hidden'); });
    $('host-step-wifi').classList.remove('hidden');
    try {
      $('wifi-ssid').value = localStorage.getItem('gg-wifi-ssid') || $('wifi-ssid').value;
      // le mot de passe Wi-Fi n'est jamais enregistré sur le téléphone
      localStorage.removeItem('gg-wifi-pass');
    } catch (e) {}
  }

  function makeWifiQr() {
    var ssid = $('wifi-ssid').value.trim();
    var pass = $('wifi-pass').value;
    if (!ssid) { toast('Indiquez le nom du réseau.'); return; }
    var code = pass
      ? 'WIFI:T:WPA;S:' + wifiEscape(ssid) + ';P:' + wifiEscape(pass) + ';;'
      : 'WIFI:T:nopass;S:' + wifiEscape(ssid) + ';;';
    var box = $('wifi-qr');
    window.QRTool.render(box, code);
    box.dataset.value = code;
    box.classList.remove('hidden');
    $('wifi-done').classList.remove('hidden');
    try {
      localStorage.setItem('gg-wifi-ssid', ssid);
    } catch (e) {}
  }

  function hostBackToGame() {
    stopScanner();
    if (invitePeer) { invitePeer.net.close(); invitePeer = null; }
    showScreen(gameScreenId());
    if (currentGame === 'mots') render(); else miniRender();
  }

  async function hostInvite() {
    try {
      if (invitePeer) { invitePeer.net.close(); invitePeer = null; }
      var peer = { net: new window.Net(), name: null, playerIndex: null, connected: false };
      invitePeer = peer;
      attachPeerHandlers(peer);
      $('host-step-lobby').classList.add('hidden');
      $('host-step-offer').classList.remove('hidden');
      $('host-error').classList.add('hidden');
      $('host-qr').innerHTML = '';
      $('host-code').value = '';
      $('host-paste').value = '';
      var code = await peer.net.createOffer();
      if (invitePeer !== peer) return; // invitation annulée entre-temps
      // QR = adresse de l'application + code : le scan avec l'appareil photo
      // du téléphone ouvre directement l'app en mode « rejoindre ».
      var url = appBaseUrl() + '#j=' + code;
      window.QRTool.render($('host-qr'), url);
      $('host-code').value = url;
    } catch (e) {
      showError('host-error', 'Impossible de créer l’invitation : ' + e.message);
      hostShowLobby();
    }
  }

  function hostScanAnswer() {
    $('host-step-offer').classList.add('hidden');
    $('host-step-scan').classList.remove('hidden');
    scanner = window.QRTool.scan($('host-video'), function (text) {
      hostAcceptAnswer(text);
    }, function () {
      showError('host-error',
        'Caméra indisponible. Utilisez le champ « coller le code » ci-dessous.');
      // le champ de collage est désormais toujours visible (jeu à distance)
      var det = $('host-step-scan').querySelector('details');
      if (det) det.open = true;
    });
  }

  async function hostAcceptAnswer(code) {
    stopScanner();
    if (!invitePeer) return;
    try {
      await invitePeer.net.acceptAnswer(code);
      $('host-step-scan').classList.add('hidden');
      $('host-step-wait').classList.remove('hidden');
      $('host-error').classList.add('hidden');
      armPairingWatchdog('host');
      // Le retour au salon se fait à la réception du « hello »
    } catch (e) {
      showError('host-error', e.message);
      hostScanAnswer();
    }
  }

  function hostStartGame() {
    hostPeers = connectedGuests();
    if (hostPeers.length < minGuests()) return;
    var names = [hostName];
    hostPeers.forEach(function (peer, i) {
      peer.playerIndex = i + 1;
      names.push(peer.name);
    });
    if (pendingGame === 'mots') {
      currentGame = 'mots';
      state = S.newGame(names);
      pending = [];
      selected = -1;
      hostPeers.forEach(function (peer) {
        peer.net.send({ t: 'init', game: 'mots', state: wordsRedactFor(peer.playerIndex), you: peer.playerIndex });
      });
      enterGame();
      return;
    }
    // Mini-jeu en réseau : l'hôte crée l'état et fait autorité
    var needDict = pendingGame === 'motus'; // seul Mot Mystère valide au dictionnaire
    (needDict ? loadDict().catch(function () {}) : Promise.resolve()).then(function () {
      currentGame = pendingGame;
      miniMod = window.GG.byId[currentGame];
      miniBots = 0; // en réseau, tout le monde est humain
      miniState = miniMod.create(names, { dict: dict });
      miniMe = 0;
      miniLastViewer = -1;
      hostPeers.forEach(function (peer) { sendInitTo(peer); });
      enterMini();
    });
  }

  /* =================================================================
   *  RÉSEAU — INVITÉ
   * ================================================================= */

  function guestHandleMessage(msg) {
    // l'hôte nous réserve une place : on garde le jeton pour la retrouver
    if (msg.t === 'siege') {
      guestSiege = { code: onlineCode || '', jeton: String(msg.jeton || ''), nom: String(msg.nom || '') };
      if (msg.nom) guestNom = String(msg.nom);
      if (netKind === 'online' && onlineCode) {
        ecris('gg-siege', { code: onlineCode, jeton: guestSiege.jeton, nom: guestSiege.nom, ts: Date.now() });
      }
      return;
    }
    // l'hôte arrête la partie, ou refuse ce téléphone
    if (msg.t === 'adieu') {
      var motif = String(msg.msg || 'La partie est terminée.');
      if (msg.refus && !gameStarted()) {
        if (guestNet) { try { guestNet.close(); } catch (e) {} guestNet = null; }
        if (netKind === 'online') {
          onlineFerme();
          showError('online-error', motif);
          $('online-step-lobby').classList.add('hidden');
          $('online-step-code').classList.remove('hidden');
        } else {
          showError('join-error', motif);
        }
        mode = null;
        return;
      }
      try { localStorage.removeItem('gg-siege'); } catch (e) {}
      if (guestNet) { try { guestNet.close(); } catch (e) {} guestNet = null; }
      quitToHome();
      toast(motif);
      return;
    }
    if (msg.t === 'chat') {
      var avant = chatLog.length;
      chatLog = (msg.msgs || []).slice(-CHAT_MAX);
      if (chatLog.length > avant) chatRecu(); else chatRender();
      return;
    }
    if (msg.t === 'lobby') {
      // le salon s'affiche là où l'invité se trouve : écran QR ou écran « code »
      var enLigne = netKind === 'online';
      var box = $(enLigne ? 'online-lobby' : 'join-lobby');
      box.classList.remove('hidden');
      $(enLigne ? 'online-lobby-list' : 'join-lobby-list').innerHTML =
        (msg.names || []).map(function (n, i) {
          return '<div class="lobby-row">' + (i === 0 ? '👑 ' : '🟢 ') + esc(n) + '</div>';
        }).join('');
      $(enLigne ? 'online-waiting' : 'join-waiting').textContent = msg.attente
        ? '⏳ La partie est déjà lancée : vous jouerez à la suivante. Restez sur cet écran !'
        : '⏳ Connecté ! En attente du début de la partie…';
      return;
    }
    if (msg.t === 'init') {
      var jeuSuivant = msg.game || 'mots';
      // on change de jeu : la table à jetons quittée rend d'abord la pile
      if (jeuSuivant !== currentGame && miniMod && miniMod.cashout && miniState) {
        try { miniMod.cashout(miniState, miniMe); } catch (e) {}
        updateWallet();
      }
      guestRevanche = false;
      currentGame = jeuSuivant;
      waitingHost = false;
      setNetBanner(false);
      clearTimeout(waitingTimer);
      clearTimeout(pairingTimer);
      setNetBanner(false);
      showOverlay('overlay-end', false);
      if (currentGame === 'mots') {
        miniState = null;
        miniMod = null;
        state = msg.state;
        myFixedIndex = msg.you || 1;
        pending = [];
        selected = -1;
        enterGame();
      } else {
        state = null;
        miniMod = window.GG.byId[currentGame];
        if (!miniMod) {
          // versions décalées : ce téléphone ne connaît pas encore ce jeu
          toast('Ce jeu nécessite une version plus récente de GGgames : ' +
            'rechargez l’application (avec Internet) puis rejoignez à nouveau.');
          quitToHome();
          return;
        }
        if (!chipGate(currentGame)) { quitToHome(); return; }
        miniState = msg.state;
        miniMe = msg.you || 1;
        enterMini();
      }
      return;
    }
    if (msg.t === 'state') {
      setNetBanner(false); // l'état arrive : le lien est vivant
      if (currentGame === 'mots') {
        state = msg.state;
        pending = [];
        selected = -1;
        exchangeMode = false;
        exchangeSel = [];
        waitingHost = false;
        clearTimeout(waitingTimer);
        render();
        if (state.over) showEnd();
      } else if (miniMod) {
        miniState = msg.state;
        if (!miniMod.over(miniState)) showOverlay('overlay-end', false);
        miniRender();
        if (miniMod.over(miniState)) showMiniEnd();
      }
      return;
    }
    if (msg.t === 'err') {
      waitingHost = false;
      clearTimeout(waitingTimer);
      toast(msg.msg || 'Coup refusé.');
      render();
    }
  }

  function sendAction(action) {
    if (!guestNet || !guestNet.isOpen()) { toast('Connexion perdue.'); return; }
    waitingHost = true;
    render();
    var payload = { t: 'action', kind: action.kind };
    if (action.placements) payload.placements = action.placements;
    if (action.letters) payload.letters = action.letters;
    guestNet.send(payload);
    clearTimeout(waitingTimer);
    waitingTimer = setTimeout(function () {
      if (waitingHost) {
        waitingHost = false;
        toast('Pas de réponse de l’hôte…');
        render();
      }
    }, 10000);
  }

  function guestStart() {
    mode = 'guest';
    if (guestNet) guestNet.close();
    guestNet = new window.Net();
    guestNet.onMessage = guestHandleMessage;
    guestNet.onClose = function () {
      if (gameStarted()) {
        setNetBanner(true, 'Connexion perdue.');
        waitingHost = false;
        clearTimeout(waitingTimer);
        if (currentGame === 'mots') render();
      }
    };
    var name = ($('join-name').value.trim() || 'Joueur').slice(0, 14);
    guestNet.onOpen = function () {
      // le jeton de siège (s'il y en a un) rend sa place à un joueur qui revient
      guestNet.send({ t: 'hello', name: name, jeton: guestSiege && guestSiege.jeton ? guestSiege.jeton : undefined });
    };
    $('join-step-name').classList.add('hidden');
    $('join-step-scan').classList.remove('hidden');
    $('join-step-answer').classList.add('hidden');
    $('join-error').classList.add('hidden');
    $('join-lobby').classList.add('hidden');
    $('join-waiting').textContent = '⏳ En attente de la connexion…';
    $('join-qr').innerHTML = '';
    $('join-code').value = '';
    $('join-paste').value = '';
    if (autoOffer) {
      // Invitation déjà reçue via l'URL scannée : connexion directe
      var code = autoOffer;
      autoOffer = null;
      $('join-step-scan').classList.add('hidden');
      guestGotOffer(code);
      return;
    }
    scanner = window.QRTool.scan($('join-video'), function (text) {
      guestGotOffer(text);
    }, function () {
      showError('join-error',
        'Caméra indisponible. Utilisez le champ « coller le code » ci-dessous.');
      $('join-step-scan').querySelector('details').open = true;
    });
  }

  async function guestGotOffer(code) {
    stopScanner();
    try {
      var answer = await guestNet.joinWithOffer(extractCode(code));
      $('join-step-scan').classList.add('hidden');
      $('join-step-answer').classList.remove('hidden');
      $('join-error').classList.add('hidden');
      window.QRTool.render($('join-qr'), answer);
      $('join-code').value = answer;
      armPairingWatchdog('guest');
    } catch (e) {
      showError('join-error', e.message);
      guestStart();
    }
  }

  function showError(id, msg) {
    var el = $(id);
    el.textContent = msg;
    el.classList.remove('hidden');
  }

  /* ---------- invitations par URL (scan avec l'appareil photo natif) ---------- */
  var autoOffer = null; // code d'invitation reçu via l'URL (#j=...)

  function appBaseUrl() {
    return location.origin + location.pathname;
  }

  /* Accepte un code brut ou une URL d'invitation contenant #j=... */
  function extractCode(text) {
    text = (text || '').trim();
    var at = text.indexOf('#j=');
    if (at !== -1) {
      try { text = decodeURIComponent(text.slice(at + 3)); }
      catch (e) { text = text.slice(at + 3); }
    }
    return text;
  }

  /* Après 25 s sans connexion, affiche des conseils au lieu d'attendre en silence. */
  var pairingTimer = null;
  function armPairingWatchdog(kind) {
    clearTimeout(pairingTimer);
    pairingTimer = setTimeout(function () {
      var advice = 'La connexion tarde… Vérifiez que les deux téléphones sont sur le ' +
        'MÊME Wi-Fi (ou que l’invité est bien connecté au partage de connexion de ' +
        'l’hôte), gardez les deux écrans allumés, et autorisez la caméra si elle est ' +
        'demandée. Ensuite, annulez et recommencez l’invitation.';
      if (kind === 'host' && document.querySelector('#host-step-wait:not(.hidden)')) {
        showError('host-error', advice);
      }
      if (kind === 'guest' && document.querySelector('#screen-join.active') &&
          !(guestNet && guestNet.isOpen())) {
        showError('join-error', advice);
      }
    }, 25000);
  }

  /* ---------- reconnexion ---------- */
  function reconnect() {
    // En ligne : on relance la connexion au relais, sans quitter la partie
    if (netKind === 'online' && (mode === 'host' || mode === 'guest')) {
      if (onlineLien && !onlineLien.ferme) {
        setNetBanner(true, 'Reconnexion…');
        onlineLien.reveil();
        return;
      }
      if (onlineCode) {
        setNetBanner(true, 'Reconnexion…');
        if (mode === 'guest') guestOnlineConnect(onlineCode, guestNom, true);
        else hostOnlineOuvre(onlineCode, onlineCle, true);
        return;
      }
    }
    if (mode === 'host') {
      hostShowLobby();
    } else if (mode === 'guest') {
      showScreen('screen-join');
      guestStart();
    }
  }

  /* ---------- entrée / sortie du jeu ---------- */
  function enterGame() {
    stopScanner();
    noteRecent('mots');
    sauvePartie();
    showScreen('screen-game');
    $('btn-menu-invite').classList.toggle('hidden', mode !== 'host');
    chatBadges();
    render();
  }

  function quitToHome() {
    // on quitte une table à jetons : la pile du joueur retourne dans sa cagnotte
    if (miniMod && miniMod.cashout && miniState) {
      try { miniMod.cashout(miniState, miniViewer()); } catch (e) {}
    }
    effaceSauvegarde();
    updateWallet();
    stopScanner();
    autoOffer = null; // une vieille invitation ne doit jamais être rejouée
    // on prévient les autres : un départ voulu n'est pas une coupure
    if (mode === 'host') {
      envoiATous({ t: 'adieu', msg: 'L’hôte a arrêté la partie.' });
      if (netKind !== 'online') salleAttente.forEach(function (p) { p.net.send({ t: 'adieu', msg: 'L’hôte a arrêté la partie.' }); });
    }
    if (mode === 'guest' && guestNet && guestNet.isOpen()) guestNet.send({ t: 'quitte' });
    hostPeers.concat(salleAttente).forEach(function (p) { try { p.net.close(); } catch (e) {} });
    hostPeers = [];
    salleAttente = [];
    revanches = [];
    guestRevanche = false;
    guestSiege = null;
    clearTimeout(diffusionPrevue);
    diffusionPrevue = null;
    if (invitePeer) { invitePeer.net.close(); invitePeer = null; }
    if (guestNet) { guestNet.close(); guestNet = null; }
    state = null;
    mode = null;
    pending = [];
    selected = -1;
    exchangeMode = false;
    exchangeSel = [];
    passHidden = false;
    waitingHost = false;
    aiThinking = false;
    miniState = null;
    miniMod = null;
    currentGame = 'mots';
    pendingGame = 'mots';
    miniLastViewer = -1;
    miniBots = 0;
    clearTimeout(miniBotTimer);
    clearTimeout(miniTimer);
    clearTimeout(pairingTimer);
    ['overlay-pass', 'overlay-joker', 'overlay-confirm', 'overlay-history',
     'overlay-menu', 'overlay-switch', 'overlay-end'].forEach(function (id) { showOverlay(id, false); });
    setNetBanner(false);
    chatReset();
    onlineFerme();
    netKind = 'qr';
    document.body.classList.remove('theme-manoir');
    document.body.classList.remove('theme-casino');
    showScreen('screen-home', { retour: true });
  }

  /* =================================================================
   *  DISCUSSION EN PARTIE — un chat commun à tous les jeux en réseau
   *
   *  Les messages suivent le même chemin que les coups : l'invité envoie à
   *  l'hôte, l'hôte tient la conversation et la renvoie à tout le monde.
   *  Rien n'est enregistré : elle vit le temps de la partie.
   * ================================================================= */

  var chatLog = [];          // [{n: prénom, t: texte, h: heure}]
  var chatNonLus = 0;
  var chatOuvert = false;
  var CHAT_MAX = 200;
  var CHAT_EMOJIS = ['👍', '😂', '😮', '😭', '🔥', '🍀', '👏', '🤔'];

  function heureCourte() {
    var d = new Date();
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }

  function chatDispo() {
    return (mode === 'host' || mode === 'guest') &&
      (gameStarted() || document.querySelector('#screen-mini.active'));
  }

  /* Hôte : range un message et le renvoie à tous. */
  function chatAjoute(nom, texte) {
    var t = String(texte || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (!t) return;
    chatLog.push({ n: nom, t: t, h: heureCourte() });
    if (chatLog.length > CHAT_MAX) chatLog.shift();
    if (mode === 'host') envoiATous({ t: 'chat', msgs: chatLog.slice(-40) });
    chatRecu();
  }

  function chatEnvoyer(texte) {
    var t = String(texte || '').trim();
    if (!t) return;
    if (mode === 'host') { chatAjoute(hostName || 'Hôte', t); return; }
    if (mode === 'guest' && guestNet && guestNet.isOpen()) {
      guestNet.send({ t: 'chat', txt: t });
    }
  }

  /* Un message est arrivé : la conversation se met à jour même fermée
     (elle s'ouvre alors instantanément), et une pastille prévient. */
  function chatRecu() {
    chatRender();
    if (chatOuvert) return;
    chatNonLus++;
    chatBadges();
  }

  function chatBadges() {
    ['mini-chat-badge', 'game-chat-badge'].forEach(function (id) {
      var b = $(id);
      if (!b) return;
      b.textContent = chatNonLus > 9 ? '9+' : String(chatNonLus);
      b.classList.toggle('hidden', chatNonLus === 0);
    });
    var visible = chatDispo();
    ['btn-mini-chat', 'btn-game-chat'].forEach(function (id) {
      var b = $(id);
      if (b) b.classList.toggle('hidden', !visible);
    });
  }

  function chatRender() {
    var log = $('chat-log');
    if (!log) return;
    var moi = mode === 'host' ? (hostName || 'Hôte')
      : (miniState && miniState.players && miniState.players[miniMe]
        ? miniState.players[miniMe].name
        : (state && state.players && state.players[myFixedIndex]
          ? state.players[myFixedIndex].name : ''));
    log.innerHTML = chatLog.length
      ? chatLog.map(function (m) {
        var mine = m.n === moi;
        return '<div class="chat-row' + (mine ? ' mine' : '') + '">' +
          '<div class="chat-bub">' +
          (mine ? '' : '<div class="chat-nom">' + esc(m.n) + '</div>') +
          '<div class="chat-txt">' + esc(m.t) + '</div>' +
          '<div class="chat-h">' + esc(m.h) + '</div></div></div>';
      }).join('')
      : '<p class="chat-vide">💬 Personne n’a encore parlé.<br>Lancez la conversation !</p>';
    log.scrollTop = log.scrollHeight;
  }

  function chatOuvre() {
    chatOuvert = true;
    chatNonLus = 0;
    chatBadges();
    var q = $('chat-quick');
    if (q && !q.childElementCount) {
      q.innerHTML = CHAT_EMOJIS.map(function (e) {
        return '<button class="chat-q" data-e="' + e + '">' + e + '</button>';
      }).join('');
      q.querySelectorAll('.chat-q').forEach(function (b) {
        b.addEventListener('pointerdown', function (ev) { ev.preventDefault(); });
        b.addEventListener('click', function () { chatEnvoyer(b.dataset.e); });
      });
    }
    chatRender();
    showOverlay('overlay-chat', true);
    var inp = $('chat-in');
    if (inp) setTimeout(function () { inp.focus(); }, 60);
  }

  function chatFerme() {
    chatOuvert = false;
    showOverlay('overlay-chat', false);
    chatBadges();
  }

  function chatReset() {
    chatLog = [];
    chatNonLus = 0;
    chatOuvert = false;
    showOverlay('overlay-chat', false);
    chatBadges();
  }

  /* =================================================================
   *  MODE EN LIGNE — un code de partie, chacun chez soi
   *
   *  Le relais (dossier relay/) ne fait que transmettre : l'hôte reste
   *  l'arbitre et les pairs qu'il voit ici présentent exactement la même
   *  interface que le WebRTC du mode QR. Tout le reste de l'application
   *  (salon, reconnexion, jeux) est donc partagé, sans une ligne en double.
   * ================================================================= */

  function onlineFerme() {
    if (onlineLien) { try { onlineLien.close(); } catch (e) {} }
    onlineLien = null;
    onlineCode = '';
    onlineCle = '';
  }

  /* Le lien d'invitation dit aussi QUI invite et à QUOI (carte d'accueil). */
  function lienDePartie(code) {
    var q = '?jeu=' + encodeURIComponent(pendingGame || currentGame || '') +
      '&de=' + encodeURIComponent(hostName || '');
    return appBaseUrl() + q + '#c=' + code;
  }

  function texteInvitation() {
    var nom = gameLabel();
    return (hostName ? hostName + ' t’invite' : 'Je t’invite') +
      (nom ? ' à jouer à ' + nom : ' à jouer') + ' sur GGgames ! 🎲\n\n' +
      'Touche ce lien pour rejoindre la partie : ' + lienDePartie(onlineCode) + '\n\n' +
      '(ou, dans l’appli : « Rejoindre avec un code » → ' + onlineCode + ')';
  }

  /* Clé de ce téléphone auprès du relais : une connexion fantôme laissée
     par un changement de réseau lui cède la place. */
  function cleAppareil() {
    var c = lis('gg-cle-appareil', '');
    if (typeof c !== 'string' || c.length < 8) { c = tireJeton(); ecris('gg-cle-appareil', c); }
    return c;
  }

  /* Le jeton de siège connu pour ce code (en mémoire, ou gardé 24 h). */
  function siegePour(code) {
    if (guestSiege && guestSiege.code === code && guestSiege.jeton) return guestSiege;
    var sv = lis('gg-siege', null);
    if (sv && sv.code === code && sv.jeton && Date.now() - (sv.ts || 0) < 86400000) return sv;
    return null;
  }

  /* L'hôte ouvre un salon en ligne : le code s'affiche, les invités arrivent. */
  function hostOnlineCreate() {
    hostName = ($('host-name').value.trim() || 'Joueur 1').slice(0, 14);
    netKind = 'online';
    mode = 'host';
    hostPeers = [];
    invitePeer = null;
    revanches = [];
    $('host-step-name').classList.add('hidden');
    $('host-step-wait').classList.remove('hidden');
    $('host-error').classList.add('hidden');
    $('host-step-wait').querySelector('.waiting').textContent = '⏳ Ouverture de la partie…';
    hostOnlineOuvre(null, null, false);
  }

  /* Ouvre (ou rouvre, après une coupure ou un rechargement : même code, même
     clé) le salon de l'hôte sur le relais. */
  function hostOnlineOuvre(code, cle, enJeu) {
    onlineFerme();
    var lien = window.GG.Online.heberger({
      code: code || undefined,
      cle: cle || undefined,
      onPret: function (c) {
        onlineCode = c;
        if (enJeu || gameStarted()) {
          setNetBanner(false);
          updateNetBanner();
          hostPeers.forEach(function (p) { if (p.connected) sendInitTo(p); });
          sauvePartie();
          return;
        }
        hostShowLobby();
      },
      onRetour: function () {
        // de retour après une coupure : chacun reçoit l'état à jour
        if (gameStarted()) hostPeers.forEach(function (p) { if (p.connected) sendInitTo(p); });
        else broadcastLobby();
        updateNetBanner();
      },
      onPair: function (pair) {
        // nouveau téléphone dans le salon : on attend son « bonjour »,
        // exactement comme avec un QR code
        var peer = { net: pair, name: null, playerIndex: null, connected: false };
        attachPeerHandlers(peer);
      },
      onEtat: function (txt) {
        if (txt) setNetBanner(true, txt === 'Reconnexion…' ? 'Reconnexion au serveur…' : txt);
        else { setNetBanner(false); updateNetBanner(); }
      },
      onErreur: function (txt, definitif) {
        if (!definitif) { toast(txt); return; }
        if (gameStarted()) {
          setNetBanner(true, txt);
          return;
        }
        showError('host-error', txt);
        $('host-step-wait').classList.add('hidden');
        $('host-step-name').classList.remove('hidden');
        onlineFerme();
      }
    });
    onlineLien = lien;
    onlineCle = lien ? lien.cle : '';
    if (code) onlineCode = code;
  }

  /* Un invité rejoint avec le code annoncé. */
  function guestOnlineJoin() {
    var code = ($('online-code').value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    var nom = ($('online-name').value.trim() || 'Joueur').slice(0, 14);
    if (code.length < 4) {
      showError('online-error', 'Entrez le code de la partie (6 caractères).');
      return;
    }
    if (!window.GG.Online.disponible()) { showRelaisSettings(); return; }

    $('online-step-code').classList.add('hidden');
    $('online-step-lobby').classList.remove('hidden');
    $('online-error').classList.add('hidden');
    $('online-lobby').classList.add('hidden');
    $('online-waiting').textContent = '⏳ Connexion à la partie…';
    guestOnlineConnect(code, nom, !!siegePour(code));
  }

  /* Connexion (ou reconnexion) d'un invité : un seul « bonjour » par
     connexion, avec le jeton de siège s'il en a un. */
  function guestOnlineConnect(code, nom, reprise) {
    netKind = 'online';
    mode = 'guest';
    if (guestNet) { try { guestNet.close(); } catch (e) {} }
    guestNet = null;
    onlineFerme();
    onlineCode = code;
    guestNom = nom;

    onlineLien = window.GG.Online.rejoindre({
      code: code,
      cle: cleAppareil(),
      reprise: reprise,
      onPair: function (pair) {
        guestNet = pair;
        pair.onMessage = guestHandleMessage;
        pair.onClose = function () {
          if (guestNet !== pair) return;
          if (gameStarted()) {
            setNetBanner(true, 'Connexion perdue.');
            waitingHost = false;
            clearTimeout(waitingTimer);
            if (currentGame === 'mots') render();
          }
        };
        // le relais appelle onOpen à chaque connexion (une seule fois chacune)
        pair.onOpen = function () {
          var siege = siegePour(code);
          pair.send({ t: 'hello', name: (siege && siege.nom) || guestNom, jeton: siege ? siege.jeton : undefined });
        };
      },
      onEtat: function (txt) {
        if (gameStarted()) {
          if (txt) setNetBanner(true, txt); else setNetBanner(false);
        } else if (txt) {
          $('online-waiting').textContent = '⏳ ' + txt;
        }
      },
      onErreur: function (txt, definitif) {
        if (!definitif) { toast(txt); return; }
        if (gameStarted()) { setNetBanner(true, txt); return; }
        showError('online-error', txt);
        $('online-step-lobby').classList.add('hidden');
        $('online-step-code').classList.remove('hidden');
        onlineFerme();
        mode = null;
      }
    });
  }

  function showOnlineJoin(codePreRempli, invit) {
    netKind = 'online';
    // la carte d'invitation : qui invite, et à quoi (depuis le lien reçu)
    var carte = $('online-invit');
    if (carte) {
      var info = invit && invit.jeu ? catInfo(invit.jeu) : null;
      if (invit && (invit.de || info)) {
        carte.innerHTML = '<span class="oi-ic">' + (info ? info.icone : '🎲') + '</span>' +
          '<span class="oi-tx"><span class="oi-t">' +
          (invit.de ? '<strong>' + esc(invit.de) + '</strong> vous invite' : 'On vous invite') +
          '</span><span class="oi-s">' + (info ? esc(info.nom) : 'Partie en ligne') + '</span></span>';
        if (info) carte.setAttribute('data-jeu', info.id); else carte.removeAttribute('data-jeu');
        carte.classList.remove('hidden');
      } else {
        carte.classList.add('hidden');
      }
    }
    $('online-step-code').classList.remove('hidden');
    $('online-step-lobby').classList.add('hidden');
    $('online-error').classList.add('hidden');
    $('online-lobby').classList.add('hidden');
    if (codePreRempli) $('online-code').value = codePreRempli;
    showScreen('screen-online');
    if (!window.GG.Online.disponible()) showRelaisSettings();
  }

  function showRelaisSettings() {
    $('relais-url').value = window.GG.Online.serveur();
    $('relais-etat').textContent = window.GG.Online.disponible()
      ? '✅ Serveur en service — vous n’avez rien à faire ici.'
      : '⚠️ Aucun serveur : le jeu à distance est indisponible tant qu’une ' +
        'adresse n’est pas collée ici. (Le jeu sur place, par QR code, ' +
        'fonctionne sans.)';
    showScreen('screen-relais');
  }

  function testerRelais() {
    var url = window.GG.Online.normaliser($('relais-url').value);
    if (!url) { $('relais-etat').textContent = '⚠️ Entrez d’abord une adresse.'; return; }
    $('relais-etat').textContent = '⏳ Test en cours…';
    var ws;
    var fini = false;
    var stop = function (txt) {
      if (fini) return;
      fini = true;
      $('relais-etat').textContent = txt;
      if (ws) { try { ws.close(); } catch (e) {} }
    };
    setTimeout(function () { stop('❌ Pas de réponse : vérifiez l’adresse.'); }, 8000);
    try {
      ws = new WebSocket(url + '/salon/TEST00?r=h');
    } catch (e) {
      stop('❌ Adresse invalide.');
      return;
    }
    ws.onmessage = function (ev) {
      var m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.sys === 'bienvenue') stop('✅ Le serveur répond : tout est prêt !');
      else if (m.sys === 'refus') stop('✅ Le serveur répond (salon d’essai occupé, c’est bon signe).');
    };
    ws.onerror = function () { stop('❌ Connexion impossible : vérifiez l’adresse.'); };
  }

  /* ---------- partage par message (jouer à distance) ----------
     Le téléphone ouvre son propre menu de partage (Messages, WhatsApp,
     e-mail…) ; s'il ne sait pas faire, on se rabat sur la copie. */
  function shareText(textareaId, titre, intro) {
    var el = $(textareaId);
    var texte = intro + '\n\n' + el.value;
    if (navigator.share) {
      navigator.share({ title: titre, text: texte })
        .catch(function () { /* partage annulé : rien à signaler */ });
      return;
    }
    copyText(textareaId);
    toast('Copié : collez-le dans votre messagerie.');
  }

  /* ---------- copie dans le presse-papiers ---------- */
  function copyText(textareaId) {
    var el = $(textareaId);
    el.select();
    el.setSelectionRange(0, el.value.length);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(el.value).then(function () { toast('Code copié.'); });
    } else {
      try { document.execCommand('copy'); toast('Code copié.'); } catch (e) {}
    }
  }

  /* ---------- écouteurs ---------- */
  function init() {
    buildBoard();

    // Accueil : catalogue des jeux, profil, reprise
    majReglages();
    renderCatalog();
    renderAccueil();
    prefillNoms();
    window.addEventListener('popstate', onRetour);

    // Profil et réglages
    $('btn-profil').addEventListener('click', openProfil);
    $('btn-reglages').addEventListener('click', openReglages);
    $('btn-rg-profil').addEventListener('click', openProfil);
    $('btn-rg-boutique').addEventListener('click', openBoutique);
    $('btn-rg-maj').addEventListener('click', rechargerPropre);
    $('pf-nom').addEventListener('input', function () {
      var q = profil();
      q.nom = $('pf-nom').value.trim().slice(0, 14);
      profilSet(q);
      prefillNoms();
    });
    function bascule(id, cle, valeurOn, valeurOff) {
      function go() {
        var R = window.GG.reglages;
        var on = $(id).classList.contains('on');
        R.set(cle, on ? valeurOff : valeurOn);
        if (cle === 'son' && window.GG.sfx.setOn) window.GG.sfx.setOn(!on);
        majReglages();
        if (!on) { window.GG.sfx.play('toggle'); window.GG.haptic('select'); }
      }
      $(id).addEventListener('click', go);
      $(id).addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); go(); }
      });
    }
    bascule('rg-son', 'son', true, false);
    bascule('rg-vib', 'vibrations', true, false);
    bascule('rg-anim', 'animations', 'normales', 'reduites');
    // un prénom tapé quelque part devient celui du profil
    document.addEventListener('change', function (ev) {
      if (ev.target && CHAMPS_MON_NOM.indexOf(ev.target.id) !== -1) retiensNom(ev.target.value);
    });
    // petits bruits et vibrations d'interface (les jeux ont les leurs)
    document.addEventListener('click', function (ev) {
      var b = ev.target && ev.target.closest &&
        ev.target.closest('.btn, .count-btn, .icon-btn, .cat-tab, .avatars button, .teintes button, .chat-q');
      if (!b || b.disabled || b.closest('#mini-area') || b.closest('#board') || b.closest('#rack')) return;
      window.GG.sfx.play('tap');
      window.GG.haptic('select');
    }, true);
    if (window.GG.fx.autoRipple) window.GG.fx.autoRipple('.btn:not(.link), .count-btn, .mode-btn, .cat-tab');

    // Cagnotte de jetons : jauge d'accueil et boutique
    if (window.GG.wallet) {
      $('btn-wallet').addEventListener('click', openBoutique);
      window.GG.wallet.onChange(function () {
        updateWallet();
        if ($('screen-boutique').classList.contains('active')) renderBoutique();
      });
      // table de poker fermée brutalement (appli tuée) : la cave est remboursée
      // — sauf si la partie est enregistrée : on la reprendra, jetons compris
      try {
        var orphan = JSON.parse(localStorage.getItem('gg-poker-open') || 'null');
        var aReprendre = lisSauvegarde();
        var memeTable = aReprendre && (aReprendre.type === 'mini' || aReprendre.type === 'reseau') &&
          aReprendre.state && orphan && aReprendre.state.gameId === orphan.gameId;
        if (orphan && orphan.invested && !memeTable) {
          window.GG.wallet.add(orphan.invested);
          localStorage.removeItem('gg-poker-open');
        }
      } catch (e) {}
      updateWallet();
    }

    function openHostScreen(kind) {
      netKind = kind || 'qr';
      onlineFerme();
      showScreen('screen-host');
      $('host-title').textContent = (netKind === 'online' ? '🌍 Partie en ligne — ' :
        'Créer une partie — ') + gameLabel();
      $('host-step-name').classList.remove('hidden');
      ['host-step-lobby', 'host-step-offer', 'host-step-scan', 'host-step-wait', 'host-step-wifi']
        .forEach(function (id) { $(id).classList.add('hidden'); });
      $('host-error').classList.add('hidden');
      $('host-name-hint').textContent = netKind === 'online'
        ? 'Votre téléphone reste l’arbitre de la partie. Un code de 6 caractères ' +
          'sera affiché : donnez-le à vos amis, où qu’ils soient.'
        : 'Votre téléphone servira de serveur. Tous les téléphones doivent être sur ' +
          'le même Wi-Fi, ou connectés à votre partage de connexion (pas besoin d’Internet).';
      if (netKind === 'online' && !window.GG.Online.disponible()) showRelaisSettings();
    }

    function openJoinScreen() {
      autoOffer = null; // entrée manuelle : on scanne, on ne rejoue pas un vieux code
      showScreen('screen-join');
      $('join-step-name').classList.remove('hidden');
      $('join-step-scan').classList.add('hidden');
      $('join-step-answer').classList.add('hidden');
      $('join-error').classList.add('hidden');
    }

    $('btn-mode-solo').addEventListener('click', function () { prefillNoms(); showScreen('screen-solo-setup'); });
    $('btn-mode-local').addEventListener('click', function () { prefillNoms(); showScreen('screen-local-setup'); });
    $('btn-mode-host').addEventListener('click', function () {
      pendingGame = 'mots';
      openHostScreen();
    });
    $('btn-home-join').addEventListener('click', openJoinScreen);

    // Mini-jeux : configuration
    $('btn-mini-hotseat').addEventListener('click', function () {
      $('mini-hotseat-config').classList.remove('hidden');
      $('mini-solo-config').classList.add('hidden');
    });
    $('btn-mini-solo').addEventListener('click', function () {
      $('mini-solo-config').classList.remove('hidden');
      $('mini-hotseat-config').classList.add('hidden');
    });
    $('btn-mini-start').addEventListener('click', miniStartLocal);
    $('btn-msolo-start').addEventListener('click', miniStartSolo);
    $('btn-mini-host').addEventListener('click', function () { openHostScreen('qr'); });
    $('btn-mini-online').addEventListener('click', function () { openHostScreen('online'); });
    $('btn-mode-online').addEventListener('click', function () {
      pendingGame = 'mots';
      openHostScreen('online');
    });
    $('btn-home-online').addEventListener('click', function () { showOnlineJoin(''); });
    $('btn-online-go').addEventListener('click', guestOnlineJoin);
    $('online-code').addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') guestOnlineJoin();
    });
    $('btn-online-settings').addEventListener('click', showRelaisSettings);
    $('btn-relais-save').addEventListener('click', function () {
      var n = window.GG.Online.setServeur($('relais-url').value);
      $('relais-url').value = n;
      $('relais-etat').textContent = n
        ? '✅ Enregistré : ' + n
        : 'Adresse effacée : le jeu à distance est de nouveau indisponible.';
      toast(n ? 'Serveur enregistré.' : 'Serveur effacé.');
    });
    $('btn-relais-test').addEventListener('click', testerRelais);
    $('btn-forcer-maj').addEventListener('click', rechargerPropre);

    // Discussion pendant la partie
    $('btn-mini-chat').addEventListener('click', chatOuvre);
    $('btn-game-chat').addEventListener('click', chatOuvre);
    $('btn-chat-close').addEventListener('click', chatFerme);
    $('btn-chat-send').addEventListener('pointerdown', function (ev) { ev.preventDefault(); });
    $('btn-chat-send').addEventListener('click', function () {
      var inp = $('chat-in');
      chatEnvoyer(inp.value);
      inp.value = '';
      inp.focus();
    });
    $('chat-in').addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter') return;
      chatEnvoyer(ev.target.value);
      ev.target.value = '';
    });
    $('btn-host-whatsapp').addEventListener('click', function () {
      // WhatsApp s'ouvre avec le message prêt à partir (ou WhatsApp Web)
      var url = 'https://wa.me/?text=' + encodeURIComponent(texteInvitation());
      try { window.open(url, '_blank', 'noopener'); } catch (e) { location.href = url; }
    });
    $('btn-host-share-code').addEventListener('click', function () {
      var texte = texteInvitation();
      if (navigator.share) {
        navigator.share({ title: 'GGgames — partie en ligne', text: texte })
          .catch(function () {});
        return;
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(texte)
          .then(function () { toast('Code et lien copiés.'); })
          .catch(function () { toast('Code : ' + onlineCode); });
      } else {
        toast('Code : ' + onlineCode);
      }
    });
    $('btn-mini-menu').addEventListener('click', function () { showOverlay('overlay-menu', true); });
    $('btn-mini-reconnect').addEventListener('click', reconnect);

    // Règles du jeu en cours
    var MOTS_REGLES = '<p><strong>🎯 Le but :</strong> marquer plus de points que les autres ' +
      'en posant des mots sur la grille, comme au jeu de lettres classique.</p>' +
      '<p><strong>Comment jouer :</strong> touchez une lettre de votre chevalet puis une case ' +
      'de la grille. Chaque mot doit exister dans le dictionnaire français (vérifié ' +
      'automatiquement) et toucher les mots déjà posés.</p>' +
      '<p><strong>Les points :</strong> chaque lettre a une valeur ; les cases colorées ' +
      'multiplient la lettre (LD ×2, LT ×3) ou le mot (MD ×2, MT ×3). Poser ses 7 lettres ' +
      'd’un coup rapporte 50 points bonus !</p>';
    function showRules() {
      var isMots = document.getElementById('screen-game').classList.contains('active');
      var titre, corps;
      if (isMots || currentGame === 'mots') {
        titre = '🔤 Words';
        corps = MOTS_REGLES;
      } else if (miniMod) {
        titre = miniMod.icone + ' ' + miniMod.nom;
        corps = miniMod.regles || ('<p>' + esc(miniMod.desc) + '</p>');
      } else {
        return;
      }
      $('rules-title').textContent = titre;
      $('rules-body').innerHTML = corps;
      showOverlay('overlay-rules', true);
    }
    $('btn-rules').addEventListener('click', showRules);
    $('btn-setup-rules').addEventListener('click', function () {
      var mod = window.GG.byId[pendingGame];
      if (!mod) return;
      $('rules-title').textContent = mod.icone + ' ' + mod.nom;
      $('rules-body').innerHTML = mod.regles || ('<p>' + esc(mod.desc) + '</p>');
      showOverlay('overlay-rules', true);
    });
    $('btn-mini-rules').addEventListener('click', showRules);
    $('btn-rules-close').addEventListener('click', function () {
      showOverlay('overlay-rules', false);
    });

    // Retours
    document.querySelectorAll('[data-back]').forEach(function (b) {
      b.addEventListener('click', function () { quitToHome(); });
    });

    // Choix du nombre de joueurs (mode local) — uniquement les boutons de
    // CET écran : les boutons de niveau IA partagent la classe count-btn
    document.querySelectorAll('#player-count .count-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        localCount = parseInt(b.dataset.n, 10);
        document.querySelectorAll('#player-count .count-btn').forEach(function (x) {
          x.classList.toggle('active', x === b);
        });
        $('local-label-3').classList.toggle('hidden', localCount < 3);
        $('local-label-4').classList.toggle('hidden', localCount < 4);
      });
    });

    // Partie solo contre l'IA
    document.querySelectorAll('.level-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        aiLevel = b.dataset.level;
        document.querySelectorAll('.level-btn').forEach(function (x) {
          x.classList.toggle('active', x === b);
        });
      });
    });
    $('btn-solo-start').addEventListener('click', function () {
      var name = ($('solo-name').value.trim() || 'Joueur').slice(0, 14);
      var btn = $('btn-solo-start');
      btn.disabled = true;
      $('solo-loading').classList.remove('hidden');
      loadDict().then(function () {
        btn.disabled = false;
        $('solo-loading').classList.add('hidden');
        mode = 'solo';
        state = S.newGame([name, 'IA ' + aiLevel]);
        pending = [];
        selected = -1;
        enterGame();
      }).catch(function () {
        btn.disabled = false;
        $('solo-loading').classList.add('hidden');
        toast('Impossible de charger le dictionnaire. Une connexion Internet est nécessaire la toute première fois.');
      });
    });

    // Partie locale
    $('btn-local-start').addEventListener('click', function () {
      var names = [];
      for (var i = 1; i <= localCount; i++) {
        names.push(($('local-name-' + i).value.trim() || 'Joueur ' + i).slice(0, 14));
      }
      var btn = $('btn-local-start');
      btn.disabled = true;
      loadDict().catch(function () {
        toast('Dictionnaire indisponible : les mots ne seront pas vérifiés.');
      }).then(function () {
        btn.disabled = false;
        mode = 'local';
        state = S.newGame(names);
        pending = [];
        selected = -1;
        enterGame();
        showPassDevice();
      });
    });

    // Hôte
    $('btn-host-create').addEventListener('click', function () {
      myFixedIndex = 0;
      loadDict().catch(function () {}); // en tâche de fond pendant l'appairage
      if (netKind === 'online') { hostOnlineCreate(); return; }
      hostName = ($('host-name').value.trim() || 'Joueur 1').slice(0, 14);
      mode = 'host';
      hostPeers = [];
      hostShowLobby();
    });
    $('btn-host-invite').addEventListener('click', hostInvite);
    $('btn-host-wifi').addEventListener('click', hostShowWifi);
    $('btn-wifi-make').addEventListener('click', makeWifiQr);
    $('btn-wifi-back').addEventListener('click', hostShowLobby);
    $('btn-host-start').addEventListener('click', hostStartGame);
    $('btn-host-back-game').addEventListener('click', hostBackToGame);
    $('btn-host-scan-answer').addEventListener('click', hostScanAnswer);
    $('btn-host-copy').addEventListener('click', function () { copyText('host-code'); });
    $('btn-host-share').addEventListener('click', function () {
      shareText('host-code', 'GGgames — invitation',
        'Je t’invite à jouer sur GGgames ! Ouvre ce lien, entre ton prénom, ' +
        'puis renvoie-moi le code de réponse que tu obtiens :');
    });
    $('btn-host-paste-ok').addEventListener('click', function () {
      hostAcceptAnswer($('host-paste').value);
    });

    // Invité
    $('btn-join-scan').addEventListener('click', guestStart);
    $('btn-join-copy').addEventListener('click', function () { copyText('join-code'); });
    $('btn-join-share').addEventListener('click', function () {
      shareText('join-code', 'GGgames — ma réponse',
        'Voici mon code de réponse : colle-le dans GGgames ' +
        '(bouton « Scanner la réponse ») et la partie démarre !');
    });
    $('btn-join-paste-ok').addEventListener('click', function () {
      guestGotOffer($('join-paste').value);
    });

    // Jeu
    $('btn-play').addEventListener('click', doPlay);
    $('btn-pass').addEventListener('click', doPass);
    $('btn-exchange').addEventListener('click', startExchange);
    $('btn-exchange-ok').addEventListener('click', confirmExchange);
    $('btn-exchange-cancel').addEventListener('click', function () {
      exchangeMode = false;
      exchangeSel = [];
      render();
    });
    $('btn-recall').addEventListener('click', recallAll);
    $('btn-shuffle').addEventListener('click', shuffleRack);
    $('btn-reconnect').addEventListener('click', reconnect);

    // Passage du téléphone
    $('btn-pass-ready').addEventListener('click', function () {
      passHidden = false;
      showOverlay('overlay-pass', false);
      if (currentGame === 'mots') render(); else miniRender();
    });

    // Joker
    $('btn-joker-cancel').addEventListener('click', function () {
      jokerTarget = null;
      showOverlay('overlay-joker', false);
    });

    // Confirmation
    $('btn-confirm-yes').addEventListener('click', function () {
      showOverlay('overlay-confirm', false);
      if (confirmCb) { var cb = confirmCb; confirmCb = null; cb(); }
    });
    $('btn-confirm-no').addEventListener('click', function () {
      confirmCb = null;
      showOverlay('overlay-confirm', false);
    });

    // Historique
    $('btn-history').addEventListener('click', function () {
      renderHistory();
      showOverlay('overlay-history', true);
    });
    $('btn-history-close').addEventListener('click', function () {
      showOverlay('overlay-history', false);
    });

    // Menu
    $('btn-menu').addEventListener('click', function () { showOverlay('overlay-menu', true); });
    $('btn-menu-resume').addEventListener('click', function () { showOverlay('overlay-menu', false); });
    $('btn-menu-close').addEventListener('click', function () { showOverlay('overlay-menu', false); });
    $('btn-menu-invite').addEventListener('click', function () {
      showOverlay('overlay-menu', false);
      hostShowLobby();
    });
    $('btn-menu-quit').addEventListener('click', function () {
      showOverlay('overlay-menu', false);
      askConfirm('Quitter la partie', 'La partie en cours sera perdue. Continuer ?', quitToHome);
    });

    // Fin de partie
    $('btn-end-new').addEventListener('click', function () {
      if (mode === 'guest') { demandeRevanche(); return; }
      if (mode === 'host') { hostRejoue(currentGame); return; }
      if (currentGame === 'mots') newGameSamePlayers(); else miniRematch();
    });
    $('btn-end-switch').addEventListener('click', ouvreChangeJeu);
    $('btn-switch-close').addEventListener('click', function () { showOverlay('overlay-switch', false); });
    $('btn-end-home').addEventListener('click', quitToHome);

    // Invitation reçue en scannant le QR avec l'appareil photo du téléphone :
    // l'URL contient le code (#j=...) → on ouvre directement l'écran « rejoindre ».
    // (au chargement, mais aussi si l'app était déjà ouverte : hashchange)
    function handleInviteHash() {
      // lien d'une partie EN LIGNE : ?jeu=poker&de=Loïc#c=PLUME7 → écran
      // « rejoindre » avec la carte d'invitation (qui invite, à quel jeu)
      if (location.hash && location.hash.indexOf('#c=') === 0) {
        var court = location.hash.slice(3).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
        var invit = null;
        try {
          var q = new URLSearchParams(location.search);
          if (q.get('jeu') || q.get('de')) invit = { jeu: q.get('jeu') || '', de: (q.get('de') || '').slice(0, 14) };
        } catch (e) {}
        history.replaceState(null, '', location.pathname);
        if (gameStarted() || !court) return;
        showOnlineJoin(court, invit);
        return;
      }
      if (!(location.hash && location.hash.indexOf('#j=') === 0)) return;
      var code = extractCode(location.hash);
      history.replaceState(null, '', location.pathname + location.search);
      if (gameStarted()) return; // partie en cours : on ne stocke rien
      autoOffer = code;
      showScreen('screen-join');
      $('join-step-name').classList.remove('hidden');
      $('join-step-scan').classList.add('hidden');
      $('join-step-answer').classList.add('hidden');
      $('join-error').classList.add('hidden');
      $('btn-join-scan').textContent = 'Se connecter à la partie';
    }
    handleInviteHash();
    window.addEventListener('hashchange', handleInviteHash);

    // Service worker (fonctionnement hors ligne + mise à jour automatique)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').then(function (reg) {
        if (reg && reg.update) { try { reg.update().catch(function () {}); } catch (e) {} }
        // badge « prête pour le mode avion » quand tout est en cache
        var showReady = function () {
          var b = document.getElementById('offline-badge');
          if (b) b.classList.remove('hidden');
        };
        if (navigator.serviceWorker.controller) showReady();
        else navigator.serviceWorker.ready.then(function () {
          setTimeout(showReady, 1500); // laisse la première installation finir
        }).catch(function () {});
      }).catch(function () {});
      // Quand une NOUVELLE version prend la main (pas la toute première
      // installation), on recharge la page pour l'afficher tout de suite —
      // sauf en pleine partie, pour ne rien couper.
      var hadController = !!navigator.serviceWorker.controller;
      var reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        if (!hadController) { hadController = true; return; }
        if (reloaded) return;
        // on ne recharge qu'au repos complet : ni partie, ni salon, ni
        // appairage en cours (un reload fermerait les connexions WebRTC)
        if (gameStarted() || mode !== null) return;
        reloaded = true;
        location.reload();
      });
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
