const ROOT = require('path').join(__dirname, '..');
/* Tests : Quiz, Le Plus Proche, 8 américain, Discussion. */
require(ROOT + '/js/games/registry.js');
const quiz = require(ROOT + '/js/games/quiz.js');
const proche = require(ROOT + '/js/games/proche.js');
const huit = require(ROOT + '/js/games/huit.js');
const chat = require(ROOT + '/js/games/chat.js');

let failures = 0;
function check(n, c, e) {
  if (c) console.log('  OK  ' + n);
  else { failures++; console.log('  FAIL ' + n + (e !== undefined ? ' -> ' + JSON.stringify(e) : '')); }
}

/* ================= QUIZ ================= */
console.log('--- Quiz ---');
{
  const B = quiz._BANK;
  check('banque : au moins 1500 questions', B.length >= 1500, B.length);
  check('thèmes : 9 thèmes de 130 questions ou plus (et « Depuis 2016 »)',
    quiz._THEMES.filter(t => t.id !== 'melange' && quiz._themeCount(t.id) >= 130).length >= 9,
    quiz._THEMES.map(t => t.id + ':' + quiz._themeCount(t.id)).join(' '));
  check('banque : 7 champs partout (thème connu, niveau 1 à 3)', B.every(e => {
    const p = e.split('|');
    return p.length === 7 && /^[123]r?$/.test(p[6]) && quiz._THEMES.some(t => t.id === p[5] && t.id !== 'melange' && t.id !== 'recent');
  }), B.find(e => { const p = e.split('|'); return p.length !== 7 || !/^[123]r?$/.test(p[6]); }));
  check('banque : pas de doublon de question', new Set(B.map(e => e.split('|')[0])).size === B.length);
  check('banque : quatre réponses distinctes', B.every(e => {
    const p = e.split('|');
    return new Set([p[1], p[2], p[3], p[4]].map(x => x.toLowerCase())).size === 4 && p.slice(1, 5).every(x => x.trim());
  }));
  check('banque : apostrophes typographiques (aucune apostrophe droite)', B.every(e => e.indexOf("'") === -1));
  const niv = [1, 2, 3].map(n => B.filter(e => e.split('|')[6][0] === String(n)).length);
  check('trois niveaux : au moins 10 % de questions difficiles', niv[2] >= B.length * 0.1 && niv[0] > 0 && niv[1] > 0, niv);
  const rec = B.filter(e => /r$/.test(e.split('|')[6])).length;
  check('au moins 150 questions récentes (depuis 2016)', rec >= 150, rec);
  const jamel = B.find(e => /Jamel Debbouze/.test(e) && /série H/.test(e));
  check('la série H : Jamel Debbouze est le standardiste', jamel && jamel.split('|')[1] === 'Un standardiste', jamel);

  let g = quiz.create(['A', 'B', 'C']);
  check('phase de réglages', g.phase === 'setup');
  check('réglages réservés à l’hôte', !quiz.apply(g, 1, { t: 'go', opts: { th: 'melange' } }).ok);
  check('réponse avant le lancement refusée', !quiz.apply(g, 0, { t: 'answer', i: 0 }).ok);
  check('thème inconnu refusé', !quiz.apply(g, 0, { t: 'go', opts: { th: 'bidule' } }).ok);
  check('nombre de questions invalide refusé', !quiz.apply(g, 0, { t: 'go', opts: { nb: 7 } }).ok);
  check('chrono invalide refusé', !quiz.apply(g, 0, { t: 'go', opts: { chrono: 15 } }).ok);
  let res = quiz.apply(g, 0, { t: 'go', opts: { th: 'melange', diff: 'progressif', nb: 10, chrono: 20 } });
  check('lancement : 10 questions et un chrono de 20 s (échéance dans l’état)',
    res.ok && g.qs.length === 10 && g.phase === 'question' && g.ech && g.ech.fin - g.debut === 20000 &&
    res.timer && res.timer.action.t === 'expire' && res.timer.ms >= 20000, [res, g.ech]);
  check('difficulté progressive : du facile au difficile',
    g.qs[0].niv === 1 && g.qs[9].niv === 3 && g.qs.every((q, k) => k === 0 || q.niv >= g.qs[k - 1].niv), g.qs.map(q => q.niv).join(''));
  check('la bonne réponse est bien indexée', g.qs.every(q => {
    const src = B.find(e => e.split('|')[0] === q.q);
    return src && q.choices[q.correct] === src.split('|')[1] && q.choices.length === 4;
  }));
  // B juste en 5 s, A faux, C juste en 10 s
  const c0 = g.qs[0].correct;
  g.debut = Date.now() - 5000;
  quiz.apply(g, 1, { t: 'answer', i: c0 });
  check('re-réponse refusée', !quiz.apply(g, 1, { t: 'answer', i: (c0 + 1) % 4 }).ok);
  let red = quiz.redact(g, 0);
  check('réseau : bonnes réponses masquées', red.qs.every(q => q.correct === undefined));
  check('réseau : les questions à venir ne circulent pas', red.qs[5].q === undefined && red.qs[0].q === g.qs[0].q);
  check('réseau : réponse d’autrui masquée, drapeau visible',
    typeof red.players[1].answer !== 'number' && red.players[1].hasAnswered === true && red.players[0].hasAnswered === false);
  red = quiz.redact(g, 1);
  check('compteur d’attente juste (bug « 4/4 ») : 1 réponse sur 3',
    red.players.filter(p => p.hasAnswered).length === 1 && red.players[1].answer === c0);
  check('aucun point avant la révélation', g.players[1].score === 0);
  quiz.apply(g, 0, { t: 'answer', i: (c0 + 1) % 4 });
  g.debut = Date.now() - 10000;
  quiz.apply(g, 2, { t: 'answer', i: c0 });
  check('révélation dès la dernière réponse', g.phase === 'reveal' && g.reveal.correct === c0 && g.ech === null);
  check('points dégressifs : 875 en 5 s, 750 en 10 s, 0 si faux',
    g.players[1].score === 875 && g.players[2].score === 750 && g.players[0].score === 0, g.players.map(p => p.score));
  check('le plus rapide est désigné', g.reveal.premier === 1);
  check('réponse tardive refusée', !quiz.apply(g, 0, { t: 'answer', i: c0 }).ok);
  check('révélation visible sur le réseau', quiz.redact(g, 2).reveal.correct === c0);
  check('seul l’hôte enchaîne', !quiz.apply(g, 1, { t: 'next', k: 0 }).ok);
  res = quiz.apply(g, 0, { t: 'next', k: 0 });
  check('question suivante : réponses remises à zéro, nouveau chrono',
    g.idx === 1 && g.phase === 'question' && g.players.every(p => p.answer === -1) && res.timer, g.idx);
  check('double appui sur « suivant » sans effet', quiz.apply(g, 0, { t: 'next', k: 0 }).ok && g.idx === 1 && g.phase === 'question');
  // série : B et C répondent juste immédiatement → bonus de série
  const c1 = g.qs[1].correct;
  g.debut = Date.now();
  quiz.apply(g, 1, { t: 'answer', i: c1 });
  quiz.apply(g, 2, { t: 'answer', i: (c1 + 1) % 4 });
  // A absent : le chrono tranche
  check('fin de chrono prématurée ignorée', quiz.apply(g, -1, { t: 'expire', k: g.ech.k }).ok && g.phase === 'question');
  check('fin de chrono périmée ignorée', quiz.apply(g, -1, { t: 'expire', k: 'q0:0' }).ok && g.phase === 'question');
  g.ech.fin = Date.now() - 10;
  quiz.apply(g, -1, { t: 'expire', k: g.ech.k });
  check('chrono écoulé : on révèle sans l’absent (bug de l’absent)', g.phase === 'reveal' && g.reveal.pourquoi === 'temps');
  check('série : 2 bonnes réponses d’affilée = +100 de bonus', g.reveal.gains[1] >= 1000 && g.players[1].serie === 2, g.reveal.gains);
  check('série cassée par une erreur', g.players[2].serie === 0);
  quiz.apply(g, 0, { t: 'next', k: 1 });
  // l'hôte passe sans attendre
  quiz.apply(g, 1, { t: 'answer', i: 0 });
  check('« ne plus attendre » : réservé à l’hôte', !quiz.apply(g, 1, { t: 'skip', k: g.ech.k }).ok);
  check('« ne plus attendre » : l’hôte révèle', quiz.apply(g, 0, { t: 'skip', k: g.ech.k }).ok && g.phase === 'reveal');
  // le robot ne répond jamais plus vite que la réalité
  quiz.apply(g, 0, { t: 'next', k: 2 });
  g.debut = Date.now() - 4000;
  quiz.apply(g, 1, { t: 'answer', i: 0, dt: 0 });
  check('temps de réponse jamais inférieur au temps réel', g.players[1].t >= 4000, g.players[1].t);
  // partie jusqu'au bout
  while (!g.finished) {
    if (g.phase === 'question') { g.players.forEach((p, i) => { if (p.answer === -1) quiz.apply(g, i, { t: 'answer', i: g.qs[g.idx].correct }); }); }
    if (g.phase === 'reveal') quiz.apply(g, 0, { t: 'next', k: g.idx });
  }
  check('partie finie après la 10e question', g.finished === true && quiz.over(g));
  check('podium et classement', /🥇/.test(quiz.summary(g)) && /🏆/.test(quiz.summary(g)));
  const top = Math.max(...g.players.map(p => p.score));
  const gg = quiz.gagnants(g);
  check('gagnants : le meilleur score (ou [] si égalité)',
    Array.isArray(gg) && (gg.length === 0 || g.players[gg[0]].score === top), gg);

  // ----- mode animateur : un téléphone, aucun passage -----
  let a = quiz.create(['Léa', 'Marc', 'Nina']);
  res = quiz.apply(a, 0, { t: 'go', opts: { th: 'cinema', mode: 'animateur', chrono: 0 } });
  check('animateur : lancé sans chrono', res.ok && !res.timer && a.ech === null && a.opts.mode === 'animateur');
  check('animateur : l’écran reste chez l’animateur (aucun passage)', quiz.viewerOf(a) === 0);
  check('animateur : seul l’animateur note', !quiz.apply(a, 1, { t: 'answer', i: 0, pour: 1 }).ok);
  const ca = a.qs[0].correct;
  quiz.apply(a, 0, { t: 'answer', i: ca, pour: 0 });
  quiz.apply(a, 0, { t: 'answer', i: ca, pour: 1 });
  quiz.apply(a, 0, { t: 'answer', i: (ca + 1) % 4, pour: 2 });
  quiz.apply(a, 0, { t: 'answer', i: (ca + 1) % 4, pour: 2 });   // retouché : effacé
  check('animateur : retoucher une forme efface la réponse', a.players[2].answer === -1);
  quiz.apply(a, 0, { t: 'answer', i: (ca + 2) % 4, pour: 2 });
  check('animateur : pas de révélation automatique (on peut corriger)', a.phase === 'question' && quiz.viewerOf(a) === 0);
  check('animateur : les réponses notées restent visibles', quiz.redact(a, 0).players[1].answer === ca);
  quiz.apply(a, 0, { t: 'skip' });
  check('animateur : révélation, 1 000 points par bonne réponse',
    a.phase === 'reveal' && a.players[0].score === 1000 && a.players[1].score === 1000 && a.players[2].score === 0, a.players.map(p => p.score));
  check('animateur : les robots ne jouent pas', quiz.bot(JSON.parse(JSON.stringify(a)), 1) === null);

  // ----- chacun son tour : réponses secrètes -----
  let h = quiz.create(['A', 'B', 'C']);
  quiz.apply(h, 0, { t: 'go', opts: { mode: 'secret', chrono: 20 } });
  check('chacun son tour : sans chrono', h.opts.chrono === 0 && h.ech === null);
  quiz.apply(h, 0, { t: 'answer', i: 0 });
  check('chacun son tour : l’écran passe au suivant', quiz.viewerOf(h) === 1);
  quiz.apply(h, 1, { t: 'answer', i: 1 });
  quiz.apply(h, 2, { t: 'answer', i: 2 });
  check('chacun son tour : la révélation reste chez le dernier (pas de passage inutile)',
    h.phase === 'reveal' && quiz.viewerOf(h) === 2);
  check('chacun son tour : le dernier peut enchaîner', quiz.apply(h, 2, { t: 'next', k: 0 }).ok && h.idx === 1);
  check('chacun son tour : l’ordre tourne', quiz.viewerOf(h) === 1);

  // ----- solo -----
  let s1 = quiz.create(['Solo']);
  quiz.apply(s1, 0, { t: 'go', opts: { mode: 'animateur' } });
  check('seul : toujours au chrono', s1.opts.mode === 'chrono' && s1.ech);
  s1.players[0].bons = 6; s1.qs.length = 10;
  check('solo : gagné à 5 bonnes réponses sur 10 ou plus', JSON.stringify(quiz.gagnants(s1)) === '[0]');
  s1.players[0].bons = 3;
  check('solo : perdu en dessous', quiz.gagnants(s1) === null);
  check('égalité : aucun gagnant', JSON.stringify(quiz.gagnants({ players: [{ score: 5 }, { score: 5 }], qs: [] })) === '[]');

  // ----- niveaux de l'ordinateur : mesure -----
  const mesure = {};
  ['facile', 'moyen', 'difficile'].forEach(nv => {
    let pts = 0, justes = 0, nq = 0;
    for (let k = 0; k < 40; k++) {
      const st = quiz.create(['🤖 x', '🤖 y']);
      quiz.apply(st, 0, { t: 'go', opts: { nb: 10, diff: 'moyen' } });
      while (!st.finished) {
        if (st.phase === 'question') {
          for (let i = 0; i < 2; i++) { const ac = quiz.bot(JSON.parse(JSON.stringify(st)), i, { niveau: nv }); if (ac) quiz.apply(st, i, ac); }
        } else quiz.apply(st, 0, { t: 'next', k: st.idx });
      }
      st.players.forEach(p => { pts += p.score; justes += p.bons; nq += 10; });
    }
    mesure[nv] = { pts: Math.round(pts / nq), justes: Math.round(100 * justes / nq) };
  });
  console.log('    ordinateur (points par question, % juste) : ' + JSON.stringify(mesure));
  check('niveaux de l’ordinateur réellement différents',
    mesure.facile.pts < mesure.moyen.pts && mesure.moyen.pts < mesure.difficile.pts, mesure);
  check('« difficile » fait transpirer : plus de 80 % de bonnes réponses, plus de 800 points par question',
    mesure.difficile.justes >= 80 && mesure.difficile.pts >= 800, mesure.difficile);

  // ----- une partie reprise d'une ancienne version -----
  const vieux = { players: [{ name: 'A', score: 10, answer: -1 }, { name: 'B', score: 0, answer: -1 }],
    qs: [{ q: 'x', choices: ['a', 'b', 'c', 'd'], correct: 0 }, { q: 'y', choices: ['a', 'b', 'c', 'd'], correct: 1 }],
    theme: 'melange', idx: 0, phase: 'reveal', order: [], reveal: { correct: 0, first: -1, answers: [0, 1] }, gameTs: 1, finished: false };
  check('reprise d’une partie V1 : elle continue', quiz.apply(vieux, 0, { t: 'next' }).ok && vieux.idx === 1 && vieux.phase === 'question');
}

