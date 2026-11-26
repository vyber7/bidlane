import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import AccountHeader from "./components/AccountHeader";
import AccountLinks from "./components/AccountLinks";
import { getAccountUser } from "./lib/current-user";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AccountLayout({ children }: { children: ReactNode }) {
  const currentUser = await getAccountUser();

  if (!currentUser) {
    return (
      <div className="account-page mx-auto flex min-h-[70vh] max-w-lg items-center px-4 py-16">
        <div className="w-full rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-gray-500">
            My Account
          </p>
          <h1 className="mt-2 text-2xl font-bold text-gray-950">Sign In to View Your Account</h1>
          <p className="mt-2 text-sm text-gray-500">
            Your account details and preferences are available after you sign in.
          </p>
          <Link
            href="/signin"
            className="mt-6 inline-flex rounded-lg bg-gray-950 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-gray-800"
          >
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="account-page mx-auto grid max-w-6xl grid-cols-4 gap-4 px-2 pb-8 lg:px-8">
      <AccountHeader userName={currentUser.name?.trim().split(/\s+/)[0]} />
      <AccountLinks isAdmin={currentUser.role === "ADMIN"} />
      <div className="col-span-4 lg:col-span-3">{children}</div>
    </div>
  );
}
