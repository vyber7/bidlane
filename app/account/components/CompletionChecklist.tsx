"use client";

import { useEffect, useRef, useState } from "react";
import { FiCheckCircle } from "react-icons/fi";
import {
  completedStepCount,
  completionSteps,
  type CompletionStep,
  type TransactionCompletion,
  type TransactionRole,
} from "@/app/libs/transaction-completion";

type Props = {
  listingId: string;
  role: TransactionRole;
  initialCompletion: TransactionCompletion;
};

async function readResponse(response: Response): Promise<TransactionCompletion> {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Unable to update the checklist. Please try again.");
  return body.completion;
}

export default function CompletionChecklist({ listingId, role, initialCompletion }: Props) {
  const [completion, setCompletion] = useState(initialCompletion);
  const [saving, setSaving] = useState<CompletionStep | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const busy = useRef(false);
  const sequence = useRef(0);
  const endpoint = `/api/listing/${listingId}/completion`;
  const counterparty = role === "buyer" ? "seller" : "buyer";
  const count = completedStepCount(completion);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const refresh = async () => {
      if (busy.current || document.visibilityState === "hidden") return;
      const version = ++sequence.current;
      try {
        const result = await readResponse(await fetch(endpoint, { cache: "no-store", signal: controller.signal }));
        if (active && version === sequence.current) {
          setCompletion(result);
          setError(null);
        }
      } catch {
        if (active && version === sequence.current) setError("Unable to refresh shared progress. Your last loaded checklist is shown. Refresh the page to try again.");
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 20_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [endpoint]);

  async function confirm(step: CompletionStep, completed: boolean) {
    if (busy.current) return;
    busy.current = true;
    const version = ++sequence.current;
    setSaving(step);
    setError(null);
    setNotice("");
    try {
      const result = await readResponse(await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step, completed }),
      }));
      if (version === sequence.current) {
        setCompletion(result);
        setNotice(completed ? "Your confirmation was saved and shared." : "Your confirmation was removed.");
      }
    } catch (failure) {
      if (version === sequence.current) setError(failure instanceof Error ? failure.message : "Unable to save your confirmation. Please try again.");
    } finally {
      busy.current = false;
      setSaving(null);
    }
  }

  return (
    <section className="mt-5 rounded-xl border border-gray-200 bg-white p-4 sm:p-5" aria-label="Shared completion checklist">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-bold text-gray-950">Completion checklist</h4>
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${count === 3 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
          {count === 3 ? "Transaction complete" : `${count} of 3 steps complete`}
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-gray-500">Shared with your {counterparty}. Each step is complete when you both confirm it. Confirmations track your agreement; payment and handoff are arranged directly.</p>
      <ul className="mt-2 divide-y divide-gray-100">
        {completionSteps.map(({ id, title, description }) => {
          const own = completion[id][role];
          const other = completion[id][counterparty];
          return (
            <li key={id} className="py-4 last:pb-0">
              <div className="flex items-center gap-2">
                <FiCheckCircle aria-hidden="true" className={own && other ? "text-emerald-600" : "text-gray-300"} />
                <h5 className="text-sm font-bold text-gray-950">{title}</h5>
                {own && other && <span className="text-xs font-semibold text-emerald-700">Complete</span>}
              </div>
              <p className="mt-1 text-xs leading-5 text-gray-500">{description}</p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-gray-900">
                  <input
                    type="checkbox"
                    checked={Boolean(own)}
                    disabled={saving !== null}
                    onChange={(event) => void confirm(id, event.target.checked)}
                    aria-label={`Confirm ${title.toLowerCase()} as ${role}`}
                    className="h-4 w-4 rounded border-gray-300 text-gray-950 focus:ring-gray-900 disabled:cursor-wait"
                  />
                  {saving === id ? "Saving…" : own ? "You confirmed" : "Confirm complete"}
                </label>
                <span className={`text-xs ${other ? "text-emerald-700" : "text-gray-500"}`}>
                  {other ? `${counterparty === "buyer" ? "Buyer" : "Seller"} confirmed` : `Waiting for ${counterparty}`}
                </span>
              </div>
              {(own || other) && <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                {([role, counterparty] as const).map((party) => {
                  const at = completion[id][party];
                  return at ? <span key={party}>{party === role ? "You" : party === "buyer" ? "Buyer" : "Seller"}: <time dateTime={at}>{new Date(at).toLocaleString("en-US", { timeZone: "UTC" })} UTC</time></span> : null;
                })}
              </div>}
            </li>
          );
        })}
      </ul>
      <p role="status" className="mt-3 text-xs text-gray-600">{notice || "Progress refreshes automatically. Uncheck your confirmation to reopen a step."}</p>
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    </section>
  );
}
