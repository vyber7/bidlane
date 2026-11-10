import type { ClientSession, Db } from "mongodb";
import { assetRepository } from "./assets";
import { quotaRepository, type QuotaDocument } from "./quotas";
import { recoveryRepositories } from "./recovery";
import { authRepositories } from "./auth";
import { auctionRepositories } from "./auctions";
import { notificationRepository } from "./notifications";
import { draftRepository } from "./drafts";
import { listingAuthoringRepository } from "./listing-authoring";
import { engagementRepositories } from "./engagement";
import { notificationEmailRepository } from "./notification-emails";
import { emailVerificationRepository } from "./email-verification";

export function createNativeRepositories(database: Db, session?: ClientSession) {
  return {
    ...authRepositories(database, session),
    ...auctionRepositories(database, session),
    ...engagementRepositories(database, session),
    notifications: notificationRepository(database, session),
    notificationEmails: notificationEmailRepository(database, session),
    emailVerifications: emailVerificationRepository(database, session),
    drafts: draftRepository(database, session),
    listingAuthoring: listingAuthoringRepository(database, session),
    quotas: {
      contact: quotaRepository(database.collection<QuotaDocument>("ContactRateLimit"), session),
      upload: quotaRepository(database.collection<QuotaDocument>("UploadQuota"), session),
      abuse: quotaRepository(database.collection<QuotaDocument>("AbuseQuota"), session),
      passwordReset: quotaRepository(database.collection<QuotaDocument>("PasswordResetQuota"), session),
    },
    assets: assetRepository(database, session),
    ...recoveryRepositories(database, session),
  };
}

export type NativeRepositories = ReturnType<typeof createNativeRepositories>;
