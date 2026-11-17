# Repository APIs and ownership

Package manifests own public file entrypoints in `exports` and their import aliases and canonical
namespaces in `tao.publicApi`. Cross-package imports use those exact entries rather than private
folder paths. Independently useful capabilities may have explicit subpath entries. Platform,
browser, bootstrap and packaging boundaries retain deliberately separate module graphs.

`./agent fix` regenerates the TypeScript path snapshot from this metadata. Knip derives its paths
from the same owner. `./agent check` detects stale paths, missing targets, wildcard entrypoints,
private cross-package imports and incorrect operation-family imports.

`ts/repo-analysis` owns source policy, package and test analysis, and the Knip configuration.
The CLI runs the tools, prints findings and writes command artifacts. The package also publishes
the benchmark harness as `@repo-analysis/performance`, so check and fix can load analysis
without loading preview or compiler benchmark code.

Repository path confinement is owned by `Repo.assertNewWorkspacePath` in the shared OS layer.
CLI preparation and package analysis use the same check without an analysis-to-CLI dependency.

Run `just package-graph` to generate `.artifacts/package-graph.md` with Mermaid diagrams of
direct source and test imports between TypeScript workspace packages. The arrows point from
the importing package to the imported package. Labels count value, type and compile-only imports
separately. Inspect `.artifacts/package-graph.json` for the source file, import specifier and resolved
target behind each edge, as well as unresolved specifiers. Dependency-cruiser resolves imports
locally using the workspace TypeScript aliases. The report describes static analysis of source
files and excludes generated directories and third-party packages from the diagrams.

`./agent check` writes `.artifacts/test-only-usage.md` with source locations for production
modules, exported declarations and optional arguments observed only in tests. The report reuses
the TypeScript source-conformance program and applies the same explicit entrypoint inventory as
Knip. It treats designated SDK, generated and host-tool exports as production contracts. Internal
manifest entrypoints can still be candidates. Each candidate includes one observed test reference.

Optional arguments are counted by position in direct, statically resolved calls to function
declarations. The report skips functions with observed indirect references or spread calls.
It examines the options argument as a whole. Review individual options fields, computed imports,
generated callers and intended external contracts separately. Findings are advisory, and the
existing Knip check still gates unused files and exports.

Use module namespaces for operation families, such as `import * as Workspace from '@workspace'`.
Narrow imports remain appropriate for manifest-declared primary entities and constructors. Shared
families are already namespaces: `import { Json, Sort } from '@shared'` exposes qualified operations
and types without creating aggregate wrapper objects.

## Invariants and user input

Import `Invariant` and `UserInput` from `@shared`. Use `Invariant(condition, message)` for
conditions guaranteed by Tao or an established upstream contract. Use
`UserInput.require(condition, message)` when a caller can correct the input. Domain functions
such as `requireRunPort` own the validity rules and write the diagnostic message.

Both checks require a primitive boolean and a string, narrow the checked expression in
TypeScript, and return `undefined` on success. They run synchronously in every build.
`Invariant` throws `UnexpectedBehaviorError` on failure and `UserInput.require` throws
`UserInputError`. Malformed calls throw a fixed `UnexpectedBehaviorError` without inspecting
or attaching the arguments.

Use `UserInput.fail(message, details?, { cause }?)` for unconditional caller-correctable failures;
it preserves diagnostic details and causes. Use `Errors.ThrowX` for other error categories and the existing structured error boundary
for collected diagnostics. Use schema decoding to validate and type unknown data. Put a check
before the operation it protects. Argument evaluation and earlier effects happen before it runs.

## Serialization and ordering

- `Json.Parse(text)` returns `unknown`; `Json.Parse(text, { schema, sourceName })` validates the
  result and infers its schema output. Syntax and schema failures retain their causes and context.
- `Json.Print(value, options)` uses two-space indentation by default, preserves native omission
  rules and field order, and adds no trailing newline. Use `prettyPrint: false` for inline source,
  byte-sensitive identities or other outputs whose purpose requires single-line encoding.
