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
  /* Trois décors d'affaires, tirés au sort à chaque partie. */
  var SCENARIOS = [
    {
      id: 'manoir',
      titre: 'LE MANOIR',
      lieuTexte: 'Manoir Voltaire, minuit passé.',
      victime: 'Lord Edmond',
      intro: 'L’orage a coupé les routes. <strong>Lord Edmond</strong> vient d’être retrouvé ' +
        'sans vie dans sa demeure, et le coupable est <strong>encore parmi nous</strong>.',
      lieux: [
        { id: 'bibliotheque', nom: 'La bibliothèque', dans: 'dans la bibliothèque', icone: '📚' },
        { id: 'serre', nom: 'La serre tropicale', dans: 'dans la serre', icone: '🌿' },
        { id: 'cave', nom: 'La cave à vin', dans: 'dans la cave à vin', icone: '🍷' },
        { id: 'bal', nom: 'La salle de bal', dans: 'dans la salle de bal', icone: '💃' },
        { id: 'bureau', nom: 'Le bureau du maître', dans: 'dans le bureau', icone: '🖋️' }
      ],
      pistes: [
        { id: 'coffre', nom: 'Le coffre-fort', icone: '🗝️', desc: 'Un coffre verrouillé, dissimulé derrière un tableau.' },
        { id: 'lettre', nom: 'La lettre déchirée', icone: '✉️', desc: 'Des fragments de papier retrouvés dans la cheminée.' },
        { id: 'journal', nom: 'Le journal intime', icone: '📔', desc: 'Le journal de Lord Edmond, fermé par un code.' },
        { id: 'majordome', nom: 'Le majordome', icone: '🎩', desc: 'Il parlera… si vous prouvez votre esprit.' },
        { id: 'gardien', nom: 'Le carnet du gardien', icone: '🏮', desc: 'Ses notes de ronde, écrites à sa manière.' },
        { id: 'malle', nom: 'La malle de l’observatoire', icone: '🧳', desc: 'Une malle sanglée, montée du grenier.' }
      ]
    },
    {
      id: 'opera',
      titre: 'L’OPÉRA',
      lieuTexte: 'Opéra Berlioz, le soir de la première.',
      victime: 'la diva Elvira Marsan',
      intro: 'Le rideau ne se relèvera pas : <strong>la diva Elvira Marsan</strong> a été ' +
        'retrouvée sans vie pendant l’entracte. Les portes sont closes — le coupable est ' +
        '<strong>toujours dans le théâtre</strong>.',
      lieux: [
        { id: 'loge', nom: 'La loge de la diva', dans: 'dans la loge', icone: '💄' },
        { id: 'coulisses', nom: 'Les coulisses', dans: 'dans les coulisses', icone: '🎭' },
        { id: 'fosse', nom: 'La fosse d’orchestre', dans: 'dans la fosse', icone: '🎻' },
        { id: 'foyer', nom: 'Le foyer des artistes', dans: 'dans le foyer', icone: '🥂' },
        { id: 'cintres', nom: 'Les cintres (machinerie)', dans: 'dans les cintres', icone: '⚙️' }
      ],
      pistes: [
        { id: 'partition', nom: 'La partition annotée', icone: '🎼', desc: 'Des notes griffonnées d’une main pressée.' },
        { id: 'trousseau', nom: 'Le trousseau du régisseur', icone: '🗝️', desc: 'Toutes les clés du théâtre… ou presque.' },
        { id: 'admirateur', nom: 'La lettre d’admirateur', icone: '✉️', desc: 'Parfumée, signée d’une simple initiale.' },
        { id: 'habilleuse', nom: 'L’habilleuse', icone: '🪡', desc: 'Elle a tout vu, mais parle par énigmes.' },
        { id: 'souffleur', nom: 'Le carnet du souffleur', icone: '📔', desc: 'Il note tout ce qui se dit… en coulisses aussi.' },
        { id: 'costumes', nom: 'La malle à costumes', icone: '🧳', desc: 'Quelqu’un y a caché quelque chose à la hâte.' }
      ]
    },
    {
      id: 'train',
      titre: 'LE TRAIN DE NUIT',
      lieuTexte: 'À bord de l’Étoile du Nord, bloqué par la neige.',
      victime: 'le financier Auguste Ferrand',
      intro: 'La tempête a immobilisé le train en rase campagne. Au matin, ' +
        '<strong>le financier Auguste Ferrand</strong> ne s’est pas réveillé — et personne ' +
        'n’a pu monter ni descendre : le coupable voyage <strong>avec nous</strong>.',
      lieux: [
        { id: 'restaurant', nom: 'Le wagon-restaurant', dans: 'dans le wagon-restaurant', icone: '🍽️' },
        { id: 'salon', nom: 'La voiture-salon', dans: 'dans la voiture-salon', icone: '🛋️' },
        { id: 'compartiment', nom: 'Le compartiment n°7', dans: 'dans le compartiment n°7', icone: '🚪' },
        { id: 'fourgon', nom: 'Le fourgon à bagages', dans: 'dans le fourgon', icone: '📦' },
        { id: 'plateforme', nom: 'La plateforme arrière', dans: 'sur la plateforme arrière', icone: '🌨️' }
      ],
      pistes: [
        { id: 'valise', nom: 'La valise verrouillée', icone: '🧳', desc: 'Un cadenas à secret protège son contenu.' },
        { id: 'telegramme', nom: 'Le télégramme froissé', icone: '📨', desc: 'Reçu la veille au soir, à moitié brûlé.' },
        { id: 'controleur', nom: 'Le carnet du contrôleur', icone: '📔', desc: 'Les allées et venues de la nuit, tout y est.' },
        { id: 'serveur', nom: 'Le serveur du wagon-bar', icone: '🤵', desc: 'Il a servi un dernier verre… à qui ?' },
        { id: 'montre', nom: 'La montre brisée', icone: '⌚', desc: 'Arrêtée net. Mais à quelle heure exactement ?' },
        { id: 'registre', nom: 'Le registre des passagers', icone: '🗂️', desc: 'Un nom y a été soigneusement gratté.' }
      ]
    }
  ];
  var ALIBIS = [
    'faisait une réussite aux cartes sous les yeux de deux invités',
    'téléphonait à Paris depuis le hall, le standard le confirme',
    'était déjà couché(e), la gouvernante détient la clé de la chambre',
    'a joué du piano jusqu’à minuit, tout le manoir l’a entendu'
  ];

  /* Rôles d'enquêteurs : chaque joueur reçoit un personnage, des informations
     confidentielles à partager de vive voix, et parfois un pouvoir spécial. */
  var CLUE_POWER = 'Vous démarrez avec une information confidentielle : partagez-la au bon moment !';
  var ROLES = [
    { id: 'detective', nom: 'Le Détective', icone: '🔍',
      flavor: 'Un fin limier à qui rien n’échappe.',
      pouvoir: 'Votre premier indice d’énigme est gratuit (il ne compte pas dans le total).' },
    { id: 'cryptographe', nom: 'La Cryptographe', icone: '🔐',
      flavor: 'Les codes n’ont aucun secret pour vous.',
      pouvoir: 'Sur chaque énigme, vous voyez la première lettre de la réponse.' },
    { id: 'inspecteur', nom: 'L’Inspecteur', icone: '🎖️',
      flavor: 'Trente ans de terrain, un instinct sûr.',
      pouvoir: 'Après une accusation ratée, vous seul apprenez combien d’éléments étaient exacts.' },
    { id: 'serrurier', nom: 'Le Serrurier', icone: '🗝️',
      flavor: 'Aucune serrure, aucun secret ne vous résiste.',
      pouvoir: 'Vous voyez l’indice de chaque énigme sans avoir à le demander.' },
    { id: 'archiviste', nom: 'L’Archiviste', icone: '📚',
      flavor: 'Vous connaissez les lieux mieux que leurs murs.',
      pouvoir: 'Vous savez ce que chaque piste peut révéler : suspect, arme ou lieu.' },
    { id: 'voyante', nom: 'La Voyante', icone: '🔮',
      flavor: 'Les esprits vous soufflent des vérités.',
      pouvoir: 'Vous démarrez avec DEUX informations confidentielles.' },
    { id: 'medecin', nom: 'La Médecin légiste', icone: '⚕️',
      flavor: 'Le corps de la victime vous a déjà parlé.', pouvoir: CLUE_POWER },
    { id: 'journaliste', nom: 'Le Journaliste', icone: '📰',
      flavor: 'Vos sources parlent, toujours.', pouvoir: CLUE_POWER },
    { id: 'garde', nom: 'La Garde du corps', icone: '🛡️',
      flavor: 'Vous étiez là, dans l’ombre, ce soir-là.', pouvoir: CLUE_POWER },
    { id: 'majordome', nom: 'Le Majordome', icone: '🎩',
      flavor: 'Rien ne se passe ici sans que vous le sachiez.', pouvoir: CLUE_POWER },
    { id: 'romanciere', nom: 'La Romancière', icone: '✒️',
      flavor: 'Vous avez l’œil pour les intrigues.', pouvoir: CLUE_POWER },
    { id: 'photographe', nom: 'Le Photographe', icone: '📷',
      flavor: 'Votre objectif a tout vu, ou presque.', pouvoir: CLUE_POWER }
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
    // décor tiré au sort : manoir, opéra ou train de nuit
    state.scenario = GG.clone(SCENARIOS[Math.floor(Math.random() * SCENARIOS.length)]);
    var LIEUX = state.scenario.lieux;
    var PISTES = state.scenario.pistes;
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
    // rôles d'enquêteurs + informations confidentielles (une par joueur,
    // 8 différentes au maximum en circulation pour préserver l'énigme)
    var roles = GG.shuffle(ROLES.slice());
    var innocents = [];
    SUSPECTS.forEach(function (x) {
      if (x.id !== state.solution.suspect) innocents.push(
        { kind: 'suspect', id: x.id, text: '👤 ' + x.nom + ' est hors de cause : vous le savez de source sûre.' });
    });
    ARMES.forEach(function (a) {
      if (a.id !== state.solution.arme) innocents.push(
        { kind: 'arme', id: a.id, text: a.icone + ' ' + a.nom + ' n’est pas l’arme du crime : vous l’avez constaté.' });
    });
    LIEUX.forEach(function (l) {
      if (l.id !== state.solution.lieu) innocents.push(
        { kind: 'lieu', id: l.id, text: l.icone + ' Le crime n’a pas eu lieu ' + l.dans + ' : vous y étiez.' });
    });
    GG.shuffle(innocents);
    var pool = innocents.slice(0, 8);
    state.players.forEach(function (p, i) {
      p.role = roles[i % roles.length];
      p.clues = [pool[i % pool.length]];
      if (p.role.id === 'voyante') {
        p.clues.push(pool[(i + 1) % pool.length]);
      }
      p.freeHintUsed = false;
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
    desc: 'Enquête collaborative : 3 décors d’affaires, et chaque joueur incarne un rôle avec ses infos secrètes et son pouvoir. Jusqu’à 12 joueurs !',
    regles: '<p><strong>🎯 Le but :</strong> découvrir ENSEMBLE qui a tué, avec quelle arme et dans quel lieu — avant d’épuiser vos 2 accusations.</p><p><strong>Comment jouer :</strong> chaque piste est verrouillée par une énigme : élucidez-la pour révéler des indices qui innocentent des suspects, des armes ou des lieux. Le carnet de déduction se remplit tout seul.</p><p><strong>Vos rôles :</strong> chaque enquêteur a un personnage, des informations confidentielles visibles uniquement sur SON téléphone — à partager à voix haute ! — et parfois un pouvoir spécial. Coopérez, recoupez, accusez.</p>',
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

    /* la solution, les réponses des énigmes et les infos privées des autres
       joueurs ne quittent jamais le serveur */
    redact: function (state, viewer) {
      var copy = GG.clone(state);
      var role = (viewer >= 0 && state.players[viewer] && state.players[viewer].role)
        ? state.players[viewer].role.id : '';
      if (copy.phase !== 'end') delete copy.solution;
      copy.pistes.forEach(function (p) {
        if (role === 'cryptographe' && p.answers && p.answers[0]) {
          p.first = p.answers[0][0]; // pouvoir : première lettre de la réponse
        }
        delete p.answers;
        if (!p.solved) {
          if (role === 'archiviste' && p.deductions) {
            p.kinds = p.deductions.map(function (d) { return d.kind; }); // pouvoir
          }
          delete p.deductions;
        }
      });
      copy.players.forEach(function (p, i) {
        if (i !== viewer) delete p.clues; // infos confidentielles personnelles
      });
      if (copy.accuseFailed && role !== 'inspecteur') {
        delete copy.accuseFailed.right; // pouvoir de l'inspecteur
      }
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
          // pouvoir du Détective : son premier indice ne compte pas
          var pl = state.players[player];
          if (pl && pl.role && pl.role.id === 'detective' && !pl.freeHintUsed) {
            pl.freeHintUsed = true;
          } else {
            state.hintsUsed++;
          }
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
            suspect: action.suspect, arme: action.arme, lieu: action.lieu,
            // pouvoir de l'inspecteur : nombre d'éléments exacts (masqué aux autres)
            right: (action.suspect === s.suspect ? 1 : 0) +
              (action.arme === s.arme ? 1 : 0) + (action.lieu === s.lieu ? 1 : 0)
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

      /* rôle du joueur : masqué sur un téléphone partagé à plusieurs */
      var myRole = null;
      if ((ctx.mode !== 'local' || s.players.length === 1) &&
          s.players[ctx.me] && s.players[ctx.me].role) {
        myRole = s.players[ctx.me].role;
      }

      function roleCard() {
        if (!myRole) return '';
        var p = s.players[ctx.me];
        var out = '<div class="mn-role">' +
          '<div class="mn-role-head"><span class="mn-role-ic">' + myRole.icone + '</span>' +
          '<div><div class="mn-role-nom">' + GG.esc(myRole.nom) + '</div>' +
          '<div class="mn-dim">' + GG.esc(myRole.flavor) + '</div></div></div>' +
          '<p class="mn-role-pow">✨ ' + GG.esc(myRole.pouvoir) + '</p>';
        if (p.clues && p.clues.length) {
          out += p.clues.map(function (c) {
            return '<div class="mn-clue">🤫 ' + c.text + '</div>';
          }).join('') +
          '<p class="mn-dim">Ces informations ne sont visibles que sur VOTRE téléphone : ' +
          'partagez-les à voix haute au bon moment !</p>';
        }
        return out + '</div>';
      }

      var html = '<div class="mn">';

      /* ---------- lettre d'introduction ---------- */
      if (s.phase === 'brief') {
        html += '<div class="mn-candle"></div>' +
          '<h2 class="mn-title">' + s.scenario.titre + '</h2>' +
          '<div class="mn-letter">' +
          '<p><em>' + s.scenario.lieuTexte + '</em></p>' +
          '<p>' + s.scenario.intro + '</p>' +
          '<p>Cinq suspects. Cinq armes possibles. Cinq lieux où le drame a pu se jouer. ' +
          'Six pistes verrouillées par des énigmes vous attendent : élucidez-les ' +
          '<strong>ensemble</strong>, remplissez votre carnet, et démasquez l’assassin.</p>' +
          '<p class="mn-warn">⚠️ Vous n’aurez droit qu’à deux accusations.</p>' +
          '</div>' +
          '<div class="mn-cast">' + SUSPECTS.map(function (x) {
            return '<div class="mn-cast-one">' + portrait(x) +
              '<span>' + GG.esc(x.nom) + '</span></div>';
          }).join('') + '</div>';
        html += roleCard();
        if (myRole && s.players.length > 1) {
          html += '<p class="mn-dim mn-center">🎭 Chaque enquêteur a son propre rôle et ' +
            'ses propres informations : comparez-les !</p>';
        }
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
        var lie = byId(s.scenario.lieux, s.solution.lieu);
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
          ' · 🧩 ' + solvedCount + '/' + s.pistes.length + ' pistes · ❌ ' + s.wrongAnswers +
          ' erreurs · 💡 ' + s.hintsUsed + ' indices</div></div>';
        // record d'équipe : meilleur temps d'une affaire résolue (sur ce téléphone)
        if (s.won && s.durationSec > 0) {
          try {
            if (typeof localStorage !== 'undefined') {
              var best = JSON.parse(localStorage.getItem('gg-manoir-best') || 'null');
              var cur = { sec: s.durationSec, ts: s.caseId || 0 };
              if (!best || cur.sec < best.sec) {
                localStorage.setItem('gg-manoir-best', JSON.stringify(cur));
              }
              var stored = JSON.parse(localStorage.getItem('gg-manoir-best') || 'null');
              if (stored && stored.ts === cur.ts && stored.sec === cur.sec) {
                html += '<p class="mn-gold-text mn-center">🏆 Meilleur temps sur ce téléphone !</p>';
              } else if (stored) {
                html += '<p class="mn-dim mn-center">🏅 Record : ' + Math.floor(stored.sec / 60) +
                  ' min ' + (stored.sec % 60) + ' s.</p>';
              }
            }
          } catch (e) {}
        }
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
      var LIEUX = s.scenario.lieux;
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
        '<div class="mn-top-mid"><div class="mn-title-s">' + s.scenario.titre + '</div>' +
        '<div class="mn-progress">🧩 ' + solvedCount + '/' + s.pistes.length + ' · ' +
        '🫵 ' + '❤️'.repeat(s.tries) + '🖤'.repeat(2 - s.tries) + '</div></div>' +
        '<div class="mn-team">👥 ' + s.players.length + '</div></div>';

      if (s.accuseFailed && s.tries === 1 && view.mode !== 'accuse') {
        var fs = byId(SUSPECTS, s.accuseFailed.suspect);
        html += '<div class="mn-alarm">🚨 Accusation erronée' +
          (fs ? ' contre ' + GG.esc(fs.nom) : '') +
          ' ! Il ne vous reste qu’<strong>une seule tentative</strong>.</div>';
        if (myRole && myRole.id === 'inspecteur' && s.accuseFailed.right !== undefined) {
          html += '<div class="mn-clue">🎖️ Votre analyse (pour vous seul) : <strong>' +
            s.accuseFailed.right + '</strong> élément' + (s.accuseFailed.right > 1 ? 's' : '') +
            ' de cette accusation ' + (s.accuseFailed.right > 1 ? 'étaient exacts' : 'était exact') +
            '.</div>';
        }
      }

      if (view.mode === 'role' && myRole) {
        html += '<button class="mn-back" data-a="back">← Retour aux pistes</button>' +
          roleCard() + '</div>';
        el.innerHTML = html;
        bind();
        return;
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
            (myRole && myRole.id === 'cryptographe' && p.first
              ? '<p class="mn-hint">🔐 Votre don (pour vous seul) : la réponse commence par « ' +
                GG.esc(p.first) + ' »</p>' : '') +
            (myRole && myRole.id === 'serrurier' && !p.hintShown && p.hint
              ? '<p class="mn-hint">🗝️ Votre passe-partout (pour vous seul) : ' +
                GG.esc(p.hint) + '</p>' : '') +
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
        if (myRole) {
          html += '<button class="mn-role-btn" data-a="gorole">🎭 ' + myRole.icone + ' ' +
            GG.esc(myRole.nom) + ' — voir mon rôle et mes infos</button>';
        }
        // grille des pistes
        var KIND_IC = { suspect: '👤', arme: '🗡️', lieu: '📍' };
        html += '<div class="mn-pistes">' + s.pistes.map(function (p, i) {
          var etat = p.solved ? '✓ élucidé' : '🔒 énigme';
          // pouvoir de l'archiviste : ce que la piste peut révéler
          if (!p.solved && myRole && myRole.id === 'archiviste' && p.kinds) {
            etat += ' ' + p.kinds.map(function (k) { return KIND_IC[k] || ''; }).join('');
          }
          return '<button class="mn-piste' + (p.solved ? ' solved' : '') + '" data-piste="' + i + '">' +
            '<span class="mn-piste-ic">' + p.icone + '</span>' +
            '<span class="mn-piste-nom">' + GG.esc(p.nom) + '</span>' +
            '<span class="mn-piste-etat">' + etat + '</span>' +
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
        b = el.querySelector('[data-a="gorole"]');
        if (b) b.addEventListener('click', function () {
          view.mode = 'role'; mod.render(el, ctx);
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

    _ENIGMES: ENIGMES, _SUSPECTS: SUSPECTS, _ARMES: ARMES, _SCENARIOS: SCENARIOS,
    _ROLES: ROLES, _norm: norm
  };

  GG.register(mod);
  if (typeof module === 'object' && module.exports) module.exports = mod;
})(typeof self !== 'undefined' ? self : globalThis);
