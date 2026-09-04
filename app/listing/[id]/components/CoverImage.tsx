"use client";

import axios from "axios";
import {
  CldImage,
  CldUploadButton,
  type CloudinaryUploadWidgetResults,
} from "next-cloudinary";
import Image from "next/image";
import { useState } from "react";

interface CoverImageProps {
  listingId: string;
  url?: string;
  owner?: boolean;
}

const CoverImage: React.FC<CoverImageProps> = ({ listingId, url, owner }) => {
  const [imageUrl, setImageUrl] = useState<string>(url || "");
  const handleUpload = (result: CloudinaryUploadWidgetResults) => {
    if (typeof result.info !== "object" || !result.info.secure_url) return;

    setImageUrl(result.info.secure_url);
    axios.post(`/api/listing/${listingId}/cover-image`, {
      url: result.info.secure_url,
    });
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
