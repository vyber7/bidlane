import { getNativeRepositories } from "@/app/libs/native-repositories";
import { serializeDraft } from "@/app/libs/listing-drafts";
import { listingIdSchema } from "@/app/schemas/common";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import getCurrentUser from "@/app/actions/getCurrentUser";
import type { Metadata } from "next";
import SubmitForm from "./components/SubmitForm";
import Aside from "./components/Aside";
import getSoldAuctions from "../actions/getSoldAuctions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "BidLane | Submit Listing",
  description: "Submit a vehicle for auction.",
};

async function SubmitVehicle({ searchParams }: { searchParams: Promise<{ draft?: string }> }) {
  const [soldAuctions, currentUser] = await Promise.all([getSoldAuctions(), getCurrentUser()]);

  if (!currentUser) redirect("/signin");
  const draftId = (await searchParams).draft;
  let initialDraft;
  if (draftId !== undefined) {
    if (!listingIdSchema.safeParse(draftId).success) notFound();
    const draft = await getNativeRepositories().drafts.owned(draftId, currentUser.id);
    if (!draft) notFound();
    if (draft.publishedListingId) redirect(`/listing/${draft.publishedListingId}`);
    initialDraft = serializeDraft(draft);
  }

  return (
    <div className="mx-auto grid min-h-lvh max-w-6xl gap-10 px-4 pb-10 pt-24 sm:px-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:px-8">
      <main className="w-full rounded-md lg:p-0">
        <h1 className="pb-2 text-3xl font-bold">Submit your vehicle</h1>
        <p className="mb-6 text-sm text-slate-500">Add your details and photos, then preview your listing before submitting. Your draft saves as you work. Submitted listings need admin approval before they appear publicly or bidding can open.</p>
        {currentUser && !currentUser.emailVerified && <p className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-slate-700">You can save and edit your draft now. <Link href="/account/profile" className="font-bold underline">Verify your email in your profile</Link> before submitting your listing.</p>}
        <SubmitForm key={initialDraft?.id ?? "new"} initialDraft={initialDraft} emailVerified={Boolean(currentUser.emailVerified)} />
      </main>
      <Aside auctions={soldAuctions} />
    </div>
  );
}

export default SubmitVehicle;
