# First Expo preview baseline

Measured 2026-10-17 on macOS arm64, Darwin 27.0.0, Bun 1.4.2, installed Chrome 155.0.8059.80. Dependencies are pinned in the package manifests and `ts/bun.lock`: Expo 57.0.30, Expo Metro runtime 57.0.17, React 19.2.3, React Native 0.86.3, React Native Web 0.21.0 and Playwright 1.58.2.

This establishes the first full preview baseline; there was no equivalent runnable baseline in the new implementation. Runs used `cbbe63a61` plus the candidate runtime/workspace changes, with modified checkout state recorded in each report. Unrelated developer shell-setup changes were present. This is web-only proof; native platforms and a general Tao testing framework remain unfinished.

## Reproduction and definitions

Run `./agent unsandboxed performance preview` on macOS. It creates an isolated authored fixture from `Apps/Tests/Hello World.tao`, compiles in process, writes generated Expo files into a fresh `.artifacts/performance/<id>/` directory, starts Expo once, and loads two headless browser frames. The canonical app is unchanged. No screenshots are taken. The run checks initial Hello World, text replacement, addition of a second Text and the change from Col to Row.

At a 1280×800 browser viewport the frames measure 380×756 and 899×756. Each button press now saves the opened source; Workspace detects the change and compiles in process, publishing generated output for normal Metro Fast Refresh. The initial baseline below predates this watch-path correction. Typecheck, fix and check are explicitly skipped pipeline stubs. No partial compilation or Studio integration is included.

The parent measures click-to-receipt using one monotonic clock. Frame events carry `performance.timeOrigin + performance.now()` timestamps under the agreed same-host assumption. Reports retain both actual Metro `update-done` and React post-commit `preview-applied` events, identified by session, iframe, document boot and revision. These signals do not establish physical repaint. Runtime spans measure binding, rendering and render-to-applied; the last interval includes scheduling and effect delivery.

## Results

The final three sessions each performed one text, add-text and row edit. Both frames passed every resulting text/layout assertion and reported both matching events. Per-session maximum across the two frames, milliseconds:

| Session    | Startup to initial app |  Text | Add Text | Col → Row |
| ---------- | ---------------------: | ----: | -------: | --------: |
| `1191de1f` |                   1600 | 128.0 |     98.1 |     117.1 |
| `6d02a5f5` |                   1659 | 113.8 |    115.8 |     103.2 |
| `96c4f97a` |                   1512 | 116.0 |    116.8 |     109.4 |

Startup uses a fresh generated project but existing dependency and host caches; it is not a clean-machine cold install. These three repetitions establish a small initial baseline, not a reliable tail-latency percentile. Frame observations share an Expo update and are not independent samples.

The last run spent approximately 0.6–0.9ms per edit parsing, transforming, generating and publishing. Parent click-to-HMR receipt was approximately 78–84ms, and frame HMR-to-applied approximately 31–33ms. Separate warm in-process compiler sampling (20 warmups, 100 measurements) gave median 0.060ms and p95 0.091ms for parse-to-code, excluding publication and preview. A final repeat gave median 0.065ms and p95 0.098ms.

Raw reports are under `.artifacts/logs/performance/`:

- `preview-1191de1f-2cd0-445e-9e89-ede287fcfcf9.json`
- `preview-6d02a5f5-aa62-4049-841a-31f17e33650d.json`
- `preview-96c4f97a-7837-4a36-9afb-cb4c6bfabbc8.json`
- `parser-c0ce8e9c-77d3-4b7f-a45e-6424c81a0ac1.json`
- `parser-bbb842c0-b924-4027-b657-0a356b1a729c.json`

## Investigation and remaining cost

The sub-100ms objective is not consistently met. Most latency lies after generated-file publication, in filesystem observation, Metro delivery and React refresh scheduling. The pinned Metro runtime schedules React refresh with a 30ms timeout; the observed HMR-to-applied interval is consistent with that behavior. This attribution is an inference, not an isolated measurement of every Metro internal phase.

