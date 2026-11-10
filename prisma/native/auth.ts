import { BSONRegExp, Long, ObjectId, type ClientSession, type Db } from "mongodb";
import type { AdapterAccount } from "next-auth/adapters";

type UserDocument = {
  _id: ObjectId;
  name?: string | null;
  email?: string | null;
  emailVerified?: Date | null;
  image?: string | null;
  role?: "USER" | "ADMIN" | null;
  hashedPassword?: string | null;
  sessionVersion?: string | null;
  createdAt: Date;
  updatedAt: Date;
  outbidEmailsEnabled?: boolean;
  endingSoonEmailsEnabled?: boolean;
  listingsCommentedOnIds: ObjectId[];
  watchListIds: ObjectId[];
  BidOnListIds: ObjectId[];
  seenListIds: ObjectId[];
  highestBidsIds: ObjectId[];
};

const authProjection = { name: 1, email: 1, emailVerified: 1, image: 1, role: 1, hashedPassword: 1, sessionVersion: 1, createdAt: 1 } as const;
const passwordProjection = { email: 1, hashedPassword: 1, sessionVersion: 1 } as const;
const nullableString = (value: unknown): string | null => {
  if (value == null) return null;
  if (typeof value !== "string") throw new Error("Invalid account string");
  return value;
};
function passwordUser(user: UserDocument) {
  return { id: user._id.toHexString(), email: nullableString(user.email), hashedPassword: nullableString(user.hashedPassword), sessionVersion: nullableString(user.sessionVersion) };
}
function authUser(user: UserDocument) {
  if (!(user.createdAt instanceof Date) || (user.emailVerified != null && !(user.emailVerified instanceof Date)) ||
    (user.role != null && user.role !== "USER" && user.role !== "ADMIN")) throw new Error("Invalid account metadata");
  return { ...passwordUser(user), name: nullableString(user.name), image: nullableString(user.image), emailVerified: user.emailVerified ?? null, role: user.role ?? null, createdAt: user.createdAt };
}
export type AuthUser = ReturnType<typeof authUser>;
export type EmailPreferences = { outbidEmailsEnabled: boolean; endingSoonEmailsEnabled: boolean };
const objectId = (id: string) => ObjectId.isValid(id) ? new ObjectId(id) : null;
// Absolute PCRE anchors also reject a trailing newline. Escape every regex
// metacharacter: dots and plus signs in an email are literal identity bytes.
const emailMatch = (email: string) => new BSONRegExp(`\\A${email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\z`, "i");

