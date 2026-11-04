import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getListingReview } from "@/app/libs/listing-moderation";
import { ApiRequestError } from "@/app/libs/api-request";
import { reviewLabels } from "@/app/libs/listing-review";
import { vehicleSpecificationFields } from "@/app/libs/vehicle-details";
import VehicleHistory from "@/app/components/VehicleHistory";
import VehicleRecords from "@/app/components/VehicleRecords";
import Gallery from "@/app/listing/[id]/components/Gallery";
import CoverImage from "@/app/listing/[id]/components/CoverImage";
import ReviewForm from "./ReviewForm";

export const dynamic = "force-dynamic";

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-f\d]{24}$/i.test(id)) notFound();
  const listing = await getListingReview(id).catch((error: unknown) => {
    if (error instanceof ApiRequestError) {
      if (error.status === 401) redirect("/signin");
      if (error.status === 403 || error.status === 404) notFound();
    }
    throw error;
  });
  const title = `${listing.year} ${listing.make} ${listing.model}`;
  return <div className="mx-auto max-w-6xl space-y-6 px-4 pb-12 pt-24 sm:px-6 lg:px-8">
    <Link href="/admin/listings" className="text-sm font-bold underline">← Listing reviews</Link>
    <header><p className="text-sm font-bold text-amber-800">{reviewLabels[listing.reviewStatus ?? "PENDING"]} · {listing.status}</p><h1 className="mt-2 text-3xl font-black">{title}</h1><p className="mt-3 text-sm text-slate-600">Seller: {listing.user.name || "Seller"} · {listing.user.email || "Email unavailable"}</p><Link href={`/listing/${id}`} className="mt-3 inline-block text-sm font-bold underline">View listing page →</Link></header>
    <section className="rounded-2xl border bg-white p-6">
      <h2 className="text-xl font-bold">Vehicle details</h2>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2">{[
        ["Mileage", `${listing.miles.toLocaleString("en-US")} miles`], ["Location", listing.location],
        ["VIN / chassis", listing.vin || "Not provided"], ["Reserve", listing.reservePrice == null ? "No reserve" : `$${listing.reservePrice.toLocaleString("en-US")}`],
        ...vehicleSpecificationFields.map(({ id, label }) => [label, listing[id] || "Not provided"]),
      ].map(([label, value]) => <div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>)}</dl>
      <h3 className="mt-5 font-bold">Description</h3><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{listing.description}</p>
    </section>
    <CoverImage key={`cover:${listing.reviewRevision ?? 0}`} listingId={id} url={listing.coverImage || undefined} alt={`${title} cover photo`} />
    <Gallery key={`gallery:${listing.reviewRevision ?? 0}`} listingId={id} vehicleName={title} initialImages={listing.images} />
    <VehicleHistory details={listing} />
    <VehicleRecords records={listing.vehicleRecords} />
    {listing.reviewNote && <p className="whitespace-pre-wrap break-words rounded-xl bg-amber-50 p-4 text-sm">Latest feedback: {listing.reviewNote}</p>}
    <ReviewForm key={listing.reviewRevision ?? 0} id={id} revision={listing.reviewRevision ?? 0} disabled={listing.status !== "UPCOMING"} />
    <section className="rounded-2xl border bg-white p-6">
      <h2 className="text-xl font-bold">Review history</h2>
      <p className="mt-2 text-xs text-slate-500">Latest 50 decisions. Saving listing changes requires a new approval.</p>
      {listing.reviews.length ? <ol className="mt-4 space-y-4">{listing.reviews.map((review) => <li key={review.id} className="border-t pt-3 text-sm"><p className="font-bold">{reviewLabels[review.decision]} · {review.reviewerName}</p><p className="mt-1 text-xs text-slate-500">{review.createdAt.toISOString()} · Revision {review.revision}</p>{review.reason && <p className="mt-2 whitespace-pre-wrap break-words">{review.reason}</p>}</li>)}</ol> : <p className="mt-4 text-sm text-slate-500">No decisions recorded yet.</p>}
    </section>
  </div>;
}
