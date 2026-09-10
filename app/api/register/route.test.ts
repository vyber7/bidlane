import { beforeEach, describe, expect, it, vi } from "vitest";

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
});
