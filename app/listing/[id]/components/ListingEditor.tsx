"use client";

import type { SellerListing } from "@/app/libs/listing-payload";
import axios from "axios";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CldImage } from "next-cloudinary";
import AuthorizedUploadButton from "@/app/components/AuthorizedUploadButton";
import { listingSchema, MAX_LISTING_PHOTOS } from "@/app/schemas/listing";
import { readVehicleRecords } from "@/app/schemas/vehicle-trust";
import { vehicleDisclosureFields, vehicleSpecificationFields } from "@/app/libs/vehicle-details";
import RecordUploads from "@/app/submit-listing/components/RecordUploads";
import { getApiErrorMessage } from "@/app/utils/api-error";

const textFields = [
  ["make", "Make"], ["model", "Model"], ["year", "Year"], ["miles", "Mileage"],
  ["location", "Location"], ["reservePrice", "Reserve price in USD (optional)"], ["vin", "VIN or chassis number (optional)"],
] as const;
const inputClass = "mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2 font-normal";

export default function ListingEditor({ listing }: { listing: SellerListing }) {
  const [images, setImages] = useState(listing.images);
  const [cover, setCover] = useState(listing.coverImage || listing.images[0]);
  const [records, setRecords] = useState(() => readVehicleRecords(listing.vehicleRecords));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const router = useRouter();

  return <details className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
    <summary className="cursor-pointer text-lg font-bold">Edit listing & submit for review</summary>
    <p className="mt-3 text-sm leading-6 text-slate-600">Save all corrections together. Any change returns this listing to review and hides it from buyers until approved again. Photos and details cannot be changed after bidding opens.</p>
    <form className="mt-5" onSubmit={async (event) => {
      event.preventDefault();
      if (busy.current) return;
      const fields = Object.fromEntries(new FormData(event.currentTarget));
      const parsed = listingSchema.safeParse({ ...fields, images, vehicleRecords: records });
      if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
      busy.current = true; setSaving(true); setError("");
      try {
        await axios.patch(`/api/listing/${listing.id}`, { revision: listing.reviewRevision ?? 0, data: parsed.data, coverImage: cover });
        router.refresh();
      } catch (error) { setError(getApiErrorMessage(error, "Could not save this listing.")); }
      finally { busy.current = false; setSaving(false); }
    }}>
      <fieldset disabled={saving} className="min-w-0 space-y-5">
        <legend className="sr-only">Listing corrections</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          {textFields.map(([name, label]) => <label key={name} className="text-sm font-bold">{label}
            <input name={name} type={["year", "miles", "reservePrice"].includes(name) ? "number" : "text"} step="1" defaultValue={listing[name] ?? ""} className={inputClass} />
          </label>)}
          {vehicleSpecificationFields.map(({ id, label, options }) => <label key={id} className="text-sm font-bold">{label}
            <select name={id} defaultValue={listing[id] || ""} className={inputClass}><option value="">Select…</option>{options.map((option) => <option key={option}>{option}</option>)}</select>
          </label>)}
        </div>
        <label className="block text-sm font-bold">Description<textarea name="description" defaultValue={listing.description} rows={5} className={inputClass} /></label>
        {vehicleDisclosureFields.map(({ id, label, hint }) => <label key={id} className="block text-sm font-bold">{label}<span className="mt-1 block text-xs font-normal text-slate-600">{hint}</span><textarea name={id} maxLength={4000} defaultValue={listing[id] || ""} rows={3} className={inputClass} /></label>)}
        <RecordUploads records={records} onChange={setRecords} listingId={listing.id} />
        <div>
          <h3 className="text-sm font-bold">Photos ({images.length}/{MAX_LISTING_PHOTOS})</h3>
          <p className="mt-1 text-xs text-slate-600">Choose a cover photo or remove photos before saving.</p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {images.map((url, index) => <div key={`${url}-${index}`} className="rounded-lg border bg-white p-2">
              <CldImage src={url} alt={`Listing photo ${index + 1}`} width={240} height={160} crop="fill" className="aspect-[3/2] w-full rounded object-cover" />
              <label className="mt-2 flex items-center gap-2 text-xs"><input type="radio" name="cover" checked={cover === url} onChange={() => setCover(url)} />Cover</label>
              <button type="button" className="mt-2 text-xs font-bold text-rose-700 underline" onClick={() => { const next = images.filter((_, i) => i !== index); setImages(next); if (cover === url) setCover(next[0]); }}>Remove photo {index + 1}</button>
            </div>)}
          </div>
          <AuthorizedUploadButton kind="PHOTO" listingId={listing.id} maxFiles={MAX_LISTING_PHOTOS - images.length} className="mt-3 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold disabled:opacity-50" onUpload={(url) => {
            setImages((previous) => previous.includes(url) ? previous : [...previous, url].slice(0, MAX_LISTING_PHOTOS));
            setCover((previous) => previous || url);
          }}>Add photos</AuthorizedUploadButton>
        </div>
        <button type="submit" className="rounded-lg bg-slate-950 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{saving ? "Saving…" : "Save & submit for review"}</button>
      </fieldset>
      {error && <p role="alert" className="mt-4 text-sm text-rose-700">{error}</p>}
    </form>
  </details>;
}
