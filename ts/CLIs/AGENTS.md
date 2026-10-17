# CLI behavior

- Root `AGENTS.md` owns conformity and style, including command registration and failure handling.
- The shared action executor renders failures through `Errors.ts` or a best-effort fallback.
- Keep setup registration usable before Commander is installed.
- CLI commands may declare command dependencies; the agent CLI invokes TypeScript commands directly.
