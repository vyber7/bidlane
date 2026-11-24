import "server-only";

import PusherServer from "pusher";
import type { RealtimeServerTransport } from "./server";

const pusher = new PusherServer({
  appId: process.env.PUSHER_APP_ID!,
  key: process.env.NEXT_PUBLIC_PUSHER_APP_KEY!,
  secret: process.env.PUSHER_SECRET!,
  cluster: "us2",
  useTLS: true,
});

export const pusherServerTransport: RealtimeServerTransport = {
  send: (channel, event, payload) => pusher.trigger(channel.name, event, payload),
  authorize: (socketId, channel) => pusher.authorizeChannel(socketId, channel.name),
};
