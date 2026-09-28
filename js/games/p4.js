/* GGgames — Puissance 4 (2 joueurs, série en 1, 3 ou 5 manches gagnantes).
 *
 * V2 : un vrai plateau en plastique (les trous laissent voir le fond), des
 * jetons qui tombent et rebondissent, l’aperçu de la colonne visée, le
 * repère du dernier coup, l’alignement gagnant qui brille, des confettis de
 * manche. Trois niveaux d’IA : facile, moyen, difficile (recherche profonde
 * avec table de transposition).
 */
(function (root) {
  'use strict';
  var GG = root.GG;
  var COLS = 7, ROWS = 6, NB = COLS * ROWS;
  var SERIES = [1, 3, 5];
  var ORDRE = [3, 2, 4, 1, 5, 0, 6]; // le centre d’abord

  function winLine(grid, idx) {
    var c = idx % COLS, r = Math.floor(idx / COLS);
    var who = grid[idx];
    var dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
    for (var d = 0; d < dirs.length; d++) {
      var dc = dirs[d][0], dr = dirs[d][1];
      var line = [idx];
      var cc, rr;
      for (cc = c + dc, rr = r + dr;
           cc >= 0 && cc < COLS && rr >= 0 && rr < ROWS && grid[rr * COLS + cc] === who;
           cc += dc, rr += dr) line.push(rr * COLS + cc);
      for (cc = c - dc, rr = r - dr;
           cc >= 0 && cc < COLS && rr >= 0 && rr < ROWS && grid[rr * COLS + cc] === who;
           cc -= dc, rr -= dr) line.push(rr * COLS + cc);
      if (line.length >= 4) {
        line.sort(function (a, b) { return a - b; });
        return line;
      }
    }
    return null;
  }

  function ligneLibre(grid, col) {
    for (var r = ROWS - 1; r >= 0; r--) if (!grid[r * COLS + col]) return r;
    return -1;
  }

  function newRound(state) {
    state.grid = [];
    for (var i = 0; i < NB; i++) state.grid.push(null);
    state.current = state.starter;
    state.roundOver = false;
    state.winner = -1;
    state.line = [];
    state.draw = false;
    state.coups = 0;
    state.dernier = -1; // case du dernier jeton posé
  }

  function manches(state) {
    var n = state.opts && state.opts.manches;
    return SERIES.indexOf(n) !== -1 ? n : 3;
  }

  /* ================= Moteur de l’IA =================
     Position interne : 0 vide, 1 rouge, 2 jaune. On tient à jour, coup par
     coup, le nombre de jetons de chaque camp dans chacune des 69 fenêtres de
     4 cases : l’évaluation d’une position ne coûte alors plus rien. */
  var FEN = [], FEN_DE = [], FEN_C = [];
  (function () {
    var DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];
    for (var i = 0; i < NB; i++) FEN_DE.push([]);
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        for (var d = 0; d < 4; d++) {
          var dc = DIRS[d][0], dr = DIRS[d][1];
          var r3 = r + 3 * dr, c3 = c + 3 * dc;
          if (r3 < 0 || r3 >= ROWS || c3 < 0 || c3 >= COLS) continue;
          var cl = [];
          for (var k = 0; k < 4; k++) {
            FEN_DE[(r + k * dr) * COLS + c + k * dc].push(FEN.length);
            cl.push((r + k * dr) * COLS + c + k * dc);
          }
          FEN.push(1);
          FEN_C.push(cl);
        }
      }
    }
  })();
  // valeur d’une fenêtre selon le nombre de jetons rouges (a) et jaunes (b)
  var POIDS = [0, 1, 9, 45, 0];
  var VAL = [];
  (function () {
    for (var a = 0; a <= 4; a++) {
      VAL.push([]);
      for (var b = 0; b <= 4; b++) VAL[a].push(a && b ? 0 : POIDS[a] - POIDS[b]);
    }
  })();
  var CENTRE = [0, 1, 2, 4, 2, 1, 0]; // tenir le milieu rapporte
  /* La parité des menaces (la clé des fins de partie) : une menace (3 jetons
     et un trou) vaut bien plus quand le trou est sur une rangée « à soi » —
     impaire (1re, 3e, 5e en partant du bas) pour celui qui a commencé la
     manche, paire pour l’autre : c’est lui qui finira par y poser. */
  var PARITE = 30;
  var D3 = [[1, 0], [1, 1], [1, -1]];

  // clés de hachage (deux entiers de 32 bits) pour la table de transposition
  var Z = [[], [], []], Z2 = [[], [], []];
  (function () {
    var s = 0x2545f491;
    function alea() { // xorshift : des clés fixes d’une session à l’autre
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
      return s | 0;
    }
    for (var q = 1; q <= 2; q++) {
      for (var i = 0; i < NB; i++) { Z[q].push(alea()); Z2[q].push(alea()); }
    }
  })();

  var GAGNE = 100000;

  function Position(grid, trait, parite) {
    this.b = new Int8Array(NB);
    this.h = new Int8Array(COLS);
    this.n = [null, new Int8Array(FEN.length), new Int8Array(FEN.length)];
    this.score = 0; // du point de vue des rouges
    this.k1 = 0; this.k2 = 0;
    this.coups = 0;
    // qui a commencé la manche ? celui qui a un jeton de plus, sinon celui qui a le trait
    var nr = 0, nj = 0;
    for (var q0 = 0; q0 < NB; q0++) { if (grid[q0] === 'R') nr++; else if (grid[q0] === 'J') nj++; }
    this.premier = nr > nj ? 1 : (nj > nr ? 2 : (trait || 1));
    this.parite = parite || 0;
    for (var c = 0; c < COLS; c++) {
      for (var r = ROWS - 1; r >= 0; r--) {
        var v = grid[r * COLS + c];
        if (!v) break;
        this.jouer(c, v === 'R' ? 1 : 2);
      }
    }
  }
  /* valeur d’une fenêtre, parité des menaces comprise */
  Position.prototype.terme = function (w) {
    var a = this.n[1][w], b = this.n[2][w], v = VAL[a][b];
    if ((a === 3 && b === 0) || (b === 3 && a === 0)) {
      var cl = FEN_C[w];
      for (var k = 0; k < 4; k++) {
        var e = cl[k];
        if (!this.b[e]) {
          var qui = a === 3 ? 1 : 2;
          var impaire = ((ROWS - Math.floor(e / COLS)) & 1) === 1;
          if ((qui === this.premier) === impaire) v += qui === 1 ? this.parite : -this.parite;
          break;
        }
      }
    }
    return v;
  };
  Position.prototype.jouer = function (c, q) {
    var i = (ROWS - 1 - this.h[c]) * COLS + c;
    var fs = FEN_DE[i], n1 = this.n[1], n2 = this.n[2], s = this.score, k;
    for (k = 0; k < fs.length; k++) s -= this.terme(fs[k]);
    this.b[i] = q;
    for (k = 0; k < fs.length; k++) {
      if (q === 1) n1[fs[k]]++; else n2[fs[k]]++;
      s += this.terme(fs[k]);
    }
    this.score = s + (q === 1 ? CENTRE[c] : -CENTRE[c]);
    this.h[c]++;
    this.coups++;
    this.k1 ^= Z[q][i]; this.k2 ^= Z2[q][i];
    return i;
  };
  Position.prototype.annuler = function (c) {
    this.h[c]--;
    var i = (ROWS - 1 - this.h[c]) * COLS + c;
    var q = this.b[i];
    var fs = FEN_DE[i], n1 = this.n[1], n2 = this.n[2], s = this.score, k;
    for (k = 0; k < fs.length; k++) s -= this.terme(fs[k]);
    this.b[i] = 0;
    for (k = 0; k < fs.length; k++) {
      if (q === 1) n1[fs[k]]--; else n2[fs[k]]--;
      s += this.terme(fs[k]);
    }
    this.score = s - (q === 1 ? CENTRE[c] : -CENTRE[c]);
    this.coups--;
    this.k1 ^= Z[q][i]; this.k2 ^= Z2[q][i];
  };
  /* le camp q gagnerait-il en jouant dans la colonne c ? (une fenêtre qui
     contient la case d’arrivée compte déjà 3 jetons de q et aucun adverse) */
  Position.prototype.gagnerait = function (c, q) {
    if (this.h[c] >= ROWS) return false;
    var fs = FEN_DE[(ROWS - 1 - this.h[c]) * COLS + c], nq = this.n[q], no = this.n[3 - q];
    for (var k = 0; k < fs.length; k++) if (nq[fs[k]] === 3 && no[fs[k]] === 0) return true;
    return false;
  };

  // table de transposition (partagée d’un coup à l’autre : l’analyse du coup
  // précédent profite au suivant)
  var TT_BITS = 18, TT_MASK = (1 << TT_BITS) - 1;
  var TT = null;
  function tt() {
    if (!TT) {
      TT = {
        k: new Int32Array(1 << TT_BITS), v: new Int32Array(1 << TT_BITS),
        d: new Int8Array(1 << TT_BITS), f: new Int8Array(1 << TT_BITS), m: new Int8Array(1 << TT_BITS)
      };
      for (var i = 0; i < TT.d.length; i++) TT.d[i] = -1;
    }
    return TT;
  }
  function maintenant() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  /* Recherche négamax avec élagage alpha-bêta.
     o = {pos, noeuds, limite, stop, table} */
  function chercher(o, prof, alpha, beta, q, ply) {
    var pos = o.pos, c, k;
    o.noeuds++;
    if (o.limite && (o.noeuds & 2047) === 0 && maintenant() > o.limite) o.stop = true;
    if (o.stop) return 0;
    var adv = 3 - q, forcee = -1, menaces = 0;
    for (c = 0; c < COLS; c++) {
      if (pos.h[c] >= ROWS) continue;
      if (pos.gagnerait(c, q)) return GAGNE - ply;
      if (pos.gagnerait(c, adv)) { menaces++; forcee = c; }
    }
    if (pos.coups >= NB - 1) return 0; // le dernier jeton ne peut plus rien gagner
    if (menaces >= 2) return -(GAGNE - ply - 1);
    if (prof <= 0) return q === 1 ? pos.score : -pos.score;
    var T = o.table, slot = 0, coupTT = -1, alpha0 = alpha;
    if (T) {
      slot = pos.k1 & TT_MASK;
      if (T.k[slot] === pos.k2 && T.d[slot] >= 0) {
        coupTT = T.m[slot];
        if (T.d[slot] >= prof) {
          var tv = T.v[slot];
          if (tv > GAGNE / 2) tv -= ply; else if (tv < -GAGNE / 2) tv += ply;
          if (T.f[slot] === 0) return tv;
          if (T.f[slot] === 1 && tv > alpha) alpha = tv;
          else if (T.f[slot] === 2 && tv < beta) beta = tv;
          if (alpha >= beta) return tv;
        }
      }
    }
    var liste = o.listes[ply] || (o.listes[ply] = new Int8Array(COLS));
    var nb = 0, H = o.hist, base = q * NB;
    if (forcee >= 0) { liste[nb++] = forcee; }
    else {
      if (coupTT >= 0 && pos.h[coupTT] < ROWS) liste[nb++] = coupTT;
      var debut = nb;
      for (k = 0; k < COLS; k++) {
        c = ORDRE[k];
        if (c === coupTT || pos.h[c] >= ROWS) continue;
        // tri par insertion selon l’historique des coupures (centre à égalité)
        var sc = H[base + (ROWS - 1 - pos.h[c]) * COLS + c], j = nb;
        while (j > debut && H[base + (ROWS - 1 - pos.h[liste[j - 1]]) * COLS + liste[j - 1]] < sc) { liste[j] = liste[j - 1]; j--; }
        liste[j] = c;
        nb++;
      }
    }
    var best = -GAGNE * 2, bestC = liste[0];
    for (k = 0; k < nb; k++) {
      c = liste[k];
      pos.jouer(c, q);
      var v = -chercher(o, prof - 1, -beta, -alpha, adv, ply + 1);
      pos.annuler(c);
      if (o.stop) return 0;
      if (v > best) { best = v; bestC = c; }
      if (v > alpha) alpha = v;
      if (alpha >= beta) {
        H[base + (ROWS - 1 - pos.h[c]) * COLS + c] += prof * prof;
        break;
      }
    }
    if (T) {
      var sv = best;
      if (sv > GAGNE / 2) sv += ply; else if (sv < -GAGNE / 2) sv -= ply;
      if (T.d[slot] <= prof || T.k[slot] !== pos.k2) {
        T.k[slot] = pos.k2; T.v[slot] = sv; T.d[slot] = prof; T.m[slot] = bestC;
        T.f[slot] = best <= alpha0 ? 2 : (best >= beta ? 1 : 0);
      }
    }
    return best;
  }

  /* Analyse de chaque coup possible à la racine : [{col, val, offre}] où
     « offre » signale un coup qui laisse une victoire immédiate à l’adversaire. */
  function analyseRacine(grid, q, prof, opts) {
    var pos = new Position(grid, q, opts.parite ? PARITE : 0);
    var o = { pos: pos, noeuds: 0, limite: 0, stop: false, table: opts.table ? tt() : null, listes: [], hist: new Int32Array(3 * NB) };
    var coups = [];
    for (var k = 0; k < COLS; k++) {
      var c = ORDRE[k];
      if (pos.h[c] >= ROWS) continue;
      if (pos.gagnerait(c, q)) { coups.push({ col: c, val: GAGNE, offre: false }); continue; }
      pos.jouer(c, q);
      var offre = false;
      for (var c2 = 0; c2 < COLS; c2++) if (pos.gagnerait(c2, 3 - q)) { offre = true; break; }
      pos.annuler(c);
      coups.push({ col: c, val: 0, offre: offre });
    }
    if (coups.some(function (cp) { return cp.val === GAGNE; })) return { coups: coups, prof: 0, noeuds: 0, ms: 0, msMin: 0 };
    var t0 = maintenant(), faite = 0, meilleur = null, msMin = 0;
    var budget = opts.budget || 0, minProf = opts.minProf || prof;
    for (var d = opts.iteratif ? Math.min(2, prof) : prof; d <= prof; d++) {
      o.stop = false;
      o.limite = budget && d > minProf ? t0 + budget * 2.2 : 0;
      // le meilleur coup de l’itération précédente passe en tête
      if (meilleur !== null) {
        coups.sort(function (a, b) { return a.col === meilleur ? -1 : (b.col === meilleur ? 1 : 0); });
      }
      var alpha = -GAGNE * 2, vals = [];
      for (k = 0; k < coups.length; k++) {
        var cp = coups[k];
        pos.jouer(cp.col, q);
        var v = -chercher(o, d - 1, -GAGNE * 2, opts.exact ? GAGNE * 2 : -alpha, 3 - q, 1);
        pos.annuler(cp.col);
        if (o.stop) break;
        vals.push(v);
        if (v > alpha) alpha = v;
      }
      if (o.stop) break; // itération inachevée : on garde la précédente
      for (k = 0; k < coups.length; k++) coups[k].val = vals[k];
      faite = d;
      if (d === minProf) msMin = maintenant() - t0;
      var top = -GAGNE * 3;
      coups.forEach(function (cp2) { if (cp2.val > top) { top = cp2.val; meilleur = cp2.col; } });
      if (Math.abs(top) > GAGNE / 2) break; // partie résolue
      if (budget && d >= minProf && maintenant() - t0 > budget) break;
    }
    return { coups: coups, prof: faite, noeuds: o.noeuds, ms: maintenant() - t0, msMin: msMin };
  }

  /* Filtre de bon sens commun à tous les niveaux sauf « facile » : on ne
     choisit jamais un coup qui offre la victoire immédiate s’il en existe un
     autre, et quand tout est perdu on retarde la défaite au maximum. */
  function sansCadeau(coups) {
    var sains = coups.filter(function (cp) { return !cp.offre; });
    return sains.length ? sains : coups;
  }
  function auHasard(liste) { return liste[Math.floor(Math.random() * liste.length)]; }

  function coupFacile(grid, q) {
    var pos = new Position(grid, q), libres = [], c;
    for (c = 0; c < COLS; c++) if (pos.h[c] < ROWS) libres.push(c);
    if (!libres.length) return -1;
    var gagnants = libres.filter(function (cc) { return pos.gagnerait(cc, q); });
    if (gagnants.length && Math.random() < 0.9) return gagnants[0];
    var parades = libres.filter(function (cc) { return pos.gagnerait(cc, 3 - q); });
    if (parades.length && Math.random() < 0.6) return parades[0];
    // un débutant : attiré par le milieu, et une fois sur trois il ne voit
    // pas qu’il offre la victoire
    var voir = Math.random() < 0.65;
    var ok = libres.filter(function (cc) {
      if (!voir) return true;
      pos.jouer(cc, q);
      var offre = false;
      for (var c2 = 0; c2 < COLS; c2++) if (pos.gagnerait(c2, 3 - q)) offre = true;
      pos.annuler(cc);
      return !offre;
    });
    if (!ok.length) ok = libres;
    var poids = ok.map(function (cc) { return 1 + CENTRE[cc] * 1.5; });
    var tot = poids.reduce(function (a, b) { return a + b; }, 0), x = Math.random() * tot;
    for (var i = 0; i < ok.length; i++) { x -= poids[i]; if (x <= 0) return ok[i]; }
    return ok[ok.length - 1];
  }

  function coupIA(state, me, niveau) {
    var q = me === 0 ? 1 : 2;
    var grid = state.grid, poses = 0;
    for (var i = 0; i < NB; i++) if (grid[i]) poses++;
    if (niveau === 'facile') return coupFacile(grid, q);
    if (niveau === 'difficile') {
      if (poses === 0) return 3;
      var an = analyseRacine(grid, q, 16, { table: true, iteratif: true, minProf: 8, budget: 90, parite: true });
      var cs = sansCadeau(an.coups), top = -GAGNE * 3, choix = cs[0];
      cs.forEach(function (cp) { if (cp.val > top) { top = cp.val; choix = cp; } });
      if (top < -GAGNE / 2) {
        // tout est perdu : valeurs exactes pour résister le plus longtemps
        an = analyseRacine(grid, q, 8, { table: false, exact: true });
        cs = sansCadeau(an.coups); top = -GAGNE * 3;
        cs.forEach(function (cp) { if (cp.val > top) { top = cp.val; choix = cp; } });
      }
      return choix.col;
    }
    // moyen : il voit 4 demi-coups, varie ses ouvertures, ne fait pas de cadeau
    if (poses < 2) {
      var x = Math.random();
      var ouv = x < 0.5 ? 3 : (x < 0.75 ? 2 : 4);
      if (ligneLibre(grid, ouv) !== -1) return ouv;
    }
    var am = analyseRacine(grid, q, 4, { table: false, exact: true });
    var cm = sansCadeau(am.coups), topm = -GAGNE * 3;
    cm.forEach(function (cp) { if (cp.val > topm) topm = cp.val; });
    var marge = Math.abs(topm) > GAGNE / 2 ? 0 : 6;
    var bons = cm.filter(function (cp) { return cp.val >= topm - marge; });
    return auHasard(bons).col;
  }

  /* ================= Le module ================= */
  var mod = {
    id: 'p4',
    nom: 'Puissance 4',
    icone: '🔴',
    desc: 'Alignez 4 jetons. Série en 1, 3 ou 5 manches gagnantes.',
    regles: '<p><strong>🎯 Le but :</strong> aligner 4 jetons de votre couleur — à l’horizontale, à la verticale ou en diagonale — avant l’adversaire.</p><p><strong>Comment jouer :</strong> touchez une colonne, votre jeton tombe tout en bas. Chacun son tour !</p><p><strong>La série :</strong> avant le premier jeton, choisissez 1, 3 ou 5 manches gagnantes. Le premier qui les atteint remporte la partie ; celui qui a perdu la manche commence la suivante… à tour de rôle.</p>',
    min: 2, max: 2,
    hotseat: true, hidden: false, netOnly: false,
    niveaux: ['facile', 'moyen', 'difficile'],

    create: function (names) {
      var state = {
        id: Math.floor(Math.random() * 1e9),
        players: names.map(function (n) { return { name: n, wins: 0 }; }),
        starter: 0,
        opts: { manches: 3 },
        manche: 1,
        serieGagnee: false,
        fini: false
      };
      newRound(state);
      return state;
    },

    turnOf: function (state) { return state.roundOver || state.fini ? -1 : state.current; },
    over: function (state) { return !!state.fini; },
    scoreOf: function (state, i) { return state.players[i].wins; },
    gagnants: function (state) {
      var n = manches(state), g = [];
      state.players.forEach(function (p, i) { if (p.wins >= n) g.push(i); });
      return g;
    },
    summary: function (state) {
      var g = mod.gagnants(state);
      var rows = state.players.map(function (p, i) { return { n: p.name, s: p.wins, i: i }; })
        .sort(function (a, b) { return b.s - a.s; });
      return rows.map(function (r) {
        return '<div class="final-line"><span>' + (r.i === 0 ? '🔴 ' : '🟡 ') + GG.esc(r.n) +
          '</span><strong>' + r.s + ' manche' + (r.s > 1 ? 's' : '') + '</strong></div>';
      }).join('') + (g.length ? '<h3>🏆 ' + GG.esc(state.players[g[0]].name) + ' remporte la série !</h3>' : '');
    },

    apply: function (state, player, action) {
      action = action || {};
      if (action.t === 'fin') {
        // minuteur d’autorité (-1) ou bouton « voir le résultat »
        if (state.fini) return player === -1 ? { ok: true } : { ok: false, error: 'La partie est finie.' };
        if (!state.serieGagnee) return player === -1 ? { ok: true } : { ok: false, error: 'La série continue.' };
        state.fini = true;
        return { ok: true };
      }
      if (state.fini) return { ok: false, error: 'La partie est finie.' };
      if (action.t === 'serie') {
        var n = action.n | 0;
        if (SERIES.indexOf(n) === -1) return { ok: false, error: 'Série inconnue.' };
        if (state.manche !== 1 || state.coups > 0 || state.roundOver) {
          return { ok: false, error: 'La série est déjà lancée.' };
        }
        state.opts = { manches: n };
        return { ok: true };
      }
      if (action.t === 'again') {
        if (!state.roundOver) return { ok: false, error: 'La manche n’est pas finie.' };
        if (state.serieGagnee) return { ok: false, error: 'La série est terminée.' };
        state.starter = 1 - state.starter;
        state.manche = (state.manche || 1) + 1;
        newRound(state);
        return { ok: true };
      }
      if (action.t !== 'drop') return { ok: false, error: 'Action inconnue.' };
      if (state.roundOver) return { ok: false, error: 'Manche terminée.' };
      if (player !== state.current) return { ok: false, error: 'Ce n’est pas votre tour.' };
      var col = action.col | 0;
      if (col < 0 || col >= COLS) return { ok: false, error: 'Colonne invalide.' };
      var row = ligneLibre(state.grid, col);
      if (row === -1) return { ok: false, error: 'Colonne pleine.' };
      var idx = row * COLS + col;
      state.grid[idx] = player === 0 ? 'R' : 'J';
      state.coups = (state.coups || 0) + 1;
      state.dernier = idx;
      var line = winLine(state.grid, idx);
      if (line) {
        state.roundOver = true;
        state.winner = player;
        state.line = line;
        state.players[player].wins++;
        if (state.players[player].wins >= manches(state)) {
          state.serieGagnee = true;
          // le temps de voir l’alignement briller, puis la fête de la coque
          return { ok: true, timer: { ms: 2600, action: { t: 'fin' } } };
        }
      } else if (state.grid.every(function (c) { return c; })) {
        state.roundOver = true;
        state.draw = true;
      } else {
        state.current = 1 - state.current;
      }
      return { ok: true };
    },

    /* L’adversaire IA, trois caractères :
       - facile : attiré par le milieu, il rate parfois une parade ;
       - moyen : il voit 4 demi-coups, ne fait jamais de cadeau ;
       - difficile : recherche négamax profonde (8 demi-coups au moins,
         jusqu’à 16), table de transposition, centre d’abord. */
    bot: function (state, me, ctx) {
      if (state.roundOver || state.fini) return null;
      if (state.current !== me) return null;
      var niveau = (ctx && ctx.niveau) || state.niveauIA || 'moyen';
      var col = coupIA(state, me, niveau);
      if (col < 0) return null;
      return { t: 'drop', col: col };
    },

    render: function (el, ctx) {
      var s = ctx.state;
      var fx = GG.fx, sfx = GG.sfx;
      var solo = ctx.mode === 'local' && !!s.niveauIA;
      var hotseat = ctx.mode === 'local' && !s.niveauIA;
      var mine = !s.roundOver && !s.fini && ctx.me === s.current;
      var nMan = manches(s);
      var coul = function (i) { return i === 0 ? 'red' : 'yellow'; };

      // ---- ce qui vient de changer (pour n’animer que ça, une seule fois) ----
      var cle = s.id + ':' + (s.manche || 1);
      var avant = el._v2 && el._v2.jeu === 'p4' ? el._v2 : null;
      var nouveau = avant && avant.cle === cle && s.coups === avant.coups + 1 && s.dernier >= 0;
      var finManche = nouveau && s.roundOver;
      el._v2 = { jeu: 'p4', cle: cle, coups: s.coups };

      var html = '<div class="p4-v2' + (s.roundOver && !s.draw ? ' gagne' : '') + '">';

      // ---- série : choix avant le premier jeton, puis le compteur ----
      if ((s.manche || 1) === 1 && !s.coups && !s.roundOver) {
        html += '<div class="p4-serie choix"><span>Série en</span>';
        SERIES.forEach(function (n) {
          html += '<button class="p4-serie-btn' + (n === nMan ? ' on' : '') + '" data-serie="' + n + '">' +
            n + '</button>';
        });
        html += '<span>manche' + (nMan > 1 ? 's' : '') + ' gagnante' + (nMan > 1 ? 's' : '') + '</span></div>';
      } else {
        html += '<div class="p4-serie">';
        [0, 1].forEach(function (i) {
          var pips = '';
          for (var k = 0; k < nMan; k++) {
            pips += '<i class="' + (k < s.players[i].wins ? 'on ' + coul(i) : '') + '"></i>';
          }
          html += '<span class="p4-pips p' + i + '">' + (i === 1 ? pips : '') +
            '<b>' + GG.esc(s.players[i].name) + '</b>' + (i === 0 ? pips : '') + '</span>';
          if (i === 0) html += '<span class="p4-manche">Manche ' + (s.manche || 1) + '</span>';
        });
        html += '</div>';
      }

      // ---- message ----
      var msg;
      if (s.roundOver) {
        if (s.draw) msg = '🤝 Grille pleine : manche nulle !';
        else if (s.serieGagnee) msg = '🏆 ' + GG.esc(s.players[s.winner].name) + ' remporte la série !';
        else msg = '🏆 ' + GG.esc(s.players[s.winner].name) + ' gagne la manche !';
      } else if (mine) {
        msg = '<span class="p4-disc mini ' + coul(s.current) + '"></span> ' +
          (hotseat ? 'À toi, <b>' + GG.esc(s.players[s.current].name) + '</b> !' : 'À vous de jouer !');
      } else {
        msg = '<span class="p4-disc mini ' + coul(s.current) + '"></span> ' +
          (solo ? GG.esc(s.players[s.current].name) + ' réfléchit<span class="p4-points"><i>.</i><i>.</i><i>.</i></span>'
            : 'Au tour de ' + GG.esc(s.players[s.current].name) + '…');
      }
      html += '<p class="mini-msg p4-msg">' + msg + '</p>';

      // ---- le plateau ----
      html += '<div class="p4-plateau"><div class="p4-apercu">';
      for (var a = 0; a < COLS; a++) {
        html += '<span class="p4-fant ' + coul(s.current) + '" data-fcol="' + a + '"></span>';
      }
      html += '</div><div class="p4-board" data-pret="1"><div class="p4-grille">';
      for (var r = 0; r < ROWS; r++) {
        for (var c = 0; c < COLS; c++) {
          var i2 = r * COLS + c, v = s.grid[i2];
          var win = s.line.indexOf(i2) !== -1;
          var cls = 'p4-disc ' + (v === 'R' ? 'red' : 'yellow');
          if (win) cls += ' win';
          if (i2 === s.dernier && !s.roundOver) cls += ' last';
          if (nouveau && i2 === s.dernier) cls += ' drop';
          html += '<div class="p4-cell' + (win ? ' win' : '') + '" data-col="' + c + '" data-row="' + r + '">' +
            (v ? '<span class="' + cls + '" style="--r:' + (r + 1.35) + ';--t:' + (0.3 + 0.055 * r).toFixed(3) + 's"></span>' : '') +
            '</div>';
        }
      }
      html += '</div>' + FACADE + '<div class="p4-colhl"></div>';
      if (s.line.length >= 4) {
        var l0 = s.line[0], l1 = s.line[s.line.length - 1];
        var x0 = 30 + 50 + 100 * (l0 % COLS), y0 = 30 + 50 + 100 * Math.floor(l0 / COLS);
        var x1 = 30 + 50 + 100 * (l1 % COLS), y1 = 30 + 50 + 100 * Math.floor(l1 / COLS);
        html += '<svg class="p4-ligne" viewBox="0 0 760 660" aria-hidden="true">';
        s.line.forEach(function (li) {
          html += '<circle class="p4-anneau" cx="' + (80 + 100 * (li % COLS)) + '" cy="' +
            (80 + 100 * Math.floor(li / COLS)) + '" r="43"/>';
        });
        html += '<line x1="' + x0 + '" y1="' + y0 + '" x2="' + x1 + '" y2="' + y1 + '" pathLength="1"/></svg>';
      }
      html += '</div><div class="p4-pieds"><i></i><i></i></div></div>';

      // ---- actions ----
      if (s.roundOver) {
        html += '<div class="mini-actions">' + (s.serieGagnee
          ? '<button class="btn big jeu" data-a="fin">🎉 Voir le résultat</button>'
          : '<button class="btn big primary" data-a="again" disabled>Manche suivante ▶</button>') + '</div>';
      }
      html += '</div>';
      el.innerHTML = html;

      // ---- anti double-appui ----
      // Sur un seul téléphone, le jeton posé redessine l’écran pour
      // l’adversaire sans que la grille bouge : un double appui (même sur la
      // colonne voisine) jouerait son jeton. On gèle donc TOUT le plateau un
      // court instant à chaque changement de joueur ; et un seul coup par rendu.
      var board = el.querySelector('.p4-board');
      var gen = (el._p4Gen || 0) + 1;
      el._p4Gen = gen;
      if (el._p4Man !== cle) el._p4Gel = 0; // nouvelle manche : rien à geler
      else if (ctx.mode === 'local' && el._p4Cur !== s.current) el._p4Gel = Date.now() + 450;
      el._p4Cur = s.current;
      el._p4Man = cle;
      var gelReste = (el._p4Gel || 0) - Date.now();
      if (gelReste > 0) {
        board.setAttribute('data-pret', '0');
        setTimeout(function () { if (el._p4Gen === gen) board.setAttribute('data-pret', '1'); }, gelReste + 10);
      }
      function libre() { return el._p4Gen === gen && !el._p4Joue && Date.now() >= (el._p4Gel || 0); }
      el._p4Joue = false;

      // ---- aperçu de la colonne visée ----
      var fants = el.querySelectorAll('.p4-fant');
      var colhl = el.querySelector('.p4-colhl');
      function colDe(ev) {
        var rc = board.getBoundingClientRect();
        var x = (ev.clientX - rc.left) / rc.width;
        var cc = Math.floor((x - 30 / 760) / (700 / 760) * COLS);
        return cc < 0 ? 0 : (cc >= COLS ? COLS - 1 : cc);
      }
      var cellules = el.querySelectorAll('.p4-cell');
      function vise(cc) {
        if (!mine) return;
        for (var f = 0; f < fants.length; f++) fants[f].classList.toggle('on', f === cc);
        var rr = ligneLibre(s.grid, cc);
        for (var q = 0; q < cellules.length; q++) cellules[q].classList.toggle('cible', q === rr * COLS + cc);
        colhl.style.setProperty('--c', cc);
        colhl.classList.add('on');
      }
      function oublie() {
        for (var f = 0; f < fants.length; f++) fants[f].classList.remove('on');
        for (var q = 0; q < cellules.length; q++) cellules[q].classList.remove('cible');
        colhl.classList.remove('on');
      }
      board.addEventListener('pointermove', function (ev) { if (ev.pointerType === 'mouse') vise(colDe(ev)); });
      board.addEventListener('pointerdown', function (ev) { vise(colDe(ev)); });
      board.addEventListener('pointerleave', oublie);

      function joue(col) {
        if (!mine || !libre()) return;
        if (ligneLibre(s.grid, col) === -1) {
          sfx.play('wrong', { volume: 0.5 });
          GG.haptic('error');
          fx.shake(board, 0.5);
          return;
        }
        el._p4Joue = true;
        if (ctx.act({ t: 'drop', col: col }) === false) el._p4Joue = false;
      }
      el.querySelectorAll('.p4-cell').forEach(function (cell) {
        cell.addEventListener('click', function () { joue(parseInt(cell.dataset.col, 10)); });
      });

      el.querySelectorAll('[data-serie]').forEach(function (b) {
        b.addEventListener('click', function () {
          if (!libre()) return;
          sfx.play('toggle');
          ctx.act({ t: 'serie', n: parseInt(b.dataset.serie, 10) });
        });
      });
      var again = el.querySelector('[data-a="again"]');
      if (again) {
        // le bouton apparaît sous le doigt qui vient de jouer : armé après un instant
        setTimeout(function () { again.disabled = false; }, finManche ? 700 : 300);
        again.addEventListener('click', function () {
          if (!libre()) return;
          el._p4Joue = true;
          ctx.act({ t: 'again' });
        });
      }
      var fin = el.querySelector('[data-a="fin"]');
      if (fin) fin.addEventListener('click', function () { if (libre()) { el._p4Joue = true; ctx.act({ t: 'fin' }); } });

      // ---- effets du coup qui vient d’être joué ----
      if (nouveau) {
        var disc = el.querySelector('.p4-disc.drop');
        var rDer = Math.floor(s.dernier / COLS);
        var tChute = (0.3 + 0.055 * rDer) * 1000;
        setTimeout(function () {
          sfx.play('drop', { pitch: 1 + (ROWS - 1 - rDer) * 0.04 });
          GG.haptic('light');
        }, fx.reduced() ? 0 : tChute * 0.6);
        if (finManche) {
          setTimeout(function () {
            if (el._p4Gen !== gen) return;
            var p4v = el.querySelector('.p4-v2');
            if (p4v) p4v.classList.add('trace');
            if (s.draw) { sfx.play('draw'); return; }
            var gagnantIci = hotseat || s.winner === ctx.me;
            if (gagnantIci) {
              sfx.play(s.serieGagnee ? 'fanfare' : 'success');
              GG.haptic('success');
              fx.confetti({ count: s.serieGagnee ? 70 : 90, from: board, duration: 2200 });
            } else {
              sfx.play('wrong');
              GG.haptic('warning');
            }
            if (disc) fx.burst(disc, { count: 14, shape: 'star', colors: [s.winner === 0 ? '#ff5a5f' : '#ffd23f', '#ffffff'] });
          }, fx.reduced() ? 0 : tChute + 120);
        }
      } else if (s.roundOver) {
        var p4v2 = el.querySelector('.p4-v2');
        if (p4v2) p4v2.classList.add('trace', 'deja');
      }
    },

    // exposé pour les tests
    _analyse: analyseRacine,
    _coupIA: coupIA,
    _razTable: function () { TT = null; }
  };

  /* La façade du plateau : un rectangle de plastique percé de 42 trous
     (règle de remplissage « evenodd »), avec reflets et biseaux. */
  var FACADE = (function () {
    var d = 'M34 0H726A34 34 0 0 1 760 34V626A34 34 0 0 1 726 660H34A34 34 0 0 1 0 626V34A34 34 0 0 1 34 0Z';
    var biseaux = '';
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var cx = 80 + 100 * c, cy = 80 + 100 * r;
        d += 'M' + (cx - 40) + ' ' + cy + 'a40 40 0 1 0 80 0a40 40 0 1 0 -80 0Z';
        biseaux += '<circle cx="' + cx + '" cy="' + cy + '" r="41.5"/>';
      }
    }
    return '<svg class="p4-front" viewBox="0 0 760 660" aria-hidden="true">' +
      '<defs><linearGradient id="p4g-corps" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#4f8dff"/><stop offset=".45" stop-color="#2b63e6"/>' +
      '<stop offset="1" stop-color="#1a3fb0"/></linearGradient>' +
      '<linearGradient id="p4g-reflet" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#fff" stop-opacity=".34"/><stop offset=".35" stop-color="#fff" stop-opacity=".06"/>' +
      '<stop offset=".36" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>' +
      '<linearGradient id="p4g-biseau" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#0b1f66" stop-opacity=".85"/><stop offset=".55" stop-color="#16338f" stop-opacity=".3"/>' +
      '<stop offset="1" stop-color="#9cc0ff" stop-opacity=".9"/></linearGradient></defs>' +
      '<path d="' + d + '" fill="url(#p4g-corps)" fill-rule="evenodd"/>' +
      '<path d="' + d + '" fill="url(#p4g-reflet)" fill-rule="evenodd"/>' +
      '<g fill="none" stroke="url(#p4g-biseau)" stroke-width="5">' + biseaux + '</g>' +
      '<rect x="3" y="3" width="754" height="654" rx="31" fill="none" stroke="#a9c8ff" stroke-opacity=".55" stroke-width="3"/>' +
      '</svg>';
  })();

  GG.register(mod);
  if (typeof module === 'object' && module.exports) module.exports = mod;
})(typeof self !== 'undefined' ? self : globalThis);
