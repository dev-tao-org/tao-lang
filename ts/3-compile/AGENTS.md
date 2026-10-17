# Compile

- Compile semantic ASTs from `ts/2-transform/` into code that runs inside Expo apps.
- Almost all generated code should map to a Tao runtime function, such as `TR.IfElse(...)` or `TR.ViewDefinition(...)`. Most compiler and runtime concepts should have corresponding `TR` implementations; keep generated code minimal and put as much functionality as possible in the runtime.
- Generated code owns literals, references, callbacks, module wiring and authored raw injections. Shared Tao semantics, rendering, state and lifecycle behavior belong in the handwritten runtime under `ts/runtime/runtime-src/`.
- Consult the old compiler for naming and generation-helper conventions. Prefer `Compile.<Node>` handlers and shared generation helpers; keep files grouped around substantial responsibilities.
- Compile view names generically; do not encode built-in Text, Col or Row behavior in code generation.
- Generate calls against defined runtime contracts. Code-generation tests alone do not prove that an Expo app runs.
