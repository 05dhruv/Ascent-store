/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
  experimental: {
    proxyClientMaxBodySize: 35 * 1024 * 1024,
  },
  images: {
    // Product images often come from arbitrary vendor/CDN URLs;
    // SmartImage uses unoptimized where needed.
    remotePatterns: [
      { protocol: "https", hostname: "cdn.jsdelivr.net" },
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "http", hostname: "localhost" },
      { protocol: "http", hostname: "127.0.0.1" },
    ],
  },
  turbopack: {
    root: process.cwd(),
  },
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL || "";
    const isProduction =
      process.env.NODE_ENV === "production" || process.env.VERCEL === "1";

    if (!backendUrl || !isProduction) return [];

    return {
      beforeFiles: [
        {
          source: "/api/:path*",
          destination: `${backendUrl.replace(/\/$/, "")}/api/:path*`,
        },
      ],
    };
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
