# Dev Env Issues

## October 17, 2026 — Cursor TypeScript differed from check

After package separation, both editor SDK settings still pointed at the nonexistent `ts/node_modules/typescript/lib`. The SDK installed by setup lives at `ts/CLIs/node_modules/typescript/lib`. Cursor's active language status showed the correct `ts/shared/tsconfig.json` project but TypeScript Nightly `5.3.0-dev.20230808`, supplied by an installed extension.

Correcting the SDK settings and selecting workspace TypeScript 5.9.3 cleared the Terminal.ts diagnostic. The same source passed every package check without the added Node stream assertions. No ambient-type changes or root project-reference configuration were necessary. The check workflow now rejects missing/mismatched SDKs, compiler-version drift and experimental Native Preview settings. SDK settings prompt for selection; the actual language-service choice remains editor workspace state.

Cursor visibly reported TypeScript 5.9.3 and No Problems. Full check and verify passed, with 77 tests passing and one sandbox-only filesystem-watch test skipped. Other dirty shell-setup and legacy edits were preserved.
