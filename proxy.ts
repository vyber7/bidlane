import { decodeSessionToken } from "./app/libs/session-token";
import { withAuth } from "next-auth/middleware";

const proxy = withAuth(
  function proxy() {
    return;
  },
  {
    jwt: { decode: decodeSessionToken },
    pages: {
      signIn: "/signin",
    },
  }
);

export default proxy;

export const config = {
  matcher: ["/users/:path*", "/submit-listing", "/account/:path*"],
};
