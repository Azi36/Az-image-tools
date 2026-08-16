import type { Metadata } from "next";
import type { LocaleData } from "./type";
import { siteUrl, type SupportedLocale } from "./locale-config";

export const metadataBase = new URL(siteUrl);

export function createLocaleMetadata(
  locale: SupportedLocale,
  localeData: LocaleData,
): Metadata {
  return {
    metadataBase,
    title: localeData.siteTitle,
    description: localeData.siteDescription,
    alternates: {
      canonical: "/",
    },
    openGraph: {
      type: "website",
      url: "/",
      title: localeData.siteTitle,
      description: localeData.siteDescription,
      siteName: "Az-im",
      locale: locale.replace("-", "_"),
    },
    icons: {
      icon: "/favicon.svg",
    },
    other: {
      google: "notranslate",
    },
  };
}
