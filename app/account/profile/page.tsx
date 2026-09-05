import getCurrentUser from "@/app/actions/getCurrentUser";
import AccountLinks from "@/app/account/components/AccountLinks";
import AccountHeader from "@/app/account/components/AccountHeader";
import Avatar from "@/app/components/Avatar";
import Button from "@/app/components/Button";

export const dynamic = "force-dynamic";

const Profile = async () => {
  const currentUser = await getCurrentUser();
  return (
    <>
      <div className="m-auto max-w-5xl grid grid-cols-4 gap-4 pb-4 px-2 lg:px-0">
        <AccountHeader userName={currentUser?.name?.split(" ")[0]} />
        <AccountLinks />
        <div className="lg:col-span-3 col-span-4 flex justify-between bg-white rounded-md shadow-md shadow-gray-400 p-4">
          <div className="flex flex-col gap-2 ">
            <h2 className="py-2">Name: {currentUser?.name}</h2>
            <h2 className="py-2">Email: {currentUser?.email}</h2>
            <h2 className="py-2">Password: ************</h2>
            <Button>Edit Info</Button>
          </div>
          <div>
            <Avatar user={currentUser!} />
            <button className="text-center w-full">Edit Image</button>
          </div>
        </div>
      </div>
    </>
  );
};

export default Profile;
