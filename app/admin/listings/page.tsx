import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getReviewQueue } from "@/app/libs/listing-moderation";
import { ApiRequestError } from "@/app/libs/api-request";
import { reviewLabels } from "@/app/libs/listing-review";

export const dynamic = "force-dynamic";

export default async function ReviewQueue({ searchParams }: { searchParams: Promise<{ page?: string; review?: string }> }) {
  const query = await searchParams;
  const filter = query.review === "APPROVED" || query.review === "CHANGES_REQUESTED" ? query.review : "PENDING";
  const page = /^\d+$/.test(query.page || "") ? Math.min(10000, Math.max(1, Number(query.page))) : 1;
  const result = await getReviewQueue(page, filter).catch((error: unknown) => {
    if (error instanceof ApiRequestError) {
      if (error.status === 401) redirect("/signin");
      if (error.status === 403) notFound();
    }
    throw error;
  });

  return <div className="mx-auto max-w-5xl px-4 py-12">
    <Link href="/admin" className="text-sm font-bold underline">← Administration</Link>
    <h1 className="mt-5 text-3xl font-black">Listing reviews</h1>
    <p className="mt-3 text-sm text-slate-600">Review upcoming listings before buyers can see them or bidding can open. Oldest submissions appear first.</p>
    <nav aria-label="Review filters" className="mt-6 flex flex-wrap gap-2">{Object.entries(reviewLabels).map(([status, label]) => <Link key={status} href={`/admin/listings?review=${status}`} aria-current={filter === status ? "page" : undefined} className={`rounded-full border px-4 py-2 text-sm font-bold ${filter === status ? "bg-slate-950 text-white" : "bg-white text-slate-700"}`}>{label}</Link>)}</nav>
    <ul className="mt-6 divide-y rounded-2xl border border-slate-200 bg-white">
      {result.listings.map((listing) => <li key={listing.id} className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div><p className="text-xs font-bold text-amber-800">{reviewLabels[listing.reviewStatus ?? "PENDING"]}</p><h2 className="mt-1 font-bold">{listing.year} {listing.make} {listing.model}</h2><p className="mt-1 text-sm text-slate-600">{listing.user.name || "Seller"} · Submitted {listing.createdAt.toLocaleDateString("en-US", { timeZone: "UTC" })}</p>{listing.reviewNote && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-600">{listing.reviewNote}</p>}</div>
        <Link href={`/admin/listings/${listing.id}`} className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white">Review listing →</Link>
      </li>)}
    </ul>
    {!result.listings.length && <p className="mt-5 text-sm text-slate-600">No listings in this review category.</p>}
    <nav aria-label="Review pages" className="mt-6 flex gap-5 text-sm font-bold">
      {page > 1 && <Link href={`/admin/listings?review=${filter}&page=${page - 1}`} className="underline">Previous page</Link>}
      {result.hasMore && <Link href={`/admin/listings?review=${filter}&page=${page + 1}`} className="underline">Next page</Link>}
    </nav>
  </div>;
}
