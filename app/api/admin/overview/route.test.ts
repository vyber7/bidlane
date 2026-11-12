import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ user: vi.fn(), userCount: vi.fn(), listingCount: vi.fn() }));
vi.mock("@/app/actions/getCurrentUser", () => ({ default: mocks.user }));
vi.mock("@/app/libs/read-repositories", () => ({ getReadRepositories: () => ({ listings: { count: mocks.listingCount } }) }));
vi.mock("@/app/libs/native-repositories", () => ({ getNativeRepositories: () => ({ users: { count: mocks.userCount } }) }));
vi.mock("@/app/libs/logger", () => ({ logger: { error: vi.fn() } }));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ id: "admin-1", name: "Admin", email: "admin@example.com", role: "ADMIN" });
  mocks.userCount.mockResolvedValue(3);
  mocks.listingCount.mockResolvedValue(2);
});

describe("admin overview authorization", () => {
  it.each([
    [null, 401],
    [{ id: "user-1", role: "USER" }, 403],
    [{ id: "legacy-user" }, 403],
    [{ id: "user-1", role: null }, 403],
    [{ id: "user-1", role: "admin" }, 403],
  ])("denies unauthorized account %j with %i before reading admin data", async (user, status) => {
    mocks.user.mockResolvedValue(user);
    const response = await GET();
    expect(response.status).toBe(status);
    expect(await response.json()).toHaveProperty("error");
    expect(mocks.userCount).not.toHaveBeenCalled();
    expect(mocks.listingCount).not.toHaveBeenCalled();
  });

  it("returns a private overview for an admin", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ admin: { id: "admin-1", name: "Admin", email: "admin@example.com" }, users: 3, listings: 2, liveAuctions: 2 });
    expect(mocks.listingCount).toHaveBeenCalledWith("LIVE");
  });

  it("checks the current role again after admin access is revoked", async () => {
    expect((await GET()).status).toBe(200);
    mocks.user.mockResolvedValue({ id: "admin-1", role: "USER" });
    expect((await GET()).status).toBe(403);
    expect(mocks.user).toHaveBeenCalledTimes(2);
    expect(mocks.userCount).toHaveBeenCalledTimes(1);
  });

  it("returns a generic failure when admin data cannot be loaded", async () => {
    mocks.userCount.mockRejectedValueOnce(new Error("private database details"));
    const response = await GET();
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Unable to load administration overview" });
  });
});
