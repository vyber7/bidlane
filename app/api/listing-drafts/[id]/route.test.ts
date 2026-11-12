import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), find: vi.fn() }));
vi.mock("@/app/libs/native-repositories", () => ({ getNativeRepositories: () => ({ drafts: { owned: mocks.find } }) }));
vi.mock("@/app/actions/getCurrentUser", () => ({ default: mocks.user }));
vi.mock("@/app/libs/listing-drafts", () => ({ createListingDraft: mocks.create, updateListingDraft: mocks.update, deleteListingDraft: mocks.remove, serializeDraft: (value: unknown) => value }));
vi.mock("@/app/libs/logger", () => ({ logger: { warn: vi.fn() } }));
import { POST } from "../route";
import { GET, PATCH, DELETE } from "./route";
import { emptyDraftPayload } from "@/app/schemas/listing-draft";
const id = "abcdef0123456789abcdef01";
const context = { params: Promise.resolve({ id }) };
const input = { id, saveKey: "78f24991-f096-4e39-9a61-0eb03d28f1b6", revision: 1, payload: emptyDraftPayload };
const request = (body: unknown = input) => new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); mocks.user.mockResolvedValue({ id: "seller" }); mocks.create.mockResolvedValue({ id, revision: 1 }); mocks.update.mockResolvedValue({ id, revision: 2 }); mocks.find.mockResolvedValue({ id }); });
describe("private draft APIs", () => {
  it.each([POST, (request: Request) => GET(request, context), (request: Request) => PATCH(request, context), (request: Request) => DELETE(request, context)])("requires authentication before any draft work", async (handler) => {
    mocks.user.mockResolvedValue(null);
    expect((await handler(request())).status).toBe(401);
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.find).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("uses the session owner and discards forged ownership fields", async () => {
    expect((await POST(request({ ...input, userId: "other" }))).status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith("seller", { id, saveKey: input.saveKey, payload: emptyDraftPayload });
  });
  it("reads only the owner’s draft and prevents caching", async () => {
    const response = await GET(request(), context);
    expect(response.headers.get("cache-control")).toBe("no-store"); expect(mocks.find).toHaveBeenCalledWith(id, "seller");
    mocks.find.mockResolvedValue(null); expect((await GET(request(), context)).status).toBe(404);
  });
  it("accepts partial fields and incomplete record labels in a draft", async () => {
    const response = await POST(request({ ...input, payload: { ...emptyDraftPayload, details: { year: "bad input" }, vehicleRecords: [{ label: "", url: "https://res.cloudinary.com/demo/image/upload/receipt.pdf" }] } }));
    expect(response.status).toBe(201);
  });
  it.each([{ payload: null }, { payload: { ...emptyDraftPayload, images: ["javascript:alert(1)"] } }, { payload: { ...emptyDraftPayload, images: Array(21).fill("https://res.cloudinary.com/demo/image/upload/photo.jpg") } }, { payload: { ...emptyDraftPayload, details: { description: "a".repeat(10001) } } }, { payload: { ...emptyDraftPayload, photoChecklist: ["verified"] } }, { saveKey: "bad" }])("bounds storage and rejects unsafe content", async (change) => {
    expect((await POST(request({ ...input, ...change }))).status).toBe(400); expect(mocks.create).not.toHaveBeenCalled();
  });
  it("passes revision guards on updates and deletion", async () => {
    expect((await PATCH(request(), context)).status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith("seller", id, { revision: 1, saveKey: input.saveKey, payload: emptyDraftPayload });
    expect((await DELETE(request({ revision: 1 }), context)).status).toBe(200);
    expect(mocks.remove).toHaveBeenCalledWith("seller", id, 1);
  });
});
