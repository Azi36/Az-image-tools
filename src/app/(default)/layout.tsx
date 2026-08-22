import type { Viewport } from "next";
import "@/main.scss";
import { rootMetadata } from "@/seo";

// 只放公共项：title / description / canonical / openGraph 一律由各页自己声明，
// 放这里会被子页继承，四个页面就会互相判重
export const metadata = rootMetadata;

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#016c73",
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
        {/* 家族站点访问统计：主站托管的一行脚本，按 data-site 归到 im；后端不可达时静默 */}
        <script src="https://azi36.com/assets/hit.js" data-site="im" defer />
        {children}
      </body>
    </html>
  );
}
