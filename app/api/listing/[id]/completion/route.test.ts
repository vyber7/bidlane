import { beforeEach, describe, expect, it, vi } from "vitest";
import { transactionCompletion } from "@/app/libs/transaction-completion";

const mocks = vi.hoisted(() => ({ user: vi.fn(), find: vi.fn(), confirm: vi.fn() }));
vi.mock("@/app/actions/getCurrentUser", () => ({ default: mocks.user }));
vi.mock("@/app/libs/native-repositories", () => ({ getNativeRepositories: () => ({ completion: { find: mocks.find, confirm: mocks.confirm } }) }));
vi.mock("@/app/libs/logger", () => ({ logger: { error: vi.fn() } }));
import { GET, PATCH } from "./route";

const id = "abcdef0123456789abcdef01";
const context = (listingId = id) => ({ params: Promise.resolve({ id: listingId }) });
const request = (body: unknown = { step: "payment", completed: true }) => new Request(`http://localhost/api/listing/${id}/completion`, {
  method: "PATCH", body: JSON.stringify(body), headers: { "Content-Type": "application/json" },
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ id: "buyer" });
  const result = { role: "buyer", completion: transactionCompletion({}) };
  mocks.find.mockResolvedValue(result);
  mocks.confirm.mockResolvedValue(result);
});

describe("private transaction completion API", () => {
  it.each([GET, PATCH])("requires authentication", async (handler) => {
    mocks.user.mockResolvedValue(null);
    expect((await handler(request(), context())).status).toBe(401);
    expect(mocks.find).not.toHaveBeenCalled();
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it.each([GET, PATCH])("rejects invalid listing identifiers", async (handler) => {
    expect((await handler(request(), context("invalid"))).status).toBe(400);
    expect(mocks.find).not.toHaveBeenCalled();
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it.each([
    { step: "other", completed: true }, { step: "payment", completed: "true" },
    { step: "payment" }, { step: "payment", completed: true, role: "seller" },
    { step: "payment", completed: true, userId: "seller" }, null,
  ])("rejects malformed or caller-supplied identity fields: %j", async (body) => {
    expect((await PATCH(request(body), context())).status).toBe(400);
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it("scopes reads to the signed-in participant and disables caching", async () => {
    const response = await GET(request(), context());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ role: "buyer", completion: transactionCompletion({}) });
    expect(mocks.find).toHaveBeenCalledWith(id, "buyer");
  });

  it.each([true, false])("uses the authenticated identity to set completed=%s", async (completed) => {
    expect((await PATCH(request({ step: "pickup", completed }), context())).status).toBe(200);
    expect(mocks.confirm).toHaveBeenCalledWith(id, "buyer", "pickup", completed, expect.any(Date));
  });

  it.each([GET, PATCH])("does not reveal nonexistent, unsold, or other users' transactions", async (handler) => {
    mocks.find.mockResolvedValue(null);
    mocks.confirm.mockResolvedValue(null);
    expect((await handler(request(), context())).status).toBe(404);
  });

  it("returns a recoverable error if persistence fails", async () => {
    mocks.confirm.mockRejectedValue(new Error("Database offline"));
    const response = await PATCH(request(), context());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Unable to load or update the checklist. Please try again." });
  });
});
