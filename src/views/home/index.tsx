import { useCallback, useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { runInAction } from "mobx";
import { Info, ShieldCheck, SlidersHorizontal, Upload } from "lucide-react";
import style from "./index.module.scss";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { UploadCard } from "@/components/UploadCard";
import { Compare } from "@/components/Compare";
import { ItemOption } from "@/components/ItemOption";
import { RenameDialog } from "@/components/RenameDialog";
import { DropConfirm } from "@/components/DropConfirm";
import { gstate } from "@/global";
import { homeState } from "@/states/home";
import { createImageList, stopAllTasks, useWorkerHandler } from "@/engines/transform";
import { getFilesFromClipboard, hasImageInClipboard } from "@/functions";
import { useFilesDrop } from "@/hooks";
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
  // 列表非空时拖进来的一批：先问清是加入还是替换，问明白了再处理
  const [pendingFiles, setPendingFiles] = useState<Array<File> | null>(null);

  // 监听挂在整页上，不再挂在 UploadCard 上：列表一有图它就被卸载了，
  // 那之后浏览器会接管 drop 直接打开图片，页面上压好的结果全没了
  const dragging = useFilesDrop(
    useCallback((files: Array<File>) => {
      if (homeState.list.size === 0) {
        void createImageList(files);
        return;
      }
      // 询问框开着的时候又拖进来一批就并进去；这里不能停掉监听，
      // 一停浏览器就又会接管 drop 把图片直接打开
      setPendingFiles((previous) => (previous ? [...previous, ...files] : files));
    }, []),
  );

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

  const appendPending = () => {
    const files = pendingFiles ?? [];
    setPendingFiles(null);
    void createImageList(files);
  };

  const replacePending = () => {
    const files = pendingFiles ?? [];
    setPendingFiles(null);
    // 先把还在跑的任务停掉再清列表，否则 worker 还在给已经不存在的图发消息
    stopAllTasks(false);
    // 用 clearList 而不是 clear：换的是图，不是参数
    runInAction(() => homeState.clearList());
    void createImageList(files);
  };

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
            <div className={style.workbench}>{homeState.list.size === 0 ? <UploadCard dragActive={dragging} /> : <LeftContent />}<RightOption /></div>
            {/* 窄屏时右侧选项收进抽屉，这个按钮是唯一入口 */}
            <button type="button" className={style.mobileOptions} aria-label={gstate.locale?.optionPannel.resizeLable} onClick={() => { homeState.showOption = true; }}><SlidersHorizontal size={19} /></button>
          </div>
        </section>
      </main>

      <SiteFooter />
      {homeState.compareId !== null && <Compare />}
      {/* key 让每次打开都拿到一份全新的草稿 */}
      {homeState.editingKey !== null && <ItemOption key={homeState.editingKey} />}
      {homeState.showRename && <RenameDialog />}
      {/* 列表非空时才需要盖一层：空列表的引导卡片自己会高亮 */}
      {dragging && hasImages && (
        <div className={style.dropHint} role="status">
          <Upload size={22} />
          <span>{gstate.locale?.dropConfirm.overlay}</span>
        </div>
      )}
      {pendingFiles !== null && (
        <DropConfirm
          incoming={pendingFiles.length}
          existing={homeState.list.size}
          onAppend={appendPending}
          onReplace={replacePending}
          onCancel={() => setPendingFiles(null)}
        />
      )}
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
