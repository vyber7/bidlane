"use client";

import Image from "next/image";
import Link from "next/link";
import { CldImage } from "next-cloudinary";
import { useState } from "react";
import {
  FiArrowUpRight,
  FiAward,
  FiCheckCircle,
  FiClock,
  FiTrendingUp,
} from "react-icons/fi";

type AuctionBid = {
  id: string;
  year: number;
  make: string;
  model: string;
  location: string;
  coverImage: string | null;
  status: string;
  result: string | null;
  currentBid: number | null;
  auctionEndsAt: string | null;
  highestBid: number;
  lastBidAt: string;
  bidCount: number;
  isHighestBidder: boolean;
};

type Tab = "active" | "wins" | "past";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const shortDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const BidsAndWinsDashboard = ({ bids }: { bids: AuctionBid[] }) => {
  const active = bids.filter((bid) => bid.status === "LIVE");
  const wins = bids.filter(
    (bid) =>
      bid.status === "ENDED" && bid.result === "SOLD" && bid.isHighestBidder
  );
  const past = bids.filter(
    (bid) => bid.status === "ENDED" && !wins.some((win) => win.id === bid.id)
  );
  const [tab, setTab] = useState<Tab>(active.length ? "active" : wins.length ? "wins" : "past");

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "active", label: "Active bids", count: active.length },
    { id: "wins", label: "Wins", count: wins.length },
    { id: "past", label: "Past bids", count: past.length },
  ];

  const visible = tab === "active" ? active : tab === "wins" ? wins : past;
  const leading = active.filter((bid) => bid.isHighestBidder).length;
  const totalWon = wins.reduce((sum, bid) => sum + (bid.currentBid ?? 0), 0);

  return (
    <section className="overflow-hidden rounded-md bg-white shadow-md shadow-gray-400">
      <div className="border-b border-gray-200 px-5 py-5 sm:px-6">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-[0.18em] text-gray-500">
              Auction activity
            </p>
            <h2 className="text-2xl font-bold text-gray-950">Bids &amp; wins</h2>
            <p className="mt-1 text-sm text-gray-500">
              Follow every vehicle you bid on, from first bid to final result.
            </p>
          </div>
          <Link
            href="/live/listings"
            className="inline-flex w-fit items-center gap-1 text-sm font-bold text-gray-900 hover:underline"
          >
            Browse auctions <FiArrowUpRight />
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-3 border-b border-gray-200 bg-gray-50">
        <Stat icon={<FiTrendingUp />} label="Active" value={active.length.toString()} />
        <Stat icon={<FiCheckCircle />} label="Leading" value={leading.toString()} />
        <Stat icon={<FiAward />} label="Won value" value={money.format(totalWon)} />
      </div>

      <div className="border-b border-gray-200 px-4 pt-3 sm:px-6">
        <div className="flex gap-5 overflow-x-auto" role="tablist" aria-label="Bid activity">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={`whitespace-nowrap border-b-2 px-1 py-3 text-sm font-bold transition-colors ${
                tab === item.id
                  ? "border-gray-950 text-gray-950"
                  : "border-transparent text-gray-500 hover:text-gray-900"
              }`}
            >
              {item.label}
              <span
                className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
                  tab === item.id ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600"
                }`}
              >
                {item.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {visible.length ? (
        <ul className="divide-y divide-gray-200">
          {visible.map((bid) => (
            <BidRow key={bid.id} bid={bid} tab={tab} />
          ))}
        </ul>
      ) : (
        <EmptyTab tab={tab} />
      )}
    </section>
  );
};

const Stat = ({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) => (
  <div className="border-r border-gray-200 px-3 py-4 last:border-r-0 sm:px-6">
    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
      <span className="hidden text-base sm:inline">{icon}</span>
      {label}
    </div>
    <p className="mt-1 truncate text-xl font-bold text-gray-950 sm:text-2xl">{value}</p>
  </div>
);

const BidRow = ({ bid, tab }: { bid: AuctionBid; tab: Tab }) => {
  const status =
    tab === "wins"
      ? { label: "Won", classes: "bg-emerald-50 text-emerald-700" }
      : tab === "active" && bid.isHighestBidder
        ? { label: "Leading", classes: "bg-emerald-50 text-emerald-700" }
        : tab === "active"
          ? { label: "Outbid", classes: "bg-amber-50 text-amber-700" }
          : { label: "Ended", classes: "bg-gray-100 text-gray-600" };

  return (
    <li className="p-4 transition-colors hover:bg-gray-50 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row">
        <Link
          href={`/listing/${bid.id}`}
          className="relative h-44 w-full shrink-0 overflow-hidden rounded-md bg-gray-100 sm:h-28 sm:w-44"
        >
          {bid.coverImage ? (
            <CldImage
              src={bid.coverImage}
              alt={`${bid.year} ${bid.make} ${bid.model}`}
              fill
              sizes="(min-width: 640px) 176px, calc(100vw - 48px)"
              crop="fill"
              className="object-cover transition-transform duration-300 hover:scale-105"
            />
          ) : (
            <Image
              src="/images/default-vehicle-image.png"
              alt={`${bid.year} ${bid.make} ${bid.model}`}
              fill
              sizes="(min-width: 640px) 176px, calc(100vw - 48px)"
              className="object-cover"
            />
          )}
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link href={`/listing/${bid.id}`} className="hover:underline">
                <h3 className="truncate text-lg font-bold text-gray-950">
                  {bid.year} {bid.make} {bid.model}
                </h3>
              </Link>
              <p className="truncate text-sm text-gray-500">{bid.location}</p>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${status.classes}`}>
              {status.label}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <BidDetail label="Your top bid" value={money.format(bid.highestBid)} />
            <BidDetail
              label={tab === "wins" ? "Winning bid" : "Current bid"}
              value={money.format(bid.currentBid ?? bid.highestBid)}
            />
            <BidDetail
              label={tab === "active" ? "Auction ends" : "Last bid"}
              value={shortDate.format(new Date(tab === "active" && bid.auctionEndsAt ? bid.auctionEndsAt : bid.lastBidAt))}
              className="col-span-2 sm:col-span-1"
            />
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <FiClock /> {bid.bidCount} {bid.bidCount === 1 ? "bid" : "bids"} placed
            </span>
            <Link
              href={`/listing/${bid.id}`}
              className="inline-flex items-center gap-1 text-sm font-bold text-gray-900 hover:underline"
            >
              View auction <FiArrowUpRight />
            </Link>
          </div>
        </div>
      </div>
    </li>
  );
};

const BidDetail = ({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string;
  className?: string;
}) => (
  <div className={className}>
    <p className="text-xs text-gray-500">{label}</p>
    <p className="mt-0.5 text-sm font-bold text-gray-950">{value}</p>
  </div>
);

const EmptyTab = ({ tab }: { tab: Tab }) => {
  const copy = {
    active: {
      title: "No active bids",
      body: "When you place a bid on a live auction, you can track it here.",
    },
    wins: {
      title: "No wins yet",
      body: "Your winning auctions will appear here after the hammer falls.",
    },
    past: {
      title: "No past bids",
      body: "Completed auctions you participated in will be kept here.",
    },
  }[tab];

  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-xl text-gray-700">
        {tab === "wins" ? <FiAward /> : <FiTrendingUp />}
      </div>
      <h3 className="text-lg font-bold text-gray-950">{copy.title}</h3>
      <p className="mt-1 max-w-sm text-sm text-gray-500">{copy.body}</p>
      <Link
        href="/live/listings"
        className="mt-5 rounded-md bg-gray-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-gray-700"
      >
        Browse live auctions
      </Link>
    </div>
  );
};

export default BidsAndWinsDashboard;
