"use client";

import { usePathname } from "next/navigation";
import Header from "./Header";
import Footer from "./Footer";

export default function ConditionalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const hideHeaderFooter = pathname === "/signin";

  return (
    <>
      <a
        href="#main-content"
        className="sr-only rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-2 focus:z-[120] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
      >
        Skip to main content
      </a>
      {!hideHeaderFooter && <Header key={pathname} />}
      <main
        id="main-content"
        tabIndex={-1}
        className={`flex-grow ${hideHeaderFooter ? "scroll-mt-[var(--preview-banner-height)]" : "scroll-mt-[var(--site-header-height)]"}`}
      >
        {children}
      </main>
      {!hideHeaderFooter && <Footer />}
    </>
  );
}
