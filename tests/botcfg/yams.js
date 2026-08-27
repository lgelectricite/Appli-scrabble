/* Yams tout-IA : deux robots remplissent leurs 13 cases jusqu'au bout.
   Pas d'écran d'enchaînement : le tour passe tout seul après chaque case. */
module.exports = {
  names: ['🤖 A', '🤖 B'],
  stop: (s, mod) => mod.over(s),
  drive: () => null,
  max: 2000,
  runs: 8
};
