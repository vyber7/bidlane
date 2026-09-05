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
}

const CoverImage: React.FC<CoverImageProps> = ({ listingId, url, owner }) => {
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
      <div className="rounded-b-md shadow-md flex flex-col justify-between bg-white shadow-gray-400">
        {imageUrl && (
          <CldImage
            key={imageUrl}
            width={500}
            height={300}
            src={imageUrl}
            crop="fill"
            alt="Uploaded Image"
            className="rounded-b-md w-full object-cover"
          />
        )}
        {!imageUrl && (
          <Image
            src="/images/default-vehicle-image.png"
            alt="Vehicle Image"
            width={500}
            height={300}
            className="w-full object-cover"
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
          className="p-2 mt-4 text-blue-500 bg-white rounded-md w-fit"
        >
          {imageUrl ? "Edit Cover Image" : "Add Cover Image"}
        </CldUploadButton>
      )}
    </>
  );
};

export default CoverImage;
