import NotificationsCenter from "@/app/account/components/NotificationsCenter";
import { getAccountUser } from "@/app/account/lib/current-user";
import { getNotificationFeed } from "@/app/account/lib/notifications";

export default async function Notifications() {
  const currentUser = await getAccountUser();
  if (!currentUser) return null;
  const initialFeed = await getNotificationFeed(currentUser.id);
  return <NotificationsCenter key={currentUser.id} initialFeed={initialFeed} userId={currentUser.id} />;
}
