import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { Check, Cpu, Download, ImagePlus, RotateCcw, Sparkles, Zap } from "lucide-react";
import style from "./index.module.scss";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { MATTING_MODELS, removeBackground, type MattingModelKey } from "@/engines/matting";
import { isModelCached, webGpuAvailable } from "@/engines/ai";
import { createDownload } from "@/functions";

const copy = {
  eyebrow: "AI · 本地模型 · 图片不出浏览器",
  title: "在线背景移除",
  summary: "一键抠图。模型在你的浏览器里跑，图片照旧不上传。",
  dropTitle: "选取图片到这里，支持拖拽和粘贴",
  dropHint: "首次使用需下载所选模型，之后走浏览器缓存",
  modelLabel: "模型",
  cached: "已下载",
  modelLoading: "正在下载模型",
  running: "抠图中，低配设备可能要几秒……",
  download: "下载 PNG",
  again: "换一张",
  failed: "处理失败了，刷新页面再试一次",
  gpu: "WebGPU 加速",
  cpu: "CPU 模式",
};

type Status =
  | { kind: "idle" }
  | { kind: "model"; percent: number }
  | { kind: "run" }
  | { kind: "done" }
  | { kind: "error" };

const Matting = observer(() => {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [modelKey, setModelKey] = useState<MattingModelKey>("u2netp");
  const [cachedMap, setCachedMap] = useState<Record<string, boolean>>({});
  const [gpu, setGpu] = useState(false);
  const [srcBlob, setSrcBlob] = useState<Blob | null>(null);
  const [srcUrl, setSrcUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
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

  const reset = () => {
    if (srcUrl) URL.revokeObjectURL(srcUrl);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setSrcBlob(null);
    setSrcUrl(null);
    setResultUrl(null);
    setResultBlob(null);
    setStatus({ kind: "idle" });
  };

  const process = async (file: Blob, key: MattingModelKey) => {
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setResultUrl(null);
    setResultBlob(null);
    setStatus({ kind: "model", percent: 0 });
    try {
      const output = await removeBackground(file, key, (progress) => {
        if (progress.stage === "model") {
          setStatus({ kind: "model", percent: progress.percent });
        } else {
          setStatus({ kind: "run" });
        }
      });
      setResultBlob(output);
      setResultUrl(URL.createObjectURL(output));
      setStatus({ kind: "done" });
      refreshCached();
    } catch (error) {
      console.error("[Az-im] matting failed:", error);
      setStatus({ kind: "error" });
    }
  };

  const start = (file: Blob) => {
    if (srcUrl) URL.revokeObjectURL(srcUrl);
    setSrcBlob(file);
    setSrcUrl(URL.createObjectURL(file));
    process(file, modelKey);
  };

  const changeModel = (key: MattingModelKey) => {
    if (busy || key === modelKey) return;
    setModelKey(key);
    // 已经有图了就直接用新模型重跑
    if (srcBlob) process(srcBlob, key);
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
  }, [busy, srcUrl, resultUrl, modelKey]);

  const download = () => {
    if (resultBlob) createDownload("az-im-matting.png", resultBlob);
  };

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
                      <span>{copy.running}</span>
                      <div className={`${style.progressBar} ${style.indeterminate}`}><i /></div>
                    </>
                  )}
                </div>
              </div>
            )}

            {status.kind === "done" && srcUrl && resultUrl && (
              <div className={style.result}>
                <div className={style.resultPanes}>
                  <figure><img src={srcUrl} alt="原图" /><figcaption>原图</figcaption></figure>
                  <figure className={style.checkerboard}><img src={resultUrl} alt="抠图结果" /><figcaption>结果</figcaption></figure>
                </div>
                <div className={style.resultActions}>
                  <button type="button" className="button" onClick={reset}><RotateCcw size={16} />{copy.again}</button>
                  <button type="button" className="button buttonPrimary" onClick={download}><Download size={16} />{copy.download}</button>
                </div>
              </div>
            )}

            {status.kind === "error" && (
              <div className={style.errorBox}>
                <p>{copy.failed}</p>
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

export default Matting;
