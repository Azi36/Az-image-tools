import ClientApp, { type PageKey } from "@/ClientApp";
import type { SupportedLocale } from "@/locale-config";
import type { LocaleData } from "@/type";

type ClientPageProps = {
  lang: SupportedLocale;
  locale: LocaleData;
  page?: PageKey;
};

export default function ClientPage({ lang, locale, page }: ClientPageProps) {
  return <ClientApp lang={lang} locale={locale} page={page} />;
}
