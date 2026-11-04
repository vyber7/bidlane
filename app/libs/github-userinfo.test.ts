import { afterEach, describe, expect, it, vi } from "vitest";
import { githubUserinfo } from "./github-userinfo";

const request = githubUserinfo.request!;
const userinfo = vi.fn();
const fetchEmails = vi.fn();
const context = {
  client: { userinfo },
  tokens: { access_token: "github-token" },
} as unknown as Parameters<typeof request>[0];

afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks(); });

function mockProfile(email: string | null, emails: unknown[], status = 200) {
  userinfo.mockResolvedValue({ id: 123, login: "driver", email });
  fetchEmails.mockResolvedValue(new Response(JSON.stringify(emails), { status }));
  vi.stubGlobal("fetch", fetchEmails);
}

describe("GitHub verified email selection", () => {
  it("preserves a public email only when GitHub confirms it is verified", async () => {
    mockProfile("driver@example.com", [
      { email: "primary@example.com", primary: true, verified: true },
      { email: "driver@example.com", primary: false, verified: true },
    ]);
    expect(await request(context)).toMatchObject({ id: 123, email: "driver@example.com" });
    expect(fetchEmails).toHaveBeenCalledWith("https://api.github.com/user/emails?per_page=100", {
      headers: { Authorization: "Bearer github-token", Accept: "application/vnd.github+json" },
      cache: "no-store",
    });
  });

  it("uses a verified primary email for a private GitHub profile", async () => {
    mockProfile(null, [{ email: "driver@example.com", primary: true, verified: true }]);
    expect(await request(context)).toMatchObject({ email: "driver@example.com" });
  });

  it("never links using an unverified public or primary email", async () => {
    mockProfile("victim@example.com", [
      { email: "victim@example.com", primary: true, verified: false },
      { email: "owner@example.com", primary: false, verified: true },
    ]);
    expect(await request(context)).toMatchObject({ email: "owner@example.com" });
  });

  it.each([
    { emails: [] },
    { emails: [{ email: "victim@example.com", primary: true, verified: false }] },
  ])("rejects profiles without any verified email ($emails)", async ({ emails }) => {
    mockProfile("victim@example.com", emails);
    await expect(request(context)).rejects.toThrow("requires a verified email");
  });

  it("fails closed when GitHub's email API fails, even with a public email", async () => {
    mockProfile("driver@example.com", [], 403);
    await expect(request(context)).rejects.toThrow("Unable to verify GitHub email");
  });

  it("fails closed on network errors", async () => {
    mockProfile("driver@example.com", []);
    fetchEmails.mockRejectedValue(new Error("network unavailable"));
    await expect(request(context)).rejects.toThrow("network unavailable");
  });

  it("rejects a missing access token before requesting profile data", async () => {
    await expect(request({ ...context, tokens: {} })).rejects.toThrow("Missing GitHub access token");
    expect(userinfo).not.toHaveBeenCalled();
  });
});
