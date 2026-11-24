// Placeholder bar for loading.tsx skeletons. Pass size and tone (e.g. "h-4 w-24 bg-slate-100").
export function Bone({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`rounded motion-safe:animate-pulse ${className.includes("bg-") ? "" : "bg-slate-200 "}${className}`} />;
}

// Holds a text line's height so a shorter Bone inside doesn't shrink the layout.
export function Line({ className = "h-5", children }: { className?: string; children: React.ReactNode }) {
  return <div className={`flex items-center ${className}`}>{children}</div>;
}

// The one named, busy status a loading skeleton exposes to assistive tech.
export function LoadingStatus({ label }: { label: string }) {
  return <p role="status" className="sr-only">{label}…</p>;
}
