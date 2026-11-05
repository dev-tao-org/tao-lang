# Review learning operations

The skill owns interpretation; this reference owns the CLI contract. Run the repository-managed
entrypoint, which supplies pinned tooling and keeps edits inside the repository:

```sh
./agent skill-script agents/skills/review-learning/scripts/review-learning.ts -- <operation> <arguments>
```

All operations accept `--repo <absolute-checkout>` when the target repository needs to be explicit.
The CLI does not launch language models or make semantic decisions. The coordinating agent derives
the correction rule and candidate edits, then uses the operations below to preserve evidence and
guard exact file state. A scan or proposal is evidence, not authorization to apply it.

## Capture a correction

Create one stable alphanumeric or hyphenated ID for each correction. `--input` takes the path to a
UTF-8 JSON file, not inline JSON. For a project with `src/example.ts` containing exactly
`oldCheck(value)`, a generalized rename correction can be stored in `correction.json`:

```sh
./agent skill-script agents/skills/review-learning/scripts/review-learning.ts -- capture --input .artifacts/notes/correction.json
```

`correction.json`:

```json
{
  "id": "rename-old-check",
  "rule": { "kind": "call-name", "name": "oldCheck" },
  "evidence": "The developer said every oldCheck call in src should use newCheck.",
  "before": "oldCheck(value)",
  "after": "newCheck(value)",
  "scope": ["src/"],
  "exceptions": ["required external APIs keep their public names"],
  "excludedPaths": [],
  "authority": "explicit"
}
```

`authority` is `explicit`, `existing`, or `inferred`. Keep evidence close to the human's words and
the actual edit. `scope` selects literal repository files or folders. `exceptions` records semantic
cases that must remain unchanged; optional `excludedPaths` excludes literal repository files or
folders. Use `explicit` only when the developer generalized the rule, `existing` only when
an applicable repository rule already requires it, and provide `authoritySource` with its `file` and
an exact `quote` from authorized project source; the source is retained by hash. Use `inferred` for a
candidate interpretation. To promote an inferred rule after a concrete developer decision, use a
new correction ID and set optional `supersedes` to the inferred record's ID. Do not convert an
approval with no stated rule into a general lesson. Capture each correction once; coalesce new
corrections during an active learning pass into its next pending batch.

The current rule shapes are `call-name`, `call-symbol`, `function-length`, and `returned-method`.
Use only fields relevant to the chosen shape: `name`, `declarationFile`, `declarationName`, and
`maxLines`. `call-symbol` identifies a declaration by repository-relative file and identifier;
the checker follows aliases. These shapes are not an exhaustive learning system. If a rule does not
fit them, retain scoped analysis and evidence outside the scanner; do not force an inaccurate query
or describe a narrow scan as exhaustive.

## Scan, propose and apply

Scan the captured rule over its declared scope, optionally narrowed to named files. For the
correction above:

```sh
./agent skill-script agents/skills/review-learning/scripts/review-learning.ts -- scan --rule rename-old-check
```

Scans retain TypeScript source and configuration hashes, scope membership, findings and whether the
scan covers the full rule scope (`complete`). A scan narrowed with `--files` may be incomplete.
Review the exact matches in context; do not apply based only on text or a scan result. The scan
returns an ID; use that exact returned `scan.id` in the proposal. For the one-line fixture above,
`oldCheck(value)` occupies source offsets 0 through 15 (end-exclusive). Save a proposal using
`file`, `range`, `expected`, and `replacement`, with `start` and `end` inside `range`; include `protectedFiles` when a current
human-review group must not be changed. `<scan-id-from-output>` below is a placeholder, not a literal
value:

```json
{
  "id": "rename-old-check-pass-1",
  "scan": "<scan-id-from-output>",
  "analysis": "The correction explicitly replaces oldCheck with newCheck for every call in src; this matching call has the same role and arguments.",
  "edits": [
    {
      "file": "src/example.ts",
      "range": { "start": 0, "end": 15 },
      "expected": "oldCheck(value)",
      "replacement": "newCheck(value)"
    }
  ],
  "protectedFiles": []
}
```

Run the proposal command with the path to the saved JSON file:

```sh
./agent skill-script agents/skills/review-learning/scripts/review-learning.ts -- propose --input .artifacts/notes/proposal.json
```

`analysis` is required and records why the replacements are equivalent in context. A proposal may
contain edits across multiple files from one scan. Preflight the full batch, including file and
configuration snapshots, before applying it. The checkpoint stores active-group protected paths;
`apply` rechecks them even if a caller omits the optional flag. Apply only an `explicit` or `existing`
rule, only after checking the proposal and exact scope:

```sh
./agent skill-script agents/skills/review-learning/scripts/review-learning.ts -- apply --proposal rename-old-check-pass-1
```

Apply rejects stale source/configuration inputs, inferred authority, protected files and overlapping
edits. It journals each file and recovers interrupted batches only while expected file states still
match, refusing to overwrite foreign edits. Application changes repository files and learning
metadata only; it does not authorize staging, committing, or approve review content. Changes to
previously accepted files remain pending recheck; files coming up in the human review proceed with
the proposed correction visible for review. Never use tool output as a substitute for inspecting the
resulting diff.

## Track batches and checkpoints

```sh
./agent skill-script agents/skills/review-learning/scripts/review-learning.ts -- status
./agent skill-script agents/skills/review-learning/scripts/review-learning.ts -- checkpoint --group "Source resolution" --protected-files ts/3-typecheck/typecheck-src/ActiveGroup.ts
./agent skill-script agents/skills/review-learning/scripts/review-learning.ts -- recover --proposal rename-old-check-pass-1
```

Use `status` to reconcile captured corrections, scans, proposals, applications and queued work. Keep
inferred records as historical evidence when a new explicit correction supersedes them.
`appliedProposals` lists historical applications, not outstanding approvals. Reconcile those with
the partial-review receipts and checkpoint before reporting what still needs human review; this
tool never grants or revokes approval.
Use `checkpoint` at the human-led review group boundary to record the group and protected paths;
the skill's learning pass is mandatory when substantive corrections remain unprocessed. Keep at
most one active batch and one next pending batch. Resolve inferred rules with one concrete developer
decision; retain them as pending until then.

An interrupted multi-file batch stays pending until `recover --proposal <id>` reconciles its
per-file journal. Recovery resumes only original or exact intended outputs and refuses external
edits. Do not report it complete until every file is applied or safely left untouched and `status`
confirms the outcome.

The tool performs no Git mutations and does not change review approval state. It cannot start a
background daemon or independently launch models. Keep ongoing evidence in its task-local state and
retain human-readable checkpoints under `.artifacts/notes/` when needed for interruption recovery.
