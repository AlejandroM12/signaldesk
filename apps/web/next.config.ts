import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

const rootDir = path.resolve(process.cwd(), "../..");
const { combinedEnv } = loadEnvConfig(
  rootDir,
  process.env.NODE_ENV !== "production",
  undefined,
  true,
);

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_API_URL: combinedEnv.NEXT_PUBLIC_API_URL,
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
