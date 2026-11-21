# Development dependency advisory — 2026-10-13

GHSA-vfj7-8cjw-p6xm affects braces <=3.0.3. The published latest version checked today is 3.0.3 and the advisory lists no patched release.
Five npm audit entries describe one dependency chain:
eslint-config-next -> @next/eslint-plugin-next -> fast-glob -> micromatch -> braces.

Next 16.4.0 still depends on fast-glob 3.3.1. npm's suggested downgrade to eslint-config-next 14.2.35 is not adopted because this app uses Next 16.
No audit suppression, package removal or forced downgrade is applied.

Current exposure:
The installed plugin uses fast-glob only in getRootDirs when settings.next.rootDir is a string or string array. Our configuration leaves that setting unset, using context.cwd without glob parsing. This is exposure analysis for the current lint path, not a patch to braces or a claim all potential dependency paths are safe.
npm run test:lint-security checks effective configuration leaves rootDir unset while retaining Next rules.
Do not introduce dynamic/untrusted rootDir patterns. Development/CI source and lint configuration must be trusted.
Replace the affected dependency with an upstream compatible fix when available; the five audit entries remain open.
Runtime web audit is separately clean as of the preceding verification.

## Local mitigation applied
The project now carries scripts/patch-braces.mjs and patches/braces-depth-guard.cjs.
- Parser nesting is limited to 128 stack entries before recursive walkers run.
- compile/expand/stringify validate AST child depth, node budget and repeated/cyclic children iteratively, including callers supplying ASTs directly.
- Deep or cyclic inputs are rejected with SyntaxError. Callers processing untrusted patterns must catch errors; this patch does not make arbitrary pattern processing or unlimited expansion safe.
- postinstall, prelint, prebuild and predev reapply/verify the patch. If scripts are disabled, run node scripts/patch-braces.mjs explicitly. Direct npx commands bypass npm lifecycle guards.
- Original source hashes/version are pinned; changed upstream files cause a fail-closed patch error requiring review. Production-only installs without braces are skipped.
- npm run test:braces-security covers 3,000-level strings, malformed/unclosed strings, direct deep/cyclic ASTs and normal expansion/compilation. All passed, along with lint, React regression and production build.
- Audit still reports the upstream version: this is a local mitigation, not an official upstream release, and should be removed/reviewed when an official compatible fix ships.
