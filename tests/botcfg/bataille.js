/* Bataille navale tout-IA : série jouée jusqu'à 2 manches gagnées.
   Le « drive » clique la revanche, comme le ferait l'humain. */
module.exports = {
  names: ['🤖 A', '🤖 B'],
  stop: s => s.players.some(p => p.wins >= 2),
  drive: s => (s.finished ? { player: 0, action: { t: 'again' } } : null),
  max: 2000,
  runs: 6
};
