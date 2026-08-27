/* Le Plus Proche tout-IA : 3 estimateurs, 8 manches.
   Le « drive » joue l'hôte qui enchaîne après chaque révélation. */
module.exports = {
  names: ['🤖 A', '🤖 B', '🤖 C'],
  stop: (s, mod) => mod.over(s),
  drive: s => (s.phase === 'reveal' ? { player: 0, action: { t: 'next' } } : null),
  max: 400,
  runs: 8
};
