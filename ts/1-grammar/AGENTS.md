# Grammar

- Parse syntactically well-formed statements independently of where they are permitted. Do not use location-specific statement alternatives or ordering rules to reject a recognized statement solely because it appears in the wrong block or position.
- Preserve misplaced statements and their source ranges in the parse tree. Placement, ordering, multiplicity and owner restrictions belong to `ts/2.5-source-validation/`.
- Continue diagnosing malformed syntax and resolving genuine grammar ambiguities. Permissive placement does not mean accepting malformed statements or inventing context-dependent meanings.
