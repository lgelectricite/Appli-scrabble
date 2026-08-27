/*
 * GGgames — L'Imposteur (3 à 12 joueurs).
 * Tout le monde reçoit le même mot secret… sauf le ou les imposteurs, qui
 * reçoivent un mot voisin. Personne ne sait dans quel camp il est !
 * À chaque tour : chaque joueur écrit un indice dans l'appli, puis un
 * vote pour éliminer un suspect. Les civils gagnent en éliminant tous les
 * imposteurs ; les imposteurs gagnent s'ils égalent le nombre de civils.
 */
(function (root) {
  'use strict';
  var GG = root.GG;

  /* paires de mots voisins : [mot des civils | mot de l'imposteur] (sens tiré au sort) */
  var PAIRS = [
    'CAFÉ|THÉ', 'PIZZA|QUICHE', 'FRITES|CHIPS',
    'POMME|POIRE', 'FRAISE|FRAMBOISE', 'PAIN|BRIOCHE',
    'MIEL|CONFITURE', 'GLACE|SORBET', 'CRÊPE|GAUFRE',
    'SOUPE|PURÉE', 'RIZ|PÂTES', 'MOUTARDE|MAYONNAISE',
    'SEL|POIVRE', 'CHOCOLAT|CARAMEL', 'FROMAGE|YAOURT',
    'JUS D’ORANGE|LIMONADE', 'BANANE|ANANAS', 'CITRON|ORANGE',
    'TOMATE|POIVRON', 'CAROTTE|NAVET', 'SALADE|ÉPINARD',
    'CHAMPIGNON|TRUFFE', 'POULET|DINDE', 'JAMBON|SAUCISSON',
    'SAUMON|THON', 'HUÎTRE|MOULE', 'GÂTEAU|TARTE',
    'BONBON|CHEWING-GUM', 'CIDRE|CHAMPAGNE', 'CHAT|CHIEN',
    'LION|TIGRE', 'LOUP|RENARD', 'ABEILLE|GUÊPE',
    'CANARD|OIE', 'CHEVAL|ÂNE', 'MOUTON|CHÈVRE',
    'LAPIN|LIÈVRE', 'PIGEON|MOUETTE', 'REQUIN|DAUPHIN',
    'AIGLE|FAUCON', 'PAPILLON|LIBELLULE', 'ESCARGOT|LIMACE',
    'CROCODILE|ALLIGATOR', 'HAMSTER|SOURIS', 'VACHE|TAUREAU',
    'COCHON|SANGLIER', 'OURS|PANDA', 'SINGE|GORILLE',
    'ZÈBRE|GAZELLE', 'ÉLÉPHANT|RHINOCÉROS', 'SERPENT|LÉZARD',
    'GRENOUILLE|CRAPAUD', 'PERROQUET|CANARI', 'PIEUVRE|MÉDUSE',
    'PLAGE|PISCINE', 'CINÉMA|THÉÂTRE', 'ÉCOLE|UNIVERSITÉ',
    'HÔPITAL|CLINIQUE', 'RESTAURANT|CANTINE', 'HÔTEL|CAMPING',
    'MONTAGNE|COLLINE', 'FORÊT|JUNGLE', 'DÉSERT|SAVANE',
    'BOULANGERIE|PÂTISSERIE', 'MARCHÉ|SUPERMARCHÉ', 'ÉGLISE|CATHÉDRALE',
    'CHÂTEAU|PALAIS', 'PRISON|CACHOT', 'MUSÉE|BIBLIOTHÈQUE',
    'CIRQUE|ZOO', 'STADE|GYMNASE', 'GARE|AÉROPORT',
    'PORT|QUAI', 'PARC|JARDIN', 'GROTTE|TUNNEL',
    'ÎLE|PRESQU’ÎLE', 'PARIS|MARSEILLE', 'STYLO|CRAYON',
    'LIVRE|MAGAZINE', 'CHAISE|TABOURET', 'LIT|HAMAC',
    'VÉLO|TROTTINETTE', 'VOITURE|CAMION', 'TRAIN|MÉTRO',
    'AVION|HÉLICOPTÈRE', 'BATEAU|SOUS-MARIN', 'TÉLÉPHONE|TABLETTE',
    'MONTRE|RÉVEIL', 'LUNETTES|JUMELLES', 'PARAPLUIE|PARASOL',
    'VALISE|SAC À DOS', 'CLÉ|CADENAS', 'MARTEAU|TOURNEVIS',
    'CISEAUX|COUTEAU', 'BALAI|ASPIRATEUR', 'SAVON|SHAMPOOING',
    'BROSSE|PEIGNE', 'OREILLER|COUSSIN', 'COUVERTURE|DRAP',
    'ASSIETTE|BOL', 'FOURCHETTE|CUILLÈRE', 'VERRE|TASSE',
    'BOUTEILLE|CARAFE', 'FOUR|MICRO-ONDES', 'FRIGO|CONGÉLATEUR',
    'LAMPE|BOUGIE', 'MIROIR|VITRE', 'ÉCHELLE|ESCABEAU',
    'BAGUE|BRACELET', 'GUITARE|VIOLON', 'PIANO|ACCORDÉON',
    'TAMBOUR|TROMPETTE', 'FOOTBALL|RUGBY', 'TENNIS|BADMINTON',
    'SKI|LUGE', 'NATATION|PLONGÉE', 'BOXE|JUDO',
    'DANSE|GYMNASTIQUE', 'COURSE|RANDONNÉE', 'PÊCHE|CHASSE',
    'ÉCHECS|DAMES', 'POKER|BELOTE', 'PUZZLE|MOTS CROISÉS',
    'PÉTANQUE|BOWLING', 'PATINAGE|ROLLER', 'ESCALADE|ALPINISME',
    'VOILE|SURF', 'SOLEIL|LUNE', 'PLUIE|NEIGE',
    'ORAGE|TEMPÊTE', 'RIVIÈRE|CANAL', 'LAC|ÉTANG',
    'MER|OCÉAN', 'NUAGE|BROUILLARD', 'ÉTOILE|COMÈTE',
    'ARBRE|BUISSON', 'ROSE|TULIPE', 'HERBE|MOUSSE',
    'PRINTEMPS|AUTOMNE', 'HIVER|ÉTÉ', 'MATIN|SOIR',
    'ARC-EN-CIEL|AURORE BORÉALE', 'MÉDECIN|INFIRMIER', 'POLICIER|GENDARME',
    'POMPIER|AMBULANCIER', 'BOULANGER|PÂTISSIER', 'PROFESSEUR|ÉLÈVE',
    'AVOCAT|JUGE', 'ACTEUR|CHANTEUR', 'PEINTRE|SCULPTEUR',
    'COIFFEUR|BARBIER', 'SERVEUR|CUISINIER', 'FACTEUR|LIVREUR',
    'PILOTE|CAPITAINE', 'ROI|EMPEREUR', 'PRINCESSE|REINE',
    'PIRATE|VIKING', 'SORCIÈRE|FÉE', 'FANTÔME|VAMPIRE',
    'CLOWN|MIME', 'MAGICIEN|JONGLEUR', 'CHEVALIER|SAMOURAÏ',
    'ESPION|DÉTECTIVE', 'PANTALON|SHORT', 'ROBE|JUPE',
    'PULL|GILET', 'MANTEAU|VESTE', 'CHAUSSURE|BOTTE',
    'CHAPEAU|CASQUETTE', 'ÉCHARPE|FOULARD', 'GANT|MOUFLE',
    'CRAVATE|NŒUD PAPILLON', 'CEINTURE|BRETELLES', 'PYJAMA|PEIGNOIR',
    'CHAUSSETTE|COLLANT', 'ANNIVERSAIRE|MARIAGE', 'NOËL|NOUVEL AN',
    'CARNAVAL|HALLOWEEN', 'RADIO|TÉLÉVISION', 'PHOTO|VIDÉO',
    'LETTRE|CARTE POSTALE', 'EMAIL|TEXTO', 'CONCERT|FESTIVAL',
    'DOUCHE|BAIN', 'ASCENSEUR|ESCALATOR', 'TENTE|CARAVANE',
    'FEU DE CAMP|BARBECUE'
  ];

  function norm(s) {
    return String(s || '').toUpperCase()
      .replace(/Œ/g, 'OE').replace(/Æ/g, 'AE')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Z0-9]/g, '');
  }

  function nbImposteurs(n) { return n >= 9 ? 3 : n >= 6 ? 2 : 1; }

  function alive(state) {
    var out = [];
    state.players.forEach(function (p, i) { if (p.alive) out.push(i); });
    return out;
  }

  function countRoles(state) {
    var imp = 0, civ = 0;
    state.players.forEach(function (p) {
      if (!p.alive) return;
      if (p.role === 'imposteur') imp++; else civ++;
    });
    return { imp: imp, civ: civ };
  }

  function startManche(state) {
    var pair = PAIRS[Math.floor(Math.random() * PAIRS.length)].split('|');
    if (Math.random() < 0.5) pair.reverse();
    state.pair = pair; // [mot des civils, mot des imposteurs]
    var idx = state.players.map(function (_, i) { return i; });
    GG.shuffle(idx);
    var nImp = nbImposteurs(state.players.length);
    state.players.forEach(function (p, i) {
      p.alive = true;
      p.role = idx.indexOf(i) < nImp ? 'imposteur' : 'civil';
      p.word = p.role === 'imposteur' ? pair[1] : pair[0];
      p.seen = false;
      p.vote = -1;
    });
    state.phase = 'reveal';
    state.order = GG.shuffle(idx.slice());
    state.orderPos = 0;
    state.tours = [];
    state.round = 0;
    state.lastResult = null;
    state.winner = '';
  }

  function newSpeakRound(state) {
    state.order = GG.shuffle(alive(state));
    state.orderPos = 0;
    state.tours.push([]);
    state.round++;
    state.phase = 'clue';
  }

  function resolveVotes(state) {
    var counts = {};
    var av = alive(state);
    av.forEach(function (i) {
      var v = state.players[i].vote;
      counts[v] = (counts[v] || 0) + 1;
    });
    var best = -1, bestN = 0, tie = false;
    Object.keys(counts).forEach(function (k) {
      if (counts[k] > bestN) { bestN = counts[k]; best = parseInt(k, 10); tie = false; }
      else if (counts[k] === bestN) tie = true;
    });
    var detail = Object.keys(counts).map(function (k) {
      return { p: parseInt(k, 10), n: counts[k] };
    }).sort(function (a, b) { return b.n - a.n; });
    if (tie) {
      state.lastResult = { tie: true, out: -1, role: '', votes: detail };
    } else {
      state.players[best].alive = false;
      state.lastResult = { tie: false, out: best, role: state.players[best].role, votes: detail };
    }
    var c = countRoles(state);
    if (c.imp === 0) {
      state.winner = 'civils';
      state.phase = 'end';
      state.players.forEach(function (p) { if (p.role === 'civil') p.score += 3; });
    } else if (c.imp >= c.civ) {
      state.winner = 'imposteurs';
      state.phase = 'end';
      state.players.forEach(function (p) { if (p.role === 'imposteur') p.score += 5; });
    } else {
      state.phase = 'result';
    }
  }

  var mod = {
    id: 'imposteur',
    nom: 'L’Imposteur',
    icone: '🥸',
    desc: 'Tout le monde reçoit le même mot… sauf l’imposteur — et personne ne sait dans quel camp il est ! Un indice chacun, un vote : démasquez-le. 3 à 12 joueurs.',
    regles: '<p><strong>🎯 Le but :</strong> démasquer celui qui n’a pas le même mot que les autres.</p><p><strong>La mise en place :</strong> tout le monde reçoit secrètement le même mot… sauf l’imposteur, qui reçoit un mot voisin (PLAGE / PISCINE, par exemple). Et personne — pas même lui — ne sait dans quel camp il est !</p><p><strong>Le tour :</strong> chacun, à son tour, écrit UN seul mot d’indice dans l’appli — il s’affiche sur tous les téléphones. Assez juste pour prouver qu’on a le bon mot, assez flou pour ne rien dévoiler à l’imposteur… Puis tout le monde vote : le plus suspect est éliminé et son camp est révélé.</p><p><strong>La victoire :</strong> les civils gagnent (+3 points chacun) en éliminant tous les imposteurs ; l’imposteur gagne (+5) s’il survit jusqu’à égalité avec les civils. À 6 joueurs et plus : 2 imposteurs, à 9 et plus : 3 !</p>',
    min: 3, max: 12,
    hotseat: true, hidden: true, netOnly: false,
    noBadges: true,

    create: function (names) {
      var state = {
        players: names.map(function (n) {
          return { name: n, score: 0, alive: true, role: '', word: '',
            seen: false, vote: -1 };
        }),
        manche: 1
      };
      startManche(state);
      return state;
    },

    turnOf: function (state) {
      return state.phase === 'clue' ? state.order[state.orderPos] : -1;
    },
    /* sur un seul téléphone : à qui l'écran doit-il passer ? */
    viewerOf: function (state) {
      var av = alive(state);
      if (state.phase === 'reveal') {
        for (var i = 0; i < av.length; i++) {
          if (!state.players[av[i]].seen) return av[i];
        }
        return av[0];
      }
      if (state.phase === 'vote') {
        for (var j = 0; j < av.length; j++) {
          if (state.players[av[j]].vote === -1) return av[j];
        }
        return av[0];
      }
      return 0; // écran public : l'hôte gère
    },
    over: function () { return false; }, // série de manches
    scoreOf: function (state, i) { return state.players[i].score; },

    summary: function (state) {
      var rows = state.players.map(function (p) { return { n: p.name, s: p.score }; })
        .sort(function (a, b) { return b.s - a.s; });
      return rows.map(function (r) {
        return '<div class="final-line"><span>' + GG.esc(r.n) + '</span><strong>' +
          r.s + ' pts</strong></div>';
      }).join('') + '<h1>🏆 ' + GG.esc(rows[0].n) + '</h1>';
    },

    /* les mots et les camps ne circulent jamais : chacun ne voit que SON mot */
    redact: function (state, viewer) {
      var copy = GG.clone(state);
      if (copy.phase !== 'end') delete copy.pair;
      copy.players.forEach(function (p, i) {
        if (copy.phase !== 'end') {
          if (i !== viewer) delete p.word;
          if (p.alive) delete p.role; // même soi-même : on ignore son camp !
        }
        p.hasVoted = p.vote !== -1;
        if (i !== viewer && copy.phase === 'vote') delete p.vote;
      });
      return copy;
    },

    apply: function (state, player, action) {
      var p = state.players[player];
      if (action.t === 'seen') {
        if (state.phase !== 'reveal') return { ok: false, error: 'Trop tard.' };
        if (!p || !p.alive) return { ok: false, error: 'Vous ne jouez pas cette manche.' };
        p.seen = true;
        if (alive(state).every(function (i) { return state.players[i].seen; })) {
          newSpeakRound(state);
        }
        return { ok: true };
      }
      if (action.t === 'clue') {
        if (state.phase !== 'clue') return { ok: false, error: 'Ce n’est pas le moment.' };
        if (player !== state.order[state.orderPos]) {
          return { ok: false, error: 'Ce n’est pas votre tour.' };
        }
        var text = String(action.text || '').trim();
        if (!text) return { ok: false, error: 'Écrivez un indice.' };
        if (text.length > 20) return { ok: false, error: '20 lettres maximum.' };
        if (/\s/.test(text)) return { ok: false, error: 'UN seul mot d’indice !' };
        var nClue = norm(text), nWord = norm(p.word);
        if (nClue && nWord && (nClue.indexOf(nWord) !== -1 || nWord.indexOf(nClue) !== -1)) {
          return { ok: false, error: 'Trop proche de votre mot secret !' };
        }
        state.tours[state.tours.length - 1].push({ p: player, text: text });
        state.orderPos++;
        if (state.orderPos >= state.order.length) {
          state.phase = 'vote';
          alive(state).forEach(function (i) { state.players[i].vote = -1; });
        }
        return { ok: true };
      }
      if (action.t === 'vote') {
        if (state.phase !== 'vote') return { ok: false, error: 'Ce n’est pas le moment.' };
        if (!p || !p.alive) return { ok: false, error: 'Les éliminés ne votent pas.' };
        if (p.vote !== -1) return { ok: false, error: 'Vous avez déjà voté.' };
        var target = action.for | 0;
        if (target === player) return { ok: false, error: 'On ne vote pas pour soi.' };
        if (!state.players[target] || !state.players[target].alive) {
          return { ok: false, error: 'Cible invalide.' };
        }
        p.vote = target;
        if (alive(state).every(function (i) { return state.players[i].vote !== -1; })) {
          resolveVotes(state);
        }
        return { ok: true };
      }
      if (action.t === 'next') {
        if (state.phase !== 'result') return { ok: false, error: 'Rien à poursuivre.' };
        if (player !== 0) return { ok: false, error: 'L’hôte relance le tour.' };
        newSpeakRound(state);
        return { ok: true };
      }
      if (action.t === 'again') {
        if (state.phase !== 'end') return { ok: false, error: 'La manche n’est pas finie.' };
        if (player !== 0) return { ok: false, error: 'L’hôte relance une manche.' };
        state.manche++;
        startManche(state);
        return { ok: true };
      }
      return { ok: false, error: 'Action inconnue.' };
    },

    render: function (el, ctx) {
      var s = ctx.state;
      var me = ctx.me;
      var my = s.players[me];
      var av = alive(s);
      var c = { imp: nbImposteurs(s.players.length) };

      function name(i) { return GG.esc(s.players[i].name); }

      function cluesHtml() {
        if (!s.tours || !s.tours.length) return '';
        var out = '';
        s.tours.forEach(function (tour, ti) {
          if (!tour.length) return;
          out += '<p class="imp-round-label">Tour ' + (ti + 1) + '</p><div class="imp-clues">' +
            tour.map(function (cl) {
              return '<span class="imp-clue"><strong>' + name(cl.p) + '</strong> ' +
                GG.esc(cl.text) + '</span>';
            }).join('') + '</div>';
        });
        return out;
      }

      var html = '<p class="imp-head">🥸 Manche ' + s.manche + ' · ' + av.length +
        ' joueurs en lice · ' + c.imp + ' imposteur' + (c.imp > 1 ? 's' : '') + ' au départ</p>';

      if (my && !my.alive && s.phase !== 'end') {
        html += '<p class="imp-dead">💀 Vous avez été éliminé' +
          (my.role === 'imposteur' ? ' (vous étiez l’imposteur !)' : '') +
          ' — vous suivez la partie en spectateur.</p>';
      }

      if (s.phase === 'reveal') {
        var seenN = av.filter(function (i) { return s.players[i].seen; }).length;
        if (my && my.alive && !my.seen) {
          html += '<div class="imp-card"><p>Votre mot secret :</p>' +
            '<div class="imp-word">' + GG.esc(my.word || '?') + '</div>' +
            '<p class="hint">🤫 Ne le montrez à personne. Peut-être avez-vous le même mot que ' +
            'les autres… peut-être pas : même l’imposteur s’ignore !</p>' +
            '<button class="btn big primary" data-a="seen">✔️ J’ai mémorisé mon mot</button></div>';
        } else {
          html += '<p class="mini-msg">⏳ Chacun découvre son mot… (' + seenN + '/' +
            av.length + ')</p>';
        }
      } else if (s.phase === 'clue') {
        var speaker = s.order[s.orderPos];
        html += cluesHtml();
        html += '<p class="mini-msg">Ordre de passage : ' + s.order.map(function (i, k) {
          return (k === s.orderPos ? '<strong>' + name(i) + '</strong>' : name(i));
        }).join(' → ') + '</p>';
        if (me === speaker && my.alive) {
          html += '<div class="imp-card"><p>À vous ! Écrivez <strong>un seul mot</strong> ' +
            'd’indice sur votre mot secret — il s’affichera chez tout le monde :</p>' +
            '<div class="cr-answer-row">' +
            '<input type="text" id="imp-clue" maxlength="20" placeholder="Votre indice…" autocomplete="off">' +
            '<button class="btn primary" data-a="clue">Envoyer</button></div>' +
            '<p class="hint">Assez précis pour rassurer les civils, assez flou pour ne pas ' +
            'vendre le mot à l’imposteur…</p></div>';
        } else {
          html += '<p class="waiting">✍️ ' + name(speaker) + ' écrit son indice…</p>';
        }
      } else if (s.phase === 'vote') {
        html += cluesHtml();
        var votedN = av.filter(function (i) {
          return s.players[i].hasVoted || s.players[i].vote !== -1;
        }).length;
        if (my && my.alive && (my.vote === -1 || my.vote === undefined)) {
          html += '<p class="mini-msg big-msg">🗳️ Qui est l’imposteur ?</p><div class="imp-votes">' +
            av.filter(function (i) { return i !== me; }).map(function (i) {
              return '<button class="imp-target" data-v="' + i + '">' + name(i) + '</button>';
            }).join('') + '</div>';
        } else {
          html += '<p class="mini-msg">🗳️ Vote enregistré. En attente… (' + votedN + '/' +
            av.length + ')</p>';
        }
      } else if (s.phase === 'result') {
        var r = s.lastResult;
        html += '<div class="imp-card">';
        if (r.tie) {
          html += '<p class="mini-msg big-msg">⚖️ Égalité : personne n’est éliminé !</p>';
        } else {
          html += '<p class="mini-msg big-msg">' + name(r.out) + ' est éliminé…</p>' +
            '<p class="imp-reveal">' + (r.role === 'imposteur'
              ? '🥸 C’était un IMPOSTEUR !' : '😇 C’était un civil innocent…') + '</p>';
        }
        html += '<div class="imp-tally">' + r.votes.map(function (v) {
          return '<span>' + name(v.p) + ' : ' + v.n + ' voix</span>';
        }).join('') + '</div></div>';
        if (me === 0) {
          html += '<button class="btn big primary" data-a="next">➜ Nouveau tour d’indices</button>';
        } else {
          html += '<p class="waiting">L’hôte relance un tour d’indices…</p>';
        }
      } else if (s.phase === 'end') {
        html += '<div class="imp-card">' +
          '<p class="mini-msg big-msg">' + (s.winner === 'civils'
            ? '😇 Les civils gagnent !' : '🥸 L’imposteur gagne !') + '</p>' +
          '<p>Mot des civils : <strong>' + GG.esc(s.pair[0]) + '</strong><br>' +
          'Mot de l’imposteur : <strong>' + GG.esc(s.pair[1]) + '</strong></p>' +
          '<div class="imp-roles">' + s.players.map(function (pl) {
            return '<span class="imp-role-tag' +
              (pl.role === 'imposteur' ? ' imp' : '') + '">' +
              (pl.role === 'imposteur' ? '🥸' : '😇') + ' ' + GG.esc(pl.name) +
              (pl.alive ? '' : ' 💀') + '</span>';
          }).join('') + '</div></div>';
        html += '<h3 class="cr-h3">Scores de la série</h3>' +
          s.players.slice().sort(function (a, b) { return b.score - a.score; })
            .map(function (pl) {
              return '<div class="final-line"><span>' + GG.esc(pl.name) +
                '</span><strong>' + pl.score + ' pts</strong></div>';
            }).join('');
        if (me === 0) {
          html += '<button class="btn big primary" data-a="again">🔁 Nouvelle manche</button>';
        } else {
          html += '<p class="waiting">L’hôte peut relancer une manche.</p>';
        }
      }

      el.innerHTML = html;
      var b = el.querySelector('[data-a="seen"]');
      if (b) b.addEventListener('click', function () { ctx.act({ t: 'seen' }); });
      b = el.querySelector('[data-a="next"]');
      if (b) b.addEventListener('click', function () { ctx.act({ t: 'next' }); });
      b = el.querySelector('[data-a="again"]');
      if (b) b.addEventListener('click', function () { ctx.act({ t: 'again' }); });
      b = el.querySelector('[data-a="clue"]');
      if (b) {
        var send = function () {
          var input = el.querySelector('#imp-clue');
          if (input && input.value.trim()) ctx.act({ t: 'clue', text: input.value });
        };
        b.addEventListener('click', send);
        var inp = el.querySelector('#imp-clue');
        if (inp) inp.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter') send();
        });
      }
      el.querySelectorAll('.imp-target').forEach(function (t) {
        t.addEventListener('click', function () {
          ctx.act({ t: 'vote', for: parseInt(t.dataset.v, 10) });
        });
      });
    },

    _PAIRS: PAIRS, _norm: norm, _nbImposteurs: nbImposteurs
  };

  GG.register(mod);
  if (typeof module === 'object' && module.exports) module.exports = mod;
})(typeof self !== 'undefined' ? self : globalThis);
