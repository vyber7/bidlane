import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  constructor: vi.fn(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock("pusher-js", () => ({
  default: class {
    constructor(...args: unknown[]) {
      mocks.constructor(...args);
    }
    subscribe = mocks.subscribe;
    unsubscribe = mocks.unsubscribe;
  },
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it("does not open connections when imported on the server", async () => {
  vi.stubGlobal("window", undefined);
  await import("./pusher-channels");
  const { getPusherClient } = await import("./pusher-client");

  expect(mocks.constructor).not.toHaveBeenCalled();
  expect(() => getPusherClient()).toThrow("only available in the browser");
  expect(mocks.constructor).not.toHaveBeenCalled();
});

it("shares one browser client and keeps a channel until its last consumer leaves", async () => {
  vi.stubGlobal("window", {});
  const channel = {};
  mocks.subscribe.mockReturnValue(channel);
  const { acquirePusherChannel, releasePusherChannel } = await import("./pusher-channels");

  expect(mocks.constructor).not.toHaveBeenCalled();
  expect(acquirePusherChannel("listing-1")).toBe(channel);
  expect(acquirePusherChannel("listing-1")).toBe(channel);
  expect(mocks.subscribe).toHaveBeenCalledTimes(1);

  releasePusherChannel("listing-1");
  expect(mocks.unsubscribe).not.toHaveBeenCalled();
  releasePusherChannel("listing-1");
  expect(mocks.unsubscribe).toHaveBeenCalledExactlyOnceWith("listing-1");

  acquirePusherChannel("listing-2");
  expect(mocks.constructor).toHaveBeenCalledTimes(1);
  expect(mocks.subscribe).toHaveBeenCalledTimes(2);
  releasePusherChannel("listing-2");
});
