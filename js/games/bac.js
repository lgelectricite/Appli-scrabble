/* GGgames — Petit Bac (2 à 4 joueurs, réseau uniquement). */
(function (root) {
  'use strict';
  var GG = root.GG;
  var CATS = ['Prénom', 'Animal', 'Ville ou pays', 'Métier', 'Fruit ou légume', 'Objet'];
  var LETTERS = 'ABCDEFGHIJLMNOPRSTV'; // lettres jouables (pas de K, Q, U, W, X, Y, Z)
  var ROUNDS = 4;
  var DURATION = 60; // secondes

  function normalize(s) {
    return String(s || '').trim().toUpperCase()
      .replace(/Œ/g, 'OE').replace(/Æ/g, 'AE')
      .normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function autoInvalid(state, answer) {
    var n = normalize(answer);
    return !n || n[0] !== state.letter;
  }

  /* score la manche : appelé quand tous les votes sont rentrés */
  function scoreRound(state) {
    var nP = state.players.length;
    var results = [];
    for (var p = 0; p < nP; p++) results.push([]);
    for (var c = 0; c < CATS.length; c++) {
      // réponses valides de la catégorie (majorité des votes des autres joueurs)
      var valid = [];
      for (p = 0; p < nP; p++) {
        var ans = (state.answers[p] || [])[c] || '';
        if (autoInvalid(state, ans)) { results[p][c] = { ans: ans, pts: 0, why: 'invalide' }; continue; }
        var yes = 0, no = 0;
        for (var v = 0; v < nP; v++) {
          if (v === p) continue;
          var grid = (state.votes[v] || {})[p];
          if (grid && grid[c] === false) no++; else yes++;
        }
        if (no > yes) { results[p][c] = { ans: ans, pts: 0, why: 'refusée' }; }
        else { valid.push({ p: p, n: normalize(ans), ans: ans }); }
      }
      valid.forEach(function (entry) {
        var dup = valid.filter(function (e) { return e.n === entry.n; }).length > 1;
        results[entry.p][c] = { ans: entry.ans, pts: dup ? 5 : 10, why: dup ? 'doublon' : '' };
      });
    }
    var gains = [];
    for (p = 0; p < nP; p++) {
      var g = 0;
      for (c = 0; c < CATS.length; c++) g += (results[p][c] || { pts: 0 }).pts;
      state.players[p].score += g;
      gains.push(g);
    }
    state.results = results;
    state.gains = gains;
    state.phase = 'result';
  }

  /* Petit lexique embarqué pour l'adversaire IA : quelques mots sûrs par
     lettre et par catégorie. Volontairement incomplet — l'IA sèche parfois
     sur une lettre, exactement comme un joueur humain. */
  var BOT_LEX = [
    { /* Prénom */
      A: ['Adam', 'Adèle', 'Adrien', 'Agathe', 'Agnès', 'Alain', 'Alba', 'Albert', 'Alexandre', 'Alexis', 'Alice', 'Aline', 'Amandine', 'Ambre', 'Amélie', 'Anaïs', 'André', 'Anne', 'Antoine', 'Antonin', 'Arnaud', 'Arthur', 'Aurélie', 'Aurore', 'Axel', 'Aya'],
      B: ['Baptiste', 'Barbara', 'Barnabé', 'Basile', 'Bastien', 'Béatrice', 'Benjamin', 'Benoît', 'Bérénice', 'Bernadette', 'Bernard', 'Berthe', 'Bertrand', 'Bilal', 'Blaise', 'Blanche', 'Boris', 'Brigitte', 'Bruno'],
      C: ['Camille', 'Capucine', 'Carine', 'Carole', 'Caroline', 'Catherine', 'Cécile', 'Célia', 'Céline', 'Chantal', 'Charles', 'Charlotte', 'Chloé', 'Christian', 'Christine', 'Christophe', 'Claire', 'Clara', 'Claude', 'Clémence', 'Clément', 'Colette', 'Constance', 'Corentin', 'Corinne', 'Cyril'],
      D: ['Damien', 'Daniel', 'Danielle', 'David', 'Delphine', 'Denis', 'Denise', 'Diane', 'Didier', 'Diego', 'Dimitri', 'Dominique', 'Dorian', 'Doriane', 'Dorothée', 'Dounia'],
      E: ['Édith', 'Edmond', 'Édouard', 'Elena', 'Éliane', 'Élie', 'Élisabeth', 'Élise', 'Élodie', 'Éloïse', 'Emma', 'Emmanuel', 'Emmanuelle', 'Enzo', 'Éric', 'Ernest', 'Estelle', 'Esther', 'Ethan', 'Étienne', 'Eugène', 'Eugénie', 'Éva', 'Évelyne'],
      F: ['Fabien', 'Fabienne', 'Fabrice', 'Fanny', 'Farida', 'Fatima', 'Faustine', 'Félix', 'Fernand', 'Fernande', 'Firmin', 'Flavie', 'Fleur', 'Flore', 'Florence', 'Florent', 'Florian', 'France', 'Francis', 'Franck', 'François', 'Françoise', 'Frédéric', 'Frédérique'],
      G: ['Gabin', 'Gabriel', 'Gabrielle', 'Gaël', 'Gaëlle', 'Gaspard', 'Gaston', 'Geneviève', 'Georges', 'Georgette', 'Gérald', 'Gérard', 'Germaine', 'Gilbert', 'Gilles', 'Gisèle', 'Grégoire', 'Grégory', 'Guillaume', 'Gustave', 'Guy', 'Gwendoline'],
      H: ['Habib', 'Hadrien', 'Hamza', 'Hanna', 'Hector', 'Hélène', 'Héloïse', 'Henri', 'Henriette', 'Hervé', 'Hicham', 'Honoré', 'Honorine', 'Hortense', 'Hubert', 'Hugo', 'Hugues', 'Huguette'],
      I: ['Ibrahim', 'Ida', 'Igor', 'Ilan', 'Ilona', 'Imane', 'Inès', 'Ingrid', 'Irène', 'Iris', 'Isaac', 'Isabelle', 'Isaure', 'Isidore', 'Ismaël', 'Ivan'],
      J: ['Jacinthe', 'Jack', 'Jacky', 'Jacqueline', 'Jacques', 'Jade', 'Janine', 'Jason', 'Jean', 'Jeanne', 'Jeannine', 'Jennifer', 'Jérémie', 'Jérémy', 'Jérôme', 'Jessica', 'Jimmy', 'Joachim', 'Jocelyne', 'Joël', 'Joëlle', 'Johan', 'John', 'Jonathan', 'Jordan', 'José', 'Joseph', 'Joséphine', 'Josette', 'Josiane', 'Jules', 'Julie', 'Julien', 'Juliette', 'Justine'],
      L: ['Ladislas', 'Laetitia', 'Lambert', 'Lara', 'Laura', 'Laure', 'Laurence', 'Laurent', 'Léa', 'Léon', 'Léonard', 'Léonie', 'Léopold', 'Liam', 'Liliane', 'Lilou', 'Lily', 'Lina', 'Lionel', 'Lisa', 'Lise', 'Loïc', 'Lola', 'Lou', 'Louis', 'Louise', 'Louna', 'Luc', 'Luca', 'Lucas', 'Lucie', 'Lucien', 'Lucienne', 'Ludivine', 'Ludovic', 'Lydie'],
      M: ['Maël', 'Maëlys', 'Magali', 'Manon', 'Marc', 'Marcel', 'Marcelle', 'Margot', 'Marguerite', 'Maria', 'Marie', 'Marine', 'Marion', 'Marius', 'Marthe', 'Martin', 'Martine', 'Mathieu', 'Mathilde', 'Matthieu', 'Maud', 'Maurice', 'Max', 'Maxence', 'Maxime', 'Mehdi', 'Mélanie', 'Mélissa', 'Michel', 'Michèle', 'Micheline', 'Mickaël', 'Mireille', 'Mohamed', 'Monique', 'Morgane', 'Muriel', 'Mylène', 'Myriam'],
      N: ['Nadège', 'Nadia', 'Nadine', 'Naël', 'Naïma', 'Nassim', 'Natacha', 'Nathalie', 'Nathan', 'Nelly', 'Némo', 'Nicolas', 'Nicole', 'Nina', 'Ninon', 'Noa', 'Noé', 'Noël', 'Noélie', 'Noémie', 'Nolan', 'Nora', 'Norbert', 'Norine'],
      O: ['Océane', 'Octave', 'Odette', 'Odile', 'Olga', 'Olivia', 'Olivier', 'Ophélie', 'Oscar', 'Oswald', 'Oumar', 'Owen'],
      P: ['Pablo', 'Paloma', 'Pamela', 'Paol', 'Pascal', 'Pascale', 'Patrice', 'Patricia', 'Patrick', 'Paul', 'Paule', 'Pauline', 'Perrine', 'Philippe', 'Pierre', 'Pierrette', 'Pierrick', 'Priscille', 'Prosper', 'Prune'],
      R: ['Rachel', 'Rachid', 'Raphaël', 'Raphaëlle', 'Raymond', 'Raymonde', 'Rébecca', 'Régine', 'Régis', 'Rémi', 'Rémy', 'Renaud', 'René', 'Renée', 'Richard', 'Rita', 'Robert', 'Robin', 'Rodolphe', 'Rodrigue', 'Roger', 'Roland', 'Rolande', 'Romain', 'Romane', 'Romy', 'Rosalie', 'Rose', 'Roseline', 'Roxane', 'Ruben'],
      S: ['Sabine', 'Sabrina', 'Sacha', 'Salima', 'Salomé', 'Samir', 'Samuel', 'Sandra', 'Sandrine', 'Sarah', 'Sébastien', 'Serge', 'Séverine', 'Sidonie', 'Simon', 'Simone', 'Sofia', 'Solange', 'Soline', 'Sonia', 'Sophie', 'Stanislas', 'Stéphane', 'Stéphanie', 'Suzanne', 'Suzette', 'Sylvain', 'Sylvestre', 'Sylvie'],
      T: ['Tamara', 'Tanguy', 'Tania', 'Teddy', 'Théo', 'Théodore', 'Théophile', 'Thérèse', 'Thibault', 'Thibaut', 'Thierry', 'Thomas', 'Tiago', 'Timéo', 'Timothée', 'Tom', 'Toni', 'Tony', 'Tristan'],
      V: ['Valentin', 'Valentine', 'Valérie', 'Valéry', 'Vanessa', 'Véronique', 'Vianney', 'Victoire', 'Victor', 'Victoria', 'Vincent', 'Violette', 'Virgile', 'Virginie', 'Viviane', 'Vivien']
    },
    { /* Animal */
      A: ['abeille', 'agneau', 'aï', 'aigle', 'albatros', 'alligator', 'alouette', 'anaconda', 'âne', 'anguille', 'antilope', 'araignée', 'autruche', 'axolotl'],
      B: ['babouin', 'baleine', 'bar', 'barracuda', 'basset', 'bécasse', 'belette', 'bélier', 'bernache', 'biche', 'bison', 'blaireau', 'blatte', 'boa', 'bouc', 'bouledogue', 'bouquetin', 'bourdon', 'brebis', 'brochet', 'buffle', 'busard', 'buse'],
      C: ['cabillaud', 'cachalot', 'cafard', 'caille', 'caïman', 'calmar', 'caméléon', 'canard', 'caniche', 'carpe', 'castor', 'cerf', 'chacal', 'chameau', 'chamois', 'chat', 'chauve-souris', 'cheval', 'chevreuil', 'chien', 'chimpanzé', 'chinchilla', 'chouette', 'cigale', 'cigogne', 'cobra', 'coccinelle', 'cochon', 'colibri', 'colombe', 'condor', 'coq', 'corbeau', 'cormoran', 'coyote', 'crabe', 'crapaud', 'crevette', 'criquet', 'crocodile', 'cygne'],
      D: ['daim', 'dalmatien', 'dauphin', 'demoiselle', 'diable de Tasmanie', 'dinde', 'dindon', 'dingo', 'dogue', 'dorade', 'doryphore', 'dragon de Komodo', 'dromadaire'],
      E: ['écaille', 'écrevisse', 'écureuil', 'élan', 'éléphant', 'émeu', 'éperlan', 'épervier', 'éphémère', 'épinoche', 'escargot', 'espadon', 'étalon', 'étoile de mer', 'étourneau'],
      F: ['faisan', 'faon', 'faucon', 'fauvette', 'flamant rose', 'flétan', 'fouine', 'foulque', 'fourmi', 'frelon', 'fringille', 'fulmar', 'furet', 'furet des bois'],
      G: ['gazelle', 'gecko', 'gerbille', 'gibbon', 'girafe', 'gnou', 'goéland', 'gorfou', 'gorille', 'grenouille', 'grillon', 'grive', 'grizzli', 'guépard', 'guêpe'],
      H: ['hamster', 'hareng', 'hérisson', 'hermine', 'héron', 'hibou', 'hippocampe', 'hippopotame', 'hirondelle', 'homard', 'huître', 'husky', 'hyène'],
      I: ['ibis', 'ide', 'iguane', 'impala', 'insecte', 'isard'],
      J: ['jacana', 'jaguar', 'jars', 'jaseur', 'jument'],
      L: ['lama', 'lamantin', 'lapin', 'lémurien', 'léopard', 'levrette', 'lévrier', 'lézard', 'libellule', 'lièvre', 'limace', 'lion', 'lionne', 'loir', 'loriot', 'lotte', 'loup', 'loutre', 'luciole', 'lynx'],
      M: ['macaque', 'mamba', 'manchot', 'mandrill', 'mante religieuse', 'marcassin', 'marmotte', 'marsouin', 'martre', 'méduse', 'merle', 'mérou', 'mésange', 'milan', 'mille-pattes', 'moineau', 'morse', 'morue', 'mouche', 'mouette', 'mouflon', 'moule', 'moustique', 'mouton', 'mule', 'mulet', 'mulot', 'musaraigne', 'mygale'],
      N: ['nandou', 'narval', 'nasique', 'nautile', 'nèpe', 'notonecte'],
      O: ['oie', 'okapi', 'opossum', 'orang-outan', 'orignal', 'ornithorynque', 'orque', 'ortolan', 'otarie', 'ours', 'oursin', 'outarde'],
      P: ['panda', 'pangolin', 'panthère', 'paon', 'papillon', 'pélican', 'perdrix', 'perroquet', 'perruche', 'phacochère', 'phasme', 'phoque', 'pie', 'pieuvre', 'pigeon', 'pinson', 'pintade', 'piranha', 'pluvier', 'poney', 'porc', 'porc-épic', 'poule', 'poulpe', 'puce', 'puma', 'python'],
      R: ['ragondin', 'raie', 'rainette', 'rat', 'raton laveur', 'renard', 'renne', 'requin', 'rhinocéros', 'rossignol', 'rouge-gorge', 'roussette'],
      S: ['sanglier', 'sardine', 'saumon', 'sauterelle', 'scarabée', 'scorpion', 'serpent', 'singe', 'sole', 'souris', 'sphinx', 'suricate'],
      T: ['tamanoir', 'tamarin', 'taon', 'tapir', 'tarentule', 'tatou', 'taupe', 'taureau', 'teckel', 'termite', 'thon', 'tigre', 'tortue', 'toucan', 'tourterelle', 'truite'],
      V: ['vache', 'vairon', 'vanneau', 'varan', 'vautour', 'veau', 'ver', 'verdier', 'veuve', 'vipère', 'vison', 'vole']
    },
    { /* Ville ou pays */
      A: ['Abidjan', 'Afghanistan', 'Afrique du Sud', 'Agen', 'Ajaccio', 'Albanie', 'Alger', 'Algérie', 'Allemagne', 'Amiens', 'Amsterdam', 'Andorre', 'Angers', 'Angleterre', 'Angola', 'Angoulême', 'Ankara', 'Annecy', 'Antibes', 'Arcachon', 'Argentine', 'Arles', 'Arménie', 'Arras', 'Athènes', 'Aubervilliers', 'Auckland', 'Aurillac', 'Australie', 'Autriche', 'Auxerre', 'Avignon', 'Azerbaïdjan'],
      B: ['Bagdad', 'Bahamas', 'Bali', 'Bamako', 'Bangkok', 'Bangladesh', 'Barcelone', 'Bastia', 'Bayonne', 'Beauvais', 'Belfort', 'Belgique', 'Belgrade', 'Bénin', 'Berlin', 'Berne', 'Besançon', 'Béziers', 'Biarritz', 'Bilbao', 'Birmanie', 'Blois', 'Bogota', 'Bolivie', 'Bordeaux', 'Bosnie', 'Boston', 'Botswana', 'Boulogne', 'Bourges', 'Brésil', 'Brest', 'Brive', 'Bruges', 'Bruxelles', 'Bucarest', 'Budapest', 'Buenos Aires', 'Bulgarie', 'Burkina Faso', 'Burundi'],
      C: ['Caen', 'Caire', 'Calais', 'Calcutta', 'Cali', 'Cambodge', 'Cameroun', 'Canada', 'Cannes', 'Cap-Vert', 'Caracas', 'Carcassonne', 'Casablanca', 'Cayenne', 'Chambéry', 'Chamonix', 'Charleville', 'Chartres', 'Chicago', 'Chili', 'Chine', 'Chypre', 'Clermont-Ferrand', 'Cognac', 'Colmar', 'Colombie', 'Compiègne', 'Congo', 'Copenhague', 'Corée du Sud', 'Costa Rica', 'Croatie', 'Cuba'],
      D: ['Dakar', 'Dallas', 'Damas', 'Danemark', 'Deauville', 'Delhi', 'Détroit', 'Dieppe', 'Dijon', 'Djibouti', 'Douai', 'Doubaï', 'Dresde', 'Dublin', 'Dunkerque'],
      E: ['Écosse', 'Édimbourg', 'Égypte', 'Émirats arabes unis', 'Épinal', 'Équateur', 'Érythrée', 'Espagne', 'Estonie', 'États-Unis', 'Éthiopie', 'Évian', 'Évreux', 'Évry'],
      F: ['Fécamp', 'Fidji', 'Figeac', 'Finlande', 'Florence', 'Foix', 'Fontainebleau', 'Forbach', 'Fort-de-France', 'Fougères', 'France', 'Francfort', 'Fréjus', 'Fribourg'],
      G: ['Gabon', 'Gand', 'Gap', 'Gênes', 'Genève', 'Géorgie', 'Ghana', 'Gibraltar', 'Grasse', 'Grèce', 'Grenade', 'Grenoble', 'Groenland', 'Guadeloupe', 'Guatemala', 'Guinée', 'Guyane'],
      H: ['Haïti', 'Hambourg', 'Hanoï', 'Hanovre', 'Havane', 'Havre', 'Hawaï', 'Haye', 'Helsinki', 'Hérouville', 'Honduras', 'Honfleur', 'Hongrie', 'Honolulu', 'Houston', 'Hyères'],
      I: ['Ibiza', 'Inde', 'Indonésie', 'Innsbruck', 'Irak', 'Iran', 'Irkoutsk', 'Irlande', 'Islande', 'Israël', 'Issoudun', 'Istanbul', 'Italie', 'Ivry'],
      J: ['Jakarta', 'Jamaïque', 'Japon', 'Jarnac', 'Jérez', 'Jérusalem', 'Johannesburg', 'Joigny', 'Jordanie', 'Juan-les-Pins'],
      L: ['La Rochelle', 'Lausanne', 'Laval', 'Le Mans', 'Lettonie', 'Liban', 'Liberia', 'Libye', 'Liège', 'Lille', 'Lima', 'Limoges', 'Lisbonne', 'Lituanie', 'Liverpool', 'Londres', 'Lorient', 'Los Angeles', 'Lourdes', 'Luxembourg', 'Lyon'],
      M: ['Macédoine', 'Mâcon', 'Madagascar', 'Madrid', 'Malaisie', 'Mali', 'Malte', 'Manille', 'Marmande', 'Maroc', 'Marrakech', 'Marseille', 'Martinique', 'Maurice', 'Mauritanie', 'Mayotte', 'Meaux', 'Melbourne', 'Melun', 'Metz', 'Mexico', 'Mexique', 'Miami', 'Milan', 'Monaco', 'Mongolie', 'Montauban', 'Monténégro', 'Montpellier', 'Montréal', 'Moscou', 'Moulins', 'Mulhouse', 'Munich'],
      N: ['Nairobi', 'Namibie', 'Nancy', 'Nantes', 'Naples', 'Narbonne', 'Népal', 'Nevers', 'New York', 'Niamey', 'Nicaragua', 'Nice', 'Niger', 'Nigeria', 'Nîmes', 'Niort', 'Norvège', 'Nouméa', 'Nouvelle-Zélande'],
      O: ['Oman', 'Orange', 'Orléans', 'Oslo', 'Ostende', 'Ottawa', 'Ouagadougou', 'Ouganda', 'Oujda', 'Ouzbékistan', 'Oxford', 'Oyonnax'],
      P: ['Pakistan', 'Palerme', 'Panama', 'Paraguay', 'Paris', 'Pau', 'Pays-Bas', 'Pékin', 'Périgueux', 'Pérou', 'Perpignan', 'Philippines', 'Pise', 'Poitiers', 'Pologne', 'Porto', 'Portugal', 'Prague', 'Privas', 'Puebla'],
      R: ['Rabat', 'Ravenne', 'Reims', 'Rennes', 'Réunion', 'Reykjavik', 'Rimini', 'Rio de Janeiro', 'Riyad', 'Roanne', 'Rodez', 'Rome', 'Roubaix', 'Rouen', 'Roumanie', 'Royan', 'Russie', 'Rwanda', 'Ryad'],
      S: ['Saïgon', 'Saint-Brieuc', 'Saint-Denis', 'Saint-Étienne', 'Saint-Malo', 'Saint-Nazaire', 'Saint-Tropez', 'Salvador', 'Sarlat', 'Saumur', 'Sénégal', 'Séoul', 'Serbie', 'Sète', 'Séville', 'Shanghai', 'Singapour', 'Slovaquie', 'Slovénie', 'Sofia', 'Somalie', 'Soudan', 'Stockholm', 'Strasbourg', 'Suède', 'Suisse', 'Sydney', 'Syrie'],
      T: ['Tahiti', 'Taïwan', 'Tanger', 'Tanzanie', 'Tarbes', 'Tchad', 'Téhéran', 'Thaïlande', 'Thonon', 'Tibet', 'Tokyo', 'Toronto', 'Toulon', 'Toulouse', 'Tourcoing', 'Tours', 'Troyes', 'Tulle', 'Tunis', 'Tunisie', 'Turin', 'Turquie'],
      V: ['Valence', 'Valenciennes', 'Vancouver', 'Vannes', 'Varsovie', 'Venezuela', 'Venise', 'Verdun', 'Vérone', 'Versailles', 'Vesoul', 'Vichy', 'Vienne', 'Vierzon', 'Vietnam', 'Villeurbanne', 'Vilnius']
    },
    { /* Métier */
      A: ['acteur', 'actrice', 'agent immobilier', 'agriculteur', 'agricultrice', 'aiguilleur', 'ambulancier', 'ambulancière', 'analyste', 'anesthésiste', 'animateur', 'animatrice', 'antiquaire', 'apiculteur', 'apicultrice', 'architecte', 'archiviste', 'armurier', 'artisan', 'assureur', 'astronaute', 'astronome', 'athlète', 'aubergiste', 'auteur', 'avocat', 'avocate'],
      B: ['banquier', 'banquière', 'barbier', 'barman', 'berger', 'bergère', 'bibliothécaire', 'bijoutier', 'bijoutière', 'biologiste', 'boucher', 'bouchère', 'boulanger', 'boulangère', 'brancardier', 'brasseur', 'bûcheron', 'buraliste'],
      C: ['cadreur', 'caissier', 'caissière', 'capitaine', 'cardiologue', 'carreleur', 'cartographe', 'cascadeur', 'chanteur', 'chanteuse', 'chapelier', 'charcutier', 'charpentier', 'chauffeur', 'chef', 'chef de chantier', 'chercheur', 'chercheuse', 'chirurgien', 'chirurgienne', 'coiffeur', 'coiffeuse', 'comédien', 'comédienne', 'commerçant', 'commerçante', 'comptable', 'concierge', 'conducteur', 'conductrice', 'cordonnier', 'couturier', 'couturière', 'cuisinier', 'cuisinière', 'cultivateur'],
      D: ['danseur', 'danseuse', 'décorateur', 'décoratrice', 'déménageur', 'dentiste', 'dépanneur', 'dermatologue', 'dessinateur', 'dessinatrice', 'détective', 'développeur', 'développeuse', 'diététicien', 'diététicienne', 'diplomate', 'directeur', 'directrice', 'docteur', 'documentaliste', 'dompteur', 'douanier'],
      E: ['ébéniste', 'éboueur', 'éclairagiste', 'écrivain', 'écrivaine', 'éducateur', 'éducatrice', 'électricien', 'électricienne', 'éleveur', 'éleveuse', 'emballeur', 'embaumeur', 'enquêteur', 'enseignant', 'enseignante', 'entraîneur', 'entraîneuse', 'épicier', 'épicière', 'ergothérapeute', 'esthéticien', 'esthéticienne', 'étalagiste'],
      F: ['facteur', 'factrice', 'fermier', 'fermière', 'ferronnier', 'fleuriste', 'forgeron', 'formateur', 'formatrice', 'fossoyeur', 'fromager', 'fromagère'],
      G: ['garagiste', 'garde champêtre', 'garde forestier', 'gardien', 'gardienne', 'gendarme', 'généticien', 'géographe', 'géologue', 'géomètre', 'gérant', 'gérante', 'glacier', 'graphiste', 'greffier', 'grutier', 'guide', 'gynécologue'],
      H: ['harpiste', 'herboriste', 'historien', 'historienne', 'horloger', 'horlogère', 'horticulteur', 'horticultrice', 'hôtelier', 'hôtelière', 'hôtesse de l\'air', 'huissier', 'humoriste'],
      I: ['illustrateur', 'illustratrice', 'imprimeur', 'infirmier', 'infirmière', 'informaticien', 'informaticienne', 'ingénieur', 'ingénieure', 'inspecteur', 'inspectrice', 'instituteur', 'institutrice', 'intérimaire', 'interprète'],
      J: ['jardinier', 'jardinière', 'joaillier', 'jockey', 'jongleur', 'joueur professionnel', 'journaliste', 'juge', 'juriste', 'juriste d\'entreprise'],
      L: ['laborantin', 'laborantine', 'laitier', 'laitière', 'lamineur', 'laveur de vitres', 'lettreur', 'lexicographe', 'libraire', 'lieutenant', 'linguiste', 'livreur', 'livreuse', 'logisticien', 'luthier'],
      M: ['maçon', 'magicien', 'magicienne', 'magistrat', 'maïeuticien', 'maire', 'maître-nageur', 'mannequin', 'maquilleur', 'maquilleuse', 'maraîcher', 'maraîchère', 'marbrier', 'marchand', 'marchande', 'maréchal-ferrant', 'marin', 'masseur', 'masseuse', 'mathématicien', 'mécanicien', 'mécanicienne', 'médecin', 'menuisier', 'messager', 'météorologue', 'meunier', 'militaire', 'mineur', 'modéliste', 'moniteur', 'monitrice', 'musicien', 'musicienne'],
      N: ['nageur professionnel', 'naturaliste', 'navigateur', 'négociant', 'négociateur', 'nettoyeur', 'neurologue', 'notaire', 'nourrice', 'nutritionniste'],
      O: ['océanographe', 'oculiste', 'œnologue', 'officier', 'opérateur', 'opératrice', 'ophtalmologue', 'opticien', 'opticienne', 'orfèvre', 'organiste', 'orthodontiste', 'orthophoniste', 'ostéopathe', 'ouvrier', 'ouvrière'],
      P: ['pâtissier', 'pâtissière', 'paysagiste', 'paysan', 'paysanne', 'pêcheur', 'pédiatre', 'peintre', 'pépiniériste', 'pharmacien', 'pharmacienne', 'photographe', 'pianiste', 'pilote', 'plombier', 'plombière', 'podologue', 'poissonnier', 'poissonnière', 'policier', 'policière', 'pompier', 'pompière', 'porteur', 'postier', 'postière', 'potier', 'potière', 'professeur', 'professeure', 'psychiatre', 'psychologue', 'puéricultrice'],
      R: ['radiologue', 'ramoneur', 'réalisateur', 'réalisatrice', 'réceptionniste', 'rédacteur', 'rédactrice', 'relieur', 'reporter', 'restaurateur', 'restauratrice', 'romancier', 'romancière', 'routier'],
      S: ['sage-femme', 'sapeur-pompier', 'savant', 'scénariste', 'sculpteur', 'sculptrice', 'secrétaire', 'sellier', 'serrurier', 'serveur', 'serveuse', 'soigneur', 'soigneuse', 'soldat', 'sommelier', 'sommelière', 'soudeur', 'soudeuse', 'souffleur de verre', 'standardiste', 'stewart', 'styliste'],
      T: ['tailleur', 'tanneur', 'tapissier', 'tatoueur', 'tatoueuse', 'taxidermiste', 'technicien', 'technicienne', 'teinturier', 'téléconseiller', 'testeur', 'tisserand', 'tôlier', 'tonnelier', 'topographe', 'traducteur', 'traductrice', 'traiteur', 'trapéziste', 'trésorier', 'trufficulteur', 'tuteur'],
      V: ['vacher', 'vachère', 'veilleur de nuit', 'vendangeur', 'vendeur', 'vendeuse', 'vétérinaire', 'vidéaste', 'vigneron', 'vigneronne', 'vitrailliste', 'vitrier', 'volcanologue', 'voyagiste']
    },
    { /* Fruit ou légume */
      A: ['abricot', 'ail', 'airelle', 'amande', 'ananas', 'aneth', 'arachide', 'artichaut', 'asperge', 'aubergine', 'avocat'],
      B: ['banane', 'basilic', 'bergamote', 'bette', 'betterave', 'bigarreau', 'blette', 'brocoli', 'brugnon'],
      C: ['cacahuète', 'canneberge', 'carotte', 'cassis', 'céleri', 'cerfeuil', 'cerise', 'champignon', 'châtaigne', 'chou', 'chou de Bruxelles', 'chou-fleur', 'ciboulette', 'citron', 'citron vert', 'citrouille', 'clémentine', 'coing', 'concombre', 'coriandre', 'cornichon', 'courge', 'courgette', 'cresson'],
      D: ['daïkon', 'datte', 'durian'],
      E: ['échalote', 'endive', 'épinard', 'estragon'],
      F: ['fenouil', 'fève', 'figue', 'flageolet', 'fraise', 'framboise', 'fruit de la passion'],
      G: ['gingembre', 'girolle', 'gombo', 'goyave', 'grenade', 'griotte', 'groseille'],
      H: ['haricot', 'haricot vert'],
      I: ['igname'],
      J: ['jujube'],
      L: ['laitue', 'lentille', 'lime', 'litchi'],
      M: ['mâche', 'maïs', 'mandarine', 'mangue', 'marron', 'melon', 'menthe', 'mirabelle', 'morille', 'mûre', 'myrtille'],
      N: ['navet', 'nectarine', 'nèfle', 'noisette', 'noix', 'noix de cajou', 'noix de coco'],
      O: ['oignon', 'olive', 'orange', 'oseille'],
      P: ['pamplemousse', 'panais', 'papaye', 'pastèque', 'patate douce', 'pêche', 'persil', 'petit pois', 'physalis', 'piment', 'pissenlit', 'pistache', 'plantain', 'poire', 'poireau', 'pois chiche', 'poivron', 'pomme', 'pomme de terre', 'potimarron', 'potiron', 'prune', 'pruneau'],
      R: ['radis', 'raisin', 'rhubarbe', 'romarin', 'roquette', 'rutabaga'],
      S: ['salade', 'salsifis', 'sauge', 'scarole', 'soja'],
      T: ['thym', 'tomate', 'topinambour', 'truffe'],
      V: ['vanille', 'verveine']
    },
    { /* Objet */
      A: ['abat-jour', 'agenda', 'agrafeuse', 'aiguille', 'aimant', 'album', 'allumette', 'ampoule', 'ancre', 'anneau', 'appareil photo', 'aquarium', 'ardoise', 'armoire', 'arrosoir', 'ascenseur', 'aspirateur', 'assiette', 'atlas', 'aviron'],
      B: ['bague', 'baignoire', 'balai', 'balance', 'balançoire', 'ballon', 'banc', 'bandeau', 'baril', 'barque', 'barrette', 'bascule', 'bassine', 'bâton', 'batterie', 'béquille', 'berceau', 'bibliothèque', 'bidon', 'bijou', 'billard', 'bille', 'blouson', 'bocal', 'bougie', 'bouilloire', 'boussole', 'bouteille', 'bouton', 'bracelet', 'brosse', 'brouette', 'bureau'],
      C: ['cadenas', 'cadre', 'cafetière', 'cage', 'cahier', 'calculatrice', 'calepin', 'caméra', 'canapé', 'canne', 'carafe', 'carnet', 'cartable', 'carton', 'casque', 'casquette', 'casserole', 'ceinture', 'chaise', 'chandelier', 'chapeau', 'chargeur', 'chariot', 'charrue', 'chaussette', 'chaussure', 'chemise', 'cintre', 'ciseaux', 'clavier', 'clé', 'cloche', 'clou', 'coffre', 'collier', 'commode', 'corde', 'couette', 'coussin', 'couteau', 'couverture', 'crayon', 'cruche', 'cuillère'],
      D: ['dé', 'décapsuleur', 'dentifrice', 'dévidoir', 'diadème', 'dictionnaire', 'disque', 'divan', 'domino', 'dossier', 'douche', 'douille', 'drap', 'drapeau'],
      E: ['écharpe', 'échelle', 'écran', 'écrou', 'édredon', 'élastique', 'enclume', 'entonnoir', 'enveloppe', 'épingle', 'éponge', 'équerre', 'escabeau', 'essoreuse', 'étagère', 'étau', 'éventail', 'évier'],
      F: ['fauteuil', 'fenêtre', 'fer à repasser', 'feutre', 'ficelle', 'filet', 'flacon', 'flûte', 'foulard', 'four', 'fourche', 'fourchette', 'frigo'],
      G: ['gant', 'gaufrier', 'gilet', 'girouette', 'glacière', 'gobelet', 'godet', 'gomme', 'gourde', 'grattoir', 'gril', 'grille-pain', 'guéridon', 'guirlande', 'guitare'],
      H: ['hache', 'hachoir', 'haltère', 'hamac', 'hameçon', 'harmonica', 'harpe', 'hélicoptère', 'horloge', 'hotte', 'housse', 'housse de couette', 'hublot'],
      I: ['igniteur', 'imper', 'imperméable', 'imprimante', 'instrument', 'interrupteur'],
      J: ['jarre', 'jarretière', 'jean', 'jerrican', 'jeton', 'jouet', 'journal', 'joystick', 'jumelles', 'jupe'],
      L: ['lacet', 'laisse', 'lampadaire', 'lampe', 'landau', 'lanterne', 'lavabo', 'lave-linge', 'lave-vaisselle', 'lit', 'livre', 'louche', 'loupe', 'luge', 'lunettes', 'lustre'],
      M: ['machine à coudre', 'machine à laver', 'maillot', 'malle', 'manteau', 'marmite', 'marteau', 'masque', 'matelas', 'médaille', 'mètre', 'meuble', 'micro', 'micro-ondes', 'miroir', 'mixeur', 'montre', 'mouchoir', 'moufle', 'moulin', 'mug'],
      N: ['nappe', 'napperon', 'nécessaire', 'niche', 'nichoir', 'niveau', 'nœud papillon'],
      O: ['ombrelle', 'ordinateur', 'oreiller', 'oreillette', 'orgue', 'outil', 'ouvre-boîte', 'ouvre-bouteille'],
      P: ['paillasson', 'panier', 'pantalon', 'parapluie', 'parasol', 'passoire', 'peigne', 'peinture', 'pelle', 'pendule', 'perceuse', 'pichet', 'pince', 'pinceau', 'pioche', 'placard', 'planche', 'plateau', 'plumeau', 'poêle', 'porte-monnaie', 'portefeuille', 'poubelle', 'poupée', 'pull', 'punaise', 'puzzle', 'pyjama'],
      R: ['rabot', 'radiateur', 'radio', 'rasoir', 'râteau', 'règle', 'réveil', 'rideau', 'robinet', 'robot', 'roue', 'ruban'],
      S: ['sac', 'sac à dos', 'saladier', 'sandale', 'savon', 'seau', 'serpillière', 'serrure', 'serviette', 'siège', 'sifflet', 'stylo', 'sucrier'],
      T: ['table', 'tableau', 'tablier', 'tabouret', 'taille-crayon', 'tambour', 'tapis', 'tasse', 'téléphone', 'télévision', 'tenaille', 'théière', 'thermomètre', 'tire-bouchon', 'tiroir', 'tondeuse', 'torchon', 'tournevis', 'trombone', 'trompette', 'trousse', 'tuyau'],
      V: ['vaisselier', 'valise', 'van', 'vaporisateur', 'vase', 'vélo', 'ventilateur', 'ventouse', 'verre', 'verrou', 'veste', 'violon', 'vis', 'visseuse', 'vitre', 'volet']
    }
  ];

  /* la feuille de l'IA : trous de mémoire (~1 case sur 4) et, très rarement,
     une étourderie de mauvaise lettre — comme sous la pression du chrono */
  function botSheet(letter) {
    var list = [];
    for (var c = 0; c < CATS.length; c++) {
      var pool = BOT_LEX[c][letter] || [];
      var r = Math.random();
      if (!pool.length || r < 0.25) { list.push(''); continue; }
      var word = pool[Math.floor(Math.random() * pool.length)];
      if (r > 0.97) {
        var others = Object.keys(BOT_LEX[c]);
        var autre = others[Math.floor(Math.random() * others.length)];
        if (autre !== letter) word = BOT_LEX[c][autre][0];
      }
      list.push(word);
    }
    return list;
  }

  /* le mot figure-t-il dans le lexique de l'IA pour cette catégorie ? */
  function botConnait(cat, n) {
    var pool = BOT_LEX[cat][n.charAt(0)] || [];
    for (var i = 0; i < pool.length; i++) if (normalize(pool[i]) === n) return true;
    return false;
  }

  /* jugement d'une réponse adverse : le mot doit appartenir au lexique de
     SA catégorie — le dictionnaire général ne prouve pas qu'une « mer » est
     un animal, et le hasard n'a rien à faire dans un arbitrage. Comme un
     joueur humain, l'IA refuse ce qu'elle ne connaît pas. */
  function botJuge(ans, cat) {
    return botConnait(cat, normalize(ans));
  }

  var mod = {
    id: 'bac',
    nom: 'Petit Bac',
    icone: '📝',
    desc: 'Une lettre, 6 catégories, 60 secondes. Les autres valident vos réponses.',
    regles: '<p><strong>🎯 Le but :</strong> pour la lettre tirée au sort, trouver un mot par catégorie (prénom, animal, ville…) en 60 secondes.</p><p><strong>Comment jouer :</strong> écrivez vos réponses avant la fin du chrono. Ensuite, tout le monde vote la validité des réponses des autres !</p><p><strong>Les points :</strong> 10 par mot accepté, 5 si un autre joueur a écrit le même. Mauvaise lettre = refusé automatiquement.</p>',
    min: 2, max: 4,
    hotseat: false, hidden: true, netOnly: true,

    create: function (names) {
      return {
        players: names.map(function (n) { return { name: n, score: 0 }; }),
        round: 0,
        maxRounds: ROUNDS,
        phase: 'intro', // intro → answers → vote → result → (intro…) → fin
        letter: '',
        used: [],
        cats: CATS,
        duration: DURATION,
        answers: {},   // playerIdx -> [6 réponses]
        submitted: [],
        votes: {},     // voterIdx -> {targetIdx: [bool x6]}
        voted: [],
        results: null,
        gains: null,
        finished: false
      };
    },

    turnOf: function () { return -1; }, // tout le monde joue en même temps
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

    /* pendant l'écriture, les réponses des autres restent secrètes */
    redact: function (state, viewer) {
      var copy = GG.clone(state);
      if (copy.phase === 'answers') {
        var mine = copy.answers[viewer];
        copy.answers = {};
        if (mine) copy.answers[viewer] = mine;
      }
      // les votes de chacun restent secrets (seul le décompte final est public)
      var myVote = copy.votes[viewer];
      copy.votes = {};
      if (myVote) copy.votes[viewer] = myVote;
      return copy;
    },

    apply: function (state, player, action) {
      if (state.finished) return { ok: false, error: 'Partie terminée.' };

      if (action.t === 'start') {
        if (player !== 0) return { ok: false, error: 'Seul l’hôte lance la manche.' };
        if (state.phase !== 'intro' && state.phase !== 'result') {
          return { ok: false, error: 'Manche en cours.' };
        }
        if (state.phase === 'result' && state.round >= state.maxRounds) {
          state.finished = true;
          return { ok: true };
        }
        state.round++;
        var avail = LETTERS.split('').filter(function (l) {
          return state.used.indexOf(l) === -1;
        });
        state.letter = avail[Math.floor(Math.random() * avail.length)];
        state.used.push(state.letter);
        state.phase = 'answers';
        state.answers = {};
        state.submitted = state.players.map(function () { return false; });
        state.votes = {};
        state.voted = state.players.map(function () { return false; });
        state.results = null;
        state.gains = null;
        return { ok: true, timer: { ms: state.duration * 1000, action: { t: 'timeUp' } } };
      }

      if (action.t === 'answers') {
        // tolérance : une feuille qui arrive juste après le coup de sifflet
        // est acceptée tant que personne n'a commencé à voter
        var grace = state.phase === 'vote' && !state.submitted[player] &&
          state.voted.every(function (v) { return !v; });
        if (state.phase !== 'answers' && !grace) {
          return { ok: false, error: 'Le temps est écoulé.' };
        }
        var list = Array.isArray(action.list) ? action.list.slice(0, CATS.length) : [];
        state.answers[player] = list.map(function (a) { return String(a || '').slice(0, 30); });
        state.submitted[player] = true;
        if (state.submitted.every(Boolean)) {
          state.phase = 'vote';
        }
        return { ok: true };
      }

      if (action.t === 'timeUp') {
        if (player !== -1) return { ok: false, error: 'Action réservée au chrono.' };
        if (state.phase === 'answers') state.phase = 'vote';
        return { ok: true };
      }

      if (action.t === 'vote') {
        if (state.phase !== 'vote') return { ok: false, error: 'Pas de vote en cours.' };
        if (state.voted[player]) return { ok: false, error: 'Vous avez déjà voté.' };
        state.votes[player] = action.grid || {};
        state.voted[player] = true;
        if (state.voted.every(Boolean)) scoreRound(state);
        return { ok: true };
      }

      if (action.t === 'closeVote') {
        // filet de sécurité : un joueur ne vote pas (téléphone posé…) →
        // l'hôte clôt, les votes manquants valent « tout accepté »
        if (player !== 0) return { ok: false, error: 'Seul l’hôte peut clore le vote.' };
        if (state.phase !== 'vote') return { ok: false, error: 'Pas de vote en cours.' };
        scoreRound(state);
        return { ok: true };
      }

      return { ok: false, error: 'Action inconnue.' };
    },

    /* L'adversaire IA : remplit sa feuille depuis son petit lexique (sans
       jamais regarder celles des autres), puis vote la validité des réponses
       adverses. Il attend pendant les écrans qui appartiennent à l'hôte. */
    bot: function (state, me, ctx) {
      if (state.finished) return null;

      // ma feuille : pendant la manche, ou juste après le coup de sifflet
      // tant que personne n'a voté (la tolérance prévue par apply)
      var grace = state.phase === 'vote' && !state.submitted[me] &&
        state.voted.every(function (v) { return !v; });
      if ((state.phase === 'answers' && !state.submitted[me]) || grace) {
        return { t: 'answers', list: botSheet(state.letter) };
      }

      if (state.phase === 'vote' && !state.voted[me]) {
        // on laisse les feuilles en retard arriver avant de voter (voter
        // trop tôt fermerait la tolérance d'après-sifflet des autres)
        var toutRendu = state.submitted.every(Boolean);
        var voteLance = state.voted.some(Boolean);
        if (!toutRendu && !voteLance) return null;
        var grid = {};
        for (var p = 0; p < state.players.length; p++) {
          if (p === me) continue;
          var row = [];
          for (var c = 0; c < CATS.length; c++) {
            var ans = (state.answers[p] || [])[c] || '';
            if (autoInvalid(state, ans)) continue; // refus automatique, pas de vote
            row[c] = botJuge(ans, c, ctx);
          }
          grid[p] = row;
        }
        return { t: 'vote', grid: grid };
      }

      return null; // intro, résultats, ou rien à faire : on attend
    },

    render: function (el, ctx) {
      var s = ctx.state;
      var me = ctx.me;

      // Pendant la saisie, un rafraîchissement réseau ne doit pas effacer les champs
      if (s.phase === 'answers' && el._bacPhase === 'answers' &&
          !s.submitted[me] && el._bacMineSub === false) {
        return;
      }
      // Idem pendant le vote : mes coches ✔️/✗ ne doivent pas être remises à zéro
      if (s.phase === 'vote' && el._bacPhase === 'vote' && !s.voted[me] &&
          el._bacMineVoted === false) {
        return;
      }
      el._bacPhase = s.phase;
      el._bacMineSub = s.phase === 'answers' ? !!s.submitted[me] : null;
      el._bacMineVoted = s.phase === 'vote' ? !!s.voted[me] : null;

      var html = '';

      if (s.phase === 'intro') {
        html += '<h2 class="mini-center">📝 Petit Bac</h2>' +
          '<p class="mini-msg">Une lettre est tirée au sort, remplissez les 6 catégories en ' +
          s.duration + ' secondes. Les autres joueurs valident ensuite vos réponses.<br>' +
          'Réponse unique : 10 pts · en doublon : 5 pts.</p>';
        if (me === 0) {
          html += '<button class="btn big primary" data-a="start">Lancer la manche 1</button>';
        } else {
          html += '<p class="waiting">⏳ L’hôte va lancer la première manche…</p>';
        }
      } else if (s.phase === 'answers') {
        var sub = s.submitted[me];
        html += '<div class="bac-letter">' + s.letter + '</div>' +
          '<div class="bac-timer" id="bac-timer">' + s.duration + ' s</div>';
        s.cats.forEach(function (cat, c) {
          var val = (s.answers[me] || [])[c] || '';
          html += '<label class="bac-field">' + cat +
            '<input type="text" data-cat="' + c + '" maxlength="30" autocomplete="off" ' +
            'placeholder="' + s.letter + '…" value="' + GG.esc(val) + '"' +
            (sub ? ' disabled' : '') + '></label>';
        });
        html += '<button class="btn big primary" data-a="send"' + (sub ? ' disabled' : '') + '>' +
          (sub ? '⏳ En attente des autres…' : '✔️ J’ai fini !') + '</button>';
      } else if (s.phase === 'vote') {
        html += '<p class="mini-msg">Lettre <strong>' + s.letter +
          '</strong> — validez (ou refusez) les réponses des autres :</p>';
        if (s.voted[me]) {
          html += '<p class="waiting">⏳ En attente des votes des autres…</p>';
          if (me === 0) {
            html += '<button class="btn" data-a="closevote">⏱️ Clore le vote ' +
              '(les votes manquants valent « tout accepté »)</button>';
          }
        } else {
          s.players.forEach(function (p, pi) {
            if (pi === me) return;
            html += '<h3 class="bac-owner">' + GG.esc(p.name) + '</h3>';
            s.cats.forEach(function (cat, c) {
              var ans = (s.answers[pi] || [])[c] || '';
              var bad = autoInvalid(s, ans);
              html += '<div class="bac-vote-row' + (bad ? ' auto-bad' : '') + '">' +
                '<span class="bac-cat">' + cat + '</span>' +
                '<span class="bac-ans">' + (ans ? GG.esc(ans) : '—') + '</span>' +
                (bad ? '<span class="bac-flag">✗ auto</span>'
                     : '<button class="bac-toggle yes" data-p="' + pi + '" data-c="' + c + '">✔️</button>') +
                '</div>';
            });
          });
          html += '<p class="hint">Touchez ✔️ pour refuser une réponse (mot inventé, hors sujet…).</p>' +
            '<button class="btn big primary" data-a="vote">Envoyer mes votes</button>';
        }
      } else if (s.phase === 'result') {
        html += '<p class="mini-msg">Résultats de la manche ' + s.round + ' (lettre ' + s.letter + ') :</p>';
        s.players.forEach(function (p, pi) {
          html += '<h3 class="bac-owner">' + GG.esc(p.name) + ' — +' + s.gains[pi] + ' pts</h3>';
          s.cats.forEach(function (cat, c) {
            var r = (s.results[pi] || [])[c] || { ans: '', pts: 0, why: 'invalide' };
            // dire POURQUOI un mot ne marque pas : sans explication, un refus
            // ressemble à un bug
            var pourquoi = '';
            if (!r.pts && r.ans) {
              pourquoi = r.why === 'invalide' ? 'mauvaise lettre' : 'refusé';
            }
            html += '<div class="bac-vote-row">' +
              '<span class="bac-cat">' + cat + '</span>' +
              '<span class="bac-ans">' + (r.ans ? GG.esc(r.ans) : '—') +
              (pourquoi ? '<em class="bac-why">' + pourquoi + '</em>' : '') + '</span>' +
              '<span class="bac-flag">' + (r.pts ? '+' + r.pts : '✗') +
              (r.why === 'doublon' ? '<em class="bac-why">même mot</em>' : '') + '</span></div>';
          });
        });
        if (me === 0) {
          html += '<button class="btn big primary" data-a="start">' +
            (s.round >= s.maxRounds ? 'Voir le classement final' : 'Manche suivante') + '</button>';
        } else {
          html += '<p class="waiting">⏳ L’hôte va lancer la suite…</p>';
        }
      }

      el.innerHTML = html;

      var start = el.querySelector('[data-a="start"]');
      if (start) start.addEventListener('click', function () { ctx.act({ t: 'start' }); });

      var send = el.querySelector('[data-a="send"]');
      if (send) send.addEventListener('click', function () {
        var list = [];
        el.querySelectorAll('input[data-cat]').forEach(function (inp) {
          list[parseInt(inp.dataset.cat, 10)] = inp.value;
        });
        ctx.act({ t: 'answers', list: list });
      });

      el.querySelectorAll('.bac-toggle').forEach(function (b) {
        b.addEventListener('click', function () {
          b.classList.toggle('yes');
          b.classList.toggle('no');
          b.textContent = b.classList.contains('yes') ? '✔️' : '✗';
        });
      });
      var cv = el.querySelector('[data-a="closevote"]');
      if (cv) cv.addEventListener('click', function () { ctx.act({ t: 'closeVote' }); });
      var vote = el.querySelector('[data-a="vote"]');
      if (vote) vote.addEventListener('click', function () {
        var grid = {};
        el.querySelectorAll('.bac-toggle').forEach(function (b) {
          var pi = b.dataset.p, c = parseInt(b.dataset.c, 10);
          if (!grid[pi]) grid[pi] = [];
          grid[pi][c] = b.classList.contains('yes');
        });
        ctx.act({ t: 'vote', grid: grid });
      });

      // compte à rebours local (informatif : la coupure officielle vient de l'hôte)
      if (s.phase === 'answers' && !s.submitted[me]) {
        var timerEl = el.querySelector('#bac-timer');
        if (timerEl && !el._bacTimer) {
          var left = s.duration;
          el._bacTimer = setInterval(function () {
            left--;
            if (left <= 1 && document.body.contains(timerEl)) {
              // le temps est écoulé : on envoie ce qui est écrit, rien ne se perd
              var sendBtn = el.querySelector('[data-a="send"]');
              if (sendBtn && !sendBtn.disabled) sendBtn.click();
            }
            if (left <= 0 || !document.body.contains(timerEl)) {
              clearInterval(el._bacTimer);
              el._bacTimer = null;
              return;
            }
            timerEl.textContent = left + ' s';
            if (left <= 10) timerEl.classList.add('urgent');
          }, 1000);
        }
      }
    },

    _botJuge: botJuge,
    _botSheet: botSheet,
    _BOT_LEX: BOT_LEX
  };

  GG.register(mod);
  if (typeof module === 'object' && module.exports) module.exports = mod;
})(typeof self !== 'undefined' ? self : globalThis);
