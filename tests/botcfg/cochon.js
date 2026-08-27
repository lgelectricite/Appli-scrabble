/* Cochon tout-IA : trois joueurs foncent vers 100. Pas d'écran
   d'enchaînement : la partie s'arrête d'elle-même sur over(). */
module.exports = {
  names: ['🤖 A', '🤖 B', '🤖 C'],
  stop: (s, mod) => mod.over(s),
  drive: () => null,
  max: 2000,
  runs: 10
};
