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
moderation, seller media/VIN/record edits, comments, listing views, watchlist
updates, and account watchlist reads now use native repositories as well.
Notification feeds/read updates, notification email delivery, and email
verification now use native repositories too. Listing, bid, seller, and
account-summary reads now use the typed v8 ORM. Application code no longer
queries the Prisma 6 client. Builds, generation, and validation use only v8.
The unused v6 provider/schema, CLI, and dev-only client remain for compatibility
comparisons and legacy inspection until those checks are replaced.

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

`db:generate` emits the v8 contract/types offline; `db:validate` emits into a
temporary directory and compares both artifacts without opening a database.
The build runs only v8 emission and Next.js. `@prisma/client` is a development
dependency. `db:legacy:generate`, `db:legacy:validate`, and the existing
`db:studio` use v6 explicitly for comparison tests/inspection. Both CLI packages
expose a `prisma` binary, so continue using npm scripts rather than bare
`npx prisma` until the legacy tooling is removed.

`prisma8.config.ts` is deliberately offline, without database credentials or
inherited configuration. `db:v8:emit` writes `prisma/v8/contract.json` and
`contract.d.ts`; commit both artifacts after changing the TypeScript source.
`prisma.management.config.ts` is used only by guarded adoption commands. It
receives the explicit connection through the environment, and CLI ref/snapshot
files are isolated in command-specific temporary directories. The database's
marker is persisted; rehearsal-local refs are not written into the repository.
The existing `prisma/schema.prisma` remains the source for v6 comparisons.

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
preserves read timestamps and email delivery state. All `saveNotifications`
callers now use native sessions, including comments; the temporary Prisma 6
notification-writer bridge has been removed.

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

## Comments, listing views, and watchlists

`prisma/native/engagement.ts` implements comment creation/reads, listing view
claims, watchlist updates, and public watchlist snapshots. All three mutation
routes use bounded native transactions (three attempts, five seconds). Exhausted
contention returns retryable JSON with status 503. Visibility is checked inside
each callback, so a transaction retry observes a concurrent moderation change.

Comment creation, the listing's `lastCommentAt`/`updatedAt`, and seller alerts
commit together. Author and listing foreign keys remain BSON ObjectIds. The
unrelated `commentsIds`, `commenterIds`, and `listingsCommentedOnIds` arrays stay
untouched, matching the former one-to-many relation update. Comment readers and
realtime payloads expose only the author name. Attachment ownership is checked
before creation, quotas are charged once outside retries, and Pusher events run
only after commit.

Views remain unique per authenticated viewer, anonymous requests only read the
count, and the counter is capped at 2,147,483,647. A successful claim updates
`Listing.seenIds` and `User.seenListIds` in the same session with explicit
timestamps. The native filters preserve Prisma's legacy distinctions: missing
view arrays/counters do not match; null arrays coalesce to empty during push.
An explicit null counter matches but remains null on increment; the first visit
returns the read default plus one, as before. This stage preserves these older
documents rather than silently normalizing them.

Watchlist updates persist the requested boolean using `$addToSet`/`$pull` on
both `Listing.watchersIds` and `User.watchListIds`. Retries preserve intent,
missing arrays initialize on connect, and malformed null arrays fail atomically.
Relation-only updates preserve existing timestamps. Post-commit snapshots and
the account watchlist reader compute watcher counts and viewer membership in
MongoDB, project only public listing fields, and preserve legacy read defaults.
Private watch events stay on the authenticated user's channel; the public
listing channel receives only a count. A failed post-commit snapshot or realtime
notification still returns the successful write response.

The engagement integration suite covers BSON/v6 compatibility, concurrent view
and watch requests, opposite watch intents, rollback of related writes and
notifications, moderation races, single-charge retries, public field allowlists,
legacy missing/null data, and watchlist visibility/order.

## Notification feeds, delivery, and email verification

