import { assertListingAssets } from "./uploaded-assets";
import type { ListingDraft } from "@prisma/client";
import type { z } from "zod";
import prisma from "./prismadb";
import { ApiRequestError } from "./api-request";
import { parseListing } from "./listing-validation";
import { emptyDraftPayload, draftPayloadSchema, type createDraftSchema, type updateDraftSchema, type ListingDraftDTO } from "@/app/schemas/listing-draft";

export function serializeDraft(draft: ListingDraft): ListingDraftDTO {
  if (draft.deletedAt) throw notFound();
  return { id: draft.id, revision: draft.revision, updatedAt: draft.updatedAt.toISOString(), payload: draftPayloadSchema.parse(draft.payload), publishedListingId: draft.publishedListingId };
}
const conflict = () => new ApiRequestError(409, "This draft changed in another tab or device. Reload to see the latest saved version before editing again.");
const notFound = () => new ApiRequestError(404, "Draft not found.");
const sameSave = (draft: ListingDraft, input: { saveKey: string; payload: unknown }) => draft.lastSaveKey === input.saveKey && JSON.stringify(draftPayloadSchema.parse(draft.payload)) === JSON.stringify(input.payload);

export async function createListingDraft(userId: string, input: z.output<typeof createDraftSchema>) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.listingDraft.findUnique({ where: { id: input.id } });
    if (existing) {
      if (existing.userId !== userId) throw notFound();
      if (existing.deletedAt) throw new ApiRequestError(409, "This draft was deleted. Start a new draft from your account.");
      if (existing.publishedListingId || !sameSave(existing, input)) throw conflict();
      return serializeDraft(existing);
    }
    await assertListingAssets(userId, input.payload, undefined, tx);
    const draft = await tx.listingDraft.create({ data: { id: input.id, userId, payload: input.payload, lastSaveKey: input.saveKey, publishedListingId: null, deletedAt: null } });
    return serializeDraft(draft);
  });
}

export async function updateListingDraft(userId: string, id: string, input: z.output<typeof updateDraftSchema>) {
  const existing = await prisma.listingDraft.findFirst({ where: { id, userId, deletedAt: null } });
  if (!existing) throw notFound();
  if (existing.publishedListingId) throw new ApiRequestError(409, "This draft has already been submitted. Open the listing from your account.");
  if (existing.lastSaveKey === input.saveKey) {
    if (!sameSave(existing, input)) throw conflict();
    return serializeDraft(existing);
  }
  if (existing.revision !== input.revision) throw conflict();
  await assertListingAssets(userId, input.payload, draftPayloadSchema.parse(existing.payload));
  const updatedAt = new Date();
  const updated = await prisma.listingDraft.updateMany({
    where: { id, userId, revision: input.revision, publishedListingId: null, deletedAt: null },
    data: { payload: input.payload, lastSaveKey: input.saveKey, revision: { increment: 1 }, updatedAt },
  });
  if (updated.count !== 1) {
    const latest = await prisma.listingDraft.findFirst({ where: { id, userId, deletedAt: null } });
    if (latest && !latest.publishedListingId && sameSave(latest, input)) return serializeDraft(latest);
    throw conflict();
  }
  return { id, payload: input.payload, revision: input.revision + 1, updatedAt: updatedAt.toISOString(), publishedListingId: null } satisfies ListingDraftDTO;
}

export async function deleteListingDraft(userId: string, id: string, revision: number) {
  // Keep an empty marker so a delayed create retry cannot resurrect a draft
  // deleted on another device. Remove its saved fields and asset references.
  const deleted = await prisma.listingDraft.updateMany({
    where: { id, userId, revision, publishedListingId: null, deletedAt: null },
    data: { deletedAt: new Date(), payload: emptyDraftPayload, revision: { increment: 1 } },
  });
  if (deleted.count !== 1) {
    if (!await prisma.listingDraft.findFirst({ where: { id, userId, deletedAt: null }, select: { id: true } })) throw notFound();
    throw conflict();
  }
}

export async function publishListingDraft(userId: string, id: string, revision: number) {
  return prisma.$transaction(async (tx) => {
    const draft = await tx.listingDraft.findFirst({ where: { id, userId, deletedAt: null } });
    if (!draft) throw notFound();
    if (draft.publishedListingId) {
      if (draft.revision !== revision) throw conflict();
      const listing = await tx.listing.findUnique({ where: { id: draft.publishedListingId } });
      if (!listing || listing.userId !== userId) throw notFound();
      return listing;
    }
    if (draft.revision !== revision) throw conflict();
    const payload = draftPayloadSchema.parse(draft.payload);
    const data = parseListing({ ...payload.details, images: payload.images, vehicleRecords: payload.vehicleRecords });
    const listing = await tx.listing.create({ data: { ...data, reviewStatus: "PENDING", reviewRevision: 0, user: { connect: { id: userId } }, coverImage: data.images[0] } });
    const claimed = await tx.listingDraft.updateMany({
      where: { id, userId, revision, publishedListingId: null, deletedAt: null },
      data: { publishedListingId: listing.id },
    });
    if (claimed.count !== 1) throw conflict();
    // A tombstone links retries to the same listing without duplicating it.
    return listing;
  });
}
