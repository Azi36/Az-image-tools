import type { MetadataRoute } from "next";
import { siteUrl } from "@/locale-config";
import { pageSeo } from "@/seo";

export const dynamic = "force-static";

// 直接由 pageSeo 生成，新增工具页只改一处
export default function sitemap(): MetadataRoute.Sitemap {
  return Object.entries(pageSeo).map(([key, seo]) => ({
    url: new URL(seo.path, siteUrl).href,
    changeFrequency: "monthly",
    priority: key === "home" ? 1 : 0.9,
  }));
}
