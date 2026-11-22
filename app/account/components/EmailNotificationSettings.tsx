"use client";

import { useRef, useState } from "react";
import axios from "axios";
import { FiLoader } from "react-icons/fi";
import useUnsavedChangesWarning from "@/app/hooks/useUnsavedChangesWarning";
import { getApiErrorMessage } from "@/app/utils/api-error";

export default function EmailNotificationSettings({
  initialEnabled,
  preference = "outbidEmailsEnabled",
}: {
  initialEnabled: boolean;
  preference?: "outbidEmailsEnabled" | "endingSoonEmailsEnabled";
}) {
  const endingSoon = preference === "endingSoonEmailsEnabled";
  const titleId = `${preference}-title`;
  const hintId = `${preference}-hint`;
  const errorId = `${preference}-error`;
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saved, setSaved] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const busy = useRef(false);
  const dirty = enabled !== saved;
  useUnsavedChangesWarning(dirty);
  return (
    <section
      className="mb-5 rounded-xl border border-slate-200 bg-white p-5 sm:p-6"
      aria-labelledby={titleId}
    >
      <h2
        id={titleId}
        className="text-balance text-lg font-bold text-slate-950"
      >
        {endingSoon ? "Ending-Soon Reminders" : "Email Notifications"}
      </h2>
      <p className="mt-1 text-sm leading-6 text-slate-600">
        {endingSoon ? "Get a reminder in the final hour of auctions you watch or bid on." : "Get an email when another bidder takes the lead, even when you’re away from BidLane."}
      </p>
      <form
        className="mt-4 space-y-3"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy.current || !dirty) return;
          busy.current = true;
          setSaving(true);
          setError(null);
          setConfirmation(null);
          try {
            const response = await axios.patch<Record<typeof preference, boolean>>("/api/account/notification-preferences", {
              [preference]: enabled,
            });
            setSaved(response.data[preference]);
            setEnabled(response.data[preference]);
            setConfirmation("Email preferences saved.");
          } catch (error) {
            setError(getApiErrorMessage(error, "Couldn’t save email preferences"));
          } finally {
            busy.current = false;
            setSaving(false);
          }
        }}
      >
        <label className="flex cursor-pointer items-start gap-3 text-sm font-semibold text-slate-800">
          <input
            type="checkbox"
            name={preference}
            checked={enabled}
            disabled={saving}
            aria-describedby={error ? `${hintId} ${errorId}` : hintId}
            onChange={(event) => {
              setEnabled(event.target.checked);
              setError(null);
              setConfirmation(null);
            }}
            className="mt-0.5 h-4 w-4 shrink-0 scroll-mt-[calc(var(--site-header-height)+1rem)] rounded border-slate-500 text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          />
          {endingSoon ? "Email me when auctions are ending soon" : "Email me when I’m outbid"}
        </label>
        <p id={hintId} className="text-xs leading-5 text-slate-500">
          Turning this off also stops queued {endingSoon ? "ending-soon" : "outbid"} emails. Your in-app notifications stay available.
        </p>
        {error && <p id={errorId} role="alert" className="text-sm text-rose-700">{error.replace(/\.$/, "")}. Try saving again.</p>}
        <button
          type="submit"
          disabled={saving || !dirty}
          className="inline-flex scroll-mt-[calc(var(--site-header-height)+1rem)] items-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? <><FiLoader aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> Saving…</> : "Save Email Preferences"}
        </button>
        <p role="status" className={confirmation ? "text-sm text-emerald-800" : "sr-only"}>{confirmation}</p>
      </form>
    </section>
  );
}
