import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Preserve the directory URL used by staged static apps. The internal
  // rewrite serves index.html without exposing that filename to routers such
  // as SvelteKit, which otherwise interpret `/index.html` as an app route.
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return [
      {
        source: "/demos/:demo/",
        destination: "/demos/:demo/index.html",
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-src 'none'; object-src 'none'; base-uri 'self'",
          },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default nextConfig;
