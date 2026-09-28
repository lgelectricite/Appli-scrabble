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
 *
 * La partie survit aux coupures :
 *  - chaque lien présente une clé secrète au relais : l'hôte reprend SON
 *    code après une coupure, et une vieille connexion fantôme cède la place ;
 *  - un signal de vie (« ping ») détecte une connexion morte en quelques
 *    secondes, et le lien se reconnecte seul (retour au premier plan, réseau
 *    retrouvé, passage Wi-Fi → 4G…) ;
 *  - quand l'hôte décroche, les invités l'attendent au lieu d'abandonner.
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

  var PING_MS = 12000;          // un signal de vie toutes les 12 s
  var SILENCE_MAX = 30000;      // 30 s sans rien : la connexion est morte
  var PATIENCE_EN_JEU = 240000; // en partie, on insiste 4 minutes
  var ATTENTE_HOTE = 90000;     // relais ancien : on attend l'hôte 90 s

  var MOTIFS = {
    pris: 'Ce code est déjà pris. On en tire un autre…',
    inconnu: 'Aucune partie sur ce code. Vérifiez-le auprès de l’hôte : il expire quand l’hôte quitte.',
    plein: 'Cette partie est déjà complète.'
  };

  function tirage(n, alphabet) {
    var out = '';
    var t = new Uint32Array(n);
    if (root.crypto && root.crypto.getRandomValues) root.crypto.getRandomValues(t);
    for (var i = 0; i < n; i++) {
      var v = t[i] || Math.floor(Math.random() * 4294967296);
      out += alphabet.charAt(v % alphabet.length);
    }
    return out;
  }

  function tirerCode() { return tirage(LONGUEUR, ALPHABET); }

  /* clé secrète d'un lien (jamais montrée, jamais dictée) */
  function tirerCle() {
    return tirage(24, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789');
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
    this.lien._oublier(this.id, this);
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

  var liensActifs = [];

  /*
   * options : {
   *   role: 'h' | 'g', code, url, cle,
   *   onPret(code)      — connecté et accepté (la première fois)
   *   onRetour()        — reconnecté après une coupure
   *   onPair(pair)      — un nouveau correspondant (hôte : chaque invité)
   *   onErreur(txt, definitif)
   *   onEtat(txt)       — « Reconnexion… », « L'hôte a perdu la connexion… », '' quand tout va bien
   * }
   */
  function Lien(options) {
    this.o = options || {};
    this.code = this.o.code || '';
    this.cle = this.o.cle || tirerCle();
    this.ws = null;
    this.pairs = {};
    this.ferme = false;
    this.essais = 0;
    this.pretUneFois = false;
    this.pingOk = false;        // le relais sait répondre « pong »
    this.dernierSigne = 0;
    this.debutPanne = 0;
    this.hoteAbsent = false;    // (invité) l'hôte a décroché, on l'attend
    this.adieu = false;         // (invité) l'hôte a annoncé la fin
    this.attenteHote = null;
    this.relance = null;
    var self = this;
    this.battement = setInterval(function () { self._battre(); }, PING_MS);
    liensActifs.push(this);
    this._ouvrir();
  }

  Lien.prototype.estOuvert = function () {
    return !!(this.ws && this.ws.readyState === 1);
  };

  Lien.prototype._url = function () {
    return this.o.url + '/salon/' + encodeURIComponent(this.code) + '?r=' + this.o.role +
      '&k=' + encodeURIComponent(this.cle);
  };

  Lien.prototype._etat = function (txt) {
    if (this.o.onEtat) this.o.onEtat(txt);
  };

  /* Oublie la socket courante sans attendre qu'elle se ferme proprement
     (une connexion morte peut mettre des minutes à le reconnaître). */
  Lien.prototype._lacher = function () {
    var ws = this.ws;
    this.ws = null;
    if (!ws) return;
    ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
    try { ws.close(); } catch (e) {}
  };

  Lien.prototype._ouvrir = function () {
    if (this.ferme) return;
    clearTimeout(this.relance);
    this.relance = null;
    this._lacher();
    var self = this;
    var ws;
    try { ws = new root.WebSocket(this._url()); } catch (e) {
      this._echec('Adresse du serveur invalide.', true);
      return;
    }
    this.ws = ws;
    this.refus = null;

    ws.onopen = function () {
      self.dernierSigne = Date.now();
      try { ws.send('ping'); } catch (e) {}
    };

    ws.onmessage = function (ev) {
      self.dernierSigne = Date.now();
      if (ev.data === 'pong') { self.pingOk = true; return; }
      var m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      self._recevoir(m);
    };

    ws.onclose = function (ev) {
      if (self.ws !== ws) return;
      self.ws = null;
      self._ferme(ev.code);
    };

    ws.onerror = function () { /* onclose fait le nécessaire */ };
  };

  Lien.prototype._recevoir = function (m) {
    var self = this;
    if (m.sys === 'refus') { this.refus = m.pourquoi; return; }

    if (m.sys === 'bienvenue') {
      this.moi = m.id;
      this.essais = 0;
      this.debutPanne = 0;
      if (this.o.role === 'g') {
        // l'invité n'a qu'un correspondant : l'hôte
        var p = this.pairs.h;
        if (!p || !p.vivant) {
          p = new Pair(this, 'h');
          this.pairs.h = p;
          if (this.o.onPair) this.o.onPair(p);
        }
        // un seul « bonjour » par connexion
        if (p.onOpen) p.onOpen();
      }
      if (!this.pretUneFois) {
        this.pretUneFois = true;
        if (this.o.onPret) this.o.onPret(this.code);
      } else {
        if (!this.hoteAbsent) this._etat('');
        if (this.o.onRetour) this.o.onRetour();
      }
      return;
    }

    // (hôte) qui est là en ce moment : au retour d'une coupure, on remet
    // la liste des invités d'aplomb
    if (m.sys === 'presents' && this.o.role === 'h') {
      var ids = m.ids || [];
      Object.keys(this.pairs).forEach(function (id) {
        if (ids.indexOf(id) === -1) {
          var q = self.pairs[id];
          delete self.pairs[id];
          q._perdu();
        }
      });
      ids.forEach(function (id) {
        if (!self.pairs[id]) self._nouveauPair(id);
      });
      return;
    }

    if (m.sys === 'entre') {
      var ancien = this.pairs[m.id];
      if (ancien) { delete this.pairs[m.id]; ancien._perdu(); }
      this._nouveauPair(m.id);
      return;
    }

    if (m.sys === 'sort') {
      var sp = this.pairs[m.id];
      if (sp) { delete this.pairs[m.id]; sp._perdu(); }
      return;
    }

    // (invité) l'hôte a décroché : on l'attend, la partie n'est pas perdue
    if (m.sys === 'hote-absent') {
      this._hoteAbsent();
      return;
    }

    if (m.sys === 'hote-revenu') {
      this._hoteRevenu();
      // on redit bonjour : l'hôte revenu nous rend notre place
      var ph = this.pairs.h;
      if (ph && ph.vivant && ph.onOpen) ph.onOpen();
      return;
    }

    if (m.sys === 'hote-parti') {
      // Fin annoncée (l'hôte a quitté, ou n'est pas revenu à temps). Un relais
      // d'ancienne génération l'annonce dès la moindre coupure : dans ce cas
      // (ni adieu, ni absence annoncée), on laisse une chance à l'hôte.
      if (this.adieu || this.hoteAbsent) { this._fin('L’hôte a quitté la partie.'); return; }
      this._hoteAbsent();
      clearTimeout(this.attenteHote);
      this.attenteHote = setTimeout(function () {
        if (self.hoteAbsent) self._fin('L’hôte a quitté la partie.');
      }, ATTENTE_HOTE);
      return;
    }

    if (m.de !== undefined) {
      if (m.de === 'h') {
        if (this.hoteAbsent) this._hoteRevenu();
        if (m.d && m.d.t === 'adieu') this.adieu = true;
      }
      var q2 = this.pairs[m.de];
      // (hôte) un invité que l'on ne connaît pas encore (relais d'ancienne
      // génération, après notre propre coupure) : on l'accueille quand même
      if (!q2 && this.o.role === 'h' && /^g\d+$/.test(String(m.de))) {
        this._nouveauPair(m.de);
        q2 = this.pairs[m.de];
      }
      if (q2) q2._recevoir(m.d);
    }
  };

  Lien.prototype._nouveauPair = function (id) {
    var np = new Pair(this, id);
    this.pairs[id] = np;
    if (this.o.onPair) this.o.onPair(np);
    if (np.onOpen) np.onOpen();
  };

  /* (invité) l'hôte a décroché : on patiente, en redisant bonjour de temps
     en temps — l'hôte revenu nous reconnaît et nous rend notre place. */
  Lien.prototype._hoteAbsent = function () {
    var self = this;
    this.hoteAbsent = true;
    this._etat('L’hôte a perdu la connexion… on l’attend.');
    clearInterval(this.redire);
    this.redire = setInterval(function () {
      var p = self.pairs.h;
      if (!self.hoteAbsent || self.ferme) { clearInterval(self.redire); return; }
      if (p && p.vivant && p.onOpen && self.estOuvert()) p.onOpen();
    }, 5000);
  };

  Lien.prototype._hoteRevenu = function () {
    this.hoteAbsent = false;
    clearTimeout(this.attenteHote);
    clearInterval(this.redire);
    this.attenteHote = null;
    this._etat('');
  };

  Lien.prototype._fin = function (txt) {
    this.ferme = true;
    this._arreter();
    this._tousPerdus();
    if (this.o.onErreur) this.o.onErreur(txt, true);
  };

  Lien.prototype._ferme = function (code) {
    if (this.ferme) return;
    var self = this;

    // refus explicite du relais : inutile d'insister… sauf en pleine partie
    var pourquoi = this.refus ||
      (code === 4001 ? 'pris' : code === 4002 ? 'inconnu' : code === 4003 ? 'plein' : '');
    if (pourquoi) {
      if (pourquoi === 'pris' && this.o.role === 'h' && this.o.autoCode && !this.pretUneFois) {
        // collision de code à l'ouverture (rarissime) : on en tire un autre
        this.code = tirerCode();
        this._ouvrir();
        return;
      }
      // En pleine partie, « pris » (hôte) = notre vieille connexion traîne
      // encore sur un relais ancien ; « inconnu » (invité) = l'hôte est en
      // train de revenir. Dans les deux cas, on réessaie un moment.
      var passager = (this.pretUneFois || this.o.reprise) &&
        ((pourquoi === 'pris' && this.o.role === 'h') || (pourquoi === 'inconnu' && this.o.role === 'g'));
      if (!passager) {
        this._fin(MOTIFS[pourquoi] && pourquoi !== 'pris' ? MOTIFS[pourquoi]
          : pourquoi === 'pris' ? 'Ce code de partie est déjà utilisé.' : 'Connexion refusée.');
        return;
      }
    }

    // coupure réseau : on retente, sans perdre la partie
    if (!this.debutPanne) this.debutPanne = Date.now();
    this.essais++;
    var patience = this.pretUneFois || this.o.reprise ? PATIENCE_EN_JEU : 20000;
    if (Date.now() - this.debutPanne > patience) {
      this._fin(this.pretUneFois ? 'Connexion au serveur perdue.'
        : 'Impossible de joindre le serveur. Vérifiez la connexion Internet.');
      return;
    }
    if (!this.hoteAbsent) this._etat('Reconnexion…');
    var attente = Math.min(5000, 400 * Math.pow(2, this.essais - 1));
    this.relance = setTimeout(function () { self._ouvrir(); }, attente);
  };

  /* Signal de vie : une connexion silencieuse depuis trop longtemps est
     morte (changement de réseau, téléphone en veille) : on la remplace. */
  Lien.prototype._battre = function () {
    if (this.ferme) return;
    if (!this.estOuvert()) return;
    if (this.pingOk && Date.now() - this.dernierSigne > SILENCE_MAX) {
      this._lacher();
      this._ferme(1006);
      return;
    }
    try { this.ws.send('ping'); } catch (e) {}
  };

  /* Retour au premier plan ou réseau retrouvé : on vérifie tout de suite. */
  Lien.prototype.reveil = function () {
    if (this.ferme) return;
    if (!this.estOuvert()) {
      this.essais = 0;
      this._ouvrir();
      return;
    }
    var self = this;
    var avant = this.dernierSigne;
    try { this.ws.send('ping'); } catch (e) {}
    if (!this.pingOk) return;
    setTimeout(function () {
      if (!self.ferme && self.dernierSigne === avant && self.estOuvert()) {
        self._lacher();
        self.essais = 0;
        self._ferme(1006);
      }
    }, 4000);
  };

  Lien.prototype._echec = function (txt, definitif) {
    this.ferme = !!definitif;
    if (definitif) this._arreter();
    if (this.o.onErreur) this.o.onErreur(txt, definitif);
  };

  Lien.prototype._arreter = function () {
    clearInterval(this.battement);
    clearInterval(this.redire);
    clearTimeout(this.relance);
    clearTimeout(this.attenteHote);
    var at = liensActifs.indexOf(this);
    if (at !== -1) liensActifs.splice(at, 1);
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

  /* (hôte) un seul envoi pour tous les invités : le relais le recopie */
  Lien.prototype.diffuser = function (obj) {
    if (this.o.role !== 'h') return false;
    return this._envoyer('*', obj);
  };

  Lien.prototype._oublier = function (id, pair) {
    if (this.pairs[id] === pair) delete this.pairs[id];
  };

  /* Fin volontaire : l'hôte libère son code tout de suite (les invités
     n'attendent pas son retour). */
  Lien.prototype.close = function () {
    if (this.ferme && !this.ws) return;
    this.ferme = true;
    this._arreter();
    this._tousPerdus();
    var ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
      if (this.o.role === 'h' && ws.readyState === 1) {
        try { ws.send(JSON.stringify({ sys: 'fin' })); } catch (e) {}
      }
      try { ws.close(1000, 'fin'); } catch (e) { try { ws.close(); } catch (x) {} }
    }
  };

  /* Le téléphone revient au premier plan, ou retrouve du réseau. */
  function reveillerTout() {
    liensActifs.slice().forEach(function (l) { l.reveil(); });
  }
  if (root.addEventListener) {
    root.addEventListener('online', reveillerTout);
    if (root.document) {
      root.document.addEventListener('visibilitychange', function () {
        if (root.document.visibilityState === 'visible') reveillerTout();
      });
    }
  }

  /* ---------- ce que l'application utilise ---------- */

  GG.Online = {
    disponible: function () { return !!serveur(); },
    serveur: serveur,
    setServeur: setServeur,
    tirerCode: tirerCode,
    tirerCle: tirerCle,
    normaliser: normaliser,

    /* L'hôte ouvre un salon ; onPair reçoit chaque invité qui arrive.
       Avec opts.code + opts.cle : il reprend SON salon (après un rechargement). */
    heberger: function (opts) {
      var url = serveur();
      if (!url) { if (opts.onErreur) opts.onErreur('Aucun serveur configuré.', true); return null; }
      return new Lien({
        role: 'h', url: url, code: opts.code || tirerCode(), cle: opts.cle,
        autoCode: !opts.code, reprise: !!opts.code,
        onPret: opts.onPret, onRetour: opts.onRetour, onPair: opts.onPair,
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
        role: 'g', url: url, code: code, cle: opts.cle, reprise: !!opts.reprise,
        onPret: opts.onPret, onRetour: opts.onRetour, onPair: opts.onPair,
        onErreur: opts.onErreur, onEtat: opts.onEtat
      });
    }
  };

  if (typeof module === 'object' && module.exports) module.exports = GG.Online;
})(typeof self !== 'undefined' ? self : globalThis);
