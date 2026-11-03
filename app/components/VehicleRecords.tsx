import { readVehicleRecords } from "@/app/schemas/vehicle-trust";
export default function VehicleRecords({ records, headingLevel = 2 }: { records: unknown; headingLevel?: 2 | 4 }) {
  const Heading = headingLevel === 4 ? "h4" : "h2";
  const items = readVehicleRecords(records);
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-8">
    <Heading className="text-lg font-bold text-slate-950">Vehicle records</Heading>
    <p className="mt-2 text-xs leading-5 text-slate-500">Provided by the seller. BidLane has not authenticated these documents or independently inspected this vehicle.</p>
    {items.length ? <ul className="mt-4 space-y-3">{items.map((record, index) => <li key={`${record.url}-${index}`}>
      <a href={record.url} target="_blank" rel="noopener noreferrer" className="break-words text-sm font-semibold underline decoration-amber-400 underline-offset-4">{record.label}<span className="sr-only"> (opens in a new tab)</span></a>
    </li>)}</ul> : <p className="mt-4 text-sm text-slate-600">No records provided. Ask the seller about service receipts, inspection reports, and vehicle history before bidding.</p>}
  </section>;
}
