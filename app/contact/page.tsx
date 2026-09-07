import type { Metadata } from "next";
import Link from "next/link";
import {
  FiArrowRight,
  FiClock,
  FiHelpCircle,
  FiMail,
  FiMessageCircle,
  FiTag,
} from "react-icons/fi";

import ContactForm from "./ContactForm";

export const metadata: Metadata = {
  title: "Contact Bidlane",
  description:
    "Get in touch with the Bidlane team for auction, buying, selling, or account support.",
};

const contactReasons = [
  {
    icon: FiTag,
    title: "Selling a vehicle",
    description:
      "Questions about submitting, presenting, or preparing your car for auction.",
  },
  {
    icon: FiMessageCircle,
    title: "Buying & bidding",
    description:
      "Help with an auction, your bids, or what happens after the final call.",
  },
  {
    icon: FiHelpCircle,
    title: "Everything else",
    description:
      "Account questions, partnerships, feedback, or anything else on your mind.",
  },
];

export default function ContactPage() {
  return (
    <main className="overflow-hidden bg-stone-50 pt-16">
      <section className="relative bg-slate-950 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_20%,rgba(245,158,11,0.22),transparent_30%)]" />
        <div className="absolute -bottom-28 -left-28 h-64 w-64 rounded-full border border-white/[0.06]" />
        <div className="relative mx-auto max-w-6xl px-5 py-14 sm:px-6 lg:px-8 lg:py-20">
          <p className="mb-5 flex items-center gap-3 text-xs font-bold uppercase tracking-[0.22em] text-amber-400">
            <span className="h-px w-8 bg-amber-400" /> Contact BidLane
          </p>
          <h1 className="max-w-4xl text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
            Let&apos;s get you back in the
            <span className="text-amber-400"> driver&apos;s seat.</span>
          </h1>
          <p className="mt-7 max-w-2xl text-base leading-8 text-slate-300 sm:text-lg">
            Whether you&apos;re eyeing your next car, listing one you love, or just
            need a hand, tell us what&apos;s going on. A real person will point you
            in the right direction.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="grid gap-10 lg:grid-cols-[0.75fr_1.25fr] lg:gap-16">
          <aside>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-600">
              We&apos;re here to help
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950">
              Start with a message.
            </h2>
            <p className="mt-4 max-w-md text-sm leading-7 text-slate-600">
              Share a few details and we&apos;ll make sure your note reaches the
              right person on our team.
            </p>

            <div className="mt-8 space-y-4">
              <a
                href="mailto:support@bidlane.com"
                className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-amber-300 hover:shadow-lg hover:shadow-slate-900/5"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-slate-950 text-amber-400">
                  <FiMail size={19} aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Email us directly
                  </span>
                  <span className="mt-1 block text-sm font-bold text-slate-950 group-hover:text-amber-600">
                    support@bidlane.com
                  </span>
                </span>
              </a>

              <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-700">
                  <FiClock size={19} aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Typical response
                  </span>
                  <span className="mt-1 block text-sm font-bold text-slate-950">
                    Within one business day
                  </span>
                </span>
              </div>
            </div>

            <p className="mt-8 text-sm text-slate-500">
              Looking for a quick answer?{" "}
              <Link
                href="/faq"
                className="inline-flex items-center gap-1 font-bold text-slate-950 underline decoration-amber-400 decoration-2 underline-offset-4"
              >
                Visit our FAQ <FiArrowRight aria-hidden="true" />
              </Link>
            </p>
          </aside>

          <ContactForm />
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-600">
              What can we help with?
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
              Every question has a lane.
            </h2>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {contactReasons.map(({ icon: Icon, title, description }) => (
              <article
                key={title}
                className="rounded-2xl border border-slate-200 bg-stone-50 p-6"
              >
                <Icon className="text-amber-600" size={22} aria-hidden="true" />
                <h3 className="mt-5 text-lg font-bold text-slate-950">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
