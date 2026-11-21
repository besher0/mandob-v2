'use strict';

// Validate without recursion before entering the upstream recursive walkers.
// Parent/prev references are intentionally excluded; only child nodes are walked.
module.exports = function guard(ast) {
  const pending = [[ast, 0]];
  const seen = new WeakSet();
  let count = 0;
  while (pending.length) {
    const [node, depth] = pending.pop();
    if (!node || typeof node !== 'object') continue;
    if (depth > 128 || ++count > 100000 || seen.has(node)) {
      throw new SyntaxError('Brace AST exceeds local safety limits');
    }
    seen.add(node);
    if (Array.isArray(node.nodes)) {
      for (const child of node.nodes) pending.push([child, depth + 1]);
    }
  }
};
