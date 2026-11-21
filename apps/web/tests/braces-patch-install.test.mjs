import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

test('patch installs on pristine files, is repeatable, and rejects unexpected source without partial writes', () => {
  const require = createRequire(import.meta.url);
  const fixture = mkdtempSync(join(tmpdir(), 'medrep-braces-'));
  try {
    cpSync(new URL('../scripts', import.meta.url), join(fixture, 'scripts'), { recursive:true });
    cpSync(new URL('../patches', import.meta.url), join(fixture, 'patches'), { recursive:true });
    const lib = join(fixture, 'node_modules/braces/lib');
    cpSync(dirname(require.resolve('braces/package.json')), dirname(lib), { recursive:true });
    const names = ['parse.js', 'compile.js', 'expand.js', 'stringify.js'];
    for (const name of names) {
      const path = join(lib, name);
      const original = readFileSync(path,'utf8')
        .replace('// medrep-braces-depth-guard-v1\n','')
        .replaceAll("      if (stack.length >= 128) throw new SyntaxError('Brace nesting exceeds local safety limits');\n",'')
        .replace("  require('./medrep-depth-guard.cjs')(ast);\n",'');
      writeFileSync(path, original);
    }
    rmSync(join(lib,'medrep-depth-guard.cjs'), {force:true});
    const run = () => spawnSync(process.execPath, [join(fixture,'scripts/patch-braces.mjs')], {encoding:'utf8'});
    let result=run();assert.equal(result.status,0,result.stderr);
    const patched=names.map(name=>readFileSync(join(lib,name),'utf8'));
    result=run();assert.equal(result.status,0,result.stderr);
    assert.deepEqual(names.map(name=>readFileSync(join(lib,name),'utf8')),patched);
    writeFileSync(join(lib,'expand.js'),patched[2]+'\n// unexpected change\n');
    result=run();assert.notEqual(result.status,0);
    assert.match(result.stderr,/Unrecognized braces source/);
    assert.equal(readFileSync(join(lib,'parse.js'),'utf8'),patched[0]);
    assert.equal(readFileSync(join(lib,'compile.js'),'utf8'),patched[1]);
  } finally { rmSync(fixture,{recursive:true,force:true}); }
});
