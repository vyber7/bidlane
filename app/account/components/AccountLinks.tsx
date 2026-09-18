"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FiBell,
  FiCreditCard,
  FiGrid,
  FiPackage,
  FiUser,
} from "react-icons/fi";

const AccountLinks = () => {
  const pathname = usePathname();
  const links = [
    { name: "Profile", href: "/account/profile", icon: FiUser },
    { name: "Notifications", href: "/account/notifications", icon: FiBell },
    { name: "Listings", href: "/account/listings", icon: FiGrid },
    { name: "Bids & Wins", href: "/account/bids-and-wins", icon: FiCreditCard },
    { name: "Shipments", href: "/account/shipments", icon: FiPackage },
  ];

  return (
    <ul className="col-span-4 flex h-fit gap-1 overflow-x-auto rounded-xl border border-gray-200 bg-white p-2 shadow-sm lg:col-span-1 lg:flex-col">
      {links.map((link) => {
        const active = pathname === link.href;
        const Icon = link.icon;

        return (
          <li key={link.href} className="shrink-0 lg:w-full">
            <Link
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${
                active
                  ? "bg-gray-950 text-white"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-950"
              }`}
            >
              <Icon className="text-base" />
              {link.name}
            </Link>
          </li>
        );
      })}
    </ul>
  );
};

export default AccountLinks;
