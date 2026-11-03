import type { Metadata } from "next";
import Link from "next/link";
import { auctionRules, handoffSteps } from "@/app/libs/auction-guidance";
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
  title: "BidLane | How it Works",
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
      "If the highest bid meets any reserve, the winner and seller can find the result and contact details in Account → Purchases & sales, then agree payment, paperwork, and pickup directly.",
  },
];

const faqs = [
  {
    question: "What does email verified mean?",
    answer: "The seller confirmed access to their account’s email inbox. It does not verify identity, vehicle ownership, documents, or condition. You can verify your own email from Account → Profile.",
  },
  {
    question: "Are vehicles and records vetted by BidLane?",
    answer: "BidLane does not currently independently inspect or authenticate vehicles, VINs, ownership, or uploaded records. Listing details and documents are seller-reported. Review the VIN or chassis number, request supporting records, and arrange any independent inspection before bidding. Public seller profiles show sold auction results, not confirmed payment or completed handoff.",
  },
  {
    question: "How do I share vehicle records?",
    answer: "Upload PDFs or images of service receipts, inspection reports, or vehicle history when creating a listing. You can also add or correct VIN and records from your listing before bidding opens. Remove personal information before uploading: records are public and cannot be changed through the app once bidding starts. Contact support if a published record exposes personal information.",
  },
  {
    question: "Do I need an account to browse auctions?",
    answer:
      "No. Anyone can explore listings and follow auction activity. You’ll need to sign in to bid, comment, save vehicles, or submit a listing.",
  },
  {
    question: "What should I review before placing a bid?",
    answer:
      "Read the description, specifications, service history, modifications, and known flaws. Study the photos, review the auction activity, and arrange any inspection or ask the seller questions before bidding. Seller-reported details are not independent verification.",
  },
  {
    question: "Can I change or cancel a bid?",
    answer:
      "You can edit the amount before confirming, but you cannot edit or cancel an accepted bid yourself. Confirming commits you to purchase at your bid amount if you win and any reserve is met. If you make an error, contact BidLane support; reporting it does not automatically cancel the bid.",
  },
  {
    question: "Does BidLane charge any platform fees?",
    answer:
      "BidLane currently charges no platform fees: no listing fees, buyer’s premiums, or seller commissions. The winning buyer and seller arrange vehicle payment directly. Inspection, transport, insurance, taxes, and registration are separate costs to agree before completing the sale.",
  },
  {
    question: "How does the auction timer work?",
    answer:
      "Each accepted bid with two minutes or less remaining resets the deadline to two minutes after that bid. More late bids can extend it again. Bids received at or after the deadline are rejected. When the countdown reaches zero, bidding closes while the result is finalized.",
  },
  {
    question: "What does reserve not met mean?",
    answer:
      "The highest accepted bid did not reach the seller’s minimum sale price, so the auction ended without a sale or winning buyer. An auction with no bids also ends without a sale. A no-reserve listing sells to its highest accepted bidder.",
  },
  {
    question: "How do I sell a vehicle on Bidlane?",
    answer:
      "Use the submission form to provide the vehicle’s specifications, description, service history, modifications, and known flaws. Add photos and review the preview. The listing starts as Coming soon; its seller then sets the starting bid, bid increment, and end time to open bidding. A reserve price is optional.",
  },
  {
    question: "What happens after an auction ends?",
    answer:
      "Check the listing’s finalized result and your in-app Notifications. If it sold, the winning buyer and seller can open Account → Purchases & sales to find the winning amount and each other’s contact details. Contact the other party to agree payment, documents, and pickup or transport. A sold result records the auction outcome; it does not confirm payment or vehicle delivery.",
  },
  {
    question: "Does BidLane arrange shipping or hold the vehicle payment?",
    answer:
      "The buyer and seller arrange vehicle payment, paperwork, pickup, and any transport directly. BidLane provides the auction result and contact details. Confirm the handoff and any carrier or insurance arrangements with the other party.",
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
            <nav aria-label="How it works sections" className="mt-7 flex flex-wrap gap-x-6 gap-y-3 text-sm font-semibold text-amber-400">
              <a href="#auction-rules" className="hover:text-amber-300">Bidding rules ↓</a>
              <a href="#after-auction" className="hover:text-amber-300">After the auction ↓</a>
              <a href="#fees" className="hover:text-amber-300">Payment & costs ↓</a>
            </nav>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-600">For buyers</p>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Three steps to the driver&apos;s seat.</h2>
          </div>
          <Link href="/?status=live#auctions" className="inline-flex items-center gap-2 text-sm font-bold text-slate-700 transition hover:text-amber-600">
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

      <section id="auction-rules" className="mx-auto max-w-6xl scroll-mt-24 px-5 pb-16 sm:px-6 lg:px-8 lg:pb-24">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-600">Before you bid</p>
        <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Know how the auction closes.</h2>
        <div className="mt-8 grid gap-5 lg:grid-cols-3">
          {auctionRules.map(({ title, description }) => <article key={title} className="rounded-2xl border border-slate-200 bg-white p-6"><h3 className="text-lg font-bold text-slate-950">{title}</h3><p className="mt-3 text-sm leading-7 text-slate-600">{description}</p></article>)}
        </div>
        <p className="mt-5 text-sm leading-6 text-slate-500">Read the listing and arrange any inspection before confirming. <Link href="/terms#bidding" className="font-semibold text-slate-900 underline decoration-amber-400 underline-offset-4">Review the bidding terms</Link>.</p>
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

      <section id="after-auction" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-16 sm:px-6 lg:px-8 lg:py-24">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-600">After the auction</p>
        <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Turn a winning bid into a handoff.</h2>
        <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-600">Once a sale is finalized, sign in and open <Link href="/account/shipments" className="font-bold text-slate-950 underline decoration-amber-400 underline-offset-4">Account → Purchases & sales</Link>. The winning buyer and seller can see the winning bid and each other’s contact details there. Check your in-app Notifications for the result.</p>
        <ol className="mt-8 grid gap-5 lg:grid-cols-3">
          {handoffSteps.map(({ title, description }, index) => <li key={title} className="rounded-2xl border border-slate-200 bg-white p-6"><span className="text-xs font-bold text-amber-600">Step {index + 1}</span><h3 className="mt-3 text-lg font-bold text-slate-950">{title}</h3><p className="mt-3 text-sm leading-7 text-slate-600">{description}</p></li>)}
        </ol>
        <p className="mt-5 text-sm leading-6 text-slate-500">If the reserve was not met or there were no bids, there is no sale to coordinate. If contact details are missing after a sold result, <Link href="/contact" className="font-semibold text-slate-900 underline decoration-amber-400 underline-offset-4">contact BidLane support</Link>.</p>
      </section>

      <section id="fees" className="scroll-mt-24 border-y border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-12 sm:px-6 lg:px-8">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-600">Payment & costs</p>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950">Know what you’re agreeing to.</h2>
          <div className="mt-7 grid gap-7 md:grid-cols-2">
            <div><h3 className="font-bold text-slate-950">No platform fees for now</h3><p className="mt-3 text-sm leading-7 text-slate-600">BidLane currently charges no listing fees, buyer’s premiums, or seller commissions. The winning buyer and seller arrange vehicle payment directly; BidLane does not process that payment.</p></div>
            <div><h3 className="font-bold text-slate-950">Costs beyond the winning bid</h3><p className="mt-3 text-sm leading-7 text-slate-600">Inspection, transport, insurance, taxes, and registration may add to the vehicle price. Agree who will handle these costs and the payment arrangements with the other party before completing the sale.</p></div>
          </div>
          <Link href="/contact" className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-slate-900 hover:text-amber-600">Questions about costs? Contact BidLane <FiArrowRight aria-hidden="true" /></Link>
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
          <Link href="/?status=live#auctions" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-slate-950 px-6 py-3 text-sm font-bold text-white transition hover:bg-slate-800">
            Browse live auctions <FiArrowRight aria-hidden="true" />
          </Link>
        </div>
      </section>
    </main>
  );
}
