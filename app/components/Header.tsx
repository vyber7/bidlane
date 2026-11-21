"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useId, useRef, useState } from "react";
import {
  FiChevronDown,
  FiCheckCircle,
  FiClock,
  FiMenu,
  FiTag,
  FiUser,
  FiX,
  FiZap,
} from "react-icons/fi";

import { readAuctionFilters, type AuctionStatus } from "@/app/libs/auction-filters";
import Avatar from "./Avatar";
import NotificationBell from "./NotificationBell";

const auctionLinks = [
  { name: "Live auctions", href: "/?status=live#auctions", icon: FiZap },
  { name: "No reserve", href: "/?status=no_reserve#auctions", icon: FiTag },
  { name: "Coming soon", href: "/?status=upcoming#auctions", icon: FiClock },
  { name: "Results", href: "/?status=ended#auctions", icon: FiCheckCircle },
];

const navLinks = [
  { name: "How it works", href: "/faq" },
  { name: "About", href: "/about" },
  { name: "Contact", href: "/contact" },
];

const profileLinks = [
  { name: "Profile", href: "/account/profile" },
  { name: "Notifications", href: "/account/notifications" },
  { name: "Listings", href: "/account/listings" },
  { name: "Bids & wins", href: "/account/bids-and-wins" },
  { name: "Purchases & sales", href: "/account/shipments" },
];

