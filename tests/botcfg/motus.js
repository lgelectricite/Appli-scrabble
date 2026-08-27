/* Mot Mystère tout-IA : deux robots cherchent le même mot. Le « drive »
   joue l'hôte humain : choix du niveau, puis « mot suivant » à la
   révélation. On s'arrête dès qu'un mot est trouvé, ou après 2 mots. */
const NIVEAUX = ['facile', 'moyen', 'difficile'];
module.exports = {
  names: ['🤖 A', '🤖 B'],
  stop: s => s.players.some(p => p.wins >= 1) || (s.phase === 'reveal' && s.round >= 2),
  drive: s => {
    if (s.phase === 'setup') {
      return { player: 0, action: { t: 'level', l: NIVEAUX[Math.floor(Math.random() * NIVEAUX.length)] } };
    }
    if (s.phase === 'reveal') return { player: 0, action: { t: 'next' } };
    return null;
  },
  max: 400,
  runs: 8
};
