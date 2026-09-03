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
 */

const CODE_OK = /^[A-Z0-9]{4,8}$/;

/* Codes de fermeture compris par l'application */
const FIN = {
  PRIS: 4001,      // un autre hôte tient déjà ce code
  INCONNU: 4002,   // aucun hôte sur ce code
  PLEIN: 4003,     // salon complet
  ABUS: 4004       // message trop gros ou débit excessif
};

const MAX_JOUEURS = 12;      // hôte non compris
const MAX_OCTETS = 256 * 1024;
const DEBIT_MAX = 240;       // messages par fenêtre
const DEBIT_FENETRE = 10000; // 10 s

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
  }

  /* étiquette de chaque socket : 'h' pour l'hôte, l'identifiant pour un invité */
  infos(ws) {
    try { return ws.deserializeAttachment() || {}; } catch (e) { return {}; }
  }

  hote() {
    const l = this.ctx.getWebSockets('h');
    return l.length ? l[0] : null;
  }

  invites() {
    return this.ctx.getWebSockets('g');
  }

  envoyer(ws, obj) {
    if (!ws) return false;
    try { ws.send(JSON.stringify(obj)); return true; } catch (e) { return false; }
  }

  /* l'hôte est tenu au courant de qui entre et sort */
  prevenirHote(obj) {
    this.envoyer(this.hote(), obj);
  }

  async fetch(request) {
    const url = new URL(request.url);
    const veutHote = url.searchParams.get('r') === 'h';

    const paire = new WebSocketPair();
    const client = paire[0];
    const serveur = paire[1];

    const dejaHote = this.hote();

    // Refus : on accepte quand même la socket pour pouvoir expliquer pourquoi,
    // puis on ferme avec un code que l'application sait traduire.
    if (veutHote && dejaHote) {
      serveur.accept();
      this.envoyer(serveur, { sys: 'refus', pourquoi: 'pris' });
      serveur.close(FIN.PRIS, 'code deja pris');
      return new Response(null, { status: 101, webSocket: client });
    }
    if (!veutHote && !dejaHote) {
      serveur.accept();
      this.envoyer(serveur, { sys: 'refus', pourquoi: 'inconnu' });
      serveur.close(FIN.INCONNU, 'salon inconnu');
      return new Response(null, { status: 101, webSocket: client });
    }
    if (!veutHote && this.invites().length >= MAX_JOUEURS) {
      serveur.accept();
      this.envoyer(serveur, { sys: 'refus', pourquoi: 'plein' });
      serveur.close(FIN.PLEIN, 'salon complet');
      return new Response(null, { status: 101, webSocket: client });
    }

    // identifiant stable de la connexion : 'h' pour l'hôte, g1, g2… ensuite
    let id = 'h';
    if (!veutHote) {
      let max = 0;
      for (const ws of this.invites()) {
        const n = parseInt(String(this.infos(ws).id || '').slice(1), 10);
        if (n > max) max = n;
      }
      id = 'g' + (max + 1);
    }

    // hibernation : la socket survit à la mise en veille du salon
    this.ctx.acceptWebSocket(serveur, [veutHote ? 'h' : 'g']);
    serveur.serializeAttachment({ id: id, hote: veutHote, n: 0, t0: 0 });

    this.envoyer(serveur, { sys: 'bienvenue', id: id, hote: veutHote });

    if (!veutHote) {
      this.prevenirHote({ sys: 'entre', id: id });
      // l'invité sait tout de suite qui d'autre est déjà là
      this.envoyer(serveur, { sys: 'salon', n: this.invites().length });
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws, brut) {
    const moi = this.infos(ws);

    if (typeof brut !== 'string' || brut.length > MAX_OCTETS) {
      ws.close(FIN.ABUS, 'message trop gros');
      return;
    }

    // garde-fou de débit : une boucle folle ne doit pas noyer le salon
    const now = Date.now();
    let t0 = moi.t0 || 0;
    let n = moi.n || 0;
    if (now - t0 > DEBIT_FENETRE) { t0 = now; n = 0; }
    n++;
    if (n > DEBIT_MAX) {
      ws.close(FIN.ABUS, 'debit excessif');
      return;
    }
    ws.serializeAttachment({ id: moi.id, hote: moi.hote, n: n, t0: t0 });

    let msg;
    try { msg = JSON.parse(brut); } catch (e) { return; }
    if (!msg || typeof msg !== 'object') return;

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

  webSocketClose(ws) {
    const moi = this.infos(ws);
    if (moi.hote) {
      // l'hôte s'en va : la partie s'arrête pour tout le monde
      for (const g of this.invites()) {
        this.envoyer(g, { sys: 'hote-parti' });
      }
      return;
    }
    this.prevenirHote({ sys: 'sort', id: moi.id });
  }

  webSocketError(ws) {
    this.webSocketClose(ws);
  }
}
