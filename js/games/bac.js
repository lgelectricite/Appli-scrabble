/* GGgames — Petit Bac (2 à 4 joueurs, réseau uniquement). */
(function (root) {
  'use strict';
  var GG = root.GG;
  var CATS = ['Prénom', 'Animal', 'Ville ou pays', 'Métier', 'Fruit ou légume', 'Objet'];
  var LETTERS = 'ABCDEFGHIJLMNOPRSTV'; // lettres jouables (pas de K, Q, U, W, X, Y, Z)
  var ROUNDS = 4;
  var DURATION = 60; // secondes

  function normalize(s) {
    return String(s || '').trim().toUpperCase()
      .replace(/Œ/g, 'OE').replace(/Æ/g, 'AE')
      .normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function autoInvalid(state, answer) {
    var n = normalize(answer);
    return !n || n[0] !== state.letter;
  }

  /* score la manche : appelé quand tous les votes sont rentrés */
  function scoreRound(state) {
    var nP = state.players.length;
    var results = [];
    for (var p = 0; p < nP; p++) results.push([]);
    for (var c = 0; c < CATS.length; c++) {
      // réponses valides de la catégorie (majorité des votes des autres joueurs)
      var valid = [];
      for (p = 0; p < nP; p++) {
        var ans = (state.answers[p] || [])[c] || '';
        if (autoInvalid(state, ans)) { results[p][c] = { ans: ans, pts: 0, why: 'invalide' }; continue; }
        var yes = 0, no = 0;
        for (var v = 0; v < nP; v++) {
          if (v === p) continue;
          var grid = (state.votes[v] || {})[p];
          if (grid && grid[c] === false) no++; else yes++;
        }
        if (no > yes) { results[p][c] = { ans: ans, pts: 0, why: 'refusée' }; }
        else { valid.push({ p: p, n: normalize(ans), ans: ans }); }
      }
      valid.forEach(function (entry) {
        var dup = valid.filter(function (e) { return e.n === entry.n; }).length > 1;
        results[entry.p][c] = { ans: entry.ans, pts: dup ? 5 : 10, why: dup ? 'doublon' : '' };
      });
    }
    var gains = [];
    for (p = 0; p < nP; p++) {
      var g = 0;
      for (c = 0; c < CATS.length; c++) g += (results[p][c] || { pts: 0 }).pts;
      state.players[p].score += g;
      gains.push(g);
    }
    state.results = results;
    state.gains = gains;
    state.phase = 'result';
  }

  /* Petit lexique embarqué pour l'adversaire IA : quelques mots sûrs par
     lettre et par catégorie. Volontairement incomplet — l'IA sèche parfois
     sur une lettre, exactement comme un joueur humain. */
  var BOT_LEX = [
    { /* Prénom */
      A: ['Alice', 'Arthur'], B: ['Bruno', 'Béatrice'], C: ['Camille', 'Claire'],
      D: ['David', 'Denis'], E: ['Emma', 'Éric'], F: ['Fanny', 'François'],
      G: ['Gabriel', 'Guy'], H: ['Hugo', 'Hélène'], I: ['Inès', 'Isabelle'],
      J: ['Julie', 'Jules'], L: ['Léa', 'Louis'], M: ['Marie', 'Marc'],
      N: ['Nicolas', 'Nathalie'], O: ['Olivier', 'Océane'], P: ['Paul', 'Pauline'],
      R: ['Rémi', 'Rose'], S: ['Sophie', 'Simon'], T: ['Thomas', 'Théo'],
      V: ['Victor', 'Valérie']
    },
    { /* Animal */
      A: ['âne', 'abeille'], B: ['baleine', 'biche'], C: ['chat', 'cheval'],
      D: ['dauphin', 'dromadaire'], E: ['éléphant', 'écureuil'], F: ['fourmi', 'faucon'],
      G: ['girafe', 'grenouille'], H: ['hérisson', 'hibou'], I: ['iguane'],
      J: ['jaguar'], L: ['lapin', 'lion'], M: ['mouton', 'morse'],
      N: ['narval'], O: ['ours', 'oie'], P: ['poule', 'panda'],
      R: ['renard', 'requin'], S: ['singe', 'souris'], T: ['tigre', 'tortue'],
      V: ['vache', 'vautour']
    },
    { /* Ville ou pays */
      A: ['Allemagne', 'Angers'], B: ['Belgique', 'Bordeaux'], C: ['Canada', 'Chine'],
      D: ['Danemark', 'Dijon'], E: ['Espagne', 'Égypte'], F: ['France', 'Finlande'],
      G: ['Grèce', 'Grenoble'], H: ['Hongrie', 'Honfleur'], I: ['Italie', 'Inde'],
      J: ['Japon', 'Jordanie'], L: ['Lyon', 'Lille'], M: ['Maroc', 'Madrid'],
      N: ['Nantes', 'Norvège'], O: ['Oslo', 'Orléans'], P: ['Paris', 'Portugal'],
      R: ['Rome', 'Russie'], S: ['Suisse', 'Sénégal'], T: ['Toulouse', 'Tunisie'],
      V: ['Vienne', 'Venise']
    },
    { /* Métier */
      A: ['avocat', 'architecte'], B: ['boulanger', 'boucher'], C: ['coiffeur', 'cuisinier'],
      D: ['dentiste', 'docteur'], E: ['électricien', 'éboueur'], F: ['facteur', 'fleuriste'],
      G: ['garagiste', 'gendarme'], H: ['horloger'], I: ['infirmier', 'informaticien'],
      J: ['journaliste', 'jardinier'], L: ['libraire', 'livreur'], M: ['médecin', 'maçon'],
      N: ['notaire'], O: ['opticien', 'ouvrier'], P: ['pompier', 'pharmacien'],
      R: ['ramoneur', 'reporter'], S: ['serveur', 'secrétaire'], T: ['traducteur', 'tailleur'],
      V: ['vétérinaire', 'vendeur']
    },
    { /* Fruit ou légume */
      A: ['abricot', 'ananas'], B: ['banane', 'betterave'], C: ['cerise', 'carotte'],
      D: ['datte'], E: ['épinard', 'endive'], F: ['fraise', 'figue'],
      G: ['groseille'], H: ['haricot'], L: ['laitue', 'litchi'],
      M: ['melon', 'mangue'], N: ['navet', 'noisette'], O: ['orange', 'oignon'],
      P: ['poire', 'pomme'], R: ['radis', 'raisin'], S: ['salade'],
      T: ['tomate', 'topinambour']
    },
    { /* Objet */
      A: ['armoire', 'assiette'], B: ['bouteille', 'ballon'], C: ['chaise', 'couteau'],
      D: ['disque', 'drap'], E: ['échelle', 'éponge'], F: ['fourchette', 'fauteuil'],
      G: ['gomme', 'gant'], H: ['horloge', 'hache'], I: ['imprimante'],
      J: ['jouet', 'jumelles'], L: ['lampe', 'livre'], M: ['miroir', 'marteau'],
      N: ['nappe'], O: ['ordinateur', 'oreiller'], P: ['parapluie', 'pinceau'],
      R: ['réveil', 'règle'], S: ['stylo', 'seau'], T: ['table', 'tabouret'],
      V: ['valise', 'verre']
    }
  ];

  /* la feuille de l'IA : trous de mémoire (~1 case sur 4) et, très rarement,
     une étourderie de mauvaise lettre — comme sous la pression du chrono */
  function botSheet(letter) {
    var list = [];
    for (var c = 0; c < CATS.length; c++) {
      var pool = BOT_LEX[c][letter] || [];
      var r = Math.random();
      if (!pool.length || r < 0.25) { list.push(''); continue; }
      var word = pool[Math.floor(Math.random() * pool.length)];
      if (r > 0.97) {
        var others = Object.keys(BOT_LEX[c]);
        var autre = others[Math.floor(Math.random() * others.length)];
        if (autre !== letter) word = BOT_LEX[c][autre][0];
      }
      list.push(word);
    }
    return list;
  }

  /* le mot figure-t-il dans le lexique de l'IA pour cette catégorie ? */
  function botConnait(cat, n) {
    var pool = BOT_LEX[cat][n.charAt(0)] || [];
    for (var i = 0; i < pool.length; i++) if (normalize(pool[i]) === n) return true;
    return false;
  }

  /* jugement d'une réponse adverse : on accepte ce qui ressemble à un mot,
     on refuse le charabia. Un léger doute subsiste sur les mots inconnus. */
  function botJuge(ans, cat, ctx) {
    var n = normalize(ans);
    if (botConnait(cat, n)) return true;
    var w = n.replace(/[ '-]/g, '');
    if (w.length < 2) return false;
    if (/[^A-Z]/.test(w)) return false;               // chiffres, symboles…
    if (!/[AEIOUY]/.test(w)) return false;            // pas une seule voyelle
    if (/[^AEIOUY]{5,}/.test(w)) return false;        // suite de consonnes illisible
    // catégories de noms communs : le dictionnaire tranche quand il connaît
    if ((cat === 1 || cat === 3 || cat === 4 || cat === 5) &&
        ctx && ctx.dict && ctx.dict.set && ctx.dict.set.has(w)) return true;
    return Math.random() > 0.1; // plausible : accepté, avec un soupçon de doute
  }

  var mod = {
    id: 'bac',
    nom: 'Petit Bac',
    icone: '📝',
    desc: 'Une lettre, 6 catégories, 60 secondes. Les autres valident vos réponses.',
    regles: '<p><strong>🎯 Le but :</strong> pour la lettre tirée au sort, trouver un mot par catégorie (prénom, animal, ville…) en 60 secondes.</p><p><strong>Comment jouer :</strong> écrivez vos réponses avant la fin du chrono. Ensuite, tout le monde vote la validité des réponses des autres !</p><p><strong>Les points :</strong> 10 par mot accepté, 5 si un autre joueur a écrit le même. Mauvaise lettre = refusé automatiquement.</p>',
    min: 2, max: 4,
    hotseat: false, hidden: true, netOnly: true,

    create: function (names) {
      return {
        players: names.map(function (n) { return { name: n, score: 0 }; }),
        round: 0,
        maxRounds: ROUNDS,
        phase: 'intro', // intro → answers → vote → result → (intro…) → fin
        letter: '',
        used: [],
        cats: CATS,
        duration: DURATION,
        answers: {},   // playerIdx -> [6 réponses]
        submitted: [],
        votes: {},     // voterIdx -> {targetIdx: [bool x6]}
        voted: [],
        results: null,
        gains: null,
        finished: false
      };
    },

    turnOf: function () { return -1; }, // tout le monde joue en même temps
    over: function (state) { return state.finished; },
    scoreOf: function (state, i) { return state.players[i].score; },

    summary: function (state) {
      var rows = state.players.map(function (p) { return { n: p.name, s: p.score }; })
        .sort(function (a, b) { return b.s - a.s; });
      var top = rows.filter(function (r) { return r.s === rows[0].s; });
      return rows.map(function (r) {
        return '<div class="final-line"><span>' + GG.esc(r.n) + '</span><strong>' +
          r.s + ' pts</strong></div>';
      }).join('') + '<h1>🏆 ' + top.map(function (r) { return GG.esc(r.n); }).join(' & ') + '</h1>';
    },

    /* pendant l'écriture, les réponses des autres restent secrètes */
    redact: function (state, viewer) {
      var copy = GG.clone(state);
      if (copy.phase === 'answers') {
        var mine = copy.answers[viewer];
        copy.answers = {};
        if (mine) copy.answers[viewer] = mine;
      }
      // les votes de chacun restent secrets (seul le décompte final est public)
      var myVote = copy.votes[viewer];
      copy.votes = {};
      if (myVote) copy.votes[viewer] = myVote;
      return copy;
    },

    apply: function (state, player, action) {
      if (state.finished) return { ok: false, error: 'Partie terminée.' };

      if (action.t === 'start') {
        if (player !== 0) return { ok: false, error: 'Seul l’hôte lance la manche.' };
        if (state.phase !== 'intro' && state.phase !== 'result') {
          return { ok: false, error: 'Manche en cours.' };
        }
        if (state.phase === 'result' && state.round >= state.maxRounds) {
          state.finished = true;
          return { ok: true };
        }
        state.round++;
        var avail = LETTERS.split('').filter(function (l) {
          return state.used.indexOf(l) === -1;
        });
        state.letter = avail[Math.floor(Math.random() * avail.length)];
        state.used.push(state.letter);
        state.phase = 'answers';
        state.answers = {};
        state.submitted = state.players.map(function () { return false; });
        state.votes = {};
        state.voted = state.players.map(function () { return false; });
        state.results = null;
        state.gains = null;
        return { ok: true, timer: { ms: state.duration * 1000, action: { t: 'timeUp' } } };
      }

      if (action.t === 'answers') {
        // tolérance : une feuille qui arrive juste après le coup de sifflet
        // est acceptée tant que personne n'a commencé à voter
        var grace = state.phase === 'vote' && !state.submitted[player] &&
          state.voted.every(function (v) { return !v; });
        if (state.phase !== 'answers' && !grace) {
          return { ok: false, error: 'Le temps est écoulé.' };
        }
        var list = Array.isArray(action.list) ? action.list.slice(0, CATS.length) : [];
        state.answers[player] = list.map(function (a) { return String(a || '').slice(0, 30); });
        state.submitted[player] = true;
        if (state.submitted.every(Boolean)) {
          state.phase = 'vote';
        }
        return { ok: true };
      }

      if (action.t === 'timeUp') {
        if (player !== -1) return { ok: false, error: 'Action réservée au chrono.' };
        if (state.phase === 'answers') state.phase = 'vote';
        return { ok: true };
      }

      if (action.t === 'vote') {
        if (state.phase !== 'vote') return { ok: false, error: 'Pas de vote en cours.' };
        if (state.voted[player]) return { ok: false, error: 'Vous avez déjà voté.' };
        state.votes[player] = action.grid || {};
        state.voted[player] = true;
        if (state.voted.every(Boolean)) scoreRound(state);
        return { ok: true };
      }

      if (action.t === 'closeVote') {
        // filet de sécurité : un joueur ne vote pas (téléphone posé…) →
        // l'hôte clôt, les votes manquants valent « tout accepté »
        if (player !== 0) return { ok: false, error: 'Seul l’hôte peut clore le vote.' };
        if (state.phase !== 'vote') return { ok: false, error: 'Pas de vote en cours.' };
        scoreRound(state);
        return { ok: true };
      }

      return { ok: false, error: 'Action inconnue.' };
    },

    /* L'adversaire IA : remplit sa feuille depuis son petit lexique (sans
       jamais regarder celles des autres), puis vote la validité des réponses
       adverses. Il attend pendant les écrans qui appartiennent à l'hôte. */
    bot: function (state, me, ctx) {
      if (state.finished) return null;

      // ma feuille : pendant la manche, ou juste après le coup de sifflet
      // tant que personne n'a voté (la tolérance prévue par apply)
      var grace = state.phase === 'vote' && !state.submitted[me] &&
        state.voted.every(function (v) { return !v; });
      if ((state.phase === 'answers' && !state.submitted[me]) || grace) {
        return { t: 'answers', list: botSheet(state.letter) };
      }

      if (state.phase === 'vote' && !state.voted[me]) {
        // on laisse les feuilles en retard arriver avant de voter (voter
        // trop tôt fermerait la tolérance d'après-sifflet des autres)
        var toutRendu = state.submitted.every(Boolean);
        var voteLance = state.voted.some(Boolean);
        if (!toutRendu && !voteLance) return null;
        var grid = {};
        for (var p = 0; p < state.players.length; p++) {
          if (p === me) continue;
          var row = [];
          for (var c = 0; c < CATS.length; c++) {
            var ans = (state.answers[p] || [])[c] || '';
            if (autoInvalid(state, ans)) continue; // refus automatique, pas de vote
            row[c] = botJuge(ans, c, ctx);
          }
          grid[p] = row;
        }
        return { t: 'vote', grid: grid };
      }

      return null; // intro, résultats, ou rien à faire : on attend
    },

    render: function (el, ctx) {
      var s = ctx.state;
      var me = ctx.me;

      // Pendant la saisie, un rafraîchissement réseau ne doit pas effacer les champs
      if (s.phase === 'answers' && el._bacPhase === 'answers' &&
          !s.submitted[me] && el._bacMineSub === false) {
        return;
      }
      // Idem pendant le vote : mes coches ✔️/✗ ne doivent pas être remises à zéro
      if (s.phase === 'vote' && el._bacPhase === 'vote' && !s.voted[me] &&
          el._bacMineVoted === false) {
        return;
      }
      el._bacPhase = s.phase;
      el._bacMineSub = s.phase === 'answers' ? !!s.submitted[me] : null;
      el._bacMineVoted = s.phase === 'vote' ? !!s.voted[me] : null;

      var html = '';

      if (s.phase === 'intro') {
        html += '<h2 class="mini-center">📝 Petit Bac</h2>' +
          '<p class="mini-msg">Une lettre est tirée au sort, remplissez les 6 catégories en ' +
          s.duration + ' secondes. Les autres joueurs valident ensuite vos réponses.<br>' +
          'Réponse unique : 10 pts · en doublon : 5 pts.</p>';
        if (me === 0) {
          html += '<button class="btn big primary" data-a="start">Lancer la manche 1</button>';
        } else {
          html += '<p class="waiting">⏳ L’hôte va lancer la première manche…</p>';
        }
      } else if (s.phase === 'answers') {
        var sub = s.submitted[me];
        html += '<div class="bac-letter">' + s.letter + '</div>' +
          '<div class="bac-timer" id="bac-timer">' + s.duration + ' s</div>';
        s.cats.forEach(function (cat, c) {
          var val = (s.answers[me] || [])[c] || '';
          html += '<label class="bac-field">' + cat +
            '<input type="text" data-cat="' + c + '" maxlength="30" autocomplete="off" ' +
            'placeholder="' + s.letter + '…" value="' + GG.esc(val) + '"' +
            (sub ? ' disabled' : '') + '></label>';
        });
        html += '<button class="btn big primary" data-a="send"' + (sub ? ' disabled' : '') + '>' +
          (sub ? '⏳ En attente des autres…' : '✔️ J’ai fini !') + '</button>';
      } else if (s.phase === 'vote') {
        html += '<p class="mini-msg">Lettre <strong>' + s.letter +
          '</strong> — validez (ou refusez) les réponses des autres :</p>';
        if (s.voted[me]) {
          html += '<p class="waiting">⏳ En attente des votes des autres…</p>';
          if (me === 0) {
            html += '<button class="btn" data-a="closevote">⏱️ Clore le vote ' +
              '(les votes manquants valent « tout accepté »)</button>';
          }
        } else {
          s.players.forEach(function (p, pi) {
            if (pi === me) return;
            html += '<h3 class="bac-owner">' + GG.esc(p.name) + '</h3>';
            s.cats.forEach(function (cat, c) {
              var ans = (s.answers[pi] || [])[c] || '';
              var bad = autoInvalid(s, ans);
              html += '<div class="bac-vote-row' + (bad ? ' auto-bad' : '') + '">' +
                '<span class="bac-cat">' + cat + '</span>' +
                '<span class="bac-ans">' + (ans ? GG.esc(ans) : '—') + '</span>' +
                (bad ? '<span class="bac-flag">✗ auto</span>'
                     : '<button class="bac-toggle yes" data-p="' + pi + '" data-c="' + c + '">✔️</button>') +
                '</div>';
            });
          });
          html += '<p class="hint">Touchez ✔️ pour refuser une réponse (mot inventé, hors sujet…).</p>' +
            '<button class="btn big primary" data-a="vote">Envoyer mes votes</button>';
        }
      } else if (s.phase === 'result') {
        html += '<p class="mini-msg">Résultats de la manche ' + s.round + ' (lettre ' + s.letter + ') :</p>';
        s.players.forEach(function (p, pi) {
          html += '<h3 class="bac-owner">' + GG.esc(p.name) + ' — +' + s.gains[pi] + ' pts</h3>';
          s.cats.forEach(function (cat, c) {
            var r = (s.results[pi] || [])[c] || { ans: '', pts: 0, why: 'invalide' };
            html += '<div class="bac-vote-row">' +
              '<span class="bac-cat">' + cat + '</span>' +
              '<span class="bac-ans">' + (r.ans ? GG.esc(r.ans) : '—') + '</span>' +
              '<span class="bac-flag">' + (r.pts ? '+' + r.pts : '✗') + '</span></div>';
          });
        });
        if (me === 0) {
          html += '<button class="btn big primary" data-a="start">' +
            (s.round >= s.maxRounds ? 'Voir le classement final' : 'Manche suivante') + '</button>';
        } else {
          html += '<p class="waiting">⏳ L’hôte va lancer la suite…</p>';
        }
      }

      el.innerHTML = html;

      var start = el.querySelector('[data-a="start"]');
      if (start) start.addEventListener('click', function () { ctx.act({ t: 'start' }); });

      var send = el.querySelector('[data-a="send"]');
      if (send) send.addEventListener('click', function () {
        var list = [];
        el.querySelectorAll('input[data-cat]').forEach(function (inp) {
          list[parseInt(inp.dataset.cat, 10)] = inp.value;
        });
        ctx.act({ t: 'answers', list: list });
      });

      el.querySelectorAll('.bac-toggle').forEach(function (b) {
        b.addEventListener('click', function () {
          b.classList.toggle('yes');
          b.classList.toggle('no');
          b.textContent = b.classList.contains('yes') ? '✔️' : '✗';
        });
      });
      var cv = el.querySelector('[data-a="closevote"]');
      if (cv) cv.addEventListener('click', function () { ctx.act({ t: 'closeVote' }); });
      var vote = el.querySelector('[data-a="vote"]');
      if (vote) vote.addEventListener('click', function () {
        var grid = {};
        el.querySelectorAll('.bac-toggle').forEach(function (b) {
          var pi = b.dataset.p, c = parseInt(b.dataset.c, 10);
          if (!grid[pi]) grid[pi] = [];
          grid[pi][c] = b.classList.contains('yes');
        });
        ctx.act({ t: 'vote', grid: grid });
      });

      // compte à rebours local (informatif : la coupure officielle vient de l'hôte)
      if (s.phase === 'answers' && !s.submitted[me]) {
        var timerEl = el.querySelector('#bac-timer');
        if (timerEl && !el._bacTimer) {
          var left = s.duration;
          el._bacTimer = setInterval(function () {
            left--;
            if (left <= 1 && document.body.contains(timerEl)) {
              // le temps est écoulé : on envoie ce qui est écrit, rien ne se perd
              var sendBtn = el.querySelector('[data-a="send"]');
              if (sendBtn && !sendBtn.disabled) sendBtn.click();
            }
            if (left <= 0 || !document.body.contains(timerEl)) {
              clearInterval(el._bacTimer);
              el._bacTimer = null;
              return;
            }
            timerEl.textContent = left + ' s';
            if (left <= 10) timerEl.classList.add('urgent');
          }, 1000);
        }
      }
    }
  };

  GG.register(mod);
  if (typeof module === 'object' && module.exports) module.exports = mod;
})(typeof self !== 'undefined' ? self : globalThis);
