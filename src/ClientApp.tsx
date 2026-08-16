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

const pages = {
  home: Home,
  matting: Matting,
  upscale: Upscale,
  inpaint: Inpaint,
} as const;

export type PageKey = keyof typeof pages;

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
