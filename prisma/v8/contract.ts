// Canonical database contract, authored and checked through TypeScript.
// Emission is offline; database adoption uses the guarded management command.
import {
  defineContract,
  enumType,
  field,
  gen,
  index,
  member,
  model,
  rel, type,
} from "@prisma/orm-mongo/contract-builder";

const mongoString = { codecId: "mongo/string@1" } as const;

const UserRole = enumType(
  "UserRole",
  mongoString,
  member("USER", "USER"),
  member("ADMIN", "ADMIN"),
);

const NotificationKind = enumType(
  "NotificationKind",
  mongoString,
  member("bid", "bid"),
  member("auction", "auction"),
  member("comment", "comment"),
);

const NotificationTone = enumType(
  "NotificationTone",
  mongoString,
  member("success", "success"),
  member("warning", "warning"),
  member("neutral", "neutral"),
);

const EmailDeliveryStatus = enumType(
  "EmailDeliveryStatus",
  mongoString,
  member("PENDING", "PENDING"),
  member("SENDING", "SENDING"),
  member("SENT", "SENT"),
  member("SKIPPED", "SKIPPED"),
  member("FAILED", "FAILED"),
);

const ListingReviewStatus = enumType(
  "ListingReviewStatus",
  mongoString,
  member("PENDING", "PENDING"),
  member("APPROVED", "APPROVED"),
  member("CHANGES_REQUESTED", "CHANGES_REQUESTED"),
);

const Account = model("Account", {
  collection: "Account",
  controlPolicy: "managed",
  fields: {
    id: field.scalar(type.ObjectId()).mongo({ field: "_id" }),
    type: field.scalar(type.String()),
    provider: field.scalar(type.String()),
    providerAccountId: field.scalar(type.String()),
    refresh_token: field.scalar(type.String()).optional(),
    refresh_token_expires_in: field.scalar(type.Int64Number()).optional(),
    access_token: field.scalar(type.String()).optional(),
    expires_at: field.scalar(type.Int64Number()).optional(),
    token_type: field.scalar(type.String()).optional(),
    scope: field.scalar(type.String()).optional(),
    id_token: field.scalar(type.String()).optional(),
    session_state: field.scalar(type.String()).optional(),
    userId: field.scalar(type.ObjectId()),
  },
  relations: {
    user: rel.belongsTo("User", { from: "userId", to: "id" }),
  },
  indexes: [
    index(
      { provider: 1, providerAccountId: 1 },
      { name: "Account_provider_providerAccountId_key", unique: true },
    ),
  ],
});

