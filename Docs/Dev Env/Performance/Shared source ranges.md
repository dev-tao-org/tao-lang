# Shared source range comparison

The shared range branch was measured from its starting commit
`df750d35f4a22a038be30fee2811153be866a586` through
`671bea0eaa1b63e73a73dcfff2b0c841f831f1c2`. The measurements do not establish a
significant regression or an exact zero change.

Five independent preview sessions per revision ran serially in interleaved order on the same
macOS arm64 host, browser 156.0.8078.48, authored fixture and two preview frame sizes. Each
session measured one edit per scenario. Reports retain their actual source identity and dirty
state; early dirty diagnostics are separate from the clean comparisons below.

| Revision   | Change             |    Text | Add text |     Row |   Reset |
| ---------- | ------------------ | ------: | -------: | ------: | ------: |
| `df750d35` | Branch baseline    | 38.3 ms |  33.6 ms | 54.4 ms | 52.1 ms |
| `d32957b6` | Range constructor  | 39.8 ms |  32.8 ms | 52.6 ms | 49.9 ms |
| `598d640b` | Named range fields | 38.1 ms |  35.6 ms | 54.4 ms | 50.3 ms |
| `671bea0e` | Source helpers     | 40.9 ms |  33.8 ms | 54.5 ms | 50.8 ms |

These are medians of `parentClickToLastAppliedMs`: a browser click through the matching React
commit receipt in both frames. They do not measure physical paint. Text ranges overlap:
36.6–44.2 ms at baseline and 37.6–43.9 ms at the final implementation. The apparent text shift
is in publication-to-Metro timing; measured parser, transformer and codegen medians remain
around 0.75–0.77 ms combined, while `workspace.publish` remains around 11–12 ms.

Additional 24-edit sessions exclude the first four-edit cycle from warm samples. Warm text
medians were 59.2 ms at baseline, 60.1 ms at `d32957b6`, 56.1 ms at `598d640b` and 58.9 ms at
`671bea0e`. Baseline has ten warm samples across two sessions; each other revision has five.
The spread is too broad to attribute a small effect to a particular source change.

Four multi-cycle commands failed after writing complete browser-result reports. Extra watcher
publications produced 25–27 reload entries for 24 edits, and the unchanged CLI summary indexed
reloads and browser results one-to-one. These failed summaries and their raw data are retained;
they are not counted as successful benchmark commands.

## Retained evidence

Storage commit `e5ded02f3e13229f4b6053bf4d81c8162b1244ca` contains the three implementation
commits' immutable preview records under `performance/preview/<source-commit>/`, plus raw
parser, formatter and preview diagnostics, failure logs and the task checkpoint. The
[evidence inventory](../../../.storage/evidence/671bea0eaa1b63e73a73dcfff2b0c841f831f1c2/01a17ea1-d38e-7ab3-a754-e3b5a3b2b87b/inventory.json)
records original paths, archive destinations, SHA-256 hashes and limitations.

The storage commit is locally retained and pinned by this branch. Remote archive publication
remains pending because this checkout exposes archive publication only inside the main-landing
workflow. The source branch is intended for the existing human-led partial-review branch at
the developer's chosen integration point; this comparison grants neither human acceptance nor
main-landing authorization.

## Repeating on a second Mac

Use SSH to prepare exact baseline and candidate commits in local checkouts on the second Mac,
with the frozen dependency setup, same browser and fixture. Keep benchmark files on that Mac's
local disk. Run only one benchmark at a time in an exclusive, quiet session, keeping power and
thermal conditions consistent. Compare both revisions on that machine rather than comparing
absolute times from different Macs.

Separate startup, first edit and warm refresh. Fix the multi-cycle CLI's revision alignment
before making it the standard runner, then repeat warm cycles across randomized paired
sessions. Retain individual samples, host/toolchain metadata and paired median deltas with
confidence intervals. Copy the raw reports back over SSH for analysis and archive them with
their exact source identities.
