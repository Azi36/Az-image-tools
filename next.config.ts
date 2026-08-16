import type { NextConfig } from "next";

const isPagesBuild =
  process.env.CF_PAGES === "1" ||
  process.env.npm_lifecycle_event === "build:pages";

const nextConfig: NextConfig = {
  output: isPagesBuild ? "export" : "standalone",
  // 子页面导出为 目录/index.html，任何静态托管都能直接伺服
  trailingSlash: true,
  experimental: {
    globalNotFound: true,
  },
};

export default nextConfig;