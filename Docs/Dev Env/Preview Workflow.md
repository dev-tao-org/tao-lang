# Preview Workflow

```sh
just dev
just performance
./tao compile ts/perf/perf-fixtures/Performance/Performance.tao
```

`just dev` opens the existing `Apps/Dev/Preview` workspace and serves its app in two differently sized iframes. It keeps running until Ctrl-C and does not open a browser automatically; press `w` to open the preview in Chrome. Authored files stay in place; generated build output and the readable Expo runtime live under `.artifacts/dev/preview/`.

Edit `Preview.tao`, or use the page's button to cycle through a label change, an added view, a row layout and a reset. The button asks the server to write the source file. The workspace's FileManager observes the change, updates its in-memory Document and schedules compilation. Compilation runs in process; the button does not start a compiler CLI process.

The compiler produces a complete generated revision in memory and publishes it to Metro. Metro refreshes changed modules, then accepted revisions update the readable disk inspection mirror. Metro delivers the update to both frames. Invalid source keeps the last successfully published app available.

## Measurements

`just performance` uses an isolated copy of the Hello World fixture, preserving the authored source. It checks text replacement, an added Text view, a column-to-row change and reset in both frame sizes. It validates the resulting text and layout without screenshots.

Timings distinguish source observation, reading, queueing, parsing, AST construction, module resolution, code generation, output writing and publication. Two app receipts finish each update:

- Metro `update-done`: the actual refresh client's update-completion event.
- `preview-applied`: a React effect acknowledges the matching generated revision after commit.

Receipts carry session, frame, boot and source-revision identities so an old document or delayed update cannot complete a newer measurement. Browser and CLI epoch-relative timestamps share the agreed same-host clock; click-to-receipt totals use the parent frame's monotonic clock.

The terminal reports both frames and the total duration. The total clock begins when the workspace observes a source change, while the per-frame Metro clock begins when publication starts. “Applied” establishes a React commit rather than physical paint.

Raw reports remain under `.artifacts/logs/performance/`. `./agent unsandboxed performance record` retains one commit-linked run locally; the authorized landing workflow publishes those records under `.storage/performance/preview/`. Diagnostic `performance preview` runs do not create immutable commit records.

This implementation recompiles whole documents. Partial recompilation and Studio integration are later work.
