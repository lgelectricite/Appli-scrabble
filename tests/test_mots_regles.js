/*
 * Words V2 — les règles corrigées, preuves à l'appui.
 *   - fin de partie : 3 « je passe » consécutifs de CHAQUE joueur (règlement
 *     international du Scrabble classique, § 3.2) ; échanges et coups à
 *     0 point ne comptent pas ;
 *   - tirage au sort du premier joueur (lettre la plus proche du A, joker
 *     d'abord, les ex æquo retirent) ;
 *   - mot refusé : variante « essais » (3 par tour) ou règle classique
 *     (tour perdu) ;
 *   - gagnants, statistiques, détail de fin de partie.
 */
const ROOT = require('path').join(__dirname, '..');
const S = require(ROOT + '/js/scrabble.js');

let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log('  OK  ' + name);
  else { failures++; console.log('  FAIL ' + name + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); }
}
const idx = (r, c) => r * 15 + c;
const P0 = { premier: 0 };

console.log('--- Fin de partie : passes consécutives ---');
{
  // 5 passes seulement : la partie continue
  const g = S.newGame(['A', 'B'], P0);
  for (let i = 0; i < 5; i++) S.passTurn(g, g.current);
  check('5 passes : la partie continue', !g.over);
  S.passTurn(g, g.current);
  check('6e passe (3 chacun) : partie finie', g.over && g.finalDetail.reason === 'passes');
}
{
  // les échanges ne comptent pas comme des passes
  const g = S.newGame(['A', 'B'], P0);
  for (let i = 0; i < 12; i++) {
    const r = S.exchange(g, g.current, [g.players[g.current].rack[0]]);
    if (!r.ok) { check('échange accepté', false, r); break; }
  }
  check('12 échanges d’affilée : la partie continue', !g.over);
  // un échange au milieu de passes casse la série de celui qui échange
  S.passTurn(g, 0); S.passTurn(g, 1); S.passTurn(g, 0);
  S.exchange(g, 1, [g.players[1].rack[0]]);
  S.passTurn(g, 0); S.passTurn(g, 1); S.passTurn(g, 0); S.passTurn(g, 1);
  check('échange de B au milieu : B n’a que 2 passes de suite, la partie continue', !g.over,
    g.players.map(p => p.passes));
  S.passTurn(g, 0); S.passTurn(g, 1);
  check('B atteint 3 passes de suite : partie finie', g.over);
}
{
  // un coup à 0 point (deux jokers) n'est pas un passe
  const g = S.newGame(['A', 'B'], P0);
  S.passTurn(g, 0); S.passTurn(g, 1); S.passTurn(g, 0); S.passTurn(g, 1); S.passTurn(g, 0);
  S.passTurn(g, 1);
  check('(3 passes chacun avant tout mot : fin, § 5.1.4)', g.over);
  const g2 = S.newGame(['A', 'B'], P0);
  S.passTurn(g2, 0); S.passTurn(g2, 1); S.passTurn(g2, 0); S.passTurn(g2, 1);
  g2.players[0].rack = ['?', '?', 'E', 'E', 'E', 'E', 'E'];
  const r0 = S.playMove(g2, 0, [
    { index: idx(7, 7), letter: 'L', blank: true }, { index: idx(7, 8), letter: 'A', blank: true }
  ]);
  check('coup à 0 point accepté (LA en deux jokers)', r0.ok && r0.total === 0, r0);
  S.passTurn(g2, 1);
  check('A a joué (même 0 point) : sa série de passes repart de zéro', !g2.over && g2.players[0].passes === 0);
  S.passTurn(g2, 0); S.passTurn(g2, 1); S.passTurn(g2, 0);
  check('B a 4 passes, A seulement 2 : la partie continue', !g2.over);
  S.passTurn(g2, 1); S.passTurn(g2, 0);
  check('A atteint 3 passes de suite : partie finie', g2.over);
  // un coup qui marque, lui aussi, casse la série
  g.over = false;
  g.players.forEach(p => { p.passes = 0; });
  g.current = 0;
  g.players[0].rack = ['C', 'H', 'A', 'T', 'E', 'E', 'E'];
  S.playMove(g, 0, [
    { index: idx(7, 6), letter: 'C' }, { index: idx(7, 7), letter: 'H' },
    { index: idx(7, 8), letter: 'A' }, { index: idx(7, 9), letter: 'T' }
  ]);
  S.passTurn(g, 1); S.passTurn(g, 0); S.passTurn(g, 1); S.passTurn(g, 0); S.passTurn(g, 1);
  g.players[0].rack = ['S', 'E', 'E', 'E', 'E', 'E', 'E'];
  const r = S.playMove(g, 0, [{ index: idx(7, 10), letter: 'S' }]);
  check('coup accepté après 5 passes', r.ok, r);
  check('le coup remet la série de A à zéro', g.players[0].passes === 0 && !g.over);
  S.passTurn(g, 1);
  check('B a 3 passes mais A aucune : la partie continue', !g.over);
  S.passTurn(g, 0); S.passTurn(g, 1); S.passTurn(g, 0); S.passTurn(g, 1); S.passTurn(g, 0);
  check('A passe 3 fois à son tour : partie finie', g.over);
}
{
  // à 4 joueurs : 12 passes (3 chacun)
  const g = S.newGame(['A', 'B', 'C', 'D'], P0);
  for (let i = 0; i < 11; i++) S.passTurn(g, g.current);
  check('4 joueurs : 11 passes, la partie continue', !g.over);
  S.passTurn(g, g.current);
  check('4 joueurs : 12 passes, partie finie', g.over);
  const d = g.finalDetail.detail;
  check('détail de fin : lettres restantes et score avant déduction',
    d.length === 4 && d.every(x => Array.isArray(x.lettres) && typeof x.avant === 'number' &&
      x.delta === -S.rackValue(x.lettres)), d);
}

