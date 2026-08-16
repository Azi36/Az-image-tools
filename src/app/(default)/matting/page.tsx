import type { Metadata } from "next";
import ClientPage from "../../ClientPage";
import zhCN from "@/locales/zh-CN";

export const metadata: Metadata = {
  title: "Az-im - 在线背景移除",
  description: "在浏览器本地移除图片背景，模型本地推理，图片不上传。",
};

export default function Page() {
  return <ClientPage lang="zh-CN" locale={zhCN} page="matting" />;
}
