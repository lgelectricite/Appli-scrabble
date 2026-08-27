/* Petit Bac tout-IA : le minuteur d'autorité siffle la fin de manche avant le
   premier tour des robots, qui rendent donc leur feuille via la tolérance
   d'après-sifflet, puis se votent mutuellement. Le « drive » joue l'hôte qui
   lance chaque manche et enchaîne après les résultats. */
module.exports = {
  names: ['🤖 A', '🤖 B', '🤖 C'],
  stop: (s, mod) => mod.over(s),
  drive: s => ((s.phase === 'intro' || s.phase === 'result') && !s.finished
    ? { player: 0, action: { t: 'start' } } : null),
  max: 400,
  runs: 8
};
