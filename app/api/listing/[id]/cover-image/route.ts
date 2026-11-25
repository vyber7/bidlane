import { correctionRoute } from "../correction-route";

export const POST = correctionRoute({
  correction: ({ url }) => ({ kind: "coverPhoto", url }),
  respond: (_, { url }) => ({ message: "Cover image updated successfully", coverImageUrl: url }),
  failure: { event: "listing.cover_image_failed", message: "Failed to update cover image" },
});
