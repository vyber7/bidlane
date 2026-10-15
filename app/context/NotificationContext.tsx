"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import usePusherEvent from "@/app/hooks/usePusherEvent";
import type { NotificationSummary } from "@/app/types/account";

type NotificationState = {
  summary: NotificationSummary | null;
  version: number;
  refresh: () => Promise<void>;
};
const NotificationContext = createContext<NotificationState | null>(null);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const email = session?.user?.email ?? null;
  return <AccountNotifications key={email ?? "signed-out"} email={email}>{children}</AccountNotifications>;
}

function AccountNotifications({ email, children }: { email: string | null; children: React.ReactNode }) {
  const [state, setState] = useState<{ summary: NotificationSummary | null; version: number }>({ summary: null, version: 0 });
  const requestNumber = useRef(0);
  const refresh = useCallback((): Promise<void> => {
    if (!email) return Promise.resolve();
    const request = ++requestNumber.current;
    return fetch("/api/notifications?summary=1", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) return;
      const summary: NotificationSummary = await response.json();
      if (request === requestNumber.current) setState((previous) => ({ summary, version: previous.version + 1 }));
    }).catch(() => {
      // Keep the last known count. Focus, reconnect, and polling retry it.
    });
  }, [email]);

  useEffect(() => {
    if (!email) return;
    void refresh();
    const refreshVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    const interval = setInterval(refreshVisible, 30000);
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      requestNumber.current += 1;
      clearInterval(interval);
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [email, refresh]);

  const channel = state.summary ? `private-user-${state.summary.userId}` : null;
  usePusherEvent(channel, "notifications-changed", () => { void refresh(); });
  usePusherEvent(channel, "pusher:subscription_succeeded", () => { void refresh(); });

  return <NotificationContext.Provider value={{ ...state, refresh }}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) throw new Error("Notifications must be rendered inside NotificationProvider");
  return context;
}
