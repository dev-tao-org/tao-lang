# Writing AGENTS.md

The canonical rules for editing root `AGENTS.md`, a nested `AGENTS.md`, or a `SKILL.md`. `SKILL.md`
owns _where_ a rule goes; this owns _how it is written_ once you know. External practice on these
questions is genuinely contested, so where we chose a side, the choice is stated with its reason —
so that a later reader disagrees with the argument rather than re-running the research.

## Enforcement outranks prose

- A rule a hook, `repo-lint`, or a gate enforces does not also get written down. Two owners of one
  rule drift, and the prose copy is the one nobody updates.
- Prefer moving a rule into enforcement over stating it better. A refusal arrives at the moment the
  agent is about to get it wrong, names the fix, and costs one turn; prose is read once at session
  start and competes with everything else in the file.
- A rule that cannot be enforced — judgment, product semantics, what to ask the Developer about, how to report —
  stays prose. That is what the file is for.
- Before adding a line, apply the removal test: would an agent make a mistake if this line were not
  here? If a hook would have caught the mistake anyway, the answer is no.

## Skill size

- Keep each `SKILL.md` within its existing 12,000-character budget; supporting references have no
  fixed budget.

## How much "why"

- A rule in an instruction file carries **at most one clause** of why. The full argument belongs in
  the code that implements it — `OutputDiscipline.ts`'s header explains at length why a refusal beats
  a warning, and `AGENTS.md` gets a clause.
- This is the house answer to a contested question. One camp says cut rationale entirely because
  agents ignore it; the other ships rationale-heavy files. The split resolves both: the instruction
  file stays operational and small, and an agent that goes looking for why a rule exists finds a real
  argument instead of re-deciding the question.
- What earns the clause is a reason an agent would otherwise route around — a cost, a hazard, a thing
  that looks wrong but is deliberate. "Because it is cleaner" earns nothing.

## What belongs, and what does not

- Include what an agent cannot infer from the repository: commands it could not guess, conventions
  that differ from the obvious default, constraints coming from outside the code (concurrency, the
  sandbox, the Developer's authority), and who owns which decision.
- Exclude anything readable from the code, routine engineering steps, tutorials, incident history,
  and calibration-period framing.
- Be wary of values and style prose. It is the category with the least evidence behind it — the one
  practitioner study with a stated method found that "we value clean, well-tested code" changed
  nothing measurable. Keep what the Developer has asked for directly; do not add more on your own initiative.

## Structure

- One rule per bullet, stated as an outcome or a constraint rather than a procedure.
- Nest an `AGENTS.md` into a subtree only when its rules apply to nearly every edit there; the
  closest file wins, which is the AGENTS.md convention's own precedence rule.
- Name the owning skill rather than summarising it. A pointer stays correct when the skill changes.
- Say the thing once. If a rule already lives in a skill, the root file names the skill.

## After editing

- Follow the checkout's `AGENTS.md` validation policy. Root `./agent check` runs the current checks;
  use `./agent test ./` for the root workspace tests. In a
  Developer-directed primary `dev/<name>` checkout, use focused checks and defer full verification
  until authorized landing.
- Search for what you removed — a deleted rule usually has a second mention somewhere, and that
  mention is now the only owner of a rule nobody enforces.
