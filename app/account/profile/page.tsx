import Link from "next/link";
import EmailVerification from "@/app/account/components/EmailVerification";
import ProfileEditor from "@/app/account/components/ProfileEditor";
import { getAccountUser } from "@/app/account/lib/current-user";

const Profile = async () => {
  const currentUser = await getAccountUser();
  if (!currentUser) return null;

  return (
    <div className="space-y-5">
      <EmailVerification verified={Boolean(currentUser.emailVerified)} />
      <Link href={`/sellers/${currentUser.id}`} className="inline-block text-sm font-bold underline">View your public seller profile</Link>
      <ProfileEditor
        user={{
          name: currentUser.name ?? "",
          email: currentUser.email ?? "",
          image: currentUser.image ?? "",
          createdAt: currentUser.createdAt.toISOString(),
          hasPassword: currentUser.hasPassword,
        }}
      />
    </div>
  );
};

export default Profile;
