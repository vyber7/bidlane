import { FiCalendar, FiCheckCircle, FiEdit2, FiLock, FiMail, FiShield, FiUser } from "react-icons/fi";
import { Bone, Line } from "@/app/components/Skeleton";

// Mirrors EmailVerification, the public profile link, and ProfileEditor.
export default function Loading() {
  return (
    <div className="space-y-5" aria-label="Loading profile" aria-busy="true">
      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
        <Line className="h-7"><Bone className="h-5 w-40" /></Line>
        <Line className="mt-2"><Bone className="h-4 w-full max-w-lg bg-slate-100" /></Line>
      </section>
      <p className="text-sm font-bold underline underline-offset-2">View Your Public Seller Profile</p>
      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-5 py-5 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-gray-500">Personal details</p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight text-gray-950">Profile</h2>
              <p className="mt-1 text-sm text-gray-500">Keep your public name and profile photo up to date.</p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm font-bold text-gray-800">
              <FiEdit2 aria-hidden="true" /> Edit Profile
            </span>
          </div>
        </div>
        <div className="grid gap-8 p-5 sm:p-6 md:grid-cols-[180px_minmax(0,1fr)]">
          <div>
            <p className="mb-3 text-sm font-bold text-gray-900">Profile photo</p>
            <Bone className="h-32 w-32 rounded-2xl ring-4 ring-gray-100" />
          </div>
          <div className="min-w-0 space-y-5">
            <div>
              <span className="flex items-center gap-2 text-sm font-bold text-gray-600">
                <FiUser aria-hidden="true" className="text-gray-400" /> Full name
              </span>
              <Line className="mt-1 h-6"><Bone className="h-4 w-40" /></Line>
            </div>
            <div>
              <span className="flex items-center gap-2 text-sm font-bold text-gray-600">
                <FiMail aria-hidden="true" className="text-gray-400" /> Email address
              </span>
              <Line className="mt-1 h-6"><Bone className="h-4 w-56 max-w-full" /></Line>
              <p className="mt-1 text-xs text-gray-500">Your sign-in email can’t be changed here.</p>
            </div>
            <div className="grid gap-4 border-t border-gray-100 pt-5 sm:grid-cols-2">
              {[{ icon: FiCalendar, label: "Member since" }, { icon: FiLock, label: "Sign-in method" }].map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-start gap-3">
                  <Icon aria-hidden="true" className="mt-0.5 text-gray-400" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
                    <Line className="mt-1"><Bone className="h-4 w-28" /></Line>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="grid gap-px border-t border-gray-200 bg-gray-200 sm:grid-cols-2">
          <div className="flex gap-3 bg-white px-5 py-5 sm:px-6">
            <FiShield aria-hidden="true" className="mt-0.5 shrink-0 text-lg text-emerald-600" />
            <div>
              <p className="text-sm font-bold text-gray-950">Account protected</p>
              <p className="mt-1 text-xs leading-5 text-gray-500">Your profile details are only updated after an authenticated request.</p>
            </div>
          </div>
          <div className="flex gap-3 bg-white px-5 py-5 sm:px-6">
            <FiCheckCircle aria-hidden="true" className="mt-0.5 shrink-0 text-lg text-emerald-600" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-gray-950">Primary email</p>
              <Line className="mt-1"><Bone className="h-3 w-full max-w-xs bg-gray-100" /></Line>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
