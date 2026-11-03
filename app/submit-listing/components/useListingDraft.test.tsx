// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ post: vi.fn(), patch: vi.fn() }));
vi.mock("axios", async (importOriginal) => { const actual = await importOriginal<typeof import("axios")>(); return { ...actual, default: { ...actual.default, post: mocks.post, patch: mocks.patch } }; });
import useListingDraft from "./useListingDraft";
import { emptyDraftPayload, type DraftPayload, type ListingDraftDTO } from "@/app/schemas/listing-draft";
const id = "abcdef0123456789abcdef01";
const payload = (make: string): DraftPayload => ({ ...emptyDraftPayload, details: { ...emptyDraftPayload.details, make } });
const dto = (payload: DraftPayload, revision = 1): ListingDraftDTO => ({ id, revision, payload, updatedAt: new Date().toISOString(), publishedListingId: null });
async function tick() { await act(async () => { vi.advanceTimersByTime(1500); }); }
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); window.history.replaceState(null, "", "/submit-listing");
  mocks.post.mockImplementation(async (_url, body) => ({ data: { ...dto(body.payload), id: body.id } }));
  mocks.patch.mockImplementation(async (_url, body) => ({ data: dto(body.payload, body.revision + 1) }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
describe("listing draft autosave", () => {
  it("does not create empty drafts, then saves partial inputs and a resumable URL after a debounce", async () => {
    const { result, rerender } = renderHook(({ data }) => useListingDraft(data, undefined, false), { initialProps: { data: emptyDraftPayload } });
    await tick(); expect(mocks.post).not.toHaveBeenCalled();
    rerender({ data: payload("Porsche") }); await tick();
    expect(mocks.post).toHaveBeenCalledTimes(1);
    const body = mocks.post.mock.calls[0][1]; expect(body.payload.details.make).toBe("Porsche"); expect(body.id).toMatch(/^[a-f0-9]{24}$/);
    expect(window.location.search).toBe(`?draft=${body.id}`); expect(result.current.status).toBe("saved"); expect(result.current.dirty).toBe(false);
  });
  it("keeps newer edits while an older save is in flight and sends them at the next revision", async () => {
    let resolve!: (value: unknown) => void;
    mocks.post.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const { result, rerender } = renderHook(({ data }) => useListingDraft(data, undefined, false), { initialProps: { data: payload("First") } });
    await tick(); rerender({ data: payload("Latest") }); await tick();
    expect(mocks.post).toHaveBeenCalledTimes(1); expect(mocks.patch).not.toHaveBeenCalled();
    await act(async () => { resolve({ data: dto(payload("First")) }); });
    expect(mocks.patch).toHaveBeenCalledWith(`/api/listing-drafts/${id}`, expect.objectContaining({ revision: 1, payload: payload("Latest") }));
    expect(result.current.status).toBe("saved"); expect(result.current.dirty).toBe(false);
  });
  it("recovers a lost create response with the same ID and key before saving further edits", async () => {
    mocks.post.mockRejectedValueOnce(new Error("timeout"));
    const { result, rerender } = renderHook(({ data }) => useListingDraft(data, undefined, false), { initialProps: { data: payload("First") } });
    await tick(); expect(result.current.status).toBe("error");
    rerender({ data: payload("Newer") }); await tick();
    expect(mocks.post.mock.calls[0][1]).toEqual(mocks.post.mock.calls[1][1]);
    expect(mocks.patch.mock.calls[0][1].payload).toEqual(payload("Newer")); expect(result.current.status).toBe("saved");
  });
  it("persists clearing all fields in an existing draft", async () => {
    const saved = dto(payload("Porsche"));
    const { rerender } = renderHook(({ data }) => useListingDraft(data, saved, false), { initialProps: { data: saved.payload } });
    rerender({ data: emptyDraftPayload }); await tick();
    expect(mocks.patch.mock.calls[0][1].payload).toEqual(emptyDraftPayload);
  });
  it("stops on a revision conflict and leaves unsaved inputs untouched", async () => {
    const saved = dto(payload("Porsche"));
    mocks.patch.mockRejectedValueOnce({ isAxiosError: true, response: { status: 409, data: { error: "Changed in another tab" } } });
    const { result, rerender } = renderHook(({ data }) => useListingDraft(data, saved, false), { initialProps: { data: saved.payload } });
    rerender({ data: payload("Edited") }); await tick();
    expect(result.current.status).toBe("conflict"); expect(result.current.dirty).toBe(true);
    rerender({ data: payload("More edits") }); await tick(); expect(mocks.patch).toHaveBeenCalledTimes(1);
    await act(async () => { await expect(result.current.save(payload("More edits"))).rejects.toThrow("Reload"); });
    expect(mocks.patch).toHaveBeenCalledTimes(1);
  });
  it("waits for the latest queued save when explicitly flushing before exit or publication", async () => {
    const saved = dto(payload("Old"));
    const { result } = renderHook(() => useListingDraft(payload("Old"), saved, true));
    let final: ListingDraftDTO | undefined;
    await act(async () => { final = await result.current.save(payload("Final")); });
    expect(final?.revision).toBe(2); expect(final?.payload.details.make).toBe("Final");
  });
});
