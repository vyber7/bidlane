# Prisma 8 migration

This branch has a parallel Prisma 8 toolchain and typed contract. The seven
string-ID collections now use native MongoDB repositories through the shared
v8 connection pool. Password-reset credential changes also use native sessions
so reset-token consumption, session invalidation, and queued notices stay atomic.
Other model queries, the NextAuth adapter, and the administrator script still
use Prisma 6.19.3. The typed v8 ORM has not been switched on for application queries.

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
`prisma/v8/contract.prisma` describes the ten ObjectId-backed collections:
`Account`, `User`, `Notification`, `Listing`, `ListingReview`, `Comment`, `Bid`,
`BidSubmission`, `EmailVerification`, and `ListingDraft`.

All persisted fields, field mappings, nullability, list element types, enum
values, collection names, and index names are preserved. In particular, v6
`Int` fields remain BSON longs through `Int64Number`; changing them to `Int32`
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
collections no longer goes through that generated client. The remaining
case-insensitive recovery-worker account lookup still uses v6's `User` query.

## Native indexes

`prisma/native/indexes.mjs` defines the existing eleven named secondary indexes,
including unique asset URLs and reset-token hashes. The `_id` index continues
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
reset single-use semantics, persisted transaction rollback, and email lease
fencing on a local replica set. Start a disposable MongoDB 8+ replica set, then run:

```bash
NATIVE_TEST_DATABASE_URL='mongodb://127.0.0.1:28019/bidlane_test_native_strings?replicaSet=bidlane-test' npm test -- prisma/native/repositories.integration.test.ts
```

Use the port and replica-set name of your local server. These tests only accept
one `127.0.0.1` host and a database named `bidlane_test_native_*`. They reset and
drop that test database. They never fall back to `DATABASE_URL`, send mail, or
contact Cloudinary. Without the explicit test URL they are skipped. The
migration was verified against a local MongoDB 8.0.37 replica set; the configured
shared database was only queried for server metadata and existing index definitions.

## Remaining migration work

1. Migrate the remaining auction writes, draft publication, moderation,
   notifications, and email verification transaction by transaction. Preserve bid
   request idempotency, conditional auction updates, race retries, ownership
   checks, and notification persistence in the same native session.
2. Replace nested `connect`/`disconnect` updates with explicit foreign-key and
   array operations, updating both sides atomically. Many-to-many key arrays
   remain persisted fields; they are not v8 ORM relations.
3. Supply remaining literal/default array values explicitly on creation. Preserve
   the current roles, email opt-ins, listing state/views/revisions, notification
   attempts, and draft revision. Native queue and asset defaults are already
   explicit. `Listing.lastCommentAt` and `updatedAt` stay
   nullable; migrated writes must supply their timestamps. Implement any
   required cascading cleanup explicitly before retiring v6's emulation.
4. Replace the v6 NextAuth adapter with a v8/native adapter. Preserve verified
   GitHub email handling, ambiguous-email rejection, the password-account
   linking block, and session-version invalidation. Keep NextAuth v4 unless a
   separate authentication upgrade is deliberately included.
5. Port remaining reads and generated model/filter/payload types to the chained v8 API.
   Preserve public-field allowlists, moderation visibility, pagination,
   `null` versus missing fields, and optional legacy fields/defaults on reads.
6. On a disposable copy of the database, inspect existing BSON types, missing
   fields, extra fields, and index names before introducing strict validators.
   Finalize management of the native collections, inspect the full migration
   delta, and extend the local transactional integration tests to those flows.
7. Cut over the remaining application and operator commands together, then remove v6,
   its adapter, generated client, and dependency override. Replace the emit-only
   config with the reviewed migration config at that point.

## References

- [MongoDB v6 to v8 migration guide](https://www.prisma.io/docs/guides/upgrade-prisma-orm/mongodb)
- [Prisma release status](https://www.prisma.io/docs/orm/release-status)
- [Contract emission](https://www.prisma.io/docs/cli/contract-emit)
- [MongoDB native driver transactions](https://www.mongodb.com/docs/drivers/node/current/crud/transactions/)
