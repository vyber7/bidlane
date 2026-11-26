"use client";
import AuthorizedUploadButton from "@/app/components/AuthorizedUploadButton";
import { MAX_UPLOAD_SIZE_LABEL } from "@/app/libs/upload-policy";
import { useId, useState } from "react";
import { MAX_VEHICLE_RECORDS, vehicleRecordSchema, type VehicleRecord } from "@/app/schemas/vehicle-trust";
import useUndo from "@/app/hooks/useUndo";
import UndoNotice from "@/app/components/UndoNotice";

export default function RecordUploads({ records, onChange, listingId, validationErrors }: {
  listingId?: string;
  records: VehicleRecord[];
  onChange: (records: VehicleRecord[]) => void;
  validationErrors?: Record<string, string>;
}) {
  const [error, setError] = useState("");
  const id = useId();
  const recordUndo = useUndo();
  const groupError = validationErrors?.vehicleRecords;
  return <section
    data-listing-error={groupError ? "" : undefined}
    tabIndex={groupError ? -1 : undefined}
    aria-describedby={groupError ? `${id}-error` : undefined}
    className="mt-6 rounded-xl border border-slate-200 p-5"
  >
    <h3 className="font-bold">Vehicle Records (Optional)</h3>
    <p className="mt-2 text-sm leading-6 text-slate-600">Share service receipts, inspection reports, or vehicle history as PDFs or images. These files will be public. Redact addresses, phone numbers, signatures, and other personal details before uploading.</p>
    <AuthorizedUploadButton kind="RECORD" listingId={listingId} disabled={records.length >= MAX_VEHICLE_RECORDS} className="mt-4 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950 disabled:opacity-50" onUpload={(url) => {
      recordUndo.dismiss();
      const record = { label: `Vehicle record ${records.length + 1}`, url };
      if (!vehicleRecordSchema.safeParse(record).success) { setError("Upload a PDF, JPG, PNG, or WebP record."); return; }
      onChange([...records, record].slice(0, MAX_VEHICLE_RECORDS)); setError("");
    }}>Upload Vehicle Record</AuthorizedUploadButton>
    <p className="mt-2 text-xs tabular-nums text-slate-500">{records.length} / {MAX_VEHICLE_RECORDS} records · PDF, JPG, PNG, WebP · Up to {MAX_UPLOAD_SIZE_LABEL} each</p>
    {error && <p role="alert" className="mt-2 text-sm text-rose-700">{error}</p>}
    {groupError && <p id={`${id}-error`} role="alert" className="mt-2 text-sm text-rose-700">{groupError}</p>}
    <UndoNotice notice={recordUndo.notice} onUndo={recordUndo.undo} className="mt-3" />
    <ul className="mt-4 space-y-3">{records.map((record, index) => {
      const fieldId = `${id}-record-${index}`;
      const labelError = validationErrors?.[`vehicleRecords.${index}.label`];
      const fileError = validationErrors?.[`vehicleRecords.${index}.url`];
      return <li key={`${record.url}-${index}`} className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <label htmlFor={fieldId} className="text-sm font-semibold">Record {index + 1} name</label>
          <input id={fieldId} name={`vehicleRecords.${index}.label`} autoComplete="off" spellCheck={false} value={record.label} maxLength={100} aria-invalid={!!labelError} aria-describedby={labelError ? `${fieldId}-error` : undefined} onChange={(event) => onChange(records.map((item, i) => i === index ? { ...item, label: event.target.value } : item))} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 aria-[invalid=true]:border-rose-600" />
        </div>
        <a href={record.url} target="_blank" rel="noopener noreferrer" className="py-2 text-sm underline hover:text-amber-700">View<span className="sr-only"> record {index + 1} (opens in a new tab)</span></a>
        <button type="button" data-listing-error={fileError ? "" : undefined} aria-describedby={fileError ? `${fieldId}-file-error` : undefined} onClick={() => {
          const previous = records;
          onChange(records.filter((_, i) => i !== index));
          recordUndo.offer(`${record.label || `Record ${index + 1}`} removed.`, () => onChange(previous));
        }} className="py-2 text-sm text-rose-700 underline hover:text-rose-900">Remove<span className="sr-only"> record {index + 1}</span></button>
        {labelError && <p id={`${fieldId}-error`} role="alert" className="mt-1 w-full text-sm text-rose-700">{labelError}</p>}
        {fileError && <p id={`${fieldId}-file-error`} role="alert" className="mt-1 w-full text-sm text-rose-700">{fileError}</p>}
      </li>;
    })}</ul>
  </section>;
}
