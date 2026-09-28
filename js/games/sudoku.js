/*
 * GGgames — Sudoku V2 (solo).
 *
 * Grilles générées à la volée et CLASSÉES par les techniques humaines qu'elles
 * exigent (un solveur « logique » les résout comme un joueur : singletons,
 * pointages, paires, triplets, X-wing, XY-wing, swordfish, coloriage…) :
 *   facile     → singletons cachés seulement (38 à 40 cases données)
 *   moyen      → il faut aussi des singletons nus (28 à 30 cases données)
 *   difficile  → pointages, paires ou triplets indispensables
 *   expert     → X-wing, XY-wing, XYZ-wing, swordfish, coloriage… indispensables
 * Notes au crayon (et notes automatiques), gomme, annulation illimitée,
 * indices, erreurs (limite de 3 en option), chrono avec pause, surlignages,
 * défi du jour, statistiques par niveau.
 */
(function (root) {
  'use strict';
  var GG = root.GG;

  var LEVELS = {
    facile: { nom: 'Facile', ic: '😌', tech: 'Singletons cachés', clues: [38, 40] },
    moyen: { nom: 'Moyen', ic: '🙂', tech: 'Singletons nus et cachés', clues: [28, 30] },
    difficile: { nom: 'Difficile', ic: '😈', tech: 'Pointages, paires, triplets', clues: [17, 17] },
    expert: { nom: 'Expert', ic: '🧠', tech: 'X-wing, XY-wing, swordfish…', clues: [17, 17] }
  };
  var ORDRE = ['facile', 'moyen', 'difficile', 'expert'];
  var PENALITE_INDICE = 30000; // un indice coûte 30 s au chrono
  var TROU_MAX = 10 * 60000;   // au-delà de 10 min sans rien faire, le chrono ne compte plus

  /* ================================================================
   * Géométrie et masques de bits (chiffre d → bit d-1)
   * ================================================================ */
  var ROW = [], COL = [], BOX = [], UNITS = [], PEERS = [];
  var POP = [], DIG = [];
  (function () {
    var i, j, k;
    for (i = 0; i < 81; i++) {
      ROW[i] = (i / 9) | 0; COL[i] = i % 9; BOX[i] = ((ROW[i] / 3) | 0) * 3 + ((COL[i] / 3) | 0);
    }
    for (k = 0; k < 27; k++) UNITS.push([]);
    for (i = 0; i < 81; i++) {
      UNITS[ROW[i]].push(i); UNITS[9 + COL[i]].push(i); UNITS[18 + BOX[i]].push(i);
    }
    for (i = 0; i < 81; i++) {
      var p = [];
      for (j = 0; j < 81; j++) {
        if (j !== i && (ROW[j] === ROW[i] || COL[j] === COL[i] || BOX[j] === BOX[i])) p.push(j);
      }
      PEERS.push(p);
    }
    for (var m = 0; m < 512; m++) {
      var c = 0, d = 0;
      for (var b = 0; b < 9; b++) if (m & (1 << b)) { c++; d = b + 1; }
      POP[m] = c; DIG[m] = c === 1 ? d : 0;
    }
  })();
  function sees(a, b) { return a !== b && (ROW[a] === ROW[b] || COL[a] === COL[b] || BOX[a] === BOX[b]); }

  /* Hasard reproductible (défi du jour : la même grille pour tout le monde) */
  function mulberry(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function melange(a, rnd) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function maintenant() { return Date.now(); }
  function horloge() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  /* ================================================================
   * Solveur exhaustif (unicité) et grille complète
   * ================================================================ */

  /* Compte les solutions (au plus `limit`) ; fc/fm : chiffres fm interdits en fc.
     out (facultatif) reçoit la première solution trouvée. */
  function countSolutions(grid, limit, fc, fm, out) {
    var rows = [0, 0, 0, 0, 0, 0, 0, 0, 0], cols = rows.slice(), boxes = rows.slice();
    var empties = [], i, g = out ? grid.slice() : null;
    for (i = 0; i < 81; i++) {
      if (grid[i]) {
        var bit = 1 << (grid[i] - 1);
        if ((rows[ROW[i]] | cols[COL[i]] | boxes[BOX[i]]) & bit) return 0;
        rows[ROW[i]] |= bit; cols[COL[i]] |= bit; boxes[BOX[i]] |= bit;
      } else empties.push(i);
    }
    var count = 0;
    function rec(n) {
      if (n === 0) {
        count++;
        if (g && count === 1) for (var q = 0; q < 81; q++) out[q] = g[q];
        return count >= limit;
      }
      var best = -1, bestM = 0, bestC = 10, bi = -1;
      for (var k = 0; k < n; k++) {
        var c = empties[k];
        var m = ~(rows[ROW[c]] | cols[COL[c]] | boxes[BOX[c]]) & 511;
        if (c === fc) m &= ~fm;
        var pc = POP[m];
        if (pc < bestC) { bestC = pc; best = c; bestM = m; bi = k; if (pc <= 1) break; }
      }
      if (bestC === 0) return false;
      empties[bi] = empties[n - 1]; empties[n - 1] = best;
      var r = ROW[best], co = COL[best], bx = BOX[best], m2 = bestM, stop = false;
      while (m2) {
        var b2 = m2 & -m2; m2 ^= b2;
        rows[r] |= b2; cols[co] |= b2; boxes[bx] |= b2;
        if (g) g[best] = DIG[b2];
        stop = rec(n - 1);
        rows[r] ^= b2; cols[co] ^= b2; boxes[bx] ^= b2;
        if (stop) break;
      }
      empties[n - 1] = empties[bi]; empties[bi] = best;
      return stop;
    }
    rec(empties.length);
    return count;
  }
  function solveCount(grid, limit) { return countSolutions(grid, limit || 2); }

  /* Grille complète tirée au hasard (retour arrière à masques de bits). */
  function fullGrid(rnd) {
    rnd = rnd || Math.random;
    var g = [], rows = [0, 0, 0, 0, 0, 0, 0, 0, 0], cols = rows.slice(), boxes = rows.slice(), i;
    for (i = 0; i < 81; i++) g.push(0);
    // les trois carrés de la diagonale sont indépendants : tirés d'emblée
    [0, 4, 8].forEach(function (b) {
      var ds = melange([1, 2, 3, 4, 5, 6, 7, 8, 9], rnd), k = 0;
      UNITS[18 + b].forEach(function (c) {
        var bit = 1 << (ds[k] - 1);
        g[c] = ds[k++]; rows[ROW[c]] |= bit; cols[COL[c]] |= bit; boxes[BOX[c]] |= bit;
      });
    });
    var empties = [];
    for (i = 0; i < 81; i++) if (!g[i]) empties.push(i);
    function rec(k) {
      if (k === empties.length) return true;
      var c = empties[k];
      var m = ~(rows[ROW[c]] | cols[COL[c]] | boxes[BOX[c]]) & 511, opts = [];
      while (m) { var b = m & -m; m ^= b; opts.push(b); }
      melange(opts, rnd);
      for (var j = 0; j < opts.length; j++) {
        var bit = opts[j];
        rows[ROW[c]] |= bit; cols[COL[c]] |= bit; boxes[BOX[c]] |= bit;
        g[c] = DIG[bit];
        if (rec(k + 1)) return true;
        rows[ROW[c]] ^= bit; cols[COL[c]] ^= bit; boxes[BOX[c]] ^= bit;
        g[c] = 0;
      }
      return false;
    }
    rec(0);
    return g;
  }

  /* Retire des cases tant que la solution reste unique (au plus jusqu'à `target`). */
  function dig(solution, target, rnd) {
    var puzzle = solution.slice(), clues = 81, order = [], i;
    for (i = 0; i < 81; i++) order.push(i);
    melange(order, rnd);
    for (var k = 0; k < 81 && clues > target; k++) {
      i = order[k];
      var v = puzzle[i];
      puzzle[i] = 0;
      // unique si AUCUNE solution n'existe avec un autre chiffre à cet endroit
      if (countSolutions(puzzle, 1, i, 1 << (v - 1)) === 0) clues--;
      else puzzle[i] = v;
    }
    return { puzzle: puzzle, clues: clues };
  }

  /* ================================================================
   * Le solveur « humain » : il n'emploie que des techniques de joueur,
   * toujours la plus simple disponible. Le palier le plus haut qu'il a dû
   * atteindre donne la difficulté réelle de la grille.
   * ================================================================ */
  var TECH = {
    hs: { tier: 1, nom: 'singleton caché' },
    ns: { tier: 1, nom: 'singleton nu' },
    lc: { tier: 2, nom: 'pointage' },
    np: { tier: 2, nom: 'paire nue' },
    hp: { tier: 2, nom: 'paire cachée' },
    nt: { tier: 2, nom: 'triplet nu' },
    ht: { tier: 2, nom: 'triplet caché' },
    xw: { tier: 3, nom: 'X-wing' },
    xy: { tier: 3, nom: 'XY-wing' },
    xyz: { tier: 3, nom: 'XYZ-wing' },
    sf: { tier: 3, nom: 'swordfish' },
    nq: { tier: 3, nom: 'quadruplet nu' },
    hq: { tier: 3, nom: 'quadruplet caché' },
    col: { tier: 3, nom: 'coloriage' },
    ur: { tier: 3, nom: 'rectangle unique' },
    jf: { tier: 3, nom: 'jellyfish' }
  };

  function Logique(grid) {
    this.v = grid.slice();
    this.c = [];
    this.ok = true;
    this.last = -1; // dernière case posée (indices)
    var i;
    for (i = 0; i < 81; i++) this.c.push(this.v[i] ? 0 : 511);
    for (i = 0; i < 81; i++) if (this.v[i]) this.elim(i, this.v[i]);
  }
  Logique.prototype.elim = function (i, d) {
    var bit = 1 << (d - 1), p = PEERS[i];
    for (var k = 0; k < 20; k++) this.c[p[k]] &= ~bit;
  };
  Logique.prototype.place = function (i, d) {
    this.v[i] = d; this.c[i] = 0; this.elim(i, d); this.last = i;
  };
  Logique.prototype.remove = function (i, mask) {
    if (this.c[i] & mask) { this.c[i] &= ~mask; return true; }
    return false;
  };
  /* singleton caché : un chiffre n'a qu'une place dans une unité (boîtes d'abord) */
  Logique.prototype.hiddenSingle = function () {
    for (var uu = 0; uu < 27; uu++) {
      var u = UNITS[(uu + 18) % 27];
      for (var d = 1; d <= 9; d++) {
        var bit = 1 << (d - 1), pos = -1, n = 0, placed = false;
        for (var k = 0; k < 9; k++) {
          var c = u[k];
          if (this.v[c] === d) { placed = true; break; }
          if (this.c[c] & bit) { n++; pos = c; }
        }
        if (placed) continue;
        if (n === 0) { this.ok = false; return false; }
        if (n === 1) { this.place(pos, d); return true; }
      }
    }
    return false;
  };
  /* singleton nu : une case n'a plus qu'un candidat */
  Logique.prototype.nakedSingle = function () {
    for (var i = 0; i < 81; i++) {
      if (this.v[i]) continue;
      if (!this.c[i]) { this.ok = false; return false; }
      if (POP[this.c[i]] === 1) { this.place(i, DIG[this.c[i]]); return true; }
    }
    return false;
  };
  /* pointage (boîte → ligne/colonne) et réclamation (ligne/colonne → boîte) */
  Logique.prototype.locked = function () {
    var d, bit, k, c, u, prog = false;
    for (var b = 0; b < 9; b++) {
      u = UNITS[18 + b];
      for (d = 1; d <= 9; d++) {
        bit = 1 << (d - 1);
        var rs = -1, cs = -1, n = 0;
        for (k = 0; k < 9; k++) {
          c = u[k];
          if (!(this.c[c] & bit)) continue;
          n++;
          rs = rs === -1 ? ROW[c] : (rs === ROW[c] ? rs : -2);
          cs = cs === -1 ? COL[c] : (cs === COL[c] ? cs : -2);
        }
        if (n < 2) continue;
        if (rs >= 0) {
          var ur = UNITS[rs];
          for (k = 0; k < 9; k++) if (BOX[ur[k]] !== b && this.remove(ur[k], bit)) prog = true;
        }
        if (cs >= 0) {
          var uc = UNITS[9 + cs];
          for (k = 0; k < 9; k++) if (BOX[uc[k]] !== b && this.remove(uc[k], bit)) prog = true;
        }
        if (prog) return true;
      }
    }
    for (var l = 0; l < 18; l++) {
      u = UNITS[l];
      for (d = 1; d <= 9; d++) {
        bit = 1 << (d - 1);
        var bs = -1, n2 = 0;
        for (k = 0; k < 9; k++) {
          c = u[k];
          if (!(this.c[c] & bit)) continue;
          n2++;
          bs = bs === -1 ? BOX[c] : (bs === BOX[c] ? bs : -2);
        }
        if (n2 < 2 || bs < 0) continue;
        var ub = UNITS[18 + bs];
        for (k = 0; k < 9; k++) {
          var cc = ub[k];
          var dans = l < 9 ? ROW[cc] === l : COL[cc] === l - 9;
          if (!dans && this.remove(cc, bit)) prog = true;
        }
        if (prog) return true;
      }
    }
    return false;
  };
  function combos(arr, k, cb) {
    var idx = [];
    function rec(start, depth) {
      if (depth === k) return cb(idx);
      for (var i = start; i < arr.length; i++) {
        idx[depth] = arr[i];
        if (rec(i + 1, depth + 1)) return true;
      }
      return false;
    }
    return rec(0, 0);
  }
  /* sous-ensembles nus : k cases qui se partagent exactement k candidats */
  Logique.prototype.nakedSubset = function (k) {
    var self = this;
    for (var uu = 0; uu < 27; uu++) {
      var u = UNITS[uu], cells = [];
      for (var j = 0; j < 9; j++) {
        var c = u[j];
        if (!this.v[c] && POP[this.c[c]] >= 2 && POP[this.c[c]] <= k) cells.push(c);
      }
      if (cells.length < k) continue;
      var found = combos(cells, k, function (sel) {
        var m = 0, q;
        for (q = 0; q < k; q++) m |= self.c[sel[q]];
        if (POP[m] !== k) return false;
        var prog = false;
        for (var j2 = 0; j2 < 9; j2++) {
          var o = u[j2];
          if (self.v[o] || sel.indexOf(o) !== -1) continue;
          if (self.remove(o, m)) prog = true;
        }
        return prog;
      });
      if (found) return true;
    }
    return false;
  };
  /* sous-ensembles cachés : k chiffres confinés dans k cases */
  Logique.prototype.hiddenSubset = function (k) {
    var self = this;
    for (var uu = 0; uu < 27; uu++) {
      var u = UNITS[uu], digs = [], posOf = {};
      for (var d = 1; d <= 9; d++) {
        var bit = 1 << (d - 1), pm = 0, n = 0;
        for (var j = 0; j < 9; j++) if (this.c[u[j]] & bit) { pm |= 1 << j; n++; }
        if (n >= 2 && n <= k) { digs.push(d); posOf[d] = pm; }
      }
      if (digs.length < k) continue;
      var found = combos(digs, k, function (sel) {
        var pm2 = 0, dm = 0, q;
        for (q = 0; q < k; q++) { pm2 |= posOf[sel[q]]; dm |= 1 << (sel[q] - 1); }
        if (POP[pm2] !== k) return false;
        var prog = false;
        for (var j2 = 0; j2 < 9; j2++) {
          if ((pm2 & (1 << j2)) && self.remove(u[j2], ~dm & 511)) prog = true;
        }
        return prog;
      });
      if (found) return true;
    }
    return false;
  };
  /* poissons : X-wing (2 lignes), swordfish (3), jellyfish (4) */
  Logique.prototype.fish = function (k) {
    var self = this;
    for (var d = 1; d <= 9; d++) {
      var bit = 1 << (d - 1);
      for (var sens = 0; sens < 2; sens++) {
        var bases = [], masks = {};
        for (var l = 0; l < 9; l++) {
          var m = 0, n = 0;
          for (var j = 0; j < 9; j++) {
            var c = sens === 0 ? l * 9 + j : j * 9 + l;
            if (this.c[c] & bit) { m |= 1 << j; n++; }
          }
          if (n >= 2 && n <= k) { bases.push(l); masks[l] = m; }
        }
        if (bases.length < k) continue;
        var found = combos(bases, k, function (sel) {
          var cm = 0, q;
          for (q = 0; q < k; q++) cm |= masks[sel[q]];
          if (POP[cm] !== k) return false;
          var prog = false;
          for (var j2 = 0; j2 < 9; j2++) {
            if (!(cm & (1 << j2))) continue;
            for (var l2 = 0; l2 < 9; l2++) {
              if (sel.indexOf(l2) !== -1) continue;
              var c2 = sens === 0 ? l2 * 9 + j2 : j2 * 9 + l2;
              if (self.remove(c2, bit)) prog = true;
            }
          }
          return prog;
        });
        if (found) return true;
      }
    }
    return false;
  };
  /* XY-wing : un pivot {x,y} et deux pinces {x,z} {y,z} → z éliminé */
  Logique.prototype.xyWing = function () {
    var bi = [], i;
    for (i = 0; i < 81; i++) if (!this.v[i] && POP[this.c[i]] === 2) bi.push(i);
    for (var a = 0; a < bi.length; a++) {
      var piv = bi[a], pm = this.c[piv], wings = [];
      for (var b = 0; b < bi.length; b++) {
        var w = bi[b];
        if (w === piv || !sees(piv, w)) continue;
        var wm = this.c[w];
        if (wm === pm || POP[wm & pm] !== 1) continue;
        wings.push(w);
      }
      for (var x = 0; x < wings.length; x++) {
        for (var y = x + 1; y < wings.length; y++) {
          var w1 = wings[x], w2 = wings[y], m1 = this.c[w1], m2 = this.c[w2];
          var z = m1 & m2 & ~pm;
          if (POP[z] !== 1 || (m1 & pm) === (m2 & pm) || ((m1 | m2) & pm) !== pm) continue;
          var prog = false;
          for (i = 0; i < 81; i++) {
            if (this.v[i] || i === w1 || i === w2 || i === piv) continue;
            if (sees(i, w1) && sees(i, w2) && this.remove(i, z)) prog = true;
          }
          if (prog) return true;
        }
      }
    }
    return false;
  };
  /* XYZ-wing : un pivot {x,y,z} et deux pinces {x,z} {y,z} */
  Logique.prototype.xyzWing = function () {
    for (var piv = 0; piv < 81; piv++) {
      if (this.v[piv] || POP[this.c[piv]] !== 3) continue;
      var pm = this.c[piv], wings = [];
      for (var k = 0; k < 20; k++) {
        var w = PEERS[piv][k];
        if (!this.v[w] && POP[this.c[w]] === 2 && (this.c[w] & pm) === this.c[w]) wings.push(w);
      }
      for (var x = 0; x < wings.length; x++) {
        for (var y = x + 1; y < wings.length; y++) {
          var w1 = wings[x], w2 = wings[y];
          if (this.c[w1] === this.c[w2]) continue;
          var z = this.c[w1] & this.c[w2];
          if (POP[z] !== 1) continue;
          var prog = false;
          for (var i = 0; i < 81; i++) {
            if (this.v[i] || i === w1 || i === w2 || i === piv) continue;
            if (sees(i, piv) && sees(i, w1) && sees(i, w2) && this.remove(i, z)) prog = true;
          }
          if (prog) return true;
        }
      }
    }
    return false;
  };
  /* coloriage simple : chaînes de paires conjuguées d'un même chiffre */
  Logique.prototype.coloring = function () {
    for (var d = 1; d <= 9; d++) {
      var bit = 1 << (d - 1), adj = {}, u, k, c, uu;
      for (uu = 0; uu < 27; uu++) {
        u = UNITS[uu];
        var pos = [];
        for (k = 0; k < 9; k++) if (this.c[u[k]] & bit) pos.push(u[k]);
        if (pos.length === 2) {
          (adj[pos[0]] = adj[pos[0]] || []).push(pos[1]);
          (adj[pos[1]] = adj[pos[1]] || []).push(pos[0]);
        }
      }
      var seen = {};
      for (var s0 in adj) {
        var start = +s0;
        if (seen[start]) continue;
        var color = {}, comp = [start], stack = [start];
        color[start] = 0; seen[start] = true;
        while (stack.length) {
          var cur = stack.pop(), nb = adj[cur];
          for (k = 0; k < nb.length; k++) {
            var n2 = nb[k];
            if (color[n2] === undefined) {
              color[n2] = 1 - color[cur]; seen[n2] = true; comp.push(n2); stack.push(n2);
            }
          }
        }
        if (comp.length < 4) continue;
        // deux cases de même couleur se voient : cette couleur est fausse
        for (var col = 0; col < 2; col++) {
          var same = [];
          for (k = 0; k < comp.length; k++) if (color[comp[k]] === col) same.push(comp[k]);
          var clash = false;
          for (var a = 0; a < same.length && !clash; a++) {
            for (var b = a + 1; b < same.length; b++) if (sees(same[a], same[b])) { clash = true; break; }
          }
          if (clash) {
            var prog = false;
            for (k = 0; k < same.length; k++) if (this.remove(same[k], bit)) prog = true;
            if (prog) return true;
          }
        }
        // une case hors chaîne qui voit les deux couleurs perd ce chiffre
        var prog2 = false;
        for (c = 0; c < 81; c++) {
          if (!(this.c[c] & bit) || color[c] !== undefined) continue;
          var v0 = false, v1 = false;
          for (k = 0; k < comp.length; k++) {
            if (sees(c, comp[k])) { if (color[comp[k]]) v1 = true; else v0 = true; }
            if (v0 && v1) break;
          }
          if (v0 && v1 && this.remove(c, bit)) prog2 = true;
        }
        if (prog2) return true;
      }
    }
    return false;
  };
  /* rectangle unique (type 1) : la solution est unique, donc… */
  Logique.prototype.uniqueRect = function () {
    for (var a = 0; a < 81; a++) {
      if (this.v[a] || POP[this.c[a]] !== 2) continue;
      var m = this.c[a];
      for (var b = a + 1; b < 81 && ROW[b] === ROW[a]; b++) {
        if (this.c[b] !== m) continue;
        for (var r2 = 0; r2 < 9; r2++) {
          if (r2 === ROW[a]) continue;
          var c1 = r2 * 9 + COL[a], c2 = r2 * 9 + COL[b];
          var nbBoites = (BOX[a] === BOX[b] ? 1 : 2) + (BOX[c1] === BOX[a] || BOX[c1] === BOX[b] ? 0 : 1) +
            (BOX[c2] === BOX[a] || BOX[c2] === BOX[b] || BOX[c2] === BOX[c1] ? 0 : 1);
          if (nbBoites !== 2 || this.v[c1] || this.v[c2]) continue;
          var m1 = this.c[c1], m2 = this.c[c2];
          if ((m1 & m) !== m || (m2 & m) !== m) continue;
          if (m1 === m && m2 !== m && this.remove(c2, m)) return true;
          if (m2 === m && m1 !== m && this.remove(c1, m)) return true;
        }
      }
    }
    return false;
  };

  var ETAPES = [
    ['hs', function (L) { return L.hiddenSingle(); }],
    ['ns', function (L) { return L.nakedSingle(); }],
    ['lc', function (L) { return L.locked(); }],
    ['np', function (L) { return L.nakedSubset(2); }],
    ['hp', function (L) { return L.hiddenSubset(2); }],
    ['nt', function (L) { return L.nakedSubset(3); }],
    ['ht', function (L) { return L.hiddenSubset(3); }],
    ['xw', function (L) { return L.fish(2); }],
    ['xy', function (L) { return L.xyWing(); }],
    ['xyz', function (L) { return L.xyzWing(); }],
    ['sf', function (L) { return L.fish(3); }],
    ['nq', function (L) { return L.nakedSubset(4); }],
    ['hq', function (L) { return L.hiddenSubset(4); }],
    ['col', function (L) { return L.coloring(); }],
    ['ur', function (L) { return L.uniqueRect(); }],
    ['jf', function (L) { return L.fish(4); }]
  ];

  /* Résout comme un joueur ; renvoie {solved, tier, used:{technique: nb}}.
     tier 9 = hors de portée des techniques humaines retenues (refusée). */
  function rate(puzzle) {
    var L = new Logique(puzzle), used = {}, tier = 0;
    for (var guard = 0; guard < 3000; guard++) {
      var vide = false, i;
      for (i = 0; i < 81; i++) if (!L.v[i]) { vide = true; break; }
      if (!vide) break;
      var prog = false;
      for (var e = 0; e < ETAPES.length; e++) {
        if (ETAPES[e][1](L)) {
          var t = ETAPES[e][0];
          used[t] = (used[t] || 0) + 1;
          if (TECH[t].tier > tier) tier = TECH[t].tier;
          prog = true;
          break;
        }
        if (!L.ok) break;
      }
      if (!prog || !L.ok) break;
    }
    var solved = L.ok;
    for (var j = 0; j < 81; j++) if (!L.v[j]) { solved = false; break; }
    return { solved: solved, tier: solved ? tier : 9, used: used };
  }

  /* La grille correspond-elle au niveau demandé ? */
  function convient(level, r) {
    if (!r.solved) return false;
    if (level === 'facile') return r.tier === 1 && !r.used.ns;
    if (level === 'moyen') return r.tier === 1 && (r.used.ns || 0) >= 2;
    if (level === 'difficile') return r.tier === 2;
    return r.tier === 3;
  }

  /* Réserve de secours (grilles déjà classées, transformées à chaque tirage)
     si le téléphone est trop lent pour trouver la bonne grille à temps. */
  var RESERVE = {
    facile: [
      '1.....7.9...65.2.1529...6..69.3..574..459...2.5841...3..79..8..8..1.249.96..743.5',
      '6...9.24.7.9.4......4673.5.3.5.186.4.47.6958.8.1...9..5.392....4.2..5.9..164.....',
      '.7.9..1341......289..12.76.5..4..3...8725...92..7.3..67698.1.53.2.37..414....2.9.',
      '67284..135...2.....4...96253...7.1.27..1...48..4358.9.18.5....996.....7.....87.61',
      '...6...5.6835217..5......633.6.5.2.98..3....5..54.9..84.8.15.2...9234.81..2.8..37',
      '49.1.35.7.7.98.12...1....6.8.....25.5.364...8724859..69.75.8.3...6..7..5....367..',
      '7.5.89....2....78...6.7..2...3148.97197.5.2..4.8792.536...25..498.6...1..7291....',
      '.8.5...62562.87431.3...2.5.27.398......24..79.46....8.6...34..535....8961.8...34.',
      '49...51...817...425..14.8.91.9.52.8..5......3.348....5..7..845..46..1.98..542..7.',
      '.859..6....4582.931296.48...5...1.3.....5.716817.469......7.5..4..2.5.8..784...6.'
    ],
    moyen: [
      '..13....8752.......43.....137.2....9......276...1..8...8..5.9...26.....41.9..465.',
      '..53...6.7....6.31...1.4..2.9..1267.1.78........9....8456.8...3..1.2..8..7....5..',
      '..512.......9....7....78.23...2.5..44..............951.78....4991.4.3....42.1.8..',
      '.6..1.85.482......5.1.8....8..1.......659........3897.3....74.962..41.....4...3..',
      '...2...4149..87.3.5823....9....68......4....2.6...1.....79....8926.7.314..8......',
      '6.2.......3.24....4....13.21....5.9.3.9.74.....7.92..8.63..7..5.7....82......6...',
      '.6.5..41.15942.63......1..5..23....1.....7.....4.56....4698..72.......96...6..3..',
      '21..54......2..3......7......2.8...197..268.....9..4..1..7...3.4.7..5.82..68.37.9',
      '....45.....43215.....8..4.......9.82..2........5..736..7.6.38...8...2.4.2.34...1.',
      '8.......4.32.8....57.69...84.3..6.9......2831..8....67.419...8.9...5.2.....7.....'
    ],
    difficile: [
      '...278..53.5.........5.......18...7.2......9...93....48....97..9...6..5171.......',
      '6..3...9......836.......2.....1.5.....843.....53...8..1.6..7...7.5.9.......8.2...',
      '....9..7.7..4.6..99.....8...4.671.5....5.....2......3..74........1....6....9..3.5',
      '..5..6....2...9..6.3..2..4.67...4.523....1.97..........981...6....4...792.3......',
      '.24....3......8.5....21.9..5..64...37.3.......8..5......5.....8.....1...84.7.9.1.',
      '.6...19..7...8..63.9.7...45....4..3.....1.85..398.....6.2......4...3...8........2',
      '..15...8.4.2...9...6.4........2.8.7...6...5...3....1..1.....6..6...7...3.9.8..42.',
      '.82...419...91.....4........9....3.....6.17....8.7..92..1.8..73....6..2....5...6.',
      '.6.....4..4.9........2..7.9.1...8.5.9.....6..4.5....3....78.3..5...9.......32..18',
      '.5....6..27.9........356...69.7.2...........5.......9...4......9..2..17.3..8....4'
    ],
    expert: [
      '.9.2.1.8...1.....6..87...5.3..8.....8.4.....7..5.4.82.....63.4.........2.....53..',
      '...1.23....93.6..2.......9...7.8..39.9....158.14....2...34........6..8..7......1.',
      '6..28..93........81.7........269......8..5...9...236....34..1.......8.....6.7.5.2',
      '.3...7...7.4....1........94.2...6..74.51.......74.3......6.9..3..8....4.....1.6..',
      '......12..37..9...9....4.....9....32..82...9..516.....1.......4..4..1..7...3.....',
      '.529...7.....6.........7.2.4......86.6..1.3.....8.....87.....41....91....23..4..7',
      '.7.49..1.6...8.....4......521....8.4..8.7..........7.....16...7...3..6..5..9....1',
      '17......2..4.9....5...61.4...32..57...........5...76.4..9.5..6......628...7...9..',
      '.....42.5.....98.....6..93..6.....8..9..5.6..48..1....2....1...3...28.1....5...6.',
      '.7......6.85.63..........7....9...4..3......8....742..5.....6..8.4.....3..961....'
    ]
  };

  /* Transformation qui préserve TOUTE la logique d'une grille (chiffres
     renommés, lignes/colonnes permutées dans leurs bandes, bandes permutées,
     transposition) : même difficulté, aspect méconnaissable. */
  function transforme(puzzle, solution, rnd) {
    var chif = [0].concat(melange([1, 2, 3, 4, 5, 6, 7, 8, 9], rnd));
    function perm9() {
      var bandes = melange([0, 1, 2], rnd), out = [];
      bandes.forEach(function (b) { melange([0, 1, 2], rnd).forEach(function (k) { out.push(b * 3 + k); }); });
      return out;
    }
    var pr = perm9(), pc = perm9(), tr = rnd() < 0.5;
    var p2 = [], s2 = [];
    for (var i = 0; i < 81; i++) {
      var r = ROW[i], c = COL[i];
      // case (r, c) ← case (pr[r], pc[c]) de l'original, ou sa transposée
      var src = tr ? pr[c] * 9 + pc[r] : pr[r] * 9 + pc[c];
      p2.push(chif[puzzle[src]] || 0);
      s2.push(chif[solution[src]]);
    }
    return { puzzle: p2, solution: s2 };
  }
  function lisGrille(s) {
    var g = [];
    for (var i = 0; i < 81; i++) g.push(s.charAt(i) === '.' ? 0 : +s.charAt(i));
    return g;
  }

  /* Fabrique une grille du niveau demandé.
     budget (ms) : au-delà, on puise dans la réserve (toujours < 300 ms). */
  function makePuzzle(level, rnd, budget) {
    if (!LEVELS[level]) level = 'moyen';
    rnd = rnd || Math.random;
    var t0 = horloge(), lv = LEVELS[level], essais = 0;
    budget = budget || 140;
    for (;;) {
      essais++;
      var solution = fullGrid(rnd);
      var target = lv.clues[0] + Math.floor(rnd() * (lv.clues[1] - lv.clues[0] + 1));
      var d = dig(solution, target, rnd);
      var r = rate(d.puzzle);
      if (convient(level, r)) {
        return { solution: solution, puzzle: d.puzzle, clues: d.clues, tier: r.tier, used: r.used, essais: essais };
      }
      if (horloge() - t0 > budget && RESERVE[level].length) break;
      if (essais > 2000) break;
    }
    return deLaReserve(level, rnd, essais);
  }

  /* Une grille de la réserve, méconnaissable (la réserve ne stocke que la
     grille : sa solution, unique, est retrouvée à la volée). */
  function deLaReserve(level, rnd, essais) {
    var res = RESERVE[level];
    var brut = lisGrille(res[Math.floor(rnd() * res.length)]);
    var sol = [];
    countSolutions(brut, 1, -1, 0, sol);
    // on vérifie la transformée (le solveur parcourt les cases dans un autre ordre)
    var t = null, rr = null;
    for (var k = 0; k < 12; k++) {
      t = transforme(brut, sol, rnd);
      rr = rate(t.puzzle);
      if (convient(level, rr)) break;
      t = null;
    }
    if (!t) { t = { puzzle: brut, solution: sol }; rr = rate(brut); }
    var n = 0;
    t.puzzle.forEach(function (v) { if (v) n++; });
    return { solution: t.solution, puzzle: t.puzzle, clues: n, tier: rr.tier, used: rr.used, essais: essais, reserve: true };
  }

  /* ================================================================
   * Défi du jour
   * ================================================================ */
  var JOUR_NIVEAU = ['expert', 'facile', 'moyen', 'moyen', 'difficile', 'moyen', 'difficile']; // dim → sam
  function jourValide(j) {
    if (typeof j !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(j)) return false;
    var d = new Date(j + 'T12:00:00');
    return !isNaN(d.getTime());
  }
  function niveauDuJour(j) {
    var d = new Date(j + 'T12:00:00');
    return JOUR_NIVEAU[d.getDay()];
  }
  function aujourdhui() {
    var d = new Date();
    function z(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
  }
  function makeDaily(jour) {
    var lvl = niveauDuJour(jour);
    // pas de budget de temps : la même grille pour tout le monde, quel que soit le téléphone
    var rnd = mulberry(hash('gg-sudoku-' + jour));
    var t0 = 0;
    for (;;) {
      t0++;
      var solution = fullGrid(rnd);
      var lv = LEVELS[lvl];
      var target = lv.clues[0] + Math.floor(rnd() * (lv.clues[1] - lv.clues[0] + 1));
      var d = dig(solution, target, rnd);
      var r = rate(d.puzzle);
      if (convient(lvl, r) || t0 > 3000) {
        return { level: lvl, solution: solution, puzzle: d.puzzle, clues: d.clues, tier: r.tier, used: r.used };
      }
    }
  }

  /* ================================================================
   * Outils d'état
   * ================================================================ */
  function fmtClock(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    function z(n) { return (n < 10 ? '0' : '') + n; }
    return (h ? h + ':' + z(m) : z(m)) + ':' + z(ss);
  }
  function fmt(sec) { return fmtClock(sec * 1000); }

  /* le chrono ne compte que le temps de jeu (pas les pauses ni les absences) */
  function tick(state) {
    var now = maintenant();
    if (!state.paused && state.lastTs) state.elapsed += Math.max(0, Math.min(now - state.lastTs, TROU_MAX));
    state.lastTs = now;
  }
  function elapsedNow(state) {
    if (!state.lastTs) return state.elapsed || 0;
    if (state.paused || state.finished) return state.elapsed || 0;
    return (state.elapsed || 0) + Math.max(0, Math.min(maintenant() - state.lastTs, TROU_MAX));
  }

  /* candidats d'une case d'après les chiffres justes déjà posés */
  function candidatsDe(grid, bad, i) {
    var m = 511;
    for (var k = 0; k < 20; k++) {
      var p = PEERS[i][k];
      if (grid[p] && !bad[p]) m &= ~(1 << (grid[p] - 1));
    }
    return m;
  }
  /* une unité (ligne, colonne ou boîte) est-elle complète et juste ? */
  function uniteFinie(grid, bad, u) {
    for (var k = 0; k < 9; k++) if (!grid[u[k]] || bad[u[k]]) return false;
    return true;
  }
  function chiffreFini(state, me, v) {
    var g = state.grids[me], bad = state.bad[me], n = 0;
    for (var i = 0; i < 81; i++) if (g[i] === v && !bad[i]) n++;
    return n >= 9;
  }
  function restants(state, me) {
    var out = [0, 9, 9, 9, 9, 9, 9, 9, 9, 9];
    var g = state.grids[me] || state.puzzle, bad = (state.bad && state.bad[me]) || [];
    for (var i = 0; i < 81; i++) if (g[i] && !bad[i]) out[g[i]]--;
    return out;
  }

  /* ================================================================
   * Statistiques sur ce téléphone
   * ================================================================ */
  var STATS_CLE = 'gg-sudoku-stats';
  function lisStats() {
    try {
      var s = JSON.parse(localStorage.getItem(STATS_CLE) || 'null');
      if (s && typeof s === 'object') {
        s.niv = s.niv || {}; s.jours = s.jours || {};
        return s;
      }
    } catch (e) {}
    return { niv: {}, jours: {}, cles: [] };
  }
  function ecrisStats(s) { try { localStorage.setItem(STATS_CLE, JSON.stringify(s)); } catch (e) {} }
  /* enregistre une partie terminée (une seule fois par partie) ; renvoie le constat */
  function noteStats(state) {
    var out = { record: false, best: 0 };
    if (typeof localStorage === 'undefined' || !state.finished || state.players.length !== 1) return out;
    var s = lisStats(), cle = String(state.startTs);
    s.cles = (s.cles || []).slice(-20);
    var p = state.players[0], lv = state.level;
    var n = s.niv[lv] = s.niv[lv] || { jouees: 0, gagnees: 0, best: 0, somme: 0, sansFaute: 0 };
    if (s.cles.indexOf(cle) === -1) {
      s.cles.push(cle);
      n.jouees++;
      if (p.done) {
        n.gagnees++;
        n.somme += state.durationSec;
        if (!p.errors && !p.hints) n.sansFaute++;
        if (!n.best || state.durationSec < n.best) { n.best = state.durationSec; n.recordCle = cle; }
        if (state.daily) {
          var old = s.jours[state.daily];
          if (!old || state.durationSec < old) s.jours[state.daily] = state.durationSec;
        }
      }
      ecrisStats(s);
    }
    out.record = !!(p.done && n.recordCle === cle && n.gagnees > 1);
    out.premier = !!(p.done && n.gagnees === 1 && n.recordCle === cle);
    out.best = n.best;
    return out;
  }
  function serie(s) {
    // jours consécutifs de défi réussi, jusqu'à aujourd'hui (ou hier)
    var d = new Date(), n = 0;
    function cle(x) {
      function z(k) { return (k < 10 ? '0' : '') + k; }
      return x.getFullYear() + '-' + z(x.getMonth() + 1) + '-' + z(x.getDate());
    }
    if (!s.jours[cle(d)]) d.setDate(d.getDate() - 1);
    while (s.jours[cle(d)]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  function prefs() {
    try {
      var p = JSON.parse(localStorage.getItem('gg-sudoku-prefs') || 'null');
      if (p && typeof p === 'object') return p;
    } catch (e) {}
    return { limite: true };
  }
  function ecrisPrefs(p) { try { localStorage.setItem('gg-sudoku-prefs', JSON.stringify(p)); } catch (e) {} }

  /* ================================================================
   * Le module
   * ================================================================ */
  function joueur(state, i) { return state.players[i]; }

  function demarre(state, made, level, jour, maxErr) {
    state.level = level;
    state.daily = jour || null;
    state.solution = made.solution;
    state.puzzle = made.puzzle;
    state.tech = Object.keys(made.used || {}).filter(function (t) { return TECH[t] && TECH[t].tier >= 2; });
    state.toFill = made.puzzle.filter(function (v) { return v === 0; }).length;
    state.maxErr = maxErr;
    state.players.forEach(function (_, i) {
      state.grids[i] = made.puzzle.slice();
      state.notes[i] = made.puzzle.map(function () { return 0; });
      state.bad[i] = made.puzzle.map(function () { return 0; });
      state.lock[i] = made.puzzle.map(function () { return 0; });
      state.undo[i] = [];
    });
    state.phase = 'play';
    state.startTs = maintenant();
    state.lastTs = state.startTs;
    state.elapsed = 0;
    state.paused = false;
    state.n = 0;
    state.fx = null;
  }

  /* Une partie enregistrée par l'ancienne version (sans notes, annulation ni
     chrono cumulé) est complétée pour se reprendre sans heurt. */
  function migre(state) {
    if (!state || state.phase !== 'play' || state.notes) return state;
    state.notes = {}; state.bad = {}; state.lock = {}; state.undo = {};
    state.players.forEach(function (q, i) {
      var g = state.grids[i] || (state.puzzle || []).slice();
      state.grids[i] = g;
      state.notes[i] = g.map(function () { return 0; });
      state.bad[i] = g.map(function () { return 0; });
      state.lock[i] = g.map(function () { return 0; });
      state.undo[i] = [];
      q.hints = q.hints || 0;
    });
    state.maxErr = 0; // l'ancienne version ne limitait pas les erreurs
    state.elapsed = Math.max(0, Math.min(maintenant() - (state.startTs || maintenant()), 3600000));
    state.lastTs = maintenant();
    state.paused = false;
    state.tech = state.tech || [];
    state.n = state.n || 0;
    return state;
  }

  /* fin de la partie (victoire ou trop d'erreurs) */
  function termine(state) {
    state.finished = true;
    tick(state);
    state.durationSec = Math.max(1, Math.round(state.elapsed / 1000));
  }

  var mod = {
    id: 'sudoku',
    nom: 'Sudoku',
    icone: '🔢',
    desc: 'Grilles classées par les techniques qu’elles exigent : 4 niveaux vraiment réguliers, notes au crayon, indices, défi du jour et records.',
    regles: '<p><strong>🎯 Le but :</strong> remplir la grille : chaque ligne, chaque colonne et chaque carré de 3×3 contient une seule fois les chiffres 1 à 9.</p>' +
      '<p><strong>Comment jouer :</strong> touchez une case, puis un chiffre du pavé. Sous chaque chiffre, le nombre d’exemplaires qu’il reste à placer. Un mauvais chiffre s’affiche en rouge et compte une erreur (3 erreurs et c’est perdu, si la limite est activée).</p>' +
      '<p><strong>✏️ Notes :</strong> activez les notes pour griffonner les candidats d’une case ; « Auto » les remplit toutes d’un coup. Elles s’effacent toutes seules quand vous posez un chiffre.</p>' +
      '<p><strong>Outils :</strong> ↶ annule sans limite · ⌫ efface · 💡 révèle une case (+30 s au chrono).</p>' +
      '<p><strong>Niveaux :</strong> Facile (singletons cachés) · Moyen (singletons nus) · Difficile (pointages, paires, triplets) · Expert (X-wing, XY-wing, swordfish…). Chaque grille est vérifiée : elle a une seule solution et exige exactement les techniques de son niveau.</p>' +
      '<p><strong>🗓️ Défi du jour :</strong> une nouvelle grille chaque jour, la même pour tout le monde.</p>',
    min: 1, max: 1,
    hotseat: true, hotseatMax: 1, hidden: false, netOnly: false,
    noBadges: true,

    create: function (names) {
      return {
        players: names.map(function (n) {
          return { name: n, filled: 0, errors: 0, hints: 0, done: false, rank: 0 };
        }),
        phase: 'setup',
        level: null,
        daily: null,
        puzzle: null,
        solution: null,
        grids: {}, notes: {}, bad: {}, lock: {}, undo: {},
        tech: [],
        toFill: 0,
        maxErr: 3,
        startTs: 0, lastTs: 0, elapsed: 0, paused: false,
        durationSec: 0,
        finished: false,
        lost: false,
        winner: -1,
        n: 0,
        fx: null
      };
    },

    turnOf: function () { return -1; }, // chacun remplit sa grille en même temps
    over: function (state) { return state.finished; },
    scoreOf: function (state, i) {
      var p = state.players[i];
      return p.done ? '🏁' : p.filled + (state.puzzle ? '/' + state.toFill : '');
    },
    gagnants: function (state) {
      if (!state.finished) return undefined;
      if (state.winner >= 0) return [state.winner];
      return null; // trop d'erreurs : perdu
    },

    summary: function (state) {
      var solo = state.players.length === 1;
      var lv = LEVELS[state.level] ? LEVELS[state.level] : null;
      var html = '';
      if (solo) {
        var p = state.players[0];
        var st = noteStats(state);
        if (state.lost) {
          html += '<p class="sdk-fin-titre">❌ ' + ((state.maxErr | 0) || 3) + ' erreurs : la grille vous a eu cette fois.</p>';
        }
        html += '<div class="final-line"><span>⏱️ Temps</span><strong>' + fmt(state.durationSec) + '</strong></div>' +
          '<div class="final-line"><span>✅ Cases remplies</span><strong>' + (p.filled | 0) + ' / ' + (state.toFill | 0) + '</strong></div>' +
          '<div class="final-line"><span>❌ Erreurs</span><strong>' + (p.errors | 0) + (state.maxErr ? ' / ' + (state.maxErr | 0) : '') + '</strong></div>' +
          '<div class="final-line"><span>💡 Indices</span><strong>' + (p.hints | 0) + '</strong></div>';
        html += '<p class="mini-center">' + (state.daily ? '🗓️ Défi du jour · ' : '') +
          (lv ? lv.ic + ' ' + lv.nom : '') + '</p>';
        if (state.tech && state.tech.length) {
          html += '<p class="hint mini-center">Techniques nécessaires : ' + state.tech.map(function (t) {
            return GG.esc(TECH[t] ? TECH[t].nom : '');
          }).join(', ') + '</p>';
        }
        if (p.done) {
          if (st.record) html += '<h2 class="mini-center">🏆 Nouveau record !</h2>';
          else if (st.premier) html += '<p class="mini-center">🏅 Premier record à ce niveau !</p>';
          else if (st.best) html += '<p class="mini-center">🏅 Record (' + (lv ? lv.nom.toLowerCase() : '') + ') : ' + fmt(st.best) + '</p>';
          if (!p.errors && !p.hints) html += '<p class="mini-center">✨ Sans faute et sans indice !</p>';
        }
        return html;
      }
      var rows = state.players.map(function (q, i) { return { p: q, i: i }; })
        .sort(function (a, b) {
          return (b.p.done - a.p.done) || (a.p.rank - b.p.rank) ||
            (b.p.filled - a.p.filled) || (a.p.errors - b.p.errors);
        });
      html = rows.map(function (r) {
        return '<div class="final-line"><span>' + GG.esc(r.p.name) + '</span><strong>' +
          (r.p.done ? '✅ terminé' : (r.p.filled | 0) + '/' + (state.toFill | 0)) +
          ' · ' + (r.p.errors | 0) + ' erreur' + (r.p.errors > 1 ? 's' : '') + '</strong></div>';
      }).join('');
      html += '<p>⏱️ ' + fmt(state.durationSec) + ' · niveau ' + (lv ? lv.nom : '') + '</p>';
      if (state.winner >= 0) html += '<h1>🏆 ' + GG.esc(state.players[state.winner].name) + '</h1>';
      return html;
    },

    /* la solution et les grilles des autres joueurs restent secrètes */
    redact: function (state, viewer) {
      var copy = GG.clone(state);
      delete copy.solution;
      ['grids', 'notes', 'bad', 'lock', 'undo'].forEach(function (k) {
        var mine = copy[k] ? copy[k][viewer] : undefined;
        copy[k] = {};
        if (mine) copy[k][viewer] = mine;
      });
      return copy;
    },

    apply: function (state, player, action) {
      if (state.finished) return { ok: false, error: 'Partie terminée.' };
      if (!action || typeof action !== 'object') return { ok: false, error: 'Action inconnue.' };
      migre(state);
      var maxErr = action.err === 0 || action.err === '0' ? 0 : 3;
      if (action.t === 'level' || action.t === 'daily') {
        if (state.phase !== 'setup') return { ok: false, error: 'Niveau déjà choisi.' };
        if (player !== 0) return { ok: false, error: 'L’hôte choisit le niveau.' };
        if (action.t === 'daily') {
          if (!jourValide(action.jour)) return { ok: false, error: 'Date inconnue.' };
          var dj = makeDaily(action.jour);
          demarre(state, dj, dj.level, action.jour, maxErr);
          return { ok: true };
        }
        if (!LEVELS[action.l]) return { ok: false, error: 'Niveau inconnu.' };
        demarre(state, makePuzzle(action.l), action.l, null, maxErr);
        return { ok: true };
      }
      if (state.phase !== 'play') return { ok: false, error: 'La partie n’a pas commencé.' };
      var p = joueur(state, player);
      if (!p) return { ok: false, error: 'Joueur inconnu.' };
      var t = action.t;

      if (t === 'pause' || t === 'resume') {
        tick(state);
        state.paused = t === 'pause';
        return { ok: true };
      }
      if (p.done) return { ok: false, error: 'Vous avez déjà terminé !' };
      var grid = state.grids[player], notes = state.notes[player], bad = state.bad[player];
      var lock = state.lock[player], undo = state.undo[player];
      if (!grid) return { ok: false, error: 'Grille introuvable.' };
      if (state.paused) { tick(state); state.paused = false; }
      tick(state);

      if (t === 'undo') {
        while (undo.length) {
          var u = undo.pop();
          if (u.k === 'auto') {
            for (var a = 0; a < 81; a++) notes[a] = u.pn[a] || 0;
            state.fx = { n: ++state.n, k: 'undo', ts: maintenant(), p: player };
            return { ok: true };
          }
          if (lock[u.i] || state.puzzle[u.i]) continue; // case révélée par un indice : on ne la défait pas
          if (u.k === 'set' || u.k === 'erase') {
            var etaitJuste = grid[u.i] && !bad[u.i];
            var redevientJuste = u.pv && !u.pb;
            if (etaitJuste && !redevientJuste) p.filled--;
            if (!etaitJuste && redevientJuste) p.filled++;
            grid[u.i] = u.pv; bad[u.i] = u.pb; notes[u.i] = u.pn;
            (u.rm || []).forEach(function (r) { notes[r[0]] |= r[1]; });
          } else if (u.k === 'note') {
            notes[u.i] = u.pn;
          }
          state.fx = { n: ++state.n, k: 'undo', i: u.i, ts: maintenant(), p: player };
          return { ok: true };
        }
        return { ok: false, error: 'Rien à annuler.' };
      }

      if (t === 'auto') {
        var avant = notes.slice(), change = false;
        for (var c0 = 0; c0 < 81; c0++) {
          if (grid[c0]) continue; // case remplie (juste ou fausse) : pas de notes
          var m0 = candidatsDe(grid, bad, c0);
          if (notes[c0] !== m0) change = true;
          notes[c0] = m0;
        }
        if (!change) return { ok: false, error: 'Les notes sont déjà à jour.' };
        undo.push({ k: 'auto', pn: avant });
        state.fx = { n: ++state.n, k: 'auto', ts: maintenant(), p: player };
        return { ok: true };
      }

      if (t === 'hint') {
        // la case choisie si elle est à remplir, sinon la prochaine case « logique »
        var cible = -1, hi = action.i | 0;
        if (action.i !== undefined && hi >= 0 && hi < 81 && !state.puzzle[hi] && !lock[hi] &&
          (!grid[hi] || bad[hi])) cible = hi;
        if (cible === -1) {
          var vue = grid.map(function (v, k) { return bad[k] ? 0 : v; });
          var L = new Logique(vue);
          if (L.hiddenSingle() || L.nakedSingle()) cible = L.last;
          if (cible === -1) for (var k0 = 0; k0 < 81; k0++) if (!grid[k0] || bad[k0]) { cible = k0; break; }
        }
        if (cible === -1) return { ok: false, error: 'Plus rien à révéler.' };
        if (!grid[cible] || bad[cible]) p.filled++;
        grid[cible] = state.solution[cible];
        bad[cible] = 0;
        lock[cible] = 1;
        notes[cible] = 0;
        var bitH = 1 << (grid[cible] - 1);
        PEERS[cible].forEach(function (q) { notes[q] &= ~bitH; });
        p.hints++;
        state.elapsed += PENALITE_INDICE;
        state.fx = { n: ++state.n, k: 'hint', i: cible, ts: maintenant(), p: player };
        finitions(state, player, cible);
        return { ok: true };
      }

      var i = action.i | 0;
      if (i < 0 || i >= 81) return { ok: false, error: 'Case invalide.' };
      if (state.puzzle[i] !== 0) return { ok: false, error: 'Cette case fait partie de la grille de départ.' };
      if (lock[i]) return { ok: false, error: 'Case révélée par un indice : elle est juste.' };

      if (t === 'note') {
        var nv = action.v | 0;
        if (nv < 1 || nv > 9) return { ok: false, error: 'Chiffre invalide.' };
        if (grid[i] && !bad[i]) return { ok: false, error: 'Cette case est déjà remplie.' };
        if (grid[i]) return { ok: false, error: 'Effacez d’abord le chiffre faux.' };
        undo.push({ k: 'note', i: i, pn: notes[i] });
        notes[i] ^= 1 << (nv - 1);
        state.fx = { n: ++state.n, k: 'note', i: i, v: nv, ts: maintenant(), p: player };
        return { ok: true };
      }

      if (t === 'erase' || (t === 'set' && (action.v | 0) === 0)) {
        if (!grid[i] && !notes[i]) return { ok: false, error: 'Cette case est déjà vide.' };
        if (grid[i] && !bad[i]) return { ok: false, error: 'Ce chiffre est juste : on le garde.' };
        undo.push({ k: 'erase', i: i, pv: grid[i], pb: bad[i], pn: notes[i] });
        grid[i] = 0; bad[i] = 0; notes[i] = 0;
        state.fx = { n: ++state.n, k: 'erase', i: i, ts: maintenant(), p: player };
        return { ok: true };
      }

      if (t === 'set') {
        var v = action.v | 0;
        if (v < 1 || v > 9) return { ok: false, error: 'Chiffre invalide.' };
        if (grid[i] === v) return { ok: true }; // déjà ce chiffre : rien ne change
        if (grid[i] && !bad[i]) return { ok: false, error: 'Ce chiffre est juste : on le garde.' };
        var entree = { k: 'set', i: i, pv: grid[i], pb: bad[i], pn: notes[i], rm: [] };
        if (state.solution[i] !== v) {
          // faux : le chiffre s'affiche en rouge et compte une erreur
          grid[i] = v; bad[i] = 1; notes[i] = 0;
          p.errors++;
          undo.push(entree);
          state.fx = { n: ++state.n, k: 'bad', i: i, v: v, ts: maintenant(), p: player };
          if (state.maxErr && p.errors >= state.maxErr && state.players.length === 1) {
            state.lost = true;
            termine(state);
          }
          return { ok: true };
        }
        grid[i] = v; bad[i] = 0; notes[i] = 0;
        p.filled++;
        // les notes de ce chiffre s'effacent chez les voisines
        var bit = 1 << (v - 1);
        PEERS[i].forEach(function (q) {
          if (notes[q] & bit) { entree.rm.push([q, bit]); notes[q] &= ~bit; }
        });
        undo.push(entree);
        if (undo.length > 3000) undo.splice(0, undo.length - 3000);
        state.fx = { n: ++state.n, k: 'ok', i: i, v: v, ts: maintenant(), p: player };
        finitions(state, player, i);
        return { ok: true };
      }
      return { ok: false, error: 'Action inconnue.' };
    },

    /* ================================================================
     * Rendu
     * ================================================================ */
    render: function (el, ctx) {
      var s = migre(ctx.state);
      el._sdkCtx = ctx;
      if (s.phase === 'setup') { rendAccueil(el, ctx); return; }
      rendJeu(el, ctx);
    },

    // pour les tests
    _makePuzzle: function (lvl, rnd, budget) { return makePuzzle(lvl, rnd, budget); },
    _solveCount: solveCount,
    _countSolutions: countSolutions,
    _fullGrid: fullGrid,
    _rate: rate,
    _convient: convient,
    _makeDaily: makeDaily,
    _niveauDuJour: niveauDuJour,
    _transforme: transforme,
    _deLaReserve: deLaReserve,
    _mulberry: mulberry,
    _RESERVE: RESERVE,
    _TECH: TECH,
    _LEVELS: LEVELS,
    _fmtClock: fmtClock,
    _migre: migre
  };

  /* Après un bon chiffre : lignes / colonnes / boîtes terminées, chiffre
     complet, grille finie. Tout est noté dans state.fx pour le rendu. */
  function finitions(state, player, i) {
    var grid = state.grids[player], bad = state.bad[player], p = state.players[player];
    var fx = state.fx;
    fx.rows = uniteFinie(grid, bad, UNITS[ROW[i]]) ? [ROW[i]] : [];
    fx.cols = uniteFinie(grid, bad, UNITS[9 + COL[i]]) ? [COL[i]] : [];
    fx.boxes = uniteFinie(grid, bad, UNITS[18 + BOX[i]]) ? [BOX[i]] : [];
    if (chiffreFini(state, player, grid[i])) fx.digit = grid[i];
    if (p.filled >= state.toFill) {
      var tout = true;
      for (var k = 0; k < 81; k++) if (grid[k] !== state.solution[k]) { tout = false; break; }
      if (tout) {
        p.done = true;
        p.rank = state.players.filter(function (q) { return q.done; }).length;
        if (state.winner === -1) state.winner = player;
        fx.win = true;
        // la partie s'arrête dès qu'un joueur termine (les autres sont classés)
        termine(state);
      }
    }
  }

  /* ================================================================
   * Écran d'accueil : défi du jour, niveaux, records
   * ================================================================ */
  function rendAccueil(el, ctx) {
    el._sdkSel = -1;
    el._sdkNotes = false;
    el._sdkFxN = '';
    var s = ctx.state, me = ctx.me;
    if (me !== 0) {
      el.innerHTML = '<p class="mini-msg big-msg">🔢 Sudoku</p><p class="waiting">⏳ L’hôte choisit le niveau…</p>';
      return;
    }
    var st = lisStats(), pr = prefs();
    var jour = aujourdhui(), njour = niveauDuJour(jour), fait = st.jours[jour];
    var serieN = serie(st);
    var dateTxt = '';
    try {
      dateTxt = new Date(jour + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    } catch (e) { dateTxt = jour; }
    var html = '<div class="sdk-home">' +
      '<button class="sdk-daily' + (fait ? ' fait' : '') + '" data-daily="' + jour + '">' +
      '<span class="sdk-daily-cal"><b>' + GG.esc(jour.slice(8)) + '</b><small>' + GG.esc(dateTxt.split(' ')[0] || '') + '</small></span>' +
      '<span class="sdk-daily-tx"><span class="sdk-daily-t">Défi du jour</span>' +
      '<span class="sdk-daily-s">' + GG.esc(dateTxt) + ' · ' + LEVELS[njour].ic + ' ' + LEVELS[njour].nom + '</span>' +
      '<span class="sdk-daily-s">' + (fait ? '✅ Réussi en ' + fmt(fait) : 'La même grille pour tout le monde') +
      (serieN > 1 ? ' · 🔥 ' + serieN + ' jours de suite' : '') + '</span></span>' +
      '<span class="sdk-daily-go">' + (fait ? '↻' : '▶') + '</span></button>' +
      '<div class="sdk-lvls">';
    ORDRE.forEach(function (l) {
      var lv = LEVELS[l], n = st.niv[l];
      html += '<button class="sdk-lvl" data-lvl="' + l + '">' +
        '<span class="sdk-lvl-ic">' + lv.ic + '</span>' +
        '<span class="sdk-lvl-nom">' + lv.nom + '</span>' +
        '<span class="sdk-lvl-tech">' + lv.tech + '</span>' +
        '<span class="sdk-lvl-best">' + (n && n.best ? '🏅 ' + fmt(n.best) : 'Pas encore de record') + '</span>' +
        '</button>';
    });
    html += '</div>' +
      '<button class="sdk-opt' + (pr.limite ? ' on' : '') + '" data-opt="limite">' +
      '<span class="sdk-opt-tx">Limite de 3 erreurs<small>Au 3ᵉ mauvais chiffre, la partie est perdue</small></span>' +
      '<span class="interrupteur"></span></button>';
    // statistiques
    var total = 0, lignes = '';
    ORDRE.forEach(function (l) {
      var n = st.niv[l];
      if (!n || !n.jouees) return;
      total += n.jouees;
      lignes += '<tr><td>' + LEVELS[l].ic + ' ' + LEVELS[l].nom + '</td><td>' + n.gagnees + '/' + n.jouees + '</td><td>' +
        (n.best ? fmt(n.best) : '—') + '</td><td>' + (n.gagnees ? fmt(Math.round(n.somme / n.gagnees)) : '—') + '</td></tr>';
    });
    if (total) {
      html += '<div class="sdk-stats"><h3>📊 Vos statistiques</h3><table><thead><tr><th>Niveau</th><th>Gagnées</th>' +
        '<th>Record</th><th>Moyenne</th></tr></thead><tbody>' + lignes + '</tbody></table></div>';
    }
    html += '</div>';
    el.innerHTML = html;
    var parti = false;
    function go(a) {
      if (parti) return;
      var p2 = prefs();
      a.err = p2.limite ? 3 : 0;
      parti = true;
      GG.sfx.play('open');
      if (!ctx.act(a)) parti = false;
    }
    el.querySelectorAll('[data-lvl]').forEach(function (b) {
      b.addEventListener('click', function () { go({ t: 'level', l: b.getAttribute('data-lvl') }); });
    });
    var bd = el.querySelector('[data-daily]');
    bd.addEventListener('click', function () { go({ t: 'daily', jour: bd.getAttribute('data-daily') }); });
    el.querySelector('[data-opt="limite"]').addEventListener('click', function (e) {
      var p2 = prefs();
      p2.limite = !p2.limite;
      ecrisPrefs(p2);
      e.currentTarget.classList.toggle('on', p2.limite);
      GG.sfx.play('toggle');
    });
    GG.fx.stagger(el.querySelectorAll('.sdk-daily, .sdk-lvl, .sdk-opt'), { gap: 45 });
  }

  /* ================================================================
   * Écran de jeu
   * ================================================================ */
  function rendJeu(el, ctx) {
    var s = ctx.state, me = ctx.me;
    var grid = s.grids[me] || s.puzzle;
    var notes = (s.notes && s.notes[me]) || [];
    var bad = (s.bad && s.bad[me]) || [];
    var lock = (s.lock && s.lock[me]) || [];
    var p = s.players[me];
    var lv = LEVELS[s.level] || LEVELS.moyen;
    var reste = restants(s, me);
    if (el._sdkSel === undefined || el._sdkSel < 0 || el._sdkSel > 80) {
      // une case est toujours sélectionnée : la première à remplir, au centre si possible
      el._sdkSel = 40;
      if (s.puzzle[40]) for (var k0 = 0; k0 < 81; k0++) if (!s.puzzle[k0]) { el._sdkSel = k0; break; }
    }
    var html = '<div class="sdk' + (s.paused ? ' en-pause' : '') + (el._sdkNotes ? ' notes-on' : '') + '">';
    // bandeau : niveau, erreurs, chrono, pause
    html += '<div class="sdk-top">' +
      '<span class="sdk-chip lvl">' + (s.daily ? '🗓️ ' : lv.ic + ' ') + lv.nom + '</span>' +
      '<span class="sdk-chip" id="sdk-prog" title="Cases remplies">✅ ' + (p.filled | 0) + '/' + (s.toFill | 0) + '</span>' +
      '<span class="sdk-chip' + (p.errors ? ' err' : '') + '" id="sdk-err" title="Erreurs">❌ ' + (p.errors | 0) +
      (s.maxErr ? '/' + (s.maxErr | 0) : '') + '</span>' +
      '<button class="sdk-chip sdk-time" id="sdk-pause" aria-label="' + (s.paused ? 'Reprendre' : 'Pause') + '">' +
      '<span id="sdk-timer">' + fmtClock(elapsedNow(s)) + '</span><span class="sdk-pp' + (s.paused ? ' play' : '') +
      '" aria-hidden="true"></span></button>' +
      '</div>';
    // la grille
    html += '<div class="sdk-board"><div class="sdk-grid" role="grid" aria-label="Grille de sudoku">';
    for (var i = 0; i < 81; i++) {
      var given = s.puzzle[i] !== 0;
      var cls = 'sdk-cell';
      if (given) cls += ' given';
      else if (lock[i]) cls += ' hinted';
      else if (grid[i] && bad[i]) cls += ' bad';
      else if (grid[i]) cls += ' user';
      if (COL[i] === 2 || COL[i] === 5) cls += ' br';
      if (ROW[i] === 2 || ROW[i] === 5) cls += ' bb';
      html += '<div class="' + cls + '" data-i="' + i + '" role="gridcell">';
      if (grid[i]) html += '<span class="sdk-v">' + (grid[i] | 0) + '</span>';
      else if (notes[i]) {
        html += '<span class="sdk-notes">';
        for (var d = 1; d <= 9; d++) html += '<i>' + (notes[i] & (1 << (d - 1)) ? d : '') + '</i>';
        html += '</span>';
      }
      html += '</div>';
    }
    html += '</div>';
    if (s.paused) {
      html += '<div class="sdk-pause-voile"><div class="sdk-pause-carte"><span class="sdk-pause-ic">⏸</span>' +
        '<b>Pause</b><small>' + fmtClock(elapsedNow(s)) + ' · ' + lv.nom + '</small>' +
        '<button class="btn big jeu" id="sdk-resume">▶ Reprendre</button></div></div>';
    }
    html += '</div>';
    // outils
    html += '<div class="sdk-tools">' +
      '<button class="sdk-tool" data-tool="undo" aria-label="Annuler"><span class="sdk-tool-ic">↶</span><span>Annuler</span></button>' +
      '<button class="sdk-tool" data-tool="erase" aria-label="Effacer"><span class="sdk-tool-ic">⌫</span><span>Effacer</span></button>' +
      '<button class="sdk-tool' + (el._sdkNotes ? ' on' : '') + '" data-tool="notes" aria-pressed="' + (el._sdkNotes ? 'true' : 'false') +
      '"><span class="sdk-tool-ic">✏️<b class="sdk-onoff">' + (el._sdkNotes ? 'ON' : 'OFF') + '</b></span><span>Notes</span></button>' +
      '<button class="sdk-tool" data-tool="auto" aria-label="Notes automatiques"><span class="sdk-tool-ic">🪄</span><span>Auto</span></button>' +
      '<button class="sdk-tool" data-tool="hint" aria-label="Indice"><span class="sdk-tool-ic">💡' +
      (p.hints ? '<b class="sdk-badge">' + (p.hints | 0) + '</b>' : '') + '</span><span>Indice</span></button>' +
      '</div>';
    // pavé : les chiffres et ce qu'il reste à placer
    html += '<div class="sdk-pad">';
    for (var v = 1; v <= 9; v++) {
      html += '<button class="sdk-key' + (reste[v] <= 0 ? ' fini' : '') + '" data-v="' + v + '" aria-label="' + v +
        ' (encore ' + Math.max(0, reste[v]) + ')"><b>' + v + '</b><small>' + (reste[v] <= 0 ? '✓' : reste[v]) + '</small></button>';
    }
    html += '</div></div>';
    el.innerHTML = html;

    peins(el, s, me);
    branche(el, ctx);
    effets(el, s, me);
    chrono(el);
  }

  /* surlignages : case choisie, sa ligne / colonne / boîte, chiffres identiques, conflits */
  function peins(el, s, me) {
    var grid = s.grids[me] || s.puzzle, bad = (s.bad && s.bad[me]) || [];
    var sel = el._sdkSel, v = grid[sel];
    var cells = el.querySelectorAll('.sdk-cell');
    for (var i = 0; i < cells.length; i++) {
      var c = cells[i];
      var zone = i !== sel && (ROW[i] === ROW[sel] || COL[i] === COL[sel] || BOX[i] === BOX[sel]);
      c.classList.toggle('sel', i === sel);
      c.classList.toggle('zone', zone);
      c.classList.toggle('meme', i !== sel && !!v && grid[i] === v);
      // un chiffre faux et le chiffre juste qui le contredit
      c.classList.toggle('conflit', !!v && bad[sel] && zone && grid[i] === v);
      var ns = c.querySelector('.sdk-notes');
      if (ns) {
        var is = ns.children;
        for (var d = 0; d < 9; d++) is[d].classList.toggle('meme', !!v && !bad[sel] && d + 1 === v && is[d].textContent !== '');
      }
    }
    var keys = el.querySelectorAll('.sdk-key');
    for (var k = 0; k < keys.length; k++) keys[k].classList.toggle('meme', !!v && !bad[sel] && k + 1 === v);
  }

  function branche(el, ctx) {
    var s = ctx.state, me = ctx.me;
    var grid = el.querySelector('.sdk-grid');
    function cellule(i) { return el.querySelector('.sdk-cell[data-i="' + i + '"]'); }
    function refuse(i) {
      var c = cellule(i);
      if (c) GG.fx.shake(c, 0.6);
      GG.haptic('warning');
    }
    function joue(a) {
      var ok = ctx.act(a);
      if (!ok) refuse(a.i !== undefined ? a.i : el._sdkSel);
      return ok;
    }
    function choisis(i) {
      if (i < 0 || i > 80) return;
      el._sdkSel = i;
      peins(el, ctx.state, me);
      GG.sfx.play('tap', { volume: 0.35 });
    }
    function chiffre(v) {
      if (s.paused) { joue({ t: 'resume' }); return; }
      var i = el._sdkSel;
      if (el._sdkNotes) joue({ t: 'note', i: i, v: v });
      else joue({ t: 'set', i: i, v: v });
    }
    function outil(t) {
      var i = el._sdkSel;
      if (t === 'notes') {
        el._sdkNotes = !el._sdkNotes;
        var b = el.querySelector('[data-tool="notes"]');
        b.classList.toggle('on', el._sdkNotes);
        b.setAttribute('aria-pressed', el._sdkNotes ? 'true' : 'false');
        b.querySelector('.sdk-onoff').textContent = el._sdkNotes ? 'ON' : 'OFF';
        el.querySelector('.sdk').classList.toggle('notes-on', el._sdkNotes);
        GG.sfx.play('toggle');
        GG.fx.pop(b.querySelector('.sdk-tool-ic'));
        return;
      }
      if (t === 'undo') { joue({ t: 'undo' }); return; }
      if (t === 'erase') { joue({ t: 'erase', i: i }); return; }
      if (t === 'auto') { joue({ t: 'auto' }); return; }
      if (t === 'hint') { joue({ t: 'hint', i: i }); return; }
    }
    grid.addEventListener('pointerdown', function (e) {
      var c = e.target.closest ? e.target.closest('.sdk-cell') : null;
      if (!c) return;
      e.preventDefault();
      choisis(parseInt(c.getAttribute('data-i'), 10));
    });
    el.querySelectorAll('.sdk-key').forEach(function (k) {
      k.addEventListener('click', function () { chiffre(parseInt(k.getAttribute('data-v'), 10)); });
    });
    el.querySelectorAll('.sdk-tool').forEach(function (b) {
      b.addEventListener('click', function () { outil(b.getAttribute('data-tool')); });
    });
    var bp = el.querySelector('#sdk-pause');
    bp.addEventListener('click', function () { GG.sfx.play('toggle'); ctx.act({ t: s.paused ? 'resume' : 'pause' }); });
    var br = el.querySelector('#sdk-resume');
    if (br) br.addEventListener('click', function () { GG.sfx.play('toggle'); ctx.act({ t: 'resume' }); });

    // clavier (ordinateur) : chiffres, flèches, effacer, N = notes, Z = annuler
    el._sdkKey = function (e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      var t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      var k = e.key, i = el._sdkSel;
      if (/^[1-9]$/.test(k)) { chiffre(+k); e.preventDefault(); }
      else if (k === 'Backspace' || k === 'Delete' || k === '0') { outil('erase'); e.preventDefault(); }
      else if (k === 'ArrowLeft') { choisis(COL[i] ? i - 1 : i + 8); e.preventDefault(); }
      else if (k === 'ArrowRight') { choisis(COL[i] < 8 ? i + 1 : i - 8); e.preventDefault(); }
      else if (k === 'ArrowUp') { choisis(ROW[i] ? i - 9 : i + 72); e.preventDefault(); }
      else if (k === 'ArrowDown') { choisis(ROW[i] < 8 ? i + 9 : i - 72); e.preventDefault(); }
      else if (k === 'n' || k === 'N') outil('notes');
      else if (k === 'z' || k === 'Z' || k === 'u') outil('undo');
    };
    if (!el._sdkClavier && typeof document !== 'undefined') {
      el._sdkClavier = true;
      document.addEventListener('keydown', function (e) {
        if (!el.querySelector('.sdk-grid') || !document.body.contains(el) || !el._sdkKey) return;
        if (document.querySelector('.overlay:not(.hidden)')) return;
        el._sdkKey(e);
      });
      // l'appli passe en arrière-plan : le chrono se met en pause
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState !== 'hidden') return;
        var c2 = el._sdkCtx;
        if (!c2 || !el.querySelector('.sdk-grid')) return;
        var st = c2.state;
        if (st.phase === 'play' && !st.finished && !st.paused) c2.act({ t: 'pause' });
      });
    }
  }

  /* effets du dernier coup (une seule fois, et jamais à la reprise d'une partie) */
  function effets(el, s, me) {
    var fx = s.fx;
    if (!fx) return;
    var cle = s.startTs + ':' + fx.n;
    if (cle === el._sdkFxN) return;
    el._sdkFxN = cle;
    if (fx.p !== undefined && fx.p !== me) return;
    if (!fx.ts || Math.abs(Date.now() - fx.ts) > 4000) return;
    var c = fx.i !== undefined ? el.querySelector('.sdk-cell[data-i="' + fx.i + '"]') : null;
    var sfx = GG.sfx;
    if (fx.k === 'bad') {
      if (c) GG.fx.shake(c, 0.9);
      sfx.play('wrong');
      GG.haptic('error');
      var errEl = el.querySelector('#sdk-err');
      if (errEl) GG.fx.pop(errEl, 1.3);
      return;
    }
    if (fx.k === 'note') { sfx.play('tick', { volume: 0.5 }); return; }
    if (fx.k === 'erase') { sfx.play('erase'); if (c) GG.fx.pop(c, 0.9); return; }
    if (fx.k === 'undo') { sfx.play('back'); if (c) GG.fx.pop(c, 1.08); return; }
    if (fx.k === 'auto') {
      sfx.play('reveal');
      var ns = el.querySelectorAll('.sdk-notes');
      for (var q = 0; q < ns.length; q++) ns[q].style.animationDelay = (q % 9) * 18 + Math.floor(q / 9) * 12 + 'ms';
      el.querySelector('.sdk-grid').classList.add('auto-anim');
      return;
    }
    if (fx.k === 'ok' || fx.k === 'hint') {
      if (c) c.classList.add('pose');
      if (fx.k === 'hint') {
        // la case révélée devient la case choisie (on voit ses surlignages)
        if (fx.i !== el._sdkSel) { el._sdkSel = fx.i; peins(el, s, me); }
        sfx.play('reveal');
        if (c) {
          GG.fx.burst(c, { count: 12, shape: 'star', colors: ['#ffc23d', '#fff3b0'] });
          GG.fx.floatText(c, '+30 s', { color: '#ffd166', size: 18 });
        }
      }
      var unites = [];
      (fx.rows || []).forEach(function (r) { unites.push(UNITS[r]); });
      (fx.cols || []).forEach(function (co) { unites.push(UNITS[9 + co]); });
      (fx.boxes || []).forEach(function (b) { unites.push(UNITS[18 + b]); });
      if (fx.win) {
        vague(el, fx.i, allCells(), 38);
        sfx.play('success');
        return;
      }
      if (unites.length) {
        var tous = [];
        unites.forEach(function (u) { u.forEach(function (x) { if (tous.indexOf(x) === -1) tous.push(x); }); });
        vague(el, fx.i, tous, 55);
        sfx.play('success', { pitch: 1 + 0.08 * (unites.length - 1) });
        GG.haptic('success');
        if (c) GG.fx.burst(c, { count: 10 + 6 * unites.length, shape: 'spark', colors: ['#8b5cff', '#ffc23d', '#2fd4ff'] });
      } else if (fx.digit) {
        sfx.play('correct');
      } else if (fx.k === 'ok') {
        sfx.play('place', { volume: 0.8 });
        GG.haptic('light');
      }
      if (fx.digit) {
        var key = el.querySelector('.sdk-key[data-v="' + fx.digit + '"]');
        if (key) GG.fx.pop(key, 1.25);
        el.querySelectorAll('.sdk-cell').forEach(function (cc) {
          var vv = cc.querySelector('.sdk-v');
          if (vv && +vv.textContent === fx.digit && !cc.classList.contains('bad')) cc.classList.add('brille');
        });
      }
    }
  }
  function allCells() { var a = []; for (var i = 0; i < 81; i++) a.push(i); return a; }
  /* une vague de lumière part de la case posée et parcourt les cases terminées */
  function vague(el, from, cells, pas) {
    var r0 = ROW[from], c0 = COL[from];
    cells.forEach(function (i) {
      var c = el.querySelector('.sdk-cell[data-i="' + i + '"]');
      if (!c) return;
      var dist = Math.max(Math.abs(ROW[i] - r0), Math.abs(COL[i] - c0));
      c.style.setProperty('--d', (dist * pas) + 'ms');
      c.classList.remove('vague');
      c.classList.add('vague');
    });
  }

  /* le chrono défile chaque seconde tant que la grille est à l'écran */
  function chrono(el) {
    if (el._sdkTimer) return;
    el._sdkTimer = setInterval(function () {
      var t = el.querySelector('#sdk-timer'), c = el._sdkCtx;
      if (!t || !c || !document.body.contains(t)) {
        clearInterval(el._sdkTimer); el._sdkTimer = null; return;
      }
      t.textContent = fmtClock(elapsedNow(c.state));
    }, 1000);
  }

  GG.register(mod);
  if (typeof module === 'object' && module.exports) module.exports = mod;
})(typeof self !== 'undefined' ? self : globalThis);
