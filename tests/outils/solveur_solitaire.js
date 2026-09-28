/*
 * Solveur de Klondike (Node) — sert à choisir, hors ligne, les donnes
 * « gagnables garanties » du solitaire (et le défi du jour), et à vérifier
 * dans les tests que les donnes embarquées se gagnent vraiment.
 *
 *   node tests/outils/solveur_solitaire.js 1 300    → 300 graines gagnables en pioche 1
 *   node tests/outils/solveur_solitaire.js 3 300    → idem en pioche 3
 *
 * Recherche en profondeur avec mémoire des positions déjà vues, coups
 * ordonnés (fondations d'abord, puis les coups qui retournent une carte),
 * budget de nœuds. « Gagnable » s'entend au sens habituel : il existe une
 * suite de coups qui gagne (le solveur connaît les cartes cachées).
 */
const ROOT = require('path').join(__dirname, '..', '..');
global.self = global;
require(ROOT + '/js/games/registry.js');
const sol = require(ROOT + '/js/games/solitaire.js');

const rang = c => c % 13;
const coul = c => Math.floor(c / 13);
const rouge = c => { const s = coul(c); return s === 1 || s === 2; };

function resoudre(board, pioche, budget) {
  // état compact : colonnes {bas: [cartes cachées], haut: [visibles]}
  const tab = board.tab.map(col => ({
    bas: col.filter(x => !x.up).map(x => x.c),
    haut: col.filter(x => x.up).map(x => x.c)
  }));
  const found = [0, 0, 0, 0];
  board.found.forEach((f, i) => { found[i] = f.length; });
  let stock = board.stock.slice(), waste = board.waste.slice();
  const vus = new Set();
  let noeuds = 0;
  const chemin = []; // la suite de coups gagnante, au format des actions du jeu

  function cle() {
    const cols = tab.map(c => c.bas.length + ':' + c.haut.join(',')).sort().join('|');
    return found.join(',') + '#' + stock.length + ':' + waste.join(',') + '#' + cols;
  }
  function surFondation(c) { return found[coul(c)] === rang(c); }
  function sur(colonne, c) {
    const h = colonne.haut;
    if (!h.length) return !colonne.bas.length && rang(c) === 12;
    const top = h[h.length - 1];
    return rang(top) === rang(c) + 1 && rouge(top) !== rouge(c);
  }
  function retourne(col) {
    if (!col.haut.length && col.bas.length) { col.haut.push(col.bas.pop()); return true; }
    return false;
  }
  function gagne() { return found[0] + found[1] + found[2] + found[3] === 52; }

  function dfs(prof) {
    if (gagne()) return true;
    if (++noeuds > budget || prof > 600) return false;
    const k = cle();
    if (vus.has(k)) return false;
    vus.add(k);

    // 1) vers les fondations (tableau puis talon)
    for (let i = 0; i < 7; i++) {
      const col = tab[i];
      if (!col.haut.length) continue;
      const c = col.haut[col.haut.length - 1];
      if (surFondation(c)) {
        chemin.push({ t: 'move', src: { k: 'tab', col: i, idx: col.bas.length + col.haut.length - 1 }, dst: { k: 'found', pile: coul(c) } });
        col.haut.pop(); found[coul(c)]++;
        const r = retourne(col);
        if (dfs(prof + 1)) return true;
        chemin.pop();
        if (r) col.bas.push(col.haut.pop());
        found[coul(c)]--; col.haut.push(c);
      }
    }
    if (waste.length && surFondation(waste[waste.length - 1])) {
      chemin.push({ t: 'move', src: { k: 'waste' }, dst: { k: 'found', pile: coul(waste[waste.length - 1]) } });
      const c = waste.pop(); found[coul(c)]++;
      if (dfs(prof + 1)) return true;
      chemin.pop();
      found[coul(c)]--; waste.push(c);
    }
    // 2) tableau → tableau (une séquence entière ou partielle qui libère
    //    une carte cachée ou vide une colonne utilement)
    for (let i = 0; i < 7; i++) {
      const src = tab[i];
      for (let d = 0; d < src.haut.length; d++) {
        const c = src.haut[d];
        const toutLeHaut = d === 0;
        for (let j = 0; j < 7; j++) {
          if (j === i) continue;
          const dst = tab[j];
          if (!sur(dst, c)) continue;
          // un roi déjà en bas d'une colonne vide n'a pas à bouger
          if (!dst.haut.length && toutLeHaut && !src.bas.length) continue;
          // un déplacement partiel n'est utile que s'il libère une carte pour les fondations
          if (!toutLeHaut) {
            const dessous = src.haut[d - 1];
            if (!surFondation(dessous)) continue;
          }
          chemin.push({ t: 'move', src: { k: 'tab', col: i, idx: src.bas.length + d }, dst: { k: 'tab', col: j } });
          const bloc = src.haut.splice(d);
          dst.haut.push(...bloc);
          const r = retourne(src);
          if (dfs(prof + 1)) return true;
          chemin.pop();
          if (r) src.bas.push(src.haut.pop());
          dst.haut.splice(dst.haut.length - bloc.length);
          src.haut.push(...bloc);
        }
      }
    }
    // 3) talon → tableau
    if (waste.length) {
      const c = waste[waste.length - 1];
      for (let j = 0; j < 7; j++) {
        if (!sur(tab[j], c)) continue;
        chemin.push({ t: 'move', src: { k: 'waste' }, dst: { k: 'tab', col: j } });
        waste.pop(); tab[j].haut.push(c);
        if (dfs(prof + 1)) return true;
        chemin.pop();
        tab[j].haut.pop(); waste.push(c);
      }
    }
    // 4) piocher (ou retourner le talon)
    if (stock.length) {
      const n = Math.min(pioche, stock.length);
      const pris = [];
      for (let x = 0; x < n; x++) { const c = stock.pop(); waste.push(c); pris.push(c); }
      chemin.push({ t: 'draw' });
      if (dfs(prof + 1)) return true;
      chemin.pop();
      for (let x = 0; x < n; x++) stock.push(waste.pop());
    } else if (waste.length) {
      const avantW = waste.slice();
      stock = waste.slice().reverse(); waste = [];
      chemin.push({ t: 'draw' });
      if (dfs(prof + 1)) return true;
      chemin.pop();
      waste = avantW; stock = [];
    }
    return false;
  }
  const ok = dfs(0);
  return { ok, noeuds, chemin: ok ? chemin.slice() : null };
}

