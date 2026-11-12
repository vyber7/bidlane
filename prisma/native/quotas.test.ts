import { describe, expect, it, vi } from "vitest";
import { Long, MongoServerError, type Collection } from "mongodb";
import { quotaRepository, type QuotaDocument } from "./quotas";

function fixture() {
  const collection = {
    findOneAndUpdate: vi.fn(),
    findOne: vi.fn(),
    deleteMany: vi.fn(),
  };
  return {
    collection,
    repository: quotaRepository(
      collection as unknown as Collection<QuotaDocument>,
    ),
  };
}

describe("native quota creation races", () => {
  it("increments the winning string-ID bucket once after a duplicate-key race, preserving its expiry", async () => {
    const { collection, repository } = fixture();
    const expiresAt = new Date("2026-11-10T12:00:00Z");
    collection.findOneAndUpdate
      .mockRejectedValueOnce(
        new MongoServerError({ code: 11000, message: "duplicate key" }),
      )
      .mockResolvedValueOnce({
        _id: "global:123",
        count: Long.fromNumber(2),
        expiresAt,
      });
    await expect(
      repository.consume("global:123", new Date(0)),
    ).resolves.toEqual({ id: "global:123", count: 2, expiresAt });
    expect(collection.findOneAndUpdate).toHaveBeenLastCalledWith(
      { _id: "global:123" },
      { $inc: { count: Long.ONE } },
      {
        returnDocument: "after",
        includeResultMetadata: false,
        session: undefined,
      },
    );
    expect(collection.findOneAndUpdate).toHaveBeenCalledTimes(2);
  });

  it("propagates non-duplicate storage failures without charging another increment", async () => {
    const { collection, repository } = fixture();
    const failure = new MongoServerError({ code: 91, message: "shutdown" });
    collection.findOneAndUpdate.mockRejectedValue(failure);
    await expect(repository.consume("global:123", new Date())).rejects.toBe(
      failure,
    );
    expect(collection.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });

  it("fails closed if cleanup removes the winning bucket before the retry", async () => {
    const { collection, repository } = fixture();
    collection.findOneAndUpdate
      .mockRejectedValueOnce(
        new MongoServerError({ code: 11000, message: "duplicate" }),
      )
      .mockResolvedValueOnce(null);
    await expect(repository.consume("global:123", new Date())).rejects.toThrow(
      "Quota bucket was not updated",
    );
  });
});
