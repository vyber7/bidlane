"use client";
import axios from "axios";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import RecordUploads from "@/app/submit-listing/components/RecordUploads";
import { readVehicleRecords } from "@/app/schemas/vehicle-trust";
import { getApiErrorMessage } from "@/app/utils/api-error";

export default function VehicleTrustEditor({ id, initialVin, initialRecords }: { id: string; initialVin?: string | null; initialRecords: unknown }) {
  const [vin, setVin] = useState(initialVin ?? "");
  const [records, setRecords] = useState(() => readVehicleRecords(initialRecords));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const busy = useRef(false);
  const router = useRouter();
  return <form className="rounded-2xl border border-amber-200 bg-amber-50 p-5" onSubmit={async (event) => {
    event.preventDefault(); if (busy.current) return;
    busy.current = true; setSaving(true); setError(""); setSaved(false);
    try {
      await axios.patch(`/api/listing/${id}/vehicle-details`, { vin, vehicleRecords: records });
      setSaved(true); router.refresh();
    } catch (error) { setError(getApiErrorMessage(error, "Could not save vehicle details.")); }
    finally { busy.current = false; setSaving(false); }
  }}>
    <fieldset disabled={saving} className="min-w-0">
      <legend className="text-lg font-bold">Seller: VIN & records</legend>
      <p className="mt-2 text-sm text-slate-600">Add or correct these details before starting the auction. They cannot be changed once bidding opens.</p>
      <label className="mt-4 block text-sm font-bold">VIN or chassis number (optional)<input value={vin} onChange={(event) => { setVin(event.target.value); setSaved(false); }} maxLength={30} className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <RecordUploads records={records} onChange={(next) => { setRecords(next); setSaved(false); }} />
      <button type="submit" className="mt-4 rounded-lg bg-slate-950 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{saving ? "Saving…" : "Save VIN & records"}</button>
    </fieldset>
    {saved && <p role="status" className="mt-3 text-sm text-emerald-800">Vehicle details saved.</p>}
    {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
  </form>;
}
