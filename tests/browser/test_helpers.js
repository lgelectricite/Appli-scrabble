const ROOT = require('path').join(__dirname, '../..');
const fs = require('fs');
const ALL = fs.readFileSync(ROOT + '/data/mots.txt', 'utf8').split('\n');
const WORDS2 = new Set(ALL.filter(w => w.length === 2));

const norm = l => (l === '★' ? 'E' : l);

async function rackLetters(p) {
  return p.$$eval('#rack .rack-tile', els =>
    els.map(e => e.textContent.replace(/[0-9]/g, '').trim()));
}

async function maybeJoker(p, letter) {
  const hidden = await p.locator('#overlay-joker').evaluate(el => el.classList.contains('hidden'));
  if (!hidden) {
    await p.locator('#joker-letters button', { hasText: letter }).first().click();
  }
}

/* Joue un mot de 2 lettres valide sur les cases données. Renvoie le mot ou null. */
async function playFirstWord(p, cells = [112, 113]) {
  const letters = await rackLetters(p);
  for (let i = 0; i < letters.length; i++) {
    for (let j = 0; j < letters.length; j++) {
      if (i === j) continue;
      const w = norm(letters[i]) + norm(letters[j]);
      if (!WORDS2.has(w)) continue;
      await p.locator('#rack .rack-tile').nth(i).click();
      await p.locator(`#board .cell[data-i="${cells[0]}"]`).click();
      await maybeJoker(p, norm(letters[i]));
      const after = await rackLetters(p);
      const idx2 = after.indexOf(letters[j]);
      if (idx2 === -1) { await p.click('#btn-recall'); continue; }
      await p.locator('#rack .rack-tile').nth(idx2).click();
      await p.locator(`#board .cell[data-i="${cells[1]}"]`).click();
      await maybeJoker(p, norm(letters[j]));
      await p.click('#btn-play');
      return w;
    }
  }
  return null;
}

/* Pose une lettre sous une case occupée pour former un mot vertical valide. */
async function playCrossLetter(p, baseCell, targetCell) {
  const base = await p.$eval('#board .cell[data-i="' + baseCell + '"] .tile',
    e => e.textContent.replace(/[0-9]/g, '').trim());
  const letters = await rackLetters(p);
  for (let i = 0; i < letters.length; i++) {
    const L = norm(letters[i]);
    if (!WORDS2.has(base + L)) continue;
    await p.locator('#rack .rack-tile').nth(i).click();
    await p.locator(`#board .cell[data-i="${targetCell}"]`).click();
    await maybeJoker(p, L);
    await p.click('#btn-play');
    return base + L;
  }
  return null;
}

async function passTurn(p) {
  await p.click('#btn-pass');
  await p.waitForSelector('#overlay-confirm:not(.hidden)');
  await p.click('#btn-confirm-yes');
}

module.exports = { WORDS2, rackLetters, playFirstWord, playCrossLetter, passTurn, maybeJoker };
