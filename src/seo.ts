import type { Metadata } from "next";
import type { LocaleData } from "./type";
import { siteUrl, type SupportedLocale } from "./locale-config";

export const metadataBase = new URL(siteUrl);

/**
 * 分享卡片图，全站共用一张。
 * 设计稿在 scripts/og/og-image.html，改完用无头浏览器重新截图。
 */
const ogImage = {
  url: "/og.jpg",
  width: 1200,
  height: 630,
  alt: "Az-im — 把图片变轻一点",
};

export type PageKey = "home" | "matting" | "upscale" | "inpaint";

type PageSeo = {
  /** 站内路径，导出用了 trailingSlash，子页统一带尾斜杠 */
  path: string;
  /** 首页文案在 locale 里（siteTitle / siteDescription），这里只给子页 */
  title?: string;
  description?: string;
  /** 结构化数据里的功能点 */
  features: Array<string>;
};

/**
 * 每个工具页都得有自己的 title / description / canonical。
 * 放在 layout 里共用会让四个页面互相判重，子页直接掉出索引。
 */
export const pageSeo: Record<PageKey, PageSeo> = {
  home: {
    path: "/",
    features: [
      "批量压缩 JPEG / PNG / WebP / GIF / SVG / AVIF",
      "HEIC / HEIF 输入与格式互转",
      "按宽高、长短边、百分比缩放",
      "比例、固定尺寸、纸张预设裁剪",
      "压缩前后对比与 ZIP 打包下载",
    ],
  },
  matting: {
    path: "/matting/",
    title: "Az-im - 在线背景移除",
    description: "在浏览器本地移除图片背景，模型本地推理，图片不上传。",
    features: [
      "AI 自动抠图，输出透明背景 PNG",
      "快速（U2-Netp）与高质量（Silueta）双模型",
      "WebGPU 加速，失败自动降级 CPU",
    ],
  },
  upscale: {
    path: "/upscale/",
    title: "Az-im - 在线图片放大",
    description: "AI 超分辨率放大图片，模型在浏览器本地推理，图片不上传。",
    features: [
      "Real-ESRGAN 超分辨率放大 2x / 4x",
      "分块推理，兼顾大图与显存占用",
      "WebGPU 加速，失败自动降级 CPU",
    ],
  },
  inpaint: {
    path: "/inpaint/",
    title: "Az-im - 在线去水印",
    description: "涂抹水印一键修复，算法在浏览器本地执行，图片不上传。",
    features: [
      "涂抹选区，一键修复水印、logo、文字",
      "OpenCV Telea 修复算法，零模型下载",
      "可多轮迭代修复",
    ],
  },
};

/** layout 级别的公共项：这里绝不能放 canonical / openGraph，否则会被子页继承 */
export const rootMetadata: Metadata = {
  metadataBase,
  icons: {
    icon: "/favicon.svg",
  },
  other: {
    google: "notranslate",
  },
};

export function createPageMetadata(
  locale: SupportedLocale,
  localeData: LocaleData,
  page: PageKey = "home",
): Metadata {
  const seo = pageSeo[page];
  const title = seo.title ?? localeData.siteTitle;
  const description = seo.description ?? localeData.siteDescription;

  return {
    ...rootMetadata,
    title,
    description,
    alternates: {
      canonical: seo.path,
    },
    openGraph: {
      type: "website",
      url: seo.path,
      title,
      description,
      siteName: "Az-im",
      locale: locale.replace("-", "_"),
      images: [ogImage],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage.url],
    },
  };
}

/** 结构化数据：让搜索结果知道这是个免费的纯前端图片工具 */
export function createPageJsonLd(
  locale: SupportedLocale,
  localeData: LocaleData,
  page: PageKey = "home",
) {
  const seo = pageSeo[page];
  const title = seo.title ?? localeData.siteTitle;
  const description = seo.description ?? localeData.siteDescription;

  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: title,
    url: new URL(seo.path, siteUrl).href,
    description,
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Any",
    browserRequirements: "Requires JavaScript",
    inLanguage: locale,
    isAccessibleForFree: true,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "CNY",
    },
    featureList: seo.features,
    publisher: {
      "@type": "Organization",
      name: "Azi36",
      url: "https://azi36.com",
    },
  };
}
