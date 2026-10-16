import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), update: vi.fn() }));
vi.mock("@/app/actions/getCurrentUser", () => ({ default: mocks.user }));
vi.mock("@/app/libs/prismadb", () => ({ default: { user: { update: mocks.update } } }));
vi.mock("@/app/libs/logger", () => ({ logger: { error: vi.fn() } }));
import { PATCH } from "./route";
const patch = (body: unknown) => PATCH(new Request("http://localhost/api/account/notification-preferences", { method: "PATCH", body: JSON.stringify(body) }));
beforeEach(() => { vi.clearAllMocks(); mocks.user.mockResolvedValue({ id: "buyer" }); mocks.update.mockResolvedValue({ outbidEmailsEnabled: false }); });
describe("email preferences", () => {
  it("requires a session", async () => { mocks.user.mockResolvedValue(null); expect((await patch({ outbidEmailsEnabled: false })).status).toBe(401); expect(mocks.update).not.toHaveBeenCalled(); });
  it("only updates the signed-in account and returns the saved preference", async () => {
    await expect((await patch({ outbidEmailsEnabled: false, userId: "someone-else" })).json()).resolves.toEqual({ outbidEmailsEnabled: false });
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith({ where: { id: "buyer" }, data: { outbidEmailsEnabled: false }, select: { outbidEmailsEnabled: true } });
  });
  it.each([{}, { outbidEmailsEnabled: "false" }, { outbidEmailsEnabled: null }, []])("rejects invalid settings %j", async (body) => { expect((await patch(body)).status).toBe(400); expect(mocks.update).not.toHaveBeenCalled(); });
  it("reports persistence failures", async () => { mocks.update.mockRejectedValueOnce(new Error("offline")); expect((await patch({ outbidEmailsEnabled: true })).status).toBe(500); });
});
