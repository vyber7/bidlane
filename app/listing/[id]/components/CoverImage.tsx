"use client";

import axios from "axios";
import {
  CldImage,
  CldUploadButton,
  type CloudinaryUploadWidgetResults,
} from "next-cloudinary";
import Image from "next/image";
import { useState } from "react";
import toast from "react-hot-toast";
import { logger } from "@/app/libs/logger";

interface CoverImageProps {
  listingId: string;
  url?: string;
  owner?: boolean;
  alt?: string;
}

const CoverImage: React.FC<CoverImageProps> = ({ listingId, url, owner, alt = "Vehicle cover photo" }) => {
  const [imageUrl, setImageUrl] = useState<string>(url || "");
  const handleUpload = async (result: CloudinaryUploadWidgetResults) => {
    if (typeof result.info !== "object" || !result.info.secure_url) return;

    const previousUrl = imageUrl;
    const nextUrl = result.info.secure_url;
    setImageUrl(nextUrl);

    try {
      await axios.post(`/api/listing/${listingId}/cover-image`, {
        url: nextUrl,
      });
    } catch (error) {
      setImageUrl(previousUrl);
      logger.error("listing.cover_image_client_failed", error, { listingId });
      toast.error("The cover image could not be saved.");
    }
  };

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
        {imageUrl && (
          <CldImage
            key={imageUrl}
            width={1200}
            height={800}
            src={imageUrl}
            crop="fill"
            alt={alt}
            priority
            sizes="(min-width: 1024px) 700px, 100vw"
            className="aspect-[3/2] w-full object-cover"
          />
        )}
        {!imageUrl && (
          <Image
            src="/images/default-vehicle-image.png"
            alt="Vehicle photo not yet available"
            width={1200}
            height={800}
            className="aspect-[3/2] w-full object-cover"
          />
        )}
      </div>
      {owner && (
        <CldUploadButton
          options={{
            maxFiles: 1,
            resourceType: "image",
            folder: `listing-${listingId}`,
          }}
          onSuccess={handleUpload}
          uploadPreset="auctions"
          className="mt-3 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          {imageUrl ? (
            <div className="flex items-center gap-1">
              <FaRegEdit />
              <span>Edit Image</span>
            </div>
          ) : (
            "Add Cover Image"
          )}
        </CldUploadButton>
      )}
    </>
  );
};

export default CoverImage;