/* ================= LE PLUS PROCHE ================= */
console.log('--- Le Plus Proche ---');
{
  const B = proche._BANK;
  check('banque : au moins 150 questions', B.length >= 150, B.length);
  check('banque : réponse entière, unité, source et catégorie partout', B.every(e => {
    const p = e.split('|');
    return p.length === 5 && /^\d+$/.test(p[1]) && p[2] && p[3].length >= 3 && proche._CATEGORIES[p[4]];
  }), B.find(e => { const p = e.split('|'); return p.length !== 5 || !/^\d+$/.test(p[1]); }));
  check('banque : pas de doublon', new Set(B.map(e => e.split('|')[0])).size === B.length);
  let g = proche.create(['A', 'B', 'C']);
  check('phase de réglages', g.phase === 'setup');
  check('réglages réservés à l’hôte', !proche.apply(g, 1, { t: 'go', opts: {} }).ok);
  check('estimation avant le lancement refusée', !proche.apply(g, 0, { t: 'guess', n: '5' }).ok);
  check('nombre de manches invalide refusé', !proche.apply(g, 0, { t: 'go', opts: { nb: 7 } }).ok);
  let res = proche.apply(g, 0, { t: 'go', opts: { nb: 8, chrono: 45 } });
  check('lancement : 8 manches, chrono de 45 s (échéance dans l’état)',
    res.ok && g.qs.length === 8 && g.phase === 'guess' && g.ech.fin - g.debut === 45000 && res.timer && res.timer.action.t === 'expire');
  check('tirage varié : jamais deux fois la même catégorie d’affilée, au plus une date',
    g.qs.every((q, k) => k === 0 || q.cat !== g.qs[k - 1].cat) && g.qs.filter(q => q.unit === 'année').length <= 1,
    g.qs.map(q => q.cat).join(' '));
  // question connue pour mesurer les points
  g.qs[0] = { q: 'Test', a: 1000, unit: 'm', src: 'Source test', cat: 'geo' };
  check('estimation invalide refusée', !proche.apply(g, 0, { t: 'guess', n: 'abc' }).ok && !proche.apply(g, 0, { t: 'guess', n: '-5' }).ok);
  check('espaces et points de milliers acceptés', proche._lireNombre('1 000') === 1000 && proche._lireNombre('2.500') === 2500);
  proche.apply(g, 0, { t: 'guess', n: '1000' });
  check('estimation déjà donnée refusée', !proche.apply(g, 0, { t: 'guess', n: '5' }).ok);
  let red = proche.redact(g, 1);
  check('réseau : réponse et source masquées pendant la manche', red.qs[0].a === undefined && red.qs[0].src === undefined);
  check('réseau : manches à venir masquées', red.qs[3].q === undefined);
  check('réseau : estimations d’autrui masquées, drapeau visible', red.players[0].guess === null && red.players[0].hasGuessed === true);
  check('compteur d’attente juste : 1 estimation sur 3', red.players.filter(p => p.hasGuessed).length === 1);
  proche.apply(g, 1, { t: 'guess', n: '1500' });
  g.debut -= 1000;
  proche.apply(g, 2, { t: 'guess', n: '2500' });
  check('révélation dès la dernière estimation', g.phase === 'reveal' && g.reveal.answer === 1000 && g.reveal.src === 'Source test');
  check('points selon la distance : exact 100 + 30 + 50, à mi-chemin 50, au-delà du double 0',
    g.players[0].score === 180 && g.players[1].score === 50 && g.players[2].score === 0, g.players.map(p => p.score));
  check('la réponse circule après la révélation', proche.redact(g, 2).qs[0].a === 1000);
  check('dates : 25 ans d’écart = 50 points', proche._points(1842, { a: 1817, unit: 'année' }) === 50 &&
    proche._points(1900, { a: 1817, unit: 'année' }) === 0);
  check('seul l’hôte enchaîne', !proche.apply(g, 1, { t: 'next', k: 0 }).ok);
  res = proche.apply(g, 0, { t: 'next', k: 0 });
  check('manche suivante, estimations remises à zéro', res.ok && g.idx === 1 && g.players.every(p => p.guess === null) && res.timer);
  check('double appui sur « suivant » sans effet', proche.apply(g, 0, { t: 'next', k: 0 }).ok && g.idx === 1);
  // un absent : le chrono tranche
  proche.apply(g, 0, { t: 'guess', n: String(g.qs[1].a) });
  check('fin de chrono prématurée ignorée', proche.apply(g, -1, { t: 'expire', k: g.ech.k }).ok && g.phase === 'guess');
  g.ech.fin = Date.now() - 10;
  proche.apply(g, -1, { t: 'expire', k: g.ech.k });
  check('chrono écoulé : on révèle sans les absents (0 point)', g.phase === 'reveal' && g.reveal.gains[1] === 0 && g.reveal.gains[0] >= 180);
  proche.apply(g, 0, { t: 'next', k: 1 });
  proche.apply(g, 1, { t: 'guess', n: '3' });
  check('« ne plus attendre » réservé à l’hôte', !proche.apply(g, 1, { t: 'skip', k: g.ech.k }).ok);
  check('« ne plus attendre » : l’hôte révèle', proche.apply(g, 0, { t: 'skip', k: g.ech.k }).ok && g.phase === 'reveal');
  while (!g.finished) {
    if (g.phase === 'guess') g.players.forEach((p, i) => { if (p.guess === null) proche.apply(g, i, { t: 'guess', n: String(g.qs[g.idx].a + i) }); });
    else proche.apply(g, 0, { t: 'next', k: g.idx });
  }
  check('partie finie après 8 manches', g.finished === true && proche.over(g));
  check('podium final', /🥇/.test(proche.summary(g)) && /🏆/.test(proche.summary(g)));
  const gg2 = proche.gagnants(g);
  check('gagnants : le meilleur score', Array.isArray(gg2) && (gg2.length === 0 || g.players[gg2[0]].score === Math.max(...g.players.map(p => p.score))));

  // ----- un seul téléphone : on se le passe -----
  let h = proche.create(['A', 'B', 'C']);
  proche.apply(h, 0, { t: 'go', opts: { mode: 'secret', chrono: 45 } });
  check('un téléphone : pas de chrono', h.opts.chrono === 0 && h.ech === null);
  proche.apply(h, 0, { t: 'guess', n: '10' });
  check('un téléphone : l’écran passe au suivant', proche.viewerOf(h) === 1);
  proche.apply(h, 1, { t: 'guess', n: '20' });
  proche.apply(h, 2, { t: 'guess', n: '30' });
  check('un téléphone : la révélation reste chez le dernier', h.phase === 'reveal' && proche.viewerOf(h) === 2);
  check('un téléphone : le dernier peut enchaîner', proche.apply(h, 2, { t: 'next', k: 0 }).ok && h.idx === 1);

  // ----- niveaux de l'ordinateur -----
  const mes = {};
  ['facile', 'moyen', 'difficile'].forEach(nv => {
    let pts = 0, n = 0;
    for (let k = 0; k < 60; k++) {
      const st = proche.create(['🤖 x', '🤖 y']);
      proche.apply(st, 0, { t: 'go', opts: { nb: 10 } });
      while (!st.finished) {
        if (st.phase === 'guess') { for (let i = 0; i < 2; i++) { const a = proche.bot(JSON.parse(JSON.stringify(st)), i, { niveau: nv }); if (a) proche.apply(st, i, a); } }
        else proche.apply(st, 0, { t: 'next', k: st.idx });
      }
      st.players.forEach(p => { pts += p.score; n += 10; });
    }
    mes[nv] = Math.round(pts / n);
  });
  console.log('    ordinateur (points par manche) : ' + JSON.stringify(mes));
  check('niveaux de l’ordinateur réellement différents', mes.facile < mes.moyen && mes.moyen < mes.difficile, mes);

  // ----- reprise d'une partie V1 -----
  const v1 = { players: [{ name: 'A', score: 3, guess: null }, { name: 'B', score: 0, guess: null }],
    qs: [{ q: 'x', a: 10, unit: 'm' }, { q: 'y', a: 20, unit: 'm' }], idx: 0, phase: 'guess', reveal: null, finished: false };
  proche.apply(v1, 0, { t: 'guess', n: '10' });
  proche.apply(v1, 1, { t: 'guess', n: '12' });
  check('reprise d’une partie V1 : elle continue', v1.phase === 'reveal' && proche.apply(v1, 0, { t: 'next' }).ok && v1.idx === 1);
}

