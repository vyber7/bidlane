import type { ClientSession, Db } from "mongodb";
import { assetRepository } from "./assets";
import { quotaRepository, type QuotaDocument } from "./quotas";
import { recoveryRepositories } from "./recovery";

export function createNativeRepositories(database: Db, session?: ClientSession) {
  return {
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
