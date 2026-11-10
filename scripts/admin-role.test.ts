import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { changeAdminRole } from "./admin-role.mjs";

const update = vi.fn();
const database = { collection: vi.fn(() => ({ findOneAndUpdate: update })) };
const id = new ObjectId();

beforeEach(() => vi.clearAllMocks());

describe("trusted admin role command", () => {
  it.each([["grant", "ADMIN"], ["revoke", "USER"]])("%s changes only the role of the exact existing account", async (action, role) => {
    update.mockResolvedValue({ _id: id, email: "Driver@example.com", role });
    await expect(changeAdminRole([action, " Driver@example.com "], database)).resolves.toEqual({ id: id.toHexString(), email: "Driver@example.com", role });
    expect(update).toHaveBeenCalledWith({
      email: "Driver@example.com",
    }, { $set: { role, updatedAt: expect.any(Date) } }, { returnDocument: "after", projection: { _id: 1, email: 1, role: 1 } });
  });

  it.each([[], ["grant"], ["grant", " "], ["delete", "driver@example.com"], ["grant", "driver@example.com", "extra"]])("rejects invalid arguments %j before writing", async (...args) => {
    await expect(changeAdminRole(args, database)).rejects.toThrow("Usage:");
    expect(update).not.toHaveBeenCalled();
  });

  it("does not create an account if the email is missing", async () => {
    update.mockResolvedValue(null);
    await expect(changeAdminRole(["grant", "missing@example.com"], database)).rejects.toThrow("Account not found.");
  });

  it("propagates database failures instead of reporting success", async () => {
    update.mockRejectedValue(new Error("unavailable"));
    await expect(changeAdminRole(["revoke", "driver@example.com"], database)).rejects.toThrow("unavailable");
  });
});
