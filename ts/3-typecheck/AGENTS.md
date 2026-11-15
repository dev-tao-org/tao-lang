# Semantic validation

- Validate statement placement, allowed owners, ordering and multiplicity after parsing. Report a focused diagnostic on a misplaced statement with the allowed context; do not rely on parser failure to enforce these rules.
- Handle parsed but misplaced statements without crashes or silently ignoring them. Keep unrelated diagnostics available, and prevent invalid programs from reaching code generation through the normal validation gate.
- Placement regressions must demonstrate that the statement parses and receives the intended validator diagnostic, rather than accepting a generic parse error as proof.
