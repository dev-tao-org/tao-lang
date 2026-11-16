# Preview Workflow

```sh
./dev
./dev help
just performance
./tao compile ts/repo-analysis/performance-fixtures/Performance/Performance.tao
```

`./dev` and `just dev` start the keyboard launcher. Press `p` for the performance editor or `v` for the live Preview app. Each shortcut starts its app on demand and opens its URL in the browser. Press either shortcut again to reopen its existing session. Press `q` or Ctrl-C to shut down both sessions. `./dev help` lists all developer commands.

For the live Preview app, edit `Apps/Dev/Preview/Preview.tao` or use the page's button to cycle through a label change, an added view, a row layout and a reset. The workspace's FileManager observes each save and schedules in-process compilation.

The compiler produces a complete generated revision in memory and publishes it to Metro. Metro refreshes changed modules, then accepted revisions update the readable disk inspection mirror. Metro delivers the update to both frames. Invalid source keeps the last successfully published app available.

## Measurements

`just performance` uses the same isolated project and serialized save path as the performance editor. It checks text changes, growth and shrink of same-file and imported trees, an edit inside a mounted dependency, and reset in both frame sizes.

Use a fresh performance editor session for manual saves or for the built-in benchmark edits. The first edit selects that session's mode and protects saved source and benchmark inputs from each other.

Timings distinguish source observation, reading, queueing, parsing, AST construction, module resolution, code generation, output writing and publication. Two app receipts finish each update:

- Metro `update-done`: the actual refresh client's update-completion event.
- `preview-applied`: a React effect acknowledges the matching generated revision after commit.

Receipts carry session, frame, boot and source-revision identities so an old document or delayed update cannot complete a newer measurement. Browser and CLI epoch-relative timestamps share the agreed same-host clock; click-to-receipt totals use the parent frame's monotonic clock.

`./dev performance preview --baseline` captures five independent sessions. Subsequent runs print percentage changes for launch, opening and each warm transition. Raw reports retain both frames and absolute durations. The end-to-end clock starts at the parent click. “Applied” establishes a React commit.

Raw reports remain under `.artifacts/logs/performance/`. `./agent unsandboxed performance record` retains one commit-linked run locally; the authorized landing workflow publishes those records under `.storage/performance/preview/`. Diagnostic `performance preview` runs do not create immutable commit records.

This implementation recompiles whole documents. Partial recompilation and Studio integration are later work.