/* ================= 8 AMÉRICAIN ================= */
console.log('--- 8 américain ---');
g = huit.create(['A', 'B']);
check('2 joueurs : 7 cartes chacun', g.players.every(p => p.hand.length === 7));
check('première carte visible ≠ 8', g.discard[0].r !== '8');
check('52 cartes en tout', g.pile.length + 14 + 1 === 52, g.pile.length);
g = huit.create(['A', 'B', 'C', 'D']);
check('4 joueurs : 5 cartes chacun', g.players.every(p => p.hand.length === 5));
check('hors tour refusé', !huit.apply(g, (g.current + 1) % 4, { t: 'draw' }).ok);
// main truquée pour tester les effets
g = huit.create(['A', 'B', 'C']);
g.current = 0; g.dir = 1;
g.discard = [{ r: '5', s: '♠' }];
g.players[0].hand = [{ r: '5', s: '♥' }, { r: 'V', s: '♠' }, { r: 'A', s: '♠' },
  { r: '2', s: '♠' }, { r: '8', s: '♦' }, { r: '9', s: '♦' }];
check('carte injouable refusée (9♦ sur 5♠)', !huit.apply(g, 0, { t: 'play', i: 5 }).ok);
check('même valeur acceptée (5♥ sur 5♠)', huit.apply(g, 0, { t: 'play', i: 0 }).ok);
check('le tour passe', g.current === 1);
// Valet : saute un joueur
g.current = 0; g.discard.push({ r: '7', s: '♠' });
huit.apply(g, 0, { t: 'play', i: 0 }); // V♠ sur 7♠
check('valet : saute le joueur suivant', g.current === 2, g.current);
// As : change le sens
g.current = 0; g.dir = 1; g.discard.push({ r: '3', s: '♠' });
huit.apply(g, 0, { t: 'play', i: 0 }); // A♠
check('as : sens inversé', g.dir === -1 && g.current === 2, [g.dir, g.current]);
// 2 : pioche cumulable
g.current = 0; g.dir = 1; g.discard.push({ r: '6', s: '♠' });
huit.apply(g, 0, { t: 'play', i: 0 }); // 2♠
check('2 : +2 en attente', g.pending2 === 2 && g.current === 1);
g.players[1].hand.unshift({ r: '2', s: '♥' });
huit.apply(g, 1, { t: 'play', i: 0 }); // 2♥ empilé
check('2 empilé : +4 en attente', g.pending2 === 4 && g.current === 2);
const before2 = g.players[2].hand.length;
check('seul un 2 est jouable sous pénalité',
  !huit.apply(g, 2, { t: 'play', i: g.players[2].hand.findIndex(c => c.r !== '2' && c.r !== '8') }).ok ||
  g.players[2].hand.every(c => c.r === '2' || c.r === '8'));
