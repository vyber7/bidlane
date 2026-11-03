"use client";
import axios from "axios";
import Link from "next/link";
import { useState } from "react";
import { getApiErrorMessage } from "@/app/utils/api-error";

export type DraftSummary = { id: string; revision: number; title: string; photoCount: number; updatedAt: string };
export default function ListingDrafts({ drafts: initialDrafts }: { drafts: DraftSummary[] }) {
  const [removed, setRemoved] = useState<string[]>([]);
  const drafts = initialDrafts.filter((draft) => !removed.includes(draft.id));
  const [confirm, setConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState("");
  return <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div>
      <h2 className="text-xl font-bold">Saved drafts <span className="text-slate-500">({drafts.length})</span></h2>
      <p className="mt-1 text-sm text-slate-500">Only you can see these drafts. Continue where you left off before submitting a vehicle.</p>
    </div><Link href="/submit-listing" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold">Start a new draft</Link></div>
    {error && <p role="alert" className="mt-4 text-sm text-rose-700">{error} Refresh this page if the draft changed elsewhere.</p>}
    {drafts.length ? <ul className="mt-4 divide-y divide-slate-100">{drafts.map((draft) => <li key={draft.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
      <div className="min-w-0"><h3 className="break-words font-semibold">{draft.title}</h3><p className="mt-1 text-xs text-slate-500">{draft.photoCount} photos · Saved {new Date(draft.updatedAt).toLocaleString("en-US", { timeZone: "UTC" })} UTC</p></div>
      <div className="flex flex-wrap items-center gap-3">
        {confirm === draft.id ? <><span className="text-sm">Delete this draft?</span><button type="button" disabled={deleting !== null} onClick={() => setConfirm(null)} className="text-sm font-semibold underline">Cancel</button><button type="button" disabled={deleting !== null} className="text-sm font-bold text-rose-700 underline disabled:opacity-50" onClick={async () => {
          setDeleting(draft.id); setError("");
          try {
            await axios.delete(`/api/listing-drafts/${draft.id}`, { data: { revision: draft.revision } });
            setRemoved((current) => [...current, draft.id]); setConfirm(null);
          } catch (error) { setError(getApiErrorMessage(error, "Could not delete this draft.")); }
          finally { setDeleting(null); }
        }}>{deleting === draft.id ? "Deleting…" : "Delete"}</button></> : <>
          <Link href={`/submit-listing?draft=${draft.id}`} className="rounded-lg bg-slate-950 px-3 py-2 text-sm font-bold text-white">Resume draft</Link>
          <button type="button" onClick={() => setConfirm(draft.id)} className="text-sm font-semibold text-slate-500 underline">Delete draft<span className="sr-only">: {draft.title}</span></button>
        </>}
      </div>
    </li>)}</ul> : <p className="mt-5 text-sm text-slate-500">No saved drafts yet. Your next vehicle submission will save here as you work.</p>}
  </section>;
}
