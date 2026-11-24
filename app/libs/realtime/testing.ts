import type { ChannelKind, RealtimeChannel, RealtimeEventName, RealtimePayload } from "./catalog";
import { installClientTransport, subscriptionReady } from "./client";
import { installServerTransport } from "./server";

/** A channel as tests write it: `listing:<listingId>` or `user:<userId>`. */
export type ChannelLabel = `${RealtimeChannel["kind"]}:${string}`;

export interface PublishedEvent {
  channel: ChannelLabel;
  event: string;
  payload: unknown;
}

const channelLabel = (channel: RealtimeChannel) => `${channel.kind}:${channel.key}` as ChannelLabel;

/**
 * Installs a fake transport that records published real-time updates. Call
 * `uninstall` after each test.
 */
export function installFakeRealtime() {
  const published: PublishedEvent[] = [];
  const authorized: Array<{ socketId: string; channel: ChannelLabel }> = [];
  let shouldFail: (event: string, channel: ChannelLabel) => boolean = () => false;

  const restoreServer = installServerTransport({
    async send(channel, event, payload) {
      if (shouldFail(event, channelLabel(channel))) throw new Error("Fake realtime send failed");
      published.push({ channel: channelLabel(channel), event, payload });
    },
    authorize(socketId, channel) {
      authorized.push({ socketId, channel: channelLabel(channel) });
      return { auth: `signed:${socketId}:${channel.name}` };
    },
  });

  const subscriptions = new Map<ChannelLabel, { consumers: number; listeners: Map<string | symbol, Set<(payload: unknown) => void>> }>();
  const everSubscribed = new Set<ChannelLabel>();
  const restoreClient = installClientTransport({
    acquire(channel) {
      const name = channelLabel(channel);
      everSubscribed.add(name);
      const entry = subscriptions.get(name) ?? { consumers: 0, listeners: new Map() };
      entry.consumers += 1;
      subscriptions.set(name, entry);
      return {
        bind(event, listener) {
          const set = entry.listeners.get(event) ?? new Set();
          set.add(listener);
          entry.listeners.set(event, set);
        },
        unbind(event, listener) {
          entry.listeners.get(event)?.delete(listener);
        },
      };
    },
    release(channel) {
      const name = channelLabel(channel);
      const entry = subscriptions.get(name);
      if (!entry) return;
      entry.consumers -= 1;
      if (entry.consumers === 0) subscriptions.delete(name);
    },
  });
  const notify = (channel: ChannelLabel, event: string | symbol, payload: unknown) => {
    for (const listener of [...(subscriptions.get(channel)?.listeners.get(event) ?? [])]) listener(payload);
  };

  return {
    /** Delivers an event to everything subscribed to it in the browser. */
    deliver: <K extends ChannelKind, E extends RealtimeEventName<K>>(channel: `${K}:${string}`, event: E, payload: RealtimePayload<K, E>) =>
      notify(channel, event, payload),
    /** Signals that the subscription to `channel` is established. */
    ready: (channel: ChannelLabel) => notify(channel, subscriptionReady, undefined),
    /** Whether any browser consumer holds `channel` right now. */
    subscribed: (channel: ChannelLabel) => subscriptions.has(channel),
    /** How many handlers are bound on `channel` right now. */
    listeners: (channel: ChannelLabel) =>
      [...(subscriptions.get(channel)?.listeners.values() ?? [])].reduce((total, set) => total + set.size, 0),
    /** Whether anything subscribed to `channel` since the fake was installed. */
    everSubscribed: (channel: ChannelLabel) => everSubscribed.has(channel),
    /** Every event sent successfully, in order. */
    published,
    /** Every private subscription the transport signed. */
    authorized,
    /** The payloads of one event sent on one channel. */
    sent: (channel: ChannelLabel, event: string) =>
      published.filter((item) => item.channel === channel && item.event === event).map((item) => item.payload),
    /** Makes matching sends fail; with no argument, every send fails. */
    failSends(predicate: (event: string, channel: ChannelLabel) => boolean = () => true) {
      shouldFail = predicate;
    },
    uninstall() {
      restoreServer();
      restoreClient();
    },
  };
}

export type FakeRealtime = ReturnType<typeof installFakeRealtime>;