huit.apply(g, 2, { t: 'draw' });
check('pioche de pénalité : +4 cartes et tour passé',
  g.players[2].hand.length === before2 + 4 && g.pending2 === 0 && g.current === 0);
// 8 : couleur obligatoire
g.current = 0;
g.players[0].hand = [{ r: '8', s: '♦' }, { r: '9', s: '♦' }];
check('8 sans couleur refusé', !huit.apply(g, 0, { t: 'play', i: 0 }).ok);
check('8 avec couleur accepté', huit.apply(g, 0, { t: 'play', i: 0, suit: '♥' }).ok);
check('couleur imposée retenue', g.chosenSuit === '♥');
check('la couleur imposée s’applique',
  huit._playable(g, { r: '4', s: '♥' }) && !huit._playable(g, { r: '4', s: '♠' }));
// pioche simple puis passe
g.current = 1; g.hasDrawn = false;
check('passer sans piocher refusé', !huit.apply(g, 1, { t: 'pass' }).ok);
const b1 = g.players[1].hand.length;
huit.apply(g, 1, { t: 'draw' });
check('pioche : +1 carte, on reste au joueur', g.players[1].hand.length === b1 + 1 && g.current === 1);
check('seconde pioche refusée', !huit.apply(g, 1, { t: 'draw' }).ok);
huit.apply(g, 1, { t: 'pass' });
check('passe après pioche', g.current === 2);
// victoire et score
g = huit.create(['A', 'B']);
g.current = 0;
g.discard = [{ r: '5', s: '♠' }];
g.players[0].hand = [{ r: '5', s: '♦' }];
g.players[1].hand = [{ r: '8', s: '♠' }, { r: 'R', s: '♥' }, { r: '7', s: '♣' }, { r: 'A', s: '♦' }];
huit.apply(g, 0, { t: 'play', i: 0 });
check('main vide : manche gagnée', g.finished && g.winner === 0);
check('score = 50+10+7+1 = 68', g.players[0].score === 68, g.players[0].score);
check('nouvelle manche réservée à l’hôte', !huit.apply(g, 1, { t: 'again' }).ok);
huit.apply(g, 0, { t: 'again' });
check('redistribution, scores conservés', g.manche === 2 && !g.finished &&
  g.players[0].score === 68 && g.players.every(p => p.hand.length === 7));
