# Package analysis integration

This consolidation prepares `feat/package-graph` for human review in PARTIAL REVIEW.
It does not land changes on main or approve the new implementation.

## Included work

| Source                                               | Revision                                   | Review boundary                                                                               |
| ---------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------- |
| PARTIAL REVIEW                                       | `b613ffa66420759e9b70956c637fbe54f1957cf4` | Existing human approvals remain valid; its checkpoint records no pending paths or rechecks.   |
| Package analysis and managed dependency installation | `82d136de263ebb058cab0af8a9c21e1cdaf0065f` | New implementation awaiting human review.                                                     |
| Codegen ownership                                    | `8e3ccf2342d234a6c1db8fd2220737b5e807d8a2` | New implementation awaiting human review.                                                     |
| Accepted language design documents                   | `2840ea7a1757e439fad836e520bd2d1c6095e84e` | Records accepted design; does not implement those language features.                          |
| Codegen evidence handoff                             | `7deceb519410f7eea91dc22bcdec25d09498ad1d` | Evidence and explicit archive-publication status.                                             |
| Public export narrowing                              | `02f27535a6a9dc219968911588b27e84c96ce9b8` | Internal compiler, formatter and workspace stages removed from package facades.               |
| Shared generated contracts                           | `4b5d72142c612179aee5608fbe2e064613297efa` | Review repair sharing publication names, prop types and sidecar asset declarations.           |
| Deep snapshot traversal                              | `3aa27b2462262b8c5257ec581d9fef024d3d1898` | Review repair for reproduced copy and equality stack overflows.                               |
| Tooling review repairs                               | `12a6ad4788e21baac46546cffb5d12bba07c7efd` | Corrected pinned-tool arguments, paths, approval parity and graph classifications.            |
| Later PARTIAL REVIEW corrections                     | `12f4e79e7a5e92cc8d90009b2c5ea13b68cfe8d3` | Reviewed async JSON file handling, merged with portable paths and corrected dependency flags. |

The initial review branch was merged first, followed by the codegen/design branch. Neither
merge had Git conflicts. The new `dependency-add` command needed one integration
adjustment to use the reviewed executable-plus-arguments command API.

The subsequent integration `42c9c072522615d16bbc09498bffd2445cf902d0` includes the immutable-values candidate `fd71fc00f9b1404979c7057a7130182d6e52c22b`, including its TS Lib App examples and consumer assertions. It preserves the reviewed `Catalog` publication alias and pane fixtures, and adapts the snapshot test to the reviewed execution API. Independent review of this expanded batch follows the earlier human-reviewed baseline; these integrations do not themselves establish human approval.

The later reviewed corrections were merged through `109f0dd9a8057eacb63ab3f6d6f3b0811324dec9`. Full verification passed in `.artifacts/logs/dev/2026-11-16T16-24-06.426Z-88643.log`. The source-review record is retained in `.artifacts/checkpoint/consolidated-review-and-exports.md`, distinguishing each frozen target, its findings and the final reviewed state. The newly authorized `ts/repo-analysis` extraction, including repository scripts and performance tooling, is separate work on `feat/repo-analysis` and is not included in this batch.

## Verification and findings

- Expanded integration `42c9c072522615d16bbc09498bffd2445cf902d0` passed full verification in `.artifacts/logs/dev/2026-11-16T16-06-27.944Z-89302.log`, including the TS Lib App and immutable-value Tao journey. An earlier run timed out in an unchanged HTTP browser test; that test then passed unchanged in isolation and in the full rerun. The timeout's root cause is unconfirmed.
- Its exact-commit preview record passed under `.storage/performance/preview/42c9c072522615d16bbc09498bffd2445cf902d0/`. A single-session comparison with the preceding tip does not establish a speed change or physical paint timing.
- The tooling implementation passed 653 TypeScript tests and six Tao journeys
  before integration. The combined implementation passed 611 TypeScript tests and
  six Tao journeys, including the reviewed branch's test changes.
- Combined verification log: `.artifacts/logs/dev/2026-11-16T15-49-51.252Z-55812.log`.
- The first combined verification exposed stale generated AST artifacts. Running
  pinned setup regenerated them. The next run identified the command API adjustment.
  Both issues are resolved; their failed-run logs remain in the local inventory.
- The test-only usage report is advisory. On the earlier `f271a4661` tree it reported one
  module, ten declarations and eighteen optional argument positions. It reuses the
  source-conformance TypeScript program; the existing two Knip gates remain intact.
- Optional-argument analysis covers conservative direct calls, not individual
  options fields or arbitrary control flow. Findings require contract review.
- Dependency graph classification corrects known mixed-import and inline type/dynamic-import coalescing cases. It remains based on dependency-cruiser resolution and can omit a separate inline type edge when an ordinary static import wins the scanner's coalescing key. The test-only report is also conservative around indirectly escaped namespaces. Neither report proves an API is safe to remove without consumer review.
- The ownership/export audit is read-only research of the earlier committed
  baseline. Recheck its recommendations against this combined tree before fixes;
  reviewed corrections may already have addressed some findings.

See [Repository APIs](Repository%20APIs.md) for command usage and
[Codegen Ownership Evidence](Codegen%20Ownership%20Evidence.md) for the source slice.

## Retained local evidence

The developer explicitly deferred remote evidence publication for this consolidation.
Keep both source worktrees and their local evidence; no archive pointer update or
remote archive publication is claimed.

In the package-graph worktree:

- `.artifacts/notes/package-analysis-integration-inventory.txt`: file hashes for the
  retained reports, checkpoints and verification logs.
- `.artifacts/package-graph.md` and `.artifacts/package-graph.json`: refreshed package
  diagrams and import evidence.
- `.artifacts/test-only-usage.md`: current advisory candidates.
- `.artifacts/notes/package-api-audit.md`: read-only audit and coverage limits.
- `.artifacts/checkpoint/graph-and-ownership-audit.md` and
  `.artifacts/checkpoint/test-only-usage.md`: implementation and coordination records.
- `.storage/performance/preview/82d136de263ebb058cab0af8a9c21e1cdaf0065f/`:
  successful tooling-commit preview record and raw report, retained locally.

The original `14a4` worktree additionally retains the verified codegen evidence
package and `.artifacts/notes/preview-history/8e3ccf2342d234a6c1db8fd2220737b5e807d8a2/`.
That preview record was measured on an isolated clean checkout of the exact commit.
Individual records do not establish a branch-wide speedup or physical paint timing.

PARTIAL REVIEW should merge the final provided tip, preserve its existing approval
receipts, and review only new changes and any necessary integration rechecks.
