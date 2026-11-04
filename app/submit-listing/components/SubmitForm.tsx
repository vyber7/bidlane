"use client";

import { getApiErrorMessage } from "@/app/utils/api-error";

import { useForm, useWatch } from "react-hook-form";
import axios from "axios";
import toast from "react-hot-toast";
import { useEffect, useRef, useState } from "react";
import { CldImage, CldUploadWidget } from "next-cloudinary";
import { useRouter } from "next/navigation";
import { MAX_LISTING_NUMBER, MAX_LISTING_PHOTOS, validateListing } from "@/app/libs/listing-validation";
import { listingSchema } from "@/app/schemas/listing";
import { validationMessage } from "@/app/schemas/common";
import type { ListingDetailsFormValues } from "@/app/types/forms";
import { MAX_VEHICLE_DISCLOSURE_LENGTH, vehicleDisclosureFields, vehicleSpecificationFields } from "@/app/libs/vehicle-details";
import RecordUploads from "./RecordUploads";
import VehicleRecords from "@/app/components/VehicleRecords";
import type { VehicleRecord } from "@/app/schemas/vehicle-trust";
import useListingDraft from "./useListingDraft";
import PhotoChecklist from "./PhotoChecklist";
import { initialListingDetails, type DraftPayload, type ListingDraftDTO } from "@/app/schemas/listing-draft";
import VehicleHistory from "@/app/components/VehicleHistory";

type ListingField = { label: string } & (
  | { id: "make" | "model" | "location" | "vin"; type?: "text"; placeholder: string; min?: never; max?: never }
  | { id: "year" | "miles" | "reservePrice"; type: "number"; min: number; max: number; placeholder?: never }
);


const steps = [
  { label: "Details", title: "Vehicle details" },
  { label: "Condition", title: "History & condition" },
  { label: "Photos", title: "Photos" },
  { label: "Preview", title: "Preview" },
];
const primary = "rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50";
const secondary = "rounded-lg border border-slate-300 px-4 py-3 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50";

