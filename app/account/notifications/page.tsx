import NotificationsCenter from "@/app/account/components/NotificationsCenter";
import { getAccountUser } from "@/app/account/lib/current-user";
import { getNotificationFeed } from "@/app/account/lib/notifications";
import prisma from "@/app/libs/prismadb";
import EmailNotificationSettings from "@/app/account/components/EmailNotificationSettings";

export default async function Notifications() {
  const currentUser = await getAccountUser();
  if (!currentUser) return null;
  const [initialFeed, preferences] = await Promise.all([
    getNotificationFeed(currentUser.id),
    prisma.user.findUnique({ where: { id: currentUser.id }, select: { outbidEmailsEnabled: true } }),
  ]);
  return <div key={currentUser.id}><EmailNotificationSettings initialEnabled={preferences?.outbidEmailsEnabled ?? true} /><NotificationsCenter initialFeed={initialFeed} userId={currentUser.id} /></div>;
}
