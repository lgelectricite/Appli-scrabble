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

  function $(id) { return document.getElementById(id); }

  /* ---------- navigation entre écrans ---------- */
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(function (s) {
      s.classList.toggle('active', s.id === id);
    });
    window.scrollTo(0, 0);
  }

  function showOverlay(id, visible) {
    $(id).classList.toggle('hidden', !visible);
  }

  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
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
    for (var i = 0; i < cells.length; i++) {
      var old = cells[i].querySelector('.tile');
      if (old) old.remove();
      var t = state.board[i];
      if (t) cells[i].insertAdjacentHTML('beforeend', tileHtml(t.letter, t.blank, false));
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

  function renderRack() {
    var rackEl = $('rack');
    rackEl.innerHTML = '';
    if (!state) return;
    var rack = myRack();
    var used = usedRackPositions();
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
      b.addEventListener('click', function () { onRackTap(pos); });
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
    $('turn-banner').innerHTML = state.over
      ? 'Partie terminée'
      : (mode === 'solo' && state.current === 1)
        ? '🤖 L’IA réfléchit…'
        : 'Au tour de <strong>' + esc(state.players[state.current].name) + '</strong>' +
          (waiting ? '…' : '');

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
      render();
      if (state.over) showEnd();
    }, 400);
  }

  /* ---------- mode local : passage du téléphone ---------- */
  function showPassDevice() {
    passHidden = true;
    $('pass-name').textContent = state.players[state.current].name;
    showOverlay('overlay-pass', true);
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
    if (ranked[0].score === ranked[1].score) {
      w.textContent = 'Égalité !';
    } else {
      w.textContent = '🏆 ' + ranked[0].name + ' gagne !';
    }
    $('btn-end-new').classList.toggle('hidden', mode === 'guest');
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
        if (peer.connected) peer.net.send({ t: 'init', state: state, you: peer.playerIndex });
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
    if (pendingGame === 'mots') return 'Mots';
    var mod = window.GG.byId[pendingGame];
    return mod ? mod.nom : '';
  }

  function renderCatalog() {
    var cat = $('catalog');
    var tiles = [{ id: 'mots', nom: 'Mots', icone: '🔤', min: 1, max: 4 }]
      .concat(window.GG.list);
    cat.innerHTML = tiles.map(function (m) {
      return '<button class="game-tile" data-g="' + m.id + '">' +
        '<span class="gt-icon">' + m.icone + '</span>' +
        '<span class="gt-name">' + m.nom + '</span>' +
        '<span class="gt-players">' + m.min + (m.max > m.min ? '–' + m.max : '') + ' joueur' +
        (m.max > 1 ? 's' : '') + '</span></button>';
    }).join('');
    cat.querySelectorAll('.game-tile').forEach(function (t) {
      t.addEventListener('click', function () {
        var id = t.dataset.g;
        if (id === 'mots') {
          pendingGame = 'mots';
          showScreen('screen-mots-home');
          return;
        }
        openMiniSetup(window.GG.byId[id]);
      });
    });
  }

  function updateMiniNameFields() {
    for (var i = 2; i <= 4; i++) {
      var lbl = $('mini-label-' + i);
      if (lbl) lbl.classList.toggle('hidden', miniCount < i);
    }
  }

  function openMiniSetup(mod) {
    pendingGame = mod.id;
    $('mini-setup-title').textContent = mod.icone + ' ' + mod.nom;
    $('mini-setup-desc').textContent = mod.desc;
    $('btn-mini-hotseat').classList.toggle('hidden', !mod.hotseat || mod.netOnly);
    $('btn-mini-host').classList.toggle('hidden', mod.max < 2);
    $('mini-hotseat-config').classList.add('hidden');
    var box = $('mini-count');
    box.innerHTML = '';
    miniCount = mod.min;
    var hotMax = Math.min(mod.max, 4); // sur un seul téléphone : 4 noms maximum
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
    var needDict = pendingGame === 'pendu';
    (needDict ? loadDict().catch(function () {}) : Promise.resolve()).then(function () {
      currentGame = pendingGame;
      miniMod = mod;
      mode = 'local';
      miniState = mod.create(names, { dict: dict });
      miniMe = 0;
      enterMini();
    });
  }

  function enterMini() {
    stopScanner();
    showScreen('screen-mini');
    $('btn-menu-invite').classList.toggle('hidden', mode !== 'host');
    miniLastViewer = -1;
    miniRender();
  }

  /* Quel joueur regarde l'écran en ce moment ? */
  function miniViewer() {
    if (mode !== 'local') return miniMe;
    var t = miniMod.turnOf(miniState);
    if (t >= 0) return t;
    if (miniMod.viewerOf) return miniMod.viewerOf(miniState);
    return 0;
  }

  function miniRender() {
    if (!miniState || !miniMod) return;
    var mod = miniMod;
    document.body.classList.toggle('theme-manoir', currentGame === 'manoir');
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
    $('mini-turn').innerHTML = mod.over(miniState) ? 'Partie terminée'
      : t === -1 ? ''
        : 'Au tour de <strong>' + esc(miniState.players[t].name) + '</strong>';

    var viewer = miniViewer();
    // jeux à infos cachées sur un seul téléphone : écran de passage
    if (mode === 'local' && mod.hidden && miniLastViewer !== -1 &&
        viewer !== miniLastViewer && !mod.over(miniState)) {
      passHidden = true;
      $('pass-name').textContent = miniState.players[viewer].name;
      showOverlay('overlay-pass', true);
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

  function miniAct(action) {
    if (!miniState || !miniMod) return;
    if (mode === 'guest') {
      if (!guestNet || !guestNet.isOpen()) { toast('Connexion perdue.'); return; }
      guestNet.send({ t: 'ga', a: action });
      return;
    }
    var player = mode === 'local' ? miniViewer() : 0;
    miniApplyAuthority(player, action, null);
  }

  function miniApplyAuthority(player, action, peer) {
    var res = miniMod.apply(miniState, player, action, { dict: dict });
    if (!res.ok) {
      if (peer) peer.net.send({ t: 'err', msg: res.error });
      else toast(res.error);
      return;
    }
    if (res.timer) {
      clearTimeout(miniTimer);
      miniTimer = setTimeout(function () {
        if (miniState && miniMod) miniApplyAuthority(-1, res.timer.action, null);
      }, res.timer.ms);
    }
    miniAfterChange();
  }

  function miniAfterChange() {
    if (mode === 'host') miniBroadcast();
    miniRender();
    if (miniMod.over(miniState)) showMiniEnd();
  }

  function showMiniEnd() {
    $('end-detail').innerHTML = miniMod.summary(miniState);
    $('end-winner').textContent = '';
    $('btn-end-new').classList.toggle('hidden', mode === 'guest');
    showOverlay('overlay-end', true);
  }

  function miniRematch() {
    var names = miniState.players.map(function (p) { return p.name; });
    miniState = miniMod.create(names, { dict: dict });
    miniLastViewer = -1;
    showOverlay('overlay-end', false);
    if (mode === 'host') {
      hostPeers.forEach(function (peer) { if (peer.connected) sendInitTo(peer); });
    }
    miniRender();
  }

  /* =================================================================
   *  RÉSEAU — HÔTE (serveur de la partie)
   * ================================================================= */

  function normName(n) { return (n || '').trim().toLowerCase(); }

  function uniqueName(name) {
    var base = (name || 'Joueur').slice(0, 14) || 'Joueur';
    var taken = [normName(hostName)].concat(hostPeers.map(function (p) { return normName(p.name); }));
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
    hostPeers.forEach(function (peer) {
      if (peer.connected) peer.net.send({ t: 'lobby', names: lobbyNames() });
    });
  }

  function broadcastState() {
    hostPeers.forEach(function (peer) {
      if (peer.connected) peer.net.send({ t: 'state', state: state });
    });
  }

  /* État d'un mini-jeu, expurgé des secrets pour un joueur donné. */
  function miniRedactFor(playerIdx) {
    return miniMod && miniMod.redact ? miniMod.redact(miniState, playerIdx) : miniState;
  }

  function miniBroadcast() {
    hostPeers.forEach(function (peer) {
      if (peer.connected) {
        peer.net.send({ t: 'state', state: miniRedactFor(peer.playerIndex) });
      }
    });
  }

  /* Envoie l'état initial (ou de reprise) du jeu en cours à un invité. */
  function sendInitTo(peer) {
    if (currentGame !== 'mots' && miniState) {
      peer.net.send({
        t: 'init', game: currentGame,
        state: miniRedactFor(peer.playerIndex), you: peer.playerIndex
      });
    } else if (state) {
      peer.net.send({ t: 'init', game: 'mots', state: state, you: peer.playerIndex });
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
    $('btn-host-invite').classList.toggle('hidden',
      gameStarted() ? false : hostPeers.length >= maxGuests());
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
      var off = hostPeers.filter(function (p) { return !p.connected; });
      if (gameStarted() && off.length) {
        setNetBanner(true, off.map(function (p) { return p.name; }).join(', ') +
          ' — déconnecté' + (off.length > 1 ? 's' : '') + '.');
      } else {
        setNetBanner(false);
      }
    }
  }

  function attachPeerHandlers(peer) {
    peer.net.onMessage = function (msg) { hostHandleMessage(peer, msg); };
    peer.net.onOpen = function () { /* attend le « hello » de l'invité */ };
    peer.net.onClose = function () {
      peer.connected = false;
      updateNetBanner();
      renderBadgesSafe();
      if (document.querySelector('#screen-host.active')) renderLobby();
    };
  }

  function renderBadgesSafe() {
    if (state && document.querySelector('#screen-game.active')) render();
  }

  function hostHandleMessage(peer, msg) {
    if (msg.t === 'hello') {
      if (!gameStarted()) {
        // Salon : nouvel invité
        if (hostPeers.indexOf(peer) === -1) {
          if (hostPeers.length >= maxGuests()) {
            peer.net.send({ t: 'err', msg: 'La partie est complète.' });
            peer.net.close();
            return;
          }
          peer.name = uniqueName(msg.name);
          peer.connected = true;
          hostPeers.push(peer);
        } else {
          peer.connected = true;
        }
        if (invitePeer === peer) invitePeer = null;
        broadcastLobby();
        hostShowLobby();
        return;
      }
      // Partie en cours : reconnexion d'un joueur existant (par prénom)
      var match = null;
      for (var i = 0; i < hostPeers.length; i++) {
        if (!hostPeers[i].connected && normName(hostPeers[i].name) === normName(msg.name)) {
          match = hostPeers[i];
          break;
        }
      }
      if (!match) {
        peer.net.send({
          t: 'err',
          msg: 'Partie en cours : indiquez exactement le même prénom qu’au début (' +
            hostPeers.filter(function (p) { return !p.connected; })
              .map(function (p) { return p.name; }).join(', ') + ').'
        });
        return;
      }
      match.net.close();
      match.net = peer.net;
      match.connected = true;
      attachPeerHandlers(match);
      if (invitePeer === peer) invitePeer = null;
      sendInitTo(match);
      updateNetBanner();
      if (document.querySelector('#screen-host.active')) hostBackToGame();
      if (currentGame === 'mots') render(); else miniRender();
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
    showScreen('screen-host');
    $('host-title').textContent = 'Créer une partie — ' + gameLabel();
    $('host-step-name').classList.add('hidden');
    $('host-step-lobby').classList.remove('hidden');
    $('host-step-offer').classList.add('hidden');
    $('host-step-scan').classList.add('hidden');
    $('host-step-wait').classList.add('hidden');
    $('host-error').classList.add('hidden');
    renderLobby();
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
      $('host-step-scan').querySelector('details').open = true;
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
        peer.net.send({ t: 'init', game: 'mots', state: state, you: peer.playerIndex });
      });
      enterGame();
      return;
    }
    // Mini-jeu en réseau : l'hôte crée l'état et fait autorité
    var needDict = pendingGame === 'pendu';
    (needDict ? loadDict().catch(function () {}) : Promise.resolve()).then(function () {
      currentGame = pendingGame;
      miniMod = window.GG.byId[currentGame];
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
    if (msg.t === 'lobby') {
      var box = $('join-lobby');
      box.classList.remove('hidden');
      $('join-lobby-list').innerHTML = (msg.names || []).map(function (n, i) {
        return '<div class="lobby-row">' + (i === 0 ? '👑 ' : '🟢 ') + esc(n) + '</div>';
      }).join('');
      $('join-waiting').textContent = '⏳ Connecté ! En attente du début de la partie…';
      return;
    }
    if (msg.t === 'init') {
      currentGame = msg.game || 'mots';
      waitingHost = false;
      clearTimeout(waitingTimer);
      setNetBanner(false);
      showOverlay('overlay-end', false);
      if (currentGame === 'mots') {
        state = msg.state;
        myFixedIndex = msg.you || 1;
        pending = [];
        selected = -1;
        enterGame();
      } else {
        miniMod = window.GG.byId[currentGame];
        miniState = msg.state;
        miniMe = msg.you || 1;
        enterMini();
      }
      return;
    }
    if (msg.t === 'state') {
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
      guestNet.send({ t: 'hello', name: name });
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

  /* ---------- reconnexion ---------- */
  function reconnect() {
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
    showScreen('screen-game');
    $('btn-menu-invite').classList.toggle('hidden', mode !== 'host');
    render();
  }

  function quitToHome() {
    stopScanner();
    hostPeers.forEach(function (p) { p.net.close(); });
    hostPeers = [];
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
    clearTimeout(miniTimer);
    ['overlay-pass', 'overlay-joker', 'overlay-confirm', 'overlay-history',
     'overlay-menu', 'overlay-end'].forEach(function (id) { showOverlay(id, false); });
    setNetBanner(false);
    document.body.classList.remove('theme-manoir');
    showScreen('screen-home');
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

    // Accueil : catalogue des jeux
    renderCatalog();

    function openHostScreen() {
      showScreen('screen-host');
      $('host-title').textContent = 'Créer une partie — ' + gameLabel();
      $('host-step-name').classList.remove('hidden');
      ['host-step-lobby', 'host-step-offer', 'host-step-scan', 'host-step-wait']
        .forEach(function (id) { $(id).classList.add('hidden'); });
      $('host-error').classList.add('hidden');
    }

    function openJoinScreen() {
      showScreen('screen-join');
      $('join-step-name').classList.remove('hidden');
      $('join-step-scan').classList.add('hidden');
      $('join-step-answer').classList.add('hidden');
      $('join-error').classList.add('hidden');
    }

    $('btn-mode-solo').addEventListener('click', function () { showScreen('screen-solo-setup'); });
    $('btn-mode-local').addEventListener('click', function () { showScreen('screen-local-setup'); });
    $('btn-mode-host').addEventListener('click', function () {
      pendingGame = 'mots';
      openHostScreen();
    });
    $('btn-home-join').addEventListener('click', openJoinScreen);

    // Mini-jeux : configuration
    $('btn-mini-hotseat').addEventListener('click', function () {
      $('mini-hotseat-config').classList.remove('hidden');
    });
    $('btn-mini-start').addEventListener('click', miniStartLocal);
    $('btn-mini-host').addEventListener('click', openHostScreen);
    $('btn-mini-menu').addEventListener('click', function () { showOverlay('overlay-menu', true); });
    $('btn-mini-reconnect').addEventListener('click', reconnect);

    // Retours
    document.querySelectorAll('[data-back]').forEach(function (b) {
      b.addEventListener('click', function () { quitToHome(); });
    });

    // Choix du nombre de joueurs (mode local)
    document.querySelectorAll('.count-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        localCount = parseInt(b.dataset.n, 10);
        document.querySelectorAll('.count-btn').forEach(function (x) {
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
      hostName = ($('host-name').value.trim() || 'Joueur 1').slice(0, 14);
      mode = 'host';
      myFixedIndex = 0;
      hostPeers = [];
      loadDict().catch(function () {}); // en tâche de fond pendant l'appairage
      hostShowLobby();
    });
    $('btn-host-invite').addEventListener('click', hostInvite);
    $('btn-host-start').addEventListener('click', hostStartGame);
    $('btn-host-back-game').addEventListener('click', hostBackToGame);
    $('btn-host-scan-answer').addEventListener('click', hostScanAnswer);
    $('btn-host-copy').addEventListener('click', function () { copyText('host-code'); });
    $('btn-host-paste-ok').addEventListener('click', function () {
      hostAcceptAnswer($('host-paste').value);
    });

    // Invité
    $('btn-join-scan').addEventListener('click', guestStart);
    $('btn-join-copy').addEventListener('click', function () { copyText('join-code'); });
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
      if (currentGame === 'mots') newGameSamePlayers(); else miniRematch();
    });
    $('btn-end-home').addEventListener('click', quitToHome);

    // Invitation reçue en scannant le QR avec l'appareil photo du téléphone :
    // l'URL contient le code (#j=...) → on ouvre directement l'écran « rejoindre ».
    // (au chargement, mais aussi si l'app était déjà ouverte : hashchange)
    function handleInviteHash() {
      if (!(location.hash && location.hash.indexOf('#j=') === 0)) return;
      autoOffer = extractCode(location.hash);
      history.replaceState(null, '', location.pathname + location.search);
      if (gameStarted()) return; // partie en cours : on ne coupe pas le jeu
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
        if (reg && reg.update) reg.update();
      }).catch(function () {});
      // Quand une NOUVELLE version prend la main (pas la toute première
      // installation), on recharge la page pour l'afficher tout de suite —
      // sauf en pleine partie, pour ne rien couper.
      var hadController = !!navigator.serviceWorker.controller;
      var reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        if (!hadController) { hadController = true; return; }
        if (reloaded) return;
        reloaded = true;
        if (!gameStarted()) location.reload();
      });
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
