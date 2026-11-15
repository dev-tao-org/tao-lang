# Tao Provider Conformance

Tao matches the guarantees a program requires against the capabilities its provider adapter implements. Author-visible access and mutation behavior belongs in [Data Access and Validation](../Specification/Data%20Access%20and%20Validation.md).

## Contracts and proof

- The generated SDK exposes a callback transaction boundary. The adapter implements it and supplies executable conformance evidence.
- Generate one candidate-validation function per validated entity and invoke it automatically on the client. The server adapter must invoke the generated validator or enforce provably equivalent provider-native rules on the values that actually commit, using the transaction-protected context required by the entity's rules. Client validation does not replace authoritative enforcement.
- Include the concrete datasource client in the generated app build and typecheck it against the generated interface, including typed outcomes. Compilation fails when the adapter cannot satisfy required validation or other declared capabilities. TypeScript conformance does not by itself prove transaction semantics.
- Unsupported guarantees are rejected. The adapter must show that authoritative access and validation and the mutation share conflict protection, including when permission data changes concurrently.
- The revision-check journey submits edits with a captured revision and exercises stale-write and access rejection. Provider-internal retries must preserve submitted intent and recheck current authority as required by the transaction contract. Language-level retry identity and replay are deferred in [Advanced Action Execution](Advanced%20Action%20Execution.md) and are not prerequisites for this journey.
- Prove the contract through an authored Tao journey and a real compiled library consumed by an ordinary TypeScript application.

The [runtime PoC](Tao%20Runtime%20PoC.md) tracks proof for the transactional SDK adapter, Firestore and Convex.

## Existing HTTP servers

For custom TypeScript HTTP integration, Tao generates interfaces and validation functions. The server implementer owns routes, schema, migrations, queries and correct atomic execution. This boundary does not restrict managed providers from generating and deploying their supported server configuration.

Active live queries are batched for polling. The server returns complete query results; the client adapter computes differences.
