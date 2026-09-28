/*
 * GGgames V2 — les sens : GG.sfx (sons), GG.haptic (vibrations) et
 * GG.reglages (réglages persistants partagés par toute l'appli).
 *
 * Aucun fichier audio : tout est SYNTHÉTISÉ en direct avec la Web Audio API
 * (oscillateurs, bruits blanc / rose / brun en tampons, filtres, enveloppes,
 * synthèse FM pour les cloches, synthèse modale pour les chocs, petite
 * réverbération par convolution générée). Rien à télécharger : parfait en
 * mode avion. Les tampons (bruits, réverbération, dés, jetons…) sont
 * fabriqués une seule fois puis réutilisés.
 *
 * Sortie : voix → compresseur doux → volume → haut-parleur, 12 voix au plus
 * (les plus anciennes s'effacent). Le contexte audio n'est créé qu'au premier
 * geste de l'utilisateur (exigence des navigateurs mobiles), s'endort après
 * 30 s de silence ou quand l'appli passe en arrière-plan (économie de
 * batterie) et se réveille tout seul au son suivant.
 *
 * API :
 *   GG.reglages.get(cle) / set(cle, valeur) / tout()
 *       {son: true, vibrations: true, animations: 'normales', volume: 0.8}
 *       set() enregistre (localStorage « gg-reglages ») et émet l'évènement
 *       document « gg-reglages » {detail: {cle, valeur}}.
 *   GG.sfx.play(nom, opts)   opts {volume, pitch, level} → true si le son part
 *   GG.sfx.unlock()          débloque l'audio (fait tout seul au 1er geste)
 *   GG.sfx.on() / setOn(bool) / volume(v)
 *   GG.sfx.noms              liste des sons
 *   GG.sfx.prepare(noms)     pré-calcule les sons lourds (dés, jetons…)
 *   GG.sfx.etat()            'absent' | 'suspended' | 'running' | 'closed'
 *   GG.sfx.rendre(nom, opts) rendu hors ligne → Promise<AudioBuffer> (tests)
 *   GG.haptic(type)          'light' | 'medium' | 'heavy' | 'select' | 'success'
 *                            | 'warning' | 'error' | [motif] → true si vibré
 *
 * Ni play() ni haptic() ne lèvent jamais d'exception ; hors navigateur
 * (Node) tout est un no-op silencieux.
 */
