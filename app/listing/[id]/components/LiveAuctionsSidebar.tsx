import Link from "next/link";
import type { ReactNode } from "react";

export default function LiveAuctionsSidebar({ children }: { children: ReactNode }) {
  return (
    <div className="order-3 isolate space-y-5">
      {/* This short container limits sticky travel to the space occupied by the link. */}
      <div className="rounded-2xl bg-stone-50 lg:sticky lg:top-[calc(var(--preview-banner-height)+5rem)] lg:z-10">
        {children}
      </div>
      <Link
        href="/faq"
        className="block px-2 text-sm text-slate-500 hover:text-slate-950"
      >
        New to BidLane? Learn how bidding works →
      </Link>
    </div>
  );
}
