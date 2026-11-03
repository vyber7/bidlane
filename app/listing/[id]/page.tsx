import prisma from "../../libs/prismadb";
import Description from "./components/Description";
import Comments from "./components/Comments";
import getComments from "@/app/actions/getComments";
import getCurrentUser from "@/app/actions/getCurrentUser";
import Aside from "@/app/submit-listing/components/Aside";
import getLiveAuctions from "@/app/actions/getLiveAuctions";
import getBids from "@/app/actions/getBids";
import AuctionStatusBar from "./components/AuctionStatusBar";
import MobileAuctionBar from "./components/MobileAuctionBar";
import AuctionStartForm from "./components/AuctionStartForm";
import Bids from "./components/Bids";
import Gallery from "./components/Gallery";
import CoverImage from "./components/CoverImage";
import { AuctionProvider } from "@/app/context/AuctionContext";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { FiArrowLeft, FiMapPin } from "react-icons/fi";
import VehicleRecords from "@/app/components/VehicleRecords";
import VehicleTrustEditor from "./components/VehicleTrustEditor";
import VehicleHistory from "@/app/components/VehicleHistory";
import { vehicleSpecificationFields } from "@/app/libs/vehicle-details";

export const metadata: Metadata = {
  title: "BidLane | Vehicle Auction",
  description:
    "Explore vehicle details, browse photos, and join the auction on BidLane.",
};

interface Params {
  params: Promise<{ id: string }>;
}

const Listing = async (props: Params) => {
  const { id } = await props.params;
  if (!/^[a-f\d]{24}$/i.test(id)) notFound();
  const listing = await prisma.listing.findUnique({ where: { id } });
  if (!listing) notFound();

  const [comments, currentUser, bids, seller, liveAuctions] = await Promise.all(
    [
      getComments(id),
      getCurrentUser(),
      getBids(id),
      prisma.user.findUnique({
        where: { id: listing.userId },
        select: { name: true, emailVerified: true },
      }),
      getLiveAuctions(),
    ],
  );
  const title = `${listing.year} ${listing.make} ${listing.model}`;
  const owner = listing.userId === currentUser?.id;

  return (
    <AuctionProvider key={id} listing={listing} bids={bids} comments={comments}>
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-24 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-slate-950"
        >
          <FiArrowLeft /> All auctions
        </Link>
        <header className="mb-6">
          <h1 className="text-3xl font-black tracking-tight text-slate-950 sm:text-5xl">
            {title}
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <FiMapPin />
              {listing.location}
            </span>
            <span>{listing.miles.toLocaleString("en-US")} miles</span>
            <span>
              Listed by{" "}
              <Link href={`/sellers/${listing.userId}`} className="font-semibold text-slate-900 underline decoration-amber-400 underline-offset-4">
                {seller?.name || "Seller"}
              </Link>
            </span>
            <span title="Confirms inbox access, not identity or vehicle condition." className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">{seller?.emailVerified ? "Seller email verified" : "Seller email not verified"}</span>
          </div>
          <p className="mt-3 text-xs text-slate-500">Vehicle details and records are seller-reported. BidLane has not independently verified ownership, history, or condition.</p>
        </header>
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 lg:col-start-1 lg:row-start-1">
            <CoverImage
              listingId={id}
              owner={owner}
              url={listing.coverImage || undefined}
              alt={title}
            />
          </div>
          <div
            className="contents lg:col-start-2 lg:row-start-1 lg:row-span-3 lg:block lg:space-y-5"
            role="complementary"
            aria-label="Auction overview"
          >
            <AuctionStatusBar currentUser={currentUser?.id} />
            <div className="order-1">
              <section className="rounded-2xl border border-slate-200 bg-white p-6">
                <h2 className="mb-4 text-lg font-bold tracking-tight">
                  Vehicle at a glance
                </h2>
                <dl className="divide-y divide-slate-100 text-sm">
                  {[
                    ["Year", listing.year],
                    ["Make", listing.make],
                    ["Model", listing.model],
                    [
                      "Mileage",
                      `${listing.miles.toLocaleString("en-US")} miles`,
                    ],
                    ["Location", listing.location],
                    ["VIN / chassis", listing.vin?.trim() || "Not provided"],
                    ...vehicleSpecificationFields.map(
                      ({ id: field, label }) => [
                        label,
                        listing[field]?.trim() || "Not provided",
                      ],
                    ),
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="flex justify-between gap-4 py-3"
                    >
                      <dt className="shrink-0 text-slate-500">{label}</dt>
                      <dd className="min-w-0 break-words text-right font-semibold text-slate-900">
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            </div>
            <div className="order-3 space-y-5">
              <Aside
                auctions={liveAuctions
                  .filter((auction) => auction.id !== id)
                  .slice(0, 4)}
                variant="live"
              />
              <Link
                href="/faq"
                className="block px-2 text-sm text-slate-500 hover:text-slate-950"
              >
                New to BidLane? Learn how bidding works →
              </Link>
            </div>
          </div>
          <div className="min-w-0 lg:col-start-1 lg:row-start-2">
            <Gallery
              key={id}
              listingId={id}
              owner={owner}
              vehicleName={title}
              initialImages={listing.images}
            />
          </div>
          <div className="order-2 min-w-0 lg:order-none lg:col-start-1 lg:row-start-3">
            <div className="space-y-6">
              {owner && listing.status === "UPCOMING" && (
                <AuctionStartForm listingId={id} />
              )}
              {owner && listing.status === "UPCOMING" && <VehicleTrustEditor id={id} initialVin={listing.vin} initialRecords={listing.vehicleRecords} />}
              <Description description={listing.description} />
              <VehicleHistory details={listing} id="condition" />
              <VehicleRecords records={listing.vehicleRecords} />
              {listing.status !== "UPCOMING" && (
                <Bids
                  sellerName={seller?.name}
                  currentUserId={currentUser?.id}
                />
              )}
              <Comments />
            </div>
          </div>
        </div>
      </main>
      <MobileAuctionBar currentUserId={currentUser?.id} />
    </AuctionProvider>
  );
};
export default Listing;
