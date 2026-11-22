"use client";

import { useEffect } from "react";

let dirtyForms = 0;

function warnBeforeUnload(event: BeforeUnloadEvent) {
  event.preventDefault();
  event.returnValue = "";
}

function guardLink(event: MouseEvent) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
  if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
  const destination = new URL(link.href);
  const current = window.location;
  if (destination.origin !== current.origin ||
    (destination.pathname === current.pathname && destination.search === current.search)) return;
  if (!window.confirm("Leave this page and discard your unsaved changes?")) {
    event.preventDefault();
  }
}

export default function useUnsavedChangesWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    if (dirtyForms === 0) {
      window.addEventListener("beforeunload", warnBeforeUnload);
      document.addEventListener("click", guardLink, true);
    }
    dirtyForms += 1;
    return () => {
      dirtyForms -= 1;
      if (dirtyForms === 0) {
        window.removeEventListener("beforeunload", warnBeforeUnload);
        document.removeEventListener("click", guardLink, true);
      }
    };
  }, [dirty]);
}
