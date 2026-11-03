import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), find: vi.fn() }));
vi.mock("@/app/actions/getCurrentUser", () => ({ default: mocks.user }));
vi.mock("@/app/actions/getSoldAuctions", () => ({ default: async () => [] }));
vi.mock("@/app/libs/prismadb", () => ({ default: { listingDraft: { findFirst: mocks.find } } }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); }, notFound: () => { throw new Error("not-found"); } }));
import SubmitVehicle from "./page";
import { emptyDraftPayload } from "@/app/schemas/listing-draft";
const id = "abcdef0123456789abcdef01";
const page = (draft?: string) => SubmitVehicle({ searchParams: Promise.resolve({ draft }) });
beforeEach(() => { vi.clearAllMocks(); mocks.user.mockResolvedValue({ id: "seller", emailVerified: true }); mocks.find.mockResolvedValue({ id, revision: 1, payload: emptyDraftPayload, updatedAt: new Date(), publishedListingId: null }); });
describe("resuming drafts", () => {
  it("requires authentication independently of the proxy", async () => { mocks.user.mockResolvedValue(null); await expect(page(id)).rejects.toThrow("redirect:/signin"); expect(mocks.find).not.toHaveBeenCalled(); });
  it("only loads the signed-in seller’s undeleted draft", async () => { expect(await page(id)).toBeDefined(); expect(mocks.find).toHaveBeenCalledWith({ where: { id, userId: "seller", deletedAt: null } }); });
  it("does not expose missing, deleted, or other-owner drafts", async () => { mocks.find.mockResolvedValue(null); await expect(page(id)).rejects.toThrow("not-found"); });
  it("rejects malformed IDs before a database lookup", async () => { await expect(page("bad")).rejects.toThrow("not-found"); expect(mocks.find).not.toHaveBeenCalled(); });
  it("sends old published draft links to the existing listing", async () => { mocks.find.mockResolvedValue({ publishedListingId: "listing" }); await expect(page(id)).rejects.toThrow("redirect:/listing/listing"); });
});
