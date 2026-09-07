"use client";

import { FormEvent, useState } from "react";
import { FiArrowUpRight, FiSend } from "react-icons/fi";

const fieldClass =
  "mt-2 w-full rounded-xl border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-950 placeholder:text-slate-400 focus:border-amber-500 focus:bg-white focus:ring-amber-500";

export default function ContactForm() {
  const [opening, setOpening] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOpening(true);

    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") ?? "");
    const email = String(data.get("email") ?? "");
    const topic = String(data.get("topic") ?? "General question");
    const message = String(data.get("message") ?? "");
    const subject = encodeURIComponent(`${topic} — message from ${name}`);
    const body = encodeURIComponent(
      `Name: ${name}\nEmail: ${email}\nTopic: ${topic}\n\n${message}`,
    );

    window.location.href = `mailto:support@bidlane.com?subject=${subject}&body=${body}`;
    window.setTimeout(() => setOpening(false), 1000);
  }

  return (
    <form
      onSubmit={handleSubmit}
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

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <label className="text-sm font-bold text-slate-800">
          Your name
          <input
            required
            autoComplete="name"
            name="name"
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
          <option>Selling a vehicle</option>
          <option>Buying or bidding</option>
          <option>Account support</option>
          <option>Partnerships and press</option>
          <option>General question</option>
        </select>
      </label>

      <label className="mt-5 block text-sm font-bold text-slate-800">
        Message
        <textarea
          required
          name="message"
          rows={6}
          placeholder="Tell us how we can help..."
          className={`${fieldClass} resize-y`}
        />
      </label>

      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-xs text-xs leading-5 text-slate-400">
          Submitting opens your email app with this message ready to send.
        </p>
        <button
          type="submit"
          disabled={opening}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-slate-950 px-6 py-3 text-sm font-bold text-white transition hover:bg-amber-400 hover:text-slate-950 disabled:cursor-wait disabled:opacity-70"
        >
          {opening ? "Opening email…" : "Prepare message"}
          <FiArrowUpRight aria-hidden="true" />
        </button>
      </div>
    </form>
  );
}
