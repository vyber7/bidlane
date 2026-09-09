"use client";

import { FieldValues, useForm } from "react-hook-form";
import axios from "axios";
import toast from "react-hot-toast";
import { useEffect, useRef, useState } from "react";
import { CldImage, CldUploadWidget } from "next-cloudinary";
import { useRouter } from "next/navigation";
import { MAX_LISTING_NUMBER, MAX_LISTING_PHOTOS, validateListing } from "@/app/libs/listing-validation";

const steps = ["Vehicle details", "Photos", "Preview"];
const primary = "rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50";
const secondary = "rounded-lg border border-slate-300 px-4 py-3 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50";

export default function SubmitForm() {
  const [step, setStep] = useState(0);
  const [images, setImages] = useState<string[]>([]);
  const [details, setDetails] = useState<FieldValues>({});
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const submitting = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const router = useRouter();
  const { register, handleSubmit, formState: { errors } } = useForm<FieldValues>({
    defaultValues: { make: "", model: "", year: "", miles: "", reservePrice: "", location: "", description: "" },
  });
  useEffect(() => { heading.current?.focus(); }, [step]);
  const changeStep = (next: number) => { setError(""); setStep(next); };

  async function submitListing() {
    if (submitting.current) return;
    const data = { ...details, images };
    const validationError = validateListing(data);
    if (validationError) { setError(validationError); return; }
    submitting.current = true;
    setIsLoading(true);
    setError("");
    try {
      const response = await axios.post("/api/new-listing", { data });
      toast.success("Listing submitted successfully!");
      router.push(`/listing/${response.data.id}`);
      router.refresh();
    } catch (error) {
      setError(axios.isAxiosError(error) ? error.response?.data?.error || "Unable to submit. Please try again." : "Unable to submit. Please try again.");
      submitting.current = false;
      setIsLoading(false);
    }
  }

  const title = `${details.year || ""} ${details.make || ""} ${details.model || ""}`.trim();
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-8">
      <ol aria-label="Submission progress" className="mb-8 grid grid-cols-3 gap-2">
        {steps.map((label, index) => <li key={label} aria-current={step === index ? "step" : undefined} className={`border-t-4 pt-3 text-xs sm:text-sm ${step === index ? "border-amber-500 font-bold text-slate-900" : "border-slate-200 text-slate-500"}`}><span className="block text-xs">Step {index + 1}</span>{label}</li>)}
      </ol>
      <h2 ref={heading} tabIndex={-1} className="mb-2 text-xl font-bold outline-none">{steps[step]}</h2>
      <p className="mb-6 text-sm text-slate-500">{step === 0 ? "Tell buyers about your vehicle. You can edit everything before submitting." : step === 1 ? "Add up to 10 photos. The first photo will be your cover image." : "Review your listing below. Submit when everything looks right."}</p>
      {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <form hidden={step !== 0} onSubmit={handleSubmit((data) => { setDetails(data); changeStep(1); })}>
        <div className="grid gap-5 sm:grid-cols-2">
          {[{ id: "make", label: "Make", placeholder: "e.g. Porsche" }, { id: "model", label: "Model", placeholder: "e.g. 911 Carrera" }, { id: "year", label: "Year", type: "number", min: 1886, max: new Date().getFullYear() + 1 }, { id: "miles", label: "Mileage", type: "number", min: 0, max: MAX_LISTING_NUMBER }, { id: "reservePrice", label: "Reserve price in USD (optional)", type: "number", min: 0, max: MAX_LISTING_NUMBER }, { id: "location", label: "Location", placeholder: "City, State" }].map((field) => (
            <div key={field.id}>
              <label htmlFor={field.id} className="mb-2 block text-sm font-semibold">{field.label}</label>
              <input id={field.id} type={field.type || "text"} min={field.min} max={field.max} step={field.type === "number" ? 1 : undefined} placeholder={field.placeholder} aria-invalid={!!errors[field.id]} aria-describedby={errors[field.id] ? `${field.id}-error` : undefined}
                {...register(field.id, { validate: (value) => field.id === "reservePrice" || String(value).trim().length > 0 || `${field.label} is required.`, ...(field.type === "number" ? { min: { value: field.min!, message: `Minimum value is ${field.min}.` }, max: { value: field.max!, message: `Maximum value is ${field.max}.` } } : {}) })}
                className="w-full rounded-lg border-slate-300 focus:border-slate-500 focus:ring-slate-500" />
              {errors[field.id] && <p id={`${field.id}-error`} className="mt-1 text-sm text-red-600">{String(errors[field.id]?.message)}</p>}
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">Leave the reserve blank to list without a minimum sale price.</p>
        <label htmlFor="description" className="mb-2 mt-6 block text-sm font-semibold">Description</label>
        <textarea id="description" rows={6} placeholder="Describe the condition, service history, modifications, and any known issues." {...register("description", { validate: (value) => !!value.trim() || "Please add a description." })} aria-invalid={!!errors.description} aria-describedby={errors.description ? "description-error" : undefined} className="w-full rounded-lg border-slate-300 focus:border-slate-500 focus:ring-slate-500" />
        {errors.description && <p id="description-error" className="text-sm text-red-600">{String(errors.description.message)}</p>}
        <div className="mt-6 flex justify-end"><button type="submit" className={primary}>Continue to photos →</button></div>
      </form>
      {step === 1 && <>
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
              <button type="button" aria-label={`Remove photo ${index + 1}`} onClick={() => setImages((current) => current.filter((image) => image !== url))} className="p-1 text-red-700 underline">Remove</button>
            </div>
          </div>)}
        </div>
        <div className="mt-6 flex justify-between gap-3"><button type="button" onClick={() => changeStep(0)} className={secondary}>← Edit details</button><button type="button" onClick={() => images.length ? changeStep(2) : setError("Add at least one photo to preview your listing.")} className={primary}>Preview listing →</button></div>
      </>}
      {step === 2 && <>
        <div className="mb-5 flex flex-wrap gap-3"><button type="button" disabled={isLoading} onClick={() => changeStep(0)} className={secondary}>Edit details</button><button type="button" disabled={isLoading} onClick={() => changeStep(1)} className={secondary}>Edit photos</button></div>
        <article className="overflow-hidden rounded-xl border border-slate-200">
          <CldImage src={images[0]} width={1000} height={650} crop="fit" alt={`${title}, cover photo`} className="max-h-[440px] w-full bg-slate-100 object-contain" />
          <div className="p-5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-700">Listing preview · Not submitted</p>
            <h3 className="break-words text-2xl font-bold">{title}</h3>
            <dl className="my-5 grid grid-cols-2 gap-4 text-sm"><div><dt className="text-slate-500">Mileage</dt><dd className="font-semibold">{Number(details.miles).toLocaleString()} miles</dd></div><div><dt className="text-slate-500">Location</dt><dd className="break-words font-semibold">{details.location}</dd></div><div><dt className="text-slate-500">Reserve price</dt><dd className="font-semibold">{details.reservePrice === "" ? "No reserve" : `$${Number(details.reservePrice).toLocaleString()}`}</dd></div></dl>
            <h4 className="mb-2 font-semibold">About this vehicle</h4><p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">{details.description}</p>
            <h4 className="mb-3 mt-6 font-semibold">Photos ({images.length})</h4>
            <div className="grid grid-cols-2 gap-3">{images.map((url, index) => <CldImage key={url} src={url} width={600} height={450} crop="fit" alt={`${title}, photo ${index + 1}`} className="aspect-[4/3] w-full rounded-lg bg-slate-100 object-contain" />)}</div>
          </div>
        </article>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-500">Ready? Submit to create your listing.</p><button type="button" disabled={isLoading} onClick={submitListing} className={primary}>{isLoading ? "Submitting…" : "Submit listing"}</button></div>
      </>}
    </div>
  );
}
