# Semantic AST generation

- Preserve recognized statements and source ranges even when their placement is invalid. AST transformation must not reject, omit or reinterpret statements solely to enforce owner, order or location restrictions; semantic validation owns those diagnostics.
