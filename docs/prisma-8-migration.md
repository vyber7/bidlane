# Prisma 8 migration

This branch has a parallel Prisma 8 toolchain and typed contract. The seven
string-ID collections now use native MongoDB repositories through the shared
v8 connection pool. Password-reset credential changes also use native sessions
so reset-token consumption, session invalidation, and queued notices stay atomic.
Authentication and account access now use native `User`/`Account` repositories:
NextAuth v4, registration, credentials, session checks, current-user DTOs,
profile edits, notification preferences, recovery-worker identity lookups, and
the administrator role command. Bidding, auction start/end/finalization, and
ending-soon reminders also use native sessions. Drafts, listing publication,
moderation, and seller media/VIN/record edits now use native repositories as well.
General listing reads, comments, watchlists, views, notification/email delivery,
and email verification still have Prisma 6.19.3 callers. The typed v8 ORM has not been
switched on for application queries.

## Working commands

```bash
npm ci
npm run db:generate
npm run db:validate
npm run db:v8:emit
npm run db:v8:check
npm run db:native:indexes
npm test
npm run lint
npx tsc --noEmit
npm run build
```

`db:generate`, `db:validate`, `db:push`, and `db:studio` call the v6 CLI by its
explicit path. The separately installed `prisma-v8` alias is the v8 CLI; both
packages expose the same `prisma` executable, so do not use bare `npx prisma`
during this transition. This also keeps the build independent of npm's binary
link order.

`prisma8.config.ts` is deliberately an emit-only config without database
credentials or inherited configuration. `db:v8:emit` runs offline and writes
`prisma/v8/contract.json` and `contract.d.ts`; commit both generated files and
regenerate them when the contract changes. The build emits them automatically.
The existing `prisma/schema.prisma` remains the source for v6 generation.

## Editor support during the migration

Keep the workspace pinned to Prisma 6 (`prisma.pinToPrisma6` in
`.vscode/settings.json`) while the legacy schema remains active. Its language
server recursively loads `.prisma` files under the schema directory as one
schema, including nested files. A v8 PSL file beside the v6 schema therefore
produces false errors in both files, even when both CLI checks pass. The
`// use prisma-8` header does not isolate it when the editor is pinned to v6.

The v8 source now uses Prisma's supported [TypeScript contract builder](https://www.prisma.io/docs/orm/contract-authoring/typescript-schema-builder)
in `prisma/v8/contract.ts`. Do not add v8 `.prisma` files under `prisma/` during
this parallel-toolchain phase. TypeScript provides editor checking for the v8
source, and the Prisma 6 extension continues validating `prisma/schema.prisma`.

This authoring-format change preserves byte-identical `contract.json` and
`contract.d.ts` artifacts, including storage, execution, and profile hashes.
The contract regression suite compiles the TypeScript source into a temporary
directory and compares it with both committed artifacts. No database change is
needed. Close any old `contract.prisma` tab and run **Prisma: Restart Language
Server** (or **Developer: Reload Window**) to clear stale editor diagnostics.

## Connection checks

`db:v8:check` loads `.env` if present, respecting an existing `DATABASE_URL`, and
only runs MongoDB `buildInfo` and `hello`. Its `ready` value means the server is
MongoDB 8.0+ and supports transactions through a replica set or sharded cluster;
it does not certify data compatibility or production cutover readiness. It
does not read user documents, create validators/indexes, or sign a database.

The pinned versions are CLI `8.0.0-rc.33` and library `8.0.0-rc.23`. Prisma
publishes these packages independently. `mongodb` 7 is installed explicitly.
A scoped `@vercel/nft` override uses patched `glob` 14.0.2+ for the CLI's
Compute tooling ([GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4)).
Recheck this override when updating the toolchain.

## Contract scope and compatibility

The v6 schema importer rejects this app's string IDs, literal defaults,
cascades, optional generated timestamps, and list-backed many-to-many
relations. Rather than weaken the active v6 schema, the separate
`prisma/v8/contract.ts` describes the ten ObjectId-backed collections:
`Account`, `User`, `Notification`, `Listing`, `ListingReview`, `Comment`, `Bid`,
`BidSubmission`, `EmailVerification`, and `ListingDraft`.

