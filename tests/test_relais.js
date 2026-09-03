/* Le relais : deux clients bruts, sans navigateur. */
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
    ws.on('message', d => { try { ws.recu.push(JSON.parse(d.toString())); } catch (e) {} });
    ws.on('open', () => res(ws));
    ws.on('error', rej);
  });
}
const pause = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const relais = await demarrer(8791);
  const U = relais.url + '/salon/';

  const hote = await ouvrir(U + 'ABC123?r=h');
  await pause(150);
  check('hôte accueilli', hote.recu.some(m => m.sys === 'bienvenue' && m.hote === true), hote.recu);

  const g1 = await ouvrir(U + 'ABC123?r=g');
  const g2 = await ouvrir(U + 'ABC123?r=g');
  await pause(200);
  check('deux invités reçoivent un identifiant distinct',
    g1.recu.some(m => m.sys === 'bienvenue' && m.id === 'g1') &&
    g2.recu.some(m => m.sys === 'bienvenue' && m.id === 'g2'));
  check('l’hôte est prévenu des arrivées',
    hote.recu.filter(m => m.sys === 'entre').map(m => m.id).join(',') === 'g1,g2',
    hote.recu.filter(m => m.sys === 'entre'));

  // invité → hôte
  g1.send(JSON.stringify({ d: { t: 'hello', name: 'Nina' } }));
  await pause(150);
  const arrive = hote.recu.find(m => m.de === 'g1' && m.d && m.d.t === 'hello');
  check('message d’un invité transmis à l’hôte, signé', !!arrive && arrive.d.name === 'Nina', arrive);

  // hôte → un invité précis
  hote.send(JSON.stringify({ a: 'g2', d: { t: 'init', secret: 42 } }));
  await pause(150);
  check('message adressé : g2 le reçoit', g2.recu.some(m => m.de === 'h' && m.d && m.d.secret === 42));
  check('message adressé : g1 ne le voit PAS', !g1.recu.some(m => m.d && m.d.secret === 42));

  // hôte → tous
  hote.send(JSON.stringify({ a: '*', d: { t: 'lobby' } }));
  await pause(150);
  check('diffusion à tous', g1.recu.some(m => m.d && m.d.t === 'lobby') &&
    g2.recu.some(m => m.d && m.d.t === 'lobby'));

  // un invité ne peut pas écrire à un autre invité
  g1.recu.length = 0; g2.recu.length = 0;
  g1.send(JSON.stringify({ a: 'g2', d: { triche: true } }));
  await pause(150);
  check('un invité ne peut PAS parler à un autre invité',
    !g2.recu.some(m => m.d && m.d.triche), g2.recu);
  check('…son message part chez l’hôte', hote.recu.some(m => m.de === 'g1' && m.d && m.d.triche));

  // code déjà pris
  const rival = new WebSocket(U + 'ABC123?r=h');
  const finRival = await new Promise(res => {
    rival.on('close', c => res(c));
    rival.on('error', () => res(-1));
  });
  check('un second hôte est refusé sur le même code (4001)', finRival === 4001, finRival);

  // code inconnu
  const perdu = new WebSocket(U + 'ZZZZ99?r=g');
  const finPerdu = await new Promise(res => {
    perdu.on('close', c => res(c));
    perdu.on('error', () => res(-1));
  });
  check('un invité sur un code inexistant est refusé (4002)', finPerdu === 4002, finPerdu);

  // départ d'un invité
  g2.close();
  await pause(250);
  check('l’hôte est prévenu du départ', hote.recu.some(m => m.sys === 'sort' && m.id === 'g2'));

  // départ de l'hôte : les invités sont prévenus
  g1.recu.length = 0;
  hote.close();
  await pause(300);
  check('les invités apprennent le départ de l’hôte', g1.recu.some(m => m.sys === 'hote-parti'));

  // message géant refusé
  const h2 = await ouvrir(U + 'GROS11?r=h');
  await pause(100);
  const finGros = await new Promise(res => {
    h2.on('close', c => res(c));
    h2.send(JSON.stringify({ a: '*', d: 'x'.repeat(300 * 1024) }));
    setTimeout(() => res(0), 2000);
  });
  check('message trop gros : connexion coupée (4004)', finGros === 4004, finGros);

  await relais.arreter();
  console.log(ko ? '\n' + ko + ' ÉCHEC(S)' : '\nTests du relais OK.');
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
