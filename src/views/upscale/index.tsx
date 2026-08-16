import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { Check, Cpu, Download, ImagePlus, RotateCcw, Sparkles, Zap } from "lucide-react";
import style from "./index.module.scss";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { MAX_UPSCALE_EDGE, UPSCALE_MODEL_URL, upscaleImage } from "@/engines/upscale";
import { isModelCached, webGpuAvailable } from "@/engines/ai";
import { createDownload } from "@/functions";

const copy = {
  eyebrow: "AI · 本地模型 · 图片不出浏览器",
  title: "在线图片放大",
  summary: "AI 超分辨率，细节重建。模型在你的浏览器里跑，图片照旧不上传。",
  dropTitle: "选取图片到这里，支持拖拽和粘贴",
  dropHint: `首次使用需下载模型（约 5MB），图片长边不超过 ${MAX_UPSCALE_EDGE}px`,
  scaleLabel: "放大倍数",
  cached: "已下载",
  modelLoading: "正在下载模型",
  running: "放大中",
  runningHint: "分块推理，CPU 模式下大图会比较慢……",
  download: "下载 PNG",
  again: "换一张",
  failed: "处理失败了，刷新页面再试一次",
  tooLarge: `图片长边超过 ${MAX_UPSCALE_EDGE}px，先去「图片压缩」缩小一下再来放大`,
  gpu: "WebGPU 加速",
  cpu: "CPU 模式",
};

type Status =
  | { kind: "idle" }
  | { kind: "model"; percent: number }
  | { kind: "run"; percent: number }
  | { kind: "done" }
  | { kind: "error"; message: string };

const Upscale = observer(() => {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [scale, setScale] = useState<2 | 4>(2);
  const [cached, setCached] = useState(false);
  const [gpu, setGpu] = useState(false);
  const [srcBlob, setSrcBlob] = useState<Blob | null>(null);
  const [srcUrl, setSrcUrl] = useState<string | null>(null);
  const [srcDims, setSrcDims] = useState<string>("");
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultDims, setResultDims] = useState<string>("");
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const busy = status.kind === "model" || status.kind === "run";

  useEffect(() => {
    setGpu(webGpuAvailable());
    isModelCached(UPSCALE_MODEL_URL).then(setCached);
  }, []);

  const reset = () => {
    if (srcUrl) URL.revokeObjectURL(srcUrl);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setSrcBlob(null);
    setSrcUrl(null);
    setSrcDims("");
    setResultUrl(null);
    setResultBlob(null);
    setResultDims("");
    setStatus({ kind: "idle" });
  };

  const process = async (file: Blob, factor: 2 | 4) => {
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setResultUrl(null);
    setResultBlob(null);
    setStatus({ kind: "model", percent: 0 });
    try {
      const bitmap = await createImageBitmap(file);
      setSrcDims(`${bitmap.width} × ${bitmap.height}`);
      setResultDims(`${bitmap.width * factor} × ${bitmap.height * factor}`);
      bitmap.close();
      const output = await upscaleImage(file, factor, (progress) => {
        if (progress.stage === "model") {
          setStatus({ kind: "model", percent: progress.percent });
        } else {
          setStatus({ kind: "run", percent: progress.percent ?? 0 });
        }
      });
      setResultBlob(output);
      setResultUrl(URL.createObjectURL(output));
      setStatus({ kind: "done" });
      isModelCached(UPSCALE_MODEL_URL).then(setCached);
    } catch (error) {
      const message = error instanceof Error && error.message === "TOO_LARGE"
        ? copy.tooLarge
        : copy.failed;
      console.error("[Az-im] upscale failed:", error);
      setStatus({ kind: "error", message });
    }
  };

  const start = (file: Blob) => {
    if (srcUrl) URL.revokeObjectURL(srcUrl);
    setSrcBlob(file);
    setSrcUrl(URL.createObjectURL(file));
    process(file, scale);
  };

  const changeScale = (factor: 2 | 4) => {
    if (busy || factor === scale) return;
    setScale(factor);
    if (srcBlob) process(srcBlob, factor);
  };

  const pickFile = (files?: FileList | null) => {
    const file = Array.from(files ?? []).find((item) =>
      item.type.startsWith("image/"),
    );
    if (file && !busy) start(file);
  };

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
  }, [busy, srcUrl, resultUrl, scale]);

  const download = () => {
    if (resultBlob) createDownload(`az-im-upscale-${scale}x.png`, resultBlob);
  };

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

          <div className={style.workspace}>
            {status.kind === "idle" && (
              <button
                type="button"
                className={`${style.dropzone} ${dragOver ? style.dragOver : ""}`}
                onClick={() => fileInput.current?.click()}
                onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(event) => { event.preventDefault(); setDragOver(false); pickFile(event.dataTransfer.files); }}
              >
                <span className={style.dropIcon}><ImagePlus size={34} /></span>
                <strong>{copy.dropTitle}</strong>
                <p>{copy.dropHint}</p>
              </button>
            )}

            {busy && (
              <div className={style.progress}>
                {srcUrl && <img className={style.progressPreview} src={srcUrl} alt="" />}
                <div className={style.progressInfo}>
                  {status.kind === "model" ? (
                    <>
                      <span>{copy.modelLoading} {status.percent}%</span>
                      <div className={style.progressBar}><i style={{ width: `${status.percent}%` }} /></div>
                    </>
                  ) : (
                    <>
                      <span>{copy.running} {status.kind === "run" ? `${status.percent}%` : ""}</span>
                      <div className={style.progressBar}><i style={{ width: `${status.kind === "run" ? status.percent : 0}%` }} /></div>
                      <small>{copy.runningHint}</small>
                    </>
                  )}
                </div>
              </div>
            )}

            {status.kind === "done" && srcUrl && resultUrl && (
              <div className={style.result}>
                <div className={style.resultPanes}>
                  <figure><img src={srcUrl} alt="原图" /><figcaption>原图 · {srcDims}</figcaption></figure>
                  <figure><img src={resultUrl} alt="放大结果" /><figcaption>结果 · {resultDims}</figcaption></figure>
                </div>
                <div className={style.resultActions}>
                  <button type="button" className="button" onClick={reset}><RotateCcw size={16} />{copy.again}</button>
                  <button type="button" className="button buttonPrimary" onClick={download}><Download size={16} />{copy.download}</button>
                </div>
              </div>
            )}

            {status.kind === "error" && (
              <div className={style.errorBox}>
                <p>{status.message}</p>
                <button type="button" className="button" onClick={reset}><RotateCcw size={16} />{copy.again}</button>
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
        </section>
      </main>

      <SiteFooter />
    </div>
  );
});

export default Upscale;
