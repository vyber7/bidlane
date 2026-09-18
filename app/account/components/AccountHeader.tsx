import { capitalize } from "@/app/utils/format";
import { FiUser } from "react-icons/fi";

const AccountHeader = ({ userName }: { userName: string | undefined }) => {
  const greeting = userName ? capitalize(userName) : "there";

  return (
    <header className="col-span-4 mt-16 overflow-hidden rounded-xl bg-gradient-to-br from-gray-950 via-gray-900 to-gray-800 px-6 py-7 text-white shadow-sm sm:px-8 sm:py-9">
      <div className="flex items-center gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-xl ring-1 ring-inset ring-white/15">
          <FiUser />
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400">
            My account
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
            Welcome back, {greeting}.
          </h1>
        </div>
      </div>
    </header>
  );
};

export default AccountHeader;
