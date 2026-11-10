import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ decode: vi.fn(), user: vi.fn() }));
vi.mock("next-auth/jwt", () => ({ decode: mocks.decode }));
vi.mock("./native-repositories", () => ({ getNativeRepositories: () => ({ users: { sessionIdentity: mocks.user } }) }));
vi.mock("./logger", () => ({ logger: { warn: vi.fn() } }));
import { decodeSessionToken } from "./session-token";
beforeEach(() => { vi.clearAllMocks(); mocks.decode.mockResolvedValue({ sub: "user", email: "user@example.com" }); mocks.user.mockResolvedValue({ email: "user@example.com", sessionVersion: null }); });
describe("reset-aware sessions", () => {
  it("accepts existing legacy sessions until the first reset", async () => { expect(await decodeSessionToken({ secret: "secret" })).toMatchObject({ sub: "user" }); });
  it("rejects all old versions after reset", async () => { mocks.user.mockResolvedValue({ email: "user@example.com", sessionVersion: "new" }); expect(await decodeSessionToken({ secret: "secret" })).toBeNull(); });
  it("accepts a fresh login after reset", async () => { mocks.decode.mockResolvedValue({ sub: "user", email: "user@example.com", sessionVersion: "new" }); mocks.user.mockResolvedValue({ email: "user@example.com", sessionVersion: "new" }); expect(await decodeSessionToken({ secret: "secret" })).toMatchObject({ sub: "user" }); });
  it.each([null, { email: "changed@example.com", sessionVersion: null }])("rejects deleted or changed accounts", async (user) => { mocks.user.mockResolvedValue(user); expect(await decodeSessionToken({ secret: "secret" })).toBeNull(); });
  it("fails closed when session decoding or the database fails", async () => { mocks.user.mockRejectedValueOnce(new Error("offline")); expect(await decodeSessionToken({ secret: "secret" })).toBeNull(); mocks.decode.mockRejectedValueOnce(new Error("bad token")); expect(await decodeSessionToken({ secret: "secret" })).toBeNull(); });
});
