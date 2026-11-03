# Repository APIs and ownership

Package manifests own public file entrypoints in `exports` and their import aliases and canonical
namespaces in `tao.publicApi`. Cross-package imports use those exact entries rather than private
folder paths. Independently useful capabilities may have explicit subpath entries. Platform,
browser, bootstrap and packaging boundaries retain deliberately separate module graphs.

`./agent fix` regenerates the TypeScript path snapshot from this metadata. Knip derives its paths
from the same owner. `./agent check` detects stale paths, missing targets, wildcard entrypoints,
private cross-package imports and incorrect operation-family imports.

Use module namespaces for operation families, such as `import * as Workspace from '@workspace'`.
Narrow imports remain appropriate for manifest-declared primary entities and constructors. Shared
families are already namespaces: `import { Json, Sort } from '@shared'` exposes qualified operations
and types without creating aggregate wrapper objects.

## Serialization and ordering

- `Json.Parse(text)` returns `unknown`; the owning domain codec validates the result.
- `Json.Print` preserves native stringify overloads, omission rules and field order.
- `Json.PrintIndented(value)` uses two-space indentation and adds no trailing newline.
- `Json.Canonical(value)` explicitly encodes ordinary JSON data with recursively sorted ordinal
  UTF-16 object keys. It preserves array order, normalizes negative zero, and rejects non-finite
  numbers, cycles, sparse arrays, accessors and unsupported values or object shapes.

Only `Json/Native.ts` accesses native JSON globals. Independent external scripts and expected-byte
fixtures keep their own source contracts. Keep typed, domain-named parsing/serialization functions
around shared operations. Ordinary printing deliberately preserves existing durable pin and cache
bytes; canonicalization is opt-in, rather than a silent change to stored identities.

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

Shared host responsibilities are grouped under FS, Storage, Process, Processes, Browsers, Net and
Tooling. `Process` owns the current process; `Processes` owns children. Env and Terminal build on
the current-process boundary. Browser, preview and dependency-light bootstrap entries stay separate.

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

The exact 251-file evidence packet is committed locally in the storage repository as
`09b1631878f428d6eac377eb4f4b121bc9487e2a`. Its
[corrected inventory](../../.storage/evidence/2e22943e554f972fe1a968ef0b541ff1898435e6/deferred-repository/inventory.json)
and retained
[initial inventory](../../.storage/evidence/73b858e689e3ef88d2018be69650f25a06cc1483/deferred-repository/inventory.json)
map original paths, archived paths and SHA-256 hashes, including 30 source-linked timing records,
raw comparisons, verification logs, casing receipts and move conservation. Three intermediate runtime-resource
captures remain honestly failed; they were fixed in subsequent source, not rewritten as passes.

Remote publication of this packet is pending explicit payload/destination approval after automatic
approval review rejected it. The source gitlink deliberately remains at the already published
`a09bbdd82a194db1d2d67f6c08527066f237f657`; fresh clones will not contain the new packet until it is
published and pinned. Keep the source worktrees and local archive branch until that receipt exists.

The new migration has not received independent review or human acceptance. The earlier reviewed
checkpoint was `af3b2059bf762b801877a44789570007e767f0f1`; its acceptance does not extend to this
rollout. Before landing, also reconcile the inherited missing `509bb1c2` timing record and the
original whole-branch baseline comparison. Native PTY/resize acceptance remains unclaimed;
public IO and actual Ink frame/lifecycle proofs passed. No landing was performed.
