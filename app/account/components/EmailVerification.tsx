"use client";

import axios from "axios";
import { useEffect, useRef, useState } from "react";
import { FiLoader } from "react-icons/fi";
import { getApiErrorMessage } from "@/app/utils/api-error";

export default function EmailVerification({ verified }: { verified: boolean }) {
  const [confirmed, setConfirmed] = useState(false);
  const isVerified = verified || confirmed;
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const busy = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const sendButton = useRef<HTMLButtonElement>(null);
  const focusHeading = useRef(false);

  useEffect(() => {
    if (isVerified && focusHeading.current) {
      focusHeading.current = false;
      heading.current?.focus();
    }
  }, [isVerified]);

  async function sendVerification() {
    if (busy.current) return;
    busy.current = true;
    setSending(true);
    setMessage("");
    setError("");
    try {
      const response = await axios.post("/api/account/verify-email");
      if (response.data.verified) {
        focusHeading.current = document.activeElement === sendButton.current;
        setConfirmed(true);
        setMessage("Your email is already verified.");
      } else {
        setMessage("Check your inbox for a verification link. It expires in 30 minutes. You can request another in one minute.");
      }
    } catch (error) {
      setError(getApiErrorMessage(error, "Could not send verification email. Please try again."));
    } finally {
      busy.current = false;
      setSending(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
      <h2 ref={heading} tabIndex={-1} className="scroll-mt-[calc(var(--site-header-height)+1rem)] text-balance text-lg font-bold">
        {isVerified ? "Email Verified" : "Verify Your Email"}
      </h2>
      <p className="mt-2 text-sm text-slate-600">
        {isVerified
          ? "You’ve confirmed access to your sign-in inbox. This does not verify your identity or any vehicle."
          : "Confirm access to your sign-in inbox. Your public seller profile will show an email verified badge; your email address stays private."}
      </p>
      {!isVerified && (
        <button
          ref={sendButton}
          type="button"
          aria-disabled={sending}
          onClick={() => void sendVerification()}
          className="mt-4 inline-flex scroll-mt-[calc(var(--site-header-height)+1rem)] items-center gap-2 rounded-lg bg-slate-950 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 aria-disabled:cursor-wait aria-disabled:opacity-50"
        >
          {sending ? <><FiLoader aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> Sending…</> : "Send Verification Email"}
        </button>
      )}
      <p role="status" className={message ? "mt-3 text-sm text-emerald-800" : "sr-only"}>{message}</p>
      {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
    </section>
  );
}
