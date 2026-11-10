import NotificationsCenter from "@/app/account/components/NotificationsCenter";
import { getAccountUser } from "@/app/account/lib/current-user";
import { getNotificationFeed } from "@/app/account/lib/notifications";
import { getNativeRepositories } from "@/app/libs/native-repositories";
import EmailNotificationSettings from "@/app/account/components/EmailNotificationSettings";

export default async function Notifications() {
  const currentUser = await getAccountUser();
  if (!currentUser) return null;
  const [initialFeed, preferences] = await Promise.all([
    getNotificationFeed(currentUser.id),
    getNativeRepositories().users.preferences(currentUser.id),
  ]);
  return <div key={currentUser.id}><EmailNotificationSettings initialEnabled={preferences?.outbidEmailsEnabled ?? true} /><EmailNotificationSettings preference="endingSoonEmailsEnabled" initialEnabled={preferences?.endingSoonEmailsEnabled ?? true} /><NotificationsCenter initialFeed={initialFeed} userId={currentUser.id} /></div>;
}
