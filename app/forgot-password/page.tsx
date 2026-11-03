import type { Metadata } from "next";
import ForgotPasswordForm from "./ForgotPasswordForm";
export const metadata: Metadata = { title: "Forgot password | BidLane", robots: { index: false, follow: false } };
export default function ForgotPasswordPage() {
  return <main className="mx-auto max-w-xl px-4 pb-16 pt-28"><ForgotPasswordForm /></main>;
}
