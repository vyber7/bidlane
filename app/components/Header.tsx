"use client";

import Link from "next/link";
import { signIn, signOut, useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  FiChevronDown,
  FiCheckCircle,
  FiClock,
  FiMenu,
  FiUser,
  FiX,
  FiZap,
} from "react-icons/fi";

import Avatar from "./Avatar";

const auctionLinks = [
  { name: "Live auctions", href: "/live/listings", icon: FiZap },
  { name: "Coming soon", href: "/future/listings", icon: FiClock },
  { name: "Results", href: "/past/listings", icon: FiCheckCircle },
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
  { name: "Shipments", href: "/account/shipments" },
];

function Header() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const user = session?.user;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [auctionsOpen, setAuctionsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

  const closeNavbar = () => {
    if (label.current) label.current.click();
  };

  useEffect(() => {
    function closeMenus(event: MouseEvent) {
      if (!headerRef.current?.contains(event.target as Node)) {
        setAuctionsOpen(false);
        setProfileOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMobileOpen(false);
        setAuctionsOpen(false);
        setProfileOpen(false);
      }
    }

    document.addEventListener("mousedown", closeMenus);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("mousedown", closeMenus);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const auctionsActive = auctionLinks.some(({ href }) => pathname === href);
  const linkClass = (active: boolean) =>
    `rounded-lg px-3 py-2 text-sm font-semibold transition ${
      active
        ? "bg-slate-100 text-slate-950"
        : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
    }`;

  return (
    <header
      ref={headerRef}
      className="fixed inset-x-0 top-0 z-[100] border-b border-slate-200/90 bg-white/95 shadow-[0_1px_2px_rgba(15,23,42,0.04)] backdrop-blur"
    >
      <nav
        className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8"
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
          <Link href="/" className={linkClass(pathname === "/")}>
            Discover
          </Link>

          <div className="relative">
            <button
              type="button"
              aria-expanded={auctionsOpen}
              aria-haspopup="menu"
              onClick={() => {
                setAuctionsOpen((open) => !open);
                setProfileOpen(false);
              }}
              className={`${linkClass(auctionsActive)} flex items-center gap-1`}
            >
              Auctions
              <FiChevronDown className={`transition-transform ${auctionsOpen ? "rotate-180" : ""}`} />
            </button>
            {auctionsOpen && (
              <div
                role="menu"
                className="absolute left-0 top-[calc(100%+0.65rem)] w-52 rounded-xl border border-slate-200 bg-white p-2 shadow-xl shadow-slate-900/10"
              >
                {auctionLinks.map(({ name, href, icon: Icon }) => (
                  <Link
                    role="menuitem"
                    href={href}
                    key={href}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
                      pathname === href
                        ? "bg-slate-100 text-slate-950"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                    }`}
                  >
                    <Icon className={href === "/live/listings" ? "text-amber-500" : "text-slate-400"} />
                    {name}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {navLinks.map(({ name, href }) => (
            <Link href={href} key={href} className={linkClass(pathname === href)}>
              {name}
            </Link>
          ))}
        </div>

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
                aria-label="Open account menu"
                aria-expanded={profileOpen}
                aria-haspopup="menu"
                onClick={() => {
                  setProfileOpen((open) => !open);
                  setAuctionsOpen(false);
                }}
                className="flex items-center gap-2 rounded-full border border-slate-200 p-1.5 pr-2.5 transition hover:border-slate-400"
              >
                <Avatar user={user} />
                <FiChevronDown className={`text-slate-500 transition-transform ${profileOpen ? "rotate-180" : ""}`} />
              </button>
              {profileOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-[calc(100%+0.65rem)] w-60 rounded-xl border border-slate-200 bg-white p-2 shadow-xl shadow-slate-900/10"
                >
                  <div className="border-b border-slate-100 px-3 py-2">
                    <p className="text-xs font-medium text-slate-400">Signed in as</p>
                    <p className="truncate text-sm font-semibold text-slate-800">{user.email}</p>
                  </div>
                  <div className="py-1">
                    {profileLinks.map(({ name, href }) => (
                      <Link
                        role="menuitem"
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
                    role="menuitem"
                    onClick={() => void signOut()}
                    className="w-full border-t border-slate-100 px-3 pt-3 text-left text-sm font-semibold text-red-600"
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void signIn()}
              className="rounded-full px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
            >
              Sign in
            </button>
          )}
        </div>

        <button
          type="button"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((open) => !open)}
          className="rounded-lg border border-slate-200 p-2 text-xl text-slate-700 lg:hidden"
        >
          {mobileOpen ? <FiX /> : <FiMenu />}
        </button>
      </nav>

      {mobileOpen && (
        <div className="max-h-[calc(100vh-4rem)] overflow-y-auto border-t border-slate-200 bg-white px-4 py-4 lg:hidden">
          {user && (
            <div className="mb-3 flex items-center gap-3 rounded-xl bg-slate-50 p-3">
              <Avatar user={user} />
              <div className="min-w-0">
                <p className="text-xs text-slate-400">Your account</p>
                <p className="truncate text-sm font-semibold text-slate-800">{user.email}</p>
              </div>
            </div>
          )}

          <div className="grid gap-1">
            <Link href="/" className={linkClass(pathname === "/")}>Discover</Link>
            <p className="px-3 pb-1 pt-3 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Auctions</p>
            {auctionLinks.map(({ name, href, icon: Icon }) => (
              <Link href={href} key={href} className={`${linkClass(pathname === href)} flex items-center gap-3`}>
                <Icon className={href === "/live/listings" ? "text-amber-500" : "text-slate-400"} />
                {name}
              </Link>
            ))}
            {navLinks.map(({ name, href }) => (
              <Link href={href} key={href} className={linkClass(pathname === href)}>{name}</Link>
            ))}
          </div>

          {user && (
            <div className="mt-3 grid gap-1 border-t border-slate-200 pt-3">
              <p className="px-3 pb-1 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Account</p>
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
              <button type="button" onClick={() => void signIn()} className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700">
                <FiUser /> Sign in
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

export default Header;