// redact : mains et pioche secrètes
const redH = huit.redact(g, 0);
check('ma main visible, la sienne non',
  Array.isArray(redH.players[0].hand) && redH.players[1].hand === undefined &&
  redH.players[1].cards === 7);
check('pioche cachée (seul le compte circule)',
  redH.pile === undefined && typeof redH.pileCount === 'number' && redH.discard.length === 1);
// rebattage quand la pioche est vide
g = huit.create(['A', 'B']);
g.discard = g.discard.concat(g.pile.splice(0, g.pile.length)); // pioche vidée
const totalBefore = g.discard.length + g.players[0].hand.length + g.players[1].hand.length;
const got = huit._drawCards(g, 0, 2);
check('défausse rebattue pour repiocher', got === 2 && g.discard.length === 1 &&
  g.discard.length + g.pile.length + g.players[0].hand.length + g.players[1].hand.length === totalBefore);

/* ================= MOTS FLÉCHÉS ================= */
console.log('--- Mots fléchés ---');
require(ROOT + '/js/games/croises.js');
require(ROOT + '/js/games/fleches-data.js');
const fleches = require(ROOT + '/js/games/fleches.js');
const FL_PF = fleches._PAR_FORCE;
check('200 grilles dans la base (5 forces × ' + FL_PF + ')',
  GG.FLECHES_GRILLES.length === 5 * FL_PF, GG.FLECHES_GRILLES.length);
// intégrité : VRAIS fléchés — grille pleine, définitions dans les cases,
// chaque flèche part de la case voisine du mot, croisements cohérents
let flBad = 0, flDef = 0, flTotal = 0, flOrn = 0, flCells = 0;
for (let f = 1; f <= 5; f++) {
  for (let gn = 0; gn < FL_PF; gn++) {
    const grid = fleches._loadGrid(f, gn);
    if (!grid) { flBad++; continue; }
    const NC = grid.w * grid.h;
    flCells += NC;
    const cellMap = {};
    const defCells = new Set();
    for (const w of grid.words) {
      flTotal++;
      if (w.def && w.def !== 'Mot mystère…') flDef++;
      // la case-définition est bien la voisine du départ (droite ou coudée)
      const attendu = w.dir === 'h'
        ? [w.cells[0] - 1, w.cells[0] - grid.w]
        : [w.cells[0] - grid.w, w.cells[0] - 1];
      if (attendu.indexOf(w.defCell) === -1 || w.defCell < 0) flBad++;
      defCells.add(w.defCell);
      w.cells.forEach((c, k) => {
        if (c < 0 || c >= NC) flBad++;
        if (cellMap[c] && cellMap[c] !== w.w[k]) flBad++;
        cellMap[c] = w.w[k];
      });
    }
    // une case-définition n'est jamais une lettre
    for (const dc of defCells) if (cellMap[dc]) flBad++;
    // grille PLEINE : lettre, définition, ou (rare) case ornée
    for (let c = 0; c < NC; c++) {
      if (!cellMap[c] && !defCells.has(c)) flOrn++;
    }
    // pas de superposition colinéaire
    for (let a2 = 0; a2 < grid.words.length; a2++) {
      for (let b2 = a2 + 1; b2 < grid.words.length; b2++) {
        const A = grid.words[a2], B = grid.words[b2];
        if (A.dir === B.dir && A.cells.some(c => B.cells.includes(c))) flBad++;
      }
    }
    // toute suite de 2+ lettres correspond à un mot déclaré (rien d'accidentel)
    const runs = [];
    for (let r = 0; r < grid.h; r++) {
      let c = 0;
      while (c < grid.w) {
        if (!cellMap[r * grid.w + c]) { c++; continue; }
        let txt = ''; const s0 = c;
        while (c < grid.w && cellMap[r * grid.w + c]) { txt += cellMap[r * grid.w + c]; c++; }
        if (txt.length >= 2) runs.push(txt + '@' + (r * grid.w + s0) + 'h');
      }
    }
    for (let c = 0; c < grid.w; c++) {
      let r = 0;
      while (r < grid.h) {
        if (!cellMap[r * grid.w + c]) { r++; continue; }
        let txt = ''; const s0 = r;
        while (r < grid.h && cellMap[r * grid.w + c]) { txt += cellMap[r * grid.w + c]; r++; }
        if (txt.length >= 2) runs.push(txt + '@' + (s0 * grid.w + c) + 'v');
      }
    }
    const posEnc = new Set(grid.words.map(w2 =>
      w2.w + '@' + w2.cells[0] + (w2.dir === 'v' ? 'v' : 'h')));
    if (runs.length !== posEnc.size || runs.some(x => !posEnc.has(x))) flBad++;
  }
}
check('les 200 grilles sont de VRAIS fléchés cohérents', flBad === 0, flBad);
check('chaque mot a sa définition (' + flTotal + ' mots)', flDef === flTotal, flTotal - flDef);
check('cases ornées rares (' + flOrn + ' sur ' + flCells + ')', flOrn <= flCells * 0.13, flOrn);
check('les forces montent en taille', (() => {
  const t1 = fleches._loadGrid(1, 0), t5 = fleches._loadGrid(5, 0);
  return t1.w === 7 && t1.h === 8 && t5.w === 8 && t5.h === 12 &&
    t1.words.length < t5.words.length;
})());
g = fleches.create(['A', 'B']);
check('phase de choix de la force', g.phase === 'setup');
check('force réservée à l’hôte', !fleches.apply(g, 1, { t: 'force', f: 1 }).ok);
fleches.apply(g, 0, { t: 'force', f: 2, g: 7 });
check('grille n°8 de force 2 chargée', g.force === 2 && g.gnum === 7 && g.words.length >= 7);
const fw = g.words[0];
check('mauvaise longueur refusée', !fleches.apply(g, 0, { t: 'claim', i: 0, text: 'X' }).ok);
fleches.apply(g, 1, { t: 'claim', i: 0, text: fw.w.toLowerCase() });
check('mot trouvé : points = longueur', fw.foundBy === 1 && g.players[1].points === fw.w.length);
const redF = fleches.redact(g, 0);
check('solutions non trouvées masquées (réseau)',
  redF.words.every((w, i) => i === 0 ? w.w === fw.w : w.w === undefined));
for (let i = 1; i < g.words.length; i++) fleches.apply(g, 0, { t: 'claim', i, text: g.words[i].w });
check('grille finie', g.finished === true && g.durationSec >= 1);