export default function SubmitForm({ initialDraft }: { initialDraft?: ListingDraftDTO }) {
  const [records, setRecords] = useState<VehicleRecord[]>(initialDraft?.payload.vehicleRecords ?? []);
  const [step, setStep] = useState(initialDraft?.payload.step === 3 && !initialDraft.payload.images.length ? 2 : initialDraft?.payload.step ?? 0);
  const [images, setImages] = useState<string[]>(initialDraft?.payload.images ?? []);
  const [details, setDetails] = useState<ListingDetailsFormValues>(initialDraft?.payload.details ?? initialListingDetails);
  const [photoChecklist, setPhotoChecklist] = useState<DraftPayload["photoChecklist"]>(initialDraft?.payload.photoChecklist ?? []);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const submitting = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const router = useRouter();
  const { register, getValues, trigger, control, formState: { errors } } = useForm<ListingDetailsFormValues>({
    defaultValues: initialDraft?.payload.details ?? initialListingDetails,
    mode: "onChange",
  });
  const watched = useWatch({ control });
  const payload: DraftPayload = { details: { ...initialListingDetails, ...watched }, images, vehicleRecords: records, photoChecklist, step };
  const draft = useListingDraft(payload, initialDraft, isLoading);
  const snapshot = (): DraftPayload => ({ ...payload, details: getValues() });

  async function saveDraft(exit = false) {
    if (exit) setIsLoading(true);
    try {
      await draft.save(snapshot());
      if (exit) { router.push("/account/listings"); router.refresh(); }
    } catch { setIsLoading(false); /* The draft banner keeps the failure visible. */ }
  }
  useEffect(() => { heading.current?.focus(); }, [step]);
  const changeStep = (next: number) => { setError(""); setStep(next); };

  async function submitListing() {
    if (submitting.current) return;
    const data = { ...details, images, vehicleRecords: records };
    const validationError = validateListing(data);
    if (validationError) { setError(validationError); return; }
    submitting.current = true;
    setIsLoading(true);
    setError("");
    try {
      const saved = await draft.save(snapshot());
      const response = await axios.post<{ id: string }>("/api/new-listing", { draftId: saved.id, revision: saved.revision });
      toast.success("Listing submitted for admin review!");
      router.push(`/listing/${response.data.id}`);
      router.refresh();
    } catch (error) {
      setError(getApiErrorMessage(error, "Unable to submit. Please try again."));
      submitting.current = false;
      setIsLoading(false);
    }
  }

  const fields: ListingField[] = [
    { id: "vin", label: "VIN or chassis number (optional)", placeholder: "VIN, or chassis number for older or imported vehicles" },
    { id: "make", label: "Make", placeholder: "e.g. Porsche" },
    { id: "model", label: "Model", placeholder: "e.g. 911 Carrera" },
    { id: "year", label: "Year", type: "number", min: 1886, max: new Date().getFullYear() + 1 },
    { id: "miles", label: "Mileage", type: "number", min: 0, max: MAX_LISTING_NUMBER },
    { id: "reservePrice", label: "Reserve price in USD (optional)", type: "number", min: 0, max: MAX_LISTING_NUMBER },
    { id: "location", label: "Location", placeholder: "City, State" },
  ];

  const title = `${details.year || ""} ${details.make || ""} ${details.model || ""}`.trim();
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-8">
      <div className="mb-6 rounded-xl border border-slate-200 bg-stone-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p role="status" className="text-sm font-semibold text-slate-700">{draft.saving ? "Saving draft…" : draft.dirty ? "Unsaved changes" : draft.status === "saved" ? "Draft saved" : "Private listing draft"}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={isLoading || draft.saving || draft.status === "conflict"} onClick={() => void saveDraft()} className={secondary}>Save draft</button>
            <button type="button" disabled={isLoading || draft.saving || draft.status === "conflict"} onClick={() => void saveDraft(true)} className={secondary}>Save & exit</button>
          </div>
        </div>
        <p className="mt-2 text-xs leading-5 text-slate-500">Changes save automatically. Wait for “Draft saved” before leaving, or use Save & exit. Drafts aren’t listed publicly; find them in Account → Listings.</p>
        {draft.message && <p role="alert" className="mt-3 text-sm text-rose-700">{draft.message}</p>}
        {draft.status === "conflict" && <button type="button" onClick={() => window.location.reload()} className="mt-2 text-sm font-bold underline">Reload saved draft</button>}
      </div>
      <fieldset disabled={isLoading} className="min-w-0">
      <legend className="sr-only">Vehicle listing draft</legend>
      <ol aria-label="Submission progress" className="mb-8 grid grid-cols-4 gap-2">
        {steps.map(({ label }, index) => <li key={label} aria-current={step === index ? "step" : undefined} className={`border-t-4 pt-3 text-xs sm:text-sm ${step === index ? "border-amber-500 font-bold text-slate-900" : "border-slate-200 text-slate-500"}`}><span className="block text-xs">Step {index + 1}</span>{label}</li>)}
      </ol>
      <h2 ref={heading} tabIndex={-1} className="mb-2 text-xl font-bold outline-none">{steps[step].title}</h2>
      <p className="mb-6 text-sm leading-6 text-slate-500">{step === 0 ? "Tell buyers about your vehicle. All details are required except the VIN and reserve price. You can edit everything before submitting." : step === 1 ? "Help buyers understand what they’re bidding on. Share what you know and be explicit about anything unknown." : step === 2 ? `Add up to ${MAX_LISTING_PHOTOS} photos. The first photo will be your cover image.` : "Review your listing below. Submit when everything looks right."}</p>
      {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <form hidden={step > 1} noValidate onSubmit={async (event) => {
        event.preventDefault();
        const activeFields: (keyof ListingDetailsFormValues)[] = step === 0
          ? [...fields.map(({ id }) => id), ...vehicleSpecificationFields.map(({ id }) => id), "description"]
          : vehicleDisclosureFields.map(({ id }) => id);
        if (!await trigger(activeFields, { shouldFocus: true })) return;
        setDetails(getValues());
        changeStep(step + 1);
      }}>
        <fieldset hidden={step !== 0} className="min-w-0">
          <legend className="sr-only">Vehicle specifications</legend>
          <div className="grid gap-5 sm:grid-cols-2">
            {fields.map((field) => (
              <div key={field.id}>
                <label htmlFor={field.id} className="mb-2 block text-sm font-semibold">{field.label}</label>
                <input id={field.id} type={field.type || "text"} min={field.min} max={field.max} step={field.type === "number" ? 1 : undefined} placeholder={field.placeholder} maxLength={field.id === "vin" ? 30 : field.id === "location" ? 200 : field.id === "make" || field.id === "model" ? 100 : undefined} aria-invalid={!!errors[field.id]} aria-describedby={errors[field.id] ? `${field.id}-error` : undefined}
                  {...register(field.id, { validate: (value) => validationMessage(listingSchema.shape[field.id], value) })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base focus:border-slate-500 focus:ring-slate-500 sm:text-sm" />
                {errors[field.id] && <p id={`${field.id}-error`} className="mt-1 text-sm text-red-600">{errors[field.id]?.message}</p>}
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500">Leave the reserve blank to list without a minimum sale price. VINs and chassis numbers are seller-reported; format checks do not verify ownership or vehicle history.</p>
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            {vehicleSpecificationFields.map(({ id, label, options }) => (
              <div key={id}>
                <label htmlFor={id} className="mb-2 block text-sm font-semibold">{label}</label>
                <select id={id} {...register(id, { validate: (value) => validationMessage(listingSchema.shape[id], value) })} aria-invalid={!!errors[id]} aria-describedby={errors[id] ? `${id}-error` : "specification-hint"} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base focus:border-slate-500 focus:ring-slate-500 sm:text-sm">
                  <option value="">Select {label.toLowerCase()}</option>
                  {options.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
                {errors[id] && <p id={`${id}-error`} className="mt-1 text-sm text-red-600">{errors[id]?.message}</p>}
              </div>
            ))}
          </div>
          <p id="specification-hint" className="mt-3 text-xs leading-5 text-slate-500">Choose “Unknown” if you’re unsure. For title status, check the current ownership document.</p>
          <label htmlFor="description" className="mb-2 mt-6 block text-sm font-semibold">Description</label>
          <textarea id="description" rows={5} maxLength={10000} placeholder="Share what makes this vehicle special, its ownership story, and why you’re selling it. You’ll add history and condition details next." {...register("description", { validate: (value) => validationMessage(listingSchema.shape.description, value) })} aria-invalid={!!errors.description} aria-describedby={errors.description ? "description-error" : undefined} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base focus:border-slate-500 focus:ring-slate-500 sm:text-sm" />
          {errors.description && <p id="description-error" className="text-sm text-red-600">{errors.description.message}</p>}
        </fieldset>
        <fieldset hidden={step !== 1} className="min-w-0 space-y-6">
          <legend className="sr-only">Seller disclosures</legend>
          {vehicleDisclosureFields.map(({ id, label, hint, placeholder }) => (
            <div key={id}>
              <label htmlFor={id} className="mb-2 block text-sm font-semibold">{label}</label>
              <p id={`${id}-hint`} className="mb-3 text-xs leading-5 text-slate-500">{hint}</p>
              <textarea id={id} rows={4} maxLength={MAX_VEHICLE_DISCLOSURE_LENGTH} placeholder={placeholder} {...register(id, {
                validate: (value) => validationMessage(listingSchema.shape[id], value),
              })} aria-invalid={!!errors[id]} aria-describedby={`${id}-hint${errors[id] ? ` ${id}-error` : ""}`} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base focus:border-slate-500 focus:ring-slate-500 sm:text-sm" />
              {errors[id] && <p id={`${id}-error`} className="mt-1 text-sm text-red-600">{errors[id]?.message}</p>}
            </div>
          ))}
        </fieldset>
        <div className="mt-6 flex flex-wrap justify-between gap-3">
          {step === 1 && <button type="button" onClick={() => changeStep(0)} className={secondary}>← Edit vehicle details</button>}
          <button type="submit" className={`${primary} ml-auto`}>{step === 0 ? "Continue to condition →" : "Continue to photos →"}</button>
        </div>
      </form>
      {step === 2 && <>
        <PhotoChecklist checked={photoChecklist} onChange={setPhotoChecklist} />
        <div className="mb-5 rounded-xl border-2 border-dashed border-slate-200 p-6 text-center">
          <p className="mb-3 text-sm text-slate-600">Include exterior, interior, and detail shots.</p>
          <CldUploadWidget uploadPreset="auctions" options={{ resourceType: "image", clientAllowedFormats: ["jpg", "jpeg", "png", "webp"], maxFiles: MAX_LISTING_PHOTOS - images.length, multiple: true }} onSuccess={(result) => {
            if (typeof result.info !== "object" || !result.info.secure_url) return;
            const url = result.info.secure_url;
            setImages((current) => current.includes(url) ? current : [...current, url].slice(0, MAX_LISTING_PHOTOS));
            setError("");
          }} onError={() => setError("Photo upload failed. Please try again.")}>
            {({ open }) => <button type="button" disabled={images.length >= MAX_LISTING_PHOTOS} onClick={() => open()} className={secondary}>{images.length ? "Add more photos" : "Add photos"}</button>}
          </CldUploadWidget>
          <p aria-live="polite" className="mt-3 text-xs text-slate-500">{images.length} / {MAX_LISTING_PHOTOS} photos · At least one required</p>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {images.map((url, index) => <div key={url} className="overflow-hidden rounded-xl border border-slate-200">
            <CldImage src={url} width={400} height={280} crop="fill" alt={`Vehicle photo ${index + 1}`} className="aspect-[4/3] w-full object-cover" />
            <div className="flex flex-wrap items-center justify-between gap-2 p-2 text-xs">
              {index === 0 ? <span className="font-bold text-slate-700">Cover photo</span> : <button type="button" onClick={() => setImages((current) => [url, ...current.filter((image) => image !== url)])} className="underline">Make cover<span className="sr-only"> photo {index + 1}</span></button>}
              {index > 0 && <button type="button" aria-label={`Move photo ${index + 1} earlier`} onClick={() => setImages((current) => { const next = [...current]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next; })} className="p-1 underline">Move earlier</button>}
              <button type="button" aria-label={`Remove photo ${index + 1}`} onClick={() => setImages((current) => current.filter((image) => image !== url))} className="p-1 text-red-700 underline">Remove</button>
            </div>
          </div>)}
        </div>
        <RecordUploads records={records} onChange={setRecords} />
        <div className="mt-6 flex flex-wrap justify-between gap-3"><button type="button" onClick={() => changeStep(1)} className={secondary}>← Edit condition</button><button type="button" onClick={() => images.length ? changeStep(3) : setError("Add at least one photo to preview your listing.")} className={primary}>Preview listing →</button></div>
      </>}
      {step === 3 && <>
        <div className="mb-5 flex flex-wrap gap-3"><button type="button" disabled={isLoading} onClick={() => changeStep(0)} className={secondary}>Edit details</button><button type="button" disabled={isLoading} onClick={() => changeStep(1)} className={secondary}>Edit condition</button><button type="button" disabled={isLoading} onClick={() => changeStep(2)} className={secondary}>Edit photos</button></div>
        <article className="overflow-hidden rounded-xl border border-slate-200">
          <CldImage src={images[0]} width={1000} height={650} crop="fit" alt={`${title}, cover photo`} className="max-h-[440px] w-full bg-slate-100 object-contain" />
          <div className="p-5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-700">Listing preview · Not submitted</p>
            <h3 className="break-words text-2xl font-bold">{title}</h3>
            <dl className="my-5 grid grid-cols-2 gap-4 text-sm"><div><dt className="text-slate-500">Mileage</dt><dd className="font-semibold">{Number(details.miles).toLocaleString()} miles</dd></div><div><dt className="text-slate-500">Location</dt><dd className="break-words font-semibold">{details.location}</dd></div><div><dt className="text-slate-500">Reserve price</dt><dd className="font-semibold">{details.reservePrice === "" ? "No reserve" : `$${Number(details.reservePrice).toLocaleString()}`}</dd></div></dl>
            <dl className="mb-5 grid grid-cols-2 gap-4 text-sm">{vehicleSpecificationFields.map(({ id, label }) => <div key={id}><dt className="text-slate-500">{label}</dt><dd className="font-semibold">{details[id]}</dd></div>)}</dl>
            <p className="mb-4 text-sm"><strong>VIN / chassis (seller-reported):</strong> {details.vin || "Not provided"}</p>
            <VehicleRecords records={records} headingLevel={4} />
            <h4 className="mb-2 mt-5 font-semibold">About this vehicle</h4><p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">{details.description}</p>
            <div className="mt-6"><VehicleHistory details={details} headingLevel={4} /></div>
            <h4 className="mb-3 mt-6 font-semibold">Photos ({images.length})</h4>
            <div className="grid grid-cols-2 gap-3">{images.map((url, index) => <CldImage key={url} src={url} width={600} height={450} crop="fit" alt={`${title}, photo ${index + 1}`} className="aspect-[4/3] w-full rounded-lg bg-slate-100 object-contain" />)}</div>
          </div>
        </article>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-500">Ready? Submit to create your listing.</p><button type="button" disabled={isLoading || draft.status === "conflict"} onClick={submitListing} className={primary}>{isLoading ? "Submitting…" : "Submit listing"}</button></div>
      </>}
      </fieldset>
    </div>
  );
}