export function authRepositories(database: Db, session?: ClientSession) {
  const collection = database.collection<UserDocument>("User");
  const accounts = database.collection("Account");
  const options = { session };
  const byId = async (id: string) => {
    const _id = objectId(id);
    const user = _id && await collection.findOne({ _id }, { ...options, projection: authProjection });
    return user ? authUser(user) : null;
  };
  const update = async (id: string, data: Partial<Pick<UserDocument, "name" | "image" | "emailVerified">>) => {
    const _id = objectId(id);
    if (!_id) throw new Error("Account not found");
    const user = await collection.findOneAndUpdate({ _id }, { $set: { ...data, updatedAt: new Date() } }, { ...options, returnDocument: "after", projection: authProjection });
    if (!user) throw new Error("Account not found");
    return authUser(user);
  };
  return {
    users: {
      byId,
      async byEmail(email: string) {
        const user = await collection.findOne({ email }, { ...options, projection: authProjection });
        return user ? authUser(user) : null;
      },
      async sessionIdentity(id: string) {
        const _id = objectId(id);
        const user = _id && await collection.findOne({ _id }, { ...options, projection: { email: 1, sessionVersion: 1 } });
        return user ? { email: nullableString(user.email), sessionVersion: nullableString(user.sessionVersion) } : null;
      },
      async emailMatches(email: string) {
        return (await collection.find({ email: emailMatch(email) }, { ...options, projection: authProjection }).limit(2).toArray()).map(authUser);
      },
      async passwordMatches(email: string) {
        return (await collection.find({ email: emailMatch(email) }, { ...options, projection: passwordProjection }).limit(2).toArray()).map(passwordUser);
      },
      async emailExists(email: string) {
        return Boolean(await collection.findOne({ email: emailMatch(email) }, { ...options, projection: { _id: 1 } }));
      },
      async create(data: { name?: string | null; email: string; image?: string | null; emailVerified?: Date | null; hashedPassword?: string | null }) {
        const now = new Date();
        const user: UserDocument = {
          _id: new ObjectId(), name: data.name ?? null, email: data.email, image: data.image ?? null,
          emailVerified: data.emailVerified ?? null, hashedPassword: data.hashedPassword ?? null,
          role: "USER", sessionVersion: null, createdAt: now, updatedAt: now,
          outbidEmailsEnabled: true, endingSoonEmailsEnabled: true,
          listingsCommentedOnIds: [], watchListIds: [], BidOnListIds: [], seenListIds: [], highestBidsIds: [],
        };
        await collection.insertOne(user, options);
        return authUser(user);
      },
      async updateAuthProfile(id: string, data: { name?: string | null; image?: string | null; emailVerified?: Date | null }) {
        // Do not spread provider input into $set (role, password and email are
        // never writable through the authentication adapter).
        return update(id, {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.image !== undefined && { image: data.image }),
          ...(data.emailVerified !== undefined && { emailVerified: data.emailVerified }),
        });
      },
      async updateProfile(id: string, data: { name: string; image: string | null }) {
        const user = await update(id, { name: data.name, image: data.image });
        return { name: user.name, email: user.email, image: user.image };
      },
      async preferences(id: string) {
        const _id = objectId(id);
        const user = _id && await collection.findOne({ _id }, { ...options, projection: { outbidEmailsEnabled: 1, endingSoonEmailsEnabled: 1 } });
        return user ? { outbidEmailsEnabled: user.outbidEmailsEnabled ?? true, endingSoonEmailsEnabled: user.endingSoonEmailsEnabled ?? true } : null;
      },
      async updatePreferences(id: string, data: Partial<EmailPreferences>) {
        const _id = objectId(id);
        if (!_id) throw new Error("Account not found");
        const changes: Partial<EmailPreferences> = {};
        for (const key of ["outbidEmailsEnabled", "endingSoonEmailsEnabled"] as const) {
          if (typeof data[key] === "boolean") changes[key] = data[key];
        }
        if (!Object.keys(changes).length) throw new Error("Provide an email preference");
        const result = await collection.updateOne({ _id }, { $set: { ...changes, updatedAt: new Date() } }, options);
        if (!result.matchedCount) throw new Error("Account not found");
        return changes;
      },
      count: () => collection.countDocuments({}, options),
    },
    accounts: {
      async userId(provider: string, providerAccountId: string) {
        const account = await accounts.findOne({ provider, providerAccountId }, { ...options, projection: { userId: 1 } });
        return account ? (account.userId as ObjectId).toHexString() : null;
      },
      async link(account: AdapterAccount) {
        const _id = objectId(account.userId);
        if (!_id) throw new Error("Invalid account owner");
        const tokens: Record<string, string | Long | null> = {};
        for (const key of ["refresh_token", "access_token", "token_type", "scope", "id_token", "session_state"] as const) {
          tokens[key] = nullableString(account[key]);
        }
        for (const key of ["expires_at", "refresh_token_expires_in"] as const) {
          const value: unknown = account[key];
          if (value != null && (typeof value !== "number" || !Number.isSafeInteger(value))) throw new Error("Invalid OAuth expiry");
          tokens[key] = value == null ? null : Long.fromNumber(value as number);
        }
        await accounts.insertOne({ _id: new ObjectId(), userId: _id, type: account.type, provider: account.provider, providerAccountId: account.providerAccountId, ...tokens }, options);
      },
      async unlink(provider: string, providerAccountId: string) {
        await accounts.deleteOne({ provider, providerAccountId }, options);
      },
    },
  };
}
