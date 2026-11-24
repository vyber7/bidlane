// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ post: vi.fn(), refresh: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("react-hot-toast", () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock("axios", () => ({ default: { post: mocks.post } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));

import AuctionStartForm from "./AuctionStartForm";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.post.mockResolvedValue({ data: {} });
});
afterEach(cleanup);

it("submits numeric bid settings and converts local closing time to an ISO timestamp", async () => {
  const endTime = "2026-10-16T12:30";
  render(<AuctionStartForm listingId="listing-1" />);
  const input = screen.getByLabelText("End Time");
  expect(document.getElementById(input.getAttribute("aria-describedby")!)?.textContent)
    .toContain(Intl.DateTimeFormat().resolvedOptions().timeZone.replaceAll("_", " "));
  fireEvent.change(input, { target: { value: endTime } });
  fireEvent.change(screen.getByLabelText("Starting Bid"), { target: { value: "0" } });
  fireEvent.change(screen.getByLabelText("Bid Increment"), { target: { value: "25" } });
  await act(async () => { fireEvent.submit(screen.getByRole("button", { name: "Start an Auction" }).closest("form")!); });

  expect(mocks.post).toHaveBeenCalledWith("/api/auction-start", {
    listingId: "listing-1", endTime: new Date(endTime).toISOString(), startingBid: 0, bidIncrement: 25,
  });
});

it("does not submit an empty end time as a Date object", async () => {
  render(<AuctionStartForm listingId="listing-1" />);
  await act(async () => { fireEvent.submit(screen.getByRole("button", { name: "Start an Auction" }).closest("form")!); });
  expect(mocks.post).not.toHaveBeenCalled();
});

it("confirms that the Auction started", async () => {
  render(<AuctionStartForm listingId="listing-1" />);
  fireEvent.change(screen.getByLabelText("End Time"), { target: { value: "2026-10-16T12:30" } });
  fireEvent.change(screen.getByLabelText("Starting Bid"), { target: { value: "1000" } });
  fireEvent.change(screen.getByLabelText("Bid Increment"), { target: { value: "25" } });
  await act(async () => { fireEvent.submit(screen.getByRole("button", { name: "Start an Auction" }).closest("form")!); });

  expect(mocks.success).toHaveBeenCalledWith("Auction started. Bidding is now open.");
  expect(mocks.error).not.toHaveBeenCalled();
});
