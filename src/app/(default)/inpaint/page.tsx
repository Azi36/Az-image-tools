import ClientPage from "../../ClientPage";
import zhCN from "@/locales/zh-CN";
import { createPageMetadata } from "@/seo";

export const metadata = createPageMetadata("zh-CN", zhCN, "inpaint");

export default function Page() {
  return <ClientPage lang="zh-CN" locale={zhCN} page="inpaint" />;
}
