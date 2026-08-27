/*
 * GGgames — Le Plus Proche (2 à 12 joueurs, estimation).
 * Une question à réponse chiffrée, chacun propose un nombre en secret :
 * le plus proche marque. Personne n'a besoin de connaître la réponse,
 * il suffit d'être moins loin que les autres !
 */
(function (root) {
  'use strict';
  var GG = root.GG;
  var NB_MANCHES = 8;

  /* Banque : 'Question|nombre|unité' (remplie plus bas). */
  var BANK = [
    "Quelle est la longueur du Nil en kilomètres ?|6650|km",
    "Quelle est la longueur de la Loire en kilomètres ?|1006|km",
    "Quelle est la longueur du Rhône en kilomètres ?|812|km",
    "Quelle est la longueur de la Garonne en kilomètres ?|647|km",
    "Quelle est la longueur du Danube en kilomètres ?|2850|km",
    "Quelle est l'altitude du mont Everest en mètres ?|8848|m",
    "Quelle est l'altitude du Kilimandjaro en mètres ?|5895|m",
    "Quelle est l'altitude du mont Fuji au Japon en mètres ?|3776|m",
    "Quelle est l'altitude du puy de Dôme en mètres ?|1465|m",
    "À quelle altitude se trouve le lac Titicaca en mètres ?|3812|m",
    "Quelle est la profondeur maximale du lac Baïkal en mètres ?|1642|m",
    "Quelle est la hauteur du Salto Angel, plus haute cascade du monde, en mètres ?|979|m",
    "Quelle est la superficie de la Corse en kilomètres carrés ?|8680|km²",
    "Quelle est la superficie du Vatican en hectares ?|44|hectares",
    "Combien de départements compte la France ?|101|départements",
    "Combien de régions compte la France métropolitaine ?|13|régions",
    "Combien d'États composent les États-Unis ?|50|États",
    "Combien de pays sont membres de l'ONU ?|193|pays",
    "Combien de pays compte l'Union européenne ?|27|pays",
    "Combien de pays compte le continent africain ?|54|pays",
    "Combien de pays le Danube traverse-t-il ?|10|pays",
    "Combien de cantons compte la Suisse ?|26|cantons",
    "Quelle est la circonférence de la Terre à l'équateur en kilomètres ?|40075|km",
    "Quelle est la largeur de la Manche au pas de Calais en kilomètres ?|33|km",
    "Quelle est la longueur du tunnel sous la Manche en kilomètres ?|50|km",
    "Quelle est la longueur du boulevard périphérique de Paris en kilomètres ?|35|km",
    "Combien d'arrondissements compte Paris ?|20|arrondissements",
    "Combien de ponts enjambent la Seine dans Paris ?|37|ponts",
    "Quelle est la longueur de l'avenue des Champs-Élysées en mètres ?|1910|m",
    "Combien de marches faut-il gravir pour atteindre le sommet de la tour Eiffel ?|1665|marches",
    "Quelle est la hauteur de la tour Eiffel, antenne comprise, en mètres ?|330|m",
    "Quel est le poids total de la tour Eiffel en tonnes ?|10100|tonnes",
    "Quelle est la hauteur de la tour Montparnasse en mètres ?|210|m",
    "Quelle est la hauteur de l'Arc de Triomphe en mètres ?|50|m",
    "Combien de marches compte l'escalier de l'Arc de Triomphe ?|284|marches",
    "Quelle est la hauteur de la statue de la Liberté avec son socle en mètres ?|93|m",
    "Quelle est la hauteur du Burj Khalifa à Dubaï en mètres ?|828|m",
    "Quelle est la hauteur de la tour de Pise en mètres ?|56|m",
    "Quelle est la longueur totale du pont du Golden Gate en mètres ?|2737|m",
    "Quelle est la hauteur de l'obélisque de la place de la Concorde en mètres ?|23|m",
    "Quelle est la longueur de la galerie des Glaces du château de Versailles en mètres ?|73|m",
    "Combien de pièces compte le château de Versailles ?|2300|pièces",
    "Combien de marches compte l'escalier de la rue Foyatier à Montmartre ?|222|marches",
    "Quelle est la hauteur des tours de Notre-Dame de Paris en mètres ?|69|m",
    "Quelle est la hauteur du Christ Rédempteur de Rio avec son socle en mètres ?|38|m",
    "Quelle est la hauteur de Big Ben, la célèbre tour de Londres, en mètres ?|96|m",
    "Combien d'os compte le squelette d'un adulte ?|206|os",
    "Combien de dents possède un adulte, dents de sagesse comprises ?|32|dents",
    "Combien de dents de lait possède un enfant ?|20|dents",
    "Combien d'os compte une main humaine ?|27|os",
    "Combien d'os compte un pied humain ?|26|os",
    "Combien de vertèbres compte la colonne vertébrale, sacrum et coccyx compris ?|33|vertèbres",
    "Combien de côtes possède le corps humain ?|24|côtes",
    "Combien de chromosomes possède une cellule humaine ?|46|chromosomes",
    "Combien de litres de sang circulent dans le corps d'un adulte ?|5|litres",
    "Combien de fois le cœur humain bat-il environ par jour ?|100000|battements",
    "Combien de dents possède un chien adulte ?|42|dents",
    "Combien d'estomacs possède une vache ?|4|estomacs",
    "Combien de cœurs possède une pieuvre ?|3|cœurs",
    "Combien de pattes possède une araignée ?|8|pattes",
    "Combien de mois dure une grossesse humaine ?|9|mois",
    "Quelle est la distance moyenne entre la Terre et la Lune en kilomètres ?|384400|km",
    "Quelle est la distance moyenne entre la Terre et le Soleil en kilomètres ?|150000000|km",
    "Combien de planètes compte le système solaire ?|8|planètes",
    "Quelle est la vitesse de la lumière en kilomètres par seconde ?|300000|km/s",
    "En combien de minutes la lumière du Soleil atteint-elle la Terre ?|8|minutes",
    "Combien de jours dure une année sur la planète Mars ?|687|jours",
    "Combien de satellites naturels possède la planète Mars ?|2|satellites",
    "Combien de constellations officielles compte le ciel ?|88|constellations",
    "Quelle est la température de la surface du Soleil en degrés Celsius ?|5500|degrés",
    "En quelle année a eu lieu la bataille de Marignan ?|1515|",
    "En quelle année a eu lieu la prise de la Bastille ?|1789|",
    "En quelle année Christophe Colomb a-t-il découvert l'Amérique ?|1492|",
    "En quelle année Charlemagne a-t-il été couronné empereur ?|800|",
    "En quelle année s'est achevée la Première Guerre mondiale ?|1918|",
    "En quelle année a débuté la Seconde Guerre mondiale ?|1939|",
    "En quelle année le mur de Berlin est-il tombé ?|1989|",
    "En quelle année a eu lieu la bataille de Waterloo ?|1815|",
    "En quelle année les femmes ont-elles obtenu le droit de vote en France ?|1944|",
    "En quelle année le Titanic a-t-il fait naufrage ?|1912|",
    "En quelle année Jeanne d'Arc est-elle morte à Rouen ?|1431|",
    "En quelle année l'éruption du Vésuve a-t-elle détruit Pompéi ?|79|",
    "En quelle année avant J.-C. Rome aurait-elle été fondée selon la légende ?|753|",
    "En quelle année la tour Eiffel a-t-elle été inaugurée ?|1889|",
    "En quelle année l'Homme a-t-il marché sur la Lune pour la première fois ?|1969|",
    "En quelle année Youri Gagarine est-il allé dans l'espace ?|1961|",
    "En quelle année a eu lieu le premier Tour de France cycliste ?|1903|",
    "En quelle année ont eu lieu les premiers Jeux olympiques modernes ?|1896|",
    "En quelle année les frères Lumière ont-ils projeté leur premier film en public ?|1895|",
    "En quelle année les pièces et billets en euros sont-ils arrivés en France ?|2002|",
    "Combien de touches compte un piano ?|88|touches",
    "Combien de touches noires compte un piano ?|36|touches",
    "Combien de cases compte un échiquier ?|64|cases",
    "Combien de faces compte un ballon de football classique ?|32|faces",
    "Combien de cartes compte un jeu de tarot ?|78|cartes",
    "Combien de dominos compte un jeu classique ?|28|dominos",
    "Combien de cases compte une grille de sudoku ?|81|cases",
    "Combien de cases compte le plateau du Monopoly ?|40|cases",
    "Combien de jetons contient un jeu de Scrabble français, jokers compris ?|102|jetons",
    "Combien de cases compte un plateau de Scrabble ?|225|cases",
    "Combien de cordes compte une harpe de concert ?|47|cordes",
    "Quelle est la longueur officielle d'un marathon en mètres ?|42195|m",
    "À quelle hauteur se situe un panier de basket en centimètres ?|305|cm",
    "Combien de trous compte un parcours de golf classique ?|18|trous",
    "Combien de minutes compte une journée ?|1440|minutes"
  ];

  function parseQ(e) {
    var p = e.split('|');
    return { q: p[0], a: parseInt(p[1], 10), unit: p[2] || '' };
  }

  function fmtN(n) {
    var s = String(n);
    var out = '';
    while (s.length > 3) { out = ' ' + s.slice(-3) + out; s = s.slice(0, -3); }
    return s + out;
  }

  var mod = {
    id: 'proche',
    nom: 'Le Plus Proche',
    icone: '🎯',
    desc: 'Personne ne connaît la réponse exacte — il suffit d’être moins loin que les autres ! Estimations secrètes, 8 manches. 2 à 12 joueurs.',
    min: 2, max: 12,
    hotseat: true, hotseatMax: 4, hidden: true, netOnly: false,
    regles: '<p><strong>🎯 Le but :</strong> être plus proche de la bonne réponse que les autres — pas besoin de la connaître !</p><p><strong>Comment jouer :</strong> à chaque manche, une question à réponse chiffrée (« Combien de marches… ? »). Chacun tape son estimation <strong>en secret</strong>. À la révélation, le plus proche marque.</p><p><strong>Les points :</strong> +3 au plus proche (les ex æquo aussi), +5 en cas de réponse EXACTE. 8 manches, meilleur total gagnant.</p>',

    create: function (names) {
      return {
        players: names.map(function (n) { return { name: n, score: 0, guess: null }; }),
        qs: GG.shuffle(BANK.slice()).slice(0, NB_MANCHES).map(parseQ),
        idx: 0,
        phase: 'guess',
        reveal: null,
        finished: false
      };
    },

    turnOf: function () { return -1; }, // tout le monde estime en même temps
    viewerOf: function (state) {
      if (state.phase !== 'guess') return 0;
      var n = state.players.length;
      for (var k = 0; k < n; k++) {
        var i = (state.idx + k) % n;
        if (state.players[i].guess === null) return i;
      }
      return 0;
    },
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

    /* les réponses exactes et les estimations des autres ne circulent pas */
    redact: function (state, viewer) {
      var copy = GG.clone(state);
      copy.qs.forEach(function (q) { delete q.a; });
      copy.players.forEach(function (p, i) {
        p.hasGuessed = p.guess !== null;
        if (i !== viewer && copy.phase === 'guess') delete p.guess;
      });
      return copy;
    },

    apply: function (state, player, action) {
      if (state.finished) return { ok: false, error: 'Partie terminée.' };
      var p = state.players[player];
      if (action.t === 'guess') {
        if (state.phase !== 'guess') return { ok: false, error: 'Trop tard !' };
        if (!p) return { ok: false, error: 'Joueur inconnu.' };
        if (p.guess !== null) return { ok: false, error: 'Estimation déjà donnée.' };
        var n = parseInt(action.n, 10);
        if (!isFinite(n) || isNaN(n)) return { ok: false, error: 'Entrez un nombre.' };
        if (n < 0 || n > 1e12) return { ok: false, error: 'Nombre invalide.' };
        p.guess = n;
        if (state.players.every(function (x) { return x.guess !== null; })) {
          var q = state.qs[state.idx];
          var best = Infinity;
          state.players.forEach(function (x) {
            best = Math.min(best, Math.abs(x.guess - q.a));
          });
          var winners = [];
          state.players.forEach(function (x, xi) {
            if (Math.abs(x.guess - q.a) === best) {
              winners.push(xi);
              x.score += best === 0 ? 5 : 3;
            }
          });
          state.phase = 'reveal';
          state.reveal = {
            answer: q.a, unit: q.unit, winners: winners, exact: best === 0,
            guesses: state.players.map(function (x) { return x.guess; })
          };
        }
        return { ok: true };
      }
      if (action.t === 'next') {
        if (state.phase !== 'reveal') return { ok: false, error: 'La manche est en cours.' };
        if (player !== 0) return { ok: false, error: 'L’hôte passe à la suite.' };
        state.idx++;
        if (state.idx >= state.qs.length) {
          state.finished = true;
          return { ok: true };
        }
        state.phase = 'guess';
        state.reveal = null;
        state.players.forEach(function (x) { x.guess = null; });
        return { ok: true };
      }
      return { ok: false, error: 'Action inconnue.' };
    },

    /* IA : fabrique une estimation plausible autour de la vraie réponse.
       Le facteur d'erreur simule l'à-peu-près d'un joueur humain :
       souvent assez loin, parfois un vrai coup de flair. */
    bot: function (state, me) {
      if (state.finished) return null;
      if (state.phase !== 'guess') return null; // révélation : l'hôte enchaîne
      var p = state.players[me];
      if (!p || p.guess !== null) return null;  // déjà répondu cette manche
      var vrai = state.qs[state.idx].a;
      var f = Math.random() < 0.25
        ? 0.9 + Math.random() * 0.2             // coup de flair : tout proche
        : 0.55 + Math.random() * 1.25;          // estimation ordinaire
      var n = Math.round(vrai * f);
      if (n < 0) n = 0;
      return { t: 'guess', n: n };
    },

    render: function (el, ctx) {
      var s = ctx.state;
      if (s.finished) { el.innerHTML = ''; return; } // l'écran de fin prend le relais
      var me = ctx.me;
      var my = s.players[me];
      var q = s.qs[s.idx];
      var html = '<p class="qz-head">🎯 Manche ' + (s.idx + 1) + ' / ' + s.qs.length + '</p>';

      if (s.phase === 'guess') {
        var done = s.players.filter(function (p) {
          return p.hasGuessed || p.guess !== null;
        }).length;
        var mineDone = my && my.guess !== null && my.guess !== undefined;
        html += '<div class="qz-q">' + GG.esc(q.q) + '</div>';
        if (mineDone) {
          html += '<p class="mini-msg big-msg">🤫 Votre estimation : <strong>' +
            fmtN(my.guess) + '</strong></p>' +
            '<p class="mini-msg">En attente des autres… (' + done + '/' + s.players.length + ')</p>';
        } else {
          html += '<div class="cr-answer-row">' +
            '<input type="number" id="pr-guess" inputmode="numeric" placeholder="Votre estimation…">' +
            '<button class="btn primary" data-a="guess">Valider</button></div>' +
            '<p class="hint">Le plus proche marque 3 points, la réponse exacte en vaut 5.</p>';
        }
      } else if (s.phase === 'reveal') {
        var r = s.reveal;
        html += '<div class="qz-q">' + GG.esc(q.q) + '</div>' +
          '<p class="pr-answer">Réponse : <strong>' + fmtN(r.answer) + '</strong> ' +
          GG.esc(r.unit || '') + '</p>';
        var rows = s.players.map(function (p, pi) {
          return { pi: pi, n: p.name, g: r.guesses[pi], d: Math.abs(r.guesses[pi] - r.answer) };
        }).sort(function (a, b) { return a.d - b.d; });
        html += '<div class="pr-rows">' + rows.map(function (row) {
          var win = r.winners.indexOf(row.pi) !== -1;
          return '<div class="pr-row' + (win ? ' win' : '') + '"><span>' +
            (win ? (r.exact ? '🎯 ' : '🏅 ') : '') + GG.esc(row.n) + '</span>' +
            '<span>' + fmtN(row.g) + ' <small>(à ' + fmtN(row.d) + ')</small></span></div>';
        }).join('') + '</div>';
        html += '<div class="mem-stats">' + s.players.map(function (p) {
          return '<span class="mem-stat">' + GG.esc(p.name) + ' : ' + p.score + '</span>';
        }).join('') + '</div>';
        if (me === 0) {
          html += '<button class="btn big primary" data-a="next">' +
            (s.idx + 1 >= s.qs.length ? '🏁 Voir le classement' : '➜ Manche suivante') +
            '</button>';
        } else {
          html += '<p class="waiting">L’hôte passe à la manche suivante…</p>';
        }
      }

      el.innerHTML = html;
      var g = el.querySelector('[data-a="guess"]');
      if (g) {
        var send = function () {
          var input = el.querySelector('#pr-guess');
          if (input && input.value.trim() !== '') {
            ctx.act({ t: 'guess', n: input.value.trim() });
          }
        };
        g.addEventListener('click', send);
        var inp = el.querySelector('#pr-guess');
        if (inp) inp.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter') send();
        });
      }
      var nx = el.querySelector('[data-a="next"]');
      if (nx) nx.addEventListener('click', function () { ctx.act({ t: 'next' }); });
    },

    _BANK: BANK
  };

  GG.register(mod);
  if (typeof module === 'object' && module.exports) module.exports = mod;
})(typeof self !== 'undefined' ? self : globalThis);