/* ================= BONBONS (match-3) ================= */
console.log('--- Bonbons ---');
const bonbons = require(ROOT + '/js/games/bonbons.js');
const BN = bonbons._N;
const mkCell = t => ({ t, s: 0 });
// grille de base sans aucun alignement : t = (ligne + 2*colonne) % 5
function safeBoard() {
  const b = new Array(BN * BN);
  for (let r = 0; r < BN; r++) for (let c = 0; c < BN; c++) b[r * BN + c] = mkCell((r + 2 * c) % 5);
  return b;
}
check('grille témoin sans alignement', bonbons._findRuns(safeBoard()).length === 0);

let bg = bonbons.create(['Ana', 'Bob']);
check('niveau réservé à l’hôte', bonbons.apply(bg, 1, { t: 'level', l: 'facile' }).ok === false);
check('niveau inconnu refusé', bonbons.apply(bg, 0, { t: 'level', l: 'sucre' }).ok === false);
bonbons.apply(bg, 0, { t: 'level', l: 'facile' });
check('64 bonbons servis, 25 coups', bg.players[0].board.length === 64 && bg.players[0].moves === 25);
check('grille de départ sans alignement', bonbons._findRuns(bg.players[0].board).length === 0);
check('même grille pour tous', JSON.stringify(bg.players[0].board) === JSON.stringify(bg.players[1].board));
check('au moins un coup jouable garanti', bonbons._hasMove(bg.players[0].board) === true);
check('échange non voisin refusé', bonbons.apply(bg, 0, { t: 'swap', a: 0, b: 9 }).ok === false);

// échange qui ne forme rien : refusé, aucun coup consommé
{
  const st = bonbons.create(['Solo']);
  bonbons.apply(st, 0, { t: 'level', l: 'facile' });
  st.players[0].board = safeBoard(); // aucun échange 0↔1 ne forme d'alignement ici
  const r = bonbons.apply(st, 0, { t: 'swap', a: 0, b: 1 });
  check('échange sans alignement refusé', r.ok === false && st.players[0].moves === 25);
}

// alignement de 3 : points, coup consommé, grille toujours pleine
{
  const st = bonbons.create(['Solo']);
  bonbons.apply(st, 0, { t: 'level', l: 'facile' });
  const b = safeBoard();
  // ligne 7 (en bas, loin des chutes) : XX.X → l'échange vertical amène le 3e
  b[56].t = 4; b[57].t = 4; b[59].t = 4; b[58].t = 0; b[50].t = 4;
  b[48].t = 1; b[49].t = 2; b[51].t = 2; // évite tout autre alignement
  st.players[0].board = b;
  if (bonbons._findRuns(b).length !== 0) { failures++; console.log('  FAIL grille du scénario 3-match déjà alignée'); }
  const ok = bonbons.apply(st, 0, { t: 'swap', a: 50, b: 58 });
  check('alignement de 3 accepté', ok.ok === true);
  check('au moins 30 points (3 × 10)', st.players[0].score >= 30, st.players[0].score);
  check('un coup consommé', st.players[0].moves === 24);
  check('la grille reste pleine (64 bonbons)', st.players[0].board.every(c => c && typeof c.t === 'number'));
}

// alignement de 4 : un bonbon rayé apparaît (sauf s'il part dans la cascade)
{
  const b = safeBoard();
  b[56].t = 4; b[57].t = 4; b[58].t = 4; b[59].t = 4; // 4 à l'horizontale, prêts
  const res = bonbons._resolve(b, 5, 57);
  check('4 alignés : au moins 40 points', res.pts >= 40, res.pts);
  check('4 alignés : bonbon rayé créé (ou déjà croqué en cascade)',
    b.some(c => c && c.s > 0) || res.combo > 1);
}

// alignement de 5 : le sucre magique apparaît
{
  const b = safeBoard();
  b[56].t = 4; b[57].t = 4; b[58].t = 4; b[59].t = 4; b[60].t = 4;
  const res = bonbons._resolve(b, 5, 58);
  check('5 alignés : sucre magique créé', b.some(c => c && c.t === -1));
  check('5 alignés : au moins 50 points', res.pts >= 50, res.pts);
}

// sucre magique échangé : toute la couleur y passe
{
  const st = bonbons.create(['Solo']);
  bonbons.apply(st, 0, { t: 'level', l: 'facile' });
  const b = safeBoard();
  b[0] = { t: -1, s: 0 }; // sucre magique dans le coin
  st.players[0].board = b;
  const cible = b[1].t;
  const avant = b.filter(c => c.t === cible).length;
  const ok = bonbons.apply(st, 0, { t: 'swap', a: 0, b: 1 });
  const gain = st.players[0].lastGain;
  check('sucre magique : échange accepté', ok.ok === true);
  check('sucre magique : toute la couleur croquée (' + avant + ' bonbons)',
    gain === avant * 15 || gain === (avant + 1) * 15, gain);
  check('sucre magique : coup consommé', st.players[0].moves === 24);
}

// grille morte détectée
{
  const dead = new Array(BN * BN);
  for (let r = 0; r < BN; r++) for (let c = 0; c < BN; c++) {
    dead[r * BN + c] = mkCell((r % 2) * 2 + (c % 2)); // damier 0101/2323 : aucun coup
  }
  check('grille morte : aucun coup détecté', bonbons._hasMove(dead) === false);
}

// course à deux : la partie se termine quand tout le monde a épuisé ses coups
{
  const st = bonbons.create(['Ana', 'Bob']);
  bonbons.apply(st, 0, { t: 'level', l: 'facile' });
  st.players.forEach(p => { p.moves = 1; });
  function findSwap(b) {
    for (let i = 0; i < BN * BN; i++) {
      if (b[i].t === -1) continue;
      const c = i % BN;
      if (c < BN - 1 && bonbons._wouldMatch(b, i, i + 1)) return [i, i + 1];
      if (i < BN * (BN - 1) && bonbons._wouldMatch(b, i, i + BN)) return [i, i + BN];
    }
    return null;
  }
  const s1 = findSwap(st.players[0].board);
  bonbons.apply(st, 0, { t: 'swap', a: s1[0], b: s1[1] });
  check('un joueur fini, l’autre pas : la course continue', st.finished === false);
  const s2 = findSwap(st.players[1].board);
  bonbons.apply(st, 1, { t: 'swap', a: s2[0], b: s2[1] });
  check('tous à court de coups : partie terminée', st.finished === true);
  check('classement au score avec 🏆', /🏆/.test(bonbons.summary(st)));
  check('rejouer après la fin refusé', bonbons.apply(st, 0, { t: 'swap', a: 0, b: 1 }).ok === false);
}


