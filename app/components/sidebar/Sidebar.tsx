"use client";

import { useSession } from "next-auth/react";

const Sidebar = ({ children }: { children: React.ReactNode }) => {
  const session = useSession();
  const user = session?.data?.user;
  return (
    <div className="h-full mt-11">
      <main className="lg:pl-20 h-full">
        {children}
        <p>Hello, {user?.email}!</p>
      </main>
    </div>
  );
};

export default Sidebar;
