import type { Bid, Comment, User } from "@prisma/client";

export type CurrentUser = Pick<
  User,
  "id" | "name" | "email" | "image" | "createdAt"
> & {
  hasPassword: boolean;
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
