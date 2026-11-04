import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ overview: vi.fn(), redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("@/app/libs/admin", () => ({ getAdminOverview: mocks.overview }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, notFound: mocks.notFound }));
import AdminPage from "./page";
import { ApiRequestError } from "@/app/libs/api-request";
import { renderToStaticMarkup } from "react-dom/server";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.redirect.mockImplementation(() => { throw new Error("redirect"); });
  mocks.notFound.mockImplementation(() => { throw new Error("not-found"); });
});

describe("admin page access", () => {
  it("renders the overview after authorization", async () => {
    mocks.overview.mockResolvedValue({ admin: { email: "admin@example.com" }, users: 1234, listings: 5, liveAuctions: 2 });
    const html = renderToStaticMarkup(await AdminPage());
    expect(html).toContain("Administration");
    expect(html).toContain("admin@example.com");
    expect(html).toContain("1,234");
  });

  it("sends anonymous visitors to sign-in", async () => {
    mocks.overview.mockRejectedValue(new ApiRequestError(401, "sign in"));
    await expect(AdminPage()).rejects.toThrow("redirect");
    expect(mocks.redirect).toHaveBeenCalledWith("/signin?callbackUrl=%2Fadmin");
  });

  it("does not render the dashboard for a regular account", async () => {
    mocks.overview.mockRejectedValue(new ApiRequestError(403, "forbidden"));
    await expect(AdminPage()).rejects.toThrow("not-found");
    expect(mocks.notFound).toHaveBeenCalled();
  });

  it("does not disguise database errors as access denials", async () => {
    mocks.overview.mockRejectedValue(new Error("database unavailable"));
    await expect(AdminPage()).rejects.toThrow("database unavailable");
    expect(mocks.notFound).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
