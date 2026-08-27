/* Poker tout-IA en mode TOURNOI : le « drive » joue l'hôte (choix du mode,
   distribution des mains), les trois IA font le reste. On s'arrête quand le
   tournoi est plié ou après 8 mains complètes. */
module.exports = {
  names: ['🤖 A', '🤖 B', '🤖 C'],
  stop: (s, mod) => mod.over(s) || (s.handOver && s.handNum >= 8),
  drive: s => {
    if (s.finished) return null;
    if (!s.mode) return { player: 0, action: { t: 'mode', m: 'tournoi' } };
    if (s.handOver) return { player: 0, action: { t: 'next' } };
    return null;
  },
  max: 2500,
  runs: 8
};
