import type { Listing, Prisma } from "@prisma/client";
import type { AccountNotification } from "@/app/types/account";
import { pusherServer } from "./pusher";
import { logger } from "./logger";

type Vehicle = Pick<Listing, "id" | "year" | "make" | "model" | "userId">;
export type NotificationDraft = Omit<AccountNotification, "id" | "createdAt" | "readAt"> & {
  userId: string;
  eventKey: string;
  createdAt: Date;
  emailListingId?: string;
};
const vehicleName = (listing: Vehicle) => `${listing.year} ${listing.make} ${listing.model}`;

export function outbidNotifications(listing: Vehicle & Pick<Listing, "highestBidderId">, bid: { id: string; userId: string; createdAt: Date }): NotificationDraft[] {
  if (!listing.highestBidderId || listing.highestBidderId === bid.userId) return [];
  return [{
    userId: listing.highestBidderId, eventKey: `outbid:${bid.id}`, kind: "bid",
    title: "You’ve been outbid", message: `Another bidder has taken the lead on the ${vehicleName(listing)}. There’s still time to bid again.`,
    href: `/listing/${listing.id}#bids`, actionLabel: "Bid again", tone: "warning", createdAt: bid.createdAt, emailListingId: listing.id,
  }];
}

export function auctionResultNotifications(listing: Vehicle & Pick<Listing, "highestBidderId" | "biddersIds">, result: "SOLD" | "RESERVE_NOT_MET", createdAt: Date): NotificationDraft[] {
  const sold = result === "SOLD";
  const base = { eventKey: `auction-ended:${listing.id}`, kind: "auction" as const, createdAt, href: `/listing/${listing.id}` };
  const notifications: NotificationDraft[] = [{
    ...base, userId: listing.userId, title: sold ? "Your vehicle sold" : "Your auction ended",
    message: sold ? `The ${vehicleName(listing)} has sold. Contact the buyer to arrange the next steps.` : `The auction for your ${vehicleName(listing)} closed without a sale.`,
    href: sold ? "/account/shipments" : base.href, actionLabel: sold ? "Contact buyer" : "View result", tone: sold ? "success" : "neutral",
  }];
  const bidders = new Set([...listing.biddersIds, ...(listing.highestBidderId ? [listing.highestBidderId] : [])]);
  bidders.delete(listing.userId);
  for (const userId of bidders) {
    const won = sold && userId === listing.highestBidderId;
    notifications.push({
      ...base, userId, title: won ? "You won the auction" : "Auction ended",
      message: won ? `Your bid won the ${vehicleName(listing)}. Contact the seller to arrange the next steps.` : `The auction for the ${vehicleName(listing)} has ended${sold ? "." : " without a sale."}`,
      href: won ? "/account/shipments" : base.href, actionLabel: won ? "Contact seller" : "View result", tone: won ? "success" : "neutral",
    });
  }
  return notifications;
}

export function auctionLiveNotifications(listing: Vehicle & Pick<Listing, "watchersIds">, createdAt: Date): NotificationDraft[] {
  return [...new Set(listing.watchersIds)].filter((id) => id !== listing.userId).map((userId) => ({
    userId, eventKey: `auction-live:${listing.id}`, kind: "auction", title: "A watched auction is live",
    message: `Bidding is open on the ${vehicleName(listing)}.`, createdAt,
    href: `/listing/${listing.id}`, actionLabel: "View auction", tone: "neutral",
  }));
}

export function commentNotifications(listing: Vehicle, comment: { id: string; body: string | null; createdAt: Date; user: { name: string | null } | null }, authorId: string): NotificationDraft[] {
  if (listing.userId === authorId) return [];
  return [{
    userId: listing.userId, eventKey: `comment:${comment.id}`, kind: "comment", title: "New comment on your listing",
    message: `${comment.user?.name || "A buyer"} commented on your ${vehicleName(listing)}${comment.body ? `: “${comment.body.slice(0, 100)}${comment.body.length > 100 ? "…" : ""}”` : "."}`,
    createdAt: comment.createdAt, href: `/listing/${listing.id}#comments`, actionLabel: "View comment", tone: "neutral",
  }];
}

// Call within the transaction that changes auction state. Stable event keys
// and an empty update preserve both the original event and its read timestamp.
export async function saveNotifications(tx: Pick<Prisma.TransactionClient, "notification">, notifications: NotificationDraft[]) {
  for (const item of notifications) {
    await tx.notification.upsert({
      where: { userId_eventKey: { userId: item.userId, eventKey: item.eventKey } },
      create: { ...item, readAt: null, ...(item.emailListingId && { emailStatus: "PENDING", emailNextAttemptAt: new Date() }) }, update: {},
    });
  }
  return [...new Set(notifications.map((item) => item.userId))];
}

export async function publishNotificationChanges(userIds: string[]) {
  const results = await Promise.allSettled([...new Set(userIds)].map(async (userId) =>
    pusherServer.trigger(`private-user-${userId}`, "notifications-changed", {})
  ));
  if (results.some((result) => result.status === "rejected")) {
    logger.warn("notification.live_update_failed", {});
  }
}
