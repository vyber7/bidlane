import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock("./getSession", () => ({ getSession: mocks.getSession }));
vi.mock("../libs/native-repositories", () => ({ getNativeRepositories: () => ({ users: { byEmail: mocks.findUnique } }) }));
vi.mock("../libs/logger", () => ({
  logger: { error: vi.fn() },
}));

import getCurrentUser from "./getCurrentUser";

describe("getCurrentUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { email: "driver@example.com" } });
    mocks.findUnique.mockResolvedValue({
      id: "user-1",
      name: "Driver",
      email: "driver@example.com",
      image: null,
      createdAt: new Date("2026-09-10T12:00:00.000Z"),
      hashedPassword: "bcrypt-secret",
      sessionVersion: "private-version", futureSecret: "private",
    });
  });

  it("returns a safe DTO without the password hash", async () => {
    const user = await getCurrentUser();

    expect(mocks.findUnique).toHaveBeenCalledWith("driver@example.com");
    expect(user).toEqual({
      id: "user-1",
      name: "Driver",
      email: "driver@example.com",
      image: null,
      createdAt: new Date("2026-09-10T12:00:00.000Z"),
      hasPassword: true,
      role: "USER",
    });
    expect(user).not.toHaveProperty("hashedPassword");
    expect(user).not.toHaveProperty("sessionVersion");
    expect(user).not.toHaveProperty("futureSecret");
  });

  it("does not query the database without a session email", async () => {
    mocks.getSession.mockResolvedValue(null);

    await expect(getCurrentUser()).resolves.toBeNull();
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("uses the current database role rather than a session role", async () => {
    mocks.getSession.mockResolvedValue({ user: { email: "driver@example.com", role: "ADMIN" } });
    mocks.findUnique.mockResolvedValueOnce({ id: "user-1", role: "USER" });
    expect((await getCurrentUser())?.role).toBe("USER");
    mocks.findUnique.mockResolvedValueOnce({ id: "user-1", role: "ADMIN" });
    expect((await getCurrentUser())?.role).toBe("ADMIN");
    mocks.findUnique.mockResolvedValueOnce({ id: "user-1", role: null });
    expect((await getCurrentUser())?.role).toBe("USER");
  });
});
