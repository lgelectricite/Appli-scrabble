/*
 * GGgames — Données et moteur communs des Mots fléchés ET des Mots croisés.
 *
 *  1. LE LEXIQUE (en bas du fichier) : près de 3 000 mots français courants de
 *     2 à 10 lettres, écrits à la main, chacun avec 3 définitions de difficulté
 *     croissante : « facile » (directe), « moyenne », « difficile » (piège, jeu
 *     de mots, comme dans la presse). Un « ° » devant le mot le réserve aux
 *     grilles corsées (mot de cruciverbiste).
 *  2. LE GÉNÉRATEUR : remplit une grille ligne par ligne à l’aide d’un arbre des
 *     mots (trie) ; les cases-définitions (fléchés) ou les cases noires (croisés)
 *     se placent là où il faut. Tout est DÉTERMINISTE à partir d’une graine :
 *     la grille n° 12 de force 3 est la même sur tous les téléphones, sans
 *     stocker une seule grille.
 *  3. LE CHOIX DES DÉFINITIONS : difficulté selon la force, jamais deux fois la
 *     même définition dans une grille, définitions courtes dans les cases
 *     partagées.
 *  4. LA BOÎTE À OUTILS D’AFFICHAGE commune : clavier fixe, bandeau de la
 *     définition courante, vue zoomable et déplaçable, saisie dans la grille,
 *     chrono.
 *
 * Aucune dépendance, ES5, fonctionne aussi dans Node (tests) : la partie
 * affichage n’est appelée que depuis render().
 */
