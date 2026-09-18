import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), create: vi.fn() }));
vi.mock("@/app/actions/getCurrentUser", () => ({ default: mocks.user }));
vi.mock("@/app/libs/prismadb", () => ({ default: { listing: { create: mocks.create } } }));
import { POST } from "./route";
const photo = "https://res.cloudinary.com/demo/image/upload/car.jpg";
const data = { make: " Porsche ", model: "911", year: "2020", miles: "0", reservePrice: "", location: "Miami, FL", description: "Serviced regularly", images: [photo] };
const request = (data: unknown) => new Request("http://localhost/api/new-listing", { method: "POST", body: JSON.stringify({ data }) });
describe("listing submission", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.user.mockResolvedValue({ id: "seller" }); mocks.create.mockResolvedValue({ id: "listing" }); });
  it("requires sign-in before saving", async () => {
    mocks.user.mockResolvedValue(null);
    expect((await POST(request(data))).status).toBe(401);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("saves selected photos and cover with zero miles and no reserve", async () => {
    expect((await POST(request(data))).status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith({ data: expect.objectContaining({ make: "Porsche", miles: 0, reservePrice: null, images: [photo], coverImage: photo, user: { connect: { id: "seller" } } }) });
  });
  it("preserves photo order and selected cover", async () => {
    const second = photo.replace("car.jpg", "interior.jpg");
    await POST(request({ ...data, images: [second, photo], reservePrice: "5000" }));
    expect(mocks.create).toHaveBeenCalledWith({ data: expect.objectContaining({ images: [second, photo], coverImage: second, reservePrice: 5000 }) });
  });
  it.each([{ images: [] }, { images: Array(11).fill(photo) }, { images: ["javascript:alert(1)"] }, { make: " " }, { year: "" }, { miles: -1 }, { miles: "1.5" }, { reservePrice: -5 }, { miles: 2147483648 }])("rejects invalid listing %j", async (change) => {
    expect((await POST(request({ ...data, ...change }))).status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("rejects malformed data", async () => {
    expect((await POST(request(null))).status).toBe(400);
    expect((await POST(new Request("http://localhost", { method: "POST", body: "{" }))).status).toBe(400);
  });
  it("reports save failures", async () => {
    mocks.create.mockRejectedValue(new Error("database unavailable"));
    expect((await POST(request(data))).status).toBe(500);
  });
});
