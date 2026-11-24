import type {
  AuctionEndedEvent,
  AuctionEndTimeEvent,
  AuctionStartedEvent,
  BidEvent,
  CommentEvent,
  WatcherCountEvent,
  WatchingUpdateEvent,
  WatchlistUpdateEvent,
} from "@/app/types/auction-events";

/**
 * Every live update Bidlane sends, by channel kind. The keys are the wire
 * event names: browsers running an earlier deploy still listen for them, so
 * they never change.
 */
export interface RealtimeCatalog {
  /** A Listing's public channel. Anyone viewing the Listing subscribes. */
  listing: {
    "new-bid": BidEvent;
    /** The deadline moved under the Extension rule. */
    "new-end-time": AuctionEndTimeEvent;
    "auction-started": AuctionStartedEvent;
    /** Finalization recorded the Result. */
    "auction-ended": AuctionEndedEvent;
    "new-comment": CommentEvent;
    "watcher-count-update": WatcherCountEvent;
  };
  /** A user's private channel. Only that user is authorized to subscribe. */
  user: {
    "notifications-changed": Record<string, never>;
    "watchlist-update": WatchlistUpdateEvent;
    "watching-update": WatchingUpdateEvent;
  };
}

export type ChannelKind = keyof RealtimeCatalog;
export type RealtimeEventName<K extends ChannelKind> = keyof RealtimeCatalog[K] & string;
export type RealtimePayload<K extends ChannelKind, E extends RealtimeEventName<K>> = RealtimeCatalog[K][E];

export interface RealtimeChannel<K extends ChannelKind = ChannelKind> {
  kind: K;
  key: string;
  /** The transport's channel name. */
  name: string;
}

export function listingChannel(listingId: string): RealtimeChannel<"listing"> {
  return { kind: "listing", key: listingId, name: `listing-${listingId}` };
}

export function userChannel(userId: string): RealtimeChannel<"user"> {
  return { kind: "user", key: userId, name: `private-user-${userId}` };
}

/** One live update: an event from the catalog, on a channel that carries it. */
export type RealtimeEvent = {
  [K in ChannelKind]: {
    [E in RealtimeEventName<K>]: { channel: RealtimeChannel<K>; event: E; payload: RealtimePayload<K, E> };
  }[RealtimeEventName<K>];
}[ChannelKind];
