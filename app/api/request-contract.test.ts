import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ currentUser: vi.fn(), database: vi.fn(), hash: vi.fn(), finalize: vi.fn() }));
vi.mock("@/app/actions/getCurrentUser", () => ({ default: mocks.currentUser }));
vi.mock("@/app/libs/prismadb", () => ({
  default: {
    user: { create: mocks.database, update: mocks.database },
    listing: { findUnique: mocks.database, update: mocks.database, updateMany: mocks.database, create: mocks.database },
    comment: { create: mocks.database },
    $transaction: mocks.database,
  },
}));
vi.mock("@/app/libs/pusher", () => ({ pusherServer: { trigger: vi.fn() } }));
vi.mock("@/app/libs/auction-finalization", () => ({ finalizeAuction: mocks.finalize }));
vi.mock("@/app/libs/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
vi.mock("bcrypt", () => ({ default: { hash: mocks.hash } }));

import { POST as bid } from "./place-bid/route";
import { POST as start } from "./auction-start/route";
import { POST as end } from "./auction-end/route";
import { POST as finalize } from "./auction-finalize/route";
import { POST as comments } from "./comments/route";
import { POST as watchlist } from "./update-watchlist/route";
import { POST as listing } from "./new-listing/route";
import { POST as register } from "./register/route";
import { PATCH as profile } from "./account/profile/route";
import { POST as views } from "./listing-view/route";
import { POST as images } from "./cloudinary-images/route";
import { POST as cover } from "./listing/[id]/cover-image/route";
import { POST as upload } from "./upload-image/route";
import { POST as addImages } from "./add-images/route";

const endpoints: { name: string; handler: (request: Request) => Promise<Response>; authenticated?: boolean }[] = [
  { name: "bidding", handler: bid, authenticated: true },
  { name: "auction start", handler: start, authenticated: true },
  { name: "auction end", handler: end, authenticated: true },
  { name: "auction finalization", handler: finalize },
  { name: "comments", handler: comments, authenticated: true },
  { name: "watchlists", handler: watchlist, authenticated: true },
  { name: "listing submission", handler: listing, authenticated: true },
  { name: "registration", handler: register },
  { name: "profiles", handler: profile, authenticated: true },
  { name: "listing views", handler: views },
  { name: "gallery images", handler: images, authenticated: true },
  { name: "cover images", handler: (request) => cover(request, { params: Promise.resolve({ id: "abcdef0123456789abcdef01" }) }), authenticated: true },
  { name: "upload placeholder", handler: upload },
  { name: "image placeholder", handler: addImages },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.currentUser.mockResolvedValue({ id: "user", email: "user@example.com" });
});

describe.each(endpoints)("$name request errors", ({ handler, authenticated }) => {
  it.each(["{", "null", "[]", '"text"'])("rejects body %s with JSON and no database work", async (body) => {
    const response = await handler(new Request("http://localhost/api", { method: "POST", body }));
    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({ error: body === "{" ? "Invalid JSON body" : "Invalid request body" });
    expect(mocks.database).not.toHaveBeenCalled();
    expect(mocks.hash).not.toHaveBeenCalled();
    expect(mocks.finalize).not.toHaveBeenCalled();
  });

  if (authenticated) {
    it("checks authentication before parsing a body", async () => {
      mocks.currentUser.mockResolvedValue(null);
      const response = await handler(new Request("http://localhost/api", { method: "POST", body: "{" }));
      expect(response.status).toBe(401);
      const payload: unknown = await response.json();
      expect(payload).toEqual({ error: expect.any(String) });
      expect(mocks.database).not.toHaveBeenCalled();
    });
  }
});
