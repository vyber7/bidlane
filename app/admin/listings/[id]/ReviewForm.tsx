"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { getApiErrorMessage } from "@/app/utils/api-error";
import useUnsavedChangesWarning from "@/app/hooks/useUnsavedChangesWarning";

export default function ReviewForm({ id, revision, disabled }: { id: string; revision: number; disabled: boolean }) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [feedbackError, setFeedbackError] = useState("");
  const busy = useRef(false);
  const feedback = useRef<HTMLTextAreaElement>(null);
  const feedbackErrorId = `${useId()}-feedback-error`;
  const router = useRouter();
  useUnsavedChangesWarning(reason.trim() !== "" && !message);

  async function decide(decision: "APPROVED" | "CHANGES_REQUESTED") {
    if (busy.current || disabled) return;
    setMessage(""); setError(""); setFeedbackError("");
    if (decision === "CHANGES_REQUESTED" && !reason.trim()) {
      setFeedbackError("Explain what the seller needs to change.");
      feedback.current?.focus();
      return;
    }
    busy.current = true; setSaving(true);
    try {
      await axios.post(`/api/admin/listings/${id}/review`, { revision, decision, reason });
      setMessage(decision === "APPROVED" ? "Listing approved. The seller can now start the auction." : "Changes requested. The seller can see your feedback.");
      router.refresh();
      // Keep actions disabled until refreshed props provide the new revision.
    } catch (error) { setError(getApiErrorMessage(error, "Could not save this review.")); busy.current = false; setSaving(false); }
  }

  return <section className="rounded-2xl border border-slate-200 bg-white p-6">
    <h2 className="text-xl font-bold">Review Decision</h2>
    <p className="mt-2 text-sm text-slate-600">Review all photos, disclosures, and records before approving. Feedback is visible to the seller. Approval does not certify ownership or vehicle condition.</p>
    {disabled && <p className="mt-3 text-sm font-bold text-amber-800">Auctions that have started cannot be reviewed here.</p>}
    <fieldset disabled={saving || disabled} className="mt-4">
      <legend className="sr-only">Review decision</legend>
      <label className="block text-sm font-bold">Feedback (required when requesting changes)<textarea ref={feedback} name="reason" autoComplete="off" value={reason} aria-invalid={Boolean(feedbackError)} aria-describedby={feedbackError ? feedbackErrorId : undefined} onChange={(event) => { setReason(event.target.value); setFeedbackError(""); }} maxLength={2000} rows={4} className="mt-2 block w-full rounded-lg border border-slate-300 p-3 font-normal aria-[invalid=true]:border-rose-600" /></label>
      {feedbackError && <p id={feedbackErrorId} role="alert" className="mt-2 text-sm text-rose-700">{feedbackError}</p>}
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" onClick={() => void decide("APPROVED")} className="rounded-lg bg-slate-950 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950 disabled:opacity-50">Approve Listing</button>
        <button type="button" onClick={() => void decide("CHANGES_REQUESTED")} className="rounded-lg border border-slate-300 px-4 py-3 text-sm font-bold hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950 disabled:opacity-50">Request Changes</button>
      </div>
    </fieldset>
    {message && <p role="status" className="mt-4 text-sm text-emerald-800">{message}</p>}
    {error && <p role="alert" className="mt-4 text-sm text-rose-700">{error} <button type="button" className="font-bold underline hover:text-rose-900" onClick={() => router.refresh()}>Reload Latest Version</button></p>}
  </section>;
}
