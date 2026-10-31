interface DescriptionProps {
  description: string;
}

const Description: React.FC<DescriptionProps> = ({ description }) => {
  const noticeIndex = description.search(/(?:^|\n\s*\n)Illustrative listing:/i);
  const vehicleDescription = noticeIndex === -1 ? description : description.slice(0, noticeIndex).trimEnd();
  const illustrativeNotice = noticeIndex === -1 ? null : description.slice(noticeIndex).trim();

  return (
    <section
      id="overview"
      className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8"
    >
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
        From the seller
      </p>
      <h2 className="mb-4 text-2xl font-bold tracking-tight">
        About this vehicle
      </h2>
      {(vehicleDescription || !illustrativeNotice) && (
        <p className="max-w-3xl whitespace-pre-wrap break-words leading-7 text-slate-600">
          {vehicleDescription || "The seller has not added a description yet."}
        </p>
      )}
      {illustrativeNotice && (
        <details className="group mt-6 rounded-xl border border-slate-200 bg-slate-50">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-xl px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 [&::-webkit-details-marker]:hidden">
            Illustrative listing &amp; photo credits
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              fill="none"
              className="h-5 w-5 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
            >
              <path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </summary>
          <p className="whitespace-pre-wrap break-words border-t border-slate-200 px-4 py-4 text-sm leading-6 text-slate-600">
            {illustrativeNotice}
          </p>
        </details>
      )}
    </section>
  );
};
export default Description;
