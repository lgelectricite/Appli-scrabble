/* Puissance 4 tout-IA : on joue jusqu'à 2 manches gagnées.
   Le « drive » relance la manche suivante, comme le ferait l'humain. */
module.exports = {
  names: ['🤖 A', '🤖 B'],
  stop: s => s.players.some(p => p.wins >= 1),
  drive: s => (s.roundOver ? { player: 0, action: { t: 'again' } } : null),
  max: 1200,
  runs: 8
};
