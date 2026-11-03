"use client";
import axios from "axios";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { getApiErrorMessage } from "@/app/utils/api-error";

export default function VerificationForm() {
  const [token, setToken] = useState<string | null>(null);
  const [state, setState] = useState<"ready" | "sending" | "done">("ready");
  const [error, setError] = useState("");
  const busy = useRef(false);
  const captured = useRef(false);
  useEffect(() => {
    if (captured.current) return;
    captured.current = true;
    const value = new URLSearchParams(window.location.hash.slice(1)).get("token");
    setToken(value);
    window.history.replaceState(null, "", window.location.pathname);
  }, []);
  return <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
    <h1 className="text-2xl font-black">{state === "done" ? "Email verified" : "Confirm your email"}</h1>
    {state === "done" ? <p role="status" className="mt-4 text-emerald-800">You’ve confirmed access to your inbox. You can close this page or return to your profile.</p> : <>
      <p className="mt-4 text-sm text-slate-600">Confirm the email address that received this link. Links expire after 30 minutes and work once.</p>
      <button type="button" disabled={!token || state === "sending"} className="mt-5 rounded-lg bg-amber-400 px-5 py-3 font-bold text-slate-950 disabled:opacity-50" onClick={async () => {
        if (!token || busy.current) return;
        busy.current = true; setState("sending"); setError("");
        try { await axios.post("/api/verify-email", { token }); setState("done"); setToken(null); }
        catch (error) { setError(getApiErrorMessage(error, "Could not verify your email. Please try again.")); setState("ready"); }
        finally { busy.current = false; }
      }}>{state === "sending" ? "Verifying…" : "Verify email address"}</button>
      {!token && <p className="mt-3 text-sm text-slate-600">Open the link from your verification email, or request a new one from your profile.</p>}
    </>}
    {error && <p role="alert" className="mt-4 text-sm text-rose-700">{error}</p>}
    <Link href="/account/profile" className="mt-6 inline-block text-sm font-bold underline">Go to profile</Link>
  </section>;
}
