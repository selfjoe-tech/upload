import type { NextConfig } from "next";

const nextConfig: NextConfig = {

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
    ];
  },
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },

  // Helps avoid bundler weirdness with ffmpeg packages in some setups
  transpilePackages: ["@ffmpeg/ffmpeg", "@ffmpeg/core"],

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "dzgpkywovaezlaabuxhl.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: "dzgpkywovaezlaabuxhl.supabase.co",
        pathname: "/storage/v1/object/sign/**",
      },
    ],
  },
};

export default nextConfig;
