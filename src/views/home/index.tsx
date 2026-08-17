import { useEffect } from "react";
import { observer } from "mobx-react-lite";
import { runInAction } from "mobx";
import { Info, ShieldCheck, SlidersHorizontal } from "lucide-react";
import style from "./index.module.scss";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { UploadCard } from "@/components/UploadCard";
import { Compare } from "@/components/Compare";
import { ItemOption } from "@/components/ItemOption";
import { gstate } from "@/global";
import { homeState } from "@/states/home";
import { createImageList, useWorkerHandler } from "@/engines/transform";
import { getFilesFromClipboard, hasImageInClipboard } from "@/functions";
import { LeftContent } from "./LeftContent";
import { RightOption } from "./RightOption";

// 工具站不做营销，介绍引流是主站的事。这里只有工具本身。
const copy = {
  eyebrow: "免费 · 开源 · 图片不出浏览器",
  title: "在线批量图片压缩",
  summary: "压缩、转换、缩放、裁剪。全在本地，不用上传。",
};

const Home = observer(() => {
  useWorkerHandler();
  const notice = homeState.notice;
  // observer 组件里直接读就是响应式的，不用再往 state 里搬一次
  const hasImages = homeState.list.size > 0;

  // 提示自动消失；用 id 做 key，同一句话再次触发也能重新计时
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(
      () => runInAction(() => { homeState.notice = null; }),
      4000,
    );
    return () => window.clearTimeout(timer);
  }, [notice]);

  // 纯前端工具，刷新即全丢：手里有图的时候拦一下
  useEffect(() => {
    if (!hasImages) return;
    const confirmLeave = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", confirmLeave);
    return () => window.removeEventListener("beforeunload", confirmLeave);
  }, [hasImages]);

  useEffect(() => {
    const handlePaste = async (event: ClipboardEvent) => {
      if (!hasImageInClipboard(event)) return;
      // Ignore pastes inside editable elements (inputs, textareas,
      // contenteditable) so normal text editing is not hijacked.
      const target = event.target as HTMLElement | null;
      const editable =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        Boolean(target?.isContentEditable);
      if (editable) return;
      event.preventDefault();
      const files = await getFilesFromClipboard(event);
      if (files.length > 0) createImageList(files);
    };
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, []);

  return (
    <div className={style.page} id="top">
      <SiteHeader active="compress" />

      <main>
        <section className={style.hero}>
          <div className={style.decor} aria-hidden="true"><i /><i /><i /><span /></div>
          <div className={style.heroCopy}>
            <span className={style.eyebrow}><ShieldCheck size={16} />{copy.eyebrow}</span>
            <h1>{copy.title}</h1>
            <p>{copy.summary}</p>
          </div>
          <div className={style.workspace}>
            <div className={style.workbench}>{homeState.list.size === 0 ? <UploadCard /> : <LeftContent />}<RightOption /></div>
            {/* 窄屏时右侧选项收进抽屉，这个按钮是唯一入口 */}
            <button type="button" className={style.mobileOptions} aria-label={gstate.locale?.optionPannel.resizeLable} onClick={() => { homeState.showOption = true; }}><SlidersHorizontal size={19} /></button>
          </div>
        </section>
      </main>

      <SiteFooter />
      {homeState.compareId !== null && <Compare />}
      {/* key 让每次打开都拿到一份全新的草稿 */}
      {homeState.editingKey !== null && <ItemOption key={homeState.editingKey} />}
      {notice && (
        <div key={notice.id} className={style.notice} role="status">
          <Info size={17} />
          <span>{notice.text}</span>
        </div>
      )}
    </div>
  );
});

export default Home;
