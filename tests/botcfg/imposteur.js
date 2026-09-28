/* L'Imposteur tout-IA : 5 joueurs (1 imposteur + Mister White une fois sur
   deux), une manche complète.
   Le « drive » joue l'hôte : il distribue les mots, abrège le débat et
   relance chaque tour d'indices après un vote.
   La manche se clôt sur l'écran 'end' (la série continue ensuite). */
let n = 0;
module.exports = {
  names: ['🤖 A', '🤖 B', '🤖 C', '🤖 D', '🤖 E'],
  stop: s => s.phase === 'end',
  drive: s => {
    if (s.phase === 'setup') return { player: 0, action: { t: 'deal', opts: { white: (n++ % 2) === 0 } } };
    if (s.phase === 'debat') return { player: 0, action: { t: 'finDebat' } };
    if (s.phase === 'result') return { player: 0, action: { t: 'next' } };
    return null;
  },
  max: 1000,
  runs: 12
};
