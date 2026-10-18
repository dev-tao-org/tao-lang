# TypeScript checks

Measured on October 17, 2026, in the Goal 2 worktree with the pinned TypeScript 5.9.3.
These are individual local samples of the TypeScript phase, excluding environment activation
and the remaining check gates.

| Configuration                                        |   Time |
| ---------------------------------------------------- | -----: |
| Twelve sequential `tsc --project` processes          | 5.17 s |
| One `tsc --build` invocation, cold incremental state | 1.56 s |
| One `tsc --build` invocation, unchanged inputs       | 0.11 s |
| One valid edit in the typecheck stub                 | 0.30 s |

The valid edit temporarily added `satisfies string` to the stage literal, then was restored.
A separate warm-cache probe added `satisfies number`; check rejected it with TS1360 in 0.31 s.
The source was restored before final verification. These probes establish local cache
invalidation behavior, not a latency guarantee for changes to heavily imported modules.

The check runner passes each package's existing config to one build invocation. Package JSX,
ambient types, include patterns and source aliases remain authoritative. Incremental metadata
lives under `.artifacts/cache/typescript/`, one file per package; removing this cache causes a
cold check. No JavaScript or declaration output is emitted, and no project references were added.
