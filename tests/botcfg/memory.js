/* Memory tout-IA : deux robots retournent les cartes jusqu'à la dernière paire.
   Pas de minuteur ni d'écran d'enchaînement : les ratés se recachent au
   retournement suivant, le « drive » n'a donc rien à faire. */
module.exports = {
  names: ['🤖 A', '🤖 B'],
  stop: (s, mod) => mod.over(s),
  drive: () => null,
  max: 600,
  runs: 8
};
