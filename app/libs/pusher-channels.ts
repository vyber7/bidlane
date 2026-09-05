"use client";

import type { Channel } from "pusher-js";
import { pusherClient } from "./pusher";

interface ChannelEntry {
  channel: Channel;
  consumers: number;
}

const channels = new Map<string, ChannelEntry>();

export function acquirePusherChannel(channelName: string) {
  const existing = channels.get(channelName);
  if (existing) {
    existing.consumers += 1;
    return existing.channel;
  }

  const channel = pusherClient.subscribe(channelName);
  channels.set(channelName, { channel, consumers: 1 });
  return channel;
}

export function releasePusherChannel(channelName: string) {
  const entry = channels.get(channelName);
  if (!entry) return;

  entry.consumers -= 1;
  if (entry.consumers === 0) {
    pusherClient.unsubscribe(channelName);
    channels.delete(channelName);
  }
}
