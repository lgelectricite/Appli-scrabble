/* L'Imposteur tout-IA : 4 joueurs (1 imposteur), une manche complète.
   Le « drive » joue l'hôte : il relance chaque tour d'indices après un vote.
   La manche se clôt sur l'écran 'end' (over() est toujours faux : série). */
module.exports = {
  names: ['🤖 A', '🤖 B', '🤖 C', '🤖 D'],
  stop: s => s.phase === 'end',
  drive: s => (s.phase === 'result' ? { player: 0, action: { t: 'next' } } : null),
  max: 1000,
  runs: 8
};
