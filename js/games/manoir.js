/*
 * GGgames — Le Manoir (enquête collaborative, 1 à 12 joueurs).
 * Un crime a été commis : coupable, arme et lieu sont tirés au sort.
 * L'équipe résout des énigmes pour débloquer des déductions, remplit son
 * carnet, puis porte l'accusation finale (2 tentatives).
 */
(function (root) {
  'use strict';
  var GG = root.GG;

  var SUSPECTS = [
    { id: 'safran', nom: 'Colonel Safran', ini: 'CS', teinte: 45 },
    { id: 'amethyste', nom: 'Baronne Améthyste', ini: 'BA', teinte: 275 },
    { id: 'celadon', nom: 'Docteur Céladon', ini: 'DC', teinte: 150 },
    { id: 'garance', nom: 'Madame Garance', ini: 'MG', teinte: 0 },
    { id: 'cobalt', nom: 'Professeur Cobalt', ini: 'PC', teinte: 215 }
  ];
  var ARMES = [
    { id: 'chandelier', nom: 'Le chandelier d’argent', icone: '🕯️' },
    { id: 'dague', nom: 'La dague orientale', icone: '🗡️' },
    { id: 'fiole', nom: 'La fiole de poison', icone: '🧪' },
    { id: 'cordon', nom: 'Le cordon de soie', icone: '🪢' },
    { id: 'statuette', nom: 'La statuette de bronze', icone: '🗿' }
  ];
  var LIEUX = [
    { id: 'bibliotheque', nom: 'La bibliothèque', dans: 'dans la bibliothèque', icone: '📚' },
    { id: 'serre', nom: 'La serre tropicale', dans: 'dans la serre', icone: '🌿' },
    { id: 'cave', nom: 'La cave à vin', dans: 'dans la cave à vin', icone: '🍷' },
    { id: 'bal', nom: 'La salle de bal', dans: 'dans la salle de bal', icone: '💃' },
    { id: 'bureau', nom: 'Le bureau de Lord Edmond', dans: 'dans le bureau', icone: '🖋️' }
  ];
  var PISTES = [
    { id: 'coffre', nom: 'Le coffre-fort', icone: '🗝️', desc: 'Un coffre verrouillé, dissimulé derrière un tableau.' },
    { id: 'lettre', nom: 'La lettre déchirée', icone: '✉️', desc: 'Des fragments de papier retrouvés dans la cheminée.' },
    { id: 'journal', nom: 'Le journal intime', icone: '📔', desc: 'Le journal de Lord Edmond, fermé par un code.' },
    { id: 'majordome', nom: 'Le majordome', icone: '🎩', desc: 'Il parlera… si vous prouvez votre esprit.' },
    { id: 'gardien', nom: 'Le carnet du gardien', icone: '🏮', desc: 'Ses notes de ronde, écrites à sa manière.' },
    { id: 'malle', nom: 'La malle de l’observatoire', icone: '🧳', desc: 'Une malle sanglée, montée du grenier.' }
  ];
  var ALIBIS = [
    'faisait une réussite aux cartes sous les yeux de deux invités',
    'téléphonait à Paris depuis le hall, le standard le confirme',
    'était déjà couché(e), la gouvernante détient la clé de la chambre',
    'a joué du piano jusqu’à minuit, tout le manoir l’a entendu'
  ];

  var ENIGMES = [
    { q: 'Je commence la nuit et je termine le matin. On me trouve deux fois dans l’année. Qui suis-je ?', a: ['N'], hint: 'Ce n’est pas une chose… c’est une lettre.' },
    { q: 'Pleine de trous, je retiens pourtant l’eau. Qui suis-je ?', a: ['EPONGE', 'LEPONGE', 'UNEEPONGE'], hint: 'On me trouve près de l’évier.' },
    { q: 'Je disparais dès qu’on prononce mon nom. Qui suis-je ?', a: ['SILENCE', 'LESILENCE'], hint: 'Chut…' },
    { q: 'Plus tu avances vers moi, plus je m’éloigne. Qui suis-je ?', a: ['HORIZON', 'LHORIZON'], hint: 'Regarde au loin, là où le ciel touche la terre.' },
    { q: 'Grande à ma naissance, je rapetisse toute ma vie en pleurant des larmes brûlantes. Qui suis-je ?', a: ['BOUGIE', 'LABOUGIE', 'UNEBOUGIE', 'CHANDELLE', 'LACHANDELLE'], hint: 'Je vous éclaire ce soir même…' },
    { q: 'Je te suis partout en silence quand le soleil brille, et je disparais dans le noir. Qui suis-je ?', a: ['OMBRE', 'LOMBRE', 'MONOMBRE', 'TONOMBRE'], hint: 'Le soleil me dessine à tes pieds.' },
    { q: 'Tu me regardes : je te regarde. Tu me souris : je te souris. Sans toi, je ne montre rien. Qui suis-je ?', a: ['MIROIR', 'LEMIROIR', 'UNMIROIR', 'REFLET', 'LEREFLET'], hint: 'Accroché au mur, au-dessus de la commode.' },
    { q: 'J’ai des touches noires et blanches, mais je n’ouvre aucune porte. Qui suis-je ?', a: ['PIANO', 'LEPIANO', 'UNPIANO'], hint: 'On joue de moi dans les salons.' },
    { q: 'J’ai des aiguilles mais je ne couds jamais. Qui suis-je ?', a: ['HORLOGE', 'LHORLOGE', 'MONTRE', 'LAMONTRE', 'UNEMONTRE', 'PENDULE', 'LAPENDULE'], hint: 'Je rythme vos journées, tic… tac…' },
    { q: 'On me monte et on me descend sans que je bouge jamais. Qui suis-je ?', a: ['ESCALIER', 'LESCALIER', 'ESCALIERS', 'LESESCALIERS', 'UNESCALIER'], hint: 'Marche après marche…' },
    { q: 'Je voyage à travers le monde entier sans jamais quitter mon coin. Qui suis-je ?', a: ['TIMBRE', 'LETIMBRE', 'UNTIMBRE'], hint: 'Collé en haut à droite de l’enveloppe.' },
    { q: 'J’ai un lit mais je ne dors jamais, une embouchure mais je ne parle pas. Qui suis-je ?', a: ['RIVIERE', 'LARIVIERE', 'UNERIVIERE', 'FLEUVE', 'LEFLEUVE', 'UNFLEUVE'], hint: 'Je coule vers la mer.' },
    { q: 'Sans bras et sans mains, je peux pourtant coucher un arbre. Qui suis-je ?', a: ['VENT', 'LEVENT'], hint: 'On m’entend souffler sous les portes.' },
    { q: 'Charade — Mon premier est un métal précieux. Mon second est un habitant du ciel. Mon tout est un fruit.', a: ['ORANGE', 'LORANGE', 'UNEORANGE'], hint: 'Le métal : OR…' },
    { q: 'Charade — Mon premier ronronne au coin du feu. Mon second recouvre tout le corps. Mon tout se porte sur la tête.', a: ['CHAPEAU', 'LECHAPEAU', 'UNCHAPEAU'], hint: 'CHAT + …' },
    { q: 'Suite logique : 2, 4, 8, 16, … ?', a: ['32', 'TRENTEDEUX'], hint: 'Chaque nombre est le double du précédent.' },
    { q: 'Suite logique : 1, 1, 2, 3, 5, 8, … ?', a: ['13', 'TREIZE'], hint: 'Additionnez les deux derniers nombres.' },
    { q: 'Message chiffré — chaque lettre a avancé d’un pas dans l’alphabet. Décodez : DPGGSF', a: ['COFFRE', 'LECOFFRE'], hint: 'D devient C, P devient O…' },
    { q: 'Le cadenas attend un mot : 3 – 12 – 5. Chaque nombre est le rang d’une lettre dans l’alphabet.', a: ['CLE', 'CLEF', 'LACLE', 'LACLEF'], hint: 'A=1, B=2, C=3…' },
    { q: 'Le double de mon tiers est égal à 6. Quel nombre suis-je ?', a: ['9', 'NEUF'], hint: 'Cherchez x tel que 2 × (x ÷ 3) = 6.' },
    { q: 'Un escargot grimpe un puits de 10 mètres : 3 mètres le jour, 2 mètres perdus chaque nuit. En combien de jours sort-il ?', a: ['8', 'HUIT', '8JOURS', 'HUITJOURS'], hint: 'Le dernier jour, il sort avant de glisser.' },
    { q: 'Anagramme — Remettez les lettres de CHIEN dans l’ordre pour trouver où il dort.', a: ['NICHE', 'LANICHE', 'UNENICHE'], hint: 'Dans le jardin, près de la grille.' },
    { q: 'Anagramme — Les lettres du mot IMAGE cachent un pouvoir mystérieux.', a: ['MAGIE', 'LAMAGIE'], hint: 'Abracadabra…' },
    { q: 'Plus je sèche, plus je suis mouillée. Qui suis-je ?', a: ['SERVIETTE', 'LASERVIETTE', 'UNESERVIETTE'], hint: 'Après le bain…' },
    { q: 'J’ai des dents mais je ne mords jamais. Qui suis-je ?', a: ['PEIGNE', 'LEPEIGNE', 'UNPEIGNE', 'SCIE', 'LASCIE', 'UNESCIE', 'FOURCHETTE', 'LAFOURCHETTE', 'RATEAU', 'LERATEAU', 'UNRATEAU'], hint: 'Je démêle les cheveux.' },
    { q: 'Je traverse les fenêtres sans jamais les briser. Qui suis-je ?', a: ['LUMIERE', 'LALUMIERE', 'SOLEIL', 'LESOLEIL', 'JOUR', 'LEJOUR'], hint: 'Chaque matin, j’entre dans la chambre.' },
    { q: 'Le père de Nathalie a cinq filles : Nana, Néné, Nini, Nono et… ?', a: ['NATHALIE'], hint: 'Relisez le tout début de l’énigme.' },
    { q: 'Qu’est-ce qui monte quand la pluie tombe ?', a: ['PARAPLUIE', 'LEPARAPLUIE', 'UNPARAPLUIE', 'LESPARAPLUIES', 'PARAPLUIES'], hint: 'On l’ouvre au-dessus de sa tête.' }
  ];

  function norm(s) {
    return String(s || '').toUpperCase()
      .replace(/Œ/g, 'OE').replace(/Æ/g, 'AE')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Z0-9]/g, '');
  }

  function byId(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function buildCase(state) {
    state.solution = {
      suspect: SUSPECTS[Math.floor(Math.random() * SUSPECTS.length)].id,
      arme: ARMES[Math.floor(Math.random() * ARMES.length)].id,
      lieu: LIEUX[Math.floor(Math.random() * LIEUX.length)].id
    };
    // 12 déductions (tout sauf la solution), réparties 2 par piste
    var alibis = GG.shuffle(ALIBIS.slice());
    var deds = [];
    SUSPECTS.forEach(function (s, k) {
      if (s.id === state.solution.suspect) return;
      var alibi = alibis[deds.length % alibis.length];
      deds.push({ kind: 'suspect', id: s.id,
        text: '👤 ' + s.nom + ' ' + alibi + '. <strong>Hors de cause.</strong>' });
    });
    ARMES.forEach(function (a) {
      if (a.id === state.solution.arme) return;
      deds.push({ kind: 'arme', id: a.id,
        text: a.icone + ' ' + a.nom + ' : poussière intacte, aucune empreinte. <strong>Ce n’est pas l’arme du crime.</strong>' });
    });
    LIEUX.forEach(function (l) {
      if (l.id === state.solution.lieu) return;
      deds.push({ kind: 'lieu', id: l.id,
        text: l.icone + ' Aucune trace de lutte ' + l.dans + '. <strong>Le crime n’a pas eu lieu là.</strong>' });
    });
    GG.shuffle(deds);
    var enigmes = GG.shuffle(ENIGMES.slice()).slice(0, PISTES.length);
    state.pistes = PISTES.map(function (p, i) {
      return {
        id: p.id, nom: p.nom, icone: p.icone, desc: p.desc,
        q: enigmes[i].q, hint: enigmes[i].hint, answers: enigmes[i].a,
        solved: false, hintShown: false,
        deductions: deds.slice(i * 2, i * 2 + 2)
      };
    });
    state.eliminated = [];      // [{kind, id, text}] révélées
    state.phase = 'brief';
    state.tries = 2;
    state.wrongAnswers = 0;
    state.hintsUsed = 0;
    state.startTs = 0;
    state.durationSec = 0;
    state.won = false;
    state.lastAccuser = '';
    state.caseId = Math.floor(Math.random() * 1e9); // remet l'affichage à zéro
  }

  /* --------- état d'affichage local (par téléphone, jamais partagé) --------- */
  var view = { caseId: -1, mode: 'pistes', piste: -1 };
  function syncView(state) {
    if (view.caseId !== state.caseId) {
      view = { caseId: state.caseId, mode: 'pistes', piste: -1 };
    }
  }

  var mod = {
    id: 'manoir',
    nom: 'Le Manoir',
    icone: '🕵️',
    desc: 'Enquête collaborative : résolvez les énigmes, remplissez le carnet, démasquez le coupable. Jusqu’à 12 joueurs !',
    min: 1, max: 12,
    hotseat: true, hidden: false, netOnly: false,
    noBadges: true,

    create: function (names) {
      var state = { players: names.map(function (n) { return { name: n }; }) };
      buildCase(state);
      return state;
    },

    turnOf: function () { return -1; }, // tout le monde enquête en même temps
    over: function () { return false; }, // fins gérées par le jeu (écran dédié)
    scoreOf: function () { return ''; },
    summary: function () { return ''; },

    /* la solution et les réponses des énigmes ne quittent jamais le serveur */
    redact: function (state) {
      var copy = GG.clone(state);
      if (copy.phase !== 'end') delete copy.solution;
      copy.pistes.forEach(function (p) {
        delete p.answers;
        if (!p.solved) delete p.deductions;
      });
      return copy;
    },

    apply: function (state, player, action, ctx) {
      if (action.t === 'start') {
        if (state.phase !== 'brief') return { ok: false, error: 'L’enquête a déjà commencé.' };
        if (player !== 0) return { ok: false, error: 'L’hôte lance l’enquête.' };
        state.phase = 'play';
        state.startTs = Date.now();
        return { ok: true };
      }
      if (action.t === 'again') {
        if (state.phase !== 'end') return { ok: false, error: 'L’enquête n’est pas finie.' };
        if (player !== 0) return { ok: false, error: 'L’hôte relance une affaire.' };
        buildCase(state);
        return { ok: true };
      }
      if (state.phase !== 'play') return { ok: false, error: 'L’enquête n’est pas en cours.' };

      if (action.t === 'answer') {
        var p = state.pistes[action.piste | 0];
        if (!p) return { ok: false, error: 'Piste inconnue.' };
        if (p.solved) return { ok: false, error: 'Piste déjà élucidée.' };
        var given = norm(action.text);
        if (!given) return { ok: false, error: 'Écrivez une réponse.' };
        if (p.answers.indexOf(given) !== -1) {
          p.solved = true;
          p.solvedBy = state.players[player] ? state.players[player].name : '';
          p.deductions.forEach(function (d) { state.eliminated.push(d); });
        } else {
          state.wrongAnswers++;
          p.lastWrong = String(action.text).slice(0, 30);
        }
        return { ok: true };
      }

      if (action.t === 'hint') {
        var ph = state.pistes[action.piste | 0];
        if (!ph || ph.solved) return { ok: false, error: 'Piste indisponible.' };
        if (!ph.hintShown) {
          ph.hintShown = true;
          state.hintsUsed++;
        }
        return { ok: true };
      }

      if (action.t === 'accuse') {
        var s = state.solution;
        state.lastAccuser = state.players[player] ? state.players[player].name : '';
        if (action.suspect === s.suspect && action.arme === s.arme && action.lieu === s.lieu) {
          state.won = true;
          state.phase = 'end';
          state.durationSec = state.startTs ? Math.round((Date.now() - state.startTs) / 1000) : 0;
        } else {
          state.tries--;
          state.accuseFailed = {
            suspect: action.suspect, arme: action.arme, lieu: action.lieu
          };
          if (state.tries <= 0) {
            state.won = false;
            state.phase = 'end';
            state.durationSec = state.startTs ? Math.round((Date.now() - state.startTs) / 1000) : 0;
          }
        }
        return { ok: true };
      }

      return { ok: false, error: 'Action inconnue.' };
    },

    render: function (el, ctx) {
      var s = ctx.state;
      syncView(s);
      var solvedCount = s.pistes.filter(function (p) { return p.solved; }).length;

      function portrait(sus, small, dead) {
        return '<span class="mn-portrait' + (small ? ' small' : '') + (dead ? ' dead' : '') +
          '" style="--h:' + sus.teinte + '">' + sus.ini + '</span>';
      }

      function stars() {
        var n = 3;
        if (s.tries < 2) n--;
        if (s.hintsUsed >= 3) n--;
        if (s.wrongAnswers >= 6) n--;
        if (n < 1) n = 1;
        return '⭐'.repeat(n) + '☆'.repeat(3 - n);
      }

      var html = '<div class="mn">';

      /* ---------- lettre d'introduction ---------- */
      if (s.phase === 'brief') {
        html += '<div class="mn-candle"></div>' +
          '<h2 class="mn-title">LE MANOIR</h2>' +
          '<div class="mn-letter">' +
          '<p><em>Manoir Voltaire, minuit passé.</em></p>' +
          '<p>L’orage a coupé les routes. Lord Edmond vient d’être retrouvé sans vie, ' +
          'et le coupable est <strong>encore parmi nous</strong>.</p>' +
          '<p>Cinq suspects. Cinq armes possibles. Cinq pièces où le drame a pu se jouer. ' +
          'Six pistes verrouillées par des énigmes vous attendent : élucidez-les ' +
          '<strong>ensemble</strong>, remplissez votre carnet, et démasquez l’assassin ' +
          'avant l’aube.</p>' +
          '<p class="mn-warn">⚠️ Vous n’aurez droit qu’à deux accusations.</p>' +
          '</div>' +
          '<div class="mn-cast">' + SUSPECTS.map(function (x) {
            return '<div class="mn-cast-one">' + portrait(x) +
              '<span>' + GG.esc(x.nom) + '</span></div>';
          }).join('') + '</div>';
        if (ctx.me === 0) {
          html += '<button class="btn big mn-gold" data-a="start">🔎 Commencer l’enquête</button>';
        } else {
          html += '<p class="mn-dim">⏳ L’hôte va ouvrir l’enquête…</p>';
        }
        html += '</div>';
        el.innerHTML = html;
        bind();
        return;
      }

      /* ---------- écran final ---------- */
      if (s.phase === 'end') {
        var sus = byId(SUSPECTS, s.solution.suspect);
        var arm = byId(ARMES, s.solution.arme);
        var lie = byId(LIEUX, s.solution.lieu);
        html += '<div class="mn-candle"></div>' +
          '<h2 class="mn-title">' + (s.won ? 'AFFAIRE RÉSOLUE' : 'L’ASSASSIN S’ÉCHAPPE…') + '</h2>' +
          '<div class="mn-reveal ' + (s.won ? 'won' : 'lost') + '">' +
          '<div class="mn-reveal-portrait">' + portrait(sus) + '</div>' +
          '<p>C’était <strong>' + GG.esc(sus.nom) + '</strong>,<br>avec ' +
          '<strong>' + arm.nom.toLowerCase() + '</strong> ' + arm.icone + ',<br>' +
          '<strong>' + lie.dans + '</strong> ' + lie.icone + '.</p>' +
          (s.won
            ? '<p class="mn-gold-text">' + (s.lastAccuser ? GG.esc(s.lastAccuser) + ' a porté le coup de grâce. ' : '') +
              'Bravo, l’équipe a résolu l’affaire !</p>'
            : '<p class="mn-dim">Les deux accusations ont échoué. Il a filé dans la nuit.</p>') +
          '</div>' +
          '<div class="mn-stats">' +
          (s.won ? '<div class="mn-stars">' + stars() + '</div>' : '') +
          '<div>⏱️ ' + Math.floor(s.durationSec / 60) + ' min ' + (s.durationSec % 60) + ' s' +
          ' · 🧩 ' + solvedCount + '/6 pistes · ❌ ' + s.wrongAnswers + ' erreurs · 💡 ' +
          s.hintsUsed + ' indices</div></div>';
        if (ctx.me === 0) {
          html += '<button class="btn big mn-gold" data-a="again">🔁 Nouvelle affaire</button>';
        } else {
          html += '<p class="mn-dim">L’hôte peut relancer une nouvelle affaire.</p>';
        }
        html += '</div>';
        el.innerHTML = html;
        bind();
        return;
      }

      /* ---------- enquête en cours ---------- */
      var remaining = {
        suspect: SUSPECTS.length, arme: ARMES.length, lieu: LIEUX.length
      };
      var elimSet = {};
      s.eliminated.forEach(function (d) {
        elimSet[d.kind + ':' + d.id] = true;
        if (d.kind === 'suspect') remaining.suspect--;
        if (d.kind === 'arme') remaining.arme--;
        if (d.kind === 'lieu') remaining.lieu--;
      });

      html += '<div class="mn-top"><div class="mn-candle small"></div>' +
        '<div class="mn-top-mid"><div class="mn-title-s">LE MANOIR</div>' +
        '<div class="mn-progress">🧩 ' + solvedCount + '/6 · ' +
        '🫵 ' + '❤️'.repeat(s.tries) + '🖤'.repeat(2 - s.tries) + '</div></div>' +
        '<div class="mn-team">👥 ' + s.players.length + '</div></div>';

      if (s.accuseFailed && s.tries === 1 && view.mode !== 'accuse') {
        var fs = byId(SUSPECTS, s.accuseFailed.suspect);
        html += '<div class="mn-alarm">🚨 Accusation erronée' +
          (fs ? ' contre ' + GG.esc(fs.nom) : '') +
          ' ! Il ne vous reste qu’<strong>une seule tentative</strong>.</div>';
      }

      if (view.mode === 'enigme' && s.pistes[view.piste]) {
        var p = s.pistes[view.piste];
        html += '<button class="mn-back" data-a="back">← Retour aux pistes</button>';
        if (p.solved) {
          html += '<div class="mn-clue-cards">' +
            '<h3 class="mn-h3">' + p.icone + ' ' + GG.esc(p.nom) + ' — élucidé' +
            (p.solvedBy ? ' par ' + GG.esc(p.solvedBy) : '') + '</h3>' +
            p.deductions.map(function (d) {
              return '<div class="mn-clue">' + d.text + '</div>';
            }).join('') + '</div>';
        } else {
          html += '<div class="mn-enigme">' +
            '<h3 class="mn-h3">' + p.icone + ' ' + GG.esc(p.nom) + '</h3>' +
            '<p class="mn-dim">' + GG.esc(p.desc) + '</p>' +
            '<div class="mn-parchment">' + GG.esc(p.q) + '</div>' +
            (p.hintShown ? '<p class="mn-hint">💡 ' + GG.esc(p.hint) + '</p>' : '') +
            (p.lastWrong ? '<p class="mn-wrong">« ' + GG.esc(p.lastWrong) + ' » n’a rien ouvert…</p>' : '') +
            '<div class="mn-answer-row">' +
            '<input type="text" id="mn-answer" maxlength="30" placeholder="Votre réponse…" autocomplete="off">' +
            '<button class="btn mn-gold" data-a="answer">Proposer</button></div>' +
            (p.hintShown ? '' :
              '<button class="btn link mn-hint-btn" data-a="hint">💡 Demander un indice (coûte une étoile au-delà de 2)</button>') +
            '</div>';
        }
      } else if (view.mode === 'accuse') {
        html += '<button class="mn-back" data-a="back">← Retour aux pistes</button>' +
          '<h3 class="mn-h3 mn-center">🫵 L’accusation</h3>' +
          '<p class="mn-dim mn-center">Il vous reste <strong>' + s.tries +
          '</strong> tentative' + (s.tries > 1 ? 's' : '') + '. Discutez-en avant de valider !</p>';
        [['suspect', SUSPECTS, 'Le coupable'], ['arme', ARMES, 'L’arme'], ['lieu', LIEUX, 'Le lieu']]
          .forEach(function (grp) {
            html += '<p class="mn-grp">' + grp[2] + '</p><div class="mn-pick" data-grp="' + grp[0] + '">';
            grp[1].forEach(function (it) {
              var out = elimSet[grp[0] + ':' + it.id];
              html += '<button class="mn-opt' + (out ? ' out' : '') + '" data-id="' + it.id + '">' +
                (grp[0] === 'suspect' ? portrait(it, true, out) : '<span class="mn-opt-ic">' + it.icone + '</span>') +
                '<span>' + GG.esc(it.nom) + '</span></button>';
            });
            html += '</div>';
          });
        html += '<button class="btn big mn-danger" data-a="accuse" disabled>⚖️ Porter l’accusation</button>';
      } else {
        // grille des pistes
        html += '<div class="mn-pistes">' + s.pistes.map(function (p, i) {
          return '<button class="mn-piste' + (p.solved ? ' solved' : '') + '" data-piste="' + i + '">' +
            '<span class="mn-piste-ic">' + p.icone + '</span>' +
            '<span class="mn-piste-nom">' + GG.esc(p.nom) + '</span>' +
            '<span class="mn-piste-etat">' + (p.solved ? '✓ élucidé' : '🔒 énigme') + '</span>' +
            '</button>';
        }).join('') + '</div>';

        // carnet de déduction
        html += '<h3 class="mn-h3">📓 Carnet de déduction</h3><div class="mn-carnet">';
        [['suspect', SUSPECTS], ['arme', ARMES], ['lieu', LIEUX]].forEach(function (grp) {
          html += '<div class="mn-col">';
          grp[1].forEach(function (it) {
            var out = elimSet[grp[0] + ':' + it.id];
            html += '<div class="mn-item' + (out ? ' out' : '') + '">' +
              (grp[0] === 'suspect' ? portrait(it, true, out) : '<span class="mn-opt-ic">' + it.icone + '</span>') +
              '<span>' + GG.esc(it.nom) + '</span>' +
              '<span class="mn-mark">' + (out ? '✗' : '?') + '</span></div>';
          });
          html += '</div>';
        });
        html += '</div>';
        var certain = remaining.suspect === 1 && remaining.arme === 1 && remaining.lieu === 1;
        html += '<button class="btn big ' + (certain ? 'mn-gold' : 'mn-danger') +
          '" data-a="goaccuse">🫵 Accuser' +
          (certain ? ' — le carnet est formel !' : ' (' + s.tries + ' tentative' + (s.tries > 1 ? 's' : '') + ')') +
          '</button>';
        if (s.eliminated.length) {
          html += '<h3 class="mn-h3">🗂️ Indices récoltés</h3><div class="mn-clue-cards">' +
            s.eliminated.map(function (d) {
              return '<div class="mn-clue">' + d.text + '</div>';
            }).join('') + '</div>';
        }
      }
      html += '</div>';
      el.innerHTML = html;
      bind();

      function bind() {
        var b;
        b = el.querySelector('[data-a="start"]');
        if (b) b.addEventListener('click', function () { ctx.act({ t: 'start' }); });
        b = el.querySelector('[data-a="again"]');
        if (b) b.addEventListener('click', function () { ctx.act({ t: 'again' }); });
        b = el.querySelector('[data-a="back"]');
        if (b) b.addEventListener('click', function () {
          view.mode = 'pistes'; view.piste = -1; mod.render(el, ctx);
        });
        el.querySelectorAll('.mn-piste').forEach(function (t) {
          t.addEventListener('click', function () {
            view.mode = 'enigme';
            view.piste = parseInt(t.dataset.piste, 10);
            mod.render(el, ctx);
          });
        });
        b = el.querySelector('[data-a="goaccuse"]');
        if (b) b.addEventListener('click', function () {
          view.mode = 'accuse'; mod.render(el, ctx);
        });
        b = el.querySelector('[data-a="hint"]');
        if (b) b.addEventListener('click', function () {
          ctx.act({ t: 'hint', piste: view.piste });
        });
        b = el.querySelector('[data-a="answer"]');
        if (b) {
          var send = function () {
            var input = el.querySelector('#mn-answer');
            if (input && input.value.trim()) {
              ctx.act({ t: 'answer', piste: view.piste, text: input.value });
            }
          };
          b.addEventListener('click', send);
          var inp = el.querySelector('#mn-answer');
          if (inp) inp.addEventListener('keydown', function (ev) {
            if (ev.key === 'Enter') send();
          });
        }
        // sélection de l'accusation
        var chosen = { suspect: null, arme: null, lieu: null };
        el.querySelectorAll('.mn-pick').forEach(function (pick) {
          pick.querySelectorAll('.mn-opt').forEach(function (opt) {
            opt.addEventListener('click', function () {
              pick.querySelectorAll('.mn-opt').forEach(function (o) {
                o.classList.toggle('sel', o === opt);
              });
              chosen[pick.dataset.grp] = opt.dataset.id;
              var ready = chosen.suspect && chosen.arme && chosen.lieu;
              el.querySelector('[data-a="accuse"]').disabled = !ready;
            });
          });
        });
        b = el.querySelector('[data-a="accuse"]');
        if (b) b.addEventListener('click', function () {
          if (chosen.suspect && chosen.arme && chosen.lieu) {
            view.mode = 'pistes';
            ctx.act({ t: 'accuse', suspect: chosen.suspect, arme: chosen.arme, lieu: chosen.lieu });
          }
        });
      }
    },

    _ENIGMES: ENIGMES, _SUSPECTS: SUSPECTS, _ARMES: ARMES, _LIEUX: LIEUX, _norm: norm
  };

  GG.register(mod);
  if (typeof module === 'object' && module.exports) module.exports = mod;
})(typeof self !== 'undefined' ? self : globalThis);
