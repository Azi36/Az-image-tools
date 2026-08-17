"use client";

import { useEffect, useState } from "react";
import { configure } from "mobx";
import { gstate } from "./global";
import Home from "./views/home";
import Matting from "./views/matting";
import Upscale from "./views/upscale";
import Inpaint from "./views/inpaint";
import { Loading } from "./components/Loading";
import type { SupportedLocale } from "./locale-config";
import type { LocaleData } from "./type";
import type { PageKey } from "./seo";

// satisfies 保证这里的页面和 seo.ts 里的 pageSeo 一一对应：
// 新增工具页时漏了任何一边都会在编译期报错
const pages = {
  home: Home,
  matting: Matting,
  upscale: Upscale,
  inpaint: Inpaint,
} satisfies Record<PageKey, React.ComponentType>;

export type { PageKey };

type ClientAppProps = {
  lang: SupportedLocale;
  locale: LocaleData;
  page?: PageKey;
};

export default function ClientApp({ lang, locale, page = "home" }: ClientAppProps) {
  useState(() => {
    gstate.lang = lang;
    gstate.locale = locale;
  });

  useEffect(() => {
    configure({
      enforceActions: "never",
      useProxies: "ifavailable",
    });

    document.documentElement.lang = lang;
    window.localStorage.setItem("az-im-locale", lang);
  }, [lang]);

  const Page = pages[page];
  return (
    <>
      <Page />
      {gstate.loading && <Loading />}
    </>
  );
}
