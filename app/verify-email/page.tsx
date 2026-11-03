import type { Metadata } from "next";
import VerificationForm from "./VerificationForm";
export const metadata: Metadata = { title: "Verify email | BidLane", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default function VerifyEmail() {
  return <main className="mx-auto max-w-xl px-4 pb-16 pt-28"><VerificationForm /></main>;
}
