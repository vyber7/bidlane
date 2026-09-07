import type { Metadata } from "next";
import Link from "next/link";
import {
  FiArrowRight,
  FiCheck,
  FiChevronDown,
  FiClock,
  FiEye,
  FiMessageCircle,
  FiSearch,
  FiShield,
  FiTag,
} from "react-icons/fi";

export const metadata: Metadata = {
  title: "How it works | Bidlane",
  description:
    "Learn how to browse, bid, and sell vehicles on Bidlane, with answers to common auction questions.",
};

const steps = [
  {
    number: "01",
    icon: FiSearch,
    title: "Find your next car",
    description:
      "Browse live and upcoming auctions. Review the photos, vehicle details, seller notes, and community questions.",
  },
  {
    number: "02",
    icon: FiMessageCircle,
    title: "Ask, watch, and bid",
    description:
      "Sign in to join the conversation, save a listing to your watchlist, and place your bid while the auction is live.",
  },
  {
    number: "03",
    icon: FiTag,
    title: "Finish the deal",
    description:
      "When time runs out, the winning buyer and seller can move forward with confidence using the listing details and auction record.",
  },
];

const faqs = [
  {
    question: "Do I need an account to browse auctions?",
    answer:
      "No. Anyone can explore listings and follow auction activity. You’ll need to sign in to bid, comment, save vehicles, or submit a listing.",
  },
  {
    question: "What should I review before placing a bid?",
    answer:
      "Read the full description, study every photo, review the auction activity, and ask the seller about anything that is unclear. A bid should reflect your own assessment of the vehicle.",
  },
  {
    question: "Can I change or cancel a bid?",
    answer:
      "Treat every bid as a serious commitment. Double-check the amount and listing before you submit. If you make an obvious error, contact Bidlane support as soon as possible.",
  },
  {
    question: "How does the auction timer work?",
    answer:
      "Each listing shows its remaining time. Keep the listing open near the end and watch for updates so you don’t miss late auction activity.",
  },
  {
    question: "How do I sell a vehicle on Bidlane?",
    answer:
      "Start with the vehicle submission form. Share accurate specifications, a detailed description, and clear photos. A complete, honest presentation helps bidders make informed decisions.",
  },
  {
    question: "What happens after an auction ends?",
    answer:
      "The final result is recorded on Bidlane. The buyer and seller are responsible for confirming the vehicle, payment, paperwork, pickup, and any shipping arrangements before completing the transaction.",
  },
];

export default function FAQPage() {
  return (
    <main className="overflow-hidden bg-stone-50 pt-16">
      <section className="relative bg-slate-950 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_18%,rgba(245,158,11,0.22),transparent_30%)]" />
        <div className="relative mx-auto max-w-6xl px-5 py-16 sm:px-6 lg:px-8 lg:py-24">
          <div className="max-w-3xl">
            <p className="mb-5 flex items-center gap-3 text-xs font-bold uppercase tracking-[0.22em] text-amber-400">
              <span className="h-px w-8 bg-amber-400" /> How Bidlane works
            </p>
            <h1 className="text-4xl font-black leading-[1.04] tracking-tight sm:text-5xl lg:text-6xl">
              From first look to
              <span className="text-amber-400"> final call.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-slate-300 sm:text-lg">
              Everything you need to find, bid on, or sell an enthusiast vehicle—without losing the thrill of the auction.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-600">For buyers</p>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Three steps to the driver&apos;s seat.</h2>
          </div>
          <Link href="/live/listings" className="inline-flex items-center gap-2 text-sm font-bold text-slate-700 transition hover:text-amber-600">
            See what&apos;s live <FiArrowRight aria-hidden="true" />
          </Link>
        </div>

        <ol className="relative mt-11 grid gap-5 lg:grid-cols-3">
          <div className="absolute left-[16%] right-[16%] top-10 hidden h-px bg-slate-200 lg:block" aria-hidden="true" />
          {steps.map(({ number, icon: Icon, title, description }) => (
            <li key={number} className="relative rounded-2xl border border-slate-200 bg-white p-7 shadow-sm shadow-slate-900/[0.03]">
              <div className="relative flex items-center justify-between">
                <span className="grid h-12 w-12 place-items-center rounded-full bg-slate-950 text-amber-400 ring-8 ring-stone-50">
                  <Icon size={20} aria-hidden="true" />
                </span>
                <span className="font-mono text-sm font-bold text-amber-600">{number}</span>
              </div>
              <h3 className="mt-7 text-xl font-bold tracking-tight text-slate-950">{title}</h3>
              <p className="mt-3 text-sm leading-7 text-slate-600">{description}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 py-16 sm:px-6 lg:grid-cols-[0.7fr_1.3fr] lg:gap-20 lg:px-8 lg:py-24">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-600">For sellers</p>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Give your car the presentation it deserves.</h2>
            <p className="mt-5 text-base leading-7 text-slate-600">Strong auctions begin with honest details and a story worth sharing.</p>
            <Link href="/submit-listing" className="mt-7 inline-flex items-center gap-2 rounded-full bg-slate-950 px-6 py-3 text-sm font-bold text-white transition hover:bg-amber-400 hover:text-slate-950">
              Submit your vehicle <FiArrowRight aria-hidden="true" />
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              [FiEye, "Show the whole car", "Use clear photos and disclose condition, history, and known flaws."],
              [FiMessageCircle, "Stay in the conversation", "Answer bidder questions promptly and add useful context as the auction develops."],
              [FiClock, "Follow the finish", "Keep an eye on your listing through the final minutes and be ready for next steps."],
              [FiShield, "Be clear and accurate", "Make sure the listing matches the vehicle so buyers can bid with confidence."],
            ].map(([Icon, title, description]) => {
              const ItemIcon = Icon as typeof FiEye;
              return (
                <article key={title as string} className="rounded-2xl bg-stone-50 p-6">
                  <ItemIcon className="text-xl text-amber-600" aria-hidden="true" />
                  <h3 className="mt-4 font-bold text-slate-950">{title as string}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{description as string}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-5 py-16 sm:px-6 lg:py-24">
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-600">Good to know</p>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Frequently asked questions</h2>
        </div>
        <div className="mt-10 divide-y divide-slate-200 border-y border-slate-200">
          {faqs.map((item, index) => (
            <details key={item.question} className="group" open={index === 0}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-5 py-6 text-left text-base font-bold text-slate-950 marker:content-none sm:text-lg">
                {item.question}
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600 transition group-open:rotate-180 group-open:bg-amber-400 group-open:text-slate-950">
                  <FiChevronDown aria-hidden="true" />
                </span>
              </summary>
              <p className="max-w-3xl pb-6 pr-12 text-sm leading-7 text-slate-600 sm:text-base">{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="px-5 pb-20 sm:px-6 lg:px-8 lg:pb-28">
        <div className="mx-auto flex max-w-6xl flex-col gap-7 overflow-hidden rounded-3xl bg-amber-400 px-6 py-10 sm:px-10 md:flex-row md:items-center md:justify-between lg:px-14">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-700"><FiCheck aria-hidden="true" /> Ready when you are</div>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">Find the car that earns your bid.</h2>
          </div>
          <Link href="/live/listings" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-slate-950 px-6 py-3 text-sm font-bold text-white transition hover:bg-slate-800">
            Browse live auctions <FiArrowRight aria-hidden="true" />
          </Link>
        </div>
      </section>
    </main>
  );
}
