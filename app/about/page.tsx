import type { Metadata } from "next";
import Link from "next/link";
import {
  FiArrowRight,
  FiCheck,
  FiEye,
  FiHeart,
  FiMessageCircle,
  FiShield,
  FiTrendingUp,
} from "react-icons/fi";

export const metadata: Metadata = {
  title: "About Bidlane",
  description:
    "Bidlane is an enthusiast-first marketplace for discovering, buying, and selling exceptional vehicles.",
};

const values = [
  {
    icon: FiEye,
    title: "Clarity at every turn",
    description:
      "The details that matter should be easy to find. Clear listings and visible auction activity help everyone bid with confidence.",
  },
  {
    icon: FiHeart,
    title: "Enthusiasm comes first",
    description:
      "Great cars are more than inventory. We make room for the history, character, and stories that make each vehicle special.",
  },
  {
    icon: FiShield,
    title: "A fair, focused marketplace",
    description:
      "Straightforward tools and a considered auction experience keep attention where it belongs: on the car and the community.",
  },
];

const journey = [
  {
    number: "01",
    title: "Discover something special",
    description:
      "Explore live and upcoming auctions, dig into the details, and save the vehicles that catch your eye.",
  },
  {
    number: "02",
    title: "Join the conversation",
    description:
      "Ask questions, follow the bidding, and connect around the knowledge that makes enthusiast cars interesting.",
  },
  {
    number: "03",
    title: "Make your move",
    description:
      "Bid when the right car comes along—or bring your own vehicle to an audience that understands it.",
  },
];

export default function AboutPage() {
  return (
    <main className="overflow-hidden bg-stone-50 pt-16">
      <section className="relative bg-slate-950 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_18%,rgba(245,158,11,0.20),transparent_31%)]" />
        <div className="absolute -bottom-32 -left-32 h-72 w-72 rounded-full border border-white/[0.06]" />
        <div className="relative mx-auto max-w-6xl px-5 py-14 sm:px-6 lg:px-8 lg:py-20">
          <div className="max-w-4xl">
            <p className="mb-5 flex items-center gap-3 text-xs font-bold uppercase tracking-[0.22em] text-amber-400">
              <span className="h-px w-8 bg-amber-400" /> About Bidlane
            </p>
            <h1 className="text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              Built for people who never see a car as
              <span className="text-amber-400"> just a car.</span>
            </h1>
            <p className="mt-7 max-w-2xl text-base leading-8 text-slate-300 sm:text-lg">
              Bidlane brings exceptional vehicles and passionate people together
              in one focused auction marketplace—made for the thrill of the find
              and the confidence to make it yours.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                href="/live/listings"
                className="inline-flex items-center gap-2 rounded-full bg-amber-400 px-6 py-3 text-sm font-bold text-slate-950 transition hover:bg-amber-300"
              >
                Explore live auctions <FiArrowRight aria-hidden="true" />
              </Link>
              <Link
                href="/submit-listing"
                className="rounded-full border border-white/25 px-6 py-3 text-sm font-semibold transition hover:border-white/60 hover:bg-white/10"
              >
                Sell your vehicle
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-12 px-5 py-20 sm:px-6 lg:grid-cols-[0.72fr_1.28fr] lg:gap-20 lg:px-8 lg:py-28">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-600">
            Why we&apos;re here
          </p>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
            The right car deserves the right room.
          </h2>
        </div>
        <div className="space-y-6 text-base leading-8 text-slate-600 sm:text-lg">
          <p>
            Buying or selling an enthusiast vehicle should feel exciting, informed,
            and personal. Too often, the story gets buried under clutter and the
            experience becomes harder than it needs to be.
          </p>
          <p>
            BidLane is our answer: a purpose-built place where a vehicle can be
            properly presented, questions can be asked openly, and every bidder can
            follow the action from the first look to the final call.
          </p>
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm font-semibold leading-6 text-slate-800">
            <FiCheck className="mt-1 shrink-0 text-amber-600" aria-hidden="true" />
            A simpler experience for sellers. A more rewarding hunt for buyers.
            A better place for remarkable cars to change hands.
          </div>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-6 lg:px-8 lg:py-24">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-600">
              What guides us
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
              Designed around trust and shared passion.
            </h2>
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {values.map(({ icon: Icon, title, description }) => (
              <article
                key={title}
                className="rounded-2xl border border-slate-200 bg-stone-50 p-7 transition hover:-translate-y-1 hover:border-amber-300 hover:shadow-lg hover:shadow-slate-900/5"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-950 text-amber-400">
                  <Icon size={20} aria-hidden="true" />
                </div>
                <h3 className="mt-6 text-xl font-bold tracking-tight text-slate-950">
                  {title}
                </h3>
                <p className="mt-3 text-sm leading-7 text-slate-600">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-20 sm:px-6 lg:px-8 lg:py-28">
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-600">
              The Bidlane experience
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
              From first glance to final bid.
            </h2>
            <div className="mt-7 flex gap-3 text-slate-500">
              <FiTrendingUp size={21} aria-hidden="true" />
              <FiMessageCircle size={21} aria-hidden="true" />
              <FiHeart size={21} aria-hidden="true" />
            </div>
          </div>
          <ol className="divide-y divide-slate-200 border-y border-slate-200">
            {journey.map((item) => (
              <li key={item.number} className="grid gap-3 py-7 sm:grid-cols-[4rem_1fr]">
                <span className="font-mono text-sm font-bold text-amber-600">
                  {item.number}
                </span>
                <div>
                  <h3 className="text-xl font-bold tracking-tight text-slate-950">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-7 text-slate-600">
                    {item.description}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="px-5 pb-20 sm:px-6 lg:px-8 lg:pb-28">
        <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-amber-400 px-6 py-12 sm:px-10 lg:flex lg:items-center lg:justify-between lg:px-14 lg:py-14">
          <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full border-[40px] border-white/20" />
          <div className="relative max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-700">
              Your next great story
            </p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
              It might already be on the block.
            </h2>
          </div>
          <Link
            href="/live/listings"
            className="relative mt-7 inline-flex items-center gap-2 rounded-full bg-slate-950 px-6 py-3 text-sm font-bold text-white transition hover:bg-slate-800 lg:mt-0"
          >
            Browse auctions <FiArrowRight aria-hidden="true" />
          </Link>
        </div>
      </section>
    </main>
  );
}
