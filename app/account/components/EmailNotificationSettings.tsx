"use client";

import { useState } from "react";
import axios from "axios";
import { getApiErrorMessage } from "@/app/utils/api-error";

export default function EmailNotificationSettings({
  initialEnabled,
}: {
  initialEnabled: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saved, setSaved] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  return (
    <section
      className="mb-5 rounded-xl border border-slate-200 bg-white p-5 sm:p-6"
      aria-labelledby="email-settings-title"
    >
      <h2
        id="email-settings-title"
        className="text-lg font-bold text-slate-950"
      >
        Email notifications
      </h2>
      <p className="mt-1 text-sm leading-6 text-slate-600">
        Get an email when another bidder takes the lead, even when you’re away
        from BidLane.
      </p>
      <form
        className="mt-4 space-y-3"
        onSubmit={async (event) => {
          event.preventDefault();
          if (saving || enabled === saved) return;
          setSaving(true);
          setError(null);
          setConfirmation(null);
          try {
            const response = await axios.patch<{
              outbidEmailsEnabled: boolean;
            }>("/api/account/notification-preferences", {
              outbidEmailsEnabled: enabled,
            });
            setSaved(response.data.outbidEmailsEnabled);
            setEnabled(response.data.outbidEmailsEnabled);
            setConfirmation("Email preferences saved.");
          } catch (error) {
            setError(
              getApiErrorMessage(error, "Unable to save email preferences."),
            );
          } finally {
            setSaving(false);
          }
        }}
      >
        <label className="flex items-start gap-3 text-sm font-semibold text-slate-800">
          <input
            type="checkbox"
            checked={enabled}
            disabled={saving}
            onChange={(event) => {
              setEnabled(event.target.checked);
              setConfirmation(null);
            }}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-amber-500 focus:ring-amber-500"
          />
          Email me when I’m outbid
        </label>
        <p className="text-xs leading-5 text-slate-500">
          Turning this off also stops queued outbid emails. Your in-app
          notifications stay available.
        </p>
        <button
          type="submit"
          disabled={saving || enabled === saved}
          className="rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save email preferences"}
        </button>
        {error && (
          <p role="alert" className="text-sm text-rose-700">
            {error}
          </p>
        )}
        {confirmation && (
          <p role="status" className="text-sm text-emerald-800">
            {confirmation}
          </p>
        )}
      </form>
    </section>
  );
}
