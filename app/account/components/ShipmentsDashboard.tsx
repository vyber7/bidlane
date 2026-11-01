"use client";

import Image from "next/image";
import Link from "next/link";
import { CldImage } from "next-cloudinary";
import { useMemo, useState } from "react";
import {
  FiArrowUpRight,
  FiGrid,
  FiClock,
  FiMail,
  FiMapPin,
  FiShoppingBag,
  FiTag,
} from "react-icons/fi";
import type { ShipmentTransaction } from "@/app/types/account";
import { handoffSteps } from "@/app/libs/auction-guidance";

type Tab = "all" | "purchases" | "sales";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const date = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const ShipmentsDashboard = ({ shipments }: { shipments: ShipmentTransaction[] }) => {
  const purchases = shipments.filter((shipment) => shipment.role === "buyer");
  const sales = shipments.filter((shipment) => shipment.role === "seller");
  const [tab, setTab] = useState<Tab>("all");

  const visible = useMemo(
    () =>
      tab === "purchases"
        ? purchases
        : tab === "sales"
          ? sales
          : shipments,
    [purchases, sales, shipments, tab]
  );

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "all", label: "All", count: shipments.length },
    { id: "purchases", label: "Purchases", count: purchases.length },
    { id: "sales", label: "Sales", count: sales.length },
  ];

  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 px-5 py-5 sm:px-6">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-[0.18em] text-gray-500">
              Vehicle handoff
            </p>
            <h2 className="text-2xl font-bold text-gray-950">Purchases & sales</h2>
            <p className="mt-1 max-w-xl text-sm text-gray-500">
              Find your sold auction results and contact the other party to arrange payment, paperwork, and pickup.
            </p>
          </div>
          <Link
            href="/faq#after-auction"
            className="inline-flex w-fit items-center gap-1 text-sm font-bold text-gray-900 hover:underline"
          >
            After-auction guide <FiArrowUpRight />
          </Link>
        </div>
      </div>

      {shipments.length > 0 && <div className="border-b border-gray-200 bg-stone-50 px-5 py-5 sm:px-6">
        <h3 className="text-sm font-bold text-gray-950">Your next steps</h3>
        <ol className="mt-3 grid gap-3 md:grid-cols-3">
          {handoffSteps.map(({ title }, index) => <li key={title} className="text-xs font-bold text-gray-900">{index + 1}. {title}</li>)}
        </ol>
        <p className="mt-4 text-xs leading-5 text-gray-500">These are auction results. Payment and vehicle handoff are arranged directly between buyer and seller.</p>
      </div>}

      <div className="grid grid-cols-3 border-b border-gray-200 bg-gray-50">
        <Stat icon={<FiGrid />} label="Total" value={shipments.length} />
        <Stat icon={<FiShoppingBag />} label="Purchases" value={purchases.length} />
        <Stat icon={<FiTag />} label="Sales" value={sales.length} />
      </div>

      <div className="border-b border-gray-200 px-4 pt-3 sm:px-6">
        <div className="flex gap-5 overflow-x-auto" role="tablist" aria-label="Purchases and sales">
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
              {item.label}{" "}
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
          {visible.map((shipment) => (
            <ShipmentRow key={`${shipment.id}-${shipment.role}`} shipment={shipment} />
          ))}
        </ul>
      ) : (
        <EmptyShipments tab={tab} />
      )}
    </section>
  );
};

const Stat = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) => (
  <div className="border-r border-gray-200 px-3 py-4 last:border-r-0 sm:px-6">
    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
      <span className="hidden text-base sm:inline">{icon}</span>
      {label}
    </div>
    <p className="mt-1 text-2xl font-bold text-gray-950">{value}</p>
  </div>
);

const ShipmentRow = ({ shipment }: { shipment: ShipmentTransaction }) => {
  const vehicle = `${shipment.year} ${shipment.make} ${shipment.model}`;
  const isBuyer = shipment.role === "buyer";

  return (
    <li className="p-4 transition-colors hover:bg-gray-50 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row">
        <Link
          href={`/listing/${shipment.id}`}
          className="relative h-44 w-full shrink-0 overflow-hidden rounded-lg bg-gray-100 sm:h-32 sm:w-48"
        >
          {shipment.coverImage ? (
            <CldImage
              src={shipment.coverImage}
              alt={vehicle}
              fill
              sizes="(min-width: 640px) 192px, calc(100vw - 50px)"
              crop="fill"
              className="object-cover transition-transform duration-300 hover:scale-105"
            />
          ) : (
            <Image
              src="/images/default-vehicle-image.png"
              alt={vehicle}
              fill
              sizes="(min-width: 640px) 192px, calc(100vw - 50px)"
              className="object-cover"
            />
          )}
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                {isBuyer ? "Auction won" : "Sold at auction"} · {date.format(new Date(shipment.soldAt))}
              </p>
              <Link href={`/listing/${shipment.id}`} className="hover:underline">
                <h3 className="mt-1 truncate text-lg font-bold text-gray-950">{vehicle}</h3>
              </Link>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <span className="flex items-center gap-1.5 text-gray-600">
              <FiMapPin className="text-gray-400" /> {shipment.location}
            </span>
            <span className="font-bold text-gray-950">Winning bid {money.format(shipment.price)}</span>
          </div>

          <div className="mt-4 flex flex-col gap-3 border-t border-gray-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="flex items-center gap-1.5 text-xs font-bold text-gray-900">
                <FiClock className="text-gray-500" /> Contact {isBuyer ? "the seller" : "the buyer"}
              </p>
              <p className="mt-0.5 text-xs text-gray-500">
                {shipment.contactEmail ? `Coordinate payment, paperwork, and pickup with ${shipment.contactName}.` : "Contact details are unavailable. Ask BidLane support for help with the handoff."}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {shipment.contactEmail && (
                <a
                  href={`mailto:${shipment.contactEmail}?subject=${encodeURIComponent(`Vehicle handoff: ${vehicle}`)}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-bold text-gray-800 hover:bg-gray-100"
                >
                  <FiMail /> Contact {isBuyer ? "seller" : "buyer"}
                </a>
              )}
              {!shipment.contactEmail && <Link href="/contact" className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-bold text-gray-800 hover:bg-gray-100">Get help</Link>}
              <Link
                href={`/listing/${shipment.id}`}
                aria-label={`View ${vehicle}`}
                className="text-lg text-gray-500 hover:text-gray-950"
              >
                <FiArrowUpRight />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </li>
  );
};

const EmptyShipments = ({ tab }: { tab: Tab }) => {
  const label = tab === "purchases" ? "purchases" : tab === "sales" ? "sales" : "purchases or sales";

  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 text-2xl text-gray-700">
        <FiShoppingBag />
      </div>
      <h3 className="text-lg font-bold text-gray-950">No {label} yet</h3>
      <p className="mt-1 max-w-sm text-sm text-gray-500">
        Auctions marked Sold will appear here for the winning buyer and seller, with contact details for arranging the handoff.
      </p>
      <Link
        href="/?status=live#auctions"
        className="mt-5 rounded-lg bg-gray-950 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-gray-700"
      >
        Browse live auctions
      </Link>
    </div>
  );
};

export default ShipmentsDashboard;
