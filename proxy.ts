import { withAuth } from "next-auth/middleware";

const proxy = withAuth(
  function proxy() {
    return;
  },
  {
    pages: {
      signIn: "/signin",
    },
  }
);

export default proxy;

export const config = {
  matcher: ["/users/:path*", "/submit-listing", "/account/:path*"],
};
