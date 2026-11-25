import { correctionRoute } from "../correction-route";

export const PATCH = correctionRoute({
  correction: ({ vin, vehicleRecords }) => ({ kind: "records", vin, vehicleRecords }),
  respond: () => ({ saved: true }),
  failure: { event: "listing.vehicle_details_failed", message: "Could not save vehicle details. Please try again." },
});
