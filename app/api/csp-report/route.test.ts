import { beforeEach, describe, expect, it, vi } from "vitest";

const warn = vi.hoisted(() => vi.fn());
vi.mock("@/app/libs/logger", () => ({ logger: { warn, error: vi.fn() } }));

import { POST } from "./route";

const post = (body: string) => POST(new Request("http://localhost/api/csp-report", { method: "POST", body }));

beforeEach(() => warn.mockClear());

describe("CSP report collection", () => {
  it("logs a legacy report-uri violation without query strings", async () => {
    const response = await post(JSON.stringify({ "csp-report": {
      "document-uri": "https://bidlane.net/reset-password?token=secret",
      "effective-directive": "img-src",
      "blocked-uri": "https://tracker.example/pixel.gif?id=1",
      disposition: "report",
    } }));
    expect(response.status).toBe(204);
    expect(warn).toHaveBeenCalledWith("csp.violation", expect.objectContaining({
      directive: "img-src",
      document: "https://bidlane.net/reset-password",
      blocked: "https://tracker.example/pixel.gif",
      disposition: "report",
    }));
    expect(JSON.stringify(warn.mock.calls)).not.toContain("secret");
  });

  it("logs Reporting API violations and ignores other report types", async () => {
    const response = await post(JSON.stringify([
      { type: "csp-violation", body: { documentURL: "https://bidlane.net/", effectiveDirective: "script-src-elem", blockedURL: "inline", lineNumber: 4 } },
      { type: "deprecation", body: { id: "x" } },
    ]));
    expect(response.status).toBe(204);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("csp.violation", expect.objectContaining({ directive: "script-src-elem", blocked: "inline", line: 4 }));
  });

  it("caps how many violations one request can log", async () => {
    const report = { type: "csp-violation", body: { effectiveDirective: "img-src" } };
    await post(JSON.stringify(Array.from({ length: 50 }, () => report)));
    expect(warn).toHaveBeenCalledTimes(10);
  });

  it.each(["{", "null", "[]", '{"other":1}'])("rejects %s without logging", async (body) => {
    expect((await post(body)).status).toBe(400);
    expect(warn).not.toHaveBeenCalled();
  });

  it("rejects oversized bodies", async () => {
    expect((await post("x".repeat(17 * 1024))).status).toBe(413);
    expect(warn).not.toHaveBeenCalled();
  });
});
