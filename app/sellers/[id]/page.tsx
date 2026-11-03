import Link from "next/link";
import Image from "next/image";
import { FiUser } from "react-icons/fi";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSellerProfile } from "@/app/libs/seller-profile";

export const metadata: Metadata = { title: "Seller profile | BidLane", description: "View a seller’s public profile, listings, and auction results on BidLane." };

export default async function SellerPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id } = await params;
  if (!/^[a-f\d]{24}$/i.test(id)) notFound();
  const requestedPage = Number((await searchParams).page ?? "1");
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 && requestedPage <= 10000 ? requestedPage : 1;
  const profile = await getSellerProfile(id, page);
  if (!profile || (page > 1 && (page - 1) * 12 >= profile.salesCount)) notFound();
  const { seller, salesCount, active, sales } = profile;
  const initials = (seller.name || "")
    .split(/\s|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return <main className="mx-auto max-w-5xl space-y-7 px-4 pb-16 pt-28 sm:px-6">
    <Link href="/#auctions" className="text-sm font-semibold text-slate-600 hover:underline">← Browse auctions</Link>
    <header className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
      <div className="grid grid-cols-[minmax(0,1fr)_5rem] items-start gap-4 sm:grid-cols-[minmax(0,1fr)_10rem] sm:gap-8">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-amber-700">Seller profile</p>
          <h1 className="mt-1 break-words text-3xl font-black">{seller.name || "BidLane seller"}</h1>
          <p className="mt-2 text-sm text-slate-600">Member since {seller.createdAt.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</p>
          <div className="mt-5 flex flex-wrap gap-3 text-sm font-semibold">
            <span className={`rounded-full px-3 py-1 ${seller.emailVerified ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{seller.emailVerified ? "Email verified" : "Email not verified"}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1">{salesCount} {salesCount === 1 ? "vehicle" : "vehicles"} sold at auction</span>
          </div>
        </div>
        {seller.image ? <Image
          src={seller.image}
          alt={`${seller.name || "Seller"}'s profile photo`}
          width={160}
          height={160}
          unoptimized
          className="aspect-square w-full rounded-2xl bg-slate-100 object-cover ring-1 ring-slate-200"
        /> : <div
          role="img"
          aria-label={`${seller.name || "Seller"}'s profile avatar`}
          className="flex aspect-square w-full items-center justify-center rounded-2xl bg-gradient-to-br from-gray-800 to-gray-950 text-2xl font-bold text-white shadow-sm ring-4 ring-gray-100 sm:text-4xl"
        >
          {initials || <FiUser aria-hidden="true" />}
        </div>}
      </div>
      <p className="mt-4 text-xs leading-5 text-slate-500">Email verification confirms inbox access, not identity, ownership, or vehicle condition. Auction results do not confirm payment or vehicle handoff.</p>
    </header>
    <VehicleList title="Latest current listings" vehicles={active} empty="No current listings." />
    <VehicleList title="Sold at auction" vehicles={sales} empty="No sold auction results yet." />
    {(page > 1 || page * 12 < salesCount) && <nav aria-label="Seller auction result pages" className="flex justify-between text-sm font-bold underline">
      {page > 1 ? <Link href={`/sellers/${id}?page=${page - 1}`}>← Previous results</Link> : <span />}
      {page * 12 < salesCount && <Link href={`/sellers/${id}?page=${page + 1}`}>More results →</Link>}
    </nav>}
  </main>;
}

function VehicleList({ title, vehicles, empty }: { title: string; vehicles: NonNullable<Awaited<ReturnType<typeof getSellerProfile>>>["sales"]; empty: string }) {
  return <section><h2 className="mb-4 text-xl font-bold">{title}</h2>
    {vehicles.length ? <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{vehicles.map((vehicle) => <li key={vehicle.id}>
      <Link href={`/listing/${vehicle.id}`} className="block overflow-hidden rounded-xl border border-slate-200 bg-white hover:border-amber-400">
        <Image src={vehicle.coverImage || "/images/default-vehicle-image.png"} alt={`${vehicle.year} ${vehicle.make} ${vehicle.model}`} width={600} height={400} unoptimized className="aspect-[3/2] w-full object-cover" />
        <div className="p-4"><h3 className="font-bold">{vehicle.year} {vehicle.make} {vehicle.model}</h3>
          <p className="mt-1 text-sm text-slate-500">{vehicle.location}</p>
          <p className="mt-3 text-sm font-semibold">{vehicle.status === "ENDED" ? "Winning bid" : vehicle.status === "LIVE" ? "Current bid" : "Coming soon"}{vehicle.currentBid !== null && vehicle.status !== "UPCOMING" ? ` · $${vehicle.currentBid.toLocaleString("en-US")}` : ""}</p>
        </div>
      </Link>
    </li>)}</ul> : <p className="rounded-xl border border-slate-200 p-6 text-sm text-slate-600">{empty}</p>}
  </section>;
}