All persisted fields, field mappings, nullability, list element types, enum
values, collection names, and index names are preserved. In particular, v6
`Int` fields remain BSON longs through `field.int64Number()`; changing them to `field.int32()`
would change storage. Tests compare the emitted contract with v6's generated
metadata to catch omitted fields and codec drift. The existing unique indexes
for accounts, emails, bid request keys, and notification keys stay named as v6
created them.

Seven collections retain native string `_id` values and are intentionally
outside the typed contract: `ContactRateLimit`, `UploadedAsset`, `UploadQuota`,
`AbuseQuota`, `PasswordReset`, `PasswordResetQuota`, and `RecoveryEmail`. Their
IDs encode quota buckets, asset identities, or recovery workflow keys; rewriting
them as ObjectIds would break application contracts. Their application queries
now use `prisma/native/` repositories. Foreign-key fields still store ObjectIds,
integer fields still store BSON longs, and DTOs retain their existing string IDs
and JavaScript numbers. Native duplicate-key errors replace Prisma `P2002` in
quota creation races, while other storage failures still fail closed.

The v6 schema retains these model declarations for index management and legacy
client compatibility during the transition; application access to these seven
collections no longer goes through that generated client. The recovery worker's
case-insensitive `User` lookup also uses the native account repository.

## Authentication and account access

`app/libs/auth-adapter.ts` implements the application's NextAuth v4 OAuth
adapter using native repositories. It supports user/profile lookups, OAuth
creation, provider-subject lookup, linking and unlinking. It is scoped to the
existing JWT session strategy; database sessions, passwordless verification
tokens, and user deletion are unsupported and have no adapter methods. There
are no new session/token collections or account-deletion cascade assumptions.
The old `@next-auth/prisma-adapter` dependency is removed.

Credentials still try the exact stored email first, then accept a single
case-insensitive identity match. OAuth lookups reject ambiguous legacy matches;
new password and OAuth users share the same ASCII email grammar, canonical
email writer and existing exact unique email index. Native matching escapes
regex metacharacters and uses absolute anchors, preserving dot/plus aliases
and excluding trailing-newline lookalikes. Existing stored email spelling is
preserved for sessions and recovery proofs; email changes remain unsupported.

New OAuth connections to password accounts remain blocked, including signed-in
linking attempts. Provider-subject login still works when a provider changes its
email. Linking checks the owner and inserts the account in a native session.
User and account IDs remain ObjectIds, OAuth expiry integers remain BSON longs,
and new users explicitly receive their timestamps, role, email opt-ins, null
fields, and relation-array defaults. Provider/profile updates use field
allowlists; they cannot change roles, password hashes, or session versions.

JWT decoding checks the current stored email and session version on every
request, including the Node.js page proxy. Credentials capture the version
before bcrypt comparison so racing resets cannot grant an old login a new
version. Current-user and adapter DTOs use explicit field allowlists. Admin
access still reads the current database role; the trusted operator command uses
an exact email match and updates `updatedAt` without creating users.

## Auction transactions

`prisma/native/auctions.ts` implements the lifecycle persistence used by
`/api/place-bid`, `/api/auction-start`, `/api/auction-end`, the shared finalizer,
and ending-soon reminders. Scheduled and public finalization share the same
conditional native claim and notification transaction.

A bid transaction reads its user-scoped request key, checks the current auction,
claims the previous price/deadline, writes the bid, updates both
`Listing.biddersIds` and `User.BidOnListIds` with `$addToSet`, saves outbid
notifications, and stores the accepted response snapshot. Native writes keep
ObjectId references, BSON long integer fields, timestamps, and public DTO
allowlists compatible with v6. A successful replay returns the original snapshot
before verification/quota checks and never repeats a bid or broadcast. Missing
and null first-bid prices remain equivalent. A last-minute bid still extends
the deadline to two minutes after its acceptance time.

Auction starts require seller ownership, approval, and the current review
revision, including legacy missing/null revision zero. Finalization compares
both the previous price and deadline, then re-reads after a lost claim so a
committed last-minute extension wins. Reminder claims include the live state,
current final-hour deadline, and missing/null reminder marker. Every claim
commits together with its notifications; failed notification writes roll back
state changes and failed bid snapshots also roll back both relation arrays.

