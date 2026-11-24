"use client";

import { usePathname } from "next/navigation";
import Header from "./Header";
import Footer from "./Footer";

export const MAIN_CONTENT_ID = "main-content";

export default function ConditionalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  // Sign-in renders its own header, main, and footer so they stay landmarks.
  const ownsLandmarks = pathname === "/signin";

  return (
    <>
      <a
        href={`#${MAIN_CONTENT_ID}`}
        className="sr-only rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-2 focus:z-[120] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
      >
        Skip to main content
      </a>
      {ownsLandmarks ? children : <>
        <Header key={pathname} />
        <main id={MAIN_CONTENT_ID} tabIndex={-1} className="flex-grow">
          {children}
        </main>
        <Footer />
      </>}
    </>
  );
}
