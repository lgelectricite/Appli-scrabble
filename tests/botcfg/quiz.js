/* Quiz tout-IA : 3 bots, réglages de l'hôte de service (thème « Tout
   mélangé », 10 questions, chrono 20 s). Le « drive » joue aussi le bouton
   « Question suivante » (écran de l'hôte) ; la partie s'arrête d'elle-même
   après la dernière question. */
module.exports = {
  names: ['🤖 A', '🤖 B', '🤖 C'],
  stop: (s, mod) => mod.over(s) === true,
  drive: s => {
    if (s.phase === 'setup') return { player: 0, action: { t: 'go', opts: { th: 'melange', nb: 10, chrono: 20 } } };
    if (s.phase === 'reveal') return { player: 0, action: { t: 'next', k: s.idx } };
    return null;
  },
  max: 300,
  runs: 8
};
