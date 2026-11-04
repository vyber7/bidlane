import type { GithubEmail } from "next-auth/providers/github";
import type { UserinfoEndpointHandler } from "next-auth/providers/oauth";

// The public GitHub profile does not prove email ownership. Only return an
// address confirmed by GitHub's authenticated email API before enabling linking.
export const githubUserinfo: UserinfoEndpointHandler = {
  url: "https://api.github.com/user",
  async request({ client, tokens }) {
    if (!tokens.access_token) throw new Error("Missing GitHub access token");
    const profile = await client.userinfo(tokens.access_token);
    const response = await fetch("https://api.github.com/user/emails?per_page=100", {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        Accept: "application/vnd.github+json",
      },
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Unable to verify GitHub email");

    const emails: GithubEmail[] = await response.json();
    const verified = emails.filter((email) => email.verified === true);
    const email = verified.find((email) => email.email === profile.email)
      ?? verified.find((email) => email.primary)
      ?? verified[0];
    if (!email) throw new Error("GitHub sign-in requires a verified email");

    return { ...profile, email: email.email };
  },
};
