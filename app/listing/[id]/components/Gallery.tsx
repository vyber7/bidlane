"use client";

import {
  CldImage,
  type CloudinaryUploadWidgetResults,
} from "next-cloudinary";
import { useEffect, useRef, useState } from "react";
import { CldUploadButton } from "next-cloudinary";
import axios from "axios";
import toast from "react-hot-toast";
import clsx from "clsx";
import { logger } from "@/app/libs/logger";

interface GalleryProps {
  listingId: string;
  owner?: boolean;
  vehicleName?: string;
  initialImages?: string[];
}

interface GalleryImage {
  url: string;
}

const Gallery: React.FC<GalleryProps> = ({ listingId, owner, vehicleName = "Vehicle", initialImages }) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [selectedImage, setSelectedImage] = useState(0);
  const [images, setImages] = useState<string[]>(initialImages || []);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    // Fetch images for the given listingId
    let active = true;
    fetch(`/api/cloudinary-images?folder=listing-${listingId}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Image request failed: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (active) setImages(Array.from(new Set([...(initialImages || []), ...data.images.map((img: GalleryImage) => img.url)])));
      })
      .catch((error) => {
        if (active) setLoadError(true);
        logger.error("gallery.images_fetch_failed", error, { listingId });
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [listingId, initialImages]);

  const handleUpload = (result: CloudinaryUploadWidgetResults) => {
    if (typeof result.info !== "object" || !result.info.secure_url) return;

    axios.post("/api/cloudinary-images", {
      imageUrl: result.info.secure_url,
      listingId,
    }).then(() => {
      const url = typeof result.info === "object" ? result.info.secure_url : undefined;
      if (url) setImages((current) => Array.from(new Set([...current, url])));
      toast.success("Image uploaded successfully!");
    }).catch((error) => {
      logger.error("gallery.image_save_failed", error, { listingId });
      toast.error("The image could not be saved to this listing.");
    });
  };

  return (
    <section id="photos" className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold">Photo gallery</h2>
        <span className="text-xs text-slate-500">{images.length} photos</span>
      </div>
      {!isLoading && !loadError && !images.length && <p className="text-sm text-slate-500">No additional photos yet.</p>}
      {isLoading && (
        <p className="text-sm text-gray-500" aria-live="polite">
          Loading images…
        </p>
      )}
      {loadError && (
        <p className="text-sm text-red-600" role="alert">
          Images could not be loaded.
        </p>
      )}
      <div
        className={clsx(
          images.length ? "grid" : "hidden",
          "grid-cols-3 md:grid-cols-4 gap-2 lg:gap-4"
        )}
      >
        {images.map((imageUrl, index) => (
          <button key={imageUrl} type="button" onClick={() => { setSelectedImage(index); dialogRef.current?.showModal(); }}
            aria-label={`View photo ${index + 1} of ${vehicleName}`}
            className="overflow-hidden rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500">
            <CldImage width={160} height={110} crop="fill" src={imageUrl}
              alt={`${vehicleName}, photo ${index + 1}`} className="h-20 w-28 object-cover transition hover:opacity-80 sm:h-24 sm:w-32" />
          </button>
        ))}
      </div>
      {owner && (
        <CldUploadButton
          options={{
            maxFiles: 10,
            resourceType: "image",
            folder: `listing-${listingId}`,
          }}
          onSuccess={handleUpload}
          uploadPreset="auctions"
          className={clsx(
            images.length ? "mt-4" : "",
            "rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          )}
        >
          Add Images
        </CldUploadButton>
      )}
      <dialog ref={dialogRef} aria-label={`${vehicleName} photos`} className="w-[calc(100%-2rem)] max-w-5xl rounded-2xl bg-slate-950 p-4 text-white backdrop:bg-black/80">
        <div className="mb-4 flex items-center justify-between gap-4">
          <p className="text-sm">Photo {selectedImage + 1} of {images.length}</p>
          <button type="button" onClick={() => dialogRef.current?.close()} className="rounded-lg px-4 py-2 hover:bg-white/10">Close ×</button>
        </div>
        {images[selectedImage] && <CldImage src={images[selectedImage]} width={1400} height={1000} crop="fit" alt={`${vehicleName}, photo ${selectedImage + 1}`} className="max-h-[70vh] w-full object-contain" />}
        <div className="mt-4 flex justify-between">
          <button type="button" disabled={selectedImage === 0} onClick={() => setSelectedImage((i) => i - 1)} className="rounded-lg px-4 py-2 hover:bg-white/10 disabled:opacity-30">← Previous</button>
          <button type="button" disabled={selectedImage >= images.length - 1} onClick={() => setSelectedImage((i) => i + 1)} className="rounded-lg px-4 py-2 hover:bg-white/10 disabled:opacity-30">Next →</button>
        </div>
      </dialog>
    </section>
  );
};

export default Gallery;
