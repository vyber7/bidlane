import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import ToasterContext from "./context/ToasterContext";
import AuthContext from "./context/AuthContext";
import { NotificationProvider } from "./context/NotificationContext";
import "./globals.css";
import ConditionalLayout from "./components/ConditionalLayout";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "BidLane | Auto Auctions",
  description: "Buy and sell cars through auctions",
  icons: { icon: "/favicon.ico" },
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
