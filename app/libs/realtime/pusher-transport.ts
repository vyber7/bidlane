import { pusherServer } from "@/app/libs/pusher";
import type { RealtimeServerTransport } from "./server";

export const pusherServerTransport: RealtimeServerTransport = {
  send: (channel, event, payload) => pusherServer.trigger(channel.name, event, payload),
  authorize: (socketId, channel) => pusherServer.authorizeChannel(socketId, channel.name),
};
