# Compile

- Compile semantic ASTs from `ts/2-ast-gen/` into code that runs inside Expo apps.
- Almost all generated code should map to a Tao runtime function, such as `TR.IfElse(...)` or `TR.ViewDeclaration(...)`. Most compiler and runtime concepts should have corresponding `TR` implementations; keep generated code minimal and put as much functionality as possible in the runtime.
- Generated code owns literals, references, callbacks, module wiring and authored injections. Shared Tao semantics, rendering, state and lifecycle behavior belong in the handwritten runtime under `ts/7-runtime/runtime-src/`.
- Apply this boundary to examples and stubs as well as implementation. Generated calls express authored operations; shared batching, observation, caching and lifecycle mechanics belong in runtime operations rather than repeated generated wrappers.
- When planning compiler additions or structural changes, first identify patterns in the current compiler, then frequently consult `.x-tao-old-v1/` for how its code generation was structured. Use `old-repo-porting`; adapt useful patterns rather than copying its architecture.
- Current and previous implementations are evidence for semantics and pitfalls, not reasons to retain an inferior architecture. Prefer preview performance, then simplicity and DRY behavior, then support for agreed upcoming features; explain material departures before broad integration.
- Before introducing or changing compiler organization, ask the developer how they want the intended code structured. Present the relevant current and old patterns, recommend any patterns to add with short code snippets, and settle handler contracts and required context before implementation. Reuse an already agreed structure without reopening it.
- Generation helpers take the relevant AST node or linked record, rather than callers extracting its name or target string. Give repeated callback and input shapes named types. Keep orchestration in named compilation steps; property access for analysis, identity keys and diagnostics may remain local.
- Each generated runtime operation such as `TR.LetReference` normally has one emission site, shared by its callers. Use typed helpers and exhaustive dispatch when source kinds select different operations; do not build a generic string-driven runtime-call API or wrap every interpolation.
- In compiler implementation, use shared `Json.Print` through the small serialization utilities in `codegen-util.ts`. Distinguish quoted names/literals from unquoted identifiers and authored code; typed name, reference and binding emitters own that distinction.
- Compile view names generically; do not encode built-in Text, Col or Row behavior in code generation.
- Generate calls against defined runtime contracts. Code-generation tests alone do not prove that an Expo app runs.
- Compile structurally validated statements. `ts/2.5-source-validation/` owns placement diagnostics.
