import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import ToasterContext from "./context/ToasterContext";
import AuthContext from "./context/AuthContext";
import { NotificationProvider } from "./context/NotificationContext";
import "./globals.css";
import ConditionalLayout from "./components/ConditionalLayout";
import { isIndexable, siteUrl } from "./libs/site-url";

const inter = Inter({ subsets: ["latin"] });

const description = "Buy and sell cars through auctions";

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: { default: "BidLane | Auto Auctions", template: "%s | BidLane" },
  description,
  icons: { icon: "/favicon.ico" },
  // No og:title or og:description here: link previews fall back to each page's own <title> and description.
  openGraph: { type: "website", siteName: "BidLane" },
  // X reuses og:image (app/opengraph-image.tsx) but needs this to show it large.
  twitter: { card: "summary_large_image" },
  // Previews and local builds stay out of search results.
  ...(isIndexable() ? {} : { robots: { index: false, follow: false } }),
};

export const viewport: Viewport = {
  themeColor: "#fafaf9",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body className={`${inter.className} flex flex-col min-h-screen`}>
        <aside className="sticky top-0 z-[110] flex h-[var(--preview-banner-height)] shrink-0 items-center justify-center bg-amber-100 px-4 text-center text-xs leading-4 text-slate-900">
          <p>This site is in preview. All cars are illustrative.</p>
        </aside>
        <AuthContext>
          <ToasterContext />
          <NotificationProvider><ConditionalLayout>{children}</ConditionalLayout></NotificationProvider>
        </AuthContext>
      </body>
    </html>
  );
}
