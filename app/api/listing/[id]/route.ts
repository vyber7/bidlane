import { correctionRoute } from "./correction-route";

export const PATCH = correctionRoute({
  correction: ({ revision, data, coverImage }) => ({ kind: "details", revision, data, coverImage }),
  respond: ({ reviewStatus, reviewRevision }) => ({ saved: true, reviewStatus, reviewRevision }),
  failure: { event: "listing.edit_failed", message: "Could not save your listing. Please try again." },
});
