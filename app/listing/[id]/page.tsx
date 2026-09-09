import prisma from "../../libs/prismadb";
import Description from "./components/Description";
import Comments from "./components/Comments";
import getComments from "@/app/actions/getComments";
import getCurrentUser from "@/app/actions/getCurrentUser";
import getBids from "@/app/actions/getBids";
import AuctionStatusBar from "./components/AuctionStatusBar";
import AuctionStartForm from "./components/AuctionStartForm";
import Bids from "./components/Bids";
import Gallery from "./components/Gallery";
import CoverImage from "./components/CoverImage";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { FiArrowLeft, FiMapPin } from "react-icons/fi";

export const metadata: Metadata = {
  title: "BidLane | Vehicle Auction",
  description: "Explore vehicle details, browse photos, and join the auction on BidLane.",
};

interface Params {
  params: Promise<{ id: string }>;
}

const Listing = async (props: Params) => {
  const { id } = await props.params;
  if (!/^[a-f\d]{24}$/i.test(id)) notFound();
  const listing = await prisma.listing.findUnique({ where: { id } });
  if (!listing) notFound();

  const [comments, currentUser, bids, seller] = await Promise.all([
    getComments(id),
    getCurrentUser(),
    getBids(id),
    prisma.user.findUnique({ where: { id: listing.userId }, select: { name: true, email: true } }),
  ]);
  const title = `${listing.year} ${listing.make} ${listing.model}`;
  const owner = listing.userId === currentUser?.id;

  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 pt-24 sm:px-6 lg:px-8">
      <Link href="/" className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-slate-950">
        <FiArrowLeft /> All auctions
      </Link>
      <header className="mb-6">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">The details make the drive</p>
        <h1 className="text-3xl font-black tracking-tight text-slate-950 sm:text-5xl">{title}</h1>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-500">
          <span className="inline-flex items-center gap-1.5"><FiMapPin />{listing.location}</span>
          <span>{listing.miles.toLocaleString("en-US")} miles</span>
          <span>Listed by <span className="font-semibold text-slate-900">{seller?.name || "Seller"}</span></span>
        </div>
      </header>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <CoverImage listingId={id} owner={owner} url={listing.coverImage || undefined} alt={title} />
          <Gallery key={id} listingId={id} owner={owner} vehicleName={title} initialImages={listing.images} />
        </div>
        <aside className="space-y-5 lg:sticky lg:top-24" aria-label="Auction overview">
          <AuctionStatusBar listing={listing} currentUser={currentUser?.id} commentsCount={comments.length} bidsCount={bids.length} />
          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="mb-4 text-lg font-bold tracking-tight">Vehicle at a glance</h2>
            <dl className="divide-y divide-slate-100 text-sm">
              {[["Year", listing.year], ["Make", listing.make], ["Model", listing.model], ["Mileage", `${listing.miles.toLocaleString("en-US")} miles`], ["Location", listing.location]].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4 py-3"><dt className="text-slate-500">{label}</dt><dd className="text-right font-semibold text-slate-900">{value}</dd></div>
              ))}
            </dl>
          </section>
          <Link href="/faq" className="block px-2 text-sm text-slate-500 hover:text-slate-950">New to BidLane? Learn how bidding works →</Link>
        </aside>
      </div>
      <nav aria-label="Listing sections" className="my-8 flex gap-6 overflow-x-auto border-b border-slate-200 pb-4 text-sm font-semibold text-slate-600">
        <a href="#overview" className="hover:text-slate-950">Overview</a>
        <a href="#photos" className="hover:text-slate-950">Photos</a>
        {listing.status !== "UPCOMING" && <a href="#bids" className="hover:text-slate-950">Bidding</a>}
        <a href="#comments" className="whitespace-nowrap hover:text-slate-950">Comments & bids</a>
      </nav>
      <div className="space-y-6">
        {owner && listing.status === "UPCOMING" && <AuctionStartForm listingId={id} />}
        <Description description={listing.description} />
        {listing.status !== "UPCOMING" && <Bids listing={listing} bids={bids} sellerName={seller?.name} sellerEmail={seller?.email} />}
        <Comments initialComments={comments} initialBids={bids} listingId={id} />
      </div>
    </main>
  );
};
export default Listing;
