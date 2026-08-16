import type { Viewport } from "next";
import "@/main.scss";
import zhCN from "@/locales/zh-CN";
import { createLocaleMetadata } from "@/seo";

export const metadata = createLocaleMetadata("zh-CN", zhCN);

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1e40d8",
};

// 与主站同款的主题引导：首帧前恢复 azi-theme，避免深色模式闪白
const themeBootstrap =
  'try{var t=localStorage.getItem("azi-theme");if(t)document.documentElement.setAttribute("data-theme",t)}catch(e){}';

export default function DefaultLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
        {children}
      </body>
    </html>
  );
}
