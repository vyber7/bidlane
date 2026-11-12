import {
  Long,
  ObjectId,
  type ClientSession,
  type Db,
  type Filter,
} from "mongodb";

type ResetDocument = {
  _id: string;
  email: string;
  nonce: string;
  tokenHash: string;
  requestedAt: Date;
  expiresAt: Date;
  userId: ObjectId | null;
  sessionVersion: string | null;
  usedAt: Date | null;
};
type ResetInput = Omit<ResetDocument, "_id" | "userId"> & {
  id: string;
  userId: string | null;
};
type EmailDocument = {
  _id: string;
  email: string;
  kind: string;
  resetId: string | null;
  nonce: string | null;
  status: string;
  attempts: number | Long;
  nextAttemptAt: Date;
  lockedUntil: Date | null;
  lockToken: string | null;
  createdAt: Date;
};
type EmailInput = {
  id: string;
  email: string;
  kind: string;
  resetId?: string;
  nonce?: string;
  nextAttemptAt: Date;
};
type PasswordUser = {
  _id: ObjectId;
  email?: string | null;
  hashedPassword?: string | null;
  sessionVersion?: string | null;
  updatedAt?: Date;
};
const resetResult = (record: ResetDocument | null) =>
  record && {
    id: record._id,
    email: record.email,
    nonce: record.nonce,
    tokenHash: record.tokenHash,
    requestedAt: record.requestedAt,
    expiresAt: record.expiresAt,
    userId: record.userId?.toHexString() ?? null,
    sessionVersion: record.sessionVersion ?? null,
    usedAt: record.usedAt ?? null,
  };
const emailResult = (record: EmailDocument | null) =>
  record && {
    id: record._id,
    email: record.email,
    kind: record.kind,
    resetId: record.resetId ?? null,
    nonce: record.nonce ?? null,
    status: record.status,
    attempts: Long.isLong(record.attempts)
      ? record.attempts.toNumber()
      : record.attempts,
    nextAttemptAt: record.nextAttemptAt,
    lockedUntil: record.lockedUntil ?? null,
    lockToken: record.lockToken ?? null,
    createdAt: record.createdAt,
  };
const eligible = (now: Date): Filter<EmailDocument> => ({
  $or: [
    { status: "PENDING", nextAttemptAt: { $lte: now } },
    { status: "SENDING", lockedUntil: { $lte: now } },
  ],
});

export function recoveryRepositories(database: Db, session?: ClientSession) {
  const resets = database.collection<ResetDocument>("PasswordReset");
  const emails = database.collection<EmailDocument>("RecoveryEmail");
  const users = database.collection<PasswordUser>("User");
  return {
    passwordResets: {
      async find(id: string) {
        return resetResult(await resets.findOne({ _id: id }, { session }));
      },
      async findByTokenHash(tokenHash: string) {
        return resetResult(await resets.findOne({ tokenHash }, { session }));
      },
      replace(input: ResetInput) {
        const { id, userId, ...data } = input;
        return resets.updateOne(
          { _id: id },
          { $set: { ...data, userId: userId ? new ObjectId(userId) : null } },
          { upsert: true, session },
        );
      },
      async claim(
        record: { id: string; tokenHash: string; nonce: string },
        now: Date,
      ) {
        const result = await resets.updateOne(
          {
            _id: record.id,
            tokenHash: record.tokenHash,
            nonce: record.nonce,
            usedAt: { $eq: null, $exists: true },
            expiresAt: { $gt: now },
          },
          { $set: { usedAt: now } },
          { session },
        );
        return { count: result.modifiedCount };
      },
      async bind(
        record: { id: string; nonce: string },
        now: Date,
        user: { userId: string; sessionVersion: string },
      ) {
        const result = await resets.updateOne(
          {
            _id: record.id,
            nonce: record.nonce,
            usedAt: { $eq: null, $exists: true },
            expiresAt: { $gt: now },
          },
          {
            $set: {
              userId: new ObjectId(user.userId),
              sessionVersion: user.sessionVersion,
            },
          },
          { session },
        );
        // Binding the same user/version again is a successful idempotent match.
        return { count: result.matchedCount };
      },
      deleteBefore(expiresAt: Date) {
        return resets.deleteMany(
          { expiresAt: { $lt: expiresAt } },
          { session },
        );
      },
    },
    recoveryEmails: {
      enqueue(input: EmailInput) {
        const { id, ...data } = input;
        return emails.insertOne(
          {
            ...data,
            _id: id,
            resetId: input.resetId ?? null,
            nonce: input.nonce ?? null,
            status: "PENDING",
            attempts: Long.ZERO,
            createdAt: new Date(),
            lockedUntil: null,
            lockToken: null,
          },
          { session },
        );
      },
      async candidates(now: Date, limit: number) {
        const rows = await emails
          .find(eligible(now), { projection: { _id: 1 }, session })
          .sort({ createdAt: 1 })
          .limit(limit)
          .toArray();
        return rows.map((row) => ({ id: row._id }));
      },
      async claim(id: string, now: Date, lockToken: string) {
        const result = await emails.updateOne(
          { _id: id, ...eligible(now) },
          {
            $set: {
              status: "SENDING",
              lockToken,
              lockedUntil: new Date(now.getTime() + 120_000),
            },
            $inc: { attempts: Long.ONE },
          },
          { session },
        );
        return { count: result.modifiedCount };
      },
      async finish(
        id: string,
        lockToken: string,
        data: { status: string; nextAttemptAt?: Date },
      ) {
        const result = await emails.updateOne(
          { _id: id, status: "SENDING", lockToken },
          {
            $set: { ...data, lockedUntil: null, lockToken: null },
          },
          { session },
        );
        return { count: result.modifiedCount };
      },
      async find(id: string) {
        return emailResult(await emails.findOne({ _id: id }, { session }));
      },
      deleteCompletedBefore(createdAt: Date) {
        return emails.deleteMany(
          {
            status: { $in: ["SENT", "SKIPPED", "FAILED"] },
            createdAt: { $lt: createdAt },
          },
          { session },
        );
      },
    },
    recoveryUsers: {
      async find(id: string) {
        const user = await users.findOne(
          { _id: new ObjectId(id) },
          {
            projection: {
              _id: 1,
              email: 1,
              hashedPassword: 1,
              sessionVersion: 1,
            },
            session,
          },
        );
        return (
          user && {
            id: user._id.toHexString(),
            email: user.email ?? null,
            hashedPassword: user.hashedPassword ?? null,
            sessionVersion: user.sessionVersion ?? null,
          }
        );
      },
      async updatePassword(
        user: { id: string; email: string; hashedPassword: string },
        data: { hashedPassword: string; sessionVersion: string },
        now: Date,
      ) {
        const result = await users.updateOne(
          {
            _id: new ObjectId(user.id),
            email: user.email,
            hashedPassword: user.hashedPassword,
          },
          {
            $set: { ...data, updatedAt: now },
          },
          { session },
        );
        return { count: result.modifiedCount };
      },
    },
  };
}
