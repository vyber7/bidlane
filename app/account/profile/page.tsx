import ProfileEditor from "@/app/account/components/ProfileEditor";
import { getAccountUser } from "@/app/account/lib/current-user";

const Profile = async () => {
  const currentUser = await getAccountUser();
  if (!currentUser) return null;

  return (
    <ProfileEditor
      user={{
        name: currentUser.name ?? "",
        email: currentUser.email ?? "",
        image: currentUser.image ?? "",
        createdAt: currentUser.createdAt.toISOString(),
        hasPassword: currentUser.hasPassword,
      }}
    />
  );
};

export default Profile;
