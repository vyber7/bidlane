interface DescriptionProps {
  description: string;
}

const Description: React.FC<DescriptionProps> = ({ description }) => (
  <section id="overview" className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
    <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">From the seller</p>
    <h2 className="mb-4 text-2xl font-bold tracking-tight">About this vehicle</h2>
    <p className="max-w-3xl whitespace-pre-wrap break-words leading-7 text-slate-600">{description || "The seller has not added a description yet."}</p>
  </section>
);
export default Description;
