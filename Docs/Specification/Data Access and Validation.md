# Data Access and Validation WIP

The agreed future design assigns access grants and mutation invariants to each entity and applies them on authoritative data.

```tao
data Note / Notes {
   Body text
}
```

#### Access

An applicable grant can authorize the operation. Update and delete evaluate authority using prior state, and update grants can restrict which fields may change. A creation can use submitted values, while authority cannot come from relationships the creation itself would grant. Policies can access the authenticated user when present. MVP policies have no admin override mode.

For an app with no access policy at all, declared collections are public. This default does not grant access to otherwise ungranted collections in an app that declares a policy. Private apps must declare their access policy.

Queries return matching records the caller may read. Providers derive the necessary query restrictions from access policies while enforcing authorization authoritatively. A provider that cannot faithfully implement a policy/query combination rejects it during compilation rather than substituting provider-specific query rejection or returning unauthorized records.

#### Validation

Every applicable invariant must hold. Entity validation applies to create, update, or delete. A write rule covers both creation and update, and has no prior entity on creation. Multiple blocks may carry descriptive string labels. These labels are descriptive only.

#### Transactions

Every MVP mutation runs in a transaction that includes access checks, validation and conflict protection for permission reads. A standalone mutation opens its own transaction. An explicit transaction can group mutations. Other work in the surrounding UI action executes outside that boundary.

#### Revision checks

An app can require an updated revision to equal the authoritative previous revision plus one. The submitted revision remains captured even if a provider internally retries the transaction, so a change to the stored revision can cause rejection. The provider must uphold the transaction guarantees required by the rule. This does not require the deferred language-level action retry feature.
