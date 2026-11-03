import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ findUser: vi.fn(), count: vi.fn(), listings: vi.fn() }));
vi.mock("./prismadb", () => ({ default: { user: { findUnique: mocks.findUser }, listing: { count: mocks.count, findMany: mocks.listings } } }));
import { getSellerProfile } from "./seller-profile";
beforeEach(() => {
  vi.clearAllMocks(); mocks.findUser.mockResolvedValue({ id: "seller", name: "Seller", image: null, createdAt: new Date(), emailVerified: new Date() });
  mocks.count.mockResolvedValue(20); mocks.listings.mockResolvedValue([]);
});
describe("public seller profile", () => {
  it("selects only public account fields and exposes verification as a boolean", async () => {
    const profile = await getSellerProfile("seller");
    expect(mocks.findUser.mock.calls[0][0].select).toEqual({ id: true, name: true, image: true, createdAt: true, emailVerified: true });
    expect(profile?.seller.emailVerified).toBe(true);
    expect(profile?.seller).not.toHaveProperty("email"); expect(profile?.seller).not.toHaveProperty("hashedPassword");
    expect(profile?.salesCount).toBe(20);
  });
  it("counts only sold auction outcomes and paginates result history", async () => {
    await getSellerProfile("seller", 2);
    expect(mocks.count).toHaveBeenCalledWith({ where: { userId: "seller", status: "ENDED", result: "SOLD" } });
    expect(mocks.listings.mock.calls[1][0]).toMatchObject({ where: { userId: "seller", status: "ENDED", result: "SOLD" }, skip: 12, take: 12 });
    expect(mocks.listings.mock.calls[1][0].select).not.toHaveProperty("reservePrice");
  });
  it("does not query listings for a missing user", async () => { mocks.findUser.mockResolvedValue(null); expect(await getSellerProfile("missing")).toBeNull(); expect(mocks.listings).not.toHaveBeenCalled(); });
  it("shows unverified legacy accounts accurately", async () => { mocks.findUser.mockResolvedValue({ id: "seller", name: "Seller", createdAt: new Date(), emailVerified: null }); expect((await getSellerProfile("seller"))?.seller.emailVerified).toBe(false); });
});
