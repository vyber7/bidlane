import type { Metadata } from "next";
import NotificationsCenter from "@/app/account/components/NotificationsCenter";
import { getAccountUser } from "@/app/account/lib/current-user";
import { getNotificationFeed } from "@/app/account/lib/notifications";
import { getNativeRepositories } from "@/app/libs/native-repositories";
import EmailNotificationSettings from "@/app/account/components/EmailNotificationSettings";

export const metadata: Metadata = { title: "Notifications" };

export default async function Notifications({ searchParams }: {
  searchParams: Promise<{ view?: string | string[] }>;
}) {
  const currentUser = await getAccountUser();
  if (!currentUser) return null;
  const { view } = await searchParams;
  const initialView = (Array.isArray(view) ? view[0] : view) === "unread" ? "unread" : "all";
  const [initialFeed, preferences] = await Promise.all([
    getNotificationFeed(currentUser.id, { unreadOnly: initialView === "unread" }),
    getNativeRepositories().users.preferences(currentUser.id),
  ]);
  return (
    <div key={currentUser.id}>
      <EmailNotificationSettings initialEnabled={preferences?.outbidEmailsEnabled ?? true} />
      <EmailNotificationSettings preference="endingSoonEmailsEnabled" initialEnabled={preferences?.endingSoonEmailsEnabled ?? true} />
      <NotificationsCenter initialFeed={initialFeed} initialView={initialView} userId={currentUser.id} />
    </div>
  );
}
