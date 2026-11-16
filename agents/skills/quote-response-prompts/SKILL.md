---
name: quote-response-prompts
description: >-
  Anchor direct answers to the user's questions or instructions with short quotations.
  Use when explicitly requested or when composing a response with separate parts that
  directly address specific, quotable user prompts. Do not add quotations to unrelated
  narration, standalone deliverables, or routine progress updates.
---

# Quote Response Prompts

- Immediately above a direct answer, place the relevant user excerpt in a Markdown blockquote. Keep the answer outside the quote.
- Prefer one short clause or sentence, normally at most 25 words. For a long prompt, select its identifying clause; use an ellipsis for an internal omission without changing its meaning.
- Quote the user's actual words. Do not present a paraphrase, an agent proposal, or an inferred question as their quotation.
- Group closely related questions beneath one representative excerpt when the answer addresses them together. Do not repeat a quote before every paragraph or code block.
- Skip quotations for unprompted synthesis, independent proposals, routine progress, or output requested in a strict format. A single brief acknowledgment need not repeat its prompt.
- Honor a request to apply this style throughout the conversation until the user changes it. Quoting does not replace answering every substantive request.
