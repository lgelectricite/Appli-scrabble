/*
 * GGgames — Quiz (1 à 12 joueurs, culture générale), version V2.
 *
 * Façon « jeu télévisé » : une question, quatre tuiles de couleur (chacune
 * avec sa forme), un chrono. Plus on répond vite, plus on marque (de 500 à
 * 1 000 points), et les séries de bonnes réponses rapportent un bonus.
 * Révélation animée, classement qui se réordonne, podium final.
 *
 * Trois façons de jouer :
 *   - « chrono » : chacun sur son téléphone (ou seul, ou contre l'ordinateur) ;
 *   - « animateur » : un seul téléphone posé sur la table, chacun annonce sa
 *     réponse et l'animateur la note (aucun passage de téléphone) ;
 *   - « chacun son tour » : réponses secrètes, on se passe le téléphone.
 *
 * La banque : 'Question|Bonne réponse|Leurre|Leurre|Leurre|thème|niveau'
 * (niveau 1 facile, 2 moyen, 3 difficile ; un « r » marque les questions
 * récentes, depuis 2016). Relue à la main : doublons retirés, erreurs
 * corrigées (la série H), séries rééquilibrées, faits datés et vérifiés.
 * Les bonnes réponses ne circulent jamais avant la révélation.
 */
(function (root) {
  'use strict';
  var GG = root.GG;
  var THEMES = [
    { id: 'melange', nom: 'Tout mélangé', court: 'Mélange', icone: '🌍' },
    { id: 'general', nom: 'Culture générale', court: 'Culture', icone: '🎓' },
    { id: 'cinema', nom: 'Cinéma', court: 'Cinéma', icone: '🎬' },
    { id: 'series', nom: 'Séries TV', court: 'Séries', icone: '📺' },
    { id: 'musique', nom: 'Musique', court: 'Musique', icone: '🎵' },
    { id: 'sport', nom: 'Sport', court: 'Sport', icone: '⚽' },
    { id: 'histoiregeo', nom: 'Histoire-Géo', court: 'Histoire', icone: '🏛️' },
    { id: 'sciences', nom: 'Sciences', court: 'Sciences', icone: '🔬' },
    { id: 'france', nom: 'France', court: 'France', icone: '🥖' },
    { id: 'recent', nom: 'Depuis 2016', court: 'Récent', icone: '🆕' }
  ];
  var DIFFS = [
    { id: 'progressif', nom: 'Progressive', icone: '📈' },
    { id: 'facile', nom: 'Facile', icone: '🌱' },
    { id: 'moyen', nom: 'Moyenne', icone: '🔥' },
    { id: 'difficile', nom: 'Difficile', icone: '🧠' }
  ];
  var NBS = [10, 15, 20];
  var CHRONOS = [10, 20, 30];            // secondes (0 = sans chrono, sur un seul téléphone)
  var MODES = ['chrono', 'animateur', 'secret'];

  /* Banque (1 533 questions) */
  var BANK = [
    "Quelle est la capitale de l’Italie ?|Rome|Milan|Naples|Turin|general|1",
    "En quelle année a eu lieu la prise de la Bastille ?|1789|1792|1776|1815|general|1",
    "Quelle est la capitale de l’Espagne ?|Madrid|Barcelone|Séville|Valence|general|1",
    "Quel roi de France était surnommé le Roi-Soleil ?|Louis XIV|Louis XVI|Henri IV|François Ier|general|1",
    "Quel fleuve traverse Paris ?|La Seine|La Loire|Le Rhône|La Garonne|general|1",
    "En quelle année Christophe Colomb a-t-il atteint l’Amérique ?|1492|1453|1515|1519|general|1",
    "Quelle est la capitale de l’Allemagne ?|Berlin|Munich|Hambourg|Francfort|general|1",
    "Qui a peint La Joconde ?|Léonard de Vinci|Michel-Ange|Raphaël|Botticelli|general|1",
    "Quel pays a un drapeau rouge et blanc orné d’une feuille d’érable ?|Le Canada|Les États-Unis|Le Danemark|La Suisse|general|1",
    "En quelle année a débuté la Première Guerre mondiale ?|1914|1912|1916|1918|general|1",
    "Quelle est la capitale du Japon ?|Tokyo|Osaka|Kyoto|Nagoya|general|1",
    "En quelle année s’est achevée la Seconde Guerre mondiale ?|1945|1944|1946|1942|general|1",
    "Quel est le plus grand pays du monde par sa superficie ?|La Russie|Le Canada|La Chine|Les États-Unis|general|1",
    "Qui a lancé l’appel du 18 juin 1940 depuis Londres ?|Charles de Gaulle|Philippe Pétain|Jean Moulin|Winston Churchill|general|1",
    "Quelle est la capitale de la Grèce ?|Athènes|Thessalonique|Patras|Héraklion|general|1",
    "Quel roi de France a été guillotiné en 1793 ?|Louis XVI|Louis XV|Charles X|Louis XVIII|general|2",
    "Quel est le plus haut sommet du monde ?|L’Everest|Le K2|Le Mont Blanc|Le Kilimandjaro|general|1",
    "Quel chef gaulois a affronté Jules César à Alésia ?|Vercingétorix|Brennus|Ambiorix|Clovis|general|1",
    "Quelle est la capitale de la Belgique ?|Bruxelles|Anvers|Gand|Liège|general|1",
    "Quel roi des Francs a été couronné empereur en l’an 800 ?|Charlemagne|Clovis|Pépin le Bref|Hugues Capet|general|2",
    "Quel fleuve traverse Londres ?|La Tamise|La Severn|La Mersey|La Clyde|general|2",
    "Quelle héroïne française a délivré Orléans en 1429 ?|Jeanne d’Arc|Anne de Bretagne|Aliénor d’Aquitaine|Blanche de Castille|general|1",
    "Quelle est la capitale de la Russie ?|Moscou|Saint-Pétersbourg|Kazan|Novossibirsk|general|1",
    "Quelle bataille de 1815 a marqué la défaite finale de Napoléon ?|Waterloo|Austerlitz|Trafalgar|Iéna|general|1",
    "Quel pays a un drapeau blanc avec un disque rouge au centre ?|Le Japon|La Corée du Sud|La Chine|L’Indonésie|general|1",
    "En quelle année le mur de Berlin est-il tombé ?|1989|1991|1985|1993|general|2",
    "Quelle est la capitale de la Chine ?|Pékin|Shanghai|Canton|Hong Kong|general|1",
    "Qui a été le premier homme à marcher sur la Lune ?|Neil Armstrong|Buzz Aldrin|Youri Gagarine|John Glenn|general|1",
    "Quel est le plus grand désert chaud du monde ?|Le Sahara|Le Gobi|Le Kalahari|L’Atacama|general|1",
    "Quelle physicienne a découvert le radium ?|Marie Curie|Irène Joliot-Curie|Rosalind Franklin|Lise Meitner|general|2",
    "Quelle est la capitale des États-Unis ?|Washington|New York|Chicago|Boston|general|1",
    "Qui a fait breveter le téléphone en 1876 ?|Graham Bell|Thomas Edison|Samuel Morse|Nikola Tesla|general|2",
    "Quel fleuve traverse l’Égypte du sud au nord ?|Le Nil|Le Niger|Le Congo|Le Zambèze|general|1",
    "Qui a inventé l’imprimerie à caractères mobiles en Europe ?|Gutenberg|Léonard de Vinci|Galilée|Newton|general|2",
    "Quelle est la capitale de l’Égypte ?|Le Caire|Alexandrie|Louxor|Assouan|general|1",
    "Quels frères ont inventé le cinématographe ?|Les frères Lumière|Les frères Wright|Les frères Montgolfier|Les frères Grimm|general|1",
    "Quel fleuve sépare la France de l’Allemagne en Alsace ?|Le Rhin|La Moselle|La Meuse|Le Danube|general|2",
    "Qui a mis au point le vaccin contre la rage ?|Louis Pasteur|Alexander Fleming|Robert Koch|Edward Jenner|general|1",
    "Quelle est la capitale de l’Inde ?|New Delhi|Bombay|Calcutta|Madras|general|2",
    "Qui a découvert la pénicilline ?|Alexander Fleming|Louis Pasteur|Marie Curie|Robert Koch|general|2",
    "Sur quel continent coule l’Amazone ?|L’Amérique du Sud|L’Afrique|L’Asie|L’Océanie|general|1",
    "Qui a formulé la théorie de la relativité ?|Albert Einstein|Isaac Newton|Galilée|Max Planck|general|1",
    "Quel pays a un drapeau à 50 étoiles et 13 bandes ?|Les États-Unis|L’Australie|Le Royaume-Uni|La Nouvelle-Zélande|general|1",
    "Quelle reine d’Égypte a séduit Jules César et Marc Antoine ?|Cléopâtre|Néfertiti|Hatchepsout|Théodora|general|1",
    "Quelle est la capitale de la Pologne ?|Varsovie|Cracovie|Gdansk|Poznan|general|2",
    "Qui a été le premier président des États-Unis ?|George Washington|Abraham Lincoln|Thomas Jefferson|John Adams|general|1",
    "Quel est le plus petit État du monde ?|Le Vatican|Monaco|Saint-Marin|Le Liechtenstein|general|1",
    "Quelle chaîne de montagnes sépare la France de l’Espagne ?|Les Pyrénées|Les Alpes|Les Vosges|Le Jura|general|1",
    "Quel dirigeant sud-africain a passé 27 ans en prison sous l’apartheid ?|Nelson Mandela|Desmond Tutu|Steve Biko|Kofi Annan|general|1",
    "Quel pays a un drapeau à bandes horizontales noire, rouge et or ?|L’Allemagne|La Belgique|L’Espagne|L’Autriche|general|2",
    "Qui a mené l’Inde vers l’indépendance par la non-violence ?|Gandhi|Nehru|Indira Gandhi|Ali Jinnah|general|1",
    "Quel est le plus grand océan du monde ?|L’océan Pacifique|L’océan Atlantique|L’océan Indien|L’océan Arctique|general|1",
    "En quelle année a eu lieu le débarquement de Normandie ?|1944|1943|1945|1942|general|1",
    "Dans quel pays se trouve le Taj Mahal ?|L’Inde|L’Iran|La Turquie|L’Égypte|general|1",
    "Quelle épidémie a ravagé l’Europe au milieu du XIVe siècle ?|La peste noire|Le choléra|La grippe espagnole|La variole|general|2",
    "Dans quel océan se trouve l’île de Madagascar ?|L’océan Indien|L’océan Atlantique|L’océan Pacifique|La mer Rouge|general|2",
    "Quel pays européen a un drapeau vert, blanc et rouge à bandes verticales ?|L’Italie|La Hongrie|L’Irlande|La Bulgarie|general|1",
    "Quel pays a un drapeau vert orné d’un grand losange jaune ?|Le Brésil|L’Argentine|La Colombie|Le Venezuela|general|1",
    "Quel est le plus long fleuve de France ?|La Loire|La Seine|Le Rhône|La Garonne|general|1",
    "Quelle est la capitale du Canada ?|Ottawa|Toronto|Montréal|Vancouver|general|2",
    "Qui a été président de la République française de 1981 à 1995 ?|François Mitterrand|Jacques Chirac|Georges Pompidou|Valéry Giscard d’Estaing|general|1",
    "Quelle est la capitale de l’Australie ?|Canberra|Sydney|Melbourne|Perth|general|2",
    "Quel général carthaginois a traversé les Alpes avec des éléphants ?|Hannibal|Scipion|Attila|Spartacus|general|2",
    "Quelle est la capitale du Brésil ?|Brasilia|Rio de Janeiro|São Paulo|Salvador|general|2",
    "Quel roi des Francs a été baptisé à Reims vers l’an 496 ?|Clovis|Charlemagne|Dagobert|Pépin le Bref|general|2",
    "Quelle est la capitale de la Turquie ?|Ankara|Istanbul|Izmir|Antalya|general|2",
    "En quelle année Guillaume le Conquérant a-t-il envahi l’Angleterre ?|1066|1099|1046|1123|general|3",
    "Quelle est la capitale de la Suisse ?|Berne|Zurich|Genève|Lausanne|general|2",
    "Quelle bataille de 1805 est surnommée la bataille des Trois Empereurs ?|Austerlitz|Iéna|Wagram|Marengo|general|2",
    "Quel fleuve traverse Bordeaux ?|La Garonne|La Dordogne|La Loire|Le Lot|general|1",
    "Qui a été le premier homme envoyé dans l’espace ?|Youri Gagarine|Neil Armstrong|Alan Shepard|Buzz Aldrin|general|1",
    "Quel fleuve traverse Vienne et Budapest ?|Le Danube|Le Rhin|L’Elbe|La Vistule|general|2",
    "Quel traité signé en 1919 a mis fin à la Première Guerre mondiale ?|Le traité de Versailles|Le traité de Vienne|Le traité de Rome|Le traité d’Utrecht|general|2",
    "Quel est le plus long fleuve d’Europe ?|La Volga|Le Danube|Le Rhin|Le Dniepr|general|3",
    "En quelle année les Françaises ont-elles obtenu le droit de vote ?|1944|1918|1936|1958|general|2",
    "Quel fleuve traverse Rome ?|Le Tibre|L’Arno|Le Pô|L’Adige|general|2",
    "Quel roi de France a signé l’édit de Nantes en 1598 ?|Henri IV|Louis XIII|François Ier|Charles IX|general|2",
    "Quel pays a un drapeau bleu orné d’une croix jaune ?|La Suède|La Finlande|La Norvège|L’Islande|general|2",
    "Quel événement survenu à Sarajevo a déclenché la Première Guerre mondiale ?|L’assassinat de l’archiduc|Le naufrage d’un paquebot|Une révolution en Russie|L’invasion de la Pologne|general|2",
    "Quel pays a un drapeau carré rouge orné d’une croix blanche ?|La Suisse|Le Danemark|La Norvège|Malte|general|1",
    "Sur quelle ville la première bombe atomique a-t-elle été larguée en 1945 ?|Hiroshima|Nagasaki|Tokyo|Kyoto|general|1",
    "Quel canal relie la mer Méditerranée à la mer Rouge ?|Le canal de Suez|Le canal de Panama|Le canal de Kiel|Le canal de Corinthe|general|1",
    "Quel savant italien fut jugé pour avoir dit que la Terre tourne autour du Soleil ?|Galilée|Copernic|Kepler|Archimède|general|2",
    "Quel détroit sépare l’Espagne du Maroc ?|Le détroit de Gibraltar|Le Bosphore|Le détroit de Béring|Le pas de Calais|general|1",
    "Qui a inventé la dynamite et fondé un célèbre prix ?|Alfred Nobel|Thomas Edison|Louis Pasteur|Alessandro Volta|general|1",
    "Quelle est la plus grande île du monde ?|Le Groenland|Madagascar|Bornéo|Sumatra|general|2",
    "En quelle année la tour Eiffel a-t-elle été inaugurée ?|1889|1900|1875|1914|general|2",
    "Quel est le plus haut sommet d’Afrique ?|Le Kilimandjaro|Le mont Kenya|Le Toubkal|Le mont Cameroun|general|1",
    "Quel pharaon est célèbre pour son tombeau découvert intact en 1922 ?|Toutânkhamon|Ramsès II|Khéops|Akhenaton|general|2",
    "Quelle est la capitale officielle de la Côte d’Ivoire ?|Yamoussoukro|Abidjan|Bouaké|Daloa|general|3",
    "Quel empereur romain a autorisé le christianisme par l’édit de Milan ?|Constantin|Néron|Dioclétien|Trajan|general|3",
    "Quel pays a un drapeau rouge orné d’une étoile verte à cinq branches ?|Le Maroc|L’Algérie|La Tunisie|Le Sénégal|general|2",
    "En quelle année l’Empire romain d’Occident s’est-il effondré ?|476|395|410|565|general|3",
    "Quel est le plus grand lac d’Afrique ?|Le lac Victoria|Le lac Tanganyika|Le lac Malawi|Le lac Tchad|general|2",
    "En quelle année Constantinople est-elle tombée aux mains des Ottomans ?|1453|1492|1389|1520|general|3",
    "Quel ministre a dirigé les finances de Louis XIV ?|Colbert|Sully|Necker|Turgot|general|2",
    "Quelle bataille de 1415 fut une lourde défaite française face aux Anglais ?|Azincourt|Crécy|Bouvines|Castillon|general|3",
    "Quel peuple de Mésopotamie a inventé l’écriture cunéiforme ?|Les Sumériens|Les Égyptiens|Les Phéniciens|Les Perses|general|3",
    "Qui fut le premier aviateur à traverser la Manche en 1909 ?|Louis Blériot|Charles Lindbergh|Roland Garros|Jean Mermoz|general|2",
    "Quelle est la planète la plus proche du Soleil ?|Mercure|Vénus|Mars|Jupiter|general|1",
    "Quelle planète est surnommée la planète rouge ?|Mars|Vénus|Jupiter|Saturne|general|1",
    "Quelle est la plus grande planète du Système solaire ?|Jupiter|Saturne|Neptune|Uranus|general|1",
    "Combien de planètes compte le Système solaire ?|Huit|Neuf|Sept|Dix|general|1",
    "Quel est le satellite naturel de la Terre ?|La Lune|Titan|Phobos|Europe|general|1",
    "Quelle planète est célèbre pour ses grands anneaux ?|Saturne|Mars|Vénus|Mercure|general|1",
    "En combien de temps la Terre tourne-t-elle sur elle-même ?|Environ 24 heures|Environ 12 heures|Environ 48 heures|Environ 365 jours|general|1",
    "Quelle est la planète la plus chaude du Système solaire ?|Vénus|Mercure|Mars|Jupiter|general|2",
    "Dans quelle galaxie se trouve notre Système solaire ?|La Voie lactée|Andromède|Le Sombrero|Le Triangle|general|1",
    "Que mesure une année-lumière ?|Une distance|Une durée|Une vitesse|Une luminosité|general|2",
    "Comment appelle-t-on le phénomène où la Lune cache le Soleil ?|Une éclipse solaire|Une éclipse lunaire|Un solstice|Un équinoxe|general|1",
    "Quelle comète célèbre repasse près de la Terre environ tous les 76 ans ?|La comète de Halley|Hale-Bopp|Swift-Tuttle|Encke|general|2",
    "Quelle planète tourne sur un axe presque couché sur son orbite ?|Uranus|Neptune|Saturne|Mars|general|3",
    "De quoi le Soleil est-il principalement composé ?|D’hydrogène et d’hélium|De fer en fusion|D’oxygène et d’azote|De roches brûlantes|general|2",
    "À quelle température l’eau bout-elle au niveau de la mer ?|100 °C|90 °C|110 °C|120 °C|general|1",
    "Quel est le symbole chimique de l’or ?|Au|Or|Ag|Al|general|2",
    "Quel gaz est le plus abondant dans l’air que nous respirons ?|L’azote|L’oxygène|Le dioxyde de carbone|L’hydrogène|general|2",
    "Quelle est la formule chimique de l’eau ?|H2O|CO2|O2|H2O2|general|1",
    "Quel métal est liquide à température ambiante ?|Le mercure|Le plomb|L’étain|Le zinc|general|2",
    "Quelle est environ la vitesse de la lumière dans le vide ?|300 000 km/s|150 000 km/s|3 000 km/s|30 000 km/s|general|2",
    "Quel savant a formulé la loi de la gravitation universelle ?|Isaac Newton|Albert Einstein|Galilée|Johannes Kepler|general|1",
    "Quel est l’élément chimique le plus léger ?|L’hydrogène|L’hélium|Le carbone|L’oxygène|general|2",
    "Quel gaz plus léger que l’air gonfle les ballons qui s’envolent ?|L’hélium|L’oxygène|L’azote|Le dioxyde de carbone|general|1",
    "Comment appelle-t-on le passage de l’état solide à l’état liquide ?|La fusion|La solidification|La condensation|La sublimation|general|2",
    "Quel instrument mesure la pression atmosphérique ?|Le baromètre|Le thermomètre|Le pluviomètre|L’anémomètre|general|2",
    "Quelle unité mesure l’intensité du courant électrique ?|L’ampère|Le volt|Le watt|L’ohm|general|2",
    "Quel savant grec aurait crié « Eurêka » dans son bain ?|Archimède|Pythagore|Aristote|Socrate|general|2",
    "Quel est le principal composant du gaz naturel ?|Le méthane|Le propane|Le butane|L’hydrogène|general|3",
    "Quel élément chimique a pour symbole Na ?|Le sodium|L’azote|Le nickel|Le néon|general|2",
    "Combien de couleurs compte traditionnellement l’arc-en-ciel ?|Sept|Cinq|Six|Huit|general|1",
    "Quel sel donne principalement son goût à l’eau de mer ?|Le chlorure de sodium|Le carbonate de calcium|Le sulfate de cuivre|Le nitrate de potassium|general|2",
    "Quelle est environ la température du zéro absolu ?|-273 °C|-100 °C|-373 °C|-500 °C|general|2",
    "Quel gaz forme les bulles des boissons pétillantes ?|Le dioxyde de carbone|L’oxygène|L’hélium|L’azote|general|1",
    "Lequel de ces métaux est attiré par un aimant ?|Le fer|Le cuivre|L’aluminium|L’or|general|1",
    "Quel organe pompe le sang dans tout le corps ?|Le cœur|Le foie|Les poumons|La rate|general|1",
    "Combien d’os compte environ le squelette d’un adulte ?|206|156|306|106|general|2",
    "Quel est le plus grand organe du corps humain ?|La peau|Le foie|Les poumons|L’intestin grêle|general|2",
    "Quels organes filtrent le sang et produisent l’urine ?|Les reins|Le foie|La vessie|Les poumons|general|1",
    "Combien de dents compte une dentition adulte complète ?|32|28|30|34|general|2",
    "Quel est l’os le plus long du corps humain ?|Le fémur|Le tibia|L’humérus|Le radius|general|2",
    "Quel est le plus petit os du corps humain, situé dans l’oreille ?|L’étrier|Le marteau|L’enclume|La phalange|general|3",
    "Quel organe produit la bile ?|Le foie|L’estomac|Le pancréas|La rate|general|2",
    "Quelles cellules du sang transportent l’oxygène ?|Les globules rouges|Les globules blancs|Les plaquettes|Les neurones|general|1",
    "Quel organe nous permet de penser et de mémoriser ?|Le cerveau|Le cœur|Le foie|L’estomac|general|1",
    "Combien de sens compte-t-on traditionnellement chez l’humain ?|Cinq|Quatre|Six|Sept|general|1",
    "Quelle est la substance la plus dure du corps humain ?|L’émail des dents|L’os du crâne|Le cartilage|L’ongle|general|2",
    "Quel muscle principal permet la respiration ?|Le diaphragme|Les abdominaux|Le trapèze|Les pectoraux|general|2",
    "Quelle protéine donne sa couleur rouge au sang ?|L’hémoglobine|La kératine|Le collagène|L’insuline|general|2",
    "Quel organe fabrique l’insuline ?|Le pancréas|Le foie|Les reins|La thyroïde|general|2",
    "De quelle matière sont principalement faits cheveux et ongles ?|De kératine|De collagène|De calcium|De cellulose|general|2",
    "Quel pigment donne sa couleur à la peau ?|La mélanine|La kératine|L’hémoglobine|Le carotène|general|2",
    "Quelle vitamine la peau fabrique-t-elle grâce au soleil ?|La vitamine D|La vitamine C|La vitamine A|La vitamine K|general|2",
    "Quel groupe sanguin est dit donneur universel ?|O négatif|AB positif|A positif|B négatif|general|2",
    "Combien de chromosomes contient une cellule humaine ordinaire ?|46|23|48|44|general|2",
    "Quelle partie colorée de l’œil entoure la pupille ?|L’iris|La rétine|La cornée|Le cristallin|general|1",
    "Comment s’appelle l’ensemble des os qui protège le cerveau ?|Le crâne|Le sternum|La clavicule|Le bassin|general|1",
    "Quel est l’animal terrestre le plus rapide ?|Le guépard|Le lion|L’antilope|Le lévrier|general|1",
    "Quel est le plus grand animal ayant jamais vécu sur Terre ?|La baleine bleue|Le diplodocus|Le mégalodon|Le mammouth|general|1",
    "Quel est le plus gros animal terrestre actuel ?|L’éléphant d’Afrique|Le rhinocéros blanc|L’hippopotame|La girafe|general|1",
    "Quel est l’animal le plus haut du monde ?|La girafe|L’éléphant|L’autruche|Le chameau|general|1",
    "Quel est le plus grand oiseau du monde ?|L’autruche|Le condor|L’albatros|L’émeu|general|1",
    "Quel oiseau de l’hémisphère Sud ne vole pas mais nage très bien ?|Le manchot|Le pingouin|Le goéland|La sterne|general|2",
    "Combien de pattes possède une araignée ?|Huit|Six|Dix|Douze|general|1",
    "Combien de pattes possède un insecte adulte ?|Six|Huit|Quatre|Dix|general|1",
    "Quel est le plus gros rongeur du monde ?|Le capybara|Le castor|Le porc-épic|Le ragondin|general|2",
    "Quel est le seul mammifère capable de voler activement ?|La chauve-souris|L’écureuil volant|Le phalanger volant|Le lémur volant|general|1",
    "Combien de cœurs possède la pieuvre ?|Trois|Un|Deux|Quatre|general|2",
    "Quel reptile est célèbre pour changer de couleur ?|Le caméléon|Le gecko|L’iguane|Le varan|general|1",
    "Quel est le plus grand félin sauvage du monde ?|Le tigre|Le lion|Le jaguar|Le puma|general|2",
    "Comment s’appelle le petit de la biche ?|Le faon|Le marcassin|Le chevreau|Le levraut|general|1",
    "Comment s’appelle la femelle du sanglier ?|La laie|La truie|La hase|La daine|general|2",
    "Quel insecte fabrique le miel ?|L’abeille|La guêpe|Le frelon|Le bourdon|general|1",
    "Quel animal construit des barrages sur les cours d’eau ?|Le castor|La loutre|Le ragondin|Le rat musqué|general|1",
    "Quel oiseau est le plus rapide du monde en piqué ?|Le faucon pèlerin|L’aigle royal|Le martinet noir|L’épervier|general|2",
    "Combien de branches possède généralement une étoile de mer ?|Cinq|Quatre|Six|Huit|general|1",
    "Quel est le plus grand animal pourvu de dents ?|Le cachalot|L’orque|Le grand requin blanc|L’éléphant de mer|general|3",
    "Quel est le plus grand reptile vivant actuellement ?|Le crocodile marin|Le dragon de Komodo|L’anaconda|La tortue luth|general|3",
    "Quel animal terrestre peut vivre plus de 150 ans ?|La tortue géante|L’éléphant|Le corbeau|Le chimpanzé|general|2",
    "Quel oiseau peut voler en marche arrière ?|Le colibri|L’hirondelle|Le martinet|Le rouge-gorge|general|2",
    "Combien de compartiments compte l’estomac de la vache ?|Quatre|Deux|Trois|Cinq|general|2",
    "Lequel de ces animaux est un marsupial ?|Le kangourou|Le castor|Le tatou|Le paresseux|general|1",
    "De quoi se nourrit principalement le panda géant ?|De bambou|De poisson|D’eucalyptus|De miel|general|1",
    "De quelles feuilles le koala se nourrit-il presque exclusivement ?|D’eucalyptus|De bambou|De chêne|D’acacia|general|1",
    "Quel pigment donne leur couleur verte aux plantes ?|La chlorophylle|Le carotène|La mélanine|La xanthophylle|general|1",
    "Quel gaz les plantes absorbent-elles pour la photosynthèse ?|Le dioxyde de carbone|L’oxygène|L’azote|Le méthane|general|2",
    "Quelle partie de la plante puise l’eau dans le sol ?|Les racines|Les feuilles|La tige|Les fleurs|general|1",
    "Quel arbre produit des glands ?|Le chêne|Le hêtre|Le châtaignier|Le noyer|general|1",
    "De quel arbre provient la châtaigne ?|Le châtaignier|Le marronnier|Le hêtre|Le noisetier|general|1",
    "Quelle espèce d’arbre peut dépasser 100 mètres de hauteur ?|Le séquoia|Le baobab|Le chêne|Le platane|general|2",
    "Comment qualifie-t-on un feuillage qui reste vert toute l’année ?|Persistant|Caduc|Annuel|Précoce|general|2",
    "Que transportent les abeilles de fleur en fleur pour les féconder ?|Le pollen|Le nectar|La sève|La rosée|general|1",
    "Quelle plante peut pousser de près d’un mètre en un seul jour ?|Le bambou|Le maïs|Le tournesol|La glycine|general|3",
    "Que peut-on estimer en comptant les cernes d’un tronc coupé ?|L’âge de l’arbre|Sa hauteur|Son espèce|Sa masse|general|1",
    "Quelle partie du champignon se développe sous terre ?|Le mycélium|Le chapeau|Les lamelles|Le pied|general|3",
    "La vanille est le fruit de quelle plante ?|Une orchidée|Un cactus|Un rosier|Un palmier|general|3",
    "Qui a composé l’opéra « La Flûte enchantée » ?|Wolfgang Amadeus Mozart|Ludwig van Beethoven|Joseph Haydn|Franz Schubert|general|2",
    "Que signifie l’expression « poser un lapin » ?|Ne pas venir à un rendez-vous|Mentir à quelqu’un|Faire une blague|Arriver très en retard|general|1",
    "Quel gâteau partage-t-on traditionnellement à l’Épiphanie ?|La galette des Rois|La bûche glacée|Le kouglof|Le millefeuille|general|1",
    "Combien de joueurs une équipe de football aligne-t-elle sur le terrain ?|Onze|Dix|Douze|Neuf|general|1",
    "Qui a écrit « Les Misérables » ?|Victor Hugo|Émile Zola|Honoré de Balzac|Gustave Flaubert|general|1",
    "Combien de cordes compte un violon ?|Quatre|Six|Cinq|Trois|general|2",
    "Que signifie l’expression « avoir le cafard » ?|Être triste|Avoir peur|Être en colère|Avoir sommeil|general|1",
    "De quelle région française la choucroute est-elle la spécialité ?|L’Alsace|La Lorraine|La Bretagne|La Bourgogne|general|1",
    "Quel maillot distingue le leader du Tour de France ?|Le maillot jaune|Le maillot vert|Le maillot à pois|Le maillot blanc|general|1",
    "Quel peintre impressionniste a peint la série des « Nymphéas » ?|Claude Monet|Édouard Manet|Auguste Renoir|Edgar Degas|general|2",
    "Qui a composé « Les Quatre Saisons » ?|Antonio Vivaldi|Jean-Sébastien Bach|Georg Friedrich Haendel|Arcangelo Corelli|general|2",
    "Que signifie un repas « frugal » ?|Un repas simple et léger|Un repas copieux|Un repas très épicé|Un repas coûteux|general|2",
    "Quel plat marseillais est une célèbre soupe de poissons ?|La bouillabaisse|La ratatouille|L’aïoli|La piperade|general|1",
    "En quelle année la France a-t-elle remporté sa première Coupe du monde de football ?|1998|1986|1994|2002|general|1",
    "Qui a écrit « Le Petit Prince » ?|Antoine de Saint-Exupéry|Jules Verne|Marcel Pagnol|André Gide|general|1",
    "Qui a composé le « Boléro » ?|Maurice Ravel|Claude Debussy|Erik Satie|Gabriel Fauré|general|2",
    "Quel est le pluriel du mot « cheval » ?|Des chevaux|Des chevals|Des chevaus|Des cheveaux|general|1",
    "De quelle région française la quiche tient-elle son nom ?|La Lorraine|L’Alsace|La Picardie|L’Auvergne|general|1",
    "Sur quelle surface se joue le tournoi de Roland-Garros ?|La terre battue|Le gazon|Le ciment|La moquette|general|1",
    "Qui a sculpté « Le Penseur » ?|Auguste Rodin|Camille Claudel|Antoine Bourdelle|Aristide Maillol|general|2",
    "Quel grand compositeur a continué d’écrire malgré sa surdité ?|Ludwig van Beethoven|Wolfgang Amadeus Mozart|Frédéric Chopin|Franz Liszt|general|1",
    "Que signifie « donner sa langue au chat » ?|Renoncer à deviner|Garder un secret|Refuser de parler|Dire une bêtise|general|1",
    "Quel fromage à pâte persillée est affiné dans l’Aveyron ?|Le roquefort|Le bleu d’Auvergne|La fourme d’Ambert|Le saint-nectaire|general|2",
    "Qui a écrit « Madame Bovary » ?|Gustave Flaubert|Stendhal|Guy de Maupassant|Émile Zola|general|2",
    "Qui a composé le ballet « Le Lac des cygnes » ?|Piotr Ilitch Tchaïkovski|Igor Stravinsky|Sergueï Prokofiev|Serge Rachmaninov|general|2",
    "Comment appelle-t-on un mot qui se lit dans les deux sens ?|Un palindrome|Une anagramme|Un acrostiche|Un homonyme|general|2",
    "Quelle fête, le 2 février, est l’occasion de faire des crêpes ?|La Chandeleur|L’Épiphanie|Mardi gras|La Toussaint|general|1",
    "Quelle ville a accueilli les premiers Jeux olympiques modernes en 1896 ?|Athènes|Paris|Londres|Rome|general|2",
    "Quel peintre s’est tranché une partie de l’oreille ?|Vincent van Gogh|Paul Gauguin|Paul Cézanne|Henri de Toulouse-Lautrec|general|1",
    "Qui a composé l’opéra « Carmen » ?|Georges Bizet|Charles Gounod|Jules Massenet|Jacques Offenbach|general|2",
    "Que signifie l’expression « tomber dans les pommes » ?|S’évanouir|Trébucher|Se tromper|S’endormir|general|1",
    "Que colle-t-on dans le dos des gens le 1er avril ?|Un poisson en papier|Une étoile en papier|Un cœur en papier|Un soleil en papier|general|1",
    "Combien d’anneaux figurent sur le drapeau olympique ?|Cinq|Quatre|Six|Trois|general|1",
    "Qui a écrit « Les Trois Mousquetaires » ?|Alexandre Dumas|Victor Hugo|Jules Verne|Théophile Gautier|general|1",
    "Pour quel instrument Frédéric Chopin a-t-il surtout composé ?|Le piano|Le violon|La harpe|L’orgue|general|2",
    "Que signifie le verbe « procrastiner » ?|Remettre au lendemain|Parler pour ne rien dire|Se plaindre sans cesse|Agir sans réfléchir|general|2",
    "Quel est l’ingrédient principal de la tapenade ?|Les olives|Les anchois|Les câpres|Les tomates séchées|general|2",
    "Combien de joueurs une équipe de volley-ball compte-t-elle sur le terrain ?|Six|Cinq|Sept|Huit|general|2",
    "Qui a peint « Guernica » ?|Pablo Picasso|Salvador Dalí|Joan Miró|Henri Matisse|general|2",
    "Qui a composé « Clair de lune », pièce de la Suite bergamasque ?|Claude Debussy|Maurice Ravel|Erik Satie|Gabriel Fauré|general|3",
    "Que signifie « en faire tout un fromage » ?|Exagérer un petit problème|Cuisiner longtemps|Se réjouir trop vite|Tout mélanger|general|1",
    "Quelle ville est surnommée la capitale du cassoulet ?|Castelnaudary|Albi|Montauban|Béziers|general|3",
    "Quel sport est à l’honneur lors du Vendée Globe ?|La voile|L’aviron|Le cyclisme|La natation|general|1",
    "Qui a écrit « L’Avare » et « Le Malade imaginaire » ?|Molière|Jean Racine|Pierre Corneille|Beaumarchais|general|1",
    "Qui a écrit les paroles et la musique de « La Marseillaise » ?|Rouget de Lisle|Hector Berlioz|François-Joseph Gossec|André Grétry|general|2",
    "Comment appelle-t-on deux mots de sens contraire ?|Des antonymes|Des synonymes|Des homonymes|Des paronymes|general|2",
    "Quelle farine utilise-t-on pour les galettes bretonnes salées ?|La farine de sarrasin|La farine de blé|La farine de maïs|La farine de seigle|general|2",
    "Quel sport de combat se pratique sur un ring ?|La boxe|Le judo|Le karaté|La lutte|general|1",
    "Qui a écrit « Vingt Mille Lieues sous les mers » ?|Jules Verne|Alexandre Dumas|Victor Hugo|Guy de Maupassant|general|1",
    "Quel compositeur autrichien est surnommé le « roi de la valse » ?|Johann Strauss fils|Franz Schubert|Gustav Mahler|Joseph Haydn|general|2",
    "Que signifie « avoir un poil dans la main » ?|Être paresseux|Être malchanceux|Être maladroit|Être avare|general|1",
    "Autour de quelles villes produit-on le champagne ?|Reims et Épernay|Dijon et Beaune|Bordeaux et Cognac|Angers et Saumur|general|2",
    "Quelle est la durée réglementaire d’un match de football ?|90 minutes|80 minutes|70 minutes|100 minutes|general|1",
    "Qui a peint « Le Cri » ?|Edvard Munch|Gustav Klimt|Egon Schiele|Vassily Kandinsky|general|2",
    "Qui a composé l’opéra « La Traviata » ?|Giuseppe Verdi|Giacomo Puccini|Gioachino Rossini|Gaetano Donizetti|general|3",
    "Que signifie le mot « ubiquité » ?|Le don d’être partout|Le don de tout retenir|Le don de convaincre|Le don de prévoir|general|3",
    "Qu’est-ce qu’une blanquette de veau ?|Un ragoût en sauce blanche|Une viande grillée|Une terrine froide|Une soupe de légumes|general|2",
    "Quel tournoi du Grand Chelem se joue sur gazon à Londres ?|Wimbledon|L’US Open|L’Open d’Australie|Roland-Garros|general|1",
    "Quel fabuliste a écrit « Le Corbeau et le Renard » ?|Jean de La Fontaine|Charles Perrault|Nicolas Boileau|Pierre de Ronsard|general|1",
    "À quelle famille d’instruments appartient le hautbois ?|Les bois|Les cuivres|Les cordes|Les percussions|general|2",
    "Que signifie « passer du coq à l’âne » ?|Changer brusquement de sujet|Se contredire|Parler trop fort|Mélanger les mots|general|1",
    "Quelle pâtisserie doit son nom à une course cycliste ?|Le paris-brest|Le saint-honoré|L’opéra|Le financier|general|3",
    "Quel pays a remporté la première Coupe du monde de football en 1930 ?|L’Uruguay|Le Brésil|L’Italie|L’Argentine|general|3",
    "Qui a écrit « Germinal » ?|Émile Zola|Guy de Maupassant|Honoré de Balzac|Victor Hugo|general|2",
    "Qui a composé le conte musical « Pierre et le Loup » ?|Sergueï Prokofiev|Piotr Ilitch Tchaïkovski|Igor Stravinsky|Dmitri Chostakovitch|general|3",
    "Que signifie « mettre la charrue avant les bœufs » ?|Agir dans le mauvais ordre|Travailler trop dur|Être très têtu|Avancer trop lentement|general|1",
    "De quelle ville les bêtises sont-elles la confiserie emblématique ?|Cambrai|Lille|Nancy|Rouen|general|3",
    "Combien de sets gagnants faut-il en Grand Chelem chez les messieurs ?|Trois|Deux|Quatre|Cinq|general|2",
    "Qui a peint le plafond de la chapelle Sixtine ?|Michel-Ange|Léonard de Vinci|Raphaël|Le Titien|general|2",
    "Quel monument parisien a été construit pour l’Exposition universelle de 1889 ?|La tour Eiffel|Le Grand Palais|L’Arc de triomphe|Le Sacré-Cœur|general|1",
    "Quel signe place-t-on sous le « c » pour obtenir un « ç » ?|Une cédille|Un tréma|Un accent grave|Une apostrophe|general|1",
    "De quelle région le camembert est-il originaire ?|La Normandie|La Bretagne|L’Auvergne|La Savoie|general|1",
    "Dans quel pays le judo a-t-il été inventé ?|Le Japon|La Chine|La Corée du Sud|La Thaïlande|general|1",
    "Qui a écrit la pièce « Cyrano de Bergerac » ?|Edmond Rostand|Alfred de Musset|Marcel Pagnol|Georges Feydeau|general|2",
    "Dans quelle ville se dresse le palais des Papes ?|Avignon|Arles|Nîmes|Carcassonne|general|2",
    "Que signifie « être médusé » ?|Être stupéfait|Être fatigué|Être vexé|Être enchanté|general|2",
    "Quel plat consiste à racler du fromage fondu sur des pommes de terre ?|La raclette|La fondue|La tartiflette|L’aligot|general|1",
    "Combien de trous compte un parcours de golf classique ?|Dix-huit|Douze|Vingt-quatre|Seize|general|1",
    "Dans quel musée parisien peut-on admirer la « Vénus de Milo » ?|Le Louvre|Le musée d’Orsay|Le Centre Pompidou|Le musée Rodin|general|2",
    "Quel roi de France a fait construire le château de Versailles ?|Louis XIV|Louis XV|Louis XVI|François Ier|general|1",
    "Que signifie « avoir la tête dans les nuages » ?|Être distrait|Être prétentieux|Être joyeux|Être inquiet|general|1",
    "Quel dessert en pyramide de choux couronne souvent les mariages ?|La pièce montée|Le fraisier|La charlotte|Le vacherin|general|1",
    "Quelle course à pied se dispute sur 42,195 kilomètres ?|Le marathon|Le semi-marathon|Le 10 000 mètres|Le cross-country|general|1",
    "Quel écrivain a créé le commissaire Maigret ?|Georges Simenon|Gaston Leroux|Maurice Leblanc|Frédéric Dard|general|2",
    "Sur quelle île se trouve la cathédrale Notre-Dame de Paris ?|L’île de la Cité|L’île Saint-Louis|L’île aux Cygnes|L’île Seguin|general|2",
    "Comment appelle-t-on une phrase sans verbe conjugué ?|Une phrase nominale|Une phrase passive|Une phrase relative|Une phrase impérative|general|3",
    "Que célèbre-t-on en France le 14 juillet ?|La fête nationale|L’armistice de 1918|La Saint-Jean|La fête du Travail|general|1",
    "Quel jeu oppose des boules d’acier autour d’un cochonnet ?|La pétanque|Le croquet|Le curling|Le bowling|general|1",
    "Quel château de la Loire possède un escalier à double révolution ?|Chambord|Chenonceau|Amboise|Azay-le-Rideau|general|2",
    "Que signifie distribuer « avec parcimonie » ?|En très petite quantité|En grande quantité|Sans faire attention|À contrecœur|general|2",
    "Quelle fleur porte-bonheur offre-t-on le 1er mai ?|Le muguet|La violette|Le mimosa|La jonquille|general|1",
    "Quel pays représentent les « All Blacks » au rugby ?|La Nouvelle-Zélande|L’Australie|L’Afrique du Sud|Les Fidji|general|1",
    "Qui a écrit le roman « L’Étranger » ?|Albert Camus|Jean-Paul Sartre|André Malraux|Marcel Proust|general|2",
    "Qui a écrit le recueil « Les Fleurs du mal » ?|Charles Baudelaire|Paul Verlaine|Arthur Rimbaud|Alphonse de Lamartine|general|2",
    "Qui a peint « La Jeune Fille à la perle » ?|Johannes Vermeer|Rembrandt|Pierre Paul Rubens|Jan van Eyck|general|2",
    "Quel dramaturge a écrit « Phèdre » et « Andromaque » ?|Jean Racine|Pierre Corneille|Molière|Marivaux|general|2",
    "Quel peintre est célèbre pour ses danseuses de ballet ?|Edgar Degas|Auguste Renoir|Paul Cézanne|Claude Monet|general|2",
    "Qui a réalisé « Les 400 Coups » (1959) ?|François Truffaut|Jean-Luc Godard|Claude Chabrol|Louis Malle|cinema|2",
    "Quel acteur incarne le gendarme Cruchot à Saint-Tropez ?|Louis de Funès|Bourvil|Fernandel|Michel Galabru|cinema|1",
    "Qui a réalisé « La Grande Vadrouille » (1966) ?|Gérard Oury|Claude Zidi|Georges Lautner|Yves Robert|cinema|2",
    "Qui joue Antoine Maréchal dans « Le Corniaud » (1965) ?|Bourvil|Fernandel|Jean Lefebvre|Pierre Richard|cinema|2",
    "Qui incarne Amélie Poulain dans le film de 2001 ?|Audrey Tautou|Marion Cotillard|Mélanie Laurent|Cécile de France|cinema|1",
    "Qui a réalisé « Le Fabuleux Destin d’Amélie Poulain » ?|Jean-Pierre Jeunet|Luc Besson|Cédric Klapisch|Michel Gondry|cinema|2",
    "Qui a réalisé « Le Grand Bleu » (1988) ?|Luc Besson|Jean-Jacques Annaud|Léos Carax|Jean-Jacques Beineix|cinema|2",
    "Dans « Léon », quelle future star débute dans le rôle de Mathilda ?|Natalie Portman|Milla Jovovich|Kirsten Dunst|Winona Ryder|cinema|2",
    "Qui joue Godefroy de Montmirail dans « Les Visiteurs » ?|Jean Reno|Christian Clavier|Gérard Jugnot|Thierry Lhermitte|cinema|1",
    "Quel acteur incarne Astérix dans « Mission Cléopâtre » (2002) ?|Christian Clavier|Édouard Baer|Clovis Cornillac|Guillaume Canet|cinema|2",
    "Qui a réalisé « Astérix et Obélix : Mission Cléopâtre » ?|Alain Chabat|Claude Zidi|Alexandre Astier|Michel Hazanavicius|cinema|1",
    "Qui incarne François Pignon dans « Le Dîner de cons » ?|Jacques Villeret|Thierry Lhermitte|Daniel Auteuil|Michel Blanc|cinema|2",
    "Quel réalisateur a signé « La Chèvre » et « Les Compères » ?|Francis Veber|Georges Lautner|Claude Sautet|Yves Robert|cinema|3",
    "De quelle troupe est issu « Le Père Noël est une ordure » ?|Le Splendid|Les Nuls|Les Inconnus|Les Charlots|cinema|2",
    "Dans quelle ville du Nord se déroule « Bienvenue chez les Ch’tis » ?|Bergues|Dunkerque|Lille|Arras|cinema|2",
    "Qui incarne Driss dans « Intouchables » (2011) ?|Omar Sy|Jamel Debbouze|Éric Judor|Fabrice Éboué|cinema|1",
    "Quel conte Jean Cocteau adapte-t-il en 1946 avec Jean Marais ?|La Belle et la Bête|Peau d’Âne|Cendrillon|La Barbe bleue|cinema|2",
    "Qui a réalisé « Le Salaire de la peur » (1953) ?|Henri-Georges Clouzot|Julien Duvivier|Marcel Carné|Jean Renoir|cinema|3",
    "Qui a réalisé « La Grande Illusion » (1937) ?|Jean Renoir|Marcel Carné|René Clair|Jean Grémillon|cinema|3",
    "Qui a réalisé « Les Enfants du paradis » (1945) ?|Marcel Carné|Jean Renoir|Jacques Becker|Sacha Guitry|cinema|3",
    "Quel acteur incarne Pépé le Moko en 1937 ?|Jean Gabin|Michel Simon|Raimu|Pierre Fresnay|cinema|3",
    "Chez Pagnol, qui tient le bar de la Marine dans « Marius » ?|César|Panisse|Escartefigue|Monsieur Brun|cinema|3",
    "Quel acteur incarne Don Camillo au cinéma ?|Fernandel|Bourvil|Raimu|Gino Cervi|cinema|2",
    "Qui a réalisé « À bout de souffle » (1960) ?|Jean-Luc Godard|Éric Rohmer|Jacques Rivette|Claude Chabrol|cinema|2",
    "Qui incarne Angélique, marquise des anges, en 1964 ?|Michèle Mercier|Brigitte Bardot|Mireille Darc|Marina Vlady|cinema|3",
    "Qui joue le rôle-titre du « Professionnel » (1981) ?|Jean-Paul Belmondo|Alain Delon|Lino Ventura|Jacques Dutronc|cinema|2",
    "Quel acteur français joue Tancrède dans « Le Guépard » (1963) ?|Alain Delon|Maurice Ronet|Jean-Louis Trintignant|Jean Sorel|cinema|3",
    "Qui incarne Cyrano de Bergerac dans le film de 1990 ?|Gérard Depardieu|Jacques Weber|Jean Rochefort|Daniel Auteuil|cinema|1",
    "Dans « Jean de Florette », qui incarne le Papet ?|Yves Montand|Daniel Auteuil|Gérard Depardieu|Michel Serrault|cinema|2",
    "Qui joue Manon dans « Manon des sources » (1986) ?|Emmanuelle Béart|Sophie Marceau|Juliette Binoche|Isabelle Adjani|cinema|2",
    "Quel film de 1980 révèle Sophie Marceau ?|La Boum|La Gifle|L’Effrontée|Le Grand Chemin|cinema|1",
    "Quelle actrice tient le rôle principal des « Parapluies de Cherbourg » ?|Catherine Deneuve|Françoise Dorléac|Anouk Aimée|Jeanne Moreau|cinema|2",
    "Qui a réalisé « Les Demoiselles de Rochefort » (1967) ?|Jacques Demy|Agnès Varda|Claude Lelouch|François Truffaut|cinema|2",
    "Qui a réalisé « Un homme et une femme » (1966) ?|Claude Lelouch|Claude Sautet|Claude Chabrol|Claude Berri|cinema|2",
    "Qui incarne OSS 117 chez Michel Hazanavicius ?|Jean Dujardin|Gilles Lellouche|Guillaume Canet|Benoît Poelvoorde|cinema|1",
    "Quel film français remporte l’Oscar du meilleur film en 2012 ?|The Artist|Intouchables|Amour|La Môme|cinema|2",
    "Quelle actrice reçoit un Oscar pour « La Môme » ?|Marion Cotillard|Audrey Tautou|Isabelle Adjani|Juliette Binoche|cinema|1",
    "Qui incarne le chauffeur Daniel dans « Taxi » (1998) ?|Samy Naceri|Frédéric Diefenthal|José Garcia|Kad Merad|cinema|2",
    "Quel film de Luc Besson (1997) met en scène Leeloo ?|Le Cinquième Élément|Nikita|Subway|Valérian|cinema|1",
    "Quel trio comique est à l’affiche de « La Cité de la peur » ?|Les Nuls|Le Splendid|Les Inconnus|Les Robins des Bois|cinema|2",
    "Qui a réalisé « Les Dents de la mer » (1975) ?|Steven Spielberg|George Lucas|John Carpenter|Ridley Scott|cinema|1",
    "Qui incarne Jack Dawson dans « Titanic » ?|Leonardo DiCaprio|Brad Pitt|Matt Damon|Johnny Depp|cinema|1",
    "Qui a réalisé « Psychose » (1960) ?|Alfred Hitchcock|Stanley Kubrick|Orson Welles|Billy Wilder|cinema|1",
    "Quel film d’Orson Welles (1941) s’ouvre sur le mot « Rosebud » ?|Citizen Kane|La Splendeur des Amberson|Le Procès|La Dame de Shanghai|cinema|3",
    "Qui incarne Vito Corleone dans « Le Parrain » (1972) ?|Marlon Brando|Al Pacino|Robert De Niro|James Caan|cinema|2",
    "Qui a réalisé « Le Parrain » ?|Francis Ford Coppola|Martin Scorsese|Brian De Palma|Sergio Leone|cinema|2",
    "Quel acteur incarne Rocky Balboa ?|Sylvester Stallone|Arnold Schwarzenegger|Dolph Lundgren|Bruce Willis|cinema|1",
    "Dans « Le Bon, la Brute et le Truand », qui joue le Bon ?|Clint Eastwood|Lee Van Cleef|Eli Wallach|Charles Bronson|cinema|2",
    "Qui a composé la musique du « Bon, la Brute et le Truand » ?|Ennio Morricone|Nino Rota|John Williams|Michel Legrand|cinema|2",
    "Qui réalise et joue dans « Le Dictateur » (1940) ?|Charlie Chaplin|Buster Keaton|Harold Lloyd|Stan Laurel|cinema|1",
    "Qui tient le rôle principal de « Chantons sous la pluie » ?|Gene Kelly|Fred Astaire|Frank Sinatra|Bing Crosby|cinema|3",
    "Quel film de 1939 suit Scarlett O’Hara ?|Autant en emporte le vent|Casablanca|Rebecca|Les Hauts de Hurlevent|cinema|2",
    "Dans « Casablanca », qui incarne Rick ?|Humphrey Bogart|Cary Grant|Clark Gable|James Stewart|cinema|2",
    "Qui a réalisé « 2001, l’Odyssée de l’espace » (1968) ?|Stanley Kubrick|Andreï Tarkovski|Robert Wise|Douglas Trumbull|cinema|2",
    "Qui joue la princesse dans « Vacances romaines » (1953) ?|Audrey Hepburn|Grace Kelly|Elizabeth Taylor|Leslie Caron|cinema|3",
    "Quel film de 1959 réunit Marilyn Monroe et Jack Lemmon ?|Certains l’aiment chaud|La Garçonnière|Sept Ans de réflexion|Sabrina|cinema|3",
    "Qui incarne Forrest Gump (1994) ?|Tom Hanks|Robin Williams|Kevin Costner|John Travolta|cinema|1",
    "Qui a réalisé « Pulp Fiction » (1994) ?|Quentin Tarantino|Robert Rodriguez|David Fincher|Oliver Stone|cinema|1",
    "Quel acteur joue Neo dans « Matrix » (1999) ?|Keanu Reeves|Will Smith|Tom Cruise|Brad Pitt|cinema|1",
    "En quelle année est sorti « E.T. l’extra-terrestre » ?|1982|1979|1985|1988|cinema|2",
    "Quel film de 1993 ressuscite les dinosaures au cinéma ?|Jurassic Park|Le Monde perdu|Godzilla|King Kong|cinema|1",
    "Quel acteur incarne le Terminator en 1984 ?|Arnold Schwarzenegger|Sylvester Stallone|Dolph Lundgren|Jean-Claude Van Damme|cinema|1",
    "Qui joue Hannibal Lecter dans « Le Silence des agneaux » ?|Anthony Hopkins|Jack Nicholson|Robert De Niro|Gary Oldman|cinema|2",
    "Quel réalisateur signe « Taxi Driver » et « Les Affranchis » ?|Martin Scorsese|Francis Ford Coppola|Brian De Palma|Michael Cimino|cinema|2",
    "Qui incarne Jake LaMotta dans « Raging Bull » ?|Robert De Niro|Al Pacino|Joe Pesci|Harvey Keitel|cinema|3",
    "Quel réalisateur japonais a signé « Les Sept Samouraïs » ?|Akira Kurosawa|Yasujiro Ozu|Kenji Mizoguchi|Takeshi Kitano|cinema|3",
    "Quel western de 1960 est le remake des « Sept Samouraïs » ?|Les Sept Mercenaires|La Horde sauvage|Rio Bravo|Le Train sifflera trois fois|cinema|3",
    "Qui joue la voisine dans « Sept Ans de réflexion » (1955) ?|Marilyn Monroe|Jayne Mansfield|Kim Novak|Grace Kelly|cinema|3",
    "Quel acteur incarne Batman chez Tim Burton (1989) ?|Michael Keaton|Val Kilmer|George Clooney|Christian Bale|cinema|3",
    "Qui joue le Joker dans « The Dark Knight » (2008) ?|Heath Ledger|Jack Nicholson|Jared Leto|Joaquin Phoenix|cinema|2",
    "Qui a réalisé « Inception » (2010) ?|Christopher Nolan|Denis Villeneuve|Ridley Scott|David Fincher|cinema|2",
    "Quel film de Ridley Scott (1979) se déroule sur le Nostromo ?|Alien|Blade Runner|Prometheus|Total Recall|cinema|1",
    "Qui incarne Ellen Ripley dans « Alien » ?|Sigourney Weaver|Linda Hamilton|Jamie Lee Curtis|Jodie Foster|cinema|2",
    "Quel film de danse avec Patrick Swayze sort en 1987 ?|Dirty Dancing|Footloose|Flashdance|Grease|cinema|1",
    "Quel est le premier long-métrage d’animation de Disney (1937) ?|Blanche-Neige et les Sept Nains|Pinocchio|Cendrillon|Bambi|cinema|2",
    "Dans « Le Roi Lion », qui est le père de Simba ?|Mufasa|Scar|Rafiki|Zazu|cinema|1",
    "Comment s’appelle le crabe dans « La Petite Sirène » ?|Sébastien|Polochon|Eurêka|Max|cinema|1",
    "Comment s’appelle le vizir maléfique dans « Aladdin » ?|Jafar|Iago|Razoul|Hadès|cinema|1",
    "Quel jouet astronaute accompagne Woody dans « Toy Story » ?|Buzz l’Éclair|Zurg|Rex|Bayonne|cinema|1",
    "Quel est le premier long-métrage des studios Pixar (1995) ?|Toy Story|1001 Pattes|Monstres et Cie|Le Monde de Nemo|cinema|1",
    "Dans « Le Monde de Nemo », qui est le poisson chirurgien bleu ?|Dory|Marin|Bulle|Gill|cinema|1",
    "Dans quel film Pixar le rat Rémy rêve-t-il de cuisine ?|Ratatouille|Là-haut|Luca|En avant|cinema|1",
    "Quel film Pixar (2009) fait voler une maison avec des ballons ?|Là-haut|Vice-versa|Coco|Rebelle|cinema|1",
    "Dans « Monstres et Cie », comment s’appelle le grand monstre bleu ?|Sulli|Bob|Léon|Germaine|cinema|2",
    "Qui a réalisé « Le Voyage de Chihiro » ?|Hayao Miyazaki|Isao Takahata|Mamoru Hosoda|Makoto Shinkai|cinema|2",
    "Dans quel film de Miyazaki apparaît le gros esprit gris Totoro ?|Mon voisin Totoro|Ponyo|Le Château ambulant|Princesse Mononoké|cinema|1",
    "Dans « Kiki la petite sorcière », quel animal accompagne Kiki ?|Un chat noir|Un hibou|Un corbeau|Un renard|cinema|2",
    "Quel studio japonais Miyazaki et Takahata ont-ils fondé ?|Le studio Ghibli|La Toei Animation|Madhouse|Gainax|cinema|2",
    "Comment s’appelle l’ours du « Livre de la jungle » de Disney ?|Baloo|Bagheera|Shere Khan|Kaa|cinema|1",
    "Dans « Peter Pan », comment s’appelle la fée ?|Clochette|Wendy|Lily la Tigresse|Crochet|cinema|1",
    "Quel éléphanteau Disney vole grâce à ses grandes oreilles ?|Dumbo|Tantor|Hathi|Babar|cinema|1",
    "Dans « Cendrillon » de Disney, que perd l’héroïne au bal ?|Une pantoufle de verre|Un gant|Un collier|Un éventail|cinema|1",
    "Quelle princesse Disney a de longs cheveux magiques (2010) ?|Raiponce|Elsa|Mérida|Vaiana|cinema|1",
    "Dans « La Reine des neiges », qui est le bonhomme de neige ?|Olaf|Sven|Kristoff|Hans|cinema|1",
    "Quel film d’animation français de 2003 suit un cycliste du Tour ?|Les Triplettes de Belleville|Kirikou et la Sorcière|Azur et Asmar|Le Roi et l’Oiseau|cinema|3",
    "Qui a réalisé « Kirikou et la Sorcière » (1998) ?|Michel Ocelot|Sylvain Chomet|René Laloux|Paul Grimault|cinema|3",
    "Dans « Wall-E », comment s’appelle le robot aimé de Wall-E ?|EVE|AUTO|M-O|BURN-E|cinema|2",
    "Dans « Vice-versa », quelle émotion est de couleur bleue ?|Tristesse|Joie|Colère|Dégoût|cinema|1",
    "Dans « La Belle et la Bête » de Disney, quel objet est Lumière ?|Un chandelier|Une pendule|Une théière|Une plume|cinema|2",
    "En quelle année est sorti le premier « Star Wars » ?|1977|1975|1980|1983|cinema|2",
    "Qui incarne Han Solo dans la première trilogie Star Wars ?|Harrison Ford|Mark Hamill|Billy Dee Williams|Peter Mayhew|cinema|1",
    "Comment s’appelle le copilote wookiee de Han Solo ?|Chewbacca|Jabba|Greedo|Bossk|cinema|1",
    "Quel petit maître Jedi vert forme Luke sur Dagobah ?|Yoda|Obi-Wan Kenobi|Mace Windu|Qui-Gon Jinn|cinema|1",
    "Dans la saga Star Wars, qui est le père de Luke Skywalker ?|Dark Vador|L’empereur Palpatine|Obi-Wan Kenobi|Le comte Dooku|cinema|1",
    "Quel épisode de Star Wars sort au cinéma en 1999 ?|La Menace fantôme|L’Attaque des clones|Le Retour du Jedi|Un nouvel espoir|cinema|2",
    "Qui a créé la saga Star Wars ?|George Lucas|Steven Spielberg|James Cameron|Gene Roddenberry|cinema|1",
    "Quel petit droïde bleu et blanc accompagne les héros de Star Wars ?|R2-D2|C-3PO|BB-8|IG-88|cinema|1",
    "Quel vaisseau Han Solo pilote-t-il ?|Le Faucon Millenium|L’Étoile de la mort|Le Star Destroyer|L’Executor|cinema|1",
    "Quelle maison de Poudlard a le lion pour emblème ?|Gryffondor|Serpentard|Serdaigle|Poufsouffle|cinema|1",
    "Quel acteur incarne Harry Potter au cinéma ?|Daniel Radcliffe|Rupert Grint|Tom Felton|Eddie Redmayne|cinema|1",
    "Quel est le sous-titre du premier film Harry Potter ?|À l’école des sorciers|La Chambre des secrets|La Coupe de feu|L’Ordre du phénix|cinema|1",
    "Quel acteur incarne le demi-géant Hagrid ?|Robbie Coltrane|Brendan Gleeson|Michael Gambon|Timothy Spall|cinema|3",
    "Qui joue le professeur Rogue dans la saga Harry Potter ?|Alan Rickman|Gary Oldman|Ralph Fiennes|Jason Isaacs|cinema|2",
    "Comment s’appelle la chouette de Harry Potter ?|Hedwige|Errol|Coquecigrue|Pattenrond|cinema|1",
    "Quel sport se joue sur des balais volants chez Harry Potter ?|Le Quidditch|Le Souafle|Le Cognard|Le Vif d’or|cinema|1",
    "Quel acteur fut le premier James Bond au cinéma ?|Sean Connery|Roger Moore|George Lazenby|David Niven|cinema|1",
    "Quel est le premier film de la saga James Bond (1962) ?|James Bond 007 contre Dr No|Goldfinger|Bons Baisers de Russie|Opération Tonnerre|cinema|3",
    "Quel matricule désigne James Bond ?|007|006|008|009|cinema|1",
    "Quel acteur incarne James Bond dans « GoldenEye » (1995) ?|Pierce Brosnan|Timothy Dalton|Daniel Craig|Roger Moore|cinema|2",
    "Dans quelle saga suit-on Frodon et l’Anneau unique ?|Le Seigneur des anneaux|Le Hobbit|Narnia|Eragon|cinema|1",
    "Qui a réalisé la trilogie « Le Seigneur des anneaux » ?|Peter Jackson|Guillermo del Toro|Sam Raimi|James Cameron|cinema|2",
    "Quel acteur incarne le magicien Gandalf ?|Ian McKellen|Christopher Lee|Patrick Stewart|Michael Gambon|cinema|2",
    "Quelle créature suit Frodon pour reprendre l’Anneau ?|Gollum|Sauron|Saroumane|Grima|cinema|1",
    "Quel héros archéologue Harrison Ford incarne-t-il dès 1981 ?|Indiana Jones|Allan Quatermain|Benjamin Gates|Rick O’Connell|cinema|1",
    "Dans « Retour vers le futur », quelle voiture voyage dans le temps ?|Une DeLorean|Une Mustang|Une Cadillac|Une Corvette|cinema|1",
    "Qui incarne Marty McFly dans « Retour vers le futur » ?|Michael J. Fox|Christopher Lloyd|Matthew Broderick|Charlie Sheen|cinema|1",
    "Qui incarne Ethan Hunt dans « Mission : impossible » ?|Tom Cruise|Brad Pitt|Matt Damon|Keanu Reeves|cinema|1",
    "Quel agent amnésique Matt Damon incarne-t-il au cinéma ?|Jason Bourne|Jack Ryan|Ethan Hunt|Jack Bauer|cinema|2",
    "Qui joue Jack Sparrow dans « Pirates des Caraïbes » ?|Johnny Depp|Orlando Bloom|Geoffrey Rush|Javier Bardem|cinema|1",
    "Dans Friends, quel est le métier de Ross Geller ?|Paléontologue|Architecte|Avocat|Dentiste|series|2",
    "Dans Friends, comment s’appelle le café où se retrouvent les six amis ?|Central Perk|Central Park|Le Moondance|Le Java Bleu|series|1",
    "Dans Friends, quel est le titre de la chanson fétiche de Phoebe ?|Smelly Cat|Lonely Cat|Dirty Dog|Happy Rat|series|2",
    "Quelle actrice incarne Rachel Green dans Friends ?|Jennifer Aniston|Courteney Cox|Lisa Kudrow|Meg Ryan|series|1",
    "Dans quelle ville se déroule la série Friends ?|New York|Los Angeles|Chicago|Boston|series|1",
    "Dans Friends, comment s’appelle le singe adopté par Ross ?|Marcel|Gaston|Coco|Pepito|series|2",
    "Dans Friends, quel personnage Monica finit-elle par épouser ?|Chandler|Joey|Richard|Pete|series|2",
    "Quel acteur incarne le lieutenant Columbo ?|Peter Falk|Telly Savalas|Peter Sellers|Karl Malden|series|2",
    "Quel vêtement froissé Columbo porte-t-il en toutes circonstances ?|Un imperméable|Un smoking|Une cape|Un blouson de cuir|series|1",
    "Quelle voiture conduit le lieutenant Columbo ?|Une Peugeot 403|Une Renault 4|Une Citroën DS|Une Coccinelle|series|2",
    "De qui Columbo parle-t-il sans cesse alors qu’on ne la voit jamais à l’écran ?|Sa femme|Sa fille|Sa sœur|Sa voisine|series|1",
    "Que fume très souvent Columbo pendant ses enquêtes ?|Un cigare|Une pipe|Des cigarettes|Du tabac à chiquer|series|2",
    "Quelle est la spécialité du docteur House ?|Le diagnostic|La chirurgie|La cardiologie|La pédiatrie|series|2",
    "Quel acteur britannique incarne le docteur House ?|Hugh Laurie|Hugh Grant|Rowan Atkinson|Colin Firth|series|1",
    "Avec quel accessoire le docteur House se déplace-t-il ?|Une canne|Des béquilles|Un déambulateur|Un fauteuil roulant|series|1",
    "Quel antidouleur le docteur House consomme-t-il en excès ?|La Vicodin|L’aspirine|Le paracétamol|L’ibuprofène|series|2",
    "Quel personnage dirige l’hôpital dans Dr House ?|Lisa Cuddy|Allison Cameron|Stacy Warner|Remy Hadley|series|3",
    "Quel métier exerce Walter White au début de Breaking Bad ?|Professeur de chimie|Professeur de physique|Pharmacien|Ingénieur chimiste|series|1",
    "Dans quelle ville se déroule Breaking Bad ?|Albuquerque|Phoenix|El Paso|Tucson|series|2",
    "Quel pseudonyme Walter White adopte-t-il dans Breaking Bad ?|Heisenberg|Einstein|Oppenheimer|Mendeleïev|series|2",
    "Quelle chaîne de poulet frit sert de couverture à Gus Fring ?|Los Pollos Hermanos|El Pollo Loco|Los Hermanos Fritos|Pollos del Sol|series|3",
    "Quel acteur incarne Walter White dans Breaking Bad ?|Bryan Cranston|Aaron Paul|Bob Odenkirk|Dean Norris|series|2",
    "Quelle série dérivée de Breaking Bad est consacrée à l’avocat Saul ?|Better Call Saul|El Camino|Ozark|Sneaky Pete|series|1",
    "Comment s’appelle le trône convoité dans Game of Thrones ?|Le Trône de Fer|Le Trône d’Or|Le Trône de Glace|Le Trône d’Ébène|series|1",
    "Quelle famille règne sur Winterfell dans Game of Thrones ?|Les Stark|Les Lannister|Les Targaryen|Les Baratheon|series|1",
    "Quel animal figure sur le blason des Lannister ?|Le lion|Le loup|Le cerf|Le dragon|series|2",
    "Quel personnage de Game of Thrones est surnommé la Mère des Dragons ?|Daenerys Targaryen|Cersei Lannister|Sansa Stark|Arya Stark|series|1",
    "Quel acteur incarne Tyrion Lannister dans Game of Thrones ?|Peter Dinklage|Kit Harington|Sean Bean|Charles Dance|series|2",
    "Quelle construction géante protège le nord de Westeros ?|Le Mur|La Citadelle|Le Rempart d’Hiver|La Porte Noire|series|1",
    "Quel écrivain est l’auteur de la saga adaptée dans Game of Thrones ?|George R. R. Martin|J. R. R. Tolkien|Stephen King|Terry Brooks|series|2",
    "Qui a créé la série Kaamelott et y interprète le roi Arthur ?|Alexandre Astier|Simon Astier|Lionnel Astier|Jean-Christophe Hembert|series|1",
    "Dans Kaamelott, quel objet sacré les chevaliers recherchent-ils ?|Le Graal|Excalibur|Le Saint Suaire|La Toison d’or|series|1",
    "Dans Kaamelott, quel chevalier ne pense qu’à la nourriture ?|Karadoc|Bohort|Léodagan|Calogrenant|series|2",
    "Dans Kaamelott, de quel pays Perceval est-il originaire ?|Le Pays de Galles|La Carmélide|L’Aquitaine|L’Orcanie|series|3",
    "Dans Kaamelott, quel chevalier amoureux de Guenièvre finit par trahir Arthur ?|Lancelot|Perceval|Gauvain|Bohort|series|2",
    "Sur quelle chaîne la série Kaamelott a-t-elle été diffusée à l’origine ?|M6|TF1|France 2|Canal+|series|2",
    "Dans quelle ville se déroule Plus belle la vie ?|Marseille|Nice|Toulon|Montpellier|series|1",
    "Comment s’appelle le quartier fictif de Plus belle la vie ?|Le Mistral|Le Panier|La Joliette|Endoume|series|2",
    "Sur quelle chaîne Plus belle la vie a-t-elle été diffusée à ses débuts ?|France 3|TF1|France 2|M6|series|2",
    "En quelle année la série Plus belle la vie a-t-elle débuté ?|2004|1998|2007|2010|series|3",
    "Dans quelle ville vit la famille Simpson ?|Springfield|Shelbyville|Springville|Ogdenville|series|1",
    "Où travaille Homer Simpson ?|À la centrale nucléaire|À la brasserie Duff|Au Kwik-E-Mart|À la mairie|series|1",
    "Qui est le patron d’Homer Simpson ?|M. Burns|M. Smithers|Ned Flanders|Le principal Skinner|series|1",
    "De quel instrument joue Lisa Simpson ?|Le saxophone|La clarinette|La trompette|Le violon|series|2",
    "Comment s’appelle le voisin très croyant des Simpson ?|Ned Flanders|Barney Gumble|Lenny Leonard|Seymour Skinner|series|2",
    "Comment s’appelle le barman chez qui Homer boit sa bière ?|Moe|Barney|Lenny|Carl|series|2",
    "Qui est le créateur de la série Les Simpson ?|Matt Groening|Seth MacFarlane|Mike Judge|Trey Parker|series|2",
    "Quel acteur joue Sherlock Holmes dans la série Sherlock ?|Benedict Cumberbatch|Tom Hiddleston|Eddie Redmayne|Matt Smith|series|1",
    "Quel acteur incarne le docteur Watson dans la série Sherlock ?|Martin Freeman|Rupert Graves|Mark Gatiss|Andrew Scott|series|2",
    "À quelle adresse vit Sherlock Holmes à Londres ?|221B Baker Street|10 Downing Street|221C Baker Street|12 Oxford Street|series|1",
    "Qui est le grand ennemi de Sherlock dans la série ?|Moriarty|Magnussen|Mycroft|Lestrade|series|1",
    "Quel écrivain a créé le personnage de Sherlock Holmes ?|Arthur Conan Doyle|Agatha Christie|Charles Dickens|Oscar Wilde|series|1",
    "Dans quelle petite ville américaine se déroule Stranger Things ?|Hawkins|Derry|Hill Valley|Riverdale|series|2",
    "Comment appelle-t-on la dimension parallèle dans Stranger Things ?|Le Monde à l’Envers|Le Monde d’en Bas|L’Autre Rive|La Zone Sombre|series|1",
    "À quel jeu de rôle jouent Mike et ses amis dans Stranger Things ?|Donjons et Dragons|Warhammer|Magic|Les Loups-garous|series|2",
    "Quel monstre menace Hawkins dans la saison 1 de Stranger Things ?|Le Démogorgon|Le Flagelleur Mental|Vecna|Le Kraken|series|2",
    "Quelle actrice incarne Eleven dans Stranger Things ?|Millie Bobby Brown|Sadie Sink|Natalia Dyer|Maya Hawke|series|2",
    "Dans quelle décennie se déroule l’action de Stranger Things ?|Les années 1980|Les années 1970|Les années 1990|Les années 1960|series|1",
    "Quel bâtiment les braqueurs occupent-ils au début de La Casa de Papel ?|La Fabrique de la monnaie|La Banque d’Espagne|Le Musée du Prado|La Bourse de Madrid|series|2",
    "Comment est surnommé le cerveau des braquages de La Casa de Papel ?|Le Professeur|Le Docteur|Le Maestro|L’Architecte|series|1",
    "Quels noms de code portent les braqueurs de La Casa de Papel ?|Des noms de villes|Des noms de couleurs|Des noms de planètes|Des noms d’animaux|series|1",
    "Quel artiste a inspiré les masques de La Casa de Papel ?|Salvador Dalí|Pablo Picasso|Frida Kahlo|Joan Miró|series|1",
    "Quel chant italien est devenu l’hymne de La Casa de Papel ?|Bella Ciao|O Sole Mio|Funiculì Funiculà|Volare|series|1",
    "Quel pays a produit la série La Casa de Papel ?|L’Espagne|Le Mexique|L’Italie|L’Argentine|series|1",
    "Quelle humoriste incarne Joséphine, ange gardien ?|Mimie Mathy|Michèle Bernier|Josiane Balasko|Chantal Ladesou|series|1",
    "Quel geste fait Joséphine, ange gardien, pour user de sa magie ?|Elle claque des doigts|Elle cligne des yeux|Elle souffle une poudre|Elle agite une baguette|series|1",
    "Quel acteur incarne le commissaire Navarro à la télévision ?|Roger Hanin|Victor Lanoux|Pierre Mondy|Jean Rochefort|series|2",
    "Quelle actrice incarne la commissaire Julie Lescaut ?|Véronique Genest|Corinne Touzet|Ingrid Chauvin|Astrid Veillon|series|2",
    "Quel couple d’acteurs est au cœur de la série Un gars, une fille ?|Jean Dujardin et Alexandra Lamy|Franck Dubosc et Julie Gayet|Dany Boon et Judith Godrèche|José Garcia et Karin Viard|series|1",
    "Quels surnoms se donnent les héros d’Un gars, une fille ?|Chouchou et Loulou|Doudou et Bibiche|Chaton et Nounours|Poussin et Câlin|series|1",
    "Quelle actrice tient le rôle principal d’Hélène et les Garçons ?|Hélène Rollès|Laure Guibert|Cathy Andrieu|Rochelle Redfield|series|1",
    "Dans la série H, quel rôle joue Jamel Debbouze ?|Un standardiste|Un aide-soignant|Un chirurgien|Un infirmier|series|3",
    "Autour de quel objet se déroulent les scènes de Caméra Café ?|La machine à café|La photocopieuse|La fontaine à eau|Le distributeur de snacks|series|1",
    "Quelles familles sont au centre de Fais pas ci, fais pas ça ?|Les Lepic et les Bouley|Les Martin et les Girard|Les Morel et les Dupré|Les Blanc et les Rivière|series|3",
    "Quel est le métier des héros de la série Dix pour cent ?|Agents d’artistes|Producteurs de films|Attachés de presse|Scénaristes|series|2",
    "Quelle est la nationalité de Jacques Brel ?|Belge|Française|Suisse|Canadienne|musique|1",
    "De quelle ville anglaise viennent les Beatles ?|Liverpool|Londres|Manchester|Birmingham|musique|1",
    "Combien de lignes compte une portée musicale ?|Cinq|Quatre|Six|Trois|musique|1",
    "Qui était le chanteur du groupe Queen ?|Freddie Mercury|Brian May|Roger Taylor|John Deacon|musique|1",
    "Qui chante « Ne me quitte pas » ?|Jacques Brel|Charles Aznavour|Léo Ferré|Serge Gainsbourg|musique|1",
    "De quel pays vient le groupe ABBA ?|La Suède|La Norvège|Le Danemark|Les Pays-Bas|musique|1",
    "Qui a écrit et chante « Mistral gagnant » ?|Renaud|Alain Souchon|Maxime Le Forestier|Hubert-Félix Thiéfaine|musique|1",
    "Quelle clé est la plus utilisée en musique ?|La clé de sol|La clé de fa|La clé d’ut|La clé de mi|musique|1",
    "Quel était le surnom d’Édith Piaf ?|La Môme Piaf|La Gitane|L’Hirondelle|La Fauvette|musique|1",
    "Qui est le chanteur des Rolling Stones ?|Mick Jagger|Keith Richards|Charlie Watts|Ronnie Wood|musique|1",
    "Combien de cordes compte une guitare classique ?|Six|Quatre|Cinq|Sept|musique|1",
    "Avec qui Jean-Jacques Goldman chante-t-il « Je te donne » ?|Michael Jones|Carole Fredericks|Phil Collins|Murray Head|musique|2",
    "Quel groupe interprète « Bohemian Rhapsody » ?|Queen|Led Zeppelin|The Who|Genesis|musique|1",
    "Qui interprète « La Bohème » ?|Charles Aznavour|Yves Montand|Gilbert Bécaud|Serge Reggiani|musique|1",
    "Quelle note vient juste après le mi dans la gamme ?|Fa|Sol|Ré|La|musique|1",
    "Quel est le vrai nom de Johnny Hallyday ?|Jean-Philippe Smet|Claude Moine|Daniel Bevilacqua|Hervé Forneri|musique|1",
    "Quel chanteur est surnommé « le Roi de la pop » ?|Michael Jackson|Prince|Elvis Presley|Stevie Wonder|musique|1",
    "Quel instrument est l’emblème musical de l’Écosse ?|La cornemuse|Le fifre|Le banjo|La mandoline|musique|1",
    "Qui chante « Allumer le feu » ?|Johnny Hallyday|Eddy Mitchell|Michel Sardou|Renaud|musique|1",
    "Dans quelle ville Georges Brassens est-il né ?|Sète|Marseille|Perpignan|Toulon|musique|2",
    "Qui était le batteur des Beatles ?|Ringo Starr|John Lennon|Paul McCartney|George Harrison|musique|2",
    "Quelle est la nationalité de Jean-Sébastien Bach ?|Allemande|Autrichienne|Italienne|Française|musique|1",
    "Combien de musiciens composent un quatuor ?|Quatre|Trois|Cinq|Deux|musique|1",
    "De quel pays la famille de Charles Aznavour était-elle originaire ?|L’Arménie|La Grèce|Le Liban|La Géorgie|musique|1",
    "Avec quelle chanson ABBA a-t-il remporté l’Eurovision en 1974 ?|Waterloo|Dancing Queen|Mamma Mia|SOS|musique|2",
    "Qui a composé « La Lettre à Élise » ?|Beethoven|Chopin|Schumann|Liszt|musique|2",
    "Quel symbole abaisse une note d’un demi-ton ?|Le bémol|Le dièse|Le bécarre|Le soupir|musique|2",
    "Avec qui Serge Gainsbourg a-t-il sorti « Je t’aime… moi non plus » en 1969 ?|Jane Birkin|Brigitte Bardot|France Gall|Françoise Hardy|musique|1",
    "Quel style de musique Bob Marley a-t-il popularisé dans le monde ?|Le reggae|Le zouk|La salsa|Le funk|musique|1",
    "Qui a écrit et chanté « La Mer » ?|Charles Trenet|Maurice Chevalier|Tino Rossi|Bourvil|musique|2",
    "Dans quelle ville Mozart est-il né ?|Salzbourg|Vienne|Prague|Munich|musique|2",
    "À quelle famille d’instruments appartient la trompette ?|Les cuivres|Les bois|Les cordes|Les percussions|musique|1",
    "Avec quelle chanson France Gall a-t-elle gagné l’Eurovision 1965 ?|Poupée de cire, poupée de son|Laisse tomber les filles|Les Sucettes|Sacré Charlemagne|musique|2",
    "Quel appareil sert à battre régulièrement le tempo ?|Le métronome|Le diapason|Le chronomètre|L’accordeur|musique|1",
    "Quelle chanson de Claude François a été adaptée en « My Way » ?|Comme d’habitude|Cette année-là|Le Lundi au soleil|Magnolias for Ever|musique|2",
    "Qui chante « Imagine » ?|John Lennon|Paul McCartney|George Harrison|Bob Dylan|musique|1",
    "De quel continent le djembé est-il originaire ?|L’Afrique|L’Asie|L’Amérique du Sud|L’Océanie|musique|1",
    "Dans quel pays Dalida est-elle née ?|En Égypte|En Italie|En Tunisie|Au Liban|musique|2",
    "Quel groupe a sorti l’album « The Dark Side of the Moon » ?|Pink Floyd|Deep Purple|Genesis|Yes|musique|2",
    "Quelle est la nationalité d’origine de Frédéric Chopin ?|Polonaise|Hongroise|Russe|Tchèque|musique|1",
    "Que fait un dièse placé devant une note ?|Il la monte d’un demi-ton|Il la baisse d’un demi-ton|Il la monte d’un ton|Il double sa durée|musique|2",
    "Qui interprète à l’origine « Je l’aime à mourir » ?|Francis Cabrel|Michel Fugain|Yves Duteil|Julien Clerc|musique|1",
    "Comment s’appelle la célèbre résidence d’Elvis Presley ?|Graceland|Neverland|Dollywood|Wonderland|musique|2",
    "Qui chante « L’Aziza » ?|Daniel Balavoine|Michel Berger|Jean-Jacques Goldman|Bernard Lavilliers|musique|2",
    "Combien de touches compte un piano moderne ?|88|76|96|102|musique|2",
    "Qui chante « Les Champs-Élysées » ?|Joe Dassin|Salvatore Adamo|Frank Alamo|Richard Anthony|musique|1",
    "De quel pays vient le groupe U2 ?|L’Irlande|L’Écosse|L’Angleterre|L’Australie|musique|1",
    "Qui chante « L’Aigle noir » ?|Barbara|Juliette Gréco|Anne Sylvestre|Nicole Croisille|musique|2",
    "Combien de noires vaut une ronde ?|Quatre|Deux|Trois|Huit|musique|2",
    "Qui était le chanteur du groupe The Police ?|Sting|Phil Collins|Peter Gabriel|Rod Stewart|musique|1",
    "Qui chante « Les Lacs du Connemara » ?|Michel Sardou|Michel Delpech|Serge Lama|Gérard Lenorman|musique|1",
    "Qui a inventé le saxophone ?|Adolphe Sax|Theobald Boehm|Bartolomeo Cristofori|Henri Selmer|musique|1",
    "Qui interprète « Avec le temps » ?|Léo Ferré|Jacques Brel|Georges Moustaki|Serge Reggiani|musique|2",
    "Quelle chanteuse est surnommée « la Reine de la soul » ?|Aretha Franklin|Diana Ross|Tina Turner|Ella Fitzgerald|musique|1",
    "Qui a composé « Le Carnaval des animaux » ?|Camille Saint-Saëns|Hector Berlioz|Georges Bizet|César Franck|musique|2",
    "Que signifie l’indication « fortissimo » ?|Très fort|Très doux|Très rapide|Très lent|musique|1",
    "Qui était le chanteur de Nirvana ?|Kurt Cobain|Eddie Vedder|Chris Cornell|Dave Grohl|musique|1",
    "Qui chante « Foule sentimentale » ?|Alain Souchon|Laurent Voulzy|Julien Clerc|Étienne Daho|musique|2",
    "Que signifie l’indication de tempo « adagio » ?|Lent|Rapide|Modéré|Très vif|musique|2",
    "Quel duo interprète « The Sound of Silence » ?|Simon et Garfunkel|Les Everly Brothers|Hall et Oates|Sonny et Cher|musique|2",
    "Pour quel pays Céline Dion a-t-elle gagné l’Eurovision en 1988 ?|La Suisse|Le Canada|La France|Monaco|musique|2",
    "Quel est le plus grand instrument à cordes frottées ?|La contrebasse|Le violoncelle|L’alto|La harpe|musique|1",
    "Avec quel parolier Michel Berger a-t-il créé « Starmania » ?|Luc Plamondon|Étienne Roda-Gil|Jean-Loup Dabadie|Boris Bergman|musique|3",
    "Quel groupe chante « Stayin’ Alive » ?|Les Bee Gees|Boney M|Les Jackson Five|Earth Wind and Fire|musique|1",
    "Qui a composé « La Chevauchée des Walkyries » ?|Richard Wagner|Richard Strauss|Gustav Mahler|Anton Bruckner|musique|2",
    "Quelle ville Claude Nougaro chante-t-il dans une célèbre chanson ?|Toulouse|Marseille|Bordeaux|Montauban|musique|1",
    "Comment appelle-t-on la voix d’homme la plus grave ?|La basse|Le baryton|Le ténor|Le contre-ténor|musique|2",
    "Qui chante « Il est cinq heures, Paris s’éveille » ?|Jacques Dutronc|Serge Gainsbourg|Michel Polnareff|Antoine|musique|1",
    "De quel instrument jouait Louis Armstrong ?|La trompette|Le saxophone|La clarinette|Le trombone|musique|1",
    "Quelle symphonie de Beethoven contient l’« Ode à la joie » ?|La Neuvième|La Cinquième|La Troisième|La Septième|musique|2",
    "Qui chante « Tous les garçons et les filles » ?|Françoise Hardy|Sylvie Vartan|Sheila|France Gall|musique|2",
    "Quels instruments fabriquait le luthier Antonio Stradivari ?|Des violons|Des pianos|Des flûtes|Des orgues|musique|1",
    "Qui a écrit les paroles de la chanson « Les Feuilles mortes » ?|Jacques Prévert|Boris Vian|Louis Aragon|Jean Cocteau|musique|3",
    "Qui chante « Like a Prayer » ?|Madonna|Whitney Houston|Cyndi Lauper|Tina Turner|musique|1",
    "Qui a composé les trois « Gymnopédies » pour piano ?|Erik Satie|Claude Debussy|Francis Poulenc|Darius Milhaud|musique|2",
    "Quelle chanteuse a connu le succès à 14 ans avec « Joe le taxi » ?|Vanessa Paradis|Elsa|Lio|Jeanne Mas|musique|1",
    "D’où vient le ukulélé ?|De Hawaï|De Tahiti|De Cuba|Du Mexique|musique|2",
    "À quelle chanteuse de jazz « Ella, elle l’a » rend-elle hommage ?|Ella Fitzgerald|Billie Holiday|Nina Simone|Sarah Vaughan|musique|2",
    "Quel chanteur a créé le personnage de Ziggy Stardust ?|David Bowie|Lou Reed|Iggy Pop|Mick Jagger|musique|2",
    "Quel compositeur a laissé une célèbre symphonie dite « Inachevée » ?|Franz Schubert|Robert Schumann|Johannes Brahms|Joseph Haydn|musique|3",
    "De quelle comédie musicale est tirée la chanson « Belle » (1998) ?|Notre-Dame de Paris|Starmania|Roméo et Juliette|Les Dix Commandements|musique|1",
    "Comment s’appelle le silence qui dure autant qu’une noire ?|Le soupir|La pause|La demi-pause|Le quart de soupir|musique|3",
    "Qui interprète « Le Sud » ?|Nino Ferrer|Christophe|Michel Polnareff|Joe Dassin|musique|2",
    "De quel instrument Jimi Hendrix était-il un virtuose ?|La guitare électrique|La basse|La batterie|L’harmonica|musique|1",
    "Quel instrument est roi dans les bals musette ?|L’accordéon|Le violon|La clarinette|Le banjo|musique|1",
    "Qui a écrit « Pour que tu m’aimes encore » pour Céline Dion ?|Jean-Jacques Goldman|Michel Berger|Luc Plamondon|Pascal Obispo|musique|2",
    "Comment appelle-t-on la voix de femme la plus aiguë ?|Soprano|Alto|Mezzo-soprano|Contralto|musique|1",
    "De quel pays vient le duo électro Daft Punk ?|La France|Les États-Unis|L’Allemagne|La Belgique|musique|1",
    "Combien de demi-tons compte une octave ?|Douze|Dix|Huit|Quatorze|musique|3",
    "Qui chante « La Montagne » ?|Jean Ferrat|Georges Brassens|Léo Ferré|Marcel Amont|musique|2",
    "Quel groupe français chante « L’Aventurier » ?|Indochine|Téléphone|Noir Désir|Trust|musique|1",
    "Quel compositeur a écrit le célèbre galop du french cancan ?|Jacques Offenbach|Johann Strauss|Emmanuel Chabrier|André Messager|musique|3",
    "Quel instrument à vent est emblématique des Aborigènes d’Australie ?|Le didgeridoo|L’ocarina|La flûte de Pan|Le duduk|musique|1",
    "Qui était le chanteur du groupe Téléphone ?|Jean-Louis Aubert|Louis Bertignac|Nicola Sirkis|Alain Bashung|musique|2",
    "Quel était le surnom du compositeur Antonio Vivaldi ?|Le Prêtre roux|Le Moine noir|Le Doge chantant|L’Abbé doré|musique|3",
    "Dans quel pays le chanteur Stromae est-il né ?|En Belgique|En France|En Suisse|Au Canada|musique|1",
    "Qui chante « Petit Papa Noël » ?|Tino Rossi|Charles Trenet|Luis Mariano|André Claveau|musique|1",
    "Dans la notation anglo-saxonne, à quelle note correspond la lettre A ?|La|Do|Sol|Mi|musique|2",
    "Dans quelle ville Joe Dassin est-il né ?|À New York|À Paris|À Montréal|À Bruxelles|musique|3",
    "Au profit de quelle association les Enfoirés chantent-ils ?|Les Restos du cœur|Le Secours populaire|La Croix-Rouge|Emmaüs|musique|1",
    "Qui a composé la « Symphonie fantastique » ?|Hector Berlioz|Franz Liszt|César Franck|Charles Gounod|musique|2",
    "Qui chante « Alexandrie Alexandra » ?|Claude François|Patrick Juvet|Dave|Christophe|musique|2",
    "Quel instrument de l’orchestre donne le « la » avant le concert ?|Le hautbois|Le premier violon|La flûte|Le piano|musique|3",
    "Qui chante « I Will Always Love You » dans le film « Bodyguard » ?|Whitney Houston|Mariah Carey|Céline Dion|Toni Braxton|musique|1",
    "Qui interprète « Les Corons » ?|Pierre Bachelet|Michel Delpech|Yves Duteil|Daniel Guichard|musique|2",
    "Quel instrument représente l’oiseau dans « Pierre et le Loup » ?|La flûte|Le hautbois|La clarinette|Le violon|musique|2",
    "Qui a composé la musique de scène de « Peer Gynt » ?|Edvard Grieg|Jean Sibelius|Antonín Dvořák|Bedřich Smetana|musique|3",
    "Quel trio réunissait Johnny Hallyday, Eddy Mitchell et Jacques Dutronc ?|Les Vieilles Canailles|Les Trois Ténors|Les Enfoirés|Les Copains d’abord|musique|2",
    "Qui chante « Aline » (1965) ?|Christophe|Hervé Vilard|Salvatore Adamo|Michel Polnareff|musique|1",
    "Qui a composé un célèbre « Canon » baroque en ré majeur ?|Johann Pachelbel|Tomaso Albinoni|Arcangelo Corelli|Henry Purcell|musique|2",
    "À quelle fréquence est accordé le « la » de référence ?|440 hertz|420 hertz|460 hertz|400 hertz|musique|2",
    "Combien de Coupes du monde Pelé a-t-il remportées avec le Brésil ?|Trois|Deux|Quatre|Une|sport|2",
    "Quel joueur français a reçu le Ballon d’or en 1998 ?|Zinédine Zidane|Didier Deschamps|Thierry Henry|Lilian Thuram|sport|1",
    "Quel pays a remporté la Coupe du monde de football 2018 en Russie ?|La France|La Croatie|L’Allemagne|Le Brésil|sport|1",
    "Quel pays a gagné cinq Coupes du monde de football entre 1958 et 2002 ?|Le Brésil|L’Allemagne|L’Italie|L’Argentine|sport|1",
    "Au football, que signifie un carton rouge pour un joueur ?|Il est expulsé du match|Il est averti|Il paie une amende|Il change de poste|sport|1",
    "À quelle distance du but se trouve le point de penalty au football ?|11 mètres|9 mètres|13 mètres|15 mètres|sport|2",
    "Dans quelle ville française Zinédine Zidane est-il né ?|Marseille|Lyon|Saint-Étienne|Bordeaux|sport|1",
    "Quel Français a remporté trois Ballons d’or consécutifs dans les années 1980 ?|Michel Platini|Raymond Kopa|Jean-Pierre Papin|Just Fontaine|sport|1",
    "Quel Français a marqué treize buts lors de la Coupe du monde 1958 ?|Just Fontaine|Raymond Kopa|Michel Platini|Thierry Henry|sport|2",
    "Quel joueur argentin est célèbre pour sa « main de Dieu » en 1986 ?|Diego Maradona|Mario Kempes|Gabriel Batistuta|Daniel Passarella|sport|1",
    "Quel club français a remporté la Ligue des champions en 1993 ?|L’Olympique de Marseille|Le Paris Saint-Germain|L’AS Monaco|Les Girondins de Bordeaux|sport|1",
    "Quel surnom porte le club de football de Saint-Étienne ?|Les Verts|Les Canaris|Les Gones|Les Dogues|sport|1",
    "Dans quelle zone le gardien de but peut-il saisir le ballon à la main ?|Sa surface de réparation|Le rond central|Tout le terrain|Sa moitié de terrain|sport|1",
    "Quelle compétition l’équipe de France de football a-t-elle gagnée en 1984 et 2000 ?|Le championnat d’Europe|La Coupe du monde|Les Jeux olympiques|La Ligue des champions|sport|2",
    "Quel Français a marqué un triplé en finale de la Coupe du monde 2022 ?|Kylian Mbappé|Antoine Griezmann|Olivier Giroud|Ousmane Dembélé|sport|1",
    "Quel gardien soviétique était surnommé « l’Araignée noire » ?|Lev Yachine|Rinat Dasaev|Oleg Blokhine|Igor Netto|sport|3",
    "Au football, comment appelle-t-on trois buts marqués par le même joueur en un match ?|Un coup du chapeau|Une passe décisive|Un doublé|Un carton plein|sport|1",
    "Combien de joueurs d’une équipe de basket-ball sont sur le terrain ?|Cinq|Six|Sept|Quatre|sport|1",
    "Combien de titres NBA Michael Jordan a-t-il remportés ?|Six|Quatre|Huit|Trois|sport|2",
    "Avec quelle équipe Michael Jordan a-t-il gagné tous ses titres NBA ?|Les Chicago Bulls|Les Los Angeles Lakers|Les Boston Celtics|Les New York Knicks|sport|1",
    "Au basket, combien de points vaut un lancer franc réussi ?|Un point|Deux points|Trois points|Un demi-point|sport|1",
    "Dans quel pays le basket-ball a-t-il été inventé en 1891 ?|Aux États-Unis|Au Canada|En Angleterre|En France|sport|1",
    "Qui a inventé le basket-ball ?|James Naismith|Walter Camp|Abner Doubleday|William Webb Ellis|sport|3",
    "Avec quelle franchise NBA Tony Parker a-t-il été quatre fois champion ?|Les San Antonio Spurs|Les Miami Heat|Les Dallas Mavericks|Les Houston Rockets|sport|2",
    "Quel surnom portait l’équipe américaine de basket aux JO de 1992 ?|La Dream Team|La Fab Five|La Golden Team|La Magic Team|sport|1",
    "Au basket, comment appelle-t-on le fait de smasher le ballon dans le panier ?|Un dunk|Un lay-up|Un contre|Un rebond|sport|1",
    "Combien de tournois du Grand Chelem de tennis y a-t-il chaque année ?|Quatre|Trois|Cinq|Six|sport|1",
    "Sur quelle surface se joue le tournoi de Wimbledon ?|Le gazon|La terre battue|La résine|Le parquet|sport|1",
    "De quelle nationalité est le champion de tennis Roger Federer ?|Suisse|Autrichienne|Allemande|Belge|sport|1",
    "Combien de fois Rafael Nadal a-t-il remporté Roland-Garros ?|Quatorze|Onze|Douze|Seize|sport|2",
    "Au tennis, comment appelle-t-on un service gagnant non touché par l’adversaire ?|Un ace|Un let|Un smash|Un lob|sport|1",
    "Au tennis, quel mot anglais désigne un score de zéro ?|Love|Deuce|Net|Out|sport|2",
    "En quelle année Yannick Noah a-t-il remporté Roland-Garros ?|En 1983|En 1977|En 1989|En 1991|sport|2",
    "Comment s’appelle le jeu décisif disputé à six jeux partout au tennis ?|Le tie-break|Le let|Le passing-shot|L’avantage|sport|1",
    "Combien de titres du Grand Chelem Roger Federer a-t-il remportés ?|Vingt|Dix-sept|Vingt-deux|Quinze|sport|2",
    "Quelle compétition de tennis oppose des équipes nationales masculines ?|La Coupe Davis|La Fed Cup|La Ryder Cup|La Solheim Cup|sport|1",
    "Quel « Mousquetaire » du tennis a donné son nom à une marque au crocodile ?|René Lacoste|Jean Borotra|Henri Cochet|Jacques Brugnon|sport|2",
    "Sur le Tour de France, qui porte le maillot blanc à pois rouges ?|Le meilleur grimpeur|Le meilleur sprinteur|Le plus jeune coureur|Le dernier du classement|sport|1",
    "En quelle année s’est déroulé le premier Tour de France ?|En 1903|En 1913|En 1889|En 1924|sport|2",
    "Sur quelle célèbre avenue le Tour de France arrive-t-il traditionnellement ?|Les Champs-Élysées|La rue de Rivoli|Le boulevard Haussmann|L’avenue Montaigne|sport|1",
    "Combien de Tours de France le Belge Eddy Merckx a-t-il gagnés ?|Cinq|Trois|Quatre|Sept|sport|2",
    "Quel surnom portait le coureur cycliste Eddy Merckx ?|Le Cannibale|Le Blaireau|L’Aigle de Tolède|Le Roi Soleil|sport|2",
    "Quel Français a remporté son cinquième Tour de France en 1985 ?|Bernard Hinault|Laurent Fignon|Bernard Thévenet|Louison Bobet|sport|2",
    "Quel sommet du Tour de France est surnommé le « Géant de Provence » ?|Le mont Ventoux|Le col du Galibier|L’Alpe d’Huez|Le col du Tourmalet|sport|1",
    "Quel Français fut le premier coureur à gagner cinq Tours de France ?|Jacques Anquetil|Raymond Poulidor|Bernard Hinault|Laurent Fignon|sport|2",
    "Quel surnom affectueux le public donnait-il à Raymond Poulidor ?|Poupou|Riri|Loulou|Nono|sport|1",
    "Comment surnomme-t-on le dernier coureur du classement du Tour de France ?|La lanterne rouge|Le wagon de queue|Le feu arrière|La voiture-balai|sport|1",
    "De quelle couleur est le maillot du leader du Tour d’Italie ?|Rose|Jaune|Bleu|Orange|sport|2",
    "Quelle course cycliste pavée est surnommée « l’Enfer du Nord » ?|Paris-Roubaix|Paris-Tours|Milan-San Remo|Liège-Bastogne-Liège|sport|1",
    "Qui a rénové les Jeux olympiques modernes à la fin du XIXe siècle ?|Pierre de Coubertin|Jules Rimet|Henri Desgrange|Jean Bouin|sport|1",
    "Que symbolisent les cinq anneaux du drapeau olympique ?|Les cinq continents|Les cinq océans|Cinq sports antiques|Cinq dieux grecs|sport|1",
    "Quel athlète américain a remporté quatre médailles d’or aux JO de Berlin en 1936 ?|Jesse Owens|Carl Lewis|Bob Beamon|Tommie Smith|sport|2",
    "Quelle gymnaste a obtenu le premier 10 parfait de l’histoire olympique en 1976 ?|Nadia Comaneci|Larissa Latynina|Vera Caslavska|Ludmila Tourischeva|sport|2",
    "À quel rythme les Jeux olympiques d’été sont-ils organisés ?|Tous les quatre ans|Tous les deux ans|Tous les trois ans|Tous les cinq ans|sport|1",
    "Dans quel site de Grèce la flamme olympique est-elle allumée ?|À Olympie|À Delphes|À Sparte|À Marathon|sport|1",
    "En quelle année Paris a-t-il accueilli les Jeux olympiques pour la première fois ?|En 1900|En 1924|En 1896|En 1948|sport|2",
    "Quelle est la devise olympique historique ?|Plus vite, plus haut, plus fort|Toujours plus loin|L’important est de participer|Unis pour la victoire|sport|1",
    "Quel nageur américain détient le record de médailles d’or olympiques ?|Michael Phelps|Mark Spitz|Ryan Lochte|Matt Biondi|sport|1",
    "Quelle est la distance officielle du marathon ?|42,195 km|40,750 km|44,195 km|39,995 km|sport|1",
    "Le mot « marathon » vient du nom d’une ville située dans quel pays ?|En Grèce|En Italie|En Turquie|En Égypte|sport|1",
    "Quelle ville française a accueilli les premiers Jeux olympiques d’hiver en 1924 ?|Chamonix|Grenoble|Albertville|Val d’Isère|sport|2",
    "En quelle année les Jeux olympiques d’hiver ont-ils eu lieu à Albertville ?|En 1992|En 1988|En 1996|En 1984|sport|1",
    "Quel skieur français a gagné trois médailles d’or aux JO de Grenoble en 1968 ?|Jean-Claude Killy|Guy Périllat|Léo Lacroix|Luc Alphand|sport|2",
    "Quel coureur a gagné le 5000 m, le 10000 m et le marathon aux JO de 1952 ?|Emil Zatopek|Paavo Nurmi|Lasse Viren|Alain Mimoun|sport|3",
    "Quelle Française a remporté le 200 m et le 400 m aux JO d’Atlanta en 1996 ?|Marie-José Pérec|Christine Arron|Muriel Hurtis|Colette Besson|sport|2",
    "Quel Français a remporté le marathon olympique en 1956 ?|Alain Mimoun|Michel Jazy|Jean Bouin|Guy Drut|sport|3",
    "Quel pays des Caraïbes a aligné un équipage de bobsleigh aux JO d’hiver de 1988 ?|La Jamaïque|Cuba|Haïti|La Barbade|sport|1",
    "Quel sprinteur jamaïcain a couru le 100 m en 9 s 58 en 2009 ?|Usain Bolt|Asafa Powell|Yohan Blake|Nesta Carter|sport|1",
    "Combien de joueurs compte une équipe de rugby à XV sur le terrain ?|Quinze|Treize|Quatorze|Seize|sport|1",
    "Combien de points vaut un essai au rugby à XV ?|Cinq points|Trois points|Quatre points|Six points|sport|2",
    "Quel trophée reçoit le vainqueur de la Coupe du monde de rugby ?|La coupe Webb Ellis|La coupe Rimet|Le trophée Garibaldi|La Calcutta Cup|sport|2",
    "Quel pays a remporté la première Coupe du monde de rugby en 1987 ?|La Nouvelle-Zélande|L’Australie|L’Afrique du Sud|L’Angleterre|sport|2",
    "Quelle danse traditionnelle les All Blacks exécutent-ils avant leurs matchs ?|Le haka|Le tamouré|La capoeira|Le sirtaki|sport|1",
    "Quel pays a rejoint le Tournoi des Cinq Nations en 2000 pour en faire les Six Nations ?|L’Italie|L’Espagne|La Roumanie|La Géorgie|sport|2",
    "Quel trophée est remis au champion de France de rugby ?|Le bouclier de Brennus|La coupe de la Ligue|Le casque d’or|Le bouclier d’argent|sport|2",
    "Au rugby, que signifie réaliser le grand chelem dans le Tournoi des Six Nations ?|Gagner tous ses matchs|Ne concéder aucun essai|Gagner à l’extérieur|Marquer plus de 100 points|sport|1",
    "Quel pays a remporté la Coupe du monde de rugby 2003 grâce à un drop de Wilkinson ?|L’Angleterre|L’Australie|La France|Le pays de Galles|sport|2",
    "Combien de joueurs de chaque équipe forment une mêlée ordonnée au rugby à XV ?|Huit|Six|Sept|Dix|sport|3",
    "Combien de joueurs d’une équipe de handball sont sur le terrain ?|Sept|Six|Huit|Neuf|sport|2",
    "Quel surnom portait l’équipe de France de handball championne du monde en 1995 ?|Les Barjots|Les Experts|Les Costauds|Les Bronzés|sport|2",
    "Combien de titres de champion du monde de F1 Michael Schumacher a-t-il remportés ?|Sept|Cinq|Six|Huit|sport|1",
    "Quel pilote français a été quatre fois champion du monde de Formule 1 ?|Alain Prost|Jean Alesi|René Arnoux|Olivier Panis|sport|1",
    "Quel Grand Prix de Formule 1 se dispute dans les rues d’une principauté ?|Le Grand Prix de Monaco|Le Grand Prix d’Espagne|Le Grand Prix d’Italie|Le Grand Prix d’Autriche|sport|1",
    "Dans quelle ville française se court une célèbre épreuve automobile de 24 heures ?|Le Mans|Reims|Magny-Cours|Dijon|sport|1",
    "Quelle capitale africaine était l’arrivée du célèbre rallye-raid parti de Paris ?|Dakar|Bamako|Abidjan|Tunis|sport|1",
    "Quel était le nom de naissance du boxeur Muhammad Ali ?|Cassius Clay|Joe Frazier|Sonny Liston|George Foreman|sport|1",
    "Dans quel sport le Français Marcel Cerdan s’est-il illustré ?|La boxe|Le cyclisme|La lutte|L’haltérophilie|sport|2",
    "En boxe, comment appelle-t-on un coup de poing porté de bas en haut ?|L’uppercut|Le jab|Le crochet|Le direct|sport|2",
    "Dans quelle ville Muhammad Ali a-t-il battu George Foreman en 1974 ?|Kinshasa|Manille|Las Vegas|Mexico|sport|3",
    "Dans quel sport David Douillet a-t-il été double champion olympique ?|Le judo|La lutte|La boxe|L’escrime|sport|1",
    "Que signifie le mot japonais « judo » ?|La voie de la souplesse|La main vide|La voie du sabre|Le poing du dragon|sport|3",
    "Quelle nageuse française a été championne olympique du 400 m nage libre en 2004 ?|Laure Manaudou|Camille Muffat|Roxana Maracineanu|Charlotte Bonnet|sport|2",
    "Quelle nage de compétition porte le nom d’un insecte ?|Le papillon|La brasse|Le crawl|Le dos crawlé|sport|1",
    "Quelle est la longueur d’un bassin olympique de natation ?|50 mètres|25 mètres|100 mètres|60 mètres|sport|1",
    "Combien d’épreuves composent le décathlon en athlétisme ?|Dix|Sept|Douze|Huit|sport|1",
    "Quel sport enchaîne natation, cyclisme et course à pied ?|Le triathlon|Le biathlon|Le pentathlon|Le duathlon|sport|1",
    "Quelles disciplines composent le biathlon aux JO d’hiver ?|Ski de fond et tir|Ski alpin et luge|Patinage et tir|Ski de fond et saut|sport|1",
    "Dans quel sport Philippe Candeloro a-t-il brillé ?|Le patinage artistique|Le patinage de vitesse|Le ski acrobatique|Le hockey sur glace|sport|1",
    "Dans quel sport d’hiver balaie-t-on la glace devant une pierre qui glisse ?|Le curling|Le skeleton|La luge|Le bobsleigh|sport|1",
    "Dans quel sport le Canadien Wayne Gretzky est-il une légende ?|Le hockey sur glace|Le baseball|Le basket-ball|Le football américain|sport|2",
    "Quel agrès de gymnastique est réservé aux femmes en compétition ?|La poutre|Les anneaux|Le cheval d’arçons|La barre fixe|sport|2",
    "Quels sont les deux mouvements de l’haltérophilie olympique ?|L’arraché et l’épaulé-jeté|Le soulevé et le poussé|La flexion et l’extension|Le développé et le tiré|sport|2",
    "Quelles sont les trois armes de l’escrime ?|Le fleuret, l’épée et le sabre|Le fleuret, l’épée et la dague|L’épée, le sabre et la rapière|Le fleuret, l’arc et le sabre|sport|2",
    "Au golf, comment appelle-t-on un trou réussi en un seul coup ?|Un trou en un|Un albatros|Un eagle|Un birdie|sport|1",
    "À la pétanque, comment appelle-t-on la petite boule en bois qui sert de cible ?|Le cochonnet|Le poussin|Le grelot|Le bigorneau|sport|1",
    "À la pétanque, que signifie « être fanny » ?|Perdre treize à zéro|Gagner sans pointer|Tirer sans viser|Jouer sans cochonnet|sport|2",
    "Comment s’appelle celui qui donne la cadence et dirige le bateau en aviron ?|Le barreur|Le rameur|Le skipper|Le capitaine|sport|2",
    "Quelle course à la voile fait le tour du monde en solitaire et sans escale ?|Le Vendée Globe|La Route du Rhum|La Solitaire du Figaro|La Transat Jacques-Vabre|sport|2",
    "Dans quel sport le Français Éric Tabarly s’est-il illustré ?|La voile|L’aviron|Le canoë-kayak|La plongée|sport|2",
    "Quel est le symbole chimique du fer ?|Fe|Fr|Ir|F|sciences|1",
    "Quel est le symbole chimique du potassium ?|K|P|Po|Pt|sciences|2",
    "Quel est le symbole chimique du plomb ?|Pb|Pl|Pm|Po|sciences|2",
    "Quel est le symbole chimique du tungstène ?|W|T|Tg|Tn|sciences|3",
    "Le bronze est un alliage de cuivre et de quel autre métal ?|L’étain|Le zinc|Le plomb|Le nickel|sciences|2",
    "Le laiton est un alliage de cuivre et de quel autre métal ?|Le zinc|L’étain|L’aluminium|L’argent|sciences|3",
    "L’acier est un alliage de fer et de quel élément ?|Le carbone|Le cuivre|Le silicium|Le zinc|sciences|1",
    "Quel métal, ajouté au fer, rend l’acier inoxydable ?|Le chrome|Le zinc|Le cuivre|L’or|sciences|2",
    "Quel élément chimique porte le numéro atomique 2 ?|L’hélium|L’hydrogène|Le lithium|Le néon|sciences|2",
    "Quel gaz noble éclaire en rouge-orangé les enseignes lumineuses ?|Le néon|L’argon|Le krypton|Le xénon|sciences|2",
    "Quel acide notre estomac produit-il pour digérer ?|L’acide chlorhydrique|L’acide sulfurique|L’acide citrique|L’acide nitrique|sciences|2",
    "Quel acide donne son goût piquant au vinaigre ?|L’acide acétique|L’acide citrique|L’acide lactique|L’acide malique|sciences|2",
    "Quel gaz gonflait le dirigeable Hindenburg, qui prit feu en 1937 ?|L’hydrogène|L’hélium|Le méthane|Le propane|sciences|2",
    "Quel élément est ajouté au sel de table pour le bon fonctionnement de la thyroïde ?|L’iode|Le fluor|Le fer|Le magnésium|sciences|2",
    "Quel élément donne son odeur d’œuf pourri au sulfure d’hydrogène ?|Le soufre|Le phosphore|Le chlore|L’azote|sciences|2",
    "Quel est le métal le plus léger ?|Le lithium|L’aluminium|Le magnésium|Le titane|sciences|3",
    "Quel métal conduit le mieux l’électricité ?|L’argent|Le cuivre|L’or|L’aluminium|sciences|3",
    "Quel chimiste russe a conçu le tableau périodique des éléments ?|Dmitri Mendeleïev|Antoine Lavoisier|John Dalton|Niels Bohr|sciences|1",
    "Quel élément Marie Curie a-t-elle nommé d’après son pays natal ?|Le polonium|Le radium|Le francium|Le curium|sciences|2",
    "Quel est l’élément le plus abondant de la croûte terrestre ?|L’oxygène|Le silicium|Le fer|L’aluminium|sciences|3",
    "Quelle est la vitesse approximative du son dans l’air ?|340 m/s|34 m/s|3 400 m/s|1 000 m/s|sciences|1",
    "Quelle unité mesure la puissance électrique ?|Le watt|Le volt|L’ampère|L’ohm|sciences|1",
    "Quelle unité mesure la résistance électrique ?|L’ohm|Le volt|Le watt|Le hertz|sciences|2",
    "Quelle unité mesure la fréquence d’une onde ?|Le hertz|Le pascal|Le newton|Le joule|sciences|2",
    "Quelle unité mesure une force en physique ?|Le newton|Le joule|Le watt|Le volt|sciences|2",
    "Quelle unité du Système international mesure l’énergie ?|Le joule|La calorie|Le watt|Le volt|sciences|2",
    "Pourquoi l’eau bout-elle en dessous de 100 °C en haute montagne ?|La pression est plus faible|L’air est plus froid|La gravité est plus faible|L’air est plus sec|sciences|2",
    "Pourquoi voit-on l’éclair avant d’entendre le tonnerre ?|La lumière va plus vite|Le son part en retard|L’œil réagit plus vite|Le vent freine le son|sciences|1",
    "Quelle unité mesure la température absolue ?|Le kelvin|Le degré Celsius|Le degré Fahrenheit|Le pascal|sciences|2",
    "Quelle couleur borde l’extérieur de l’arc-en-ciel principal ?|Le rouge|Le violet|Le bleu|Le vert|sciences|3",
    "Quelle est la tension du courant domestique en France ?|230 volts|110 volts|120 volts|500 volts|sciences|1",
    "Pourquoi la glace flotte-t-elle sur l’eau ?|Elle est moins dense|Elle est plus froide|Elle contient du sel|Elle emprisonne du gaz|sciences|1",
    "Combien de temps la lumière du Soleil met-elle pour atteindre la Terre ?|Environ 8 minutes|8 secondes|8 heures|3 jours|sciences|2",
    "Que trouve-t-on entre les deux parois d’une bouteille isotherme ?|Du vide|De l’air comprimé|De la mousse|De l’eau glacée|sciences|2",
    "Quelles molécules le four à micro-ondes agite-t-il pour chauffer les plats ?|Les molécules d’eau|Les molécules d’air|Les molécules de sucre|Les molécules de sel|sciences|2",
    "Dans quel milieu le son ne peut-il pas se propager ?|Le vide|L’eau|L’acier|Le brouillard|sciences|1",
    "Quel pôle d’un aimant attire le pôle nord d’un autre aimant ?|Le pôle sud|Le pôle nord|Les deux pôles|Aucun des deux|sciences|1",
    "Quel effet modifie le son de la sirène d’une ambulance qui passe ?|L’effet Doppler|L’effet Larsen|L’effet Joule|L’effet Venturi|sciences|2",
    "Quel phénomène rend le ciel bleu en journée ?|La diffusion de la lumière|Le reflet des océans|La couche d’ozone|La vapeur d’eau|sciences|2",
    "Quelle échelle mesure la force du vent ?|L’échelle de Beaufort|L’échelle de Richter|L’échelle de Mercalli|L’échelle de Mohs|sciences|2",
    "Combien de branches possède un cristal de neige ?|6|4|5|8|sciences|2",
    "À quelle température Celsius et Fahrenheit indiquent-ils la même valeur ?|-40 degrés|0 degré|-20 degrés|-100 degrés|sciences|3",
    "Qui a découvert la radioactivité naturelle en 1896 ?|Henri Becquerel|Marie Curie|Louis Pasteur|Blaise Pascal|sciences|3",
    "Où se trouve l’os hyoïde, le seul os non relié à un autre os ?|Dans le cou|Dans le poignet|Dans le pied|Dans le crâne|sciences|3",
    "Combien de dents de lait un enfant possède-t-il ?|20|24|28|16|sciences|2",
    "Comment s’appelle le cinquième goût de base, identifié au Japon ?|L’umami|Le piquant|L’astringent|Le métallique|sciences|2",
    "Quelle petite glande du cerveau sécrète la mélatonine ?|La glande pinéale|L’hypophyse|La thyroïde|L’amygdale|sciences|3",
    "La pomme d’Adam est la saillie de quel cartilage ?|Le cartilage thyroïde|Le cartilage cricoïde|Le cartilage nasal|Le cartilage costal|sciences|3",
    "Quel est le nerf le plus long et le plus gros du corps humain ?|Le nerf sciatique|Le nerf optique|Le nerf vague|Le nerf facial|sciences|1",
    "Quel os est aussi appelé « patella » ?|La rotule|La clavicule|L’omoplate|Le sternum|sciences|2",
    "Quelle partie du cerveau contrôle l’équilibre et la coordination ?|Le cervelet|L’hippocampe|L’hypothalamus|Le lobe frontal|sciences|2",
    "Combien de cavités le cœur humain possède-t-il ?|4|2|3|6|sciences|1",
    "Où les globules rouges sont-ils fabriqués ?|Dans la moelle osseuse|Dans le cœur|Dans la rate|Dans les poumons|sciences|2",
    "Quelle est la durée de vie moyenne d’un globule rouge ?|Environ 120 jours|Environ 12 jours|Environ 24 heures|Environ 3 ans|sciences|3",
    "À quelle partie du tube digestif l’appendice est-il attaché ?|Le gros intestin|L’estomac|L’intestin grêle|L’œsophage|sciences|2",
    "Quel conduit relie l’oreille moyenne au pharynx ?|La trompe d’Eustache|Le canal lacrymal|Le conduit auditif|Le sinus frontal|sciences|2",
    "Combien d’os un bébé possède-t-il environ à la naissance ?|Environ 300|Environ 206|Environ 150|Environ 100|sciences|2",
    "Comment s’appelle le liquide qui lubrifie les articulations ?|La synovie|La lymphe|Le plasma|Le sébum|sciences|2",
    "Comment s’appelle le fruit du chêne ?|Le gland|La faîne|La châtaigne|La noisette|sciences|1",
    "Quel conifère perd ses aiguilles chaque hiver ?|Le mélèze|Le sapin|L’épicéa|Le pin sylvestre|sciences|2",
    "Comment s’appelle l’organe mâle d’une fleur ?|L’étamine|Le pistil|Le sépale|Le pétale|sciences|2",
    "À quelle famille de plantes le bambou appartient-il ?|Les graminées|Les conifères|Les fougères|Les cactées|sciences|3",
    "Qu’est-ce que le bananier, du point de vue botanique ?|Une herbe géante|Un arbre|Un palmier|Un arbuste|sciences|3",
    "Comment s’appellent les petits grains à la surface de la fraise ?|Les akènes|Les pépins|Les drupes|Les bulbes|sciences|3",
    "Comment s’appelle la science qui étudie les champignons ?|La mycologie|La botanique|L’entomologie|La géologie|sciences|1",
    "Quel champignon cause le plus d’empoisonnements mortels en France ?|L’amanite phalloïde|Le cèpe de Bordeaux|La girolle|La morille|sciences|1",
    "De quelle fleur le safran est-il extrait ?|Un crocus|Une tulipe|Un lys|Une orchidée|sciences|2",
    "Quelle plante carnivore referme ses pièges comme des mâchoires ?|La dionée|La drosera|La sarracénie|Le népenthès|sciences|2",
    "Comment qualifie-t-on un feuillage qui tombe chaque automne ?|Caduc|Persistant|Lancéolé|Panaché|sciences|1",
    "Quelle plante tropicale produit la plus grande fleur du monde ?|La rafflesia|Le tournesol géant|Le nénuphar géant|Le magnolia|sciences|3",
    "Quel arbre africain peut stocker des milliers de litres d’eau dans son tronc ?|Le baobab|L’acacia|L’ébénier|Le palmier dattier|sciences|1",
    "Combien de vertèbres composent le cou de la girafe ?|7|14|21|33|sciences|2",
    "Quel mammifère au bec de canard pond des œufs ?|L’ornithorynque|L’échidné|Le wombat|Le tatou|sciences|1",
    "Quel est le plus grand poisson du monde ?|Le requin-baleine|Le grand requin blanc|L’espadon|Le thon rouge|sciences|1",
    "Chez le manchot empereur, qui couve l’unique œuf durant l’hiver ?|Le mâle|La femelle|Les deux en alternance|Un couple voisin|sciences|2",
    "Quel est le seul grand singe vivant en Asie ?|L’orang-outan|Le gorille|Le chimpanzé|Le bonobo|sciences|1",
    "Quel est le serpent le plus long du monde ?|Le python réticulé|L’anaconda vert|Le cobra royal|Le boa constricteur|sciences|2",
    "Chez les moustiques, qui pique pour se nourrir de sang ?|La femelle|Le mâle|Les deux sexes|Seules les larves|sciences|1",
    "Quel mathématicien britannique a aidé à percer les secrets de la machine Enigma ?|Alan Turing|John von Neumann|Charles Babbage|Blaise Pascal|sciences|1",
    "Qui est considérée comme la première programmeuse de l’histoire ?|Ada Lovelace|Grace Hopper|Marie Curie|Hedy Lamarr|sciences|2",
    "Qui a inventé le World Wide Web en 1989 ?|Tim Berners-Lee|Bill Gates|Steve Jobs|Vinton Cerf|sciences|2",
    "Qu’a inventé Blaise Pascal pour aider son père collecteur d’impôts ?|Une machine à calculer|Une machine à écrire|Un télescope|Un coffre-fort|sciences|1",
    "Quel langage de programmation Grace Hopper a-t-elle contribué à créer ?|Le COBOL|Le Python|Le Java|Le Basic|sciences|3",
    "En quelle année la société Apple a-t-elle été fondée ?|1976|1968|1984|1992|sciences|2",
    "Comment s’appelait l’énorme ordinateur américain dévoilé au public en 1946 ?|L’ENIAC|Le Colossus|L’UNIVAC|L’IBM 701|sciences|3",
    "Quel accessoire informatique Douglas Engelbart a-t-il inventé ?|La souris|Le clavier|L’écran tactile|La webcam|sciences|2",
    "Quel système d’exploitation Linus Torvalds a-t-il créé en 1991 ?|Linux|Windows|Unix|MS-DOS|sciences|1",
    "Quel insecte, trouvé dans un ordinateur en 1947, popularisa le mot « bug » ?|Un papillon de nuit|Une mouche|Un cafard|Une fourmi|sciences|3",
    "Combien de bits composent un octet ?|8|4|10|16|sciences|1",
    "Quel symbole Ray Tomlinson choisit-il en 1971 pour les adresses e-mail ?|L’arobase|Le dièse|L’esperluette|Le tiret bas|sciences|1",
    "Quel plat du Sud-Ouest marie haricots blancs, saucisse et confit de canard ?|Le cassoulet|La garbure|La potée|Le petit salé|france|1",
    "Quelle ville de Bourgogne est réputée pour sa moutarde ?|Dijon|Beaune|Auxerre|Mâcon|france|1",
    "Quel fromage rond à croûte fleurie est originaire de Normandie ?|Le camembert|Le brie|Le coulommiers|Le chaource|france|1",
    "Le maroilles, fromage à l’odeur puissante, vient de quelle région ?|Les Hauts-de-France|La Normandie|L’Auvergne|La Corse|france|1",
    "Quel fromage fond traditionnellement dans la tartiflette ?|Le reblochon|Le beaufort|L’emmental|Le cantal|france|1",
    "Quel vin effervescent est produit autour de Reims et d’Épernay ?|Le champagne|Le crémant d’Alsace|La clairette de Die|Le vouvray|france|1",
    "Le chablis, vin blanc sec, appartient à quel vignoble ?|La Bourgogne|Le Bordelais|L’Alsace|La Provence|france|2",
    "Le muscadet appartient à quel grand vignoble ?|La vallée de la Loire|Le Bordelais|La Bourgogne|L’Alsace|france|2",
    "Saint-Émilion et le Médoc appartiennent à quelle région viticole ?|Le Bordelais|La Bourgogne|Le Beaujolais|Le Languedoc|france|1",
    "Quel apéritif anisé, allongé d’eau fraîche, est emblématique du Midi ?|Le pastis|La Suze|Le Picon|Le pineau|france|1",
    "Le kir marie le vin blanc aligoté à quelle liqueur ?|La crème de cassis|La crème de mûre|Le curaçao|La verveine|france|1",
    "En quel mois le beaujolais nouveau est-il mis en vente ?|En novembre|En octobre|En septembre|En décembre|france|1",
    "Quelle petite pâtisserie striée et caramélisée vient de Bordeaux ?|Le cannelé|Le financier|La navette|Le broyé du Poitou|france|1",
    "La madeleine est la fierté de quelle ville lorraine ?|Commercy|Nancy|Metz|Épinal|france|2",
    "Quelle confiserie aux amandes et au miel est la spécialité de Montélimar ?|Le nougat|Le calisson|La praline|Le touron|france|1",
    "Le calisson, confiserie au melon confit et aux amandes, vient de quelle ville ?|Aix-en-Provence|Avignon|Arles|Nîmes|france|1",
    "Quelle tarte aux pommes renversée doit son nom à deux sœurs hôtelières ?|La tarte Tatin|La tarte Bourdaloue|La flognarde|La croustade|france|1",
    "Quels fruits garnissent traditionnellement le far breton ?|Les pruneaux|Les raisins secs|Les abricots secs|Les figues|france|1",
    "Quel ingrédient fait la richesse du kouign-amann breton ?|Le beurre|Le miel|La crème|Les amandes|france|1",
    "Les quenelles lyonnaises sont traditionnellement à base de quel poisson ?|Le brochet|Le sandre|La truite|La carpe|france|3",
    "Comment appelle-t-on les petits restaurants typiques de Lyon ?|Les bouchons|Les estaminets|Les guinguettes|Les cabanons|france|2",
    "Dans quelle boisson mijote la carbonade flamande ?|La bière|Le vin rouge|Le cidre|Le vin blanc|france|2",
    "Quel plat emblématique déguste-t-on à la braderie de Lille ?|Les moules-frites|La choucroute|Le welsh|La flamiche|france|1",
    "Quel plat provençal marie aubergines, courgettes, poivrons et tomates ?|La ratatouille|La piperade|Le tian|La bohémienne|france|1",
    "Quel ingrédient parfume l’aïoli provençal ?|L’ail|Le safran|L’anchois|Le basilic|france|1",
    "La socca, fine galette de pois chiches, est la spécialité de quelle ville ?|Nice|Marseille|Toulon|Perpignan|france|2",
    "Dans quelle région cultive-t-on le piment d’Espelette ?|Le Pays basque|La Provence|La Corse|Le Roussillon|france|1",
    "Quel fromage frais corse est fabriqué à partir de petit-lait ?|Le brocciu|Le brin d’amour|La tomme corse|Le venaco|france|2",
    "Quelle garniture complète la crème et les oignons sur la tarte flambée alsacienne ?|Les lardons|Les champignons|Le saumon|Le munster|france|1",
    "Dans quel massif le munster est-il traditionnellement fabriqué ?|Les Vosges|Le Jura|Les Alpes|Les Pyrénées|france|2",
    "Quel grand fromage à pâte pressée est affiné dans le massif du Jura ?|Le comté|Le cantal|Le salers|Le laguiole|france|1",
    "Le crottin de Chavignol est fabriqué avec le lait de quel animal ?|La chèvre|La vache|La brebis|La bufflonne|france|2",
    "Quel plat de l’Aubrac étire purée de pommes de terre et tome fraîche ?|L’aligot|La truffade|La tartiflette|La raclette|france|1",
    "Dans quoi le bœuf bourguignon mijote-t-il longuement ?|Dans du vin rouge|Dans du vin blanc|Dans de la bière|Dans du bouillon|france|1",
    "Quelle ville est célèbre pour ses biscuits roses ?|Reims|Nantes|Dijon|Bordeaux|france|1",
    "Quelle ville est le berceau historique du petit-beurre ?|Nantes|Rennes|Angers|Lille|france|2",
    "Quelle petite prune dorée est l’emblème de la Lorraine ?|La mirabelle|La quetsche|La reine-claude|La prune d’ente|france|1",
    "Quel champignon précieux fait la renommée du Périgord ?|La truffe noire|Le cèpe|La morille|La girolle|france|1",
    "De quelle couleur sont les pattes de la volaille de Bresse ?|Bleues|Jaunes|Noires|Rouges|france|2",
    "Avec la Normandie, quelle région est la grande terre du cidre ?|La Bretagne|L’Alsace|La Savoie|Le Jura|france|1",
    "Le cognac est une eau-de-vie obtenue en distillant quoi ?|Du vin|Du cidre|De la bière|Du miel|france|2",
    "Sur quelle avenue défilent les troupes le matin du 14 juillet à Paris ?|Les Champs-Élysées|La rue de Rivoli|Le boulevard Haussmann|L’avenue Foch|france|1",
    "Quel événement de 1789 est commémoré le 14 juillet ?|La prise de la Bastille|Le serment du Jeu de paume|La bataille de Valmy|Le sacre de Napoléon|france|1",
    "Que commémore-t-on en France le 11 novembre ?|L’armistice de 1918|La victoire de 1945|L’appel du 18 juin|La prise de la Bastille|france|1",
    "Que cache-t-on dans la galette des rois ?|Une fève|Une pièce|Un anneau|Une médaille|france|1",
    "Que cuisine-t-on traditionnellement à la Chandeleur, le 2 février ?|Des crêpes|Des gaufres|Des beignets|Des brioches|france|1",
    "Comment s’appelle le jour festif qui précède le Carême ?|Mardi gras|Jeudi saint|Lundi de Pâques|Vendredi saint|france|1",
    "Quelle ville de la Côte d’Azur est célèbre pour son carnaval et ses grosses têtes ?|Nice|Cannes|Menton|Antibes|france|1",
    "Que lance-t-on à la foule pendant le carnaval de Dunkerque ?|Des harengs fumés|Des sardines|Des bonbons|Des œufs|france|2",
    "À quelle date la Fête de la musique a-t-elle lieu ?|Le 21 juin|Le 1er juin|Le 21 juillet|Le 14 juin|france|1",
    "Le 1er avril, quel animal en papier accroche-t-on dans le dos ?|Un poisson|Un crabe|Une grenouille|Un lapin|france|1",
    "Selon la tradition, qui apporte les œufs de Pâques dans la plupart des régions ?|Les cloches|Le lièvre|La poule|La cigogne|france|1",
    "Quel dessert roulé couronne le repas de Noël ?|La bûche|Le pudding|La galette|Le vacherin|france|1",
    "Quel saint apporte des friandises aux enfants de l’Est le 6 décembre ?|Saint Nicolas|Saint Martin|Saint Vincent|Saint Éloi|france|1",
    "Combien de desserts composent la table de Noël provençale ?|Treize|Douze|Sept|Quinze|france|2",
    "Lors de quelle fête les catherinettes portent-elles des chapeaux extravagants ?|La Sainte-Catherine|La Sainte-Barbe|La Sainte-Lucie|La Sainte-Anne|france|2",
    "Quelle ville s’illumine pour la fête des Lumières le 8 décembre ?|Lyon|Strasbourg|Nantes|Marseille|france|1",
    "Avoir « le cafard », c’est éprouver...|de la tristesse|de la colère|de la peur|de la jalousie|france|1",
    "Que fait-on quand on « donne sa langue au chat » ?|On renonce à deviner|On garde un secret|On dit du mal|On se tait par timidité|france|1",
    "Quand « il pleut des cordes », il pleut...|très fort|très faiblement|par intermittence|seulement quelques gouttes|france|1",
    "Faire « la grasse matinée », c’est...|dormir tard le matin|manger un gros petit-déjeuner|paresser au bureau|se coucher très tôt|france|1",
    "« Mettre son grain de sel », c’est...|se mêler d’une conversation|cuisiner trop salé|payer sa part|jeter un sort|france|1",
    "« Prendre ses jambes à son cou », c’est...|s’enfuir en courant|faire du yoga|marcher longtemps|se pencher en avant|france|1",
    "« Monter sur ses grands chevaux », c’est...|s’emporter|se vanter|prendre la fuite|rêver tout haut|france|2",
    "Quel spécialiste étudie les oiseaux ?|L’ornithologue|L’entomologiste|Le spéléologue|Le mycologue|france|1",
    "Que collectionne un philatéliste ?|Les timbres|Les pièces|Les cartes postales|Les papillons|france|1",
    "Quel est le métier de l’apiculteur ?|Élever des abeilles|Cultiver des arbres fruitiers|Élever des escargots|Récolter le sel|france|1",
    "Une personne polyglotte...|parle plusieurs langues|joue plusieurs instruments|exerce plusieurs métiers|écrit des poèmes|france|1",
    "Un gourmet est une personne qui...|apprécie la cuisine raffinée|mange en trop grande quantité|cuisine pour les autres|refuse toute viande|france|1",
    "Que signifie l’adjectif « vespéral » ?|Relatif au soir|Relatif au matin|Relatif au vent|Relatif au printemps|france|3",
    "Que désigne le « don d’ubiquité » ?|Être partout à la fois|Lire dans les pensées|Prédire l’avenir|Parler aux animaux|france|2",
    "Une personne loquace...|parle beaucoup|dort beaucoup|mange très peu|se plaint sans cesse|france|2",
    "Que signifie l’adverbe « derechef » ?|De nouveau|Sur-le-champ|En premier|Volontiers|france|3",
    "Dans l’expression « depuis des lustres », combien d’années dure un lustre ?|Cinq ans|Dix ans|Cent ans|Vingt ans|france|3",
    "Quel est le pluriel correct de « un chou » ?|Des choux|Des chous|Des choues|Des chouxs|france|1",
    "Quelle est l’orthographe correcte ?|Un dilemme|Un dilemne|Un dillème|Un dilème|france|2",
    "Quelle est la bonne orthographe du lieu où l’on reçoit les visiteurs ?|L’accueil|L’acceuil|L’accueuil|L’acueil|france|1",
    "Quelle préposition est correctement orthographiée ?|Parmi|Parmis|Parmie|Parmit|france|1",
    "Quel signe orthographique se glisse sous le c de « garçon » ?|La cédille|Le tréma|L’accent grave|L’apostrophe|france|1",
    "Quel accent porte le mot « où » quand il indique un lieu ?|Un accent grave|Un accent aigu|Un accent circonflexe|Un tréma|france|2",
    "Quel est le plus haut sommet de France ?|Le mont Blanc|Le mont Ventoux|Le pic du Midi|Le puy de Sancy|france|1",
    "Sur quelle place parisienne se dresse l’obélisque de Louxor ?|La place de la Concorde|La place Vendôme|La place de la Bastille|La place d’Italie|france|2",
    "Dans quelle région se trouve le Mont-Saint-Michel ?|La Normandie|La Bretagne|Les Pays de la Loire|Les Hauts-de-France|france|1",
    "Quelle ville est surnommée « la Ville rose » ?|Toulouse|Albi|Montauban|Nîmes|france|1",
    "Quelle cité provençale est surnommée « la cité des Papes » ?|Avignon|Arles|Aix-en-Provence|Orange|france|1",
    "Dans quelle ville flâne-t-on dans le quartier de la Petite France ?|Strasbourg|Colmar|Metz|Mulhouse|france|2",
    "Quel est le plus vaste des châteaux de la Loire ?|Chambord|Chenonceau|Amboise|Cheverny|france|1",
    "Quel château de la Loire enjambe la rivière du Cher ?|Chenonceau|Blois|Villandry|Azay-le-Rideau|france|2",
    "Dans quelle région s’élève la chaîne des Puys ?|L’Auvergne|La Savoie|Le Limousin|Le Périgord|france|1",
    "Quelle est la plus grande île de France métropolitaine ?|La Corse|Belle-Île|L’île d’Oléron|L’île de Ré|france|1",
    "Dans quelle ville corse Napoléon Bonaparte est-il né ?|Ajaccio|Bastia|Calvi|Bonifacio|france|1",
    "La dune du Pilat surplombe quel plan d’eau ?|Le bassin d’Arcachon|Le golfe du Morbihan|La baie de Somme|L’étang de Thau|france|1",
    "Les falaises d’Étretat plongent dans quelle mer ?|La Manche|La mer du Nord|L’océan Atlantique|La Méditerranée|france|2",
    "Quelle ville normande abrite la célèbre tapisserie de la reine Mathilde ?|Bayeux|Caen|Rouen|Honfleur|france|2",
    "Le pont du Gard est un aqueduc bâti par quelle civilisation ?|Les Romains|Les Gaulois|Les Grecs|Les Wisigoths|france|1",
    "Quelle ville bourguignonne est célèbre pour ses hospices aux toits vernissés ?|Beaune|Dijon|Auxerre|Cluny|france|2",
    "Depuis 2016, combien de régions compte la France métropolitaine ?|Treize|Douze|Quinze|Vingt-deux|france|2",
    "Quelle ville est le chef-lieu de la région Bretagne ?|Rennes|Brest|Nantes|Quimper|france|1",
    "Quel volcan endormi veille sur Clermont-Ferrand ?|Le puy de Dôme|Le puy de Sancy|Le puy Mary|Le mont Mézenc|france|1",
    "Les alignements de menhirs de Carnac se trouvent dans quel département ?|Le Morbihan|Le Finistère|Les Côtes-d’Armor|La Vendée|france|2",
    "Quelle est la devise de la République française ?|Liberté, Égalité, Fraternité|Travail, Famille, Patrie|Paix, Justice, Liberté|Honneur et Patrie|france|1",
    "Qui a composé La Marseillaise en 1792 ?|Rouget de Lisle|Hector Berlioz|Charles Gounod|André Grétry|france|1",
    "Dans quelle ville La Marseillaise a-t-elle été écrite ?|À Strasbourg|À Marseille|À Paris|À Lyon|france|2",
    "Quel prénom porte la figure féminine symbolisant la République ?|Marianne|Jeanne|Marguerite|Louise|france|1",
    "Quel couvre-chef coiffe Marianne ?|Le bonnet phrygien|Le béret basque|La coiffe bretonne|Le tricorne|france|1",
    "Quel animal de basse-cour est un emblème traditionnel de la France ?|Le coq|L’oie|Le canard|Le dindon|france|1",
    "Dans quel ordre se lisent les couleurs du drapeau français depuis la hampe ?|Bleu, blanc, rouge|Rouge, blanc, bleu|Bleu, rouge, blanc|Blanc, bleu, rouge|france|1",
    "Quel palais est la résidence officielle du président de la République ?|Le palais de l’Élysée|L’hôtel Matignon|Le palais Bourbon|Le Palais-Royal|france|1",
    "Dans quel palais siège le Sénat ?|Le palais du Luxembourg|Le palais Bourbon|Le palais d’Iéna|Le Grand Palais|france|2",
    "Où siègent les députés de l’Assemblée nationale ?|Au palais Bourbon|Au palais du Luxembourg|Au palais de l’Élysée|Au Grand Palais|france|2",
    "Sous quel monument parisien repose le Soldat inconnu ?|L’Arc de triomphe|Le Panthéon|Les Invalides|La Madeleine|france|1",
    "Quel monument porte l’inscription « Aux grands hommes la patrie reconnaissante » ?|Le Panthéon|Les Invalides|La Sorbonne|Le Sénat|france|2",
    "Qui a vaincu Vercingétorix à Alésia ?|Jules César|Pompée|Marc Antoine|Auguste|histoiregeo|1",
    "Quel pharaon a fait bâtir les temples d’Abou Simbel ?|Ramsès II|Khéops|Akhenaton|Thoutmôsis III|histoiregeo|2",
    "Qui a déchiffré les hiéroglyphes en 1822 ?|Champollion|Howard Carter|Auguste Mariette|Karl Lepsius|histoiregeo|1",
    "Qui fut le premier empereur romain ?|Auguste|Jules César|Néron|Caligula|histoiregeo|2",
    "Quel empereur romain fit bâtir un mur au nord de l’Angleterre ?|Hadrien|Trajan|Claude|Marc Aurèle|histoiregeo|2",
    "Quelle ville romaine était la capitale des Gaules ?|Lyon|Marseille|Narbonne|Reims|histoiregeo|3",
    "Quel conquérant mourut à Babylone à 32 ans ?|Alexandre le Grand|Hannibal|Jules César|Attila|histoiregeo|2",
    "Quel chef des Huns fut surnommé le fléau de Dieu ?|Attila|Gengis Khan|Tamerlan|Alaric|histoiregeo|2",
    "Quel traité de 843 partagea l’empire de Charlemagne ?|Le traité de Verdun|Le traité de Troyes|Le traité de Paris|Le traité d’Aix-la-Chapelle|histoiregeo|3",
    "Quelle dynastie succéda aux Mérovingiens ?|Les Carolingiens|Les Capétiens|Les Valois|Les Bourbons|histoiregeo|2",
    "Où Charles Martel arrêta-t-il les Arabes en 732 ?|Poitiers|Roncevaux|Tolbiac|Bouvines|histoiregeo|1",
    "Quel roi de France devint Saint Louis ?|Louis IX|Louis VII|Louis XI|Louis XIII|histoiregeo|2",
    "Combien d’années dura la guerre de Cent Ans ?|116 ans|100 ans|84 ans|127 ans|histoiregeo|2",
    "Qui remporta la bataille d’Hastings en 1066 ?|Guillaume le Conquérant|Harold II|Richard Cœur de Lion|Édouard le Confesseur|histoiregeo|1",
    "Dans quelle ville Jeanne d’Arc fut-elle brûlée en 1431 ?|Rouen|Orléans|Reims|Compiègne|histoiregeo|2",
    "Quel sultan prit Constantinople en 1453 ?|Mehmed II|Soliman le Magnifique|Saladin|Bajazet|histoiregeo|3",
    "Qui reprit Jérusalem aux croisés en 1187 ?|Saladin|Baybars|Soliman le Magnifique|Mehmed II|histoiregeo|3",
    "Qui fonda l’Empire mongol ?|Gengis Khan|Kubilaï Khan|Tamerlan|Attila|histoiregeo|1",
    "Quel Vénitien voyagea jusqu’en Chine au XIIIe siècle ?|Marco Polo|Ibn Battûta|Amerigo Vespucci|Vasco de Gama|histoiregeo|1",
    "Vers quelle année Gutenberg imprima-t-il sa Bible ?|Vers 1455|Vers 1395|Vers 1515|Vers 1560|histoiregeo|2",
    "Quel navigateur lança la première expédition autour du monde ?|Magellan|Vasco de Gama|Francis Drake|James Cook|histoiregeo|1",
    "Qui explora le Canada pour François Ier ?|Jacques Cartier|Champlain|La Pérouse|Cavelier de La Salle|histoiregeo|2",
    "Quel roi fit construire le château de Chambord ?|François Ier|Henri II|Louis XII|Charles VIII|histoiregeo|2",
    "Quel roi d’Angleterre eut six épouses ?|Henri VIII|Richard III|Édouard III|Jean sans Terre|histoiregeo|1",
    "Quelle reine anglaise fut surnommée la Reine vierge ?|Élisabeth Ire|Marie Tudor|Anne Boleyn|Victoria|histoiregeo|2",
    "Quel tsar fonda Saint-Pétersbourg ?|Pierre le Grand|Ivan le Terrible|Nicolas Ier|Catherine II|histoiregeo|2",
    "Quel peuple a bâti le Machu Picchu ?|Les Incas|Les Mayas|Les Aztèques|Les Olmèques|histoiregeo|1",
    "En quelle année vola la première montgolfière ?|1783|1769|1799|1815|histoiregeo|3",
    "Qui a inventé le paratonnerre ?|Benjamin Franklin|Isaac Newton|Alessandro Volta|André-Marie Ampère|histoiregeo|2",
    "Quelle reine de France fut guillotinée en 1793 ?|Marie-Antoinette|Marie de Médicis|Anne d’Autriche|Marie Leszczynska|histoiregeo|1",
    "Quelle grande victoire Napoléon remporta-t-il en 1805 ?|Austerlitz|Wagram|Iéna|Marengo|histoiregeo|1",
    "Sur quelle île Napoléon est-il mort ?|Sainte-Hélène|Elbe|Corfou|Malte|histoiregeo|1",
    "Qui fut la première épouse de Napoléon ?|Joséphine|Marie-Louise|Hortense|Marie Walewska|histoiregeo|1",
    "Quel code de lois Napoléon promulgua-t-il en 1804 ?|Le Code civil|Le Code pénal|Le Code du travail|Le Code noir|histoiregeo|1",
    "Quel pays vendit la Louisiane aux États-Unis en 1803 ?|La France|L’Espagne|L’Angleterre|Le Portugal|histoiregeo|2",
    "Qui fut le dernier empereur des Français ?|Napoléon III|Napoléon II|Charles X|Louis-Philippe|histoiregeo|2",
    "Quel chancelier unifia l’Allemagne en 1871 ?|Bismarck|Guillaume II|Metternich|Hindenburg|histoiregeo|2",
    "Qui inventa le cinématographe en 1895 ?|Les frères Lumière|Georges Méliès|Thomas Edison|Charles Pathé|histoiregeo|1",
    "En quelle année les frères Wright ont-ils volé pour la première fois ?|1903|1896|1911|1919|histoiregeo|2",
    "Qui atteignit le premier le pôle Sud en 1911 ?|Amundsen|Scott|Shackleton|Peary|histoiregeo|2",
    "Quel événement de 1914 déclencha la Grande Guerre ?|L’attentat de Sarajevo|Le naufrage du Lusitania|L’affaire d’Agadir|La dépêche d’Ems|histoiregeo|1",
    "Quelle bataille de 1916 symbolise la résistance française ?|Verdun|La Somme|Le Chemin des Dames|La Marne|histoiregeo|1",
    "Qui traversa l’Atlantique en avion en solitaire en 1927 ?|Lindbergh|Blériot|Mermoz|Costes|histoiregeo|2",
    "Qui dirigeait le Royaume-Uni pendant le Blitz ?|Churchill|Chamberlain|Attlee|Eden|histoiregeo|1",
    "Quel est le plus long fleuve d’Asie ?|Le Yangtsé|Le Mékong|Le Gange|L’Indus|histoiregeo|2",
    "Quelle mer sépare l’Italie de la Croatie ?|La mer Adriatique|La mer Égée|La mer Ionienne|La mer Tyrrhénienne|histoiregeo|2",
    "Sur quelle mer peut-on flotter sans nager ?|La mer Morte|La mer Rouge|La mer Noire|La mer Caspienne|histoiregeo|1",
    "Quelle mer ne possède aucun rivage ?|La mer des Sargasses|La mer de Corail|La mer de Tasman|La mer d’Oman|histoiregeo|3",
    "Quel est le lac le plus profond du monde ?|Le lac Baïkal|Le lac Tanganyika|Le lac Titicaca|Le lac Supérieur|histoiregeo|2",
    "Quelle est la capitale du Maroc ?|Rabat|Casablanca|Marrakech|Fès|histoiregeo|1",
    "Quelle est la capitale de la Nouvelle-Zélande ?|Wellington|Auckland|Christchurch|Hamilton|histoiregeo|2",
    "Quelle est la capitale du Vietnam ?|Hanoï|Hô Chi Minh-Ville|Da Nang|Hué|histoiregeo|1",
    "Quelle est la capitale de la Croatie ?|Zagreb|Split|Dubrovnik|Sarajevo|histoiregeo|2",
    "Quel pays a pour capitale Oulan-Bator ?|La Mongolie|Le Kazakhstan|Le Kirghizistan|L’Ouzbékistan|histoiregeo|2",
    "Quel pays arbore un cèdre vert sur son drapeau ?|Le Liban|La Syrie|La Jordanie|Chypre|histoiregeo|1",
    "Quel pays a un dragon rouge sur son drapeau ?|Le Pays de Galles|L’Écosse|L’Irlande|La Bretagne|histoiregeo|2",
    "Quel pays a une roue bleue au centre de son drapeau ?|L’Inde|Le Pakistan|Le Sri Lanka|La Birmanie|histoiregeo|1",
    "Quel pays a un drapeau formé de deux triangles ?|Le Népal|Le Bhoutan|La Mongolie|Le Laos|histoiregeo|2",
    "Quel pays montre un aigle sur un cactus sur son drapeau ?|Le Mexique|Le Pérou|Le Guatemala|L’Équateur|histoiregeo|1",
    "Quel détroit sépare la Russie de l’Alaska ?|Le détroit de Béring|Le détroit de Magellan|Le détroit de Malacca|Le détroit de Davis|histoiregeo|1",
    "Quel détroit coupe Istanbul en deux ?|Le Bosphore|Les Dardanelles|Le détroit de Messine|Le détroit d’Otrante|histoiregeo|2",
    "Quelle est la plus grande île de la Méditerranée ?|La Sicile|La Sardaigne|La Corse|La Crète|histoiregeo|2",
    "À quel pays appartient l’île de Madère ?|Le Portugal|L’Espagne|Le Maroc|L’Italie|histoiregeo|2",
    "À quel pays appartiennent les îles Canaries ?|L’Espagne|Le Portugal|Le Maroc|La France|histoiregeo|1",
    "Quel désert s’étend entre la Chine et la Mongolie ?|Le désert de Gobi|Le Taklamakan|Le Karakoum|Le Thar|histoiregeo|1",
    "Quel désert est réputé le plus aride du monde ?|L’Atacama|Le Sahara|Le Kalahari|Le Namib|histoiregeo|2",
    "Quelle est la monnaie du Japon ?|Le yen|Le yuan|Le won|Le baht|histoiregeo|1",
    "Quelle est la monnaie de l’Inde ?|La roupie|Le riyal|Le dinar|Le taka|histoiregeo|1",
    "Quelle est la monnaie du Mexique ?|Le peso|Le real|Le bolivar|Le sol|histoiregeo|1",
    "Quelle est la monnaie de la Hongrie ?|Le forint|Le zloty|La couronne|Le lev|histoiregeo|3",
    "Quelle est la monnaie de l’Afrique du Sud ?|Le rand|Le shilling|Le naira|Le franc CFA|histoiregeo|2",
    "Dans quelle ville se dresse la Sagrada Família ?|Barcelone|Madrid|Séville|Valence|histoiregeo|1",
    "Dans quel pays se trouve le Machu Picchu ?|Le Pérou|La Bolivie|L’Équateur|Le Mexique|histoiregeo|1",
    "Dans quel pays se trouvent les temples d’Angkor ?|Le Cambodge|La Thaïlande|Le Vietnam|Le Laos|histoiregeo|2",
    "Dans quel pays se trouve la cité de Pétra ?|La Jordanie|L’Égypte|Le Liban|La Syrie|histoiregeo|2",
    "Dans quelle ville se trouve la statue de la Petite Sirène ?|Copenhague|Oslo|Stockholm|Amsterdam|histoiregeo|2",
    "Dans quelle ville se trouve le pont du Golden Gate ?|San Francisco|Los Angeles|New York|Chicago|histoiregeo|1",
    "Quel est le point culminant des Alpes ?|Le Mont Blanc|Le Cervin|Le Mont Rose|Le Grand Paradis|histoiregeo|1",
    "Quelle est la plus haute cascade du monde ?|Le Salto Angel|Les chutes Victoria|Les chutes du Niagara|Les chutes d’Iguazú|histoiregeo|3",
    "Quelle est la plus longue chaîne de montagnes continentale du monde ?|La cordillère des Andes|L’Himalaya|Les Rocheuses|L’Oural|histoiregeo|2",
    "Quel pays partage la plus longue frontière terrestre avec la France ?|Le Brésil|L’Espagne|La Belgique|L’Allemagne|histoiregeo|3",
    "Quel pays entoure entièrement le Lesotho ?|L’Afrique du Sud|Le Botswana|Le Zimbabwe|La Namibie|histoiregeo|2",
    "Quel pays possède le plus de fuseaux horaires ?|La France|La Russie|Les États-Unis|La Chine|histoiregeo|3",
    "Quel pays est surnommé « le pays du Matin calme » ?|La Corée du Sud|Le Japon|La Chine|La Thaïlande|histoiregeo|2",
    "Quel volcan domine la baie de Naples ?|Le Vésuve|L’Etna|Le Stromboli|Le Vulcano|histoiregeo|1",
    "Dans quelle ville se situe l’agence Dunder Mifflin de la série The Office (US) ?|Scranton|Stamford|Pittsburgh|Albany|series|2",
    "Que vend l’entreprise Dunder Mifflin dans The Office ?|Du papier|Des photocopieuses|Des stylos|Des agrafeuses|series|1",
    "Quel acteur incarne le patron Michael Scott dans The Office (US) ?|Steve Carell|Ricky Gervais|Rainn Wilson|John Krasinski|series|2",
    "Quelle souveraine la série The Crown suit-elle ?|Élisabeth II|La reine Victoria|Élisabeth Ire|Marie Stuart|series|1",
    "Quelle actrice incarne Élisabeth II dans les deux premières saisons de The Crown ?|Claire Foy|Olivia Colman|Imelda Staunton|Helen Mirren|series|3",
    "De quel pays vient la série Squid Game (2021) ?|La Corée du Sud|Le Japon|La Chine|Taïwan|series|1r",
    "Quel jeu d’enfants ouvre les épreuves mortelles de Squid Game ?|1, 2, 3, soleil|Le tir à la corde|Les billes|La marelle|series|2r",
    "De quelle couleur sont les combinaisons des gardes masqués de Squid Game ?|Rose|Verte|Noire|Orange|series|2r",
    "Combien de joueurs participent aux jeux au début de Squid Game ?|456|100|1 000|256|series|2r",
    "Quel acteur incarne Assane Diop dans la série Lupin (2021) ?|Omar Sy|Jamel Debbouze|Ahmed Sylla|Djimon Hounsou|series|1r",
    "Quel bijou Assane Diop dérobe-t-il au Louvre dans le premier épisode de Lupin ?|Le collier de la Reine|Le diamant bleu|La couronne de Louis XV|L’anneau du Cardinal|series|2r",
    "Quel est le métier d’Emily dans la série Emily in Paris ?|Le marketing|Styliste|Journaliste|Cheffe cuisinière|series|2r",
    "Quelle actrice incarne Emily dans Emily in Paris ?|Lily Collins|Emma Stone|Zendaya|Florence Pugh|series|2r",
    "Quel surnom les fans ont-ils donné à Grogu, l’enfant de The Mandalorian ?|Bébé Yoda|Petit Jedi|Mini Chewie|Bébé Ewok|series|1r",
    "De quelle famille est issue l’héroïne de la série Mercredi (2022) ?|La famille Addams|Les Munster|Les Tenenbaum|Les Simpson|series|1r",
    "Quel réalisateur a mis en scène les premiers épisodes de la série Mercredi (2022) ?|Tim Burton|Guillermo del Toro|Wes Anderson|Sam Raimi|series|2r",
    "Comment s’appelle la main vivante qui accompagne Mercredi Addams ?|La Chose|La Pince|Le Gant|Cinq-Doigts|series|2r",
    "Dans Lost, quel accident fait échouer les héros sur une île mystérieuse ?|Un crash d’avion|Un naufrage|Une panne de sous-marin|Une tempête en montgolfière|series|1",
    "Quelle suite de nombres hante la série Lost ?|4 8 15 16 23 42|1 2 3 5 8 13|7 14 21 28 35 42|3 6 9 12 15 18|series|3",
    "Où Michael Scofield cache-t-il le plan de la prison dans Prison Break ?|Dans ses tatouages|Dans sa Bible|Dans ses chaussures|Dans un livre de cuisine|series|1",
    "Quel lien unit Michael Scofield et Lincoln Burrows dans Prison Break ?|Ils sont frères|Ils sont cousins|Père et fils|Anciens coéquipiers|series|2",
    "Quelles créatures envahissent le monde de The Walking Dead ?|Des zombies|Des vampires|Des extraterrestres|Des loups-garous|series|1",
    "Quel métier Rick Grimes exerce-t-il avant l’apocalypse de The Walking Dead ?|Shérif adjoint|Pompier|Médecin|Militaire|series|2",
    "Quel est le métier officiel de Dexter Morgan, le tueur justicier de la série Dexter ?|Expert en traces de sang|Médecin légiste|Avocat|Journaliste|series|2",
    "Dans quelle ville vit Dexter Morgan ?|Miami|Los Angeles|Chicago|La Nouvelle-Orléans|series|2",
    "Dans How I Met Your Mother, quel personnage raconte à ses enfants comment il a rencontré leur mère ?|Ted Mosby|Barney Stinson|Marshall Eriksen|Lily Aldrin|series|2",
    "Quelle tenue Barney Stinson porte-t-il en toute occasion dans How I Met Your Mother ?|Un costume|Un sweat à capuche|Un kilt|Une chemise hawaïenne|series|1",
    "Quel est le métier de Sheldon Cooper dans The Big Bang Theory ?|Physicien|Chimiste|Biologiste|Astronaute|series|1",
    "Quel jeu à cinq signes Sheldon Cooper popularise-t-il ?|Pierre-feuille-ciseaux-lézard-Spock|Pierre-feuille-ciseaux-dragon-Yoda|Pile-face-tranche-dé-joker|Pierre-feuille-ciseaux-puits-feu|series|2",
    "Quel membre de la bande de The Big Bang Theory part dans l’espace ?|Howard Wolowitz|Leonard Hofstadter|Raj Koothrappali|Sheldon Cooper|series|2",
    "Comment s’appelle la rue des héroïnes de Desperate Housewives ?|Wisteria Lane|Elm Street|Maple Drive|Sunset Boulevard|series|2",
    "Quel personnage raconte Desperate Housewives depuis l’au-delà ?|Mary Alice Young|Bree Van de Kamp|Susan Mayer|Edie Britt|series|2",
    "Dans quelle ville se déroule Grey’s Anatomy ?|Seattle|Boston|Denver|Philadelphie|series|2",
    "Quel surnom porte le docteur Derek Shepherd dans la version française de Grey’s Anatomy ?|Docteur Mamour|Docteur Glamour|Docteur Chéri|Docteur Charme|series|2",
    "Quelles créatures Buffy Summers pourchasse-t-elle ?|Les vampires|Les sorcières|Les fantômes|Les zombies|series|1",
    "Quels agents du FBI enquêtent sur le paranormal dans X-Files ?|Mulder et Scully|Starsky et Hutch|Crockett et Tubbs|Booth et Brennan|series|1",
    "Quel slogan accompagne la série X-Files en France ?|La vérité est ailleurs|Nous ne sommes pas seuls|Ils sont parmi nous|Le ciel nous observe|series|2",
    "Quelle question hante la petite ville de Twin Peaks ?|Qui a tué Laura Palmer ?|Où est passé Dale Cooper ?|Qui a volé la tarte aux cerises ?|Qui a mis le feu à la scierie ?|series|2",
    "Quel réalisateur a créé Twin Peaks avec Mark Frost ?|David Lynch|David Fincher|John Carpenter|Brian De Palma|series|3",
    "Dans quel milieu professionnel se déroule la série Mad Men ?|La publicité|La banque|La presse|Le cinéma|series|2",
    "Comment s’appelle le publicitaire héros de Mad Men ?|Don Draper|Roger Sterling|Pete Campbell|Tony Soprano|series|2",
    "Quelle professionnelle le mafieux Tony Soprano consulte-t-il en secret ?|Une psychiatre|Une avocate|Une voyante|Une coach sportive|series|2",
    "Dans quelle ville anglaise se déroule Peaky Blinders ?|Birmingham|Liverpool|Manchester|Londres|series|2",
    "Que cachent les Peaky Blinders dans la visière de leur casquette ?|Des lames de rasoir|Des cartes à jouer|Des billets de banque|Des cigarettes|series|2",
    "Quel acteur incarne Thomas Shelby dans Peaky Blinders ?|Cillian Murphy|Tom Hardy|Tom Hiddleston|Paul Anderson|series|2",
    "Quel thème traverse les épisodes de Black Mirror ?|Les dérives de la technologie|La vie des pirates|La haute cuisine|Les super-héros|series|1",
    "Quelle famille aristocratique vit à Downton Abbey ?|Les Crawley|Les Bennet|Les Windsor|Les Darcy|series|2",
    "Quel est le prénom du sorceleur héros de The Witcher ?|Geralt|Jaskier|Ciri|Yennefer|series|2r",
    "Quel acteur incarne le sorceleur dans les trois premières saisons de The Witcher ?|Henry Cavill|Chris Hemsworth|Jason Momoa|Tom Hardy|series|2r",
    "À quelle époque se déroule La Chronique des Bridgerton ?|La Régence anglaise|Le Moyen Âge|Les années 1920|La Renaissance|series|2r",
    "Qui signe la mystérieuse gazette à scandales de La Chronique des Bridgerton ?|Lady Whistledown|Lady Danbury|Lady Featherington|Lady Grantham|series|2r",
    "Pour quel service secret travaille Malotru dans Le Bureau des légendes ?|La DGSE|La DGSI|La police judiciaire|Le GIGN|series|2",
    "Quel acteur incarne Malotru dans Le Bureau des légendes ?|Mathieu Kassovitz|Vincent Cassel|Jean Dujardin|Romain Duris|series|2",
    "Quelle est la particularité de Morgane Alvaro, l’héroïne de la série HPI ?|Un haut potentiel intellectuel|Des dons de médium|Une amnésie totale|Une mémoire des odeurs|series|1r",
    "Quel est le métier de Morgane Alvaro au début de la série HPI ?|Femme de ménage|Serveuse|Chauffeuse de taxi|Coiffeuse|series|2r",
    "Quelle actrice incarne Morgane Alvaro dans HPI ?|Audrey Fleurot|Alexandra Lamy|Laetitia Casta|Julie de Bona|series|2r",
    "Dans quelle ville se déroule la série HPI ?|Lille|Lyon|Nantes|Bordeaux|series|3r",
    "Quel couvre-chef porte la gendarme Capitaine Marleau ?|Une chapka|Un béret|Un bob|Un chapeau de cow-boy|series|2",
    "Quelle actrice incarne Capitaine Marleau ?|Corinne Masiero|Yolande Moreau|Josiane Balasko|Valérie Lemercier|series|2",
    "Dans quel univers musical se déroule la série Validé de Franck Gastambide ?|Le rap|Le rock|La techno|Le jazz|series|2r",
    "Quel est le métier du personnage de Frédéric Pierrot dans la série En thérapie ?|Psychanalyste|Chirurgien|Avocat|Prêtre|series|2r",
    "Quelle série de M6 enchaîne de courtes saynètes de la vie de plusieurs couples ?|Scènes de ménages|Un gars, une fille|Caméra Café|Nos chers voisins|series|2",
    "Quel inspecteur allemand a occupé les écrans de 1974 à 1998, flanqué de son adjoint Harry ?|Derrick|Le Renard|Rex|Tatort|series|2",
    "De quelle race est Rex, le chien flic de la série autrichienne ?|Un berger allemand|Un malinois|Un labrador|Un husky|series|1",
    "Quel outil MacGyver utilise-t-il pour se sortir de toutes les situations ?|Un couteau suisse|Un tournevis|Une lampe torche|Un briquet|series|1",
    "Dans quel archipel le détective Magnum mène-t-il ses enquêtes ?|Hawaï|Les Bahamas|Les Keys|Porto Rico|series|2",
    "À quoi ressemble la Ford Gran Torino de Starsky et Hutch ?|Rouge avec une bande blanche|Noire et chromée|Jaune à damier|Bleue à flammes|series|2",
    "Comment s’appelle la voiture intelligente de K2000 ?|KITT|KARR|HAL|R2|series|1",
    "Quel acteur incarne Michael Knight dans K2000 ?|David Hasselhoff|Tom Selleck|Lee Majors|Don Johnson|series|2",
    "Quel est le métier des héros d’Alerte à Malibu ?|Sauveteurs en mer|Policiers|Surfeurs professionnels|Garde-côtes militaires|series|1",
    "Quel acteur a été révélé par le rôle du docteur Ross dans Urgences ?|George Clooney|Brad Pitt|Noah Wyle|Anthony Edwards|series|2",
    "Dans quelle ville se déroule la série Urgences ?|Chicago|Seattle|Boston|New York|series|2",
    "Dans quelle ville enquêtent les premiers Experts de la série américaine ?|Las Vegas|Miami|Manhattan|La Nouvelle-Orléans|series|2",
    "Quel acteur a débuté dans la série Le Prince de Bel-Air ?|Will Smith|Denzel Washington|Eddie Murphy|Chris Rock|series|1",
    "Que remue Samantha pour faire de la magie dans Ma sorcière bien-aimée ?|Le bout de son nez|Ses oreilles|Sa baguette|Ses doigts de pied|series|2",
    "De quel type d’œuvre la série The Last of Us (2023) est-elle adaptée ?|D’un jeu vidéo|D’un roman|D’une bande dessinée|D’un film|series|1r",
    "Quel champignon transforme les humains en créatures dans The Last of Us ?|Le cordyceps|L’amanite|Le mildiou|La truffe|series|3r",
    "Quel acteur incarne Joel dans la série The Last of Us ?|Pedro Pascal|Oscar Isaac|Jon Bernthal|Joel Kinnaman|series|2r",
    "Quelle famille est au cœur de House of the Dragon (2022) ?|Les Targaryen|Les Stark|Les Lannister|Les Greyjoy|series|1r",
    "Quel sport l’Américain Ted Lasso vient-il entraîner en Angleterre ?|Le football|Le rugby|Le cricket|Le basket-ball|series|1r",
    "Quelle famille se déchire pour un empire médiatique dans Succession ?|Les Roy|Les Crawley|Les Ewing|Les Carrington|series|2r",
    "Quel personnage machiavélique fait la légende de la série Dallas ?|J.R. Ewing|Bobby Ewing|Cliff Barnes|Blake Carrington|series|2",
    "Dans quel secteur la famille Ewing de Dallas a-t-elle fait fortune ?|Le pétrole|L’acier|L’automobile|Le cinéma|series|1",
    "Quelle catastrophe raconte la mini-série Chernobyl (2019) ?|Un accident nucléaire|Un tremblement de terre|Un naufrage|Une épidémie|series|1r",
    "À quel jeu excelle Beth Harmon dans Le Jeu de la dame ?|Les échecs|Le poker|Le go|Le billard|series|1r",
    "Quelle actrice incarne Beth Harmon dans Le Jeu de la dame ?|Anya Taylor-Joy|Emma Stone|Florence Pugh|Saoirse Ronan|series|2r",
    "De quel jeu vidéo la série animée Arcane est-elle tirée ?|League of Legends|Fortnite|Overwatch|World of Warcraft|series|2r",
    "Quel studio français a animé la série Arcane ?|Fortiche|Ubisoft|Xilam|Folimage|series|3r",
    "Quel est le métier de Jean Milburn, la mère d’Otis, dans Sex Education ?|Sexologue|Chirurgienne|Avocate|Professeure de chimie|series|2r",
    "Dans quel type d’établissement se déroule la série espagnole Élite ?|Un lycée huppé|Un hôpital|Une prison|Un commissariat|series|2r",
    "De quel pays vient la série à voyages temporels Dark ?|L’Allemagne|Le Danemark|La Suède|La Norvège|series|2r",
    "Dans quelle ville est tourné le feuilleton Demain nous appartient ?|Sète|Montpellier|Marseille|Nice|series|2r",
    "Quel métier apprennent les élèves de l’institut d’Ici tout commence ?|La cuisine|La danse|La médecine|Le journalisme|series|2r",
    "Dans quelle ville se déroule le feuilleton Un si grand soleil ?|Montpellier|Toulon|Nice|Perpignan|series|3r",
    "Sur quelle chaîne Plus belle la vie a-t-elle fait son retour en 2024 ?|TF1|France 3|M6|Netflix|series|3r",
    "Quel est le titre original de Chapeau melon et bottes de cuir ?|The Avengers|The Saint|The Persuaders|The Prisoner|series|3",
    "Quel numéro désigne le héros de la série Le Prisonnier ?|Le numéro 6|Le numéro 1|Le numéro 2|Le numéro 7|series|3",
    "Quel ancien faux médium aide la police dans The Mentalist ?|Patrick Jane|Adrian Monk|Shawn Spencer|Richard Castle|series|2",
    "De quel trouble souffre le détective Adrian Monk ?|De troubles obsessionnels compulsifs|D’amnésie|De cécité|De narcolepsie|series|2",
    "Quel est le métier de Richard Castle, qui aide la police de New York ?|Romancier|Médecin|Avocat|Photographe|series|2",
    "Quelle est la spécialité de Temperance Brennan dans Bones ?|L’anthropologie judiciaire|La cardiologie|La balistique|La psychiatrie|series|2",
    "Quel agent antiterroriste vit ses journées en temps réel dans 24 heures chrono ?|Jack Bauer|Jack Ryan|Jason Bourne|Ethan Hunt|series|2",
    "Quelle devise répète la famille Stark dans Game of Thrones ?|L’hiver vient|Le feu et le sang|Nous ne semons pas|Nôtre est la fureur|series|1",
    "En quelle année s’est achevée la série Game of Thrones ?|2019|2017|2021|2015|series|2r",
    "Dans quelle petite ville du Colorado vivent Stan, Kyle, Cartman et Kenny ?|South Park|Springfield|Quahog|Hawkins|series|1",
    "Comment s’appelle le chien qui parle dans Les Griffin ?|Brian|Stewie|Peter|Snoopy|series|2",
    "Quel robot au caractère impossible accompagne Fry dans Futurama ?|Bender|Marvin|Robby|Wall-E|series|2",
    "Quel lien unit Rick et Morty dans la série animée du même nom ?|Grand-père et petit-fils|Père et fils|Oncle et neveu|Simples voisins|series|2",
    "Quelle cabine de police bleue sert de vaisseau au Docteur dans Doctor Who ?|Le TARDIS|L’Enterprise|Le Nautilus|Le Faucon|series|2",
    "En quelle année Doctor Who a-t-elle été diffusée pour la première fois ?|1963|1971|1985|1955|series|3",
    "Comment s’appelle le vaisseau du capitaine Kirk dans Star Trek ?|L’Enterprise|Le Galactica|Le Nostromo|Le Discovery One|series|1",
    "À quel peuple appartient M. Spock dans Star Trek ?|Les Vulcains|Les Klingons|Les Romuliens|Les Borgs|series|2",
    "Quel acteur britannique a incarné Hercule Poirot à la télévision de 1989 à 2013 ?|David Suchet|Peter Ustinov|Kenneth Branagh|Albert Finney|series|3",
    "Quel acteur a incarné le commissaire Maigret à la télévision de 1991 à 2005 ?|Bruno Cremer|Jean Richard|Gérard Depardieu|Michel Bouquet|series|3",
    "Dans quel quartier chic de New York vivent les héros de Gossip Girl ?|L’Upper East Side|Brooklyn|Harlem|Le Bronx|series|2",
    "Quel manga Netflix a-t-il adapté en série avec de vrais acteurs en 2023, avec Luffy ?|One Piece|Naruto|Dragon Ball|Bleach|series|1r",
    "Dans quel pays se déroule la série Shōgun (2024) ?|Le Japon|La Chine|La Corée|Le Vietnam|series|1r",
    "Dans quel milieu se déroule la série The Bear ?|La restauration|La boxe|La police|La finance|series|2r",
    "Quel acteur incarne le député Philippe Rickwaert dans Baron noir ?|Kad Merad|Dany Boon|Gérard Lanvin|François Cluzet|series|2r",
    "Quelle particularité a Astrid, la documentaliste de la série Astrid et Raphaëlle ?|Elle est autiste|Elle est aveugle|Elle est muette|Elle est amnésique|series|2r",
    "Qui a créé la série Bref et y tient le rôle principal ?|Kyan Khojandi|Norman Thavaud|Cyprien Iov|Jonathan Cohen|series|2",
    "Sur quelle plateforme la série Stranger Things est-elle diffusée ?|Netflix|Disney+|Prime Video|Canal+|series|1r",
    "Quelle série de TF1 met en scène des voisins d’immeuble qui se croisent sur leur palier ?|Nos chers voisins|Scènes de ménages|En famille|Camping Paradis|series|2",
    "Quel acteur incarne Tom, le patron d’un camping, dans Camping Paradis ?|Laurent Ournac|Franck Dubosc|Kad Merad|Patrick Bosso|series|2",
    "Quel film de Bong Joon-ho a remporté la Palme d’or 2019 puis l’Oscar du meilleur film ?|Parasite|Burning|Okja|Memories of Murder|cinema|2r",
    "Quel film de Justine Triet a remporté la Palme d’or 2023 ?|Anatomie d’une chute|Titane|Les Misérables|La Vie d’Adèle|cinema|2r",
    "Quelle réalisatrice française a reçu la Palme d’or 2021 pour Titane ?|Julia Ducournau|Justine Triet|Céline Sciamma|Mati Diop|cinema|3r",
    "Quel film a remporté l’Oscar du meilleur film en 2024 ?|Oppenheimer|Barbie|Killers of the Flower Moon|Pauvres Créatures|cinema|2r",
    "Quel réalisateur a signé Oppenheimer (2023) ?|Christopher Nolan|Denis Villeneuve|Steven Spielberg|Ridley Scott|cinema|1r",
    "Quelle célèbre poupée Margot Robbie incarne-t-elle au cinéma en 2023 ?|Barbie|Sindy|Polly Pocket|Bratz|cinema|1r",
    "Qui a réalisé le film Barbie (2023) ?|Greta Gerwig|Sofia Coppola|Emerald Fennell|Olivia Wilde|cinema|2r",
    "Quel film a remporté l’Oscar du meilleur film en 2023 ?|Everything Everywhere All at Once|Top Gun : Maverick|Avatar : La Voie de l’eau|Les Banshees d’Inisherin|cinema|3r",
    "Quel film a reçu l’Oscar du meilleur film en 2017 après une confusion d’enveloppe avec La La Land ?|Moonlight|Manchester by the Sea|Lion|Fences|cinema|3r",
    "Sur quelle planète désertique se déroule Dune (2021) ?|Arrakis|Tatooine|Pandora|Jakku|cinema|2r",
    "Quel acteur incarne Paul Atréides dans Dune (2021) ?|Timothée Chalamet|Tahar Rahim|Louis Garrel|Vincent Lacoste|cinema|1r",
    "Qui a réalisé Dune (2021) et Dune : Deuxième partie (2024) ?|Denis Villeneuve|Ridley Scott|David Lynch|Christopher Nolan|cinema|2r",
    "Quel film Marvel de 2019 conclut l’affrontement des Avengers contre Thanos ?|Avengers : Endgame|Avengers : Infinity War|Captain America : Civil War|Avengers : L’Ère d’Ultron|cinema|2r",
    "De quel pays fictif T’Challa est-il le roi dans Black Panther (2018) ?|Le Wakanda|Le Zamunda|La Latvérie|La Genovia|cinema|2r",
    "Quelle nouvelle émotion orange prend les commandes dans Vice-versa 2 (2024) ?|Anxiété|Joie|Colère|Tristesse|cinema|2r",
    "Quelle fête mexicaine est au cœur du film Pixar Coco (2017) ?|Le jour des Morts|Le carnaval|Noël|La fête de l’Indépendance|cinema|2r",
    "Quel film d’animation Disney de 2016 suit une lapine devenue policière ?|Zootopie|Vaiana|Tous en scène|Comme des bêtes|cinema|2r",
    "Comment s’appelle la jeune navigatrice polynésienne du Disney de 2016 ?|Vaiana|Raya|Mirabel|Mulan|cinema|1r",
    "Dans Encanto (2021), de quel membre de la famille Madrigal « on ne parle pas » ?|Bruno|Mirabel|Luisa|Isabela|cinema|2r",
    "Qui a réalisé Les Misérables (2019), prix du jury à Cannes ?|Ladj Ly|Mathieu Kassovitz|Romain Gavras|Houda Benyamina|cinema|3r",
    "Quel acteur incarne Astérix dans L’Empire du Milieu (2023) ?|Guillaume Canet|Christian Clavier|Clovis Cornillac|Édouard Baer|cinema|2r",
    "Qui succède à Gérard Depardieu dans le rôle d’Obélix en 2023 ?|Gilles Lellouche|Jean Dujardin|José Garcia|Vincent Cassel|cinema|2r",
    "Quel acteur incarne d’Artagnan dans Les Trois Mousquetaires (2023) ?|François Civil|Pierre Niney|Romain Duris|Vincent Lacoste|cinema|3r",
    "Quel acteur incarne Edmond Dantès dans Le Comte de Monte-Cristo (2024) ?|Pierre Niney|François Civil|Jean Dujardin|Tahar Rahim|cinema|2r",
    "Dans quel film de 2022 Tom Cruise redevient-il pilote de chasse ?|Top Gun : Maverick|Mission : impossible|Edge of Tomorrow|Oblivion|cinema|1r",
    "Quelle suite d’Avatar, sortie en 2022, explore les océans de Pandora ?|La Voie de l’eau|De feu et de cendres|Le Dernier Maître de l’air|Les Abysses|cinema|1r",
    "Quel acteur incarne le Joker dans le film Joker (2019) ?|Joaquin Phoenix|Jared Leto|Heath Ledger|Jack Nicholson|cinema|2r",
    "Quel film de Tarantino (2019) se déroule à Hollywood en 1969 ?|Once Upon a Time… in Hollywood|Django Unchained|Les Huit Salopards|Jackie Brown|cinema|2r",
    "Dans quelle ville se déroule la comédie musicale La La Land (2016) ?|Los Angeles|New York|Paris|Chicago|cinema|1r",
    "Quel acteur incarne Peter Parker dans Spider-Man : Homecoming (2017) ?|Tom Holland|Andrew Garfield|Tobey Maguire|Miles Teller|cinema|2r",
    "Quelle actrice incarne Wonder Woman au cinéma depuis 2016 ?|Gal Gadot|Scarlett Johansson|Brie Larson|Margot Robbie|cinema|2r",
    "Quel film de 2018 retrace la carrière de Freddie Mercury et de Queen ?|Bohemian Rhapsody|Rocketman|A Star Is Born|Elvis|cinema|1r",
    "Quel acteur a reçu l’Oscar pour son rôle de Freddie Mercury ?|Rami Malek|Taron Egerton|Austin Butler|Bradley Cooper|cinema|2r",
    "Quel film de Guillermo del Toro, Oscar du meilleur film en 2018, unit une femme muette et une créature aquatique ?|La Forme de l’eau|Le Labyrinthe de Pan|Crimson Peak|Nightmare Alley|cinema|3r",
    "Quel film de guerre de Sam Mendes (2019) semble tourné en un seul plan-séquence ?|1917|Dunkerque|Fury|Hacksaw Ridge|cinema|2r",
    "Quel réalisateur a signé Dunkerque (2017) ?|Christopher Nolan|Sam Mendes|Ridley Scott|Steven Spielberg|cinema|2r",
    "Quel film d’horreur de Jordan Peele a reçu l’Oscar du meilleur scénario original en 2018 ?|Get Out|Us|Nope|It Follows|cinema|3r",
    "Quel film avec Artus a attiré plus de 10 millions de spectateurs en France en 2024 ?|Un p’tit truc en plus|L’Amour ouf|Le Comte de Monte-Cristo|Bis repetita|cinema|3r",
    "Quel réalisateur a tourné Les Parapluies de Cherbourg (1964) ?|Jacques Demy|François Truffaut|Claude Lelouch|Éric Rohmer|cinema|2",
    "Quel film de Claude Lelouch a reçu la Palme d’or en 1966 ?|Un homme et une femme|Vivre pour vivre|L’aventure c’est l’aventure|Les Uns et les Autres|cinema|3",
    "Quel acteur tient le rôle principal d’À bout de souffle de Godard (1960) ?|Jean-Paul Belmondo|Alain Delon|Jean Gabin|Lino Ventura|cinema|2",
    "Qui incarne le commissaire Juve dans la trilogie Fantômas des années 1960 ?|Louis de Funès|Jean Marais|Bourvil|Michel Galabru|cinema|2",
    "Dans quel film de Luc Besson Jean Reno joue-t-il un tueur à gages qui recueille une fillette ?|Léon|Nikita|Subway|Le Cinquième Élément|cinema|2",
    "Quel film de Mathieu Kassovitz (1995) suit trois jeunes de banlieue pendant 24 heures ?|La Haine|Assassin(s)|Les Rivières pourpres|Métisse|cinema|2",
    "Qui a écrit et réalisé Le Dîner de cons (1998) ?|Francis Veber|Gérard Oury|Claude Zidi|Patrice Leconte|cinema|2",
    "Comment s’appelle le personnage de Jacques Villeret dans Le Dîner de cons ?|François Pignon|Pierre Brochant|Juste Leblanc|Lucien Cheval|cinema|2",
    "Quel film fait voyager un chevalier du XIIe siècle et son écuyer jusqu’en 1992 ?|Les Visiteurs|Les Couloirs du temps|Les Anges gardiens|Le Bossu|cinema|1",
    "Quel film de Cédric Klapisch suit des étudiants Erasmus à Barcelone ?|L’Auberge espagnole|Les Poupées russes|Casse-tête chinois|Le Péril jeune|cinema|2",
    "Quel film de Hayao Miyazaki a reçu l’Oscar du meilleur film d’animation en 2024 ?|Le Garçon et le Héron|Suzume|Belle|Ponyo sur la falaise|cinema|3r",
    "Quel film sud-coréen de 2016 enferme des voyageurs et des zombies dans un train ?|Dernier train pour Busan|Snowpiercer|Old Boy|The Host|cinema|2r",
    "Pour quel film Leonardo DiCaprio a-t-il enfin reçu l’Oscar du meilleur acteur en 2016 ?|The Revenant|Le Loup de Wall Street|Inception|Titanic|cinema|2r",
    "Quelle actrice a reçu l’Oscar en 2017 pour La La Land ?|Emma Stone|Natalie Portman|Jennifer Lawrence|Isabelle Huppert|cinema|2r",
    "Dans quel film de Christopher Nolan (2014) Matthew McConaughey traverse-t-il un trou de ver ?|Interstellar|Inception|Tenet|Gravity|cinema|1",
    "Quel petit droïde orange et blanc apparaît dans Star Wars : Le Réveil de la Force ?|BB-8|R2-D2|K-2SO|C-3PO|cinema|2",
    "Quel sorcier Marvel Benedict Cumberbatch incarne-t-il depuis 2016 ?|Doctor Strange|Loki|Magneto|Le Mandarin|cinema|2r",
    "Quel monstre japonais revient dans un film de 2023 récompensé par l’Oscar des effets visuels ?|Godzilla|King Kong|Mothra|Gamera|cinema|2r",
    "Dans quelle comédie de 2014 les quatre filles d’un couple catholique épousent-elles des hommes d’origines différentes ?|Qu’est-ce qu’on a fait au Bon Dieu ?|Bienvenue chez les Ch’tis|Les Tuche|La Ch’tite Famille|cinema|2",
    "Quel acteur incarne Claude Verneuil dans Qu’est-ce qu’on a fait au Bon Dieu ?|Christian Clavier|Gérard Jugnot|Thierry Lhermitte|Michel Blanc|cinema|2",
    "Quelle famille de Bouzolles fait fortune au loto dans une comédie de 2011 ?|Les Tuche|Les Bélier|Les Verneuil|Les Duquenne|cinema|1",
    "Quel acteur incarne Jeff Tuche ?|Jean-Paul Rouve|Kad Merad|Dany Boon|Franck Dubosc|cinema|2",
    "Quel Spider-Man est le héros des films d’animation Into the Spider-Verse et Across the Spider-Verse ?|Miles Morales|Peter Parker|Gwen Stacy|Ben Reilly|cinema|2r",
    "Quel plombier moustachu a eu droit à son film d’animation en 2023 ?|Mario|Wario|Luigi|Sonic|cinema|1r",
    "Quel film d’animation letton sans dialogue, où un chat survit à une inondation, a reçu l’Oscar en 2025 ?|Flow|Le Robot sauvage|Vice-versa 2|Wallace et Gromit|cinema|3r",
    "Quel film a remporté l’Oscar du meilleur film en 2025 ?|Anora|The Brutalist|Emilia Pérez|Conclave|cinema|3r",
    "Quel film de Jacques Audiard a obtenu 13 nominations aux Oscars 2025 ?|Emilia Pérez|Un prophète|De rouille et d’os|Dheepan|cinema|3r",
    "Quel acteur incarne Jacquouille la Fripouille dans Les Visiteurs ?|Christian Clavier|Jean Reno|Gérard Jugnot|Thierry Lhermitte|cinema|2",
    "Quel film de Jacques Audiard a reçu la Palme d’or en 2015 ?|Dheepan|Un prophète|De rouille et d’os|Les Olympiades|cinema|3",
    "Quelle actrice incarne Adèle dans La Vie d’Adèle, Palme d’or 2013 ?|Adèle Exarchopoulos|Léa Seydoux|Adèle Haenel|Marion Cotillard|cinema|2",
    "Pour quel rôle Marion Cotillard a-t-elle reçu l’Oscar en 2008 ?|Édith Piaf|Coco Chanel|Dalida|Barbara|cinema|2",
    "Quel agent secret français Jean Dujardin incarne-t-il dans une parodie de 2006 ?|OSS 117|Le Magnifique|L’As des as|Le Grand Blond|cinema|1",
    "Quelle chanteuse a représenté la France à l’Eurovision 2021 avec « Voilà » ?|Barbara Pravi|Amir|Louane|Angèle|musique|2r",
    "Quel groupe italien a remporté l’Eurovision 2021 ?|Måneskin|Il Volo|Negramaro|Pinguini Tattici Nucleari|musique|2r",
    "Quel artiste suisse a remporté l’Eurovision 2024 avec « The Code » ?|Nemo|Baby Lasagna|Slimane|Joost Klein|musique|3r",
    "Quelle chanteuse suédoise a gagné l’Eurovision en 2012 puis en 2023 ?|Loreen|Robyn|Zara Larsson|Tove Lo|musique|3r",
    "Quelle chanteuse américaine a sorti les albums « 1989 » et « Midnights » ?|Taylor Swift|Katy Perry|Ariana Grande|Billie Eilish|musique|1r",
    "Comment s’appelle la tournée géante de Taylor Swift lancée en 2023 ?|The Eras Tour|The Reputation Tour|The Red Tour|Midnights Live|musique|2r",
    "Quelle jeune chanteuse a triomphé en 2019 avec « Bad Guy » ?|Billie Eilish|Dua Lipa|Lorde|Olivia Rodrigo|musique|1r",
    "Quel chanteur canadien a sorti le tube « Blinding Lights » ?|The Weeknd|Drake|Justin Bieber|Shawn Mendes|musique|2r",
    "Quelle chanteuse britannique a sorti « Levitating » en 2020 ?|Dua Lipa|Adele|Rita Ora|Jessie J|musique|2r",
    "Quel chanteur britannique a sorti « Shape of You » en 2017 ?|Ed Sheeran|Sam Smith|Harry Styles|James Arthur|musique|1r",
    "Quel tube de Luis Fonsi et Daddy Yankee a dominé l’année 2017 ?|Despacito|La Bicicleta|Bailando|Danza Kuduro|musique|1r",
    "Quel groupe sud-coréen de sept membres compte RM et Jungkook ?|BTS|Blackpink|EXO|Big Bang|musique|1r",
    "Quel titre de PSY a été la première vidéo à dépasser le milliard de vues sur YouTube ?|Gangnam Style|Gentleman|Daddy|Hangover|musique|2",
    "Quelle chanteuse a interprété « Dernière danse » en 2013 ?|Indila|Zaz|Louane|Imany|musique|2",
    "Quelle chanteuse a connu le succès en 2010 avec « Je veux » ?|Zaz|Nolwenn Leroy|Olivia Ruiz|Camille|musique|2",
    "Avec qui Angèle chante-t-elle « Tout oublier » en 2018 ?|Son frère Roméo Elvis|Stromae|Damso|Orelsan|musique|2r",
    "Quelle chanteuse a sorti le tube « Djadja » en 2018 ?|Aya Nakamura|Wejdene|Vitaa|Imen Es|musique|1r",
    "Quelle chanteuse a chanté « Hymne à l’amour » sur la tour Eiffel à l’ouverture des JO de Paris 2024 ?|Céline Dion|Mylène Farmer|Lady Gaga|Aya Nakamura|musique|2r",
    "Quelle star américaine a chanté « Mon truc en plumes » à l’ouverture des JO de Paris 2024 ?|Lady Gaga|Beyoncé|Madonna|Taylor Swift|musique|2r",
    "Quel groupe de métal français a joué sur les fenêtres de la Conciergerie à l’ouverture des JO 2024 ?|Gojira|Trust|Mass Hysteria|Indochine|musique|3r",
    "Quel duo de frères rappeurs a sorti « Au DD » en 2019 ?|PNL|Bigflo et Oli|Casseurs Flowters|Lunatic|musique|2r",
    "Quel duo toulousain de frères a sorti « Dommage » en 2017 ?|Bigflo et Oli|PNL|Les Twins|Ofenbach|musique|2r",
    "Quel rappeur a sorti l’album « Civilisation » en 2021 ?|Orelsan|Nekfeu|Booba|Damso|musique|2r",
    "Quel est le titre de l’album de Stromae sorti en 2022 ?|Multitude|Racine carrée|Cheese|Santé|musique|3r",
    "Quel DJ français a produit « Titanium » avec la chanteuse Sia ?|David Guetta|Bob Sinclar|Martin Solveig|DJ Snake|musique|2",
    "Quel DJ français a produit « Taki Taki » en 2018 ?|DJ Snake|David Guetta|Kungs|Petit Biscuit|musique|2r",
    "Quel duo français a chanté « Get Lucky » en 2013 ?|Daft Punk|Justice|Air|Cassius|musique|1",
    "Quel groupe britannique a sorti « Yellow » et « Viva la Vida » ?|Coldplay|Muse|Radiohead|Keane|musique|1",
    "Quel rappeur américain a reçu le prix Pulitzer de musique en 2018 ?|Kendrick Lamar|Drake|Jay-Z|Kanye West|musique|3r",
    "Quelle chanteuse a assuré le spectacle de la mi-temps du Super Bowl 2023, enceinte ?|Rihanna|Beyoncé|Shakira|Jennifer Lopez|musique|2r",
    "Quel rappeur a assuré la mi-temps du Super Bowl 2025 ?|Kendrick Lamar|Eminem|Drake|Travis Scott|musique|3r",
    "Quel compositeur italien a écrit la musique d’Il était une fois dans l’Ouest ?|Ennio Morricone|Nino Rota|Riz Ortolani|Luis Bacalov|musique|2",
    "Quel compositeur a signé la musique du film Le Fabuleux Destin d’Amélie Poulain ?|Yann Tiersen|Alexandre Desplat|Michel Legrand|Vladimir Cosma|musique|2",
    "Dans quel opéra de Mozart chante l’oiseleur Papageno ?|La Flûte enchantée|Don Giovanni|Les Noces de Figaro|Così fan tutte|musique|2",
    "Quel compositeur russe a écrit le ballet Le Lac des cygnes ?|Tchaïkovski|Stravinsky|Prokofiev|Rimski-Korsakov|musique|2",
    "Quel saxophoniste a enregistré l’album « A Love Supreme » ?|John Coltrane|Charlie Parker|Sonny Rollins|Stan Getz|musique|3",
    "Quel quartet de jazz a enregistré le célèbre « Take Five » en 1959 ?|Le Dave Brubeck Quartet|Le Modern Jazz Quartet|Le quartet de Miles Davis|Le quartet de Stan Getz|musique|3",
    "Quel guitariste manouche a fondé le Quintette du Hot Club de France ?|Django Reinhardt|Biréli Lagrène|Stéphane Grappelli|Manitas de Plata|musique|2",
    "Quelle chanteuse britannique a interprété « Rolling in the Deep » et « Hello » ?|Adele|Amy Winehouse|Duffy|Lily Allen|musique|1",
    "Quel groupe américain chante « Hotel California » ?|Eagles|The Doors|Lynyrd Skynyrd|Fleetwood Mac|musique|2",
    "Quel groupe australien a chanté « Highway to Hell » ?|AC/DC|INXS|Midnight Oil|Men at Work|musique|1",
    "Quel chanteur américain est surnommé « The Boss » ?|Bruce Springsteen|Bob Dylan|Tom Petty|Billy Joel|musique|2",
    "Quel groupe britannique a sorti « Wonderwall » en 1995 ?|Oasis|Blur|Pulp|Radiohead|musique|1",
    "Quelle chanteuse barbadienne a interprété « Umbrella » et « Diamonds » ?|Rihanna|Beyoncé|Nicki Minaj|Alicia Keys|musique|2",
    "Quelle chanteuse a sorti le tube « Flowers » en 2023 ?|Miley Cyrus|Selena Gomez|Demi Lovato|Ariana Grande|musique|2r",
    "Quel chanteur britannique a chanté « As It Was » en 2022 ?|Harry Styles|Ed Sheeran|Sam Smith|Lewis Capaldi|musique|2r",
    "Quelle chanteuse américaine a sorti l’album « Renaissance » en 2022 ?|Beyoncé|Rihanna|Lady Gaga|Lizzo|musique|3r",
    "Quelle chanteuse révélée par The Voice a sorti « Jour 1 » en 2015 ?|Louane|Zaz|Jenifer|Nolwenn Leroy|musique|2",
    "Quelle chanteuse a sorti « Désenchantée » en 1991 ?|Mylène Farmer|Jeanne Mas|Patricia Kaas|Vanessa Paradis|musique|1",
    "Quelle chanson de Michel Sardou chante l’héroïne de La Famille Bélier ?|Je vole|Les Lacs du Connemara|En chantant|La Maladie d’amour|musique|2",
    "Quel groupe de rock français a chanté « Le vent nous portera » ?|Noir Désir|Indochine|Téléphone|Louise Attaque|musique|2",
    "Quelle chanteuse a sorti « La Grenade » en 2018 ?|Clara Luciani|Juliette Armanet|Pomme|Suzane|musique|2r",
    "Quelle chanteuse a sorti « Le dernier jour du disco » en 2021 ?|Juliette Armanet|Clara Luciani|Angèle|Zaho de Sagazan|musique|3r",
    "Quel chanteur belge a sorti le titre festif « Santé » en 2021 ?|Stromae|Angèle|Damso|Arno|musique|2r",
    "Quel rappeur marseillais a réuni d’autres artistes sur « Bande organisée » en 2020 ?|Jul|SCH|Soprano|Alonzo|musique|2r",
    "Combien de cordes compte une harpe de concert ?|47|36|52|28|musique|3",
    "Combien de symphonies Beethoven a-t-il composées ?|Neuf|Sept|Douze|Cinq|musique|2",
    "Quel compositeur a écrit la célèbre « Marche turque » ?|Mozart|Beethoven|Haydn|Schubert|musique|2",
    "Quelle cantatrice d’origine grecque était surnommée « la Divine » ?|Maria Callas|Montserrat Caballé|Renata Tebaldi|Jessye Norman|musique|2",
    "Quel ténor italien formait les Trois Ténors avec Plácido Domingo et José Carreras ?|Luciano Pavarotti|Andrea Bocelli|Roberto Alagna|Enrico Caruso|musique|2",
    "Quel festival de musique se tient chaque été à Carhaix, en Bretagne ?|Les Vieilles Charrues|Les Francofolies|Rock en Seine|Les Eurockéennes|musique|2",
    "Quelle chanteuse a chanté « Voyage, voyage » en 1986 ?|Desireless|Jeanne Mas|Elsa|Mylène Farmer|musique|2",
    "Quelle chanteuse a interprété « Mourir sur scène » ?|Dalida|Barbara|Édith Piaf|Nana Mouskouri|musique|2",
    "Quel chanteur a interprété « Le Téléphone pleure » ?|Claude François|Mike Brant|Joe Dassin|C. Jérôme|musique|2",
    "Quel groupe a chanté « Les Démons de minuit » en 1986 ?|Images|Début de Soirée|Gold|Partenaire Particulier|musique|2",
    "Quel chanteur a interprété « Place des grands hommes » ?|Patrick Bruel|Jean-Jacques Goldman|Francis Cabrel|Pascal Obispo|musique|2",
    "Quel groupe a sorti « J’ai demandé à la lune » en 2002 ?|Indochine|Téléphone|Noir Désir|Kyo|musique|2",
    "De quel instrument jouait le jazzman Miles Davis ?|La trompette|Le saxophone|Le piano|La contrebasse|musique|1",
    "Quel pays a remporté la Coupe du monde de football 2022 au Qatar ?|L’Argentine|La France|Le Maroc|La Croatie|sport|1r",
    "Quelle équipe africaine a atteint les demi-finales de la Coupe du monde 2022 ?|Le Maroc|Le Sénégal|Le Cameroun|La Tunisie|sport|2r",
    "Quel joueur français a reçu le Ballon d’or 2022 ?|Karim Benzema|Kylian Mbappé|Antoine Griezmann|N’Golo Kanté|sport|2r",
    "Quel joueur a remporté le Ballon d’or à huit reprises ?|Lionel Messi|Cristiano Ronaldo|Michel Platini|Johan Cruyff|sport|1r",
    "Quel milieu espagnol a reçu le Ballon d’or 2024 ?|Rodri|Lamine Yamal|Dani Carvajal|Pedri|sport|3r",
    "Quel pays a remporté l’Euro 2024 en Allemagne ?|L’Espagne|L’Angleterre|La France|Les Pays-Bas|sport|2r",
    "Quel pays a remporté l’Euro 2016, organisé en France ?|Le Portugal|La France|L’Allemagne|Le pays de Galles|sport|2r",
    "Quel pays a remporté l’Euro 2020, disputé en 2021 ?|L’Italie|L’Angleterre|L’Espagne|Le Danemark|sport|2r",
    "Quel club a remporté sa première Ligue des champions en 2025 en battant l’Inter Milan ?|Le Paris Saint-Germain|Arsenal|Newcastle|L’Atlético de Madrid|sport|2r",
    "Quel club a battu le Borussia Dortmund en finale de la Ligue des champions 2024 ?|Le Real Madrid|Manchester City|Le Bayern Munich|Le FC Barcelone|sport|2r",
    "Quel club anglais a réalisé le triplé championnat, Coupe et Ligue des champions en 2023 ?|Manchester City|Liverpool|Chelsea|Arsenal|sport|2r",
    "Quelle équipe a remporté la Coupe du monde féminine de football 2023 ?|L’Espagne|L’Angleterre|Les États-Unis|La Suède|sport|2r",
    "Quel nageur français a remporté quatre médailles d’or individuelles aux JO de Paris 2024 ?|Léon Marchand|Florent Manaudou|Maxime Grousset|Yohann Ndoye-Brouard|sport|1r",
    "Quel judoka français a remporté son troisième titre olympique individuel à Paris en 2024 ?|Teddy Riner|David Douillet|Joan-Benjamin Gaba|Axel Clerget|sport|1r",
    "Où se sont déroulées les épreuves de surf des JO de Paris 2024 ?|À Tahiti|À Biarritz|À Hossegor|À La Réunion|sport|2r",
    "Quelle ville accueillera les Jeux olympiques d’été de 2028 ?|Los Angeles|Brisbane|Rome|Madrid|sport|2r",
    "Quelle ville a accueilli les Jeux olympiques d’été reportés en 2021 ?|Tokyo|Pékin|Rio de Janeiro|Séoul|sport|1r",
    "Où se dérouleront les Jeux olympiques d’hiver de 2030 ?|Dans les Alpes françaises|Dans les Pyrénées|En Suisse|En Suède|sport|2r",
    "Quelles villes italiennes ont accueilli les Jeux olympiques d’hiver de 2026 ?|Milan et Cortina d’Ampezzo|Rome et Turin|Turin et Sestrières|Venise et Bolzano|sport|2r",
    "Quel coureur slovène a remporté le Tour de France en 2020 et 2021 ?|Tadej Pogačar|Primož Roglič|Jonas Vingegaard|Remco Evenepoel|sport|2r",
    "Quel coureur danois a remporté le Tour de France en 2022 et 2023 ?|Jonas Vingegaard|Tadej Pogačar|Mads Pedersen|Egan Bernal|sport|2r",
    "Quel joueur serbe a remporté le tournoi olympique de tennis à Paris en 2024 ?|Novak Djokovic|Carlos Alcaraz|Jannik Sinner|Rafael Nadal|sport|2r",
    "Quel joueur espagnol a remporté Wimbledon en 2023 et en 2024 ?|Carlos Alcaraz|Rafael Nadal|Novak Djokovic|Jannik Sinner|sport|2r",
    "Quel joueur italien a remporté l’Open d’Australie en 2024 ?|Jannik Sinner|Matteo Berrettini|Lorenzo Musetti|Daniil Medvedev|sport|2r",
    "Quelle joueuse polonaise a remporté Roland-Garros en 2020, 2022, 2023 et 2024 ?|Iga Świątek|Aryna Sabalenka|Coco Gauff|Ashleigh Barty|sport|2r",
    "Quelle joueuse japonaise a battu Serena Williams en finale de l’US Open 2018 ?|Naomi Osaka|Kei Nishikori|Ai Sugiyama|Kimiko Date|sport|2r",
    "Combien de titres du Grand Chelem Serena Williams a-t-elle remportés en simple ?|23|18|20|25|sport|3",
    "Quel pilote britannique a remporté sept titres de champion du monde de Formule 1 ?|Lewis Hamilton|Jenson Button|Nigel Mansell|Lando Norris|sport|1r",
    "Quel pilote néerlandais a été champion du monde de Formule 1 de 2021 à 2024 ?|Max Verstappen|Lewis Hamilton|Charles Leclerc|Fernando Alonso|sport|1r",
    "Quelle écurie de Formule 1 Lewis Hamilton a-t-il rejointe en 2025 ?|Ferrari|Red Bull|McLaren|Aston Martin|sport|2r",
    "Quel pilote français a remporté le Grand Prix d’Italie de Formule 1 en 2020 ?|Pierre Gasly|Esteban Ocon|Romain Grosjean|Jean Alesi|sport|3r",
    "Quel pilote monégasque court pour Ferrari depuis 2019 ?|Charles Leclerc|Olivier Beretta|Louis Chiron|Arthur Leclerc|sport|2r",
    "Quel basketteur français a été choisi en premier à la draft NBA 2023 ?|Victor Wembanyama|Rudy Gobert|Evan Fournier|Nicolas Batum|sport|1r",
    "Quel pays a remporté la Coupe du monde de rugby 2023, organisée en France ?|L’Afrique du Sud|La Nouvelle-Zélande|La France|L’Irlande|sport|2r",
    "Quel pays a accueilli la Coupe du monde de rugby 2019 ?|Le Japon|L’Angleterre|La Nouvelle-Zélande|L’Argentine|sport|2r",
    "Quel demi de mêlée toulousain est devenu le capitaine emblématique du XV de France ?|Antoine Dupont|Romain Ntamack|Grégory Alldritt|Charles Ollivon|sport|1r",
    "Dans quelle discipline Antoine Dupont a-t-il été champion olympique en 2024 ?|Le rugby à sept|Le rugby à XV|Le rugby à XIII|Le beach rugby|sport|2r",
    "Quel perchiste suédois bat régulièrement le record du monde du saut à la perche ?|Armand Duplantis|Renaud Lavillenie|Sam Kendricks|Sergueï Bubka|sport|1r",
    "Quel perchiste français a détenu le record du monde de 2014 à 2020 ?|Renaud Lavillenie|Thierry Vigneron|Pierre Quinon|Jean Galfione|sport|2",
    "Quel athlète kényan a couru un marathon en moins de deux heures en 2019, hors compétition officielle ?|Eliud Kipchoge|Kenenisa Bekele|Paul Tergat|Haile Gebreselassie|sport|2r",
    "Quel biathlète français a remporté cinq titres olympiques ?|Martin Fourcade|Quentin Fillon Maillet|Raphaël Poirée|Simon Fourcade|sport|2",
    "Quel club détient le record de titres de champion de France de football ?|Le Paris Saint-Germain|L’AS Saint-Étienne|L’Olympique de Marseille|L’Olympique lyonnais|sport|2r",
    "Dans quel stade l’équipe de France a-t-elle remporté la finale de la Coupe du monde 1998 ?|Le Stade de France|Le Parc des Princes|Le Vélodrome|Le stade de Gerland|sport|1",
    "Quel nageur français a remporté le 50 m nage libre aux JO de Londres 2012 ?|Florent Manaudou|Yannick Agnel|Alain Bernard|Frédérick Bousquet|sport|2",
    "Dans quelle discipline Kevin Mayer a-t-il été champion du monde en 2017 et 2022 ?|Le décathlon|Le saut en longueur|Le 110 m haies|Le lancer du javelot|sport|2r",
    "Dans quel sport s’illustre la championne olympique Clarisse Agbégnénou ?|Le judo|La lutte|Le taekwondo|La boxe|sport|1r",
    "Dans quel sport Cassandre Beaugrand a-t-elle été sacrée championne olympique en 2024 ?|Le triathlon|L’escalade|Le cyclisme sur piste|Le pentathlon moderne|sport|2r",
    "Quel surnom porte l’équipe de France masculine de handball ?|Les Experts|Les Barjots|Les Costauds|Les Bleus du hand|sport|1",
    "Quelle discipline a fait son entrée aux Jeux olympiques à Paris en 2024 ?|Le breaking|Le surf|Le skateboard|L’escalade|sport|2r",
    "Quel golfeur américain a remporté quinze tournois majeurs ?|Tiger Woods|Jack Nicklaus|Phil Mickelson|Arnold Palmer|sport|2",
    "Au golf, comment appelle-t-on un trou réussi en un coup de moins que le par ?|Un birdie|Un eagle|Un bogey|Un albatros|sport|2",
    "Avec le Canada et le Mexique, quel pays organise la Coupe du monde de football 2026 ?|Les États-Unis|Le Brésil|Cuba|Le Guatemala|sport|1r",
    "Combien d’équipes participent à la Coupe du monde de football 2026 ?|48|32|40|64|sport|2r",
    "Quel boxeur britannique est surnommé « le Roi gitan » ?|Tyson Fury|Anthony Joshua|Lennox Lewis|Frank Bruno|sport|3r",
    "Quel club a remporté la Coupe d’Europe de rugby (Champions Cup) en 2022 et 2023 ?|Le Stade rochelais|Le Stade toulousain|Le Racing 92|Le Leinster|sport|3r",
    "Quel club détient le record de titres de champion de France de rugby ?|Le Stade toulousain|Le Stade français|L’ASM Clermont|Le RC Toulon|sport|2",
    "Quelle équipe a réussi le grand chelem dans le Tournoi des Six Nations 2022 ?|La France|L’Irlande|L’Angleterre|Le pays de Galles|sport|2r",
    "Quelle course à la voile en solitaire relie Saint-Malo à la Guadeloupe ?|La Route du Rhum|La Transat Jacques-Vabre|Le Vendée Globe|La Solitaire du Figaro|sport|2",
    "Quel skipper a remporté le Vendée Globe 2024-2025 ?|Charlie Dalin|Yoann Richomme|Armel Le Cléac’h|Thomas Ruyant|sport|3r",
    "Quel tournoi du Grand Chelem se joue à Flushing Meadows ?|L’US Open|Wimbledon|L’Open d’Australie|Roland-Garros|sport|2",
    "Quel tournoi du Grand Chelem se joue à Melbourne ?|L’Open d’Australie|L’US Open|Wimbledon|Roland-Garros|sport|1",
    "Dans quel sport utilise-t-on une crosse et un palet sur la glace ?|Le hockey sur glace|Le curling|Le bandy|La luge|sport|1",
    "Au volley-ball, comment s’appelle le défenseur qui porte un maillot de couleur différente ?|Le libéro|Le passeur|Le pointu|Le réceptionneur|sport|2",
    "Quel sport collectif a offert à la France un titre olympique à Tokyo en 2021 puis à Paris en 2024 ?|Le volley-ball masculin|Le handball masculin|Le basket-ball masculin|Le water-polo|sport|3r",
    "Quel sprinteur américain a remporté le 100 m des JO de Paris 2024 ?|Noah Lyles|Fred Kerley|Christian Coleman|Kishane Thompson|sport|3r",
    "Dans quel sport l’Américaine Simone Biles est-elle une légende ?|La gymnastique|L’athlétisme|La natation|Le patinage|sport|1",
    "Quel gardien était le capitaine de l’équipe de France championne du monde en 2018 ?|Hugo Lloris|Steve Mandanda|Fabien Barthez|Alphonse Areola|sport|2r",
    "Qui était le sélectionneur de l’équipe de France championne du monde en 2018 ?|Didier Deschamps|Laurent Blanc|Raymond Domenech|Zinédine Zidane|sport|1r",
    "Quel Croate a reçu le Ballon d’or 2018, interrompant la série Messi-Ronaldo ?|Luka Modrić|Ivan Rakitić|Mario Mandžukić|Davor Šuker|sport|3r",
    "Dans quel club Kylian Mbappé a-t-il été champion de France avant de rejoindre le PSG ?|L’AS Monaco|L’Olympique lyonnais|Le LOSC|L’OGC Nice|sport|2r",
    "Quel club espagnol Kylian Mbappé a-t-il rejoint en 2024 ?|Le Real Madrid|Le FC Barcelone|L’Atlético de Madrid|Le FC Séville|sport|1r",
    "Quelle ville a accueilli les épreuves de voile des JO de Paris 2024 ?|Marseille|La Rochelle|Brest|Toulon|sport|2r",
    "Au basket, combien de temps une équipe a-t-elle pour tirer au panier (règle FIBA) ?|24 secondes|30 secondes|20 secondes|35 secondes|sport|2",
    "Au football, combien de remplacements par match sont autorisés depuis 2020 dans la plupart des compétitions ?|Cinq|Trois|Quatre|Six|sport|2",
    "Quel télescope spatial, lancé fin 2021, a pris la relève de Hubble ?|James Webb|Kepler|Spitzer|Chandra|sciences|2r",
    "Quel rover de la NASA s’est posé sur Mars en février 2021 ?|Perseverance|Curiosity|Opportunity|Spirit|sciences|2r",
    "Quel petit hélicoptère a réussi le premier vol motorisé sur Mars en 2021 ?|Ingenuity|Dragonfly|Pathfinder|Sojourner|sciences|3r",
    "Quelle sonde de la NASA a percuté volontairement un astéroïde en 2022 pour dévier sa course ?|DART|Rosetta|New Horizons|Juno|sciences|3r",
    "Quel astronaute français a séjourné dans la Station spatiale internationale en 2016-2017 puis en 2021 ?|Thomas Pesquet|Jean-Loup Chrétien|Philippe Perrin|Léopold Eyharts|sciences|1r",
    "Quel pays a posé la première sonde près du pôle Sud de la Lune en 2023 ?|L’Inde|La Chine|Le Japon|La Russie|sciences|3r",
    "Quel outil d’édition du génome a valu le Nobel de chimie 2020 à Emmanuelle Charpentier et Jennifer Doudna ?|CRISPR-Cas9|La PCR|Le séquençage Sanger|Les anticorps monoclonaux|sciences|3r",
    "Sur quelle technologie reposent les vaccins de Pfizer-BioNTech et Moderna contre la Covid-19 ?|L’ARN messager|Un virus atténué|Un virus inactivé|Une bactérie modifiée|sciences|2r",
    "Quel virus a provoqué la pandémie déclarée par l’OMS en mars 2020 ?|Le SARS-CoV-2|Le H1N1|Ebola|Zika|sciences|1r",
    "Quelle image historique l’Event Horizon Telescope a-t-il dévoilée en 2019 ?|L’ombre d’un trou noir|Une exoplanète habitable|La naissance d’une étoile|Le Big Bang|sciences|2r",
    "Combien de jours environ la Lune met-elle pour faire le tour de la Terre ?|27|7|14|45|sciences|2",
    "Quelle grande galaxie spirale est la plus proche de la Voie lactée ?|Andromède|Le Grand Nuage de Magellan|La galaxie du Sombrero|La galaxie du Tourbillon|sciences|2",
    "Quelle étoile est la plus proche du Soleil ?|Proxima du Centaure|Sirius|Bételgeuse|L’étoile polaire|sciences|2",
    "Quelle sonde européenne a déposé le robot Philae sur une comète en 2014 ?|Rosetta|Giotto|Huygens|Mars Express|sciences|3",
    "Quelle particule le CERN a-t-il confirmée en 2012 ?|Le boson de Higgs|Le neutrino|Le quark top|Le graviton|sciences|2",
    "Quelle est la formule chimique du sel de table ?|NaCl|KCl|CaCO3|NaOH|sciences|1",
    "Quelle est la formule chimique de l’ozone ?|O3|O2|CO2|H2O2|sciences|2",
    "Quelle est la plus grosse cellule du corps humain ?|L’ovule|Le neurone|Le globule blanc|La cellule du foie|sciences|3",
    "Combien de litres de sang le corps d’un adulte contient-il environ ?|5 litres|2 litres|9 litres|12 litres|sciences|2",
    "Quelle maladie des marins est due à un manque de vitamine C ?|Le scorbut|Le rachitisme|Le béribéri|La pellagre|sciences|2",
    "Quel moine est considéré comme le père de la génétique ?|Gregor Mendel|Nicolas Copernic|Roger Bacon|Gregor Samsa|sciences|2",
    "Quelle forme a la molécule d’ADN ?|Une double hélice|Une sphère|Un triangle|Une étoile|sciences|1",
    "Quels chercheurs ont décrit la structure de l’ADN en 1953 ?|Watson et Crick|Pasteur et Koch|Curie et Becquerel|Monod et Jacob|sciences|3",
    "Quel cétacé à longue défense torsadée est surnommé « la licorne des mers » ?|Le narval|Le béluga|L’espadon|Le dauphin de l’Amazone|sciences|2",
    "Quel insecte transmet le paludisme ?|Le moustique anophèle|La mouche tsé-tsé|La puce|La punaise de lit|sciences|2",
    "Comment s’appelle la transformation d’une chenille en papillon ?|La métamorphose|La mue|La germination|La photosynthèse|sciences|1",
    "Quelle unité du Système international mesure la quantité de matière ?|La mole|Le kilogramme|Le litre|Le candela|sciences|3",
    "Quel savant français a donné son nom à l’unité de pression ?|Blaise Pascal|René Descartes|Denis Papin|Pierre de Fermat|sciences|2",
    "À quel chimiste attribue-t-on la maxime « Rien ne se perd, rien ne se crée, tout se transforme » ?|Antoine Lavoisier|Louis Pasteur|Marie Curie|Claude Berthollet|sciences|2",
    "Quelle célèbre formule d’Einstein relie la masse et l’énergie ?|E = mc²|F = ma|PV = nRT|U = RI|sciences|1",
    "Quel astronome a montré que les planètes suivent des orbites elliptiques ?|Johannes Kepler|Nicolas Copernic|Tycho Brahe|Galilée|sciences|3",
    "Quel astronome polonais a placé le Soleil au centre du système ?|Nicolas Copernic|Johannes Kepler|Tycho Brahe|Ptolémée|sciences|2",
    "Quel est le pH de l’eau pure à 25 °C ?|7|0|10|14|sciences|2",
    "Quelle échelle classe les minéraux selon leur dureté ?|L’échelle de Mohs|L’échelle de Richter|L’échelle de Kelvin|L’échelle de Beaufort|sciences|3",
    "Quel est le minéral naturel le plus dur ?|Le diamant|Le quartz|Le rubis|Le granit|sciences|1",
    "Quelle roche volcanique est si légère qu’elle flotte sur l’eau ?|La pierre ponce|Le basalte|L’obsidienne|Le granit|sciences|2",
    "Comment s’appelle la couche la plus basse de l’atmosphère, où nous vivons ?|La troposphère|La stratosphère|La mésosphère|La thermosphère|sciences|3",
    "Quelle couche de l’atmosphère nous protège de la plupart des rayons UV ?|La couche d’ozone|La couche de nuages|L’ionosphère|La couche de vapeur|sciences|1",
    "Comment s’appelle le supercontinent qui réunissait toutes les terres il y a environ 250 millions d’années ?|La Pangée|La Laurasie|L’Atlantide|Le Gondwana|sciences|2",
    "À la fin de quelle période les dinosaures non aviens ont-ils disparu ?|Le Crétacé|Le Jurassique|Le Trias|Le Permien|sciences|3",
    "Quel est le seul nombre premier pair ?|2|0|4|1|sciences|2",
    "Quel mathématicien a démontré en 1994 le dernier théorème de Fermat ?|Andrew Wiles|Grigori Perelman|Alan Turing|John Nash|sciences|3",
    "Quelle suite commence par 0, 1, 1, 2, 3, 5, 8, 13 ?|La suite de Fibonacci|La suite de Syracuse|La suite de Pascal|La suite d’Euler|sciences|2",
    "Combien vaut 2 puissance 10 ?|1 024|1 000|512|2 048|sciences|2",
    "Combien de secondes compte une heure ?|3 600|360|6 000|1 440|sciences|1",
    "Quelle est la racine carrée de 144 ?|12|14|11|16|sciences|1",
    "Combien de zéros compte un milliard ?|Neuf|Six|Douze|Huit|sciences|2",
    "Combien de côtés possède un octogone ?|Huit|Six|Sept|Dix|sciences|1",
    "Combien vaut la somme des angles d’un triangle ?|180 degrés|90 degrés|360 degrés|270 degrés|sciences|1",
    "Quelle est la plus longue chaîne de montagnes sous-marine du monde ?|La dorsale médio-océanique|La fosse des Mariannes|Le plateau des Kerguelen|La ceinture de feu|sciences|3",
    "Quelle est la fosse océanique la plus profonde du monde ?|La fosse des Mariannes|La fosse de Porto Rico|La fosse du Japon|La fosse des Tonga|sciences|2",
    "Quel animal est le plus grand primate du monde ?|Le gorille|L’orang-outan|Le chimpanzé|Le babouin|sciences|2",
    "Combien d’années un éléphant d’Afrique vit-il en moyenne dans la nature ?|Environ 60 ans|Environ 20 ans|Environ 120 ans|Environ 10 ans|sciences|2",
    "Quelle est la période de gestation d’une éléphante ?|Environ 22 mois|Environ 9 mois|Environ 14 mois|Environ 36 mois|sciences|3",
    "Quelle plante produit les grains de café ?|Le caféier|Le cacaoyer|Le théier|Le vanillier|sciences|2",
    "De quel arbre obtient-on le caoutchouc naturel ?|L’hévéa|Le baobab|L’érable|Le chêne-liège|sciences|2",
    "Quelle intelligence artificielle conversationnelle d’OpenAI a été lancée fin 2022 ?|ChatGPT|Siri|Alexa|Watson|sciences|1r",
    "Quel est l’ancêtre sauvage du chien domestique ?|Le loup|Le renard|Le chacal|La hyène|sciences|2",
    "Quel organe du corps humain peut se régénérer en partie après une ablation ?|Le foie|Le cœur|Le cerveau|Le pancréas|sciences|3",
    "Combien de chambres compte le cœur d’un poisson ?|Deux|Trois|Quatre|Une|sciences|2",
    "Quel pays a quitté l’Union européenne le 31 janvier 2020 ?|Le Royaume-Uni|La Suisse|La Norvège|Le Danemark|histoiregeo|1r",
    "Quel roi a succédé à Élisabeth II en septembre 2022 ?|Charles III|William V|George VII|Édouard IX|histoiregeo|1r",
    "Quel pays nordique a rejoint l’OTAN en 2023, un an avant la Suède ?|La Finlande|La Norvège|Le Danemark|L’Islande|histoiregeo|3r",
    "Quel pays est devenu en 2023 le plus peuplé du monde, devant la Chine ?|L’Inde|L’Indonésie|Les États-Unis|Le Nigeria|histoiregeo|2r",
    "Quelle est la capitale du Kazakhstan ?|Astana|Almaty|Bichkek|Tachkent|histoiregeo|3",
    "Quelle est la capitale de la Norvège ?|Oslo|Bergen|Stockholm|Helsinki|histoiregeo|1",
    "Quelle est la capitale de l’Écosse ?|Édimbourg|Glasgow|Aberdeen|Inverness|histoiregeo|2",
    "Quelle est la capitale du Pérou ?|Lima|Cuzco|La Paz|Quito|histoiregeo|2",
    "Quelle est la capitale de l’Éthiopie ?|Addis-Abeba|Asmara|Khartoum|Mogadiscio|histoiregeo|3",
    "Quelle est la capitale de la Colombie ?|Bogota|Medellín|Caracas|Cali|histoiregeo|2",
    "Quelle est la capitale des Philippines ?|Manille|Cebu|Davao|Jakarta|histoiregeo|2",
    "Quelle est la capitale de l’Islande ?|Reykjavik|Akureyri|Nuuk|Tórshavn|histoiregeo|2",
    "Quel pays a pour capitale Nairobi ?|Le Kenya|La Tanzanie|L’Ouganda|L’Éthiopie|histoiregeo|2",
    "Quel pays a pour capitale Téhéran ?|L’Iran|L’Irak|L’Afghanistan|Le Pakistan|histoiregeo|2",
    "Quel pays a pour capitale Buenos Aires ?|L’Argentine|L’Uruguay|Le Chili|Le Paraguay|histoiregeo|1",
    "Quel est le plus vaste pays d’Afrique ?|L’Algérie|La République démocratique du Congo|Le Soudan|La Libye|histoiregeo|2",
    "Quel est le plus vaste pays d’Amérique du Sud ?|Le Brésil|L’Argentine|Le Pérou|La Colombie|histoiregeo|1",
    "Sur quel fleuve Bagdad est-elle bâtie ?|Le Tigre|L’Euphrate|Le Jourdain|L’Indus|histoiregeo|3",
    "Dans quel pays s’élève le Kilimandjaro ?|La Tanzanie|Le Kenya|L’Ouganda|L’Éthiopie|histoiregeo|2",
    "Quel est le pays le plus peuplé d’Afrique ?|Le Nigeria|L’Égypte|L’Éthiopie|L’Afrique du Sud|histoiregeo|2",
    "Quelle chaîne de montagnes marque la limite entre l’Europe et l’Asie ?|L’Oural|Le Caucase|L’Altaï|Les Carpates|histoiregeo|2",
    "Quelle ville s’est appelée Byzance puis Constantinople ?|Istanbul|Ankara|Athènes|Alexandrie|histoiregeo|2",
    "Quel était l’ancien nom de Hô Chi Minh-Ville ?|Saïgon|Hanoï|Tonkin|Cholon|histoiregeo|2",
    "Sous quel nom le Sri Lanka était-il connu jusqu’en 1972 ?|Ceylan|Siam|Formose|Birmanie|histoiregeo|2",
    "Quel ancien nom portait l’Iran jusqu’en 1935 ?|La Perse|La Mésopotamie|La Bactriane|La Médie|histoiregeo|2",
    "Quel président américain a été assassiné à Dallas en 1963 ?|John F. Kennedy|Abraham Lincoln|Richard Nixon|Lyndon Johnson|histoiregeo|1",
    "Quel pasteur a prononcé le discours « I have a dream » en 1963 ?|Martin Luther King|Malcolm X|Jesse Jackson|Barack Obama|histoiregeo|1",
    "En quelle année l’URSS a-t-elle été dissoute ?|1991|1989|1985|1993|histoiregeo|2",
    "Quel dirigeant soviétique a lancé la perestroïka ?|Mikhaïl Gorbatchev|Leonid Brejnev|Boris Eltsine|Nikita Khrouchtchev|histoiregeo|2",
    "Quelle crise de 1962 a opposé les États-Unis et l’URSS au sujet de missiles nucléaires ?|La crise de Cuba|La crise de Suez|Le blocus de Berlin|La guerre de Corée|histoiregeo|2",
    "Quel traité de 1957 a fondé la Communauté économique européenne ?|Le traité de Rome|Le traité de Maastricht|Le traité de Lisbonne|Le traité de Paris|histoiregeo|2",
    "En quelle année les pièces et billets en euros sont-ils entrés en circulation ?|2002|1999|1995|2005|histoiregeo|1",
    "Quelle merveille du monde antique éclairait le port d’Alexandrie ?|Le phare|Le colosse|Les jardins suspendus|Le mausolée|histoiregeo|2",
    "Quelle est la seule des sept merveilles du monde antique encore debout ?|La pyramide de Khéops|Le colosse de Rhodes|Le temple d’Artémis|Le phare d’Alexandrie|histoiregeo|2",
    "Quel peuple de navigateurs a fondé Carthage ?|Les Phéniciens|Les Grecs|Les Romains|Les Égyptiens|histoiregeo|3",
    "Quelle cité lacustre était la capitale de l’Empire aztèque ?|Tenochtitlan|Cuzco|Tikal|Teotihuacan|histoiregeo|3",
    "Quel conquistador a renversé l’Empire aztèque ?|Hernán Cortés|Francisco Pizarro|Diego de Almagro|Vasco Núñez de Balboa|histoiregeo|2",
    "Quel conquistador a renversé l’Empire inca ?|Francisco Pizarro|Hernán Cortés|Pedro de Valdivia|Juan Ponce de León|histoiregeo|3",
    "Quel navigateur portugais a ouvert la route maritime des Indes en 1498 ?|Vasco de Gama|Bartolomeu Dias|Pedro Álvares Cabral|Henri le Navigateur|histoiregeo|2",
    "Quel empire était dirigé par Soliman le Magnifique ?|L’Empire ottoman|L’Empire perse|L’Empire moghol|L’Empire byzantin|histoiregeo|2",
    "Sous quelle dynastie chinoise l’essentiel de la Grande Muraille visible aujourd’hui a-t-il été bâti ?|Les Ming|Les Qing|Les Han|Les Tang|histoiregeo|3",
    "Quel souverain fut le premier empereur de la Chine unifiée ?|Qin Shi Huang|Kubilaï Khan|Puyi|Confucius|histoiregeo|3",
    "Quelle armée de statues garde le tombeau du premier empereur de Chine ?|L’armée de terre cuite|L’armée de bronze|L’armée de jade|L’armée de marbre|histoiregeo|2",
    "Quelle révolution a porté les bolcheviks au pouvoir en Russie en 1917 ?|La révolution d’Octobre|La révolution des Œillets|Le Printemps de Prague|La révolution de Velours|histoiregeo|2",
    "Quel pays est formé de plus de 17 000 îles ?|L’Indonésie|Les Philippines|Le Japon|La Grèce|histoiregeo|2",
    "Dans quel pays se trouve la plus grande partie de la forêt amazonienne ?|Le Brésil|Le Pérou|La Colombie|Le Venezuela|histoiregeo|1",
    "Entre quels pays les chutes Victoria forment-elles la frontière ?|La Zambie et le Zimbabwe|Le Kenya et la Tanzanie|L’Angola et la Namibie|Le Malawi et le Mozambique|histoiregeo|3",
    "Qui fut la première femme à voyager dans l’espace, en 1963 ?|Valentina Terechkova|Sally Ride|Svetlana Savitskaïa|Claudie Haigneré|histoiregeo|2",
    "Quel empire colonial a été le plus vaste de l’histoire ?|L’Empire britannique|L’Empire espagnol|L’Empire français|L’Empire portugais|histoiregeo|3",
    "Quelle ville a été coupée en deux par une ligne verte après 1974 et reste la dernière capitale divisée d’Europe ?|Nicosie|Belfast|Sarajevo|Mostar|histoiregeo|2",
    "Quel pays a été le premier à accorder le droit de vote aux femmes, en 1893 ?|La Nouvelle-Zélande|La Finlande|Les États-Unis|Le Royaume-Uni|histoiregeo|2",
    "Quelle cathédrale parisienne a été ravagée par un incendie en avril 2019 ?|Notre-Dame de Paris|Le Sacré-Cœur|Saint-Eustache|La Madeleine|france|1r",
    "En quelle année Notre-Dame de Paris a-t-elle rouvert ses portes après l’incendie ?|2024|2021|2022|2026|france|2r",
    "Quel président de la République a été élu pour la première fois en 2017 ?|Emmanuel Macron|François Hollande|Nicolas Sarkozy|Édouard Philippe|france|1r",
    "Qui a été la première femme Première ministre en France, en 1991 ?|Édith Cresson|Simone Veil|Ségolène Royal|Élisabeth Guigou|france|2",
    "Quelle femme a été nommée Première ministre en mai 2022 ?|Élisabeth Borne|Christine Lagarde|Rachida Dati|Valérie Pécresse|france|2r",
    "Qui est devenu en janvier 2024, à 34 ans, le plus jeune Premier ministre de la Ve République ?|Gabriel Attal|Jordan Bardella|Laurent Fabius|Édouard Philippe|france|2r",
    "Quel président a fondé la Ve République en 1958 ?|Charles de Gaulle|Georges Pompidou|René Coty|Vincent Auriol|france|1",
    "Combien d’années dure le mandat du président de la République depuis 2002 ?|Cinq|Sept|Quatre|Six|france|1",
    "En quelle année la loi de séparation des Églises et de l’État a-t-elle été votée ?|1905|1789|1871|1946|france|2",
    "Quel garde des Sceaux a fait abolir la peine de mort en 1981 ?|Robert Badinter|Jack Lang|Pierre Mauroy|Michel Rocard|france|2",
    "Quelle ministre a porté la loi autorisant l’IVG en 1975 ?|Simone Veil|Gisèle Halimi|Françoise Giroud|Yvette Roudy|france|1",
    "Quelle artiste de music-hall et résistante est entrée au Panthéon en 2021 ?|Joséphine Baker|Mistinguett|Édith Piaf|Barbara|france|2r",
    "Quel résistant d’origine arménienne est entré au Panthéon en 2024 ?|Missak Manouchian|Jean Moulin|Charles Aznavour|Pierre Brossolette|france|3r",
    "Quel est le département le plus peuplé de France ?|Le Nord|Paris|Les Bouches-du-Rhône|Le Rhône|france|3",
    "Combien de départements compte la France, outre-mer compris ?|101|95|96|110|france|2",
    "Quel fleuve traverse Lyon avant de rejoindre la Méditerranée ?|Le Rhône|La Loire|La Garonne|La Seine|france|1",
    "Quelle est la deuxième ville la plus peuplée de France ?|Marseille|Lyon|Toulouse|Lille|france|1",
    "Près de quelle ville se trouve le parc du Futuroscope ?|Poitiers|Tours|Limoges|Angers|france|2",
    "Dans quel département se trouve le parc du Puy du Fou ?|La Vendée|La Loire-Atlantique|Le Maine-et-Loire|Les Deux-Sèvres|france|2",
    "Quel parc d’attractions français a pour héros un petit Gaulois moustachu ?|Le Parc Astérix|Le Futuroscope|Disneyland Paris|Vulcania|france|1",
    "Quelle ville accueille chaque année le grand festival de la bande dessinée ?|Angoulême|Lyon|Blois|Saint-Malo|france|2",
    "Quelle ville bretonne accueille chaque été le Festival interceltique ?|Lorient|Quimper|Brest|Vannes|france|2",
    "Quel département porte le numéro 75 ?|Paris|Les Yvelines|La Seine-Saint-Denis|Le Val-de-Marne|france|1",
    "Quel département porte le numéro 13 ?|Les Bouches-du-Rhône|Le Var|Le Gard|Le Vaucluse|france|2",
    "Quel département porte le numéro 69 ?|Le Rhône|La Loire|L’Ain|L’Isère|france|2",
    "Quelle île de l’océan Indien a pour chef-lieu Saint-Denis ?|La Réunion|Mayotte|Maurice|Madagascar|france|2",
    "Dans quel territoire français se trouve la base spatiale de Kourou ?|La Guyane|La Martinique|La Guadeloupe|La Réunion|france|1",
    "Quel département français se situe dans l’archipel des Comores ?|Mayotte|La Réunion|Wallis-et-Futuna|Les Kerguelen|france|2",
    "Quelle ville est le chef-lieu de la Martinique ?|Fort-de-France|Pointe-à-Pitre|Basse-Terre|Le Lamentin|france|2",
    "Quel pont à haubans relie Le Havre à Honfleur ?|Le pont de Normandie|Le pont de Tancarville|Le pont de Saint-Nazaire|Le pont de l’Iroise|france|2",
    "Quel viaduc géant enjambe la vallée du Tarn depuis 2004 ?|Le viaduc de Millau|Le viaduc de Garabit|Le viaduc du Viaur|Le viaduc de Morlaix|france|1",
    "Quel musée parisien est installé dans une ancienne gare ?|Le musée d’Orsay|Le Louvre|Le Centre Pompidou|Le musée Rodin|france|2",
    "Quel architecte a conçu la pyramide de verre du Louvre ?|Ieoh Ming Pei|Jean Nouvel|Renzo Piano|Frank Gehry|france|3",
    "Quel célèbre tableau a été volé au Louvre en 1911 ?|La Joconde|Le Radeau de la Méduse|La Liberté guidant le peuple|Le Sacre de Napoléon|france|2",
    "Dans quelle ville a été signé l’accord sur le climat de la COP21 en 2015 ?|Paris|Kyoto|Copenhague|Glasgow|france|1",
    "Au pied de quel monument se trouvait l’arène de beach-volley des JO de Paris 2024 ?|La tour Eiffel|L’Arc de triomphe|Le Grand Palais|Les Invalides|france|2r",
    "Quel château a accueilli les épreuves d’équitation des JO de Paris 2024 ?|Le château de Versailles|Le château de Chantilly|Le château de Fontainebleau|Le château de Vincennes|france|2r",
    "Dans quel jardin la vasque olympique de Paris 2024 s’élevait-elle chaque soir ?|Le jardin des Tuileries|Le jardin du Luxembourg|Le Champ-de-Mars|Le parc Monceau|france|3r",
    "Qui a allumé la vasque olympique lors de la cérémonie d’ouverture de Paris 2024 ?|Marie-José Pérec et Teddy Riner|Zinédine Zidane et Amélie Mauresmo|Tony Parker et Laure Manaudou|Kylian Mbappé et Léon Marchand|france|2r",
    "Quel architecte a construit la Cité radieuse de Marseille ?|Le Corbusier|Auguste Perret|Jean Prouvé|Robert Mallet-Stevens|france|2",
    "Dans quelle ville se trouve le château des ducs de Bretagne ?|Nantes|Rennes|Vannes|Saint-Malo|france|3",
    "Quelle cité médiévale de l’Aude est célèbre pour sa double enceinte fortifiée ?|Carcassonne|Aigues-Mortes|Provins|Saint-Malo|france|1",
    "Quel réseau social, racheté par Elon Musk en 2022, a été renommé X ?|Twitter|Facebook|Instagram|Snapchat|general|1r",
    "Quelle application de vidéos courtes appartient au groupe chinois ByteDance ?|TikTok|Instagram|Snapchat|YouTube|general|1r",
    "Quel jeu vidéo de 2017 est célèbre pour ses batailles royales à 100 joueurs et ses danses ?|Fortnite|Minecraft|Among Us|Overwatch|general|1r",
    "Quel petit jeu de mots quotidien a conquis le monde début 2022 ?|Wordle|Candy Crush|Sudoku|Pictionary|general|2r",
    "Quelle console de Nintendo, sortie en 2017, se joue aussi en mode portable ?|La Switch|La Wii|La GameCube|La DS|general|1r",
    "Quelle console Nintendo a succédé à la Switch en 2025 ?|La Switch 2|La Wii 2|La Game Boy X|La Super Switch|general|1r",
    "Quelle entreprise japonaise fabrique les consoles PlayStation ?|Sony|Nintendo|Sega|Panasonic|general|1",
    "Quel hérisson bleu est la mascotte de Sega ?|Sonic|Spyro|Crash|Knuckles|general|1",
    "Quel jeu vidéo de construction en cubes est le plus vendu de l’histoire ?|Minecraft|Tetris|Roblox|Les Sims|general|1",
    "Quel jeu mobile de 2016 faisait chasser des créatures en réalité augmentée dans les rues ?|Pokémon Go|Angry Birds|Candy Crush|Clash of Clans|general|1r",
    "Quelle monnaie numérique a été créée en 2009 par un mystérieux Satoshi Nakamoto ?|Le bitcoin|L’ethereum|Le dogecoin|Le litecoin|general|2",
    "Comment s’appelle le smartphone lancé par Apple en 2007 ?|L’iPhone|L’iPad|L’iPod|Le Galaxy|general|1",
    "Combien de joueurs au maximum peuvent jouer à une partie classique de Scrabble ?|Quatre|Deux|Six|Huit|general|2",
    "Combien de cartes compte un jeu de tarot ?|78|52|54|64|general|2",
    "Combien de pions chaque joueur a-t-il au début d’une partie de dames sur un damier de 100 cases ?|20|12|16|24|general|2",
    "Quel jeu de lettres pose des mots sur une grille avec des cases « mot compte triple » ?|Le Scrabble|Le Boggle|Le Pendu|Le Mot le plus long|general|1",
    "Quel jeu d’enquête met en scène le colonel Moutarde et le docteur Olive ?|Cluedo|Monopoly|Risk|Stratego|general|1",
    "Au Uno, quelle carte oblige le joueur suivant à piocher quatre cartes ?|Le +4|L’inversion|Le passe ton tour|Le +2|general|1",
    "Quel casse-tête coloré a été inventé par le Hongrois Ernő Rubik en 1974 ?|Le Rubik’s Cube|Le taquin|Le tangram|Le Tetris|general|1",
    "Quel jeu de stratégie se joue avec des pierres noires et blanches sur un goban ?|Le go|Le mah-jong|L’othello|Le shogi|general|2",
    "Quel programme d’intelligence artificielle a battu le champion de go Lee Sedol en 2016 ?|AlphaGo|Deep Blue|Watson|Stockfish|general|3r",
    "À quel président américain l’ours en peluche « teddy bear » doit-il son nom ?|Theodore Roosevelt|Franklin Roosevelt|Abraham Lincoln|John Kennedy|general|2",
    "Comment appelle-t-on les 50 ans de mariage ?|Les noces d’or|Les noces d’argent|Les noces de diamant|Les noces de platine|general|2",
    "Comment appelle-t-on les 25 ans de mariage ?|Les noces d’argent|Les noces d’or|Les noces de perle|Les noces de cristal|general|2",
    "De quelle couleur est un rubis ?|Rouge|Vert|Bleu|Violet|general|1",
    "De quelle couleur est une émeraude ?|Verte|Rouge|Bleue|Jaune|general|1",
    "Quelle langue compte le plus de locuteurs natifs au monde ?|Le mandarin|L’anglais|L’espagnol|L’hindi|general|2",
    "Quelle est la lettre la plus fréquente dans les textes en français ?|Le E|Le A|Le S|Le T|general|2",
    "Comment appelle-t-on la peur des araignées ?|L’arachnophobie|L’agoraphobie|La claustrophobie|L’acrophobie|general|1",
    "Que redoute une personne claustrophobe ?|Les espaces clos|Le vide|La foule|Les insectes|general|1",
    "Quel animal figure sur le logo du WWF ?|Le panda géant|Le tigre|L’ours polaire|L’éléphant|general|1",
    "Dans quelle ville se trouve le siège de l’Organisation des Nations unies ?|New York|Genève|Bruxelles|Washington|general|2",
    "Dans quelle ville le prix Nobel de la paix est-il remis ?|Oslo|Stockholm|Genève|Copenhague|general|3",
    "Quelle enseigne suédoise vend des meubles à monter soi-même ?|IKEA|H&M|Volvo|Lego|general|1",
    "De quel pays vient la marque de briques LEGO ?|Le Danemark|L’Allemagne|La Suède|Les Pays-Bas|general|2",
    "Que signifie l’abréviation RSVP sur une invitation ?|Répondez, s’il vous plaît|Rendez-vous sans problème|Réservé sur place|Retour sous vingt jours|general|2",
    "Quel format de petites images animées sert souvent aux mèmes ?|Le GIF|Le PDF|Le MP3|Le ZIP|general|2",
    "Combien de cases compte une grille de sudoku classique ?|81|64|100|72|general|2",
    "Combien de dominos compte un jeu classique double-six ?|28|36|24|32|general|2",
    "Combien de cases compte un plateau de jeu de l’oie traditionnel ?|63|50|64|100|general|2",
    "Quel personnage de jeu vidéo mange des fantômes dans un labyrinthe ?|Pac-Man|Mario|Donkey Kong|Kirby|general|1",
    "Dans quel jeu de société des maîtres-espions font-ils deviner des mots avec un seul indice ?|Codenames|Dixit|Taboo|Time’s Up|general|2"
  ];

  /* ================================================================
   * 1. La banque
   * ================================================================ */
  var PARSED = null;
  function banque() {
    if (PARSED) return PARSED;
    PARSED = BANK.map(function (e, k) {
      var p = e.split('|');
      var nv = p[6] || '2';
      return {
        k: k, q: p[0], good: p[1], lures: [p[2], p[3], p[4]], theme: p[5] || 'general',
        niv: parseInt(nv, 10) || 2, recent: nv.indexOf('r') !== -1
      };
    });
    return PARSED;
  }
  function parseQ(e) {
    var p = e.split('|');
    return { q: p[0], good: p[1], lures: [p[2], p[3], p[4]], theme: p[5] || 'general', niv: parseInt(p[6], 10) || 2 };
  }
  function dansTheme(d, th) {
    if (th === 'melange') return true;
    if (th === 'recent') return d.recent;
    return d.theme === th;
  }
  function themeCount(th) {
    var n = 0;
    banque().forEach(function (d) { if (dansTheme(d, th)) n++; });
    return n;
  }
  function trouveTheme(id) {
    for (var i = 0; i < THEMES.length; i++) if (THEMES[i].id === id) return THEMES[i];
    return null;
  }

  /* Les questions déjà posées sur ce téléphone (celui de l'hôte) passent
     après les autres : on ne revoit pas les mêmes d'une partie à l'autre. */
  var CLE_VUES = 'gg-quiz-vues';
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
      if (v.length > 900) v = v.slice(v.length - 900);
      localStorage.setItem(CLE_VUES, JSON.stringify(v));
    } catch (e) {}
  }
  function empreinte(q) {
    var h = 0;
    for (var i = 0; i < q.length; i++) h = (h * 31 + q.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }

  /* Tirage : thème, difficulté (progressive = du facile au difficile) */
  function buildQuestions(th, diff, nb) {
    th = th || 'melange';
    diff = diff || 'progressif';
    nb = nb || 10;
    var vues = {};
    lireVues().forEach(function (h) { vues[h] = true; });
    var pool = GG.shuffle(banque().filter(function (d) { return dansTheme(d, th); }));
    var neuves = pool.filter(function (d) { return !vues[empreinte(d.q)]; });
    var revues = pool.filter(function (d) { return vues[empreinte(d.q)]; });
    pool = neuves.concat(revues);
    var pris = {};
    function prendre(niveaux, n) {
      var out = [];
      for (var j = 0; j < niveaux.length && out.length < n; j++) {
        for (var i = 0; i < pool.length && out.length < n; i++) {
          var d = pool[i];
          if (!pris[d.k] && d.niv === niveaux[j]) { pris[d.k] = true; out.push(d); }
        }
      }
      return out;
    }
    var liste;
    if (diff === 'progressif') {
      var n1 = Math.round(nb * 0.4), n2 = Math.round(nb * 0.35);
      liste = prendre([1, 2, 3], n1).concat(prendre([2, 1, 3], n2), prendre([3, 2, 1], nb - n1 - n2));
    } else {
      var ordre = diff === 'facile' ? [1, 2, 3] : diff === 'difficile' ? [3, 2, 1] : [2, 1, 3];
      liste = GG.shuffle(prendre(ordre, nb));
    }
    noterVues(liste.map(function (d) { return empreinte(d.q); }));
    return liste.map(function (d) {
      var choices = GG.shuffle([d.good, d.lures[0], d.lures[1], d.lures[2]]);
      return { q: d.q, choices: choices, correct: choices.indexOf(d.good), th: d.theme, niv: d.niv };
    });
  }

  /* ================================================================
   * 2. Règles : options, échéances, points
   * ================================================================ */
  function lireOpts(src, n) {
    src = src || {};
    var o = { th: 'melange', diff: 'progressif', nb: 10, chrono: 20, mode: 'chrono' };
    if (src.th !== undefined) {
      if (!trouveTheme(String(src.th))) return { error: 'Thème inconnu.' };
      o.th = String(src.th);
    }
    if (src.diff !== undefined) {
      if (!DIFFS.some(function (d) { return d.id === src.diff; })) return { error: 'Difficulté inconnue.' };
      o.diff = String(src.diff);
    }
    if (src.nb !== undefined) {
      if (NBS.indexOf(src.nb) === -1) return { error: 'Nombre de questions invalide.' };
      o.nb = src.nb;
    }
    if (src.mode !== undefined) {
      if (MODES.indexOf(src.mode) === -1) return { error: 'Mode inconnu.' };
      o.mode = String(src.mode);
    }
    if (n < 2) o.mode = 'chrono';
    if (src.chrono !== undefined) {
      if (src.chrono !== 0 && CHRONOS.indexOf(src.chrono) === -1) return { error: 'Durée invalide.' };
      o.chrono = src.chrono;
    }
    if (o.mode === 'secret') o.chrono = 0;          // on se passe le téléphone : pas de course
    if (o.mode === 'chrono' && !o.chrono) o.chrono = 20;
    if (themeCount(o.th) < o.nb) return { error: 'Pas assez de questions sur ce thème.' };
    return o;
  }

  /* Une partie reprise d'une ancienne version : on complète l'état */
  function norme(state) {
    if (!state.opts) state.opts = { th: state.theme || 'melange', diff: 'progressif', nb: 10, chrono: 0, mode: state.players.length > 1 ? 'secret' : 'chrono' };
    state.players.forEach(function (p) {
      if (typeof p.serie !== 'number') p.serie = 0;
      if (typeof p.meilleure !== 'number') p.meilleure = 0;
      if (typeof p.bons !== 'number') p.bons = 0;
      if (typeof p.gain !== 'number') p.gain = 0;
    });
    if (state.phase === 'reveal' && state.reveal && !state.reveal.avant) {
      state.reveal.avant = state.players.map(function (p) { return p.score; });
    }
    return state;
  }

  function cle(state) {
    return state.phase === 'question' ? 'q' + state.gameTs + ':' + state.idx : '';
  }

  /* Pose la question courante (et son échéance, stockée dans l'état) */
  function lancer(state) {
    state.phase = 'question';
    state.reveal = null;
    state.dernier = -1;
    state.players.forEach(function (p) { p.answer = -1; p.t = null; p.gain = 0; });
    state.debut = Date.now();
    if (state.opts.chrono > 0) {
      var ms = state.opts.chrono * 1000;
      state.ech = { k: cle(state), fin: state.debut + ms, duree: ms };
      return { ok: true, timer: { ms: ms + 400, action: { t: 'expire', k: state.ech.k } } };
    }
    state.ech = null;
    return { ok: true };
  }

  /* Révélation : les points tombent maintenant (rien ne fuit avant).
     Bonne réponse : de 1 000 (immédiate) à 500 (sur le fil) en course au
     chrono, 1 000 sinon ; série : +100 par bonne réponse d'affilée (max +500). */
  function reveler(state, pourquoi) {
    var q = state.qs[state.idx];
    var vitesse = state.opts.mode === 'chrono' && !!state.ech;
    var T = state.ech ? state.ech.duree : 0;
    var avant = [], gains = [], premier = -1, meilleurT = Infinity;
    state.players.forEach(function (p, i) {
      avant.push(p.score);
      var g = 0;
      if (p.answer === q.correct) {
        p.serie++;
        p.bons++;
        if (p.serie > p.meilleure) p.meilleure = p.serie;
        var base = vitesse ? Math.round(1000 - 500 * Math.min(1, Math.max(0, p.t || 0) / T)) : 1000;
        g = base + Math.min(p.serie - 1, 5) * 100;
        if (vitesse && typeof p.t === 'number' && p.t < meilleurT) { meilleurT = p.t; premier = i; }
      } else {
        p.serie = 0;
      }
      p.gain = g;
      p.score += g;
      gains.push(g);
    });
    var counts = [0, 0, 0, 0];
    state.players.forEach(function (p) { if (p.answer >= 0 && p.answer <= 3) counts[p.answer]++; });
    state.reveal = {
      correct: q.correct,
      answers: state.players.map(function (p) { return p.answer; }),
      gains: gains,
      avant: avant,
      series: state.players.map(function (p) { return p.serie; }),
      premier: premier,
      counts: counts,
      pourquoi: pourquoi,
      vue: state.dernier >= 0 ? state.dernier : 0
    };
    state.phase = 'reveal';
    state.ech = null;
  }

  /* Niveaux de l'ordinateur : justesse (sur une question moyenne) et
     temps de réaction (pour un chrono de 20 s) */
  var NIV_IA = {
    facile: { juste: 0.5, min: 7000, max: 15000 },
    moyen: { juste: 0.68, min: 4500, max: 11000 },
    difficile: { juste: 0.88, min: 2200, max: 6000 }
  };

  var mod = {
    id: 'quiz',
    nom: 'Quiz',
    icone: '💡',
    desc: 'Le grand quiz de la soirée : 1 500 questions, 10 thèmes, un chrono et des points pour les plus rapides. Sur un téléphone chacun, ou un seul avec l’animateur !',
    min: 1, max: 12,
    hotseat: true, hotseatMax: 4, hidden: true, netOnly: false,
    niveaux: ['facile', 'moyen', 'difficile'],
    regles: '<p><strong>🎯 Le but :</strong> marquer le plus de points en 10, 15 ou 20 questions.</p>' +
      '<p><strong>Comment jouer :</strong> une question, quatre réponses de couleur (chacune a sa forme : ▲ ◆ ● ■). Touchez la bonne avant la fin du chrono !</p>' +
      '<p><strong>Les points :</strong> une bonne réponse rapporte de <strong>1 000</strong> (réponse immédiate) à <strong>500</strong> points (sur le fil). Chaque bonne réponse d’affilée ajoute un bonus de série 🔥 (+100, +200… jusqu’à +500).</p>' +
      '<p><strong>Sur un seul téléphone :</strong> mode <strong>🎤 Animateur</strong> — chacun annonce sa réponse à voix haute, l’animateur la note, puis révèle ; ou mode <strong>🙈 Chacun son tour</strong> — réponses secrètes, on se passe le téléphone.</p>' +
      '<p><strong>Thèmes et difficulté :</strong> 10 thèmes (dont « Depuis 2016 »), difficulté facile, moyenne, difficile ou progressive. En solo, visez le record !</p>',

    create: function (names) {
      return {
        players: names.map(function (n) {
          return { name: n, score: 0, answer: -1, t: null, serie: 0, meilleure: 0, bons: 0, gain: 0 };
        }),
        opts: { th: 'melange', diff: 'progressif', nb: 10, chrono: 20, mode: 'chrono' },
        theme: null,
        qs: [],
        idx: 0,
        phase: 'setup',          // setup → question ⇄ reveal → fin
        ech: null,               // échéance de la question : { k, fin, duree }
        debut: 0,
        dernier: -1,
        reveal: null,
        gameTs: Math.floor(Math.random() * 1e9),
        finished: false
      };
    },

    turnOf: function () { return -1; }, // tout le monde répond en même temps
    /* Sur un téléphone : l'animateur garde l'écran ; en « chacun son tour »,
       l'écran passe au premier qui n'a pas répondu (l'ordre tourne à chaque
       question), et la révélation reste chez le dernier qui a répondu. */
    viewerOf: function (state) {
      if (!state.opts || state.opts.mode !== 'secret') return 0;
      var n = state.players.length;
      if (state.phase === 'question') {
        for (var k = 0; k < n; k++) {
          var i = (state.idx + k) % n;
          if (state.players[i].answer === -1) return i;
        }
      }
      if (state.phase === 'reveal' && state.reveal) return state.reveal.vue | 0;
      return 0;
    },
    over: function (state) { return state.finished; },
    scoreOf: function (state, i) { return state.players[i].score; },
    gagnants: function (state) {
      var ps = state.players;
      if (ps.length === 1) return ps[0].bons * 2 >= (state.qs.length || 10) ? [0] : null;
      var max = -1, g = [];
      ps.forEach(function (p) { if (p.score > max) max = p.score; });
      ps.forEach(function (p, i) { if (p.score === max) g.push(i); });
      return g.length === 1 ? g : [];
    },

    summary: function (state) {
      var rows = state.players.map(function (p, i) {
        return { i: i, n: p.name, s: p.score, b: p.bons, m: p.meilleure };
      }).sort(function (a, b) { return b.s - a.s; });
      var nbq = state.qs.length || 10;
      var html = '<div class="qz-sum">';
      if (rows.length === 1) {
        var r = rows[0];
        html += '<div class="qz-sum-solo"><div class="qz-sum-score"><b>' + r.s + '</b> pts</div>' +
          '<p>' + r.b + ' bonne' + (r.b > 1 ? 's' : '') + ' réponse' + (r.b > 1 ? 's' : '') + ' sur ' + nbq +
          ' · meilleure série : ' + r.m + '</p></div>';
        try {
          if (typeof localStorage !== 'undefined') {
            var best = JSON.parse(localStorage.getItem('gg-quiz-best2') || 'null');
            var cur = { score: r.s, ts: state.gameTs };
            if (!best || cur.score > best.score) localStorage.setItem('gg-quiz-best2', JSON.stringify(cur));
            var stored = JSON.parse(localStorage.getItem('gg-quiz-best2') || 'null');
            if (stored && stored.ts === cur.ts && stored.score === cur.score) {
              html += '<p class="qz-sum-rec">🏆 Nouveau record personnel !</p>';
            } else if (stored) {
              html += '<p class="qz-sum-rec">🏅 Votre record : ' + stored.score + ' pts</p>';
            }
          }
        } catch (e) {}
        return html + '</div>';
      }
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
      var serie = rows.slice().sort(function (a, b) { return b.m - a.m; })[0];
      if (serie && serie.m >= 3) html += '<p class="qz-sum-rec">🔥 Plus longue série : ' + GG.esc(serie.n) + ' (' + serie.m + ')</p>';
      return html + '</div>';
    },

    /* Réseau : les bonnes réponses, les questions à venir et les réponses
       des autres (pendant la question) ne circulent jamais. */
    redact: function (state, viewer) {
      var c = GG.clone(state);
      c.qs = c.qs.map(function (q, k) {
        if (k > c.idx) return { cache: true };
        return { q: q.q, choices: q.choices, th: q.th, niv: q.niv };
      });
      var cache = c.phase === 'question' && c.opts.mode !== 'animateur';
      c.players.forEach(function (p, i) {
        p.hasAnswered = p.answer !== -1;
        if (cache && i !== viewer) { p.answer = null; p.t = null; }
      });
      if (c.ech) c.ech.maintenant = Date.now();
      return c;
    },

    apply: function (state, player, action) {
      action = action || {};
      var t = action.t;
      if (state.finished) return { ok: false, error: 'Partie terminée.' };
      norme(state);
      var n = state.players.length;
      if (t === 'expire') {
        // fin du chrono (minuteur de l'hôte, ou rendu après une reprise)
        if (state.phase !== 'question' || !state.ech || action.k !== cle(state)) return { ok: true };
        if (Date.now() < state.ech.fin - 300) return { ok: true };
        reveler(state, 'temps');
        return { ok: true };
      }
      if (t === 'theme' || t === 'go') {
        if (state.phase !== 'setup') return { ok: false, error: 'La partie a déjà commencé.' };
        if (player !== 0) return { ok: false, error: 'L’hôte prépare le quiz.' };
        var o = lireOpts(t === 'theme' ? { th: action.th } : action.opts, n);
        if (o.error) return { ok: false, error: o.error };
        state.opts = o;
        state.theme = o.th;
        state.qs = buildQuestions(o.th, o.diff, o.nb);
        state.idx = 0;
        return lancer(state);
      }
      if (state.phase === 'setup') return { ok: false, error: 'Choisissez d’abord le thème.' };
      if (t === 'answer') {
        if (state.phase !== 'question') return { ok: false, error: 'Trop tard : la réponse est révélée.' };
        var i = action.i;
        if (typeof i !== 'number' || i !== Math.floor(i) || i < 0 || i > 3) return { ok: false, error: 'Réponse invalide.' };
        if (state.opts.mode === 'animateur') {
          // l'animateur note la réponse annoncée ; retoucher la même forme l'efface
          if (player !== 0) return { ok: false, error: 'L’animateur note les réponses.' };
          var pa = state.players[action.pour];
          if (typeof action.pour !== 'number' || !pa) return { ok: false, error: 'Joueur inconnu.' };
          pa.answer = pa.answer === i ? -1 : i;
          return { ok: true };
        }
        var p = state.players[player];
        if (!p) return { ok: false, error: 'Joueur inconnu.' };
        if (p.answer !== -1) return { ok: false, error: 'Vous avez déjà répondu.' };
        var now = Date.now();
        if (state.ech && now > state.ech.fin + 1500) return { ok: false, error: 'Temps écoulé !' };
        var ecoule = Math.max(0, now - state.debut);
        var dt = +action.dt;
        if (dt === dt && dt > ecoule) ecoule = dt;   // un robot « réfléchit » : jamais plus vite que le réel
        if (state.ech) ecoule = Math.min(ecoule, state.ech.duree);
        p.answer = i;
        p.t = Math.round(ecoule);
        state.dernier = player;
        if (state.players.every(function (x) { return x.answer !== -1; })) reveler(state, 'tous');
        return { ok: true };
      }
      if (t === 'skip') {
        // « Ne plus attendre » : l'hôte révèle sans les absents
        if (state.phase !== 'question') return { ok: true };
        if (action.k !== undefined && action.k !== cle(state)) return { ok: true };
        if (player !== 0 && state.opts.mode !== 'secret') return { ok: false, error: 'Seul l’hôte peut révéler.' };
        reveler(state, 'hote');
        return { ok: true };
      }
      if (t === 'next') {
        if (state.phase !== 'reveal') return { ok: true };      // double appui : sans effet
        if (action.k !== undefined && action.k !== state.idx) return { ok: true };
        if (player !== 0 && state.opts.mode === 'chrono') return { ok: false, error: 'L’hôte passe à la suite.' };
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

    /* L'ordinateur : juste plus ou moins souvent selon son niveau et la
       difficulté de la question ; il « réfléchit » un temps crédible
       (le moteur ne le compte jamais plus rapide que la réalité). */
    bot: function (state, me, ctx) {
      if (state.finished || state.phase !== 'question') return null;
      if (!state.opts || state.opts.mode !== 'chrono') return null;
      var p = state.players[me];
      if (!p || p.answer !== -1) return null;
      var q = state.qs[state.idx];
      if (!q || !q.choices || typeof q.correct !== 'number') return null;
      var niveau = (ctx && ctx.niveau) || state.niveauIA || 'moyen';
      var P = NIV_IA[niveau] || NIV_IA.moyen;
      var proba = Math.max(0.15, Math.min(0.97, P.juste - ((q.niv || 2) - 2) * 0.1));
      var i = q.correct;
      if (Math.random() >= proba) {
        var faux = [0, 1, 2, 3].filter(function (x) { return x !== q.correct; });
        i = faux[Math.floor(Math.random() * faux.length)];
      }
      var T = state.ech ? state.ech.duree : 20000;
      var dt = (P.min + Math.random() * (P.max - P.min)) * T / 20000;
      return { t: 'answer', i: i, dt: Math.round(Math.min(dt, T - 400)) };
    },

    render: function (el, ctx) { rendu(el, ctx); },

    _BANK: BANK, _buildQuestions: buildQuestions, _THEMES: THEMES, _DIFFS: DIFFS,
    _themeCount: themeCount, _parseQ: parseQ, _NIV_IA: NIV_IA, _lireOpts: lireOpts
  };

  /* ================================================================
   * 3. Le rendu
   * ================================================================ */
  var FORMES = [
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2 22 20.4H2z"/></svg>',
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.8 22.2 12 12 22.2 1.8 12z"/></svg>',
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/></svg>',
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.6" y="2.6" width="18.8" height="18.8" rx="2.5"/></svg>'
  ];
  var NOMS_FORMES = ['Triangle', 'Losange', 'Rond', 'Carré'];
  var TEINTES = [330, 200, 45, 140, 265, 15, 175, 290, 95, 230, 60, 310];

  function estBot(p) { return /^🤖/.test(String((p && p.name) || '')); }
  function nom(s, i) { return GG.esc(String((s.players[i] || {}).name || '?').replace(/^🤖\s*/, '')); }
  function avatar(s, i) {
    var p = s.players[i] || { name: '?' };
    var init = String(p.name || '?').replace(/^🤖\s*/, '').charAt(0).toUpperCase() || '?';
    return '<span class="qz-av" style="--h:' + TEINTES[i % TEINTES.length] + '">' + (estBot(p) ? '🤖' : GG.esc(init)) + '</span>';
  }
  function etoiles(n) { n = Math.max(1, Math.min(3, n | 0)); return '★★★'.slice(0, n) + '☆☆☆'.slice(0, 3 - n); }
  function humains(s) { return s.players.filter(function (p) { return !estBot(p); }).length; }
  function aRepondu(p) { return !!(p && (p.hasAnswered || (typeof p.answer === 'number' && p.answer >= 0))); }
  function son(nom, o) { try { GG.sfx.play(nom, o); } catch (e) {} }
  function vibre(t) { try { GG.haptic(t); } catch (e) {} }

  function rendu(el, ctx) {
    var s = ctx.state;
    if (s.finished) { el.innerHTML = ''; el._qz = null; return; }
    norme(s);
    var R = el._qz;
    if (!R || !R.root || !el.contains(R.root)) {
      el.innerHTML = '<div class="qz"></div>';
      R = el._qz = { root: el.firstChild, cle: '', fx: {}, draft: null, dec: {} };
      brancher(R);
    }
    R.ctx = ctx;
    var cleVue = s.phase + ':' + s.gameTs + ':' + s.idx + ':' +
      (s.opts && s.opts.mode === 'secret' && s.phase === 'question' ? ctx.me : '') + ':' + (ctx.me === 0 ? 'h' : 'g');
    if (R.cle !== cleVue) {
      R.cle = cleVue;
      construire(R, s, ctx);
    }
    majDynamique(R, s, ctx);
    minuteur(R);
  }

  function construire(R, s, ctx) {
    var root = R.root;
    root.className = 'qz qz-' + s.phase;
    if (s.phase === 'setup') { root.innerHTML = htmlSetup(R, s, ctx); return; }
    var q = s.qs[s.idx] || {};
    if (s.phase === 'question') {
      root.innerHTML = htmlHaut(s, true) + htmlCarte(q) +
        (s.opts.mode === 'animateur' ? htmlTuiles(q, false) + htmlAnimateur(s) : htmlTuiles(q, true)) +
        '<div class="qz-etat"></div><div class="qz-actions"></div>';
      son('whoosh', { volume: 0.5 });
      return;
    }
    if (s.phase === 'reveal') {
      root.innerHTML = htmlHaut(s, false) + htmlCarte(q) + htmlRevelation(s, q, ctx) +
        '<div class="qz-verdict">' + htmlVerdict(s, ctx) + '</div>' +
        '<div class="qz-actions qz-suite">' + htmlSuite(s, ctx) + '</div>' +
        htmlClassement(s, ctx);
      effetsRevelation(R, s, ctx);
    }
  }

  /* ---------- écran de réglages ---------- */
  function draftInit(s, ctx) {
    var d = { th: 'melange', diff: 'progressif', nb: 10, chrono: 20, mode: 'chrono' };
    try {
      var m = JSON.parse(localStorage.getItem('gg-quiz-opts') || 'null');
      if (m && typeof m === 'object') {
        if (trouveTheme(m.th)) d.th = m.th;
        if (DIFFS.some(function (x) { return x.id === m.diff; })) d.diff = m.diff;
        if (NBS.indexOf(m.nb) !== -1) d.nb = m.nb;
        if (m.chrono === 0 || CHRONOS.indexOf(m.chrono) !== -1) d.chrono = m.chrono;
        if (m.mode === 'animateur' || m.mode === 'secret') d.mode = m.mode;
      }
    } catch (e) {}
    if (!unTelephone(s, ctx)) d.mode = 'chrono';
    else if (d.mode === 'chrono') d.mode = 'animateur';
    if (d.mode === 'chrono' && !d.chrono) d.chrono = 20;
    return d;
  }
  /* plusieurs humains autour d'un seul téléphone ? */
  function unTelephone(s, ctx) { return ctx.mode === 'local' && humains(s) >= 2; }

  function seg(k, liste, val) {
    return '<div class="qz-seg">' + liste.map(function (x) {
      return '<button class="qz-segb' + (x.v === val ? ' on' : '') + '" data-k="' + k + '" data-v="' + x.v + '">' + x.t + '</button>';
    }).join('') + '</div>';
  }

  function htmlSetup(R, s, ctx) {
    if (ctx.me !== 0) {
      return '<div class="qz-attente"><div class="qz-logo">💡</div><h2 class="qz-titre">Quiz</h2>' +
        '<p class="waiting">L’hôte choisit le thème et la difficulté…</p>' +
        '<div class="qz-joueurs">' + s.players.map(function (p, i) {
          return '<span class="qz-chip">' + avatar(s, i) + nom(s, i) + '</span>';
        }).join('') + '</div></div>';
    }
    var d = R.draft || (R.draft = draftInit(s, ctx));
    var html = '<div class="qz-hero"><div class="qz-logo">💡</div><div><h2 class="qz-titre">Quiz</h2>' +
      '<p class="qz-sous">' + BANK.length.toLocaleString('fr-FR') + ' questions · ' + (THEMES.length - 1) + ' thèmes</p></div></div>';
    html += '<p class="qz-lbl">Thème</p><div class="qz-themes">' + THEMES.map(function (t) {
      return '<button class="qz-theme' + (t.id === d.th ? ' on' : '') + '" data-th="' + t.id + '" aria-label="' + t.nom + '">' +
        '<span class="qz-th-ic">' + t.icone + '</span><span class="qz-th-nom">' + t.court + '</span></button>';
    }).join('') + '</div><p class="qz-th-info">' + infoTheme(d.th) + '</p>';
    html += '<p class="qz-lbl">Difficulté</p>' + seg('diff', DIFFS.map(function (x) {
      return { v: x.id, t: '<i>' + x.icone + '</i> ' + x.nom };
    }), d.diff).replace('class="qz-seg"', 'class="qz-seg qz-diff"');
    html += '<div class="qz-deux"><div><p class="qz-lbl">Questions</p>' + seg('nb', NBS.map(function (x) {
      return { v: String(x), t: String(x) };
    }), String(d.nb)) + '</div><div class="qz-zone-chrono"><p class="qz-lbl">Chrono</p>' + htmlChronos(s, ctx, d) + '</div></div>';
    if (unTelephone(s, ctx)) {
      html += '<p class="qz-lbl">Sur ce téléphone</p><div class="qz-modes">' +
        '<button class="qz-mode' + (d.mode === 'animateur' ? ' on' : '') + '" data-k="mode" data-v="animateur">' +
        '<b>🎤 Animateur</b><small>Un seul écran, réponses à voix haute.</small></button>' +
        '<button class="qz-mode' + (d.mode === 'secret' ? ' on' : '') + '" data-k="mode" data-v="secret">' +
        '<b>🙈 Chacun son tour</b><small>Réponses secrètes, on se passe le téléphone.</small></button></div>';
    }
    html += '<div class="qz-go-zone"><button class="btn big jeu qz-go" data-a="go">🚀 C’est parti !</button></div>';
    return html;
  }
  function infoTheme(id) {
    var t = trouveTheme(id) || THEMES[0];
    return t.icone + ' <strong>' + t.nom + '</strong> · ' + themeCount(t.id).toLocaleString('fr-FR') + ' questions';
  }
  function htmlChronos(s, ctx, d) {
    if (d.mode === 'secret') return '<div class="qz-seg"><span class="qz-segb off">Sans chrono</span></div>';
    var l = CHRONOS.map(function (x) { return { v: String(x), t: x + ' s' }; });
    if (d.mode === 'animateur') l.push({ v: '0', t: 'Sans' });
    return seg('chrono', l, String(d.chrono));
  }

  /* ---------- question ---------- */
  function htmlHaut(s, avecChrono) {
    var q = s.qs[s.idx] || {};
    var th = trouveTheme(q.th) || THEMES[0];
    var h = '<div class="qz-top"><span class="qz-num">Question <b>' + (s.idx + 1) + '</b>/' + s.qs.length + '</span>' +
      '<span class="qz-tag"><span class="qz-tag-nom">' + th.icone + ' ' + th.nom + '</span><span class="qz-etoiles" title="Difficulté">' + etoiles(q.niv) + '</span></span>';
    if (avecChrono && s.ech) {
      h += '<div class="qz-timer" data-k="' + GG.esc(s.ech.k) + '"><svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="19" class="qz-timer-f"/>' +
        '<circle cx="22" cy="22" r="19" class="qz-timer-p"/></svg><b></b></div>';
    }
    h += '</div><div class="qz-prog"><i style="width:' + Math.round(100 * (s.idx + (s.phase === 'reveal' ? 1 : 0)) / Math.max(1, s.qs.length)) + '%"></i></div>';
    return h;
  }
  function htmlCarte(q) {
    return '<div class="qz-carte"><p class="qz-q">' + GG.esc(q.q || '') + '</p></div>';
  }
  function htmlTuiles(q, cliquables) {
    var ch = q.choices || [];
    return '<div class="qz-choices qz-tuiles' + (cliquables ? '' : ' fixes') + '">' + ch.map(function (c, i) {
      var att = cliquables ? ' data-i="' + i + '" aria-label="' + NOMS_FORMES[i] + ' : ' + GG.esc(c) + '"' : '';
      return '<' + (cliquables ? 'button' : 'div') + ' class="qz-choice qz-t' + i + '" style="--n:' + i + '"' + att + '>' +
        '<span class="qz-forme">' + FORMES[i] + '</span><span class="qz-txt">' + GG.esc(c) + '</span></' + (cliquables ? 'button' : 'div') + '>';
    }).join('') + '</div>';
  }
  function htmlAnimateur(s) {
    return '<p class="qz-lbl qz-anim-lbl">🎤 Notez la réponse annoncée par chacun</p><div class="qz-anim">' + s.players.map(function (p, k) {
      return '<div class="qz-arow" data-row="' + k + '">' + avatar(s, k) + '<span class="qz-an">' + nom(s, k) + '</span>' +
        '<span class="qz-amini">' + [0, 1, 2, 3].map(function (i) {
          return '<button class="qz-mini qz-t' + i + '" data-pour="' + k + '" data-i="' + i + '" aria-label="' + NOMS_FORMES[i] + '">' + FORMES[i] + '</button>';
        }).join('') + '</span></div>';
    }).join('') + '</div>';
  }

  /* ---------- révélation ---------- */
  function htmlRevelation(s, q, ctx) {
    var r = s.reveal || {};
    var ch = q.choices || [];
    var n = Math.max(1, s.players.length);
    return '<div class="qz-choices qz-tuiles rev">' + ch.map(function (c, i) {
      var bon = i === r.correct;
      var qui = [];
      (r.answers || []).forEach(function (a, pi) { if (a === i) qui.push(nom(s, pi)); });
      var nb = (r.counts || [])[i] || 0;
      return '<div class="qz-choice show qz-t' + i + (bon ? ' good' : ' faux') + '" style="--n:' + i + '">' +
        '<span class="qz-forme">' + FORMES[i] + '</span><span class="qz-txt">' + GG.esc(c) + '</span>' +
        (bon ? '<span class="qz-coche" aria-label="Bonne réponse">✓</span>' : '') +
        '<span class="qz-jauge"><i style="--p:' + Math.round(100 * nb / n) + '%"></i><em>' + nb + '</em></span>' +
        (qui.length ? '<small>' + qui.join(', ') + '</small>' : '') + '</div>';
    }).join('') + '</div>';
  }
  function htmlVerdict(s, ctx) {
    var r = s.reveal || {};
    var me = ctx.me;
    if (s.opts.mode !== 'chrono') {
      var bons = (r.answers || []).filter(function (a) { return a === r.correct; }).length;
      return '<div class="qz-v neutre"><b>' + (bons ? bons + ' bonne' + (bons > 1 ? 's' : '') + ' réponse' + (bons > 1 ? 's' : '') + ' !' : 'Personne n’a trouvé 😅') + '</b></div>';
    }
    var a = (r.answers || [])[me];
    var g = (r.gains || [])[me] || 0;
    var serie = (r.series || [])[me] || 0;
    var cls, txt;
    if (a === r.correct) {
      cls = 'bon';
      txt = '<b>Bonne réponse !</b><span class="qz-plus">+' + g + '</span>' +
        (serie >= 2 ? '<span class="qz-serie">🔥 Série ×' + serie + '</span>' : '');
    } else if (a === -1 || a === undefined || a === null) {
      cls = 'rate';
      txt = '<b>' + (r.pourquoi === 'temps' ? '⏱ Temps écoulé !' : 'Pas de réponse') + '</b>';
    } else {
      cls = 'rate';
      txt = '<b>Raté…</b><span class="qz-perdu">' + (serie === 0 && s.players[me] && s.players[me].meilleure >= 2 ? 'série perdue' : '+0') + '</span>';
    }
    var premier = r.premier >= 0 && s.players.length > 1 ? '<p class="qz-eclair">⚡ Le plus rapide : <strong>' + nom(s, r.premier) + '</strong></p>' : '';
    return '<div class="qz-v ' + cls + '">' + txt + '</div>' + premier;
  }
  function htmlSuite(s, ctx) {
    var fin = s.idx + 1 >= s.qs.length;
    var peut = ctx.me === 0 || s.opts.mode !== 'chrono';
    if (!peut) return '<p class="waiting">L’hôte lance la question suivante…</p>';
    return '<button class="btn big jeu qz-next" data-a="next" disabled>' + (fin ? '🏁 Voir le podium' : '➜ Question suivante') + '</button>';
  }
  function htmlClassement(s, ctx) {
    var r = s.reveal || {};
    var avant = r.avant || s.players.map(function (p) { return p.score; });
    var ordreAvant = s.players.map(function (p, i) { return i; }).sort(function (a, b) { return avant[b] - avant[a] || a - b; });
    var ordre = s.players.map(function (p, i) { return i; }).sort(function (a, b) { return s.players[b].score - s.players[a].score || a - b; });
    var perso = s.opts.mode === 'chrono';
    var montre = ordre.slice(0, 5);
    if (perso && ordre.indexOf(ctx.me) >= 5) montre.push(ctx.me);
    return '<div class="qz-classement">' + montre.map(function (i) {
      var rang = ordre.indexOf(i), rangAvant = ordreAvant.indexOf(i);
      var g = (r.gains || [])[i] || 0;
      return '<div class="qz-rang' + (perso && i === ctx.me ? ' moi' : '') + '" style="--d:' + (rangAvant - rang) + ';--n:' + rang + '">' +
        '<span class="qz-pos">' + (rang + 1) + '</span>' + avatar(s, i) + '<span class="qz-nom">' + nom(s, i) + '</span>' +
        ((r.series || [])[i] >= 3 ? '<span class="qz-feu">🔥' + r.series[i] + '</span>' : '') +
        (g ? '<span class="qz-gain">+' + g + '</span>' : '') +
        '<b class="qz-pts" data-de="' + (avant[i] | 0) + '" data-a="' + s.players[i].score + '">' + s.players[i].score + '</b></div>';
    }).join('') + '</div>';
  }

  /* ---------- mises à jour sans reconstruire ---------- */
  function majDynamique(R, s, ctx) {
    var root = R.root;
    if (s.phase === 'setup') return;
    if (s.phase === 'question') {
      var etat = root.querySelector('.qz-etat');
      var actions = root.querySelector('.qz-actions');
      var n = s.players.length;
      var faits = s.players.filter(aRepondu).length;
      if (s.opts.mode === 'animateur') {
        s.players.forEach(function (p, k) {
          var row = root.querySelector('.qz-arow[data-row="' + k + '"]');
          if (!row) return;
          row.classList.toggle('ok', aRepondu(p));
          row.querySelectorAll('.qz-mini').forEach(function (b) {
            b.classList.toggle('on', +b.getAttribute('data-i') === p.answer);
          });
        });
        if (etat) etat.innerHTML = '<p class="qz-compte">' + faits + ' / ' + n + ' réponse' + (faits > 1 ? 's' : '') + ' notée' + (faits > 1 ? 's' : '') + '</p>';
        if (actions && !actions.firstChild) actions.innerHTML = '<button class="btn big jeu qz-reveler" data-a="skip">👀 Révéler la réponse</button>';
        return;
      }
      var moi = s.players[ctx.me];
      var mienne = moi && typeof moi.answer === 'number' && moi.answer >= 0 ? moi.answer
        : (R.local && R.local.k === s.idx && R.local.qui === ctx.me ? R.local.i : -1);
      root.querySelectorAll('.qz-choice[data-i]').forEach(function (b) {
        var i = +b.getAttribute('data-i');
        b.classList.toggle('picked', mienne === i);
        b.classList.toggle('dim', mienne !== -1 && mienne !== i);
        b.disabled = mienne !== -1;
      });
      if (etat) {
        var h;
        if (mienne !== -1) {
          h = '<p class="qz-verrou">✔ Réponse verrouillée</p>';
        } else if (s.opts.mode === 'secret') {
          h = '<p class="qz-verrou a-toi">🙈 À toi, <strong>' + nom(s, ctx.me) + '</strong> : réponse secrète</p>';
        } else {
          h = '<p class="qz-verrou a-toi">⚡ Plus vous êtes rapide, plus vous marquez !</p>';
        }
        if (n > 1) {
          h += '<div class="qz-attendus"><span class="qz-compte">' + faits + '/' + n + ' ont répondu</span>' + s.players.map(function (p, i) {
            return '<span class="qz-mini-av' + (aRepondu(p) ? ' ok' : '') + '" title="' + nom(s, i) + '">' + avatar(s, i) + '</span>';
          }).join('') + '</div>';
        }
        etat.innerHTML = h;
      }
      if (actions) {
        var skip = s.opts.mode === 'chrono' && ctx.me === 0 && n > 1 && faits > 0 && faits < n;
        var a0 = actions.querySelector('[data-a="skip"]');
        if (skip && !a0) actions.innerHTML = '<button class="btn small qz-skip" data-a="skip">⏭ Ne plus attendre</button>';
        else if (!skip && a0) actions.innerHTML = '';
      }
    }
  }

  /* ---------- effets de la révélation (une seule fois par question) ---------- */
  function effetsRevelation(R, s, ctx) {
    var k = s.gameTs + ':' + s.idx;
    var root = R.root;
    var r = s.reveal || {};
    // le bouton « suivant » s'arme après l'animation (anti double appui)
    setTimeout(function () {
      var b = root.querySelector('[data-a="next"]');
      if (b) b.disabled = false;
    }, 900);
    var rejoue = R.fx.rev === k;
    R.fx.rev = k;
    // les scores défilent
    root.querySelectorAll('.qz-pts').forEach(function (el) {
      var de = +el.getAttribute('data-de'), a = +el.getAttribute('data-a');
      if (!rejoue && de !== a) {
        el.textContent = de;
        setTimeout(function () { try { GG.fx.countUp(el, de, a, 900); } catch (e) { el.textContent = a; } }, 650);
      }
    });
    if (rejoue) { root.classList.add('sans-anim'); return; }
    var bonne = root.querySelector('.qz-choice.good');
    if (s.opts.mode !== 'chrono') {
      son('reveal');
      if (bonne) setTimeout(function () { try { GG.fx.burst(bonne, { count: 18, shape: 'star' }); } catch (e) {} }, 350);
      return;
    }
    var a = (r.answers || [])[ctx.me];
    var v = root.querySelector('.qz-v');
    if (a === r.correct) {
      son('correct');
      vibre('success');
      var serie = (r.series || [])[ctx.me] || 0;
      if (serie >= 3) setTimeout(function () { son('combo', { level: Math.min(8, serie) }); }, 380);
      setTimeout(function () {
        try {
          if (bonne) GG.fx.burst(bonne, { count: 16 + Math.min(serie, 6) * 3, shape: 'star' });
          if (v) GG.fx.floatText(v, '+' + ((r.gains || [])[ctx.me] || 0), { color: '#ffd84d', size: 30 });
        } catch (e) {}
      }, 300);
    } else {
      son('wrong');
      vibre('error');
      setTimeout(function () { try { if (v) GG.fx.shake(v); } catch (e) {} }, 250);
    }
  }

  /* ---------- évènements (délégués, un seul branchement) ---------- */
  function brancher(R) {
    var root = R.root;
    R.clic = 0;
    R.derniere = '';
    root.addEventListener('click', function (ev) {
      var cible = ev.target.closest ? ev.target.closest('button') : null;
      if (!cible || !root.contains(cible) || cible.disabled) return;
      var ctx = R.ctx, s = ctx && ctx.state;
      if (!s) return;
      var now = Date.now();
      // réglages : changements locaux, sans réseau
      if (cible.hasAttribute('data-th') && s.phase === 'setup') {
        R.draft.th = cible.getAttribute('data-th');
        root.querySelectorAll('.qz-theme').forEach(function (b) { b.classList.toggle('on', b === cible); });
        var info = root.querySelector('.qz-th-info');
        if (info) info.innerHTML = infoTheme(R.draft.th);
        son('select');
        return;
      }
      var k = cible.getAttribute('data-k');
      if (k && s.phase === 'setup') {
        var v = cible.getAttribute('data-v');
        R.draft[k] = k === 'nb' || k === 'chrono' ? parseInt(v, 10) : v;
        if (k === 'mode' && v === 'chrono') R.draft.chrono = R.draft.chrono || 20;
        if (k === 'mode' && v !== 'animateur' && R.draft.chrono === 0) R.draft.chrono = 20;
        cible.parentNode.querySelectorAll('[data-k="' + k + '"]').forEach(function (b) { b.classList.toggle('on', b === cible); });
        if (k === 'mode') {
          var z = root.querySelector('.qz-zone-chrono');
          if (z) z.innerHTML = '<p class="qz-lbl">Chrono</p>' + htmlChronos(s, ctx, R.draft);
        }
        son('toggle');
        return;
      }
      var a = cible.getAttribute('data-a');
      // anti double appui : une même action ne part qu'une fois (clé + 400 ms)
      function garde(cle) {
        if (R.derniere === cle && now - R.clic < 400) return false;
        R.derniere = cle;
        R.clic = now;
        return true;
      }
      if (a === 'go') {
        if (!garde('go')) return;
        try { localStorage.setItem('gg-quiz-opts', JSON.stringify(R.draft)); } catch (e) {}
        ctx.act({ t: 'go', opts: R.draft });
        return;
      }
      if (a === 'skip') {
        var kq = s.ech ? s.ech.k : ('q' + s.gameTs + ':' + s.idx);
        if (garde('skip:' + kq)) ctx.act({ t: 'skip', k: kq });
        return;
      }
      if (a === 'next') {
        if (!garde('next:' + s.idx)) return;
        cible.disabled = true;
        ctx.act({ t: 'next', k: s.idx });
        return;
      }
      if (cible.hasAttribute('data-pour') && s.phase === 'question') {
        if (!garde('pour:' + s.idx + ':' + cible.getAttribute('data-pour') + ':' + cible.getAttribute('data-i'))) return;
        son('select', { volume: 0.6 });
        ctx.act({ t: 'answer', i: +cible.getAttribute('data-i'), pour: +cible.getAttribute('data-pour') });
        return;
      }
      if (cible.hasAttribute('data-i') && s.phase === 'question') {
        if (R.local && R.local.k === s.idx && R.local.qui === ctx.me) return;   // déjà répondu
        var i = +cible.getAttribute('data-i');
        R.local = { k: s.idx, i: i, qui: ctx.me };
        son('select');
        vibre('select');
        root.querySelectorAll('.qz-choice[data-i]').forEach(function (b) {
          b.classList.toggle('picked', b === cible);
          b.classList.toggle('dim', b !== cible);
          b.disabled = true;
        });
        try { GG.fx.pop(cible); } catch (e) {}
        var v0 = root.querySelector('.qz-etat .qz-verrou');
        if (v0) { v0.className = 'qz-verrou'; v0.textContent = '✔ Réponse verrouillée'; }
        if (ctx.act({ t: 'answer', i: i }) === false) {
          R.local = null;
          root.querySelectorAll('.qz-choice[data-i]').forEach(function (b) {
            b.classList.remove('picked', 'dim');
            b.disabled = false;
          });
        }
      }
    });
  }

  /* ---------- le chrono (sans redessiner l'écran) ---------- */
  function minuteur(R) {
    function maj() {
      var root = R.root;
      if (!root.isConnected) { clearInterval(R.tick); R.tick = null; return; }
      var ctx = R.ctx, s = ctx && ctx.state;
      var t = root.querySelector('.qz-timer');
      if (!t || !s || !s.ech) return;
      var k = s.ech.k;
      // horloge de l'hôte ramenée à la nôtre (décalage mesuré à la réception)
      if (R.dec[k] === undefined) R.dec[k] = s.ech.maintenant ? Date.now() - s.ech.maintenant : 0;
      if (Math.abs(R.dec[k]) < 400) R.dec[k] = 0;
      var duree = s.ech.duree || 1;
      var reste = Math.max(0, Math.min(duree, s.ech.fin + R.dec[k] - Date.now()));
      var sec = Math.ceil(reste / 1000);
      var b = t.querySelector('b');
      if (b && b.textContent !== String(sec)) {
        b.textContent = sec;
        var moi = s.players[ctx.me];
        var attends = s.opts.mode === 'animateur' || (moi && !aRepondu(moi) && !(R.local && R.local.k === s.idx && R.local.qui === ctx.me));
        if (sec <= 5 && sec > 0 && attends) son('tick', { volume: 0.35 });
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
