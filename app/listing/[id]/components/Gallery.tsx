"use client";

import { getApiErrorMessage } from "@/app/utils/api-error";

import {
  CldImage,
  type CloudinaryUploadWidgetResults,
} from "next-cloudinary";
import { useRef, useState } from "react";
import { CldUploadButton } from "next-cloudinary";
import Image from "next/image";
import axios from "axios";
import toast from "react-hot-toast";
import clsx from "clsx";
import { logger } from "@/app/libs/logger";

interface GalleryProps {
  listingId: string;
  owner?: boolean;
  vehicleName?: string;
  initialImages: string[];
}

const previewOptions = {
  width: 1400,
  height: 1000,
  crop: "limit",
  sizes: "(min-width: 1024px) 992px, calc(100vw - 64px)",
} as const;

const Gallery: React.FC<GalleryProps> = ({ listingId, owner, vehicleName = "Vehicle", initialImages }) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [thumbnailSources, setThumbnailSources] = useState<Record<string, string>>({});
  const [isOpen, setIsOpen] = useState(false);
  const [preparedImage, setPreparedImage] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState(0);
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const images = Array.from(new Set([...initialImages, ...uploadedImages]));
  const previewImages = isOpen
    ? images.slice(Math.max(0, selectedImage - 1), selectedImage + 2)
    : images.filter((image) => image === preparedImage);

  const handleUpload = (result: CloudinaryUploadWidgetResults) => {
    if (typeof result.info !== "object" || !result.info.secure_url) return;
    const imageUrl = result.info.secure_url;

    axios.post("/api/cloudinary-images", {
      imageUrl,
      listingId,
    }).then(() => {
      setUploadedImages((current) => Array.from(new Set([...current, imageUrl])));
      toast.success("Image uploaded successfully!");
    }).catch((error: unknown) => {
      logger.error("gallery.image_save_failed", error, { listingId });
      toast.error(getApiErrorMessage(error, "The image could not be saved to this listing."));
    });
  };

  return (
    <section id="photos" className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold">Photo gallery</h2>
        <span className="text-xs text-slate-500">{images.length} photos</span>
      </div>
      {!images.length && <p className="text-sm text-slate-500">No additional photos yet.</p>}
      <div
        className={clsx(
          images.length ? "grid" : "hidden",
          "grid-cols-3 md:grid-cols-4 gap-px overflow-hidden rounded-lg"
        )}
      >
        {images.map((imageUrl, index) => (
          <button key={imageUrl} type="button"
            onPointerEnter={() => setPreparedImage(imageUrl)}
            onFocus={() => setPreparedImage(imageUrl)}
            onClick={() => { setSelectedImage(index); setIsOpen(true); dialogRef.current?.showModal(); }}
            aria-label={`View photo ${index + 1} of ${vehicleName}`}
            className="overflow-hidden focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-amber-500">
            <CldImage width={160} height={110} crop="fill" src={imageUrl}
              onLoad={(event) => {
                const src = event.currentTarget.currentSrc || event.currentTarget.src;
                setThumbnailSources((current) => current[imageUrl] === src ? current : { ...current, [imageUrl]: src });
              }}
              alt={`${vehicleName}, photo ${index + 1}`} className="h-20 w-full rounded-lg object-cover transition hover:opacity-80 sm:h-24" />
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
      <dialog ref={dialogRef} onClose={() => { setIsOpen(false); setPreparedImage(null); }} aria-label={`${vehicleName} photos`} className="w-[calc(100%-2rem)] max-w-5xl rounded-2xl bg-slate-950 p-4 text-white backdrop:bg-black/80">
        <div className="mb-4 flex items-center justify-between gap-4">
          <p className="text-sm">Photo {selectedImage + 1} of {images.length}</p>
          <button type="button" onClick={() => dialogRef.current?.close()} className="rounded-lg px-4 py-2 hover:bg-white/10">Close ×</button>
        </div>
        <div className="relative h-[min(70vh,700px)]">
          {previewImages.map((imageUrl) => (
            <GalleryPreview
              key={imageUrl}
              src={imageUrl}
              thumbnailSrc={thumbnailSources[imageUrl]}
              active={isOpen && imageUrl === images[selectedImage]}
              alt={`${vehicleName}, photo ${selectedImage + 1}`}
            />
          ))}
        </div>
        <div className="mt-4 flex justify-between">
          <button type="button" disabled={selectedImage === 0} onClick={() => setSelectedImage((i) => i - 1)} className="rounded-lg px-4 py-2 hover:bg-white/10 disabled:opacity-30">← Previous</button>
          <button type="button" disabled={selectedImage >= images.length - 1} onClick={() => setSelectedImage((i) => i + 1)} className="rounded-lg px-4 py-2 hover:bg-white/10 disabled:opacity-30">Next →</button>
        </div>
      </dialog>
    </section>
  );
};

function GalleryPreview({ src, thumbnailSrc, active, alt }: {
  src: string;
  thumbnailSrc?: string;
  active: boolean;
  alt: string;
}) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");

  return (
    <div className={active ? "absolute inset-0" : "hidden"} aria-hidden={!active}>
      {active && status !== "loaded" && thumbnailSrc && (
        <Image src={thumbnailSrc} alt="" width={160} height={110} unoptimized loading="eager"
          className="absolute inset-0 h-full w-full object-contain" />
      )}
      <CldImage {...previewOptions} src={src} alt={active ? alt : ""}
        loading="eager" fetchPriority={active ? "high" : "low"}
        onLoad={() => setStatus("loaded")}
        onError={() => setStatus("error")}
        className={clsx("absolute inset-0 h-full w-full object-contain", status !== "loaded" && "opacity-0")}
      />
      {active && status === "error" && <p role="status" className="absolute inset-x-0 bottom-0 bg-slate-950/80 p-3 text-center text-sm">Full-size photo could not load. Showing thumbnail.</p>}
    </div>
  );
}

export default Gallery;
