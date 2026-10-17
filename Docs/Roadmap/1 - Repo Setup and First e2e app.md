# 1 - Repo Setup and First e2e app

Use the process described in `AGENTS.md` to implement the goals.

## Goal 1

Get the `old-tao-v1/` PoC working again:

- [x] Get tests running inside of `old-tao-v1/` folder again.
- [x] Changes outside of that folder should be minimal.

Run legacy commands from `old-tao-v1/`: `just setup-tools` builds its pinned tool profile,
and `just test-all` runs the ordinary package, runtime, Tao app, and language performance tests.
Shared formatter dependencies live in `ts/`; install them with `just setup` from the Git root
(or `just setup-ts` from the PoC).
Repository agent configuration stays at the Git root.
Generated artifacts share the root `.artifacts/` directory. The PoC's `.artifacts` is a compatibility
link; its `.devenv` links to root `.devenv/old-tao-v1/`, keeping its full shell separate from the disabled
root shell without another generated directory inside the PoC.

Root `just test` and `just check` pass; `check` includes TypeScript checking. The PoC ordinary suite
passes: 36 suites, 10,520 passed tests, zero failures (18 existing skipped/todo tests).
Evidence: `.artifacts/logs/dev-test/2026-10-17T15-24-00-675Z-96249-65abc9db/summary.json`.
The remaining PoC process-lifetime test now passes:
Darwin zombie-only groups are checked through complete kernel inspection after an `EPERM` probe.
GitHub workflow path checks pass locally; hosted CI has not run.

## Goal 2

Implement a first e2e Hello World app:

- [ ] Implement basic treesitter parser
- [ ] Implement basic treesitter CST to AST transformer
- [ ] Implement basic AST to code generator
- [ ] Implement basic expo runtime
- [ ] Write a basic test that checks "Hello World" is showing in the app
- [ ] Implement basic testing framework

### Minimal first app

```tao
app HelloWorld {
    Root RootView
}

view RootView {
    render Col {
        Text("Hello World")
    }
}
```
