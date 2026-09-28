/*
 * Relais GGgames — le point de rendez-vous des parties en ligne.
 *
 * Il ne comprend RIEN au jeu : il se contente de transmettre des messages
 * scellés entre le téléphone qui reçoit (l'hôte, qui reste l'arbitre) et
 * ceux qui l'ont rejoint. Aucune règle, aucun score, aucun secret de partie
 * ne passe par ici : le relais ne sait même pas à quoi vous jouez.
 *
 * Un salon = un code court (ex. PLUME7). Chaque salon vit dans son propre
 * Durable Object, qui se met en veille dès que personne ne parle : une
 * partie en attente ne consomme rien.
 *
 * Version 2 — la partie survit aux coupures :
 *  - l'hôte qui perd le réseau (ascenseur, Wi-Fi → 4G, appli en arrière-plan)
 *    a GRACE_HOTE pour revenir : les invités sont prévenus et attendent ;
 *  - chaque téléphone présente une clé secrète (?k=…) : l'hôte, et lui seul,
 *    reprend son propre code, et une connexion fantôme est remplacée au
 *    lieu de bloquer la place ;
 *  - l'hôte parle à tout le monde : son débit autorisé est bien plus large ;
 *  - « ping » reçoit « pong » sans réveiller le salon (signal de vie).
 * Les téléphones des versions précédentes restent compris.
 */

const CODE_OK = /^[A-Z0-9]{4,8}$/;
const CLE_OK = /^[A-Za-z0-9_-]{8,64}$/;

/* Codes de fermeture compris par l'application */
const FIN = {
  PRIS: 4001,      // un autre hôte tient déjà ce code
  INCONNU: 4002,   // aucun hôte sur ce code
  PLEIN: 4003,     // salon complet
  ABUS: 4004,      // message trop gros ou débit excessif
  REMPLACE: 4005   // le même téléphone s'est reconnecté ailleurs
};

const MAX_JOUEURS = 12;        // hôte non compris
const MAX_OCTETS = 256 * 1024;
const DEBIT_INVITE = 240;      // messages par fenêtre, pour un invité
const DEBIT_HOTE = 2400;       // l'hôte écrit à chacun : 12 invités × 200
const DEBIT_FENETRE = 10000;   // 10 s
const GRACE_HOTE = 180000;     // l’hôte a trois minutes pour revenir (appel, appli rechargée…)

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/' || url.pathname === '/sante') {
      return new Response(
        'Relais GGgames — en service.\n\n' +
        'Ce serveur ne fait que transmettre les messages des parties en ligne.\n' +
        'Il ne stocke rien et ne connaît rien des jeux.\n',
        { headers: { 'content-type': 'text/plain; charset=utf-8', 'access-control-allow-origin': '*' } }
      );
    }

    const m = url.pathname.match(/^\/salon\/([^/]+)$/);
    if (!m) return new Response('Introuvable', { status: 404 });

    const code = decodeURIComponent(m[1]).toUpperCase();
    if (!CODE_OK.test(code)) return new Response('Code de partie invalide', { status: 400 });

    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Ce point d’entrée attend une connexion WebSocket', { status: 426 });
    }

    const salon = env.SALONS.get(env.SALONS.idFromName(code));
    return salon.fetch(request);
  }
};

