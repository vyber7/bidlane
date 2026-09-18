import type { Metadata } from "next";
import SubmitForm from "./components/SubmitForm";
import Aside from "./components/Aside";
import getSoldAuctions from "../actions/getSoldAuctions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "BidLane | Submit Listing",
  description: "Submit a vehicle for auction.",
};

async function SubmitVehicle() {
  const soldAuctions = await getSoldAuctions();

  return (
    <div className="m-auto grid min-h-lvh max-w-6xl gap-10 px-4 pb-10 pt-16 lg:grid-cols-[minmax(0,1fr)_18rem] lg:px-0">
      <main className="w-full rounded-md lg:p-0">
        <h1 className="pb-2 text-3xl font-bold">Submit your vehicle</h1>
        <p className="mb-6 text-sm text-slate-500">Add your details and photos, then preview your listing before submitting.</p>
        <SubmitForm />
      </main>
      <Aside auctions={soldAuctions} />
    </div>
  );
}

export default SubmitVehicle;
