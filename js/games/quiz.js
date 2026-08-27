/*
 * GGgames — Quiz (1 à 12 joueurs, culture générale).
 * 10 questions tirées d'une banque maison. Tout le monde répond en secret
 * sur son téléphone ; les points tombent à la révélation (+10 par bonne
 * réponse, +5 au plus rapide). Les bonnes réponses ne circulent jamais
 * avant la révélation.
 */
(function (root) {
  'use strict';
  var GG = root.GG;
  var NB_QUESTIONS = 10;
  var THEMES = [
    { id: 'melange', nom: 'Tout mélangé', icone: '🌍' },
    { id: 'general', nom: 'Culture générale', icone: '🎓' },
    { id: 'cinema', nom: 'Cinéma', icone: '🎬' },
    { id: 'series', nom: 'Séries TV', icone: '📺' },
    { id: 'musique', nom: 'Musique', icone: '🎵' },
    { id: 'sport', nom: 'Sport', icone: '⚽' },
    { id: 'histoiregeo', nom: 'Histoire-Géo', icone: '🏛️' },
    { id: 'sciences', nom: 'Sciences', icone: '🔬' },
    { id: 'france', nom: 'France', icone: '🥖' }
  ];

  /* Banque : 'Question|Bonne réponse|Leurre|Leurre|Leurre' (remplie plus bas). */
  var BANK = [
    "Quelle est la capitale de l'Italie ?|Rome|Milan|Naples|Turin",
    "En quelle année a eu lieu la prise de la Bastille ?|1789|1792|1776|1815",
    "Quelle est la capitale de l'Espagne ?|Madrid|Barcelone|Séville|Valence",
    "Quel roi de France était surnommé le Roi-Soleil ?|Louis XIV|Louis XVI|Henri IV|François Ier",
    "Quel fleuve traverse Paris ?|La Seine|La Loire|Le Rhône|La Garonne",
    "En quelle année Christophe Colomb a-t-il atteint l'Amérique ?|1492|1453|1515|1519",
    "Quelle est la capitale de l'Allemagne ?|Berlin|Munich|Hambourg|Francfort",
    "Qui a peint La Joconde ?|Léonard de Vinci|Michel-Ange|Raphaël|Botticelli",
    "Quel pays a un drapeau rouge et blanc orné d'une feuille d'érable ?|Le Canada|Les États-Unis|Le Danemark|La Suisse",
    "En quelle année a débuté la Première Guerre mondiale ?|1914|1912|1916|1918",
    "Quelle est la capitale du Japon ?|Tokyo|Osaka|Kyoto|Nagoya",
    "En quelle année s'est achevée la Seconde Guerre mondiale ?|1945|1944|1946|1942",
    "Quel est le plus grand pays du monde par sa superficie ?|La Russie|Le Canada|La Chine|Les États-Unis",
    "Qui a lancé l'appel du 18 juin 1940 depuis Londres ?|Charles de Gaulle|Philippe Pétain|Jean Moulin|Winston Churchill",
    "Quelle est la capitale de la Grèce ?|Athènes|Thessalonique|Patras|Héraklion",
    "Quel roi de France a été guillotiné en 1793 ?|Louis XVI|Louis XV|Charles X|Louis XVIII",
    "Quel est le plus haut sommet du monde ?|L'Everest|Le K2|Le Mont Blanc|Le Kilimandjaro",
    "Quel chef gaulois a affronté Jules César à Alésia ?|Vercingétorix|Brennus|Ambiorix|Clovis",
    "Quelle est la capitale de la Belgique ?|Bruxelles|Anvers|Gand|Liège",
    "Quel roi des Francs a été couronné empereur en l'an 800 ?|Charlemagne|Clovis|Pépin le Bref|Hugues Capet",
    "Quel fleuve traverse Londres ?|La Tamise|La Severn|La Mersey|La Clyde",
    "Quelle héroïne française a délivré Orléans en 1429 ?|Jeanne d'Arc|Anne de Bretagne|Aliénor d'Aquitaine|Blanche de Castille",
    "Quelle est la capitale de la Russie ?|Moscou|Saint-Pétersbourg|Kazan|Novossibirsk",
    "Quelle bataille de 1815 a marqué la défaite finale de Napoléon ?|Waterloo|Austerlitz|Trafalgar|Iéna",
    "Quel pays a un drapeau blanc avec un disque rouge au centre ?|Le Japon|La Corée du Sud|La Chine|L'Indonésie",
    "En quelle année le mur de Berlin est-il tombé ?|1989|1991|1985|1993",
    "Quelle est la capitale de la Chine ?|Pékin|Shanghai|Canton|Hong Kong",
    "Qui a été le premier homme à marcher sur la Lune ?|Neil Armstrong|Buzz Aldrin|Youri Gagarine|John Glenn",
    "Quel est le plus grand désert chaud du monde ?|Le Sahara|Le Gobi|Le Kalahari|L'Atacama",
    "Quelle physicienne a découvert le radium ?|Marie Curie|Irène Joliot-Curie|Rosalind Franklin|Lise Meitner",
    "Quelle est la capitale des États-Unis ?|Washington|New York|Chicago|Boston",
    "Qui a fait breveter le téléphone en 1876 ?|Graham Bell|Thomas Edison|Samuel Morse|Nikola Tesla",
    "Quel fleuve traverse l'Égypte du sud au nord ?|Le Nil|Le Niger|Le Congo|Le Zambèze",
    "Qui a inventé l'imprimerie à caractères mobiles en Europe ?|Gutenberg|Léonard de Vinci|Galilée|Newton",
    "Quelle est la capitale de l'Égypte ?|Le Caire|Alexandrie|Louxor|Assouan",
    "Quels frères ont inventé le cinématographe ?|Les frères Lumière|Les frères Wright|Les frères Montgolfier|Les frères Grimm",
    "Quel fleuve sépare la France de l'Allemagne en Alsace ?|Le Rhin|La Moselle|La Meuse|Le Danube",
    "Qui a mis au point le vaccin contre la rage ?|Louis Pasteur|Alexander Fleming|Robert Koch|Edward Jenner",
    "Quelle est la capitale de l'Inde ?|New Delhi|Bombay|Calcutta|Madras",
    "Qui a découvert la pénicilline ?|Alexander Fleming|Louis Pasteur|Marie Curie|Robert Koch",
    "Sur quel continent coule l'Amazone ?|L'Amérique du Sud|L'Afrique|L'Asie|L'Océanie",
    "Qui a formulé la théorie de la relativité ?|Albert Einstein|Isaac Newton|Galilée|Max Planck",
    "Quel pays a un drapeau à 50 étoiles et 13 bandes ?|Les États-Unis|L'Australie|Le Royaume-Uni|La Nouvelle-Zélande",
    "Quelle reine d'Égypte a séduit Jules César et Marc Antoine ?|Cléopâtre|Néfertiti|Hatchepsout|Théodora",
    "Quelle est la capitale de la Pologne ?|Varsovie|Cracovie|Gdansk|Poznan",
    "Qui a été le premier président des États-Unis ?|George Washington|Abraham Lincoln|Thomas Jefferson|John Adams",
    "Quel est le plus petit État du monde ?|Le Vatican|Monaco|Saint-Marin|Le Liechtenstein",
    "Quelle chaîne de montagnes sépare la France de l'Espagne ?|Les Pyrénées|Les Alpes|Les Vosges|Le Jura",
    "Quel dirigeant sud-africain a passé 27 ans en prison sous l'apartheid ?|Nelson Mandela|Desmond Tutu|Steve Biko|Kofi Annan",
    "Quel pays a un drapeau à bandes horizontales noire, rouge et or ?|L'Allemagne|La Belgique|L'Espagne|L'Autriche",
    "Qui a mené l'Inde vers l'indépendance par la non-violence ?|Gandhi|Nehru|Indira Gandhi|Ali Jinnah",
    "Quel est le plus grand océan du monde ?|L'océan Pacifique|L'océan Atlantique|L'océan Indien|L'océan Arctique",
    "En quelle année a eu lieu le débarquement de Normandie ?|1944|1943|1945|1942",
    "Dans quel pays se trouve le Taj Mahal ?|L'Inde|L'Iran|La Turquie|L'Égypte",
    "Quelle épidémie a ravagé l'Europe au milieu du XIVe siècle ?|La peste noire|Le choléra|La grippe espagnole|La variole",
    "Dans quel océan se trouve l'île de Madagascar ?|L'océan Indien|L'océan Atlantique|L'océan Pacifique|La mer Rouge",
    "Quel pays européen a un drapeau vert, blanc et rouge à bandes verticales ?|L'Italie|La Hongrie|L'Irlande|La Bulgarie",
    "Quel pays a un drapeau vert orné d'un grand losange jaune ?|Le Brésil|L'Argentine|La Colombie|Le Venezuela",
    "Quel est le plus long fleuve de France ?|La Loire|La Seine|Le Rhône|La Garonne",
    "Quelle est la capitale du Canada ?|Ottawa|Toronto|Montréal|Vancouver",
    "Qui a été président de la République française de 1981 à 1995 ?|François Mitterrand|Jacques Chirac|Georges Pompidou|Valéry Giscard d'Estaing",
    "Quelle est la capitale de l'Australie ?|Canberra|Sydney|Melbourne|Perth",
    "Quel général carthaginois a traversé les Alpes avec des éléphants ?|Hannibal|Scipion|Attila|Spartacus",
    "Quelle est la capitale du Brésil ?|Brasilia|Rio de Janeiro|São Paulo|Salvador",
    "Quel roi des Francs a été baptisé à Reims vers l'an 496 ?|Clovis|Charlemagne|Dagobert|Pépin le Bref",
    "Quelle est la capitale de la Turquie ?|Ankara|Istanbul|Izmir|Antalya",
    "En quelle année Guillaume le Conquérant a-t-il envahi l'Angleterre ?|1066|1099|1046|1123",
    "Quelle est la capitale de la Suisse ?|Berne|Zurich|Genève|Lausanne",
    "Quelle bataille de 1805 est surnommée la bataille des Trois Empereurs ?|Austerlitz|Iéna|Wagram|Marengo",
    "Quel fleuve traverse Bordeaux ?|La Garonne|La Dordogne|La Loire|Le Lot",
    "Qui a été le premier homme envoyé dans l'espace ?|Youri Gagarine|Neil Armstrong|Alan Shepard|Buzz Aldrin",
    "Quel fleuve traverse Vienne et Budapest ?|Le Danube|Le Rhin|L'Elbe|La Vistule",
    "Quel traité signé en 1919 a mis fin à la Première Guerre mondiale ?|Le traité de Versailles|Le traité de Vienne|Le traité de Rome|Le traité d'Utrecht",
    "Quel est le plus long fleuve d'Europe ?|La Volga|Le Danube|Le Rhin|Le Dniepr",
    "En quelle année les Françaises ont-elles obtenu le droit de vote ?|1944|1918|1936|1958",
    "Quel fleuve traverse Rome ?|Le Tibre|L'Arno|Le Pô|L'Adige",
    "Quel roi de France a signé l'édit de Nantes en 1598 ?|Henri IV|Louis XIII|François Ier|Charles IX",
    "Quel pays a un drapeau bleu orné d'une croix jaune ?|La Suède|La Finlande|La Norvège|L'Islande",
    "Quel événement survenu à Sarajevo a déclenché la Première Guerre mondiale ?|L'assassinat de l'archiduc|Le naufrage d'un paquebot|Une révolution en Russie|L'invasion de la Pologne",
    "Quel pays a un drapeau carré rouge orné d'une croix blanche ?|La Suisse|Le Danemark|La Norvège|Malte",
    "Sur quelle ville la première bombe atomique a-t-elle été larguée en 1945 ?|Hiroshima|Nagasaki|Tokyo|Kyoto",
    "Quel canal relie la mer Méditerranée à la mer Rouge ?|Le canal de Suez|Le canal de Panama|Le canal de Kiel|Le canal de Corinthe",
    "Quel savant italien fut jugé pour avoir dit que la Terre tourne autour du Soleil ?|Galilée|Copernic|Kepler|Archimède",
    "Quel détroit sépare l'Espagne du Maroc ?|Le détroit de Gibraltar|Le Bosphore|Le détroit de Béring|Le pas de Calais",
    "Qui a inventé la dynamite et fondé un célèbre prix ?|Alfred Nobel|Thomas Edison|Louis Pasteur|Alessandro Volta",
    "Quelle est la plus grande île du monde ?|Le Groenland|Madagascar|Bornéo|Sumatra",
    "En quelle année la tour Eiffel a-t-elle été inaugurée ?|1889|1900|1875|1914",
    "Quel est le plus haut sommet d'Afrique ?|Le Kilimandjaro|Le mont Kenya|Le Toubkal|Le mont Cameroun",
    "Quel pharaon est célèbre pour son tombeau découvert intact en 1922 ?|Toutânkhamon|Ramsès II|Khéops|Akhenaton",
    "Quelle est la capitale officielle de la Côte d'Ivoire ?|Yamoussoukro|Abidjan|Bouaké|Daloa",
    "Quel empereur romain a autorisé le christianisme par l'édit de Milan ?|Constantin|Néron|Dioclétien|Trajan",
    "Quel pays a un drapeau rouge orné d'une étoile verte à cinq branches ?|Le Maroc|L'Algérie|La Tunisie|Le Sénégal",
    "En quelle année l'Empire romain d'Occident s'est-il effondré ?|476|395|410|565",
    "Quel est le plus grand lac d'Afrique ?|Le lac Victoria|Le lac Tanganyika|Le lac Malawi|Le lac Tchad",
    "En quelle année Constantinople est-elle tombée aux mains des Ottomans ?|1453|1492|1389|1520",
    "Quel ministre a dirigé les finances de Louis XIV ?|Colbert|Sully|Necker|Turgot",
    "Quelle bataille de 1415 fut une lourde défaite française face aux Anglais ?|Azincourt|Crécy|Bouvines|Castillon",
    "Quel peuple de Mésopotamie a inventé l'écriture cunéiforme ?|Les Sumériens|Les Égyptiens|Les Phéniciens|Les Perses",
    "Qui fut le premier aviateur à traverser la Manche en 1909 ?|Louis Blériot|Charles Lindbergh|Roland Garros|Jean Mermoz",
    "Quelle est la planète la plus proche du Soleil ?|Mercure|Vénus|Mars|Jupiter",
    "Quelle planète est surnommée la planète rouge ?|Mars|Vénus|Jupiter|Saturne",
    "Quelle est la plus grande planète du Système solaire ?|Jupiter|Saturne|Neptune|Uranus",
    "Combien de planètes compte le Système solaire ?|Huit|Neuf|Sept|Dix",
    "Quel est le satellite naturel de la Terre ?|La Lune|Titan|Phobos|Europe",
    "Quelle planète est célèbre pour ses grands anneaux ?|Saturne|Mars|Vénus|Mercure",
    "En combien de temps la Terre tourne-t-elle sur elle-même ?|Environ 24 heures|Environ 12 heures|Environ 48 heures|Environ 365 jours",
    "Quelle est la planète la plus chaude du Système solaire ?|Vénus|Mercure|Mars|Jupiter",
    "Qui fut le premier homme à marcher sur la Lune ?|Neil Armstrong|Buzz Aldrin|Youri Gagarine|Michael Collins",
    "Qui fut le premier être humain envoyé dans l'espace ?|Youri Gagarine|Neil Armstrong|Alan Shepard|John Glenn",
    "Dans quelle galaxie se trouve notre Système solaire ?|La Voie lactée|Andromède|Le Sombrero|Le Triangle",
    "Que mesure une année-lumière ?|Une distance|Une durée|Une vitesse|Une luminosité",
    "Comment appelle-t-on le phénomène où la Lune cache le Soleil ?|Une éclipse solaire|Une éclipse lunaire|Un solstice|Un équinoxe",
    "Quelle comète célèbre repasse près de la Terre environ tous les 76 ans ?|La comète de Halley|Hale-Bopp|Swift-Tuttle|Encke",
    "Quelle planète tourne sur un axe presque couché sur son orbite ?|Uranus|Neptune|Saturne|Mars",
    "De quoi le Soleil est-il principalement composé ?|D'hydrogène et d'hélium|De fer en fusion|D'oxygène et d'azote|De roches brûlantes",
    "À quelle température l'eau bout-elle au niveau de la mer ?|100 °C|90 °C|110 °C|120 °C",
    "Quel est le symbole chimique de l'or ?|Au|Or|Ag|Al",
    "Quel gaz est le plus abondant dans l'air que nous respirons ?|L'azote|L'oxygène|Le dioxyde de carbone|L'hydrogène",
    "Quelle est la formule chimique de l'eau ?|H2O|CO2|O2|H2O2",
    "Quel métal est liquide à température ambiante ?|Le mercure|Le plomb|L'étain|Le zinc",
    "Quelle est environ la vitesse de la lumière dans le vide ?|300 000 km/s|150 000 km/s|3 000 km/s|30 000 km/s",
    "Quel savant a formulé la loi de la gravitation universelle ?|Isaac Newton|Albert Einstein|Galilée|Johannes Kepler",
    "Quel physicien a développé la théorie de la relativité ?|Albert Einstein|Isaac Newton|Nikola Tesla|Max Planck",
    "Quelle scientifique a découvert le radium avec son mari Pierre ?|Marie Curie|Rosalind Franklin|Ada Lovelace|Irène Joliot-Curie",
    "Quel est l'élément chimique le plus léger ?|L'hydrogène|L'hélium|Le carbone|L'oxygène",
    "Quel gaz plus léger que l'air gonfle les ballons qui s'envolent ?|L'hélium|L'oxygène|L'azote|Le dioxyde de carbone",
    "Comment appelle-t-on le passage de l'état solide à l'état liquide ?|La fusion|La solidification|La condensation|La sublimation",
    "Quel instrument mesure la pression atmosphérique ?|Le baromètre|Le thermomètre|Le pluviomètre|L'anémomètre",
    "Quelle unité mesure l'intensité du courant électrique ?|L'ampère|Le volt|Le watt|L'ohm",
    "Quel savant grec aurait crié « Eurêka » dans son bain ?|Archimède|Pythagore|Aristote|Socrate",
    "Quel est le principal composant du gaz naturel ?|Le méthane|Le propane|Le butane|L'hydrogène",
    "Quel élément chimique a pour symbole Na ?|Le sodium|L'azote|Le nickel|Le néon",
    "Combien de couleurs compte traditionnellement l'arc-en-ciel ?|Sept|Cinq|Six|Huit",
    "Quel sel donne principalement son goût à l'eau de mer ?|Le chlorure de sodium|Le carbonate de calcium|Le sulfate de cuivre|Le nitrate de potassium",
    "Quelle est environ la température du zéro absolu ?|-273 °C|-100 °C|-373 °C|-500 °C",
    "Quel gaz forme les bulles des boissons pétillantes ?|Le dioxyde de carbone|L'oxygène|L'hélium|L'azote",
    "Lequel de ces métaux est attiré par un aimant ?|Le fer|Le cuivre|L'aluminium|L'or",
    "Quel organe pompe le sang dans tout le corps ?|Le cœur|Le foie|Les poumons|La rate",
    "Combien d'os compte environ le squelette d'un adulte ?|206|156|306|106",
    "Quel est le plus grand organe du corps humain ?|La peau|Le foie|Les poumons|L'intestin grêle",
    "Quels organes filtrent le sang et produisent l'urine ?|Les reins|Le foie|La vessie|Les poumons",
    "Combien de dents compte une dentition adulte complète ?|32|28|30|34",
    "Quel est l'os le plus long du corps humain ?|Le fémur|Le tibia|L'humérus|Le radius",
    "Quel est le plus petit os du corps humain, situé dans l'oreille ?|L'étrier|Le marteau|L'enclume|La phalange",
    "Quel organe produit la bile ?|Le foie|L'estomac|Le pancréas|La rate",
    "Quelles cellules du sang transportent l'oxygène ?|Les globules rouges|Les globules blancs|Les plaquettes|Les neurones",
    "Quel organe nous permet de penser et de mémoriser ?|Le cerveau|Le cœur|Le foie|L'estomac",
    "Combien de sens compte-t-on traditionnellement chez l'humain ?|Cinq|Quatre|Six|Sept",
    "Quelle est la substance la plus dure du corps humain ?|L'émail des dents|L'os du crâne|Le cartilage|L'ongle",
    "Quel muscle principal permet la respiration ?|Le diaphragme|Les abdominaux|Le trapèze|Les pectoraux",
    "Quelle protéine donne sa couleur rouge au sang ?|L'hémoglobine|La kératine|Le collagène|L'insuline",
    "Quel organe fabrique l'insuline ?|Le pancréas|Le foie|Les reins|La thyroïde",
    "De quelle matière sont principalement faits cheveux et ongles ?|De kératine|De collagène|De calcium|De cellulose",
    "Quel pigment donne sa couleur à la peau ?|La mélanine|La kératine|L'hémoglobine|Le carotène",
    "Quelle vitamine la peau fabrique-t-elle grâce au soleil ?|La vitamine D|La vitamine C|La vitamine A|La vitamine K",
    "Quel groupe sanguin est dit donneur universel ?|O négatif|AB positif|A positif|B négatif",
    "Combien de chromosomes contient une cellule humaine ordinaire ?|46|23|48|44",
    "Quelle partie colorée de l'œil entoure la pupille ?|L'iris|La rétine|La cornée|Le cristallin",
    "Comment s'appelle l'ensemble des os qui protège le cerveau ?|Le crâne|Le sternum|La clavicule|Le bassin",
    "Quel est l'animal terrestre le plus rapide ?|Le guépard|Le lion|L'antilope|Le lévrier",
    "Quel est le plus grand animal ayant jamais vécu sur Terre ?|La baleine bleue|Le diplodocus|Le mégalodon|Le mammouth",
    "Quel est le plus gros animal terrestre actuel ?|L'éléphant d'Afrique|Le rhinocéros blanc|L'hippopotame|La girafe",
    "Quel est l'animal le plus haut du monde ?|La girafe|L'éléphant|L'autruche|Le chameau",
    "Quel est le plus grand oiseau du monde ?|L'autruche|Le condor|L'albatros|L'émeu",
    "Quel oiseau de l'hémisphère Sud ne vole pas mais nage très bien ?|Le manchot|Le pingouin|Le goéland|La sterne",
    "Combien de pattes possède une araignée ?|Huit|Six|Dix|Douze",
    "Combien de pattes possède un insecte adulte ?|Six|Huit|Quatre|Dix",
    "Quel est le plus gros rongeur du monde ?|Le capybara|Le castor|Le porc-épic|Le ragondin",
    "Quel est le seul mammifère capable de voler activement ?|La chauve-souris|L'écureuil volant|Le phalanger volant|Le lémur volant",
    "Combien de cœurs possède la pieuvre ?|Trois|Un|Deux|Quatre",
    "Quel reptile est célèbre pour changer de couleur ?|Le caméléon|Le gecko|L'iguane|Le varan",
    "Quel est le plus grand félin sauvage du monde ?|Le tigre|Le lion|Le jaguar|Le puma",
    "Comment s'appelle le petit de la biche ?|Le faon|Le marcassin|Le chevreau|Le levraut",
    "Comment s'appelle la femelle du sanglier ?|La laie|La truie|La hase|La daine",
    "Quel insecte fabrique le miel ?|L'abeille|La guêpe|Le frelon|Le bourdon",
    "Quel animal construit des barrages sur les cours d'eau ?|Le castor|La loutre|Le ragondin|Le rat musqué",
    "Quel oiseau est le plus rapide du monde en piqué ?|Le faucon pèlerin|L'aigle royal|Le martinet noir|L'épervier",
    "Combien de branches possède généralement une étoile de mer ?|Cinq|Quatre|Six|Huit",
    "Quel est le plus grand animal pourvu de dents ?|Le cachalot|L'orque|Le grand requin blanc|L'éléphant de mer",
    "Quel est le plus grand reptile vivant actuellement ?|Le crocodile marin|Le dragon de Komodo|L'anaconda|La tortue luth",
    "Quel animal terrestre peut vivre plus de 150 ans ?|La tortue géante|L'éléphant|Le corbeau|Le chimpanzé",
    "Quel oiseau peut voler en marche arrière ?|Le colibri|L'hirondelle|Le martinet|Le rouge-gorge",
    "Combien de compartiments compte l'estomac de la vache ?|Quatre|Deux|Trois|Cinq",
    "Lequel de ces animaux est un marsupial ?|Le kangourou|Le castor|Le tatou|Le paresseux",
    "De quoi se nourrit principalement le panda géant ?|De bambou|De poisson|D'eucalyptus|De miel",
    "De quelles feuilles le koala se nourrit-il presque exclusivement ?|D'eucalyptus|De bambou|De chêne|D'acacia",
    "Quel pigment donne leur couleur verte aux plantes ?|La chlorophylle|Le carotène|La mélanine|La xanthophylle",
    "Quel gaz les plantes absorbent-elles pour la photosynthèse ?|Le dioxyde de carbone|L'oxygène|L'azote|Le méthane",
    "Quelle partie de la plante puise l'eau dans le sol ?|Les racines|Les feuilles|La tige|Les fleurs",
    "Quel arbre produit des glands ?|Le chêne|Le hêtre|Le châtaignier|Le noyer",
    "De quel arbre provient la châtaigne ?|Le châtaignier|Le marronnier|Le hêtre|Le noisetier",
    "Quelle espèce d'arbre peut dépasser 100 mètres de hauteur ?|Le séquoia|Le baobab|Le chêne|Le platane",
    "Comment qualifie-t-on un feuillage qui reste vert toute l'année ?|Persistant|Caduc|Annuel|Précoce",
    "Que transportent les abeilles de fleur en fleur pour les féconder ?|Le pollen|Le nectar|La sève|La rosée",
    "Quelle plante peut pousser de près d'un mètre en un seul jour ?|Le bambou|Le maïs|Le tournesol|La glycine",
    "Que peut-on estimer en comptant les cernes d'un tronc coupé ?|L'âge de l'arbre|Sa hauteur|Son espèce|Sa masse",
    "Quelle partie du champignon se développe sous terre ?|Le mycélium|Le chapeau|Les lamelles|Le pied",
    "La vanille est le fruit de quelle plante ?|Une orchidée|Un cactus|Un rosier|Un palmier",
    "Qui a peint « La Joconde » ?|Léonard de Vinci|Michel-Ange|Raphaël|Sandro Botticelli",
    "Qui a composé l'opéra « La Flûte enchantée » ?|Wolfgang Amadeus Mozart|Ludwig van Beethoven|Joseph Haydn|Franz Schubert",
    "Que signifie l'expression « poser un lapin » ?|Ne pas venir à un rendez-vous|Mentir à quelqu'un|Faire une blague|Arriver très en retard",
    "Quel gâteau partage-t-on traditionnellement à l'Épiphanie ?|La galette des Rois|La bûche glacée|Le kouglof|Le millefeuille",
    "Combien de joueurs une équipe de football aligne-t-elle sur le terrain ?|Onze|Dix|Douze|Neuf",
    "Qui a écrit « Les Misérables » ?|Victor Hugo|Émile Zola|Honoré de Balzac|Gustave Flaubert",
    "Combien de cordes compte un violon ?|Quatre|Six|Cinq|Trois",
    "Que signifie l'expression « avoir le cafard » ?|Être triste|Avoir peur|Être en colère|Avoir sommeil",
    "De quelle région française la choucroute est-elle la spécialité ?|L'Alsace|La Lorraine|La Bretagne|La Bourgogne",
    "Quel maillot distingue le leader du Tour de France ?|Le maillot jaune|Le maillot vert|Le maillot à pois|Le maillot blanc",
    "Quel peintre impressionniste a peint la série des « Nymphéas » ?|Claude Monet|Édouard Manet|Auguste Renoir|Edgar Degas",
    "Qui a composé « Les Quatre Saisons » ?|Antonio Vivaldi|Jean-Sébastien Bach|Georg Friedrich Haendel|Arcangelo Corelli",
    "Que signifie un repas « frugal » ?|Un repas simple et léger|Un repas copieux|Un repas très épicé|Un repas coûteux",
    "Quel plat marseillais est une célèbre soupe de poissons ?|La bouillabaisse|La ratatouille|L'aïoli|La piperade",
    "En quelle année la France a-t-elle remporté sa première Coupe du monde de football ?|1998|1986|1994|2002",
    "Qui a écrit « Le Petit Prince » ?|Antoine de Saint-Exupéry|Jules Verne|Marcel Pagnol|André Gide",
    "Qui a composé le « Boléro » ?|Maurice Ravel|Claude Debussy|Erik Satie|Gabriel Fauré",
    "Quel est le pluriel du mot « cheval » ?|Des chevaux|Des chevals|Des chevaus|Des cheveaux",
    "De quelle région française la quiche tient-elle son nom ?|La Lorraine|L'Alsace|La Picardie|L'Auvergne",
    "Sur quelle surface se joue le tournoi de Roland-Garros ?|La terre battue|Le gazon|Le ciment|La moquette",
    "Qui a sculpté « Le Penseur » ?|Auguste Rodin|Camille Claudel|Antoine Bourdelle|Aristide Maillol",
    "Quel grand compositeur a continué d'écrire malgré sa surdité ?|Ludwig van Beethoven|Wolfgang Amadeus Mozart|Frédéric Chopin|Franz Liszt",
    "Que signifie « donner sa langue au chat » ?|Renoncer à deviner|Garder un secret|Refuser de parler|Dire une bêtise",
    "Quel fromage à pâte persillée est affiné dans l'Aveyron ?|Le roquefort|Le bleu d'Auvergne|La fourme d'Ambert|Le saint-nectaire",
    "Qui a écrit « Madame Bovary » ?|Gustave Flaubert|Stendhal|Guy de Maupassant|Émile Zola",
    "Qui a composé le ballet « Le Lac des cygnes » ?|Piotr Ilitch Tchaïkovski|Igor Stravinsky|Sergueï Prokofiev|Serge Rachmaninov",
    "Comment appelle-t-on un mot qui se lit dans les deux sens ?|Un palindrome|Une anagramme|Un acrostiche|Un homonyme",
    "Quelle fête, le 2 février, est l'occasion de faire des crêpes ?|La Chandeleur|L'Épiphanie|Mardi gras|La Toussaint",
    "Quelle ville a accueilli les premiers Jeux olympiques modernes en 1896 ?|Athènes|Paris|Londres|Rome",
    "Quel peintre s'est tranché une partie de l'oreille ?|Vincent van Gogh|Paul Gauguin|Paul Cézanne|Henri de Toulouse-Lautrec",
    "Qui a composé l'opéra « Carmen » ?|Georges Bizet|Charles Gounod|Jules Massenet|Jacques Offenbach",
    "Que signifie l'expression « tomber dans les pommes » ?|S'évanouir|Trébucher|Se tromper|S'endormir",
    "Que colle-t-on dans le dos des gens le 1er avril ?|Un poisson en papier|Une étoile en papier|Un cœur en papier|Un soleil en papier",
    "Combien d'anneaux figurent sur le drapeau olympique ?|Cinq|Quatre|Six|Trois",
    "Qui a écrit « Les Trois Mousquetaires » ?|Alexandre Dumas|Victor Hugo|Jules Verne|Théophile Gautier",
    "Pour quel instrument Frédéric Chopin a-t-il surtout composé ?|Le piano|Le violon|La harpe|L'orgue",
    "Que signifie le verbe « procrastiner » ?|Remettre au lendemain|Parler pour ne rien dire|Se plaindre sans cesse|Agir sans réfléchir",
    "Quel est l'ingrédient principal de la tapenade ?|Les olives|Les anchois|Les câpres|Les tomates séchées",
    "Combien de joueurs une équipe de volley-ball compte-t-elle sur le terrain ?|Six|Cinq|Sept|Huit",
    "Qui a peint « Guernica » ?|Pablo Picasso|Salvador Dalí|Joan Miró|Henri Matisse",
    "Qui a composé « Clair de lune », pièce de la Suite bergamasque ?|Claude Debussy|Maurice Ravel|Erik Satie|Gabriel Fauré",
    "Que signifie « en faire tout un fromage » ?|Exagérer un petit problème|Cuisiner longtemps|Se réjouir trop vite|Tout mélanger",
    "Quelle ville est surnommée la capitale du cassoulet ?|Castelnaudary|Albi|Montauban|Béziers",
    "Quel sport est à l'honneur lors du Vendée Globe ?|La voile|L'aviron|Le cyclisme|La natation",
    "Qui a écrit « L'Avare » et « Le Malade imaginaire » ?|Molière|Jean Racine|Pierre Corneille|Beaumarchais",
    "Qui a écrit les paroles et la musique de « La Marseillaise » ?|Rouget de Lisle|Hector Berlioz|François-Joseph Gossec|André Grétry",
    "Comment appelle-t-on deux mots de sens contraire ?|Des antonymes|Des synonymes|Des homonymes|Des paronymes",
    "Quelle farine utilise-t-on pour les galettes bretonnes salées ?|La farine de sarrasin|La farine de blé|La farine de maïs|La farine de seigle",
    "Quel sport de combat se pratique sur un ring ?|La boxe|Le judo|Le karaté|La lutte",
    "Qui a écrit « Vingt Mille Lieues sous les mers » ?|Jules Verne|Alexandre Dumas|Victor Hugo|Guy de Maupassant",
    "Quel compositeur autrichien est surnommé le « roi de la valse » ?|Johann Strauss fils|Franz Schubert|Gustav Mahler|Joseph Haydn",
    "Que signifie « avoir un poil dans la main » ?|Être paresseux|Être malchanceux|Être maladroit|Être avare",
    "Autour de quelles villes produit-on le champagne ?|Reims et Épernay|Dijon et Beaune|Bordeaux et Cognac|Angers et Saumur",
    "Quelle est la durée réglementaire d'un match de football ?|90 minutes|80 minutes|70 minutes|100 minutes",
    "Qui a peint « Le Cri » ?|Edvard Munch|Gustav Klimt|Egon Schiele|Vassily Kandinsky",
    "Qui a composé l'opéra « La Traviata » ?|Giuseppe Verdi|Giacomo Puccini|Gioachino Rossini|Gaetano Donizetti",
    "Que signifie le mot « ubiquité » ?|Le don d'être partout|Le don de tout retenir|Le don de convaincre|Le don de prévoir",
    "Qu'est-ce qu'une blanquette de veau ?|Un ragoût en sauce blanche|Une viande grillée|Une terrine froide|Une soupe de légumes",
    "Quel tournoi du Grand Chelem se joue sur gazon à Londres ?|Wimbledon|L'US Open|L'Open d'Australie|Roland-Garros",
    "Quel fabuliste a écrit « Le Corbeau et le Renard » ?|Jean de La Fontaine|Charles Perrault|Nicolas Boileau|Pierre de Ronsard",
    "À quelle famille d'instruments appartient le hautbois ?|Les bois|Les cuivres|Les cordes|Les percussions",
    "Que signifie « passer du coq à l'âne » ?|Changer brusquement de sujet|Se contredire|Parler trop fort|Mélanger les mots",
    "Quelle pâtisserie doit son nom à une course cycliste ?|Le paris-brest|Le saint-honoré|L'opéra|Le financier",
    "Quel pays a remporté la première Coupe du monde de football en 1930 ?|L'Uruguay|Le Brésil|L'Italie|L'Argentine",
    "Qui a écrit « Germinal » ?|Émile Zola|Guy de Maupassant|Honoré de Balzac|Victor Hugo",
    "Qui a composé le conte musical « Pierre et le Loup » ?|Sergueï Prokofiev|Piotr Ilitch Tchaïkovski|Igor Stravinsky|Dmitri Chostakovitch",
    "Que signifie « mettre la charrue avant les bœufs » ?|Agir dans le mauvais ordre|Travailler trop dur|Être très têtu|Avancer trop lentement",
    "De quelle ville les bêtises sont-elles la confiserie emblématique ?|Cambrai|Lille|Nancy|Rouen",
    "Combien de sets gagnants faut-il en Grand Chelem chez les messieurs ?|Trois|Deux|Quatre|Cinq",
    "Qui a peint le plafond de la chapelle Sixtine ?|Michel-Ange|Léonard de Vinci|Raphaël|Le Titien",
    "Quel monument parisien a été construit pour l'Exposition universelle de 1889 ?|La tour Eiffel|Le Grand Palais|L'Arc de triomphe|Le Sacré-Cœur",
    "Quel signe place-t-on sous le « c » pour obtenir un « ç » ?|Une cédille|Un tréma|Un accent grave|Une apostrophe",
    "De quelle région le camembert est-il originaire ?|La Normandie|La Bretagne|L'Auvergne|La Savoie",
    "Dans quel pays le judo a-t-il été inventé ?|Le Japon|La Chine|La Corée du Sud|La Thaïlande",
    "Qui a écrit la pièce « Cyrano de Bergerac » ?|Edmond Rostand|Alfred de Musset|Marcel Pagnol|Georges Feydeau",
    "Dans quelle ville se dresse le palais des Papes ?|Avignon|Arles|Nîmes|Carcassonne",
    "Que signifie « être médusé » ?|Être stupéfait|Être fatigué|Être vexé|Être enchanté",
    "Quel plat consiste à racler du fromage fondu sur des pommes de terre ?|La raclette|La fondue|La tartiflette|L'aligot",
    "Combien de trous compte un parcours de golf classique ?|Dix-huit|Douze|Vingt-quatre|Seize",
    "Dans quel musée parisien peut-on admirer la « Vénus de Milo » ?|Le Louvre|Le musée d'Orsay|Le Centre Pompidou|Le musée Rodin",
    "Quel roi de France a fait construire le château de Versailles ?|Louis XIV|Louis XV|Louis XVI|François Ier",
    "Que signifie « avoir la tête dans les nuages » ?|Être distrait|Être prétentieux|Être joyeux|Être inquiet",
    "Quel dessert en pyramide de choux couronne souvent les mariages ?|La pièce montée|Le fraisier|La charlotte|Le vacherin",
    "Quelle course à pied se dispute sur 42,195 kilomètres ?|Le marathon|Le semi-marathon|Le 10 000 mètres|Le cross-country",
    "Quel écrivain a créé le commissaire Maigret ?|Georges Simenon|Gaston Leroux|Maurice Leblanc|Frédéric Dard",
    "Sur quelle île se trouve la cathédrale Notre-Dame de Paris ?|L'île de la Cité|L'île Saint-Louis|L'île aux Cygnes|L'île Seguin",
    "Comment appelle-t-on une phrase sans verbe conjugué ?|Une phrase nominale|Une phrase passive|Une phrase relative|Une phrase impérative",
    "Que célèbre-t-on en France le 14 juillet ?|La fête nationale|L'armistice de 1918|La Saint-Jean|La fête du Travail",
    "Quel jeu oppose des boules d'acier autour d'un cochonnet ?|La pétanque|Le croquet|Le curling|Le bowling",
    "Quel château de la Loire possède un escalier à double révolution ?|Chambord|Chenonceau|Amboise|Azay-le-Rideau",
    "Que signifie distribuer « avec parcimonie » ?|En très petite quantité|En grande quantité|Sans faire attention|À contrecœur",
    "Quelle fleur porte-bonheur offre-t-on le 1er mai ?|Le muguet|La violette|Le mimosa|La jonquille",
    "Quel pays représentent les « All Blacks » au rugby ?|La Nouvelle-Zélande|L'Australie|L'Afrique du Sud|Les Fidji",
    "Qui a écrit le roman « L'Étranger » ?|Albert Camus|Jean-Paul Sartre|André Malraux|Marcel Proust",
    "Qui a écrit le recueil « Les Fleurs du mal » ?|Charles Baudelaire|Paul Verlaine|Arthur Rimbaud|Alphonse de Lamartine",
    "Qui a peint « La Jeune Fille à la perle » ?|Johannes Vermeer|Rembrandt|Pierre Paul Rubens|Jan van Eyck",
    "Quel dramaturge a écrit « Phèdre » et « Andromaque » ?|Jean Racine|Pierre Corneille|Molière|Marivaux",
    "Quel peintre est célèbre pour ses danseuses de ballet ?|Edgar Degas|Auguste Renoir|Paul Cézanne|Claude Monet"
  ];

  function parseQ(e) {
    var p = e.split('|');
    return { q: p[0], good: p[1], lures: [p[2], p[3], p[4]], theme: p[5] || 'general' };
  }

  function themeCount(th) {
    if (th === 'melange') return BANK.length;
    var n = 0;
    BANK.forEach(function (e) { if (parseQ(e).theme === th) n++; });
    return n;
  }

  function buildQuestions(th) {
    var src = th === 'melange' ? BANK.slice() : BANK.filter(function (e) {
      return parseQ(e).theme === th;
    });
    var pool = GG.shuffle(src).slice(0, NB_QUESTIONS);
    return pool.map(function (e) {
      var d = parseQ(e);
      var choices = GG.shuffle([d.good, d.lures[0], d.lures[1], d.lures[2]]);
      return { q: d.q, choices: choices, correct: choices.indexOf(d.good) };
    });
  }

  var mod = {
    id: 'quiz',
    nom: 'Quiz',
    icone: '💡',
    desc: 'Culture générale : 10 questions, tout le monde répond en secret, +10 par bonne réponse et +5 au plus rapide. Jusqu’à 12 joueurs !',
    min: 1, max: 12,
    hotseat: true, hotseatMax: 4, hidden: true, netOnly: false,
    regles: '<p><strong>🎯 Le but :</strong> marquer le plus de points sur 10 questions de culture générale.</p><p><strong>Comment jouer :</strong> à chaque question, chacun choisit sa réponse <strong>en secret</strong> sur son téléphone. Quand tout le monde a répondu, la bonne réponse est révélée avec le score de chacun.</p><p><strong>Les points :</strong> +10 par bonne réponse, et +5 de bonus au plus rapide des bons répondeurs. En solo : visez le record !</p>',

    create: function (names) {
      return {
        players: names.map(function (n) { return { name: n, score: 0, answer: -1 }; }),
        qs: [],
        theme: null,
        idx: 0,
        phase: 'setup',      // l'hôte choisit le thème
        order: [],          // ordre d'arrivée des réponses (bonus rapidité)
        reveal: null,
        gameTs: Math.floor(Math.random() * 1e9),
        finished: false
      };
    },

    turnOf: function () { return -1; }, // tout le monde répond en même temps
    /* hotseat : l'écran passe au premier joueur n'ayant pas répondu,
       en tournant à chaque question pour que le bonus rapidité soit équitable */
    viewerOf: function (state) {
      if (state.phase !== 'question') return 0;

      var n = state.players.length;
      for (var k = 0; k < n; k++) {
        var i = (state.idx + k) % n;
        if (state.players[i].answer === -1) return i;
      }
      return 0;
    },
    over: function (state) { return state.finished; },
    scoreOf: function (state, i) { return state.players[i].score; },

    summary: function (state) {
      var rows = state.players.map(function (p) { return { n: p.name, s: p.score }; })
        .sort(function (a, b) { return b.s - a.s; });
      var html = rows.map(function (r) {
        return '<div class="final-line"><span>' + GG.esc(r.n) + '</span><strong>' +
          r.s + ' pts</strong></div>';
      }).join('') + '<h1>🏆 ' + GG.esc(rows[0].n) + '</h1>';
      if (state.players.length === 1) {
        try {
          if (typeof localStorage !== 'undefined') {
            var best = JSON.parse(localStorage.getItem('gg-quiz-best') || 'null');
            var cur = { score: rows[0].s, ts: state.gameTs };
            if (!best || cur.score > best.score) {
              localStorage.setItem('gg-quiz-best', JSON.stringify(cur));
            }
            var stored = JSON.parse(localStorage.getItem('gg-quiz-best') || 'null');
            if (stored && stored.ts === cur.ts && stored.score === cur.score) {
              html += '<p>🏆 Nouveau record personnel !</p>';
            } else if (stored) {
              html += '<p>🏅 Votre record : ' + stored.score + ' pts.</p>';
            }
          }
        } catch (e) {}
      }
      return html;
    },

    /* les bonnes réponses et les réponses des autres ne circulent jamais
       avant la révélation */
    redact: function (state, viewer) {
      var copy = GG.clone(state);
      copy.qs.forEach(function (q) { delete q.correct; });
      delete copy.order;
      copy.players.forEach(function (p, i) {
        p.hasAnswered = p.answer !== -1;
        if (i !== viewer && copy.phase === 'question') delete p.answer;
      });
      return copy;
    },

    apply: function (state, player, action) {
      if (state.finished) return { ok: false, error: 'Partie terminée.' };
      var p = state.players[player];
      if (action.t === 'theme') {
        if (state.phase !== 'setup') return { ok: false, error: 'Thème déjà choisi.' };
        if (player !== 0) return { ok: false, error: 'L’hôte choisit le thème.' };
        var th = String(action.th);
        var known = THEMES.some(function (x) { return x.id === th; });
        if (!known) return { ok: false, error: 'Thème inconnu.' };
        if (th !== 'melange' && themeCount(th) < NB_QUESTIONS) {
          return { ok: false, error: 'Pas assez de questions sur ce thème.' };
        }
        state.theme = th;
        state.qs = buildQuestions(th);
        state.phase = 'question';
        return { ok: true };
      }
      if (state.phase === 'setup') return { ok: false, error: 'Choisissez d’abord le thème.' };
      if (action.t === 'answer') {
        if (state.phase !== 'question') return { ok: false, error: 'Trop tard !' };
        if (!p) return { ok: false, error: 'Joueur inconnu.' };
        if (p.answer !== -1) return { ok: false, error: 'Vous avez déjà répondu.' };
        var i = action.i | 0;
        if (i < 0 || i > 3) return { ok: false, error: 'Réponse invalide.' };
        p.answer = i;
        state.order.push(player);
        if (state.players.every(function (x) { return x.answer !== -1; })) {
          // révélation : les points tombent maintenant (rien ne fuit avant)
          var q = state.qs[state.idx];
          var first = -1;
          state.order.forEach(function (pi) {
            if (state.players[pi].answer === q.correct) {
              state.players[pi].score += 10;
              if (first === -1) { first = pi; state.players[pi].score += 5; }
            }
          });
          state.phase = 'reveal';
          state.reveal = {
            correct: q.correct,
            first: first,
            answers: state.players.map(function (x) { return x.answer; })
          };
        }
        return { ok: true };
      }
      if (action.t === 'next') {
        if (state.phase !== 'reveal') return { ok: false, error: 'La question est en cours.' };
        if (player !== 0) return { ok: false, error: 'L’hôte passe à la suite.' };
        state.idx++;
        if (state.idx >= state.qs.length) {
          state.finished = true;
          return { ok: true };
        }
        state.phase = 'question';
        state.reveal = null;
        state.order = [];
        state.players.forEach(function (x) { x.answer = -1; });
        return { ok: true };
      }
      return { ok: false, error: 'Action inconnue.' };
    },

    render: function (el, ctx) {
      var s = ctx.state;
      if (s.finished) { el.innerHTML = ''; return; } // l'écran de fin prend le relais
      var me = ctx.me;
      var my = s.players[me];
      if (s.phase === 'setup') {
        var html0 = '<p class="mini-msg big-msg">💡 Quiz</p>';
        if (me === 0) {
          html0 += '<p class="mini-msg">Choisissez le thème :</p><div class="qz-themes">' +
            THEMES.filter(function (t) {
              return t.id === 'melange' || themeCount(t.id) >= NB_QUESTIONS;
            }).map(function (t) {
              var n = themeCount(t.id);
              return '<button class="qz-theme" data-th="' + t.id + '">' + t.icone +
                '<span>' + t.nom + '</span><small>' + n + ' questions</small></button>';
            }).join('') + '</div>';
        } else {
          html0 += '<p class="waiting">⏳ L’hôte choisit le thème…</p>';
        }
        el.innerHTML = html0;
        el.querySelectorAll('[data-th]').forEach(function (b) {
          b.addEventListener('click', function () { ctx.act({ t: 'theme', th: b.dataset.th }); });
        });
        return;
      }
      var q = s.qs[s.idx];
      var html = '<p class="qz-head">💡 Question ' + (s.idx + 1) + ' / ' + s.qs.length + '</p>';

      if (s.phase === 'question') {
        var answered = s.players.filter(function (p) {
          return p.hasAnswered || p.answer !== -1;
        }).length;
        html += '<div class="qz-q">' + GG.esc(q.q) + '</div>';
        var mineDone = my && (my.answer !== -1 && my.answer !== undefined);
        html += '<div class="qz-choices">' + q.choices.map(function (c, i) {
          return '<button class="qz-choice' +
            (mineDone && my.answer === i ? ' picked' : '') + '" data-i="' + i + '"' +
            (mineDone ? ' disabled' : '') + '>' + GG.esc(c) + '</button>';
        }).join('') + '</div>';
        html += '<p class="mini-msg">' + (mineDone
          ? '✔️ Réponse enregistrée — en attente des autres (' + answered + '/' + s.players.length + ')'
          : 'Répondez vite : +5 points au plus rapide !') + '</p>';
      } else if (s.phase === 'reveal') {
        var r = s.reveal;
        html += '<div class="qz-q">' + GG.esc(q.q) + '</div>';
        html += '<div class="qz-choices">' + q.choices.map(function (c, i) {
          var cls = i === r.correct ? ' good' : '';
          var who = s.players.map(function (p, pi) {
            return r.answers[pi] === i ? GG.esc(p.name) : null;
          }).filter(Boolean);
          return '<div class="qz-choice show' + cls + '">' + GG.esc(c) +
            (who.length ? '<small>' + who.join(', ') + '</small>' : '') + '</div>';
        }).join('') + '</div>';
        if (r.first !== -1) {
          html += '<p class="mini-msg">⚡ Le plus rapide : <strong>' +
            GG.esc(s.players[r.first].name) + '</strong> (+5)</p>';
        } else {
          html += '<p class="mini-msg">😅 Personne n’a trouvé !</p>';
        }
        html += '<div class="mem-stats">' + s.players.map(function (p) {
          return '<span class="mem-stat">' + GG.esc(p.name) + ' : ' + p.score + '</span>';
        }).join('') + '</div>';
        if (me === 0) {
          html += '<button class="btn big primary" data-a="next">' +
            (s.idx + 1 >= s.qs.length ? '🏁 Voir le classement' : '➜ Question suivante') +
            '</button>';
        } else {
          html += '<p class="waiting">L’hôte passe à la question suivante…</p>';
        }
      }

      el.innerHTML = html;
      el.querySelectorAll('.qz-choice[data-i]').forEach(function (b) {
        b.addEventListener('click', function () {
          ctx.act({ t: 'answer', i: parseInt(b.dataset.i, 10) });
        });
      });
      var nx = el.querySelector('[data-a="next"]');
      if (nx) nx.addEventListener('click', function () { ctx.act({ t: 'next' }); });
    },

    _BANK: BANK, _buildQuestions: buildQuestions, _THEMES: THEMES, _themeCount: themeCount
  };

  GG.register(mod);
  if (typeof module === 'object' && module.exports) module.exports = mod;
})(typeof self !== 'undefined' ? self : globalThis);