(function (root) {
  'use strict';

  var GG = root.GG || (root.GG = {});

  function rien() {}
  function navigateur() { return typeof window !== 'undefined' && typeof document !== 'undefined'; }
  function aCle(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function borne(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function nombre(v, d) {
    if (v === null || v === undefined || v === '') return d;
    v = +v;
    return isFinite(v) ? v : d;
  }
  function alea(a, b) { return a + Math.random() * (b - a); }
  function maintenant() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }
  var TOUR = Math.PI * 2;

  /* ================================================================
   * 1. Réglages persistants
   * ================================================================ */

  var CLE = 'gg-reglages';
  var DEFAUTS = { son: true, vibrations: true, animations: 'normales', volume: 0.8 };
  var memoire = null; // copie de travail (la source de vérité pendant la session)

  function stockage() {
    try { return root.localStorage || null; } catch (e) { return null; } // about:blank, mode privé strict…
  }

  function normaliser(cle, v) {
    switch (cle) {
      case 'son':
      case 'vibrations':
        return !(v === false || v === 0 || v === 'false' || v === '0' || v === 'non' || v === 'off' || v == null);
      case 'animations':
        return v === 'reduites' || v === 'r\u00e9duites' ? 'reduites' : 'normales';
      case 'volume':
        v = +v;
        return isFinite(v) ? borne(v, 0, 1) : DEFAUTS.volume;
    }
    return v;
  }

  function charger() {
    if (memoire) return memoire;
    memoire = {};
    var ls = stockage();
    if (ls) {
      try {
        var brut = ls.getItem(CLE), o = brut ? JSON.parse(brut) : null;
        if (o && typeof o === 'object' && !Array.isArray(o)) {
          for (var k in o) if (aCle(o, k)) memoire[k] = normaliser(k, o[k]);
        }
      } catch (e) {}
    }
    return memoire;
  }

  var reglages = {
    /* valeur d'un réglage (défaut si jamais réglé) */
    get: function (cle) {
      var m = charger();
      if (aCle(m, cle)) return m[cle];
      return aCle(DEFAUTS, cle) ? DEFAUTS[cle] : undefined;
    },
    /* enregistre, applique, et prévient toute l'appli ; renvoie la valeur retenue */
    set: function (cle, valeur) {
      cle = String(cle);
      valeur = normaliser(cle, valeur);
      var m = charger();
      m[cle] = valeur;
      var ls = stockage();
      if (ls) { try { ls.setItem(CLE, JSON.stringify(m)); } catch (e) {} }
      try { appliquer(cle); } catch (e) {}
      try {
        if (navigateur() && typeof root.CustomEvent === 'function') {
          document.dispatchEvent(new root.CustomEvent('gg-reglages', { detail: { cle: cle, valeur: valeur } }));
        }
      } catch (e) {}
      return valeur;
    },
    /* copie de tous les réglages (défauts compris) */
    tout: function () {
      var m = charger(), o = {}, k;
      for (k in DEFAUTS) o[k] = DEFAUTS[k];
      for (k in m) if (aCle(m, k)) o[k] = m[k];
      return o;
    }
  };

  /* ================================================================
   * 2. Vibrations
   * ================================================================ */

  var MOTIFS = {
    light: 10, medium: 20, heavy: 35, select: 6,
    success: [12, 40, 18], warning: [20, 60, 20], error: [35, 50, 35, 50, 35]
  };

  function haptic(type) {
    try {
      if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return false;
      if (!reglages.get('vibrations')) return false;
      var motif;
      if (type && typeof type === 'object' && typeof type.length === 'number') {
        motif = [];
        for (var i = 0; i < type.length && i < 24; i++) motif.push(Math.round(borne(nombre(type[i], 0), 0, 1000)));
      } else if (typeof type === 'number') {
        motif = Math.round(borne(type, 0, 1000));
      } else {
        motif = MOTIFS[type == null ? 'light' : type];
      }
      if (motif === undefined) return false;
      // sans geste préalable, le navigateur refuse (et le signale en console) : inutile d'insister
      var ua = navigator.userActivation;
      if (ua && !ua.hasBeenActive) return false;
      return !!navigator.vibrate(motif);
    } catch (e) {
      return false;
    }
  }

  /* ================================================================
   * 3. Moteur audio
   * ================================================================ */

  var AC = null;            // le contexte audio (créé au premier geste)
  var sortie = null;        // chaîne de sortie du contexte
  var voix = [];
  var MAX_VOIX = 12;
  var VEILLE_MS = 30000;
  var demarrage = -1e9;     // instant du dernier déverrouillage
  var veilleAuto = false;   // contexte endormi par nous (inactivité, arrière-plan)
  var minuteurVeille = 0;
  var tampons = {};         // tampons générés, par fréquence d'échantillonnage
  var aPreparer = [];

  function classeAudio() { return root.AudioContext || root.webkitAudioContext || null; }
  function gainVolume() { var v = reglages.get('volume'); return v * v; } // courbe perceptive
  function activation() {
    try {
      var ua = navigator.userActivation;
      return !ua || ua.hasBeenActive;
    } catch (e) { return true; }
  }
  function nyquist(ctx, f) { return Math.min(f, ctx.sampleRate * 0.45); }

  /* ---- tampons de base ---- */

  function bruitTampon(ctx, type) {
    var sr = ctx.sampleRate, cle = 'bruit-' + type + sr;
    if (tampons[cle]) return tampons[cle];
    var n = Math.floor(sr * 1.5), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0), i, w;
    if (type === 'rose') {
      // bruit rose (méthode de Paul Kellet) : plus doux que le blanc
      var b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (i = 0; i < n; i++) {
        w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
    } else if (type === 'brun') {
      var l = 0;
      for (i = 0; i < n; i++) {
        w = Math.random() * 2 - 1;
        l = (l + 0.02 * w) / 1.02;
        d[i] = l * 3.5;
      }
    } else {
      for (i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    tampons[cle] = b;
    return b;
  }

  /* Réponse impulsionnelle d'une petite salle chaleureuse (1,3 s). */
  function impulsion(ctx) {
    var sr = ctx.sampleRate, cle = 'ir' + sr;
    if (tampons[cle]) return tampons[cle];
    var n = Math.floor(sr * 1.3), b = ctx.createBuffer(2, n, sr);
    var pre = Math.floor(0.011 * sr), dec = Math.exp(-1 / (0.3 * sr));
    var REFLETS = [0.017, 0.023, 0.031, 0.037, 0.047, 0.059];
    for (var ch = 0; ch < 2; ch++) {
      var d = b.getChannelData(ch), lp = 0, e = 1;
      for (var i = pre; i < n; i++) {
        // la queue s'assombrit en s'éteignant (filtre qui se referme)
        var k = 0.6 - 0.5 * (i / n);
        lp += k * ((Math.random() * 2 - 1) - lp);
        d[i] = lp * e * (1 - i / n);
        e *= dec;
      }
      for (var r = 0; r < REFLETS.length; r++) {
        var j = Math.floor((REFLETS[r] + (ch ? 0.0023 : 0)) * sr);
        if (j < n) d[j] += (r % 2 ? -1 : 1) * 0.5 * Math.pow(0.8, r);
      }
    }
    tampons[cle] = b;
    return b;
  }

  /* ---- chaîne de sortie (identique en direct et hors ligne) ---- */
  function chaine(ctx, volume, differer) {
    var maitre = ctx.createGain();
    maitre.gain.value = volume;
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 10;
    comp.ratio.value = 6;
    comp.attack.value = 0.002;
    comp.release.value = 0.16;
    var sec = ctx.createGain();
    var envoi = ctx.createGain();
    var ph = ctx.createBiquadFilter();
    ph.type = 'highpass';
    ph.frequency.value = 260;
    ph.Q.value = 0.5;
    var conv = ctx.createConvolver();
    var retour = ctx.createGain();
    retour.gain.value = 0.5;
    sec.connect(comp);
    envoi.connect(ph);
    ph.connect(conv);
    conv.connect(retour);
    retour.connect(comp);
    comp.connect(maitre);
    maitre.connect(ctx.destination);
    // la réverbération se calcule hors du geste (pas d'à-coup au premier toucher)
    if (differer) setTimeout(function () { try { conv.buffer = impulsion(ctx); } catch (e) {} }, 0);
    else conv.buffer = impulsion(ctx);
    return { ctx: ctx, sec: sec, envoi: envoi, maitre: maitre };
  }

  /* ---- une voix = un son en cours ---- */
  function nouvelleVoix(ch, opts, t0) {
    var ctx = ch.ctx, out = ctx.createGain(), rev = ctx.createGain();
    out.gain.value = borne(nombre(opts.volume, 1), 0, 2);
    rev.gain.value = 0;
    out.connect(ch.sec);
    out.connect(rev);
    rev.connect(ch.envoi);
    return { ctx: ctx, out: out, rev: rev, t: t0, p: borne(nombre(opts.pitch, 1), 0.25, 4), fin: t0, sources: [], minuteur: 0 };
  }

  function reverb(v, x) { v.rev.gain.value = x; }
  function varier(v, x) { v.p *= 1 + (Math.random() - 0.5) * x; }
  function hz(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  function brancher(v, noeud, pan) {
    if (pan && v.ctx.createStereoPanner) {
      var p = v.ctx.createStereoPanner();
      p.pan.value = borne(pan, -1, 1);
      noeud.connect(p);
      p.connect(v.out);
    } else {
      noeud.connect(v.out);
    }
  }

  function inscrire(v, src, fin) {
    v.sources.push(src);
    if (fin > v.fin) v.fin = fin;
  }

  /* Enveloppe : attaque linéaire (sans clic) puis
     - percussive (o.s absent) : décroissance exponentielle sur toute la durée ;
     - ADSR (o.s = maintien) : déclin o.d, maintien, relâchement o.r. */
  function enveloppe(param, t, o, crete, dur) {
    var a = o.a == null ? 0.004 : o.a;
    param.setValueAtTime(0, t);
    param.linearRampToValueAtTime(crete, t + a);
    if (o.s == null) {
      param.setTargetAtTime(0, t + a, Math.max(0.003, (dur - a) / 5));
    } else {
      var d = o.d == null ? 0.08 : o.d, r = o.r == null ? 0.08 : o.r;
      param.setTargetAtTime(crete * o.s, t + a, Math.max(0.003, d / 3));
      param.setTargetAtTime(0, Math.max(t + a, t + dur - r), Math.max(0.003, r / 4));
    }
  }
  function queue(o) { return o.s == null ? 0.02 : (o.r == null ? 0.08 : o.r) * 0.6 + 0.02; }

  function filtre(v, t, F, dur) {
    var ctx = v.ctx, bq = ctx.createBiquadFilter();
    bq.type = F.type || 'bandpass';
    var k = F.fixe ? 1 : v.p;
    bq.frequency.setValueAtTime(nyquist(ctx, F.f * k), t);
    if (F.f2) bq.frequency.exponentialRampToValueAtTime(nyquist(ctx, Math.max(20, F.f2 * k)), t + (F.glide || dur));
    bq.Q.value = F.q == null ? 1 : F.q;
    return bq;
  }

  /* note : un oscillateur enveloppé.
     o {f, f2, glide, type, t, dur, g, a, s, d, r, detune, vib:[Hz, cents], lp, lp2, q, pan} */
  function note(v, o) {
    var ctx = v.ctx, t = v.t + (o.t || 0), dur = o.dur || 0.2;
    var fin = t + dur + queue(o);
    var osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(nyquist(ctx, o.f * v.p), t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(nyquist(ctx, Math.max(1, o.f2 * v.p)), t + (o.glide || dur));
    if (o.detune) osc.detune.setValueAtTime(o.detune, t);
    if (o.vib) {
      var lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = o.vib[0];
      lg.gain.value = o.vib[1];
      lfo.connect(lg);
      lg.connect(osc.detune);
      lfo.start(t);
      lfo.stop(fin);
      inscrire(v, lfo, fin);
    }
    var g = ctx.createGain(), n = osc;
    enveloppe(g.gain, t, o, o.g == null ? 0.2 : o.g, dur);
    if (o.lp) {
      var bq = filtre(v, t, { type: 'lowpass', f: o.lp, f2: o.lp2, glide: o.lpt, q: o.q == null ? 0.7 : o.q }, dur);
      n.connect(bq);
      n = bq;
    }
    n.connect(g);
    brancher(v, g, o.pan);
    osc.start(t);
    osc.stop(fin);
    inscrire(v, osc, fin);
    return g;
  }

  /* bruit : tampon de bruit filtré et enveloppé.
     o {type: 'blanc'|'rose'|'brun', t, dur, g, a, s, d, r, filtre:{type, f, f2, glide, q}, filtre2, pan, panDe, panA} */
  function bruit(v, o) {
    var ctx = v.ctx, t = v.t + (o.t || 0), dur = o.dur || 0.1, fin = t + dur + queue(o);
    var src = ctx.createBufferSource();
    src.buffer = bruitTampon(ctx, o.type || 'blanc');
    src.loop = true;
    var n = src;
    if (o.filtre) { var f1 = filtre(v, t, o.filtre, dur); n.connect(f1); n = f1; }
    if (o.filtre2) { var f2 = filtre(v, t, o.filtre2, dur); n.connect(f2); n = f2; }
    var g = ctx.createGain();
    enveloppe(g.gain, t, o, o.g == null ? 0.2 : o.g, dur);
    n.connect(g);
    if (o.panDe != null && ctx.createStereoPanner) {
      var p = ctx.createStereoPanner();
      p.pan.setValueAtTime(o.panDe, t);
      p.pan.linearRampToValueAtTime(o.panA, t + dur);
      g.connect(p);
      p.connect(v.out);
    } else {
      brancher(v, g, o.pan);
    }
    src.start(t, Math.random() * (src.buffer.duration - 0.3));
    src.stop(fin);
    inscrire(v, src, fin);
  }

  /* cloche : synthèse FM (porteuse + modulante dont l'indice s'éteint). */
  function cloche(v, o) {
    var ctx = v.ctx, t = v.t + (o.t || 0), dur = o.dur || 0.8, f = o.f * v.p, fin = t + dur + 0.03;
    var car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
    car.frequency.setValueAtTime(nyquist(ctx, f), t);
    mod.frequency.setValueAtTime(nyquist(ctx, f * (o.ratio || 3.5)), t);
    var idx = (o.index == null ? 2 : o.index) * f;
    mg.gain.setValueAtTime(idx, t);
    mg.gain.setTargetAtTime(idx * 0.06, t, dur / 6); // le timbre s'adoucit en résonnant
    mod.connect(mg);
    mg.connect(car.frequency);
    enveloppe(g.gain, t, { a: o.a == null ? 0.002 : o.a }, o.g == null ? 0.15 : o.g, dur);
    car.connect(g);
    brancher(v, g, o.pan);
    car.start(t);
    mod.start(t);
    car.stop(fin);
    mod.stop(fin);
    inscrire(v, car, fin);
    inscrire(v, mod, fin);
  }

  /* maillet : son rond façon marimba (fondamentale + partiel ×4 bref). */
  function maillet(v, o) {
    var g = o.g == null ? 0.16 : o.g, dur = o.dur || 0.35;
    note(v, { t: o.t, f: o.f, dur: dur, g: g, a: 0.002, pan: o.pan });
    note(v, { t: o.t, f: o.f * 4, dur: dur * 0.22, g: g * 0.22, a: 0.001, pan: o.pan });
    if (o.clic !== false) note(v, { t: o.t, f: o.f * 9.2, dur: 0.02, g: g * 0.06, a: 0.0005, pan: o.pan });
  }

  /* cuivre : deux dents de scie désaccordées dans un passe-bas qui s'ouvre (cuivre doux). */
  function cuivre(v, o) {
    var ctx = v.ctx, t = v.t + (o.t || 0), dur = o.dur || 0.5, f = o.f * v.p, r = o.r || 0.12;
    var fin = t + dur + r * 0.6 + 0.03;
    var bq = ctx.createBiquadFilter(), g = ctx.createGain();
    bq.type = 'lowpass';
    bq.Q.value = 0.9;
    bq.frequency.setValueAtTime(nyquist(ctx, f * 1.2), t);
    bq.frequency.linearRampToValueAtTime(nyquist(ctx, Math.min(f * (o.brillance || 5), 8000)), t + 0.05);
    bq.frequency.setTargetAtTime(nyquist(ctx, Math.min(f * 3, 6000)), t + 0.06, 0.15);
    var lg = null;
    if (o.vib) {
      var lfo = ctx.createOscillator();
      lg = ctx.createGain();
      lfo.frequency.value = o.vib[0];
      lg.gain.value = 0;
      lg.gain.setValueAtTime(0, t);
      lg.gain.linearRampToValueAtTime(o.vib[1], t + Math.min(0.4, dur * 0.6)); // vibrato qui s'installe
      lfo.connect(lg);
      lfo.start(t);
      lfo.stop(fin);
      inscrire(v, lfo, fin);
    }
    for (var i = 0; i < 2; i++) {
      var s = ctx.createOscillator();
      s.type = 'sawtooth';
      s.frequency.setValueAtTime(nyquist(ctx, f), t);
      s.detune.setValueAtTime(i ? 7 : -7, t);
      if (lg) lg.connect(s.detune);
      s.connect(bq);
      s.start(t);
      s.stop(fin);
      inscrire(v, s, fin);
    }
    enveloppe(g.gain, t, { a: o.a || 0.025, d: 0.15, s: 0.72, r: r }, o.g || 0.06, dur);
    bq.connect(g);
    brancher(v, g, o.pan);
  }

  /* tampon pré-calculé (dés, jetons, mélange…) */
  function jouerTampon(v, buf, o) {
    if (!buf) return;
    var ctx = v.ctx, t = v.t + (o.t || 0), k = v.p * (o.rate || 1);
    var src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = buf;
    src.playbackRate.value = k;
    g.gain.value = o.g == null ? 0.8 : o.g;
    src.connect(g);
    brancher(v, g, o.pan);
    var fin = t + buf.duration / k + 0.02;
    src.start(t);
    src.stop(fin);
    inscrire(v, src, fin);
  }

  /* ---- synthèse hors temps réel des sons complexes (tampons) ---- */

  function tamponVide(ctx, sr, duree) { return ctx.createBuffer(1, Math.max(1, Math.ceil(duree * sr)), sr); }

  /* résonance amortie (un « mode » de l'objet qui vibre), par récurrence */
  function mode(d, sr, t0, f, tau, amp, phase) {
    var i0 = Math.floor(t0 * sr), n = Math.min(d.length - i0, Math.ceil(tau * 6.5 * sr));
    if (n <= 1 || i0 < 0 || f >= sr * 0.45) return;
    var w = TOUR * f / sr, r = Math.exp(-1 / (tau * sr)), c = 2 * r * Math.cos(w), r2 = r * r;
    var ph = phase == null ? Math.random() * TOUR : phase;
    var y0 = amp * Math.sin(ph), y1 = amp * r * Math.sin(w + ph);
    d[i0] += y0;
    d[i0 + 1] += y1;
    for (var k = 2; k < n; k++) {
      var y = c * y1 - r2 * y0;
      d[i0 + k] += y;
      y0 = y1;
      y1 = y;
    }
  }

  /* souffle : bruit à décroissance exponentielle ('aigu' : dérivé, plus brillant) */
  function souffle(d, sr, t0, amp, tau, aigu) {
    var i0 = Math.floor(t0 * sr), n = Math.min(d.length - i0, Math.ceil(tau * 6 * sr));
    var e = 1, k = Math.exp(-1 / (tau * sr)), prec = 0;
    for (var i = 0; i < n; i++) {
      var w = Math.random() * 2 - 1;
      if (aigu) { var x = w - prec; prec = w; w = x * 0.5; }
      d[i0 + i] += w * amp * e;
      e *= k;
    }
  }

  /* goutte / bulle : sinus dont la hauteur monte vite */
  function goutte(d, sr, t0, f0, amp) {
    var i0 = Math.floor(t0 * sr), n = Math.min(d.length - i0, Math.ceil(0.16 * sr)), ph = 0;
    for (var k = 0; k < n; k++) {
      var t = k / sr, f = f0 * (1 + 1.2 * Math.min(1, t / 0.045));
      ph += TOUR * f / sr;
      d[i0 + k] += amp * Math.sin(ph) * Math.exp(-t / 0.028) * (t < 0.002 ? t / 0.002 : 1);
    }
  }

  function passeBas(d, sr, fc) {
    var a = 1 - Math.exp(-TOUR * fc / sr), y = 0;
    for (var i = 0; i < d.length; i++) { y += a * (d[i] - y); d[i] = y; }
  }
  function passeHaut(d, sr, fc) {
    var a = Math.exp(-TOUR * fc / sr), px = 0, py = 0;
    for (var i = 0; i < d.length; i++) { var x = d[i]; py = a * (py + x - px); px = x; d[i] = py; }
  }
  function finir(d, sr, cible) {
    var m = 0, i;
    for (i = 0; i < d.length; i++) { var x = d[i] < 0 ? -d[i] : d[i]; if (x > m) m = x; }
    var k = m > 0 ? cible / m : 0, n = Math.min(d.length, Math.floor(0.012 * sr));
    for (i = 0; i < d.length; i++) d[i] *= k;
    for (i = 0; i < n; i++) d[d.length - 1 - i] *= i / n; // fin sans clic
  }

  /* choc de dé en plastique sur la table */
  function chocDe(d, sr, t, amp, fk, fort) {
    var F = [1850, 2950, 4400, 6100], T = [0.02, 0.013, 0.008, 0.005], G = [0.5, 0.35, 0.24, 0.12];
    for (var i = 0; i < 4; i++) mode(d, sr, t, F[i] * fk * alea(0.97, 1.03), T[i], G[i] * amp);
    souffle(d, sr, t, amp * 0.35, 0.002, true);
    if (fort) mode(d, sr, t, 190 * alea(0.9, 1.1), 0.03, amp * 0.45, 0);
  }

  /* clic de jeton de casino (argile / céramique) */
  function chocJeton(d, sr, t, amp, fk) {
    var F = [2250, 3350, 4800, 6900], T = [0.028, 0.02, 0.012, 0.007], G = [0.3, 0.45, 0.3, 0.15];
    for (var i = 0; i < 4; i++) mode(d, sr, t, F[i] * fk, T[i], G[i] * amp);
    souffle(d, sr, t, amp * 0.5, 0.0015, true);
  }

  var GENERATEURS = {
    des: function (ctx, sr) {
      var duree = alea(0.4, 0.7), b = tamponVide(ctx, sr, duree + 0.12), d = b.getChannelData(0);
      for (var de = 0; de < 2; de++) {
        var fk = alea(0.9, 1.1), t = de * alea(0.008, 0.03), amp = de ? 0.8 : 1, pas = alea(0.07, 0.11);
        while (t < duree && amp > 0.03) {
          chocDe(d, sr, t, amp, fk, amp > 0.45);
          // petits cliquetis du dé qui roule entre deux rebonds
          var nb = amp < 0.5 ? (Math.random() * 3) | 0 : 0;
          for (var j = 0; j < nb; j++) {
            chocDe(d, sr, t + pas * (j + 1) / (nb + 1), amp * alea(0.15, 0.3), fk * alea(0.95, 1.05), false);
          }
          t += pas;
          pas *= alea(0.68, 0.85);
          amp *= alea(0.62, 0.78);
          if (pas < 0.018) pas = alea(0.018, 0.03);
        }
      }
      passeHaut(d, sr, 70);
      finir(d, sr, 0.9);
      return b;
    },
    jeton: function (ctx, sr) {
      var b = tamponVide(ctx, sr, 0.16), d = b.getChannelData(0), fk = alea(0.94, 1.06);
      chocJeton(d, sr, 0, 1, fk);
      chocJeton(d, sr, alea(0.01, 0.022), alea(0.45, 0.7), fk * alea(1.02, 1.08));
      passeHaut(d, sr, 300);
      finir(d, sr, 0.9);
      return b;
    },
    jetons: function (ctx, sr) {
      var n = 5 + ((Math.random() * 3) | 0), b = tamponVide(ctx, sr, 0.6), d = b.getChannelData(0), t = 0, amp = 0.9;
      for (var i = 0; i < n; i++) {
        var fk = alea(0.9, 1.12);
        chocJeton(d, sr, t, amp * alea(0.75, 1), fk);
        if (Math.random() < 0.5) chocJeton(d, sr, t + alea(0.006, 0.014), amp * alea(0.3, 0.5), fk * 1.05);
        t += alea(0.035, 0.08) * (1 - i / (n * 1.6)); // la pile se tasse de plus en plus vite
        amp *= alea(0.8, 0.95);
      }
      passeHaut(d, sr, 300);
      finir(d, sr, 0.9);
      return b;
    },
    melange: function (ctx, sr) {
      var b = tamponVide(ctx, sr, 0.8), d = b.getChannelData(0), n = 38 + ((Math.random() * 10) | 0), i;
      for (i = 0; i < n; i++) {
        var k = i / n, t = 0.03 + 0.5 * k + alea(-0.004, 0.004);
        var env = 0.25 + 0.75 * Math.sin(Math.PI * Math.min(1, k * 1.1));
        souffle(d, sr, t, 0.55 * env * alea(0.6, 1), alea(0.0018, 0.0035), false);
        mode(d, sr, t, alea(1900, 3000), 0.005, 0.16 * env);
      }
      // bruissement continu pendant que les cartes s'entremêlent
      var i0 = Math.floor(0.02 * sr), i1 = Math.floor(0.56 * sr);
      for (i = i0; i < i1; i++) d[i] += (Math.random() * 2 - 1) * 0.05 * Math.sin(Math.PI * (i - i0) / (i1 - i0));
      // le paquet se referme
      souffle(d, sr, 0.6, 0.3, 0.03, false);
      mode(d, sr, 0.6, 180, 0.02, 0.15, 0);
      passeHaut(d, sr, 500);
      passeBas(d, sr, 4200);
      passeBas(d, sr, 5200); // deux pôles : un froissement feutré, jamais sifflant
      finir(d, sr, 0.85);
      return b;
    },
    eclabousse: function (ctx, sr) {
      var b = tamponVide(ctx, sr, 0.7), d = b.getChannelData(0), y = 0, i;
      for (i = 0; i < d.length; i++) {
        var t = i / sr, e = t < 0.006 ? t / 0.006 : Math.exp(-(t - 0.006) / 0.16);
        var a = 1 - Math.exp(-TOUR * (900 + 3600 * Math.exp(-t / 0.08)) / sr); // le plouf s'assombrit
        y += a * ((Math.random() * 2 - 1) - y);
        d[i] = y * e * 0.8;
      }
      mode(d, sr, 0, 150, 0.05, 0.5, 0);
      var nb = 6 + ((Math.random() * 5) | 0);
      for (i = 0; i < nb; i++) goutte(d, sr, alea(0.06, 0.5), alea(500, 1300), alea(0.1, 0.28));
      passeHaut(d, sr, 80);
      finir(d, sr, 0.9);
      return b;
    },
    bulles: function (ctx, sr) {
      var b = tamponVide(ctx, sr, 1.3), d = b.getChannelData(0), nb = 12 + ((Math.random() * 6) | 0);
      for (var i = 0; i < nb; i++) {
        var t = alea(0, 1.1);
        goutte(d, sr, t, alea(260, 700), alea(0.12, 0.35) * (1 - t / 1.4));
      }
      finir(d, sr, 0.8);
      return b;
    }
  };
  var VARIANTES = { des: 4, jeton: 3, jetons: 3, melange: 2, eclabousse: 2, bulles: 1 };
  var TAMPONS_DES_SONS = { dice: 'des', chip: 'jeton', chips: 'jetons', shuffle: 'melange', splash: 'eclabousse', sink: 'bulles' };

  /* une variante au hasard (jamais deux fois la même d'affilée) ;
     les variantes se fabriquent une par une, au fil des premiers appels */
  function procedural(ctx, nom) {
    var sr = ctx.sampleRate, cle = nom + sr, liste = tampons[cle] || (tampons[cle] = []);
    var nb = VARIANTES[nom] || 1, i;
    if (liste.length < nb) {
      liste.push(GENERATEURS[nom](ctx, sr));
      i = liste.length - 1;
    } else {
      i = (Math.random() * nb) | 0;
      if (nb > 1 && i === liste.dernier) i = (i + 1) % nb;
    }
    liste.dernier = i;
    return liste[i];
  }

  /* ================================================================
   * 4. Les sons
   * ================================================================ */

  var RECETTES = {
    /* appui d'interface : un « tuk » rond, très discret */
    tap: function (v) {
      varier(v, 0.04);
      note(v, { f: 900, f2: 600, glide: 0.03, dur: 0.055, g: 0.22, a: 0.001 });
      note(v, { f: 2400, dur: 0.012, g: 0.04, a: 0.0005 });
    },
    /* sélection : note de marimba claire */
    select: function (v) {
      reverb(v, 0.06);
      maillet(v, { f: hz(81), dur: 0.18, g: 0.2 });
    },
    /* interrupteur : deux petites notes (montantes ; opts.on === false : descendantes) */
    toggle: function (v, o) {
      reverb(v, 0.04);
      var a = hz(76), b = hz(83);
      if (o.on === false) { var x = a; a = b; b = x; }
      maillet(v, { f: a, dur: 0.09, g: 0.11 });
      maillet(v, { t: 0.055, f: b, dur: 0.14, g: 0.12 });
    },
    /* retour : glissé doux vers le grave */
    back: function (v) {
      reverb(v, 0.05);
      note(v, { f: 740, f2: 470, glide: 0.1, dur: 0.12, g: 0.22, a: 0.003 });
      bruit(v, { type: 'rose', dur: 0.09, g: 0.07, a: 0.01, filtre: { f: 1400, f2: 700, q: 1 } });
    },
    /* ouverture d'une fenêtre : souffle montant + reflet */
    open: function (v) {
      reverb(v, 0.18);
      bruit(v, { type: 'rose', dur: 0.24, g: 0.26, a: 0.07, filtre: { f: 450, f2: 2600, glide: 0.2, q: 1.1 } });
      note(v, { type: 'triangle', f: 440, f2: 880, glide: 0.18, dur: 0.22, g: 0.05, a: 0.03 });
      cloche(v, { t: 0.1, f: hz(88), ratio: 2, index: 0.8, dur: 0.35, g: 0.07 });
    },
    /* fermeture : souffle descendant */
    close: function (v) {
      reverb(v, 0.12);
      bruit(v, { type: 'rose', dur: 0.18, g: 0.45, a: 0.015, filtre: { f: 2400, f2: 500, glide: 0.16, q: 1.1 } });
      note(v, { type: 'triangle', f: 820, f2: 410, glide: 0.14, dur: 0.16, g: 0.15, a: 0.004 });
    },
    /* bulle qui éclate */
    pop: function (v) {
      varier(v, 0.14);
      reverb(v, 0.06);
      note(v, { f: 360, f2: 1150, glide: 0.05, dur: 0.1, g: 0.26, a: 0.002 });
      bruit(v, { dur: 0.01, g: 0.03, a: 0.0005, filtre: { type: 'highpass', f: 3000, q: 0.7 } });
    },
    /* jeton qui tombe dans la grille et rebondit (Puissance 4) */
    drop: function (v) {
      varier(v, 0.05);
      reverb(v, 0.07);
      var ts = [0, 0.14, 0.235, 0.295, 0.335], as = [1, 0.42, 0.22, 0.11, 0.05];
      for (var i = 0; i < ts.length; i++) {
        var a = as[i], t = ts[i];
        note(v, { t: t, f: 230, f2: 120, glide: 0.05, dur: 0.1, g: 0.32 * a, a: 0.001 });
        note(v, { t: t, type: 'triangle', f: 1180 * (1 + i * 0.03), dur: 0.04, g: 0.07 * a, a: 0.0008 });
        if (i < 3) bruit(v, { t: t, dur: 0.03, g: 0.1 * a, a: 0.0005, filtre: { f: 2600, q: 1.4 } });
      }
    },
    /* pose d'une lettre / tuile en bois */
    place: function (v) {
      varier(v, 0.08);
      reverb(v, 0.05);
      note(v, { f: 620, f2: 480, glide: 0.04, dur: 0.08, g: 0.3, a: 0.001 });
      note(v, { type: 'triangle', f: 1750, dur: 0.028, g: 0.05, a: 0.0006 });
      bruit(v, { dur: 0.022, g: 0.09, a: 0.0005, filtre: { f: 1500, q: 1.8 } });
    },
    /* échange : glissement + deux tuiles posées */
    swap: function (v) {
      reverb(v, 0.08);
      bruit(v, { type: 'rose', dur: 0.14, g: 0.06, a: 0.03, filtre: { f: 700, f2: 1800, q: 1.2 } });
      for (var i = 0; i < 2; i++) {
        var t = 0.03 + i * 0.09, f = i ? 700 : 580;
        note(v, { t: t, f: f, f2: f * 0.78, glide: 0.04, dur: 0.07, g: 0.2, a: 0.001 });
        bruit(v, { t: t, dur: 0.02, g: 0.07, a: 0.0005, filtre: { f: 1500, q: 1.8 } });
      }
    },
    /* carte distribuée : froissement court */
    deal: function (v) {
      varier(v, 0.1);
      reverb(v, 0.04);
      var pan = alea(-0.25, 0.25);
      bruit(v, { type: 'rose', dur: 0.075, g: 1.1, a: 0.003, filtre: { f: 2600, f2: 1700, q: 0.9 }, filtre2: { type: 'lowpass', f: 5000, q: 0.5 }, pan: pan });
      bruit(v, { t: 0.012, dur: 0.045, g: 0.2, a: 0.002, filtre: { f: 3800, q: 1.4 }, filtre2: { type: 'lowpass', f: 5500, q: 0.5 }, pan: pan });
      bruit(v, { t: 0.05, type: 'rose', dur: 0.03, g: 0.2, a: 0.002, filtre: { f: 1200, q: 1 }, pan: pan });
    },
    /* carte retournée : double claquement de papier */
    flip: function (v) {
      varier(v, 0.08);
      reverb(v, 0.04);
      bruit(v, { dur: 0.035, g: 0.3, a: 0.001, filtre: { f: 2300, q: 1.3 } });
      bruit(v, { t: 0.05, dur: 0.03, g: 0.22, a: 0.001, filtre: { f: 2800, q: 1.3 }, filtre2: { type: 'lowpass', f: 5000, q: 0.5 } });
      bruit(v, { type: 'rose', dur: 0.09, g: 0.08, a: 0.01, filtre: { type: 'lowpass', f: 1400, q: 0.7 } });
    },
    /* mélange de cartes (queue d'aronde) */
    shuffle: function (v) {
      reverb(v, 0.05);
      jouerTampon(v, procedural(v.ctx, 'melange'), { g: 0.6 });
    },
    /* jeton de casino : clic céramique */
    chip: function (v) {
      varier(v, 0.05);
      reverb(v, 0.06);
      jouerTampon(v, procedural(v.ctx, 'jeton'), { g: 0.55, pan: alea(-0.2, 0.2) });
    },
    /* pile de jetons */
    chips: function (v) {
      varier(v, 0.04);
      reverb(v, 0.06);
      jouerTampon(v, procedural(v.ctx, 'jetons'), { g: 0.55 });
    },
    /* pièce gagnée : deux notes brillantes */
    coin: function (v) {
      reverb(v, 0.2);
      note(v, { f: hz(83), dur: 0.1, g: 0.12, a: 0.002 });
      note(v, { type: 'triangle', f: hz(83), dur: 0.08, g: 0.04, a: 0.002 });
      note(v, { t: 0.075, f: hz(88), dur: 0.5, g: 0.15, a: 0.002 });
      note(v, { t: 0.075, type: 'triangle', f: hz(88), dur: 0.3, g: 0.05, a: 0.002 });
      cloche(v, { t: 0.075, f: hz(100), ratio: 2, index: 0.6, dur: 0.3, g: 0.03 });
      bruit(v, { t: 0.075, dur: 0.12, g: 0.012, filtre: { type: 'highpass', f: 7000, q: 0.7 } });
    },
    /* dés qui roulent : 400 à 700 ms de chocs aléatoires */
    dice: function (v) {
      reverb(v, 0.05);
      jouerTampon(v, procedural(v.ctx, 'des'), { g: 0.6, pan: alea(-0.2, 0.2) });
    },
    /* souffle qui traverse de gauche à droite */
    whoosh: function (v) {
      reverb(v, 0.1);
      bruit(v, { type: 'rose', dur: 0.38, g: 0.45, a: 0.14, filtre: { f: 320, f2: 2400, glide: 0.3, q: 1.1 }, panDe: -0.6, panA: 0.6 });
    },
    /* compte à rebours : tic */
    tick: function (v) {
      reverb(v, 0.02);
      note(v, { f: 1900, f2: 1700, dur: 0.03, g: 0.18, a: 0.0008 });
      bruit(v, { dur: 0.008, g: 0.06, a: 0.0005, filtre: { type: 'highpass', f: 6000, q: 0.7 } });
    },
    /* compte à rebours : tac (bloc de bois) */
    tock: function (v) {
      reverb(v, 0.03);
      note(v, { f: 1050, f2: 950, dur: 0.045, g: 0.2, a: 0.001 });
      note(v, { type: 'triangle', f: 690, dur: 0.05, g: 0.08, a: 0.001 });
    },
    /* révélation : arpège scintillant */
    reveal: function (v) {
      reverb(v, 0.32);
      var ns = [84, 88, 91, 96];
      for (var i = 0; i < ns.length; i++) cloche(v, { t: i * 0.065, f: hz(ns[i]), ratio: 2, index: 1.1, dur: 0.55, g: 0.075 });
      bruit(v, { dur: 0.5, g: 0.02, a: 0.2, filtre: { type: 'highpass', f: 6500, q: 0.7 } });
    },
    /* bonne réponse : deux notes montantes */
    correct: function (v) {
      reverb(v, 0.16);
      maillet(v, { f: hz(79), dur: 0.2, g: 0.15 });
      cloche(v, { f: hz(79), ratio: 2, index: 0.5, dur: 0.2, g: 0.04 });
      maillet(v, { t: 0.09, f: hz(86), dur: 0.38, g: 0.17 });
      cloche(v, { t: 0.09, f: hz(86), ratio: 2, index: 0.6, dur: 0.4, g: 0.05 });
    },
    /* erreur : deux notes graves et feutrées */
    wrong: function (v) {
      reverb(v, 0.08);
      note(v, { type: 'triangle', f: hz(64), dur: 0.16, g: 0.16, a: 0.008, lp: 900 });
      note(v, { f: hz(52), dur: 0.16, g: 0.08, a: 0.008 });
      note(v, { t: 0.14, type: 'triangle', f: hz(60), f2: hz(59), glide: 0.3, dur: 0.32, g: 0.16, a: 0.01, lp: 800 });
      note(v, { t: 0.14, f: hz(48), dur: 0.3, g: 0.08, a: 0.01 });
    },
    /* réussite : arpège majeur + accord qui résonne */
    success: function (v) {
      reverb(v, 0.24);
      var ns = [72, 76, 79, 84], i;
      for (i = 0; i < ns.length; i++) maillet(v, { t: i * 0.07, f: hz(ns[i]), dur: 0.3, g: 0.12 });
      var acc = [84, 88, 91];
      for (i = 0; i < acc.length; i++) cloche(v, { t: 0.21, f: hz(acc[i]), ratio: 2, index: 0.7, dur: 0.75, g: 0.04 });
    },
    /* combo : opts.level 1..8, de plus en plus aigu et riche */
    combo: function (v, o) {
      var lv = Math.round(borne(nombre(o.level, 1), 1, 8));
      var GAMME = [0, 2, 4, 7, 9, 12, 14, 16]; // pentatonique : toujours consonant
      var f = hz(72 + GAMME[lv - 1]), g = 0.13 + lv * 0.008;
      reverb(v, 0.1 + lv * 0.025);
      maillet(v, { f: f, dur: 0.22 + lv * 0.03, g: g });
      if (lv >= 3) maillet(v, { f: f * 1.5, dur: 0.2, g: g * 0.35, clic: false });
      if (lv >= 5) {
        cloche(v, { t: 0.03, f: f * 2, ratio: 2, index: 0.8, dur: 0.4, g: 0.05 });
        bruit(v, { t: 0.02, dur: 0.25, g: 0.015, a: 0.02, filtre: { type: 'highpass', f: 7000, q: 0.7 } });
      }
      if (lv >= 7) {
        maillet(v, { t: 0.06, f: f * 2, dur: 0.3, g: g * 0.5 });
        note(v, { f: f / 2, dur: 0.35, g: 0.06, a: 0.01 });
      }
    },
    /* explosion sourde (bonbons spéciaux) */
    explosion: function (v) {
      reverb(v, 0.18);
      note(v, { f: 150, f2: 38, glide: 0.35, dur: 0.5, g: 0.5, a: 0.002 });
      bruit(v, { type: 'brun', dur: 0.55, g: 0.5, a: 0.003, filtre: { type: 'lowpass', f: 1100, f2: 150, glide: 0.45, q: 0.7 } });
      bruit(v, { type: 'rose', dur: 0.09, g: 0.1, a: 0.001, filtre: { f: 1600, q: 0.7 } });
      note(v, { type: 'triangle', f: 340, f2: 90, glide: 0.08, dur: 0.12, g: 0.12, a: 0.001 });
    },
    /* victoire : petite fanfare joyeuse (~1,2 s) */
    win: function (v) {
      reverb(v, 0.26);
      var mel = [79, 84, 88], i;
      for (i = 0; i < mel.length; i++) maillet(v, { t: i * 0.09, f: hz(mel[i]), dur: 0.2, g: 0.12 });
      var t = 0.29;
      maillet(v, { t: t, f: hz(91), dur: 0.5, g: 0.1 });
      cloche(v, { t: t, f: hz(91), ratio: 2, index: 0.9, dur: 0.95, g: 0.09 });
      var acc = [72, 76, 79];
      for (i = 0; i < acc.length; i++) cuivre(v, { t: t, f: hz(acc[i]), dur: 0.72, g: 0.035, r: 0.25 });
      note(v, { t: t, f: hz(48), dur: 0.8, g: 0.1, a: 0.01 });
      cloche(v, { t: t + 0.08, f: hz(96), ratio: 2, index: 0.5, dur: 0.5, g: 0.03 });
      cloche(v, { t: t + 0.16, f: hz(100), ratio: 2, index: 0.5, dur: 0.5, g: 0.025 });
    },
    /* défaite : descente mineure, douce, qui se pose */
    lose: function (v) {
      reverb(v, 0.22);
      var ns = [76, 72, 69], i;
      for (i = 0; i < ns.length; i++) {
        note(v, { t: i * 0.2, type: 'triangle', f: hz(ns[i]), dur: 0.26, g: 0.12, a: 0.01, lp: 1500 });
        note(v, { t: i * 0.2, f: hz(ns[i]), dur: 0.26, g: 0.06, a: 0.01 });
      }
      var acc = [57, 60, 64];
      for (i = 0; i < acc.length; i++) {
        note(v, { t: 0.6, type: 'triangle', f: hz(acc[i]), dur: 0.7, g: 0.07, a: 0.04, s: 0.7, d: 0.2, r: 0.3, lp: 1200, vib: [5, 8] });
      }
      note(v, { t: 0.6, f: hz(45), dur: 0.7, g: 0.08, a: 0.03 });
    },
    /* égalité : deux notes égales puis un accord suspendu */
    draw: function (v) {
      reverb(v, 0.2);
      maillet(v, { f: hz(74), dur: 0.22, g: 0.13 });
      maillet(v, { t: 0.15, f: hz(74), dur: 0.22, g: 0.12 });
      var acc = [67, 72, 74];
      for (var i = 0; i < acc.length; i++) {
        note(v, { t: 0.3, type: 'triangle', f: hz(acc[i]), dur: 0.55, g: 0.06, a: 0.03, s: 0.7, d: 0.15, r: 0.25, lp: 1800 });
      }
    },
    /* grande victoire : fanfare de cuivres, timbales et cloches (~2 s) */
    fanfare: function (v) {
      reverb(v, 0.3);
      var seq = [[0, 67, 0.09], [0.11, 67, 0.09], [0.22, 67, 0.09], [0.33, 72, 0.34], [0.72, 67, 0.12], [0.86, 72, 1.0]], i;
      for (i = 0; i < seq.length; i++) {
        var s = seq[i], lg = s[2] > 0.5;
        cuivre(v, { t: s[0], f: hz(s[1]), dur: s[2], g: 0.07, brillance: 6, r: lg ? 0.3 : 0.06, vib: lg ? [5.2, 9] : null });
        cuivre(v, { t: s[0], f: hz(s[1] - 12), dur: s[2], g: 0.035, r: lg ? 0.3 : 0.06 });
      }
      cuivre(v, { t: 0.86, f: hz(76), dur: 1.0, g: 0.045, r: 0.3, vib: [5.2, 9] });
      cuivre(v, { t: 0.86, f: hz(79), dur: 1.0, g: 0.045, r: 0.3, vib: [5.2, 9] });
      note(v, { t: 0.86, f: hz(48), dur: 1.0, g: 0.12, a: 0.01 });
      note(v, { t: 0.33, f: 98, f2: 90, glide: 0.2, dur: 0.35, g: 0.18, a: 0.002 });
      note(v, { t: 0.86, f: 98, f2: 90, glide: 0.2, dur: 0.45, g: 0.2, a: 0.002 });
      var cl = [84, 88, 91, 96];
      for (i = 0; i < cl.length; i++) cloche(v, { t: 0.86 + i * 0.07, f: hz(cl[i]), ratio: 2, index: 0.8, dur: 0.8, g: 0.05 });
      bruit(v, { t: 0.86, dur: 1.1, g: 0.025, a: 0.08, filtre: { type: 'highpass', f: 6500, q: 0.7 } });
    },
    /* message reçu : double tintement */
    notify: function (v) {
      reverb(v, 0.24);
      cloche(v, { f: hz(88), ratio: 2, index: 1, dur: 0.4, g: 0.09 });
      note(v, { f: hz(88), dur: 0.25, g: 0.05 });
      cloche(v, { t: 0.11, f: hz(93), ratio: 2, index: 1, dur: 0.6, g: 0.09 });
      note(v, { t: 0.11, f: hz(93), dur: 0.4, g: 0.05 });
    },
    /* touche de clavier virtuel */
    type: function (v) {
      varier(v, 0.16);
      bruit(v, { dur: 0.018, g: 0.2, a: 0.0006, filtre: { f: 3000, q: 1 } });
      note(v, { f: 1500, f2: 1100, glide: 0.015, dur: 0.022, g: 0.1, a: 0.0006 });
    },
    /* effacement : coup de gomme */
    erase: function (v) {
      reverb(v, 0.04);
      bruit(v, { type: 'rose', dur: 0.15, g: 0.4, a: 0.012, filtre: { f: 1900, f2: 700, q: 1.2 } });
      note(v, { f: 620, f2: 400, glide: 0.09, dur: 0.1, g: 0.09, a: 0.004 });
    },
    /* touché (bataille navale) : impact + tintement métallique */
    hit: function (v) {
      reverb(v, 0.22);
      note(v, { f: 170, f2: 55, glide: 0.25, dur: 0.32, g: 0.42, a: 0.002 });
      bruit(v, { type: 'rose', dur: 0.3, g: 0.28, a: 0.002, filtre: { type: 'lowpass', f: 2600, f2: 400, glide: 0.25, q: 0.7 } });
      var P = [[523, 0.4, 0.05], [1371, 0.28, 0.04], [2213, 0.18, 0.025], [3120, 0.1, 0.015]];
      for (var i = 0; i < P.length; i++) note(v, { f: P[i][0], dur: P[i][1], g: P[i][2], a: 0.001 });
    },
    /* à l'eau : plouf et gouttelettes */
    splash: function (v) {
      reverb(v, 0.15);
      jouerTampon(v, procedural(v.ctx, 'eclabousse'), { g: 0.55 });
    },
    /* navire coulé : grondement qui descend et bulles */
    sink: function (v) {
      reverb(v, 0.28);
      bruit(v, { type: 'brun', dur: 1.3, g: 0.3, a: 0.06, filtre: { type: 'lowpass', f: 500, f2: 110, glide: 1.2, q: 0.7 } });
      note(v, { f: 200, f2: 50, glide: 1.1, dur: 1.2, g: 0.16, a: 0.03 });
      note(v, { type: 'triangle', f: 100, f2: 38, glide: 1.1, dur: 1.2, g: 0.1, a: 0.05, lp: 300 });
      jouerTampon(v, procedural(v.ctx, 'bulles'), { t: 0.12, g: 0.4 });
    },
    /* cloche claire */
    bell: function (v) {
      reverb(v, 0.38);
      cloche(v, { f: hz(84), ratio: 3.5, index: 2.2, dur: 1.6, g: 0.12 });
      note(v, { f: hz(84) * 0.5, dur: 1.4, g: 0.04, a: 0.005 });
      note(v, { f: hz(84) * 2.76, dur: 0.6, g: 0.02, a: 0.002 });
    }
  };

  var NOMS = [];
  for (var nomRecette in RECETTES) if (aCle(RECETTES, nomRecette)) NOMS.push(nomRecette);

  var ALIAS = {
    click: 'tap', clic: 'tap', error: 'wrong', erreur: 'wrong', victoire: 'win', defaite: 'lose',
    egalite: 'draw', carte: 'deal', jeton: 'chip', jetons: 'chips', piece: 'coin', des: 'dice',
    melange: 'shuffle', cloche: 'bell', message: 'notify'
  };
  function recette(nom) {
    nom = String(nom);
    if (aCle(RECETTES, nom)) return nom;
    return aCle(ALIAS, nom) ? ALIAS[nom] : null;
  }

  /* ================================================================
   * 5. Cycle de vie du contexte audio
   * ================================================================ */

  function creer() {
    if (AC) return AC;
    var C = classeAudio();
    if (!C) return null;
    try { AC = new C({ latencyHint: 'interactive' }); } catch (e) {
      try { AC = new C(); } catch (e2) { AC = null; }
    }
    if (!AC) return null;
    try {
      sortie = chaine(AC, reglages.get('son') ? gainVolume() : 0, true);
    } catch (e) {
      try { AC.close(); } catch (e2) {}
      AC = null;
      sortie = null;
      return null;
    }
    try {
      AC.onstatechange = function () { if (AC && AC.state === 'running') veilleAuto = false; };
    } catch (e) {}
    // bruits de base pré-calculés hors du geste, un par tâche (aucun à-coup)
    ['blanc', 'rose', 'brun'].forEach(function (t, i) {
      setTimeout(function () { try { if (AC) bruitTampon(AC, t); } catch (e) {} }, 20 + i * 20);
    });
    setTimeout(preparerEnAttente, 100);
    return AC;
  }

  function reveiller() {
    try {
      var p = AC.resume();
      if (p && p.then) p.then(function () { veilleAuto = false; }, rien);
    } catch (e) {}
  }

  function armerVeille() {
    clearTimeout(minuteurVeille);
    minuteurVeille = setTimeout(mettreEnVeille, VEILLE_MS);
  }

  function mettreEnVeille() {
    if (!AC || AC.state !== 'running') return;
    if (voix.length) { armerVeille(); return; }
    veilleAuto = true;
    try {
      var p = AC.suspend();
      if (p && p.catch) p.catch(rien);
    } catch (e) {}
  }

  function deconnecter(v) {
    try { v.out.disconnect(); } catch (e) {}
    try { v.rev.disconnect(); } catch (e) {}
    v.sources = [];
  }

  function nettoyer(v) {
    var i = voix.indexOf(v);
    if (i >= 0) voix.splice(i, 1);
    deconnecter(v);
  }

  /* coupe une voix en 30 ms (sans clic) */
  function couper(v) {
    clearTimeout(v.minuteur);
    var i = voix.indexOf(v);
    if (i >= 0) voix.splice(i, 1);
    try {
      var t = v.ctx.currentTime, g = v.out.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(0, t + 0.03);
      for (var k = 0; k < v.sources.length; k++) {
        try { v.sources[k].stop(t + 0.04); } catch (e) {}
      }
    } catch (e) {}
    setTimeout(function () { deconnecter(v); }, 150);
  }

  function toutCouper() {
    var l = voix.slice();
    for (var i = 0; i < l.length; i++) couper(l[i]);
  }

  /* un réglage a changé : on l'applique au moteur */
  function appliquer(cle) {
    if (cle !== 'son' && cle !== 'volume') return;
    if (!AC || !sortie) return;
    var actif = !!reglages.get('son');
    try { sortie.maitre.gain.setTargetAtTime(actif ? gainVolume() : 0, AC.currentTime, 0.02); } catch (e) {}
    if (!actif) { toutCouper(); mettreEnVeille(); }
  }

  /* unlock() : crée / réveille le contexte ; à appeler pendant un geste. */
  function unlock() {
    try {
      if (!navigateur() || !reglages.get('son')) return false;
      if (!creer()) return false;
      demarrage = maintenant();
      if (AC.state !== 'running') {
        reveiller();
        try {
          // astuce iOS : un tampon muet joué pendant le geste ouvre la sortie audio
          var s = AC.createBufferSource();
          s.buffer = AC.createBuffer(1, 1, AC.sampleRate);
          s.connect(AC.destination);
          s.start(0);
        } catch (e) {}
      }
      armerVeille();
      return AC.state === 'running';
    } catch (e) {
      return false;
    }
  }

  /*
   * play(nom, opts) : joue un son. opts {volume (0..2, défaut 1), pitch
   * (multiplicateur, défaut 1), level (combo 1..8), on (toggle)}.
   * Renvoie true si le son est parti ; ne lève jamais d'exception.
   */
  function play(nom, opts) {
    var v = null;
    try {
      if (!AC || !sortie || !reglages.get('son')) return false;
      var k = recette(nom);
      if (!k) return false;
      if (AC.state !== 'running') {
        // contexte suspendu : seulement s'il s'agit de NOTRE mise en veille, ou d'un
        // déverrouillage en cours (le son partira dès la reprise, quelques ms plus tard)
        var enCours = maintenant() - demarrage < 1000;
        if (AC.state !== 'suspended' || !(veilleAuto || enCours) || !activation()) return false;
        reveiller();
      }
      opts = opts || {};
      while (voix.length >= MAX_VOIX) couper(voix[0]);
      v = nouvelleVoix(sortie, opts, AC.currentTime + 0.004);
      RECETTES[k](v, opts);
      v.fin += 0.05;
      voix.push(v);
      var vv = v;
      v.minuteur = setTimeout(function () { nettoyer(vv); }, Math.max(0, (v.fin - AC.currentTime) * 1000) + 150);
      armerVeille();
      return true;
    } catch (e) {
      if (v) { try { couper(v); } catch (e2) {} }
      return false;
    }
  }

  function setOn(actif) {
    var val = reglages.set('son', !!actif);
    if (val) unlock();
    return val;
  }

  function volume(v) {
    if (v === undefined) return reglages.get('volume');
    return reglages.set('volume', v);
  }

  /* prepare(noms) : pré-calcule les sons lourds (tampons) hors des moments
     critiques, par petites tranches. Sans contexte audio, attend le déverrouillage. */
  function prepare(noms) {
    var l = typeof noms === 'string' ? [noms] : (noms && noms.length ? noms : NOMS);
    for (var i = 0; i < l.length; i++) {
      var g = TAMPONS_DES_SONS[recette(l[i])];
      if (g && aPreparer.indexOf(g) < 0) aPreparer.push(g);
    }
    if (AC) setTimeout(preparerEnAttente, 0);
  }

  function preparerEnAttente() {
    if (!AC || !aPreparer.length) return;
    var g = aPreparer[0], sr = AC.sampleRate, liste = tampons[g + sr];
    try {
      if (!liste || liste.length < (VARIANTES[g] || 1)) procedural(AC, g);
      liste = tampons[g + sr];
      if (liste && liste.length >= (VARIANTES[g] || 1)) aPreparer.shift();
    } catch (e) { aPreparer.shift(); }
    if (aPreparer.length) setTimeout(preparerEnAttente, 16);
  }

  /* rendre(nom, opts) : rendu hors ligne (OfflineAudioContext), volume 1 → Promise<AudioBuffer|null>. */
  function rendre(nom, opts) {
    var OAC = root.OfflineAudioContext || root.webkitOfflineAudioContext, k = recette(nom);
    if (!OAC || !k) return Promise.resolve(null);
    try {
      var sr = AC ? AC.sampleRate : 44100, off = new OAC(2, Math.ceil(sr * 3.6), sr);
      var ch = chaine(off, 1, false), v = nouvelleVoix(ch, opts || {}, 0.01);
      RECETTES[k](v, opts || {});
      return new Promise(function (resolve) {
        off.oncomplete = function (e) { resolve(e.renderedBuffer); };
        var p = off.startRendering();
        if (p && p.then) p.then(resolve, function () { resolve(null); });
      });
    } catch (e) {
      return Promise.resolve(null);
    }
  }

  /* ---- branchements automatiques (navigateur seulement) ---- */
  function surGeste() {
    if (AC && AC.state === 'running') return;
    // sur mobile, seul un geste « activant » (touchend, pointerup, keydown…) autorise l'audio
    try {
      var ua = navigator.userActivation;
      if (ua && !ua.isActive) return;
    } catch (e) {}
    unlock();
  }

  function surVisibilite() {
    if (!AC || !document.hidden) return;
    toutCouper();
    mettreEnVeille();
  }

  function installer() {
    if (!navigateur() || typeof document.addEventListener !== 'function') return;
    var o = { capture: true, passive: true };
    ['pointerdown', 'pointerup', 'touchend', 'keydown', 'mousedown'].forEach(function (t) {
      document.addEventListener(t, surGeste, o);
    });
    document.addEventListener('visibilitychange', surVisibilite);
    // réglages modifiés dans un autre onglet
    try {
      root.addEventListener('storage', function (e) {
        if (e.key !== CLE && e.key !== null) return;
        memoire = null;
        appliquer('son');
      });
    } catch (e) {}
  }

  /* ================================================================
   * 6. Exports
   * ================================================================ */

  var sfx = {
    play: play,
    unlock: unlock,
    on: function () { return !!reglages.get('son'); },
    setOn: setOn,
    volume: volume,
    noms: NOMS.slice(),
    prepare: prepare,
    etat: function () { return AC ? AC.state : 'absent'; },
    voix: function () { return voix.length; },
    rendre: rendre
  };

  GG.sfx = sfx;
  GG.reglages = reglages;
  GG.haptic = haptic;

  installer();

  if (typeof module === 'object' && module.exports) {
    module.exports = { sfx: sfx, reglages: reglages, haptic: haptic };
  }
})(typeof self !== 'undefined' ? self : globalThis);
