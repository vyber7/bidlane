import { beforeEach, describe, expect, it, vi } from "vitest";

// The comment command's rules and real-time updates are tested in
// app/libs/engagement-commands.test.ts. These cover parsing and HTTP mapping.
const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), postComment: vi.fn(), error: vi.fn() }));
vi.mock("@/app/actions/getCurrentUser", () => ({ default: mocks.getCurrentUser }));
vi.mock("@/app/libs/engagement-commands", () => ({ postComment: mocks.postComment }));
vi.mock("@/app/libs/logger", () => ({ logger: { error: mocks.error } }));

import { ApiRequestError } from "@/app/libs/api-request";
import { POST } from "./route";

const listingId = "abcdef0123456789abcdef01";
const publicComment = {
  id: "comment-1",
  body: "Great car",
  image: null,
  createdAt: "2026-09-10T12:00:00.000Z",
  listingId,
  user: { name: "Driver" },
};

function request(body: unknown) {
  return new Request("http://localhost/api/comments", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "user-1", email: "driver@example.com" });
  mocks.postComment.mockResolvedValue({ ok: true, comment: publicComment });
});

describe("POST /api/comments", () => {
  it("posts the trimmed comment as the signed-in user and returns the public comment", async () => {
    const response = await POST(request({ listingId, comment: " Great car " }));
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ comment: publicComment });
    expect(mocks.postComment).toHaveBeenCalledExactlyOnceWith({
      author: { id: "user-1", email: "driver@example.com" },
      listingId,
      body: "Great car",
      image: undefined,
    });
  });

  it("requires authentication before parsing", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    expect((await POST(request({ listingId, comment: "Great car" }))).status).toBe(401);
    expect(mocks.postComment).not.toHaveBeenCalled();
  });

  it.each([
    ["an invalid listing ID", { listingId: "bad", comment: "Great car" }],
    ["an oversized comment", { listingId, comment: "x".repeat(4001) }],
  ])("rejects %s before calling the command", async (_case, body) => {
    expect((await POST(request(body))).status).toBe(400);
    expect(mocks.postComment).not.toHaveBeenCalled();
  });

  it.each([
    ["not-found", 404, "Listing not found"],
    ["not-public", 409, "Comments open after the listing is approved."],
    ["busy", 503, "The listing is busy. Please try again."],
  ])("maps the %s rejection to %i", async (reason, status, error) => {
    mocks.postComment.mockResolvedValue({ ok: false, reason });
    const response = await POST(request({ listingId, comment: "Hello" }));
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ error });
  });

  it("passes through request errors such as the comment quota", async () => {
    mocks.postComment.mockRejectedValue(new ApiRequestError(429, "Wait", 23));
    const response = await POST(request({ listingId, comment: "Hello" }));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("23");
  });

  it("keeps unexpected failures private", async () => {
    mocks.postComment.mockRejectedValue(new Error("private database details"));
    const response = await POST(request({ listingId, comment: "Hello" }));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Internal Server Error" });
    expect(mocks.error).toHaveBeenCalledWith("comment.create_failed", expect.any(Error));
  });
});
