// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeListing } from "@/app/test/auction-fixtures";
import WatchAuctionButton from "./WatchAuctionButton";

const mocks = vi.hoisted(() => ({ post: vi.fn(), error: vi.fn() }));
vi.mock("axios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("axios")>();
  return { ...actual, default: { ...actual.default, post: mocks.post } };
});
vi.mock("react-hot-toast", () => ({ default: { error: mocks.error } }));
vi.mock("@/app/hooks/usePusherEvent", () => ({ default: vi.fn() }));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("homepage watch action", () => {
  it("saves a watch and restores the saved state if removing it fails", async () => {
    const listing = makeListing({ status: "UPCOMING" });
    mocks.post.mockResolvedValueOnce({ data: { watching: true } });
    render(<WatchAuctionButton listing={listing} currentUserId="buyer" />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Watch auction" })));
    expect(mocks.post).toHaveBeenCalledWith("/api/update-watchlist", { listingId: listing.id, watching: true });
    expect(screen.getByRole("button", { name: "Watching" }).getAttribute("aria-pressed")).toBe("true");

    mocks.post.mockRejectedValueOnce({ isAxiosError: true, response: { data: { error: "Please try again" } } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Watching" })));
    expect(screen.getByRole("button", { name: "Watching" }).getAttribute("aria-pressed")).toBe("true");
    expect(mocks.error).toHaveBeenCalledWith("Please try again");
  });

  it("takes visitors to sign in without sending a watch request", () => {
    render(<WatchAuctionButton listing={makeListing({ status: "UPCOMING" })} />);
    expect(screen.getByRole("link", { name: "Sign in to watch" }).getAttribute("href")).toBe("/signin");
    expect(screen.queryByRole("button")).toBeNull();
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("takes sellers to their listing instead of offering to watch it", () => {
    const listing = makeListing({ status: "UPCOMING" });
    render(<WatchAuctionButton listing={listing} currentUserId="seller" />);
    expect(screen.getByRole("link", { name: "View your listing" }).getAttribute("href")).toBe(`/listing/${listing.id}`);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
