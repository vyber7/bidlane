import { MongoServerError } from "mongodb";

// Preserve v6 names and semantics. Expiry indexes are not TTL indexes: the
// application deliberately retains reset and delivery records for its retries.
export const nativeIndexes = {
  Listing: [
    { key: { status: 1, auctionEndsAt: 1 }, name: "Listing_status_auctionEndsAt_idx" },
    { key: { status: 1, reviewStatus: 1, createdAt: 1 }, name: "Listing_status_reviewStatus_createdAt_idx" },
  ],
  BidSubmission: [{ key: { userId: 1, key: 1 }, name: "BidSubmission_userId_key_key", unique: true }],
  Notification: [
    { key: { userId: 1, eventKey: 1 }, name: "Notification_userId_eventKey_key", unique: true },
    { key: { userId: 1, createdAt: 1, _id: 1 }, name: "Notification_userId_createdAt__id_idx" },
    { key: { userId: 1, readAt: 1 }, name: "Notification_userId_readAt_idx" },
    { key: { emailStatus: 1, emailNextAttemptAt: 1 }, name: "Notification_emailStatus_emailNextAttemptAt_idx" },
    { key: { emailStatus: 1, emailLockedUntil: 1 }, name: "Notification_emailStatus_emailLockedUntil_idx" },
  ],
  User: [{ key: { email: 1 }, name: "User_email_key", unique: true }],
  Account: [{ key: { provider: 1, providerAccountId: 1 }, name: "Account_provider_providerAccountId_key", unique: true }],
  ContactRateLimit: [{ key: { expiresAt: 1 }, name: "ContactRateLimit_expiresAt_idx" }],
  UploadQuota: [{ key: { expiresAt: 1 }, name: "UploadQuota_expiresAt_idx" }],
  AbuseQuota: [{ key: { expiresAt: 1 }, name: "AbuseQuota_expiresAt_idx" }],
  PasswordResetQuota: [{ key: { expiresAt: 1 }, name: "PasswordResetQuota_expiresAt_idx" }],
  UploadedAsset: [
    { key: { url: 1 }, name: "UploadedAsset_url_key", unique: true },
    { key: { userId: 1, kind: 1 }, name: "UploadedAsset_userId_kind_idx" },
  ],
  PasswordReset: [
    { key: { tokenHash: 1 }, name: "PasswordReset_tokenHash_key", unique: true },
    { key: { expiresAt: 1 }, name: "PasswordReset_expiresAt_idx" },
  ],
  RecoveryEmail: [
    { key: { status: 1, nextAttemptAt: 1 }, name: "RecoveryEmail_status_nextAttemptAt_idx" },
    { key: { status: 1, lockedUntil: 1 }, name: "RecoveryEmail_status_lockedUntil_idx" },
    { key: { createdAt: 1 }, name: "RecoveryEmail_createdAt_idx" },
  ],
};

export async function checkNativeIndexes(database) {
  const issues = [];
  for (const [name, definitions] of Object.entries(nativeIndexes)) {
    let indexes = [];
    try { indexes = await database.collection(name).listIndexes().toArray(); }
    catch (error) { if (!(error instanceof MongoServerError) || error.code !== 26) throw error; }
    for (const definition of definitions) {
      const index = indexes.find((item) => item.name === definition.name);
      if (!index) issues.push({ collection: name, index: definition.name, issue: "missing" });
      else if (JSON.stringify(index.key) !== JSON.stringify(definition.key) || Boolean(index.unique) !== ("unique" in definition) ||
        index.sparse || index.partialFilterExpression || index.expireAfterSeconds !== undefined || (index.collation && index.collation.locale !== "simple")) {
        issues.push({ collection: name, index: definition.name, issue: "definition differs" });
      }
    }
  }
  return issues;
}

export async function ensureNativeIndexes(database) {
  // Additive only. Conflicting definitions fail; no collection or index is
  // dropped, renamed, or recreated to force a schema change.
  for (const [name, definitions] of Object.entries(nativeIndexes)) {
    await database.collection(name).createIndexes(definitions);
  }
}
