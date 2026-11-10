// Prisma 8 uses TypeScript authoring during the parallel v6/v8 migration.
// The Prisma 6 editor recursively treats sibling .prisma files as one schema,
// so keeping v8 PSL here causes false errors in both versions. This builder
// preserves the emitted contract; see docs/prisma-8-migration.md.
import { defineContract, enumType, field, gen, index, member, model, rel } from "@prisma/orm-mongo/contract-builder";

const mongoString = { codecId: "mongo/string@1" } as const;

const UserRole = enumType("UserRole", mongoString,
  member("USER", "USER"),
  member("ADMIN", "ADMIN"),
);

const NotificationKind = enumType("NotificationKind", mongoString,
  member("bid", "bid"),
  member("auction", "auction"),
  member("comment", "comment"),
);

const NotificationTone = enumType("NotificationTone", mongoString,
  member("success", "success"),
  member("warning", "warning"),
  member("neutral", "neutral"),
);

const EmailDeliveryStatus = enumType("EmailDeliveryStatus", mongoString,
  member("PENDING", "PENDING"),
  member("SENDING", "SENDING"),
  member("SENT", "SENT"),
  member("SKIPPED", "SKIPPED"),
  member("FAILED", "FAILED"),
);

const ListingReviewStatus = enumType("ListingReviewStatus", mongoString,
  member("PENDING", "PENDING"),
  member("APPROVED", "APPROVED"),
  member("CHANGES_REQUESTED", "CHANGES_REQUESTED"),
);

const Account = model("Account", {
  collection: "Account",
  fields: {
    id: field.objectId().mongo({ field: "_id" }),
    type: field.string(),
    provider: field.string(),
    providerAccountId: field.string(),
    refresh_token: field.string().optional(),
    refresh_token_expires_in: field.int64Number().optional(),
    access_token: field.string().optional(),
    expires_at: field.int64Number().optional(),
    token_type: field.string().optional(),
    scope: field.string().optional(),
    id_token: field.string().optional(),
    session_state: field.string().optional(),
    userId: field.objectId(),
  },
  relations: {
    user: rel.belongsTo("User", { from: "userId", to: "id" }),
  },
  indexes: [
    index({ provider: 1, providerAccountId: 1 }, { name: "Account_provider_providerAccountId_key", unique: true }),
  ],
});

const User = model("User", {
  collection: "User",
  fields: {
    id: field.objectId().mongo({ field: "_id" }),
    name: field.string().optional(),
    email: field.string().optional(),
    emailVerified: field.date().optional(),
    role: field.namedType(UserRole).optional(),
    image: field.string().optional(),
    sessionVersion: field.string().optional(),
    hashedPassword: field.string().optional(),
    createdAt: field.date().onCreate(gen.now()),
    updatedAt: field.date().onCreate(gen.now()).onUpdate(gen.now()),
    outbidEmailsEnabled: field.bool(),
    endingSoonEmailsEnabled: field.bool(),
    listingsCommentedOnIds: field.objectId().many(),
    watchListIds: field.objectId().many(),
    BidOnListIds: field.objectId().many(),
    seenListIds: field.objectId().many(),
    highestBidsIds: field.objectId().many(),
  },
  relations: {
    accounts: rel.hasMany("Account", { from: "id", to: "userId" }),
    comments: rel.hasMany("Comment", { from: "id", to: "userId" }),
    uploadList: rel.hasMany("Listing", { from: "id", to: "userId" }),
    listingDrafts: rel.hasMany("ListingDraft", { from: "id", to: "userId" }),
    highestBids: rel.hasMany("Listing", { from: "id", to: "highestBidderId" }),
    bidSubmissions: rel.hasMany("BidSubmission", { from: "id", to: "userId" }),
    bids: rel.hasMany("Bid", { from: "id", to: "userId" }),
    notifications: rel.hasMany("Notification", { from: "id", to: "userId" }),
  },
  indexes: [
    index({ email: 1 }, { name: "User_email_key", unique: true }),
  ],
});

