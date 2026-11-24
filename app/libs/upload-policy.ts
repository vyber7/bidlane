export const MAX_UPLOAD_BYTES = 4_000_000;
/** MAX_UPLOAD_BYTES for people to read; the no-break space keeps it on one line. */
export const MAX_UPLOAD_SIZE_LABEL = "4 MB";
export const MAX_UPLOAD_BODY_BYTES = MAX_UPLOAD_BYTES + 65_536;
export const UPLOAD_KINDS = ["PHOTO", "RECORD", "PROFILE"] as const;
export type UploadKind = (typeof UPLOAD_KINDS)[number];

export function uploadFormats(kind: UploadKind) {
  return kind === "RECORD" ? ["jpg", "png", "webp", "pdf"] : ["jpg", "png", "webp"];
}

export function uploadAccept(kind: UploadKind) {
  return kind === "RECORD" ? "image/jpeg,image/png,image/webp,application/pdf" : "image/jpeg,image/png,image/webp";
}
