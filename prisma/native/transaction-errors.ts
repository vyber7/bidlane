import { MongoError, MongoServerError } from "mongodb";

export class TransactionRetryLimitError extends Error {
  constructor() { super("Transaction contention retry limit reached"); }
}

export const auctionTransactionOptions = { maxAttempts: 3, timeoutMS: 5_000 } as const;
export const authoringTransactionOptions = { maxAttempts: 3, timeoutMS: 5_000 } as const;
export const engagementTransactionOptions = { maxAttempts: 3, timeoutMS: 5_000 } as const;

export function isTransactionContention(error: unknown): boolean {
  return error instanceof TransactionRetryLimitError ||
    (error instanceof MongoError && !error.hasErrorLabel("UnknownTransactionCommitResult") &&
      error.hasErrorLabel("TransientTransactionError"));
}

export function isDuplicateKey(error: unknown): boolean {
  return error instanceof MongoServerError && error.code === 11000 && !error.hasErrorLabel("UnknownTransactionCommitResult");
}
