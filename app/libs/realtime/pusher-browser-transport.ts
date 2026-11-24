"use client";

import PusherClient, { type Channel } from "pusher-js";
import type { RealtimeClientTransport } from "./client";

let client: PusherClient | undefined;

function getPusherClient() {
  if (typeof window === "undefined") {
    throw new Error("Pusher subscriptions are only available in the browser.");
  }

  // Initialize on the first subscription, not during server rendering.
  client ??= new PusherClient(process.env.NEXT_PUBLIC_PUSHER_APP_KEY!, {
    cluster: "us2",
    channelAuthorization: { endpoint: "/api/pusher/auth", transport: "ajax" },
  });

  return client;
}

// Every consumer of a channel shares one Pusher subscription, which is left
// when the last consumer releases it.
const channels = new Map<string, { channel: Channel; consumers: number }>();

/** Pusher's own signal that a subscription succeeded, including after a reconnect. */
const subscriptionSucceeded = "pusher:subscription_succeeded";

export function createPusherBrowserTransport(subscriptionReady: symbol): RealtimeClientTransport {
  const eventName = (event: string | symbol) => (event === subscriptionReady ? subscriptionSucceeded : String(event));
  return {
    acquire({ name }) {
      const entry = channels.get(name) ?? { channel: getPusherClient().subscribe(name), consumers: 0 };
      entry.consumers += 1;
      channels.set(name, entry);
      return {
        bind: (event, listener) => { entry.channel.bind(eventName(event), listener); },
        unbind: (event, listener) => { entry.channel.unbind(eventName(event), listener); },
      };
    },
    release({ name }) {
      const entry = channels.get(name);
      if (!entry) return;
      entry.consumers -= 1;
      if (entry.consumers === 0) {
        getPusherClient().unsubscribe(name);
        channels.delete(name);
      }
    },
  };
}
