"use client";

import { createContext, useContext, useEffect, useRef } from "react";

type Announce = (message: string) => void;

const InventoryAnnouncements = createContext<Announce | null>(null);

/** Lets inventory cards announce through the browser's single status region. */
export const InventoryAnnouncementsProvider = InventoryAnnouncements.Provider;

/**
 * Announces a card's price after it changes, never on first render. Outside an
 * inventory browser there is no shared region, so nothing is announced.
 */
export function useAnnouncePriceChange(message: string, amount: number | null) {
  const announce = useContext(InventoryAnnouncements);
  const previous = useRef(amount);

  useEffect(() => {
    if (previous.current === amount) return;
    previous.current = amount;
    announce?.(message);
  }, [amount, announce, message]);
}
