# Repository development

These guides describe working on this repository. The [language specifications](../Specification/)
describe Tao for app authors; the [roadmaps](../Roadmap/) track planned work.

- [Preview Workflow](Preview%20Workflow.md): run the persistent two-frame developer page and understand refresh receipts.
- [Testing](Testing.md): select suites, parallelism, slow-test warnings and terminal/log output.
- [Repository APIs](Repository%20APIs.md): package entrypoints, shared serialization/ordering and source/test ownership.
- [Source Tools](Source%20Tools.md): formatter/fixer implementation boundaries and editor integration.
- [Generated Output](Generated%20Output.md): source-owned modules, TypeScript navigation and current disk snapshots.
- [Reference Verification](Reference%20Verification.md): run the smaller legacy language/Studio reference lane and find deferred maintenance checks.
- [Review Learning](Review%20Learning.md): capture human corrections as scoped lessons and propagate equivalent fixes within review approval boundaries.
- [Performance](Performance/README.md): choose a benchmark, find historical measurements and distinguish diagnostic runs from commit history.

Keep temporary investigations and task progress in `.artifacts/notes/`, `.artifacts/checkpoint/`
or `.artifacts/progress/`. Those survive ordinary cleanup; they are not documentation of current behavior.

After the developer approves a dependency and exact version, add it to a workspace package with
`./agent dependency-add <directory-under-ts> <package@version>`. Use `--dev` for a development
dependency. The command updates the package manifest and shared Bun lockfile with lifecycle
scripts disabled. Use `./agent unsandboxed dependency-add` with host permission when the
sandbox blocks the installation.

Agent branch publication uses `./agent unsandboxed push origin <branch>`. It pins the matching local
branch's commit and publishes only that destination. Use `--source <local-branch>` for a different
destination, such as a backup branch. The guard rejects `main`, force pushes, deletions and bulk
pushes, and disables implicit mirror, tag and submodule publication. Landing remains separately
authorized. Native agent permissions allow this guarded operation rather than unrestricted Git pushes.
