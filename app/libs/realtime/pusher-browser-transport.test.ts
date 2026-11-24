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

const ready = Symbol("ready");

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.subscribe.mockReturnValue({ bind: vi.fn(), unbind: vi.fn() });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it("does not open connections when imported on the server", async () => {
  vi.stubGlobal("window", undefined);
  const { createPusherBrowserTransport } = await import("./pusher-browser-transport");
  const transport = createPusherBrowserTransport(ready);

  expect(mocks.constructor).not.toHaveBeenCalled();
  expect(() => transport.acquire({ kind: "user", key: "buyer", name: "private-user-buyer" })).toThrow("only available in the browser");
  expect(mocks.constructor).not.toHaveBeenCalled();
});

it("shares one browser client and keeps a channel until its last consumer leaves", async () => {
  vi.stubGlobal("window", {});
  const { createPusherBrowserTransport } = await import("./pusher-browser-transport");
  const transport = createPusherBrowserTransport(ready);
  const first = { kind: "listing", key: "1", name: "listing-1" } as const;
  const second = { kind: "listing", key: "2", name: "listing-2" } as const;

  expect(mocks.constructor).not.toHaveBeenCalled();
  transport.acquire(first);
  transport.acquire(first);
  expect(mocks.subscribe).toHaveBeenCalledExactlyOnceWith("listing-1");

  transport.release(first);
  expect(mocks.unsubscribe).not.toHaveBeenCalled();
  transport.release(first);
  expect(mocks.unsubscribe).toHaveBeenCalledExactlyOnceWith("listing-1");

  transport.acquire(second);
  expect(mocks.constructor).toHaveBeenCalledTimes(1);
  expect(mocks.subscribe).toHaveBeenCalledTimes(2);
  transport.release(second);
});
