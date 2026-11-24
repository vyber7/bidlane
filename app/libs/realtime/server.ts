import "server-only";

import { logger } from "@/app/libs/logger";
import { userChannel, type RealtimeChannel, type RealtimeEvent } from "./catalog";

export interface RealtimeServerTransport {
  send(channel: RealtimeChannel, event: string, payload: unknown): Promise<unknown>;
  /** Signs a browser's subscription to a private channel. */
  authorize(socketId: string, channel: RealtimeChannel): unknown;
}

let installed: RealtimeServerTransport | null = null;

/** Replaces the transport, for tests. Returns a function that restores the default. */
export function installServerTransport(transport: RealtimeServerTransport) {
  installed = transport;
  return () => { if (installed === transport) installed = null; };
}

async function transport(): Promise<RealtimeServerTransport> {
  // Loaded lazily so code that never publishes, and tests with a fake
  // transport, never construct the Pusher server client.
  return installed ?? (await import("./pusher-transport")).pusherServerTransport;
}

/**
 * Sends real-time updates best-effort, after the caller's write has committed.
 * Failures are logged once under `label` and never reject: a real-time update
 * must not undo a bid, comment or watch that was already saved.
 */
export async function publish(label: string, events: RealtimeEvent[], context: Record<string, unknown> = {}) {
  if (events.length === 0) return;
  let sender: RealtimeServerTransport;
  try {
    sender = await transport();
  } catch {
    logger.warn(label, { ...context, failed: events.map(failureSummary) });
    return;
  }
  const results = await Promise.allSettled(
    events.map((item) => Promise.resolve().then(() => sender.send(item.channel, item.event, item.payload))),
  );
  const failed = events.filter((_, index) => results[index].status === "rejected").map(failureSummary);
  if (failed.length > 0) logger.warn(label, { ...context, failed });
}

function failureSummary(item: RealtimeEvent) {
  return { channel: item.channel.kind, event: item.event };
}

/** One "notifications changed" event per affected user, however often they appear. */
export function notificationsChanged(userIds: Iterable<string>): RealtimeEvent[] {
  return [...new Set(userIds)].map((userId) => ({
    channel: userChannel(userId),
    event: "notifications-changed",
    payload: {},
  }));
}

/** Signs `channelName` for the user, or returns null when it isn't their own user channel. */
export async function authorizeUserChannel(userId: string, socketId: string, channelName: string) {
  const channel = userChannel(userId);
  if (channelName !== channel.name) return null;
  return (await transport()).authorize(socketId, channel);
}
