/*
 * GGgames — Mots croisés (1 à 4 joueurs, grille partagée, 3 niveaux).
 * Une base de centaines de définitions écrites à la main ; le générateur
 * croise les mots au hasard : chaque partie produit une grille différente
 * (des milliers de combinaisons possibles par niveau).
 */
(function (root) {
  'use strict';
  var GG = root.GG;

  var LEVELS = {
    facile: { nom: 'Facile', size: 9, n: 6 },
    moyen: { nom: 'Moyen', size: 11, n: 8 },
    difficile: { nom: 'Difficile', size: 13, n: 10 }
  };
  var COLORS = ['#e2a33c', '#5aa7de', '#68b56b', '#c77bd6'];

  /* ---------------- base de définitions (MOT|définition) ---------------- */
  var DB = {};
  DB.facile = [
    'CHAT|Il ronronne sur le canapé', 'CHIEN|Il aboie et remue la queue', 'VACHE|Elle donne du lait',
    'POULE|Elle pond des œufs', 'CANARD|Il barbote dans la mare', 'LAPIN|Il adore les carottes',
    'SOURIS|Le chat la poursuit', 'CHEVAL|On le monte au galop', 'MOUTON|Il donne de la laine',
    'COCHON|Rose, il adore la boue', 'OURS|Il hiberne tout l’hiver', 'LOUP|Il hurle à la lune',
    'RENARD|Rusé chapardeur de poules', 'SINGE|Acrobate des arbres', 'LION|Le roi des animaux',
    'TIGRE|Grand félin rayé', 'ZEBRE|Cheval rayé d’Afrique', 'GIRAFE|Son cou est immense',
    'REQUIN|Grand prédateur des mers', 'BALEINE|Le plus gros animal marin', 'DAUPHIN|Cétacé joueur et malin',
    'TORTUE|Elle porte sa maison', 'SERPENT|Il rampe et siffle', 'ABEILLE|Elle fabrique le miel',
    'FOURMI|Travailleuse en colonie', 'OISEAU|Il vole et fait son nid', 'AIGLE|Rapace royal',
    'HIBOU|Rapace de nuit', 'CANARI|Petit oiseau jaune', 'POISSON|Il respire sous l’eau',
    'PAIN|Il sort chaud de la boulangerie', 'FROMAGE|Le plateau qui arrive après le plat', 'BEURRE|On le tartine le matin',
    'LAIT|Boisson blanche du matin', 'OEUF|La poule le pond', 'SUCRE|Il adoucit le café',
    'SEL|On en met une pincée', 'POIVRE|Épice qui pique le nez', 'POMME|Fruit croqué du verger',
    'POIRE|Fruit juteux en forme de goutte', 'BANANE|Fruit jaune qui se pèle', 'ORANGE|Agrume plein de vitamines',
    'CITRON|Agrume très acide', 'FRAISE|Petit fruit rouge du printemps', 'CERISE|Petit fruit rouge à noyau',
    'RAISIN|Fruit de la vigne', 'MELON|Gros fruit sucré de l’été', 'TOMATE|Rouge, en salade ou en sauce',
    'CAROTTE|Légume préféré des lapins', 'SALADE|Verte, on l’assaisonne', 'RIZ|Céréale des sushis',
    'SOUPE|Potage du soir', 'GATEAU|Dessert d’anniversaire', 'TARTE|Dessert aux pommes, par exemple',
    'CREPE|Fine galette de la Chandeleur', 'GLACE|Dessert en cornet ou miroir d’hiver', 'BONBON|Douceur des enfants',
    'MIEL|Les abeilles le fabriquent', 'JAMBON|Tranche de charcuterie', 'POULET|Volaille rôtie du dimanche',
    'FRITES|Bâtonnets dorés et salés', 'PIZZA|Spécialité italienne garnie', 'AIL|Il éloigne les vampires',
    'MENTHE|Feuille fraîche du sirop vert', 'NOIX|Fruit à coque du noyer', 'CIDRE|Jus de pomme qui pétille',
    'MAISON|On y habite', 'TOIT|Il couvre la maison', 'MUR|Il sépare deux pièces',
    'PORTE|On la pousse pour entrer', 'FENETRE|On l’ouvre pour aérer', 'CLE|Elle ouvre la serrure',
    'CUISINE|La pièce des bons petits plats', 'CHAMBRE|La pièce où l’on dort', 'SALON|La pièce du canapé',
    'GARAGE|La voiture y dort', 'JARDIN|On y plante des fleurs', 'TABLE|On mange autour',
    'CHAISE|Siège à quatre pieds', 'CANAPE|Long siège du salon', 'LIT|On y dort la nuit',
    'ARMOIRE|Meuble à vêtements', 'MIROIR|Il renvoie votre image', 'LAMPE|Elle éclaire la pièce',
    'BOUGIE|Petite flamme sur le gâteau', 'TAPIS|Il réchauffe le sol', 'RIDEAU|Il habille la fenêtre',
    'BALAI|Il chasse la poussière', 'SAVON|Il mousse dans la douche', 'BROSSE|Pour les dents ou les cheveux',
    'PEIGNE|Il démêle les cheveux', 'VERRE|On y verse la boisson', 'COUTEAU|Il coupe la viande',
    'BOL|Récipient du petit-déjeuner', 'TASSE|On y boit le café', 'FRIGO|Il garde les aliments au frais',
    'FOUR|On y cuit le gâteau', 'EVIER|On y fait la vaisselle', 'TETE|Elle porte le chapeau',
    'BRAS|Entre l’épaule et la main', 'MAIN|Elle a cinq doigts', 'DOIGT|Il porte la bague',
    'PIED|Il entre dans la chaussure', 'JAMBE|Elle sert à marcher', 'DOS|On le tourne pour partir',
    'VENTRE|Il gargouille quand on a faim', 'COEUR|Il bat dans la poitrine', 'BOUCHE|Elle sourit et embrasse',
    'DENT|Blanche, elle croque', 'NEZ|Il sent les odeurs', 'OEIL|Il ne perd rien de la scène',
    'GENOU|Il plie au milieu de la jambe', 'EPAULE|Elle porte le sac', 'OREILLE|Elle entend tout',
    'SOLEIL|Il brille le jour', 'LUNE|Elle éclaire la nuit', 'ETOILE|Elle scintille dans le ciel',
    'NUAGE|Il cache parfois le soleil', 'PLUIE|Elle tombe du ciel', 'NEIGE|Blanche en hiver',
    'VENT|Il souffle fort', 'ORAGE|Éclairs et tonnerre', 'MER|Étendue d’eau salée',
    'PLAGE|Sable au bord de l’eau', 'VAGUE|Elle roule sur le sable', 'SABLE|On y bâtit des châteaux',
    'ILE|Terre entourée d’eau', 'FLEUVE|Il se jette dans la mer', 'LAC|Grande étendue d’eau douce',
    'PONT|Il enjambe la rivière', 'FORET|Le royaume des arbres', 'ARBRE|Il perd ses feuilles en automne',
    'FEUILLE|Elle tombe en automne', 'FLEUR|Elle parfume le jardin', 'ROSE|Fleur à épines',
    'HERBE|Verte dans le pré', 'CHAMP|Le blé y pousse', 'FERME|Les animaux y vivent',
    'VALLEE|Creux entre deux montagnes', 'GROTTE|Caverne dans la roche', 'DESERT|Océan de sable',
    'VOLCAN|Montagne qui crache du feu', 'HIVER|La saison la plus froide', 'ETE|La saison des vacances',
    'AUTOMNE|La saison des feuilles mortes', 'MATIN|Début de la journée', 'SOIR|Fin de la journée',
    'NUIT|Quand tout dort', 'JOUR|Entre deux nuits', 'PIERRE|Caillou ou prénom',
    'VOITURE|Quatre roues et un volant', 'VELO|Deux roues et un guidon', 'TRAIN|Il file sur les rails',
    'AVION|Il vole au-dessus des nuages', 'BATEAU|Il flotte sur l’eau', 'BUS|Transport en commun',
    'MOTO|Deux roues à moteur', 'FUSEE|Elle décolle vers l’espace', 'ROUE|Elle tourne sous la voiture',
    'VOLANT|Le conducteur le tient', 'ROUTE|Les voitures y roulent', 'RUE|Voie bordée de trottoirs',
    'VILLE|Immeubles et boulevards', 'VILLAGE|Petite commune de campagne', 'ECOLE|On y apprend à lire',
    'LIVRE|On tourne ses pages', 'CRAYON|Il écrit et se taille', 'STYLO|Il écrit à l’encre',
    'GOMME|Elle efface les erreurs', 'CAHIER|On y écrit ses leçons', 'LETTRE|On la poste avec un timbre',
    'TIMBRE|Collé sur l’enveloppe', 'PHOTO|Souvenir en image', 'PIANO|Touches noires et blanches',
    'VIOLON|On le joue avec un archet', 'FLUTE|On souffle dedans', 'DANSE|L’art du mouvement',
    'CINEMA|Grand écran et pop-corn', 'FILM|On le regarde au cinéma', 'JOUET|Le cadeau préféré des enfants',
    'BALLON|Rond, on le shoote', 'CARTE|As, roi, dame, valet…', 'CIRQUE|Chapiteau et acrobates',
    'CLOWN|Il a un nez rouge', 'ROI|Il porte la couronne', 'REINE|L’épouse du roi',
    'PRINCE|Le fils du roi', 'FEE|Elle a une baguette magique', 'DRAGON|Il crache du feu',
    'PIRATE|Écumeur des mers', 'TRESOR|Coffre rempli d’or', 'EPEE|L’arme du chevalier',
    'CHATEAU|La demeure du roi', 'TOUR|Donjon ou pièce d’échecs', 'PONEY|Petit cheval',
    'GEANT|Il dépasse tout le monde', 'ROBE|Vêtement d’une seule pièce', 'JUPE|Elle tourne quand on danse',
    'PULL|Il tient chaud en hiver', 'MANTEAU|On l’enfile pour sortir l’hiver', 'BOTTE|Chaussure de pluie',
    'GANT|Il habille la main', 'BONNET|Il couvre la tête en hiver', 'ECHARPE|Elle entoure le cou',
    'CHAPEAU|Il protège du soleil', 'POCHE|On y glisse les mains', 'BOUTON|Il ferme la chemise',
    'CHEMISE|Vêtement à col', 'AMI|On peut compter sur lui', 'FETE|Musique, gâteaux et invités',
    'CADEAU|Surprise emballée', 'NOEL|La fête du sapin', 'ARGENT|Il ne fait pas le bonheur',
    'PIECE|Monnaie ronde', 'EURO|Monnaie commune de l’Union', 'BEBE|Il pleure dans son berceau',
    'PAPA|Le père des enfants', 'MAMAN|On l’appelle quand ça va mal', 'FRERE|Fils des mêmes parents',
    'SOEUR|Fille des mêmes parents', 'TANTE|La sœur de maman', 'ONCLE|Le frère de papa',
    'MAMIE|La grand-mère', 'PAPI|Le grand-père', 'REVE|Le film de la nuit',
    'PEUR|Elle donne la chair de poule', 'JOIE|Bonheur qui éclate', 'RIRE|Éclat de bonne humeur',
    'ROUGE|Couleur du coquelicot', 'BLEU|Couleur du ciel', 'VERT|Couleur de l’herbe',
    'JAUNE|Couleur du citron', 'NOIR|Couleur de la nuit', 'BLANC|Couleur de la neige',
    'GRIS|Couleur de la souris', 'VIOLET|Couleur de l’aubergine', 'MANGER|Prendre son repas',
    'BOIRE|Avaler un liquide', 'DORMIR|Fermer les yeux toute la nuit', 'COURIR|Plus vite qu’en marchant',
    'SAUTER|Quitter le sol d’un bond', 'NAGER|Avancer dans l’eau', 'VOLER|Se déplacer dans les airs',
    'CHANTER|Pousser la chansonnette', 'JOUER|S’amuser', 'LIRE|Déchiffrer un livre',
    'ECRIRE|Tracer des mots', 'PARLER|Dire des mots', 'DONNER|Offrir',
    'OUVRIR|Le contraire de fermer', 'FERMER|Le contraire d’ouvrir', 'MONTER|Aller vers le haut',
    'TOMBER|Chuter', 'FROID|Le contraire de chaud', 'CHAUD|Le contraire de froid',
    'GRAND|Le contraire de petit', 'PETIT|Le contraire de grand', 'VITE|À toute allure'
  ];
  DB.moyen = [
    'ELEPHANT|Il a une trompe', 'CROCODILE|Ses larmes sont célèbres', 'PANTHERE|Félin tacheté ou tout noir',
    'GUEPARD|Le sprinteur de la savane', 'GAZELLE|Gracieuse proie du guépard', 'ANTILOPE|Cousine de la gazelle',
    'CHAMEAU|Deux bosses dans le désert', 'KANGOUROU|Il saute, son petit en poche', 'KOALA|Dormeur des eucalyptus',
    'MANCHOT|Empereur des glaces', 'PHOQUE|Il se prélasse sur la banquise', 'OTARIE|Acrobate des aquariums',
    'HERISSON|Boule de piquants', 'ECUREUIL|Il cache des noisettes', 'SANGLIER|Cochon sauvage',
    'CHEVREUIL|Gracieux habitant des bois', 'CIGOGNE|Elle niche sur les cheminées', 'MOINEAU|Petit oiseau des villes',
    'CORBEAU|Grand oiseau noir', 'PIGEON|Roucouleur des places', 'PERROQUET|Il répète ce qu’on dit',
    'FLAMANT|Échassier rose', 'AUTRUCHE|Le plus grand des oiseaux', 'PELICAN|Son bec est une épuisette',
    'LIBELLULE|Hélicoptère des étangs', 'CRIQUET|Insecte sauteur des champs', 'GRILLON|Il chante les soirs d’été',
    'SCARABEE|Coléoptère sacré des Égyptiens', 'MOUSTIQUE|Son bourdonnement gâche les nuits', 'GUEPE|Rayée et piquante',
    'FRELON|Grosse guêpe redoutée', 'CIGALE|Elle chante tout l’été', 'HOMARD|Crustacé aux grosses pinces',
    'CREVETTE|Rose une fois cuite', 'HUITRE|Coquillage des réveillons', 'ESCARGOT|Il porte sa coquille',
    'MEDUSE|Transparente et urticante', 'PIEUVRE|Huit bras à ventouses', 'TRUITE|Poisson des torrents',
    'SAUMON|Il remonte les rivières', 'SARDINE|Serrées en boîte', 'PAPILLON|Chenille devenue ailes',
    'ARAIGNEE|Elle tisse sa toile', 'HORIZON|Là où ciel et terre se touchent', 'BOUSSOLE|Son aiguille cherche le nord',
    'ANCRE|Elle retient le navire', 'PHARE|Il guide les marins la nuit', 'VOILIER|Bateau poussé par le vent',
    'GALAXIE|Des milliards d’étoiles', 'PLANETE|Elle tourne autour d’une étoile', 'COMETE|Astre à longue chevelure',
    'SATURNE|La planète aux anneaux', 'JUPITER|La plus grosse planète', 'ECLIPSE|La Lune cache le Soleil',
    'ORBITE|Trajet autour d’un astre', 'ATLAS|Recueil de cartes', 'EQUATEUR|La ligne qui partage le globe',
    'GLACIER|Fleuve de glace', 'BANQUISE|Glace flottante des pôles', 'SAVANE|La plaine des lions',
    'JUNGLE|Forêt tropicale épaisse', 'OASIS|Île verte du désert', 'DUNE|Colline de sable',
    'FALAISE|Paroi qui tombe dans la mer', 'CASCADE|Chute d’eau', 'TORRENT|Cours d’eau impétueux',
    'SOMMET|Le point le plus haut', 'AVALANCHE|Coulée de neige dévastatrice', 'SEISME|Tremblement de terre',
    'CYCLONE|Tempête qui tourne', 'TONNERRE|Il gronde après l’éclair', 'ROSEE|Gouttes du petit matin',
    'AURORE|Première lueur du jour', 'OMELETTE|Œufs battus à la poêle', 'QUICHE|Tarte salée lorraine',
    'RACLETTE|Fromage fondu de l’hiver', 'FONDUE|Fromage fondu au caquelon', 'COUSCOUS|Semoule et légumes',
    'PAELLA|Riz safrané espagnol', 'BAGUETTE|Pain parisien allongé', 'CROISSANT|Viennoiserie du matin',
    'BRIOCHE|Pain moelleux du dimanche', 'MACARON|Petit gâteau rond et coloré', 'MERINGUE|Blancs d’œufs croquants',
    'NOUGAT|Douceur de Montélimar', 'CARAMEL|Sucre fondu doré', 'VANILLE|Gousse parfumée',
    'CANNELLE|Épice des pains d’épices', 'MOUTARDE|Elle monte au nez', 'VINAIGRE|Il pique la salade',
    'HUILE|On la mélange au vinaigre', 'FARINE|Poudre blanche du boulanger', 'LEVURE|Elle fait gonfler la pâte',
    'ABRICOT|Fruit orangé à noyau', 'PECHE|Fruit à peau de velours', 'PRUNE|Mirabelle ou reine-claude',
    'FIGUE|Fruit violet du Midi', 'DATTE|Fruit du palmier', 'MANGUE|Fruit exotique orangé',
    'ANANAS|Fruit à écailles couronné', 'KIWI|Fruit vert à peau poilue', 'GRENADE|Fruit à grains rouges',
    'MYRTILLE|Petite baie bleue', 'FRAMBOISE|Baie rouge des ronciers', 'CASSIS|Baie noire des sirops',
    'NOISETTE|L’écureuil en raffole', 'AMANDE|Au cœur de la dragée', 'PISTACHE|Petite graine verte',
    'CHATAIGNE|Fruit à bogue de l’automne', 'POTIRON|Grosse courge orange', 'COURGETTE|Légume vert allongé',
    'AUBERGINE|Légume violet', 'POIREAU|Légume à blanc et à vert', 'EPINARD|Popeye en mangeait',
    'RADIS|Petit, rouge et croquant', 'NAVET|Légume blanc ou mauvais film', 'PERSIL|Herbe à parsemer',
    'BASILIC|L’herbe du pistou', 'LAURIER|Feuille des vainqueurs', 'OIGNON|Il fait pleurer',
    'CHOCOLAT|Noir, au lait ou blanc', 'CONFITURE|Fruits cuits au sucre', 'PARAPLUIE|On l’ouvre sous l’averse',
    'PARASOL|Ombre portable de la plage', 'VALISE|On la boucle avant le voyage', 'BAGAGE|On l’enregistre à l’aéroport',
    'BILLET|Ticket de train ou d’avion', 'PASSEPORT|Le sésame des frontières', 'MONNAIE|Les pièces rendues à la caisse',
    'LUNETTES|Elles corrigent la vue', 'MONTRE|Elle donne l’heure au poignet', 'HORLOGE|Elle sonne les heures',
    'REVEIL|Il sonne trop tôt le matin', 'CISEAUX|Deux lames pour couper', 'AIGUILLE|Elle pique et coud',
    'MARTEAU|Il enfonce les clous', 'TOURNEVIS|Il visse et dévisse', 'PERCEUSE|Elle fait des trous',
    'ECHELLE|On grimpe à ses barreaux', 'PINCEAU|L’outil du peintre', 'PALETTE|Le peintre y mélange ses couleurs',
    'TABLEAU|Accroché au mur du musée', 'STATUE|Sculpture dressée', 'MUSEE|La maison des œuvres d’art',
    'THEATRE|On y joue la comédie', 'CONCERT|Spectacle en musique', 'ORCHESTRE|Tous les musiciens ensemble',
    'TROMPETTE|Cuivre éclatant', 'SAXOPHONE|Le cuivre du jazz', 'BATTERIE|Tambours et cymbales',
    'ACCORDEON|Piano à bretelles', 'HARMONICA|Musique de poche', 'CLAVIER|Touches d’ordinateur ou de piano',
    'ECRAN|Surface d’affichage', 'TELEPHONE|Il sonne dans la poche', 'TABLETTE|Écran tactile ou de chocolat',
    'ROBOT|Machine qui obéit aux programmes', 'INTERNET|Le réseau mondial', 'MESSAGE|On l’envoie, on le reçoit',
    'JOURNAL|Les nouvelles du jour', 'ROMAN|Long récit inventé', 'POEME|Vers et rimes',
    'CONTE|Il était une fois…', 'LEGENDE|Récit merveilleux transmis', 'ESCALIER|On le monte marche à marche',
    'ASSIETTE|On mange dedans', 'CASSEROLE|Elle chauffe sur le feu', 'SERVIETTE|Plus elle sèche, plus elle mouille',
    'CUILLERE|Pour la soupe et le yaourt', 'FAUTEUIL|Siège confortable à accoudoirs', 'HEROS|Personnage principal courageux',
    'SORCIERE|Elle vole sur un balai', 'VAMPIRE|Il craint l’ail et le soleil', 'FANTOME|Il hante les châteaux',
    'MOMIE|Enveloppée de bandelettes', 'SQUELETTE|Tous les os réunis', 'PYRAMIDE|Tombeau des pharaons',
    'PHARAON|Roi de l’Égypte antique', 'CHEVALIER|Il combat en armure', 'ARMURE|Habit de fer',
    'BOUCLIER|Il pare les coups', 'FLECHE|Elle part de l’arc', 'CIBLE|La flèche la vise',
    'LANCE|Arme longue des tournois', 'DONJON|La plus haute tour du château', 'REMPART|Muraille de défense',
    'PRINTEMPS|La saison des bourgeons', 'BOULANGER|Il pétrit avant l’aube', 'POLICIER|Il siffle et enquête',
    'CHANTEUR|Sa voix est son métier', 'FOOTBALL|Onze joueurs, un ballon rond', 'TENNIS|Raquettes et filet',
    'RUGBY|Ballon ovale et mêlées', 'BASKET|Panier à trois points', 'NATATION|Le sport des bassins',
    'CYCLISME|Le sport de la petite reine', 'MARATHON|Course de 42 kilomètres', 'ESCRIME|Duel au fleuret',
    'JUDO|Art martial en kimono', 'BOXE|Combat aux poings gantés', 'PATINAGE|Glisse sur la glace',
    'PLONGEON|Saut dans la piscine', 'SURF|Glisse sur les vagues', 'SKI|Glisse sur la neige',
    'ARBITRE|Il siffle les fautes', 'STADE|L’enceinte des grands matchs', 'PODIUM|Les trois premiers y montent',
    'MEDAILLE|Or, argent ou bronze', 'TROPHEE|La coupe du vainqueur', 'RECORD|Meilleure performance',
    'EQUIPE|Tous sous le même maillot', 'MAILLOT|Jaune sur le Tour de France', 'SIFFLET|L’arbitre en joue',
    'GARDIEN|Dernier rempart devant le but', 'MEDECIN|Il rédige l’ordonnance', 'INFIRMIER|Il fait les piqûres',
    'DENTISTE|Il soigne les caries', 'AVOCAT|Défenseur au tribunal ou fruit vert', 'JUGE|Il rend la justice',
    'MAIRE|Premier citoyen de la commune', 'NOTAIRE|Il authentifie les actes', 'PLOMBIER|Il répare les fuites',
    'MACON|Il monte les murs', 'MENUISIER|Il travaille le bois', 'COIFFEUR|Ciseaux et brushing',
    'CUISINIER|Le chef des fourneaux', 'SERVEUR|Il apporte les plats', 'LIBRAIRE|Marchand de livres',
    'FLEURISTE|Marchand de bouquets', 'EPICIER|Commerçant de quartier', 'BOUCHER|Marchand de viande',
    'PATISSIER|L’artiste des gâteaux', 'BERGER|Il garde les moutons', 'PECHEUR|Il lance sa ligne',
    'CHASSEUR|Il traque le gibier', 'MINEUR|Il descendait à la mine', 'SOLDAT|Homme de troupe',
    'CAPITAINE|Il commande le navire', 'MATELOT|Marin du bord', 'DOUANIER|Il contrôle aux frontières',
    'ESPION|Agent secret', 'DETECTIVE|Enquêteur privé', 'TEMOIN|Il a tout vu',
    'VOLEUR|Il dérobe', 'PRISON|On y purge sa peine', 'ENQUETE|La recherche du coupable',
    'INDICE|Petit détail révélateur', 'MYSTERE|Une énigme entière', 'SECRET|Il ne faut pas le répéter',
    'ENIGME|Question piège', 'GRIMPER|Escalader', 'PLONGER|Piquer une tête',
    'GLISSER|Déraper sur la glace', 'RAMASSER|Prendre par terre', 'LANCER|Jeter loin',
    'ATTRAPER|Saisir au vol', 'DESSINER|Tracer au crayon', 'PEINDRE|Mettre en couleurs',
    'COUDRE|Assembler au fil', 'TRICOTER|Mailler la laine', 'BRICOLER|Réparer soi-même',
    'JARDINER|Cultiver son potager', 'CUISINER|Préparer les plats', 'SENTIR|Percevoir une odeur',
    'TOUCHER|Effleurer de la main', 'REGARDER|Poser les yeux sur', 'OBSERVER|Regarder très attentivement',
    'CHERCHER|Essayer de trouver', 'TROUVER|Mettre la main sur', 'GAGNER|Remporter la victoire',
    'PERDRE|Le contraire de gagner', 'COMPTER|Un, deux, trois…', 'MESURER|Prendre les dimensions',
    'PESER|Mettre sur la balance', 'VOYAGER|Partir découvrir le monde', 'EXPLORER|Partir en terre inconnue',
    'DECOUVRIR|Trouver pour la première fois', 'INVENTER|Créer ce qui n’existait pas', 'REPARER|Remettre en état',
    'NETTOYER|Rendre propre', 'RANGER|Mettre en ordre', 'VERSER|Faire couler dans le verre',
    'MELANGER|Remuer ensemble', 'GELER|Transformer en glace', 'FONDRE|Du solide au liquide',
    'BRULER|Détruire par le feu', 'BRILLER|Jeter des éclats de lumière', 'RAPIDE|Comme l’éclair',
    'TIMIDE|Il rougit facilement', 'CURIEUX|Il veut tout savoir', 'JOYEUX|De bonne humeur',
    'TRISTE|Le moral en berne', 'FIDELE|Comme un vieux chien', 'HONNETE|Il ne triche jamais',
    'SAGE|Comme une image', 'MALIN|Rusé comme un renard', 'FRAGILE|À manipuler avec soin',
    'SOLIDE|Il ne casse pas', 'LEGER|Comme une plume', 'LOURD|Difficile à soulever',
    'ETROIT|Le contraire de large', 'LARGE|Le contraire d’étroit', 'IMMENSE|Très très grand',
    'ANCIEN|D’autrefois', 'MODERNE|D’aujourd’hui', 'CELEBRE|Connu de tous',
    'INCONNU|Personne ne le connaît', 'BRUYANT|Il fait du vacarme', 'PROPRE|Tout juste lavé'
  ];
  DB.difficile = [
    'LABYRINTHE|On s’y perd volontiers', 'HIEROGLYPHE|Écriture des pharaons', 'ARCHIPEL|Famille d’îles',
    'PENINSULE|Presqu’île majuscule', 'ESTUAIRE|Embouchure évasée', 'AFFLUENT|Rivière qui en rejoint une autre',
    'MERIDIEN|Ligne imaginaire de pôle à pôle', 'LATITUDE|Position par rapport à l’équateur', 'SEXTANT|Instrument des navigateurs',
    'TELESCOPE|Il rapproche les étoiles', 'MICROSCOPE|Il grossit l’invisible', 'EPROUVETTE|Le tube du chimiste',
    'MOLECULE|Assemblage d’atomes', 'ATOME|Brique de la matière', 'GRAVITE|Elle fait tomber les pommes',
    'ENERGIE|Elle fait tourner le monde', 'AIMANT|Il attire le fer', 'CIRCUIT|Chemin fermé du courant',
    'AMPOULE|Idée lumineuse d’Edison', 'GIROUETTE|Elle tourne au sommet du clocher', 'CADRAN|Le soleil y lit l’heure',
    'SABLIER|Le temps y coule grain à grain', 'CALENDRIER|Les jours y défilent', 'BISSEXTILE|Année à 366 jours',
    'EPHEMERE|Qui ne dure qu’un jour', 'ETERNEL|Qui ne finit jamais', 'MIRAGE|Illusion du désert',
    'ECHO|La montagne répond', 'VERTIGE|Le sol semble tanguer', 'INSOMNIE|Nuit blanche subie',
    'SOMNAMBULE|Il marche en dormant', 'AMNESIE|La mémoire s’efface', 'NOSTALGIE|Douce mélancolie du passé',
    'EUPHORIE|Joie débordante', 'COLERE|La moutarde qui monte au nez', 'JALOUSIE|Défaut vert ou volet ajouré',
    'ORGUEIL|Fierté mal placée', 'MODESTIE|La qualité de qui ne se vante pas', 'SAGESSE|Elle vient avec l’âge',
    'COURAGE|Il n’attend pas le nombre des années', 'PATIENCE|Tout vient à point à qui l’a', 'PARESSE|La mère de tous les vices',
    'GOURMANDISE|Péché mignon', 'AVARICE|Le défaut de Picsou', 'GENEROSITE|La qualité des grands cœurs',
    'AMITIE|Trésor qui se partage', 'BONHEUR|Il tient parfois à un fil', 'DESTIN|Ce qui est écrit',
    'HASARD|Le pur fruit du tirage', 'FORTUNE|Elle sourit aux audacieux', 'NAUFRAGE|Fin tragique d’un navire',
    'EPAVE|Navire englouti', 'CORSAIRE|Pirate avec permission du roi', 'GALION|Navire espagnol chargé d’or',
    'CARAVELLE|Le navire de Christophe Colomb', 'BOUCANIER|Aventurier des Caraïbes', 'VIGIE|Elle crie « Terre ! »',
    'TIMONIER|Il tient la barre', 'GOUVERNAIL|Il donne le cap', 'AMIRAL|Le chef de la flotte',
    'ESCADRE|Flotte de guerre', 'FORTERESSE|Place forte imprenable', 'CITADELLE|Forteresse qui domine la ville',
    'MEURTRIERE|Fenêtre de tir médiévale', 'CATAPULTE|Elle envoyait des pierres', 'ARBALETE|Arc mécanique',
    'JOUTE|Duel de chevaliers à la lance', 'TOURNOI|Compétition de chevaliers', 'BLASON|Les armoiries de la famille',
    'DYNASTIE|Lignée de souverains', 'COURONNE|Elle coiffe les rois', 'SCEPTRE|Le bâton du souverain',
    'TRONE|Le siège du pouvoir', 'EMPIRE|Napoléon en fonda un', 'OBELISQUE|Aiguille de pierre égyptienne',
    'SPHINX|Il pose des énigmes', 'MINOTAURE|Le monstre du labyrinthe', 'CENTAURE|Mi-homme, mi-cheval',
    'LICORNE|Cheval à corne unique', 'PHENIX|Il renaît de ses cendres', 'GRIFFON|Aigle et lion à la fois',
    'SIRENE|Chanteuse des mers ou alarme', 'CYCLOPE|Géant à l’œil unique', 'TITAN|Géant de la mythologie',
    'OLYMPE|La résidence des dieux grecs', 'ZEPHYR|Vent doux et léger', 'TEMPETE|Le vent se déchaîne',
    'MOUSSON|Pluies saisonnières d’Asie', 'ALIZE|Vent régulier des tropiques', 'SIROCCO|Vent chaud du Sahara',
    'MISTRAL|Le vent de la vallée du Rhône', 'RESSAC|Retour violent des vagues', 'MAREE|Elle monte et descend deux fois par jour',
    'LAGON|Piscine naturelle des atolls', 'RECIF|Écueil de corail', 'CORAIL|Bâtisseur des récifs',
    'PLANCTON|Soupe microscopique des océans', 'ABYSSE|Profondeur sans lumière', 'NARVAL|La licorne des mers',
    'CACHALOT|Plongeur des grandes profondeurs', 'ORQUE|Épaulard noir et blanc', 'PIRANHA|Petit poisson très vorace',
    'ANACONDA|Serpent géant d’Amazonie', 'COBRA|Serpent à capuchon', 'VIPERE|Serpent à tête triangulaire',
    'CAMELEON|Il change de couleur', 'IGUANE|Lézard à crête', 'SALAMANDRE|Amphibien légendaire du feu',
    'TARENTULE|Grosse araignée velue', 'SCORPION|Sa queue porte un dard', 'TERMITE|Il dévore les charpentes',
    'LUCIOLE|Lanterne vivante des soirs d’été', 'CHRYSALIDE|Entre chenille et papillon', 'CAMOUFLAGE|L’art de se fondre dans le décor',
    'HIBERNATION|Long sommeil d’hiver', 'MIGRATION|Grand voyage saisonnier', 'PREDATEUR|Chasseur de la chaîne alimentaire',
    'CARNIVORE|Mangeur de viande', 'HERBIVORE|Mangeur d’herbe', 'NOCTURNE|Actif la nuit',
    'VENIMEUX|Sa morsure empoisonne', 'RUGISSEMENT|Le cri du lion', 'MURMURE|Paroles à voix très basse',
    'VACARME|Bruit assourdissant', 'SILENCE|Absence totale de bruit', 'MELODIE|Suite de notes qui chante',
    'SYMPHONIE|Grande œuvre pour orchestre', 'VIRTUOSE|Musicien prodige', 'MAESTRO|Le chef, baguette en main',
    'PARTITION|La musique écrite', 'SOLFEGE|La grammaire de la musique', 'OCTAVE|Huit notes d’écart',
    'DIAPASON|Il donne le la', 'METRONOME|Il bat la mesure', 'OPERA|Théâtre chanté',
    'BALLET|Danse racontée', 'PIROUETTE|Tour complet du danseur', 'ACROBATE|Voltigeur du cirque',
    'FUNAMBULE|Marcheur de fil', 'JONGLEUR|Trois balles en l’air', 'TRAPEZE|La barre volante du cirque',
    'MARIONNETTE|Poupée à fils', 'VENTRILOQUE|Il parle sans remuer les lèvres', 'COMEDIEN|Il joue tous les rôles',
    'TRAGEDIE|Théâtre qui finit mal', 'COMEDIE|Théâtre qui fait rire', 'COULISSES|L’envers du décor',
    'ENTRACTE|La pause au théâtre', 'APPLAUDIR|Battre des mains', 'CHUCHOTER|Parler tout bas',
    'BAFOUILLER|Parler en s’emmêlant', 'DEGUSTER|Savourer lentement', 'FLANER|Se promener sans but',
    'VAGABONDER|Errer au gré du vent', 'ESCALADER|Gravir à mains nues', 'FRANCHIR|Passer par-dessus',
    'TRAVERSER|Aller d’une rive à l’autre', 'NAVIGUER|Voyager sur l’eau', 'ACCOSTER|Toucher le quai',
    'AMARRER|Attacher le bateau au port', 'LARGUER|… les amarres !', 'DERIVER|Aller au fil du courant',
    'CHAVIRER|Se retourner sur l’eau', 'SOMBRER|Couler corps et biens', 'EMERGER|Sortir de l’eau',
    'JAILLIR|Sortir d’un coup', 'SCINTILLER|Briller par éclats', 'ETINCELER|Jeter mille feux',
    'FLAMBOYER|Brûler de mille couleurs', 'VERDOYER|Se couvrir de vert', 'BOURGEONNER|Se préparer à fleurir',
    'ECLORE|S’ouvrir au monde', 'FANER|Perdre ses pétales', 'RECOLTER|Ramasser ce qu’on a semé',
    'VENDANGER|Cueillir le raisin', 'MOISSONNER|Couper les blés', 'LABOURER|Retourner la terre',
    'SEMER|Confier les graines à la terre', 'GREFFER|Marier deux arbres', 'TAILLER|Couper pour mieux faire pousser',
    'ARROSER|Donner à boire aux plantes', 'AFFAME|L’estomac vide', 'REPU|Il n’a plus faim',
    'EXQUIS|Délicieux au superlatif', 'FADE|Il manque de goût', 'ACIDULE|Légèrement piquant',
    'AMER|Comme l’endive ou la déception', 'ONCTUEUX|Doux et crémeux', 'MOELLEUX|Tendre comme un nuage',
    'RASSIS|Pain qui a durci', 'FRIANDISE|Petite douceur sucrée', 'FESTIN|Repas de roi',
    'BANQUET|Grand repas de fête', 'RAGOUT|Plat qui mijote longtemps', 'MARMITE|Grosse cocotte',
    'CHAUDRON|La marmite de la sorcière', 'TISANE|Infusion du soir', 'NECTAR|La boisson des dieux',
    'AMBROISIE|La nourriture des dieux grecs', 'ALIBI|Preuve qu’on était ailleurs', 'SUSPECT|Il intéresse l’enquêteur',
    'COUPABLE|C’est lui qui a fait le coup', 'INNOCENT|Blanc comme neige', 'VERDICT|La décision du jury',
    'TRIBUNAL|Le palais de la justice', 'MAGISTRAT|Homme de loi en robe', 'PLAIDOIRIE|Le discours de l’avocat',
    'EMPREINTE|Trace laissée sur place', 'FILATURE|Suivre sans être vu', 'PLANQUE|Cachette de surveillance',
    'RANCON|Le prix d’une libération', 'BUTIN|Le trésor du cambrioleur', 'CAGOULE|Le masque du bandit',
    'MENOTTES|Les bracelets du prisonnier', 'EVASION|La grande échappée', 'COMPLICE|Il a aidé au mauvais coup',
    'TEMOIGNAGE|Le récit du témoin'
  ];

  function norm(s) {
    return String(s || '').toUpperCase()
      .replace(/Œ/g, 'OE').replace(/Æ/g, 'AE')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Z]/g, '');
  }

  function parseEntry(e) {
    var i = e.indexOf('|');
    return { w: e.slice(0, i), def: e.slice(i + 1) };
  }

  function pickWords(level, count, maxLen) {
    var src = DB[level];
    var out = [];
    var used = {};
    var guard = 0;
    while (out.length < count && guard++ < 4000) {
      var e = parseEntry(src[Math.floor(Math.random() * src.length)]);
      if (e.w.length > maxLen || used[e.w]) continue;
      used[e.w] = true;
      out.push(e);
    }
    return out;
  }

  /* Peut-on poser `word` en (r,c) direction (dr,dc) ? Renvoie le nombre de
     croisements, ou -1 si la pose est illégale (règles des mots croisés :
     cases voisines libres, pas de mot collé avant/après). */
  function canPlace(grid, N, word, r, c, dr, dc) {
    var len = word.length;
    var er = r + dr * (len - 1), ec = c + dc * (len - 1);
    if (r < 0 || c < 0 || r >= N || c >= N || er >= N || ec >= N) return -1;
    var br = r - dr, bc = c - dc;
    if (br >= 0 && bc >= 0 && br < N && bc < N && grid[br * N + bc]) return -1;
    var ar = er + dr, ac = ec + dc;
    if (ar >= 0 && ac >= 0 && ar < N && ac < N && grid[ar * N + ac]) return -1;
    var crossed = 0;
    for (var k = 0; k < len; k++) {
      var rr = r + dr * k, cc = c + dc * k;
      var cur = grid[rr * N + cc];
      if (cur) {
        if (cur !== word[k]) return -1;
        crossed++;
      } else {
        var p1r = rr + dc, p1c = cc + dr; // voisins perpendiculaires
        var p2r = rr - dc, p2c = cc - dr;
        if (p1r >= 0 && p1r < N && p1c >= 0 && p1c < N && grid[p1r * N + p1c]) return -1;
        if (p2r >= 0 && p2r < N && p2c >= 0 && p2c < N && grid[p2r * N + p2c]) return -1;
      }
    }
    if (crossed === len) return -1; // mot entièrement superposé à un autre
    return crossed;
  }

  function placeWord(grid, N, entry, r, c, dr, dc, placed) {
    var cells = [];
    for (var k = 0; k < entry.w.length; k++) {
      var idx = (r + dr * k) * N + (c + dc * k);
      grid[idx] = entry.w[k];
      cells.push(idx);
    }
    placed.push({ w: entry.w, def: entry.def, cells: cells, dir: dr ? 'v' : 'h',
      num: 0, foundBy: -1, lastWrong: '' });
  }

  function numberWords(words) {
    var starts = [];
    var seen = {};
    words.forEach(function (w) {
      var c = w.cells[0];
      if (!seen[c]) { seen[c] = true; starts.push(c); }
    });
    starts.sort(function (a, b) { return a - b; });
    var numOf = {};
    starts.forEach(function (c, i) { numOf[c] = i + 1; });
    words.forEach(function (w) { w.num = numOf[w.cells[0]]; });
    words.sort(function (a, b) { return a.num - b.num || (a.dir < b.dir ? -1 : 1); });
  }

  function buildGrid(level) {
    var cfg = LEVELS[level];
    var N = cfg.size;
    var best = null;
    for (var attempt = 0; attempt < 60; attempt++) {
      var pool = pickWords(level, cfg.n * 3, N - 2);
      pool.sort(function (a, b) { return b.w.length - a.w.length; });
      var grid = new Array(N * N).fill('');
      var placed = [];
      var first = pool.shift();
      placeWord(grid, N, first, Math.floor(N / 2),
        Math.floor((N - first.w.length) / 2), 0, 1, placed);
      GG.shuffle(pool);
      for (var p = 0; p < pool.length && placed.length < cfg.n; p++) {
        var cand = pool[p];
        var options = [];
        for (var idx = 0; idx < N * N; idx++) {
          var L = grid[idx];
          if (!L) continue;
          for (var k = 0; k < cand.w.length; k++) {
            if (cand.w[k] !== L) continue;
            var rr = Math.floor(idx / N), cc = idx % N;
            if (canPlace(grid, N, cand.w, rr - k, cc, 1, 0) >= 1) options.push([rr - k, cc, 1, 0]);
            if (canPlace(grid, N, cand.w, rr, cc - k, 0, 1) >= 1) options.push([rr, cc - k, 0, 1]);
          }
        }
        if (options.length) {
          var o = options[Math.floor(Math.random() * options.length)];
          placeWord(grid, N, cand, o[0], o[1], o[2], o[3], placed);
        }
      }
      if (!best || placed.length > best.words.length) best = { size: N, words: placed };
      if (placed.length >= cfg.n) break;
    }
    numberWords(best.words);
    return best;
  }

  function fmt(sec) {
    var m = Math.floor(sec / 60);
    return (m ? m + ' min ' : '') + (sec % 60) + ' s';
  }

  var mod = {
    id: 'croises',
    nom: 'Mots croisés',
    icone: '✏️',
    desc: 'Des centaines de définitions maison, des milliers de grilles possibles. En réseau : le plus rapide marque les points !',
    regles: '<p><strong>🎯 Le but :</strong> remplir toute la grille de mots croisés à partir des définitions.</p><p><strong>Comment jouer :</strong> touchez une définition (ou une case), tapez votre réponse. Bonne réponse : le mot s’inscrit et rapporte sa longueur en points. Mauvaise : une erreur au compteur !</p><p><strong>En réseau :</strong> la grille est partagée, le plus rapide prend les mots — les croisements déjà trouvés vous aident.</p>',
    min: 1, max: 4,
    hotseat: true, hotseatMax: 1, hidden: false, netOnly: false,

    create: function (names) {
      return {
        players: names.map(function (n) {
          return { name: n, found: 0, points: 0, errors: 0 };
        }),
        phase: 'setup',
        level: null,
        size: 0,
        words: [],
        startTs: 0,
        durationSec: 0,
        finished: false
      };
    },

    turnOf: function () { return -1; }, // tout le monde cherche en même temps
    over: function (state) { return state.finished; },
    scoreOf: function (state, i) { return state.players[i].points; },

    summary: function (state) {
      var rows = state.players.map(function (p) {
        return { n: p.name, s: p.points, f: p.found, e: p.errors };
      }).sort(function (a, b) { return b.s - a.s; });
      var html = rows.map(function (r) {
        return '<div class="final-line"><span>' + GG.esc(r.n) +
          (r.e ? ' <small>(' + r.e + ' erreur' + (r.e > 1 ? 's' : '') + ')</small>' : '') +
          '</span><strong>' + r.s + ' pts</strong></div>';
      }).join('');
      html += '<p>⏱️ ' + fmt(state.durationSec) + ' · niveau ' +
        (LEVELS[state.level] ? LEVELS[state.level].nom : '') + '</p>';
      if (state.players.length === 1) {
        try {
          if (typeof localStorage !== 'undefined') {
            var key = 'gg-croises-best-' + state.level;
            var best = JSON.parse(localStorage.getItem(key) || 'null');
            var cur = { sec: state.durationSec, ts: state.startTs };
            if (!best || cur.sec < best.sec) localStorage.setItem(key, JSON.stringify(cur));
            var stored = JSON.parse(localStorage.getItem(key) || 'null');
            if (stored && stored.ts === state.startTs) html += '<h1>🏆 Nouveau record !</h1>';
            else if (stored) html += '<p>🏅 Record : ' + fmt(stored.sec) + '.</p>';
          }
        } catch (e) {}
      } else {
        var top = rows.filter(function (r) { return r.s === rows[0].s; });
        html += '<h1>🏆 ' + top.map(function (r) { return GG.esc(r.n); }).join(' & ') + '</h1>';
      }
      return html;
    },

    /* les solutions ne circulent jamais vers les autres téléphones */
    redact: function (state) {
      var copy = GG.clone(state);
      copy.words.forEach(function (w) {
        if (w.foundBy === -1) delete w.w;
      });
      return copy;
    },

    apply: function (state, player, action) {
      if (state.finished) return { ok: false, error: 'Partie terminée.' };
      if (action.t === 'level') {
        if (state.phase !== 'setup') return { ok: false, error: 'Niveau déjà choisi.' };
        if (player !== 0) return { ok: false, error: 'L’hôte choisit le niveau.' };
        if (!LEVELS[action.l]) return { ok: false, error: 'Niveau inconnu.' };
        var built = buildGrid(action.l);
        state.level = action.l;
        state.size = built.size;
        state.words = built.words;
        state.phase = 'play';
        state.startTs = Date.now();
        return { ok: true };
      }
      if (state.phase !== 'play') return { ok: false, error: 'La partie n’a pas commencé.' };
      if (action.t === 'claim') {
        var w = state.words[action.i | 0];
        if (!w) return { ok: false, error: 'Mot inconnu.' };
        if (w.foundBy !== -1) return { ok: false, error: 'Déjà trouvé !' };
        var guess = norm(action.text);
        if (!guess) return { ok: false, error: 'Écrivez une réponse.' };
        if (guess.length !== w.w.length) {
          return { ok: false, error: 'Il faut ' + w.w.length + ' lettres.' };
        }
        if (guess === w.w) {
          w.foundBy = player;
          state.players[player].found++;
          state.players[player].points += w.w.length;
          if (state.words.every(function (x) { return x.foundBy !== -1; })) {
            state.finished = true;
            state.durationSec = Math.max(1, Math.round((Date.now() - state.startTs) / 1000));
          }
        } else {
          state.players[player].errors++;
          w.lastWrong = String(action.text).slice(0, 20);
        }
        return { ok: true };
      }
      return { ok: false, error: 'Action inconnue.' };
    },

    render: function (el, ctx) {
      var s = ctx.state;
      var me = ctx.me;

      if (s.phase === 'setup') {
        var html0 = '<p class="mini-msg big-msg">✏️ Mots croisés</p>';
        if (me === 0) {
          html0 += '<p class="mini-msg">Choisissez le niveau :</p><div class="lvl-btns">' +
            Object.keys(LEVELS).map(function (l) {
              var c = LEVELS[l];
              return '<button class="btn big" data-lvl="' + l + '">' +
                (l === 'facile' ? '😌' : l === 'moyen' ? '🙂' : '😈') + ' ' + c.nom +
                ' <small>' + c.n + ' mots · ' + (l === 'facile' ? 'vocabulaire simple'
                  : l === 'moyen' ? 'vocabulaire varié' : 'vocabulaire corsé') +
                '</small></button>';
            }).join('') + '</div>';
        } else {
          html0 += '<p class="waiting">⏳ L’hôte choisit le niveau…</p>';
        }
        el.innerHTML = html0;
        el.querySelectorAll('[data-lvl]').forEach(function (b) {
          b.addEventListener('click', function () { ctx.act({ t: 'level', l: b.dataset.lvl }); });
        });
        return;
      }

      var N = s.size;
      // lettres révélées (mots trouvés), propriétaire, numéros, cases actives
      var letter = new Array(N * N).fill('');
      var owner = new Array(N * N).fill(-1);
      var active = new Array(N * N).fill(false);
      var numAt = {};
      s.words.forEach(function (w) {
        w.cells.forEach(function (idx, k) {
          active[idx] = true;
          if (w.foundBy !== -1) { letter[idx] = w.w[k]; owner[idx] = w.foundBy; }
        });
        if (!numAt[w.cells[0]]) numAt[w.cells[0]] = w.num;
      });

      var sel = el._crSel !== undefined ? el._crSel : -1;
      if (sel !== -1 && (!s.words[sel] || s.words[sel].foundBy !== -1)) {
        sel = -1; el._crSel = -1;
      }
      var selCells = {};
      if (sel !== -1) s.words[sel].cells.forEach(function (i) { selCells[i] = true; });

      var html = '<div class="cr-grid" style="grid-template-columns:repeat(' + N + ',1fr)">';
      for (var i = 0; i < N * N; i++) {
        if (!active[i]) { html += '<div class="cr-cell off"></div>'; continue; }
        var st = owner[i] !== -1 ? ' style="background:' + COLORS[owner[i]] + ';color:#132018"' : '';
        html += '<div class="cr-cell' + (selCells[i] ? ' sel' : '') + '" data-i="' + i + '"' + st + '>' +
          (numAt[i] ? '<span class="cr-num">' + numAt[i] + '</span>' : '') +
          (letter[i] || '') + '</div>';
      }
      html += '</div>';

      // zone de réponse pour le mot sélectionné
      if (sel !== -1) {
        var w0 = s.words[sel];
        html += '<div class="cr-ask"><p class="mini-msg"><strong>' + w0.num +
          (w0.dir === 'h' ? ' →' : ' ↓') + '</strong> ' + GG.esc(w0.def) +
          ' <em>(' + w0.cells.length + ' lettres)</em></p>' +
          (w0.lastWrong ? '<p class="cr-wrong">« ' + GG.esc(w0.lastWrong) + ' » ne convient pas…</p>' : '') +
          '<div class="cr-answer-row">' +
          '<input type="text" id="cr-guess" maxlength="' + (w0.cells.length + 4) +
          '" placeholder="' + w0.cells.length + ' lettres…" autocomplete="off">' +
          '<button class="btn primary" data-a="try">Proposer</button></div></div>';
      } else if (!s.finished) {
        html += '<p class="mini-msg">Touchez une définition (ou une case) pour proposer un mot.</p>';
      }

      // définitions
      ['h', 'v'].forEach(function (dir) {
        var list = s.words.filter(function (w) { return w.dir === dir; });
        if (!list.length) return;
        html += '<h3 class="cr-h3">' + (dir === 'h' ? '→ Horizontalement' : '↓ Verticalement') + '</h3>' +
          '<div class="cr-defs">' + list.map(function (w) {
            var i2 = s.words.indexOf(w);
            var stl = w.foundBy !== -1 ? ' style="background:' + COLORS[w.foundBy] + ';color:#132018"' : '';
            return '<button class="cr-def' + (w.foundBy !== -1 ? ' found' : '') +
              (i2 === sel ? ' sel' : '') + '" data-w="' + i2 + '"' + stl + '>' +
              '<strong>' + w.num + '.</strong> ' + GG.esc(w.def) +
              (w.foundBy !== -1 ? ' = ' + w.w : ' (' + w.cells.length + ')') + '</button>';
          }).join('') + '</div>';
      });

      // scores + chrono
      html += '<div class="mem-stats">' + s.players.map(function (p, pi) {
        return '<span class="mem-stat" style="outline:2px solid ' + COLORS[pi] + '">' +
          GG.esc(p.name) + ' : ' + p.points + (p.errors ? ' · ❌' + p.errors : '') + '</span>';
      }).join('') +
        '<span class="mem-stat" id="cr-timer">⏱️ ' +
        fmt(Math.round((Date.now() - s.startTs) / 1000)) + '</span></div>';
      el.innerHTML = html;

      function select(i2) {
        el._crSel = (el._crSel === i2) ? -1 : i2;
        mod.render(el, ctx);
        var inp2 = el.querySelector('#cr-guess');
        if (inp2 && el._crSel !== -1) inp2.focus();
      }
      el.querySelectorAll('.cr-def:not(.found)').forEach(function (b) {
        b.addEventListener('click', function () { select(parseInt(b.dataset.w, 10)); });
      });
      el.querySelectorAll('.cr-cell[data-i]').forEach(function (c) {
        c.addEventListener('click', function () {
          var idx2 = parseInt(c.dataset.i, 10);
          var here = [];
          s.words.forEach(function (w, wi) {
            if (w.foundBy === -1 && w.cells.indexOf(idx2) !== -1) here.push(wi);
          });
          if (!here.length) return;
          var pos = here.indexOf(sel);
          select(here[(pos + 1) % here.length] === sel ? -1 : here[(pos + 1) % here.length]);
        });
      });
      var tryBtn = el.querySelector('[data-a="try"]');
      if (tryBtn) {
        var send = function () {
          var input = el.querySelector('#cr-guess');
          if (input && input.value.trim() && el._crSel !== -1) {
            ctx.act({ t: 'claim', i: el._crSel, text: input.value });
          }
        };
        tryBtn.addEventListener('click', send);
        var inp = el.querySelector('#cr-guess');
        if (inp) inp.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter') send();
        });
      }
      if (!s.finished && s.startTs && !el._crTimer) {
        el._crTimer = setInterval(function () {
          var t = el.querySelector('#cr-timer');
          if (!t || !document.body.contains(t)) {
            clearInterval(el._crTimer); el._crTimer = null; return;
          }
          t.textContent = '⏱️ ' + fmt(Math.round((Date.now() - s.startTs) / 1000));
        }, 1000);
      }
    },

    _DB: DB, _buildGrid: buildGrid, _canPlace: canPlace, _norm: norm, _LEVELS: LEVELS
  };

  GG.register(mod);
  if (typeof module === 'object' && module.exports) module.exports = mod;
})(typeof self !== 'undefined' ? self : globalThis);