- Shared `Schema` owns runtime validation through the sole Zod bridge. Domain codecs retain their
  ownership, path-safety and recovery policies. `FS.readJson` and `FS.writeJson` combine JSON options
  with applicable file options; atomic publication remains the caller's policy.
- `Objects.equal(left, right)` compares deterministic encodings directly. `Hash.Of(value)` returns
  a SHA-256 fingerprint using the same ordering, with shared Sort helpers. Arrays retain their order.
  Actual text/byte hashing remains distinct from structured-data fingerprints.
- `Json.Canonical(value)` explicitly encodes ordinary JSON data with recursively sorted ordinal
  UTF-16 object keys. It preserves array order, normalizes negative zero, and rejects non-finite
  numbers, cycles, sparse arrays, accessors and unsupported values or object shapes.

Only `Json/Native.ts` accesses native JSON globals. Independent external scripts and expected-byte
fixtures keep their own source contracts. Keep typed, domain-named parsing/serialization functions
around shared operations. Select print options for each output's contract rather than mechanically
retaining old formatting. Preserve durable pin bytes explicitly; changing ordinary print defaults
does not authorize changing persisted dependency identities. Cycles fail in ordinary printing,
comparison and fingerprinting; broader rejection of native omission/conversion behavior is deferred.

`Sort.CompareStrings` compares ordinal UTF-16 code units. `Sort.By(keyOf, compare)` derives a
comparator; `Sort.Reverse(compare)` reverses its arguments; `Sort.Strings(values)` returns a sorted
copy. Use `.sort(Sort.CompareStrings)` where in-place mutation is intentional. Locale, numerical,
source-position and domain-specific ordering policies remain distinct.

## Source and test ownership

Use PascalCase for entity/API families and noun-family directories; use lower-kebab for commands,
workflows, configuration and broad categories. Introduce a noun facade and implementation family
when it clarifies real ownership, rather than creating a wrapper for every directory.
For case-only moves, verify the staged/committed Git spelling as well as the physical filename;
a clean status on a case-insensitive filesystem does not prove they agree.

Shared host responsibilities are grouped under FS, Storage, Process, Exec, Browsers, net and
Tooling. `Process` owns the current process and `Exec` owns children. Env and Terminal build on
the current-process boundary. Browser, preview and dependency-light bootstrap entries stay separate.
`Exec.capture` waits for the complete result, `Exec.captureStdout` returns stdout after a successful
exit, and `Exec.spawn` returns a live child with configurable streams. Each takes an exact executable
name or path, optional positional arguments and optional settings. Argument strings split on whitespace.
Pass an array for dynamic arguments, arguments containing spaces and empty arguments. `Exec.runSync`
uses the same call forms for synchronous host probes.
Import the child-process API as `import Exec from '@shared/os/exec'`. Its operation methods are
available on the default value; named imports from that entrypoint are reserved for types such as
`CommandOptions` and `SpawnOptions`. The broader `@shared/os` entry retains its named `Exec` export
for platform-boundary fallback imports.
`@shared/web` owns HTTP requests, WebSocket connections and server-sent events. Bun server startup
and Node HTTP and socket adapters live under `os/net`.

Each package has one `test-<package>/` root. Tests mirror source-folder responsibilities, not source
files one for one: a source folder `builds/sidecar/` uses `builds/sidecar.test.ts`, or multiple
`builds/sidecar.<Concern>.test.ts` files. Nested source folders extend that owner path. A folder does
not need a test merely because it exists. Root concerns use the package owner, such as
`Workspace.<Concern>.test.ts`.

Utilities use `<Owner>.test-utils.ts`; fixture code uses `<Owner>.test-fixtures.ts` or
`<Owner>.test-fixtures.<Concern>.ts` at the nearest common test owner. Recursive fixture directories
contain actual authored inputs, assets and project layouts. Generic test mechanisms use
`@shared-tests`; package utilities use exact `@<package>-tests` entrypoints. Production code must
not depend on these test utilities. Test eligibility and runtime cost remain governed by
[TypeScript test guidance](../../ts/AGENTS.md) and [Testing](Testing.md).

## Migration evidence

