# Source validation

- Validate statement owners, ordering, multiplicity and authored names using the complete semantic AST. Keep rules requiring project context, linking or a specific target with their respective owners.
- Report misplaced statements at their authored ranges with the allowed context. Keep unrelated diagnostics within the same document available and reject structurally invalid reachable sources before dependency resolution and generation.
- Placement regressions must demonstrate that the statement parses and receives the intended validator diagnostic.
