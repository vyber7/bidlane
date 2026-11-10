import { describe, expect, it, vi } from "vitest";
import { checkMongoV8 } from "./prisma-v8-check.mjs";

describe("read-only MongoDB readiness check", () => {
  it.each([
    [8, { setName: "rs0" }, true],
    [9, { msg: "isdbgrid" }, true],
    [7, { setName: "rs0" }, false],
    [8, {}, false],
    [undefined, { setName: "rs0" }, false],
  ])("checks server major %s and transaction support (%j)", async (major, topology, ready) => {
    const database = { command: vi.fn().mockResolvedValueOnce({ version: `${major}.0.0`, versionArray: [major] }).mockResolvedValueOnce(topology) };
    const result = await checkMongoV8(database);
    expect(result.ready).toBe(ready);
    expect(database.command.mock.calls).toEqual([[{ buildInfo: 1 }], [{ hello: 1 }]]);
  });

  it("fails instead of reporting readiness when metadata cannot be read", async () => {
    const database = { command: vi.fn().mockRejectedValue(new Error("not authorized")) };
    await expect(checkMongoV8(database)).rejects.toThrow("not authorized");
    expect(database.command).toHaveBeenCalledTimes(1);
  });
});
