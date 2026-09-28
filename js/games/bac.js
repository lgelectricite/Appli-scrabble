/* GGgames — Petit Bac (2 à 4 joueurs).
 * Une lettre tirée à la roue, des catégories au choix (21 proposées), un
 * minuteur circulaire. Trois façons de jouer :
 *   - un téléphone chacun (réseau) : tout le monde écrit en même temps,
 *     puis chacun vérifie les réponses des autres ;
 *   - sur un seul téléphone : chacun écrit à son tour (lettre révélée pour
 *     lui seul), puis la table corrige ensemble ;
 *   - seul contre l'ordinateur (l'IA écrit et juge avec son lexique ; un
 *     refus de l'IA se conteste).
 * Arbitrage équitable : un mot connu du lexique de la catégorie ne peut pas
 * être refusé ; un mot inconnu est jugé à la majorité (égalité = accepté).
 * La saisie est tolérante : accents, majuscules, tirets, espaces, articles,
 * pluriels (et féminins pour les métiers, animaux, couleurs, qualités).
 * Tout ce qui vient de l'état passe par GG.esc (l'hôte peut être malveillant). */
(function (root) {
  'use strict';
  var GG = root.GG;

  var LETTERS = 'ABCDEFGHIJLMNOPRSTV'; // lettres jouables (pas de K, Q, U, W, X, Y, Z)
  var ROUNDS = 4;
  var DURATION = 60; // secondes
  var DUREES = [45, 60, 90, 120];
  var MANCHES = [3, 4, 5, 6, 8];
  var MIN_CATS = 3, MAX_CATS = 10;

  /* ---------------- les catégories ---------------- */
  var CATEGORIES = [
    { id: 'prenom', nom: 'Prénom', ic: '🧑', src: ['prenom'] },
    { id: 'animal', nom: 'Animal', ic: '🐾', src: ['animal'], fem: true },
    { id: 'ville', nom: 'Ville ou pays', ic: '🌍', src: ['pays', 'capitale', 'villefr', 'villemonde'] },
    { id: 'metier', nom: 'Métier', ic: '🛠️', src: ['metier'], fem: true },
    { id: 'fruit', nom: 'Fruit ou légume', ic: '🍎', src: ['fruit'] },
    { id: 'objet', nom: 'Objet', ic: '🧸', src: ['objet', 'vetement', 'instrument'] },
    { id: 'pays', nom: 'Pays', ic: '🗺️', src: ['pays'] },
    { id: 'capitale', nom: 'Capitale', ic: '🏛️', src: ['capitale'] },
    { id: 'villefr', nom: 'Ville de France', ic: '🥖', src: ['villefr'] },
    { id: 'couleur', nom: 'Couleur', ic: '🎨', src: ['couleur'], fem: true },
    { id: 'sport', nom: 'Sport', ic: '⚽', src: ['sport'] },
    { id: 'plat', nom: 'Plat ou aliment', ic: '🍝', src: ['plat', 'fruit'] },
    { id: 'plante', nom: 'Fleur ou plante', ic: '🌷', src: ['plante'] },
    { id: 'instrument', nom: 'Instrument de musique', ic: '🎸', src: ['instrument'] },
    { id: 'vetement', nom: 'Vêtement ou accessoire', ic: '👕', src: ['vetement'] },
    { id: 'corps', nom: 'Partie du corps', ic: '💪', src: ['corps'] },
    { id: 'transport', nom: 'Moyen de transport', ic: '🚲', src: ['transport'] },
    { id: 'boisson', nom: 'Boisson', ic: '🥤', src: ['boisson'] },
    { id: 'jeu', nom: 'Jeu ou jouet', ic: '🎲', src: ['jeu'] },
    { id: 'adjectif', nom: 'Qualité ou défaut', ic: '😇', src: ['adjectif'], fem: true },
    { id: 'celebrite', nom: 'Personnage célèbre', ic: '⭐', src: ['celebrite'], ouverte: true },
    { id: 'fiction', nom: 'Héros de fiction', ic: '🦸', src: ['fiction'], ouverte: true }
  ];
  var PAR_ID = {};
  CATEGORIES.forEach(function (c) { PAR_ID[c.id] = c; });
  var DEFAUT = ['prenom', 'animal', 'ville', 'metier', 'fruit', 'objet'];
  var PRESETS = [
    { id: 'classique', nom: 'Classique', cats: DEFAUT },
    { id: 'voyage', nom: 'Voyage', cats: ['pays', 'capitale', 'villefr', 'transport', 'plat', 'boisson'] },
    { id: 'nature', nom: 'Nature', cats: ['animal', 'plante', 'fruit', 'couleur', 'pays', 'corps'] },
    { id: 'gourmand', nom: 'Gourmand', cats: ['fruit', 'plat', 'boisson', 'plante', 'animal', 'pays'] },
    { id: 'culture', nom: 'Culture', cats: ['celebrite', 'fiction', 'instrument', 'sport', 'jeu', 'capitale'] },
    { id: 'famille', nom: 'En famille', cats: ['prenom', 'animal', 'couleur', 'fruit', 'jeu', 'vetement', 'sport'] }
  ];
  function cat(id) { return PAR_ID.hasOwnProperty(id) ? PAR_ID[id] : null; }
  /* catégories de la partie (une vieille sauvegarde n'a que les noms) */
  function catIds(state) {
    if (Array.isArray(state.catIds) && state.catIds.length) return state.catIds;
    return DEFAUT.slice(0, (state.cats || DEFAUT).length);
  }

  /* ---------------- une saisie tolérante ---------------- */
  /* majuscules, sans accents, séparateurs (tirets, apostrophes, points) → espaces */
  function espace(s) {
    s = String(s == null ? '' : s).toUpperCase().replace(/Œ/g, 'OE').replace(/Æ/g, 'AE');
    if (s.normalize) s = s.normalize('NFD');
    s = s.replace(/[̀-ͯ]/g, '');
    return s.replace(/[’'`´\-\.\s_\/]+/g, ' ').replace(/^[^A-Z0-9]+/, '').trim();
  }
  /* « Le Havre », « la Rochelle », « l’Écosse », « St-Malo » */
  function sansArticle(s) {
    return s.replace(/^DE LA /, '').replace(/^(LE|LA|LES|L|UN|UNE|DES|DU|D) /, '')
      .replace(/^STE /, 'SAINTE ').replace(/^ST /, 'SAINT ');
  }
  function cle(s) { return sansArticle(espace(s)).replace(/ /g, ''); }
  /* ancienne normalisation (conservée pour les tests et l'affichage de la lettre) */
  function normalize(s) { return espace(s).replace(/ /g, ''); }

  /* la réponse commence-t-elle par la lettre ? (article ignoré : « Le Havre » vaut pour H et L) */
  function bonneLettre(ans, L) {
    var e = espace(ans);
    if (!e) return false;
    return e.charAt(0) === L || sansArticle(e).charAt(0) === L;
  }
  function autoInvalid(state, answer) {
    return !bonneLettre(answer, state.letter) || cle(answer).length < 2;
  }

  /* formes d'un mot : pluriels, et féminins pour les catégories qui en ont */
  function formesMot(w, fem) {
    var f = [w];
    function add(x) { if (x && x.length >= 2 && f.indexOf(x) === -1) f.push(x); }
    if (/EAUX$/.test(w)) add(w.slice(0, -1));
    if (/AUX$/.test(w)) add(w.slice(0, -3) + 'AL');
    if (/[SX]$/.test(w) && w.length > 3) add(w.slice(0, -1));
    if (fem) {
      f.slice().forEach(function (x) {
        if (/EUSE$/.test(x)) { add(x.slice(0, -4) + 'EUR'); add(x.slice(0, -4) + 'EUX'); }
        if (/RICE$/.test(x)) add(x.slice(0, -4) + 'EUR');
        if (/ERE$/.test(x)) add(x.slice(0, -3) + 'ER');
        if (/(ENNE|ONNE|ETTE|ELLE)$/.test(x)) add(x.slice(0, -2));
        if (/IVE$/.test(x)) add(x.slice(0, -3) + 'IF');
        if (/ESSE$/.test(x)) add(x.slice(0, -3));
        if (/CHE$/.test(x)) add(x.slice(0, -2));
        if (/E$/.test(x)) add(x.slice(0, -1));
      });
    }
    return f;
  }
  function variantes(ans, fem) {
    var mots = sansArticle(espace(ans)).split(' ').filter(Boolean);
    if (!mots.length) return [];
    if (mots.length > 5) return [mots.join('')];
    var res = [''];
    mots.forEach(function (w) {
      var n = [];
      var fo = formesMot(w, fem);
      res.forEach(function (r) { fo.forEach(function (x) { if (n.length < 256) n.push(r + x); }); });
      res = n;
    });
    return res;
  }

  /* ---------------- le lexique ---------------- */
  /* LEXIQUE-DEBUT — généré puis relu à la main ; une entrée par virgule.
     Les apostrophes sont typographiques (’). */
  var LEX_SOURCES = {
    prenom: 'Aaron,Abby,Abdel,Abdallah,Abdelkader,Abderrahmane,Abdou,Abdoulaye,Abel,Abigaël,Abigaïl,Abraham,Achille,Ada,Adam,Adama,Adel,Adèle,Adélaïde,Adelina,Adeline,Adélie,Adem,Adil,Adina,Adnan,Adolphe,Adrian,Adriana,Adrien,Adrienne,Agathe,Aglaé,Agnès,Ahmed,Aïcha,Aida,Aimé,Aimée,Aïssa,Aïssatou,Aksel,Alain,Alan,Alba,Alban,Albane,Albert,Alberte,Albin,Aldo,Alec,Alejandro,Alessandro,Alessia,Alex,Alexandra,Alexandre,Alexandrine,Alexane,Alexia,Alexis,Alfred,Ali,Alia,Alice,Alicia,Alida,Aliénor,Alima,Alina,Aline,Alison,Alix,Allan,Alma,Aloïs,Alphonse,Alphonsine,Alric,Alvin,Alya,Alycia,Alyssa,Amaël,Amalia,Amanda,Amandine,Amaury,Ambre,Ambroise,Amédée,Amel,Amélia,Amélie,Amina,Aminata,Amine,Amir,Amira,Amos,Amy,Anaé,Anaël,Anaëlle,Anaïs,Anas,Anastasia,Anatole,Andréa,André,Andrée,Andy,Ange,Angèle,Angéla,Angelina,Angélique,Angelo,Anissa,Anna,Annabelle,Anne,Anne-Laure,Anne-Marie,Anne-Sophie,Annette,Annick,Annie,Anouk,Anselme,Anthony,Antoine,Antoinette,Antonin,Antonio,Anya,Apolline,Arabelle,Aram,Archibald,Ariane,Arielle,Aristide,Arlette,Armand,Armel,Armelle,Arnaud,Arno,Arsène,Arthur,Arturo,Asma,Assia,Assya,Astrid,Athénaïs,Aubin,Aude,Audrey,Augustin,Auguste,Augustine,Aurèle,Aurélia,Aurélie,Aurore,Axel,Axelle,Aya,Ayden,Ayline,Ayoub,Aziz,Azilis,Aymeric,Aymen,Anouck,Albertine,Alexina,Aloïse,Amalric,Amandin,Annaëlle,Antonine,Apollinaire,Ariel,Aristote,Armance,Arthus,Athéna,Baptiste,Barbara,Barnabé,Barthélemy,Basile,Bastien,Bathilde,Baudouin,Béatrice,Beatriz,Bella,Belinda,Ben,Benjamin,Benoît,Benoîte,Bérangère,Bérénice,Bernadette,Bernard,Bertille,Berthe,Bertrand,Betty,Bianca,Bilal,Blaise,Blanche,Blandine,Bob,Bonnie,Boris,Brahim,Brandon,Brenda,Brice,Brigitte,Bruno,Bryan,Brune,Benedict,Bénédicte,Benoist,Béranger,Bernardin,Bertin,Bettina,Brieuc,Brigitta,Benicio,Bakary,Boubacar,Brian,Brendan,Bella-Rose,Bleuenn,Bartholomé,Balthazar,Baya,Cameron,Camil,Camille,Candice,Capucine,Carine,Carl,Carla,Carlos,Carmen,Carole,Caroline,Casimir,Cassandra,Cassandre,Cassie,Catherine,Cécile,Cécilia,Cédric,Céleste,Célestin,Célestine,Célia,Céline,Célian,César,Chahine,Chaïma,Chantal,Charlène,Charles,Charlie,Charline,Charlotte,Chayma,Chloé,Chris,Christelle,Christian,Christiane,Christine,Christophe,Cindy,Claire,Clara,Clarisse,Claude,Claudette,Claudia,Claudine,Claudio,Clémence,Clément,Clémentine,Cléo,Cléophée,Clotilde,Clovis,Colette,Colin,Coline,Constance,Constant,Constantin,Cora,Coralie,Corentin,Corinne,Cosette,Côme,Cynthia,Cyprien,Cyril,Cyrielle,Cyrille,Calista,Calixte,Callie,Candide,Carmela,Caryl,Catalina,Cathy,Cécil,Célina,Césarine,Chahid,Charly,Chiara,Christa,Claudius,Clélia,Clervie,Clodomir,Colombe,Cristina,Curtis,Cyriaque,Cheikh,Chérif,Cornélia,Cunégonde,Dahlia,Daisy,Dalia,Damien,Dan,Dana,Daniel,Daniela,Danièle,Danielle,Dany,Daphné,Dario,Darius,David,Davina,Déborah,Delphine,Denis,Denise,Désiré,Désirée,Diana,Diane,Didier,Diego,Dimitri,Dina,Dinah,Djamel,Djibril,Dolorès,Dominique,Donatien,Dora,Dorian,Doriane,Doris,Dorothée,Dounia,Driss,Dylan,Dalila,Damiano,Daria,Dave,Davy,Déa,Delia,Delphin,Denys,Derek,Diallo,Djena,Domitille,Donald,Donovan,Doria,Douglas,Duncan,Daouda,Demba,Dalil,Daryl,Deniz,Dolly,Djeneba,Eden,Edgar,Édith,Edmond,Édouard,Edwige,Edwin,Éléa,Éléanore,Éléonore,Elena,Eli,Élia,Éliane,Élias,Élie,Élina,Éline,Élisa,Élisabeth,Élise,Élisée,Elissa,Ella,Elliot,Ellie,Elma,Élodie,Éloi,Éloïse,Elsa,Elvire,Elyas,Elyes,Émeline,Émile,Émilie,Émilien,Émilienne,Emma,Emmanuel,Emmanuelle,Emmy,Enola,Enzo,Éric,Erica,Erwan,Ernest,Ernestine,Esmée,Esteban,Estelle,Esther,Ethan,Étienne,Eugène,Eugénie,Eulalie,Eva,Ève,Évan,Évelyne,Ewen,Ezio,Edmée,Eléonor,Elian,Eliott,Éliot,Élisabeth-Marie,Elsie,Elyna,Émerance,Emir,Emrys,Enora,Ephraïm,Erika,Ernesto,Erwann,Estée,Étiennette,Eudes,Eusèbe,Évangéline,Ezra,Ella-Rose,Eliana,Eliette,Emna,Esra,Evie,Fabien,Fabienne,Fabio,Fabrice,Fadi,Fanny,Fantine,Farah,Farid,Farida,Fatiha,Fatima,Fatou,Fatoumata,Faustine,Félicie,Félicien,Félicité,Félix,Ferdinand,Fernand,Fernande,Fernando,Fiona,Firmin,Flavie,Flavien,Fleur,Flora,Flore,Florence,Florent,Florian,Floriane,Francis,Francine,Franck,François,Françoise,Frank,Frédéric,Frédérique,Freddy,Fabiola,Fadila,Fady,Fanchon,Fanette,Fantin,Fausto,Faustin,Fayçal,Féline,Fidèle,Filipe,Flavio,Florestan,Floriant,Fortuné,Foucauld,Fulbert,Fulgence,Fanta,Fodé,Farès,Fouad,Faouzi,Fella,Fleurine,Gabin,Gabriel,Gabriella,Gabrielle,Gaël,Gaëlle,Gaétan,Gaspard,Gaston,Gautier,Gauthier,Geneviève,Geoffrey,Geoffroy,Georges,Georgette,Gérald,Géraldine,Gérard,Géraud,Germain,Germaine,Gervais,Ghislain,Ghislaine,Gilbert,Gilberte,Gilles,Gina,Ginette,Giovanni,Gisèle,Giulia,Gladys,Gloria,Godefroy,Gonzague,Grace,Grégoire,Grégory,Guénolé,Guillaume,Gustave,Guy,Guylaine,Gwen,Gwenaël,Gwenaëlle,Gwendal,Gwendoline,Gabriela,Gaïa,Galaad,Garance,Gary,Gaspar,Gauvain,Gédéon,Gemma,George,Georgia,Georgina,Gérôme,Gianni,Gilda,Giorgio,Giuseppe,Giselle,Glenn,Gontran,Gorka,Gratien,Greta,Guenièvre,Guilhem,Guillemette,Gwenn,Gwladys,Goulven,Gabi,Guewen,Habib,Hadrien,Hafsa,Hajar,Hakim,Halima,Hamid,Hamza,Hana,Hanaé,Hannah,Hanna,Hans,Harold,Harry,Hassan,Hector,Hedi,Héléna,Hélène,Héloïse,Henri,Henriette,Herbert,Hermine,Hervé,Hicham,Hilaire,Hilda,Hind,Hippolyte,Honoré,Honorine,Horace,Hortense,Houssam,Hubert,Hugo,Hugues,Huguette,Hyacinthe,Hadja,Hadriel,Haïfa,Haroun,Hatice,Hayden,Heïdi,Hélia,Héliot,Henry,Hermann,Hernan,Hiba,Hilary,Hilarion,Honor,Houria,Humbert,Hanane,Hamidou,Hawa,Haby,Ibrahim,Ida,Idriss,Ignace,Igor,Ilan,Ilana,Ilian,Iliana,Ilias,Ilona,Ilyana,Ilyes,Imane,Imen,Imène,Inaya,Inès,Ingrid,Iris,Irène,Irina,Irma,Isaac,Isabeau,Isabella,Isabelle,Isaure,Isée,Isidore,Isis,Islem,Ismaël,Ivan,Ivana,Ivy,Iyad,Izia,Idris,Ilham,Ilyas,Inaïa,Indira,Indra,Iona,Irénée,Irvin,Isa,Isaïe,Isalyne,Ismérie,Ivo,Ivanna,Imrane,Iman,Jacinthe,Jack,Jackie,Jacky,Jacob,Jacqueline,Jacques,Jade,Jalil,Jamal,James,Jamila,Jane,Janine,Jason,Jasmine,Jawad,Jean,Jean-Baptiste,Jean-Charles,Jean-Claude,Jean-François,Jean-Jacques,Jean-Louis,Jean-Luc,Jean-Marc,Jean-Marie,Jean-Michel,Jean-Paul,Jean-Pierre,Jean-Philippe,Jean-Yves,Jeanne,Jeannette,Jeannine,Jenna,Jennifer,Jenny,Jérémie,Jérémy,Jérôme,Jessica,Jessy,Jim,Jimmy,Joachim,Joan,Joana,Joanna,Joaquim,Jocelyn,Jocelyne,Joé,Joël,Joëlle,Johan,Johanna,John,Johnny,Jonas,Jonathan,Jordan,José,Josée,Joseph,Joséphine,Josette,Josiane,Josué,Jules,Julia,Julian,Juliane,Julie,Julien,Julienne,Juliette,Julius,Juna,Juste,Justin,Justine,Jade-Rose,Jalal,Jamel,Janelle,Janet,Jannick,Jasper,Javier,Jawed,Jayden,Jeanine,Jeff,Jennie,Jessie,Joanne,Jodie,Joey,Jordy,Jorge,Josépha,Josie,Jovan,Joy,Joyce,Judith,Judy,Juan,Jude,Jules-Henri,Juliana,Julio,Jaden,Jacinta,Jana,Jehanne,Joris,Laetitia,Lalie,Lambert,Lana,Lara,Larissa,Laure,Laura,Laureen,Laurence,Laurent,Laurine,Lazare,Léa,Léandre,Léane,Léana,Léna,Léni,Lenny,Léo,Léon,Léonard,Léonce,Léone,Léonie,Léonor,Léontine,Léopold,Léopoldine,Leslie,Lila,Lilas,Lili,Lilian,Liliane,Lilly,Lily,Lilou,Lina,Linda,Lindsay,Line,Lino,Lionel,Lisa,Lise,Lisette,Livia,Liya,Logan,Loïc,Loïs,Lola,Lorenzo,Loris,Lorraine,Lou,Louane,Louanne,Louis,Louisa,Louise,Louison,Louna,Loup,Luc,Luca,Lucas,Lucette,Luce,Lucia,Lucie,Lucien,Lucienne,Lucile,Lucille,Lucy,Ludivine,Ludovic,Luigi,Luis,Luka,Lukas,Luna,Lyam,Lydia,Lydie,Lyna,Lynda,Lysandre,Lahcen,Laïla,Layla,Leïla,Lamia,Lancelot,Laszlo,Laurianne,Lauriane,Laurie,Lazhar,Léane-Rose,Lélia,Lenaïg,Léocadie,Léonel,Léonardo,Lester,Lia,Liam,Liana,Lidia,Lilia,Lilwenn,Lior,Lisandro,Liv,Liza,Loane,Loëva,Loïse,Lorène,Lorna,Lotfi,Loula,Lounès,Lubin,Lucas-Emmanuel,Ludmila,Lylou,Lysa,Lyséa,Madeleine,Madeline,Madison,Maé,Maël,Maëlle,Maëlys,Maëva,Magali,Magalie,Maggie,Mahé,Mahaut,Maïa,Maïlys,Maïwenn,Malak,Malek,Malik,Malika,Malo,Malone,Mamadou,Manel,Manon,Manuel,Manuela,Marc,Marceau,Marcel,Marcelle,Marcelin,Marco,Margaux,Margot,Marguerite,Maria,Mariam,Mariama,Marianne,Marie,Marie-Claire,Marie-Claude,Marie-France,Marie-Hélène,Marie-José,Marie-Laure,Marie-Pierre,Marie-Thérèse,Marielle,Marina,Marine,Mario,Marion,Marius,Marjolaine,Marjorie,Marlène,Marthe,Martial,Martin,Martine,Marwa,Marwan,Maryam,Maryline,Maryse,Mateo,Mathéo,Mathias,Mathieu,Mathilde,Mathis,Matis,Matthieu,Maud,Maurice,Mauricette,Max,Maxence,Maxime,Maximilien,Maya,Mayssa,Médéric,Mehdi,Mélanie,Mélina,Méline,Mélissa,Mélodie,Melvin,Mercedes,Mia,Michaël,Michel,Michèle,Micheline,Mickaël,Milan,Milo,Mila,Mina,Mireille,Mohamed,Mohammed,Moïse,Mona,Monique,Morgan,Morgane,Mounir,Muriel,Murielle,Myriam,Mylène,Madelon,Madjid,Maëlan,Magdalena,Magdeleine,Mahdi,Mahmoud,Maïssa,Maïté,Maja,Malia,Malvina,Mandy,Manoël,Marcellin,Marcia,Margareth,Margerie,Mariana,Marilou,Marilyn,Marin,Marisa,Marjane,Marla,Marley,Marouane,Martha,Marvin,Maryvonne,Matthias,Maurine,Maxens,Maxine,Mayeul,Méghane,Mégane,Melchior,Mélusine,Mérédith,Mériem,Meryem,Micha,Michelle,Milla,Mirko,Mohand,Moana,Modeste,Monica,Morane,Mustapha,Myla,Mylan,Mahamadou,Moussa,Mariette,Maryam-Lou,Nabil,Nadège,Nadia,Nadine,Nahel,Naïla,Naïm,Naïma,Najat,Nancy,Naomi,Naomie,Nassim,Natacha,Nathalie,Nathan,Nathanaël,Nawel,Naël,Nell,Nelly,Nelson,Némo,Nestor,Nicolas,Nicole,Nils,Nina,Ninon,Nino,Noa,Noah,Noam,Noé,Noël,Noëlle,Noémie,Nolan,Nora,Norbert,Norah,Norma,Nour,Nuno,Nadir,Nadim,Nahia,Naïs,Nala,Nans,Naomé,Narcisse,Nassira,Natalia,Nathalène,Nawal,Nazim,Néo,Nesrine,Nicolette,Nicodème,Niels,Nikita,Nikola,Nils-Erik,Nine,Nisrine,Noah-Lou,Noélie,Noélia,Noëline,Nolhan,Norine,Nouria,Numa,Nadjib,Nahia-Lou,Nesta,Neil,Océane,Octave,Octavie,Odette,Odile,Olga,Olive,Oliver,Olivia,Olivier,Omar,Ombeline,Ophélie,Orane,Orlane,Orphée,Oscar,Oswald,Othman,Othmane,Otto,Oumar,Ouriel,Ousmane,Owen,Octavia,Odélia,Odilon,Olympe,Oona,Orélie,Orianne,Oriane,Orion,Orlando,Ornella,Oriol,Osvaldo,Oubaïda,Oumou,Oyana,Ozanne,Olivio,Olympia,Onésime,Ondine,Opale,Pablo,Paco,Paloma,Pamela,Paola,Paolo,Pascal,Pascale,Pascaline,Patrice,Patricia,Patrick,Paul,Paule,Paulette,Paulin,Pauline,Pedro,Pénélope,Perle,Perrine,Philémon,Philibert,Philippe,Philippine,Pierre,Pierre-Louis,Pierrette,Pierrick,Placide,Pol,Pierrot,Prisca,Priscille,Priscilla,Prosper,Prudence,Prune,Pacôme,Paquita,Patrizia,Paul-Émile,Paul-Henri,Paulina,Paulo,Peggy,Perceval,Peter,Pétronille,Phébé,Philomène,Pia,Pierre-Yves,Pietro,Pilar,Pio,Plume,Pomme,Primerose,Priam,Priscila,Prosperine,Rachel,Rachid,Rafael,Raphaël,Raphaëlle,Raïssa,Ramon,Rania,Raoul,Rayan,Raymond,Raymonde,Rebecca,Régine,Régis,Rémi,Rémy,Renan,Renaud,René,Renée,Richard,Rita,Robert,Roberte,Roberto,Robin,Rodolphe,Rodrigue,Roger,Roland,Rolande,Romain,Romane,Roméo,Romy,Ronan,Rosalie,Rosa,Rose,Roseline,Rosine,Roxane,Ruben,Rudy,Ruth,Ryan,Rahma,Rami,Randy,Raphaël-Marie,Reda,Rémo,Renata,Reine,Rhéa,Ricardo,Riad,Rim,Rima,Rinaldo,Rivka,Robinson,Rocco,Rodrigo,Rolf,Romaric,Romuald,Ronald,Rosemarie,Rosemonde,Rosette,Rosita,Rudolph,Rufus,Rustin,Rym,Rébecca-Lou,Sabine,Sabrina,Sacha,Safia,Safiya,Salim,Salma,Salomé,Salomon,Sami,Samia,Samir,Samira,Samson,Samuel,Samy,Sandra,Sandrine,Sara,Sarah,Scarlett,Sébastien,Selena,Selma,Séraphin,Séraphine,Serena,Serge,Sergio,Séverine,Sidonie,Siham,Simon,Simone,Sixtine,Sofia,Sofiane,Solal,Solange,Solène,Soline,Sonia,Sophia,Sophie,Soraya,Stanislas,Stella,Stéphane,Stéphanie,Steve,Steven,Suzanne,Suzette,Sven,Sylvain,Sylvaine,Sylvestre,Sylvie,Sylviane,Sabri,Sadio,Saïd,Saïda,Salah,Salem,Salvador,Salvatore,Sami-Lou,Samanta,Samantha,Sana,Sandro,Santiago,Saturnin,Saul,Savannah,Séverin,Shana,Shirley,Siméon,Sirine,Soan,Soën,Sohan,Sonny,Sophiane,Souleymane,Stan,Stéphan,Sybille,Sydney,Syrine,Sélim,Sekou,Siaka,Sidi,Sofian,Sabra,Tamara,Tancrède,Tanguy,Tania,Tatiana,Teddy,Tessa,Thaïs,Théa,Théo,Théodora,Théodore,Théophile,Thérèse,Thibault,Thibaut,Thierry,Thomas,Tiago,Tiffany,Timéo,Timothée,Titouan,Tobias,Tom,Tommy,Toni,Tony,Tristan,Typhaine,Tahar,Taïna,Talia,Tallulah,Tanya,Tarek,Tarik,Taylor,Téo,Térence,Théodose,Théotime,Thiago,Thibaud,Tiana,Tilio,Timothy,Tina,Tino,Titus,Toinette,Tomas,Tony-Lou,Toussaint,Tristane,Tyméo,Tyron,Tatiana-Rose,Tahina,Tidiane,Valentin,Valentine,Valère,Valéria,Valérie,Valéry,Vanessa,Vasco,Véra,Victoire,Victor,Victoria,Victorine,Vincent,Viola,Violaine,Violette,Virgile,Virginie,Vivian,Viviane,Vivien,Vivienne,Vladimir,Valérian,Valérien,Vadim,Valdo,Valentina,Valmont,Vanille,Vanina,Vassili,Venceslas,Véronique,Vianney,Victoriane,Vinciane,Virginia,Vito,Vittoria,Vivianne,Vianey,Violetta,Valmy,Kevin,Karim,Kylian,Killian,Kenza,Kenzo,Kiara,Katia,Karine,Kelly,Kim,Kyllian,Kamel,Kader,Karl,Katell,Kaïs,Khadija,Kilian,Kylie,Ulysse,Ugo,Uriel,Ursule,Ulrich,Urbain,William,Wendy,Wassim,Walid,Warren,Wilfried,Wilhelmine,Wanda,Yanis,Yasmine,Yann,Yannick,Yohan,Yves,Yvette,Yvonne,Yasmina,Youssef,Yacine,Yassine,Yaël,Yolande,Youna,Ysaline,Yuna,Yohann,Yvan,Zoé,Zacharie,Zinédine,Zélie,Zakaria,Zaïd,Zina,Zineb,Zohra,Zyad,Xavier,Xavière,Xénia,Quentin,Quitterie,Abdelaziz,Abdelhak,Abdelkrim,Abdellah,Abdelmalek,Aboubakar,Achraf,Adelin,Aden,Adonis,Adriel,Agnan,Ahmad,Aimée-Rose,Ainhoa,Akim,Aladin,Alaïa,Alassane,Albéric,Alcide,Aldric,Alessio,Alexandro,Alfonso,Alfreda,Aliya,Alizée,Allegra,Alphée,Amadou,Amalya,Amandio,Amani,Amara,Amaya,Ambrine,Amédine,Amin,Amjad,Anabelle,Anastase,Andoni,Andreï,Anes,Angelica,Anicet,Anis,Anne-Claire,Anne-Lise,Annie-Claude,Anouchka,Anselm,Antonia,Aramis,Arbi,Archie,Arian,Ariana,Arié,Arlène,Armando,Armandine,Arnold,Arold,Artus,Aslan,Asmaa,Asher,Assane,Assil,Athanase,Aubane,Aubert,Audren,Augusta,Auriane,Ava,Avril,Awa,Aylan,Ayman,Aymane,Aziliz,Azza,Anne-Charlotte,Anne-Cécile,Anne-Gaëlle,Ange-Marie,Babette,Bachir,Baptistin,Basil,Bastian,Baudoin,Bayane,Belkacem,Bérenger,Bernadin,Berthilde,Bertrande,Betsy,Bilel,Billie,Birgit,Blanca,Bonaventure,Boniface,Bruna,Brunehilde,Bryce,Burak,Byron,Boualem,Badis,Bahia,Benjamine,Beverly,Bouchra,Bruce,Calogero,Calvin,Camélia,Candy,Cannelle,Carolina,Cassiopée,Castille,Césaire,Chanel,Chantelle,Chérine,Chloé-Rose,Christel,Christy,Cirilo,Clarence,Clea,Clémentin,Cléophas,Clothilde,Constantine,Corentine,Cornélie,Cosme,Cyprienne,Cyrine,Carmelo,Carole-Anne,Cédrine,Chantale,Chérifa,Claudy,Corinna,Cyrian,Dalhia,Damiana,Dania,Danilo,Daphnée,Dariusz,David-Emmanuel,Dayan,Delphina,Démétrius,Déodat,Diamant,Dieudonné,Dimitra,Dino,Diogo,Djamila,Djenna,Domenico,Dominik,Donatella,Donia,Dorine,Dorothy,Dunia,Dyana,Dahbia,Dalya,Daniella,Desmond,Dilan,Doha,Dominika,Dylane,Eddy,Edgard,Édouardine,Egon,Elaïa,Eleanor,Élianne,Élie-Paul,Élijah,Eliora,Elize,Ellen,Elliott,Éloane,Éloan,Élona,Elouan,Éloïne,Elsa-Rose,Elvis,Elya,Elyne,Émeric,Émerick,Émilia,Émilio,Emmie,Eneko,Enguerrand,Enoha,Ercan,Erin,Erwin,Esmeralda,Estela,Estebane,Étienne-Marie,Ethel,Eudoxie,Eugenio,Euphrasie,Eurydice,Ezekiel,Ezéchiel,Emmanuella,Erell,Ewan,Fabiana,Fadela,Fadoua,Fahd,Faïza,Falco,Faustina,Fédor,Félicia,Ferdinande,Fernanda,Fiacre,Fidel,Filippo,Firmine,Flavia,Flavian,Florentin,Florentine,Florestine,Floria,Florine,Fortunée,Foulques,Francesca,Francesco,Franco,Franklin,Frida,Friedrich,Fulvio,Fadel,Faïssal,Fanchette,Fantasia,Fayza,Félicitée,Filomena,Fiona-Rose,Gaëtane,Galien,Gatien,Gaultier,Gauvin,Gerda,Gertrude,Gervaise,Gianluca,Gildas,Ginger,Giovanna,Girard,Gisela,Giulio,Glawdys,Gonzalo,Goran,Gordon,Gratienne,Grazia,Grégorio,Griselda,Guadalupe,Guénaël,Guérin,Gunther,Gustavo,Guylène,Gwenola,Gwendolyn,Gabriel-Ange,Ghali,Ghita,Grégoria,Habiba,Hacène,Haley,Halim,Hamdi,Hamed,Hania,Hanne,Hannibal,Haris,Hasna,Hedwige,Helga,Héliette,Henri-Pierre,Herminie,Hermione,Hichem,Hildegarde,Hiroshi,Hortensia,Houda,Houcine,Hubertine,Hugolin,Hymane,Hafida,Hakima,Hanna-Rose,Harmonie,Harper,Hayat,Hélie,Henrique,Horia,Ianis,Ibtissam,Idir,Ignacio,Ilario,Ilhan,Iliès,Imaé,Imogène,India,Indiana,Inès-Rose,Inna,Iossif,Isaline,Isalia,Isaya,Iseut,Iseult,Isidora,Ismaïl,Isolde,Issa,Ivanka,Ivette,Iwan,Iyed,Izabela,Imad,Isabel,Isia,Jacquemine,Jacquette,Jad,Jaïs,Janick,Janis,Jasmin,Jayson,Jeannot,Jehan,Jennyfer,Jérémiah,Jérôme-Pierre,Jézabel,Joan-Pierre,Joaquin,Jocelin,Joffrey,Johanne,Jonah,Jonatan,Jordane,Jordi,Joséphin,Josselin,Jovanny,Juanita,Judicaël,Jules-Émile,Julianne,Juliano,Juliette-Rose,Junior,Justinien,Jeanne-Marie,Jean-Christophe,Jean-Denis,Jean-Emmanuel,Jean-Guy,Jean-Hugues,Jean-Loup,Jean-Noël,Jean-René,Jean-Sébastien,Jean-Victor,Jihane,Julien-Pierre,Lahna,Laïna,Lakshmi,Lamine,Landry,Lara-Lou,Laureline,Laurène,Lauréna,Laurette,Léanne,Léandra,Léanie,Léna-Rose,Lénaïc,Léo-Paul,Léonide,Leya,Liberté,Liliana,Lilie,Lina-Rose,Lindsey,Linh,Lisandre,Lison,Livio,Loan,Loïcia,Lolita,Lorelei,Lorena,Lorette,Loriane,Loubna,Louella,Louis-Marie,Louka,Louna-Rose,Luan,Lucas-Paul,Luciano,Lucrèce,Ludmilla,Luisa,Luna-Rose,Lya,Lyana,Lyes,Lysiane,Lahcène,Laure-Anne,Laurent-Pierre,Léonie-Rose,Lisa-Marie,Lylia,Maddy,Maëlyne,Mafalda,Magda,Maïa-Rose,Maïlis,Maïna,Maissane,Maïwen,Makram,Malaury,Malcolm,Malena,Manelle,Manolo,Mara,Marcello,Margaud,Marguerite-Marie,Maria-Luisa,Marianna,Marie-Agnès,Marie-Alix,Marie-Amélie,Marie-Anne,Marie-Christine,Marie-Josée,Marie-Lou,Marie-Madeleine,Marie-Noëlle,Marie-Odile,Marie-Paule,Marie-Rose,Marie-Sophie,Marinette,Marisol,Marwane,Mary,Massimo,Mathéa,Mathéis,Mathurin,Maureen,Maurin,Mavis,Maximilienne,Maylis,Maya-Rose,Medhi,Mehmet,Mélaine,Mélia,Mélinda,Mélissandre,Mellie,Merlin,Messaline,Michaëla,Michel-Ange,Mickaëlle,Mikaël,Mila-Rose,Milène,Miranda,Miriam,Mirza,Moïra,Mona-Lisa,Monia,Mortimer,Mouna,Mya,Myrtille,Marc-Antoine,Marc-Olivier,Mohamed-Ali,Nadjia,Najib,Narjes,Natanaël,Nathanaëlle,Nathaniel,Naya,Nayla,Nazli,Nella,Néréa,Nicolaï,Nicoletta,Nima,Noa-Lou,Noëlla,Noham,Nohan,Nolwenn,Nourredine,Nuria,Nadjet,Nahla,Nelia,Neyla,Nouha,Octavio,Odélie,Odin,Olav,Oleg,Olivette,Omer,Ophélia,Oren,Orla,Orso,Oscarine,Osée,Otis,Oumayma,Oussama,Ovide,Ozan,Océana,Oliviane,Ombline,Osman,Pâquerette,Pasquale,Paul-Antoine,Paul-Arthur,Paul-Louis,Paula,Péroline,Petra,Philéas,Pierre-Alexandre,Pierre-Antoine,Pierre-Emmanuel,Pierre-Henri,Pierre-Marie,Priscillia,Philippa,Pierre-Jean,Pierre-Olivier,Rabah,Rabia,Rachida,Radia,Rafaëlle,Raïa,Rainier,Ralph,Ramzi,Raphaëlla,Rayane,Réginald,Regina,Rémi-Paul,Richarde,Roch,Rosalia,Rosalind,Rose-Anne,Rose-Lise,Roselyne,Rosie,Rudolf,Ryad,Rahim,Ritchie,Sadia,Safa,Salah-Eddine,Samaël,Samuele,Sandie,Santino,Sarah-Lou,Sarra,Saskia,Sélène,Sélyan,Shaïna,Shanna,Shérine,Sibylle,Sidney,Siegfried,Silas,Silvère,Silvia,Simona,Sinaï,Sixte,Solenn,Soren,Stacy,Stefan,Suzy,Swann,Sybil,Sylvana,Salima,Sandy,Sasha,Shirine,Sohane,Soizic,Suzon,Sylvia,Tadeusz,Tamsin,Télio,Thalia,Théana,Théodule,Théophane,Thilda,Thomas-Emmanuel,Tilda,Timothé,Tom-Paul,Tugdual,Tyana,Tyler,Tamia,Théo-Paul,Timéa,Valentin-Pierre,Valérie-Anne,Valériane,Venise,Victorien,Vilma,Virgil,Vittorio,Valentino,Vincenzo,Kamila,Kaïna,Kalista,Karima,Karla,Kassandra,Kathleen,Keira,Kelyan,Kenji,Kheira,Kimberley,Klara,Kahina,Karen,Ursula,Ulrike,Wafa,Walter,Wiam,Wilson,Wissem,Yahia,Yamina,Yannis,Yolaine,Youcef,Younes,Youri,Ysée,Zahra,Zaïna,Zakia,Zéphyr,Zeynep,Ziyad,Zyneb,Abdelhamid,Abdelilah,Abdelwahab,Adélard,Adelphe,Adhémar,Agathon,Alcée,Aldegonde,Alexandrin,Almire,Aloysius,Amance,Amandus,Amarante,Ambroisine,Amédéa,Anatolie,Andréas,Angelin,Angilbert,Anthelme,Antonella,Arcadie,Aristée,Arnould,Arthémise,Aubry,Audoin,Augustina,Aurélien-Marie,Avelin,Basilide,Bastienne,Benoni,Bernardette,Berthold,Blanchard,Blandin,Bonne,Brunehaut,Calliope,Capucin,Carmelle,Casilda,Cécilien,Célestina,Céleste-Marie,Césarée,Chantou,Christiana,Clairette,Clarisse-Anne,Claudin,Clotaire,Colomban,Conrad,Cordélia,Crépin,Dagobert,Damase,Denise-Marie,Diane-Laure,Didière,Donat,Dorian-Paul,Dosithée,Egide,Éléazar,Éliaquim,Élisabeth-Anne,Émerentienne,Éole,Ermengarde,Ernestin,Eudoxe,Eulalia,Euphémie,Eustache,Évariste,Ézéchias,Faustine-Anne,Félicienne,Ferréol,Firmina,Flavienne,Florimond,Fortunat,Frédégonde,Gaïane,Galatée,Gatienne,Gaudence,Gédéonne,Géralde,Germinal,Guillaumette,Gustavine,Hébert,Hélier,Héliodore,Herménégilde,Hervine,Honorat,Hyppolite,Ignacia,Ivanhoé,Jacinthe-Marie,Jéroboam,Joachime,Joséphe,Jourdain,Julitte,Lambertine,Laurentin,Léger,Léobin,Léonilde,Liboire,Lucain,Ludger,Mac,Macaire,Mamert,Manfred,Marcien,Marcienne,Marcellin-Paul,Marien,Martinien,Mathurine,Médard,Mélanie-Rose,Monique-Marie,Nazaire,Nicéphore,Noémie-Rose,Norberte,Oriane-Lou,Pacifique,Pancrace,Paterne,Pélagie,Pierre-Paul,Pulchérie,Radegonde,Raoulin,Rémi-Joseph,Robertine,Rodolphine,Rogatien,Romaine,Rosaline,Rufin,Salvator,Scholastique,Sébastienne,Séverine-Anne,Sidoine,Sigismond,Solène-Marie,Stéphanie-Anne,Sulpice,Symphorien,Tancrédine,Théodoric,Théophraste,Thibaude,Timoléon,Toussainte,Valentine-Rose,Victorin,Vincente,Virginie-Anne,Adam-Lee,Aimé-Joseph,Alan-Pierre,Alix-Marie,Anna-Rose,Anna-Lou,Anne-Élise,Ambre-Lou,Axel-Lou,Charles-Henri,Charles-Édouard,Charles-Antoine,Claire-Marie,Élise-Anne,Émile-Jean,Eva-Rose,Hugo-Paul,Inès-Marie,Jean-Adrien,Jean-Alexandre,Jean-Benoît,Jean-Bernard,Jean-Christian,Jean-Daniel,Jean-Didier,Jean-Étienne,Jean-Frédéric,Jean-Gabriel,Jean-Georges,Jean-Guillaume,Jean-Henri,Jean-Joseph,Jean-Laurent,Jean-Lucien,Jean-Mathieu,Jean-Maurice,Jean-Nicolas,Jean-Olivier,Jean-Patrick,Jean-Raymond,Jean-Robert,Jean-Roger,Jean-Samuel,Jean-Thomas,Jean-Vincent,Léa-Rose,Louis-Philippe,Louis-Antoine,Louise-Marie,Lucie-Anne,Luc-Olivier,Marc-André,Marc-Henri,Marie-Anaïs,Marie-Andrée,Marie-Annick,Marie-Bernadette,Marie-Cécile,Marie-Charlotte,Marie-Chantal,Marie-Ève,Marie-Françoise,Marie-Gabrielle,Marie-Isabelle,Marie-Jeanne,Marie-Julie,Marie-Line,Marie-Louise,Marie-Lucie,Marie-Reine,Marie-Solène,Marie-Victoire,Paul-Adrien,Paul-Alexandre,Paul-Marie,Pierre-André,Pierre-Édouard,Pierre-François,Pierre-Loïc,Pierre-Luc,Pierre-Nicolas,Sophie-Anne,Tom-Lou,Victor-Hugo,France,Ladislas',
    animal: 'abeille,able,ablette,acarien,addax,agami,agneau,agnelle,aigle,aiglon,aigrette,aï,albatros,alevin,alligator,alouette,alpaga,alose,amibe,anaconda,anchois,âne,ânesse,ânon,anguille,anhinga,anoli,anophèle,antilope,aoudad,ara,araignée,argus,armadillo,asticot,autour,autruche,avocette,axolotl,aye-aye,aspic,akita,airedale,alezan,anémone de mer,ammonite,apollon,argyronète,aurochs,autruchon,anatife,babouin,baleine,baleineau,balbuzard,bar,barbeau,barbet,barbue,barracuda,basilic,basset,baudroie,bécasse,bécasseau,bécassine,bec-croisé,belette,béluga,bélier,bergeronnette,bernache,bernard-l’ermite,biche,bichon,bigorneau,bison,blaireau,blatte,blennie,boa,bœuf,bonobo,bontebok,bouc,bouledogue,bouquetin,bourdon,bouvreuil,bouvier,brebis,brochet,bruant,buffle,bufflonne,bulot,busard,buse,butor,boxer,beagle,berger allemand,bobtail,braque,briard,bengali,bulldog,bichon frisé,bernicle,bec-en-sabot,blanchon,bœuf musqué,bongo,bousier,bulbul,bardot,baribal,belouga,blaireautin,bobcat,barge,cabillaud,cachalot,cacatoès,cafard,caille,caïman,calao,calmar,caméléon,campagnol,canard,caneton,canari,cane,caniche,capucin,capybara,caracal,carcajou,caribou,carpe,carrelet,casoar,castor,cerf,cerf-volant,chacal,chameau,chamelle,chamois,chardonneret,charançon,chat,chaton,chatte,chauve-souris,chevêche,cheval,chevreau,chèvre,chevreuil,chien,chienne,chiot,chimpanzé,chinchilla,chinchard,chipmunk,chouette,cigale,cigogne,cloporte,coati,cobaye,cobra,coccinelle,cochon,cochon d’Inde,colibri,colin,colombe,colvert,condor,congre,coq,coquelet,coquille Saint-Jacques,corbeau,corneille,cormoran,couleuvre,coucou,courlis,crabe,crapaud,crevette,criquet,crocodile,crotale,cygne,cygneau,carpillon,chevrette,chihuahua,cocker,colley,caracara,cheval de trait,chouca,cétoine,chabot,charolais,cobe,crécerelle,cynocéphale,chrysope,crave,cerf élaphe,chamelon,chevalier,civette,coyote,courtilière,cyprin,daim,daine,dalmatien,damier,dauphin,demoiselle,dendrobate,dindon,dinde,dindonneau,dingo,diplodocus,dogue,doberman,doris,dorade,daurade,doryphore,dragon de Komodo,dromadaire,drosophile,dugong,durbec,diable de Tasmanie,dik-dik,drongo,dytique,dermeste,dasyure,écaille,écrevisse,écureuil,eider,élan,éléphant,éléphanteau,émeu,émouchet,engoulevent,épagneul,éperlan,épervier,éphémère,épinoche,épeire,escargot,espadon,esturgeon,étalon,étoile de mer,étourneau,eland,élanion,élaphe,empereur,encornet,éponge,ermite,escarbot,étrille,euplecte,éléphant de mer,épaulard,émerillon,effraie,écureuil volant,faisan,faisane,faon,faucon,fauvette,fennec,flamant,flamant rose,flétan,fou de Bassan,fouine,foulque,fourmi,fourmilier,frégate,frelon,freux,furet,fulmar,fox-terrier,frisonne,forficule,fourmilion,farlouse,fratercule,fanfre,gardon,gazelle,geai,gecko,gélinotte,genette,gerbille,gerboise,gibbon,girafe,girafon,glouton,gnou,gobie,goéland,goélette,goret,gorfou,gorille,goujon,gourami,grand-duc,grenouille,grillon,grive,grizzli,grizzly,grondin,grue,guenon,guépard,guêpe,guillemot,gypaète,golden retriever,grand danois,griffon,greyhound,gavial,gerfaut,gobe-mouche,gallinule,gaur,gorgone,grimpereau,guppy,hamster,hanneton,harfang,hareng,harle,hérisson,hermine,héron,hibou,hippocampe,hippopotame,hirondelle,hocco,homard,hoplostète,huître,huppe,husky,hyène,hydre,hérissonne,hongre,hulotte,hérisson de mer,haddock,hareng saur,harpie,hippotrague,holothurie,hoazin,houbara,ibis,ibex,iguane,impala,insecte,isard,ide,isatis,inséparable,ichneumon,ixode,idole des Maures,jabiru,jacana,jaguar,jaguarondi,jars,jaseur,jument,jack russell,julienne,jerboa,jacko,kangourou,kiwi,koala,krill,kakapo,kinkajou,kéa,koudou,labrador,labre,lagopède,lama,lamantin,lamproie,langouste,langoustine,lapereau,lapin,lapine,lérot,léopard,levrette,lévrier,lézard,libellule,lieu,lièvre,limace,limande,limule,linotte,lion,lionceau,lionne,loche,loir,lombric,loriot,lotte,loup,louve,louveteau,loutre,luciole,lynx,lézard vert,lemming,lémurien,lucane,lycaon,loup de mer,loup-cervier,loris,loutre de mer,lamier,macaque,macareux,machaon,mainate,maki,mammouth,manchot,mandrill,mante religieuse,maquereau,marabout,marcassin,mérou,marmotte,marsouin,martin-pêcheur,martinet,martre,mastiff,méduse,merle,merlan,merlu,mésange,milan,mille-pattes,mite,moineau,mollusque,morse,morue,mouche,moucheron,mouette,mouflon,moule,moustique,mouton,mulet,mule,mulot,murène,musaraigne,mygale,myriapode,malinois,mouffette,moufette,mangouste,marte,merle noir,merlette,milan royal,moro-sphinx,mustang,muscardin,morpho,nandou,narval,nasique,nautile,némertien,nèpe,notonecte,nymphe,nyctale,nette,nilgaut,oie,oison,okapi,opossum,orang-outan,orignal,ornithorynque,orque,ortolan,oryx,otarie,ouistiti,ours,ourse,ourson,oursin,outarde,ocelot,octopus,onagre,orvet,ouaouaron,oiseau,oiseau-mouche,oriole,oreillard,otocyon,ormeau,once,paca,panda,pangolin,panthère,paon,paonne,papillon,paresseux,passereau,pélican,perche,perdreau,perdrix,perroquet,perruche,pétrel,phacochère,phalène,phasme,phoque,pic,pie,pieuvre,pigeon,pingouin,pinson,pintade,pipistrelle,piranha,pivert,plie,pluvier,poisson,poisson rouge,poisson-chat,poisson-clown,porc,porcelet,porc-épic,poulain,poularde,poule,poulet,pouliche,poulpe,pou,pouillot,poussin,primate,puce,puceron,puma,punaise,putois,python,pékinois,pitbull,poney,pagre,palourde,pie-grièche,piéride,pintadeau,pipit,pleuronecte,pollack,porcin,praire,ptérodactyle,pygargue,pyrale,paruline,pinscher,petit-gris,papillon de nuit,phalanger,pika,porte-musc,ragondin,raie,rainette,râle,rascasse,rat,raton,raton laveur,rémora,renard,renarde,renardeau,renne,requin,rhinocéros,rhinolophe,roitelet,rorqual,rossignol,rouge-gorge,rougequeue,rouget,roussette,rottweiler,raptor,rat musqué,rat-taupe,rhésus,roquet,roussin,rosalie,rotifère,rousserolle,sajou,salamandre,sanglier,sangsue,sardine,sarcelle,sauterelle,saumon,scarabée,scolopendre,scorpion,seiche,serin,serpent,serval,sitelle,singe,sole,souris,sphinx,spatule,sterne,suricate,saint-bernard,samoyède,scalaire,setter,sapajou,saïga,saumonette,sar,sconse,scinque,siamois,silure,sittelle,sizerin,springbok,staphylin,stégosaure,sturnelle,surmulot,sylvain,spermophile,souchet,sanderling,sardinelle,sphinx tête-de-mort,sébaste,tadorne,tamanoir,tamarin,tanche,taon,tapir,tarentule,tarsier,tatou,taupe,taureau,teckel,tégénaria,termite,tétras,thon,tigre,tigresse,tique,tortue,toucan,touraco,tourterelle,tourteau,triton,truie,truite,turbot,tyrannosaure,tricératops,terre-neuve,tétard,taurillon,tigron,tipule,torcol,traquet,troglodyte,tangara,thylacine,tétrodon,tarier,vache,vachette,vairon,vanneau,varan,vautour,veau,ver,ver de terre,ver luisant,verdier,verrat,vigogne,vipère,vison,vive,volaille,velociraptor,veuve noire,vandoise,varan de Komodo,vespertilion,vignot,wapiti,wallaby,wombat,xérus,yack,yak,zèbre,zébu,zibeline,zorille,zébrule,zostérops,agouti,aigle royal,alcyon,alouate,amadine,ammophile,ange de mer,antilope cervicapre,aptéryx,arapaïma,argonaute,ascaris,atèle,aulacode,avocette élégante,azuré,babiroussa,baleine bleue,balane,bar commun,barbastelle,berger des Pyrénées,bichir,bihoreau,bison d’Europe,blaireau d’Europe,blongios,bonite,bouvreuil pivoine,brème,brocard,bruant jaune,buccin,busard cendré,butor étoilé,bœuf de Highland,cabri,cagouille,caïman noir,caille des blés,calandre,callichthys,canard mandarin,canard colvert,capelan,carabe,carcharodon,cardinal,carouge,castor d’Europe,cerf de Virginie,chat sauvage,chat persan,chat siamois,chien de berger,chimère,chouette effraie,chouette hulotte,cichlidé,cigogne blanche,cincle,cistude,civelle,clione,cobra royal,cochevis,colin de Virginie,combattant,conure,coque,coquillage,corail,cormoran huppé,corneille noire,coucou gris,couleuvre à collier,crabe vert,crapaud-buffle,crapet,crevette grise,criocère,crocodile du Nil,cygne noir,damalisque,daman,dauphin souffleur,demoiselle de Numidie,dendrocygne,dhole,diamant mandarin,dindon sauvage,discus,donzelle,dorade royale,dragon barbu,échidné,éclectus,épervier d’Europe,escargot de Bourgogne,étourneau sansonnet,eider à duvet,écureuil roux,écureuil gris,faisan doré,faucon pèlerin,faucon crécerelle,fauvette à tête noire,fou,foulque macroule,fourmi rouge,fourmi rousse,frelon asiatique,galago,gammare,garde-bœuf,garrot,gazelle de Thomson,geai des chênes,gecko léopard,girelle,glaréole,goéland argenté,gorge-bleue,grand-duc d’Europe,grand requin blanc,grèbe huppé,grenouille rousse,grenouille verte,grive musicienne,grue cendrée,guanaco,guêpier,gymnote,hamster doré,harfang des neiges,héron cendré,hibou grand-duc,hibou moyen-duc,hirondelle rustique,huîtrier,huppe fasciée,hyène tachetée,hylobate,ibis sacré,iguane vert,indri,jaseur boréal,kangourou roux,labbe,lagopède alpin,lapin de garenne,léopard des neiges,levraut,lézard des murailles,lièvre variable,lion de mer,loriot d’Europe,loup gris,loutre d’Europe,lynx boréal,lori,macareux moine,magot,maki catta,mante,marmotte des Alpes,martin-chasseur,mésange bleue,mésange charbonnière,milan noir,moineau domestique,molosse,mouette rieuse,murin,naja,nette rousse,noctule,nudibranche,oie cendrée,oie des moissons,ours brun,ours blanc,ours polaire,pagure,panda roux,panthère des neiges,paon bleu,papillon monarque,paradisier,pécari,perche du Nil,perdrix grise,perruche ondulée,petit-duc,phalarope,phoque gris,phoque veau-marin,pic vert,pic épeiche,pie bavarde,pigeon ramier,pinson des arbres,pluvier doré,poisson-lune,poisson-scie,poisson volant,poney shetland,poule d’eau,puffin,python royal,quetzal,quiscale,raie manta,rainette verte,rat noir,rat des champs,renard roux,renard polaire,requin-baleine,requin marteau,rhinocéros blanc,rollier,rougequeue noir,saumon atlantique,salamandre tachetée,sarigue,sauterelle verte,scarabée rhinocéros,serpent à sonnette,singe hurleur,souris grise,spatule blanche,tétras-lyre,thon rouge,tigre du Bengale,tortue luth,tortue de mer,tortue d’Hermann,toucan toco,tourterelle turque,triton alpestre,truite arc-en-ciel,tupaïa,urubu,urial,vache normande,vanneau huppé,vautour fauve,ver à soie,vipère aspic,vison d’Europe,fringille,furet des bois,mamba,veuve',
    pays: 'Afghanistan,Afrique du Sud,Albanie,Algérie,Allemagne,Andorre,Angola,Antigua-et-Barbuda,Arabie saoudite,Argentine,Arménie,Australie,Autriche,Azerbaïdjan,Bahamas,Bahreïn,Bangladesh,Barbade,Belgique,Belize,Bénin,Bhoutan,Biélorussie,Bélarus,Birmanie,Myanmar,Bolivie,Bosnie-Herzégovine,Bosnie,Botswana,Brésil,Brunei,Bulgarie,Burkina Faso,Burundi,Cambodge,Cameroun,Canada,Cap-Vert,Centrafrique,Chili,Chine,Chypre,Colombie,Comores,Congo,Corée du Nord,Corée du Sud,Corée,Costa Rica,Côte d’Ivoire,Croatie,Cuba,Danemark,Djibouti,Dominique,Égypte,Émirats arabes unis,Équateur,Érythrée,Espagne,Estonie,Eswatini,États-Unis,Éthiopie,Fidji,Finlande,France,Gabon,Gambie,Géorgie,Ghana,Grèce,Grenade,Guatemala,Guinée,Guinée-Bissau,Guinée équatoriale,Guyana,Haïti,Honduras,Hongrie,Inde,Indonésie,Irak,Iran,Irlande,Islande,Israël,Italie,Jamaïque,Japon,Jordanie,Kazakhstan,Kenya,Kirghizistan,Kiribati,Kosovo,Koweït,Laos,Lesotho,Lettonie,Liban,Liberia,Libye,Liechtenstein,Lituanie,Luxembourg,Macédoine,Macédoine du Nord,Madagascar,Malaisie,Malawi,Maldives,Mali,Malte,Maroc,Marshall,Maurice,Mauritanie,Mexique,Micronésie,Moldavie,Monaco,Mongolie,Monténégro,Mozambique,Namibie,Nauru,Népal,Nicaragua,Niger,Nigeria,Norvège,Nouvelle-Zélande,Oman,Ouganda,Ouzbékistan,Pakistan,Palaos,Palestine,Panama,Papouasie-Nouvelle-Guinée,Paraguay,Pays-Bas,Hollande,Pérou,Philippines,Pologne,Portugal,Qatar,République dominicaine,République tchèque,Tchéquie,Roumanie,Royaume-Uni,Russie,Rwanda,Saint-Marin,Sainte-Lucie,Salomon,Salvador,Samoa,Sao Tomé-et-Principe,Sénégal,Serbie,Seychelles,Sierra Leone,Singapour,Slovaquie,Slovénie,Somalie,Soudan,Soudan du Sud,Sri Lanka,Suède,Suisse,Suriname,Syrie,Tadjikistan,Taïwan,Tanzanie,Tchad,Thaïlande,Timor oriental,Togo,Tonga,Trinité-et-Tobago,Tunisie,Turkménistan,Turquie,Tuvalu,Ukraine,Uruguay,Vanuatu,Vatican,Venezuela,Viêt Nam,Yémen,Zambie,Zimbabwe,Angleterre,Écosse,Pays de Galles,Irlande du Nord,Groenland,Tibet,Porto Rico,Nouvelle-Calédonie,Polynésie française,Tahiti,Guadeloupe,Martinique,Guyane,La Réunion,Mayotte,Corse,Sahara occidental,Hong Kong,Macao,Gibraltar,Bermudes,Féroé,Aruba,Curaçao,Ceylan,Perse,Siam,Zaïre,Yougoslavie,Tchécoslovaquie,URSS,Prusse,Bohême,Dahomey,Rhodésie,Abyssinie,Haute-Volta',
    capitale: 'Abou Dabi,Abuja,Accra,Addis-Abeba,Alger,Amman,Amsterdam,Andorre-la-Vieille,Ankara,Antananarivo,Tananarive,Apia,Achgabat,Asmara,Astana,Asuncion,Athènes,Bagdad,Bakou,Bamako,Bandar Seri Begawan,Bangkok,Bangui,Banjul,Basseterre,Beyrouth,Belgrade,Belmopan,Berlin,Berne,Bichkek,Bissau,Bogota,Brasilia,Bratislava,Brazzaville,Bridgetown,Bruxelles,Bucarest,Budapest,Buenos Aires,Bujumbura,Gitega,Canberra,Caracas,Castries,Chisinau,Colombo,Conakry,Copenhague,Dakar,Damas,Dacca,Dhaka,Dili,Djibouti,Dodoma,Doha,Douchanbé,Dublin,Erevan,Freetown,Gaborone,Georgetown,Guatemala,Hanoï,Harare,Helsinki,Honiara,Islamabad,Jakarta,Jérusalem,Juba,Kaboul,Kampala,Katmandou,Khartoum,Kiev,Kyiv,Kigali,Kingston,Kinshasa,Koweït,Kuala Lumpur,La Havane,La Paz,Libreville,Lilongwe,Lima,Lisbonne,Ljubljana,Lomé,Londres,Luanda,Lusaka,Luxembourg,Madrid,Majuro,Malé,Managua,Manama,Manille,Maputo,Maseru,Mascate,Mbabane,Mexico,Minsk,Mogadiscio,Monaco,Monrovia,Montevideo,Moroni,Moscou,Nairobi,Nassau,Naypyidaw,N’Djamena,New Delhi,Niamey,Nicosie,Nouakchott,Nuku’alofa,Oslo,Ottawa,Ouagadougou,Oulan-Bator,Panama,Paramaribo,Paris,Pékin,Beijing,Phnom Penh,Podgorica,Port-au-Prince,Port-Louis,Port Moresby,Port-Vila,Porto-Novo,Port of Spain,Prague,Praia,Pretoria,Pristina,Pyongyang,Quito,Rabat,Reykjavik,Riga,Riyad,Rome,Roseau,Saint-Domingue,Saint-Georges,Saint-Marin,San José,San Salvador,Sanaa,Santiago,Santiago du Chili,Sao Tomé,Sarajevo,Séoul,Singapour,Skopje,Sofia,Stockholm,Sucre,Suva,Taipei,Tallinn,Tachkent,Tbilissi,Tegucigalpa,Téhéran,Thimphou,Tirana,Tokyo,Tripoli,Tunis,Vaduz,La Valette,Varsovie,Vatican,Victoria,Vienne,Vientiane,Vilnius,Washington,Wellington,Windhoek,Yamoussoukro,Yaoundé,Zagreb,Nouméa,Papeete,Cayenne,Fort-de-France,Saint-Denis,Mamoudzou,Ajaccio,Édimbourg,Cardiff,Belfast,Nuuk,Lhassa',
    villefr: 'Abbeville,Agde,Agen,Aigues-Mortes,Aix-en-Provence,Aix-les-Bains,Ajaccio,Albertville,Albi,Alençon,Alès,Alfortville,Amboise,Amiens,Ancenis,Andrésy,Angers,Anglet,Angoulême,Annecy,Annemasse,Annonay,Antibes,Antony,Apt,Arcachon,Argelès-sur-Mer,Argentan,Argenteuil,Arles,Armentières,Arras,Asnières-sur-Seine,Athis-Mons,Aubagne,Aubenas,Aubervilliers,Auch,Aulnay-sous-Bois,Aurillac,Autun,Auxerre,Avallon,Avignon,Avranches,Aix,Ambérieu-en-Bugey,Ambert,Ancy,Andernos-les-Bains,Annœullin,Anzin,Arcueil,Argelès-Gazost,Arpajon,Aubusson,Audincourt,Auray,Avion,Avesnes-sur-Helpe,Ax-les-Thermes,Azay-le-Rideau,Aigle,Aigueperse,Allauch,Bagnères-de-Bigorre,Bagneux,Bagnolet,Bar-le-Duc,Bar-sur-Aube,Barcelonnette,Bastia,Bayeux,Bayonne,Beaucaire,Beaune,Beauvais,Belfort,Bellegarde-sur-Valserine,Bellac,Belley,Bergerac,Bernay,Besançon,Béthune,Béziers,Biarritz,Blagnac,Blaye,Blois,Bobigny,Bondy,Bonneville,Bordeaux,Boulogne-Billancourt,Boulogne-sur-Mer,Bourg-en-Bresse,Bourges,Bourgoin-Jallieu,Brest,Briançon,Brie-Comte-Robert,Brignoles,Brive-la-Gaillarde,Brive,Bron,Bressuire,Bruay-la-Buissière,Bagnols-sur-Cèze,Balma,Bandol,Barbezieux,Bar-sur-Seine,Beaumont,Bécon,Belle-Île,Bègles,Bénodet,Berck,Bezons,Biscarrosse,Bischheim,Bléré,Bondues,Bonifacio,Bouc-Bel-Air,Bougival,Boulogne,Bourgueil,Brioude,Bruz,Bry-sur-Marne,Buchelay,Bussy-Saint-Georges,Blanquefort,Cabourg,Caen,Cagnes-sur-Mer,Cahors,Calais,Caluire-et-Cuire,Calvi,Cambrai,Cannes,Carcassonne,Carpentras,Carnac,Castres,Castelnaudary,Castelsarrasin,Cavaillon,Cayenne,Cergy,Chalon-sur-Saône,Châlons-en-Champagne,Chambéry,Chamonix,Champigny-sur-Marne,Chantilly,Charleville-Mézières,Chartres,Château-Thierry,Châteaubriant,Châteaudun,Châteauroux,Châtellerault,Châtenay-Malabry,Chatou,Chaumont,Chelles,Cherbourg,Cholet,Choisy-le-Roi,Clamart,Clermont-Ferrand,Clichy,Cluses,Cognac,Colmar,Colombes,Colomiers,Compiègne,Concarneau,Condom,Corbeil-Essonnes,Cosne-Cours-sur-Loire,Courbevoie,Coutances,Créteil,Creil,Cannes-la-Bocca,Carhaix,Carmaux,Carvin,Castelnau-le-Lez,Cenon,Cestas,Challans,Chamalières,Chambray-lès-Tours,Chantepie,Charenton-le-Pont,Château-Gontier,Châtillon,Chaville,Chenôve,Chinon,Cléon,Clisson,Cluny,Cogolin,Collioure,Combloux,Commercy,Conflans-Sainte-Honorine,Cormeilles,Cournon-d’Auvergne,Courchevel,Crest,Croix,Cugnaux,Carpiquet,Cassis,Capbreton,Carquefou,Dax,Deauville,Denain,Dieppe,Digne-les-Bains,Dijon,Dinan,Dinard,Dole,Douai,Douarnenez,Draguignan,Drancy,Dreux,Dunkerque,Die,Dieulefit,Divonne-les-Bains,Domont,Douvres,Draveil,Decazeville,Déville-lès-Rouen,Dammarie-les-Lys,Dampierre,Darnétal,Digoin,Dombasle,Domfront,Doullens,Dourdan,Drusenheim,Duclair,Échirolles,Écully,Élancourt,Elbeuf,Épernay,Épinal,Épinay-sur-Seine,Ermont,Étampes,Étretat,Évian-les-Bains,Évreux,Évry,Eaubonne,Écouen,Égletons,Embrun,Enghien-les-Bains,Épinay-sous-Sénart,Erstein,Espalion,Étaples,Étel,Eu,Eybens,Eysines,Èze,Ézanville,Eauze,Ernée,Estrées,Fécamp,Figeac,Firminy,Flers,Florac,Foix,Fontainebleau,Fontenay-sous-Bois,Fontenay-le-Comte,Forbach,Fougères,Fréjus,Frontignan,Fresnes,Franconville,Falaise,Faverges,Fayence,Ferney-Voltaire,Fleury-Mérogis,Floirac,Fontaine,Fos-sur-Mer,Fouesnant,Fourmies,Fresnay,Frouard,Fumel,Fontenay-aux-Roses,Fontenay-Trésigny,Gaillac,Gap,Gagny,Garches,Gennevilliers,Gex,Gien,Gisors,Givors,Grasse,Gradignan,Granville,Gravelines,Grenoble,Guebwiller,Guéret,Guingamp,Guyancourt,Gérardmer,Gif-sur-Yvette,Gonesse,Gourdon,Gournay-en-Bray,Grand-Couronne,Grande-Synthe,Graulhet,Grenade,Grignan,Grigny,Guérande,Guidel,Gujan-Mestras,Garges-lès-Gonesse,Gardanne,Gray,Haguenau,Hazebrouck,Hendaye,Hénin-Beaumont,Hérouville-Saint-Clair,Honfleur,Houilles,Hyères,Hagondange,Halluin,Harfleur,Haubourdin,Hautmont,Hayange,Hellemmes,Hem,Hennebont,Héricourt,Hérimoncourt,Hesdin,Hirson,Hœnheim,Hombourg-Haut,Hossegor,Houlgate,Huningue,Hérault,Illkirch-Graffenstaden,Issoire,Issoudun,Issy-les-Moulineaux,Istres,Ivry-sur-Seine,Île-Rousse,Illzach,Ingré,Isbergues,Isle,Issy,Itteville,Ivry,Imphy,Illiers-Combray,Isigny-sur-Mer,Isola,Ingwiller,Joigny,Joinville-le-Pont,Jarnac,Joué-lès-Tours,Juan-les-Pins,Jonzac,Josselin,Juvisy-sur-Orge,Jarny,Jaunay-Clan,Jeumont,Joinville,Jouy-en-Josas,Jurançon,Juvignac,Jassans-Riottier,Janzé,La Baule,La Ciotat,La Flèche,La Grande-Motte,La Roche-sur-Yon,La Rochelle,La Seyne-sur-Mer,La Teste-de-Buch,Lagny-sur-Marne,Lambersart,Lamballe,Landerneau,Langon,Langres,Lannion,Laon,Laval,Le Blanc-Mesnil,Le Cannet,Le Creusot,Le Havre,Le Mans,Le Puy-en-Velay,Le Touquet,Lens,Les Sables-d’Olonne,Levallois-Perret,Libourne,Liévin,Lille,Limoges,Lisieux,Lodève,Longwy,Lons-le-Saunier,Lorient,Loudun,Lourdes,Louviers,Lunel,Lunéville,Lyon,Lagord,Lamalou-les-Bains,Lanester,Largentière,Lattes,Laxou,Le Bourget,Le Chesnay,Le Kremlin-Bicêtre,Le Pecq,Le Pontet,Le Vésinet,Lescar,Lesneven,Limay,Limoux,Lingolsheim,Livry-Gargan,Loches,Lomme,Longjumeau,Loos,Lorgues,Lormont,Loudéac,Louhans,Lourmarin,Lure,Luçon,Luxeuil-les-Bains,Lys-lez-Lannoy,Le Lavandou,Les Mureaux,Les Ulis,Le Perreux-sur-Marne,Le Plessis-Robinson,Le Grau-du-Roi,Le Croisic,Lanvollon,Lacanau,Langeais,Lectoure,Mâcon,Maisons-Alfort,Maisons-Laffitte,Malakoff,Mamoudzou,Mantes-la-Jolie,Manosque,Marcq-en-Barœul,Marignane,Marmande,Marseille,Martigues,Massy,Maubeuge,Mauriac,Meaux,Melun,Mende,Menton,Mérignac,Metz,Meudon,Meyzieu,Millau,Mirande,Molsheim,Monaco,Mont-de-Marsan,Montargis,Montauban,Montbéliard,Montbrison,Montélimar,Montluçon,Montpellier,Montreuil,Montrouge,Morlaix,Mortagne-au-Perche,Moulins,Mulhouse,Muret,Mandelieu-la-Napoule,Marly,Marmoutier,Marquette-lez-Lille,Maromme,Mauguio,Mayenne,Megève,Meulan,Meyrargues,Miramas,Moissac,Montceau-les-Mines,Montgeron,Montigny-le-Bretonneux,Montivilliers,Montmorency,Montmorillon,Montpon-Ménestérol,Morzine,Mougins,Moûtiers,Mauléon,Mazamet,Montbard,Montdidier,Montereau-Fault-Yonne,Monistrol-sur-Loire,Mortain,Nancy,Nanterre,Nantes,Nantua,Narbonne,Neuilly-sur-Seine,Nevers,Nice,Nîmes,Niort,Nogent-sur-Marne,Nogent-le-Rotrou,Noisy-le-Grand,Nontron,Nouméa,Noyon,Nyons,Nérac,Neufchâteau,Neufchâtel-en-Bray,Neuville-sur-Saône,Noirmoutier,Noisy-le-Sec,Nort-sur-Erdre,Notre-Dame-de-Gravenchon,Nozay,Nuits-Saint-Georges,Nemours,Nogent-sur-Oise,Narbonne-Plage,Obernai,Oloron-Sainte-Marie,Orange,Orléans,Orly,Orsay,Orthez,Oyonnax,Ostwald,Oullins,Olivet,Ollioules,Onet-le-Château,Orvault,Osny,Ozoir-la-Ferrière,Orchies,Ornans,Ouistreham,Oissel,Octeville,Palaiseau,Pamiers,Pantin,Paris,Parthenay,Pau,Périgueux,Péronne,Perpignan,Pertuis,Pessac,Pithiviers,Plaisir,Ploërmel,Poissy,Poitiers,Pont-à-Mousson,Pontarlier,Pontivy,Pontoise,Porto-Vecchio,Privas,Provins,Puteaux,Paimpol,Palavas-les-Flots,Pavillons-sous-Bois,Perros-Guirec,Pézenas,Pierrelatte,Plougastel-Daoulas,Plouzané,Pontault-Combault,Pont-Audemer,Pornic,Pornichet,Port-Vendres,Pouilly,Pré-Saint-Gervais,Propriano,Puy-Saint-Vincent,Pontcharra,Pontchâteau,Portes-lès-Valence,Prades,Plombières,Pléneuf-Val-André,Quimper,Quimperlé,Quiberon,Quetigny,Rambouillet,Redon,Reims,Remiremont,Rennes,Rezé,Rillieux-la-Pape,Riom,Roanne,Rochefort,Rodez,Romans-sur-Isère,Romorantin-Lanthenay,Roubaix,Rouen,Royan,Rueil-Malmaison,Rumilly,Rambervillers,Ramonville-Saint-Agne,Réau,Rethel,Revel,Ribeauvillé,Richelieu,Rive-de-Gier,Rixheim,Roquebrune-Cap-Martin,Roscoff,Rosny-sous-Bois,Rostrenen,Roussillon,Rosheim,Ruffec,Rungis,Riquewihr,Rocamadour,Saint-Brieuc,Saint-Chamond,Saint-Claude,Saint-Cloud,Saint-Denis,Saint-Dié-des-Vosges,Saint-Dizier,Saint-Étienne,Saint-Flour,Saint-Gaudens,Saint-Germain-en-Laye,Saint-Girons,Saint-Jean-de-Luz,Saint-Lô,Saint-Malo,Saint-Maur-des-Fossés,Saint-Nazaire,Saint-Omer,Saint-Ouen,Saint-Pierre,Saint-Quentin,Saint-Raphaël,Saint-Tropez,Sainte-Maxime,Saintes,Salon-de-Provence,Sarcelles,Sarlat-la-Canéda,Sarreguemines,Saumur,Saverne,Schiltigheim,Sedan,Sélestat,Sens,Sète,Sevran,Sèvres,Soissons,Sotteville-lès-Rouen,Strasbourg,Suresnes,Saint-Avold,Saint-Amand-les-Eaux,Saint-Laurent-du-Var,Saint-Médard-en-Jalles,Saint-Priest,Saint-Herblain,Saint-Sébastien-sur-Loire,Saint-Jean-de-Braye,Saint-Genis-Laval,Saint-Égrève,Saint-Fons,Saint-Martin-d’Hères,Saint-Paul-de-Vence,Sainte-Geneviève-des-Bois,Salins-les-Bains,Sallanches,Sanary-sur-Mer,Sartène,Saujon,Savenay,Seclin,Segré,Seyssinet-Pariset,Sisteron,Six-Fours-les-Plages,Sochaux,Sorgues,Soyaux,Stains,Sucy-en-Brie,Sablé-sur-Sarthe,Saint-Émilion,Saint-Jean-Pied-de-Port,Saint-Affrique,Saint-Junien,Saint-Yrieix-la-Perche,Sainte-Menehould,Talence,Tarascon,Tarbes,Thiers,Thionville,Thonon-les-Bains,Toul,Toulon,Toulouse,Tourcoing,Tournon-sur-Rhône,Tours,Trappes,Tremblay-en-France,Trouville-sur-Mer,Troyes,Tulle,Taverny,Tassin-la-Demi-Lune,Tergnier,Thann,Thouars,Tignes,Tonneins,Torcy,Tournefeuille,Tourlaville,Trégastel,Tréguier,Trélazé,Trets,Triel-sur-Seine,Trignac,Tain-l’Hermitage,Theix,Thorigny-sur-Marne,Valence,Valenciennes,Vallauris,Vannes,Vanves,Vaulx-en-Velin,Vendôme,Vénissieux,Verdun,Vernon,Versailles,Vesoul,Vichy,Vienne,Vierzon,Villefranche-sur-Saône,Villejuif,Villeneuve-d’Ascq,Villeneuve-sur-Lot,Villepinte,Villeurbanne,Vincennes,Vire,Viry-Châtillon,Vitré,Vitrolles,Vitry-le-François,Vitry-sur-Seine,Voiron,Vaison-la-Romaine,Val-d’Isère,Valbonne,Vallet,Vals-les-Bains,Vandœuvre-lès-Nancy,Vauvert,Vence,Verneuil-sur-Avre,Vernouillet,Vertou,Vic-Fezensac,Villefranche-de-Rouergue,Villefontaine,Villemomble,Villeneuve-Saint-Georges,Villiers-le-Bel,Villers-Cotterêts,Villers-lès-Nancy,Vizille,Vouziers,Vauréal,Vezelay,Villard-de-Lans,Val-Thorens,Vic-sur-Cère,Wattrelos,Wasquehal,Wissembourg,Yerres,Yssingeaux,Yvetot,Yutz,Abondance,Agay,Aiguillon,Ailly-sur-Noye,Airaines,Aire-sur-la-Lys,Alénya,Allonnes,Altkirch,Ambérieu,Amilly,Ancenis-Saint-Géréon,Andernos,Anduze,Aniane,Anse,Antrain,Arbois,Arcis-sur-Aube,Ardres,Argelès,Arès,Argenton-sur-Creuse,Arnay-le-Duc,Arques,Ars-en-Ré,Artenay,Arzon,Assérac,Attichy,Aubière,Aubigny-sur-Nère,Aucamville,Audierne,Audun-le-Tiche,Aulnoye-Aymeries,Ault,Aumale,Auneau,Auterive,Auxonne,Avesnes,Avoine,Axat,Ay,Aytré,Azay-le-Brûlé,Bagnoles-de-l’Orne,Bailleul,Bain-de-Bretagne,Ballancourt,Balaruc-les-Bains,Banyuls-sur-Mer,Bapaume,Barbizon,Barfleur,Barjac,Barr,Bassens,Baume-les-Dames,Bazas,Beaugency,Beaujeu,Beaulieu-sur-Mer,Beaumont-sur-Oise,Beaune-la-Rolande,Beaupréau,Beausoleil,Bédarieux,Belle-Isle-en-Terre,Bellême,Belvès,Benfeld,Berck-sur-Mer,Bergues,Besse,Bessèges,Bétheny,Beuvry,Bidart,Billère,Binic,Biot,Blangy-sur-Bresle,Bléneau,Bolbec,Bollène,Bonnétable,Bonneval,Bormes-les-Mimosas,Boucau,Bouguenais,Boulazac,Bourbon-l’Archambault,Bourbon-Lancy,Bourganeuf,Bourg-Saint-Maurice,Bourg-de-Péage,Bourgneuf,Bouzonville,Bozouls,Brantôme,Braine,Bray-Dunes,Brécey,Bréhal,Brie,Brignais,Brissac,Brou,Brumath,Bucy-le-Long,Bugeat,Buzançais,Brunoy,Bruges-sur-Gironde,Cadillac,Cagnes,Cajarc,Calvisson,Camaret-sur-Mer,Cambo-les-Bains,Cancale,Canet-en-Roussillon,Cannes-Écluse,Carentan,Carhaix-Plouguer,Carnoux,Casteljaloux,Castelmoron,Castelnau-de-Médoc,Castets,Caudebec-en-Caux,Caudry,Caussade,Cauterets,Cazères,Céret,Cernay,Chabeuil,Chablis,Chagny,Chalonnes,Chambord,Chamonix-Mont-Blanc,Champagnole,Champeix,Chantonnay,Charlieu,Charolles,Charroux,Chasseneuil,Châteaubourg,Châteaugiron,Châteaulin,Châteauneuf-du-Pape,Château-Chinon,Château-Renault,Châtel,Châtelaillon-Plage,Châtillon-sur-Seine,Chauny,Chauvigny,Chazelles-sur-Lyon,Chemillé,Chénérailles,Chevreuse,Cintegabelle,Civray,Clamecy,Claye-Souilly,Clermont-l’Hérault,Clohars-Carnoët,Coaraze,Commentry,Condé-sur-Noireau,Condrieu,Confolens,Contrexéville,Corbie,Cordes-sur-Ciel,Corte,Cosne-d’Allier,Coulommiers,Courseulles-sur-Mer,Couzon,Crécy-la-Chapelle,Créon,Crépy-en-Valois,Criquetot,Crozon,Cuers,Culoz,Cusset,Damazan,Dampierre-en-Burly,Darney,Daoulas,Delle,Descartes,Dives-sur-Mer,Dol-de-Bretagne,Donzère,Donzy,Dornes,Douchy-les-Mines,Doué-la-Fontaine,Dozulé,Dun-sur-Auron,Duras,Durtal,Dieuze,Écommoy,Écueillé,Égliseneuve,Elne,Ennezat,Entraygues,Épernon,Erquy,Ervy-le-Châtel,Espelette,Estagel,Étain,Étrépagny,Évaux-les-Bains,Évron,Excideuil,Eymoutiers,Fayl-Billot,Felletin,Fère-en-Tardenois,Feurs,Fismes,Fleurance,Fleury-les-Aubrais,Florensac,Fontevraud,Forcalquier,Forges-les-Eaux,Fougerolles,Fouras,Fraize,Frévent,Fronton,Fumay,Gacé,Gaillon,Gannat,Gerzat,Gevrey-Chambertin,Giens,Gimont,Givet,Gondrecourt,Gordes,Gouesnou,Gourin,Grand-Fougeray,Grandvilliers,Granges,Gréoux-les-Bains,Grisolles,Guémené-Penfao,Guérigny,Guichen,Guînes,Guise,Guîtres,Hagetmau,Ham,Harnes,Hasparren,Hautefort,Hauteville,Herbignac,Hermanville,Hirsingue,Hochfelden,Houdain,Houdan,Huelgoat,Hyères-les-Palmiers,Ifs,Illhaeusern,Ingrandes,Isigny,Issy-l’Évêque,Is-sur-Tille,Itxassou,Jallais,Janville,Jargeau,Jarnages,Jonchery,Jouarre,Joyeuse,Jugon-les-Lacs,Juillac,Jumièges,Juzennecourt,La Bresse,La Canourgue,La Chaise-Dieu,La Charité-sur-Loire,La Châtre,La Clusaz,La Côte-Saint-André,La Couronne,La Ferté-Bernard,La Ferté-Macé,La Ferté-sous-Jouarre,La Gacilly,La Guerche-de-Bretagne,La Mure,La Plagne,La Réole,La Roche-Bernard,La Roche-Posay,La Rochefoucauld,La Souterraine,La Suze-sur-Sarthe,La Tour-du-Pin,La Tremblade,La Trinité-sur-Mer,Labastide,Lacapelle-Marival,Lamastre,Lambesc,Landivisiau,Landrecies,Langogne,Lannemezan,Lanvéoc,Lapalisse,Laroque,Lauterbourg,Lavaur,Le Beausset,Le Blanc,Le Cateau-Cambrésis,Le Chambon-sur-Lignon,Le Conquet,Le Crotoy,Le Faouët,Le Folgoët,Le Lude,Le Mont-Dore,Le Mont-Saint-Michel,Le Palais,Le Portel,Le Quesnoy,Le Teil,Le Tréport,Le Vigan,Lembach,Lencloître,Lens-Lestang,Lesparre-Médoc,Levroux,Lezoux,Liancourt,Lillebonne,Limours,Lisle-sur-Tarn,Lizy-sur-Ourcq,Locminé,Locronan,Longué,Lorris,Luc-sur-Mer,Lucenay,Lussac,Luz-Saint-Sauveur,Lyons-la-Forêt,Machecoul,Magny-en-Vexin,Maîche,Maintenon,Malestroit,Malicorne,Mamers,Marciac,Marennes,Mareuil,Marquise,Marseillan,Martel,Marvejols,Masevaux,Matha,Maubourguet,Mauron,Mayet,Mazet,Meillant,Melle,Mer,Merville,Méru,Meymac,Meyrueis,Mézin,Mimizan,Mirebeau,Mirecourt,Mirepoix,Modane,Molières,Monflanquin,Monpazier,Montaigu,Montbazon,Montbenoît,Montcuq,Montendre,Montfort-l’Amaury,Montfort-sur-Meu,Monthermé,Montlouis-sur-Loire,Montluel,Montmirail,Montoire-sur-le-Loir,Montréjeau,Montrésor,Montrichard,Morestel,Moret-sur-Loing,Mormoiron,Mortagne-sur-Sèvre,Mouthier,Moustiers-Sainte-Marie,Mouzon,Munster,Mussidan,Najac,Nangis,Nanteuil,Nay,Néris-les-Bains,Neuf-Brisach,Neuvic,Neuville-aux-Bois,Niederbronn-les-Bains,Nieul,Nogaro,Noirétable,Nolay,Nonancourt,Nouan-le-Fuzelier,Nouvion,Oisemont,Olargues,Oloron,Orbec,Orgelet,Orgon,Ouzouer,Pacy-sur-Eure,Paimbœuf,Pamproux,Paray-le-Monial,Parentis-en-Born,Passy,Patay,Pérouges,Peyrehorade,Piana,Pierrefonds,Plancoët,Pléneuf,Pleyben,Ploudalmézeau,Plouescat,Plouha,Poix,Poligny,Pons,Pont-Aven,Pont-l’Abbé,Pont-l’Évêque,Pont-Saint-Esprit,Pontarion,Pontorson,Port-Louis,Port-en-Bessin,Port-Saint-Louis-du-Rhône,Pougues-les-Eaux,Pouzauges,Pradelles,Pré-en-Pail,Prémery,Puylaurens,Puy-l’Évêque,Quillan,Quintin,Quissac,Rabastens,Ramatuelle,Randan,Réalmont,Rebais,Remoulins,Revin,Riberac,Rieumes,Rieux,Rimont,Riscle,Rocroi,Romilly-sur-Seine,Roquefort,Roquevaire,Rosporden,Rouffach,Royat,Rozay-en-Brie,Rue,Ruffieux,Rugles,Sabres,Saint-Aignan,Saint-Amand-Montrond,Saint-André-de-Cubzac,Saint-Antonin-Noble-Val,Saint-Aubin-du-Cormier,Saint-Calais,Saint-Céré,Saint-Cyprien,Saint-Cyr-sur-Mer,Saint-Florent,Saint-Galmier,Saint-Gilles-Croix-de-Vie,Saint-Guilhem-le-Désert,Saint-Hilaire-du-Harcouët,Saint-Jean-d’Angély,Saint-Just-en-Chaussée,Saint-Léonard-de-Noblat,Saint-Macaire,Saint-Maixent-l’École,Saint-Marcellin,Saint-Martin-de-Ré,Saint-Méen-le-Grand,Saint-Pol-de-Léon,Saint-Pol-sur-Ternoise,Saint-Pons-de-Thomières,Saint-Pourçain-sur-Sioule,Saint-Rémy-de-Provence,Saint-Savin,Saint-Sever,Saint-Valery-en-Caux,Saint-Valery-sur-Somme,Saint-Vallier,Saint-Wandrille,Sainte-Enimie,Sainte-Foy-la-Grande,Sainte-Marie-aux-Mines,Salers,Salies-de-Béarn,Sancerre,Sanary,Sarrebourg,Sartilly,Saugues,Saulieu,Sauve,Sauveterre-de-Béarn,Seignelay,Seilhac,Semur-en-Auxois,Senlis,Sérignan,Seurre,Sézanne,Sierck-les-Bains,Signy-l’Abbaye,Sillé-le-Guillaume,Sollies-Pont,Sommières,Souillac,Soultz,Soustons,Suippes,Sully-sur-Loire,Surgères,Taninges,Tarare,Tartas,Tence,Thiberville,Thiviers,Thizy,Tinténiac,Tonnay-Charente,Tonnerre,Tourrettes,Toury,Treignac,Trévoux,Trie-sur-Baïse,Troarn,Tuchan,Turckheim,Ussel,Uzès,Uzerche,Uckange,Ustaritz,Vaison,Valençay,Valognes,Vallon-Pont-d’Arc,Valras-Plage,Varennes-en-Argonne,Vatan,Vaucouleurs,Vendeuvre,Vermenton,Verneuil,Vernet-les-Bains,Vertus,Vervins,Veules-les-Roses,Veynes,Vézins,Vibraye,Vienne-le-Château,Vierville,Vigneulles,Villandraut,Villandry,Villard-Bonnot,Villedieu-les-Poêles,Villefranche-de-Lauragais,Villefranche-sur-Mer,Villeréal,Villers-Bocage,Villers-sur-Mer,Vimoutiers,Vinça,Violès,Vitteaux,Vittel,Vivonne,Void-Vacon,Volvic,Vouvray,Vrigne-aux-Bois,Villeneuve-lès-Avignon,Villeneuve-sur-Yonne,Villers-Semeuse,Vergèze,Vauvenargues,Wimereux,Wissant,Wittelsheim,Woippy,Wormhout,Xertigny,Yenne,Ygrande',
    villemonde: 'Aberdeen,Acapulco,Adélaïde,Agadir,Alexandrie,Alicante,Almaty,Anvers,Anchorage,Assouan,Atlanta,Auckland,Austin,Avila,Baltimore,Bâle,Bangalore,Barcelone,Bari,Belo Horizonte,Bergen,Bethléem,Bilbao,Birmingham,Bologne,Bombay,Mumbai,Bonn,Bordeaux,Boston,Bratislava,Brême,Brighton,Brisbane,Bristol,Bruges,Busan,Byblos,Cadix,Calcutta,Calgary,Cali,Cambridge,Canton,Cap,Casablanca,Catane,Charleroi,Charlotte,Chicago,Cologne,Constantine,Cordoue,Cracovie,Dallas,Denver,Détroit,Dresde,Doubaï,Dubaï,Durban,Düsseldorf,Édimbourg,Eindhoven,Essen,Fès,Florence,Francfort,Fribourg,Gand,Gdansk,Gênes,Genève,Glasgow,Göteborg,Grenade,Guadalajara,Hambourg,Hanovre,Heidelberg,Hiroshima,Hô Chi Minh-Ville,Saïgon,Honolulu,Houston,Ibiza,Innsbruck,Istanbul,Izmir,Jaffa,Jeddah,Johannesburg,Kaboul,Karachi,Kyoto,Lagos,Las Vegas,Lausanne,Leeds,Leipzig,Liège,Lille,Liverpool,Los Angeles,Louxor,Lucerne,Lugano,Lyon,Macao,Malaga,Manchester,Mannheim,Marrakech,Marbella,Medellin,Melbourne,Memphis,Miami,Milan,Minneapolis,Montréal,Mostar,Munich,Namur,Naples,Nashville,New York,Nice,Nuremberg,Odessa,Osaka,Oxford,Palerme,Palma,Pampelune,Parme,Philadelphie,Phoenix,Pise,Porto,Porto Alegre,Pompéi,Portland,Québec,Recife,Rio de Janeiro,Rotterdam,Saint-Pétersbourg,Salamanque,Salvador,Salzbourg,San Diego,San Francisco,San Sebastian,Santorin,São Paulo,Saragosse,Séville,Shanghai,Sienne,Split,Stuttgart,Sydney,Tanger,Tel Aviv,Tolède,Toronto,Turin,Valence,Valparaiso,Vancouver,Venise,Vérone,Zurich,Mons,Tournai,Ostende,Louvain,Waterloo,Montreux,Neuchâtel,Sion,Monte-Carlo,Tripoli,Oran,Annaba,Tlemcen,Sfax,Sousse,Djerba,Meknès,Tétouan,Essaouira,Ouarzazate,Oujda,Abidjan,Douala,Pointe-Noire,Lubumbashi,Tombouctou,Zanzibar,Mombasa,Le Caire,Gizeh,Jérusalem,Haïfa,Alep,Mossoul,Bassora,Ispahan,Chiraz,Samarcande,Boukhara,Delhi,Agra,Bénarès,Madras,Chennai,Goa,Pondichéry,Katmandou,Lhassa,Shenzhen,Hong Kong,Wuhan,Chengdu,Xian,Nankin,Harbin,Kobe,Nagasaki,Nagoya,Sapporo,Yokohama,Incheon,Manille,Cebu,Bali,Surabaya,Perth,Darwin,Hobart,Christchurch,Tijuana,Monterrey,Cancun,Oaxaca,Havane,Santiago de Cuba,Cartagena,Carthagène,Guayaquil,Cusco,Arequipa,Rosario,Mendoza,Cordoba,Ushuaia,Manaus,Fortaleza,Brasilia,Montevideo,Asuncion,Seattle,Orlando,Cleveland,Pittsburgh,Winnipeg,Edmonton,Halifax,Lviv,Kharkiv,Novossibirsk,Vladivostok,Kazan,Volgograd,Stalingrad,Leningrad,Riga,Tallinn,Tampere,Turku,Uppsala,Malmö,Aarhus,Odense,Trondheim,Tromsø,Reykjavik,Cork,Galway,Belfast,Cardiff,Swansea,Nottingham,Newcastle,Sheffield,York,Bath,Canterbury,Douvres,Plymouth,Southampton,Portsmouth,La Haye,Utrecht,Maastricht,Groningue,Delft,Luxembourg,Trèves,Aix-la-Chapelle,Coblence,Mayence,Dortmund,Munster,Ratisbonne,Augsbourg,Bayreuth,Würzburg,Postdam,Potsdam,Weimar,Iéna,Magdebourg,Rostock,Lübeck,Kiel,Graz,Linz,Bregenz,Padoue,Trieste,Ravenne,Rimini,Ancône,Pérouse,Assise,Sorrente,Amalfi,Tarente,Lecce,Messine,Syracuse,Cagliari,Sassari,Bastia,Lisbonne,Coimbra,Faro,Braga,Madère,Funchal,Ségovie,Murcie,Tarragone,Gérone,Lérida,Saint-Jacques-de-Compostelle,Burgos,Valladolid,Oviedo,Santander,Vitoria,Andorre,Sarajevo,Dubrovnik,Zadar,Pula,Thessalonique,Héraklion,Rhodes,Corfou,Mykonos,Smyrne,Antalya,Ankara,Bodrum,Troie,Nicosie,Famagouste,Limassol,Beyrouth,Tyr,Sidon,Petra,Aqaba,Médine,La Mecque,Mascate,Charjah,Hanoï,Hué,Da Nang,Phuket,Chiang Mai,Angkor,Luang Prabang,Rangoun,Mandalay,Colombo,Kandy,Malé,Tachkent,Bichkek,Oulan-Bator,Taipei,Kaohsiung,Aalborg,Aarau,Abéché,Abou Simbel,Abuja,Acre,Adana,Aden,Agrigente,Ahmedabad,Ajaccio,Akron,Albany,Albuquerque,Alcala,Alger,Alkmaar,Almeria,Amboise,Amritsar,Anapa,Andijan,Annapolis,Aoste,Apt,Arezzo,Arnhem,Arras,Asmara,Asti,Athènes,Atlantic City,Ayacucho,Babylone,Badajoz,Baden-Baden,Bakou,Bamberg,Banff,Bangui,Barcelona,Barranquilla,Batoumi,Belém,Benghazi,Bergame,Berkeley,Beverly Hills,Bhopal,Biarritz,Bielefeld,Bizerte,Blackpool,Bochum,Bogor,Bolzano,Bournemouth,Bradford,Brasov,Brno,Bucarest,Buffalo,Bursa,Calais,Calvi,Camden,Campinas,Cannes,Cantorbéry,Capri,Carrare,Carthage,Caserte,Ceuta,Chamonix,Charleston,Chattanooga,Chemnitz,Chittagong,Chongqing,Cincinnati,Cluj,Côme,Constance,Constanta,Copacabana,Cortina,Crémone,Cuzco,Dakar,Dalian,Damas,Dar es Salam,Davos,Debrecen,Delphes,Derby,Des Moines,Deauville,Dhaka,Dijon,Dnipro,Donetsk,Douchanbé,Duisbourg,Dundee,Dunedin,Eilat,El Paso,Éphèse,Erfurt,Erzurum,Esbjerg,Évora,Exeter,Ferrare,Fort Lauderdale,Fremantle,Fresno,Fukuoka,Gaza,Gdynia,Gibraltar,Gijón,Gloucester,Gold Coast,Gorée,Göttingen,Guangzhou,Guilin,Gwangju,Haarlem,Halle,Hamilton,Hangzhou,Harare,Hartford,Helsingør,Hollywood,Hyderabad,Iasi,Ibadan,Indianapolis,Inverness,Iquitos,Irkoutsk,Islamabad,Ithaque,Jacksonville,Jaipur,Jakarta,Jalalabad,Jéricho,Jersey,Jodhpur,Jönköping,Juneau,Kairouan,Kandahar,Kaunas,Kingston,Kinshasa,Kiruna,Kisangani,Kolkata,Kotor,Kourou,Kowloon,La Nouvelle-Orléans,La Plata,Lahore,Las Palmas,Leicester,León,Livourne,Locarno,Lodz,Lomé,Long Beach,Louisville,Lourdes,Lublin,Lusaka,Luxor,Madurai,Mantoue,Maputo,Maracaibo,Marseille,Matera,Medan,Mérida,Milwaukee,Minsk,Miskolc,Modène,Montpellier,Moscou,Nairobi,Nazareth,Nijmegen,Nîmes,Nizhni Novgorod,Norfolk,Norwich,Oakland,Oklahoma City,Olbia,Omaha,Osnabrück,Otrante,Oulu,Palm Springs,Patras,Pavie,Pécs,Penang,Pescara,Peshawar,Plovdiv,Portofino,Posnanie,Poznan,Pouzzoles,Puebla,Pune,Punta Cana,Quimper,Quito,Rabat,Raleigh,Reading,Reggio,Rennes,Reno,Richmond,Rochester,Rouen,Sacramento,Saint-Louis,Saint-Moritz,Salerne,Salonique,Salt Lake City,Salvador de Bahia,San Antonio,San Juan,San Remo,Savannah,Sendai,Sharm el-Cheikh,Sibiu,Sintra,Sotchi,Stavanger,Strasbourg,Tabriz,Tacoma,Taormine,Tartu,Tbilissi,Tempe,Tianjin,Timisoara,Tokyo,Toulouse,Tozeur,Trabzon,Trente,Tucson,Tulsa,Udine,Varna,Vicence,Vigo,Vilnius,Wadi Halfa,Waikiki,Warwick,Whitehorse,Wiesbaden,Winchester,Wroclaw,Yalta,Yangon,Zermatt,Zhuhai,Afghanistan,Afrique du Sud,Agen,Albanie,Algérie,Allemagne,Amiens,Amsterdam,Angers,Angleterre,Angola,Angoulême,Annecy,Antibes,Arcachon,Argentine,Arles,Arménie,Aubervilliers,Aurillac,Australie,Autriche,Auxerre,Avignon,Azerbaïdjan,Bagdad,Bahamas,Bamako,Bangkok,Bangladesh,Bayonne,Beauvais,Belfort,Belgique,Belgrade,Bénin,Berlin,Berne,Besançon,Béziers,Birmanie,Blois,Bogota,Bolivie,Bosnie,Botswana,Boulogne,Bourges,Brésil,Brest,Brive,Bruxelles,Budapest,Buenos Aires,Bulgarie,Burkina Faso,Burundi,Caen,Cambodge,Cameroun,Canada,Cap-Vert,Caracas,Carcassonne,Cayenne,Chambéry,Charleville,Chartres,Chili,Chine,Chypre,Clermont-Ferrand,Cognac,Colmar,Colombie,Compiègne,Congo,Copenhague,Corée du Sud,Costa Rica,Croatie,Cuba,Danemark,Dieppe,Djibouti,Douai,Dublin,Dunkerque,Écosse,Égypte,Émirats arabes unis,Épinal,Équateur,Érythrée,Espagne,Estonie,États-Unis,Éthiopie,Évian,Évreux,Évry,Fécamp,Fidji,Figeac,Finlande,Foix,Fontainebleau,Forbach,Fort-de-France,Fougères,France,Fréjus,Gabon,Gap,Géorgie,Ghana,Grasse,Grèce,Grenoble,Groenland,Guadeloupe,Guatemala,Guinée,Guyane,Haïti,Havre,Hawaï,Helsinki,Hérouville,Honduras,Honfleur,Hongrie,Hyères,Inde,Indonésie,Irak,Iran,Irlande,Islande,Israël,Issoudun,Italie,Ivry,Jamaïque,Japon,Jarnac,Jérez,Joigny,Jordanie,Juan-les-Pins,La Rochelle,Laval,Le Mans,Lettonie,Liban,Liberia,Libye,Lima,Limoges,Lituanie,Londres,Lorient,Macédoine,Mâcon,Madagascar,Madrid,Malaisie,Mali,Malte,Marmande,Maroc,Martinique,Maurice,Mauritanie,Mayotte,Meaux,Melun,Metz,Mexico,Mexique,Monaco,Mongolie,Montauban,Monténégro,Moulins,Mulhouse,Namibie,Nancy,Nantes,Narbonne,Népal,Nevers,Niamey,Nicaragua,Niger,Nigeria,Niort,Norvège,Nouméa,Nouvelle-Zélande,Oman,Orange,Orléans,Oslo,Ottawa,Ouagadougou,Ouganda,Ouzbékistan,Oyonnax,Pakistan,Panama,Paraguay,Paris,Pau,Pays-Bas,Pékin,Périgueux,Pérou,Perpignan,Philippines,Poitiers,Pologne,Portugal,Prague,Privas,Reims,Réunion,Riyad,Roanne,Rodez,Rome,Roubaix,Roumanie,Royan,Russie,Rwanda,Ryad,Saint-Brieuc,Saint-Denis,Saint-Étienne,Saint-Malo,Saint-Nazaire,Saint-Tropez,Sarlat,Saumur,Sénégal,Séoul,Serbie,Sète,Singapour,Slovaquie,Slovénie,Sofia,Somalie,Soudan,Stockholm,Suède,Suisse,Syrie,Tahiti,Taïwan,Tanzanie,Tarbes,Tchad,Téhéran,Thaïlande,Thonon,Tibet,Toulon,Tourcoing,Tours,Troyes,Tulle,Tunis,Tunisie,Turquie,Valenciennes,Vannes,Varsovie,Venezuela,Verdun,Versailles,Vesoul,Vichy,Vienne,Vierzon,Vietnam,Villeurbanne',
    metier: 'abatteur,accessoiriste,accompagnateur,accordeur,accordéoniste,accoucheur,acheteur,acrobate,actuaire,acteur,actrice,acuponcteur,acupuncteur,adjoint,administrateur,agent,agent immobilier,agent de sécurité,agent de police,agent secret,agriculteur,aide-soignant,aiguilleur,ajusteur,alpiniste,ambassadeur,ambulancier,aménageur,analyste,anesthésiste,animateur,animalier,antiquaire,apiculteur,apprenti,arbitre,arboriculteur,archéologue,architecte,archiviste,armateur,armurier,arpenteur,artificier,artisan,artiste,assistant,assureur,astronaute,astronome,astrophysicien,athlète,aubergiste,audioprothésiste,auditeur,auteur,autrice,auxiliaire de vie,aviateur,avocat,avoué,aide-comptable,aide-cuisinier,affineur,affréteur,agronome,aquaculteur,arboriste,archer,argentier,armailli,ascensoriste,asphalteur,assembleur,astrologue,audiologiste,aumônier,aviculteur,bagagiste,baby-sitter,balayeur,banquier,barbier,barman,barmaid,bassiste,bâtonnier,batteur,bedeau,berger,bibliothécaire,bijoutier,biologiste,blanchisseur,bobineur,bottier,boucher,boulanger,bouquiniste,bourrelier,boxeur,brancardier,brasseur,brigadier,briquetier,brocanteur,brodeur,bûcheron,buraliste,bailli,bandagiste,baigneur,bateleur,batelier,bijoutier-joaillier,biochimiste,biographe,blogueur,bonnetier,botaniste,boutiquier,bouvier,boyaudier,braconnier,bronzier,bruiteur,bouilleur de cru,bosco,boulanger-pâtissier,bouteiller,cadreur,caissier,calligraphe,cameraman,camionneur,cantinier,cantonnier,capitaine,cardiologue,carreleur,caricaturiste,carrossier,cartographe,cascadeur,caviste,céramiste,chanteur,chapelier,charcutier,chargé de mission,charpentier,charron,chasseur,chauffagiste,chauffeur,chaudronnier,chef,chef cuisinier,chef d’orchestre,chef de chantier,chef de gare,chef d’entreprise,chercheur,chevrier,chiffonnier,chimiste,chiropracteur,chirurgien,chirurgien-dentiste,chocolatier,choréographe,chorégraphe,chroniqueur,cinéaste,clerc,clown,coach,cocher,coiffeur,collaborateur,colleur,comédien,commandant,commerçant,commercial,commissaire,commissaire-priseur,compagnon,compositeur,comptable,concierge,conducteur,conférencier,confiseur,conseiller,conservateur,consul,contremaître,contrôleur,convoyeur,coordinateur,cordier,cordonnier,correcteur,correspondant,costumier,coursier,courtier,couturier,couvreur,créateur,crêpier,critique,croupier,cueilleur,cuisinier,cultivateur,curé,cycliste,cariste,carillonneur,cartonnier,catcheur,célébrant,chaisier,chambellan,chambrier,chansonnier,chaufournier,chef de rang,chef pâtissier,chirurgien vétérinaire,cirier,clarinettiste,claviériste,commis,commis de cuisine,concepteur,conseiller d’orientation,consultant,contrebassiste,copiste,corsetier,costumière,coutelier,criminologue,cuirassier,cuisiniste,cartomancienne,charpentier de marine,community manager,danseur,décorateur,déménageur,démineur,démonstrateur,dentiste,dépanneur,député,dermatologue,designer,dessinateur,détective,développeur,diététicien,diplomate,directeur,disc-jockey,disquaire,docker,docteur,documentaliste,dompteur,douanier,doyen,dramaturge,droguiste,DJ,dactylographe,dame de compagnie,débardeur,débosseleur,décolleteur,décorateur d’intérieur,défenseur,dégustateur,demoiselle d’honneur,dépositaire,designer graphique,diamantaire,diffuseur,distillateur,distributeur,doreur,dresseur,drapier,ébéniste,éboueur,échevin,éclairagiste,économe,économiste,écrivain,écrivaine,éditeur,éducateur,électricien,électronicien,éleveur,élagueur,emballeur,embaumeur,employé,encadreur,encaisseur,endocrinologue,enquêteur,enseignant,entraîneur,entrepreneur,épicier,ergonome,ergothérapeute,escrimeur,esthéticien,étalagiste,étameur,ethnologue,étudiant,évêque,exploitant,expert,expert-comptable,explorateur,écuyer,émailleur,embouteilleur,émissaire,encadrant,encreur,enlumineur,ensemblier,épidémiologiste,éplucheur,équarrisseur,équipier,espion,essayeur,estimateur,évaluateur,examinateur,exterminateur,électromécanicien,électrotechnicien,ébarbeur,ecclésiastique,facteur,factrice,façonnier,fakir,fauconnier,femme de ménage,ferblantier,fermier,ferrailleur,ferronnier,figurant,fileur,financier,fiscaliste,fleuriste,flûtiste,fonctionnaire,fondeur,footballeur,forain,forestier,forgeron,formateur,fossoyeur,fourreur,frigoriste,fripier,friteur,fromager,fumiste,funambule,fabricant,faïencier,fantassin,figuriste,flic,fontainier,fondé de pouvoir,fouleur,fournisseur,franchisé,fruitier,galeriste,garagiste,garçon de café,garde,garde champêtre,garde du corps,garde forestier,gardien,gardien de but,gardien de la paix,gardien de nuit,gendarme,généalogiste,général,généticien,géographe,géologue,géomètre,gérant,gestionnaire,glacier,golfeur,gouvernante,gouverneur,graffeur,graphiste,graveur,greffier,grutier,guichetier,guide,guitariste,gymnaste,gynécologue,gantier,garde-chasse,garde-pêche,gardien d’immeuble,gastroentérologue,gemmologue,géophysicien,gériatre,gestionnaire de paie,glaciologue,goûteur,grainetier,grand reporter,grossiste,guérisseur,guide de montagne,habilleur,haltérophile,harpiste,hautboïste,héraut,herboriste,historien,homme d’affaires,horloger,horticulteur,hôte,hôtesse,hôtesse de l’air,hôtelier,huissier,humoriste,hydraulicien,hydrologue,hygiéniste,hématologue,héliciculteur,hôtesse d’accueil,hippothérapeute,homéopathe,hypnotiseur,iconographe,illusionniste,illustrateur,imam,importateur,imprimeur,infirmier,infographiste,informaticien,ingénieur,ingénieur du son,inspecteur,installateur,instituteur,instructeur,intendant,intérimaire,interne,interprète,inventeur,investisseur,imitateur,immunologue,impresario,industriel,infirmier anesthésiste,intégrateur,intervenant,isolateur,jardinier,joaillier,jockey,jongleur,journaliste,juge,juré,juriste,jardinier-paysagiste,joueur,joueur de foot,journalier,juge d’instruction,juge des enfants,jurisconsulte,kinésithérapeute,kiné,kinésiologue,laborantin,laboureur,laitier,lamineur,laveur,laveur de vitres,layetier,lecteur,légiste,législateur,lexicographe,libraire,lieutenant,linguiste,liquidateur,livreur,logisticien,loueur,luthier,lutteur,lunetier,lad,lanceur d’alerte,lapidaire,lavandière,licier,limier,lingère,logopède,maçon,magasinier,magicien,magistrat,maïeuticien,maire,maître d’hôtel,maître-chien,maître-nageur,majordome,manager,manipulateur,mannequin,manœuvre,manucure,maquettiste,maquilleur,maraîcher,marbrier,marchand,maréchal,maréchal-ferrant,marin,marionnettiste,maroquinier,marqueteur,masseur,mathématicien,matelot,mécanicien,médecin,médiateur,mémorialiste,menuisier,mercier,messager,métallier,météorologue,metteur en scène,meunier,militaire,mineur,ministre,miroitier,modéliste,moine,moniteur,monteur,moissonneur,motard,mousse,musicien,mytiliculteur,mareyeur,maître,maîtresse,maître d’école,majorette,mandataire,masseur-kinésithérapeute,matador,mécanicien auto,médecin généraliste,mentaliste,mercenaire,métreur,microbiologiste,mime,minotier,missionnaire,modiste,monnayeur,mosaïste,mouleur,moniteur de ski,moniteur d’auto-école,musicothérapeute,muséologue,nageur,naturaliste,naturopathe,navigateur,négociant,négociateur,néphrologue,nettoyeur,neurochirurgien,neurologue,notaire,nourrice,nutritionniste,nounou,narrateur,obstétricien,océanographe,oculiste,œnologue,officier,oncologue,opérateur,ophtalmologiste,ophtalmologue,opticien,orateur,orfèvre,organiste,orienteur,ornithologue,orthodontiste,orthopédiste,orthophoniste,orthoptiste,ostéopathe,ouvreuse,ouvrier,ostréiculteur,oiselier,oléiculteur,orchestrateur,ordonnateur,organisateur,otorhinolaryngologiste,ORL,ourdisseur,palefrenier,papetier,parachutiste,parfumeur,parqueteur,pasteur,pâtissier,patron,patineur,paveur,paysagiste,paysan,pêcheur,pédiatre,pédicure,pédopsychiatre,peintre,percepteur,percussionniste,perruquier,pharmacien,philosophe,photographe,physicien,physiothérapeute,pianiste,pilote,pisciniste,pizzaiolo,placier,plâtrier,plombier,plongeur,podologue,poète,poissonnier,policier,politicien,pompier,pompiste,porte-parole,porteur,portier,postier,potier,préfet,préparateur,présentateur,président,prêtre,producteur,professeur,programmateur,programmeur,projectionniste,promoteur,prothésiste,proviseur,psychanalyste,psychiatre,psychologue,psychomotricien,psychothérapeute,publicitaire,puériculteur,puéricultrice,pâtre,parolier,passeur,pédagogue,peintre en bâtiment,pépiniériste,perchiste,pilote d’avion,pilote de ligne,pisteur,plasticien,pneumologue,polisseur,pontonnier,portraitiste,praticien,prestidigitateur,procureur,prof,professeur des écoles,pupitreur,radiologue,ramoneur,rappeur,réalisateur,receveur,réceptionniste,recruteur,rédacteur,rédacteur en chef,régisseur,relieur,rémouleur,réparateur,répétiteur,reporter,représentant,restaurateur,retoucheur,rhumatologue,romancier,rôtisseur,routier,rabbin,racleur,radiothérapeute,rameur,rapporteur,recteur,réflexologue,régleur,relecteur,releveur,rempailleur,repasseur,réserviste,résineur,revendeur,rinceur,riziculteur,robinetier,rouleur,rugbyman,sage-femme,saisonnier,salarié,saltimbanque,sapeur-pompier,saunier,savant,saxophoniste,scaphandrier,scénariste,scénographe,scientifique,scripte,sculpteur,secouriste,secrétaire,sellier,sénateur,sergent,serrurier,serveur,shérif,skipper,sociologue,soigneur,soldat,sommelier,sondeur,sophrologue,soudeur,souffleur de verre,sous-chef,speaker,sportif,standardiste,statisticien,steward,sténographe,styliste,sismologue,surveillant,syndic,syndicaliste,sabotier,salinier,sauveteur,savonnier,scieur,sérigraphe,sidérurgiste,skieur,soliste,sonneur,sous-marinier,staffeur,stagiaire,stomatologue,surfeur,sylviculteur,tailleur,tailleur de pierre,tanneur,tapissier,tatoueur,taxidermiste,taxi,technicien,teinturier,téléconseiller,télévendeur,testeur,thanatopracteur,théologien,thérapeute,tisserand,toiletteur,tôlier,tonnelier,topographe,torero,tourneur,traducteur,traiteur,trapéziste,travailleur social,trésorier,tricoteur,trompettiste,trieur,trufficulteur,tuteur,typographe,tabellion,taupier,technicien de surface,téléopérateur,ténor,terrassier,thermicien,tireur,tisseur,tourier,toxicologue,transitaire,transporteur,tréfileur,triathlète,trotteur,tuilier,tuyauteur,urbaniste,urgentiste,urologue,usineur,vacher,vaguemestre,valet,valet de chambre,vannier,vendangeur,vendeur,verrier,vétérinaire,veilleur de nuit,vidéaste,vigile,vigneron,violoniste,violoncelliste,viticulteur,vitrailliste,vitrier,voiturier,volcanologue,voyagiste,voyant,voyageur de commerce,vulcanologue,vulcanisateur,vacataire,valet de pied,vendeur à domicile,veneur,vernisseur,versificateur,vétérinaire équin,vice-président,vicaire,webdesigner,webmaster,youtubeur,zoologiste,zoothérapeute,acheteur d’art,administrateur réseau,agent d’entretien,agent de voyage,agent de propreté,agent d’accueil,agent de sûreté,agent de joueurs,agent artistique,agent de change,agriculteur bio,aide-maternelle,aide à domicile,aiguiseur,allergologue,ambulancière,analyste financier,andrologue,animateur radio,animateur 3D,anthropologue,apothicaire,apprenti boulanger,arrangeur,artiste peintre,assistant social,assistant dentaire,assistante maternelle,attaché de presse,auxiliaire de puériculture,avocat général,bactériologiste,banquier d’affaires,barista,biostatisticien,blanchisseuse,boucher-charcutier,brigadier-chef,bûcheronne,cadre,cancérologue,capitaine de port,cascadeuse,cavalier,charcutier-traiteur,chargé de clientèle,chauffeur de bus,chauffeur de taxi,chauffeur routier,chef de projet,chef de rayon,chef de service,chef étoilé,choriste,clerc de notaire,coach sportif,coffreur,coiffeur-barbier,colporteur,commandant de bord,commissaire de police,concepteur-rédacteur,conducteur de train,conducteur d’engins,conseiller financier,conseiller principal d’éducation,conservateur de musée,contrôleur aérien,contrôleur de gestion,copilote,cordiste,couturière,créateur de mode,cycliste professionnel,data scientist,décorateur de théâtre,délégué médical,démographe,designer industriel,dessinateur industriel,développeur web,diététicienne,directeur artistique,directeur d’école,directeur financier,docteur en médecine,documentariste,dresseur de chiens,dresseuse,écailler,écologue,éducateur spécialisé,électricien auto,embryologiste,employé de banque,employé de bureau,enseignant-chercheur,entraîneur sportif,entomologiste,esthéticienne,ethnographe,fabricant de jouets,facteur d’orgues,ferronnier d’art,garde-côte,gardien de phare,gardien de zoo,gazier,géomètre-expert,gérant de magasin,guide touristique,guide-conférencier,héraldiste,historien de l’art,hôtesse de caisse,huissier de justice,hydrographe,infirmière,informaticienne,ingénieur agronome,ingénieur informaticien,inspecteur des impôts,intervenant social,joaillière,journaliste sportif,laborantine,lad-jockey,laveur de carreaux,lieutenant de police,livreur de pizzas,logisticienne,maçonne,magicienne,maire adjoint,maître-verrier,manutentionnaire,maraîchère,marchand de journaux,marin-pêcheur,masseuse,mécanicienne,médecin légiste,menuisière,météorologiste,militaire de carrière,moniteur d’équitation,monteur vidéo,musicienne,navigatrice,négociante,opticienne,ouvrier agricole,pâtissière,pharmacienne,pilote de chasse,plombier-chauffagiste,poissonnière,policière,pompière,préparatrice,professeur de musique,professeur de sport,psychologue scolaire,réalisatrice,rédactrice,restauratrice,romancière,secrétaire médicale,serveuse,sommelière,surveillante,tapissière,technicienne,traductrice,trésorière,vendeuse,vigneronne,viticultrice,agent de maîtrise,aide de camp,allumeur de réverbères,ambassadrice,amiral,anesthésiste-réanimateur,arbitre de football,avionneur,brodeuse,canotier,cardinal,cartier,chanoine,cloutier,colonel,conférencière,conservatrice,corroyeur,courtier en assurances,crieur,croque-mort,dentellière,douanière,écuyère,émailleuse,empailleur,épicière,escrimeuse,fabuliste,faïencière,fermière,filateur,fondeuse,fromagère,gabelou,galochier,gantière,garçon de ferme,gardienne,glacière,horlogère,huilier,imagier,infirmière de bloc,institutrice,intendante,jongleuse,journalière,juge de paix,luthière,maître d’armes,maître de chai,maître de conférences,maître-coq,maîtresse d’école,maréchal des logis,matelassier,mercière,meunière,miroitière,muletier,nautonier,oiselière,palefrenière,parfumeuse,passementier,pêcheuse,perruquière,porcher,potière,puisatier,quincaillier,quartier-maître,ramoneuse,relieuse,rempailleuse,rétameur,rôtisseuse,sabotière,sacristain,saunière,scieur de long,sellière,sonneur de cloches,tailleuse,tanneuse,tisserande,tonnelière,tourneuse,vannière,verrière,agricultrice,animatrice,apicultrice,avocate,banquière,bergère,bijoutière,bouchère,boulangère,caissière,chanteuse,chercheuse,chirurgienne,coiffeuse,comédienne,commerçante,conductrice,cuisinière,danseuse,décoratrice,dessinatrice,développeuse,directrice,éducatrice,électricienne,éleveuse,enseignante,entraîneuse,formatrice,gérante,historienne,horticultrice,hôtelière,illustratrice,ingénieure,inspectrice,jardinière,joueur professionnel,juriste d’entreprise,laitière,lettreur,livreuse,maquilleuse,marchande,monitrice,nageur professionnel,opératrice,ouvrière,paysanne,plombière,postière,professeure,sculptrice,soigneuse,soudeuse,tatoueuse,vachère',
    fruit: 'abricot,acérola,açaï,ail,airelle,akée,alkékenge,amande,amarante,ananas,aneth,angélique,anis,anone,arachide,arbouse,arroche,artichaut,asperge,aubergine,avocat,aveline,azerole,ail des ours,amande verte,abricot sec,banane,basilic,batavia,baie de goji,bergamote,bette,betterave,bigarade,bigarreau,blette,bleuet,brocoli,brugnon,butternut,bintje,belle de Fontenay,bourrache,brède,bok choy,burlat,cacahuète,calebasse,câpre,carambole,cardon,cardamome,carotte,cassis,cédrat,céleri,céleri-rave,cèpe,cerfeuil,cerise,champignon,chanterelle,chasselas,châtaigne,chayote,chicorée,chou,chou blanc,chou de Bruxelles,chou frisé,chou rouge,chou-fleur,chou-rave,chou chinois,christophine,ciboule,ciboulette,citron,citron vert,citronnelle,citrouille,clémentine,coing,concombre,conférence,coriandre,cornichon,courge,courgette,cranberry,cresson,cœur de bœuf,coco,noix de coco,canneberge,cantaloup,cavaillon,charentais,charlotte,cornouille,cynorhodon,chervis,crosne,carotte violette,cerise griotte,courge musquée,daïkon,datte,dent-de-lion,dolique,doucette,durian,dachine,datte fraîche,échalote,échalion,edamame,endive,épinard,escarole,estragon,épine-vinette,épi de maïs,fenouil,fève,féverole,figue,figue de Barbarie,flageolet,fraise,fraise des bois,framboise,fruit de la passion,fruit du dragon,feijoa,feuille de chêne,frisée,fruit à pain,fenugrec,fèves,gingembre,girolle,gombo,goyave,grenade,griotte,groseille,groseille à maquereau,golden,granny,granny smith,grenadille,guarana,gourgane,haricot,haricot vert,haricot beurre,haricot rouge,haricot blanc,haricot coco,haricot plat,haricot mange-tout,hélianthi,houblon,hysope,huckleberry,hijiki,iceberg,igname,icaque,ilama,italia,jaque,jamblon,jicama,jalapeño,jaboticaba,jostaille,jujube,kaki,kiwi,kumquat,kale,kiwano,konbu,kohlrabi,laitue,laitue romaine,laurier,lentille,lentille corail,lime,limette,litchi,lychee,livèche,longane,lotus,lucuma,lupin,lollo,lollo rosso,lablab,lima,mâche,macadamia,maïs,mandarine,mangue,mangoustan,manioc,marjolaine,marron,melon,menthe,mesclun,mirabelle,morille,mûre,muscat,myrtille,mangetout,maracuja,melon d’eau,mélisse,merise,mizuna,moringa,mousseron,myrobolan,nashi,navet,nectarine,nèfle,noisette,noix,noix de cajou,noix de pécan,noix du Brésil,noni,nori,navet boule d’or,nèfle du Japon,oca,oignon,ognon,okra,olive,olivette,orange,orange sanguine,origan,oronge,ortie,oseille,oignon rouge,oignon blanc,oignon nouveau,pak choï,pamplemousse,panais,papaye,passe-crassane,pastèque,patate,patate douce,pâtisson,pêche,pêche de vigne,persil,petit pois,physalis,pignon,piment,pissenlit,pistache,pitaya,plantain,pleurote,poire,poireau,pois,pois cassé,pois chiche,pois gourmand,poivron,pomelo,pomme,pomme de terre,potimarron,potiron,pourpier,prune,pruneau,pêche plate,pied-de-mouton,pomme d’amour,pomme cannelle,pomme reinette,pois mange-tout,poire williams,quetsche,quenette,radicchio,radis,radis noir,raifort,raisin,raisin sec,ramboutan,ratte,reine-claude,reinette,rhubarbe,romaine,romanesco,romarin,roquette,roseval,rutabaga,rapini,raiponce,rhapontic,salade,salicorne,salsifis,sarriette,sauge,scarole,shiitaké,soja,sucrine,sureau,sésame,satsuma,sapotille,sapote,shiso,scorsonère,tamarillo,tamarin,tangelo,tangerine,taro,tatsoï,tétragone,thym,tomate,tomate cerise,tomatillo,topinambour,trévise,truffe,ugli,vanille,verveine,vitelotte,valérianelle,victoria,wakame,wasabi,yuzu,abricot-pays,airelle rouge,amande douce,ananas victoria,asperge blanche,asperge verte,aubergine blanche,avocat hass,banane plantain,bette à carde,betterave rouge,betterave sucrière,bigarreau napoléon,brocoli romanesco,carotte fane,cassis noir,cerise noire,champignon de Paris,chou cabus,chou kale,chou pointu,chou vert,chou romanesco,citron caviar,citron de Menton,clémentine de Corse,coing du Japon,concombre des Antilles,courge butternut,courge spaghetti,cresson de fontaine,datte medjool,datte deglet nour,dattes,échalote grise,endive rouge,épinard de Nouvelle-Zélande,fenouil sauvage,fève des marais,figue violette,flageolet vert,fraise gariguette,fraise mara des bois,framboise jaune,goyave rose,groseille blanche,haricot d’Espagne,haricot tarbais,haricot lingot,haricot noir,haricot mungo,igname blanche,kiwi jaune,laitue feuille de chêne,laitue batavia,lentille verte,lentille du Puy,lentille blonde,maïs doux,melon charentais,melon jaune,mirabelle de Lorraine,mûre sauvage,myrtille sauvage,navet jaune,noix de Grenoble,oignon doux,oignon des Cévennes,olive noire,olive verte,orange amère,orange navel,pamplemousse rose,pêche blanche,pêche jaune,piment d’Espelette,piment oiseau,poire conférence,poire comice,poivron rouge,poivron vert,poivron jaune,pomme golden,pomme gala,pomme fuji,pomme pink lady,pomme de terre nouvelle,prune reine-claude,prune d’Ente,quetsche d’Alsace,radis rose,raisin blanc,raisin noir,raisin muscat,roquette sauvage,salsifis noir,tomate cœur de bœuf,tomate grappe,tomate ananas,tomate noire de Crimée,truffe noire,truffe blanche,amélanche,argousier,baie d’argousier,cerise de terre,chicon,chou-navet,citron doux,coqueret,courgette ronde,crambe,framboise noire,groseille à grappes,haricot vert extra-fin,kiwaï,lentillon,loquat,mâche sauvage,maceron,mûron,navet de Nancy,noix de macadamia,olive de Nyons,orange de Valence,ortie blanche,panais sauvage,pâtisson blanc,pimprenelle,poire de terre,pois carré,pomme d’api,prunelle,radis daïkon,radis long,reine-claude dorée,sureau noir,tétragone cornue,tomate verte,tomate olivette,abricot du Japon,ail rose,ail blanc,ail violet,ananas pain de sucre,baie de sureau,banane figue,banane rose,basilic thaï,blette à côtes,brocoli-rave,caïmite,cajou,cerise de Montmorency,châtaigne d’eau,chayotte,chicorée frisée,chou de Milan,chou-fleur violet,ciboulette chinoise,clémenvilla,combava,concombre amer,corossol,courge de Nice,crosne du Japon,curuba,durion,échalote cuisse de poulet,endive de pleine terre,épinard sauvage,figue de Solliès,gingembre frais,giraumon,goji,grenadelle,groseille de Chine,guanabana,haricot adzuki,haricot azuki,haricot borlotti,haricot cornille,haricot de Soissons,haricot kidney,hélianthe,igname violette,kiwi de Nouvelle-Zélande,laitue iceberg,laurier-sauce,limequat,longan,lulo,maracudja,melon d’Espagne,mombin,oca du Pérou,oignon grelot,olive de Kalamata,oseille sauvage,pepino,piment doux,piment végétarien,pitahaya,poire nashi,poivron doux,pomme de cajou,pomme-poire,pomme rose,potiron bleu,prune du Japon,rhubarbe rouge,salade verte,salak,santol,sapote noire,tomate cerise jaune,vanille bourbon,vitelotte noire',
    objet: 'abat-jour,abreuvoir,accoudoir,affiche,agenda,agrafe,agrafeuse,aiguille,aiguière,aimant,alarme,album,alliance,allume-feu,allumette,allume-cigare,alambic,amphore,ampoule,amulette,ancre,anneau,antenne,appareil photo,applique,aquarium,arbalète,arc,ardoise,armoire,arrosoir,ascenseur,aspirateur,assiette,atlas,attache,attache-trombone,autocuiseur,aviron,avion en papier,anse,abaque,accordéon,aérosol,affûteur,aiguisoir,aile,alêne,appareil,appeau,applique murale,arceau,argenterie,arme,armature,armure,arquebuse,arroseur,assiette creuse,astrolabe,attelle,autoradio,auge,avertisseur,babiole,bac,badge,bague,baguette,baguier,bahut,baignoire,baladeur,balai,balai-brosse,balance,balançoire,balancier,balise,balle,ballon,banc,banderole,bandeau,bandoulière,banjo,banquette,baquet,barbecue,baril,baromètre,barque,barrette,barrière,bascule,bassine,bassinoire,bâton,batte,batterie,battoir,bavoir,bec verseur,béquille,berceau,bergère,besace,beurrier,biberon,bibelot,bibliothèque,bidet,bidon,bigoudi,bijou,bilboquet,bille,billard,billet,blaireau,bloc-notes,bobine,bocal,boîte,boîte aux lettres,bol,bombe,bonbonnière,bonnet,bottes,bouchon,bouée,bougeoir,bougie,bouilloire,boule,boulier,bouquet,bourse,boussole,bouteille,bouton,bracelet,brancard,bretelle,briquet,broche,brosse,brosse à dents,brouette,buffet,bureau,burin,buvard,boîtier,bol à café,bombe de peinture,bonbonne,borne,boulon,bourriche,bracelet-montre,brassard,broc,brochette,brûle-parfum,bustier,buzzer,bâche,bâtonnet,baffle,balconnet,balluchon,bandage,barillet,battant,benne,blason,bloc,bobinette,bottine,bouillotte,bouquin,bourrelet,brassière,bride,bristol,broyeur,bugle,burette,cabas,cadenas,cadran,cadre,cafetière,cage,cahier,caisse,calculatrice,calculette,calendrier,calepin,calice,caméra,camescope,canapé,canif,canne,canne à pêche,canon,capuchon,carabine,carafe,carillon,carnet,carpette,carte,carte bleue,cartable,carton,cartouche,casque,casquette,casserole,cassette,catapulte,ceinture,cendrier,cercueil,chaîne,chaise,chaise longue,chalumeau,chandelier,chandelle,chapeau,chapelet,chargeur,chariot,charnière,charrue,chaudron,chaudière,chaussette,chausson,chaussure,chausse-pied,chemise,chevalet,chevalière,cheville,chronomètre,cierge,cigare,cigarette,cintre,cirage,ciseau,ciseaux,clairon,clavier,clé,clef,clou,cloche,clochette,coffre,coffre-fort,coffret,collier,commode,compas,compte-gouttes,console,coquetier,cor,corbeille,corde,cordon,cornemuse,cornet,couche,coupe,coupe-ongles,coupelle,couperet,couronne,courroie,coussin,couteau,couvercle,couverture,crayon,crémaillère,crochet,croix,cruche,cuillère,cuiller,cuisinière,cuvette,cymbale,câble,cachet,cadran solaire,cage à oiseaux,cale,calumet,candélabre,canette,carafon,cartel,casier,casse-noix,casse-tête,chambre à air,charentaise,chaufferette,chevet,chignole,chiffon,chope,cithare,clapet,clavecin,claquette,clepsydre,clignotant,cocotte,cocotte-minute,coquille,cordelette,corset,cotillon,coupe-papier,couffin,coutelas,couvert,crampon,cravache,cravate,crécelle,crépine,cric,crosse,cuirasse,cuve,dague,dé,dé à coudre,débouche-évier,décapsuleur,déambulateur,défibrillateur,dentier,dentifrice,dépliant,déodorant,desserte,dessous-de-plat,détecteur,diable,diadème,diapason,dictaphone,dictionnaire,diffuseur,digicode,disque,disquette,divan,domino,dossier,douche,douille,drap,drapeau,drone,dynamo,dynamite,damier,dais,débroussailleuse,décodeur,dentelle,dévidoir,diamant,dosette,doudou,draisienne,dressoir,duvet,écharpe,échasse,échelle,échiquier,écouteur,écran,écritoire,écrou,écrin,écuelle,écumoire,édredon,égouttoir,élastique,électrophone,éolienne,enceinte,enclume,encensoir,encre,encrier,enseigne,entonnoir,enveloppe,épée,épingle,épingle à nourrice,éponge,épouvantail,équerre,escabeau,escarpin,essoreuse,essuie-glace,essuie-mains,étagère,étau,étendoir,éteignoir,étendard,étiquette,étrier,étui,évier,éventail,extincteur,écouvillon,écran plat,égrugeoir,électroaimant,emporte-pièce,épuisette,escarcelle,espadrille,étamine,étançon,étole,éprouvette,épingle à cheveux,essieu,fanion,fauteuil,fer à repasser,fer à cheval,feutre,feu d’artifice,ficelle,fiche,figurine,filet,flacon,flambeau,flèche,flûte,fontaine,forceps,foulard,four,four à micro-ondes,fourche,fourchette,fourneau,fouet,frein,frigo,fronde,fusil,fusée,fût,fil,fermeture éclair,fiole,flipper,flûte à bec,fourreau,frisbee,faitout,fait-tout,fanal,fer à souder,fermoir,ferret,fétiche,fibule,filtre,fixe-chaussette,flasque,flotteur,foret,fourre-tout,friteuse,fusible,futon,gaine,gamelle,gant,gant de toilette,garde-manger,garde-robe,gaufrier,gazinière,gilet,girouette,glace,glacière,globe,gobelet,godet,gomme,gond,gong,gourde,gourdin,goupillon,gouttière,gouvernail,grappin,grattoir,grelot,grenade,grille,grille-pain,gril,guéridon,guidon,guillotine,guirlande,guitare,gyrophare,gant de boxe,gibecière,gnomon,godille,gravure,grillage,grue,guêtre,guimbarde,guirlande électrique,hache,hachette,hachoir,haltère,hamac,hameçon,hampe,harmonica,harpe,harpon,haut-parleur,hélice,herse,horloge,hotte,housse,hublot,huilier,hochet,horodateur,hotte aspirante,housse de couette,humidificateur,hygromètre,imperméable,imprimante,instrument,interrupteur,isoloir,insecticide,inhalateur,image,icône,incubateur,interphone,jarre,jarretière,javelot,jerrican,jeton,jeu de cartes,jonc,jouet,journal,jumelles,jupe,jardinière,joystick,jukebox,jatte,jambière,javelle,jeu,joug,kayak,képi,kimono,kit,klaxon,kaléidoscope,lacet,laisse,lampadaire,lampe,lampe de poche,lampion,lance,lance-pierre,landau,lanterne,lasso,lavabo,lave-linge,lave-vaisselle,layette,lecteur,lentille,lessiveuse,lime,linge,lingot,liseuse,lit,litière,livre,loquet,lorgnette,louche,loupe,luge,lunette,lunettes,lustre,luth,lance-flammes,lampe-torche,lanière,latte,lingette,liquette,litre,lorgnon,lyre,machette,machine à coudre,machine à laver,machine à écrire,maillet,maillot,malle,mallette,mandoline,manette,mangeoire,manivelle,mannequin,manteau,maquette,marionnette,marmite,marque-page,marteau,marteau-piqueur,martinet,masque,massue,matelas,médaille,médaillon,mégaphone,mètre,métronome,meuble,micro,microphone,micro-ondes,microscope,miroir,missile,mitaine,mixeur,mobile,mocassin,montre,moquette,mors,mortier,mouchoir,moufle,moule,moulin,moulin à poivre,moulinette,mousqueton,mousquet,mug,muselière,mégot,magnétophone,maillon,maracas,marchepied,masque de plongée,matraque,mèche,menotte,menottes,mesure,minuterie,mitraillette,moustiquaire,muleta,nacelle,nappe,napperon,narguilé,navette,nécessaire,niche,nichoir,niveau,nœud papillon,nounours,nasse,nuancier,objectif,oreiller,orgue,ordinateur,ordinateur portable,ombrelle,ostensoir,outil,ouvre-boîte,ouvre-bouteille,ocarina,oriflamme,oreillette,osselet,paillasson,palette,palme,panier,panneau,pantalon,pantoufle,papier,parachute,parapluie,paravent,parasol,parchemin,passoire,patère,patin,patinette,patin à roulettes,pavé,peigne,peignoir,peluche,pelle,pellicule,pendentif,pendule,percolateur,perceuse,perche,perle,perruque,pèse-personne,pétard,phare,photo,piano,pichet,pièce,piège,pilon,pince,pince à linge,pinceau,pioche,pipe,pipette,piquet,pistolet,placard,plafonnier,plaid,planche,planche à repasser,plateau,plumeau,plume,poêle,poêlon,poignard,pointeur,pompe,porte-clé,porte-clés,porte-monnaie,portefeuille,portemanteau,portique,pot,potiche,poubelle,poudrier,poulie,poupée,poussette,presse,presse-papier,presse-agrumes,projecteur,pupitre,puzzle,pyjama,parure,passe-montagne,pédalier,pelote,perforatrice,périscope,pèse-lettre,phonographe,pic,pince-nez,piolet,pipeau,pistolet à eau,plaque,pneu,polaroïd,polochon,pommeau,porte-bébé,porte-parapluie,porte-savon,porte-serviette,portrait,pot de fleurs,poterie,pouf,présentoir,prise,prisme,pulvérisateur,rabot,radar,radiateur,radio,radiocassette,radeau,rallonge,rame,rampe,rape,raquette,rasoir,râteau,râtelier,réchaud,récipient,réfrigérateur,règle,réglette,réveil,réveille-matin,revolver,rideau,rivet,robe,robinet,robot,rouleau,rouleau à pâtisserie,roue,ruban,rouet,raclette,ramasse-miettes,rapière,récepteur,rehausseur,relieur,remorque,repose-pied,rétroprojecteur,rétroviseur,rince-doigts,roulette,routeur,sabre,sabot,sac,sac à dos,sac à main,sachet,saladier,salière,sandale,sarbacane,sarcloir,saucière,savon,savonnette,scalpel,sceau,seau,sécateur,sèche-cheveux,sèche-linge,séchoir,selle,seringue,serpe,serpillière,serre-joint,serre-tête,serrure,serviette,siège,sifflet,sirène,skateboard,ski,smartphone,socle,sommier,sonnette,soucoupe,soufflet,soulier,soupière,souris,spatule,sphère,statue,statuette,store,stylo,stylet,sucrier,support,surligneur,sablier,sac de couchage,salopette,scie,sculpture,sextant,shampooing,skate,soliflore,sonde,sous-verre,stéthoscope,stylo-plume,suspension,table,table de nuit,tableau,tablette,tablier,tabouret,taille-crayon,tambour,tambourin,tamis,tampon,tapis,tasse,taie,télécommande,télescope,téléphone,téléviseur,télévision,tenaille,tenailles,tente,théière,thermomètre,thermos,timbale,timbre,tire-bouchon,tirelire,tiroir,tisonnier,toboggan,toile,toise,tomahawk,tondeuse,tonneau,torche,torchon,tournevis,toupie,trampoline,transat,trappe,traversin,trépied,tricycle,trident,tringle,trombone,trompette,trottinette,trousse,truelle,tube,tuba,tuile,tuyau,tapisserie,tasseau,tatami,téléscripteur,tenon,terrine,thermostat,tiare,tire-fesses,toque,torchère,tourne-disque,tournebroche,trémail,tréteau,tricorne,trophée,trousseau,tuteur,ustensile,urne,uniforme,vaisselier,valise,vaporisateur,vase,veilleuse,vélo,ventilateur,ventouse,verre,verrou,veste,vis,visière,visseuse,vitrail,vitre,vitrine,voile,volant,volet,vaisselle,vannerie,vélocipède,vide-poche,vilebrequin,violon,vinyle,visiophone,voilette,wok,xylophone,yo-yo,zapette,porte,fenêtre,voiture,moto,bateau,avion,camion,télé,ordi,portable,abat-son,accroche-torchon,adaptateur,affûtoir,agrafe murale,aiguille à tricoter,aimant de frigo,allonge,alliance en or,amplificateur,ampli,anneau de rideau,antivol,appareil dentaire,aquarelle,ardoise magique,armoire à pharmacie,arrache-clou,attache-parisienne,atomiseur,autocollant,avertisseur sonore,babyphone,bac à glaçons,bac à sable,badine,bague de fiançailles,baguette magique,baignoire sabot,bain-marie,balai-éponge,balance de cuisine,baladeuse,balayette,balconnière,ballon de foot,ballon de rugby,bandelette,barre de fer,batteur,bavette,bec Bunsen,bêche,berlingot,bidon d’essence,billet de banque,biseau,blender,boîte à bijoux,boîte à chaussures,boîte à musique,boîte à outils,boîte de conserve,bol à soupe,bombe à eau,bonde,bonnet de nuit,borne d’arcade,bottillon,bouchon de liège,bougie parfumée,bouilloire électrique,boule à neige,boule de pétanque,boule de bowling,bouteille d’eau,bouton de manchette,bracelet brésilien,briquet tempête,broche à cheveux,brosse à cheveux,brosse à habits,brûleur,bureau d’écolier,buste,cache-pot,cadenas à code,cadre photo,cafetière italienne,cage à hamster,cahier de brouillon,caisse enregistreuse,calculatrice solaire,calendrier de l’Avent,caméra de surveillance,canapé-lit,canne blanche,capot,capsule,carafe à eau,carillon éolien,carnet de notes,carte postale,carte à jouer,carte d’identité,carte mère,carte SIM,cartouche d’encre,casque audio,casque de moto,casque de vélo,casse-noisette,casserole à lait,cassette vidéo,catadioptre,ceinture de sécurité,chaîne hi-fi,chaise haute,chaise pliante,chancelière,chapeau de paille,chargeur de téléphone,chariot de courses,chasse-mouches,chausse-trappe,chaussette de Noël,chauffe-eau,chevillière,chiffonnier,chronographe,ciseaux à ongles,clavier d’ordinateur,clé à molette,clé USB,clé plate,coffre à jouets,coffret à bijoux,collier de chien,compresse,compteur,cône,congélateur,console de jeux,corbeille à papier,corde à linge,coupe-frites,coupe-légumes,coussin péteur,couteau suisse,couteau de cuisine,couverts,couverture de survie,crayon de couleur,crayon à papier,crochet à tricoter,cuillère à soupe,cuillère en bois,cuiseur vapeur,dé à jouer,débouchoir,décapeur,déchiqueteuse,déshumidificateur,dessous de verre,détecteur de fumée,diffuseur de parfum,disque dur,disjoncteur,distributeur,doseur,drap-housse,dossier suspendu,douche à main,échelle de corde,écouteurs,écran d’ordinateur,égouttoir à vaisselle,élastique à cheveux,embauchoir,émetteur,enceinte bluetooth,enrouleur,enveloppe à bulles,épingle à linge,épluche-légumes,éponge magique,essuie-tout,étagère murale,étendoir à linge,étui à lunettes,extracteur de jus,fer à friser,fer à lisser,fermeture,feutre effaçable,fiche électrique,filet à papillons,filet de pêche,flacon de parfum,flûte à champagne,fontaine à eau,fouet de cuisine,four à pain,fourchette à gâteau,frottoir,fusil de chasse,gant de cuisine,gant de jardinage,garde-boue,gilet jaune,glace de poche,globe terrestre,gobelet en plastique,gomme magique,goupille,guirlande lumineuse,guitare électrique,hachoir à viande,horloge murale,housse de téléphone,imprimante 3D,jarretelle,jeu de clés,jeu de dés,jerricane,jeton de caddie,jupon,lampe à huile,lampe de chevet,lampe frontale,lance à incendie,lanterne magique,lecteur DVD,lime à ongles,linge de maison,lingot d’or,lit superposé,livre de cuisine,lunettes de soleil,machine à café,machine à pain,manche à balai,mappemonde,masque de ski,matelas gonflable,meuble à chaussures,micro-casque,minuteur,miroir de poche,mixeur plongeant,mobile musical,moniteur,montre connectée,moulin à café,moulin à sel,nappe cirée,niveau à bulle,nœud,ordinateur de bord,orgue de Barbarie,ouvre-lettre,pailles,panier à linge,panier à pique-nique,pansement,parapluie pliant,passe-partout,patin à glace,peigne fin,pèse-bébé,pierre ponce,pile,pince à épiler,pince à sucre,pince coupante,piquet de tente,pistolet à colle,planche à découper,planche de surf,plaque de cuisson,plat à gratin,plateau-repas,poche à douille,poêle à frire,pompe à vélo,porte-bagages,porte-documents,porte-revues,pot de chambre,poubelle de tri,presse-ail,presse-purée,radio-réveil,rallonge électrique,râpe à fromage,raquette de tennis,rasoir électrique,rideau de douche,robot ménager,rouleau adhésif,ruban adhésif,sac poubelle,sac isotherme,savonnière,seau à glace,selle de vélo,serre-livres,serviette de bain,siège auto,souffleur,sous-main,stylo à bille,stylo-feutre,support de téléphone,table basse,table à repasser,tableau blanc,tablette tactile,taille-haie,tapis de souris,tapis de yoga,tasse à café,taie d’oreiller,téléphone portable,toile cirée,tondeuse à gazon,tournevis cruciforme,trousse de secours,trousseau de clés,tuyau d’arrosage,valise à roulettes,verre à pied,voilage,yaourtière,abreuvoir à oiseaux,accroche-cœur,afficheur,agrafeuse murale,aiguillon,alidade,allumoir,alpenstock,altimètre,ampèremètre,anémomètre,anneau de clés,appui-tête,aquarium à poissons,arrosoir en zinc,aspirateur-robot,assiette à dessert,attrape-rêves,autoclave,bac à légumes,bague-serviette,balise GPS,ballast,bandonéon,barre de pompe,baromètre anéroïde,bâton de marche,batte de baseball,bavoir en tissu,bec de gaz,bélinographe,bidon à lait,billot,binette,bitte d’amarrage,blague à tabac,boîte à gants,boîte à pain,boîte à sucre,boîte à thé,bombonne,bouclier,bougeoir en cuivre,boussole de poche,brasero,brise-bise,broc à eau,câble électrique,cabestan,cachet de cire,cafetière à piston,caisse à outils,cale-porte,capteur,carabine à plombs,carnet à spirale,carrousel,casserole en cuivre,cendrier en verre,chasse-clou,cheval de bois,cisaille,clé anglaise,cloche à fromage,coquemar,corne de brume,coupe-cigare,couronne de fleurs,crémier,cuillère à café,dame-jeanne,décamètre,dés à coudre,diapositive,disque vinyle,dosimètre,dynamomètre,écrou papillon,égoïne,électroscope,embout,entrave,épingle à chapeau,éprouvette graduée,éventoir,faucille,faux,fer à gaufres,fil à plomb,fléau,fouloir,fourche à foin,fusain,gaffe,garde-temps,genouillère,gobelet à dés,gouge,gravoir,grenouillère,guillotine à papier,herminette,hotte à vendange,houe,isolateur,jarre à huile,jauge,jeton de poker,lampe tempête,lance-pierres,lanterne de poche,levier,lime à bois,louchet,luge en bois,mandrin,masse,mètre ruban,micromètre,mortier et pilon,mouchette,niveau laser,ombrelle de dentelle,ouvre-huître,pagaie,palan,pantographe,pic à glace,pied à coulisse,pistolet à clous,plane,plantoir,pointeau,pot-pourri,presse-étoupe,pulvérisateur à dos,queue de billard,rabot de menuisier,racloir,rapporteur,rateau à feuilles,riflard,rondache,sablier de cuisine,sabre laser,scie sauteuse,scie circulaire,serpette,sonotone,spatule en bois,taille-bordure,taraud,tarière,télémètre,théodolite,tire-lait,tournevis électrique,treuil,turbine,vaporisateur de parfum,vrille,xylophone en bois,yoyo lumineux,blouson,couette,hélicoptère,imper,jean,peinture,pull,punaise,van',
    couleur: 'abricot,acajou,aigue-marine,albâtre,alezan,amande,amarante,ambre,améthyste,anis,anthracite,ardoise,argent,argenté,aubergine,auburn,azur,azuré,beige,bis,bistre,blanc,blanc cassé,bleu,bleu ciel,bleu marine,bleu roi,bleu nuit,bleuâtre,blond,bordeaux,brique,bronze,brun,bruni,caca d’oie,cacao,café,caramel,carmin,carotte,céladon,cerise,céruléen,chamois,champagne,chocolat,cinabre,citron,citrouille,cobalt,coquelicot,corail,crème,cramoisi,cuivre,cyan,doré,ébène,écarlate,émeraude,étain,fauve,feuille-morte,framboise,fraise,fuchsia,garance,gris,gris perle,grenat,groseille,glauque,havane,indigo,ivoire,jade,jaune,jaune citron,jaunâtre,kaki,lavande,lie-de-vin,lilas,lin,magenta,mandarine,marine,marron,mauve,menthe,miel,moutarde,nacré,noir,noisette,ocre,olive,or,orange,orchidée,outremer,paille,pastel,perle,pervenche,pistache,platine,pourpre,prune,prunelle,puce,rose,rose bonbon,rose fuchsia,rouge,rouille,roux,rubis,safran,sable,saphir,saumon,sépia,sienne,souris,taupe,terracotta,terre de Sienne,tilleul,tomate,topaze,turquoise,vermeil,vermillon,vert,vert bouteille,vert pomme,vert d’eau,vert sapin,violet,violine,zinzolin,bleu canard,bleu pétrole,bleu électrique,blanc d’Espagne,rouge sang,rose saumon,vert olive,jaune moutarde,gris anthracite,mordoré,nankin,opale,pêche,sang,sanguine,sinople,tabac,tangerine,vanille,vieux rose,violacé,grège,écru',
    sport: 'aérobic,aïkido,alpinisme,apnée,aquagym,athlétisme,aviron,badminton,base-ball,basket,basket-ball,beach-volley,biathlon,billard,BMX,bobsleigh,boccia,bodyboard,boule,boules,boxe,boxe française,bowling,bridge,canoë,canoë-kayak,canyoning,capoeira,catch,char à voile,cheerleading,cricket,croquet,crossfit,cross,curling,cyclisme,danse,décathlon,deltaplane,descente,dressage,échecs,équitation,escalade,escrime,fitness,fléchettes,football,foot,football américain,footing,futsal,golf,gymnastique,gym,haltérophilie,handball,hand,heptathlon,hockey,hockey sur glace,jet-ski,jogging,joute,judo,ju-jitsu,jiu-jitsu,karaté,karting,kayak,kendo,kickboxing,kitesurf,krav-maga,lancer de javelot,lancer du poids,luge,lutte,marathon,marche,marche nordique,motocross,moto,motonautisme,musculation,natation,natation synchronisée,netball,parachutisme,parapente,patinage,patinage artistique,patin à roulettes,pelote basque,pentathlon,pétanque,pilates,ping-pong,planche à voile,plongée,plongeon,polo,quad,racquetball,rafting,rallye,randonnée,rink-hockey,roller,rugby,running,saut à la perche,saut en hauteur,saut en longueur,saut à l’élastique,skateboard,skeleton,ski,ski alpin,ski de fond,ski nautique,slalom,snowboard,softball,spéléologie,squash,sumo,surf,taekwondo,tennis,tennis de table,tir,tir à l’arc,trampoline,triathlon,ULM,ultimate,varappe,vélo,VTT,voile,volley,volley-ball,water-polo,yoga,zumba,aqua-bike,boxe thaï,course,course à pied,course automobile,cyclo-cross,danse sportive,freestyle,golf miniature,gouren,handisport,hockey sur gazon,horse-ball,javelot,kung-fu,lutte gréco-romaine,muay-thaï,nage,orientation,padel,paddle,pêche,sambo,savate,ski de randonnée,sprint,steeple,stretching,sauvetage,tambourin,trail,vélo de route,voltige,wakeboard,windsurf',
    plat: 'aligot,andouille,andouillette,anchoïade,antipasti,apfelstrudel,aïoli,assiette anglaise,aubergines farcies,baba au rhum,baguette,baklava,barbe à papa,bavarois,béchamel,beignet,beurre,biscuit,bisque,blanquette,blanquette de veau,blinis,bœuf bourguignon,bœuf stroganoff,bolognaise,bouchée à la reine,boudin,boudin blanc,bouillabaisse,bouillon,boulette,bretzel,brioche,brochette,brownie,bruschetta,burger,burrito,bûche,bûche de Noël,cake,calzone,canard à l’orange,canelé,cannelloni,carbonara,cari,carpaccio,cassoulet,céréales,chakchouka,charlotte,chausson aux pommes,cheesecake,chili,chili con carne,chips,chocolat,chorizo,chou à la crème,choucroute,chouquette,civet,clafoutis,cookie,coq au vin,confit de canard,confiture,cornet,cornflakes,couscous,crème brûlée,crème caramel,crème anglaise,crème chantilly,crêpe,croissant,croque-madame,croque-monsieur,croquette,croûton,crumble,crudités,curry,dal,dinde farcie,donut,dorade grillée,dragée,éclair,éclair au chocolat,émincé,empanada,enchilada,entrecôte,épinards à la crème,escalope,escalope milanaise,escargots,estouffade,fajitas,falafel,far breton,farci,feuilleté,fish and chips,flan,flammekueche,focaccia,foie gras,fondue,fondue savoyarde,fondant,fraisier,frangipane,frites,friand,fricassée,fromage,fromage blanc,galette,galette des rois,gaspacho,gâteau,gâteau au chocolat,gaufre,gigot,gnocchi,gougère,goulash,gratin,gratin dauphinois,guacamole,gyros,hachis parmentier,hamburger,harira,haricots verts,hot-dog,houmous,huîtres,île flottante,jambon,jambon-beurre,jambalaya,kebab,ketchup,kig ha farz,kouign-amann,lasagnes,lapin à la moutarde,lentilles,macaron,macaronis,madeleine,magret,magret de canard,maki,mayonnaise,merguez,meringue,mille-feuille,minestrone,moelleux,moules-frites,moules marinières,moussaka,mousse au chocolat,muffin,nachos,navarin,nems,nougat,nouilles,nuggets,œuf,œuf mimosa,œufs brouillés,omelette,onglet,osso buco,pad thaï,paëlla,pain,pain au chocolat,pain d’épices,pain perdu,pancake,panna cotta,parmentier,pastilla,pâté,pâté en croûte,pâtes,paupiette,pavlova,pesto,petit-beurre,piperade,pissaladière,pizza,poêlée,polenta,porridge,pot-au-feu,potage,potée,poulet,poulet basquaise,poulet rôti,profiterole,pudding,purée,quatre-quarts,quiche,quiche lorraine,raclette,ragoût,ramen,ratatouille,ravioli,religieuse,rillettes,risotto,riz,riz au lait,rôti,rougail,rouleau de printemps,sablé,salade,salade niçoise,salade César,sandwich,sardines,sauce,saucisse,saucisson,saumon fumé,sauté,savarin,scone,semoule,soufflé,soupe,soupe à l’oignon,spaghetti,spaghettis,steak,steak frites,steak tartare,strudel,sushi,tacos,tagine,tajine,taboulé,tapenade,tapioca,tarte,tarte aux pommes,tarte Tatin,tartiflette,tartine,tempura,terrine,tiramisu,toast,tofu,tomates farcies,tortilla,tourte,tourteau fromager,truffade,velouté,vermicelles,vichyssoise,vol-au-vent,waterzooi,wok,yaourt,yogourt,zakouski,zabaglione,ziti,boulgour,beignet de courgette,blé,brandade,bœuf mode,bolo,cervelas,coquillettes,crozets,fromage de tête,galantine,graton,kouglof,lardons,loukoum,marmelade,miel,mouclade,oreillettes,panisse,parisien,pogne,quenelle,rösti,socca,soupe de poisson,tapas,tourin,tuile,vacherin,welsh,yassa,mafé,thiéboudienne,accras,colombo,samoussa,tagliatelles,penne,fusilli,farfalle,linguine,macaroni,cordon bleu,carbonade,flamiche,potjevleesch,ficelle picarde,pan bagnat,bugne,merveille,pets-de-nonne,calisson,cannelé,berlingot,caramel,chouchou,crêpe Suzette,croquembouche,dacquoise,financier,forêt-noire,gâteau basque,kouign-aman,massepain,mendiant,moka,nonnette,opéra,paris-brest,pithivier,praline,saint-honoré,tarte au citron,tuile aux amandes,visitandine,sorbet,glace,crème glacée,granité,milk-shake,céleri rémoulade,carottes râpées,soupe au pistou,pistou,ravigote,rougail saucisse,gambas,crevettes,calamars,langoustines,bulots,bigorneaux,coquilles Saint-Jacques',
    plante: 'acacia,acanthe,aconit,agapanthe,agave,ail,ajonc,alchémille,alisier,aloès,aloe vera,amaryllis,ancolie,anémone,angélique,anthurium,arnica,arum,asphodèle,aster,aubépine,azalée,bambou,bananier,baobab,basilic,bégonia,belle-de-jour,belladone,bleuet,bouleau,bougainvillée,bouton-d’or,bruyère,buis,bourrache,cactus,camélia,camomille,campanule,capucine,cèdre,centaurée,chardon,charme,châtaignier,chêne,chèvrefeuille,chiendent,chrysanthème,ciguë,cyclamen,cyprès,clématite,coquelicot,cosmos,crocus,cytise,dahlia,datura,digitale,edelweiss,églantier,épicéa,érable,eucalyptus,euphorbe,fougère,frêne,freesia,fuchsia,gardénia,genêt,genévrier,géranium,gerbera,giroflée,glaïeul,glycine,gui,glycérie,hellébore,hêtre,hibiscus,hortensia,houx,hysope,if,immortelle,iris,jacinthe,jasmin,jonc,jonquille,joubarbe,laurier,laurier-rose,lavande,lierre,lilas,lin,lis,lys,liseron,lotus,lupin,magnolia,marguerite,marronnier,mauve,mélèze,menthe,mimosa,muguet,myosotis,myrte,narcisse,nénuphar,népenthès,noisetier,noyer,œillet,olivier,orchidée,orme,ortie,osier,pâquerette,palmier,papyrus,pensée,peuplier,pervenche,pétunia,pin,pissenlit,pivoine,platane,pommier,primevère,prunier,renoncule,réséda,rhododendron,romarin,ronce,rose,rosier,roseau,sapin,sauge,saule,sequoia,sureau,souci,tamaris,thym,tilleul,tournesol,trèfle,tulipe,valériane,verveine,violette,vigne,yucca,zinnia,belle-de-nuit,bergénia,bignone,callune,capillaire,colchique,coucou,cotonéaster,cerisier,citronnier,cocotier,cornouiller,dieffenbachia,dracaena,épine,ficus,forsythia,gazon,grenadier,héliotrope,kalanchoé,kentia,lantana,lavatère,lichen,lotier,mandragore,marjolaine,millepertuis,mousse,mûrier,nigelle,oranger,orpin,passiflore,pélargonium,perce-neige,phlox,pin parasol,plantain,poirier,pothos,pourpier,prêle,pyracantha,rafflesia,rhubarbe,sansevieria,saxifrage,scabieuse,sédum,seringat,sorbier,spirée,tagète,thuya,trémière,trolle,verge d’or,véronique,viorne,volubilis,weigela,figuier,abricotier,amandier,fraisier,framboisier,groseillier,myrtillier,pêcher,cognassier,néflier,jujubier,kiwaï,chanvre,coton,houblon,blé,orge,avoine,seigle,maïs,riz,colza,tabac,betterave,luzerne,sainfoin',
    instrument: 'accordéon,alto,appeau,balafon,bandonéon,banjo,basse,basson,batterie,biniou,bombarde,bongo,bouzouki,bugle,carillon,castagnettes,cithare,clairon,clarinette,clavecin,clavier,conga,contrebasse,contrebasson,cor,cor anglais,cor de chasse,cornemuse,cornet,cornet à pistons,cymbale,darbouka,derbouka,didgeridoo,djembé,épinette,euphonium,fifre,flageolet,flûte,flûte à bec,flûte de Pan,flûte traversière,gong,grosse caisse,guimbarde,guitare,guitare électrique,harmonica,harmonium,harpe,hautbois,hélicon,kalimba,kazoo,koto,luth,lyre,mandoline,maracas,marimba,mélodica,métallophone,musette,ocarina,orgue,orgue de Barbarie,piano,piano à queue,piccolo,pipeau,sanza,saxophone,sax,sitar,synthétiseur,tabla,tambour,tambourin,tam-tam,theremin,thérémine,timbale,triangle,trombone,trompette,tuba,ukulélé,vibraphone,vielle,vielle à roue,viole,viole de gambe,violon,violoncelle,washboard,xylophone,zither,cajón,caisse claire,charango,cistre,clavicorde,crécelle,crotale,dulcimer,erhu,fujara,guiro,hackbrett,hang,handpan,oud,pandeiro,psaltérion,rebab,sacqueboute,sampler,serpent,shamisen,sousaphone,steel-drum,udu,valiha,vina,clavinet,contrebasse à cordes,basse électrique,orgue électrique,piano électrique,piano droit,guitare basse,guitare acoustique,saxhorn,trompe,trompe de chasse,olifant,chalumeau,doudouk,ney,zurna,gaïta,tympanon,tambour de basque,grelots,cloche,clochettes,sifflet,flexatone,bodhrán,banjolele',
    vetement: 'anorak,ascot,babouche,bague,ballerine,bandana,bandeau,basket,baskets,bavoir,béret,bermuda,bikini,blazer,blouse,blouson,bob,body,boa,bonnet,boléro,botte,bottes,bottine,boubou,boucle d’oreille,boxer,bracelet,braies,brassière,bretelles,burnous,bustier,caban,cabas,caleçon,calot,camisole,canotier,cape,capuche,cardigan,casque,casquette,catsuit,ceinture,chaîne,châle,chapeau,chapka,charentaise,chasuble,chaussette,chausson,chaussure,chemise,chemise de nuit,chemisier,chèche,chouchou,collant,collier,combinaison,corsage,corset,costume,cravate,crinoline,croc,culotte,débardeur,djellaba,doudoune,écharpe,escarpin,espadrille,étole,fichu,foulard,fourrure,fuseau,gabardine,gaine,gant,gilet,godillot,gourmette,guêtre,haut-de-forme,haut,imperméable,jambière,jean,jupe,jupon,justaucorps,kilt,kimono,kippa,lavallière,legging,leggings,liquette,loden,lunettes,maillot,maillot de bain,manchette,mitaine,mocassin,montre,moufle,mule,nœud papillon,nuisette,pagne,paletot,pantacourt,pantalon,pantoufle,paréo,parka,peignoir,pelisse,perruque,pochette,polaire,polo,poncho,porte-jarretelles,pull,pull-over,pyjama,redingote,robe,robe de chambre,sabot,sac à main,saharienne,salopette,sandale,sari,sarouel,short,slip,smoking,socquette,soutien-gorge,sous-pull,spencer,string,survêtement,sweat,sweat-shirt,tablier,tailleur,talon,tee-shirt,t-shirt,toge,toque,tricot,tunique,turban,tutu,uniforme,veste,veston,visière,voile,bretelle,broche,jarretière,lunettes de soleil,portefeuille,porte-monnaie,sac,sac à dos,bourse,boucle,bijou,diadème,tiare,alliance,pendentif,piercing,chevalière,bandoulière,capeline,cagoule,bonnet de bain,charlotte,collerette,jabot,gilet de sauvetage,ciré,trench,trench-coat,duffle-coat,pardessus,manteau,manteau de pluie,combishort,top,crop-top,marcel,maillot de corps,knicker,knickers,jogging,survêt,bleu de travail,soutane,burqa,hijab,sarong,sabots,tongs,tong,derbies,richelieu,bottes de pluie,cuissardes,santiags,tennis,chaussons,pantoufles,babouches,mules,sandales,escarpins,ballerines,godasse,grolle,bonnet phrygien,béret basque,casque colonial,sombrero,stetson,feutre,bibi,borsalino,panama,trilby,passe-montagne,cache-cou,cache-nez,snood,cache-oreilles,gants,mitaines,moufles',
    corps: 'abdomen,abdominaux,aine,aisselle,amygdale,annulaire,anus,aorte,appendice,artère,articulation,astragale,auriculaire,avant-bras,bassin,biceps,bouche,bras,bronche,cage thoracique,cartilage,cerveau,cervelet,cheveu,cheveux,cheville,chevelure,cil,clavicule,coccyx,cœur,colonne vertébrale,côte,coude,cou,crâne,cristallin,cuisse,cuir chevelu,derme,dent,diaphragme,doigt,dos,duodénum,épaule,épiderme,estomac,face,fémur,fesse,foie,front,gencive,genou,glande,globule,gorge,gosier,gras du bras,hanche,humérus,index,intestin,iris,jambe,joue,jugulaire,langue,larynx,lèvre,ligament,lobe,lombaires,luette,mâchoire,main,majeur,mamelon,menton,moelle,mollet,muqueuse,muscle,narine,nerf,nez,nombril,nuque,œil,yeux,œsophage,omoplate,ongle,oreille,orteil,os,ovaire,paume,paupière,peau,pectoraux,pied,poignet,poil,poitrine,pouce,poumon,prostate,pubis,pupille,quadriceps,rate,rein,rétine,rotule,sang,sein,sinus,sourcil,sternum,talon,tempe,tendon,testicule,tête,thorax,thyroïde,tibia,trachée,triceps,tympan,utérus,vaisseau,veine,ventre,vertèbre,vessie,visage,voûte plantaire,fossette,gros orteil,arcade,arcade sourcilière,occiput,péroné,radius,cubitus,ulna,métacarpe,phalange,tarse,métatarse,sacrum,bassinet,pancréas,vésicule,hypophyse,hypothalamus,neurone,synapse,ménisque,palais,commissure,glotte,pharynx,épiglotte,bulbe,lombes,flanc,reins,taille,buste,torse,molaire,canine,incisive,prémolaire,dent de sagesse,lobule,tragus,conduit auditif,cochlée,cornée,sclérotique,larme,salive,sueur,phalangette,phalangine,jointure,deltoïde,trapèze,dorsaux,fessier,ischio-jambiers,adducteurs,abdos,pectoral,abducteur,grand dorsal,carotide,fontanelle,mandibule,maxillaire,zygomatique,pommette,glabelle,philtrum,barbe,moustache,favoris,duvet,poing,phalanges,derrière,postérieur',
    transport: 'aéroglisseur,ambulance,autobus,autocar,automobile,avion,avion de chasse,ballon,ballon dirigeable,barque,bateau,bateau-mouche,bicyclette,bus,bobsleigh,brouette,bulldozer,cabriolet,calèche,camion,camionnette,camping-car,canoë,car,caravane,carriole,carrosse,catamaran,char,charrette,chaloupe,chalutier,chariot,cheval,coche,cyclomoteur,deltaplane,deux-roues,diligence,dirigeable,draisienne,dromadaire,escalator,fiacre,fourgon,fourgonnette,frégate,funiculaire,fusée,galère,gondole,gyropode,hélicoptère,hors-bord,hovercraft,hydravion,hydroglisseur,jet,jet-ski,jonque,kayak,landau,limousine,locomotive,luge,métro,mobylette,monocycle,montgolfière,moto,motocyclette,motoneige,navette,navire,paquebot,parapente,patin,patinette,patins à roulettes,péniche,pédalo,pirogue,planche à roulettes,planche à voile,planeur,poussette,quad,radeau,remorque,remorqueur,RER,roller,sampan,scooter,side-car,skateboard,ski,sous-marin,sulky,tandem,tank,taxi,TGV,téléphérique,télésiège,téléski,tracteur,traîneau,train,tram,tramway,tricycle,trimaran,trolleybus,trottinette,tuk-tuk,ULM,vaisseau,vaisseau spatial,vedette,vélo,vélo électrique,vélomoteur,voilier,voiture,wagon,yacht,zeppelin,âne,autorail,baleinière,bac,bateau à voile,berline,break,brise-glace,cabine,cargo,caravelle,cuirassé,destroyer,drakkar,dériveur,express,ferry,ferry-boat,goélette,hydrofoil,ketch,micheline,minibus,monospace,navette spatiale,omnibus,pétrolier,porte-avions,pousse-pousse,rickshaw,roadster,rosalie,sloop,speedboat,SUV,télécabine,torpilleur,trois-mâts,trottinette électrique,vapeur,vélo-taxi,yole,4x4,quatre-quatre,autoneige,chameau,mulet,poney,fardier,triporteur,van,drone,aile delta,avion à réaction,biplan,jumbo-jet,long-courrier,charter,porte-conteneurs,remonte-pente,ascenseur,escalier mécanique,tapis roulant,planche,surf,paddle,canot,canot pneumatique,youyou,bateau-pilote,voiturette,kart,karting,buggy,dragster,formule 1,bolide,corbillard,dépanneuse,benne,camion-citerne,bétonnière,moissonneuse-batteuse,pelleteuse,chasse-neige,balayeuse',
    boisson: 'absinthe,amaretto,américano,anisette,apéritif,armagnac,bavaroise,bière,bière blonde,bière brune,bitter,blanc,bloody mary,bordeaux,bourbon,bourgogne,bouillon,brandy,cacao,café,café au lait,café crème,calvados,camomille,capuccino,cappuccino,cava,chai,chardonnay,champagne,chartreuse,chocolat chaud,chocolat,cidre,citronnade,cocktail,cognac,cola,crème de cassis,cuba libre,curaçao,daiquiri,déca,décaféiné,diabolo,digestif,eau,eau de vie,eau gazeuse,eau minérale,eau pétillante,espresso,expresso,frappé,genièvre,gin,gin tonic,ginger ale,ginger beer,grenadine,grog,hydromel,infusion,jus,jus d’orange,jus de pomme,jus de fruits,jus de raisin,kéfir,kir,kir royal,kombucha,lait,lait de soja,lait fraise,lassi,latte,limonade,liqueur,macchiato,madère,maté,mauresque,margarita,martini,menthe à l’eau,merlot,milk-shake,mirabelle,mojito,muscat,muscadet,nectar,négroni,orangeade,orgeat,ouzo,panaché,pastis,perroquet,piña colada,pinot,poiré,porto,pousse-café,punch,raki,ratafia,rhum,riesling,rosé,rooibos,sake,sangria,schnaps,sirop,smoothie,soda,spritz,tequila,thé,thé glacé,thé vert,thé à la menthe,tilleul,tisane,tomate,tonic,verveine,vin,vin blanc,vin chaud,vin rouge,vermouth,vodka,whisky,whiskey,yaourt à boire,lait ribot,chouchen,cervoise,consommé,marc,marsala,mescal,mezcal,pisco,poire williams,prunelle,rhum arrangé,saint-émilion,sauternes,sherry,xérès,champagne rosé,crémant,clairette,blanquette,beaujolais,chablis,côtes-du-rhône,gewurztraminer,sancerre,chianti,lambrusco,prosecco,tequila sunrise,eau de coco,lait d’amande,lait de coco,horchata,café liégeois,irish coffee,chocolat viennois,ristretto,cortado,mocaccino,frappuccino,café noisette,noisette,thé noir,thé au jasmin,matcha,earl grey,jus de tomate,jus de carotte,virgin mojito,cocktail sans alcool',
    jeu: 'awalé,backgammon,balle,ballon,bataille,bataille navale,belote,bilboquet,billard,billes,blackjack,blind test,boggle,bowling,bridge,cache-cache,canasta,cartes,casse-tête,cerf-volant,chat perché,chaises musicales,chamboule-tout,cluedo,colin-maillard,corde à sauter,cube,dames,dés,diabolo,dinette,domino,dominos,échecs,élastique,escargot,figurine,flipper,frisbee,go,jacquet,jeu de l’oie,jeu de cartes,jeu de société,jenga,jokari,kem’s,loto,loup-garou,mah-jong,marelle,marionnette,mastermind,memory,mikado,mille bornes,monopoly,morpion,mot croisé,mots croisés,mots fléchés,nain jaune,osselets,othello,pâte à modeler,patate chaude,pendu,petits chevaux,pétanque,peluche,pictionary,ping-pong,poker,poupée,puissance 4,puzzle,quilles,rami,risk,rubik’s cube,sudoku,scrabble,solitaire,taboo,tarot,tangram,toboggan,toupie,trivial pursuit,trottinette,uno,yams,yo-yo,1 2 3 soleil,un deux trois soleil,balançoire,bac à sable,ballon prisonnier,billard américain,cartes à collectionner,cheval à bascule,circuit,console,cubes,damier,doudou,épervier,garage,hula-hoop,jeu vidéo,jeu de dames,jeu de go,jeu d’échecs,jeu de fléchettes,kaléidoscope,kart,lance-pierre,luge,mölkky,nounours,ours en peluche,palet,patins,pâte à sel,petit bac,pistolet à eau,poupon,quatre coins,ricochet,robot,saute-mouton,scoubidou,skate,tapis de jeu,téléphone arabe,tir à la corde,train électrique,trampoline,tricycle,voiture téléguidée,voiture miniature,xylophone,cartes Pokémon,pog,bulles de savon,ballon de baudruche,château gonflable,cabane,chevaux de bois,manège,boomerang,gyroscope,fusée à eau,jeu de construction,jeu de rôle,escape game,labyrinthe,dame de pique,huit américain,président,crapette,belote coinchée,coinche,manille,piquet,whist,pouilleux,bataille corse,menteur,rummikub,dobble,bonne paye,cochon qui rit,jungle speed,qui est-ce,docteur maboul,puissance quatre,hippo glouton,touché-coulé,ni oui ni non,jacques a dit,béret,balle au prisonnier,gendarmes et voleurs,cow-boys et indiens,dodgeball,pogo,pogo-stick,patin à glace,echasses',
    adjectif: 'accueillant,actif,adorable,adroit,affectueux,agile,agressif,aimable,altruiste,ambitieux,amical,amusant,angoissé,anxieux,appliqué,ardent,arrogant,astucieux,attachant,attentif,attentionné,audacieux,autoritaire,autonome,avare,aventurier,bavard,bête,bienveillant,blagueur,borné,bosseur,boudeur,bougon,brave,brillant,brutal,calme,capricieux,casanier,chaleureux,charismatique,charmant,chanceux,colérique,combatif,compatissant,compétent,compréhensif,confiant,consciencieux,content,cool,coquet,coriace,courageux,courtois,créatif,crédule,cruel,cultivé,curieux,cynique,débrouillard,décidé,délicat,dépensier,désagréable,désinvolte,désordonné,dévoué,digne,diplomate,discret,distrait,docile,doux,drôle,dynamique,économe,efficace,égoïste,élégant,émotif,endurant,énergique,enjoué,ennuyeux,enthousiaste,entêté,entreprenant,envieux,espiègle,étourdi,exigeant,expansif,extraverti,fainéant,farceur,fidèle,fier,flemmard,fort,fourbe,franc,frileux,frimeur,fragile,froid,gai,galant,généreux,gentil,gourmand,gracieux,grincheux,grossier,habile,hardi,hautain,heureux,honnête,honteux,humble,hypocrite,idiot,ignorant,imaginatif,impatient,impulsif,inconstant,indépendant,indulgent,ingénieux,ingrat,inquiet,insolent,intelligent,intrépide,introverti,intuitif,irritable,jaloux,jovial,joyeux,juste,lâche,lent,lucide,loyal,macho,maladroit,malhonnête,malicieux,malin,maniaque,méchant,méfiant,menteur,méticuleux,mignon,minutieux,modeste,moqueur,motivé,mystérieux,naïf,narcissique,négligent,nerveux,niais,nonchalant,obéissant,obstiné,optimiste,orgueilleux,original,ouvert,paresseux,passionné,patient,peureux,pessimiste,pétillant,philosophe,pieux,poli,ponctuel,positif,possessif,pragmatique,prétentieux,prévenant,prudent,pudique,rancunier,rapide,raisonnable,râleur,rebelle,réfléchi,reconnaissant,respectueux,responsable,rêveur,rigolo,rigoureux,romantique,rusé,sage,sérieux,serviable,sévère,sincère,sociable,soigneux,solidaire,sombre,souriant,spontané,sportif,strict,studieux,susceptible,sympathique,sympa,taciturne,tenace,téméraire,tendre,têtu,timide,tolérant,travailleur,tricheur,triste,vaillant,vaniteux,vif,vigilant,violent,volontaire,vulgaire,zélé,aimant,blasé,charitable,chicaneur,complexé,conciliant,coopératif,dépressif,disponible,distingué,douillet,dur,dragueur,effronté,empathique,excentrique,fanfaron,flegmatique,frivole,fougueux,futé,glouton,gamin,hargneux,humain,hystérique,impoli,incorruptible,instable,irresponsable,joueur,lunatique,magnanime,maternel,mesquin,mou,observateur,ordonné,organisé,paternel,perfectionniste,persévérant,pingre,polisson,radin,rassurant,rieur,ronchon,sauvage,sensible,snob,soucieux,subtil,superstitieux,tatillon,tête en l’air,turbulent,vantard,vicieux,volage',
    celebrite: 'Adele,Adjani,Aznavour,Alain Delon,Delon,Angèle,Aya Nakamura,Armstrong,Balavoine,Bardot,Brigitte Bardot,Baudelaire,Beethoven,Belmondo,Beyoncé,Blériot,Bocuse,Bonaparte,Bourvil,Brassens,Brel,Jacques Brel,Camus,Chaplin,Charlie Chaplin,Chanel,Coco Chanel,Charlemagne,Chirac,Churchill,Cléopâtre,Clovis,Colette,Coluche,Copernic,Curie,Marie Curie,Dalida,Dali,Salvador Dali,Darwin,De Gaulle,Charles de Gaulle,Debussy,Degas,Delacroix,Depardieu,Descartes,Diderot,Dion,Céline Dion,Dumas,Alexandre Dumas,Edison,Einstein,Eiffel,Elvis,Eminem,Federer,Fernandel,Flaubert,Funès,Louis de Funès,Gainsbourg,Galilée,Gandhi,Garibaldi,Gauguin,Goldman,Jean-Jacques Goldman,Gutenberg,Hallyday,Johnny Hallyday,Hendrix,Hitchcock,Hugo,Victor Hugo,Jaurès,Jeanne d’Arc,Jésus,Jobs,Kennedy,Lafayette,La Fontaine,Lennon,Léonard de Vinci,Vinci,Louis XIV,Lumière,Luther King,Madonna,Magritte,Mandela,Manet,Marceau,Marco Polo,Maradona,Marie-Antoinette,Mbappé,Michael Jackson,Michel-Ange,Mitterrand,Molière,Monet,Montand,Mozart,Napoléon,Newton,Neymar,Obama,Orelsan,Pagnol,Pasteur,Piaf,Édith Piaf,Picasso,Platini,Poulidor,Prévert,Proust,Rabelais,Racine,Ravel,Renoir,Rimbaud,Rodin,Ronaldo,Rousseau,Saint-Exupéry,Sand,George Sand,Sartre,Shakespeare,Signoret,Sinatra,Socrate,Stromae,Teddy Riner,Riner,Tesla,Toulouse-Lautrec,Trenet,Van Gogh,Verlaine,Verne,Jules Verne,Voltaire,Warhol,Washington,Zidane,Zola,Zinédine Zidane,Aristote,Platon,Archimède,Hippocrate,Homère,Jules César,César,Ramsès,Toutânkhamon,Néfertiti,Hannibal,Vercingétorix,Attila,Gengis Khan,Christophe Colomb,Colomb,Magellan,Vasco de Gama,Cartier,Cousteau,Tabarly,Nadal,Noah,Yannick Noah,Djokovic,Messi,Pelé,Griezmann,Benzema,Parker,Tony Parker,Bolt,Usain Bolt,Phelps,Manaudou,Laure Manaudou,Perec,Marie-José Pérec,Dujardin,Omar Sy,Sy,Cotillard,Deneuve,Binoche,Audrey Tautou,Tautou,Gabin,Jean Gabin,Arletty,Raimu,Dubosc,Elmaleh,Gad Elmaleh,Debbouze,Jamel Debbouze,Kev Adams,Florence Foresti,Foresti,Norman,Squeezie,Cyprien,Mylène Farmer,Farmer,Sardou,Michel Sardou,Barbara,Renaud,Souchon,Cabrel,Francis Cabrel,Obispo,Zaz,Indila,Vianney,Soprano,Maître Gims,Gims,Nekfeu,Jul,Booba,MC Solaar,Louane,Clara Luciani,Christine and the Queens,Daft Punk,David Guetta,Guetta,Jean-Michel Jarre,Jarre,Vartan,Sylvie Vartan,Claude François,Cloclo,Sheila,Mike Brant,Joe Dassin,Dassin,Julien Clerc,Clerc,Alain Souchon,Laurent Voulzy,Voulzy,Patrick Bruel,Bruel,Garou,Lara Fabian,Mika,Elton John,Freddie Mercury,Mercury,Bowie,David Bowie,Prince,Rihanna,Shakira,Taylor Swift,Lady Gaga,Ed Sheeran,Justin Bieber,Bieber,Katy Perry,Britney Spears,Whitney Houston,Tina Turner,Aretha Franklin,Bob Marley,Marley,Bob Dylan,Dylan,Paul McCartney,Ringo Starr,Mick Jagger,Jagger,Elvis Presley,Presley,Louis Armstrong,Miles Davis,Ray Charles,Stevie Wonder,Marilyn Monroe,Monroe,Audrey Hepburn,Brad Pitt,Pitt,Tom Cruise,Cruise,Leonardo DiCaprio,DiCaprio,Johnny Depp,Depp,Angelina Jolie,Jolie,Meryl Streep,George Clooney,Clooney,Julia Roberts,Will Smith,Tom Hanks,Hanks,Robert De Niro,Al Pacino,Pacino,Harrison Ford,Morgan Freeman,Denzel Washington,Scarlett Johansson,Nicole Kidman,Jennifer Lopez,Spielberg,Steven Spielberg,Tarantino,Scorsese,Kubrick,Luc Besson,Besson,Truffaut,Godard,Jacques Tati,Tati,Walt Disney,Disney,Goscinny,Uderzo,Hergé,Franquin,Morris,Sempé,Jean de La Fontaine,Perrault,Charles Perrault,Andersen,Grimm,Tolkien,Rowling,Agatha Christie,Christie,Simenon,Maupassant,Balzac,Stendhal,Beauvoir,Simone Veil,Veil,Pierre Curie,Louis Pasteur,Freud,Marx,Lénine,Staline,Roosevelt,Lincoln,Nelson Mandela,Martin Luther King,Mère Teresa,Abbé Pierre,Dalaï-Lama,Jean-Paul II,Pape François,Macron,Emmanuel Macron,Sarkozy,Hollande,François Hollande,Giscard,Pompidou,Clemenceau,Jean Moulin,Moulin,Joséphine Baker,Baker,Louis XVI,Henri IV,François Ier,Saint Louis,Richelieu,Mazarin,Robespierre,Danton,Marat,Joséphine,Aliénor d’Aquitaine,Catherine de Médicis,Elizabeth II,Diana,Lady Di,Charles III,William,Harry,Kate,Trump,Poutine,Zelensky,Merkel,Thatcher,Nixon,Reagan,Bill Gates,Gates,Steve Jobs,Mark Zuckerberg,Zuckerberg,Elon Musk,Musk,Jeff Bezos,Bezos,Thomas Pesquet,Pesquet,Neil Armstrong,Youri Gagarine,Gagarine,Buzz Aldrin,Mata Hari,Kiki de Montparnasse,Yves Saint Laurent,Saint Laurent,Karl Lagerfeld,Lagerfeld,Christian Dior,Dior,Jean-Paul Gaultier,Gaultier,Paul Bocuse,Cyril Lignac,Lignac,Philippe Etchebest,Etchebest,Joël Robuchon,Robuchon,Alain Ducasse,Ducasse,Thierry Henry,Henry,Didier Deschamps,Deschamps,Michel Platini,Karim Benzema,Kylian Mbappé,Antoine Griezmann,Paul Pogba,Pogba,Zlatan,Cristiano Ronaldo,Lionel Messi,Diego Maradona,Rafael Nadal,Roger Federer,Serena Williams,Amélie Mauresmo,Mauresmo,Victor Wembanyama,Wembanyama,Antoine Dupont,Dupont,Sébastien Chabal,Chabal,Jonah Lomu,Martin Fourcade,Fourcade,Kylian,Florent Manaudou,Léon Marchand,Marchand,Renaud Lavillenie,Lavillenie,Christine Arron,Carl Lewis,Mohamed Ali,Tyson,Mike Tyson,Alain Prost,Prost,Ayrton Senna,Senna,Michael Schumacher,Schumacher,Lewis Hamilton,Hamilton,Sébastien Loeb,Loeb,Bernard Hinault,Hinault,Eddy Merckx,Merckx,Raymond Poulidor,Jacques Anquetil,Anquetil,Thomas Voeckler,Julian Alaphilippe,Alaphilippe,Tony Estanguet',
    fiction: 'Aladdin,Alice,Anakin,Aragorn,Ariel,Arsène Lupin,Lupin,Astérix,Aurore,Babar,Bambi,Barbapapa,Batman,Baloo,Bart Simpson,Bécassine,Belle,Bernard,Blanche-Neige,Bob l’éponge,Boucle d’or,Buzz l’Éclair,Buzz,Calimero,Candy,Capitaine Haddock,Haddock,Captain America,Casimir,Casper,Cendrillon,Charlie Brown,Chewbacca,Cruella,Cyrano,Dark Vador,Dora,Donald,Dingo,Docteur Watson,Watson,Dracula,Dumbo,Elsa,Anna,Frankenstein,Figaro,Frodon,Gandalf,Garfield,Gaston Lagaffe,Gavroche,Geppetto,Gollum,Goldorak,Gru,Harry Potter,Hermione,Hercule Poirot,Poirot,Hulk,Idéfix,Indiana Jones,Iron Man,Jack Sparrow,Jasmine,Jerry,Joker,Jiminy Cricket,Kirikou,Lucky Luke,Luke Skywalker,Maléfique,Mario,Luigi,Marsupilami,Mary Poppins,Merlin,Mickey,Minnie,Milou,Minions,Moana,Vaiana,Mowgli,Mulan,Nemo,Obélix,Olive,Oui-Oui,Panoramix,Petit Chaperon rouge,Peter Pan,Pikachu,Pinocchio,Popeye,Pocahontas,Porcinet,Princesse Leia,Leia,Raiponce,Ratatouille,Rémi,Robin des Bois,Roi Lion,Rox,Scooby-Doo,Schtroumpf,Schtroumpfette,Shrek,Sherlock Holmes,Sherlock,Simba,Snoopy,Sonic,Spider-Man,Spirou,Stitch,Superman,Tarzan,Tintin,Tigrou,Titeuf,Tom Sawyer,Tom,Totoro,Tournesol,Professeur Tournesol,Trotro,T’choupi,Winnie l’ourson,Winnie,Wonder Woman,Woody,Yoda,Zorro,Zelda,Link,Ulysse,Hercule,Achille,Pénélope,Tristan,Iseut,Don Quichotte,Sancho Pança,Quasimodo,Esmeralda,Cosette,Jean Valjean,Valjean,Javert,Madame Bovary,Bovary,D’Artagnan,Athos,Porthos,Aramis,Milady,Cyrano de Bergerac,Candide,Gargantua,Pantagruel,Tartuffe,Harpagon,Don Juan,Roméo,Juliette,Hamlet,Othello,Macbeth,Le Petit Prince,Poil de Carotte,Le Petit Nicolas,Tom Pouce,Petit Poucet,Barbe-Bleue,Belle au bois dormant,Chat botté,Peau d’âne,Riquet à la houppe,Alice au pays des merveilles,Lapin blanc,Chapelier fou,Capitaine Crochet,Crochet,Clochette,Fée Clochette,Wendy,Lilo,Nala,Timon,Pumbaa,Rafiki,Scar,Mufasa,Kaa,Shere Khan,Bagheera,Dory,Marin,Flash McQueen,Martin,Mater,Sulli,Bob Razowski,Wall-E,Rémy,Linguini,Mr Indestructible,Elastigirl,Olaf,Kristoff,Sven,Hans,Mérida,Maui,Mirabel,Bruno,Elio,Luca,Coco,Miguel,Héctor,Raya,Sisu,Bob,Patrick,Carlo,Plankton,Gary,Homer,Homer Simpson,Marge,Lisa,Maggie,Bart,Rick,Morty,Scrat,Sid,Manny,Diego,Po,Kung Fu Panda,Shifu,Tigresse,Fiona,Âne,Chat Potté,Agnès,Margo,Edith,Vector,Titi,Grosminet,Bugs Bunny,Daffy Duck,Porky,Speedy Gonzales,Coyote,Bip Bip,Taz,Tweety,Woodstock,Lucy,Linus,Odie,Boule,Bill,Dupond,Dupont,Castafiore,Rastapopoulos,Nestor,Tchang,Fantasio,Gaston,Jolly Jumper,Rantanplan,Dalton,Joe Dalton,Averell,Iznogoud,Achille Talon,Boule et Bill,Cédric,Ducobu,Nadia,Blake,Mortimer,Blueberry,Thorgal,Largo Winch,XIII,Corto Maltese,Valérian,Yoko Tsuno,Adèle Blanc-Sec,Naruto,Sasuke,Goku,Sangoku,Son Goku,Vegeta,Luffy,Zoro,Sacha,Ash,Mewtwo,Dracaufeu,Bulbizarre,Salamèche,Carapuce,Rondoudou,Evoli,Albator,Capitaine Flam,Actarus,Heidi,Rémi sans famille,Nicky Larson,Olive et Tom,Ulysse 31,Les Mystérieuses Cités d’or,Esteban,Zia,Tao,Clémentine,Inspecteur Gadget,Gadget,Docteur Gang,Bouba,Maya l’abeille,Maya,Willy,Pif,Pifou,Placid,Muzo,Nounours,Hippolyte,Kiri le clown,Pollux,Zébulon,Chapi Chapo,Céleste,Arthur,Zéphir,Peach,Bowser,Yoshi,Toad,Wario,Donkey Kong,Ganon,Tails,Knuckles,Lara Croft,Kratos,Master Chief,Rayman,Crash Bandicoot,Spyro,Pac-Man,Kirby,Samus,Steve,Creeper,Robin,Catwoman,Loïs Lane,Lex Luthor,Flash,Aquaman,Venom,Thor,Loki,Black Widow,Wolverine,Deadpool,Thanos,Groot,Rocket,Black Panther,Doctor Strange,Ant-Man,Hawkeye,Vision,Magneto,Tornade,Cyclope,Jean Grey,Luke,Han Solo,R2-D2,C-3PO,Obi-Wan,Padmé,Rey,Kylo Ren,Ron,Dumbledore,Voldemort,Hagrid,Rogue,Drago,Sirius,Dobby,Sam,Sauron,Legolas,Gimli,Bilbo,Arwen,Elrond,Jon Snow,Daenerys,Tyrion,Arya,Sansa,James Bond,OSS 117,Rambo,Rocky,Terminator,Guillaume Tell,Jane,Fantômas,Maigret,Miss Marple,Columbo,Rouletabille,Barbie,Ken,Sammy,Fred,Daphné,Véra,Mimi Cracra,Petit Ours Brun,Ours Brun,Martine,Caillou,Peppa Pig,Peppa,George,Chase,Marcus,Ryder,Pat’Patrouille,Masha,Michka,Ponyo,Chihiro,Nausicaä,Kiki,Pippi Longstocking,Fifi Brindacier,Mafalda,Calvin,Hobbes,Abraracourcix,Assurancetourix,Falbala,Bonemine,Cétautomatix,Agecanonix,Ordralfabétix,Jules César,Cléopâtre,Numérobis'
  };
  /* LEXIQUE-FIN */

  var INDEX = null; // construit à la première utilisation
  function index() {
    if (INDEX) return INDEX;
    var parSource = {};
    Object.keys(LEX_SOURCES).forEach(function (s) {
      parSource[s] = LEX_SOURCES[s] ? LEX_SOURCES[s].split(',') : [];
    });
    var cats = {}, global = {};
    CATEGORIES.forEach(function (c) {
      var m = {}, lettres = {};
      c.src.forEach(function (s) {
        (parSource[s] || []).forEach(function (mot) {
          var k = cle(mot);
          if (!k || m.hasOwnProperty(k)) return;
          m[k] = mot;
          var L = espace(mot).charAt(0);
          (lettres[L] || (lettres[L] = [])).push(mot);
          if (!global.hasOwnProperty(k)) global[k] = [];
          if (global[k].indexOf(c.id) === -1) global[k].push(c.id);
        });
      });
      cats[c.id] = { mots: m, lettres: lettres };
    });
    INDEX = { cats: cats, global: global };
    return INDEX;
  }
  /* le mot est-il connu dans cette catégorie ? → {k: clé canonique, mot} ou null */
  function connait(catId, ans) {
    var c = cat(catId);
    if (!c) return null;
    var m = index().cats[catId].mots;
    var v = variantes(ans, c.fem);
    for (var i = 0; i < v.length; i++) {
      if (m.hasOwnProperty(v[i])) return { k: v[i], mot: m[v[i]] };
    }
    return null;
  }
  /* dans quelles autres catégories le lexique range-t-il ce mot ? */
  function autresCategories(ans, sauf) {
    var g = index().global, v = variantes(ans, true), res = [];
    for (var i = 0; i < v.length; i++) {
      if (!g.hasOwnProperty(v[i])) continue;
      g[v[i]].forEach(function (id) {
        if (id !== sauf && res.indexOf(id) === -1 && !(cat(id) && cat(id).src.some(function (s) { return cat(sauf) && cat(sauf).src.indexOf(s) !== -1; }))) res.push(id);
      });
    }
    return res;
  }

  /* ---------------- l'IA ---------------- */
  /* jugement de l'IA : le mot doit appartenir au lexique de SA catégorie —
     le hasard n'a rien à faire dans un arbitrage. Catégories ouvertes
     (célébrités, héros) : elle accorde le bénéfice du doute. */
  function botJuge(ans, c) {
    var id = typeof c === 'number' ? DEFAUT[c] : c;
    var ca = cat(id);
    if (!ca) return false;
    if (connait(id, ans)) return true;
    if (ca.ouverte) {
      var k = cle(ans);
      return k.length >= 3 && /[AEIOUY]/.test(k) && !/(.)\1\1/.test(k);
    }
    return false;
  }

  var NIVEAUX_IA = {
    facile: { remplit: 0.5, part: [0, 0.3], etourdi: 0.04 },
    moyen: { remplit: 0.72, part: [0, 0.8], etourdi: 0.02 },
    difficile: { remplit: 0.92, part: [0.6, 1], etourdi: 0 }
  };
  /* la feuille de l'IA : des trous (selon son niveau) et, rarement, une
     étourderie de mauvaise lettre — comme sous la pression du chrono.
     facile : mots courts et courants (doublons fréquents) ; difficile :
     presque tout rempli, avec des mots plus rares. */
  function botSheet(letter, ids, niveau) {
    ids = ids || DEFAUT;
    var N = NIVEAUX_IA[niveau] || NIVEAUX_IA.moyen;
    var idx = index();
    return ids.map(function (id) {
      var c = idx.cats[id];
      if (!c) return '';
      var pool = (c.lettres[letter] || []).slice().sort(function (a, b) { return a.length - b.length; });
      if (!pool.length || Math.random() > N.remplit) return '';
      var d = Math.floor(pool.length * N.part[0]), f = Math.max(d + 1, Math.ceil(pool.length * N.part[1]));
      var word = pool[d + Math.floor(Math.random() * (f - d))];
      if (Math.random() < N.etourdi) {
        var autres = Object.keys(c.lettres).filter(function (L) { return L !== letter && LETTERS.indexOf(L) !== -1; });
        var autre = autres[Math.floor(Math.random() * autres.length)];
        if (autre) word = c.lettres[autre][0];
      }
      return word;
    });
  }

  /* compatibilité : l'ancien lexique « à 6 catégories » (tests, outils) */
  function botLexCompat() {
    var idx = index();
    return DEFAUT.map(function (id) {
      var o = {};
      LETTERS.split('').forEach(function (L) { o[L] = (idx.cats[id].lettres[L] || []).slice(); });
      return o;
    });
  }

  /* ---------------- le décompte d'une manche ----------------
     Pour chaque réponse : vide, mauvaise lettre ou trop courte → 0 ; connue
     du lexique de la catégorie → acceptée d'office (même si quelqu'un a
     voulu la refuser) ; sinon, jugée à la majorité des autres joueurs
     (égalité = acceptée). Deux réponses identiques : 5 points chacune. */
  function scoreRound(state) {
    var nP = state.players.length;
    var ids = catIds(state);
    if (!state.scoreAvant) state.scoreAvant = state.players.map(function (p) { return p.score; });
    var results = [];
    for (var p = 0; p < nP; p++) results.push([]);
    var contestes = state.contestes || [];
    for (var c = 0; c < ids.length; c++) {
      var valides = [];
      for (p = 0; p < nP; p++) {
        var ans = String((state.answers[p] || [])[c] || '').slice(0, 30);
        var r = { ans: ans, pts: 0 };
        results[p][c] = r;
        if (!espace(ans)) { r.why = 'vide'; continue; }
        if (!bonneLettre(ans, state.letter)) { r.why = 'lettre'; continue; }
        if (cle(ans).length < 2) { r.why = 'court'; continue; }
        var connu = connait(ids[c], ans);
        var contre = [], pour = 0, ia = true;
        if (state.mode === 'chacun' && state.correction) {
          var g = state.correction[p];
          if (g && g[c] === false) contre.push(-1);
        } else {
          for (var v = 0; v < nP; v++) {
            if (v === p) continue;
            var grid = (state.votes[v] || {})[p];
            if (grid && grid[c] === false) { contre.push(v); if (!(state.votesIA && state.votesIA[v])) ia = false; }
            else pour++;
          }
        }
        var conteste = contestes.some(function (x) { return x.p === p && x.c === c; });
        if (conteste) { r.conteste = true; }
        else if (connu) { if (contre.length) r.dico = true; }
        else if (contre.length && (state.mode === 'chacun' || contre.length > pour)) {
          r.why = state.mode === 'chacun' ? 'table' : 'vote';
          r.par = contre;
          r.ia = ia;
          continue;
        }
        valides.push({ p: p, k: connu ? connu.k : cle(ans), r: r });
      }
      valides.forEach(function (e) {
        var memes = valides.filter(function (x) { return x !== e && x.k === e.k; });
        e.r.pts = memes.length ? 5 : 10;
        if (memes.length) { e.r.why = 'doublon'; e.r.avec = memes.map(function (x) { return x.p; }); }
      });
    }
    var gains = [];
    for (p = 0; p < nP; p++) {
      var gg = 0;
      for (c = 0; c < ids.length; c++) gg += (results[p][c] || { pts: 0 }).pts;
      state.players[p].score = state.scoreAvant[p] + gg;
      gains.push(gg);
    }
    state.results = results;
    state.gains = gains;
    state.phase = 'result';
  }

  function prochainEcrivain(state) {
    for (var i = 0; i < state.players.length; i++) if (!state.submitted[i]) return i;
    return -1;
  }

  var mod = {
    id: 'bac',
    nom: 'Petit Bac',
    icone: '📝',
    desc: 'Une lettre tirée à la roue, vos catégories préférées, un minuteur. Un téléphone chacun, ou on se passe le téléphone !',
    regles: '<p><strong>🎯 Le but :</strong> pour la lettre tirée au sort, trouver un mot par catégorie (prénom, animal, ville…) avant la fin du minuteur.</p>' +
      '<p><strong>Avant de jouer :</strong> l’hôte choisit les catégories (21 au choix, ou une sélection toute prête), la durée et le nombre de manches.</p>' +
      '<p><strong>Les points :</strong> 10 par mot accepté, <strong>5 si un autre joueur a écrit le même</strong> (doublon : on partage), 0 si la réponse est vide, commence par une autre lettre ou est refusée.</p>' +
      '<p><strong>Qui décide ?</strong> Un mot connu du dictionnaire du jeu est validé d’office : personne ne peut le refuser. Pour les autres, chacun vote : refusé seulement si la majorité est contre (égalité = accepté). Contre l’ordinateur, vous pouvez <strong>contester</strong> un refus de l’IA.</p>' +
      '<p><strong>Tolérant :</strong> accents, majuscules, tirets, articles (« Le Havre ») et pluriels ne comptent pas.</p>' +
      '<p><strong>Sur un seul téléphone :</strong> chacun écrit à son tour, lettre révélée pour lui seul, puis la table corrige ensemble.</p>',
    min: 2, max: 4,
    hotseat: true, hidden: true, netOnly: false,
    niveaux: ['facile', 'moyen', 'difficile'],

    create: function (names) {
      return {
        id: Math.floor(Math.random() * 1e9).toString(36),
        players: names.map(function (n) { return { name: n, score: 0 }; }),
        round: 0,
        maxRounds: ROUNDS,
        phase: 'intro', // intro → answers → vote → result → (answers…) → fin
        mode: 'ensemble',
        letter: '',
        used: [],
        catIds: DEFAUT.slice(),
        cats: DEFAUT.map(function (id) { return PAR_ID[id].nom; }),
        duration: DURATION,
        answers: {},   // playerIdx -> [réponses]
        submitted: [],
        votes: {},     // voterIdx -> {targetIdx: [bool…]}
        voted: [],
        votesIA: {},
        results: null,
        gains: null,
        finished: false
      };
    },

    /* sur un seul téléphone, chacun écrit à son tour ; sinon tout le monde en même temps */
    turnOf: function (state) {
      if (state.mode === 'chacun' && state.phase === 'answers' && !state.finished) return state.ecrivain;
      return -1;
    },
    viewerOf: function (state) {
      if (state.mode === 'chacun' && state.phase === 'answers' && state.ecrivain >= 0) return state.ecrivain;
      return 0;
    },
    over: function (state) { return state.finished; },
    scoreOf: function (state, i) { return state.players[i].score; },

    gagnants: function (state) {
      var max = -Infinity, g = [];
      state.players.forEach(function (p) { max = Math.max(max, p.score); });
      state.players.forEach(function (p, i) { if (p.score === max) g.push(i); });
      return g.length === 1 ? g : [];
    },

    summary: function (state) {
      var rows = state.players.map(function (p) { return { n: p.name, s: num(p.score) }; })
        .sort(function (a, b) { return b.s - a.s; });
      var top = rows.filter(function (r) { return r.s === rows[0].s; });
      var nr = num(state.round);
      return rows.map(function (r) {
        return '<div class="final-line"><span>' + GG.esc(r.n) + '</span><strong>' +
          r.s + ' pts</strong></div>';
      }).join('') + '<p class="hint">' + nr + ' manche' + (nr > 1 ? 's' : '') + ' · ' +
        catIds(state).length + ' catégories · lettres ' + GG.esc((state.used || []).join(' ')) + '</p>' +
        '<h1>🏆 ' + top.map(function (r) { return GG.esc(r.n); }).join(' & ') + '</h1>';
    },

    /* pendant l'écriture, les réponses des autres restent secrètes */
    redact: function (state, viewer) {
      var copy = GG.clone(state);
      if (copy.phase === 'answers') {
        var mine = copy.answers[viewer];
        copy.answers = {};
        if (mine) copy.answers[viewer] = mine;
        // sur un seul téléphone, la lettre n'est montrée qu'à celui qui écrit
        if (copy.mode === 'chacun' && !(copy.ecrivain === viewer && copy.pretEcrire)) copy.letter = '';
      }
      // les votes de chacun restent secrets (seul le décompte final est public)
      var myVote = copy.votes[viewer];
      copy.votes = {};
      if (myVote) copy.votes[viewer] = myVote;
      return copy;
    },

    apply: function (state, player, action) {
      if (state.finished) return { ok: false, error: 'Partie terminée.' };
      var ids = catIds(state);

      if (action.t === 'config') {
        if (player !== 0) return { ok: false, error: 'Seul l’hôte règle la partie.' };
        if (state.phase !== 'intro') return { ok: false, error: 'La partie a commencé.' };
        if (Array.isArray(action.cats)) {
          var liste = [];
          action.cats.forEach(function (id) { if (cat(id) && liste.indexOf(id) === -1) liste.push(id); });
          if (liste.length < MIN_CATS || liste.length > MAX_CATS) {
            return { ok: false, error: 'Choisissez de ' + MIN_CATS + ' à ' + MAX_CATS + ' catégories.' };
          }
          state.catIds = liste;
          state.cats = liste.map(function (id) { return PAR_ID[id].nom; });
        }
        if (action.duree !== undefined && DUREES.indexOf(+action.duree) !== -1) state.duration = +action.duree;
        if (action.manches !== undefined && MANCHES.indexOf(+action.manches) !== -1) state.maxRounds = +action.manches;
        return { ok: true };
      }

      if (action.t === 'start') {
        if (player !== 0) return { ok: false, error: 'Seul l’hôte lance la manche.' };
        if (state.phase !== 'intro' && state.phase !== 'result') {
          return { ok: false, error: 'Manche en cours.' };
        }
        if (state.phase === 'result' && state.round >= state.maxRounds) {
          state.finished = true;
          return { ok: true };
        }
        if (state.phase === 'intro') state.mode = action.mode === 'chacun' ? 'chacun' : 'ensemble';
        state.round++;
        var avail = LETTERS.split('').filter(function (l) {
          return state.used.indexOf(l) === -1;
        });
        if (!avail.length) avail = LETTERS.split('');
        state.letter = avail[Math.floor(Math.random() * avail.length)];
        state.used.push(state.letter);
        state.phase = 'answers';
        state.answers = {};
        state.submitted = state.players.map(function () { return false; });
        state.votes = {};
        state.voted = state.players.map(function () { return false; });
        state.votesIA = {};
        state.correction = null;
        state.contestes = [];
        state.results = null;
        state.gains = null;
        state.scoreAvant = null;
        if (state.mode === 'chacun') {
          // chacun son tour : le minuteur part quand l'écrivain découvre la lettre
          state.ecrivain = 0;
          state.pretEcrire = false;
          state.echeance = 0;
          return { ok: true };
        }
        state.echeance = Date.now() + state.duration * 1000;
        return { ok: true, timer: { ms: state.duration * 1000, action: { t: 'timeUp' } } };
      }

      if (action.t === 'go') {
        if (state.mode !== 'chacun' || state.phase !== 'answers') return { ok: false, error: 'Pas maintenant.' };
        if (player !== state.ecrivain) return { ok: false, error: 'Ce n’est pas votre tour d’écrire.' };
        if (state.pretEcrire) return { ok: false, error: 'Le minuteur tourne déjà.' };
        state.pretEcrire = true;
        state.echeance = Date.now() + state.duration * 1000;
        return { ok: true, timer: { ms: state.duration * 1000, action: { t: 'timeUp', p: player, r: state.round } } };
      }

      if (action.t === 'answers') {
        // tolérance : une feuille qui arrive juste après le coup de sifflet
        // est acceptée tant que personne n'a commencé à voter
        var grace = state.mode !== 'chacun' && state.phase === 'vote' && !state.submitted[player] &&
          state.voted.every(function (v) { return !v; });
        if (state.phase !== 'answers' && !grace) {
          return { ok: false, error: 'Le temps est écoulé.' };
        }
        if (state.submitted[player]) return { ok: false, error: 'Feuille déjà rendue.' };
        if (state.mode === 'chacun' && player !== state.ecrivain) {
          return { ok: false, error: 'Ce n’est pas votre tour d’écrire.' };
        }
        var list = Array.isArray(action.list) ? action.list.slice(0, ids.length) : [];
        state.answers[player] = list.map(function (a) { return String(a == null ? '' : a).slice(0, 30); });
        state.submitted[player] = true;
        if (state.mode === 'chacun') {
          state.ecrivain = prochainEcrivain(state);
          state.pretEcrire = false;
          state.echeance = 0;
          if (state.ecrivain === -1) state.phase = 'vote';
          return { ok: true };
        }
        if (state.submitted.every(Boolean)) {
          state.phase = 'vote';
        }
        return { ok: true };
      }

      if (action.t === 'timeUp') {
        if (player !== -1) return { ok: false, error: 'Action réservée au chrono.' };
        if (state.mode === 'chacun') {
          // filet : l'écrivain n'a rien envoyé (téléphone posé) — sa feuille reste vide
          if (state.phase === 'answers' && action.r === state.round && action.p === state.ecrivain &&
              !state.submitted[action.p]) {
            state.answers[action.p] = [];
            state.submitted[action.p] = true;
            state.ecrivain = prochainEcrivain(state);
            state.pretEcrire = false;
            if (state.ecrivain === -1) state.phase = 'vote';
          }
          return { ok: true };
        }
        if (state.phase === 'answers') state.phase = 'vote';
        return { ok: true };
      }

      if (action.t === 'vote') {
        if (state.phase !== 'vote') return { ok: false, error: 'Pas de vote en cours.' };
        if (state.mode === 'chacun') return { ok: false, error: 'La table corrige ensemble.' };
        if (state.voted[player]) return { ok: false, error: 'Vous avez déjà voté.' };
        var gr = action.grid && typeof action.grid === 'object' ? action.grid : {};
        var propre = {};
        Object.keys(gr).forEach(function (k) {
          var pi = parseInt(k, 10);
          if (isNaN(pi) || pi < 0 || pi >= state.players.length || pi === player || !Array.isArray(gr[k])) return;
          propre[pi] = gr[k].slice(0, ids.length).map(function (x) { return x !== false; });
        });
        state.votes[player] = propre;
        state.voted[player] = true;
        if (action.ia) state.votesIA[player] = true;
        if (state.voted.every(Boolean)) scoreRound(state);
        return { ok: true };
      }

      if (action.t === 'corriger') {
        // sur un seul téléphone : la table corrige ensemble, une seule fois
        if (state.mode !== 'chacun' || state.phase !== 'vote') return { ok: false, error: 'Pas de correction en cours.' };
        var cg = action.grid && typeof action.grid === 'object' ? action.grid : {};
        state.correction = {};
        Object.keys(cg).forEach(function (k) {
          var pi = parseInt(k, 10);
          if (isNaN(pi) || pi < 0 || pi >= state.players.length || !Array.isArray(cg[k])) return;
          state.correction[pi] = cg[k].slice(0, ids.length).map(function (x) { return x !== false; });
        });
        scoreRound(state);
        return { ok: true };
      }

      if (action.t === 'closeVote') {
        // filet de sécurité : un joueur ne vote pas (téléphone posé…) →
        // l'hôte clôt, les votes manquants valent « tout accepté »
        if (player !== 0) return { ok: false, error: 'Seul l’hôte peut clore le vote.' };
        if (state.phase !== 'vote') return { ok: false, error: 'Pas de vote en cours.' };
        scoreRound(state);
        return { ok: true };
      }

      if (action.t === 'contester') {
        // un refus venu uniquement de l'IA se conteste : le joueur a le dernier mot
        if (state.phase !== 'result' || !state.results) return { ok: false, error: 'Rien à contester.' };
        var ci = action.c | 0;
        var r = (state.results[player] || [])[ci];
        if (!r || r.why !== 'vote' || !r.ia) return { ok: false, error: 'Ce refus ne se conteste pas.' };
        if (!state.contestes) state.contestes = [];
        state.contestes.push({ p: player, c: ci });
        scoreRound(state);
        return { ok: true };
      }

      return { ok: false, error: 'Action inconnue.' };
    },

    /* L'adversaire IA : remplit sa feuille depuis son lexique (sans jamais
       regarder celles des autres), puis juge les réponses adverses avec le
       même lexique. Il attend pendant les écrans qui appartiennent à l'hôte. */
    bot: function (state, me, ctx) {
      if (state.finished) return null;
      var niveau = (ctx && ctx.niveau) || state.niveauIA || 'moyen';
      var ids = catIds(state);

      if (state.mode === 'chacun') {
        if (state.phase === 'answers' && state.ecrivain === me) {
          if (!state.pretEcrire) return { t: 'go' };
          return { t: 'answers', list: botSheet(state.letter, ids, niveau) };
        }
        if (state.phase === 'vote' && me === 0) return { t: 'corriger', grid: {} };
        return null;
      }

      // ma feuille : pendant la manche, ou juste après le coup de sifflet
      // tant que personne n'a voté (la tolérance prévue par apply)
      var grace = state.phase === 'vote' && !state.submitted[me] &&
        state.voted.every(function (v) { return !v; });
      if ((state.phase === 'answers' && !state.submitted[me]) || grace) {
        return { t: 'answers', list: botSheet(state.letter, ids, niveau) };
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
          for (var c = 0; c < ids.length; c++) {
            var ans = (state.answers[p] || [])[c] || '';
            if (autoInvalid(state, ans)) { row[c] = true; continue; } // refus automatique, pas de vote
            row[c] = botJuge(ans, ids[c]);
          }
          grid[p] = row;
        }
        return { t: 'vote', grid: grid, ia: true };
      }

      return null; // intro, résultats, ou rien à faire : on attend
    },

    render: function (el, ctx) {
      var s = assainir(ctx.state);
      var me = ctx.me;
      var v = el._bac;
      if (!v || v.id !== s.id) {
        v = el._bac = { id: s.id, brouillon: {}, votes: {}, vus: {}, t0: {} };
        // l'appli s'est rechargée en pleine manche : les réponses tapées reviennent
        try {
          var gard = JSON.parse(localStorage.getItem('gg-bac-brouillon') || 'null');
          if (gard && gard.id === s.id && gard.me === me && Array.isArray(gard.r)) {
            v.brouillon[gard.round] = gard.r.map(function (x) { return String(x || '').slice(0, 40); });
          }
        } catch (e) {}
      }
      if (el._bacTimer) { clearInterval(el._bacTimer); el._bacTimer = null; }
      var hotseat = ctx.mode === 'local' && !s.niveauIA && s.players.length > 1;
      var solo = ctx.mode === 'local' && !!s.niveauIA;
      var o = { el: el, ctx: ctx, s: s, me: me, v: v, hotseat: hotseat, solo: solo };
      if (s.phase === 'intro') return rendreIntro(o);
      if (s.phase === 'answers') return rendreEcriture(o);
      if (s.phase === 'vote') return s.mode === 'chacun' ? rendreCorrection(o) : rendreVote(o);
      if (s.phase === 'result') return rendreResultats(o);
      el.innerHTML = '<p class="waiting">…</p>';
    },

    _botJuge: botJuge,
    _botSheet: function (L, ids, niveau) { return botSheet(L, ids, niveau); },
    _connait: connait,
    _cle: cle,
    _bonneLettre: bonneLettre,
    _autresCategories: autresCategories,
    _CATEGORIES: CATEGORIES,
    _PRESETS: PRESETS,
    _LEX_SOURCES: function () { return LEX_SOURCES; },
    _normalize: normalize,
    _pourquoi: function (s, r, id, me) { return pourquoi(s, r, id, me); }
  };
  Object.defineProperty(mod, '_BOT_LEX', { get: botLexCompat, enumerable: false });

  /* ======================= rendu ======================= */

  /* ce qui doit être un nombre le redevient (l'état peut venir d'un hôte malveillant) */
  function num(x) { x = +x; return isFinite(x) ? x : 0; }
  function assainir(s) {
    ['round', 'maxRounds', 'duration', 'echeance', 'ecrivain'].forEach(function (k) {
      if (s[k] != null) s[k] = num(s[k]);
    });
    if (!s.duration) s.duration = DURATION;
    if (!Array.isArray(s.players)) s.players = [];
    s.players.forEach(function (p) { p.score = num(p.score); });
    if (Array.isArray(s.gains)) s.gains = s.gains.map(num);
    if (Array.isArray(s.scoreAvant)) s.scoreAvant = s.scoreAvant.map(num);
    if (!Array.isArray(s.submitted)) s.submitted = [];
    if (!Array.isArray(s.voted)) s.voted = [];
    if (!s.answers || typeof s.answers !== 'object') s.answers = {};
    if (Array.isArray(s.results)) {
      s.results.forEach(function (l) {
        if (Array.isArray(l)) l.forEach(function (r) {
          if (!r || typeof r !== 'object') return;
          r.pts = num(r.pts);
          if (Array.isArray(r.par)) r.par = r.par.map(num);
          if (Array.isArray(r.avec)) r.avec = r.avec.map(num);
        });
      });
    }
    return s;
  }

  function esc(x) { return GG.esc(x); }
  function lettreSure(L) { return /^[A-Z]$/.test(L) ? L : '?'; }
  function nomCat(id) { var c = cat(id); return c ? c.nom : String(id || '?'); }
  function icCat(id) { var c = cat(id); return c ? c.ic : '❔'; }
  function son(n, o) { try { GG.sfx.play(n, o); } catch (e) {} }
  function vibre(t) { try { GG.haptic(t); } catch (e) {} }
  function listeNoms(s, idx) {
    var n = idx.map(function (i) { return i === -1 ? 'la table' : (s.players[i] ? s.players[i].name : '?'); });
    if (n.length <= 1) return n.join('');
    return n.slice(0, -1).join(', ') + ' et ' + n[n.length - 1];
  }

  /* ---------------- avant la partie : catégories, durée, manches ---------------- */
  function rendreIntro(o) {
    var el = o.el, s = o.s, ctx = o.ctx;
    var hote = o.me === 0;
    var ids = catIds(s);
    var html = '<div class="bac-intro">';
    html += '<div class="bac-hero"><span class="bac-hero-l" aria-hidden="true">' +
      'ABCDEFG'.split('').map(function (L, i) { return '<i style="--i:' + i + '">' + L + '</i>'; }).join('') +
      '</span><h2>Petit Bac</h2><p>' + ids.length + ' catégories · ' + s.duration + ' s · ' + s.maxRounds + ' manches</p></div>';
    if (hote) {
      html += '<!--haut-->';
      html += '<h3 class="bac-h">Sélections</h3><div class="bac-presets">' + PRESETS.map(function (p) {
        var actif = p.cats.length === ids.length && p.cats.every(function (x) { return ids.indexOf(x) !== -1; });
        return '<button class="bac-preset' + (actif ? ' active' : '') + '" data-preset="' + p.id + '">' + p.nom + '</button>';
      }).join('') + '<button class="bac-preset" data-preset="hasard">🎲 Au hasard</button></div>';
      html += '<h3 class="bac-h">Catégories <small>' + ids.length + ' / ' + MAX_CATS + '</small></h3><div class="bac-cats">' +
        CATEGORIES.map(function (c) {
          var on = ids.indexOf(c.id) !== -1;
          return '<button class="bac-cat-chip' + (on ? ' on' : '') + '" data-cat="' + c.id + '" aria-pressed="' + on + '">' +
            '<span>' + c.ic + '</span>' + c.nom + '</button>';
        }).join('') + '</div>';
      html += '<h3 class="bac-h">Durée d’une manche</h3><div class="choix-ligne">' + DUREES.map(function (d) {
        return '<button class="count-btn' + (s.duration === d ? ' active' : '') + '" data-duree="' + d + '">' + d + ' s</button>';
      }).join('') + '</div>';
      html += '<h3 class="bac-h">Nombre de manches</h3><div class="choix-ligne">' + MANCHES.map(function (m) {
        return '<button class="count-btn' + (s.maxRounds === m ? ' active' : '') + '" data-manches="' + m + '">' + m + '</button>';
      }).join('') + '</div>';
      html += '<p class="hint bac-bareme">✔️ 10 pts par mot unique · 🤝 5 pts si un autre a le même · ✗ 0 si vide, hors lettre ou refusé.' +
        (o.hotseat ? '<br>📱 Chacun écrit à son tour, lettre révélée pour lui seul, puis on corrige ensemble.' : '') + '</p>';
      html += '<div class="bac-bas"><button class="btn big jeu" data-a="start">🎡 Tirer la lettre de la manche 1</button></div>';
      html = html.replace('<!--haut-->', '<div class="bac-haut"><button class="btn big jeu" data-a="start">🎡 Tirer la lettre de la manche 1</button></div>');
    } else {
      html += '<div class="bac-cats lecture">' + ids.map(function (id) {
        return '<span class="bac-cat-chip on"><span>' + icCat(id) + '</span>' + esc(nomCat(id)) + '</span>';
      }).join('') + '</div><p class="waiting">⏳ L’hôte choisit les catégories et va lancer la première manche…</p>';
    }
    html += '</div>';
    el.innerHTML = html;
    if (!hote) return;
    function envoie(a) { son('toggle', { volume: 0.6 }); ctx.act(a); }
    el.querySelectorAll('[data-preset]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-preset');
        if (id === 'hasard') {
          var tous = GG.shuffle(CATEGORIES.map(function (c) { return c.id; }));
          envoie({ t: 'config', cats: tous.slice(0, 6) });
          return;
        }
        var p = PRESETS.filter(function (x) { return x.id === id; })[0];
        if (p) envoie({ t: 'config', cats: p.cats });
      });
    });
    el.querySelectorAll('[data-cat]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-cat');
        var l = ids.slice(), i = l.indexOf(id);
        if (i !== -1) {
          if (l.length <= MIN_CATS) { GG.fx.shake(b, 0.6); son('wrong', { volume: 0.4 }); return; }
          l.splice(i, 1);
        } else {
          if (l.length >= MAX_CATS) { GG.fx.shake(b, 0.6); son('wrong', { volume: 0.4 }); return; }
          l.push(id);
        }
        envoie({ t: 'config', cats: l });
      });
    });
    el.querySelectorAll('[data-duree]').forEach(function (b) {
      b.addEventListener('click', function () { envoie({ t: 'config', duree: +b.getAttribute('data-duree') }); });
    });
    el.querySelectorAll('[data-manches]').forEach(function (b) {
      b.addEventListener('click', function () { envoie({ t: 'config', manches: +b.getAttribute('data-manches') }); });
    });
    el.querySelectorAll('[data-a="start"]').forEach(function (st) {
      st.addEventListener('click', function () {
        if (st.disabled) return;
        el.querySelectorAll('[data-a="start"]').forEach(function (x) { x.disabled = true; });
        ctx.act(o.hotseat ? { t: 'start', mode: 'chacun' } : { t: 'start' });
      });
    });
  }

  /* ---------------- la roue des lettres ---------------- */
  function roueHtml() {
    var n = LETTERS.length;
    return '<div class="bac-roue-cadre"><span class="bac-roue-fleche" aria-hidden="true"></span>' +
      '<div class="bac-roue">' + LETTERS.split('').map(function (L, i) {
        return '<span class="bac-roue-l" style="--a:' + (i * 360 / n).toFixed(2) + 'deg">' + L + '</span>';
      }).join('') + '</div><span class="bac-roue-moyeu" aria-hidden="true">?</span></div>';
  }
  /* fait tourner la roue jusqu'à la lettre ; rend une promesse à l'arrêt */
  function tournerRoue(el, L, fini) {
    var roue = el.querySelector('.bac-roue');
    var moyeu = el.querySelector('.bac-roue-moyeu');
    var n = LETTERS.length, i = LETTERS.indexOf(L);
    if (!roue || i === -1) { fini(); return; }
    var tours = 3, duree = GG.fx.reduced() ? 150 : 2400;
    var angle = -(tours * 360 + i * 360 / n);
    roue.style.transition = 'none';
    roue.style.transform = 'rotate(0deg)';
    void roue.offsetWidth;
    roue.style.transition = 'transform ' + duree + 'ms cubic-bezier(.12,.8,.22,1)';
    roue.style.transform = 'rotate(' + angle.toFixed(2) + 'deg)';
    son('whoosh', { volume: 0.5 });
    // un « tic » à chaque lettre qui passe sous la flèche (freinage de la roue)
    var K = tours * n + i, tics = Math.min(K, 18);
    if (duree > 300) {
      for (var k = 1; k <= tics; k++) {
        var t = 1 - Math.pow(1 - k / tics, 1 / 3);
        setTimeout(function () { son('tick', { volume: 0.35 }); }, Math.round(t * duree * 0.97));
      }
    }
    setTimeout(function () {
      if (moyeu) { moyeu.textContent = L; GG.fx.pop(moyeu, 1.5); }
      son('reveal');
      vibre('medium');
      GG.fx.burst(moyeu || roue, { count: 22, shape: 'star' });
      fini();
    }, duree + 30);
  }

  /* ---------------- l'écriture ---------------- */
  function secondesRestantes(o) {
    var s = o.s, v = o.v;
    if (o.ctx.mode === 'guest') {
      // l'horloge de l'hôte n'est pas la nôtre : on part du moment où la manche est arrivée ici
      var k = s.round + ':' + (s.mode === 'chacun' ? s.ecrivain : 'tous');
      if (!v.t0[k]) v.t0[k] = Date.now();
      return Math.max(0, Math.ceil(s.duration - (Date.now() - v.t0[k]) / 1000));
    }
    if (!s.echeance) return s.duration;
    return Math.max(0, Math.ceil((s.echeance - Date.now()) / 1000));
  }

  function rendreEcriture(o) {
    var el = o.el, s = o.s, me = o.me, v = o.v, ctx = o.ctx;
    var ids = catIds(s);
    var sub = !!s.submitted[me];
    // chacun son tour : écran « prêt ? » avant de découvrir la lettre
    if (s.mode === 'chacun' && s.ecrivain === me && !s.pretEcrire && !sub) {
      el.innerHTML = '<div class="bac-pret"><span class="bac-pret-ic">🙈</span><h2>' + esc(s.players[me].name) +
        ', à vous d’écrire !</h2><p class="hint">Manche ' + s.round + ' / ' + s.maxRounds + ' · ' + ids.length +
        ' catégories · ' + s.duration + ' secondes.<br>Les autres ne regardent pas l’écran…</p>' +
        '<button class="btn big jeu" data-a="go">🎡 Découvrir ma lettre</button></div>';
      var go = el.querySelector('[data-a="go"]');
      var arme = Date.now() + 300; // bouton posé à l'endroit exact du « Voir mon jeu » de la coque
      go.addEventListener('click', function () {
        if (Date.now() < arme || go.disabled) return;
        go.disabled = true;
        ctx.act({ t: 'go' });
      });
      v.cle = null;
      return;
    }
    var L = lettreSure(s.letter);
    var cleEcran = 'e:' + s.round + ':' + me + ':' + (sub ? 1 : 0) + ':' + (s.mode === 'chacun' ? s.ecrivain : '');
    var brouillon = v.brouillon[s.round] || (v.brouillon[s.round] = []);
    // l'écran est déjà là (rafraîchissement réseau, message…) : on ne touche
    // pas aux champs en cours de saisie, seulement aux statuts des autres
    if (v.cle === cleEcran && el.querySelector('.bac-ecrire')) {
      var stEl = el.querySelector('.bac-statuts');
      if (stEl) stEl.innerHTML = statuts(o);
      lancerMinuteur(o);
      return;
    }
    v.cle = cleEcran;
    var cleRoue = s.round + ':' + me + ':' + L;
    var tourner = !v.vus[cleRoue] && !sub && L !== '?';
    var html = '<div class="bac-ecrire">';
    html += '<div class="bac-tete">' +
      (tourner ? roueHtml()
        : '<div class="bac-chrono"><svg viewBox="0 0 84 84" aria-hidden="true"><circle class="bac-chrono-fond" cx="42" cy="42" r="36"/>' +
          '<circle class="bac-chrono-arc" cx="42" cy="42" r="36"/></svg><span class="bac-lettre">' + esc(L) + '</span>' +
          '<span class="bac-sec" id="bac-timer">' + secondesRestantes(o) + '</span></div>') +
      '<div class="bac-infos"><p class="bac-manche">Manche ' + s.round + ' / ' + s.maxRounds + '</p>' +
      '<div class="bac-statuts">' + statuts(o) + '</div></div>' +
      (sub ? '' : '<button class="btn small jeu bac-stop" data-a="send">✋ Stop</button>') + '</div>';
    html += '<div class="bac-champs">' + ids.map(function (id, c) {
      var val = (s.answers[me] || [])[c];
      if (val === undefined) val = brouillon[c] || '';
      return '<label class="bac-field" style="--k:' + c + '"><span class="bac-field-ic">' + icCat(id) + '</span><span class="bac-field-nom">' +
        esc(nomCat(id)) + '</span><input type="text" data-cat="' + c + '" maxlength="30" autocomplete="off" autocapitalize="words" ' +
        'spellcheck="false" placeholder="' + (tourner ? '…' : esc(L) + '…') + '" value="' + esc(val) + '"' +
        (sub ? ' disabled' : '') + '></label>';
    }).join('') + '</div>';
    html += '<div class="bac-bas"><button class="btn big jeu" data-a="send"' + (sub ? ' disabled' : '') + '>' +
      (sub ? '⏳ En attente des autres…' : '✋ Stop ! J’ai fini') + '</button></div>';
    html += '</div>';
    el.innerHTML = html;

    el.querySelectorAll('input[data-cat]').forEach(function (inp) {
      inp.addEventListener('input', function () {
        brouillon[parseInt(inp.getAttribute('data-cat'), 10)] = inp.value;
        try {
          localStorage.setItem('gg-bac-brouillon', JSON.stringify({ id: s.id, me: ctx.me, round: s.round, r: brouillon }));
        } catch (e) {}
        son('type', { volume: 0.25 });
      });
      inp.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        var tous = el.querySelectorAll('input[data-cat]');
        var i = parseInt(inp.getAttribute('data-cat'), 10);
        if (tous[i + 1]) tous[i + 1].focus(); else inp.blur();
      });
    });
    el.querySelectorAll('[data-a="send"]').forEach(function (b) {
      b.addEventListener('click', function () { envoyerFeuille(o); });
    });

    if (tourner) {
      v.vus[cleRoue] = true;
      el.querySelectorAll('input[data-cat]').forEach(function (i) { i.disabled = true; });
      tournerRoue(el, L, function () {
        if (!el.querySelector('.bac-roue')) return;
        var tete = el.querySelector('.bac-tete');
        var cadre = el.querySelector('.bac-roue-cadre');
        if (cadre && tete) {
          var d = document.createElement('div');
          d.className = 'bac-chrono entre';
          d.innerHTML = '<svg viewBox="0 0 84 84" aria-hidden="true"><circle class="bac-chrono-fond" cx="42" cy="42" r="36"/>' +
            '<circle class="bac-chrono-arc" cx="42" cy="42" r="36"/></svg><span class="bac-lettre">' + esc(L) + '</span>' +
            '<span class="bac-sec" id="bac-timer">' + secondesRestantes(o) + '</span>';
          setTimeout(function () {
            if (!cadre.isConnected) return;
            tete.replaceChild(d, cadre);
            el.querySelectorAll('input[data-cat]').forEach(function (i) {
              if (!s.submitted[me]) { i.disabled = false; i.placeholder = L + '…'; }
            });
            var premier = el.querySelector('input[data-cat]');
            if (premier && !('ontouchstart' in root)) premier.focus();
            lancerMinuteur(o);
          }, 650);
        }
      });
    } else {
      lancerMinuteur(o);
    }
    if (!sub) el.querySelector('.bac-champs').classList.add('entre'); // entrée échelonnée en CSS
  }

  function statuts(o) {
    var s = o.s;
    return s.players.map(function (p, i) {
      if (i === o.me) return '';
      var fait = !!s.submitted[i];
      var ecrit = s.mode === 'chacun' ? (i === s.ecrivain ? '✍️ écrit…' : fait ? '✅ a écrit' : '⏳ attend son tour')
        : fait ? '✅ a fini' : '✍️ écrit…';
      return '<span class="bac-statut' + (fait ? ' fait' : '') + '">' + esc(p.name) + ' ' + ecrit + '</span>';
    }).join('');
  }

  function envoyerFeuille(o) {
    var el = o.el, s = o.s, me = o.me;
    var send = el.querySelector('.bac-bas [data-a="send"]');
    if (!send || send.disabled || s.submitted[me]) return;
    el.querySelectorAll('[data-a="send"]').forEach(function (x) { x.disabled = true; });
    var list = [];
    el.querySelectorAll('input[data-cat]').forEach(function (inp) {
      list[parseInt(inp.getAttribute('data-cat'), 10)] = inp.value;
      inp.disabled = true;
    });
    son('bell', { volume: 0.6 });
    vibre('success');
    if (!o.ctx.act({ t: 'answers', list: list })) {
      el.querySelectorAll('[data-a="send"]').forEach(function (x) { x.disabled = false; });
    }
  }

  /* minuteur circulaire : l'arc se vide, « tic » les 10 dernières secondes */
  function lancerMinuteur(o) {
    var el = o.el, s = o.s;
    var arc = el.querySelector('.bac-chrono-arc');
    var txt = el.querySelector('#bac-timer');
    if (!arc || !txt) return;
    var C = 2 * Math.PI * 36;
    var reste = secondesRestantes(o);
    var frac = Math.min(1, reste / s.duration);
    arc.style.strokeDasharray = C.toFixed(2);
    arc.style.transition = 'none';
    arc.style.strokeDashoffset = (C * (1 - frac)).toFixed(2);
    void arc.getBoundingClientRect();
    if (!s.submitted[o.me]) {
      arc.style.transition = 'stroke-dashoffset ' + Math.max(0, reste) + 's linear, stroke .4s';
      arc.style.strokeDashoffset = C.toFixed(2);
    }
    var chrono = el.querySelector('.bac-chrono');
    function maj() {
      if (!txt.isConnected) { clearInterval(el._bacTimer); el._bacTimer = null; return; }
      var r = secondesRestantes(o);
      if (String(r) !== txt.textContent) {
        txt.textContent = r;
        if (r <= 10 && r > 0 && !s.submitted[o.me]) son('tick', { volume: 0.3 + (10 - r) * 0.05, pitch: 1 + (10 - r) * 0.03 });
      }
      if (chrono) chrono.classList.toggle('urgent', r <= 10);
      if (r <= 0 && !s.submitted[o.me]) {
        // le temps est écoulé : on envoie ce qui est écrit, rien ne se perd
        clearInterval(el._bacTimer); el._bacTimer = null;
        son('bell');
        envoyerFeuille(o);
      }
    }
    maj();
    if (!s.submitted[o.me]) el._bacTimer = setInterval(maj, 250);
  }

  /* ---------------- le vote (un téléphone chacun) ---------------- */
  function rendreVote(o) {
    var el = o.el, s = o.s, me = o.me, v = o.v, ctx = o.ctx;
    var ids = catIds(s);
    var L = lettreSure(s.letter);
    // ma feuille n'est pas partie (coupure du minuteur) : on envoie le brouillon
    if (!s.submitted[me] && s.voted.every(function (x) { return !x; }) && !v.envoiTardif) {
      v.envoiTardif = true;
      var br = v.brouillon[s.round] || [];
      setTimeout(function () { ctx.act({ t: 'answers', list: ids.map(function (x, c) { return br[c] || ''; }) }); }, 50);
    }
    var cleEcran = 'v:' + s.round + ':' + me + ':' + (s.voted[me] ? 1 : 0);
    if (v.cle === cleEcran && el.querySelector('.bac-vote') && !s.voted[me]) return; // mes choix restent en place
    v.cle = cleEcran;
    var html = '<div class="bac-vote">';
    html += '<div class="bac-vote-tete"><span class="bac-lettre-mini">' + esc(L) + '</span><div><h3>Vérifiez les réponses</h3>' +
      '<p class="hint">Manche ' + s.round + ' / ' + s.maxRounds + '</p></div>' +
      (s.voted[me] ? '' : '<button class="btn small jeu bac-stop" data-a="vote">Valider</button>') + '</div>';
    if (s.voted[me]) {
      var attente = s.players.filter(function (p, i) { return !s.voted[i]; }).map(function (p) { return p.name; });
      html += '<p class="waiting">⏳ En attente du vote de ' + esc(attente.join(', ') || '…') + '</p>';
      if (me === 0) {
        html += '<button class="btn" data-a="closevote">⏱️ Clore le vote (les votes manquants valent « tout accepté »)</button>';
      }
      html += '</div>';
      el.innerHTML = html;
      var cv = el.querySelector('[data-a="closevote"]');
      if (cv) cv.addEventListener('click', function () { cv.disabled = true; ctx.act({ t: 'closeVote' }); });
      return;
    }
    var aJuger = 0;
    var brVote = v.votes[s.round] || (v.votes[s.round] = {});
    s.players.forEach(function (p, pi) {
      if (pi === me) return;
      html += '<div class="bac-carte"><h4 class="bac-owner">' + esc(p.name) + '</h4>';
      ids.forEach(function (id, c) {
        var ans = (s.answers[pi] || [])[c] || '';
        var bad = !espace(ans) ? 'vide' : autoInvalid(s, ans) ? 'lettre' : '';
        var connu = !bad && connait(id, ans);
        var etat;
        if (bad === 'vide') etat = '<span class="bac-etat gris">—</span>';
        else if (bad) etat = '<span class="bac-etat rouge" title="Mauvaise lettre">✗ lettre</span>';
        else if (connu) etat = '<span class="bac-etat vert" title="Connu du dictionnaire : validé d’office">📖 validé</span>';
        else {
          aJuger++;
          var non = brVote[pi] && brVote[pi][c] === false;
          etat = '<span class="bac-choix" role="group" aria-label="Votre avis"><button class="bac-oui' + (non ? '' : ' on') +
            '" data-p="' + pi + '" data-c="' + c + '" data-v="1" aria-pressed="' + !non + '">👍</button><button class="bac-non' +
            (non ? ' on' : '') + '" data-p="' + pi + '" data-c="' + c + '" data-v="0" aria-pressed="' + non + '">👎</button></span>';
        }
        html += '<div class="bac-vote-row' + (bad ? ' auto-bad' : '') + (connu ? ' connu' : '') + '"><span class="bac-cat">' + icCat(id) +
          ' ' + esc(nomCat(id)) + '</span><span class="bac-ans">' + (ans ? esc(ans) : '—') + '</span>' + etat + '</div>';
      });
      html += '</div>';
    });
    if (aJuger) {
      html += '<p class="hint bac-aide">📖 Les mots du dictionnaire sont validés d’office. Pour les autres, 👍 = j’accepte, 👎 = je refuse (mot inventé, hors sujet…). Un mot n’est refusé que si la majorité est contre.</p>';
    } else {
      html += '<p class="mini-msg bac-rien">✨ Rien à juger : le dictionnaire a tout vérifié.</p>';
    }
    html += '<div class="bac-bas"><button class="btn big jeu" data-a="vote">' + (aJuger ? 'Envoyer mes votes' : 'Voir la correction') + '</button></div>';
    html += '</div>';
    el.innerHTML = html;
    el.querySelectorAll('.bac-choix button').forEach(function (b) {
      b.addEventListener('click', function () {
        var pi = b.getAttribute('data-p'), c = parseInt(b.getAttribute('data-c'), 10);
        var oui = b.getAttribute('data-v') === '1';
        if (!brVote[pi]) brVote[pi] = [];
        brVote[pi][c] = oui;
        var grp = b.parentNode;
        grp.querySelector('.bac-oui').classList.toggle('on', oui);
        grp.querySelector('.bac-non').classList.toggle('on', !oui);
        grp.querySelector('.bac-oui').setAttribute('aria-pressed', oui);
        grp.querySelector('.bac-non').setAttribute('aria-pressed', !oui);
        son(oui ? 'toggle' : 'erase', { volume: 0.6 });
        GG.fx.pop(b, 1.15);
      });
    });
    var vb = el.querySelector('.bac-bas [data-a="vote"]');
    function voter() {
      if (vb.disabled) return;
      el.querySelectorAll('[data-a="vote"]').forEach(function (x) { x.disabled = true; });
      var grid = {};
      s.players.forEach(function (p, pi) {
        if (pi === me) return;
        grid[pi] = ids.map(function (id, c) { return !(brVote[pi] && brVote[pi][c] === false); });
      });
      son('success', { volume: 0.5 });
      if (!ctx.act({ t: 'vote', grid: grid })) {
        el.querySelectorAll('[data-a="vote"]').forEach(function (x) { x.disabled = false; });
      }
    }
    el.querySelectorAll('[data-a="vote"]').forEach(function (x) { x.addEventListener('click', voter); });
    GG.fx.stagger(el.querySelectorAll('.bac-carte'), { gap: 80 });
    // rien à juger : on passe tout seul à la correction
    if (!aJuger) {
      var k = 'auto:' + s.round + ':' + me;
      if (!v.vus[k]) { v.vus[k] = true; setTimeout(function () { if (vb.isConnected) voter(); }, 1200); }
    }
  }

  /* ---------------- la correction collective (sur un seul téléphone) ---------------- */
  function rendreCorrection(o) {
    var el = o.el, s = o.s, v = o.v, ctx = o.ctx;
    var ids = catIds(s);
    var L = lettreSure(s.letter);
    var cleEcran = 'c:' + s.round;
    if (v.cle === cleEcran && el.querySelector('.bac-vote')) return;
    v.cle = cleEcran;
    var br = v.votes['c' + s.round] || (v.votes['c' + s.round] = {});
    var html = '<div class="bac-vote bac-table">';
    html += '<div class="bac-vote-tete"><span class="bac-lettre-mini">' + esc(L) + '</span><div><h3>On corrige ensemble !</h3>' +
      '<p class="hint">Tout le monde regarde : refusez d’un 👎 les mots inventés ou hors sujet.</p></div>' +
      '<button class="btn small jeu bac-stop" data-a="corriger">Valider</button></div>';
    ids.forEach(function (id, c) {
      html += '<div class="bac-carte"><h4 class="bac-owner">' + icCat(id) + ' ' + esc(nomCat(id)) + '</h4>';
      s.players.forEach(function (p, pi) {
        var ans = (s.answers[pi] || [])[c] || '';
        var bad = !espace(ans) ? 'vide' : autoInvalid(s, ans) ? 'lettre' : '';
        var connu = !bad && connait(id, ans);
        var etat;
        if (bad === 'vide') etat = '<span class="bac-etat gris">—</span>';
        else if (bad) etat = '<span class="bac-etat rouge">✗ lettre</span>';
        else if (connu) etat = '<span class="bac-etat vert">📖 validé</span>';
        else {
          var non = br[pi] && br[pi][c] === false;
          etat = '<span class="bac-choix"><button class="bac-oui' + (non ? '' : ' on') + '" data-p="' + pi + '" data-c="' + c +
            '" data-v="1">👍</button><button class="bac-non' + (non ? ' on' : '') + '" data-p="' + pi + '" data-c="' + c + '" data-v="0">👎</button></span>';
        }
        html += '<div class="bac-vote-row' + (bad ? ' auto-bad' : '') + '"><span class="bac-cat">' + esc(p.name) + '</span>' +
          '<span class="bac-ans">' + (ans ? esc(ans) : '—') + '</span>' + etat + '</div>';
      });
      html += '</div>';
    });
    html += '<div class="bac-bas"><button class="btn big jeu" data-a="corriger">✔️ Valider la correction</button></div></div>';
    el.innerHTML = html;
    el.querySelectorAll('.bac-choix button').forEach(function (b) {
      b.addEventListener('click', function () {
        var pi = b.getAttribute('data-p'), c = parseInt(b.getAttribute('data-c'), 10);
        var oui = b.getAttribute('data-v') === '1';
        if (!br[pi]) br[pi] = [];
        br[pi][c] = oui;
        b.parentNode.querySelector('.bac-oui').classList.toggle('on', oui);
        b.parentNode.querySelector('.bac-non').classList.toggle('on', !oui);
        son(oui ? 'toggle' : 'erase', { volume: 0.6 });
      });
    });
    var boutons = el.querySelectorAll('[data-a="corriger"]');
    boutons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (btn.disabled) return;
        boutons.forEach(function (x) { x.disabled = true; });
        var grid = {};
        s.players.forEach(function (p, pi) { grid[pi] = ids.map(function (id, c) { return !(br[pi] && br[pi][c] === false); }); });
        son('success', { volume: 0.5 });
        if (!ctx.act({ t: 'corriger', grid: grid })) boutons.forEach(function (x) { x.disabled = false; });
      });
    });
    GG.fx.stagger(el.querySelectorAll('.bac-carte'), { gap: 60 });
  }

  /* ---------------- la correction animée, ligne par ligne ---------------- */
  function pourquoi(s, r, id, me) {
    var L = lettreSure(s.letter);
    switch (r.why) {
      case 'vide': return 'pas de réponse';
      case 'lettre': return 'ne commence pas par ' + L;
      case 'court': return 'trop court';
      case 'table': return 'refusé par la table';
      case 'vote':
        if (r.ia) {
          var autres = autresCategories(r.ans, id);
          return '🤖 inconnu de l’IA pour « ' + nomCat(id) + ' »' +
            (autres.length ? ' (pour elle : ' + autres.slice(0, 2).map(nomCat).join(', ') + ')' : '');
        }
        return 'refusé par ' + listeNoms(s, r.par || []) + (s.players.length > 2 ? ' (majorité contre)' : '');
      case 'doublon': return 'même réponse que ' + listeNoms(s, r.avec || []) + ' : points partagés';
      default:
        if (r.conteste) return '✔️ accepté après contestation';
        if (r.dico) return '📖 connu du dictionnaire : validé malgré le refus';
        return '';
    }
  }

  function rendreResultats(o) {
    var el = o.el, s = o.s, me = o.me, v = o.v, ctx = o.ctx;
    var ids = catIds(s);
    var L = lettreSure(s.letter);
    var cleRes = 'r:' + s.round + ':' + JSON.stringify(s.contestes || []);
    var nouveau = !v.vus[cleRes];
    var premiere = !v.vus['r:' + s.round];
    v.vus[cleRes] = v.vus['r:' + s.round] = true;
    v.cle = cleRes;
    var gains = s.gains || [];
    var html = '<div class="bac-res">';
    html += '<div class="bac-vote-tete"><span class="bac-lettre-mini">' + esc(L) + '</span><div><h3>Correction · manche ' + s.round +
      ' / ' + s.maxRounds + '</h3><p class="hint">✔️ 10 pts · 🤝 doublon 5 pts · ✗ 0</p></div></div>';
    html += '<div class="bac-podium">' + s.players.map(function (p, i) {
      return '<div class="bac-podium-j' + (i === me ? ' moi' : '') + '" data-p="' + i + '"><span class="bac-podium-nom">' + esc(p.name) +
        '</span><b class="bac-gain" data-g="' + (gains[i] || 0) + '">+' + (premiere ? 0 : (gains[i] || 0)) + '</b><small>total <span class="bac-total">' +
        (premiere ? (s.scoreAvant ? s.scoreAvant[i] : p.score) : p.score) + '</span></small></div>';
    }).join('') + '</div>';
    var suite = o.me === 0 ? '<button class="btn big jeu" data-a="start">' +
      (s.round >= s.maxRounds ? '🏆 Voir le classement final' : '🎡 Manche suivante') + '</button>' : '';
    if (suite) html += '<div class="bac-haut">' + suite + '</div>';
    html += '<div class="bac-lignes">' + ids.map(function (id, c) {
      return '<div class="bac-ligne' + (premiere ? ' cachee' : '') + '" data-c="' + c + '"><div class="bac-ligne-cat">' + icCat(id) + ' ' + esc(nomCat(id)) + '</div>' +
        s.players.map(function (p, pi) {
          var r = (s.results[pi] || [])[c] || { ans: '', pts: 0, why: 'vide' };
          var cls = r.pts === 10 ? 'ok' : r.pts === 5 ? 'demi' : 'non';
          var why = pourquoi(s, r, id, me);
          var contest = pi === me && r.why === 'vote' && r.ia && ctx.mode !== 'guest';
          return '<div class="bac-rep ' + cls + '"><span class="bac-qui">' + esc(p.name) + '</span><span class="bac-mot">' +
            (r.ans ? esc(r.ans) : '—') + '</span><span class="bac-pts">' + (r.pts ? '+' + r.pts : '0') + '</span>' +
            (why ? '<small class="bac-why">' + esc(why) + '</small>' : '') +
            (contest ? '<button class="btn small bac-contester" data-c="' + c + '">✋ Contester</button>' : '') + '</div>';
        }).join('') + '</div>';
    }).join('') + '</div>';
    if (suite) {
      html += '<div class="bac-bas">' + suite + '</div>';
    } else {
      html += '<p class="waiting">⏳ L’hôte va lancer la suite…</p>';
    }
    html += '</div>';
    el.innerHTML = html;

    var arme = Date.now() + 400; // le bouton apparaît là où l'on vient de toucher
    el.querySelectorAll('[data-a="start"]').forEach(function (st) {
      st.addEventListener('click', function () {
        if (Date.now() < arme || st.disabled) return;
        el.querySelectorAll('[data-a="start"]').forEach(function (x) { x.disabled = true; });
        ctx.act({ t: 'start' });
      });
    });
    el.querySelectorAll('.bac-contester').forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.disabled) return;
        b.disabled = true;
        son('correct');
        vibre('success');
        ctx.act({ t: 'contester', c: parseInt(b.getAttribute('data-c'), 10) });
      });
    });

    if (premiere) {
      // les lignes se dévoilent une à une, les points défilent
      var lignes = el.querySelectorAll('.bac-ligne');
      var pas = GG.fx.reduced() ? 60 : 420;
      var cumul = s.players.map(function () { return 0; });
      lignes.forEach(function (ln, c) {
        setTimeout(function () {
          if (!ln.isConnected) return;
          ln.classList.remove('cachee');
          ln.classList.add('entre');
          var pts = 0;
          s.players.forEach(function (p, pi) {
            var r = (s.results[pi] || [])[c];
            if (!r || !r.pts) return;
            pts += r.pts;
            var b = el.querySelector('.bac-podium-j[data-p="' + pi + '"] .bac-gain');
            if (b) {
              GG.fx.countUp(b, cumul[pi], cumul[pi] + r.pts, 300, function (x) { return '+' + x; });
              cumul[pi] += r.pts;
            }
          });
          son(pts ? 'coin' : 'tock', { volume: pts ? 0.45 : 0.3, pitch: 0.9 + c * 0.04 });
        }, 250 + c * pas);
      });
      setTimeout(function () {
        el.querySelectorAll('.bac-podium-j').forEach(function (j) {
          var pi = +j.getAttribute('data-p');
          var t = j.querySelector('.bac-total');
          if (t && t.isConnected) GG.fx.countUp(t, s.scoreAvant ? s.scoreAvant[pi] : 0, s.players[pi].score, 700);
        });
        var meilleur = Math.max.apply(null, gains);
        var gagnant = el.querySelector('.bac-podium-j[data-p="' + gains.indexOf(meilleur) + '"]');
        if (gagnant && meilleur > 0) { GG.fx.glow(gagnant, '#ffc23d', 1200); GG.fx.burst(gagnant, { count: 16, shape: 'star' }); }
        son('success', { volume: 0.7 });
      }, 300 + lignes.length * pas);
    } else if (nouveau) {
      // une contestation vient d'être acceptée
      var pod = el.querySelector('.bac-podium-j[data-p="' + me + '"]');
      if (pod) { GG.fx.floatText(pod, '+ points', { color: '#2fd67b', size: 22 }); GG.fx.pop(pod, 1.1); }
    }
  }

  GG.register(mod);
  if (typeof module === 'object' && module.exports) module.exports = mod;
})(typeof self !== 'undefined' ? self : globalThis);