Auction transactions use a five-second driver timeout and at most three
application-callback attempts per transaction. The driver owns transient and
commit retries. Bid duplicate-key races can open at most three transactions to
read a concurrent winner's snapshot; exhausted contention returns a retryable
`503` using the same request key. An unknown commit result is never treated as
a duplicate-key replay trigger. Quota charges intentionally use the independent
pool and are cached once per request across retries. Pusher publication happens
only after the transaction resolves; external delivery remains best effort.

`prisma/native/notifications.ts` inserts immutable events with `$setOnInsert`,
explicit null fields, email-attempt defaults and queue timestamps. Event replay
preserves read timestamps and email delivery state. `saveNotifications` supports
either native repositories or the remaining v6 comment transaction; a native
transaction never invokes the v6 writer, and v6 transactions never invoke the
native writer.

## Listing drafts, publication, and moderation

`prisma/native/drafts.ts` handles private draft creation, owner reads/lists,
revision-guarded saves, deletion markers, and publication links. Draft APIs,
account draft lists, and the submission resume page use these native reads.
ObjectId ownership, BSON long revisions, JSON payloads, and explicit timestamps
remain readable by the v6 client. Draft DTOs exclude internal owner/save-key
fields and normalize saved content through the existing draft schema.

Create retries compare the original save key and normalized payload, including
a fresh transaction after a concurrent duplicate-ID insert. Saves use atomic
compare-and-swap updates; a lost race returns the saved result only when its key
and payload match. Deleted drafts retain an empty tombstone so an uncertain
create retry cannot restore private content. Explicit-null deletion/publication
filters retain v6's distinction between null and missing fields. Null or missing
draft revisions retain v6's read default of one, while write guards still match
the actually stored revision.

Publication creates the listing and stores the draft link in one native
transaction. A retry returns only the existing owned listing ID, even after
its auction starts or email verification is revoked; new publication still
requires verified email and validates the saved snapshot. Draft checklist and
step fields never enter a listing. Direct submissions use the same native
listing writer, with owned-media checks and an explicit field allowlist.
New listings supply timestamps, BSON long numbers, views, review state, nullable
fields, and empty relation arrays rather than relying on Prisma defaults.

`prisma/native/listing-authoring.ts` implements listing creation, review queues,
review detail/history, conditional decisions, and seller media edits. A review
transaction changes the current upcoming revision and inserts its audit record
together. Fresh database admin checks protect both API and server reads. Queue
pagination remains oldest-first with 21-row lookahead; detail reads include
only the seller's name/email and the latest 50 audit records through explicit
DTO allowlists.

Gallery, cover, VIN, and record edits require the current owner, upcoming state,
and review revision. They reset approval and increment that revision in the same
atomic write. Gallery additions also match the previous image array; competing
additions cannot lose photos or exceed the existing limit. Auction start shares
the same revision and state guard, so a stale approval cannot race a seller edit
or a moderation decision. Existing media is grandfathered only on the owned
object being edited; immutable upload registrations still validate new media.

Draft create, publication, direct submission, and moderation use bounded native
sessions (three callback attempts and a five-second driver timeout). External
side effects are absent from these transaction callbacks. The local integration
suite forces failed publication-link and audit writes to verify persisted
rollback, and exercises concurrent saves/deletes/publications/reviews/starts.

## Native indexes

`prisma/native/indexes.mjs` defines the existing twenty-three named secondary indexes
on fourteen collections, including user emails, provider subjects, bid request
keys, notification event keys, asset URLs, reset-token hashes, and lifecycle
query indexes. The notification pagination index preserves its existing
`Notification_userId_createdAt__id_idx` name, including the stored `_id` field.
The `_id` index continues
to enforce string-key uniqueness. Expiry indexes are regular indexes rather
than TTL indexes; cleanup retains the existing application-driven windows.

`npm run db:native:indexes` is a metadata-only check of the configured database.
For a new database, `npm run db:native:indexes -- apply` creates missing indexes
additively and checks them. Conflicting definitions fail; the tool does not
drop or recreate an index or collection. Verify the check before deploying.

**This is not a complete database-management contract.** Do not run v8
`db update`, `db sign`, or migrations against a shared database using it yet.
The native indexes above cover those collections. Before baselining, rehearse
how v8 migration diffs exclude them and validate existing documents against
the typed collections' stricter validators.

## Client and transaction boundary

