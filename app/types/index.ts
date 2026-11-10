import type { Bid, Comment } from "@prisma/client";

export type CurrentUser = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  createdAt: Date;
  hasPassword: boolean;
  emailVerified?: Date | null;
  role?: "USER" | "ADMIN" | null;
};

export type FullUserType = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

export type CommentWithAuthor = Pick<
  Comment,
  "id" | "body" | "image" | "listingId"
> & {
  createdAt: Date | string;
  user: { name: string | null } | null;
};

export type BidWithAuthor = Omit<Bid, "createdAt"> & {
  createdAt: Date | string;
  user: { name: string | null };
};
