# Repository development

These guides describe working on this repository. The [language specifications](../Specification/)
describe Tao for app authors; the [roadmaps](../Roadmap/) track planned work.

- [Preview Workflow](Preview%20Workflow.md): run the persistent two-frame developer page and understand refresh receipts.
- [Testing](Testing.md): select suites, parallelism, slow-test warnings and terminal/log output.
- [Source Tools](Source%20Tools.md): formatter/fixer implementation boundaries and editor integration.
- [Reference Verification](Reference%20Verification.md): run the smaller legacy language/Studio reference lane and find deferred maintenance checks.
- [Performance](Performance/README.md): choose a benchmark, find historical measurements and distinguish diagnostic runs from commit history.

Keep temporary investigations and task progress in `.artifacts/notes/`, `.artifacts/checkpoint/`
or `.artifacts/progress/`. Those survive ordinary cleanup; they are not documentation of current behavior.
