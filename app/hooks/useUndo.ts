"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const UNDO_WINDOW_MS = 8000;

/**
 * Offers a short window to reverse a removal. Offering a new undo replaces
 * the previous one, which then becomes permanent.
 */
export default function useUndo(windowMs = UNDO_WINDOW_MS) {
  const [notice, setNotice] = useState<{ message: string; id: number } | null>(null);
  const restore = useRef<(() => void) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    restore.current = null;
    setNotice(null);
  }, []);

  const offer = useCallback((nextMessage: string, nextRestore: () => void) => {
    if (timer.current) clearTimeout(timer.current);
    restore.current = nextRestore;
    setNotice((current) => ({ message: nextMessage, id: (current?.id ?? 0) + 1 }));
    timer.current = setTimeout(dismiss, windowMs);
  }, [dismiss, windowMs]);

  const undo = useCallback(() => {
    const pending = restore.current;
    dismiss();
    pending?.();
  }, [dismiss]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return { notice, offer, undo, dismiss };
}
