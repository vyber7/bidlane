"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { getApiErrorMessage } from "@/app/utils/api-error";

export default function ReviewForm({ id, revision, disabled }: { id: string; revision: number; disabled: boolean }) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const busy = useRef(false);
  const router = useRouter();

  async function decide(decision: "APPROVED" | "CHANGES_REQUESTED") {
    if (busy.current || disabled) return;
    setMessage(""); setError("");
    if (decision === "CHANGES_REQUESTED" && !reason.trim()) { setError("Explain what the seller needs to change."); return; }
    busy.current = true; setSaving(true);
    try {
      await axios.post(`/api/admin/listings/${id}/review`, { revision, decision, reason });
      setMessage(decision === "APPROVED" ? "Listing approved. The seller can now start the auction." : "Changes requested. The seller can see your feedback.");
      router.refresh();
      // Keep actions disabled until refreshed props provide the new revision.
    } catch (error) { setError(getApiErrorMessage(error, "Could not save this review.")); busy.current = false; setSaving(false); }
  }

  return <section className="rounded-2xl border border-slate-200 bg-white p-6">
    <h2 className="text-xl font-bold">Review decision</h2>
    <p className="mt-2 text-sm text-slate-600">Review all photos, disclosures, and records before approving. Feedback is visible to the seller. Approval does not certify ownership or vehicle condition.</p>
    {disabled && <p className="mt-3 text-sm font-bold text-amber-800">Auctions that have started cannot be moderated here.</p>}
    <fieldset disabled={saving || disabled} className="mt-4">
      <legend className="sr-only">Moderation decision</legend>
      <label className="block text-sm font-bold">Feedback (required when requesting changes)<textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={2000} rows={4} className="mt-2 block w-full rounded-lg border border-slate-300 p-3 font-normal" /></label>
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" onClick={() => void decide("APPROVED")} className="rounded-lg bg-slate-950 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">Approve listing</button>
        <button type="button" onClick={() => void decide("CHANGES_REQUESTED")} className="rounded-lg border border-slate-300 px-4 py-3 text-sm font-bold disabled:opacity-50">Request changes</button>
      </div>
    </fieldset>
    {message && <p role="status" className="mt-4 text-sm text-emerald-800">{message}</p>}
    {error && <p role="alert" className="mt-4 text-sm text-rose-700">{error} <button type="button" className="font-bold underline" onClick={() => router.refresh()}>Reload latest version</button></p>}
  </section>;
}
