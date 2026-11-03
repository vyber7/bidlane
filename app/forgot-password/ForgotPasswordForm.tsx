"use client";
import axios from "axios";
import Link from "next/link";
import { useRef, useState } from "react";
import { passwordResetRequestSchema } from "@/app/schemas/password-reset";
import { getApiErrorMessage } from "@/app/utils/api-error";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const busy = useRef(false);
  return <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
    <p className="text-xs font-bold uppercase tracking-widest text-amber-700">Account recovery</p>
    <h1 className="mt-3 text-3xl font-black">Forgot your password?</h1>
    <p className="mt-3 text-sm leading-6 text-slate-600">Enter your sign-in email to request a reset link. If you use Google or GitHub, continue with that sign-in method instead.</p>
    <form className="mt-6 space-y-4" aria-busy={sending} onSubmit={async (event) => {
      event.preventDefault(); if (busy.current) return;
      setError(""); setMessage("");
      const parsed = passwordResetRequestSchema.safeParse({ email });
      if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
      busy.current = true; setSending(true);
      try {
        const response = await axios.post<{ message: string }>("/api/forgot-password", parsed.data);
        setMessage(response.data.message);
      } catch (error) { setError(getApiErrorMessage(error, "Could not request a reset link. Please try again.")); }
      finally { busy.current = false; setSending(false); }
    }}>
      <label className="block text-sm font-semibold text-slate-700">Email address
        <input type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} disabled={sending} className="mt-2 block w-full rounded-xl border border-slate-300 px-4 py-3 focus:border-amber-500 focus:ring-amber-500 disabled:opacity-60" />
      </label>
      <button type="submit" disabled={sending} className="w-full rounded-full bg-amber-400 px-5 py-3 font-bold text-slate-950 hover:bg-amber-300 disabled:opacity-60">{sending ? "Requesting…" : "Send reset link"}</button>
    </form>
    {message && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm leading-6 text-emerald-900">{message} Allow a minute for delivery and check your spam folder.</p>}
    {error && <p role="alert" className="mt-4 text-sm text-rose-700">{error}</p>}
    <Link href="/signin" className="mt-6 inline-block text-sm font-bold underline decoration-amber-400 underline-offset-4">Back to sign in</Link>
  </section>;
}