const Notification = model("Notification", {
  collection: "Notification",
  fields: {
    id: field.objectId().mongo({ field: "_id" }),
    userId: field.objectId(),
    eventKey: field.string(),
    kind: field.namedType(NotificationKind),
    title: field.string(),
    message: field.string(),
    href: field.string(),
    actionLabel: field.string(),
    tone: field.namedType(NotificationTone),
    createdAt: field.date().onCreate(gen.now()),
    readAt: field.date().optional(),
    emailListingId: field.objectId().optional(),
    emailStatus: field.namedType(EmailDeliveryStatus).optional(),
    emailAttempts: field.int64Number(),
    emailNextAttemptAt: field.date().optional(),
    emailLockedUntil: field.date().optional(),
    emailLockToken: field.string().optional(),
    emailFirstAttemptAt: field.date().optional(),
    emailPayload: field.json().optional(),
    emailSentAt: field.date().optional(),
    emailProviderId: field.string().optional(),
    emailLastError: field.string().optional(),
  },
  relations: {
    user: rel.belongsTo("User", { from: "userId", to: "id" }),
  },
  indexes: [
    index({ userId: 1, eventKey: 1 }, { name: "Notification_userId_eventKey_key", unique: true }),
    index({ userId: 1, createdAt: 1, id: 1 }, { name: "Notification_userId_createdAt__id_idx" }),
    index({ userId: 1, readAt: 1 }, { name: "Notification_userId_readAt_idx" }),
    index({ emailStatus: 1, emailNextAttemptAt: 1 }, { name: "Notification_emailStatus_emailNextAttemptAt_idx" }),
    index({ emailStatus: 1, emailLockedUntil: 1 }, { name: "Notification_emailStatus_emailLockedUntil_idx" }),
  ],
});

const Listing = model("Listing", {
  collection: "Listing",
  fields: {
    id: field.objectId().mongo({ field: "_id" }),
    year: field.int64Number(),
    make: field.string(),
    model: field.string(),
    miles: field.int64Number(),
    images: field.string().many(),
    location: field.string(),
    description: field.string(),
    transmission: field.string().optional(),
    drivetrain: field.string().optional(),
    titleStatus: field.string().optional(),
    serviceHistory: field.string().optional(),
    modifications: field.string().optional(),
    vin: field.string().optional(),
    vehicleRecords: field.json().optional(),
    knownFlaws: field.string().optional(),
    reservePrice: field.int64Number().optional(),
    createdAt: field.date().onCreate(gen.now()),
    lastCommentAt: field.date().optional(),
    updatedAt: field.date().optional(),
    views: field.int64Number(),
    coverImage: field.string().optional(),
    auctionStartsAt: field.date().optional(),
    auctionEndsAt: field.date().optional(),
    endingSoonReminderAt: field.date().optional(),
    status: field.string(),
    result: field.string().optional(),
    reviewStatus: field.namedType(ListingReviewStatus).optional(),
    reviewRevision: field.int64Number().optional(),
    reviewNote: field.string().optional(),
    isFeatured: field.bool(),
    startingBid: field.int64Number().optional(),
    currentBid: field.int64Number().optional(),
    bidIncrement: field.int64Number().optional(),
    biddersIds: field.objectId().many(),
    highestBidderId: field.objectId().optional(),
    seenIds: field.objectId().many(),
    userId: field.objectId(),
    watchersIds: field.objectId().many(),
    commentsIds: field.objectId().many(),
    commenterIds: field.objectId().many(),
  },
  relations: {
    highestBidder: rel.belongsTo("User", { from: "highestBidderId", to: "id", optional: true }),
    user: rel.belongsTo("User", { from: "userId", to: "id" }),
    reviews: rel.hasMany("ListingReview", { from: "id", to: "listingId" }),
    comments: rel.hasMany("Comment", { from: "id", to: "listingId" }),
    bids: rel.hasMany("Bid", { from: "id", to: "listingId" }),
  },
  indexes: [
    index({ status: 1, auctionEndsAt: 1 }, { name: "Listing_status_auctionEndsAt_idx" }),
    index({ status: 1, reviewStatus: 1, createdAt: 1 }, { name: "Listing_status_reviewStatus_createdAt_idx" }),
  ],
});

