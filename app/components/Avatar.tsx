import Image from "next/image";
import { FiUser } from "react-icons/fi";
import type { FullUserType } from "../types";

interface AvatarProps {
  user: FullUserType;
}

const Avatar: React.FC<AvatarProps> = ({ user }) => {
  const name = user.name?.trim() || user.email?.trim() || "";
  const initials = name
    .split(/\s|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  if (user.image?.trim()) {
    return (
      <Image
        src={user.image}
        alt={name ? `${name}'s profile photo` : "Profile photo"}
        width={28}
        height={28}
        unoptimized
        className="h-7 w-7 shrink-0 rounded-full object-cover"
      />
    );
  }

  return (
    <span
      role="img"
      aria-label={name ? `${name}'s account avatar` : "Account avatar"}
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-gray-800 to-gray-950 text-[11px] font-bold leading-none text-white"
    >
      {initials || <FiUser aria-hidden="true" />}
    </span>
  );
};

export default Avatar;
