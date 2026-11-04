import { beforeEach, describe, expect, it, vi } from "vitest";
import { changeAdminRole } from "./admin-role.mjs";

const prisma = { user: { update: vi.fn() } };

beforeEach(() => vi.clearAllMocks());

describe("trusted admin role command", () => {
  it.each([["grant", "ADMIN"], ["revoke", "USER"]])("%s changes only the role of the exact existing account", async (action, role) => {
    prisma.user.update.mockResolvedValue({ id: "user-1", email: "Driver@example.com", role });
    await expect(changeAdminRole([action, " Driver@example.com "], prisma)).resolves.toEqual({ id: "user-1", email: "Driver@example.com", role });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { email: "Driver@example.com" }, data: { role }, select: { id: true, email: true, role: true },
    });
  });

  it.each([[], ["grant"], ["grant", " "], ["delete", "driver@example.com"], ["grant", "driver@example.com", "extra"]])("rejects invalid arguments %j before writing", async (...args) => {
    await expect(changeAdminRole(args, prisma)).rejects.toThrow("Usage:");
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("does not create an account if the email is missing", async () => {
    prisma.user.update.mockRejectedValue({ code: "P2025" });
    await expect(changeAdminRole(["grant", "missing@example.com"], prisma)).rejects.toThrow("Account not found.");
  });

  it("propagates database failures instead of reporting success", async () => {
    prisma.user.update.mockRejectedValue(new Error("unavailable"));
    await expect(changeAdminRole(["revoke", "driver@example.com"], prisma)).rejects.toThrow("unavailable");
  });
});
