/* Mot Mystère tout-IA : deux robots cherchent le même mot. Le « drive »
   joue l'hôte humain : choix du mode et du niveau, puis « mot suivant » à la
   révélation. On s'arrête dès qu'un mot est trouvé, après 2 mots, ou à la fin
   d'une partie (défi du jour, 6 essais). Les trois niveaux d'IA et les trois
   modes (illimité, 6 essais, défi du jour) sont tirés au hasard. */
const NIVEAUX = ['facile', 'moyen', 'difficile'];
const MODES = ['serie', 'classique', 'jour'];
module.exports = {
  names: ['🤖 A', '🤖 B'],
  stop: s => s.finished || s.players.some(p => p.wins >= 1) || (s.phase === 'reveal' && s.round >= 2),
  drive: s => {
    if (s.phase === 'setup') {
      s.niveauIA = NIVEAUX[Math.floor(Math.random() * NIVEAUX.length)];
      return {
        player: 0,
        action: {
          t: 'level', l: NIVEAUX[Math.floor(Math.random() * NIVEAUX.length)],
          m: MODES[Math.floor(Math.random() * MODES.length)]
        }
      };
    }
    if (s.phase === 'reveal') return { player: 0, action: { t: 'next' } };
    return null;
  },
  max: 400,
  runs: 12
};