function Header({ auctionStatus = "LIVE" }: { auctionStatus?: AuctionStatus }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const user = session?.user;
  const id = useId();
  const [openPanel, setOpenPanel] = useState<"auctions" | "account" | "mobile" | null>(null);
  const auctionsOpen = openPanel === "auctions";
  const profileOpen = openPanel === "account";
  const mobileOpen = openPanel === "mobile";
  const headerRef = useRef<HTMLElement>(null);
  const auctionsTrigger = useRef<HTMLButtonElement>(null);
  const profileTrigger = useRef<HTMLButtonElement>(null);
  const mobileTrigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!openPanel) return;

    function closeOnOutsidePress(event: PointerEvent) {
      if (!headerRef.current?.contains(event.target as Node)) {
        setOpenPanel(null);
      }
    }

    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress);
  }, [openPanel]);

  const auctionsActive = pathname === "/";
  const auctionLinkActive = (href: string) => auctionsActive &&
    new URLSearchParams(href.split("?")[1]?.split("#")[0]).get("status") === auctionStatus.toLowerCase();
  const linkClass = (active: boolean) =>
    `rounded-lg px-3 py-2 text-sm font-semibold transition ${
      active
        ? "bg-slate-100 text-slate-950"
        : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
    }`;

  return (
    <header
      ref={headerRef}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpenPanel(null);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !openPanel) return;

        event.preventDefault();
        const trigger = { auctions: auctionsTrigger, account: profileTrigger, mobile: mobileTrigger }[openPanel];
        setOpenPanel(null);
        trigger.current?.focus();
      }}
      className="fixed inset-x-0 top-[var(--preview-banner-height)] z-[100] border-b border-slate-200/90 bg-white/95 shadow-[0_1px_2px_rgba(15,23,42,0.04)] backdrop-blur"
    >
      <nav
        className="mx-auto flex h-[var(--site-nav-height)] max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8"
        aria-label="Primary navigation"
      >
        <Link
          href="/"
          className="inline-flex shrink-0 items-center gap-3"
          aria-label="BidLane home"
        >
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-400 text-lg font-black text-slate-950 shadow-lg shadow-amber-400/10">
            B
          </span>
          <span className="text-xl font-black tracking-tight text-slate-950">
            Bid<span className="text-amber-400">Lane</span>
          </span>
        </Link>

        <div className="hidden items-center gap-1 lg:flex">
          <div className="relative">
            <button
              type="button"
              ref={auctionsTrigger}
              aria-expanded={auctionsOpen}
              aria-controls={`${id}-auctions`}
              onClick={() => setOpenPanel(auctionsOpen ? null : "auctions")}
              className={`${linkClass(auctionsActive)} flex items-center gap-1`}
            >
              Auctions
              <FiChevronDown aria-hidden="true" className={`transition-transform motion-reduce:transition-none ${auctionsOpen ? "rotate-180" : ""}`} />
            </button>
            <div
              id={`${id}-auctions`}
              hidden={!auctionsOpen}
              className="absolute left-0 top-[calc(100%+0.65rem)] w-52 rounded-xl border border-slate-200 bg-white p-2 shadow-xl shadow-slate-900/10"
            >
              {auctionLinks.map(({ name, href, icon: Icon }) => (
                <Link
                  href={href}
                  key={href}
                  onNavigate={() => setOpenPanel(null)}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
                    auctionLinkActive(href)
                      ? "bg-slate-100 text-slate-950"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                  }`}
                >
                  <Icon aria-hidden="true" className={href === "/?status=live#auctions" ? "text-amber-500" : "text-slate-400"} />
                  {name}
                </Link>
              ))}
            </div>
          </div>

          {navLinks.map(({ name, href }) => (
            <Link href={href} key={href} className={linkClass(pathname === href)}>
              {name}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {user && <NotificationBell />}
          <div className="hidden items-center gap-2 lg:flex">
            <Link
              href="/submit-listing"
              className="rounded-full bg-slate-950 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-amber-400 hover:text-slate-950"
            >
              Sell your car
            </Link>

            {user ? (
              <div className="relative">
                <button
                  type="button"
                  ref={profileTrigger}
                  aria-label="Account menu"
                  aria-expanded={profileOpen}
                  aria-controls={`${id}-account`}
                  onClick={() => setOpenPanel(profileOpen ? null : "account")}
                  className="flex items-center gap-2 rounded-full border border-slate-200 p-1.5 pr-2.5 transition hover:border-slate-400"
                >
                  <Avatar user={user} />
                  <FiChevronDown aria-hidden="true" className={`text-slate-500 transition-transform motion-reduce:transition-none ${profileOpen ? "rotate-180" : ""}`} />
                </button>
                <div
                  id={`${id}-account`}
                  hidden={!profileOpen}
                  className="absolute right-0 top-[calc(100%+0.65rem)] w-60 rounded-xl border border-slate-200 bg-white p-2 shadow-xl shadow-slate-900/10"
                >
                  <div className="border-b border-slate-100 px-3 py-2">
                    <p className="text-xs font-medium text-slate-600">Signed in as</p>
                    <p className="truncate text-sm font-semibold text-slate-800">{user.email}</p>
                  </div>
                  <div className="py-1">
                    {profileLinks.map(({ name, href }) => (
                      <Link
                        href={href}
                        key={href}
                        className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-950"
                      >
                        {name}
                      </Link>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => void signOut()}
                    className="w-full border-t border-slate-100 px-3 pt-3 text-left text-sm font-semibold text-red-600"
                  >
                    Sign out
                  </button>
                </div>
              </div>
            ) : (
              <Link
                href="/signin"
                className="rounded-full px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
              >
                Sign in
              </Link>
            )}
          </div>

          <button
            type="button"
            ref={mobileTrigger}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            aria-controls={`${id}-mobile`}
            onClick={() => setOpenPanel(mobileOpen ? null : "mobile")}
            className="rounded-lg border border-slate-200 p-2 text-xl text-slate-700 hover:bg-slate-100 lg:hidden"
          >
            {mobileOpen ? <FiX aria-hidden="true" /> : <FiMenu aria-hidden="true" />}
          </button>
        </div>
      </nav>

      <nav
        id={`${id}-mobile`}
        aria-label="Mobile navigation"
        hidden={!mobileOpen}
        className="max-h-[calc(100dvh-var(--site-header-height))] overflow-y-auto overscroll-y-contain border-t border-slate-200 bg-white px-4 py-4 lg:hidden"
      >
        {user && (
          <div className="mb-3 flex items-center gap-3 rounded-xl bg-slate-50 p-3">
            <Avatar user={user} />
            <div className="min-w-0">
              <p className="text-xs text-slate-600">Your account</p>
              <p className="truncate text-sm font-semibold text-slate-800">{user.email}</p>
            </div>
          </div>
        )}

        <div className="grid gap-1">
          <p className="px-3 pb-1 pt-3 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-600">Auctions</p>
          {auctionLinks.map(({ name, href, icon: Icon }) => (
            <Link href={href} key={href} onNavigate={() => setOpenPanel(null)} className={`${linkClass(auctionLinkActive(href))} flex items-center gap-3`}>
              <Icon aria-hidden="true" className={href === "/?status=live#auctions" ? "text-amber-500" : "text-slate-400"} />
              {name}
            </Link>
          ))}
          {navLinks.map(({ name, href }) => (
            <Link href={href} key={href} className={linkClass(pathname === href)}>{name}</Link>
          ))}
        </div>

        {user && (
          <div className="mt-3 grid gap-1 border-t border-slate-200 pt-3">
            <p className="px-3 pb-1 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-600">Account</p>
            {profileLinks.map(({ name, href }) => (
              <Link href={href} key={href} className={linkClass(pathname === href)}>{name}</Link>
            ))}
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-200 pt-4">
          <Link href="/submit-listing" className="rounded-xl bg-slate-950 px-4 py-3 text-center text-sm font-bold text-white">
            Sell your car
          </Link>
          {user ? (
            <button type="button" onClick={() => void signOut()} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700">
              Sign out
            </button>
          ) : (
            <Link href="/signin" className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-100">
              <FiUser aria-hidden="true" /> Sign in
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}

function HeaderWithFilters() {
  const filters = readAuctionFilters(useSearchParams());
  return <Header auctionStatus={filters.status === "ALL" ? "LIVE" : filters.status} />;
}

export default function HeaderNavigation() {
  return (
    <Suspense fallback={<Header />}>
      <HeaderWithFilters />
    </Suspense>
  );
}
