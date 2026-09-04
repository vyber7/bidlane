"use client";

import {
  CldImage,
  type CloudinaryUploadWidgetResults,
} from "next-cloudinary";
import { useEffect, useState } from "react";
import { CldUploadButton } from "next-cloudinary";
import axios from "axios";
import toast from "react-hot-toast";
import { useSession } from "next-auth/react";
import clsx from "clsx";

interface GalleryProps {
  listingId: string;
  userId?: string;
  owner?: boolean;
}

interface GalleryImage {
  url: string;
}

const Gallery: React.FC<GalleryProps> = ({ listingId, userId, owner }) => {
  const [images, setImages] = useState<string[]>([]);
  const { data: session } = useSession();
  console.log("User Session in Gallery:", session);

  useEffect(() => {
    // Fetch images for the given listingId
    fetch(`/api/cloudinary-images?folder=listing-${listingId}`)
      .then((res) => res.json())
      .then((data) => {
        setImages(data.images.map((img: GalleryImage) => img.url));
        console.log("Fetched images:", data);
      })
      .catch((err) => console.error(err));
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
      .then(() => {
        console.log("Image URL saved to database");
      })
      .catch(() => {
        console.error("Failed to save image URL to database");
      });
  };

  return (
    <div className="rounded-md shadow-md shadow-gray-400 p-4 bg-white">
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
