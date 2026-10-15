import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ user: vi.fn(), update: vi.fn(), logError: vi.fn() }));
vi.mock("@/app/actions/getCurrentUser", () => ({ default: mocks.user }));
vi.mock("@/app/libs/prismadb", () => ({ default: { user: { update: mocks.update } } }));
vi.mock("@/app/libs/logger", () => ({ logger: { error: mocks.logError } }));
import { PATCH } from "./route";

function request(body: unknown) {
  return new Request("http://localhost/api/account/profile", { method: "PATCH", body: JSON.stringify(body) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ id: "user-1" });
  mocks.update.mockResolvedValue({ name: "Driver", email: "driver@example.com", image: null });
});

describe("profile request validation", () => {
  it("preserves profile updates and the public success response", async () => {
    const response = await PATCH(request({ name: " Driver ", image: "" }));
    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "user-1" }, data: { name: "Driver", image: null },
      select: { name: true, email: true, image: true },
    });
    await expect(response.json()).resolves.toEqual({ name: "Driver", email: "driver@example.com", image: null });
  });

  it.each([
    [{ name: "x", image: "" }, "Name must be between 2 and 60 characters"],
    [{ name: 123, image: "" }, "Name must be between 2 and 60 characters"],
    [{ name: "Driver", image: {} }, "Invalid image"],
    [{ name: "Driver", image: "http://example.com/image.jpg" }, "Invalid image URL"],
    [{ name: "Driver", image: "not-a-url" }, "Invalid image URL"],
  ])("rejects invalid profile %j without updating the user", async (body, error) => {
    const response = await PATCH(request(body));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("logs private failure details and returns a generic server error", async () => {
    const error = new Error("private database details");
    mocks.update.mockRejectedValueOnce(error);
    const response = await PATCH(request({ name: "Driver", image: "" }));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Unable to update profile" });
    expect(mocks.logError).toHaveBeenCalledWith("account.profile_update_failed", error, { userId: "user-1" });
  });
});
