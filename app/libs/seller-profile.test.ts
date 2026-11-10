import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ findUser: vi.fn(), count: vi.fn(), active: vi.fn(), sales: vi.fn() }));
vi.mock("./read-repositories", () => ({ getReadRepositories: () => ({ sellers: { find: mocks.findUser, salesCount: mocks.count, active: mocks.active, sales: mocks.sales } }) }));
import { getSellerProfile } from "./seller-profile";
beforeEach(() => {
  vi.clearAllMocks(); mocks.findUser.mockResolvedValue({ id: "seller", name: "Seller", image: null, createdAt: new Date(), emailVerified: true });
  mocks.count.mockResolvedValue(20); mocks.active.mockResolvedValue([]); mocks.sales.mockResolvedValue([]);
});
describe("public seller profile", () => {
  it("excludes unapproved upcoming listings from the public seller inventory", async () => {
    await getSellerProfile("seller");
    expect(mocks.active).toHaveBeenCalledWith("seller");
  });

  it("selects only public account fields and exposes verification as a boolean", async () => {
    const profile = await getSellerProfile("seller");
    expect(mocks.findUser).toHaveBeenCalledWith("seller");
    expect(profile?.seller.emailVerified).toBe(true);
    expect(profile?.seller).not.toHaveProperty("email"); expect(profile?.seller).not.toHaveProperty("hashedPassword");
    expect(profile?.salesCount).toBe(20);
  });
  it("counts only sold auction outcomes and paginates result history", async () => {
    await getSellerProfile("seller", 2);
    expect(mocks.count).toHaveBeenCalledWith("seller");
    expect(mocks.sales).toHaveBeenCalledWith("seller", 2);
  });
  it("does not query listings for a missing user", async () => { mocks.findUser.mockResolvedValue(null); expect(await getSellerProfile("missing")).toBeNull(); expect(mocks.active).not.toHaveBeenCalled(); expect(mocks.sales).not.toHaveBeenCalled(); });
  it("shows unverified legacy accounts accurately", async () => { mocks.findUser.mockResolvedValue({ id: "seller", name: "Seller", createdAt: new Date(), emailVerified: false }); expect((await getSellerProfile("seller"))?.seller.emailVerified).toBe(false); });
});
