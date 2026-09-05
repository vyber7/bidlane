"use client";

import { useEffect, useEffectEvent } from "react";
import {
  acquirePusherChannel,
  releasePusherChannel,
} from "@/app/libs/pusher-channels";

export default function usePusherEvent<T>(
  channelName: string | null,
  eventName: string,
  handler: (data: T) => void
) {
  const onEvent = useEffectEvent(handler);

  useEffect(() => {
    if (!channelName) return;

    const channel = acquirePusherChannel(channelName);
    const listener = (data: T) => onEvent(data);
    channel.bind(eventName, listener);

    return () => {
      channel.unbind(eventName, listener);
      releasePusherChannel(channelName);
    };
  }, [channelName, eventName]);
}
