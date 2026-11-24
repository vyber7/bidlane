"use client";

import Image from "next/image";
import Link from "next/link";
import { CldImage } from "next-cloudinary";
import { useSearchParams } from "next/navigation";
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
import { transactionAnchor } from "@/app/libs/transaction-completion";
import { formatAmount, formatBid, formatDate } from "@/app/utils/format";
import AccountTabs, { updateAccountUrl } from "./AccountTabs";
import CompletionChecklist from "./CompletionChecklist";

type Tab = "all" | "purchases" | "sales";

const ShipmentsDashboard = ({ shipments }: { shipments: ShipmentTransaction[] }) => {
  const purchases = shipments.filter((shipment) => shipment.role === "buyer");
  const sales = shipments.filter((shipment) => shipment.role === "seller");
  const requestedTab = useSearchParams().get("tab");
  const tab = requestedTab === "purchases" || requestedTab === "sales" ? requestedTab : "all";
  const visible = tab === "purchases" ? purchases : tab === "sales" ? sales : shipments;

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
            <h2 className="text-2xl font-bold text-gray-950">Purchases & Sales</h2>
            <p className="mt-1 max-w-xl text-sm text-gray-500">
              Work with your buyer or seller to complete payment, paperwork, and pickup.
            </p>
          </div>
          <Link
            href="/faq#after-auction"
            className="inline-flex w-fit items-center gap-1 text-sm font-bold text-gray-900 hover:underline"
          >
            After-Auction Guide <FiArrowUpRight aria-hidden="true" />
          </Link>
        </div>
      </div>

      {shipments.length > 0 && <div className="border-b border-gray-200 bg-stone-50 px-5 py-5 sm:px-6">
        <h3 className="text-sm font-bold text-gray-950">Your Next Steps</h3>
        <ol className="mt-3 grid gap-3 md:grid-cols-3">
          {handoffSteps.map(({ title }, index) => <li key={title} className="text-xs font-bold text-gray-900">{index + 1}. {title}</li>)}
        </ol>
        <p className="mt-4 text-xs leading-5 text-gray-500">Use the shared checklist below to confirm each step together. Payment and vehicle handoff are arranged directly between buyer and seller.</p>
      </div>}

      <div className="grid grid-cols-3 border-b border-gray-200 bg-gray-50">
        <Stat icon={<FiGrid />} label="Total" value={shipments.length} />
        <Stat icon={<FiShoppingBag />} label="Purchases" value={purchases.length} />
        <Stat icon={<FiTag />} label="Sales" value={sales.length} />
      </div>

      <AccountTabs<Tab>
        label="Purchases and sales"
        tabs={tabs}
        selected={tab}
        onChange={(nextTab) => {
          if (nextTab !== tab) updateAccountUrl({ tab: nextTab });
        }}
      >
        {visible.length ? (
          <ul className="divide-y divide-gray-200">
            {visible.map((shipment) => (
              <ShipmentRow key={`${shipment.id}-${shipment.role}`} shipment={shipment} />
            ))}
          </ul>
        ) : (
          <EmptyShipments tab={tab} />
        )}
      </AccountTabs>
    </section>
  );
};

const Stat = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) => (
  <div className="border-r border-gray-200 px-3 py-4 last:border-r-0 sm:px-6">
    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
      <span aria-hidden="true" className="hidden text-base sm:inline">{icon}</span>
      {label}
    </div>
    <p className="mt-1 text-2xl font-bold tabular-nums text-gray-950">{formatAmount(value)}</p>
  </div>
);

const ShipmentRow = ({ shipment }: { shipment: ShipmentTransaction }) => {
  const vehicle = `${shipment.year} ${shipment.make} ${shipment.model}`;
  const isBuyer = shipment.role === "buyer";

  return (
    <li id={transactionAnchor(shipment.id)} className="p-4 transition-colors hover:bg-gray-50 [content-visibility:auto] [contain-intrinsic-size:auto_40rem] sm:p-5 sm:[contain-intrinsic-size:auto_29rem]">
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
              className="object-cover hover:opacity-90 motion-safe:transition-transform motion-safe:duration-300 motion-safe:hover:scale-105"
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
                {isBuyer ? "Auction won" : "Sold at auction"} · <time dateTime={shipment.soldAt}>{formatDate(shipment.soldAt)}</time>
              </p>
              <Link href={`/listing/${shipment.id}`} className="hover:underline">
                <h3 className="mt-1 truncate text-lg font-bold text-gray-950">{vehicle}</h3>
              </Link>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <span className="flex items-center gap-1.5 text-gray-600">
              <FiMapPin aria-hidden="true" className="shrink-0 text-gray-500" /> <span className="min-w-0 break-words">{shipment.location}</span>
            </span>
            <span className="font-bold tabular-nums text-gray-950">Winning bid {formatBid(shipment.price)}</span>
          </div>

          <div className="mt-4 flex flex-col gap-3 border-t border-gray-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="flex items-center gap-1.5 text-xs font-bold text-gray-900">
                <FiClock aria-hidden="true" className="text-gray-500" /> Contact {isBuyer ? "the seller" : "the buyer"}
              </p>
              <p className="mt-0.5 break-words text-xs text-gray-500">
                {shipment.contactEmail ? `Coordinate payment, paperwork, and pickup with ${shipment.contactName}.` : "Contact details are unavailable. Ask BidLane support for help with the handoff."}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {shipment.contactEmail && (
                <a
                  href={`mailto:${shipment.contactEmail}?subject=${encodeURIComponent(`Vehicle handoff: ${vehicle}`)}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-bold text-gray-800 hover:bg-gray-100"
                >
                  <FiMail aria-hidden="true" /> Contact {isBuyer ? "Seller" : "Buyer"}
                </a>
              )}
              {!shipment.contactEmail && <Link href="/contact" className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-bold text-gray-800 hover:bg-gray-100">Get Help</Link>}
              <Link
                href={`/listing/${shipment.id}`}
                aria-label={`View ${vehicle}`}
                className="text-lg text-gray-500 hover:text-gray-950"
              >
                <FiArrowUpRight aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </div>
      {shipment.completion ? (
        <CompletionChecklist listingId={shipment.id} role={shipment.role} initialCompletion={shipment.completion} />
      ) : (
        <p className="mt-4 text-sm text-gray-500">A shared checklist is unavailable because this auction has no recorded buyer. <Link href="/contact" className="font-bold underline">Contact support</Link> for help.</p>
      )}
    </li>
  );
};

const EmptyShipments = ({ tab }: { tab: Tab }) => {
  const label = tab === "purchases" ? "Purchases" : tab === "sales" ? "Sales" : "Purchases or Sales";

  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <div aria-hidden="true" className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 text-2xl text-gray-700">
        <FiShoppingBag />
      </div>
      <h3 className="text-lg font-bold text-gray-950">No {label} Yet</h3>
      <p className="mt-1 max-w-sm text-sm text-gray-500">
        Auctions marked Sold will appear here for the winning buyer and seller, with contact details for arranging the handoff.
      </p>
      <Link
        href="/?status=live#auctions"
        className="mt-5 rounded-lg bg-gray-950 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-gray-700"
      >
        Browse Live Auctions
      </Link>
    </div>
  );
};

export default ShipmentsDashboard;
