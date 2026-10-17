# Rules

- CLIs use command commander
- CLI commands can declare other commands they depend on, similar to how `justfiles` can
- Each CLI command lives in its CLI's `commands/<command-name>.ts` file; the agent CLI reuses dev commands when available.
- Inline command implementations in their action callbacks; extract a function only when the body would be too long.
- Register every command with `registerCommand({ name, description, arguments, action })`; the shared wrapper catches action failures, sets the exit code, and renders errors through `Errors.ts` or a best-effort fallback. Keep setup registration usable before Commander is installed.
- Command modules use `export default registerCommand(...)`.
- Only the shared action executor sets `process.exitCode`; actions return an exit status or throw.
- Only developer-selected commands appear in the root Justfile; the agent CLI invokes TypeScript commands directly.
