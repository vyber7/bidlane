import type { Metadata } from "next";
import { Inter } from "next/font/google";
import ToasterContext from "./context/ToasterContext";
import AuthContext from "./context/AuthContext";
import "./globals.css";
import ConditionalLayout from "./components/ConditionalLayout";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Bidlane | Auto Auctions",
  description: "Buy and sell cars through auctions",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning={true} data-lt-installed="true">
      <body className={`${inter.className} flex flex-col min-h-screen`}>
        <AuthContext>
          <ToasterContext />
          <ConditionalLayout>{children}</ConditionalLayout>
        </AuthContext>
      </body>
    </html>
  );
}
