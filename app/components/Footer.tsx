import Link from "next/link";
import {
  FiArrowRight,
  FiCheckCircle,
  FiClock,
  FiShield,
  FiTag,
  FiZap,
} from "react-icons/fi";

const auctionLinks = [
  { label: "Live auctions", href: "/?status=live#auctions", icon: FiZap },
  { label: "No reserve", href: "/?status=no_reserve#auctions", icon: FiTag },
  { label: "Coming soon", href: "/?status=upcoming#auctions", icon: FiClock },
  { label: "Auction results", href: "/?status=ended#auctions", icon: FiCheckCircle },
];

const companyLinks = [
  { label: "About Bidlane", href: "/about" },
  { label: "How it works", href: "/faq" },
  { label: "Contact us", href: "/contact" },
];

const Footer = () => {
  return (
    <footer className="relative overflow-hidden bg-slate-950 text-white">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-400/80 to-transparent" />
      <div className="pointer-events-none absolute -right-32 -top-32 h-80 w-80 rounded-full bg-amber-400/[0.07] blur-3xl" />

      <div className="relative mx-auto max-w-6xl px-5 pb-8 pt-12 sm:px-6 lg:px-8 lg:pt-16">
        <div className="grid gap-12 border-b border-white/10 pb-12 lg:grid-cols-[1.35fr_0.65fr_0.65fr] lg:gap-16">
          <div className="max-w-md">
            <Link
              href="/"
              aria-label="BidLane home"
              className="inline-flex items-center gap-3 rounded-xl focus-visible:outline-amber-400"
            >
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-400 text-lg font-black text-slate-950 shadow-lg shadow-amber-400/10">
                B
              </span>
              <span translate="no" className="text-xl font-black tracking-tight">
                Bid<span className="text-amber-400">Lane</span>
              </span>
            </Link>
            <p className="mt-5 text-sm leading-6 text-slate-400 sm:text-base">
              A better lane to exceptional cars. Discover enthusiast vehicles,
              bid with confidence, and follow every auction through the final call.
            </p>
            <div className="mt-6 flex items-center gap-2 text-sm font-semibold text-slate-300">
              <FiShield className="text-amber-400" aria-hidden="true" />
              Built for confident buyers and sellers
            </div>
          </div>

          <nav aria-labelledby="footer-auctions-heading">
            <h2 id="footer-auctions-heading" className="text-xs font-bold uppercase tracking-[0.18em] text-amber-400">
              Auctions
            </h2>
            <ul className="mt-5 space-y-3.5">
              {auctionLinks.map(({ label, href, icon: Icon }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="group inline-flex items-center gap-2 text-sm font-medium text-slate-400 transition hover:text-white focus-visible:outline-amber-400"
                  >
                    {Icon && (
                      <Icon
                        aria-hidden="true"
                        className={
                          href === "/?status=live#auctions"
                            ? "text-amber-400"
                            : "text-slate-600 transition group-hover:text-slate-400"
                        }
                      />
                    )}
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-labelledby="footer-company-heading">
            <h2 id="footer-company-heading" className="text-xs font-bold uppercase tracking-[0.18em] text-amber-400">
              Company
            </h2>
            <ul className="mt-5 space-y-3.5">
              {companyLinks.map(({ label, href }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="text-sm font-medium text-slate-400 transition hover:text-white focus-visible:outline-amber-400"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>

            <Link
              href="/submit-listing"
              className="mt-7 inline-flex items-center gap-2 rounded-full bg-amber-400 px-5 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
            >
              Sell Your Car
              <FiArrowRight aria-hidden="true" />
            </Link>
          </nav>
        </div>

        <div className="flex flex-col gap-4 pt-7 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <p suppressHydrationWarning>&copy; {new Date().getFullYear()} Bidlane. All rights reserved.</p>
          <div className="flex items-center gap-5">
            <Link href="/terms" className="transition hover:text-slate-300 focus-visible:outline-amber-400">
              Terms of service
            </Link>
            <Link href="/privacy" className="transition hover:text-slate-300 focus-visible:outline-amber-400">
              Privacy policy
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
