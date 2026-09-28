/* Le relais, version 2 : la partie survit aux coupures (clients bruts, sans navigateur). */
const { demarrer } = require('./relais-local.js');
const WebSocket = require('ws');
let ko = 0;
function check(n, c, e) {
  if (c) console.log('  OK  ' + n);
  else { ko++; console.log('  FAIL ' + n + (e !== undefined ? ' -> ' + JSON.stringify(e) : '')); }
}
function ouvrir(url) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(url);
    ws.recu = [];
    ws.brut = [];
    ws.fin = null;
    ws.on('message', d => {
      const t = d.toString();
      ws.brut.push(t);
      try { ws.recu.push(JSON.parse(t)); } catch (e) {}
    });
    ws.on('close', c => { ws.fin = c; });
    ws.on('open', () => res(ws));
    ws.on('error', rej);
  });
}
function fermeture(ws) {
  return new Promise(res => {
    if (ws.fin !== null) return res(ws.fin);
    ws.on('close', c => res(c));
    setTimeout(() => res(ws.fin === null ? 0 : ws.fin), 3000);
  });
}
const pause = ms => new Promise(r => setTimeout(r, ms));
const CLE_H = 'hote-secret-0123456789';

(async () => {
  const relais = await demarrer(8793, { grace: 1500 });
  const U = relais.url + '/salon/';

  console.log('--- signal de vie ---');
  const h = await ouvrir(U + 'VIE222?r=h&k=' + CLE_H);
  h.send('ping');
  await pause(120);
  check('« ping » reçoit « pong »', h.brut.indexOf('pong') !== -1, h.brut);
  const presents0 = h.recu.find(m => m.sys === 'presents');
  check('l’hôte reçoit la liste des présents (vide)', !!presents0 && presents0.ids.length === 0, presents0);

  console.log('--- micro-coupure de l’hôte ---');
  const g1 = await ouvrir(U + 'VIE222?r=g&k=invite-un-0001');
  const g2 = await ouvrir(U + 'VIE222?r=g&k=invite-deux-002');
  await pause(150);
  h.terminate(); // coupure brutale (1006) : ni adieu, ni fermeture propre
  await pause(200);
  check('les invités sont prévenus que l’hôte s’est absenté',
    g1.recu.some(m => m.sys === 'hote-absent') && g2.recu.some(m => m.sys === 'hote-absent'));
  check('…mais PAS que la partie est finie', !g1.recu.some(m => m.sys === 'hote-parti'));

  // un inconnu ne peut pas s'emparer du code pendant l'absence
  const pirate = await ouvrir(U + 'VIE222?r=h&k=pas-la-bonne-cle');
  check('un autre téléphone ne peut pas prendre la place de l’hôte (4001)',
    (await fermeture(pirate)) === 4001);
  const sansCle = await ouvrir(U + 'VIE222?r=h');
  check('ni un téléphone sans clé', (await fermeture(sansCle)) === 4001);

  // un invité arrive pendant l'absence : accepté, et prévenu
  const g3 = await ouvrir(U + 'VIE222?r=g&k=invite-trois-03');
  await pause(120);
  check('un invité peut entrer pendant l’absence de l’hôte',
    g3.recu.some(m => m.sys === 'bienvenue' && m.id === 'g3'), g3.recu);
  check('…et il sait que l’hôte revient', g3.recu.some(m => m.sys === 'hote-absent'));

  const h2 = await ouvrir(U + 'VIE222?r=h&k=' + CLE_H);
  await pause(150);
  check('l’hôte reprend SON code avec sa clé', h2.recu.some(m => m.sys === 'bienvenue' && m.hote));
  const pres = h2.recu.find(m => m.sys === 'presents');
  check('l’hôte revenu sait qui est là', !!pres && pres.ids.join(',') === 'g1,g2,g3', pres);
  check('les invités sont prévenus du retour',
    g1.recu.some(m => m.sys === 'hote-revenu') && g3.recu.some(m => m.sys === 'hote-revenu'));
  g1.send(JSON.stringify({ d: { t: 'coucou' } }));
  h2.send(JSON.stringify({ a: 'g2', d: { t: 'pour-g2' } }));
  await pause(150);
  check('les messages repassent dans les deux sens',
    h2.recu.some(m => m.de === 'g1' && m.d && m.d.t === 'coucou') &&
    g2.recu.some(m => m.d && m.d.t === 'pour-g2'));
  await pause(1700);
  check('le retour a annulé la fin programmée', !g1.recu.some(m => m.sys === 'hote-parti'));

  console.log('--- connexion fantôme de l’hôte (changement de réseau) ---');
  // l'ancienne connexion est encore ouverte côté serveur : la même clé la remplace
  const h3 = await ouvrir(U + 'VIE222?r=h&k=' + CLE_H);
  await pause(150);
  check('le même hôte reprend la main malgré sa vieille connexion',
    h3.recu.some(m => m.sys === 'bienvenue' && m.hote));
  check('la vieille connexion est fermée (4005)', (await fermeture(h2)) === 4005);
  g2.recu.length = 0;
  h3.send(JSON.stringify({ a: '*', d: { t: 'toujours-la' } }));
  g2.send(JSON.stringify({ d: { t: 'vers-h3' } }));
  await pause(150);
  check('les invités parlent au nouvel hôte',
    h3.recu.some(m => m.de === 'g2' && m.d && m.d.t === 'vers-h3') &&
    g2.recu.some(m => m.d && m.d.t === 'toujours-la'));
  check('personne n’a cru la partie finie', !g2.recu.some(m => m.sys === 'hote-parti' || m.sys === 'hote-absent'));

  console.log('--- connexion fantôme d’un invité ---');
  h3.recu.length = 0;
  const g1bis = await ouvrir(U + 'VIE222?r=g&k=invite-un-0001');
  await pause(150);
  check('le même invité revient avec un NOUVEL identifiant (jamais réutilisé)',
    g1bis.recu.some(m => m.sys === 'bienvenue' && m.id === 'g4'), g1bis.recu);
  check('sa vieille connexion est fermée (4005)', (await fermeture(g1)) === 4005);
  check('l’hôte voit l’ancienne sortir et la nouvelle entrer',
    h3.recu.some(m => m.sys === 'sort' && m.id === 'g1') &&
    h3.recu.some(m => m.sys === 'entre' && m.id === 'g4'), h3.recu);

  console.log('--- débit ---');
  const hD = await ouvrir(U + 'DEBIT2?r=h&k=' + CLE_H + 'x');
  const gD = await ouvrir(U + 'DEBIT2?r=g&k=invite-debit-01');
  await pause(100);
  for (let i = 0; i < 1200; i++) hD.send(JSON.stringify({ a: '*', d: { i: i } }));
  await pause(600);
  check('l’hôte peut écrire 1 200 messages en 10 s (12 invités)', hD.fin === null && hD.readyState === 1, hD.fin);
  check('…qui arrivent tous', gD.recu.filter(m => m.d && typeof m.d.i === 'number').length === 1200);
  for (let i = 0; i < 300; i++) gD.send(JSON.stringify({ d: { spam: i } }));
  check('un invité qui inonde est coupé, lui seul (4004)', (await fermeture(gD)) === 4004);
  check('l’hôte, lui, reste connecté', hD.readyState === 1);

  console.log('--- fins de partie ---');
  const hF = await ouvrir(U + 'ADIEU2?r=h&k=' + CLE_H + 'y');
  const gF = await ouvrir(U + 'ADIEU2?r=g');
  await pause(100);
  hF.send(JSON.stringify({ sys: 'fin' }));
  await pause(200);
  check('l’hôte qui quitte volontairement prévient tout de suite', gF.recu.some(m => m.sys === 'hote-parti'));
  const gF2 = new WebSocket(U + 'ADIEU2?r=g');
  const finF2 = await new Promise(res => { gF2.on('close', c => res(c)); gF2.on('error', () => res(-1)); });
  check('…et le code est libéré (4002 pour un nouvel invité)', finF2 === 4002, finF2);

  const hA = await ouvrir(U + 'ABSENT?r=h&k=' + CLE_H + 'z');
  const gA = await ouvrir(U + 'ABSENT?r=g');
  await pause(100);
  hA.terminate();
  await pause(400);
  check('absence : la partie n’est pas finie tout de suite', !gA.recu.some(m => m.sys === 'hote-parti'));
  await pause(1600);
  check('hôte jamais revenu : fin annoncée après le délai', gA.recu.some(m => m.sys === 'hote-parti'));

  await relais.arreter();
  console.log(ko ? '\n' + ko + ' ÉCHEC(S)' : '\nTests du relais (v2) OK.');
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
