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

  /* associations d'indices par mot : ce que dirait un joueur de bonne foi.
     L'IA y puise ses indices et y confronte ceux des autres pour voter. */
  var ASSOC = {
    'CAFÉ': ['EXPRESSO', 'ARABICA', 'MOULU', 'NOIR', 'TASSE'],
    'THÉ': ['INFUSION', 'SACHET', 'TISANE', 'CEYLAN'],
    'PIZZA': ['ITALIE', 'MOZZARELLA', 'PART', 'LIVRAISON'],
    'QUICHE': ['LORRAINE', 'LARDONS', 'OEUFS', 'PÂTE'],
    'FRITES': ['BELGIQUE', 'KETCHUP', 'CORNET', 'HUILE'],
    'CHIPS': ['PAQUET', 'APÉRO', 'CROUSTILLANT', 'SACHET'],
    'POMME': ['VERGER', 'COMPOTE', 'CROQUER', 'PÉPIN'],
    'POIRE': ['WILLIAMS', 'JUTEUSE', 'COMPOTE', 'VERGER'],
    'FRAISE': ['TAGADA', 'CHANTILLY', 'GARIGUETTE', 'ROUGE'],
    'FRAMBOISE': ['RONCE', 'COULIS', 'ACIDULÉE', 'ROUGE'],
    'PAIN': ['BAGUETTE', 'MIE', 'CROÛTE', 'TARTINE'],
    'BRIOCHE': ['BEURRE', 'VIENNOISERIE', 'MOELLEUSE', 'TRESSE'],
    'MIEL': ['ABEILLE', 'RUCHE', 'POT', 'SUCRÉ'],
    'CONFITURE': ['POT', 'TARTINE', 'ABRICOT', 'SUCRE'],
    'GLACE': ['CORNET', 'VANILLE', 'BOULE', 'ESQUIMAU'],
    'SORBET': ['FRUIT', 'RAFRAÎCHISSANT', 'CITRON', 'BOULE'],
    'CRÊPE': ['CHANDELEUR', 'BRETAGNE', 'POÊLE', 'GARNITURE'],
    'GAUFRE': ['ALVÉOLES', 'BRUXELLES', 'CHANTILLY', 'SUCRE'],
    'SOUPE': ['LOUCHE', 'LÉGUMES', 'BOL', 'HIVER'],
    'PURÉE': ['ÉCRASÉE', 'MOULINETTE', 'BEURRE', 'LISSE'],
    'RIZ': ['BASMATI', 'GRAIN', 'ASIE', 'RISOTTO'],
    'PÂTES': ['SPAGHETTI', 'ITALIE', 'GRATIN', 'COQUILLETTES'],
    'MOUTARDE': ['DIJON', 'PIQUANTE', 'POT', 'JAUNE'],
    'MAYONNAISE': ['OEUF', 'ÉMULSION', 'TUBE', 'BLANCHE'],
    'SEL': ['MARIN', 'GUÉRANDE', 'IODÉ', 'GRAIN'],
    'POIVRE': ['MOULIN', 'GRAINS', 'NOIR', 'ÉPICE'],
    'CHOCOLAT': ['CACAO', 'TABLETTE', 'NOIR', 'PRALINE'],
    'CARAMEL': ['BEURRE', 'SALÉ', 'MOU', 'BONBON'],
    'FROMAGE': ['CAMEMBERT', 'PLATEAU', 'LAIT', 'AFFINAGE'],
    'YAOURT': ['POT', 'FERMENT', 'NATURE', 'CUILLÈRE'],
    'JUS D’ORANGE': ['PRESSÉ', 'VITAMINE', 'PULPE', 'VERRE'],
    'LIMONADE': ['BULLES', 'PÉTILLANTE', 'SUCRÉE', 'GUINGUETTE'],
    'BANANE': ['RÉGIME', 'JAUNE', 'PEAU', 'SINGE'],
    'ANANAS': ['TROPICAL', 'ÉCORCE', 'COURONNE', 'JAUNE'],
    'CITRON': ['ACIDE', 'JAUNE', 'ZESTE', 'PRESSÉ'],
    'ORANGE': ['AGRUME', 'QUARTIER', 'JUS', 'VITAMINE'],
    'TOMATE': ['ROUGE', 'SAUCE', 'CERISE', 'POTAGER'],
    'POIVRON': ['RATATOUILLE', 'FARCI', 'CROQUANT', 'VERT'],
    'CAROTTE': ['LAPIN', 'RÂPÉE', 'POTAGER', 'FANES'],
    'NAVET': ['BLANC', 'POT-AU-FEU', 'RACINE', 'FADE'],
    'SALADE': ['VERTE', 'VINAIGRETTE', 'LAITUE', 'CROQUANTE'],
    'ÉPINARD': ['POPEYE', 'FER', 'VERT', 'FEUILLES'],
    'CHAMPIGNON': ['CUEILLETTE', 'CÈPE', 'LAMELLES', 'SOUS-BOIS'],
    'TRUFFE': ['PÉRIGORD', 'NOIRE', 'COCHON', 'LUXE'],
    'POULET': ['RÔTI', 'BASSE-COUR', 'CUISSE', 'DIMANCHE'],
    'DINDE': ['FARCIE', 'VOLAILLE', 'MARRONS', 'NOËL'],
    'JAMBON': ['TRANCHE', 'BLANC', 'CHARCUTERIE', 'SANDWICH'],
    'SAUCISSON': ['SEC', 'RONDELLE', 'APÉRO', 'CHARCUTERIE'],
    'SAUMON': ['FUMÉ', 'ROSE', 'PAVÉ', 'NORVÈGE'],
    'THON': ['BOÎTE', 'CONSERVE', 'ROUGE', 'MIETTES'],
    'HUÎTRE': ['PERLE', 'ÉCAILLER', 'MARENNES', 'PLATEAU'],
    'MOULE': ['BOUCHOT', 'MARINIÈRE', 'COQUILLE', 'BRETAGNE'],
    'GÂTEAU': ['BOUGIES', 'PART', 'GÉNOISE', 'GLAÇAGE'],
    'TARTE': ['MERINGUÉE', 'PÂTE', 'ABRICOTS', 'DESSERT'],
    'BONBON': ['SUCETTE', 'ACIDULÉ', 'PAPILLOTE', 'SUCRE'],
    'CHEWING-GUM': ['BULLE', 'MÂCHER', 'MENTHOL', 'COLLE'],
    'CIDRE': ['BOLÉE', 'NORMANDIE', 'BRUT', 'POMMES'],
    'CHAMPAGNE': ['BULLES', 'FLÛTE', 'RÉVEILLON', 'MILLÉSIME'],
    'CHAT': ['RONRON', 'MOUSTACHES', 'GRIFFES', 'FÉLIN'],
    'CHIEN': ['NICHE', 'LAISSE', 'FIDÈLE', 'ABOIE'],
    'LION': ['CRINIÈRE', 'RUGIT', 'FAUVE', 'SAVANE'],
    'TIGRE': ['RAYURES', 'BENGALE', 'FAUVE', 'FÉLIN'],
    'LOUP': ['MEUTE', 'HURLE', 'CROCS', 'FORÊT'],
    'RENARD': ['RUSÉ', 'ROUX', 'TERRIER', 'POULAILLER'],
    'ABEILLE': ['RUCHE', 'BUTINE', 'DARD', 'POLLEN'],
    'GUÊPE': ['PIQÛRE', 'TAILLE', 'NID', 'JAUNE'],
    'CANARD': ['MARE', 'COLVERT', 'BARBOTE', 'COIN-COIN'],
    'OIE': ['JARS', 'PLUMES', 'CACARDE', 'BASSE-COUR'],
    'CHEVAL': ['GALOP', 'CRINIÈRE', 'SELLE', 'ÉCURIE'],
    'ÂNE': ['HI-HAN', 'TÊTU', 'BOURRICOT', 'CAROTTE'],
    'MOUTON': ['LAINE', 'TROUPEAU', 'BÊLE', 'TONTE'],
    'CHÈVRE': ['BIQUETTE', 'FROMAGE', 'CORNES', 'BROUTE'],
    'LAPIN': ['TERRIER', 'CAROTTE', 'OREILLES', 'CLAPIER'],
    'LIÈVRE': ['TORTUE', 'BONDIT', 'FABLE', 'RAPIDE'],
    'PIGEON': ['ROUCOULE', 'VILLE', 'MIETTES', 'VOYAGEUR'],
    'MOUETTE': ['GOÉLAND', 'CRIARDE', 'LITTORAL', 'PLAGE'],
    'REQUIN': ['AILERON', 'MÂCHOIRE', 'BLANC', 'PRÉDATEUR'],
    'DAUPHIN': ['FLIPPER', 'SAUTE', 'SONAR', 'INTELLIGENT'],
    'AIGLE': ['ROYAL', 'SERRES', 'PLANE', 'RAPACE'],
    'FAUCON': ['PÈLERIN', 'PIQUÉ', 'RAPACE', 'CHASSE'],
    'PAPILLON': ['CHENILLE', 'AILES', 'BUTINE', 'COCON'],
    'LIBELLULE': ['DEMOISELLE', 'AILES', 'ROSEAUX', 'ÉTANG'],
    'ESCARGOT': ['COQUILLE', 'BAVE', 'LENTEUR', 'BOURGOGNE'],
    'LIMACE': ['BAVE', 'GLUANTE', 'LENTE', 'POTAGER'],
    'CROCODILE': ['NIL', 'MÂCHOIRE', 'LARMES', 'MARÉCAGE'],
    'ALLIGATOR': ['FLORIDE', 'MARAIS', 'MÂCHOIRE', 'REPTILE'],
    'HAMSTER': ['ROUE', 'CAGE', 'JOUES', 'RONGEUR'],
    'SOURIS': ['GRISE', 'FROMAGE', 'TROU', 'PIÈGE'],
    'VACHE': ['LAIT', 'PIS', 'MEUH', 'PRÉ'],
    'TAUREAU': ['CORNES', 'ARÈNE', 'CORRIDA', 'FONCE'],
    'COCHON': ['ROSE', 'GROIN', 'TIRELIRE', 'BOUE'],
    'SANGLIER': ['DÉFENSES', 'HURE', 'FORÊT', 'OBÉLIX'],
    'OURS': ['PELUCHE', 'GRIZZLY', 'CAVERNE', 'HIBERNE'],
    'PANDA': ['BAMBOU', 'CHINE', 'PELUCHE', 'TACHES'],
    'SINGE': ['BANANE', 'GRIMACES', 'LIANE', 'PRIMATE'],
    'GORILLE': ['TORSE', 'PRIMATE', 'PUISSANT', 'JUNGLE'],
    'ZÈBRE': ['RAYURES', 'SAVANE', 'CRINIÈRE', 'GALOPE'],
    'GAZELLE': ['SAVANE', 'BONDIT', 'GRACIEUSE', 'GUÉPARD'],
    'ÉLÉPHANT': ['TROMPE', 'DÉFENSES', 'MÉMOIRE', 'PACHYDERME'],
    'RHINOCÉROS': ['CORNE', 'SAVANE', 'CUIRASSE', 'PACHYDERME'],
    'SERPENT': ['VENIN', 'SIFFLE', 'RAMPE', 'ÉCAILLES'],
    'LÉZARD': ['MURET', 'QUEUE', 'REPTILE', 'SIESTE'],
    'GRENOUILLE': ['MARE', 'TÊTARD', 'COASSE', 'NÉNUPHAR'],
    'CRAPAUD': ['VERRUES', 'MARE', 'COASSE', 'PRINCE'],
    'PERROQUET': ['RÉPÈTE', 'PLUMES', 'PIRATE', 'PERCHOIR'],
    'CANARI': ['JAUNE', 'CAGE', 'CHANTE', 'SIFFLE'],
    'PIEUVRE': ['TENTACULES', 'ENCRE', 'VENTOUSES', 'POULPE'],
    'MÉDUSE': ['PIQÛRE', 'GÉLATINEUSE', 'TENTACULES', 'TRANSPARENTE'],
    'PLAGE': ['SABLE', 'SERVIETTE', 'MARÉE', 'COQUILLAGES'],
    'PISCINE': ['CHLORE', 'BASSIN', 'PLONGEOIR', 'BONNET'],
    'CINÉMA': ['POPCORN', 'SÉANCE', 'ÉCRAN', 'FILM'],
    'THÉÂTRE': ['SCÈNE', 'RIDEAU', 'COMÉDIEN', 'PIÈCE'],
    'ÉCOLE': ['CARTABLE', 'RÉCRÉ', 'MAÎTRESSE', 'TABLEAU'],
    'UNIVERSITÉ': ['AMPHI', 'ÉTUDIANT', 'CAMPUS', 'DIPLÔME'],
    'HÔPITAL': ['URGENCES', 'BLOUSE', 'BRANCARD', 'SOINS'],
    'CLINIQUE': ['PRIVÉE', 'CHIRURGIE', 'SOINS', 'SÉJOUR'],
    'RESTAURANT': ['MENU', 'SERVEUR', 'ADDITION', 'CHEF'],
    'CANTINE': ['PLATEAU', 'SELF', 'ÉCOLIERS', 'RÉFECTOIRE'],
    'HÔTEL': ['RÉCEPTION', 'ÉTOILES', 'CHAMBRE', 'GROOM'],
    'CAMPING': ['TENTE', 'EMPLACEMENT', 'SARDINES', 'VACANCES'],
    'MONTAGNE': ['SOMMET', 'ALTITUDE', 'REFUGE', 'ALPAGE'],
    'COLLINE': ['PENTE', 'VALLON', 'HERBEUSE', 'BUTTE'],
    'FORÊT': ['ARBRES', 'CLAIRIÈRE', 'SENTIER', 'CHAMPIGNONS'],
    'JUNGLE': ['LIANES', 'TARZAN', 'TROPICALE', 'DENSE'],
    'DÉSERT': ['DUNES', 'SAHARA', 'CHAMEAU', 'OASIS'],
    'SAVANE': ['LIONS', 'AFRIQUE', 'ACACIA', 'HERBES'],
    'BOULANGERIE': ['BAGUETTE', 'FOURNIL', 'CROISSANT', 'MIE'],
    'PÂTISSERIE': ['ÉCLAIR', 'RELIGIEUSE', 'VITRINE', 'CRÈME'],
    'MARCHÉ': ['ÉTALS', 'FORAIN', 'PANIER', 'PRIMEUR'],
    'SUPERMARCHÉ': ['CADDIE', 'RAYONS', 'CAISSE', 'PROMOTIONS'],
    'ÉGLISE': ['CLOCHER', 'MESSE', 'VITRAUX', 'PAROISSE'],
    'CATHÉDRALE': ['GOTHIQUE', 'ROSACE', 'FLÈCHES', 'NEF'],
    'CHÂTEAU': ['DONJON', 'DOUVES', 'REMPARTS', 'TOURELLES'],
    'PALAIS': ['ROYAL', 'DORURES', 'GALERIE', 'VERSAILLES'],
    'PRISON': ['BARREAUX', 'CELLULE', 'ÉVASION', 'GARDIEN'],
    'CACHOT': ['DONJON', 'CHAÎNES', 'OUBLIETTES', 'SOMBRE'],
    'MUSÉE': ['TABLEAUX', 'VISITE', 'EXPOSITION', 'LOUVRE'],
    'BIBLIOTHÈQUE': ['LIVRES', 'RAYONNAGES', 'SILENCE', 'EMPRUNT'],
    'CIRQUE': ['CHAPITEAU', 'ACROBATES', 'PISTE', 'JONGLEURS'],
    'ZOO': ['CAGES', 'VISITE', 'ANIMAUX', 'SOIGNEUR'],
    'STADE': ['TRIBUNES', 'PELOUSE', 'SUPPORTERS', 'MATCH'],
    'GYMNASE': ['AGRÈS', 'PARQUET', 'VESTIAIRES', 'ESPALIERS'],
    'GARE': ['TRAINS', 'BILLET', 'VOIES', 'CONTRÔLEUR'],
    'AÉROPORT': ['PISTE', 'DÉCOLLAGE', 'DOUANE', 'TERMINAL'],
    'PORT': ['AMARRES', 'JETÉE', 'DOCKS', 'MARINS'],
    'QUAI': ['PÉNICHE', 'BERGE', 'ATTENTE', 'AMARRAGE'],
    'PARC': ['BANCS', 'PELOUSE', 'BALANÇOIRES', 'PROMENADE'],
    'JARDIN': ['POTAGER', 'TONTE', 'FLEURS', 'ARROSOIR'],
    'GROTTE': ['STALACTITES', 'SPÉLÉOLOGIE', 'PRÉHISTOIRE', 'SOMBRE'],
    'TUNNEL': ['CREUSÉ', 'SOUTERRAIN', 'MANCHE', 'SORTIE'],
    'ÎLE': ['LAGON', 'NAUFRAGÉ', 'COCOTIERS', 'ARCHIPEL'],
    'PRESQU’ÎLE': ['CROZON', 'ISTHME', 'PÉNINSULE', 'CÔTE'],
    'PARIS': ['CAPITALE', 'SEINE', 'EIFFEL', 'LOUVRE'],
    'MARSEILLE': ['CALANQUES', 'BOUILLABAISSE', 'SAVON', 'CANEBIÈRE'],
    'STYLO': ['BILLE', 'ENCRE', 'PLUME', 'TROUSSE'],
    'CRAYON': ['MINE', 'GOMME', 'COULEURS', 'BOIS'],
    'LIVRE': ['PAGES', 'ROMAN', 'RELIURE', 'CHAPITRE'],
    'MAGAZINE': ['KIOSQUE', 'HEBDO', 'PAGES', 'MODE'],
    'CHAISE': ['DOSSIER', 'ASSISE', 'PLIANTE', 'MUSICALE'],
    'TABOURET': ['BAR', 'COMPTOIR', 'CUISINE', 'HAUT'],
    'LIT': ['MATELAS', 'COUETTE', 'DODO', 'SOMMIER'],
    'HAMAC': ['SIESTE', 'PALMIERS', 'BALANCEMENT', 'FILET'],
    'VÉLO': ['PÉDALES', 'GUIDON', 'SONNETTE', 'SELLE'],
    'TROTTINETTE': ['ÉLECTRIQUE', 'PLIABLE', 'TROTTOIR', 'GLISSER'],
    'VOITURE': ['VOLANT', 'MOTEUR', 'GARAGE', 'KLAXON'],
    'CAMION': ['REMORQUE', 'ROUTIER', 'LIVRAISON', 'BENNE'],
    'TRAIN': ['LOCOMOTIVE', 'WAGONS', 'RAILS', 'CONTRÔLEUR'],
    'MÉTRO': ['SOUTERRAIN', 'RAME', 'STATION', 'TICKET'],
    'AVION': ['AILES', 'DÉCOLLAGE', 'HUBLOT', 'ALTITUDE'],
    'HÉLICOPTÈRE': ['PALES', 'ROTOR', 'SECOURS', 'STATIONNAIRE'],
    'BATEAU': ['COQUE', 'ANCRE', 'NAVIGUER', 'PONT'],
    'SOUS-MARIN': ['PÉRISCOPE', 'TORPILLE', 'PROFONDEURS', 'SONAR'],
    'TÉLÉPHONE': ['SONNERIE', 'APPEL', 'ALLÔ', 'SMS'],
    'TABLETTE': ['TACTILE', 'ÉCRAN', 'APPLIS', 'STYLET'],
    'MONTRE': ['POIGNET', 'AIGUILLES', 'HEURE', 'CADRAN'],
    'RÉVEIL': ['SONNERIE', 'DRING', 'AUBE', 'MATIN'],
    'LUNETTES': ['VUE', 'MONTURE', 'OPTICIEN', 'VERRES'],
    'JUMELLES': ['OBSERVATION', 'ZOOM', 'OISEAUX', 'GROSSIR'],
    'PARAPLUIE': ['AVERSE', 'BALEINES', 'ONDÉE', 'PÉPIN'],
    'PARASOL': ['OMBRE', 'PIED', 'INCLINABLE', 'TERRASSE'],
    'VALISE': ['ROULETTES', 'BAGAGE', 'SOUTE', 'ÉTIQUETTE'],
    'SAC À DOS': ['RANDONNEUR', 'POCHES', 'GOURDE', 'BRETELLES'],
    'CLÉ': ['SERRURE', 'TROUSSEAU', 'VERROU', 'OUVRIR'],
    'CADENAS': ['CODE', 'ANTIVOL', 'CHAÎNE', 'VERROUILLÉ'],
    'MARTEAU': ['CLOUS', 'ENCLUME', 'TAPER', 'MANCHE'],
    'TOURNEVIS': ['VISSER', 'CRUCIFORME', 'BRICOLAGE', 'EMBOUT'],
    'CISEAUX': ['DÉCOUPER', 'LAMES', 'COUTURE', 'PAPIER'],
    'COUTEAU': ['LAME', 'SUISSE', 'TRANCHER', 'MANCHE'],
    'BALAI': ['POUSSIÈRE', 'MANCHE', 'SERPILLIÈRE', 'SORCIÈRE'],
    'ASPIRATEUR': ['SAC', 'MOQUETTE', 'POUSSIÈRE', 'ROBOT'],
    'SAVON': ['BULLES', 'LAVER', 'MAINS', 'MOUSSE'],
    'SHAMPOOING': ['CHEVEUX', 'FLACON', 'RINCER', 'MOUSSER'],
    'BROSSE': ['DENTS', 'POILS', 'CHEVEUX', 'COIFFER'],
    'PEIGNE': ['DENTS', 'RAIE', 'COIFFURE', 'DÉMÊLER'],
    'OREILLER': ['PLUME', 'TAIE', 'DORMIR', 'BATAILLE'],
    'COUSSIN': ['CANAPÉ', 'MOELLEUX', 'DÉCORATION', 'BRODÉ'],
    'COUVERTURE': ['LAINE', 'CHAUDE', 'PLAID', 'BORDER'],
    'DRAP': ['HOUSSE', 'BLANC', 'LESSIVE', 'PERCALE'],
    'ASSIETTE': ['CREUSE', 'PLATE', 'PORCELAINE', 'SERVIR'],
    'BOL': ['CÉRÉALES', 'LAIT', 'SOUPE', 'BRETON'],
    'FOURCHETTE': ['DENTS', 'PIQUER', 'COUVERT', 'ARGENTERIE'],
    'CUILLÈRE': ['SOUPE', 'REMUER', 'DESSERT', 'MIEL'],
    'VERRE': ['EAU', 'TRINQUER', 'CRISTAL', 'PIED'],
    'TASSE': ['ANSE', 'SOUCOUPE', 'PORCELAINE', 'CAFÉ'],
    'BOUTEILLE': ['BOUCHON', 'LITRE', 'CONSIGNE', 'GOULOT'],
    'CARAFE': ['EAU', 'TABLE', 'VERSER', 'CRISTAL'],
    'FOUR': ['CUISSON', 'CHALEUR', 'PYROLYSE', 'RÔTIR'],
    'MICRO-ONDES': ['RÉCHAUFFER', 'BIP', 'MINUTES', 'PLATEAU'],
    'FRIGO': ['FRAIS', 'AIMANTS', 'CONSERVER', 'ÉTAGÈRES'],
    'CONGÉLATEUR': ['SURGELÉS', 'GIVRE', 'GLAÇONS', 'BAC'],
    'LAMPE': ['ABAT-JOUR', 'AMPOULE', 'CHEVET', 'HALOGÈNE'],
    'BOUGIE': ['FLAMME', 'CIRE', 'MÈCHE', 'SOUFFLER'],
    'MIROIR': ['REFLET', 'TAIN', 'COIFFEUSE', 'BRISÉ'],
    'VITRE': ['CARREAU', 'TRANSPARENTE', 'NETTOYER', 'FENÊTRE'],
    'ÉCHELLE': ['BARREAUX', 'GRIMPER', 'POMPIERS', 'TOIT'],
    'ESCABEAU': ['MARCHES', 'PLIANT', 'BRICOLAGE', 'PLAFOND'],
    'BAGUE': ['DOIGT', 'FIANÇAILLES', 'DIAMANT', 'ALLIANCE'],
    'BRACELET': ['POIGNET', 'PERLES', 'BRELOQUES', 'ARGENT'],
    'GUITARE': ['CORDES', 'MÉDIATOR', 'ACCORDS', 'MANCHE'],
    'VIOLON': ['ARCHET', 'CORDES', 'LUTHIER', 'STRADIVARIUS'],
    'PIANO': ['TOUCHES', 'QUEUE', 'PARTITION', 'GAMMES'],
    'ACCORDÉON': ['SOUFFLET', 'BAL', 'MUSETTE', 'TOUCHES'],
    'TAMBOUR': ['BAGUETTES', 'PEAU', 'ROULEMENT', 'FANFARE'],
    'TROMPETTE': ['CUIVRE', 'PISTONS', 'JAZZ', 'SOUFFLER'],
    'FOOTBALL': ['BALLON', 'BUTS', 'PENALTY', 'ARBITRE'],
    'RUGBY': ['OVALE', 'MÊLÉE', 'ESSAI', 'PLAQUAGE'],
    'TENNIS': ['RAQUETTE', 'FILET', 'SMASH', 'ACE'],
    'BADMINTON': ['VOLANT', 'RAQUETTE', 'FILET', 'PLUMES'],
    'SKI': ['PISTE', 'BÂTONS', 'FART', 'TÉLÉSIÈGE'],
    'LUGE': ['NEIGE', 'GLISSER', 'PENTE', 'TRAÎNEAU'],
    'NATATION': ['CRAWL', 'BASSIN', 'BRASSE', 'LONGUEURS'],
    'PLONGÉE': ['BOUTEILLES', 'PALMES', 'TUBA', 'CORAUX'],
    'BOXE': ['RING', 'GANTS', 'UPPERCUT', 'KO'],
    'JUDO': ['KIMONO', 'TATAMI', 'IPPON', 'PRISE'],
    'DANSE': ['CHORÉGRAPHIE', 'VALSE', 'PARQUET', 'RYTHME'],
    'GYMNASTIQUE': ['SOUPLESSE', 'POUTRE', 'AGRÈS', 'SALTO'],
    'COURSE': ['DOSSARD', 'SPRINT', 'CHRONO', 'FOULÉES'],
    'RANDONNÉE': ['SENTIER', 'GOURDE', 'BALISAGE', 'MARCHE'],
    'PÊCHE': ['CANNE', 'HAMEÇON', 'APPÂT', 'BOUCHON'],
    'CHASSE': ['GIBIER', 'FUSIL', 'BATTUE', 'MEUTE'],
    'ÉCHECS': ['CAVALIER', 'MAT', 'PIONS', 'ÉCHIQUIER'],
    'DAMES': ['PIONS', 'DAMIER', 'DIAGONALE', 'COURONNÉ'],
    'POKER': ['BLUFF', 'JETONS', 'PAIRE', 'MISE'],
    'BELOTE': ['ATOUT', 'PLIS', 'ANNONCES', 'CARTES'],
    'PUZZLE': ['PIÈCES', 'ASSEMBLER', 'PATIENCE', 'IMAGE'],
    'MOTS CROISÉS': ['GRILLE', 'DÉFINITIONS', 'CASES', 'JOURNAL'],
    'PÉTANQUE': ['BOULES', 'COCHONNET', 'TERRAIN', 'PROVENCE'],
    'BOWLING': ['QUILLES', 'STRIKE', 'PISTE', 'BOULE'],
    'PATINAGE': ['LAMES', 'PIROUETTES', 'ARTISTIQUE', 'GLACE'],
    'ROLLER': ['ROULETTES', 'CASQUE', 'GENOUILLÈRES', 'GLISSE'],
    'ESCALADE': ['PAROI', 'BAUDRIER', 'PRISES', 'GRIMPER'],
    'ALPINISME': ['CORDÉE', 'PIOLET', 'SOMMET', 'CRAMPONS'],
    'VOILE': ['MÂT', 'RÉGATE', 'VENT', 'SKIPPER'],
    'SURF': ['VAGUE', 'PLANCHE', 'SPOT', 'HAWAÏ'],
    'SOLEIL': ['RAYONS', 'BRONZER', 'LEVANT', 'ASTRE'],
    'LUNE': ['CROISSANT', 'PLEINE', 'CRATÈRES', 'NUIT'],
    'PLUIE': ['GOUTTES', 'AVERSE', 'FLAQUES', 'MOUILLÉ'],
    'NEIGE': ['FLOCONS', 'BONHOMME', 'POUDREUSE', 'BLANCHE'],
    'ORAGE': ['ÉCLAIRS', 'TONNERRE', 'GRONDE', 'FOUDRE'],
    'TEMPÊTE': ['RAFALES', 'OURAGAN', 'DÉGÂTS', 'VENT'],
    'RIVIÈRE': ['BERGE', 'COURANT', 'TRUITES', 'MÉANDRES'],
    'CANAL': ['ÉCLUSE', 'PÉNICHE', 'MIDI', 'CREUSÉ'],
    'LAC': ['ANNECY', 'BARQUE', 'RIVE', 'PÉDALO'],
    'ÉTANG': ['NÉNUPHARS', 'GRENOUILLES', 'ROSEAUX', 'VASE'],
    'MER': ['VAGUES', 'MARÉE', 'SALÉE', 'HORIZON'],
    'OCÉAN': ['ATLANTIQUE', 'PACIFIQUE', 'IMMENSE', 'ABYSSES'],
    'NUAGE': ['COTON', 'CIEL', 'GRIS', 'CUMULUS'],
    'BROUILLARD': ['ÉPAIS', 'PHARES', 'MATINAL', 'BRUME'],
    'ÉTOILE': ['FILANTE', 'BERGER', 'SCINTILLE', 'CONSTELLATION'],
    'COMÈTE': ['QUEUE', 'HALLEY', 'TRAÎNÉE', 'PASSAGE'],
    'ARBRE': ['TRONC', 'BRANCHES', 'FEUILLAGE', 'RACINES'],
    'BUISSON': ['HAIE', 'TAILLÉ', 'ÉPINEUX', 'TOUFFU'],
    'ROSE': ['ÉPINES', 'BOUTON', 'PARFUM', 'BOUQUET'],
    'TULIPE': ['HOLLANDE', 'BULBE', 'CHAMPS', 'PRINTEMPS'],
    'HERBE': ['TONDRE', 'VERTE', 'PELOUSE', 'BRIN'],
    'MOUSSE': ['SOUS-BOIS', 'TAPIS', 'HUMIDE', 'ROCHERS'],
    'PRINTEMPS': ['BOURGEONS', 'GIBOULÉES', 'MARS', 'RENOUVEAU'],
    'AUTOMNE': ['FEUILLES', 'MARRONS', 'VENDANGES', 'OCTOBRE'],
    'HIVER': ['FROID', 'GEL', 'DÉCEMBRE', 'CHEMINÉE'],
    'ÉTÉ': ['JUILLET', 'VACANCES', 'CHALEUR', 'CANICULE'],
    'MATIN': ['AUBE', 'ROSÉE', 'CROISSANTS', 'BONJOUR'],
    'SOIR': ['CRÉPUSCULE', 'DÎNER', 'COUCHER', 'ÉTOILES'],
    'ARC-EN-CIEL': ['COULEURS', 'PRISME', 'ONDÉE', 'SEPT'],
    'AURORE BORÉALE': ['LAPONIE', 'POLAIRE', 'NORVÈGE', 'LUEURS'],
    'MÉDECIN': ['ORDONNANCE', 'STÉTHOSCOPE', 'CABINET', 'CONSULTATION'],
    'INFIRMIER': ['PIQÛRE', 'PANSEMENT', 'BLOUSE', 'SOINS'],
    'POLICIER': ['MENOTTES', 'SIRÈNE', 'ENQUÊTE', 'COMMISSARIAT'],
    'GENDARME': ['BRIGADE', 'KÉPI', 'ROUTE', 'CASERNE'],
    'POMPIER': ['LANCE', 'CASQUE', 'SIRÈNE', 'INCENDIE'],
    'AMBULANCIER': ['BRANCARD', 'URGENCES', 'GYROPHARE', 'TRANSPORT'],
    'BOULANGER': ['PÉTRIN', 'FOURNIL', 'BAGUETTES', 'LEVAIN'],
    'PÂTISSIER': ['ÉCLAIRS', 'FOUET', 'MACARONS', 'GLAÇAGE'],
    'PROFESSEUR': ['TABLEAU', 'CRAIE', 'DEVOIRS', 'CLASSE'],
    'ÉLÈVE': ['CARTABLE', 'PUPITRE', 'NOTES', 'RÉCITATION'],
    'AVOCAT': ['PLAIDOIRIE', 'BARREAU', 'DÉFENSE', 'CABINET'],
    'JUGE': ['TRIBUNAL', 'VERDICT', 'SENTENCE', 'ROBE'],
    'ACTEUR': ['RÔLE', 'TOURNAGE', 'CÉSAR', 'RÉPLIQUES'],
    'CHANTEUR': ['MICRO', 'TUBE', 'REFRAIN', 'SCÈNE'],
    'PEINTRE': ['PINCEAU', 'PALETTE', 'TOILE', 'CHEVALET'],
    'SCULPTEUR': ['MARBRE', 'CISEAU', 'STATUE', 'ATELIER'],
    'COIFFEUR': ['BRUSHING', 'SALON', 'MÈCHES', 'CISEAUX'],
    'BARBIER': ['RASOIR', 'BLAIREAU', 'MOUSTACHE', 'ÉCHOPPE'],
    'SERVEUR': ['PLATEAU', 'POURBOIRE', 'COMMANDE', 'TABLIER'],
    'CUISINIER': ['TOQUE', 'FOURNEAUX', 'RECETTE', 'BRIGADE'],
    'FACTEUR': ['COURRIER', 'TOURNÉE', 'SACOCHE', 'TIMBRES'],
    'LIVREUR': ['COLIS', 'SCOOTER', 'SONNETTE', 'CARTON'],
    'PILOTE': ['COCKPIT', 'COMMANDES', 'ALTITUDE', 'CASQUE'],
    'CAPITAINE': ['NAVIRE', 'BARRE', 'ÉQUIPAGE', 'GALONS'],
    'ROI': ['COURONNE', 'TRÔNE', 'SCEPTRE', 'MAJESTÉ'],
    'EMPEREUR': ['NAPOLÉON', 'EMPIRE', 'SACRE', 'ROME'],
    'PRINCESSE': ['DIADÈME', 'CONTE', 'ROBE', 'CARROSSE'],
    'REINE': ['COURONNE', 'MAJESTÉ', 'ANGLETERRE', 'TRÔNE'],
    'PIRATE': ['TRÉSOR', 'ABORDAGE', 'CROCHET', 'PAVILLON'],
    'VIKING': ['DRAKKAR', 'CASQUE', 'SCANDINAVIE', 'PILLAGE'],
    'SORCIÈRE': ['BALAI', 'CHAUDRON', 'GRIMOIRE', 'VERRUE'],
    'FÉE': ['BAGUETTE', 'CLOCHETTE', 'MARRAINE', 'AILES'],
    'FANTÔME': ['DRAP', 'BOUH', 'MANOIR', 'HANTÉ'],
    'VAMPIRE': ['CANINES', 'DRACULA', 'CERCUEIL', 'AIL'],
    'CLOWN': ['NEZ', 'GRIMAGE', 'RIRES', 'CHAPITEAU'],
    'MIME': ['SILENCE', 'GESTES', 'MAQUILLAGE', 'INVISIBLE'],
    'MAGICIEN': ['ABRACADABRA', 'BAGUETTE', 'COLOMBE', 'ILLUSION'],
    'JONGLEUR': ['BALLES', 'QUILLES', 'ADRESSE', 'MASSUES'],
    'CHEVALIER': ['ARMURE', 'ÉPÉE', 'TOURNOI', 'ADOUBÉ'],
    'SAMOURAÏ': ['KATANA', 'JAPON', 'HONNEUR', 'ARMURE'],
    'ESPION': ['INFILTRÉ', 'MICRO', 'MISSION', 'SECRET'],
    'DÉTECTIVE': ['LOUPE', 'ENQUÊTE', 'INDICES', 'FILATURE'],
    'PANTALON': ['JAMBES', 'BRAGUETTE', 'JEAN', 'OURLET'],
    'SHORT': ['BERMUDA', 'JAMBES', 'SPORT', 'GENOUX'],
    'ROBE': ['SOIRÉE', 'MARIÉE', 'ÉLÉGANTE', 'FLEURIE'],
    'JUPE': ['PLISSÉE', 'GENOUX', 'ÉCOSSAISE', 'VOLANTS'],
    'PULL': ['LAINE', 'TRICOTÉ', 'COL', 'HIVER'],
    'GILET': ['BOUTONS', 'LAINE', 'SAUVETAGE', 'TRICOT'],
    'MANTEAU': ['HIVER', 'FOURRURE', 'CAPUCHE', 'LONG'],
    'VESTE': ['BLAZER', 'COSTUME', 'ZIPPÉE', 'CINTRE'],
    'CHAUSSURE': ['LACETS', 'SEMELLE', 'POINTURE', 'CIRAGE'],
    'BOTTE': ['PLUIE', 'CAOUTCHOUC', 'CUIR', 'FOIN'],
    'CHAPEAU': ['BORD', 'FEUTRE', 'MELON', 'PAILLE'],
    'CASQUETTE': ['VISIÈRE', 'BASEBALL', 'SOLEIL', 'TÊTE'],
    'ÉCHARPE': ['COU', 'LAINE', 'TRICOTÉE', 'MAIRE'],
    'FOULARD': ['SOIE', 'COU', 'NOUÉ', 'CARRÉ'],
    'GANT': ['DOIGTS', 'CUIR', 'TOILETTE', 'HIVER'],
    'MOUFLE': ['SKI', 'FROID', 'POUCE', 'ENFANT'],
    'CRAVATE': ['NŒUD', 'COSTUME', 'SOIE', 'COL'],
    'NŒUD PAPILLON': ['SMOKING', 'CHIC', 'COU', 'CÉRÉMONIE'],
    'CEINTURE': ['BOUCLE', 'TAILLE', 'CRAN', 'CUIR'],
    'BRETELLES': ['ÉPAULES', 'ÉLASTIQUES', 'PANTALON', 'CLIPS'],
    'PYJAMA': ['NUIT', 'RAYÉ', 'DORMIR', 'FLANELLE'],
    'PEIGNOIR': ['BAIN', 'ÉPONGE', 'DOUILLET', 'SPA'],
    'CHAUSSETTE': ['ORTEILS', 'PAIRE', 'TROUÉE', 'COTON'],
    'COLLANT': ['JAMBES', 'NYLON', 'FILÉ', 'OPAQUE'],
    'ANNIVERSAIRE': ['BOUGIES', 'CADEAUX', 'INVITATIONS', 'SOUFFLER'],
    'MARIAGE': ['ALLIANCES', 'MAIRIE', 'BOUQUET', 'TÉMOINS'],
    'NOËL': ['SAPIN', 'CADEAUX', 'GUIRLANDES', 'CRÈCHE'],
    'NOUVEL AN': ['MINUIT', 'RÉSOLUTIONS', 'JANVIER', 'COTILLONS'],
    'CARNAVAL': ['DÉGUISEMENTS', 'CONFETTIS', 'MASQUES', 'DÉFILÉ'],
    'HALLOWEEN': ['CITROUILLE', 'BONBONS', 'DÉGUISEMENT', 'OCTOBRE'],
    'RADIO': ['ONDES', 'ANIMATEUR', 'FRÉQUENCE', 'TRANSISTOR'],
    'TÉLÉVISION': ['ÉCRAN', 'CHAÎNES', 'TÉLÉCOMMANDE', 'JOURNAL'],
    'PHOTO': ['CLICHÉ', 'ALBUM', 'FLASH', 'ARGENTIQUE'],
    'VIDÉO': ['CAMÉRA', 'MONTAGE', 'CLIP', 'RALENTI'],
    'LETTRE': ['ENVELOPPE', 'TIMBRE', 'PLUME', 'SIGNATURE'],
    'CARTE POSTALE': ['VACANCES', 'TIMBRE', 'PAYSAGE', 'BISOUS'],
    'EMAIL': ['BOÎTE', 'ARROBASE', 'ENVOYER', 'SPAM'],
    'TEXTO': ['POUCES', 'SMILEYS', 'FORFAIT', 'ABRÉVIATIONS'],
    'CONCERT': ['SCÈNE', 'RAPPEL', 'PUBLIC', 'GUITARES'],
    'FESTIVAL': ['SCÈNES', 'ÉDITION', 'PROGRAMMATION', 'FOULE'],
    'DOUCHE': ['POMMEAU', 'JET', 'RAPIDE', 'MATINALE'],
    'BAIN': ['BAIGNOIRE', 'MOUSSE', 'CANARD', 'BULLES'],
    'ASCENSEUR': ['ÉTAGES', 'BOUTONS', 'CABINE', 'MONTER'],
    'ESCALATOR': ['MARCHES', 'ROULANT', 'MAGASIN', 'MONTÉE'],
    'TENTE': ['PIQUETS', 'TOILE', 'DUVET', 'ARCEAUX'],
    'CARAVANE': ['REMORQUE', 'AUVENT', 'VACANCES', 'TRACTÉE'],
    'FEU DE CAMP': ['GUIMAUVES', 'BRAISES', 'VEILLÉE', 'CHANSONS'],
    'BARBECUE': ['GRILLE', 'BROCHETTES', 'MERGUEZ', 'CHARBON']
  };

  /* index par mot normalisé + index inversé (indice → mots dont il provient) */
  var ASSOC_N = {}, ASSOC_REV = {};
  Object.keys(ASSOC).forEach(function (w) {
    var k = norm(w);
    ASSOC_N[k] = ASSOC[w];
    ASSOC[w].forEach(function (a) {
      var na = norm(a);
      (ASSOC_REV[na] = ASSOC_REV[na] || []).push(k);
    });
  });

  /* indices passe-partout quand l'IA est à court d'idées */
  var FLOUS = ['CLASSIQUE', 'COURANT', 'QUOTIDIEN', 'FAMILIER', 'TYPIQUE',
    'AGRÉABLE', 'MODERNE', 'POPULAIRE'];

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

  /* ---- adversaire IA ----------------------------------------------------
     L'IA ne regarde que ce que le joueur assis à sa place sait : SON mot,
     les indices publics et qui est en vie. Jamais state.pair, jamais le camp
     ni le mot des autres — l'imposteur IA s'ignore donc, comme un humain. */

  /* l'indice passerait-il les contrôles du apply() ? */
  function clueOk(text, word) {
    var t = String(text || '').trim();
    if (!t || t.length > 20 || /\s/.test(t)) return false;
    var nc = norm(t), nw = norm(word);
    if (!nc) return false;
    return !(nw && (nc.indexOf(nw) !== -1 || nw.indexOf(nc) !== -1));
  }

  /* indices déjà entendus cette manche (normalisés) */
  function usedClues(state) {
    var set = {};
    (state.tours || []).forEach(function (tour) {
      tour.forEach(function (c) { set[norm(c.text)] = true; });
    });
    return set;
  }

  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

  function botClue(state, me) {
    var word = state.players[me].word || '';
    var used = usedClues(state);
    var mine = {};
    (ASSOC_N[norm(word)] || []).forEach(function (a) { mine[norm(a)] = true; });
    function frais(liste) {
      return (liste || []).filter(function (a) {
        return clueOk(a, word) && !used[norm(a)];
      });
    }
    /* les indices des autres, cette manche */
    var entendus = [], collent = 0;
    (state.tours || []).forEach(function (tour) {
      tour.forEach(function (c) {
        if (c.p === me) return;
        var n = norm(c.text);
        entendus.push(n);
        if (mine[n]) collent++;
      });
    });
    /* rebondir sur le thème d'un indice déjà entendu */
    function echo() {
      var melange = GG.shuffle(entendus.slice());
      for (var h = 0; h < melange.length; h++) {
        var parents = ASSOC_REV[melange[h]] || [];
        for (var k = 0; k < parents.length; k++) {
          var e = frais(ASSOC_N[parents[k]]);
          if (e.length) return pick(e);
        }
      }
      return null;
    }
    /* doute sur soi : si les indices des autres ne collent pas à mon mot,
       je suis peut-être l'imposteur… mieux vaut reprendre leur thème que
       de continuer à dévoiler le mien */
    if (entendus.length >= 2 && collent * 2 < entendus.length && Math.random() < 0.6) {
      var bluff = echo();
      if (bluff) return bluff;
    }
    /* 1) une association encore inédite de son propre mot */
    var pool = frais(ASSOC_N[norm(word)]);
    if (pool.length) return pick(pool);
    /* 2) à sec : l'écho, faute de mieux */
    var secours = echo();
    if (secours) return secours;
    /* 3) sinon on reste dans le vague */
    var flous = FLOUS.filter(function (a) { return clueOk(a, word); });
    return flous.length ? pick(flous) : 'MYSTÈRE';
  }

  function botVote(state, me) {
    var mine = {};
    (ASSOC_N[norm(state.players[me].word || '')] || []).forEach(function (a) {
      mine[norm(a)] = true;
    });
    var autres = alive(state).filter(function (i) { return i !== me; });
    /* parfois on vote au flair, sans analyse : l'IA n'est pas voyante */
    if (Math.random() < 0.2) return pick(autres);
    var cible = autres[0], pire = -Infinity;
    autres.forEach(function (i) {
      var s = 0;
      (state.tours || []).forEach(function (tour) {
        tour.forEach(function (c) {
          if (c.p !== i) return;
          var n = norm(c.text);
          if (mine[n]) s -= 0.5;            /* colle à MON mot : rassurant */
          else if (ASSOC_REV[n]) s += 0.75; /* précis… mais pour un autre mot */
          else s += 0.4;                    /* flou : léger doute */
        });
      });
      s += Math.random() * 3.5;
      if (s > pire) { pire = s; cible = i; }
    });
    return cible;
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
      }).join('') + '<h1>🏆 ' + rows.filter(function (r) { return r.s === rows[0].s; })
        .map(function (r) { return GG.esc(r.n); }).join(' & ') + '</h1>';
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
        if (i !== viewer && copy.phase !== 'end') delete p.vote;
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

    bot: function (state, me) {
      var p = state.players[me];
      if (!p) return null;
      if (state.phase === 'reveal') {
        return p.alive && !p.seen ? { t: 'seen' } : null;
      }
      if (state.phase === 'clue') {
        if (!p.alive || state.order[state.orderPos] !== me) return null;
        return { t: 'clue', text: botClue(state, me) };
      }
      if (state.phase === 'vote') {
        if (!p.alive || p.vote !== -1) return null;
        return { t: 'vote', for: botVote(state, me) };
      }
      return null; /* result / end : l'hôte enchaîne lui-même */
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
        var votedN = av.filter(function (i) { return !!s.players[i].hasVoted; }).length;
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
            ? '😇 Les civils gagnent !'
            : (c.imp > 1 ? '🥸 Les imposteurs gagnent !' : '🥸 L’imposteur gagne !')) + '</p>' +
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
