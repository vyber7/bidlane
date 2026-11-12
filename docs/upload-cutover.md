# Secured upload deployment

New uploads require a signed-in BidLane account and pass through `/api/uploads`.
The server limits the actual file to **4,000,000 bytes (4 MB)** and the entire
multipart body to 4,065,536 bytes, below Vercel's 4.5 MB request limit. Cloudinary
detects the format and accepts JPG, PNG, or WebP photos; vehicle records also
accept PDF. The browser never receives a provider signature or API secret.

The server records each upload's owner, purpose, optional target listing, and
canonical URL. All media writes check that ledger. Existing saved photos,
records, drafts, and OAuth avatars remain usable on their current owned object;
new pasted URLs and copying legacy assets onto other objects are rejected.

## Coordinated production cutover

Keep the current `auctions` preset unsigned until the replacement is deployed.
The following steps intentionally separate preparation from the live change.

1. Set `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`, `NEXT_PUBLIC_CLOUDINARY_API_KEY`, and
   `CLOUDINARY_API_SECRET` in the production runtime. Keep the API secret server
   only. Use that same Cloudinary account for the cutover command.
2. Follow the [Prisma 8 production cutover procedure](prisma-8-production-cutover.md)
   with the reviewed target supplied through `DATABASE_URL`. Inspect the native
   index inventory, audit, and plan first; initialize missing native indexes only
   after backup and review, then use guarded adoption after stopping old writers.
   Deploy the application with its emitted contract (`npm run build` emits it).
3. On the production domain, sign in and smoke-test a photo, PDF record, and
   profile image below 4 MB. Save and reload each; confirm an existing draft and
   existing saved media still work. A file above 4 MB must be rejected. Confirm
   these tests before disabling the old preset.
4. From this revision with production Cloudinary credentials in the environment
   (or local `.env`), run the coordinated command, replacing the example domain:

   ```sh
   npm run uploads:secure -- --deployment-url https://your-production-domain
   npm run uploads:check
   ```

   The cutover command checks the deployed upload policy and unauthenticated
   rejection before changing `auctions` to signed, then reads the preset back.
   It exits with failure if a prerequisite or verification fails. It never
   automatically restores unsigned uploads. A failed command may have already
   changed the preset; use `uploads:check` to inspect its state before retrying.
5. Refresh pages that were open before deployment. Cached unsigned widgets stop
   uploading after cutover; saved URLs and the new uploader continue working.
   Review the Cloudinary console for any other unused unsigned presets and
   disable them separately if appropriate.

New upload attempts consume shared MongoDB budgets: 40 per account per hour,
100 per account per day, 100 globally per hour, and 500 globally per day.
Rejected attempts and provider failures count. Limits fail closed on database
failure. Monitor legitimate usage before adjusting these constants. Removing a
file from a form removes its reference; it does not delete an uploaded asset.
Failed uploads attempt provider cleanup, but an interrupted process can leave
unreferenced assets requiring ordinary storage housekeeping.

Account budgets are charged before shared budgets, so attempts already blocked
by an account limit do not exhaust everyone else's upload allowance. A read-only
shared-budget check skips new account counters when global capacity is already
exhausted; final atomic increments enforce the caps even with concurrent uploads.

If deployment must roll back after cutover, retain the secured uploader and
ownership checks or temporarily pause new uploads. Old code depends on the
unsigned preset and cannot safely resume uploading with that preset disabled.
Existing saved media can continue to be displayed during recovery.