(function (root) {
  'use strict';
  var GG = root.GG || (root.GG = {});

  /* ================================================================
   * 1. Outils
   * ================================================================ */

  var imul = Math.imul || function (a, b) {
    var ah = (a >>> 16) & 0xffff, al = a & 0xffff, bh = (b >>> 16) & 0xffff, bl = b & 0xffff;
    return ((al * bl) + (((ah * bl + al * bh) << 16) >>> 0) | 0);
  };
  var clz32 = Math.clz32 || function (x) {
    x = x >>> 0;
    if (x === 0) return 32;
    var n = 0;
    while (!(x & 0x80000000)) { x <<= 1; n++; }
    return n;
  };
  function entiers(n, v) { // Int32Array rempli (fill n’est pas ES5)
    var a = new Int32Array(n);
    if (v) for (var i = 0; i < n; i++) a[i] = v;
    return a;
  }

  /* générateur pseudo-aléatoire (mulberry32) : même graine, même suite */
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = imul(a ^ (a >>> 15), 1 | a);
      t = (t + imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /* empreinte d’un texte (FNV-1a) : sert de graine */
  function hash(str) {
    var h = 0x811c9dc5;
    str = String(str);
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = imul(h, 0x01000193);
    }
    return h >>> 0;
  }
  function norm(s) {
    return String(s || '').toUpperCase()
      .replace(/Œ/g, 'OE').replace(/Æ/g, 'AE')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Z]/g, '');
  }
  /* date locale « AAAA-MM-JJ » (le défi du jour change à minuit chez soi) */
  function aujourdhui(d) {
    d = d || new Date();
    var m = d.getMonth() + 1, j = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (j < 10 ? '0' : '') + j;
  }
  function dateValide(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s); }
  /* jour de la semaine d’une date « AAAA-MM-JJ » (0 = dimanche), sans fuseau */
  function jourSemaine(s) {
    var p = s.split('-');
    return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay();
  }
  var JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  var MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août',
    'septembre', 'octobre', 'novembre', 'décembre'];
  function dateLisible(s) {
    var p = s.split('-');
    return JOURS[jourSemaine(s)] + ' ' + (+p[2]) + ' ' + MOIS[+p[1] - 1];
  }
  function chrono(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    var m = Math.floor(s / 60);
    s = s % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  function duree(sec) {
    var m = Math.floor(sec / 60);
    return (m ? m + ' min ' : '') + (sec % 60) + ' s';
  }

  /* ================================================================
   * 2. Le lexique
   * ================================================================ */

  var LEX = null;
  function lexique() {
    if (LEX) return LEX;
    var brut = lexiqueBrut();
    var mots = [], defs = [], rare = [], index = {};
    for (var i = 0; i < brut.length; i++) {
      var p = brut[i].split('|');
      var w = p[0], r = false;
      if (w.charAt(0) === '°') { w = w.slice(1); r = true; }
      index[w] = mots.length;
      mots.push(w);
      rare.push(r);
      defs.push(p.slice(1));
    }
    LEX = { mots: mots, defs: defs, rare: rare, index: index };
    return LEX;
  }

  /* ================================================================
   * 3. Préparation : arbre des mots, familles (singulier/pluriel…)
   * ================================================================ */

  var ML = 16; // longueur maximale indexée
  function arbre(words) {
    var cap = 1, i, j;
    for (i = 0; i < words.length; i++) cap += words[i].length;
    var child = entiers(cap * 26, -1), wordAt = entiers(cap, -1);
    var lenMask = new Int32Array(cap), cnt = new Int32Array(cap * ML);
    var n = 1;
    for (i = 0; i < words.length; i++) {
      var w = words[i], node = 0, L = w.length;
      lenMask[0] |= 1 << L; cnt[L]++;
      for (var k = 0; k < L; k++) {
        var x = w.charCodeAt(k) - 65;
        var nx = child[node * 26 + x];
        if (nx < 0) { nx = n++; child[node * 26 + x] = nx; }
        node = nx;
        lenMask[node] |= 1 << L; cnt[node * ML + L]++;
      }
      wordAt[node] = i;
    }
    var kids = new Int32Array(n), cum = new Int32Array(n * ML);
    for (i = 0; i < n; i++) {
      var km = 0, acc = 0;
      for (j = 0; j < 26; j++) if (child[i * 26 + j] >= 0) km |= 1 << j;
      kids[i] = km;
      for (j = 0; j < ML; j++) { acc += cnt[i * ML + j]; cum[i * ML + j] = acc; }
    }
    return { child: child, wordAt: wordAt, lenMask: lenMask, cum: cum, kids: kids, n: n };
  }
  /* un même mot ne revient jamais deux fois dans une grille, ni sa famille
     proche (AMI / AMIS / AMIE, CHANTE / CHANTER…) */
  function familles(words) {
    var fam = new Int32Array(words.length), idx = {}, i;
    for (i = 0; i < words.length; i++) { idx[words[i]] = i; fam[i] = i; }
    function find(a) { while (fam[a] !== a) { fam[a] = fam[fam[a]]; a = fam[a]; } return a; }
    function union(a, b) { a = find(a); b = find(b); if (a !== b) fam[b] = a; }
    var SUF = ['S', 'E', 'ES', 'X', 'R', 'ER', 'NT', 'T'], SUF2 = ['E', 'ER', 'IR', 'RE', 'S', 'ES', 'EE'];
    for (i = 0; i < words.length; i++) {
      var w = words[i], k;
      if (w.length >= 3) {
        for (k = 0; k < SUF.length; k++) if (idx[w + SUF[k]] !== undefined) union(i, idx[w + SUF[k]]);
      }
      if (w.length >= 5) {
        var stem = w.slice(0, w.length - 1);
        for (k = 0; k < SUF2.length; k++) if (idx[stem + SUF2[k]] !== undefined) union(i, idx[stem + SUF2[k]]);
      }
    }
    for (i = 0; i < words.length; i++) fam[i] = find(i);
    return fam;
  }
  var PREP = {};
  /* ensemble de mots utilisable par le générateur (mis en cache par clé) */
  function preparer(cle, garder) {
    if (PREP[cle]) return PREP[cle];
    var L = lexique(), words = [], ids = [];
    for (var i = 0; i < L.mots.length; i++) {
      if (garder(L.mots[i], L.rare[i])) { words.push(L.mots[i]); ids.push(i); }
    }
    var codes = [];
    for (i = 0; i < words.length; i++) {
      var c = [];
      for (var k = 0; k < words[i].length; k++) c.push(words[i].charCodeAt(k) - 65);
      codes.push(c);
    }
    PREP[cle] = { words: words, ids: ids, codes: codes, trie: arbre(words), fam: familles(words) };
    return PREP[cle];
  }

  /* ================================================================
   * 4. Le générateur (fléchés : o.mode = 'fleches' ; croisés : 'croises')
   *
   * On remplit la grille ligne par ligne. Sur une ligne, chaque « segment »
   * (après une case-définition / noire, ou au bord) reçoit : une case
   * définition/noire, une lettre isolée (elle appartiendra à un mot vertical),
   * ou un mot entier suivi d’une case définition/noire. Pour chaque colonne on
   * suit le mot vertical en cours dans l’arbre des mots : une lettre n’est
   * permise que si un mot peut encore s’achever avant le bas de la grille.
   * Les candidats d’un segment sont notés (souplesse des verticales, longueur
   * voulue, hasard contrôlé) ; on essaie les meilleurs et on revient en arrière
   * au besoin, dans une limite de pas : au-delà, on repart d’une autre graine
   * (dérivée de la première : le résultat reste déterministe).
   *
   * Règles des fléchés « comme en kiosque » :
   *  - ligne 0 : case-définition sur les colonnes paires, lettres sur les
   *    impaires ; colonne 0 : case-définition sur les lignes paires ;
   *  - chaque mot part de la case-définition voisine (flèche droite) ou, au
   *    bord, de la case au-dessus / à gauche (flèche coudée) : jamais plus de
   *    deux définitions par case ;
   *  - aucune case perdue : chaque case-définition sert au moins une fois,
   *    chaque lettre appartient au moins à un mot.
   * Règles des croisés : cases noires libres mais jamais collées deux à deux,
   * au moins 70 % des cases blanches croisées (dans deux mots).
   * ================================================================ */

  function generer(P, o) {
    var W = o.W, H = o.H, N = W * H, FL = o.mode !== 'croises';
    var T = P.trie, child = T.child, wordAt = T.wordAt, lenMask = T.lenMask, cum = T.cum, kids = T.kids;
    var fam = P.fam, codes = P.codes;
    var rnd = rng(o.seed);
    var pref = o.pref, K = o.K || 4, maxSteps = o.maxSteps || 800;
    var pen2 = o.pen2 === undefined ? 0.25 : o.pen2, pD = o.pD || 0.1;
    var LO = o.lo || [0.45, 0.75, 0.4, 1.4];
    var maxB = o.maxB || N, minCroise = o.minCroise || 0.7, penV = o.penV === undefined ? (FL ? 0.45 : 0.2) : o.penV;
    var type = new Int8Array(N), letter = new Int8Array(N), acrossLen = new Int8Array(N);
    var forceL = new Int16Array(N);
    var used = new Uint8Array(P.words.length);
    var colNode = entiers(W, -1), colLen = new Int32Array(W);
    var placed = [], steps = 0, abort = false, nD = 0;
    var nextT = new Int32Array(N * 26), flexT = new Float64Array(N * 26), maskT = new Int32Array(N);
    var rowVer = new Int32Array(H), verSeq = 0, cache = [];
    for (var q = 0; q < N; q++) cache.push(null);

    function lg(v) { return Math.log(1 + v); }
    function isUsed(wi) { return used[fam[wi]] !== 0; }
    function setUsed(wi, v) { used[fam[wi]] = v; }
    function comp(node, a, b) { // nombre de mots de longueur a..b sous ce nœud
      if (b > ML - 1) b = ML - 1;
      if (b < a) return 0;
      return cum[node * ML + b] - cum[node * ML + a - 1];
    }
    /* à l’entrée d’une ligne : quelles lettres chaque colonne accepte-t-elle ? */
    function tables(r) {
      var rest = H - 1 - r;
      for (var c = 0; c < W; c++) {
        var len = colLen[c], nd = colNode[c], m = 0, below = r + 1 < H ? forceL[(r + 1) * W + c] : 0;
        var base = (r * W + c) * 26;
        for (var x = 0; x < 26; x++) {
          var nn = -9, fl = 0;
          if (len === 0) {
            nn = child[x];
            if (nn < 0) nn = below ? -9 : -1;
            else fl = lg(comp(nn, 2, 1 + rest)) * 0.8 + 0.3;
          } else if (nd >= 0) {
            var t = child[nd * 26 + x];
            if (t >= 0) {
              var L1 = len + 1, cc;
              if (r === H - 1) { if (wordAt[t] >= 0) { nn = t; fl = 1; } } else if (below) {
                cc = comp(t, L1 + 1, L1 + rest);
                if (cc) { nn = t; fl = lg(cc); }
              } else {
                cc = comp(t, L1, L1 + rest);
                if (cc) { nn = t; fl = lg(cc); }
              }
            }
          }
          nextT[base + x] = nn; flexT[base + x] = fl;
          if (nn !== -9) m |= 1 << x;
        }
        maskT[r * W + c] = m;
      }
    }
    /* peut-on poser une case définition/noire en (r,c) ? (le mot vertical
       au-dessus doit être complet) */
    function canEnd(c, r) {
      if (forceL[r * W + c]) return false;
      if (FL && r === H - 1 && c === W - 1) return false; // coin inutile
      var len = colLen[c];
      if (len === 0) return true;
      if (len === 1) return acrossLen[(r - 1) * W + c] >= 2;
      var nd = colNode[c];
      if (nd < 0) return false;
      var wi = wordAt[nd];
      return wi >= 0 && !isUsed(wi);
    }
    function endCol(c, r) {
      var len = colLen[c], tok = { c: c, node: colNode[c], len: len, wi: -1 };
      if (len >= 2) {
        var wi = wordAt[colNode[c]];
        setUsed(wi, 1); tok.wi = wi;
        placed.push({ wi: wi, r: r - len, c: c, dir: 1 });
      }
      colNode[c] = -1; colLen[c] = 0;
      return tok;
    }
    function undoEnd(tok) {
      if (tok.wi >= 0) { setUsed(tok.wi, 0); placed.pop(); }
      colNode[tok.c] = tok.node; colLen[tok.c] = tok.len;
    }
    function putD(r, c) { var tok = endCol(c, r); type[r * W + c] = 1; nD++; return tok; }
    function unD(r, c, tok) { type[r * W + c] = 0; nD--; undoEnd(tok); }
    function putL(r, c, x, aL) {
      var o2 = { node: colNode[c], len: colLen[c] };
      colNode[c] = colLen[c] === 0 ? child[x] : child[colNode[c] * 26 + x];
      colLen[c]++;
      type[r * W + c] = 2; letter[r * W + c] = x; acrossLen[r * W + c] = aL;
      return o2;
    }
    function unL(r, c, o2) {
      colNode[c] = o2.node; colLen[c] = o2.len;
      type[r * W + c] = 0; acrossLen[r * W + c] = 0;
    }
    /* une case-définition sans mot à sa droite doit servir vers le bas */
    function force2(r, col) {
      if (r + 2 > H - 1) return false;
      forceL[(r + 1) * W + col]++; forceL[(r + 2) * W + col]++;
      return true;
    }
    function unforce2(r, col) { forceL[(r + 1) * W + col]--; forceL[(r + 2) * W + col]--; }
    /* qualité d’une case définition/noire en (r,c) */
    function dScore(r, c) {
      var s = colLen[c] === 2 ? pen2 : 1;                         // ferme un mot de 2 lettres
      if (r > 0 && c > 0 && type[(r - 1) * W + c] === 1) s *= penV; // collée au-dessus
      return s;
    }
    /* ce qui reste de la ligne après une case définition/noire en colonne e */
    function leftover(e) {
      if (e >= W) return LO[3];
      var left = W - e - 1;
      return left <= 2 ? LO[left] : 1;
    }
    var bRc, bC, bMaxL, bEp, bList;
    function walk(node, k, flex) {
      var m2 = maskT[bRc + bC + k] & kids[node];
      while (m2) {
        var bit = m2 & -m2;
        m2 ^= bit;
        var y = 31 - clz32(bit), nn2 = child[node * 26 + y];
        var f2 = flex + flexT[(bRc + bC + k) * 26 + y], len2 = k + 1;
        if (len2 >= 2 && wordAt[nn2] >= 0 && pref[len2] && bEp[len2]) {
          bList.push({ L: len2, wi: wordAt[nn2], s: pref[len2] * (0.35 + rnd()) * (0.5 + f2 / len2 / 5) * bEp[len2] });
        }
        if (len2 < bMaxL && bEp[len2 + 1] !== -1 && (lenMask[nn2] >>> (len2 + 1))) walk(nn2, len2, f2);
      }
    }
    /* tous les candidats d’un segment, du meilleur au moins bon */
    function build(r, c, fromLeft) {
      var list = [], R = W - c, x, L, rc = r * W;
      if (!fromLeft) {
        var dOk = FL ? !(c >= 2 && type[rc + c - 2] === 1) : !(c >= 1 && type[rc + c - 1] === 1);
        if ((c >= 1 || !FL) && dOk && !forceL[rc + c] && !(FL && r === H - 1 && c === W - 1)) {
          list.push({ L: 0, s: pD * 0.6 * (0.3 + rnd()) * dScore(r, c) });
        }
        var m = maskT[rc + c];
        for (x = 0; x < 26; x++) {
          if (!(m & (1 << x))) continue;
          var nn = nextT[(rc + c) * 26 + x];
          if (colLen[c] === 0) {
            if (r + 1 > H - 1 || nn < 0) continue;
            if (!((lenMask[nn] >>> 2) & ((1 << (H - r - 1)) - 1))) continue;
          }
          if (c + 1 < W && forceL[rc + c + 1]) continue;
          list.push({ L: 1, x: x, s: pref[1] * (0.3 + rnd()) * (0.5 + flexT[(rc + c) * 26 + x] / 6) *
            (c + 1 < W ? dScore(r, c + 1) * leftover(c + 1) : 1) });
        }
      }
      bMaxL = Math.min(R, pref.length - 1);
      bEp = [];
      for (L = 2; L <= bMaxL; L++) {
        bEp[L] = (c + L < W && forceL[rc + c + L]) ? 0 : (c + L < W ? dScore(r, c + L) : 1) * leftover(c + L);
      }
      bRc = rc; bC = c; bList = list;
      walk(0, 0, 0);
      list.sort(function (a, b) { return b.s - a.s; });
      return list;
    }
    /* un candidat calculé à l’entrée de la ligne est-il encore valable ? */
    function valid(r, c, cd) {
      var L = cd.L, t;
      if (L === 0) {
        if (!FL && nD >= maxB) return false;
        return canEnd(c, r);
      }
      if (L === 1) {
        if (c + 1 < W && !canEnd(c + 1, r)) return false;
        if (r === H - 1 && colLen[c] >= 1) { t = child[colNode[c] * 26 + cd.x]; if (isUsed(wordAt[t])) return false; }
        return true;
      }
      if (isUsed(cd.wi)) return false;
      if (c + L < W && !canEnd(c + L, r)) return false;
      if (r === H - 1) {
        var w = codes[cd.wi];
        for (var k = 0; k < L; k++) {
          if (colLen[c + k] >= 1) {
            t = child[colNode[c + k] * 26 + w[k]];
            if (isUsed(wordAt[t]) || wordAt[t] === cd.wi) return false;
          }
        }
      }
      return true;
    }
    function seg(r, c, pendD, fromLeft) {
      if (abort) return false;
      if (++steps > maxSteps) { abort = true; return false; }
      if (c >= W) {
        if (pendD >= 0) {
          if (!force2(r, pendD)) return false;
          if (nextRow(r)) return true;
          unforce2(r, pendD);
          return false;
        }
        return nextRow(r);
      }
      var key = r * W + c, e = cache[key];
      if (!e || e.v !== rowVer[r]) { e = { v: rowVer[r], list: build(r, c, fromLeft) }; cache[key] = e; }
      var list = e.list, tried = 0;
      for (var i = 0; i < list.length && tried < K; i++) {
        if (abort) return false;
        var cd = list[i];
        if (!valid(r, c, cd)) continue;
        tried++;
        if (tryCand(r, c, pendD, cd)) return true;
      }
      return false;
    }
    function tryCand(r, c, pendD, cd) {
      var L = cd.L;
      var needF = FL && pendD >= 0 && L < 2;
      if (needF && !force2(r, pendD)) return false;
      if (L === 0) {
        var tok = putD(r, c);
        if (seg(r, c + 1, FL ? c : -1, false)) return true;
        unD(r, c, tok);
        if (needF) unforce2(r, pendD);
        return false;
      }
      if (L === 1) {
        var needBelow = colLen[c] === 0;
        var o2 = putL(r, c, cd.x, 1);
        if (needBelow) forceL[(r + 1) * W + c]++;
        var ok = false, t2;
        if (c + 1 >= W) ok = seg(r, W, -1, false);
        else {
          t2 = putD(r, c + 1);
          ok = seg(r, c + 2, FL ? c + 1 : -1, false);
          if (!ok) unD(r, c + 1, t2);
        }
        if (ok) return true;
        if (needBelow) forceL[(r + 1) * W + c]--;
        unL(r, c, o2);
        if (needF) unforce2(r, pendD);
        return false;
      }
      var cdw = codes[cd.wi], olds = [], k;
      for (k = 0; k < L; k++) olds.push(putL(r, c + k, cdw[k], L));
      setUsed(cd.wi, 1);
      placed.push({ wi: cd.wi, r: r, c: c, dir: 0 });
      var res = false;
      if (c + L >= W) res = seg(r, W, -1, false);
      else if (canEnd(c + L, r)) { // (le mot vertical fermé ici ne doit pas être celui qu’on vient de poser)
        var t3 = putD(r, c + L);
        res = seg(r, c + L + 1, FL ? c + L : -1, false);
        if (!res) unD(r, c + L, t3);
      }
      if (res) return true;
      setUsed(cd.wi, 0);
      placed.pop();
      for (k = L - 1; k >= 0; k--) unL(r, c + k, olds[k]);
      return false;
    }
    function nextRow(r) {
      if (r === H - 1) return finish();
      var r2 = r + 1;
      rowVer[r2] = ++verSeq;
      tables(r2);
      if (!FL) return seg(r2, 0, -1, false);
      if (r2 % 2 === 0) { // bord gauche : case-définition
        if (!canEnd(0, r2)) return false;
        var tok = putD(r2, 0);
        // en dernière ligne, pas de mot en dessous : la définition doit servir à droite
        if (seg(r2, 1, r2 === H - 1 ? 0 : -1, false)) return true;
        unD(r2, 0, tok);
        return false;
      }
      return seg(r2, 0, -1, true); // un mot part du bord
    }
    function finish() {
      var toks = [], c, j;
      for (c = 0; c < W; c++) {
        var ok = true;
        if (colLen[c] === 1 && acrossLen[(H - 1) * W + c] < 2) ok = false;
        if (colLen[c] >= 2) {
          var nd = colNode[c], wi = nd >= 0 ? wordAt[nd] : -1;
          if (wi < 0 || isUsed(wi)) ok = false;
        }
        if (!ok) { for (j = toks.length - 1; j >= 0; j--) undoEnd(toks[j]); return false; }
        toks.push(endCol(c, H));
      }
      if (!FL) { // croisés : assez de cases croisées ?
        var blanc = 0, croise = 0;
        for (var i = 0; i < N; i++) {
          if (type[i] !== 2) continue;
          blanc++;
          var rr = (i / W) | 0, cc = i % W;
          var h = (cc > 0 && type[i - 1] === 2) || (cc < W - 1 && type[i + 1] === 2);
          var v = (rr > 0 && type[i - W] === 2) || (rr < H - 1 && type[i + W] === 2);
          if (h && v) croise++;
        }
        if (croise < minCroise * blanc) { for (j = toks.length - 1; j >= 0; j--) undoEnd(toks[j]); return false; }
      }
      return true;
    }
    /* fléchés, ligne 0 : définitions aux colonnes paires, lettres aux impaires */
    function row0(c) {
      if (abort) return false;
      if (c >= W) return nextRow(0);
      if (c % 2 === 0) {
        type[c] = 1;
        var last = c === W - 1;
        if (last) { forceL[W + c]++; forceL[2 * W + c]++; }
        if (row0(c + 1)) return true;
        type[c] = 0;
        if (last) { forceL[W + c]--; forceL[2 * W + c]--; }
        return false;
      }
      var xs = [];
      for (var x = 0; x < 26; x++) if (child[x] >= 0) xs.push({ x: x, s: lg(comp(child[x], 2, H)) * (0.3 + rnd()) });
      xs.sort(function (a, b) { return b.s - a.s; });
      for (var i = 0; i < Math.min(4, xs.length); i++) {
        var o2 = putL(0, c, xs[i].x, 1);
        forceL[W + c]++;
        if (row0(c + 1)) return true;
        forceL[W + c]--;
        unL(0, c, o2);
        if (abort) return false;
      }
      return false;
    }

    var ok;
    if (FL) ok = row0(0);
    else { rowVer[0] = ++verSeq; tables(0); ok = seg(0, 0, -1, false); }
    if (!ok) return { ok: false, steps: steps };
    var cases = '';
    for (var i = 0; i < N; i++) cases += type[i] === 1 ? '#' : String.fromCharCode(65 + letter[i]);
    var mots = [];
    for (i = 0; i < placed.length; i++) {
      var p = placed[i];
      mots.push({ w: P.words[p.wi], id: P.ids[p.wi], r: p.r, c: p.c, dir: p.dir ? 'v' : 'h' });
    }
    return { ok: true, steps: steps, W: W, H: H, cases: cases, mots: mots };
  }

  /* plusieurs essais (graines dérivées), puis réglages assouplis si besoin :
     toujours une grille, toujours la même pour une graine donnée */
  function remplir(P, cfg, graine, depart) {
    var essais = cfg.essais || 30, pas = 0;
    for (var a = depart || 0; a < essais + 30; a++) {
      var o = {
        mode: cfg.mode, W: cfg.W, H: cfg.H, pref: cfg.pref, K: cfg.K, maxSteps: cfg.maxSteps,
        pen2: cfg.pen2, pD: cfg.pD, lo: cfg.lo, maxB: cfg.maxB, minCroise: cfg.minCroise, penV: cfg.penV,
        seed: (graine + imul(a, 0x9E3779B1)) >>> 0
      };
      if (a >= essais) { // assouplissement : plus de souplesse, un peu moins d’élégance
        o.pD = (cfg.pD || 0.1) * 2; o.pen2 = 0.5; o.K = 5; o.maxSteps = 1500;
        o.pref = cfg.pref.map(function (v, L) { return L === 2 ? Math.max(v, 0.3) : (L === 3 ? Math.max(v, 0.6) : v); });
        if (cfg.maxB) o.maxB = Math.round(cfg.maxB * 1.15);
      }
      var g = generer(P, o);
      pas += g.steps;
      if (g.ok) { g.essai = a; g.pas = pas; return g; }
    }
    return null;
  }

  /* ================================================================
   * 5. Le choix des définitions
   * ================================================================ */

  /* plus long mot d’une définition (il doit tenir sur la largeur d’une case) */
  function motMax(d) {
    var m = String(d).split(/[\s’'-]+/), x = 0;
    for (var i = 0; i < m.length; i++) if (m[i].length > x) x = m[i].length;
    return x;
  }
  /* cible : 0 = facile … 2 = difficile ; poids : probabilité de chaque niveau */
  function choisirDefs(mots, poids, rnd, courtes) {
    var L = lexique(), vus = {};
    for (var i = 0; i < mots.length; i++) {
      var ds = L.defs[mots[i].id], ordre = [], k;
      // ordre de préférence : tirage selon les poids, puis les niveaux voisins
      var x = rnd(), acc = 0, cible = ds.length - 1;
      for (k = 0; k < poids.length; k++) { acc += poids[k]; if (x < acc) { cible = k; break; } }
      if (cible > ds.length - 1) cible = ds.length - 1;
      ordre.push(cible);
      for (var d = 1; d < ds.length; d++) {
        if (cible - d >= 0) ordre.push(cible - d);
        if (cible + d < ds.length) ordre.push(cible + d);
      }
      var max = courtes && courtes[i] ? courtes[i] : 99, choix = -1, secours = -1;
      for (k = 0; k < ordre.length; k++) {
        var cle = norm(ds[ordre[k]]);
        if (vus[cle]) continue;
        if (secours < 0) secours = ordre[k];
        if (ds[ordre[k]].length <= max && (!courtes || motMax(ds[ordre[k]]) <= 9)) { choix = ordre[k]; break; }
      }
      if (choix < 0) choix = secours >= 0 ? secours : ordre[0];
      vus[norm(ds[choix])] = true;
      mots[i].def = ds[choix];
      mots[i].niv = choix;
    }
    return mots;
  }

  /* ================================================================
   * 6. Les grilles des deux jeux
   * ================================================================ */

  /* Mots fléchés : 5 forces qui diffèrent par la taille, la longueur des
     mots, le vocabulaire et la difficulté des définitions */
  var FORCES = [
    null,
    { W: 8, H: 8, maxLen: 5, rares: false, pref: [0, 0.6, 0.25, 1.2, 1.2, 0.8], K: 4, maxSteps: 800, pen2: 0.3, pD: 0.1, lo: [0.45, 0.75, 0.3, 1.4], defs: [1, 0, 0] },
    { W: 8, H: 10, maxLen: 7, rares: false, pref: [0, 0.6, 0.2, 0.9, 1.1, 1.1, 0.9, 0.6], K: 4, maxSteps: 800, pen2: 0.25, pD: 0.1, lo: [0.45, 0.75, 0.35, 1.4], defs: [0.6, 0.4, 0] },
    { W: 9, H: 12, maxLen: 8, rares: true, pref: [0, 0.5, 0.15, 0.6, 1, 1.2, 1.3, 1.1, 0.8], K: 4, maxSteps: 800, pen2: 0.25, pD: 0.08, lo: [0.45, 0.7, 0.4, 1.5], defs: [0.2, 0.6, 0.2] },
    { W: 10, H: 12, maxLen: 9, rares: true, pref: [0, 0.4, 0.1, 0.4, 0.8, 1.2, 1.5, 1.5, 1.3, 1.1], K: 4, maxSteps: 600, pen2: 0.2, pD: 0.07, lo: [0.45, 0.7, 0.4, 1.6], defs: [0, 0.4, 0.6] },
    { W: 10, H: 14, maxLen: 9, rares: true, pref: [0, 0.3, 0.03, 0.2, 0.7, 1.2, 1.6, 1.8, 1.6, 1.4], K: 4, maxSteps: 600, pen2: 0.15, pD: 0.06, lo: [0.45, 0.7, 0.4, 1.8], defs: [0, 0.15, 0.85] }
  ];
  /* Raccourcis : pour les grilles n°0 à 999 de chaque force, la tentative
     réussie quand la première est laborieuse (calculée une fois pour toutes par
     tests/test_grilles.js : RACCOURCIS=1 node tests/test_grilles.js). Ce ne sont
     pas des grilles stockées : juste « commencer à l’essai n° a » (base 36),
     ce qui borne le calcul de chaque grille à quelques milliers de pas. */
  var RACCOURCIS_TXT = {
    1: 'h:5,1l:6,1u:5,2q:5,3p:5,4c:b,53:5,6n:5,8q:5,ao:6,bl:6,c2:6,e9:5,lt:5,n7:8,n8:5,nj:6,oo:5',
    2: 'a:6,h:5,1x:5,5q:5,60:5,62:5,6h:5,aa:7,ah:7,b3:5,bq:5,bx:5,cv:5,dh:5,dq:7,e4:5,ek:6,ep:6,fu:5,gh:5,gk:7,go:5,gt:5,id:5,m1:5,m8:5,mk:7,of:6,os:6,pf:6,pi:6,pt:6,q8:5,qd:d,qw:5',
    3: '1:b,9:7,e:5,k:9,w:8,15:6,17:9,1d:6,1r:7,23:b,2h:7,2v:6,2z:5,3c:6,3h:7,3l:5,3s:5,3v:7,47:7,4r:8,51:5,5c:5,5p:h,5u:5,60:5,62:5,66:5,6c:5,6j:5,6u:5,6z:5,7g:5,7r:9,7z:5,83:6,86:5,87:5,8r:c,8s:5,9b:5,9k:7,9m:l,9s:k,9t:8,a0:d,a3:5,aa:5,ag:7,ai:5,az:5,b8:5,be:5,bk:5,bs:5,bw:6,c3:5,c7:7,ck:6,cm:8,co:6,ct:6,d1:6,d4:9,dd:5,dt:8,ei:6,en:7,eq:6,ez:e,f1:5,fo:5,fr:5,gc:5,gj:5,h1:5,h2:7,h4:c,h8:6,ha:9,hs:5,ht:7,hu:5,hy:5,i8:9,ic:a,ig:7,j5:5,jk:6,jr:6,jv:6,jz:9,k5:7,k6:7,k9:b,kf:b,kk:6,km:5,kt:5,kz:5,l5:5,l7:5,lh:8,lj:6,lk:5,lm:9,lp:5,ls:5,lv:6,m1:6,m7:7,m9:d,mf:5,mk:7,n6:8,ng:5,nm:7,nn:5,o7:d,o8:5,of:5,om:5,p0:a,p3:7,p6:5,p8:c,pa:b,pc:8,pn:5,pr:9,q7:5,qd:6,qe:7,qg:6,qi:7,qs:5,qw:7,r0:5,r4:b,rj:9,rl:8,rp:7',
    4: '4:9,5:f,6:d,d:e,j:8,k:7,q:h,r:8,13:b,19:j,1e:8,1n:6,1q:b,22:c,28:8,2i:c,2l:7,2o:9,2s:7,2u:8,2z:9,33:b,34:6,39:7,3c:c,3i:9,3j:8,3l:a,3n:9,3v:7,43:9,46:e,4c:i,4o:6,4r:9,4w:7,4z:7,50:9,52:h,54:7,55:e,56:b,5e:c,5j:c,5k:8,5n:9,5r:7,5x:7,5y:a,67:c,6b:a,6e:6,6h:n,6l:7,6t:a,6w:d,6z:8,70:9,71:6,73:d,7e:7,7f:b,7j:9,7m:7,7p:7,7u:7,7y:d,7z:6,82:7,84:7,8a:8,8j:g,8m:9,8o:i,8p:c,8u:8,8w:b,90:g,94:9,95:7,97:d,9b:b,9c:8,9d:9,9h:p,9o:e,9s:9,9x:b,a4:d,ac:b,ad:b,ai:c,aj:b,am:k,ap:7,b8:7,b9:7,ba:b,bd:g,bf:6,bg:k,bk:a,bn:c,br:d,bv:8,bw:t,c7:j,c8:6,cb:7,cp:7,cu:7,d4:f,d5:6,da:b,de:7,dh:8,dj:f,dk:n,dr:f,dz:9,e1:f,e7:c,eo:7,ep:9,eq:8,eu:9,ev:7,ew:n,f4:9,f9:h,fc:b,ff:c,fj:j,fm:b,fv:9,fy:7,g3:7,g9:f,ga:k,ge:7,gg:f,gk:h,gm:h,gs:b,gt:9,gu:a,gx:c,gy:7,h0:7,hm:h,hq:9,hr:7,hz:i,i1:a,i3:9,i7:l,i9:i,ib:6,ie:k,ih:7,ij:7,ir:9,is:a,it:9,iv:d,iz:7,j5:6,j7:8,j8:k,j9:m,ja:7,je:l,jf:a,jj:h,jq:8,jt:7,jy:e,k3:c,k4:8,k8:8,kf:d,ko:9,ky:7,l2:a,l3:9,l6:h,l7:9,l8:a,lb:h,ld:8,lt:f,lu:d,lx:d,ly:8,mb:9,mf:7,mn:8,mo:8,mq:6,mr:9,mu:7,my:e,mz:8,n0:7,n1:b,n3:e,na:c,ng:a,ni:d,nn:7,no:a,ny:7,o2:j,o4:j,o6:7,o8:8,oa:h,oe:9,og:9,oi:6,oj:7,ol:8,os:g,ou:k,oy:a,oz:6,p0:9,p2:h,p5:7,pc:a,pv:8,px:d,q8:9,q9:f,qa:8,qf:e,qg:l,qh:7,qi:9,qk:l,qm:a,qv:c,qw:b,r3:8,r4:j,r6:9,r8:a,r9:9,ra:8,rr:b',
    5: '2:8,3:a,6:b,a:i,e:a,f:7,g:o,h:a,j:h,k:c,l:9,r:k,s:d,u:a,v:b,y:p,z:b,11:9,13:k,19:6,1c:b,1f:g,1g:d,1h:g,1i:b,1k:v,1m:b,1o:b,1p:a,1s:j,1v:9,1z:8,24:7,26:d,28:x,2a:l,2b:d,2g:8,2h:7,2j:a,2l:y,2n:8,2p:8,2u:8,2x:h,2y:h,2z:b,33:a,34:j,35:7,36:b,39:7,3j:b,3m:d,3n:e,3p:c,3s:12,3t:g,3v:g,3z:7,42:7,43:m,45:p,46:a,47:c,48:d,49:n,4e:9,4f:a,4h:c,4j:e,4k:m,4m:a,4r:z,4s:7,4t:c,4v:a,52:p,57:b,59:7,5b:a,5f:n,5g:g,5r:8,5u:8,62:7,65:9,66:7,69:j,6a:9,6b:d,6c:f,6k:7,6l:g,6m:8,6s:p,6x:8,6z:n,70:k,72:e,74:n,76:c,77:e,79:6,7c:g,7d:9,7l:c,7o:i,7p:b,7t:i,7u:9,7y:9,80:f,86:9,87:h,88:g,8a:7,8d:9,8e:6,8f:c,8g:8,8j:a,8n:7,8p:6,8q:9,8w:i,8x:7,94:7,96:m,97:9,9c:i,9d:g,9h:c,9i:s,9j:v,9k:o,9m:a,9o:q,9p:a,9s:b,9t:b,a1:7,a5:e,a6:k,a9:7,aa:8,ab:7,am:d,ap:c,au:6,aw:m,ax:7,b0:c,b2:o,b3:7,b6:v,b9:a,ba:q,bf:a,bg:f,bk:g,bl:a,bo:7,bp:a,bs:b,bu:6,bw:e,bx:y,by:8,c2:i,c3:8,c6:t,c8:b,cb:e,cf:m,ci:9,ck:e,cl:8,cn:h,cq:7,cr:d,cs:y,ct:d,cx:f,cz:h,d4:6,d6:a,d7:7,d8:e,db:b,dj:g,dk:a,dl:6,dp:c,dx:k,dz:f,e0:9,e3:d,e5:9,e8:c,e9:7,ea:c,ee:i,ef:9,ei:p,ej:6,el:f,em:8,ep:w,eq:8,er:b,ev:9,f0:b,f1:g,f5:8,f8:b,fc:e,fe:l,fg:g,fi:6,fj:a,ft:6,fv:e,fw:b,fy:e,fz:a,g0:c,g1:a,ga:7,gb:8,gc:b,ge:7,gf:z,gj:a,gr:7,gv:9,gy:b,h2:7,h4:6,h7:7,h8:s,hb:e,hd:8,hf:j,hg:7,hh:a,hl:e,hp:i,hq:9,hr:9,hs:7,ht:j,hv:j,hx:a,hz:a,i1:7,i5:9,i6:a,ib:8,ic:8,ie:7,io:m,ip:h,ir:9,it:i,iu:g,iz:8,j1:9,j4:k,j6:8,ja:6,jd:7,ji:b,jm:c,jn:7,jq:8,jt:9,jw:18,jx:j,k0:8,k1:c,k9:8,ke:c,ki:c,kj:m,kn:a,ko:j,kr:a,ku:e,kv:6,kx:8,kz:i,l5:9,lb:9,lc:a,le:q,lf:e,lh:7,lk:h,lm:a,lo:b,lq:g,lr:c,ls:e,lt:f,lu:q,ly:i,m2:8,m4:r,m7:b,m8:g,mb:i,mc:e,me:k,mf:c,mo:b,mp:t,mq:7,mt:8,mu:6,mw:a,mx:6,my:8,n1:9,n3:c,n9:u,na:7,nb:k,ne:i,ng:a,nh:y,nk:8,nm:7,nn:8,no:m,nr:h,ns:7,nt:7,nu:b,ny:f,o0:8,o3:a,o6:o,o7:h,o9:o,oa:9,og:c,ol:b,om:t,on:u,oo:e,ou:8,p2:c,p3:a,p5:8,p9:n,pa:e,pb:9,pd:b,pe:a,pf:8,pg:7,pk:a,pp:c,ps:a,pt:f,pu:7,pv:t,px:e,py:h,pz:b,q1:a,q2:8,q5:k,q6:e,q8:d,qi:b,qk:f,ql:7,qm:w,qp:k,qu:c,qw:b,qx:h,qz:b,r6:d,r7:7,r9:k,ra:d,rc:b,rf:c,rg:w,ri:g,rk:8,rm:l,rn:f,rp:a'
  };
  var RACCOURCIS = null;
  function raccourci(f, num) {
    if (!RACCOURCIS) {
      RACCOURCIS = {};
      Object.keys(RACCOURCIS_TXT).forEach(function (k) {
        var t = {};
        RACCOURCIS_TXT[k].split(',').forEach(function (p) {
          if (!p) return;
          var q = p.split(':');
          t[parseInt(q[0], 36)] = parseInt(q[1], 36);
        });
        RACCOURCIS[k] = t;
      });
    }
    return (RACCOURCIS[f] && RACCOURCIS[f][num]) || 0;
  }
  function prepFleches(f) {
    var F = FORCES[f];
    return preparer('fl' + f, function (w, rare) {
      return w.length <= F.maxLen && w.length <= Math.max(F.W, F.H) - 1 && (F.rares || !rare);
    });
  }
  /* grille n° num (0, 1, 2…) de la force f ; ou le défi du jour (jour = date) */
  function grilleFleches(f, num, jour) {
    var F = FORCES[f];
    if (!F) return null;
    var cle = jour ? 'fleches|jour|' + jour : 'fleches|' + f + '|' + num;
    var graine = hash(cle);
    var g = remplir(prepFleches(f), { mode: 'fleches', W: F.W, H: F.H, pref: F.pref, K: F.K, maxSteps: F.maxSteps, pen2: F.pen2, pD: F.pD, lo: F.lo, essais: 30 }, graine, jour ? 0 : raccourci(f, num));
    if (!g) return null;
    var W = F.W, mots = g.mots, parCase = {};
    for (var i = 0; i < mots.length; i++) {
      var m = mots[i], cells = [];
      for (var k = 0; k < m.w.length; k++) cells.push(m.dir === 'h' ? m.r * W + m.c + k : (m.r + k) * W + m.c);
      m.cells = cells;
      if (m.dir === 'h') {
        if (m.c === 0) { m.defCell = (m.r - 1) * W; m.fleche = 'hc'; } else { m.defCell = m.r * W + m.c - 1; m.fleche = 'hd'; }
      } else if (m.r === 0) { m.defCell = m.c - 1; m.fleche = 'vc'; } else { m.defCell = (m.r - 1) * W + m.c; m.fleche = 'vd'; }
      parCase[m.defCell] = (parCase[m.defCell] || 0) + 1;
    }
    // ordre de lecture : case-définition puis haut avant bas
    mots.sort(function (a, b) {
      return a.defCell - b.defCell || (dessus(a) ? -1 : 1);
    });
    var courtes = mots.map(function (m) { return parCase[m.defCell] > 1 ? 18 : 34; });
    choisirDefs(mots, F.defs, rng(graine ^ 0x5bd1e995), courtes);
    var cases = g.cases.replace(/[A-Z]/g, '.');
    return { w: W, h: F.H, cases: cases, sol: g.cases, mots: mots, pas: g.pas, essai: g.essai };
  }
  /* la définition dont le mot part vers la droite occupe le haut de la case */
  function dessus(m) { return m.fleche === 'hd' || m.fleche === 'vc'; }

  /* Mots croisés : 3 niveaux */
  var NIVEAUX = {
    facile: { n: 8, maxLen: 8, rares: false, pref: [0, 0.4, 0.4, 0.9, 1, 1.1, 1, 0.9, 0.8], defs: [0.85, 0.15, 0] },
    moyen: { n: 9, maxLen: 9, rares: true, pref: [0, 0.4, 0.35, 0.8, 1, 1.1, 1.1, 1, 0.9, 0.8], defs: [0.15, 0.7, 0.15] },
    difficile: { n: 10, maxLen: 10, rares: true, pref: [0, 0.3, 0.2, 0.6, 1, 1.2, 1.3, 1.2, 1.1, 1, 0.9], defs: [0, 0.2, 0.8] }
  };
  function prepCroises(niv) {
    var C = NIVEAUX[niv];
    return preparer('cr' + niv, function (w, rare) { return w.length <= C.maxLen && w.length <= C.n && (C.rares || !rare); });
  }
  var ROMAINS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV'];
  function grilleCroises(niv, num, jour) {
    var C = NIVEAUX[niv];
    if (!C) return null;
    var cle = jour ? 'croises|jour|' + jour : 'croises|' + niv + '|' + num;
    var graine = hash(cle);
    var g = remplir(prepCroises(niv), { mode: 'croises', W: C.n, H: C.n, pref: C.pref, K: 4, maxSteps: 1500, maxB: Math.round(C.n * C.n * 0.22), minCroise: 0.72, pen2: 0.6, penV: 0.5, pD: 0.25, lo: [1, 1, 0.6, 1.3], essais: 30 }, graine);
    if (!g) return null;
    var N = C.n, mots = g.mots;
    for (var i = 0; i < mots.length; i++) {
      var m = mots[i], cells = [];
      for (var k = 0; k < m.w.length; k++) cells.push(m.dir === 'h' ? m.r * N + m.c + k : (m.r + k) * N + m.c);
      m.cells = cells;
      m.ligne = m.dir === 'h' ? m.r : m.c; // numéro de ligne (horizontal) ou de colonne (vertical)
    }
    // numérotation classique : horizontalement par ligne, verticalement par colonne
    mots.sort(function (a, b) {
      if (a.dir !== b.dir) return a.dir === 'h' ? -1 : 1;
      return a.ligne - b.ligne || a.cells[0] - b.cells[0];
    });
    choisirDefs(mots, C.defs, rng(graine ^ 0x27d4eb2f), null);
    return { w: N, h: N, cases: g.cases.replace(/[A-Z]/g, '.'), sol: g.cases, mots: mots };
  }

  /* ================================================================
   * 7. Règles communes d’une partie (pures : tournent aussi dans Node)
   *
   * État partagé par les deux jeux :
   *   w, h, cases ('#' = case-définition ou noire, '.' = lettre),
   *   words [{w (solution, masquée tant que non trouvé), def, cells, dir, ok, by…}],
   *   saisie [lettre ou ''] par case, aide [0/1] par case (lettre révélée),
   *   players [{name, points, found, errors, aides}], t {cumul, dernier} (chrono
   *   actif), complete (grille juste), finished (célébration terminée),
   *   ev {n, k, w, bad, ws} : dernier évènement, pour animer une seule fois.
   * ================================================================ */

  var PEN = { erreur: 2, lettre: 3, mot: 1, grille: 5 };
  var PAUSE_MAX = 60000; // un chrono « actif » : une longue absence compte 1 min au plus
  function maintenant() { return Date.now(); }
  function tic(s) {
    var t = s.t || (s.t = { cumul: 0, dernier: maintenant() });
    var n = maintenant(), d = n - t.dernier;
    if (d > 0) t.cumul += Math.min(d, PAUSE_MAX);
    t.dernier = n;
  }
  function tempsJeu(s) {
    var t = s.t;
    if (!t) return 0;
    if (s.complete || s.finished) return t.cumul;
    return t.cumul + Math.max(0, Math.min(maintenant() - t.dernier, PAUSE_MAX));
  }
  /* installe une grille neuve dans l’état */
  function demarrer(s, g, champs) {
    var N = g.w * g.h, i;
    s.w = g.w; s.h = g.h; s.cases = g.cases;
    s.words = g.mots.map(function (m) {
      var o = { w: m.w, def: m.def, cells: m.cells.slice(), dir: m.dir, ok: false, by: -1 };
      (champs || []).forEach(function (c) { if (m[c] !== undefined) o[c] = m[c]; });
      return o;
    });
    s.saisie = []; s.aide = [];
    for (i = 0; i < N; i++) { s.saisie.push(''); s.aide.push(0); }
    s.phase = 'play';
    s.startTs = maintenant();
    s.t = { cumul: 0, dernier: s.startTs };
    s.complete = false; s.finished = false; s.durationSec = 0;
    s.ev = { n: 0, k: '' };
    s.players.forEach(function (p) { p.points = 0; p.found = 0; p.errors = 0; p.aides = 0; });
  }
  function motsDe(s, i) {
    var r = [];
    for (var k = 0; k < s.words.length; k++) if (s.words[k].cells.indexOf(i) !== -1) r.push(k);
    return r;
  }
  function solution(s, i) {
    for (var k = 0; k < s.words.length; k++) {
      var w = s.words[k], p = w.cells.indexOf(i);
      if (p !== -1 && w.w) return w.w.charAt(p);
    }
    return '';
  }
  function verrou(s, i) { // case d’un mot déjà trouvé : on n’y touche plus
    for (var k = 0; k < s.words.length; k++) if (s.words[k].ok && s.words[k].cells.indexOf(i) !== -1) return true;
    return false;
  }
  function complet(s, wi) {
    var c = s.words[wi].cells;
    for (var k = 0; k < c.length; k++) if (!s.saisie[c[k]]) return false;
    return true;
  }
  function juste(s, wi) {
    var w = s.words[wi];
    for (var k = 0; k < w.cells.length; k++) if (s.saisie[w.cells[k]] !== w.w.charAt(k)) return false;
    return true;
  }
  /* dernière case libre (non verrouillée) d’un mot */
  function derniereLibre(s, wi) {
    var c = s.words[wi].cells;
    for (var k = c.length - 1; k >= 0; k--) if (!verrou(s, c[k])) return c[k];
    return -1;
  }
  function joueur(s, p) { return s.players[p] || s.players[0]; }
  function trouver(s, wi, p) {
    var w = s.words[wi];
    if (w.ok) return false;
    w.ok = true; w.by = p < 0 ? 0 : p;
    var j = joueur(s, p);
    j.found++; j.points += w.cells.length;
    return true;
  }
  function penalite(s, p, n) { var j = joueur(s, p); j.points = Math.max(0, j.points - n); }
  /* tous les mots complets et justes autour de la case i sont validés */
  function valider(s, i, p) {
    var ws = motsDe(s, i), gagnes = [];
    for (var k = 0; k < ws.length; k++) {
      if (!s.words[ws[k]].ok && complet(s, ws[k]) && juste(s, ws[k])) { trouver(s, ws[k], p); gagnes.push(ws[k]); }
    }
    return gagnes;
  }
  function evenement(s, k, extra) {
    var n = (s.ev && s.ev.n) || 0;
    s.ev = { n: n + 1, k: k };
    for (var c in extra) if (Object.prototype.hasOwnProperty.call(extra, c)) s.ev[c] = extra[c];
  }
  var DUREE_FETE = 1900; // la vague de couleur, avant la fenêtre de fin
  function peutFinir(s) {
    for (var k = 0; k < s.words.length; k++) if (!s.words[k].ok) return null;
    s.complete = true;
    s.durationSec = Math.max(1, Math.round(s.t.cumul / 1000));
    evenement(s, 'fin', {});
    return { ok: true, timer: { ms: DUREE_FETE, action: { t: 'fin' } } };
  }
  function effacerFausses(s, cells) {
    var bad = [];
    cells.forEach(function (i) {
      if (s.saisie[i] && !verrou(s, i) && s.saisie[i] !== solution(s, i)) { s.saisie[i] = ''; bad.push(i); }
    });
    return bad;
  }
  function estLettre(s, i) { return typeof i === 'number' && i >= 0 && i < s.w * s.h && s.cases.charAt(i) === '.'; }

  /* applique une action de jeu ; renvoie null si l’action n’est pas une
     action de grille (le module s’en occupe) */
  function appliquer(s, p, a) {
    if (!a || typeof a !== 'object') return { ok: false, error: 'Action inconnue.' };
    if (a.t === 'fin') {
      if (s.complete && !s.finished) { s.finished = true; return { ok: true }; }
      return { ok: false, error: '' };
    }
    if (['l', 'x', 'aide', 'claim'].indexOf(a.t) === -1) return null;
    if (s.phase !== 'play' || !s.words) return { ok: false, error: 'La partie n’a pas commencé.' };
    if (s.complete || s.finished) return { ok: false, error: 'Grille terminée !' };
    var i = a.i | 0, gagnes, bad;
    if (a.t === 'l') {
      var l = String(a.l || '').toUpperCase();
      if (!/^[A-Z]$/.test(l) || !estLettre(s, i)) return { ok: false, error: 'Case invalide.' };
      tic(s);
      if (verrou(s, i)) return { ok: true };
      s.saisie[i] = l;
      gagnes = valider(s, i, p);
      var wa = a.w | 0, w = s.words[wa];
      if (gagnes.length) {
        evenement(s, 'ok', { ws: gagnes, i: i });
      } else if (w && !w.ok && w.cells.indexOf(i) !== -1 && complet(s, wa) && derniereLibre(s, wa) === i) {
        // le mot en cours est fini… et faux : il tremble, ses lettres fausses s’effacent
        joueur(s, p).errors++;
        penalite(s, p, PEN.erreur);
        bad = effacerFausses(s, w.cells);
        evenement(s, 'ko', { w: wa, bad: bad });
      }
      return peutFinir(s) || { ok: true };
    }
    if (a.t === 'x') {
      if (!estLettre(s, i)) return { ok: false, error: 'Case invalide.' };
      tic(s);
      if (!verrou(s, i)) s.saisie[i] = '';
      return { ok: true };
    }
    if (a.t === 'aide') {
      tic(s);
      if (a.k === 'lettre') {
        if (!estLettre(s, i) || verrou(s, i)) return { ok: false, error: 'Choisissez une case vide.' };
        s.saisie[i] = solution(s, i);
        s.aide[i] = 1;
        joueur(s, p).aides++;
        penalite(s, p, PEN.lettre);
        gagnes = valider(s, i, p);
        evenement(s, 'aide', { i: i, ws: gagnes });
        return peutFinir(s) || { ok: true };
      }
      if (a.k === 'mot') {
        var wv = s.words[a.w | 0];
        if (!wv || wv.ok) return { ok: false, error: 'Choisissez un mot à vérifier.' };
        joueur(s, p).aides++;
        penalite(s, p, PEN.mot);
        bad = effacerFausses(s, wv.cells);
        gagnes = [];
        wv.cells.forEach(function (c) { gagnes = gagnes.concat(valider(s, c, p)); });
        evenement(s, 'verif', { bad: bad, ws: gagnes, w: a.w | 0 });
        return peutFinir(s) || { ok: true };
      }
      if (a.k === 'grille') {
        joueur(s, p).aides++;
        penalite(s, p, PEN.grille);
        var toutes = [];
        for (var c = 0; c < s.w * s.h; c++) if (s.cases.charAt(c) === '.') toutes.push(c);
        bad = effacerFausses(s, toutes);
        evenement(s, 'verif', { bad: bad, ws: [], tout: 1 });
        return { ok: true };
      }
      return { ok: false, error: 'Aide inconnue.' };
    }
    // « claim » : proposer un mot entier d’un coup (ancienne interface, tests)
    var wc = s.words[i];
    if (!wc) return { ok: false, error: 'Mot inconnu.' };
    if (wc.ok) return { ok: false, error: 'Déjà trouvé !' };
    var guess = norm(a.text);
    if (!guess) return { ok: false, error: 'Écrivez une réponse.' };
    if (guess.length !== wc.cells.length) return { ok: false, error: 'Il faut ' + wc.cells.length + ' lettres.' };
    tic(s);
    if (guess === wc.w) {
      wc.cells.forEach(function (c2, k) { s.saisie[c2] = guess.charAt(k); });
      gagnes = [];
      wc.cells.forEach(function (c2) { gagnes = gagnes.concat(valider(s, c2, p)); });
      evenement(s, 'ok', { ws: gagnes });
      return peutFinir(s) || { ok: true };
    }
    joueur(s, p).errors++;
    penalite(s, p, PEN.erreur);
    evenement(s, 'ko', { w: i, bad: [] });
    return { ok: true };
  }
  /* les solutions ne quittent jamais l’hôte */
  function masquer(state) {
    var copy = JSON.parse(JSON.stringify(state));
    if (copy.words) copy.words.forEach(function (w) { if (!w.ok) delete w.w; });
    return copy;
  }
  function etoiles(p) {
    var f = (p.errors || 0) + (p.aides || 0);
    return f === 0 ? 3 : (f <= 3 ? 2 : 1);
  }

  /* ================================================================
   * 8. L’affichage commun (navigateur seulement, appelé depuis render)
   *
   * Une grille objet sur papier ivoire, dans une vue bornée qu’on peut
   * pincer pour zoomer et glisser pour déplacer ; en bas, fixes, le bandeau
   * de la définition courante et le clavier. On écrit DANS la grille.
   * Le DOM est construit une fois par partie puis seulement retouché :
   * chaque frappe ne redessine que les cases qui changent.
   * ================================================================ */

  var TOUCHES = ['AZERTYUIOP', 'QSDFGHJKLM', '⇄WXCVBN⌫'];
  var ACTIF = null;            // la partie affichée (pour le clavier physique)
  var ECOUTE_CLAVIER = false;

  function esc(t) { return GG.esc ? GG.esc(t) : String(t); }
  function son(nom, o) { try { if (GG.sfx && GG.sfx.play) GG.sfx.play(nom, o); } catch (e) { /* muet */ } }
  function vibre(t) { try { if (GG.haptic) GG.haptic(t); } catch (e) { /* rien */ } }
  function fx() { return GG.fx || {}; }

  /* flèches de mots fléchés, dessinées dans la 1re case du mot */
  var FLECHES = {
    hd: '<svg class="gx-fl hd" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2.2 L10 6 L2 9.8 Z"/></svg>',
    vd: '<svg class="gx-fl vd" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.2 2 L6 10 L9.8 2 Z"/></svg>',
    hc: '<svg class="gx-fl hc" viewBox="0 0 14 14" aria-hidden="true"><path class="tr" d="M3.5 0 V7.5 H9"/><path d="M8.5 4.6 L13 7.5 L8.5 10.4 Z"/></svg>',
    vc: '<svg class="gx-fl vc" viewBox="0 0 14 14" aria-hidden="true"><path class="tr" d="M0 3.5 H7.5 V9"/><path d="M4.6 8.5 L7.5 13 L10.4 8.5 Z"/></svg>'
  };

  /* taille de police qui fait tenir un texte dans une boîte : on MESURE le
     texte (canevas) avec la vraie police ; hors navigateur, estimation */
  var MESURE = null;
  function largeur(txt, px) {
    if (MESURE === null) {
      try { MESURE = document.createElement('canvas').getContext('2d') || false; } catch (e) { MESURE = false; }
    }
    if (!MESURE) return txt.length * px * 0.6;
    MESURE.font = '700 ' + px + 'px "Nunito Variable", system-ui, sans-serif';
    return MESURE.measureText(txt).width;
  }
  function police(txt, larg, haut, max, min) {
    var mots = String(txt).split(/\s+/);
    for (var f = max; f >= min; f -= 0.5) {
      var maxL = Math.floor(haut / (f * 1.06));
      if (maxL < 1) continue;
      var lignes = 1, cur = 0, esp = largeur(' ', f), ok = true;
      for (var i = 0; i < mots.length; i++) {
        var w = largeur(mots[i], f);
        if (w > larg) { ok = false; break; } // on ne coupe pas un mot : plus petit
        if (cur === 0) cur = w;
        else if (cur + esp + w <= larg) cur += esp + w;
        else { lignes++; cur = w; }
      }
      if (ok && lignes <= maxL) return f;
    }
    return 0; // introuvable : taille minimale et césure
  }
  /* règle la taille de chaque définition écrite dans une case */
  function ajusterPolices(V) {
    var S = V.S;
    V.racine.querySelectorAll('.gx-d').forEach(function (d) {
      var hs = d.querySelectorAll('.gx-dt'), n = hs.length;
      if (!n) return;
      var h = (n > 1 ? (S - 2) / 2 : S - 2) - 3;
      hs.forEach(function (t) {
        var f = police(t.textContent, S - 7, h, 13, 8.5);
        t.style.fontSize = (f || 8.5) + 'px';
        t.classList.toggle('serre', !f);
      });
    });
  }

  function clavierHTML() {
    return '<div class="gx-clavier" role="group" aria-label="Clavier">' + TOUCHES.map(function (ligne) {
      return '<div class="gx-krang">' + ligne.split('').map(function (k) {
        var cls = 'gx-k' + (k === '⌫' ? ' gx-kx' : (k === '⇄' ? ' gx-kd' : ''));
        var lab = k === '⌫' ? 'Effacer' : (k === '⇄' ? 'Changer de sens' : k);
        return '<button type="button" class="' + cls + '" data-k="' + k + '" aria-label="' + lab + '">' + k + '</button>';
      }).join('') + '</div>';
    }).join('') + '</div>';
  }

  /* ---------- vue zoomable et déplaçable ---------- */
  function Vue(el, pl, surTap) {
    var self = this;
    this.el = el; this.pl = pl; this.surTap = surTap;
    this.z = 1; this.x = 0; this.y = 0; this.zFit = 1; this.zLect = 1;
    this.pts = {}; this.n = 0; this.geste = null;
    el.addEventListener('pointerdown', function (e) { self.bas(e); });
    el.addEventListener('pointermove', function (e) { self.bouge(e); });
    el.addEventListener('pointerup', function (e) { self.haut(e, true); });
    el.addEventListener('pointercancel', function (e) { self.haut(e, false); });
    el.addEventListener('wheel', function (e) {
      e.preventDefault();
      if (e.ctrlKey) self.zoomAutour(self.z * (e.deltaY < 0 ? 1.1 : 0.9), e.clientX, e.clientY);
      else { self.x -= e.deltaX; self.y -= e.deltaY; self.borner(); self.poser(false); }
    }, { passive: false });
  }
  Vue.prototype.mesurer = function () {
    this.vw = this.el.clientWidth; this.vh = this.el.clientHeight;
    this.cw = this.pl.offsetWidth; this.ch = this.pl.offsetHeight;
    this.zFit = Math.min(this.vw / this.cw, this.vh / this.ch);
    this.zMin = Math.min(1, this.zFit);
    this.zMax = 2.6;
  };
  Vue.prototype.borner = function () {
    var w = this.cw * this.z, h = this.ch * this.z;
    this.x = w <= this.vw ? (this.vw - w) / 2 : Math.min(0, Math.max(this.vw - w, this.x));
    this.y = h <= this.vh ? (this.vh - h) / 2 : Math.min(0, Math.max(this.vh - h, this.y));
  };
  Vue.prototype.poser = function (anim) {
    this.pl.style.transition = anim ? 'transform .28s cubic-bezier(.22,1,.36,1)' : 'none';
    this.pl.style.transform = 'translate(' + Math.round(this.x) + 'px,' + Math.round(this.y) + 'px) scale(' + this.z + ')';
  };
  Vue.prototype.zoomAutour = function (z, cx, cy) {
    var r = this.el.getBoundingClientRect(), px = cx - r.left, py = cy - r.top;
    z = Math.max(this.zMin, Math.min(this.zMax, z));
    this.x = px - (px - this.x) * (z / this.z);
    this.y = py - (py - this.y) * (z / this.z);
    this.z = z;
    this.borner(); this.poser(false);
  };
  /* garde un rectangle (coordonnées de la grille, échelle 1) dans la vue */
  Vue.prototype.suivre = function (rx, ry, rw, rh, anim) {
    var m = 14, z = this.z;
    var x0 = rx * z + this.x, y0 = ry * z + this.y, x1 = x0 + rw * z, y1 = y0 + rh * z;
    if (rw * z > this.vw - 2 * m) this.x = m - rx * z;
    else if (x0 < m) this.x += m - x0; else if (x1 > this.vw - m) this.x -= x1 - (this.vw - m);
    if (rh * z > this.vh - 2 * m) this.y = m - ry * z;
    else if (y0 < m) this.y += m - y0; else if (y1 > this.vh - m) this.y -= y1 - (this.vh - m);
    this.borner(); this.poser(anim);
  };
  Vue.prototype.basculer = function () {
    var ensemble = this.z > this.zFit + 0.02;
    this.z = ensemble ? this.zFit : Math.max(this.zLect, this.zFit * 1.35);
    this.borner(); this.poser(true);
    return ensemble;
  };
  Vue.prototype.bas = function (e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.pts[e.pointerId] = { x: e.clientX, y: e.clientY };
    this.n = Object.keys(this.pts).length;
    try { this.el.setPointerCapture(e.pointerId); } catch (er) { /* rien */ }
    if (this.n === 1) {
      this.geste = { t: 'tap', x0: e.clientX, y0: e.clientY, tx: this.x, ty: this.y, cible: e.target, t0: Date.now() };
    } else if (this.n === 2) {
      var p = this.deux();
      this.geste = { t: 'pince', d0: p.d, z0: this.z, cx: p.cx, cy: p.cy, tx: this.x, ty: this.y };
    }
  };
  Vue.prototype.deux = function () {
    var k = Object.keys(this.pts), a = this.pts[k[0]], b = this.pts[k[1]];
    return { d: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
  };
  Vue.prototype.bouge = function (e) {
    if (!this.pts[e.pointerId] || !this.geste) return;
    this.pts[e.pointerId] = { x: e.clientX, y: e.clientY };
    var g = this.geste;
    if (g.t === 'pince' && this.n >= 2) {
      var p = this.deux(), r = this.el.getBoundingClientRect();
      var z = Math.max(this.zMin, Math.min(this.zMax, g.z0 * p.d / g.d0));
      var px = g.cx - r.left, py = g.cy - r.top;
      this.x = px - (px - g.tx) * (z / g.z0) + (p.cx - g.cx);
      this.y = py - (py - g.ty) * (z / g.z0) + (p.cy - g.cy);
      this.z = z;
      this.borner(); this.poser(false);
      return;
    }
    var dx = e.clientX - g.x0, dy = e.clientY - g.y0;
    if (g.t === 'tap' && Math.abs(dx) + Math.abs(dy) > 9) g.t = 'glisse';
    if (g.t === 'glisse') { this.x = g.tx + dx; this.y = g.ty + dy; this.borner(); this.poser(false); }
  };
  Vue.prototype.haut = function (e, fini) {
    if (!this.pts[e.pointerId]) return;
    delete this.pts[e.pointerId];
    this.n = Object.keys(this.pts).length;
    var g = this.geste;
    if (this.n === 0) {
      this.geste = null;
      if (fini && g && g.t === 'tap') {
        var cible = document.elementFromPoint ? document.elementFromPoint(e.clientX, e.clientY) : g.cible;
        this.surTap(cible || g.cible);
      }
    } else if (this.n === 1 && g && g.t === 'pince') {
      var k = Object.keys(this.pts)[0], q = this.pts[k];
      this.geste = { t: 'glisse', x0: q.x, y0: q.y, tx: this.x, ty: this.y };
    }
  };

  /* ---------- la partie ---------- */

  function indexer(V) {
    var s = V.s, N = s.w * s.h;
    V.parCase = [];
    for (var i = 0; i < N; i++) V.parCase.push([-1, -1]);
    s.words.forEach(function (w, wi) {
      w.cells.forEach(function (c) { V.parCase[c][w.dir === 'h' ? 0 : 1] = wi; });
    });
  }
  function libre(V, wi) { return wi >= 0 && V.s.words[wi] && !V.s.words[wi].ok; }
  function verrouV(V, i) {
    var p = V.parCase[i];
    return (p[0] >= 0 && V.s.words[p[0]].ok) || (p[1] >= 0 && V.s.words[p[1]].ok);
  }
  function premiereLibre(V, wi) { // 1re case vide du mot, sinon 1re non verrouillée
    var c = V.s.words[wi].cells, k;
    for (k = 0; k < c.length; k++) if (!V.s.saisie[c[k]] && !verrouV(V, c[k])) return k;
    for (k = 0; k < c.length; k++) if (!verrouV(V, c[k])) return k;
    return 0;
  }
  function motSuivant(V, depuis, pas) {
    var n = V.s.words.length;
    for (var d = 1; d <= n; d++) {
      var wi = ((depuis + pas * d) % n + n) % n;
      if (libre(V, wi)) return wi;
    }
    return -1;
  }
  function selectionner(V, wi, k) {
    if (wi < 0) { V.sel = { w: -1, k: 0 }; return; }
    V.sel = { w: wi, k: k === undefined ? premiereLibre(V, wi) : k };
  }
  function selValide(V) {
    if (!V.sel || !libre(V, V.sel.w)) {
      var wi = motSuivant(V, V.sel ? V.sel.w : -1, 1);
      selectionner(V, wi);
    }
  }
  function caseCourante(V) {
    if (!V.sel || V.sel.w < 0) return -1;
    var w = V.s.words[V.sel.w];
    return w ? w.cells[Math.min(V.sel.k, w.cells.length - 1)] : -1;
  }
  function toucherCase(V, i) {
    var p = V.parCase[i];
    if (!p) return;
    var cands = [p[0], p[1]].filter(function (wi) { return libre(V, wi); });
    if (!cands.length) { son('tap', { volume: 0.4 }); return; }
    var cur = caseCourante(V), wi;
    if (cur === i && cands.length === 2) wi = cands[0] === V.sel.w ? cands[1] : cands[0]; // on bascule de sens
    else if (V.sel && cands.indexOf(V.sel.w) !== -1) wi = V.sel.w;
    else {
      var dirPref = V.sel && V.sel.w >= 0 ? V.s.words[V.sel.w].dir : 'h';
      wi = cands.filter(function (x) { return V.s.words[x].dir === dirPref; })[0];
      if (wi === undefined) wi = cands[0];
    }
    selectionner(V, wi, V.s.words[wi].cells.indexOf(i));
    son('select', { volume: 0.5 });
    peindre(V, true);
  }
  function toucherMot(V, wi) {
    if (!libre(V, wi)) return;
    selectionner(V, wi);
    son('select', { volume: 0.5 });
    peindre(V, true);
  }
  function avancer(V) { // curseur sur la case libre suivante du mot (sinon il reste)
    var w = V.s.words[V.sel.w];
    for (var k = V.sel.k + 1; k < w.cells.length; k++) {
      if (!verrouV(V, w.cells[k])) { V.sel.k = k; return; }
    }
  }
  function agir(V, action) {
    var ok = false;
    try { ok = V.ctx.act(action); } catch (e) { ok = false; }
    if (ok === false) peindre(V, true); // le moteur n’a rien redessiné
  }
  function taper(V, l) {
    if (V.s.complete || V.s.finished) return;
    selValide(V);
    if (!V.sel || V.sel.w < 0) return;
    var w = V.s.words[V.sel.w];
    while (V.sel.k < w.cells.length - 1 && verrouV(V, w.cells[V.sel.k])) V.sel.k++;
    var i = w.cells[V.sel.k];
    if (verrouV(V, i)) return;
    son('type', { volume: 0.55, pitch: 0.9 + ((l.charCodeAt(0) % 7) / 30) });
    vibre('light');
    var wi = V.sel.w;
    avancer(V);
    agir(V, { t: 'l', i: i, l: l, w: wi });
  }
  function effacer(V) {
    if (V.s.complete || V.s.finished) return;
    selValide(V);
    if (!V.sel || V.sel.w < 0) return;
    var w = V.s.words[V.sel.w], i = w.cells[V.sel.k];
    if (!V.s.saisie[i] || verrouV(V, i)) { // case vide : on recule d’abord
      for (var k = V.sel.k - 1; k >= 0; k--) {
        if (!verrouV(V, w.cells[k])) { V.sel.k = k; i = w.cells[k]; break; }
      }
    }
    son('erase', { volume: 0.5 });
    if (V.s.saisie[i] && !verrouV(V, i)) agir(V, { t: 'x', i: i });
    else peindre(V, true);
  }
  function basculerSens(V) {
    var i = caseCourante(V);
    if (i < 0) return;
    var p = V.parCase[i], autre = p[0] === V.sel.w ? p[1] : p[0];
    if (libre(V, autre)) { selectionner(V, autre, V.s.words[autre].cells.indexOf(i)); son('toggle', { volume: 0.5 }); }
    else son('tap', { volume: 0.3 });
    peindre(V, true);
  }
  function naviguer(V, pas) {
    var wi = motSuivant(V, V.sel ? V.sel.w : -1, pas);
    if (wi >= 0) { selectionner(V, wi); son('tick', { volume: 0.4 }); }
    peindre(V, true);
  }
  function fleche(V, dx, dy) { // clavier physique : déplacement case à case
    var i = caseCourante(V);
    if (i < 0) return;
    var W = V.s.w, H = V.s.h, r = Math.floor(i / W), c = i % W;
    for (var n = 1; n < Math.max(W, H); n++) {
      var r2 = r + dy * n, c2 = c + dx * n;
      if (r2 < 0 || c2 < 0 || r2 >= H || c2 >= W) return;
      var j = r2 * W + c2;
      if (V.s.cases.charAt(j) === '.') {
        var p = V.parCase[j], wi = dx ? p[0] : p[1];
        if (!libre(V, wi)) wi = libre(V, p[0]) ? p[0] : p[1];
        if (libre(V, wi)) { selectionner(V, wi, V.s.words[wi].cells.indexOf(j)); peindre(V, true); }
        return;
      }
    }
  }
  function toucheClavier(V, k) {
    if (k === '⌫') effacer(V);
    else if (k === '⇄') basculerSens(V);
    else taper(V, k);
  }
  function aide(V, k) {
    fermerPop(V);
    selValide(V);
    var i = caseCourante(V);
    if (k === 'lettre') {
      if (i < 0) return;
      son('reveal', { volume: 0.7 });
      avancer(V);
      agir(V, { t: 'aide', k: 'lettre', i: i });
    } else if (k === 'mot') {
      if (!V.sel || V.sel.w < 0) return;
      son('tap');
      agir(V, { t: 'aide', k: 'mot', w: V.sel.w });
    } else {
      son('tap');
      agir(V, { t: 'aide', k: 'grille' });
    }
  }
  function fermerPop(V) {
    if (V.pop) V.pop.classList.add('gx-cache');
    if (V.tiroir) V.tiroir.classList.add('gx-cache');
  }

  /* hauteur de la vue : tout l’espace entre le haut et le clavier fixe */
  function caler(V) {
    if (!document.body.contains(V.racine)) return;
    var r = V.vue.getBoundingClientRect(), sy = window.scrollY || window.pageYOffset || 0;
    var basH = V.termine ? 0 : V.bas.offsetHeight;
    V.espace.style.height = (basH ? basH + 8 : 0) + 'px';
    var h = Math.floor(window.innerHeight - (r.top + sy) - basH - (V.termine ? V.finH() : 0) - 30);
    h = Math.max(150, Math.min(h, Math.ceil(V.plateau.offsetHeight * 2.6) + 20));
    V.vue.style.height = h + 'px';
    V.vc.mesurer();
    if (!V.cale) { V.vc.z = V.jeu.zoomInitial ? V.jeu.zoomInitial(V.vc) : Math.max(V.vc.zMin, Math.min(1, V.vc.zLect)); V.cale = true; }
    V.vc.borner();
    V.vc.poser(false);
    suivreCourant(V, false);
  }
  function suivreCourant(V, anim) {
    if (!V.sel || V.sel.w < 0 || !V.cellEls) return;
    var w = V.s.words[V.sel.w];
    if (!w) return;
    var a = V.cellEls[w.cells[0]], b = V.cellEls[w.cells[w.cells.length - 1]], cur = V.cellEls[caseCourante(V)];
    if (!a || !b) return;
    var x0 = Math.min(a.offsetLeft, b.offsetLeft), y0 = Math.min(a.offsetTop, b.offsetTop);
    var x1 = Math.max(a.offsetLeft + a.offsetWidth, b.offsetLeft + b.offsetWidth);
    var y1 = Math.max(a.offsetTop + a.offsetHeight, b.offsetTop + b.offsetHeight);
    var d = w.defCell !== undefined ? V.defEls[w.defCell] : null;
    if (d) { // la case-définition aussi, si possible
      x0 = Math.min(x0, d.offsetLeft); y0 = Math.min(y0, d.offsetTop);
    }
    V.vc.suivre(x0, y0, x1 - x0, y1 - y0, anim);
    if (cur) V.vc.suivre(cur.offsetLeft, cur.offsetTop, cur.offsetWidth, cur.offsetHeight, anim);
  }

  /* construit la partie (une fois par grille) */
  function construire(el, ctx, jeu, gid) {
    var s = ctx.state, V = { gid: gid, jeu: jeu, s: s, ctx: ctx, sel: null, cale: false };
    // largeur utile pour les cases : vue (bord 2) − marge du plateau (24) − cadre (6)
    var dispo = Math.max(240, (el.clientWidth || 360) - 32);
    V.S = jeu.taille(s, dispo);
    el.innerHTML =
      '<div class="gx gx-' + jeu.id + '" style="--s:' + V.S + 'px">' +
        '<div class="gx-haut">' +
          '<span class="gx-titre">' + jeu.titre(s) + '</span>' +
          '<span class="gx-info"><span class="gx-chrono" aria-label="Chrono">⏱ 0:00</span>' +
          '<span class="gx-score" aria-label="Score">★ 0</span></span>' +
          '<span class="gx-outils">' +
            (jeu.liste ? '<button type="button" class="gx-btn" data-a="liste" aria-label="Toutes les définitions">📋</button>' : '') +
            '<button type="button" class="gx-btn" data-a="aides" aria-label="Aides">💡</button>' +
            '<button type="button" class="gx-btn" data-a="zoom" aria-label="Voir toute la grille">⤢</button>' +
          '</span>' +
        '</div>' +
        '<div class="gx-vue"><div class="gx-plateau">' + jeu.grille(s, V.S) + '</div></div>' +
        '<div class="gx-finbox"></div>' +
        '<div class="gx-espace"></div>' +
        '<div class="gx-bas">' +
          '<div class="gx-bandeau">' +
            '<button type="button" class="gx-nav" data-a="prec" aria-label="Mot précédent">‹</button>' +
            '<div class="gx-def" aria-live="polite"><span class="gx-lab"></span><span class="gx-txt"></span></div>' +
            '<button type="button" class="gx-nav" data-a="suiv" aria-label="Mot suivant">›</button>' +
          '</div>' +
          clavierHTML() +
        '</div>' +
        '<div class="gx-pop gx-cache" role="menu">' +
          '<button type="button" class="gx-aide" data-aide="lettre">🔤 Révéler la lettre <small>−' + PEN.lettre + ' pts</small></button>' +
          '<button type="button" class="gx-aide" data-aide="mot">🔍 Vérifier le mot <small>−' + PEN.mot + ' pt</small></button>' +
          '<button type="button" class="gx-aide" data-aide="grille">🧾 Vérifier la grille <small>−' + PEN.grille + ' pts</small></button>' +
        '</div>' +
        (jeu.liste ? '<div class="gx-tiroir gx-cache"><div class="gx-tiroir-in">' +
          '<div class="gx-tiroir-h"><strong>Définitions</strong><button type="button" class="gx-btn" data-a="fermer" aria-label="Fermer">✕</button></div>' +
          '<div class="gx-liste">' + jeu.liste(s) + '</div></div></div>' : '') +
      '</div>';
    V.racine = el.querySelector('.gx');
    V.vue = el.querySelector('.gx-vue');
    V.plateau = el.querySelector('.gx-plateau');
    V.bas = el.querySelector('.gx-bas');
    V.espace = el.querySelector('.gx-espace');
    V.finbox = el.querySelector('.gx-finbox');
    V.pop = el.querySelector('.gx-pop');
    V.tiroir = el.querySelector('.gx-tiroir');
    V.lab = el.querySelector('.gx-lab');
    V.txt = el.querySelector('.gx-txt');
    V.chronoEl = el.querySelector('.gx-chrono');
    V.scoreEl = el.querySelector('.gx-score');
    V.finH = function () { return V.finbox.offsetHeight + 6; };
    V.cellEls = [];
    V.plateau.querySelectorAll('[data-i]').forEach(function (c) { V.cellEls[+c.getAttribute('data-i')] = c; });
    V.defEls = [];
    V.plateau.querySelectorAll('[data-c]').forEach(function (c) { V.defEls[+c.getAttribute('data-c')] = c; });
    V.lettres = [];
    V.cellEls.forEach(function (c, i) { V.lettres[i] = c ? c.querySelector('.gx-l') : null; });
    V.moitie = {};
    V.racine.querySelectorAll('[data-w]').forEach(function (d) {
      var wi = +d.getAttribute('data-w');
      (V.moitie[wi] = V.moitie[wi] || []).push(d);
    });
    ajusterPolices(V);
    try {
      if (document.fonts && document.fonts.status !== 'loaded') document.fonts.ready.then(function () { ajusterPolices(V); });
    } catch (e) { /* ancien navigateur */ }
    V.vu = { saisie: s.saisie.slice(), ok: s.words.map(function (w) { return w.ok; }), aide: s.aide.slice() };
    V.evN = s.ev ? s.ev.n : 0;
    V.fete = !!s.complete;
    indexer(V);
    selValide(V);
    V.vc = new Vue(V.vue, V.plateau, function (cible) {
      if (!cible || !cible.closest) return;
      fermerPop(V);
      var d = cible.closest('[data-w]');
      if (d && V.racine.contains(d)) { toucherMot(V, +d.getAttribute('data-w')); return; }
      var c = cible.closest('[data-i]');
      if (c && V.racine.contains(c)) { toucherCase(V, +c.getAttribute('data-i')); return; }
      var dc = cible.closest('[data-d]'); // case-définition touchée hors d’une moitié
      if (dc) { var ws = (dc.getAttribute('data-d') || '').split(','); if (ws[0]) toucherMot(V, +ws[0]); }
    });
    V.vc.zLect = jeu.zoomLecture ? jeu.zoomLecture(V.S) : 1;
    // boutons
    V.racine.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button') : null;
      if (!b || !V.racine.contains(b)) return;
      var k = b.getAttribute('data-k');
      if (k) { toucheClavier(V, k); return; }
      var ad = b.getAttribute('data-aide');
      if (ad) { aide(V, ad); return; }
      var a = b.getAttribute('data-a');
      if (a === 'prec') naviguer(V, -1);
      else if (a === 'suiv') naviguer(V, 1);
      else if (a === 'zoom') { var ens = V.vc.basculer(); if (!ens) suivreCourant(V, true); son('whoosh', { volume: 0.4 }); }
      else if (a === 'aides') { if (V.tiroir) V.tiroir.classList.add('gx-cache'); V.pop.classList.toggle('gx-cache'); son('open', { volume: 0.5 }); }
      else if (a === 'liste') { V.pop.classList.add('gx-cache'); V.tiroir.classList.remove('gx-cache'); son('open', { volume: 0.5 }); var sel = V.tiroir.querySelector('.sel'); if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: 'center' }); }
      else if (a === 'fermer') { V.tiroir.classList.add('gx-cache'); son('close', { volume: 0.5 }); }
      else if (a === 'mot') { var wi = +b.getAttribute('data-mot'); fermerPop(V); toucherMot(V, wi); }
    });
    // pas de double appui qui zoome la page sur les touches
    V.bas.addEventListener('dblclick', function (e) { e.preventDefault(); });
    el._gx = V;
    ACTIF = V;
    if (!ECOUTE_CLAVIER) {
      ECOUTE_CLAVIER = true;
      document.addEventListener('keydown', function (ev) {
        var A = ACTIF;
        if (!A || !document.body.contains(A.racine) || ev.ctrlKey || ev.metaKey || ev.altKey) return;
        var t = ev.target && ev.target.tagName;
        if (t === 'INPUT' || t === 'TEXTAREA') return;
        var ov = document.querySelector('.overlay:not(.hidden)');
        if (ov) return;
        var k = ev.key;
        if (k === 'Backspace' || k === 'Delete') { ev.preventDefault(); effacer(A); }
        else if (k === 'ArrowLeft') { ev.preventDefault(); fleche(A, -1, 0); }
        else if (k === 'ArrowRight') { ev.preventDefault(); fleche(A, 1, 0); }
        else if (k === 'ArrowUp') { ev.preventDefault(); fleche(A, 0, -1); }
        else if (k === 'ArrowDown') { ev.preventDefault(); fleche(A, 0, 1); }
        else if (k === 'Tab' || k === 'Enter') { ev.preventDefault(); naviguer(A, ev.shiftKey ? -1 : 1); }
        else if (k === ' ') { ev.preventDefault(); basculerSens(A); }
        else {
          var l = norm(k);
          if (l.length === 1 && k.length === 1) { ev.preventDefault(); taper(A, l); }
        }
      });
    }
    // hauteur, chrono
    var redim = function () { if (!document.body.contains(V.racine)) { window.removeEventListener('resize', redim); return; } caler(V); };
    window.addEventListener('resize', redim);
    V.minuteur = setInterval(function () {
      if (!document.body.contains(V.racine)) { clearInterval(V.minuteur); return; }
      V.chronoEl.textContent = '⏱ ' + chrono(tempsJeu(V.s));
    }, 1000);
    if (window.scrollTo) window.scrollTo(0, 0);
    return V;
  }

  /* repeint la partie à partir de l’état (et joue les effets du dernier évènement) */
  function peindre(V, suivre) {
    var s = V.s, N = s.w * s.h, i, wi;
    selValide(V);
    var cur = caseCourante(V), selW = V.sel ? V.sel.w : -1;
    var dansSel = {};
    if (selW >= 0) s.words[selW].cells.forEach(function (c) { dansSel[c] = 1; });
    var okCase = {};
    s.words.forEach(function (w) { if (w.ok) w.cells.forEach(function (c) { okCase[c] = 1; }); });
    var neuves = [];
    for (i = 0; i < N; i++) {
      var ce = V.cellEls[i];
      if (!ce || s.cases.charAt(i) !== '.') continue;
      var l = s.saisie[i] || '';
      if (V.lettres[i].textContent !== l) {
        V.lettres[i].textContent = l;
        if (l && !V.vu.saisie[i]) neuves.push(ce);
      }
      var cls = 'gx-c' + (dansSel[i] ? ' sel' : '') + (i === cur && !s.complete ? ' cur' : '') +
        (okCase[i] ? ' ok' : '') + (s.aide[i] ? ' aide' : '');
      if (ce.className !== cls) ce.className = cls;
    }
    // définitions : mot courant, mots trouvés (barrés)
    Object.keys(V.moitie).forEach(function (k) {
      var w = s.words[k];
      V.moitie[k].forEach(function (d) {
        d.classList.toggle('fini', !!(w && w.ok));
        d.classList.toggle('sel', +k === selW);
      });
    });
    // bandeau
    if (selW >= 0) {
      var ws = s.words[selW];
      V.lab.innerHTML = V.jeu.etiquette(s, selW);
      V.txt.innerHTML = esc(ws.def) + ' <em>(' + ws.cells.length + ')</em>';
      V.racine.classList.remove('gx-rien');
    } else {
      V.lab.textContent = '🎉';
      V.txt.textContent = s.complete ? 'Grille terminée !' : 'Tous les mots sont trouvés !';
    }
    var j = s.players[0] || { points: 0 };
    V.scoreEl.textContent = '★ ' + j.points;
    V.chronoEl.textContent = '⏱ ' + chrono(tempsJeu(s));
    // fin de partie : la grille reste affichée, remplie et célébrée
    var termine = !!s.finished;
    if (termine !== !!V.termine) {
      V.termine = termine;
      V.racine.classList.toggle('gx-termine', termine);
      V.finbox.innerHTML = termine ? V.jeu.fin(s) : '';
      setTimeout(function () { caler(V); }, 30);
    }
    V.racine.classList.toggle('gx-complet', !!s.complete);
    // animations du dernier évènement (une seule fois)
    neuves.forEach(function (c) { rejouer(c, 'pop'); });
    var ev = s.ev || { n: 0 };
    if (ev.n !== V.evN) {
      V.evN = ev.n;
      jouerEvenement(V, ev);
    }
    V.vu = { saisie: s.saisie.slice(), ok: s.words.map(function (w) { return w.ok; }), aide: s.aide.slice() };
    if (!V.cale) caler(V);
    else if (suivre) suivreCourant(V, true);
  }
  function rejouer(el, cls) { // relance une animation CSS
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    setTimeout(function () { el.classList.remove(cls); }, 700);
  }
  function jouerEvenement(V, ev) {
    var s = V.s;
    if (ev.k === 'ok' || (ev.k === 'aide' && ev.ws && ev.ws.length) || (ev.k === 'verif' && ev.ws && ev.ws.length)) {
      (ev.ws || []).forEach(function (wi, n) {
        var w = s.words[wi];
        if (!w) return;
        w.cells.forEach(function (c, k) {
          var e = V.cellEls[c];
          if (e) { e.style.setProperty('--d', (k * 45 + n * 90) + 'ms'); rejouer(e, 'brille'); }
        });
        (V.moitie[wi] || []).forEach(function (d) { rejouer(d, 'barre'); });
      });
      if (ev.k === 'ok') { son('correct'); vibre('success'); }
      if (!s.complete && ev.ws && ev.ws.indexOf(V.sel ? V.sel.w : -1) !== -1) {
        selectionner(V, motSuivant(V, V.sel.w, 1));
        peindre(V, true);
      } else if (!s.complete) {
        selValide(V);
      }
    }
    if (ev.k === 'ko') {
      var w2 = s.words[ev.w];
      if (w2) w2.cells.forEach(function (c) { var e = V.cellEls[c]; if (e) rejouer(e, 'tremble'); });
      (ev.bad || []).forEach(function (c) {
        var e = V.cellEls[c], l = V.vu.saisie[c];
        if (!e || !l) return;
        var f = document.createElement('span');
        f.className = 'gx-fantome';
        f.textContent = l;
        e.appendChild(f);
        setTimeout(function () { if (f.parentNode) f.parentNode.removeChild(f); }, 900);
      });
      son('wrong'); vibre('error');
      // le curseur revient sur la 1re case à corriger
      if (ev.w === (V.sel ? V.sel.w : -1)) { V.sel.k = premiereLibre(V, ev.w); peindre(V, true); }
    }
    if (ev.k === 'aide') {
      var ea = V.cellEls[ev.i];
      if (ea) rejouer(ea, 'revele');
    }
    if (ev.k === 'verif') {
      (ev.bad || []).forEach(function (c) {
        var e = V.cellEls[c], l = V.vu.saisie[c];
        if (!e) return;
        rejouer(e, 'tremble');
        if (l) {
          var f = document.createElement('span');
          f.className = 'gx-fantome';
          f.textContent = l;
          e.appendChild(f);
          setTimeout(function () { if (f.parentNode) f.parentNode.removeChild(f); }, 900);
        }
      });
      if (ev.bad && ev.bad.length) { son('wrong', { volume: 0.6 }); vibre('warning'); } else { son('success', { volume: 0.6 }); }
      if (V.ctx && GG.fx && GG.fx.floatText) {
        fx().floatText(V.scoreEl, ev.bad && ev.bad.length ? ev.bad.length + ' faute' + (ev.bad.length > 1 ? 's' : '') : 'Tout juste !', { color: ev.bad && ev.bad.length ? '#ff4d5e' : '#2fd67b', size: 18 });
      }
    }
    if (ev.k === 'fin') {
      V.fete = true;
      var W = s.w;
      V.cellEls.forEach(function (e, i) {
        if (!e) return;
        e.style.setProperty('--v', ((Math.floor(i / W) + i % W) * 55) + 'ms');
      });
      V.racine.classList.add('gx-vague');
      son('success'); vibre('success');
      if (fx().burst) fx().burst(V.vue, { count: 40, shape: 'star' });
      setTimeout(function () { V.racine.classList.remove('gx-vague'); }, 3200);
    }
  }

  /* point d’entrée : affiche (ou met à jour) une partie en cours */
  function jouer(el, ctx, jeu) {
    var s = ctx.state, gid = jeu.id + ':' + s.startTs + ':' + s.w + 'x' + s.h;
    var V = el._gx;
    if (!V || V.gid !== gid || !V.racine || !el.contains(V.racine)) V = construire(el, ctx, jeu, gid);
    V.ctx = ctx;
    V.s = s;
    ACTIF = V;
    peindre(V, false);
    // reprise d’une partie finie pendant la célébration : on termine proprement
    if (s.complete && !s.finished && !V.finProgrammee) {
      V.finProgrammee = true;
      setTimeout(function () {
        if (V.s.complete && !V.s.finished && document.body.contains(V.racine)) V.ctx.act({ t: 'fin' });
      }, DUREE_FETE + 400);
    }
    return V;
  }

  /* ================================================================
   * 9. Exports
   * ================================================================ */
  GG.grilles = {
    rng: rng, hash: hash, norm: norm, aujourdhui: aujourdhui, dateValide: dateValide,
    jourSemaine: jourSemaine, dateLisible: dateLisible, chrono: chrono, duree: duree,
    lexique: lexique, preparer: preparer, generer: generer, remplir: remplir, choisirDefs: choisirDefs,
    FORCES: FORCES, NIVEAUX: NIVEAUX, ROMAINS: ROMAINS, FLECHES: FLECHES, PEN: PEN,
    grilleFleches: grilleFleches, grilleCroises: grilleCroises, dessus: dessus, raccourci: raccourci, prepFleches: prepFleches,
    demarrer: demarrer, appliquer: appliquer, masquer: masquer, tempsJeu: tempsJeu, etoiles: etoiles,
    police: police, jouer: jouer
  };
  if (typeof module === 'object' && module.exports) module.exports = GG.grilles;

  /* ================================================================
   * 10. LE LEXIQUE — « MOT|facile|moyenne|difficile »
   *     (° devant le mot : mot de cruciverbiste, forces 3 à 5 seulement)
   *     Chaque mot figure dans le grand dictionnaire (data/mots.txt) ;
   *     aucune définition ne contient la racine de sa réponse.
   * ================================================================ */
  function lexiqueBrut() {
    return [
    /* A */
    'ABBE|Homme d’Église|Prêtre en soutane|Supérieur de monastère',
    'ABEILLE|Elle fait le miel|Butineuse rayée|Ouvrière de la ruche',
    'ABIME|Gouffre sans fond|Précipice|Mis en piteux état',
    'ABORD|Accès|D’… : premièrement|Manière d’accueillir',
    'ABRI|Refuge|Cabane de protection|On s’y met quand il pleut',
    'ABRICOT|Fruit orangé à noyau|Cousin de la pêche|Oreillon au sirop',
    'ACCENT|Signe sur une voyelle|Façon de parler régionale|Il chante dans le Midi',
    'ACCIDENT|Collision|Accroc|Mauvaise surprise',
    'ACE|Service gagnant|Point direct au tennis|Balle intouchable',
    'ACES|Services gagnants|Balles intouchables|Points directs',
    'ACHAT|Emplette|Acquisition|Il se règle en caisse',
    'ACHETER|Payer pour avoir|Faire ses emplettes|Corrompre d’un billet',
    'ACIDE|Aigre|Piquant au goût|Comme une remarque blessante',
    'ACIER|Fer allié|Métal des lames|Nerfs d’…, très solides',
    'ACTE|Action|Partie d’une pièce|Document du notaire',
    'ACTES|Actions|Parties de pièce|Documents notariés',
    'ACTEUR|Comédien|Il joue la comédie|Il fait son cinéma',
    'ACTRICE|Comédienne|Vedette de l’écran|Elle fait son cinéma',
    'ADIEU|Au revoir définitif|Salut final|Dernier mot de la séparation',
    'ADRESSE|Domicile|Habileté|Coordonnées',
    'ADROIT|Habile|Doué de ses mains|Il a le coup de main',
    'AFFAIRE|Marché|Scandale|Bonne occasion',
    'AGE|Nombre d’années|Époque|De pierre ou de bronze',
    'AGENT|Policier|Représentant|Il peut être secret',
    'AGES|Nombres d’années|Époques|Périodes',
    'AGI|Fait|Passé à l’action|Remué, secoué',
    'AGILE|Souple|Leste|Vif comme un chat',
    'AGIR|Faire|Passer à l’action|Ne pas rester les bras croisés',
    'AGIS|Fais|Passe à l’action|Actionne',
    'AGNEAU|Petit de la brebis|Il bêle dans la bergerie|Symbole de douceur',
    'AH|Cri de surprise|Marque l’étonnement|Ça alors !',
    'AI|Paresseux d’Amérique|J’en … assez|Il ne se presse jamais',
    'AIDE|Secours|Coup de main|Assistant',
    'AIDER|Secourir|Donner un coup de main|Prêter main-forte',
    'AIE|Cri de douleur|Ouille !|Que j’… raison !',
    'AIES|Possèdes, au subjonctif|Que tu … raison|Détiennes',
    'AIGLE|Rapace royal|Roi des airs|Il a l’œil perçant',
    'AIGRE|Acide|Sûr, comme du lait tourné|Comme une voix criarde',
    'AIGU|Pointu|Perçant, comme un cri|Accent penché à droite',
    'AIGUILLE|Elle sert à coudre|Elle indique l’heure|Pic montagneux',
    'AIL|Condiment en gousses|Il éloigne les vampires|Il donne mauvaise haleine',
    'AILE|Membre de l’oiseau|Partie d’avion|Côté d’un château',
    'AILES|Elles permettent de voler|Paires de plumes|Elles poussent aux anges',
    'AILS|Gousses aromatiques|Condiments|Têtes d’…',
    'AIMABLE|Gentil|Agréable|Charmant avec tout le monde',
    'AIMANT|Il attire le fer|Affectueux|Pôle d’attraction',
    'AIME|Chérit|Adore|Porte dans son cœur',
    'AIMER|Chérir|Adorer|Avoir le béguin',
    'AIMES|Chéris|Adores|Portes dans ton cœur',
    'AINE|Premier-né|Né avant les autres|Pli en haut de la cuisse',
    'AINES|Premiers-nés|Frères plus âgés|Plis de la cuisse',
    'AINSI|De cette façon|Comme cela|… soit-il',
    'AIR|On le respire|Mélodie|Allure, mine',
    'AIRE|Surface|Nid d’aigle|Halte d’autoroute',
    'AIRES|Surfaces|Nids d’aigle|Haltes d’autoroute',
    'AIRS|Mélodies|Allures|Mines',
    'AIS|Planches|Paresseux sud-américains|Ils ne se pressent jamais',
    'AISE|Contentement|À l’… : décontracté|Commodité',
    'AISES|Contentements|Commodités|Confort',
    'AIT|Possède, au subjonctif|Qu’il … raison !|Détienne',
    'AJOUT|Complément|Supplément|Post-scriptum, par exemple',
    'ALBUM|Recueil de photos|Disque de chansons|Livre d’images',
    '°ALE|Bière anglaise|Blonde anglaise|Bière de fermentation haute',
    'ALERTE|Signal de danger|Vif, éveillé|Branle-bas',
    '°ALES|Bières anglaises|Blondes d’outre-Manche|Pintes de pub',
    'ALLEE|Chemin bordé d’arbres|Voie de jardin|… et venue',
    'ALLER|Se rendre|Billet sans retour|Partir',
    'ALLO|Mot du téléphone|Répondre au bout du fil|Y a quelqu’un ?',
    'ALLUMETTE|Tige à flamme|Bâtonnet soufré|Jambe maigre',
    'ALORS|Donc|À ce moment-là|Et … ?',
    'ALPINISTE|Grimpeur|Montagnard|Conquérant des cimes',
    'ALTO|Grand violon|Voix grave de femme|Saxophone moyen',
    'ALTOS|Grands violons|Voix graves de femme|Saxophones moyens',
    'AMANDE|Fruit à coque|Au cœur de la dragée|Forme d’un œil en biais',
    'AMAS|Tas|Monceau|Groupe d’étoiles',
    'AMBRE|Résine fossile|Couleur de miel|Parfum chaud et sucré',
    'AMBULANCE|Véhicule de secours|Voiture du SAMU|Transport de blessés',
    'AME|Esprit|Principe vital|Pas une … qui vive',
    'AMEN|Ainsi soit-il|Fin de prière|Dire … : approuver',
    'AMENDE|Contravention|Pénalité à payer|Faire … honorable',
    'AMER|Âpre au goût|Comme l’endive|Plein de rancœur',
    'AMES|Esprits|Principes vitaux|Consciences',
    'AMI|Copain|Camarade|Proche fidèle',
    'AMIE|Copine|Compagne|Confidente',
    'AMIES|Copines|Compagnes|Confidentes',
    'AMIS|Copains|Camarades|Proches fidèles',
    'AMITIE|Affection sincère|Lien entre copains|Elle se cultive comme un jardin',
    'AMOUR|Tendre passion|Cupidon le provoque|Il rend aveugle, dit-on',
    'AMPOULE|Lampe électrique|Cloque au pied|Petite fiole',
    'AMUSER|Divertir|Faire rire|Distraire',
    'AN|Douze mois|Il ajoute une bougie|Jour de l’… (1er janvier)',
    '°ANA|Recueil d’anecdotes|Collection de bons mots|Florilège',
    'ANCETRE|Aïeul|Précurseur|Arrière-grand-père',
    'ANCIEN|Vieux|D’autrefois|Vétéran',
    'ANCRE|Elle retient le navire|Symbole marin|Jeter l’… : s’arrêter',
    'ANE|Baudet|Il brait|Cancre coiffé d’un bonnet',
    'ANES|Baudets|Ils braient|Cancres coiffés de bonnets',
    'ANGE|Être céleste|Chérubin|Il passe dans un silence',
    'ANGLE|Coin|Encoignure|Point de vue',
    'ANIMAL|Bête|Être vivant|Brute',
    'ANIS|Plante au goût de réglisse|Il parfume le pastis|Graine aromatique',
    'ANNEAU|Bague|Cercle de métal|Rond autour de Saturne',
    'ANNEE|Période de douze mois|Millésime|Bissextile tous les quatre ans',
    'ANNEES|Périodes de douze mois|Millésimes|Décennies, par dix',
    'ANNONCE|Avis au public|Petite, dans le journal|Déclaration aux cartes',
    'ANS|Années|Printemps, pour l’âge|Ils s’accumulent sur le gâteau',
    'ANTENNE|Récepteur sur le toit|Organe de l’insecte|Succursale',
    'APPEL|Coup de fil|Cri pour faire venir|Recours en justice',
    'APPELER|Téléphoner|Héler|Nommer',
    'APPETIT|Faim|Envie|Bon … !',
    'APPUI|Soutien|Aide|Point d’… : base',
    'APRES|Ensuite|Plus tard|Contraire d’avant',
    'APTE|Capable|Qualifié|Bon pour le service',
    'APTES|Capables|Qualifiés|Bons pour le service',
    'ARAIGNEE|Tisseuse de toile|Bête à huit pattes|Crabe, sur la plage',
    'ARBRE|Chêne ou hêtre|Il a des branches|Il cache la forêt',
    'ARBRES|Chênes ou hêtres|Ils ont des branches|Ils cachent la forêt',
    'ARC|Arme de Robin des Bois|Il lance des flèches|Voûte courbe',
    'ARCHE|Voûte|Bateau de Noé|Pont de pierre',
    'ARCHITECTE|Bâtisseur|Concepteur de maisons|Maître d’œuvre',
    'ARCS|Armes de Robin|Voûtes courbes|Courbes',
    'ARDENT|Brûlant|Fougueux|Passionné',
    'ARE|Cent mètres carrés|Surface agraire|Petite mesure de terrain',
    'ARENE|Amphithéâtre|Lieu de corrida|Piste sablée',
    'ARENES|Amphithéâtres|Lieux de corrida|Pistes sablées',
    '°ARES|Surfaces agraires|Centaines de mètres carrés|Petites mesures de champ',
    'ARETE|Os de poisson|Ligne de crête|Méfiance dans la sole',
    'ARETES|Os de poisson|Lignes de crête|Angles vifs',
    'ARGENT|Métal précieux|Monnaie|Il ne fait pas le bonheur',
    'ARGILE|Terre de potier|Glaise|Le potier la façonne',
    'ARME|Fusil ou épée|Instrument de combat|Équipé pour se battre',
    'ARMEE|Troupe|Forces militaires|Grande muette',
    'ARMES|Blason|Fusils et épées|À déposer pour faire la paix',
    'ARMOIRE|Meuble à vêtements|Penderie|Grand costaud, familièrement',
    'ARRET|Halte|Station de bus|Décision de justice',
    'ARRETS|Haltes|Stations de bus|Décisions de justice',
    'ARRIVE|Parvient|Survient|Parvenu à destination',
    'ARRIVER|Parvenir|Survenir|Toucher au but',
    'ARROSER|Donner à boire aux plantes|Mouiller|Fêter en trinquant',
    'ART|Talent|Beauté créée|Le septième est le cinéma',
    'ARTICLE|Papier de journal|Objet en vente|Le ou la',
    'ARTISTE|Créateur|Peintre|Comédien',
    'ARTS|Beaux ou martiaux|Peinture, danse…|Métiers d’…',
    'AS|Champion|Carte maîtresse|Il en a dans sa manche',
    'ASILE|Lieu de refuge|Abri politique|Havre',
    'ASILES|Refuges|Abris|Havres',
    'ASPECT|Allure|Apparence|Facette d’un problème',
    'ASPECTS|Allures|Apparences|Facettes',
    'ASPIRATEUR|Appareil de ménage|Engin à poussière|Il fait le vide',
    'ASSEZ|Suffisamment|Plutôt|Ça suffit !',
    'ASSIETTE|On y mange|Plate ou creuse|Pas dans son … : mal fichu',
    'ASSIS|Sur une chaise|Installé|Bien établi',
    'ASTRE|Étoile|Corps céleste|Le Soleil en est un',
    'ASTRES|Étoiles|Corps célestes|Planètes',
    'ASTUCE|Ruse|Truc malin|Bonne idée',
    'ASTUCES|Ruses|Trucs malins|Bonnes idées',
    'ATELIER|Local d’artisan|Salle de l’artiste|Séance pratique',
    'ATLAS|Recueil de cartes|Titan portant le monde|Première vertèbre',
    'ATOME|Particule|Brique de la matière|Il a un noyau',
    'ATOMES|Particules|Briques de la matière|Noyaux et électrons',
    'ATOUT|Avantage|Carte gagnante|Point fort',
    'ATRE|Foyer de cheminée|Coin du feu|Pierre de la flambée',
    'ATTAQUE|Assaut|Offensive|Crise soudaine',
    'ATTENDRE|Patienter|Faire le pied de grue|Espérer',
    'ATTENTE|Patience|File devant le guichet|Espérance',
    'AU|Article contracté|À le, en un mot|… revoir !',
    'AUBE|Point du jour|Lever du jour|Robe du communiant',
    'AUBERGE|Hôtellerie|Relais|… espagnole : fourre-tout',
    'AUBES|Points du jour|Levers du jour|Robes de communiants',
    'AUCUN|Pas un|Nul|Personne',
    'AUDACE|Hardiesse|Culot|Toupet',
    'AUNE|Ancienne mesure|Arbre des rivières|Mesurer à l’… de',
    'AURORE|Première lueur|Naissance du jour|Boréale près du pôle',
    'AURORES|Premières lueurs|Naissances du jour|Boréales près du pôle',
    'AUSSI|De même|Également|Pareillement',
    'AUTANT|Tant|En même quantité|… en emporte le vent',
    'AUTEL|Table de l’église|Lieu de sacrifice|On y conduit la mariée',
    'AUTELS|Tables de l’église|Lieux de sacrifice|On y conduit les mariées',
    'AUTEUR|Écrivain|Créateur|Responsable du méfait',
    'AUTO|Voiture|Bagnole|Préfixe du soi-même',
    'AUTOMNE|Saison des feuilles mortes|Après l’été|Saison des vendanges',
    'AUTOROUTE|Voie rapide|Route à péage|A6, par exemple',
    'AUTOS|Voitures|Bagnoles|Véhicules',
    'AUTOUR|Aux alentours|Rapace|Tout près',
    'AUTRE|Différent|Pas le même|Un … jour',
    'AUTRES|Différents|Pas les mêmes|Les gens d’à côté',
    'AUX|Article contracté pluriel|À les|Préposition pluriel',
    'AVAL|Cours inférieur|Garantie|Donner son …',
    'AVALER|Engloutir|Ingurgiter|Croire, naïvement',
    'AVANCE|Progrès|Prêt d’argent|Gagne du terrain',
    'AVANCER|Progresser|Prêter de l’argent|Pousser un pion',
    'AVANT|Plus tôt|Proue du navire|Attaquant au rugby',
    'AVARE|Grippe-sou|Harpagon|Radin',
    'AVE|Prière à Marie|Salutation latine|… Maria',
    'AVEC|En compagnie de|Muni de|Ensemble',
    'AVENIR|Futur|Lendemain|Il appartient aux lève-tôt',
    'AVENTURE|Péripétie|Épopée|Liaison passagère',
    'AVENUE|Grande rue|Boulevard|Les Champs-Élysées en sont une',
    'AVERSE|Pluie soudaine|Ondée|Grain passager',
    'AVEU|Confession|Reconnaissance d’une faute|Il soulage la conscience',
    'AVEUGLE|Non-voyant|Qui ne voit rien|L’amour l’est, dit-on',
    'AVEZ|Possédez|Vous … raison|Détenez',
    'AVION|Appareil volant|Il décolle|Long-courrier',
    'AVIS|Opinion|Sentiment personnel|Communiqué',
    'AVOCAT|Défenseur|Il plaide|Fruit vert à gros noyau',
    'AVOIR|Posséder|Crédit du client|Duper, familièrement',
    'AVRIL|Mois des poissons|Quatrième mois|Ne te découvre pas d’un fil',
    'AXE|Pivot|Ligne centrale|Grande route',
    'AXES|Pivots|Lignes centrales|Grandes routes',
    'AZUR|Bleu du ciel|Côte méditerranéenne|Bleu d’un ciel sans nuage',
    /* B */
    'BAC|Examen du lycée|Bachot|Bateau passeur',
    'BACS|Examens du lycée|Bateaux passeurs|Récipients',
    'BAGAGE|Valise|Paquetage|Savoir acquis',
    'BAGARRE|Rixe|Échauffourée|Pugilat',
    'BAGUE|Anneau au doigt|Bijou de fiançailles|Jonc',
    'BAGUETTE|Pain long|Outil de la fée|Bâton du chef d’orchestre',
    'BAIE|Petite anse|Fruit rouge des bois|Grande fenêtre',
    'BAIGNER|Tremper|Mettre à l’eau|Ça … : tout va bien',
    'BAIN|Baignoire remplie|Trempette|Dans le … : au courant',
    'BAISER|Bisou|Embrasser|Marque d’affection',
    'BAISSE|Diminution|Chute des prix|Courbe la tête',
    'BAL|Soirée dansante|Guinche|Musette ou masqué',
    'BALADE|Promenade|Tour à pied|Virée',
    'BALAI|Il chasse la poussière|Monture de sorcière|Coup de … : renvoi',
    'BALANCE|Instrument de pesée|Signe du zodiaque|Mouchard, en argot',
    'BALCON|Terrasse en saillie|Galerie de théâtre|Promontoire de Juliette',
    'BALEINE|Géant des mers|Cétacé à fanons|Tige de parapluie',
    'BALLE|Petite sphère de jeu|Projectile|Franc, jadis, en argot',
    'BALLERINE|Danseuse étoile|Chausson plat|Petit rat devenu grand',
    'BALLON|Il est rond|Montgolfière|Verre à pied',
    'BALS|Soirées dansantes|Guinguettes|Fêtes du 14 Juillet',
    'BAN|Applaudissements rythmés|Proclamation|Mettre au … : exclure',
    'BANANE|Fruit jaune|Coiffure rock|Sac ventral',
    'BANC|Siège public|Groupe de poissons|… des accusés',
    'BANDE|Ruban|Groupe de copains|Pansement',
    'BANQUE|Établissement financier|Elle gère les comptes|Caisse du casino',
    'BANQUIER|Financier|Gestionnaire de fonds|Tient la caisse au casino',
    'BANS|Applaudissements rythmés|Proclamations|Publications de mariage',
    'BAR|Café|Comptoir|Loup de mer',
    'BARBE|Poils au menton|Quel ennui !|Postiche du père Noël',
    'BARBECUE|Grill|Gril de jardin|Grillade en plein air',
    'BARQUE|Petit bateau|Canot|On la mène bien ou mal',
    'BARRE|Tige de métal|Gouvernail|Trait tiré',
    'BARS|Cafés|Comptoirs|Loups de mer',
    'BAS|Contraire de haut|Chaussette fine|Vil',
    'BASILIC|Herbe du pistou|Aromate|Reptile mythique',
    'BASSE|Peu élevée|Voix grave|Guitare du rythme',
    'BASSIN|Pièce d’eau|Ceinture pelvienne|Région minière',
    'BAT|Frappe|Vainc|Il … la mesure',
    'BATAILLE|Combat|Jeu de cartes|Lutte',
    'BATEAU|Navire|Embarcation|Monter un … : tromper',
    'BATIR|Construire|Édifier|Fonder',
    'BATON|Canne|Tige de bois|Il se met dans les roues',
    'BATS|Frappes|Vaincs|Tu … la mesure',
    'BATTRE|Frapper|Vaincre|Fouetter des œufs',
    'BAVARD|Causeur|Pipelette|Il a la langue bien pendue',
    'BAVE|Salive|Écume|Trace d’escargot',
    'BEAU|Joli|Superbe|Il fait … : pas de pluie',
    'BEAUCOUP|Énormément|Plein|Très',
    'BEAUTE|Charme|Splendeur|Grain de … : mouche',
    'BEBE|Nourrisson|Poupon|Il fait ses dents',
    'BEBES|Nourrissons|Poupons|Petits enfants',
    'BEC|Bouche d’oiseau|Pointe de plume|Clouer le … : faire taire',
    'BECS|Bouches d’oiseaux|Pointes de plume|Gourmands, familièrement',
    'BEE|Grande ouverte|Bouche … : ébahi|Stupéfaite',
    'BEES|Grandes ouvertes|Ébahies|Stupéfaites',
    'BELLE|Jolie|Partie décisive|Se faire la … : s’évader',
    'BELLES|Jolies|Parties décisives|Évasions',
    'BENIR|Consacrer|Remercier le ciel|Faire le signe de croix sur',
    'BERCEAU|Lit du bébé|Couffin|Lieu d’origine',
    'BERET|Coiffe basque|Couvre-chef plat|Galette de laine',
    'BERETS|Coiffes basques|Couvre-chefs plats|Galettes de laine',
    'BERGE|Rive|Bord de rivière|Talus',
    'BERGER|Gardien de moutons|Pâtre|Chien de troupeau',
    'BESOIN|Nécessité|Manque|Pauvreté',
    'BETE|Animal|Idiot|… comme ses pieds',
    'BETES|Animaux|Idiots|Bestioles',
    'BETISE|Sottise|Ânerie|Bonbon de Cambrai',
    'BETON|Ciment|Matériau de chantier|Solide, familièrement',
    'BEURRE|Tartiné le matin|Produit laitier|Faire son … : s’enrichir',
    'BIBLE|Livre sacré|Les deux Testaments|Ouvrage de référence',
    'BICYCLETTE|Vélo|Petite reine|Deux-roues à pédales',
    'BIDON|Récipient|Faux, factice|Ventre, familièrement',
    'BIEN|Correct|Contraire de mal|Propriété',
    'BIENS|Propriétés|Possessions|Richesses',
    'BIENTOT|Sous peu|Dans peu de temps|À … !',
    'BIERE|Blonde ou brune|Boisson houblonnée|Cercueil',
    'BIFTECK|Tranche de bœuf|Steak|Gagner son … : son pain',
    'BIJOU|Parure|Joyau|Chef-d’œuvre',
    'BIJOUTIER|Joaillier|Orfèvre|Marchand de bagues',
    'BILAN|Récapitulatif|Compte de résultats|Point final',
    'BILLE|Petite boule de verre|Tête, familièrement|Stylo à …',
    'BILLET|Ticket|Coupure de banque|Petit mot',
    'BIS|Encore !|Deux fois|Pain gris',
    'BISCUIT|Gâteau sec|Petit-beurre|Porcelaine non émaillée',
    'BISE|Baiser sur la joue|Vent du nord|Frais souffle d’hiver',
    'BISOU|Bise|Baiser d’enfant|Smack',
    'BLAGUE|Plaisanterie|Farce|Pochette à tabac',
    'BLAME|Réprimande|Reproche|Sanction',
    'BLANC|Couleur de neige|Vin de Chablis|Espace vide',
    'BLE|Céréale du pain|Froment|Argent, en argot',
    'BLES|Céréales|Froments|Épis dorés',
    'BLESSER|Meurtrir|Offenser|Faire mal',
    'BLESSURE|Plaie|Coupure|Offense',
    'BLEU|Couleur du ciel|Ecchymose|Novice',
    'BLEUS|Couleurs du ciel|Ecchymoses|Novices',
    'BLOC|Masse|Carnet de feuilles|Pâté de maisons',
    'BLOND|Couleur des blés|Doré|Tête de Viking',
    'BLOQUER|Coincer|Immobiliser|Barrer la route',
    'BLOUSE|Tablier|Chemisier|Vêtement de l’écolier d’antan',
    'BOA|Serpent constricteur|Écharpe de plumes|Il étouffe ses proies',
    'BOAS|Serpents constricteurs|Écharpes de plumes|Grands reptiles',
    'BOEUF|Bovin de labour|Il tire la charrue|Groupe improvisé de jazz',
    'BOIRE|Avaler un liquide|Se désaltérer|Il y a à … et à manger',
    'BOIS|Forêt|Matière des arbres|Cornes du cerf',
    'BOITE|Carton|Discothèque|Mettre en … : se moquer',
    'BOL|Récipient à café|Chance, en argot|Grand … d’air',
    'BOLS|Récipients|Coupelles|Chances, en argot',
    'BON|Délicieux|Coupon|Généreux',
    'BONBON|Friandise|Sucrerie|Douceur des enfants',
    'BOND|Saut|Élan brusque|Faux … : absence',
    'BONHEUR|Félicité|Grande joie|Il est dans le pré',
    'BONJOUR|Salut du matin|Formule de politesse|Simple comme …',
    'BONNET|Couvre-chef de laine|Coiffe d’hiver|Gros … : ponte',
    'BONS|Délicieux|Coupons|Généreux',
    'BORD|Lisière|Rivage|Côté du navire',
    'BOSQUET|Petit bois|Massif d’arbustes|Taillis',
    'BOSSE|Grosseur|Enflure|Signe du chameau',
    'BOSSES|Grosseurs|Enflures|Dos du chameau',
    'BOTTE|Chaussure haute|Gerbe|Coup d’escrime',
    'BOTTES|Chaussures hautes|Gerbes|Coups d’escrime',
    'BOUC|Mâle de la chèvre|Barbiche|… émissaire',
    'BOUCHE|Organe de la parole|Orifice|Grille d’égout',
    'BOUCHER|Commerçant en viande|Obstruer|Tailleur de côtes',
    'BOUCHERIE|Étal de viande|Carnage|Commerce du steak',
    'BOUCLE|Anneau|Mèche frisée|Circuit fermé',
    'BOUDER|Faire la tête|Se renfrogner|Faire la moue',
    'BOUE|Fange|Terre mouillée|Gadoue',
    'BOUGER|Remuer|Se déplacer|Changer de place',
    'BOUGIE|Chandelle|Elle éclaire le gâteau|Pièce de moteur',
    'BOULANGER|Mitron|Artisan du pain|Il pétrit la pâte',
    'BOULE|Sphère|Pétanque|Perdre la … : s’affoler',
    'BOUQUET|Gerbe de fleurs|Arôme du vin|C’est le … !',
    'BOUQUIN|Livre|Ouvrage, familièrement|Vieux bouc',
    'BOURSE|Porte-monnaie|Aide aux études|Palais Brongniart',
    'BOUT|Extrémité|Pointe|Morceau',
    'BOUTIQUE|Magasin|Échoppe|Commerce',
    'BOUTON|Il ferme la chemise|Pustule|Bourgeon',
    'BRACELET|Bijou du poignet|Gourmette|Jonc',
    'BRAISE|Charbon ardent|Tison|Regard de …',
    'BRANCHE|Rameau|Discipline|Côté de la famille',
    'BRAS|Membre supérieur|Entre épaule et main|Accoudoir',
    'BRAVE|Courageux|Bon, honnête|Vaillant',
    'BRAVO|Félicitations !|Applaudissement|Hourra !',
    'BREF|Court|En résumé|Concis',
    'BRETON|Du Finistère|Langue celtique|Habitant d’Armorique',
    'BRICOLER|Réparer soi-même|Bidouiller|Faire de petits travaux',
    'BRIDE|Rêne|Lien du chapeau|À … abattue : très vite',
    'BRIE|Fromage de Meaux|Pâte molle|Région près de Paris',
    'BRILLER|Luire|Scintiller|Se faire remarquer',
    'BRIN|Tige fine|Filament|Un … de : un peu de',
    'BRIO|Virtuosité|Entrain|Talent éclatant',
    'BRIQUE|Pierre rouge|Carton de lait|Million, en argot',
    'BRISE|Vent léger|Zéphyr|Mis en morceaux',
    'BROC|Pichet|Récipient à anse|Cruche',
    'BROCHE|Bijou épinglé|Tige à rôtir|Fil de fer',
    'BROCOLI|Chou vert|Légume en bouquets|Petit arbre comestible',
    'BROSSE|Pour les dents ou les cheveux|Coupe courte|Outil de peintre',
    'BROUETTE|Chariot à une roue|Outil du maçon|Course à deux en tenant les jambes',
    'BROUILLARD|Brume épaisse|Purée de pois|Il noie le paysage',
    'BRU|Belle-fille|Épouse du fils|Membre de la famille par alliance',
    'BRUIT|Son|Tapage|Rumeur',
    'BRULER|Flamber|Incendier|Griller un feu rouge',
    'BRUME|Brouillard léger|Voile de vapeur|Nappe grise sur la mer',
    'BRUN|Châtain foncé|Couleur de la châtaigne|Marron',
    'BRUSQUE|Soudain|Rude|Sans ménagement',
    'BRUT|Sans traitement|Grossier|Champagne sec',
    'BU|Avalé|Descendu d’un trait|Pris un verre',
    'BUCHE|Bois de chauffage|Gâteau de Noël|Chute, familièrement',
    'BUE|Avalée|Descendue|Sirotée',
    'BUFFET|Meuble de salle à manger|Repas debout|Danser devant le … : jeûner',
    'BULLE|Globule d’air|Phylactère|Coincer la … : paresser',
    'BUREAU|Table de travail|Lieu de travail|Direction élue',
    'BUS|Autobus|Transport en commun|Avalés',
    'BUSE|Rapace|Sot|Conduit',
    'BUSTE|Torse|Poitrine|Sculpture sans jambes',
    'BUT|Objectif|Point marqué|Cage de foot',
    'BUTS|Objectifs|Points au foot|Filets du gardien',
    /* C */
    'CA|Cela, en abrégé|Le moi et le …|Siège des pulsions',
    'CAB|Cabriolet|Voiture de louage|Fiacre anglais',
    'CABINET|Bureau|Toilettes|Gouvernement',
    'CADEAU|Présent|Surprise emballée|Ce n’est pas un … : pas facile',
    'CADRAN|Face de montre|Tableau gradué|Solaire, sur un mur',
    'CADRE|Bordure de tableau|Employé supérieur|Décor',
    'CAFE|Petit noir|Bistrot|Expresso',
    'CAGE|Prison d’oiseau|Loge du fauve|… d’escalier',
    'CAHIER|Bloc de feuilles|Carnet d’écolier|… des charges',
    'CAILLOU|Pierre|Galet|Crâne chauve, en argot',
    'CAISSE|Boîte|Guichet de magasin|Voiture, en argot',
    'CAISSES|Boîtes|Guichets de magasin|Voitures, en argot',
    'CALCUL|Opération|Arithmétique|Pierre au rein',
    'CALE|Coin|Fond de navire|Arrête le moteur',
    'CALIN|Caresse tendre|Doux|Tendresse',
    'CALME|Tranquille|Sérénité|Paisible',
    'CAMARADE|Collègue|Condisciple|Frère d’armes',
    'CAMION|Poids lourd|Semi-remorque|Il fait les livraisons',
    'CAMIONS|Poids lourds|Semi-remorques|Bahuts',
    'CAMP|Bivouac|Clan|Ficher le … : partir',
    'CAMPAGNE|Rase …|Milieu rural|Opération militaire',
    'CAMPING|Terrain de tentes|Vacances en plein air|Caravanes alignées',
    'CANAL|Voie d’eau|Chaîne de télé|Venise en est pleine',
    'CANAPE|Sofa|Divan|Toast garni',
    'CANARD|Palmipède|Fausse note|Journal, familièrement',
    'CANE|Femelle du canard|Palmipède femelle|Oiseau de mare',
    'CANICULE|Forte chaleur|Été brûlant|Coup de chaud',
    'CANNE|Bâton|Tige de roseau|… à pêche',
    'CANON|Pièce d’artillerie|Belle femme, familièrement|Chant à plusieurs voix décalées',
    'CANOT|Petite embarcation|Chaloupe|… de sauvetage',
    'CAP|Pointe de terre|Direction|Franchir le …',
    'CAPABLE|Apte|Compétent|Susceptible de',
    'CAPE|Manteau sans manches|Pèlerine|Rire sous …',
    'CAPITAINE|Chef d’équipe|Commandant de navire|Officier',
    'CAPITAL|Essentiel|Fortune|Grand A',
    'CAPOT|Couvercle du moteur|Carrosserie avant|Battu à plate couture aux cartes',
    'CAPRICE|Lubie|Fantaisie|Colère d’enfant gâté',
    'CAR|Autocar|Parce que|Conjonction de cause',
    'CARAFE|Pichet|Bouteille à eau|Rester en … : en rade',
    'CARAMEL|Sucre fondu|Bonbon doré|Couleur blond foncé',
    'CARESSE|Câlin|Effleurement tendre|Geste doux',
    'CARESSES|Câlins|Effleurements|Gestes doux',
    'CARNAVAL|Défilé masqué|Mardi gras|Fête de Nice',
    'CARNET|Calepin|Agenda|… de notes',
    'CAROTTE|Légume orange|Appât pour âne|Échantillon de sol',
    'CAROTTES|Légumes orange|Racines croquantes|Les … sont cuites',
    'CARRE|Figure à quatre côtés|Au … : puissance deux|Coin de jardin',
    'CARREAU|Vitre|Couleur de cartes|Rester sur le … : au sol',
    'CARS|Bus de tourisme|Véhicules d’excursion|Parce que, en vieux français',
    'CARTABLE|Sac d’écolier|Serviette|Il pèse sur le dos',
    'CARTE|Plan|Menu|As ou valet',
    'CARTON|Emballage|Invitation|Faire un … : réussir',
    'CAS|Situation|Exemple|En tout …',
    'CASE|Compartiment|Hutte|Carré de la grille',
    'CASES|Compartiments|Huttes|Carrés de la grille',
    'CASQUE|Protection de tête|Écouteurs|Coiffure du pompier',
    'CASSER|Briser|Rompre|Annuler un jugement',
    'CASSEROLE|Poêlon|Récipient à manche|Chanter comme une …',
    'CAUCHEMAR|Mauvais rêve|Hantise|Rêve qui fait peur',
    'CAUSE|Motif|Origine|Défense',
    'CAUSES|Motifs|Origines|Défenses',
    'CAVALIER|Jockey|Pièce d’échecs|Danseur',
    'CAVE|Cellier|Sous-sol|Naïf, en argot',
    'CE|Démonstratif|… soir-là|… n’est rien',
    'CEDER|Abandonner|Plier|Vendre',
    'CEINTURE|Lien de taille|Bande autour des reins|Noire au judo',
    'CELA|Ça|Ce truc-là|Pronom démonstratif',
    'CELEBRE|Connu|Illustre|Fameux',
    'CENDRE|Résidu du feu|Poussière grise|Mercredi des …',
    'CENT|Dix fois dix|Années d’un siècle|Mille divisé par dix',
    'CENTRE|Milieu|Cœur|Mouche de la cible',
    'CEP|Pied de vigne|Souche|Tronc tortueux',
    'CEPS|Pieds de vigne|Souches|Champignons des bois',
    'CERCEAU|Arceau|Anneau de jeu|Rond de gymnastique',
    'CERCLE|Rond|Club|Tour complet',
    'CEREALE|Blé ou orge|Grain|Flocon du matin',
    'CERF|Grand cervidé|Il brame|Il porte des bois',
    'CERISE|Fruit rouge|Bigarreau|… sur le gâteau',
    'CERISES|Fruits rouges|Bigarreaux|Griottes',
    'CERTAIN|Sûr|Évident|Quelqu’un',
    'CERVEAU|Matière grise|Organe de la pensée|Tête pensante',
    'CES|Démonstratif pluriel|Ceux-là, en adjectif|… gens-là',
    'CESSER|Arrêter|Interrompre|Prendre fin',
    'CET|Démonstratif masculin|… homme-là|… été-là',
    'CHACUN|Tout le monde|Chaque personne|À … son goût',
    'CHAGRIN|Peine|Tristesse|Cuir grenu',
    'CHAINE|Suite d’anneaux|Programme de télé|Montagnes alignées',
    'CHAISE|Siège|Siège à dossier|… longue',
    'CHALEUR|Canicule|Température élevée|Ardeur',
    'CHAMBRE|Pièce pour dormir|Assemblée|… à air',
    'CHAMEAU|Il a deux bosses|Méchante personne|Vaisseau du désert',
    'CHAMP|Terrain cultivé|Domaine|Sur-le-… : aussitôt',
    'CHAMPION|Vainqueur|Tenant du titre|As',
    'CHANCE|Veine|Hasard heureux|Bol',
    'CHANGER|Modifier|Transformer|Troquer',
    'CHANSON|Refrain|Air populaire|C’est toujours la même …',
    'CHANT|Mélopée|Cri du coq|Partie d’une épopée',
    'CHANTEUR|Vocaliste|Ténor|Interprète',
    'CHANTIER|Travaux|Désordre|Lieu de construction',
    'CHAPEAU|Couvre-chef|Bravo !|Coiffe du champignon',
    'CHAPITRE|Partie de livre|Section|Assemblée de chanoines',
    'CHAQUE|Tout|Chacun des|Distributif',
    'CHARBON|Houille|Combustible noir|Être sur des … ardents',
    'CHARGE|Fardeau|Responsabilité|Attaque',
    'CHARIOT|Caddie|Carriole|Wagonnet',
    'CHARME|Attrait|Envoûtement|Arbre des haies',
    'CHARPENTE|Ossature du toit|Squelette|Poutres',
    'CHASSE|Traque|Poursuite|Tirer la …',
    'CHAT|Matou|Il ronronne|On lui donne sa langue',
    'CHATEAU|Palais|Forteresse|… de sable',
    'CHATON|Jeune minou|Pierre d’une bague|Fleur du noisetier',
    'CHAUD|Brûlant de fièvre|Chaleureux|Tiède, en mieux',
    'CHAUFFER|Tiédir|Augmenter la température|Voler, en argot',
    'CHAUSSETTE|Mi-bas|Bas court|Socquette',
    'CHAUSSURE|Soulier|Escarpin|Trouver … à son pied',
    'CHEF|Patron|Cuisinier en toque|Tête',
    'CHEMIN|Sentier|Route|Parcours',
    'CHEMINEE|Âtre|Conduit de fumée|Cratère volcanique',
    'CHEMINER|Avancer|Marcher|Progresser lentement',
    'CHEMISE|Vêtement à col|Dossier cartonné|Donner sa … : être généreux',
    'CHENE|Arbre noble|Il donne des glands|Solide comme un …',
    'CHENILLE|Future papillon|Larve velue|Danse en file',
    'CHER|Coûteux|Aimé|Onéreux',
    'CHERCHER|Fouiller|Aller quérir|Tenter de trouver',
    'CHERCHEUR|Savant|Scientifique|Prospecteur',
    'CHEVAL|Coursier|Monture|Équidé',
    'CHEVALIER|Cavalier noble|Paladin|Preux',
    'CHEVEU|Poil de la tête|Couper les … en quatre|Il y a un … : un problème',
    'CHEVRE|Biquette|Bique|Ménager la … et le chou',
    'CHIEN|Toutou|Il aboie|Meilleur ami de l’homme',
    'CHIFFRE|Nombre|Code secret|Montant',
    'CHOC|Heurt|Collision|Émotion forte',
    'CHOCOLAT|Cacao|Tablette brune|Noir ou au lait',
    'CHOCOLATS|Bonbons de cacao|Pralinés|Boîte offerte à Noël',
    'CHOEUR|Chorale|Ensemble de chanteurs|En … : ensemble',
    'CHOISIR|Opter|Sélectionner|Trier',
    'CHOIX|Option|Sélection|Embarras du …',
    'CHOSE|Objet|Truc|Machin',
    'CHOU|Légume vert|Pâtisserie|Mon … : mon chéri',
    'CI|Ici, en bref|Par-… par-là|Celui-…',
    'CIDRE|Boisson de pomme|Breuvage normand|Il pétille en Bretagne',
    'CIEL|Firmament|Voûte céleste|Paradis',
    'CIELS|Firmaments|Baldaquins|… de lit',
    'CIGALE|Elle chante l’été|Insecte du Midi|Elle danse chez La Fontaine',
    'CIGOGNE|Échassier|Elle apporte les bébés|Oiseau d’Alsace',
    'CIL|Poil de paupière|Il protège l’œil|Il bat avec ses voisins',
    'CILS|Poils des paupières|Franges des yeux|On les bat',
    'CIME|Sommet|Faîte|Pointe de l’arbre',
    'CINEMA|Septième art|Salle obscure|Faire son … : comédie',
    'CINQ|Doigts d’une main|Nombre premier impair|Moins de six',
    'CIRE|Matière des bougies|Encaustique|Bouchon d’oreille',
    'CIRES|Matières des bougies|Encaustiques|Bouchons d’oreille',
    'CIRQUE|Chapiteau|Spectacle de clowns|Pagaille',
    'CISEAUX|Outil pour couper|Lames croisées|Saut en gymnastique',
    'CITE|Ville|Nommé|Quartier populaire',
    'CITRON|Agrume acide|Jaune et amer|Tête, en argot',
    'CITROUILLE|Courge orange|Potiron|Carrosse de Cendrillon',
    'CLAIR|Lumineux|Limpide|… de lune',
    'CLAN|Tribu|Famille|Bande',
    'CLAQUE|Gifle|Soufflet|Groupe d’applaudisseurs payés',
    'CLASSE|Salle de cours|Catégorie|Élégance',
    'CLAVIER|Touches|Piano|Synthétiseur',
    'CLE|Elle ouvre la serrure|Solution|Signe sur la portée',
    'CLEF|Clé|Solution|… de voûte',
    'CLES|Trousseau|Solutions|Signes de portée',
    'CLIENT|Acheteur|Consommateur|Il est roi',
    'CLIENTS|Acheteurs|Consommateurs|Ils sont rois',
    'CLIGNER|Battre des paupières|Plisser les yeux|Faire signe de l’œil',
    'CLIMAT|Temps|Ambiance|Météo moyenne',
    'CLOCHE|Elle sonne|Campane|Nul, en argot',
    'CLOCHER|Tour d’église|Campanile|Boiter',
    'CLOU|Pointe de métal|Furoncle|… du spectacle',
    'CLOWN|Auguste|Pitre du cirque|Il a le nez rouge',
    'COCHON|Porc|Sale|Il ne faut pas le jeter',
    'COCO|Noix des tropiques|Ami, familièrement|Communiste, jadis',
    'COEUR|Organe vital|Centre|Siège des sentiments',
    'COEURS|Organes vitaux|Centres|Couleur de cartes',
    'COFFRE|Caisse à trésor|Malle arrière|Poitrine, familièrement',
    'COIFFEUR|Figaro|Barbier|Artiste du cheveu',
    'COIN|Angle|Endroit|Cale en bois',
    'COL|Encolure|Passage en montagne|… blanc : employé',
    'COLERE|Rage|Fureur|Mauvaise humeur',
    'COLLE|Glu|Question piège|Retenue à l’école',
    'COLLEGUE|Confrère|Associé|Camarade de bureau',
    'COLLER|Fixer|Adhérer|Recaler à un examen',
    'COLLIER|Bijou du cou|Chaîne|Lien du chien',
    'COLLINE|Butte|Mont|Mamelon',
    'COLOMBE|Oiseau de paix|Pigeon blanc|Symbole de l’Esprit',
    'COLS|Passages en montagne|Encolures|… blancs',
    'COMA|Perte de conscience|Sommeil profond|État végétatif',
    'COMBAT|Lutte|Bataille|Affrontement',
    'COMBLE|Grenier|Summum|Plein à craquer',
    'COMEDIEN|Acteur|Cabotin|Tragédien',
    'COMME|Ainsi que|De même que|Puisque',
    'COMMENT|De quelle façon|Pardon ?|Pourquoi et …',
    'COMMERCE|Négoce|Boutique|Échange',
    'COMPAGNON|Camarade|Partenaire|Artisan du Tour de France',
    'COMPAS|Instrument à cercles|Boussole marine|Avoir le … dans l’œil',
    'COMPTE|Calcul|Somme|… en banque',
    'COMTE|Fromage du Jura|Noble titré|Seigneur d’un fief',
    'CONCERT|Récital|Spectacle musical|De … : ensemble',
    'CONCOURS|Épreuve de sélection|Examen sélectif|… de circonstances',
    'CONE|Pomme de pin|Forme pointue|Cornet de glace',
    'CONES|Pommes de pin|Formes pointues|Cornets de glace',
    'CONFIANCE|Assurance|Foi en l’autre|Crédit',
    'CONFITURE|Gelée|Fruits au sucre|Pot de … de fraises',
    'CONFORT|Aisance|Bien-être|Commodité',
    'CONGE|Vacances|Licenciement|Permission',
    'CONNAITRE|Savoir|Avoir entendu parler de|Éprouver',
    'CONSEIL|Avis|Recommandation|… des ministres',
    'CONSOLE|Table murale|Manette de jeu|Tableau de bord',
    'CONTE|Histoire|Récit merveilleux|Il était une fois',
    'CONTINENT|Afrique ou Europe|Terre émergée|Masse terrestre',
    'CONTRE|Opposé à|Près de|Pour et …',
    'COPAIN|Pote|Frère d’armes, en civil|Il est de la bande',
    'COPIE|Reproduction|Imitation|Devoir rendu',
    'COPIES|Reproductions|Imitations|Devoirs rendus',
    'COQ|Volaille mâle|Il chante à l’aube|Emblème gaulois',
    'COQS|Chanteurs de l’aube|Volailles mâles|Beaux parleurs',
    'COQUE|Carcasse du navire|Mollusque à valves|Œuf à la …',
    'COQUELICOT|Fleur rouge des champs|Pavot sauvage|Ponceau',
    'COQUILLE|Écaille|Faute d’impression|Rentrer dans sa …',
    'CORBEAU|Oiseau noir|Auteur anonyme de lettres|Croa-croa',
    'CORDE|Filin|Lien tressé|Sauter à la …',
    'CORNE|Arme du taureau|Klaxon ancien|Pli de page',
    'CORPS|Organisme|Anatomie|Cadavre',
    'CORRECT|Juste|Convenable|Poli',
    'COSTAUD|Balèze|Fort|Robuste',
    'COSTUME|Complet|Habit|Déguisement',
    'COTE|Littoral|Os de la cage thoracique|Flanc',
    'COTES|Littoraux|Os de la cage thoracique|Flancs',
    'COTON|Fibre blanche|Tissu|C’est … : difficile',
    'COTTE|Armure de mailles|Salopette|Vêtement de travail',
    'COU|Il relie la tête|Nuque et gorge|Il est long chez la girafe',
    'COUCHE|Strate|Lange|Lit, poétiquement',
    'COUCOU|Oiseau qui squatte|Pendule suisse|Salut !',
    'COUDE|Articulation du bras|Tournant|Jouer des …s',
    'COULEUR|Teinte|Nuance|Atout, à la belote',
    'COULOIR|Corridor|Passage|Piste de l’athlète',
    'COUP|Choc|Frappe|Boire un …',
    'COUPE|Trophée|Verre évasé|Taille de cheveux',
    'COUPER|Trancher|Tailler|Diluer le vin',
    'COUPLE|Duo|Paire|Moment d’une force',
    'COUR|Espace ouvert|Tribunal|Faire la … : séduire',
    'COURAGE|Bravoure|Vaillance|Cran',
    'COURIR|Galoper|Filer à toutes jambes|Tu peux toujours … !',
    'COURS|Leçon|Avenue|Cotation en bourse',
    'COURSE|Compétition|Commissions|Trajet en taxi',
    'COURT|Bref|Terrain de tennis|Petit',
    'COUS|Nuques|Encolures|Gorges',
    'COUSIN|Fils de l’oncle|Parent|Moustique',
    'COUSSIN|Oreiller|Pouf|Carreau moelleux',
    'COUTEAU|Lame|Ustensile tranchant|Coquillage allongé',
    'COUTURIER|Styliste|Créateur de mode|Tailleur de robes',
    'COUVERT|Nappe et assiettes|Nuageux|À … : à l’abri',
    'COUVERTURE|Couette|Plaid|Prétexte',
    'CRABE|Crustacé|Tourteau|Il marche de côté',
    'CRAIE|Calcaire blanc|Bâton du tableau noir|Roche tendre',
    'CRAINDRE|Redouter|Avoir peur de|Appréhender',
    'CRAN|Entaille|Courage|Encoche de ceinture',
    'CRAPAUD|Batracien|Grenouille verrue|Petit fauteuil',
    'CRAVATE|Nœud de cou|Accessoire de costume|Lavallière',
    'CRAYON|Mine|Outil à dessin|Coup de …',
    'CRAYONS|Mines|Outils à dessin|Pastels',
    'CREE|Inventé|Fondé|Conçu',
    'CREES|Inventés|Fondés|Conçus',
    'CREME|Chantilly|Onguent|Élite',
    'CREPE|Galette|Tissu gaufré|Spécialité bretonne sucrée',
    'CREUX|Vide|Cavité|Heure de moindre affluence',
    'CREVETTE|Crustacé rose|Bouquet|Petit gringalet',
    'CRI|Hurlement|Éclat de voix|Dernier … : mode',
    'CRIER|Hurler|Brailler|… au loup',
    'CRIME|Meurtre|Assassinat|Forfait',
    'CRINIERE|Poils du lion|Chevelure abondante|Cou du cheval',
    'CRIS|Hurlements|Éclats de voix|Clameurs',
    'CRISE|Poussée de fièvre|Période grave|Récession',
    'CROC|Dent pointue|Canine|Avoir les …s : avoir faim',
    'CROCHET|Hameçon|Parenthèse carrée|Détour',
    'CROIRE|Penser|Avoir foi|Estimer',
    'CROISSANT|Viennoiserie|Lune partielle|Grandissant',
    'CROIX|Symbole chrétien|Marque d’un illettré|Chemin de …',
    'CROUTE|Écorce du pain|Plaie sèche|Mauvais tableau',
    'CRU|Pas cuit|Vignoble|Grand … : bon vin',
    'CRUE|Montée des eaux|Pas cuite|Débordement',
    'CRUSTACE|Crabe ou homard|Décapode|Fruit de mer',
    'CUBE|Hexaèdre|Dé|Puissance trois',
    'CUILLERE|Ustensile à soupe|Petite pelle de table|Leurre de pêche',
    'CUIR|Peau tannée|Blouson|Tanné',
    'CUISINE|Pièce des repas|Art culinaire|Magouille',
    'CUISINIER|Chef|Maître queux|Cordon-bleu',
    'CUISSE|Haut de la jambe|Pilon de poulet|Sortie de celle de Jupiter',
    'CUIT|Pas cru|Rôti|Fichu, familièrement',
    'CUITS|Pas crus|Rôtis|Fichus',
    'CUIVRE|Métal rouge|Trompette|Instrument de fanfare',
    'CULTURE|Agronomie|Érudition|Ce qui reste après oubli',
    'CURE|Traitement|Presbytère|Prêtre de paroisse',
    'CURES|Traitements|Presbytères|Prêtres de paroisse',
    'CURIEUX|Indiscret|Étrange|Fouineur',
    'CUVE|Réservoir|Bac|Récipient à vin',
    'CYCLE|Période|Vélo|Suite d’étapes',
    'CYGNE|Oiseau blanc|Il a un long cou|Son chant est le dernier',
    /* D */
    'DAIM|Cervidé|Cuir suédé|Chamois',
    'DAME|Femme|Reine aux cartes|Pion couronné',
    'DANGER|Péril|Risque|Menace',
    'DANS|À l’intérieur de|En|D’ici … une heure',
    'DANSE|Valse ou tango|Ballet|Mener la …',
    'DANSER|Valser|Guincher|Faire des entrechats',
    'DANSEUSE|Ballerine|Étoile|En … : debout sur les pédales',
    'DARD|Aiguillon|Pointe|Javelot',
    'DATE|Jour précis|Échéance|Quantième',
    'DATES|Jours précis|Échéances|Quantièmes',
    'DAUPHIN|Cétacé joueur|Successeur désigné|Fils aîné du roi',
    'DAUPHINE|Épouse de l’héritier|Région de Grenoble|Pommes …',
    'DE|Cube à jouer|À coudre, il protège|Jeté par César',
    'DEBOUT|Levé|Sur ses jambes|Pas couché',
    'DEBUT|Commencement|Origine|Premiers pas',
    'DECHET|Ordure|Rebut|Résidu',
    'DECIDER|Trancher|Résoudre|Arrêter',
    'DECOR|Cadre|Toile de fond de scène|Paysage',
    'DEDANS|À l’intérieur|Intérieur|Mettre … : tromper',
    'DEFAUT|Imperfection|Travers|Faire … : manquer',
    'DEFENDRE|Protéger|Interdire|Plaider pour',
    'DEGAT|Dommage|Casse|Ravage',
    'DEGATS|Dommages|Casse|Ravages',
    'DEGRE|Échelon|Mesure de température|Niveau',
    'DEHORS|À l’extérieur|Au grand air|Apparences',
    'DEJA|Dès maintenant|Auparavant|Comment s’appelle-t-il, … ?',
    'DELAI|Sursis|Répit|Terme',
    'DELAIS|Sursis|Répits|Termes',
    'DELICE|Régal|Plaisir exquis|Pur bonheur',
    'DEMAIN|Le jour suivant|Futur proche|Ce n’est pas … la veille',
    'DEMANDE|Requête|Question|Offre et …',
    'DEMENAGER|Changer de logement|Emménager ailleurs|Déguerpir',
    'DEMEURE|Maison|Domicile|Mettre en …',
    'DEMI|Moitié|Verre de bière|Joueur de rugby',
    'DENI|Refus|Négation|… de justice',
    'DENT|Elle croque|Molaire|Avoir une … contre quelqu’un',
    'DENTELLE|Tissu ajouré|Point d’Alençon|Ne pas faire dans la …',
    'DENTISTE|Chirurgien des caries|Soigneur de molaires|Stomatologue',
    'DEPART|Envol|Commencement|Ligne de …',
    'DEPOT|Entrepôt|Sédiment|Consigne',
    'DEPUTE|Élu|Parlementaire|Membre de l’Assemblée',
    'DERNIER|Ultime|Final|Lanterne rouge',
    'DERNIERS|Ultimes|Finaux|Lanternes rouges',
    'DES|Articles indéfinis|Cubes de jeu|Petits cubes à six faces',
    'DESERT|Sahara|Lieu vide|Abandonné',
    'DESERTS|Saharas|Lieux vides|Abandonnés',
    'DESIR|Envie|Souhait|Convoitise',
    'DESIRS|Envies|Souhaits|Convoitises',
    'DESSERT|Douceur de fin de repas|Gâteau final|Il suit le fromage',
    'DESSIN|Croquis|Illustration|… animé',
    'DESSINER|Croquer|Tracer|Esquisser',
    'DESSOUS|En bas|Lingerie|Coulisses d’une affaire',
    'DESSUS|En haut|Surface|Prendre le …',
    'DETAIL|Précision|Broutille|Vente au …',
    'DETAILS|Précisions|Broutilles|Ventes au …',
    'DETOUR|Crochet|Méandre|Sans … : franchement',
    'DETTE|Somme due|Ardoise|Créance',
    'DETTES|Sommes dues|Ardoises|Créances',
    'DEUIL|Affliction|Perte d’un proche|Faire son … de',
    'DEUX|Paire|Couple|Un plus un',
    'DEVANT|En face de|Avant|Façade',
    'DEVENIR|Se transformer en|Avenir|Évolution',
    'DEVINER|Trouver|Pressentir|Percer à jour',
    'DEVISE|Maxime|Monnaie étrangère|Slogan',
    'DEVOIR|Obligation|Exercice scolaire|Être redevable',
    '°DIA|Hue et …|Cri pour faire tourner à gauche|Ordre au cheval',
    'DIABLE|Démon|Lucifer|Chariot à deux roues',
    'DIAMANT|Pierre précieuse|Carbone pur|Il est éternel, dit-on',
    'DICTEE|Exercice d’orthographe|Épreuve de Pivot|Texte lu à voix haute',
    'DIETE|Régime|Jeûne|Assemblée politique',
    'DIEU|Créateur|Divinité|Le Tout-Puissant',
    'DIGNE|Honorable|Méritant|Noble',
    'DIGUE|Jetée|Barrage|Rempart contre la mer',
    'DIMANCHE|Jour du Seigneur|Fin de semaine|Jour de repos',
    'DINDE|Volaille de Noël|Femme sotte|Oiseau glouglou',
    'DINER|Repas du soir|Souper|Manger le soir',
    'DINERS|Repas du soir|Soupers|Festins du soir',
    'DIRE|Parler|Affirmer|Raconter',
    'DIRECT|Sans détour|En … : en live|Coup de poing',
    'DIRECTEUR|Patron|Dirigeant|Chef de service',
    'DISCOURS|Allocution|Harangue|Laïus',
    'DISQUE|Vinyle|Palet|Rond',
    'DISTANCE|Écart|Éloignement|Kilométrage',
    'DIT|Raconté|Surnommé|Récit en vers',
    'DIVA|Cantatrice|Star|Prima donna',
    'DIVAN|Canapé|Sofa|Siège du psychanalyste',
    'DIX|Nombre|Doigts des deux mains|Huit plus deux',
    'DO|Note qui ouvre la gamme|Ut moderne|Premier degré de la gamme',
    'DOCILE|Obéissant|Soumis|Sage comme une image',
    'DOCTEUR|Médecin|Toubib|Titre universitaire',
    'DODO|Sommeil|Faire …|Oiseau disparu',
    'DOIGT|Pouce ou index|Petite quantité|Il porte la bague',
    'DOIGTS|Pouces et index|Bouts de la main|Ils se croisent pour la chance',
    'DOMAINE|Propriété|Terrain|Spécialité',
    'DOME|Coupole|Voûte|Cathédrale italienne',
    'DOMICILE|Adresse|Demeure|Résidence',
    'DOMINO|Pièce de jeu|Effet en chaîne|Déguisement de bal',
    'DON|Cadeau|Talent|Offrande',
    'DONC|Par conséquent|Ainsi|Alors',
    'DONJON|Tour de château|Réduit fortifié|Tour maîtresse',
    'DONNER|Offrir|Céder|Distribuer',
    'DORADE|Poisson doré|Daurade|Poisson grillé',
    'DORE|Couleur d’or|Rissolé|Poisson de lac',
    'DORMIR|Sommeiller|Faire dodo|Roupiller',
    'DOS|Échine|Verso|Arrière du corps',
    'DOSSIER|Chemise cartonnée|Appui de chaise|Affaire en cours',
    'DOT|Apport de la mariée|Présent de noces|Biens de la fiancée',
    'DOTE|Équipé|Pourvu|Doué',
    'DOUANE|Contrôle aux frontières|Service de taxes|Péage des marchandises',
    'DOUANIER|Gabelou|Agent des frontières|Peintre naïf',
    'DOUBLE|Deux fois plus|Copie|Sosie',
    'DOUCE|Tendre|Suave|En … : discrètement',
    'DOUCEUR|Gentillesse|Tendresse|Friandise',
    'DOUCHE|Ablution|Jet d’eau|Déception',
    'DOUE|Talentueux|Doté d’un don|Pourvu',
    'DOULEUR|Souffrance|Mal|Peine',
    'DOUTE|Incertitude|Hésitation|Sans … : sûrement',
    'DOUX|Tendre|Moelleux|Clément',
    'DOUZE|Onze plus un|Nombre de mois|Apôtres autour du Christ',
    'DRAGEE|Bonbon de baptême|Amande sucrée|Pilule enrobée',
    'DRAGON|Monstre ailé|Crache-feu|Soldat à cheval',
    'DRAME|Tragédie|Catastrophe|Pièce sérieuse',
    'DRAP|Linge de lit|Étoffe|Dans de beaux … : en difficulté',
    'DRAPEAU|Étendard|Emblème|Bannière',
    'DROIT|Rectiligne|Juste|Loi',
    'DROITE|Ligne|Côté opposé à la gauche|Tendance politique',
    'DROLE|Amusant|Comique|Bizarre',
    'DU|Article partitif|Somme à régler|Mérité',
    'DUC|Noble|Hibou|Grand … : rapace',
    'DUE|Méritée|Somme à payer|Exigible',
    'DUEL|Combat singulier|Face-à-face|Affrontement',
    'DUELS|Combats singuliers|Face-à-face|Affrontements',
    'DUES|Méritées|Sommes à payer|Exigibles',
    'DUNE|Colline de sable|Relief du désert|Mont du Pilat',
    'DUO|Paire|Couple d’artistes|Chant à deux',
    'DUOS|Paires|Couples d’artistes|Chants à deux',
    'DUR|Solide|Pénible|Coriace',
    'DURE|Pénible|Coriace|Persiste',
    'DUREE|Temps|Laps|Longueur',
    'DURS|Solides|Pénibles|Coriaces',
    'DUT|Fut obligé|Était redevable|Il … partir',
    'DUVET|Plumes fines|Édredon|Premiers poils',
    /* E */
    'EAU|Liquide vital|H2O|Elle dort quand elle est calme',
    'EAUX|Fleuves et rivières|Liquides vitaux|Perdre les … : accoucher',
    'ECART|Distance|Différence|Grand … : figure de danse',
    'ECARTS|Distances|Différences|Grands … : figures de danse',
    'ECHANGE|Troc|Commerce|Dialogue',
    'ECHARPE|Cache-nez|Foulard|Bandeau du maire',
    'ECHEC|Revers|Insuccès|… et mat',
    'ECHELLE|Escabeau|Proportion|Barreaux à grimper',
    'ECHO|Son répercuté|Nymphe amoureuse|Rumeur',
    'ECLAIR|Lueur d’orage|Pâtisserie au café|Rapide',
    'ECLAT|Fragment|Brillance|Rire aux …s',
    'ECLORE|S’ouvrir|Naître|Fleurir',
    'ECLUSE|Sas de canal|Barrage mobile|Porte d’eau',
    'ECOLE|Établissement scolaire|Lieu d’apprentissage|Buissonnière',
    'ECOLIER|Élève|Potache|Bambin en classe',
    'ECORCE|Peau de l’arbre|Zeste|Enveloppe rugueuse',
    'ECOUTER|Entendre|Tendre l’oreille|Obéir',
    'ECRAN|Moniteur|Toile de cinéma|Paravent',
    'ECRANS|Moniteurs|Toiles de cinéma|Paravents',
    'ECRIRE|Rédiger|Composer|Correspondre',
    'ECRIVAIN|Auteur|Romancier|Homme de lettres',
    'ECU|Monnaie ancienne|Bouclier|Blason',
    'ECUME|Mousse|Bave|Lie',
    'ECUREUIL|Rongeur roux|Il fait des réserves|Mangeur de noisettes',
    'ECURIE|Box|Étable à chevaux|Équipe de course',
    'ECUS|Monnaies anciennes|Boucliers|Pièces d’argent',
    'EDEN|Paradis terrestre|Jardin d’Adam|Lieu de délices',
    'EDENS|Paradis terrestres|Jardins de délices|Lieux enchanteurs',
    'EDIT|Loi royale|Ordonnance|Décret de Nantes',
    'EDITS|Lois royales|Ordonnances|Décrets',
    'EFFACER|Gommer|Supprimer|Faire oublier',
    'EFFET|Conséquence|Impression|Sous l’… de',
    'EFFORT|Peine|Travail|Fournir un …',
    'EGAL|Pareil|Identique|Ça m’est …',
    'EGLISE|Lieu de culte|Temple|Paroisse',
    'EGO|Moi|Amour-propre|Il gonfle chez le vaniteux',
    'EGOUT|Canalisation|Cloaque|Bouche d’…',
    'EH|Interjection d’appel|Hé !|… bien !',
    'ELAN|Impulsion|Cervidé du Nord|Enthousiasme',
    'ELANS|Impulsions|Cervidés du Nord|Enthousiasmes',
    'ELECTION|Scrutin|Vote|Choix',
    'ELEGANT|Chic|Distingué|Raffiné',
    'ELEPHANT|Pachyderme|Mammouth moderne|Il a une mémoire',
    'ELEVE|Écolier|Apprenti|Haut',
    'ELEVER|Hausser|Éduquer|Nourrir un troupeau',
    'ELFE|Lutin|Génie de l’air|Petit être magique',
    'ELLE|Pronom féminin|Pas lui|Magazine féminin',
    'ELLES|Pronoms féminins|Ces dames|Pas eux',
    'ELU|Désigné|Député|Choisi',
    'ELUE|Désignée|Choisie|Députée',
    'ELUES|Désignées|Choisies|Députées',
    'ELUS|Députés|Désignés|Choisis',
    'EMAIL|Vernis vitrifié|Courriel|Surface des dents',
    'EMBARRAS|Gêne|Trouble|… du choix',
    'EMIR|Prince arabe|Chef musulman|Gouverneur du Golfe',
    'EMIRS|Princes arabes|Chefs musulmans|Gouverneurs du Golfe',
    'EMOTION|Trouble|Sentiment|Frisson',
    'EMPIRE|Royaume|Domination|Style napoléonien',
    'EMPLOI|Travail|Usage|Poste',
    'EMPORTER|Prendre avec soi|Enlever|Vaincre',
    'EMU|Touché|Attendri|Bouleversé',
    'EMUE|Touchée|Attendrie|Bouleversée',
    'EMUS|Touchés|Attendris|Oiseaux australiens',
    'EN|Préposition de lieu|… avant !|Pronom adverbial',
    'ENCLOS|Parc|Pré clôturé|Enceinte',
    'ENCLUME|Masse de forge|Bloc du forgeron|Os de l’oreille',
    'ENCORE|Toujours|De nouveau|Bis !',
    'ENCRE|Liquide de stylo|Jet de seiche|Tache de plume',
    'ENCRIER|Petit pot de bureau|Réservoir du porte-plume|Accessoire d’écolier d’antan',
    'ENDROIT|Lieu|Recto|Place',
    'ENFANCE|Jeunesse|Premier âge|Origine',
    'ENFANT|Gamin|Bambin|Rejeton',
    'ENFER|Géhenne|Supplice|Lieu du diable',
    'ENFIN|Finalement|Pour conclure|Il était temps !',
    'ENIGME|Devinette|Mystère|Rébus',
    'ENNEMI|Adversaire|Rival|Opposant',
    'ENNUI|Lassitude|Souci|Tracas',
    'ENNUIS|Lassitudes|Soucis|Tracas',
    'ENORME|Gigantesque|Colossal|Incroyable',
    'ENQUETE|Investigation|Sondage|Recherche policière',
    'ENSEMBLE|Tous|Groupe|Tailleur assorti',
    'ENTIER|Complet|Total|Intact',
    'ENTRE|Parmi|Au milieu de|Pénètre',
    'ENTREE|Hall|Hors-d’œuvre|Accès',
    'ENTREES|Halls|Hors-d’œuvre|Accès',
    'ENTREPRISE|Société|Firme|Projet audacieux',
    'ENVELOPPE|Pli|Couverture|Budget',
    'ENVERS|Revers|À l’égard de|À l’… : sens dessus dessous',
    'ENVIE|Désir|Jalousie|Tache de naissance',
    'ENVOL|Décollage|Départ|Élan',
    'ENVOYER|Expédier|Lancer|Poster',
    '°EON|Âge du monde|Éternité|Division gnostique',
    '°EONS|Âges du monde|Éternités|Divisions gnostiques',
    'EPAIS|Gros|Dense|Touffu',
    'EPAULE|Haut du bras|Articulation|Coup d’… : aide',
    'EPAVE|Débris|Carcasse|Navire coulé',
    'EPEE|Arme blanche|Glaive|Lame du mousquetaire',
    'EPEES|Armes blanches|Glaives|Lames de mousquetaires',
    'EPI|Tête de blé|Grappe de grains|Mèche rebelle',
    'EPICE|Condiment|Aromate|Poivre ou cannelle',
    'EPICERIE|Commerce de quartier|Alimentation|Supérette',
    'EPICES|Condiments|Aromates|Poivre et cannelle',
    'EPICIER|Commerçant|Marchand de primeurs|Détaillant du coin',
    'EPINARD|Légume vert|Aliment de Popeye|Feuille riche en fer',
    'EPINE|Piquant|Aiguillon|Colonne vertébrale',
    'EPINES|Piquants|Aiguillons|Couronne du Christ',
    'EPIS|Têtes de blé|Mèches rebelles|Grappes de grains',
    'EPOPEE|Aventure héroïque|Saga|Chanson de geste',
    'EPOQUE|Période|Ère|Temps',
    'EPOUX|Mari|Conjoint|Moitié',
    'EPREUVE|Test|Examen|Malheur',
    'EQUATEUR|Ligne du globe|Pays d’Amérique du Sud|Parallèle zéro',
    'EQUILIBRE|Stabilité|Harmonie|Numéro du funambule',
    'EQUIPE|Groupe|Formation|Onze de départ',
    'ERABLE|Arbre du Canada|Son sirop est canadien|Feuille rouge',
    'ERE|Époque|Période géologique|Âge',
    'ERES|Époques|Périodes|Âges géologiques',
    '°ERG|Désert de dunes|Unité de travail|Mer de sable',
    '°ERGS|Déserts de dunes|Mers de sable|Unités de travail',
    'ERREUR|Faute|Bévue|Méprise',
    'ERREURS|Fautes|Bévues|Méprises',
    'ES|Tu … là ?|Deuxième personne d’être|Tu … bien matinal',
    'ESCALADE|Varappe|Montée|Surenchère',
    'ESCALIER|Marches|Montée|Colimaçon',
    'ESCARGOT|Gastéropode|Colimaçon|Lent comme lui',
    'ESCRIME|Sport du fleuret|Art du duel|Combat à l’épée',
    'ESPACE|Étendue|Univers|Intervalle',
    'ESPACES|Étendues|Univers|Intervalles',
    'ESPADRILLE|Chaussure de toile|Sandale basque|Semelle de corde',
    'ESPOIR|Espérance|Attente|Jeune talent',
    'ESPOIRS|Espérances|Attentes|Jeunes talents',
    'ESPRIT|Intelligence|Humour|Fantôme',
    'ESSAI|Tentative|Test|But au rugby',
    'ESSAIS|Tentatives|Tests|Buts au rugby',
    'ESSENCE|Carburant|Parfum|Nature profonde',
    'ESSIEU|Axe de roues|Pièce de charrette|Barre des roues',
    'EST|Orient|Levant|Point cardinal',
    'ESTIME|Considération|Respect|Navigation à l’…',
    'ET|Conjonction de coordination|Plus, en bref|Mot de liaison',
    'ETABLE|Écurie|Bouverie|Abri des vaches',
    'ETAGE|Niveau|Palier|Degré',
    'ETAGERE|Rayon|Tablette|Rayonnage',
    'ETAGES|Niveaux|Paliers|Degrés',
    'ETAIT|Existait|Il … une fois|Se trouvait',
    'ETAL|Comptoir de boucher|Table de marché|Présentoir',
    'ETALON|Cheval reproducteur|Référence|Mesure type',
    'ETALS|Comptoirs de boucher|Tables de marché|Présentoirs',
    'ETANG|Mare|Plan d’eau|Réservoir à carpes',
    'ETAPE|Halte|Phase|Pause',
    'ETAPES|Haltes|Phases|Pauses',
    'ETAT|Nation|Condition|Situation',
    'ETATS|Nations|Conditions|Situations',
    'ETAU|Presse|Outil de serrage|Mâchoires d’établi',
    'ETE|Saison chaude|Participe d’être|Période des vacances',
    'ETEINT|Arrêté|Sans éclat|Fermé, pour une lampe',
    'ETEINTS|Arrêtés|Sans éclat|Fermés, pour des lampes',
    'ETES|Saisons chaudes|Vous … ici|Belles saisons',
    'ETHER|Anesthésique|Ciel|Fluide subtil',
    'ETINCELLE|Flammèche|Lueur|Esprit brillant',
    'ETOFFE|Tissu|Toile|Envergure',
    'ETOILE|Astre|Vedette|Placette parisienne',
    'ETRANGE|Bizarre|Curieux|Insolite',
    'ETRANGER|Inconnu|Autre pays|Hors de chez soi',
    'ETRE|Exister|Individu|Créature',
    'ETRES|Créatures|Individus|Personnes',
    'ETROIT|Serré|Exigu|Borné',
    'ETUDE|Travail|Examen|Office notarial',
    'ETUDES|Travaux|Examens|Offices notariaux',
    'ETUI|Boîte|Fourreau|Gaine',
    'ETUIS|Boîtes|Fourreaux|Gaines',
    'EU|Participe d’avoir|Obtenu|Possédé',
    'EUE|Possédée|Obtenue|Trompée',
    'EUES|Possédées|Obtenues|Trompées',
    'EURO|Monnaie de l’Union|Devise commune|Pièce de un',
    'EUROS|Monnaies de l’Union|Devises communes|Pièces de la zone',
    'EUS|Possédas|Obtins|Tu … de la chance',
    'EUT|Posséda|Obtint|Il … raison',
    'EUX|Pronom pluriel|Ces gens-là|Pas nous',
    'EVASION|Fuite|Cavale|Dépaysement',
    'EVENEMENT|Fait|Incident|Actualité',
    'EVIER|Bac de cuisine|Plonge|On y fait la vaisselle',
    'EXAMEN|Épreuve|Contrôle|Étude attentive',
    'EXCES|Abus|Débordement|Démesure',
    'EXCUSE|Prétexte|Pardon|Justification',
    'EXEMPLE|Modèle|Cas|Par … !',
    'EXERCICE|Entraînement|Devoir|Année comptable',
    'EXIL|Bannissement|Expatriation|Départ forcé',
    'EXPERT|Spécialiste|Connaisseur|Habile',
    'EXPLOIT|Prouesse|Performance|Haut fait',
    'EXPRES|Volontairement|Pli urgent|Pas par hasard',
    /* F */
    'FA|Note sous le sol|Clé de …|Quatrième note',
    'FABLE|Récit moral|Apologue|Mensonge',
    'FACE|Visage|Côté pile opposé|Faire … : affronter',
    'FACHE|Irrité|En colère|Brouillé',
    'FACILE|Aisé|Simple|Enfantin',
    'FACON|Manière|Sans … : simplement|Main-d’œuvre',
    'FACTEUR|Postier|Élément|Il sonne toujours deux fois',
    'FACTURE|Note|Addition|Style d’une œuvre',
    'FADE|Insipide|Sans saveur|Terne',
    'FAIBLE|Chétif|Frêle|Point …',
    'FAILLIR|Manquer|Être sur le point de|Tomber en faute',
    'FAIM|Appétit|Fringale|Creux à l’estomac',
    'FAIRE|Fabriquer|Créer|Réaliser',
    'FAISAN|Gibier à plumes|Oiseau de chasse|Escroc',
    'FAIT|Événement réel|Accompli|Prendre sur le …',
    'FALAISE|Escarpement|Côte abrupte|Étretat en a une célèbre',
    'FAMILLE|Parenté|Clan|Air de …',
    'FAMILLES|Foyers|Clans|Tribus',
    'FANFARE|Orchestre de cuivres|Clique|Ostentation',
    'FANTOME|Spectre|Revenant|Esprit errant',
    'FAON|Petit de la biche|Jeune cerf|Bambi',
    'FARANDOLE|Danse provençale|Ronde|Chaîne dansante',
    'FARCE|Blague|Hachis de remplissage|Comédie bouffonne',
    'FARD|Maquillage|Poudre|Parler sans …',
    'FARDEAU|Charge|Poids|Boulet',
    'FARINE|Poudre de blé|Base du pain|Rouler dans la …',
    'FARINES|Poudres de blé|Bases du pain|Moutures',
    'FATIGUE|Épuisement|Lassitude|Coup de pompe',
    'FAUCON|Rapace|Oiseau de proie dressé|Partisan de la guerre',
    'FAUTE|Erreur|Péché|Manquement',
    'FAUTEUIL|Siège confortable|Place à l’Académie|Bergère',
    'FAUTEUILS|Sièges confortables|Places de théâtre|Bergères',
    'FAUVE|Lion ou tigre|Roux|Peintre de 1905',
    'FAUX|Erroné|Inexact|Outil du moissonneur',
    'FAVEUR|Grâce|Privilège|Ruban',
    'FEE|Magicienne|Elle a une baguette|Clochette en est une',
    'FEES|Magiciennes|Marraines de conte|Elles ont des baguettes',
    'FELIN|Chat ou tigre|Souple|Carnassier griffu',
    'FEMME|Épouse|Dame|Madame',
    'FENETRE|Croisée|Baie vitrée|Jeter l’argent par la …',
    'FER|Métal gris|Outil à repasser|Croiser le …',
    'FERME|Exploitation agricole|Solide|Tais-toi !',
    'FERMER|Clore|Boucler|Verrouiller',
    'FERMETURE|Clôture|Arrêt|Éclair ou à glissière',
    'FERMIER|Agriculteur|Paysan|Exploitant',
    'FERS|Chaînes|Outils à repasser|Tomber les quatre … en l’air',
    'FESTIN|Banquet|Régal|Ripaille',
    'FETE|Réjouissance|Anniversaire|Faire la … : s’amuser',
    'FEU|Flamme|Incendie|Défunt',
    'FEUILLAGE|Ramure|Frondaison|Verdure',
    'FEUILLE|Page|Elle tombe à l’automne|Oreille, en argot',
    'FEUTRE|Crayon|Chapeau mou|Étoffe pressée',
    'FEUX|Lumières|Signaux routiers|Tous … éteints',
    'FI|Marque le mépris|Faire … de : dédaigner|Pouah !',
    'FICELLE|Cordelette|Pain fin|Astuce',
    'FIDELE|Loyal|Constant|Paroissien',
    'FIEF|Domaine|Territoire|Chasse gardée',
    'FIER|Orgueilleux|Hautain|Se … : faire confiance',
    'FIEVRE|Température|Agitation|Samedi soir, elle danse',
    'FIGE|Immobile|Pétrifié|Coagulé',
    'FIGUE|Fruit du Midi|Fruit violet|Mi-… mi-raisin',
    'FIGURE|Visage|Illustration|Personnalité',
    'FIGURINE|Statuette|Santon|Petit personnage',
    'FIL|Brin|Filament|Au bout du …',
    'FILET|Rets|Morceau de bœuf|Petite quantité d’eau',
    'FILLE|Demoiselle|Enfant féminin|… de l’air : hôtesse',
    'FILM|Long-métrage|Pellicule|Couche fine',
    'FILOU|Escroc|Voleur|Tricheur',
    'FILS|Garçon|Héritier|… à papa',
    'FIN|Terme|Mince|Délicat',
    'FINI|Terminé|Achevé|Perdu',
    'FINIR|Achever|Terminer|Mourir',
    'FINS|Buts|Terminaisons|Délicats',
    'FIS|Réalisas|Fabriquai|Je … de mon mieux',
    'FISC|Impôts|Trésor public|Percepteur',
    'FIT|Réalisa|Fabriqua|Il … mouche',
    'FLAMME|Feu|Passion|Fanion pointu',
    'FLAN|Dessert|Crème prise|C’est du … : c’est faux',
    'FLAQUE|Mare|Nappe d’eau|Petit étang de pluie',
    'FLECHE|Trait|Indicateur|Pointe de clocher',
    'FLEUR|Rose ou tulipe|Élite|À … de peau',
    'FLEURI|Paré de pétales|Coloré|Orné',
    'FLEUVE|Grand cours d’eau|Rivière vers la mer|Roman …',
    'FLIC|Policier|Poulet|Agent, familièrement',
    'FLICS|Policiers|Poulets|Agents, familièrement',
    'FLOCON|Neige qui tombe|Petite touffe|Céréale écrasée',
    'FLOT|Vague|Afflux|Remettre à …',
    'FLOTTEUR|Bouchon de pêche|Bouée|Radeau',
    'FLUTE|Instrument à vent|Verre à champagne|Zut !',
    'FLUX|Écoulement|Marée montante|Débit',
    'FOI|Croyance|Confiance|Ma … !',
    'FOIE|Organe filtrant|Gros viscère|Crise de …',
    'FOIN|Herbe séchée|Fourrage|Faire du … : du tapage',
    'FOIRE|Marché|Fête foraine|Grand désordre',
    'FOIS|Coup|Occasion|Il était une …',
    'FOLIE|Démence|Extravagance|Petit château',
    'FONCTION|Rôle|Emploi|Charge officielle',
    'FOND|Bas|Arrière|Au … : en réalité',
    'FONDS|Capital|Terrain|Commerce',
    'FONDUE|Plat savoyard au caquelon|Emmental et comté liquéfiés|Neige au soleil',
    'FONTAINE|Source|Bassin public|Pleurer comme une …',
    'FORCE|Puissance|Vigueur|Obligation',
    'FORET|Bois|Sylve|Mèche de perceuse',
    'FORETS|Bois|Sylves|Mèches de perceuse',
    'FORGERON|Maréchal-ferrant|Ferronnier|Artisan de l’enclume',
    'FORME|Aspect|Silhouette|Condition physique',
    'FORT|Robuste|Citadelle|Doué',
    'FORTERESSE|Citadelle|Château imprenable|Bastion',
    'FOSSE|Trou|Tombe|Creux devant la scène',
    'FOSSES|Trous|Tombes|Creux profonds',
    'FOU|Aliéné|Pièce d’échecs|Bouffon du roi',
    'FOUDRE|Éclair|Tonnerre|Coup de … : amour soudain',
    'FOUET|Cravache|Batteur|De plein …',
    'FOUGERE|Plante des sous-bois|Plante sans fleurs|Verdure de forêt',
    'FOULE|Multitude|Masse|Affluence',
    'FOUR|Cuisinière|Échec au théâtre|Il chauffe le gâteau',
    'FOURCHETTE|Couvert à dents|Marge d’estimation|Belle … : gros mangeur',
    'FOURMI|Insecte travailleur|Elle n’est pas prêteuse|Picotement',
    'FOUS|Aliénés|Pièces d’échecs|Déments',
    'FOYER|Maison|Âtre|Hall de théâtre',
    'FRAGILE|Cassant|Délicat|Faible',
    'FRAIS|Frisquet|Dépenses|Nouveau',
    'FRAISE|Fruit rouge|Outil de dentiste|Col plissé ancien',
    'FRAMBOISE|Fruit rouge|Baie|Liqueur rose',
    'FRANC|Sincère|Monnaie d’autrefois|Coup … : coup de pied',
    'FRANGE|Bordure|Mèche sur le front|Marge',
    'FRAPPER|Cogner|Taper|Heurter',
    'FREIN|Ralentisseur|Mors|Obstacle',
    'FRERE|Frangin|Moine|Semblable',
    'FRET|Cargaison|Charge|Transport de marchandises',
    'FRIANDISE|Douceur|Gourmandise|Bouchée sucrée',
    'FRITE|Bâtonnet de pomme de terre|Accompagnement du steak|Avoir la …',
    'FROID|Frais|Glacial|Distant',
    'FROMAGE|Camembert|Laitage|Poste bien payé',
    'FROMAGER|Crémier|Marchand de camembert|Arbre tropical',
    'FRONT|Haut du visage|Ligne de combat|Audace',
    'FRONTIERE|Limite|Bord|Démarcation',
    'FRUIT|Pomme ou poire|Résultat|… défendu',
    'FUIR|S’échapper|Détaler|Couler goutte à goutte',
    'FUME|Fumant|Grille une cigarette|Saumon traité',
    'FUMEE|Vapeur|Nuage de feu|Pas de … sans feu',
    'FUMER|Griller une cigarette|Boucaner|Engraisser la terre',
    'FUS|Je … surpris|Existai|Tu … élu',
    'FUSEE|Engin spatial|Feu d’artifice|Projectile',
    'FUSIL|Carabine|Arme à feu|Aiguiseur',
    'FUT|Tonneau|Tronc de colonne|Exista',
    'FUTE|Malin|Astucieux|Rusé',
    'FUTUR|Avenir|Temps à venir|Fiancé',
    /* G */
    'GAI|Joyeux|Enjoué|Rieur',
    'GAIE|Joyeuse|Enjouée|Rieuse',
    'GAIN|Profit|Bénéfice|Avoir … de cause',
    'GALA|Soirée de prestige|Réception|Fête mondaine',
    'GALAXIE|Voie lactée|Amas d’étoiles|Univers',
    'GALET|Caillou poli|Pierre de plage|Rond de la grève',
    'GAMIN|Gosse|Enfant|Espiègle',
    'GANT|Mitaine|Moufle|Il va comme un …',
    'GANTS|Moufles|Protège-mains|Boxeurs en portent',
    'GARAGE|Abri pour voiture|Atelier de mécanique|Remise',
    'GARCON|Gamin|Fils|Serveur de café',
    'GARDE|Surveillance|Vigile|Mise en …',
    'GARDER|Conserver|Surveiller|Veiller sur',
    'GARDERIE|Crèche|Halte d’enfants|Nursery',
    'GARDIEN|Surveillant|Goal|Concierge',
    'GARE|Station de train|Attention !|Terminus',
    'GARS|Garçons|Types|Mecs',
    'GATEAU|Pâtisserie|Tarte ou quatre-quarts|C’est du … : c’est facile',
    'GAUCHE|Maladroit|Côté du cœur|Senestre',
    'GAUFRE|Pâtisserie quadrillée|Galette de fête foraine|Rayon de miel',
    'GAVE|Torrent pyrénéen|Engraisse|Bourre',
    'GAZ|Fluide|Vapeur|Mettre les … : accélérer',
    'GAZE|Tissu léger|Compresse|Voile fin',
    'GAZON|Pelouse|Herbe tondue|Terrain vert',
    'GEANT|Colosse|Titan|Énorme',
    'GEANTS|Colosses|Titans|Énormes',
    'GEL|Glace|Gelée blanche|Pommade',
    'GELEE|Confiture de coing|Frimas|Aspic',
    'GELEES|Confitures de coing|Frimas|Aspics',
    'GELS|Glaces|Gelées blanches|Pommades',
    'GENDARME|Pandore|Agent|Hareng saur',
    'GENE|Embarras|Malaise|Unité d’hérédité',
    'GENERAL|Officier supérieur|Global|Commun',
    'GENIE|Esprit bienfaisant|Talent exceptionnel|Il sort de la lampe',
    'GENOU|Articulation de la jambe|Rotule|Faire du … : draguer',
    'GENRE|Sorte|Type|Allure',
    'GENS|Personnes|Monde|Public',
    'GENTIL|Aimable|Brave|Sage',
    'GESTE|Mouvement|Action|Chanson de …',
    'GESTES|Mouvements|Actions|Chansons de …',
    'GIBIER|Proie de chasse|Lièvre ou faisan|… de potence',
    'GIRAFE|Animal au long cou|Ruminant tacheté|Perche de micro',
    'GIROUETTE|Coq de clocher|Indicateur de vent|Opportuniste',
    'GIT|Est couché|Repose|Ci-…',
    'GITE|Abri|Logement rural|Repaire du lièvre',
    'GIVRE|Frimas|Cristaux de glace|Fou, familièrement',
    'GLACE|Sorbet|Miroir|Eau gelée',
    'GLACIER|Névé|Marchand de sorbets|Fleuve gelé',
    'GLAND|Fruit du chêne|Pompon|Nigaud, en argot',
    'GLAS|Tintement funèbre|Cloche des morts|Sonner le … de',
    'GLISSER|Déraper|Patiner|Insinuer',
    'GLOIRE|Célébrité|Renommée|Auréole',
    'GLU|Colle|Pot de colle|Importun collant',
    'GNOU|Antilope africaine|Bête de la savane|Buffle barbu',
    'GNOUS|Antilopes africaines|Bêtes de la savane|Buffles barbus',
    'GO|Jeu de pions japonais|Tout de … : sans détour|Jeu sur goban',
    'GOAL|Gardien de but|Portier|Dernier rempart',
    'GOBELET|Timbale|Verre en plastique|Cornet à dés',
    'GOLF|Sport de green|Dix-huit trous|Pantalon bouffant',
    'GOMME|Caoutchouc|Efface-crayon|À la … : sans valeur',
    'GORGE|Gosier|Défilé|Poitrine',
    'GORILLE|Grand singe|Garde du corps|King Kong',
    'GOSIER|Gorge|Pharynx|Avoir le … sec',
    'GOUDRON|Bitume|Asphalte|Chaussée noire',
    'GOURMAND|Glouton|Friand|Qui aime les douceurs',
    'GOUT|Saveur|Penchant|Élégance',
    'GOUTTE|Perle d’eau|Larme|Maladie des gourmets',
    'GRACE|Charme|Pardon|Élégance du geste',
    'GRADE|Rang|Échelon militaire|Galon',
    'GRAIN|Céréale|Averse soudaine|… de beauté',
    'GRAINE|Semence|Pépin|Mauvaise … : garnement',
    'GRAMMAIRE|Syntaxe|Règles de langue|Bescherelle',
    'GRAND|Élevé|Adulte|Célèbre',
    'GRANGE|Bâtiment de ferme|Fenil|Réserve de paille',
    'GRAPPE|Régime|Groupe de raisins|Foule serrée',
    'GRAS|Gros|Huileux|Mardi …',
    'GRATUIT|Offert|Sans frais|Sans motif',
    'GRAVE|Sérieux|Sourd, pour un son|Accent de à',
    'GRELE|Averse de glace|Pluie glacée|Fluet',
    'GRENADE|Fruit à grains|Engin explosif|Ville andalouse',
    'GRENIER|Combles|Mansarde|Réserve à foin',
    'GRENOUILLE|Batracien|Reinette|… de bénitier',
    'GRES|Roche sableuse|Poterie|Pavé dur',
    'GRILLE|Clôture|Barrière de fer|Tableau de mots',
    'GRIMACE|Moue|Rictus|Singerie',
    'GRIPPE|Influenza|Rhume sévère|Prendre en … : détester',
    'GRIS|Couleur de souris|Terne|Éméché',
    'GRONDER|Réprimander|Tonner|Rugir',
    'GROS|Épais|Corpulent|En … : globalement',
    'GROTTE|Caverne|Cavité naturelle|Antre',
    'GROUPE|Ensemble|Troupe|Orchestre',
    'GRUE|Échassier|Engin de levage|Faire le pied de …',
    'GRUES|Échassiers|Engins de levage|Pieds de … : attentes',
    'GUE|Passage à pied dans l’eau|Point peu profond|Traversée de rivière',
    'GUEPE|Insecte piqueur|Taille fine|Frelon',
    'GUERRE|Conflit armé|Bataille|De … lasse',
    'GUET|Surveillance|Faire le …|Poste de veille',
    'GUI|Plante de Noël|Porte-bonheur de l’an|Plante parasite',
    'GUICHET|Comptoir|Caisse|Petite ouverture',
    'GUIDE|Accompagnateur|Manuel|Scout',
    'GUIRLANDE|Feston|Décoration de Noël|Chaîne de fleurs',
    'GUITARE|Instrument à cordes|Six cordes|Folk ou électrique',
    'GYM|Gymnastique|Sport en salle|Exercices d’assouplissement',
    /* H */
    'HA|Unité de surface agricole|Rire écrit|Surprise brève',
    'HABIT|Vêtement|Costume|L’… ne fait pas le moine',
    'HABITANT|Résident|Occupant|Autochtone',
    'HABITER|Résider|Loger|Demeurer',
    'HACHE|Cognée|Outil de bûcheron|Enterrer la …',
    'HAIE|Clôture d’arbustes|Obstacle de course|Rangée de gardes',
    'HAINE|Aversion|Détestation|Contraire de l’amour',
    'HALE|Bronzé|Tiré|Remorqué',
    'HALL|Vestibule|Entrée|Grand salon d’hôtel',
    'HALLE|Marché couvert|Préau commercial|Pavillon Baltard',
    'HALTE|Arrêt|Pause|Stop !',
    'HAMAC|Lit suspendu|Filet de repos|Couchette de marin',
    'HAMEAU|Petit village|Lieu-dit|Quelques maisons',
    'HANCHE|Haut de la cuisse|Bassin|Tour de …',
    'HARICOT|Légume sec|Flageolet|La fin des …',
    'HARMONIE|Accord|Concorde|Fanfare',
    'HARO|Cri de réprobation|Crier … sur|Tollé',
    'HARPE|Instrument à cordes pincées|Lyre géante|Instrument des anges',
    'HASARD|Chance|Sort|Coïncidence',
    'HATE|Empressement|Précipitation|Impatience',
    'HAUSSE|Augmentation|Montée|Élévation',
    'HAUT|Élevé|Sommet|Fort, pour une voix',
    'HAUTEUR|Altitude|Taille|Fierté',
    'HE|Appel familier|Holà !|Pour interpeller',
    'HELICE|Spirale|Propulseur de bateau|Pale tournante',
    'HERBE|Gazon|Verdure|Mauvaise …',
    'HERBIER|Collection de plantes|Pré|Plantes séchées',
    'HERISSON|Mammifère à piquants|Boule épineuse|Brosse à cheminée',
    'HERITAGE|Succession|Legs|Patrimoine',
    'HERMINE|Fourrure blanche|Petit carnassier|Symbole breton',
    'HEROINE|Personnage central|Brave femme|Drogue dure',
    'HEROS|Brave|Personnage principal|Vainqueur',
    'HETRE|Arbre forestier|Il donne des faînes|Bois clair',
    'HEURE|Soixante minutes|Moment|À la bonne … !',
    'HEURES|Soixante minutes chacune|Moments|Livre de prières',
    'HEUREUX|Content|Ravi|Comblé',
    'HEURTER|Cogner|Choquer|Offenser',
    'HI|Petit rire|Rire étouffé|Cri de l’âne, à moitié',
    'HIBOU|Rapace nocturne|Chouette à aigrettes|Il hulule',
    'HIER|La veille|Jour passé|Le jour d’avant',
    'HIRONDELLE|Oiseau migrateur|Elle ne fait pas le printemps|Agent à vélo',
    'HISTOIRE|Récit|Passé|Chichis',
    'HIVER|Saison froide|Saison des frimas|Mauvaise saison',
    'HO|Cri d’appel|Oh, en inversé|Interjection d’arrêt',
    'HOCHET|Jouet de bébé|Grelot|Babiole',
    'HOLA|Arrêtez !|Stop !|Mettre le … : faire cesser',
    'HOMARD|Crustacé à pinces|Rouge une fois cuit|Langouste à pinces',
    'HOMMAGE|Tribut|Honneur rendu|Mes …s, madame',
    'HOMME|Monsieur|Humain|Mâle',
    'HONNETE|Probe|Loyal|Intègre',
    'HONNEUR|Dignité|Gloire|Fierté',
    'HONTE|Déshonneur|Opprobre|Embarras',
    'HOPITAL|Clinique|Établissement de soins|Il se moque de la charité',
    'HORAIRE|Emploi du temps|Par heure|Grille des départs',
    'HORIZON|Ligne lointaine|Perspective|Là où le ciel touche la terre',
    'HORLOGE|Pendule|Grande montre|Comtoise',
    'HORS|Excepté|À l’extérieur de|… de prix',
    'HOTE|Maître de maison|Invité|Aubergiste',
    'HOTEL|Palace|Auberge|… de ville',
    'HOTESSE|Maîtresse de maison|… de l’air|Accueillante',
    'HOULE|Vagues|Mouvement de la mer|Ondulation',
    'HOUX|Arbuste de Noël|Feuillage piquant|Baies rouges d’hiver',
    'HUE|Cri du charretier|Conspuée|… et dia',
    'HUER|Conspuer|Siffler|Crier contre',
    'HUILE|Liquide gras|Peinture à l’…|Personne importante, en argot',
    'HUIT|Sept plus un|Pattes d’une araignée|Figure de patinage',
    'HUITRE|Coquillage|Mollusque des fêtes|Perlière',
    'HUMAIN|Homme|Bienveillant|Mortel',
    'HUMEUR|Caractère|Disposition|Bonne ou mauvaise',
    'HUMOUR|Esprit|Drôlerie|Politesse du désespoir',
    'HUNE|Plateforme de mât|Poste de vigie|Mât de …',
    'HURLER|Crier|Vociférer|Rugir',
    /* I */
    'ICI|À cet endroit|Là où je suis|Par …',
    'IDEE|Pensée|Concept|Ampoule qui s’allume',
    'IDEES|Pensées|Concepts|Ampoules qui s’allument',
    'IDIOT|Bête|Sot|Crétin',
    'IF|Conifère toxique|Arbre des cimetières|Égouttoir à bouteilles',
    'IL|Pronom personnel|Lui, en sujet|… était une fois',
    'ILE|Terre entourée d’eau|Atoll|Robinson y a vécu',
    'ILES|Terres entourées d’eau|Archipel|Elles sont sous le vent',
    'ILOT|Petite île|Pâté de maisons|Terre-plein',
    'ILOTS|Petites îles|Pâtés de maisons|Terre-pleins',
    'ILS|Pronom pluriel|Eux, en sujet|Ces gens',
    'IMAGE|Illustration|Reflet|Photo',
    'IMMENSE|Énorme|Vaste|Infini',
    'IMPOT|Taxe|Contribution|Prélèvement fiscal',
    'IMPRIMANTE|Machine à papier|Périphérique|Laser ou jet d’encre',
    'INCENDIE|Feu|Brasier|Sinistre',
    'INDICE|Signe|Trace|Taux',
    'INDIEN|Peau-Rouge|Hindou|Océan de l’Asie du Sud',
    'INFINI|Illimité|Sans fin|Espace sans limites',
    'INFIRMIERE|Soignante|Aide du médecin|Blouse blanche',
    'INGENIEUR|Technicien supérieur|Concepteur|Polytechnicien',
    'INJUSTE|Partial|Inique|Arbitraire',
    'INONDER|Submerger|Noyer|Envahir',
    'INOX|Acier brillant|Métal qui ne rouille pas|Couverts brillants',
    'INSECTE|Mouche ou fourmi|Bestiole|Hexapode',
    'INSTANT|Moment|Seconde|Minute',
    'INTERNET|Toile|Web|Réseau mondial',
    'INUTILE|Vain|Superflu|Futile',
    'INVENTER|Créer|Imaginer|Mentir',
    'INVITATION|Carton|Convocation|Proposition',
    'INVITE|Convive|Hôte|Convié',
    'ION|Atome chargé|Particule électrisée|Anion ou cation',
    'IONS|Atomes chargés|Particules électrisées|Porteurs de charge',
    'IRA|Se rendra|Partira|Voyagera',
    'IRAS|Te rendras|Voyageras|Tu … loin',
    'IRE|Colère|Courroux|Fureur ancienne',
    '°IRES|Colères|Courroux|Fureurs anciennes',
    'IRIS|Fleur violette|Partie de l’œil|Messagère des dieux',
    'ISBA|Maison russe|Chalet de rondins|Chaumière sibérienne',
    'ISOLE|Seul|Retiré|Écarté',
    'ISOLES|Seuls|Retirés|Écartés',
    'ISSUE|Sortie|Dénouement|Voie de secours',
    'ISSUES|Sorties|Dénouements|Voies de secours',
    'ITEM|De même|Élément|Point d’une liste',
    'ITEMS|Éléments|Points d’une liste|Articles',
    'IVOIRE|Défense d’éléphant|Blanc crème|Côte d’…',
    'IVRE|Soûl|Éméché|Grisé',
    'IVRES|Soûls|Éméchés|Grisés',
    'IVRESSE|Ébriété|Griserie|Exaltation',
    /* J */
    'JADE|Pierre verte|Gemme orientale|Néphrite',
    'JADIS|Autrefois|Naguère|Dans le temps',
    'JAGUAR|Félin tacheté|Fauve d’Amazonie|Voiture de luxe',
    'JAIS|Pierre noire|Noir brillant|Lignite',
    'JALOUX|Envieux|Possessif|Ombrageux',
    'JAMAIS|À aucun moment|Nullement|Plus … !',
    'JAMBE|Membre inférieur|Gambette|Tenir la … : bavarder',
    'JAMBON|Charcuterie|Cuisse de porc|Blanc ou cru',
    'JANVIER|Premier mois|Mois des étrennes|Début d’année',
    'JARDIN|Potager|Parc|… d’enfants',
    'JARDINAGE|Culture|Horticulture|Bêchage',
    'JARDINIER|Horticulteur|Paysagiste|Il cultive les massifs',
    'JARRE|Grand vase|Amphore|Pot en terre',
    'JARS|Mâle de l’oie|Oison adulte|Argot des voleurs',
    'JAUNE|Couleur du citron|Briseur de grève|Cœur de l’œuf',
    'JAVA|Danse populaire|Fête|Île indonésienne',
    'JAVELOT|Lance|Arme de jet|Épreuve olympique',
    'JE|Moi, en sujet|Pronom de l’ego|… pense donc …',
    'JEAN|Denim|Pantalon bleu|Toile de Nîmes',
    'JET|Jaillissement|Avion|Lancer',
    'JETEE|Digue|Môle|Promenade en mer',
    'JETER|Lancer|Balancer|Se … à l’eau',
    'JETS|Lancers|Jaillissements|Avions rapides',
    'JEU|Divertissement|Partie|Mise',
    'JEUNE|Adolescent|Neuf|Nouveau',
    'JEUX|Olympiques|Divertissements|Faites vos … !',
    'JOIE|Bonheur|Gaieté|Allégresse',
    'JOLI|Beau|Mignon|Gracieux',
    'JONC|Roseau|Bague simple|Canne',
    'JONGLER|Lancer des balles|Manier habilement|Faire le clown',
    'JOUE|Pommette|Face latérale|Amuse',
    'JOUER|S’amuser|Interpréter|Parier',
    'JOUET|Joujou|Cadeau d’enfant|Victime, pantin',
    'JOUEUR|Participant|Parieur|Espiègle',
    'JOUR|Vingt-quatre heures|Clarté|Ouverture',
    'JOURNAL|Quotidien|Gazette|Carnet intime',
    'JOYAU|Bijou|Trésor|Merveille',
    'JUDO|Art martial|Sport de ceinture|Voie de la souplesse',
    'JUGE|Magistrat|Arbitre|Il tranche',
    'JUGER|Estimer|Arbitrer|Condamner',
    'JUIN|Sixième mois|Mois du solstice|Mois de l’été naissant',
    'JUMEAU|Semblable|Double|Né en même temps',
    'JUMELLES|Longue-vue|Sœurs identiques|Lorgnette double',
    'JUPE|Vêtement féminin|Kilt|Robe coupée',
    'JURER|Promettre|Pester|Détonner',
    'JURY|Examinateurs|Assemblée d’assises|Comité qui délibère',
    'JUS|Suc|Café, familièrement|Électricité, en argot',
    'JUSTE|Équitable|Exact|Serré',
    'JUSTICE|Équité|Tribunal|Droit',
    /* K */
    'KAKI|Couleur de treillis|Fruit orange|Vert-brun',
    'KANGOUROU|Marsupial|Sauteur australien|Il a une poche',
    'KAYAK|Canoë esquimau|Embarcation à pagaie|Palindrome sportif',
    'KEPI|Coiffure militaire|Casquette de gendarme|Blanc, il coiffe le légionnaire',
    'KILO|Mille grammes|Unité de poids|En prendre un de trop',
    'KIOSQUE|Marchand de journaux|Pavillon de jardin|Abri à musique',
    'KIWI|Fruit vert poilu|Oiseau sans ailes|Néo-Zélandais, familièrement',
    /* L */
    'LA|Note du diapason|Article féminin|… où il faut',
    'LABOURER|Retourner la terre|Travailler aux champs|Sillonner',
    'LABYRINTHE|Dédale|Méandres|Minotaure en son centre',
    'LAC|Étendue d’eau douce|Léman ou Annecy|Tomber dans le … : échouer',
    'LACET|Cordon de chaussure|Virage en épingle|Piège à lapin',
    'LACS|Étendues d’eau douce|Pièges|Lacets',
    'LAI|Petit poème médiéval|Frère convers|Chant breton',
    'LAID|Moche|Disgracieux|Vilain',
    'LAIE|Femelle du sanglier|Sentier forestier|Mère des marcassins',
    'LAINE|Toison|Fil à tricoter|Pure … vierge',
    'LAINES|Toisons|Fils à tricoter|Pulls chauds',
    'LAISSER|Abandonner|Quitter|Permettre',
    'LAIT|Boisson blanche|Nectar de vache|Soupe au …',
    'LAITUE|Salade verte|Batavia|Feuille pour lapin',
    'LAMA|Ruminant des Andes|Moine tibétain|Il crache',
    'LAMPE|Luminaire|Veilleuse|S’en mettre plein la …',
    'LANCE|Arme d’hast|Pique|Tuyau de pompier',
    'LANCER|Jeter|Projeter|Mettre sur le marché',
    'LANGUE|Idiome|Organe du goût|Mauvaise …',
    'LANTERNE|Fanal|Lampion|Rouge, elle ferme la marche',
    'LAPIN|Rongeur aux longues oreilles|Garenne|Poser un … : ne pas venir',
    'LAPINS|Garennes|Rongeurs aux longues oreilles|Ils se posent chez les absents',
    'LAPS|Intervalle|… de temps|Court moment',
    'LARGE|Vaste|Haute mer|Généreux',
    'LARME|Pleur|Goutte des yeux|Petite quantité',
    'LAS|Fatigué|Épuisé|Hélas !',
    'LASSO|Corde de cow-boy|Lacet de capture|Arme du gaucho',
    'LAURIER|Arbuste aromatique|Feuille de sauce|Couronne de vainqueur',
    'LAVABO|Bassin de salle de bains|Cuvette|Toilettes',
    'LAVANDE|Plante de Provence|Fleur mauve parfumée|Bleu pâle',
    'LAVER|Nettoyer|Faire la lessive|Blanchir',
    'LE|Article défini|Pronom complément|… mien',
    'LECON|Cours|Enseignement|Morale',
    'LECTURE|Déchiffrage|Parcours d’un texte|Interprétation',
    'LEGENDE|Mythe|Fable|Texte sous l’image',
    'LEGER|Peu lourd|Frivole|Aérien',
    'LEGS|Héritage|Don|Donation testamentaire',
    'LEGUME|Carotte ou poireau|Plante potagère|Grosse … : notable',
    'LENT|Pas rapide|Traînard|Lambin',
    'LENTS|Pas rapides|Traînards|Lambins',
    'LES|Articles pluriels|Pronom pluriel|Eux, en complément',
    'LEST|Charge|Sable de montgolfière|Poids d’équilibre',
    'LESTS|Charges|Poids d’équilibre|Sacs de sable',
    'LETTRE|Missive|Caractère|À la … : littéralement',
    'LETTRES|Missives|Caractères|Culture littéraire',
    'LEVE|Debout|Hissé|Sorti du lit',
    'LEVER|Hisser|Dresser|… du soleil',
    'LEVURE|Ferment|Poudre à gâteau|Agent de la pâte',
    'LEZARD|Reptile|Fente de mur|Faire le … : se chauffer au soleil',
    'LI|Distance chinoise|Mesure de Pékin|Demi-kilomètre d’Asie',
    'LIBERTE|Indépendance|Première de la devise|Statue de New York',
    'LIBRAIRE|Marchand de livres|Bouquiniste|Commerçant du roman',
    'LIBRE|Indépendant|Disponible|Gratuit',
    'LIE|Dépôt du vin|Associé|Relié',
    'LIEE|Attachée|Unie|Épaissie',
    'LIEN|Attache|Rapport|Corde',
    'LIENS|Attaches|Rapports|Cordes',
    'LIER|Attacher|Unir|Épaissir une sauce',
    'LIERRE|Plante grimpante|Feuillage persistant|Il s’accroche aux murs',
    'LIES|Dépôts du vin|Associés|Attachés',
    'LIEU|Endroit|Place|Poisson de mer',
    'LIEVRE|Animal rapide|Bouquin des champs|Il a perdu contre la tortue',
    'LIGNE|Trait|Rangée|Silhouette',
    'LIMACE|Gastéropode nu|Mollusque de jardin|Chemise, en argot',
    'LIME|Outil de ponçage|Citron vert|Râpe',
    'LIN|Fibre textile|Plante à fleurs bleues|Toile fraîche',
    'LINGE|Draps et serviettes|Lessive|Blanc comme un …',
    'LION|Roi des animaux|Fauve à crinière|Signe de juillet',
    'LIONS|Rois des animaux|Fauves à crinière|Signes de juillet',
    'LIQUIDE|Fluide|Argent comptant|Eau ou lait',
    'LIRE|Déchiffrer|Parcourir un texte|Ancienne monnaie italienne',
    'LIS|Fleur blanche|Lys|Fleur royale',
    'LISSE|Uni|Poli|Sans aspérité',
    'LISTE|Énumération|Inventaire|Bordereau',
    'LISTES|Énumérations|Inventaires|Bordereaux',
    'LIT|Couche|Couchette|Fond de rivière',
    'LITRE|Unité de volume|Bouteille de vin|Mille centimètres cubes',
    'LITS|Couches|Couchettes|Fonds de rivière',
    'LIVRE|Bouquin|Cinq cents grammes|Monnaie anglaise',
    'LOBE|Bout de l’oreille|Partie du cerveau|Division arrondie',
    'LOCAL|Pièce|Régional|Salle',
    'LOCATAIRE|Preneur|Résident|Il paie le loyer',
    'LOGE|Cabine|Box de théâtre|Atelier de franc-maçon',
    'LOI|Règle|Code|La … du plus fort',
    'LOIN|À distance|Éloigné|Au diable Vauvert',
    'LOIR|Rongeur dormeur|Il dort beaucoup|Petit hibernant',
    'LOIRS|Rongeurs dormeurs|Petits hibernants|Dormir comme eux',
    'LOIS|Règles|Codes|Textes votés',
    'LONG|Étendu|Lent|Le … de : au bord de',
    'LONGUE|Étendue|Voyelle tenue|À la … : à la fin',
    'LORD|Noble anglais|Pair du Royaume|Membre de la Chambre haute',
    'LOT|Part|Rivière du Sud-Ouest|Gros … : jackpot',
    'LOTERIE|Jeu de hasard|Tombola|Loto',
    'LOTO|Jeu de hasard|Loterie|Numéros gagnants',
    'LOTS|Parts|Gains|Parcelles',
    'LOUER|Prendre à bail|Féliciter|Réserver',
    'LOUP|Canidé sauvage|Bar de Méditerranée|Masque de bal',
    'LOUPE|Verre grossissant|Excroissance du bois|Manquée',
    'LOURD|Pesant|Pataud|Orageux',
    'LU|Déchiffré|Parcouru des yeux|… et approuvé',
    'LUCARNE|Fenêtre de toit|Petite ouverture|Coin du but',
    'LUE|Déchiffrée|Parcourue|Récitée',
    'LUES|Déchiffrées|Parcourues|Récitées',
    'LUGE|Traîneau|Petit engin de neige|Glisse d’hiver',
    'LUI|Pronom masculin|Pas elle|… et moi',
    'LUIRE|Briller|Scintiller|Chatoyer',
    'LUMIERE|Clarté|Éclairage|Génie',
    'LUNDI|Premier jour de la semaine|Jour de reprise|Relâche des coiffeurs',
    'LUNE|Astre de la nuit|Satellite de la Terre|Demander la …',
    'LUNES|Astres de la nuit|Satellites|Humeurs changeantes',
    'LUNETTES|Verres correcteurs|Binocles|Carreaux, en argot',
    'LUS|Déchiffrés|Parcourus|Récités',
    'LUT|Déchiffra|Parcourut|Enduit de potier',
    'LUTH|Instrument à cordes|Mandoline ancienne|Tortue marine',
    'LUTTE|Combat|Bagarre|Sport de corps-à-corps',
    'LUXE|Faste|Opulence|Superflu',
    'LYCEE|Établissement secondaire|Bahut|École d’Aristote',
    'LYRE|Instrument antique|Harpe grecque|Symbole de poésie',
    'LYS|Fleur de la monarchie|Symbole royal|Lis',
    /* M */
    'MA|Possessif féminin|À moi|… foi !',
    'MACHINE|Appareil|Engin|… à laver',
    'MACHOIRE|Maxillaire|Mandibule|Pince d’étau',
    'MADAME|Titre de civilité|Dame|… Bovary',
    'MAGASIN|Boutique|Grande surface|Chargeur d’arme',
    'MAGE|Sage d’Orient|Devin|Roi … à la crèche',
    'MAGICIEN|Enchanteur|Illusionniste|Merlin',
    'MAGICIENNE|Fée|Enchanteresse|Sorcière bien-aimée',
    'MAGIE|Sorcellerie|Enchantement|Prestidigitation',
    'MAI|Mois du muguet|Cinquième mois|Mois de Marie',
    'MAIGRE|Mince|Fluet|Sans graisse',
    'MAIL|Courriel|Promenade plantée|Message électronique',
    'MAILLOT|Tricot|Tenue de bain|Jaune au Tour',
    'MAIN|Paume et doigts|Menotte|Coup de …',
    'MAINS|Paumes|Menottes|Petites …: aides',
    'MAIRE|Premier magistrat de la commune|Édile|Il marie',
    'MAIS|Cependant|Pourtant|Céréale jaune',
    'MAISON|Demeure|Logis|Foyer',
    'MAITRE|Enseignant|Patron|Chef',
    'MAL|Douleur|Contraire du bien|Péché',
    'MALADE|Souffrant|Patient|Fou, familièrement',
    'MALHEUR|Infortune|Drame|Faire un … : triompher',
    'MALLE|Coffre|Bagage|Se faire la … : partir',
    'MALT|Orge germée|Base de la bière|Whisky pur …',
    'MAMAN|Mère|Maternelle|On l’appelle quand on a mal',
    'MAMANS|Mères|Mères de famille|Elles consolent',
    'MANCHE|Poignée|Bras de vêtement|Partie de match',
    'MANEGE|Carrousel|Jeu de chevaux de bois|Manœuvre, stratagème',
    'MANGER|Se nourrir|Dévorer|Dilapider',
    'MANGUE|Fruit tropical|Fruit orangé|Fruit exotique juteux',
    'MANIERE|Façon|Méthode|Belles …s : politesse',
    'MANOIR|Gentilhommière|Demeure ancienne|Castel',
    'MANQUER|Rater|Faire défaut|Regretter',
    'MANTEAU|Pardessus|Paletot|Sous le … : en cachette',
    'MAQUILLAGE|Fard|Grimage|Trucage',
    'MARAIS|Marécage|Zone humide|Poitevin, il est vert',
    'MARBRE|Pierre polie|Roche de sculpteur|Rester de … : impassible',
    'MARC|Résidu de raisin|Eau-de-vie|Évangéliste',
    'MARCHAND|Commerçant|Vendeur|… de sable',
    'MARCHANDE|Commerçante|Négociante|… de quatre-saisons',
    'MARCHE|Promenade|Degré d’escalier|Foire aux légumes',
    'MARCHER|Avancer|Fonctionner|Croire une blague',
    'MARDI|Deuxième jour|… gras|Jour de Mars',
    'MARE|Étang|Flaque|Point d’eau',
    'MARES|Étangs|Flaques|Points d’eau',
    'MARGE|Espace blanc|Bord de page|Latitude',
    'MARGUERITE|Pâquerette géante|Fleur à effeuiller|Reine de Navarre',
    'MARI|Époux|Conjoint|Moitié masculine',
    'MARIAGE|Noces|Union|Hymen',
    'MARIN|Matelot|Navigateur|Loup de mer',
    'MARINE|Flotte|Bleu foncé|Tableau de mer',
    'MARMITE|Chaudron|Grosse casserole|Faire bouillir la …',
    'MARQUE|Signe|Trace|Label',
    'MARRON|Châtaigne|Brun|Coup, en argot',
    'MARS|Troisième mois|Planète rouge|Dieu de la guerre',
    'MARTEAU|Outil à clous|Fou, familièrement|Pièce de l’oreille',
    'MASQUE|Loup|Déguisement|Apparence',
    'MASSE|Tas|Maillet|En … : en foule',
    'MASSES|Tas|Maillets|Foules',
    'MAT|Terne|Échec final|Sans brillance',
    'MATELAS|Couche|Paillasse|Épargne cachée',
    'MATELOT|Marin|Mousse|Gabier',
    'MATERNELLE|École des petits|De la mère|Nounou',
    'MATIERE|Substance|Discipline|Sujet',
    'MATIERES|Substances|Disciplines|Sujets',
    'MATIN|Aube|Début de journée|Petit …',
    'MAUVAIS|Méchant|Raté|Nuisible',
    'MAUX|Douleurs|Malheurs|Souffrances',
    'ME|Pronom réfléchi|Moi, en complément|Il … plaît',
    'MECANICIEN|Garagiste|Réparateur|Chauffeur de locomotive',
    'MECHANT|Vilain|Cruel|Pas gentil',
    'MEDAILLE|Décoration|Breloque|Revers de la …',
    'MEDECIN|Docteur|Praticien|Généraliste',
    'MEDICAMENT|Remède|Pilule|Cachet',
    'MEILLEUR|Supérieur|Champion|Le … pour la fin',
    'MELANGE|Mixture|Assortiment|Brassage',
    'MELE|Mélangé|Confus|Impliqué',
    'MELES|Mélangés|Confus|Impliqués',
    'MELODIE|Air|Chanson|Suite de notes',
    'MELON|Cucurbitacée|Chapeau rond|Fruit de Cavaillon',
    'MEMBRE|Adhérent|Bras ou jambe|Partie du corps',
    'MEME|Identique|Pareil|Grand-mère, familièrement',
    'MEMOIRE|Souvenir|Rapport|Faculté de retenir',
    'MENACE|Danger|Intimidation|Péril',
    'MENAGE|Couple|Nettoyage|Faire bon …',
    'MENE|Conduit|Dirige|Guide',
    'MENES|Conduits|Diriges|Guides',
    'MENSONGE|Contre-vérité|Bobard|Craque',
    'MENSONGES|Bobards|Craques|Balivernes',
    'MENTHE|Plante aromatique|Sirop vert|Thé marocain',
    'MENTON|Bas du visage|Galoche|Ville du citron',
    'MENU|Carte|Petit|Liste des plats',
    'MEPRIS|Dédain|Dérision|Morgue',
    'MER|Océan|Grande bleue|Étendue salée',
    'MERCI|Gratitude exprimée|Grâce|À la … de : dépendant de',
    'MERE|Maman|Génitrice|Supérieure du couvent',
    'MERES|Mamans|Génitrices|Supérieures du couvent',
    'MERLE|Oiseau noir|Siffleur|… blanc : rareté',
    'MERS|Océans|Étendues salées|Grandes bleues',
    'MERVEILLE|Prodige|Splendeur|Beauté',
    'MES|Possessifs|À moi, au pluriel|… chers amis',
    'MESSAGE|Communiqué|Missive|Texto',
    'MESSAGES|Communiqués|Missives|Textos',
    'MESSE|Office|Culte|Cérémonie catholique',
    'MESSES|Offices|Cultes|Cérémonies catholiques',
    'MESURE|Dimension|Cadence|Sur … : ajusté',
    'MESURES|Dimensions|Cadences|Dispositions',
    'MET|Pose|Place|Enfile',
    'METAL|Fer ou cuivre|Or ou argent|Hard rock',
    'METIER|Profession|Emploi|Expérience',
    'METRE|Unité de longueur|Ruban gradué|Rythme du vers',
    'METS|Plats|Mangeailles|Préparations culinaires',
    'METTRE|Poser|Placer|Enfiler',
    'MEUBLE|Buffet ou armoire|Mobilier|Terre facile à labourer',
    'MEUNIER|Minotier|Il tient le moulin|Poisson à la …',
    'MI|Note entre ré et fa|Milieu|À …-chemin',
    'MIDI|Douze heures|Sud|Chercher … à quatorze heures',
    'MIE|Intérieur du pain|Amie, poétiquement|Pain de …',
    'MIEL|Nectar des abeilles|Douceur dorée|Lune de …',
    'MIEN|À moi|Le … : ce qui m’appartient|Possessif',
    'MIES|Intérieurs du pain|Parties tendres|Pains de …',
    'MIETTE|Débris de pain|Parcelle|Petite quantité',
    'MIEUX|Préférable|Plus correctement|Faute de …',
    'MIGRAINE|Mal de tête|Céphalée|Excuse du soir',
    'MILIEU|Centre|Entourage|Pègre',
    'MILLE|Nombre|Dix fois cent|Mettre dans le …',
    'MINCE|Svelte|Fin|Zut !',
    'MINE|Air|Gisement|Bout de crayon',
    'MINERAI|Roche utile|Fer brut|Gangue exploitée',
    'MINES|Airs|Gisements|Bouts de crayon',
    'MINI|Très petit|Jupe courte|Voiture anglaise',
    'MINISTRE|Membre du gouvernement|Excellence|Pasteur',
    'MINUIT|Douze coups du soir|Heure du crime|Milieu de la nuit',
    'MINUTE|Soixante secondes|Instant|Brouillon d’acte',
    'MIRACLE|Prodige|Merveille|Coup du ciel',
    'MIRE|Cible|Point de …|Viseur',
    'MIRES|Cibles|Points de …|Viseurs',
    'MIROIR|Glace|Reflet|Aux alouettes',
    'MIS|Posé|Vêtu|Installé',
    'MISE|Enjeu|Tenue|… en scène',
    'MISSION|Tâche|Délégation|Ambassade',
    'MIT|Plaça|Posa|Enfila',
    'MITE|Insecte des armoires|Teigne|Mangée aux …s',
    'MODE|Tendance|Façon|Vogue',
    'MODELE|Exemple|Maquette|Mannequin',
    'MOELLE|Substance des os|Centre|Jusqu’à la …',
    'MOI|Ego|Pronom personnel|Je, en tonique',
    'MOINE|Religieux|Bénédictin|Capucin',
    'MOINS|Pas plus|Signe de soustraction|Au … : au minimum',
    'MOIS|Trente jours|Mensualité|Douzième d’année',
    'MOISSON|Récolte|Fenaison|Butin',
    'MOITIE|Demi|Épouse|Part égale',
    'MOKA|Café d’Arabie|Gâteau|Petit noir',
    'MOLLET|Arrière de la jambe|Tendre|Œuf …',
    'MOMENT|Instant|Occasion|En ce …',
    'MONDE|Terre|Foule|Tout le …',
    'MONNAIE|Pièces|Devise|Petite …',
    'MONSIEUR|Titre de civilité masculin|Homme|Messieurs, au singulier',
    'MONT|Sommet|Colline|Promettre …s et merveilles',
    'MONTAGNE|Relief élevé|Massif|Tas énorme',
    'MONTER|Grimper|Gravir|Assembler',
    'MONTRE|Horloge de poignet|Toquante|Faire … de : exhiber',
    'MONUMENT|Édifice|Mémorial|Chef-d’œuvre',
    'MORALE|Leçon|Éthique|Fin de fable',
    'MORCEAU|Bout|Fragment|Air de musique',
    'MORT|Décès|Trépas|Faucheuse',
    'MORUE|Cabillaud|Poisson salé|Brandade',
    'MOT|Terme|Vocable|Petit billet',
    'MOTEUR|Machine|Mécanique|Cri avant « Action ! »',
    'MOTO|Deux-roues|Bécane|Grosse cylindrée',
    'MOTS|Termes|Paroles|Vocables',
    'MOU|Flasque|Sans énergie|Poumon de veau',
    'MOUCHE|Insecte ailé|Centre de la cible|Petit grain de beauté',
    'MOUCHERON|Petit insecte|Gamin|Drosophile',
    'MOUCHOIR|Pochette|Carré de tissu|Il sèche les larmes',
    'MOUE|Grimace|Lippe|Bouderie',
    'MOUETTE|Oiseau marin|Goéland|Elle rit sur le port',
    'MOUILLER|Tremper|Humecter|Jeter l’ancre',
    'MOULE|Coquillage noir|Forme creuse|Maladroit',
    'MOULIN|Meunerie|À vent ou à eau|Moteur, en argot',
    'MOURIR|Décéder|Trépasser|S’éteindre',
    'MOUSSE|Écume|Dessert|Jeune marin',
    'MOUSTACHE|Pilosité labiale|Bacchantes|Vibrisses du chat',
    'MOUSTIQUE|Insecte piqueur|Cousin|Gamin maigre',
    'MOUTON|Ovin|Bélier|Poussière sous le lit',
    'MOYEN|Méthode|Ordinaire|Âge des cathédrales',
    'MU|Lettre grecque avant nu|Douzième lettre grecque|Micro, en symbole',
    'MUE|Changement de peau|Transformation de la voix|Poussée, mise en mouvement',
    'MUES|Changements de peau|Transformations|Voix qui changent',
    'MUET|Silencieux|Taciturne|Film sans paroles',
    'MUGUET|Fleur de mai|Clochettes blanches|Porte-bonheur du 1er mai',
    'MULE|Hybride|Pantoufle|Têtue comme elle',
    'MUR|Paroi|Cloison|Muraille',
    'MURAILLE|Rempart|Mur épais|Grande … de Chine',
    'MURE|Baie du roncier|Fruit noir|Prête à cueillir',
    'MURS|Cloisons|Parois|Remparts',
    'MUS|Mis en mouvement|Poussés|Actionnés',
    'MUSCLE|Biceps|Force|Fibre contractile',
    'MUSE|Inspiratrice|Égérie|Divinité des arts',
    'MUSEE|Galerie d’art|Louvre|Conservatoire d’œuvres',
    'MUSICIEN|Instrumentiste|Compositeur|Joueur d’orchestre',
    'MUSIQUE|Harmonie|Air|C’est toujours la même …',
    'MYSTERE|Énigme|Secret|Arcane',
    /* N */
    'NAGE|Brasse|Crawl|En … : trempé',
    'NAGEOIRE|Aileron|Membre du poisson|Palme naturelle',
    'NAGER|Se baigner|Faire la brasse|Barboter',
    'NAIF|Crédule|Ingénu|Peintre primitif',
    'NAIN|Petit homme|Lilliputien|Blanche-Neige en a sept',
    'NAINS|Petits hommes|Lilliputiens|Compagnons de Blanche-Neige',
    'NAISSANCE|Venue au monde|Début de vie|Accouchement',
    'NAPPE|Linge de table|Couche étendue|… de brouillard',
    'NARINE|Trou du nez|Orifice nasal|Naseau',
    'NARINES|Trous du nez|Orifices nasaux|Naseaux',
    'NATATION|Nage sportive|Crawl et brasse|Sport de piscine',
    'NATION|Peuple|Pays|État',
    'NATURE|Environnement|Caractère|Sans assaisonnement',
    'NAUFRAGE|Perte d’un navire|Échec total|Désastre en mer',
    'NAVET|Légume blanc|Mauvais film|Rave',
    'NAVIRE|Bateau|Vaisseau|Bâtiment de mer',
    'NE|Adverbe de négation|Venu au monde|Il … sait pas',
    'NECTAR|Suc des fleurs|Boisson des dieux|Jus de fruits épais',
    'NEE|Venue au monde|Mise au monde|Issue de',
    'NEES|Venues au monde|Issues|Mises au monde',
    'NEF|Partie d’église|Vaisseau ancien|Allée centrale',
    'NEFS|Parties d’église|Vaisseaux anciens|Allées centrales',
    'NEGLIGER|Délaisser|Omettre|Se laisser aller',
    'NEIGE|Flocons|Poudreuse|Blanc manteau',
    'NEIGES|Flocons|Poudreuses|… éternelles',
    'NEIGEUX|Enneigé|Blanc|Poudreux',
    'NENUPHAR|Fleur d’étang|Lotus|Plante aquatique',
    'NERF|Fibre sensible|Vigueur|Guerre des …s',
    'NERFS|Fibres sensibles|Vigueur|Guerre des …',
    'NET|Propre|Clair|Hors taxes',
    'NETS|Propres|Clairs|Hors taxes, au pluriel',
    'NEUF|Flambant|Huit plus un|Quoi de … ?',
    'NEUFS|Nouveaux|Flambants|Récents',
    'NEVEU|Fils du frère|Fils de la sœur|Parent par l’oncle',
    'NEZ|Organe de l’odorat|Pif|Avoir du …',
    'NI|Conjonction négative|… oui … non|Et pas',
    'NICHE|Abri de chien|Alcôve|Farce',
    'NID|Abri d’oiseau|Foyer|… de poule',
    'NIDS|Abris d’oiseaux|Foyers|… de poule',
    'NIE|Conteste|Dément|Refuse d’avouer',
    'NIER|Contester|Démentir|Refuser d’admettre',
    'NIVEAU|Hauteur|Degré|Instrument à bulle',
    'NOBLE|Aristocrate|Magnanime|Digne',
    'NOCE|Mariage|Fête|Faire la …',
    'NOEL|Fête du 25 décembre|Réveillon|Chant de la Nativité',
    'NOEUD|Boucle|Lien serré|Vitesse marine',
    'NOIR|Couleur de nuit|Sombre|Ivre, en argot',
    'NOIRS|Couleurs de nuit|Sombres|Ivres, en argot',
    'NOISETTE|Fruit du coudrier|Aveline|Petite quantité de beurre',
    'NOIX|Fruit du noyer|Cerneau|À la … : sans valeur',
    'NOM|Appellation|Patronyme|Substantif',
    'NOMADE|Vagabond|Itinérant|Sans domicile fixe',
    'NOMBRE|Chiffre|Quantité|Singulier ou pluriel',
    'NOMS|Appellations|Patronymes|Substantifs',
    'NON|Refus|Négation|Pas du tout',
    'NORD|Septentrion|Point cardinal du haut|Perdre le … : s’affoler',
    'NORMAL|Habituel|Ordinaire|Logique',
    'NOTAIRE|Officier ministériel|Tabellion|Rédacteur d’actes',
    'NOTE|Annotation|Addition|Do ou ré',
    'NOTRE|À nous|Possessif pluriel|… Père',
    'NOURRIR|Alimenter|Donner à manger|Entretenir un espoir',
    'NOUS|Toi et moi|On|Première personne du pluriel',
    'NOUVEAU|Neuf|Récent|Débutant',
    'NOUVELLE|Information|Récit court|Jeune',
    'NOVEMBRE|Onzième mois|Mois des morts|Mois de l’Armistice',
    'NU|Sans vêtement|Lettre grecque après mu|Dépouillé',
    'NUAGE|Nuée|Cumulus|Un … de lait',
    'NUAGEUX|Couvert|Brumeux|Voilé',
    'NUANCE|Teinte|Subtilité|Degré',
    'NUE|Dévêtue|Nuage|Porter aux …s',
    'NUES|Nuages|Dévêtues|Tomber des …',
    'NUIT|Obscurité|Soirée|Blanche quand on ne dort pas',
    'NUL|Aucun|Zéro|Match sans vainqueur',
    'NUMERO|Chiffre|Exemplaire|Sacré …',
    'NUS|Dévêtus|Déshabillés|À poil',
    'NYMPHE|Divinité des eaux|Jeune fille gracieuse|Stade d’insecte',
    /* O */
    'OASIS|Palmeraie|Havre du désert|Refuge',
    'OBEIR|Se soumettre|Exécuter|Suivre les ordres',
    'OBJET|Chose|But|Complément d’…',
    'OBSCUR|Sombre|Ténébreux|Incompréhensible',
    'OBSCURITE|Noir|Ténèbres|Ombre',
    'OBSTACLE|Barrière|Écueil|Haie',
    'OBUS|Projectile|Bombe|Munition d’artillerie',
    'OC|Langue d’…|Langue du Midi|Oui, en occitan',
    'OCCASION|Opportunité|Moment|Seconde main',
    'OCEAN|Grande mer|Atlantique|Immensité bleue',
    'OCRE|Terre jaune|Jaune-brun|Couleur de Roussillon',
    'OCTAVE|Intervalle de huit degrés|Du do au do suivant|Huitaine de fête religieuse',
    'ODE|Poème lyrique|Chant|Hymne',
    'ODES|Poèmes lyriques|Chants|Hymnes',
    'ODEUR|Parfum|Senteur|Fumet',
    'OEIL|Organe de la vue|Mirette|À l’… : gratis',
    'OEUF|Coquille de poule|Ovule|À la coque',
    'OEUFS|Coquilles de poule|Ovules|À la neige',
    'OFFICE|Bureau|Messe|Pièce de service',
    'OFFRE|Proposition|Enchère|… et demande',
    'OFFRIR|Donner|Présenter|Proposer',
    'OGRE|Géant mangeur d’enfants|Monstre|Gros mangeur',
    'OGRES|Géants mangeurs d’enfants|Monstres|Gros mangeurs',
    'OH|Exclamation|Marque la surprise|Ah, en plus rond',
    'OIE|Palmipède|Jeu de l’…|Oiseau blanc de basse-cour',
    'OIES|Palmipèdes|Oiseaux de basse-cour|Sottes',
    'OIGNON|Bulbe|Légume qui fait pleurer|Grosse montre ancienne',
    'OISEAU|Volatile|Passereau|Drôle d’…',
    'OLIVE|Fruit à noyau du Midi|Vert-brun|Petite boule d’apéritif',
    'OLIVIER|Arbre du Midi|Symbole de paix|Arbre des Provençaux',
    'OMBRE|Zone sans soleil|Silhouette obscure|Fantôme, spectre',
    'OMELETTE|Œufs battus|Plat aux œufs|Pas sans casser des œufs',
    'OMIS|Oublié|Négligé|Passé sous silence',
    'ON|Pronom indéfini|Nous, familièrement|Quelqu’un',
    'ONCE|Petite mesure|Panthère des neiges|Pas une … de',
    'ONCES|Petites mesures|Panthères des neiges|Poids anglais',
    'ONCLE|Frère du père|Tonton|Parent par alliance',
    'ONDE|Vague|Flot|Radio',
    'ONGLE|Griffe|Corne du doigt|Il se ronge',
    'ONT|Possèdent|Détiennent|Ils … raison',
    'ONZE|Dix plus un|Équipe de football|Nombre de joueurs',
    'OPERA|Art lyrique|Théâtre chanté|Garnier en est un',
    'OPINION|Avis|Idée|Jugement',
    'OR|Métal précieux|Conjonction de transition|Métal jaune',
    'ORAGE|Tempête|Tonnerre|Colère',
    'ORAGEUX|Électrique|Tendu|Menaçant',
    'ORAL|Examen parlé|Verbal|Épreuve de vive voix',
    'ORANGE|Agrume|Fruit à quartiers|Couleur de la citrouille',
    'ORCHESTRE|Philharmonie|Fanfare|Fosse de musiciens',
    'ORDINAIRE|Commun|Habituel|Banal',
    'ORDINATEUR|PC|Machine à calculer|Portable',
    'ORDRE|Commandement|Rangement|Consigne',
    'OREILLE|Organe de l’ouïe|Pavillon|Faire la sourde …',
    'ORGE|Céréale|Sucre d’…|Grain de la bière',
    'ORGUE|Instrument à tuyaux|Buffet d’église|Barbarie en a un',
    'ORGUEIL|Vanité|Fierté|Péché capital',
    'ORIGINE|Source|Provenance|Début',
    'ORME|Arbre|Bois dur|Attendre sous l’… : longtemps',
    'ORNER|Décorer|Parer|Embellir',
    'ORPHELIN|Sans parents|Seul au monde|Enfant abandonné',
    'ORS|Métaux jaunes|Dorures|Richesses',
    'ORTEIL|Doigt de pied|Petit bout du pied|Gros … : pouce du pied',
    'ORTIE|Plante piquante|Urticante|Soupe de printemps',
    'ORTIES|Plantes piquantes|Urticantes|Soupes de printemps',
    'OS|Pièce du squelette|Le chien le ronge|Tomber sur un …',
    'OSA|Risqua|Tenta|Eut le culot',
    'OSAS|Risquas|Tentas|Eus le culot',
    'OSE|Hardi|Tente|Audacieux',
    'OSEE|Risquée|Audacieuse|Tentée',
    'OSEES|Risquées|Audacieuses|Tentées',
    'OSER|Se risquer|Tenter|Avoir le cran de',
    'OSES|Risques|Tentes le coup|Tu … tout',
    'OTAGE|Prisonnier|Captif|Garant',
    'OTE|Enlève|Retire|Soustrait',
    'OTER|Enlever|Retirer|Soustraire',
    'OTES|Enlèves|Retires|Soustrais',
    'OU|Conjonction d’alternative|Sinon|À moins que',
    'OUATE|Coton|Rembourrage|Duvet',
    'OUBLI|Omission|Négligence|Trou de mémoire',
    'OUBLIER|Omettre|Négliger|Perdre de vue',
    'OUEST|Couchant|Occident|Point cardinal du soir',
    'OUF|Soulagement|Enfin !|Sauvé !',
    'OUI|Assentiment|Approbation|D’accord',
    'OUIE|Sens de l’oreille|Branchie|Audition',
    'OUIES|Sens de l’oreille|Branchies|Auditions',
    'OUIS|Accords|Assentiments|Approbations',
    'OURAGAN|Cyclone|Tempête|Typhon',
    'OURS|Plantigrade|Grizzly|Solitaire bourru',
    'OURSON|Nounours|Bébé plantigrade|Guimauve chocolatée',
    'OUTIL|Instrument|Ustensile|Moyen',
    'OUTRE|Au-delà|Gourde de peau|En … : de plus',
    'OUVERT|Béant|Accessible|Franc',
    'OUVRIR|Déboucler|Débloquer|Commencer',
    'OVALE|Ellipse|Ballon de rugby|Forme d’œuf',
    'OVNI|Soucoupe volante|Objet non identifié|Extraterrestre',
    /* P */
    'PAGAILLE|Chaos|Fouillis|Bazar',
    'PAGE|Feuillet|Jeune serviteur noble|Tourner la …',
    'PAILLE|Chaume|Tige de blé|Chalumeau pour boire',
    'PAIN|Baguette|Miche|Gagne-… : métier',
    'PAINS|Baguettes|Miches|Coups, en argot',
    'PAIRE|Duo|Deux|Couple assorti',
    'PAIX|Concorde|Calme|Fiche-moi la … !',
    'PAL|Pieu|Supplice ancien|Piquet',
    'PALAIS|Château|Haut de la bouche|… de justice',
    'PALE|Blafard|Livide|Aube d’hélice',
    'PALIER|Plateforme d’escalier|Étape|Niveau',
    'PALME|Nageoire de plongée|Feuille de dattier|Distinction',
    'PAN|Côté|Coup de feu|Dieu des bergers',
    'PANIER|Corbeille|But au basket|… à salade',
    'PANNE|Avarie|Défaillance|Velours',
    'PANS|Morceaux|Côtés|Coups de feu',
    'PANTALON|Culotte longue|Jean|Froc',
    'PAON|Oiseau qui fait la roue|Vaniteux|Fier comme lui',
    'PAPA|Père|Paternel|Daron, en argot',
    'PAPE|Souverain pontife|Saint-Père|Chef de l’Église',
    'PAPETERIE|Fournitures de bureau|Usine à papier|Boutique de cahiers',
    'PAPIER|Feuille|Document|Article de presse',
    'PAPILLON|Lépidoptère|Nœud de cravate|Contravention',
    'PAPILLONS|Lépidoptères|Nœuds de cravate|Contraventions',
    'PAQUET|Colis|Ballot|Mettre le … : tout donner',
    'PAR|Au moyen de|Via|Score de golf',
    'PARACHUTE|Toile de saut|Voile de secours|Pépin du ciel',
    'PARAPET|Garde-fou|Muret|Rambarde',
    'PARAPLUIE|Pépin|Riflard|Protection d’averse',
    'PARC|Jardin public|Enclos|Parking',
    'PARDON|Excuse|Grâce|Pèlerinage breton',
    'PARE|Prêt|Orne|Esquive',
    'PAREIL|Identique|Semblable|Égal',
    'PARENT|Père ou mère|Proche|Allié',
    'PARFUM|Senteur|Arôme|Essence',
    'PARFUMERIE|Boutique de senteurs|Commerce d’essences|Rayon beauté',
    'PARI|Gageure|Mise|Défi',
    'PARKING|Stationnement|Garage|Place de voiture',
    'PARLER|Dire|Causer|Bavarder',
    'PAROI|Mur|Cloison|Face rocheuse',
    'PAROIS|Murs|Cloisons|Faces rocheuses',
    'PAROLE|Mot|Promesse|Droit de s’exprimer',
    'PART|Portion|Morceau|Faire … de',
    'PARTIE|Match|Morceau|Fraction',
    'PARTIR|S’en aller|Quitter|Démarrer',
    'PARTOUT|En tous lieux|Ici et là|Aux quatre coins',
    'PAS|Enjambée|Foulée|Négation',
    'PASSAGE|Traversée|Couloir|Extrait',
    'PASSAGER|Voyageur|Éphémère|Clandestin',
    'PASSE|Autrefois|Révolu|Coup de balle',
    'PASSER|Traverser|Franchir|Donner',
    'PASTEUR|Berger des âmes|Ministre protestant|Savant de la rage',
    'PATE|Terrine|Nouilles|Mie à pétrir',
    'PATIENCE|Endurance|Calme|Réussite aux cartes',
    'PATINOIRE|Piste de glace|Glace|Endroit glissant',
    'PATRIE|Pays natal|Terre des pères|Mère-… : origine',
    'PATRON|Chef|Employeur|Modèle de couture',
    'PATTE|Membre animal|Jambe, familièrement|Languette',
    'PAUPIERE|Voile de l’œil|Peau des yeux|Elle cligne',
    'PAUSE|Répit|Entracte|Silence en musique',
    'PAUSES|Répits|Entractes|Silences en musique',
    'PAUVRE|Indigent|Malheureux|Démuni',
    'PAVE|Bloc de pierre|Gros livre|Morceau de viande épais',
    'PAYER|Régler|Acquitter|Solder',
    'PAYS|Nation|Contrée|Terroir',
    'PAYSAGE|Panorama|Site|Vue',
    'PEAU|Épiderme|Cuir|Pelure',
    'PECHE|Fruit velouté|Faute morale|Partie de ligne',
    'PECHES|Fruits veloutés|Fautes morales|Parties de ligne',
    'PEINE|Chagrin|Effort|Punition',
    'PEINES|Chagrins|Efforts|Punitions',
    'PEINTURE|Couleur|Tableau|Toile',
    'PELERIN|Marcheur de Compostelle|Voyageur pieux|Faucon',
    'PELLE|Outil à creuser|Ramasse-miettes|Rouler une …',
    'PELLES|Outils à creuser|Ramasse-miettes|Rouler des …',
    'PELOUSE|Gazon|Herbe|Tapis vert',
    'PENDANT|Durant|Boucle d’oreille|Symétrique',
    'PENDULE|Horloge|Balancier|Remettre les …s à l’heure',
    'PENSER|Réfléchir|Songer|Croire',
    'PENTE|Déclivité|Côte|Inclinaison',
    'PERCHE|Gaule|Poisson d’eau douce|Grand maigre',
    'PERDRE|Égarer|Échouer|Gaspiller',
    'PERE|Papa|Géniteur|Curé',
    'PERES|Papas|Géniteurs|Curés',
    'PERI|Mort|Disparu|Fée persane',
    'PERLE|Bijou nacré|Goutte|Bévue amusante',
    'PERROQUET|Ara|Oiseau parleur|Répéteur',
    'PERRUQUE|Postiche|Moumoute|Cheveux artificiels',
    'PERSIL|Herbe aromatique|Fines herbes|Il orne l’oreille du veau',
    'PERSONNE|Individu|Nul|Quidam',
    'PESE|Mesure le poids|Réfléchi|Fait le poids',
    'PESES|Mesures le poids|Réfléchis|Pondères',
    'PETALE|Partie de fleur|Feuille colorée|Effeuillé par l’amoureux',
    'PETALES|Parties de fleur|Feuilles colorées|Effeuillés par l’amoureux',
    'PETIT|Minuscule|Menu|Rejeton',
    'PETITS|Minuscules|Menus|Rejetons',
    'PEU|Guère|Pas beaucoup|À … près',
    'PEUPLE|Nation|Population|Foule',
    'PEUR|Frayeur|Crainte|Frousse',
    'PEURS|Frayeurs|Craintes|Frousses',
    'PHARE|Tour lumineuse|Lanterne marine|Feu d’auto',
    'PHARMACIE|Officine|Apothicairerie|Armoire à médicaments',
    'PHOTO|Cliché|Image|Instantané',
    'PHRASE|Suite de mots|Proposition|Faire des …s',
    'PI|Lettre grecque du cercle|Trois virgule quatorze|Constante d’Archimède',
    'PIANISTE|Claviériste|Joueur de touches|Virtuose du clavier',
    'PIANO|Instrument à touches|Doucement, en musique|Clavier noir et blanc',
    'PIC|Pointe rocheuse|Oiseau grimpeur|Pioche',
    'PICS|Sommets|Oiseaux grimpeurs|Pioches',
    'PIE|Oiseau noir et blanc|Bavarde|Voleuse',
    'PIECE|Chambre|Monnaie|Comédie',
    'PIED|Extrémité de la jambe|Base|Unité de vers',
    'PIEGE|Traquenard|Embûche|Chausse-trappe',
    'PIERRE|Caillou|Roche|Prénom d’apôtre',
    'PIERRES|Cailloux|Roches|Gemmes',
    'PIES|Oiseaux noir et blanc|Bavardes|Voleuses',
    'PIF|Nez, en argot|Tarin|Au … : au hasard',
    'PIGEON|Oiseau des villes|Dupe|Ramier',
    'PILE|Batterie|Monceau|Côté de pièce',
    'PILIER|Colonne|Soutien|Avant de rugby',
    'PILOTE|Aviateur|Conducteur|Guide',
    'PIN|Conifère|Arbre des Landes|Pomme de …',
    'PINCE|Tenaille|Patte de crabe|À … : à pied',
    'PINCEAU|Brosse de peintre|Blaireau|Faisceau lumineux',
    'PINGOUIN|Oiseau des glaces|Manchot, à tort|Alcidé du Nord',
    'PINS|Conifères|Arbres des Landes|Pommes de …',
    'PIOCHE|Pic|Talon de cartes|Outil de terrassier',
    'PION|Surveillant|Pièce d’échecs|Jeton',
    'PIPE|Brûle-gueule|Bouffarde|Casser sa … : mourir',
    'PIQURE|Injection|Morsure d’insecte|Couture',
    'PIRATE|Corsaire|Flibustier|Hacker',
    'PIRE|Plus mauvais|Pis|Le … : le summum du mal',
    'PIS|Pire|Mamelle|Tant …',
    'PISCINE|Bassin|Bain public|Grand bain',
    'PISTE|Chemin|Trace|Circuit',
    'PISTOLET|Revolver|Arme de poing|Pain rond belge',
    'PLACARD|Armoire murale|Affiche|Mettre au … : écarter',
    'PLACE|Lieu|Siège|Esplanade',
    'PLAFOND|Haut de pièce|Limite|Maximum',
    'PLAGE|Rivage|Grève|Sable au bord de l’eau',
    'PLAINE|Étendue plate|Pampa|Champ',
    'PLAIRE|Séduire|Charmer|Convenir',
    'PLAISIR|Joie|Délice|Bon …',
    'PLAN|Carte|Projet|Plat',
    'PLANCHE|Madrier|Plateau de théâtre|Faire la …',
    'PLANETE|Terre ou Mars|Astre|Monde',
    'PLANTE|Végétal|Semelle du pied|Mise en terre',
    'PLAT|Mets|Uni|Assiette',
    'PLATEAU|Plaine haute|Scène|Service',
    'PLEIN|Rempli|Complet|Faire le … : l’essence',
    'PLEINS|Remplis|Complets|Faire les … : l’essence',
    'PLEURER|Sangloter|Verser des larmes|Regretter',
    'PLEUVOIR|Tomber des cordes|Bruiner|Affluer',
    'PLI|Pliure|Lettre|Habitude',
    'PLIS|Pliures|Lettres|Habitudes',
    'PLOMB|Métal lourd|Fusible|Balle de fusil',
    'PLOMBIER|Réparateur de fuites|Chauffagiste|Zingueur',
    'PLONGER|Piquer une tête|Immerger|Sombrer',
    'PLU|Charmé|Été agréable|Tombé du ciel',
    'PLUIE|Averse|Précipitation|Faire la … et le beau temps',
    'PLUME|Penne|Stylo|Poids léger',
    'PLUS|Davantage|Encore|Signe d’addition',
    'PNEU|Boudin de roue|Gomme|Chambre à air',
    'PNEUS|Boudins de roue|Gommes|Chambres à air',
    'POCHE|Petit sac cousu|Cavité|Livre de …',
    'POCHES|Petits sacs cousus|Cavités|Cernes sous les yeux',
    'POELE|Casserole plate|Fourneau|Drap mortuaire',
    'POESIE|Vers|Poème|Lyrisme',
    'POETE|Rimeur|Versificateur|Rêveur',
    'POIDS|Masse|Fardeau pesant|Importance',
    'POIGNEE|Manche|Petit nombre|Bouton de porte',
    'POIL|Cheveu|Duvet|À … : tout nu',
    'POINT|Ponctuation|Endroit|Score',
    'POINTE|Pic|Clou|Trait d’esprit',
    'POIRE|Fruit à pépins|Naïf|Couper la … en deux',
    'POIS|Petit légume rond|Motif rond|Petits … : légumes verts',
    'POISON|Toxique|Venin|Personne insupportable',
    'POISSON|Animal aquatique|Truite ou saumon|D’avril',
    'POITRINE|Torse|Buste|Seins',
    'POIVRE|Épice noire|Grains piquants|Sel et …',
    'POLI|Courtois|Lisse|Civil',
    'POLICE|Force de l’ordre|Maréchaussée|Caractère d’imprimerie',
    'POLICIER|Agent|Flic|Roman d’enquête',
    'POLO|Chemise à col|Sport à cheval|Maillot',
    'POMME|Fruit d’Ève|Golden|Tomber dans les …s',
    'POMPE|Appareil à fluide|Chaussure, familièrement|Faste',
    'POMPIER|Soldat du feu|Sapeur|Emphatique',
    'POMPIERS|Soldats du feu|Sapeurs|Secouristes',
    'PONT|Viaduc|Passerelle|Congé allongé',
    'POP|Musique populaire|Art de Warhol|Bruit de bouchon',
    'PORC|Cochon|Goret|Sale type',
    'PORE|Orifice de la peau|Trou minuscule|Suer par tous les …s',
    'PORES|Orifices de la peau|Trous minuscules|Suer par tous les …',
    'PORT|Havre|Rade|Allure',
    'PORTAIL|Grille d’entrée|Entrée monumentale|Site d’accueil',
    'PORTE|Entrée|Huis|Soutient',
    'PORTER|Charrier|Avoir sur soi|Bière brune anglaise',
    'POSE|Attitude|Installe|Posture',
    'POSER|Placer|Installer|Faire le modèle',
    'POSTE|Emploi|Bureau de courrier|Récepteur',
    'POT|Récipient|Chance|Verre entre amis',
    'POTAGE|Soupe|Velouté|Consommé',
    'POTIRON|Citrouille|Courge|Grosse cucurbitacée',
    'POU|Parasite|Vermine|Laid comme un …',
    'POUCE|Gros doigt|Unité anglaise|Faire du … : de l’auto-stop',
    'POUDRE|Poussière|Explosif|Fard',
    'POULAIN|Petit cheval|Protégé|Jeune espoir',
    'POULE|Gallinacé|Pondeuse|Chérie',
    'POULET|Volaille|Policier, en argot|Billet doux',
    'POUPEE|Jouet|Figurine|Jolie fille',
    'POUR|En faveur de|Afin de|Le … et le contre',
    'POURQUOI|À quel sujet|Motif|Question d’enfant',
    'POUSSER|Croître|Bousculer|Inciter',
    'POUSSETTE|Landau|Voiture d’enfant|Chariot',
    'POUSSIERE|Saleté|Poudre fine|Grain',
    'POUVOIR|Capacité|Autorité|Être capable',
    'POUX|Parasites|Vermine|Chercher des … : chicaner',
    'PRAIRIE|Pré|Herbage|Pâturage',
    'PRALINE|Amande sucrée|Bonbon|Balle, en argot',
    'PRE|Prairie|Champ|Herbage',
    'PREMIER|Initial|Gagnant|Champion',
    'PRENDRE|Saisir|Attraper|Emporter',
    'PRES|Proche|À côté|Environ',
    'PRESENT|Cadeau|Actuel|Ici !',
    'PRESIDENT|Chef de l’État|Dirigeant|Élu suprême',
    'PRESQUE|Quasi|Environ|Pas tout à fait',
    'PRESSE|Journaux|Étau|Hâte',
    'PRET|Paré|Emprunt|Disposé',
    'PRETRE|Abbé|Curé|Ecclésiastique',
    'PRETS|Parés|Emprunts|Disposés',
    'PREUVE|Démonstration|Indice|Témoignage',
    'PRIE|Supplie|Invoque|Invite',
    'PRINCE|Fils de roi|Souverain|Charmant, dans les contes',
    'PRINCESSE|Fille de roi|Altesse|Sur un pois, dans le conte',
    'PRINTEMPS|Saison des fleurs|Renouveau|Âge, en poésie',
    'PRIS|Occupé|Capturé|Saisi',
    'PRISON|Geôle|Cachot|Taule',
    'PRIX|Coût|Tarif|Récompense',
    'PROBLEME|Difficulté|Question|Casse-tête',
    'PROCHE|Voisin|Imminent|Parent',
    'PROFESSEUR|Enseignant|Maître|Tournesol, dans Tintin',
    'PROFOND|Creux|Intense|Abyssal',
    'PROMENADE|Balade|Tour|Flânerie',
    'PROMENER|Balader|Sortir le chien|Envoyer … : rembarrer',
    'PROMESSE|Serment|Engagement|Parole',
    'PROPRE|Nettoyé|Personnel|Adéquat',
    'PRUNE|Fruit violet|Mirabelle|Contravention',
    'PSI|Lettre grecque|Paranormal|Vingt-troisième lettre grecque',
    'PU|Participe de pouvoir|Été capable|Réussi à',
    'PUB|Bar anglais|Réclame|Taverne irlandaise',
    'PUCE|Insecte sauteur|Circuit électronique|Mettre la … à l’oreille',
    'PUE|Sent mauvais|Empeste|Infecte',
    'PUES|Sens mauvais|Empestes|Infectes',
    'PUITS|Trou profond|Forage|… de science',
    'PULL|Chandail|Tricot|Laine enfilée',
    'PUMA|Cougar|Félin américain|Couguar',
    'PUNAISE|Insecte malodorant|Clou de tableau|Zut !',
    'PUNI|Sanctionné|Au coin|Châtié',
    'PUNIR|Châtier|Sanctionner|Mettre au coin',
    'PUR|Limpide|Sans mélange|Innocent',
    'PUS|Humeur|Sanie|Je … le faire',
    'PUT|Réussit à|Parvint à|Fut capable',
    'PUZZLE|Casse-tête|Jeu d’assemblage|Mille pièces',
    /* Q */
    'QUAI|Embarcadère|Bord de la voie ferrée|Rive aménagée',
    'QUALITE|Valeur|Atout|Vertu',
    'QUAND|Lorsque|À quel moment|… même',
    'QUART|Quatrième partie|Tour de garde|Petit verre à pied',
    'QUARTIER|Voisinage|Secteur|Tranche d’orange',
    'QUATRE|Deux fois deux|Nombre de saisons|Se mettre en … : se démener',
    'QUE|Pronom relatif|Conjonction|Ne … : seulement',
    'QUEL|Interrogatif|Adjectif exclamatif|… dommage !',
    'QUELQUE|Un certain|Environ|… part',
    'QUESTION|Demande|Interrogation|Problème',
    'QUEUE|Appendice animal|File d’attente|Bâton de billard',
    'QUI|Pronom relatif|Lequel|… vivra verra',
    'QUICHE|Tarte salée|Lorraine en est une|Tourte aux lardons',
    'QUILLE|Pièce de bowling|Carène du bateau|Fin du service, en argot',
    'QUITTER|Laisser|Partir de|Abandonner',
    'QUOI|Pronom interrogatif|Hein ?|Il n’y a pas de …',
    'QUOTIDIEN|Journal|Journalier|Train-train',
    /* R */
    'RA|Roulement de tambour|Dieu soleil égyptien|Batterie brève',
    'RACINE|Souche|Radicelle|Carré inverse',
    'RACONTER|Narrer|Relater|Rapporter',
    'RADE|Bassin portuaire|Mouillage|En … : en panne',
    'RADEAU|Embarcation de fortune|Planches flottantes|Méduse en fut un',
    'RADIATEUR|Calorifère|Chauffage|Refroidisseur de moteur',
    'RADIO|Poste|TSF|Examen aux rayons X',
    'RAFALE|Coup de vent|Salve|Bourrasque',
    'RAGE|Fureur|Colère|Maladie du chien',
    'RAI|Rayon|Trait de lumière|Musique d’Algérie',
    'RAID|Incursion|Expédition|Rallye',
    'RAIDS|Incursions|Expéditions|Rallyes',
    'RAIE|Poisson plat|Rayure|Séparation de cheveux',
    'RAIES|Poissons plats|Rayures|Séparations de cheveux',
    'RAIS|Rayons|Traits de lumière|Rayons de roue',
    'RAISIN|Grappe|Fruit de la vigne|Il fait le vin',
    'RAISINS|Grappes|Grains de vigne|Secs, dans le cake',
    'RAISON|Bon sens|Motif|Âge de …',
    'RAME|Aviron|Train de métro|Paquet de feuilles',
    'RAMEAU|Branche|Brindille|Dimanche avant Pâques',
    'RAMER|Pagayer|Galérer|Avancer à l’aviron',
    'RAMES|Avirons|Trains de métro|Paquets de feuilles',
    'RAMPE|Balustrade|Plan incliné|Feux de la scène',
    'RANCUNE|Ressentiment|Amertume|Dent contre quelqu’un',
    'RANG|File|Grade|Échelon',
    'RANGER|Ordonner|Classer|Garde forestier américain',
    'RAPACE|Oiseau de proie|Cupide|Vautour',
    'RAPIDE|Vite|Prompt|Train express',
    'RAPT|Enlèvement|Kidnapping|Rançon à la clé',
    'RAQUETTE|Tamis de tennis|Chaussure de neige|Palette de ping-pong',
    'RAQUETTES|Tamis de tennis|Chaussures de neige|Palettes de ping-pong',
    'RARE|Peu commun|Clairsemé|Précieux',
    'RARES|Peu communs|Clairsemés|Précieux',
    'RAS|Au … du sol|Rien à signaler|Coupé très court',
    'RASOIR|Coupe-choux|Ennuyeux|Outil à barbe',
    'RAT|Rongeur|Avare|Petit … de l’Opéra',
    'RATE|Organe abdominal|Manque|Échoue',
    'RATS|Rongeurs|Avares|Petits … de l’Opéra',
    'RAVE|Navet|Racine|Fête techno',
    'RAVIN|Gorge|Précipice|Fossé profond',
    'RAYON|Trait de lumière|Étagère|Demi-diamètre',
    'RAYURE|Strie|Zébrure|Éraflure',
    'RAZ|Courant marin violent|… de marée|Passage breton dangereux',
    'RE|Note de musique|Deuxième note|Seconde de la gamme',
    'RECETTE|Mode d’emploi du chef|Encaisse|Ça fait …',
    'RECIT|Histoire|Narration|Compte rendu',
    'RECITS|Histoires|Narrations|Comptes rendus',
    'RECOLTE|Moisson|Cueillette|Butin',
    'RECORD|Exploit|Meilleure performance|Sommet historique',
    'RECREATION|Pause|Détente|Cour d’école',
    'RECU|Admis|Accueilli|Ticket de caisse',
    'RECUS|Admis|Accueillis|Tickets de caisse',
    'REFUGE|Abri de montagne|Asile|Havre de paix',
    'REGARD|Coup d’œil|Œillade|Plaque d’égout',
    'REGARDS|Coups d’œil|Œillades|Plaques d’égout',
    'REGION|Contrée|Province|Zone',
    'REGLE|Loi|Instrument droit|Menstruation',
    'REGLES|Lois|Instruments droits|Consignes',
    'REGRET|Remords|Nostalgie|Contrition',
    'REIN|Organe filtrant|Bas du dos|Tour de …s',
    'REINE|Souveraine|Dame aux échecs|Abeille pondeuse',
    'REINES|Souveraines|Dames aux échecs|Abeilles pondeuses',
    'REINS|Organes filtrants|Bas du dos|Tour de …',
    'REMEDE|Médicament|Antidote|Parade',
    'REMPART|Muraille|Fortification|Défense',
    'RENARD|Goupil|Malin|Fourrure rousse',
    'RENARDS|Goupils|Malins|Fourrures rousses',
    'RENNE|Cervidé du Nord|Caribou|Il tire le traîneau',
    'RENNES|Cervidés du Nord|Caribous|Tireurs de traîneau',
    'RENTRER|Revenir chez soi|Ranger à l’intérieur|Percuter',
    'REPAS|Déjeuner|Dîner|Festin',
    'REPONSE|Réplique|Solution|Riposte',
    'REPOS|Détente|Sieste|Relâche',
    'REPTILE|Serpent ou lézard|Rampant|Crocodile',
    'REPU|Rassasié|Gavé|Qui n’a plus faim',
    'REPUS|Rassasiés|Gavés|Qui n’ont plus faim',
    'REQUIN|Squale|Prédateur marin|Homme d’affaires sans pitié',
    'RESEAU|Maillage|Filet|Lignes interconnectées',
    'RESSORT|Spirale élastique|Énergie|Compétence',
    'RESTAURANT|Brasserie|Bistro|Auberge',
    'RESTE|Reliquat|Demeure|Surplus',
    'RESTER|Demeurer|Séjourner|Subsister',
    'RESTES|Reliquats|Demeures|Surplus',
    'RETARD|Délai|Lenteur|Décalage',
    'RETARDS|Délais|Lenteurs|Décalages',
    'RETOUR|Rentrée|Voyage inverse|Match …',
    'RETRAITE|Pension|Repli|Isolement',
    'REUNION|Assemblée|Rassemblement|Île de l’océan Indien',
    'REUSSIR|Gagner|Aboutir|Faire un tabac',
    'REVANCHE|Vengeance|Deuxième manche|Belle',
    'REVE|Songe|Chimère|Illusion',
    'REVEIL|Sonnerie du matin|Sortie du sommeil|Renaissance',
    'REVES|Songes|Chimères|Illusions',
    'REVOLUTION|Rotation|Bouleversement|1789',
    'RHUM|Alcool de canne|Punch|Baba au …',
    'RHUME|Coryza|Refroidissement|Nez qui coule',
    'RHUMS|Alcools de canne|Punchs|Babas au …',
    'RI|Participe de rire|S’est esclaffé|Plaisanté',
    '°RIA|Aber galicien|Vallée envahie par la mer|Estuaire en entonnoir',
    'RICHE|Fortuné|Aisé|Abondant',
    'RICHESSE|Fortune|Opulence|Abondance',
    'RIDE|Pli de peau|Sillon|Onde',
    'RIDEAU|Voilage|Tenture|Il tombe à la fin de la pièce',
    'RIDES|Plis de peau|Sillons|Ondes',
    'RIEN|Néant|Zéro|Nul',
    'RIENS|Bagatelles|Broutilles|Futilités',
    'RIGOLE|Canal étroit|Ruisselet|Il s’amuse',
    'RIME|Assonance|Vers|Ni … ni raison',
    'RIMES|Assonances|Vers|Échos de fin de vers',
    'RIRE|S’esclaffer|Rigoler|Pouffer',
    'RIRES|Éclats de gaieté|Rigolades|Fous …',
    'RIS|Rires|Thymus de veau|Voile réduite',
    'RIT|S’esclaffe|Se moque|Plaisante',
    'RITE|Cérémonie|Coutume|Rituel',
    'RITES|Cérémonies|Coutumes|Rituels',
    'RIVAGE|Rive|Littoral|Bord de mer',
    'RIVE|Berge|Bord|Gauche à Paris',
    'RIVIERE|Cours d’eau|Affluent|Collier de diamants',
    'RIZ|Céréale d’Asie|Grain blanc|Paella en contient',
    'ROBE|Habit féminin|Toge|Pelage du cheval',
    'ROBINET|Vanne|Prise d’eau|Il fuit parfois',
    'ROBOT|Automate|Androïde|Machine obéissante',
    'ROC|Rocher|Pierre dure|Solide comme lui',
    'ROCHE|Pierre|Minéral|Caillou massif',
    'ROCHER|Roc|Récif|Chocolat praliné',
    'ROCS|Rochers|Pierres dures|Blocs',
    'ROI|Souverain|Monarque|Pièce maîtresse des échecs',
    'ROIS|Souverains|Monarques|Galette des …',
    'ROLE|Personnage|Fonction|Registre',
    'ROLES|Personnages|Fonctions|Registres',
    'ROMAN|Récit|Livre|Style d’église',
    'ROMANCIER|Écrivain|Auteur de fiction|Conteur',
    'RONCE|Mûrier sauvage|Épine|Buisson piquant',
    'ROND|Cercle|Circulaire|Sou, en argot',
    'ROSE|Fleur à épines|Couleur pâle|Point cardinal des vents',
    'ROSEAU|Jonc|Plante des étangs|Il plie mais ne rompt pas',
    'ROSEE|Gouttes du matin|Humidité de l’aube|Perles d’herbe',
    'ROSEES|Gouttes du matin|Humidités de l’aube|Perles d’herbe',
    'ROSES|Fleurs à épines|Couleurs pâles|Bouquets d’amoureux',
    'ROSSIGNOL|Chanteur nocturne|Fausse clé|Invendu',
    'ROT|Renvoi|Éructation|Gaz',
    'ROTI|Pièce de viande|Grillé|Cuit au four',
    'ROTS|Renvois|Éructations|Gaz',
    'ROUE|Pneu|Jante|Cinquième … du carrosse',
    'ROUGE|Couleur du sang|Vin|Écarlate',
    'ROUGIR|S’empourprer|Avoir honte|Mûrir, pour une tomate',
    'ROULEAU|Cylindre|Vague déferlante|Bigoudi',
    'ROUTE|Chaussée|Voie|Itinéraire',
    'ROUTES|Chaussées|Voies|Itinéraires',
    'ROUX|Rouquin|Poil de carotte|Sauce liée',
    'RU|Petit ruisseau|Filet d’eau|Rigole',
    'RUA|S’élança|Donna des coups de pied|Se … dans les brancards',
    'RUAS|T’élanças|Donnas des coups de pied|Te jetas',
    'RUBAN|Galon|Bande|Faveur',
    'RUCHE|Abri d’abeilles|Essaim|Fourmilière humaine',
    'RUDE|Rugueux|Pénible|Sévère',
    'RUE|Voie de ville|Artère|S’élança',
    'RUER|Lancer les sabots|Se précipiter|Se … : se jeter',
    'RUES|Voies de ville|Artères|S’élances',
    'RUINE|Décombres|Faillite|Vestige',
    'RUINES|Décombres|Faillites|Vestiges',
    'RUISSEAU|Ru|Petit cours d’eau|Caniveau',
    'RUS|Ruisseaux|Filets d’eau|Petits cours',
    'RUSE|Astuce|Stratagème|Finaude',
    'RUSES|Astuces|Stratagèmes|Finaudes',
    'RUSSE|Moscovite|Slave|Montagnes …s',
    'RUT|Période des chaleurs|Brame|Saison des amours animales',
    'RUTS|Périodes des chaleurs|Brames|Saisons des amours animales',
    'RYTHME|Cadence|Tempo|Mesure',
    /* S */
    'SA|Possessif féminin|À elle|… Majesté',
    'SABLE|Grains de plage|Couleur beige|Biscuit breton',
    'SABOT|Chaussure de bois|Pied du cheval|Frein de roue',
    'SAC|Besace|Cabas|Mettre à … : piller',
    'SACS|Besaces|Cabas|Sacoches',
    'SAFRAN|Épice jaune|Crocus|Couleur orangée',
    'SAGA|Épopée|Légende nordique|Longue histoire',
    'SAGAS|Épopées|Légendes nordiques|Longues histoires',
    'SAGE|Raisonnable|Posé|Philosophe',
    'SAGESSE|Raison|Prudence|Dent tardive',
    'SAIN|En bonne santé|Salubre|… et sauf',
    'SAISIR|Attraper|Comprendre|Confisquer',
    'SAISON|Été ou hiver|Période|Haute ou basse',
    'SAIT|Connaît|Est au courant|Peut',
    'SALADE|Laitue|Mélange|Raconter des …s',
    'SALAIRE|Paie|Rémunération|Émoluments',
    'SALE|Malpropre|Crasseux|Mauvais, pour un tour',
    'SALES|Malpropres|Crasseux|Mauvais, pour des tours',
    'SALIVE|Bave|Crachat|Dépenser sa …',
    'SALLE|Pièce|Public|… de bains',
    'SALON|Séjour|Pièce de réception|Exposition',
    'SALUT|Bonjour|Sauvetage|Rédemption',
    'SALUTS|Bonjours|Sauvetages|Rédemptions',
    'SAMEDI|Jour du sabbat|Veille du dimanche|Jour de marché',
    'SANDWICH|Casse-croûte|Jambon-beurre|Pris en … : coincé',
    'SANG|Liquide rouge|Hémoglobine|Lignée',
    'SANS|Privé de|Dépourvu de|… cesse',
    'SANTE|Forme|Bien-être|À la vôtre !',
    'SAPEUR|Pompier|Soldat du génie|Terrassier militaire',
    'SAPIN|Conifère de Noël|Résineux|Cercueil, en argot',
    'SAPINS|Conifères de Noël|Résineux|Cercueils, en argot',
    'SARDINE|Poisson en boîte|Galon de caporal|Piquet de tente',
    'SARDINES|Poissons en boîte|Galons de caporal|Piquets de tente',
    'SARI|Robe indienne|Drapé|Vêtement de l’Inde',
    'SAS|Tamis|Chambre étanche|Passage',
    'SATIN|Soie lustrée|Étoffe brillante|Peau douce',
    'SAUCE|Jus|Condiment liquide|Allonger la …',
    'SAUCISSE|Charcuterie|Knack|Chipolata',
    'SAUF|Excepté|Sain et …|Hormis',
    'SAULE|Arbre des rives|Pleureur|Osier',
    'SAULES|Arbres des rives|Pleureurs|Osiers',
    'SAUMON|Poisson rose|Poisson migrateur|Rose orangé',
    'SAUT|Bond|Élan|Visite éclair',
    'SAUTER|Bondir|Exploser|Omettre',
    'SAUTERELLE|Criquet|Grillon|Femme grande et maigre',
    'SAUTS|Bonds|Élans|Visites éclair',
    'SAUVAGE|Farouche|Non apprivoisé|Brutal',
    'SAVANE|Prairie tropicale|Steppe africaine|Territoire du lion',
    'SAVOIR|Connaître|Science|Culture',
    'SAVON|Pain moussant|Détergent|Passer un … : gronder',
    'SAXO|Instrument de jazz|Cuivre à anche|Sax',
    'SCEAU|Cachet|Marque|Empreinte officielle',
    'SCENE|Plateau|Épisode|Querelle',
    'SCENES|Plateaux|Épisodes|Querelles',
    'SCIE|Outil à dents|Rengaine|Poisson-…',
    'SCIENCE|Savoir|Connaissance|Discipline',
    'SCIES|Outils à dents|Rengaines|Refrains lassants',
    'SE|Pronom réfléchi|Lui-même, en complément|Il … lave',
    'SEAU|Récipient à anse|Baquet|Pleuvoir à …x',
    'SEC|Aride|Desséché|Brusque',
    'SECHE|Aride|Mollusque à encre|Cigarette, en argot',
    'SECOND|Deuxième|Adjoint|Instant',
    'SECRET|Caché|Confidence|Mystère',
    'SECRETAIRE|Assistante|Meuble à écrire|Oiseau d’Afrique',
    'SECRETS|Cachés|Confidences|Mystères',
    'SECS|Arides|Desséchés|Brusques',
    'SEIGLE|Céréale|Pain gris|Farine de pain noir',
    'SEIN|Poitrine|Mamelle|Au … de : parmi',
    'SEINS|Poitrines|Mamelles|Au … de : parmi',
    'SEL|Condiment blanc|Piquant|Chlorure de sodium',
    'SELS|Condiments blancs|Cristaux marins|Piquants',
    'SEMAINE|Sept jours|Période ouvrée|Salaire hebdomadaire',
    'SEME|Plante des graines|Disperse|Distance',
    'SEMELLE|Dessous de chaussure|Plante|Viande dure',
    'SEMES|Plantes des graines|Disperses|Distances',
    'SEMESTRE|Six mois|Demi-année|Période scolaire',
    'SENS|Direction|Signification|Vue ou ouïe',
    'SENT|Hume|Devine|Empeste',
    'SENTIER|Chemin|Piste|Voie étroite',
    'SENTIERS|Chemins|Pistes|Voies étroites',
    'SENTIR|Humer|Éprouver|Empester',
    'SEPT|Six plus un|Jours de la semaine|Merveilles du monde antique',
    'SERA|Futur d’être|Il … là|Existera',
    'SERAS|Existeras|Tu … là ?|Deviendras',
    'SERF|Paysan attaché|Esclave féodal|Vilain',
    'SERFS|Paysans attachés|Esclaves féodaux|Vilains',
    'SERIEUX|Grave|Appliqué|Fiable',
    'SERPENT|Reptile|Couleuvre|Vipère',
    'SERRURE|Verrou|Fermeture|Trou de la clé',
    'SERT|Aide|Présente les plats|Est utile',
    'SERVIETTE|Essuie-main|Cartable|Pochette de table',
    'SERVIR|Présenter les plats|Être utile|Mettre la balle en jeu',
    'SES|Possessifs pluriels|À elle, au pluriel|… affaires',
    'SET|Manche au tennis|Napperon|Jeu décisif',
    'SETS|Manches de tennis|Napperons|Jeux décisifs',
    'SEUIL|Pas de porte|Limite|Entrée',
    'SEUILS|Pas de porte|Limites|Entrées',
    'SEUL|Solitaire|Unique|Isolé',
    'SEULS|Solitaires|Uniques|Isolés',
    'SI|Note après la|Condition|Oui, après une négation',
    'SIECLE|Cent ans|Époque|Grand … : XVIIe',
    'SIEGE|Chaise|Encerclement|Quartier général',
    'SIEN|À lui|Le … : ce qui lui appartient|Possessif',
    'SIENS|À lui|Les … : sa famille|Possessifs pluriels',
    'SIFFLET|Instrument d’arbitre|Coup de semonce sonore|Gorge, en argot',
    'SIGNE|Geste|Symbole|Indice',
    'SIGNES|Gestes|Symboles|Indices',
    'SILENCE|Mutisme|Absence de bruit|Pause musicale',
    'SILLON|Tranchée|Ride|Rainure de disque',
    'SILO|Réservoir à grain|Grenier|Rampe de missile',
    'SILOS|Réservoirs à grain|Greniers|Rampes de missiles',
    'SIMPLE|Facile|Modeste|Naïf',
    'SINGE|Primate|Imitateur|Macaque',
    'SINGULIER|Unique|Bizarre|Nombre grammatical',
    'SIRE|Majesté|Roi|Triste …',
    'SIRENE|Femme-poisson|Alarme|Tentatrice',
    'SIRES|Majestés|Rois|Tristes …',
    'SIROP|Liqueur sucrée|Médicament|Grenadine',
    'SIS|Situé|Établi|Localisé',
    'SITE|Lieu|Paysage|Page web',
    'SITES|Lieux|Paysages|Pages web',
    'SIX|Demi-douzaine|Face de dé|Cinq plus un',
    'SKI|Glisse sur neige|Planche|Nautique',
    'SOCLE|Piédestal|Base|Assise',
    'SOCLES|Piédestaux|Bases|Assises',
    'SODA|Boisson gazeuse|Limonade|Soft',
    'SOEUR|Frangine|Religieuse|Âme …',
    'SOEURS|Frangines|Religieuses|Âmes …',
    'SOFA|Canapé|Divan|Méridienne',
    'SOI|La personne elle-même|Chez … : à la maison|Amour de …',
    'SOIE|Fil de ver|Étoffe fine|Poil de sanglier',
    'SOIES|Fils de ver|Étoffes fines|Poils de sanglier',
    'SOIF|Envie de boire|Gosier sec|Désir ardent',
    'SOIR|Crépuscule|Fin de journée|Veillée',
    'SOIT|Admettons|D’accord|Ainsi … -il',
    'SOL|Terre|Plancher|Note entre fa et la',
    'SOLDAT|Militaire|Troufion|Figurine de plomb',
    'SOLDE|Rabais|Reste à payer|Paie du militaire',
    'SOLEIL|Astre du jour|Tournesol|Figure de gymnastique',
    'SOLIDE|Robuste|Résistant|Stable',
    'SOLO|Seul|Morceau pour un seul|En …',
    'SOLS|Terres|Planchers|Notes entre fa et la',
    'SOMBRE|Obscur|Triste|Ténébreux',
    'SOMME|Total|Montant|Sieste',
    'SOMMEIL|Repos|Dodo|Endormissement',
    'SOMMET|Cime|Pic|Réunion de chefs',
    'SON|Bruit|Écorce de blé|À lui',
    'SONGE|Rêve|Chimère|Réfléchit',
    'SONNETTE|Carillon|Timbre|Clochette',
    'SONS|Bruits|Écorces de blé|Tons',
    'SONT|Existent|Ils … là|Se trouvent',
    'SORCIER|Magicien|Enchanteur|Malin',
    'SORT|Destin|Maléfice|Tirer au …',
    'SORTE|Genre|Espèce|Manière',
    'SORTIE|Issue|Porte|Excursion',
    'SORTIR|Partir|Quitter|Publier',
    'SORTS|Destins|Maléfices|Tirages au hasard',
    'SOT|Idiot|Niais|Bouffon d’antan',
    'SOTS|Idiots|Niais|Bouffons d’antan',
    'SOU|Pièce ancienne|Centime|Pas un … vaillant',
    'SOUCI|Tracas|Fleur jaune|Préoccupation',
    'SOUFFLE|Haleine|Vent|Plat gonflé',
    'SOUFRE|Élément jaune|Odeur d’enfer|Allumette',
    'SOUK|Marché oriental|Bazar|Désordre',
    'SOUPE|Potage|Bouillon|Trempé comme une …',
    'SOUPIR|Plainte|Silence musical|Rendre le dernier …',
    'SOURCE|Fontaine|Point de départ|Informateur',
    'SOURCIL|Arc pileux|Poils de l’œil|Froncer les …s',
    'SOURD|Malentendant|Étouffé|Qui ne veut rien entendre',
    'SOURIRE|Risette|Rictus aimable|Être favorable',
    'SOURIS|Rongeur|Accessoire d’ordinateur|Gigot de mouton',
    'SOUS|Plus bas que|Argent|Pièces de monnaie',
    'SOUVENIR|Mémoire|Réminiscence|Bibelot de voyage',
    'SOUVENT|Fréquemment|Maintes fois|Régulièrement',
    'SPECTACLE|Représentation|Show|Scène',
    'SPECTATEUR|Témoin|Assistant|Public',
    'SPORT|Exercice physique|Activité athlétique|C’est du … !',
    'SQUELETTE|Ossature|Charpente osseuse|Plan',
    'STADE|Arène|Étape|Terrain de sport',
    'STADES|Arènes|Étapes|Terrains de sport',
    'STATION|Arrêt|Gare|Lieu de vacances',
    'STATUE|Sculpture|Buste|Figure de marbre',
    'STATUES|Sculptures|Bustes|Figures de marbre',
    'STEAK|Bifteck|Tranche de bœuf|… frites',
    'STOP|Halte|Panneau octogonal|Auto-…',
    'STUDIO|Appartement d’une pièce|Salle d’enregistrement|Atelier de photographe',
    'STYLO|Plume|Bic|Pointe bille',
    'SU|Participe de savoir|Appris|Connu',
    'SUA|Transpira|Suinta|Peina',
    'SUC|Jus|Sève|Sécrétion',
    'SUCETTE|Confiserie|Tétine|Friandise à bâton',
    'SUCRE|Saccharose|Morceau blanc|Casser du … : médire',
    'SUCRES|Morceaux blancs|Saccharoses|Casser du … : médire',
    'SUCS|Jus|Sèves|Sécrétions',
    'SUD|Midi|Point cardinal bas|Direction de Marseille',
    'SUE|Transpire|Connue|Apprise',
    'SUER|Transpirer|Peiner|Faire … : ennuyer',
    'SUES|Transpires|Connues|Apprises',
    'SUEUR|Transpiration|Nage|À la … de son front',
    'SUIE|Dépôt noir|Poussière de cheminée|Noir de fumée',
    'SUIS|Existe|Je … là|Accompagne',
    'SUISSE|Helvète|Gardien d’église|Petit … : fromage',
    'SUIT|Accompagne|Talonne|Vient après',
    'SUITE|Continuation|Série|Appartement d’hôtel',
    'SUIVRE|Filer|Accompagner|Comprendre',
    'SUJET|Thème|Question|Citoyen du roi',
    'SUPER|Formidable|Génial|Essence d’autrefois',
    'SUPPLICE|Torture|Tourment|Martyre',
    'SUR|Dessus|Certain|Acide',
    'SURE|Certaine|Acide|Fiable',
    'SURF|Glisse sur les vagues|Planche|Navigation web',
    'SURFACE|Superficie|Aire|Apparence',
    'SURPRISE|Étonnement|Cadeau inattendu|Stupeur',
    'SURS|Certains|Acides|Fiables',
    'SUS|Connus|Appris|Courir … : attaquer',
    'SUT|Connut|Apprit|Il … la vérité',
    'SYMBOLE|Emblème|Signe|Allégorie',
    /* T */
    'TA|Possessif familier|À toi|… mère !',
    'TABAC|Plante à fumer|Bureau de cigarettes|Triomphe',
    'TABLE|Meuble à plateau|Liste ordonnée|Passer à … : avouer',
    'TABLEAU|Peinture encadrée|Œuvre de musée|Ardoise d’école',
    'TABOURET|Siège sans dossier|Escabeau|Pouf',
    'TAC|Bruit sec|Riposte|Du … au …',
    'TACHE|Salissure|Souillure|Besogne',
    'TAIE|Housse d’oreiller|Enveloppe|Tache sur l’œil',
    'TAILLE|Hauteur|Stature|Coupe',
    'TALC|Poudre douce|Minéral tendre|Poudre de bébé',
    'TALENT|Don|Aptitude|Génie',
    'TALON|Arrière du pied|Souche de carnet|Point faible d’Achille',
    'TAMBOUR|Instrument à peau|Caisse|Cylindre de machine',
    'TAMIS|Crible|Passoire|Sas',
    'TAN|Écorce de chêne|Tannin|Poudre de tanneur',
    'TANK|Char d’assaut|Blindé|Citerne',
    '°TANS|Écorces de chêne|Tannins|Poudres de tanneur',
    'TANT|Tellement|Si fort|… pis !',
    'TANTE|Sœur du père|Tata|Parente',
    'TAON|Mouche piqueuse|Insecte des chevaux|Diptère agaçant',
    'TAPE|Claque|Frappe|Emprunte de l’argent',
    'TAPER|Frapper|Dactylographier|Emprunter',
    'TAPIS|Moquette|Carpette|Envoyer au … : au sol',
    'TARD|Pas tôt|À la bourre|À une heure avancée',
    'TARE|Défaut|Poids de l’emballage|Vice',
    'TARES|Défauts|Poids des emballages|Vices',
    'TARIF|Prix|Barème|Grille des prix',
    'TARTE|Tourte|Gifle|Nigaud',
    'TARTES|Tourtes|Gifles|Niais',
    'TAS|Pile|Monceau|Amas',
    'TASSE|Récipient à anse|Bol à café|Boire la … : se noyer à moitié',
    'TASSEAU|Liteau|Support de planche|Morceau de bois',
    'TASSES|Récipients à anse|Bols à café|Services à thé',
    'TAUPE|Petit mammifère aveugle|Espion infiltré|Myope',
    'TAUPES|Petits mammifères aveugles|Espions infiltrés|Myopes',
    'TAUREAU|Bovin mâle|Signe de mai|Force de la nature',
    'TAUX|Pourcentage|Proportion|Intérêt',
    'TAXI|Voiture de louage|Chauffeur|Tacot jaune new-yorkais',
    'TE|Pronom complément|Règle en forme de T|Toi, en complément',
    'TECK|Bois exotique|Bois de pont|Arbre d’Asie',
    'TEINT|Coloris de peau|Carnation|Coloré',
    'TEL|Pareil|Ainsi|… quel',
    'TELEPHONE|Portable|Combiné|Coup de fil',
    'TELEVISION|Petit écran|Poste|Lucarne du salon',
    'TELS|Pareils|Semblables|… quels',
    'TEMOIGNAGE|Déposition|Récit de ce qu’on a vu|Preuve d’amitié',
    'TEMOIN|Observateur|Spectateur|Relais d’athlète',
    'TEMPETE|Ouragan|Tourmente|Déchaînement',
    'TEMPS|Durée|Météo|Mesure musicale',
    'TENDRE|Doux|Affectueux|Allonger la main',
    'TENIR|Garder|Avoir en main|Résister',
    'TENTE|Abri de toile|Chapiteau|Attire',
    'TENU|Gardé|Obligé|Soigné',
    'TENUS|Gardés|Obligés|Soignés',
    'TERRAIN|Sol|Parcelle|Stade',
    'TERRASSE|Balcon|Café en plein air|Toit plat',
    'TERRE|Planète|Sol|Glaise',
    'TERRES|Domaines|Sols|Continents',
    'TES|Possessifs|À toi, au pluriel|… amis',
    'TETE|Crâne|Esprit|Caboche',
    'TETES|Crânes|Caboches|Esprits',
    'TETU|Obstiné|Buté|Tête de mule',
    'TETUS|Obstinés|Butés|Têtes de mule',
    'THE|Infusion|Boisson chaude|Cérémonie japonaise',
    'THES|Infusions|Boissons chaudes|Cérémonies japonaises',
    'THON|Gros poisson|Poisson en boîte|Germon',
    'THYM|Aromate|Herbe de Provence|Farigoule',
    'TIC|Manie|Habitude|Geste involontaire',
    'TICS|Manies|Habitudes|Gestes involontaires',
    'TIGE|Queue de fleur|Branche|Barre',
    'TIGES|Queues de fleurs|Branches|Barres',
    'TIGRE|Félin rayé|Fauve d’Asie|Jaloux comme lui',
    'TIMBRE|Vignette postale|Sonnerie|Sonorité de voix',
    'TIR|Coup de feu|Tentative au but|Stand',
    'TIRE|Tracte|Voiture, en argot|Vol à la …',
    'TIRELIRE|Cochon d’épargne|Caisse d’enfant|Tête, en argot',
    'TIRER|Tracter|Faire feu|Imprimer',
    'TIROIR|Casier|Coulisse|Fond de … : restes',
    'TIRS|Coups de feu|Tentatives au but|Stands',
    'TISANE|Infusion|Verveine|Camomille',
    'TISANES|Infusions|Verveines|Camomilles',
    'TISSU|Étoffe|Textile|Enchevêtrement',
    'TISSUS|Étoffes|Textiles|Enchevêtrements',
    'TITRE|Intitulé|Diplôme|Couronne sportive',
    'TITRES|Intitulés|Diplômes|Couronnes sportives',
    'TOC|Imitation|Faux|Coup à la porte',
    'TOCS|Imitations|Faux|Coups à la porte',
    'TOGE|Robe romaine|Tunique|Robe de magistrat',
    'TOGES|Robes romaines|Tuniques|Robes de magistrat',
    'TOI|Pronom tonique|Pas moi|Tu, en tonique',
    'TOILE|Tissu|Tableau|Réseau Internet',
    'TOIT|Couverture|Tuiles|Logis',
    'TOITS|Couvertures|Tuiles|Logis',
    'TOLE|Plaque de métal|Fer laminé|Taule',
    'TOLES|Plaques de métal|Fers laminés|Taules',
    'TOMATE|Légume-fruit rouge|Pomme d’amour|Pastis à la grenadine',
    'TOMATES|Légumes-fruits rouges|Pommes d’amour|Pastis à la grenadine',
    'TOMBE|Sépulture|Chute|Choit',
    'TOMBEAU|Sépulture|Mausolée|À … ouvert : très vite',
    'TOMBER|Chuter|Descendre|… amoureux',
    'TOME|Volume|Livre|Partie d’ouvrage',
    'TON|Intonation|À toi|Nuance',
    'TONNERRE|Grondement|Bruit d’orage|Du … : formidable',
    'TONS|Intonations|Nuances|Couleurs',
    'TORCHON|Chiffon|Linge de cuisine|Journal de piètre qualité',
    'TORRENT|Cours d’eau rapide|Flot|Déluge',
    'TORT|Erreur|Préjudice|Avoir …',
    'TORTS|Erreurs|Préjudices|Avoir des …',
    'TORTUE|Reptile à carapace|Lambine|Formation romaine',
    'TOT|De bonne heure|En avance|Rapidement',
    'TOUR|Donjon|Circuit|Ruse',
    'TOURNER|Pivoter|Virer|Filmer',
    'TOURNESOL|Soleil|Grande fleur jaune|Professeur distrait',
    'TOURS|Donjons|Circuits|Ruses',
    'TOUT|Entier|Ensemble|Chaque',
    'TOUX|Quinte|Irritation de gorge|Rhume qui racle',
    'TRAC|Peur de scène|Angoisse|Tout à … : soudainement',
    'TRACE|Empreinte|Vestige|Indice',
    'TRACS|Peurs de scène|Angoisses|Frayeurs d’artiste',
    'TRACTEUR|Engin agricole|Véhicule de ferme|Remorqueur',
    'TRAGIQUE|Dramatique|Funeste|Poignant',
    'TRAIN|Convoi|Rythme|Arrière-…',
    'TRAINEAU|Luge|Chariot de neige|Véhicule du père Noël',
    'TRAIT|Ligne|Caractéristique|D’un … : d’un coup',
    'TRAITE|Accord|Lettre de change|Opération de la vache laitière',
    'TRAJET|Parcours|Itinéraire|Course',
    'TRAME|Canevas|Intrigue|Fil de tissage',
    'TRAMWAY|Rame urbaine|Transport sur rails|Désir de Tennessee Williams',
    'TRANQUILLE|Calme|Paisible|Peinard',
    'TRAVAIL|Labeur|Boulot|Accouchement',
    'TRAVERS|Défaut|De … : de biais|À … : par',
    'TREFLE|Plante fourragère|Couleur de cartes|Porte-bonheur à quatre feuilles',
    'TRESOR|Magot|Richesse|Chéri',
    'TRESORS|Magots|Richesses|Chéris',
    'TRI|Sélection|Classement|Triage',
    'TRIBU|Peuplade|Clan|Grande famille',
    'TRICOT|Pull|Maille|Ouvrage de laine',
    'TRIO|Trois musiciens|Groupe de trois|Triade',
    'TRIOS|Groupes de trois|Triades|Ensembles de trois musiciens',
    'TRIS|Sélections|Classements|Triages',
    'TRISTE|Malheureux|Morose|Affligé',
    'TROC|Échange|Commerce sans argent|Donnant-donnant',
    'TROIS|Nombre impair|Deux plus un|Mousquetaires plus un',
    'TROMPE|Nez d’éléphant|Cor de chasse|Duper',
    'TROMPER|Duper|Berner|Être infidèle',
    'TROMPETTE|Cuivre|Instrument à pistons|Nez en …',
    'TRONC|Fût|Buste|Boîte à aumônes',
    'TROP|Excessivement|Exagérément|De …',
    'TROT|Allure du cheval|Course hippique|Au … : vite',
    'TROTTOIR|Chaussée piétonne|Bord de rue|Bitume du passant',
    'TROU|Orifice|Cavité|Bled',
    'TROUPE|Bande|Compagnie|Régiment',
    'TROUPEAU|Cheptel|Harde|Foule docile',
    'TROUVER|Dénicher|Découvrir|Estimer',
    'TRUC|Astuce|Chose|Machin',
    'TRUCS|Astuces|Choses|Machins',
    'TRUITE|Poisson de rivière|Salmonidé|Arc-en-ciel',
    'TSAR|Empereur russe|Autocrate|Souverain de Moscou',
    'TSARS|Empereurs russes|Autocrates|Souverains de Moscou',
    'TU|Pronom familier|Passé sous silence|Toi, en sujet',
    'TUA|Assassina|Abattit|Fit mourir',
    'TUAS|Assassinas|Abattis|Fis mourir',
    'TUBA|Instrument à vent|Cuivre grave|Tube de plongée',
    'TUBE|Tuyau|Succès musical|Éprouvette',
    'TUE|Assassiné|Abat|Épuise',
    'TUER|Assassiner|Abattre|Épuiser',
    'TUES|Assassinés|Abats|Épuises',
    'TULIPE|Fleur à bulbe|Fleur hollandaise|Abat-jour évasé',
    'TUNNEL|Galerie|Souterrain|Longue période difficile',
    'TUTU|Jupe de danseuse|Tulle|Costume de ballet',
    'TUYAU|Conduit|Canalisation|Renseignement',
    'TYPE|Modèle|Genre|Individu',
    /* U */
    'UN|Chiffre|Article indéfini|… pour tous',
    'UNE|Article féminin|Première page|À la … : en vedette',
    'UNES|Premières pages|À la … : en vedette|Grands titres',
    'UNI|Lisse|Soudé|Plan',
    'UNIE|Lisse|Soudée|Sans aspérité',
    'UNIES|Lisses|Soudées|Sans motif',
    'UNIFORME|Tenue réglementaire|Régulier|Monotone',
    'UNIQUE|Seul|Exceptionnel|Sens …',
    'UNIR|Assembler|Marier|Relier',
    'UNIS|Solidaires|Assemblés|Sans motif',
    'UNIVERS|Cosmos|Monde|Domaine',
    'URGENCE|Nécessité|Hâte|Service d’hôpital',
    'URNE|Vase|Boîte de vote|Bulletin dans l’…',
    'URNES|Vases|Boîtes de vote|Vases funéraires',
    'US|Usages|… et coutumes|Habitudes',
    'USAGE|Utilisation|Coutume|Mode d’emploi',
    'USAGES|Utilisations|Coutumes|Modes d’emploi',
    'USE|Élimé|Râpé|Abîmé',
    'USEE|Élimée|Râpée|Fatiguée',
    'USEES|Élimées|Râpées|Fatiguées',
    'USER|Abîmer|Consommer|Utiliser',
    'USES|Élimes|Consommes|Abîmes',
    'USINE|Fabrique|Manufacture|Atelier',
    'USINES|Fabriques|Manufactures|Ateliers',
    'UT|Le do d’autrefois|Note ancienne|Clé d’…',
    'UTILE|Pratique|Profitable|Nécessaire',
    'UTILES|Pratiques|Profitables|Nécessaires',
    /* V */
    'VA|Il … bien|Aller, au présent|Allez !',
    'VACANCES|Congés|Repos estival|Grandes …',
    'VACARME|Tapage|Tintamarre|Chahut',
    'VACHE|Laitière|Méchant|… à lait',
    'VAGUE|Lame|Imprécis|Flou',
    'VAIN|Inutile|Futile|Prétentieux',
    'VAISSEAU|Navire|Artère|Engin spatial',
    'VAISSELLE|Assiettes|Plats|Faire la …',
    'VAL|Vallée|Vallon|Par monts et par …x',
    'VALET|Serviteur|Carte à jouer|Domestique',
    'VALEUR|Prix|Courage|Mérite',
    'VALISE|Bagage|Malle|Faire sa …',
    'VALLEE|Val|Combe|Creux entre montagnes',
    'VALSE|Danse à trois temps|Tourbillon|Changement fréquent',
    'VAMPIRE|Suceur de sang|Dracula|Chauve-souris',
    'VANILLE|Gousse parfumée|Arôme|Épice des desserts',
    'VANTARD|Fanfaron|Crâneur|Hâbleur',
    'VAPEUR|Buée|Brume|Cuisson douce',
    'VAS|Tu … bien ?|Aller, deuxième personne|Tu t’en …',
    'VASE|Pot à fleurs|Boue|Récipient',
    'VASES|Pots à fleurs|Boues|Récipients',
    'VAUTOUR|Charognard|Grand oiseau chauve|Usurier',
    'VEAU|Petit de la vache|Cuir fin|Voiture poussive',
    'VEDETTE|Star|Canot rapide|Célébrité',
    'VEILLE|Jour d’avant|Éveil|Garde',
    'VEINE|Chance|Vaisseau sanguin|Filon',
    'VELO|Bicyclette|Deux-roues|Petite reine',
    'VELOURS|Tissu doux|Peluche|Jouer sur du …',
    'VELU|Poilu|Hirsute|Couvert de poils',
    'VEND|Cède|Commercialise|Trahit',
    'VENDRE|Céder|Commercer|Trahir',
    'VENGEANCE|Représailles|Revanche|Plat qui se mange froid',
    'VENIR|Arriver|Approcher|Découler',
    'VENT|Souffle|Brise|Mistral',
    'VENTRE|Abdomen|Panse|Bide',
    'VENU|Arrivé|Apparu|Nouveau …',
    'VER|Lombric|Asticot|Nu comme un …',
    'VERDURE|Végétation|Feuillage|Crudités',
    'VERGER|Plantation fruitière|Jardin d’arbres|Pommeraie',
    'VERITE|Réalité|Exactitude|Sincérité',
    'VERNIS|Laque|Enduit|Brillant superficiel',
    'VERRE|Coupe|Vitre|Matière transparente',
    'VERROU|Loquet|Targette|Blocage',
    'VERS|Poésie|En direction de|Asticots',
    'VERT|Couleur d’herbe|Vif|Pas mûr',
    'VERTS|Couleur d’herbe|Écologistes|Pas mûrs',
    'VESTE|Blazer|Blouson|Prendre une … : échouer',
    'VESTIAIRE|Garde-robe|Cabine|Dépôt de manteaux',
    'VETEMENT|Habit|Tenue|Fringue',
    'VETO|Refus|Opposition|Droit de …',
    'VEUF|Sans épouse|Esseulé|Endeuillé',
    'VIA|En passant par|Par|Voie romaine',
    'VIANDE|Chair|Bidoche|Steak',
    'VICE|Défaut|Perversion|… de forme',
    'VIDE|Vacant|Creux|Néant',
    'VIE|Existence|Biographie|Vitalité',
    'VIEILLE|Âgée|Ancienne|Mémé',
    'VIES|Existences|Biographies|Vitalités',
    'VIEUX|Âgé|Ancien|Vétuste',
    'VIF|Rapide|Éveillé|Brillant',
    'VIGNE|Cep|Pampre|Plante à raisin',
    'VIL|Méprisable|Bas|À … prix : bradé',
    'VILAIN|Laid|Méchant|Paysan du Moyen Âge',
    'VILLAGE|Bourg|Hameau|Commune',
    'VILLE|Cité|Agglomération|Métropole',
    'VIN|Bordeaux|Pinard|Vendange mise en bouteille',
    'VINAIGRE|Condiment acide|Aigre|Tourner au …',
    'VINGT|Score parfait|Quatre fois cinq|Dix-neuf plus un',
    'VINS|Crus|Nectars|Bordeaux et bourgognes',
    'VIOL|Profanation|Outrage|Crime grave',
    'VIOLET|Couleur de l’aubergine|Mauve|Parme',
    'VIOLON|Instrument à archet|Stradivarius|Prison du poste',
    'VIRAGE|Tournant|Courbe|Changement de cap',
    'VIRGULE|Ponctuation|Signe de pause|Séparateur décimal',
    'VIS|Pièce filetée|Existe|Vois, au passé simple',
    'VISA|Autorisation|Tampon|Carte bancaire',
    'VISAGE|Figure|Face|Minois',
    'VISE|Cible|Ajuste|Contrôlé',
    'VISITE|Rendez-vous|Inspection|Tourisme',
    'VIT|Existe|Aperçut|Habite',
    'VITE|Rapidement|Prestement|Vivement',
    'VITESSE|Rapidité|Train d’enfer|Boîte de …',
    'VITRE|Carreau|Fenêtre|Verre de fenêtre',
    'VITRINE|Étalage|Devanture|Présentoir',
    'VIVRE|Exister|Habiter|Subsister',
    'VOEU|Souhait|Promesse|Engagement religieux',
    'VOICI|Voilà|Présentation|Ici même',
    'VOIE|Chemin|Route|Rails',
    'VOILE|Toile de navire|Foulard|Sport nautique',
    'VOIR|Regarder|Observer|Comprendre',
    'VOISIN|Proche|Riverain|Contigu',
    'VOITURE|Automobile|Auto|Wagon',
    'VOIX|Organe vocal|Suffrage|Son',
    'VOL|Envol|Larcin|Trajet aérien',
    'VOLAILLE|Poulet|Basse-cour|Oiseau de ferme',
    'VOLCAN|Montagne de feu|Cratère|Etna',
    'VOLER|Dérober|Planer|Filer dans les airs',
    'VOLET|Persienne|Contrevent|Trier sur le …',
    'VOLEUR|Cambrioleur|Pickpocket|Filou',
    'VOLONTAIRE|Bénévole|Décidé|Délibéré',
    'VOLONTE|Désir|Détermination|Bon vouloir',
    'VOLS|Larcins|Trajets aériens|Décollages',
    'VOS|Possessifs|À vous|… amis',
    'VOTE|Scrutin|Suffrage|Élection',
    'VOTRE|À vous|Possessif de politesse|Le …',
    'VOULOIR|Désirer|Exiger|En … à quelqu’un',
    'VOUS|Pronom de politesse|Pluriel de tu|Toi et d’autres',
    'VOYAGE|Périple|Excursion|Parcours',
    'VOYAGEUR|Passager|Touriste|Explorateur',
    'VRAC|Désordre|En … : pêle-mêle|Sans emballage',
    'VRAI|Exact|Véritable|Réel',
    'VRAIS|Exacts|Véritables|Réels',
    'VU|Participe de voir|Aperçu|Au … de',
    'VUE|Regard|Panorama|Point de …',
    'VUS|Aperçus|Observés|Regardés',
    /* W */
    'WAGON|Voiture de train|Rame|Fourgon',
    /* Y */
    'YAOURT|Laitage|Yogourt|Pot lacté',
    'YEUX|Organes de la vue|Mirettes|Coûter les … de la tête',
    /* Z */
    'ZEBRE|Équidé rayé|Rayé noir et blanc|Drôle de type',
    'ZELE|Empressement|Ardeur|Excès de …',
    'ZERO|Rien du tout|Néant|Chiffre rond',
    'ZESTE|Écorce d’agrume|Pointe|Soupçon',
    'ZINC|Métal gris|Comptoir|Avion, en argot',
    'ZONE|Secteur|Région|Banlieue déshéritée',
    'ZOO|Parc animalier|Ménagerie|Jardin des bêtes',
    'ZOOS|Parcs animaliers|Ménageries|Jardins des bêtes',
    'ZUT|Flûte !|Mince !|Crotte !'
    ];
  }
})(typeof self !== 'undefined' ? self : globalThis);