console.log('--- Tirage au sort du premier joueur ---');
{
  check('joker avant A', S.rangTirage('?') < S.rangTirage('A'));
  check('A avant B, B avant Z', S.rangTirage('A') < S.rangTirage('B') && S.rangTirage('B') < S.rangTirage('Z'));
  let debutJ1 = 0, coherent = true, egalites = 0;
  const N = 3000;
  for (let n = 0; n < N; n++) {
    const g = S.newGame(['A', 'B']);
    if (g.premier === 0) debutJ1++;
    if (g.current !== g.premier) coherent = false;
    const dernier = g.tirage[g.tirage.length - 1];
    const meilleur = Math.min(...dernier.map(t => S.rangTirage(t.l)));
    const gagnants = dernier.filter(t => S.rangTirage(t.l) === meilleur);
    if (gagnants.length !== 1 || gagnants[0].p !== g.premier) coherent = false;
    // tours précédents : égalité en tête, et seuls les ex æquo retirent
    for (let k = 0; k < g.tirage.length - 1; k++) {
      const t = g.tirage[k];
      const m = Math.min(...t.map(x => S.rangTirage(x.l)));
      const ex = t.filter(x => S.rangTirage(x.l) === m).map(x => x.p).sort().join();
      if (ex.split(',').length < 2 || ex !== g.tirage[k + 1].map(x => x.p).sort().join()) coherent = false;
      egalites++;
    }
    if (g.bag.length + 14 !== 102) coherent = false;
  }
  check('le tirage désigne toujours la lettre la plus proche du A (joker d’abord), ex æquo retirés',
    coherent);
  const part = debutJ1 / N;
  check('le joueur 1 ne commence plus toujours (' + Math.round(part * 100) + ' % sur ' + N + ' parties)',
    part > 0.44 && part < 0.56, part);
  check('des égalités se sont produites et ont été départagées (' + egalites + ')', egalites > 0);
  const g4 = S.newGame(['A', 'B', 'C', 'D']);
  check('à 4 : un premier joueur valide', g4.premier >= 0 && g4.premier < 4 && g4.current === g4.premier);
  const forcé = S.newGame(['A', 'B'], { premier: 1 });
  check('premier joueur imposable (tests)', forcé.current === 1);
}

console.log('--- Mot refusé ---');
{
  const g = S.newGame(['A', 'B'], P0);
  let r = S.refuseMove(g, 0, 'XQ');
  check('variante essais : 1er refus, on retente', r.ok && !r.perdu && r.restants === 2 && g.current === 0, r);
  r = S.refuseMove(g, 0, 'XQ');
  check('2e refus : on retente encore', r.ok && !r.perdu && r.restants === 1 && g.current === 0, r);
  r = S.refuseMove(g, 0, 'ZZ');
  check('3e refus : tour perdu', r.ok && r.perdu && g.current === 1, r);
  const h = g.history[g.history.length - 1];
  check('historique : passe avec le mot refusé', h.type === 'pass' && h.refus === 'ZZ', h);
  check('compteur de refus du joueur', g.players[0].refus === 3);
  r = S.refuseMove(g, 1, 'KK');
  check('les essais repartent de zéro pour le joueur suivant', r.ok && !r.perdu && r.restants === 2, r);
  check('refus hors tour rejeté', !S.refuseMove(g, 0, 'AA').ok);
  const c = S.newGame(['A', 'B'], { premier: 0, refus: 'perdu' });
  r = S.refuseMove(c, 0, 'XQ');
  check('règle classique : mot refusé = tour perdu', r.ok && r.perdu && c.current === 1, r);
  check('le mot refusé est nettoyé (lettres A-Z seulement)',
    S.refuseMove(c, 1, '<img>').ok && c.history[c.history.length - 1].refus === 'IMG');
}

console.log('--- Gagnants et statistiques ---');
{
  const g = S.newGame(['A', 'B', 'C'], P0);
  g.players[0].score = 10; g.players[1].score = 30; g.players[2].score = 30;
  check('gagnants : les ex æquo en tête', JSON.stringify(S.gagnants(g)) === '[1,2]');
  g.players[0].score = 30;
  check('gagnants : égalité parfaite → []', JSON.stringify(S.gagnants(g)) === '[]');
  const s = S.newGame(['A', 'B'], P0);
  s.players[0].rack = ['M', 'A', 'I', 'S', 'O', 'N', 'S'];
  S.playMove(s, 0, [
    { index: idx(7, 4), letter: 'M' }, { index: idx(7, 5), letter: 'A' },
    { index: idx(7, 6), letter: 'I' }, { index: idx(7, 7), letter: 'S' },
    { index: idx(7, 8), letter: 'O' }, { index: idx(7, 9), letter: 'N' },
    { index: idx(7, 10), letter: 'S' }
  ]);
  S.passTurn(s, 1);
  s.players[0].rack = ['S', 'E', 'E', 'E', 'E', 'E', 'E'];
  S.refuseMove(s, 0, 'EEE');
  const st = S.stats(s);
  check('stats : meilleur mot, scrabble, moyenne, refus',
    st[0].meilleur.mot === 'MAISONS' && st[0].meilleur.points === 66 && st[0].scrabbles === 1 &&
    st[0].moyenne === 66 && st[0].refus === 1 && st[1].passes === 1, st);
  const h0 = s.history[0];
  check('historique : cases posées et lettres tirées enregistrées',
    h0.cells.length === 7 && h0.cells[0].l === 'M' && h0.tires === 7, h0);
}

console.log(failures ? `\n${failures} ÉCHEC(S)` : '\nRègles V2 : tout passe.');
process.exit(failures ? 1 : 0);
