import type { Metadata } from "next";
import ClientPage from "../../ClientPage";
import zhCN from "@/locales/zh-CN";

export const metadata: Metadata = {
  title: "Az-im - 在线图片放大",
  description: "AI 超分辨率放大图片，模型在浏览器本地推理，图片不上传。",
};

export default function Page() {
  return <ClientPage lang="zh-CN" locale={zhCN} page="upscale" />;
}
