// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ post: vi.fn(), refresh: vi.fn() }));
vi.mock("axios", () => ({ default: { post: mocks.post } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));

import AuctionStartForm from "./AuctionStartForm";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.post.mockResolvedValue({ data: {} });
});
afterEach(cleanup);

it("submits numeric bid settings and a native datetime string", async () => {
  render(<AuctionStartForm listingId="listing-1" />);
  fireEvent.change(screen.getByLabelText("End Time"), { target: { value: "2026-10-16T12:30" } });
  fireEvent.change(screen.getByLabelText("Starting Bid"), { target: { value: "0" } });
  fireEvent.change(screen.getByLabelText("Bid Increment"), { target: { value: "25" } });
  await act(async () => { fireEvent.submit(screen.getByRole("button", { name: "Start an Auction" }).closest("form")!); });

  expect(mocks.post).toHaveBeenCalledWith("/api/auction-start", {
    listingId: "listing-1", endTime: "2026-10-16T12:30", startingBid: 0, bidIncrement: 25,
  });
});

it("does not submit an empty end time as a Date object", async () => {
  render(<AuctionStartForm listingId="listing-1" />);
  await act(async () => { fireEvent.submit(screen.getByRole("button", { name: "Start an Auction" }).closest("form")!); });
  expect(mocks.post).not.toHaveBeenCalled();
});