// ===== mode aventure : niveaux infinis =====
{
  const cfgs = [1, 2, 7, 25, 100, 500].map(n => bonbons._levelCfg(n));
  check('aventure : réglages déterministes et jouables',
    cfgs.every(c => c.coups >= 12 && c.coups <= 24 && (c.types === 5 || c.types === 6) && c.cible > 0));
  check('aventure : la difficulté grimpe', bonbons._levelCfg(100).cible > bonbons._levelCfg(1).cible);
  check('aventure : 8 mondes qui tournent',
    bonbons._zoneOf(1) === 0 && bonbons._zoneOf(11) === 1 && bonbons._zoneOf(81) === 0 &&
    bonbons._ZONES.length === 8);
  check('étoiles : 1 à l’objectif, 3 au double',
    bonbons._stars(999, 1000) === 0 && bonbons._stars(1000, 1000) === 1 &&
    bonbons._stars(1400, 1000) === 2 && bonbons._stars(1900, 1000) === 3);

  const st = bonbons.create(['Solo']);
  check('aventure réservée au solo',
    bonbons.apply(bonbons.create(['A', 'B']), 0, { t: 'start', lvl: 1 }).ok === false);
  check('niveau lancé', bonbons.apply(st, 0, { t: 'start', lvl: 3 }).ok === true &&
    st.solo === true && st.soloLvl === 3 && st.players[0].moves === bonbons._levelCfg(3).coups);
  check('re-lancer en pleine partie refusé', bonbons.apply(st, 0, { t: 'start', lvl: 4 }).ok === false);
  // on vide les coups : résultat sur place, jamais de fin de partie
  st.players[0].moves = 1;
  function findSwapA(b) {
    for (let i = 0; i < BN * BN; i++) {
      if (b[i].t === -1) continue;
      const c = i % BN;
      if (c < BN - 1 && bonbons._wouldMatch(b, i, i + 1)) return [i, i + 1];
      if (i < BN * (BN - 1) && bonbons._wouldMatch(b, i, i + BN)) return [i, i + BN];
    }
    return null;
  }
  const sw = findSwapA(st.players[0].board);
  bonbons.apply(st, 0, { t: 'swap', a: sw[0], b: sw[1] });
  check('coups épuisés → écran de résultat, PAS de fin',
    st.phase === 'result' && bonbons.over(st) === false);
  check('rejouer le niveau depuis le résultat',
    bonbons.apply(st, 0, { t: 'start', lvl: 3 }).ok === true && st.phase === 'play');
  st.players[0].moves = 0;
  st.phase = 'result';
  check('retour à la carte', bonbons.apply(st, 0, { t: 'backmap' }).ok === true && st.phase === 'setup');
}

// ===== rapport d'effets : le moteur raconte les explosions au rendu =====
{
  const st = bonbons.create(['Solo']);
  bonbons.apply(st, 0, { t: 'start', lvl: 1 });
  const b = safeBoard();
  // ligne 7 : un bonbon RAYÉ (raye sa ligne) au milieu d'un futur alignement
  b[56].t = 4; b[57] = { t: 4, s: 1 }; b[59].t = 4; b[58].t = 0; b[50].t = 4;
  b[48].t = 1; b[49].t = 2; b[51].t = 2;
  st.players[0].board = b;
  bonbons.apply(st, 0, { t: 'swap', a: 50, b: 58 });
  const fx = st.players[0].fx;
  check('explosion : le rayon de la ligne 7 est signalé au rendu',
    fx && fx.rows.indexOf(7) !== -1, fx);
  check('explosion : combo transmis', fx && fx.combo >= 1);

  const st2 = bonbons.create(['Solo']);
  bonbons.apply(st2, 0, { t: 'start', lvl: 1 });
  const b2 = safeBoard();
  b2[0] = { t: -1, s: 0 };
  st2.players[0].board = b2;
  bonbons.apply(st2, 0, { t: 'swap', a: 0, b: 1 });
  const fx2 = st2.players[0].fx;
  check('explosion : la déflagration du sucre magique est signalée',
    fx2 && fx2.arc > 0, fx2);
}

// ===== liaisons en L, en T et en carré : le bonbon enveloppé =====
{
  // L : 3 en ligne (56-58) + 3 en colonne (42-50-58), coin partagé en 58
  const b = safeBoard();
  b[56].t = 4; b[57].t = 4; b[58].t = 4; b[50].t = 4; b[42].t = 4;
  const runs = bonbons._findRuns(b);
  check('liaison en L : les deux branches détectées', runs.length === 2);
  const pr = bonbons._promoteFor(runs, b, 58);
  check('liaison en L : UN bonbon enveloppé naît au coin',
    pr.length === 1 && pr[0].i === 58 && pr[0].s === 3 && pr[0].t === 4, pr);
}
{
  // T : 4 en ligne (56-59) + 3 en colonne (41-49-57), croisement en 57
  const b = safeBoard();
  b[56].t = 4; b[57].t = 4; b[58].t = 4; b[59].t = 4;
  b[41].t = 4; b[49].t = 4;
  const runs = bonbons._findRuns(b);
  const pr = bonbons._promoteFor(runs, b, 57);
  check('liaison en T : l’enveloppé prime sur le rayé',
    pr.length === 1 && pr[0].i === 57 && pr[0].s === 3, pr);
}
{
  // carré 2×2 : détecté comme alignement, il donne aussi un enveloppé
  const b = safeBoard();
  b[48].t = 4; b[49].t = 4; b[56].t = 4; b[57].t = 4;
  const runs = bonbons._findRuns(b);
  check('carré 2×2 : détecté comme alignement',
    runs.length === 1 && runs[0].dir === 'q' && runs[0].cells.length === 4, runs);
  const pr = bonbons._promoteFor(runs, b, 49);
  check('carré 2×2 : un bonbon enveloppé naît sur la case échangée',
    pr.length === 1 && pr[0].i === 49 && pr[0].s === 3, pr);
}
{
  // un échange qui ferme un carré est un coup valable
  const b = safeBoard();
  b[48].t = 4; b[49].t = 4; b[56].t = 4; b[57].t = 0; b[58].t = 4;
  check('échange fermant un carré accepté', bonbons._wouldMatch(b, 57, 58) === true);
}
{
  // l'enveloppé marqué explose son carré de 3×3 et le signale au rendu
  const b = safeBoard();
  b[27] = { t: 2, s: 3 }; // ligne 3, colonne 3 : plein centre
  const marks = { 27: true };
  const fx = { rows: [], cols: [], bombs: [], pops: [] };
  bonbons._spread(b, marks, fx);
  const attendu = [18, 19, 20, 26, 27, 28, 34, 35, 36];
  check('enveloppé : tout le 3×3 est croqué',
    attendu.every(i => marks[i]) && Object.keys(marks).length === 9, Object.keys(marks));
  check('enveloppé : la déflagration est signalée au rendu', fx.bombs.length === 1 && fx.bombs[0] === 27);
}
{
  // chaque bonbon croqué est signalé au rendu (les « pops » des éclatements)
  const b = safeBoard();
  b[56].t = 4; b[57].t = 4; b[58].t = 4; b[50].t = 4; b[42].t = 4;
  const fx = { rows: [], cols: [], bombs: [], pops: [], arc: 0, wipe: false };
  bonbons._resolve(b, 5, 58, fx);
  check('éclatements : la première vague est racontée au rendu',
    fx.pops.filter(pp => pp.w === 0).length >= 5 &&
    fx.pops.every(pp => pp.i >= 0 && pp.i < 64 && typeof pp.t === 'number'), fx.pops.length);
}
// ===== combos de bonbons spéciaux : échanger deux spéciaux entre eux =====
{
  // rayé + rayé : la croix — toute la ligne 3 et toute la colonne 4
  const st = bonbons.create(['Solo']);
  bonbons.apply(st, 0, { t: 'start', lvl: 1 });
  const b = safeBoard();
  b[27] = { t: 0, s: 1 }; b[28] = { t: 1, s: 2 };
  st.players[0].board = b;
  const ok = bonbons.apply(st, 0, { t: 'swap', a: 27, b: 28 });
  const fx = st.players[0].fx;
  check('combo rayé+rayé accepté sans alignement', ok.ok === true);
  check('combo rayé+rayé : la croix est signalée au rendu',
    fx && fx.rows.indexOf(3) !== -1 && fx.cols.indexOf(4) !== -1, fx && { r: fx.rows, c: fx.cols });
  check('combo rayé+rayé : au moins 15 bonbons croqués (225 pts)',
    st.players[0].lastGain >= 225, st.players[0].lastGain);
  check('combo : un coup consommé', st.players[0].moves === bonbons._levelCfg(1).coups - 1);
}
{
  // enveloppé + enveloppé : déflagration 5×5
  const st = bonbons.create(['Solo']);
  bonbons.apply(st, 0, { t: 'start', lvl: 1 });
  const b = safeBoard();
  b[27] = { t: 0, s: 3 }; b[28] = { t: 1, s: 3 };
  st.players[0].board = b;
  bonbons.apply(st, 0, { t: 'swap', a: 27, b: 28 });
  const fx = st.players[0].fx;
  check('combo enveloppé+enveloppé : double déflagration signalée',
    fx && fx.bombs.length >= 2, fx && fx.bombs);
  check('combo enveloppé+enveloppé : au moins 25 bonbons croqués (375 pts)',
    st.players[0].lastGain >= 375, st.players[0].lastGain);
}
{
  // rayé + enveloppé : trois lignes ET trois colonnes
  const st = bonbons.create(['Solo']);
  bonbons.apply(st, 0, { t: 'start', lvl: 1 });
  const b = safeBoard();
  b[27] = { t: 0, s: 2 }; b[28] = { t: 1, s: 3 };
  st.players[0].board = b;
  bonbons.apply(st, 0, { t: 'swap', a: 27, b: 28 });
  const fx = st.players[0].fx;
  check('combo rayé+enveloppé : 3 lignes et 3 colonnes signalées',
    fx && [2, 3, 4].every(r => fx.rows.indexOf(r) !== -1) &&
    [3, 4, 5].every(c => fx.cols.indexOf(c) !== -1), fx && { r: fx.rows, c: fx.cols });
  check('combo rayé+enveloppé : au moins 39 bonbons croqués (585 pts)',
    st.players[0].lastGain >= 585, st.players[0].lastGain);
}
{
  // deux spéciaux voisins comptent comme un coup jouable (grille jamais morte)
  const dead = new Array(BN * BN);
  for (let r = 0; r < BN; r++) for (let c = 0; c < BN; c++) {
    dead[r * BN + c] = mkCell((r % 2) * 2 + (c % 2));
  }
  check('damier mort : toujours aucun coup', bonbons._hasMove(dead) === false);
  dead[0].s = 1; dead[1].s = 3;
  check('deux spéciaux voisins : un coup existe', bonbons._hasMove(dead) === true);
}

