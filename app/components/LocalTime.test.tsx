// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import LocalTime from "./LocalTime";
import { formatLocalDate } from "@/app/utils/format";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const at = "2026-11-24T23:30:00Z";

describe("LocalTime", () => {
  it("renders UTC on the server so hydration matches", () => {
    expect(renderToString(<LocalTime date={at} />)).toBe('<time dateTime="2026-11-24T23:30:00.000Z">Nov 24, 2026, 11:30 PM UTC</time>');
  });

  it("reformats in the viewer's locale after mount", () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["en-GB"]);
    const { container } = render(<LocalTime date={at} format="date" />);
    const time = container.querySelector("time");
    expect(time?.textContent).toBe("24 Nov 2026");
    expect(time?.getAttribute("dateTime")).toBe("2026-11-24T23:30:00.000Z");
  });

  it("renders nothing for an invalid date", () => {
    const { container } = render(<LocalTime date="not a date" />);
    expect(container.innerHTML).toBe("");
  });
});

describe("formatLocalDate", () => {
  it("uses the viewer's time zone, which can change the calendar day", () => {
    expect(formatLocalDate(at, "date", { locales: ["en-US"], timeZone: "Asia/Tokyo" })).toBe("Nov 25, 2026");
    expect(formatLocalDate(at, "dateTime", { locales: ["en-US"], timeZone: "America/New_York" })).toBe("Nov 24, 2026, 6:30 PM EST");
  });

  it("follows the viewer's locale", () => {
    expect(formatLocalDate(at, "monthYear", { locales: ["de-DE"], timeZone: "UTC" })).toBe("November 2026");
    expect(formatLocalDate(at, "date", { locales: ["ja-JP"], timeZone: "UTC" })).toBe("2026年11月24日");
  });
});
