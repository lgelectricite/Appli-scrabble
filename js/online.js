/*
 * GGgames — le mode « En ligne ».
 *
 * Jouer à distance, chacun chez soi : l'hôte annonce un CODE de 6 caractères,
 * les autres le tapent, et tout le monde se retrouve dans le salon. Les
 * messages transitent par un petit relais (dossier relay/) qui ne comprend
 * rien au jeu : le téléphone de l'hôte reste l'arbitre, exactement comme en
 * Wi-Fi. Le hors-ligne n'est pas concerné.
 *
 * Chaque « pair » exposé ici imite l'objet Net du mode QR (send, close,
 * isOpen, onMessage, onOpen, onClose) : le reste de l'application ne voit
 * pas la différence.
 */
(function (root) {
  'use strict';
  var GG = root.GG || (root.GG = {});

  /* Le relais de GGgames : rien à configurer pour jouer en ligne. Chacun peut
     lui préférer le sien (écran « En ligne → Réglages du serveur ») ; le code
     du relais est fourni dans le dossier relay/ du projet. */
  var RELAIS_PAR_DEFAUT = 'https://gggames-relais.contact-a7e.workers.dev';
  var CLE_RELAIS = 'gg-relais';

  /* Sans I, O, 0 ni 1 : un code se dicte au téléphone sans confusion. */
  var ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var LONGUEUR = 6;

  var MOTIFS = {
    pris: 'Ce code est déjà pris. On en tire un autre…',
    inconnu: 'Aucune partie sur ce code. Vérifiez-le auprès de l’hôte : il expire quand l’hôte quitte.',
    plein: 'Cette partie est déjà complète.'
  };

  function tirerCode() {
    var out = '';
    var tirage = new Uint32Array(LONGUEUR);
    if (root.crypto && root.crypto.getRandomValues) root.crypto.getRandomValues(tirage);
    for (var i = 0; i < LONGUEUR; i++) {
      var n = tirage[i] || Math.floor(Math.random() * 4294967296);
      out += ALPHABET.charAt(n % ALPHABET.length);
    }
    return out;
  }

  /* « https://truc.workers.dev/ » ou « truc.workers.dev » → « wss://truc.workers.dev » */
  function normaliser(url) {
    var u = String(url || '').trim();
    if (!u) return '';
    u = u.replace(/\/+$/, '');
    if (/^https:\/\//i.test(u)) u = 'wss://' + u.slice(8);
    else if (/^http:\/\//i.test(u)) u = 'ws://' + u.slice(7);
    else if (!/^wss?:\/\//i.test(u)) u = 'wss://' + u;
    return u;
  }

  function serveur() {
    var perso = '';
    try { perso = root.localStorage.getItem(CLE_RELAIS) || ''; } catch (e) {}
    return normaliser(perso || RELAIS_PAR_DEFAUT);
  }

  function setServeur(url) {
    var n = normaliser(url);
    try {
      if (n) root.localStorage.setItem(CLE_RELAIS, n);
      else root.localStorage.removeItem(CLE_RELAIS);
    } catch (e) {}
    return n;
  }

  /* ---------- un pair, vu par le reste de l'application ---------- */

  function Pair(lien, id) {
    this.lien = lien;
    this.id = id;          // 'h' chez l'invité ; 'g1', 'g2'… chez l'hôte
    this.vivant = true;
    this.onMessage = null;
    this.onOpen = null;
    this.onClose = null;
  }

  Pair.prototype.send = function (obj) {
    if (!this.vivant) return false;
    return this.lien._envoyer(this.id, obj);
  };

  Pair.prototype.isOpen = function () {
    return this.vivant && this.lien.estOuvert();
  };

  Pair.prototype.close = function () {
    if (!this.vivant) return;
    this.vivant = false;
    this.lien._oublier(this.id);
    if (this.onClose) this.onClose();
  };

  Pair.prototype._recevoir = function (d) {
    if (this.vivant && this.onMessage) this.onMessage(d);
  };

  Pair.prototype._perdu = function () {
    if (!this.vivant) return;
    this.vivant = false;
    if (this.onClose) this.onClose();
  };

  /* ---------- le lien vers le salon ---------- */

  /*
   * options : {
   *   role: 'h' | 'g', code, url,
   *   onPret(code)      — connecté et accepté
   *   onPair(pair)      — un nouveau correspondant (hôte : chaque invité)
   *   onErreur(txt, definitif)
   *   onEtat(txt)       — « connexion… », « reconnexion… »
   * }
   */
  function Lien(options) {
    this.o = options || {};
    this.code = this.o.code || '';
    this.ws = null;
    this.pairs = {};
    this.ferme = false;
    this.essais = 0;
    this.pretUneFois = false;
    this._ouvrir();
  }

  Lien.prototype.estOuvert = function () {
    return !!(this.ws && this.ws.readyState === 1);
  };

  Lien.prototype._url = function () {
    return this.o.url + '/salon/' + encodeURIComponent(this.code) + '?r=' + this.o.role;
  };

  Lien.prototype._ouvrir = function () {
    if (this.ferme) return;
    var self = this;
    var ws;
    try { ws = new root.WebSocket(this._url()); } catch (e) {
      this._echec('Adresse du serveur invalide.', true);
      return;
    }
    this.ws = ws;
    this.refus = null;

    ws.onopen = function () { self.essais = 0; };

    ws.onmessage = function (ev) {
      var m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }

      if (m.sys === 'refus') { self.refus = m.pourquoi; return; }

      if (m.sys === 'bienvenue') {
        self.moi = m.id;
        if (self.o.role === 'g') {
          // l'invité n'a qu'un correspondant : l'hôte
          var p = self.pairs.h;
          if (!p || !p.vivant) {
            p = new Pair(self, 'h');
            self.pairs.h = p;
            if (self.o.onPair) self.o.onPair(p);
          }
          if (p.onOpen) p.onOpen();
        }
        if (!self.pretUneFois) {
          self.pretUneFois = true;
          if (self.o.onPret) self.o.onPret(self.code);
        } else if (self.o.onEtat) {
          self.o.onEtat('');
        }
        return;
      }

      if (m.sys === 'entre') {
        var np = new Pair(self, m.id);
        self.pairs[m.id] = np;
        if (self.o.onPair) self.o.onPair(np);
        if (np.onOpen) np.onOpen();
        return;
      }

      if (m.sys === 'sort') {
        var sp = self.pairs[m.id];
        if (sp) { delete self.pairs[m.id]; sp._perdu(); }
        return;
      }

      if (m.sys === 'hote-parti') {
        self.ferme = true;
        self._tousPerdus();
        if (self.o.onErreur) self.o.onErreur('L’hôte a quitté la partie.', true);
        return;
      }

      if (m.de !== undefined) {
        var q = self.pairs[m.de];
        if (q) q._recevoir(m.d);
      }
    };

    ws.onclose = function (ev) {
      if (self.ferme) return;

      // refus explicite du relais : inutile d'insister
      var pourquoi = self.refus ||
        (ev.code === 4001 ? 'pris' : ev.code === 4002 ? 'inconnu' :
          ev.code === 4003 ? 'plein' : '');
      if (pourquoi) {
        if (pourquoi === 'pris' && self.o.role === 'h' && self.o.autoCode) {
          // collision de code (rarissime) : on en tire un autre en silence
          self.code = tirerCode();
          self._ouvrir();
          return;
        }
        self.ferme = true;
        self._tousPerdus();
        if (self.o.onErreur) self.o.onErreur(MOTIFS[pourquoi] || 'Connexion refusée.', true);
        return;
      }

      // coupure réseau : on retente, sans perdre la partie
      self.essais++;
      if (self.essais > 8) {
        self.ferme = true;
        self._tousPerdus();
        if (self.o.onErreur) self.o.onErreur('Connexion au serveur perdue.', true);
        return;
      }
      if (self.o.onEtat) self.o.onEtat('Reconnexion…');
      var attente = Math.min(8000, 500 * Math.pow(2, self.essais - 1));
      setTimeout(function () { self._ouvrir(); }, attente);
    };

    ws.onerror = function () { /* onclose fait le nécessaire */ };
  };

  Lien.prototype._echec = function (txt, definitif) {
    this.ferme = !!definitif;
    if (this.o.onErreur) this.o.onErreur(txt, definitif);
  };

  Lien.prototype._tousPerdus = function () {
    var self = this;
    Object.keys(this.pairs).forEach(function (id) {
      var p = self.pairs[id];
      delete self.pairs[id];
      p._perdu();
    });
  };

  Lien.prototype._envoyer = function (a, obj) {
    if (!this.estOuvert()) return false;
    try {
      this.ws.send(JSON.stringify(this.o.role === 'h' ? { a: a, d: obj } : { d: obj }));
      return true;
    } catch (e) { return false; }
  };

  Lien.prototype._oublier = function (id) {
    delete this.pairs[id];
  };

  Lien.prototype.close = function () {
    this.ferme = true;
    this._tousPerdus();
    if (this.ws) { try { this.ws.close(); } catch (e) {} }
    this.ws = null;
  };

  /* ---------- ce que l'application utilise ---------- */

  GG.Online = {
    disponible: function () { return !!serveur(); },
    serveur: serveur,
    setServeur: setServeur,
    tirerCode: tirerCode,
    normaliser: normaliser,

    /* L'hôte ouvre un salon ; onPair reçoit chaque invité qui arrive. */
    heberger: function (opts) {
      var url = serveur();
      if (!url) { if (opts.onErreur) opts.onErreur('Aucun serveur configuré.', true); return null; }
      return new Lien({
        role: 'h', url: url, code: opts.code || tirerCode(), autoCode: true,
        onPret: opts.onPret, onPair: opts.onPair,
        onErreur: opts.onErreur, onEtat: opts.onEtat
      });
    },

    /* Un invité rejoint avec le code annoncé par l'hôte. */
    rejoindre: function (opts) {
      var url = serveur();
      if (!url) { if (opts.onErreur) opts.onErreur('Aucun serveur configuré.', true); return null; }
      var code = String(opts.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (code.length < 4) { if (opts.onErreur) opts.onErreur('Code de partie incomplet.', true); return null; }
      return new Lien({
        role: 'g', url: url, code: code,
        onPret: opts.onPret, onPair: opts.onPair,
        onErreur: opts.onErreur, onEtat: opts.onEtat
      });
    }
  };

  if (typeof module === 'object' && module.exports) module.exports = GG.Online;
})(typeof self !== 'undefined' ? self : globalThis);
