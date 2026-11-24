// @vitest-environment jsdom

import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { auctionNow, makePublicListing as makeListing } from "@/app/test/auction-fixtures";
import { installFakeRealtime } from "@/app/libs/realtime/testing";
import AuctionBrowser from "./AuctionBrowser";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/",
}));
vi.mock("next-cloudinary", () => ({
  // eslint-disable-next-line @next/next/no-img-element -- Render a plain image without Cloudinary requests.
  CldImage: ({ crop, ...props }: ComponentProps<"img"> & { crop?: string }) => <img {...props} alt={props.alt} data-crop={crop} />,
}));

let uninstallRealtime = () => {};
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(auctionNow);
  window.history.replaceState(null, "", "/");
  uninstallRealtime = installFakeRealtime().uninstall;
});
afterEach(() => {
  cleanup();
  uninstallRealtime();
  vi.useRealTimers();
});

describe("inventory price announcements", () => {
  const porsche = makeListing({ id: "porsche", make: "Porsche", model: "911", currentBid: 12000 });
  const bmw = makeListing({ id: "bmw", make: "BMW", model: "M3", currentBid: 20000 });

  it("announces a card's price change through the browser's single status region", () => {
    const { container, rerender } = render(<AuctionBrowser listings={[porsche, bmw]} now={+auctionNow} />);
    const status = screen.getByRole("status", { name: "" });
    expect(container.querySelectorAll("[aria-live], [role='status']")).toHaveLength(1);
    expect(status.textContent).toBe("Live: 2 auctions found.");

    rerender(<AuctionBrowser listings={[{ ...porsche, currentBid: 15000 }, bmw]} now={+auctionNow} />);
    expect(status.textContent).toBe("2020 Porsche 911: Current bid $15,000.");
    expect(container.querySelectorAll("[aria-live], [role='status']")).toHaveLength(1);
  });

  it("returns to the result count when the filter changes", () => {
    const { rerender } = render(<AuctionBrowser listings={[porsche, bmw]} now={+auctionNow} />);
    rerender(<AuctionBrowser listings={[{ ...porsche, currentBid: 15000 }, bmw]} now={+auctionNow} />);
    act(() => { fireEvent.change(screen.getByRole("searchbox"), { target: { value: "BMW" } }); });
    expect(screen.getByRole("status", { name: "" }).textContent).toBe("Live: 1 auction found.");
  });
});
