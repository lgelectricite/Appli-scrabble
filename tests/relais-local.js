/*
 * Fait tourner le VRAI relais (relay/src/index.js) sous Node, pour les tests.
 *
 * Cloudflare fournit WebSocketPair, Response(101) et l'hibernation ; on les
 * imite ici au-dessus d'un serveur WebSocket ordinaire, de façon à tester le
 * code réellement déployé plutôt qu'une imitation.
 *
 *   const { demarrer } = require('./relais-local.js');
 *   const relais = await demarrer(8790);   // → { url, arreter() }
 */
const http = require('http');
const path = require('path');

/* ---------- imitation de l'environnement Cloudflare ---------- */

let socketEnAttente = null; // la vraie socket, donnée au Salon par WebSocketPair

globalThis.WebSocketPair = function () {
  const paire = [{ client: true }, socketEnAttente];
  paire[0] = { client: true };
  return paire;
};

const VraieResponse = globalThis.Response;
globalThis.Response = class extends VraieResponse {
  constructor(corps, init) {
    const i = init || {};
    if (i.status === 101) {
      super(null, { status: 200 });
      this._upgrade = true;
      this.webSocket = i.webSocket;
      return;
    }
    super(corps, i);
  }
};

/* Un salon vit dans un « Durable Object » : ici, un objet par code. */
function ctxPourSalon() {
  const sockets = new Map(); // socket -> tags
  return {
    acceptWebSocket(ws, tags) { sockets.set(ws, tags || []); },
    getWebSockets(tag) {
      const out = [];
      for (const [ws, tags] of sockets) {
        if (!tag || tags.indexOf(tag) !== -1) out.push(ws);
      }
      return out;
    },
    _oublier(ws) { sockets.delete(ws); }
  };
}

async function demarrer(port) {
  const { Salon } = await import('file://' + path.join(__dirname, '..', 'relay', 'src', 'index.js'));
  const { WebSocketServer } = require('ws');

  const salons = new Map(); // CODE -> { salon, ctx }
  const serveur = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Relais GGgames (local) — en service.\n');
  });
  const wss = new WebSocketServer({ server: serveur });

  wss.on('connection', (brut, req) => {
    const url = new URL(req.url, 'http://local');
    const m = url.pathname.match(/^\/salon\/([^/]+)$/);
    if (!m) { brut.close(); return; }
    const code = decodeURIComponent(m[1]).toUpperCase();
    if (!/^[A-Z0-9]{4,8}$/.test(code)) { brut.close(); return; }

    if (!salons.has(code)) {
      const ctx = ctxPourSalon();
      salons.set(code, { salon: new Salon(ctx, {}), ctx: ctx });
    }
    const { salon, ctx } = salons.get(code);

    // adaptateur : la socket telle que le relais s'attend à la manipuler
    const ws = {
      _attache: null,
      accept() {},
      send(txt) { if (brut.readyState === 1) brut.send(txt); },
      close(code2, motif) { try { brut.close(code2 || 1000, motif || ''); } catch (e) {} },
      serializeAttachment(v) { this._attache = v; },
      deserializeAttachment() { return this._attache; }
    };

    socketEnAttente = ws;
    const faussereq = {
      url: 'https://local' + req.url,
      headers: { get: (n) => (n.toLowerCase() === 'upgrade' ? 'websocket' : null) }
    };
    Promise.resolve(salon.fetch(faussereq)).catch(() => {});

    brut.on('message', (d) => {
      try { salon.webSocketMessage(ws, d.toString()); } catch (e) {}
    });
    brut.on('close', () => {
      try { salon.webSocketClose(ws); } catch (e) {}
      ctx._oublier(ws);
      // salon vide : on l'oublie, comme le fait Cloudflare
      if (ctx.getWebSockets().length === 0) salons.delete(code);
    });
  });

  await new Promise((res) => serveur.listen(port, '127.0.0.1', res));
  return {
    url: 'ws://127.0.0.1:' + port,
    salons: salons,
    arreter: () => new Promise((res) => {
      wss.clients.forEach((c) => { try { c.terminate(); } catch (e) {} });
      wss.close(() => serveur.close(() => res()));
    })
  };
}

module.exports = { demarrer };
