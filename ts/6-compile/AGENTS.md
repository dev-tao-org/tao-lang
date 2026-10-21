# Compile

- Compile semantic ASTs from `ts/2-ast-gen/` into code that runs inside Expo apps.
- Almost all generated code should map to a Tao runtime function, such as `TR.IfElse(...)` or `TR.ViewDefinition(...)`. Most compiler and runtime concepts should have corresponding `TR` implementations; keep generated code minimal and put as much functionality as possible in the runtime.
- Generated code owns literals, references, callbacks, module wiring and authored injections. Shared Tao semantics, rendering, state and lifecycle behavior belong in the handwritten runtime under `ts/7-runtime/runtime-src/`.
- Consult the old compiler for naming and generation-helper conventions. Prefer `Compile.<Node>` handlers and shared generation helpers; keep files grouped around substantial responsibilities.
- Generation helpers take the relevant AST node or linked record, rather than callers extracting its name or target string. Give repeated callback and input shapes named types. Keep orchestration in named compilation steps; property access for analysis, identity keys and diagnostics may remain local.
- Each generated runtime operation such as `TR.LetReference` normally has one emission site, shared by its callers. Use typed helpers and exhaustive dispatch when source kinds select different operations; do not build a generic string-driven runtime-call API or wrap every interpolation.
- In compiler implementation, keep `JSON.stringify` in the small serialization utilities in `codegen-util.ts`. Distinguish quoted names/literals from unquoted identifiers and authored code; typed name, reference and binding emitters own that distinction. Tests may serialize independent expected values.
- Compile view names generically; do not encode built-in Text, Col or Row behavior in code generation.
- Generate calls against defined runtime contracts. Code-generation tests alone do not prove that an Expo app runs.