Server code obtains the shared pool through `getDatabaseV8` from
`app/libs/prismadb-v8.ts`. It lazily creates a client and reuses it through
development reloads. The shared factory in `prisma/v8/client.ts` binds the typed
ORM and native driver to the same named database and connection pool. It
rejects URLs without a database name. Use `close()` for short-lived tools.

The v8 ORM has no MongoDB transaction wrapper in this release. The
`withTransaction` helper uses native sessions with snapshot reads, majority
writes, and primary read preference. Its callback receives `(database,
session)`. Every native operation must receive `{ session }` and execute
sequentially. ORM queries inside that callback do **not** join its session.
The driver may retry the callback, so publish Pusher events and send emails only
after the transaction promise resolves. Application code uses
`withNativeTransaction` from `app/libs/native-repositories.ts`, which binds
every repository operation to that session automatically. Password-reset
request queuing and redemption both use this boundary, including the native
`User` credential update and its `updatedAt` timestamp.

Upload registrations are immutable. Their ownership checks use the native
read pool even from a remaining v6 listing/comment transaction. These reads
are not participants in the v6 session; listing/comment writes and their
notifications remain together in the original v6 transaction. No native writes
are mixed into that transaction.

## Native integration tests

The regular test suite covers business policies and duplicate-key fallback.
Integration tests additionally exercise actual BSON encodings, concurrent
counters, ownership filters, unique indexes, native/v6 read compatibility,
reset single-use semantics, persisted transaction rollback, email lease
fencing, NextAuth OAuth signup/linking, credential login, JWT revocation,
profile/preference permissions, admin-role revocation, auction/bid contention,
exact bid replays, stale deadlines/approval revisions, draft save/publication
races, moderation/seller-edit races, and persisted rollback on a local replica set. Start a disposable MongoDB 8+ replica set, then run:

```bash
NATIVE_TEST_DATABASE_URL='mongodb://127.0.0.1:28019/bidlane_test_native_strings?replicaSet=bidlane-test' npm test -- prisma/native/
```

Use the port and replica-set name of your local server. These tests only accept
one `127.0.0.1` host and a database named `bidlane_test_native_*`. They reset and
drop that test database. Authentication, auction, and authoring suites append
`_auth`, `_auctions`, and `_authoring` to isolate their databases when run in
parallel. Rollback tests temporarily reject writes using validators only in
their disposable local database and restore those validators afterward. Tests never fall back to
`DATABASE_URL`, send mail, or contact Cloudinary. Without the explicit test URL
they are skipped. The
migration was verified against a local MongoDB 8.0.37 replica set; the configured
shared database was only queried for server metadata and existing index definitions.

## Remaining migration work

1. Migrate comments, listing views, watchlists, notification reads/email
   delivery, and email verification. Preserve ownership
   checks, conditional updates, race retries, and related writes in the same
   native session.
2. Replace nested `connect`/`disconnect` updates with explicit foreign-key and
   array operations, updating both sides atomically as bidding now does.
   Many-to-many key arrays
   remain persisted fields; they are not v8 ORM relations.
3. Supply remaining literal/default array values explicitly on creation. Preserve
   any remaining defaults when those writers migrate. Native listing, draft,
   review, user, bid, notification, queue, and asset defaults are already explicit.
   `Listing.lastCommentAt` and `updatedAt` stay
   nullable; migrated writes must supply their timestamps. Implement any
   required cascading cleanup explicitly before retiring v6's emulation.
4. Port remaining reads and generated model/filter/payload types to the chained v8 API.
   Preserve public-field allowlists, moderation visibility, pagination,
   `null` versus missing fields, and optional legacy fields/defaults on reads.
5. On a disposable copy of the database, inspect existing BSON types, missing
   fields, extra fields, and index names before introducing strict validators.
   Finalize management of the native collections, inspect the full migration
   delta, and extend the local transactional integration tests to those flows.
6. Cut over the remaining application and operator commands together, then remove v6,
   its generated client and dependency override. Replace the emit-only
   config with the reviewed migration config at that point.

## References

- [MongoDB v6 to v8 migration guide](https://www.prisma.io/docs/guides/upgrade-prisma-orm/mongodb)
- [Prisma release status](https://www.prisma.io/docs/orm/release-status)
- [Contract emission](https://www.prisma.io/docs/cli/contract-emit)
- [MongoDB native driver transactions](https://www.mongodb.com/docs/drivers/node/current/crud/transactions/)
