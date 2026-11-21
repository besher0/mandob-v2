import assert from "node:assert/strict";
import { test } from "node:test";
import { ESLint } from "eslint";

// Next's getRootDirs invokes fast-glob/braces only with settings.next.rootDir.
// Leave it unset: the plugin uses context.cwd without parsing a glob.
test("Next lint rules remain enabled without vulnerable root-directory glob parsing", async () => {
  const config = await new ESLint().calculateConfigForFile("src/app/page.tsx");
  assert.equal(config.settings?.next?.rootDir, undefined);
  assert.ok(Object.keys(config.rules).some(name => name.startsWith("@next/next/")));
});
