/* 8 américain tout-IA : trois robots enchaînent 3 manches ; le « drive »
   relance chaque manche comme le ferait l'hôte humain. */
module.exports = {
  names: ['🤖 A', '🤖 B', '🤖 C'],
  stop: s => s.finished && s.manche >= 3,
  drive: s => (s.finished && s.manche < 3 ? { player: 0, action: { t: 'again' } } : null),
  max: 3000,
  runs: 8
};
