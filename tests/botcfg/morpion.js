/* Morpion tout-IA : la première manche gagnée termine la série (les nuls
   s'enchaînent). Le « drive » relance la manche, comme le ferait l'humain. */
module.exports = {
  names: ['🤖 A', '🤖 B'],
  stop: s => s.players.some(p => p.wins >= 1),
  drive: s => (s.roundOver ? { player: 0, action: { t: 'again' } } : null),
  max: 2000,
  runs: 8
};
