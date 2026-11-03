"use client";
import { photoChecklistItems, type DraftPayload } from "@/app/schemas/listing-draft";
export default function PhotoChecklist({ checked, onChange }: { checked: DraftPayload["photoChecklist"]; onChange: (value: DraftPayload["photoChecklist"]) => void }) {
  return <fieldset className="mb-5 rounded-xl border border-slate-200 bg-stone-50 p-5">
    <legend className="px-1 text-sm font-bold">Photo checklist</legend>
    <p className="mb-4 text-xs leading-5 text-slate-600">Use sharp, unfiltered photos of the actual car. Choose a clear exterior shot for the cover. Check off the views you’ve covered; this checklist is optional and isn’t shown to buyers.</p>
    <div className="grid gap-4 sm:grid-cols-2">{photoChecklistItems.map(({ id, label, hint }) => <label key={id} className="flex items-start gap-3">
      <input type="checkbox" checked={checked.includes(id)} onChange={(event) => onChange(event.target.checked ? [...checked, id] : checked.filter((item) => item !== id))} className="mt-0.5 rounded border-slate-300 text-amber-600 focus:ring-amber-500" />
      <span><span className="block text-sm font-bold">{label}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{hint}</span></span>
    </label>)}</div>
    <p aria-live="polite" className="mt-4 text-xs font-semibold text-slate-600">{checked.length} of {photoChecklistItems.length} views covered. Skip anything that doesn’t apply, and explain missing views in your description.</p>
  </fieldset>;
}
