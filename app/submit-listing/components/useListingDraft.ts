"use client";
import axios from "axios";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DraftPayload, ListingDraftDTO } from "@/app/schemas/listing-draft";
import { getApiErrorMessage } from "@/app/utils/api-error";

function newDraftId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export default function useListingDraft(payload: DraftPayload, initialDraft: ListingDraftDTO | undefined, paused: boolean) {
  const meta = useRef(initialDraft ? { id: initialDraft.id, revision: initialDraft.revision } : null);
  const creatingId = useRef<string | null>(null);
  const pending = useRef<Promise<ListingDraftDTO> | null>(null);
  const retry = useRef<{ serialized: string; saveKey: string } | null>(null);
  const saved = useRef(initialDraft ? JSON.stringify(initialDraft.payload) : "");
  const blocked = useRef(false);
  const mounted = useRef(false);
  const [savedPayload, setSavedPayload] = useState(initialDraft ? JSON.stringify(initialDraft.payload) : JSON.stringify(payload));
  const [status, setStatus] = useState<"unsaved" | "saving" | "saved" | "error" | "conflict">(initialDraft ? "saved" : "unsaved");
  const [message, setMessage] = useState("");
  const serialized = JSON.stringify(payload);
  const dirty = serialized !== savedPayload;

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const save = useCallback((next: DraftPayload): Promise<ListingDraftDTO> => {
    const work = (pending.current ?? Promise.resolve()).catch(() => undefined).then(async () => {
      if (blocked.current) throw new Error("Reload this draft before saving again.");
      const persist = async (snapshot: DraftPayload): Promise<ListingDraftDTO> => {
        const serialized = JSON.stringify(snapshot);
        if (saved.current === serialized && meta.current) {
          if (mounted.current) { setStatus("saved"); setMessage(""); }
          return { ...meta.current, payload: snapshot, updatedAt: "", publishedListingId: null };
        }
        const saveKey = retry.current?.serialized === serialized ? retry.current.saveKey : crypto.randomUUID();
        retry.current = { serialized, saveKey };
        if (mounted.current) { setStatus("saving"); setMessage(""); }
        try {
          let draft: ListingDraftDTO;
          if (meta.current) {
            draft = (await axios.patch<ListingDraftDTO>(`/api/listing-drafts/${meta.current.id}`, { payload: snapshot, revision: meta.current.revision, saveKey })).data;
          } else {
            creatingId.current ??= newDraftId();
            draft = (await axios.post<ListingDraftDTO>("/api/listing-drafts", { id: creatingId.current, payload: snapshot, saveKey })).data;
          }
          meta.current = { id: draft.id, revision: draft.revision };
          saved.current = serialized; retry.current = null;
          if (mounted.current) {
            setSavedPayload(serialized); setStatus("saved");
            // Native history keeps refresh/resume pointed at this draft without
            // remounting or replacing inputs typed during a save.
            const url = new URL(window.location.href);
            if (url.pathname === "/submit-listing" && !url.searchParams.has("draft")) {
              url.searchParams.set("draft", draft.id);
              window.history.replaceState(null, "", url);
            }
          }
          return draft;
        } catch (error) {
          const conflict = axios.isAxiosError(error) && error.response?.status === 409;
          if (conflict) blocked.current = true;
          if (mounted.current) {
            setStatus(conflict ? "conflict" : "error");
            setMessage(getApiErrorMessage(error, "Draft not saved. Your changes are still here. Try saving again before leaving."));
          }
          throw error;
        }
      };
      // First resolve a lost response with its original key, then apply edits
      // made since that attempt. Both writes stay in the same serial queue.
      if (retry.current && retry.current.serialized !== JSON.stringify(next)) {
        await persist(JSON.parse(retry.current.serialized) as DraftPayload);
      }
      return persist(next);
    });
    pending.current = work;
    const clear = () => { if (pending.current === work) pending.current = null; };
    void work.then(clear, clear);
    return work;
  }, []);

  useEffect(() => {
    if (paused || blocked.current) return;
    const next = JSON.parse(serialized) as DraftPayload;
    const hasContent = Object.values(next.details).some((value) => value.trim()) || next.images.length || next.vehicleRecords.length || next.photoChecklist.length;
    if ((!hasContent && !meta.current && !creatingId.current) || serialized === saved.current) return;
    const timer = window.setTimeout(() => { void save(next).catch(() => undefined); }, 1500);
    return () => window.clearTimeout(timer);
  }, [serialized, save, paused]);

  useEffect(() => {
    if (!dirty && status !== "saving") return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, status]);

  return { save, status, message, dirty, saving: status === "saving" };
}
