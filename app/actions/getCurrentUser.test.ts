import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock("./getSession", () => ({ getSession: mocks.getSession }));
vi.mock("../libs/prismadb", () => ({
  default: { user: { findUnique: mocks.findUnique } },
}));
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
    });
  });

  it("returns a safe DTO without the password hash", async () => {
    const user = await getCurrentUser();

    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: { email: "driver@example.com" },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        createdAt: true,
        hashedPassword: true,
      },
    });
    expect(user).toEqual({
      id: "user-1",
      name: "Driver",
      email: "driver@example.com",
      image: null,
      createdAt: new Date("2026-09-10T12:00:00.000Z"),
      hasPassword: true,
    });
    expect(user).not.toHaveProperty("hashedPassword");
  });

  it("does not query the database without a session email", async () => {
    mocks.getSession.mockResolvedValue(null);

    await expect(getCurrentUser()).resolves.toBeNull();
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
});
