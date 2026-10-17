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

The complete final-layout ordinary suite passes: 36 suites, 10,527 passing tests, zero failures,
and 18 existing skipped/todo tests. Run: `./agent test-all --max-lines 35` inside `old-tao-v1/`.
Evidence: `.artifacts/logs/dev-test/2026-10-17T16-15-00-487Z-63720-4dbddb24/summary.json`.
Root tests pass 8/8; root `./agent check` and legacy TypeScript checking pass. Root frozen setup
also passes without dependency changes.

Root `./agent check` and `./agent fmt` reuse the dev CLI's command registration. Formatting uses
the repository config and repository-relative arguments. An isolated integration test checks both
entrypoints' formatting and typecheck failure propagation; setup works before Commander is installed.
Root commands currently require Bun and dprint on PATH; the root JavaScript toolchain remains disabled.
The Linux bootstrap uses the relocated pinned tool definitions for root setup and keeps CI
verification setup in the legacy workspace. Cursor's Linux and macOS dispatch and failure exits
are covered by local fixtures; fresh-host setup and hosted CI have not been exercised.

Compile stamps, disposable test homes, scratch fixtures, VM logs, and Android recovery custody use
the physical shared artifact paths. Starter and encrypted-store mutations use the Git worktree
boundary. Managed-loop evidence accepts the shared root and its compatibility link while rejecting
private loop records, outside paths, and nested symlinks. Filesystem, Jest cache, Firebase, and
process ownership guards remain covered; Darwin zombie-only groups retain complete kernel
inspection after an `EPERM` probe. GitHub workflow path checks pass locally.

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
