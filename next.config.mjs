import { securityHeaders } from "./app/libs/security-headers.mjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Turbopack unwraps this package's CommonJS default twice via its ESM wrapper.
  serverExternalPackages: ["mongodb-connection-string-url"],
  async headers() {
    return [{
      source: "/:path*",
      headers: securityHeaders({
        dev: process.env.NODE_ENV === "development",
        preview: process.env.VERCEL_ENV === "preview",
      }),
    }];
  },
  async redirects() {
    return [
      { source: "/live/listings", destination: "/?status=live#auctions", permanent: true },
      { source: "/future/listings", destination: "/?status=upcoming#auctions", permanent: true },
      { source: "/past/listings", destination: "/?status=ended#auctions", permanent: true },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
        port: "",
        pathname: "**",
      },
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        port: "",
        pathname: "**",
      },
    ],
  },
};

export default nextConfig;