`prisma/native/notifications.ts` now implements owned cursor anchors, public
feed projections, total/unread counts, and scoped read updates as well as event
insertion. Pagination retains the descending `(createdAt, _id)` boundary and
50-item pages; an anchor remains usable after it is marked read. Other users'
cursors are rejected. Unread filters and read updates match explicit null
`readAt` values, excluding missing fields as Prisma 6 did. Mark-all requests use
the displayed timestamp cutoff, and repeated reads preserve the first timestamp.
Feed DTOs omit event keys, recipient IDs, email payloads, and lease metadata.
Realtime read updates publish only after persistence succeeds.

`prisma/native/notification-emails.ts` implements delivery candidates, atomic
claims, minimal recipient/listing projections, payload preparation, and fenced
completion. Every prepare/finish requires the current `SENDING` lease token.
The worker retains two-minute leases, eight attempts, exponential backoff,
provider rate-limit delays, batch limits, and the 23-hour idempotency cutoff.
Payload and first-attempt time are persisted before HTTP. Recovery after
provider acceptance reuses that exact payload and idempotency key, including
when configuration changes. Current preferences and recipient identity are
checked again, and ending-soon reminders also recheck relevance on retries.
Provider calls never run in a transaction. Legacy missing/null preference,
schedule, and attempt-counter behavior is preserved; malformed legacy records
are not silently normalized by this migration.

`prisma/native/email-verification.ts` stores ObjectId-keyed requests and hashed
tokens. Requests retain the one-minute resend cooldown and 30-minute expiry.
A concurrent initial upsert that loses the primary-key race rechecks the
committed request before returning cooldown. Resends rotate the proof; only the
committed token is emailed, outside the transaction, using the existing URL
fragment and explicit confirmation POST. Confirmation atomically consumes the
exact unexpired hash and updates `User.emailVerified`/`updatedAt` only for the
address originally emailed. Changed/deleted accounts and failed account writes
roll back consumption. Verification transactions are bounded to three attempts
and five seconds; routes retain their retryable 503 failure responses.

The local notification and verification suites cover equal-timestamp pagination,
ownership and cutoff reads, competing workers, expired/stale leases, frozen
provider requests, crash recovery, preferences/relevance, backoff and retry
limits, legacy BSON compatibility, resend/claim races, and persisted rollback.
Mail calls are mocked; no test sends email.

## Typed application reads

`prisma/reads/repositories.ts` uses the installed v8 chained API through the
same `getDatabaseV8` pool. `app/libs/read-repositories.ts` provides these readers
to home/detail pages, live/sold sidebars, seller profiles, account listings,
bid summaries, shipments, and admin counts. Queries use `.where()`, `.select()`,
`.orderBy()`, `.limit()`, `.offset()`, `.include()`, and `.all()`/`.first()`.
Operator predicates use the v8 filter AST from `@prisma/orm-mongo/query-ast`;
plain `.where()` objects express equality, not Prisma 6 or MongoDB operators.
The current ORM has no count terminal, so indexed counts remain native reads
on the same pool rather than fetching whole result sets.

The read adapter supplies Prisma 6's legacy defaults after decoding: missing or
null arrays become empty, views default to one, feature flags to false, and
status to `UPCOMING`. Optional dates/review fields retain null. Defaults never
widen stored-field filters or rewrite documents. Public inventory still includes
only live/ended listings and approved upcoming listings. Sold sidebars retain
four newest sales with a present, non-null current bid, including zero. Seller
history retains its timestamp/ObjectId order, page size, and public projections.

Bid authors are fetched in batches with only ID/name selected. Account bid
history uses the `listing` include and preserves highest-bid/latest-activity
summaries. Shipment reads select only completed sales belonging to the account,
then batch only the seller/winner contact fields required for handoff. Public
seller profiles expose verification as a boolean. Public and seller listing
payloads retain their explicit field allowlists and owner/admin checks.
Application model types now derive from the emitted v8 contract through
`app/types/database.ts`; Prisma 6 filter/payload types are no longer used by
application callers.

The remaining complete-listing PATCH now uses the native authoring repository,
with BSON longs, an owner/status/revision guard, explicit timestamp, and approval
reset in one atomic update. Upload ownership checks also use native authoring
reads; admin counts still authorize against the current account role first.

