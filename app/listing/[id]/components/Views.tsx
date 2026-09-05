"use client";

import axios from "axios";
import { useEffect } from "react";
import { logger } from "@/app/libs/logger";

interface ViewsProps {
  listingId: string;
}

const Views: React.FC<ViewsProps> = ({ listingId }) => {
  useEffect(() => {
    axios
      .post("/api/listings/views", { id: listingId })
      .catch((error) => {
        logger.warn("listing.view_client_failed", {
          listingId,
          error: String(error),
        });
      });
  }, [listingId]);
  return null;
};

export default Views;
