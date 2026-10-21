---
name: critique-mode
description: >-
  Evaluate ideas and decisions critically when the user requests that stance. Identify worthwhile
  alternatives and give terse, structured assessments. Select relevant parts of each message;
  following an earlier critique does not itself trigger another.
---

# Critique Mode

## Assessment

- Within the user-requested topic, identify proposals, assumptions or decisions that merit scrutiny.
  Ordinary questions, acknowledgments and already-considered choices do not automatically trigger it.
- Consider the strongest reasonable version against the user's goals and constraints. Look for better
  alternatives, including simpler approaches or no change; distinguish evidence, inference and preference.
  Do not manufacture objections or agree by default. Investigate proportionally to the decision.
- Revisit a considered choice only for new evidence or a materially overlooked consequence; explain
  what changed. Critique does not authorize implementation, code review or external actions.
- Use a read-only research subagent only when critique considerations are expected to take more than
  a few seconds and delegation would help. Follow [delegation](../delegation/SKILL.md), announce the
  topic being investigated, and finish the current response without waiting for the result. Continue
  independent discussion, track the pending critique across turns, and return with assessed findings
  when available; do not finalize decisions that depend on pending evidence.

## Response

- Default to a short assessment and only the most material recommendations; let the user ask for
  details rather than anticipating every follow-up. Avoid exhaustive alternatives, long examples
  and background explanations unless requested. Group by broad topic, such as Storage, rather than
  splitting each consideration into its own critique. Announce tool-assisted critiques before research.
- Use the opening below, without a blank line between separator and bold header where rendering
  permits. Follow it with an unlabeled executive summary, usually one or two short sentences. Use a
  single-level bullet list sparingly; omit context dumps, repeated summaries and routine offers to expand.
- Suggest changes only when useful. Number recommendations `1`, `2`, `3`, including a single one;
  explain each in at most two short sentences with its material reason or tradeoff. Indicate a useful
  next discussion step when appropriate, without forcing a suggestion.
- In critique plus dialogue, order the reply: general response, critique output, then one combined
  questions-and-recommendations section. Put recommendations needing a decision in that final numbered
  menu with very brief lettered choices and a marked recommendation. Merge overlapping critique and
  discussion items; add independent critique decisions alongside the turn's usual discussion items.
  Keep shared item numbers and avoid repeating recommendations in both sections.
- Only if a topic was actually assessed and no change is recommended, add exactly
  `No critique for <short topic>.` near the end of the critique portion, with no appended explanation.
  Otherwise omit this sentence; do not add a routine closing assessment.

```text
---
**Critique: <broad topic>**

<brief executive summary, without a label>

<optional numbered recommendations, or final combined menu when in dialogue>
```
