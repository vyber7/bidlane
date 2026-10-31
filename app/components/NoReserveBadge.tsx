interface NoReserveBadgeProps {
  reservePrice: number | null;
}

export default function NoReserveBadge({ reservePrice }: NoReserveBadgeProps) {
  if (reservePrice !== null) return null;

  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-amber-400 px-2.5 py-1 text-xs font-bold leading-4 text-slate-950">
      No reserve
    </span>
  );
}
