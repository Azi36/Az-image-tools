import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import {
  Check,
  Copy,
  Cpu,
  Download,
  ImagePlus,
  RefreshCw,
  RotateCcw,
  Sparkles,
  SquareSplitHorizontal,
  StopCircle,
  Zap,
} from "lucide-react";
import style from "./index.module.scss";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { removeBackground } from "@/engines/aiClient";
import {
  AI_CANCELLED,
  MATTING_MODELS,
  isModelCached,
  webGpuAvailable,
  type MattingModelKey,
} from "@/engines/ai-shared";
import { useHotkey, useImageDrop } from "@/hooks";
import {
  canCopyImage,
  copyImageToClipboard,
  createDownload,
  formatSize,
} from "@/functions";

const copy = {
  eyebrow: "AI · 本地模型 · 图片不出浏览器",
  title: "在线背景移除",
  summary: "一键抠图。模型在你的浏览器里跑，图片照旧不上传。",
  dropTitle: "选取图片到这里，支持拖拽和粘贴",
  dropHint: "首次使用需下载所选模型，之后走浏览器缓存",
  modelLabel: "模型",
  cached: "已下载",
  modelLoading: "正在下载模型",
  modelCached: "正在准备模型",
  running: "抠图中",
  runningHint: "低配设备可能要几秒，中途可以随时停止",
  stop: "停止",
  download: "下载 PNG",
  copy: "复制到剪贴板",
  copied: "已复制",
  copyFailed: "复制失败，换个浏览器或直接下载吧",
  rerun: "重新抠图",
  again: "换一张",
  compare: "对比原图",
  compareOff: "看结果",
  retry: "重试",
  start: "开始抠图",
  cancelled: "已停止。原图还在，可以直接重来。",
  failed: "处理失败了，换张图或重试一次",
  modelFailed: "模型下载失败，检查下网络再重试",
  gpu: "WebGPU 加速",
  cpu: "CPU 模式",
  bgLabel: "结果底色",
  elapsed: (seconds: number) => `耗时 ${seconds} 秒`,
};

/** 透明背景在不同底色上观感差别很大，给个切换方便看边缘 */
const BACKGROUNDS = [
  { key: "checker", label: "格纹" },
  { key: "white", label: "白" },
  { key: "black", label: "黑" },
] as const;

type BackgroundKey = (typeof BACKGROUNDS)[number]["key"];

type Status =
  | { kind: "idle" }
  | { kind: "ready"; notice?: string }
  | { kind: "model"; percent: number; loaded: number; total: number }
  | { kind: "run" }
  | { kind: "done"; seconds: number }
  | { kind: "error"; message: string };

type Picture = {
  blob: Blob;
  url: string;
  width: number;
  height: number;
};

async function describe(blob: Blob): Promise<Picture> {
  const bitmap = await createImageBitmap(blob);
  const picture = {
    blob,
    url: URL.createObjectURL(blob),
    width: bitmap.width,
    height: bitmap.height,
  };
  bitmap.close();
  return picture;
}

