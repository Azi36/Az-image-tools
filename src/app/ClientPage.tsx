import ClientApp, { type PageKey } from "@/ClientApp";
import type { SupportedLocale } from "@/locale-config";
import type { LocaleData } from "@/type";
import { createPageJsonLd } from "@/seo";

type ClientPageProps = {
  lang: SupportedLocale;
  locale: LocaleData;
  page?: PageKey;
};

export default function ClientPage({ lang, locale, page }: ClientPageProps) {
  const jsonLd = createPageJsonLd(lang, locale, page);

  return (
    <>
      {/* 结构化数据；按 Next 的建议转义 < 防注入 */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <ClientApp lang={lang} locale={locale} page={page} />
    </>
  );
}
