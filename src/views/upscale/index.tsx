import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import {
  Check,
  Copy,
  Cpu,
  Download,
  ImagePlus,
  Minimize2,
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
import { upscaleImage } from "@/engines/aiClient";
import {
  AI_CANCELLED,
  MAX_UPSCALE_EDGE,
  UPSCALE_MODEL_URL,
  isModelCached,
  webGpuAvailable,
} from "@/engines/ai-shared";
import { useHotkey, useImageDrop } from "@/hooks";
import {
  canCopyImage,
  copyImageToClipboard,
  createDownload,
  formatSize,
  shrinkImage,
} from "@/functions";

const copy = {
  eyebrow: "AI · 本地模型 · 图片不出浏览器",
  title: "在线图片放大",
  summary: "AI 超分辨率，细节重建。模型在你的浏览器里跑，图片照旧不上传。",
  dropTitle: "选取图片到这里，支持拖拽和粘贴",
  dropHint: `首次使用需下载模型（约 5MB），图片长边不超过 ${MAX_UPSCALE_EDGE}px`,
  scaleLabel: "放大倍数",
  cached: "已下载",
  modelLoading: "正在下载模型",
  modelCached: "正在准备模型",
  running: "放大中",
  runningHint: "分块推理，CPU 模式下大图会比较慢，中途可以随时停止",
  remaining: (seconds: number) => `预计还需 ${seconds} 秒`,
  stop: "停止",
  stopping: "正在停止……",
  download: "下载 PNG",
  copy: "复制到剪贴板",
  copied: "已复制",
  copyFailed: "复制失败，换个浏览器或直接下载吧",
  rerun: "重新放大",
  again: "换一张",
  compare: "对比原图",
  compareOff: "看结果",
  retry: "重试",
  cancelled: "已停止。原图还在，可以直接重来。",
  start: "开始放大",
  failed: "处理失败了，换张图或重试一次",
  modelFailed: "模型下载失败，检查下网络再重试",
  tooLarge: `图片长边超过 ${MAX_UPSCALE_EDGE}px，可以先缩小再放大`,
  shrinkAndRetry: `缩小到 ${MAX_UPSCALE_EDGE}px 再放大`,
  gpu: "WebGPU 加速",
  cpu: "CPU 模式",
  elapsed: (seconds: number) => `耗时 ${seconds} 秒`,
};

type Status =
  | { kind: "idle" }
  /** 选了图但没在跑：刚停止、或刚失败后保留现场 */
  | { kind: "ready"; notice?: string }
  | { kind: "model"; percent: number; loaded: number; total: number }
  | { kind: "run"; percent: number; startedAt: number }
  | { kind: "done"; seconds: number }
  | { kind: "error"; message: string; canShrink: boolean };

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

const Upscale = observer(() => {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [scale, setScale] = useState<2 | 4>(2);
  const [cached, setCached] = useState(false);
  const [gpu, setGpu] = useState(false);
  const [source, setSource] = useState<Picture | null>(null);
  const [result, setResult] = useState<Picture | null>(null);
  const [showSource, setShowSource] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const busy = status.kind === "model" || status.kind === "run";

  useEffect(() => {
    setGpu(webGpuAvailable());
    isModelCached(UPSCALE_MODEL_URL).then(setCached);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // 离开页面时把还在跑的推理停掉，别让 worker 空转
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

  const process = async (picture: Picture, factor: 2 | 4) => {
    clearResult();
    const controller = new AbortController();
    abort.current = controller;
    setStatus({ kind: "model", percent: 0, loaded: 0, total: 0 });

    const startedAt = performance.now();
    try {
      const output = await upscaleImage(
        picture.blob,
        factor,
        (progress) => {
          if (progress.stage === "model") {
            setStatus({
              kind: "model",
              percent: progress.percent,
              loaded: progress.loaded,
              total: progress.total,
            });
          } else {
            setStatus((previous) => ({
              kind: "run",
              percent: progress.percent ?? 0,
              startedAt: previous.kind === "run" ? previous.startedAt : performance.now(),
            }));
          }
        },
        controller.signal,
      );
      setResult(await describe(output));
      setStatus({
        kind: "done",
        seconds: Math.max(1, Math.round((performance.now() - startedAt) / 1000)),
      });
      isModelCached(UPSCALE_MODEL_URL).then(setCached);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === AI_CANCELLED) {
        setStatus({ kind: "ready", notice: copy.cancelled });
        return;
      }
      console.error("[Az-im] upscale failed:", error);
      if (message === "TOO_LARGE") {
        setStatus({ kind: "error", message: copy.tooLarge, canShrink: true });
      } else if (message.includes("fetch model")) {
        setStatus({ kind: "error", message: copy.modelFailed, canShrink: false });
      } else {
        setStatus({ kind: "error", message: copy.failed, canShrink: false });
      }
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
    process(picture, scale);
  };

  const changeScale = (factor: 2 | 4) => {
    if (busy || factor === scale) return;
    setScale(factor);
    if (source) process(source, factor);
  };

  /** 超限时给条出路：等比缩到上限再放大，而不是让用户自己去压缩页绕一圈 */
  const shrinkAndRetry = async () => {
    if (!source) return;
    const smaller = await shrinkImage(source.blob, MAX_UPSCALE_EDGE);
    const picture = await describe(smaller);
    URL.revokeObjectURL(source.url);
    setSource(picture);
    process(picture, scale);
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
  }, [busy, scale, source]);

  const download = () => {
    if (result) createDownload(`az-im-upscale-${scale}x.png`, result.blob);
  };

  const copyResult = async () => {
    if (!result) return;
    setToast((await copyImageToClipboard(result.blob)) ? copy.copied : copy.copyFailed);
  };

  const remainingSeconds = () => {
    if (status.kind !== "run" || status.percent < 5) return null;
    const elapsed = performance.now() - status.startedAt;
    return Math.max(1, Math.round((elapsed / status.percent) * (100 - status.percent) / 1000));
  };

  const dropzone = (
    <button
      type="button"
      className={`${style.dropzone} ${dragging ? style.dragOver : ""}`}
      onClick={() => fileInput.current?.click()}
    >
      <span className={style.dropIcon}><ImagePlus size={34} /></span>
      <strong>{copy.dropTitle}</strong>
      <p>{copy.dropHint}</p>
    </button>
  );

  const remaining = remainingSeconds();

  return (
    <div className={style.page} id="top">
      <SiteHeader active="upscale" />

      <main>
        <section className={style.hero}>
          <div className={style.decor} aria-hidden="true"><i /><i /><i /><span /></div>
          <div className={style.heroCopy}>
            <span className={style.eyebrow}><Sparkles size={16} />{copy.eyebrow}</span>
            <h1>{copy.title}</h1>
            <p>{copy.summary}</p>
          </div>

          <div className={style.toolbar}>
            <span className={style.toolbarLabel}>{copy.scaleLabel}</span>
            <div className={style.modelPicker} role="radiogroup" aria-label={copy.scaleLabel}>
              {([2, 4] as const).map((factor) => (
                <button
                  key={factor}
                  type="button"
                  role="radio"
                  aria-checked={scale === factor}
                  className={scale === factor ? style.modelActive : ""}
                  disabled={busy}
                  onClick={() => changeScale(factor)}
                >
                  <b>{scale === factor && <Check size={13} />}{factor}x</b>
                  <small>{factor === 2 ? "宽高翻倍，速度快" : "宽高四倍，细节最多"}</small>
                </button>
              ))}
            </div>
            <span className={style.backendBadge} title={gpu ? "检测到 WebGPU，用显卡推理" : "此浏览器没有 WebGPU，用 CPU 推理"}>
              {gpu ? <Zap size={13} /> : <Cpu size={13} />}
              {gpu ? copy.gpu : copy.cpu}
              {cached ? ` · ${copy.cached}` : ""}
            </span>
          </div>

          <div className={`${style.workspace} ${dragging ? style.dropTarget : ""}`}>
            {dragging && (
              <div className={style.dropOverlay}>
                <span>松手就替换成这张图</span>
              </div>
            )}
            {status.kind === "idle" && dropzone}

            {/* 停止或失败后：图还在，直接重来，不用重新选文件 */}
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
                  <button type="button" className="button buttonPrimary" onClick={() => process(source, scale)}>
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
                      <span>{copy.running} {status.percent}%</span>
                      <div className={style.progressBar}><i style={{ width: `${status.percent}%` }} /></div>
                      <small>{remaining ? copy.remaining(remaining) : copy.runningHint}</small>
                    </>
                  )}
                  <button
                    type="button"
                    className="button"
                    onClick={() => abort.current?.abort()}
                  >
                    <StopCircle size={16} />{copy.stop}
                  </button>
                </div>
              </div>
            )}

            {status.kind === "done" && source && result && (
              <div className={style.result}>
                {showSource ? (
                  <div className={style.singlePane}>
                    <figure>
                      <img src={source.url} alt="原图" width={source.width} height={source.height} />
                      <figcaption>
                        原图 · {source.width} × {source.height} · {formatSize(source.blob.size)}
                      </figcaption>
                    </figure>
                  </div>
                ) : (
                  <div className={style.singlePane}>
                    <figure>
                      <img src={result.url} alt="放大结果" width={result.width} height={result.height} />
                      <figcaption>
                        结果 · {result.width} × {result.height} · {formatSize(result.blob.size)} · {copy.elapsed(status.seconds)}
                      </figcaption>
                    </figure>
                  </div>
                )}
                <div className={style.resultActions}>
                  <button type="button" className="button" onClick={() => setShowSource((value) => !value)}>
                    <SquareSplitHorizontal size={16} />{showSource ? copy.compareOff : copy.compare}
                  </button>
                  <button type="button" className="button" onClick={() => process(source, scale)}>
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
                  {status.canShrink && source && (
                    <button type="button" className="button buttonPrimary" onClick={shrinkAndRetry}>
                      <Minimize2 size={16} />{copy.shrinkAndRetry}
                    </button>
                  )}
                  {!status.canShrink && source && (
                    <button type="button" className="button buttonPrimary" onClick={() => process(source, scale)}>
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

export default Upscale;
