import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ upload: vi.fn(), destroy: vi.fn(), register: vi.fn(), warn: vi.fn() }));
vi.mock("./cloudinary", () => ({ default: { uploader: mocks } }));
vi.mock("./native-repositories", () => ({ getNativeRepositories: () => ({ assets: { register: mocks.register } }) }));
vi.mock("./logger", () => ({ logger: { warn: mocks.warn } }));
import { saveUploadedFile } from "./server-upload";
import { MAX_UPLOAD_BYTES } from "./upload-policy";
const input = { userId: "seller", kind: "PHOTO" as const, file: new File(["image bytes"], "image.jpg") };
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME", "demo"); vi.stubEnv("NEXT_PUBLIC_CLOUDINARY_API_KEY", "key"); vi.stubEnv("CLOUDINARY_API_SECRET", "secret");
  mocks.upload.mockImplementation(async (_, options) => ({ public_id: options.public_id, version: 1, format: "jpg", bytes: 11, resource_type: "image", type: "upload", secure_url: `https://res.cloudinary.com/demo/image/upload/v1/${options.public_id}.jpg` }));
  mocks.register.mockResolvedValue({}); mocks.destroy.mockResolvedValue({ result: "ok" });
});
afterEach(() => vi.unstubAllEnvs());
describe("trusted server upload", () => {
  it("signs server-chosen bytes/options and persists the canonical owner-bound result", async () => {
    const url = await saveUploadedFile({ ...input, listingId: "listing" });
    const [data, options] = mocks.upload.mock.calls[0];
    expect(data).toBe(`data:application/octet-stream;base64,${Buffer.from("image bytes").toString("base64")}`);
    expect(options).toMatchObject({ resource_type: "image", type: "upload", overwrite: false, allowed_formats: ["jpg", "png", "webp"] });
    expect(options).not.toHaveProperty("upload_preset");
    expect(options.public_id).toMatch(/^bidlane\/seller\/photo\/[a-f0-9-]{36}$/);
    expect(mocks.register).toHaveBeenCalledWith({ id: options.public_id, userId: "seller", kind: "PHOTO", listingId: "listing", url, bytes: 11, format: "jpg" });
  });
  it("permits PDF only for vehicle records", async () => {
    await saveUploadedFile({ ...input, kind: "RECORD" });
    expect(mocks.upload.mock.calls[0][1].allowed_formats).toEqual(["jpg", "png", "webp", "pdf"]);
    await saveUploadedFile({ ...input, kind: "PROFILE" });
    expect(mocks.upload.mock.calls[1][1].allowed_formats).not.toContain("pdf");
  });
  it.each([0, MAX_UPLOAD_BYTES + 1])("rejects %s bytes before contacting Cloudinary", async (size) => {
    await expect(saveUploadedFile({ ...input, file: new File([new Uint8Array(size)], "image.jpg") })).rejects.toMatchObject({ status: 413 });
    expect(mocks.upload).not.toHaveBeenCalled(); expect(mocks.register).not.toHaveBeenCalled();
  });
  it.each([{ bytes: MAX_UPLOAD_BYTES + 1 }, { format: "svg" }, { resource_type: "raw" }, { secure_url: "https://evil.test/image.jpg" }, { public_id: "other" }])("rejects unexpected provider metadata and cleans up: %j", async (change) => {
    const upload = mocks.upload.getMockImplementation()!;
    mocks.upload.mockImplementation(async (...args) => ({ ...await upload(...args), ...change }));
    await expect(saveUploadedFile(input)).rejects.toMatchObject({ status: 400 });
    expect(mocks.register).not.toHaveBeenCalled(); expect(mocks.destroy).toHaveBeenCalled();
  });
  it("does not return an unregistered URL on DB failure", async () => {
    mocks.register.mockRejectedValueOnce(new Error("secret database details"));
    await expect(saveUploadedFile(input)).rejects.toMatchObject({ status: 503 });
    expect(mocks.destroy).toHaveBeenCalledWith(expect.stringMatching(/^bidlane\/seller\/photo\//), { resource_type: "image", type: "upload", invalidate: true });
    expect(JSON.stringify(mocks.warn.mock.calls)).not.toContain("secret database");
  });
  it("cleans up an uncertain provider timeout without leaking private provider errors", async () => {
    mocks.upload.mockRejectedValueOnce({ http_code: 500, message: "secret provider details" });
    await expect(saveUploadedFile(input)).rejects.toMatchObject({ status: 503 });
    expect(mocks.destroy).toHaveBeenCalled(); expect(mocks.register).not.toHaveBeenCalled();
  });
  it("returns a safe validation error when Cloudinary rejects the decoded format", async () => {
    mocks.upload.mockRejectedValueOnce({ http_code: 400, message: "private" });
    await expect(saveUploadedFile(input)).rejects.toMatchObject({ status: 400, message: "Choose a valid JPG, PNG, or WebP photo." });
  });
});
