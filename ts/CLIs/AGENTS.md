# Rules

- CLIs use command commander
- CLI commands can declare other commands they depend on, similar to how `justfiles` can
- Each CLI command lives in its CLI's `commands/<command-name>.ts` file; the agent CLI reuses dev commands when available.
- Only developer-selected commands appear in the root Justfile; the agent CLI invokes TypeScript commands directly.
