"use client";

import type { SellerListing } from "@/app/libs/listing-payload";
import axios from "axios";
import { useEffect, useId, useRef, useState } from "react";
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
const inputClass = "mt-2 block w-full scroll-mt-[calc(var(--site-header-height)+1rem)] rounded-lg border border-slate-300 px-3 py-2 font-normal aria-[invalid=true]:border-rose-600";

function listingFields(form: HTMLFormElement) {
  const fields = new FormData(form);
  fields.delete("cover");
  return Object.fromEntries(fields);
}

export default function ListingEditor({ listing }: { listing: SellerListing }) {
  const [images, setImages] = useState(listing.images);
  const [cover, setCover] = useState(listing.coverImage || listing.images[0]);
  const [records, setRecords] = useState(() => readVehicleRecords(listing.vehicleRecords));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [fieldsChanged, setFieldsChanged] = useState(false);
  const [savedMedia, setSavedMedia] = useState({ images, cover, records });
  const savedFields = useRef("");
  const formRef = useRef<HTMLFormElement>(null);
  const focusInvalidField = useRef(false);
  const id = useId();
  const busy = useRef(false);
  const router = useRouter();
  const dirty = fieldsChanged || cover !== savedMedia.cover ||
    JSON.stringify(images) !== JSON.stringify(savedMedia.images) ||
    JSON.stringify(records) !== JSON.stringify(savedMedia.records);

  useEffect(() => {
    if (formRef.current) savedFields.current = JSON.stringify(listingFields(formRef.current));
  }, []);

  useEffect(() => {
    if (focusInvalidField.current) {
      focusInvalidField.current = false;
      formRef.current?.querySelector<HTMLElement>("[aria-invalid=true], [data-listing-error]")?.focus();
    }
  }, [fieldErrors]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const guardLink = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
      const destination = new URL(link.href);
      const current = window.location;
      if (destination.origin !== current.origin ||
        (destination.pathname === current.pathname && destination.search === current.search)) return;
      if (!window.confirm("Leave this listing and discard your unsaved changes?")) {
        event.preventDefault();
      }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", guardLink, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", guardLink, true);
    };
  }, [dirty]);

  const errorId = (name: string) => `${id}-${name}-error`;
  const fieldProps = (name: string) => ({
    id: `${id}-${name}`,
    name,
    "aria-invalid": !!fieldErrors[name],
    "aria-describedby": fieldErrors[name] ? errorId(name) : undefined,
  });
  const fieldError = (name: string) => fieldErrors[name] && (
    <span id={errorId(name)} role="alert" className="mt-1 block text-sm font-normal text-rose-700">{fieldErrors[name]}</span>
  );

  function clearFieldErrors(name: string) {
    setFieldErrors((current) => {
      const errors = Object.entries(current);
      const remaining = errors.filter(([field]) => field !== name && !field.startsWith(`${name}.`));
      return remaining.length === errors.length ? current : Object.fromEntries(remaining);
    });
  }

  return <details className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
    <summary id="edit-listing" className="cursor-pointer scroll-mt-28 text-lg font-bold">Edit listing & submit for review</summary>
    <p className="mt-3 text-sm leading-6 text-slate-600">Save all corrections together. Any change returns this listing to review and hides it from buyers until approved again. Photos and details cannot be changed after bidding opens.</p>
    <form ref={formRef} className="mt-5" noValidate onChange={(event) => {
      setFieldsChanged(JSON.stringify(listingFields(event.currentTarget)) !== savedFields.current);
      const field = event.target;
      if ((field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement) && field.name) {
        clearFieldErrors(field.name);
      }
    }} onSubmit={async (event) => {
      event.preventDefault();
      if (busy.current) return;
      const fields = listingFields(event.currentTarget);
      const parsed = listingSchema.safeParse({ ...fields, images, vehicleRecords: records });
      setError("");
      if (!parsed.success) {
        const errors: Record<string, string> = {};
        for (const issue of parsed.error.issues) {
          const name = issue.path[0] === "images" ? "images" : issue.path.join(".");
          errors[name] ??= issue.message;
        }
        focusInvalidField.current = true;
        setFieldErrors(errors);
        return;
      }
      setFieldErrors({});
      busy.current = true; setSaving(true);
      try {
        await axios.patch(`/api/listing/${listing.id}`, { revision: listing.reviewRevision ?? 0, data: parsed.data, coverImage: cover });
        savedFields.current = JSON.stringify(fields);
        setFieldsChanged(false);
        setSavedMedia({ images, cover, records });
        router.refresh();
      } catch (error) { setError(getApiErrorMessage(error, "Could not save this listing.")); }
      finally { busy.current = false; setSaving(false); }
    }}>
      <fieldset disabled={saving} className="min-w-0 space-y-5">
        <legend className="sr-only">Listing corrections</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          {textFields.map(([name, label]) => <div key={name} className="text-sm font-bold">
            <label htmlFor={`${id}-${name}`}>{label}</label>
            <input {...fieldProps(name)} type={["year", "miles", "reservePrice"].includes(name) ? "number" : "text"} autoComplete="off" step="1" defaultValue={listing[name] ?? ""} className={inputClass} />
            {fieldError(name)}
          </div>)}
          {vehicleSpecificationFields.map(({ id: name, label, options }) => <div key={name} className="text-sm font-bold">
            <label htmlFor={`${id}-${name}`}>{label}</label>
            <select {...fieldProps(name)} autoComplete="off" defaultValue={listing[name] || ""} className={inputClass}><option value="">Select…</option>{options.map((option) => <option key={option}>{option}</option>)}</select>
            {fieldError(name)}
          </div>)}
        </div>
        <div className="text-sm font-bold">
          <label htmlFor={`${id}-description`}>Description</label>
          <textarea {...fieldProps("description")} autoComplete="off" defaultValue={listing.description} rows={5} className={inputClass} />
          {fieldError("description")}
        </div>
        {vehicleDisclosureFields.map(({ id: name, label, hint }) => <div key={name} className="text-sm font-bold">
          <label htmlFor={`${id}-${name}`}>{label}</label>
          <span id={`${id}-${name}-hint`} className="mt-1 block text-xs font-normal text-slate-600">{hint}</span>
          <textarea {...fieldProps(name)} aria-describedby={fieldErrors[name] ? `${id}-${name}-hint ${errorId(name)}` : `${id}-${name}-hint`} autoComplete="off" maxLength={4000} defaultValue={listing[name] || ""} rows={3} className={inputClass} />
          {fieldError(name)}
        </div>)}
        <RecordUploads records={records} onChange={(next) => {
          setRecords(next);
          clearFieldErrors("vehicleRecords");
        }} listingId={listing.id} validationErrors={fieldErrors} />
        <div
          data-listing-error={fieldErrors.images ? "" : undefined}
          tabIndex={fieldErrors.images ? -1 : undefined}
          aria-describedby={fieldErrors.images ? errorId("images") : undefined}
          className="scroll-mt-[calc(var(--site-header-height)+1rem)]"
        >
          <h3 className="text-sm font-bold">Photos ({images.length}/{MAX_LISTING_PHOTOS})</h3>
          <p className="mt-1 text-xs text-slate-600">Choose a cover photo or remove photos before saving.</p>
          {fieldError("images")}
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {images.map((url, index) => <div key={`${url}-${index}`} className="rounded-lg border bg-white p-2">
              <CldImage src={url} alt={`Listing photo ${index + 1}`} width={240} height={160} crop="fill" className="aspect-[3/2] w-full rounded object-cover" />
              <label className="mt-2 flex items-center gap-2 text-xs"><input type="radio" name="cover" checked={cover === url} onChange={() => setCover(url)} />Cover</label>
              <button type="button" className="mt-2 text-xs font-bold text-rose-700 underline" onClick={() => {
                const next = images.filter((_, i) => i !== index);
                setImages(next);
                if (cover === url) setCover(next[0]);
                clearFieldErrors("images");
              }}>Remove photo {index + 1}</button>
            </div>)}
          </div>
          <AuthorizedUploadButton kind="PHOTO" listingId={listing.id} maxFiles={MAX_LISTING_PHOTOS - images.length} className="mt-3 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold disabled:opacity-50" onUpload={(url) => {
            setImages((previous) => previous.includes(url) ? previous : [...previous, url].slice(0, MAX_LISTING_PHOTOS));
            setCover((previous) => previous || url);
            clearFieldErrors("images");
          }}>Add photos</AuthorizedUploadButton>
        </div>
        <button type="submit" className="rounded-lg bg-slate-950 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{saving ? "Saving…" : "Save & submit for review"}</button>
      </fieldset>
      {(error || fieldErrors[""]) && <p role="alert" className="mt-4 text-sm text-rose-700">{error || fieldErrors[""]}</p>}
    </form>
  </details>;
}
