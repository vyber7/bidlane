"use client";

import {
  CldImage,
  type CloudinaryUploadWidgetResults,
} from "next-cloudinary";
import { useEffect, useState } from "react";
import { CldUploadButton } from "next-cloudinary";
import axios from "axios";
import toast from "react-hot-toast";
import clsx from "clsx";
import { logger } from "@/app/libs/logger";

interface GalleryProps {
  listingId: string;
  owner?: boolean;
}

interface GalleryImage {
  url: string;
}

const Gallery: React.FC<GalleryProps> = ({ listingId, owner }) => {
  const [images, setImages] = useState<string[]>([]);
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
        if (active) setImages(data.images.map((img: GalleryImage) => img.url));
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
  }, [listingId]);

  const handleUpload = (result: CloudinaryUploadWidgetResults) => {
    if (typeof result.info !== "object" || !result.info.secure_url) return;

    axios
      .get(`/api/cloudinary-images?folder=listing-${listingId}`)
      //   {
      //     params: { listingId: `listing-${listingId}` },
      //   })

      .then((res) => {
        setImages(res.data.images.map((img: GalleryImage) => img.url));
        toast.success("Image uploaded successfully!");
      })
      .catch(() => toast.error("Image upload failed!"));

    axios
      .post("/api/cloudinary-images", {
        imageUrl: result.info.secure_url,
        listingId: listingId,
      })
      .catch((error) => {
        logger.error("gallery.image_save_failed", error, { listingId });
        toast.error("The image could not be saved to this listing.");
      });
  };

  return (
    <div className="rounded-md shadow-md shadow-gray-400 p-4 bg-white">
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
          images.length ? "block" : "hidden",
          " flex flex-wrap justify-start gap-2"
        )}
      >
        {images.map((imageUrl) => (
          <CldImage
            key={imageUrl}
            width={110}
            height={110}
            crop="fill"
            src={imageUrl}
            alt="Uploaded Image"
            className="rounded-md"
          />
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
            "w-full text-blue-500 underline"
          )}
        >
          Add Images
        </CldUploadButton>
      )}
    </div>
  );
};

export default Gallery;
