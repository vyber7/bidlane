"use client";

import { useEffect, useRef } from "react";

/**
 * Announces a reversible removal and offers to undo it. The removed control
 * usually took focus with it, so a new notice moves focus to its Undo button.
 */
export default function UndoNotice({ notice, onUndo, className = "" }: {
  notice: { message: string; id: number } | null;
  onUndo: () => void;
  className?: string;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const noticeId = notice?.id;

  useEffect(() => {
    if (noticeId !== undefined) button.current?.focus();
  }, [noticeId]);

  return (
    <p role="status" className={notice ? `flex flex-wrap items-center gap-3 text-sm text-slate-700 ${className}` : "sr-only"}>
      {notice?.message}
      {notice && (
        <button
          ref={button}
          type="button"
          onClick={onUndo}
          className="rounded-md font-bold text-slate-950 underline underline-offset-4 hover:text-amber-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950"
        >
          Undo
        </button>
      )}
    </p>
  );
}
