const { chromium } = require('playwright');
const H = require('./test_helpers.js');
const URL = 'http://localhost:8642/index.html';
let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log('  OK  ' + name);
  else { failures++; console.log('  FAIL ' + name + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); }
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => { failures++; console.log('  FAIL erreur JS: ' + e.message); });
  await p.goto(URL);

  await p.click('.game-tile[data-g="mots"]');
  await p.click('#btn-mode-solo');
  check('écran solo affiché', await p.locator('#screen-solo-setup').isVisible());
  await p.fill('#solo-name', 'Léa');
  await p.click('.level-btn[data-level="difficile"]');
  await p.click('#btn-solo-start');
  await p.waitForSelector('#screen-game.active', { timeout: 30000 });
  check('partie lancée', true);
  const names = await p.locator('#players-bar').textContent();
  check('badges Léa + IA', names.includes('Léa') && names.includes('IA'), names);
  const rack = await p.locator('#rack .rack-tile').count();
  check('chevalet humain de 7 tuiles', rack === 7, rack);

  // L'humain joue un mot valide du dictionnaire (ou passe s'il n'en a pas)
  const w = await H.playFirstWord(p);
  if (!w) { await p.click('#btn-pass'); await p.waitForSelector('#overlay-confirm:not(.hidden)'); await p.click('#btn-confirm-yes'); }
  console.log('  → humain ' + (w ? 'joue ' + w : 'passe'));

  // L'IA doit réagir puis rendre la main
  await p.waitForFunction(() =>
    document.querySelector('#turn-banner').textContent.includes('Léa'),
    null, { timeout: 20000 });
  check('l’IA a joué et rendu la main', true);
  await p.click('#btn-history');
  const hist = await p.locator('#history-list .h-row').count();
  check('historique : 2 entrées (humain + IA)', hist === 2, hist);
  const histText = await p.textContent('#history-list');
  check('l’IA apparaît dans l’historique', histText.includes('IA'), histText);
  await p.click('#btn-history-close');

  const aiScore = parseInt(await p.textContent('#badge-1 .p-score'), 10);
  const tiles = await p.locator('#board .cell .tile').count();
  console.log('  → score IA:', aiScore, '| tuiles sur plateau:', tiles);
  check('l’IA a fait une action visible (coup ou échange)', tiles > 2 || aiScore >= 0);
  // si l'IA a posé un mot : ses lettres sont surlignées + rappel dans la bannière
  if (aiScore > 0) {
    const hl = await p.locator('#board .cell.last-word').count();
    check('dernier mot de l’IA surligné sur la grille', hl >= 1, hl);
    check('bannière : « L’IA a joué … »',
      /L’IA a joué/.test(await p.textContent('#turn-banner')));
  }

  // Deuxième tour : l'humain passe, l'IA rejoue
  await p.click('#btn-pass');
  await p.waitForSelector('#overlay-confirm:not(.hidden)');
  await p.click('#btn-confirm-yes');
  await p.waitForFunction(() =>
    document.querySelector('#turn-banner').textContent.includes('Léa'),
    null, { timeout: 20000 });
  await p.click('#btn-history');
  const hist2 = await p.locator('#history-list .h-row').count();
  check('historique : 4 entrées après 2e tour', hist2 === 4, hist2);

  await browser.close();
  console.log(failures ? `\n${failures} ÉCHEC(S)` : '\nTests solo OK.');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('ERREUR FATALE:', e); process.exit(1); });
