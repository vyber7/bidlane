import Image from "next/image";
import { FullUserType } from "../types";

interface AvatarProps {
  user: FullUserType;
}

const Avatar: React.FC<AvatarProps> = ({ user }) => {
  const userImg =
    user?.image ?? "/images/default-profile-picture-avatar-png-green.png";
  return (
    <Image
      className="profile-image rounded-full object-cover"
      src={userImg}
      width={28}
      height={28}
      alt="profile image"
    />
  );
};

export default Avatar;
