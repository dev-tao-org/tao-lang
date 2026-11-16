# Instructions and documentation focus

## Budgets, enforced by `repo-lint`

- Each `SKILL.md` keeps its 12,000-character budget, with detail in reference files loaded on demand.

## Removing

- Delete prose that restates what `repo-lint`, a hook, or `./agent` output already enforces or says.
- Cut anecdotes, incident history, and calibration-period framing. A rule keeps at most a
  one-clause reason.

## Placing

`agent-instructions` owns where a rule goes. Workflows that share a verb become reference files of
one skill (`landing` holds merging progress and personal-branch cycles; `delegation` holds
parallel implementation and review fan-out); a thin skill merges into its nearest owner only when a
trigger no other skill covers survives the merge.

## Rules into code

For each mechanical rule pick the enforcement point and delete the sentence:

| Rule kind                                        | Enforcement point                                      |
| ------------------------------------------------ | ------------------------------------------------------ |
| Commit message content, branch state             | git hooks installed by `./agent unsandboxed setup`     |
| Source conventions, doc structure, budgets       | `repo-lint` convention table                           |
| Generated harness files stale                    | `repo-lint` against `./agent unsandboxed setup` output |
| Shell habits (`grep -r`, `cd` prefix, pipe exit) | PreToolUse hook in `.rulesync/hooks.jsonc`             |
| Subagent brief boilerplate                       | subagent-start hook                                    |
| Recovery steps                                   | the failing command's own output                       |

New hooks warn. Promoting one to blocking is the Developer's decision.

## Documentation

- One archive, `Docs/Archive/`, grouped as `Plans/`, `Explorations/`, `Reports/`, with a README of
  at most 15 lines on how to add to it. Archived documents are kept, never deleted, and frozen.
- Archive a roadmap document when its work has landed or it reads as a closed report.
- Overlapping live explorations merge into one document per topic. The Developer signs off the merge list
  before any merge.
- The developer-environment ledger moves only together with the `repo-lint` rule that checks it.