Integration fixes enabled real measurements: `CI=false` retains Metro reloads, the resolver adapter observes the actual Metro client, runtime child keys avoid React warnings, and browser teardown precedes server shutdown. No upstream scheduler patch or artificial budget relaxation was used. Further full-pipeline optimization is deferred until larger workloads establish whether compiler work, file observation or Metro dominates; incremental compilation remains later work.

The retained developer loop is `just dev`. It watches the original Hello World file, reuses generated output at `.artifacts/dev/hello-world/`, opens the two-frame page and stays alive until Ctrl-C. Project reuse and shared server/scaffold behavior are tested; interactive editor-save and default-browser opening remain developer acceptance steps.

## Save-to-terminal reporting: initial in-memory baseline

`just dev` prints one line per completed revision with change-to-Metro and change-to-applied times, taking the slower of the two previews for each milestone. Save timing starts at the filesystem notification, before the 5ms debounce, file read, queue and compilation. The browser relays its already validated receipts to the server; the HTTP return trip is excluded from the measured completion timestamp. Stale revisions and duplicate receipts cannot produce another line.

The automated button path also exercises this relay, starting at the server's in-process source update. Report `preview-30cd68e5-6743-4b08-b3e1-132485692cd2.json` recorded all three terminal callbacks: update-to-Metro 90.7–94.8ms and update-to-applied 123.4–126.8ms. After restricting receipt uploads to identity and timestamps, isolated report `preview-896cdae9-dd06-4e77-9a54-9d727ea15bac.json` recorded 69.1–81.1ms and 101.8–114.8ms respectively. These small runs remain within the earlier observed refresh range; they do not isolate relay overhead or prove physical repaint. Runtime timing arrays stay out of this additional request.

## Workspace-owned save and watch path

The button now writes the opened Tao file and waits for Workspace's file watcher. Both external edits and automated button edits enter the same read/compile/publication queue. `just dev` opens the canonical file directly; the performance run opens an isolated source file under its run directory. The watcher currently owns the single app entry file; multi-file project compilation is later work.

Both `tao compile` and `just dev` report source observation-to-read, read, queue, parse, AST, codegen and write spans. Reload output also reports write-to-Metro and Metro-to-applied per preview. JSON reports retain these values. Observation-to-read includes the 5ms debounce and scheduling; it does not measure the editor's interval before the filesystem notification.

Each compiler checkpoint includes its own duration in milliseconds and cumulative elapsed seconds from input observation. Preview checkpoints use the same source-update start and are labeled narrow and wide (the internal frame IDs remain left and right).

The first real watch-path report, `preview-8c86e65f-0dab-4e46-bf5b-75ca2effd8e7.json`, measured save-observed-to-applied totals of 136.9ms, 133.9ms and 118.2ms for text, added Text and Row respectively. Its first edit recorded 5.34ms observation-to-read, 0.085ms read, 0.006ms queue, 0.057ms parse, 0.230ms AST, 0.079ms codegen and 0.436ms output writing. Frame intervals were approximately 98ms write-to-Metro and 32ms Metro-to-applied. These are single-session samples with a different source-update path, not an isolated overhead comparison with the earlier in-memory runs. The sub-100ms objective remains unmet.

A real-file regression test proves both the button-style save and an independent external file edit publish through Workspace. Disabling filesystem notifications makes it fail; restoring them passes. macOS host execution is required for this test in the agent environment because sandboxed filesystem events did not arrive. The sandboxed suite explicitly skips that test; the host suite runs it.

The final repeat, `preview-a53c1955-81a2-4930-a5eb-d9d64fadb59d.json`, applied all three edits to the current on-disk source and measured 124.9ms, 122.7ms and 108.7ms. Read/compile/write phases remained below 2ms, observation-to-read was about 5.7ms, write-to-Metro about 70–85ms and Metro-to-applied about 32ms. The warm parser-only pipeline repeat from verify (`parser-bb3beadb-ffaf-4b58-ad26-549a57c000a7.json`) gave median 0.076ms and p95 0.143ms parse-to-code; this is a busy-host sample, with no compiler algorithm change attributed to its spread.
