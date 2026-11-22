"use client";

import axios from "axios";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { FiLoader } from "react-icons/fi";
import { getApiErrorMessage } from "@/app/utils/api-error";
import { formatAmount } from "@/app/utils/format";

export type DraftSummary = { id: string; revision: number; title: string; photoCount: number; updatedAt: string };

const focusRing = "scroll-mt-[calc(var(--site-header-height)+1rem)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900";

export default function ListingDrafts({ drafts: initialDrafts }: { drafts: DraftSummary[] }) {
  const [removed, setRemoved] = useState<ReadonlySet<string>>(() => new Set());
  const drafts = initialDrafts.filter((draft) => !removed.has(draft.id));
  const [selected, setSelected] = useState<DraftSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const startDraftLink = useRef<HTMLAnchorElement>(null);
  const busy = useRef(false);
  const id = useId();

  useEffect(() => {
    const modal = dialog.current;
    if (!selected || !modal || modal.open) return;
    modal.showModal();
    cancelButton.current?.focus();
  }, [selected]);

  function openConfirmation(draft: DraftSummary, button: HTMLButtonElement) {
    trigger.current = button;
    setSelected(draft);
    setError("");
    setNotice("");
  }

  function closeConfirmation(deleted = false) {
    dialog.current?.close();
    const button = trigger.current;
    if (!deleted && button?.isConnected) button.focus();
    else startDraftLink.current?.focus();
    trigger.current = null;
    setSelected(null);
    setError("");
  }

  async function deleteDraft() {
    if (!selected || busy.current) return;
    busy.current = true;
    setDeleting(true);
    setError("");
    try {
      await axios.delete(`/api/listing-drafts/${selected.id}`, { data: { revision: selected.revision } });
      setRemoved((current) => new Set(current).add(selected.id));
      closeConfirmation(true);
      setNotice("Draft deleted.");
    } catch (failure) {
      setError(getApiErrorMessage(failure, "Could not delete this draft."));
    } finally {
      busy.current = false;
      setDeleting(false);
    }
  }

  return (
    <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-balance text-xl font-bold">
            Saved Drafts <span className="tabular-nums text-slate-500">({formatAmount(drafts.length)})</span>
          </h2>
          <p className="mt-1 text-sm text-slate-500">Only you can see these drafts. Continue where you left off before submitting a vehicle.</p>
        </div>
        <Link ref={startDraftLink} href="/submit-listing" className={`${focusRing} touch-manipulation rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold hover:bg-slate-100`}>
          Start a New Draft
        </Link>
      </div>

      <p role="status" className={notice ? "mt-4 text-sm text-emerald-800" : "sr-only"}>{notice}</p>
      {drafts.length ? (
        <ul className="mt-4 divide-y divide-slate-100">
          {drafts.map((draft) => (
            <li key={draft.id} className="-mx-1 flex flex-wrap items-center justify-between gap-3 px-1 py-4 [content-visibility:auto] [contain-intrinsic-size:auto_6rem]">
              <div className="min-w-0">
                <h3 className="break-words font-semibold">{draft.title}</h3>
                <p className="mt-1 text-xs tabular-nums text-slate-500">
                  {formatAmount(draft.photoCount)} {draft.photoCount === 1 ? "photo" : "photos"} · Saved{" "}
                  <time dateTime={draft.updatedAt}>{new Date(draft.updatedAt).toLocaleString("en-US", { timeZone: "UTC" })} UTC</time>
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Link href={`/submit-listing?draft=${draft.id}`} className={`${focusRing} touch-manipulation rounded-lg bg-slate-950 px-3 py-2 text-sm font-bold text-white hover:bg-slate-800`}>
                  Resume Draft
                </Link>
                <button
                  type="button"
                  onClick={(event) => openConfirmation(draft, event.currentTarget)}
                  className={`${focusRing} touch-manipulation rounded-sm text-sm font-semibold text-slate-600 underline hover:text-rose-800`}
                >
                  Delete Draft<span className="sr-only">: {draft.title}</span>
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-5 text-sm text-slate-500">No saved drafts yet. Your next vehicle submission will save here as you work.</p>
      )}

      <dialog
        ref={dialog}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
        onCancel={(event) => {
          event.preventDefault();
          if (!busy.current) closeConfirmation();
        }}
        className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-sm overflow-y-auto overscroll-contain rounded-xl bg-white p-5 text-slate-950 shadow-xl backdrop:bg-black/60 sm:p-6"
      >
        <h3 id={`${id}-title`} className="text-balance text-lg font-bold">Delete This Draft?</h3>
        <p id={`${id}-description`} className="mt-2 break-words text-sm text-slate-600">
          You’ll lose all saved changes to <strong>{selected?.title}</strong>.
        </p>
        {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error} Refresh this page if the draft changed elsewhere.</p>}
        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <button
            ref={cancelButton}
            type="button"
            aria-disabled={deleting}
            onClick={() => { if (!busy.current) closeConfirmation(); }}
            className={`${focusRing} touch-manipulation rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold hover:bg-slate-100 aria-disabled:opacity-50`}
          >
            Cancel
          </button>
          <button
            type="button"
            aria-disabled={deleting}
            onClick={() => void deleteDraft()}
            className={`${focusRing} inline-flex touch-manipulation items-center gap-2 rounded-lg bg-rose-700 px-3 py-2 text-sm font-bold text-white hover:bg-rose-800 aria-disabled:opacity-50`}
          >
            {deleting ? <><FiLoader aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> Deleting…</> : "Delete Draft"}
          </button>
        </div>
      </dialog>
    </section>
  );
}
