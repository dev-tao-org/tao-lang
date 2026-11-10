# Repository guidance during review

Read current owners for the area being discussed; do not load every reference for every chunk or
copy their rule lists into review notes. A developer's settled decisions take precedence. Resolve
broken links against the current tree rather than substituting an old checkout's architecture.

| Area                           | Current owner and useful starting points                                                                                                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Every chunk                    | [Root AGENTS.md](../../../../AGENTS.md): conformity, package ownership, roll-forward policy, permissions and communication. Check nearer AGENTS.md files for the selected paths.                                         |
| Language behavior              | [Specifications](../../../../Docs/Specification/) and the owning grammar/linker/compiler code. Consult the retained implementation only as authorized by root guidance; distinguish current behavior from future syntax. |
| Specification edits            | [Specification AGENTS.md](../../../../Docs/Specification/AGENTS.md). Illustrate language proposals through [language design examples](../../tao-language-design-examples/SKILL.md).                                      |
| Compiler/runtime boundary      | [Compiler AGENTS.md](../../../../ts/6-compile/AGENTS.md), affected generated-code consumers and runtime contracts.                                                                                                       |
| Preview or watched compilation | [Pipeline performance](../../pipeline-performance/SKILL.md); preserve publication ordering, invalidation and existing performance evidence.                                                                              |
| Developer automation           | [CLI guidance](../../../../ts/CLIs/AGENTS.md) and [dev automation](../../dev-automation/SKILL.md). Product behavior and repository workflows have different owners.                                                      |
| Tests and verification         | [Test quality](../../test-quality/SKILL.md) and [verification lanes](../../verification-lanes/SKILL.md). Exercise Tao-owned behavior, retain failures, keep host/platform proof distinct.                                |
| Git changes or removal         | [Git workflow](../../git-workflow/SKILL.md), [removing code](../../removing-code/SKILL.md). Preserve unrelated work; review branch checkpoints are not integration branches.                                             |
| Proposed structural changes    | Root architecture and nearby existing helpers; critique alternatives proportionally. Do not turn a local correction into an unrequested whole-repository refactor.                                                       |

Refresh guidance when moving to another owner or when a request changes the review question. For
pattern corrections, search the complete review diff and relevant neighboring contracts; record
concrete rechecks for accepted code affected by the correction.

Prefer the current standard coordination model with medium effort for guided execution; propose
higher effort for sustained intricate critique. Let deterministic scripts carry acceptance mechanics.
Follow the current delegation policy for permitted background reviewers rather than freezing model
IDs in this skill.
