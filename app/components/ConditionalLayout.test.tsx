// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ConditionalLayout from "./ConditionalLayout";
import AboutPage from "@/app/about/page";
import FaqPage from "@/app/faq/page";
import TermsPage from "@/app/terms/page";
import ForgotPasswordPage from "@/app/forgot-password/page";
import SignIn from "@/app/signin/page";

const usePathname = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ usePathname, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("./Header", () => ({ default: () => <header><button type="button">Menu</button></header> }));
vi.mock("./Footer", () => ({ default: () => <footer /> }));
vi.mock("@/app/(site)/components/AuthForm", () => ({ default: () => <h1>Welcome Back.</h1> }));

afterEach(cleanup);

it.each(["/", "/signin"])("puts a skip link before the content on %s", async (pathname) => {
  usePathname.mockReturnValue(pathname);
  const page = pathname === "/signin" ? await SignIn({ searchParams: Promise.resolve({}) }) : <h1>Page content</h1>;
  const { container } = render(<ConditionalLayout>{page}</ConditionalLayout>);

  const skip = screen.getByRole("link", { name: "Skip to main content" });
  const main = screen.getByRole("main");
  expect(container.querySelector("a, button")).toBe(skip);
  expect(skip.getAttribute("href")).toBe(`#${main.id}`);
  expect(main.getAttribute("tabindex")).toBe("-1");
  expect(main.contains(screen.getAllByRole("heading", { level: 1 })[0])).toBe(true);
});

describe("page landmarks", () => {
  it.each([
    ["/about", AboutPage],
    ["/faq", FaqPage],
    ["/terms", TermsPage],
    ["/forgot-password", ForgotPasswordPage],
  ])("exposes exactly one main landmark on %s", (pathname, Page) => {
    usePathname.mockReturnValue(pathname);
    render(<ConditionalLayout><Page /></ConditionalLayout>);
    expect(screen.getAllByRole("main")).toHaveLength(1);
  });

  it("exposes the sign-in header and footer as banner and contentinfo, with the form's h1 first", async () => {
    usePathname.mockReturnValue("/signin");
    render(<ConditionalLayout>{await SignIn({ searchParams: Promise.resolve({}) })}</ConditionalLayout>);

    expect(screen.getAllByRole("main")).toHaveLength(1);
    const banner = screen.getByRole("banner");
    expect(within(banner).getByRole("link", { name: "BidLane home" })).toBeDefined();
    expect(within(screen.getByRole("contentinfo")).getByRole("link", { name: "Need help?" })).toBeDefined();
    const headings = screen.getAllByRole("heading");
    expect(headings[0].tagName).toBe("H1");
    expect(headings[0].textContent).toBe("Welcome Back.");
  });
});
