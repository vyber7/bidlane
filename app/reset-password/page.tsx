import type { Metadata } from "next";
import ResetPasswordForm from "./ResetPasswordForm";
export const metadata: Metadata = { title: "Reset password | BidLane", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default function ResetPasswordPage() {
  return <main className="mx-auto max-w-xl px-4 pb-16 pt-28"><ResetPasswordForm /></main>;
}
