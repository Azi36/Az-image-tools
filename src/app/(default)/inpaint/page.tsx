import type { Metadata } from "next";
import ClientPage from "../../ClientPage";
import zhCN from "@/locales/zh-CN";

export const metadata: Metadata = {
  title: "Az-im - 在线去水印",
  description: "涂抹水印一键修复，算法在浏览器本地执行，图片不上传。",
};

export default function Page() {
  return <ClientPage lang="zh-CN" locale={zhCN} page="inpaint" />;
}