`prisma/reads/repositories.integration.test.ts` compares actual v8 and v6 results
on a disposable database. It covers BSON/default compatibility, raw visibility,
public payloads, seller pagination, bid grouping, authorized sale contacts,
role revocation, upload ownership, and atomic seller corrections racing with
another correction or an auction start. The application-side v6 client is
mocked to throw if any migrated path accidentally calls it.

## Native indexes

`prisma/native/indexes.mjs` defines the existing twenty-four named secondary indexes
on fifteen collections, including user emails, provider subjects, bid request
keys, notification event keys, asset URLs, reset-token hashes, and lifecycle
query indexes, plus `EmailVerification_tokenHash_key` for verification proof
uniqueness. The notification pagination index preserves its existing
`Notification_userId_createdAt__id_idx` name, including the stored `_id` field.
The `_id` index continues
to enforce string-key uniqueness. Expiry indexes are regular indexes rather
than TTL indexes; cleanup retains the existing application-driven windows.

`npm run db:native:indexes` is a metadata-only check of the configured database.
For a new database, `npm run db:native:indexes -- apply` creates missing indexes
additively and checks them. Conflicting definitions fail; the tool does not
drop or recreate an index or collection. Verify the check before deploying.

The contract's default control policy is now `tolerated`; the ten declared
ObjectId collections explicitly use `managed`. The initial rehearsal found that
the previous default would drop all seven undeclared native collections and
their indexes. This governance change prevents those operations. Native indexes
remain owned by the additive inventory. Raw CLI commands bypass the reviewed
operation guard; use the flow below for adoption.

## Database-management rehearsal

The guarded tools separate inspection from application:

```bash
npm run db:audit       # reads data/schema; reports counts/types/field names only
npm run db:plan        # audit plus dry-run operation inventory; no DDL or signing
# After backup, copy rehearsal, cleanup, and stopping old writers:
npm run db:push        # guarded v8 apply, schema verification, signing, verification
```

Scripts load root `.env`; they do not load `.env.local`. A fresh database first
needs `npm run db:native:indexes -- apply`. Existing databases should run the
read-only index check and resolve conflicts deliberately.

`prisma-management.mjs` checks every managed collection against the exact
`$jsonSchema` in the emitted contract. It counts incompatible documents and
reports BSON type distributions, missing required fields, and unexpected field
names without returning document values, IDs, emails, hashes, or tokens. Native
collection ID types and the complete native index inventory are checked too.
Missing arrays, null required scalars, wrong BSON types, and extra fields can
all prevent strict-validator adoption even when application read defaults work.
The tool never backfills or deletes records.

`db:push` first checks source/artifact consistency and requires the plan's
destination hash to match the audited contract. It proceeds only when both the
audit and operation guard pass. The guard
accepts only additive validator/collection creation on declared managed
collections. Drops, conversions, existing-validator/index changes, unknown
operations, and DDL on native collections are refused. After applying, it verifies
the managed schema, signs without advancing a repository ref, and verifies the
marker and schema. CLI `--strict` verification is intentionally not used: that
flag rejects unclaimed native collections even when their policy is tolerated.
MongoDB validators themselves still use strict/error enforcement; the native
index check and guarded plan cover the deliberately external collections.

Plan/apply also inspect the current connection's effective privileges with
`connectionStatus`. The `permissions` report lists missing `collMod` actions
for validator additions and `createCollection` actions for collection creation,
respecting database/collection scopes. Known missing privileges make the plan
not ready and prevent DDL. Identities are never included. When an inventory is
unavailable or the connection is unauthenticated (as on the local fixture
server), `permissions.checked` is false; actual server authorization and command
verification still apply. This check covers planned DDL, not every permission
that signing or application operations may need.

The rehearsal uses independent representative fixtures, **not a production data
copy**. Run it against a disposable local MongoDB 8+ replica set:

```bash
MIGRATION_TEST_DATABASE_URL='mongodb://127.0.0.1:28019/bidlane_test_migration_local?replicaSet=bidlane-test' npm run db:rehearse
```