const User = model("User", {
  collection: "User",
  controlPolicy: "managed",
  fields: {
    id: field.scalar(type.ObjectId()).mongo({ field: "_id" }),
    name: field.scalar(type.String()).optional(),
    email: field.scalar(type.String()).optional(),
    emailVerified: field.scalar(type.DateTime()).optional(),
    role: field.namedType(UserRole).optional(),
    image: field.scalar(type.String()).optional(),
    sessionVersion: field.scalar(type.String()).optional(),
    hashedPassword: field.scalar(type.String()).optional(),
    createdAt: field.scalar(type.DateTime()).onCreate(gen.now()),
    updatedAt: field.scalar(type.DateTime()).onCreate(gen.now()).onUpdate(gen.now()),
    outbidEmailsEnabled: field.scalar(type.Bool()),
    endingSoonEmailsEnabled: field.scalar(type.Bool()),
    listingsCommentedOnIds: field.scalar(type.ObjectId()).many(),
    watchListIds: field.scalar(type.ObjectId()).many(),
    BidOnListIds: field.scalar(type.ObjectId()).many(),
    seenListIds: field.scalar(type.ObjectId()).many(),
    highestBidsIds: field.scalar(type.ObjectId()).many(),
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
  indexes: [index({ email: 1 }, { name: "User_email_key", unique: true })],
});

const Notification = model("Notification", {
  collection: "Notification",
  controlPolicy: "managed",
  fields: {
    id: field.scalar(type.ObjectId()).mongo({ field: "_id" }),
    userId: field.scalar(type.ObjectId()),
    eventKey: field.scalar(type.String()),
    kind: field.namedType(NotificationKind),
    title: field.scalar(type.String()),
    message: field.scalar(type.String()),
    href: field.scalar(type.String()),
    actionLabel: field.scalar(type.String()),
    tone: field.namedType(NotificationTone),
    createdAt: field.scalar(type.DateTime()).onCreate(gen.now()),
    readAt: field.scalar(type.DateTime()).optional(),
    emailListingId: field.scalar(type.ObjectId()).optional(),
    emailStatus: field.namedType(EmailDeliveryStatus).optional(),
    emailAttempts: field.scalar(type.Int64Number()),
    emailNextAttemptAt: field.scalar(type.DateTime()).optional(),
    emailLockedUntil: field.scalar(type.DateTime()).optional(),
    emailLockToken: field.scalar(type.String()).optional(),
    emailFirstAttemptAt: field.scalar(type.DateTime()).optional(),
    emailPayload: field.scalar(type.Json()).optional(),
    emailSentAt: field.scalar(type.DateTime()).optional(),
    emailProviderId: field.scalar(type.String()).optional(),
    emailLastError: field.scalar(type.String()).optional(),
  },
  relations: {
    user: rel.belongsTo("User", { from: "userId", to: "id" }),
  },
  indexes: [
    index(
      { userId: 1, eventKey: 1 },
      { name: "Notification_userId_eventKey_key", unique: true },
    ),
    index(
      { userId: 1, createdAt: 1, id: 1 },
      { name: "Notification_userId_createdAt__id_idx" },
    ),
    index({ userId: 1, readAt: 1 }, { name: "Notification_userId_readAt_idx" }),
    index(
      { emailStatus: 1, emailNextAttemptAt: 1 },
      { name: "Notification_emailStatus_emailNextAttemptAt_idx" },
    ),
    index(
      { emailStatus: 1, emailLockedUntil: 1 },
      { name: "Notification_emailStatus_emailLockedUntil_idx" },
    ),
  ],
});

const Listing = model("Listing", {
  collection: "Listing",
  controlPolicy: "managed",
  fields: {
    id: field.scalar(type.ObjectId()).mongo({ field: "_id" }),
    year: field.scalar(type.Int64Number()),
    make: field.scalar(type.String()),
    model: field.scalar(type.String()),
    miles: field.scalar(type.Int64Number()),
    images: field.scalar(type.String()).many(),
    location: field.scalar(type.String()),
    description: field.scalar(type.String()),
    transmission: field.scalar(type.String()).optional(),
    drivetrain: field.scalar(type.String()).optional(),
    titleStatus: field.scalar(type.String()).optional(),
    serviceHistory: field.scalar(type.String()).optional(),
    modifications: field.scalar(type.String()).optional(),
    vin: field.scalar(type.String()).optional(),
    vehicleRecords: field.scalar(type.Json()).optional(),
    knownFlaws: field.scalar(type.String()).optional(),
    reservePrice: field.scalar(type.Int64Number()).optional(),
    createdAt: field.scalar(type.DateTime()).onCreate(gen.now()),
    lastCommentAt: field.scalar(type.DateTime()).optional(),
    updatedAt: field.scalar(type.DateTime()).optional(),
    views: field.scalar(type.Int64Number()),
    coverImage: field.scalar(type.String()).optional(),
    auctionStartsAt: field.scalar(type.DateTime()).optional(),
    auctionEndsAt: field.scalar(type.DateTime()).optional(),
    endingSoonReminderAt: field.scalar(type.DateTime()).optional(),
    status: field.scalar(type.String()),
    result: field.scalar(type.String()).optional(),
    paymentBuyerConfirmedAt: field.scalar(type.DateTime()).optional(),
    paymentSellerConfirmedAt: field.scalar(type.DateTime()).optional(),
    paperworkBuyerConfirmedAt: field.scalar(type.DateTime()).optional(),
    paperworkSellerConfirmedAt: field.scalar(type.DateTime()).optional(),
    pickupBuyerConfirmedAt: field.scalar(type.DateTime()).optional(),
    pickupSellerConfirmedAt: field.scalar(type.DateTime()).optional(),
    reviewStatus: field.namedType(ListingReviewStatus).optional(),
    reviewRevision: field.scalar(type.Int64Number()).optional(),
    reviewNote: field.scalar(type.String()).optional(),
    isFeatured: field.scalar(type.Bool()),
    startingBid: field.scalar(type.Int64Number()).optional(),
    currentBid: field.scalar(type.Int64Number()).optional(),
    bidIncrement: field.scalar(type.Int64Number()).optional(),
    biddersIds: field.scalar(type.ObjectId()).many(),
    highestBidderId: field.scalar(type.ObjectId()).optional(),
    seenIds: field.scalar(type.ObjectId()).many(),
    userId: field.scalar(type.ObjectId()),
    watchersIds: field.scalar(type.ObjectId()).many(),
    commentsIds: field.scalar(type.ObjectId()).many(),
    commenterIds: field.scalar(type.ObjectId()).many(),
  },
  relations: {
    highestBidder: rel.belongsTo("User", {
      from: "highestBidderId",
      to: "id",
      optional: true,
    }),
    user: rel.belongsTo("User", { from: "userId", to: "id" }),
    reviews: rel.hasMany("ListingReview", { from: "id", to: "listingId" }),
    comments: rel.hasMany("Comment", { from: "id", to: "listingId" }),
    bids: rel.hasMany("Bid", { from: "id", to: "listingId" }),
  },
  indexes: [
    index(
      { status: 1, auctionEndsAt: 1 },
      { name: "Listing_status_auctionEndsAt_idx" },
    ),
    index(
      { status: 1, reviewStatus: 1, createdAt: 1 },
      { name: "Listing_status_reviewStatus_createdAt_idx" },
    ),
  ],
});

const ListingReview = model("ListingReview", {
  collection: "ListingReview",
  controlPolicy: "managed",
  fields: {
    id: field.scalar(type.ObjectId()).mongo({ field: "_id" }),
    listingId: field.scalar(type.ObjectId()),
    reviewerId: field.scalar(type.ObjectId()),
    reviewerName: field.scalar(type.String()),
    decision: field.namedType(ListingReviewStatus),
    reason: field.scalar(type.String()).optional(),
    revision: field.scalar(type.Int64Number()),
    createdAt: field.scalar(type.DateTime()).onCreate(gen.now()),
  },
  relations: {
    listing: rel.belongsTo("Listing", { from: "listingId", to: "id" }),
  },
  indexes: [
    index(
      { listingId: 1, createdAt: 1 },
      { name: "ListingReview_listingId_createdAt_idx" },
    ),
  ],
});

const Comment = model("Comment", {
  collection: "Comment",
  controlPolicy: "managed",
  fields: {
    id: field.scalar(type.ObjectId()).mongo({ field: "_id" }),
    body: field.scalar(type.String()).optional(),
    image: field.scalar(type.String()).optional(),
    createdAt: field.scalar(type.DateTime()).onCreate(gen.now()),
    listingId: field.scalar(type.ObjectId()),
    userId: field.scalar(type.ObjectId()).optional(),
  },
  relations: {
    listing: rel.belongsTo("Listing", { from: "listingId", to: "id" }),
    user: rel.belongsTo("User", { from: "userId", to: "id", optional: true }),
  },
});

const Bid = model("Bid", {
  collection: "Bid",
  controlPolicy: "managed",
  fields: {
    id: field.scalar(type.ObjectId()).mongo({ field: "_id" }),
    amount: field.scalar(type.Int64Number()),
    createdAt: field.scalar(type.DateTime()).onCreate(gen.now()),
    listingId: field.scalar(type.ObjectId()),
    userId: field.scalar(type.ObjectId()),
  },
  relations: {
    listing: rel.belongsTo("Listing", { from: "listingId", to: "id" }),
    user: rel.belongsTo("User", { from: "userId", to: "id" }),
  },
});

const BidSubmission = model("BidSubmission", {
  collection: "BidSubmission",
  controlPolicy: "managed",
  fields: {
    id: field.scalar(type.ObjectId()).mongo({ field: "_id" }),
    userId: field.scalar(type.ObjectId()),
    key: field.scalar(type.String()),
    listingId: field.scalar(type.ObjectId()),
    amount: field.scalar(type.Int64Number()),
    response: field.scalar(type.Json()),
    createdAt: field.scalar(type.DateTime()).onCreate(gen.now()),
  },
  relations: {
    user: rel.belongsTo("User", { from: "userId", to: "id" }),
  },
  indexes: [
    index(
      { userId: 1, key: 1 },
      { name: "BidSubmission_userId_key_key", unique: true },
    ),
  ],
});

const EmailVerification = model("EmailVerification", {
  collection: "EmailVerification",
  controlPolicy: "managed",
  fields: {
    id: field.scalar(type.ObjectId()).mongo({ field: "_id" }),
    email: field.scalar(type.String()),
    tokenHash: field.scalar(type.String()),
    requestedAt: field.scalar(type.DateTime()),
    expiresAt: field.scalar(type.DateTime()),
  },
  indexes: [
    index(
      { tokenHash: 1 },
      { name: "EmailVerification_tokenHash_key", unique: true },
    ),
  ],
});

const ListingDraft = model("ListingDraft", {
  collection: "ListingDraft",
  controlPolicy: "managed",
  fields: {
    id: field.scalar(type.ObjectId()).mongo({ field: "_id" }),
    userId: field.scalar(type.ObjectId()),
    payload: field.scalar(type.Json()),
    revision: field.scalar(type.Int64Number()),
    lastSaveKey: field.scalar(type.String()),
    publishedListingId: field.scalar(type.ObjectId()).optional(),
    deletedAt: field.scalar(type.DateTime()).optional(),
    createdAt: field.scalar(type.DateTime()).onCreate(gen.now()),
    updatedAt: field.scalar(type.DateTime()).onCreate(gen.now()).onUpdate(gen.now()),
  },
  relations: {
    user: rel.belongsTo("User", { from: "userId", to: "id" }),
  },
  indexes: [
    index(
      { userId: 1, deletedAt: 1, publishedListingId: 1, updatedAt: 1 },
      {
        name: "ListingDraft_userId_deletedAt_publishedListingId_updatedAt_idx",
      },
    ),
  ],
});

export const contract = defineContract({
  // Unlisted native collections are owned by our repositories/index inventory.
  // Only the ten explicitly managed ObjectId collections belong to v8 DDL.
  defaultControlPolicy: "tolerated",
  enums: {
    UserRole,
    NotificationKind,
    NotificationTone,
    EmailDeliveryStatus,
    ListingReviewStatus,
  },
  models: {
    Account,
    User,
    Notification,
    Listing,
    ListingReview,
    Comment,
    Bid,
    BidSubmission,
    EmailVerification,
    ListingDraft,
  },
});
