/* Quiz tout-IA : 3 bots, thème « Tout mélangé » choisi par l'hôte de service.
   Le « drive » joue aussi le bouton « Question suivante » (écran de l'hôte) ;
   la partie s'arrête d'elle-même après les 10 questions. */
module.exports = {
  names: ['🤖 A', '🤖 B', '🤖 C'],
  stop: (s, mod) => mod.over(s) === true,
  drive: s => {
    if (s.phase === 'setup') return { player: 0, action: { t: 'theme', th: 'melange' } };
    if (s.phase === 'reveal') return { player: 0, action: { t: 'next' } };
    return null;
  },
  max: 300,
  runs: 8
};