/* rejoue une solution avec les VRAIES règles du jeu (apply) : la preuve */
function rejouer(graine, pioche, chemin) {
  const s = sol.create(['Solveur']);
  sol.apply(s, 0, { t: 'level', l: pioche === 3 ? 'difficile' : 'facile', mode: 'libre' });
  s.players[0].board = sol._donne(graine);
  s.graine = graine;
  for (const a of chemin) {
    const r = sol.apply(s, 0, a);
    if (!r.ok) return false;
  }
  return s.players[0].done === true;
}

module.exports = { resoudre, rejouer };

if (require.main === module) {
  const pioche = parseInt(process.argv[2] || '1', 10);
  const voulu = parseInt(process.argv[3] || '50', 10);
  const budget = parseInt(process.argv[4] || '60000', 10);
  const trouves = [];
  let essais = 0;
  const t0 = Date.now();
  let g = 1000 + pioche * 7919;
  while (trouves.length < voulu && essais < voulu * 6) {
    g = (g * 48271) % 2147483647;
    essais++;
    const b = sol._donne(g);
    const r = resoudre(b, pioche, budget);
    if (r.ok && rejouer(g, pioche, r.chemin)) trouves.push(g);
  }
  console.error('pioche ' + pioche + ' : ' + trouves.length + ' donnes gagnables sur ' + essais +
    ' essais (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)');
  console.log(JSON.stringify(trouves));
}
