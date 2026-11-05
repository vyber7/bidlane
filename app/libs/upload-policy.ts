export const MAX_UPLOAD_BYTES = 4_000_000;
export const MAX_UPLOAD_BODY_BYTES = MAX_UPLOAD_BYTES + 65_536;
export const UPLOAD_KINDS = ["PHOTO", "RECORD", "PROFILE"] as const;
export type UploadKind = (typeof UPLOAD_KINDS)[number];

export function uploadFormats(kind: UploadKind) {
  return kind === "RECORD" ? ["jpg", "png", "webp", "pdf"] : ["jpg", "png", "webp"];
}

export function uploadAccept(kind: UploadKind) {
  return kind === "RECORD" ? "image/jpeg,image/png,image/webp,application/pdf" : "image/jpeg,image/png,image/webp";
}
