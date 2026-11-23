import { Bone, Line } from "./components/Skeleton";

// Fallback for routes without their own loading.tsx (static pages, sign-in,
// and the account area while its layout checks the session). Kept neutral
// so it doesn't promise a layout those pages don't have.
export default function Loading() {
  return (
    <div
      className="mx-auto max-w-6xl px-4 pb-16 pt-24 sm:px-6 lg:px-8"
      aria-label="Loading page"
      aria-busy="true"
    >
      <Line className="h-4"><Bone className="h-3 w-32 bg-slate-100" /></Line>
      <Line className="mt-2 h-9 sm:h-10"><Bone className="h-8 w-80 max-w-full" /></Line>
      <div className="mt-4 max-w-2xl space-y-2">
        <Bone className="h-4 w-full bg-slate-100" />
        <Bone className="h-4 w-4/5 bg-slate-100" />
      </div>
      <div className="mt-10 space-y-4">
        {Array.from({ length: 2 }, (_, index) => (
          <div key={index} className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
            <Bone className="h-6 w-48" />
            <div className="mt-4 space-y-3">
              <Bone className="h-4 w-full bg-slate-100" />
              <Bone className="h-4 w-full bg-slate-100" />
              <Bone className="h-4 w-2/3 bg-slate-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
