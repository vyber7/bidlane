import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ list: vi.fn() }));

vi.mock("../libs/native-repositories", () => ({ getNativeRepositories: () => ({ comments: { list: mocks.list } }) }));
vi.mock("../libs/logger", () => ({ logger: { error: vi.fn() } }));

import getComments from "./getComments";

describe("getComments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.list.mockResolvedValue([]);
  });

  it("reads comments through the native repository", async () => {
    await getComments("abcdef0123456789abcdef01");

    expect(mocks.list).toHaveBeenCalledWith("abcdef0123456789abcdef01");
  });
});
