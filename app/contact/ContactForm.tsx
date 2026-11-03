"use client";

import { FormEvent, useRef, useState } from "react";
import axios from "axios";
import { getApiErrorMessage } from "@/app/utils/api-error";
import { contactLimits, contactTopics } from "@/app/schemas/contact";
import { FiArrowUpRight, FiSend } from "react-icons/fi";

const fieldClass =
  "mt-2 w-full rounded-xl border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-950 placeholder:text-slate-400 focus:border-amber-500 focus:bg-white focus:ring-amber-500";

export default function ContactForm() {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const submitting = useRef(false);
  const submissionId = useRef<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    submitting.current = true;
    setSending(true);
    setError(null);
    setSent(false);
    try {
      submissionId.current ??= crypto.randomUUID();
      await axios.post("/api/contact", {
        ...Object.fromEntries(data),
        submissionId: submissionId.current,
      });
      form.reset();
      submissionId.current = null;
      setSent(true);
    } catch (error) {
      setError(getApiErrorMessage(error, "We couldn’t send your message. Please try again or email support@bidlane.net."));
    } finally {
      submitting.current = false;
      setSending(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-busy={sending}
      className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/[0.06] sm:p-8"
    >
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-6">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-slate-950">
            Send us a note
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            All fields are required.
          </p>
        </div>
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-amber-400 text-slate-950">
          <FiSend aria-hidden="true" />
        </span>
      </div>

      {sent && <p role="status" className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">Message sent. Thanks for contacting BidLane.</p>}
      {error && <p role="alert" className="mt-5 rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
      <fieldset disabled={sending} className="min-w-0 border-0 p-0">
        <legend className="sr-only">Contact details and message</legend>
        <div hidden aria-hidden="true">
          <label>Website<input name="website" type="text" tabIndex={-1} autoComplete="off" maxLength={500} /></label>
        </div>
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <label className="text-sm font-bold text-slate-800">
            Your name
            <input
              required
              autoComplete="name"
              name="name"
              maxLength={contactLimits.name}
              type="text"
              placeholder="Alex Morgan"
              className={fieldClass}
            />
          </label>
          <label className="text-sm font-bold text-slate-800">
            Email address
            <input
              required
              autoComplete="email"
              name="email"
              maxLength={contactLimits.email}
              type="email"
              placeholder="alex@example.com"
              className={fieldClass}
            />
          </label>
        </div>

        <label className="mt-5 block text-sm font-bold text-slate-800">
          What can we help with?
          <select required name="topic" defaultValue="" className={fieldClass}>
            <option value="" disabled>
              Choose a topic
            </option>
            {contactTopics.map((topic) => <option key={topic}>{topic}</option>)}
          </select>
        </label>

        <label className="mt-5 block text-sm font-bold text-slate-800">
          Message
          <textarea
            required
            name="message"
            maxLength={contactLimits.message}
            rows={6}
            placeholder="Tell us how we can help..."
            className={`${fieldClass} resize-y`}
          />
        </label>

        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-xs text-xs leading-5 text-slate-400">
            Your message goes directly to our support team.
          </p>
          <button
            type="submit"
            disabled={sending}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-slate-950 px-6 py-3 text-sm font-bold text-white transition hover:bg-amber-400 hover:text-slate-950 disabled:cursor-wait disabled:opacity-70"
          >
            {sending ? "Sending…" : "Send message"}
            <FiArrowUpRight aria-hidden="true" />
          </button>
        </div>
      </fieldset>
    </form>
  );
}
