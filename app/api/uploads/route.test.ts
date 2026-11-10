import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), listing: vi.fn(), quota: vi.fn(), save: vi.fn() }));
vi.mock("@/app/actions/getCurrentUser", () => ({ default: mocks.user }));
vi.mock("@/app/libs/native-repositories", () => ({ getNativeRepositories: () => ({ listingAuthoring: { find: mocks.listing } }) }));
vi.mock("@/app/libs/upload-rate-limit", () => ({ uploadRetryAfter: mocks.quota }));
vi.mock("@/app/libs/server-upload", () => ({ saveUploadedFile: mocks.save }));
vi.mock("@/app/libs/logger", () => ({ logger: { warn: vi.fn() } }));
import { GET, POST } from "./route";
import { MAX_UPLOAD_BODY_BYTES, MAX_UPLOAD_BYTES } from "@/app/libs/upload-policy";
const listingId = "abcdef0123456789abcdef01";
function request(size = 10, fields: Record<string, string | undefined> = { kind: "PHOTO" }) {
  const form = new FormData(); form.set("file", new File([new Uint8Array(size)], "photo.jpg"));
  for (const [key, value] of Object.entries(fields)) if (value !== undefined) form.set(key, value);
  return new Request("http://localhost/api/uploads", { method: "POST", body: form });
}
beforeEach(() => { vi.clearAllMocks(); mocks.user.mockResolvedValue({ id: "seller" }); mocks.quota.mockResolvedValue(0); mocks.save.mockResolvedValue("https://example.test/registered.jpg"); mocks.listing.mockResolvedValue({ userId: "seller", status: "UPCOMING" }); });
describe("authenticated bounded uploader", () => {
  it("exposes the credential-free cutover policy", async () => {
    const response = await GET(); expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ policy: "authenticated-4mb-v1", maxBytes: 4_000_000 });
  });
  it("requires sign-in before parsing or consuming a quota", async () => {
    mocks.user.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(401); expect(mocks.quota).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
  });
  it("accepts exactly 4 MB and binds the server-authenticated account", async () => {
    const response = await POST(request(MAX_UPLOAD_BYTES));
    expect(response.status).toBe(201); await expect(response.json()).resolves.toEqual({ url: "https://example.test/registered.jpg" });
    expect(mocks.save).toHaveBeenCalledWith({ userId: "seller", kind: "PHOTO", file: expect.any(File), listingId: undefined });
    expect(mocks.save.mock.calls[0][0].file.size).toBe(MAX_UPLOAD_BYTES);
  });
  it("rejects a file one byte above the cap before storage", async () => {
    expect((await POST(request(MAX_UPLOAD_BYTES + 1))).status).toBe(413); expect(mocks.save).not.toHaveBeenCalled();
  });
  it("bounds streaming bodies even with a false Content-Length", async () => {
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(MAX_UPLOAD_BODY_BYTES + 1)); controller.close(); } });
    const req = new Request("http://localhost/api/uploads", { method: "POST", body: stream, duplex: "half", headers: { "content-type": "multipart/form-data; boundary=test", "content-length": "1" } } as RequestInit);
    expect((await POST(req)).status).toBe(413); expect(mocks.save).not.toHaveBeenCalled();
  });
  it.each([{ kind: "PHOTO", public_id: "attacker" }, { kind: "PHOTO", source: "https://internal.test" }, { kind: "PHOTO", userId: "victim" }, { kind: "RAW" }, { kind: "PROFILE", listingId }])("rejects upload parameter injection %j", async (fields) => {
    expect((await POST(request(10, fields))).status).toBe(400); expect(mocks.save).not.toHaveBeenCalled();
  });
  it("rejects duplicate files and kind fields", async () => {
    for (const field of ["file", "kind"]) {
      const form = new FormData(); form.set("file", new File(["ok"], "photo.jpg")); form.set("kind", "PHOTO");
      form.append(field, "extra");
      expect((await POST(new Request("http://localhost", { method: "POST", body: form }))).status).toBe(400);
    }
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("enforces quotas and fails closed when quota storage is unavailable", async () => {
    mocks.quota.mockResolvedValueOnce(100);
    const response = await POST(request()); expect(response.status).toBe(429); expect(response.headers.get("retry-after")).toBe("100");
    mocks.quota.mockRejectedValueOnce(new Error("DB unavailable"));
    expect((await POST(request())).status).toBe(503); expect(mocks.save).not.toHaveBeenCalled();
  });
  it.each([null, { userId: "other", status: "UPCOMING" }, { userId: "seller", status: "LIVE" }])("rejects unavailable or foreign listing context %j", async (listing) => {
    mocks.listing.mockResolvedValue(listing);
    expect((await POST(request(10, { kind: "RECORD", listingId }))).status).toBe(listing?.userId === "seller" ? 409 : 404); expect(mocks.save).not.toHaveBeenCalled();
  });
  it("permits an owned upcoming listing context", async () => {
    expect((await POST(request(10, { kind: "RECORD", listingId }))).status).toBe(201);
    expect(mocks.save.mock.calls[0][0]).toMatchObject({ userId: "seller", listingId, kind: "RECORD" });
  });
});
