import { correctionRoute } from "../correction-route";

/** Adds one uploaded photo to the Listing's gallery as a Correction. */
export const POST = correctionRoute({
  correction: ({ imageUrl }) => ({ kind: "galleryPhoto", url: imageUrl }),
  respond: ({ changed }, { imageUrl }) => ({ message: changed ? "Image uploaded successfully" : "Image already saved", imageUrl }),
  failure: { event: "listing.photo_save_failed", message: "Failed to save image" },
});
