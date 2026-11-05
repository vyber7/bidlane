import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("../(site)/components/AuthForm", () => ({ default: () => <div>Sign-in form</div> }));
import SignIn from "./page";

describe("sign-in account collision guidance", () => {
  it("explains the original sign-in method and offers password recovery", async () => {
    const html = renderToStaticMarkup(await SignIn({ searchParams: Promise.resolve({ error: "OAuthAccountNotLinked" }) }));
    expect(html).toContain('role="alert"');
    expect(html).toContain("Use the method you originally signed up with");
    expect(html).toContain('href="/forgot-password"');
    expect(html).toContain("Sign-in form");
  });

  it.each([undefined, "<script>untrusted error</script>", ["OAuthAccountNotLinked", "untrusted error"]])(
    "does not reflect arbitrary errors or show a collision alert for %s",
    async (error) => {
      const html = renderToStaticMarkup(await SignIn({ searchParams: Promise.resolve({ error }) }));
      expect(html).not.toContain('role="alert"');
      expect(html).not.toContain("untrusted error");
      expect(html).toContain("Sign-in form");
    },
  );
});
