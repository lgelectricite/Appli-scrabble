/*
 * Le garde-fou le plus bête et le plus utile : TOUS les fichiers JavaScript
 * livrés doivent se parser.
 *
 * Une apostrophe droite glissée dans un texte français entre apostrophes
 * (« d'une main ») casse le fichier entier — donc un jeu — sans qu'aucun
 * autre test ne s'en aperçoive tant que ce fichier n'est pas chargé.
 * On délègue à `node --check`, qui sait lire aussi bien les scripts que les
 * modules ES (le relais).
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

let failures = 0;

function lister(dir, acc) {
  for (const nom of fs.readdirSync(dir)) {
    if (nom === 'node_modules' || nom === '.git') continue;
    const p = path.join(dir, nom);
    if (fs.statSync(p).isDirectory()) lister(p, acc);
    else if (nom.endsWith('.js')) acc.push(p);
  }
  return acc;
}

const fichiers = lister(ROOT, []).sort();
console.log('--- Syntaxe de ' + fichiers.length + ' fichiers JavaScript ---');

fichiers.forEach(function (f) {
  const rel = path.relative(ROOT, f);
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
  } catch (e) {
    failures++;
    const sortie = String(e.stderr || e.message).split('\n')
      .filter(function (l) { return /SyntaxError|Error:/.test(l); })[0] || 'erreur de syntaxe';
    console.log('  FAIL ' + rel + ' → ' + sortie.trim());
  }
});

if (!failures) console.log('  OK  les ' + fichiers.length + ' fichiers se parsent');
console.log(failures ? '\n' + failures + ' ÉCHEC(S)' : '\nSyntaxe OK.');
process.exit(failures ? 1 : 0);
