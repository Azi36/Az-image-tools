import { observer } from "mobx-react-lite";
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleSlash,
  Download,
  Eye,
  FolderPlus,
  LoaderCircle,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  StopCircle,
  Trash2,
} from "lucide-react";
import { sprintf } from "sprintf-js";
import style from "./LeftContent.module.scss";
import { ImageInput } from "@/components/ImageInput";
import { ProgressHint } from "@/components/ProgressHint";
import { gstate } from "@/global";
import {
  homeState,
  type ImageItem,
  type ListFilter,
  type ListSort,
} from "@/states/home";
import {
  createDownload,
  formatSize,
  getFilesFromHandle,
  getOutputFileName,
  getUniqNameOnNames,
} from "@/functions";
import { createImageList, stopAllTasks } from "@/engines/transform";
import { ERROR_ANIMATED_UNSUPPORTED } from "@/engines/animation";
import { ERROR_PROCESS_CRASHED, ERROR_UNSUPPORTED_TYPE } from "@/engines/handler";
import { CompressionRate } from "@/components/CompressionRate";

/** worker 回来的是哨兵字符串，这里翻成给人看的话 */
function describeError(error: string) {
  if (error === ERROR_ANIMATED_UNSUPPORTED) {
    return gstate.locale?.errors.animatedUnsupported ?? error;
  }
  if (error === ERROR_UNSUPPORTED_TYPE) {
    return gstate.locale?.errors.unsupportedType ?? error;
  }
  if (error === ERROR_PROCESS_CRASHED) {
    return gstate.locale?.errors.processCrashed ?? error;
  }
  return error;
}

function isHeif(item: ImageItem) {
  const extension = item.name.split(".").pop()?.toLowerCase();
  return ["image/heic", "image/heif"].includes(item.blob.type.toLowerCase()) ||
    extension === "heic" || extension === "heif";
}

