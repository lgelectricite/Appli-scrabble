/*
 * Fait tourner le VRAI relais (relay/src/index.js) sous Node, pour les tests.
 *
 * Cloudflare fournit WebSocketPair, Response(101), l'hibernation, le
 * stockage du salon, les alarmes et la réponse automatique au « ping » ;
 * on les imite ici au-dessus d'un serveur WebSocket ordinaire, de façon à
 * tester le code réellement déployé plutôt qu'une imitation.
 *
 *   const { demarrer } = require('./relais-local.js');
 *   const relais = await demarrer(8790);   // → { url, arreter() }
 *   const relais = await demarrer(8790, { grace: 3000 }); // attente de l'hôte raccourcie
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

globalThis.WebSocketRequestResponsePair = class {
  constructor(requete, reponse) { this.requete = requete; this.reponse = reponse; }
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
function ctxPourSalon(opts) {
  const sockets = new Map(); // socket -> tags
  const stock = new Map();
  let alarme = null;
  const ctx = {
    salon: null,
    auto: null,
    acceptWebSocket(ws, tags) { sockets.set(ws, tags || []); },
    getWebSockets(tag) {
      const out = [];
      for (const [ws, tags] of sockets) {
        if (!tag || tags.indexOf(tag) !== -1) out.push(ws);
      }
      return out;
    },
    setWebSocketAutoResponse(paire) { ctx.auto = paire; },
    storage: {
      async get(k) { return stock.has(k) ? JSON.parse(JSON.stringify(stock.get(k))) : undefined; },
      async put(k, v) { stock.set(k, JSON.parse(JSON.stringify(v))); },
      async delete(k) { return stock.delete(k); },
      async deleteAll() { stock.clear(); },
      async setAlarm(t) {
        if (alarme) clearTimeout(alarme.minuteur);
        let quand = typeof t === 'number' ? t : t.getTime();
        // attente de l'hôte raccourcie pour les tests
        if (opts.grace) quand = Math.min(quand, Date.now() + opts.grace);
        alarme = { quand: quand, minuteur: setTimeout(() => {
          alarme = null;
          Promise.resolve(ctx.salon && ctx.salon.alarm && ctx.salon.alarm()).catch(() => {});
        }, Math.max(0, quand - Date.now())) };
      },
      async deleteAlarm() { if (alarme) { clearTimeout(alarme.minuteur); alarme = null; } },
      async getAlarm() { return alarme ? alarme.quand : null; }
    },
    _oublier(ws) { sockets.delete(ws); },
    _vide() { return sockets.size === 0 && stock.size === 0 && !alarme; }
  };
  return ctx;
}

async function demarrer(port, opts) {
  opts = opts || {};
  const { Salon } = await import('file://' + path.join(__dirname, '..', 'relay', 'src', 'index.js'));
  const { WebSocketServer } = require('ws');

  const salons = new Map(); // CODE -> { salon, ctx }
  const serveur = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Relais GGgames (local) — en service.\n');
  });
  const wss = new WebSocketServer({ server: serveur });

  // chaque salon traite ses évènements l'un après l'autre, comme un Durable Object
  function enFile(entree, tache) {
    entree.file = entree.file.then(tache).catch(() => {});
    return entree.file;
  }

  wss.on('connection', (brut, req) => {
    const url = new URL(req.url, 'http://local');
    const m = url.pathname.match(/^\/salon\/([^/]+)$/);
    if (!m) { brut.close(); return; }
    const code = decodeURIComponent(m[1]).toUpperCase();
    if (!/^[A-Z0-9]{4,8}$/.test(code)) { brut.close(); return; }

    if (!salons.has(code)) {
      const ctx = ctxPourSalon(opts);
      const salon = new Salon(ctx, {});
      ctx.salon = salon;
      salons.set(code, { salon: salon, ctx: ctx, file: Promise.resolve() });
    }
    const entree = salons.get(code);
    const { salon, ctx } = entree;

    // adaptateur : la socket telle que le relais s'attend à la manipuler
    const ws = {
      _attache: null,
      accept() {},
      send(txt) { if (brut.readyState === 1) brut.send(txt); },
      close(code2, motif) { try { brut.close(code2 || 1000, motif || ''); } catch (e) {} },
      serializeAttachment(v) { this._attache = v; },
      deserializeAttachment() { return this._attache; }
    };

    const faussereq = {
      url: 'https://local' + req.url,
      headers: { get: (n) => (n.toLowerCase() === 'upgrade' ? 'websocket' : null) }
    };
    enFile(entree, () => { socketEnAttente = ws; return salon.fetch(faussereq); });

    brut.on('message', (d) => {
      const txt = d.toString();
      if (ctx.auto && txt === ctx.auto.requete) { ws.send(ctx.auto.reponse); return; }
      enFile(entree, () => salon.webSocketMessage(ws, txt));
    });
    brut.on('close', (codeFin) => {
      enFile(entree, async () => {
        try { await salon.webSocketClose(ws, codeFin); } catch (e) {}
        ctx._oublier(ws);
        // salon vide et sans rien en attente : on l'oublie, comme Cloudflare
        if (ctx._vide() && salons.get(code) === entree) salons.delete(code);
      });
    });
  });

  await new Promise((res) => serveur.listen(port, '127.0.0.1', res));
  return {
    url: 'ws://127.0.0.1:' + port,
    salons: salons,
    arreter: () => new Promise((res) => {
      wss.clients.forEach((c) => { try { c.terminate(); } catch (e) {} });
      for (const [, e] of salons) { try { e.ctx.storage.deleteAlarm(); } catch (x) {} }
      wss.close(() => serveur.close(() => res()));
    })
  };
}

module.exports = { demarrer };