const ListingReview = model("ListingReview", {
  collection: "ListingReview",
  fields: {
    id: field.objectId().mongo({ field: "_id" }),
    listingId: field.objectId(),
    reviewerId: field.objectId(),
    reviewerName: field.string(),
    decision: field.namedType(ListingReviewStatus),
    reason: field.string().optional(),
    revision: field.int64Number(),
    createdAt: field.date().onCreate(gen.now()),
  },
  relations: {
    listing: rel.belongsTo("Listing", { from: "listingId", to: "id" }),
  },
  indexes: [
    index({ listingId: 1, createdAt: 1 }, { name: "ListingReview_listingId_createdAt_idx" }),
  ],
});

const Comment = model("Comment", {
  collection: "Comment",
  fields: {
    id: field.objectId().mongo({ field: "_id" }),
    body: field.string().optional(),
    image: field.string().optional(),
    createdAt: field.date().onCreate(gen.now()),
    listingId: field.objectId(),
    userId: field.objectId().optional(),
  },
  relations: {
    listing: rel.belongsTo("Listing", { from: "listingId", to: "id" }),
    user: rel.belongsTo("User", { from: "userId", to: "id", optional: true }),
  },
});

const Bid = model("Bid", {
  collection: "Bid",
  fields: {
    id: field.objectId().mongo({ field: "_id" }),
    amount: field.int64Number(),
    createdAt: field.date().onCreate(gen.now()),
    listingId: field.objectId(),
    userId: field.objectId(),
  },
  relations: {
    listing: rel.belongsTo("Listing", { from: "listingId", to: "id" }),
    user: rel.belongsTo("User", { from: "userId", to: "id" }),
  },
});

const BidSubmission = model("BidSubmission", {
  collection: "BidSubmission",
  fields: {
    id: field.objectId().mongo({ field: "_id" }),
    userId: field.objectId(),
    key: field.string(),
    listingId: field.objectId(),
    amount: field.int64Number(),
    response: field.json(),
    createdAt: field.date().onCreate(gen.now()),
  },
  relations: {
    user: rel.belongsTo("User", { from: "userId", to: "id" }),
  },
  indexes: [
    index({ userId: 1, key: 1 }, { name: "BidSubmission_userId_key_key", unique: true }),
  ],
});

const EmailVerification = model("EmailVerification", {
  collection: "EmailVerification",
  fields: {
    id: field.objectId().mongo({ field: "_id" }),
    email: field.string(),
    tokenHash: field.string(),
    requestedAt: field.date(),
    expiresAt: field.date(),
  },
  indexes: [
    index({ tokenHash: 1 }, { name: "EmailVerification_tokenHash_key", unique: true }),
  ],
});

const ListingDraft = model("ListingDraft", {
  collection: "ListingDraft",
  fields: {
    id: field.objectId().mongo({ field: "_id" }),
    userId: field.objectId(),
    payload: field.json(),
    revision: field.int64Number(),
    lastSaveKey: field.string(),
    publishedListingId: field.objectId().optional(),
    deletedAt: field.date().optional(),
    createdAt: field.date().onCreate(gen.now()),
    updatedAt: field.date().onCreate(gen.now()).onUpdate(gen.now()),
  },
  relations: {
    user: rel.belongsTo("User", { from: "userId", to: "id" }),
  },
  indexes: [
    index({ userId: 1, deletedAt: 1, publishedListingId: 1, updatedAt: 1 }, { name: "ListingDraft_userId_deletedAt_publishedListingId_updatedAt_idx" }),
  ],
});

export const contract = defineContract({
  enums: { UserRole, NotificationKind, NotificationTone, EmailDeliveryStatus, ListingReviewStatus },
  models: { Account, User, Notification, Listing, ListingReview, Comment, Bid, BidSubmission, EmailVerification, ListingDraft },
});