The guard accepts one literal `127.0.0.1` host and a `bidlane_test_migration_*`
database name, then creates a uniquely suffixed database. It never resets the
supplied base or falls back to `DATABASE_URL`. Tests cover fresh bootstrap,
collection/index preservation, audit refusal without mutation, unreviewed index
drops, idempotent adoption/signing, enforced validators, and application writes
after adoption. The generated database is dropped afterward.

Before a shared-database adoption, rehearse on a backup/restored copy and review
its audit. Deploy the migrated writers, stop old writers, resolve legacy-data
issues deliberately, then repeat audit/plan immediately before applying.
DDL/signing is not one MongoDB transaction: a command failure can leave partial
metadata changes, so stop and inspect before retrying. No shared database's
records, validators, indexes, or marker were changed during this rehearsal.

## Restored-copy rehearsal

`npm run db:rehearse-copy` reads the configured `DATABASE_URL`, creates a
private database archive, and exercises the initial adoption on the actual
documents restored into a uniquely named local database. Install the official
[MongoDB Database Tools](https://www.mongodb.com/try/download/database-tools)
and start a disposable MongoDB 8+ replica set bound only to loopback. Run this
operator command separately from the fixture integration suites:

```bash
MIGRATION_TEST_DATABASE_URL='mongodb://127.0.0.1:28019/bidlane_test_migration_copy?replicaSet=bidlane-test' npm run db:rehearse-copy
```

The tools must be on `PATH`, or provide `MONGODUMP_BIN` and `MONGORESTORE_BIN`
as absolute executable paths. The script accepts no command-line overrides.
Its local URL must identify one literal `127.0.0.1:port` host and a
`bidlane_test_migration_*` database; a new suffixed name is generated. Local
credentials and connection options other than `replicaSet`/`directConnection`
are refused, and direct connection is forced to prevent discovery or proxies
from redirecting writes. Restore requires an empty destination, selects only
the source database's namespaces, remaps every restored collection, stops on
errors, and never uses `--drop` or oplog replay.

The source URI is supplied through a temporary mode-600 tool configuration,
not process arguments, and that file is removed after the dump. Archives,
tool logs, snapshot manifests, and reports are kept in a new mode-700 directory
under `~/.local/state/bidlane/backups/` (override the parent with
`BIDLANE_BACKUP_ROOT`). Files are mode 600. They contain real application data
and must stay outside Git; retain the archive through cutover and verification.
The summary reports counts and check results without identities or documents.

The checks are:

1. Read every ordinary collection in one read-only snapshot, hashing raw BSON
   without changing integer, floating-point, or binary representations. Record
   collection options and full index definitions, and refuse metadata drift.
2. Create a gzip `mongodump` archive of this database only. Require another
   source snapshot to match, then restore and require the copy's raw document
   hashes, counts, options, and indexes to match too. A changing source fails
   the rehearsal instead of accepting an inconsistent copy.
3. Preview and apply the missing-only User backfill on the copy. Compare every
   original collection with the expected result: only absent defaults may be
   added; other values, BSON types, timestamps, and all indexes must survive.
4. Run guarded validator adoption, signing, and verification. Require unchanged
   original document hashes/indexes and unchanged unmanaged collection options.
   Require a second plan to be ready with zero operations.
5. Read all ten managed models through the v8 ORM. Verify an actual restored
   User accepts a transactional preference update, a native string-key quota
   accepts an insert, and both roll back. Verify an invalid User insert fails
   validation and that the final copy is otherwise unchanged.

The generated local database is dropped on exit; the backup remains. A failed
run exits nonzero and leaves private diagnostic logs. This is an
application-database logical backup, not a full deployment backup of database
users/roles, other databases, or infrastructure. The command deliberately does
not request the cluster-wide access needed for `mongodump --oplog`; MongoDB
requires a full replica-set dump for that mode. The snapshot comparisons make
this rehearsal suitable for a small, stable database. Before cutover, stop old
writers and obtain a fresh coordinated backup or deployment snapshot using the
[MongoDB backup procedure](https://www.mongodb.com/docs/database-tools/mongodump/#std-option-mongodump.--oplog).

The configured database's restored-copy rehearsal passed on 2026-11-10 using
Database Tools 100.20.1 and a local MongoDB 8.0.17 replica set. All seventeen
collections were restored exactly, the eleven legacy Users were repaired,
all ten validator additions were adopted and verified, all ten ORM reads
passed, and the repeat plan was empty. During this copy rehearsal, the source
received no data/schema/index or marker writes. The configured source was then
confirmed to be development; see [development adoption status](#development-adoption-status)
for the subsequent backfill. Production remains a separate Prisma 6 deployment.

## Missing User defaults

The configured database's read-only audit found missing required arrays and
`endingSoonEmailsEnabled` on legacy User records. The other nine managed
collections, existing index definitions, and native string-ID types passed.
Missing optional account fields are valid and need no repair. A server-side
projection of the proposed defaults cleared all observed validator failures
without updating records or exporting account values.

```bash
npm run db:backfill-users             # preview only; counts and known defaults
# After reviewing the preview, backing up, and rehearsing on a restored copy:
npm run db:backfill-users -- --apply   # explicit, transactional data write
npm run db:audit
npm run db:plan
```

The separate backfill fills only absent `BidOnListIds`, `highestBidsIds`,
`listingsCommentedOnIds`, `seenListIds`, and `watchListIds` with empty arrays,
and absent `endingSoonEmailsEnabled` with `true`. These match the existing
Prisma 6 read defaults and native signup behavior. Existing array entries,
explicit email opt-outs, and every other stored field are preserved, including
roles, credentials, verification proof, session versions, and timestamps.
Explicit nulls and wrong types are never replaced.

Before writing, the script checks that these additions would resolve every
User validator failure and that the remaining audit passes. It repeats the
User check inside a snapshot/majority transaction, uses missing-only update
expressions to preserve concurrent changes, and validates the resulting records
before committing. A validation/write failure rolls back the transaction;
repeating a successful backfill adds nothing. Unexpected fields, unresolved
null/type problems, other incompatible collections, native ID problems, and
index issues block the repair. The script does not install validators, change
indexes or IDs, sign the database, or send email.

`db:rehearse` includes independent fixtures matching the observed missing-field
pattern. Tests verify preview privacy, preservation, idempotence, refusal of
unresolved failures, rollback, and concurrent watchlist/preference updates.
This is separate from rehearsing on a restored copy of the actual database;
retain the backup until adoption and application checks are complete.

## Development adoption status

The configured `DATABASE_URL` was confirmed to target development on 2026-11-10;
production is still running Prisma 6 and was not targeted. Before development
writes, the live raw-BSON snapshot, collection options, and indexes were
rechecked against the restored/verified archive, and the archive checksum was
verified. The transactional backfill then added the reviewed missing defaults
to the eleven legacy Users. All other stored values, BSON types, timestamps,
collection options, and indexes were verified unchanged. The data audit passes.

The initial validator attempt was blocked because the development account
lacked `collMod`; no validators were installed during that attempt. The plan
now reports known missing DDL permissions explicitly. A migration account
needs existing read/write access plus `collMod` on the managed collections.
MongoDB's built-in
[`dbAdmin` role](https://www.mongodb.com/docs/manual/reference/command/collmod/#access-control)
provides that action; scope migration privileges to the intended database.

After the development account received `dbAdmin`, adoption completed on
2026-11-11. A fresh private backup and restored-copy rehearsal passed before
applying the ten reviewed validator additions. The guarded `db:push` command
completed schema verification, signing, and marker verification. Final live
checks confirmed:

- All ten managed collections use strict/error validator enforcement.
- All seventeen original collections and 160 documents retain their raw BSON
  hashes and index definitions from the post-backfill backup; native collection
  options and string IDs are unchanged.
- All ten v8 ORM model reads return the expected counts.
- An invalid User insert is rejected, and a session-bound User preference
  change plus native string-key quota insert both roll back without changes.
- The data audit passes, the contract marker matches, and the follow-up plan is
  ready with zero operations.

The normal operator sequence remains:

```bash
npm run db:plan       # audit ready; no missing permissions or blocked operations
npm run db:push       # guarded validator adoption, signing and verification
npm run db:plan       # ready with zero operations
```

The pre-backfill and pre-validator archives and private development verification
reports remain outside Git. Production needs its own
backup, audit, restored-copy rehearsal, and coordinated application/validator
cutover; the development result does not authorize or perform those operations.

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
read pool even from a native listing/comment transaction. These immutable
reads do not participate in its snapshot; all related mutable writes and their
notifications remain in the same native session.

## Native integration tests

The regular test suite covers business policies and duplicate-key fallback.
Integration tests additionally exercise actual BSON encodings, concurrent
counters, ownership filters, unique indexes, native/v6 read compatibility,
reset single-use semantics, persisted transaction rollback, email lease
fencing, NextAuth OAuth signup/linking, credential login, JWT revocation,
profile/preference permissions, admin-role revocation, auction/bid contention,
exact bid replays, stale deadlines/approval revisions, draft save/publication
races, moderation/seller-edit races, comment/view/watchlist contention, notification
pagination/delivery leases, verification resend/claim races, and persisted rollback on a local replica set. Start a disposable MongoDB 8+ replica set, then run:

```bash
NATIVE_TEST_DATABASE_URL='mongodb://127.0.0.1:28019/bidlane_test_native_strings?replicaSet=bidlane-test' npm test -- prisma/ --maxWorkers=2
```

Use the port and replica-set name of your local server. Limit workers to avoid
saturating local storage with concurrent index builds during setup. Run the
DDL-heavy `db:rehearse` separately, with its configured single worker, rather
than enabling both integration URLs in a parallel run. These tests only accept
one `127.0.0.1` host and a database named `bidlane_test_native_*`. They reset and
drop that test database. Authentication, auction, authoring, engagement,
notification, verification, and read suites append `_auth`, `_auctions`,
`_authoring`, `_engagement`, `_notifications`, `_verification`, and `_reads` to isolate their databases
when run in parallel. Rollback tests temporarily reject writes using validators only in
their disposable local database and restore those validators afterward. Tests never fall back to
`DATABASE_URL`, send mail, or contact Cloudinary. Without the explicit test URL
they are skipped. The
migration has been verified against local MongoDB 8.0.17 and 8.0.37 replica sets.
The configured development database was also audited for document/schema
compatibility, indexes, and native ID types, then backed up and successfully
rehearsed on a local restored copy. Its missing User defaults were backfilled
and verified, and development validator adoption/signing has completed with
live preservation, ORM, enforcement, rollback and repeat-plan checks.
Production remains on Prisma 6 and was not changed.

## Remaining migration work

1. Separately plan production's Prisma 6 cutover with its own backup, audit,
   restored-copy rehearsal, and old-writer shutdown before applying production
   changes. Development backfill, validator adoption/signing, and live checks
   are complete; production has not been targeted.
2. Retain explicit foreign-key/array operations, creation defaults, and native
   transaction boundaries. Many-to-many arrays remain persisted fields, not
   v8 ORM relations. Confirm required cascading cleanup before retiring v6's
   emulation; account deletion is not currently an application operation.
3. Replace compatibility checks that depend on the generated v6 model metadata
   with independent contract assertions. Complete the operator/config/editor
   cutover together, then remove the unused v6 provider, schema/toolchain, client,
   dependency override, and remaining test-only imports/mocks. Retain the split
   between offline emission and explicit guarded database management.

## References

- [MongoDB v6 to v8 migration guide](https://www.prisma.io/docs/guides/upgrade-prisma-orm/mongodb)
- [Prisma release status](https://www.prisma.io/docs/orm/release-status)
- [Contract emission](https://www.prisma.io/docs/cli/contract-emit)
- [MongoDB native driver transactions](https://www.mongodb.com/docs/drivers/node/current/crud/transactions/)
