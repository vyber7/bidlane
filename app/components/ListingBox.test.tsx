// @vitest-environment jsdom

import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { auctionNow, makePublicListing as makeListing } from "@/app/test/auction-fixtures";
import { installFakeRealtime } from "@/app/libs/realtime/testing";
import ListingBox from "./ListingBox";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/" }));
vi.mock("next-cloudinary", () => ({
  // eslint-disable-next-line @next/next/no-img-element -- Render a plain image without Cloudinary requests.
  CldImage: ({ crop, ...props }: ComponentProps<"img"> & { crop?: string }) => <img {...props} alt={props.alt} data-crop={crop} />,
}));

let uninstallRealtime = () => {};
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(auctionNow);
  uninstallRealtime = installFakeRealtime().uninstall;
});
afterEach(() => {
  cleanup();
  uninstallRealtime();
  vi.useRealTimers();
});

describe("inventory card", () => {
  it("leaves price announcements to the inventory browser instead of its own live region", () => {
    const { container } = render(<ListingBox listing={makeListing({ currentBid: 12000 })} currentUserId="buyer" />);
    expect(screen.getByText("$12,000")).toBeDefined();
    expect(container.querySelector("[aria-live]")).toBeNull();
    expect(container.querySelector("[role='status']")).toBeNull();
  });
});
