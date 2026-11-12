import { beforeEach, describe, expect, it, vi } from "vitest";
import { MongoServerError } from "mongodb";

const mocks = vi.hoisted(() => ({ limit: vi.fn(),
  hash: vi.fn(),
  create: vi.fn(),
  findEmail: vi.fn(),
}));

vi.mock("@/app/libs/abuse-limits", () => ({ enforceAbuseLimit: mocks.limit }));
vi.mock("bcrypt", () => ({ default: { hash: mocks.hash } }));
vi.mock("@/app/libs/native-repositories", () => ({ getNativeRepositories: () => ({ users: { create: mocks.create, emailExists: mocks.findEmail } }) }));
vi.mock("@/app/libs/logger", () => ({
  logger: { error: vi.fn() },
}));

import { POST } from "./route";
import { ApiRequestError } from "@/app/libs/api-request";

function request(body: unknown) {
  return new Request("http://localhost/api/register", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/register", () => {
  it("enforces the shared quota before hashing or creating an account", async () => {
    mocks.limit.mockRejectedValueOnce(new ApiRequestError(429, "Wait", 60));
    const response = await POST(request({ name: "Driver", email: "driver@example.com", password: "a long password" }));
    expect(response.status).toBe(429); expect(response.headers.get("retry-after")).toBe("60");
    expect(mocks.hash).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
  });
  it("bounds the registration body before hashing", async () => {
    expect((await POST(request({ name: "x".repeat(8192) }))).status).toBe(413);
    expect(mocks.hash).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    vi.clearAllMocks(); mocks.limit.mockResolvedValue(undefined);
    mocks.findEmail.mockResolvedValue(null);
    mocks.hash.mockResolvedValue("bcrypt-secret");
    mocks.create.mockResolvedValue({
      id: "user-1",
      hashedPassword: "bcrypt-secret",
    });
  });

  it("never returns the stored password hash", async () => {
    const response = await POST(
      request({ name: "Driver", email: "driver@example.com", password: "a long password" })
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ id: "user-1" });
    expect(mocks.create).toHaveBeenCalledWith({ name: "Driver", email: "driver@example.com", hashedPassword: "bcrypt-secret" });
  });

  it.each(["driver@EXAMPLE.COM", "DRIVER@example.com", " Driver@Example.Com "])("rejects case-variant signup against a legacy account: %s", async (email) => {
    mocks.findEmail.mockResolvedValue({ id: "existing-user" });
    const response = await POST(request({ name: "Driver", email, password: "a long password" }));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "An account with this email already exists" });
    expect(mocks.hash).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("stores a new email in canonical form without changing its password", async () => {
    const response = await POST(request({ name: " Driver ", email: " New.Driver@Example.COM ", password: " long secret " }));
    expect(response.status).toBe(201);
    expect(mocks.hash).toHaveBeenCalledWith(" long secret ", 12);
    expect(mocks.create).toHaveBeenCalledWith({ name: "Driver", email: "new.driver@example.com", hashedPassword: "bcrypt-secret" });
  });

  it("keeps required registration fields", async () => {
    const response = await POST(
      request({ name: "", email: "driver@example.com", password: "a long password" })
    );

    expect(response.status).toBe(400);
    expect(mocks.hash).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it.each([
    ["a", "Use at least 12 characters."],
    ["a".repeat(11), "Use at least 12 characters."],
    ["a".repeat(73), "Use no more than 72 bytes. Some characters use more than one byte."],
    ["é".repeat(36) + "a", "Use no more than 72 bytes. Some characters use more than one byte."],
    ["😀".repeat(18) + "a", "Use no more than 72 bytes. Some characters use more than one byte."],
  ])("rejects a password outside the shared policy before hashing: %s", async (password, error) => {
    const response = await POST(request({ name: "Driver", email: "driver@example.com", password }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error });
    expect(mocks.limit).not.toHaveBeenCalled();
    expect(mocks.hash).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it.each(["a".repeat(12), "a".repeat(72), "é".repeat(36), "😀".repeat(18)])("hashes the exact password at policy boundaries: %s", async (password) => {
    const response = await POST(request({ name: "Driver", email: "driver@example.com", password }));
    expect(response.status).toBe(201);
    expect(mocks.hash).toHaveBeenCalledWith(password, 12);
  });

  it("does not allow public registration to grant an admin role", async () => {
    const response = await POST(request({ name: "Driver", email: "driver@example.com", password: "a long password", role: "ADMIN", isAdmin: true, emailVerified: "2026-01-01" }));
    expect(response.status).toBe(201);
    expect(mocks.create.mock.calls[0][0]).toEqual({ name: "Driver", email: "driver@example.com", hashedPassword: "bcrypt-secret" });
  });

  it.each([
    { name: {} }, { email: [] }, { password: 123 }, { name: "   " },
  ])("rejects invalid registration fields %j before hashing", async (change) => {
    const response = await POST(request({ name: "Driver", email: "driver@example.com", password: "a long password", ...change }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Name, email, and password are required" });
    expect(mocks.hash).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("reports duplicate registration as a conflict", async () => {
    mocks.create.mockRejectedValueOnce(new MongoServerError({ message: "Unique constraint", code: 11000 }));
    const response = await POST(request({ name: "Driver", email: "driver@example.com", password: "a long password" }));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "An account with this email already exists" });
  });

  it("rejects malformed email addresses before hashing or writing", async () => {
    const response = await POST(request({ name: "Driver", email: "not-an-email", password: "a long password" }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Please enter a valid email address" });
    expect(mocks.hash).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("normalizes registration details without changing the password", async () => {
    const response = await POST(request({ name: " Driver ", email: " driver@example.com ", password: " long secret " }));
    expect(response.status).toBe(201);
    expect(mocks.hash).toHaveBeenCalledWith(" long secret ", 12);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      name: "Driver", email: "driver@example.com", hashedPassword: "bcrypt-secret",
    }));
  });
});
