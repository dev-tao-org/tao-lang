# Tao Provider Conformance

Tao matches the guarantees a program requires against the capabilities its provider adapter implements. Author-visible access and mutation behavior belongs in [Data Access and Validation](../Specification/Data%20Access%20and%20Validation.md).

## Contracts and proof

- The generated SDK exposes a callback transaction boundary. The adapter implements it and supplies executable conformance evidence.
- Generate one candidate-validation function per validated entity and invoke it automatically on the client. The server adapter must invoke the generated validator or enforce provably equivalent provider-native rules on the values that actually commit, using the transaction-protected context required by the entity's rules. Client validation does not replace authoritative enforcement.
- Include the concrete datasource client in the generated app build and typecheck it against the generated interface, including typed outcomes. Compilation fails when the adapter cannot satisfy required validation or other declared capabilities. TypeScript conformance does not by itself prove transaction semantics.
- Unsupported guarantees are rejected. The adapter must show that authoritative access and validation and the mutation share conflict protection, including when permission data changes concurrently.
- Queries must return matching readable records, deriving restrictions from the access policy. Reject unsupported policy/query combinations during compilation. Prove the owner-only query returns only the caller's records across managed providers, without requiring authors to repeat the grant in each query.
- The revision-check journey submits edits with a captured revision and exercises stale-write and access rejection. Provider-internal retries must preserve submitted intent and recheck current authority as required by the transaction contract. Language-level retry identity and replay are deferred in [Advanced Action Execution](Advanced%20Action%20Execution.md) and are not prerequisites for this journey.
- Prove the contract through an authored Tao journey and a real compiled library consumed by an ordinary TypeScript application.

The [runtime PoC](Tao%20Runtime%20PoC.md) tracks proof for the transactional SDK adapter, Firestore and Convex.

## Existing HTTP servers

For custom TypeScript HTTP integration, Tao generates interfaces and validation functions. The server implementer owns routes, schema, migrations, queries and correct atomic execution. This boundary does not restrict managed providers from generating and deploying their supported server configuration.

Active live queries are batched for polling. The server returns complete query results; the client adapter computes differences.

## Managed deployment contract

The accepted deployment entry point is `tao ship [path]`, with `--app`, `--data`, `--ios`, `--android`, `--desktop`, `--web`, `--all`, `--beta`, `--prod`, and `--dry-run`. Beta and production modes are mutually exclusive and distribution-only. All selects data and every distribution target. Initial distribution targets report `NotImplemented`; preflight rejects unsupported selected targets before changing a datasource.

The compiler owns the selected app deployment definition. A provider plans against its live schema and rules, then applies the plan through an explicit deployment. Schema and access rules belong to the same deployment definition. Dry run is read-only. Exact migration compatibility, policy differences and partial-application behavior still need design; additive-only changes were a recommendation, not an accepted restriction.

The first managed deployment is private Notes on self-hosted InstantDB with built-in email-code sign-in. Auth and data share the configured application/session. The provider supplies the authenticated owner on creation; authoritative rules enforce ownership and prohibit reassignment. Notes declares an explicit policy. Railway remains the selected hosting target, with local Compose for development.

Provider-owned transport recovery must distinguish local acceptance from attributable authoritative confirmation. Before promising draft binding after an offline create, demonstrate a later confirmation on the selected self-hosted InstantDB build. An enqueued transaction result is insufficient. No universal recovery engine or new public invocation-handle API is implied.

App sign-out invokes provider logout. The provider owns clearing its local state through that lifecycle; Tao clears its own app state and persisted drafts. Use the provider's logout behavior rather than adding a universal queue cancellation or cleanup algorithm.