function IconButton({ label, disabled, danger = false, onClick, children }: {
  label: string;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return <button type="button" className={danger ? style.dangerButton : style.iconButton} aria-label={label} title={label} disabled={disabled} onClick={onClick}>{children}</button>;
}

const ResultItem = observer(({ item, onPreviewUnavailable }: { item: ImageItem; onPreviewUnavailable: () => void }) => {
  const completed = Boolean(item.preview && item.compress);
  const hasError = item.status === "error";
  const outputSize = item.compress?.blob.size;
  const reduced = outputSize !== undefined && item.blob.size > outputSize;

  const compare = () => {
    if (!item.compress || homeState.isCropMode(homeState.optionOf(item))) return;
    if (isHeif(item)) {
      onPreviewUnavailable();
      return;
    }
    homeState.compareId = item.key;
  };

  let statusIcon: React.ReactNode;
  if (hasError) {
    statusIcon = <AlertTriangle size={17} className={style.errorIcon} />;
  } else if (item.status === "cancelled") {
    statusIcon = <CircleSlash size={17} className={style.cancelledIcon} />;
  } else if (completed) {
    statusIcon = <CheckCircle2 size={17} />;
  } else {
    statusIcon = <LoaderCircle className={style.spin} size={17} />;
  }

  return (
    <article className={style.resultItem}>
      <button type="button" className={style.preview} onClick={compare} disabled={!item.compress || Boolean(homeState.isCropMode(homeState.optionOf(item)))} aria-label={gstate.locale?.previewHelp}>
        {item.preview ? <img src={item.preview.src} alt="" /> : <span />}
        {item.compress && !homeState.isCropMode(homeState.optionOf(item)) && <i><Eye size={18} /></i>}
      </button>
      <div className={style.fileInfo}>
        <div className={style.fileName}>
          {statusIcon}
          <strong title={item.name}>{item.name}</strong>
          {item.option && <em className={style.customBadge}>{gstate.locale?.itemOption.badge}</em>}
        </div>
        <div className={style.fileMeta}><span>{item.width || "-"} x {item.height || "-"}</span><span>{formatSize(item.blob.size)}</span></div>
      </div>
      <div className={style.outputInfo}>
        <small>{gstate.locale?.columnTitle.newSize}</small>
        <strong className={reduced ? style.success : style.warning}>{outputSize === undefined ? "-" : formatSize(outputSize)}</strong>
        <span>{item.compress ? `${item.compress.width} x ${item.compress.height}` : "-"}</span>
      </div>
      <div className={style.rate}>
        <small>{gstate.locale?.columnTitle.decrease}</small>
        <CompressionRate originSize={item.blob.size} outputSize={outputSize} />
      </div>
      <div className={style.itemActions}>
        <IconButton label={gstate.locale?.itemOption.open ?? "Settings"} onClick={() => { homeState.editingKey = item.key; }}><SlidersHorizontal size={18} /></IconButton>
        <IconButton label={gstate.locale?.listAction.downloadOne ?? "Download"} disabled={!item.compress} onClick={() => { if (item.compress?.blob) createDownload(getOutputFileName(item, homeState.optionOf(item)), item.compress.blob); }}><Download size={18} /></IconButton>
        <IconButton label={gstate.locale?.listAction.removeOne ?? "Remove"} danger onClick={() => homeState.remove(item.key)}><Trash2 size={18} /></IconButton>
      </div>
      {item.processError && (() => {
        const errorText = describeError(item.processError);
        return (
          <div className={style.errorTooltip} title={errorText}>
            <AlertTriangle size={14} />
            <span>{errorText}</span>
          </div>
        );
      })()}
      {item.preservedOriginal && (
        <div className={style.noticeTooltip}>
          <AlertTriangle size={14} />
          <span>{gstate.locale?.heif.originalPreserved}</span>
        </div>
      )}
    </article>
  );
});

/** 筛选条：只显示有内容的那几档，没失败就不必摆一个「失败 0」在那儿 */
const ListControls = observer(() => {
  const stats = homeState.getStats();
  const filters: Array<{ key: ListFilter; label?: string; count: number }> = [
    { key: "all", label: gstate.locale?.listFilter.all, count: stats.total },
    { key: "error", label: gstate.locale?.listFilter.error, count: stats.error },
    { key: "cancelled", label: gstate.locale?.listFilter.cancelled, count: stats.cancelled },
    { key: "larger", label: gstate.locale?.listFilter.larger, count: stats.larger },
  ];
  const sorts: Array<{ key: ListSort; label?: string }> = [
    { key: "default", label: gstate.locale?.listFilter.sortDefault },
    { key: "sizeDesc", label: gstate.locale?.listFilter.sortSize },
    { key: "rateAsc", label: gstate.locale?.listFilter.sortRate },
  ];

  return (
    <div className={style.listControls}>
      <div className={style.chips}>
        {filters.map((item) =>
          item.key === "all" || item.count > 0 ? (
            <button
              key={item.key}
              type="button"
              className={homeState.filter === item.key ? style.chipActive : style.chip}
              aria-pressed={homeState.filter === item.key}
              onClick={() => { homeState.filter = item.key; }}
            >
              {item.label}<b>{item.count}</b>
            </button>
          ) : null,
        )}
      </div>
      <div className={style.chips}>
        <span className={style.chipsLabel}>{gstate.locale?.listFilter.sortLabel}</span>
        {sorts.map((item) => (
          <button
            key={item.key}
            type="button"
            className={homeState.sort === item.key ? style.chipActive : style.chip}
            aria-pressed={homeState.sort === item.key}
            onClick={() => { homeState.sort = item.key; }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
});

export const LeftContent = observer(() => {
  const disabled = homeState.hasTaskRunning();
  const fileRef = useRef<HTMLInputElement>(null);
  const progressRef = useRef<HTMLElement>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [zipPercent, setZipPercent] = useState<number | null>(null);
  const [visibleCount, setVisibleCount] = useState(32);
  const visibleItems = homeState.getVisibleItems();
  // 分页看的是筛选后的条数；换筛选/排序要从头开始数
  const totalItems = visibleItems.length;
  const listKey = `${homeState.filter}-${homeState.sort}`;

  useEffect(() => {
    setVisibleCount(32);
  }, [listKey]);

  useEffect(() => {
    if (totalItems === 0) {
      return;
    }
    if (visibleCount >= totalItems) return;
    const progress = progressRef.current;
    if (!progress) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisibleCount((count) => Math.min(totalItems, count + 32));
      }
    }, {
      rootMargin: "200px",
    });
    observer.observe(progress);
    return () => observer.disconnect();
  }, [totalItems, visibleCount]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const downloadAll = async () => {
    // 几百张图打包要几十秒，不能只给一个转圈：JSZip 自带进度回调，用上
    setZipPercent(0);
    try {
      const jszip = await import("jszip");
      const zip = new jszip.default();
      const names = new Set<string>();
      for (const info of homeState.list.values()) {
        if (!info.compress?.blob) continue;
        const uniqueName = getUniqNameOnNames(
          names,
          getOutputFileName(info, homeState.optionOf(info)),
        );
        names.add(uniqueName);
        zip.file(uniqueName, info.compress.blob);
      }
      const archive = await zip.generateAsync(
        { type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } },
        (metadata) => setZipPercent(Math.round(metadata.percent)),
      );
      createDownload("az-im.zip", archive);
    } finally {
      setZipPercent(null);
    }
  };

  return (
    <div className={style.content}>
      <div className={style.toolbar}>
        <div>
          <button type="button" className="button buttonPrimary" disabled={disabled} onClick={() => fileRef.current?.click()}><Plus size={18} />{gstate.locale?.listAction.batchAppend}</button>
          {typeof window.showDirectoryPicker === "function" && (
            <button
              type="button"
              className="button"
              disabled={disabled}
              onClick={async () => {
                try {
                  const handle = await window.showDirectoryPicker();
                  createImageList(await getFilesFromHandle(handle));
                } catch {
                  // User cancelled the directory picker — no-op.
                }
              }}
            >
              <FolderPlus size={18} />
              {gstate.locale?.listAction.addFolder}
            </button>
          )}
        </div>
        <div>
          {/* 处理中给一条出路：以前这里全是禁用态，想反悔只能刷新整页 */}
          {disabled && (
            <button type="button" className="button" onClick={() => stopAllTasks()}>
              <StopCircle size={18} />{gstate.locale?.listAction.stop}
            </button>
          )}
          <IconButton label={gstate.locale?.listAction.reCompress ?? "Recompress"} disabled={disabled} onClick={() => homeState.reCompress()}><RefreshCw size={18} /></IconButton>
          {/* 清空不跟着禁用：先把还在跑的任务停掉，再清列表 */}
          <IconButton label={gstate.locale?.listAction.clear ?? "Clear"} danger onClick={() => { stopAllTasks(false); homeState.clear(); }}><Trash2 size={18} /></IconButton>
          <button type="button" className="button buttonAccent" disabled={disabled || zipPercent !== null} onClick={downloadAll}>
            <Download size={18} />
            {zipPercent === null
              ? gstate.locale?.listAction.downloadAll
              : sprintf(gstate.locale?.listAction.packing ?? "", zipPercent)}
          </button>
        </div>
        <ImageInput ref={fileRef} />
      </div>
      <ListControls />
      <div className={style.list}>
        {visibleItems.length === 0 ? (
          <p className={style.emptyList}>{gstate.locale?.listFilter.empty}</p>
        ) : (
          visibleItems
            .slice(0, visibleCount)
            .map((item) => (
              <ResultItem
                key={item.key}
                item={item}
                onPreviewUnavailable={() => setToast(gstate.locale?.heif.previewUnavailable ?? "")}
              />
            ))
        )}
      </div>
      <footer ref={progressRef} className={style.progress}><ProgressHint /></footer>
      {toast && <div className={style.toast} role="status"><AlertTriangle size={17} /><span>{toast}</span></div>}
    </div>
  );
});
