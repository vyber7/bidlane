// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { makeBid, makeComment } from "@/app/test/auction-fixtures";
import CommentBox from "./CommentBox";

afterEach(cleanup);

describe("auction activity history", () => {
  it("shows bids as whole-dollar amounts with their UTC date", () => {
    render(<CommentBox comments={[]} bids={[makeBid({ amount: 1250000, createdAt: "2026-11-24T23:30:00Z" })]} />);
    const entry = within(screen.getByRole("list", { name: "Auction activity, newest first" })).getByRole("listitem");
    expect(entry.textContent).toContain("Bid $1,250,000");
    expect(within(entry).getByText("Nov 24, 2026").getAttribute("dateTime")).toBe("2026-11-24T23:30:00.000Z");
  });

  it("lists comments and bids together, newest first", () => {
    render(<CommentBox
      comments={[makeComment({ id: "c1", body: "Any service records?", createdAt: "2026-11-24T10:00:00Z" })]}
      bids={[makeBid({ id: "b1", amount: 12000, createdAt: "2026-11-24T12:00:00Z" })]}
    />);
    const entries = screen.getAllByRole("listitem").map((item) => item.textContent);
    expect(entries[0]).toContain("Bid $12,000");
    expect(entries[1]).toContain("Any service records?");
  });
});
