"use client";

import { useRef, useState, type ReactNode } from "react";
import axios from "axios";
import { MAX_UPLOAD_BYTES, uploadAccept, type UploadKind } from "@/app/libs/upload-policy";
import { getApiErrorMessage } from "@/app/utils/api-error";

export default function AuthorizedUploadButton({ kind, listingId, maxFiles = 1, disabled, className, children, onUpload }: {
  kind: UploadKind;
  listingId?: string;
  maxFiles?: number;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
  onUpload: (url: string) => void | Promise<void>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  return <>
    <input ref={input} type="file" hidden aria-label="Choose upload files" accept={uploadAccept(kind)} multiple={maxFiles > 1} onChange={async (event) => {
      const files = Array.from(event.currentTarget.files ?? []);
      event.currentTarget.value = "";
      if (busy.current || disabled || !files.length) return;
      if (files.length > maxFiles) { setError(`Choose at most ${maxFiles} file${maxFiles === 1 ? "" : "s"}.`); return; }
      if (files.some((file) => !file.size || file.size > MAX_UPLOAD_BYTES)) { setError("Choose nonempty files no larger than 4 MB each."); return; }
      busy.current = true; setUploading(true); setError("");
      try {
        for (const file of files) {
          const body = new FormData();
          body.set("file", file); body.set("kind", kind);
          if (listingId) body.set("listingId", listingId);
          const { data } = await axios.post<{ url: string }>("/api/uploads", body);
          await onUpload(data.url);
        }
      } catch (error) { setError(getApiErrorMessage(error, "The file could not be uploaded. Please try again.")); }
      finally { busy.current = false; setUploading(false); }
    }} />
    <button type="button" disabled={disabled || uploading || maxFiles < 1} aria-busy={uploading} className={className} onClick={() => input.current?.click()}>{uploading ? "Uploading…" : children}</button>
    {error && <p role="alert" className="mt-2 text-sm text-rose-700">{error}</p>}
  </>;
}
