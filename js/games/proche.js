/*
 * GGgames — Le Plus Proche (2 à 12 joueurs, estimation), version V2.
 *
 * Une question à réponse chiffrée que PERSONNE ne connaît par cœur
 * (« Combien de rivets tiennent la tour Eiffel ? »). Chacun tape son
 * estimation en secret sur un grand pavé numérique ; à la révélation, les
 * estimations se posent sur une règle graduée et le drapeau de la réponse
 * tombe. Points selon la distance : 100 pour la réponse exacte, 0 à deux
 * fois la réponse (ou à 50 ans pour une date) ; +30 au plus proche, +50 pour
 * une réponse exacte.
 *
 * La banque : 'Question|réponse|unité|source|catégorie'. Chaque réponse est
 * sourcée (la source s'affiche à la révélation). Pas de question « connue »
 * ou calculable (jours dans l'année, planètes…) et très peu de dates.
 */
(function (root) {
  'use strict';
  var GG = root.GG;
  var CATEGORIES = {
    monu: { nom: 'Monuments', icone: '🏰' },
    geo: { nom: 'Géographie', icone: '🗺️' },
    espace: { nom: 'Espace', icone: '🪐' },
    nature: { nom: 'Nature et corps', icone: '🌿' },
    societe: { nom: 'Société', icone: '📊' },
    sport: { nom: 'Sport', icone: '🏅' },
    tech: { nom: 'Techniques', icone: '✈️' },
    histoire: { nom: 'Histoire', icone: '📜' }
  };
  var MANCHES = [6, 8, 10];
  var CHRONOS = [30, 45, 60];          // secondes (0 = sans chrono : on se passe le téléphone)

  /* Banque (184 questions sourcées) */
  var BANK = [
    "Combien de marches faut-il gravir pour monter à pied jusqu’au 2e étage de la tour Eiffel ?|674|marches|Société d’exploitation de la tour Eiffel (SETE)|monu",
    "Combien de rivets maintiennent la charpente de la tour Eiffel ?|2500000|rivets|SETE|monu",
    "Combien de tonnes de peinture faut-il pour repeindre la tour Eiffel ?|60|tonnes|SETE|monu",
    "Combien de mois a duré la construction de la tour Eiffel ?|26|mois|SETE (2 ans, 2 mois et 5 jours)|monu",
    "Combien de panneaux de verre recouvrent la pyramide du Louvre ?|673|panneaux|Musée du Louvre|monu",
    "Combien de visiteurs le musée du Louvre a-t-il accueillis en 2024 ?|8700000|visiteurs|Musée du Louvre, bilan 2024|monu",
    "Combien de miroirs ornent la galerie des Glaces du château de Versailles ?|357|miroirs|Château de Versailles|monu",
    "Quelle est la superficie du domaine national de Versailles ?|800|hectares|Château de Versailles|monu",
    "Combien de pièces compte le château de Chambord ?|426|pièces|Domaine national de Chambord|monu",
    "Combien de cheminées compte le château de Chambord ?|282|cheminées|Domaine national de Chambord|monu",
    "Combien d’escaliers compte le château de Chambord ?|77|escaliers|Domaine national de Chambord|monu",
    "Quelle est la hauteur de la flèche de Notre-Dame de Paris, reconstruite à l’identique ?|96|m|Établissement public Rebâtir Notre-Dame de Paris|monu",
    "Combien de chênes environ ont servi à reconstruire la charpente et la flèche de Notre-Dame ?|2000|chênes|Rebâtir Notre-Dame de Paris|monu",
    "Combien d’années a duré la construction de la cathédrale Notre-Dame de Paris (1163-1345) ?|182|ans|Cathédrale Notre-Dame de Paris|monu",
    "Combien d’étages compte la tour Montparnasse ?|59|étages|Tour Montparnasse 56|monu",
    "Combien d’étages compte le Burj Khalifa à Dubaï ?|163|étages|Emaar Properties|monu",
    "Quelle est la hauteur du Burj Khalifa à Dubaï ?|828|m|Emaar Properties|monu",
    "Quelle est la hauteur de la statue de la Liberté, socle compris ?|93|m|U.S. National Park Service|monu",
    "Quelle est la hauteur de la plus haute pile du viaduc de Millau, pylône compris ?|343|m|Eiffage, constructeur du viaduc|monu",
    "Quelle est la longueur du viaduc de Millau ?|2460|m|Eiffage|monu",
    "Quelle est la longueur du pont de l’île de Ré ?|2926|m|Département de la Charente-Maritime|monu",
    "Quelle est la longueur du pont de Normandie ?|2143|m|Chambre de commerce et d’industrie Seine Estuaire|monu",
    "Quelle est la longueur totale de la Grande Muraille de Chine, toutes sections comprises ?|21196|km|Administration d’État du patrimoine culturel de Chine (2012)|monu",
    "Combien de blocs de pierre compte la pyramide de Khéops, en milliers ?|2300|milliers|Estimation classique des égyptologues (2,3 millions)|monu",
    "Quelle était la hauteur d’origine de la pyramide de Khéops ?|146|m|Ministère égyptien du Tourisme et des Antiquités|monu",
    "Combien de marches mènent au dôme de la basilique du Sacré-Cœur ?|300|marches|Basilique du Sacré-Cœur de Montmartre|monu",
    "Combien de ponts franchissent la Seine dans Paris ?|37|ponts|Ville de Paris|monu",
    "Combien de places compte le Stade de France en configuration football ?|80000|places|Consortium Stade de France|monu",
    "Combien de places compte l’Orange Vélodrome de Marseille ?|67394|places|Olympique de Marseille|monu",
    "Combien de monuments historiques sont protégés en France ?|46000|monuments|Ministère de la Culture|monu",
    "Combien de musées portent l’appellation « musée de France » ?|1220|musées|Ministère de la Culture|monu",
    "Quelle est l’altitude du mont Ventoux ?|1910|m|IGN|geo",
    "Quelle est l’altitude du pic du Midi de Bigorre ?|2877|m|IGN|geo",
    "Quelle est l’altitude du puy de Sancy, point culminant du Massif central ?|1885|m|IGN|geo",
    "Quelle est l’altitude du Vignemale, plus haut sommet des Pyrénées françaises ?|3298|m|IGN|geo",
    "Quelle est l’altitude du mont Blanc selon la mesure de 2023 ?|4805|m|Chambre départementale des géomètres-experts de Haute-Savoie (2023)|geo",
    "Quelle est la profondeur maximale du lac Léman ?|310|m|Commission internationale pour la protection des eaux du Léman (CIPEL)|geo",
    "Quelle est la superficie du lac Léman ?|580|km²|CIPEL|geo",
    "Quelle est la superficie de la Corse ?|8680|km²|INSEE|geo",
    "Quelle est la longueur des côtes de la Corse ?|1000|km|INSEE|geo",
    "Combien de communes comptait la France au 1er janvier 2024 ?|34935|communes|INSEE, code officiel géographique 2024|geo",
    "Quelle est la superficie de la principauté de Monaco ?|208|hectares|Gouvernement princier de Monaco|geo",
    "Combien de lacs de plus de 5 ares compte la Finlande ?|187888|lacs|Institut finlandais de l’environnement (SYKE)|geo",
    "Combien d’îles compte l’archipel des Philippines ?|7641|îles|Autorité nationale de cartographie des Philippines (NAMRIA, 2016)|geo",
    "Quelle est la profondeur du point le plus bas de la fosse des Mariannes ?|10935|m|NOAA|geo",
    "Quelle est la hauteur totale du Salto Angel, la plus haute chute d’eau du monde ?|979|m|Parc national Canaima (Venezuela)|geo",
    "Quelle est la profondeur maximale du lac Baïkal ?|1642|m|UNESCO, patrimoine mondial|geo",
    "Quelle est la largeur des chutes Victoria ?|1708|m|UNESCO, patrimoine mondial|geo",
    "Quelle est la superficie de la Russie, en millions de km² ?|17|millions de km²|Service fédéral des statistiques de Russie (Rosstat)|geo",
    "Quelle est la superficie du Sahara, en millions de km² ?|9|millions de km²|Encyclopædia Universalis|geo",
    "Quelle est la longueur du Transsibérien entre Moscou et Vladivostok ?|9289|km|Chemins de fer russes (RZD)|geo",
    "Quelle est la longueur de la frontière entre les États-Unis et le Canada ?|8891|km|International Boundary Commission|geo",
    "Combien de fuseaux horaires traversent la Russie ?|11|fuseaux|Gouvernement de la fédération de Russie|geo",
    "Combien de langues officielles compte l’Afrique du Sud depuis 2023 ?|12|langues|Constitution sud-africaine, 18e amendement (2023)|geo",
    "Combien de langues sont reconnues par la Constitution indienne ?|22|langues|Constitution de l’Inde, 8e annexe|geo",
    "Quelle est la longueur du canal de Suez ?|193|km|Autorité du canal de Suez|geo",
    "Quelle est la longueur du canal de Panama ?|82|km|Autorité du canal de Panama|geo",
    "Quelle est la largeur du détroit de Gibraltar à son point le plus étroit ?|14|km|Encyclopædia Universalis|geo",
    "Quelle est la largeur de la Manche au pas de Calais ?|33|km|Service hydrographique et océanographique de la Marine (SHOM)|geo",
    "Quelle est la longueur de l’ancienne Route 66, de Chicago à Santa Monica ?|3940|km|U.S. National Park Service|geo",
    "Quelle est la hauteur de la plus grande vague jamais surfée (Nazaré, 2020) ?|26|m|Guinness World Records|geo",
    "Combien d’habitants compte l’Islande ?|383000|habitants|Statistics Iceland (2024)|geo",
    "Combien de langues sont parlées dans le monde aujourd’hui ?|7000|langues|Ethnologue (SIL International)|geo",
    "Quelle est la part de la France métropolitaine couverte par la forêt ?|31|%|IGN, inventaire forestier 2023|geo",
    "Combien d’espèces d’arbres poussent dans les forêts françaises ?|190|espèces|IGN, inventaire forestier|geo",
    "Quel est le record de chaleur mesuré en France, à Vérargues le 28 juin 2019 ?|46|°C|Météo-France|geo",
    "Combien d’heures d’ensoleillement Marseille reçoit-elle en moyenne par an ?|2850|heures|Météo-France, normales 1991-2020|geo",
    "Quelle est la distance moyenne entre la Terre et la Lune ?|384400|km|NASA|espace",
    "Quelle est la température moyenne à la surface de Vénus ?|464|°C|NASA|espace",
    "Combien de jours terrestres dure une rotation de Vénus sur elle-même ?|243|jours|NASA|espace",
    "Quel est le diamètre de la Lune ?|3474|km|NASA|espace",
    "Quel est le diamètre de Jupiter ?|139820|km|NASA|espace",
    "À quelle vitesse la Terre tourne-t-elle autour du Soleil ?|107000|km/h|NASA|espace",
    "À quelle altitude orbite la Station spatiale internationale ?|400|km|NASA|espace",
    "À quelle vitesse la Station spatiale internationale file-t-elle ?|28000|km/h|NASA|espace",
    "Combien de fois par jour la Station spatiale internationale fait-elle le tour de la Terre ?|16|tours|NASA|espace",
    "Quel est l’âge de l’Univers, en millions d’années ?|13800|millions d’années|Mission Planck (ESA)|espace",
    "Quel est l’âge de la Terre, en millions d’années ?|4540|millions d’années|U.S. Geological Survey|espace",
    "Combien d’humains ont marché sur la Lune ?|12|humains|NASA, programme Apollo|espace",
    "Quelle est la hauteur de la fusée Saturn V qui emmena les astronautes vers la Lune ?|111|m|NASA|espace",
    "Quelle était la masse de la fusée Saturn V au décollage ?|2900|tonnes|NASA|espace",
    "Combien de constellations officielles compte le ciel ?|88|constellations|Union astronomique internationale|espace",
    "Combien de jours dure une année sur Mars ?|687|jours|NASA|espace",
    "Combien de neurones compte le cerveau humain, en milliards ?|86|milliards|Azevedo et al., Journal of Comparative Neurology (2009)|nature",
    "Combien pèse en moyenne le cerveau d’un adulte ?|1400|grammes|Inserm|nature",
    "Combien de fois le cœur bat-il environ en une journée ?|100000|battements|Fédération française de cardiologie|nature",
    "Combien de litres d’air un adulte respire-t-il environ par jour ?|12000|litres|Airparif|nature",
    "Combien pesait le cœur de baleine bleue conservé au Musée royal de l’Ontario ?|180|kg|Musée royal de l’Ontario (2015)|nature",
    "Quelle longueur peut atteindre une baleine bleue ?|30|m|WWF France|nature",
    "Combien de pattes possède le mille-pattes Eumillipes persephone, découvert en 2021 ?|1306|pattes|Marek et al., Scientific Reports (2021)|nature",
    "Combien pèse un œuf d’autruche ?|1400|grammes|Muséum national d’histoire naturelle|nature",
    "Quelle vitesse atteint le faucon pèlerin en piqué ?|390|km/h|Ligue pour la protection des oiseaux (LPO)|nature",
    "Quelle est la hauteur d’Hyperion, le plus grand arbre du monde, un séquoia de Californie ?|116|m|Redwood National Park (mesure 2019)|nature",
    "Quel âge a Mathusalem, le plus vieux pin connu, dans les Montagnes Blanches de Californie ?|4850|ans|U.S. Forest Service|nature",
    "Combien d’œufs une reine abeille peut-elle pondre en une journée ?|2000|œufs|INRAE|nature",
    "Combien de jours vit une abeille ouvrière née au printemps ?|40|jours|INRAE|nature",
    "Combien d’espèces de mammifères sont connues dans le monde ?|6600|espèces|American Society of Mammalogists, Mammal Diversity Database|nature",
    "Combien pèse un éléphant d’Afrique mâle adulte ?|6|tonnes|WWF|nature",
    "Quelle est la longueur de la langue d’une girafe ?|50|cm|San Diego Zoo Wildlife Alliance|nature",
    "Jusqu’à quelle vitesse un guépard peut-il courir ?|110|km/h|Smithsonian National Zoo|nature",
    "Combien de dents possède un chien adulte ?|42|dents|École nationale vétérinaire d’Alfort|nature",
    "Combien de temps dure la gestation d’une éléphante ?|22|mois|WWF|nature",
    "Combien de litres d’eau faut-il pour produire un jean ?|7500|litres|Programme des Nations unies pour l’environnement|nature",
    "Combien de litres d’eau faut-il pour produire un kilo de bœuf ?|15000|litres|Water Footprint Network|nature",
    "Combien de litres d’eau un Français consomme-t-il en moyenne par jour à domicile ?|148|litres|Observatoire des services publics d’eau (SISPEA, 2021)|nature",
    "Combien de kilos de déchets ménagers un Français produit-il par an ?|580|kg|ADEME|nature",
    "Combien d’os compte un pied humain ?|26|os|Inserm|nature",
    "Combien pèse une meule de comté ?|40|kg|Comité interprofessionnel de gestion du comté|nature",
    "Combien de bulles une coupe de champagne libère-t-elle environ ?|1000000|bulles|Gérard Liger-Belair, université de Reims|nature",
    "Quelle est la pression dans une bouteille de champagne ?|6|bars|Comité Champagne|nature",
    "Combien de bébés sont nés en France en 2024 ?|663000|naissances|INSEE, bilan démographique 2024|societe",
    "Quel est l’âge moyen des mères à l’accouchement en France (2023) ?|31|ans|INSEE|societe",
    "Combien de mariages ont été célébrés en France en 2023 ?|241000|mariages|INSEE|societe",
    "Combien de boulangeries compte la France ?|35000|boulangeries|Confédération nationale de la boulangerie-pâtisserie française|societe",
    "Combien de baguettes les Français achètent-ils chaque année, en milliards ?|6|milliards|Observatoire du pain|societe",
    "Combien de kilos de fromage un Français mange-t-il en moyenne par an ?|27|kg|CNIEL (interprofession laitière)|societe",
    "Combien de fromages français bénéficient d’une AOP ?|46|fromages|INAO|societe",
    "Combien de millions d’hectolitres de vin la France a-t-elle produits en 2023 ?|48|millions d’hectolitres|Agreste, ministère de l’Agriculture|societe",
    "Combien de bouteilles de champagne ont été expédiées dans le monde en 2023, en millions ?|299|millions|Comité Champagne|societe",
    "Combien de touristes étrangers la France a-t-elle accueillis en 2023, en millions ?|100|millions|Atout France|societe",
    "Combien de voitures particulières roulent en France, en millions ?|39|millions|Ministère de la Transition écologique (SDES, 2024)|societe",
    "Combien de billets en euros sont en circulation, en milliards ?|30|milliards|Banque centrale européenne|societe",
    "Combien d’utilisateurs mensuels revendique Facebook, en milliards ?|3|milliards|Meta (2024)|societe",
    "Combien d’heures de vidéo sont mises en ligne sur YouTube chaque minute ?|500|heures|YouTube|societe",
    "Combien d’épisodes de Plus belle la vie ont été diffusés sur France 3 (2004-2022) ?|4665|épisodes|France Télévisions|societe",
    "Combien d’épisodes compte la série Friends ?|236|épisodes|Warner Bros. Television|societe",
    "Combien de minutes dure le film Titanic de James Cameron ?|194|minutes|Centre national du cinéma (CNC)|societe",
    "Combien d’Oscars le film Titanic a-t-il remportés ?|11|Oscars|Académie des arts et des sciences du cinéma|societe",
    "Combien de spectateurs, en millions, ont vu Bienvenue chez les Ch’tis au cinéma en France ?|20|millions|CNC|societe",
    "En combien de langues et dialectes Le Petit Prince a-t-il été traduit ?|600|langues|Fondation Antoine de Saint-Exupéry pour la jeunesse|societe",
    "Combien d’exemplaires du jeu Minecraft ont été vendus, en millions (2023) ?|300|millions|Microsoft (octobre 2023)|societe",
    "Combien de Rubik’s Cube ont été vendus dans le monde, en millions ?|500|millions|Spin Master|societe",
    "Combien de sonnets William Shakespeare a-t-il écrits ?|154|sonnets|Folger Shakespeare Library|societe",
    "Combien de fables Jean de La Fontaine a-t-il écrites ?|243|fables|Bibliothèque nationale de France|societe",
    "Combien de mots compte le dictionnaire Le Petit Robert de la langue française ?|60000|mots|Éditions Le Robert|societe",
    "Combien de lettres compte l’alphabet hawaïen ?|13|lettres|Université d’Hawaï|societe",
    "Combien de transistors compte la puce A17 Pro de l’iPhone 15 Pro, en milliards ?|19|milliards|Apple (2023)|societe",
    "Combien de smartphones ont été vendus dans le monde en 2023, en millions ?|1170|millions|IDC|societe",
    "Combien pesait l’ordinateur ENIAC, dévoilé en 1946 ?|27|tonnes|Université de Pennsylvanie|societe",
    "Combien de tours compte le Grand Prix de Monaco de Formule 1 ?|78|tours|Automobile Club de Monaco|sport",
    "Quelle est la longueur du circuit des 24 Heures du Mans ?|13626|m|Automobile Club de l’Ouest|sport",
    "Quelle distance record une voiture a-t-elle parcourue en 24 heures au Mans (Audi, 2010) ?|5410|km|Automobile Club de l’Ouest|sport",
    "Quelle était la longueur du Tour de France 2024 ?|3492|km|Amaury Sport Organisation (ASO)|sport",
    "Combien de kilomètres parcourent les skippers du Vendée Globe ?|45000|km|Vendée Globe|sport",
    "En combien de jours Charlie Dalin a-t-il bouclé le Vendée Globe 2024-2025 ?|64|jours|Vendée Globe (64 j 19 h 22 min)|sport",
    "Combien de balles de tennis sont utilisées pendant le tournoi de Wimbledon ?|55000|balles|All England Lawn Tennis Club|sport",
    "Combien pèse le trophée de la Coupe du monde de football ?|6|kg|FIFA|sport",
    "Combien pèse une balle de tennis ?|57|grammes|Fédération internationale de tennis (ITF)|sport",
    "Quelle est la hauteur du filet de tennis en son centre ?|91|cm|Fédération internationale de tennis (ITF)|sport",
    "Quel est le diamètre d’un trou de golf ?|108|mm|Règles du golf, R&A|sport",
    "Quelle est la hauteur de la barre transversale d’un but de football ?|244|cm|Lois du jeu, IFAB|sport",
    "Quelle est la largeur d’un but de football ?|732|cm|Lois du jeu, IFAB|sport",
    "Combien pèse un ballon de football officiel ?|430|grammes|Lois du jeu, IFAB (410 à 450 g)|sport",
    "À quelle vitesse la rame TGV V150 a-t-elle battu le record du monde sur rail en 2007 ?|575|km/h|SNCF|sport",
    "Quelle est la hauteur d’un panier de basket ?|305|cm|Fédération internationale de basket-ball (FIBA)|sport",
    "Combien de combinaisons possibles offre un Rubik’s Cube, en milliards de milliards ?|43|milliards de milliards|Spin Master|sport",
    "Combien de passagers un Airbus A380 peut-il transporter au maximum ?|853|passagers|Airbus|tech",
    "Quelle est l’envergure d’un Airbus A380 ?|80|m|Airbus|tech",
    "À quelle vitesse volait le Concorde en croisière ?|2180|km/h|Air France, musée Delta|tech",
    "Quelle distance parcourt le plus long vol commercial du monde, entre Singapour et New York ?|15349|km|Singapore Airlines|tech",
    "Quelle est la longueur d’une rame de TGV Duplex ?|200|m|SNCF|tech",
    "Combien de kilomètres de lignes à grande vitesse compte la France ?|2800|km|SNCF Réseau|tech",
    "Combien de voitures Ford T ont été produites, en millions ?|15|millions|Ford Motor Company|tech",
    "Combien d’années a duré le règne de Louis XIV ?|72|ans|Château de Versailles|histoire",
    "Combien de rois de France ont porté le prénom Louis ?|18|rois|Bibliothèque nationale de France|histoire",
    "Combien de jours a duré la bataille de Verdun ?|300|jours|Mémorial de Verdun|histoire",
    "Combien de soldats français sont morts pendant la Première Guerre mondiale, en milliers ?|1400|milliers|Office national des combattants et victimes de guerre (ONACVG)|histoire",
    "À quel âge Mozart est-il mort ?|35|ans|Fondation internationale Mozarteum de Salzbourg|histoire",
    "À quel âge Toutânkhamon est-il mort ?|19|ans|Ministère égyptien du Tourisme et des Antiquités|histoire",
    "Combien de personnes se trouvaient à bord du Titanic lors de son naufrage ?|2224|personnes|Encyclopedia Titanica|histoire",
    "Combien de personnes ont survécu au naufrage du Titanic ?|710|survivants|Encyclopedia Titanica|histoire",
    "Combien d’heures a duré la traversée de l’Atlantique de Charles Lindbergh en 1927 ?|33|heures|Smithsonian National Air and Space Museum|histoire",
    "Combien de marins sont revenus de l’expédition de Magellan autour du monde en 1522 ?|18|marins|Encyclopædia Universalis|histoire",
    "Combien d’années a duré le premier tour du monde de l’expédition de Magellan ?|3|ans|Encyclopædia Universalis (1519-1522)|histoire",
    "En quelle année Karl Drais a-t-il inventé la draisienne, ancêtre du vélo ?|1817|année|Musée national de l’automobile et de la technique de Mannheim|histoire",
    "En quelle année le premier timbre-poste français a-t-il été émis ?|1849|année|Musée de La Poste|histoire",
    "En quelle année est né Molière ?|1622|année|Comédie-Française|histoire",
    "En quelle année le métro de Paris a-t-il été inauguré ?|1900|année|RATP|histoire",
    "En quelle année l’Académie française a-t-elle été fondée ?|1635|année|Académie française|histoire",
    "Combien de présidents a connus la Ve République jusqu’à Emmanuel Macron compris ?|8|présidents|Présidence de la République|histoire",
    "Combien de jours a duré la Commune de Paris en 1871 ?|72|jours|Musée d’Orsay|histoire",
    "Combien de médailles la France a-t-elle remportées aux Jeux olympiques de Paris 2024 ?|64|médailles|Comité international olympique|histoire",
    "Combien de bénévoles ont participé aux Jeux olympiques et paralympiques de Paris 2024 ?|45000|bénévoles|Comité d’organisation Paris 2024|histoire",
    "Combien d’athlètes ont participé aux Jeux olympiques de Paris 2024 ?|10500|athlètes|Comité international olympique|histoire"
  ];

  /* ================================================================
   * 1. La banque
   * ================================================================ */
  function parseQ(e) {
    var p = e.split('|');
    return { q: p[0], a: parseInt(p[1], 10), unit: p[2] || '', src: p[3] || '', cat: p[4] || 'geo' };
  }
  function estAnnee(q) { return !!q && q.unit === 'année'; }
  /* 12345678 → « 12 345 678 » (espaces insécables fines) */
  function fmtN(n) {
    if (typeof n !== 'number' || !isFinite(n)) return '—';
    var s = String(Math.round(Math.abs(n))), out = '';
    while (s.length > 3) { out = ' ' + s.slice(-3) + out; s = s.slice(0, -3); }
    return (n < 0 ? '−' : '') + s + out;
  }
  function uniteDe(q) { return estAnnee(q) ? '' : (q && q.unit) || ''; }

  /* Points selon la distance : 100 si exact, 0 à deux fois la réponse
     (ou à 50 ans d'écart pour une date) */
  function points(g, q) {
    if (typeof g !== 'number' || !q || typeof q.a !== 'number') return 0;
    var d = Math.abs(g - q.a);
    var echelle = estAnnee(q) ? 50 : Math.max(1, q.a);
    return Math.round(100 * Math.max(0, 1 - d / echelle));
  }
  var BONUS_PROCHE = 30, BONUS_EXACT = 50;

  /* Les questions déjà posées sur ce téléphone passent après les autres */
  var CLE_VUES = 'gg-proche-vues';
  function lireVues() {
    try {
      if (typeof localStorage === 'undefined') return [];
      var v = JSON.parse(localStorage.getItem(CLE_VUES) || '[]');
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }
  function noterVues(liste) {
    try {
      if (typeof localStorage === 'undefined') return;
      var v = lireVues().concat(liste);
      if (v.length > 150) v = v.slice(v.length - 150);
      localStorage.setItem(CLE_VUES, JSON.stringify(v));
    } catch (e) {}
  }
  function empreinte(q) {
    var h = 0;
    for (var i = 0; i < q.length; i++) h = (h * 31 + q.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }

  /* Tirage varié : jamais deux fois la même catégorie d'affilée, au plus
     un tiers par catégorie, au plus une date par partie */
  function tirer(nb) {
    var vues = {};
    lireVues().forEach(function (h) { vues[h] = true; });
    var tout = GG.shuffle(BANK.map(parseQ));
    var pool = tout.filter(function (q) { return !vues[empreinte(q.q)]; })
      .concat(tout.filter(function (q) { return vues[empreinte(q.q)]; }));
    var out = [], pris = {}, parCat = {}, annees = 0, max = Math.ceil(nb / 3);
    for (var passe = 0; passe < 2 && out.length < nb; passe++) {
      for (var i = 0; i < pool.length && out.length < nb; i++) {
        var q = pool[i];
        if (pris[q.q]) continue;
        if (passe === 0) {
          if ((parCat[q.cat] || 0) >= max) continue;
          if (estAnnee(q) && annees >= 1) continue;
          if (out.length && out[out.length - 1].cat === q.cat) continue;
        }
        pris[q.q] = true;
        out.push(q);
        parCat[q.cat] = (parCat[q.cat] || 0) + 1;
        if (estAnnee(q)) annees++;
      }
    }
    noterVues(out.map(function (q) { return empreinte(q.q); }));
    return out;
  }

  /* ================================================================
   * 2. Règles
   * ================================================================ */
  function lireOpts(src, n) {
    src = src || {};
    var o = { nb: 8, chrono: 45, mode: 'chrono' };
    if (src.nb !== undefined) {
      if (MANCHES.indexOf(src.nb) === -1) return { error: 'Nombre de manches invalide.' };
      o.nb = src.nb;
    }
    if (src.mode !== undefined) {
      if (src.mode !== 'chrono' && src.mode !== 'secret') return { error: 'Mode inconnu.' };
      o.mode = src.mode;
    }
    if (src.chrono !== undefined) {
      if (CHRONOS.indexOf(src.chrono) === -1) return { error: 'Durée invalide.' };
      o.chrono = src.chrono;
    }
    if (o.mode === 'secret') o.chrono = 0;     // on se passe le téléphone : pas de chrono
    return o;
  }
  function norme(state) {
    if (!state.opts) state.opts = { nb: state.qs.length || 8, chrono: 0, mode: 'secret' };
    state.players.forEach(function (p) {
      if (typeof p.gain !== 'number') p.gain = 0;
      if (p.guess === undefined) p.guess = null;
    });
    if (typeof state.dernier !== 'number') state.dernier = -1;
    if (state.reveal && !state.reveal.avant) {
      state.reveal.avant = state.players.map(function (p) { return p.score; });
      state.reveal.gains = state.players.map(function () { return 0; });
    }
    return state;
  }
  function cle(state) {
    return state.phase === 'guess' ? 'g' + state.gameTs + ':' + state.idx : '';
  }
  function lancer(state) {
    state.phase = 'guess';
    state.reveal = null;
    state.dernier = -1;
    state.players.forEach(function (p) { p.guess = null; p.gain = 0; });
    state.debut = Date.now();
    if (state.opts.chrono > 0) {
      var ms = state.opts.chrono * 1000;
      state.ech = { k: cle(state), fin: state.debut + ms, duree: ms };
      return { ok: true, timer: { ms: ms + 400, action: { t: 'expire', k: state.ech.k } } };
    }
    state.ech = null;
    return { ok: true };
  }
  function reveler(state, pourquoi) {
    var q = state.qs[state.idx];
    var best = Infinity;
    state.players.forEach(function (p) {
      if (typeof p.guess === 'number') best = Math.min(best, Math.abs(p.guess - q.a));
    });
    var winners = [], avant = [], gains = [], dist = [];
    state.players.forEach(function (p, i) {
      avant.push(p.score);
      var g = 0, d = null;
      if (typeof p.guess === 'number') {
        d = Math.abs(p.guess - q.a);
        g = points(p.guess, q);
        if (d === best) { winners.push(i); g += BONUS_PROCHE; }
        if (d === 0) g += BONUS_EXACT;
      }
      p.gain = g;
      p.score += g;
      gains.push(g);
      dist.push(d);
    });
    state.reveal = {
      answer: q.a, unit: q.unit, src: q.src, winners: winners, exact: best === 0,
      guesses: state.players.map(function (p) { return p.guess; }),
      gains: gains, avant: avant, dist: dist, pourquoi: pourquoi,
      vue: state.dernier >= 0 ? state.dernier : 0
    };
    state.phase = 'reveal';
    state.ech = null;
  }
  function lireNombre(v) {
    var s = String(v === undefined || v === null ? '' : v).replace(/[\s  .]/g, '');
    if (!/^\d{1,13}$/.test(s)) return null;
    var n = parseInt(s, 10);
    return n <= 1e12 ? n : null;
  }

  /* Niveaux de l'ordinateur : l'écart typique de ses estimations */
  var NIV_IA = { facile: 0.6, moyen: 0.33, difficile: 0.15 };
  function gauss() {
    var u = 1 - Math.random(), v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  /* un humain dit « 2 500 000 », pas « 2 487 312 » */
  function arrondiHumain(n) {
    if (n < 100) return Math.round(n);
    var p = Math.pow(10, Math.floor(Math.log(n) / Math.LN10) - 1);
    return Math.round(n / p) * p;
  }

  var mod = {
    id: 'proche',
    nom: 'Le Plus Proche',
    icone: '🎯',
    desc: 'Personne ne connaît la réponse exacte : il suffit d’être moins loin que les autres ! 184 questions sourcées, estimations secrètes, points selon la distance.',
    min: 2, max: 12,
    hotseat: true, hotseatMax: 4, hidden: true, netOnly: false,
    niveaux: ['facile', 'moyen', 'difficile'],
    regles: '<p><strong>🎯 Le but :</strong> être le plus proche de la bonne réponse — personne ne la connaît par cœur, il faut l’estimer !</p>' +
      '<p><strong>Comment jouer :</strong> à chaque manche, une question chiffrée (« Combien de rivets tiennent la tour Eiffel ? »). Chacun tape son estimation <strong>en secret</strong> sur le pavé numérique. À la révélation, les estimations se posent sur une règle graduée et la réponse tombe, avec sa source.</p>' +
      '<p><strong>Les points :</strong> jusqu’à <strong>100</strong> selon la distance (100 si c’est exact, 50 à mi-chemin, 0 à deux fois la réponse ; pour une date, 0 à 50 ans d’écart), <strong>+30</strong> au plus proche (les ex æquo aussi), <strong>+50</strong> pour une réponse exacte.</p>' +
      '<p><strong>Sur un seul téléphone :</strong> on se le passe, l’écran se masque entre deux joueurs. Chacun son téléphone : un chrono, et l’hôte peut « ne plus attendre » un absent.</p>',

    create: function (names) {
      return {
        players: names.map(function (n) { return { name: n, score: 0, guess: null, gain: 0 }; }),
        opts: { nb: 8, chrono: 45, mode: 'chrono' },
        qs: [],
        idx: 0,
        phase: 'setup',          // setup → guess ⇄ reveal → fin
        ech: null,
        debut: 0,
        dernier: -1,
        reveal: null,
        gameTs: Math.floor(Math.random() * 1e9),
        finished: false
      };
    },

    turnOf: function () { return -1; }, // tout le monde estime en même temps
    viewerOf: function (state) {
      if (!state.opts || state.opts.mode !== 'secret') return 0;
      var n = state.players.length;
      if (state.phase === 'guess') {
        for (var k = 0; k < n; k++) {
          var i = (state.idx + k) % n;
          if (state.players[i].guess === null) return i;
        }
      }
      if (state.phase === 'reveal' && state.reveal) return state.reveal.vue | 0;
      return 0;
    },
    over: function (state) { return state.finished; },
    scoreOf: function (state, i) { return state.players[i].score; },
    gagnants: function (state) {
      var max = -1, g = [];
      state.players.forEach(function (p) { if (p.score > max) max = p.score; });
      state.players.forEach(function (p, i) { if (p.score === max) g.push(i); });
      return g.length === 1 ? g : [];
    },

    summary: function (state) {
      var rows = state.players.map(function (p) { return { n: p.name, s: p.score }; })
        .sort(function (a, b) { return b.s - a.s; });
      var html = '<div class="qz-sum">';
      var marches = [rows[1], rows[0], rows[2]];
      html += '<div class="qz-podium">' + marches.map(function (r, k) {
        if (!r) return '<div class="qz-marche vide"></div>';
        var place = k === 1 ? 1 : k === 0 ? 2 : 3;
        return '<div class="qz-marche m' + place + '"><span class="qz-medaille">' + ['🥇', '🥈', '🥉'][place - 1] + '</span>' +
          '<span class="qz-pod-nom">' + GG.esc(r.n) + '</span><span class="qz-pod-pts">' + r.s + ' pts</span>' +
          '<span class="qz-pod-bloc">' + place + '</span></div>';
      }).join('') + '</div>';
      html += rows.slice(3).map(function (r, k) {
        return '<div class="final-line"><span>' + (k + 4) + '. ' + GG.esc(r.n) + '</span><strong>' + r.s + ' pts</strong></div>';
      }).join('');
      var top = rows.filter(function (r) { return r.s === rows[0].s; });
      html += '<p class="qz-sum-win">🏆 ' + top.map(function (r) { return GG.esc(r.n); }).join(' & ') +
        (top.length > 1 ? ' à égalité' : '') + '</p>';
      return html + '</div>';
    },

    /* Réseau : la réponse (et sa source), les questions à venir et les
       estimations des autres ne circulent pas avant la révélation. */
    redact: function (state, viewer) {
      var c = GG.clone(state);
      c.qs = c.qs.map(function (q, k) {
        if (k > c.idx) return { cache: true };
        var x = { q: q.q, unit: q.unit, cat: q.cat };
        if (k < c.idx || c.phase !== 'guess') { x.a = q.a; x.src = q.src; }
        return x;
      });
      var cache = c.phase === 'guess';
      c.players.forEach(function (p, i) {
        p.hasGuessed = p.guess !== null && p.guess !== undefined;
        if (cache && i !== viewer) p.guess = null;
      });
      if (c.ech) c.ech.maintenant = Date.now();
      return c;
    },

    apply: function (state, player, action) {
      action = action || {};
      var t = action.t;
      if (state.finished) return { ok: false, error: 'Partie terminée.' };
      norme(state);
      if (t === 'expire') {
        if (state.phase !== 'guess' || !state.ech || action.k !== cle(state)) return { ok: true };
        if (Date.now() < state.ech.fin - 300) return { ok: true };
        reveler(state, 'temps');
        return { ok: true };
      }
      if (t === 'go') {
        if (state.phase !== 'setup') return { ok: false, error: 'La partie a déjà commencé.' };
        if (player !== 0) return { ok: false, error: 'L’hôte prépare la partie.' };
        var o = lireOpts(action.opts, state.players.length);
        if (o.error) return { ok: false, error: o.error };
        state.opts = o;
        state.qs = tirer(o.nb);
        state.idx = 0;
        return lancer(state);
      }
      if (state.phase === 'setup') return { ok: false, error: 'L’hôte n’a pas encore lancé la partie.' };
      if (t === 'guess') {
        if (state.phase !== 'guess') return { ok: false, error: 'Trop tard : la réponse est révélée.' };
        var p = state.players[player];
        if (!p) return { ok: false, error: 'Joueur inconnu.' };
        if (p.guess !== null) return { ok: false, error: 'Estimation déjà donnée.' };
        var n = lireNombre(action.n);
        if (n === null) return { ok: false, error: 'Entrez un nombre entier.' };
        if (state.ech && Date.now() > state.ech.fin + 1500) return { ok: false, error: 'Temps écoulé !' };
        p.guess = n;
        state.dernier = player;
        if (state.players.every(function (x) { return x.guess !== null; })) reveler(state, 'tous');
        return { ok: true };
      }
      if (t === 'skip') {
        if (state.phase !== 'guess') return { ok: true };
        if (action.k !== undefined && action.k !== cle(state)) return { ok: true };
        if (player !== 0 && state.opts.mode !== 'secret') return { ok: false, error: 'Seul l’hôte peut révéler.' };
        reveler(state, 'hote');
        return { ok: true };
      }
      if (t === 'next') {
        if (state.phase !== 'reveal') return { ok: true };            // double appui : sans effet
        if (action.k !== undefined && action.k !== state.idx) return { ok: true };
        if (player !== 0 && state.opts.mode !== 'secret') return { ok: false, error: 'L’hôte passe à la suite.' };
        state.idx++;
        if (state.idx >= state.qs.length) {
          state.finished = true;
          state.phase = 'fin';
          state.ech = null;
          return { ok: true };
        }
        return lancer(state);
      }
      return { ok: false, error: 'Action inconnue.' };
    },

    /* L'ordinateur estime autour de la vraie réponse, plus ou moins bien
       selon son niveau, et arrondit comme un humain. */
    bot: function (state, me, ctx) {
      if (state.finished || state.phase !== 'guess') return null;
      var p = state.players[me];
      if (!p || p.guess !== null) return null;
      var q = state.qs[state.idx];
      if (!q || typeof q.a !== 'number') return null;
      var niveau = (ctx && ctx.niveau) || state.niveauIA || 'moyen';
      var S = NIV_IA[niveau] || NIV_IA.moyen;
      var n;
      if (estAnnee(q)) n = Math.round(q.a + gauss() * S * 60);
      else n = arrondiHumain(q.a * Math.exp(gauss() * S));
      return { t: 'guess', n: Math.max(0, n) };
    },

    render: function (el, ctx) { rendu(el, ctx); },

    _BANK: BANK, _parseQ: parseQ, _points: points, _tirer: tirer, _CATEGORIES: CATEGORIES, _lireNombre: lireNombre
  };

  /* ================================================================
   * 3. Le rendu
   * ================================================================ */
  var TEINTES = [200, 330, 45, 140, 265, 15, 175, 290, 95, 230, 60, 310];
  function estBot(p) { return /^🤖/.test(String((p && p.name) || '')); }
  function nom(s, i) { return GG.esc(String((s.players[i] || {}).name || '?').replace(/^🤖\s*/, '')); }
  function avatar(s, i) {
    var p = s.players[i] || { name: '?' };
    var init = String(p.name || '?').replace(/^🤖\s*/, '').charAt(0).toUpperCase() || '?';
    return '<span class="qz-av" style="--h:' + TEINTES[i % TEINTES.length] + '">' + (estBot(p) ? '🤖' : GG.esc(init)) + '</span>';
  }
  function humains(s) { return s.players.filter(function (p) { return !estBot(p); }).length; }
  function aEstime(p) { return !!(p && (p.hasGuessed || typeof p.guess === 'number')); }
  function son(n, o) { try { GG.sfx.play(n, o); } catch (e) {} }
  function vibre(t) { try { GG.haptic(t); } catch (e) {} }
  function chiffres(v) { return String(v || '').replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 13); }

  function rendu(el, ctx) {
    var s = ctx.state;
    if (s.finished) { el.innerHTML = ''; el._pr = null; return; }
    norme(s);
    var R = el._pr;
    if (!R || !R.root || !el.contains(R.root)) {
      el.innerHTML = '<div class="qz pr"></div>';
      R = el._pr = { root: el.firstChild, cle: '', fx: {}, draft: null, dec: {}, saisie: {} };
      brancher(R);
    }
    R.ctx = ctx;
    var cleVue = s.phase + ':' + s.gameTs + ':' + s.idx + ':' +
      (s.opts.mode === 'secret' && s.phase === 'guess' ? ctx.me : '') + ':' + (ctx.me === 0 ? 'h' : 'g');
    if (R.cle !== cleVue) {
      R.cle = cleVue;
      construire(R, s, ctx);
    }
    majDynamique(R, s, ctx);
    minuteur(R);
  }

  function construire(R, s, ctx) {
    var root = R.root;
    root.className = 'qz pr pr-' + s.phase;
    if (s.phase === 'setup') { root.innerHTML = htmlSetup(R, s, ctx); return; }
    var q = s.qs[s.idx] || {};
    if (s.phase === 'guess') {
      var k = s.gameTs + ':' + s.idx + ':' + ctx.me;
      root.innerHTML = htmlHaut(s, true) + '<div class="qz-carte"><p class="qz-q">' + GG.esc(q.q || '') + '</p></div>' +
        '<div class="pr-saisie">' +
        '<label class="pr-ecran"><input id="pr-guess" type="text" inputmode="none" autocomplete="off" enterkeyhint="done" ' +
        'aria-label="Votre estimation" placeholder="?" value="' + GG.esc(formate(R.saisie[k] || '')) + '">' +
        '<span class="pr-unite">' + GG.esc(estAnnee(q) ? '(année)' : uniteDe(q)) + '</span></label>' +
        '<div class="pr-pave">' + ['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', 'del'].map(function (t) {
          return '<button class="pr-touche' + (t === 'del' ? ' del' : t === '000' ? ' mille' : '') + '" data-key="' + t + '"' +
            (t === 'del' ? ' aria-label="Effacer"' : '') + '>' + (t === 'del' ? '⌫' : t) + '</button>';
        }).join('') + '</div>' +
        '<button class="btn big jeu pr-valider" data-a="guess">✔ Valider</button></div>' +
        '<div class="qz-etat pr-etat"></div><div class="qz-actions"></div>';
      son('whoosh', { volume: 0.5 });
      return;
    }
    if (s.phase === 'reveal') {
      root.innerHTML = htmlHaut(s, false) + '<div class="qz-carte"><p class="qz-q">' + GG.esc(q.q || '') + '</p></div>' +
        htmlReponse(s, q) + htmlRegle(s, q, ctx) + htmlLignes(s, q, ctx) +
        '<div class="qz-actions qz-suite">' + htmlSuite(s, ctx) + '</div>';
      effetsRevelation(R, s, ctx);
    }
  }

  function formate(v) {
    var c = chiffres(v);
    return c ? fmtN(parseInt(c, 10)) : '';
  }

  /* ---------- réglages ---------- */
  function unTelephone(s, ctx) { return ctx.mode === 'local' && humains(s) >= 2; }
  function draftInit(s, ctx) {
    var d = { nb: 8, chrono: 45, mode: unTelephone(s, ctx) ? 'secret' : 'chrono' };
    try {
      var m = JSON.parse(localStorage.getItem('gg-proche-opts') || 'null');
      if (m && MANCHES.indexOf(m.nb) !== -1) d.nb = m.nb;
      if (m && CHRONOS.indexOf(m.chrono) !== -1) d.chrono = m.chrono;
    } catch (e) {}
    return d;
  }
  function seg(k, liste, val) {
    return '<div class="qz-seg">' + liste.map(function (x) {
      return '<button class="qz-segb' + (x.v === val ? ' on' : '') + '" data-k="' + k + '" data-v="' + x.v + '">' + x.t + '</button>';
    }).join('') + '</div>';
  }
  function htmlSetup(R, s, ctx) {
    if (ctx.me !== 0) {
      return '<div class="qz-attente"><div class="qz-logo">🎯</div><h2 class="qz-titre">Le Plus Proche</h2>' +
        '<p class="waiting">L’hôte prépare la partie…</p><div class="qz-joueurs">' + s.players.map(function (p, i) {
          return '<span class="qz-chip">' + avatar(s, i) + nom(s, i) + '</span>';
        }).join('') + '</div></div>';
    }
    var d = R.draft || (R.draft = draftInit(s, ctx));
    var html = '<div class="qz-hero"><div class="qz-logo">🎯</div><div><h2 class="qz-titre">Le Plus Proche</h2>' +
      '<p class="qz-sous">' + BANK.length + ' questions sourcées · personne ne connaît la réponse</p></div></div>';
    html += '<div class="pr-bareme"><p><b>100</b> points pour une réponse exacte, <b>0</b> à deux fois la réponse</p>' +
      '<p><b>+30</b> au plus proche · <b>+50</b> si c’est pile</p></div>';
    html += '<div class="qz-deux"><div><p class="qz-lbl">Manches</p>' + seg('nb', MANCHES.map(function (x) {
      return { v: String(x), t: String(x) };
    }), String(d.nb)) + '</div><div><p class="qz-lbl">Chrono</p>' + (d.mode === 'secret'
      ? '<div class="qz-seg"><span class="qz-segb off">Sans chrono</span></div>'
      : seg('chrono', CHRONOS.map(function (x) { return { v: String(x), t: x + ' s' }; }), String(d.chrono))) + '</div></div>';
    if (d.mode === 'secret') {
      html += '<p class="hint pr-note">📱 Sur un seul téléphone : chacun tape son estimation en secret, l’écran se masque entre deux joueurs.</p>';
    }
    html += '<div class="qz-go-zone"><button class="btn big jeu qz-go" data-a="go">🚀 C’est parti !</button></div>';
    return html;
  }

  /* ---------- manche ---------- */
  function htmlHaut(s, avecChrono) {
    var q = s.qs[s.idx] || {};
    var c = CATEGORIES[q.cat] || { nom: 'Estimation', icone: '🎯' };
    var h = '<div class="qz-top"><span class="qz-num">Manche <b>' + (s.idx + 1) + '</b>/' + s.qs.length + '</span>' +
      '<span class="qz-tag"><span class="qz-tag-nom">' + c.icone + ' ' + c.nom + '</span></span>';
    if (avecChrono && s.ech) {
      h += '<div class="qz-timer" data-k="' + GG.esc(s.ech.k) + '"><svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="19" class="qz-timer-f"/>' +
        '<circle cx="22" cy="22" r="19" class="qz-timer-p"/></svg><b></b></div>';
    }
    h += '</div><div class="qz-prog"><i style="width:' + Math.round(100 * (s.idx + (s.phase === 'reveal' ? 1 : 0)) / Math.max(1, s.qs.length)) + '%"></i></div>';
    return h;
  }

  /* ---------- révélation ---------- */
  function htmlReponse(s, q) {
    var r = s.reveal || {};
    return '<div class="pr-reponse"><span class="pr-rep-lbl">Réponse</span><strong class="pr-val" data-a="' + (r.answer | 0) + '">' +
      (estAnnee(q) ? String(r.answer) : fmtN(r.answer)) + '</strong> <em>' + GG.esc(estAnnee(q) ? '' : r.unit || '') + '</em></div>' +
      (r.src ? '<p class="pr-source">📚 Source : ' + GG.esc(r.src) + '</p>' : '');
  }
  /* la règle graduée : de 0 à deux fois la réponse (réponse au milieu) ;
     pour une date, de 50 ans avant à 50 ans après */
  function position(v, q, r) {
    if (typeof v !== 'number') return null;
    var min = estAnnee(q) ? r.answer - 50 : 0, max = estAnnee(q) ? r.answer + 50 : Math.max(2, 2 * r.answer);
    var x = (v - min) / (max - min);
    return { x: Math.max(0, Math.min(1, x)), hors: x > 1 ? 1 : x < 0 ? -1 : 0 };
  }
  function htmlRegle(s, q, ctx) {
    var r = s.reveal || {};
    var min = estAnnee(q) ? r.answer - 50 : 0, max = estAnnee(q) ? r.answer + 50 : 2 * r.answer;
    var fmt = function (v) { return estAnnee(q) ? String(v) : fmtN(v); };
    var pins = [];
    (r.guesses || []).forEach(function (g, i) {
      var pos = position(g, q, r);
      if (pos) pins.push({ i: i, x: pos.x, hors: pos.hors, g: g });
    });
    pins.sort(function (a, b) { return a.x - b.x; });
    // étage pour que les épingles proches ne se chevauchent pas
    var derniers = [-1, -1, -1];
    pins.forEach(function (p) {
      var e = 0;
      while (e < 2 && derniers[e] >= 0 && p.x - derniers[e] < 0.16) e++;
      derniers[e] = p.x;
      p.e = e;
    });
    return '<div class="pr-regle" aria-hidden="true"><div class="pr-zone"></div><div class="pr-axe"></div>' +
      [0, 0.25, 0.5, 0.75, 1].map(function (t) {
        return '<span class="pr-grad' + (t === 0.5 ? ' mid' : t === 0 ? ' debut' : t === 1 ? ' fin' : '') + '" style="left:' + (t * 100) + '%"><i></i>' +
          (t === 0.5 ? '' : '<em>' + fmt(Math.round(min + t * (max - min))) + '</em>') + '</span>';
      }).join('') +
      pins.map(function (p, k) {
        var win = (r.winners || []).indexOf(p.i) !== -1;
        return '<span class="pr-pin e' + p.e + (win ? ' win' : '') + (p.i === ctx.me ? ' moi' : '') + (p.hors ? ' hors' : '') +
          '" style="left:' + (p.x * 100).toFixed(2) + '%;--n:' + k + '">' + avatar(s, p.i) +
          (p.hors ? '<b>' + (p.hors > 0 ? '›' : '‹') + '</b>' : '') + '</span>';
      }).join('') +
      '<span class="pr-drapeau" style="left:50%"><span class="pr-mat"></span><span class="pr-toile">🎯</span></span></div>';
  }
  function htmlLignes(s, q, ctx) {
    var r = s.reveal || {};
    var rows = s.players.map(function (p, i) {
      return { i: i, g: (r.guesses || [])[i], d: (r.dist || [])[i], gain: (r.gains || [])[i] || 0 };
    }).sort(function (a, b) {
      if (a.d === null && b.d === null) return a.i - b.i;
      if (a.d === null) return 1;
      if (b.d === null) return -1;
      return a.d - b.d || a.i - b.i;
    });
    var u = estAnnee(q) ? '' : ' ' + GG.esc(r.unit || '');
    return '<div class="pr-rows">' + rows.map(function (row, k) {
      var win = (r.winners || []).indexOf(row.i) !== -1;
      var exact = row.d === 0;
      return '<div class="pr-row' + (win ? ' win' : '') + (row.i === ctx.me && s.opts.mode !== 'secret' ? ' moi' : '') + '" style="--n:' + k + '">' +
        '<span class="pr-qui">' + (win ? '<span class="pr-medaille">' + (exact ? '💯' : '🥇') + '</span>' : avatar(s, row.i)) +
        '<span class="pr-nom">' + nom(s, row.i) + '</span></span>' +
        '<span class="pr-est">' + (typeof row.g === 'number'
          ? '<b>' + (estAnnee(q) ? String(row.g) : fmtN(row.g)) + '</b>' + '<small>' + (exact ? 'pile !' : 'à ' + (estAnnee(q) ? row.d + ' an' + (row.d > 1 ? 's' : '') : fmtN(row.d) + u)) + '</small>'
          : '<small>' + (r.pourquoi === 'temps' ? '⏱ trop tard' : 'pas de réponse') + '</small>') + '</span>' +
        '<span class="pr-gain' + (row.gain ? '' : ' zero') + '">+' + row.gain + '</span></div>';
    }).join('') + '</div>';
  }
  function htmlSuite(s, ctx) {
    var fin = s.idx + 1 >= s.qs.length;
    if (ctx.me !== 0 && s.opts.mode !== 'secret') return '<p class="waiting">L’hôte lance la manche suivante…</p>';
    return '<button class="btn big jeu qz-next" data-a="next" disabled>' + (fin ? '🏁 Voir le podium' : '➜ Manche suivante') + '</button>';
  }

  /* ---------- mises à jour sans reconstruire (la saisie reste intacte) ---------- */
  function majDynamique(R, s, ctx) {
    var root = R.root;
    if (s.phase !== 'guess') return;
    var etat = root.querySelector('.pr-etat');
    var actions = root.querySelector('.qz-actions');
    var n = s.players.length;
    var faits = s.players.filter(aEstime).length;
    var moi = s.players[ctx.me];
    var fait = moi && typeof moi.guess === 'number';
    var saisie = root.querySelector('.pr-saisie');
    if (saisie) saisie.classList.toggle('fait', !!fait);
    if (etat) {
      var q = s.qs[s.idx] || {};
      var h = fait
        ? '<p class="pr-verrou">🤫 Votre estimation : <strong>' + (estAnnee(q) ? String(moi.guess) : fmtN(moi.guess)) + '</strong> ' +
          GG.esc(uniteDe(q)) + '</p>'
        : (s.opts.mode === 'secret' ? '<p class="qz-verrou a-toi">🙈 À vous, <strong>' + nom(s, ctx.me) + '</strong> : estimation secrète</p>' : '');
      h += '<div class="qz-attendus"><span class="qz-compte">' + faits + '/' + n + ' ont répondu</span>' + s.players.map(function (p, i) {
        return '<span class="qz-mini-av' + (aEstime(p) ? ' ok' : '') + '" title="' + nom(s, i) + '">' + avatar(s, i) + '</span>';
      }).join('') + '</div>';
      if (etat.innerHTML !== h) etat.innerHTML = h;
    }
    if (actions) {
      var skip = s.opts.mode === 'chrono' && ctx.me === 0 && faits > 0 && faits < n;
      var a0 = actions.querySelector('[data-a="skip"]');
      if (skip && !a0) actions.innerHTML = '<button class="btn small qz-skip" data-a="skip">⏭ Ne plus attendre</button>';
      else if (!skip && a0) actions.innerHTML = '';
    }
  }

  function effetsRevelation(R, s, ctx) {
    var k = s.gameTs + ':' + s.idx;
    var root = R.root;
    var r = s.reveal || {};
    setTimeout(function () {
      var b = root.querySelector('[data-a="next"]');
      if (b) b.disabled = false;
    }, 1100);
    if (R.fx.rev === k) { root.classList.add('sans-anim'); return; }
    R.fx.rev = k;
    son('reveal');
    var v = root.querySelector('.pr-val');
    var q = s.qs[s.idx] || {};
    if (v && !estAnnee(q) && r.answer > 0) {
      v.textContent = '0';
      try { GG.fx.countUp(v, 0, r.answer, 1000); } catch (e) { v.textContent = fmtN(r.answer); }
      setTimeout(function () { v.textContent = fmtN(r.answer); }, 1150);
    }
    var gagne = (r.winners || []).indexOf(ctx.me) !== -1;
    var perso = s.opts.mode !== 'secret';
    setTimeout(function () {
      son('drop');
      var pin = root.querySelector('.pr-pin.win');
      if (r.exact) {
        son('fanfare');
        try { GG.fx.burst(root.querySelector('.pr-drapeau'), { count: 30, shape: 'star' }); } catch (e) {}
      } else if (perso && gagne) {
        son('correct');
        vibre('success');
        try { if (pin) GG.fx.burst(root.querySelector('.pr-pin.moi') || pin, { count: 18, shape: 'star' }); } catch (e) {}
      } else if (pin) {
        try { GG.fx.burst(pin, { count: 12, shape: 'circle' }); } catch (e) {}
      }
      var ligne = perso ? root.querySelector('.pr-row.moi') : null;
      var g = (r.gains || [])[ctx.me] || 0;
      if (ligne && g) { try { GG.fx.floatText(ligne, '+' + g, { color: '#7cf0a8', size: 26 }); } catch (e) {} }
    }, 1050);
  }

  /* ---------- évènements ---------- */
  function brancher(R) {
    var root = R.root;
    R.clic = 0;
    R.derniere = '';
    function champ() { return root.querySelector('#pr-guess'); }
    function cleSaisie() { var s = R.ctx.state; return s.gameTs + ':' + s.idx + ':' + R.ctx.me; }
    function ecrire(v) {
      var c = champ();
      if (!c) return;
      c.value = formate(v);
      R.saisie[cleSaisie()] = chiffres(v);
    }
    function valider() {
      var ctx = R.ctx, s = ctx.state, c = champ();
      if (!c || s.phase !== 'guess') return;
      var brut = chiffres(c.value);
      if (!brut) {
        try { GG.fx.shake(c.parentNode); } catch (e) {}
        son('wrong', { volume: 0.4 });
        return;
      }
      var k = 'guess:' + s.idx + ':' + ctx.me;
      if (R.derniere === k && Date.now() - R.clic < 1500) return;   // anti double appui
      R.derniere = k;
      R.clic = Date.now();
      son('pop');
      vibre('medium');
      if (ctx.act({ t: 'guess', n: brut }) === false) R.derniere = '';
    }
    root.addEventListener('click', function (ev) {
      var cible = ev.target.closest ? ev.target.closest('button') : null;
      if (!cible || !root.contains(cible) || cible.disabled) return;
      var ctx = R.ctx, s = ctx && ctx.state;
      if (!s) return;
      var now = Date.now();
      var key = cible.getAttribute('data-key');
      if (key && s.phase === 'guess') {
        var c = champ();
        var v = chiffres(c ? c.value : '');
        if (key === 'del') v = v.slice(0, -1);
        else if (key === '000') { if (v) v = (v + '000').slice(0, 13); }
        else v = (v === '0' ? '' : v) + key;
        ecrire(v.slice(0, 13));
        son('type', { volume: 0.45 });
        vibre('light');
        return;
      }
      var k = cible.getAttribute('data-k');
      if (k && s.phase === 'setup') {
        R.draft[k] = parseInt(cible.getAttribute('data-v'), 10);
        cible.parentNode.querySelectorAll('[data-k="' + k + '"]').forEach(function (b) { b.classList.toggle('on', b === cible); });
        son('toggle');
        return;
      }
      var a = cible.getAttribute('data-a');
      function garde(c2) {
        if (R.derniere === c2 && now - R.clic < 400) return false;
        R.derniere = c2;
        R.clic = now;
        return true;
      }
      if (a === 'go') {
        if (!garde('go')) return;
        try { localStorage.setItem('gg-proche-opts', JSON.stringify(R.draft)); } catch (e) {}
        ctx.act({ t: 'go', opts: R.draft });
      } else if (a === 'guess') {
        valider();
      } else if (a === 'skip') {
        var kq = s.ech ? s.ech.k : ('g' + s.gameTs + ':' + s.idx);
        if (garde('skip:' + kq)) ctx.act({ t: 'skip', k: kq });
      } else if (a === 'next') {
        if (!garde('next:' + s.idx)) return;
        cible.disabled = true;
        ctx.act({ t: 'next', k: s.idx });
      }
    });
    // clavier physique : on garde la saisie propre et « Entrée » valide
    root.addEventListener('input', function (ev) {
      if (ev.target && ev.target.id === 'pr-guess') {
        var brut = chiffres(ev.target.value);
        R.saisie[cleSaisie()] = brut;
        var f = formate(brut);
        if (ev.target.value !== f) ev.target.value = f;
      }
    });
    root.addEventListener('keydown', function (ev) {
      if (ev.target && ev.target.id === 'pr-guess' && ev.key === 'Enter') { ev.preventDefault(); valider(); }
    });
  }

  /* ---------- le chrono ---------- */
  function minuteur(R) {
    function maj() {
      var root = R.root;
      if (!root.isConnected) { clearInterval(R.tick); R.tick = null; return; }
      var ctx = R.ctx, s = ctx && ctx.state;
      var t = root.querySelector('.qz-timer');
      if (!t || !s || !s.ech) return;
      var k = s.ech.k;
      if (R.dec[k] === undefined) R.dec[k] = s.ech.maintenant ? Date.now() - s.ech.maintenant : 0;
      if (Math.abs(R.dec[k]) < 400) R.dec[k] = 0;
      var duree = s.ech.duree || 1;
      var reste = Math.max(0, Math.min(duree, s.ech.fin + R.dec[k] - Date.now()));
      var sec = Math.ceil(reste / 1000);
      var b = t.querySelector('b');
      if (b && b.textContent !== String(sec)) {
        b.textContent = sec;
        var moi = s.players[ctx.me];
        if (sec <= 5 && sec > 0 && moi && typeof moi.guess !== 'number') son('tick', { volume: 0.35 });
      }
      var c = t.querySelector('.qz-timer-p');
      if (c) c.style.strokeDashoffset = String(119.4 * (1 - reste / duree));
      t.classList.toggle('urgent', sec <= 5);
      if (reste <= 0 && ctx.mode !== 'guest' && R.expire !== k && Date.now() >= s.ech.fin) {
        R.expire = k;
        ctx.act({ t: 'expire', k: k });
      }
    }
    maj();
    if (!R.tick) R.tick = setInterval(maj, 200);
  }

  GG.register(mod);
  if (typeof module === 'object' && module.exports) module.exports = mod;
})(typeof self !== 'undefined' ? self : globalThis);
