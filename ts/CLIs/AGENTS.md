# CLI behavior

- Root `AGENTS.md` owns conformity and style, including command registration and failure handling.
- Global CLI handlers report uncaught exceptions and unhandled rejections with yellow stacks first, red error details afterward, and the command error status when present, otherwise 1. Preserve terminal and agent-log output; command actions propagate failures without message rewriting.
- Keep setup registration usable before Commander is installed.
- CLI commands may declare command dependencies; the agent CLI invokes TypeScript commands directly.
