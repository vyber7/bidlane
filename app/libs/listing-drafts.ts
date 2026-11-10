import { assertListingAssets } from "./uploaded-assets";
import { requireVerifiedEmail } from "./verified-email";
import type { DraftRecord } from "@/prisma/native/drafts";
import { authoringTransactionOptions, isDuplicateKey } from "@/prisma/native/transaction-errors";
import type { z } from "zod";
import { getNativeRepositories, withNativeTransaction } from "./native-repositories";
import { ApiRequestError } from "./api-request";
import { parseListing } from "./listing-validation";
import { emptyDraftPayload, draftPayloadSchema, type createDraftSchema, type updateDraftSchema, type ListingDraftDTO } from "@/app/schemas/listing-draft";

export function serializeDraft(draft: DraftRecord): ListingDraftDTO {
  if (draft.deletedAt) throw notFound();
  return { id: draft.id, revision: draft.revision, updatedAt: draft.updatedAt.toISOString(), payload: draftPayloadSchema.parse(draft.payload), publishedListingId: draft.publishedListingId };
}
const conflict = () => new ApiRequestError(409, "This draft changed in another tab or device. Reload to see the latest saved version before editing again.");
const notFound = () => new ApiRequestError(404, "Draft not found.");
const sameSave = (draft: DraftRecord, input: { saveKey: string; payload: unknown }) => draft.lastSaveKey === input.saveKey && JSON.stringify(draftPayloadSchema.parse(draft.payload)) === JSON.stringify(input.payload);

export async function createListingDraft(userId: string, input: z.output<typeof createDraftSchema>) {
  const create = () => withNativeTransaction(async (tx) => {
    const existing = await tx.drafts.find(input.id);
    if (existing) {
      if (existing.userId !== userId) throw notFound();
      if (existing.deletedAt) throw new ApiRequestError(409, "This draft was deleted. Start a new draft from your account.");
      if (existing.publishedListingId || !sameSave(existing, input)) throw conflict();
      return serializeDraft(existing);
    }
    await assertListingAssets(userId, input.payload);
    const draft = await tx.drafts.create({ id: input.id, userId, payload: input.payload, lastSaveKey: input.saveKey }, new Date());
    return serializeDraft(draft);
  }, authoringTransactionOptions);
  try { return await create(); }
  catch (error) {
    // A concurrent create can win the _id index before our snapshot sees it.
    if (isDuplicateKey(error)) return create();
    throw error;
  }
}

export async function updateListingDraft(userId: string, id: string, input: z.output<typeof updateDraftSchema>) {
  const existing = await getNativeRepositories().drafts.owned(id, userId);
  if (!existing) throw notFound();
  if (existing.publishedListingId) throw new ApiRequestError(409, "This draft has already been submitted. Open the listing from your account.");
  if (existing.lastSaveKey === input.saveKey) {
    if (!sameSave(existing, input)) throw conflict();
    return serializeDraft(existing);
  }
  if (existing.revision !== input.revision) throw conflict();
  await assertListingAssets(userId, input.payload, draftPayloadSchema.parse(existing.payload));
  const updatedAt = new Date();
  const updated = await getNativeRepositories().drafts.save(id, userId, input.revision, { payload: input.payload, lastSaveKey: input.saveKey }, updatedAt);
  if (updated.count !== 1) {
    const latest = await getNativeRepositories().drafts.owned(id, userId);
    if (latest && !latest.publishedListingId && sameSave(latest, input)) return serializeDraft(latest);
    throw conflict();
  }
  return { id, payload: input.payload, revision: input.revision + 1, updatedAt: updatedAt.toISOString(), publishedListingId: null } satisfies ListingDraftDTO;
}

export async function deleteListingDraft(userId: string, id: string, revision: number) {
  // Keep an empty marker so a delayed create retry cannot resurrect a draft
  // deleted on another device. Remove its saved fields and asset references.
  const deleted = await getNativeRepositories().drafts.remove(id, userId, revision, emptyDraftPayload, new Date());
  if (deleted.count !== 1) {
    if (!await getNativeRepositories().drafts.owned(id, userId)) throw notFound();
    throw conflict();
  }
}

export async function publishListingDraft(user: { id: string; emailVerified?: Date | null }, id: string, revision: number) {
  const userId = user.id;
  return withNativeTransaction(async (tx) => {
    const draft = await tx.drafts.owned(id, userId);
    if (!draft) throw notFound();
    if (draft.publishedListingId) {
      if (draft.revision !== revision) throw conflict();
      const listing = await tx.listingAuthoring.ownedListing(draft.publishedListingId, userId);
      if (!listing) throw notFound();
      return listing;
    }
    if (draft.revision !== revision) throw conflict();
    requireVerifiedEmail(user, "submit a listing");
    const payload = draftPayloadSchema.parse(draft.payload);
    const data = parseListing({ ...payload.details, images: payload.images, vehicleRecords: payload.vehicleRecords });
    const now = new Date();
    const listing = await tx.listingAuthoring.create(userId, data, now);
    const claimed = await tx.drafts.publish(id, userId, revision, listing.id, now);
    if (claimed.count !== 1) throw conflict();
    // A tombstone links retries to the same listing without duplicating it.
    return listing;
  }, authoringTransactionOptions);
}
