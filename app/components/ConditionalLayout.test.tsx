// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import ConditionalLayout from "./ConditionalLayout";

const usePathname = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ usePathname }));
vi.mock("./Header", () => ({ default: () => <header><button type="button">Menu</button></header> }));
vi.mock("./Footer", () => ({ default: () => <footer /> }));

afterEach(cleanup);

it.each(["/", "/signin"])("puts a skip link before the content on %s", (pathname) => {
  usePathname.mockReturnValue(pathname);
  const { container } = render(<ConditionalLayout><h1>Page content</h1></ConditionalLayout>);

  const skip = screen.getByRole("link", { name: "Skip to main content" });
  const main = screen.getByRole("main");
  expect(container.querySelector("a, button")).toBe(skip);
  expect(skip.getAttribute("href")).toBe(`#${main.id}`);
  expect(main.getAttribute("tabindex")).toBe("-1");
  expect(main.contains(screen.getByRole("heading", { name: "Page content" }))).toBe(true);
});
