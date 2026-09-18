"use client";

import PusherClient from "pusher-js";

let client: PusherClient | undefined;

export function getPusherClient() {
  if (typeof window === "undefined") {
    throw new Error("Pusher subscriptions are only available in the browser.");
  }

  // Initialize on the first subscription, not during server rendering.
  client ??= new PusherClient(process.env.NEXT_PUBLIC_PUSHER_APP_KEY!, {
    cluster: "us2",
  });

  return client;
}
