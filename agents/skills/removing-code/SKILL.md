---
name: removing-code
description: >-
  Prove reachability and manage deletion in Tao. Use before deleting, retiring, or de-exporting
  code, recipes, modules, legacy branches, generated artifacts, or surfaces reported as
  unreferenced; cover stale references and generated-output lifecycle.
---

# Removing Code

- Prove reachability before deleting; never infer it from a finding. Write the argument down, delete in layers, and keep the package typechecking and its tests passing after each layer so the compiler surfaces the next one.
- Zero code references does not mean dead for a human-facing surface. A `Justfile` recipe, a CLI command, and a documented workflow are discovered by a person reading `just --list` or `--help`, so judge them by whether a human would want them.
- Re-verify every "zero references" and every `file:line` claim against the current tree before acting. Findings drift; where a plan and the tree disagree, the tree wins — fix the plan line and continue.
- An unused export is usually a de-export, not a deletion. Keep the code, drop the `export`, and check no consumer in the same package needs it.
- Root `./agent check` and `./agent verify` run normal and production Knip through `ts/repo-analysis/scripts/knip.ts`; production excludes tests so they cannot keep unused APIs alive. An export reached outside the static import graph needs a consumer-specific entry file in its declaring package and an explicit production Knip entry, never a per-symbol suppression. Keep one entry file per reason. There is no standalone public subcheck.
- Inside `.x-tao-old-v1/`, the retained `./agent dead-exports` workflow also handles Tao bindings, native siblings and declaration facades in `packages/testing/verification/verification-src/DeadExports.ts`. Port those behaviors when their new equivalents exist; do not execute or import that implementation from root workflows.
- Sweep for stale references in the same change: docs, spec pages, generated-config entry lists, lint allowlists, and skills. A deleted bundle entrypoint or allowlisted file left behind breaks an unrelated gate later.
- Every generated tree needs a deleter. Give run roots a lifecycle that discards on success, keeps the newest failure to debug against, prunes on startup, and leaves roots a concurrent run may own; add the path to `just clean` in the same change.
- Do not leave a file a generator does not expect inside its output directory, and exclude generated symlinks from `tsconfig` includes, which follow them.
- Stamp expensive generation on the content of its inputs rather than regenerating per gate process.
- Prefer generating a configuration copy over hand-maintaining one; otherwise add a parity check that fails when the source and the copy disagree.
- Prefer a ratchet to a flag day when a convention has many existing violations: gate the rule with a per-file allowlist, and report an allowlist entry that no longer violates so exemptions cannot outlive their reason.
