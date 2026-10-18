# Preview browser startup

The 2026-10-17 Chrome crash report for PID 82770 matched the attempted sandboxed Playwright launch. It terminated with SIGABRT during macOS application registration (`_RegisterApplication` / `TransformProcessType`). The agent sandbox also denied process inspection. A separate profile and headless mode did not avoid this host restriction.

The preview runner now checks host process access before launching Chrome on macOS. A sandboxed invocation fails with a recovery command instead of repeatedly starting a crashing browser. This is a narrow preflight for the observed restriction, not a guarantee against every possible Chrome startup failure.

The developer approved the exact `./agent unsandboxed performance preview` operation and its equivalent native harness permissions. That route successfully launched installed Chrome headlessly, completed both previews and all three edits, then closed Chrome and Expo. The old implementation similarly used host browser checks and installed Chrome. No screenshots or visible automation windows are needed.

The earlier browser download failure was separate: the bundled Playwright browser download was rejected by the network allowlist. The runner now defaults to the existing Chrome channel, avoiding that download. `TAO_PREVIEW_BROWSER_CHANNEL` can choose another already installed Playwright channel.

`just dev` runs the retained developer loop and opens its URL through the default browser (`open -g` on macOS). Its authored source is the original `Apps/Tests/Hello World.tao`; only generated output lives under `.artifacts/dev/hello-world/`. Interactive browser opening and an actual editor-save cycle remain developer acceptance steps.
