import Link from "next/link";
import { FiArrowRight, FiInfo, FiMail, FiShield } from "react-icons/fi";

export type LegalSection = { id: string; title: string; content: React.ReactNode };

type Props = {
  eyebrow: string;
  title: string;
  description: string;
  effectiveDate: string;
  sections: LegalSection[];
  companion: { label: string; href: string };
};

export default function LegalDocument({ eyebrow, title, description, effectiveDate, sections, companion }: Props) {
  return (
    <main className="bg-stone-50 pt-16">
      <header className="relative overflow-hidden bg-slate-950 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_18%,rgba(245,158,11,0.2),transparent_31%)]" />
        <div className="absolute -bottom-32 -left-32 h-72 w-72 rounded-full border border-white/[0.06]" />
        <div className="relative mx-auto max-w-6xl px-5 py-14 sm:px-6 lg:px-8 lg:py-20">
          <p className="flex items-center gap-3 text-xs font-bold uppercase tracking-[0.22em] text-amber-400"><span className="h-px w-8 bg-amber-400" /> {eyebrow}</p>
          <h1 className="mt-5 max-w-4xl text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl">{title}</h1>
          <p className="mt-6 max-w-2xl text-base leading-8 text-slate-300 sm:text-lg">{description}</p>
          <p className="mt-7 text-sm font-semibold text-slate-400">Effective {effectiveDate}</p>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-12 sm:px-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-16 lg:px-8 lg:py-20">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <nav aria-label={`${title} sections`} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.03]">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-600">On this page</p>
            <ol className="mt-4 space-y-1">
              {sections.map((section, index) => (
                <li key={section.id}>
                  <a href={`#${section.id}`} className="flex gap-3 rounded-lg px-2 py-2 text-sm leading-5 text-slate-600 transition hover:bg-amber-50 hover:text-slate-950">
                    <span className="font-mono text-xs font-bold text-slate-400">{String(index + 1).padStart(2, "0")}</span>{section.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
          <div className="mt-4 rounded-2xl bg-amber-100 p-5">
            <FiInfo className="text-amber-700" size={20} aria-hidden="true" />
            <p className="mt-3 text-sm leading-6 text-slate-700">This document works together with our <Link href={companion.href} className="font-bold underline decoration-amber-500 underline-offset-4">{companion.label}</Link>.</p>
          </div>
        </aside>

        <article className="min-w-0">
          <div className="mb-10 flex items-start gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-slate-700">
            <FiShield className="mt-0.5 shrink-0 text-amber-700" size={20} aria-hidden="true" />
            <p>We wrote this policy to be readable. Section headings and summaries help you navigate, but the full text governs your use of Bidlane.</p>
          </div>
          <div className="space-y-12">
            {sections.map((section, index) => (
              <section key={section.id} id={section.id} className="scroll-mt-28 border-b border-slate-200 pb-12 last:border-0">
                <div className="flex items-baseline gap-4">
                  <span className="font-mono text-sm font-bold text-amber-600">{String(index + 1).padStart(2, "0")}</span>
                  <h2 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">{section.title}</h2>
                </div>
                <div className="mt-5 space-y-4 text-[15px] leading-7 text-slate-600 [&_a]:font-semibold [&_a]:text-slate-950 [&_a]:underline [&_a]:decoration-amber-400 [&_a]:decoration-2 [&_a]:underline-offset-4 [&_h3]:pt-2 [&_h3]:text-base [&_h3]:font-bold [&_h3]:text-slate-900 [&_li]:pl-1 [&_strong]:font-bold [&_strong]:text-slate-800 [&_ul]:ml-5 [&_ul]:list-disc [&_ul]:space-y-2">{section.content}</div>
              </section>
            ))}
          </div>
          <div className="mt-4 rounded-3xl bg-slate-950 p-7 text-white sm:flex sm:items-center sm:justify-between sm:p-9">
            <div><FiMail className="text-amber-400" size={22} aria-hidden="true" /><h2 className="mt-4 text-2xl font-black">Questions about this policy?</h2><p className="mt-2 text-sm leading-6 text-slate-400">We&apos;re happy to clarify how these terms apply to your use of Bidlane.</p></div>
            <Link href="/contact" className="mt-6 inline-flex items-center gap-2 rounded-full bg-amber-400 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-amber-300 sm:mt-0">Contact us <FiArrowRight aria-hidden="true" /></Link>
          </div>
        </article>
      </div>
    </main>
  );
}
