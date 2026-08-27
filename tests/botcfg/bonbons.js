/* Bonbons tout-IA : course au score sur la même grille de départ.
   Le « drive » joue l'hôte qui choisit le niveau, comme le ferait l'humain. */
module.exports = {
  names: ['🤖 A', '🤖 B'],
  stop: s => s.finished === true,
  drive: s => (s.phase === 'setup'
    ? { player: 0, action: { t: 'level', l: 'facile' } } : null),
  max: 400,
  runs: 5
};
