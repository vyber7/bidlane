"use client";

import { useEffect, useEffectEvent } from "react";
import { acquirePusherChannel, releasePusherChannel } from "@/app/libs/pusher-channels";
import type { ChannelKind, RealtimeChannel, RealtimeEventName, RealtimePayload } from "./catalog";

/** The signal that a subscription is (re)established and missed events should be recovered. */
export const subscriptionReady = Symbol("subscription-ready");
type Binding = string | typeof subscriptionReady;
type Listener = (payload: unknown) => void;

export interface RealtimeSubscription {
  bind(event: Binding, listener: Listener): void;
  unbind(event: Binding, listener: Listener): void;
}

export interface RealtimeClientTransport {
  /** Joins a channel. Each acquire is matched by one release. */
  acquire(channel: RealtimeChannel): RealtimeSubscription;
  release(channel: RealtimeChannel): void;
}

let installed: RealtimeClientTransport | null = null;
let pusherTransport: RealtimeClientTransport | null = null;

/** Replaces the transport, for tests. Returns a function that restores the default. */
export function installClientTransport(transport: RealtimeClientTransport) {
  installed = transport;
  return () => { if (installed === transport) installed = null; };
}

function transport() {
  if (installed) return installed;
  pusherTransport ??= createPusherClientTransport();
  return pusherTransport;
}

function createPusherClientTransport(): RealtimeClientTransport {
  const pusherEventName = (event: Binding) => (event === subscriptionReady ? "pusher:subscription_succeeded" : event);
  return {
    acquire(channel) {
      const subscription = acquirePusherChannel(channel.name);
      return {
        bind: (event, listener) => { subscription.bind(pusherEventName(event), listener); },
        unbind: (event, listener) => { subscription.unbind(pusherEventName(event), listener); },
      };
    },
    release: (channel) => releasePusherChannel(channel.name),
  };
}

function useBinding(channel: RealtimeChannel | null, event: Binding, handler: Listener) {
  const onEvent = useEffectEvent(handler);
  const kind = channel?.kind;
  const key = channel?.key;
  const name = channel?.name;

  useEffect(() => {
    if (!kind || key === undefined || !name) return;
    const target: RealtimeChannel = { kind, key, name };
    const subscription = transport().acquire(target);
    const listener: Listener = (payload) => onEvent(payload);
    subscription.bind(event, listener);
    return () => {
      subscription.unbind(event, listener);
      transport().release(target);
    };
  }, [kind, key, name, event]);
}

/** Runs `handler` for each `event` on `channel`. Pass a null channel to stay unsubscribed. */
export function useRealtimeEvent<K extends ChannelKind, E extends RealtimeEventName<K>>(
  channel: RealtimeChannel<K> | null,
  event: E,
  handler: (payload: RealtimePayload<K, E>) => void,
) {
  useBinding(channel, event, handler as Listener);
}

/** Runs `handler` whenever the subscription to `channel` is established, so the caller can catch up on missed events. */
export function useRealtimeReady(channel: RealtimeChannel | null, handler: () => void) {
  useBinding(channel, subscriptionReady, handler);
}
