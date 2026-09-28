/*
 * GGgames — Le Manoir (enquête coopérative, 1 à 12 joueurs).
 *
 * Une VRAIE enquête : six affaires (manoir, opéra, train de nuit, paquebot,
 * hôtel de montagne, cirque), et à chaque partie une vérité tirée au sort
 * (coupable, arme, lieu, emploi du temps de chacun, signes particuliers).
 * Le générateur fabrique un jeu d'indices VRAIS et le vérifie avec un
 * solveur : une seule solution, et elle n'apparaît qu'en recoupant
 *   - les témoignages des suspects (publics ; le coupable ment sur son alibi),
 *   - les indices des six pistes (chacune verrouillée par une énigme du décor),
 *   - les informations confidentielles des enquêteurs (une par rôle).
 * Aucune piste ne dit « X est innocent » : il faut raisonner.
 * L'accusation se décide au VOTE du groupe, avec confirmation.
 */
(function (root) {
  'use strict';
  var GG = root.GG;

  /* ================================================================
   * 1. Les signes particuliers (communs à toutes les affaires)
   *    oui / non : ce qu'on sait d'un suspect ; crime / crimeNon : ce que
   *    la scène dit du coupable. {X} = nom, {e} = accord au féminin.
   * ================================================================ */
  var TRAITS = {
    gaucher: { ic: '✋', compat: ['coup', 'lame'],
      oui: '{X} est gaucher{e}', non: '{X} est droitier{e}',
      crime: 'L’angle du coup est formel : il a été porté de la main gauche. **Le coupable est gaucher.**',
      crimeNon: 'Le coup a été porté de la main droite, sans hésitation : **le coupable est droitier.**' },
    boue: { ic: '👞',
      oui: 'les souliers {deX} étaient crottés de boue fraîche', non: 'les souliers {deX} étaient impeccablement propres',
      crime: 'Des empreintes de boue fraîche mènent jusqu’au corps : **le coupable avait les souliers crottés.**',
      crimeNon: 'Pas une trace de pas sur le sol pourtant boueux autour du corps : **le coupable avait les souliers propres.**' },
    parfum: { ic: '🌸',
      oui: '{X} se parfume à la violette', non: '{X} ne porte jamais de parfum',
      crime: 'Un parfum de violette flotte encore sur les lieux du crime : **le coupable se parfume à la violette.**',
      crimeNon: 'Aucun parfum sur les lieux, alors que la violette se sent à dix pas : **le coupable ne se parfume pas à la violette.**' },
    fumeur: { ic: '🚬',
      oui: '{X} fume des cigarillos', non: '{X} ne fume pas',
      crime: 'Un mégot de cigarillo encore tiède près du corps : **le coupable fume.**',
      crimeNon: 'Pas la moindre odeur de tabac sur les lieux, alors que les fumeurs en empestent : **le coupable ne fume pas.**' },
    lunettes: { ic: '👓',
      oui: '{X} porte des lunettes', non: '{X} ne porte pas de lunettes',
      crime: 'Un éclat de verre de lunettes brille près de la victime : **le coupable porte des lunettes.**' },
    grand: { ic: '📏', compat: ['coup'],
      oui: '{X} est très grand{e}', non: '{X} est de petite taille',
      crime: 'Le coup est tombé de haut, sur le sommet du crâne : **le coupable est de grande taille.**',
      crimeNon: 'Le coup a été porté de bas en haut : **le coupable est de petite taille.**' },
    blond: { ic: '💇',
      oui: '{X} a les cheveux blonds', non: '{X} n’a pas les cheveux blonds',
      crime: 'Un long cheveu blond est resté accroché à la manche de la victime : **le coupable est blond.**' },
    blessure: { ic: '🩹', compat: ['lame'],
      oui: '{X} porte un pansement frais à la main', non: 'les mains {deX} sont intactes, sans une égratignure',
      crime: 'Du sang qui n’est pas celui de la victime tache la lame : **le coupable s’est blessé à la main.**' },
    gants: { ic: '🧤',
      oui: '{X} a gardé ses gants toute la soirée', non: '{X} a passé la soirée mains nues',
      crime: 'Pas une empreinte, nulle part, pas même sur l’arme : **le coupable portait des gants.**',
      crimeNon: 'Des empreintes de doigts nus un peu partout sur les lieux : **le coupable ne portait pas de gants.**' }
  };

  /* Nature de l'arme : ce que dit le légiste. */
  var KINDS = {
    coup: { ic: '🔨', nom: 'objet lourd',
      oui: '🩺 Le légiste est formel : la victime a été frappée avec un **objet lourd**.',
      non: '🩺 Ni bosse ni fracture : **aucun objet lourd** n’a servi.' },
    lame: { ic: '🔪', nom: 'lame',
      oui: '🩺 Le légiste est formel : la victime a été frappée avec une **lame**.',
      non: '🩺 Pas la moindre plaie : **aucune lame** n’a servi.' },
    poison: { ic: '🧪', nom: 'poison',
      oui: '🩺 Le légiste est formel : la victime a été **empoisonnée**.',
      non: '🩺 Les analyses de sang sont négatives : **pas de poison**.' },
    lien: { ic: '🪢', nom: 'lien',
      oui: '🩺 Le légiste est formel : la victime a été **étranglée**.',
      non: '🩺 Aucune marque au cou : **pas d’étranglement**.' }
  };

  /* ================================================================
   * 2. Les six affaires
   * ================================================================ */
  /* txt : le nom tel qu'on le dit dans une phrase (« le colonel Safran ») */
  function S(id, nom, f, teinte, desc, txt) {
    return { id: id, nom: nom, f: f, teinte: teinte, desc: desc, ini: initiales(nom), txt: txt || nom.split(',')[0] };
  }
  function L(id, nom, dans, de, icone, tags) { return { id: id, nom: nom, dans: dans, de: de, icone: icone, tags: tags }; }
  function A(id, nom, f, icone, kind, home, owner) { return { id: id, nom: nom, f: f, icone: icone, kind: kind, home: home, owner: owner || null }; }
  function P(id, nom, icone, desc, enigmes) { return { id: id, nom: nom, icone: icone, desc: desc, enigmes: enigmes }; }
  function E(q, a, hint, verif) { return { q: q, a: a, hint: hint, verif: verif || null }; }
  function initiales(nom) {
    var mots = String(nom).split(',')[0].replace(/[’']/g, ' ').split(/\s+/).filter(function (m) {
      return m && /^[A-ZÀ-Ý]/.test(m);
    });
    var out = mots.slice(0, 2).map(function (m) { return m[0]; }).join('');
    return out || String(nom).slice(0, 2).toUpperCase();
  }

  var SCENARIOS = [
    {
      id: 'manoir', titre: 'LE MANOIR', nom: 'L’affaire du manoir Voltaire',
      lieuTexte: 'Manoir Voltaire, nuit d’orage.', victime: 'Lord Edmond', heure: '23 h 10',
      intro: 'L’orage a coupé les routes. **Lord Edmond** a été retrouvé sans vie dans sa demeure, et la pendule de son bureau s’est arrêtée à **23 h 10**. Le coupable est **encore parmi nous**.',
      suspects: [
        S('safran', 'Colonel Safran', false, 45, 'Vieux compagnon d’armes du lord, criblé de dettes de jeu.', 'le colonel Safran'),
        S('amethyste', 'Baronne Améthyste', true, 275, 'Cousine éloignée, qui se voit déjà héritière.', 'la baronne Améthyste'),
        S('celadon', 'Docteur Céladon', false, 150, 'Médecin de famille, un peu trop curieux des testaments.', 'le docteur Céladon'),
        S('garance', 'Madame Garance', true, 0, 'Gouvernante au service de la famille depuis trente ans.', 'Madame Garance'),
        S('cobalt', 'Professeur Cobalt', false, 215, 'Astronome invité, brouillé avec son hôte.', 'le professeur Cobalt')
      ],
      lieux: [
        L('bibliotheque', 'La bibliothèque', 'dans la bibliothèque', 'de la bibliothèque', '📚', ['cheminee', 'parc']),
        L('serre', 'La serre', 'dans la serre', 'de la serre', '🌿', ['parc']),
        L('cave', 'La cave à vin', 'dans la cave à vin', 'de la cave à vin', '🍷', []),
        L('bureau', 'Le bureau du maître', 'dans le bureau du maître', 'du bureau du maître', '🖋️', ['etage', 'cheminee', 'parc']),
        L('galerie', 'La galerie des portraits', 'dans la galerie des portraits', 'de la galerie des portraits', '🖼️', ['etage'])
      ],
      autres: [
        L('salon', 'Le grand salon', 'dans le grand salon', 'du grand salon', '🛋️', []),
        L('office', 'L’office', 'à l’office', 'de l’office', '🍽️', [])
      ],
      tags: {
        etage: { ic: '⬆️', nom: 'à l’étage',
          oui: '🔊 Barnabé, à l’office, a entendu un choc sourd venu des étages : **le crime a eu lieu à l’étage.**',
          non: '🔊 Le choc a fait trembler la vaisselle de l’office : **le crime n’a pas eu lieu à l’étage.**' },
        cheminee: { ic: '🔥', nom: 'cheminée',
          oui: '🔥 Des flocons de suie sur la veste de Lord Edmond : **la pièce du crime a une cheminée.**',
          non: '🔥 Pas un grain de suie, pas une odeur de feu : **la pièce du crime n’a pas de cheminée.**' },
        parc: { ic: '🌧️', nom: 'fenêtre sur le parc',
          oui: '🌧️ Des gouttes de pluie sur le parquet et une fenêtre mal refermée : **la pièce du crime a une fenêtre sur le parc.**',
          non: '🌧️ Personne sur les lieux n’a pu entendre l’orage : **la pièce du crime n’a aucune fenêtre sur le parc.**' }
      },
      armes: [
        A('chandelier', 'Le chandelier d’argent', false, '🕯️', 'coup', 'bibliotheque'),
        A('statuette', 'La statuette de bronze', true, '🗿', 'coup', 'galerie'),
        A('dague', 'La dague orientale', true, '🗡️', 'lame', 'bureau'),
        A('secateur', 'Le sécateur du jardinier', false, '✂️', 'lame', 'serre'),
        A('fiole', 'La fiole de mort-aux-rats', true, '🧪', 'poison', 'cave')
      ],
      temoins: ['Barnabé, le majordome,', 'Rosalie, la cuisinière,', 'Anselme, le jardinier,'],
      pistes: [
        P('coffre', 'Le coffre-fort', '🗝️', 'Un coffre verrouillé, dissimulé derrière un tableau.', [
          E('Sur le cadre du tableau, Lord Edmond a gravé le mot de passe du coffre, chaque lettre ayant avancé d’un pas dans l’alphabet : USFTPS.', ['TRESOR'], 'U devient T, S devient R…', { type: 'cesar', code: 'USFTPS', d: 1 }),
          E('Le cadran du coffre attend un nombre. Un billet glissé dessous : « Mon âge le jour de mon mariage : le tiers de mon âge d’aujourd’hui, plus 11. J’ai 72 ans. »', ['35'], '72 ÷ 3 = 24… et ensuite ?', { type: 'calc', v: 35 }),
          E('Gravé sous la poignée : « Je fais tic-tac dans le grand hall et je sonne toutes les heures ; mon nom a sept lettres. » Qui suis-je ?', ['HORLOGE', 'PENDULE'], 'La sienne s’est arrêtée à 23 h 10…')
        ]),
        P('lettre', 'La lettre déchirée', '✉️', 'Des fragments de papier retrouvés dans la cheminée.', [
          E('Un mot, lisible seulement dans un miroir : TNEMATSET', ['TESTAMENT'], 'Lisez-le de droite à gauche.', { type: 'envers', code: 'TNEMATSET' }),
          E('Charade griffonnée : mon premier est un petit légume rond et vert qu’on écosse ; mon second est le pronom de « quelqu’un » ; mon tout tue sans bruit.', ['POISON'], 'POIS + …'),
          E('Au bas de la lettre : « Si on me partage, je n’existe plus. » Qui suis-je ?', ['SECRET'], 'Ce que la lettre devait garder…')
        ]),
        P('journal', 'Le journal intime', '📔', 'Le journal de Lord Edmond, fermé par un cadenas.', [
          E('Cadenas à quatre chiffres. Sur la couverture : « Mon année de naissance, 1-8-6-3, chiffres rangés du plus grand au plus petit. »', ['8631'], 'Le plus grand chiffre d’abord : 8…', { type: 'calc', v: 8631 }),
          E('Dernière page : « Je noircis le papier sans jamais le brûler, et je dors dans un encrier. » Qui suis-je ?', ['ENCRE'], 'La plume y trempe.'),
          E('Lord Edmond notait les coups de l’horloge : 1, 3, 6, 10, 15… Quel nombre vient ensuite ?', ['21'], 'On ajoute 2, puis 3, puis 4, puis 5…', { type: 'calc', v: 21 })
        ]),
        P('majordome', 'Le majordome', '🎩', 'Barnabé parlera… si vous prouvez votre esprit.', [
          E('« Plein de trous, je retiens pourtant les feuilles du thé de Monsieur. » Qu’est-ce ?', ['PASSOIRE', 'PASSE-THÉ', 'TAMIS'], 'On la pose sur la tasse.'),
          E('« Plus je sèche, plus je suis mouillée. » Qui suis-je ?', ['SERVIETTE'], 'Après le bain…'),
          E('« On me monte et on me descend sans que je bouge jamais. » Qui suis-je ?', ['ESCALIER'], 'Marche après marche.')
        ]),
        P('gardien', 'Le carnet du gardien', '🏮', 'Ses notes de ronde, écrites à sa manière.', [
          E('« Une ronde toutes les 45 minutes, la première à 20 h 30. » À quelle heure commence la 5e ronde ? (par exemple : 21h15)', ['23H30', '2330'], 'Quatre fois 45 minutes après 20 h 30.'),
          E('Les lettres gravées sur sa lanterne, R-A-N-E-T-L-E-N, forment le nom de l’objet lui-même.', ['LANTERNE'], 'Il l’allume pour sa ronde.', { type: 'anagramme', code: 'RANETLEN' }),
          E('« Je garde la maison sans aboyer : on me tourne dans la serrure. » Qui suis-je ?', ['CLÉ', 'CLEF'], 'Le gardien en porte un trousseau.')
        ]),
        P('malle', 'La malle de l’observatoire', '🧳', 'Une malle sanglée, montée du grenier par le professeur.', [
          E('« Je suis la seule planète du système solaire à ne pas porter le nom d’un dieu. » Qui suis-je ?', ['TERRE'], 'Vous marchez dessus.'),
          E('Cadenas de la malle : « Le nombre de planètes du système solaire multiplié par le nombre de saisons. »', ['32'], '8 planètes, 4 saisons.', { type: 'calc', v: 32 }),
          E('« Petite et lointaine, je brille par milliers dans le ciel… quand l’orage s’en va. » Qui suis-je ?', ['ÉTOILE'], 'Le professeur les compte à la lunette.')
        ])
      ]
    },
    {
      id: 'opera', titre: 'L’OPÉRA', nom: 'L’affaire de l’Opéra Berlioz',
      lieuTexte: 'Opéra Berlioz, soir de première.', victime: 'la diva Elvira Marsan', heure: '21 h 40',
      intro: 'Le rideau ne se relèvera pas : **la diva Elvira Marsan** a été retrouvée sans vie pendant l’entracte, à **21 h 40**. Les portes sont closes : le coupable est **toujours dans le théâtre**.',
      suspects: [
        S('bellini', 'Aurelio Bellini, le ténor', false, 10, 'Son rival sur scène, jaloux de ses rappels.', 'Aurelio Bellini'),
        S('vasseur', 'Clara Vasseur, la cheffe d’orchestre', true, 300, 'Humiliée par la diva devant tous les musiciens.', 'Clara Vasseur'),
        S('morin', 'Gaspard Morin, le régisseur', false, 30, 'Il connaît chaque trappe du théâtre.', 'Gaspard Morin'),
        S('delacroix', 'Le comte Delacroix, le mécène', false, 200, 'Il finance l’Opéra… et courtisait la diva.', 'le comte Delacroix'),
        S('ninon', 'Ninon Lemoine, la doublure', true, 330, 'Elle attendait son heure depuis des années.', 'Ninon Lemoine')
      ],
      lieux: [
        L('loge', 'La loge de la diva', 'dans la loge de la diva', 'de la loge de la diva', '💄', ['haut', 'miroir']),
        L('cintres', 'Les cintres', 'dans les cintres', 'des cintres', '⚙️', ['haut']),
        L('foyer', 'Le foyer des artistes', 'dans le foyer des artistes', 'du foyer des artistes', '🥂', ['miroir']),
        L('coulisses', 'Les coulisses', 'dans les coulisses', 'des coulisses', '🎭', ['miroir', 'orchestre']),
        L('fosse', 'La fosse d’orchestre', 'dans la fosse d’orchestre', 'de la fosse d’orchestre', '🎻', ['orchestre'])
      ],
      autres: [
        L('scene', 'La scène', 'sur la scène', 'de la scène', '🎤', []),
        L('bar', 'Le bar du grand foyer', 'au bar du grand foyer', 'du bar', '🍸', [])
      ],
      tags: {
        haut: { ic: '⬆️', nom: 'en hauteur',
          oui: '🪜 De la poussière d’échelle de fer sur les chaussons de la diva : **le crime a eu lieu en hauteur.**',
          non: '🪜 Les chaussons de la diva sont restés immaculés : **le crime n’a pas eu lieu en hauteur.**' },
        miroir: { ic: '🪞', nom: 'miroirs',
          oui: '🪞 Un machiniste a vu la scène du drame… dans le reflet d’un grand miroir : **la pièce du crime est garnie de miroirs.**',
          non: '🪞 Malgré la lutte, pas un éclat de miroir brisé : **la pièce du crime n’a pas de miroir.**' },
        orchestre: { ic: '🎻', nom: 'près de l’orchestre',
          oui: '🎻 Les musiciens accordaient leurs instruments quand un cri a percé le vacarme tout près d’eux : **le crime a eu lieu près de l’orchestre.**',
          non: '🎻 Les musiciens, qui accordaient leurs instruments, n’ont rien entendu : **le crime a eu lieu loin de l’orchestre.**' }
      },
      armes: [
        A('contrepoids', 'Le contrepoids de fonte', false, '🏋️', 'coup', 'cintres'),
        A('buste', 'Le buste de Verdi', false, '🗿', 'coup', 'foyer'),
        A('stylet', 'Le stylet de Tosca', false, '🗡️', 'lame', 'coulisses'),
        A('ciseaux', 'La paire de ciseaux de la costumière', true, '✂️', 'lame', 'loge'),
        A('laudanum', 'Le flacon de laudanum', false, '🧪', 'poison', 'fosse')
      ],
      temoins: ['Firmin, le souffleur,', 'Mathilde, l’ouvreuse,', 'Léon, le machiniste,'],
      pistes: [
        P('partition', 'La partition annotée', '🎼', 'Des notes griffonnées d’une main pressée.', [
          E('Au dos de la partition : « DO, RÉ, MI, FA, SOL, LA… » Quelle note manque pour finir la gamme ?', ['SI'], 'Juste avant le DO suivant.'),
          E('Le code du chef : chaque lettre a avancé d’un pas dans l’alphabet. Déchiffrez : SJEFBV', ['RIDEAU'], 'S devient R, J devient I…', { type: 'cesar', code: 'SJEFBV', d: 1 }),
          E('« J’ai 88 touches noires et blanches, mais je n’ouvre aucune porte. » Qui suis-je ?', ['PIANO'], 'Il y en a un dans la fosse.')
        ]),
        P('trousseau', 'Le trousseau du régisseur', '🗝️', 'Toutes les clés du théâtre… ou presque.', [
          E('Sur les étiquettes : loge 1, loge 2, loge 4, loge 8, loge 16… Quel numéro porte la clé suivante ?', ['32'], 'Chaque numéro double.', { type: 'calc', v: 32 }),
          E('Anagramme gravée sur l’anneau : E-C-N-E-S. Quel lieu du théâtre cette clé ouvre-t-elle ?', ['SCÈNE'], 'Là où l’on chante.', { type: 'anagramme', code: 'ECNES' }),
          E('« Tout le monde me tient en entrant, personne ne me boit : je donne droit à un fauteuil. » Qui suis-je ?', ['BILLET', 'TICKET', 'PLACE'], 'L’ouvreuse le déchire.')
        ]),
        P('admirateur', 'La lettre d’admirateur', '✉️', 'Parfumée, signée d’une simple initiale.', [
          E('La lettre se termine par un mot écrit à l’envers : RUOMA', ['AMOUR'], 'De droite à gauche…', { type: 'envers', code: 'RUOMA' }),
          E('Charade : mon premier est l’extrémité d’une corde ; mon second borde le fleuve et l’on y attend le train ; mon tout se lance à la diva le soir de la première.', ['BOUQUET'], 'BOUT + …'),
          E('« Je suis la reine de la soirée : on m’applaudit, on me couvre de fleurs… et ce soir, je ne chanterai plus. » Qui suis-je ?', ['DIVA', 'CANTATRICE'], 'Elvira, bien sûr.')
        ]),
        P('habilleuse', 'L’habilleuse', '🪡', 'Elle a tout vu, mais parle par énigmes.', [
          E('« J’ai un œil, mais je ne vois rien : le fil y passe. » Qui suis-je ?', ['AIGUILLE'], 'L’habilleuse en a plein sa pelote.'),
          E('« Long et soyeux, je traîne derrière la robe de la diva. » Qui suis-je ?', ['TRAÎNE'], 'Mon nom dit ce que je fais.'),
          E('Le code de la penderie : le double de 18, moins 7.', ['29'], '36 – 7…', { type: 'calc', v: 29 })
        ]),
        P('souffleur', 'Le carnet du souffleur', '📔', 'Il note tout ce qui se dit… en coulisses aussi.', [
          E('Charade : mon premier est la première note de la gamme ; mon second est la note suivante ; mon tout brille comme les balcons de l’Opéra.', ['DORÉ'], 'DO + …'),
          E('Trois actes de 40 minutes et deux entractes de 15 minutes : combien de minutes dure l’opéra ?', ['150'], '120 + 30…', { type: 'calc', v: 150 }),
          E('« Plus on m’applaudit, plus je reviens saluer. » Qui suis-je ?', ['RAPPEL'], 'Le public le réclame à la fin.')
        ]),
        P('costumes', 'La malle à costumes', '🧳', 'Quelqu’un y a caché quelque chose à la hâte.', [
          E('Étiquette : « Noir ou doré, je cache le visage au bal. » Qui suis-je ?', ['MASQUE', 'LOUP'], 'Il se porte sur les yeux.'),
          E('Anagramme cousue dans la doublure : R-E-P-A-O.', ['OPÉRA'], 'Vous y êtes !', { type: 'anagramme', code: 'REPAO' }),
          E('Cadenas : le nombre de lettres du mot TOSCA, multiplié par lui-même.', ['25'], '5 × 5…', { type: 'calc', v: 25 })
        ])
      ]
    },
    {
      id: 'train', titre: 'LE TRAIN DE NUIT', nom: 'L’affaire de l’Étoile du Nord',
      lieuTexte: 'À bord de l’Étoile du Nord, bloqué par la neige.', victime: 'le financier Auguste Ferrand', heure: '2 h 15',
      intro: 'La tempête a immobilisé le train en rase campagne. Au matin, **le financier Auguste Ferrand** ne s’est pas réveillé : sa montre brisée indique **2 h 15**. Personne n’a pu monter ni descendre : le coupable voyage **avec nous**.',
      suspects: [
        S('volkova', 'La comtesse Volkova', true, 330, 'Ruinée, elle devait une fortune à Ferrand.', 'la comtesse Volkova'),
        S('brassac', 'Hector Brassac, l’industriel', false, 40, 'Son associé… et son pire concurrent.', 'Hector Brassac'),
        S('leroy', 'Suzanne Leroy, la journaliste', true, 180, 'Elle enquêtait sur les affaires louches de Ferrand.', 'Suzanne Leroy'),
        S('mercier', 'Paul Mercier, le secrétaire', false, 100, 'Discret, il connaissait tous les secrets de son patron.', 'Paul Mercier'),
        S('vernier', 'Le commandant Vernier', false, 220, 'Officier en retraite, au passé trouble.', 'le commandant Vernier')
      ],
      lieux: [
        L('restaurant', 'Le wagon-restaurant', 'dans le wagon-restaurant', 'du wagon-restaurant', '🍽️', ['tete']),
        L('salon', 'La voiture-salon', 'dans la voiture-salon', 'de la voiture-salon', '🛋️', ['moquette', 'tete']),
        L('compartiment', 'Le compartiment n°7', 'dans le compartiment n°7', 'du compartiment n°7', '🚪', ['moquette']),
        L('fourgon', 'Le fourgon à bagages', 'dans le fourgon à bagages', 'du fourgon à bagages', '📦', ['froid', 'tete']),
        L('plateforme', 'La plateforme arrière', 'sur la plateforme arrière', 'de la plateforme arrière', '🌨️', ['froid'])
      ],
      autres: [
        L('couloir', 'Le couloir', 'dans le couloir', 'du couloir', '🚶', []),
        L('cabine', 'La cabine du chef de train', 'dans la cabine du chef de train', 'de la cabine du chef de train', '🛎️', [])
      ],
      tags: {
        froid: { ic: '❄️', nom: 'glacial',
          oui: '❄️ Des cristaux de givre dans les cheveux de la victime : **le crime a eu lieu dans une voiture glaciale, non chauffée.**',
          non: '❄️ Pas une trace de givre sur la victime : **le crime a eu lieu dans une voiture chauffée.**' },
        moquette: { ic: '🧶', nom: 'moquette',
          oui: '🧶 Des fibres de moquette rouge sous les ongles de la victime : **le sol du lieu du crime est couvert de moquette.**',
          non: '🧶 Aucune fibre sous les ongles : **le sol du lieu du crime n’a pas de moquette.**' },
        tete: { ic: '🚂', nom: 'à l’avant du train',
          oui: '🚂 Le cri a été couvert par le sifflet de la locomotive, tout proche : **le crime a eu lieu dans la moitié avant du train.**',
          non: '🚂 Le mécanicien, dans la locomotive, n’a rien entendu ; le cri venait de loin derrière : **le crime a eu lieu dans la moitié arrière du train.**' }
      },
      armes: [
        A('cle', 'La clé à molette', true, '🔧', 'coup', 'fourgon'),
        A('pressepapier', 'Le presse-papier de cristal', false, '💎', 'coup', 'salon'),
        A('coupepapier', 'Le coupe-papier d’argent', false, '🗡️', 'lame', 'compartiment'),
        A('couteau', 'Le couteau à découper', false, '🔪', 'lame', 'restaurant'),
        A('somnifere', 'Le flacon de somnifère', false, '🧪', 'poison', 'cabine')
      ],
      temoins: ['Octave, le chef de train,', 'Jules, le serveur,', 'Marius, le mécanicien,'],
      pistes: [
        P('valise', 'La valise verrouillée', '🧳', 'Un cadenas à secret protège son contenu.', [
          E('Une étiquette : « Le train a quitté Paris à 21 h 40 et roulait depuis 4 h 35 quand il s’est arrêté. » À quelle heure s’est-il arrêté ? (par exemple : 1h05)', ['2H15', '0215', '215', '02H15'], '21 h 40 + 4 h = 1 h 40 ; il reste 35 minutes.'),
          E('Anagramme sur l’étiquette : N-O-L-Y. La ville d’où vient la valise.', ['LYON'], 'La capitale des Gaules.', { type: 'anagramme', code: 'NOLY' }),
          E('« Plus on me perce, plus je vaux : le contrôleur me poinçonne. » Qui suis-je ?', ['BILLET', 'TICKET'], 'Sans moi, pas de voyage.')
        ]),
        P('telegramme', 'Le télégramme froissé', '📨', 'Reçu la veille au soir, à moitié brûlé.', [
          E('En morse : trois brèves, trois longues, trois brèves (· · · — — — · · ·). Quel est ce célèbre appel ?', ['SOS'], 'On l’envoie en détresse.'),
          E('Chaque lettre a reculé d’un pas dans l’alphabet (B devient A…). Déchiffrez : QTHMD', ['RUINE'], 'Q redevient R, T redevient U…', { type: 'cesar', code: 'QTHMD', d: -1 }),
          E('STOP, dit chaque ligne. Combien de lettres compte le mot TÉLÉGRAMME ?', ['10'], 'Comptez-les une à une.', { type: 'calc', v: 10 })
        ]),
        P('controleur', 'Le carnet du contrôleur', '📔', 'Les allées et venues de la nuit, tout y est.', [
          E('Le train compte 9 voitures. Le contrôleur les traverse toutes, de la première à la dernière. Combien de portes de communication franchit-il ?', ['8'], 'Il y a une porte entre deux voitures.', { type: 'calc', v: 8 }),
          E('« Je siffle, je fume, et je tire tout le monde derrière moi. » Qui suis-je ?', ['LOCOMOTIVE', 'LOCO', 'MACHINE'], 'Tout à l’avant.'),
          E('« Je tombe sans jamais me faire mal, blanche et légère, et cette nuit je bloque le train. » Qui suis-je ?', ['NEIGE'], 'Regardez par la fenêtre.')
        ]),
        P('serveur', 'Le serveur du wagon-bar', '🤵', 'Il a servi un dernier verre… à qui ?', [
          E('« Je suis né du raisin, je vieillis en fût et on me sert en carafe. » Qui suis-je ?', ['VIN'], 'Rouge, blanc ou rosé.'),
          E('L’addition : trois cafés à 2 francs et deux cognacs à 5 francs. Combien en tout ?', ['16'], '6 + 10…', { type: 'calc', v: 16 }),
          E('« Noir et amer, je réveille les voyageurs endormis. » Qui suis-je ?', ['CAFÉ'], 'Servi brûlant au petit matin.')
        ]),
        P('montre', 'La montre brisée', '⌚', 'Arrêtée net. Mais à quelle heure exactement ?', [
          E('À 3 h pile, les aiguilles forment un angle droit. À quelle autre heure pile (entre 1 h et 12 h) forment-elles aussi un angle droit ?', ['9', '9H', 'NEUF', '21H'], 'Symétrique de 3 h.'),
          E('« J’ai des aiguilles mais je ne couds jamais. » Qui suis-je ?', ['MONTRE', 'HORLOGE', 'PENDULE', 'RÉVEIL'], 'Tic, tac…'),
          E('Cette montre retarde de 5 minutes par heure. Réglée juste à 20 h, quelle heure affichait-elle à 2 h du matin ? (par exemple : 1h05)', ['1H30', '0130', '130', '01H30'], 'Six heures de retard à 5 minutes…')
        ]),
        P('registre', 'Le registre des passagers', '🗂️', 'Un nom y a été soigneusement gratté.', [
          E('Sous le nom gratté, un mot à l’envers : TERCES', ['SECRET'], 'De droite à gauche.', { type: 'envers', code: 'TERCES' }),
          E('Le registre compte 12 voyageurs en première classe et deux fois plus en seconde. Combien de voyageurs en tout ?', ['36'], '12 + 24…', { type: 'calc', v: 36 }),
          E('« Je relie deux voitures : on m’accroche et on me décroche. » Qui suis-je ?', ['ATTELAGE', 'CROCHET'], 'Entre deux wagons.')
        ])
      ]
    },
    {
      id: 'paquebot', titre: 'LE PAQUEBOT', nom: 'L’affaire de l’Étoile des mers',
      lieuTexte: 'À bord de l’Étoile des mers, en plein Atlantique.', victime: 'l’armateur Victor Delorme', heure: '22 h 50',
      intro: 'Pas d’escale avant trois jours. **L’armateur Victor Delorme** a été retrouvé sans vie à bord, et la cloche de la passerelle a sonné l’alarme à **22 h 50**. Le coupable n’a nulle part où fuir : **il est à bord**.',
      suspects: [
        S('vallier', 'Hortense Vallier, la milliardaire', true, 320, 'Elle voulait racheter la compagnie à tout prix.', 'Hortense Vallier'),
        S('zephyr', 'Zéphyr, le magicien de bord', false, 260, 'Ses tours cachent peut-être autre chose.', 'Zéphyr'),
        S('kerlan', 'Yves Kerlan, l’officier radio', false, 195, 'Il lit tous les messages du navire.', 'Yves Kerlan'),
        S('brun', 'Agathe Brun, la romancière', true, 20, 'Son prochain roman policier ressemble beaucoup à la vie de Delorme.', 'Agathe Brun'),
        S('delsol', 'Rodrigue Delsol, le joueur', false, 60, 'Il a tout perdu au poker contre l’armateur.', 'Rodrigue Delsol')
      ],
      lieux: [
        L('passerelle', 'La passerelle', 'sur la passerelle', 'de la passerelle', '🧭', ['haut']),
        L('machines', 'La salle des machines', 'dans la salle des machines', 'de la salle des machines', '⚙️', []),
        L('fumoir', 'Le fumoir', 'dans le fumoir', 'du fumoir', '🚬', ['moquette']),
        L('cabine', 'La cabine de luxe', 'dans la cabine de luxe', 'de la cabine de luxe', '🛏️', ['haut', 'moquette']),
        L('pont', 'Le pont promenade', 'sur le pont promenade', 'du pont promenade', '🌊', ['haut', 'dehors'])
      ],
      autres: [
        L('salle', 'La salle à manger', 'dans la salle à manger', 'de la salle à manger', '🍽️', []),
        L('bar', 'Le bar', 'au bar', 'du bar', '🍸', [])
      ],
      tags: {
        haut: { ic: '⬆️', nom: 'ponts supérieurs',
          oui: '🛗 L’ascenseur a été appelé vers les ponts supérieurs juste avant l’alarme : **le crime a eu lieu sur les ponts supérieurs.**',
          non: '🛗 L’ascenseur n’a pas bougé des ponts inférieurs de la soirée : **le crime n’a pas eu lieu sur les ponts supérieurs.**' },
        moquette: { ic: '🧶', nom: 'moquette',
          oui: '🧶 Des fibres de moquette bleue sur les genoux de la victime : **le sol du lieu du crime est couvert de moquette.**',
          non: '🧶 Pas une fibre sur ses vêtements : **le sol du lieu du crime n’a pas de moquette.**' },
        dehors: { ic: '🌊', nom: 'à l’air libre',
          oui: '🌊 Les cheveux de la victime sont poisseux d’embruns salés : **le crime a eu lieu à l’air libre.**',
          non: '🌊 Pas une goutte d’embrun sur la victime : **le crime a eu lieu à l’abri, à l’intérieur.**' }
      },
      armes: [
        A('sextant', 'Le sextant de laiton', false, '📐', 'coup', 'passerelle'),
        A('bouteille', 'La bouteille de champagne', true, '🍾', 'coup', 'fumoir'),
        A('harpon', 'Le harpon décoratif', false, '🔱', 'lame', 'pont'),
        A('couteau', 'Le couteau de plongée', false, '🔪', 'lame', 'machines'),
        A('filin', 'Le filin d’amarrage', false, '🪢', 'lien', 'pont')
      ],
      temoins: ['le commissaire de bord Jaouen', 'Nell, la femme de chambre,', 'Tim, le mousse,'],
      pistes: [
        P('journal', 'Le journal de bord', '📘', 'Tenu au jour le jour par le commandant.', [
          E('« Le navire a filé 20 nœuds pendant 3 heures. » Combien de milles marins a-t-il parcourus ?', ['60'], 'Un nœud, c’est un mille par heure.', { type: 'calc', v: 60 }),
          E('Quand on regarde vers l’avant du navire, comment appelle-t-on le côté gauche ?', ['BÂBORD'], 'L’autre, c’est tribord.'),
          E('Chaque lettre a avancé d’un pas dans l’alphabet : QIBSF', ['PHARE'], 'Q devient P…', { type: 'cesar', code: 'QIBSF', d: 1 })
        ]),
        P('bouteille', 'La bouteille à la mer', '🍾', 'Un message roulé, à peine lisible.', [
          E('Un mot écrit à l’envers : NAECO', ['OCÉAN'], 'Tout autour du navire.', { type: 'envers', code: 'NAECO' }),
          E('« Je montre toujours le nord, même dans la tempête. » Qui suis-je ?', ['BOUSSOLE', 'COMPAS'], 'Une aiguille aimantée.'),
          E('« Je monte et je descends deux fois par jour, sans jamais quitter le rivage. » Qui suis-je ?', ['MARÉE'], 'Haute ou basse.')
        ]),
        P('coffre', 'Le coffre du commissaire', '🔐', 'Il garde les objets de valeur des passagers.', [
          E('Cadenas : les jours de la traversée (7) multipliés par les repas servis chaque jour (3).', ['21'], '7 × 3…', { type: 'calc', v: 21 }),
          E('Anagramme : R-O-S-E-T-R. Ce que le coffre protège.', ['TRÉSOR'], 'Des bijoux, de l’or…', { type: 'anagramme', code: 'ROSETR' }),
          E('« On me jette à l’eau pour que le navire s’arrête, et je reste accrochée au fond. » Qui suis-je ?', ['ANCRE'], 'Au bout d’une grosse chaîne.')
        ]),
        P('telegraphiste', 'Le télégraphiste', '📡', 'Kerlan n’est pas le seul à écouter les ondes…', [
          E('Un message codé, A=1, B=2… : 13-5-18', ['MER'], 'M est la 13e lettre.', { type: 'rangs', code: [13, 5, 18] }),
          E('« Invisible, je traverse l’océan à la vitesse de la lumière jusqu’au poste radio. » Qui suis-je ?', ['ONDE', 'ONDE RADIO'], 'Hertzienne…'),
          E('Suite des fréquences : 3, 6, 12, 24… Quel nombre ensuite ?', ['48'], 'Chaque nombre double.', { type: 'calc', v: 48 })
        ]),
        P('malle', 'La malle-cabine', '🧳', 'Une malle de voyage aux initiales dorées.', [
          E('« J’ai des épaules mais pas de tête, et je garde les costumes bien droits. » Qui suis-je ?', ['CINTRE'], 'Dans la penderie.'),
          E('Cadenas : l’année du naufrage du Titanic, 1912, chiffres additionnés.', ['13'], '1 + 9 + 1 + 2…', { type: 'calc', v: 13 }),
          E('Mot brodé à l’envers sur la doublure : EGAYOV', ['VOYAGE'], 'Ce que fait la malle.', { type: 'envers', code: 'EGAYOV' })
        ]),
        P('carte', 'La carte marine', '🗺️', 'Une route tracée au crayon… puis effacée.', [
          E('Anagramme au crayon : L-E-I. Un bout de terre au milieu de l’océan.', ['ÎLE'], 'Robinson y a vécu.', { type: 'anagramme', code: 'LEI' }),
          E('« J’ai des méridiens mais je ne suis pas une horloge, et je tourne sur mon axe. » Qui suis-je ?', ['GLOBE', 'TERRE', 'MAPPEMONDE'], 'Sur le bureau du commandant.'),
          E('Le navire suit le cap 90 (plein est), puis fait demi-tour. Quel cap suit-il maintenant ?', ['270', 'OUEST'], 'Un demi-tour, c’est 180 degrés.')
        ])
      ]
    },
    {
      id: 'chalet', titre: 'L’HÔTEL DES CIMES', nom: 'L’affaire de l’hôtel des Cimes',
      lieuTexte: 'Hôtel des Cimes, 2 400 mètres d’altitude.', victime: 'le champion de ski Bruno Lagarde', heure: '22 h 30',
      intro: 'Une avalanche a coupé la seule route. **Le champion de ski Bruno Lagarde** a été retrouvé sans vie dans l’hôtel ; son chronomètre s’est arrêté à **22 h 30**. Personne n’a pu redescendre : le coupable est **là-haut, avec nous**.',
      suspects: [
        S('barral', 'Chloé Barral, la monitrice', true, 350, 'Son ancienne coéquipière, écartée de l’équipe.', 'Chloé Barral'),
        S('andersen', 'Nils Andersen, le rival', false, 205, 'Éternel second, derrière Lagarde.', 'Nils Andersen'),
        S('roche', 'Fernand Roche, l’hôtelier', false, 35, 'Lagarde voulait racheter son hôtel pour une bouchée de pain.', 'Fernand Roche'),
        S('vidal', 'Maud Vidal, la photographe', true, 285, 'Elle possédait des clichés compromettants.', 'Maud Vidal'),
        S('castaing', 'Jean-Loup Castaing, le sponsor', false, 130, 'Il perdait une fortune si Lagarde prenait sa retraite.', 'Jean-Loup Castaing')
      ],
      lieux: [
        L('localskis', 'Le local à skis', 'dans le local à skis', 'du local à skis', '🎿', ['vue']),
        L('salon', 'Le salon cheminée', 'dans le salon cheminée', 'du salon cheminée', '🔥', ['chaud', 'vue']),
        L('sauna', 'Le sauna', 'dans le sauna', 'du sauna', '🧖', ['chaud']),
        L('chambre12', 'La chambre 12', 'dans la chambre 12', 'de la chambre 12', '🛏️', ['etage', 'vue']),
        L('grenier', 'Le grenier', 'dans le grenier', 'du grenier', '🕸️', ['etage'])
      ],
      autres: [
        L('salle', 'La salle à manger', 'dans la salle à manger', 'de la salle à manger', '🍲', []),
        L('bar', 'Le bar', 'au bar', 'du bar', '🍸', [])
      ],
      tags: {
        etage: { ic: '⬆️', nom: 'à l’étage',
          oui: '🔊 Irène, en cuisine, a entendu un choc au plafond : **le crime a eu lieu à l’étage.**',
          non: '🔊 Le choc a fait vibrer le plancher de la cuisine, au même niveau : **le crime n’a pas eu lieu à l’étage.**' },
        chaud: { ic: '🌡️', nom: 'pièce surchauffée',
          oui: '🌡️ Le corps était encore brûlant bien après le crime : **la pièce du crime était surchauffée.**',
          non: '🌡️ Le corps s’est refroidi très vite : **la pièce du crime n’était pas surchauffée.**' },
        vue: { ic: '🏔️', nom: 'fenêtre sur les pistes',
          oui: '🏔️ De la neige fondue sous une fenêtre mal fermée : **la pièce du crime a une fenêtre sur les pistes.**',
          non: '🏔️ Pas un flocon, pas un courant d’air : **la pièce du crime n’a aucune fenêtre sur les pistes.**' }
      },
      armes: [
        A('trophee', 'Le trophée de cristal', false, '🏆', 'coup', 'salon'),
        A('genepi', 'La bouteille de génépi', true, '🍾', 'coup', 'bar'),
        A('piolet', 'Le piolet', false, '⛏️', 'lame', 'localskis'),
        A('couteau', 'Le couteau à fromage', false, '🔪', 'lame', 'chambre12'),
        A('corde', 'La corde d’escalade', true, '🪢', 'lien', 'grenier')
      ],
      temoins: ['Gustave, le veilleur de nuit,', 'Irène, la cuisinière,', 'Tom, le pisteur,'],
      pistes: [
        P('registre', 'Le registre de l’hôtel', '📒', 'Les arrivées et les départs de la semaine.', [
          E('« 18 chambres, dont un tiers occupées. » Combien de chambres occupées ?', ['6'], '18 ÷ 3…', { type: 'calc', v: 6 }),
          E('Un mot écrit à l’envers : EHCNALAVA', ['AVALANCHE'], 'Ce qui a coupé la route.', { type: 'envers', code: 'EHCNALAVA' }),
          E('« Pointue comme une dague, je pends au bord du toit en hiver et je fonds au printemps. » Qui suis-je ?', ['STALACTITE', 'GLAÇON', 'CHANDELLE DE GLACE'], 'De la glace…')
        ]),
        P('trophee', 'Le trophée brisé', '🏆', 'Un morceau manque… et le socle était creux.', [
          E('Sur le socle : « Premier, l’or ; deuxième, l’argent ; troisième… ? »', ['BRONZE'], 'Un alliage de cuivre.'),
          E('Anagramme : L-A-D-M-I-E-L-E. Ce que Lagarde gagnait.', ['MÉDAILLE'], 'Elle se porte autour du cou.', { type: 'anagramme', code: 'LADMIELE' }),
          E('Lagarde a gagné 4 courses par saison pendant 6 saisons, puis 3 de plus. Combien de victoires en tout ?', ['27'], '24 + 3…', { type: 'calc', v: 27 })
        ]),
        P('carte', 'La carte des pistes', '🗺️', 'Des pistes entourées au feutre rouge.', [
          E('Verte, bleue, rouge… Quelle est la couleur des pistes les plus difficiles ?', ['NOIRE', 'NOIR'], 'Celle des experts.'),
          E('Le téléphérique monte de 1 200 m à 2 700 m en 5 minutes. Combien de mètres par minute ?', ['300'], '1 500 ÷ 5…', { type: 'calc', v: 300 }),
          E('« Je glisse sans roues, et on me fixe aux pieds. » Qui suis-je ?', ['SKI'], 'Lagarde en était le champion.')
        ]),
        P('veilleur', 'Le veilleur de nuit', '🔦', 'Gustave a tout vu… mais il faut le faire parler.', [
          E('« Plus il y en a, moins on voit. » Qu’est-ce ?', ['NOIR', 'OBSCURITÉ', 'BROUILLARD', 'NUIT'], 'Éteignez la lumière…'),
          E('« Ma ronde revient toutes les 40 minutes depuis 19 h. » À quelle heure commence la 6e ronde ? (par exemple : 21h20)', ['22H20', '2220'], 'Cinq fois 40 minutes après 19 h.'),
          E('« Je vous éclaire dans le noir, et je tiens dans la main. » Qui suis-je ?', ['LAMPE', 'TORCHE', 'LAMPE TORCHE', 'LAMPE DE POCHE'], 'Gustave ne la lâche jamais.')
        ]),
        P('casier', 'Le casier n°7', '🔐', 'Le casier personnel du champion.', [
          E('Chaque lettre a avancé d’un pas dans l’alphabet : TPNNFU', ['SOMMET'], 'T devient S…', { type: 'cesar', code: 'TPNNFU', d: 1 }),
          E('Cadenas : le numéro du casier, au cube, moins 300.', ['43'], '7 × 7 × 7 = 343…', { type: 'calc', v: 43 }),
          E('« On me chausse et on me déchausse, dur et serré à la cheville, et je me clipse sur le ski. » Qui suis-je ?', ['CHAUSSURE', 'CHAUSSURE DE SKI', 'BOTTE'], 'Aux pieds du skieur.')
        ]),
        P('photo', 'L’appareil photo', '📷', 'La pellicule n’a pas été développée…', [
          E('« Plus on me développe, plus on y voit clair. » Qui suis-je ?', ['PELLICULE', 'PHOTO', 'PHOTOGRAPHIE'], 'Elle se roule dans l’appareil.'),
          E('Anagramme au dos d’un cliché : H-S-A-L-F.', ['FLASH'], 'Il éblouit une fraction de seconde.', { type: 'anagramme', code: 'HSALF' }),
          E('Maud a utilisé 3 pellicules de 36 photos et la moitié d’une quatrième. Combien de photos ?', ['126'], '108 + 18…', { type: 'calc', v: 126 })
        ])
      ]
    },
    {
      id: 'cirque', titre: 'LE CIRQUE', nom: 'L’affaire du Grand Cirque Zanetti',
      lieuTexte: 'Grand Cirque Zanetti, après la dernière représentation.', victime: 'Monsieur Loyal', heure: '23 h 45',
      intro: 'Les lumières du chapiteau venaient de s’éteindre. **Monsieur Loyal** a été retrouvé sans vie : sa montre de gousset s’est arrêtée à **23 h 45**. Les roulottes ne partent qu’à l’aube : le coupable est **dans la troupe**.',
      suspects: [
        S('esmeralda', 'Esmeralda, la trapéziste', true, 300, 'Monsieur Loyal voulait la remplacer par une plus jeune.', 'Esmeralda'),
        S('brutus', 'Brutus, le dompteur', false, 25, 'Endetté jusqu’au cou auprès du directeur.', 'Brutus'),
        S('pipo', 'Pipo, le clown', false, 50, 'Derrière le maquillage, une vieille rancune.', 'Pipo'),
        S('zelda', 'Madame Zelda, la voyante', true, 270, 'Elle avait « prédit » la mort de Monsieur Loyal.', 'Madame Zelda'),
        S('ivan', 'Ivan, l’hercule', false, 190, 'Le directeur l’avait humilié devant toute la troupe.', 'Ivan')
      ],
      lieux: [
        L('piste', 'La piste aux étoiles', 'sur la piste aux étoiles', 'de la piste', '🎪', ['sciure', 'toile']),
        L('menagerie', 'La ménagerie', 'dans la ménagerie', 'de la ménagerie', '🦁', ['sciure', 'fauves']),
        L('roulotte', 'La roulotte de Zelda', 'dans la roulotte de Zelda', 'de la roulotte de Zelda', '🔮', []),
        L('coulisses', 'Les coulisses', 'dans les coulisses', 'des coulisses', '🎭', ['fauves', 'toile']),
        L('trapeze', 'La plateforme du trapèze', 'sur la plateforme du trapèze', 'de la plateforme du trapèze', '🤸', ['toile'])
      ],
      autres: [
        L('buvette', 'La buvette', 'à la buvette', 'de la buvette', '🍿', []),
        L('cantine', 'La caravane-cantine', 'dans la caravane-cantine', 'de la caravane-cantine', '🚐', [])
      ],
      tags: {
        sciure: { ic: '🪵', nom: 'sol de sciure',
          oui: '🪵 De la sciure fraîche dans les revers du pantalon de la victime : **le crime a eu lieu sur un sol de sciure.**',
          non: '🪵 Pas un grain de sciure sur la victime : **le sol du lieu du crime n’est pas en sciure.**' },
        fauves: { ic: '🦁', nom: 'odeur de fauve',
          oui: '🦁 Les vêtements de la victime empestent le fauve : **le crime a eu lieu près des cages.**',
          non: '🦁 Aucune odeur de fauve sur la victime : **le crime a eu lieu loin des cages.**' },
        toile: { ic: '⛺', nom: 'sous le chapiteau',
          oui: '⛺ Des paillettes du chapiteau collées aux semelles de la victime : **le crime a eu lieu sous le chapiteau.**',
          non: '⛺ Pas une paillette sur la victime : **le crime a eu lieu hors du chapiteau.**' }
      },
      armes: [
        A('massue', 'La massue de jongleur', true, '🎳', 'coup', 'piste'),
        A('haltere', 'L’haltère de l’hercule', false, '🏋️', 'coup', 'coulisses', 'ivan'),
        A('couteau', 'Le couteau du lanceur', false, '🔪', 'lame', 'piste'),
        A('sabre', 'Le sabre de l’avaleur', false, '⚔️', 'lame', 'coulisses'),
        A('fouet', 'Le fouet du dompteur', false, '🪢', 'lien', 'menagerie', 'brutus')
      ],
      temoins: ['Tonio, le palefrenier,', 'Mimi, l’écuyère,', 'le vieux Sam, le gardien,'],
      pistes: [
        P('malle', 'La malle du magicien', '🎩', 'Un double fond, évidemment.', [
          E('Chaque lettre a avancé d’un pas dans l’alphabet : KPOHMFVS', ['JONGLEUR'], 'K devient J…', { type: 'cesar', code: 'KPOHMFVS', d: 1 }),
          E('« Plus on m’en enlève, plus je deviens grand. » Qui suis-je ?', ['TROU'], 'Creusez…'),
          E('« On me sort d’un chapeau haut de forme, et j’ai de longues oreilles. » Qui suis-je ?', ['LAPIN'], 'Il aime les carottes.')
        ]),
        P('affiche', 'L’affiche déchirée', '📜', 'Il manque un morceau… au mauvais endroit.', [
          E('Anagramme sur l’affiche : P-A-T-E-A-U-C-H-I.', ['CHAPITEAU'], 'La grande tente.', { type: 'anagramme', code: 'PATEAUCHI' }),
          E('« Je fais rire les enfants avec mon nez rouge et mes grandes chaussures. » Qui suis-je ?', ['CLOWN', 'AUGUSTE'], 'Pipo en est un.'),
          E('Au guichet : trois places adultes à 12 francs et deux places enfants à moitié prix. Combien en tout ?', ['48'], '36 + 12…', { type: 'calc', v: 48 })
        ]),
        P('boule', 'La boule de cristal', '🔮', 'Madame Zelda y lit l’avenir… et y cache des choses.', [
          E('« Je vous dis la bonne aventure contre une pièce. » Qui suis-je ?', ['VOYANTE', 'DEVINERESSE', 'CARTOMANCIENNE', 'DIVINATION'], 'Madame Zelda en est une.'),
          E('Suite mystique : 1, 4, 9, 16, 25… Quel nombre ensuite ?', ['36'], 'Les carrés : 1×1, 2×2…', { type: 'calc', v: 36 }),
          E('Un mot à l’envers dans le cristal : NITSED', ['DESTIN'], 'Ce que lit la voyante.', { type: 'envers', code: 'NITSED' })
        ]),
        P('comptes', 'Le livre de comptes', '📒', 'Les dettes de chacun, noir sur blanc.', [
          E('Brutus doit 1 200 francs et rembourse 150 francs par mois. En combien de mois sera-t-il quitte ?', ['8'], '1 200 ÷ 150…', { type: 'calc', v: 8 }),
          E('« Je suis le roi des animaux, et je rugis sous le chapiteau. » Qui suis-je ?', ['LION'], 'Brutus le dompte.'),
          E('Code, A=1, B=2… : 16-9-19-20-5', ['PISTE'], 'P est la 16e lettre.', { type: 'rangs', code: [16, 9, 19, 20, 5] })
        ]),
        P('palefrenier', 'Le palefrenier', '🐴', 'Tonio soigne les chevaux… et écoute aux portes.', [
          E('« J’ai quatre fers, mais je ne repasse rien. » Qui suis-je ?', ['CHEVAL'], 'Il galope sur la piste.'),
          E('« On saute à travers moi, parfois enflammé. » Qui suis-je ?', ['CERCEAU', 'CERCLE', 'ANNEAU'], 'Rond comme la piste.'),
          E('Dans l’écurie : 5 chevaux et 3 poneys. Combien de fers faut-il pour tous les ferrer ?', ['32'], '8 bêtes à 4 fers…', { type: 'calc', v: 32 })
        ]),
        P('billets', 'Le coffre à billets', '🎟️', 'La recette de la soirée… entamée.', [
          E('Cadenas : 25 rangées de 12 sièges, moins 13 places vides ce soir. Combien de spectateurs ?', ['287'], '300 – 13…', { type: 'calc', v: 287 }),
          E('« On me déchire à l’entrée, et je reste en souvenir. » Qui suis-je ?', ['BILLET', 'TICKET'], 'On l’achète au guichet.'),
          E('Anagramme griffonnée par Monsieur Loyal : R-E-G-N-A-D. Un mot qu’il criait avant le numéro des fauves.', ['DANGER'], '« Attention… »', { type: 'anagramme', code: 'REGNAD' })
        ])
      ]
    }
  ];

  /* ================================================================
   * 3. Les rôles d'enquêteurs
   * ================================================================ */
  var CLUE_POWER = 'Vous détenez des informations confidentielles : partagez-les au bon moment !';
  var ROLES = [
    { id: 'detective', nom: 'Le Détective', icone: '🔍', flavor: 'Un fin limier à qui rien n’échappe.',
      pouvoir: 'Votre premier indice d’énigme est gratuit.' },
    { id: 'cryptographe', nom: 'La Cryptographe', icone: '🔐', flavor: 'Les codes n’ont aucun secret pour vous.',
      pouvoir: 'Vous voyez la première lettre de chaque réponse d’énigme.' },
    { id: 'inspecteur', nom: 'L’Inspecteur', icone: '🎖️', flavor: 'Trente ans de terrain, un instinct sûr.',
      pouvoir: 'Après une accusation ratée, vous seul apprenez combien d’éléments étaient justes.' },
    { id: 'serrurier', nom: 'Le Serrurier', icone: '🗝️', flavor: 'Aucune serrure ne vous résiste.',
      pouvoir: 'Vous voyez l’indice de chaque énigme sans avoir à le demander.' },
    { id: 'archiviste', nom: 'L’Archiviste', icone: '📚', flavor: 'Vous connaissez les lieux mieux que leurs murs.',
      pouvoir: 'Vous savez ce que chaque piste peut révéler : suspect, arme ou lieu.' },
    { id: 'voyante', nom: 'La Voyante', icone: '🔮', flavor: 'Les esprits vous soufflent des vérités.',
      pouvoir: 'Vous démarrez avec une information confidentielle de plus.' },
    { id: 'medecin', nom: 'La Médecin légiste', icone: '⚕️', flavor: 'Le corps de la victime vous a déjà parlé.', pouvoir: CLUE_POWER },
    { id: 'journaliste', nom: 'Le Journaliste', icone: '📰', flavor: 'Vos sources parlent, toujours.', pouvoir: CLUE_POWER },
    { id: 'garde', nom: 'La Garde du corps', icone: '🛡️', flavor: 'Vous étiez là, dans l’ombre, ce soir-là.', pouvoir: CLUE_POWER },
    { id: 'majordome', nom: 'Le Majordome', icone: '🎩', flavor: 'Rien ne se passe ici sans que vous le sachiez.', pouvoir: CLUE_POWER },
    { id: 'romanciere', nom: 'La Romancière', icone: '✒️', flavor: 'Vous avez l’œil pour les intrigues.', pouvoir: CLUE_POWER },
    { id: 'photographe', nom: 'Le Photographe', icone: '📷', flavor: 'Votre objectif a tout vu, ou presque.', pouvoir: CLUE_POWER }
  ];

  var NIVEAUX = {
    facile: { nom: 'Facile', ic: '🕯️', essais: 3, extras: 2, desc: 'Quelques indices en plus, trois accusations.' },
    normal: { nom: 'Normal', ic: '🔎', essais: 2, extras: 1, desc: 'L’enquête telle qu’elle se présente.' },
    expert: { nom: 'Retors', ic: '🧠', essais: 2, extras: 0, desc: 'Chaque indice compte : aucun n’est de trop.' }
  };

  /* ================================================================
   * 4. Outils
   * ================================================================ */
  function byId(list, id) {
    for (var i = 0; i < (list || []).length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function fmt(t, m) {
    return String(t).replace(/\{(\w+)\}/g, function (x, k) { return m[k] !== undefined ? m[k] : x; });
  }
  function minus(s) { return s ? s.charAt(0).toLowerCase() + s.slice(1) : s; }
  function maj(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  /* Normalisation tolérante d'une réponse : majuscules sans accents, les
     petits mots de tête retirés (« une horloge », « c’est la clé »…). */
  var VIDES = ['LE', 'LA', 'LES', 'L', 'UN', 'UNE', 'DES', 'DU', 'DE', 'D', 'MON', 'MA', 'MES',
    'TON', 'TA', 'TES', 'SON', 'SA', 'SES', 'NOTRE', 'NOS', 'VOTRE', 'VOS', 'LEUR', 'LEURS',
    'CE', 'CET', 'CETTE', 'CES', 'C', 'CEST', 'EST', 'IL', 'ELLE', 'SAGIT', 'S', 'AGIT', 'AU',
    'AUX', 'EN', 'A', 'ET', 'JE', 'SUIS', 'TU', 'ES', 'VOUS', 'ETES', 'ON', 'DIT'];
  function norm(s) {
    return String(s == null ? '' : s).toUpperCase()
      .replace(/Œ/g, 'OE').replace(/Æ/g, 'AE')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Z0-9]/g, '');
  }
  function normRep(s) {
    var t = String(s == null ? '' : s).toUpperCase()
      .replace(/Œ/g, 'OE').replace(/Æ/g, 'AE')
      .normalize('NFD').replace(/[̀-ͯ]/g, '');
    var mots = t.replace(/[^A-Z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
    while (mots.length > 1 && VIDES.indexOf(mots[0]) !== -1) mots.shift();
    return mots.join('');
  }
  function sansPluriel(n) { return n.length > 3 ? n.replace(/[SX]$/, '') : n; }
  function accepte(reponse, answers) {
    var r = normRep(reponse);
    if (!r) return false;
    var num = /^(\d+)/.exec(r);
    return (answers || []).some(function (a) {
      var n = normRep(a);
      if (!n) return false;
      if (n === r || sansPluriel(n) === sansPluriel(r)) return true;
      // « 8 jours », « 35 ans » : le nombre suffit
      return /^\d+$/.test(n) && num && num[1] === n && !/^\d+H\d/.test(r);
    });
  }

  /* ================================================================
   * 5. Le moteur de l'enquête : faits, solveur, générateur
   *
   * Un fait est un objet {t, …} ; types :
   *   dit   {par, at:[[qui, lieu]…], seul}  témoignage (le coupable ment)
   *   vu    {at:[[qui, lieu]]}              observation fiable d'un témoin
   *   vide  {lieu}                           personne dans ce lieu au moment du crime
   *   trait {qui, trait, v}                  signe particulier d'un suspect
   *   coupTrait {trait, v}                   ce que la scène dit du coupable
   *   armeKind {k, v}                        nature de l'arme (légiste)
   *   armeAt {arme, lieu}                    une arme n'a pas quitté ce lieu
   *   armeMain {arme, qui}                   une arme ne quitte jamais ce suspect
   *   armeHors {arme}                        cette arme n'a pas servi
   *   lieuTag {tag, v}                       propriété de la pièce du crime
   * ================================================================ */
  function aTag(scen, lieuId, tag) {
    var l = byId(scen.lieux, lieuId);
    return !!(l && l.tags.indexOf(tag) !== -1);
  }
  function kindOf(scen, armeId) {
    var a = byId(scen.armes, armeId);
    return a ? a.kind : '';
  }

  /* Le triplet (c, w, l) est-il compatible avec ces faits ? */
  function compatible(scen, c, w, l, faits) {
    var pos = {}, seuls = [], vides = [], sait = {}, crime = [];
    var i, j, f;
    for (i = 0; i < faits.length; i++) {
      f = faits[i];
      switch (f.t) {
        case 'dit':
          if (f.par === c) break; // le coupable ment : sa parole ne vaut rien
          /* falls through */
        case 'vu':
          for (j = 0; j < f.at.length; j++) {
            var qui = f.at[j][0], ou = f.at[j][1];
            if (pos[qui] !== undefined && pos[qui] !== ou) return false;
            pos[qui] = ou;
          }
          if (f.seul) seuls.push(f.at[0][0]);
          break;
        case 'vide': if (f.lieu === l) return false; vides.push(f.lieu); break;
        case 'trait': sait[f.qui + ':' + f.trait] = f.v; break;
        case 'coupTrait': crime.push(f); break;
        case 'armeKind': if ((kindOf(scen, w) === f.k) !== f.v) return false; break;
        case 'armeAt': if (w === f.arme && l !== f.lieu) return false; break;
        case 'armeMain': if (w === f.arme && c !== f.qui) return false; break;
        case 'armeHors': if (w === f.arme) return false; break;
        case 'lieuTag': if (aTag(scen, l, f.tag) !== f.v) return false; break;
      }
    }
    for (i = 0; i < crime.length; i++) {
      var k = sait[c + ':' + crime[i].trait];
      if (k !== undefined && k !== crime[i].v) return false;
    }
    var noms = Object.keys(pos);
    for (i = 0; i < noms.length; i++) {
      var x = noms[i];
      if (x === c) { if (pos[x] !== l) return false; } else if (pos[x] === l) return false;
      if (vides.indexOf(pos[x]) !== -1) return false;
    }
    for (i = 0; i < seuls.length; i++) {
      var s0 = seuls[i];
      for (j = 0; j < noms.length; j++) {
        if (noms[j] !== s0 && pos[noms[j]] === pos[s0]) return false;
      }
      // le coupable était sur les lieux : personne d'autre ne pouvait y être « seul »
      if (pos[s0] === l && s0 !== c) return false;
    }
    return true;
  }

  /* Tous les triplets compatibles (le solveur). « parmi » : ne tester que
     ces triplets-là (ajouter un fait ne peut que réduire la liste). */
  function solveur(scen, faits, parmi) {
    var out = [];
    if (parmi) {
      parmi.forEach(function (t) { if (compatible(scen, t[0], t[1], t[2], faits)) out.push(t); });
      return out;
    }
    scen.suspects.forEach(function (s) {
      scen.armes.forEach(function (a) {
        scen.lieux.forEach(function (l) {
          if (compatible(scen, s.id, a.id, l.id, faits)) out.push([s.id, a.id, l.id]);
        });
      });
    });
    return out;
  }
  function nbCandidats(scen, faits, parmi) { return solveur(scen, faits, parmi).length; }

  /* ---- textes des faits ---- */
  function nomS(scen, id) { var s = byId(scen.suspects, id); return s ? (s.txt || s.nom.split(',')[0]) : '?'; }
  /* « de » + nom : du colonel, de la baronne, d’Hector, de Pipo */
  function deX(t) {
    if (/^le /.test(t)) return 'du ' + t.slice(3);
    if (/^la /.test(t)) return 'de la ' + t.slice(3);
    if (/^[AEIOUYHÀÂÉÈÊËÎÏÔÙÛÜ]/i.test(t)) return 'd’' + t;
    return 'de ' + t;
  }
  function fem(scen, id) { var s = byId(scen.suspects, id); return s && s.f ? 'e' : ''; }
  function lieuInfo(scen, id) {
    if (id && id.indexOf('ch_') === 0) {
      return { dans: 'dans sa chambre', de: 'de sa chambre', nom: 'Sa chambre', icone: '🛏️' };
    }
    return byId(scen.lieux, id) || byId(scen.autres, id) || { dans: '?', de: '?', nom: '?', icone: '❔' };
  }

  function texteTemoignage(scen, f) {
    var e = fem(scen, f.par), ou = f.at[0][1], h = scen.heure;
    if (ou.indexOf('ch_') === 0) return '« À ' + h + ', je dormais dans ma chambre, porte fermée. »';
    var li = lieuInfo(scen, ou);
    if (f.at.length > 1) return '« À ' + h + ', j’étais ' + li.dans + ', avec ' + nomS(scen, f.at[1][0]) + '. »';
    if (f.seul) return '« À ' + h + ', j’étais seul' + e + ' ' + li.dans + '. »';
    return '« À ' + h + ', j’étais ' + li.dans + '. »';
  }

  /* Deux versions de chaque fait : « piste » (on vous le rapporte) et
     « perso » (vous le savez vous-même, dans votre dossier secret). */
  function textes(scen, f) {
    var T = pick(scen.temoins), h = scen.heure, a, li, tr;
    switch (f.t) {
      case 'vu':
        li = lieuInfo(scen, f.at[0][1]);
        if (f.at[0][1].indexOf('ch_') === 0) {
          return ['👁️ ' + maj(T) + ' a vu ' + nomS(scen, f.at[0][0]) + ' regagner sa chambre avant ' + h + ' et n’en ressortir qu’au matin.',
            '👁️ Vous avez vu ' + nomS(scen, f.at[0][0]) + ' regagner sa chambre avant ' + h + ' et n’en ressortir qu’au matin.'];
        }
        return ['👁️ ' + maj(T) + ' a vu ' + nomS(scen, f.at[0][0]) + ' ' + li.dans + ' à ' + h + ' précises.',
          '👁️ Vous avez aperçu ' + nomS(scen, f.at[0][0]) + ' ' + li.dans + ' à ' + h + ' précises.'];
      case 'vide':
        li = lieuInfo(scen, f.lieu);
        return ['🚪 Personne n’était ' + li.dans + ' à ' + h + ' : ' + T + ' en gardait la porte et n’a vu entrer personne.',
          '🚪 À ' + h + ', vous gardiez la porte ' + li.de + ' : personne n’était à l’intérieur.'];
      case 'trait':
        tr = TRAITS[f.trait];
        var cl = fmt(f.v ? tr.oui : tr.non, { X: nomS(scen, f.qui), deX: deX(nomS(scen, f.qui)), e: fem(scen, f.qui) });
        return [tr.ic + ' ' + maj(T) + ' l’affirme : ' + cl + '.', tr.ic + ' Vous l’avez remarqué : ' + cl + '.'];
      case 'coupTrait':
        tr = TRAITS[f.trait];
        return [tr.ic + ' ' + (f.v ? tr.crime : tr.crimeNon), tr.ic + ' ' + (f.v ? tr.crime : tr.crimeNon)];
      case 'armeKind':
        return [f.v ? KINDS[f.k].oui : KINDS[f.k].non, f.v ? KINDS[f.k].oui : KINDS[f.k].non];
      case 'armeAt':
        a = byId(scen.armes, f.arme); li = lieuInfo(scen, f.lieu);
        return [a.icone + ' ' + a.nom + ' est resté' + (a.f ? 'e' : '') + ' ' + li.dans + ' toute la soirée : ' + T +
          ' l’y a encore vu' + (a.f ? 'e' : '') + ' à ' + h + '.',
          a.icone + ' À ' + h + ', ' + minus(a.nom) + ' était toujours ' + li.dans + ' : vous l’avez vu' + (a.f ? 'e' : '') + ' de vos yeux.'];
      case 'armeMain':
        a = byId(scen.armes, f.arme);
        if (a.owner === f.qui) {
          return [a.icone + ' ' + a.nom + ' ne quitte jamais son propriétaire : personne d’autre que ' + nomS(scen, f.qui) + ' n’a pu s’en servir.',
            a.icone + ' Vous le savez : ' + minus(a.nom) + ' ne quitte jamais ' + nomS(scen, f.qui) + ', personne d’autre n’a pu s’en servir.'];
        }
        var lui = fem(scen, f.qui) ? 'elle' : 'lui';
        return [a.icone + ' ' + maj(nomS(scen, f.qui)) + ' a gardé ' + minus(a.nom) + ' sur ' + lui +
          ' toute la soirée : personne d’autre n’a pu s’en servir.',
          a.icone + ' Vous l’avez remarqué : ' + nomS(scen, f.qui) + ' a gardé ' + minus(a.nom) + ' sur ' + lui +
          ' toute la soirée. Personne d’autre n’a pu s’en servir.'];
      case 'armeHors':
        a = byId(scen.armes, f.arme);
        return [a.icone + ' ' + a.nom + ' a été retrouvé' + (a.f ? 'e' : '') + ' intact' + (a.f ? 'e' : '') +
          ', sous une cloche de verre scellée : **ce n’est pas l’arme du crime.**',
          a.icone + ' Vous avez vérifié : ' + minus(a.nom) + ' est intact' + (a.f ? 'e' : '') + ', sous scellés. **Ce n’est pas l’arme du crime.**'];
      case 'lieuTag':
        var tg = scen.tags[f.tag];
        return [f.v ? tg.oui : tg.non, f.v ? tg.oui : tg.non];
    }
    return ['?', '?'];
  }

  function categorie(f) {
    if (f.t === 'armeKind' || f.t === 'armeAt' || f.t === 'armeMain' || f.t === 'armeHors') return 'arme';
    if (f.t === 'lieuTag' || f.t === 'vide') return 'lieu';
    return 'suspect';
  }
  /* indice matériel (pistes) ou observation d'un témoin (dossiers secrets) */
  function estIndice(f) {
    return f.t === 'armeKind' || f.t === 'lieuTag' || f.t === 'coupTrait' || f.t === 'armeHors';
  }

  /* ---- tirage d'une vérité ---- */
  function tirerVerite(scen) {
    var v = {};
    var sus = scen.suspects.map(function (s) { return s.id; });
    v.c = pick(sus);
    v.w = pick(scen.armes).id;
    v.l = pick(scen.lieux).id;
    v.innocents = sus.filter(function (x) { return x !== v.c; });
    // où étaient les innocents à l'heure du crime (jamais sur les lieux)
    var places = [];
    scen.lieux.forEach(function (l) { if (l.id !== v.l) places.push(l.id, l.id, l.id); });
    scen.autres.forEach(function (l) { places.push(l.id); });
    v.pos = {};
    v.innocents.forEach(function (x) {
      v.pos[x] = Math.random() < 0.14 ? 'ch_' + x : pick(places);
    });
    // signes particuliers : trois par affaire, compatibles avec l'arme
    var kind = kindOf(scen, v.w);
    var dispo = Object.keys(TRAITS).filter(function (t) {
      return !TRAITS[t].compat || TRAITS[t].compat.indexOf(kind) !== -1;
    });
    v.tcase = GG.shuffle(dispo).slice(0, 3);
    v.traits = {};
    v.tcase.forEach(function (t) {
      v.traits[t] = {};
      var cv = TRAITS[t].crimeNon ? Math.random() < 0.6 : true;
      v.traits[t][v.c] = cv;
      var memes = 0;
      v.innocents.forEach(function (x) {
        var b = Math.random() < 0.5;
        v.traits[t][x] = b;
        if (b === cv) memes++;
      });
      // jamais un signe qui désigne seul le coupable : au moins un innocent le partage
      if (!memes) v.traits[t][pick(v.innocents)] = cv;
    });
    return v;
  }

  /* Les cinq témoignages (publics). Le coupable ment sur son alibi. */
  function temoignages(scen, v) {
    var out = [];
    var parLieu = {};
    v.innocents.forEach(function (x) { (parLieu[v.pos[x]] = parLieu[v.pos[x]] || []).push(x); });
    v.innocents.forEach(function (x) {
      var ou = v.pos[x], ici = parLieu[ou];
      var f = { t: 'dit', par: x, at: [[x, ou]], seul: false };
      if (ou.indexOf('ch_') === 0) f.seul = true;
      else if (ici.length > 1 && Math.random() < 0.6) {
        f.at.push([pick(ici.filter(function (y) { return y !== x; })), ou]);
      } else if (ici.length === 1 && Math.random() < 0.55) f.seul = true;
      out.push(f);
    });
    // le mensonge du coupable
    var occupes = v.innocents.map(function (x) { return v.pos[x]; }).filter(function (p) {
      return p.indexOf('ch_') !== 0;
    });
    var r = Math.random(), lie;
    if (occupes.length && r < 0.45) {
      lie = { t: 'dit', par: v.c, at: [[v.c, pick(occupes)]], seul: true, mensonge: true };
    } else if (r < 0.62) {
      lie = { t: 'dit', par: v.c, at: [[v.c, 'ch_' + v.c]], seul: true, mensonge: true };
    } else {
      var faux = scen.lieux.filter(function (l) { return l.id !== v.l; }).map(function (l) { return l.id; })
        .concat(scen.autres.map(function (l) { return l.id; }));
      lie = { t: 'dit', par: v.c, at: [[v.c, pick(faux)]], seul: false, mensonge: true };
    }
    out.push(lie);
    // ordre de présentation : celui des suspects
    var ordre = scen.suspects.map(function (s) { return s.id; });
    out.sort(function (a, b) { return ordre.indexOf(a.par) - ordre.indexOf(b.par); });
    return out;
  }

  /* Tous les faits VRAIS qu'on pourrait révéler (hors témoignages). */
  function faitsPossibles(scen, v) {
    var pool = [];
    var kinds = {};
    scen.armes.forEach(function (a) { kinds[a.kind] = true; });
    var kw = kindOf(scen, v.w);
    Object.keys(kinds).forEach(function (k) { pool.push({ t: 'armeKind', k: k, v: k === kw }); });
    scen.armes.forEach(function (a) {
      if (a.id === v.w) {
        if ((!a.owner || a.owner === v.c) && Math.random() < 0.35) pool.push({ t: 'armeMain', arme: a.id, qui: v.c });
        return;
      }
      if (Math.random() < 0.72) pool.push({ t: 'armeAt', arme: a.id, lieu: a.home });
      else pool.push({ t: 'armeMain', arme: a.id, qui: a.owner || pick(scen.suspects).id });
    });
    Object.keys(scen.tags).forEach(function (tag) {
      pool.push({ t: 'lieuTag', tag: tag, v: aTag(scen, v.l, tag) });
    });
    var occupes = {};
    v.innocents.forEach(function (x) { occupes[v.pos[x]] = true; });
    scen.lieux.forEach(function (l) {
      if (l.id !== v.l && !occupes[l.id]) pool.push({ t: 'vide', lieu: l.id });
    });
    v.innocents.forEach(function (x) { pool.push({ t: 'vu', at: [[x, v.pos[x]]] }); });
    pool.push({ t: 'vu', at: [[v.c, v.l]] });
    v.tcase.forEach(function (t) {
      var cv = v.traits[t][v.c];
      if (cv || TRAITS[t].crimeNon) pool.push({ t: 'coupTrait', trait: t, v: cv });
      scen.suspects.forEach(function (s) {
        pool.push({ t: 'trait', trait: t, qui: s.id, v: v.traits[t][s.id] });
      });
    });
    return pool;
  }

  function cleFait(f) { return JSON.stringify([f.t, f.at, f.lieu, f.qui, f.trait, f.k, f.arme, f.tag, f.v]); }

  /* Fabrique une affaire complète et vérifiée. */
  function genererAffaire(scen, n, niveau, souple) {
    var capDirect = souple ? 4 : 1, seuil = souple ? 2 : 3;
    var NV = NIVEAUX[niveau] || NIVEAUX.normal;
    for (var essai = 0; essai < (souple ? 3000 : 400); essai++) {
      var v = tirerVerite(scen);
      var pub = temoignages(scen, v);
      var candPub = solveur(scen, pub);
      if (candPub.length < 8) continue;
      var susPub = {};
      candPub.forEach(function (t) { susPub[t[0]] = true; });
      if (Object.keys(susPub).length < 2) continue;
      var pool = GG.shuffle(faitsPossibles(scen, v));
      // on privilégie un mélange : indices matériels et observations en
      // alternance ; les alibis « vu ailleurs » (trop directs) passent en
      // dernier, et un seul au plus sera retenu
      var direct = function (f) { return f.t === 'vu' && f.at[0][0] !== v.c; };
      var ind = pool.filter(estIndice), obs = pool.filter(function (f) { return !estIndice(f) && !direct(f); });
      var ordre = [];
      while (ind.length || obs.length) {
        if (ind.length && (Math.random() < 0.45 || !obs.length)) ordre.push(ind.shift());
        else ordre.push(obs.shift());
      }
      ordre = ordre.concat(pool.filter(direct));
      var choisis = [], cand = candPub, nbDirect = 0;
      for (var i = 0; i < ordre.length && cand.length > 1; i++) {
        if (direct(ordre[i]) && nbDirect >= capDirect) continue;
        var essaiF = choisis.concat([ordre[i]]);
        var c2 = solveur(scen, pub.concat(essaiF), cand);
        if (c2.length < cand.length) {
          choisis = essaiF; cand = c2;
          if (direct(ordre[i])) nbDirect++;
        }
      }
      if (cand.length !== 1) continue;
      // élagage : chaque fait gardé est INDISPENSABLE (on tente d'abord de
      // retirer les indices matériels, pour que les dossiers secrets pèsent)
      var ordreElague = GG.shuffle(choisis.filter(estIndice)).concat(GG.shuffle(choisis.filter(function (f) {
        return !estIndice(f);
      })));
      ordreElague.forEach(function (f) {
        var sans = choisis.filter(function (g) { return g !== f; });
        if (nbCandidats(scen, pub.concat(sans)) === 1) choisis = sans;
      });
      var pistes = choisis.filter(estIndice), prives = choisis.filter(function (f) { return !estIndice(f); });
      if (pistes.length < 2 || prives.length < 2) continue;
      if (choisis.length < 5 || choisis.length > 15) continue;
      // il faut RECOUPER : ni les pistes seules, ni les dossiers seuls ne concluent
      if (nbCandidats(scen, pub.concat(pistes)) < seuil) continue;
      if (nbCandidats(scen, pub.concat(prives)) < seuil) continue;
      // les six pistes se remplissent : des observations si besoin, puis des
      // confirmations (vraies mais superflues) sans jamais conclure à elles seules
      var reste = pool.filter(function (f) { return choisis.indexOf(f) === -1; });
      var confirmations = [];
      var ajoutPiste = function (f, confirmation) {
        var test = pub.concat(pistes, [f]);
        if (nbCandidats(scen, test) < seuil) return false;
        // une confirmation ne doit jamais rendre un dossier secret superflu
        if (confirmation && !prives.every(function (x) {
          return nbCandidats(scen, pub.concat(pistes, [f], prives.filter(function (y) { return y !== x; }))) > 1;
        })) return false;
        pistes.push(f);
        return true;
      };
      GG.shuffle(prives.slice()).forEach(function (f) {
        if (pistes.length >= 6 || prives.length <= 2) return;
        if (ajoutPiste(f)) prives.splice(prives.indexOf(f), 1);
      });
      var extras = NV.extras;
      GG.shuffle(reste.slice()).forEach(function (f) {
        if (pistes.length >= 6 + extras) return;
        if (!estIndice(f) && pistes.length >= 6) return;
        if (ajoutPiste(f, true)) { confirmations.push(f); reste.splice(reste.indexOf(f), 1); }
      });
      if (pistes.length < 6) continue;
      return { v: v, pub: pub, pistes: pistes, prives: prives, reste: reste, essais: NV.essais };
    }
    return null;
  }

  /* ================================================================
   * 6. Construction de l'état
   * ================================================================ */
  function vueScenario(scen) {
    // ce qui circule sur le réseau : tout sauf les énigmes (réponses)
    return {
      id: scen.id, titre: scen.titre, nom: scen.nom, lieuTexte: scen.lieuTexte, victime: scen.victime,
      heure: scen.heure, intro: scen.intro,
      suspects: GG.clone(scen.suspects), lieux: GG.clone(scen.lieux), autres: GG.clone(scen.autres),
      tags: GG.clone(scen.tags), armes: GG.clone(scen.armes), temoins: scen.temoins.slice()
    };
  }

  function faitPublic(scen, f, id) {
    var t = f.t === 'dit' ? [texteTemoignage(scen, f), ''] : textes(scen, f);
    var o = GG.clone(f);
    o.id = id;
    o.txt = t[0];
    o.txtV = t[1];
    o.cat = categorie(f);
    delete o.mensonge;
    return o;
  }

  /* énigmes vues récemment sur ce téléphone : on évite de les resservir */
  function recents() {
    try {
      if (typeof localStorage !== 'undefined') return JSON.parse(localStorage.getItem('gg-manoir-vus') || '[]');
    } catch (e) {}
    return [];
  }
  function noteVus(ids) {
    try {
      if (typeof localStorage !== 'undefined') {
        var r = recents().filter(function (x) { return ids.indexOf(x) === -1; }).concat(ids);
        localStorage.setItem('gg-manoir-vus', JSON.stringify(r.slice(-60)));
      }
    } catch (e) {}
  }
  function choisirScenario() {
    var der = null;
    try { if (typeof localStorage !== 'undefined') der = localStorage.getItem('gg-manoir-dernier'); } catch (e) {}
    var liste = SCENARIOS.filter(function (s) { return s.id !== der; });
    var sc = pick(liste.length ? liste : SCENARIOS);
    try { if (typeof localStorage !== 'undefined') localStorage.setItem('gg-manoir-dernier', sc.id); } catch (e) {}
    return sc;
  }

  function buildCase(state, scenId) {
    var scen = scenId ? (byId(SCENARIOS, scenId) || choisirScenario()) : choisirScenario();
    var n = state.players.length;
    var niveau = NIVEAUX[state.niveau] ? state.niveau : 'normal';
    var aff = genererAffaire(scen, n, niveau) || genererAffaire(scen, n, niveau, true);
    var seq = 0;
    state.scenario = vueScenario(scen);
    state.solution = { suspect: aff.v.c, arme: aff.v.w, lieu: aff.v.l };
    state.temoignages = aff.pub.map(function (f) { return faitPublic(scen, f, seq++); });
    // six pistes, chacune avec son énigme (tirée parmi trois, en évitant les récentes)
    var vus = recents();
    var cartes = GG.shuffle(aff.pistes.slice());
    var riddleIds = [];
    state.pistes = scen.pistes.map(function (p, i) {
      var libres = p.enigmes.map(function (e, k) { return k; }).filter(function (k) {
        return vus.indexOf(scen.id + ':' + p.id + ':' + k) === -1;
      });
      var k = libres.length ? pick(libres) : Math.floor(Math.random() * p.enigmes.length);
      riddleIds.push(scen.id + ':' + p.id + ':' + k);
      var en = p.enigmes[k];
      return {
        id: p.id, nom: p.nom, icone: p.icone, desc: p.desc,
        q: en.q, hint: en.hint, answers: en.a.slice(),
        solved: false, hintShown: false, solvedBy: '', lastWrong: '',
        faits: []
      };
    });
    noteVus(riddleIds);
    cartes.forEach(function (f, i) {
      var slot = i < 6 ? i : Math.floor(Math.random() * 6);
      state.pistes[slot].faits.push(faitPublic(scen, f, seq++));
    });
    // dossiers secrets : les faits indispensables sont distribués ; les joueurs
    // en surnombre reçoivent des vérités de confirmation
    var prives = GG.shuffle(aff.prives.slice()).map(function (f) { return faitPublic(scen, f, seq++); });
    // (jamais « l'arme ne quitte pas le coupable » ni « on a vu le coupable » :
    // trop parlant pour une simple confirmation)
    var extras = GG.shuffle(aff.reste.filter(function (f) {
      return !estIndice(f) && f.t !== 'vu' && !(f.t === 'armeMain' && f.arme === aff.v.w);
    })).concat(GG.shuffle(aff.reste.filter(function (f) { return f.t === 'vu' && f.at[0][0] !== aff.v.c; })));
    var roles = GG.shuffle(ROLES.slice());
    state.players.forEach(function (p, i) {
      p.role = roles[i % roles.length];
      p.prive = [];
      p.lu = false;
      p.freeHintUsed = false;
    });
    prives.forEach(function (f, k) { state.players[k % n].prive.push(f); });
    var ex = 0, base = aff.pub.concat(aff.pistes);
    state.players.forEach(function (p) {
      var besoin = (p.prive.length ? 0 : 1) + (p.role.id === 'voyante' ? 1 : 0);
      while (besoin > 0 && ex < extras.length) {
        var fx = extras[ex++];
        // une confirmation ne permet jamais de conclure seul, sans les autres
        if (n > 1 && nbCandidats(scen, base.concat(p.prive, [fx])) <= 1) continue;
        p.prive.push(faitPublic(scen, fx, seq++));
        besoin--;
      }
    });
    state.coeur = prives.map(function (f) { return f.id; }); // faits indispensables détenus par les joueurs
    state.nbCoeur = state.coeur.length;
    state.reveles = [];
    state.revelesTxt = [];
    state.notes = {};
    state.phase = 'brief';
    state.tries = aff.essais;
    state.triesMax = aff.essais;
    state.accSeq = 1;
    state.vote = null;
    state.verdict = null;
    state.accuseFailed = null;
    state.wrongAnswers = 0;
    state.hintsUsed = 0;
    state.malus = 0;
    state.startTs = 0;
    state.durationSec = 0;
    state.nuitFin = 0;
    state.won = false;
    state.lastAccuser = '';
    state.peek = -1;
    state.vue = 0;
    state.caseId = Math.floor(Math.random() * 1e9);
  }

  /* ---- l'horloge de la nuit : 22 h → 6 h (1 minute réelle = 6 minutes) ---- */
  function minutesNuit(s, now) {
    if (s.phase === 'end') return s.nuitFin || 0;
    if (!s.startTs) return 0;
    return Math.max(0, Math.floor((now - s.startTs) / 10000)) + (s.malus || 0);
  }
  function heureNuit(m) {
    if (m >= 480) return 'L’aube';
    var t = 22 * 60 + m;
    var hh = Math.floor(t / 60) % 24, mm = t % 60;
    return hh + ' h ' + (mm < 10 ? '0' : '') + mm;
  }
  function etoiles(s) {
    var m = s.nuitFin || 0;
    var n = m < 180 ? 3 : m < 360 ? 2 : 1;
    if (s.tries < s.triesMax && n > 1) n--;
    return n;
  }

  function resoudre(state) {
    var v = state.vote, sol = state.solution;
    var ok = [v.s === sol.suspect, v.a === sol.arme, v.l === sol.lieu];
    var win = ok[0] && ok[1] && ok[2];
    state.lastAccuser = state.players[v.by] ? state.players[v.by].name : '';
    if (!win) {
      state.tries--;
      state.malus += 45;
      state.accuseFailed = { suspect: v.s, arme: v.a, lieu: v.l, right: ok.filter(Boolean).length };
    } else {
      state.won = true;
    }
    var fin = win || state.tries <= 0;
    state.verdict = { id: v.id, s: v.s, a: v.a, l: v.l, win: win, final: fin, ok: fin ? ok : null, by: v.by };
    state.vote = null;
    state.accSeq++;
    state.phase = 'verdict';
    if (fin) {
      state.nuitFin = minutesNuit(state, Date.now());
      state.durationSec = state.startTs ? Math.round((Date.now() - state.startTs) / 1000) : 0;
    }
  }

  function majorite(state) {
    var n = state.players.length, oui = 0, non = 0;
    var vs = state.vote.votes;
    Object.keys(vs).forEach(function (k) { if (vs[k]) oui++; else non++; });
    return { oui: oui, non: non, n: n };
  }

  /* ================================================================
   * 7. Le module
   * ================================================================ */
  var view = { caseId: -1, tab: 'pistes', piste: -1, accuse: null, confirm: false, stamp: 0 };
  function syncView(s) {
    if (view.caseId !== s.caseId) {
      view = { caseId: s.caseId, tab: 'pistes', piste: -1, accuse: null, confirm: false, stamp: 0 };
    }
  }

  var mod = {
    id: 'manoir',
    nom: 'Le Manoir',
    icone: '🕵️',
    desc: 'Enquête coopérative : six affaires, des témoins qui mentent, des indices à recouper et des infos secrètes pour chaque enquêteur. Jusqu’à 12 joueurs !',
    regles: '<p><strong>🎯 Le but :</strong> découvrir ENSEMBLE qui a tué, avec quelle arme et dans quel lieu, avant l’aube et avant d’épuiser vos accusations.</p>' +
      '<p><strong>🗣️ Les témoignages :</strong> chaque suspect dit où il était à l’heure du crime. Les innocents disent la vérité ; <strong>le coupable ment</strong> sur son alibi. Et à l’heure du crime, seul le coupable se trouvait sur les lieux.</p>' +
      '<p><strong>🔒 Les pistes :</strong> six pistes, chacune verrouillée par une énigme du décor. Élucidez-les pour obtenir des indices matériels (autopsie, traces, signes du coupable).</p>' +
      '<p><strong>🤫 Vos dossiers :</strong> chaque enquêteur a un rôle et des informations confidentielles, sur SON téléphone (ou en se passant le téléphone). Aucune piste ne suffit seule : il faut tout mettre en commun et raisonner.</p>' +
      '<p><strong>⚖️ L’accusation :</strong> un joueur la propose, le groupe vote. Majorité : l’accusation est portée. Une erreur coûte cher !</p>',
    min: 1, max: 12,
    hotseat: true, hidden: true, netOnly: false,
    noBadges: true,

    create: function (names, ctx) {
      var state = { players: names.map(function (n) { return { name: n }; }), niveau: 'normal' };
      buildCase(state, ctx && ctx.scenario);
      return state;
    },

    turnOf: function () { return -1; }, // tout le monde enquête en même temps
    /* sur un seul téléphone : qui tient l'écran ? */
    viewerOf: function (s) {
      var i;
      if (s.phase === 'roles') {
        for (i = 0; i < s.players.length; i++) if (!s.players[i].lu) return i;
      }
      if (s.phase === 'vote' && s.vote) {
        for (i = 0; i < s.players.length; i++) if (s.vote.votes[i] === undefined) return i;
      }
      if (s.peek >= 0 && s.players[s.peek]) return s.peek;
      return s.players[s.vue] ? s.vue : 0;
    },
    over: function (s) { return s.phase === 'end'; },
    gagnants: function (s) { return s.won ? 'tous' : null; },
    scoreOf: function () { return ''; },

    summary: function (s) {
      var sc = s.scenario, sol = s.solution || {};
      var sus = byId(sc.suspects, sol.suspect) || { nom: '?', teinte: 0, ini: '?' };
      var arm = byId(sc.armes, sol.arme) || { nom: '?', icone: '' };
      var lie = byId(sc.lieux, sol.lieu) || { dans: '?', icone: '' };
      var n = etoiles(s);
      return '<div class="mn-sum">' +
        '<div class="mn-sum-por">' + portrait(sus, 'big') + '</div>' +
        '<p class="mn-sum-txt">C’était <strong>' + GG.esc(sus.nom) + '</strong>,<br>avec ' +
        GG.esc(minus(arm.nom)) + ' ' + GG.esc(arm.icone) + ',<br>' + GG.esc(lie.dans) + ' ' + GG.esc(lie.icone) + '.</p>' +
        (s.won ? '<p class="mn-sum-st">' + '⭐'.repeat(n) + '☆'.repeat(3 - n) + '</p>' +
          '<p class="mn-sum-s">Affaire résolue à ' + GG.esc(heureNuit(s.nuitFin || 0)) + '.</p>'
          : '<p class="mn-sum-s">L’assassin s’est échappé dans la nuit…</p>') +
        '<p class="mn-sum-s">🧩 ' + s.pistes.filter(function (p) { return p.solved; }).length + '/6 pistes · ❌ ' +
        (s.wrongAnswers | 0) + ' erreurs · 💡 ' + (s.hintsUsed | 0) + ' indices</p></div>';
    },

    /* la solution, les réponses des énigmes, les indices des pistes fermées
       et les dossiers des autres ne quittent jamais l'hôte */
    redact: function (state, viewer) {
      var copy = GG.clone(state);
      var me = copy.players[viewer];
      var role = me && me.role ? me.role.id : '';
      if (copy.phase !== 'end') delete copy.solution;
      delete copy.coeur;
      copy.pistes.forEach(function (p) {
        if (role === 'cryptographe' && !p.solved && p.answers) {
          var longue = null;
          for (var k = 0; k < p.answers.length; k++) {
            if (normRep(p.answers[k]).length > 1 && !/^\d/.test(normRep(p.answers[k]))) { longue = normRep(p.answers[k]); break; }
          }
          if (longue) p.first = longue[0];
        }
        if (!p.solved && !p.hintShown && role !== 'serrurier') delete p.hint;
        delete p.answers;
        if (!p.solved) {
          if (role === 'archiviste') p.kinds = p.faits.map(function (f) { return f.cat; });
          delete p.faits;
        }
      });
      copy.players.forEach(function (p, i) {
        p.nbPrive = (p.prive || []).length;
        if (i !== viewer) delete p.prive;
      });
      if (copy.phase === 'vote' && copy.vote) {
        // les voix restent secrètes jusqu'au dépouillement : on ne sait que QUI a voté
        var qui = {};
        Object.keys(copy.vote.votes).forEach(function (k) {
          qui[k] = (parseInt(k, 10) === viewer) ? copy.vote.votes[k] : null;
        });
        copy.vote.votes = qui;
      }
      if (copy.accuseFailed && role !== 'inspecteur') delete copy.accuseFailed.right;
      return copy;
    },

    apply: function (state, player, action) {
      var t = action && action.t;
      var p = state.players[player];
      function ok() { if (p) state.vue = player; return { ok: true }; }

      if (t === 'niveau') {
        if (state.phase !== 'brief') return { ok: false, error: 'L’enquête a déjà commencé.' };
        if (player !== 0) return { ok: false, error: 'L’hôte choisit la difficulté.' };
        if (!NIVEAUX[action.v]) return { ok: false, error: 'Niveau inconnu.' };
        if (state.niveau !== action.v) {
          state.niveau = action.v;
          buildCase(state, state.scenario.id);
        }
        return ok();
      }
      if (t === 'start') {
        if (state.phase !== 'brief') return { ok: false, error: 'L’enquête a déjà commencé.' };
        if (player !== 0) return { ok: false, error: 'L’hôte ouvre l’enquête.' };
        if (state.players.length > 1) {
          state.phase = 'roles';
        } else {
          state.players[0].lu = true;
          state.phase = 'play';
          state.startTs = Date.now();
        }
        return ok();
      }
      if (t === 'again') {
        if (state.phase !== 'end') return { ok: false, error: 'L’enquête n’est pas finie.' };
        if (player !== 0) return { ok: false, error: 'L’hôte relance une affaire.' };
        buildCase(state);
        return ok();
      }
      if (t === 'lu') {
        if (state.phase !== 'roles') return { ok: true }; // déjà parti : sans effet
        if (!p) return { ok: false, error: 'Joueur inconnu.' };
        p.lu = true;
        if (state.players.every(function (x) { return x.lu; })) {
          state.phase = 'play';
          state.startTs = Date.now();
        }
        return ok();
      }
      if (t === 'goplay') {
        if (state.phase !== 'roles') return { ok: true };
        if (player !== 0) return { ok: false, error: 'L’hôte lance l’enquête.' };
        state.phase = 'play';
        state.startTs = Date.now();
        return ok();
      }
      if (t === 'peek') {
        var who = action.p | 0;
        if (who === -1) { state.peek = -1; return ok(); }
        if (!state.players[who]) return { ok: false, error: 'Enquêteur inconnu.' };
        state.peek = who;
        return { ok: true };
      }
      if (t === 'suite') {
        if (state.phase !== 'verdict' || !state.verdict || state.verdict.id !== action.id) return { ok: true };
        if (state.verdict.final) state.phase = 'end';
        else state.phase = 'play';
        return ok();
      }
      if (t === 'note') {
        var k = String(action.k || '');
        var m = /^(suspect|arme|lieu):([a-z0-9]+)$/.exec(k);
        if (!m) return { ok: false, error: 'Note invalide.' };
        var liste = m[1] === 'suspect' ? state.scenario.suspects : m[1] === 'arme' ? state.scenario.armes : state.scenario.lieux;
        if (!byId(liste, m[2])) return { ok: false, error: 'Note invalide.' };
        var val = action.v | 0;
        if (val < 0 || val > 2) val = 0;
        if (val) state.notes[k] = val; else delete state.notes[k];
        return ok();
      }

      // doublons (double appui, message réseau en retard) : sans effet
      if ((t === 'vote' || t === 'retire' || t === 'clore') &&
          (state.phase !== 'vote' || !state.vote || state.vote.id !== action.id)) return { ok: true };
      if (t === 'propose' && (action.seq !== state.accSeq ||
          (state.phase === 'vote' && state.vote && state.vote.id === action.seq))) return { ok: true };

      if (state.phase !== 'play' && state.phase !== 'vote') return { ok: false, error: 'L’enquête n’est pas en cours.' };

      if (t === 'answer') {
        if (!Number.isInteger(action.piste)) return { ok: false, error: 'Piste inconnue.' };
        var pi = state.pistes[action.piste];
        if (!pi) return { ok: false, error: 'Piste inconnue.' };
        if (pi.solved) return { ok: true }; // déjà élucidée (double appui) : sans effet
        var txt = String(action.text || '').slice(0, 40);
        if (!normRep(txt)) return { ok: false, error: 'Écrivez une réponse.' };
        if (accepte(txt, pi.answers)) {
          pi.solved = true;
          pi.solvedBy = p ? p.name : '';
          pi.lastWrong = '';
        } else {
          state.wrongAnswers++;
          state.malus += 5;
          pi.lastWrong = txt.slice(0, 30);
          pi.wrongN = (pi.wrongN | 0) + 1;
        }
        return ok();
      }
      if (t === 'hint') {
        if (!Number.isInteger(action.piste)) return { ok: false, error: 'Piste inconnue.' };
        var ph = state.pistes[action.piste];
        if (!ph || ph.solved) return { ok: false, error: 'Piste indisponible.' };
        if (!ph.hintShown) {
          ph.hintShown = true;
          if (p && p.role && p.role.id === 'detective' && !p.freeHintUsed) p.freeHintUsed = true;
          else { state.hintsUsed++; state.malus += 10; }
        }
        return ok();
      }
      if (t === 'secours') {
        if (action.n !== state.reveles.length) return { ok: true }; // double appui
        var cibles = [];
        state.players.forEach(function (pl) {
          (pl.prive || []).forEach(function (f) {
            if (state.coeur.indexOf(f.id) !== -1 && state.reveles.indexOf(f.id) === -1) cibles.push(f);
          });
        });
        if (!cibles.length) return { ok: false, error: 'Tous les témoins ont déjà parlé.' };
        var fr = pick(cibles);
        state.reveles.push(fr.id);
        state.revelesTxt.push(fr.txt);
        state.malus += 30;
        return ok();
      }

      if (t === 'propose') {
        if (state.phase !== 'play') return { ok: false, error: 'Une accusation est déjà en cours.' };
        if (action.seq !== state.accSeq) return { ok: true }; // double appui : déjà traitée
        if (!p) return { ok: false, error: 'Joueur inconnu.' };
        if (!byId(state.scenario.suspects, action.s) || !byId(state.scenario.armes, action.a) ||
            !byId(state.scenario.lieux, action.l)) {
          return { ok: false, error: 'Accusation incomplète.' };
        }
        state.vote = { id: state.accSeq, by: player, s: action.s, a: action.a, l: action.l, votes: {} };
        state.vote.votes[player] = true;
        var mj = majorite(state);
        if (mj.oui * 2 > mj.n) resoudre(state); else state.phase = 'vote';
        return ok();
      }
      if (t === 'vote') {
        if (state.phase !== 'vote' || !state.vote || state.vote.id !== action.id) return { ok: true };
        if (!p) return { ok: false, error: 'Joueur inconnu.' };
        if (state.vote.votes[player] !== undefined) return { ok: true };
        state.vote.votes[player] = !!action.v;
        var mv = majorite(state);
        if (mv.oui * 2 > mv.n) resoudre(state);
        else if (mv.non * 2 >= mv.n) {
          state.dernierRefus = { id: state.vote.id, oui: mv.oui, non: mv.non };
          state.vote = null;
          state.accSeq++;
          state.phase = 'play';
        }
        return ok();
      }
      if (t === 'retire' || t === 'clore') {
        if (state.phase !== 'vote' || !state.vote || state.vote.id !== action.id) return { ok: true };
        if (t === 'retire' && player !== state.vote.by && player !== 0) {
          return { ok: false, error: 'Seul l’auteur de l’accusation peut la retirer.' };
        }
        if (t === 'clore' && player !== 0) return { ok: false, error: 'L’hôte clôt le vote.' };
        var mc = majorite(state);
        if (t === 'clore' && mc.oui > mc.non) { resoudre(state); return ok(); }
        state.dernierRefus = { id: state.vote.id, oui: mc.oui, non: mc.non, retire: t === 'retire' };
        state.vote = null;
        state.accSeq++;
        state.phase = 'play';
        return ok();
      }
      return { ok: false, error: 'Action inconnue.' };
    },

    render: function (el, ctx) { rendu(el, ctx); },

    _SCENARIOS: SCENARIOS, _ROLES: ROLES, _TRAITS: TRAITS, _NIVEAUX: NIVEAUX,
    _norm: norm, _normRep: normRep, _accepte: accepte, _solveur: solveur,
    _compatible: compatible, _genererAffaire: genererAffaire, _estIndice: estIndice,
    _tousLesFaits: function (s) {
      var out = s.temoignages.slice();
      s.pistes.forEach(function (p) { out = out.concat(p.faits || []); });
      s.players.forEach(function (p) { out = out.concat(p.prive || []); });
      return out;
    }
  };

  /* ================================================================
   * 8. Le rendu
   * ================================================================ */
  function portrait(sus, cls, dead) {
    return '<span class="mn-portrait' + (cls ? ' ' + cls : '') + (dead ? ' dead' : '') +
      '" style="--h:' + (parseInt(sus.teinte, 10) || 0) + '">' + GG.esc(sus.ini || '?') + '</span>';
  }
  /* texte d'un fait : échappé, puis **gras** */
  function riche(t) { return GG.esc(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>'); }

  /* met à jour les zones qui ont changé (le reste du DOM, et la saisie en
     cours, restent intacts) */
  function zones(racine, liste) {
    var sig = liste.map(function (z) { return z[0]; }).join(',');
    if (racine._sig !== sig) {
      racine.innerHTML = liste.map(function (z) {
        return '<div class="mn-z mn-z-' + z[0] + '" data-z="' + z[0] + '"></div>';
      }).join('');
      racine._sig = sig;
      racine._zh = {};
    }
    var changes = {};
    liste.forEach(function (z) {
      if (racine._zh[z[0]] !== z[1]) {
        racine.querySelector('[data-z="' + z[0] + '"]').innerHTML = z[1];
        racine._zh[z[0]] = z[1];
        changes[z[0]] = true;
      }
    });
    return changes;
  }

  function rendu(el, ctx) {
    var s = ctx.state;
    syncView(s);
    var racine = el.querySelector('.mn[data-mn]');
    if (!racine) {
      el.innerHTML = '<div class="mn" data-mn="1"></div>';
      racine = el.querySelector('.mn[data-mn]');
      brancher(racine);
    }
    racine._ctx = ctx;
    var sc = s.scenario;
    var me = s.players[ctx.me] || {};
    var partage = ctx.mode === 'local' && s.players.length > 1; // un téléphone pour tous
    var Z = [];

    if (s.phase === 'brief') {
      Z.push(['tete', '<div class="mn-candle"></div><h2 class="mn-title">' + GG.esc(sc.titre) + '</h2>' +
        '<p class="mn-sous">' + GG.esc(sc.nom) + '</p>']);
      Z.push(['lettre', lettreHtml(s)]);
      Z.push(['cast', castHtml(s)]);
      Z.push(['bas', briefBas(s, ctx)]);
    } else if (s.phase === 'roles') {
      Z.push(['tete', '<div class="mn-candle"></div><h2 class="mn-title small">' + GG.esc(sc.titre) + '</h2>']);
      Z.push(['dossier', '<h3 class="mn-h3 mn-center">🤫 Votre dossier secret</h3>' + dossierHtml(s, ctx.me, false)]);
      Z.push(['bas', rolesBas(s, ctx)]);
    } else if (s.phase === 'end') {
      Z.push(['tete', '<div class="mn-candle"></div>']);
      Z.push(['fin', finHtml(s)]);
    } else if (s.phase === 'verdict') {
      Z.push(['verdict', verdictHtml(s, ctx)]);
    } else {
      // enquête (et vote en cours)
      Z.push(['top', topHtml(s)]);
      Z.push(['alerte', alerteHtml(s, ctx, partage)]);
      if (s.phase === 'vote' && s.vote) {
        Z.push(['vote', voteHtml(s, ctx)]);
      } else if (s.peek >= 0 && s.peek === ctx.me && partage) {
        Z.push(['peek', '<h3 class="mn-h3 mn-center">🤫 Dossier de ' + GG.esc(me.name) + '</h3>' +
          dossierHtml(s, ctx.me, true) +
          '<button class="btn big mn-gold" data-a="unpeek">🙈 Cacher mon dossier</button>' +
          '<p class="mn-dim">Puis rendez le téléphone à l’équipe.</p>']);
      } else if (view.accuse) {
        Z.push(['accuse', accuseHtml(s)]);
        Z.push(['confirm', view.confirm ? confirmHtml(s) : '']);
      } else {
        Z.push(['tabs', tabsHtml(s)]);
        if (view.tab === 'pistes' && view.piste >= 0 && s.pistes[view.piste]) {
          Z.push(['enigme', enigmeHtml(s, ctx, partage)]);
          var pv = s.pistes[view.piste];
          Z.push(['saisie', pv.solved ? '' : saisieHtml(view.piste, pv)]);
          Z.push(['enigme2', pv.solved ? '' : enigmeBas(s, pv)]);
        } else {
          Z.push(['main', ongletHtml(s, ctx, partage)]);
        }
        Z.push(['pied', '<button class="btn big mn-accuse" data-a="goaccuse">🫵 Accuser' +
          ' <small>(' + s.tries + ' accusation' + (s.tries > 1 ? 's' : '') + ')</small></button>']);
      }
    }
    var ch = zones(racine, Z);
    // la saisie retrouve le brouillon (changement de piste seulement)
    if (ch.saisie) {
      var inp = racine.querySelector('#mn-answer');
      if (inp) inp.value = (view.drafts && view.drafts[view.piste]) || '';
    }
    effets(racine, s, ctx, ch);
    horloge(racine, s);
  }

  function lettreHtml(s) {
    var sc = s.scenario;
    return '<div class="mn-letter-wrap"><div class="mn-letter">' +
      '<div class="mn-seal">🕯️</div>' +
      '<p class="mn-letter-lieu"><em>' + GG.esc(sc.lieuTexte) + '</em></p>' +
      '<p>' + riche(sc.intro) + '</p>' +
      '<p>Cinq suspects, cinq armes, cinq lieux. Six pistes verrouillées par des énigmes. ' +
      'Et dans vos poches, des secrets que vous seuls connaissez.</p>' +
      '<div class="mn-regle"><strong>⚖️ Les règles de la nuit</strong><br>' +
      'Les innocents disent la vérité ; <strong>le coupable ment</strong> sur son alibi.<br>' +
      'À ' + GG.esc(sc.heure) + ', <strong>seul le coupable</strong> se trouvait sur les lieux du crime.</div>' +
      '<p class="mn-warn">Vous n’aurez droit qu’à ' + s.tries + ' accusation' + (s.tries > 1 ? 's' : '') +
      ', et l’aube arrive vite.</p>' +
      '</div></div>';
  }

  function castHtml(s) {
    var sc = s.scenario;
    return '<h3 class="mn-h3">👥 Les suspects</h3><div class="mn-cast">' + sc.suspects.map(function (x, i) {
      return '<div class="mn-cast-one" style="--i:' + i + '">' + portrait(x) +
        '<div><strong>' + GG.esc(x.nom) + '</strong><span>' + GG.esc(x.desc) + '</span></div></div>';
    }).join('') + '</div>';
  }

  function briefBas(s, ctx) {
    var out = '';
    if (ctx.me === 0) {
      out += '<h3 class="mn-h3">🎚️ Difficulté</h3><div class="mn-niv">' +
        Object.keys(NIVEAUX).map(function (k) {
          var nv = NIVEAUX[k];
          return '<button class="mn-niv-b' + (s.niveau === k ? ' on' : '') + '" data-a="niveau" data-v="' + k + '">' +
            '<span>' + nv.ic + ' ' + nv.nom + '</span><small>' + GG.esc(nv.desc) + '</small></button>';
        }).join('') + '</div>' +
        '<button class="btn big mn-gold" data-a="start">🔎 Ouvrir l’enquête</button>';
    } else {
      out += '<p class="mn-dim">Difficulté : <strong>' + GG.esc((NIVEAUX[s.niveau] || NIVEAUX.normal).nom) +
        '</strong></p><p class="waiting">⏳ L’hôte va ouvrir l’enquête…</p>';
    }
    return out;
  }

  function roleCarte(role) {
    return '<div class="mn-role"><div class="mn-role-head"><span class="mn-role-ic">' + GG.esc(role.icone) + '</span>' +
      '<div><div class="mn-role-nom">' + GG.esc(role.nom) + '</div>' +
      '<div class="mn-role-fl">' + GG.esc(role.flavor) + '</div></div></div>' +
      '<p class="mn-role-pow">✨ ' + GG.esc(role.pouvoir) + '</p></div>';
  }

  /* dossier secret d'un joueur (rôle, infos, dons) */
  function dossierHtml(s, i, complet) {
    var p = s.players[i];
    if (!p || !p.role) return '';
    var out = roleCarte(p.role);
    var infos = p.prive || [];
    out += '<div class="mn-secrets">' + (infos.length ? infos.map(function (f, k) {
      return '<div class="mn-clue secret" style="--i:' + k + '">🤫 ' + riche(f.txtV || f.txt) + '</div>';
    }).join('') : '<p class="mn-dim">Aucune information particulière.</p>') + '</div>';
    if (complet) {
      // les dons qui portent sur les énigmes, rassemblés ici sur un téléphone partagé
      var dons = [];
      s.pistes.forEach(function (pi) {
        if (pi.solved) return;
        if (p.role.id === 'cryptographe' && pi.first) dons.push(pi.icone + ' ' + pi.nom + ' : commence par « ' + pi.first + ' »');
        if (p.role.id === 'serrurier' && pi.hint && !pi.hintShown) dons.push(pi.icone + ' ' + pi.nom + ' : ' + pi.hint);
        if (p.role.id === 'archiviste' && pi.kinds) dons.push(pi.icone + ' ' + pi.nom + ' : ' + pi.kinds.map(catIc).join(' '));
      });
      if (s.accuseFailed && p.role.id === 'inspecteur' && s.accuseFailed.right !== undefined) {
        dons.push('🎖️ Dernière accusation : ' + s.accuseFailed.right + ' élément' + (s.accuseFailed.right > 1 ? 's' : '') + ' sur 3 étai' +
          (s.accuseFailed.right > 1 ? 'ent' : 't') + ' juste' + (s.accuseFailed.right > 1 ? 's' : '') + '.');
      }
      if (dons.length) {
        out += '<div class="mn-dons"><strong>✨ Votre don</strong>' + dons.map(function (d) {
          return '<div>' + GG.esc(d) + '</div>';
        }).join('') + '</div>';
      }
    }
    out += '<p class="mn-dim">Ces informations sont à VOUS : partagez-les à voix haute, au bon moment.</p>';
    return out;
  }
  function catIc(c) { return c === 'arme' ? '🗡️ arme' : c === 'lieu' ? '📍 lieu' : '👤 suspect'; }

  function rolesBas(s, ctx) {
    var me = s.players[ctx.me] || {};
    var out = '';
    if (!me.lu) {
      out += '<button class="btn big mn-gold" data-a="lu">✔️ ' +
        (ctx.mode === 'local' ? 'J’ai tout mémorisé' : 'Je suis prêt, on enquête !') + '</button>';
    }
    var nbLu = s.players.filter(function (p) { return p.lu; }).length;
    out += '<div class="mn-ready">' + s.players.map(function (p) {
      return '<span class="' + (p.lu ? 'ok' : '') + '">' + (p.lu ? '✔️ ' : '⏳ ') + GG.esc(p.name) + '</span>';
    }).join('') + '</div>';
    if (ctx.mode !== 'local' && ctx.me === 0 && nbLu < s.players.length) {
      out += '<button class="btn link" data-a="goplay">⏭️ Commencer sans attendre les retardataires</button>';
    }
    return out;
  }

  function topHtml(s) {
    var sc = s.scenario;
    var coeurs = '';
    for (var i = 0; i < s.triesMax; i++) coeurs += i < s.tries ? '❤️' : '🖤';
    return '<div class="mn-top"><div class="mn-candle small"></div>' +
      '<div class="mn-top-mid"><div class="mn-title-s">' + GG.esc(sc.titre) + '</div>' +
      '<div class="mn-progress">🧩 ' + s.pistes.filter(function (p) { return p.solved; }).length + '/6 · ' +
      '<span class="mn-coeurs">' + coeurs + '</span> · 👥 ' + s.players.length + '</div></div>' +
      '<div class="mn-clock" title="L’horloge de la nuit"><svg viewBox="0 0 40 40" aria-hidden="true">' +
      '<circle cx="20" cy="20" r="18" class="mn-clock-f"/>' +
      '<line x1="20" y1="20" x2="20" y2="9" class="mn-clock-h"/><line x1="20" y1="20" x2="20" y2="5" class="mn-clock-m"/>' +
      '<circle cx="20" cy="20" r="2" class="mn-clock-c"/></svg><span class="mn-clock-t"></span></div></div>';
  }

  function alerteHtml(s, ctx, partage) {
    var out = '';
    if (s.accuseFailed && s.tries > 0 && s.phase === 'play') {
      var fs = byId(s.scenario.suspects, s.accuseFailed.suspect);
      out += '<div class="mn-alarm">🚨 Accusation erronée' + (fs ? ' contre ' + GG.esc(fs.nom.split(',')[0]) : '') +
        ' ! Plus que <strong>' + s.tries + '</strong> accusation' + (s.tries > 1 ? 's' : '') + '.</div>';
      if (!partage && s.accuseFailed.right !== undefined) {
        out += '<div class="mn-clue secret">🎖️ Votre analyse (pour vous seul) : <strong>' + s.accuseFailed.right +
          '</strong> élément' + (s.accuseFailed.right > 1 ? 's' : '') + ' sur 3 étai' + (s.accuseFailed.right > 1 ? 'ent justes.' : 't juste.') + '</div>';
      }
    }
    if (s.dernierRefus && s.phase === 'play' && s.dernierRefus.id === s.accSeq - 1 && !s.accuseFailed) {
      out += '<p class="mn-dim">' + (s.dernierRefus.retire ? '↩️ L’accusation a été retirée.'
        : '🗳️ L’équipe a refusé l’accusation (' + s.dernierRefus.oui + ' pour, ' + s.dernierRefus.non + ' contre).') + '</p>';
    }
    return out;
  }

  function tabsHtml(s) {
    var T = [['pistes', '🔎', 'Pistes'], ['temoins', '🗣️', 'Témoins'], ['carnet', '📓', 'Carnet'], ['dossier', '🤫', 'Dossier']];
    return '<div class="mn-tabs" role="tablist">' + T.map(function (t) {
      return '<button class="mn-tab' + (view.tab === t[0] ? ' on' : '') + '" data-a="tab" data-v="' + t[0] + '" role="tab">' +
        '<span>' + t[1] + '</span>' + t[2] + '</button>';
    }).join('') + '</div>';
  }

  function ongletHtml(s, ctx, partage) {
    if (view.tab === 'temoins') return temoinsHtml(s);
    if (view.tab === 'carnet') return carnetHtml(s);
    if (view.tab === 'dossier') {
      if (partage) {
        return '<p class="mn-dim">Chaque enquêteur garde un dossier secret. Choisissez qui le consulte : ' +
          'le téléphone lui sera passé.</p><div class="mn-peek">' + s.players.map(function (p, i) {
            return '<button class="btn mn-peek-b" data-a="peek" data-v="' + i + '">🤫 ' + GG.esc(p.name) +
              ' <small>' + GG.esc(p.role ? p.role.icone + ' ' + p.role.nom : '') + '</small></button>';
          }).join('') + '</div>';
      }
      return dossierHtml(s, ctx.me, true);
    }
    return pistesHtml(s, ctx, partage);
  }

  function pistesHtml(s, ctx, partage) {
    var me = s.players[ctx.me] || {};
    var archi = !partage && me.role && me.role.id === 'archiviste';
    var out = '<div class="mn-pistes">' + s.pistes.map(function (p, i) {
      var etat = p.solved ? '✓ élucidée' : '🔒 énigme';
      if (!p.solved && archi && p.kinds) etat += ' · ' + p.kinds.map(function (k) { return catIc(k).split(' ')[0]; }).join('');
      return '<button class="mn-piste' + (p.solved ? ' solved' : '') + '" data-a="piste" data-v="' + i + '" style="--i:' + i + '">' +
        '<span class="mn-piste-sceau">' + (p.solved ? '✓' : '🔒') + '</span>' +
        '<span class="mn-piste-ic">' + GG.esc(p.icone) + '</span>' +
        '<span class="mn-piste-nom">' + GG.esc(p.nom) + '</span>' +
        '<span class="mn-piste-etat">' + etat + '</span></button>';
    }).join('') + '</div>';
    if ((s.reveles || []).length < (s.nbCoeur | 0) && s.players.length > 0) {
      out += '<button class="btn link mn-secours" data-a="secours" data-v="' + s.reveles.length + '">' +
        '🕯️ Bloqués ? Faire parler un témoin (+30 min sur l’horloge)</button>';
    }
    var reveles = revelesHtml(s);
    if (reveles) out += '<h3 class="mn-h3">🕯️ Ce que les témoins ont révélé</h3>' + reveles;
    return out;
  }

  /* les confidences arrachées aux témoins (« Faire parler un témoin ») */
  function revelesHtml(s) {
    return (s.revelesTxt || []).map(function (t) {
      return '<div class="mn-clue revele">🕯️ ' + riche(t) + '</div>';
    }).join('');
  }

  function temoinsHtml(s) {
    var sc = s.scenario;
    return '<div class="mn-regle petit"><strong>⚖️</strong> Les innocents disent la vérité, <strong>le coupable ment</strong>. ' +
      'À ' + GG.esc(sc.heure) + ', seul le coupable était sur les lieux du crime.</div>' +
      '<div class="mn-temoins">' + s.temoignages.map(function (f, i) {
        var sus = byId(sc.suspects, f.par) || { nom: '?', teinte: 0 };
        return '<div class="mn-temoin" style="--i:' + i + '">' + portrait(sus, 'small') +
          '<div class="mn-bulle"><strong>' + GG.esc(sus.nom) + '</strong><span>' + riche(f.txt) + '</span></div></div>';
      }).join('') + '</div>';
  }

  var MARQUES = ['', '❌', '⭐'];
  function carnetHtml(s) {
    var sc = s.scenario;
    function ligne(kind, it, ic) {
      var k = kind + ':' + it.id, v = s.notes[k] | 0;
      return '<button class="mn-item m' + v + '" data-a="note" data-v="' + GG.esc(k) + '">' + ic +
        '<span class="mn-item-nom">' + GG.esc(it.nom.split(',')[0]) + '</span>' +
        '<span class="mn-mark">' + (MARQUES[v] || '') + '</span></button>';
    }
    var out = '<p class="mn-dim">Le carnet de l’équipe : touchez pour barrer ❌ ou marquer ⭐. Il est commun à tous.</p>';
    out += '<h3 class="mn-h3">👤 Suspects</h3><div class="mn-col">' + sc.suspects.map(function (x) {
      return ligne('suspect', x, portrait(x, 'small', (s.notes['suspect:' + x.id] | 0) === 1));
    }).join('') + '</div>';
    out += '<h3 class="mn-h3">🗡️ Armes</h3><div class="mn-col">' + sc.armes.map(function (a) {
      var kd = KINDS[a.kind] || { ic: '', nom: '' };
      return ligne('arme', a, '<span class="mn-opt-ic">' + GG.esc(a.icone) + '</span>').replace('</span><span class="mn-mark">',
        '<small class="mn-tagi">' + kd.ic + ' ' + GG.esc(kd.nom) + '</small></span><span class="mn-mark">');
    }).join('') + '</div>';
    out += '<h3 class="mn-h3">📍 Lieux</h3><div class="mn-col">' + sc.lieux.map(function (l) {
      var tg = (l.tags || []).map(function (t) { return sc.tags[t] ? sc.tags[t].ic + ' ' + sc.tags[t].nom : ''; }).join(' · ');
      return ligne('lieu', l, '<span class="mn-opt-ic">' + GG.esc(l.icone) + '</span>').replace('</span><span class="mn-mark">',
        '<small class="mn-tagi">' + GG.esc(tg || 'aucune particularité') + '</small></span><span class="mn-mark">');
    }).join('') + '</div>';
    // indices récoltés
    var ind = [];
    s.pistes.forEach(function (p) {
      if (p.solved) (p.faits || []).forEach(function (f) { ind.push([p, f]); });
    });
    out += '<h3 class="mn-h3">🗂️ Indices récoltés (' + ind.length + ')</h3>';
    out += ind.length ? '<div class="mn-clue-cards">' + ind.map(function (x) {
      return '<div class="mn-clue"><small>' + GG.esc(x[0].icone + ' ' + x[0].nom) + '</small>' + riche(x[1].txt) + '</div>';
    }).join('') + '</div>' : '<p class="mn-dim">Élucidez des pistes pour récolter des indices.</p>';
    var rv = revelesHtml(s);
    if (rv) out += rv;
    return out;
  }

  function enigmeHtml(s, ctx, partage) {
    var p = s.pistes[view.piste];
    var me = s.players[ctx.me] || {};
    var out = '<button class="mn-back" data-a="back">← Toutes les pistes</button>';
    if (p.solved) {
      return out + '<div class="mn-piste-head solved"><span>' + GG.esc(p.icone) + '</span><div><h3>' + GG.esc(p.nom) +
        '</h3><small>Élucidée' + (p.solvedBy ? ' par ' + GG.esc(p.solvedBy) : '') + '</small></div></div>' +
        '<div class="mn-clue-cards deal">' + (p.faits || []).map(function (f, i) {
          return '<div class="mn-clue carte" style="--i:' + i + '">' + riche(f.txt) + '</div>';
        }).join('') + '</div>';
    }
    out += '<div class="mn-piste-head"><span>' + GG.esc(p.icone) + '</span><div><h3>' + GG.esc(p.nom) + '</h3>' +
      '<small>' + GG.esc(p.desc) + '</small></div></div>' +
      '<div class="mn-parchment">' + GG.esc(p.q) + '</div>';
    if (!partage && me.role) {
      if (me.role.id === 'cryptographe' && p.first) {
        out += '<p class="mn-hint">🔐 Votre don : la réponse commence par « ' + GG.esc(p.first) + ' »</p>';
      }
      if (me.role.id === 'serrurier' && !p.hintShown && p.hint) {
        out += '<p class="mn-hint">🗝️ Votre passe-partout : ' + GG.esc(p.hint) + '</p>';
      }
    }
    if (p.hintShown && p.hint) out += '<p class="mn-hint">💡 ' + GG.esc(p.hint) + '</p>';
    if (p.lastWrong) {
      out += '<p class="mn-wrong" data-w="' + (p.wrongN | 0) + '">« ' + GG.esc(p.lastWrong) + ' » n’a rien ouvert…</p>';
    }
    return out;
  }
  function saisieHtml(i) {
    return '<div class="mn-answer-row" data-p="' + i + '">' +
      '<input type="text" id="mn-answer" maxlength="30" placeholder="Votre réponse…" autocomplete="off" autocapitalize="characters" enterkeyhint="go">' +
      '<button class="btn mn-gold" data-a="answer">Proposer</button></div>';
  }
  function enigmeBas(s, p) {
    return p.hintShown ? '' : '<button class="btn link mn-hint-btn" data-a="hint">💡 Demander un indice (+10 min sur l’horloge)</button>';
  }

  function accuseHtml(s) {
    var sc = s.scenario, a = view.accuse;
    var out = '<button class="mn-back" data-a="noaccuse">← Retour à l’enquête</button>' +
      '<h3 class="mn-h3 mn-center">🫵 L’accusation</h3>' +
      '<p class="mn-dim">Il vous reste <strong>' + s.tries + '</strong> accusation' + (s.tries > 1 ? 's' : '') + '. ' +
      (s.players.length > 1 ? 'L’équipe devra voter.' : 'Réfléchissez bien.') + '</p>';
    [['s', 'suspect', sc.suspects, 'Le coupable'], ['a', 'arme', sc.armes, 'L’arme'], ['l', 'lieu', sc.lieux, 'Le lieu']]
      .forEach(function (g) {
        out += '<p class="mn-grp">' + g[3] + '</p><div class="mn-pick">' + g[2].map(function (it) {
          var barre = (s.notes[g[1] + ':' + it.id] | 0) === 1;
          return '<button class="mn-opt' + (a[g[0]] === it.id ? ' sel' : '') + (barre ? ' out' : '') + '" data-a="pick" data-g="' +
            g[0] + '" data-v="' + GG.esc(it.id) + '">' +
            (g[0] === 's' ? portrait(it, 'small') : '<span class="mn-opt-ic">' + GG.esc(it.icone) + '</span>') +
            '<span>' + GG.esc(it.nom.split(',')[0]) + '</span></button>';
        }).join('') + '</div>';
      });
    var pret = a.s && a.a && a.l;
    out += '<p class="mn-phrase">' + (pret ? phrase(sc, a.s, a.a, a.l) : 'Choisissez un coupable, une arme et un lieu.') + '</p>';
    out += '<button class="btn big mn-danger" data-a="confirmer"' + (pret ? '' : ' disabled') + '>⚖️ ' +
      (s.players.length > 1 ? 'Proposer l’accusation à l’équipe' : 'Porter l’accusation') + '</button>';
    return out;
  }
  function phrase(sc, si, ai, li) {
    var sus = byId(sc.suspects, si), arm = byId(sc.armes, ai), lie = byId(sc.lieux, li);
    if (!sus || !arm || !lie) return '';
    return '« J’accuse <strong>' + GG.esc(sus.nom.split(',')[0]) + '</strong>, avec ' + GG.esc(minus(arm.nom)) +
      ', ' + GG.esc(lie.dans) + ' ! »';
  }
  function confirmHtml(s) {
    var a = view.accuse;
    return '<div class="mn-modal"><div class="mn-modal-c">' +
      '<div class="mn-modal-ic">⚖️</div><h3>Êtes-vous sûrs ?</h3>' +
      '<p>' + phrase(s.scenario, a.s, a.a, a.l) + '</p>' +
      '<p class="mn-dim">' + (s.players.length > 1 ? 'L’accusation sera soumise au vote de toute l’équipe.'
        : 'Une erreur vous coûtera une accusation et 45 minutes.') + '</p>' +
      '<div class="mn-modal-b"><button class="btn" data-a="annuler">Pas encore</button>' +
      '<button class="btn mn-danger" data-a="propose" data-arme="' + Date.now() + '">Oui, j’accuse</button></div></div></div>';
  }

  function voteHtml(s, ctx) {
    var v = s.vote, sc = s.scenario;
    var sus = byId(sc.suspects, v.s), arm = byId(sc.armes, v.a), lie = byId(sc.lieux, v.l);
    var mine = v.votes[ctx.me];
    var nbV = Object.keys(v.votes).length;
    var out = '<div class="mn-voteb"><div class="mn-vote-titre">🗳️ ' + GG.esc((s.players[v.by] || {}).name || '?') +
      ' propose une accusation</div>' +
      '<div class="mn-trio">' +
      '<div class="mn-tcard" style="--i:0">' + portrait(sus, '') + '<span>' + GG.esc(sus.nom.split(',')[0]) + '</span></div>' +
      '<div class="mn-tcard" style="--i:1"><span class="mn-opt-ic big">' + GG.esc(arm.icone) + '</span><span>' + GG.esc(arm.nom) + '</span></div>' +
      '<div class="mn-tcard" style="--i:2"><span class="mn-opt-ic big">' + GG.esc(lie.icone) + '</span><span>' + GG.esc(lie.nom) + '</span></div>' +
      '</div>' +
      '<p class="mn-dim">Il faut la majorité (' + (Math.floor(s.players.length / 2) + 1) + ' voix sur ' + s.players.length + ').</p>' +
      '<div class="mn-ready">' + s.players.map(function (p, i) {
        var a = v.votes[i] !== undefined;
        return '<span class="' + (a ? 'ok' : '') + '">' + (a ? '🗳️ ' : '⏳ ') + GG.esc(p.name) + '</span>';
      }).join('') + '</div>';
    if (mine === undefined) {
      out += '<div class="mn-vote-b"><button class="btn big mn-danger" data-a="vote" data-v="1">✅ J’accuse aussi</button>' +
        '<button class="btn big" data-a="vote" data-v="0">✋ Pas encore</button></div>';
    } else {
      out += '<p class="waiting">Votre voix est comptée (' + (mine ? 'pour' : 'contre') + '). ' + nbV + '/' + s.players.length + ' ont voté…</p>';
    }
    if (ctx.me === v.by || ctx.me === 0) {
      out += '<div class="mn-vote-adm">' +
        (ctx.me === v.by ? '<button class="btn link" data-a="retire">↩️ Retirer ma proposition</button>' : '') +
        (ctx.me === 0 && ctx.mode !== 'local' ? '<button class="btn link" data-a="clore">⏭️ Clore le vote avec les voix exprimées</button>' : '') +
        '</div>';
    }
    return out + '</div>';
  }

  function verdictHtml(s, ctx) {
    var v = s.verdict, sc = s.scenario;
    var sus = byId(sc.suspects, v.s), arm = byId(sc.armes, v.a), lie = byId(sc.lieux, v.l);
    function carte(i, face, nom, juste) {
      var ok = v.ok ? (v.ok[i] ? ' juste' : ' faux') : '';
      return '<div class="mn-vcard' + ok + '" style="--i:' + i + '"><div class="mn-vcard-in">' +
        '<div class="mn-vcard-dos">?</div><div class="mn-vcard-face">' + face + '<span>' + GG.esc(nom) + '</span>' +
        (v.ok ? '<b>' + (v.ok[i] ? '✓' : '✗') + '</b>' : '') + '</div></div></div>';
    }
    var out = '<div class="mn-verdict ' + (v.win ? 'win' : 'lose') + '">' +
      '<p class="mn-v-by">⚖️ ' + GG.esc((s.players[v.by] || {}).name || s.lastAccuser || '') + ' se lève et désigne…</p>' +
      '<div class="mn-trio">' + carte(0, portrait(sus, ''), sus.nom.split(',')[0]) +
      carte(1, '<span class="mn-opt-ic big">' + GG.esc(arm.icone) + '</span>', arm.nom) +
      carte(2, '<span class="mn-opt-ic big">' + GG.esc(lie.icone) + '</span>', lie.nom) + '</div>' +
      '<div class="mn-tampon">' + (v.win ? 'COUPABLE !' : 'ERREUR !') + '</div>' +
      '<p class="mn-v-txt">' + (v.win ? 'L’assassin blêmit… et avoue tout.'
        : v.final ? 'L’accusé éclate de rire. Vous n’avez plus d’accusation…'
          : 'L’accusé proteste : vous faites erreur. Il reste ' + s.tries + ' accusation' + (s.tries > 1 ? 's' : '') + '.') + '</p>' +
      '<button class="btn big mn-gold mn-v-suite" data-a="suite" data-v="' + v.id + '">' +
      (v.final ? '📜 Le dénouement' : '🔎 Reprendre l’enquête') + '</button></div>';
    return out;
  }

  function finHtml(s) {
    var sc = s.scenario, sol = s.solution || {};
    var sus = byId(sc.suspects, sol.suspect) || { nom: '?', ini: '?', teinte: 0 };
    var arm = byId(sc.armes, sol.arme) || { nom: '?', icone: '' };
    var lie = byId(sc.lieux, sol.lieu) || { dans: '?', icone: '' };
    var n = etoiles(s);
    return '<h2 class="mn-title">' + (s.won ? 'AFFAIRE RÉSOLUE' : 'L’ASSASSIN S’ÉCHAPPE…') + '</h2>' +
      '<div class="mn-reveal ' + (s.won ? 'won' : 'lost') + '">' +
      '<div class="mn-reveal-portrait">' + portrait(sus, 'big') + '</div>' +
      '<p>C’était <strong>' + GG.esc(sus.nom) + '</strong>,<br>avec <strong>' + GG.esc(minus(arm.nom)) + '</strong> ' +
      GG.esc(arm.icone) + ',<br><strong>' + GG.esc(lie.dans) + '</strong> ' + GG.esc(lie.icone) + '.</p>' +
      (s.won ? '<div class="mn-stars">' + '⭐'.repeat(n) + '☆'.repeat(3 - n) + '</div>' : '') + '</div>' +
      '<div class="mn-stats">🌙 ' + GG.esc(heureNuit(s.nuitFin || 0)) + ' · 🧩 ' +
      s.pistes.filter(function (p) { return p.solved; }).length + '/6 pistes · ❌ ' + (s.wrongAnswers | 0) +
      ' erreurs · 💡 ' + (s.hintsUsed | 0) + ' indices</div>';
  }

  /* ---------- l'horloge de la nuit, animée sans redessiner l'écran ---------- */
  function horloge(racine, s) {
    function maj() {
      if (!racine.isConnected) { clearInterval(racine._tick); racine._tick = null; return; }
      var st = racine._ctx && racine._ctx.state;
      if (!st) return;
      var m = minutesNuit(st, Date.now());
      var t = racine.querySelector('.mn-clock-t');
      if (t) t.textContent = heureNuit(m);
      var tot = 22 * 60 + Math.min(m, 480);
      var h = racine.querySelector('.mn-clock-h'), mi = racine.querySelector('.mn-clock-m');
      if (h && mi) {
        var ah = ((tot / 60) % 12) * 30, am = (tot % 60) * 6;
        h.setAttribute('transform', 'rotate(' + ah + ' 20 20)');
        mi.setAttribute('transform', 'rotate(' + am + ' 20 20)');
      }
      var c = racine.querySelector('.mn-clock');
      if (c) c.classList.toggle('aube', m >= 360);
    }
    maj();
    if (!racine._tick) racine._tick = setInterval(maj, 5000);
  }

  /* ---------- effets (une seule fois par évènement) ---------- */
  function effets(racine, s, ctx, ch) {
    var fx = GG.fx, sfx = GG.sfx;
    var av = racine._snap || {};
    var solved = s.pistes.filter(function (p) { return p.solved; }).map(function (p) { return p.id; });
    var nu = {
      caseId: s.caseId, phase: s.phase, solved: solved.join(','), vote: s.vote ? s.vote.id : 0,
      verdict: s.verdict ? s.verdict.id : 0, wrong: s.wrongAnswers, reveles: (s.reveles || []).length
    };
    racine._snap = nu;
    if (av.caseId !== nu.caseId) {
      if (s.phase === 'brief') sfx.play('open', { volume: 0.7 });
      return; // premier affichage de l'affaire : pas de rafale d'effets
    }
    if (av.phase !== nu.phase) {
      if (nu.phase === 'roles') { sfx.play('flip'); GG.haptic('light'); }
      if (nu.phase === 'play' && av.phase === 'roles') sfx.play('bell', { volume: 0.6 });
      if (nu.phase === 'vote') { sfx.play('bell'); GG.haptic('medium'); }
      if (nu.phase === 'verdict') theatre(racine, s);
    }
    if (av.solved !== nu.solved && nu.solved.length > (av.solved || '').length) {
      var nouveau = solved.filter(function (id) { return (av.solved || '').split(',').indexOf(id) === -1; });
      var p = nouveau.length ? byId(s.pistes, nouveau[0]) : null;
      var moi = p && s.players[ctx.me] && p.solvedBy === s.players[ctx.me].name;
      if (moi) {
        sfx.play('correct'); GG.haptic('success');
        setTimeout(function () { sfx.play('deal'); }, 380);
        var cible = racine.querySelector('.mn-clue.carte') || racine.querySelector('.mn-top');
        if (cible) fx.burst(cible, { count: 18, colors: ['#e9cd7c', '#ffd98a', '#fff4d0'], shape: 'star' });
      } else {
        sfx.play('notify', { volume: 0.6 });
        var tuile = p ? racine.querySelector('.mn-piste[data-v="' + s.pistes.indexOf(p) + '"]') : null;
        if (tuile) fx.glow(tuile, '#e9cd7c', 1200);
      }
    }
    if (nu.wrong > (av.wrong | 0)) {
      var w = racine.querySelector('.mn-wrong');
      if (w) { fx.shake(w); sfx.play('wrong', { volume: 0.7 }); GG.haptic('error'); }
    }
    if (nu.reveles > (av.reveles | 0)) { sfx.play('reveal', { volume: 0.6 }); }
  }

  /* l'accusation théâtrale : roulement, trois cartes qui se retournent, verdict */
  function theatre(racine, s) {
    var sfx = GG.sfx, fx = GG.fx, v = s.verdict;
    var cle = s.caseId + ':' + v.id;
    if (racine._theatre === cle) return;
    racine._theatre = cle;
    racine._vts = Date.now();
    [0, 1, 2].forEach(function (i) {
      setTimeout(function () { sfx.play('tick', { volume: 0.8 }); }, 300 + i * 260);
      setTimeout(function () { sfx.play('flip'); }, 900 + i * 700);
    });
    setTimeout(function () {
      var t = racine.querySelector('.mn-tampon');
      if (v.win) {
        sfx.play('reveal');
        GG.haptic('success');
        if (t) fx.burst(t, { count: 30, colors: ['#e9cd7c', '#fff4d0', '#c9a84c'], shape: 'star' });
      } else {
        sfx.play('explosion', { volume: 0.5 });
        GG.haptic('error');
        fx.shakeScreen(v.final ? 1 : 0.6);
      }
    }, 3000);
  }

  /* ---------- les gestes (délégués : survivent aux mises à jour des zones) ---------- */
  function brancher(racine) {
    function act(a) {
      // anti double-appui : le même geste, sur la même cible, pas deux fois en 350 ms
      var now = Date.now(), cle = a.t + ':' + (a.k || '') + ':' + (a.piste !== undefined ? a.piste : '') + ':' + (a.text || '');
      if (racine._busyK === cle && now - (racine._busy || 0) < 350) return false;
      racine._busy = now;
      racine._busyK = cle;
      return racine._ctx.act(a);
    }
    function redessine() { rendu(racine.parentNode, racine._ctx); }
    function envoyer() {
      var inp = racine.querySelector('#mn-answer');
      var s = racine._ctx.state;
      if (!inp || !inp.value.trim() || view.piste < 0) return;
      var txt = inp.value;
      if (act({ t: 'answer', piste: view.piste, text: txt })) {
        inp.value = '';
        if (view.drafts) view.drafts[view.piste] = '';
      }
      void s;
    }
    racine.addEventListener('input', function (ev) {
      if (ev.target && ev.target.id === 'mn-answer') {
        view.drafts = view.drafts || {};
        view.drafts[view.piste] = ev.target.value;
      }
    });
    racine.addEventListener('keydown', function (ev) {
      if (ev.target && ev.target.id === 'mn-answer' && ev.key === 'Enter') { ev.preventDefault(); envoyer(); }
    });
    racine.addEventListener('click', function (ev) {
      var b = ev.target.closest ? ev.target.closest('[data-a]') : null;
      if (!b || !racine.contains(b) || b.disabled) return;
      var ctx = racine._ctx, s = ctx.state, a = b.getAttribute('data-a'), v = b.getAttribute('data-v');
      switch (a) {
        case 'tab': view.tab = v; view.piste = -1; GG.sfx.play('tap', { volume: 0.5 }); redessine(); break;
        case 'piste': view.piste = parseInt(v, 10); GG.sfx.play('open', { volume: 0.6 }); redessine(); break;
        case 'back': view.piste = -1; redessine(); break;
        case 'answer': envoyer(); break;
        case 'hint': act({ t: 'hint', piste: view.piste }); break;
        case 'niveau': act({ t: 'niveau', v: v }); break;
        case 'start': act({ t: 'start' }); break;
        case 'lu': act({ t: 'lu' }); break;
        case 'goplay': act({ t: 'goplay' }); break;
        case 'secours': act({ t: 'secours', n: parseInt(v, 10) }); break;
        case 'note':
          var cur = s.notes[v] | 0;
          GG.sfx.play('select', { volume: 0.5 });
          act({ t: 'note', k: v, v: (cur + 1) % 3 });
          break;
        case 'peek': act({ t: 'peek', p: parseInt(v, 10) }); break;
        case 'unpeek': act({ t: 'peek', p: -1 }); break;
        case 'goaccuse': view.accuse = { s: null, a: null, l: null }; view.confirm = false; GG.sfx.play('whoosh', { volume: 0.5 }); redessine(); break;
        case 'noaccuse': view.accuse = null; view.confirm = false; redessine(); break;
        case 'pick':
          view.accuse[b.getAttribute('data-g')] = v;
          GG.sfx.play('select', { volume: 0.6 });
          redessine();
          break;
        case 'confirmer':
          if (view.accuse && view.accuse.s && view.accuse.a && view.accuse.l) {
            view.confirm = true; view.confirmTs = Date.now(); GG.haptic('medium'); redessine();
          }
          break;
        case 'annuler': view.confirm = false; redessine(); break;
        case 'propose':
          // bouton armé après 400 ms : un double appui ne peut pas valider
          if (Date.now() - (view.confirmTs || 0) < 400) return;
          var acc = view.accuse;
          if (!acc) return;
          if (act({ t: 'propose', s: acc.s, a: acc.a, l: acc.l, seq: s.accSeq })) {
            view.accuse = null; view.confirm = false;
          }
          break;
        case 'vote': act({ t: 'vote', id: s.vote && s.vote.id, v: v === '1' }); break;
        case 'retire': act({ t: 'retire', id: s.vote && s.vote.id }); break;
        case 'clore': act({ t: 'clore', id: s.vote && s.vote.id }); break;
        case 'suite':
          // le bouton n'apparaît qu'après le retournement des cartes
          if (Date.now() - (racine._vts || 0) < 2600) return;
          act({ t: 'suite', id: parseInt(v, 10) });
          break;
      }
    });
  }

  GG.register(mod);
  if (typeof module === 'object' && module.exports) module.exports = mod;
})(typeof self !== 'undefined' ? self : globalThis);
