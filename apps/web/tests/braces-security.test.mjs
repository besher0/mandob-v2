import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const braces = require('braces');
test('rejects deeply nested balanced/unbalanced braces and parentheses', () => {
  for (const pattern of ['{'.repeat(3000)+'x'+'}'.repeat(3000), '{'.repeat(3000)+'x', '('.repeat(3000)+'x'+')'.repeat(3000)]) {
    for (const method of [braces, braces.parse, braces.compile, braces.expand, braces.stringify]) {
      assert.throws(()=>method(pattern), error=>error instanceof SyntaxError && /local safety limits/.test(error.message));
    }
  }
});
test('direct AST calls cannot bypass protection, including child cycles', () => {
  let ast = {type:'text',value:'x'};
  for (let i=0;i<1000;i++) ast={type:'root',nodes:[ast]};
  const cyclic={type:'root',nodes:[]};cyclic.nodes.push(cyclic);
  for(const method of [braces.compile,braces.expand,braces.stringify]) {
    for(const input of [ast,cyclic]) assert.throws(()=>method(input),SyntaxError);
  }
});
test('normal expansion, compilation and escaped literals remain compatible', () => {
  assert.deepEqual(braces.expand('src/{app,lib}/*.{ts,tsx}'), ['src/app/*.ts','src/app/*.tsx','src/lib/*.ts','src/lib/*.tsx']);
  assert.deepEqual(braces.expand('{1..3}'), ['1','2','3']);
  assert.equal(braces.compile('a/{b,c}'), 'a/(b|c)');
  assert.equal(braces.stringify(braces.parse('a/{b,c}')), 'a/{b,c}');
  assert.deepEqual(braces.expand('a/\\{literal\\}'), ['a/{literal}']);
});