const Matting = observer(() => {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [modelKey, setModelKey] = useState<MattingModelKey>("u2netp");
  const [cachedMap, setCachedMap] = useState<Record<string, boolean>>({});
  const [gpu, setGpu] = useState(false);
  const [source, setSource] = useState<Picture | null>(null);
  const [result, setResult] = useState<Picture | null>(null);
  const [showSource, setShowSource] = useState(false);
  const [background, setBackground] = useState<BackgroundKey>("checker");
  const [toast, setToast] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const busy = status.kind === "model" || status.kind === "run";

  const refreshCached = () => {
    MATTING_MODELS.forEach((model) => {
      isModelCached(model.url).then((cached) =>
        setCachedMap((prev) => ({ ...prev, [model.key]: cached })),
      );
    });
  };

  useEffect(() => {
    setGpu(webGpuAvailable());
    refreshCached();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // 离开页面时把还在跑的推理停掉
  useEffect(() => () => abort.current?.abort(), []);

  const clearResult = () => {
    setResult((previous) => {
      if (previous) URL.revokeObjectURL(previous.url);
      return null;
    });
    setShowSource(false);
  };

  const reset = () => {
    abort.current?.abort();
    setSource((previous) => {
      if (previous) URL.revokeObjectURL(previous.url);
      return null;
    });
    clearResult();
    setStatus({ kind: "idle" });
  };

  const process = async (picture: Picture, key: MattingModelKey) => {
    clearResult();
    const controller = new AbortController();
    abort.current = controller;
    setStatus({ kind: "model", percent: 0, loaded: 0, total: 0 });

    const startedAt = performance.now();
    try {
      const output = await removeBackground(
        picture.blob,
        key,
        (progress) => {
          if (progress.stage === "model") {
            setStatus({
              kind: "model",
              percent: progress.percent,
              loaded: progress.loaded,
              total: progress.total,
            });
          } else {
            setStatus({ kind: "run" });
          }
        },
        controller.signal,
      );
      setResult(await describe(output));
      setStatus({
        kind: "done",
        seconds: Math.max(1, Math.round((performance.now() - startedAt) / 1000)),
      });
      refreshCached();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === AI_CANCELLED) {
        setStatus({ kind: "ready", notice: copy.cancelled });
        return;
      }
      console.error("[Az-im] matting failed:", error);
      setStatus({
        kind: "error",
        message: message.includes("fetch model") ? copy.modelFailed : copy.failed,
      });
    } finally {
      if (abort.current === controller) abort.current = null;
    }
  };

  const start = async (file: Blob) => {
    setSource((previous) => {
      if (previous) URL.revokeObjectURL(previous.url);
      return null;
    });
    const picture = await describe(file);
    setSource(picture);
    process(picture, modelKey);
  };

  const changeModel = (key: MattingModelKey) => {
    if (busy || key === modelKey) return;
    setModelKey(key);
    // 已经有图了就直接用新模型重跑
    if (source) process(source, key);
  };

  const pickFile = (files?: FileList | null) => {
    const file = Array.from(files ?? []).find((item) =>
      item.type.startsWith("image/"),
    );
    if (file && !busy) start(file);
  };

  // 整页都能接住拖进来的图，不必对准中间那块区域
  const dragging = useImageDrop((file) => start(file), !busy);
  // 处理中按 Esc 直接停
  useHotkey("Escape", () => abort.current?.abort(), busy);

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      if (busy) return;
      const file = Array.from(event.clipboardData?.files ?? []).find((item) =>
        item.type.startsWith("image/"),
      );
      if (file) {
        event.preventDefault();
        start(file);
      }
    };
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, modelKey, source]);

  const download = () => {
    if (result) createDownload("az-im-matting.png", result.blob);
  };

  const copyResult = async () => {
    if (!result) return;
    setToast((await copyImageToClipboard(result.blob)) ? copy.copied : copy.copyFailed);
  };

  const backgroundClass =
    background === "checker"
      ? style.checkerboard
      : background === "white"
        ? style.bgWhite
        : style.bgBlack;

  return (
    <div className={style.page} id="top">
      <SiteHeader active="matting" />

      <main>
        <section className={style.hero}>
          <div className={style.decor} aria-hidden="true"><i /><i /><i /><span /></div>
          <div className={style.heroCopy}>
            <span className={style.eyebrow}><Sparkles size={16} />{copy.eyebrow}</span>
            <h1>{copy.title}</h1>
            <p>{copy.summary}</p>
          </div>

          <div className={style.toolbar}>
            <span className={style.toolbarLabel}>{copy.modelLabel}</span>
            <div className={style.modelPicker} role="radiogroup" aria-label={copy.modelLabel}>
              {MATTING_MODELS.map((model) => (
                <button
                  key={model.key}
                  type="button"
                  role="radio"
                  aria-checked={modelKey === model.key}
                  className={modelKey === model.key ? style.modelActive : ""}
                  disabled={busy}
                  onClick={() => changeModel(model.key)}
                >
                  <b>{modelKey === model.key && <Check size={13} />}{model.label}</b>
                  <small>{model.desc}{cachedMap[model.key] ? ` · ${copy.cached}` : ""}</small>
                </button>
              ))}
            </div>
            <span className={style.backendBadge} title={gpu ? "检测到 WebGPU，用显卡推理" : "此浏览器没有 WebGPU，用 CPU 推理"}>
              {gpu ? <Zap size={13} /> : <Cpu size={13} />}
              {gpu ? copy.gpu : copy.cpu}
            </span>
          </div>

          <div className={`${style.workspace} ${dragging ? style.dropTarget : ""}`}>
            {dragging && (
              <div className={style.dropOverlay}>
                <span>松手就替换成这张图</span>
              </div>
            )}
            {status.kind === "idle" && (
              <button
                type="button"
                className={`${style.dropzone} ${dragging ? style.dragOver : ""}`}
                onClick={() => fileInput.current?.click()}
              >
                <span className={style.dropIcon}><ImagePlus size={34} /></span>
                <strong>{copy.dropTitle}</strong>
                <p>{copy.dropHint}</p>
              </button>
            )}

            {/* 停止之后：图还在，直接重来 */}
            {status.kind === "ready" && source && (
              <div className={style.result}>
                <div className={style.singlePane}>
                  <figure>
                    <img src={source.url} alt="原图" />
                    <figcaption>
                      原图 · {source.width} × {source.height} · {formatSize(source.blob.size)}
                    </figcaption>
                  </figure>
                </div>
                {status.notice && <p className={style.notice}>{status.notice}</p>}
                <div className={style.resultActions}>
                  <button type="button" className="button" onClick={reset}><RotateCcw size={16} />{copy.again}</button>
                  <button type="button" className="button buttonPrimary" onClick={() => process(source, modelKey)}>
                    <Sparkles size={16} />{copy.start}
                  </button>
                </div>
              </div>
            )}

            {busy && (
              <div className={style.progress}>
                {source && <img className={style.progressPreview} src={source.url} alt="" />}
                <div className={style.progressInfo}>
                  {status.kind === "model" ? (
                    <>
                      <span>
                        {status.total ? copy.modelLoading : copy.modelCached}
                        {status.total ? ` ${status.percent}%` : ""}
                      </span>
                      <div className={style.progressBar}><i style={{ width: `${status.percent}%` }} /></div>
                      {status.total > 0 && (
                        <small>{formatSize(status.loaded)} / {formatSize(status.total)}</small>
                      )}
                    </>
                  ) : (
                    <>
                      <span>{copy.running}</span>
                      <div className={`${style.progressBar} ${style.indeterminate}`}><i /></div>
                      <small>{copy.runningHint}</small>
                    </>
                  )}
                  <button type="button" className="button" onClick={() => abort.current?.abort()}>
                    <StopCircle size={16} />{copy.stop}
                  </button>
                </div>
              </div>
            )}

            {status.kind === "done" && source && result && (
              <div className={style.result}>
                <div className={`${style.singlePane} ${showSource ? "" : backgroundClass}`}>
                  <figure>
                    <img
                      src={showSource ? source.url : result.url}
                      alt={showSource ? "原图" : "抠图结果"}
                      width={showSource ? source.width : result.width}
                      height={showSource ? source.height : result.height}
                    />
                    <figcaption>
                      {showSource
                        ? `原图 · ${source.width} × ${source.height} · ${formatSize(source.blob.size)}`
                        : `结果 · ${result.width} × ${result.height} · ${formatSize(result.blob.size)} · ${copy.elapsed(status.seconds)}`}
                    </figcaption>
                  </figure>
                </div>

                {!showSource && (
                  <div className={style.bgPicker}>
                    <span>{copy.bgLabel}</span>
                    {BACKGROUNDS.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        className={background === item.key ? style.bgActive : ""}
                        onClick={() => setBackground(item.key)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}

                <div className={style.resultActions}>
                  <button type="button" className="button" onClick={() => setShowSource((value) => !value)}>
                    <SquareSplitHorizontal size={16} />{showSource ? copy.compareOff : copy.compare}
                  </button>
                  <button type="button" className="button" onClick={() => process(source, modelKey)}>
                    <RefreshCw size={16} />{copy.rerun}
                  </button>
                  <button type="button" className="button" onClick={reset}><RotateCcw size={16} />{copy.again}</button>
                  {canCopyImage() && (
                    <button type="button" className="button" onClick={copyResult}>
                      <Copy size={16} />{copy.copy}
                    </button>
                  )}
                  <button type="button" className="button buttonPrimary" onClick={download}>
                    <Download size={16} />{copy.download}
                  </button>
                </div>
              </div>
            )}

            {status.kind === "error" && (
              <div className={style.errorBox}>
                <p>{status.message}</p>
                <div className={style.resultActions}>
                  <button type="button" className="button" onClick={reset}><RotateCcw size={16} />{copy.again}</button>
                  {source && (
                    <button type="button" className="button buttonPrimary" onClick={() => process(source, modelKey)}>
                      <RefreshCw size={16} />{copy.retry}
                    </button>
                  )}
                </div>
              </div>
            )}

            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              hidden
              onChange={(event) => { pickFile(event.target.files); event.target.value = ""; }}
            />
          </div>

          {toast && <div className={style.toast} role="status">{toast}</div>}
        </section>
      </main>

      <SiteFooter />
    </div>
  );
});

export default Matting;
