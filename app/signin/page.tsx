import type { Metadata } from "next";
import Link from "next/link";
import { FiArrowLeft, FiArrowUpRight, FiHeart, FiMessageCircle, FiTrendingUp } from "react-icons/fi";
import AuthForm from "../(site)/components/AuthForm";

export const metadata: Metadata = {
  title: "BidLane | Sign In",
  description: "Sign in to Bidlane to follow your favorite cars and join the auction.",
};

const features = [
  { icon: FiHeart, title: "Keep your favorites close", description: "Save the cars that deserve a second look." },
  { icon: FiMessageCircle, title: "Be part of the conversation", description: "Ask questions and connect with fellow enthusiasts." },
  { icon: FiTrendingUp, title: "Make your next move", description: "Follow the bidding and find your next great drive." },
];

export default function SignIn() {
  return (
    <div className="flex min-h-screen flex-col bg-stone-50">
      <header className="border-b border-slate-200 bg-white">
        <nav aria-label="Sign-in navigation" className="mx-auto flex h-20 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
          <Link href="/" aria-label="BidLane home" className="inline-flex items-center gap-3 rounded-xl focus-visible:outline-amber-500">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-400 text-lg font-black text-slate-950">B</span>
            <span className="text-xl font-black tracking-tight text-slate-950">Bid<span className="text-amber-400">Lane</span></span>
          </Link>
          <Link href="/" className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-stone-100 hover:text-slate-950 focus-visible:outline-amber-500">
            <FiArrowLeft aria-hidden="true" /> Back to auctions
          </Link>
        </nav>
      </header>

      <div className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-8 px-5 py-8 sm:px-8 sm:py-12 lg:grid-cols-2 lg:gap-16">
        <section className="relative overflow-hidden rounded-3xl bg-slate-950 px-7 py-9 text-white sm:p-10 lg:py-14">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_90%_10%,rgba(245,158,11,0.20),transparent_45%)]" />
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-36 -right-36 h-96 w-96 rounded-full border-[48px] border-white/[0.03]" />
          <div className="relative">
            <p className="flex items-center gap-3 text-xs font-bold uppercase tracking-[0.22em] text-amber-400"><span className="h-px w-8 bg-amber-400" /> Your next chapter</p>
            <h2 className="mt-6 max-w-sm text-3xl font-black leading-[1.08] tracking-tight sm:text-4xl lg:text-5xl">Great cars.<br />Good company.<br /><span className="text-amber-400">You belong here.</span></h2>
            <p className="mt-5 max-w-sm text-sm leading-7 text-slate-300 sm:text-base">A place for the cars you love and the people who get it. Join the auction, and see where the road takes you.</p>
            <div className="mt-10 hidden space-y-6 lg:block">
              {features.map(({ icon: Icon, title, description }) => (
                <div key={title} className="flex gap-4">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-amber-400"><Icon size={18} aria-hidden="true" /></span>
                  <div><h3 className="text-sm font-bold">{title}</h3><p className="mt-1 text-sm leading-6 text-slate-400">{description}</p></div>
                </div>
              ))}
            </div>
            <Link href="/live/listings" className="mt-8 inline-flex items-center gap-2 rounded-sm text-sm font-semibold text-amber-400 transition hover:text-amber-300 focus-visible:outline-amber-400 lg:mt-10">Explore live auctions <FiArrowUpRight aria-hidden="true" /></Link>
          </div>
        </section>
        <section aria-label="Your Bidlane account" className="mx-auto w-full max-w-md py-3 lg:py-6">
          <AuthForm />
        </section>
      </div>

      <footer className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-5 pb-6 text-xs text-slate-500 sm:px-8">
        <p>For the love of the drive.</p>
        <div className="flex gap-5"><Link href="/privacy" className="hover:text-slate-950">Privacy</Link><Link href="/terms" className="hover:text-slate-950">Terms</Link><Link href="/contact" className="hover:text-slate-950">Need help?</Link></div>
      </footer>
    </div>
  );
}
