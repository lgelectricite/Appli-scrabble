/* 8 américain tout-IA : trois robots enchaînent 3 manches ; le « drive »
   relance chaque manche comme le ferait l'hôte humain. Depuis la V2, une
   partie a un score cible (300 points) : elle peut donc aussi se terminer
   avant la 3e manche, quand un robot l'atteint. */
module.exports = {
  names: ['🤖 A', '🤖 B', '🤖 C'],
  stop: (s, mod) => mod.over(s) || (s.finished && s.manche >= 3),
  drive: (s, mod) => (s.finished && !mod.over(s) && s.manche < 3 ? { player: 0, action: { t: 'again' } } : null),
  max: 3000,
  runs: 8
};
