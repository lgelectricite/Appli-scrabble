/*
 * Toute la vérification, d'une seule commande :
 *
 *   node tests/tout.js            # tests de logique + tests navigateur
 *   node tests/tout.js logique    # seulement les tests de logique (rapide)
 *   node tests/tout.js test_v2    # seulement les suites dont le nom contient « test_v2 »
 *
 * Un petit serveur local sert l'application (port GG_PORT, 8642 par défaut)
 * le temps des tests navigateur. Chaque suite tourne à part ; le résumé
 * final dit lesquelles ont échoué (journaux complets dans GG_JOURNAUX).
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const RACINE = path.join(__dirname, '..');
const PORT = parseInt(process.env.GG_PORT || '8642', 10);
const JOURNAUX = process.env.GG_JOURNAUX || path.join(require('os').tmpdir(), 'gg-tests');
const filtre = process.argv[2] || '';
fs.mkdirSync(JOURNAUX, { recursive: true });

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8'
};

function serveur() {
  return new Promise((res) => {
    const srv = http.createServer((req, rep) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      const f = path.join(RACINE, path.normalize(p));
      if (!f.startsWith(RACINE)) { rep.writeHead(403); rep.end(); return; }
      fs.readFile(f, (err, data) => {
        if (err) { rep.writeHead(404); rep.end('introuvable'); return; }
        rep.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
        rep.end(data);
      });
    });
    srv.on('error', () => res(null)); // port déjà servi (serveur lancé à la main) : on s'en sert
    srv.listen(PORT, '127.0.0.1', () => res(srv));
  });
}

function lancer(fichier) {
  return new Promise((res) => {
    const nom = path.basename(fichier, '.js');
    const journal = fs.createWriteStream(path.join(JOURNAUX, nom + '.log'));
    const t0 = Date.now();
    const env = Object.assign({}, process.env, {
      GG_URL: process.env.GG_URL || ('http://localhost:' + PORT + '/index.html')
    });
    const p = spawn(process.execPath, [fichier], { cwd: RACINE, env: env });
    p.stdout.pipe(journal); p.stderr.pipe(journal);
    const limite = setTimeout(() => { try { p.kill('SIGKILL'); } catch (e) {} }, 15 * 60000);
    p.on('close', (code) => {
      clearTimeout(limite);
      res({ nom: nom, ok: code === 0, s: Math.round((Date.now() - t0) / 1000) });
    });
  });
}

(async () => {
  const logique = fs.readdirSync(__dirname)
    .filter(f => /^test_.*\.js$/.test(f)).map(f => path.join(__dirname, f));
  const navigateur = filtre === 'logique' ? [] : fs.readdirSync(path.join(__dirname, 'browser'))
    .filter(f => /^test_.*\.js$/.test(f) && f !== 'test_helpers.js')
    .map(f => path.join(__dirname, 'browser', f));
  let suites = logique.concat(navigateur);
  if (filtre && filtre !== 'logique') suites = suites.filter(f => path.basename(f).indexOf(filtre) !== -1);

  const srv = navigateur.length ? await serveur() : null;
  const resultats = [];
  for (const f of suites) {
    const r = await lancer(f);
    resultats.push(r);
    console.log((r.ok ? '  OK   ' : '  ÉCHEC ') + r.nom + ' (' + r.s + ' s)');
  }
  if (srv) srv.close();
  const ko = resultats.filter(r => !r.ok);
  console.log('\n' + (resultats.length - ko.length) + '/' + resultats.length + ' suites réussies' +
    (ko.length ? ' — à revoir : ' + ko.map(r => r.nom).join(', ') + ' (journaux : ' + JOURNAUX + ')' : '.'));
  process.exit(ko.length ? 1 : 0);
})();
