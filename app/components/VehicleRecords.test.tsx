// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import VehicleRecords from "./VehicleRecords";
afterEach(cleanup);
describe("public vehicle records", () => {
  it("labels missing legacy records without inventing evidence", () => {
    render(<VehicleRecords records={null} />);
    expect(screen.getByText(/No records provided/)).toBeDefined();
    expect(screen.getByText(/has not authenticated/)).toBeDefined();
  });
  it("renders seller labels as text and opens safe record links separately", () => {
    const url = "https://res.cloudinary.com/demo/image/upload/receipt.pdf";
    render(<VehicleRecords records={[{ label: "<script>Receipt</script>", url }]} />);
    const link = screen.getByRole("link");
    expect(link.textContent).toContain("<script>Receipt</script>"); expect(document.querySelector("script")).toBeNull();
    expect(link.getAttribute("href")).toBe(url); expect(link.getAttribute("rel")).toContain("noreferrer");
  });
});
