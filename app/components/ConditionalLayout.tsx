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
      {!hideHeaderFooter && <Header key={pathname} />}
      <main className="flex-grow">{children}</main>
      {!hideHeaderFooter && <Footer />}
    </>
  );
}
