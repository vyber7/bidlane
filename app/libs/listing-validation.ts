export const MAX_LISTING_PHOTOS = 10;
export const MAX_LISTING_NUMBER = 2147483647;

export function validateListing(data: unknown) {
  if (!data || typeof data !== "object") return "Please provide listing details.";
  const values = data as Record<string, unknown>;
  for (const key of ["make", "model", "location", "description"]) {
    if (typeof values[key] !== "string" || !values[key].trim()) {
      return `Please enter a ${key}.`;
    }
  }
  for (const key of ["year", "miles", "reservePrice"]) {
    const value = values[key];
    if (key === "reservePrice" && (value === "" || value == null)) continue;
    if ((typeof value !== "string" && typeof value !== "number") || String(value).trim() === "") return `Please enter a valid ${key}.`;
    const number = Number(value);
    const min = key === "year" ? 1886 : 0;
    const max = key === "year" ? new Date().getFullYear() + 1 : MAX_LISTING_NUMBER;
    if (!Number.isInteger(number) || number < min || number > max) return `Please enter a valid ${key}.`;
  }
  if (!Array.isArray(values.images) || values.images.length < 1 || values.images.length > MAX_LISTING_PHOTOS) {
    return `Please add between 1 and ${MAX_LISTING_PHOTOS} photos.`;
  }
  if (values.images.some((image) => {
    if (typeof image !== "string") return true;
    try {
      const url = new URL(image);
      return url.protocol !== "https:" || url.hostname !== "res.cloudinary.com" || !url.pathname.includes("/image/upload/");
    } catch { return true; }
  })) return "Please use uploaded images for your listing.";
  return null;
}
