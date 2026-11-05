# Review learning

Review learning turns useful developer corrections into scoped lessons and propagates only
semantically equivalent fixes under clear authority. It preserves the developer's review boundary:
propagated changes remain pending for inspection, and accepting content alone does not establish a
general rule.

## When to use it

Use `$review-learning`, or requests such as “apply this throughout” or “pause learning,” when a
developer explicitly asks for a correction to apply everywhere, when a meaningful correction
pattern repeats, or when a human-led review group closes with substantive corrections not yet
processed. A one-off preference can remain local. Capture its lesson only when the developer states
a general rule, an existing applicable repository rule governs it, or the evidence supports a
clearly marked inference.

The review-learning pass must run at a group boundary when substantive corrections remain
unprocessed. An explicit apply-everywhere instruction starts it immediately. Coalesce new corrections
into at most one active pass and one next pending batch. Do not turn the pass into a general code
review or launch an unrelated review.

## Evidence and authority

Each correction records its human reason, concrete before/after, intended scope, semantic exceptions,
literal excluded paths and authority. Default scope is the current implementation. Legacy, generated
and vendored content is outside scope unless the developer or an applicable rule includes it.

GPT-6 Sol at medium effort derives the rule from the correction and repository context. GPT-6 Luna at
high effort scans the precise pattern; Sol determines contextual equivalence and reviews candidate
edits.
Automatic propagation is allowed for an explicit generalization or an existing applicable rule.
An inferred rule stays pending until the developer makes one concrete decision. Record that decision
under a new correction ID that supersedes the inferred record. After that decision, apply the rule
consistently across the authorized scope without asking for each file separately. A proposal may
span multiple files from one scan; preflight the full batch and retain per-file recovery state.

## Review boundaries

Protect the active review group from propagation; the review-group checkpoint persists this
protection and apply enforces it. Fix upcoming files before they are presented, and mark affected
previously approved files for renewed human review. Never auto-accept a propagated change. The tool
records file/config snapshots and guards stale or protected edits, but it does not make semantic
decisions or approve content. Applying edits does not authorize staging or committing them.

At learning checkpoints, report the batch and scope, proposed or applied changes, accepted files
needing recheck and unresolved questions. Include a brief tally of encountered instruction
violations and inconsistent implementations of equivalent behavior, with counts and resolution
status. Keep working evidence in `.artifacts/notes/` or the toolkit's task-local state. Durable
repository policy belongs in the agent-instructions workflow.

When a rule is settled, choose a lasting prevention method: an executable check and safe fixer with
positive and negative tests when it is mechanically expressible, or concise scoped guidance with a
canonical example when it depends on judgment. Search for duplicate rule owners and consolidate;
fixing current instances alone does not complete the learning pass. If a rule is not represented by
the scanner's supported shapes, retain scoped analysis and evidence instead of forcing an inaccurate
query or claiming exhaustive coverage.

## Command interface

The implementation is the repository-managed
`./agent skill-script agents/skills/review-learning/scripts/review-learning.ts -- ...` entrypoint.
It supports `capture`, `scan`, `propose`, `apply`, `recover`, `status` and `checkpoint`. See the skill's
[operations reference](../../agents/skills/review-learning/references/operations.md) for schemas,
scope handling and examples. The CLI has no model launcher or background daemon; the coordinating
agent performs lesson interpretation and proposal review.

“Pause learning” retains the current pass and queued corrections without applying or discarding
them. Resume by checking the retained status and continuing the active pass.
