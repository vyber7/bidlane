import { getNativeRepositories, withNativeTransaction } from "./native-repositories";
import { engagementTransactionOptions, isTransactionContention } from "@/prisma/native/transaction-errors";
import { enforceAbuseLimit } from "./abuse-limits";
import { assertOwnedAssets } from "./uploaded-assets";
import { canViewListing, isPublicListing } from "./listing-review";
import { commentNotifications, saveNotifications } from "./notifications";
import { logger } from "./logger";
import { listingChannel, userChannel } from "./realtime/catalog";
import { notificationsChanged, publish } from "./realtime/server";
import { serializeListing } from "@/app/utils/listing-serialization";
import type { CommentEvent } from "@/app/types/auction-events";

// Engagement commands follow the auction commands' shape: each one owns its
// transaction and the real-time updates it sends after commit, and returns a
// typed outcome. Routes only parse requests and map rejections to HTTP.
//
// Every command reports transaction contention as the "busy" rejection. The
// abuse quota and uploaded-image ownership checks keep their shared modules'
// own error modes and propagate.

// ---------------------------------------------------------------------------
// Post a comment

export interface CommentRequest {
  author: { id: string };
  listingId: string;
  body: string;
  /** An uploaded image, which must belong to the author for this Listing. */
  image?: string;
}

export type CommentRejection =
  | "not-found"
  /** The Listing isn't public, or left public view before the comment committed. */
  | "not-public"
  | "busy";

export type CommentOutcome =
  | { ok: true; comment: CommentEvent }
  | { ok: false; reason: CommentRejection };

export async function postComment(request: CommentRequest, now: () => Date = () => new Date()): Promise<CommentOutcome> {
  const { author, listingId, body, image } = request;
  await enforceAbuseLimit("comment", author.id);

  let outcome;
  try {
    outcome = await withNativeTransaction(async (tx) => {
      const listing = await tx.engagement.find(listingId);
      if (!listing) return { ok: false, reason: "not-found" } as const;
      if (!isPublicListing(listing)) return { ok: false, reason: "not-public" } as const;
      if (image) await assertOwnedAssets({ userId: author.id, kind: "PHOTO", urls: [image], listingId });

      const createdAt = now();
      // Touch first: it only matches a public Listing, so approval changing
      // while this transaction runs rejects the comment before it is written.
      const touched = await tx.engagement.touchComment(listingId, createdAt);
      if (touched.count !== 1) return { ok: false, reason: "not-public" } as const;
      const comment = await tx.comments.create({ listingId, userId: author.id, body, image }, createdAt);
      const notificationUsers = await saveNotifications(tx, commentNotifications(listing, comment, author.id));
      return { ok: true, comment, notificationUsers } as const;
    }, engagementTransactionOptions);
  } catch (error) {
    if (isTransactionContention(error)) return { ok: false, reason: "busy" };
    throw error;
  }
  if (!outcome.ok) return outcome;

  const comment = { ...outcome.comment, createdAt: outcome.comment.createdAt.toISOString() } satisfies CommentEvent;
  await publish("comment.realtime_update_failed", [
    { channel: listingChannel(listingId), event: "new-comment", payload: comment },
    ...notificationsChanged(outcome.notificationUsers),
  ], { listingId });
  return { ok: true, comment };
}

// ---------------------------------------------------------------------------
// Watch or unwatch a Listing

export interface WatchRequest {
  watcher: { id: string };
  listingId: string;
  watching: boolean;
}

/** A Listing that isn't public is reported as not found, so its existence stays hidden. */
export type WatchRejection = "not-found" | "busy";

export type WatchOutcome =
  | { ok: true; watching: boolean }
  | { ok: false; reason: WatchRejection };

export async function setWatch(request: WatchRequest): Promise<WatchOutcome> {
  const { watcher, listingId, watching } = request;
  let recorded: boolean;
  try {
    recorded = await withNativeTransaction(async (tx) => {
      const listing = await tx.engagement.find(listingId);
      if (!listing || !isPublicListing(listing)) return false;
      const updated = await tx.engagement.setWatch(listingId, watcher.id, watching);
      return updated.count === 1;
    }, engagementTransactionOptions);
  } catch (error) {
    if (isTransactionContention(error)) return { ok: false, reason: "busy" };
    throw error;
  }
  if (!recorded) return { ok: false, reason: "not-found" };

  await publishWatch(request);
  return { ok: true, watching };
}

async function publishWatch({ watcher, listingId, watching }: WatchRequest) {
  const context = { listingId, userId: watcher.id };
  // Read after commit so the watcher count and the viewer's state reflect
  // persisted data. The change is already recorded: a failed read must not
  // make the client roll it back.
  const snapshot = await getNativeRepositories().engagement.watchSnapshot(listingId, watcher.id).catch(() => {
    logger.warn("watchlist.realtime_update_failed", context);
    return null;
  });
  // Never send real-time updates for a Listing removed from public view.
  if (!snapshot || !isPublicListing({ status: snapshot.listing.status, reviewStatus: snapshot.reviewStatus })) return;

  const viewerChannel = userChannel(watcher.id);
  await publish("watchlist.realtime_update_failed", [
    { channel: viewerChannel, event: "watchlist-update", payload: { listingId, userId: watcher.id, watching } },
    { channel: viewerChannel, event: "watching-update", payload: { listing: serializeListing(snapshot.listing), watching } },
    { channel: listingChannel(listingId), event: "watcher-count-update", payload: { listingId, watcherCount: snapshot.listing.watcherCount } },
  ], context);
}

// ---------------------------------------------------------------------------
// Record a Listing view

export interface ViewRequest {
  /** The signed-in viewer, or null for an anonymous visitor, whose views aren't counted. */
  viewer: { id: string; role?: string | null } | null;
  listingId: string;
}

/** A Listing the viewer can't see is reported as not found, so its existence stays hidden. */
export type ViewRejection = "not-found" | "busy";

export type ViewOutcome =
  | { ok: true; views: number }
  | { ok: false; reason: ViewRejection };

export async function recordView(request: ViewRequest, now: () => Date = () => new Date()): Promise<ViewOutcome> {
  const { viewer, listingId } = request;
  if (!viewer) {
    const listing = await getNativeRepositories().engagement.find(listingId);
    if (!listing || !canViewListing(listing, null)) return { ok: false, reason: "not-found" };
    return { ok: true, views: listing.views };
  }

  try {
    return await withNativeTransaction(async (tx) => {
      const listing = await tx.engagement.find(listingId);
      if (!listing || !canViewListing(listing, viewer)) return { ok: false, reason: "not-found" } as const;

      // Each viewer counts once; a repeated visit returns the current count.
      const seenAt = now();
      const counted = await tx.engagement.claimView(listingId, viewer.id, seenAt);
      if (counted === null) return { ok: true, views: listing.views } as const;
      await tx.engagement.recordSeen(viewer.id, listingId, seenAt);
      return { ok: true, views: counted } as const;
    }, engagementTransactionOptions);
  } catch (error) {
    if (isTransactionContention(error)) return { ok: false, reason: "busy" };
    throw error;
  }
}
