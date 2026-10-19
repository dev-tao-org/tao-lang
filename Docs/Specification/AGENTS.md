# Specifications

- Write for people building apps with Tao. These files explain the language: syntax, semantics and observable behavior, independent of this repository's implementation.
- Put repository architecture, contributor commands, setup, verification, profiling and implementation notes in `Docs/Dev Env/`, not here. Product commands may appear when they help a Tao user exercise the language feature.
- Write one file per coherent reader topic, such as Live Previews or Tests; split when understanding one topic does not require the other, rather than by implementation package or individual syntax rule.
- Lead with realistic Tao examples and explain their behavior in nearby commentary, following `Live Previews.md` and `Tests.md`. Give enough context for a firm grasp of the topic without exhaustively listing syntax or edge cases.
- Keep examples and explanations aligned with implemented behavior. Clearly distinguish agreed future behavior from what currently runs; preserve deliberately specified future features when updating an existing file.
