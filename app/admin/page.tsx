import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAdminOverview } from "@/app/libs/admin";
import { ApiRequestError } from "@/app/libs/api-request";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const overview = await getAdminOverview().catch((error: unknown) => {
    if (error instanceof ApiRequestError) {
      if (error.status === 401) redirect("/signin?callbackUrl=%2Fadmin");
      if (error.status === 403) notFound();
    }
    throw error;
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">BidLane admin</p>
      <h1 className="mt-2 text-3xl font-black text-slate-950">Administration</h1>
      <p className="mt-3 text-sm text-slate-600">Signed in as {overview.admin.email}.</p>
      <dl className="mt-8 grid gap-4 sm:grid-cols-3">
        {[
          { label: "Accounts", value: overview.users },
          { label: "Listings", value: overview.listings },
          { label: "Live auctions", value: overview.liveAuctions },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <dt className="text-sm font-semibold text-slate-500">{label}</dt>
            <dd className="mt-2 text-3xl font-black text-slate-950">{value.toLocaleString("en-US")}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-8 flex gap-5 text-sm font-bold">
        <Link href="/account/profile" className="underline">My account</Link>
        <Link href="/#auctions" className="underline">Browse auctions</Link>
      </div>
    </div>
  );
}
