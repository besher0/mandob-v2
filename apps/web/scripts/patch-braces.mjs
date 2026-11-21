import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
const require = createRequire(import.meta.url);
let packagePath;
try { packagePath = require.resolve('braces/package.json'); }
catch (error) {
  if (error.code === 'MODULE_NOT_FOUND') process.exit(0); // production-only install
  throw error;
}
const root = dirname(packagePath);
const version = JSON.parse(readFileSync(packagePath, 'utf8')).version;
if (version !== '3.0.3') throw new Error('Review braces patch for new upstream version: ' + version);
const hashes = JSON.parse(readFileSync(new URL('../patches/braces-3.0.3-hashes.json', import.meta.url)));
const edits = [];
for (const [file, expected] of Object.entries(hashes)) {
  const path = join(root, 'lib', file);
  const current = readFileSync(path, 'utf8');
  const marker = '// medrep-braces-depth-guard-v1\n';
  let original = current;
  if (current.startsWith(marker)) {
    original = current.slice(marker.length)
      .replaceAll("      if (stack.length >= 128) throw new SyntaxError('Brace nesting exceeds local safety limits');\n", '')
      .replace("  require('./medrep-depth-guard.cjs')(ast);\n", '');
  }
  if (createHash('sha256').update(original).digest('hex') !== expected) {
    throw new Error('Unrecognized braces source; refusing to patch: ' + file);
  }
  let patched = original;
  if (file === 'parse.js') {
    patched = patched.replaceAll('      stack.push(block);', "      if (stack.length >= 128) throw new SyntaxError('Brace nesting exceeds local safety limits');\n      stack.push(block);");
  } else {
    const signature = file === 'stringify.js' ? 'module.exports = (ast, options = {}) => {' : `const ${file.slice(0, -3)} = (ast, options = {}) => {`;
    if (!patched.includes(signature)) throw new Error('Missing patch target: ' + file);
    patched = patched.replace(signature, signature + "\n  require('./medrep-depth-guard.cjs')(ast);");
  }
  edits.push([path, marker + patched]);
}
writeFileSync(join(root, 'lib', 'medrep-depth-guard.cjs'), readFileSync(new URL('../patches/braces-depth-guard.cjs', import.meta.url)));
for (const [path, content] of edits) writeFileSync(path, content);
console.log('braces 3.0.3 local depth protection applied/verified');
