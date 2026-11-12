# Prisma 8 production cutover

Development adoption and automated release validation are complete. Production
still runs Prisma 6. This procedure prepares and coordinates its separate move;
development reports do not establish production data compatibility.

## Release baseline

On 2026-11-12, the registry `latest` tags match the exact installed pins:
`@prisma/orm-mongo` 8.0.0-rc.23 and `prisma` 8.0.0-rc.33. The packages are
versioned independently. Keep these pins and the lockfile together; rerun the
version-specific upgrade instructions and release checks before changing them.

The [supported-databases table](https://www.prisma.io/docs/orm/supported-databases)
classifies MongoDB as early access. The production release owner must account
for that status even though the package is tagged as a release candidate.
Prisma's [release policy](https://www.prisma.io/docs/orm/release-status) lists
19 November 2026 as the end of Prisma 6 security patches. The installed Node 24,
TypeScript, MongoDB 8, and driver 7 meet the documented
[version requirements](https://www.prisma.io/docs/orm/supported-versions).

The 2026-11-12 validation covered all 1,354 distinct regular, native, and
management tests, contract emission consistency, TypeScript, lint, the
production build, local production HTTP flows, and read-only checks against
development. The generated artifacts are committed in `89a29d5`.

## Development service results — 2026-11-12

Live checks used the configured development services and the operator's GitHub
account/inbox. Verification and password recovery used an isolated temporary
local account; the real development account's password/verification were not
changed to manufacture test data.

| Check | Result |
| --- | --- |
| GitHub OAuth | Existing linked account sign-in, callback, matching session email, and protected account page passed against development. |
| Verification email | Resend accepted the real message; link consumption and replay rejection passed. Inbox receipt confirmed by the operator. |
| Recovery email | Real reset delivery, existing-session invalidation, changed-password sign-in, and change-notice delivery passed. All three test emails arrived; reset replay is covered by the earlier compiled-server and integration checks. |
| Pusher | Live private-channel subscription and matching event receipt passed; anonymous and other-user channel authorization were rejected. |
| Cloudinary photos | Real signed profile/photo uploads, public delivery, profile persistence, ownership checks, and the 4 MB rejection passed. |
| Vehicle records | PDF upload and draft save/reload passed. Following the operator's manual fix, a fresh signed PDF delivery retest also passed: HTTP 200, `application/pdf`, and a valid PDF body. |
| Provider cleanup | All created test assets were removed, including the diagnostic PDF and the successful delivery retest asset. |
| Vercel | Read-only API inspection confirms a ready production deployment with all four one-minute schedules enabled and production `CRON_SECRET` metadata present. Pro is confirmed by the operator and dashboard. Dashboard request logs show recent HTTP 200 invocations for all four workers; no job was invoked manually. |
| Google OAuth | Not exercised with a live account; only configuration presence and the existing automated adapter tests are covered. |

Earlier checks confirmed that development and production shared the Cloudinary
product environment. Following the operator's manual fix, a fresh signed PDF
retest on 2026-11-12 confirmed successful public delivery and test-asset cleanup.
PDF delivery is no longer pending. Future shared delivery-policy changes still
require production review and a delivery retest; see Cloudinary's
[PDF delivery policy](https://cloudinary.com/documentation/ts_how_to_upload_manage_and_deliver_pdf_files#delivering_pdf_files).

The repeatable metadata checker has its own failure/redaction tests and passes
with the configured services. Those tests supplement, rather than replace, the
full migration validation above.

## Service checks before scheduling production

Run the repeatable metadata checks against the intended environment:

```sh
npm run services:check
npm run uploads:check
```

These commands do not send email, publish events, upload files, invoke cron
workers, or modify the database or provider settings. The service report does
not certify delivery. A Resend sending-only key legitimately rejects the domain
list request with `restricted_api_key`; this is not an invalid key. The
[domain-list API](https://resend.com/docs/api-reference/domains/list-domains)
is only an optional read check; an actual application email is still required.

Use designated accounts and inboxes to record the following evidence. Test
transactions with fixture data in a separate development/test database; avoid
running the complete email queue or finalization worker against ordinary data
just to check whether it starts.

| Flow | Evidence required |
| --- | --- |
| GitHub/Google | New or already-linked provider sign-in returns to the correct callback URL; session and protected pages work. |
| Account linking | Existing links remain usable. Unlinked matching-email identities and new provider links to password accounts are refused, as designed. |
| Verification mail | App sends to the designated inbox; the link verifies the intended account exactly once. |
| Password recovery | A password-enabled test account receives the reset message; reset succeeds once, invalidates old sessions, and queues/delivers its change notice. OAuth-only accounts retain their existing recovery policy. |
| Pusher | An authenticated test subscriber receives a matching event on its own private channel; unauthenticated/private-channel access is rejected. |
| Cloudinary | Signed profile/photo and PDF-record uploads below 4 MB save and reload; oversized files and unowned URLs are rejected; new test assets are cleaned up. |
| Existing media | Saved legacy photos, records, and drafts remain usable. |

Never add a password, replace a provider connection, or clear verification on a
real account to manufacture a smoke-test fixture. A temporary isolated account
can use its owner's approved inbox without changing that owner's actual
credentials or application account.

## Vercel scheduler verification

`vercel.json` declares these four jobs, each on `* * * * *`:

- `/api/cron/finalize-auctions`
- `/api/cron/send-notification-emails`
- `/api/cron/send-recovery-emails`
- `/api/cron/ending-soon-reminders`

Verify all four on the actual Vercel project/deployment, including recent
successful invocations and their worker summaries. The repository file alone
does not prove a deployed job exists or runs. One-minute jobs require a plan
that supports them: Vercel's [cron usage limits](https://vercel.com/docs/schedules/cron-jobs/usage-and-pricing)
allow one-minute scheduling on Pro/Enterprise; Hobby permits daily jobs.
Do not slow auction or mail workers to a daily schedule to make a deployment fit.

All handlers require `Authorization: Bearer <CRON_SECRET>`. Vercel supplies its
deployment's configured secret automatically; see
[cron authentication and deployment behavior](https://vercel.com/docs/schedules/cron-jobs/manage-cron-jobs).
Check the secret in the intended deployment environment without printing it.
Changing it in settings requires a new deployment before jobs use the new
value. Confirm scheduled execution after promotion, rather than assuming a
successful local invocation proves the scheduler works.

## Prepare the production change

1. Identify the production database, current release, deployment project,
   scheduler, release owner, and maintenance window. Supply production
   `DATABASE_URL` through the operator's secret environment. Keep local
   development `.env` separate and never place a connection URL in shell
   arguments, reports, or Git.
2. Build and validate the exact release artifact before the maintenance window:
   `npm ci`, `npm run db:validate`, the regular/native/management test runs,
   `npm run lint`, `npx tsc --noEmit`, and `npm run build`. Run DDL-heavy
   management tests separately with one worker; use only the guarded loopback
   integration database names described in the [migration guide](prisma-8-migration.md#native-integration-tests).
3. Run production read-only preflight: `npm run db:v8:check`,
   `npm run db:native:indexes`, `npm run db:audit`,
   `npm run db:backfill-users`, and `npm run db:plan`. Save sanitized results.
   An audit can be unready before a reviewed defaults backfill; review the
   preview instead of bypassing the guard. Resolve version/topology,
   permissions, BSON, uniqueness, index, and unexpected-operation issues first.
4. Confirm that the native index inventory already matches. If it does not,
   rehearse the reviewed additive initialization on an isolated copy before
   scheduling target index changes. The standard restored-copy rehearsal
   expects the inventory to be present. Do not drop conflicting indexes or
   accept a destructive CLI plan.
5. Prepare maintenance handling and stop every Prisma 6 writer: web/API
   requests, cron invocations, queue workers, administrative scripts, and older
   reachable deployments. Confirm the database is quiescent before taking the
   final backup or modifying data/schema. Have the Prisma 8 build ready while
   writers are stopped.

## Back up and rehearse the actual production database

With old writers stopped, use the
[restored-copy procedure](prisma-8-migration.md#restored-copy-rehearsal) against
the explicitly selected production source. Its `MIGRATION_TEST_DATABASE_URL`
must identify a fresh guarded loopback replica-set destination, never staging
or production. MongoDB Database Tools must be installed or supplied through
`MONGODUMP_BIN`/`MONGORESTORE_BIN`.

The rehearsal creates a private source archive, verifies stable raw-BSON
snapshots and restored contents, applies only reviewed User defaults on the
copy, installs/verifies the managed validators, exercises ORM reads and rollback,
and checks the repeat plan is empty. The source receives no writes. Retain its
archive, checksum, manifests, and report outside Git through cutover and
post-release verification.

Do not proceed if source stability, restoration, preservation, audit, or
transaction checks fail. Development's eleven repaired Users and ten validator
additions are historical evidence, not production's expected counts.

## Apply the reviewed adoption while traffic is paused

Keep all old writers stopped. For the explicitly selected production target:

1. Recheck the source against the final preserved snapshot/rehearsal and rerun
   the defaults preview. If it identifies a reviewed repair, run
   `npm run db:backfill-users -- --apply` and verify its report. This adds only
   missing default fields; nulls, wrong BSON types, and unrelated invalid data
   require a separate reviewed repair. If no repair is required, skip the write.
2. Run `npm run db:audit` and `npm run db:plan`. Require audit readiness, no
   blocked operations, and the necessary database-scoped migration privileges.
   The guarded command accepts only reviewed additive managed
   collection/validator operations. Seven native string-ID collections and
   their indexes must remain outside contract DDL.
3. Run `npm run db:push`. This is the repository's guarded apply, followed by
   schema verification, signing, and marker verification. It does not backfill
   data or convert IDs. Do not substitute a raw CLI command or override flags.
4. Run `npm run db:audit`, `npm run db:native:indexes`, and `npm run db:plan`
   again. Require a ready audit, preserved native inventory, and zero operations.
5. Deploy/promote the tested Prisma 8 build and matching committed contract
   artifacts. Keep traffic and schedules paused until readiness, intended
   account access, and application smoke checks pass.

## Resume and observe

Restore traffic and only the intended release's four schedules/workers. Verify
actual bids and exact replays, finalization, watchlists, notifications, and
mail/verification behavior using designated test activity. Check invocation
logs for authentication errors, contention/retry exhaustion, validation or
duplicate-key failures, mail lease failures, and unexpected repeat work.
Repeat the read-only audit and plan after the application checks.

The shared native transaction boundary, explicit relation arrays/defaults,
ObjectId foreign keys, BSON longs, and seven native string IDs are intentional
parts of this release. Their future changes need independent review.

## Recovery

Keep writers paused when adoption or validation fails and inspect the sanitized
reports. Prefer a forward correction on the tested Prisma 8 path. Returning
only the application to Prisma 6 does not establish compatibility with strict
validators or the new writer behavior; never resume that build blindly.

If restoring the preserved archive becomes necessary, restore into a separate
recovery database and verify it before considering promotion. Preserve and
reconcile any writes accepted after cutover. Do not overwrite the current
database, delete migration markers, remove validators, or discard accepted
writes as a shortcut to making verification pass.
