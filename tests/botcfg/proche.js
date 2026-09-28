/* Le Plus Proche tout-IA : 3 estimateurs, 8 manches au chrono.
   Le « drive » joue l'hôte : il lance la partie puis enchaîne après
   chaque révélation. */
module.exports = {
  names: ['🤖 A', '🤖 B', '🤖 C'],
  stop: (s, mod) => mod.over(s),
  drive: s => {
    if (s.phase === 'setup') return { player: 0, action: { t: 'go', opts: { nb: 8, chrono: 45 } } };
    if (s.phase === 'reveal') return { player: 0, action: { t: 'next', k: s.idx } };
    return null;
  },
  max: 400,
  runs: 8
};
