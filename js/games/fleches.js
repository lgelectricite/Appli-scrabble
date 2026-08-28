/*
 * GGgames — Mots fléchés (1 à 4 joueurs, 200 grilles pré-générées).
 * De VRAIS mots fléchés : la grille est pleine, les définitions sont écrites
 * DANS les cases, chaque flèche (droite ou coudée) pointe vers son mot, et
 * l'on écrit ses réponses directement dans la grille au clavier.
 * 5 forces × 40 grilles, progression enregistrée. En réseau : course sur la
 * même grille, le premier à compléter un mot l'emporte.
 */
(function (root) {
  'use strict';
  var GG = root.GG;
  var PAR_FORCE = 40;
  var FORCES = [
    { f: 1, nom: 'Force 1', desc: 'découverte' },
    { f: 2, nom: 'Force 2', desc: 'tranquille' },
    { f: 3, nom: 'Force 3', desc: 'classique' },
    { f: 4, nom: 'Force 4', desc: 'exigeante' },
    { f: 5, nom: 'Force 5', desc: 'expert' }
  ];
  var COLORS = ['#68b56b', '#5aa7de', '#e2a33c', '#c77bd6'];
  var KB = ['AZERTYUIOP', 'QSDFGHJKLM', 'WXCVBN⌫'];

  var defMap = null;
  function defOf(word) {
    if (GG.FLECHES_DEFS && GG.FLECHES_DEFS[word]) return GG.FLECHES_DEFS[word];
    if (!defMap) {
      defMap = {};
      var db = GG.byId && GG.byId.croises && GG.byId.croises._DB;
      if (db) {
        ['facile', 'moyen', 'difficile'].forEach(function (lvl) {
          db[lvl].forEach(function (e) {
            var i = e.indexOf('|');
            if (!defMap[e.slice(0, i)]) defMap[e.slice(0, i)] = e.slice(i + 1);
          });
        });
      }
    }
    return defMap[word] || 'Mot mystère…';
  }

  function norm(s) {
    return String(s || '').toUpperCase()
      .replace(/Œ/g, 'OE').replace(/Æ/g, 'AE')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Z]/g, '');
  }

  /* "WxH|MOT,case,dir,att;..." → { w, h, words:[{w, def, cells, dir, defCell, fleche}] }
     dir : 'h' → / 'v' ↓ · att 0 = flèche droite, 1 = flèche coudée.
     Flèches : h+0 ▸ (déf à gauche) · h+1 ↳ (déf au-dessus) ·
               v+0 ▾ (déf au-dessus) · v+1 ↴ (déf à gauche). */
  function loadGrid(force, gnum) {
    var idx = (force - 1) * PAR_FORCE + gnum;
    var raw = GG.FLECHES_GRILLES && GG.FLECHES_GRILLES[idx];
    if (!raw) return null;
    var parts = raw.split('|');
    var dims = parts[0].split('x');
    var W = parseInt(dims[0], 10), H = parseInt(dims[1], 10);
    var words = parts[1].split(';').map(function (chunk) {
      var bits = chunk.split(',');
      var w = bits[0];
      var p = parseInt(bits[1], 10);
      var d = parseInt(bits[2], 10);   // 0 = →, 1 = ↓
      var att = parseInt(bits[3] || '0', 10);
      var cells = [];
      for (var k = 0; k < w.length; k++) cells.push(d === 1 ? p + k * W : p + k);
      var defCell = d === 0 ? (att === 0 ? p - 1 : p - W) : (att === 0 ? p - W : p - 1);
      var fleche = d === 0 ? (att === 0 ? 'hd' : 'hc') : (att === 0 ? 'vd' : 'vc');
      return { w: w, def: defOf(w), cells: cells, dir: d === 1 ? 'v' : 'h',
        defCell: defCell, fleche: fleche, foundBy: -1, lastWrong: '' };
    });
    return { w: W, h: H, words: words };
  }

  /* progression locale : grilles terminées, par force */
  function doneList(force) {
    try {
      if (typeof localStorage === 'undefined') return [];
      var all = JSON.parse(localStorage.getItem('gg-fleches-done') || '{}');
      return all['f' + force] || [];
    } catch (e) { return []; }
  }
  function markDone(force, gnum) {
    try {
      if (typeof localStorage === 'undefined') return;
      var all = JSON.parse(localStorage.getItem('gg-fleches-done') || '{}');
      var list = all['f' + force] || [];
      if (list.indexOf(gnum) === -1) list.push(gnum);
      all['f' + force] = list;
      localStorage.setItem('gg-fleches-done', JSON.stringify(all));
    } catch (e) {}
  }
  function doneCount(force) {
    var n = 0;
    var list = doneList(force);
    for (var g = 0; g < PAR_FORCE; g++) if (list.indexOf(g) !== -1) n++;
    return n;
  }
  function nextGrid(force) {
    var done = doneList(force);
    for (var g = 0; g < PAR_FORCE; g++) {
      if (done.indexOf(g) === -1) return g;
    }
    return Math.floor(Math.random() * PAR_FORCE); // tout est fini : rejouez !
  }

  function fmt(sec) {
    var m = Math.floor(sec / 60);
    return (m ? m + ' min ' : '') + (sec % 60) + ' s';
  }

  function tailleDef(txt) {
    if (txt.length <= 14) return ' t1';
    if (txt.length <= 26) return ' t2';
    return ' t3';
  }

  var mod = {
    id: 'fleches',
    nom: 'Mots fléchés',
    icone: '➡️',
    desc: 'De vrais mots fléchés : les définitions sont dans les cases, on écrit directement dans la grille. 200 grilles, 5 forces, progression enregistrée.',
    min: 1, max: 4,
    hotseat: true, hotseatMax: 1, hidden: false, netOnly: false,
    regles: '<p><strong>🎯 Le but :</strong> remplir toute la grille. 200 grilles pleines vous attendent, de la force 1 (découverte) à la force 5 (expert), avec votre progression enregistrée.</p>' +
      '<p><strong>Comment jouer :</strong> comme dans les vrais fléchés, chaque définition est écrite <strong>dans sa case</strong> et sa flèche pointe vers son mot (les flèches coudées ↳ ↴ tournent au coin, comme dans les magazines). Touchez une définition ou une case, puis tapez votre réponse au clavier : les lettres s’écrivent dans la grille. Quand le mot est complet et juste, il se verrouille et rapporte sa longueur en points ; sinon il tremble — corrigez-le !</p>' +
      '<p><strong>En réseau :</strong> tous sur la même grille, le premier à compléter un mot le gagne. En solo : chrono et record par force !</p>',

    create: function (names) {
      return {
        players: names.map(function (n) {
          return { name: n, found: 0, points: 0, errors: 0 };
        }),
        phase: 'setup',
        force: 0,
        gnum: -1,
        w: 0,
        h: 0,
        words: [],
        startTs: 0,
        durationSec: 0,
        finished: false
      };
    },

    turnOf: function () { return -1; },
    over: function (state) { return state.finished; },
    scoreOf: function (state, i) { return state.players[i].points; },

    summary: function (state) {
      var rows = state.players.map(function (p) {
        return { n: p.name, s: p.points, e: p.errors };
      }).sort(function (a, b) { return b.s - a.s; });
      var html = rows.map(function (r) {
        return '<div class="final-line"><span>' + GG.esc(r.n) +
          (r.e ? ' <small>(' + r.e + ' erreur' + (r.e > 1 ? 's' : '') + ')</small>' : '') +
          '</span><strong>' + r.s + ' pts</strong></div>';
      }).join('');
      html += '<p>Grille n°' + (state.gnum + 1) + ' · force ' + state.force +
        ' · ⏱️ ' + fmt(state.durationSec) + '</p>';
      markDone(state.force, state.gnum);
      try {
        if (typeof localStorage !== 'undefined') {
          html += '<p>📈 Progression force ' + state.force + ' : ' + doneCount(state.force) +
            ' / ' + PAR_FORCE + ' grilles.</p>';
          if (state.players.length === 1) {
            var key = 'gg-fleches-best-f' + state.force;
            var best = JSON.parse(localStorage.getItem(key) || 'null');
            var cur = { sec: state.durationSec, ts: state.startTs };
            if (!best || cur.sec < best.sec) localStorage.setItem(key, JSON.stringify(cur));
            var stored = JSON.parse(localStorage.getItem(key) || 'null');
            if (stored && stored.ts === state.startTs) html += '<h1>🏆 Nouveau record !</h1>';
            else if (stored) html += '<p>🏅 Record force ' + state.force + ' : ' + fmt(stored.sec) + '.</p>';
          }
        }
      } catch (e) {}
      if (state.players.length > 1) {
        var top = rows.filter(function (r) { return r.s === rows[0].s; });
        html += '<h1>🏆 ' + top.map(function (r) { return GG.esc(r.n); }).join(' & ') + '</h1>';
      }
      return html;
    },

    /* les solutions ne circulent jamais sur le réseau */
    redact: function (state) {
      var copy = GG.clone(state);
      copy.words.forEach(function (w) {
        if (w.foundBy === -1) delete w.w;
      });
      return copy;
    },

    apply: function (state, player, action) {
      if (state.finished) return { ok: false, error: 'Partie terminée.' };
      if (action.t === 'force') {
        if (state.phase !== 'setup') return { ok: false, error: 'Grille déjà choisie.' };
        if (player !== 0) return { ok: false, error: 'L’hôte choisit la grille.' };
        var f = action.f | 0;
        if (f < 1 || f > 5) return { ok: false, error: 'Force inconnue.' };
        var g = action.g === undefined ? nextGrid(f) : (action.g | 0);
        if (g < 0 || g >= PAR_FORCE) return { ok: false, error: 'Numéro de grille invalide.' };
        var grid = loadGrid(f, g);
        if (!grid) return { ok: false, error: 'Grille introuvable.' };
        state.force = f;
        state.gnum = g;
        state.w = grid.w;
        state.h = grid.h;
        state.words = grid.words;
        state.phase = 'play';
        state.startTs = Date.now();
        return { ok: true };
      }
      if (state.phase !== 'play') return { ok: false, error: 'La partie n’a pas commencé.' };
      if (action.t === 'claim') {
        var w = state.words[action.i | 0];
        if (!w) return { ok: false, error: 'Mot inconnu.' };
        if (w.foundBy !== -1) return { ok: false, error: 'Déjà trouvé !' };
        var guess = norm(action.text);
        if (!guess) return { ok: false, error: 'Écrivez une réponse.' };
        if (guess.length !== w.w.length) {
          return { ok: false, error: 'Il faut ' + w.w.length + ' lettres.' };
        }
        if (guess === w.w) {
          w.foundBy = player;
          state.players[player].found++;
          state.players[player].points += w.w.length;
          if (state.words.every(function (x) { return x.foundBy !== -1; })) {
            state.finished = true;
            state.durationSec = Math.max(1, Math.round((Date.now() - state.startTs) / 1000));
          }
        } else {
          state.players[player].errors++;
          w.lastWrong = guess;
        }
        return { ok: true };
      }
      return { ok: false, error: 'Action inconnue.' };
    },

    render: function (el, ctx) {
      var s = ctx.state;
      if (s.finished) { el.innerHTML = ''; return; }
      var me = ctx.me;

      if (s.phase === 'setup') {
        var html0 = '<p class="mini-msg big-msg">➡️ Mots fléchés</p>' +
          '<p class="mini-msg">De vraies grilles pleines : les définitions sont dans les cases !</p>';
        if (me === 0) {
          html0 += '<div class="lvl-btns">' + FORCES.map(function (fc) {
            var fini = doneCount(fc.f);
            return '<button class="btn big" data-f="' + fc.f + '">' +
              fc.nom + ' <small>' + fc.desc + ' · ' + '⭐'.repeat(fc.f) + ' · ' +
              fini + '/' + PAR_FORCE + ' grilles finies</small></button>';
          }).join('') + '</div>';
        } else {
          html0 += '<p class="waiting">⏳ L’hôte choisit la force…</p>';
        }
        el.innerHTML = html0;
        el.querySelectorAll('[data-f]').forEach(function (b) {
          b.addEventListener('click', function () {
            ctx.act({ t: 'force', f: parseInt(b.dataset.f, 10) });
          });
        });
        return;
      }

      var W = s.w, H = s.h, NC = W * H;
      var letter = new Array(NC).fill('');
      var owner = new Array(NC).fill(-1);
      var isLetter = new Array(NC).fill(false);
      var wordAt = {};  // case → mots qui la traversent
      var defsAt = {};  // case-définition → mots qui en partent
      s.words.forEach(function (w, wi) {
        w.cells.forEach(function (idx, k) {
          isLetter[idx] = true;
          (wordAt[idx] = wordAt[idx] || []).push(wi);
          if (w.foundBy !== -1) {
            letter[idx] = w.w[k];
            if (owner[idx] === -1) owner[idx] = w.foundBy;
          }
        });
        (defsAt[w.defCell] = defsAt[w.defCell] || []).push(wi);
      });

      if (el._flGame !== s.startTs) {
        el._flGame = s.startTs;
        el._flSel = -1; el._flPos = 0; el._flTyped = {};
      }
      var typed = el._flTyped;
      // les lettres validées remplacent les brouillons
      Object.keys(typed).forEach(function (c) { if (letter[c]) delete typed[c]; });

      var sel = el._flSel !== undefined ? el._flSel : -1;
      if (sel !== -1 && (!s.words[sel] || s.words[sel].foundBy !== -1)) { sel = -1; }
      if (sel === -1) { // on propose d'office le premier mot restant
        for (var w0 = 0; w0 < s.words.length; w0++) {
          if (s.words[w0].foundBy === -1) { sel = w0; break; }
        }
        el._flSel = sel; el._flPos = 0;
      }
      var selWord = sel !== -1 ? s.words[sel] : null;
      var selCells = {};
      if (selWord) selWord.cells.forEach(function (i, k) { selCells[i] = true; });
      var pos = el._flPos || 0;
      if (selWord && pos >= selWord.cells.length) { pos = 0; el._flPos = 0; }
      var curCell = selWord ? selWord.cells[pos] : -1;

      // le mot vient-il d'être refusé ? (petit tremblement, on garde les lettres)
      var errSum = s.players.reduce(function (t, p) { return t + p.errors; }, 0);
      var secoue = selWord && selWord.lastWrong && el._flShake !== s.startTs + ':' + errSum;
      if (secoue) el._flShake = s.startTs + ':' + errSum;

      var html = '<p class="qz-head">➡️ Grille n°' + (s.gnum + 1) + ' · force ' + s.force +
        ' <span id="fl-timer">⏱️ ' + fmt(Math.max(0, Math.round((Date.now() - s.startTs) / 1000))) + '</span></p>';
      html += '<div class="fx-grid" style="grid-template-columns:repeat(' + W + ',1fr)">';
      for (var i = 0; i < NC; i++) {
        if (isLetter[i]) {
          var t2 = letter[i] || typed[i] || '';
          var cls = 'fx-cell' + (selCells[i] ? ' selw' : '') + (i === curCell ? ' cur' : '') +
            (letter[i] ? ' won' : (typed[i] ? ' brouillon' : '')) +
            (secoue && selCells[i] ? ' fx-shake' : '');
          var st = owner[i] !== -1 ? ' style="background:' + COLORS[owner[i] % COLORS.length] + '"' : '';
          html += '<div class="' + cls + '" data-i="' + i + '"' + st + '>' + t2 + '</div>';
        } else if (defsAt[i]) {
          html += '<div class="fx-def" data-d="' + i + '">' +
            defsAt[i].map(function (wi) {
              var w2 = s.words[wi];
              var fini = w2.foundBy !== -1;
              return '<div class="fx-half' + (fini ? ' fini' : '') +
                (wi === sel ? ' selh' : '') + '">' +
                '<span class="fx-dt' + tailleDef(w2.def) + '">' + GG.esc(w2.def) + '</span>' +
                '<span class="fx-ar ' + w2.fleche + '">' +
                (w2.fleche === 'hd' ? '▸' : w2.fleche === 'vd' ? '▾' :
                  w2.fleche === 'hc' ? '↳' : '↴') + '</span></div>';
            }).join('') + '</div>';
        } else {
          html += '<div class="fx-orn">✦</div>'; // case ornée, comme en magazine
        }
      }
      html += '</div>';

      // la définition du mot choisi, en grand au-dessus du clavier
      if (selWord) {
        html += '<div class="fx-defbar">' +
          (selWord.dir === 'h' ? '➡️' : '⬇️') + ' <strong>' + GG.esc(selWord.def) +
          '</strong> <em>(' + selWord.cells.length + ' lettres)</em></div>';
      } else {
        html += '<div class="fx-defbar">🎉 Tous les mots sont trouvés !</div>';
      }
      // clavier à l'écran
      html += '<div class="fx-kb">' + KB.map(function (row) {
        return '<div class="fx-krow">' + row.split('').map(function (k) {
          return '<button class="fx-key' + (k === '⌫' ? ' large' : '') +
            '" data-k="' + k + '">' + k + '</button>';
        }).join('') + '</div>';
      }).join('') + '</div>';

      html += '<div class="mem-stats">' + s.players.map(function (p, pi) {
        return '<span class="mem-stat" style="outline:2px solid ' + COLORS[pi % COLORS.length] + '">' +
          GG.esc(p.name) + ' : ' + p.points + (p.errors ? ' · ❌' + p.errors : '') + '</span>';
      }).join('') + '</div>';
      el.innerHTML = html;

      function rerender() { mod.render(el, ctx); }

      function selectWord(wi, cellIdx) {
        el._flSel = wi;
        var k = cellIdx !== undefined ? s.words[wi].cells.indexOf(cellIdx) : 0;
        el._flPos = k === -1 ? 0 : k;
        rerender();
      }

      el.querySelectorAll('.fx-cell').forEach(function (c) {
        c.addEventListener('click', function () {
          var idx = parseInt(c.dataset.i, 10);
          var here = (wordAt[idx] || []).filter(function (wi) {
            return s.words[wi].foundBy === -1;
          });
          if (!here.length) return;
          var nxt = here.indexOf(sel) !== -1 && here.length > 1
            ? here[(here.indexOf(sel) + 1) % here.length]
            : (here.indexOf(sel) !== -1 ? sel : here[0]);
          selectWord(nxt, idx);
        });
      });
      el.querySelectorAll('.fx-def').forEach(function (d) {
        d.addEventListener('click', function () {
          var here = (defsAt[parseInt(d.dataset.d, 10)] || []).filter(function (wi) {
            return s.words[wi].foundBy === -1;
          });
          if (!here.length) return;
          var posIn = here.indexOf(sel);
          selectWord(here[(posIn + 1) % here.length]);
        });
      });

      function avance(depuis) {
        // prochaine case du mot encore libre (non validée)
        var cs = selWord.cells;
        for (var k = depuis + 1; k < cs.length; k++) {
          if (!letter[cs[k]]) return k;
        }
        return cs.length;
      }
      function taper(chr) {
        if (!selWord) return;
        var cs = selWord.cells;
        var p2 = el._flPos || 0;
        // se cale sur une case libre
        while (p2 < cs.length && letter[cs[p2]]) p2++;
        if (p2 >= cs.length) p2 = 0;
        if (!letter[cs[p2]]) typed[cs[p2]] = chr;
        var suivant = avance(p2);
        el._flPos = suivant >= cs.length ? p2 : suivant;
        // mot complet → on tente la validation
        var texte = '';
        for (var k = 0; k < cs.length; k++) texte += letter[cs[k]] || typed[cs[k]] || '';
        if (texte.length === cs.length) {
          ctx.act({ t: 'claim', i: sel, text: texte });
          return; // l'état revient, le rendu suivra
        }
        rerender();
      }
      function efface() {
        if (!selWord) return;
        var cs = selWord.cells;
        var p2 = el._flPos || 0;
        if (typed[cs[p2]]) delete typed[cs[p2]];
        else {
          for (var k = p2 - 1; k >= 0; k--) {
            if (!letter[cs[k]]) { delete typed[cs[k]]; el._flPos = k; break; }
          }
        }
        rerender();
      }
      el._flType = taper;
      el._flBack = efface;
      el.querySelectorAll('.fx-key').forEach(function (b) {
        b.addEventListener('click', function () {
          var k = b.dataset.k;
          if (k === '⌫') efface(); else taper(k);
        });
      });
      // clavier physique (ordinateur) : un seul écouteur, gardé par l'état
      if (!el._flKeysBound) {
        el._flKeysBound = true;
        document.addEventListener('keydown', function (ev) {
          if (!document.body.contains(el) || !el.querySelector('.fx-grid')) return;
          if (!el._flType) return;
          if (ev.key === 'Backspace') { ev.preventDefault(); el._flBack(); }
          else {
            var chr = norm(ev.key);
            if (chr.length === 1) el._flType(chr);
          }
        });
      }
      if (!s.finished && s.startTs && !el._flTimer) {
        el._flTimer = setInterval(function () {
          var t = el.querySelector('#fl-timer');
          if (!t || !document.body.contains(t)) {
            clearInterval(el._flTimer); el._flTimer = null; return;
          }
          t.textContent = '⏱️ ' + fmt(Math.max(0, Math.round((Date.now() - s.startTs) / 1000)));
        }, 1000);
      }
    },

    _loadGrid: loadGrid, _norm: norm, _PAR_FORCE: PAR_FORCE
  };

  GG.register(mod);
  if (typeof module === 'object' && module.exports) module.exports = mod;
})(typeof self !== 'undefined' ? self : globalThis);