export class Salon {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    // signal de vie : Cloudflare répond « pong » lui-même, salon endormi ou non
    try {
      if (typeof WebSocketRequestResponsePair === 'function' && ctx.setWebSocketAutoResponse) {
        ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
      }
    } catch (e) { /* environnement sans réponse automatique */ }
  }

  /* étiquette de chaque socket : { id, hote, cle, n, t0, remplace } */
  infos(ws) {
    try { return ws.deserializeAttachment() || {}; } catch (e) { return {}; }
  }

  marquer(ws, champs) {
    try { ws.serializeAttachment(Object.assign({}, this.infos(ws), champs)); } catch (e) {}
  }

  /* les connexions encore valables (une connexion remplacée ne compte plus) */
  vivantes(tag) {
    return this.ctx.getWebSockets(tag).filter((ws) => !this.infos(ws).remplace);
  }

  hote() {
    const l = this.vivantes('h');
    return l.length ? l[l.length - 1] : null;
  }

  invites() {
    return this.vivantes('g');
  }

  envoyer(ws, obj) {
    if (!ws) return false;
    try { ws.send(JSON.stringify(obj)); return true; } catch (e) { return false; }
  }

  /* l'hôte est tenu au courant de qui entre et sort */
  prevenirHote(obj) {
    this.envoyer(this.hote(), obj);
  }

  async lireSalon() {
    try { return (await this.ctx.storage.get('salon')) || null; } catch (e) { return null; }
  }

  async ecrireSalon(s) {
    try { await this.ctx.storage.put('salon', s); } catch (e) {}
  }

  /* Refus : on accepte quand même la socket pour pouvoir expliquer pourquoi,
     puis on ferme avec un code que l'application sait traduire. */
  refuser(serveur, client, pourquoi, code, motif) {
    serveur.accept();
    this.envoyer(serveur, { sys: 'refus', pourquoi: pourquoi });
    serveur.close(code, motif);
    return new Response(null, { status: 101, webSocket: client });
  }

  async fetch(request) {
    const url = new URL(request.url);
    const veutHote = url.searchParams.get('r') === 'h';
    const cleBrute = url.searchParams.get('k') || '';
    const cle = CLE_OK.test(cleBrute) ? cleBrute : '';

    const paire = new WebSocketPair();
    const client = paire[0];
    const serveur = paire[1];

    const dejaHote = this.hote();
    let salon = await this.lireSalon();
    const hoteAbsent = !!(salon && salon.absent && !dejaHote);

    if (veutHote) {
      // le code est tenu (hôte présent ou attendu) : seul celui qui l'a ouvert,
      // avec sa clé secrète, peut le reprendre
      if (dejaHote || hoteAbsent) {
        if (!salon || !salon.cle || salon.cle !== cle) {
          return this.refuser(serveur, client, 'pris', FIN.PRIS, 'code deja pris');
        }
      }
    } else {
      if (!dejaHote && !hoteAbsent) {
        return this.refuser(serveur, client, 'inconnu', FIN.INCONNU, 'salon inconnu');
      }
      // le même téléphone revient (changement de réseau) : sa vieille
      // connexion, restée ouverte côté serveur, lui cède la place
      if (cle) {
        for (const g of this.invites()) {
          const i = this.infos(g);
          if (i.cle === cle) {
            this.marquer(g, { remplace: true });
            this.prevenirHote({ sys: 'sort', id: i.id });
            try { g.close(FIN.REMPLACE, 'remplace'); } catch (e) {}
          }
        }
      }
      if (this.invites().length >= MAX_JOUEURS) {
        return this.refuser(serveur, client, 'plein', FIN.PLEIN, 'salon complet');
      }
    }

    // identifiants jamais réutilisés dans un salon : g1, g2, g3…
    if (!salon) salon = { cle: '', absent: 0, n: 0 };
    let id = 'h';
    if (veutHote) {
      if (dejaHote) {
        // l'ancienne connexion de l'hôte est morte sans le savoir
        this.marquer(dejaHote, { remplace: true });
        try { dejaHote.close(FIN.REMPLACE, 'remplace'); } catch (e) {}
      }
      salon.cle = cle;
      salon.absent = 0;
    } else {
      let max = salon.n || 0;
      for (const ws of this.ctx.getWebSockets('g')) {
        const n = parseInt(String(this.infos(ws).id || '').slice(1), 10);
        if (n > max) max = n;
      }
      salon.n = max + 1;
      id = 'g' + salon.n;
    }
    await this.ecrireSalon(salon);

    // hibernation : la socket survit à la mise en veille du salon
    this.ctx.acceptWebSocket(serveur, [veutHote ? 'h' : 'g']);
    serveur.serializeAttachment({ id: id, hote: veutHote, cle: cle, n: 0, t0: 0 });

    this.envoyer(serveur, { sys: 'bienvenue', id: id, hote: veutHote });

    if (veutHote) {
      if (hoteAbsent) {
        try { await this.ctx.storage.deleteAlarm(); } catch (e) {}
        for (const g of this.invites()) this.envoyer(g, { sys: 'hote-revenu' });
      }
      // qui est là en ce moment (utile après une coupure de l'hôte)
      this.envoyer(serveur, { sys: 'presents', ids: this.invites().map((g) => this.infos(g).id) });
    } else {
      this.prevenirHote({ sys: 'entre', id: id });
      // l'invité sait tout de suite qui d'autre est déjà là
      this.envoyer(serveur, { sys: 'salon', n: this.invites().length });
      if (hoteAbsent) this.envoyer(serveur, { sys: 'hote-absent' });
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, brut) {
    const moi = this.infos(ws);
    if (moi.remplace) return;

    if (typeof brut !== 'string' || brut.length > MAX_OCTETS) {
      ws.close(FIN.ABUS, 'message trop gros');
      return;
    }

    // signal de vie (quand la réponse automatique n'est pas disponible)
    if (brut === 'ping') { try { ws.send('pong'); } catch (e) {} return; }

    // garde-fou de débit : une boucle folle ne doit pas noyer le salon
    const now = Date.now();
    let t0 = moi.t0 || 0;
    let n = moi.n || 0;
    if (now - t0 > DEBIT_FENETRE) { t0 = now; n = 0; }
    n++;
    if (n > (moi.hote ? DEBIT_HOTE : DEBIT_INVITE)) {
      ws.close(FIN.ABUS, 'debit excessif');
      return;
    }
    this.marquer(ws, { n: n, t0: t0 });

    let msg;
    try { msg = JSON.parse(brut); } catch (e) { return; }
    if (!msg || typeof msg !== 'object') return;

    // l'hôte ferme sa partie pour de bon : inutile de l'attendre
    if (moi.hote && msg.sys === 'fin') {
      this.marquer(ws, { remplace: true });
      await this.finSalon();
      try { ws.close(1000, 'fin'); } catch (e) {}
      return;
    }

    // le relais ne lit jamais `d` : c'est l'affaire des téléphones
    const paquet = { de: moi.id, d: msg.d };

    if (moi.hote) {
      // l'hôte s'adresse à un invité précis, ou à tout le monde
      if (msg.a === '*') {
        for (const g of this.invites()) this.envoyer(g, paquet);
      } else {
        for (const g of this.invites()) {
          if (this.infos(g).id === msg.a) { this.envoyer(g, paquet); break; }
        }
      }
      return;
    }

    // un invité ne peut parler qu'à l'hôte : personne ne peut se faire passer
    // pour l'arbitre ni écrire dans le dos des autres
    this.envoyer(this.hote(), paquet);
  }

  async webSocketClose(ws, code) {
    const moi = this.infos(ws);
    if (moi.remplace || !moi.id) return;
    // la socket qui se ferme ne compte plus (elle peut encore être listée)
    this.marquer(ws, { remplace: true });
    if (moi.hote) {
      if (this.hote()) return; // déjà remplacé par une connexion neuve
      if (code === 1000) { await this.finSalon(); return; }
      // coupure : on garde la place de l'hôte un moment, les invités patientent
      const salon = (await this.lireSalon()) || { cle: '', n: 0 };
      salon.absent = Date.now();
      await this.ecrireSalon(salon);
      try { await this.ctx.storage.setAlarm(Date.now() + GRACE_HOTE); } catch (e) {}
      for (const g of this.invites()) this.envoyer(g, { sys: 'hote-absent' });
      return;
    }
    this.prevenirHote({ sys: 'sort', id: moi.id });
  }

  async webSocketError(ws) {
    await this.webSocketClose(ws, 1006);
  }

  /* l'hôte n'est pas revenu à temps : la partie s'arrête pour tout le monde */
  async alarm() {
    if (this.hote()) return;
    await this.finSalon();
  }

  async finSalon() {
    for (const g of this.invites()) this.envoyer(g, { sys: 'hote-parti' });
    try { await this.ctx.storage.deleteAlarm(); } catch (e) {}
    try { await this.ctx.storage.deleteAll(); } catch (e) {}
  }
}
