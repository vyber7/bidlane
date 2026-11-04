import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  hash: vi.fn(),
  create: vi.fn(),
}));

vi.mock("bcrypt", () => ({ default: { hash: mocks.hash } }));
vi.mock("../../libs/prismadb", () => ({
  default: { user: { create: mocks.create } },
}));
vi.mock("@/app/libs/logger", () => ({
  logger: { error: vi.fn() },
}));

import { POST } from "./route";

function request(body: unknown) {
  return new Request("http://localhost/api/register", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hash.mockResolvedValue("bcrypt-secret");
    mocks.create.mockResolvedValue({
      id: "user-1",
      hashedPassword: "bcrypt-secret",
    });
  });

  it("never returns the stored password hash", async () => {
    const response = await POST(
      request({ name: "Driver", email: "driver@example.com", password: "secret" })
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ id: "user-1" });
    expect(mocks.create).toHaveBeenCalledWith({
      data: {
        name: "Driver",
        email: "driver@example.com",
        hashedPassword: "bcrypt-secret",
      },
      select: { id: true },
    });
  });

  it("keeps required registration fields", async () => {
    const response = await POST(
      request({ name: "", email: "driver@example.com", password: "secret" })
    );

    expect(response.status).toBe(400);
    expect(mocks.hash).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("does not allow public registration to grant an admin role", async () => {
    const response = await POST(request({ name: "Driver", email: "driver@example.com", password: "secret", role: "ADMIN", isAdmin: true }));
    expect(response.status).toBe(201);
    expect(mocks.create.mock.calls[0][0].data).toEqual({ name: "Driver", email: "driver@example.com", hashedPassword: "bcrypt-secret" });
  });

  it.each([
    { name: {} }, { email: [] }, { password: 123 }, { name: "   " },
  ])("rejects invalid registration fields %j before hashing", async (change) => {
    const response = await POST(request({ name: "Driver", email: "driver@example.com", password: "secret", ...change }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Name, email, and password are required" });
    expect(mocks.hash).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("reports duplicate registration as a conflict", async () => {
    mocks.create.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("Unique constraint", {
      code: "P2002", clientVersion: "test",
    }));
    const response = await POST(request({ name: "Driver", email: "driver@example.com", password: "secret" }));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "An account with this email already exists" });
  });

  it("rejects malformed email addresses before hashing or writing", async () => {
    const response = await POST(request({ name: "Driver", email: "not-an-email", password: "secret" }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Please enter a valid email address" });
    expect(mocks.hash).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("normalizes registration details without changing the password", async () => {
    const response = await POST(request({ name: " Driver ", email: " driver@example.com ", password: " secret " }));
    expect(response.status).toBe(201);
    expect(mocks.hash).toHaveBeenCalledWith(" secret ", 12);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      data: { name: "Driver", email: "driver@example.com", hashedPassword: "bcrypt-secret" },
    }));
  });
});