The rollout's verified implementation is `2e22943e554f972fe1a968ef0b541ff1898435e6`
(tree `ef48d2fd57ee97294ebd1db67b1545a05feb805c`). Its clean-source full verification passed
631 TypeScript tests and 6 Tao journeys. All 200 test files and 617 existing named test calls
were retained. The inventory records 35 public entrypoints and 525 explicit move targets. All
791 tracked paths under `ts` agree with physical casing in both the worker and receiving checkout.
The earlier `73b858e68` committed-filename proof is withdrawn: five case-only renames were missing
from Git despite correct physical filenames. The corrected commit contains those five renames
with no function-body changes.

Three baseline/final first-cycle preview runs at `bb5ec24ff` and `2e22943e5` matched fixtures,
frames, browser, toolchain and measurement definitions. Row watcher-to-applied median increased
2.17 ms; reset click-to-applied increased 4.5 ms. All ranges overlap. These provisional flags
establish neither a causal regression nor a blanket performance pass; they are not warm
distributions. Earlier apparently faster results did not repeat and are retained as historical
evidence rather than promoted to a speedup claim.

The exact 251-file evidence packet is published in the storage repository as
`09b1631878f428d6eac377eb4f4b121bc9487e2a`. Its
[corrected inventory](../../.storage/evidence/2e22943e554f972fe1a968ef0b541ff1898435e6/deferred-repository/inventory.json)
and retained
[initial inventory](../../.storage/evidence/73b858e689e3ef88d2018be69650f25a06cc1483/deferred-repository/inventory.json)
map original paths, archived paths and SHA-256 hashes, including 30 source-linked timing records,
raw comparisons, verification logs, casing receipts and move conservation. Three intermediate runtime-resource
captures remain honestly failed; they were fixed in subsequent source, not rewritten as passes.

The developer explicitly approved this payload and destination. Publication to
`tao-dev-org/tao-lang-storage`, branch `backup/feat/review-deferred-evidence`, is remotely confirmed
at the exact archive commit above. All 251 files match the committed bytes and inventory hashes.
Source commit `a305631c51e91b98cefcbaa1c856dbdefab86dd7` pins that archive; fresh clones can retrieve
the packet through the gitlink. The earlier automatic publication rejection is resolved. Retain
the working branches and worktrees for the remaining review and separately authorized landing.

The new migration has not received independent review or human acceptance. The earlier reviewed
checkpoint was `af3b2059bf762b801877a44789570007e767f0f1`; its acceptance does not extend to this
rollout. Before landing, also reconcile the inherited missing `509bb1c2` timing record and the
original whole-branch baseline comparison. Native PTY/resize acceptance remains unclaimed;
public IO and actual Ink frame/lifecycle proofs passed. No landing was performed.

## Final integration evidence

The later independent reviews cover the repository migration through
`b93bfb728dc2533710c14bb60297a36f82f829dd` and the JSON/runtime changes through
`6490b7ad8ff623ecf288898b92b6d3a0ce81c9c5`, with no unresolved confirmed P0–P2 or required
conformance findings. The four JSON review rounds are complete. Generated development app lock
state in `09199521fccf4df2ad75d548406fa6ae80dfb4e5` is identified separately: full verification
produced and exercised it, passing 636 TypeScript tests and 6 headless Tao journeys. Native
PTY/resize and device acceptance remain unclaimed. Reviews and tests do not grant human acceptance.

The [JSON readiness inventory](../../.storage/evidence/09199521fccf4df2ad75d548406fa6ae80dfb4e5/json-readiness/inventory.json)
identifies 47 selected reports, logs and measurement inputs with SHA-256 hashes encoded as base64.
Archive commit `cc54217fba68cb08e6788ef645e23ece5150c00e` also retains nine source-linked timing
record/report pairs. Prior archive packets remain intact.

