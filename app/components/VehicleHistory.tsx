import { vehicleDisclosureFields, type VehicleDetails } from "@/app/libs/vehicle-details";

export default function VehicleHistory({ details, id, headingLevel = 2 }: {
  details: VehicleDetails;
  id?: string;
  headingLevel?: 2 | 4;
}) {
  const Heading = headingLevel === 4 ? "h4" : "h2";
  return (
    <section id={id} className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-5 sm:p-8">
      <Heading className="text-lg font-bold tracking-tight text-slate-950">History & condition</Heading>
      <p className="mt-2 text-xs leading-5 text-slate-500">Reported by the seller. Ask for records and discuss any inspection before bidding.</p>
      <dl className="mt-5 space-y-5">
        {vehicleDisclosureFields.map(({ id: field, label }) => (
          <div key={field} className={field === "knownFlaws" ? "rounded-xl border border-amber-200 bg-amber-50 p-4" : ""}>
            <dt className="text-sm font-bold text-slate-950">{label}</dt>
            <dd className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">{details[field]?.trim() || "Not provided"}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
