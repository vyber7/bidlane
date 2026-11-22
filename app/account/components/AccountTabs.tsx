"use client";

import { useId, type KeyboardEvent, type ReactNode } from "react";
import { formatAmount } from "@/app/utils/format";

export function updateAccountUrl(updates: Record<string, string>, replace = false) {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(updates)) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  if (url.href === window.location.href) return;
  if (replace) window.history.replaceState(null, "", url);
  else window.history.pushState(null, "", url);
}

type Tab<T extends string> = { id: T; label: string; count: number };

export default function AccountTabs<T extends string>({ label, tabs, selected, onChange, children }: {
  label: string;
  tabs: readonly Tab<T>[];
  selected: T;
  onChange: (tab: T) => void;
  children: ReactNode;
}) {
  const id = useId();

  function handleKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    switch (event.key) {
      case "ArrowLeft":
        next = (index + tabs.length - 1) % tabs.length;
        break;
      case "ArrowRight":
        next = (index + 1) % tabs.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = tabs.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const nextTab = tabs[next].id;
    document.getElementById(`${id}-${nextTab}-tab`)?.focus();
    onChange(nextTab);
  }

  return (
    <>
      <div className="border-b border-gray-200 px-4 sm:px-6">
        <div className="flex flex-wrap gap-x-5" role="tablist" aria-label={label}>
          {tabs.map(({ id: tab, label, count }, index) => {
            const active = selected === tab;
            return (
              <button
                key={tab}
                id={`${id}-${tab}-tab`}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`${id}-${tab}-panel`}
                tabIndex={active ? 0 : -1}
                onClick={() => onChange(tab)}
                onKeyDown={(event) => handleKey(event, index)}
                className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gray-900 ${
                  active ? "border-gray-950 text-gray-950" : "border-transparent text-gray-500 hover:text-gray-900"
                }`}
              >
                {label}{" "}
                <span className={`ml-2 rounded-full px-2 py-0.5 text-xs tabular-nums ${active ? "bg-gray-950 text-white" : "bg-gray-100 text-gray-600"}`}>
                  {formatAmount(count)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      {tabs.map(({ id: tab }) => (
        <div
          key={tab}
          id={`${id}-${tab}-panel`}
          role="tabpanel"
          aria-labelledby={`${id}-${tab}-tab`}
          tabIndex={selected === tab ? 0 : undefined}
          hidden={selected !== tab}
          className="focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gray-900"
        >
          {selected === tab && children}
        </div>
      ))}
    </>
  );
}
