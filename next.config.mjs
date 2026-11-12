/** @type {import('next').NextConfig} */
const nextConfig = {
  // Turbopack unwraps this package's CommonJS default twice via its ESM wrapper.
  serverExternalPackages: ["mongodb-connection-string-url"],
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
