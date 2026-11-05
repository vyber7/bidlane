# Account email identity

New password and OAuth accounts use the same trimmed, lowercase email identity
and the same ASCII email grammar. Dots, plus tags, and provider-specific aliases
are not collapsed. New account writes first reject any case-insensitive existing
email match, including legacy mixed-case accounts. They then persist the lowercase
value. The existing database-enforced `User.email` unique index arbitrates
concurrent signups: two requests that both observe availability still attempt the
same unique value. A preflight lookup alone would not prevent that race.

OAuth email lookup also checks case-insensitively and refuses ambiguous matches.
Matching email does not authorize provider linking: new subjects must still use
the existing sign-in method, and password sessions cannot plant OAuth connections.
Already-linked subjects continue signing in by provider identity. Account email
changes are not supported; the adapter rejects a different identity and preserves
stored spelling on equivalent no-op updates.

## Existing accounts

This change does not rewrite stored emails, merge accounts, change user IDs, or
invalidate existing sessions or verification/reset proofs. Password login tries
the exact stored spelling first. If there is no exact match, it permits a
case-insensitive match only when exactly one account exists and returns that
account's original stored email for the session.

Recovery remains case-insensitive, sends only to the stored account address, and
refuses to select between multiple matches. Historical collisions therefore
still need support review; this fix prevents new public signups from creating
them. A valid password or already-linked provider remains usable for an existing
account. Do not resolve a collision by choosing the oldest, verified, or first
account, or by automatically merging provider links, roles, bids, listings, or
other account data. A trusted operator must establish legitimate ownership and
review the affected immutable user IDs, provider connections and sessions before
changing any records. Recheck recovery after resolving a collision.

## Rollout and checks

No schema addition or email backfill is required. Verify the existing
`User.email` unique index is present in the target database, and deploy all
account-creation paths together. Old application instances or direct database
writers that still store arbitrary email case are outside this enforcement;
retire those writers rather than mixing the two policies.

Smoke-test a new mixed-case signup followed by sign-in and recovery; an existing
mixed-case account; and Google/GitHub sign-in with an already-linked provider.
A signup using different capitalization of an existing address must fail without
creating a second account. The automated regression covers the signup-to-recovery
attack and concurrent password/OAuth writes using a simulated exact unique
constraint. It does not replace verifying the actual production database index.
