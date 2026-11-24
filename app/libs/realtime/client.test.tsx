// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

// Only the third-party client is replaced: this covers the production
// transport, which every other test swaps for the fake.
const mocks = vi.hoisted(() => ({ subscribe: vi.fn(), unsubscribe: vi.fn(), bind: vi.fn(), unbind: vi.fn() }));
vi.mock("pusher-js", () => ({
  default: class {
    subscribe = mocks.subscribe;
    unsubscribe = mocks.unsubscribe;
  },
}));

import { userChannel, type RealtimeChannel } from "./catalog";
import { useRealtimeEvent, useRealtimeReady } from "./client";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.subscribe.mockReturnValue({ bind: mocks.bind, unbind: mocks.unbind });
});
afterEach(cleanup);

function Badge({ onChange, onReady }: { onChange: () => void; onReady: () => void }) {
  const channel = userChannel("buyer");
  useRealtimeEvent(channel, "notifications-changed", onChange);
  useRealtimeReady(channel, onReady);
  return null;
}

it("shares one Pusher subscription per channel and leaves it with the last consumer", () => {
  const onChange = vi.fn();
  const onReady = vi.fn();
  const { unmount } = render(<><Badge onChange={onChange} onReady={onReady} /><Badge onChange={vi.fn()} onReady={vi.fn()} /></>);

  expect(mocks.subscribe).toHaveBeenCalledExactlyOnceWith("private-user-buyer");
  const bound = new Map(mocks.bind.mock.calls.slice(0, 2).map(([event, listener]) => [event, listener]));
  expect([...bound.keys()]).toEqual(["notifications-changed", "pusher:subscription_succeeded"]);
  bound.get("notifications-changed")!({});
  bound.get("pusher:subscription_succeeded")!();
  expect(onChange).toHaveBeenCalledOnce();
  expect(onReady).toHaveBeenCalledOnce();

  unmount();
  expect(mocks.unbind).toHaveBeenCalledTimes(4);
  expect(mocks.unsubscribe).toHaveBeenCalledExactlyOnceWith("private-user-buyer");
});

it("stays unsubscribed without a channel", () => {
  function SignedOut() {
    const channel = null as RealtimeChannel<"user"> | null;
    useRealtimeEvent(channel, "notifications-changed", () => {});
    return null;
  }
  render(<SignedOut />);
  expect(mocks.subscribe).not.toHaveBeenCalled();
});
