"use client";
import axios from "axios";
import { useRef, useState } from "react";
import { getApiErrorMessage } from "@/app/utils/api-error";

export default function EmailVerification({ verified }: { verified: boolean }) {
  const [confirmed, setConfirmed] = useState(false);
  const isVerified = verified || confirmed;
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const busy = useRef(false);
  return <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
    <h2 className="text-lg font-bold">{isVerified ? "Email verified" : "Verify your email"}</h2>
    <p className="mt-2 text-sm text-slate-600">{isVerified ? "You’ve confirmed access to your sign-in inbox. This does not verify your identity or any vehicle." : "Confirm access to your sign-in inbox. Your public seller profile will show an email verified badge; your email address stays private."}</p>
    {!isVerified && <button type="button" disabled={sending} className="mt-4 rounded-lg bg-slate-950 px-4 py-3 text-sm font-bold text-white disabled:opacity-50" onClick={async () => {
      if (busy.current) return;
      busy.current = true; setSending(true); setMessage(""); setError("");
      try {
        const response = await axios.post("/api/account/verify-email");
        if (response.data.verified) { setConfirmed(true); setMessage("Your email is already verified."); return; }
        setMessage("Check your inbox for a verification link. It expires in 30 minutes. You can request another in one minute.");
      } catch (error) { setError(getApiErrorMessage(error, "Could not send verification email. Please try again.")); }
      finally { busy.current = false; setSending(false); }
    }}>{sending ? "Sending…" : "Send verification email"}</button>}
    {message && <p role="status" className="mt-3 text-sm text-emerald-800">{message}</p>}
    {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
  </section>;
}
