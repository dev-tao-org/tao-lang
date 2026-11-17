# Package analysis integration

This consolidation prepares `feat/package-graph` for human review in PARTIAL REVIEW.
It does not land changes on main or approve the new implementation.

## Included work

| Source                                               | Revision                                   | Review boundary                                                                             |
| ---------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| PARTIAL REVIEW                                       | `b613ffa66420759e9b70956c637fbe54f1957cf4` | Existing human approvals remain valid; its checkpoint records no pending paths or rechecks. |
| Package analysis and managed dependency installation | `82d136de263ebb058cab0af8a9c21e1cdaf0065f` | New implementation awaiting human review.                                                   |
| Codegen ownership                                    | `8e3ccf2342d234a6c1db8fd2220737b5e807d8a2` | New implementation awaiting human review.                                                   |
| Accepted language design documents                   | `2840ea7a1757e439fad836e520bd2d1c6095e84e` | Records accepted design; does not implement those language features.                        |
| Codegen evidence handoff                             | `7deceb519410f7eea91dc22bcdec25d09498ad1d` | Evidence and explicit archive-publication status.                                           |

The review branch was merged first, followed by the codegen/design branch. Neither
merge had Git conflicts. The new `dependency-add` command needed one integration
adjustment to use the reviewed executable-plus-arguments command API.

The separate immutable-values candidate is not part of this consolidation.

## Verification and findings

- The tooling implementation passed 653 TypeScript tests and six Tao journeys
  before integration. The combined implementation passed 611 TypeScript tests and
  six Tao journeys, including the reviewed branch's test changes.
- Combined verification log: `.artifacts/logs/dev/2026-11-16T15-49-51.252Z-55812.log`.
- The first combined verification exposed stale generated AST artifacts. Running
  pinned setup regenerated them. The next run identified the command API adjustment.
  Both issues are resolved; their failed-run logs remain in the local inventory.
- The test-only usage report is advisory. On this combined tree it reports one
  module, ten declarations and eighteen optional argument positions. It reuses the
  source-conformance TypeScript program; the existing two Knip gates remain intact.
- Optional-argument analysis covers conservative direct calls, not individual
  options fields or arbitrary control flow. Findings require contract review.
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
