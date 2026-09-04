import type { Metadata } from "next";
import SubmitForm from "./components/SubmitForm";
import Aside from "./components/Aside";
import getSoldAuctions from "../actions/getSoldAuctions";
//import getCurrentUser from "../actions/getCurrentUser";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Submit a Vehicle | Car Auctions",
  description: "Submit a vehicle for auction.",
};

async function SubmitVehicle() {
  const soldAuctions = await getSoldAuctions();
  //const currentUser = await getCurrentUser();
  return (
    <div className="m-auto px-2 lg:px-0 pt-16 min-h-lvh pb-4 lg:gap-4 flex flex-col lg:flex-row max-w-5xl">
      <main className="w-full lg:w-10/12 lg:p-0 rounded-md">
        <h2 className="pb-4 font-bold">Basic vehicle information</h2>
        <SubmitForm />
      </main>
      <Aside auctions={soldAuctions} variant="sold" />
    </div>
  );
}

export default SubmitVehicle;