Three matching baseline/final sessions compare original branch start `c7f53bd5c` with `09199521f`:
first-edit React receipt medians are 133.1/37.8 ms and warm row session medians are 130.9/59.0 ms.
The baseline uses a disclosed four-file measurement adapter; both use the same authored fixture,
frames and toolchain. Startup ranges overlap. These are React commit receipts, not physical paint
or causal attribution to JSON alone. Raw samples, the adapter and unsuccessful earlier runs are
retained in the inventory. The original `509bb1c2` timing record has also been recovered.

A complete audit found 163 missing timing records among 231 required implementation commits in
the inherited source history. The developer authorized a new `feat/metro-memory-preview-ready`
branch from current main with the final verified tree and one runnable implementation checkpoint.
Original review/worker branches and backups are preserved; no existing history is rewritten and
the gate is not weakened. The new checkpoint needs its own timing record and tree-equivalence
receipt before handoff. Landing remains separately authorized.

The consolidated implementation is now `966ef2c351ff85048738b68c90ec40c9fe3889e8`, directly on
`c7f53bd5c515cac219c0feb2806fd585b38ac7d7`. Its tree
`6da3014c67ab8368aeb1610124e156554d79f828` exactly matches preserved review source
`959e2d82d2c9ed3b0092089e291fef3884ba3247`. The original source remains backed up separately.
Its own source-linked preview timing record passed without implementation edits.

The [delivery inventory](../../.storage/evidence/966ef2c351ff85048738b68c90ec40c9fe3889e8/json-readiness/inventory.json)
and [receipt](../../.storage/evidence/966ef2c351ff85048738b68c90ec40c9fe3889e8/json-readiness/delivery-receipt.md)
identify the companion archive `15ae30f247f84230ef8a5e8949c5f88c25fd2b98`: 15 selected diagnostic
and validation files, their inventory, and the delivery timing record/report pair. It extends the
prior archive without replacing any records.

Fresh-checkout validation passed by components: formatting/checks and all 636 TypeScript tests,
then all 6 Tao journeys after repairing generated paths left by worktree relocation. The combined
verify run that stopped at app preparation is retained as such; it is not relabeled as a passing
invocation. The original clean-source full verification remains retained. No implementation code
changed during consolidation. Documentation and archive-pointer follow-ups are separate.

Two tooling follow-ups remain: the managed worktree creation request stalled without returning
an operation ID, and a secret-redaction test mistakes `private` in a checkout path for secret
content. This task used an ordinary Git worktree under the normal worktrees directory. Its stale
cache symlink and generated app ownership metadata were rebuilt; affected tests passed. Neither
workaround is claimed as a fix for the underlying tooling follow-ups. Landing remains separate.

## CI follow-up

PR [88](https://github.com/dev-tao-org/tao-lang/pull/88) received three CI repairs after the
consolidated delivery checkpoint. Build-only jobs explicitly set `TAO_SETUP_STORAGE=false`, so
workspace setup does not require credentials for the private evidence archive. Normal developer
setup and landing/publication archive validation retain their existing behavior. CI runs the full
suite serially to avoid competing compiler, Metro and browser workers.

Initial browser document navigation now has a separate bounded startup allowance; short
interaction deadlines and test-case budgets remain unchanged. Fresh-checkout terminal diagnostics
create their output directory, and fixture npm execution captures bounded command failures.
Setup's existing cleanup also removed an unreferenced pre-Zod generated lock and digest; the
active dependency graph and pins remain unchanged.

Hosted [Verify 310](https://github.com/dev-tao-org/tao-lang/actions/runs/42085397783) passed on
`c222eee169921d45b4b6a2832703848158294d47`: setup, checks, 637 TypeScript tests, 6 Tao journeys,
and the unchanged-tracked-files check. The hosted suite took 224.99 seconds. This is a CI proof,
not additional human acceptance or native/device acceptance.

The [CI repair inventory](../../.storage/evidence/c222eee169921d45b4b6a2832703848158294d47/ci-repair/inventory.json)
identifies the retained failed/successful hosted logs, local proofs and three repair timing pairs
in archive `99c47e622839256bcf180e763ab826fd70f678c0`. It extends the earlier packets without
replacing their source identities or bytes. The final documentation/archive-pin follow-up must
pass CI on its own head before handoff; no source landing is implied.