/* ================= DISCUSSION ================= */
console.log('--- Discussion ---');
{
  check('réseau uniquement, 2 à 12 téléphones',
    chat.netOnly === true && chat.hotseat === false && chat.min === 2 && chat.max === 12);
  const c = chat.create(['Léa', 'Marc', 'Nina']);
  check('salon créé, aucun message', c.messages.length === 0 && c.players.length === 3);
  check('pas de tour de parole', chat.turnOf(c) === -1);
  check('une discussion ne se termine jamais', chat.over(c) === false);
  let r = chat.apply(c, 0, { t: 'msg', txt: '  Coucou   tout le monde ! ' });
  check('message accepté et rangé', r.ok && c.messages.length === 1);
  check('espaces superflus nettoyés', c.messages[0].txt === 'Coucou tout le monde !');
  check("l'auteur et l'heure sont notés",
    c.messages[0].p === 0 && /^\d\d:\d\d$/.test(c.messages[0].h));
  r = chat.apply(c, 1, { t: 'msg', txt: '   ' });
  check('message vide refusé', !r.ok && c.messages.length === 1);
  r = chat.apply(c, 7, { t: 'msg', txt: 'fantôme' });
  check('expéditeur inconnu refusé', !r.ok);
  r = chat.apply(c, 2, { t: 'msg', txt: 'x'.repeat(900) });
  check('message trop long tronqué à 300 caractères',
    r.ok && c.messages[1].txt.length === 300);
  for (let i = 0; i < 600; i++) chat.apply(c, i % 3, { t: 'msg', txt: 'm' + i });
  check('la conversation garde les 500 derniers messages',
    c.messages.length === 500 && c.messages[499].txt === 'm599');
  check('pas de fuite : aucune censure nécessaire (tout est public)', !chat.redact);
  // V2 : identifiants, réactions (liste blanche), « en train d'écrire »
  const d = chat.create(['Léa', 'Marc']);
  chat.apply(d, 0, { t: 'msg', txt: 'Salut' });
  chat.apply(d, 1, { t: 'msg', txt: 'Yo' });
  check('chaque message a un identifiant unique', d.messages[0].id === 1 && d.messages[1].id === 2);
  check('réaction acceptée', chat.apply(d, 1, { t: 'react', id: 1, e: '❤️' }).ok && d.messages[0].re['❤️'].join() === '1');
  chat.apply(d, 0, { t: 'react', id: 1, e: '❤️' });
  check('réactions cumulées', d.messages[0].re['❤️'].length === 2);
  chat.apply(d, 1, { t: 'react', id: 1, e: '❤️' });
  check('second appui : la réaction est retirée', d.messages[0].re['❤️'].join() === '0');
  check('réaction hors liste refusée (sécurité)', !chat.apply(d, 0, { t: 'react', id: 1, e: '<img src=x onerror=alert(1)>' }).ok &&
    !chat.apply(d, 0, { t: 'react', id: 1, e: 'constructor' }).ok);
  check('réaction sur un message inconnu refusée', !chat.apply(d, 0, { t: 'react', id: 99, e: '👍' }).ok);
  check('« en train d’écrire » signalé', chat.apply(d, 1, { t: 'typing', on: true }).ok && d.typing[1] === 1);
  chat.apply(d, 1, { t: 'typing', on: true });
  check('chaque frappe signalée change le compteur', d.typing[1] === 2);
  chat.apply(d, 1, { t: 'msg', txt: 'fini' });
  check('envoyer efface « en train d’écrire »', d.typing[1] === undefined);
  chat.apply(d, 0, { t: 'typing', on: true });
  chat.apply(d, 0, { t: 'typing', on: false });
  check('arrêt de frappe', d.typing[0] === undefined);
  check('un salon ancien (sans identifiants) accepte les nouveaux messages',
    chat.apply({ players: [{ name: 'A' }], messages: [{ p: 0, txt: 'x', h: '10:00' }] }, 0, { t: 'msg', txt: 'y' }).ok);
}

console.log(failures ? failures + ' ÉCHEC(S)' : '\nTests nouveaux jeux OK.');
process.exit(failures ? 1 : 0);
