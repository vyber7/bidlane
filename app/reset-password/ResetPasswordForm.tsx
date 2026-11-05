"use client";
import axios from "axios";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { passwordResetSchema } from "@/app/schemas/password-reset";
import { MAX_PASSWORD_BYTES, MIN_PASSWORD_LENGTH, PASSWORD_REQUIREMENTS } from "@/app/schemas/password";
import { getApiErrorMessage } from "@/app/utils/api-error";

export default function ResetPasswordForm() {
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const captured = useRef(false);
  useEffect(() => {
    if (captured.current) return;
    captured.current = true;
    const value = new URLSearchParams(window.location.hash.slice(1)).get("token");
    setToken(value && /^[a-f0-9]{64}$/.test(value) ? value : null);
    window.history.replaceState(null, "", window.location.pathname);
  }, []);
  return <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
    <p className="text-xs font-bold uppercase tracking-widest text-amber-700">Account recovery</p>
    <h1 className="mt-3 text-3xl font-black">{done ? "Password reset" : "Choose a new password"}</h1>
    {done ? <>
      <p role="status" className="mt-4 text-sm leading-6 text-emerald-800">Your password has been changed and existing sessions have been signed out. Sign in with your new password.</p>
      <Link href="/signin" className="mt-5 inline-block rounded-full bg-amber-400 px-5 py-3 font-bold text-slate-950">Sign in</Link>
    </> : <>
      <p id="password-requirements" className="mt-3 text-sm leading-6 text-slate-600">{PASSWORD_REQUIREMENTS} Reset links expire 30 minutes after being requested and work once.</p>
      {token ? <form className="mt-6 space-y-4" aria-busy={sending} onSubmit={async (event) => {
        event.preventDefault(); if (busy.current) return;
        setError("");
        const parsed = passwordResetSchema.safeParse({ token, password, confirmPassword });
        if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
        busy.current = true; setSending(true);
        try {
          await axios.post("/api/reset-password", parsed.data);
          setDone(true); setToken(null); setPassword(""); setConfirmPassword("");
          // Clear this browser’s cookie/session cache too; all other cookies
          // are rejected server-side by their revoked session version.
          await signOut({ redirect: false }).catch(() => undefined);
        } catch (error) { setError(getApiErrorMessage(error, "Could not reset your password. Please try again.")); }
        finally { busy.current = false; setSending(false); }
      }}>
        <fieldset disabled={sending} className="min-w-0 space-y-4">
          <legend className="sr-only">New password</legend>
          <label className="block text-sm font-semibold text-slate-700">New password<input type="password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} maxLength={MAX_PASSWORD_BYTES} aria-describedby="password-requirements" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 block w-full rounded-xl border border-slate-300 px-4 py-3 focus:border-amber-500 focus:ring-amber-500" /></label>
          <label className="block text-sm font-semibold text-slate-700">Confirm new password<input type="password" autoComplete="new-password" required maxLength={MAX_PASSWORD_BYTES} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="mt-2 block w-full rounded-xl border border-slate-300 px-4 py-3 focus:border-amber-500 focus:ring-amber-500" /></label>
          <button type="submit" className="w-full rounded-full bg-amber-400 px-5 py-3 font-bold text-slate-950 hover:bg-amber-300 disabled:opacity-60">{sending ? "Resetting…" : "Reset password"}</button>
        </fieldset>
      </form> : <p className="mt-4 text-sm text-slate-600">Open the link from your reset email, or request a new one below.</p>}
      {error && <p role="alert" className="mt-4 text-sm text-rose-700">{error}</p>}
      <Link href="/forgot-password" className="mt-6 inline-block text-sm font-bold underline decoration-amber-400 underline-offset-4">Request a new reset link</Link>
    </>}
  </section>;
}
